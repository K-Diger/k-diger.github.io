---
title: "Part 20: CRD와 Operator - 확장성"
date: 2026-01-21
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, CRD, Operator, Extensibility]
layout: post
toc: true
math: true
mermaid: true
---

> **Phase 7: 심화** (20/20)

---

# Part 20: 확장성

## Kubernetes 확장성 개요

Kubernetes는 확장 가능한 아키텍처로 설계되어 사용자가 자신의 요구사항에 맞게 기능을 추가할 수 있다.

### 확장 방법

**1. Custom Resource Definitions (CRD)**
- 새로운 리소스 타입 정의
- Kubernetes API 확장
- Declarative API 활용

**2. Custom Controllers**
- CRD의 동작 구현
- Reconciliation Loop
- 원하는 상태 유지

**3. Operators**
- CRD + Custom Controller
- 애플리케이션별 운영 지식 자동화
- 복잡한 stateful 애플리케이션 관리

**4. Admission Webhooks**
- 리소스 생성/수정 시 커스텀 검증
- 자동 변경 적용

**5. Aggregated API Server**
- 완전히 새로운 API 추가
- 고급 확장

---

## Custom Resource Definition (CRD)

### CRD란?

**정의:**

CRD는 Kubernetes API를 확장하여 **사용자 정의 리소스 타입을 생성**할 수 있게 하는 메커니즘이다. Pod, Service, Deployment처럼 kubectl로 관리할 수 있는 자신만의 리소스를 만들 수 있다.

**왜 CRD를 사용하는가?**

- 애플리케이션별 도메인 모델 정의
- Kubernetes API의 선언적 특성 활용
- Kubernetes 생태계 도구 (kubectl, RBAC 등) 재사용
- 버전 관리 및 스키마 검증

**CRD vs ConfigMap:**

- ConfigMap: 설정 데이터 저장
- CRD: 애플리케이션 자체를 표현하는 API 리소스

### CRD 생성

**기본 CRD 예제:**

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: databases.example.com  # <plural>.<group>
spec:
  group: example.com
  versions:
    - name: v1
      served: true  # API 서버가 이 버전 제공
      storage: true  # etcd에 저장되는 버전
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                engine:
                  type: string
                  enum:
                    - postgresql
                    - mysql
                    - mongodb
                version:
                  type: string
                  pattern: '^[0-9]+\.[0-9]+$'
                replicas:
                  type: integer
                  minimum: 1
                  maximum: 10
                storage:
                  type: string
                  pattern: '^[0-9]+Gi$'
              required:
                - engine
                - version
            status:
              type: object
              properties:
                ready:
                  type: boolean
                phase:
                  type: string
                conditions:
                  type: array
                  items:
                    type: object
                    properties:
                      type:
                        type: string
                      status:
                        type: string
                      lastTransitionTime:
                        type: string
                        format: date-time
      additionalPrinterColumns:  # kubectl get 출력 커스터마이징
        - name: Engine
          type: string
          jsonPath: .spec.engine
        - name: Version
          type: string
          jsonPath: .spec.version
        - name: Replicas
          type: integer
          jsonPath: .spec.replicas
        - name: Ready
          type: boolean
          jsonPath: .status.ready
        - name: Age
          type: date
          jsonPath: .metadata.creationTimestamp
  scope: Namespaced  # Namespaced 또는 Cluster
  names:
    plural: databases
    singular: database
    kind: Database
    shortNames:
      - db
    listKind: DatabaseList  # 리스트 조회 시 사용
    categories:
      - all  # kubectl get all에 포함
```

**CRD 적용:**

```bash
# CRD 생성
kubectl apply -f database-crd.yaml

# CRD 확인
kubectl get crd
kubectl get crd databases.example.com -o yaml

