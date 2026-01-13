---
title: "Part 1: 컨테이너 오케스트레이션과 Kubernetes 소개"
date: 2026-01-02
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, Orchestration, Docker]
layout: post
toc: true
math: true
mermaid: true
---

# Part 1: 컨테이너 오케스트레이션 개요

## 1. 컨테이너 오케스트레이션이란?

### 1.1 단일 호스트의 한계

Docker는 단일 호스트에서 컨테이너를 관리하는 강력한 도구이지만, 프로덕션 환경에서는 여러 제약이 있다:

**수동 관리의 어려움**

수백, 수천 개의 컨테이너를 수동으로 관리하는 것은 현실적으로 불가능하다. 각 컨테이너의 상태를 추적하고, 장애가 발생했을 때 수동으로 재시작하며, 리소스를 수동으로 분배하는 작업은 운영 팀에게 큰 부담이 된다.

**고가용성 부재**

단일 Docker 호스트에서는 컨테이너 장애 시 자동 복구 메커니즘이 없다. Docker는 `--restart` 플래그로 컨테이너 재시작 정책을 제공하지만, 호스트 자체가 다운되면 모든 컨테이너가 중단된다.

**리소스 활용 최적화 불가**

여러 호스트에 걸쳐 컨테이너를 분산 배치하여 리소스를 효율적으로 활용하는 것이 불가능하다. 특정 호스트는 과부하 상태이고 다른 호스트는 유휴 상태인 불균형이 발생한다.

**네트워크 관리 복잡성**

다중 호스트 간 컨테이너 통신을 위해서는 수동으로 네트워크를 구성해야 한다. Overlay 네트워크를 직접 설정하고, 포트 매핑을 관리하며, 서비스 디스커버리를 구현해야 한다.

**스케일링 자동화 부재**

트래픽 증가에 따라 컨테이너를 자동으로 추가하거나, 트래픽 감소 시 컨테이너를 제거하는 자동 스케일링이 불가능하다. 부하 변화를 모니터링하고 수동으로 스케일 조정을 해야 한다.

### 1.2 오케스트레이션의 필요성

오케스트레이션 플랫폼은 다음을 자동으로 관리한다:

**배포 및 스케일링 (Deployment & Scaling)**

선언적 방식으로 애플리케이션의 원하는 상태를 정의하면, 오케스트레이션 플랫폼이 현재 상태를 지속적으로 모니터링하여 원하는 상태로 수렴시킨다. CPU/메모리 사용률을 기반으로 자동 스케일링을 수행하며, 여러 호스트에 걸쳐 최적의 배포 전략을 실행한다.

**고가용성 (High Availability)**

장애가 발생한 노드에서 실행 중이던 Pod을 자동으로 다른 정상 노드로 재배치한다. 설정된 복제본 수를 항상 유지하며, 새 버전 배포 시 무중단 롤링 업데이트를 수행한다.

**서비스 디스커버리 (Service Discovery)**

컨테이너가 생성되거나 제거될 때 자동으로 서비스 레지스트리에 등록/해제된다. 내장 DNS를 통해 서비스 이름으로 검색이 가능하며, 여러 Pod 인스턴스 간 자동 로드 밸런싱을 제공한다.

**자동 복구 (Self-healing)**

실패한 컨테이너를 자동으로 감지하여 재시작한다. Health check에 실패한 Pod은 자동으로 제거되고 새로운 Pod으로 교체된다. 노드 장애를 감지하면 해당 노드의 워크로드를 다른 노드로 재배치한다.

**리소스 관리 (Resource Management)**

각 컨테이너의 CPU, 메모리 요청량과 제한을 설정할 수 있다. 리소스 요구사항을 기반으로 Pod을 가장 적합한 노드에 스케줄링한다. 클러스터 전체의 리소스 사용률을 최적화하여 비용을 절감한다.

### 1.3 주요 오케스트레이션 도구

**Kubernetes (K8s)**

Google의 Borg 시스템에서 얻은 15년 이상의 경험을 바탕으로 설계된 오픈소스 컨테이너 오케스트레이션 플랫폼이다. CNCF(Cloud Native Computing Foundation)가 주도하며, 업계 사실상의 표준으로 자리 잡았다. 가장 완성도 높은 기능 세트를 제공하지만, 그만큼 학습 곡선이 가파르다.

**Docker Swarm**

Docker에 내장된 네이티브 오케스트레이션 도구로, Docker CLI와 완벽하게 통합되어 있다. 설정이 간단하고 사용이 쉬워 소규모 프로젝트나 Kubernetes를 학습하기 전 단계로 적합하다. 그러나 Kubernetes에 비해 기능이 제한적이며, 대규모 프로덕션 환경에는 부족하다.

**Apache Mesos**

