---
title: "Part 8: Ingress와 NetworkPolicy - 고급 네트워킹"
date: 2026-01-09
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, Ingress, NetworkPolicy, CNI]
layout: post
toc: true
math: true
mermaid: true
---

# Part 8: 고급 네트워킹

## 21. Ingress

### 21.1 Ingress 개념

**정의:**

Ingress는 **HTTP/HTTPS 기반 외부 접근을 제공**하는 API 객체이다.

**특징:**

- URL 경로에 따른 라우팅
- 호스트명에 따른 라우팅
- TLS/SSL 종료
- 로드 밸런싱

```
Internet
   ↓
┌──────────────────────────┐
│   Ingress Controller     │  (Nginx, Traefik 등)
└──────────────────────────┘
   ↓ 라우팅
┌──────────────────────────────────────────────┐
│ example.com/api  → api-service              │
│ example.com/web  → web-service              │
│ api.example.com  → api-service              │
└──────────────────────────────────────────────┘
```

### 21.2 Ingress Controller (Nginx, Traefik, HAProxy)

**Ingress Controller의 역할:**

Ingress Controller는 Ingress 리소스를 모니터링하고 실제 트래픽 라우팅을 수행하는 컨트롤러이다. Ingress 리소스는 단순히 선언적 구성일 뿐이며, Ingress Controller가 이를 읽고 실제 로드 밸런서/프록시 설정을 동적으로 구성한다.

**동작 원리:**

```
1. Ingress 리소스 생성/수정
   ↓
2. Ingress Controller가 Kubernetes API 감시
   ↓
3. 변경 사항 감지 및 내부 구성 업데이트
   ↓
4. 프록시 설정 파일 재생성 (예: Nginx config)
   ↓
5. 프록시 프로세스 리로드 (다운타임 없이)
   ↓
6. 새로운 라우팅 규칙 적용
```

**구성 요소:**

1. **Ingress Controller Pod**: 실제 프록시 서버 (Nginx, Traefik 등)
2. **Service (LoadBalancer/NodePort)**: 외부 트래픽 진입점
3. **ConfigMap**: 전역 설정 (타임아웃, 버퍼 크기 등)
4. **RBAC**: Ingress 리소스를 읽을 권한

**설치 (Nginx):**

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml
```

설치 확인:

```bash
# Ingress Controller Pod 확인
kubectl get pods -n ingress-nginx

# Ingress Controller Service 확인 (LoadBalancer IP)
kubectl get svc -n ingress-nginx
```

**주요 Ingress Controller 비교:**

| 특성           | Nginx           | Traefik            | HAProxy | Istio Gateway     |
|--------------|-----------------|--------------------|---------|-------------------|
| **성능**       | 매우 높음           | 높음                 | 매우 높음   | 높음                |
| **설정 복잡도**   | 중간              | 낮음                 | 높음      | 높음                |
| **동적 구성**    | 부분 지원           | 완전 지원              | 제한적     | 완전 지원             |
| **자동 HTTPS** | Cert-Manager 필요 | 내장 (Let's Encrypt) | 별도 도구   | Cert-Manager 통합   |
| **모니터링**     | Prometheus 통합   | 내장 대시보드            | 별도 설정   | Kiali, Grafana 통합 |
| **웹소켓**      | 지원              | 지원                 | 지원      | 지원                |
| **gRPC**     | 지원              | 지원                 | 제한적     | 완전 지원             |
| **커뮤니티**     | 매우 활발           | 활발                 | 활발      | 매우 활발             |
| **사용 사례**    | 범용, 프로덕션        | 중소규모, 간편함          | 고성능 요구  | Service Mesh      |

**Nginx Ingress Controller:**

- 가장 널리 사용되는 컨트롤러
- 높은 성능과 안정성
- 다양한 어노테이션으로 세밀한 제어
- 예제:
  ```yaml
  apiVersion: networking.k8s.io/v1
  kind: Ingress
  metadata:
    name: nginx-example
    annotations:
      nginx.ingress.kubernetes.io/rewrite-target: /
      nginx.ingress.kubernetes.io/ssl-redirect: "true"
      nginx.ingress.kubernetes.io/rate-limit: "100"
  spec:
    ingressClassName: nginx
    rules:
      - host: example.com
        http:
          paths:
            - path: /api
              pathType: Prefix
              backend:
                service:
                  name: api-service
                  port:
                    number: 8080
  ```

**Traefik:**

- 동적 구성 자동화
- Let's Encrypt 자동 인증서 발급
- 사용하기 쉬운 대시보드
- Docker, Kubernetes 네이티브 지원

**HAProxy:**

- 매우 높은 성능
- 복잡한 트래픽 제어
- 엔터프라이즈급 기능
- 세밀한 로드 밸런싱 알고리즘

**Istio Gateway:**

- Service Mesh 통합
- 고급 트래픽 관리 (카나리 배포, A/B 테스팅)
- 강력한 보안 기능 (mTLS)
- 분산 추적 및 관찰성

### 21.3 경로 기반 라우팅

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: path-based
spec:
  ingressClassName: nginx
  rules:
    - host: example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api-service
                port:
                  number: 8080
          - path: /web
            pathType: Prefix
            backend:
              service:
                name: web-service
                port:
                  number: 80
```

