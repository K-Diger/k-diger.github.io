---

title: Fundamental-5: Container Orchestration
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

  * [Kubernetes란?](#11-kubernetes란)
  * [Kubernetes의 역사](#12-kubernetes의-역사)
  * [Kubernetes 핵심 개념](#13-kubernetes-핵심-개념)
  * [Kubernetes 설치](#14-kubernetes-설치)

2. [Kubernetes 아키텍처](#2-kubernetes-아키텍처)

  * [Control Plane 컴포넌트](#21-control-plane-컴포넌트)

    * [API Server (kube-apiserver)](#api-server-kube-apiserver)
    * [etcd](#etcd)
    * [Scheduler (kube-scheduler)](#scheduler-kube-scheduler)
    * [Controller Manager (kube-controller-manager)](#controller-manager-kube-controller-manager)
  * [Node 컴포넌트](#22-node-컴포넌트)

    * [Kubelet](#kubelet)
    * [Kube-proxy](#kube-proxy)
    * [Container Runtime](#container-runtime)
  * [애드온 (Addons)](#23-애드온-addons)

    * [DNS (CoreDNS)](#dns-coredns)
    * [Dashboard](#dashboard)
    * [Metrics Server](#metrics-server)
    * [CNI (Container Network Interface)](#cni-container-network-interface)
  * [클러스터 통신 흐름](#24-클러스터-통신-흐름)

3. [Kubernetes 핵심 오브젝트](#3-kubernetes-핵심-오브젝트)

  * [Pod](#31-pod)

    * [Pod 생명주기](#pod-생명주기)
    * [Init 컨테이너](#init-컨테이너)
    * [Probe (Liveness, Readiness, Startup)](#probe-liveness-readiness-startup)
    * [리소스 요청 및 제한](#리소스-요청-및-제한)
  * [Label과 Selector](#32-label과-selector)
  * [Annotation](#33-annotation)
  * [Namespace](#34-namespace)

    * [리소스 쿼터 (ResourceQuota)](#리소스-쿼터-resourcequota)
    * [LimitRange](#limitrange)

4. [Workload 리소스](#4-workload-리소스)

  * [ReplicaSet](#41-replicaset)
  * [Deployment](#42-deployment)

    * [롤링 업데이트](#롤링-업데이트)
    * [업데이트 전략](#업데이트-전략)
    * [Blue-Green 배포](#blue-green-배포)
    * [Canary 배포](#canary-배포)
  * [StatefulSet](#43-statefulset)
  * [DaemonSet](#44-daemonset)
  * [Job](#45-job)
  * [CronJob](#46-cronjob)

5. [Service와 네트워킹](#5-service와-네트워킹)

  * [Service](#51-service)

    * [ClusterIP](#clusterip)
    * [NodePort](#nodeport)
    * [LoadBalancer](#loadbalancer)
    * [ExternalName](#externalname)
    * [Headless Service](#headless-service)
    * [Session Affinity](#session-affinity)
  * [Endpoints](#52-endpoints)
  * [Ingress](#53-ingress)

    * [Ingress Controller](#ingress-controller)
    * [경로 기반 라우팅](#경로-기반-라우팅)
    * [호스트 기반 라우팅](#호스트-기반-라우팅)
    * [TLS/SSL 설정](#tlsssl-설정)
    * [Cert-Manager](#cert-manager)
    * [Ingress Annotations](#ingress-annotations)
  * [NetworkPolicy](#54-networkpolicy)

    * [Ingress 제어](#ingress-제어)
    * [Egress 제어](#egress-제어)
    * [네임스페이스 기반 제어](#네임스페이스-기반-제어)
    * [CIDR 기반 제어](#cidr-기반-제어)

6. [스토리지](#6-스토리지)

  * [Volume](#61-volume)

    * [emptyDir](#emptydir)
    * [hostPath](#hostpath)
    * [configMap](#configmap)
    * [secret](#secret)
  * [PersistentVolume과 PersistentVolumeClaim](#62-persistentvolume과-persistentvolumeclaim)

    * [AccessModes](#accessmodes)
    * [ReclaimPolicy](#reclaimpolicy)
  * [StorageClass](#63-storageclass)

    * [동적 프로비저닝](#동적-프로비저닝)
    * [VolumeBindingMode](#volumebindingmode)
  * [CSI (Container Storage Interface)](#64-csi-container-storage-interface)

7. [ConfigMap과 Secret](#7-configmap과-secret)

  * [ConfigMap](#71-configmap)

    * [ConfigMap 생성 방법](#configmap-생성-방법)
    * [ConfigMap 사용](#configmap-사용)
    * [ConfigMap 업데이트](#configmap-업데이트)
  * [Secret](#72-secret)

    * [Secret 타입](#secret-타입)
    * [Secret 생성](#secret-생성)
    * [Secret 사용](#secret-사용)
    * [Secret 보안 고려사항](#secret-보안-고려사항)

8. [스케줄링](#8-스케줄링)

  * [Node Selector](#81-node-selector)
  * [Affinity와 Anti-Affinity](#82-affinity와-anti-affinity)

    * [Node Affinity](#node-affinity)
    * [Pod Affinity](#pod-affinity)
    * [Pod Anti-Affinity](#pod-anti-affinity)
  * [Taints와 Tolerations](#83-taints와-tolerations)

9. [보안](#9-보안)

  * [ServiceAccount](#91-serviceaccount)
  * [RBAC](#92-rbac)

    * [Role / ClusterRole](#role--clusterrole)
    * [RoleBinding / ClusterRoleBinding](#rolebinding--clusterrolebinding)
  * [SecurityContext](#93-securitycontext)

    * [Pod SecurityContext](#pod-securitycontext)
    * [Container SecurityContext](#container-securitycontext)
  * [Pod Security Standards](#94-pod-security-standards)

    * [Privileged](#privileged)
    * [Baseline](#baseline)
    * [Restricted](#restricted)

10. [모니터링과 로깅](#10-모니터링과-로깅)

  * [Metrics Server](#101-metrics-server)
  * [Horizontal Pod Autoscaler (HPA)](#102-horizontal-pod-autoscaler-hpa)
  * [로깅](#103-로깅)

    * [로그 확인](#로그-확인)
    * [중앙 집중식 로깅 (EFK/ELK)](#중앙-집중식-로깅-efkelk)

11. [고급 스케줄링](#11-고급-스케줄링)

  * [Static Pods](#111-static-pods)
  * [Multiple Schedulers](#112-multiple-schedulers)

    * [Custom Scheduler 배포](#custom-scheduler-배포)
    * [Scheduler Profiles](#scheduler-profiles)
  * [Priority Classes](#113-priority-classes)
  * [Scheduler 플러그인과 확장](#114-scheduler-플러그인과-확장)

12. [Admission Controllers](#12-admission-controllers)

  * [Admission Controllers란?](#121-admission-controllers란)

    * [내장 Admission Controllers](#내장-admission-controllers)
    * [Admission Controllers 활성화/비활성화](#admission-controllers-활성화비활성화)
  * [Validating Admission Webhooks](#122-validating-admission-webhooks)
  * [Mutating Admission Webhooks](#123-mutating-admission-webhooks)

13. [Custom Resources](#13-custom-resources)

  * [Custom Resource Definition (CRD)](#131-custom-resource-definition-crd)

    * [CRD Validation](#crd-validation)
    * [Subresources](#subresources)
  * [Custom Controllers (Operators)](#132-custom-controllers-operators)

    * [Controller 패턴](#controller-패턴)
    * [RBAC 설정](#rbac-설정)
  * [Operator Framework](#133-operator-framework)

    * [Operator 성숙도 레벨](#operator-성숙도-레벨)
    * [Operator SDK](#operator-sdk)

14. [Cluster Maintenance](#14-cluster-maintenance)

  * [OS Upgrades](#141-os-upgrades)

    * [Drain](#drain)
    * [Cordon](#cordon)
    * [Uncordon](#uncordon)
  * [Cluster Upgrade](#142-cluster-upgrade)

    * [업그레이드 전략](#업그레이드-전략)
    * [kubeadm으로 업그레이드](#kubeadm으로-업그레이드)
    * [Worker Node 업그레이드](#worker-node-업그레이드)
  * [Backup and Restore](#143-backup-and-restore)

    * [ETCD 백업](#etcd-백업)
    * [ETCD 복원](#etcd-복원)
    * [Velero](#velero)

15. [Autoscaling](#15-autoscaling)

  * [Vertical Pod Autoscaler (VPA)](#151-vertical-pod-autoscaler-vpa)

    * [VPA 설치](#vpa-설치)
    * [UpdateMode](#updatemode)
    * [HPA vs VPA](#hpa-vs-vpa)
  * [In-Place Resize of Pods](#152-in-place-resize-of-pods)

16. [Gateway API](#16-gateway-api)

  * [Gateway API란?](#161-gateway-api란)

    * [Ingress vs Gateway API](#ingress-vs-gateway-api)
  * [주요 리소스](#162-주요-리소스)

    * [GatewayClass](#gatewayclass)
    * [Gateway](#gateway)
    * [HTTPRoute](#httproute)
  * [고급 라우팅](#163-고급-라우팅)
  * [Cross-Namespace 라우팅](#164-cross-namespace-라우팅)

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

# Part 5: Kubernetes (계속)

## 5. Service와 네트워킹

### 5.1 Service

**Service란?**

Service는 **Pod 집합에 대한 안정적인 네트워크 엔드포인트를 제공**하는 추상화 계층이다.

**왜 Service가 필요한가?**

- Pod는 일시적 (ephemeral)이며 IP가 변경됨
- 여러 Pod에 대한 로드 밸런싱 필요
- 안정적인 DNS 이름 제공
- 내부/외부 트래픽 라우팅

**ClusterIP (기본)**

클러스터 내부에서만 접근 가능한 가상 IP를 할당한다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  type: ClusterIP
  selector:
    app: nginx
  ports:
  - protocol: TCP
    port: 80        # Service 포트
    targetPort: 80  # Pod 포트
```

```bash
# Service 생성
kubectl apply -f service.yaml

# Service 확인
kubectl get svc
kubectl get service

# 상세 정보
kubectl describe svc my-service

# 엔드포인트 확인 (연결된 Pod IP)
kubectl get endpoints my-service

# 클러스터 내부에서 접근
kubectl run test --image=busybox --rm -it -- wget -qO- http://my-service
```

**NodePort**

각 노드의 특정 포트를 통해 외부 접근을 허용한다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-nodeport-service
spec:
  type: NodePort
  selector:
    app: nginx
  ports:
  - protocol: TCP
    port: 80
    targetPort: 80
    nodePort: 30080  # 30000-32767 범위
```

**접근 방법**
- `<NodeIP>:30080`
- 모든 노드에서 접근 가능
- 클러스터 IP로도 여전히 접근 가능

```bash
# NodePort 확인
kubectl get svc my-nodeport-service

# 외부에서 접근
curl http://<node-ip>:30080
```

**LoadBalancer**

클라우드 제공자의 로드 밸런서를 프로비저닝한다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-lb-service
spec:
  type: LoadBalancer
  selector:
    app: nginx
  ports:
  - protocol: TCP
    port: 80
    targetPort: 80
```

**특징**
- AWS ELB, GCP Load Balancer 등 자동 생성
- External IP 할당
- 온프레미스에서는 MetalLB 등 사용

```bash
# LoadBalancer 확인
kubectl get svc my-lb-service

# EXTERNAL-IP 할당 대기
# <pending> → <actual-ip>

# 외부에서 접근
curl http://<external-ip>
```

**ExternalName**

외부 서비스에 대한 CNAME 레코드를 생성한다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: external-service
spec:
  type: ExternalName
  externalName: api.example.com
```

**용도**
- 외부 데이터베이스 참조
- 클라우드 서비스 참조
- 마이그레이션 시 유용

**Headless Service**

ClusterIP를 할당하지 않고 Pod IP를 직접 반환한다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: nginx-headless
spec:
  clusterIP: None  # Headless
  selector:
    app: nginx
  ports:
  - port: 80
```

**용도**
- StatefulSet과 함께 사용
- 각 Pod에 직접 접근 필요 시
- 클라이언트 사이드 로드 밸런싱

```bash
# DNS 조회
nslookup nginx-headless.default.svc.cluster.local
# Pod IP 목록이 반환됨
```

**Session Affinity**

동일한 클라이언트의 요청을 같은 Pod로 라우팅한다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  selector:
    app: nginx
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800  # 3시간
  ports:
  - port: 80
```

### 5.2 Endpoints

**Endpoints란?**

Endpoints는 **Service가 트래픽을 전달할 Pod의 IP 목록**이다.

```bash
# Endpoints 확인
kubectl get endpoints my-service

# Service와 자동 연결됨
# Service의 selector와 일치하는 Pod IP가 자동 추가/제거
```

**수동 Endpoints 생성**

Selector 없는 Service와 함께 수동으로 Endpoints를 생성할 수 있다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: external-db
spec:
  ports:
  - port: 3306

---
apiVersion: v1
kind: Endpoints
metadata:
  name: external-db  # Service와 같은 이름
subsets:
- addresses:
  - ip: 192.168.1.100
  - ip: 192.168.1.101
  ports:
  - port: 3306
```

**용도**
- 외부 데이터베이스 연결
- 레거시 시스템 통합
- 마이그레이션 시나리오

### 5.3 Ingress

**Ingress란?**

Ingress는 **HTTP/HTTPS 트래픽을 클러스터 내부 Service로 라우팅하는 규칙 모음**이다.

**Ingress vs Service LoadBalancer**

| 특성 | LoadBalancer | Ingress |
|------|--------------|---------|
| 비용 | Service마다 LB 필요 | 하나의 LB로 여러 Service |
| 라우팅 | L4 (IP/Port) | L7 (HTTP/Path/Host) |
| TLS | 별도 설정 | 통합 관리 |
| 기능 | 기본적 | 고급 (URL 라우팅, 리다이렉트 등) |

**Ingress Controller**

Ingress 규칙을 실제로 구현하는 컴포넌트이다.

**주요 Ingress Controller**
- **NGINX Ingress Controller** (가장 인기)
- **Traefik**
- **HAProxy Ingress**
- **Kong Ingress**
- **Istio Gateway**
- **AWS ALB Ingress Controller**
- **GCE Ingress Controller**

**NGINX Ingress Controller 설치**

```bash
# Helm으로 설치
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx

# 또는 manifest로 설치
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.0/deploy/static/provider/cloud/deploy.yaml

# 확인
kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx
```

**기본 Ingress**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: simple-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
  - host: example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-service
            port:
              number: 80
```

```bash
# Ingress 생성
kubectl apply -f ingress.yaml

# Ingress 확인
kubectl get ingress
kubectl describe ingress simple-ingress

# 접속
curl http://example.com
```

**경로 기반 라우팅**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: path-based-ingress
spec:
  ingressClassName: nginx
  rules:
  - host: example.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api-service
            port:
              number: 8080
      - path: /web
        pathType: Prefix
        backend:
          service:
            name: web-service
            port:
              number: 80
```

**호스트 기반 라우팅**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: host-based-ingress
spec:
  ingressClassName: nginx
  rules:
  - host: api.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-service
            port:
              number: 8080
  - host: web.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-service
            port:
              number: 80
```

**TLS/SSL 설정**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: tls-secret
type: kubernetes.io/tls
data:
  tls.crt: <base64-encoded-cert>
  tls.key: <base64-encoded-key>

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: tls-ingress
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - example.com
    secretName: tls-secret
  rules:
  - host: example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-service
            port:
              number: 80
```

**Cert-Manager로 자동 인증서 관리**

```bash
# Cert-Manager 설치
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Let's Encrypt Issuer 생성
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: auto-tls-ingress
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - example.com
    secretName: example-tls  # 자동 생성됨
  rules:
  - host: example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-service
            port:
              number: 80
```

**Ingress Annotations**

NGINX Ingress Controller의 유용한 어노테이션:

```yaml
metadata:
  annotations:
    # URL 재작성
    nginx.ingress.kubernetes.io/rewrite-target: /$2
    
    # SSL 리다이렉트
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    
    # 최대 body 크기
    nginx.ingress.kubernetes.io/proxy-body-size: "100m"
    
    # 연결 타임아웃
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "60"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "60"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
    
    # Rate Limiting
    nginx.ingress.kubernetes.io/limit-rps: "10"
    
    # CORS
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/cors-allow-origin: "*"
    
    # Basic Auth
    nginx.ingress.kubernetes.io/auth-type: basic
    nginx.ingress.kubernetes.io/auth-secret: basic-auth
    nginx.ingress.kubernetes.io/auth-realm: "Authentication Required"
    
    # Whitelist
    nginx.ingress.kubernetes.io/whitelist-source-range: "10.0.0.0/8,192.168.0.0/16"
```

### 5.4 NetworkPolicy

**NetworkPolicy란?**

NetworkPolicy는 **Pod 간 네트워크 트래픽을 제어하는 방화벽 규칙**이다.

**기본 동작**
- NetworkPolicy가 없으면 모든 트래픽 허용
- NetworkPolicy가 적용되면 명시된 것만 허용

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all
  namespace: default
spec:
  podSelector: {}  # 모든 Pod
  policyTypes:
  - Ingress
  - Egress
```

**Ingress 제어**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-frontend
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - protocol: TCP
      port: 8080
```

**Egress 제어**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-to-db
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Egress
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: database
    ports:
    - protocol: TCP
      port: 5432
  - to:  # DNS 허용
    - namespaceSelector: {}
      podSelector:
        matchLabels:
          k8s-app: kube-dns
    ports:
    - protocol: UDP
      port: 53
```

**네임스페이스 기반 제어**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-production
  namespace: backend
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          env: production
```

**CIDR 기반 제어**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-external-ip
spec:
  podSelector:
    matchLabels:
      app: web
  policyTypes:
  - Ingress
  ingress:
  - from:
    - ipBlock:
        cidr: 192.168.1.0/24
        except:
        - 192.168.1.100/32
```

**실전 예시: 3-tier 애플리케이션**

```yaml
# Frontend: 외부에서만 접근
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: frontend-policy
spec:
  podSelector:
    matchLabels:
      tier: frontend
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - ipBlock:
        cidr: 0.0.0.0/0
    ports:
    - protocol: TCP
      port: 80
  egress:
  - to:
    - podSelector:
        matchLabels:
          tier: backend
    ports:
    - protocol: TCP
      port: 8080

---
# Backend: Frontend에서만 접근
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-policy
spec:
  podSelector:
    matchLabels:
      tier: backend
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          tier: frontend
    ports:
    - protocol: TCP
      port: 8080
  egress:
  - to:
    - podSelector:
        matchLabels:
          tier: database
    ports:
    - protocol: TCP
      port: 5432

---
# Database: Backend에서만 접근
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: database-policy
spec:
  podSelector:
    matchLabels:
      tier: database
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          tier: backend
    ports:
    - protocol: TCP
      port: 5432
```

---

## 6. 스토리지

### 6.1 Volume

**Volume이란?**

Volume은 **컨테이너에 스토리지를 제공하는 추상화**이다.

**Docker Volume vs Kubernetes Volume**
- Docker: 컨테이너 생명주기에 독립적
- Kubernetes: Pod 생명주기에 종속 (Pod 삭제 시 대부분 삭제)

**emptyDir**

Pod가 생성될 때 빈 디렉토리를 생성한다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: emptydir-pod
spec:
  containers:
  - name: nginx
    image: nginx
    volumeMounts:
    - name: cache
      mountPath: /cache
  - name: sidecar
    image: busybox
    command: ["sleep", "3600"]
    volumeMounts:
    - name: cache
      mountPath: /cache
  volumes:
  - name: cache
    emptyDir: {}
```

**용도**
- 컨테이너 간 파일 공유
- 임시 캐시
- 체크포인트

**특징**
- Pod 삭제 시 데이터 손실
- 노드의 디스크 또는 메모리 사용

**메모리 기반 emptyDir**

```yaml
volumes:
- name: cache
  emptyDir:
    medium: Memory
    sizeLimit: 1Gi
```

**hostPath**

노드의 파일시스템을 마운트한다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: hostpath-pod
spec:
  containers:
  - name: nginx
    image: nginx
    volumeMounts:
    - name: data
      mountPath: /data
  volumes:
  - name: hostPath
    hostPath:
      path: /mnt/data
      type: Directory
```

**hostPath 타입**
- `DirectoryOrCreate`: 없으면 생성
- `Directory`: 디렉토리만
- `FileOrCreate`: 파일 없으면 생성
- `File`: 파일만
- `Socket`: Unix 소켓
- `CharDevice`: 문자 디바이스
- `BlockDevice`: 블록 디바이스

**용도**
- 노드 로그 접근
- Docker 소켓 접근
- 단일 노드 클러스터

**주의**
- Pod가 다른 노드로 이동 시 데이터 접근 불가
- 보안 위험 (노드 파일시스템 접근)

**configMap**

ConfigMap을 볼륨으로 마운트한다.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  config.json: |
    {
      "env": "production",
      "debug": false
    }

---
apiVersion: v1
kind: Pod
metadata:
  name: configmap-pod
spec:
  containers:
  - name: app
    image: myapp
    volumeMounts:
    - name: config
      mountPath: /etc/config
  volumes:
  - name: config
    configMap:
      name: app-config
```

**secret**

Secret을 볼륨으로 마운트한다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secret-pod
spec:
  containers:
  - name: app
    image: myapp
    volumeMounts:
    - name: secrets
      mountPath: /etc/secrets
      readOnly: true
  volumes:
  - name: secrets
    secret:
      secretName: db-credentials
```

### 6.2 PersistentVolume과 PersistentVolumeClaim

**PersistentVolume (PV)**

클러스터 관리자가 프로비저닝한 **스토리지 리소스**이다.

**PersistentVolumeClaim (PVC)**

사용자가 요청하는 **스토리지 요구사항**이다.

**관계**
- PV: 실제 스토리지 (공급)
- PVC: 스토리지 요청 (수요)
- PVC가 PV를 바인딩하여 사용

**PersistentVolume 생성**

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-nfs
spec:
  capacity:
    storage: 10Gi
  accessModes:
  - ReadWriteMany
  persistentVolumeReclaimPolicy: Retain
  storageClassName: nfs
  nfs:
    server: nfs-server.example.com
    path: /exported/path
```

**AccessModes**
- **ReadWriteOnce (RWO)**: 단일 노드에서 읽기/쓰기
- **ReadOnlyMany (ROX)**: 여러 노드에서 읽기 전용
- **ReadWriteMany (RWX)**: 여러 노드에서 읽기/쓰기
- **ReadWriteOncePod (RWOP)**: 단일 Pod만 읽기/쓰기 (K8s 1.22+)

**ReclaimPolicy**
- **Retain**: PVC 삭제 후에도 PV 유지 (수동 정리)
- **Delete**: PVC 삭제 시 PV와 스토리지 모두 삭제
- **Recycle** (deprecated): PV를 재사용 가능하도록 데이터 삭제

**PersistentVolumeClaim 생성**

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pvc-nfs
spec:
  accessModes:
  - ReadWriteMany
  resources:
    requests:
      storage: 5Gi
  storageClassName: nfs
```

**Pod에서 PVC 사용**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: pvc-pod
spec:
  containers:
  - name: nginx
    image: nginx
    volumeMounts:
    - name: data
      mountPath: /usr/share/nginx/html
  volumes:
  - name: data
    persistentVolumeClaim:
      claimName: pvc-nfs
```

```bash
# PV 확인
kubectl get pv

# PVC 확인
kubectl get pvc

# 바인딩 상태
# PV: Available → Bound
# PVC: Pending → Bound

# PVC 삭제
kubectl delete pvc pvc-nfs

# PV의 ReclaimPolicy에 따라 처리
```

### 6.3 StorageClass

**StorageClass란?**

StorageClass는 **동적 프로비저닝을 위한 스토리지 템플릿**이다.

**정적 vs 동적 프로비저닝**

**정적 프로비저닝**
- 관리자가 PV를 미리 생성
- PVC가 기존 PV와 매칭
- 수동 작업 필요

**동적 프로비저닝**
- PVC 생성 시 자동으로 PV 생성
- StorageClass가 프로비저닝 담당
- 자동화

**StorageClass 예시**

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: kubernetes.io/aws-ebs
parameters:
  type: gp3
  iopsPerGB: "10"
  fsType: ext4
reclaimPolicy: Delete
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
```

**주요 Provisioner**
- `kubernetes.io/aws-ebs`: AWS EBS
- `kubernetes.io/gce-pd`: GCE Persistent Disk
- `kubernetes.io/azure-disk`: Azure Disk
- `kubernetes.io/cinder`: OpenStack Cinder
- `kubernetes.io/nfs`: NFS
- `csi-driver.name`: CSI 드라이버

**VolumeBindingMode**
- **Immediate**: PVC 생성 즉시 프로비저닝
- **WaitForFirstConsumer**: Pod가 생성될 때 프로비저닝 (토폴로지 고려)

**동적 프로비저닝 사용**

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: dynamic-pvc
spec:
  accessModes:
  - ReadWriteOnce
  storageClassName: fast-ssd
  resources:
    requests:
      storage: 10Gi
```

```bash
# PVC 생성
kubectl apply -f pvc.yaml

# 자동으로 PV 생성됨
kubectl get pv

# Pod에서 사용
kubectl apply -f pod.yaml
```

**기본 StorageClass 설정**

```bash
# 기본 StorageClass로 지정
kubectl patch storageclass fast-ssd \
  -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'

# PVC에서 storageClassName 생략 시 기본 사용
```

### 6.4 CSI (Container Storage Interface)

**CSI란?**

CSI는 **Kubernetes와 스토리지 시스템 간의 표준 인터페이스**이다.

**왜 CSI인가?**

- 이전: 각 스토리지를 Kubernetes에 내장 (in-tree)
- 문제: Kubernetes 릴리스에 종속, 유지보수 어려움
- CSI: 스토리지 드라이버를 플러그인으로 분리

**주요 CSI 드라이버**
- **AWS EBS CSI Driver**
- **GCE PD CSI Driver**
- **Azure Disk CSI Driver**
- **Ceph CSI**
- **Longhorn**
- **OpenEBS**
- **Rook**

**CSI 드라이버 설치 예시 (AWS EBS)**

```bash
# Helm으로 설치
helm repo add aws-ebs-csi-driver https://kubernetes-sigs.github.io/aws-ebs-csi-driver
helm repo update
helm install aws-ebs-csi-driver aws-ebs-csi-driver/aws-ebs-csi-driver \
  --namespace kube-system

# StorageClass 생성
cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ebs-sc
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
parameters:
  type: gp3
EOF
```

---

## 7. ConfigMap과 Secret

### 7.1 ConfigMap

**ConfigMap이란?**

ConfigMap은 **설정 데이터를 키-값 쌍으로 저장**하는 오브젝트이다.

**ConfigMap 생성 방법**

**리터럴 값**

```bash
kubectl create configmap app-config \
  --from-literal=APP_ENV=production \
  --from-literal=LOG_LEVEL=info
```

**파일에서**

```bash
# config.properties 파일
echo "database.host=db.example.com" > config.properties
echo "database.port=5432" >> config.properties

kubectl create configmap app-config --from-file=config.properties
```

**디렉토리에서**

```bash
# config/ 디렉토리의 모든 파일
kubectl create configmap app-config --from-file=config/
```

**YAML로 생성**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  APP_ENV: production
  LOG_LEVEL: info
  config.properties: |
    database.host=db.example.com
    database.port=5432
```

**ConfigMap 사용**

**환경 변수로**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: configmap-env-pod
spec:
  containers:
  - name: app
    image: myapp
    env:
    - name: APP_ENV
      valueFrom:
        configMapKeyRef:
          name: app-config
          key: APP_ENV
    - name: LOG_LEVEL
      valueFrom:
        configMapKeyRef:
          name: app-config
          key: LOG_LEVEL
```

**모든 키를 환경 변수로**

```yaml
spec:
  containers:
  - name: app
    image: myapp
    envFrom:
    - configMapRef:
        name: app-config
```

**볼륨으로**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: configmap-volume-pod
spec:
  containers:
  - name: app
    image: myapp
    volumeMounts:
    - name: config
      mountPath: /etc/config
  volumes:
  - name: config
    configMap:
      name: app-config
```

**특정 키만 볼륨으로**

```yaml
volumes:
- name: config
  configMap:
    name: app-config
    items:
    - key: config.properties
      path: app.properties
```

**ConfigMap 업데이트**

```bash
# ConfigMap 수정
kubectl edit configmap app-config

# 또는 파일 업데이트
kubectl create configmap app-config \
  --from-file=config.properties \
  --dry-run=client -o yaml | kubectl apply -f -
```

**주의**
- 환경 변수로 사용 시: Pod 재시작 필요
- 볼륨으로 사용 시: 자동 업데이트됨 (수 분 소요)

### 7.2 Secret

**Secret이란?**

Secret은 **민감한 데이터를 안전하게 저장**하는 오브젝트이다.

**ConfigMap vs Secret**
- ConfigMap: 일반 설정 데이터
- Secret: 비밀번호, 토큰, 키 등

**Secret 타입**
- **Opaque**: 일반 Secret (기본값)
- **kubernetes.io/tls**: TLS 인증서
- **kubernetes.io/dockerconfigjson**: Docker 레지스트리 인증
- **kubernetes.io/basic-auth**: Basic 인증
- **kubernetes.io/ssh-auth**: SSH 인증
- **kubernetes.io/service-account-token**: ServiceAccount 토큰

**Secret 생성**

**리터럴 값**

```bash
kubectl create secret generic db-credentials \
  --from-literal=username=admin \
  --from-literal=password=secret123
```

**파일에서**

```bash
echo -n 'admin' > username.txt
echo -n 'secret123' > password.txt

kubectl create secret generic db-credentials \
  --from-file=username=username.txt \
  --from-file=password=password.txt
```

**YAML로 생성 (Base64 인코딩)**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
type: Opaque
data:
  username: YWRtaW4=     # base64("admin")
  password: c2VjcmV0MTIz  # base64("secret123")
```

```bash
# Base64 인코딩
echo -n 'admin' | base64

# Base64 디코딩
echo 'YWRtaW4=' | base64 --decode
```

**stringData 사용 (인코딩 불필요)**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
type: Opaque
stringData:
  username: admin
  password: secret123
```

**Secret 사용**

**환경 변수로**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secret-env-pod
spec:
  containers:
  - name: app
    image: myapp
    env:
    - name: DB_USERNAME
      valueFrom:
        secretKeyRef:
          name: db-credentials
          key: username
    - name: DB_PASSWORD
      valueFrom:
        secretKeyRef:
          name: db-credentials
          key: password
```

**볼륨으로**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secret-volume-pod
spec:
  containers:
  - name: app
    image: myapp
    volumeMounts:
    - name: secrets
      mountPath: /etc/secrets
      readOnly: true
  volumes:
  - name: secrets
    secret:
      secretName: db-credentials
```

**TLS Secret**

```bash
# TLS Secret 생성
kubectl create secret tls tls-secret \
  --cert=path/to/tls.crt \
  --key=path/to/tls.key
```

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: tls-secret
type: kubernetes.io/tls
data:
  tls.crt: <base64-encoded-cert>
  tls.key: <base64-encoded-key>
```

**Docker 레지스트리 Secret**

```bash
kubectl create secret docker-registry regcred \
  --docker-server=myregistry.com \
  --docker-username=user \
  --docker-password=password \
  --docker-email=user@example.com
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: private-image-pod
spec:
  containers:
  - name: app
    image: myregistry.com/myapp:latest
  imagePullSecrets:
  - name: regcred
```

**Secret 보안 고려사항**

**etcd 암호화**

Secret은 기본적으로 etcd에 평문으로 저장된다. 암호화 활성화 권장:

```yaml
# /etc/kubernetes/enc/encryption-config.yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
- resources:
  - secrets
  providers:
  - aescbc:
      keys:
      - name: key1
        secret: <base64-encoded-32-byte-key>
  - identity: {}
```

**RBAC 제한**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: secret-reader
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list"]
```

**외부 Secret 관리**
- **HashiCorp Vault**
- **AWS Secrets Manager**
- **Azure Key Vault**
- **External Secrets Operator**

---

## 8. 스케줄링

### 8.1 Node Selector

**Node Selector란?**

Node Selector는 **특정 Label을 가진 노드에 Pod를 스케줄링**하는 간단한 방법이다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: gpu-pod
spec:
  nodeSelector:
    gpu: "true"
    disktype: ssd
  containers:
  - name: app
    image: myapp
```

```bash
# 노드에 Label 추가
kubectl label nodes node1 gpu=true
kubectl label nodes node1 disktype=ssd

# Label 확인
kubectl get nodes --show-labels
```

**제한사항**
- AND 조건만 가능 (모든 Label이 일치해야 함)
- OR, NOT 등 복잡한 조건 불가

### 8.2 Affinity와 Anti-Affinity

**Node Affinity**

Node Selector보다 유연한 노드 선택 메커니즘이다.

**requiredDuringSchedulingIgnoredDuringExecution**

하드 제약 조건 (반드시 만족해야 함):

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: affinity-pod
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
        - matchExpressions:
          - key: gpu
            operator: In
            values:
            - "true"
          - key: zone
            operator: In
            values:
            - us-west-1a
            - us-west-1b
  containers:
  - name: app
    image: myapp
```

**preferredDuringSchedulingIgnoredDuringExecution**

소프트 제약 조건 (선호하지만 필수 아님):

```yaml
spec:
  affinity:
    nodeAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 1
        preference:
          matchExpressions:
          - key: disktype
            operator: In
            values:
            - ssd
      - weight: 50
        preference:
          matchExpressions:
          - key: zone
            operator: In
            values:
            - us-west-1a
```

**Operator**
- `In`: 값이 목록에 포함
- `NotIn`: 값이 목록에 없음
- `Exists`: 키가 존재
- `DoesNotExist`: 키가 없음
- `Gt`: 값이 더 큼
- `Lt`: 값이 더 작음

**Pod Affinity**

다른 Pod와의 관계를 기반으로 스케줄링한다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: with-pod-affinity
spec:
  affinity:
    podAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchExpressions:
          - key: app
            operator: In
            values:
            - cache
        topologyKey: kubernetes.io/hostname
  containers:
  - name: app
    image: myapp
```

**용도**
- 웹 서버와 캐시를 같은 노드에 배치
- 데이터 지역성 최적화

**Pod Anti-Affinity**

다른 Pod와 분리하여 스케줄링한다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: with-pod-anti-affinity
spec:
  affinity:
    podAntiAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchExpressions:
          - key: app
            operator: In
            values:
            - web
        topologyKey: kubernetes.io/hostname
  containers:
  - name: app
    image: myapp
```

**용도**
- 고가용성 (같은 애플리케이션의 Pod를 다른 노드에 분산)
- 리소스 경합 방지

**topologyKey**

Pod를 그룹화하는 노드 Label 키:
- `kubernetes.io/hostname`: 노드별
- `topology.kubernetes.io/zone`: 가용 영역별
- `topology.kubernetes.io/region`: 리전별

### 8.3 Taints와 Tolerations

**Taints**

노드에 설정하여 **특정 Pod만 스케줄링되도록 제한**한다.

```bash
# Taint 추가
kubectl taint nodes node1 key=value:NoSchedule

# Taint 제거
kubectl taint nodes node1 key=value:NoSchedule-

# 노드의 Taint 확인
kubectl describe node node1 | grep Taint
```

**Effect**
- **NoSchedule**: 새 Pod 스케줄링 차단 (기존 Pod는 유지)
- **PreferNoSchedule**: 가능하면 스케줄링하지 않음 (소프트)
- **NoExecute**: 새 Pod 차단 + 기존 Pod 축출

**Tolerations**

Pod에 설정하여 **Taint를 허용**한다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: toleration-pod
spec:
  tolerations:
  - key: "key"
    operator: "Equal"
    value: "value"
    effect: "NoSchedule"
  containers:
  - name: app
    image: myapp
```

**Operator**
- `Equal`: key=value 정확히 일치
- `Exists`: key만 일치 (value 무시)

**모든 Taint 허용**

```yaml
tolerations:
- operator: "Exists"
```

**실전 예시: GPU 노드 전용**

```bash
# GPU 노드에 Taint 추가
kubectl taint nodes gpu-node1 nvidia.com/gpu=true:NoSchedule

# GPU Pod만 Toleration 설정
apiVersion: v1
kind: Pod
metadata:
  name: gpu-pod
spec:
  tolerations:
  - key: "nvidia.com/gpu"
    operator: "Equal"
    value: "true"
    effect: "NoSchedule"
  nodeSelector:
    gpu: "true"
  containers:
  - name: tensorflow
    image: tensorflow/tensorflow:latest-gpu
```

**마스터 노드 Taint**

```bash
# 마스터 노드는 기본적으로 Taint 있음
kubectl describe node master | grep Taint
# Taints: node-role.kubernetes.io/master:NoSchedule

# 마스터에도 Pod 스케줄링하려면
tolerations:
- key: "node-role.kubernetes.io/master"
  effect: "NoSchedule"
```

---

## 9. 보안

### 9.1 ServiceAccount

**ServiceAccount란?**

ServiceAccount는 **Pod가 Kubernetes API에 접근할 때 사용하는 계정**이다.

**기본 동작**
- 각 네임스페이스에 `default` ServiceAccount 자동 생성
- Pod는 기본적으로 default ServiceAccount 사용
- ServiceAccount 토큰이 자동으로 마운트됨

```bash
# ServiceAccount 목록
kubectl get serviceaccounts
kubectl get sa

# default ServiceAccount 확인
kubectl describe sa default
```

**ServiceAccount 생성**

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: myapp-sa
  namespace: default
```

```bash
kubectl apply -f serviceaccount.yaml
```

**Pod에서 ServiceAccount 사용**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: myapp-pod
spec:
  serviceAccountName: myapp-sa
  containers:
  - name: app
    image: myapp
```

**ServiceAccount 토큰**

```bash
# 토큰 확인 (Kubernetes 1.24 이전)
kubectl get secret

# 토큰 확인 (Kubernetes 1.24+)
kubectl create token myapp-sa

# Pod 내부에서 토큰 위치
# /var/run/secrets/kubernetes.io/serviceaccount/token
```

**자동 마운트 비활성화**

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: no-token-sa
automountServiceAccountToken: false
```

### 9.2 RBAC (Role-Based Access Control)

**RBAC란?**

RBAC는 **역할 기반으로 리소스 접근을 제어**하는 인가 메커니즘이다.

**RBAC 구성 요소**

**Role / ClusterRole**
- **Role**: 네임스페이스 범위
- **ClusterRole**: 클러스터 범위

**RoleBinding / ClusterRoleBinding**
- 사용자/그룹/ServiceAccount를 Role에 바인딩

**Role 생성**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: default
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list", "watch"]
```

**RoleBinding 생성**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods
  namespace: default
subjects:
- kind: ServiceAccount
  name: myapp-sa
  namespace: default
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

**ClusterRole 생성**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: node-reader
rules:
- apiGroups: [""]
  resources: ["nodes"]
  verbs: ["get", "list", "watch"]
```

**ClusterRoleBinding 생성**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: read-nodes-global
subjects:
- kind: ServiceAccount
  name: myapp-sa
  namespace: default
roleRef:
  kind: ClusterRole
  name: node-reader
  apiGroup: rbac.authorization.k8s.io
```

**주요 Verbs**
- `get`: 개별 리소스 조회
- `list`: 리소스 목록 조회
- `watch`: 리소스 변경 감시
- `create`: 리소스 생성
- `update`: 리소스 업데이트
- `patch`: 리소스 패치
- `delete`: 리소스 삭제
- `deletecollection`: 여러 리소스 삭제

**실전 예시: Deployment 관리 권한**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: deployment-manager
  namespace: production
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
- apiGroups: [""]
  resources: ["pods", "pods/log"]
  verbs: ["get", "list", "watch"]
```

**권한 확인**

```bash
# 현재 사용자의 권한 확인
kubectl auth can-i get pods
kubectl auth can-i create deployments

# 다른 ServiceAccount의 권한 확인
kubectl auth can-i get pods --as=system:serviceaccount:default:myapp-sa
```

### 9.3 SecurityContext

**SecurityContext란?**

SecurityContext는 **Pod 및 컨테이너의 보안 설정을 정의**한다.

**Pod SecurityContext**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: security-context-pod
spec:
  securityContext:
    runAsUser: 1000
    runAsGroup: 3000
    fsGroup: 2000
  containers:
  - name: app
    image: myapp
```

**Container SecurityContext**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: container-security-context
spec:
  containers:
  - name: app
    image: myapp
    securityContext:
      runAsNonRoot: true
      runAsUser: 1000
      readOnlyRootFilesystem: true
      allowPrivilegeEscalation: false
      capabilities:
        drop:
        - ALL
        add:
        - NET_BIND_SERVICE
```

**주요 필드**

**runAsUser / runAsGroup**
- 컨테이너를 실행할 UID/GID 지정

**fsGroup**
- 볼륨의 그룹 소유권 설정

**runAsNonRoot**
- root(UID 0)로 실행 차단

**readOnlyRootFilesystem**
- 루트 파일시스템을 읽기 전용으로

**allowPrivilegeEscalation**
- 권한 상승 허용 여부

**capabilities**
- Linux Capabilities 추가/제거

**실전 예시: 최소 권한 Pod**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-pod
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 10001
    fsGroup: 10001
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: app
    image: myapp
    securityContext:
      readOnlyRootFilesystem: true
      allowPrivilegeEscalation: false
      capabilities:
        drop:
        - ALL
    volumeMounts:
    - name: tmp
      mountPath: /tmp
    - name: cache
      mountPath: /app/cache
  volumes:
  - name: tmp
    emptyDir: {}
  - name: cache
    emptyDir: {}
```

### 9.4 Pod Security Standards

**Pod Security Standards란?**

Kubernetes 1.25부터 PodSecurityPolicy를 대체하는 **내장 보안 표준**이다.

**세 가지 수준**

**Privileged**
- 제한 없음
- 신뢰할 수 있는 워크로드

**Baseline**
- 최소한의 제한
- 알려진 권한 상승 차단

**Restricted**
- 강력한 제한
- 보안 모범 사례 강제

**네임스페이스에 적용**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: secure-namespace
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

**모드**
- **enforce**: 정책 위반 시 Pod 생성 차단
- **audit**: 위반 사항 감사 로그 기록
- **warn**: 사용자에게 경고 메시지

```bash
# 네임스페이스 생성
kubectl create namespace secure-namespace

# Label 추가
kubectl label namespace secure-namespace \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/audit=restricted \
  pod-security.kubernetes.io/warn=restricted
```

---

## 10. 모니터링과 로깅

### 10.1 Metrics Server

**Metrics Server 설치**

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# 확인
kubectl get deployment metrics-server -n kube-system
```

**리소스 사용량 확인**

```bash
# 노드 리소스 사용량
kubectl top nodes

# Pod 리소스 사용량
kubectl top pods

# 특정 네임스페이스
kubectl top pods -n kube-system

# 컨테이너별
kubectl top pods --containers
```

### 10.2 Horizontal Pod Autoscaler (HPA)

**HPA란?**

HPA는 **CPU/메모리 사용률에 따라 Pod 수를 자동으로 조정**한다.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

```bash
# HPA 생성 (명령어)
kubectl autoscale deployment myapp --cpu-percent=70 --min=2 --max=10

# HPA 확인
kubectl get hpa

# 상세 정보
kubectl describe hpa myapp-hpa
```

**동작 원리**
1. Metrics Server에서 메트릭 수집
2. 평균 사용률 계산
3. 목표 사용률과 비교
4. 필요 시 Pod 수 조정

### 10.3 로깅

**로그 확인**

```bash
# Pod 로그
kubectl logs <pod-name>

# 특정 컨테이너
kubectl logs <pod-name> -c <container-name>

# 실시간 로그
kubectl logs -f <pod-name>

# 이전 컨테이너 로그 (재시작된 경우)
kubectl logs <pod-name> --previous

# 타임스탬프 포함
kubectl logs <pod-name> --timestamps

# 최근 N줄
kubectl logs <pod-name> --tail=100
```

**중앙 집중식 로깅**

일반적으로 EFK/ELK 스택을 사용한다:
- **Elasticsearch**: 로그 저장 및 검색
- **Fluentd/Filebeat**: 로그 수집
- **Kibana**: 로그 시각화

**Fluentd DaemonSet 예시**

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
      serviceAccountName: fluentd
      tolerations:
      - key: node-role.kubernetes.io/master
        effect: NoSchedule
      containers:
      - name: fluentd
        image: fluent/fluentd-kubernetes-daemonset:v1-debian-elasticsearch
        env:
        - name: FLUENT_ELASTICSEARCH_HOST
          value: "elasticsearch.logging"
        - name: FLUENT_ELASTICSEARCH_PORT
          value: "9200"
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

---

제공하신 CKA 커리큘럼과 제가 작성한 내용을 비교한 결과, 다음 개념들이 누락되어 있습니다. Part 5에 추가하겠습니다.

---

# Part 5: Kubernetes (추가 내용)

## 11. 고급 스케줄링

### 11.1 Static Pods

**Static Pods란?**

Static Pods는 **Kubelet이 직접 관리하는 Pod**로, API Server를 거치지 않습니다.

**특징**
- API Server 없이도 실행 가능
- `/etc/kubernetes/manifests/` 디렉토리의 YAML 파일을 읽어 자동 실행
- Kubelet이 직접 모니터링 및 재시작
- Control Plane 컴포넌트 (API Server, Scheduler, Controller Manager, etcd)가 Static Pods로 실행됨

**Static Pod 경로 확인**

```bash
# Kubelet 설정에서 Static Pod 경로 확인
ps aux | grep kubelet | grep staticPodPath

# 또는 Kubelet 설정 파일 확인
cat /var/lib/kubelet/config.yaml | grep staticPodPath
# staticPodPath: /etc/kubernetes/manifests
```

**Static Pod 생성**

```yaml
# /etc/kubernetes/manifests/static-web.yaml
apiVersion: v1
kind: Pod
metadata:
  name: static-web
  labels:
    role: myrole
spec:
  containers:
  - name: web
    image: nginx
    ports:
    - name: web
      containerPort: 80
      protocol: TCP
```

**특징**
- 파일을 `/etc/kubernetes/manifests/`에 저장하면 자동으로 Pod 생성
- 파일을 삭제하면 자동으로 Pod 삭제
- API Server에서는 읽기 전용 Mirror Pod로 보임
- `kubectl delete`로 삭제 불가 (파일을 삭제해야 함)

**Static Pod vs DaemonSet**

| 특성 | Static Pod | DaemonSet |
|------|-----------|-----------|
| 관리자 | Kubelet | Kube-Scheduler |
| API Server 필요 | 아니오 | 예 |
| 용도 | Control Plane 컴포넌트 | 노드별 에이전트 |
| 삭제 방법 | 파일 삭제 | kubectl delete |

**사용 사례**
- Control Plane 컴포넌트 실행
- 노드 부팅 시 필수 서비스
- API Server 장애 시에도 실행되어야 하는 Pod

```bash
# Static Pod 확인
kubectl get pods -A | grep <node-name>

# Control Plane Static Pod 확인
ls /etc/kubernetes/manifests/
# etcd.yaml
# kube-apiserver.yaml
# kube-controller-manager.yaml
# kube-scheduler.yaml
```

### 11.2 Multiple Schedulers

**Multiple Schedulers란?**

Kubernetes는 **여러 개의 스케줄러를 동시에 실행**할 수 있습니다.

**왜 필요한가?**
- 특정 워크로드에 맞춤형 스케줄링 로직 적용
- 기본 스케줄러와 다른 우선순위 사용
- 특수한 하드웨어(GPU, FPGA)에 대한 스케줄링

**Custom Scheduler 배포**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-custom-scheduler
  namespace: kube-system
spec:
  containers:
  - name: kube-scheduler
    image: k8s.gcr.io/kube-scheduler:v1.28.0
    command:
    - kube-scheduler
    - --config=/etc/kubernetes/my-scheduler-config.yaml
    - --scheduler-name=my-custom-scheduler
    volumeMounts:
    - name: config
      mountPath: /etc/kubernetes
  volumes:
  - name: config
    configMap:
      name: my-scheduler-config
```

**Pod에서 Custom Scheduler 사용**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx-custom
spec:
  schedulerName: my-custom-scheduler
  containers:
  - name: nginx
    image: nginx
```

```bash
# 스케줄러 확인
kubectl get pods -n kube-system | grep scheduler

# Pod가 어떤 스케줄러를 사용했는지 확인
kubectl get events --sort-by=.metadata.creationTimestamp
```

**Scheduler Profiles (Kubernetes 1.18+)**

여러 스케줄링 정책을 하나의 스케줄러에서 관리:

```yaml
apiVersion: kubescheduler.config.k8s.io/v1
kind: KubeSchedulerConfiguration
profiles:
- schedulerName: default-scheduler
  plugins:
    score:
      enabled:
      - name: NodeResourcesFit
      - name: ImageLocality
- schedulerName: custom-scheduler
  plugins:
    preFilter:
      enabled:
      - name: NodeResourcesFit
    filter:
      enabled:
      - name: NodeAffinity
```

### 11.3 Priority Classes

**Priority Classes란?**

Priority Classes는 **Pod의 우선순위를 정의**하여 리소스 부족 시 어떤 Pod를 먼저 evict할지 결정합니다.

**PriorityClass 생성**

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: high-priority
value: 1000000
globalDefault: false
description: "This priority class should be used for critical service pods only."
```

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: low-priority
value: 100
globalDefault: false
description: "This priority class should be used for non-critical pods."
```

**Pod에서 PriorityClass 사용**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: critical-pod
spec:
  priorityClassName: high-priority
  containers:
  - name: nginx
    image: nginx
```

**동작 원리**

1. 리소스 부족으로 Pod를 스케줄링할 수 없을 때
2. Scheduler가 우선순위가 낮은 Pod를 찾음
3. 낮은 우선순위 Pod를 Preempt (축출)
4. 높은 우선순위 Pod를 스케줄링

```bash
# PriorityClass 확인
kubectl get priorityclasses

# 기본 PriorityClass
# system-cluster-critical: 2000000000
# system-node-critical: 2000001000
```

**주의사항**
- 너무 높은 우선순위 남용 금지
- System PriorityClass보다 높게 설정 금지
- 리소스 쿼터와 함께 사용 권장

### 11.4 Scheduler 플러그인과 확장

**Scheduling Framework**

Kubernetes Scheduler는 플러그인 아키텍처를 사용합니다.

**Extension Points**
- **PreFilter**: 필터링 전 사전 처리
- **Filter**: 조건에 맞지 않는 노드 제거
- **PostFilter**: 필터 후 처리
- **PreScore**: 스코어링 전 사전 처리
- **Score**: 노드에 점수 부여
- **Reserve**: 리소스 예약
- **Permit**: 승인 또는 거부
- **PreBind**: 바인딩 전 작업
- **Bind**: Pod를 노드에 바인딩
- **PostBind**: 바인딩 후 작업

**Scheduler Configuration**

```yaml
apiVersion: kubescheduler.config.k8s.io/v1
kind: KubeSchedulerConfiguration
profiles:
- schedulerName: default-scheduler
  plugins:
    preFilter:
      enabled:
      - name: NodeResourcesFit
    filter:
      enabled:
      - name: NodeResourcesFit
      - name: NodeAffinity
      - name: PodTopologySpread
      disabled:
      - name: TaintToleration
    score:
      enabled:
      - name: NodeResourcesBalancedAllocation
        weight: 1
      - name: ImageLocality
        weight: 2
```

---

## 12. Admission Controllers

### 12.1 Admission Controllers란?

**Admission Controllers의 역할**

Admission Controllers는 **API 요청을 가로채서 검증 또는 수정**하는 플러그인입니다.

**실행 순서**
1. 인증 (Authentication)
2. 인가 (Authorization - RBAC)
3. **Admission Control**
  - Mutating Admission
  - Validating Admission
4. 객체 저장 (etcd)

**내장 Admission Controllers**

```bash
# 활성화된 Admission Controllers 확인
kube-apiserver -h | grep enable-admission-plugins

# 일반적으로 활성화된 것들:
# - NamespaceLifecycle
# - LimitRanger
# - ServiceAccount
# - DefaultStorageClass
# - ResourceQuota
# - PodSecurityPolicy (deprecated)
# - PodSecurity (1.25+)
```

**Admission Controllers 활성화/비활성화**

```bash
# kube-apiserver 설정 파일 수정
# /etc/kubernetes/manifests/kube-apiserver.yaml

spec:
  containers:
  - command:
    - kube-apiserver
    - --enable-admission-plugins=NodeRestriction,NamespaceLifecycle
    - --disable-admission-plugins=DefaultStorageClass
```

**주요 Admission Controllers**

**NamespaceLifecycle**
- 존재하지 않는 네임스페이스에 객체 생성 차단
- 삭제 중인 네임스페이스에 새 객체 생성 차단

**LimitRanger**
- LimitRange 정책 적용
- 리소스 요청/제한 기본값 설정

**ResourceQuota**
- 네임스페이스별 리소스 쿼터 적용

**ServiceAccount**
- 자동으로 ServiceAccount 할당
- 토큰 자동 마운트

**DefaultStorageClass**
- PVC에 기본 StorageClass 할당

**PodSecurity** (1.25+)
- Pod Security Standards 적용
- PodSecurityPolicy 대체

### 12.2 Validating Admission Webhooks

**Validating Admission Webhooks란?**

외부 서비스를 호출하여 **요청을 검증**하는 동적 Admission Controller입니다.

**ValidatingWebhookConfiguration 생성**

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingWebhookConfiguration
metadata:
  name: pod-policy.example.com
webhooks:
- name: pod-policy.example.com
  clientConfig:
    service:
      name: webhook-service
      namespace: webhook-demo
      path: "/validate"
    caBundle: <base64-encoded-ca-cert>
  rules:
  - operations: ["CREATE", "UPDATE"]
    apiGroups: [""]
    apiVersions: ["v1"]
    resources: ["pods"]
  admissionReviewVersions: ["v1"]
  sideEffects: None
  timeoutSeconds: 5
  failurePolicy: Fail
```

**Webhook 서버 예시 (Python)**

```python
from flask import Flask, request, jsonify
import base64

app = Flask(__name__)

@app.route('/validate', methods=['POST'])
def validate():
    admission_review = request.json
    
    # Pod 객체 추출
    pod = admission_review['request']['object']
    
    # 검증 로직
    allowed = True
    message = ""
    
    # 예: latest 태그 사용 금지
    for container in pod['spec']['containers']:
        if container['image'].endswith(':latest'):
            allowed = False
            message = "Using 'latest' tag is not allowed"
            break
    
    # 응답
    response = {
        "apiVersion": "admission.k8s.io/v1",
        "kind": "AdmissionReview",
        "response": {
            "uid": admission_review['request']['uid'],
            "allowed": allowed,
            "status": {
                "message": message
            }
        }
    }
    
    return jsonify(response)
```

**Webhook 배포**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: webhook-service
  namespace: webhook-demo
spec:
  selector:
    app: webhook
  ports:
  - port: 443
    targetPort: 8443

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webhook
  namespace: webhook-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: webhook
  template:
    metadata:
      labels:
        app: webhook
    spec:
      containers:
      - name: webhook
        image: mywebhook:latest
        ports:
        - containerPort: 8443
```

### 12.3 Mutating Admission Webhooks

**Mutating Admission Webhooks란?**

외부 서비스를 호출하여 **요청을 수정**하는 동적 Admission Controller입니다.

**MutatingWebhookConfiguration 생성**

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: MutatingWebhookConfiguration
metadata:
  name: pod-mutator.example.com
webhooks:
- name: pod-mutator.example.com
  clientConfig:
    service:
      name: webhook-service
      namespace: webhook-demo
      path: "/mutate"
    caBundle: <base64-encoded-ca-cert>
  rules:
  - operations: ["CREATE"]
    apiGroups: [""]
    apiVersions: ["v1"]
    resources: ["pods"]
  admissionReviewVersions: ["v1"]
  sideEffects: None
  failurePolicy: Fail
```

**Webhook 서버 예시 (자동 리소스 제한 추가)**

```python
@app.route('/mutate', methods=['POST'])
def mutate():
    admission_review = request.json
    pod = admission_review['request']['object']
    
    # Patch 생성 (JSON Patch)
    patches = []
    
    # 리소스 제한이 없으면 기본값 추가
    for i, container in enumerate(pod['spec']['containers']):
        if 'resources' not in container:
            patches.append({
                "op": "add",
                "path": f"/spec/containers/{i}/resources",
                "value": {
                    "limits": {
                        "cpu": "500m",
                        "memory": "512Mi"
                    },
                    "requests": {
                        "cpu": "250m",
                        "memory": "256Mi"
                    }
                }
            })
    
    # 응답
    response = {
        "apiVersion": "admission.k8s.io/v1",
        "kind": "AdmissionReview",
        "response": {
            "uid": admission_review['request']['uid'],
            "allowed": True,
            "patchType": "JSONPatch",
            "patch": base64.b64encode(
                json.dumps(patches).encode()
            ).decode()
        }
    }
    
    return jsonify(response)
```

**사용 사례**
- 자동으로 리소스 제한 추가
- 자동으로 레이블 추가
- 자동으로 Sidecar 컨테이너 주입 (Istio)
- 자동으로 볼륨 마운트 추가

**실행 순서**
1. Mutating Admission Webhooks (수정)
2. Validating Admission Webhooks (검증)

---

## 13. Custom Resources

### 13.1 Custom Resource Definition (CRD)

**CRD란?**

CRD는 **사용자 정의 리소스를 Kubernetes API에 추가**하는 메커니즘입니다.

**왜 필요한가?**
- 도메인 특화 객체 정의
- Kubernetes 네이티브 방식으로 관리
- kubectl로 조작 가능
- RBAC 적용 가능

**CRD 생성**

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: applications.stable.example.com
spec:
  group: stable.example.com
  versions:
  - name: v1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            properties:
              replicas:
                type: integer
                minimum: 1
                maximum: 10
              image:
                type: string
              port:
                type: integer
  scope: Namespaced
  names:
    plural: applications
    singular: application
    kind: Application
    shortNames:
    - app
```

```bash
# CRD 생성
kubectl apply -f application-crd.yaml

# CRD 확인
kubectl get crd

# API 리소스 확인
kubectl api-resources | grep application
```

**Custom Resource 생성**

```yaml
apiVersion: stable.example.com/v1
kind: Application
metadata:
  name: my-app
  namespace: default
spec:
  replicas: 3
  image: nginx:latest
  port: 80
```

```bash
# Custom Resource 생성
kubectl apply -f my-app.yaml

# 확인
kubectl get applications
kubectl get app

# 상세 정보
kubectl describe application my-app
```

**CRD Validation**

```yaml
spec:
  versions:
  - name: v1
    schema:
      openAPIV3Schema:
        type: object
        required:
        - spec
        properties:
          spec:
            type: object
            required:
            - replicas
            - image
            properties:
              replicas:
                type: integer
                minimum: 1
                maximum: 100
              image:
                type: string
                pattern: '^[a-z0-9-]+:[a-z0-9.-]+$'
              port:
                type: integer
                minimum: 1
                maximum: 65535
```

**Subresources**

```yaml
spec:
  versions:
  - name: v1
    subresources:
      status: {}
      scale:
        specReplicasPath: .spec.replicas
        statusReplicasPath: .status.replicas
```

### 13.2 Custom Controllers (Operators)

**Custom Controller란?**

Custom Controller는 **CRD를 감시하고 원하는 상태를 유지**하는 컨트롤러입니다.

**Controller 패턴**

```
Watch CR → Compare (Desired vs Current) → Reconcile → Repeat
```

**간단한 Controller 예시 (Python - Kopf)**

```python
import kopf
import kubernetes

@kopf.on.create('stable.example.com', 'v1', 'applications')
def create_fn(spec, name, namespace, **kwargs):
    # Deployment 생성
    api = kubernetes.client.AppsV1Api()
    
    deployment = kubernetes.client.V1Deployment(
        metadata=kubernetes.client.V1ObjectMeta(
            name=name,
            namespace=namespace
        ),
        spec=kubernetes.client.V1DeploymentSpec(
            replicas=spec['replicas'],
            selector=kubernetes.client.V1LabelSelector(
                match_labels={"app": name}
            ),
            template=kubernetes.client.V1PodTemplateSpec(
                metadata=kubernetes.client.V1ObjectMeta(
                    labels={"app": name}
                ),
                spec=kubernetes.client.V1PodSpec(
                    containers=[
                        kubernetes.client.V1Container(
                            name=name,
                            image=spec['image'],
                            ports=[kubernetes.client.V1ContainerPort(
                                container_port=spec['port']
                            )]
                        )
                    ]
                )
            )
        )
    )
    
    api.create_namespaced_deployment(namespace, deployment)
    return {'message': f'Deployment {name} created'}

@kopf.on.update('stable.example.com', 'v1', 'applications')
def update_fn(spec, name, namespace, **kwargs):
    # Deployment 업데이트
    api = kubernetes.client.AppsV1Api()
    
    # Patch로 업데이트
    body = {
        "spec": {
            "replicas": spec['replicas'],
            "template": {
                "spec": {
                    "containers": [{
                        "name": name,
                        "image": spec['image']
                    }]
                }
            }
        }
    }
    
    api.patch_namespaced_deployment(name, namespace, body)
    return {'message': f'Deployment {name} updated'}

@kopf.on.delete('stable.example.com', 'v1', 'applications')
def delete_fn(name, namespace, **kwargs):
    # Deployment 삭제
    api = kubernetes.client.AppsV1Api()
    api.delete_namespaced_deployment(name, namespace)
    return {'message': f'Deployment {name} deleted'}
```

**Controller 배포**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: application-controller
  namespace: kube-system
spec:
  replicas: 1
  selector:
    matchLabels:
      app: application-controller
  template:
    metadata:
      labels:
        app: application-controller
    spec:
      serviceAccountName: application-controller
      containers:
      - name: controller
        image: mycontroller:latest
```

**RBAC 설정**

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: application-controller
  namespace: kube-system

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: application-controller
rules:
- apiGroups: ["stable.example.com"]
  resources: ["applications"]
  verbs: ["get", "list", "watch", "update", "patch"]
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "create", "update", "patch", "delete"]
- apiGroups: [""]
  resources: ["services"]
  verbs: ["get", "list", "create", "update", "patch", "delete"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: application-controller
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: application-controller
subjects:
- kind: ServiceAccount
  name: application-controller
  namespace: kube-system
```

### 13.3 Operator Framework

**Operator란?**

Operator는 **도메인 지식을 코드화한 Kubernetes 확장**입니다.

**Operator = CRD + Custom Controller**

**Operator 성숙도 레벨**

1. **Basic Install**: 자동 설치
2. **Seamless Upgrades**: 자동 업그레이드
3. **Full Lifecycle**: 백업, 복구, 장애 처리
4. **Deep Insights**: 메트릭, 로그, 워크로드 분석
5. **Auto Pilot**: 자동 스케일링, 자동 튜닝

**인기 Operators**

- **Prometheus Operator**: 모니터링
- **MySQL Operator**: 데이터베이스
- **Elasticsearch Operator**: 검색
- **Kafka Operator**: 메시징
- **Istio Operator**: 서비스 메시**

**Operator SDK**

Red Hat에서 제공하는 Operator 개발 도구:

```bash
# Operator SDK 설치
curl -LO https://github.com/operator-framework/operator-sdk/releases/latest/download/operator-sdk_linux_amd64
chmod +x operator-sdk_linux_amd64
sudo mv operator-sdk_linux_amd64 /usr/local/bin/operator-sdk

# Operator 프로젝트 생성
operator-sdk init --domain example.com --repo github.com/example/myapp-operator

# API 생성
operator-sdk create api --group apps --version v1 --kind MyApp --resource --controller

# 빌드 및 배포
make docker-build docker-push IMG=myregistry.com/myapp-operator:v0.0.1
make deploy IMG=myregistry.com/myapp-operator:v0.0.1
```

---

## 14. Cluster Maintenance

### 14.1 OS Upgrades

**노드 유지보수**

노드를 유지보수할 때는 **Drain → 작업 → Uncordon** 순서로 진행합니다.

**Drain**

노드에서 모든 Pod를 안전하게 제거합니다.

```bash
# 노드에서 Pod 제거 (새 Pod 스케줄링 차단)
kubectl drain node01 --ignore-daemonsets

# DaemonSet Pod는 무시하고 Drain
kubectl drain node01 --ignore-daemonsets --delete-emptydir-data

# 강제 Drain (주의!)
kubectl drain node01 --force --ignore-daemonsets
```

**Cordon**

노드를 스케줄링 불가능하게 설정 (기존 Pod는 유지).

```bash
# 새 Pod 스케줄링 차단
kubectl cordon node01

# 노드 상태 확인
kubectl get nodes
# NAME     STATUS                     ROLES    AGE   VERSION
# node01   Ready,SchedulingDisabled   <none>   10d   v1.28.0
```

**Uncordon**

노드를 다시 스케줄링 가능하게 설정.

```bash
# 스케줄링 재개
kubectl uncordon node01
```

**Pod Eviction Timeout**

노드가 응답하지 않을 때 Pod를 자동으로 제거하는 시간:

```bash
# Controller Manager 설정
--pod-eviction-timeout=5m0s  # 기본값: 5분
```

### 14.2 Cluster Upgrade

**Kubernetes 버전 정책**

- Control Plane 컴포넌트는 같은 버전 사용 권장
- Kubelet은 API Server보다 최대 2 마이너 버전 낮을 수 있음
- kubectl은 API Server ±1 버전 지원

**업그레이드 전략**

1. Control Plane 업그레이드
2. Worker Node 업그레이드
  - **한 번에 모두**: 다운타임 발생
  - **Rolling**: 한 번에 하나씩
  - **추가 후 제거**: 새 노드 추가 → 기존 노드 제거

**kubeadm으로 업그레이드 (Control Plane)**

```bash
# 현재 버전 확인
kubectl version --short
kubeadm version

# 업그레이드 가능한 버전 확인
kubeadm upgrade plan

# kubeadm 업그레이드
apt-mark unhold kubeadm
apt-get update
apt-get install -y kubeadm=1.28.0-00
apt-mark hold kubeadm

# Control Plane 업그레이드
kubeadm upgrade apply v1.28.0

# kubelet 및 kubectl 업그레이드
apt-mark unhold kubelet kubectl
apt-get install -y kubelet=1.28.0-00 kubectl=1.28.0-00
apt-mark hold kubelet kubectl

# kubelet 재시작
systemctl daemon-reload
systemctl restart kubelet
```

**Worker Node 업그레이드**

```bash
# Control Plane에서 노드 Drain
kubectl drain node01 --ignore-daemonsets

# node01에서 작업
# kubeadm 업그레이드
apt-mark unhold kubeadm
apt-get update
apt-get install -y kubeadm=1.28.0-00
apt-mark hold kubeadm

# Node 업그레이드
kubeadm upgrade node

# kubelet 및 kubectl 업그레이드
apt-mark unhold kubelet kubectl
apt-get install -y kubelet=1.28.0-00 kubectl=1.28.0-00
apt-mark hold kubelet kubectl

# kubelet 재시작
systemctl daemon-reload
systemctl restart kubelet

# Control Plane에서 Uncordon
kubectl uncordon node01
```

### 14.3 Backup and Restore

**백업 대상**

1. **Resource Configuration**: YAML 파일
2. **ETCD Cluster**: 모든 클러스터 상태
3. **Persistent Volumes**: 애플리케이션 데이터

**Resource Configuration 백업**

```bash
# 모든 네임스페이스의 모든 리소스
kubectl get all --all-namespaces -o yaml > all-resources.yaml

# 특정 리소스만
kubectl get deployments,services --all-namespaces -o yaml > deployments-services.yaml

# Velero 같은 도구 사용 권장
```

**ETCD 백업**

```bash
# ETCD 스냅샷 생성
ETCDCTL_API=3 etcdctl snapshot save snapshot.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# 스냅샷 상태 확인
ETCDCTL_API=3 etcdctl snapshot status snapshot.db --write-out=table
```

**ETCD 복원**

```bash
# ETCD 중지
systemctl stop etcd

# 스냅샷에서 복원
ETCDCTL_API=3 etcdctl snapshot restore snapshot.db \
  --data-dir=/var/lib/etcd-restore \
  --initial-cluster=master=https://127.0.0.1:2380 \
  --initial-advertise-peer-urls=https://127.0.0.1:2380 \
  --name=master

# ETCD 설정 변경 (data-dir 업데이트)
vi /etc/kubernetes/manifests/etcd.yaml
# --data-dir=/var/lib/etcd-restore

# ETCD 자동 재시작 (Static Pod)
# 또는 수동 재시작
systemctl start etcd

# 확인
kubectl get pods
```

**Velero를 이용한 백업/복원**

```bash
# Velero 설치
velero install \
  --provider aws \
  --bucket my-backup-bucket \
  --secret-file ./credentials-velero

# 백업 생성
velero backup create my-backup --include-namespaces production

# 스케줄 백업
velero schedule create daily-backup --schedule="0 2 * * *"

# 백업 확인
velero backup get

# 복원
velero restore create --from-backup my-backup

# 특정 네임스페이스만 복원
velero restore create --from-backup my-backup --include-namespaces production
```

---

## 15. Autoscaling

### 15.1 Vertical Pod Autoscaler (VPA)

**VPA란?**

VPA는 **Pod의 리소스 요청/제한을 자동으로 조정**합니다.

**VPA 설치**

```bash
# VPA 설치
git clone https://github.com/kubernetes/autoscaler.git
cd autoscaler/vertical-pod-autoscaler
./hack/vpa-up.sh

# VPA 컴포넌트 확인
kubectl get pods -n kube-system | grep vpa
```

**VPA 생성**

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: my-app-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  updatePolicy:
    updateMode: "Auto"  # Off, Initial, Recreate, Auto
  resourcePolicy:
    containerPolicies:
    - containerName: '*'
      minAllowed:
        cpu: 100m
        memory: 128Mi
      maxAllowed:
        cpu: 2
        memory: 2Gi
```

**UpdateMode**
- **Off**: 추천만 제공, 적용 안 함
- **Initial**: Pod 생성 시에만 적용
- **Recreate**: Pod 재생성하여 적용 (다운타임)
- **Auto**: 가능하면 재생성 없이 적용

```bash
# VPA 확인
kubectl get vpa

# 추천값 확인
kubectl describe vpa my-app-vpa
```

**HPA vs VPA**

| 특성 | HPA | VPA |
|------|-----|-----|
| 조정 대상 | Pod 개수 | Pod 리소스 |
| 방향 | 수평 확장 | 수직 확장 |
| 다운타임 | 없음 | 있을 수 있음 (Recreate 모드) |
| 사용 사례 | 트래픽 증가 | 리소스 최적화 |

**주의사항**
- HPA와 VPA를 동시에 사용하면 충돌 가능
- VPA는 리소스 기반으로만 동작 (Custom Metrics 불가)

### 15.2 In-Place Resize of Pods

**In-Place Resize란?**

Kubernetes 1.27+ (Alpha)에서 **Pod를 재시작하지 않고 리소스를 변경**할 수 있습니다.

**Feature Gate 활성화**

```bash
# kube-apiserver, kubelet, kube-scheduler에 추가
--feature-gates=InPlacePodVerticalScaling=true
```

**리소스 변경**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
spec:
  containers:
  - name: app
    image: myapp
    resources:
      requests:
        cpu: "250m"
        memory: "256Mi"
      limits:
        cpu: "500m"
        memory: "512Mi"
```

```bash
# Pod 리소스 수정
kubectl set resources pod my-pod -c app \
  --requests=cpu=500m,memory=512Mi \
  --limits=cpu=1,memory=1Gi

# 또는 patch
kubectl patch pod my-pod --type='json' -p='[
  {"op": "replace", "path": "/spec/containers/0/resources/requests/cpu", "value": "500m"}
]'
```

**제한사항**
- Alpha 기능 (프로덕션 사용 주의)
- 모든 런타임이 지원하지 않음
- CPU는 재시작 없이 조정, 메모리는 재시작 필요할 수 있음

---

## 16. Gateway API

### 16.1 Gateway API란?

**Gateway API**는 **Ingress를 대체하는 차세대 네트워킹 API**입니다.

**Ingress vs Gateway API**

| 특성 | Ingress | Gateway API |
|------|---------|-------------|
| 역할 분리 | 없음 | 명확 (Infrastructure vs Application) |
| 확장성 | 제한적 | 우수 |
| 표준화 | 어노테이션 의존 | CRD 기반 |
| 프로토콜 | HTTP/HTTPS | HTTP, HTTPS, TCP, UDP, gRPC |
| 멀티테넌시 | 약함 | 강함 |

**주요 리소스**

**GatewayClass**
- 인프라 관리자가 정의
- Ingress Controller와 유사

**Gateway**
- 인프라 관리자가 생성
- Load Balancer 설정

**HTTPRoute**
- 애플리케이션 개발자가 생성
- 라우팅 규칙 정의

**Gateway API 설치**

```bash
# CRD 설치
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.0.0/standard-install.yaml

# NGINX Gateway 설치 (예시)
kubectl apply -f https://raw.githubusercontent.com/nginxinc/nginx-gateway-fabric/main/deploy/manifests/nginx-gateway.yaml
```

**GatewayClass 생성**

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: nginx
spec:
  controllerName: nginx.org/gateway-controller
```

**Gateway 생성**

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: example-gateway
  namespace: default
spec:
  gatewayClassName: nginx
  listeners:
  - name: http
    protocol: HTTP
    port: 80
  - name: https
    protocol: HTTPS
    port: 443
    tls:
      mode: Terminate
      certificateRefs:
      - name: example-tls
```

**HTTPRoute 생성**

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: example-route
  namespace: default
spec:
  parentRefs:
  - name: example-gateway
  hostnames:
  - "example.com"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /api
    backendRefs:
    - name: api-service
      port: 8080
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: web-service
      port: 80
```

**고급 라우팅**

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: advanced-route
spec:
  parentRefs:
  - name: example-gateway
  rules:
  # Header 기반 라우팅
  - matches:
    - headers:
      - name: version
        value: v2
    backendRefs:
    - name: api-v2
      port: 8080
  
  # Weight 기반 트래픽 분할 (Canary)
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: app-v1
      port: 80
      weight: 90
    - name: app-v2
      port: 80
      weight: 10
  
  # Redirect
  - matches:
    - path:
        type: Exact
        value: /old-path
    filters:
    - type: RequestRedirect
      requestRedirect:
        path:
          type: ReplaceFullPath
          replaceFullPath: /new-path
        statusCode: 301
```

**Cross-Namespace 라우팅**

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: cross-ns-route
  namespace: team-a
spec:
  parentRefs:
  - name: shared-gateway
    namespace: infra
  rules:
  - backendRefs:
    - name: service-a
      port: 80
      namespace: team-a
```

**ReferenceGrant 필요**

```yaml
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-team-a
  namespace: team-a
spec:
  from:
  - group: gateway.networking.k8s.io
    kind: HTTPRoute
    namespace: infra
  to:
  - group: ""
    kind: Service
```

---
