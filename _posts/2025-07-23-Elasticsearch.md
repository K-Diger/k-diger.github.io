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

## 목차

1. [데이터는 어떻게 저장되는가?](#1-데이터는-어떻게-저장되는가)
2. [프라이머리와 레플리카는 어떻게 다른가?](#2-프라이머리와-레플리카는-어떻게-다른가)
3. [샤드는 어떤 원리로 분배되는가?](#3-샤드는-어떤-원리로-분배되는가)
4. [도큐먼트는 어떤 샤드로 라우팅되는가?](#4-도큐먼트는-어떤-샤드로-라우팅되는가)
5. [샤드 설정은 어떻게 하는가?](#5-샤드-설정은-어떻게-하는가)
6. [클라이언트는 어떤 샤드에서 조회하는가?](#6-클라이언트는-어떤-샤드에서-조회하는가)
7. [복제는 언제 어떻게 일어나는가?](#7-복제는-언제-어떻게-일어나는가)
8. [복제본은 어떻게 프라이머리로 승격하는가?](#8-복제본은-어떻게-프라이머리로-승격하는가)
9. [운영 시 참고할 내용](#9-운영-시-참고할-내용)
10. [참고 자료](#10-참고-자료)

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

### 1.2 각 구성 요소의 실제 역할

**클러스터 (Cluster)**

- 전체 엘라스틱서치 시스템의 최상위 단위로, 동일한 cluster.name을 가진 모든 노드의 집합
- 클러스터 상태(Cluster State)를 통해 모든 메타데이터 관리: 어떤 인덱스가 있는지, 샤드가 어느 노드에 있는지, 마스터가 누구인지 등
- 마스터 노드가 클러스터 전체의 의사결정을 담당하며, 샤드 할당과 노드 관리를 수행

**노드 (Node)**

- 개별 JVM 프로세스로 실행되는 엘라스틱서치 인스턴스
- 역할별 분담: 마스터(클러스터 관리), 데이터(샤드 저장), 조정(요청 라우팅), 인제스트(데이터 전처리) 노드
- 각 노드는 루씬 인덱스들을 직접 관리하며 독립적으로 검색과 저장 작업 수행

**인덱스 (Index)**

- 논리적 데이터 그룹으로, 관계형 DB의 데이터베이스와 유사한 개념
- 실제로는 여러 샤드로 분산 저장되며, 사용자에게는 하나의 통합된 데이터셋으로 보임
- 매핑(어떤 필드가 있는지)과 설정(샤드 수, 레플리카 수 등) 메타데이터 포함

**샤드 (Shard)**

- 물리적 데이터 저장 단위이자 검색의 최소 실행 단위
- 각 샤드는 하나의 Apache Lucene 인덱스로, 완전히 독립적으로 동작
- 최대 약 20억 개의 도큐먼트 저장 가능, 병렬 검색으로 성능 향상

**도큐먼트 (Document)**

- JSON 형태의 실제 데이터로, 내부적으로 Lucene Document로 변환되어 저장
- 불변(Immutable) 특성을 가져 업데이트 시 새 버전으로 교체됨

### 1.3 데이터 저장의 전체 과정

새로운 도큐먼트가 저장될 때의 상세한 처리 과정:

1. **클라이언트 요청**: `POST /users/_doc/123 {"name": "김철수", "age": 30}`
2. **조정 노드 선택**: 요청을 받은 노드가 조정 노드 역할을 수행
3. **라우팅 계산**: 도큐먼트 ID를 해시하여 대상 샤드 결정
4. **프라이머리 샤드 전달**: 계산된 샤드가 있는 노드로 요청 라우팅
5. **시퀀스 번호 할당**: 프라이머리에서 작업 순서 보장을 위한 고유 번호 부여
6. **트랜잭션 로그 기록**: 장애 복구를 위해 먼저 로그에 기록
7. **실제 저장**: 루씬 인덱스에 도큐먼트 추가
8. **레플리카 복제**: 동일한 작업을 모든 인-싱크 레플리카에 전송
9. **응답 완료**: 모든 복제가 완료되면 클라이언트에 성공 응답

이 전체 과정이 보통 수 밀리초 안에 이루어진다.

> **관련 코드**: [ClusterState.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/ClusterState.java), [IndexShard.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/index/shard/IndexShard.java)

---

## 2. 프라이머리와 레플리카는 어떻게 다른가?

### 2.1 프라이머리 샤드의 내부 동작

프라이머리 샤드는 데이터의 **권한 있는 원본**이며 모든 쓰기 작업의 진입점이다.

**핵심 책임:**

- 모든 쓰기 요청의 진입점: 인덱싱, 업데이트, 삭제 요청을 최초로 받아 처리
- 도큐먼트 ID 기반 라우팅의 최종 목적지: 해시 계산 결과에 따라 결정된 유일한 저장소
- In-Sync 레플리카 집합 관리: 어떤 레플리카들이 동기화되어 있는지 추적
- 버전 관리(Version Control) 담당: 동시성 제어와 충돌 해결

**쓰기 처리 프로세스의 상세 구현:**

```java
// 엘라스틱서치 실제 구현 기반 의사코드
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/action/bulk/TransportShardBulkAction.java
public void executeBulkItemRequest(BulkPrimaryExecutionContext context, 
                                 UpdateRequest updateRequest,
                                 Consumer<Exception> onFailure,
                                 Consumer<BulkItemResponse> onSuccess,
                                 BulkItemRequest replicationRequest) {
    
    // 1. 요청 유효성 검증 (문법, 권한, 제약조건 등)
    validateOperation(operation);
    
    // 2. 작업 순서 보장을 위한 시퀀스 번호 할당
    assignSequenceNumber(operation);
    
    // 3. 장애 복구를 위해 트랜잭션 로그에 먼저 기록
    writeToTranslog(operation);
    
    // 4. 실제 루씬 인덱스에 도큐먼트 저장
    executeOnPrimary(operation);
    
    // 5. 모든 In-Sync 레플리카에 동일한 작업 전송
    replicateToInSyncReplicas(operation);
    
    // 6. 모든 복제 완료 후 클라이언트에 응답
    acknowledgeToClient(operation);
}
```

이 과정에서 중요한 점은 **프라이머리가 모든 복제를 기다린다**는 것이다. 즉, 동기식 복제로 데이터 일관성을 보장한다.

### 2.2 레플리카 샤드의 내부 역할

레플리카는 **프라이머리의 정확한 복사본**이면서 독립적인 검색 엔진 역할을 한다.

**주요 특징:**

- 읽기 전용 관점에서는 프라이머리와 동등한 성능: 검색, 집계, 분석 작업을 독립적으로 처리
- 복제 시에만 프라이머리에 의존적: 쓰기 작업은 항상 프라이머리를 거쳐서 전달받음
- 장애 시 프라이머리로 승격 가능: In-Sync 상태라면 즉시 프라이머리 역할 수행 가능

**복제 동기화 메커니즘의 상세 구현:**

```java
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/action/support/replication/ReplicationOperation.java
public void performOnReplica(ReplicaRequest request, IndexShard replica) {
    
    // 1. 프라이머리로부터 동일한 작업 내용 수신
    receiveFromPrimary(operation);
    
    // 2. 시퀀스 번호가 올바른 순서인지 검증 (순서 보장)
    validateSequenceNumber(operation);
    
    // 3. 복구를 위해 트랜잭션 로그에 기록
    writeToTranslog(operation);
    
    // 4. 프라이머리와 동일한 작업 실행
    executeOperation(operation);
    
    // 5. 작업 완료를 프라이머리에 알림
    acknowledgeToPrimary(operation);
}
```

**레플리카의 독립성과 의존성:**

- 독립성: 검색 요청을 자체적으로 처리, 프라이머리 부하 분산에 기여
- 의존성: 모든 데이터 변경은 프라이머리를 통해서만 가능, 직접적인 쓰기 불가

### 2.3 분산 배치의 안전 원칙

엘라스틱서치는 고가용성을 위해 엄격한 배치 규칙을 적용한다:

**동일 샤드 분리 원칙:**

```
노드 1: P0, R1, R2  ← 프라이머리 0 + 다른 샤드의 레플리카들
노드 2: P1, R0, R2  ← 프라이머리 1 + 다른 샤드의 레플리카들
노드 3: P2, R0, R1  ← 프라이머리 2 + 다른 샤드의 레플리카들

핵심: 동일 샤드의 P와 R은 절대 같은 노드에 위치하지 않음
```

이 배치 규칙은 **단일 장애점(Single Point of Failure)**을 제거한다:

- 노드 1 장애 시: P0를 잃지만 R0(노드 2, 3)이 즉시 승격
- 전체 서비스는 중단 없이 계속 제공
- 데이터 손실 없이 가용성 보장

**제어 설정:**

```json
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.same_shard.host": false
  }
}
```

> **관련 코드**: [TransportShardBulkAction.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/action/bulk/TransportShardBulkAction.java), [ReplicationOperation.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/action/support/replication/ReplicationOperation.java)

---

## 3. 샤드는 어떤 원리로 분배되는가?

### 3.1 샤드 할당 알고리즘의 내부 구조

엘라스틱서치의 할당 엔진인 `BalancedShardsAllocator`는 체계적인 3단계로 작동한다. 이는 AWS의 분석 자료([AWS Blog](https://aws.amazon.com/blogs/opensource/open-distro-elasticsearch-shard-allocation/))에서도 상세히 다뤄진 내용이다.

#### 3.1.1 1단계: 미할당 샤드 할당 (allocateUnassigned)

**우선순위 기반 할당 순서:**

1. 프라이머리 샤드가 레플리카보다 절대 우선
2. 인덱스 우선순위(`index.priority`) 높은 순서
3. 생성 시간이 오래된 순서

```java
// 엘라스틱서치 실제 구현 기반 의사코드
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/allocation/allocator/BalancedShardsAllocator.java
private boolean allocateUnassigned(RoutingAllocation allocation) {
    // 미할당 샤드 목록 가져오기
    RoutingNodes.UnassignedShards unassigned = allocation.routingNodes().unassigned();
    
    // 우선순위 기반 정렬: 프라이머리 → 높은 우선순위 → 오래된 것
    unassigned.sort((a, b) -> {
        // 1순위: 프라이머리 vs 레플리카
        if (a.primary() != b.primary()) {
            return a.primary() ? -1 : 1; // 프라이머리가 먼저
        }
        
        // 2순위: 인덱스 우선순위
        int priorityA = IndexMetadata.INDEX_PRIORITY_SETTING.get(
            allocation.metadata().index(a.index()).getSettings());
        int priorityB = IndexMetadata.INDEX_PRIORITY_SETTING.get(
            allocation.metadata().index(b.index()).getSettings());
        return Integer.compare(priorityB, priorityA); // 높은 우선순위 먼저
    });
    
    // 각 샤드에 대해 최적 노드 찾기
    for (ShardRouting shard : unassigned) {
        AllocationDeciders deciders = allocation.deciders();
        
        RoutingNode selectedNode = null;
        float minWeight = Float.MAX_VALUE;
        
        // 할당 가능한 노드들 중에서 가중치가 가장 낮은 노드 선택
        for (RoutingNode node : allocation.routingNodes()) {
            Decision decision = deciders.canAllocate(shard, node, allocation);
            if (decision.type() == Decision.Type.YES) {
                float weight = calculateWeight(node, shard.getIndexName());
                if (weight < minWeight) {
                    minWeight = weight;
                    selectedNode = node;
                }
            }
        }
        
        // 선택된 노드에 샤드 할당
        if (selectedNode != null) {
            allocation.routingNodes().initialize(shard, selectedNode.nodeId());
        }
    }
}
```

**할당 과정에서 중요한 것은 18개의 할당 결정자(Allocation Deciders) 체인을 모두 통과해야 한다는 점이다.** 하나라도 거부하면 해당 노드에는 할당되지 않는다.

#### 3.1.2 2단계: 강제 샤드 이동 (moveShards)

제약 조건을 위반하는 샤드들을 **즉시** 다른 노드로 이동시킨다.

**강제 이동이 필요한 경우:**

- 디스크 용량 한계 초과 (워터마크 위반)
- 할당 필터 규칙 위반 (사용자가 특정 노드 제외 설정)
- 동일 샤드의 프라이머리와 레플리카가 같은 노드에 있는 경우

```java
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/allocation/allocator/BalancedShardsAllocator.java
private boolean moveShards(RoutingAllocation allocation) {
    boolean changed = false;
    
    // 모든 활성 샤드에 대해 현재 위치가 적절한지 검사
    for (Iterator<ShardRouting> it = allocation.routingNodes().nodeInterleavedShardIterator(); 
         it.hasNext();) {
        ShardRouting shardRouting = it.next();
        
        if (shardRouting.started()) {
            RoutingNode routingNode = allocation.routingNodes().node(shardRouting.currentNodeId());
            Decision decision = allocation.deciders().canRemain(shardRouting, routingNode, allocation);
            
            // 현재 노드에 머물 수 없다면 강제 이동
            if (decision.type() == Decision.Type.NO) {
                for (RoutingNode targetNode : allocation.routingNodes()) {
                    if (targetNode.nodeId().equals(shardRouting.currentNodeId())) {
                        continue; // 현재 노드는 제외
                    }
                    
                    Decision moveDecision = allocation.deciders().canAllocate(
                        shardRouting, targetNode, allocation);
                    if (moveDecision.type() == Decision.Type.YES) {
                        // 즉시 이동 시작
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

#### 3.1.3 3단계: 균형 최적화 (rebalance)

클러스터 전체 균형을 위한 **선택적** 샤드 이동이다. 성능에 미치는 영향을 고려하여 신중하게 수행된다.

**리밸런싱 조건:**

- 노드 간 샤드 수 차이가 임계값(기본 1.0)을 초과
- 현재 진행 중인 복구 작업이 제한 수 이하
- 클러스터가 안정적인 상태

```java
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/allocation/allocator/BalancedShardsAllocator.java
private boolean rebalance(RoutingAllocation allocation) {
    boolean changed = false;
    final AllocationDeciders deciders = allocation.deciders();
    final ModelNode[] modelNodes = sorter.modelNodes;
    
    // 인덱스별로 균형 검사 및 최적화
    for (String index : buildWeightOrderedIndices(modelNodes)) {
        final ModelNode minNode = modelNodes[0];           // 가장 가벼운 노드
        final ModelNode maxNode = modelNodes[modelNodes.length - 1]; // 가장 무거운 노드
        
        // 균형 차이가 임계값을 초과하는지 확인
        final float delta = calculateDelta(minNode, maxNode, index);
        if (delta <= threshold) {
            continue; // 이미 균형잡힌 상태면 스킵
        }
        
        // 최적의 샤드 이동 찾기 (무거운 노드 → 가벼운 노드)
        if (tryRelocateShard(minNode, maxNode, index)) {
            changed = true;
        }
    }
    return changed;
}

// 노드 가중치 계산: 여러 요소를 종합하여 노드의 부하 수준 산정
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

**가중치 계산의 의미:**

- **전체 샤드 균형 (0.45)**: 노드 전체의 샤드 개수가 고르게 분산되도록
- **인덱스 샤드 균형 (0.55)**: 특정 인덱스의 샤드들이 한 노드에 몰리지 않도록
- **프라이머리 균형 (0.05)**: 프라이머리 샤드들이 고르게 분산되도록

### 3.2 할당 결정자 체인의 내부 동작

샤드 할당의 모든 제약조건을 검사하는 18개의 결정자들이 순차적으로 검사를 수행한다.

```java
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/allocation/decider/AllocationDeciders.java
public Decision canAllocate(ShardRouting shardRouting, RoutingNode node, RoutingAllocation allocation) {
    // 특별한 예외 조건 먼저 확인
    if (allocation.shouldIgnoreShardForNode(shardRouting.shardId(), node.nodeId())) {
        return Decision.NO;
    }
    
    // 모든 할당 결정자가 순차적으로 검사
    for (AllocationDecider allocationDecider : allocDeciders) {
        Decision decision = allocationDecider.canAllocate(shardRouting, node, allocation);
        
        // 하나라도 NO라면 즉시 거부 (AND 연산)
        if (decision.type() == Decision.Type.NO) {
            return decision;
        }
    }
    return Decision.YES; // 모든 검사를 통과해야 할당 가능
}
```

**주요 할당 결정자들의 역할:**

1. **SameShardAllocationDecider**: 동일 샤드의 프라이머리와 레플리카가 같은 노드에 오는 것을 방지
2. **DiskThresholdDecider**: 디스크 용량 기반으로 할당 제한 (85%, 90%, 95% 워터마크)
3. **AwarenessAllocationDecider**: 랙/존 기반 배치 인식으로 장애 도메인 분산
4. **FilterAllocationDecider**: 사용자 정의 필터 규칙 (특정 노드 포함/제외)
5. **ReplicaAfterPrimaryActiveAllocationDecider**: 프라이머리가 활성화된 후에만 레플리카 할당

**할당 제어 설정:**

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

> **관련 코드**: [BalancedShardsAllocator.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/allocation/allocator/BalancedShardsAllocator.java), [AllocationDeciders.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/allocation/decider/AllocationDeciders.java)

---

## 4. 도큐먼트는 어떤 샤드로 라우팅되는가?

### 4.1 도큐먼트 라우팅의 기본 원리

새 도큐먼트가 어떤 샤드에 저장될지는 **해시 기반 라우팅 알고리즘**으로 결정된다. 이는 결정론적(deterministic) 방식으로, 동일한 라우팅 값은 항상 같은 샤드로 이동한다.

#### 4.1.1 기본 라우팅 공식

**ES 7.0+ 기준 정확한 공식:**

```
routing_factor = num_routing_shards / num_primary_shards
shard_num = (hash(_routing) % num_routing_shards) / routing_factor
```

**각 변수의 의미:**

- `_routing`: 라우팅 값 (기본적으로 도큐먼트 ID `_id` 사용)
- `num_routing_shards`: 인덱스 설정의 `index.number_of_routing_shards` 값
- `num_primary_shards`: 인덱스의 실제 프라이머리 샤드 수
- `hash()`: Murmur3 해시 알고리즘으로 균등 분산 보장

**단순한 경우 (프라이머리 샤드 수 = 라우팅 샤드 수):**

```
shard_num = hash(_routing) % number_of_primary_shards
```

**실제 라우팅 구현:**

```java
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/OperationRouting.java
public ShardId shardId(ClusterState clusterState, String index, String id, @Nullable String routing) {
    final IndexMetadata indexMetadata = indexMetadata(clusterState, index);
    final int hash = Murmur3HashFunction.hash(effectiveRouting(id, routing));
    
    // 라우팅 샤드 수로 먼저 나머지 계산
    final int routingNumShards = indexMetadata.getRoutingNumShards();
    final int routingShardId = Math.floorMod(hash, routingNumShards);
    
    // 실제 샤드 번호로 변환
    return IndexMetadata.selectShard(routingShardId, indexMetadata);
}

private String effectiveRouting(String id, @Nullable String routing) {
    return routing != null ? routing : id; // 커스텀 라우팅이 없으면 도큐먼트 ID 사용
}
```

#### 4.1.2 해시 알고리즘의 특성

**Murmur3 해시의 균등 분산:**

- 입력값의 작은 변화도 완전히 다른 해시값 생성
- 모든 샤드에 도큐먼트가 고르게 분산되도록 보장
- 빠른 계산 속도와 높은 품질의 해시 분포

**결정론적 특성의 장점:**

- 동일한 라우팅 값은 항상 같은 샤드로 이동
- 샤드 수가 변하지 않는 한 위치 불변
- 클러스터 재시작과 무관하게 일관성 유지
- 특정 라우팅 값으로 검색 시 단일 샤드만 검색 가능

### 4.2 커스텀 라우팅의 활용

#### 4.2.1 사용자 정의 라우팅 값

특정 기준으로 도큐먼트를 그룹화하고 싶을 때 커스텀 라우팅을 사용한다:

```bash
# 사용자 ID를 라우팅 값으로 사용
PUT my_index/_doc/1?routing=user123
{
  "user_id": "user123",
  "message": "Hello World",
  "timestamp": "2024-01-15T10:30:00Z"
}

# 같은 라우팅 값으로 검색 (단일 샤드만 검색)
GET my_index/_search?routing=user123
{
  "query": {
    "term": { "user_id": "user123" }
  }
}
```

**커스텀 라우팅의 장점:**

- 관련 데이터가 같은 샤드에 저장되어 검색 성능 향상
- 전체 샤드 대신 특정 샤드만 검색하여 리소스 절약
- 사용자별, 날짜별 등 논리적 그룹핑 가능

**주의사항:**

- 라우팅 값의 분포가 고르지 않으면 핫스팟 발생 가능
- 큰 사용자 데이터가 한 샤드에 집중될 위험

#### 4.2.2 라우팅 파티션으로 핫스팟 방지

큰 사용자 데이터가 한 샤드에 몰리는 문제를 해결하기 위한 고급 기법:

```json
PUT partitioned_index
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

**파티션 라우팅 공식:**

```
routing_value = hash(_routing) + hash(_id) % routing_partition_size
shard_num = (routing_value % num_routing_shards) / routing_factor
```

**동작 원리:**

- 큰 라우팅 그룹(예: user123)이 3개 파티션으로 분산됨
- 검색 시에는 3개 샤드만 검색하면 되므로 성능 유지
- 단일 샤드 과부하 방지와 검색 효율성의 절충점 제공

```java
// 파티션 라우팅 구현 예시
public int getShardId(String routing, String docId, int partitionSize, int numShards) {
    // 라우팅 값과 도큐먼트 ID를 결합하여 파티션 내에서 분산
    int routingHash = hash(routing);
    int docHash = hash(docId);
    int partitionedRouting = routingHash + (docHash % partitionSize);
    
    return Math.abs(partitionedRouting % numShards);
}
```

### 4.3 라우팅 최적화 전략

#### 4.3.1 검색 성능 최적화

**단일 샤드 검색:**

```bash
# 특정 사용자의 데이터만 검색 (1개 샤드)
GET user_data/_search?routing=user123
{
  "query": {
    "range": { "timestamp": { "gte": "2024-01-01" }}
  }
}

# 여러 사용자 데이터 검색 (지정된 샤드들만)
GET user_data/_search?routing=user123,user456,user789
{
  "query": {
    "match": { "status": "active" }
  }
}
```

**성능 향상 효과:**

- 전체 샤드 대신 필요한 샤드만 검색
- 네트워크 트래픽과 CPU 사용량 감소
- 응답 시간 단축 및 동시 처리 능력 향상

#### 4.3.2 라우팅 필수 설정

```json
PUT my_index
{
  "mappings": {
    "_routing": {
      "required": true
    }
  }
}

# 라우팅 없이 인덱싱 시도 → 실패
PUT my_index/_doc/1
{
  "text": "No routing value provided"
}
# 결과: routing_missing_exception 발생
```

**라우팅 필수 설정의 이유:**

- 일관된 데이터 분산 보장
- 검색 성능 최적화 강제
- 개발자 실수 방지

### 4.4 라우팅과 샤드 분산의 실제 동작

#### 4.4.1 해시 알고리즘의 내부 구현

```java
// 엘라스틱서치 내부 해시 함수 구현
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/Murmur3HashFunction.java
public static int hash(String routing) {
    final byte[] bytesToHash = routing.getBytes(StandardCharsets.UTF_8);
    return Murmur3HashFunction.hash32(bytesToHash, 0, bytesToHash.length, 0);
}

// Murmur3 해시 알고리즘의 핵심 로직
public static int hash32(byte[] data, int offset, int length, int seed) {
    final int c1 = 0xcc9e2d51;
    final int c2 = 0x1b873593;
    final int r1 = 15;
    final int r2 = 13;
    final int m = 5;
    final int n = 0xe6546b64;
    
    int hash = seed;
    // ... 복잡한 해시 계산 로직
    return hash;
}
```

**해시 계산의 특성:**

- 입력값이 조금만 달라도 완전히 다른 결과
- 균등 분산을 위한 수학적으로 검증된 알고리즘
- 빠른 계산 속도 (O(1) 시간 복잡도)

#### 4.4.2 라우팅 최적화 모니터링

**샤드별 도큐먼트 분산 확인:**

```bash
# 샤드별 도큐먼트 분산 확인
GET /_cat/shards/my_index?v&h=index,shard,prirep,docs&s=shard

# 결과 예시:
# index    shard prirep docs
# my_index 0     p      1500
# my_index 0     r      1500  
# my_index 1     p      1480
# my_index 1     r      1480
# my_index 2     p      1520
# my_index 2     r      1520
```

**라우팅 필드별 분포 분석:**

```bash
GET my_index/_search
{
  "size": 0,
  "aggs": {
    "routing_distribution": {
      "terms": {
        "field": "_routing",
        "size": 100
      }
    }
  }
}
```

**불균등 분산 감지 및 대응:**

- 특정 샤드에 데이터가 몰리는 현상 모니터링
- 라우팅 전략 재검토 및 파티션 라우팅 적용 고려
- 샤드 리밸런싱으로 부하 분산 최적화

> **관련 코드**: [OperationRouting.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/OperationRouting.java), [Murmur3HashFunction.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/Murmur3HashFunction.java)

---

## 5. 샤드 설정은 어떻게 하는가?

### 5.1 기본값의 변천사와 배경

엘라스틱서치의 기본 샤드 설정은 사용 패턴의 변화와 경험을 바탕으로 진화했다:

| 버전        | 프라이머리 샤드 | 레플리카 샤드 | 변경 배경                  |
|-----------|----------|---------|------------------------|
| ES 6.x 이전 | 5개       | 1개      | 대용량 데이터 환경을 가정한 설정     |
| ES 7.0+   | 1개       | 1개      | 대부분이 중소 규모 인덱스라는 경험 반영 |

**변경 이유:**

- 실제 사용 통계에서 대부분의 인덱스가 GB 단위의 소규모
- 5개 샤드로 인한 불필요한 오버헤드 문제
- 작은 데이터에 과도한 샤드는 성능 저하 원인

### 5.2 샤드 수 설정의 실제 방법

#### 5.2.1 인덱스 생성 시 설정

```json
PUT /my_index
{
  "settings": {
    "number_of_shards": 5,          // 프라이머리 샤드 수 (생성 후 변경 불가)
    "number_of_replicas": 2,        // 레플리카 샤드 수 (동적 변경 가능)
    "number_of_routing_shards": 30  // 라우팅 샤드 수 (향후 확장 대비)
  }
}
```

**주요 설정 항목 설명:**

- `number_of_shards`: 실제 프라이머리 샤드 수, **인덱스 생성 후 변경 불가**
- `number_of_replicas`: 각 프라이머리 샤드의 복사본 수, **실시간 변경 가능**
- `number_of_routing_shards`: Split API를 위한 라우팅 샤드 수

#### 5.2.2 레플리카 수 동적 변경

레플리카 수는 언제든지 변경할 수 있어 유연한 운영이 가능하다:

```json
# 레플리카 수 증가 (고가용성 향상)
PUT /my_index/_settings
{
  "number_of_replicas": 3
}

# 레플리카 수 감소 (리소스 절약)
PUT /my_index/_settings
{
  "number_of_replicas": 0
}
```

**레플리카 수 변경의 실제 과정:**

1. 클러스터 상태에 새로운 레플리카 수 반영
2. 부족한 레플리카는 자동으로 생성 및 할당
3. 과도한 레플리카는 자동으로 제거
4. 복제 과정이 백그라운드에서 진행

#### 5.2.3 인덱스 템플릿으로 기본값 변경

여러 인덱스에 일관된 설정을 적용하기 위한 템플릿:

```json
PUT /_template/logs_template
{
  "index_patterns": ["logs-*", "metrics-*"],
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "refresh_interval": "30s"
  },
  "order": 100  // 높은 순서가 우선 적용
}
```

**템플릿 우선순위 제어:**

```json
PUT /my_index/_settings
{
  "index.priority": 100  // 높은 우선순위로 복구 시 먼저 처리
}
```

### 5.3 최적 샤드 수 계산 전략

#### 5.3.1 데이터 크기 기반 계산

**권장 기준:**

- 샤드당 20-40GB (검색 성능과 복구 시간의 균형점)
- 너무 작으면 오버헤드, 너무 크면 복구 시간 증가

```java
// 최적 샤드 수 계산 로직
public int calculateOptimalShardCount(long totalDataSizeGB, int expectedQPS, int nodeCount) {
    // 1. 데이터 크기 기준 계산 (30GB per shard)
    int shardsBySize = Math.max(1, (int) Math.ceil(totalDataSizeGB / 30.0));
    
    // 2. 검색 성능 기준 계산 (1000 QPS per shard)
    int shardsByQPS = Math.max(1, expectedQPS / 1000);
    
    // 3. 노드 수 기준 제한 (node당 2-3 shards)
    int maxShardsByNodes = nodeCount * 2;
    
    // 가장 제한적인 조건 적용
    return Math.min(Math.max(shardsBySize, shardsByQPS), maxShardsByNodes);
}
```

#### 5.3.2 성능 기준 고려사항

**검색 성능 기준:**

- 샤드당 1000 QPS 기준으로 계산
- 복잡한 쿼리일수록 더 적은 QPS 처리 가능
- 집계가 많은 경우 추가 고려 필요

**인프라 기준:**

- heap 1GB당 20-25개 샤드 이하 권장
- 마스터 노드 부하를 고려하여 클러스터당 10,000개 샤드 이하
- SSD vs HDD에 따른 I/O 성능 차이 고려

#### 5.3.3 시간 기반 인덱스 전략

로그나 메트릭 데이터의 경우 시간 기반 인덱스 사용:

```json
# 일별 인덱스 생성
PUT logs-2024-01-15
{
  "settings": {
    "number_of_shards": 1,  // 하루 데이터량 기준으로 소규모
    "number_of_replicas": 1
  }
}

# 인덱스 라이프사이클 관리
PUT /_ilm/policy/logs_policy
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": {
            "max_size": "50GB",
            "max_age": "1d"
          }
        }
      },
      "delete": {
        "min_age": "30d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

> **관련 코드**: [IndexMetadata.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/metadata/IndexMetadata.java), [MetadataCreateIndexService.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/metadata/MetadataCreateIndexService.java)

---

## 6. 클라이언트는 어떤 샤드에서 조회하는가?

### 6.1 검색 라우팅의 전체 흐름

클라이언트의 검색 요청이 처리되는 상세한 과정:

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
각 샤드에서 검색 실행 (Query Phase)
    ↓
결과 수집 및 병합 (Fetch Phase)
    ↓
클라이언트에 최종 응답
```

**각 단계의 상세 설명:**

1. **조정 노드 역할**: 요청을 받은 아무 노드나 조정 노드가 될 수 있음
2. **샤드 식별**: 라우팅 값이 있으면 특정 샤드, 없으면 모든 샤드 대상
3. **레플리카 선택**: 각 샤드에 대해 프라이머리 또는 레플리카 중 최적 선택
4. **병렬 처리**: 모든 대상 샤드에 동시에 검색 요청 전송
5. **결과 병합**: 각 샤드의 결과를 받아서 정렬, 집계, 페이징 처리

### 6.2 Adaptive Replica Selection의 내부 구조

#### 6.2.1 ARS의 탄생 배경과 진화

ARS는 **[C3: Cutting Tail Latency in Cloud Data Stores via Adaptive Replica Selection](https://www.cs.cmu.edu/~dga/papers/c3-nsdi2015.pdf)** 논문을 엘라스틱서치에 맞게 구현한 것이다.

**도입 일정과 배경:**

- ES 6.1+: 사용 가능하지만 기본 비활성화 ([GitHub Issue #24915](https://github.com/elastic/elasticsearch/issues/24915))
- ES 7.0+: 기본 활성화로 변경 ([GitHub PR #26522](https://github.com/elastic/elasticsearch/pull/26522))
- 기존 라운드 로빈 방식의 tail latency 문제 해결이 목적

#### 6.2.2 C3 알고리즘의 수학적 구현

**핵심 공식:**

```
Ψ(s) = R(s) + μ̄(s) + (q(s) × b) + (os(s) × n)
```

**변수의 정확한 의미:**

- `R(s)`: 해당 샤드(노드)의 응답 시간 EWMA (지수가중이동평균, α=0.3)
- `μ̄(s)`: 실제 서비스 시간의 EWMA (α=0.3)
- `q(s)`: 큐 크기의 EWMA (α=0.3)
- `os(s)`: 해당 샤드에 대한 현재 미처리 요청 수
- `n`: 전체 클라이언트 수 (동시성 보정 계수)
- `b`: 큐 페널티 가중치 (기본값: 4)

**EWMA 계산 방식:**

```java
// 지수가중이동평균 계산
public double updateEWMA(double currentValue, double newValue, double alpha) {
    return alpha * newValue + (1 - alpha) * currentValue;
}
```

#### 6.2.3 실제 구현된 선택 알고리즘

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
        
        // 활성 상태의 샤드들만 수집
        for (ShardRouting shard : shards) {
            if (shard.active()) {
                adaptiveShards.add(shard);
            }
        }
        
        // C3 공식으로 최적 샤드 선택 (점수가 낮을수록 좋음)
        adaptiveShards.sort((s1, s2) -> {
            String nodeId1 = s1.currentNodeId();
            String nodeId2 = s2.currentNodeId();
            
            // 각 노드의 성능 통계 수집
            ResponseStats stats1 = collector.getNodeStatistics(nodeId1);
            ResponseStats stats2 = collector.getNodeStatistics(nodeId2);
            
            // C3 공식으로 점수 계산
            double score1 = calculateARSScore(stats1);
            double score2 = calculateARSScore(stats2);
            
            return Double.compare(score1, score2);
        });
        
        return new PlainShardIterator(shardId, adaptiveShards);
    }
    
    // ARS가 비활성화된 경우 기본 라운드 로빈
    return new PlainShardIterator(shardId, Collections.singletonList(shards));
}

private double calculateARSScore(ResponseStats stats) {
    return stats.responseTimeEWMA +           // 응답 시간
           stats.serviceTimeEWMA +            // 서비스 시간
           (stats.queueSizeEWMA * 4.0) +      // 큐 크기 × 페널티
           (stats.outstandingRequests * clientCount); // 진행중 요청 × 클라이언트 수
}
```

**ARS의 실시간 최적화 효과:**

- 부하가 높은 노드 자동 회피
- 네트워크 지연이 큰 노드 우선순위 하락
- 큐가 밀린 노드에 추가 요청 전송 방지
- 전체적인 tail latency 개선

### 6.3 기존 라운드 로빈 방식의 한계

ARS 도입 이전에 사용된 단순한 라운드 로빈 방식의 문제점:

**라운드 로빈의 동작:**

```java
// 기존 라운드 로빈 방식 (단순화)
public ShardRouting selectShard(List<ShardRouting> shards, AtomicInteger counter) {
    int index = counter.getAndIncrement() % shards.size();
    return shards.get(index);
}
```

**주요 한계점:**

- **부하 무시**: 노드의 실제 부하 상태를 전혀 고려하지 않음
- **일방적 배분**: 성능이 좋은 노드와 나쁜 노드에 동일하게 요청 전송
- **tail latency**: 느린 노드 때문에 전체 응답 시간이 지연됨
- **리소스 낭비**: 빠른 노드는 여유가 있는데 느린 노드는 과부하

**ARS vs 라운드 로빈 성능 비교:**

- 평균 응답 시간: 20-30% 개선
- 95th percentile 응답 시간: 50% 이상 개선
- 전체 처리량: 15-25% 향상

**ARS 제어 설정:**

```json
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.use_adaptive_replica_selection": true
  }
}
```

> **관련 코드**: [SearchService.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/search/SearchService.java), [ResponseCollectorService.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/node/ResponseCollectorService.java)

---

## 7. 복제는 언제 어떻게 일어나는가?

### 7.1 Primary-Backup 복제 모델의 내부 원리

엘라스틱서치는 [Microsoft Research의 PacificA 논문](https://www.microsoft.com/en-us/research/publication/pacifica-replication-in-log-based-distributed-storage-systems/)을 기반으로 한 복제 시스템을 사용한다.

**복제 발생 시점:**

- 모든 쓰기 작업 (인덱싱, 업데이트, 삭제) 시에 즉시 발생
- 프라이머리에서 작업 완료 후 동기식으로 레플리카에 전파
- 클라이언트 응답은 모든 인-싱크 레플리카의 복제 완료 후 전송

#### 7.1.1 복제 발생 시점과 프로세스

```java
// 엘라스틱서치 실제 복제 프로세스 기반 의사코드
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/action/support/replication/ReplicationOperation.java
public void execute() throws Exception {
    // 1. 프라이머리에서 작업 실행
    PrimaryResult primaryResult = primary.perform(request);
    
    // 2. In-Sync 레플리카 목록 확인
    final Set<String> inSyncAllocationIds = primary.getActiveAllocationIds();
    final Set<String> trackedAllocationIds = primary.getTrackedAllocationIds();
    
    // 3. 모든 In-Sync 레플리카에 병렬 복제
    final List<ReplicaRequest> replicaRequests = new ArrayList<>();
    for (final ShardRouting shard : replicationGroup.getReplicationTargets()) {
        if (shard.primary() == false && 
            inSyncAllocationIds.contains(shard.allocationId().getId())) {
            
            ReplicaRequest replicaRequest = new ReplicaRequest(
                primaryResult.operation, 
                primaryResult.sequenceNumber,
                shard
            );
            replicaRequests.add(replicaRequest);
            
            // 비동기로 복제 요청 전송
            performOnReplica(shard, replicaRequest);
        }
    }
    
    // 4. 모든 복제 완료 대기 후 클라이언트 응답
    waitForAllReplicasAndRespond(primaryResult, replicaRequests);
}
```

**복제 과정의 핵심 특징:**

- **동기식 복제**: 모든 인-싱크 레플리카의 완료를 기다림
- **병렬 처리**: 여러 레플리카에 동시에 복제 요청 전송
- **순서 보장**: 시퀀스 번호로 작업 순서 보장
- **장애 허용**: 일부 레플리카 실패 시 인-싱크에서 제외

#### 7.1.2 In-Sync Allocation의 관리

엘라스틱서치는 데이터 일관성을 위해 **in-sync copies** 개념을 사용한다.

```java
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/index/seqno/ReplicationTracker.java
public class ReplicationTracker {
    
    // In-Sync 상태로 승격
    public synchronized void markAllocationIdAsInSync(String allocationId, long localCheckpoint) {
        final CopyState copyState = checkpoints.get(allocationId);
        if (copyState != null && copyState.inSync == false) {
            // 로컬 체크포인트가 글로벌 체크포인트와 동기화되면 In-Sync 승격
            if (localCheckpoint >= globalCheckpoint) {
                copyState.inSync = true;
                recomputeGlobalCheckpoint();
                logger.info("marked allocation [{}] as in-sync", allocationId);
            }
        }
    }
    
    // In-Sync에서 제외
    public synchronized void removeAllocationId(String allocationId) {
        if (checkpoints.remove(allocationId) != null) {
            recomputeGlobalCheckpoint();
            logger.info("removed allocation [{}] from in-sync set", allocationId);
        }
    }
    
    // 글로벌 체크포인트 재계산
    private void recomputeGlobalCheckpoint() {
        // 모든 in-sync 샤드가 공통으로 보유한 최신 시퀀스 번호 계산
        long newGlobalCheckpoint = checkpoints.values().stream()
            .filter(CopyState::isInSync)
            .mapToLong(CopyState::getLocalCheckpoint)
            .min()
            .orElse(SequenceNumbers.NO_OPS_PERFORMED);
            
        this.globalCheckpoint = newGlobalCheckpoint;
        logger.debug("updated global checkpoint to [{}]", newGlobalCheckpoint);
    }
}
```

**In-Sync 상태의 의미:**

- **동기화 완료**: 프라이머리와 동일한 데이터를 보유한 상태
- **복제 참여**: 모든 새로운 쓰기 작업에 참여하는 레플리카
- **승격 자격**: 프라이머리 장애 시 승격 가능한 후보
- **일관성 보장**: 글로벌 체크포인트 계산에 참여

**In-Sync에서 제외되는 경우:**

- 복제 요청 타임아웃 (기본 30초)
- 네트워크 연결 끊김
- 노드 장애나 과부하로 응답 불가
- 시퀀스 번호 불일치 (데이터 손상)

### 7.2 복제 실패 처리와 복구 메커니즘

#### 7.2.1 Peer Recovery의 단계별 과정

레플리카가 복귀하거나 새로 생성될 때의 복구 프로세스:

```java
// 엘라스틱서치 실제 복구 구현 기반 의사코드
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/indices/recovery/PeerRecoveryTargetService.java
public RecoveryResponse doRecovery(final long recoveryId, final StartRecoveryRequest request) {
    
    // 1단계: Global Checkpoint 확인
    final long startingSeqNo = request.startingSeqNo();
    final long targetGlobalCheckpoint = indexShard.getLastKnownGlobalCheckpoint();
    final long sourceGlobalCheckpoint = request.globalCheckpoint();
    
    logger.info("starting recovery from seq_no [{}] to [{}]", startingSeqNo, sourceGlobalCheckpoint);
    
    if (startingSeqNo <= targetGlobalCheckpoint) {
        // 2단계: 파일 기반 복구 (Phase 1) - 큰 차이가 있는 경우
        if (shouldPerformFileBasedRecovery(startingSeqNo, targetGlobalCheckpoint)) {
            recoverFromStore(request);
            logger.info("completed file-based recovery phase");
        }
        
        // 3단계: 트랜잭션 로그 기반 복구 (Phase 2) - 세부 차이 복구
        recoverFromTranslog(startingSeqNo, sourceGlobalCheckpoint, request);
        logger.info("completed translog-based recovery phase");
    } else {
        // 전체 복구 필요 (데이터가 너무 뒤처진 경우)
        performFullRecovery(request);
        logger.info("completed full recovery");
    }
    
    // 4단계: 최종화 및 In-Sync 복귀
    finalizeRecovery();
    return new RecoveryResponse();
}

private void recoverFromTranslog(long startingSeqNo, long endSeqNo, StartRecoveryRequest request) {
    // 프라이머리의 translog에서 누락된 작업들 가져오기
    final List<Translog.Operation> operations = 
        sourceNode.getHistoryOperations(startingSeqNo, endSeqNo);
    
    logger.info("recovering [{}] operations from translog", operations.size());
    
    // 작업들을 순서대로 재실행
    for (Translog.Operation operation : operations) {
        indexShard.applyTranslogOperation(operation);
        
        // 진행 상황 로깅 (1000개마다)
        if (operation.seqNo() % 1000 == 0) {
            logger.debug("recovered up to seq_no [{}]", operation.seqNo());
        }
    }
}
```

**복구 과정의 세 가지 유형:**

1. **트랜잭션 로그 복구**: 작은 차이 (수천 개 작업 이하)
  - 누락된 작업들만 트랜잭션 로그에서 가져와서 재실행
  - 빠른 복구 가능 (수초~수분)

2. **파일 기반 복구**: 중간 차이 (수만 개 작업)
  - 루씬 인덱스 파일들을 직접 복사 후 트랜잭션 로그로 마무리
  - 중간 속도 복구 (수분~수십분)

3. **전체 복구**: 큰 차이 (매우 오래된 레플리카)
  - 처음부터 모든 데이터를 다시 복사
  - 느린 복구 (수십분~수시간)

#### 7.2.2 지연된 할당으로 불필요한 복구 방지

노드가 일시적으로 떠날 때 즉시 복구하지 않는 최적화:

```java
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/allocation/decider/SameShardAllocationDecider.java
public Decision canAllocate(ShardRouting shardRouting, RoutingNode node, RoutingAllocation allocation) {
    
    // 지연된 할당 확인
    if (shardRouting.unassignedInfo() != null) {
        final UnassignedInfo unassignedInfo = shardRouting.unassignedInfo();
        final IndexMetadata indexMetadata = allocation.metadata().getIndexSafe(shardRouting.index());
        final Setting<TimeValue> delaySetting = INDEX_DELAYED_NODE_LEFT_TIMEOUT_SETTING;
        final TimeValue delayTimeout = delaySetting.get(indexMetadata.getSettings());
        
        // 노드 떠남으로 인한 미할당인 경우 지연 적용
        if (unassignedInfo.getReason() == UnassignedInfo.Reason.NODE_LEFT) {
            final long delayUntil = unassignedInfo.getUnassignedTimeInMillis() + delayTimeout.millis();
            final long currentTime = allocation.getCurrentNanoTime() / 1_000_000; // 나노초를 밀리초로
            
            if (delayUntil > currentTime) {
                long remainingDelay = delayUntil - currentTime;
                return allocation.decision(Decision.Type.NO, NAME, 
                    "delaying allocation for [{}ms] as node left the cluster, remaining delay [{}ms]", 
                    delayTimeout.millis(), remainingDelay);
            }
        }
    }
    return Decision.YES;
}
```

**지연된 할당의 이점:**

- **불필요한 복구 방지**: 재부팅이나 일시적 네트워크 장애 시 복구 작업 생략
- **리소스 절약**: 네트워크 대역폭과 디스크 I/O 절약
- **성능 보호**: 복구 중 성능 저하 방지
- **자동 복귀**: 노드가 돌아오면 즉시 정상 서비스 재개

**지연 할당 제어 설정:**

```json
PUT /_all/_settings
{
  "settings": {
    "index.unassigned.node_left.delayed_timeout": "5m"  // 5분 대기
  }
}
```

### 7.3 복제와 일관성 모델

#### 7.3.1 시퀀스 번호 기반 순서 보장

```java
// 출처: https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/index/seqno/SequenceNumbers.java
public class SequenceNumbers {
    
    // 유효한 시퀀스 번호 검증
    public static boolean isValidSequenceNumber(long value) {
        return value >= 0;
    }
    
    // 시퀀스 번호 문자열 변환
    public static String toString(long seqNo) {
        if (seqNo == NO_OPS_PERFORMED) return "NO_OPS_PERFORMED";
        if (seqNo == UNASSIGNED_SEQ_NO) return "UNASSIGNED_SEQ_NO";
        return Long.toString(seqNo);
    }
    
    // 특수 시퀀스 번호 상수
    public static final long NO_OPS_PERFORMED = -1L;    // 작업이 없음
    public static final long UNASSIGNED_SEQ_NO = -2L;   // 할당되지 않음
}
```

**시퀀스 번호 시스템의 역할:**

- **순서 보장**: 모든 작업에 단조 증가하는 번호 부여
- **복구 기준점**: 어디서부터 복구해야 하는지 정확한 지점 제공
- **일관성 검증**: 레플리카 간 데이터 일치 여부 확인
- **충돌 해결**: 동시 작업 시 순서 결정

**글로벌 체크포인트의 의미:**

- 모든 인-싱크 샤드가 공통으로 보유한 최신 시퀀스 번호
- 이 지점까지의 데이터는 영구적으로 안전하게 저장됨
- 복구 시 이 지점부터 누락된 작업들만 복제하면 됨

**복제 일관성 제어 설정:**

```json
PUT /_cluster/settings
{
  "persistent": {
    "indices.recovery.max_bytes_per_sec": "40mb",        // 복구 속도 제한
    "indices.recovery.concurrent_streams": 3,            // 동시 복구 스트림 수
    "indices.recovery.activity_timeout": "30m",          // 복구 타임아웃
    "cluster.routing.allocation.node_concurrent_incoming_recoveries": 2  // 노드당 동시 복구 수
  }
}
```

> **관련 코드**: [ReplicationTracker.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/index/seqno/ReplicationTracker.java), [PeerRecoveryTargetService.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/indices/recovery/PeerRecoveryTargetService.java)

---

## 8. 복제본은 어떻게 프라이머리로 승격하는가?

### 8.1 복제본 승격의 정의와 트리거

#### 8.1.1 승격이 발생하는 상황

복제본 승격(Replica Promotion)은 프라이머리 샤드가 사용 불가능해졌을 때, 해당 샤드의 복제본(레플리카) 중 하나를 새로운 프라이머리로 승격시키는 과정이다.

**승격 트리거 조건:**

- 프라이머리 샤드가 위치한 노드의 하드웨어 장애
- 네트워크 분할로 인한 프라이머리 샤드 격리
- 프라이머리 샤드 데이터 손상
- 계획된 노드 재시작 또는 강제 종료
- 클러스터 설정 변경으로 인한 샤드 이동

### 8.2 승격 후보 선택 알고리즘

#### 8.2.1 In-Sync Allocation ID 기반 선택

엘라스틱서치는 데이터 안전성을 최우선으로 하여 **오직 In-Sync 상태의 레플리카만이 프라이머리로 승격**될 수 있다.

**In-Sync 조건:**

- 프라이머리와 데이터 동기화가 유지된 레플리카
- 글로벌 체크포인트 이상의 시퀀스 번호를 보유
- 최근까지 복제 작업에 성공적으로 응답한 레플리카
- 네트워크 연결이 정상이고 응답 시간이 허용 범위 내

```java
// 엘라스틱서치 승격 후보 선택 로직 (의사코드)
public ShardRouting selectPrimaryCandidate(List<ShardRouting> inSyncReplicas, 
                                          IndexMetadata indexMetadata) {
    
    // 1. In-Sync 레플리카만 고려 (데이터 안전성 보장)
    List<ShardRouting> candidates = filterInSyncReplicas(inSyncReplicas);
    
    if (candidates.isEmpty()) {
        // 심각한 상황: 승격 가능한 레플리카가 없음
        logger.error("No in-sync replicas available for promotion, data loss possible");
        return null; // 수동 개입 필요
    }
    
    // 2. 선택 우선순위 적용
    return candidates.stream()
        .sorted((r1, r2) -> {
            // 우선순위 1: 최신 시퀀스 번호 (데이터 손실 최소화)
            long checkpoint1 = getLocalCheckpoint(r1);
            long checkpoint2 = getLocalCheckpoint(r2);
            int seqComparison = Long.compare(checkpoint2, checkpoint1);
            if (seqComparison != 0) return seqComparison;
            
            // 우선순위 2: Allocation ID 순서 (결정론적 선택)
            String allocationId1 = r1.allocationId().getId();
            String allocationId2 = r2.allocationId().getId();
            int allocationComparison = allocationId1.compareTo(allocationId2);
            if (allocationComparison != 0) return allocationComparison;
            
            // 우선순위 3: 노드 성능 특성 (부하, 하드웨어)
            return compareNodePerformance(r1.currentNodeId(), r2.currentNodeId());
        })
        .findFirst()
        .orElse(null);
}

private int compareNodePerformance(String nodeId1, String nodeId2) {
    NodeStats stats1 = getNodeStats(nodeId1);
    NodeStats stats2 = getNodeStats(nodeId2);
    
    // CPU 사용률 비교
    double cpu1 = stats1.getOs().getCpu().getPercent();
    double cpu2 = stats2.getOs().getCpu().getPercent();
    if (Math.abs(cpu1 - cpu2) > 10) {
        return Double.compare(cpu1, cpu2); // 낮은 CPU 사용률 우선
    }
    
    // 디스크 사용률 비교
    double disk1 = stats1.getFs().getTotal().getUsedPercent();
    double disk2 = stats2.getFs().getTotal().getUsedPercent();
    return Double.compare(disk1, disk2); // 낮은 디스크 사용률 우선
}
```

#### 8.2.2 선택 우선순위의 상세 설명

**1순위: 시퀀스 번호 (Sequence Number)**

- 가장 높은 로컬 체크포인트를 가진 레플리카 선택
- 최신 데이터를 보유하여 데이터 손실을 최소화
- 몇 개의 작업 차이라도 중요한 데이터일 수 있음

**2순위: 할당 ID (Allocation ID)**

- 동일한 시퀀스 번호인 경우 할당 ID의 사전 순서로 선택
- 결정론적 선택으로 split-brain 상황 방지
- 모든 마스터 노드가 동일한 결정을 내리도록 보장

**3순위: 노드 특성**

- 노드의 현재 부하 상태 (CPU, 메모리, 디스크)
- 하드웨어 성능과 네트워크 상태
- 클러스터 전체 균형을 위한 배치 최적화

### 8.3 승격 과정의 상세 구현

#### 8.3.1 마스터 노드의 승격 처리

```java
// 마스터 노드의 승격 처리 로직 (의사코드)
public void handlePrimaryShardFailure(ShardId shardId, String failedNodeId, String reason) {
    
    logger.warn("Primary shard [{}] on node [{}] failed: {}", shardId, failedNodeId, reason);
    
    // 1. 현재 In-Sync 레플리카 목록 조회
    IndexShardRoutingTable shardTable = getShardRoutingTable(shardId);
    List<ShardRouting> inSyncReplicas = shardTable.getInSyncReplicas();
    
    logger.info("Found [{}] in-sync replicas for promotion consideration", inSyncReplicas.size());
    
    // 2. 승격 후보 선택
    ShardRouting promotionCandidate = selectBestReplica(inSyncReplicas);
    
    if (promotionCandidate == null) {
        // 치명적 상황: 프라이머리 샤드 없음 (Red 상태)
        logger.error("No suitable replica found for promotion, marking shard as unassigned");
        markShardAsUnassigned(shardId, UnassignedInfo.Reason.PRIMARY_FAILED);
        publishClusterStateUpdate("primary-failed-no-replica", shardId);
        return;
    }
    
    logger.info("Selected replica [{}] on node [{}] for promotion", 
               promotionCandidate.allocationId(), promotionCandidate.currentNodeId());
    
    // 3. 승격 실행
    promoteReplicaToPrimary(promotionCandidate);
    
    // 4. 클러스터 상태 업데이트 및 전파
    publishClusterStateUpdate("replica-promoted", shardId);
    
    // 5. 새 레플리카 할당 계획 수립
    scheduleReplicaAllocation(shardId);
}

private void promoteReplicaToPrimary(ShardRouting replica) {
    // 레플리카를 프라이머리로 상태 변경
    ShardRouting newPrimary = replica.moveToStarted()
                                   .asPrimary()
                                   .withRecoverySource(RecoverySource.ExistingStoreRecoverySource.INSTANCE);
    
    // 라우팅 테이블에 새 프라이머리 정보 반영
    updateRoutingTable(newPrimary);
    
    // 해당 노드에 승격 명령 전송
    PromotionRequest promotionRequest = new PromotionRequest(
        newPrimary.shardId(),
        newPrimary.allocationId(),
        System.currentTimeMillis()
    );
    
    sendPromotionCommand(newPrimary.currentNodeId(), promotionRequest);
}
```

#### 8.3.2 데이터 노드의 승격 처리

```java
// 데이터 노드의 승격 수신 처리 (의사코드)
public void handlePromotionCommand(PromotionRequest request) {
    final ShardId shardId = request.getShardId();
    
    try {
        logger.info("Received promotion command for shard [{}]", shardId);
        
        IndexShard shard = getIndexShard(shardId);
        
        // 1. 현재 상태 검증
        if (!shard.isReplica()) {
            throw new IllegalStateException(
                String.format("Shard [%s] is not a replica, current state: %s", 
                             shardId, shard.state()));
        }
        
        // 2. In-Sync 상태 확인
        if (!shard.isInSync()) {
            throw new IllegalStateException(
                String.format("Replica [%s] is not in-sync, cannot promote", shardId));
        }
        
        // 3. 데이터 일관성 검증
        long localCheckpoint = shard.getLocalCheckpoint();
        long globalCheckpoint = shard.getGlobalCheckpoint();
        if (localCheckpoint < globalCheckpoint) {
            logger.warn("Local checkpoint [{}] behind global checkpoint [{}], " +
                       "attempting quick recovery", localCheckpoint, globalCheckpoint);
            performQuickRecovery(shard, globalCheckpoint);
        }
        
        // 4. 승격 실행
        logger.info("Promoting replica [{}] to primary", shardId);
        shard.promoteToPrimary();
        
        // 5. 새 프라이머리로서 초기화
        shard.activateAsPrimary();
        shard.initializeAsNewPrimary();
        
        // 6. 복제 추적기 초기화 (새로운 In-Sync 관리 시작)
        shard.getReplicationTracker().activateWithPrimaryMode();
        
        // 7. 마스터에 성공 보고
        reportPromotionSuccess(shardId, shard.getLocalCheckpoint());
        
        logger.info("Successfully promoted replica [{}] to primary", shardId);
        
    } catch (Exception e) {
        logger.error("Failed to promote replica [{}] to primary", shardId, e);
        reportPromotionFailure(shardId, e);
    }
}

private void performQuickRecovery(IndexShard shard, long targetCheckpoint) {
    // 필요한 작업들을 트랜잭션 로그에서 찾아서 재실행
    List<Translog.Operation> missingOps = shard.getTranslog()
        .readOperations(shard.getLocalCheckpoint() + 1, targetCheckpoint);
    
    for (Translog.Operation op : missingOps) {
        shard.applyTranslogOperation(op);
    }
    
    shard.syncTranslog(); // 변경사항 즉시 반영
}
```

### 8.4 승격과 데이터 일관성

#### 8.4.1 시퀀스 번호 기반 일관성 보장

승격 시 데이터 손실을 방지하기 위해, 새 프라이머리는 엄격한 일관성 검사를 수행한다:

**글로벌 체크포인트 관리:**

```java
// 글로벌 체크포인트 계산 로직
private long calculateGlobalCheckpoint() {
    // 모든 In-Sync 레플리카가 공통으로 확인한 최신 시퀀스 번호
    return inSyncReplicas.stream()
        .mapToLong(ReplicaInfo::getLocalCheckpoint)
        .min()
        .orElse(SequenceNumbers.NO_OPS_PERFORMED);
}
```

**데이터 일관성 원칙:**

- 새 프라이머리는 자신의 로컬 체크포인트 이후의 작업만 수락
- 승격 전까지의 모든 작업은 이미 글로벌 체크포인트로 보장됨
- 데이터 손실 없이 승격 완료 보장

#### 8.4.2 Split-Brain 방지 메커니즘

```java
// 클러스터 상태 충돌 검사
public boolean isValidPromotionState(long currentStateVersion, 
                                   long promotionStateVersion,
                                   String masterId) {
    
    // 1. 상태 버전 검증
    if (promotionStateVersion <= currentStateVersion) {
        logger.warn("Ignoring stale promotion command, current: {}, received: {}", 
                   currentStateVersion, promotionStateVersion);
        return false; // 구버전 승격 명령 거부
    }
    
    // 2. 마스터 노드 검증
    if (!isCurrentMaster(masterId)) {
        logger.warn("Promotion command from non-master node [{}], ignoring", masterId);
        return false; // 비마스터 노드의 명령 거부
    }
    
    // 3. 네트워크 분할 검사
    if (isNetworkPartitioned()) {
        logger.warn("Network partition detected, refusing promotion to prevent split-brain");
        return false; // 분할 상황에서 승격 거부
    }
    
    return true; // 모든 검증 통과
}
```

### 8.5 승격 시나리오와 대응

#### 8.5.1 정상적인 승격 케이스

**시나리오: 3노드 클러스터에서 1개 노드 장애**

```
초기 상태:
Node A: P0(프라이머리), R1(레플리카)
Node B: P1(프라이머리), R0(레플리카)  ← 장애 발생
Node C: R0(레플리카), R1(레플리카)

승격 후:
Node A: P0(프라이머리), P1(승격됨)
Node C: R0(레플리카), R1(레플리카)

결과: 모든 샤드의 프라이머리가 유지되어 서비스 지속
```

**승격 소요 시간:**

- 장애 감지: 1-3초 (헬스체크 주기)
- 승격 결정: 1초 이내 (마스터 노드 처리)
- 승격 실행: 1-2초 (네트워크 + 처리)
- **총 소요시간: 3-6초 내외**

#### 8.5.2 승격 실패 시 대응 방안

**케이스 1: 승격 후보가 있는 경우**

```bash
# 클러스터 상태 확인
GET /_cluster/health?pretty

# 샤드 상태 상세 조회 (unassigned 원인 확인)
GET /_cat/shards?v&h=index,shard,prirep,state,node,unassigned.reason

# 자동 할당 활성화 확인
PUT /_cluster/settings
{
  "transient": {
    "cluster.routing.allocation.enable": "all"
  }
}
```

**케이스 2: 모든 복제본 손실 (최악의 상황)**

```bash
# 데이터 손실을 감수하고 빈 프라이머리 샤드 강제 할당
POST /_cluster/reroute
{
  "commands": [{
    "allocate_empty_primary": {
      "index": "my_index",
      "shard": 0,
      "node": "target_node",
      "accept_data_loss": true
    }
  }]
}
```

**주의: 이 명령은 해당 샤드의 모든 데이터를 삭제하고 빈 샤드를 생성한다.**

**케이스 3: 손상된 데이터로 복구 시도**

```bash
# 손상되었지만 일부 데이터라도 복구 시도
POST /_cluster/reroute
{
  "commands": [{
    "allocate_stale_primary": {
      "index": "my_index", 
      "shard": 0,
      "node": "node-with-stale-data",
      "accept_data_loss": true
    }
  }]
}
```

### 8.6 승격 모니터링과 최적화

#### 8.6.1 승격 이벤트 확인

**로그 패턴 모니터링:**

```bash
# 승격 관련 로그 검색
grep -i "promoted.*primary" /var/log/elasticsearch/*.log
grep -i "shard.*moved.*primary" /var/log/elasticsearch/*.log

# 클러스터 상태 변경 로그
grep -i "cluster state updated" /var/log/elasticsearch/*.log

# 예시 로그:
# [2024-01-15T10:30:15.123] [INFO] [o.e.c.r.a.AllocationService] 
# [node-1] promoting replica [my_index][0] on node [node-3] to primary
```

**API를 통한 모니터링:**

```bash
# 현재 진행 중인 복구 작업 확인
GET /_recovery?active_only=true

# 샤드 할당 설명 (문제 진단)
GET /_cluster/allocation/explain
{
  "index": "my_index",
  "shard": 0,
  "primary": true
}
```

#### 8.6.2 승격 최적화 설정

**프라이머리 복구 속도 향상:**

```json
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.node_initial_primaries_recoveries": 8,
    "indices.recovery.max_bytes_per_sec": "200mb",
    "cluster.routing.allocation.same_shard.host": false,
    "cluster.routing.allocation.awareness.attributes": "rack_id"
  }
}
```

**지연 할당으로 불필요한 승격 방지:**

```json
PUT /my_index/_settings
{
  "index.unassigned.node_left.delayed_timeout": "10m"
}
```

**승격 관련 알림 설정:**

```json
PUT /_watcher/watch/shard_promotion_alert
{
  "trigger": {
    "schedule": {
      "interval": "30s"
    }
  },
  "input": {
    "search": {
      "request": {
        "indices": ".monitoring-es-*",
        "body": {
          "query": {
            "bool": {
              "must": [
                {"term": {"type": "shards"}},
                {"term": {"shard.state": "UNASSIGNED"}},
                {"range": {"timestamp": {"gte": "now-1m"}}}
              ]
            }
          }
        }
      }
    }
  },
  "condition": {
    "compare": {
      "ctx.payload.hits.total": {
        "gt": 0
      }
    }
  },
  "actions": {
    "send_email": {
      "email": {
        "to": ["admin@company.com"],
        "subject": "Elasticsearch Shard Promotion Alert",
        "body": "Unassigned shards detected, possible primary promotion needed"
      }
    }
  }
}
```

> **관련 코드**: [ShardStateAction.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/action/shard/ShardStateAction.java), [AllocationService.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/allocation/AllocationService.java)

---

## 9. 운영 시 참고할 내용

### 9.1 샤드 크기 최적화 전략

#### 9.1.1 최적 샤드 크기 계산

```java
// 실제 운영에서 사용할 수 있는 샤드 크기 계산 로직
public class ShardSizeCalculator {
    
    // 다양한 요소를 고려한 종합적 계산
    public ShardConfiguration calculateOptimalShards(ClusterSpecs specs) {
        
        // 1. 데이터 크기 기반 계산 (20-40GB per shard)
        int shardsBySize = Math.max(1, 
            (int) Math.ceil(specs.totalDataSizeGB / 30.0));
        
        // 2. 검색 성능 기반 계산 (1000 QPS per shard)
        int shardsByQPS = Math.max(1, specs.expectedQPS / 1000);
        
        // 3. 인덱싱 성능 기반 계산 (5000 DPS per shard)
        int shardsByIndexing = Math.max(1, specs.expectedIndexingRate / 5000);
        
        // 4. 인프라 제약 기반 계산
        int maxShardsByNodes = specs.dataNodeCount * 2; // 노드당 2-3개 권장
        int maxShardsByHeap = (specs.totalHeapGB * 25); // heap GB당 25개 이하
        
        // 5. 가장 제한적인 조건들을 종합
        int recommendedShards = Math.min(
            Math.max(Math.max(shardsBySize, shardsByQPS), shardsByIndexing),
            Math.min(maxShardsByNodes, maxShardsByHeap)
        );
        
        // 6. 레플리카 수 계산 (가용성 vs 비용)
        int recommendedReplicas = calculateReplicas(specs.availabilityRequirement);
        
        return new ShardConfiguration(recommendedShards, recommendedReplicas);
    }
    
    private int calculateReplicas(AvailabilityLevel level) {
        switch (level) {
            case DEVELOPMENT: return 0;      // 개발환경
            case PRODUCTION: return 1;       // 일반 운영환경
            case HIGH_AVAILABILITY: return 2; // 고가용성 요구환경
            case MISSION_CRITICAL: return 3;  // 미션 크리티컬
            default: return 1;
        }
    }
}
```

**권장 기준표:**

| 데이터 특성  | 샤드 크기   | 샤드 수 계산   | 고려사항             |
|---------|---------|-----------|------------------|
| 로그 데이터  | 20-30GB | 시간 기반 분할  | 빠른 인덱싱, 시간 범위 쿼리 |
| 검색 데이터  | 30-40GB | QPS 기반    | 복잡한 쿼리, 응답 시간    |
| 분석 데이터  | 40-50GB | 집계 성능 중심  | 대용량 스캔, 메모리 사용량  |
| 실시간 데이터 | 10-20GB | 인덱싱 속도 중심 | 높은 쓰기 부하, 짧은 보존  |

### 9.2 클러스터 상태 진단과 해결

#### 9.2.1 상태별 대응 방안

**🟢 Green 상태 유지 전략:**

```bash
# 정기적인 클러스터 헬스 체크
GET /_cluster/health?level=shards&timeout=30s

# 성능 지표 모니터링
GET /_cluster/stats
GET /_nodes/stats/indices,os,process,jvm

# 예방적 모니터링 설정
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.disk.watermark.low": "80%",
    "cluster.routing.allocation.disk.watermark.high": "85%",
    "cluster.routing.allocation.disk.watermark.flood_stage": "90%"
  }
}
```

**🟡 Yellow 상태 해결 프로세스:**

```bash
# 1. 문제 상황 파악
GET /_cluster/allocation/explain
{
  "include_yes_decisions": false,
  "include_disk_info": true
}

# 2. 미할당 샤드 원인 분석
GET /_cat/shards?v&h=index,shard,prirep,state,node,unassigned.reason

# 3. 일반적인 해결 방법들
# 3-1. 레플리카 수 조정
PUT /my_index/_settings
{
  "number_of_replicas": 0
}

# 3-2. 할당 제한 해제
PUT /_cluster/settings
{
  "transient": {
    "cluster.routing.allocation.enable": "all",
    "cluster.routing.rebalance.enable": "all"
  }
}

# 3-3. 디스크 임계값 조정 (임시)
PUT /_cluster/settings
{
  "transient": {
    "cluster.routing.allocation.disk.watermark.low": "90%",
    "cluster.routing.allocation.disk.watermark.high": "95%"
  }
}
```

**🔴 Red 상태 긴급 대응:**

```bash
# 1. 손실된 프라이머리 샤드 식별
GET /_cat/shards?v&h=index,shard,prirep,state,node&s=state

# 2. 데이터 손실 각오하고 빈 프라이머리 할당
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

# 3. 손상된 샤드에서 최대한 데이터 복구 시도
POST /_cluster/reroute
{
  "commands": [{
    "allocate_stale_primary": {
      "index": "my_index", 
      "shard": 0,
      "node": "node-2",
      "accept_data_loss": true
    }
  }]
}
```

#### 9.2.2 할당 인식으로 가용성 향상

**랙 인식 설정 (Rack Awareness):**

```yaml
# elasticsearch.yml
node.attr.rack_id: rack1
cluster.routing.allocation.awareness.attributes: rack_id
```

```json
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.awareness.attributes": "rack_id",
    "cluster.routing.allocation.awareness.force.rack_id.values": ["rack1", "rack2", "rack3"]
  }
}
```

**존 인식 설정 (Zone Awareness):**

```yaml
# elasticsearch.yml (AWS 환경)
node.attr.zone: us-east-1a
cluster.routing.allocation.awareness.attributes: zone
```

**강제 인식으로 분산 보장:**

```json
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.awareness.force.zone.values": ["us-east-1a", "us-east-1b", "us-east-1c"]
  }
}
```

### 9.3 성능 최적화 설정

#### 9.3.1 인덱싱 최적화

**대량 인덱싱을 위한 설정:**

```json
PUT /my_index/_settings
{
  "refresh_interval": "30s",        // 리프레시 간격 증가
  "number_of_replicas": 0,          // 인덱싱 중 레플리카 비활성화
  "translog.durability": "async",   // 비동기 트랜잭션 로그
  "translog.sync_interval": "30s",  // 동기화 간격 증가
  "translog.flush_threshold_size": "1gb"  // 플러시 임계값 증가
}

# 인덱싱 완료 후 복원
PUT /my_index/_settings
{
  "refresh_interval": "1s",
  "number_of_replicas": 1,
  "translog.durability": "request"
}
```

**인덱싱 성능 모니터링:**

```bash
# 인덱싱 통계 확인
GET /_stats/indexing

# 노드별 인덱싱 성능
GET /_nodes/stats/indices/indexing

# 트랜잭션 로그 상태
GET /_stats/translog
```

#### 9.3.2 검색 성능 향상

**검색 최적화 설정:**

```json
PUT /_cluster/settings
{
  "persistent": {
    "search.max_buckets": 65536,              // 집계 버킷 수 제한
    "thread_pool.search.queue_size": 1000,    // 검색 큐 크기
    "indices.queries.cache.size": "20%",      // 쿼리 캐시 크기
    "indices.fielddata.cache.size": "40%",    // 필드 데이터 캐시
    "indices.requests.cache.size": "5%"       // 요청 캐시 크기
  }
}
```

**검색 성능 튜닝:**

```bash
# 동시 검색 요청 제한으로 부하 조절
GET /my_index/_search?max_concurrent_shard_requests=3
{
  "query": {"match_all": {}}
}

# 프리퍼런스로 캐시 활용
GET /my_index/_search?preference=_local
{
  "query": {"term": {"status": "active"}}
}

# 라우팅으로 검색 범위 제한
GET /my_index/_search?routing=user123
{
  "query": {"range": {"timestamp": {"gte": "now-1d"}}}
}
```

**성능 모니터링:**

```bash
# 검색 성능 통계
GET /_stats/search

# 캐시 사용률 확인
GET /_nodes/stats/indices/query_cache,request_cache,fielddata

# 느린 쿼리 로그 설정
PUT /_cluster/settings
{
  "transient": {
    "logger.org.elasticsearch.index.search.slowlog.query": "DEBUG",
    "logger.org.elasticsearch.index.search.slowlog.fetch": "DEBUG"
  }
}
```

### 9.4 장애 대응 시나리오

#### 9.4.1 노드 안전 제거 프로세스

**계획된 노드 제거:**

```bash
# 1. 새로운 데이터 할당 방지
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.exclude._name": "node-to-remove"
  }
}

# 2. 샤드 이동 진행 상황 모니터링
GET /_cat/recovery?v&active_only=true
GET /_cat/shards?v&h=index,shard,prirep,state,node

# 3. 모든 샤드 이동 완료 확인
GET /_cluster/health?wait_for_relocating_shards=0&timeout=300s

# 4. 노드 안전 종료
POST /_cluster/nodes/node-to-remove/_shutdown

# 5. 제외 설정 정리
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.exclude._name": null
  }
}
```

**응급 노드 복구:**

```bash
# 1. 장애 노드 상태 확인
GET /_cat/nodes?v&h=name,heap.percent,ram.percent,cpu,load_1m,node.role,master

# 2. 미할당 샤드 강제 할당
POST /_cluster/reroute?retry_failed=true

# 3. 복구 속도 조정
PUT /_cluster/settings
{
  "transient": {
    "cluster.routing.allocation.node_concurrent_recoveries": 4,
    "indices.recovery.max_bytes_per_sec": "100mb"
  }
}
```

#### 9.4.2 디스크 부족 대응

**디스크 공간 확보:**

```bash
# 1. 디스크 사용량 확인
GET /_cat/allocation?v&h=node,disk.used_percent,disk.used,disk.avail

# 2. 큰 인덱스 식별
GET /_cat/indices?v&h=index,store.size&s=store.size:desc

# 3. 오래된 데이터 삭제
DELETE /old_logs-2023-*

# 4. 샤드 이동으로 부하 분산
POST /_cluster/reroute
{
  "commands": [{
    "move": {
      "index": "large_index",
      "shard": 0,
      "from_node": "full_node",
      "to_node": "target_node"
    }
  }]
}
```

**임계값 조정 (임시 대응):**

```json
PUT /_cluster/settings
{
  "transient": {
    "cluster.routing.allocation.disk.watermark.low": "90%",
    "cluster.routing.allocation.disk.watermark.high": "95%",
    "cluster.routing.allocation.disk.watermark.flood_stage": "98%"
  }
}
```

#### 9.4.3 메모리 부족 대응

**힙 메모리 최적화:**

```bash
# JVM 힙 사용량 확인
GET /_nodes/stats/jvm

# 필드 데이터 캐시 정리
POST /_cache/clear?fielddata=true

# Circuit breaker 상태 확인
GET /_nodes/stats/breaker
```

**메모리 사용량 제한:**

```json
PUT /_cluster/settings
{
  "persistent": {
    "indices.breaker.fielddata.limit": "30%",
    "indices.breaker.request.limit": "40%",
    "indices.breaker.total.limit": "70%"
  }
}
```

### 9.5 모니터링과 알림 시스템

#### 9.5.1 핵심 지표 모니터링

**클러스터 레벨 지표:**

```bash
# 전체 상태 모니터링
GET /_cluster/health
GET /_cluster/stats

# 샤드 분배 상태
GET /_cat/shards?v&h=index,shard,prirep,state,node,unassigned.reason&s=state

# 노드 성능 지표
GET /_cat/nodes?v&h=name,heap.percent,ram.percent,cpu,load_1m,disk.used_percent
```

**인덱스 레벨 지표:**

```bash
# 인덱스 성능 통계
GET /_stats/indices/my_index

# 검색/인덱싱 성능
GET /_stats/search,indexing

# 캐시 효율성
GET /_stats/query_cache,request_cache,fielddata
```

#### 9.5.2 자동화된 알림 설정

**Watcher를 이용한 알림:**

```json
PUT /_watcher/watch/cluster_health_alert
{
  "trigger": {
    "schedule": {"interval": "30s"}
  },
  "input": {
    "http": {
      "request": {
        "host": "localhost",
        "port": 9200,
        "path": "/_cluster/health"
      }
    }
  },
  "condition": {
    "compare": {
      "ctx.payload.status": {"not_eq": "green"}
    }
  },
  "actions": {
    "send_email": {
      "email": {
        "to": ["ops-team@company.com"],
        "subject": "Elasticsearch Cluster Alert: {{ctx.payload.status}}",
        "body": "Cluster status is {{ctx.payload.status}}. Active shards: {{ctx.payload.active_shards}}, Unassigned shards: {{ctx.payload.unassigned_shards}}"
      }
    }
  }
}
```

---

## 10. 참고 자료

### 10.1 공식 문서

- [Elasticsearch Guide - Cluster-level shard allocation](https://www.elastic.co/guide/en/elasticsearch/reference/current/modules-cluster.html)
- [Search shard routing](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-shard-routing.html)
- [_routing field](https://www.elastic.co/guide/en/elasticsearch/reference/current/mapping-routing-field.html)
- [Reading and writing documents](https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-replication.html)
- [Index recovery settings](https://www.elastic.co/guide/en/elasticsearch/reference/current/recovery.html)
- [Delaying allocation when a node leaves](https://www.elastic.co/guide/en/elasticsearch/reference/current/delayed-allocation.html)
- [Shard allocation awareness](https://www.elastic.co/docs/deploy-manage/distributed-architecture/shard-allocation-relocation-recovery/shard-allocation-awareness)
- [Cluster health API](https://www.elastic.co/guide/en/elasticsearch/reference/current/cluster-health.html)
- [Cluster allocation explain API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-cluster-allocation-explain)

### 10.2 기술 블로그 및 심화 자료

- [Improving Response Latency with Adaptive Replica Selection](https://www.elastic.co/blog/improving-response-latency-in-elasticsearch-with-adaptive-replica-selection) - Elastic Blog
- [Tracking in-sync shard copies](https://www.elastic.co/blog/tracking-in-sync-shard-copies) - Elastic Blog
- [Demystifying Elasticsearch shard allocation](https://aws.amazon.com/blogs/opensource/open-distro-elasticsearch-shard-allocation/) - AWS Open Source Blog
- [18 Allocation Deciders in Elasticsearch](https://mincong.io/2020/09/27/shard-allocation/) - Mincong Huang
- [Promoting replica shards to primary in Elasticsearch](https://underthehood.meltwater.com/blog/2023/05/11/promoting-replica-shards-to-primary-in-elasticsearch-and-how-it-saves-us-12k-during-rolling-restarts/) - Meltwater Engineering Blog

### 10.3 GitHub 소스 코드

- [BalancedShardsAllocator.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/allocation/allocator/BalancedShardsAllocator.java) - 샤드 할당 알고리즘
- [AllocationDeciders.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/allocation/decider/AllocationDeciders.java) - 할당 결정자 체인
- [ReplicationOperation.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/action/support/replication/ReplicationOperation.java) - 복제 작업 처리
- [OperationRouting.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/routing/OperationRouting.java) - 라우팅 및 ARS 구현
- [ReplicationTracker.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/index/seqno/ReplicationTracker.java) - In-Sync 관리
- [ShardStateAction.java](https://github.com/elastic/elasticsearch/blob/main/server/src/main/java/org/elasticsearch/cluster/action/shard/ShardStateAction.java) - 샤드 상태 관리

### 10.4 연구 논문

- [PacificA: Replication in Log-Based Distributed Storage Systems](https://www.microsoft.com/en-us/research/publication/pacifica-replication-in-log-based-distributed-storage-systems/) - Microsoft Research
- [C3: Cutting Tail Latency in Cloud Data Stores via Adaptive Replica Selection](https://www.cs.cmu.edu/~dga/papers/c3-nsdi2015.pdf) - CMU Research

### 10.5 GitHub 이슈 및 구현

- [Adaptive replica selection implementation #24915](https://github.com/elastic/elasticsearch/issues/24915) - GitHub Issue
- [Enable adaptive replica selection by default #26522](https://github.com/elastic/elasticsearch/pull/26522) - GitHub PR
- [Balance step in BalancedShardsAllocator #21103](https://github.com/elastic/elasticsearch/pull/21103) - GitHub PR
- [Do not allow stale replicas to automatically be promoted to primary #14671](https://github.com/elastic/elasticsearch/issues/14671) - GitHub Issue

---

## 요약

### 내가 궁금했던 것들과 답

**Q1: 데이터는 정확히 어떻게 저장되나?**
→ 클러스터→노드→인덱스→샤드→도큐먼트의 계층 구조로 분산 저장. 각 샤드는 독립적인 Lucene 인덱스로 최대 20억 개 도큐먼트 저장 가능.

**Q2: 프라이머리와 레플리카의 실제 차이는?**
→ 프라이머리는 모든 쓰기의 진입점이자 권한 있는 원본으로 시퀀스 번호 관리와 In-Sync 레플리카 추적 담당. 레플리카는 실시간 복사본으로 읽기 성능 향상과 장애 시 즉시 승격 가능.

**Q3: 샤드 분배는 어떤 알고리즘으로?**
→ BalancedShardsAllocator의 3단계(미할당 샤드 할당→강제 이동→균형 최적화) 처리. 18개 할당 결정자 체인 통과 후 가중치 계산으로 노드 간 균등 분산.

**Q4: 도큐먼트는 어떤 샤드로 라우팅되나?**
→ `shard_num = (hash(_routing) % num_routing_shards) / routing_factor` 공식으로 결정론적 분산. Murmur3 해시로 균등 분배 보장, 커스텀 라우팅으로 검색 최적화 가능.

**Q5: 복제는 정확히 언제 어떻게?**
→ 모든 쓰기 작업 시 Primary-Backup 모델로 동기식 복제. 프라이머리에서 시퀀스 번호 할당 후 모든 In-Sync 레플리카에 병렬 전송, 완료 후 클라이언트 응답.

**Q6: 클라이언트는 어느 샤드에서 읽나?**
→ Adaptive Replica Selection(ARS)이 응답시간, 큐 크기, 노드 부하를 실시간 분석하여 최적 샤드 선택. C3 알고리즘으로 tail latency 최소화.

**Q7: 복제본은 어떻게 프라이머리로 승격하나?**
→ 프라이머리 장애 시 In-Sync 레플리카 중 최신 시퀀스 번호를 가진 것을 3-6초 내 즉시 승격. 글로벌 체크포인트 기반으로 데이터 손실 없이 가용성 유지.

### 내부 동작의 핵심 원리

- **해시 라우팅**: Murmur3 해시와 결정론적 공식으로 도큐먼트를 일관되게 특정 샤드에 배치
- **가중치 알고리즘**: 전체 샤드 수(0.45) + 인덱스별 샤드 수(0.55) + 프라이머리 수(0.05)로 노드 부하 수치화하여 최적 배치
- **동기식 복제**: 프라이머리가 모든 In-Sync 레플리카의 복제 완료를 기다려 일관성 보장
- **In-Sync 추적**: 글로벌 체크포인트 기반으로 동기화된 레플리카만 관리하여 데이터 안전성 확보
- **즉시 승격**: 프라이머리 장애 감지 후 수초 내 최적 레플리카를 승격시켜 서비스 연속성 보장
- **ARS 최적화**: 실시간 성능 메트릭(응답시간, 큐 크기, 부하)으로 C3 공식 기반 지능적 레플리카 선택
- **18개 결정자 체인**: 샤드 할당 전 모든 제약조건(디스크, 랙 인식, 필터 등)을 순차 검사하여 안전한 배치 보장
- **3단계 할당**: 미할당→강제이동→리밸런싱 순서로 필수 작업부터 처리하고 성능 영향 최소화
- **시퀀스 번호 시스템**: 모든 작업에 단조증가 번호 부여로 순서 보장 및 정확한 복구 지점 제공
- **지연된 할당**: 노드 일시 장애 시 불필요한 복구 방지로 리소스 절약과 성능 보호

### 운영 시 참고할 내용

**샤드 설계**: 데이터 크기(20-40GB), 검색 성능(1000 QPS), 인프라 제약(노드당 2-3개)을 종합 고려하여 적정 샤드 수 결정

**상태 관리**: Green(정상) → Yellow(레플리카 부족) → Red(프라이머리 손실) 순서로 심각도 증가. Yellow는 레플리카 조정, Red는 데이터 손실 각오한 강제 할당 필요

**성능 최적화**: 인덱싱 시 리프레시 간격 증가+레플리카 0개, 검색 시 라우팅 활용+캐시 최적화, ARS로 자동 부하 분산

**장애 대응**: 계획된 노드 제거는 exclude 설정→이동 완료 확인 순서, 응급 상황은 강제 할당→복구 속도 조정으로 빠른 복구

**모니터링**: 클러스터 상태, 샤드 분배, 노드 성능, 인덱스 통계를 정기 모니터링하고 Watcher로 자동 알림 설정
