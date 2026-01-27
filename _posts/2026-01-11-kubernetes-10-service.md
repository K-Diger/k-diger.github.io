---
layout: post
title: "Kubernetes 가이드 - Service 가이드"
date: 2026-01-11
categories: [Kubernetes]
tags: [kubernetes, service, clusterip, nodeport, loadbalancer, networking, cka]
---

Kubernetes에서 Pod는 일시적(ephemeral)인 존재이다. Pod가 재시작되면 IP 주소가 변경되고, Deployment로 관리되는 Pod들은 언제든지 새로운 Pod로 교체될 수 있다. 이러한 환경에서 안정적인 네트워크 통신을 위해 **Service**라는 추상화 계층이 필요하다.

## Service의 필요성

### Pod IP의 한계

```yaml
# Pod는 생성될 때마다 새로운 IP를 할당받는다
apiVersion: v1
kind: Pod
metadata:
  name: web-app
spec:
  containers:
  - name: nginx
    image: nginx:1.24
```

Pod IP의 문제점:
- **일시적**: Pod 재시작 시 IP 변경
- **예측 불가**: 어떤 IP가 할당될지 알 수 없음
- **직접 노출 불가**: 클러스터 외부에서 접근 불가
- **로드밸런싱 없음**: 여러 Pod에 트래픽 분산 불가

### Service의 역할

Service는 다음을 제공한다:
1. **안정적인 엔드포인트**: 변하지 않는 ClusterIP와 DNS 이름
2. **서비스 디스커버리**: DNS를 통한 자동 검색
3. **로드밸런싱**: 여러 Pod에 트래픽 분산
4. **외부 노출**: NodePort, LoadBalancer를 통한 외부 접근

## Service 기본 구조

### Service와 Endpoints

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-service
spec:
  selector:
    app: web        # 이 Label을 가진 Pod들을 선택
  ports:
  - port: 80        # Service 포트
    targetPort: 8080  # Pod의 컨테이너 포트
    protocol: TCP
```

Service를 생성하면 Kubernetes는 자동으로 **Endpoints** 오브젝트를 생성한다:

```bash
# Service 확인
kubectl get svc web-service
# NAME          TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
# web-service   ClusterIP   10.96.45.123   <none>        80/TCP    1m

# Endpoints 확인 - 실제 Pod IP 목록
kubectl get endpoints web-service
# NAME          ENDPOINTS                                AGE
# web-service   10.244.1.5:8080,10.244.2.6:8080,...     1m
```

**핵심 원리**: Service는 selector에 매칭되는 모든 Pod의 IP를 Endpoints에 등록하고, 트래픽을 이 Endpoints로 분산한다.

### Selector 없는 Service

외부 서비스나 다른 Namespace의 서비스에 연결할 때 사용한다:

```yaml
# Selector 없는 Service
apiVersion: v1
kind: Service
metadata:
  name: external-db
spec:
  ports:
  - port: 3306
---
# 수동으로 Endpoints 정의
apiVersion: v1
kind: Endpoints
metadata:
  name: external-db  # Service와 이름이 같아야 함
subsets:
  - addresses:
    - ip: 192.168.1.100  # 외부 DB 서버 IP
    - ip: 192.168.1.101
    ports:
    - port: 3306
```

이 패턴은 다음 상황에서 유용하다:
- 외부 데이터베이스 연결
- 다른 클러스터의 서비스 연결
- 레거시 시스템과의 통합

## Service 타입

### ClusterIP (기본값)

클러스터 **내부에서만** 접근 가능한 가상 IP를 할당한다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: backend-service
spec:
  type: ClusterIP  # 생략해도 기본값
  selector:
    app: backend
  ports:
  - port: 80
    targetPort: 8080
```

**특징**:
- 클러스터 내부 통신 전용
- 안정적인 내부 DNS 제공
- 가장 기본적이고 많이 사용되는 타입

**접근 방법**:
```bash
# 같은 Namespace에서
curl http://backend-service:80

# 다른 Namespace에서
curl http://backend-service.default.svc.cluster.local:80
```

### NodePort

각 노드의 특정 포트를 열어 **외부에서 접근**할 수 있게 한다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-nodeport
spec:
  type: NodePort
  selector:
    app: web
  ports:
  - port: 80          # Service 포트 (ClusterIP)
    targetPort: 8080  # Pod 포트
    nodePort: 30080   # 노드 포트 (30000-32767)
