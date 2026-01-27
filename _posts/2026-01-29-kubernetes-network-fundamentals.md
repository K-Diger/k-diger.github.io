---
layout: post
title: "Kubernetes 네트워크 기초 - 컨테이너 네트워킹 원리부터 CNI까지"
date: 2026-01-29
categories: [Kubernetes]
tags: [kubernetes, networking, vxlan, overlay, cni, iptables]
mermaid: true
---

Kubernetes 네트워킹을 이해하려면 기본적인 네트워크 개념부터 알아야 한다. 이 장에서는 OSI 모델, 오버레이 네트워크, VXLAN, iptables 등 CNI를 이해하는 데 필요한 기초 개념을 상세히 설명한다.

## 네트워크 기초

### OSI 7계층 모델

```mermaid
flowchart TB
    L7["Layer 7: Application<br>(HTTP, HTTPS, DNS)"]
    L6["Layer 6: Presentation<br>(SSL/TLS, 암호화)"]
    L5["Layer 5: Session<br>(세션 관리)"]
    L4["Layer 4: Transport<br>(TCP, UDP) - 포트 기반"]
    L3["Layer 3: Network<br>(IP) - IP 주소 기반"]
    L2["Layer 2: Data Link<br>(Ethernet, MAC) - MAC 주소 기반"]
    L1["Layer 1: Physical<br>(케이블, 전기 신호)"]

    L7 --- L6 --- L5 --- L4 --- L3 --- L2 --- L1
```

**Kubernetes/CNI에서 중요한 계층**:
- **L2 (Data Link)**: MAC 주소, 같은 네트워크 내 통신
- **L3 (Network)**: IP 주소, 라우팅
- **L4 (Transport)**: TCP/UDP 포트
- **L7 (Application)**: HTTP 경로, 헤더

### L2 vs L3

**L2 (Layer 2) 네트워크**:
- MAC 주소 기반 통신
- 같은 물리적 네트워크(브로드캐스트 도메인)에서만 직접 통신
- 스위치가 패킷 전달

```mermaid
flowchart TB
    subgraph L2["L2 네트워크 (같은 서브넷)"]
        direction TB
        HostA["Host A<br>MAC: aa:bb:cc<br>IP: 192.168.1.10"]
        HostB["Host B<br>MAC: dd:ee:ff<br>IP: 192.168.1.20"]
        Switch[Switch]

        HostA --- Switch --- HostB
    end
    Note["A → B 통신: ARP로 MAC 주소 찾고, 직접 전송"]
```

**L3 (Layer 3) 네트워크**:
- IP 주소 기반 통신
- 다른 네트워크 간 라우팅 필요
- 라우터가 패킷 전달

```mermaid
flowchart TB
    subgraph L3["L3 네트워킹 (다른 서브넷)"]
        direction TB
        subgraph NetA["Network A: 192.168.1.0/24"]
            HostA["Host<br>192.168.1.10"]
        end
        subgraph NetB["Network B: 10.0.0.0/24"]
            HostB["Host<br>10.0.0.20"]
        end
        Router[Router]

        HostA --- Router --- HostB
    end
    Note["A → B 통신: 라우터가 패킷을 다음 네트워크로 전달"]
```

### 컨테이너 네트워킹의 문제

Kubernetes 클러스터는 보통 **여러 노드에 걸쳐** 있다.

```mermaid
flowchart TB
    subgraph Cluster["Kubernetes 클러스터"]
        subgraph NodeA["Node A (192.168.1.10)"]
            Pod1["Pod 1: 10.244.0.5"]
            Pod2["Pod 2: 10.244.0.6"]
        end
        subgraph NodeB["Node B (192.168.1.20)"]
            Pod3["Pod 3: 10.244.1.8"]
            Pod4["Pod 4: 10.244.1.9"]
        end
    end
    Question["문제: Pod 1 (10.244.0.5) → Pod 3 (10.244.1.8)<br>어떻게 다른 노드의 Pod에 패킷을 전달하는가?"]

    Pod1 -.->|"?"| Pod3
```