범용 클러스터 리소스 매니저로, 컨테이너뿐만 아니라 빅데이터 워크로드(Hadoop, Spark)도 함께 관리할 수 있다. Twitter, Airbnb, Apple 등 대기업에서 사용하지만, 설정이 복잡하고 학습 난이도가 높다.

**Nomad (HashiCorp)**

HashiCorp의 경량 오케스트레이터로, 멀티 클라우드 환경을 지원한다. 컨테이너뿐만 아니라 VM, 바이너리 등 다양한 워크로드를 실행할 수 있다. Terraform, Vault, Consul 등 HashiCorp 생태계와 잘 통합된다.

---

## 2. Kubernetes 개요

### 2.1 Kubernetes란?

Kubernetes(K8s)는 컨테이너화된 애플리케이션의 배포, 스케일링, 관리를 자동화하는 오픈소스 플랫폼이다. "K8s"라는 이름은 "K"와 "s" 사이에 8개의 문자가 있어서 붙여진 numeronym이다.

**핵심 가치**

**선언적 설정 (Declarative Configuration)**

명령형 접근 방식에서는 "어떻게" 할지를 단계별로 명시해야 한다. 반면 선언적 접근 방식에서는 "무엇을" 원하는지만 정의하면, Kubernetes가 현재 상태를 원하는 상태로 수렴시키는 방법을 알아서 결정한다.

**자동화 (Automation)**

반복적인 운영 작업을 자동화하여 인적 오류를 줄이고 운영 효율성을 높인다. 배포, 스케일링, 복구, 업데이트 등 대부분의 작업이 자동으로 처리된다.

**확장성 (Scalability)**

단일 클러스터에서 수천 개의 노드와 수만 개의 Pod을 관리할 수 있다. Google은 내부적으로 수십억 개의 컨테이너를 Kubernetes의 전신인 Borg로 관리한 경험이 있다.

**이식성 (Portability)**

온프레미스, AWS, GCP, Azure 등 퍼블릭 클라우드, 하이브리드 환경 모두에서 동일하게 동작한다. 클라우드 종속성을 피하고 워크로드를 자유롭게 이동할 수 있다.

### 2.2 Kubernetes의 역사

**Google Borg (2003-2004)**

Google은 2003년경부터 Borg라는 내부 클러스터 관리 시스템을 사용해왔다. Borg는 Gmail, Google Search, YouTube 등 Google의 모든 서비스를 운영하며, 수십억 개의 컨테이너를 관리한 경험을 축적했다. Borg의 설계 철학과 교훈은 Kubernetes의 기반이 되었다.

**Kubernetes 탄생 (2014년 6월)**

Google의 엔지니어들이 Borg에서 얻은 교훈을 바탕으로 Kubernetes를 설계하고 오픈소스로 공개했다. 초기 커밋은 Joe Beda, Brendan Burns, Craig McLuckie가 작성했으며, Go 언어로 구현되었다.

**CNCF 기부 (2015년 7월)**

Google은 Kubernetes를 중립적인 재단인 CNCF(Cloud Native Computing Foundation)에 기부했다. 이는 Kubernetes가 특정 벤더에 종속되지 않고 커뮤니티 주도로 발전할 수 있는 기반을 마련했다.

**v1.0 릴리스 (2015년 7월)**

첫 번째 프로덕션 준비 버전인 v1.0이 릴리스되었다. AWS, Azure, GCP 등 주요 클라우드 제공자가 Kubernetes 지원을 시작했다.

**컨테이너 오케스트레이션 전쟁 (2016-2018)**

Kubernetes, Docker Swarm, Apache Mesos 간의 경쟁이 치열했다. 2017년 Docker가 Kubernetes 지원을 발표하면서 사실상 Kubernetes의 승리로 귀결되었다.

**성숙 단계 (2019-현재)**

안정적인 연 3-4회 릴리스 주기를 유지하며, 풍부한 생태계 도구들이 발전했다. Service Mesh(Istio, Linkerd), GitOps(ArgoCD, Flux), Observability(Prometheus, Grafana) 등 다양한 도구가 Kubernetes 위에서 동작한다.

### 2.3 Kubernetes의 특징

**선언적 설정 (Declarative Configuration)**

명령형 접근:

```bash
# 명령형: 각 단계를 명시
docker run nginx
docker scale container_id 3
docker update --cpu-shares 512 container_id
```

선언형 접근:

```yaml
# 선언형: 원하는 상태만 정의
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
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
          image: nginx:1.21
          resources:
            limits:
              cpu: "500m"
              memory: "512Mi"
```

Kubernetes는 지속적으로 현재 상태를 모니터링하여 원하는 상태와 비교하고, 차이가 있으면 자동으로 조정하는 Reconciliation Loop를 실행한다.

**자기 치유 (Self-healing)**

- Health check 실패 시 컨테이너 자동 재시작
- Liveness probe 실패 시 Pod 재시작
- Readiness probe 실패 시 Service에서 제거
- 노드 장애 감지 시 다른 노드로 Pod 재배치 (기본 5분 타임아웃)

