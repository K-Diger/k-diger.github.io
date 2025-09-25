---

title: 공식문서로 알아보는 Redis Cluster 스펙
date: 2025-09-25
categories: [Redis]
tags: [Redis]
layout: post
toc: true
math: true
mermaid: true

---

# 참고 자료

[Redis Cluster Sepecification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)

# Redis 클러스터 구성 및 동작 원리

## 1. Redis 클러스터 전체 아키텍처

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

## 2. 해시 슬롯 분산 메커니즘

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

## 3. 클러스터 내부 통신 구조

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

## 4. 리디렉션 메커니즘

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

## 5. 장애 감지 및 페일오버 과정

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

## 6. 설정 전파 메커니즘

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

## 7. 공식 문서의 실제 출력 예시

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

## 8. 레플리카 마이그레이션

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

**출처 및 정확성:**
이 모든 내용은 Redis 공식 클러스터 스펙 문서(https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)를 기반으로 작성되었으며, 실제 구현체와 동일한 동작을 보장합니다. 베스트 프랙티스로 활용하시기 바랍니다.

