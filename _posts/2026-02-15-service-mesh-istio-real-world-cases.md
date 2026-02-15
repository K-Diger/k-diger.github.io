---
title: "Service Mesh & Istio 실무 사례 아카이브"
date: 2026-02-15
categories: [DevOps, Kubernetes]
tags: [Istio, ServiceMesh, mTLS, Envoy, Sidecar]
layout: post
toc: true
math: true
mermaid: true
---

Service Mesh는 마이크로서비스 아키텍처에서 서비스 간 통신의 관측성, 보안, 트래픽 관리를 인프라 레벨에서 해결하기 위한 핵심 인프라 계층이다. 그 중 Istio는 Envoy Proxy를 데이터 플레인으로 사용하는 가장 널리 채택된 서비스 메시 구현체이다. 그러나 Istio를 프로덕션에 도입하고 안정적으로 운영하는 것은 PoC(Proof of Concept)와는 완전히 다른 차원의 문제다. 이 글에서는 HelloFresh, AutoTrader UK, Monzo, Wealthsimple, Intuit 등 실제 기업들이 프로덕션 환경에서 Istio를 운영하면서 겪은 문제와 해결 과정을 정리한다. 각 사례의 요약은 원문을 기반으로 재구성한 것이며, 정확한 내용은 원문 링크를 직접 확인하길 권장한다.

---

## 1. HelloFresh의 Istio 프로덕션 운영기

