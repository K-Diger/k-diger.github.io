---
title: "CKA Lightning Lab"
date: 2026-01-11
categories: [Kubernetes, CKA]
tags: [kubernetes, cka, kubeadm, upgrade, etcd, troubleshooting, deployment, persistent-volume, secrets]
description: "CKA 시험 대비 Lightning Lab 실전 문제 7개 - 클러스터 업그레이드, 트러블슈팅, ETCD 백업, PV/PVC, Secret 관리"
toc: true
---

## 개요

CKA(Certified Kubernetes Administrator) 시험에서 자주 출제되는 필수 Kubernetes 관리 작업들을 다룹니다. 클러스터 업그레이드, 트러블슈팅, 배포, 시크릿, ETCD 백업 등의 실전 문제와 해결방법을 포함합니다.

---

## 문제 1: Kubernetes 클러스터 업그레이드

### 문제

Upgrade the current version of kubernetes from `1.33.0` to `1.34.0` exactly using the `kubeadm` utility. Make sure that the upgrade is carried out one node at a time starting with the controlplane node. To minimize downtime, the deployment `gold-nginx` should be rescheduled on an alternate node before upgrading each node.

Upgrade `controlplane` node first and drain node `node01` before upgrading it. Pods for `gold-nginx` should run on the `controlplane` node subsequently.

**공식 문서:**
- [kubeadm 클러스터 업그레이드](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)

---

### 풀이

#### 1단계: Control Plane 노드 업그레이드

```bash
# Kubernetes 저장소를 v1.34로 변경
sudo vi /etc/apt/sources.list.d/kubernetes.list
# 다음으로 수정: deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.34/deb/ /

# 패키지 목록 업데이트 및 kubeadm 버전 확인
sudo apt update
apt-cache madison kubeadm   # 1.34.0-1.1 확인

# kubeadm 업그레이드
sudo apt-mark unhold kubeadm
sudo apt install -y kubeadm=1.34.0-1.1
sudo apt-mark hold kubeadm

# 업그레이드 계획 확인
sudo kubeadm upgrade plan v1.34.0

# 업그레이드 적용
sudo kubeadm upgrade apply v1.34.0

# controlplane 노드 drain
kubectl drain controlplane --ignore-daemonsets

# kubelet 및 kubectl 업그레이드
sudo apt-mark unhold kubelet kubectl
sudo apt install -y kubelet=1.34.0-1.1 kubectl=1.34.0-1.1
sudo apt-mark hold kubelet kubectl

# kubelet 재시작
sudo systemctl daemon-reload
sudo systemctl restart kubelet

# controlplane 노드 다시 스케줄 가능 상태로 변경
kubectl uncordon controlplane

# 워커 노드 업그레이드 전 drain
kubectl drain node01 --ignore-daemonsets
```

#### 2단계: Worker 노드 (node01) 업그레이드

```bash
# node01로 SSH 접속
ssh node01

# Kubernetes 저장소를 v1.34로 변경
sudo vi /etc/apt/sources.list.d/kubernetes.list
# 다음으로 수정: deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.34/deb/ /

# 패키지 목록 업데이트 및 kubeadm 버전 확인
sudo apt update
apt-cache madison kubeadm   # 1.34.0-1.1 확인

# kubeadm 업그레이드
sudo apt-mark unhold kubeadm
sudo apt install -y kubeadm=1.34.0-1.1
sudo apt-mark hold kubeadm

# 노드 업그레이드
sudo kubeadm upgrade node

# kubelet 및 kubectl 업그레이드
sudo apt-mark unhold kubelet kubectl
sudo apt install -y kubelet=1.34.0-1.1 kubectl=1.34.0-1.1
sudo apt-mark hold kubelet kubectl

# kubelet 재시작
sudo systemctl daemon-reload
sudo systemctl restart kubelet

# node01에서 나가기
exit

# controlplane에서 node01을 다시 스케줄 가능 상태로 변경
kubectl uncordon node01
```

#### 검증

