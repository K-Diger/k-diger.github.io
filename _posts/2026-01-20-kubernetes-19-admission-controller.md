---
layout: post
title: "Kubernetes 가이드 - Admission Controller"
date: 2026-01-20
categories: [Kubernetes]
tags: [kubernetes, admission-controller, webhook, security, cka, cks]
---

**Admission Controller**는 API 요청이 etcd에 저장되기 전에 요청을 검증하거나 변형하는 게이트키퍼 역할을 한다. 인증(Authentication)과 인가(Authorization) 이후, 영속화 직전에 실행된다.

## API 요청 흐름

```
클라이언트 요청
     ↓
┌─────────────┐
│ API Server  │
├─────────────┤
│ Authentication (인증)
│ - 누구인가?
├─────────────┤
│ Authorization (인가)
│ - 권한이 있는가? (RBAC)
├─────────────┤
│ Admission Controller  ← 여기서 동작
│ - Mutating (변형)
│ - Validating (검증)
├─────────────┤
│ etcd (저장)
└─────────────┘
```

## Admission Controller 종류

### Built-in Admission Controllers

Kubernetes에 내장된 컨트롤러들이다.

```bash
# 활성화된 Admission Controller 확인
kubectl exec -n kube-system kube-apiserver-<node> -- \
  kube-apiserver --help | grep enable-admission-plugins

# 또는 API Server 매니페스트 확인
cat /etc/kubernetes/manifests/kube-apiserver.yaml | grep admission
```

**주요 Built-in Controllers**:

| Controller | 유형 | 설명 |
|------------|------|------|
| NamespaceLifecycle | Validating | 삭제 중인 namespace에 리소스 생성 방지 |
| LimitRanger | Mutating | LimitRange 기본값 적용 |
| ServiceAccount | Mutating | ServiceAccount 자동 할당 |
| DefaultStorageClass | Mutating | 기본 StorageClass 자동 적용 |
| ResourceQuota | Validating | ResourceQuota 초과 방지 |
| PodSecurity | Validating | Pod Security Standards 적용 |
| NodeRestriction | Validating | kubelet의 API 접근 제한 |
| MutatingAdmissionWebhook | Mutating | 외부 웹훅 호출 |
| ValidatingAdmissionWebhook | Validating | 외부 웹훅 호출 |

### Mutating vs Validating

**Mutating Admission Controller**:
- 요청을 **수정**할 수 있음
- 기본값 설정, 사이드카 주입 등
- Validating보다 먼저 실행

**Validating Admission Controller**:
- 요청을 **검증**만 함
- 조건 불만족 시 거부
- Mutating 이후에 실행

```
요청 → Mutating → Mutating → ... → Validating → Validating → ... → 저장
       (순차 실행)                    (병렬 실행 가능)
```

## Admission Controller 설정

### API Server에서 활성화/비활성화

```yaml
# /etc/kubernetes/manifests/kube-apiserver.yaml
apiVersion: v1
kind: Pod
metadata:
  name: kube-apiserver
  namespace: kube-system
spec:
  containers:
  - command:
    - kube-apiserver
    - --enable-admission-plugins=NodeRestriction,PodSecurity,MutatingAdmissionWebhook,ValidatingAdmissionWebhook
    - --disable-admission-plugins=DefaultTolerationSeconds
    # ...
```

**주의**: API Server 매니페스트 수정 후 자동 재시작됨.

## Admission Webhook

### 개념

**Webhook**은 외부 서비스를 호출하여 Admission 로직을 확장한다.

```
API 요청
    ↓
API Server
    ↓ HTTPS 호출
┌─────────────────┐
│ Webhook Service │  ← 사용자 정의 로직
│  (Pod/외부)     │
└─────────────────┘
    ↓ 응답
API Server
    ↓
etcd 저장
```

### MutatingWebhookConfiguration

요청을 수정하는 웹훅을 등록한다.

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: MutatingWebhookConfiguration
metadata:
  name: mutating-webhook
webhooks:
- name: mutate.example.com
  clientConfig:
    service:
      name: webhook-service
      namespace: webhook-system
      path: "/mutate"
    caBundle: <base64-encoded-ca-cert>
  rules:
  - operations: ["CREATE", "UPDATE"]
    apiGroups: [""]
    apiVersions: ["v1"]
    resources: ["pods"]
  admissionReviewVersions: ["v1"]
  sideEffects: None
  failurePolicy: Fail
  namespaceSelector:
    matchLabels:
      webhook: enabled
