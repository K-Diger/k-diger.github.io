---
layout: post
title: "Kubernetes 가이드 - CRD와 Operator 패턴"
date: 2026-01-26
categories: [Kubernetes]
tags: [kubernetes, crd, operator, custom-resource, cka]
---

Kubernetes는 **Custom Resource Definition(CRD)**를 통해 API를 확장할 수 있다. **Operator 패턴**은 CRD와 컨트롤러를 결합하여 복잡한 애플리케이션을 자동으로 관리한다.

## Custom Resource Definition (CRD)

### 개념

CRD를 사용하면 Kubernetes API에 **새로운 리소스 타입**을 추가할 수 있다.

```
기본 리소스: Pod, Deployment, Service, ...
     +
CRD로 추가: Database, Certificate, VirtualService, ...
```

**사용 사례**:
- 데이터베이스 클러스터 (PostgresCluster, MySQLCluster)
- 인증서 관리 (Certificate)
- 네트워크 정책 (VirtualService, DestinationRule)
- 백업 정책 (Backup, Schedule)

### CRD 정의

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: databases.example.com  # plural.group
spec:
  group: example.com
  versions:
  - name: v1
    served: true      # API에서 제공
    storage: true     # etcd에 저장되는 버전
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            required:
            - engine
            - size
            properties:
              engine:
                type: string
                enum: ["mysql", "postgres"]
              size:
                type: string
                enum: ["small", "medium", "large"]
              replicas:
                type: integer
                minimum: 1
                maximum: 10
                default: 1
          status:
            type: object
            properties:
              state:
                type: string
              message:
                type: string
    subresources:
      status: {}      # /status 서브리소스 활성화
    additionalPrinterColumns:
    - name: Engine
      type: string
      jsonPath: .spec.engine
    - name: Size
      type: string
      jsonPath: .spec.size
    - name: State
      type: string
      jsonPath: .status.state
    - name: Age
      type: date
      jsonPath: .metadata.creationTimestamp
  scope: Namespaced   # 또는 Cluster
  names:
    plural: databases
    singular: database
    kind: Database
    shortNames:
    - db
```

### CRD 적용 및 확인

```bash
# CRD 적용
kubectl apply -f database-crd.yaml

# CRD 목록
kubectl get crd
kubectl describe crd databases.example.com

# API 리소스에 추가됨 확인
kubectl api-resources | grep database
```

### Custom Resource (CR) 생성

```yaml
apiVersion: example.com/v1
kind: Database
metadata:
  name: my-database
  namespace: default
spec:
  engine: postgres
  size: medium
  replicas: 3
```

```bash
# CR 생성
kubectl apply -f my-database.yaml

# CR 조회
kubectl get databases
kubectl get db  # shortName 사용
kubectl describe database my-database

# CR 삭제
kubectl delete database my-database
```

### CRD 스키마 검증

```yaml
# 스키마 위반 시 거부됨
spec:
  engine: mongodb      # enum에 없음 → 에러
  replicas: 100        # maximum 초과 → 에러
```

### 버전 관리

```yaml
versions:
- name: v1
  served: true
  storage: false  # 이전 버전
  schema: ...
- name: v2
  served: true
  storage: true   # 현재 저장 버전
  schema: ...
```

## Operator 패턴

### 개념

Operator는 **CRD + Controller**의 조합으로, 애플리케이션의 운영 지식을 코드화한다.

```
┌────────────────────────────────────────────────────────────┐
│                      Operator Pattern                       │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  Custom Resource ──────→ Controller ──────→ Managed        │
│  (원하는 상태)           (조정 로직)         Resources       │
│                                                             │
│  예: Database CR    →  DB Operator   →  Pod, Service,      │
│      replicas: 3                        StatefulSet,       │
│      engine: postgres                   ConfigMap...       │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

