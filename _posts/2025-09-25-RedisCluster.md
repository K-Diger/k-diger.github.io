---

title: "Redis Cluster는 키를 어떻게 나누고 장애를 어떻게 감지하는가"
date: 2025-09-25
categories: [Redis]
tags: [Redis]
layout: post
toc: true
math: true
mermaid: true

---

## 참고자료

- [Redis Cluster Specification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)
- [Redis Cluster Tutorial](https://redis.io/docs/latest/operate/oss_and_stack/management/scaling/)
- [Redis - Cluster failover](https://redis.io/docs/latest/commands/cluster-failover/)
- [Redis - Replication](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)

---

## 배경

Redis를 한 대로 쓰다가 데이터가 늘어나면서 나눠야 할 시점이 왔다. 방법을 찾다 보니 **클라이언트에서 키를 해싱해서 나누는 방식**과 **Redis Cluster를 쓰는 방식**이 나왔다.

앞의 방식은 노드를 늘리거나 줄일 때 키가 통째로 재배치된다는 것이 걸렸다. Cluster는 그 문제를 어떻게 푸는지 궁금해서 공식 스펙 문서를 읽었다.

정리하면서 확인하고 싶었던 것들이다.

- 키를 노드에 나누는 기준이 무엇이고, 노드를 추가하면 어떻게 되는가?
- 클라이언트는 어느 노드에 물어봐야 하는지 어떻게 아는가?
- 노드 하나가 죽은 것을 누가 어떻게 판단하는가?
- 여러 키를 한 번에 다루는 명령은 어떻게 되는가?

---

## Redis 클러스터 구성 및 동작 원리

### 1. Redis 클러스터 전체 아키텍처

**공식 문서 인용:**
> "Redis Cluster is a full mesh where every node is connected with every other node using a TCP connection. In a cluster of N nodes, every node has N-1 outgoing TCP connections, and N-1 incoming connections."

```
                    Client Applications
                            │
   ┌────────────────────────┼────────────────────────┐
   │                 Redis Cluster                   │
   │              (Full Mesh Topology)               │
   │                                                 │
   │    ┌───────────────┐     ┌───────────────┐      │
   │    │   Master A    │═════│   Master B    │      │
   │    │ Slots: 0-5460 │     │Slots:5461-10922│     │
   │    │ Port: 6379    │     │ Port: 6380     │     │
   │    │ Bus:  16379   │     │ Bus:  16380    │     │
   │    └───────┬───────┘     └───────┬───────┘      │
   │            ║                     ║              │
   │            ╠═════════════════════╬══════════┐   │
   │            ║                     ║          ║   │
   │    ┌───────▼───────┐     ┌───────▼───────┐  ║   │
   │    │  Replica A1   │     │  Replica B1   │  ║   │
   │    │  Port: 6382   │     │  Port: 6383   │  ║   │
   │    │  Bus:  16382  │     │  Bus:  16383  │  ║   │
   │    └───────────────┘     └───────────────┘  ║   │
   │                                             ║   │
   │                    ┌───────────────┐        ║   │
   │                    │   Master C    │════════╝   │
   │                    │Slots:10923-16383│          │
   │                    │ Port: 6381    │            │
   │                    │ Bus:  16381   │            │
   │                    └───────┬───────┘            │
   │                            │                    │
   │                    ┌───────▼───────┐            │
   │                    │  Replica C1   │            │
   │                    │  Port: 6384   │            │
   │                    │  Bus:  16384  │            │
   │                    └───────────────┘            │
   │                                                 │
   │    ◄═══ Cluster Bus (Binary Protocol) ═══►     │
   └─────────────────────────────────────────────────┘
```

**공식 문서의 클러스터 버스 설명:**
> "Every Redis Cluster node has an additional TCP port for receiving incoming connections from other Redis Cluster nodes. This port will be derived by adding 10000 to the data port"

### 2. 해시 슬롯 분산 메커니즘

**공식 문서의 키 분산 알고리즘:**
> "The cluster's key space is split into 16384 slots... The base algorithm used to map keys to hash slots is the following: `HASH_SLOT = CRC16(key) mod 16384`"

```
┌──────────────────────────────────────────────────────────────┐
│                 Key Distribution Algorithm                   │
│                    HASH_SLOT = CRC16(key) mod 16384         │
└──────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
                ▼               ▼               ▼
        ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
        │   Master A    │ │   Master B    │ │   Master C    │
        │               │ │               │ │               │
        │ Slots: 0-5460 │ │Slots:5461-10922│ │Slots:10923-16383│
        │  (5461 slots) │ │  (5462 slots) │ │  (5461 slots) │
        └───────────────┘ └───────────────┘ └───────────────┘

┌──────────────────────────────────────────────────────────────┐
│                      실제 키 매핑 예시                        │
├──────────────────────────────────────────────────────────────┤
│ Key "user:1000"    → CRC16 = 5923  → Slot 5923  → Master B  │
│ Key "session:abc"  → CRC16 = 12543 → Slot 12543 → Master C  │
│ Key "cache:xyz"    → CRC16 = 2145  → Slot 2145  → Master A  │
└──────────────────────────────────────────────────────────────┘
```

**공식 문서의 해시 태그 설명:**
> "If the key contains a '{...}' pattern only the substring between { and } is hashed in order to obtain the hash slot"

```
┌──────────────────────────────────────────────────────────────┐
│                     Hash Tag 사용 예시                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  {user:1000}.name   ─┐                                       │
│  {user:1000}.email  ─┼──→ "user:1000"만 해싱 → 같은 슬롯    │
│  {user:1000}.age    ─┘                                       │
│                                                              │
│  공식 문서 예시:                                              │
│  "{user1000}.following" and "{user1000}.followers"          │
│  → Only "user1000" is hashed                                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 3. 클러스터 내부 통신 구조

**공식 문서의 클러스터 버스 프로토콜:**
> "Node-to-node communication happens exclusively using the Cluster bus and the Cluster bus protocol: a binary protocol composed of frames of different types and sizes"

```
┌──────────────────┐        ┌────────────────────────────────────┐
│   Client Port    │        │        Cluster Bus Port            │
│    (6379)        │        │      (Data Port + 10000)          │
├──────────────────┤        ├────────────────────────────────────┤
│                  │        │                                    │
│  ┌─────────────┐ │        │  ┌──────────────────────────────┐  │
│  │   Redis     │ │◄══════►│  │      Binary Protocol        │  │
│  │   Server    │ │        │  │                              │  │
│  │             │ │        │  │ - PING/PONG (Heartbeat)     │  │
│  └─────────────┘ │        │  │ - MEET (Node Discovery)     │  │
│                  │        │  │ - FAIL (Failure Detection)  │  │
└──────────┬───────┘        │  │ - FAILOVER_AUTH_REQUEST     │  │
           │                │  │ - UPDATE (Config Sync)      │  │
           ▼                │  └──────────────────────────────┘  │
┌──────────────────┐        └────────────────┬───────────────────┘
│  Client Commands │                         │
│                  │                         ▼
│  GET, SET, DEL   │        ┌────────────────────────────────────┐
│  MGET, MSET...   │        │       Gossip Protocol Network     │
└──────────────────┘        │                                    │
                            │  ┌──────┐    ┌──────┐    ┌──────┐ │
                            │  │Node A│◄══►│Node B│◄══►│Node C│ │
                            │  │      │    │      │    │      │ │
                            │  │      │◄══════════════►│      │ │
                            │  └──────┘    └──────┘    └──────┘ │
                            │                                    │
                            │    모든 노드가 서로 연결된 Full Mesh │
                            │    N개 노드 = N-1 outgoing conn.   │
                            └────────────────────────────────────┘
```

### 4. 리디렉션 메커니즘

**공식 문서의 MOVED 리디렉션:**
> "If the hash slot is served by the node, the query is simply processed, otherwise the node will check its internal hash slot to node map, and will reply to the client with a MOVED error"

```
┌─────────────────────────────────────────────────────────────────┐
│                    MOVED 리디렉션 시나리오                       │
└─────────────────────────────────────────────────────────────────┘

Step 1: 초기 요청 (잘못된 노드)
┌────────┐  GET x  ┌─────────┐
│ Client │────────►│ Node A  │
└────────┘         │(Wrong)  │
                   └─────────┘

Step 2: MOVED 응답 (공식 문서 예시)
┌────────┐  -MOVED 3999 127.0.0.1:6381  ┌─────────┐
│ Client │◄──────────────────────────────│ Node A  │
└────────┘                               └─────────┘
     │                                        │
     └─── 슬롯 번호    올바른 노드 주소 ───────┘

Step 3: 수정된 요청
┌────────┐  GET x  ┌─────────────────────┐
│ Client │────────►│ Node B              │
└────────┘         │ (127.0.0.1:6381)    │
                   └─────────────────────┘

Step 4: 정상 응답
┌────────┐  "value"  ┌───────────────────┐
│ Client │◄──────────│ Node B            │
└────────┘           └───────────────────┘
```

**공식 문서의 ASK 리디렉션 (슬롯 마이그레이션 중):**
> "ASK means to send only the next query to the specified node... node B will only accept queries of a slot that is set as IMPORTING if the client sends the ASKING command before sending the query"

```
┌─────────────────────────────────────────────────────────────────┐
│              ASK 리디렉션 시나리오 (마이그레이션 중)              │
└─────────────────────────────────────────────────────────────────┘

마이그레이션 상태:
┌──────────────┐ MIGRATING slot 8 ┌──────────────┐
│   Node A     │ ──────────────►  │   Node B     │
│  (Source)    │                  │  (Target)    │
│              │ IMPORTING slot 8 │              │
└──────────────┘                  └──────────────┘

Step 1: 키가 존재하지 않는 경우
┌────────┐ GET newkey ┌──────────────┐
│ Client │──────────► │   Node A     │
└────────┘            │  (Source)    │
                      └──────────────┘

Step 2: ASK 응답
┌────────┐ -ASK 8 127.0.0.1:6380 ┌──────────────┐
│ Client │◄───────────────────────│   Node A     │
└────────┘                        └──────────────┘

Step 3: ASK 리디렉션 처리
┌────────┐ ASKING    ┌──────────────┐
│ Client │──────────►│   Node B     │
└───┬────┘           │  (Target)    │
    │                └──────────────┘
    │
    │ GET newkey ┌──────────────┐
    └───────────►│   Node B     │
                 │  (Target)    │
                 └──────────────┘

Step 4: 정상 응답
┌────────┐ "value"  ┌──────────────┐
│ Client │◄─────────│   Node B     │
└────────┘          │  (Target)    │
                    └──────────────┘
```

### 5. 장애 감지 및 페일오버 과정

**공식 문서의 장애 감지 플래그:**
> "There are two flags that are used for failure detection that are called PFAIL and FAIL. PFAIL means Possible failure, and is a non-acknowledged failure type. FAIL means that a node is failing and that this condition was confirmed by a majority of masters"

```
┌─────────────────────────────────────────────────────────────────┐
│                     장애 감지 프로세스                           │
└─────────────────────────────────────────────────────────────────┘

Step 1: PFAIL 감지 (NODE_TIMEOUT 초과)
┌─────────────┐  No Response for  ┌─────────────┐
│   Master A  │  NODE_TIMEOUT     │   Master B  │
│             │◄────────X─────────│  (Failed)   │
└─────────────┘                   └─────────────┘
      │
      ▼
  Mark B as PFAIL

Step 2: 가십을 통한 정보 수집
┌─────────────┐                   ┌─────────────┐
│   Master A  │◄── Gossip Msg ──► │   Master C  │
│ (B=PFAIL)   │                   │ (B=PFAIL)   │
└─────────────┘                   └─────────────┘
      │                                 │
      └──── Share PFAIL status ─────────┘

Step 3: FAIL 상태로 승격 (과반수 합의)
┌─────────────────────────────────────────────────────────────┐
│ 공식문서: "A PFAIL condition is escalated to a FAIL when:" │
│ - Node A has another node B flagged as PFAIL               │
│ - Node A collected info from majority of masters           │
│ - Majority signaled PFAIL/FAIL within validity time       │
└─────────────────────────────────────────────────────────────┘

Step 4: 레플리카 선출 과정
┌───────────────┐ FAILOVER_AUTH_REQUEST ┌─────────────┐
│  Replica B1   │──────────────────────► │  Master A   │
│ (후보자)       │                        │ (투표자)     │
│ currentEpoch++│                        │             │
└───────────────┘                        └─────────────┘
       │                                        │
       ▼                                        ▼
Wait for majority                       Grant FAILOVER_AUTH_ACK
       │                                        │
       ▼                                        │
┌───────────────┐                              │
│   Master B    │◄─────────────────────────────┘
│ (새로운 마스터) │
│ configEpoch++ │
└───────────────┘

Step 5: 설정 전파
┌───────────────┐ PONG (Broadcast) ┌─────────────┐
│   Master B    │─────────────────► │ All Nodes  │
│ (New Master)  │                   │            │
│ Higher Epoch  │                   │ Update     │
└───────────────┘                   │ Config     │
                                    └─────────────┘
```

### 6. 설정 전파 메커니즘

**공식 문서의 설정 전파 규칙:**
> "Rule 1: If a hash slot is unassigned (set to NULL), and a known node claims it, I'll modify my hash slot table"
> "Rule 2: If a hash slot is already assigned, and a known node is advertising it using a configEpoch that is greater than the configEpoch of the master currently associated with the slot, I'll rebind the hash slot to the new node"

```
┌─────────────────────────────────────────────────────────────────┐
│              Configuration Epoch 기반 충돌 해결                  │
└─────────────────────────────────────────────────────────────────┘

초기 상태:
┌─────────────────────────────────────────┐
│ Slot 1 → Node A [configEpoch: 3]       │
│ Slot 2 → Node A [configEpoch: 3]       │
│ Slot 3 → Node A [configEpoch: 3]       │
└─────────────────────────────────────────┘

페일오버 발생:
┌─────────────────────────────────────────┐
│ Replica B 승격 → configEpoch = 4        │
│ (Higher than Node A's epoch 3)          │
└─────────────────────────────────────────┘

페일오버 후 (Rule 2 적용):
┌─────────────────────────────────────────┐
│ Slot 1 → Node B [configEpoch: 4] ✓     │
│ Slot 2 → Node B [configEpoch: 4] ✓     │
│ Slot 3 → Node B [configEpoch: 4] ✓     │
└─────────────────────────────────────────┘

공식 문서: "last failover wins implicit merge function"

┌─────────────────────────────────────────────────────────────────┐
│                    하트비트 메시지 구조                          │
├─────────────────────────────────────────────────────────────────┤
│ Header:                                                         │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ - Node ID (160-bit random number)                          │ │
│ │ - currentEpoch / configEpoch                               │ │
│ │ - Node Flags (master/replica/fail/pfail)                  │ │
│ │ - Slot bitmap (16384 bits)                                │ │
│ │ - TCP base port / Cluster port                            │ │
│ │ - Cluster state (ok/fail)                                 │ │
│ │ - Master node ID (if replica)                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Gossip Section:                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ - Random subset of known nodes                              │ │
│ │ - For each node: ID, IP, port, flags                       │ │
│ │ - Proportional to cluster size                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 7. 공식 문서의 실제 출력 예시

**CLUSTER NODES 명령 출력 (공식 문서에서):**

```
$ redis-cli cluster nodes
d1861060fe6a534d42d8a19aeb36600e18785e04 127.0.0.1:6379 myself - 0 1318428930 1 connected 0-1364
3886e65cc906bfd9b1f7e7bde468726a052d1dae 127.0.0.1:6380 master - 1318428930 1318428931 2 connected 1365-2729
d289c575dcbc4bdd2931585fd4339089e461a27d 127.0.0.1:6381 master - 1318428931 1318428931 3 connected 2730-4095
```

**CLUSTER SLOTS 명령 출력 (공식 문서에서):**

```
127.0.0.1:7000> cluster slots
1) 1) (integer) 5461      ← 슬롯 범위 시작
   2) (integer) 10922     ← 슬롯 범위 끝
   3) 1) "127.0.0.1"      ← 마스터 IP
      2) (integer) 7001   ← 마스터 포트
   4) 1) "127.0.0.1"      ← 레플리카 IP
      2) (integer) 7004   ← 레플리카 포트
```

### 8. 레플리카 마이그레이션

**공식 문서의 레플리카 마이그레이션 시나리오:**
> "Master A has a single replica A1. Master A fails. A1 is promoted as new master. Three hours later A1 fails... No other replica is available for promotion since node A is still down."

```
┌─────────────────────────────────────────────────────────────────┐
│                   레플리카 마이그레이션 과정                      │
└─────────────────────────────────────────────────────────────────┘

초기 상태:
┌─────────┐      ┌─────────┐      ┌─────────┐
│Master A │      │Master B │      │Master C │
└────┬────┘      └────┬────┘      └────┬────┘
     │                │                │
┌────▼────┐      ┌────▼────┐      ┌────▼────┐ ┌─────────┐
│Replica  │      │Replica  │      │Replica  │ │Replica  │
│   A1    │      │   B1    │      │   C1    │ │   C2    │
└─────────┘      └─────────┘      └─────────┘ └─────────┘

Master A 장애 후:
┌─────────┐      ┌─────────┐      ┌─────────┐
│Master A1│      │Master B │      │Master C │
│(승격됨)  │      └────┬────┘      └────┬────┘
└────┬────┘           │                │
     │           ┌────▼────┐      ┌────▼────┐ ┌─────────┐
     │           │Replica  │      │Replica  │ │Replica  │
     │           │   B1    │      │   C1    │ │   C2    │
     │           └─────────┘      └─────────┘ └────┬────┘
     │                                            │
     │                                            │
     └◄───────── 마이그레이션 ────────────────────┘

최종 상태 (A1에 백업 확보):
┌─────────┐      ┌─────────┐      ┌─────────┐
│Master A1│      │Master B │      │Master C │
└────┬────┘      └────┬────┘      └────┬────┘
     │                │                │
┌────▼────┐      ┌────▼────┐      ┌────▼────┐
│Replica  │      │Replica  │      │Replica  │
│   C2    │      │   B1    │      │   C1    │
│(마이그레이션)  │           │                │
└─────────┘      └─────────┘      └─────────┘

공식문서 마이그레이션 알고리즘:
"The acting replica is the replica among the masters with 
the maximum number of attached replicas, that is not in 
FAIL state and has the smallest node ID."
```

---

## 실무에서 겪은 사고: 마스터와 레플리카를 같은 노드에 둔 대가

스펙을 읽기 전, 노드 3대에 마스터와 레플리카를 하나씩(총 6개 컨테이너) 올려서 운영한 적이 있다. 그런데 마스터와 그 마스터의 레플리카를 **같은 노드**에 배치해뒀다. 노드 점검 한 번으로 클러스터 전체가 망가지는 사고가 났다.

원인은 착각이었다. 마스터 하나가 죽으면 다른 마스터가 대신 처리해줄 거라고, 파티션을 여러 브로커가 나눠 갖고 하나가 죽으면 다른 브로커가 이어받는 스트리밍 플랫폼처럼 동작할 거라 생각했다. 하지만 위에서 정리했듯 **Redis Cluster는 슬롯 단위로 마스터가 배타적으로 소유한다.** 마스터 A가 갖는 슬롯은 마스터 B나 C가 대신 처리해줄 수 없고, 오직 **A의 레플리카**만 승격해서 그 슬롯을 이어받을 수 있다.

문제는 정확히 이 지점이었다. 노드를 점검하려고 내린 순간 그 노드에 있던 마스터와, 그 마스터를 승격해야 할 레플리카가 동시에 사라졌다. 승격할 후보 자체가 없으니 해당 슬롯 범위는 그대로 접근 불가 상태가 됐다. 노드가 3대였던 덕분에 전체가 아니라 3분의 1만 죽은 것이 그나마 다행이었다.

해결은 두 단계로 했다.

1. **레플리카 교차 배치.** 마스터 A의 레플리카를 A가 있는 노드가 아니라 B나 C가 있는 노드에 둔다.
2. **노드 완전 분리.** 궁극적으로는 마스터와 그 레플리카가 물리적으로 같은 장애 도메인(같은 노드, 같은 랙)에 들지 않도록 배치 전략 자체를 바꿨다.

이 사고에서 얻은 교훈은 단순하다. **레플리케이션 기반 시스템을 도입할 때는 "장애 도메인이 무엇과 무엇을 분리시켜야 하는가"를 먼저 답으로 갖고 시작해야 한다.** 클러스터링을 지원하는 시스템이라고 해서 다 같은 방식으로 가용성을 보장하지 않는다는 것을, 장애가 나고서야 몸으로 배웠다.

---

## 정리하며

처음 던진 질문들에 대한 답이다.

**키를 나누는 기준.** 해시 슬롯이다. 키를 CRC16으로 해싱해서 16384로 나눈 나머지가 슬롯 번호가 되고, 슬롯이 노드에 배정된다.

**노드가 아니라 슬롯에 배정한다는 것이 핵심**이다. 노드를 추가하면 슬롯 일부를 새 노드로 옮기면 되고, **옮기지 않은 슬롯의 키는 그대로 있다.** 클라이언트에서 노드 수로 나누는 방식이 노드가 바뀔 때마다 거의 모든 키의 위치가 바뀌는 것과 대비된다.

**16384라는 숫자에도 이유가 있다.** 노드끼리 슬롯 배정 정보를 비트맵으로 주고받는데, 16384비트면 2킬로바이트다. 이 크기라면 하트비트 메시지에 매번 실어 보내도 부담이 없다.

**클라이언트가 어디로 물어봐야 하는지 아는 방법.** 처음에는 모른다. 아무 노드에나 물어보고, 그 노드가 자기 것이 아니면 `MOVED` 응답으로 올바른 노드를 알려준다. **클라이언트가 그 정보를 캐시해서 다음부터는 바로 간다.**

슬롯을 옮기는 중에는 `ASK`라는 다른 응답이 온다. `MOVED`는 "앞으로 계속 저기로 가라"이고 `ASK`는 "이번만 저기로 가라"다. **이동이 아직 안 끝났으니 캐시를 갱신하면 안 된다는 뜻**이다.

**노드가 죽은 것을 누가 판단하는가.** 혼자 판단하지 않는다. 어떤 노드가 응답을 안 하면 일단 "아마 죽은 것 같다"고 표시하고, 그 판단을 하트비트에 실어 다른 노드들에게 알린다. **과반수의 마스터가 같은 판단을 하면 그때 확정된다.**

혼자 판단하게 두면 네트워크가 잠깐 끊긴 노드가 멀쩡한 노드를 죽었다고 처리할 수 있다. 과반수를 요구해서 그 오판을 막는다.

**여러 키를 한 번에 다루는 명령.** 키들이 같은 슬롯에 있어야만 된다. 서로 다른 노드에 흩어져 있으면 Redis가 처리할 방법이 없다.

그래서 **해시 태그**가 있다. 키 이름에 중괄호를 넣으면 그 안의 문자열만으로 슬롯을 계산한다. `user:{1000}:profile`과 `user:{1000}:settings`는 같은 슬롯에 들어간다.

**함께 다뤄야 할 키를 미리 묶어두는 설계가 필요하다는 뜻**이고, 이건 클러스터로 옮기기 전에 정해야 한다. 나중에 키 이름을 바꾸는 것은 곧 전체 재배치다.

스펙 문서를 읽고 나서 남은 감각은 **슬롯이라는 중간 층 하나가 많은 것을 가능하게 한다는 것**이었다. 키를 노드에 직접 매핑하지 않고 슬롯을 거치게 한 것만으로 노드 추가와 제거가 부분 이동이 됐고, 그 배정 정보가 작아서 노드끼리 계속 주고받을 수 있게 됐다.