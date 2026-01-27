---
layout: post
title: "Kubernetes 가이드 - NetworkPolicy로 Pod 간 네트워크 보안"
date: 2026-01-13
categories: [Kubernetes]
tags: [kubernetes, networkpolicy, security, networking, calico, cka]
---

기본적으로 Kubernetes 클러스터 내의 모든 Pod는 서로 자유롭게 통신할 수 있다. 이는 마이크로서비스 간 통신에 편리하지만, 보안 관점에서는 위험할 수 있다. **NetworkPolicy**는 Pod 수준에서 네트워크 트래픽을 제어하는 방화벽 역할을 한다.

## NetworkPolicy의 필요성

### 기본 네트워크 동작

Kubernetes의 기본 네트워크 모델:
- 모든 Pod는 NAT 없이 다른 모든 Pod와 통신 가능
- 모든 Node는 NAT 없이 모든 Pod와 통신 가능
- Pod가 자신의 IP로 보는 것과 다른 Pod가 보는 것이 동일

이는 **완전히 개방된 네트워크**를 의미하며, 다음과 같은 위험이 있다:
- 프론트엔드 Pod가 데이터베이스에 직접 접근 가능
- 침해된 Pod가 클러스터 전체로 확산 가능
- 규정 준수(Compliance) 요구사항 위반

### NetworkPolicy의 역할

```
NetworkPolicy 없이:
┌─────────────────────────────────────────┐
│  Frontend ←→ Backend ←→ Database        │
│      ↕          ↕          ↕            │
│  (모든 Pod가 모든 Pod와 통신 가능)       │
└─────────────────────────────────────────┘

NetworkPolicy 적용 후:
┌─────────────────────────────────────────┐
│  Frontend → Backend → Database          │
│             (단방향, 필요한 통신만)       │
│  Frontend ✗→ Database (직접 접근 차단)   │
└─────────────────────────────────────────┘
```

## NetworkPolicy 지원

### CNI 플러그인 요구사항

**NetworkPolicy는 CNI 플러그인이 지원해야 동작한다.**

| CNI 플러그인 | NetworkPolicy 지원 |
|-------------|-------------------|
| Calico | 완전 지원 |
| Cilium | 완전 지원 |
| Weave Net | 지원 |
| Antrea | 지원 |
| Flannel | **미지원** |
| kubenet | **미지원** |

**주의**: Flannel만 사용하는 클러스터에서는 NetworkPolicy 리소스를 생성해도 실제로 적용되지 않는다.

```bash
# CNI 확인
kubectl get pods -n kube-system | grep -E 'calico|cilium|weave'
```

## NetworkPolicy 기본 구조

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: example-policy
  namespace: default
spec:
  podSelector:          # 정책이 적용될 Pod 선택
    matchLabels:
      app: backend
  policyTypes:          # 정책 유형 (Ingress, Egress, 또는 둘 다)
  - Ingress
  - Egress
  ingress:              # 들어오는 트래픽 규칙
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - protocol: TCP
      port: 8080
  egress:               # 나가는 트래픽 규칙
  - to:
    - podSelector:
        matchLabels:
          app: database
    ports:
    - protocol: TCP
      port: 5432
```

### 주요 개념

**podSelector**: 정책이 적용될 Pod 선택
- 빈 selector(`{}`)는 namespace의 모든 Pod 선택
- 특정 label을 가진 Pod만 선택 가능

**policyTypes**: 정책 유형 지정
- `Ingress`: 들어오는 트래픽 제어
- `Egress`: 나가는 트래픽 제어
- 둘 다 지정 가능

**중요 동작 원리**:
- NetworkPolicy가 하나라도 적용된 Pod는 **기본 거부(default deny)** 상태가 됨
- 정책에서 명시적으로 허용한 트래픽만 통과
- 여러 정책이 적용되면 **OR 연산** (하나라도 허용하면 통과)

## Ingress 규칙

### Pod 기반 허용

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:        # 같은 namespace의 Pod
        matchLabels:
          app: frontend
    ports:
    - protocol: TCP
      port: 8080
```

### Namespace 기반 허용

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-namespace
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:  # 특정 namespace에서 오는 트래픽
        matchLabels:
          env: staging
    ports:
    - protocol: TCP
      port: 8080
```

### IP 블록 기반 허용

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-external
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: web
  policyTypes:
  - Ingress
  ingress:
  - from:
    - ipBlock:
        cidr: 10.0.0.0/8     # 허용할 IP 범위
        except:
        - 10.0.1.0/24        # 제외할 IP 범위
    ports:
    - protocol: TCP
      port: 80
```

### 복합 조건 (AND vs OR)

