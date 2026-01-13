---
title: "Part 15: Prometheus와 Grafana - 모니터링"
date: 2026-01-16
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, Prometheus, Grafana, Monitoring]
layout: post
toc: true
math: true
mermaid: true
---

# Part 15: 모니터링 및 로깅

## 모니터링 개요

### 왜 모니터링이 중요한가?

Kubernetes 클러스터와 애플리케이션을 운영하려면 다음을 지속적으로 관찰해야 한다:

- **리소스 사용량**: CPU, 메모리, 디스크, 네트워크
- **애플리케이션 상태**: 헬스 체크, 응답 시간, 에러율
- **클러스터 상태**: Node 상태, Pod 스케줄링, 이벤트
- **비즈니스 메트릭**: 요청 수, 사용자 수, 트랜잭션

### 모니터링 스택의 구성 요소

**1. Metrics (메트릭)**
- 시간별 숫자 데이터 (CPU 사용률, 메모리, RPS 등)
- Prometheus

**2. Logs (로그)**
- 애플리케이션과 시스템 로그
- ELK/EFK Stack, Loki

**3. Traces (분산 추적)**
- 마이크로서비스 간 요청 추적
- Jaeger, Zipkin

**4. Visualization (시각화)**
- 대시보드와 그래프
- Grafana

### 관찰 가능성 (Observability)의 3요소

```
Metrics  → What is broken?
Logs     → Why is it broken?
Traces   → Where is it broken?
```

---

## Metrics Server

### Metrics Server란?

**정의:**

Metrics Server는 Kubernetes 클러스터 내 리소스 사용량 메트릭을 수집하는 경량 컴포넌트이다. kubelet에서 메트릭을 수집하여 Metrics API로 제공한다.

**용도:**

- kubectl top 명령어
- Horizontal Pod Autoscaler (HPA)
- Vertical Pod Autoscaler (VPA)
- Scheduler 힌트

**제한사항:**

- 단기 메모리 저장 (장기 저장 불가)
- 기본 CPU/Memory 메트릭만 제공
- 커스텀 메트릭 불가

### Metrics Server 설치

```bash
# Metrics Server 설치
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# 로컬 환경 (minikube, kind)에서 TLS 검증 비활성화
kubectl patch deployment metrics-server -n kube-system --type='json' \
  -p='[{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value": "--kubelet-insecure-tls"}]'

# 설치 확인
kubectl get deployment metrics-server -n kube-system
kubectl get pods -n kube-system -l k8s-app=metrics-server
```

### Metrics Server 사용

```bash
# Node 리소스 사용량
kubectl top nodes

# 출력 예:
# NAME           CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
# controlplane   250m         12%    1024Mi          52%
# node01         150m         7%     512Mi           26%

# Pod 리소스 사용량
kubectl top pods -A

# 특정 네임스페이스
kubectl top pods -n kube-system

# 정렬
kubectl top pods -A --sort-by=cpu
kubectl top pods -A --sort-by=memory

# 컨테이너별 리소스 (특정 Pod)
kubectl top pod nginx-deployment-abc123 --containers

# 출력 예:
# POD                       NAME   CPU(cores)   MEMORY(bytes)
# nginx-deployment-abc123   nginx  10m          50Mi
```

---

## Prometheus

### Prometheus 개요

**정의:**

Prometheus는 시계열 데이터베이스 기반의 오픈소스 모니터링 및 알림 시스템이다. CNCF의 두 번째 졸업 프로젝트 (첫 번째는 Kubernetes)이다.

**특징:**

- **Pull 기반**: Prometheus가 주기적으로 타겟에서 메트릭을 수집
- **PromQL**: 강력한 쿼리 언어
- **Service Discovery**: Kubernetes와 자동 통합
- **다차원 데이터 모델**: Labels로 메트릭 분류
- **Alert Manager**: 알림 통합

**아키텍처:**

