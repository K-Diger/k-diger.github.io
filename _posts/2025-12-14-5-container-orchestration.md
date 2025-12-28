---

title: Container Orchestration
date: 2025-12-14
categories: [Container]
tags: [Container, Kubernetes, Orchestration]
layout: post
toc: true
math: true
mermaid: true

---

## 목차

### Part 1: 컨테이너 오케스트레이션 개요

1. [컨테이너 오케스트레이션이란?](#part-1-컨테이너-오케스트레이션-개요)
  * [단일 호스트의 한계](#11-단일-호스트의-한계)
  * [오케스트레이션의 필요성](#12-오케스트레이션의-필요성)
  * [주요 오케스트레이션 도구](#13-주요-오케스트레이션-도구)

2. [Kubernetes 개요](#2-kubernetes-개요)
  * [Kubernetes란?](#21-kubernetes란)
  * [Kubernetes의 역사](#22-kubernetes의-역사)
  * [Kubernetes의 특징](#23-kubernetes의-특징)
  * [Docker와의 관계](#24-docker와의-관계)

### Part 2: Kubernetes 아키텍처

3. [Kubernetes 클러스터 구조](#part-2-kubernetes-아키텍처)
  * [Control Plane (Master Node)](#31-control-plane-master-node)
  * [Worker Node](#32-worker-node)
  * [클러스터 통신 흐름](#33-클러스터-통신-흐름)

4. [Control Plane 컴포넌트](#4-control-plane-컴포넌트)
  * [API Server (kube-apiserver)](#41-api-server-kube-apiserver)
  * [etcd](#42-etcd)
  * [Scheduler (kube-scheduler)](#43-scheduler-kube-scheduler)
  * [Controller Manager (kube-controller-manager)](#44-controller-manager-kube-controller-manager)

5. [Worker Node 컴포넌트](#5-worker-node-컴포넌트)
  * [Kubelet](#51-kubelet)
  * [Kube-proxy](#52-kube-proxy)
  * [Container Runtime](#53-container-runtime)

6. [애드온 (Addons)](#6-애드온-addons)
  * [DNS (CoreDNS)](#61-dns-coredns)
  * [Dashboard](#62-dashboard)
  * [Metrics Server](#63-metrics-server)
  * [CNI (Container Network Interface)](#64-cni-container-network-interface)

### Part 3: Kubernetes 핵심 개념

7. [Pod](#part-3-kubernetes-핵심-개념)
  * [Pod 개념 (최소 배포 단위)](#71-pod-개념-최소-배포-단위)
  * [Pod 생명주기](#72-pod-생명주기)
  * [Multi-container Pod](#73-multi-container-pod)
  * [Init Container](#74-init-container)
  * [Probe (Health Check)](#75-probe-health-check)
  * [리소스 요청 및 제한](#76-리소스-요청-및-제한)

8. [Label과 Selector](#8-label과-selector)
  * [Label 개념](#81-label-개념)
  * [Selector](#82-selector)
  * [Annotation](#83-annotation)

9. [Namespace](#9-namespace)
  * [Namespace 개념](#91-namespace-개념)
  * [기본 Namespace](#92-기본-namespace)
  * [ResourceQuota](#93-resourcequota)
  * [LimitRange](#94-limitrange)

### Part 4: Workload 리소스

10. [ReplicaSet](#part-4-workload-리소스)
  * [ReplicaSet 개념](#101-replicaset-개념)
  * [Replica 수 유지](#102-replica-수-유지)
  * [Label Selector](#103-label-selector)

11. [Deployment](#11-deployment)
  * [Deployment 개념](#111-deployment-개념)
  * [롤링 업데이트](#112-롤링-업데이트)
  * [업데이트 전략](#113-업데이트-전략)
  * [Rollback](#114-rollback)

12. [StatefulSet](#12-statefulset)
  * [StatefulSet 개념](#121-statefulset-개념)
  * [Pod Identity (순서 보장)](#122-pod-identity-순서-보장)
  * [Persistent Volume 연동](#123-persistent-volume-연동)
  * [Headless Service](#124-headless-service)

13. [DaemonSet](#13-daemonset)
  * [DaemonSet 개념](#131-daemonset-개념)
  * [노드마다 하나의 Pod](#132-노드마다-하나의-pod)
  * [사용 사례](#133-사용-사례)

14. [Job과 CronJob](#14-job과-cronjob)
  * [Job (일회성 작업)](#141-job-일회성-작업)
  * [CronJob (주기적 작업)](#142-cronjob-주기적-작업)

### Part 5: 네트워킹

15. [Service](#part-5-네트워킹)
  * [Service 개념 (안정적인 엔드포인트)](#151-service-개념-안정적인-엔드포인트)
  * [ClusterIP (기본값)](#152-clusterip-기본값)
  * [NodePort](#153-nodeport)
  * [LoadBalancer](#154-loadbalancer)
  * [ExternalName](#155-externalname)
  * [Headless Service](#156-headless-service)
  * [Session Affinity](#157-session-affinity)

16. [Endpoints](#16-endpoints)
  * [Endpoints 자동 생성](#161-endpoints-자동-생성)
  * [수동 Endpoints 관리](#162-수동-endpoints-관리)

17. [Ingress](#17-ingress)
  * [Ingress 개념](#171-ingress-개념)
  * [Ingress Controller (Nginx, Traefik, HAProxy)](#172-ingress-controller-nginx-traefik-haproxy)
  * [경로 기반 라우팅](#173-경로-기반-라우팅)
  * [호스트 기반 라우팅](#174-호스트-기반-라우팅)
  * [TLS/SSL 설정](#175-tlsssl-설정)
  * [Cert-Manager (자동 인증서 발급)](#176-cert-manager-자동-인증서-발급)

18. [NetworkPolicy](#18-networkpolicy)
  * [NetworkPolicy 개념](#181-networkpolicy-개념)
  * [Ingress 제어](#182-ingress-제어)
  * [Egress 제어](#183-egress-제어)
  * [정책 예제](#184-정책-예제)

19. [CNI (Container Network Interface)](#19-cni-container-network-interface)
  * [CNI 플러그인 역할](#191-cni-플러그인-역할)
  * [Calico](#192-calico)
  * [Flannel](#193-flannel)
  * [Cilium](#194-cilium)
  * [Weave](#195-weave)
  * [CNI 비교](#196-cni-비교)

### Part 6: 스토리지

20. [Volume](#part-6-스토리지)
  * [Volume 종류](#201-volume-종류)
  * [emptyDir](#202-emptydir)
  * [hostPath](#203-hostpath)
  * [configMap/secret](#204-configmapsecret)
  * [PV/PVC](#205-pvpvc)

21. [PersistentVolume (PV)](#21-persistentvolume-pv)
  * [PV 개념](#211-pv-개념)
  * [Storage Class](#212-storage-class)
  * [Dynamic Provisioning](#213-dynamic-provisioning)

22. [PersistentVolumeClaim (PVC)](#22-persistentvolumeclaim-pvc)
  * [PVC 개념](#221-pvc-개념)
  * [PV와 바인딩](#222-pv와-바인딩)

23. [ConfigMap과 Secret](#23-configmap과-secret)
  * [ConfigMap (설정 관리)](#231-configmap-설정-관리)
  * [Secret (민감 정보 관리)](#232-secret-민감-정보-관리)
  * [Volume으로 마운트](#233-volume으로-마운트)
  * [환경 변수로 주입](#234-환경-변수로-주입)

### Part 7: 보안

24. [RBAC (Role-Based Access Control)](#part-7-보안)
  * [ServiceAccount](#241-serviceaccount)
  * [Role과 ClusterRole](#242-role과-clusterrole)
  * [RoleBinding과 ClusterRoleBinding](#243-rolebinding과-clusterrolebinding)

25. [Pod Security](#25-pod-security)
  * [SecurityContext](#251-securitycontext)
  * [PodSecurityPolicy (deprecated)](#252-podsecuritypolicy-deprecated)
  * [Pod Security Standards](#253-pod-security-standards)

26. [Network Security](#26-network-security)
  * [NetworkPolicy](#261-networkpolicy)
  * [Service Mesh (Istio, Linkerd)](#262-service-mesh-istio-linkerd)

### Part 8: 고급 기능

27. [Auto-scaling](#part-8-고급-기능)
  * [HPA (Horizontal Pod Autoscaler)](#271-hpa-horizontal-pod-autoscaler)
  * [VPA (Vertical Pod Autoscaler)](#272-vpa-vertical-pod-autoscaler)
  * [Cluster Autoscaler](#273-cluster-autoscaler)

28. [배포 전략](#28-배포-전략)
  * [Rolling Update](#281-rolling-update)
  * [Blue-Green 배포](#282-blue-green-배포)
  * [Canary 배포](#283-canary-배포)
  * [A/B 테스팅](#284-ab-테스팅)

29. [Helm](#29-helm)
  * [Helm 개념 (K8s 패키지 매니저)](#291-helm-개념-k8s-패키지-매니저)
  * [Chart 구조](#292-chart-구조)
  * [Helm 명령어](#293-helm-명령어)
  * [Chart 작성](#294-chart-작성)

30. [모니터링 및 로깅](#30-모니터링-및-로깅)
  * [Prometheus + Grafana](#301-prometheus--grafana)
  * [ELK/EFK Stack](#302-elkefk-stack)
  * [Loki](#303-loki)

---

# Part 1: 컨테이너 오케스트레이션 개요

## 1. 컨테이너 오케스트레이션이란?

### 1.1 단일 호스트의 한계

**Docker만으로는 부족한 이유:**

Docker는 단일 호스트에서 컨테이너를 관리하는 강력한 도구이지만, 프로덕션 환경에서는 여러 제약이 있다:

- **수동 관리의 어려움**: 수백, 수천 개의 컨테이너를 수동으로 관리할 수 없음
- **고가용성 부재**: 컨테이너 장애 시 자동 복구 불가
- **리소스 활용 최적화 불가**: 여러 호스트에 걸친 리소스 분배 불가능
- **네트워크 관리 복잡성**: 다중 호스트 간 컨테이너 통신 어려움
- **스케일링 자동화 부재**: 부하 변화에 따른 자동 스케일링 불가

### 1.2 오케스트레이션의 필요성

**오케스트레이션의 핵심 기능:**

오케스트레이션 플랫폼은 다음을 자동으로 관리한다:

**배포 및 스케일링 (Deployment & Scaling)**

- 애플리케이션의 선언적 배포
- CPU/메모리 사용률에 따른 자동 스케일링
- 여러 호스트에 걸친 배포 최적화

**고가용성 (High Availability)**

- 장애 노드에서 Pod 자동 재할당
- 복제본(Replica) 수 자동 유지
- 무중단 배포 (Rolling Update)

**서비스 디스커버리 (Service Discovery)**

- 컨테이너 자동 등록/해제
- DNS 기반 서비스 검색
- 로드 밸런싱

**자동 복구 (Self-healing)**

- 실패한 컨테이너 자동 재시작
- 유효하지 않은 Pod 자동 제거
- 노드 장애 자동 감지 및 대응

**리소스 관리 (Resource Management)**

- CPU, 메모리 요청/제한 설정
- 리소스 기반 Pod 스케줄링
- 클러스터 전체 리소스 최적화

### 1.3 주요 오케스트레이션 도구

**Kubernetes (K8s)**

- 오픈소스, CNCF 주도
- 사실상 업계 표준
- 가장 완성도 높은 기능
- 가파른 학습 곡선

**Docker Swarm**

- Docker 내장 오케스트레이션
- 간단한 설정과 사용
- 소규모 프로젝트에 적합
- 기능 제한적

**Apache Mesos**

- 범용 리소스 매니저
- 다양한 워크로드 지원
- 복잡한 설정
- 기업용

**Nomad (HashiCorp)**

- 멀티 클라우드 지원
- 컨테이너 외 다양한 워크로드
- Terraform과 통합

---

## 2. Kubernetes 개요

### 2.1 Kubernetes란?

**정의:**

Kubernetes(K8s)는 **컨테이너화된 애플리케이션의 배포, 스케일링, 관리를 자동화하는 오픈소스 플랫폼**이다.

**핵심 가치:**

- **선언적 설정**: "무엇을" 원하는지 정의, "어떻게"는 K8s가 관리
- **자동화**: 반복적인 운영 작업 자동화
- **확장성**: 수천 개의 노드와 Pod 관리
- **이식성**: 온프레미스, 퍼블릭 클라우드, 하이브리드 환경 모두 지원

### 2.2 Kubernetes의 역사

**Google Borg (2003-2004)**

- Google 내부 대규모 클러스터 관리 시스템
- 수십억 개의 컨테이너 관리 경험 축적
- Kubernetes의 설계에 깊은 영향

**Kubernetes 탄생 (2014)**

- Google이 Borg의 경험을 바탕으로 오픈소스 공개
- Go 언어로 작성
- CNCF (Cloud Native Computing Foundation)에 기부

**v1.0 릴리스 (2015)**

- 프로덕션 사용 가능 선언
- AWS, Azure, GCP 등 주요 클라우드 제공자 지원 시작

**급속한 성장 (2016-2018)**

- 컨테이너 오케스트레이션의 사실상 표준 확립
- Docker Swarm, Mesos 등을 제치고 선두

**성숙 단계 (2019-현재)**

- 안정적인 연 3회 릴리스 주기
- 풍부한 생태계 도구
- 멀티 클라우드, 하이브리드 클라우드의 사실상 표준

### 2.3 Kubernetes의 특징

**선언적 설정 (Declarative Configuration)**

명령형(Imperative) vs 선언형(Declarative):

```bash
# 명령형: "무엇을 어떻게" 할지 명령
docker run nginx
docker scale container_id 3
docker update --cpu-shares 512 container_id
```

```yaml
# 선언형: "원하는 상태"를 선언
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
          image: nginx:1.21
          resources:
            limits:
              cpu: "500m"
```

**자기 치유 (Self-healing)**

- 실패한 컨테이너 자동 재시작
- 응답 없는 Pod 자동 교체
- 노드 장애 시 다른 노드에 자동 재배치

**자동 스케일링 (Auto-scaling)**

- CPU/메모리 기반 수평 스케일링
- 클러스터 레벨 스케일링

**무중단 배포 (Rolling Update)**

- 새 버전으로 점진적 전환
- 장애 시 자동 롤백

**서비스 디스커버리 및 로드 밸런싱**

- 내부 DNS 자동 관리
- 자동 로드 밸런싱
- 여러 프로토콜 지원

### 2.4 Docker와의 관계

**Docker는 컨테이너 기술, Kubernetes는 오케스트레이션:**

```
Application Code
        ↓
    Docker (컨테이너화)
        ↓
   Kubernetes (배포, 스케일, 관리)
        ↓
   Cluster (여러 노드)
```

**Docker가 제공하는 것:**

- 애플리케이션을 컨테이너로 패키징
- 일관된 환경 보장
- 간단한 배포

**Kubernetes가 추가하는 것:**

- 컨테이너 오케스트레이션
- 자동 스케일링
- 자가 치유
- 서비스 디스커버리
- 네트워킹 및 스토리지 관리

**선택지:**

- Docker Swarm: Docker와 완전 통합, 간단하지만 기능 제한
- Kubernetes: 더 강력하지만 복잡

현재 업계 표준은 Kubernetes이다.

---

# Part 2: Kubernetes 아키텍처

## 3. Kubernetes 클러스터 구조

### 3.1 Control Plane (Master Node)

**역할:**

Control Plane은 **클러스터 전체의 상태를 관리하고 의사결정을 내리는 중뇌** 역할을 한다.

**책임:**

- 클러스터 상태 저장 및 관리 (etcd)
- API 서버를 통한 모든 요청 처리
- Pod 스케줄링
- 컨트롤러 실행

**고가용성 설정:**

- 프로덕션 환경에서는 3개 이상의 Control Plane 권장
- Active-Active 구조로 부하 분산
- etcd 역시 3개 이상 실행 권장

```
┌─────────────────────────────────────────────┐
│         Control Plane (Master)              │
│  ┌──────────────┐  ┌────────────────────┐  │
│  │  API Server  │  │  etcd (State DB)   │  │
│  └──────────────┘  └────────────────────┘  │
│  ┌──────────────┐  ┌────────────────────┐  │
│  │  Scheduler   │  │ Controller Manager │  │
│  └──────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 3.2 Worker Node

**역할:**

Worker Node는 **실제 컨테이너가 실행되는 장소**이다.

**책임:**

- Pod 실행
- Control Plane의 명령 수행
- 리소스 리포팅
- 헬스체크

**확장성:**

- 클러스터에 노드를 추가하여 용량 증가
- 자동 스케일링으로 동적 관리

```
┌────────────────────────────────────────┐
│          Worker Node                   │
│  ┌──────────────────────────────────┐  │
│  │ kubelet (Node Agent)             │  │
│  │  - Pod 관리                      │  │
│  │  - CRI 인터페이스               │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │ kube-proxy (Network)             │  │
│  │  - 서비스 네트워킹               │  │
│  │  - 트래픽 라우팅                │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │ Container Runtime (Docker, etc)  │  │
│  │  - 컨테이너 실행                │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │ [Pod] [Pod] [Pod]               │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

### 3.3 클러스터 통신 흐름

**배포 요청 흐름:**

```
1. kubectl (사용자)
      ↓ (YAML 전송)
2. API Server (인증/인가)
      ↓ (상태 저장)
3. etcd (저장소)
      ↓ (상태 변경 감지)
4. Scheduler (Pod 배치 결정)
      ↓ (바인딩)
5. API Server (업데이트)
      ↓ (감시)
6. kubelet (노드에서 감시)
      ↓ (Pod 생성 명령)
7. Container Runtime (컨테이너 실행)
      ↓
8. Pod 실행 및 상태 리포팅
```

**Pod 통신:**

- Pod-to-Pod: CNI 플러그인이 네트워크 제공
- Pod-to-Service: kube-proxy가 라우팅
- 외부-to-Service: Ingress Controller가 관리

---

## 4. Control Plane 컴포넌트

### 4.1 API Server (kube-apiserver)

**역할:**

API Server는 **Kubernetes의 프론트엔드**로, 모든 요청의 진입점이다.

**책임:**

- RESTful API 제공
- 모든 컴포넌트 간의 통신 중심점
- 인증 및 인가 (Authentication/Authorization)
- Admission Control
- etcd와의 유일한 직접 통신

**특징:**

- Stateless (상태는 etcd에만 저장)
- 수평 확장 가능 (여러 인스턴스 실행)
- 높은 가용성 필수

```bash
# API Server 상태 확인
kubectl cluster-info

# 사용 가능한 API 리소스
kubectl api-resources

# API 버전 확인
kubectl api-versions
```

### 4.2 etcd

**역할:**

etcd는 **분산형 키-값 저장소**로, **클러스터의 모든 상태 데이터를 저장**한다.

**저장하는 데이터:**

- 모든 클러스터 설정
- 모든 Kubernetes 오브젝트 (Pod, Service, Deployment 등)
- 네트워크 설정
- Secrets 및 ConfigMap

**특징:**

- Raft 합의 알고리즘으로 데이터 일관성 보장
- 고가용성을 위해 홀수 개 (3, 5, 7개) 실행 권장
- 정기적인 백업 필수
- 쓰기 성능이 전체 클러스터 성능에 영향

```bash
# etcd 버전 확인
etcdctl version

# 백업 (kubeadm 기반 클러스터)
ETCDCTL_API=3 etcdctl snapshot save snapshot.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
```

### 4.3 Scheduler (kube-scheduler)

**역할:**

**새로 생성된 Pod를 어떤 노드에 배치할지 결정**한다.

**스케줄링 과정:**

1. **필터링 (Filtering)**: 조건을 만족하는 노드 선택
  - CPU/메모리 요청 확인
  - 노드 셀렉터 확인
  - Affinity/Anti-affinity 규칙 확인
  - Taints와 Tolerations 확인
  - 기타 제약 조건 확인

2. **점수 부여 (Scoring)**: 적합한 노드 순위 지정
  - 리소스 활용률
  - 데이터 지역성
  - Pod Affinity/Anti-affinity
  - 토폴로지 분산

3. **바인딩 (Binding)**: 최고 점수 노드에 Pod 할당

```yaml
# 스케줄링 제약 예시
apiVersion: v1
kind: Pod
metadata:
  name: example
spec:
  nodeSelector:
    disktype: ssd  # ssd 라벨이 있는 노드 선택
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: kubernetes.io/hostname
                operator: In
                values:
                  - node-1
                  - node-2
  tolerations:
    - key: gpu
      operator: Equal
      value: "true"
      effect: NoSchedule
  containers:
    - name: app
      image: myapp:latest
      resources:
        requests:
          cpu: 500m
          memory: 512Mi
        limits:
          cpu: 1000m
          memory: 1Gi
```

### 4.4 Controller Manager (kube-controller-manager)

**역할:**

**여러 컨트롤러를 실행하는 데몬**이다. 각 컨트롤러는 **Reconciliation Loop**를 통해 원하는 상태를 유지한다.

```
원하는 상태 (YAML)
       ↓
    감시 (Watch)
       ↓
  현재 상태와 비교
       ↓
   일치 여부?
   ✗ → 액션 취하기 → 현재 상태 변경
   ✓ → 대기
```

**주요 컨트롤러:**

**Node Controller**

- 노드 상태 모니터링
- 응답 없는 노드 감지
- Pod 제거 및 재할당

**Replication Controller**

- ReplicaSet과 유사 (이전 버전)
- Pod 복제본 수 유지

**Endpoints Controller**

- Service와 Pod 연결
- Endpoint 자동 생성/업데이트

**Service Account Controller**

- 기본 ServiceAccount 생성

**기타 컨트롤러:**

- Deployment Controller
- StatefulSet Controller
- DaemonSet Controller
- Job Controller
- CronJob Controller

---

## 5. Worker Node 컴포넌트

### 5.1 Kubelet

**역할:**

Kubelet은 **각 노드의 에이전트**로, **Pod 생성 및 관리를 담당**한다.

**책임:**

- Pod YAML 감시 및 실행
- Container Runtime Interface (CRI) 통신
- Pod 헬스체크 (Liveness, Readiness Probe)
- 노드 상태 리포팅
- 리소스 제한 강제

**특징:**

- 모든 Worker Node에서 실행
- Control Plane의 지시만 따름
- Self-healing: Static Pod 지원

```bash
# Kubelet 상태 확인
systemctl status kubelet

# Kubelet 로그
journalctl -u kubelet -f

# 노드 상태 확인
kubectl get nodes
kubectl describe node <node-name>
```

### 5.2 Kube-proxy

**역할:**

**서비스 네트워킹을 담당**한다. Pod에서 Service로 트래픽을 라우팅한다.

**네트워킹 모드:**

**iptables 모드 (기본값)**

- Linux iptables 사용
- 성능 우수
- 대규모 클러스터에서 느릴 수 있음

**IPVS 모드**

- Linux IP Virtual Server 사용
- 더 나은 성능
- 복잡한 로드 밸런싱

**userspace 모드**

- 가장 느림
- 호환성 우수

```bash
# Kube-proxy 모드 확인
kubectl get configmap -n kube-system kube-proxy-config -o yaml | grep mode
```

### 5.3 Container Runtime

**역할:**

**실제 컨테이너를 실행**한다. CRI (Container Runtime Interface)를 통해 kubelet과 통신한다.

**주요 런타임:**

**Docker**

- 가장 널리 사용
- K8s 1.24부터 직접 지원 중단 (dockershim 제거)
- 하지만 여전히 호환성 유지

**containerd**

- Docker가 사용하던 컨테이너 런타임
- 경량, 고성능
- 현재 권장 표준

**CRI-O**

- Kubernetes 전용 런타임
- 경량, 보안 중심

**runc**

- OCI (Open Container Initiative) 표준 구현
- 위 런타임들의 기반

```bash
# 노드의 Container Runtime 확인
kubectl get nodes -o wide

# Container Runtime 버전
docker version
containerd --version
```

---

## 6. 애드온 (Addons)

### 6.1 DNS (CoreDNS)

**역할:**

**클러스터 내부 DNS 제공**으로 Pod-to-Pod 통신을 가능하게 한다.

**기능:**

- Pod 이름 → IP 주소 변환
- Service 이름 → ClusterIP 변환
- 자동 DNS 레코드 생성

**DNS 네이밍:**

```
<pod-name>.<namespace>.pod.cluster.local
<service-name>.<namespace>.svc.cluster.local
```

```bash
# CoreDNS 확인
kubectl get pods -n kube-system | grep coredns

# DNS 테스트
kubectl run -it --image=busybox --restart=Never -- nslookup kubernetes.default
```

### 6.2 Dashboard

**역할:**

**웹 기반 GUI**로 Kubernetes 클러스터를 시각적으로 관리한다.

```bash
# Dashboard 설치
kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.7.0/aio/deploy/recommended.yaml

# 접근
kubectl proxy

# http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/
```

### 6.3 Metrics Server

**역할:**

**리소스 사용량 수집**으로 HPA 등이 자동 스케일링을 결정하는데 필요하다.

```bash
# Metrics Server 설치 (kubeadm, kind 등)
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# 메트릭 확인
kubectl top nodes
kubectl top pods -A
```

### 6.4 CNI (Container Network Interface)

**역할:**

**Pod 간 네트워킹**을 제공한다. 자세한 내용은 Part 5의 CNI 섹션 참고.

---

# Part 3: Kubernetes 핵심 개념

## 7. Pod

### 7.1 Pod 개념 (최소 배포 단위)

**정의:**

Pod는 **Kubernetes에서 배포할 수 있는 최소 단위**이다.

**특징:**

- 1개 이상의 컨테이너 포함 (일반적으로 1개)
- 컨테이너 간 네트워크 네임스페이스 공유
- 스토리지 볼륨 공유
- 같은 Pod 내 컨테이너는 localhost로 통신

**간단한 Pod 예:**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx-pod
spec:
  containers:
    - name: nginx
      image: nginx:1.21
      ports:
        - containerPort: 80
```

### 7.2 Pod 생명주기

**상태 (Phase):**

- **Pending**: Pod이 스케줄되어 생성을 기다리는 중
- **Running**: 모든 컨테이너가 실행 중
- **Succeeded**: 모든 컨테이너가 정상 종료 (Job)
- **Failed**: 하나 이상의 컨테이너가 비정상 종료
- **Unknown**: Pod 상태를 알 수 없음

```bash
# Pod 상태 확인
kubectl get pods
kubectl describe pod <pod-name>
```

### 7.3 Multi-container Pod

**Sidecar 패턴:**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-with-sidecar
spec:
  containers:
    - name: main-app
      image: myapp:latest
      volumeMounts:
        - name: logs
          mountPath: /var/log
    - name: log-shipper
      image: fluentd:latest
      volumeMounts:
        - name: logs
          mountPath: /var/log
  volumes:
    - name: logs
      emptyDir: { }
```

로그 수집, 모니터링, 보안 에이전트 등을 메인 애플리케이션과 함께 실행.

**Ambassador 패턴:**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-with-ambassador
spec:
  containers:
    - name: app
      image: myapp:latest
      env:
        - name: DATABASE_URL
          value: "localhost:5432"
    - name: db-proxy
      image: postgres-proxy:latest
      ports:
        - containerPort: 5432
```

로컬에서 외부 데이터베이스에 프록시를 통해 연결.

**Adapter 패턴:**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-with-adapter
spec:
  containers:
    - name: app
      image: myapp:latest
    - name: adapter
      image: monitoring-adapter:latest
      ports:
        - containerPort: 8080
```

애플리케이션 메트릭을 표준 형식으로 변환.

### 7.4 Init Container

**역할:**

**메인 컨테이너 실행 전에 초기화 작업 수행**한다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: init-container-example
spec:
  initContainers:
    - name: init-mydb
      image: busybox
      command: [ 'sh', '-c', 'until nslookup mydb; do echo waiting for mydb; sleep 2; done;' ]
    - name: init-myservice
      image: busybox
      command: [ 'sh', '-c', 'until nslookup myservice; do echo waiting for myservice; sleep 2; done;' ]
  containers:
    - name: myapp
      image: myapp:v1
```

**특징:**

- 순차 실행 (하나가 완료되어야 다음 시작)
- 모두 완료되어야 메인 컨테이너 시작
- 실패하면 Pod 재시작

### 7.5 Probe (Health Check)

**Liveness Probe:**

```yaml
containers:
  - name: myapp
    image: myapp:v1
    livenessProbe:
      httpGet:
        path: /healthz
        port: 8080
      initialDelaySeconds: 15
      periodSeconds: 20
```

컨테이너가 살아있는지 확인. 실패하면 Pod 재시작.

**Readiness Probe:**

```yaml
containers:
  - name: myapp
    image: myapp:v1
    readinessProbe:
      exec:
        command:
          - /bin/sh
          - -c
          - nc -z localhost 3306
      initialDelaySeconds: 5
      periodSeconds: 10
```

Pod이 트래픽을 받을 준비가 되었는지 확인. 실패하면 Service에서 제거.

**Startup Probe:**

```yaml
startupProbe:
  httpGet:
    path: /startup
    port: 8080
  failureThreshold: 30
  periodSeconds: 10
```

느린 시작 애플리케이션용. 이것이 성공하기 전까지 Liveness/Readiness는 무시.

### 7.6 리소스 요청 및 제한

**Requests vs Limits:**

```yaml
containers:
  - name: app
    image: myapp:v1
    resources:
      requests:
        cpu: 250m          # 최소 필요량
        memory: 256Mi
      limits:
        cpu: 500m          # 최대 사용량
        memory: 512Mi
```

- **requests**: Pod 스케줄링 시 필요한 리소스 (이것을 기준으로 노드 선택)
- **limits**: Pod이 사용할 수 있는 최대 리소스 (초과하면 Throttle 또는 OOMKill)

**QoS Classes:**

- **Guaranteed**: requests == limits (최고 우선순위)
- **Burstable**: requests < limits (중간 우선순위)
- **BestEffort**: requests/limits 없음 (최저 우선순위)

메모리 부족 시 BestEffort부터 제거됨.

---

## 8. Label과 Selector

### 8.1 Label 개념

**정의:**

Label은 **키-값 쌍으로 리소스를 분류하고 선택**하기 위한 메타데이터이다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: myapp-pod
  labels:
    app: myapp           # 애플리케이션 이름
    version: v1          # 버전
    environment: prod    # 환경
    tier: backend        # 계층
spec:
  containers:
    - name: myapp
      image: myapp:v1
```

### 8.2 Selector

**Equality-based:**

```bash
# 하나의 라벨 선택
kubectl get pods -l app=myapp

# 여러 라벨 (AND)
kubectl get pods -l app=myapp,version=v1

# 라벨 제외
kubectl get pods -l app!=myapp
```

**Set-based:**

```bash
# 여러 값 중 하나
kubectl get pods -l "version in (v1, v2)"

# 여러 값 제외
kubectl get pods -l "version notin (v3, v4)"

# 라벨 존재 여부
kubectl get pods -l "tier"          # tier 라벨 있는 것만
kubectl get pods -l "!tier"         # tier 라벨 없는 것만
```

### 8.3 Annotation

**정의:**

Annotation은 **비식별 메타데이터**로 관리/모니터링 정보를 저장한다.

```yaml
metadata:
  annotations:
    description: "이것은 설명입니다"
    owner: "team-a@example.com"
    build.date: "2024-12-28"
    prometheus.io/scrape: "true"
    prometheus.io/port: "8080"
```

**Label vs Annotation:**

- Label: 리소스 식별/선택
- Annotation: 추가 정보

---

## 9. Namespace

### 9.1 Namespace 개념

**정의:**

Namespace는 **논리적 클러스터 분할**로 멀티테넌시를 구현한다.

**용도:**

- 팀/프로젝트별 리소스 격리
- 개발/스테이징/프로덕션 환경 분리
- RBAC와 함께 접근 제어

```bash
# Namespace 생성
kubectl create namespace production

# Namespace 확인
kubectl get namespaces

# 기본 Namespace 변경
kubectl config set-context --current --namespace=production
```

### 9.2 기본 Namespace

- **default**: 기본 Namespace
- **kube-system**: 시스템 컴포넌트 (etcd, API Server 등)
- **kube-public**: 모든 사용자가 접근 가능
- **kube-node-lease**: 노드 하트비트 정보

### 9.3 ResourceQuota

**역할:**

Namespace 전체 리소스 제한.

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: prod-quota
  namespace: production
spec:
  hard:
    requests.cpu: "10"
    requests.memory: "20Gi"
    limits.cpu: "20"
    limits.memory: "40Gi"
    pods: "100"
    services.nodeports: "5"
```

### 9.4 LimitRange

**역할:**

Pod/컨테이너별 리소스 제한.

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: prod-limits
  namespace: production
spec:
  limits:
    - max:
        cpu: "2"
        memory: "2Gi"
      min:
        cpu: "100m"
        memory: "128Mi"
      default:
        cpu: "500m"
        memory: "512Mi"
      type: Container
```

---

# Part 4: Workload 리소스

## 10. ReplicaSet

### 10.1 ReplicaSet 개념

**정의:**

ReplicaSet은 **지정된 수의 Pod 복제본을 유지**하는 컨트롤러이다.

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: myapp-rs
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
        - name: myapp
          image: myapp:v1
```

### 10.2 Replica 수 유지

ReplicaSet Controller는 Reconciliation Loop를 통해:

1. 현재 Pod 수 확인
2. 목표 수와 비교
3. 부족하면 생성, 초과하면 제거

```bash
# ReplicaSet 스케일링
kubectl scale replicaset myapp-rs --replicas=5

# 상태 확인
kubectl get rs
kubectl describe rs myapp-rs
```

### 10.3 Label Selector

ReplicaSet은 Label을 통해 Pod을 선택하고 관리한다.

```yaml
selector:
  matchLabels:
    app: myapp
    version: v1
  matchExpressions:
    - key: environment
      operator: In
      values:
        - production
        - staging
```

---

## 11. Deployment

### 11.1 Deployment 개념

**정의:**

Deployment는 **ReplicaSet을 관리하면서 선언적 업데이트를 제공**한다.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
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

**ReplicaSet vs Deployment:**

- ReplicaSet: Pod 복제본 유지만 담당
- Deployment: ReplicaSet 관리 + 배포 전략

### 11.2 롤링 업데이트

**프로세스:**

```
v1.0 (3개)
       ↓ (1개 교체)
v1.0 (2개) + v1.1 (1개)
       ↓ (1개 교체)
v1.0 (1개) + v1.1 (2개)
       ↓ (1개 교체)
v1.1 (3개) ✓
```

**무중단 배포:**

- 항상 서비스 가능한 Pod 유지
- 사용자 영향 최소

### 11.3 업데이트 전략

**RollingUpdate (기본값):**

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1           # 추가로 만들 수 있는 Pod 수
      maxUnavailable: 1     # 동시에 사용 불가능한 Pod 수
```

**Recreate:**

```yaml
spec:
  strategy:
    type: Recreate  # 모든 Pod 삭제 후 재생성 (다운타임 있음)
```

### 11.4 Rollback

```bash
# 롤아웃 히스토리 확인
kubectl rollout history deployment/nginx-deployment

# 이전 버전으로 롤백
kubectl rollout undo deployment/nginx-deployment

# 특정 리비전으로 롤백
kubectl rollout undo deployment/nginx-deployment --to-revision=2

# 롤아웃 상태 확인
kubectl rollout status deployment/nginx-deployment
```

---

## 12. StatefulSet

### 12.1 StatefulSet 개념

**정의:**

StatefulSet은 **상태를 가진 애플리케이션**을 관리한다.

**Deployment와의 차이:**

- Deployment: 스테이트리스 애플리케이션 (웹 서버)
- StatefulSet: 스테이트풀 애플리케이션 (데이터베이스)

### 12.2 Pod Identity (순서 보장)

**특징:**

- Pod 이름이 고정 (web-0, web-1, web-2)
- 순차적 생성/삭제
- 순서 보장

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mysql
spec:
  serviceName: mysql  # Headless Service
  replicas: 3
  selector:
    matchLabels:
      app: mysql
  template:
    metadata:
      labels:
        app: mysql
    spec:
      containers:
        - name: mysql
          image: mysql:8.0
          volumeMounts:
            - name: data
              mountPath: /var/lib/mysql
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ "ReadWriteOnce" ]
        resources:
          requests:
            storage: 10Gi
```

### 12.3 Persistent Volume 연동

StatefulSet은 volumeClaimTemplates를 통해 각 Pod마다 PVC를 자동 생성:

```
StatefulSet
  ├─ mysql-0 (PVC: mysql-0)
  ├─ mysql-1 (PVC: mysql-1)
  └─ mysql-2 (PVC: mysql-2)
```

Pod이 재시작되어도 같은 스토리지에 연결됨.

### 12.4 Headless Service

StatefulSet은 Headless Service와 함께 사용되어 고정 DNS 이름 제공:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mysql
spec:
  clusterIP: None  # Headless
  selector:
    app: mysql
  ports:
    - port: 3306
```

DNS: `mysql-0.mysql.default.svc.cluster.local`

---

## 13. DaemonSet

### 13.1 DaemonSet 개념

**정의:**

DaemonSet은 **모든 (또는 특정) 노드에서 Pod을 실행**한다.

**Deployment vs DaemonSet:**

- Deployment: replicas 수만큼 실행
- DaemonSet: 노드마다 정확히 1개 실행

### 13.2 노드마다 하나의 Pod

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter
spec:
  selector:
    matchLabels:
      app: node-exporter
  template:
    metadata:
      labels:
        app: node-exporter
    spec:
      tolerations: # Control Plane도 포함
        - key: node-role.kubernetes.io/control-plane
          effect: NoSchedule
      containers:
        - name: node-exporter
          image: prom/node-exporter:latest
          ports:
            - containerPort: 9100
```

### 13.3 사용 사례

- **로그 수집**: Fluentd, Logstash, Filebeat
- **모니터링**: Node Exporter, Datadog Agent, New Relic Agent
- **네트워크**: Calico, Flannel, Weave
- **스토리지**: Ceph, GlusterFS
- **보안**: Falco, Twistlock

---

## 14. Job과 CronJob

### 14.1 Job (일회성 작업)

**정의:**

Job은 **하나 이상의 Pod를 실행하고 정상 종료를 보장**하는 리소스이다.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: data-processing
spec:
  completions: 10        # 성공해야 하는 Pod 수
  parallelism: 3         # 동시 실행 Pod 수
  backoffLimit: 4        # 재시도 횟수
  activeDeadlineSeconds: 600  # 최대 실행 시간
  template:
    spec:
      containers:
        - name: processor
          image: processor:v1
          command: [ "python", "process.py" ]
      restartPolicy: OnFailure
```

**상태:**

- Active: 실행 중
- Succeeded: 완료
- Failed: 실패

```bash
# Job 상태 확인
kubectl get jobs
kubectl describe job data-processing
kubectl logs -f <pod-name>
```

### 14.2 CronJob (주기적 작업)

**정의:**

CronJob은 **스케줄에 따라 주기적으로 Job을 실행**한다.

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup
spec:
  schedule: "0 2 * * *"  # 매일 오전 2시
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: backup
              image: backup-tool:v1
              command: [ "bash", "backup.sh" ]
          restartPolicy: OnFailure
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
```

**Cron 표현식:**

```
분 시 일 월 요일
0  2  *  *  *    매일 오전 2시
0  */6 * * *    6시간마다
30 18 * * 1     매주 월요일 오후 6시 30분
0  0  1 * *     매달 1일
```

---

# Part 5: 네트워킹

## 15. Service

### 15.1 Service 개념 (안정적인 엔드포인트)

**정의:**

Service는 **Pod 집합에 대한 안정적인 네트워크 엔드포인트**를 제공한다.

**필요 이유:**

- Pod IP는 동적 (Pod 재생성 시 변경)
- Pod이 여러 개 있을 때 로드 밸런싱 필요
- 클러스터 내부/외부 접근 경로 필요

```
┌──────────────────────────────┐
│      Service (안정적)        │
│  ClusterIP: 10.0.1.5         │
│  Port: 80                    │
└─────────────┬────────────────┘
      │ 라우팅
      ├────→ Pod-A: 172.17.0.2
      ├────→ Pod-B: 172.17.0.3
      └────→ Pod-C: 172.17.0.4
```

### 15.2 ClusterIP (기본값)

**특징:**

- 클러스터 내부에서만 접근 가능
- VIP (Virtual IP) 할당
- 로드 밸런싱

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  type: ClusterIP
  selector:
    app: myapp
  ports:
    - port: 80          # Service 포트
      targetPort: 8080  # Pod 포트
```

```bash
# 클러스터 내부에서만 접근 가능
kubectl run -it --image=busybox --restart=Never -- wget http://myapp
```

### 15.3 NodePort

**특징:**

- 모든 노드의 특정 포트에 노출
- 클러스터 외부에서 접근 가능
- ClusterIP + NodePort

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  type: NodePort
  selector:
    app: myapp
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080  # 선택사항 (자동 할당: 30000-32767)
```

```bash
# 접근 방법
curl http://<node-ip>:30080
```

### 15.4 LoadBalancer

**특징:**

- 클라우드 제공자의 로드 밸런서 사용
- 외부 IP 할당
- NodePort + LoadBalancer

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  type: LoadBalancer
  selector:
    app: myapp
  ports:
    - port: 80
      targetPort: 8080
```

### 15.5 ExternalName

**특징:**

- 클러스터 외부 서비스 매핑
- CNAME 리다이렉트

```yaml
apiVersion: v1
kind: Service
metadata:
  name: external-db
spec:
  type: ExternalName
  externalName: db.example.com
  ports:
    - port: 3306
```

### 15.6 Headless Service

**특징:**

- ClusterIP 없음 (None)
- Pod DNS 이름 직접 노출
- StatefulSet과 함께 사용

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mysql-headless
spec:
  clusterIP: None
  selector:
    app: mysql
  ports:
    - port: 3306
```

DNS: `mysql-0.mysql-headless.default.svc.cluster.local`

### 15.7 Session Affinity

```yaml
spec:
  sessionAffinity: ClientIP  # 같은 클라이언트는 같은 Pod으로
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800
```

---

## 16. Endpoints

### 16.1 Endpoints 자동 생성

Service가 생성되면 Endpoint 컨트롤러가 자동으로 Endpoint를 생성/관리한다.

```bash
# Endpoints 확인
kubectl get endpoints
kubectl describe endpoints myapp
```

### 16.2 수동 Endpoints 관리

Service 없이 Endpoint를 수동 생성할 수 있다:

```yaml
apiVersion: v1
kind: Endpoints
metadata:
  name: external-service
subsets:
  - addresses:
      - ip: 192.168.1.100
    ports:
      - port: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: external-service
spec:
  ports:
    - port: 80
      targetPort: 8080
  # selector 없음 (수동 Endpoints 사용)
```

---

## 17. Ingress

### 17.1 Ingress 개념

**정의:**

Ingress는 **HTTP/HTTPS 기반 외부 접근을 제공**하는 API 객체이다.

**특징:**

- URL 경로에 따른 라우팅
- 호스트명에 따른 라우팅
- TLS/SSL 종료
- 로드 밸런싱

```
Internet
   ↓
┌──────────────────────────┐
│   Ingress Controller     │  (Nginx, Traefik 등)
└──────────────────────────┘
   ↓ 라우팅
┌──────────────────────────────────────────────┐
│ example.com/api  → api-service              │
│ example.com/web  → web-service              │
│ api.example.com  → api-service              │
└──────────────────────────────────────────────┘
```

### 17.2 Ingress Controller (Nginx, Traefik, HAProxy)

**설치 (Nginx):**

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml
```

**주요 Ingress Controller:**

- **Nginx**: 가장 널리 사용, 높은 성능
- **Traefik**: 동적 설정, 자동 HTTPS
- **HAProxy**: 높은 성능, 복잡한 설정
- **Istio**: Service Mesh 통합

### 17.3 경로 기반 라우팅

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: path-based
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

### 17.4 호스트 기반 라우팅

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: host-based
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

### 17.5 TLS/SSL 설정

**Secret 생성:**

```bash
kubectl create secret tls tls-secret \
  --cert=path/to/tls.crt \
  --key=path/to/tls.key
```

**Ingress에 TLS 적용:**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: tls-ingress
spec:
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
                name: myapp
                port:
                  number: 80
```

### 17.6 Cert-Manager (자동 인증서 발급)

**설치:**

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
```

**Let's Encrypt ClusterIssuer:**

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
    - hosts:
        - example.com
      secretName: example-tls
  rules:
    - host: example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: myapp
                port:
                  number: 80
```

---

## 18. NetworkPolicy

### 18.1 NetworkPolicy 개념

**정의:**

NetworkPolicy는 **Pod 간의 네트워크 트래픽을 제어**한다.

**특징:**

- Ingress (수신) 제어
- Egress (송신) 제어
- Label 기반 선택

**기본 규칙:**

- 정책이 없으면 모든 트래픽 허용
- 정책 있으면 명시된 트래픽만 허용 (화이트리스트)

### 18.2 Ingress 제어

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

### 18.3 Egress 제어

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-external-egress
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
    - to: # DNS 허용
        - namespaceSelector: { }
      ports:
        - protocol: UDP
          port: 53
```

### 18.4 정책 예제

**모든 Pod 격리 (기본):**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
spec:
  podSelector: { }
  policyTypes:
    - Ingress
    - Egress
```

---

## 19. CNI (Container Network Interface)

### 19.1 CNI 플러그인 역할

**정의:**

CNI는 **Pod 간 네트워킹을 제공하는 플러그인 아키텍처**이다.

**책임:**

- Pod에 IP 주소 할당
- Pod 간 통신 제공
- 네트워크 정책 구현

### 19.2 Calico

**개요:**

- **프로토콜**: BGP, IPIP, VXLAN
- **성능**: 매우 높음
- **기능**: NetworkPolicy 지원, 네트워크 정책 강화

**특징:**

**BGP 모드 (기본):**

```
Pod1 → Router → Network → Router → Pod2
```

- 직접 라우팅
- 최고 성능
- 특정 네트워크 환경 필요

**IPIP 모드:**

```
Pod1 → [IP in IP 터널] → Pod2
```

- 모든 네트워크에서 작동
- 약간의 성능 오버헤드

**설치:**

```bash
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.26.1/manifests/tigera-operator.yaml
```

**NetworkPolicy 지원:**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: calico-policy
spec:
  podSelector:
    matchLabels:
      app: myapp
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: production
      ports:
        - protocol: TCP
          port: 8080
```

### 19.3 Flannel

**개요:**

- **프로토콜**: VXLAN, Host-GW, UDP
- **단순성**: 설정 간단
- **성능**: 중간 수준

**특징:**

**VXLAN 모드:**

```
Pod1 → VXLAN 터널 → Pod2
```

- 가장 호환성 높음
- 모든 네트워크에서 작동

**Host-GW 모드:**

```
Pod1 → 호스트 라우팅 → Pod2
```

- 높은 성능
- 같은 네트워크 세그먼트에서만 작동

**설치:**

```bash
kubectl apply -f https://raw.githubusercontent.com/coreos/flannel/master/Documentation/kube-flannel.yml
```

### 19.4 Cilium

**개요:**

- **프로토콜**: eBPF 기반
- **성능**: 매우 높음
- **기능**: 고급 보안, 성능 모니터링

**특징:**

**eBPF (Extended Berkeley Packet Filter):**

- 커널 수준에서 동작
- 매우 높은 성능
- 실시간 모니터링

**고급 기능:**

- L7 트래픽 정책
- 마이크로세그먼테이션
- 서비스 메시 기능

**설치:**

```bash
helm repo add cilium https://helm.cilium.io
helm install cilium cilium/cilium --namespace kube-system
```

**예제:**

```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: advanced-policy
spec:
  endpointSelector:
    matchLabels:
      app: web
  ingress:
    - fromEndpoints:
        - matchLabels:
            app: frontend
      toPorts:
        - ports:
            - port: "80"
              protocol: TCP
          rules:
            http:
              - method: "GET"
                path: "/api/.*"
```

### 19.5 Weave

**개요:**

- **프로토콜**: VXLAN, 암호화
- **특징**: 자동 발견, 암호화 지원
- **용도**: 간단한 배포, 보안 요구 환경

### 19.6 CNI 비교

| 특성                | Calico | Flannel | Cilium | Weave |
|-------------------|--------|---------|--------|-------|
| **성능**            | 높음     | 중간      | 매우 높음  | 중간    |
| **NetworkPolicy** | 지원     | 미지원     | 지원     | 지원    |
| **설정 난이도**        | 중간     | 낮음      | 높음     | 낮음    |
| **확장성**           | 매우 높음  | 높음      | 매우 높음  | 중간    |
| **암호화**           | 선택     | 선택      | 지원     | 기본    |
| **모니터링**          | 기본     | 기본      | 고급     | 기본    |
| **대규모 클러스터**      | 추천     | 가능      | 추천     | 소규모   |
| **커뮤니티**          | 매우 활발  | 활발      | 매우 활발  | 활발    |

---

# Part 6: 스토리지

## 20. Volume

### 20.1 Volume 종류

Volume은 Pod의 생명주기와 관계없이 데이터를 유지한다.

### 20.2 emptyDir

**특징:**

- Pod 생성 시 생성, 삭제 시 삭제
- Pod 내 컨테이너 간 데이터 공유
- 노드의 임시 스토리지 사용

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: emptydir-example
spec:
  containers:
    - name: writer
      image: ubuntu
      command: [ "sh", "-c", "while true; do echo $RANDOM >> /tmp/shared-data/data.txt; sleep 10; done" ]
      volumeMounts:
        - name: shared
          mountPath: /tmp/shared-data
    - name: reader
      image: ubuntu
      command: [ "sh", "-c", "while true; do tail -10 /tmp/shared-data/data.txt; sleep 5; done" ]
      volumeMounts:
        - name: shared
          mountPath: /tmp/shared-data
  volumes:
    - name: shared
      emptyDir: { }
```

### 20.3 hostPath

**특징:**

- 호스트 노드의 파일 시스템 접근
- 노드 특화 작업 (로그, 시스템 파일)
- 보안 위험 (Pod이 호스트 파일 접근 가능)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: hostpath-example
spec:
  containers:
    - name: app
      image: myapp:v1
      volumeMounts:
        - name: logs
          mountPath: /var/log
        - name: host-root
          mountPath: /host
          readOnly: true
  volumes:
    - name: logs
      hostPath:
        path: /var/log
        type: Directory
    - name: host-root
      hostPath:
        path: /
        type: Directory
```

### 20.4 configMap/secret

**configMap 사용:**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  app.properties: |
    server.port=8080
    app.name=myapp
---
apiVersion: v1
kind: Pod
metadata:
  name: configmap-example
spec:
  containers:
    - name: app
      image: myapp:v1
      volumeMounts:
        - name: config
          mountPath: /etc/config
  volumes:
    - name: config
      configMap:
        name: app-config
```

**secret 사용:**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
type: Opaque
data:
  username: dXNlcg==  # base64 encoded "user"
  password: cGFzc3dvcmQ=  # base64 encoded "password"
---
apiVersion: v1
kind: Pod
metadata:
  name: secret-example
spec:
  containers:
    - name: app
      image: myapp:v1
      volumeMounts:
        - name: secrets
          mountPath: /etc/secrets
  volumes:
    - name: secrets
      secret:
        secretName: db-credentials
```

### 20.5 PV/PVC

Persistent Volume과 Persistent Volume Claim의 조합으로 영구 스토리지 제공.

---

## 21. PersistentVolume (PV)

### 21.1 PV 개념

**정의:**

PV는 **클러스터 레벨의 스토리지 리소스**로 관리자가 프로비저닝한다.

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: my-pv
spec:
  capacity:
    storage: 10Gi
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: fast-ssd
  nfs:
    server: 192.168.1.100
    path: "/mnt/data"
```

**accessModes:**

- **ReadWriteOnce (RWO)**: 한 노드에서 읽기/쓰기
- **ReadOnlyMany (ROX)**: 여러 노드에서 읽기만
- **ReadWriteMany (RWX)**: 여러 노드에서 읽기/쓰기

**persistentVolumeReclaimPolicy:**

- **Retain**: PVC 삭제 후 PV 유지 (수동 정리)
- **Delete**: PVC 삭제 시 PV도 삭제
- **Recycle**: PVC 삭제 시 데이터 삭제 후 PV 재사용 (deprecated)

### 21.2 Storage Class

**정의:**

StorageClass는 **PV를 동적으로 생성하는 템플릿**이다.

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: kubernetes.io/aws-ebs
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
  fstype: ext4
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
```

### 21.3 Dynamic Provisioning

**프로세스:**

```
PVC 생성
   ↓
StorageClass에 따라 자동 생성
   ↓
PV 생성 및 바인딩
   ↓
Pod에서 사용
```

---

## 22. PersistentVolumeClaim (PVC)

### 22.1 PVC 개념

**정의:**

PVC는 **사용자가 스토리지를 요청**하는 것이다.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  storageClassName: fast-ssd
```

### 22.2 PV와 바인딩

**바인딩 프로세스:**

```
PVC 생성
   ↓
조건 일치하는 PV 검색
   ↓
PV와 PVC 바인딩
   ↓
Pod에서 PVC 사용
```

**사용 예:**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: mysql-pod
spec:
  containers:
    - name: mysql
      image: mysql:8.0
      volumeMounts:
        - name: data
          mountPath: /var/lib/mysql
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: my-pvc
```

---

## 23. ConfigMap과 Secret

### 23.1 ConfigMap (설정 관리)

**용도:**

- 애플리케이션 설정
- 환경 변수
- 설정 파일

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: default
data:
  # Key-value 형식
  server.port: "8080"
  server.timeout: "30"
  # 파일 형식
  application.yaml: |
    server:
      port: 8080
      ssl: true
    database:
      host: localhost
      port: 5432
```

### 23.2 Secret (민감 정보 관리)

**종류:**

- **Opaque**: 기본, 임의의 데이터
- **kubernetes.io/service-account-token**: ServiceAccount 토큰
- **kubernetes.io/dockercfg**: Docker 설정
- **kubernetes.io/dockerconfigjson**: Docker 설정 (JSON)
- **kubernetes.io/basic-auth**: 기본 인증
- **kubernetes.io/ssh-auth**: SSH 인증
- **kubernetes.io/tls**: TLS 인증서

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-secret
type: Opaque
stringData: # base64 인코딩 자동
  username: admin
  password: securepassword
```

### 23.3 Volume으로 마운트

**ConfigMap:**

```yaml
volumeMounts:
  - name: config
    mountPath: /etc/config
volumes:
  - name: config
    configMap:
      name: app-config
```

**Secret:**

```yaml
volumeMounts:
  - name: secrets
    mountPath: /etc/secrets
    readOnly: true
volumes:
  - name: secrets
    secret:
      secretName: db-secret
```

### 23.4 환경 변수로 주입

**ConfigMap에서:**

```yaml
containers:
  - name: app
    env:
      - name: SERVER_PORT
        valueFrom:
          configMapKeyRef:
            name: app-config
            key: server.port
```

**Secret에서:**

```yaml
containers:
  - name: app
    env:
      - name: DB_PASSWORD
        valueFrom:
          secretKeyRef:
            name: db-secret
            key: password
```

---

# Part 7: 보안

## 24. RBAC (Role-Based Access Control)

### 24.1 ServiceAccount

**정의:**

ServiceAccount는 **Pod이 API Server와 통신할 때 사용하는 신원**이다.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: myapp-sa
  namespace: default
```

```bash
# ServiceAccount 확인
kubectl get serviceaccount
kubectl describe serviceaccount myapp-sa

# 토큰 확인
kubectl get secret
```

### 24.2 Role과 ClusterRole

**Role (Namespace 범위):**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: default
rules:
  - apiGroups: [ "" ]
    resources: [ "pods" ]
    verbs: [ "get", "list", "watch" ]
  - apiGroups: [ "" ]
    resources: [ "pods/logs" ]
    verbs: [ "get" ]
```

**ClusterRole (전체 클러스터 범위):**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: admin
rules:
  - apiGroups: [ "*" ]
    resources: [ "*" ]
    verbs: [ "*" ]
```

### 24.3 RoleBinding과 ClusterRoleBinding

**RoleBinding:**

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
  - kind: User
    name: user@example.com
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

**ClusterRoleBinding:**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: read-secrets-global
subjects:
  - kind: ServiceAccount
    name: myapp-sa
    namespace: default
roleRef:
  kind: ClusterRole
  name: secret-reader
  apiGroup: rbac.authorization.k8s.io
```

---

## 25. Pod Security

### 25.1 SecurityContext

**Pod 수준:**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: security-pod
spec:
  securityContext:
    runAsUser: 1000
    runAsGroup: 3000
    fsGroup: 2000
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: app
      image: myapp:v1
      securityContext:
        allowPrivilegeEscalation: false
        capabilities:
          add:
            - NET_BIND_SERVICE
          drop:
            - ALL
        readOnlyRootFilesystem: true
```

### 25.2 PodSecurityPolicy (deprecated)

K8s 1.25부터 제거됨. Pod Security Standards 사용 권장.

### 25.3 Pod Security Standards

**Privileged:**

- 권한 무제한
- 특수 목적용

**Baseline:**

- 일반적인 공격으로부터 보호
- 대부분의 Pod에 적합

**Restricted:**

- 보안 모범 사례 적용
- 엄격한 정책

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: secure
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

---

## 26. Network Security

### 26.1 NetworkPolicy

(Part 5의 NetworkPolicy 섹션 참고)

### 26.2 Service Mesh (Istio, Linkerd)

**정의:**

Service Mesh는 **마이크로서비스 간의 통신을 관리 및 보안**한다.

**Istio:**

```bash
# 설치
curl -L https://istio.io/downloadIstio | sh -
cd istio-1.17.2
export PATH=$PWD/bin:$PATH
istioctl install --set profile=demo -y
```

**VirtualService:**

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: myapp
spec:
  hosts:
    - myapp
  http:
    - match:
        - uri:
            prefix: "/v1"
      route:
        - destination:
            host: myapp
            subset: v1
    - route:
        - destination:
            host: myapp
            subset: v2
          weight: 90
        - destination:
            host: myapp
            subset: v3
          weight: 10
```

**DestinationRule:**

```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: myapp
spec:
  host: myapp
  trafficPolicy:
    connectionPool:
      http:
        http1MaxPendingRequests: 100
        http2MaxRequests: 100
  subsets:
    - name: v1
      labels:
        version: v1
    - name: v2
      labels:
        version: v2
```

---

# Part 8: 고급 기능

## 27. Auto-scaling

### 27.1 HPA (Horizontal Pod Autoscaler)

**정의:**

HPA는 **CPU/메모리 사용률에 따라 Pod 수를 자동 조정**한다.

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
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 30
```

**모니터링:**

```bash
# HPA 상태 확인
kubectl get hpa
kubectl describe hpa myapp-hpa

# 실시간 모니터링
kubectl get hpa myapp-hpa --watch
```

### 27.2 VPA (Vertical Pod Autoscaler)

**정의:**

VPA는 **Pod의 리소스 요청/제한을 자동 조정**한다.

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: myapp-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  updatePolicy:
    updateMode: "Auto"  # Off, Initial, Recreate, Auto
```

### 27.3 Cluster Autoscaler

**정의:**

Cluster Autoscaler는 **Pod을 스케줄할 수 없을 때 자동으로 노드 추가**한다.

```bash
# AWS 예시
kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/master/cluster-autoscaler/cloudprovider/aws/examples/cluster-autoscaler-autodiscover.yaml
```

---

## 28. 배포 전략

### 28.1 Rolling Update

**프로세스:**

```
v1.0 (3개)
   ↓ (1개 교체)
v1.0 (2개) + v1.1 (1개)
   ↓ (1개 교체)
v1.0 (1개) + v1.1 (2개)
   ↓ (1개 교체)
v1.1 (3개) ✓
```

**설정:**

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 1
```

### 28.2 Blue-Green 배포

**프로세스:**

```
Blue (v1.0)  현재 프로덕션
   ↓
Green (v1.1) 준비
   ↓
테스트 후
   ↓
트래픽 전환 (즉시)
   ↓
Green (v1.1)  현재 프로덕션
```

**이점:**

- 즉시 전환
- 빠른 롤백
- 무중단

**구현:**

```yaml
# Blue (v1.0)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-blue
spec:
  replicas: 3
  template:
    metadata:
      labels:
        app: myapp
        version: blue
    spec:
      containers:
        - name: myapp
          image: myapp:v1.0
---
# Service (Blue로 라우팅)
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  selector:
    app: myapp
    version: blue
  ports:
    - port: 80
      targetPort: 8080
```

테스트 후 Service 선택자를 green으로 변경.

### 28.3 Canary 배포

**프로세스:**

```
v1.0 (90%)  기존 버전
+
v1.1 (10%)  신규 버전 테스트
   ↓ (모니터링)
v1.0 (50%)
+
v1.1 (50%)  점진적 증가
   ↓ (모니터링)
v1.1 (100%) 완전 전환
```

**Istio VirtualService로 구현:**

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: myapp
spec:
  hosts:
    - myapp
  http:
    - match:
        - uri:
            prefix: "/"
      route:
        - destination:
            host: myapp
            subset: v1
          weight: 90
        - destination:
            host: myapp
            subset: v1.1
          weight: 10
```

### 28.4 A/B 테스팅

```yaml
# 특정 사용자에게 새 버전 제공
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: myapp
spec:
  hosts:
    - myapp
  http:
    - match:
        - headers:
            user-id:
              exact: "test-user"
      route:
        - destination:
            host: myapp
            subset: v2
    - route:
        - destination:
            host: myapp
            subset: v1
```

---

## 29. Helm

### 29.1 Helm 개념 (K8s 패키지 매니저)

**정의:**

Helm은 **Kubernetes 패키지를 쉽게 설치, 업그레이드, 관리**하는 도구이다.

**삼각 (Three Cs):**

- **Chart**: Helm 패키지 (템플릿 + 설정)
- **Config**: 차트의 설정값
- **Release**: 배포된 인스턴스

### 29.2 Chart 구조

```
myapp-chart/
├── Chart.yaml              # 차트 메타데이터
├── values.yaml             # 기본 설정값
├── templates/
│   ├── deployment.yaml     # 템플릿
│   ├── service.yaml
│   ├── configmap.yaml
│   ├── _helpers.tpl        # 헬퍼 함수
│   └── NOTES.txt           # 설치 후 메시지
├── charts/                 # 서브차트 (의존성)
└── README.md
```

### 29.3 Helm 명령어

```bash
# 차트 저장소 추가
helm repo add nginx-stable https://helm.nginx.com/stable
helm repo update

# 차트 검색
helm search repo nginx

# 차트 설치
helm install my-nginx nginx-stable/nginx-ingress

# 릴리스 확인
helm list
helm status my-nginx

# 차트 업그레이드
helm upgrade my-nginx nginx-stable/nginx-ingress --set replicas=3

# 롤백
helm rollback my-nginx 1

# 제거
helm uninstall my-nginx
```

### 29.4 Chart 작성

**Chart.yaml:**

```yaml
apiVersion: v2
name: myapp
description: A Helm chart for my application
type: application
version: 1.0.0
appVersion: "1.0"
```

**values.yaml:**

```yaml
replicaCount: 3

image:
  repository: myapp
  tag: "latest"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 80
  targetPort: 8080

ingress:
  enabled: false
  hosts:
    - host: myapp.example.com
      paths:
        - path: /
          pathType: Prefix
```

**templates/deployment.yaml:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: { { include "myapp.fullname" . } }
spec:
  replicas: { { .Values.replicaCount } }
  selector:
    matchLabels:
      app: { { include "myapp.name" . } }
  template:
    metadata:
      labels:
        app: { { include "myapp.name" . } }
    spec:
      containers:
        - name: { { .Chart.Name } }
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          ports:
            - containerPort: { { .Values.service.targetPort } }
```

---

## 30. 모니터링 및 로깅

### 30.1 Prometheus + Grafana

**Prometheus:**

- 시계열 메트릭 데이터베이스
- 풀 기반 수집
- 강력한 쿼리 언어 (PromQL)

**설치:**

```bash
# Prometheus 설치 (Helm)
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack
```

**ServiceMonitor:**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: myapp
spec:
  selector:
    matchLabels:
      app: myapp
  endpoints:
    - port: metrics
      interval: 30s
```

**Grafana:**

```bash
# Grafana 접근
kubectl port-forward svc/prometheus-grafana 3000:80
# http://localhost:3000 (기본: admin/prom-operator)
```

### 30.2 ELK/EFK Stack

**ELK:**

- Elasticsearch (저장소)
- Logstash (처리)
- Kibana (시각화)

**EFK:**

- Elasticsearch
- Fluentd (경량 로그 수집)
- Kibana

**Fluentd 설정:**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluentd-config
data:
  fluent.conf: |
    <source>
      @type tail
      path /var/log/containers/*.log
      pos_file /var/log/fluentd-containers.log.pos
      tag kubernetes.*
      read_from_head true
      <parse>
        @type json
        time_format %Y-%m-%dT%H:%M:%S.%NZ
      </parse>
    </source>

    <match kubernetes.**>
      @type elasticsearch
      @id output_elasticsearch
      @log_level info
      include_tag_key true
      host "elasticsearch"
      port 9200
      path_scheme "http"
      logstash_format true
      logstash_prefix "k8s"
    </match>
```

### 30.3 Loki

**특징:**

- 로그에 최적화
- 비용 효율적
- Prometheus와 동일한 라벨 사용

**설치:**

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm install loki grafana/loki-stack
```

**Promtail 설정:**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: promtail-config
data:
  promtail.yaml: |
    clients:
      - url: http://loki:3100/loki/api/v1/push
    scrape_configs:
    - job_name: kubernetes-pods
      kubernetes_sd_configs:
      - role: pod
      relabel_configs:
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
```

---

## 다음 단계

이 가이드는 Kubernetes의 기본부터 고급까지 포함합니다:

- **Part 1-2**: 기초 개념과 아키텍처 이해
- **Part 3-4**: 리소스 관리 실무
- **Part 5-6**: 네트워킹과 스토리지
- **Part 7-8**: 보안과 고급 운영

**학습 순서:**

1. 로컬에서 minikube/kind로 시작
2. 기본 워크로드 배포 (Pod, Deployment)
3. 서비스와 네트워크 이해
4. 스토리지 관리
5. 보안 및 RBAC 설정
6. 모니터링 및 로깅 구현
7. 배포 자동화 (CI/CD)

**추천 리소스:**

- [Kubernetes 공식 문서](https://kubernetes.io/docs)
- [Kubernetes by Example](https://kubernetesbyexample.com)
- [CKA 시험 준비](https://linuxacademy.com)