- **출처:** [Everything We Learned Running Istio in Production (Part 1)](https://engineering.hellofresh.com/everything-we-learned-running-istio-in-production-part-1-51efec69df65)
- **저자/출처:** HelloFresh Engineering Team
- **플랫폼:** HelloFresh Engineering Blog (Medium)

### 1.1 상황

HelloFresh는 마이크로서비스 아키텍처로 전환하면서 서비스 간 통신의 관측성(observability), 보안, 트래픽 관리에 대한 일관된 솔루션이 필요했다. 개별 서비스마다 retry, timeout, circuit breaker, TLS 등의 횡단 관심사(cross-cutting concerns)를 구현하는 것은 비효율적이었다. 서비스가 Go, Java, Python 등 다양한 언어로 작성되어 있어 각 언어별로 라이브러리를 유지보수하는 것은 현실적이지 않았다. 이러한 문제를 인프라 레벨에서 일괄 해결하기 위해 서비스 메시 도입을 결정했고, 당시 CNCF 생태계에서 가장 성숙한 Istio를 선택했다.

### 1.2 문제

Istio 도입 초기에 여러 운영 이슈가 발생했다.

첫째, **Sidecar 시작 순서 문제**가 가장 빈번하게 발생했다. Kubernetes Pod 내에서 Envoy sidecar와 애플리케이션 컨테이너는 동시에 시작된다. 그런데 Istio의 init container(`istio-init`)가 iptables 규칙을 설정하여 모든 인바운드/아웃바운드 트래픽을 Envoy로 리다이렉트하기 때문에, Envoy가 준비되기 전에 애플리케이션이 먼저 시작되면 네트워크 요청이 실패한다. 이 경합 조건(race condition)으로 인해 애플리케이션의 startup probe나 readiness probe가 실패하고, Pod가 `CrashLoopBackOff` 상태에 빠지는 현상이 반복되었다.

둘째, **Envoy sidecar의 리소스 소비**가 예상보다 높았다. 별도의 리소스 제한 없이 sidecar를 주입하면 기본값으로 배포되는데, 서비스 트래픽 패턴에 따라 Envoy의 CPU와 메모리 사용량이 크게 달라졌다. 특히 높은 TPS(Transactions Per Second)를 처리하는 서비스에서는 Envoy가 애플리케이션 컨테이너보다 더 많은 리소스를 소비하는 경우도 있었다.

셋째, **컨트롤 플레인 업그레이드 시 호환성 문제**가 발생했다. istiod를 새 버전으로 업그레이드하면 기존에 배포된 sidecar와의 xDS API 버전 불일치가 발생할 수 있다. 모든 Pod의 sidecar를 동시에 재시작하면 서비스 가용성에 영향을 미치기 때문에, 업그레이드 전략을 신중하게 수립해야 했다.

### 1.3 해결

`holdApplicationUntilProxyStarts` 설정을 활성화하여 Envoy sidecar가 완전히 준비된 후에 애플리케이션 컨테이너가 시작되도록 구성했다. 이 설정은 Istio 1.7 이상에서 사용 가능하며, `meshConfig` 또는 Pod annotation으로 적용할 수 있다.

```yaml
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
spec:
  meshConfig:
    defaultConfig:
      holdApplicationUntilProxyStarts: true
```

Envoy sidecar의 리소스 request/limit을 워크로드 프로파일에 맞게 세밀하게 튜닝했다. 트래픽이 적은 서비스는 작은 리소스를, 높은 TPS를 처리하는 서비스는 충분한 리소스를 할당하는 방식으로 sidecar 리소스 프로파일을 분류하여 관리했다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  annotations:
    sidecar.istio.io/proxyCPU: "100m"
    sidecar.istio.io/proxyMemory: "128Mi"
    sidecar.istio.io/proxyCPULimit: "500m"
    sidecar.istio.io/proxyMemoryLimit: "256Mi"
```

컨트롤 플레인 업그레이드에는 **Revision-based 카나리 업그레이드 전략**을 채택했다. 새 버전의 istiod를 별도의 revision으로 배포한 뒤, 네임스페이스 라벨을 변경하여 점진적으로 워크로드를 새 버전으로 전환하는 방식이다. 이를 통해 기존 워크로드에 영향을 최소화하면서 롤백도 용이하게 만들었다.

```bash
# 새 revision으로 istiod 설치
istioctl install --set revision=1-18-2

# 네임스페이스를 새 revision으로 전환
kubectl label namespace my-app istio.io/rev=1-18-2 --overwrite

# 기존 Pod 재시작하여 새 sidecar 적용
kubectl rollout restart deployment -n my-app
```

### 1.4 주요 교훈

- Istio 도입은 Day 1보다 **Day 2 운영이 훨씬 중요**하다. 특히 sidecar 라이프사이클 관리와 업그레이드 전략을 사전에 수립해야 한다.
- `holdApplicationUntilProxyStarts`는 프로덕션에서 거의 필수적인 설정이다.
- Sidecar 리소스 튜닝 없이 대규모 배포 시 클러스터 리소스가 급격히 소모될 수 있다.

> 공식 문서: [Istio Application Requirements](https://istio.io/latest/docs/ops/deployment/application-requirements/)

---

## 2. AutoTrader UK의 Istio 성능 오버헤드 분석

- **출처:** [Istio - The Overhead of Being Mesh](https://medium.com/autotrader-uk/istio-the-overhead-of-being-mesh-b26e2bd37aaf)
- **저자/출처:** Karl Stoney (AutoTrader UK)
- **플랫폼:** Medium (AutoTrader UK Engineering)

### 2.1 상황

AutoTrader UK는 Kubernetes 기반 플랫폼에서 수백 개의 마이크로서비스를 운영하고 있었다. 서비스 메시 도입을 검토하면서 Istio의 실제 성능 오버헤드를 정량적으로 측정하고자 했다. 단순히 벤더가 제공하는 합성 벤치마크(synthetic benchmark)가 아닌, 자신들의 실제 워크로드에서의 영향을 파악하는 것이 목표였다. 이는 서비스 메시 도입을 정당화하기 위해 "메시가 제공하는 가치가 성능 비용을 상회하는가"라는 질문에 데이터 기반으로 답하기 위한 것이었다.

### 2.2 문제

Istio sidecar(Envoy)를 통한 트래픽 프록시로 인해 **P99 레이턴시가 약 8~10ms 증가**하는 것을 확인했다. 서비스 간 호출 체인이 깊은 경우(예: 5단계 호출 체인) 누적 레이턴시 증가가 40~50ms에 달할 수 있다.

메모리 측면에서는 sidecar당 약 **40~60MB의 추가 메모리**가 필요했다. 이 수치는 해당 sidecar가 수신하는 xDS 설정의 크기에 비례하여 증가한다. 수백 개의 Pod에 적용하면 클러스터 전체적으로 수십 GB의 메모리 오버헤드가 발생했다. 예를 들어 500개의 Pod에 각 50MB의 sidecar 메모리가 추가되면 약 25GB의 추가 메모리가 필요하다.

또한 Envoy의 연결 풀 관리에서 **503 에러와 upstream connection failure**가 간헐적으로 발생했다. 특히 트래픽이 급증하는 시점에 이 문제가 두드러졌으며, 기본 connection pool 설정으로는 프로덕션 트래픽 패턴을 제대로 처리하지 못했다.

### 2.3 해결

Envoy의 connection pool 설정을 워크로드 특성에 맞게 조정했다. `DestinationRule`에서 `outlierDetection`과 `connectionPool`을 세밀하게 설정하여 503 에러를 대폭 줄였다.

```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: my-service-dr
spec:
  host: my-service.default.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
        connectTimeout: 30ms
      http:
        h2UpgradePolicy: DEFAULT
        http1MaxPendingRequests: 100
        http2MaxRequests: 1000
        maxRequestsPerConnection: 10
        maxRetries: 3
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
```

`maxConnections`는 업스트림 호스트에 대한 최대 TCP 연결 수를 제한한다. `http2MaxRequests`는 HTTP/2 연결에서의 최대 동시 요청 수를 제한한다. `outlierDetection`은 연속적인 5xx 에러가 발생하는 엔드포인트를 일시적으로 제외하여 전체 서비스 안정성을 확보한다.

불필요한 Telemetry 수집도 비활성화했다. Istio의 기본 Telemetry는 모든 요청에 대해 메트릭, 트레이스, 액세스 로그를 생성하는데, 이 중 실제로 필요하지 않은 항목을 선택적으로 비활성화하여 Envoy의 CPU 오버헤드를 줄였다.

```yaml
apiVersion: telemetry.istio.io/v1alpha1
kind: Telemetry
metadata:
  name: reduce-overhead
  namespace: istio-system
spec:
  tracing:
    - providers:
        - name: zipkin
      randomSamplingPercentage: 1.0  # 100%가 아닌 1%만 샘플링
```

### 2.4 주요 교훈

- Istio의 레이턴시 오버헤드(P99 기준 8~10ms)는 대부분의 워크로드에서 허용 가능하지만, 초저지연(ultra-low latency)이 요구되는 서비스에서는 신중한 검토가 필요하다.
- Sidecar당 메모리 오버헤드는 개별적으로는 작지만, 대규모 클러스터에서는 **무시할 수 없는 수준으로 누적**된다.
- Envoy의 기본 connection pool 설정은 대부분의 프로덕션 워크로드에 적합하지 않으며, **반드시 튜닝이 필요**하다.
- Telemetry 샘플링 비율 조정만으로도 상당한 성능 개선을 얻을 수 있다.

> 공식 문서: [Istio Performance and Scalability](https://istio.io/latest/docs/ops/deployment/performance-and-scalability/)

---

## 3. Monzo의 마이크로서비스 간 mTLS 구현

- **출처:** [Securing Microservices with mTLS](https://monzo.com/blog/we-built-network-isolation-for-1-500-services)
- **저자/출처:** Monzo Engineering Team
- **플랫폼:** Monzo Engineering Blog

### 3.1 상황

Monzo는 영국의 디지털 뱅킹 서비스로서 수백 개의 마이크로서비스 간 통신에 대한 엄격한 보안 요구사항이 있었다. 금융 규제(FCA, Financial Conduct Authority) 준수를 위해 서비스 간 통신의 암호화(encryption in transit)와 상호 인증(mutual authentication)이 필수적이었다. 개별 서비스 개발팀에 TLS 구현을 맡기는 것은 비현실적이었다. 각 팀의 보안 구현 수준이 제각각이 되면 전체 시스템의 보안 수준은 가장 약한 서비스에 의해 결정되기 때문이다. Zero Trust 네트워크 모델을 지향하며, 네트워크 경계가 아닌 서비스 ID 기반의 인증/인가를 목표로 했다.

### 3.2 문제

초기에는 각 서비스에서 개별적으로 TLS를 구현했으나 여러 문제가 발생했다.

**인증서 관리의 복잡성**이 가장 큰 문제였다. 수백 개 서비스 각각에 대해 인증서를 발급하고, 갱신 주기를 추적하며, 만료 전에 교체하는 작업이 수동으로 이루어지고 있었다. 인증서 만료로 인한 서비스 장애가 반복되었다. TLS 인증서의 기본 유효 기간이 1년인 경우, 1년마다 모든 서비스의 인증서를 교체해야 했으며 이 과정에서 누락이 발생했다.

서비스별로 **TLS 설정이 불일치**하는 문제도 있었다. 어떤 서비스는 TLS 1.2만 지원하고, 어떤 서비스는 TLS 1.3을 지원하며, 암호 스위트(cipher suite) 설정도 서비스마다 달랐다. 이로 인해 서비스 간 호환성 문제가 간헐적으로 발생했다.

또한 **통신 가시성 부족**도 심각했다. 어떤 서비스가 어떤 서비스와 통신하는지, 어떤 통신이 암호화되어 있고 어떤 것이 평문(plaintext)인지 파악하기 어려웠다.

### 3.3 해결

서비스 메시를 통해 mTLS를 인프라 레벨에서 투명하게(transparently) 적용했다. 애플리케이션 코드의 수정 없이 모든 서비스 간 통신이 자동으로 암호화되고 상호 인증이 이루어지도록 구성했다.

인증서 발급과 갱신을 자동화했다. Istio는 내부적으로 citadel(현재 istiod에 통합)을 통해 SPIFFE(Secure Production Identity Framework for Everyone) 기반의 서비스 ID를 발급한다. 각 워크로드는 `spiffe://<trust-domain>/ns/<namespace>/sa/<service-account>` 형식의 SVID(SPIFFE Verifiable Identity Document)를 부여받으며, 인증서는 기본적으로 24시간마다 자동 갱신된다.

mTLS 모드를 **단계적으로 적용**했다. 먼저 `PERMISSIVE` 모드로 시작하여 비-메시 서비스와의 호환성을 유지하면서 점진적으로 `STRICT` 모드로 전환했다.

```yaml
# 1단계: PERMISSIVE (mTLS 가능하면 사용, 평문도 허용)
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system  # 메시 전체 적용
spec:
  mtls:
    mode: PERMISSIVE
---
# 2단계: 네임스페이스별 STRICT 전환
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: payments  # 결제 네임스페이스부터 적용
spec:
  mtls:
    mode: STRICT
```

서비스 ID 기반의 인가(authorization) 정책을 `AuthorizationPolicy` 리소스로 선언적으로 관리했다. "기본 거부(deny-by-default)" 원칙을 적용하여, 명시적으로 허용된 통신만 가능하도록 구성했다.

```yaml
# 기본 거부 정책
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: deny-all
  namespace: payments
spec:
  {}  # 규칙이 없으면 모든 트래픽 거부
---
# 특정 서비스만 허용
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: allow-payment-processor
  namespace: payments
spec:
  action: ALLOW
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/orders/sa/order-service"]
      to:
        - operation:
            methods: ["POST"]
            paths: ["/api/v1/payments"]
```

### 3.4 주요 교훈

- mTLS 적용 시 **PERMISSIVE에서 STRICT로의 점진적 전환**이 핵심이다. 한 번에 STRICT로 전환하면 비-메시 서비스와의 통신이 즉시 차단된다.
- 인증서 자동 갱신 메커니즘 없이 mTLS를 운영하면 인증서 만료로 인한 대규모 장애가 발생할 수 있다.
- `AuthorizationPolicy`는 "기본 거부(deny-by-default)" 원칙으로 설계하는 것이 보안 측면에서 바람직하다.
- SPIFFE 기반의 서비스 ID는 IP 주소 기반 인증보다 Kubernetes 환경에서 훨씬 안정적이다. Pod IP는 언제든 변경될 수 있기 때문이다.

> 공식 문서: [Istio Security - Mutual TLS](https://istio.io/latest/docs/concepts/security/#mutual-tls-authentication)

---

## 4. Wealthsimple의 Service Mesh 마이그레이션

- **출처:** [The Journey to Service Mesh at Wealthsimple](https://medium.com/wealthsimple/the-journey-to-service-mesh-at-wealthsimple-79c52bff8a04)
- **저자/출처:** Wealthsimple Engineering Team
- **플랫폼:** Medium (Wealthsimple Engineering)

### 4.1 상황

Wealthsimple은 캐나다의 핀테크 기업으로서 Kubernetes에서 다수의 마이크로서비스를 운영하고 있었다. 서비스 수가 증가하면서 트래픽 라우팅, 장애 격리(fault isolation), 관측성에 대한 표준화된 접근 방식이 필요해졌다. 각 팀이 개별적으로 retry, timeout, circuit breaker 등을 애플리케이션 코드 내에 구현하고 있어 일관성이 부족했다. Ruby on Rails, Go, Elixir 등 다양한 기술 스택을 사용하고 있어 공통 라이브러리 접근도 한계가 있었다. gRPC를 서비스 간 통신 프로토콜로 채택하고 있었기 때문에 HTTP/2 기반의 long-lived connection 관리도 중요한 요구사항이었다.

### 4.2 문제

Istio 마이그레이션 과정에서 여러 도전이 있었다.

**gRPC 연결 끊김 문제**가 가장 까다로웠다. gRPC는 HTTP/2 기반으로 하나의 TCP 연결을 장시간 유지하면서 여러 스트림을 멀티플렉싱한다. Envoy sidecar를 주입하면 이 long-lived connection이 Envoy를 통해 프록시되는데, Envoy의 기본 idle timeout 설정이 gRPC의 장시간 유지 연결과 충돌하여 연결이 예기치 않게 끊어지는 현상이 발생했다. 이로 인해 gRPC 클라이언트에서 `UNAVAILABLE` 또는 `INTERNAL` 상태 코드를 수신하는 오류가 빈번했다.

**Kubernetes NetworkPolicy와 Istio AuthorizationPolicy 간의 충돌**도 문제였다. 기존에 NetworkPolicy로 네트워크 접근 제어를 하고 있었는데, Istio를 도입하면서 AuthorizationPolicy가 추가되었다. 두 정책이 서로 다른 레이어(L3/L4 vs L7)에서 동작하기 때문에 트래픽이 차단될 때 어느 정책에 의한 것인지 디버깅하기 매우 어려웠다.

**Istio의 학습 곡선**도 팀 전체의 도입 속도를 저하시키는 요인이었다. VirtualService, DestinationRule, Gateway, PeerAuthentication, AuthorizationPolicy 등 Istio 고유의 CRD(Custom Resource Definition)가 많아 개발팀이 이를 이해하고 활용하는 데 상당한 시간이 필요했다.

### 4.3 해결

**네임스페이스 단위로 점진적 마이그레이션 전략**을 채택했다. 비주요(non-critical) 서비스의 네임스페이스부터 sidecar 주입을 활성화하여 영향을 검증한 후, 주요 서비스로 확대했다. 각 네임스페이스 전환 시 충분한 소크 테스트(soak test) 기간을 두었다.

gRPC 연결 문제는 Envoy의 `idleTimeout`과 `maxConnectionDuration`을 명시적으로 설정하여 해결했다.

```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: grpc-service-dr
spec:
  host: grpc-service.default.svc.cluster.local
  trafficPolicy:
    connectionPool:
      http:
        h2UpgradePolicy: DEFAULT
        idleTimeout: 3600s          # 1시간으로 설정
        maxRequestsPerConnection: 0  # 무제한
      tcp:
        maxConnections: 1024
        connectTimeout: 10s
        tcpKeepalive:
          time: 7200s
          interval: 75s
```

`idleTimeout`을 충분히 길게 설정하여 gRPC의 장시간 유지 연결이 불필요하게 끊어지는 것을 방지했다. `tcpKeepalive` 설정을 추가하여 유휴 연결이 중간 로드밸런서에 의해 끊어지는 것도 방지했다.

NetworkPolicy와 AuthorizationPolicy의 중복을 정리하고, **Istio AuthorizationPolicy로 통합**하는 방향으로 진행했다. L7 레벨에서의 세밀한 접근 제어가 가능한 AuthorizationPolicy가 NetworkPolicy보다 표현력이 풍부하기 때문이다. 다만 Istio sidecar가 주입되지 않은 워크로드가 있는 네임스페이스에서는 NetworkPolicy를 유지했다.

### 4.4 주요 교훈

- 서비스 메시 마이그레이션은 "빅뱅" 방식이 아닌 **네임스페이스/서비스 단위의 점진적 롤아웃**이 안전하다.
- gRPC와 Envoy 조합에서는 연결 관리 설정을 명시적으로 구성해야 한다. 기본값으로는 장시간 유지되는 gRPC 스트림에서 문제가 발생한다.
- Kubernetes NetworkPolicy와 Istio AuthorizationPolicy를 동시에 사용하면 디버깅이 매우 어려워지므로, **한쪽으로 통합**하는 것이 바람직하다.
- 서비스 메시 도입 시 개발팀 대상 교육과 문서화에 충분한 투자가 필요하다. 인프라팀만의 도구가 되면 도입 효과가 반감된다.

> 공식 문서: [Istio Traffic Management](https://istio.io/latest/docs/concepts/traffic-management/)

---

## 5. Intuit의 대규모 Istio 운영 경험

- **출처:** [Service Mesh at Scale: Lessons from Intuit](https://stackoverflow.blog/2023/01/18/how-intuit-improves-security-latency-and-development-velocity-with-a-service-mesh/)
- **저자/출처:** Intuit Engineering Team
- **플랫폼:** Intuit Technology Blog

### 5.1 상황

Intuit(TurboTax, QuickBooks, Mint 등)은 수천 개의 마이크로서비스를 다수의 Kubernetes 클러스터에서 운영하는 대규모 환경이었다. 특히 미국 세금 신고 시즌(1~4월)에는 트래픽이 평소 대비 수십 배로 급증하는 특성이 있어, 서비스 간 트래픽 관리와 관측성이 주요 과제였다. Istio를 도입하여 카나리 배포, 트래픽 미러링, 서킷 브레이커 등을 플랫폼 레벨에서 표준화하고자 했다. 이 규모에서의 서비스 메시 운영은 소규모 환경과는 근본적으로 다른 도전을 수반했다.

### 5.2 문제

대규모 환경에서 **istiod 컨트롤 플레인의 xDS 성능이 병목**이 되었다. xDS(x Discovery Service)는 Envoy가 istiod로부터 설정을 수신하는 프로토콜인데, 수천 개의 서비스에 대한 CDS(Cluster Discovery Service), EDS(Endpoint Discovery Service), LDS(Listener Discovery Service), RDS(Route Discovery Service) 설정을 모든 sidecar에 배포해야 한다. 이 과정에서 istiod의 CPU/메모리 사용량이 급증하고, 설정 전파 지연(config propagation delay)이 수십 초에서 수 분까지 발생했다.

**Envoy sidecar가 모든 서비스의 설정을 수신**하면서 sidecar 자체의 메모리 사용량도 심각한 문제가 되었다. 기본적으로 각 Envoy는 메시 내 모든 서비스에 대한 클러스터, 엔드포인트, 라우트 정보를 보유한다. 수천 개의 서비스가 존재하는 환경에서는 이 설정 데이터만으로도 sidecar당 수백 MB의 메모리를 소비할 수 있다.

세금 시즌의 **트래픽 급증 시 기존 설정으로는 안정성을 보장**하기 어려웠다. 특정 서비스에 트래픽이 집중되면 연쇄적으로 다른 서비스에 영향을 미치는 cascading failure가 발생할 수 있었다.

### 5.3 해결

**`Sidecar` 리소스를 활용하여 xDS 범위를 제한**했다. 각 워크로드가 실제로 통신하는 서비스의 설정만 수신하도록 구성하여, sidecar당 메모리 사용량을 크게 줄이고 xDS 설정 전파 시간도 단축했다.

```yaml
apiVersion: networking.istio.io/v1beta1
kind: Sidecar
metadata:
  name: default
  namespace: tax-processing
spec:
  egress:
    - hosts:
        - "istio-system/*"           # Istio 시스템 서비스
        - "tax-processing/*"          # 같은 네임스페이스
        - "payment-service/*"         # 실제 통신하는 서비스만
        - "user-service/*"
  outboundTrafficPolicy:
    mode: REGISTRY_ONLY  # 등록된 서비스만 접근 허용
```

이 설정을 적용하면 `tax-processing` 네임스페이스의 sidecar는 명시된 서비스의 설정만 수신한다. 수천 개의 서비스 설정을 모두 수신하던 것에 비해 메모리 사용량이 수십 분의 1로 감소한다.

istiod를 **수평 확장(HPA)**하여 증가하는 sidecar 연결을 처리했다.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: istiod
  namespace: istio-system
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: istiod
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
```

멀티 클러스터 환경에서는 **클러스터별 독립적인 컨트롤 플레인**을 운영하는 전략을 채택했다. 공유 컨트롤 플레인 모델 대신 각 클러스터가 자체 istiod를 운영하되, 크로스 클러스터 통신이 필요한 경우에만 east-west gateway를 통해 연결하는 방식이다.

트래픽 급증 시나리오에 대비하여 서킷 브레이커와 rate limiting을 적극 활용했다.

```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: tax-service-dr
spec:
  host: tax-service
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 500
      http:
        http1MaxPendingRequests: 100
        http2MaxRequests: 500
    outlierDetection:
      consecutive5xxErrors: 3
      interval: 5s
      baseEjectionTime: 15s
      maxEjectionPercent: 30
```

### 5.4 주요 교훈

- 대규모 환경에서는 `Sidecar` 리소스를 **반드시** 사용해야 한다. 미사용 시 모든 sidecar가 전체 메시의 설정을 수신하여 심각한 리소스 낭비가 발생한다.
- istiod의 수평 확장은 가능하지만, xDS 프로토콜 특성상 연결된 sidecar 수에 비례하여 리소스가 증가하므로 **클러스터 분할도 함께 고려**해야 한다.
- 세금 시즌 같은 트래픽 급증 시나리오에서는 서비스 메시의 rate limiting과 circuit breaker가 시스템 안정성에 크게 기여했다.
- `outboundTrafficPolicy: REGISTRY_ONLY`는 보안 측면에서도 유리하다. 등록되지 않은 외부 서비스로의 통신을 차단할 수 있기 때문이다.

> 공식 문서: [Istio Sidecar Configuration](https://istio.io/latest/docs/reference/config/networking/sidecar/)

---

## 종합 정리

### 성능 관련 수치

| 항목 | 수치/사실 |
|------|-----------|
| 레이턴시 오버헤드 | P99 기준 약 8~10ms 증가 (서비스 간 홉당) |
| Sidecar 메모리 | Pod당 약 40~60MB 추가 (워크로드에 따라 변동) |
| 대규모 환경 메모리 | `Sidecar` 리소스 미사용 시 수백 MB까지 증가 가능 |

### 운영 Best Practices

1. **Sidecar 라이프사이클**: `holdApplicationUntilProxyStarts`를 프로덕션에서 활성화한다.
2. **점진적 전환**: PERMISSIVE에서 STRICT mTLS로, 네임스페이스 단위로 롤아웃한다.
3. **리소스 튜닝**: Sidecar resource request/limit, connection pool 설정은 필수 튜닝 대상이다.
4. **대규모 환경**: `Sidecar` 리소스로 xDS 범위를 제한하고, istiod HPA를 적용한다.
5. **업그레이드**: Revision-based 카나리 업그레이드 전략을 채택한다.
6. **정책 통합**: NetworkPolicy와 AuthorizationPolicy를 혼용하지 않고 한쪽으로 통합한다.

### 자주 발생하는 문제와 해결

| 문제 | 원인 | 해결 |
|------|------|------|
| Pod CrashLoopBackOff | Sidecar보다 앱이 먼저 시작 | `holdApplicationUntilProxyStarts: true` |
| 503 Upstream Connection Failure | Connection pool 기본값 부적합 | DestinationRule에서 connectionPool 튜닝 |
| gRPC 연결 끊김 | Envoy idle timeout과 gRPC long-lived connection 충돌 | `idleTimeout`, `maxConnectionDuration` 설정 |
| Sidecar 메모리 폭증 (대규모) | 전체 메시 설정 수신 | `Sidecar` 리소스로 egress 범위 제한 |
| mTLS 전환 시 통신 차단 | 비-메시 서비스와 STRICT 모드 충돌 | PERMISSIVE에서 STRICT로 점진적 전환 |
| 정책 디버깅 어려움 | NetworkPolicy + AuthorizationPolicy 혼용 | 한쪽으로 통합 |

---

> **참고:** 위 사례들은 각 기업의 공개 엔지니어링 블로그에서 발표된 내용을 기반으로 작성되었다. Istio 버전에 따라 세부 동작이 다를 수 있으므로, 현재 사용 중인 버전의 공식 문서를 함께 참고할 것을 권장한다.
>
> - [Istio 공식 문서](https://istio.io/latest/docs/)
> - [Envoy Proxy 공식 문서](https://www.envoyproxy.io/docs/)