```

**트래픽 흐름**:
```
외부 클라이언트
      ↓
NodeIP:30080 (어떤 노드든)
      ↓
ClusterIP:80
      ↓
Pod:8080
```

**특징**:
- 포트 범위: 30000-32767 (기본값)
- 모든 노드에서 해당 포트 오픈
- nodePort 생략 시 자동 할당

**주의사항**:
- 노드 IP가 변경되면 클라이언트도 업데이트 필요
- 보안상 직접 노출보다는 LoadBalancer나 Ingress 권장
- 노드가 다운되면 해당 노드로의 접근 불가

### LoadBalancer

클라우드 프로바이더의 **외부 로드밸런서**를 프로비저닝한다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-lb
  annotations:
    # AWS NLB 사용 예시
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
spec:
  type: LoadBalancer
  selector:
    app: web
  ports:
  - port: 80
    targetPort: 8080
```

**트래픽 흐름**:
```
인터넷
   ↓
Cloud Load Balancer (External IP)
   ↓
NodePort (자동 생성)
   ↓
ClusterIP
   ↓
Pod
```

**특징**:
- 클라우드 환경에서 자동으로 LB 생성
- 외부 IP 주소 할당
- NodePort를 자동으로 포함

**클라우드별 어노테이션 예시**:

```yaml
# AWS - Internal Load Balancer
metadata:
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-internal: "true"

# GCP - Static IP
metadata:
  annotations:
    networking.gke.io/load-balancer-type: "Internal"

# Azure - Internal Load Balancer
metadata:
  annotations:
    service.beta.kubernetes.io/azure-load-balancer-internal: "true"
```

### ExternalName

클러스터 내부에서 외부 DNS 이름을 사용할 수 있게 해주는 특수한 Service 타입이다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: external-api
spec:
  type: ExternalName
  externalName: api.external-service.com
```

**특징**:
- ClusterIP 할당 없음
- CNAME 레코드 생성
- 외부 서비스를 내부 DNS로 접근 가능

**사용 예**:
```bash
# 클러스터 내부에서
curl http://external-api.default.svc.cluster.local
# → api.external-service.com 으로 리다이렉트
```

## Headless Service

ClusterIP가 없는 특수한 Service로, **개별 Pod에 직접 접근**해야 할 때 사용한다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: db-headless
spec:
  clusterIP: None  # Headless 선언
  selector:
    app: database
  ports:
  - port: 5432
```

**일반 Service vs Headless Service**:

| 구분 | 일반 Service | Headless Service |
|------|-------------|------------------|
| ClusterIP | 있음 | None |
| DNS 응답 | ClusterIP 반환 | Pod IP 목록 반환 |
| 로드밸런싱 | kube-proxy가 수행 | 클라이언트가 선택 |
| 용도 | 일반적인 서비스 | StatefulSet, 클라이언트 사이드 LB |

**DNS 조회 결과**:
```bash
# 일반 Service
nslookup web-service.default.svc.cluster.local
# → 10.96.45.123 (ClusterIP)

# Headless Service
nslookup db-headless.default.svc.cluster.local
# → 10.244.1.5, 10.244.2.6, 10.244.3.7 (모든 Pod IP)
```

**StatefulSet과 함께 사용**:
```bash
# StatefulSet의 각 Pod에 고유 DNS로 접근
nslookup mysql-0.db-headless.default.svc.cluster.local
# → mysql-0 Pod의 IP

nslookup mysql-1.db-headless.default.svc.cluster.local
# → mysql-1 Pod의 IP
```

## Service Discovery

### DNS 기반 디스커버리

Kubernetes는 CoreDNS를 통해 서비스 디스커버리를 제공한다.

**DNS 이름 규칙**:
```
<service-name>.<namespace>.svc.cluster.local
```

**DNS 레코드 종류**:
- **A 레코드**: Service → ClusterIP
- **SRV 레코드**: 포트 정보 포함
- **Pod DNS**: `<pod-ip-dashed>.<namespace>.pod.cluster.local`

```bash
# Service DNS 조회
nslookup web-service.production.svc.cluster.local

# SRV 레코드 조회 (포트 정보 포함)
nslookup -type=SRV _http._tcp.web-service.production.svc.cluster.local
```

