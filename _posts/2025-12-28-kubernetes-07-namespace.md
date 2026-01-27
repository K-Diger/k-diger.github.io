---
title: "Part 7/26: Namespace와 ResourceQuota"
date: 2025-12-28
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, Namespace, ResourceQuota, LimitRange]
layout: post
toc: true
math: true
mermaid: true
---

## 1. Namespace 개념

### 1.1 Namespace란?

Namespace는 Kubernetes 클러스터 내에서 **리소스를 논리적으로 분리**하는 방법이다. 하나의 물리적 클러스터를 여러 개의 가상 클러스터처럼 사용할 수 있다.

```
┌─────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                        │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │   Namespace:    │  │   Namespace:    │                   │
│  │   development   │  │   production    │                   │
│  │  ┌───────────┐  │  │  ┌───────────┐  │                   │
│  │  │ Pod: web  │  │  │  │ Pod: web  │  │  (같은 이름 가능) │
│  │  │ Pod: api  │  │  │  │ Pod: api  │  │                   │
│  │  │ Svc: web  │  │  │  │ Svc: web  │  │                   │
│  │  └───────────┘  │  │  └───────────┘  │                   │
│  └─────────────────┘  └─────────────────┘                   │
│  ┌─────────────────┐                                        │
│  │   Namespace:    │                                        │
│  │   kube-system   │                                        │
│  │  (시스템 컴포넌트)│                                        │
│  └─────────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
```

**Namespace의 역할:**
- 리소스 이름 충돌 방지 (같은 이름을 다른 Namespace에서 사용 가능)
- 팀/프로젝트별 리소스 격리
- RBAC을 통한 접근 제어
- ResourceQuota를 통한 리소스 할당

### 1.2 기본 Namespace

클러스터 생성 시 자동으로 생성되는 Namespace:

| Namespace | 용도 |
|-----------|------|
| **default** | 별도 지정 없이 생성한 리소스가 들어가는 기본 Namespace |
| **kube-system** | Kubernetes 시스템 컴포넌트 (API Server, Scheduler, CoreDNS 등) |
| **kube-public** | 모든 사용자가 읽을 수 있는 리소스 (인증 없이도 접근 가능) |
| **kube-node-lease** | 노드 하트비트를 위한 Lease 객체 저장 |

```bash
# Namespace 목록 확인
kubectl get namespaces
kubectl get ns

# 특정 Namespace의 리소스 조회
kubectl get pods -n kube-system
kubectl get all -n kube-system
```

### 1.3 Namespaced vs Cluster-scoped 리소스

**Namespaced 리소스** (Namespace에 속함):
- Pod, Service, Deployment, ReplicaSet
- ConfigMap, Secret
- PersistentVolumeClaim
- Role, RoleBinding

**Cluster-scoped 리소스** (Namespace와 무관):
- Node
- PersistentVolume
- Namespace 자체
- ClusterRole, ClusterRoleBinding
- StorageClass

```bash
# Namespaced 리소스 목록
kubectl api-resources --namespaced=true

# Cluster-scoped 리소스 목록
kubectl api-resources --namespaced=false
```

---

## 2. Namespace 관리

### 2.1 Namespace 생성

```bash
# 명령형
kubectl create namespace production

# YAML로 생성
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    env: production
    team: platform
EOF
```

### 2.2 기본 Namespace 변경

```bash
# 현재 컨텍스트의 기본 Namespace 변경
kubectl config set-context --current --namespace=production

# 확인
kubectl config view --minify | grep namespace

# 이후 명령에서 -n 옵션 불필요
kubectl get pods  # production 네임스페이스의 Pod 조회
```

### 2.3 Namespace 삭제

```bash
# Namespace 삭제 (내부 모든 리소스도 삭제됨)
kubectl delete namespace production

# 주의: kube-system, kube-public 등 시스템 Namespace는 삭제하지 않는다
```

**주의사항:**
- Namespace 삭제 시 **내부 모든 리소스가 함께 삭제**된다
- 삭제 중인 Namespace는 `Terminating` 상태가 된다
- Finalizer가 있는 리소스가 있으면 삭제가 지연될 수 있다

