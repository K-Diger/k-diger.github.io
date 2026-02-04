---
layout: post
title: "Part 16/26: Resource Limits와 QoS"
date: 2026-01-06
categories: [Kubernetes]
tags: [kubernetes, resources, limits, requests, qos, cka]
---

Kubernetes에서 리소스 관리는 클러스터 안정성과 애플리케이션 성능의 핵심이다. **requests**는 스케줄링의 기준이 되고, **limits**는 런타임 제한을 설정한다. 이 두 값이 Pod의 **QoS(Quality of Service) 클래스**를 결정하며, 리소스 부족 시 어떤 Pod가 먼저 축출되는지에 영향을 미친다.

## 리소스 요청(Requests)과 제한(Limits)

> **원문 ([kubernetes.io - Resource Management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)):**
> When you specify a Pod, you can optionally specify how much of each resource a container needs. The most common resources to specify are CPU and memory (RAM).

**번역:** Pod를 지정할 때 선택적으로 각 컨테이너에 필요한 리소스 양을 지정할 수 있다. 지정하는 가장 일반적인 리소스는 CPU와 메모리(RAM)이다.

### 기본 개념

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: resource-demo
spec:
  containers:
  - name: app
    image: nginx
    resources:
      requests:        # 보장받는 최소 리소스
        memory: "256Mi"
        cpu: "250m"
      limits:          # 사용 가능한 최대 리소스
        memory: "512Mi"
        cpu: "500m"
```

**requests**:
- 스케줄러가 노드를 선택할 때 사용
- 이 양은 항상 사용 가능하도록 보장
- Pod가 실제로 사용하든 안 하든 예약됨

**limits**:
- 컨테이너가 사용할 수 있는 최대치
- 초과 시 제한 또는 종료됨

### CPU 단위

| 표기 | 의미 |
|------|------|
| 1 | 1 vCPU/Core |
| 1000m | 1 vCPU (m = millicore) |
| 500m | 0.5 vCPU |
| 100m | 0.1 vCPU |

**CPU 제한 동작**:
- CPU limits 초과 시 **스로틀링** (죽지 않음)
- CFS(Completely Fair Scheduler)가 CPU 시간 제한
- 성능 저하는 발생하지만 컨테이너 종료 아님

### 메모리 단위

| 표기 | 의미 |
|------|------|
| 1Gi | 1 GiB = 1024 MiB |
| 1G | 1 GB = 1000 MB |
| 256Mi | 256 MiB |
| 256M | 256 MB |

**메모리 제한 동작**:
- Memory limits 초과 시 **OOMKilled** (컨테이너 종료)
- 커널의 OOM Killer가 프로세스 종료
- 재시작 정책에 따라 다시 시작

### 리소스 설정 예시

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-pod
spec:
  containers:
  - name: app
    image: myapp:1.0
    resources:
      requests:
        memory: "128Mi"
        cpu: "100m"
      limits:
        memory: "256Mi"
        cpu: "200m"
  - name: sidecar
    image: log-agent:1.0
    resources:
      requests:
        memory: "64Mi"
        cpu: "50m"
      limits:
        memory: "128Mi"
        cpu: "100m"
```

**Pod 전체 리소스** = 모든 컨테이너의 합:
- Total requests: 192Mi memory, 150m CPU
- Total limits: 384Mi memory, 300m CPU

## QoS (Quality of Service) 클래스

> **원문 ([kubernetes.io - Pod QoS Classes](https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/)):**
> Kubernetes classifies Pods into one of three QoS classes: Guaranteed, Burstable, and BestEffort. The QoS class of a Pod is determined by the resource requests and limits of its containers.

**번역:** Kubernetes는 Pod를 세 가지 QoS 클래스 중 하나로 분류한다: Guaranteed, Burstable, BestEffort. Pod의 QoS 클래스는 컨테이너의 리소스 requests와 limits에 의해 결정된다.

Pod의 requests와 limits 설정에 따라 QoS 클래스가 결정된다.