**자동 스케일링 (Auto-scaling)**

- **HPA (Horizontal Pod Autoscaler)**: CPU/메모리 사용률 기반 Pod 수 자동 조절
- **VPA (Vertical Pod Autoscaler)**: 컨테이너 리소스 요청/제한 자동 조절
- **Cluster Autoscaler**: 노드 부족 시 클러스터에 노드 자동 추가

**무중단 배포 (Rolling Update)**

- 새 버전 Pod을 점진적으로 생성하면서 구 버전 Pod을 점진적으로 제거
- `maxSurge`와 `maxUnavailable` 파라미터로 배포 속도 제어
- 새 버전에 문제가 있으면 자동 롤백

**서비스 디스커버리 및 로드 밸런싱**

- 각 Service는 고정 ClusterIP를 할당받음
- 내장 DNS (CoreDNS)를 통해 서비스 이름으로 검색
- iptables 또는 IPVS 기반 L4 로드 밸런싱
- HTTP, gRPC, TCP 등 다양한 프로토콜 지원

### 2.4 Docker와의 관계

**Docker는 컨테이너 런타임, Kubernetes는 오케스트레이션**

```
Application Code
        ↓
    Dockerfile (이미지 빌드)
        ↓
    Container Image (레지스트리 저장)
        ↓
    Kubernetes (배포, 스케일, 관리)
        ↓
    Container Runtime (containerd, CRI-O)
        ↓
    Running Containers on Cluster
```

**Docker가 제공하는 것**

- 애플리케이션을 이미지로 패키징 (Dockerfile)
- 일관된 실행 환경 보장 (격리, 재현성)
- 이미지 레지스트리를 통한 배포

**Kubernetes가 추가하는 것**

- 다중 호스트 클러스터 관리
- 선언적 배포 및 자동 스케일링
- 자가 치유 및 자동 복구
- 서비스 디스커버리 및 로드 밸런싱
- 롤링 업데이트 및 롤백
- Secret과 ConfigMap을 통한 설정 관리
- Persistent Volume을 통한 스토리지 관리

**Container Runtime 변화**

Kubernetes 초기에는 Docker를 기본 런타임으로 사용했으나, v1.20부터 Docker shim이 deprecated되고 v1.24에서 완전히 제거되었다. 현재는 CRI(Container Runtime Interface) 표준을 따르는 containerd, CRI-O 등을 직접 사용한다. 이는 Docker daemon의 오버헤드를 제거하고 성능을 향상시켰다.

---

## 실습 환경 구성

**로컬 Kubernetes 클러스터 도구**

**minikube**

단일 노드 Kubernetes 클러스터를 로컬에 생성하는 가장 일반적인 도구다.

```bash
# MacOS 설치
brew install minikube

# Linux 설치
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube

# 클러스터 시작 (Docker driver)
minikube start --driver=docker

# 상태 확인
minikube status
kubectl cluster-info
kubectl get nodes
```

**kind (Kubernetes IN Docker)**

Docker 컨테이너 내에서 Kubernetes 클러스터를 실행한다. CI/CD 파이프라인에서 테스트 환경으로 많이 사용된다.

```bash
# 설치
brew install kind

# 클러스터 생성
kind create cluster

# 다중 노드 클러스터 생성
cat <<EOF | kind create cluster --config=-
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
- role: worker
- role: worker
EOF
```

**k3s / k3d**

경량화된 Kubernetes 배포판으로, IoT 및 엣지 환경에 적합하다. k3d는 k3s를 Docker에서 실행한다.

```bash
# k3d 설치
brew install k3d

# 클러스터 생성
k3d cluster create mycluster
```

**kubectl 기본 명령어**

```bash
# 버전 확인 (클라이언트와 서버 버전)
kubectl version

# 클러스터 정보
kubectl cluster-info

# 노드 목록
kubectl get nodes
kubectl get nodes -o wide  # 더 많은 정보

# 모든 리소스 확인
kubectl get all -A

# 특정 네임스페이스의 리소스
kubectl get pods -n kube-system

# 리소스 상세 정보
kubectl describe node <node-name>
kubectl describe pod <pod-name>

# YAML 출력
kubectl get pod <pod-name> -o yaml

# 리소스 삭제
kubectl delete pod <pod-name>
```

---

## 참고 자료

- [Kubernetes 공식 문서](https://kubernetes.io/docs/home/)
- [Kubernetes the Hard Way](https://github.com/kelseyhightower/kubernetes-the-hard-way)
- [CNCF Landscape](https://landscape.cncf.io/)
- [Borg, Omega, and Kubernetes - Google 논문](https://research.google/pubs/pub44843/)

---

**다음**: [Part 2: Kubernetes 아키텍처](https://k-diger.github.io/posts//posts/kubernetes-02-architecture) →
