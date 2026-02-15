---
title: "Kubernetes Networking 실무 사례 모음 - DNS, conntrack, gRPC, NetworkPolicy, kube-proxy"
date: 2026-02-15
categories: [DevOps, Kubernetes]
tags: [Kubernetes, Networking, DNS, conntrack, gRPC, NetworkPolicy, kube-proxy, nftables, iptables]
layout: post
toc: true
math: true
mermaid: true
---

Kubernetes 네트워킹은 여러 Linux 커널 서브시스템(iptables, conntrack, TCP 스택, DNS resolver)이 중첩되어 동작하기 때문에, 겉으로 드러나는 증상만으로는 근본 원인을 파악하기 어려운 경우가 많다. 특히 프로덕션 환경에서는 트래픽 규모, 프로토콜 특성, 커널 파라미터 등이 복합적으로 작용하여 개발 환경에서는 전혀 나타나지 않았던 문제들이 불쑥 등장한다.

이 글에서는 실제 엔지니어들이 프로덕션 환경에서 겪은 Kubernetes 네트워킹 사례 5가지를 정리한다. DNS ndots 설정에 의한 쿼리 증폭, conntrack과 kube-proxy 간 상호작용으로 인한 간헐적 연결 리셋, gRPC 로드밸런싱 실패, NetworkPolicy 패킷 드롭 디버깅, 그리고 kube-proxy의 iptables 모드에서 nftables 모드로의 전환까지 다룬다.

---

## 1. DNS ndots:5 기본값이 일으키는 성능 저하