### Guaranteed

**가장 높은 우선순위**. 리소스 부족 시 가장 마지막에 축출된다.

```yaml
# Guaranteed: requests == limits (모든 컨테이너)
apiVersion: v1
kind: Pod
metadata:
  name: guaranteed-pod
spec:
  containers:
  - name: app
    image: nginx
    resources:
      requests:
        memory: "256Mi"
        cpu: "500m"
      limits:
        memory: "256Mi"  # requests와 동일
        cpu: "500m"      # requests와 동일
```

**조건**:
- 모든 컨테이너에 memory, cpu limits가 설정됨
- requests == limits (requests 생략 시 limits와 동일하게 설정됨)

### Burstable

**중간 우선순위**. 리소스 여유가 있으면 limits까지 사용 가능.

```yaml
# Burstable: requests < limits 또는 일부만 설정
apiVersion: v1
kind: Pod
metadata:
  name: burstable-pod
spec:
  containers:
  - name: app
    image: nginx
    resources:
      requests:
        memory: "128Mi"
        cpu: "100m"
      limits:
        memory: "256Mi"
        cpu: "500m"
```

**조건**:
- Guaranteed 조건을 만족하지 않음
- 최소 하나의 컨테이너에 requests 또는 limits가 설정됨

### BestEffort

**가장 낮은 우선순위**. 리소스 부족 시 가장 먼저 축출된다.

```yaml
# BestEffort: 아무것도 설정 안 함
apiVersion: v1
kind: Pod
metadata:
  name: besteffort-pod
spec:
  containers:
  - name: app
    image: nginx
    # resources 설정 없음
```

**조건**:
- 어떤 컨테이너에도 requests/limits가 없음

### QoS 클래스 확인

```bash
kubectl get pod <pod-name> -o jsonpath='{.status.qosClass}'

# 또는 describe
kubectl describe pod <pod-name> | grep "QoS Class"
```

### 축출(Eviction) 우선순위

노드 리소스 부족 시:

```
1. BestEffort    → 가장 먼저 축출
2. Burstable     → requests 대비 사용량이 높은 순
3. Guaranteed    → 가장 마지막
```

## LimitRange

**Namespace 수준**에서 기본값과 범위를 설정한다.

### Container LimitRange

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: container-limits
  namespace: development
spec:
  limits:
  - type: Container
    default:        # limits 기본값
      cpu: "500m"
      memory: "256Mi"
    defaultRequest: # requests 기본값
      cpu: "100m"
      memory: "128Mi"
    max:            # 최대값
      cpu: "2"
      memory: "1Gi"
    min:            # 최소값
      cpu: "50m"
      memory: "64Mi"
```

### Pod LimitRange

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: pod-limits
  namespace: development
spec:
  limits:
  - type: Pod
    max:
      cpu: "4"
      memory: "2Gi"
    min:
      cpu: "100m"
      memory: "128Mi"
```

### PVC LimitRange

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: storage-limits
  namespace: development
spec:
  limits:
  - type: PersistentVolumeClaim
    max:
      storage: "10Gi"
    min:
      storage: "1Gi"
```

### LimitRange 동작

```bash
# LimitRange 확인
kubectl describe limitrange -n development

# 기본값 적용 테스트
kubectl run test --image=nginx -n development
kubectl get pod test -n development -o yaml | grep -A10 resources
```

**LimitRange 없이 Pod 생성 → requests/limits 없음**
**LimitRange 있으면 → 기본값 자동 적용**

## ResourceQuota

**Namespace 전체의 리소스 사용량**을 제한한다.

### Compute ResourceQuota

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: compute-quota
  namespace: development
spec:
  hard:
    requests.cpu: "4"
    requests.memory: "8Gi"
    limits.cpu: "8"
    limits.memory: "16Gi"
    pods: "20"
```

### Object Count Quota

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: object-quota
  namespace: development