```
┌─────────────────┐
│  Applications   │  ← /metrics endpoint
│  (Exporters)    │
└────────┬────────┘
         │ Pull (HTTP)
         ↓
┌────────────────────┐
│   Prometheus       │
│   Server           │
│  - TSDB (Storage)  │
│  - PromQL Engine   │
│  - Alerting        │
└─────────┬──────────┘
          │
          ├──→  Alert Manager  → Email, Slack, PagerDuty
          │
          └──→  Grafana  → Dashboards
```

### Prometheus Operator 설치

**kube-prometheus-stack (권장):**

이 Helm 차트는 Prometheus, Grafana, Alert Manager, Node Exporter, kube-state-metrics 등을 한 번에 설치한다.

```bash
# Helm 저장소 추가
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Prometheus Stack 설치
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set prometheus.prometheusSpec.retention=30d \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=50Gi

# 설치 확인
kubectl get pods -n monitoring

# 출력 예:
# NAME                                                     READY   STATUS    RESTARTS   AGE
# prometheus-kube-prometheus-operator-7c8b5d5f4d-abc12    1/1     Running   0          2m
# prometheus-prometheus-kube-prometheus-prometheus-0      2/2     Running   0          2m
# prometheus-grafana-7d8b9c8d9-def34                      3/3     Running   0          2m
# prometheus-kube-state-metrics-6f7b8c9d8-ghi56           1/1     Running   0          2m
# prometheus-prometheus-node-exporter-jkl78               1/1     Running   0          2m
```

### Prometheus 접근

```bash
# Prometheus UI 포트 포워딩
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090

# 브라우저에서 http://localhost:9090 접속
```

**Prometheus UI 주요 기능:**

- **Graph**: PromQL 쿼리 실행 및 그래프 생성
- **Alerts**: 활성 알림 확인
- **Status > Targets**: 메트릭 수집 대상 상태 확인
- **Status > Configuration**: Prometheus 설정 확인

### PromQL 기본

**메트릭 조회:**

```promql
# 모든 컨테이너 CPU 사용률
container_cpu_usage_seconds_total

# 특정 네임스페이스
container_cpu_usage_seconds_total{namespace="production"}

# 특정 Pod
container_cpu_usage_seconds_total{namespace="production", pod="nginx-abc123"}
```

**함수 및 집계:**

```promql
# 1분 동안의 평균 CPU 사용률
rate(container_cpu_usage_seconds_total[1m])

# 네임스페이스별 합계
sum(rate(container_cpu_usage_seconds_total[1m])) by (namespace)

# 네임스페이스별 메모리 사용량 (상위 5개)
topk(5, sum(container_memory_usage_bytes) by (namespace))

# HTTP 요청 에러율
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) * 100

# P95 레이턴시
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

**유용한 쿼리 예제:**

```promql
# Node CPU 사용률
100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Node 메모리 사용률
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100

# Pod 재시작 횟수
kube_pod_container_status_restarts_total

# Pod OOMKilled 카운트
sum(kube_pod_container_status_last_terminated_reason{reason="OOMKilled"}) by (namespace, pod)

# Disk I/O
rate(node_disk_io_time_seconds_total[1m])
```

### Metrics Exporters

**Node Exporter (이미 설치됨):**

호스트 메트릭 수집 (CPU, 메모리, 디스크, 네트워크 등)

**kube-state-metrics (이미 설치됨):**

Kubernetes 리소스 상태 메트릭 (Pod, Deployment, Node 등)

**Custom Application Metrics:**

애플리케이션에서 /metrics 엔드포인트 노출:

```go
// Go 예제 (Prometheus client library)
package main

import (
	"net/http"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	httpRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests",
		},
		[]string{"path", "method", "status"},
	)

	httpRequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name: "http_request_duration_seconds",
			Help: "HTTP request latencies in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"path", "method"},
	)
)

func init() {
	prometheus.MustRegister(httpRequestsTotal)
	prometheus.MustRegister(httpRequestDuration)
}

