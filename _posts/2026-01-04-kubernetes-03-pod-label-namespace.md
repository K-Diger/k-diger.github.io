---
title: "Part 3: Pod, Label, Namespace - Kubernetes 주요 개념"
date: 2026-01-04
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, Pod, Label, Namespace]
layout: post
toc: true
math: true
mermaid: true
---

# Part 3: Kubernetes 주요 개념

## 7. Pod

### 7.1 Pod 개념 (최소 배포 단위)

**정의:**

Pod는 **Kubernetes에서 배포할 수 있는 최소 단위**이다. Kubernetes는 컨테이너를 직접 실행하지 않고, 항상 Pod 안에 컨테이너를 감싸서 실행한다.

**특징:**

- 1개 이상의 컨테이너 포함 (일반적으로 1개)
- 컨테이너 간 네트워크 네임스페이스 공유 (같은 IP 주소 사용)
- 스토리지 볼륨 공유 가능
- 같은 Pod 내 컨테이너는 localhost로 통신
- Pod은 일시적(Ephemeral)이며, 재시작 시 새로운 IP 주소를 받음

**왜 컨테이너가 아닌 Pod인가?**

- 여러 컨테이너가 긴밀하게 연결되어 함께 동작해야 할 때 유용
- 네트워크와 스토리지를 공유하면서 독립적인 프로세스 공간 유지
- 스케일링과 배포의 단위를 명확히 함

**간단한 Pod 예:**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx-pod
spec:
  containers:
    - name: nginx
      image: nginx:1.21
      ports:
        - containerPort: 80
```

### 7.2 Pod 생명주기

**상태 (Phase):**

- **Pending**: Pod이 스케줄되어 생성을 기다리는 중
- **Running**: 모든 컨테이너가 실행 중
- **Succeeded**: 모든 컨테이너가 정상 종료 (Job)
- **Failed**: 하나 이상의 컨테이너가 비정상 종료
- **Unknown**: Pod 상태를 알 수 없음

```bash
# Pod 상태 확인
kubectl get pods
kubectl describe pod <pod-name>
```

### 7.3 Multi-container Pod

하나의 Pod에 여러 컨테이너를 배치하는 패턴들이 있다. 이들은 모두 같은 네트워크와 스토리지를 공유하며 긴밀하게 협력한다.

**Sidecar 패턴:**

메인 애플리케이션을 보조하는 컨테이너를 함께 실행하는 패턴이다. 로깅, 모니터링, 프록시 등의 역할을 수행한다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-with-sidecar
spec:
  containers:
    - name: main-app
      image: myapp:latest
      volumeMounts:
        - name: logs
          mountPath: /var/log
    - name: log-shipper
      image: fluentd:latest
      volumeMounts:
        - name: logs
          mountPath: /var/log
  volumes:
    - name: logs
      emptyDir: { }
```

로그 수집, 모니터링, 보안 에이전트 등을 메인 애플리케이션과 함께 실행한다.

**Ambassador 패턴:**

외부 서비스와의 통신을 대행하는 프록시 컨테이너를 두는 패턴이다. 메인 애플리케이션은 localhost로 통신하고, Ambassador가 실제 외부 서비스와 연결한다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-with-ambassador
spec:
  containers:
    - name: app
      image: myapp:latest
      env:
        - name: DATABASE_URL
          value: "localhost:5432"
    - name: db-proxy
      image: postgres-proxy:latest
      ports:
        - containerPort: 5432
```

로컬에서 외부 데이터베이스에 프록시를 통해 연결한다.

**Adapter 패턴:**

메인 애플리케이션의 출력을 표준 형식으로 변환하는 컨테이너를 두는 패턴이다. 다양한 애플리케이션의 로그나 메트릭을 통일된 형식으로 변환할 때 유용하다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-with-adapter
spec:
  containers:
    - name: app
      image: myapp:latest
    - name: adapter
      image: monitoring-adapter:latest
      ports:
        - containerPort: 8080
```

애플리케이션 메트릭을 표준 형식으로 변환한다.

### 7.4 Init Container

**역할:**

Init Container는 **메인 컨테이너 실행 전에 초기화 작업을 수행**한다. 데이터베이스 마이그레이션, 설정 파일 다운로드, 의존성 체크 등의 작업에 사용된다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: init-container-example
spec:
  initContainers:
    - name: init-mydb
      image: busybox
      command: [ 'sh', '-c', 'until nslookup mydb; do echo waiting for mydb; sleep 2; done;' ]
    - name: init-myservice
      image: busybox
      command: [ 'sh', '-c', 'until nslookup myservice; do echo waiting for myservice; sleep 2; done;' ]
  containers:
    - name: myapp
      image: myapp:v1
