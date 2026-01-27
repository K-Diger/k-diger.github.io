---
title: "Part 8: ReplicaSet과 Deployment - 무중단 배포 전략"
date: 2026-01-09
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, Deployment, ReplicaSet, RollingUpdate]
layout: post
toc: true
math: true
mermaid: true
---

## 1. ReplicaSet

### 1.1 ReplicaSet이란?

ReplicaSet은 **지정된 수의 Pod 복제본을 항상 유지**하는 컨트롤러다.

```
┌─────────────────────────────────────────────────────────────┐
│                      ReplicaSet                              │
│                                                             │
│  spec.replicas: 3                                           │
│                                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                     │
│  │  Pod 1  │  │  Pod 2  │  │  Pod 3  │                     │
│  │  app=   │  │  app=   │  │  app=   │                     │
│  │  nginx  │  │  nginx  │  │  nginx  │                     │
│  └─────────┘  └─────────┘  └─────────┘                     │
│                                                             │
│  Controller: 항상 3개의 Pod 유지                            │
│  - Pod이 죽으면 자동 생성                                   │
│  - Pod이 더 있으면 삭제                                     │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 ReplicaSet 동작

ReplicaSet Controller는 Control Loop를 통해 작동한다:

1. Label Selector에 매칭되는 Pod 목록 조회
2. 현재 Pod 수와 desired replicas 비교
3. 부족하면 Pod 생성, 초과하면 Pod 삭제

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: nginx-rs
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx        # selector와 일치해야 함
    spec:
      containers:
      - name: nginx
        image: nginx:1.21
```

### 1.3 왜 ReplicaSet을 직접 사용하지 않는가?

ReplicaSet은 **직접 사용하기보다 Deployment를 통해 관리**하는 것이 권장된다.

ReplicaSet의 한계:
- 롤링 업데이트 기능 없음
- 이미지 변경 시 Pod이 자동 교체되지 않음
- 롤백 기능 없음

Deployment가 제공하는 기능:
- 롤링 업데이트
- 롤백
- 일시 중지/재개
- 리비전 히스토리

---

## 2. Deployment

### 2.1 Deployment란?

Deployment는 **ReplicaSet을 관리하면서 선언적 업데이트를 제공**하는 상위 컨트롤러다.

```
┌─────────────────────────────────────────────────────────────┐
│                      Deployment                              │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                    ReplicaSet                          │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐               │ │
│  │  │  Pod    │  │  Pod    │  │  Pod    │               │ │
│  │  └─────────┘  └─────────┘  └─────────┘               │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  Deployment가 제공하는 기능:                                │
│  - 롤링 업데이트 / 롤백                                     │
│  - 일시 중지 / 재개                                         │
│  - 스케일링                                                 │
│  - 리비전 히스토리                                          │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Deployment 정의

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
        image: nginx:1.21
        ports:
        - containerPort: 80
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 200m
            memory: 256Mi
```

### 2.3 Deployment 계층 구조

```
Deployment (nginx-deployment)
    │
    └── ReplicaSet (nginx-deployment-6b9f7c8d5)
            │
            ├── Pod (nginx-deployment-6b9f7c8d5-abc12)
            ├── Pod (nginx-deployment-6b9f7c8d5-def34)
            └── Pod (nginx-deployment-6b9f7c8d5-ghi56)
```

이미지가 변경되면 새 ReplicaSet이 생성된다:
```
Deployment (nginx-deployment)
    │
    ├── ReplicaSet (nginx-deployment-6b9f7c8d5) [구버전, replicas=0]
    │
    └── ReplicaSet (nginx-deployment-7c9a8d6e4) [신버전, replicas=3]
            │
            ├── Pod (...)
            ├── Pod (...)
            └── Pod (...)
```

---

## 3. 롤링 업데이트

### 3.1 롤링 업데이트란?

롤링 업데이트는 **기존 Pod을 순차적으로 새 Pod으로 교체**하는 배포 방식이다. 서비스 중단 없이 배포할 수 있다.

```
┌─────────────────────────────────────────────────────────────┐
│  Rolling Update 과정                                        │
│                                                             │
│  Step 1: v1 (3개)                                          │
│  [v1] [v1] [v1]                                             │
│                                                             │
│  Step 2: v2 1개 생성, v1 1개 삭제                          │
│  [v1] [v1] [v2]                                             │
│                                                             │
│  Step 3: v2 2개, v1 1개                                    │
│  [v1] [v2] [v2]                                             │
│                                                             │
│  Step 4: v2 (3개) 완료                                     │
│  [v2] [v2] [v2]                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 업데이트 전략 설정

```yaml
spec:
  strategy:
    type: RollingUpdate       # 기본값
    rollingUpdate:
      maxSurge: 1             # 추가로 생성할 수 있는 Pod 수
      maxUnavailable: 1       # 동시에 사용 불가능한 Pod 수