```

### ValidatingWebhookConfiguration

요청을 검증하는 웹훅을 등록한다.

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingWebhookConfiguration
metadata:
  name: validating-webhook
webhooks:
- name: validate.example.com
  clientConfig:
    service:
      name: webhook-service
      namespace: webhook-system
      path: "/validate"
    caBundle: <base64-encoded-ca-cert>
  rules:
  - operations: ["CREATE", "UPDATE"]
    apiGroups: ["apps"]
    apiVersions: ["v1"]
    resources: ["deployments"]
  admissionReviewVersions: ["v1"]
  sideEffects: None
  failurePolicy: Fail
```

### 주요 설정 옵션

**failurePolicy**:
- `Fail`: 웹훅 오류 시 요청 거부 (기본값)
- `Ignore`: 웹훅 오류 시 요청 허용

**sideEffects**:
- `None`: 부작용 없음 (드라이런 가능)
- `NoneOnDryRun`: 드라이런 시 부작용 없음
- `Some`: 부작용 있음
- `Unknown`: 알 수 없음

**namespaceSelector / objectSelector**:
특정 namespace나 object에만 웹훅 적용.

```yaml
namespaceSelector:
  matchLabels:
    environment: production
objectSelector:
  matchLabels:
    inject-sidecar: "true"
```

**matchPolicy**:
- `Exact`: 정확히 지정된 리소스만
- `Equivalent`: 동등한 리소스도 포함 (예: deployments와 deployments/scale)

## 실전 사용 사례

### 1. 사이드카 자동 주입 (Istio 스타일)

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: MutatingWebhookConfiguration
metadata:
  name: sidecar-injector
webhooks:
- name: sidecar-injector.istio.io
  clientConfig:
    service:
      name: istiod
      namespace: istio-system
      path: "/inject"
  rules:
  - operations: ["CREATE"]
    apiGroups: [""]
    apiVersions: ["v1"]
    resources: ["pods"]
  namespaceSelector:
    matchLabels:
      istio-injection: enabled
```

### 2. 이미지 레지스트리 검증

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingWebhookConfiguration
metadata:
  name: image-policy
webhooks:
- name: images.policy.example.com
  rules:
  - operations: ["CREATE", "UPDATE"]
    apiGroups: [""]
    apiVersions: ["v1"]
    resources: ["pods"]
  # 승인된 레지스트리의 이미지만 허용
  # 웹훅 서비스에서 이미지 출처 검증
```

### 3. 리소스 요청 강제

```yaml
# 모든 Pod에 resources.requests 필수
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingWebhookConfiguration
metadata:
  name: require-resources
webhooks:
- name: resources.policy.example.com
  rules:
  - operations: ["CREATE"]
    apiGroups: [""]
    apiVersions: ["v1"]
    resources: ["pods"]
```

## ImagePolicyWebhook

이미지 정책을 검증하는 특수 Admission Controller이다.

### 설정

```yaml
# /etc/kubernetes/admission/admission-config.yaml
apiVersion: apiserver.config.k8s.io/v1
kind: AdmissionConfiguration
plugins:
- name: ImagePolicyWebhook
  configuration:
    imagePolicy:
      kubeConfigFile: /etc/kubernetes/admission/imagepolicy-kubeconfig.yaml
      allowTTL: 50
      denyTTL: 50
      retryBackoff: 500
      defaultAllow: false  # 기본 거부
```

API Server에서 활성화:
```
--admission-control-config-file=/etc/kubernetes/admission/admission-config.yaml
--enable-admission-plugins=ImagePolicyWebhook
```

## Validating/Mutating Admission Policy (1.26+)

Kubernetes 1.26부터 **CEL(Common Expression Language)**을 사용한 인라인 정책이 가능하다.

### ValidatingAdmissionPolicy

웹훅 없이 검증 규칙을 정의한다.

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicy
metadata:
  name: "require-runasnonroot"
spec:
  failurePolicy: Fail
  matchConstraints:
    resourceRules:
    - apiGroups:   [""]
      apiVersions: ["v1"]
      operations:  ["CREATE", "UPDATE"]
      resources:   ["pods"]
  validations:
  - expression: "object.spec.securityContext.runAsNonRoot == true"
    message: "Pods must run as non-root"
---
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicyBinding
metadata:
  name: "require-runasnonroot-binding"
spec:
  policyName: "require-runasnonroot"
  validationActions: [Deny]
  matchResources:
    namespaceSelector:
      matchLabels:
        environment: production
```

**장점**:
- 웹훅 서비스 불필요
- 지연 시간 감소
- 클러스터 내에서 완결

## 트러블슈팅

### Admission 거부 디버깅

```bash
# 에러 예시
Error from server: admission webhook "validate.example.com" denied the request: ...

# 웹훅 상태 확인
kubectl get validatingwebhookconfigurations
kubectl get mutatingwebhookconfigurations

# 웹훅 상세 확인
kubectl describe validatingwebhookconfiguration <name>