**Operator가 하는 일**:
1. Custom Resource 변경 감시
2. 현재 상태와 원하는 상태 비교
3. 차이를 해소하기 위한 작업 수행 (Reconciliation)
4. 상태 업데이트

### Operator 예시: 데이터베이스

```yaml
# 사용자가 원하는 상태 정의
apiVersion: postgres-operator.crunchydata.com/v1beta1
kind: PostgresCluster
metadata:
  name: my-postgres
spec:
  postgresVersion: 15
  instances:
  - name: instance1
    replicas: 3
    dataVolumeClaimSpec:
      accessModes:
      - ReadWriteOnce
      resources:
        requests:
          storage: 10Gi
  backups:
    pgbackrest:
      repos:
      - name: repo1
        schedules:
          full: "0 1 * * 0"
          incremental: "0 1 * * 1-6"
```

**Operator가 자동으로 생성/관리**:
- StatefulSet (Postgres 인스턴스)
- Service (읽기/쓰기 엔드포인트)
- PVC (데이터 저장소)
- ConfigMap (설정)
- Secret (인증 정보)
- CronJob (백업 스케줄)

### 주요 Operator들

| Operator | 용도 |
|----------|------|
| Prometheus Operator | 모니터링 |
| Cert-Manager | 인증서 관리 |
| Strimzi | Kafka 클러스터 |
| Rook | 스토리지 (Ceph) |
| ArgoCD | GitOps |
| Elastic Cloud on K8s | Elasticsearch |
| Redis Operator | Redis 클러스터 |

### Operator 설치 (예: Cert-Manager)

```bash
# Helm으로 설치
helm repo add jetstack https://charts.jetstack.io
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true

# 또는 kubectl apply
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# CRD 확인
kubectl get crd | grep cert-manager
# certificates.cert-manager.io
# clusterissuers.cert-manager.io
# issuers.cert-manager.io
```

### Custom Resource 사용

```yaml
# Cert-Manager Issuer
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
    - http01:
        ingress:
          class: nginx
---
# Certificate 요청
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: example-com
spec:
  secretName: example-com-tls
  issuerRef:
    name: letsencrypt-prod
    kind: Issuer
  commonName: example.com
  dnsNames:
  - example.com
  - www.example.com
```

## Operator SDK

### Operator 개발 도구

```bash
# Operator SDK 설치
brew install operator-sdk

# Go 기반 Operator 생성
operator-sdk init --domain example.com --repo github.com/example/myoperator
operator-sdk create api --group cache --version v1alpha1 --kind Memcached --resource --controller

# Helm 기반 Operator
operator-sdk init --plugins helm --domain example.com
operator-sdk create api --group cache --version v1alpha1 --kind Memcached --helm-chart ./helm-charts/memcached
```

### Reconciliation Loop

```go
// 간단한 Reconcile 함수 예시 (Go)
func (r *DatabaseReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    // 1. Custom Resource 가져오기
    var database myv1.Database
    if err := r.Get(ctx, req.NamespacedName, &database); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    // 2. 원하는 상태 정의
    desiredDeployment := r.deploymentForDatabase(&database)

    // 3. 현재 상태 확인
    var currentDeployment appsv1.Deployment
    err := r.Get(ctx, types.NamespacedName{...}, &currentDeployment)

    // 4. 상태 조정 (Reconcile)
    if errors.IsNotFound(err) {
        // 생성
        r.Create(ctx, desiredDeployment)
    } else {
        // 업데이트
        r.Update(ctx, desiredDeployment)
    }

    // 5. 상태 업데이트
    database.Status.State = "Running"
    r.Status().Update(ctx, &database)

    return ctrl.Result{}, nil
}
```

## Aggregated API Server

CRD의 대안으로, **자체 API Server**를 추가할 수 있다.