---

## 3. ResourceQuota

### 3.1 ResourceQuota란?

ResourceQuota는 **Namespace 전체에서 사용할 수 있는 리소스의 총량을 제한**한다.

```
┌─────────────────────────────────────────────────────────────┐
│   Namespace: production                                      │
│   ResourceQuota:                                            │
│   - CPU 요청 합계: 최대 10 cores                            │
│   - Memory 요청 합계: 최대 20Gi                             │
│   - Pod 개수: 최대 100개                                    │
│                                                             │
│   현재 사용량:                                              │
│   - CPU 요청: 5 cores                                       │
│   - Memory 요청: 12Gi                                       │
│   - Pod 개수: 42개                                          │
│                                                             │
│   → 초과하는 리소스 생성 시 거부됨                          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 ResourceQuota 종류

**컴퓨팅 리소스:**

| 항목 | 설명 |
|------|------|
| `requests.cpu` | CPU 요청 합계 |
| `requests.memory` | Memory 요청 합계 |
| `limits.cpu` | CPU 제한 합계 |
| `limits.memory` | Memory 제한 합계 |

**스토리지 리소스:**

| 항목 | 설명 |
|------|------|
| `requests.storage` | PVC 스토리지 요청 합계 |
| `persistentvolumeclaims` | PVC 개수 |
| `<storageclass>.storageclass.storage.k8s.io/requests.storage` | 특정 StorageClass의 스토리지 합계 |

**오브젝트 수:**

| 항목 | 설명 |
|------|------|
| `pods` | Pod 개수 |
| `configmaps` | ConfigMap 개수 |
| `secrets` | Secret 개수 |
| `services` | Service 개수 |
| `services.loadbalancers` | LoadBalancer 타입 Service 개수 |
| `services.nodeports` | NodePort 타입 Service 개수 |

### 3.3 ResourceQuota 예시

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: compute-quota
  namespace: production
spec:
  hard:
    # 컴퓨팅 리소스
    requests.cpu: "10"
    requests.memory: 20Gi
    limits.cpu: "20"
    limits.memory: 40Gi

    # 오브젝트 수
    pods: "100"
    services: "10"
    services.loadbalancers: "2"
    services.nodeports: "5"
    configmaps: "20"
    secrets: "20"
    persistentvolumeclaims: "10"

    # 스토리지
    requests.storage: 100Gi
```

### 3.4 ResourceQuota 확인

```bash
# Quota 확인
kubectl get resourcequota -n production
kubectl describe resourcequota compute-quota -n production

# 출력 예시:
# Name:                   compute-quota
# Namespace:              production
# Resource                Used   Hard
# --------                ----   ----
# limits.cpu              4      20
# limits.memory           8Gi    40Gi
# pods                    42     100
# requests.cpu            2      10
# requests.memory         4Gi    20Gi
```

### 3.5 Quota가 있을 때 주의사항

**ResourceQuota가 있으면 Pod에 반드시 requests/limits 설정 필요:**

```yaml
# ResourceQuota가 있는 Namespace에서는 이 Pod이 거부됨
apiVersion: v1
kind: Pod
metadata:
  name: nginx
spec:
  containers:
  - name: nginx
    image: nginx
    # resources 미설정 → 거부됨

---
# 올바른 설정
apiVersion: v1
kind: Pod
metadata:
  name: nginx
spec:
  containers:
  - name: nginx
    image: nginx
    resources:
      requests:
        cpu: 100m
        memory: 128Mi
      limits:
        cpu: 200m
        memory: 256Mi
```

이를 자동화하려면 LimitRange를 사용한다.

---

## 4. LimitRange

### 4.1 LimitRange란?

LimitRange는 **개별 Pod/Container의 리소스 제한**을 설정한다.

| 구분 | ResourceQuota | LimitRange |
|------|--------------|------------|
| 대상 | Namespace 전체 | 개별 Pod/Container |
| 역할 | 총량 제한 | 기본값/최소/최대 설정 |

