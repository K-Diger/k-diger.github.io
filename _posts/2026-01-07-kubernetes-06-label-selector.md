---
title: "Part 6: Label, Selector, Annotation - 리소스 조직화"
date: 2026-01-07
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, Label, Selector, Annotation]
layout: post
toc: true
math: true
mermaid: true
---

## 1. Label 개념

### 1.1 Label이란?

Label은 **키-값 쌍**으로 Kubernetes 리소스에 부착되는 메타데이터다. 리소스를 분류하고 선택하는 데 사용되며, Kubernetes의 주요 조직화 메커니즘이다.

```yaml
metadata:
  labels:
    app: nginx           # 애플리케이션 이름
    version: v1.21       # 버전
    environment: prod    # 환경
    tier: frontend       # 계층
    team: platform       # 담당 팀
```

**Label의 역할:**
- Pod, Service, Deployment 등 **모든 Kubernetes 리소스에 적용 가능**
- ReplicaSet이 관리할 Pod 선택
- Service가 트래픽을 보낼 Pod 선택
- 리소스 쿼리 및 필터링
- 느슨한 결합(Loosely Coupled) 구현

### 1.2 Label 명명 규칙

```
[prefix/]name: value
```

**이름(name) 규칙:**
- 63자 이내
- 알파벳, 숫자, `-`, `_`, `.` 사용
- 시작과 끝은 알파벳 또는 숫자

**접두사(prefix) 규칙:**
- 선택적
- DNS 서브도메인 형식 (253자 이내)
- `kubernetes.io/`, `k8s.io/`는 Kubernetes 코어 컴포넌트 예약

**값(value) 규칙:**
- 63자 이내
- 비어있을 수 있음
- 시작과 끝은 알파벳 또는 숫자 (비어있지 않다면)

```yaml
# 유효한 Label 예시
metadata:
  labels:
    app.kubernetes.io/name: nginx
    app.kubernetes.io/version: "1.21"
    app.kubernetes.io/component: webserver
    team: platform-infra
    cost-center: "12345"

# 잘못된 Label 예시
metadata:
  labels:
    App: nginx          # 대문자는 허용되지만 권장하지 않음
    -invalid: value     # 하이픈으로 시작 불가
    too-long-value: "이 값은 63자를 초과하면 안됩니다..."
```

### 1.3 권장 Label

Kubernetes는 표준화된 Label 집합을 권장한다:

| Label | 설명 | 예시 |
|-------|------|------|
| `app.kubernetes.io/name` | 앱 이름 | nginx |
| `app.kubernetes.io/instance` | 앱 인스턴스 식별자 | nginx-prod |
| `app.kubernetes.io/version` | 앱 버전 | 1.21.0 |
| `app.kubernetes.io/component` | 컴포넌트 | webserver |
| `app.kubernetes.io/part-of` | 상위 애플리케이션 | wordpress |
| `app.kubernetes.io/managed-by` | 관리 도구 | helm |

```yaml
metadata:
  labels:
    app.kubernetes.io/name: nginx
    app.kubernetes.io/instance: nginx-prod
    app.kubernetes.io/version: "1.21"
    app.kubernetes.io/component: frontend
    app.kubernetes.io/part-of: myapp
    app.kubernetes.io/managed-by: helm
```

---

## 2. Selector

Selector는 Label을 기반으로 리소스를 **선택**하는 메커니즘이다.

### 2.1 Equality-based Selector (등식 기반)

키와 값이 정확히 일치하는지 확인한다.

| 연산자 | 의미 | 예시 |
|--------|------|------|
| `=` | 같음 | `app=nginx` |
| `==` | 같음 (= 와 동일) | `app==nginx` |
| `!=` | 다름 | `app!=nginx` |

```bash
# kubectl에서 사용
kubectl get pods -l app=nginx
kubectl get pods -l "app=nginx,version=v1"   # AND 조건
kubectl get pods -l app!=apache
```

```yaml
# Service에서 사용
apiVersion: v1
kind: Service
metadata:
  name: nginx-svc
spec:
  selector:
    app: nginx        # Equality-based (암묵적으로 =)
  ports:
  - port: 80
```