**문제점**:
1. Pod IP (10.244.x.x)는 가상 IP로 물리 네트워크에서 라우팅 안 됨
2. 노드 간에는 물리적 네트워크(192.168.1.0/24)만 연결
3. 물리 라우터는 Pod IP(10.244.0.0/16)를 모름

**해결책**: **오버레이 네트워크** 또는 **직접 라우팅**

## 오버레이 네트워크

### 오버레이란?

**오버레이 네트워크**는 기존 물리 네트워크 위에 가상의 네트워크를 구축하는 것이다.

```mermaid
flowchart TB
    subgraph Overlay["가상 네트워크 (Overlay)"]
        PodA["Pod A<br>10.244.0.5"]
        PodB["Pod B<br>10.244.1.8"]
        PodA -->|"가상 통신"| PodB
    end
    subgraph Underlay["물리 네트워크 (Underlay)"]
        NodeA["Node A<br>192.168.1.10"]
        NodeB["Node B<br>192.168.1.20"]
        NodeA -->|"실제 통신"| NodeB
    end

    PodA -.->|"캡슐화"| NodeA
    NodeB -.->|"역캡슐화"| PodB
```

**동작 원리**:
1. Pod A → Pod B 패킷 생성 (src: 10.244.0.5, dst: 10.244.1.8)
2. 노드 A에서 이 패킷을 **캡슐화** (외부 헤더 추가)
3. 외부 헤더: src: 192.168.1.10, dst: 192.168.1.20
4. 물리 네트워크로 전송
5. 노드 B에서 **역캡슐화** (외부 헤더 제거)
6. 원본 패킷(10.244.0.5 → 10.244.1.8)을 Pod B에 전달

### 캡슐화(Encapsulation)

```mermaid
flowchart LR
    subgraph Original["원본 패킷"]
        direction LR
        IP1["IP Header<br>Src: 10.244.0.5<br>Dst: 10.244.1.8"]
        TCP1[TCP]
        Data1[Data]
        IP1 --- TCP1 --- Data1
    end

    subgraph Encapsulated["캡슐화 후"]
        direction LR
        OuterIP["Outer IP Header<br>Src: 192.168.1.10<br>Dst: 192.168.1.20"]
        subgraph Inner["Inner Packet"]
            IP2["IP Header<br>Src: 10.244.0.5<br>Dst: 10.244.1.8"]
            TCP2[TCP]
            Data2[Data]
        end
        OuterIP --- Inner
    end

    Original -->|"캡슐화"| Encapsulated
```

## VXLAN

### VXLAN이란?

**VXLAN(Virtual Extensible LAN)**은 L2 네트워크를 L3 네트워크 위에 오버레이하는 기술이다.

```mermaid
flowchart TB
    subgraph VXLAN["VXLAN 특징"]
        F1["UDP 포트 4789 사용"]
        F2["24비트 VNI (VXLAN Network Identifier)"]
        F3["약 1600만개의 가상 네트워크 지원"]
        F4["L3 네트워크 위에서 L2 통신 가능"]
    end

    subgraph VTEP["VTEP (VXLAN Tunnel Endpoint)"]
        V1["캡슐화/역캡슐화 수행"]
        V2["각 노드에 존재"]
    end
```

### VXLAN 패킷 구조

```mermaid
flowchart LR
    subgraph VXLANPacket["VXLAN 패킷 구조"]
        direction LR
        OE["Outer<br>Ethernet<br>Header"]
        OI["Outer<br>IP<br>Header"]
        UDP["UDP<br>(4789)<br>Header"]
        VH["VXLAN<br>Header<br>(VNI)"]
        OF["Original<br>Ethernet<br>Frame"]

        OE --- OI --- UDP --- VH --- OF
    end

    subgraph Desc["설명"]
        D1["Outer Ethernet: 노드 간 물리 네트워크"]
        D2["Outer IP: 노드 IP (192.168.1.10 → 192.168.1.20)"]
        D3["UDP: 포트 4789"]
        D4["VXLAN Header: VNI (가상 네트워크 식별자)"]
        D5["Original Frame: 원본 Pod 패킷"]
    end
```