```

**maxSurge:**
- 원하는 replicas 수를 **초과**하여 생성할 수 있는 Pod 수
- 숫자 또는 백분율 (예: `25%`)
- 값이 클수록 빠른 배포, 더 많은 리소스 사용

**maxUnavailable:**
- 업데이트 중 **사용 불가능**할 수 있는 Pod 수
- 숫자 또는 백분율
- 값이 클수록 빠른 배포, 가용성 감소

**예시 시나리오 (replicas=10):**

| 설정 | 동작 |
|------|------|
| `maxSurge=2, maxUnavailable=0` | 최대 12개까지 생성 가능, 항상 10개 Ready |
| `maxSurge=0, maxUnavailable=2` | 항상 10개 유지, 8개만 Ready 보장 |
| `maxSurge=25%, maxUnavailable=25%` | 최대 13개, 최소 8개 Ready |

### 3.3 Recreate 전략

모든 기존 Pod을 삭제한 후 새 Pod을 생성한다. **다운타임이 발생**한다.

```yaml
spec:
  strategy:
    type: Recreate
```

사용 사례:
- 여러 버전 공존이 불가능한 경우
- 스토리지 마이그레이션이 필요한 경우
- 개발/테스트 환경

---

## 4. 롤아웃 관리

### 4.1 롤아웃 상태 확인

```bash
# 롤아웃 상태 실시간 확인
kubectl rollout status deployment/nginx-deployment

# 롤아웃 히스토리
kubectl rollout history deployment/nginx-deployment

# 특정 리비전 상세 정보
kubectl rollout history deployment/nginx-deployment --revision=2
```

### 4.2 이미지 업데이트

```bash
# 방법 1: kubectl set image
kubectl set image deployment/nginx-deployment nginx=nginx:1.22

# 방법 2: kubectl edit
kubectl edit deployment nginx-deployment

# 방법 3: kubectl patch
kubectl patch deployment nginx-deployment -p '{"spec":{"template":{"spec":{"containers":[{"name":"nginx","image":"nginx:1.22"}]}}}}'

# 방법 4: YAML 수정 후 apply (권장)
kubectl apply -f deployment.yaml
```

### 4.3 롤백

```bash
# 바로 이전 버전으로 롤백
kubectl rollout undo deployment/nginx-deployment

# 특정 리비전으로 롤백
kubectl rollout undo deployment/nginx-deployment --to-revision=2
```

### 4.4 롤아웃 일시 중지/재개

대규모 변경 시 롤아웃을 일시 중지하고 여러 변경을 적용한 후 재개할 수 있다:

```bash
# 일시 중지
kubectl rollout pause deployment/nginx-deployment

# 여러 변경 적용 (각 변경이 개별 롤아웃을 트리거하지 않음)
kubectl set image deployment/nginx-deployment nginx=nginx:1.22
kubectl set resources deployment/nginx-deployment -c nginx --limits=cpu=200m,memory=256Mi

# 재개 (한 번의 롤아웃으로 모든 변경 적용)
kubectl rollout resume deployment/nginx-deployment
```

### 4.5 변경 원인 기록

롤아웃 히스토리에 변경 원인을 기록하려면:

```bash
# 방법 1: --record 플래그 (deprecated)
kubectl set image deployment/nginx-deployment nginx=nginx:1.22 --record

# 방법 2: annotation 직접 설정 (권장)
kubectl annotate deployment/nginx-deployment kubernetes.io/change-cause="Update to nginx 1.22"
```

---

## 5. 스케일링

### 5.1 수동 스케일링

```bash
# replicas 변경
kubectl scale deployment/nginx-deployment --replicas=5

# 조건부 스케일링 (현재 replicas가 3일 때만)
kubectl scale deployment/nginx-deployment --replicas=5 --current-replicas=3
```

### 5.2 YAML로 스케일링

```yaml
spec:
  replicas: 5    # 값 변경
```

```bash
kubectl apply -f deployment.yaml
```

---

## 6. Deployment 상태

### 6.1 Deployment Conditions

```bash
kubectl get deployment nginx-deployment -o yaml
```

```yaml
status:
  conditions:
  - type: Available
    status: "True"
    reason: MinimumReplicasAvailable
  - type: Progressing
    status: "True"
    reason: NewReplicaSetAvailable