### 2.2 Set-based Selector (집합 기반)

집합 연산을 사용한 더 복잡한 선택이 가능하다.

| 연산자 | 의미 | 예시 |
|--------|------|------|
| `in` | 값이 집합에 포함 | `version in (v1, v2)` |
| `notin` | 값이 집합에 미포함 | `version notin (v3, v4)` |
| `exists` | 키가 존재 | `app` (값 없이 키만) |
| `!exists` | 키가 존재하지 않음 | `!app` |

```bash
# kubectl에서 사용
kubectl get pods -l "version in (v1, v2)"
kubectl get pods -l "version notin (v3, v4)"
kubectl get pods -l "tier"              # tier 키가 있는 Pod
kubectl get pods -l "!tier"             # tier 키가 없는 Pod

# 복합 조건
kubectl get pods -l "app=nginx,version in (v1, v2)"
```

```yaml
# Deployment에서 사용 (matchLabels + matchExpressions)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  selector:
    matchLabels:
      app: nginx                    # Equality-based
    matchExpressions:
    - key: version
      operator: In
      values:
      - v1
      - v2
    - key: environment
      operator: NotIn
      values:
      - dev
    - key: tier
      operator: Exists
```

### 2.3 리소스별 Selector 지원

| 리소스 | Selector 필드 | 지원 방식 |
|--------|--------------|----------|
| Service | `spec.selector` | Equality-based만 |
| ReplicaSet | `spec.selector.matchLabels/matchExpressions` | 둘 다 지원 |
| Deployment | `spec.selector.matchLabels/matchExpressions` | 둘 다 지원 |
| Job | `spec.selector.matchLabels/matchExpressions` | 둘 다 지원 |
| NetworkPolicy | `spec.podSelector` | 둘 다 지원 |
| PersistentVolumeClaim | `spec.selector` | 둘 다 지원 |

**중요**: Service는 Equality-based만 지원한다.

```yaml
# Service - Equality-based만
apiVersion: v1
kind: Service
spec:
  selector:
    app: nginx
    version: v1

# Deployment - 둘 다 지원
apiVersion: apps/v1
kind: Deployment
spec:
  selector:
    matchLabels:
      app: nginx
    matchExpressions:
    - key: tier
      operator: In
      values: [frontend, backend]
```

---

## 3. Label 사용 패턴

### 3.1 Service와 Pod 연결

```yaml
# Pod
apiVersion: v1
kind: Pod
metadata:
  name: nginx-pod
  labels:
    app: nginx        # Service가 이 Label로 선택
    version: v1
spec:
  containers:
  - name: nginx
    image: nginx

---
# Service
apiVersion: v1
kind: Service
metadata:
  name: nginx-svc
spec:
  selector:
    app: nginx        # app=nginx인 Pod 선택
  ports:
  - port: 80
```

### 3.2 Deployment와 ReplicaSet 연결

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx              # 관리할 Pod 선택 기준
  template:
    metadata:
      labels:
        app: nginx            # 생성될 Pod의 Label (selector와 일치해야 함)
        version: v1
    spec:
      containers:
      - name: nginx
        image: nginx
```

**주의**: `spec.selector`와 `spec.template.metadata.labels`는 최소한 일치해야 한다.

### 3.3 환경별 리소스 관리

```yaml
# Production Pod
metadata:
  labels:
    app: myapp
    environment: production
    tier: backend

# Staging Pod
metadata:
  labels:
    app: myapp
    environment: staging
    tier: backend
```

```bash
# 환경별 조회
kubectl get pods -l environment=production
kubectl get pods -l environment=staging

# 특정 환경 제외
kubectl get pods -l "environment notin (dev, test)"
```

### 3.4 Blue-Green Deployment

```yaml
# Blue 버전 (현재 라이브)
metadata:
  labels:
    app: myapp
    version: blue

# Green 버전 (새 버전)
metadata:
  labels:
    app: myapp
    version: green

