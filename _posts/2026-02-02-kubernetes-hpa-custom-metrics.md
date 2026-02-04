---
layout: post
title: "HPA 심화 - Custom Metrics로 스케일링 (CKA 2025 신규)"
date: 2026-02-02
categories: [Kubernetes]
tags: [kubernetes, hpa, autoscaling, metrics, prometheus, cka]
toc: true
math: true
mermaid: true
---

2025년 CKA 시험 개정으로 **HPA(Horizontal Pod Autoscaler)의 Custom Metrics** 기반 스케일링이 시험 범위에 포함되었다. 이 글에서는 CPU/메모리 기반 스케일링부터 Custom Metrics까지 다룬다.

## HPA 개요

### HPA의 동작 원리

```
┌─────────────────────────────────────────────────────────┐
│                    HPA Controller                        │
│  1. 메트릭 조회 (15초마다)                               │
│  2. 현재값 vs 목표값 비교                                │
│  3. 필요 Replica 수 계산                                 │
│  4. Deployment/ReplicaSet 스케일링                      │
└────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   Metrics Server       Custom Metrics       External Metrics
   (CPU, Memory)        (Prometheus)         (Cloud 서비스)
```

### 스케일링 공식

```
desiredReplicas = ceil[currentReplicas × (currentMetricValue / desiredMetricValue)]
```

**예시:**
- 현재 Replica: 3
- 현재 CPU 사용률: 80%
- 목표 CPU 사용률: 50%

```
desiredReplicas = ceil[3 × (80 / 50)] = ceil[4.8] = 5
```

## 메트릭 유형

### 1. Resource Metrics (기본)

CPU, 메모리 같은 기본 리소스 메트릭이다.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: cpu-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50  # 평균 CPU 사용률 50%
```

**필수 조건:**
- Metrics Server 설치 필요
- Pod에 `resources.requests` 설정 필수 (Utilization 계산 기준)

### 2. Pods Metrics (Custom)

Pod 수준의 커스텀 메트릭이다.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: custom-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Pods
    pods:
      metric:
        name: requests_per_second
      target:
        type: AverageValue
        averageValue: 100  # Pod당 평균 100 RPS
```

### 3. Object Metrics

특정 Kubernetes 오브젝트의 메트릭이다.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: object-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Object
    object:
      metric:
        name: requests_per_second
      describedObject:
        apiVersion: networking.k8s.io/v1
        kind: Ingress
        name: main-ingress
      target:
        type: Value
        value: 1000  # Ingress 총 1000 RPS
```

### 4. External Metrics

클러스터 외부 메트릭 (예: SQS 큐 길이, CloudWatch)이다.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: external-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: queue-processor
  minReplicas: 1
  maxReplicas: 20
  metrics:
  - type: External
    external:
      metric:
        name: sqs_queue_length
        selector:
          matchLabels:
            queue: orders
      target:
        type: AverageValue
        averageValue: 10  # Pod당 10개 메시지
```

## Custom Metrics 설정 (Prometheus)

### 아키텍처

```
┌────────────┐    ┌──────────────────┐    ┌─────────────┐
│ Application│ →  │ Prometheus       │ →  │ Prometheus  │
│ (메트릭 노출)│    │ (메트릭 수집)      │    │ Adapter     │
└────────────┘    └──────────────────┘    └─────────────┘
                                                 │
                                                 ▼
                                          ┌─────────────┐
                                          │ HPA         │
                                          │ Controller  │
                                          └─────────────┘
```

### Step 1: 애플리케이션 메트릭 노출

```python
# Flask 애플리케이션 예시
from flask import Flask
from prometheus_client import Counter, Histogram, generate_latest

app = Flask(__name__)

# 메트릭 정의
REQUEST_COUNT = Counter('http_requests_total', 'Total HTTP Requests', ['method', 'endpoint'])
REQUEST_LATENCY = Histogram('http_request_duration_seconds', 'Request latency')

@app.route('/api/orders')
@REQUEST_LATENCY.time()
def orders():
    REQUEST_COUNT.labels(method='GET', endpoint='/api/orders').inc()
    return {"orders": []}

@app.route('/metrics')
def metrics():
    return generate_latest()
```

### Step 2: Prometheus Adapter 설치

```bash
# Helm으로 Prometheus Adapter 설치
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus-adapter prometheus-community/prometheus-adapter \
  --namespace monitoring \
  --set prometheus.url=http://prometheus-server.monitoring.svc \
  --set prometheus.port=9090
```

### Step 3: Custom Metrics 규칙 설정

```yaml
# prometheus-adapter-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: adapter-config
  namespace: monitoring
data:
  config.yaml: |
    rules:
    - seriesQuery: 'http_requests_total{namespace!="",pod!=""}'
      resources:
        overrides:
          namespace:
            resource: namespace
          pod:
            resource: pod
      name:
        matches: "^(.*)_total$"
        as: "${1}_per_second"
      metricsQuery: 'sum(rate(<<.Series>>{<<.LabelMatchers>>}[2m])) by (<<.GroupBy>>)'
```

### Step 4: HPA 생성

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: rps-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: 100
```

## 실전 예제

### 예제 1: CPU 기반 HPA (CKA 기본)

```bash
# 명령형으로 HPA 생성
kubectl autoscale deployment my-app --cpu-percent=50 --min=2 --max=10