### Flannel에서의 VXLAN

```mermaid
flowchart TB
    subgraph NodeA["Node A"]
        PodA["Pod A<br>10.244.0.5"]
        cni0A["cni0 bridge<br>10.244.0.1"]
        flannelA["flannel.1<br>(VTEP)"]

        PodA --> cni0A --> flannelA
    end

    subgraph NodeB["Node B"]
        flannelB["flannel.1<br>(VTEP)"]
        cni0B["cni0 bridge<br>10.244.1.1"]
        PodB["Pod B<br>10.244.1.8"]

        flannelB --> cni0B --> PodB
    end

    subgraph Physical["물리 네트워크 (192.168.1.0/24)"]
        Net[" "]
    end

    flannelA -->|"VXLAN 캡슐화"| Net -->|"VXLAN 역캡슐화"| flannelB
```

**Flannel 동작 순서**:
1. Pod A → Pod B 패킷 전송 (10.244.0.5 → 10.244.1.8)
2. cni0 bridge에서 flannel.1로 전달 (라우팅 테이블)
3. flannel.1 (VTEP)에서 VXLAN 캡슐화
4. 물리 네트워크로 Node B에 전송
5. Node B의 flannel.1에서 역캡슐화
6. cni0 bridge를 통해 Pod B로 전달

## host-gw (직접 라우팅)

### host-gw란?

**host-gw**는 캡슐화 없이 **직접 라우팅**을 사용한다.

```mermaid
flowchart TB
    subgraph HostGW["host-gw 모드"]
        subgraph NodeA["Node A (192.168.1.10)<br>Pod CIDR: 10.244.0.0/24"]
            PodA["Pod A<br>10.244.0.5"]
        end
        subgraph NodeB["Node B (192.168.1.20)<br>Pod CIDR: 10.244.1.0/24"]
            PodB["Pod B<br>10.244.1.8"]
        end

        PodA -->|"직접 라우팅<br>(캡슐화 없음)"| PodB
    end

    subgraph RT["라우팅 테이블 (Node A)"]
        R1["10.244.0.0/24 → 0.0.0.0 (cni0)"]
        R2["10.244.1.0/24 → 192.168.1.20 (eth0)"]
    end
```

### VXLAN vs host-gw

| 특성 | VXLAN | host-gw |
|------|-------|---------|
| 캡슐화 | 있음 (오버헤드) | 없음 |
| 성능 | 상대적으로 낮음 | 더 빠름 |
| 요구사항 | L3 연결만 필요 | L2 연결 필요 (같은 서브넷) |
| 유연성 | 높음 | 낮음 |

**host-gw 제약**: 모든 노드가 같은 L2 네트워크에 있어야 함 (직접 라우팅 가능해야 함)

## Flannel이 NetworkPolicy를 지원하지 않는 이유

### NetworkPolicy의 구현 방식

NetworkPolicy를 구현하려면 **패킷 필터링**이 필요하다.

```mermaid
flowchart TB
    subgraph NP["NetworkPolicy 구현 요구사항"]
        subgraph Step1["1. 패킷 검사"]
            S1A["Source Pod IP/Label 확인"]
            S1B["Destination Pod IP/Label 확인"]
            S1C["Port/Protocol 확인"]
        end
        subgraph Step2["2. 정책 적용"]
            S2A["iptables 규칙 생성"]
            S2B["또는 eBPF 프로그램 로드"]
        end
        subgraph Step3["3. 실시간 동기화"]
            S3A["Pod 생성/삭제 시 규칙 업데이트"]
            S3B["NetworkPolicy 변경 시 규칙 업데이트"]
        end
    end

    Step1 --> Step2 --> Step3
```