# API 리소스 확인
kubectl api-resources | grep database
# NAME        SHORTNAMES   APIVERSION            NAMESPACED   KIND
# databases   db           example.com/v1        true         Database
```

### Custom Resource 생성

**CRD가 생성되면 이제 Custom Resource를 만들 수 있다:**

```yaml
apiVersion: example.com/v1
kind: Database
metadata:
  name: my-postgres
  namespace: production
spec:
  engine: postgresql
  version: "14.5"
  replicas: 3
  storage: "100Gi"
```

**CR 관리:**

```bash
# CR 생성
kubectl apply -f my-database.yaml

# CR 조회
kubectl get databases
kubectl get db  # shortName 사용
kubectl get db -A  # 모든 네임스페이스

# 출력 예시 (additionalPrinterColumns 덕분):
# NAME          ENGINE       VERSION   REPLICAS   READY   AGE
# my-postgres   postgresql   14.5      3          true    5m

# CR 상세 정보
kubectl describe database my-postgres

# CR YAML 확인
kubectl get database my-postgres -o yaml

# CR 수정
kubectl edit database my-postgres

# CR 삭제
kubectl delete database my-postgres
```

### CRD 버전 관리

**여러 버전 지원:**

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: databases.example.com
spec:
  group: example.com
  versions:
    - name: v1beta1
      served: true
      storage: false  # 더 이상 저장하지 않음
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                dbType:  # 이전 필드 이름
                  type: string
    - name: v1
      served: true
      storage: true  # 현재 저장 버전
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                engine:  # 새로운 필드 이름
                  type: string
  conversion:  # 버전 간 변환
    strategy: Webhook
    webhook:
      clientConfig:
        service:
          name: database-conversion-webhook
          namespace: default
          path: /convert
      conversionReviewVersions:
        - v1
        - v1beta1
```

### Subresources

**Status Subresource:**

Status subresource를 사용하면 spec과 status를 독립적으로 업데이트할 수 있다.

```yaml
spec:
  versions:
    - name: v1
      served: true
      storage: true
      subresources:
        status: {}  # /status 엔드포인트 활성화
      schema:
        # ...
```

이제 status 업데이트 시 spec는 변경되지 않는다:

```bash
# spec 업데이트
kubectl edit database my-postgres

# status 업데이트 (Controller가 수행)
kubectl patch database my-postgres --subresource=status --type=merge -p '{"status":{"ready":true}}'
```

**Scale Subresource:**

```yaml
spec:
  versions:
    - name: v1
      subresources:
        scale:
          specReplicasPath: .spec.replicas
          statusReplicasPath: .status.replicas
          labelSelectorPath: .status.labelSelector
```

```bash
# kubectl scale 사용 가능
kubectl scale database my-postgres --replicas=5
```

### Validation과 Defaulting

**OpenAPI Schema Validation:**

```yaml
schema:
  openAPIV3Schema:
    type: object
    properties:
      spec:
        type: object
        properties:
          replicas:
            type: integer
            minimum: 1
            maximum: 10
            default: 3  # 기본값
          engine:
            type: string
            enum:
              - postgresql
              - mysql
            default: "postgresql"
          config:
            type: object
            additionalProperties:  # 임의의 키-값 허용
              type: string
        required:
          - engine
```

**Webhook Validation:**

더 복잡한 검증은 Validating Admission Webhook을 사용한다.

---

## Custom Controllers

### Controller란?

**정의:**

Custom Controller는 Custom Resource를 감시하고, **원하는 상태(spec)를 실제 상태로 만들기 위해 조정(reconciliation)을 수행**하는 컴포넌트이다.

**Control Loop (Reconciliation Loop):**

```
1. Watch: CR 변경 감지 (Informer)
   ↓
2. Get: 현재 상태 조회
   ↓
3. Diff: 원하는 상태와 비교
   ↓
4. Act: 차이를 해소하는 액션 수행
   ↓
5. Update Status: CR status 업데이트
   ↓
(반복)
```

### Controller 구현 (Kubebuilder)

**Kubebuilder 설치:**