**같은 Namespace에서 접근**:
```bash
curl http://web-service        # 축약형
curl http://web-service.default  # namespace 포함
curl http://web-service.default.svc.cluster.local  # FQDN
```

### 환경 변수 기반 디스커버리

Pod가 생성될 때 같은 Namespace의 Service 정보가 환경 변수로 주입된다.

```bash
# Pod 내부에서 확인
env | grep WEB_SERVICE
# WEB_SERVICE_SERVICE_HOST=10.96.45.123
# WEB_SERVICE_SERVICE_PORT=80
# WEB_SERVICE_PORT=tcp://10.96.45.123:80
```

**주의**: Pod보다 나중에 생성된 Service는 환경 변수에 포함되지 않는다. DNS 방식을 권장한다.

## Session Affinity

동일한 클라이언트의 요청을 **같은 Pod로 라우팅**하고 싶을 때 사용한다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: sticky-service
spec:
  selector:
    app: web
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 3600  # 1시간 (기본값: 10800초/3시간)
  ports:
  - port: 80
    targetPort: 8080
```

**sessionAffinity 옵션**:
- `None`: 기본값, 라운드로빈
- `ClientIP`: 클라이언트 IP 기준 고정

**참고**: Cookie 기반 세션 어피니티는 Service에서 지원하지 않는다. 필요하다면 Ingress 사용.

## 포트 설정

### Multi-Port Service

하나의 Service에서 여러 포트를 노출할 수 있다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: multi-port-service
spec:
  selector:
    app: web
  ports:
  - name: http      # 다중 포트 시 name 필수
    port: 80
    targetPort: 8080
  - name: https
    port: 443
    targetPort: 8443
  - name: metrics
    port: 9090
    targetPort: 9090
```

### Named Port 참조

Pod에서 정의한 포트 이름을 참조할 수 있다.

```yaml
# Pod 정의
apiVersion: v1
kind: Pod
metadata:
  name: web-pod
  labels:
    app: web
spec:
  containers:
  - name: nginx
    image: nginx
    ports:
    - name: http-port
      containerPort: 80
    - name: https-port
      containerPort: 443
---
# Service에서 이름으로 참조
apiVersion: v1
kind: Service
metadata:
  name: web-service
spec:
  selector:
    app: web
  ports:
  - name: http
    port: 80
    targetPort: http-port  # 포트 이름 참조
  - name: https
    port: 443
    targetPort: https-port
```

**장점**: Pod의 포트 번호가 변경되어도 Service 수정 불필요.

## External Traffic Policy

외부 트래픽(NodePort, LoadBalancer)의 라우팅 방식을 제어한다.

### Cluster (기본값)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-service
spec:
  type: NodePort
  externalTrafficPolicy: Cluster
  selector:
    app: web
  ports:
  - port: 80
    nodePort: 30080
```

**동작**: 모든 노드가 트래픽을 받고, 클러스터 전체 Pod로 분산.

**장점**: 균등한 로드밸런싱
**단점**:
- 추가 네트워크 홉 발생 (다른 노드의 Pod로 전달 시)
- 클라이언트 IP 보존 안 됨 (SNAT)

### Local

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-service
spec:
  type: NodePort
  externalTrafficPolicy: Local
  selector:
    app: web
  ports:
  - port: 80
    nodePort: 30080
```

**동작**: 해당 노드에 있는 Pod로만 트래픽 전달.

**장점**:
- 네트워크 홉 감소
- 클라이언트 IP 보존

**단점**:
- Pod가 없는 노드에서는 연결 실패
- 불균등한 로드밸런싱 가능

```
externalTrafficPolicy: Cluster
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Node A  │────→│ Node B  │────→│  Pod    │
│(request)│     │(forward)│     │(Node C) │
└─────────┘     └─────────┘     └─────────┘
Client IP가 SNAT됨

externalTrafficPolicy: Local
┌─────────┐     ┌─────────┐
│ Node A  │────→│  Pod    │
│(request)│     │(Node A) │
└─────────┘     └─────────┘
Client IP 보존됨
```

## Internal Traffic Policy

클러스터 내부 트래픽의 라우팅 방식을 제어한다. Kubernetes 1.21+에서 지원.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: local-service
spec:
  selector:
    app: web
  internalTrafficPolicy: Local  # 같은 노드의 Pod로만
  ports:
  - port: 80
