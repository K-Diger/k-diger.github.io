---
layout: post
title: "Kubernetes 가이드 - RBAC 이해"
date: 2026-01-18
categories: [Kubernetes]
tags: [kubernetes, rbac, security, role, clusterrole, serviceaccount, cka]
---

Kubernetes의 **RBAC(Role-Based Access Control)**은 "누가" "무엇을" "어디서" 할 수 있는지를 제어한다. API 요청의 인증(Authentication) 이후 인가(Authorization) 단계에서 RBAC 규칙이 적용된다.

## RBAC 기본 개념

### 핵심 구성 요소

```
┌─────────────────────────────────────────────────────────────┐
│                         RBAC                                │
├─────────────────────────────────────────────────────────────┤
│  Subject          Role/ClusterRole      RoleBinding/       │
│  (누가)     +     (무엇을)         +    ClusterRoleBinding │
│                                          (연결)             │
│  - User                                                     │
│  - Group           - rules:                                 │
│  - ServiceAccount    - apiGroups                           │
│                      - resources                            │
│                      - verbs                                │
└─────────────────────────────────────────────────────────────┘
```

**Subject**: 권한을 부여받는 대상
- User: 사람 (Kubernetes가 관리하지 않음)
- Group: 사용자 그룹
- ServiceAccount: Pod가 사용하는 계정

**Role/ClusterRole**: 권한 정의
- Role: Namespace 범위
- ClusterRole: 클러스터 전체 범위

**RoleBinding/ClusterRoleBinding**: Subject와 Role 연결
- RoleBinding: Namespace 내 권한 부여
- ClusterRoleBinding: 클러스터 전체 권한 부여

## Role과 ClusterRole

### Role (Namespace 범위)

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: default
rules:
- apiGroups: [""]           # core API group (v1)
  resources: ["pods"]
  verbs: ["get", "watch", "list"]
- apiGroups: [""]
  resources: ["pods/log"]   # subresource
  verbs: ["get"]
```

### ClusterRole (클러스터 범위)

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: secret-reader
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "watch", "list"]
```

**ClusterRole이 필요한 경우**:
- 클러스터 범위 리소스 (nodes, persistentvolumes 등)
- 모든 Namespace의 리소스에 대한 권한
- 비리소스 URL (/healthz, /api 등)

### apiGroups

| apiGroup | 리소스 예시 |
|----------|------------|
| "" (core) | pods, services, secrets, configmaps |
| apps | deployments, replicasets, statefulsets |
| batch | jobs, cronjobs |
| networking.k8s.io | ingresses, networkpolicies |
| rbac.authorization.k8s.io | roles, rolebindings |
| storage.k8s.io | storageclasses, csidrivers |

```bash
# API 그룹 확인
kubectl api-resources
kubectl api-resources -o wide  # 상세 정보
```

### verbs (동작)

| Verb | 설명 | HTTP Method |
|------|------|-------------|
| get | 단일 리소스 조회 | GET |
| list | 리소스 목록 조회 | GET |
| watch | 변경 감시 | GET (watch) |
| create | 리소스 생성 | POST |
| update | 전체 업데이트 | PUT |
| patch | 부분 업데이트 | PATCH |
| delete | 단일 삭제 | DELETE |
| deletecollection | 복수 삭제 | DELETE |

### resourceNames (특정 리소스만)

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: configmap-updater
  namespace: default
rules:
- apiGroups: [""]
  resources: ["configmaps"]
  resourceNames: ["app-config"]  # 특정 ConfigMap만
  verbs: ["get", "update"]
```

## RoleBinding과 ClusterRoleBinding

### RoleBinding

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods
  namespace: default
subjects:
- kind: User
  name: jane
  apiGroup: rbac.authorization.k8s.io
- kind: ServiceAccount
  name: monitoring-sa
  namespace: monitoring
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

### ClusterRoleBinding

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: admin-binding
subjects:
- kind: Group
  name: system:masters
  apiGroup: rbac.authorization.k8s.io
- kind: User
  name: admin@example.com
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: cluster-admin
  apiGroup: rbac.authorization.k8s.io
```