```bash
# Kubebuilder 설치
curl -L -o kubebuilder https://go.kubebuilder.io/dl/latest/$(go env GOOS)/$(go env GOARCH)
chmod +x kubebuilder && mv kubebuilder /usr/local/bin/
```

**프로젝트 생성:**

```bash
# 프로젝트 초기화
mkdir database-operator && cd database-operator
kubebuilder init --domain example.com --repo github.com/example/database-operator

# API 및 Controller 생성
kubebuilder create api --group apps --version v1 --kind Database

# Would you like to create a Resource [y/n]: y
# Would you like to create a Controller [y/n]: y
```

**API 타입 정의 (api/v1/database_types.go):**

```go
package v1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// DatabaseSpec는 Database의 원하는 상태를 정의한다
type DatabaseSpec struct {
	Engine   string `json:"engine"`
	Version  string `json:"version"`
	Replicas int32  `json:"replicas"`
	Storage  string `json:"storage"`
}

// DatabaseStatus는 Database의 관찰된 상태를 정의한다
type DatabaseStatus struct {
	Ready      bool                `json:"ready"`
	Phase      string              `json:"phase"`
	Conditions []metav1.Condition  `json:"conditions,omitempty"`
}

//+kubebuilder:object:root=true
//+kubebuilder:subresource:status
//+kubebuilder:printcolumn:name="Engine",type=string,JSONPath=`.spec.engine`
//+kubebuilder:printcolumn:name="Replicas",type=integer,JSONPath=`.spec.replicas`
//+kubebuilder:printcolumn:name="Ready",type=boolean,JSONPath=`.status.ready`

// Database는 데이터베이스 클러스터의 Schema이다
type Database struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   DatabaseSpec   `json:"spec,omitempty"`
	Status DatabaseStatus `json:"status,omitempty"`
}

//+kubebuilder:object:root=true

// DatabaseList는 Database의 리스트를 포함한다
type DatabaseList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []Database `json:"items"`
}

func init() {
	SchemeBuilder.Register(&Database{}, &DatabaseList{})
}
```

**Controller 구현 (controllers/database_controller.go):**