```
┌─────────────────────────────────────────────────────────────┐
│                    kube-apiserver                            │
├─────────────────────────────────────────────────────────────┤
│  /api/v1             → core API                             │
│  /apis/apps/v1       → apps API                             │
│  /apis/custom.io/v1  → Aggregated API Server (Extension)    │
└─────────────────────────────────────────────────────────────┘
```

**CRD vs Aggregated API**:

| 특성 | CRD | Aggregated API |
|------|-----|----------------|
| 구현 복잡도 | 낮음 | 높음 |
| 배포 | CRD만 적용 | 별도 서버 필요 |
| 검증 | OpenAPI 스키마 | 코드로 구현 |
| 서브리소스 | 제한적 | 자유롭게 정의 |
| 사용 사례 | 대부분 | 특수 요구사항 |

**Aggregated API가 필요한 경우**:
- metrics.k8s.io (Metrics Server)
- custom.metrics.k8s.io (Prometheus Adapter)

## 트러블슈팅

### CRD 관련 문제

```bash
# CRD가 없을 때 CR 생성 시도
# error: the server doesn't have a resource type "databases"

# CRD 상태 확인
kubectl get crd databases.example.com -o yaml

# CR 검증 에러
kubectl apply -f my-database.yaml
# The Database "my-database" is invalid: spec.engine: Unsupported value
```

### Operator 문제

```bash
# Operator Pod 로그
kubectl logs -n operator-namespace deployment/my-operator

# Operator가 CR을 처리하지 않을 때
# - RBAC 권한 확인
kubectl get clusterrolebinding | grep my-operator
# - ServiceAccount 확인
kubectl get sa -n operator-namespace
```

## 기술 면접 대비

### 자주 묻는 질문

**Q: CRD란 무엇이고 왜 사용하는가?**

A: CRD(Custom Resource Definition)는 Kubernetes API를 확장하여 새로운 리소스 타입을 추가하는 방법이다. 이를 통해 도메인 특화 리소스(예: Database, Certificate)를 정의하고 kubectl로 관리할 수 있다. Operator 패턴의 기반이 되며, 선언적 API의 장점을 커스텀 애플리케이션에도 적용할 수 있다.

**Q: Operator 패턴의 장점은?**

A: 운영 지식(업그레이드, 백업, 복구, 스케일링 등)을 코드로 자동화한다. 사용자는 원하는 상태만 선언하면 Operator가 복잡한 운영 작업을 자동으로 처리한다. 일관된 운영 품질을 보장하고, 인적 오류를 줄인다.

**Q: CRD와 ConfigMap의 차이는?**

A: ConfigMap은 설정 데이터 저장용이고, CRD는 새로운 API 리소스 타입을 정의한다. CRD로 만든 리소스는 kubectl로 CRUD 가능하고, 스키마 검증이 적용되며, Controller와 연동하여 다른 리소스를 생성/관리할 수 있다. ConfigMap은 단순 데이터 저장소이다.

**Q: Controller와 Operator의 차이는?**

A: Controller는 Kubernetes의 핵심 패턴으로 리소스 상태를 조정한다. Operator는 Controller 패턴을 확장하여 특정 애플리케이션의 전체 생명주기(설치, 업그레이드, 백업, 복구)를 관리한다. 모든 Operator는 Controller이지만, 모든 Controller가 Operator는 아니다.

## CKA 시험 대비

CKA에서 CRD/Operator는 심화 주제지만, 기본 개념과 명령어는 알아야 한다.

```bash
# CRD 목록
kubectl get crd

# CRD 상세
kubectl describe crd <crd-name>

# Custom Resource 조회
kubectl get <resource-name>
kubectl describe <resource-name> <name>

# Custom Resource 삭제
kubectl delete <resource-name> <name>
```

## 다음 단계

- [Kubernetes 가이드 - CKA 시험 대비](/kubernetes/kubernetes-25-cka-prep)
- [Kubernetes 가이드 - 보안 심화 (TLS/PKI)](/kubernetes/kubernetes-26-security-deep-dive)