### Flannel의 설계

```mermaid
flowchart TB
    subgraph Flannel["Flannel의 역할"]
        subgraph Does["Flannel이 하는 것"]
            D1["Pod에 IP 할당 (IPAM)"]
            D2["노드 간 오버레이 네트워크 구성"]
            D3["라우팅 테이블 설정"]
        end
        subgraph DoesNot["Flannel이 하지 않는 것"]
            N1["패킷 필터링"]
            N2["NetworkPolicy 규칙 적용"]
            N3["iptables/eBPF 관리 (보안 목적)"]
        end
    end

    Reason["이유: Flannel은 단순한 L3 네트워크 연결만 목표<br>최소한의 기능으로 가볍고 단순하게 설계"]
```

### Calico가 NetworkPolicy를 지원하는 이유

```mermaid
flowchart TB
    subgraph Calico["Calico의 설계"]
        subgraph Felix["Felix (각 노드에서 실행)"]
            F1["iptables/eBPF 규칙 관리"]
            F2["NetworkPolicy 적용"]
            F3["라우팅 설정"]
        end
        subgraph BIRD["BIRD (BGP 라우팅 데몬)"]
            B1["노드 간 라우팅 정보 교환"]
        end
    end

    Goal["Calico는 처음부터 네트워크 + 보안을 목표로 설계"]

    Felix --> Goal
    BIRD --> Goal
```

## iptables 기초

### iptables란?

iptables는 Linux 커널의 **패킷 필터링 프레임워크**이다.

```mermaid
flowchart LR
    subgraph IPTables["iptables 체인 - 패킷 흐름"]
        IN[In] --> PREROUTING
        PREROUTING -->|"라우팅 전 (DNAT)"| FORWARD
        PREROUTING --> INPUT
        INPUT -->|"로컬 프로세스로"| LP[Local Process]
        LP --> OUTPUT
        OUTPUT -->|"로컬에서 나감"| POSTROUTING
        FORWARD -->|"다른 곳으로 전달"| POSTROUTING
        POSTROUTING -->|"라우팅 후 (SNAT)"| OUT[Out]
    end
```

### iptables 테이블

| 테이블 | 용도 |
|--------|------|
| filter | 패킷 필터링 (ACCEPT, DROP) |
| nat | 주소 변환 (SNAT, DNAT) |
| mangle | 패킷 수정 |
| raw | 연결 추적 제외 |

### Kubernetes Service와 iptables

```bash
# Service 관련 iptables 규칙 확인
iptables -t nat -L KUBE-SERVICES -n

# 예시: ClusterIP Service
# KUBE-SVC-xxx → KUBE-SEP-yyy (Pod IP로 DNAT)
```

```mermaid
flowchart TB
    Client["Client"] --> ClusterIP["ClusterIP<br>10.96.0.10:80"]

    subgraph PREROUTING["PREROUTING chain"]
        KS["KUBE-SERVICES"]
        SVC["KUBE-SVC-XXXXXX<br>(Service 매칭)"]
        SEPA["KUBE-SEP-AAA<br>(33%)"]
        SEPB["KUBE-SEP-BBB<br>(33%)"]
        SEPC["KUBE-SEP-CCC<br>(33%)"]

        KS --> SVC
        SVC --> SEPA
        SVC --> SEPB
        SVC --> SEPC
    end

    ClusterIP --> KS
    SEPA --> PodA["Pod A IP"]
    SEPB --> PodB["Pod B IP"]
    SEPC --> PodC["Pod C IP"]

    DNAT["DNAT: 10.96.0.10:80 → 10.244.0.5:8080"]
```

### NetworkPolicy와 iptables

Calico가 NetworkPolicy를 적용하면 iptables 규칙이 생성된다.