```go
package controllers

import (
	"context"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/log"

	appsv1alpha1 "github.com/example/database-operator/api/v1"
)

// DatabaseReconciler는 Database 리소스를 조정한다
type DatabaseReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

//+kubebuilder:rbac:groups=apps.example.com,resources=databases,verbs=get;list;watch;create;update;patch;delete
//+kubebuilder:rbac:groups=apps.example.com,resources=databases/status,verbs=get;update;patch
//+kubebuilder:rbac:groups=apps.example.com,resources=databases/finalizers,verbs=update
//+kubebuilder:rbac:groups=apps,resources=statefulsets,verbs=get;list;watch;create;update;patch;delete
//+kubebuilder:rbac:groups=core,resources=services,verbs=get;list;watch;create;update;patch;delete

// Reconcile은 Database 리소스를 조정하는 메인 로직이다
func (r *DatabaseReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := log.FromContext(ctx)

	// 1. Database CR 조회
	var database appsv1alpha1.Database
	if err := r.Get(ctx, req.NamespacedName, &database); err != nil {
		if errors.IsNotFound(err) {
			// CR이 삭제됨 - 정상
			return ctrl.Result{}, nil
		}
		log.Error(err, "unable to fetch Database")
		return ctrl.Result{}, err
	}

	// 2. StatefulSet 생성 또는 업데이트
	statefulSet := r.constructStatefulSet(&database)
	if err := ctrl.SetControllerReference(&database, statefulSet, r.Scheme); err != nil {
		return ctrl.Result{}, err
	}

	foundStatefulSet := &appsv1.StatefulSet{}
	err := r.Get(ctx, client.ObjectKey{Name: statefulSet.Name, Namespace: statefulSet.Namespace}, foundStatefulSet)
	if err != nil && errors.IsNotFound(err) {
		log.Info("Creating a new StatefulSet", "Namespace", statefulSet.Namespace, "Name", statefulSet.Name)
		err = r.Create(ctx, statefulSet)
		if err != nil {
			return ctrl.Result{}, err
		}
	} else if err != nil {
		return ctrl.Result{}, err
	} else {
		// StatefulSet이 존재하면 업데이트
		log.Info("Updating StatefulSet", "Namespace", foundStatefulSet.Namespace, "Name", foundStatefulSet.Name)
		foundStatefulSet.Spec = statefulSet.Spec
		err = r.Update(ctx, foundStatefulSet)
		if err != nil {
			return ctrl.Result{}, err
		}
	}

	// 3. Service 생성 (Headless Service)
	service := r.constructService(&database)
	if err := ctrl.SetControllerReference(&database, service, r.Scheme); err != nil {
		return ctrl.Result{}, err
	}

	foundService := &corev1.Service{}
	err = r.Get(ctx, client.ObjectKey{Name: service.Name, Namespace: service.Namespace}, foundService)
	if err != nil && errors.IsNotFound(err) {
		log.Info("Creating a new Service", "Namespace", service.Namespace, "Name", service.Name)
		err = r.Create(ctx, service)
		if err != nil {
			return ctrl.Result{}, err
		}
	}

	// 4. Status 업데이트
	database.Status.Ready = foundStatefulSet.Status.ReadyReplicas == database.Spec.Replicas
	if database.Status.Ready {
		database.Status.Phase = "Running"
	} else {
		database.Status.Phase = "Pending"
	}

	if err := r.Status().Update(ctx, &database); err != nil {
		log.Error(err, "unable to update Database status")
		return ctrl.Result{}, err
	}

	return ctrl.Result{}, nil
}

// constructStatefulSet은 Database CR을 기반으로 StatefulSet을 생성한다
func (r *DatabaseReconciler) constructStatefulSet(db *appsv1alpha1.Database) *appsv1.StatefulSet {
	replicas := db.Spec.Replicas

	statefulSet := &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      db.Name,
			Namespace: db.Namespace,
		},
		Spec: appsv1.StatefulSetSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"app":      "database",
					"database": db.Name,
				},
			},
			ServiceName: db.Name + "-headless",
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"app":      "database",
						"database": db.Name,
					},
				},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "database",
							Image: db.Spec.Engine + ":" + db.Spec.Version,
							Ports: []corev1.ContainerPort{
								{
									ContainerPort: 5432,
									Name:          "db",
								},
							},
						},
					},
				},
			},
		},
	}

	return statefulSet
}

// constructService는 Headless Service를 생성한다
func (r *DatabaseReconciler) constructService(db *appsv1alpha1.Database) *corev1.Service {
	service := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      db.Name + "-headless",
			Namespace: db.Namespace,
		},
		Spec: corev1.ServiceSpec{
			ClusterIP: "None",  // Headless
			Selector: map[string]string{
				"app":      "database",
				"database": db.Name,
			},
			Ports: []corev1.ServicePort{
				{
					Port: 5432,
					Name: "db",
				},
			},
		},
	}

	return service
}

// SetupWithManager는 Controller를 Manager에 등록한다
func (r *DatabaseReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&appsv1alpha1.Database{}).
		Owns(&appsv1.StatefulSet{}).
		Owns(&corev1.Service{}).
		Complete(r)
}
```

**빌드 및 배포:**

```bash
# CRD 생성
make install

# Controller를 로컬에서 실행 (테스트)
make run

# 또는 클러스터에 배포
make docker-build docker-push IMG=myregistry/database-operator:v0.1
make deploy IMG=myregistry/database-operator:v0.1
```

**테스트:**

```bash
# Custom Resource 생성
kubectl apply -f config/samples/apps_v1_database.yaml

# 상태 확인
kubectl get database
kubectl get statefulset
kubectl get pods
kubectl describe database my-database
```