```

**특징:**

- 순차 실행 (하나가 완료되어야 다음 시작)
- 모두 완료되어야 메인 컨테이너 시작
- 실패하면 Pod 재시작

### 7.5 Probe (Health Check)

Probe는 컨테이너의 상태를 주기적으로 체크하여 자동 복구를 수행하는 메커니즘이다. 세 가지 종류가 있다.

**Liveness Probe:**

컨테이너가 살아있는지 확인한다. 실패하면 kubelet이 컨테이너를 재시작한다.

```yaml
containers:
  - name: myapp
    image: myapp:v1
    livenessProbe:
      httpGet:
        path: /healthz
        port: 8080
      initialDelaySeconds: 15
      periodSeconds: 20
```

**Readiness Probe:**

Pod이 트래픽을 받을 준비가 되었는지 확인한다. 실패하면 Service의 Endpoint에서 제거되어 트래픽을 받지 않는다.

```yaml
containers:
  - name: myapp
    image: myapp:v1
    readinessProbe:
      exec:
        command:
          - /bin/sh
          - -c
          - nc -z localhost 3306
      initialDelaySeconds: 5
      periodSeconds: 10
```

**Startup Probe:**

느린 시작 애플리케이션을 위한 Probe이다. 이것이 성공하기 전까지 Liveness/Readiness Probe는 무시된다. 시작 시간이 긴 레거시 애플리케이션에 유용하다.

```yaml
startupProbe:
  httpGet:
    path: /startup
    port: 8080
  failureThreshold: 30
  periodSeconds: 10
```

**Probe 방법:**

- **httpGet**: HTTP GET 요청으로 체크
- **exec**: 컨테이너 내부에서 명령 실행
- **tcpSocket**: TCP 소켓 연결 시도

### 7.6 리소스 요청 및 제한

리소스 요청과 제한을 통해 Pod의 CPU와 메모리 사용을 제어한다.

**Requests vs Limits:**

```yaml
containers:
  - name: app
    image: myapp:v1
    resources:
      requests:
        cpu: 250m          # 최소 필요량
        memory: 256Mi
      limits:
        cpu: 500m          # 최대 사용량
        memory: 512Mi
```

- **requests**: Pod 스케줄링 시 최소 필요한 리소스. Scheduler는 이 값을 기준으로 적절한 노드를 선택한다.
- **limits**: Pod이 사용할 수 있는 최대 리소스. CPU는 Throttle되고, 메모리는 초과 시 OOMKilled된다.

**CPU 단위:**
- `1` = 1 vCPU/Core
- `500m` = 0.5 vCPU (m은 milli)

**메모리 단위:**
- `128Mi` = 128 메비바이트 (1024 기반)
- `128M` = 128 메가바이트 (1000 기반)

**QoS Classes:**

리소스 설정에 따라 Pod은 자동으로 QoS 클래스가 부여된다. 노드의 리소스가 부족할 때 제거 우선순위를 결정한다.

- **Guaranteed**: 모든 컨테이너에 requests == limits 설정 (최고 우선순위, 가장 나중에 제거)
- **Burstable**: 최소한 하나의 컨테이너에 requests 또는 limits 설정 (중간 우선순위)
- **BestEffort**: 모든 컨테이너에 requests/limits 없음 (최저 우선순위, 가장 먼저 제거)

메모리 부족 시 BestEffort → Burstable → Guaranteed 순으로 제거된다.

---

## 8. Label과 Selector

### 8.1 Label 개념

**정의:**

Label은 **키-값 쌍으로 리소스를 분류하고 선택**하기 위한 메타데이터이다. Kubernetes의 주요 조직화 메커니즘으로, 리소스를 느슨하게 결합(loosely coupled)시킨다.

**Label의 역할:**

- Pod, Service, Deployment 등 모든 Kubernetes 리소스에 적용 가능
- ReplicaSet이 관리할 Pod 선택
- Service가 트래픽을 보낼 Pod 선택
- Deployment가 롤아웃할 대상 선택
- 리소스 쿼리 및 필터링

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: myapp-pod
  labels:
    app: myapp           # 애플리케이션 이름
    version: v1          # 버전
    environment: prod    # 환경
    tier: backend        # 계층
spec:
  containers:
    - name: myapp
      image: myapp:v1
```

### 8.2 Selector

Selector는 Label을 기반으로 리소스를 선택하는 메커니즘이다. 두 가지 방식이 있다.

**Equality-based (등식 기반):**

키와 값이 정확히 일치하는지 확인한다.

```bash
# 하나의 라벨 선택
kubectl get pods -l app=myapp

# 여러 라벨 (AND)
kubectl get pods -l app=myapp,version=v1

# 라벨 제외
kubectl get pods -l app!=myapp
```

**Set-based (집합 기반):**

집합 연산을 사용하여 더 복잡한 선택이 가능하다.

