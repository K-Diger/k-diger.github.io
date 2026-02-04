---
layout: post
title: "Part 20/26: 클러스터 업그레이드와 백업"
date: 2026-01-10
categories: [Kubernetes]
tags: [kubernetes, maintenance, upgrade, backup, etcd, drain, cka]
---

Kubernetes 클러스터 운영에서 노드 유지보수, 클러스터 업그레이드, etcd 백업/복원은 필수적인 작업이다. 이 장에서는 클러스터를 안정적으로 유지하기 위한 핵심 운영 작업들을 다룬다.

## 노드 유지보수

### 노드 상태 확인

```bash
# 노드 목록 및 상태
kubectl get nodes
kubectl get nodes -o wide

# 노드 상세 정보
kubectl describe node <node-name>

# 노드 조건 확인
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.conditions[-1].type}{"\t"}{.status.conditions[-1].status}{"\n"}{end}'
```

**노드 Conditions**:

| Condition | 정상 상태 | 설명 |
|-----------|----------|------|
| Ready | True | 노드가 정상 |
| MemoryPressure | False | 메모리 충분 |
| DiskPressure | False | 디스크 충분 |
| PIDPressure | False | PID 충분 |
| NetworkUnavailable | False | 네트워크 정상 |

### cordon과 uncordon

**cordon**: 노드를 스케줄 불가 상태로 설정. 기존 Pod는 유지.

```bash
# 노드를 스케줄 불가로 설정
kubectl cordon <node-name>

# 확인
kubectl get nodes
# NAME         STATUS                     ROLES    AGE   VERSION
# node1        Ready,SchedulingDisabled   <none>   10d   v1.28.0

# 스케줄 가능으로 복원
kubectl uncordon <node-name>
```

### drain

> **원문 ([kubernetes.io - Safely Drain a Node](https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/)):**
> You can use kubectl drain to safely evict all of your pods from a node before you perform maintenance on the node. Safe evictions allow the pod's containers to gracefully terminate.

**번역:** kubectl drain을 사용하여 노드에 유지보수를 수행하기 전에 모든 Pod를 안전하게 축출할 수 있다. 안전한 축출은 Pod의 컨테이너가 정상적으로 종료되도록 한다.

**drain**: 노드의 모든 Pod를 안전하게 축출하고 스케줄 불가로 설정.

```bash
# 기본 drain
kubectl drain <node-name>

# DaemonSet Pod 무시 (필수)
kubectl drain <node-name> --ignore-daemonsets

# 로컬 데이터(emptyDir) 있는 Pod도 삭제
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# Replica가 없는 Pod도 강제 삭제
kubectl drain <node-name> --ignore-daemonsets --force

# 일반적인 유지보수용 명령
kubectl drain <node-name> \
  --ignore-daemonsets \
  --delete-emptydir-data \
  --grace-period=60 \
  --timeout=300s
```

**drain 과정**:
1. 노드를 cordon (SchedulingDisabled)
2. 노드의 Pod들을 eviction API로 축출
3. Pod들이 다른 노드에서 재생성됨

**주의사항**:
- DaemonSet Pod는 --ignore-daemonsets 없이 drain 불가
- PodDisruptionBudget이 있으면 조건 충족해야 축출 가능
- 로컬 스토리지(emptyDir) 데이터는 손실됨

### 노드 제거

```bash
# 1. drain으로 워크로드 이동
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# 2. 노드 삭제
kubectl delete node <node-name>

# 3. 실제 노드에서 kubeadm reset (노드에서 실행)
sudo kubeadm reset
```

## PodDisruptionBudget (PDB)

자발적 중단(voluntary disruption) 시 **최소 가용 Pod 수**를 보장한다.

### PDB 생성

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web-pdb
spec:
  # 옵션 1: 최소 가용 수
  minAvailable: 2
  # 또는
  # maxUnavailable: 1  # 최대 불가용 수

  selector:
    matchLabels:
      app: web
```

**minAvailable vs maxUnavailable**:
- `minAvailable: 2`: 항상 최소 2개 Pod 유지
- `maxUnavailable: 1`: 동시에 1개만 중단 가능
- 둘 중 하나만 지정 가능

### PDB 확인

```bash
kubectl get pdb
kubectl describe pdb web-pdb

