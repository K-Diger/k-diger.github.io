---
title: "Part 11: Admission Webhook - 정책 제어"
date: 2026-01-12
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, Admission, OPA, Gatekeeper, Security]
layout: post
toc: true
math: true
mermaid: true
---

# Part 11: Admission Control 및 정책

## 27. Admission Controllers

### 27.1 Admission Controller 개념

**Admission Controller란?**

Admission Controller는 **API 요청이 인증/인가를 통과한 후, etcd에 저장되기 전에 요청을 가로채서 검증하거나 수정하는 플러그인**이다.

**API 요청 처리 흐름:**

```
1. Authentication (인증)
   ↓
2. Authorization (인가: RBAC)
   ↓
3. Admission Control
   ├─ Mutating Admission: 요청 수정
   └─ Validating Admission: 요청 검증
   ↓
4. etcd에 저장
```

**주요 내장 Admission Controllers:**

```yaml
NamespaceLifecycle:
  - 삭제 중인 네임스페이스에 리소스 생성 차단
  - default, kube-system, kube-public 삭제 차단

LimitRanger:
  - LimitRange 정책 적용

ResourceQuota:
  - ResourceQuota 정책 적용

ServiceAccount:
  - ServiceAccount 자동 생성 및 토큰 주입

DefaultStorageClass:
  - PVC에 기본 StorageClass 자동 설정

PodSecurity (신규):
  - Pod Security Standards 적용 (v1.23+)

NodeRestriction:
  - kubelet이 자기 노드의 Pod만 수정 가능하도록 제한
```

### 27.2 Validating Admission

**Validating Admission은 요청을 검증하고 승인/거부한다 (수정 불가).**

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingWebhookConfiguration
metadata:
  name: pod-label-validator
webhooks:
- name: validate.pod.labels
  clientConfig:
    service:
      name: webhook-server
      namespace: default
      path: "/validate"
    caBundle: LS0tLS...  # CA 인증서
  rules:
  - operations: ["CREATE"]
    apiGroups: [""]
    apiVersions: ["v1"]
    resources: ["pods"]
  admissionReviewVersions: ["v1"]
  sideEffects: None
  timeoutSeconds: 5
  failurePolicy: Fail
```

### 27.3 Mutating Admission

**Mutating Admission은 요청을 수정한 후 다음 단계로 전달한다.**

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: MutatingWebhookConfiguration
metadata:
  name: sidecar-injector
webhooks:
- name: inject.sidecar
  clientConfig:
    service:
      name: sidecar-injector
      namespace: default
      path: "/mutate"
    caBundle: LS0tLS...
  rules:
  - operations: ["CREATE"]
    apiGroups: [""]
    apiVersions: ["v1"]
    resources: ["pods"]
  admissionReviewVersions: ["v1"]
  sideEffects: None
```

---

## 28. OPA (Open Policy Agent)

### 28.1 OPA 개념

**OPA (Open Policy Agent)란?**

OPA는 **정책을 코드로 작성하여 다양한 시스템에서 정책 기반 제어를 할 수 있는 범용 정책 엔진**이다.

**OPA의 특징:**

- 선언적 정책 언어 (Rego)
- Kubernetes 외 다양한 시스템 지원
- 정책과 애플리케이션 분리

### 28.2 Gatekeeper

**Gatekeeper = OPA + Kubernetes:**

Gatekeeper는 Kubernetes에서 OPA를 쉽게 사용할 수 있도록 하는 프로젝트다.

**Gatekeeper 설치:**

```bash
kubectl apply -f https://raw.githubusercontent.com/open-policy-agent/gatekeeper/release-3.14/deploy/gatekeeper.yaml

# 확인
kubectl get pods -n gatekeeper-system
```

### 28.3 정책 작성 (Rego)

**ConstraintTemplate 작성:**

```yaml
apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: k8srequiredlabels
spec:
  crd:
    spec:
      names:
        kind: K8sRequiredLabels
      validation:
        openAPIV3Schema:
          type: object
          properties:
            labels:
              type: array
              items:
                type: string
  targets:
  - target: admission.k8s.gatekeeper.sh
    rego: |
      package k8srequiredlabels

      violation[{"msg": msg, "details": {"missing_labels": missing}}] {
        provided := {label | input.review.object.metadata.labels[label]}
        required := {label | label := input.parameters.labels[_]}
        missing := required - provided
        count(missing) > 0
        msg := sprintf("You must provide labels: %v", [missing])
      }
```

**Constraint 생성:**

```yaml
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sRequiredLabels
metadata:
  name: pods-must-have-labels
spec:
  match:
    kinds:
    - apiGroups: [""]
      kinds: ["Pod"]
    namespaces:
    - "production"
  parameters:
    labels:
    - "app"
    - "owner"
    - "environment"
```

---

## 학습 정리

### 핵심 개념

1. **Admission Controllers**로 API 요청 검증 및 수정
2. **Validating Admission**으로 요청 검증, **Mutating Admission**으로 요청 수정
3. **OPA/Gatekeeper**로 복잡한 정책을 Rego 언어로 작성
4. **ConstraintTemplate**과 **Constraint**로 재사용 가능한 정책 관리

### 다음 단계

- Admission Controllers 이해
- OPA/Gatekeeper 사용법 학습
- 스케줄링 학습 → **[Part 12로 이동](/posts/kubernetes-13-taint-affinity)**

---

## 실습 과제

1. **Gatekeeper 설치 및 정책 적용**
   ```bash
   # Gatekeeper 설치
   kubectl apply -f https://raw.githubusercontent.com/open-policy-agent/gatekeeper/release-3.14/deploy/gatekeeper.yaml

   # ConstraintTemplate 생성
   kubectl apply -f required-labels-template.yaml

   # Constraint 생성
   kubectl apply -f required-labels-constraint.yaml

   # 테스트 (실패)
   kubectl run nginx --image=nginx -n production

   # 테스트 (성공)
   kubectl run nginx --image=nginx -n production --labels=app=nginx,owner=john,environment=prod
   ```

---

## 추가 학습 자료

- [Admission Controllers 공식 문서](https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/)
- [Dynamic Admission Control](https://kubernetes.io/docs/reference/access-authn-authz/extensible-admission-controllers/)
- [OPA 공식 문서](https://www.openpolicyagent.org/docs/latest/)
- [Gatekeeper 공식 문서](https://open-policy-agent.github.io/gatekeeper/website/docs/)

---
