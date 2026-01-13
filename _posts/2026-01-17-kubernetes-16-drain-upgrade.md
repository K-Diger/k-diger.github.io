---
title: "Part 16: Node Drain과 Cluster Upgrade - 유지보수"
date: 2026-01-17
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, Maintenance, Backup, Upgrade]
layout: post
toc: true
math: true
mermaid: true
---

# Part 16: 클러스터 유지보수

## OS Upgrades와 Node Maintenance

### Node Drain

**개념:**

Node Drain은 노드에서 모든 Pod를 안전하게 제거하고 새로운 Pod의 스케줄링을 방지한다. OS 업그레이드, 하드웨어 유지보수 등을 수행하기 전에 필수적이다.

**동작 과정:**

1. 노드를 Unschedulable로 표시 (Cordon)
2. 노드의 모든 Pod를 삭제
3. Deployment/ReplicaSet의 Pod는 다른 노드에 재생성
4. 유지보수 완료 후 Uncordon으로 복귀

**기본 사용:**

```bash
# 노드 Drain
kubectl drain node01

# 일반적으로 사용하는 플래그들
kubectl drain node01 --ignore-daemonsets --delete-emptydir-data

# Pod 삭제 대기 시간 설정
kubectl drain node01 --ignore-daemonsets --timeout=60s

# 강제 삭제 (주의!)
kubectl drain node01 --ignore-daemonsets --force
```

**주요 플래그 설명:**

- `--ignore-daemonsets`: DaemonSet Pod는 제외 (모든 노드에 실행되어야 하므로)
- `--delete-emptydir-data`: emptyDir 볼륨을 사용하는 Pod도 삭제 (데이터 손실 가능)
- `--force`: ReplicationController 등이 없는 Pod도 강제 삭제
- `--grace-period=<seconds>`: Pod 종료 대기 시간 (기본 30초)
- `--timeout=<duration>`: Drain 전체 작업 타임아웃

**실패 케이스와 해결:**

```bash
# 에러: cannot delete Pods with local storage
kubectl drain node01 --delete-emptydir-data

# 에러: cannot delete DaemonSet-managed Pods
kubectl drain node01 --ignore-daemonsets

# 에러: cannot delete Pods not managed by ReplicationController, ReplicaSet, Job, DaemonSet or StatefulSet
kubectl drain node01 --force
```

**유지보수 후 복구:**

```bash
# 노드를 다시 Schedulable로 설정
kubectl uncordon node01

# 상태 확인
kubectl get nodes
# NAME     STATUS   ROLES           AGE   VERSION
# node01   Ready    <none>          10d   v1.28.0
```

### Node Cordon

**개념:**

Cordon은 노드를 Unschedulable로 표시만 하고 기존 Pod는 유지한다. 일시적으로 새로운 Pod 배치를 막을 때 유용한다.

**사용 시나리오:**

- 노드에 문제가 있지만 즉시 제거하기 어려운 경우
- 점진적인 노드 교체
- 노드 리소스 조사

```bash
# Cordon
kubectl cordon node01

# 상태 확인
kubectl get nodes
# NAME     STATUS                     ROLES    AGE   VERSION
# node01   Ready,SchedulingDisabled   <none>   10d   v1.28.0

# 기존 Pod는 계속 실행
kubectl get pods -o wide
# NAME                    READY   STATUS    NODE
# nginx-75c4b8d8c-abc12   1/1     Running   node01  # 여전히 실행 중

# Uncordon
kubectl uncordon node01
```

### PodDisruptionBudget (PDB)

**개념:**

PDB는 동시에 종료될 수 있는 Pod의 최대/최소 개수를 제한하여 애플리케이션의 가용성을 보장한다.

**예제:**

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: zk-pdb
spec:
  minAvailable: 2  # 최소 2개는 항상 실행되어야 함
  selector:
    matchLabels:
      app: zookeeper
```

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web-pdb
spec:
  maxUnavailable: 1  # 동시에 최대 1개만 종료 가능
  selector:
    matchLabels:
      app: web
```

**PDB와 Drain:**

```bash
# PDB가 있는 노드를 Drain하면
kubectl drain node01 --ignore-daemonsets

# PDB를 위반하면 Drain이 대기
# error when evicting pods/... (will retry after 5s): Cannot evict pod as it would violate the pod's disruption budget.
```

**PDB 확인:**

```bash
# PDB 목록
kubectl get pdb

# PDB 상세 정보
kubectl describe pdb web-pdb
# Min available:           2
# Current number available: 3
# Allowed disruptions:      1
```

### Node Maintenance 실습 과제