**OR 조건** (배열 요소가 다름):
```yaml
ingress:
- from:
  - podSelector:           # 조건 1: frontend Pod
      matchLabels:
        app: frontend
  - namespaceSelector:     # OR 조건 2: monitoring namespace
      matchLabels:
        name: monitoring
```

**AND 조건** (같은 요소 내):
```yaml
ingress:
- from:
  - podSelector:           # AND 조건: staging namespace의
      matchLabels:         # frontend Pod만
        app: frontend
    namespaceSelector:
      matchLabels:
        env: staging
```

**주의**: 이 차이점은 매우 중요하다. 들여쓰기와 하이픈 위치에 따라 의미가 완전히 달라진다.

## Egress 규칙

### 특정 서비스로만 허용

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-egress
  namespace: default
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
```

### DNS 허용 (필수)

Egress를 제한하면 DNS 쿼리도 차단된다. 대부분의 경우 DNS는 허용해야 한다.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns-egress
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Egress
  egress:
  # DNS 허용
  - to:
    - namespaceSelector: {}
      podSelector:
        matchLabels:
          k8s-app: kube-dns
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
  # 또는 kube-system namespace로
  - to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
    ports:
    - protocol: UDP
      port: 53
```

### 외부 서비스 접근 허용

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-external-api
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Egress
  egress:
  - to:
    - ipBlock:
        cidr: 0.0.0.0/0
        except:
        - 10.0.0.0/8      # 클러스터 내부 제외
        - 172.16.0.0/12
        - 192.168.0.0/16
    ports:
    - protocol: TCP
      port: 443
```

## Default 정책

### Default Deny All Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: default
spec:
  podSelector: {}  # 모든 Pod에 적용
  policyTypes:
  - Ingress
  # ingress 규칙 없음 = 모든 ingress 차단
```

### Default Deny All Egress

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-egress
  namespace: default
spec:
  podSelector: {}
  policyTypes:
  - Egress
  # egress 규칙 없음 = 모든 egress 차단
```

### Default Deny All (Ingress + Egress)

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: default
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
```

### Default Allow All Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-all-ingress
  namespace: default
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  ingress:
  - {}  # 모든 ingress 허용
```

### Default Allow All Egress

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-all-egress
  namespace: default
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - {}  # 모든 egress 허용
```

## 실전 시나리오

### 3-Tier 애플리케이션 보안

```yaml
# 1. 기본 거부 정책
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
---
# 2. Frontend: 외부에서 접근 허용, Backend로만 통신
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: frontend-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      tier: frontend
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from: []  # 모든 곳에서 ingress 허용 (Ingress Controller 포함)
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
  - to:  # DNS 허용
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
    ports:
    - protocol: UDP
      port: 53
---
# 3. Backend: Frontend에서만 접근, Database로만 통신
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-policy
  namespace: production
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
  - to:  # DNS 허용
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
    ports:
    - protocol: UDP
      port: 53
---
# 4. Database: Backend에서만 접근
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: database-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      tier: database
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          tier: backend
    ports:
    - protocol: TCP
      port: 5432
  egress:
  - to:  # DNS만 허용
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
    ports:
    - protocol: UDP
      port: 53
```

### Namespace 격리

```yaml
# 특정 namespace 간 통신만 허용
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-same-namespace
  namespace: team-a
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector: {}  # 같은 namespace 내에서만
---
# 다른 namespace 접근 허용
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-monitoring
  namespace: team-a
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: monitoring
    ports:
    - protocol: TCP
      port: 9090  # metrics 포트
```

## 트러블슈팅

### 연결 문제 진단

```bash
# 1. NetworkPolicy 목록 확인
kubectl get networkpolicy -A

# 2. 특정 NetworkPolicy 상세 확인
kubectl describe networkpolicy <policy-name>

# 3. Pod에 적용된 정책 확인
kubectl get networkpolicy -o yaml | grep -A 20 "podSelector"

# 4. 연결 테스트
kubectl run test --rm -it --image=busybox --restart=Never -- \
  wget -qO- --timeout=2 http://<target-service>

# 5. DNS 테스트
kubectl run test --rm -it --image=busybox --restart=Never -- \
  nslookup kubernetes.default
```

### 흔한 실수

**1. policyTypes 누락**
```yaml
# 잘못된 예 - policyTypes 없이 egress만 정의
spec:
  podSelector: {}
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: db
# policyTypes가 없으면 egress 규칙이 무시될 수 있음

# 올바른 예
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: db
```

**2. DNS 차단**
```yaml
# Egress를 제한하면 DNS도 차단됨
# 반드시 DNS 허용 규칙 추가 필요
egress:
- to:
  - namespaceSelector:
      matchLabels:
        kubernetes.io/metadata.name: kube-system
  ports:
  - protocol: UDP
    port: 53
```