```bash
# NetworkPolicy 관련 규칙 확인
iptables -L cali-fw-xxx -n

# 예시 규칙:
# -A cali-fw-xxx -m set --match-set cali-s:xxx src -j ACCEPT
# -A cali-fw-xxx -j DROP
```

## eBPF 기초

### eBPF란?

**eBPF(extended Berkeley Packet Filter)**는 커널에서 안전하게 프로그램을 실행하는 기술이다.

```mermaid
flowchart TB
    subgraph Traditional["전통적 방식"]
        App1["애플리케이션"]
        Kernel1["커널<br>(수정하려면 커널 모듈 필요)"]
        App1 -->|"syscall"| Kernel1
    end

    subgraph eBPFWay["eBPF 방식"]
        App2["애플리케이션"]
        eBPF["eBPF 프로그램<br>(커널에서 실행)<br>- 사용자 공간에서 로드<br>- 커널 재컴파일 불필요<br>- 안전하게 검증됨"]
        Kernel2["커널"]
        App2 --> eBPF --> Kernel2
    end
```

### eBPF vs iptables

| 특성 | iptables | eBPF |
|------|----------|------|
| 성능 | 규칙 많아지면 느려짐 | 일정한 성능 |
| 유연성 | 제한적 | 프로그래밍 가능 |
| 관측성 | 기본적 | 상세한 메트릭 |
| 복잡도 | 낮음 | 높음 |

### Cilium의 eBPF 활용

```mermaid
flowchart TB
    subgraph Cilium["Cilium eBPF 데이터플레인"]
        subgraph Functions["eBPF 프로그램이 처리하는 것"]
            F1["패킷 필터링 (NetworkPolicy)"]
            F2["로드밸런싱 (kube-proxy 대체)"]
            F3["NAT"]
            F4["암호화 (WireGuard 연동)"]
            F5["관측성 (Hubble)"]
        end
        subgraph Advantages["장점"]
            A1["iptables 규칙 폭증 문제 없음"]
            A2["L7 프로토콜 처리 가능"]
            A3["실시간 네트워크 플로우 관측"]
        end
    end
```

## 정리

### CNI 선택 시 고려사항

```mermaid
flowchart TB
    subgraph CNI["CNI 선택 가이드"]
        subgraph Flannel["Flannel"]
            FP1["+ 설치/운영 간단"]
            FP2["+ 학습용으로 적합"]
            FN1["- NetworkPolicy 사용 불가"]
            FN2["- 보안 정책 적용 불가"]
        end
        subgraph Calico["Calico"]
            CP1["+ NetworkPolicy 완전 지원"]
            CP2["+ BGP로 고성능 라우팅"]
            CP3["+ 프로덕션에 적합"]
            CN1["~ 설정이 다소 복잡"]
        end
        subgraph Cilium["Cilium"]
            CiP1["+ eBPF로 고성능"]
            CiP2["+ L7 NetworkPolicy"]
            CiP3["+ 뛰어난 관측성 (Hubble)"]
            CiN1["~ 학습 곡선 높음"]
        end
    end
```

### 핵심 용어 정리

| 용어 | 설명 |
|------|------|
| Overlay | 물리 네트워크 위의 가상 네트워크 |
| Underlay | 실제 물리 네트워크 |
| VXLAN | UDP 기반 L2 오버레이 기술 |
| VTEP | VXLAN 캡슐화/역캡슐화 엔드포인트 |
| BGP | 라우팅 프로토콜 (Border Gateway Protocol) |
| iptables | Linux 패킷 필터링 |
| eBPF | 커널 내 프로그램 실행 기술 |
| L2/L3 | OSI 모델 Data Link/Network 계층 |

## 다음 단계

- [Kubernetes 네트워킹 심화 - Service와 kube-proxy](/kubernetes/kubernetes-network-service)
- [Kubernetes 보안 - NetworkPolicy 심화](/kubernetes/kubernetes-networkpolicy-advanced)