1. `node01`을 Drain하고 Uncordon하기
2. PodDisruptionBudget를 생성하고 Drain 테스트
3. 강제 Drain이 필요한 상황 시뮬레이션

---

## Cluster Upgrade

### 업그레이드 전략

**업그레이드 순서:**

1. Control Plane 컴포넌트 (한 번에 하나씩)
   - etcd
   - kube-apiserver
   - kube-controller-manager
   - kube-scheduler
2. Worker Node 컴포넌트
   - kubelet
   - kube-proxy

**버전 skew 정책:**

- kube-apiserver: N
- kube-controller-manager, kube-scheduler: N-1
- kubelet, kube-proxy: N-2
- kubectl: N+1, N, N-1

예: kube-apiserver가 1.28이면
- controller-manager/scheduler: 1.27 또는 1.28
- kubelet/kube-proxy: 1.26, 1.27, 1.28

### kubeadm을 이용한 업그레이드

**1단계: 업그레이드 계획 확인**

```bash
# kubeadm 자체를 먼저 업그레이드
apt update
apt-cache madison kubeadm  # 사용 가능한 버전 확인
apt-get install -y kubeadm=1.28.0-00

# 업그레이드 계획 확인
kubeadm upgrade plan

# 출력 예:
# [upgrade/config] Making sure the configuration is correct:
# [upgrade/config] Reading configuration from the cluster...
# [upgrade] Running cluster health checks
# [upgrade] Fetching available versions to upgrade to
# ...
# Components that must be upgraded manually after you have upgraded the control plane with 'kubeadm upgrade apply':
# COMPONENT   CURRENT       TARGET
# kubelet     4 x v1.27.0   v1.28.0
#
# Upgrade to the latest stable version:
#
# COMPONENT                 CURRENT   TARGET
# kube-apiserver            v1.27.0   v1.28.0
# kube-controller-manager   v1.27.0   v1.28.0
# kube-scheduler            v1.27.0   v1.28.0
# kube-proxy                v1.27.0   v1.28.0
# CoreDNS                   v1.10.1   v1.10.1
# etcd                      3.5.7-0   3.5.9-0
```

**2단계: Control Plane 업그레이드 (First Master Node)**

```bash
# Control Plane 업그레이드
kubeadm upgrade apply v1.28.0

# 출력 확인:
# [upgrade/successful] SUCCESS! Your cluster was upgraded to "v1.28.0". Enjoy!

# kubelet과 kubectl 업그레이드
apt-get install -y kubelet=1.28.0-00 kubectl=1.28.0-00

# kubelet 재시작
systemctl daemon-reload
systemctl restart kubelet

# 상태 확인
kubectl get nodes
# NAME           STATUS   ROLES           AGE   VERSION
# controlplane   Ready    control-plane   20d   v1.28.0  # 업그레이드됨
# node01         Ready    <none>          20d   v1.27.0  # 아직 이전 버전
```

**3단계: 추가 Control Plane 노드 업그레이드 (HA 클러스터)**

```bash
# 추가 마스터 노드에서
kubeadm upgrade node

apt-get install -y kubelet=1.28.0-00 kubectl=1.28.0-00
systemctl daemon-reload
systemctl restart kubelet
```

**4단계: Worker Node 업그레이드**

```bash
# Control Plane에서 노드 Drain
kubectl drain node01 --ignore-daemonsets --delete-emptydir-data

# node01 노드에서 kubeadm 업그레이드
apt-get update
apt-get install -y kubeadm=1.28.0-00

# 노드 업그레이드
kubeadm upgrade node

# kubelet과 kubectl 업그레이드
apt-get install -y kubelet=1.28.0-00 kubectl=1.28.0-00
systemctl daemon-reload
systemctl restart kubelet

# Control Plane에서 Uncordon
kubectl uncordon node01

# 확인
kubectl get nodes
# NAME           STATUS   ROLES           AGE   VERSION
# controlplane   Ready    control-plane   20d   v1.28.0
# node01         Ready    <none>          20d   v1.28.0  # 업그레이드 완료
```

**업그레이드 검증:**

```bash
# 모든 컴포넌트 버전 확인
kubectl get nodes -o wide

# Control Plane 컴포넌트 버전
kubectl get pods -n kube-system -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[0].image}{"\n"}{end}'

# API 버전 확인
kubectl version

# 클러스터 상태 확인
kubectl get componentstatuses  # deprecated in 1.19+
kubectl get --raw='/readyz?verbose'
```

### 업그레이드 시 주의사항

1. **백업 필수**: etcd를 먼저 백업
2. **한 번에 한 Minor 버전씩**: 1.26 → 1.27 → 1.28 (1.26 → 1.28 불가)
3. **Control Plane 먼저**: Worker Node보다 항상 먼저
4. **테스트 환경에서 먼저 수행**
5. **PDB 확인**: Drain 시 애플리케이션 가용성 확인

