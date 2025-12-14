---

title: Fundamental5, Container Orchestration
date: 2025-12-14
categories: [Container]
tags: [Container]
layout: post
toc: true
math: true
mermaid: true

---

## 목차

### Part 5: Kubernetes
1. [Kubernetes 개요](#1-kubernetes-개요)
2. [Kubernetes 아키텍처](#2-kubernetes-아키텍처)
3. [Kubernetes 핵심 오브젝트](#3-kubernetes-핵심-오브젝트)
4. [Workload 리소스](#4-workload-리소스)
5. [Service와 네트워킹](#5-service와-네트워킹)
6. [스토리지](#6-스토리지)
7. [ConfigMap과 Secret](#7-configmap과-secret)
8. [스케줄링](#8-스케줄링)
9. [보안](#9-보안)
10. [모니터링과 로깅](#10-모니터링과-로깅)

---

## 1. Kubernetes 개요

### 1.1 Kubernetes란?

**Kubernetes의 정의**

Kubernetes(K8s)는 **컨테이너화된 애플리케이션의 배포, 스케일링, 관리를 자동화하는 오픈소스 플랫폼**이다.

**왜 Kubernetes인가?**

**컨테이너만으로는 부족한 점**

- 수백, 수천 개의 컨테이너를 수동으로 관리하기 어려움
- 컨테이너 장애 시 자동 복구 필요
- 부하에 따른 자동 스케일링
- 무중단 배포 (Rolling Update)
- 서비스 디스커버리 및 로드 밸런싱
- 스토리지 오케스트레이션

**Kubernetes가 제공하는 것**

- **자동화된 배포**: 선언적 설정으로 원하는 상태 정의
- **자가 치유 (Self-healing)**: 실패한 컨테이너 자동 재시작, 교체
- **수평 스케일링**: CPU 사용량에 따라 자동 확장/축소
- **서비스 디스커버리**: 내부 DNS와 로드 밸런싱
- **롤링 업데이트**: 무중단 배포
- **시크릿 및 구성 관리**: 민감 정보 안전 관리
- **스토리지 오케스트레이션**: 다양한 스토리지 시스템 자동 마운트

### 1.2 Kubernetes의 역사

**2003-2004: Google Borg**
- Google 내부 컨테이너 오케스트레이션 시스템
- 수십억 개의 컨테이너 관리

**2014: Kubernetes 탄생**
- Google이 Borg의 경험을 바탕으로 오픈소스로 공개
- Go 언어로 작성
- CNCF (Cloud Native Computing Foundation)에 기부

**2015: v1.0 릴리스**
- 프로덕션 사용 가능
- 주요 클라우드 제공자 지원 시작

**2016-2018: 급속한 성장**
- 컨테이너 오케스트레이션의 사실상 표준이 됨
- Docker Swarm, Mesos 등을 제치고 선두

**2019-현재: 성숙 단계**
- 안정적인 릴리스 주기 (연 3회)
- 다양한 생태계 도구
- 멀티 클라우드, 하이브리드 클라우드의 핵심

### 1.3 Kubernetes 핵심 개념

**선언적 설정 (Declarative Configuration)**

명령형 방식:
```bash
# 무엇을 "어떻게" 할지 명령
docker run nginx
docker stop container_id
docker rm container_id
```

선언적 방식:
```yaml
# "원하는 상태"를 선언
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: nginx
        image: nginx:latest

# Kubernetes가 자동으로 이 상태를 유지
```

**Desired State (원하는 상태)**

- 사용자가 YAML로 원하는 상태를 정의
- Kubernetes가 현재 상태를 지속적으로 모니터링
- 현재 상태와 원하는 상태가 다르면 자동으로 조정
- **Reconciliation Loop**: 컨트롤러가 끊임없이 상태를 맞춤

**Control Plane과 Worker Node**

Kubernetes 클러스터는 두 부분으로 나뉜다:

**Control Plane (마스터)**
- 클러스터 전체를 관리
- 워크로드 스케줄링
- 이벤트 감지 및 대응
- 고가용성을 위해 다중화 권장

**Worker Node**
- 실제 컨테이너가 실행되는 곳
- Control Plane의 지시를 받아 실행
- 여러 개의 노드로 확장 가능

### 1.4 Kubernetes 설치

**로컬 개발 환경**

**Minikube**
```bash
# Minikube 설치 (Linux)
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube

# 클러스터 시작
minikube start

# 상태 확인
minikube status

# kubectl 설정 확인
kubectl cluster-info
```

**Kind (Kubernetes in Docker)**
```bash
# Kind 설치
curl -Lo ./kind https://kind.sigs.k8s.io/dl/latest/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind

# 클러스터 생성
kind create cluster --name my-cluster

# 멀티 노드 클러스터
cat <<EOF | kind create cluster --config=-
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
- role: worker
- role: worker
EOF
```

**K3s (경량 Kubernetes)**
```bash
# K3s 설치 (단일 노드)
curl -sfL https://get.k3s.io | sh -

# 확인
sudo kubectl get nodes
```

**kubectl 설치**

```bash
# Linux
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# 버전 확인
kubectl version --client

# 자동 완성 설정 (bash)
source <(kubectl completion bash)
echo "source <(kubectl completion bash)" >> ~/.bashrc

# 별칭 설정
alias k=kubectl
complete -F __start_kubectl k
```

---

## 2. Kubernetes 아키텍처

### 2.1 Control Plane 컴포넌트

**API Server (kube-apiserver)**

Kubernetes의 프론트엔드로, 모든 요청의 진입점이다.

**역할**
- RESTful API 제공
- 모든 컴포넌트 간의 통신 중심점
- 인증, 인가, admission control
- etcd와 유일하게 직접 통신하는 컴포넌트

**특징**
- 수평 확장 가능 (여러 인스턴스 실행)
- Stateless (상태는 etcd에 저장)

```bash
# API Server 버전 확인
kubectl version

# API 리소스 목록
kubectl api-resources

# API 버전
kubectl api-versions
```

**etcd**

분산형 키-값 저장소로, **클러스터의 모든 상태 데이터를 저장**한다.

**저장하는 데이터**
- 모든 클러스터 설정
- 모든 오브젝트의 상태
- 네트워크 설정
- Secrets

**특징**
- Raft 합의 알고리즘 사용
- 고가용성을 위해 홀수 개 (3, 5, 7개) 실행 권장
- 정기적인 백업 필수

```bash
# etcd 백업 (예시)
ETCDCTL_API=3 etcdctl snapshot save snapshot.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
```

**Scheduler (kube-scheduler)**

**새로 생성된 Pod를 어떤 노드에 배치할지 결정**한다.

**스케줄링 과정**
1. API Server에서 할당되지 않은 Pod 감지
2. Filtering: 조건에 맞는 노드 필터링
  - 리소스 요구사항 (CPU, 메모리)
  - 노드 셀렉터, Affinity/Anti-affinity
  - Taints와 Tolerations
3. Scoring: 적합한 노드에 점수 부여
4. 최고 점수 노드에 Pod 할당

**스케줄링 고려 사항**
- 리소스 요청량
- 하드웨어/소프트웨어 제약
- Affinity/Anti-affinity 규칙
- 데이터 지역성
- 워크로드 간섭

**Controller Manager (kube-controller-manager)**

**여러 컨트롤러를 실행하는 데몬**이다.

**주요 컨트롤러**

**Node Controller**
- 노드 상태 모니터링
- 응답 없는 노드 감지 및 처리

**Replication Controller**
- ReplicaSet의 Pod 수 유지
- 원하는 수만큼 Pod 실행 보장

**Endpoints Controller**
- Service와 Pod 연결
- Endpoints 오브젝트 관리

**Service Account & Token Controllers**
- 새 네임스페이스에 기본 ServiceAccount 생성
- API 접근 토큰 생성

**Reconciliation Loop**
- 각 컨트롤러는 독립적으로 실행
- 원하는 상태와 현재 상태 비교
- 차이가 있으면 조정 (Reconcile)

### 2.2 Node 컴포넌트

**Kubelet**

**각 노드에서 실행되는 에이전트**로, Pod가 정상적으로 실행되도록 관리한다.

**역할**
- API Server로부터 PodSpec 수신
- 컨테이너 런타임에 Pod 실행 요청
- Pod와 컨테이너 상태 모니터링
- 상태를 API Server에 보고
- 볼륨 마운트
- Secret과 ConfigMap 관리

**컨테이너 런타임과의 통신**
- CRI (Container Runtime Interface) 사용
- containerd, CRI-O 등과 통신

```bash
# Kubelet 로그 확인
journalctl -u kubelet -f

# Kubelet 설정 확인
ps aux | grep kubelet
```

**Kube-proxy**

**각 노드에서 네트워크 프록시를 실행**하여 Service 추상화를 구현한다.

**역할**
- Service의 가상 IP 구현
- 로드 밸런싱
- iptables 또는 IPVS 규칙 관리

**동작 모드**

**iptables 모드 (기본)**
- iptables 규칙으로 트래픽 리다이렉트
- 간단하고 안정적
- 대규모에서 성능 저하

**IPVS 모드**
- Linux IPVS (IP Virtual Server) 사용
- 더 나은 성능과 확장성
- 다양한 로드 밸런싱 알고리즘

```bash
# kube-proxy 모드 확인
kubectl get configmap kube-proxy -n kube-system -o yaml | grep mode
```

**Container Runtime**

실제로 컨테이너를 실행하는 소프트웨어이다.

**지원하는 런타임**
- **containerd** (권장)
- **CRI-O**
- Docker (deprecated, dockershim 제거됨)

**CRI (Container Runtime Interface)**
- Kubernetes와 컨테이너 런타임 간의 표준 인터페이스
- gRPC 기반
- 런타임을 쉽게 교체 가능

### 2.3 애드온 (Addons)

**DNS (CoreDNS)**

클러스터 내부 DNS 서비스를 제공한다.

**기능**
- Service 이름 → ClusterIP 해석
- Pod 이름 해석
- 외부 DNS 쿼리 전달

```bash
# CoreDNS 확인
kubectl get pods -n kube-system -l k8s-app=kube-dns

# DNS 테스트
kubectl run test --image=busybox --rm -it -- nslookup kubernetes.default
```

**Dashboard**

웹 기반 UI로 클러스터 관리를 제공한다.

```bash
# Dashboard 설치
kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.7.0/aio/deploy/recommended.yaml

# 접속 (프록시 사용)
kubectl proxy

# 브라우저에서 접속
# http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/
```

**Metrics Server**

리소스 사용량 메트릭을 수집한다.

```bash
# Metrics Server 설치
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# 리소스 사용량 확인
kubectl top nodes
kubectl top pods
```

**CNI (Container Network Interface)**

Pod 네트워킹을 담당하는 플러그인이다.

**주요 CNI 플러그인**

**Calico**
- 네트워크 정책 지원
- BGP 기반 라우팅
- 대규모 환경에 적합

**Flannel**
- 간단하고 가벼움
- 오버레이 네트워크
- 소규모 환경에 적합

**Cilium**
- eBPF 기반
- 고성능
- 고급 네트워크 정책

**Weave Net**
- 간단한 설정
- 자동 메시 네트워크
- 암호화 지원

### 2.4 클러스터 통신 흐름

**kubectl 명령 실행 시**

```bash
kubectl create deployment nginx --image=nginx
```

1. kubectl이 kubeconfig의 클러스터 정보 읽기
2. API Server에 인증 및 요청 전송
3. API Server가 요청 검증 (인증, 인가, admission)
4. Deployment 오브젝트를 etcd에 저장
5. Deployment Controller가 변경 감지
6. ReplicaSet 생성
7. ReplicaSet Controller가 Pod 생성 요청
8. Scheduler가 Pod를 노드에 할당
9. 해당 노드의 Kubelet이 변경 감지
10. Kubelet이 컨테이너 런타임에 컨테이너 실행 요청
11. 컨테이너 런타임이 컨테이너 실행

**Pod 간 통신**

1. Pod A가 Pod B의 IP로 패킷 전송
2. Pod A의 네트워크 네임스페이스에서 라우팅
3. CNI 플러그인이 오버레이 네트워크를 통해 전달
4. Pod B가 위치한 노드로 패킷 전달
5. CNI가 Pod B의 네트워크 네임스페이스로 전달
6. Pod B가 패킷 수신

**Service를 통한 통신**

1. Pod가 Service 이름으로 요청 (예: http://my-service)
2. CoreDNS가 Service의 ClusterIP 반환
3. kube-proxy가 설정한 iptables/IPVS 규칙 적용
4. 백엔드 Pod 중 하나로 트래픽 전달 (로드 밸런싱)
5. Pod가 요청 처리

---

## 3. Kubernetes 핵심 오브젝트

### 3.1 Pod

**Pod란?**

Pod는 **Kubernetes에서 배포할 수 있는 가장 작은 단위**이다.

**특징**
- 하나 이상의 컨테이너를 포함
- 같은 Pod의 컨테이너는:
  - 같은 네트워크 네임스페이스 공유 (localhost로 통신)
  - 같은 볼륨 공유 가능
  - 같은 노드에서 실행
  - 같은 라이프사이클

**간단한 Pod 생성**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx-pod
  labels:
    app: nginx
spec:
  containers:
  - name: nginx
    image: nginx:latest
    ports:
    - containerPort: 80
```

```bash
# Pod 생성
kubectl apply -f pod.yaml

# Pod 목록
kubectl get pods

# Pod 상세 정보
kubectl describe pod nginx-pod

# Pod 로그
kubectl logs nginx-pod

# Pod 삭제
kubectl delete pod nginx-pod
```

**멀티 컨테이너 Pod**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: multi-container-pod
spec:
  containers:
  - name: nginx
    image: nginx
    ports:
    - containerPort: 80
    volumeMounts:
    - name: shared-data
      mountPath: /usr/share/nginx/html
  
  - name: debian
    image: debian
    command: ["/bin/sh"]
    args: ["-c", "while true; do date >> /pod-data/index.html; sleep 10; done"]
    volumeMounts:
    - name: shared-data
      mountPath: /pod-data
  
  volumes:
  - name: shared-data
    emptyDir: {}
```

**Pod 생명주기**

**Pod 상태 (Phase)**
- **Pending**: Pod가 생성되었지만 아직 실행 안 됨
- **Running**: Pod가 노드에 할당되어 실행 중
- **Succeeded**: 모든 컨테이너가 정상 종료
- **Failed**: 하나 이상의 컨테이너가 실패로 종료
- **Unknown**: Pod 상태를 알 수 없음 (노드 통신 장애 등)

**컨테이너 상태**
- **Waiting**: 컨테이너가 아직 실행되지 않음
- **Running**: 컨테이너 실행 중
- **Terminated**: 컨테이너 종료됨

```bash
# Pod 상태 확인
kubectl get pods
kubectl describe pod <pod-name>

# 특정 컨테이너 로그
kubectl logs <pod-name> -c <container-name>

# 이전 컨테이너 로그 (재시작된 경우)
kubectl logs <pod-name> --previous
```

**Init 컨테이너**

메인 컨테이너보다 먼저 실행되는 특수 컨테이너이다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: init-demo
spec:
  initContainers:
  - name: install
    image: busybox
    command:
    - wget
    - "-O"
    - "/work-dir/index.html"
    - http://example.com
    volumeMounts:
    - name: workdir
      mountPath: "/work-dir"
  
  containers:
  - name: nginx
    image: nginx
    ports:
    - containerPort: 80
    volumeMounts:
    - name: workdir
      mountPath: /usr/share/nginx/html
  
  volumes:
  - name: workdir
    emptyDir: {}
```

**용도**
- 애플리케이션 시작 전 준비 작업
- 설정 파일 다운로드
- 데이터베이스 마이그레이션
- 의존 서비스 대기

**Probe (헬스체크)**

**Liveness Probe**
- 컨테이너가 살아있는지 확인
- 실패 시 컨테이너 재시작

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 3
  periodSeconds: 3
```

**Readiness Probe**
- 컨테이너가 트래픽을 받을 준비가 되었는지 확인
- 실패 시 Service 엔드포인트에서 제거

```yaml
readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
```

**Startup Probe**
- 컨테이너가 시작되었는지 확인
- 느리게 시작하는 애플리케이션용
- 성공하기 전까지 다른 Probe 비활성화

```yaml
startupProbe:
  httpGet:
    path: /startup
    port: 8080
  failureThreshold: 30
  periodSeconds: 10
```

**Probe 타입**

```yaml
# HTTP GET
livenessProbe:
  httpGet:
    path: /health
    port: 8080
    httpHeaders:
    - name: Custom-Header
      value: Awesome

# TCP Socket
livenessProbe:
  tcpSocket:
    port: 8080

# 명령 실행
livenessProbe:
  exec:
    command:
    - cat
    - /tmp/healthy
```

**리소스 요청 및 제한**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: resource-demo
spec:
  containers:
  - name: app
    image: myapp
    resources:
      requests:
        memory: "64Mi"
        cpu: "250m"
      limits:
        memory: "128Mi"
        cpu: "500m"
```

**requests vs limits**
- **requests**: 최소 보장 리소스 (스케줄링 기준)
- **limits**: 최대 사용 가능 리소스

**CPU**
- 1 CPU = 1000m (밀리코어)
- 압축 가능한 리소스 (초과 시 throttling)

**Memory**
- 압축 불가능한 리소스
- 초과 시 OOMKilled

### 3.2 Label과 Selector

**Label이란?**

Label은 **오브젝트를 식별하고 그룹화하는 키-값 쌍**이다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
  labels:
    app: nginx
    environment: production
    tier: frontend
    version: v1
```

**Label 관리**

```bash
# Label 추가
kubectl label pod my-pod owner=devops

# Label 수정 (--overwrite)
kubectl label pod my-pod environment=staging --overwrite

# Label 삭제
kubectl label pod my-pod version-

# Label 확인
kubectl get pods --show-labels

# 특정 Label 컬럼으로 표시
kubectl get pods -L app,environment
```

**Selector**

Label을 기반으로 오브젝트를 선택한다.

```bash
# Equality-based selector
kubectl get pods -l app=nginx
kubectl get pods -l environment!=production

# Set-based selector
kubectl get pods -l 'environment in (production,staging)'
kubectl get pods -l 'tier notin (frontend)'
kubectl get pods -l 'app,!version'

# 여러 조건 (AND)
kubectl get pods -l app=nginx,environment=production
```

**YAML에서 Selector 사용**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  selector:
    app: nginx
    tier: frontend
  ports:
  - port: 80
```

### 3.3 Annotation

**Annotation이란?**

Annotation은 **비식별 메타데이터를 저장**하는 키-값 쌍이다.

**Label vs Annotation**
- **Label**: 오브젝트 선택 및 그룹화 (제한된 문자, 짧은 값)
- **Annotation**: 임의의 메타데이터 저장 (제한 없음)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
  annotations:
    description: "This pod runs the web application"
    owner: "devops-team@example.com"
    build-version: "1.2.3"
    deployment-date: "2024-01-15"
    prometheus.io/scrape: "true"
    prometheus.io/port: "9090"
```

**사용 사례**
- 빌드, 릴리스 정보
- 담당자 연락처
- 도구별 설정 (Prometheus, Istio 등)
- 디버깅 정보
- 정책 및 규정

```bash
# Annotation 추가
kubectl annotate pod my-pod description="Web server"

# Annotation 확인
kubectl describe pod my-pod
kubectl get pod my-pod -o yaml
```

### 3.4 Namespace

**Namespace란?**

Namespace는 **클러스터 리소스를 논리적으로 분리**하는 메커니즘이다.

**기본 Namespace**
- **default**: 기본 네임스페이스
- **kube-system**: Kubernetes 시스템 컴포넌트
- **kube-public**: 모든 사용자가 읽을 수 있는 리소스
- **kube-node-lease**: 노드 heartbeat 정보

**Namespace 생성**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: development
```

```bash
# Namespace 생성
kubectl create namespace development

# Namespace 목록
kubectl get namespaces

# Namespace 삭제
kubectl delete namespace development
```

**Namespace 사용**

```bash
# 특정 Namespace의 리소스 조회
kubectl get pods -n development

# 모든 Namespace의 리소스 조회
kubectl get pods --all-namespaces
kubectl get pods -A

# 기본 Namespace 설정
kubectl config set-context --current --namespace=development

# 현재 컨텍스트 확인
kubectl config view --minify | grep namespace
```

**리소스 쿼터 (ResourceQuota)**

Namespace별 리소스 사용량을 제한한다.

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: dev-quota
  namespace: development
spec:
  hard:
    requests.cpu: "10"
    requests.memory: "20Gi"
    limits.cpu: "20"
    limits.memory: "40Gi"
    pods: "50"
    services: "10"
    persistentvolumeclaims: "5"
```

```bash
# 쿼터 확인
kubectl get resourcequota -n development
kubectl describe resourcequota dev-quota -n development
```

**LimitRange**

Namespace 내 개별 리소스의 기본값 및 제한을 설정한다.

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: dev-limits
  namespace: development
spec:
  limits:
  - max:
      cpu: "2"
      memory: "4Gi"
    min:
      cpu: "100m"
      memory: "128Mi"
    default:
      cpu: "500m"
      memory: "512Mi"
    defaultRequest:
      cpu: "250m"
      memory: "256Mi"
    type: Container
```

---

## 4. Workload 리소스

### 4.1 ReplicaSet

**ReplicaSet이란?**

ReplicaSet은 **지정된 수의 Pod 복제본을 유지**하는 컨트롤러이다.

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: nginx-replicaset
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:latest
        ports:
        - containerPort: 80
```

**주요 필드**
- **replicas**: 유지할 Pod 수
- **selector**: 관리할 Pod를 선택하는 Label Selector
- **template**: Pod 템플릿 (Pod 생성 시 사용)

```bash
# ReplicaSet 생성
kubectl apply -f replicaset.yaml

# ReplicaSet 확인
kubectl get replicaset
kubectl get rs

# 상세 정보
kubectl describe rs nginx-replicaset

# 스케일링
kubectl scale rs nginx-replicaset --replicas=5

# Pod 삭제 시 자동 재생성
kubectl delete pod <pod-name>
# 즉시 새 Pod 생성됨
```

**직접 사용하지 않는 이유**

ReplicaSet은 보통 직접 사용하지 않고 **Deployment를 통해 간접적으로 사용**한다. Deployment가 더 많은 기능을 제공하기 때문이다.

### 4.2 Deployment

**Deployment란?**

Deployment는 **ReplicaSet을 관리하고 선언적 업데이트를 제공**하는 상위 수준 컨트롤러이다.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
  labels:
    app: nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.20
        ports:
        - containerPort: 80
```

**Deployment 관리**

```bash
# Deployment 생성
kubectl apply -f deployment.yaml

# 또는 명령어로 생성
kubectl create deployment nginx --image=nginx:1.20 --replicas=3

# 확인
kubectl get deployments
kubectl get deploy

# 상세 정보
kubectl describe deployment nginx-deployment

# 스케일링
kubectl scale deployment nginx-deployment --replicas=5

# 자동 스케일링
kubectl autoscale deployment nginx-deployment --min=3 --max=10 --cpu-percent=80
```

**롤링 업데이트**

Deployment의 가장 중요한 기능은 **무중단 배포**이다.

```bash
# 이미지 업데이트
kubectl set image deployment/nginx-deployment nginx=nginx:1.21

# 또는 YAML 수정 후
kubectl apply -f deployment.yaml

# 롤아웃 상태 확인
kubectl rollout status deployment/nginx-deployment

# 롤아웃 히스토리
kubectl rollout history deployment/nginx-deployment

# 특정 리비전 확인
kubectl rollout history deployment/nginx-deployment --revision=2

# 롤백
kubectl rollout undo deployment/nginx-deployment

# 특정 리비전으로 롤백
kubectl rollout undo deployment/nginx-deployment --to-revision=2

# 롤아웃 일시 정지
kubectl rollout pause deployment/nginx-deployment

# 롤아웃 재개
kubectl rollout resume deployment/nginx-deployment
```

**업데이트 전략**

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1        # 초과 생성 가능한 Pod 수
      maxUnavailable: 0  # 동시에 중지 가능한 Pod 수
```

**RollingUpdate (기본값)**
- 점진적으로 새 버전 배포
- 무중단 배포
- maxSurge와 maxUnavailable로 제어

**Recreate**
- 모든 기존 Pod 삭제 후 새 Pod 생성
- 다운타임 발생
- 리소스 절약

```yaml
spec:
  strategy:
    type: Recreate
```

**Blue-Green 배포 (수동)**

```bash
# Blue 환경
kubectl apply -f deployment-blue.yaml

# Green 환경 배포
kubectl apply -f deployment-green.yaml

# 테스트 후 Service 전환
kubectl patch service myapp -p '{"spec":{"selector":{"version":"green"}}}'

# 문제 시 롤백
kubectl patch service myapp -p '{"spec":{"selector":{"version":"blue"}}}'
```

**Canary 배포**

```yaml
# 기존 버전 (90%)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-stable
spec:
  replicas: 9
  selector:
    matchLabels:
      app: myapp
      version: stable
  template:
    metadata:
      labels:
        app: myapp
        version: stable
    spec:
      containers:
      - name: myapp
        image: myapp:1.0

---
# 새 버전 (10%)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-canary
spec:
  replicas: 1
  selector:
    matchLabels:
      app: myapp
      version: canary
  template:
    metadata:
      labels:
        app: myapp
        version: canary
    spec:
      containers:
      - name: myapp
        image: myapp:2.0

---
# Service (두 버전 모두 선택)
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  selector:
    app: myapp
  ports:
  - port: 80
```

### 4.3 StatefulSet

**StatefulSet이란?**

StatefulSet은 **상태가 있는 애플리케이션을 관리**하는 워크로드 리소스이다.

**Deployment vs StatefulSet**

| 특성 | Deployment | StatefulSet |
|------|-----------|-------------|
| Pod 이름 | 랜덤 | 순차적, 고정 |
| 네트워크 ID | 가변 | 고정 (Headless Service) |
| 스토리지 | 공유 가능 | Pod별 독립 |
| 시작 순서 | 병렬 | 순차적 |
| 업데이트 | 병렬 | 순차적 |
| 용도 | Stateless 앱 | Stateful 앱 |

```yaml
apiVersion: v1
kind: Service
metadata:
  name: nginx-headless
spec:
  clusterIP: None  # Headless Service
  selector:
    app: nginx
  ports:
  - port: 80

---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: web
spec:
  serviceName: "nginx-headless"
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx
        ports:
        - containerPort: 80
        volumeMounts:
        - name: www
          mountPath: /usr/share/nginx/html
  volumeClaimTemplates:
  - metadata:
      name: www
    spec:
      accessModes: [ "ReadWriteOnce" ]
      resources:
        requests:
          storage: 1Gi
```

**특징**

**고정된 Pod 이름**
```
web-0
web-1
web-2
```

**안정적인 네트워크 ID**
```
web-0.nginx-headless.default.svc.cluster.local
web-1.nginx-headless.default.svc.cluster.local
web-2.nginx-headless.default.svc.cluster.local
```

**순차적 배포/삭제**
- 배포: web-0 → web-1 → web-2
- 삭제: web-2 → web-1 → web-0
- 이전 Pod가 Running이 되어야 다음 Pod 생성

**독립적인 스토리지**
- 각 Pod가 자신만의 PVC 소유
- Pod 재생성 시에도 같은 PVC 사용

**사용 사례**
- 데이터베이스 (MySQL, PostgreSQL, MongoDB)
- 분산 시스템 (Kafka, Zookeeper, Elasticsearch)
- 순서가 중요한 애플리케이션

```bash
# StatefulSet 확인
kubectl get statefulset
kubectl get sts

# Pod 확인
kubectl get pods -l app=nginx

# 스케일링
kubectl scale statefulset web --replicas=5

# 업데이트 (순차적)
kubectl set image statefulset/web nginx=nginx:1.21

# 롤아웃 상태
kubectl rollout status statefulset/web
```

### 4.4 DaemonSet

**DaemonSet이란?**

DaemonSet은 **모든 (또는 특정) 노드에서 Pod를 실행**하는 워크로드 리소스이다.

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd
  namespace: kube-system
spec:
  selector:
    matchLabels:
      name: fluentd
  template:
    metadata:
      labels:
        name: fluentd
    spec:
      tolerations:
      - key: node-role.kubernetes.io/master
        effect: NoSchedule
      containers:
      - name: fluentd
        image: fluent/fluentd:v1.14
        volumeMounts:
        - name: varlog
          mountPath: /var/log
        - name: varlibdockercontainers
          mountPath: /var/lib/docker/containers
          readOnly: true
      volumes:
      - name: varlog
        hostPath:
          path: /var/log
      - name: varlibdockercontainers
        hostPath:
          path: /var/lib/docker/containers
```

**사용 사례**
- 로그 수집 (Fluentd, Logstash)
- 모니터링 에이전트 (Node Exporter, Datadog Agent)
- 네트워크 플러그인 (Calico, Flannel)
- 스토리지 데몬 (Ceph, GlusterFS)

**특징**
- 새 노드 추가 시 자동으로 Pod 생성
- 노드 제거 시 자동으로 Pod 삭제
- 노드 셀렉터로 특정 노드에만 배포 가능

```yaml
spec:
  template:
    spec:
      nodeSelector:
        disk: ssd  # ssd 라벨이 있는 노드에만 배포
```

```bash
# DaemonSet 확인
kubectl get daemonset -A
kubectl get ds -A

# 업데이트
kubectl set image daemonset/fluentd fluentd=fluent/fluentd:v1.15 -n kube-system

# 롤아웃 상태
kubectl rollout status daemonset/fluentd -n kube-system
```

### 4.5 Job

**Job이란?**

Job은 **하나 이상의 Pod를 실행하고 정상 종료를 보장**하는 리소스이다.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: pi
spec:
  template:
    spec:
      containers:
      - name: pi
        image: perl
        command: ["perl",  "-Mbignum=bpi", "-wle", "print bpi(2000)"]
      restartPolicy: Never
  backoffLimit: 4
  completions: 1
  parallelism: 1
```

**주요 필드**
- **completions**: 성공해야 하는 Pod 수
- **parallelism**: 동시 실행 Pod 수
- **backoffLimit**: 재시도 횟수

```bash
# Job 생성
kubectl apply -f job.yaml

# Job 확인
kubectl get jobs

# Pod 확인
kubectl get pods

# 로그 확인
kubectl logs <pod-name>

# Job 삭제 (Pod도 함께 삭제)
kubectl delete job pi
```

**병렬 Job**

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: parallel-job
spec:
  completions: 10
  parallelism: 3
  template:
    spec:
      containers:
      - name: worker
        image: busybox
        command: ["sh", "-c", "echo Processing && sleep 10"]
      restartPolicy: OnFailure
```

**사용 사례**
- 데이터 처리 배치 작업
- 데이터베이스 마이그레이션
- 백업
- 이메일 발송

### 4.6 CronJob

**CronJob이란?**

CronJob은 **스케줄에 따라 주기적으로 Job을 실행**하는 리소스이다.

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup-job
spec:
  schedule: "0 2 * * *"  # 매일 오전 2시
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: backup-tool
            command: ["/bin/sh", "-c", "backup.sh"]
          restartPolicy: OnFailure
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
```

**Cron 스케줄 형식**

```
# ┌───────────── 분 (0 - 59)
# │ ┌───────────── 시 (0 - 23)
# │ │ ┌───────────── 일 (1 - 31)
# │ │ │ ┌───────────── 월 (1 - 12)
# │ │ │ │ ┌───────────── 요일 (0 - 6) (일요일=0)
# │ │ │ │ │
# * * * * *

# 예시
0 */6 * * *     # 6시간마다
0 0 * * 0       # 매주 일요일 자정
0 0 1 * *       # 매월 1일 자정
*/15 * * * *    # 15분마다
```

```bash
# CronJob 확인
kubectl get cronjobs
kubectl get cj

# 수동 Job 트리거
kubectl create job --from=cronjob/backup-job manual-backup

# CronJob 일시 정지
kubectl patch cronjob backup-job -p '{"spec":{"suspend":true}}'

# CronJob 재개
kubectl patch cronjob backup-job -p '{"spec":{"suspend":false}}'
```