# Service - 버전 전환
spec:
  selector:
    app: myapp
    version: blue    # green으로 변경하면 트래픽 전환
```

---

## 4. Annotation

### 4.1 Annotation이란?

Annotation은 **비식별 메타데이터**로, 리소스에 추가 정보를 저장한다. Label과 달리 **Selector로 선택하는 데 사용되지 않는다.**

```yaml
metadata:
  annotations:
    description: "This is the main web server"
    owner: "team-platform@example.com"
    build.date: "2024-12-28"
    git.commit: "abc123def456"
```

### 4.2 Label vs Annotation

| 특성 | Label | Annotation |
|------|-------|------------|
| **용도** | 리소스 선택/그룹화 | 추가 정보 저장 |
| **Selector 사용** | 가능 | 불가 |
| **값 크기** | 최대 63자 | 제한 없음 (256KB까지 권장) |
| **사용처** | 쿼리, 필터링, 조직화 | 도구 설정, 빌드 정보, 설명 |

### 4.3 Annotation 사용 사례

**1. 도구/라이브러리 설정:**
```yaml
metadata:
  annotations:
    # Prometheus 스크래핑 설정
    prometheus.io/scrape: "true"
    prometheus.io/port: "8080"
    prometheus.io/path: "/metrics"

    # Ingress Controller 설정
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"

    # Istio 설정
    sidecar.istio.io/inject: "true"
```

**2. 빌드/배포 정보:**
```yaml
metadata:
  annotations:
    build.number: "1234"
    build.date: "2024-12-28T10:00:00Z"
    git.repository: "https://github.com/example/app"
    git.commit: "abc123def456"
    git.branch: "main"
    deployed.by: "jenkins"
```

**3. 운영 정보:**
```yaml
metadata:
  annotations:
    description: "Production web server for customer-facing API"
    owner: "team-platform@example.com"
    oncall: "pagerduty://team-platform"
    documentation: "https://wiki.example.com/myapp"
```

**4. 리소스 정책:**
```yaml
metadata:
  annotations:
    # 변경 원인 기록 (kubectl에서 자동 추가)
    kubernetes.io/change-cause: "Update to version 1.22"

    # 마지막 적용된 설정 (kubectl apply에서 자동 추가)
    kubectl.kubernetes.io/last-applied-configuration: |
      {"apiVersion":"apps/v1","kind":"Deployment"...}
```

### 4.4 kubectl에서 Annotation 관리

```bash
# Annotation 추가
kubectl annotate pod nginx description="web server"

# Annotation 수정
kubectl annotate pod nginx description="main web server" --overwrite

# Annotation 삭제
kubectl annotate pod nginx description-

# 여러 Annotation 동시 추가
kubectl annotate pod nginx \
  owner="team@example.com" \
  build.date="2024-12-28"
```

---

## 5. kubectl에서 Label 관리

### 5.1 Label 조회

```bash
# Label 포함하여 Pod 조회
kubectl get pods --show-labels

# 특정 Label 컬럼으로 표시
kubectl get pods -L app,version

# Label로 필터링
kubectl get pods -l app=nginx
kubectl get pods -l "app in (nginx, apache)"
kubectl get pods -l app=nginx,version=v1
```

### 5.2 Label 추가/수정/삭제

```bash
# Label 추가
kubectl label pod nginx env=production

# Label 수정 (--overwrite 필요)
kubectl label pod nginx env=staging --overwrite

# Label 삭제 (키 뒤에 - 붙임)
kubectl label pod nginx env-

# 여러 리소스에 동시 적용
kubectl label pods -l app=nginx tier=frontend

# 모든 Pod에 적용
kubectl label pods --all env=production
```

### 5.3 Node Label 관리

```bash
# Node Label 추가 (스케줄링에 사용)
kubectl label node worker-1 disktype=ssd
kubectl label node worker-2 disktype=hdd

# Node Label 확인
kubectl get nodes --show-labels