---

## Operator 패턴

### Operator란?

**정의:**

Operator는 **CRD + Custom Controller + 도메인 지식**을 결합하여 복잡한 애플리케이션을 Kubernetes 네이티브하게 관리하는 패턴이다.

**Operator가 자동화하는 작업:**

- 설치 및 업그레이드
- 백업 및 복원
- 장애 복구
- 스케일링
- 설정 관리
- 모니터링

### Operator의 성숙도 단계

**Capability Levels:**

1. **Basic Install**
   - Automated application provisioning and configuration management
   - 자동 설치 및 설정

2. **Seamless Upgrades**
   - Patch and minor version upgrades supported
   - 무중단 업그레이드

3. **Full Lifecycle**
   - App lifecycle, storage lifecycle (backup, failure recovery)
   - 백업, 복원, 장애 복구

4. **Deep Insights**
   - Metrics, alerts, log processing and workload analysis
   - 메트릭, 알림, 로그 분석

5. **Auto Pilot**
   - Horizontal/vertical scaling, auto config tuning, abnormality detection, scheduling tuning
   - 자동 스케일링, 자동 튜닝

### 대표적인 Operators

**1. Prometheus Operator**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: Prometheus
metadata:
  name: prometheus
spec:
  replicas: 2
  serviceAccountName: prometheus
  serviceMonitorSelector:
    matchLabels:
      team: frontend
  resources:
    requests:
      memory: 400Mi
```

**2. Cert-Manager**

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: example-com
spec:
  secretName: example-com-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - example.com
    - www.example.com
```

**3. Elasticsearch Operator**

```yaml
apiVersion: elasticsearch.k8s.elastic.co/v1
kind: Elasticsearch
metadata:
  name: quickstart
spec:
  version: 8.10.0
  nodeSets:
    - name: default
      count: 3
      config:
        node.store.allow_mmap: false
```

**4. MySQL Operator**

```yaml
apiVersion: mysql.oracle.com/v2
kind: InnoDBCluster
metadata:
  name: mycluster
spec:
  secretName: mypwds
  tlsUseSelfSigned: true
  instances: 3
  router:
    instances: 1
```

### Operator SDK

**Operator SDK 설치:**

```bash
# 최신 버전 설치
export ARCH=$(case $(uname -m) in x86_64) echo -n amd64 ;; aarch64) echo -n arm64 ;; *) echo -n $(uname -m) ;; esac)
export OS=$(uname | awk '{print tolower($0)}')
export OPERATOR_SDK_DL_URL=https://github.com/operator-framework/operator-sdk/releases/download/v1.32.0
curl -LO ${OPERATOR_SDK_DL_URL}/operator-sdk_${OS}_${ARCH}
chmod +x operator-sdk_${OS}_${ARCH} && sudo mv operator-sdk_${OS}_${ARCH} /usr/local/bin/operator-sdk
```

**Operator 생성 (Golang):**

```bash
# 프로젝트 초기화
mkdir memcached-operator && cd memcached-operator
operator-sdk init --domain example.com --repo github.com/example/memcached-operator

# API 생성
operator-sdk create api --group cache --version v1 --kind Memcached --resource --controller
```

**Operator 생성 (Ansible):**

```bash
operator-sdk init --plugins=ansible --domain example.com
operator-sdk create api --group cache --version v1 --kind Memcached --generate-role
```

**Operator 생성 (Helm):**

```bash
operator-sdk init --plugins=helm --domain example.com --group cache --version v1 --kind Memcached
```

---

## 고급 패턴

### Finalizers

**Finalizer를 사용한 리소스 정리:**

CR이 삭제될 때 관련 외부 리소스를 정리해야 할 경우 Finalizer를 사용한다.