```

**옵션**:
- `Cluster`: 기본값, 클러스터 전체 Pod로 분산
- `Local`: 같은 노드의 Pod로만 라우팅

## kube-proxy와 Service 구현

Service의 실제 네트워크 규칙은 kube-proxy가 각 노드에서 구현한다.

### kube-proxy 모드

**iptables 모드** (기본값):
```bash
# iptables 규칙 확인
iptables -t nat -L -n | grep web-service
```
- 연결 기반 라우팅
- 낮은 오버헤드
- 백엔드 선택 후 변경 불가

**IPVS 모드**:
```bash
# IPVS 규칙 확인
ipvsadm -Ln
```
- 고성능 (많은 Service 처리에 유리)
- 다양한 로드밸런싱 알고리즘 지원
  - rr (round-robin)
  - lc (least connection)
  - dh (destination hashing)
  - sh (source hashing)
  - sed (shortest expected delay)
  - nq (never queue)

**모드 변경** (kube-proxy ConfigMap):
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: kube-proxy
  namespace: kube-system
data:
  config.conf: |
    mode: "ipvs"
    ipvs:
      scheduler: "lc"  # least connection
```

## 트러블슈팅

### Service 연결 문제 진단

```bash
# 1. Service 상태 확인
kubectl get svc web-service -o wide

# 2. Endpoints 확인 (Pod가 연결되어 있는지)
kubectl get endpoints web-service
# ENDPOINTS가 비어있다면 selector 미스매치

# 3. Pod Label 확인
kubectl get pods --show-labels

# 4. Selector 매칭 테스트
kubectl get pods -l app=web

# 5. Pod 상태 확인 (Ready 상태여야 Endpoints에 등록)
kubectl get pods -l app=web -o wide

# 6. DNS 테스트
kubectl run test --rm -it --image=busybox -- nslookup web-service

# 7. 연결 테스트
kubectl run test --rm -it --image=curlimages/curl -- curl web-service:80
```

### 일반적인 문제와 해결

**Endpoints가 비어있는 경우**:
1. Selector가 Pod Label과 일치하는지 확인
2. Pod가 Running 상태인지 확인
3. Pod가 Ready 상태인지 확인 (Readiness Probe 통과)

**연결은 되지만 응답이 없는 경우**:
1. targetPort가 컨테이너 포트와 일치하는지 확인
2. 컨테이너 내부에서 서비스가 실행 중인지 확인
3. NetworkPolicy가 트래픽을 차단하는지 확인

**외부에서 접근이 안 되는 경우** (NodePort/LoadBalancer):
1. 방화벽 규칙 확인
2. 보안 그룹(클라우드) 확인
3. externalTrafficPolicy 설정 확인

## 기술 면접 대비

### 자주 묻는 질문

**Q: ClusterIP, NodePort, LoadBalancer의 차이점은?**

A: ClusterIP는 클러스터 내부 통신 전용으로 가상 IP를 할당한다. NodePort는 각 노드의 특정 포트(30000-32767)를 열어 외부 접근을 허용하며, ClusterIP를 포함한다. LoadBalancer는 클라우드 환경에서 외부 로드밸런서를 프로비저닝하고, NodePort와 ClusterIP를 모두 포함한다. 계층적 구조로 LoadBalancer ⊃ NodePort ⊃ ClusterIP 관계이다.

**Q: Headless Service는 무엇이고 언제 사용하는가?**

A: ClusterIP가 None인 Service로, DNS 조회 시 ClusterIP 대신 Pod IP 목록을 직접 반환한다. StatefulSet과 함께 개별 Pod에 직접 접근해야 할 때, 또는 클라이언트 사이드 로드밸런싱이 필요할 때 사용한다. 데이터베이스 클러스터에서 특정 마스터 노드에 연결해야 하는 경우가 대표적인 예이다.

**Q: Service는 어떻게 Pod를 선택하고 트래픽을 분산하는가?**

A: Service의 selector와 일치하는 Label을 가진 Pod들이 자동으로 Endpoints에 등록된다. kube-proxy가 각 노드에서 iptables/IPVS 규칙을 설정하여 실제 트래픽 라우팅을 수행한다. 기본적으로 라운드로빈 방식으로 분산되며, IPVS 모드에서는 다양한 알고리즘을 선택할 수 있다.

**Q: externalTrafficPolicy: Local의 장단점은?**