### Cluster Upgrade 실습 과제

1. 테스트 클러스터를 1.27에서 1.28로 업그레이드
2. 업그레이드 중 애플리케이션 다운타임 최소화 전략 수립
3. 업그레이드 롤백 시나리오 연습

---

## Backup and Restore

### etcd Backup

**etcd의 중요성:**

etcd는 Kubernetes 클러스터의 모든 상태 정보를 저장하는 핵심 데이터베이스입니다:
- 모든 리소스 정의 (Pods, Services, ConfigMaps, Secrets 등)
- 클러스터 설정
- 네트워크 정책
- RBAC 설정

**백업 방법:**

```bash
# etcd 스냅샷 생성
ETCDCTL_API=3 etcdctl snapshot save /tmp/etcd-backup.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# 스냅샷 검증
ETCDCTL_API=3 etcdctl snapshot status /tmp/etcd-backup.db \
  --write-out=table

# 출력:
# +----------+----------+------------+------------+
# |   HASH   | REVISION | TOTAL KEYS | TOTAL SIZE |
# +----------+----------+------------+------------+
# | 12ab34cd |    12345 |       1234 |     2.3 MB |
# +----------+----------+------------+------------+
```

**인증서 경로 찾기:**

```bash
# etcd Pod의 인증서 경로 확인
kubectl describe pod -n kube-system etcd-controlplane | grep -A 5 "Command:"

# 또는 etcd manifest 확인
cat /etc/kubernetes/manifests/etcd.yaml | grep file

# 일반적인 경로:
# --cacert=/etc/kubernetes/pki/etcd/ca.crt
# --cert=/etc/kubernetes/pki/etcd/server.crt
# --key=/etc/kubernetes/pki/etcd/server.key
```

**자동화된 백업 스크립트:**

```bash
#!/bin/bash
# etcd-backup.sh

BACKUP_DIR="/var/backups/etcd"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/etcd-backup-${TIMESTAMP}.db"

mkdir -p ${BACKUP_DIR}

ETCDCTL_API=3 etcdctl snapshot save ${BACKUP_FILE} \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# 검증
ETCDCTL_API=3 etcdctl snapshot status ${BACKUP_FILE} --write-out=table

# 7일 이상 된 백업 삭제
find ${BACKUP_DIR} -name "etcd-backup-*.db" -mtime +7 -delete

echo "Backup completed: ${BACKUP_FILE}"
```

**크론잡으로 정기 백업:**

```bash
# 매일 새벽 2시에 백업
0 2 * * * /usr/local/bin/etcd-backup.sh >> /var/log/etcd-backup.log 2>&1
```

### etcd Restore

**복원 시나리오:**

- 클러스터 설정 손상
- 잘못된 리소스 삭제
- 재해 복구

**복원 단계:**

**1단계: 기존 etcd 정지**

```bash
# kube-apiserver 정지 (etcd 접근 차단)
mv /etc/kubernetes/manifests/kube-apiserver.yaml /tmp/

# etcd 정지
mv /etc/kubernetes/manifests/etcd.yaml /tmp/

# 기존 etcd 데이터 백업 (혹시 모르니)
mv /var/lib/etcd /var/lib/etcd.old
```

**2단계: 스냅샷에서 복원**

```bash
# 새로운 데이터 디렉토리로 복원
ETCDCTL_API=3 etcdctl snapshot restore /tmp/etcd-backup.db \
  --data-dir=/var/lib/etcd-restore \
  --initial-cluster=master=https://127.0.0.1:2380 \
  --initial-advertise-peer-urls=https://127.0.0.1:2380

# 권한 설정
chown -R etcd:etcd /var/lib/etcd-restore
```

**3단계: etcd 설정 변경**

```bash
# etcd.yaml에서 데이터 디렉토리 변경
vim /tmp/etcd.yaml

# 변경:
# --data-dir=/var/lib/etcd
# →
# --data-dir=/var/lib/etcd-restore
```

**4단계: 서비스 재시작**

```bash
# etcd 재시작
mv /tmp/etcd.yaml /etc/kubernetes/manifests/

# etcd가 시작될 때까지 대기
sleep 20

# kube-apiserver 재시작
mv /tmp/kube-apiserver.yaml /etc/kubernetes/manifests/

# 클러스터 상태 확인
kubectl get pods -A
```

**복원 검증:**

```bash
# 리소스 확인
kubectl get all -A

# etcd 멤버 확인
ETCDCTL_API=3 etcdctl member list \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# 로그 확인
journalctl -u kubelet -f
```