### 21.4 호스트 기반 라우팅

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: host-based
spec:
  ingressClassName: nginx
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api-service
                port:
                  number: 8080
    - host: web.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web-service
                port:
                  number: 80
```

### 21.5 TLS/SSL 설정

**Secret 생성:**

```bash
kubectl create secret tls tls-secret \
  --cert=path/to/tls.crt \
  --key=path/to/tls.key
```

**Ingress에 TLS 적용:**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: tls-ingress
spec:
  tls:
    - hosts:
        - example.com
      secretName: tls-secret
  rules:
    - host: example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: myapp
                port:
                  number: 80
```

### 21.6 Cert-Manager (자동 인증서 발급)

**설치:**

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
```

**Let's Encrypt ClusterIssuer:**

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
    - hosts:
        - example.com
      secretName: example-tls
  rules:
    - host: example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: myapp
                port:
                  number: 80
```

---

## 22. NetworkPolicy

### 22.1 NetworkPolicy 개념

**정의:**

NetworkPolicy는 **Pod 간의 네트워크 트래픽을 제어**하는 방화벽 규칙이다. OSI 모델의 Layer 3/4 수준에서 IP 주소와 포트를 기반으로 트래픽을 필터링한다.

**특징:**

- **Ingress (수신) 제어**: Pod로 들어오는 트래픽 제어
- **Egress (송신) 제어**: Pod에서 나가는 트래픽 제어
- **Label 기반 선택**: Pod, Namespace, IP 블록 기반 규칙
- **화이트리스트 방식**: 명시적으로 허용된 트래픽만 통과
- **CNI 플러그인 의존**: Calico, Cilium, Weave 등 NetworkPolicy를 지원하는 CNI 필요

**기본 규칙:**

- **정책이 없으면**: 모든 트래픽 허용 (기본 허용)
- **정책이 있으면**: 명시된 트래픽만 허용 (나머지 차단)
- **다중 정책**: OR 조건으로 결합 (하나라도 허용하면 통과)

**동작 원리:**

1. **podSelector로 대상 Pod 선택**: 어떤 Pod에 정책을 적용할지 결정
2. **policyTypes 지정**: Ingress, Egress 또는 둘 다 제어
3. **규칙 정의**:
  - Ingress: 어떤 소스에서 오는 트래픽을 허용할지
  - Egress: 어떤 목적지로 가는 트래픽을 허용할지
4. **CNI 플러그인이 실제 방화벽 규칙 적용**: iptables, eBPF 등 사용

**주의사항:**

- Flannel은 NetworkPolicy를 지원하지 않음
- 정책 적용 시 기존 연결은 유지될 수 있음 (stateful)
- DNS 트래픽도 명시적으로 허용해야 함

### 22.2 Ingress 제어

**Ingress 규칙**은 Pod로 들어오는 트래픽을 제어한다.

**기본 예제:**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-frontend
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: backend  # 이 정책이 적용될 대상 Pod
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:  # 같은 Namespace의 frontend Pod만 허용
            matchLabels:
              app: frontend
      ports:
        - protocol: TCP
          port: 8080
