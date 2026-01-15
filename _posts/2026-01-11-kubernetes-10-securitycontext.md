---
title: "Part 10: SecurityContext와 Pod Security - 보안 강화"
date: 2026-01-11
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, SecurityContext, PodSecurityStandards, Security]
layout: post
toc: true
math: true
mermaid: true
---

# Part 10: Pod 보안

## 26. Pod Security

### 26.1 SecurityContext

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

**주요 옵션:**

- **runAsUser**: 컨테이너 실행 사용자 ID
- **runAsGroup**: 컨테이너 실행 그룹 ID
- **fsGroup**: 볼륨 소유권 그룹 ID
- **allowPrivilegeEscalation**: 권한 상승 허용 여부
- **capabilities**: Linux capabilities 추가/제거
- **readOnlyRootFilesystem**: 읽기 전용 루트 파일 시스템

### 26.2 PodSecurityPolicy (deprecated)

K8s 1.25부터 제거됨. Pod Security Standards 사용 권장.

### 26.3 Pod Security Standards

**3가지 정책 수준:**

**Privileged:**

- 권한 무제한
- 특수 목적용 (시스템 컴포넌트 등)

**Baseline:**

- 일반적인 공격으로부터 보호
- 대부분의 Pod에 적합
- 최소한의 제약

**Restricted:**

- 보안 모범 사례 적용
- 엄격한 정책
- 프로덕션 환경 권장

**Namespace에 적용:**

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

**3가지 모드:**

- **enforce**: 정책 위반 시 Pod 생성 거부
- **audit**: 정책 위반 로그 기록
- **warn**: 정책 위반 경고 표시

---

## 학습 정리

### 핵심 개념

1. **SecurityContext**로 Pod/컨테이너 수준 보안 설정
2. **Pod Security Standards**로 클러스터 전체 보안 정책 적용
3. **Privileged, Baseline, Restricted** 3가지 정책 수준
4. **enforce, audit, warn** 모드로 정책 적용 방식 선택

### 다음 단계

- SecurityContext 이해
- Pod Security Standards 적용
- Admission Control 학습 → **[Part 11로 이동](https://k-diger.github.io/posts//posts/kubernetes-12-admission-webhook)**

---

## 실습 과제

1. **SecurityContext 설정**
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-pod
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 2000
  containers:
    - name: app
      image: nginx
      securityContext:
        allowPrivilegeEscalation: false
        capabilities:
          drop:
            - ALL
        readOnlyRootFilesystem: true
      volumeMounts:
        - name: cache
          mountPath: /var/cache/nginx
        - name: run
          mountPath: /var/run
  volumes:
    - name: cache
      emptyDir: {}
    - name: run
      emptyDir: {}
```

```bash
kubectl apply -f secure-pod.yaml
kubectl exec secure-pod -- id
```

2. **Pod Security Standards 적용**
```bash
# Namespace 생성 (restricted 정책)
kubectl create namespace production
kubectl label namespace production pod-security.kubernetes.io/enforce=restricted

# Restricted 정책 위반하는 Pod 생성 시도 (실패)
kubectl run nginx --image=nginx -n production

# 정책 준수하는 Pod 생성 (성공)
kubectl apply -f secure-pod.yaml -n production
```

---

## 추가 학습 자료

- [SecurityContext 공식 문서](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/)
- [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- [Pod Security Admission](https://kubernetes.io/docs/concepts/security/pod-security-admission/)

---