```go
const finalizerName = "database.example.com/finalizer"

func (r *DatabaseReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	var database appsv1alpha1.Database
	if err := r.Get(ctx, req.NamespacedName, &database); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	// CR이 삭제 중인지 확인
	if database.ObjectMeta.DeletionTimestamp.IsZero() {
		// 삭제 중이 아님 - Finalizer 추가
		if !containsString(database.ObjectMeta.Finalizers, finalizerName) {
			database.ObjectMeta.Finalizers = append(database.ObjectMeta.Finalizers, finalizerName)
			if err := r.Update(ctx, &database); err != nil {
				return ctrl.Result{}, err
			}
		}
	} else {
		// 삭제 중 - Finalizer 실행
		if containsString(database.ObjectMeta.Finalizers, finalizerName) {
			// 외부 리소스 정리 (예: 클라우드 데이터베이스 삭제)
			if err := r.deleteExternalResources(&database); err != nil {
				return ctrl.Result{}, err
			}

			// Finalizer 제거
			database.ObjectMeta.Finalizers = removeString(database.ObjectMeta.Finalizers, finalizerName)
			if err := r.Update(ctx, &database); err != nil {
				return ctrl.Result{}, err
			}
		}

		return ctrl.Result{}, nil
	}

	// 일반 Reconciliation 로직
	// ...
	return ctrl.Result{}, nil
}

func (r *DatabaseReconciler) deleteExternalResources(db *appsv1alpha1.Database) error {
	// 외부 리소스 삭제 로직 (예: AWS RDS 인스턴스 삭제)
	log.Info("Deleting external resources for database", "name", db.Name)
	// ...
	return nil
}
```

### Owner References

**Owner Reference를 사용한 자동 정리:**

Controller가 생성한 리소스는 CR이 삭제되면 자동으로 삭제되어야 한다. Owner Reference를 설정하면 Kubernetes가 자동으로 처리한다.

```go
// StatefulSet에 Owner Reference 설정
if err := ctrl.SetControllerReference(&database, statefulSet, r.Scheme); err != nil {
	return ctrl.Result{}, err
}

// 이제 database CR이 삭제되면 statefulSet도 자동 삭제됨
```

### Watching 다른 리소스

**Controller가 여러 리소스를 감시:**

```go
func (r *DatabaseReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&appsv1alpha1.Database{}).  // 주 리소스
		Owns(&appsv1.StatefulSet{}).    // 소유한 리소스
		Owns(&corev1.Service{}).
		Watches(
			&source.Kind{Type: &corev1.ConfigMap{}},  // 다른 리소스 감시
			handler.EnqueueRequestsFromMapFunc(r.findDatabasesForConfigMap),
		).
		Complete(r)
}

func (r *DatabaseReconciler) findDatabasesForConfigMap(configMap client.Object) []reconcile.Request {
	// ConfigMap 변경 시 관련 Database를 찾아 Reconcile 트리거
	// ...
}
```

---

## 실전 Operator 구현 사례

### PostgreSQL Operator

**CRD:**

```yaml
apiVersion: postgres.example.com/v1
kind: PostgreSQLCluster
metadata:
  name: prod-db
spec:
  version: "14.5"
  instances: 3
  storage:
    size: 100Gi
    storageClass: fast-ssd
  backup:
    enabled: true
    schedule: "0 2 * * *"
    retention: 7
  resources:
    requests:
      cpu: "2"
      memory: "4Gi"
    limits:
      cpu: "4"
      memory: "8Gi"
  highAvailability:
    enabled: true
    synchronousCommit: true
```

**Operator 기능:**

1. **자동 설치**
   - Primary + Replica StatefulSet 생성
   - Headless Service 생성
   - PVC 생성

2. **고가용성**
   - Patroni 또는 repmgr 통합
   - 자동 Failover
   - Synchronous Replication

3. **백업 및 복원**
   - CronJob으로 정기 백업
   - Point-in-Time Recovery (PITR)
   - S3 또는 PV로 백업 저장