A: 장점은 클라이언트 IP 보존과 네트워크 홉 감소이다. 단점은 해당 노드에 Pod가 없으면 연결이 실패하고, Pod 분포에 따라 불균등한 로드밸런싱이 발생할 수 있다. 클라이언트 IP 기반 처리(로깅, 접근 제어)가 필요하거나 네트워크 지연을 최소화해야 할 때 사용한다.

**Q: Pod가 Ready 상태가 아니면 Service에서 어떻게 처리되는가?**

A: Pod가 Ready 상태가 아니면(Readiness Probe 실패) Endpoints에서 자동으로 제거된다. 이를 통해 초기화 중이거나 장애 상태인 Pod로 트래픽이 전달되는 것을 방지한다. 이것이 Readiness Probe가 중요한 이유이다.

## CKA 시험 대비 필수 명령어

```bash
# Service 생성 (명령형)
kubectl create service clusterip web-svc --tcp=80:8080
kubectl create service nodeport web-svc --tcp=80:8080 --node-port=30080
kubectl create service loadbalancer web-svc --tcp=80:8080

# Deployment 노출 (권장 방법)
kubectl expose deployment web --port=80 --target-port=8080 --type=ClusterIP
kubectl expose deployment web --port=80 --target-port=8080 --type=NodePort
kubectl expose deployment web --port=80 --target-port=8080 --type=LoadBalancer

# Pod 직접 노출
kubectl expose pod nginx --port=80 --name=nginx-svc

# Service 조회
kubectl get svc -o wide
kubectl describe svc web-service

# Endpoints 조회
kubectl get endpoints web-service

# DNS 테스트
kubectl run test --rm -it --image=busybox --restart=Never -- nslookup web-service

# 연결 테스트
kubectl run test --rm -it --image=curlimages/curl --restart=Never -- curl -s web-service:80

# Service 수정
kubectl edit svc web-service
kubectl patch svc web-service -p '{"spec":{"type":"NodePort"}}'

# Service 삭제
kubectl delete svc web-service
```

### CKA 빈출 시나리오

```bash
# 시나리오 1: 특정 Deployment를 NodePort로 노출
kubectl expose deployment frontend --port=80 --target-port=8080 --type=NodePort --name=frontend-svc

# 시나리오 2: 특정 NodePort 지정
kubectl create service nodeport web --tcp=80:8080 --node-port=30100

# 시나리오 3: Service의 selector 수정
kubectl patch svc web-service -p '{"spec":{"selector":{"app":"web-v2"}}}'

# 시나리오 4: 외부 서비스용 Service 생성
kubectl create service externalname ext-api --external-name=api.external.com
```

## 실전 예제

### 완전한 애플리케이션 배포

```yaml
# Frontend Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: nginx
        image: nginx:1.24
        ports:
        - containerPort: 80
---
# Frontend Service (외부 노출)
apiVersion: v1
kind: Service
metadata:
  name: frontend-svc
spec:
  type: LoadBalancer
  selector:
    app: frontend
  ports:
  - port: 80
    targetPort: 80
---
# Backend Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
      - name: api
        image: myapp/api:1.0
        ports:
        - containerPort: 8080
---
# Backend Service (내부 통신)
apiVersion: v1
kind: Service
metadata:
  name: backend-svc
spec:
  type: ClusterIP
  selector:
    app: backend
  ports:
  - port: 80
    targetPort: 8080
---
# Database StatefulSet
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mysql
spec:
  serviceName: mysql-headless
  replicas: 3
  selector:
    matchLabels:
      app: mysql
  template:
    metadata:
      labels:
        app: mysql
    spec:
      containers:
      - name: mysql
        image: mysql:8.0
        ports:
        - containerPort: 3306
---
# Database Headless Service
apiVersion: v1
kind: Service
metadata:
  name: mysql-headless
spec:
  clusterIP: None
  selector:
    app: mysql
  ports:
  - port: 3306
---
# Database ClusterIP Service (일반 접근용)
apiVersion: v1
kind: Service
metadata:
  name: mysql-svc
spec:
  type: ClusterIP
  selector:
    app: mysql
  ports:
  - port: 3306
```

## 다음 단계

- [Kubernetes 가이드 - Ingress와 Ingress Controller](/kubernetes/kubernetes-11-ingress)
- [Kubernetes 가이드 - NetworkPolicy](/kubernetes/kubernetes-12-networkpolicy)
