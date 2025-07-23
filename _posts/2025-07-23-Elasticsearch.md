---

title: 엘라스틱서치 내부 동작과 궁금증 고찰
date: 2025-07-23
categories: [Elasticsearch]
tags: [Elasticsearch, Architecture, Sharding, Replication]
layout: post
toc: true
math: true
mermaid: true

---

엘라스틱서치를 사용하면서 궁금했던 내부 동작 원리들을 깊이 있게 탐구해보자.

## 목차

1. [데이터는 어떻게 저장되는가?](#1-데이터는-어떻게-저장되는가)
2. [프라이머리와 레플리카는 어떻게 다른가?](#2-프라이머리와-레플리카는-어떻게-다른가)
3. [샤드는 어떤 원리로 분배되는가?](#3-샤드는-어떤-원리로-분배되는가)
4. [샤드 설정은 어떻게 하는가?](#4-샤드-설정은-어떻게-하는가)
5. [클라이언트는 어떤 샤드에서 조회하는가?](#5-클라이언트는-어떤-샤드에서-조회하는가)
6. [복제는 언제 어떻게 일어나는가?](#6-복제는-언제-어떻게-일어나는가)
7. [참고할 만한 내용](#7-참고할-만한-내용)
8. [참고 자료](#8-참고-자료)

---

## 1. 데이터는 어떻게 저장되는가?

### 1.1 계층적 데이터 구조

엘라스틱서치는 분산 시스템답게 계층적 구조로 데이터를 관리한다:

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

### 1.2 각 구성 요소의 내부 역할

**클러스터 (Cluster)**
- 전체 엘라스틱서치 시스템의 최상위 단위
- 클러스터 상태(Cluster State)를 통해 모든 메타데이터 관리
- 마스터 노드가 클러스터 전체의 의사결정 담당

**노드 (Node)**
- 개별 JVM 프로세스로 실행되는 엘라스틱서치 인스턴스
- 마스터, 데이터, 조정, 인제스트 노드로 역할 분담
- 각 노드는 루씬 인덱스들을 직접 관리

**인덱스 (Index)**
- 논리적 데이터 그룹으로, 실제로는 여러 샤드로 분산 저장
- 매핑(Mapping)과 설정(Settings) 메타데이터 포함
- 관계형 DB의 데이터베이스와 유사한 개념

**샤드 (Shard)**
- 물리적 데이터 저장 단위이자 검색의 최소 실행 단위
- 각 샤드는 하나의 Apache Lucene 인덱스
- 최대 약 20억 개의 도큐먼트 저장 가능

**도큐먼트 (Document)**
- JSON 형태의 실제 데이터
- 내부적으로 Lucene Document로 변환되어 저장
- 불변(Immutable) 특성 - 업데이트 시 새 버전으로 교체

---

## 2. 프라이머리와 레플리카는 어떻게 다른가?

### 2.1 프라이머리 샤드의 내부 동작

프라이머리 샤드는 데이터의 **권한 있는 원본**이다:

**핵심 책임:**
- 모든 쓰기 요청의 진입점
- 도큐먼트 ID 기반 라우팅의 최종 목적지
- In-Sync 레플리카 집합 관리
- 버전 관리(Version Control) 담당

**쓰기 처리 프로세스:**
```java
// 엘라스틱서치 실제 구현 기반 의사코드
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/action/bulk/TransportShardBulkAction.java
public void executeBulkItemRequest(BulkPrimaryExecutionContext context, 
                                 UpdateRequest updateRequest,
                                 Consumer<Exception> onFailure,
                                 Consumer<BulkItemResponse> onSuccess,
                                 BulkItemRequest replicationRequest) {
    1. validateOperation(operation);
    2. assignSequenceNumber(operation);
    3. writeToTranslog(operation);
    4. executeOnPrimary(operation);
    5. replicateToInSyncReplicas(operation);
    6. acknowledgeToClient(operation);
}
```

### 2.2 레플리카 샤드의 내부 역할

레플리카는 **프라이머리의 정확한 복사본**이면서 독립적인 검색 엔진이다:

**주요 특징:**
- 읽기 전용 관점에서는 프라이머리와 동등한 성능
- 복제 시에만 프라이머리에 의존적
- 장애 시 프라이머리로 승격 가능

**복제 동기화 메커니즘:**
```java
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/action/support/replication/ReplicationOperation.java
public void performOnReplica(ReplicaRequest request, IndexShard replica) {
    1. receiveFromPrimary(operation);
    2. validateSequenceNumber(operation);
    3. writeToTranslog(operation);
    4. executeOperation(operation);
    5. acknowledgeToPrimary(operation);
}
```

### 2.3 분산 배치의 안전 원칙

엘라스틱서치는 고가용성을 위해 엄격한 배치 규칙을 적용한다:

```
노드 1: P0, R1, R2  ← 프라이머리 0 + 다른 레플리카들
노드 2: P1, R0, R2  ← 프라이머리 1 + 다른 레플리카들
노드 3: P2, R0, R1  ← 프라이머리 2 + 다른 레플리카들

핵심: 동일 샤드의 P와 R은 절대 같은 노드에 위치하지 않음
```

**제어 설정:**
```json
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.same_shard.host": false
  }
}
```

---

## 3. 샤드는 어떤 원리로 분배되는가?

### 3.1 도큐먼트는 어떤 샤드로 갈까?

새 도큐먼트의 샤드 결정은 **해시 기반 라우팅**으로 이루어진다. ([공식 문서: _routing field](https://www.elastic.co/guide/en/elasticsearch/reference/current/mapping-routing-field.html))

#### 3.1.1 기본 라우팅 공식

```
shard_num = hash(_routing) % number_of_primary_shards
```

**내부 동작:**
- `_routing`: 기본적으로 도큐먼트 ID (_id) 사용
- `hash()`: DJB2 해시 알고리즘으로 균등 분산 보장
- 결과: 결정론적이고 예측 가능한 샤드 선택

#### 3.1.2 상세 라우팅 공식 (ES 7.0+)

더 정밀한 제어를 위한 확장된 공식:

```
routing_factor = num_routing_shards / num_primary_shards
shard_num = (hash(_routing) % num_routing_shards) / routing_factor
```

**제어 설정:**
```json
PUT /my_index/_doc/1?routing=user123
{
  "user_id": "user123",
  "message": "Hello World"
}
```

### 3.2 샤드 할당 알고리즘의 내부 구조

#### 3.2.1 BalancedShardsAllocator의 3단계 작동

엘라스틱서치의 핵심 할당 엔진인 `BalancedShardsAllocator`는 체계적인 3단계로 작동한다. ([AWS Blog: Demystifying Elasticsearch shard allocation](https://aws.amazon.com/blogs/opensource/open-distro-elasticsearch-shard-allocation/))

**1단계: 미할당 샤드 할당 (allocateUnassigned)**

```java
// 엘라스틱서치 실제 구현 기반 의사코드
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/allocation/allocator/BalancedShardsAllocator.java
private boolean allocateUnassigned(RoutingAllocation allocation) {
    // 우선순위: 프라이머리 먼저, 그 다음 레플리카
    RoutingNodes.UnassignedShards unassigned = allocation.routingNodes().unassigned();
    
    // 인덱스 우선순위 기반 정렬 (PriorityComparator 사용)
    unassigned.sort((a, b) -> {
        int priorityA = IndexMetadata.INDEX_PRIORITY_SETTING.get(allocation.metadata().index(a.index()).getSettings());
        int priorityB = IndexMetadata.INDEX_PRIORITY_SETTING.get(allocation.metadata().index(b.index()).getSettings());
        return Integer.compare(priorityB, priorityA); // 높은 우선순위 먼저
    });
    
    for (ShardRouting shard : unassigned) {
        AllocationDeciders deciders = allocation.deciders();
        
        // 할당 가능한 노드 찾기
        for (RoutingNode node : allocation.routingNodes()) {
            Decision decision = deciders.canAllocate(shard, node, allocation);
            if (decision.type() == Decision.Type.YES) {
                // 가중치 기반 최적 노드 선택
                float weight = calculateWeight(node, shard.getIndexName());
                if (weight < minWeight) {
                    minWeight = weight;
                    selectedNode = node;
                }
            }
        }
        
        if (selectedNode != null) {
            allocation.routingNodes().initialize(shard, selectedNode.nodeId());
        }
    }
}
```

**제어 설정:**
```json
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.node_initial_primaries_recoveries": 4,
    "cluster.routing.allocation.node_concurrent_incoming_recoveries": 2,
    "cluster.routing.allocation.node_concurrent_outgoing_recoveries": 2
  }
}
```

**2단계: 강제 샤드 이동 (moveShards)**

제약 조건을 위반하는 샤드들을 강제로 이동시킨다:

```java
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/allocation/allocator/BalancedShardsAllocator.java
private boolean moveShards(RoutingAllocation allocation) {
    boolean changed = false;
    
    for (Iterator<ShardRouting> it = allocation.routingNodes().nodeInterleavedShardIterator(); it.hasNext();) {
        ShardRouting shardRouting = it.next();
        
        if (shardRouting.started()) {
            RoutingNode routingNode = allocation.routingNodes().node(shardRouting.currentNodeId());
            Decision decision = allocation.deciders().canRemain(shardRouting, routingNode, allocation);
            
            if (decision.type() == Decision.Type.NO) {
                // 강제 이동 필요
                for (RoutingNode targetNode : allocation.routingNodes()) {
                    if (targetNode.nodeId().equals(shardRouting.currentNodeId())) {
                        continue;
                    }
                    
                    Decision moveDecision = allocation.deciders().canAllocate(shardRouting, targetNode, allocation);
                    if (moveDecision.type() == Decision.Type.YES) {
                        allocation.routingNodes().relocate(shardRouting, targetNode.nodeId());
                        changed = true;
                        break;
                    }
                }
            }
        }
    }
    return changed;
}
```

**강제 이동 제어 설정:**
```json
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.exclude._ip": "10.0.0.1",
    "cluster.routing.allocation.disk.watermark.high": "90%",
    "cluster.routing.allocation.disk.watermark.flood_stage": "95%"
  }
}
```

**3단계: 균형 최적화 (rebalance)**

클러스터 전체 균형을 위한 선택적 샤드 이동:

```java
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/allocation/allocator/BalancedShardsAllocator.java
private boolean rebalance(RoutingAllocation allocation) {
    boolean changed = false;
    final AllocationDeciders deciders = allocation.deciders();
    final ModelNode[] modelNodes = sorter.modelNodes;
    
    for (String index : buildWeightOrderedIndices(modelNodes)) {
        final ModelNode minNode = modelNodes[0];
        final ModelNode maxNode = modelNodes[modelNodes.length - 1];
        
        // 균형 임계값 확인
        final float delta = calculateDelta(minNode, maxNode, index);
        if (delta <= threshold) {
            continue; // 이미 균형잡힌 상태
        }
        
        // 최적의 샤드 이동 찾기
        if (tryRelocateShard(minNode, maxNode, index)) {
            changed = true;
        }
    }
    return changed;
}

private float calculateWeight(RoutingNode node, String index) {
    float weight = 0;
    
    // 전체 샤드 수 균형 (기본 가중치: 0.45)
    weight += node.numberOfShardsWithState(STARTED) * indexBalance;
    
    // 인덱스별 샤드 균형 (기본 가중치: 0.55)  
    weight += node.numberOfShardsOfIndex(index) * shardBalance;
    
    // 프라이머리 샤드 균형 (기본 가중치: 0.05)
    weight += node.numberOfPrimariesWithState(STARTED) * primaryBalance;
    
    return weight;
}
```

**리밸런싱 제어 설정:**
```json
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.balance.shard": 0.45,
    "cluster.routing.allocation.balance.index": 0.55,
    "cluster.routing.allocation.balance.primary": 0.05,
    "cluster.routing.allocation.balance.threshold": 1.0,
    "cluster.routing.allocation.cluster_concurrent_rebalance": 2
  }
}
```

#### 3.2.2 할당 결정자 체인의 내부 동작

샤드 할당의 모든 제약조건을 검사하는 결정자들: ([공식 문서: Cluster-level shard allocation](https://www.elastic.co/guide/en/elasticsearch/reference/current/modules-cluster.html))

```java
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/allocation/decider/AllocationDeciders.java
public Decision canAllocate(ShardRouting shardRouting, RoutingNode node, RoutingAllocation allocation) {
    if (allocation.shouldIgnoreShardForNode(shardRouting.shardId(), node.nodeId())) {
        return Decision.NO;
    }
    
    for (AllocationDecider allocationDecider : allocDeciders) {
        Decision decision = allocationDecider.canAllocate(shardRouting, node, allocation);
        if (decision.type() == Decision.Type.NO) {
            return decision; // 하나라도 NO이면 즉시 거부
        }
    }
    return Decision.YES;
}
```

**주요 할당 결정자 18개:** ([상세 분석](https://mincong.io/2020/09/27/shard-allocation/))

1. **SameShardAllocationDecider**: 동일 샤드의 프라이머리와 레플리카 분리
2. **DiskThresholdDecider**: 디스크 워터마크 기반 할당 제한
3. **AwarenessAllocationDecider**: 랙/존 기반 배치 인식
4. **FilterAllocationDecider**: 사용자 정의 필터 규칙
5. **ReplicaAfterPrimaryActiveAllocationDecider**: 프라이머리 활성 후 레플리카 할당

---

## 4. 샤드 설정은 어떻게 하는가?

### 4.1 기본값의 변천사

엘라스틱서치의 기본 샤드 설정은 경험과 함께 진화했다:

| 버전 | 프라이머리 샤드 | 레플리카 샤드 | 배경 |
|------|----------------|---------------|------|
| ES 6.x 이전 | 5개 | 1개 | 대용량 데이터 가정 |
| ES 7.0+ | 1개 | 1개 | 소규모 인덱스 최적화 |

### 4.2 샤드 수 설정의 실제 방법

#### 4.2.1 인덱스 생성 시 설정

```json
PUT /my_index
{
  "settings": {
    "number_of_shards": 5,          
    "number_of_replicas": 2,        
    "number_of_routing_shards": 30  
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
  "index_patterns": ["logs-*", "metrics-*"],
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1
  },
  "order": 0
}
```

**우선순위 제어 설정:**
```json
PUT /my_index/_settings
{
  "index.priority": 100
}
```

---

## 5. 클라이언트는 어떤 샤드에서 조회하는가?

### 5.1 검색 라우팅의 전체 흐름

```
클라이언트 요청
    ↓
조정 노드 (Coordinating Node) 수신
    ↓
필요한 샤드 식별 (쿼리 분석)
    ↓
적응형 레플리카 선택 (ARS) 실행
    ↓
선택된 샤드들에 병렬 요청 전송
    ↓
각 샤드에서 검색 실행
    ↓
결과 수집 및 병합 (Reduce Phase)
    ↓
클라이언트에 최종 응답
```

### 5.2 Adaptive Replica Selection의 정교한 내부 구조

#### 5.2.1 ARS의 탄생 배경

ARS는 **[C3: Cutting Tail Latency in Cloud Data Stores via Adaptive Replica Selection](https://www.cs.cmu.edu/~dga/papers/c3-nsdi2015.pdf)** 논문을 엘라스틱서치에 맞게 구현한 것이다. ([Elastic Blog: Improving Response Latency](https://www.elastic.co/blog/improving-response-latency-in-elasticsearch-with-adaptive-replica-selection))

**도입 일정:**
- ES 6.1+: 사용 가능하지만 기본 비활성화 ([GitHub Issue #24915](https://github.com/elastic/elasticsearch/issues/24915))
- ES 7.0+: 기본 활성화 ([GitHub PR #26522](https://github.com/elastic/elasticsearch/pull/26522))

#### 5.2.2 C3 알고리즘의 수학적 구현

**핵심 공식:**
```
Ψ(s) = R(s) + μ̄(s) + (q(s) × b) + (os(s) × n)
```

**변수의 정확한 의미:**
- `R(s)`: 응답 시간의 EWMA (α=0.3)
- `μ̄(s)`: 서비스 시간의 EWMA (α=0.3)  
- `q(s)`: 큐 크기의 EWMA (α=0.3)
- `os(s)`: 해당 샤드에 대한 현재 미처리 요청 수
- `n`: 전체 클라이언트 수 (동시성 보정)
- `b`: 큐 페널티 가중치 (기본값: 4)

#### 5.2.3 실제 구현된 선택 알고리즘

```java
// 엘라스틱서치 실제 구현 기반 의사코드
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/OperationRouting.java
public ShardIterator preferenceActiveShardIterator(ShardRouting[] shards, 
                                                  String preference,
                                                  DiscoveryNodes nodes,
                                                  ResponseCollectorService collector) {
    
    if (preference == null && adaptiveReplicaSelection) {
        // ARS 알고리즘 적용
        List<ShardRouting> adaptiveShards = new ArrayList<>();
        
        for (ShardRouting shard : shards) {
            if (shard.active()) {
                adaptiveShards.add(shard);
            }
        }
        
        // C3 공식으로 최적 샤드 선택
        adaptiveShards.sort((s1, s2) -> {
            String nodeId1 = s1.currentNodeId();
            String nodeId2 = s2.currentNodeId();
            
            ResponseStats stats1 = collector.getNodeStatistics(nodeId1);
            ResponseStats stats2 = collector.getNodeStatistics(nodeId2);
            
            double score1 = calculateARSScore(stats1);
            double score2 = calculateARSScore(stats2);
            
            return Double.compare(score1, score2);
        });
        
        return new PlainShardIterator(shardId, adaptiveShards);
    }
    
    // 기본 라운드 로빈
    return new PlainShardIterator(shardId, Arrays.asList(shards));
}

private double calculateARSScore(ResponseStats stats) {
    return stats.responseTimeEWMA + 
           stats.serviceTimeEWMA + 
           (stats.queueSizeEWMA * QUEUE_PENALTY_WEIGHT) +
           (stats.outstandingRequests * CLIENT_COUNT);
}
```

**ARS 제어 설정:**
```json
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.use_adaptive_replica_selection": true
  }
}
```

---

## 6. 복제는 언제 어떻게 일어나는가?

### 6.1 Primary-Backup 복제 모델의 내부 원리

엘라스틱서치는 [Microsoft Research의 PacificA 논문](https://www.microsoft.com/en-us/research/publication/pacifica-replication-in-log-based-distributed-storage-systems/)을 기반으로 한 복제 시스템을 사용한다. ([공식 문서: Reading and writing documents](https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-replication.html))

#### 6.1.1 복제 발생 시점과 프로세스

```java
// 엘라스틱서치 실제 복제 프로세스 기반 의사코드
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/action/support/replication/ReplicationOperation.java
public void execute() throws Exception {
    // 1. 프라이머리에서 작업 실행
    primary.perform(request);
    
    // 2. In-Sync 레플리카들에 병렬 복제
    final Set<String> inSyncAllocationIds = primary.getActiveAllocationIds();
    final Set<String> trackedAllocationIds = primary.getTrackedAllocationIds();
    
    for (final ShardRouting shard : replicationGroup.getReplicationTargets()) {
        if (shard.primary() == false && inSyncAllocationIds.contains(shard.allocationId().getId())) {
            performOnReplica(shard, replicaRequest);
        }
    }
    
    // 3. 모든 복제 완료 후 응답
    finishAsPrimary(primaryResultFuture.actionGet());
}
```

#### 6.1.2 In-Sync Allocation의 정교한 관리

엘라스틱서치는 데이터 일관성을 위해 **in-sync copies** 개념을 사용한다. ([Elastic Blog: Tracking in-sync shard copies](https://www.elastic.co/blog/tracking-in-sync-shard-copies))

```java
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/index/seqno/ReplicationTracker.java
public class ReplicationTracker {
    
    public synchronized void markAllocationIdAsInSync(String allocationId, long localCheckpoint) {
        final CopyState copyState = checkpoints.get(allocationId);
        if (copyState.inSync == false) {
            // In-Sync Set에 추가
            copyState.inSync = true;
            recomputeGlobalCheckpoint();
        }
    }
    
    public synchronized void removeAllocationId(String allocationId) {
        if (checkpoints.remove(allocationId) != null) {
            recomputeGlobalCheckpoint();
        }
    }
    
    private void recomputeGlobalCheckpoint() {
        // 모든 in-sync 샤드가 공통으로 보유한 최신 시퀀스 번호 계산
        long newGlobalCheckpoint = Stream.of(checkpoints.values())
            .filter(CopyState::isInSync)
            .mapToLong(CopyState::getLocalCheckpoint)
            .min()
            .orElse(SequenceNumbers.NO_OPS_PERFORMED);
            
        this.globalCheckpoint = newGlobalCheckpoint;
    }
}
```

### 6.2 복제 실패 처리와 복구 메커니즘

#### 6.2.2 Peer Recovery의 단계별 과정

레플리카가 복귀하면 정교한 복구 프로세스가 시작된다: ([공식 문서: Index recovery settings](https://www.elastic.co/guide/en/elasticsearch/reference/current/recovery.html))

```java
// 엘라스틱서치 실제 복구 구현 기반 의사코드
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/indices/recovery/PeerRecoveryTargetService.java
public RecoveryResponse doRecovery(final long recoveryId, final StartRecoveryRequest request) {
    // 1단계: Global Checkpoint 확인
    final long startingSeqNo = request.startingSeqNo();
    final long targetGlobalCheckpoint = indexShard.getLastKnownGlobalCheckpoint();
    
    if (startingSeqNo <= targetGlobalCheckpoint) {
        // 2단계: 파일 기반 복구 (Phase 1)
        recoverFromStore(request);
        
        // 3단계: 트랜잭션 로그 기반 복구 (Phase 2)  
        recoverFromTranslog(startingSeqNo, request);
    } else {
        // 전체 복구 필요
        performFullRecovery(request);
    }
    
    // 4단계: 최종화 및 In-Sync 복귀
    finalizeRecovery();
}

private void recoverFromTranslog(long startingSeqNo, StartRecoveryRequest request) {
    // 프라이머리의 translog에서 누락된 작업들 가져오기
    final List<Translog.Operation> operations = 
        sourceNode.getHistoryOperations(startingSeqNo, targetGlobalCheckpoint);
    
    for (Translog.Operation operation : operations) {
        indexShard.applyTranslogOperation(operation);
    }
}
```

**복구 제어 설정:**
```json
PUT /_cluster/settings
{
  "persistent": {
    "indices.recovery.max_bytes_per_sec": "40mb",
    "indices.recovery.concurrent_streams": 3,
    "indices.recovery.activity_timeout": "30m",
    "cluster.routing.allocation.node_concurrent_incoming_recoveries": 2
  }
}
```

#### 6.2.3 지연된 할당으로 불필요한 복구 방지

노드가 일시적으로 떠날 때 즉시 복구하지 않는 최적화: ([공식 문서: Delaying allocation when a node leaves](https://www.elastic.co/guide/en/elasticsearch/reference/current/delayed-allocation.html))

```java
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/allocation/decider/SameShardAllocationDecider.java
public Decision canAllocate(ShardRouting shardRouting, RoutingNode node, RoutingAllocation allocation) {
    // 지연된 할당 확인
    if (shardRouting.unassignedInfo() != null) {
        final UnassignedInfo unassignedInfo = shardRouting.unassignedInfo();
        final IndexMetadata indexMetadata = allocation.metadata().getIndexSafe(shardRouting.index());
        final Setting<TimeValue> delaySetting = INDEX_DELAYED_NODE_LEFT_TIMEOUT_SETTING;
        final TimeValue delayTimeout = delaySetting.get(indexMetadata.getSettings());
        
        if (unassignedInfo.getReason() == UnassignedInfo.Reason.NODE_LEFT) {
            final long delayUntil = unassignedInfo.getUnassignedTimeInMillis() + delayTimeout.millis();
            if (delayUntil > allocation.getCurrentNanoTime()) {
                return allocation.decision(Decision.Type.NO, NAME, 
                    "delaying allocation for [%s] unassigned as node left the cluster", 
                    delayTimeout);
            }
        }
    }
    return Decision.YES;
}
```

**지연 할당 제어 설정:**
```json
PUT /_all/_settings
{
  "settings": {
    "index.unassigned.node_left.delayed_timeout": "5m"
  }
}
```

### 6.3 복제와 일관성 모델

#### 6.3.1 시퀀스 번호 기반 순서 보장

```java
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/index/seqno/SequenceNumbers.java
public class SequenceNumbers {
    
    public static boolean isValidSequenceNumber(long value) {
        return value >= 0;
    }
    
    public static String toString(long seqNo) {
        if (seqNo == NO_OPS_PERFORMED) return "NO_OPS_PERFORMED";
        if (seqNo == UNASSIGNED_SEQ_NO) return "UNASSIGNED_SEQ_NO";
        return Long.toString(seqNo);
    }
    
    // 글로벌 체크포인트는 모든 in-sync 샤드가 공통으로 보유한 최신 시퀀스 번호
    public static final long NO_OPS_PERFORMED = -1L;
    public static final long UNASSIGNED_SEQ_NO = -2L;
}
```

**복제 일관성 제어 설정:**
```json
PUT /_cluster/settings
{
  "persistent": {
    "action.write_consistency": "one",
    "action.replication": "sync"
  }
}
```

---

## 7. 참고할 만한 내용

### 7.1 샤드 크기 최적화 전략

#### 7.1.1 최적 샤드 크기 계산

```java
// 샤드 크기 계산 로직
calculateOptimalShardCount(long totalDataSizeGB, int expectedQPS) {
    // 1. 데이터 크기 기반 계산 (20-40GB per shard)
    int shardsBySize = Math.max(1, (int) Math.ceil(totalDataSizeGB / 30.0));
    
    // 2. 검색 성능 기반 계산 (1000 QPS per shard)
    int shardsByQPS = Math.max(1, expectedQPS / 1000);
    
    // 3. 노드 수 기반 제한 (2-3 shards per node)
    int maxShardsByNodes = dataNodeCount * 2;
    
    return Math.min(Math.max(shardsBySize, shardsByQPS), maxShardsByNodes);
}
```

**권장 기준:**
- **샤드 크기**: 20-40GB (검색 성능과 복구 시간 균형)
- **노드당 샤드 수**: heap GB당 20-25개 이하
- **클러스터당 총 샤드**: 1,000-10,000개 (마스터 노드 부하 고려)

### 7.2 클러스터 상태 진단과 해결

#### 7.2.1 상태별 대응 방안

([공식 문서: Cluster health API](https://www.elastic.co/guide/en/elasticsearch/reference/current/cluster-health.html))

**🟢 Green 상태 유지:**
- 모든 프라이머리와 레플리카 활성
- 정기적인 성능 모니터링
- 예방적 용량 관리

**🟡 Yellow 상태 해결:**
```bash
# 원인 파악
GET /_cluster/allocation/explain

# 할당 활성화
PUT /_cluster/settings
{
  "transient": {
    "cluster.routing.allocation.enable": "all"
  }
}

# 레플리카 수 조정
PUT /my_index/_settings
{
  "number_of_replicas": 0
}
```

**🔴 Red 상태 긴급 대응:**
```bash
# 프라이머리 샤드 강제 할당 (데이터 손실 위험)
POST /_cluster/reroute
{
  "commands": [{
    "allocate_empty_primary": {
      "index": "my_index",
      "shard": 0,
      "node": "node-1",
      "accept_data_loss": true
    }
  }]
}
```

#### 7.2.2 할당 인식으로 가용성 향상

([공식 문서: Shard allocation awareness](https://www.elastic.co/docs/deploy-manage/distributed-architecture/shard-allocation-relocation-recovery/shard-allocation-awareness))

**랙 인식 설정:**
```yaml
# elasticsearch.yml
node.attr.rack_id: rack1
cluster.routing.allocation.awareness.attributes: rack_id
```

**강제 인식 설정:**
```json
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.awareness.force.zone.values": ["zone1", "zone2"]
  }
}
```

### 7.3 디스크 기반 할당의 세밀한 제어

#### 7.3.1 워터마크 튜닝

([공식 문서: Disk-based allocation](https://www.elastic.co/guide/en/elasticsearch/reference/current/modules-cluster.html#disk-based-shard-allocation))

```json
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.disk.watermark.low": "85%",
    "cluster.routing.allocation.disk.watermark.high": "90%",
    "cluster.routing.allocation.disk.watermark.flood_stage": "95%",
    "cluster.info.update.interval": "30s",
    "cluster.routing.allocation.disk.include_relocations": true
  }
}
```

#### 7.3.2 샤드 크기 제한

```json
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.total_shards_per_node": 1000,
    "cluster.max_shards_per_node": 1000
  }
}

PUT /my_index/_settings
{
  "index.routing.allocation.total_shards_per_node": 5
}
```

### 7.4 커스텀 라우팅 활용

#### 7.4.1 사용자 정의 라우팅

```json
PUT /user_data/_doc/1?routing=user123
{
  "user_id": "user123",
  "message": "Hello World"
}

GET /user_data/_search?routing=user123
{
  "query": {
    "term": { "user_id": "user123" }
  }
}
```

#### 7.4.2 라우팅 파티션으로 핫스팟 방지

```json
PUT /partitioned_index
{
  "settings": {
    "index.routing_partition_size": 3,
    "number_of_shards": 9
  },
  "mappings": {
    "_routing": { "required": true }
  }
}
```

### 7.5 성능 튜닝 실전 기법

#### 7.5.1 인덱싱 최적화

```json
PUT /my_index/_settings
{
  "refresh_interval": "30s",        
  "number_of_replicas": 0,          
  "translog.durability": "async",   
  "translog.sync_interval": "30s",
  "translog.flush_threshold_size": "1gb"
}
```

#### 7.5.2 검색 성능 향상

```bash
# 필터 캐시 확인
GET /_nodes/stats/indices/query_cache

# 필드 데이터 사용량 모니터링
GET /_nodes/stats/indices/fielddata

# 동시 검색 요청 제한
GET /my_index/_search?max_concurrent_shard_requests=3
```

### 7.6 장애 대응 시나리오

#### 7.6.1 샤드 미할당 해결

([공식 문서: Cluster allocation explain API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-cluster-allocation-explain))

```bash
# 상세 원인 분석
GET /_cluster/allocation/explain
{
  "index": "my_index",
  "shard": 0,
  "primary": true
}

# 실패한 할당 재시도
POST /_cluster/reroute?retry_failed=true
```

#### 7.6.2 노드 안전 제거

```bash
# 1. 노드에서 샤드 이동
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.exclude._name": "node-to-remove"
  }
}

# 2. 이동 완료 확인
GET /_cat/allocation?v

# 3. 노드 종료 후 설정 정리
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.exclude._name": null
  }
}
```

### 7.7 ARS 설정과 모니터링

#### 7.7.1 ARS 성능 모니터링

```bash
# 노드별 검색 통계 확인
GET /_nodes/stats/indices/search

# 큐 상태 모니터링
GET /_cat/thread_pool/search?v&h=node_name,queue,active,rejected

# 샤드별 응답 시간 분석
GET /_cat/shards?v&h=index,shard,prirep,state,node&s=index
```

**성능 튜닝 설정:**
```json
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.use_adaptive_replica_selection": true,
    "thread_pool.search.queue_size": 1000,
    "search.max_buckets": 65536
  }
}
```

---

## 8. 참고 자료

### 8.1 공식 문서

1. [Elasticsearch Guide - Cluster-level shard allocation](https://www.elastic.co/guide/en/elasticsearch/reference/current/modules-cluster.html)
2. [Search shard routing](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-shard-routing.html)
3. [_routing field](https://www.elastic.co/guide/en/elasticsearch/reference/current/mapping-routing-field.html)
4. [Reading and writing documents](https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-replication.html)
5. [Index recovery settings](https://www.elastic.co/guide/en/elasticsearch/reference/current/recovery.html)
6. [Delaying allocation when a node leaves](https://www.elastic.co/guide/en/elasticsearch/reference/current/delayed-allocation.html)
7. [Shard allocation awareness](https://www.elastic.co/docs/deploy-manage/distributed-architecture/shard-allocation-relocation-recovery/shard-allocation-awareness)
8. [Cluster health API](https://www.elastic.co/guide/en/elasticsearch/reference/current/cluster-health.html)
9. [Cluster allocation explain API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-cluster-allocation-explain)

### 8.2 기술 블로그 및 심화 자료

1. [Improving Response Latency with Adaptive Replica Selection](https://www.elastic.co/blog/improving-response-latency-in-elasticsearch-with-adaptive-replica-selection) - Elastic Blog
2. [Tracking in-sync shard copies](https://www.elastic.co/blog/tracking-in-sync-shard-copies) - Elastic Blog
3. [Demystifying Elasticsearch shard allocation](https://aws.amazon.com/blogs/opensource/open-distro-elasticsearch-shard-allocation/) - AWS Open Source Blog
4. [18 Allocation Deciders in Elasticsearch](https://mincong.io/2020/09/27/shard-allocation/) - Mincong Huang

### 8.3 GitHub 소스 코드

1. [BalancedShardsAllocator.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/allocation/allocator/BalancedShardsAllocator.java) - 핵심 할당 알고리즘
2. [AllocationDeciders.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/allocation/decider/AllocationDeciders.java) - 할당 결정자 체인
3. [ReplicationOperation.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/action/support/replication/ReplicationOperation.java) - 복제 작업 처리
4. [OperationRouting.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/OperationRouting.java) - 라우팅 및 ARS 구현

### 8.4 연구 논문

1. [PacificA: Replication in Log-Based Distributed Storage Systems](https://www.microsoft.com/en-us/research/publication/pacifica-replication-in-log-based-distributed-storage-systems/) - Microsoft Research
2. [C3: Cutting Tail Latency in Cloud Data Stores via Adaptive Replica Selection](https://www.cs.cmu.edu/~dga/papers/c3-nsdi2015.pdf) - CMU Research

### 8.5 GitHub 이슈 및 구현

1. [Adaptive replica selection implementation](https://github.com/elastic/elasticsearch/issues/24915) - GitHub Issue #24915
2. [Enable adaptive replica selection by default](https://github.com/elastic/elasticsearch/pull/26522) - GitHub PR #26522
3. [Balance step in BalancedShardsAllocator](https://github.com/elastic/elasticsearch/pull/21103) - GitHub PR #21103

---

## 핵심 요약

### 내가 궁금했던 것들과 답

**Q1: 데이터는 정확히 어떻게 저장되나?**
→ 계층적 구조(클러스터→노드→인덱스→샤드→도큐먼트)로 분산 저장되며, 각 샤드는 독립적인 Lucene 인덱스

**Q2: 프라이머리와 레플리카의 실제 차이는?**
→ 프라이머리는 쓰기의 진입점이자 권한 있는 원본, 레플리카는 읽기 성능과 고가용성을 위한 정확한 복사본

**Q3: 샤드 분배는 어떤 알고리즘으로?**
→ BalancedShardsAllocator의 3단계(할당→이동→리밸런싱) + 해시 기반 라우팅 + 가중치 계산

**Q4: 복제는 정확히 언제 어떻게?**
→ 모든 쓰기 작업 시 Primary-Backup 모델로 실시간 복제, In-Sync Allocation으로 일관성 보장

**Q5: 클라이언트는 어느 샤드에서 읽나?**
→ Adaptive Replica Selection(ARS)으로 응답시간, 큐 크기, 노드 부하를 종합 평가해 최적 샤드 선택

### 내부 동작의 주요 원리

- **해시 라우팅**: 도큐먼트 ID 기반 결정론적 샤드 선택으로 일관성 보장
- **가중치 알고리즘**: 노드별 부하를 수치화해서 최적 배치 결정  
- **Primary-Backup 복제**: 권한 있는 원본 + 실시간 동기화로 일관성과 가용성 균형
- **In-Sync Tracking**: 동기화된 샤드만 관리해서 데이터 안전성 보장
- **Write Availability**: 일부 실패에도 쓰기 지속으로 서비스 가용성 우선
- **ARS 최적화**: 실시간 성능 메트릭 기반 지능적 레플리카 선택