```
┌─────────────────────────────────────────────────────────────┐
│   LimitRange:                                                │
│   - Container 최대 CPU: 2 cores                             │
│   - Container 최소 Memory: 64Mi                             │
│   - Container 기본 CPU: 200m (설정 안 하면 자동 적용)        │
│                                                             │
│   Pod 생성 시:                                              │
│   - 최소/최대 검증                                           │
│   - 기본값 자동 주입                                         │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 LimitRange 예시

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: resource-limits
  namespace: production
spec:
  limits:
  # Container 레벨 제한
  - type: Container
    default:          # 기본 limits (설정 안 하면 적용)
      cpu: 500m
      memory: 512Mi
    defaultRequest:   # 기본 requests (설정 안 하면 적용)
      cpu: 100m
      memory: 128Mi
    max:              # 최대값
      cpu: 2
      memory: 2Gi
    min:              # 최소값
      cpu: 50m
      memory: 64Mi

  # Pod 레벨 제한
  - type: Pod
    max:
      cpu: 4
      memory: 4Gi

  # PVC 레벨 제한
  - type: PersistentVolumeClaim
    max:
      storage: 10Gi
    min:
      storage: 1Gi
```

### 4.3 LimitRange 동작

**1. 기본값 자동 주입:**
```yaml
# LimitRange가 있을 때, resources 미설정 시:
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: nginx
    image: nginx
    # resources 미설정

# → 자동으로 defaultRequest와 default가 적용됨:
#   resources:
#     requests:
#       cpu: 100m
#       memory: 128Mi
#     limits:
#       cpu: 500m
#       memory: 512Mi
```

**2. 범위 검증:**
```yaml
# max를 초과하면 생성 거부:
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: nginx
    image: nginx
    resources:
      limits:
        cpu: 5          # max(2)를 초과 → 거부됨
        memory: 2Gi
```

### 4.4 LimitRange 확인

```bash
kubectl get limitrange -n production
kubectl describe limitrange resource-limits -n production
```

---

## 5. Namespace 활용 패턴

### 5.1 환경별 분리

```bash
# 환경별 Namespace 생성
kubectl create namespace development
kubectl create namespace staging
kubectl create namespace production

# 환경별로 다른 ResourceQuota 적용
kubectl apply -f quota-dev.yaml -n development
kubectl apply -f quota-prod.yaml -n production
```

### 5.2 팀별 분리

```yaml
# 팀별 Namespace
apiVersion: v1
kind: Namespace
metadata:
  name: team-platform
  labels:
    team: platform
---
apiVersion: v1
kind: Namespace
metadata:
  name: team-frontend
  labels:
    team: frontend
```

### 5.3 RBAC과 함께 사용

```yaml
# Namespace에 대한 Role 정의
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: developer
  namespace: development
rules:
- apiGroups: [""]
  resources: ["pods", "services"]
  verbs: ["get", "list", "create", "delete"]

---
# 사용자에게 Role 바인딩
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: developer-binding
  namespace: development
subjects:
- kind: User
  name: john
roleRef:
  kind: Role
  name: developer
  apiGroup: rbac.authorization.k8s.io
```

---

## 6. Namespace 간 통신

### 6.1 Service DNS

같은 Namespace 내에서는 Service 이름만으로 접근 가능:
```
http://my-service
```

다른 Namespace의 Service에 접근:
```
http://my-service.other-namespace
http://my-service.other-namespace.svc
http://my-service.other-namespace.svc.cluster.local
```

```
┌─────────────────────────────────────────────────────────────┐
│  DNS 형식:                                                  │
│  <service>.<namespace>.svc.cluster.local                   │
│                                                             │
│  예시:                                                      │
│  - nginx-svc.production.svc.cluster.local                  │
│  - api-svc.staging.svc.cluster.local                       │
│                                                             │
│  같은 Namespace 내에서는 생략 가능:                          │
│  - nginx-svc                                                │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 NetworkPolicy로 격리

기본적으로 Namespace 간 통신이 허용된다. NetworkPolicy로 제한할 수 있다:

```yaml
# production Namespace에서 development로부터의 접근 차단
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-from-other-namespaces
  namespace: production