> **출처:** [Kubernetes DNS resolution: ndots options and why it may affect application performances](https://pracucci.com/kubernetes-dns-resolution-ndots-options-and-why-it-may-affect-application-performances.html) - Marco Pracucci

### 1.1 상황

Kubernetes Pod 내부의 `/etc/resolv.conf`에는 기본적으로 `ndots:5` 옵션이 설정되어 있다. 이 값은 도메인 이름에 점(dot)이 5개 미만이면 절대 도메인(FQDN)이 아닌 상대 도메인으로 간주하도록 만든다. 저자는 Kubernetes 1.9 기반 Kops 클러스터에서 트래픽 롤아웃을 진행하던 중 kube-dns와 dnsmasq Pod의 부하가 비정상적으로 높아지는 현상을 관찰했다.

Kubernetes가 생성하는 Pod의 `/etc/resolv.conf`는 다음과 같은 구조를 가진다.

```
nameserver 100.64.0.10
search default.svc.cluster.local svc.cluster.local cluster.local <host-domain>
options ndots:5
```

`nameserver`는 kube-dns Service의 ClusterIP이고, `search` 지시어에는 4개의 search domain이 포함되어 있다. `ndots:5`는 "질의하려는 도메인 이름에 점이 5개 미만이면 FQDN이 아닌 상대 이름으로 취급하라"는 의미이다.

### 1.2 문제

`ndots:5`의 동작 원리를 이해하려면 DNS resolver의 로직을 정확히 알아야 한다. resolver는 질의할 도메인의 점 개수가 `ndots` 값 미만이면, 먼저 search domain 목록을 순회하면서 각각을 접미사로 붙여 질의를 시도한다. 모든 search domain에서 실패한 후에야 비로소 원래 도메인 이름 그대로 질의를 수행한다.

예를 들어, Pod에서 `api.example.com`에 대한 DNS 조회를 수행하면 점이 2개이므로 `ndots:5` 기준에 미달한다. 이때 resolver는 다음 순서로 DNS 쿼리를 발생시킨다.

1. `api.example.com.default.svc.cluster.local` - 실패
2. `api.example.com.svc.cluster.local` - 실패
3. `api.example.com.cluster.local` - 실패
4. `api.example.com.<host-domain>` - 실패
5. `api.example.com` - 성공

하나의 외부 도메인 조회에 대해 **5번의 DNS 쿼리**가 발생한다. 첫 4번은 반드시 실패하는 불필요한 쿼리이다. 각 DNS 조회는 A 레코드와 AAAA 레코드(IPv6)를 함께 질의하므로, 실제로는 **10개의 DNS 패킷**이 네트워크에 발생한다.

TCP 연결이 많은 서비스(예: 외부 API를 빈번하게 호출하는 마이크로서비스)에서는 이 증폭 효과가 심각한 레이턴시 증가와 kube-dns 부하로 직결된다. 저자의 프로덕션 환경에서도 트래픽 증가 시 kube-dns의 쿼리 처리량이 급격히 올라가면서 DNS 응답 지연이 발생했다.

### 1.3 해결

**방법 1: FQDN trailing dot 사용**

외부 호스트명 끝에 점(`.`)을 추가하면 resolver가 해당 이름을 절대 도메인으로 인식하여 search domain 순회를 건너뛴다. 예를 들어, `api.example.com.`으로 질의하면 바로 해당 도메인만 조회한다. 이 방법은 애플리케이션 코드나 설정 파일에서 외부 호스트명을 지정할 때 간단히 적용할 수 있다.

저자의 프로덕션 환경에서 이 변경을 적용한 후, kube-dns 3개 Pod의 합산 쿼리 트래픽이 눈에 띄게 감소했으며 애플리케이션 응답 시간도 개선되었다.

**방법 2: Pod dnsConfig로 ndots 값 변경**

Kubernetes 1.9에서 알파로 도입되고 1.10에서 베타가 된 `dnsConfig` 필드를 사용하면 Pod 수준에서 `ndots` 값을 재정의할 수 있다. `ndots`를 `1`로 설정하면 점이 1개 이상인 도메인(대부분의 외부 도메인)은 바로 절대 도메인으로 처리되어 search domain 순회가 발생하지 않는다.

```yaml
spec:
  dnsConfig:
    options:
      - name: ndots
        value: "1"
```

단, `ndots:1`로 변경하면 클러스터 내부 Service를 짧은 이름(예: `my-service`)으로 호출할 때는 여전히 search domain이 적용되지만, 네임스페이스 간 호출(예: `my-service.other-namespace`)처럼 점이 포함된 이름은 먼저 절대 도메인으로 시도하게 된다. 따라서 내부 Service 호출에도 FQDN(`my-service.other-namespace.svc.cluster.local`)을 사용하는 것이 안전하다.

### 1.4 주요 교훈

- `ndots:5`는 클러스터 내부 Service 간 통신에는 편리하지만, 외부 API를 빈번하게 호출하는 서비스에서는 DNS 쿼리 5배 증폭(A/AAAA 포함 시 10배)이라는 숨겨진 비용을 발생시킨다.
- 프로덕션 환경에서는 워크로드 특성에 따라 `dnsConfig.options`로 `ndots` 값을 튜닝하는 것이 권장된다. 외부 통신이 주를 이루는 Pod라면 `ndots:1`, 내부 통신 위주라면 기본값 유지가 적절하다.
- 외부 도메인에 trailing dot(`.`)을 붙이는 것은 코드 한 줄 수정으로 적용 가능한 가장 간단하면서도 효과적인 최적화 방법이다.
- DNS 성능 문제는 겉으로 네트워크 레이턴시로 나타나기 때문에, DNS 쿼리 패턴을 먼저 의심하지 않으면 진단이 어렵다. kube-dns의 쿼리 메트릭을 모니터링하는 것이 중요하다.

---

## 2. kube-proxy와 conntrack의 상호작용으로 인한 간헐적 Connection Reset

> **출처:** [kube-proxy Subtleties: Debugging an Intermittent Connection Reset](https://kubernetes.io/blog/2019/03/29/kube-proxy-subtleties-debugging-an-intermittent-connection-reset/) - Yongkun Gui (Google), Kubernetes 공식 블로그

### 2.1 상황

사용자들이 ClusterIP Service를 통해 대용량 파일을 다운로드할 때 간헐적으로 연결이 리셋되는 현상을 보고했다. 이 문제는 여러 클라이언트가 병렬로 작업할 때만 재현되었으며, 순차적인 접근이나 Kubernetes 외부의 VM 환경에서는 발생하지 않았다.

이 문제를 이해하려면 먼저 Kubernetes Service의 패킷 흐름을 알아야 한다. kube-proxy는 ClusterIP Service를 iptables 체인으로 구현한다.

```
KUBE-SERVICES (진입점)
  -> 목적지 IP:port 매칭
KUBE-SVC-* (로드밸런서, 엔드포인트에 분배)
  -> 엔드포인트 간 균등 분배
KUBE-SEP-* (Service Endpoint, DNAT 수행)
  -> Service VIP를 실제 Pod IP로 변환
```

Kubernetes에서 트래픽은 크게 세 가지 유형으로 나뉜다. Pod-to-Pod 직접 통신(CNI 플러그인이 처리), Pod-to-External 통신(SNAT 적용), 그리고 Pod-to-Service 통신(DNAT + conntrack)이다. 이번 문제는 세 번째 유형, 즉 DNAT와 conntrack이 관여하는 경로에서 발생했다.

### 2.2 문제

근본 원인은 Linux 커널의 **conntrack**(연결 추적)과 iptables의 복합적인 상호작용에 있었다. 정상적인 패킷 흐름은 다음과 같다.

1. 클라이언트 Pod(`192.168.0.2`)이 Service VIP(`10.0.1.2:80`)로 패킷을 전송한다.
2. iptables의 DNAT 규칙이 목적지를 실제 백엔드 Pod IP로 변환한다.
3. conntrack이 이 DNAT 변환을 기록(추적)한다.
4. 서버 Pod이 응답 패킷을 보내면, conntrack이 소스 IP를 다시 Service VIP로 역변환(reverse NAT)하여 클라이언트에 전달한다.

문제는 **conntrack이 반환 패킷을 `INVALID` 상태로 표시하는 여러 시나리오**에서 발생했다. conntrack에는 NEW, ESTABLISHED, RELATED, INVALID의 4가지 상태가 있으며, INVALID는 기존 연결과 매칭할 수 없는 패킷에 부여된다.

**시나리오 1: conntrack 테이블 오버플로우**

conntrack 해시 테이블이 용량 한계(`nf_conntrack_max`)에 도달하면, 새로운 연결의 항목을 추가할 수 없다. 이 상태에서 서버의 반환 패킷은 conntrack에서 대응하는 엔트리를 찾지 못하고 `INVALID`로 표시된다. 병렬 부하가 높을 때 테이블이 빠르게 채워지므로 이 시나리오가 발생할 확률이 높아진다.

**시나리오 2: CLOSE_WAIT 상태에서의 데이터 전송**

클라이언트가 연결을 종료(FIN)한 후에도 서버가 아직 보낼 데이터가 남아 있으면, 서버가 추가 데이터를 전송하려 할 때 conntrack은 해당 패킷을 TCP 윈도우 밖의 것으로 판단하여 `INVALID`로 표시한다.

**시나리오 3: TCP 윈도우 위반 및 레이스 컨디션**

TCP 시퀀스 윈도우 밖에 있는 패킷이 도착하거나, 연결 해제 과정에서 conntrack 엔트리가 먼저 삭제된 후 마지막 패킷이 처리되는 레이스 컨디션에서도 동일한 INVALID 표시가 발생한다.

이 모든 시나리오에서 핵심은 동일하다. INVALID 상태의 반환 패킷은 conntrack의 역변환을 거치지 않으므로, **변환되지 않은 원본 Pod IP가 소스 주소로 남은 채** 클라이언트에 도달한다. 클라이언트의 TCP 스택은 자신이 통신한 적 없는 IP(Service VIP가 아닌 백엔드 Pod IP)로부터 패킷을 수신하게 되므로, 이를 유효하지 않은 소스로 판단하고 RST(리셋) 패킷을 보내 연결을 끊는다.

### 2.3 해결

**주요 해결책: INVALID 패킷 DROP 규칙 추가**

iptables에 `INVALID` 상태의 패킷을 DROP하는 규칙을 추가하는 것이 가장 직접적인 해결책이다. INVALID 패킷이 드롭되면 클라이언트에 도달하지 않으므로 RST가 발생하지 않는다. 대신 TCP 재전송 메커니즘에 의해 서버는 일정 시간 후 동일 패킷을 다시 보내며, 이때는 conntrack이 정상 작동할 확률이 높으므로 연결이 복구된다.

**보완 조치: conntrack 테이블 크기 확장**

`nf_conntrack_max` 커널 파라미터를 충분히 늘려서 conntrack 테이블 오버플로우 자체를 방지해야 한다. 대규모 트래픽을 처리하는 노드에서는 기본값이 부족할 수 있으므로, 예상 최대 동시 연결 수에 맞게 사전에 튜닝해야 한다. conntrack 해시 테이블 bucket 크기(`hashsize`)도 함께 조정하면 해시 충돌을 줄여 성능을 개선할 수 있다.

**모니터링: conntrack 통계 감시**

`conntrack -S` 명령으로 conntrack 통계를 주기적으로 확인하여 `insert_failed`, `drop` 카운터가 증가하고 있는지 모니터링하는 것이 진단의 첫 단계이다. 이 카운터가 증가하면 conntrack 테이블 관련 문제가 발생하고 있다는 신호이다.

### 2.4 주요 교훈

- Kubernetes 네트워킹 문제는 단일 컴포넌트가 아닌 iptables, conntrack, TCP 스택 등 **여러 Linux 커널 서브시스템의 상호작용**에서 발생할 수 있다. 하나의 계층만 봐서는 원인을 찾기 어렵다.
- `conntrack -S`로 conntrack 통계를 모니터링하여 `insert_failed`, `drop` 카운터를 확인하는 것이 간헐적 연결 리셋 문제 진단의 출발점이다.
- 대규모 트래픽을 처리하는 클러스터에서는 `nf_conntrack_max` 값과 conntrack 테이블 bucket 크기를 사전에 튜닝해야 한다. 기본값은 대부분의 프로덕션 워크로드에 부족하다.
- 간헐적이고 부하 의존적인 네트워킹 문제는 재현이 어렵기 때문에, 체계적인 커널 메트릭 모니터링 체계가 필수적이다.

---

## 3. gRPC 로드 밸런싱이 Kubernetes Service에서 실패하는 이유

> **출처:** [gRPC Load Balancing on Kubernetes without Tears](https://kubernetes.io/blog/2018/11/07/grpc-load-balancing-on-kubernetes-without-tears/) - William Morgan (Buoyant / Linkerd), Kubernetes 공식 블로그

### 3.1 상황

gRPC 기반 마이크로서비스를 Kubernetes에 배포했을 때, 여러 개의 Pod 레플리카가 존재함에도 불구하고 CPU 사용량 그래프를 확인하면 실제로는 단 하나의 Pod만 트래픽을 처리하고 있는 현상이 발생했다. 나머지 Pod들은 유휴 상태로 남아 있어 수평 스케일링의 효과가 전혀 없었다.

이 문제를 이해하기 위해 HTTP/1.1과 gRPC(HTTP/2)의 연결 특성 차이를 먼저 살펴봐야 한다.

**HTTP/1.1의 경우**, 하나의 TCP 연결에서 한 번에 하나의 요청만 처리할 수 있다(멀티플렉싱 불가). 클라이언트가 동시에 여러 요청을 보내려면 여러 TCP 연결을 열어야 한다. 또한 연결이 자연스럽게 순환하고 만료된다. 이 특성 덕분에 L4(TCP 연결 수준) 로드밸런싱만으로도 요청이 여러 백엔드에 분산된다.

**gRPC(HTTP/2)의 경우**, 설계 철학이 근본적으로 다르다. HTTP/2는 하나의 장기 TCP 연결 위에 여러 요청을 멀티플렉싱하여 효율성을 극대화한다. 연결 수립 비용을 줄이고 head-of-line blocking을 해소하기 위한 것이지만, 이 효율성이 Kubernetes 환경에서 로드밸런싱 문제를 일으킨다.

### 3.2 문제

Kubernetes의 기본 Service(ClusterIP)는 L3/L4 수준, 즉 **TCP 연결 수준에서 로드밸런싱**을 수행한다. iptables 규칙에 의해 새로운 TCP 연결이 수립될 때 백엔드 Pod이 선택되며, 해당 연결이 유지되는 동안 모든 패킷은 같은 Pod으로 전달된다.

HTTP/1.1에서는 연결이 자주 생성되고 종료되므로 이 방식이 잘 작동한다. 그러나 gRPC 클라이언트는 서버와 **단 하나의 HTTP/2 연결을 수립**하고, 이후 모든 RPC 호출을 이 하나의 연결 위에 멀티플렉싱한다. 한번 연결이 수립되면 해당 연결은 특정 Pod에 고정되므로, 이후의 수천, 수만 건의 RPC 요청이 모두 동일한 Pod으로 향한다.

결과적으로 Deployment를 10개 레플리카로 스케일 아웃해도, gRPC 클라이언트가 이미 수립한 연결은 여전히 하나의 Pod에 고정되어 있어 스케일링 효과가 전혀 없다.

### 3.3 해결

**방법 1: 클라이언트 측 로드밸런싱 (애플리케이션 관리)**

gRPC 클라이언트 코드에서 직접 로드밸런싱 풀을 관리하는 방법이다. 클라이언트가 여러 백엔드 주소를 알고 있으며, 각 백엔드에 별도의 연결을 유지하면서 요청을 분산한다.

장점은 로드밸런싱 로직을 완전히 제어할 수 있다는 것이다. 단점은 Kubernetes의 동적 환경에서 Pod IP가 지속적으로 변하므로 구현 복잡도가 매우 높다는 점이다. 애플리케이션이 Kubernetes API를 watch하면서 엔드포인트 변경을 실시간으로 반영해야 하며, 언어/프레임워크별로 구현이 다르다.

**방법 2: Headless Service와 DNS 기반 분산**

Kubernetes Headless Service(`clusterIP: None`)를 사용하면, DNS 조회 시 Service VIP 대신 각 백엔드 Pod의 개별 IP 주소가 A 레코드로 반환된다. 고급 gRPC 클라이언트는 이 여러 A 레코드를 받아 각각에 대해 별도의 연결을 수립하고 요청을 분산할 수 있다.

장점은 별도의 인프라가 필요 없고 Kubernetes 네이티브 기능만 활용한다는 점이다. 단점은 충분히 고급 기능을 지원하는 gRPC 클라이언트가 필요하며, DNS 업데이트를 능동적으로 모니터링해야 한다는 점이다.

**방법 3: 서비스 메시를 활용한 L7 로드밸런싱 (권장)**

Linkerd 같은 서비스 메시를 사이드카 프록시로 배포하여, 애플리케이션 코드 변경 없이 L7 수준에서 요청별 로드밸런싱을 수행하는 방법이다. 사이드카 프록시가 각 백엔드 Pod에 대해 별도의 HTTP/2 연결을 유지하면서, 개별 gRPC 요청을 여러 연결에 분산한다.

```
클라이언트 Pod -> Linkerd 사이드카 프록시 -> [여러 백엔드 Pod에 분산]
                  (L7 로드밸런싱 수행)         Pod A (요청 1, 4, 7...)
                                              Pod B (요청 2, 5, 8...)
                                              Pod C (요청 3, 6, 9...)
```

서비스 메시 방식의 이점은 다음과 같다.

- **언어/프레임워크 무관**: 어떤 gRPC 클라이언트 구현이든 상관없이 작동한다.
- **투명성**: 애플리케이션 코드 변경이 필요 없다.
- **프로토콜 자동 감지**: HTTP/2, HTTP/1.x, TCP를 자동으로 식별한다.
- **동적 Pod 추적**: Kubernetes API를 watch하여 Pod 스케줄링 변경에 자동 대응한다.
- **지능형 라우팅**: 응답 레이턴시의 지수 가중 이동 평균(EWMA)을 기반으로 더 빠른 Pod에 더 많은 요청을 라우팅한다.

### 3.4 주요 교훈

- Kubernetes Service의 기본 로드밸런싱은 L4(연결 수준)이므로, HTTP/2 기반 프로토콜(gRPC, HTTP/2 프록시 등)에는 구조적으로 부적합하다. 연결이 아닌 요청 수준의 밸런싱이 필요하다.
- gRPC 서비스를 운영할 때는 반드시 L7 로드밸런싱 전략을 수립해야 하며, 서비스 메시(Linkerd, Istio 등) 도입 여부를 초기 설계 단계에서 검토해야 한다.
- 최근에는 Kubernetes Gateway API와 gRPC 전용 로드밸런싱 지원이 발전하고 있으므로, 서비스 메시 없이도 해결 가능한 경로가 점차 확대되고 있다.

---

## 4. NetworkPolicy 패킷 드롭 디버깅: kube-iptables-tailer

> **출처:** [Introducing kube-iptables-tailer: Better Networking Visibility in Kubernetes Clusters](https://kubernetes.io/blog/2019/04/19/introducing-kube-iptables-tailer/) - Saifuding Diliyaer (Box), Kubernetes 공식 블로그

### 4.1 상황

Box 엔지니어링 팀은 Tigera의 Project Calico 기반 NetworkPolicy를 프로덕션 클러스터에 적용하여 선언적으로 네트워크 정책을 관리하고 있었다. NetworkPolicy를 통해 Pod 간 통신을 제어하면, 허용되지 않은 트래픽은 iptables 규칙에 의해 **조용히 드롭**된다. 패킷이 드롭될 때 iptables는 커널 로그에 기록을 남기지만, 이 로그는 노드의 커널 로그 파일에만 기록되어 애플리케이션 개발자가 직접 접근하기 어려웠다.

### 4.2 문제

NetworkPolicy로 인한 통신 실패를 진단하는 과정에는 여러 가지 난점이 있었다.

**접근성 문제**: iptables 드롭 로그는 노드의 커널 로그 파일에 기록된다. 개발자가 이 로그를 보려면 노드에 SSH 접속해야 하는데, 많은 조직에서 일반 개발자에게 노드 직접 접속 권한을 부여하지 않는다.

**수동 파싱의 번거로움**: iptables 로그는 raw 형식으로 기록되며, 소스/목적지 IP 주소, 포트, 프로토콜 등 기본적인 네트워크 정보만 포함한다. 이 IP 주소를 실제 Pod 이름과 네임스페이스로 매핑하려면 수작업이 필요했다.

**동적 IP 문제**: Kubernetes 환경에서 Pod의 IP 주소는 Pod이 재시작되거나 재스케줄링될 때마다 변경된다. 또한 IP가 재사용될 수 있으므로, 특정 시점의 IP 로그를 보고 어떤 Pod이었는지 역추적하는 것은 더욱 복잡하다.

**에스컬레이션 과다**: 개발자들은 자신의 서비스가 왜 다른 서비스에 연결할 수 없는지 원인을 파악하는 데 과도한 시간을 소비했으며, 결국 네트워크 팀에 에스컬레이션하는 경우가 빈번했다. 이는 네트워크 팀의 부담을 가중시키고 전체적인 문제 해결 시간(MTTR)을 늘렸다.

### 4.3 해결

Box 팀은 **kube-iptables-tailer**를 개발하여 오픈소스로 공개했다. 이 도구는 DaemonSet으로 모든 노드에 배포되며, 세 단계의 파이프라인으로 동작한다.

**1단계: iptables 로그 파일 감시**

Go 언어로 작성된 kube-iptables-tailer는 여러 고루틴(goroutine)을 동시에 실행하며, iptables 커널 로그 파일을 주기적으로 tail한다. 변경이 감지되면 Go 채널을 통해 다음 단계로 전달한다.

**2단계: 로그 파싱 및 필터링**

수신된 로그에서 NetworkPolicy 관련 패킷 드롭 정보를 식별한다. Calico의 경우 `calico-drop:` 접두사가 붙은 로그 라인을 감지한다. 소스 IP, 목적지 IP, 트래픽 방향 등의 정보를 파싱하여 구조화된 객체로 변환한다. 중복 로그를 필터링하여 동일한 드롭 이벤트가 반복 기록되는 노이즈를 제거한다.

**3단계: Pod 매핑 및 Kubernetes Event 생성**

Kubernetes API를 사용하여 파싱된 IP 주소를 실제 Pod 이름과 네임스페이스로 매핑한다. 외부 호스트나 베어메탈 서버의 경우 DNS 역방향 조회를 수행한다. 그리고 해당 Pod에 Kubernetes Event를 생성하여, 개발자가 `kubectl describe pod` 명령만으로 패킷 드롭 정보를 확인할 수 있게 한다.

```bash
$ kubectl describe pods --namespace=YOUR_NAMESPACE
Events:
 Type     Reason      Age    From                    Message
 ----     ------      ----   ----                    -------
 Warning  PacketDrop  5s     kube-iptables-tailer    Packet dropped when receiving
                                                      traffic from example-service-2
                                                      (IP: 22.222.22.222).
 Warning  PacketDrop  10m    kube-iptables-tailer    Packet dropped when sending
                                                      traffic to example-service-1
                                                      (IP: 11.111.11.111).
```

API 서버 과부하를 방지하기 위해 **지수 백오프(exponential backoff)** 메커니즘을 적용하여 이벤트 생성 빈도를 제어한다.

이 도구는 [github.com/box/kube-iptables-tailer](https://github.com/box/kube-iptables-tailer)에서 오픈소스로 제공된다.

### 4.4 주요 교훈

- NetworkPolicy 도입 시 **가시성(observability) 도구를 함께 구축하지 않으면**, 정책 자체가 디버깅 장벽이 된다. 보안은 강화되지만 운영 복잡도가 동시에 증가한다.
- "deny by default" 정책을 적용하기 전에, 패킷 드롭 모니터링 파이프라인이 먼저 준비되어야 한다. 순서를 바꾸면 장애 발생 시 원인 파악이 극도로 어려워진다.
- kube-iptables-tailer의 주요 가치는 노드 수준의 커널 로그를 Kubernetes 네이티브 개념(Pod, Namespace, Event)으로 변환하여 **개발자 셀프 서비스 진단**을 가능하게 한 점이다.
- 프로덕션에서 NetworkPolicy를 운영할 때는 Calico의 로그 기능이나 Cilium의 Hubble 같은 네트워크 가시성 도구가 필수적이다. 최신 CNI(특히 Cilium)는 eBPF 기반의 더욱 풍부한 네트워크 관측성을 제공한다.

---

## 5. kube-proxy의 iptables 모드 한계와 nftables 전환

> **출처:** [NFTables mode for kube-proxy](https://kubernetes.io/blog/2025/02/28/nftables-kube-proxy/) - Dan Winship (Red Hat), Kubernetes 공식 블로그

### 5.1 상황

Kubernetes 클러스터의 규모가 커지면서(Service 수천~수만 개), kube-proxy의 iptables 모드가 데이터 플레인과 컨트롤 플레인 양쪽에서 성능 병목을 일으키기 시작했다. 특히 대규모 클러스터에서 Service 업데이트 시 지연이 증가하고, 패킷 라우팅 레이턴시도 선형적으로 증가하는 문제가 있었다. iptables 모드는 Kubernetes 초기부터 사용되어 온 검증된 방식이지만, 클러스터 규모가 과거와 비교할 수 없을 정도로 커진 현재에는 구조적 한계가 명확해졌다.

### 5.2 문제

iptables 모드의 구조적 한계는 **데이터 플레인과 컨트롤 플레인** 양쪽에서 나타난다.

**데이터 플레인: O(n) 순차 탐색**

iptables 모드에서는 각 Service IP/포트 조합에 대해 하나의 iptables 규칙이 최상위 체인에 추가된다. 패킷이 도착하면 커널은 이 규칙들을 위에서 아래로 **순차적으로** 비교한다.

```
-A KUBE-SERVICES ... -d 172.30.0.41 --dport 80 -j KUBE-SVC-XPGD46QRK7WJZT7O
-A KUBE-SERVICES ... -d 172.30.0.42 --dport 443 -j KUBE-SVC-GNZBNJ2PO5MGZ6GT
... (수천~수만 개의 규칙)
```

Service가 N개이면 최악의 경우 N개의 규칙을 모두 검사해야 하므로 탐색 복잡도가 **O(n)**이다. Service가 30,000개인 클러스터에서는 첫 번째 패킷의 p99 레이턴시가 크게 증가하며, 이 지연은 Service 수에 비례하여 선형적으로 악화된다.

**컨트롤 플레인: 전체 규칙 재작성**

iptables의 규칙 업데이트는 `iptables-restore` API를 통해 수행되는데, 이 API는 전체 규칙 세트를 한 번에 작성하는 방식이다. Service 하나만 변경되더라도 전체 규칙 세트(수만 개)를 다시 작성해야 하므로 업데이트 비용이 **O(n)**이다. Kubernetes 1.26에서 최적화가 도입되었지만, 대규모 클러스터에서는 여전히 비용이 크다.

### 5.3 해결

Kubernetes 1.29에서 알파로 도입되고 현재 베타(1.32+)인 **nftables 모드**는 iptables의 구조적 한계를 근본적으로 해결한다.

**데이터 플레인: verdict map으로 O(1) 조회**

nftables는 순차 탐색 대신 **verdict map**(판정 맵)이라는 자료구조를 사용한다. 하나의 규칙에서 맵 룩업을 수행하여 바로 대상 체인으로 디스패치하므로, Service 수에 관계없이 **O(1)**의 일정한 조회 시간을 달성한다.

```
table ip kube-proxy {
    map service-ips {
        type ipv4_addr . inet_proto . inet_service : verdict
        elements = {
            172.30.0.41 . tcp . 80 : goto service-...-namespace1/service1/tcp/p80,
            172.30.0.42 . tcp . 443 : goto service-...-namespace2/service2/tcp/p443,
            ...
        }
    }

    chain services {
        ip daddr . meta l4proto . th dport vmap @service-ips
    }
}
```

Service가 30,000개인 클러스터에서 nftables의 p99 레이턴시가 iptables의 p01 레이턴시보다 낮다는 벤치마크 결과가 있다. 즉, nftables의 최악의 경우가 iptables의 최선의 경우보다 빠르다.

**컨트롤 플레인: 증분 업데이트**

nftables는 변경된 Service/Endpoint만 개별적으로 업데이트할 수 있다. 전체 규칙 세트를 재작성할 필요가 없으므로 업데이트 비용은 변경 사항의 크기에만 비례한다. 또한 nftables의 각 테이블은 독립적인 잠금을 사용하므로, 다른 nftables 사용자와의 글로벌 잠금 경합이 없다.

**도입 시 고려사항**

- **커널 요구사항**: Linux 커널 5.13 이상이 필요하다. 오래된 배포판이나 엣지 디바이스에서는 호환성 문제가 있을 수 있다.
- **코드 성숙도**: 1.29에서 도입된 비교적 새로운 구현이므로, iptables 모드만큼의 실전 검증은 아직 부족하다.
- **GA 일정**: v1.33에서 GA가 예정되어 있으나, iptables가 기본값으로 유지된다. 하위 호환성을 위해 점진적으로 전환을 유도하는 전략이다.

### 5.4 주요 교훈

- 소규모 클러스터(수십~수백 Service)에서는 iptables 모드로 충분하지만, Service가 수천 개를 넘어가면 O(n) 탐색으로 인한 성능 문제가 가시화된다. 인프라 규모 성장에 따른 전환 시점을 미리 인지하고 있어야 한다.
- nftables 모드는 verdict map 기반 O(1) 조회와 증분 업데이트로 대규모 클러스터의 네트워킹 성능을 근본적으로 개선한다. 커널 5.13 이상을 사용하는 환경이라면 적극적으로 테스트를 시작할 시점이다.
- iptables vs IPVS vs nftables 세 가지 kube-proxy 모드의 차이에서 핵심은 **O(n) vs O(1)의 조회 복잡도 차이**와 **컨트롤 플레인 업데이트 효율성**이다.
- 30,000개 Service 환경에서 nftables의 p99가 iptables의 p01보다 빠르다는 벤치마크 수치는 구체적 근거로 활용할 수 있다.

---

## 요약

| 주제 | 주요 키워드 | 관련 사례 |
|------|------------|-----------|
| DNS 성능 | ndots:5, search domain, FQDN trailing dot, 쿼리 5배 증폭 | 사례 1 |
| conntrack | 테이블 용량, INVALID 상태, connection reset, CLOSE_WAIT | 사례 2 |
| L4 vs L7 로드밸런싱 | HTTP/2 멀티플렉싱, gRPC, Service Mesh, EWMA | 사례 3 |
| NetworkPolicy 가시성 | 패킷 드롭, iptables 로그, Hubble/Cilium, DaemonSet | 사례 4 |
| kube-proxy 모드 | iptables O(n) vs nftables O(1), verdict map, 증분 업데이트 | 사례 5 |

---

## 참고 자료

- [Kubernetes DNS resolution: ndots options and why it may affect application performances](https://pracucci.com/kubernetes-dns-resolution-ndots-options-and-why-it-may-affect-application-performances.html)
- [kube-proxy Subtleties: Debugging an Intermittent Connection Reset](https://kubernetes.io/blog/2019/03/29/kube-proxy-subtleties-debugging-an-intermittent-connection-reset/)
- [gRPC Load Balancing on Kubernetes without Tears](https://kubernetes.io/blog/2018/11/07/grpc-load-balancing-on-kubernetes-without-tears/)
- [Introducing kube-iptables-tailer: Better Networking Visibility in Kubernetes Clusters](https://kubernetes.io/blog/2019/04/19/introducing-kube-iptables-tailer/)
- [NFTables mode for kube-proxy](https://kubernetes.io/blog/2025/02/28/nftables-kube-proxy/)