# 출력 예시:
# Name:           web-pdb
# Min available:  2
# Allowed disruptions: 1  # 현재 추가로 중단 가능한 수
```

### drain과 PDB

PDB가 있으면 drain 시 조건을 만족할 때까지 대기한다.

```bash
# PDB 조건 불충족 시
kubectl drain node1 --ignore-daemonsets
# error when evicting pods/"web-xyz": Cannot evict pod as it would violate the pod's disruption budget.

# 타임아웃 설정
kubectl drain node1 --ignore-daemonsets --timeout=300s
```

## 클러스터 업그레이드

### 업그레이드 순서

```
1. Control Plane 업그레이드 (한 번에 하나씩)
   - kubeadm 업그레이드
   - Control Plane 컴포넌트 업그레이드
   - kubelet, kubectl 업그레이드

2. Worker 노드 업그레이드 (하나씩)
   - drain
   - kubeadm upgrade node
   - kubelet, kubectl 업그레이드
   - uncordon
```

**버전 규칙**:
- 한 번에 한 마이너 버전만 업그레이드 (1.27 → 1.28 → 1.29)
- kubelet은 API Server보다 2 마이너 버전까지 낮을 수 있음

### Control Plane 업그레이드 (kubeadm)

```bash
# 1. 현재 버전 확인
kubectl version
kubeadm version

# 2. 업그레이드 가능 버전 확인
sudo apt update
sudo apt-cache madison kubeadm

# 3. kubeadm 업그레이드
sudo apt-mark unhold kubeadm
sudo apt-get install -y kubeadm=1.29.0-1.1
sudo apt-mark hold kubeadm

# 4. 업그레이드 계획 확인
sudo kubeadm upgrade plan

# 5. 업그레이드 적용 (첫 번째 Control Plane 노드)
sudo kubeadm upgrade apply v1.29.0

# 다른 Control Plane 노드는:
# sudo kubeadm upgrade node

# 6. kubelet, kubectl 업그레이드
sudo apt-mark unhold kubelet kubectl
sudo apt-get install -y kubelet=1.29.0-1.1 kubectl=1.29.0-1.1
sudo apt-mark hold kubelet kubectl

# 7. kubelet 재시작
sudo systemctl daemon-reload
sudo systemctl restart kubelet
```

### Worker 노드 업그레이드

```bash
# Control Plane에서:
# 1. 노드 drain
kubectl drain <worker-node> --ignore-daemonsets --delete-emptydir-data

# Worker 노드에서:
# 2. kubeadm 업그레이드
sudo apt-mark unhold kubeadm
sudo apt-get install -y kubeadm=1.29.0-1.1
sudo apt-mark hold kubeadm

# 3. 노드 설정 업그레이드
sudo kubeadm upgrade node

# 4. kubelet 업그레이드
sudo apt-mark unhold kubelet kubectl
sudo apt-get install -y kubelet=1.29.0-1.1 kubectl=1.29.0-1.1
sudo apt-mark hold kubelet kubectl

# 5. kubelet 재시작
sudo systemctl daemon-reload
sudo systemctl restart kubelet

# Control Plane에서:
# 6. 노드 uncordon
kubectl uncordon <worker-node>
```

## etcd 백업과 복원

### etcd 개요

> **원문 ([etcd.io](https://etcd.io/docs/)):**
> etcd is a strongly consistent, distributed key-value store that provides a reliable way to store data that needs to be accessed by a distributed system or cluster of machines.

**번역:** etcd는 분산 시스템이나 머신 클러스터에서 접근해야 하는 데이터를 저장하는 신뢰할 수 있는 방법을 제공하는 강력히 일관된 분산 키-값 저장소이다.

etcd는 클러스터의 모든 상태 데이터를 저장하는 핵심 저장소이다.

```bash
# etcd Pod 확인
kubectl get pods -n kube-system | grep etcd

# etcd 엔드포인트 확인
kubectl describe pod etcd-master -n kube-system | grep -E "listen-client-urls|endpoints"
```

### etcdctl 설정

```bash
# etcdctl 설치 확인
etcdctl version