```

**세부 규칙 옵션:**

1. **podSelector**: 같은 Namespace의 특정 Pod에서만 허용

```yaml
from:
  - podSelector:
      matchLabels:
        role: frontend
```

2. **namespaceSelector**: 특정 Namespace의 모든 Pod에서 허용

```yaml
from:
  - namespaceSelector:
      matchLabels:
        environment: production
```

3. **podSelector + namespaceSelector**: 특정 Namespace의 특정 Pod에서만 허용 (AND 조건)

```yaml
from:
  - namespaceSelector:
      matchLabels:
        environment: production
    podSelector:
      matchLabels:
        role: frontend
```

4. **여러 소스 허용** (OR 조건):

```yaml
from:
  - podSelector:  # 같은 Namespace의 frontend OR
      matchLabels:
        role: frontend
  - namespaceSelector:  # monitoring Namespace의 모든 Pod
      matchLabels:
        name: monitoring
```

5. **IP 블록 기반 허용**:

```yaml
from:
  - ipBlock:
      cidr: 192.168.1.0/24
      except:
        - 192.168.1.5/32
```

**복합 예제:**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-ingress-policy
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Ingress
  ingress:
    # 규칙 1: 같은 Namespace의 web Pod에서 8080 포트 허용
    - from:
        - podSelector:
            matchLabels:
              app: web
      ports:
        - protocol: TCP
          port: 8080
    # 규칙 2: monitoring Namespace에서 9090 포트 허용 (메트릭)
    - from:
        - namespaceSelector:
            matchLabels:
              name: monitoring
      ports:
        - protocol: TCP
          port: 9090
    # 규칙 3: 특정 IP 대역에서 443 포트 허용
    - from:
        - ipBlock:
            cidr: 10.0.0.0/8
      ports:
        - protocol: TCP
          port: 443
```

### 22.3 Egress 제어

**Egress 규칙**은 Pod에서 나가는 트래픽을 제어한다.

**기본 예제:**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-external-egress
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
    - Egress
  egress:
    # 규칙 1: 같은 Namespace의 database Pod으로만 허용
    - to:
        - podSelector:
            matchLabels:
              app: database
      ports:
        - protocol: TCP
          port: 5432
    # 규칙 2: DNS 허용 (필수!)
    - to:
        - namespaceSelector:
            matchLabels:
              name: kube-system
        - podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
```

**DNS 허용이 중요한 이유:**

Egress 정책을 적용하면 DNS 조회도 차단되므로, 명시적으로 DNS 트래픽을 허용해야 한다.

**간단한 DNS 허용 방법:**

```yaml
egress:
  # 모든 Namespace로 UDP 53 포트 허용 (DNS)
  - ports:
      - protocol: UDP
        port: 53
```

**외부 API 접근 허용:**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-external-api
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
    - Egress
  egress:
    # DNS 허용
    - ports:
        - protocol: UDP
          port: 53
    # 외부 API 접근 허용 (HTTPS)
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 169.254.169.254/32  # AWS 메타데이터 차단
      ports:
        - protocol: TCP
          port: 443
```

### 22.4 정책 예제

**CKA Mock Exam 핵심 팁:**

1. **podSelector 이해**: NetworkPolicy가 적용될 대상 Pod 선택
2. **policyTypes 명시**: Ingress, Egress 또는 둘 다 지정
3. **from/to 구조**: podSelector, namespaceSelector, ipBlock 조합
4. **ports 정의**: protocol과 port 명시
5. **DNS 허용 필수**: Egress 정책 시 UDP 53 포트 허용 필수

**1. 모든 트래픽 차단 (기본 거부 정책):**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: default
spec:
  podSelector: {}  # 모든 Pod에 적용
  policyTypes:
    - Ingress
    - Egress
```

이 정책을 적용하면 해당 Namespace의 모든 Pod는 명시적으로 허용된 트래픽만 송수신 가능하다.

**CKA Mock Exam - Q.6 (NetworkPolicy Ingress):**

```bash
# 문제: np-test-1 Pod로의 Ingress 트래픽이 작동하지 않음.
# NetworkPolicy를 생성하여 port 80으로의 Ingress 허용

# 1. Pod 레이블 확인
kubectl get pod np-test-1 --show-labels