```bash
# 여러 값 중 하나
kubectl get pods -l "version in (v1, v2)"

# 여러 값 제외
kubectl get pods -l "version notin (v3, v4)"

# 라벨 존재 여부
kubectl get pods -l "tier"          # tier 라벨 있는 것만
kubectl get pods -l "!tier"         # tier 라벨 없는 것만
```

### 8.3 Annotation

**정의:**

Annotation은 **비식별 메타데이터**로 관리/모니터링 정보를 저장한다. Label과 달리 선택에 사용되지 않으며, 더 많은 정보를 저장할 수 있다.

```yaml
metadata:
  annotations:
    description: "이것은 설명입니다"
    owner: "team-a@example.com"
    build.date: "2024-12-28"
    prometheus.io/scrape: "true"
    prometheus.io/port: "8080"
```

**Label vs Annotation:**

- **Label**: 리소스를 식별하고 선택하는데 사용. 간단한 키-값 쌍. Selector로 쿼리 가능.
- **Annotation**: 추가 정보 저장. 더 많은 데이터 저장 가능. 도구, 라이브러리가 읽는 메타데이터.

**사용 예:**
- Label: 환경(dev/prod), 버전, 계층(frontend/backend)
- Annotation: 빌드 정보, 설명, 타임스탬프, 외부 도구 설정

---

## 9. Namespace

### 9.1 Namespace 개념

**정의:**

Namespace는 **논리적 클러스터 분할**로 멀티테넌시를 구현한다.

**용도:**

- 팀/프로젝트별 리소스 격리
- 개발/스테이징/프로덕션 환경 분리
- RBAC와 함께 접근 제어

```bash
# Namespace 생성
kubectl create namespace production

# Namespace 확인
kubectl get namespaces

# 기본 Namespace 변경
kubectl config set-context --current --namespace=production
```

### 9.2 기본 Namespace

- **default**: 기본 Namespace
- **kube-system**: 시스템 컴포넌트 (etcd, API Server 등)
- **kube-public**: 모든 사용자가 접근 가능
- **kube-node-lease**: 노드 하트비트 정보

### 9.3 ResourceQuota

**역할:**

Namespace 전체 리소스 제한.

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: prod-quota
  namespace: production
spec:
  hard:
    requests.cpu: "10"
    requests.memory: "20Gi"
    limits.cpu: "20"
    limits.memory: "40Gi"
    pods: "100"
    services.nodeports: "5"
```

### 9.4 LimitRange

**역할:**

Pod/컨테이너별 리소스 제한.

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: prod-limits
  namespace: production
spec:
  limits:
    - max:
        cpu: "2"
        memory: "2Gi"
      min:
        cpu: "100m"
        memory: "128Mi"
      default:
        cpu: "500m"
        memory: "512Mi"
      type: Container
```

---

## 학습 정리

### 주요 개념

1. **Pod**는 Kubernetes의 최소 배포 단위로, 하나 이상의 컨테이너를 포함
2. **Label**과 **Selector**로 리소스를 선택하고 그룹화
3. **Namespace**로 클러스터 내 리소스를 논리적으로 격리
4. **Init Container**로 초기화 작업 수행
5. **Probe**로 컨테이너 상태 체크 및 자동 복구

### 다음 단계

- Pod 개념 및 생명주기 이해
- Multi-container 패턴 학습
- Label과 Namespace 이해
- Workload 리소스 학습 → **[Part 4로 이동](https://k-diger.github.io/posts//posts/kubernetes-05-deployment-statefulset)**

---

## 실습 과제

1. **Pod 생성 및 관리**
   ```bash
   # nginx Pod 생성
   kubectl run nginx --image=nginx:1.21

   # Pod 상태 확인
   kubectl get pods
   kubectl describe pod nginx

   # Pod 로그 확인
   kubectl logs nginx

   # Pod 삭제
   kubectl delete pod nginx
   ```

2. **Label을 이용한 Pod 선택**
   ```bash
   # Label 추가
   kubectl run app1 --image=nginx --labels="app=frontend,version=v1"
   kubectl run app2 --image=nginx --labels="app=backend,version=v1"

   # Label로 선택
   kubectl get pods -l app=frontend
   kubectl get pods -l version=v1
   ```

3. **Namespace 실습**
   ```bash
   # Namespace 생성
   kubectl create namespace dev
   kubectl create namespace prod

   # Namespace에 Pod 생성
   kubectl run nginx --image=nginx -n dev

   # Namespace별 Pod 확인
   kubectl get pods -n dev
   kubectl get pods --all-namespaces
   ```

---

## 추가 학습 자료

- [Pod 공식 문서](https://kubernetes.io/docs/concepts/workloads/pods/)
- [Label과 Selector](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/)
- [Namespace](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/)

---