func main() {
	http.Handle("/metrics", promhttp.Handler())
	http.ListenAndServe(":8080", nil)
}
```

### ServiceMonitor

**ServiceMonitor란?**

Prometheus Operator의 CRD로, Prometheus가 어떤 Service를 스크랩할지 정의한다.

**예제:**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: myapp-metrics
  namespace: monitoring
  labels:
    release: prometheus  # Prometheus Selector와 일치해야 함
spec:
  selector:
    matchLabels:
      app: myapp  # 모니터링할 Service의 Label
  namespaceSelector:
    matchNames:
      - production
  endpoints:
    - port: metrics  # Service의 port 이름
      interval: 30s  # 스크랩 간격
      path: /metrics  # 메트릭 경로
```

**Service 정의:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-service
  namespace: production
  labels:
    app: myapp  # ServiceMonitor의 selector와 일치
spec:
  selector:
    app: myapp
  ports:
    - name: metrics  # ServiceMonitor의 port 이름과 일치
      port: 8080
      targetPort: 8080
```

**동작 원리:**

```
1. ServiceMonitor 생성
   ↓
2. Prometheus Operator가 감지
   ↓
3. Prometheus 설정 자동 업데이트
   ↓
4. Prometheus가 Service 엔드포인트에서 메트릭 수집
```

### Alert 설정

**PrometheusRule:**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: myapp-alerts
  namespace: monitoring
  labels:
    release: prometheus
spec:
  groups:
    - name: myapp.rules
      interval: 30s
      rules:
        - alert: HighErrorRate
          expr: |
            rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) * 100 > 5
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "High error rate detected"
            description: "Error rate is {{ $value }}% for {{ $labels.namespace }}/{{ $labels.pod }}"

        - alert: PodCrashLooping
          expr: |
            rate(kube_pod_container_status_restarts_total[15m]) > 0
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Pod is crash looping"
            description: "Pod {{ $labels.namespace }}/{{ $labels.pod }} is restarting frequently"

        - alert: NodeOutOfDisk
          expr: |
            node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} * 100 < 10
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Node is running out of disk space"
            description: "Node {{ $labels.instance }} has only {{ $value }}% disk space left"
```

**AlertManager 설정:**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: alertmanager-prometheus-kube-prometheus-alertmanager
  namespace: monitoring
stringData:
  alertmanager.yaml: |
    global:
      resolve_timeout: 5m
      slack_api_url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'

    route:
      group_by: ['alertname', 'cluster']
      group_wait: 10s
      group_interval: 10s
      repeat_interval: 12h
      receiver: 'slack'
      routes:
        - match:
            severity: critical
          receiver: 'slack-critical'

    receivers:
      - name: 'slack'
        slack_configs:
          - channel: '#alerts'
            title: 'Alert: {{ .CommonLabels.alertname }}'
            text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

      - name: 'slack-critical'
        slack_configs:
          - channel: '#alerts-critical'
            title: 'CRITICAL: {{ .CommonLabels.alertname }}'
            text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
```

---

## Grafana

### Grafana 개요

**정의:**

Grafana는 메트릭을 시각화하고 대시보드를 생성하는 오픈소스 플랫폼이다.

**특징:**

- 다양한 데이터 소스 (Prometheus, InfluxDB, Elasticsearch 등)
- 강력한 대시보드 및 패널
- 알림 통합
- 템플릿 변수
- 플러그인 시스템

### Grafana 접근

```bash
# Grafana 포트 포워딩
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80

# 브라우저에서 http://localhost:3000 접속

# 기본 로그인 정보
# Username: admin
# Password: prom-operator (또는 kubectl get secret)
```

**비밀번호 확인:**

```bash
kubectl get secret -n monitoring prometheus-grafana -o jsonpath="{.data.admin-password}" | base64 --decode
```

### 데이터 소스 추가

Prometheus는 이미 추가되어 있다.

**확인 및 수동 추가:**

1. Grafana UI에서 **Configuration > Data Sources**
2. **Add data source**
3. **Prometheus** 선택
4. URL: `http://prometheus-kube-prometheus-prometheus.monitoring.svc:9090`
5. **Save & Test**