spec:
  podSelector: {}     # 모든 Pod에 적용
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector: {} # 같은 Namespace만 허용
```

---

## 7. 면접 빈출 질문

### Q1. ResourceQuota와 LimitRange의 차이는?

**ResourceQuota:**
- Namespace **전체**의 리소스 총량 제한
- Pod 합계, 서비스 개수 등 제한
- 예: "이 Namespace에서 CPU 요청 합계는 10 cores까지"

**LimitRange:**
- **개별** Pod/Container의 리소스 제한
- 기본값 설정, 최소/최대 범위 설정
- 예: "각 Container는 최대 2 cores까지"

둘은 **보완적**으로 사용된다. LimitRange로 개별 Pod을 제한하고, ResourceQuota로 전체 사용량을 제한한다.

### Q2. Namespace를 삭제하면 어떻게 되는가?

1. Namespace 상태가 `Terminating`으로 변경
2. Namespace 내 **모든 리소스가 삭제**됨 (Pod, Service, ConfigMap, Secret 등)
3. Finalizer가 있는 리소스가 있으면 삭제가 지연됨
4. 모든 리소스 삭제 후 Namespace 완전 삭제

**복구 불가능**하므로 주의해야 한다.

### Q3. 다른 Namespace의 Service에 어떻게 접근하는가?

FQDN(Fully Qualified Domain Name)을 사용한다:
```
<service-name>.<namespace>.svc.cluster.local
```

예: `nginx-svc.production.svc.cluster.local`

`.svc.cluster.local`은 생략 가능하여 `nginx-svc.production`으로도 접근 가능하다.

### Q4. ResourceQuota가 있는 Namespace에서 Pod 생성이 실패하는 이유는?

ResourceQuota가 컴퓨팅 리소스(CPU, Memory)를 제한하고 있으면, **모든 Pod에 requests/limits 설정이 필수**다.

해결 방법:
1. Pod에 직접 `resources.requests`와 `resources.limits` 설정
2. LimitRange를 만들어 기본값 자동 적용

---

## 8. CKA 실습

### 8.1 Namespace 생성 및 컨텍스트 설정

```bash
# Namespace 생성
kubectl create namespace production

# 기본 Namespace 설정
kubectl config set-context --current --namespace=production

# 확인
kubectl config view --minify | grep namespace
```

### 8.2 ResourceQuota 설정

```yaml
# quota.yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: compute-quota
  namespace: production
spec:
  hard:
    requests.cpu: "4"
    requests.memory: 4Gi
    limits.cpu: "8"
    limits.memory: 8Gi
    pods: "10"
```

```bash
kubectl apply -f quota.yaml

# 확인
kubectl describe resourcequota compute-quota -n production
```

### 8.3 LimitRange 설정

```yaml
# limitrange.yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
  - type: Container
    default:
      cpu: 500m
      memory: 256Mi
    defaultRequest:
      cpu: 100m
      memory: 128Mi
    max:
      cpu: 2
      memory: 2Gi
    min:
      cpu: 50m
      memory: 64Mi
```

```bash
kubectl apply -f limitrange.yaml

# 확인
kubectl describe limitrange default-limits -n production
```

### 8.4 테스트

```bash
# resources 없이 Pod 생성 시도
kubectl run nginx --image=nginx -n production

# Pod의 자동 설정된 resources 확인
kubectl get pod nginx -n production -o yaml | grep -A 10 resources
```

---

## 정리

### 주요 개념 체크리스트

- Namespace의 역할과 기본 Namespace
- Namespaced vs Cluster-scoped 리소스
- ResourceQuota로 Namespace 리소스 총량 제한
- LimitRange로 개별 Pod/Container 제한 및 기본값 설정
- Namespace 간 Service 통신 (DNS)
- RBAC과 NetworkPolicy를 통한 격리

### 다음 포스트

[Part 8: ReplicaSet과 Deployment](/posts/kubernetes-08-deployment)에서는 무중단 배포 전략을 다룬다.

---

## 참고 자료

- [Namespaces](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/)
- [Resource Quotas](https://kubernetes.io/docs/concepts/policy/resource-quotas/)
- [Limit Ranges](https://kubernetes.io/docs/concepts/policy/limit-range/)