**3. Namespace selector 오류**
```yaml
# 잘못된 예 - 다른 namespace의 Pod를 선택하려면 namespaceSelector 필요
spec:
  podSelector:
    matchLabels:
      app: frontend
  ingress:
  - from:
    - podSelector:  # 이것은 같은 namespace만 선택
        matchLabels:
          app: api

# 올바른 예
  ingress:
  - from:
    - namespaceSelector:  # 다른 namespace 지정
        matchLabels:
          name: other-ns
      podSelector:
        matchLabels:
          app: api
```

**4. AND vs OR 혼동**
```yaml
# OR 조건 (두 개의 from 항목)
from:
- podSelector:
    matchLabels:
      app: a
- podSelector:
    matchLabels:
      app: b

# AND 조건 (하나의 from 항목에 두 selector)
from:
- podSelector:
    matchLabels:
      app: a
  namespaceSelector:
    matchLabels:
      env: prod
```

## 기술 면접 대비

### 자주 묻는 질문

**Q: NetworkPolicy의 기본 동작은?**

A: Kubernetes의 기본 네트워크는 완전히 개방되어 있다. NetworkPolicy가 없으면 모든 Pod가 서로 통신 가능하다. NetworkPolicy가 Pod에 적용되면 해당 Pod는 기본 거부(default deny) 상태가 되고, 정책에서 명시적으로 허용한 트래픽만 통과한다. 여러 정책이 적용되면 OR 연산으로 합쳐진다.

**Q: NetworkPolicy가 동작하지 않는 이유는?**

A: CNI 플러그인이 NetworkPolicy를 지원해야 한다. Flannel은 NetworkPolicy를 지원하지 않아, Flannel만 사용하면 NetworkPolicy 리소스를 생성해도 실제로 적용되지 않는다. Calico, Cilium, Weave Net 등이 지원한다.

**Q: Egress 정책 적용 시 주의사항은?**

A: Egress를 제한하면 DNS 쿼리도 차단된다. 대부분의 애플리케이션은 Service 이름으로 통신하므로 DNS 조회가 필요하다. Egress 정책 적용 시 반드시 kube-system의 kube-dns(CoreDNS)로의 UDP 53 포트를 허용해야 한다.

**Q: podSelector: {}의 의미는?**

A: 빈 selector는 해당 namespace의 모든 Pod를 선택한다. default deny 정책을 만들 때 주로 사용한다. `spec.podSelector: {}`는 모든 Pod에 정책을 적용하고, ingress/egress 규칙을 비워두면 모든 트래픽을 차단한다.

**Q: NetworkPolicy는 어떤 수준에서 동작하는가?**

A: L3/L4 수준에서 동작한다. IP 주소, 포트, 프로토콜(TCP/UDP/SCTP)을 기준으로 필터링한다. L7(HTTP 경로, 헤더 등)은 기본 NetworkPolicy로 제어할 수 없다. L7 수준 제어가 필요하면 Istio, Cilium의 확장 기능 등을 사용해야 한다.

## CKA 시험 대비 필수 명령어

```bash
# NetworkPolicy 조회
kubectl get networkpolicy -A
kubectl get netpol -A  # 축약형
kubectl describe networkpolicy <name>

# NetworkPolicy 생성 (YAML 필수)
kubectl apply -f networkpolicy.yaml

# 빠른 테스트
kubectl run test --rm -it --image=busybox --restart=Never -- \
  wget -qO- --timeout=2 http://web-service

# Pod label 확인
kubectl get pods --show-labels

# Namespace label 확인
kubectl get ns --show-labels

# Namespace에 label 추가
kubectl label namespace production env=prod
```

### CKA 빈출 시나리오

```yaml
# 시나리오 1: Default Deny Ingress
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: production
spec:
  podSelector: {}
  policyTypes:
  - Ingress

# 시나리오 2: 특정 Pod에서만 접근 허용
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend
  namespace: production
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

# 시나리오 3: 특정 Namespace에서만 접근 허용
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-monitoring
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: monitoring
    ports:
    - protocol: TCP
      port: 9090

# 시나리오 4: Egress 제한 (DNS 허용)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: restrict-egress
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: secure-app
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
  - to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
    ports:
    - protocol: UDP
      port: 53
```

## 다음 단계

- [Kubernetes 가이드 - ConfigMap과 Secret](/kubernetes/kubernetes-13-configmap-secret)
- [Kubernetes 가이드 - Volume과 PersistentVolume](/kubernetes/kubernetes-14-volume)