# 환경 변수 설정
export ETCDCTL_API=3
export ETCDCTL_CACERT=/etc/kubernetes/pki/etcd/ca.crt
export ETCDCTL_CERT=/etc/kubernetes/pki/etcd/server.crt
export ETCDCTL_KEY=/etc/kubernetes/pki/etcd/server.key
export ETCDCTL_ENDPOINTS=https://127.0.0.1:2379
```

### etcd 백업

```bash
# 스냅샷 생성
ETCDCTL_API=3 etcdctl snapshot save /backup/etcd-snapshot.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# 스냅샷 상태 확인
ETCDCTL_API=3 etcdctl snapshot status /backup/etcd-snapshot.db --write-out=table
```

**백업해야 할 것들**:
1. etcd 스냅샷
2. `/etc/kubernetes/pki/` (인증서)
3. `/etc/kubernetes/manifests/` (Static Pod 매니페스트)
4. kubeadm 설정 파일

### etcd 복원

```bash
# 1. API Server 중지 (Static Pod 매니페스트 이동)
sudo mv /etc/kubernetes/manifests/kube-apiserver.yaml /tmp/

# 2. 기존 etcd 데이터 백업
sudo mv /var/lib/etcd /var/lib/etcd.bak

# 3. 스냅샷에서 복원
ETCDCTL_API=3 etcdctl snapshot restore /backup/etcd-snapshot.db \
  --data-dir=/var/lib/etcd \
  --initial-cluster=master=https://192.168.1.10:2380 \
  --initial-cluster-token=etcd-cluster-1 \
  --initial-advertise-peer-urls=https://192.168.1.10:2380

# 4. 권한 설정
sudo chown -R etcd:etcd /var/lib/etcd

# 5. API Server 복원
sudo mv /tmp/kube-apiserver.yaml /etc/kubernetes/manifests/

# 6. 확인
kubectl get nodes
kubectl get pods -A
```

### 자동 백업 스크립트

```bash
#!/bin/bash
# /usr/local/bin/etcd-backup.sh

BACKUP_DIR="/backup/etcd"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/etcd-snapshot-${DATE}.db"

# 백업 디렉토리 생성
mkdir -p ${BACKUP_DIR}

# 스냅샷 생성
ETCDCTL_API=3 etcdctl snapshot save ${BACKUP_FILE} \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# 7일 이상 된 백업 삭제
find ${BACKUP_DIR} -name "etcd-snapshot-*.db" -mtime +7 -delete

# 백업 검증
ETCDCTL_API=3 etcdctl snapshot status ${BACKUP_FILE}
```

```bash
# cron 설정 (매일 2시)
echo "0 2 * * * root /usr/local/bin/etcd-backup.sh" >> /etc/crontab
```

## 인증서 관리

### 인증서 확인

```bash
# kubeadm으로 인증서 만료일 확인
sudo kubeadm certs check-expiration

# openssl로 확인
openssl x509 -in /etc/kubernetes/pki/apiserver.crt -noout -enddate
```

### 인증서 갱신

```bash
# 모든 인증서 갱신
sudo kubeadm certs renew all

# 개별 인증서 갱신
sudo kubeadm certs renew apiserver
sudo kubeadm certs renew apiserver-kubelet-client

# Control Plane 컴포넌트 재시작 (새 인증서 로드)
sudo systemctl restart kubelet

# Static Pod들은 자동으로 재시작됨 (매니페스트 변경 감지)
```

## 트러블슈팅

### 노드 NotReady 문제

```bash
# 노드 상태 확인
kubectl describe node <node-name>

# kubelet 상태 확인 (노드에서)
sudo systemctl status kubelet
sudo journalctl -u kubelet -f

# 일반적인 원인:
# - kubelet 중지
# - 컨테이너 런타임 문제
# - 네트워크 연결 문제
# - 인증서 만료
```

### etcd 클러스터 문제

```bash
# etcd 멤버 상태 확인
ETCDCTL_API=3 etcdctl member list \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# etcd 클러스터 상태
ETCDCTL_API=3 etcdctl endpoint health \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
```

### 업그레이드 실패 복구

```bash
# 업그레이드 롤백 (같은 버전으로 다시 upgrade apply)
sudo kubeadm upgrade apply v1.28.0 --force