```

| Condition | 의미 |
|-----------|------|
| **Available** | 최소 가용 Pod 수 충족 |
| **Progressing** | 롤아웃 진행 중 또는 완료 |

### 6.2 진행 데드라인

롤아웃이 지정된 시간 내에 완료되지 않으면 실패로 간주:

```yaml
spec:
  progressDeadlineSeconds: 600  # 기본값: 600초 (10분)
```

---

## 7. 면접 빈출 질문

### Q1. Deployment와 ReplicaSet의 차이는?

**ReplicaSet:**
- Pod 복제본 수 유지
- 단순히 replicas 수만 관리
- 이미지 변경해도 기존 Pod이 자동 교체되지 않음

**Deployment:**
- ReplicaSet을 관리하는 상위 컨트롤러
- 롤링 업데이트, 롤백 제공
- 이미지 변경 시 새 ReplicaSet 생성하여 롤링 업데이트
- 리비전 히스토리 관리

실무에서는 거의 항상 Deployment를 사용한다.

### Q2. maxSurge와 maxUnavailable을 설명해라

**maxSurge:**
- 롤링 업데이트 중 desired replicas를 **초과**하여 생성할 수 있는 Pod 수
- 값이 크면: 빠른 배포, 더 많은 리소스 사용

**maxUnavailable:**
- 롤링 업데이트 중 **사용 불가능**할 수 있는 Pod 수
- 값이 크면: 빠른 배포, 가용성 감소

둘 다 0일 수는 없다 (무한 대기 상태).

### Q3. 롤백은 어떻게 동작하는가?

1. Deployment는 이전 ReplicaSet들을 보관 (revisionHistoryLimit까지)
2. `kubectl rollout undo` 실행
3. 이전 ReplicaSet의 replicas를 증가
4. 현재 ReplicaSet의 replicas를 감소
5. 롤링 업데이트와 동일한 방식으로 교체

```yaml
spec:
  revisionHistoryLimit: 10  # 보관할 이전 ReplicaSet 수 (기본값: 10)
```

### Q4. Pod Template이 변경되지 않으면 롤아웃이 트리거되는가?

아니다. Deployment는 `spec.template`이 변경될 때만 롤아웃을 트리거한다.

다음 변경은 롤아웃을 트리거하지 않는다:
- `spec.replicas` 변경 (스케일링만)
- `metadata.labels` 변경
- `metadata.annotations` 변경

---

## 8. CKA 실습

### 8.1 Deployment 생성

```bash
# 명령형
kubectl create deployment nginx --image=nginx:1.21 --replicas=3

# YAML 생성 (dry-run)
kubectl create deployment nginx --image=nginx:1.21 --replicas=3 --dry-run=client -o yaml > deployment.yaml
```

### 8.2 롤링 업데이트 실습

```bash
# Deployment 생성
kubectl create deployment nginx --image=nginx:1.21 --replicas=3

# 롤아웃 상태 확인 (다른 터미널)
kubectl rollout status deployment/nginx -w

# 이미지 업데이트
kubectl set image deployment/nginx nginx=nginx:1.22

# 변경 원인 기록
kubectl annotate deployment/nginx kubernetes.io/change-cause="Update to nginx 1.22"

# 히스토리 확인
kubectl rollout history deployment/nginx
```

### 8.3 롤백 실습

```bash
# 잘못된 이미지로 업데이트
kubectl set image deployment/nginx nginx=nginx:invalid-tag

# 롤아웃 상태 확인 (실패)
kubectl rollout status deployment/nginx

# 롤백
kubectl rollout undo deployment/nginx

# 또는 특정 리비전으로
kubectl rollout undo deployment/nginx --to-revision=1
```

### 8.4 전략 변경

```yaml
# rolling-update.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  replicas: 10
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 2
      maxUnavailable: 1
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
```

---

## 정리

### 주요 개념 체크리스트

- ReplicaSet의 역할과 한계
- Deployment가 ReplicaSet을 관리하는 방식
- 롤링 업데이트와 Recreate 전략
- maxSurge와 maxUnavailable의 의미
- 롤아웃 관리 (상태 확인, 일시 중지, 롤백)
- 변경 원인 기록

### 다음 포스트

[Part 9: StatefulSet과 DaemonSet](/posts/kubernetes-09-statefulset)에서는 상태가 있는 애플리케이션과 노드별 배포를 다룬다.

---

## 참고 자료

- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [ReplicaSet](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/)
- [Rolling Update Strategy](https://kubernetes.io/docs/tutorials/kubernetes-basics/update/update-intro/)

