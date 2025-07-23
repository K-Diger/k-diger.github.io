---

title: 엘라스틱서치 내부 동작과 궁금증 고찰
date: 2025-07-23
categories: [Elasticsearch]
tags: [Elasticsearch]
layout: post
toc: true
math: true
mermaid: true

---

## 목차

1. [엘라스틱서치 데이터 저장 단위](#1-엘라스틱서치-데이터-저장-단위)
2. [프라이머리 샤드와 레플리카 샤드](#2-프라이머리-샤드와-레플리카-샤드)
3. [샤드 분배 원리와 알고리즘](#3-샤드-분배-원리와-알고리즘)
4. [샤드 설정과 기본값](#4-샤드-설정과-기본값)
5. [클라이언트 조회 메커니즘](#5-클라이언트-조회-메커니즘)
6. [고급 토픽과 베스트 프랙티스](#6-고급-토픽과-베스트-프랙티스)
7. [참고 자료](#7-참고-자료)

---

## 1. 엘라스틱서치 데이터 저장 단위

엘라스틱서치는 분산 검색 엔진으로, 데이터를 효율적으로 저장하고 검색하기 위해 계층적 구조를 사용한다.

### 1.1 계층적 구조

```
클러스터 (Cluster)
├── 노드 (Node) 1
│   ├── 인덱스 (Index) A
│   │   ├── 샤드 (Shard) 0
│   │   └── 샤드 (Shard) 1
│   └── 인덱스 (Index) B
└── 노드 (Node) 2
    └── 인덱스 (Index) A
        ├── 샤드 (Shard) 2
        └── 레플리카 샤드
```

### 1.2 각 구성 요소의 역할

**클러스터 (Cluster)**
- 전체 엘라스틱서치 시스템의 최상위 단위
- 하나 이상의 노드로 구성
- 고유한 클러스터명으로 식별

**노드 (Node)**
- 클러스터를 구성하는 개별 서버 인스턴스
- 데이터 저장과 검색 기능을 담당
- 역할별로 마스터, 데이터, 조정 노드로 구분

**인덱스 (Index)**
- 관계형 DB의 데이터베이스와 유사한 개념
- 유사한 특성의 문서들을 논리적으로 그룹화

**샤드 (Shard)**
- 인덱스를 물리적으로 분할한 단위
- 아파치 루씬(Apache Lucene) 인덱스 하나에 해당
- 실제 데이터 저장과 검색이 수행되는 최소 단위

**도큐먼트 (Document)**
- JSON 형태의 실제 데이터
- 관계형 DB의 행(row)에 해당

---

## 2. 프라이머리 샤드와 레플리카 샤드

### 2.1 프라이머리 샤드 (Primary Shard)

프라이머리 샤드는 원본 데이터를 저장하는 샤드이다.

**특징:**
- 인덱스의 실제 데이터를 보유
- 쓰기 요청을 최초로 처리
- 인덱스 생성 시 개수가 결정되며 이후 변경 불가 (Shrink API 제외)
- 읽기와 쓰기 모두 처리 가능

### 2.2 레플리카 샤드 (Replica Shard)

레플리카 샤드는 프라이머리 샤드의 복사본이다.

**특징:**
- 프라이머리 샤드의 정확한 복사본
- 고가용성과 검색 성능 향상을 위해 사용
- 읽기 요청 처리 가능 (쓰기는 프라이머리를 통해서만)
- 개수를 언제든 동적으로 변경 가능
- 프라이머리와 절대 같은 노드에 배치되지 않음

### 2.3 분산 배치 원칙

```
노드 1: P0, R1, R2
노드 2: P1, R0, R2  
노드 3: P2, R0, R1

P = Primary, R = Replica, 숫자 = 샤드 번호
```

**핵심 원칙:**
1. **고가용성**: 프라이머리와 레플리카를 다른 노드에 분리
2. **부하 분산**: 모든 노드에 샤드를 균등하게 배치
3. **장애 대응**: 노드 장애 시에도 데이터 접근 보장

---

## 3. 샤드 분배 원리와 알고리즘

### 3.1 도큐먼트 라우팅 (Document Routing)

새로운 도큐먼트가 인덱싱될 때 어느 샤드에 저장할지 결정하는 과정이다. ([공식 문서: _routing field](https://www.elastic.co/guide/en/elasticsearch/reference/current/mapping-routing-field.html))

#### 3.1.1 기본 라우팅 공식

```
shard_num = hash(_routing) % number_of_primary_shards
```

- `_routing`: 기본값은 도큐먼트 ID (_id)
- `hash()`: 해시 함수 (DJB 해시 알고리즘 사용)
- `number_of_primary_shards`: 프라이머리 샤드 개수

#### 3.1.2 상세 라우팅 공식 (ES 7.0+)

```
routing_factor = num_routing_shards / num_primary_shards
shard_num = (hash(_routing) % num_routing_shards) / routing_factor
```

### 3.2 샤드 할당 알고리즘

#### 3.2.1 BalancedShardsAllocator

엘라스틱서치의 기본 샤드 할당 알고리즘은 `BalancedShardsAllocator`이다.

**3단계 처리:**
1. **미할당 샤드 할당** (Allocate Unassigned Shards)
2. **샤드 이동** (Move Shards)  
3. **리밸런싱** (Rebalance Shards)

#### 3.2.2 할당 결정자 (Allocation Deciders)

샤드를 특정 노드에 배치할 수 있는지 판단하는 규칙들:

**주요 결정자:**
- `SameShardAllocationDecider`: 프라이머리와 레플리카 동일 노드 배치 금지
- `DiskThresholdDecider`: 디스크 사용량 기반 할당 제한
- `AwarenessAllocationDecider`: 가용성 영역 인식 배치
- `FilterAllocationDecider`: 사용자 정의 필터 적용

#### 3.2.3 가중치 기반 선택

```java
// 의사코드
for (Node node : eligibleNodes) {
    weight = calculateWeight(node);
    if (weight < minWeight) {
        minWeight = weight;
        selectedNode = node;
    }
}
```

**가중치 계산 요소:**
- 노드별 샤드 개수
- 인덱스별 샤드 분산도
- 디스크 사용률
- 노드 속성

### 3.3 리밸런싱 트리거

**자동 리밸런싱 조건:**
- 새 노드 추가/제거
- 디스크 워터마크 초과 (기본: low 85%, high 90%)
- 수동 샤드 이동
- 할당 관련 설정 변경

---

## 4. 샤드 설정과 기본값

### 4.1 기본값 변화

| 버전 | 프라이머리 샤드 | 레플리카 샤드 |
|------|----------------|---------------|
| ES 6.x 이전 | 5개 | 1개 |
| ES 7.0+ | 1개 | 1개 |

### 4.2 샤드 수 설정 방법

#### 4.2.1 인덱스 생성 시 설정

```json
PUT /my_index
{
  "settings": {
    "number_of_shards": 5,
    "number_of_replicas": 2
  }
}
```

#### 4.2.2 레플리카 수 동적 변경

```json
PUT /my_index/_settings
{
  "number_of_replicas": 3
}
```

#### 4.2.3 인덱스 템플릿으로 기본값 변경

```json
PUT /_template/default_template
{
  "index_patterns": ["*"],
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1
  }
}
```

### 4.3 분배 시나리오 분석

**시나리오: 프라이머리 5개, 레플리카 3개, 노드 3개**

```
총 샤드 수: 5 + (5 × 3) = 20개
노드당 평균: 20 ÷ 3 ≈ 6.7개

실제 분배:
노드 1: P0, P3, R1-1, R2-2, R4-1, R0-3, R1-3 (7개)
노드 2: P1, P4, R0-1, R2-1, R3-2, R0-2, R4-3 (7개)  
노드 3: P2, R1-2, R3-1, R4-2, R2-3, R3-3 (6개)
```

---

## 5. 클라이언트 조회 메커니즘

### 5.1 검색 라우팅 프로세스

```
클라이언트 요청
    ↓
조정 노드 (Coordinating Node)
    ↓
필요한 샤드 식별
    ↓
적응형 레플리카 선택 (ARS)
    ↓
병렬 검색 실행
    ↓
결과 수집 및 병합
    ↓
클라이언트 응답
```

### 5.2 적응형 레플리카 선택 (Adaptive Replica Selection)

#### 5.2.1 개요

- **도입 버전**: ES 6.1 ([GitHub Issue #24915](https://github.com/elastic/elasticsearch/issues/24915))
- **기본 활성화**: ES 7.0+ ([GitHub PR #26522](https://github.com/elastic/elasticsearch/pull/26522))
- **목적**: 실시간 노드 상태 기반 최적 샤드 선택 ([공식 문서: Search shard routing](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-shard-routing.html))

#### 5.2.2 선택 기준

**평가 요소:**
1. **응답 시간**: 이전 요청들의 평균 응답 시간
2. **노드 부하**: CPU, 메모리, 디스크 사용률
3. **큐 상태**: 검색 스레드풀의 대기 큐 크기
4. **검색 시간**: 해당 노드에서의 이전 검색 소요 시간

#### 5.2.3 ARS vs 라운드 로빈

| 방식 | 장점 | 단점 |
|------|------|------|
| 라운드 로빈 | 구현 단순 | 노드 상태 무시, 꼬리 지연시간 증가 |
| ARS | 실시간 최적화, 장애 회피 | 약간의 오버헤드 |

### 5.3 실제 예시

```
시나리오: 동일 샤드가 3개 노드에 분산

노드 1 (프라이머리): 응답시간 50ms, CPU 30%, 큐 2개
노드 2 (레플리카):   응답시간 200ms, CPU 80%, 큐 10개
노드 3 (레플리카):   응답시간 30ms, CPU 20%, 큐 0개

결과: ARS가 노드 3 선택 (최적 조건)
```

---

## 6. 복제 메커니즘과 내부 동작 원리

### 6.1 Primary-Backup 복제 모델

엘라스틱서치는 [Microsoft Research의 PacificA 논문](https://www.microsoft.com/en-us/research/publication/pacifica-replication-in-log-based-distributed-storage-systems/)을 기반으로 한 Primary-Backup 모델을 사용한다. 이는 단일 권한 있는 복사본(프라이머리)과 여러 백업 복사본(레플리카)을 유지하는 방식이다. ([공식 문서: Reading and writing documents](https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-replication.html))

#### 6.1.1 복제 발생 시점

**모든 쓰기 작업 시 실시간 복제:**
- 도큐먼트 인덱싱, 업데이트, 삭제
- 매핑 변경, 설정 업데이트
- 벌크 작업의 각 개별 연산

**복제 프로세스:**
```
1. 클라이언트 → 조정 노드
2. 라우팅으로 대상 프라이머리 샤드 식별
3. 프라이머리에서 작업 검증 및 실행
4. 모든 in-sync 레플리카로 병렬 전송
5. 레플리카들에서 작업 완료 대기
6. 클라이언트에 성공 응답
```

#### 6.1.2 In-Sync Allocation 메커니즘

엘라스틱서치는 어떤 샤드 복사본이 최신 상태를 유지하는지 추적하기 위해 **in-sync copies** 목록을 관리한다. ([Elastic Blog: Tracking in-sync shard copies](https://www.elastic.co/blog/tracking-in-sync-shard-copies))

**핵심 개념:**
- **Allocation ID**: 각 샤드 복사본의 고유 식별자
- **In-Sync Set**: 최신 데이터를 보유한 샤드들의 ID 집합
- **마스터 노드 관리**: 클러스터 상태에 in-sync allocation 정보 저장

```json
{
  "allocation_ids": {
    "in_sync": ["alloc_id_primary", "alloc_id_replica_1", "alloc_id_replica_2"],
    "unassigned": []
  }
}
```

**In-Sync 보장 원칙:**
- 프라이머리는 in-sync set의 모든 샤드에 작업을 복제해야 함
- 복제 실패 시 해당 샤드를 in-sync set에서 제거
- 새 프라이머리는 반드시 in-sync set의 구성원 중에서 선택

### 6.2 복제 실패 처리와 복구 메커니즘

#### 6.2.1 Write Availability 전략

네트워크 분할이나 노드 장애로 일부 레플리카에 작업이 전파되지 않을 때, 엘라스틱서치는 **가용성을 우선시**한다:

```java
// 의사코드
handle_replication_failure(failed_replicas) {
    // 쓰기 요청을 실패시키지 않고 계속 진행
    remove_from_in_sync_set(failed_replicas);
    notify_master_node(failed_replicas);
    acknowledge_to_client(); // 성공으로 응답
}
```

**장점:**
- 일시적 네트워크 문제로 인한 서비스 중단 방지
- 높은 쓰기 처리량 유지

**단점:**
- 일시적 데이터 불일치 가능성
- 복구 과정에서 추가 네트워크 트래픽 발생

#### 6.2.2 Peer Recovery 프로세스

레플리카가 일시적으로 오프라인 상태였다가 복귀하면 **Peer Recovery**가 시작된다: ([공식 문서: Index recovery settings](https://www.elastic.co/guide/en/elasticsearch/reference/current/recovery.html))

**1. Global Checkpoint 확인**
```
- 마지막으로 동기화된 상태 식별
- 누락된 작업의 범위 계산
```

**2. Translog 기반 복구**
```
- Primary의 translog에서 누락된 작업 추출
- 순차적으로 replica에 적용
- 복구 완료 후 in-sync set에 재참여
```

**3. 완전 복구 (Full Recovery)**
```
- 너무 많은 작업이 누락된 경우
- 프라이머리에서 전체 샤드 데이터 복사
- Lucene segment 파일들을 네트워크로 전송
```

#### 6.2.3 지연된 할당 (Delayed Allocation)

노드가 클러스터를 떠날 때 즉시 샤드를 재할당하지 않고 기본 1분간 대기한다: ([공식 문서: Delaying allocation when a node leaves](https://www.elastic.co/guide/en/elasticsearch/reference/current/delayed-allocation.html))

```json
PUT /_all/_settings
{
  "settings": {
    "index.unassigned.node_left.delayed_timeout": "1m"
  }
}
```

**이유:**
- 불필요한 네트워크 트래픽 방지
- 노드가 곧 복귀할 가능성 고려
- 리소스 낭비 최소화

### 6.3 Adaptive Replica Selection (ARS) 상세 분석

#### 6.3.1 알고리즘 배경

ARS는 **[C3: Cutting Tail Latency in Cloud Data Stores via Adaptive Replica Selection](https://www.cs.cmu.edu/~dga/papers/c3-nsdi2015.pdf)** 논문을 기반으로 구현되었다. 원래 Cassandra용으로 개발된 알고리즘을 엘라스틱서치 환경에 맞게 수정했다. ([Elastic Blog: Improving Response Latency](https://www.elastic.co/blog/improving-response-latency-in-elasticsearch-with-adaptive-replica-selection))

#### 6.3.2 핵심 공식과 구현

**레플리카 순위 계산 공식:**
```
Ψ(s) = R(s) + μ̄(s) + (q(s) × b) + (os(s) × n)
```

**변수 상세:**
- `R(s)`: 응답 시간의 EWMA (α=0.3)
- `μ̄(s)`: 서비스 시간의 EWMA (α=0.3)  
- `q(s)`: 큐 크기의 EWMA (α=0.3)
- `os(s)`: 해당 노드에 대한 미처리 요청 수
- `n`: 동시 클라이언트 수
- `b`: 큐 페널티 가중치 (기본값: 4)

**EWMA 계산:**
```java
// Exponentially Weighted Moving Average
new_ewma = α × new_value + (1 - α) × old_ewma
```

#### 6.3.3 메트릭 수집과 피기백킹

각 검색 요청과 함께 성능 메트릭이 조정 노드로 전송된다:

```json
{
  "shard_response": {
    "data": "...",
    "metrics": {
      "queue_size": 5,
      "service_time_ewma": 150.5,
      "response_time": 234.2
    }
  }
}
```

**수집되는 메트릭:**
- **큐 크기**: 검색 스레드풀의 현재 대기 작업 수
- **서비스 시간**: 실제 검색 처리 소요 시간
- **응답 시간**: 조정 노드에서 측정한 전체 응답 시간

#### 6.3.4 선택 알고리즘 구현

```java
// 의사코드 - ARS 레플리카 선택
ReplicaShard selectBestReplica(List<ReplicaShard> availableReplicas) {
    ReplicaShard bestReplica = null;
    double bestScore = Double.MAX_VALUE;
    
    for (ReplicaShard replica : availableReplicas) {
        ArsStats stats = getArsStats(replica);
        
        double responseTimeEwma = stats.getResponseTimeEwma();
        double serviceTimeEwma = stats.getServiceTimeEwma();
        double queueSizeEwma = stats.getQueueSizeEwma();
        int outstandingRequests = stats.getOutstandingRequests();
        
        // C3 공식 적용
        double score = responseTimeEwma + serviceTimeEwma + 
                      (queueSizeEwma * QUEUE_PENALTY_WEIGHT) +
                      (outstandingRequests * CLIENT_COUNT);
        
        if (score < bestScore) {
            bestScore = score;
            bestReplica = replica;
        }
    }
    
    // 선택된 레플리카의 통계 업데이트를 위한 조정
    adjustStatsForNonBroadcast(bestReplica, availableReplicas);
    
    return bestReplica;
}
```

#### 6.3.5 성능 벤치마크 결과

**부하가 있는 환경 (1개 노드에 인위적 부하):**
- 처리량: 52 ops/s → 86 ops/s (**65% 향상**)
- 50th percentile 지연시간: **27% 감소**
- 95th percentile 지연시간: **28% 감소**
- 99th percentile 지연시간: **26% 감소**

**부하가 없는 환경:**
- 처리량: **11% 향상**
- 지연시간: 대부분 동일하거나 소폭 개선

### 6.4 샤드 할당 알고리즘 내부 구조

#### 6.4.1 BalancedShardsAllocator 상세

엘라스틱서치의 기본 샤드 할당기인 `BalancedShardsAllocator`는 3단계로 작동한다: ([AWS Blog: Demystifying Elasticsearch shard allocation](https://aws.amazon.com/blogs/opensource/open-distro-elasticsearch-shard-allocation/))

**1. 미할당 샤드 할당 (Allocate Unassigned)**
```java
// 의사코드
allocateUnassigned() {
    for (UnassignedShard shard : unassignedShards) {
        List<Node> eligibleNodes = getAllocationDeciders()
            .getEligibleNodes(shard);
        
        Node targetNode = selectBestNode(eligibleNodes, shard);
        if (targetNode != null) {
            allocateShardToNode(shard, targetNode);
        }
    }
}
```

**2. 샤드 이동 (Move Shards)**
```java
// 제약 조건 위반 시 샤드 이동
moveShards() {
    for (Shard shard : allocatedShards) {
        if (violatesConstraints(shard)) {
            Node newNode = findBetterNode(shard);
            if (newNode != null) {
                moveShard(shard, newNode);
            }
        }
    }
}
```

**3. 리밸런싱 (Rebalance)**
```java
// 클러스터 균형 개선
rebalance() {
    while (clusterNeedsRebalancing()) {
        ShardMove bestMove = findBestRebalanceMove();
        if (bestMove.improvesBalance()) {
            executeMove(bestMove);
        } else {
            break; // 더 이상 개선 불가
        }
    }
}
```

#### 6.4.2 할당 결정자 (Allocation Deciders) 체인

샤드를 특정 노드에 할당할 수 있는지 판단하는 규칙들: ([공식 문서: Cluster-level shard allocation](https://www.elastic.co/guide/en/elasticsearch/reference/current/modules-cluster.html))

**주요 결정자들:**
1. **SameShardAllocationDecider**: 프라이머리와 레플리카 동일 노드 배치 금지
2. **DiskThresholdDecider**: 디스크 사용량 기반 할당 제한
3. **AwarenessAllocationDecider**: 가용성 영역 인식 배치
4. **FilterAllocationDecider**: 사용자 정의 필터 적용
5. **ReplicaAfterPrimaryActiveAllocationDecider**: 프라이머리 활성화 후 레플리카 할당

```java
// 결정자 체인 실행
Decision canAllocate(ShardRouting shard, RoutingNode node) {
    for (AllocationDecider decider : allocationDeciders) {
        Decision decision = decider.canAllocate(shard, node, allocation);
        if (decision.type() == Decision.Type.NO) {
            return decision; // 하나라도 거부하면 할당 불가
        }
    }
    return Decision.YES;
}
```

#### 6.4.3 가중치 기반 노드 선택

```java
// 노드별 가중치 계산
float calculateWeight(RoutingNode node, String index) {
    float weight = 0;
    
    // 노드별 전체 샤드 수 가중치
    weight += node.numberOfShardsWithState(STARTED) * indexBalance;
    
    // 인덱스별 샤드 분산 가중치  
    weight += node.numberOfShardsOfIndex(index) * shardBalance;
    
    // 프라이머리 샤드 가중치
    weight += node.numberOfShardsWithState(STARTED, true) * primaryBalance;
    
    return weight;
}
```

### 6.5 디스크 기반 할당과 워터마크

#### 6.5.1 3단계 디스크 관리

([공식 문서: Disk-based shard allocation](https://www.elastic.co/guide/en/elasticsearch/reference/current/modules-cluster.html#disk-based-shard-allocation))

```json
{
  "cluster.routing.allocation.disk.watermark.low": "85%",
  "cluster.routing.allocation.disk.watermark.high": "90%", 
  "cluster.routing.allocation.disk.watermark.flood_stage": "95%"
}
```

**동작 원리:**
- **Low watermark (85%)**: 새 샤드 할당 금지
- **High watermark (90%)**: 기존 샤드를 다른 노드로 이동 시작
- **Flood stage (95%)**: 해당 노드의 모든 인덱스에 쓰기 차단

#### 6.5.2 디스크 할당 결정 로직

```java
// 의사코드
Decision canAllocateOnDisk(ShardRouting shard, RoutingNode node) {
    DiskUsage diskUsage = getDiskUsage(node);
    
    if (diskUsage.getFreeBytesPercent() < lowWatermark) {
        return Decision.NO("disk usage exceeded low watermark");
    }
    
    long shardSize = getShardSize(shard);
    if (diskUsage.getFreeBytes() < shardSize + minimumFreeSpace) {
        return Decision.NO("insufficient disk space for shard");
    }
    
    return Decision.YES;
}
```

---

## 7. 고급 토픽과 베스트 프랙티스

### 6.1 샤드 크기 최적화

#### 6.1.1 권장 크기

- **샤드 크기**: 20-40GB
- **노드당 샤드 수**: heap GB당 25개 이하
- **최대 샤드 수**: 클러스터당 1,000-10,000개

#### 6.1.2 성능 고려사항

```java
// 의사코드: 최적 샤드 수 계산
optimalShards = Math.max(
    Math.ceil(totalDataSize / 40GB),
    Math.ceil(expectedQPS / 1000)
);
```

### 6.2 클러스터 상태 관리

#### 6.2.1 상태 색상

- **🟢 Green**: 모든 프라이머리와 레플리카 샤드 활성
- **🟡 Yellow**: 프라이머리는 활성, 일부 레플리카 미할당
- **🔴 Red**: 일부 프라이머리 샤드 미할당

#### 6.2.2 진단 API

```bash
# 클러스터 상태 확인
GET /_cluster/health

# 샤드 할당 설명
GET /_cluster/allocation/explain

# 샤드 상태 조회  
GET /_cat/shards?v
```

### 6.3 할당 인식 (Allocation Awareness)

#### 6.3.1 랙 인식 설정

```yaml
# elasticsearch.yml
node.attr.rack_id: rack1
cluster.routing.allocation.awareness.attributes: rack_id
```

#### 6.3.2 강제 인식 (Forced Awareness)

```yaml
cluster.routing.allocation.awareness.force.zone.values: zone1,zone2
```

### 6.4 디스크 기반 할당

#### 6.4.1 워터마크 설정

```json
{
  "cluster.routing.allocation.disk.watermark.low": "85%",
  "cluster.routing.allocation.disk.watermark.high": "90%",
  "cluster.routing.allocation.disk.watermark.flood_stage": "95%"
}
```

#### 6.4.2 동작 원리

1. **Low watermark**: 새 샤드 할당 금지
2. **High watermark**: 기존 샤드 이동 시작
3. **Flood stage**: 인덱싱 차단

### 6.5 커스텀 라우팅

#### 6.5.1 사용자 정의 라우팅

```json
PUT /my-index/_doc/1?routing=user123
{
  "user_id": "user123",
  "message": "Hello World"
}
```

#### 6.5.2 라우팅 파티션

```json
PUT /my-index
{
  "settings": {
    "index.routing_partition_size": 3,
    "number_of_shards": 6
  },
  "mappings": {
    "_routing": {
      "required": true
    }
  }
}
```

**공식:**
```
routing_value = hash(_routing) + hash(_id) % routing_partition_size
shard_num = (routing_value % num_routing_shards) / routing_factor
```

### 6.6 운영 베스트 프랙티스

#### 6.6.1 모니터링 지표

```bash
# 주요 모니터링 명령어
GET /_cluster/stats
GET /_nodes/stats
GET /_cat/nodes?v&h=name,heap.percent,disk.used_percent,load_1m
GET /_cat/indices?v&s=store.size:desc
```

#### 6.6.2 성능 튜닝

**인덱싱 성능:**
- `refresh_interval` 조정: 기본 1s → 30s
- `number_of_replicas` 임시 0 설정
- 벌크 요청 크기 최적화 (5-15MB)

**검색 성능:**
- 적절한 샤드 수 설정
- 필터 캐시 활용
- 필드 데이터 최적화

#### 6.6.3 장애 대응

**일반적인 문제와 해결:**

1. **샤드 미할당**
   ```bash
   GET /_cluster/allocation/explain
   POST /_cluster/reroute?retry_failed=true
   ```

2. **디스크 부족**
   ```bash
   PUT /_cluster/settings
   {
     "transient": {
       "cluster.routing.allocation.disk.watermark.low": "95%"
     }
   }
   ```

3. **노드 제외**
   ```bash
   PUT /_cluster/settings
   {
     "transient": {
       "cluster.routing.allocation.exclude._ip": "10.0.0.1"
     }
   }
   ```

### 7.7 ARS 설정과 모니터링

#### 7.7.1 ARS 활성화 및 설정

**버전별 기본값:**
- ES 6.1+: 사용 가능하지만 기본 비활성화
- ES 7.0+: 기본 활성화

**동적 설정:**
```json
PUT /_cluster/settings
{
  "transient": {
    "cluster.routing.use_adaptive_replica_selection": true
  }
}
```

#### 7.7.2 ARS 성능 모니터링

```bash
# 노드별 검색 통계 확인
GET /_nodes/stats/indices/search

# 큐 상태 모니터링
GET /_cat/thread_pool/search?v&h=node_name,queue,active,rejected

# 샤드별 응답 시간 분석
GET /_cat/shards?v&h=index,shard,prirep,state,node&s=index
```

**주요 모니터링 지표:**
- 검색 레이턴시 분포
- 노드별 큐 크기 변화
- 레플리카 선택 패턴

---

## 8. 참고 자료

### 7.1 공식 문서

1. [Elasticsearch Guide - Cluster-level shard allocation](https://www.elastic.co/guide/en/elasticsearch/reference/current/modules-cluster.html)
2. [Search shard routing](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-shard-routing.html)
3. [_routing field](https://www.elastic.co/guide/en/elasticsearch/reference/current/mapping-routing-field.html)
4. [Index shard allocation](https://www.elastic.co/guide/en/elasticsearch/reference/current/index-modules-allocation.html)

### 7.2 블로그 및 기술 자료

1. [Improving Response Latency in Elasticsearch with Adaptive Replica Selection](https://www.elastic.co/blog/improving-response-latency-in-elasticsearch-with-adaptive-replica-selection) - Elastic Blog
2. [Demystifying Elasticsearch shard allocation](https://aws.amazon.com/blogs/opensource/open-distro-elasticsearch-shard-allocation/) - AWS Open Source Blog
3. [Elasticsearch Search Performance: Shard Configurations and Replica Strategies](https://medium.com/@musabdogan/elasticsearch-search-performance-shard-configurations-and-replica-strategies-f32246b11aeb) - Medium

### 7.3 운영 가이드

1. [Elasticsearch Shard Allocation - How to Resolve Unbalanced Shards](https://opster.com/guides/elasticsearch/capacity-planning/elasticsearch-shard-allocation-is-unbalanced/) - Opster
2. [Elasticsearch Shards and Replicas getting started guide](https://opster.com/blogs/elasticsearch-shards-and-replicas-getting-started-guide/) - Opster
3. [Understanding Elasticsearch Index Shard Allocation](https://medium.com/@prosenjeet.saha88/understanding-elasticsearch-index-shard-allocation-173e1a028591) - Medium

### 8.4 복제와 ARS 관련 자료

1. [Reading and writing documents](https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-replication.html) - Elasticsearch 공식 문서
2. [Tracking in-sync shard copies](https://www.elastic.co/blog/tracking-in-sync-shard-copies) - Elastic Blog
3. [Improving Response Latency with Adaptive Replica Selection](https://www.elastic.co/blog/improving-response-latency-in-elasticsearch-with-adaptive-replica-selection) - Elastic Blog
4. [Understanding Replication in Elasticsearch](https://codingexplained.com/coding/elasticsearch/understanding-replication-in-elasticsearch) - Coding Explained
5. [Index recovery settings](https://www.elastic.co/guide/en/elasticsearch/reference/current/recovery.html) - Elasticsearch 공식 문서
6. [Delaying allocation when a node leaves](https://www.elastic.co/guide/en/elasticsearch/reference/current/delayed-allocation.html) - Elasticsearch 공식 문서

### 8.5 내부 알고리즘 관련 논문

1. [PacificA: Replication in Log-Based Distributed Storage Systems](https://www.microsoft.com/en-us/research/publication/pacifica-replication-in-log-based-distributed-storage-systems/) - Microsoft Research
2. [C3: Cutting Tail Latency in Cloud Data Stores via Adaptive Replica Selection](https://www.cs.cmu.edu/~dga/papers/c3-nsdi2015.pdf) - CMU Research

1. [Cluster allocation explain API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-cluster-allocation-explain)
2. [Cluster stats API](https://www.elastic.co/guide/en/elasticsearch/reference/current/cluster-stats.html)
3. [Nodes stats API](https://www.elastic.co/guide/en/elasticsearch/reference/current/cluster-nodes-stats.html)

---

## 핵심 요약

1. **데이터 저장**: 클러스터 → 노드 → 인덱스 → 샤드 → 도큐먼트 계층 구조
2. **샤드 분류**: 프라이머리(원본) vs 레플리카(복사본), 프라이머리는 생성 후 변경 불가
3. **분배 원리**: 해시 기반 라우팅 + BalancedShardsAllocator의 3단계 할당 알고리즘
4. **복제 메커니즘**: Primary-Backup 모델 + In-Sync Allocation + 자동 복구
5. **조회 최적화**: Adaptive Replica Selection으로 실시간 성능 기반 라우팅
6. **운영 철칙**: 적절한 샤드 크기, 노드당 샤드 수 제한, 지속적인 모니터링

### 심화 이해 포인트

**복제 시점**: 모든 쓰기 작업 시 즉시 발생하며, in-sync set의 모든 레플리카에 병렬 전송된다.

**실패 처리**: Write Availability 우선 정책으로 일부 레플리카 실패 시에도 쓰기 작업을 계속 진행하고, 나중에 Peer Recovery로 동기화한다.

**ARS 알고리즘**: C3 논문 기반의 수학적 공식으로 응답시간, 큐 크기, 서비스 시간을 종합 평가하여 최적 레플리카를 선택한다.

**내부 메커니즘**: BalancedShardsAllocator가 할당 결정자 체인을 통해 제약조건을 검사하고, 가중치 기반으로 최적 노드를 선택한다.