spec:
  hard:
    persistentvolumeclaims: "10"
    services: "10"
    services.loadbalancers: "2"
    services.nodeports: "5"
    secrets: "20"
    configmaps: "20"
```

### Storage Quota

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: storage-quota
  namespace: development
spec:
  hard:
    requests.storage: "100Gi"
    persistentvolumeclaims: "10"
    # StorageClass별 제한
    fast.storageclass.storage.k8s.io/requests.storage: "50Gi"
    fast.storageclass.storage.k8s.io/persistentvolumeclaims: "5"
```

### Scope를 사용한 Quota

특정 조건의 리소스만 제한한다.

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: besteffort-quota
  namespace: development
spec:
  hard:
    pods: "5"
  scopeSelector:
    matchExpressions:
    - scopeName: PriorityClass
      operator: In
      values:
      - low
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: guaranteed-quota
  namespace: development
spec:
  hard:
    pods: "20"
  scopes:
  - NotBestEffort
```

### ResourceQuota 사용량 확인

```bash
kubectl describe resourcequota -n development

# 또는
kubectl get resourcequota -n development -o yaml
```

## 노드 리소스 확인

### 노드 용량(Capacity)과 할당 가능(Allocatable)

```bash
kubectl describe node <node-name>

# 출력 예시:
# Capacity:
#   cpu:                4
#   memory:             8167824Ki
# Allocatable:
#   cpu:                3800m
#   memory:             7452624Ki
# Allocated resources:
#   (Total limits may be over 100 percent, i.e., overcommitted.)
#   Resource           Requests    Limits
#   --------           --------    ------
#   cpu                1050m (27%) 2 (52%)
#   memory             1536Mi (21%) 2560Mi (35%)
```

**Capacity**: 노드의 전체 리소스
**Allocatable**: Pod에 할당 가능한 리소스 (시스템 예약분 제외)
**Allocated**: 현재 할당된 리소스

### 노드 리소스 요약 보기

```bash
# 모든 노드의 리소스 상태
kubectl top nodes

# 특정 노드의 Pod 리소스 사용량
kubectl top pods --all-namespaces --sort-by=memory
```

## 리소스 설정 전략

### 개발 환경

```yaml
# 넉넉한 limits, 낮은 requests
resources:
  requests:
    memory: "128Mi"
    cpu: "100m"
  limits:
    memory: "512Mi"
    cpu: "1"
```

### 운영 환경

```yaml
# Guaranteed QoS 권장
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

### 배치 작업 (Job)

```yaml
# CPU 집약적 작업
resources:
  requests:
    memory: "1Gi"
    cpu: "2"
  limits:
    memory: "2Gi"
    cpu: "4"
```

## 트러블슈팅

### OOMKilled 문제

```bash
# OOMKilled 확인
kubectl describe pod <pod-name>
# Last State: Terminated
# Reason: OOMKilled

# 해결:
# 1. memory limits 증가
# 2. 애플리케이션 메모리 누수 수정
# 3. 힙 사이즈 조정 (Java 등)
```

### CPU Throttling 문제

```bash
# throttling 확인 (cAdvisor 메트릭)
# container_cpu_cfs_throttled_seconds_total

# 해결:
# 1. CPU limits 증가
# 2. 또는 limits 제거 (무제한)
```

### 스케줄링 실패

```bash
# Pending 원인 확인
kubectl describe pod <pod-name>
# Events:
# Warning FailedScheduling: Insufficient cpu/memory

# 해결:
# 1. requests 감소
# 2. 노드 추가
# 3. 다른 Pod 정리
```

## 기술 면접 대비

### 자주 묻는 질문

**Q: requests와 limits의 차이는?**

A: requests는 스케줄러가 노드 선택에 사용하는 최소 보장 리소스이다. Pod가 스케줄되면 이 양은 항상 사용 가능하다. limits는 컨테이너가 사용할 수 있는 최대치이다. CPU limits 초과 시 스로틀링되고, memory limits 초과 시 OOMKilled로 컨테이너가 종료된다.