# Node Label로 Pod 스케줄링
# (Pod의 nodeSelector에서 사용)
```

---

## 6. 면접 빈출 질문

### Q1. Label과 Annotation의 차이는?

**Label:**
- 리소스를 식별하고 선택하는 데 사용
- Selector로 쿼리 가능
- 값 크기 제한 (63자)
- 예: `app=nginx`, `env=prod`

**Annotation:**
- 추가 정보를 저장하는 메타데이터
- Selector로 선택 불가
- 더 큰 데이터 저장 가능
- 예: 빌드 정보, 도구 설정, 설명

### Q2. Service는 왜 Set-based Selector를 지원하지 않는가?

Service는 Endpoint를 통해 Pod과 연결되는데, 이 연결은 간단한 키-값 매칭으로 충분하다. Set-based Selector는 ReplicaSet, Deployment 같은 복잡한 워크로드 관리에 더 필요하다.

또한 Service의 Selector는 단순성을 유지하여 성능과 예측 가능성을 보장한다.

### Q3. matchLabels와 matchExpressions는 언제 사용하는가?

**matchLabels:**
- 간단한 등식 매칭 (키=값)
- 대부분의 경우 충분
- Service에서도 사용 가능한 방식

**matchExpressions:**
- 복잡한 조건이 필요할 때
- In, NotIn, Exists, DoesNotExist 연산
- 여러 값 중 하나를 선택해야 할 때
- 특정 Label이 없는 리소스를 선택해야 할 때

```yaml
# 둘 다 사용하면 AND 조건
selector:
  matchLabels:
    app: nginx
  matchExpressions:
  - key: tier
    operator: In
    values: [frontend, backend]
# app=nginx AND tier in (frontend, backend)
```

### Q4. Label 변경 시 주의할 점은?

1. **Selector와의 일치**: Deployment의 Pod Template Label을 변경하면 새 ReplicaSet이 생성됨
2. **Service 연결**: Label 변경으로 Service와 연결이 끊어질 수 있음
3. **불변 Selector**: 일부 리소스(Deployment, ReplicaSet)의 `spec.selector`는 생성 후 변경 불가
4. **Immutability**: Job의 selector는 변경 불가

---

## 7. 실습

### 7.1 Label을 이용한 Pod 관리

```bash
# Pod 생성
kubectl run nginx1 --image=nginx --labels="app=nginx,version=v1,env=prod"
kubectl run nginx2 --image=nginx --labels="app=nginx,version=v2,env=prod"
kubectl run apache --image=httpd --labels="app=apache,version=v1,env=dev"

# Label 조회
kubectl get pods --show-labels
kubectl get pods -L app,version

# Selector로 필터링
kubectl get pods -l app=nginx
kubectl get pods -l "version in (v1, v2)"
kubectl get pods -l "env!=dev"
kubectl get pods -l "app,version"   # app과 version 키가 있는 것

# Label 수정
kubectl label pod nginx1 version=v1.1 --overwrite

# Label 삭제
kubectl label pod nginx1 env-
```

### 7.2 Deployment와 Service 연결

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
        version: v1
    spec:
      containers:
      - name: nginx
        image: nginx
---
apiVersion: v1
kind: Service
metadata:
  name: web-svc
spec:
  selector:
    app: web
  ports:
  - port: 80
```

```bash
kubectl apply -f deployment.yaml

# Endpoint 확인 (Label 매칭 결과)
kubectl get endpoints web-svc

# Service의 Label 선택 확인
kubectl describe svc web-svc
```

---

## 정리

### 주요 개념 체크리스트

- Label의 명명 규칙과 권장 Label
- Equality-based vs Set-based Selector
- Label과 Annotation의 차이
- Service, Deployment에서의 Selector 사용
- kubectl로 Label 관리하기

### 다음 포스트

[Part 7: Namespace와 ResourceQuota](/posts/kubernetes-07-namespace)에서는 멀티테넌시와 리소스 격리를 다룬다.

---

## 참고 자료

- [Labels and Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/)
- [Annotations](https://kubernetes.io/docs/concepts/overview/working-with-objects/annotations/)
- [Recommended Labels](https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/)