### RoleBinding으로 ClusterRole 참조

ClusterRole을 RoleBinding으로 참조하면 **특정 Namespace에서만** 해당 권한이 적용된다.

```yaml
# ClusterRole 정의
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: pod-manager
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["*"]
---
# RoleBinding으로 참조 → development namespace에서만 적용
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: pod-manager-binding
  namespace: development
subjects:
- kind: User
  name: developer
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole  # ClusterRole 참조
  name: pod-manager
  apiGroup: rbac.authorization.k8s.io
```

**활용 패턴**: 공통 ClusterRole을 정의하고, 각 Namespace에서 RoleBinding으로 재사용.

## ServiceAccount

### ServiceAccount 개념

Pod가 API Server와 통신할 때 사용하는 신원(identity)이다.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-service-account
  namespace: default
```

### Pod에서 ServiceAccount 사용

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-pod
spec:
  serviceAccountName: my-service-account
  containers:
  - name: app
    image: myapp:1.0
```

**기본 동작**:
- 지정하지 않으면 `default` ServiceAccount 사용
- ServiceAccount 토큰이 `/var/run/secrets/kubernetes.io/serviceaccount/`에 마운트됨

### 자동 토큰 마운트 비활성화

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: no-token-sa
automountServiceAccountToken: false
---
# 또는 Pod 수준에서
apiVersion: v1
kind: Pod
metadata:
  name: no-token-pod
spec:
  serviceAccountName: my-sa
  automountServiceAccountToken: false
  containers:
  - name: app
    image: myapp:1.0
```

### ServiceAccount에 권한 부여

```yaml
# ServiceAccount 생성
apiVersion: v1
kind: ServiceAccount
metadata:
  name: deployment-manager
  namespace: production
---
# Role 생성
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: deployment-role
  namespace: production
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "create", "update", "delete"]
---
# RoleBinding으로 연결
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: deployment-binding
  namespace: production
subjects:
- kind: ServiceAccount
  name: deployment-manager
  namespace: production
roleRef:
  kind: Role
  name: deployment-role
  apiGroup: rbac.authorization.k8s.io
```

## 기본 ClusterRole

Kubernetes에 내장된 기본 ClusterRole들:

| ClusterRole | 설명 |
|-------------|------|
| cluster-admin | 모든 권한 (superuser) |
| admin | Namespace 관리자 권한 |
| edit | 대부분의 리소스 읽기/쓰기 |
| view | 읽기 전용 |

```bash
# 기본 ClusterRole 확인
kubectl get clusterrole | grep -E "^(cluster-admin|admin|edit|view)"

# 상세 확인
kubectl describe clusterrole edit
```

### system: 접두사

`system:` 접두사가 붙은 Role/ClusterRole은 시스템 컴포넌트용이다.

- `system:node`: kubelet용
- `system:kube-scheduler`: 스케줄러용
- `system:kube-controller-manager`: 컨트롤러 매니저용

**주의**: 시스템 역할을 수정하지 않는 것이 좋다.

## 권한 확인

### kubectl auth can-i

```bash
# 현재 사용자의 권한 확인
kubectl auth can-i create deployments
kubectl auth can-i delete pods --namespace production

# 다른 사용자 확인 (admin 권한 필요)
kubectl auth can-i create pods --as jane
kubectl auth can-i list secrets --as system:serviceaccount:default:my-sa

# 모든 권한 나열
kubectl auth can-i --list
kubectl auth can-i --list --as jane --namespace development
```

### 권한 검증 예시

```bash
# ServiceAccount 권한 테스트
kubectl auth can-i get pods --as system:serviceaccount:default:my-sa
# yes