```bash
kubectl get nodes
# 두 노드 모두 v1.34.0으로 표시되어야 함

kubectl get pods -o wide
# gold-nginx 파드가 controlplane에서 실행되어야 함
```

---

## 문제 2: 디플로이먼트 정보 출력

### 문제

Print the names of all deployments in the `admin2406` namespace in the following format:

```
DEPLOYMENT   CONTAINER_IMAGE   READY_REPLICAS   NAMESPACE
<deployment name>   <container image used>   <ready replica count>   <Namespace>
```

The data should be sorted by the increasing order of the deployment name.

**Example:**
```
DEPLOYMENT   CONTAINER_IMAGE   READY_REPLICAS   NAMESPACE
deploy0   nginx:alpine   1   admin2406
```

Write the result to the file `/opt/admin2406_data`.

**공식 문서:**
- [kubectl Custom Columns](https://kubernetes.io/docs/reference/kubectl/quick-reference/#custom-columns)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)

---

### 풀이

```bash
kubectl -n admin2406 get deployments \
  --sort-by=.metadata.name \
  -o custom-columns='DEPLOYMENT:.metadata.name,CONTAINER_IMAGE:.spec.template.spec.containers[0].image,READY_REPLICAS:.status.readyReplicas,NAMESPACE:.metadata.namespace' \
  > /opt/admin2406_data
```

#### 검증

```bash
cat /opt/admin2406_data
```

---

## 문제 3: Kubeconfig 트러블슈팅

### 문제

A kubeconfig file called `admin.kubeconfig` has been created in `/root/CKA`. There is something wrong with the configuration. Troubleshoot and fix it.

**공식 문서:**
- [kubeconfig 파일을 사용한 클러스터 접근 구성](https://kubernetes.io/docs/concepts/configuration/organize-cluster-access-kubeconfig/)
- [여러 클러스터 접근 구성](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)

---

### 풀이

```bash
# 현재 kubeconfig 확인
cat /root/CKA/admin.kubeconfig

# kubeconfig 테스트
kubectl --kubeconfig=/root/CKA/admin.kubeconfig get nodes

# 확인해야 할 일반적인 문제:
# 1. API 서버 주소/포트 오류
# 2. 잘못된 인증서 경로
# 3. 잘못된 컨텍스트/클러스터/사용자 이름
# 4. 인증서 데이터 형식 문제

# 잘못된 포트 수정 예시 (6443이 표준):
vi /root/CKA/admin.kubeconfig
# server: https://controlplane:4380 을 https://controlplane:6443 으로 변경

# 또는 필요시 인증서 경로 수정:
# certificate-authority-data 또는 certificate-authority가 유효한 인증서를 가리키는지 확인

# 수정 사항 검증
kubectl --kubeconfig=/root/CKA/admin.kubeconfig get nodes
```

#### 일반적인 문제와 해결방법

| 문제 | 해결방법 |
|------|----------|
| **잘못된 API 서버 포트** | `6443`(기본값)으로 변경 |
| **잘못된 인증 기관** | CA 인증서 경로 또는 데이터 확인 |
| **컨텍스트의 잘못된 클러스터 이름** | 컨텍스트가 기존 클러스터를 참조하는지 확인 |
| **누락되거나 유효하지 않은 클라이언트 인증서** | 클라이언트 인증서 및 키 확인 |

---

## 문제 4: 어노테이션을 사용한 디플로이먼트 생성 및 업데이트

### 문제

Create a deployment, update its image, and record the change using annotations.

**Requirements:**
1. Create a deployment named `nginx-deploy` with `nginx:1.16` image
2. Update the deployment to use `nginx:1.17` image
3. Annotate the deployment to record the change

**공식 문서:**
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [디플로이먼트 업데이트](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#updating-a-deployment)
- [롤아웃 히스토리 확인](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#checking-rollout-history-of-a-deployment)

---

### 풀이

#### 1단계: 디플로이먼트 생성

```bash
kubectl create deployment nginx-deploy --image=nginx:1.16
```

#### 2단계: 디플로이먼트 이미지 업데이트

```bash
kubectl set image deployment/nginx-deploy nginx=nginx:1.17
```

#### 3단계: 변경사항 기록을 위한 어노테이션 추가

```bash
kubectl annotate deployment nginx-deploy \
  kubernetes.io/change-cause="Updated nginx image to 1.17"
```

> **참고:** 이 어노테이션은 더 이상 사용되지 않는(deprecated) `--record` 플래그의 기능을 대체하며, 명확한 변경 이력을 제공합니다.

#### 검증

```bash
# 디플로이먼트 상태 확인
kubectl get deployment nginx-deploy

# 롤아웃 히스토리 확인
kubectl rollout history deployment/nginx-deploy

# 어노테이션 확인
kubectl describe deployment nginx-deploy
```

---

## 문제 5: Persistent Volume을 사용하는 MySQL 디플로이먼트 트러블슈팅

### 문제

A new deployment called `alpha-mysql` has been deployed in the `alpha` namespace. However, the pods are not running. Troubleshoot and fix the issue.

**Requirements:**
- The deployment should use the persistent volume `alpha-pv` mounted at `/var/lib/mysql`
- Should use the environment variable `MYSQL_ALLOW_EMPTY_PASSWORD=1` for an empty root password
- **Important:** Do not alter the persistent volume

**공식 문서:**
- [Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
- [파드에서 PersistentVolume 사용 구성](https://kubernetes.io/docs/tasks/configure-pod-container/configure-persistent-volume-storage/)

---

### 풀이

```bash
# 디플로이먼트 상태 확인
kubectl -n alpha get deployment alpha-mysql
kubectl -n alpha get pods

# 파드 상세 정보로 에러 확인
kubectl -n alpha describe pod <pod-name>

# PVC 및 PV 상태 확인
kubectl -n alpha get pvc
kubectl get pv alpha-pv

# 일반적인 문제:
# 1. PVC가 생성되지 않았거나 바인딩되지 않음
# 2. 잘못된 스토리지 클래스
# 3. 액세스 모드 불일치
# 4. 잘못된 볼륨 마운트 경로

# 디플로이먼트 설정 확인
kubectl -n alpha get deployment alpha-mysql -o yaml > /tmp/alpha-mysql.yaml

# 디플로이먼트 수정
kubectl -n alpha edit deployment alpha-mysql
```

#### 일반적인 해결방법: PVC 생성 또는 수정

```yaml
# PVC가 없는 경우 생성
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mysql-alpha-pvc
  namespace: alpha
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
  volumeName: alpha-pv
  storageClassName: ""  # 사전 프로비저닝된 PV의 경우 빈 문자열 사용
```

```bash
kubectl apply -f pvc.yaml
```

#### 디플로이먼트 볼륨 구성 수정

```bash
kubectl -n alpha edit deployment alpha-mysql
```

다음과 같이 디플로이먼트가 구성되어 있는지 확인:

```yaml
spec:
  template:
    spec:
      containers:
      - name: mysql
        image: mysql:5.6
        env:
        - name: MYSQL_ALLOW_EMPTY_PASSWORD
          value: "1"
        volumeMounts:
        - name: mysql-data
          mountPath: /var/lib/mysql
      volumes:
      - name: mysql-data
        persistentVolumeClaim:
          claimName: mysql-alpha-pvc
```

#### 검증

```bash
kubectl -n alpha get pods
kubectl -n alpha get pvc
kubectl get pv alpha-pv
```

---

## 문제 6: ETCD 백업

### 문제

Take the backup of ETCD at the location `/opt/etcd-backup.db` on the controlplane node.

**공식 문서:**
- [etcd 클러스터 백업](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/#backing-up-an-etcd-cluster)
- [etcd 재해 복구](https://etcd.io/docs/v3.5/op-guide/recovery/)

---

### 풀이

```bash
# ETCD 인증서 위치 찾기 (일반적으로 static pod manifest에서)
cat /etc/kubernetes/manifests/etcd.yaml | grep -E 'cert|key|ca'

# ETCD 스냅샷 생성
ETCDCTL_API=3 etcdctl snapshot save /opt/etcd-backup.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# 백업 검증
ETCDCTL_API=3 etcdctl snapshot status /opt/etcd-backup.db --write-out=table
```

#### 대체 방법 (인증서가 다른 위치에 있는 경우)

```bash
# etcd 파드에서 정확한 인증서 경로 확인
kubectl -n kube-system describe pod etcd-controlplane

# 해당 경로를 사용하여 백업 명령 실행
ETCDCTL_API=3 etcdctl snapshot save /opt/etcd-backup.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=<ca-cert-path> \
  --cert=<server-cert-path> \
  --key=<server-key-path>
```

#### 검증

```bash
ls -lh /opt/etcd-backup.db

ETCDCTL_API=3 etcdctl snapshot status /opt/etcd-backup.db --write-out=table
```

---

## 문제 7: Secret Volume이 있는 파드 생성

### 문제

Create a pod called `secret-1401` in the `admin1401` namespace using the `busybox` image.

**Requirements:**
- Container name: `secret-admin`
- Container should sleep for 4800 seconds
- Mount a read-only secret volume called `secret-volume` at `/etc/secret-volume`
- Use the existing secret `dotfile-secret`

**공식 문서:**
- [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- [Secret을 사용한 안전한 자격증명 배포](https://kubernetes.io/docs/tasks/inject-data-application/distribute-credentials-secure/)
- [파드에서 Secret을 파일로 사용](https://kubernetes.io/docs/concepts/configuration/secret/#using-secrets-as-files-from-a-pod)

---

### 풀이

#### 방법 1: kubectl run과 YAML 사용

```bash
# YAML 템플릿 생성
kubectl run secret-1401 -n admin1401 --image=busybox --dry-run=client -o yaml > secret-pod.yaml
```

`secret-pod.yaml` 파일 수정:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secret-1401
  namespace: admin1401
spec:
  containers:
  - name: secret-admin
    image: busybox
    command: ["sleep", "4800"]
    volumeMounts:
    - name: secret-volume
      mountPath: /etc/secret-volume
      readOnly: true
  volumes:
  - name: secret-volume
    secret:
      secretName: dotfile-secret
```

```bash
kubectl apply -f secret-pod.yaml
```

#### 방법 2: 직접 YAML 생성

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: secret-1401
  namespace: admin1401
spec:
  containers:
  - name: secret-admin
    image: busybox
    command: ["sleep", "4800"]
    volumeMounts:
    - name: secret-volume
      mountPath: /etc/secret-volume
      readOnly: true
  volumes:
  - name: secret-volume
    secret:
      secretName: dotfile-secret
EOF
```

#### 검증

```bash
# 파드 상태 확인
kubectl -n admin1401 get pod secret-1401

# 볼륨 마운트 확인
kubectl -n admin1401 describe pod secret-1401

# 파드에 접속하여 마운트된 시크릿 확인
kubectl -n admin1401 exec secret-1401 -- ls -la /etc/secret-volume
```

---

## 요약

이 Lightning Lab 연습 문제들은 CKA 시험의 핵심 주제를 다룹니다:

| 번호 | 주제 | 핵심 내용 |
|------|------|-----------|
| 1 | **클러스터 업그레이드** | kubeadm을 사용한 안전한 롤링 업그레이드 |
| 2 | **데이터 포맷팅** | kubectl 커스텀 컬럼 출력 |
| 3 | **트러블슈팅** | Kubeconfig 검증 및 복구 |
| 4 | **디플로이먼트 관리** | 어노테이션을 사용한 디플로이먼트 생성 및 업데이트 |
| 5 | **스토리지** | PersistentVolume 및 PersistentVolumeClaim 트러블슈팅 |
| 6 | **ETCD 운영** | 클러스터 백업 절차 |
| 7 | **보안** | 파드에서 Secret 사용 |

> **팁**: 시험 환경에서 근육 기억(muscle memory)을 구축하기 위해 이러한 시나리오를 반복적으로 연습하세요.