# 2. NetworkPolicy 생성
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ingress-to-nptest
  namespace: default
spec:
  podSelector:
    matchLabels:
      run: np-test-1
  policyTypes:
    - Ingress
  ingress:
    - ports:
        - protocol: TCP
          port: 80
EOF

# 3. 테스트
kubectl run test --image=busybox --rm -it -- wget -O- http://np-test-service
```

**CKA Mock Exam - Q.11 (가장 제한적인 정책 선택):**

```bash
# 문제: frontend namespace에서 backend namespace로의 접근만 허용,
# databases namespace에서의 접근은 차단

# 가장 제한적인 정책 (정확한 정책)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-frontend
  namespace: backend
spec:
  podSelector: {}  # backend namespace의 모든 Pod
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: frontend  # frontend namespace만 허용
      # databases namespace는 명시되지 않았으므로 차단됨
```

**2. Ingress만 차단:**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
spec:
  podSelector: {}
  policyTypes:
    - Ingress
```

**3. Egress만 차단:**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-egress
spec:
  podSelector: {}
  policyTypes:
    - Egress
```

**4. 3-Tier 애플리케이션 정책:**

```yaml
# Frontend: 외부 접근 허용, Backend만 접근 가능
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: frontend-policy
spec:
  podSelector:
    matchLabels:
      tier: frontend
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - ipBlock:
            cidr: 0.0.0.0/0  # 모든 외부 접근 허용
      ports:
        - protocol: TCP
          port: 80
  egress:
    - to:
        - podSelector:
            matchLabels:
              tier: backend
      ports:
        - protocol: TCP
          port: 8080
    - ports:  # DNS
        - protocol: UDP
          port: 53
---
# Backend: Frontend에서만 접근, Database만 접근 가능
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-policy
spec:
  podSelector:
    matchLabels:
      tier: backend
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              tier: frontend
      ports:
        - protocol: TCP
          port: 8080
  egress:
    - to:
        - podSelector:
            matchLabels:
              tier: database
      ports:
        - protocol: TCP
          port: 5432
    - ports:  # DNS
        - protocol: UDP
          port: 53
---
# Database: Backend에서만 접근, 외부 접근 없음
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: database-policy
spec:
  podSelector:
    matchLabels:
      tier: database
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              tier: backend
      ports:
        - protocol: TCP
          port: 5432
  egress:
    - ports:  # DNS만 허용
        - protocol: UDP
          port: 53
```

**5. Namespace 격리:**

```yaml
# production Namespace는 다른 Namespace에서 접근 불가
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: namespace-isolation
  namespace: production
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector: {}  # 같은 Namespace의 Pod만 허용
```

**6. 특정 포트만 허용:**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-http-https
spec:
  podSelector:
    matchLabels:
      app: web
  policyTypes:
    - Ingress
  ingress:
    - ports:
        - protocol: TCP
          port: 80
        - protocol: TCP
          port: 443
      # from 없음 = 모든 소스 허용
```

**정책 우선순위와 결합:**

- 여러 NetworkPolicy가 같은 Pod에 적용될 수 있음
- 정책들은 **OR 조건**으로 결합됨 (하나라도 허용하면 통과)
- 예: Policy A가 frontend 허용, Policy B가 monitoring 허용 → 둘 다 허용됨

---

## 23. CNI (Container Network Interface)

### 23.1 CNI 플러그인 역할

**정의:**

CNI는 **Pod 간 네트워킹을 제공하는 플러그인 아키텍처**이다.

**책임:**

- Pod에 IP 주소 할당
- Pod 간 통신 제공
- 네트워크 정책 구현

### 23.2 Calico

**개요:**

- **프로토콜**: BGP, IPIP, VXLAN
- **성능**: 매우 높음
- **기능**: NetworkPolicy 지원, 네트워크 정책 강화

**특징:**

**BGP 모드 (기본):**

```
Pod1 → Router → Network → Router → Pod2
```

- 직접 라우팅
- 최고 성능
- 특정 네트워크 환경 필요

**IPIP 모드:**

```
Pod1 → [IP in IP 터널] → Pod2
```

- 모든 네트워크에서 작동
- 약간의 성능 오버헤드

**설치:**

```bash
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.26.1/manifests/tigera-operator.yaml
```