kubectl auth can-i delete pods --as system:serviceaccount:default:my-sa
# no
```

## 실전 시나리오

### 개발자용 Namespace 권한

```yaml
# 개발자 그룹에게 development namespace 전체 권한
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: developer-admin
  namespace: development
subjects:
- kind: Group
  name: developers
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: admin
  apiGroup: rbac.authorization.k8s.io
```

### 읽기 전용 접근

```yaml
# 모니터링 서비스에게 모든 namespace 읽기 권한
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: monitoring-view
subjects:
- kind: ServiceAccount
  name: prometheus
  namespace: monitoring
roleRef:
  kind: ClusterRole
  name: view
  apiGroup: rbac.authorization.k8s.io
```

### CI/CD 파이프라인용

```yaml
# CI/CD ServiceAccount
apiVersion: v1
kind: ServiceAccount
metadata:
  name: cicd-deployer
  namespace: cicd
---
# 배포 권한
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: deployer
rules:
- apiGroups: ["", "apps", "networking.k8s.io"]
  resources: ["deployments", "services", "ingresses", "configmaps", "secrets"]
  verbs: ["get", "list", "create", "update", "patch", "delete"]
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list", "watch"]
---
# production namespace에만 적용
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: cicd-deployer-binding
  namespace: production
subjects:
- kind: ServiceAccount
  name: cicd-deployer
  namespace: cicd
roleRef:
  kind: ClusterRole
  name: deployer
  apiGroup: rbac.authorization.k8s.io
```

### 특정 리소스만 접근

```yaml
# 특정 ConfigMap과 Secret만 접근 가능
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: app-config-reader
  namespace: production
rules:
- apiGroups: [""]
  resources: ["configmaps"]
  resourceNames: ["app-config", "feature-flags"]
  verbs: ["get", "watch"]
- apiGroups: [""]
  resources: ["secrets"]
  resourceNames: ["app-credentials"]
  verbs: ["get"]
```

## 트러블슈팅

### 권한 거부 디버깅

```bash
# 에러 예시
# Error from server (Forbidden): pods is forbidden: User "jane" cannot list resource "pods"

# 1. 현재 권한 확인
kubectl auth can-i --list --as jane

# 2. 관련 RoleBinding 확인
kubectl get rolebindings,clusterrolebindings -o wide | grep jane

# 3. Role 상세 확인
kubectl describe role <role-name>
kubectl describe clusterrole <clusterrole-name>
```

### 일반적인 실수

**1. apiGroups 누락**:
```yaml
# 잘못됨 - deployments는 apps 그룹
rules:
- apiGroups: [""]
  resources: ["deployments"]  # 실패
  verbs: ["get"]

# 올바름
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get"]
```

**2. Namespace 불일치**:
```yaml
# RoleBinding은 반드시 대상 Namespace에 있어야 함
kind: RoleBinding
metadata:
  name: binding
  namespace: production  # 이 namespace에서만 유효
```

**3. Subject 형식 오류**:
```yaml
# ServiceAccount subject
subjects:
- kind: ServiceAccount
  name: my-sa
  namespace: default  # ServiceAccount는 namespace 필요
# User subject
subjects:
- kind: User
  name: jane
  apiGroup: rbac.authorization.k8s.io  # User는 apiGroup 필요