4. **업그레이드**
   - Rolling Update
   - pg_upgrade 실행
   - 데이터 마이그레이션

5. **모니터링**
   - PostgreSQL Exporter Pod 배포
   - ServiceMonitor 생성 (Prometheus 연동)
   - 메트릭 수집

---

## Best Practices

### 1. API 설계

**Spec과 Status 분리:**

```yaml
spec:  # 사용자가 원하는 상태
  replicas: 3
  version: "14"

status:  # Controller가 관찰한 상태
  ready: true
  phase: "Running"
  observedGeneration: 5
```

**Semantic Versioning:**

- v1alpha1: 초기 개발, 호환성 보장 안 함
- v1beta1: 기능 안정화, API 변경 가능
- v1: 프로덕션 준비, API 호환성 보장

**Defaulting 활용:**

```yaml
properties:
  replicas:
    type: integer
    default: 3  # 사용자가 지정하지 않으면 3
```

### 2. Controller 구현

**Idempotency (멱등성):**

Reconcile 함수는 여러 번 호출되어도 같은 결과를 반환해야 한다.

**Error Handling:**

```go
if err != nil {
	log.Error(err, "Failed to create StatefulSet")
	// 에러를 반환하면 자동으로 재시도됨
	return ctrl.Result{}, err
}
```

**Requeue 전략:**

```go
// 즉시 재시도
return ctrl.Result{Requeue: true}, nil

// 10초 후 재시도
return ctrl.Result{RequeueAfter: 10 * time.Second}, nil

// 성공
return ctrl.Result{}, nil
```

**Status Conditions:**

```go
meta.SetStatusCondition(&database.Status.Conditions, metav1.Condition{
	Type:               "Ready",
	Status:             metav1.ConditionTrue,
	Reason:             "AllReplicasReady",
	Message:            "All database replicas are ready",
	LastTransitionTime: metav1.Now(),
})
```

### 3. 테스트

**Unit Test:**

```go
func TestReconcile(t *testing.T) {
	scheme := runtime.NewScheme()
	_ = appsv1alpha1.AddToScheme(scheme)

	database := &appsv1alpha1.Database{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-db",
			Namespace: "default",
		},
		Spec: appsv1alpha1.DatabaseSpec{
			Replicas: 3,
		},
	}

	client := fake.NewClientBuilder().WithScheme(scheme).WithObjects(database).Build()

	reconciler := &DatabaseReconciler{
		Client: client,
		Scheme: scheme,
	}

	req := reconcile.Request{
		NamespacedName: types.NamespacedName{
			Name:      "test-db",
			Namespace: "default",
		},
	}

	_, err := reconciler.Reconcile(context.Background(), req)
	assert.NoError(t, err)
}
```

**Integration Test:**

```bash
# envtest 사용
make test
```

### 4. 보안

**RBAC 최소 권한:**

```yaml
#

+kubebuilder:rbac:groups=apps.example.com,resources=databases,verbs=get;list;watch;create;update;patch;delete
#+kubebuilder:rbac:groups=apps.example.com,resources=databases/status,verbs=get;update;patch
```

**ServiceAccount 분리:**

- Operator용 ServiceAccount
- 애플리케이션용 ServiceAccount

---

## 참고 자료

### 공식 문서

- [Custom Resources](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/)
- [Operator Pattern](https://kubernetes.io/docs/concepts/extend-kubernetes/operator/)
- [Kubebuilder Book](https://book.kubebuilder.io/)
- [Operator SDK](https://sdk.operatorframework.io/)

### Operator Hub

- [OperatorHub.io](https://operatorhub.io/) - 커뮤니티 Operators
- [Awesome Operators](https://github.com/operator-framework/awesome-operators)

---

**이전**: [Part 19: 아키텍처 심화](./2026-01-20-kubernetes-19-internals) ←
**인덱스로 돌아가기**: [Kubernetes 완벽 가이드 인덱스](./2026-01-01-kubernetes-00-index)