# YAML로 생성
cat <<EOF | kubectl apply -f -
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50
EOF
```

### 예제 2: 메모리 기반 HPA

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: memory-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: memory
      target:
        type: AverageValue
        averageValue: 500Mi  # Pod당 평균 500Mi
```

### 예제 3: 복합 메트릭 (CPU + Custom)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: multi-metric-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 20
  metrics:
  # CPU 기반
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  # Custom Metric 기반
  - type: Pods
    pods:
      metric:
        name: requests_per_second
      target:
        type: AverageValue
        averageValue: 50
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300  # 5분간 안정화
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
      - type: Pods
        value: 4
        periodSeconds: 15
      selectPolicy: Max
```

### 예제 4: 스케일링 동작 제어

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: controlled-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 3
  maxReplicas: 100
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300  # Scale Down 전 5분 대기
      policies:
      - type: Pods
        value: 1  # 한 번에 최대 1개 Pod 감소
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0  # 즉시 Scale Up
      policies:
      - type: Pods
        value: 4  # 한 번에 최대 4개 Pod 증가
        periodSeconds: 15
```

## CKA 시험 대비

### 필수 명령어

```bash
# HPA 생성 (명령형)
kubectl autoscale deployment my-app --cpu-percent=50 --min=2 --max=10

# HPA 조회
kubectl get hpa
kubectl get hpa -w  # 실시간 모니터링

# HPA 상세 정보
kubectl describe hpa my-app-hpa

# HPA 상태 확인 (TARGETS 열 중요)
kubectl get hpa
# NAME          REFERENCE        TARGETS   MINPODS   MAXPODS   REPLICAS
# my-app-hpa    Deployment/app   45%/50%   2         10        3

# Custom Metrics API 확인
kubectl get --raw "/apis/custom.metrics.k8s.io/v1beta1" | jq .

# Pod 메트릭 확인
kubectl get --raw "/apis/custom.metrics.k8s.io/v1beta1/namespaces/default/pods/*/requests_per_second"

# HPA 삭제
kubectl delete hpa my-app-hpa
```

### CKA 빈출 시나리오

**시나리오 1: CPU 50% 기준 HPA 생성**
```bash
# Deployment에 resource requests가 설정되어 있어야 함
kubectl autoscale deployment web-app --cpu-percent=50 --min=2 --max=10
```

**시나리오 2: 메모리 기반 HPA (YAML 필요)**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: memory-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 65
```

**시나리오 3: HPA가 동작하지 않을 때 진단**
```bash
# 1. Metrics Server 확인
kubectl get deployment metrics-server -n kube-system

# 2. Pod 메트릭 확인
kubectl top pods

# 3. HPA 상태 확인
kubectl describe hpa my-app-hpa
# Events에서 "unable to get metrics" 확인

# 4. Deployment에 requests 설정 확인
kubectl get deployment my-app -o yaml | grep -A 5 resources
```

## 기술 면접 대비

### Q1: HPA가 스케일링하지 않는 이유는?

**A:** 주요 원인:

1. **Metrics Server 미설치**
```bash
kubectl get deployment metrics-server -n kube-system
```

2. **Resource requests 미설정** (Utilization 계산 불가)
```yaml
resources:
  requests:
    cpu: 100m  # 필수!
```

3. **메트릭 수집 지연** (기본 15초 간격)

4. **이미 min/maxReplicas 도달**

5. **Deployment가 아닌 다른 리소스 참조**

### Q2: VPA와 HPA를 함께 사용할 수 있나요?

**A:** **CPU/메모리에 대해 동시 사용 시 충돌 가능**합니다.

**권장 방식:**
- HPA: CPU 기반 스케일링
- VPA: 메모리 기반 조정 (또는 UpdateMode: Off)

```yaml
# VPA를 권장값 제안용으로만 사용
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: my-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  updatePolicy:
    updateMode: "Off"  # 자동 업데이트 비활성화, 권장값만 제공
```

### Q3: Custom Metrics를 사용하려면 무엇이 필요한가요?

**A:**

1. **메트릭 수집 시스템**: Prometheus, Datadog 등
2. **Metrics Adapter**: Prometheus Adapter, Custom Metrics API 구현
3. **애플리케이션 메트릭 노출**: `/metrics` 엔드포인트

```
Application → Prometheus → Prometheus Adapter → Custom Metrics API → HPA
```

### Q4: stabilizationWindowSeconds의 역할은?

**A:** **Flapping(빈번한 스케일링) 방지**를 위한 안정화 기간이다.

```yaml
behavior:
  scaleDown:
    stabilizationWindowSeconds: 300  # 5분간 최대값 유지 후 Scale Down
  scaleUp:
    stabilizationWindowSeconds: 0    # 즉시 Scale Up
```

- Scale Down: 길게 설정 (급격한 축소 방지)
- Scale Up: 짧게 설정 (빠른 확장)

---

## 참고 자료

- [Horizontal Pod Autoscaling 공식 문서](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [HPA Walkthrough](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale-walkthrough/)
- [Custom Metrics API](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale-walkthrough/#autoscaling-on-multiple-metrics-and-custom-metrics)
- [Prometheus Adapter](https://github.com/kubernetes-sigs/prometheus-adapter)
- [HPA Algorithm Details](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/#algorithm-details)

## 다음 단계

- [Kubernetes - VPA (Vertical Pod Autoscaler)](/kubernetes/kubernetes-vpa)
- [Kubernetes - Cluster Autoscaler](/kubernetes/kubernetes-cluster-autoscaler)