```

## 기술 면접 대비

### 자주 묻는 질문

**Q: Role과 ClusterRole의 차이는?**

A: Role은 Namespace 범위의 권한을 정의하고, 해당 Namespace 내 리소스에만 적용된다. ClusterRole은 클러스터 전체 범위로, nodes나 PersistentVolumes 같은 클러스터 범위 리소스나 모든 Namespace의 리소스에 대한 권한을 정의할 수 있다. ClusterRole을 RoleBinding으로 참조하면 특정 Namespace에서만 적용되어 재사용성이 높아진다.

**Q: RoleBinding과 ClusterRoleBinding의 차이는?**

A: RoleBinding은 특정 Namespace 내에서 Subject에게 Role(또는 ClusterRole)의 권한을 부여한다. ClusterRoleBinding은 클러스터 전체에서 권한을 부여한다. RoleBinding이 ClusterRole을 참조해도 해당 Namespace 내로 권한이 제한된다.

**Q: ServiceAccount가 필요한 이유는?**

A: Pod 내 애플리케이션이 Kubernetes API와 상호작용해야 할 때 신원(identity)을 제공한다. 기본 ServiceAccount는 권한이 제한되어 있으므로, 필요한 권한만 가진 ServiceAccount를 생성하여 최소 권한 원칙을 적용할 수 있다. 또한 ServiceAccount 토큰을 통해 Pod를 인증한다.

**Q: kubectl auth can-i 명령의 용도는?**

A: 특정 동작에 대한 권한이 있는지 확인한다. 현재 사용자의 권한은 물론, `--as` 플래그로 다른 사용자나 ServiceAccount의 권한도 확인할 수 있다. RBAC 설정 검증이나 트러블슈팅에 유용하다.

**Q: 최소 권한 원칙(Principle of Least Privilege)을 RBAC에서 어떻게 적용하는가?**

A: 필요한 권한만 부여한다. 넓은 범위의 기본 ClusterRole(cluster-admin, admin) 대신 필요한 리소스와 동작만 포함한 커스텀 Role을 만든다. ClusterRole 대신 Role, ClusterRoleBinding 대신 RoleBinding을 사용하여 범위를 제한한다. resourceNames로 특정 리소스만 지정할 수 있다.

## CKA 시험 대비 필수 명령어

```bash
# Role/ClusterRole 생성
kubectl create role pod-reader --verb=get,list,watch --resource=pods -n development
kubectl create clusterrole deployment-reader --verb=get,list --resource=deployments

# RoleBinding/ClusterRoleBinding 생성
kubectl create rolebinding pod-reader-binding --role=pod-reader --user=jane -n development
kubectl create clusterrolebinding admin-binding --clusterrole=cluster-admin --user=admin

# ServiceAccount 생성
kubectl create serviceaccount my-sa -n default

# ServiceAccount에 바인딩
kubectl create rolebinding sa-binding --role=pod-reader --serviceaccount=default:my-sa -n default

# 권한 확인
kubectl auth can-i list pods
kubectl auth can-i create deployments --as jane
kubectl auth can-i --list --as system:serviceaccount:default:my-sa

# 조회
kubectl get roles,rolebindings -n <namespace>
kubectl get clusterroles,clusterrolebindings
kubectl describe role <role-name> -n <namespace>

# API 리소스 확인
kubectl api-resources --namespaced=true
kubectl api-resources --namespaced=false
```

### CKA 빈출 시나리오

```yaml
# 시나리오 1: 특정 namespace에서 Pod 관리 권한
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-manager
  namespace: development
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list", "create", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: dev-pod-manager
  namespace: development
subjects:
- kind: User
  name: developer
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: pod-manager
  apiGroup: rbac.authorization.k8s.io

# 시나리오 2: ServiceAccount에 ClusterRole 바인딩
apiVersion: v1
kind: ServiceAccount
metadata:
  name: dashboard-sa
  namespace: monitoring
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: dashboard-view
subjects:
- kind: ServiceAccount
  name: dashboard-sa
  namespace: monitoring
roleRef:
  kind: ClusterRole
  name: view
  apiGroup: rbac.authorization.k8s.io

# 시나리오 3: 명령형으로 빠르게 생성
# kubectl create role deployment-reader --verb=get,list --resource=deployments -n prod
# kubectl create rolebinding deployer --role=deployment-reader --user=jane -n prod
```

## 다음 단계

- [Kubernetes 가이드 - Pod Security](/kubernetes/kubernetes-18-pod-security)
- [Kubernetes 가이드 - Admission Controller](/kubernetes/kubernetes-19-admission-controller)