### Dashboard 생성

**새 Dashboard:**

1. **+ > Dashboard > Add new panel**
2. **Query**: PromQL 입력
3. **Visualization**: 그래프 타입 선택 (Time series, Gauge, Table 등)
4. **Panel options**: 제목, 단위, 범례 설정

**예제 패널:**

```promql
# CPU 사용률
100 - (avg(irate(node_cpu_seconds_total{mode="idle"}[5m])) by (instance) * 100)

# 메모리 사용량
node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes

# HTTP 요청률
sum(rate(http_requests_total[5m])) by (status)
```

### 템플릿 변수

**변수 생성:**

1. **Dashboard settings > Variables > Add variable**
2. **Name**: namespace
3. **Type**: Query
4. **Data source**: Prometheus
5. **Query**: `label_values(kube_pod_info, namespace)`
6. **Refresh**: On Dashboard Load

**사용:**

```promql
# Panel Query에서 $namespace 사용
sum(rate(container_cpu_usage_seconds_total{namespace="$namespace"}[5m])) by (pod)
```

### 사전 구성된 Dashboard Import

**Grafana Labs에서 제공하는 Dashboard:**

1. **+ > Import**
2. **Dashboard ID 입력** (예: 6417 - Kubernetes Cluster Monitoring)
3. **Load**
4. **Prometheus 데이터 소스 선택**
5. **Import**

**추천 Dashboard:**

- **Node Exporter Full**: ID 1860
- **Kubernetes Cluster Monitoring**: ID 6417
- **Kubernetes Pod Monitoring**: ID 747
- **Prometheus 2.0 Stats**: ID 3662

### 알림 설정

**Alert Rule 생성:**

1. **Panel 편집 > Alert tab**
2. **Create Alert**
3. **Conditions 설정**
4. **Notifications** 선택

**Notification Channel:**

1. **Alerting > Notification channels > New channel**
2. **Type**: Slack, Email, PagerDuty 등 선택
3. **설정 입력**
4. **Test > Save**

---

## Logging

### Kubernetes 로깅 아키텍처

**로그 레벨:**

1. **Container Logs**: STDOUT/STDERR
2. **Node Logs**: /var/log/pods/, /var/log/containers/
3. **Cluster Logs**: kube-apiserver, etcd, kubelet 등

**기본 로그 조회:**

```bash
# Pod 로그
kubectl logs pod-name

# 여러 컨테이너 중 특정 컨테이너
kubectl logs pod-name -c container-name

# 이전 컨테이너 로그 (재시작된 경우)
kubectl logs pod-name --previous

# 실시간 스트리밍
kubectl logs -f pod-name

# 마지막 N줄
kubectl logs pod-name --tail=100

# 특정 시간 이후 로그
kubectl logs pod-name --since=1h

# Label selector
kubectl logs -l app=nginx --all-containers=true
```

### ELK Stack

**ELK = Elasticsearch + Logstash + Kibana**

**아키텍처:**

```
Pods → Fluentd (DaemonSet) → Elasticsearch → Kibana
```

**Elasticsearch 설치 (Helm):**

```bash
helm repo add elastic https://helm.elastic.co

# Elasticsearch
helm install elasticsearch elastic/elasticsearch \
  --namespace logging \
  --create-namespace \
  --set replicas=3 \
  --set minimumMasterNodes=2

# Kibana
helm install kibana elastic/kibana \
  --namespace logging \
  --set elasticsearchHosts="http://elasticsearch-master:9200"

# Fluentd
kubectl apply -f https://raw.githubusercontent.com/fluent/fluentd-kubernetes-daemonset/master/fluentd-daemonset-elasticsearch.yaml
```

**Fluentd 설정:**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluentd-config
  namespace: logging