**Q: QoS 클래스별 축출 우선순위는?**

A: 노드 리소스 부족 시 BestEffort가 가장 먼저 축출되고, 다음으로 Burstable(requests 대비 실제 사용량이 높은 순), 마지막으로 Guaranteed가 축출된다. 중요한 워크로드는 Guaranteed로 설정하여 안정성을 확보하는 것이 좋다.

**Q: LimitRange와 ResourceQuota의 차이는?**

A: LimitRange는 개별 컨테이너/Pod/PVC에 대한 기본값과 범위를 설정한다. requests/limits를 지정하지 않은 Pod에 기본값을 적용하거나, 너무 크거나 작은 값을 거부한다. ResourceQuota는 Namespace 전체의 총 리소스 사용량을 제한한다. 전체 Pod 수, 총 CPU/메모리 사용량 등을 제한할 수 있다.

**Q: CPU limits를 설정하지 않으면?**

A: 노드의 가용 CPU를 무제한으로 사용할 수 있다. 다른 Pod와 CPU를 공유하게 되며, 리소스 경쟁 시 requests 비율에 따라 CPU 시간이 분배된다. 배치 작업이나 burst가 필요한 워크로드에서 의도적으로 limits를 설정하지 않기도 한다.

**Q: memory requests를 설정하지 않으면 발생하는 문제는?**

A: 스케줄러가 메모리 요구사항을 모르므로 부적절한 노드에 스케줄될 수 있다. 여러 Pod가 실제 필요한 메모리를 합치면 노드 용량을 초과할 수 있고, OOM 상황이 발생한다. BestEffort QoS가 되어 리소스 부족 시 먼저 축출된다.

## CKA 시험 대비 필수 명령어

```bash
# 리소스 사용량 확인
kubectl top nodes
kubectl top pods

# LimitRange 확인
kubectl describe limitrange -n <namespace>
kubectl get limitrange -n <namespace> -o yaml

# ResourceQuota 확인
kubectl describe resourcequota -n <namespace>
kubectl get resourcequota -n <namespace> -o yaml

# Pod QoS 확인
kubectl get pod <pod> -o jsonpath='{.status.qosClass}'

# 노드 리소스 확인
kubectl describe node <node> | grep -A5 "Allocated resources"
```

### CKA 빈출 시나리오

```yaml
# 시나리오 1: 리소스가 있는 Pod 생성
apiVersion: v1
kind: Pod
metadata:
  name: resource-pod
spec:
  containers:
  - name: app
    image: nginx
    resources:
      requests:
        memory: "64Mi"
        cpu: "250m"
      limits:
        memory: "128Mi"
        cpu: "500m"

# 시나리오 2: LimitRange 생성
apiVersion: v1
kind: LimitRange
metadata:
  name: mem-limit-range
  namespace: dev
spec:
  limits:
  - type: Container
    default:
      memory: "256Mi"
    defaultRequest:
      memory: "128Mi"
    max:
      memory: "512Mi"
    min:
      memory: "64Mi"

# 시나리오 3: ResourceQuota 생성
apiVersion: v1
kind: ResourceQuota
metadata:
  name: compute-quota
  namespace: dev
spec:
  hard:
    requests.cpu: "2"
    requests.memory: "2Gi"
    limits.cpu: "4"
    limits.memory: "4Gi"
    pods: "10"
```

---

## 참고 자료

### 공식 문서

- [Managing Resources for Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Resource Quotas](https://kubernetes.io/docs/concepts/policy/resource-quotas/)
- [Limit Ranges](https://kubernetes.io/docs/concepts/policy/limit-range/)
- [Pod Quality of Service Classes](https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/)
- [Horizontal Pod Autoscaling](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)

## 다음 단계

- [Kubernetes - RBAC](/kubernetes/kubernetes-17-rbac)
- [Kubernetes - Pod Security](/kubernetes/kubernetes-18-pod-security)
