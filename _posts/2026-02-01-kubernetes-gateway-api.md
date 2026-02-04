---
layout: post
title: "Gateway API - Ingress의 진화 (CKA 2025 신규)"
date: 2026-02-01
categories: [Kubernetes]
tags: [kubernetes, gateway-api, httproute, ingress, networking, cka]
toc: true
math: true
mermaid: true
---

2025년 2월부터 CKA 시험에 **Gateway API**가 추가되었다. Gateway API는 기존 Ingress의 한계를 극복하고 더 풍부한 라우팅 기능을 제공하는 차세대 Kubernetes 네트워킹 표준이다.

## 공식 문서 주요 내용

> **원문 ([gateway-api.sigs.k8s.io](https://gateway-api.sigs.k8s.io/)):**
> Gateway API is a family of API kinds that provide dynamic infrastructure provisioning and advanced traffic routing.
>
> Gateway API is designed to work with many different implementations, including Istio, NGINX, and Cilium. It provides a standardized way to configure network traffic and simplifies the process of setting up and managing network gateways in a Kubernetes environment.

**번역:**
Gateway API는 동적 인프라 프로비저닝과 고급 트래픽 라우팅을 제공하는 API 종류의 집합이다.

Gateway API는 Istio, NGINX, Cilium 등 다양한 구현체와 함께 작동하도록 설계되었다. 네트워크 트래픽을 구성하는 표준화된 방법을 제공하고, Kubernetes 환경에서 네트워크 게이트웨이를 설정하고 관리하는 프로세스를 단순화한다.

---

> **원문 ([gateway-api.sigs.k8s.io - Role-Oriented Design](https://gateway-api.sigs.k8s.io/concepts/roles-and-personas/)):**
> Gateway API resources are designed to be owned by different personas. GatewayClass and Gateway are typically owned by infrastructure providers and cluster operators, respectively, while HTTPRoute is often owned by application developers.

**번역:**
Gateway API 리소스는 서로 다른 역할(페르소나)이 소유하도록 설계되었다. GatewayClass와 Gateway는 일반적으로 각각 인프라 제공자와 클러스터 운영자가 소유하고, HTTPRoute는 주로 애플리케이션 개발자가 소유한다.

---

## Gateway API가 필요한 이유

### Ingress의 한계

```yaml
# Ingress: annotation에 의존하는 설정
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /  # NGINX 전용
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    # 벤더마다 annotation이 다름!
```

**Ingress의 문제점:**
- **Annotation 의존**: 고급 기능은 annotation으로 설정 → 벤더별로 다름
- **역할 분리 불가**: 인프라팀, 앱팀이 같은 리소스 수정
- **제한된 프로토콜**: HTTP/HTTPS만 지원 (TCP/UDP 불가)
- **트래픽 분할 불가**: Canary 배포 어려움

### Gateway API의 장점

```
역할 분리:
┌─────────────────────────────────────────────────────────┐
│ 인프라 제공자  → GatewayClass (어떤 구현체 사용할지)      │
│ 클러스터 운영자 → Gateway (리스너, 포트, TLS 설정)        │
│ 앱 개발자      → HTTPRoute (경로 매칭, 백엔드 연결)       │
└─────────────────────────────────────────────────────────┘
```

## Gateway API 핵심 리소스

### 리소스 계층 구조

```
GatewayClass (인프라 제공자 정의)
     │
     └─→ Gateway (클러스터 운영자 정의)
              │
              └─→ HTTPRoute (앱 개발자 정의)
                  GRPCRoute
                  TCPRoute
                  TLSRoute
                  UDPRoute
```

### 1. GatewayClass

인프라 제공자가 정의하는 컨트롤러 타입이다.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: nginx
spec:
  controllerName: k8s.io/nginx  # 구현체 지정
```

**주요 GatewayClass 구현체:**
| 구현체 | controllerName |
|--------|----------------|
| NGINX Gateway Fabric | gateway.nginx.org/nginx-gateway-controller |
| Istio | istio.io/gateway-controller |
| Cilium | io.cilium/gateway-controller |
| Contour | projectcontour.io/gateway-controller |

```bash
# 클러스터에서 사용 가능한 GatewayClass 확인
kubectl get gatewayclass
```

### 2. Gateway

클러스터 운영자가 정의하는 리스너 설정이다.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: my-gateway
  namespace: default
spec:
  gatewayClassName: nginx  # 어떤 GatewayClass 사용할지
  listeners:
  - name: http
    port: 80
    protocol: HTTP
    hostname: "*.example.com"  # 와일드카드 지원
    allowedRoutes:
      namespaces:
        from: All  # 모든 namespace의 Route 허용
  - name: https
    port: 443
    protocol: HTTPS
    hostname: "*.example.com"
    tls:
      mode: Terminate  # TLS 종료
      certificateRefs:
      - name: example-tls-secret
    allowedRoutes:
      namespaces:
        from: Selector
        selector:
          matchLabels:
            gateway-access: "true"
```

**리스너 프로토콜:**
- `HTTP`: HTTP/1.1 및 HTTP/2
- `HTTPS`: TLS 종료 후 HTTP
- `TLS`: TLS passthrough 또는 종료
- `TCP`: 원시 TCP 연결
- `UDP`: 원시 UDP 연결

### 3. HTTPRoute

앱 개발자가 정의하는 라우팅 규칙이다.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api-route
  namespace: default
spec:
  parentRefs:
  - name: my-gateway  # 어떤 Gateway에 연결할지
    namespace: default
  hostnames:
  - "api.example.com"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /users
    backendRefs:
    - name: user-service
      port: 8080
  - matches:
    - path:
        type: PathPrefix
        value: /orders
    backendRefs:
    - name: order-service
      port: 8080
```

## Ingress vs Gateway API 비교

| 항목 | Ingress | Gateway API |
|------|---------|-------------|
| 역할 분리 | 없음 (단일 리소스) | GatewayClass/Gateway/Route |
| 프로토콜 | HTTP/HTTPS만 | HTTP, TCP, UDP, gRPC, TLS |
| 트래픽 분할 | 불가 (annotation 의존) | 표준 지원 (weight) |
| 헤더 기반 라우팅 | 벤더별 annotation | 표준 API |
| TLS 설정 | 제한적 | 풍부함 (passthrough, 종료) |
| 상태 관리 | `.status` 제한적 | 상세한 상태 정보 |

## 실전 예제

### 예제 1: 기본 라우팅

```yaml
# Gateway 생성
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: web-gateway
spec:
  gatewayClassName: nginx
  listeners:
  - name: http
    port: 80
    protocol: HTTP
---
# HTTPRoute로 서비스 연결
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
spec:
  parentRefs:
  - name: web-gateway
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: web-service
      port: 80
```

### 예제 2: 트래픽 분할 (Canary 배포)

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: canary-route
spec:
  parentRefs:
  - name: my-gateway
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /api
    backendRefs:
    - name: api-v1
      port: 8080
      weight: 90  # 90% 트래픽
    - name: api-v2
      port: 8080
      weight: 10  # 10% 트래픽 (Canary)
```

### 예제 3: 헤더 기반 라우팅

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: header-route
spec:
  parentRefs:
  - name: my-gateway
  rules:
  # X-Version: v2 헤더가 있으면 v2 서비스로
  - matches:
    - headers:
      - name: X-Version
        value: v2
    backendRefs:
    - name: api-v2
      port: 8080
  # 그 외는 v1 서비스로
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: api-v1
      port: 8080
```

### 예제 4: TLS 설정

```yaml
# TLS Secret 생성
kubectl create secret tls example-tls \
  --cert=tls.crt \
  --key=tls.key
---
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: secure-gateway
spec:
  gatewayClassName: nginx
  listeners:
  - name: https
    port: 443
    protocol: HTTPS
    hostname: secure.example.com
    tls:
      mode: Terminate
      certificateRefs:
      - name: example-tls
        kind: Secret
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: secure-route
spec:
  parentRefs:
  - name: secure-gateway
  hostnames:
  - secure.example.com
  rules:
  - backendRefs:
    - name: secure-app
      port: 8080
```

### 예제 5: 요청/응답 수정 (RequestHeaderModifier)

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: modify-headers-route
spec:
  parentRefs:
  - name: my-gateway
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /api
    filters:
    - type: RequestHeaderModifier
      requestHeaderModifier:
        add:
        - name: X-Custom-Header
          value: "added-by-gateway"
        set:
        - name: Host
          value: "backend.internal"
        remove:
        - X-Unwanted-Header
    backendRefs:
    - name: api-service
      port: 8080
```

## CKA 시험 대비

### 필수 명령어

```bash
# Gateway 조회
kubectl get gateway
kubectl get gw  # 약어

# HTTPRoute 조회
kubectl get httproute

# GatewayClass 조회
kubectl get gatewayclass
kubectl get gc  # 약어

# Gateway 상세 정보 (상태 확인)
kubectl describe gateway my-gateway

# HTTPRoute 상태 확인
kubectl describe httproute my-route

# Gateway에 연결된 Route 확인
kubectl get httproute -o wide
```

### CKA 빈출 시나리오

**시나리오 1: 기본 Gateway + HTTPRoute 생성**
```bash
# 문제: nginx GatewayClass를 사용하는 Gateway와
# /api 경로를 api-service로 라우팅하는 HTTPRoute 생성

# Gateway 생성
cat <<EOF | kubectl apply -f -
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: api-gateway
spec:
  gatewayClassName: nginx
  listeners:
  - name: http
    port: 80
    protocol: HTTP
EOF

# HTTPRoute 생성
cat <<EOF | kubectl apply -f -
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api-route
spec:
  parentRefs:
  - name: api-gateway
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /api
    backendRefs:
    - name: api-service
      port: 8080
EOF
```

**시나리오 2: 트래픽 분할**
```yaml
# 문제: app-v1에 80%, app-v2에 20% 트래픽 분할
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: traffic-split
spec:
  parentRefs:
  - name: my-gateway
  rules:
  - backendRefs:
    - name: app-v1
      port: 8080
      weight: 80
    - name: app-v2
      port: 8080
      weight: 20
```

**시나리오 3: 호스트 기반 라우팅**
```yaml
# 문제: api.example.com → api-service, web.example.com → web-service
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: host-route
spec:
  parentRefs:
  - name: my-gateway
  hostnames:
  - api.example.com
  rules:
  - backendRefs:
    - name: api-service
      port: 8080
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
spec:
  parentRefs:
  - name: my-gateway
  hostnames:
  - web.example.com
  rules:
  - backendRefs:
    - name: web-service
      port: 80
```

## 기술 면접 대비

### Q1: Gateway API와 Ingress의 가장 큰 차이점은?

**A:** **역할 기반 분리(Role-Oriented Design)**이다.

| 역할 | 리소스 | 담당자 |
|------|--------|--------|
| 인프라 제공자 | GatewayClass | 클라우드 벤더, 플랫폼팀 |
| 클러스터 운영자 | Gateway | 인프라팀, SRE |
| 애플리케이션 개발자 | HTTPRoute | 개발팀 |

Ingress는 단일 리소스에 모든 설정이 집중되어 권한 분리가 어렵다.

### Q2: HTTPRoute의 트래픽 분할 기능을 설명하라.

**A:** `backendRefs`에 `weight`를 지정하여 백분율 기반 트래픽 분할이 가능하다.

```yaml
backendRefs:
- name: v1
  weight: 90  # 90%
- name: v2
  weight: 10  # 10%
```

**활용 사례:**
- Canary 배포: 새 버전에 소량 트래픽 전송
- A/B 테스트: 두 버전 비교
- 점진적 롤아웃: 비율 점차 증가

### Q3: Gateway API에서 TLS 종료(Termination)와 Passthrough의 차이는?

**A:**

| 모드 | 동작 | 사용 사례 |
|------|------|----------|
| **Terminate** | Gateway에서 TLS 복호화, 백엔드로 평문 전송 | 일반적인 웹 서비스 |
| **Passthrough** | TLS 암호화 유지, 백엔드에서 복호화 | 백엔드에서 인증서 검증 필요 시 |

```yaml
# TLS Termination
tls:
  mode: Terminate
  certificateRefs:
  - name: tls-secret

# TLS Passthrough
tls:
  mode: Passthrough
```

### Q4: Gateway API로 마이그레이션 시 고려사항은?

**A:**
1. **GatewayClass 지원 확인**: 사용 중인 Ingress Controller가 Gateway API 지원하는지
2. **점진적 마이그레이션**: Ingress와 Gateway API 병행 운영 가능
3. **기능 매핑**: annotation 기반 설정을 표준 API로 변환
4. **테스트 환경 검증**: 라우팅 규칙 동일하게 동작하는지 확인

---

## 참고 자료

- [Gateway API 공식 문서](https://gateway-api.sigs.k8s.io/)
- [Kubernetes Gateway API](https://kubernetes.io/docs/concepts/services-networking/gateway/)
- [Gateway API Implementations](https://gateway-api.sigs.k8s.io/implementations/)
- [Ingress to Gateway API Migration](https://gateway-api.sigs.k8s.io/guides/migrating-from-ingress/)

## 다음 단계

- [Kubernetes - HPA와 Custom Metrics](/kubernetes/kubernetes-hpa-custom-metrics)
- [Kubernetes - Service Mesh (Istio)](/kubernetes/kubernetes-ecosystem-02-istio)