data:
  fluent.conf: |
    <source>
      @type tail
      path /var/log/containers/*.log
      pos_file /var/log/fluentd-containers.log.pos
      tag kubernetes.*
      read_from_head true
      <parse>
        @type json
        time_format %Y-%m-%dT%H:%M:%S.%NZ
      </parse>
    </source>

    <filter kubernetes.**>
      @type kubernetes_metadata
    </filter>

    <match **>
      @type elasticsearch
      host elasticsearch-master
      port 9200
      logstash_format true
      logstash_prefix kubernetes
      <buffer>
        @type file
        path /var/log/fluentd-buffers/kubernetes.system.buffer
        flush_mode interval
        retry_type exponential_backoff
        flush_interval 5s
        retry_max_interval 30
      </buffer>
    </match>
```

### Loki Stack (Grafana Loki)

**Loki = 경량 로그 집계 시스템**

**특징:**

- Prometheus처럼 Labels 사용
- 로그 내용을 인덱싱하지 않음 (비용 효율적)
- Grafana와 통합

**Loki 설치:**

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Loki Stack (Loki + Promtail + Grafana)
helm install loki grafana/loki-stack \
  --namespace logging \
  --create-namespace \
  --set grafana.enabled=true \
  --set promtail.enabled=true
```

**Grafana에서 Loki 데이터 소스 추가:**

1. **Configuration > Data Sources > Add data source**
2. **Loki** 선택
3. URL: `http://loki:3100`
4. **Save & Test**

**LogQL 쿼리 예제:**

```logql
# 특정 네임스페이스 로그
{namespace="production"}

# 특정 Pod 로그
{namespace="production", pod=~"nginx-.*"}

# 에러 로그만 필터
{namespace="production"} |= "error"

# JSON 파싱
{app="myapp"} | json | line_format "{{.message}}"

# Rate 계산 (에러 로그 비율)
rate({namespace="production"} |= "error"[5m])
```

---

## 모니터링 Best Practices

### 1. Golden Signals

**SRE의 4대 Golden Signals:**

- **Latency**: 요청이 처리되는 시간
- **Traffic**: 시스템에 들어오는 요청 수
- **Errors**: 실패한 요청 비율
- **Saturation**: 리소스 사용률 (CPU, 메모리, 네트워크)

```promql
# Latency (P99)
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# Traffic (RPS)
sum(rate(http_requests_total[5m]))

# Errors (Error Rate)
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100

# Saturation (CPU)
sum(rate(container_cpu_usage_seconds_total[5m])) / sum(kube_pod_container_resource_limits{resource="cpu"}) * 100
```

### 2. USE Method (리소스 중심)

- **Utilization**: 리소스 사용률
- **Saturation**: 큐잉, 대기
- **Errors**: 에러 카운트

### 3. RED Method (요청 중심)

- **Rate**: 요청률
- **Errors**: 에러율
- **Duration**: 응답 시간

### 4. Alert 설계 원칙

**Symptom-based, not Cause-based:**

```yaml
# Good: 증상 기반
- alert: HighLatency
  expr: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 1

# Bad: 원인 기반
- alert: HighCPU
  expr: container_cpu_usage_seconds_total > 0.8
```

**Actionable:**

알림이 발생하면 즉시 조치할 수 있어야 한다.

**페이지 피로 방지:**

- `for: 5m`: 일시적 스파이크 무시
- `group_wait`, `repeat_interval` 조정

### 5. Dashboard 설계

**계층적 구성:**

1. **Overview Dashboard**: 전체 클러스터 상태
2. **Service Dashboard**: 개별 서비스 메트릭
3. **Detail Dashboard**: 상세 분석

**템플릿 변수 활용:**

```
$cluster → $namespace → $deployment → $pod
```

---

## 참고 자료

### 공식 문서

- [Prometheus](https://prometheus.io/docs/)
- [Grafana](https://grafana.com/docs/)
- [Prometheus Operator](https://prometheus-operator.dev/)
- [Loki](https://grafana.com/docs/loki/latest/)
- [Fluentd](https://www.fluentd.org/)

### 학습 자료

- [PromQL for Humans](https://timber.io/blog/promql-for-humans/)
- [Awesome Prometheus Alerts](https://awesome-prometheus-alerts.grep.to/)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)

---