# 웹훅 서비스 로그 확인
kubectl logs -n webhook-system <webhook-pod>
```

### 웹훅 서비스 장애 시

**failurePolicy: Fail** 설정 시 웹훅 서비스가 다운되면 모든 관련 요청이 거부된다.

```bash
# 긴급 대응: 웹훅 설정 삭제
kubectl delete validatingwebhookconfiguration <name>

# 또는 failurePolicy를 Ignore로 변경
kubectl patch validatingwebhookconfiguration <name> \
  --type='json' -p='[{"op": "replace", "path": "/webhooks/0/failurePolicy", "value": "Ignore"}]'
```

### 웹훅 제외 namespace

```yaml
# kube-system 등 중요 namespace 제외
namespaceSelector:
  matchExpressions:
  - key: kubernetes.io/metadata.name
    operator: NotIn
    values:
    - kube-system
    - kube-public
```

## 기술 면접 대비

### 자주 묻는 질문

**Q: Mutating과 Validating Admission Controller의 실행 순서는?**

A: Mutating이 먼저 실행되고, 그 다음 Validating이 실행된다. Mutating 컨트롤러들은 순차적으로 실행되며 이전 컨트롤러의 변경 사항이 다음 컨트롤러에 전달된다. Validating 컨트롤러들은 병렬로 실행될 수 있고, 하나라도 거부하면 전체 요청이 거부된다.

**Q: Admission Webhook의 failurePolicy 옵션 차이는?**

A: Fail은 웹훅이 오류를 반환하거나 응답하지 않으면 요청을 거부한다. Ignore는 웹훅 오류 시에도 요청을 허용한다. 보안이 중요한 웹훅은 Fail을, 선택적인 기능은 Ignore를 사용한다. Fail 설정 시 웹훅 서비스 가용성이 클러스터 운영에 영향을 미칠 수 있다.

**Q: Admission Controller와 RBAC의 차이는?**

A: RBAC은 "이 사용자가 이 동작을 할 수 있는가?"를 결정하는 인가(Authorization) 단계이다. Admission Controller는 인가를 통과한 요청에 대해 "이 요청의 내용이 정책에 부합하는가?"를 검사한다. 예를 들어 RBAC은 Pod 생성 권한을 확인하고, Admission Controller는 Pod 스펙이 보안 정책을 만족하는지 확인한다.

**Q: 사이드카 주입은 어떻게 동작하는가?**

A: MutatingWebhookConfiguration을 등록하여 Pod 생성 요청을 가로챈다. 웹훅 서비스가 Pod 스펙에 사이드카 컨테이너를 추가하여 응답한다. 원본 요청에는 사이드카가 없었지만 실제 생성되는 Pod에는 사이드카가 포함된다. Istio의 envoy 사이드카가 대표적인 예이다.

**Q: 클러스터 부트스트랩 시 웹훅이 문제가 될 수 있는 이유는?**

A: 웹훅 서비스가 아직 실행되지 않은 상태에서 failurePolicy: Fail 웹훅이 kube-system Pod에 적용되면 시스템 컴포넌트를 생성할 수 없어 데드락이 발생한다. 이를 방지하려면 kube-system namespace를 웹훅 대상에서 제외하거나, 시스템 컴포넌트용 exemption을 설정해야 한다.

## CKA 시험 대비 필수 명령어

```bash
# Admission Controller 확인
kubectl exec -n kube-system kube-apiserver-<node> -- \
  kube-apiserver --help | grep enable-admission-plugins

# Webhook 설정 조회
kubectl get validatingwebhookconfigurations
kubectl get mutatingwebhookconfigurations
kubectl describe validatingwebhookconfiguration <name>

# API Server 매니페스트 확인
cat /etc/kubernetes/manifests/kube-apiserver.yaml

# 웹훅 삭제 (긴급 시)
kubectl delete validatingwebhookconfiguration <name>
kubectl delete mutatingwebhookconfiguration <name>
```

### CKA 빈출 시나리오

```bash
# 시나리오 1: 활성화된 Admission Controller 확인
# API Server Pod에서 --enable-admission-plugins 플래그 확인

# 시나리오 2: 특정 Admission Controller 활성화
# /etc/kubernetes/manifests/kube-apiserver.yaml 수정
# --enable-admission-plugins=NodeRestriction,PodSecurity,...,NewPlugin

# 시나리오 3: Webhook 트러블슈팅
# 1. webhook configuration 확인
kubectl get validatingwebhookconfigurations -o yaml
# 2. webhook 서비스/pod 확인
kubectl get pods -n <webhook-namespace>
# 3. 로그 확인
kubectl logs -n <webhook-namespace> <webhook-pod>
```

## 다음 단계

- [Kubernetes 가이드 - 클러스터 유지보수](/kubernetes/kubernetes-20-cluster-maintenance)
- [Kubernetes 가이드 - 모니터링과 로깅](/kubernetes/kubernetes-21-monitoring)