### 클러스터 HA 환경의 etcd

**etcd 클러스터 백업:**

```bash
# HA 환경에서는 모든 etcd 멤버에서 백업 가능
# 하지만 하나의 멤버에서만 백업해도 충분

# etcd 멤버 확인
ETCDCTL_API=3 etcdctl member list \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# 출력:
# 1a2b3c4d5e6f7890, started, master-1, https://192.168.1.11:2380, https://192.168.1.11:2379, false
# 9f8e7d6c5b4a3210, started, master-2, https://192.168.1.12:2380, https://192.168.1.12:2379, false
# 1122334455667788, started, master-3, https://192.168.1.13:2380, https://192.168.1.13:2379, false
```

**etcd 클러스터 복원:**

```bash
# 모든 etcd 멤버에서 복원 수행
# 각 노드에서:

ETCDCTL_API=3 etcdctl snapshot restore /tmp/etcd-backup.db \
  --data-dir=/var/lib/etcd-restore \
  --name=master-1 \  # 각 노드마다 다름
  --initial-cluster=master-1=https://192.168.1.11:2380,master-2=https://192.168.1.12:2380,master-3=https://192.168.1.13:2380 \
  --initial-advertise-peer-urls=https://192.168.1.11:2380  # 각 노드마다 다름
```

### 리소스 레벨 백업

**선언적 방식으로 백업:**

```bash
# 모든 네임스페이스의 리소스 백업
kubectl get all --all-namespaces -o yaml > cluster-backup.yaml

# 특정 리소스 타입만 백업
kubectl get deployments,services,configmaps,secrets --all-namespaces -o yaml > resources-backup.yaml

# RBAC 설정 백업
kubectl get roles,rolebindings,clusterroles,clusterrolebindings --all-namespaces -o yaml > rbac-backup.yaml
```

**Velero를 이용한 백업 (프로덕션 권장):**

```bash
# Velero 설치
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.8.0 \
  --bucket velero-backups \
  --backup-location-config region=us-east-1 \
  --snapshot-location-config region=us-east-1 \
  --secret-file ./credentials-velero

# 전체 클러스터 백업
velero backup create full-backup

# 특정 네임스페이스만 백업
velero backup create app-backup --include-namespaces=production

# 백업 확인
velero backup describe full-backup

# 복원
velero restore create --from-backup full-backup
```

### Certificate 관리

**인증서 확인:**

```bash
# 인증서 만료일 확인
kubeadm certs check-expiration

# 출력:
# CERTIFICATE                EXPIRES                  RESIDUAL TIME   CERTIFICATE AUTHORITY   EXTERNALLY MANAGED
# admin.conf                 Dec 13, 2024 12:00 UTC   364d            ca                      no
# apiserver                  Dec 13, 2024 12:00 UTC   364d            ca                      no
# apiserver-etcd-client      Dec 13, 2024 12:00 UTC   364d            etcd-ca                 no
# apiserver-kubelet-client   Dec 13, 2024 12:00 UTC   364d            ca                      no
# controller-manager.conf    Dec 13, 2024 12:00 UTC   364d            ca                      no
# etcd-healthcheck-client    Dec 13, 2024 12:00 UTC   364d            etcd-ca                 no
# etcd-peer                  Dec 13, 2024 12:00 UTC   364d            etcd-ca                 no
# etcd-server                Dec 13, 2024 12:00 UTC   364d            etcd-ca                 no
# front-proxy-client         Dec 13, 2024 12:00 UTC   364d            front-proxy-ca          no
# scheduler.conf             Dec 13, 2024 12:00 UTC   364d            ca                      no
```

**인증서 갱신:**

```bash
# 모든 인증서 갱신
kubeadm certs renew all

# 특정 인증서만 갱신
kubeadm certs renew apiserver
kubeadm certs renew apiserver-kubelet-client

# Control Plane 재시작
systemctl restart kubelet

# 확인
kubeadm certs check-expiration
```

**자동 갱신 설정:**

```bash
# 크론잡으로 자동 갱신 (만료 30일 전)
0 0 1 * * kubeadm certs renew all && systemctl restart kubelet
```

### Backup and Restore 실습 과제

1. etcd 스냅샷 백업 및 복원 수행
2. 네임스페이스 하나를 삭제하고 etcd 복원으로 복구
3. 인증서 만료일 확인 및 갱신
4. 백업 자동화 스크립트 작성

---

**이전**: [Part 15: Prometheus와 Grafana](https://k-diger.github.io/posts//posts/kubernetes-15-prometheus-grafana) ←
**다음**: [Part 17: Troubleshooting](https://k-diger.github.io/posts//posts/kubernetes-17-troubleshooting) →