# 또는 etcd 복원으로 이전 상태로 복구
```

## 기술 면접 대비

### 자주 묻는 질문

**Q: cordon과 drain의 차이는?**

A: cordon은 노드를 스케줄 불가(SchedulingDisabled) 상태로만 만들고, 기존 Pod는 그대로 유지된다. drain은 cordon을 수행한 후 노드의 모든 Pod를 안전하게 축출하여 다른 노드로 이동시킨다. 유지보수 시에는 drain을 사용하여 워크로드 영향을 최소화한다.

**Q: PodDisruptionBudget의 역할은?**

A: 자발적 중단(drain, 업그레이드, 스케일 다운 등) 시 최소 가용 Pod 수를 보장한다. minAvailable 또는 maxUnavailable을 설정하여 서비스 가용성을 유지하면서 유지보수를 진행할 수 있다. PDB 조건을 충족하지 못하면 Pod eviction이 거부된다.

**Q: 클러스터 업그레이드 시 버전 제한은?**

A: 한 번에 한 마이너 버전만 업그레이드할 수 있다. 예를 들어 1.27에서 1.29로 직접 업그레이드는 불가하고, 1.27 → 1.28 → 1.29 순서로 진행해야 한다. kubelet은 API Server보다 최대 2 마이너 버전 낮을 수 있어 업그레이드 중 호환성이 유지된다.

**Q: etcd 백업이 중요한 이유는?**

A: etcd는 클러스터의 모든 상태(리소스 정의, Secret, ConfigMap 등)를 저장한다. etcd가 손상되면 전체 클러스터를 복구할 수 없다. 정기적인 스냅샷 백업과 인증서 백업을 통해 재해 복구가 가능하다. 스냅샷 복원으로 특정 시점의 클러스터 상태를 복구할 수 있다.

**Q: kubeadm upgrade plan과 upgrade apply의 차이는?**

A: upgrade plan은 현재 클러스터 상태를 분석하고 업그레이드 가능한 버전과 변경 사항을 보여주는 드라이런이다. 실제 변경은 없다. upgrade apply는 실제로 Control Plane 컴포넌트를 지정된 버전으로 업그레이드한다. 항상 plan으로 먼저 확인 후 apply를 실행하는 것이 안전하다.

---

## 참고 자료

### 공식 문서

- [Cluster Management - Safely Drain a Node](https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/)
- [Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)
- [Operating etcd clusters for Kubernetes](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/)
- [Backing up an etcd cluster](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/#backing-up-an-etcd-cluster)
- [Specifying a Disruption Budget for your Application](https://kubernetes.io/docs/tasks/run-application/configure-pdb/)

## CKA 시험 대비 필수 명령어

```bash
# 노드 유지보수
kubectl cordon <node>
kubectl uncordon <node>
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data

# PDB 관리
kubectl get pdb
kubectl describe pdb <name>

# 클러스터 업그레이드
kubeadm upgrade plan
sudo kubeadm upgrade apply v1.29.0
sudo kubeadm upgrade node

# etcd 백업/복원
ETCDCTL_API=3 etcdctl snapshot save /backup/snapshot.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

ETCDCTL_API=3 etcdctl snapshot restore /backup/snapshot.db \
  --data-dir=/var/lib/etcd-restored

# 인증서 확인
sudo kubeadm certs check-expiration
```

### CKA 빈출 시나리오

```bash
# 시나리오 1: 노드 유지보수
kubectl drain node01 --ignore-daemonsets --delete-emptydir-data
# 유지보수 작업 수행
kubectl uncordon node01

# 시나리오 2: etcd 백업
ETCDCTL_API=3 etcdctl snapshot save /opt/backup/etcd-backup.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# 시나리오 3: etcd 복원
# 1. API Server 중지
sudo mv /etc/kubernetes/manifests/kube-apiserver.yaml /tmp/
# 2. 복원
ETCDCTL_API=3 etcdctl snapshot restore /opt/backup/etcd-backup.db \
  --data-dir=/var/lib/etcd
# 3. API Server 복원
sudo mv /tmp/kube-apiserver.yaml /etc/kubernetes/manifests/

# 시나리오 4: 클러스터 업그레이드 (Control Plane)
sudo apt-mark unhold kubeadm
sudo apt-get install -y kubeadm=1.29.0-1.1
sudo apt-mark hold kubeadm
sudo kubeadm upgrade apply v1.29.0
sudo apt-mark unhold kubelet kubectl
sudo apt-get install -y kubelet=1.29.0-1.1 kubectl=1.29.0-1.1
sudo apt-mark hold kubelet kubectl
sudo systemctl daemon-reload
sudo systemctl restart kubelet
```

## 다음 단계

- [Kubernetes - 모니터링과 로깅](/kubernetes/kubernetes-21-monitoring)
- [Kubernetes - 트러블슈팅](/kubernetes/kubernetes-22-troubleshooting)