### 23.3 Flannel

**개요:**

- **프로토콜**: VXLAN, Host-GW, UDP
- **단순성**: 설정 간단
- **성능**: 중간 수준

**특징:**

**VXLAN 모드:**

```
Pod1 → VXLAN 터널 → Pod2
```

- 가장 호환성 높음
- 모든 네트워크에서 작동

**Host-GW 모드:**

```
Pod1 → 호스트 라우팅 → Pod2
```

- 높은 성능
- 같은 네트워크 세그먼트에서만 작동

**설치:**

```bash
kubectl apply -f https://raw.githubusercontent.com/coreos/flannel/master/Documentation/kube-flannel.yml
```

### 23.4 Cilium

**개요:**

- **프로토콜**: eBPF 기반
- **성능**: 매우 높음
- **기능**: 고급 보안, 성능 모니터링

**특징:**

**eBPF (Extended Berkeley Packet Filter):**

- 커널 수준에서 동작
- 매우 높은 성능
- 실시간 모니터링

**고급 기능:**

- L7 트래픽 정책
- 마이크로세그먼테이션
- 서비스 메시 기능

**설치:**

```bash
helm repo add cilium https://helm.cilium.io
helm install cilium cilium/cilium --namespace kube-system
```

### 23.5 Weave

**개요:**

- **프로토콜**: VXLAN, 암호화
- **특징**: 자동 발견, 암호화 지원
- **용도**: 간단한 배포, 보안 요구 환경

### 23.6 CNI 비교

| 특성                | Calico | Flannel | Cilium | Weave |
|-------------------|--------|---------|--------|-------|
| **성능**            | 높음     | 중간      | 매우 높음  | 중간    |
| **NetworkPolicy** | 지원     | 미지원     | 지원     | 지원    |
| **설정 난이도**        | 중간     | 낮음      | 높음     | 낮음    |
| **확장성**           | 매우 높음  | 높음      | 매우 높음  | 중간    |
| **암호화**           | 선택     | 선택      | 지원     | 기본    |
| **모니터링**          | 기본     | 기본      | 고급     | 기본    |
| **대규모 클러스터**      | 추천     | 가능      | 추천     | 소규모   |
| **커뮤니티**          | 매우 활발  | 활발      | 매우 활발  | 활발    |

---

## 학습 정리

### 핵심 개념

1. **Ingress**는 HTTP/HTTPS 기반 L7 라우팅 제공
2. **NetworkPolicy**로 Pod 간 트래픽 제어 (Ingress/Egress)
3. **CNI 플러그인**이 Pod 네트워킹 구현 (Calico, Flannel, Cilium, Weave)
4. **Cert-Manager**로 TLS 인증서 자동 발급/갱신

### 다음 단계

- Ingress를 이용한 L7 라우팅 이해
- NetworkPolicy로 네트워크 보안 제어
- CNI 플러그인 비교 및 선택 기준 파악
- 보안 학습 → **[Part 9로 이동](/posts/kubernetes-10-rbac-serviceaccount)**

---

## 실습 과제

1. **Ingress 설정**

```bash
# Nginx Ingress Controller 설치
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml

# 서비스 생성
kubectl create deployment web --image=nginx
kubectl expose deployment web --port=80

# Ingress 생성
kubectl apply -f ingress.yaml

# 확인
kubectl get ingress
```

2. **NetworkPolicy 실습**

```bash
# Backend Pod 생성
kubectl run backend --image=nginx --labels=app=backend

# Frontend Pod 생성
kubectl run frontend --image=nginx --labels=app=frontend

# NetworkPolicy 적용 (backend는 frontend에서만 접근 가능)
kubectl apply -f network-policy.yaml

# 테스트
kubectl exec frontend -- wget -O- http://backend  # 성공
kubectl run test --image=nginx --rm -it -- wget -O- http://backend  # 실패
```

---

## 추가 학습 자료

- [Ingress 공식 문서](https://kubernetes.io/docs/concepts/services-networking/ingress/)
- [NetworkPolicy 공식 문서](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
- [CNI 플러그인 비교](https://kubernetes.io/docs/concepts/cluster-administration/networking/)
- [Cert-Manager 문서](https://cert-manager.io/docs/)

---
