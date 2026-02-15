---
title: "Apache Kafka 실무 사례 아카이브"
date: 2026-02-15
categories: [DevOps, Kafka]
tags: [Kafka, ConsumerLag, ExactlyOnce, KEDA, Partition, ConsumerProxy]
layout: post
toc: true
math: true
mermaid: true
---

이 글은 LinkedIn, Uber, Netflix 등 대규모 트래픽을 운영하는 기업들이 프로덕션 환경에서 Apache Kafka를 어떻게 운영하고, 어떤 문제를 겪었으며, 어떻게 해결했는지를 정리한 실무 사례 아카이브다. 단순한 설정 가이드가 아니라, 수천 대의 브로커와 수백 개의 Consumer Group을 운영하면서 축적된 교훈을 담고 있다. Kafka를 프로덕션에서 운영하거나, 대규모 이벤트 기반 아키텍처를 설계하는 엔지니어에게 실질적인 참고 자료가 될 것이다.

---

## 1. LinkedIn - 하루 7조 메시지를 처리하는 Kafka 운영기

- **출처:** [How LinkedIn customizes Apache Kafka for 7 trillion messages per day](https://engineering.linkedin.com/blog/2019/apache-kafka-trillion-messages)
- **저자:** LinkedIn Engineering Team

### 1.1 상황

LinkedIn은 Apache Kafka 프로젝트의 탄생지로, 사내 거의 모든 실시간 데이터 처리의 중추로 Kafka를 사용한다. 사용자 활동 추적(프로필 조회, 검색, 클릭 이벤트 등), 운영 메트릭 수집, Change Data Capture(CDC), 실시간 데이터 파이프라인 등 다양한 용도로 활용된다. 2019년 기준 일 처리량이 7조 건 이상에 달하며, 이는 초당 약 1300만 건의 메시지를 처리하는 규모다.

LinkedIn의 Kafka 인프라는 수천 대의 브로커로 구성된 여러 클러스터로 운영된다. 100개 이상의 클러스터가 여러 데이터센터에 분산 배포되어 있으며, 하나의 클러스터당 수백 개의 브로커가 존재한다. 이 규모에서는 일반적인 오픈소스 Kafka 구성으로는 운영 요구사항을 충족하기 어렵다. 특히 클러스터 규모가 커질수록 브로커 장애 시 복구 시간이 길어지고, 리밸런싱으로 인한 서비스 영향이 심각한 문제로 부상했다.

LinkedIn은 Kafka를 단순한 메시징 시스템이 아니라 전사 데이터 인프라의 주요 레이어로 취급한다. 따라서 가용성, 내구성, 처리량에 대한 요구 수준이 일반적인 Kafka 운영 환경보다 훨씬 높다.

### 1.2 문제

**파티션 리밸런싱에 의한 네트워크 폭풍:**
수천 개의 브로커를 운영하면서 브로커 추가/제거 또는 장애 발생 시 파티션 리밸런싱이 발생한다. 이때 대규모 데이터 이동(replica 재배치)이 발생하면서 클러스터 내부 네트워크 대역폭을 잠식한다. 리밸런싱 중에는 정상 트래픽의 처리 성능도 저하되어, 의도치 않게 전체 클러스터의 서비스 품질이 하락하는 상황이 반복되었다.

**ZooKeeper 과부하:**
브로커 하나가 다운되면 해당 브로커가 리더였던 수천 개 파티션의 리더 선출이 동시에 ZooKeeper를 통해 발생한다. 대규모 클러스터에서는 이 리더 선출 요청이 ZooKeeper의 처리 능력을 초과하면서, ZooKeeper 자체가 병목이 되어 장애 복구가 지연되는 문제가 있었다. 하나의 브로커 장애가 ZooKeeper 과부하를 통해 전체 클러스터 장애로 확산(cascading failure)될 위험이 존재했다.

**Hot Partition 문제:**
특정 토픽의 특정 파티션에 트래픽이 집중되면, 해당 파티션이 위치한 브로커의 디스크 I/O, 네트워크 대역폭, CPU 사용률이 급증한다. 파티션 키 설계가 불균형하거나, 특정 이벤트가 폭증하는 경우에 발생하며, 이 불균형이 브로커 간 부하 편차를 유발하여 클러스터 전체의 효율성을 저하시켰다.

**멀티 데이터센터 복제의 복잡성:**
여러 데이터센터에 걸친 Kafka 운영에서 데이터 복제의 일관성과 지연 시간 관리가 어려웠다. 데이터센터 간 네트워크 지연은 불가피하며, 이로 인해 cross-datacenter replication의 Lag 관리와 장애 시 failover 전략이 복잡해졌다.

### 1.3 해결

**자체 파티션 배치 최적화 시스템 구축:**
LinkedIn은 오픈소스 Kafka의 기본 파티션 배치 전략 대신, 자체 파티션 배치 최적화 도구를 개발했다. 이 도구는 브로커의 디스크 사용률, 네트워크 대역폭, CPU 사용률 등을 종합적으로 분석하여 파티션을 자동으로 재배치한다. 단순한 라운드 로빈이 아니라, 실제 브로커의 리소스 상태를 반영하는 지능적 배치 전략이다.

**점진적(Throttled) 리밸런싱:**
브로커 장애 발생 시 파티션 리밸런싱을 한 번에 수행하는 대신, 대역폭 제한(throttle)을 걸어 점진적으로 수행한다. `kafka-reassign-partitions.sh`의 `--throttle` 옵션과 유사한 메커니즘을 자동화하여, 리밸런싱 중에도 정상 트래픽의 처리 성능을 유지한다. 이는 리밸런싱 완료까지 시간이 더 걸리지만, 서비스 영향을 최소화하는 trade-off를 선택한 것이다.

**Rack-aware 파티션 배치:**
파티션의 리더와 팔로워 replica를 서로 다른 랙(rack) 또는 AZ(Availability Zone)에 분산 배치한다. 하나의 AZ가 전체 장애를 겪더라도 다른 AZ에 있는 replica가 리더로 승격되어 데이터 유실 없이 서비스를 유지할 수 있다. Kafka의 `broker.rack` 설정과 `CreateTopicCommand`의 rack-aware 로직을 커스터마이징하여 적용했다.

**ZooKeeper 의존성 완화:**
ZooKeeper에 대한 직접적인 의존을 줄이기 위해 자체 메타데이터 캐싱 레이어를 도입했다. 브로커가 ZooKeeper에 매번 접근하는 대신, 로컬 캐시에서 메타데이터를 읽고 주기적으로 동기화하는 방식이다. 이는 이후 Apache Kafka 커뮤니티에서 KRaft(KIP-500)로 ZooKeeper를 완전히 제거하는 방향으로 발전하는 데 영향을 준 것으로 알려져 있다.

**모니터링 고도화:**
브로커별, 토픽별, 파티션별 세밀한 메트릭 수집과 이상 탐지 시스템을 구축했다. Hot Partition 감지, Consumer Lag 알림, 브로커 리소스 사용률 추적 등을 자동화하여, 문제가 확대되기 전에 선제적으로 대응할 수 있도록 했다.

### 1.4 주요 교훈

- 대규모 Kafka 클러스터에서는 파티션 배치 전략이 안정성의 핵심이다. 기본 제공되는 라운드 로빈 방식은 수천 브로커 규모에서는 불충분하다
- 리밸런싱을 한 번에 수행하면 연쇄 장애(cascading failure)를 유발할 수 있으므로, 점진적(throttled) 접근이 필수다. 대역폭 제한을 걸더라도 서비스 가용성을 우선해야 한다
- Rack-aware 파티션 배치는 AZ 장애 대비에 반드시 적용해야 한다. 특히 프로덕션 환경에서 `min.insync.replicas`와 조합하여 데이터 내구성을 보장해야 한다
- ZooKeeper는 대규모 클러스터에서 SPOF(단일 장애 지점)가 될 수 있다. KRaft 전환이 가능하다면 적극 검토해야 한다
- 대규모 운영에서는 자체 운영 도구 개발이 불가피하다. 오픈소스 도구만으로는 수천 브로커 규모의 운영 자동화가 어렵다

---

## 2. Uber - Consumer Proxy를 통한 Kafka Consumer 관리

- **출처:** [Introducing Uber's Kafka Consumer Proxy](https://www.uber.com/blog/kafka-consumer-proxy/)
- **저자:** Uber Engineering Team

### 2.1 상황

Uber는 수백 개의 마이크로서비스가 Kafka를 통해 이벤트를 소비하는 대규모 이벤트 기반 아키텍처를 운영한다. 승차 요청, 결제 처리, 배차 최적화, 실시간 위치 추적 등 주요 비즈니스 로직이 Kafka 이벤트에 의존한다. 각 서비스 팀이 자체적으로 Kafka Consumer를 구현하고 운영하면서, Kafka 클라이언트 라이브러리의 직접 사용에 따른 다양한 운영 문제가 누적되었다.

Uber의 Kafka 인프라 규모에서는 수백 개의 Consumer Group이 동시에 활동하며, 하나의 잘못된 Consumer 설정이 클러스터 전체에 파급 효과를 미칠 수 있다. 특히 마이크로서비스 아키텍처에서는 각 서비스 팀의 Kafka 운영 역량이 천차만별이라, 동일한 유형의 설정 오류가 반복적으로 발생하는 패턴이 관찰되었다.

### 2.2 문제

**Consumer Group 리밸런싱 폭풍(Rebalance Storm):**
수백 개 서비스의 Consumer가 독립적으로 동작하면서, 하나의 Consumer Group이 빈번하게 리밸런싱을 발생시키면 Kafka Coordinator 브로커에 부하가 집중된다. 특히 서비스 배포(rolling update) 시 Consumer가 순차적으로 떠나고 재합류하면서 리밸런싱이 연쇄적으로 발생하여, 배포 중 해당 토픽의 메시지 처리가 수 분간 중단되는 상황이 빈번했다.

**반복적인 설정 오류:**
`max.poll.interval.ms` 미설정으로 느린 처리 로직이 세션 타임아웃을 유발하거나, `auto.offset.reset=latest`로 설정하여 서비스 재시작 시 메시지를 유실하는 문제가 반복되었다. `session.timeout.ms`와 `heartbeat.interval.ms`의 부적절한 비율 설정으로 불필요한 리밸런싱이 트리거되는 경우도 빈번했다. 이러한 오류는 각 팀의 Kafka 이해도 차이에서 비롯되었다.

**Consumer Lag 모니터링의 어려움:**
수백 개 서비스의 Consumer Lag을 중앙에서 모니터링하고, 문제 발생 시 원인을 추적하는 것이 매우 어려웠다. Lag이 누적되면 SLA를 위반하는 경우가 빈번했고, 장애 원인을 추적하기 위해 각 서비스 팀에 일일이 확인해야 하는 비효율이 존재했다. 특히 Consumer 내부에서 발생하는 처리 지연(예: 외부 API 호출 타임아웃)과 Kafka 자체의 문제를 구분하기 어려웠다.

**언어/프레임워크 다양성:**
Uber의 마이크로서비스는 Go, Java, Python 등 다양한 언어로 작성되어 있다. 각 언어의 Kafka 클라이언트 라이브러리는 동작 방식과 설정 옵션이 달라, 일관된 Consumer 동작을 보장하기 어려웠다. 라이브러리 버전 관리와 보안 패치 적용도 서비스별로 독립적으로 이루어져야 했다.

### 2.3 해결

**Consumer Proxy 아키텍처:**
Uber는 Consumer Proxy라는 중앙 집중식 Consumer 관리 서비스를 구축했다. 이 프록시가 Kafka 브로커로부터 메시지를 직접 소비한 뒤, gRPC(또는 HTTP)를 통해 각 서비스에 메시지를 전달하는 구조다. 애플리케이션 서비스는 Kafka 클라이언트 라이브러리를 직접 사용하지 않고, Consumer Proxy가 제공하는 gRPC 인터페이스를 통해 메시지를 수신한다.

```
[Kafka Broker] -> [Consumer Proxy] -> gRPC -> [Service A]
                                    -> gRPC -> [Service B]
                                    -> gRPC -> [Service C]
```

**중앙 집중식 설정 관리:**
Consumer 설정(`max.poll.interval.ms`, `session.timeout.ms`, `auto.offset.reset`, `fetch.min.bytes` 등)을 Consumer Proxy 레벨에서 중앙 관리한다. 검증된 설정 템플릿을 제공하여 서비스 팀이 설정 오류를 저지르는 것을 원천적으로 방지한다. 설정 변경 시에도 각 서비스를 재배포할 필요 없이 Consumer Proxy의 설정만 변경하면 된다.

**오프셋 관리 자동화:**
오프셋 커밋을 Consumer Proxy가 관리하며, 서비스가 메시지 처리 완료를 확인(ACK)한 후에만 오프셋을 커밋한다. 이로써 서비스 크래시 시에도 메시지 유실이나 중복 처리를 최소화한다. Dead Letter Queue(DLQ) 통합도 프록시 레벨에서 제공하여, 처리 실패한 메시지를 별도 토픽으로 자동 라우팅한다.

**Consumer Lag 모니터링 일괄 적용:**
Consumer Lag 모니터링과 자동 알림을 프록시 레벨에서 일괄 적용했다. 모든 Consumer Group의 Lag을 중앙에서 추적하고, 임계치 초과 시 자동으로 관련 팀에 알림을 발송한다. Lag의 원인이 Kafka 측인지 서비스 측인지 구분하는 진단 기능도 제공한다.

**리밸런싱 최적화:**
Consumer Proxy는 내부적으로 리밸런싱 전략을 최적화하여, 서비스 배포 시에도 리밸런싱 폭풍이 발생하지 않도록 한다. Static Group Membership(`group.instance.id`)을 활용하여 Consumer 재시작 시 불필요한 리밸런싱을 방지하고, Cooperative Sticky Assignor를 적용하여 리밸런싱 중에도 다른 파티션의 처리가 중단되지 않도록 했다.

### 2.4 주요 교훈

- 대규모 조직에서 각 팀이 직접 Kafka Consumer를 운영하면 설정 품질 편차로 인한 장애가 반복된다. 플랫폼 팀이 Consumer 운영 복잡도를 추상화하는 것이 효과적이다
- Consumer Proxy 패턴은 운영 복잡도를 중앙으로 집중시켜 일관된 품질을 보장한다. 다만 프록시 자체가 SPOF가 되지 않도록 고가용성 설계가 필수다
- `max.poll.interval.ms`, `session.timeout.ms`, `auto.offset.reset` 등 주요 설정의 표준화가 중요하다. 특히 `session.timeout.ms`는 `heartbeat.interval.ms`의 3배 이상으로 설정하는 것이 권장된다
- Static Group Membership과 Cooperative Sticky Assignor는 리밸런싱 영향을 줄이는 주요 기법이다. Kafka 2.3+ 환경에서는 적극 활용해야 한다
- Consumer Proxy 패턴의 단점으로는 추가적인 네트워크 홉으로 인한 지연 증가, 프록시 자체의 운영 복잡도, 그리고 Kafka의 Consumer Group 시맨틱스를 완전히 활용하지 못하는 제약이 있다

---

## 3. Confluent - Exactly-Once Semantics의 현실

- **출처:** [Exactly-Once Semantics Are Possible: Here's How Kafka Does It](https://www.confluent.io/blog/exactly-once-semantics-are-possible-heres-how-apache-kafka-does-it/)
- **저자:** Neha Narkhede (Confluent 공동 창업자, Apache Kafka 공동 창시자)

### 3.1 상황

분산 시스템에서 메시지 전달 보장(delivery guarantee)은 세 가지 수준으로 나뉜다: At-Most-Once(최대 한 번), At-Least-Once(최소 한 번), Exactly-Once(정확히 한 번). 이 중 Exactly-Once Semantics(EOS)는 분산 시스템 이론에서 오랫동안 불가능하거나 비현실적인 성능 비용이 수반된다고 여겨져 왔다.

Kafka가 EOS를 지원하기 전(0.11 이전), 사용자들은 대부분 At-Least-Once 방식으로 운영했다. 이 방식에서는 메시지가 최소 한 번은 전달되지만, 중복 전달이 발생할 수 있다. 결제, 정산, 재고 관리 등 중복이 치명적인 도메인에서는 애플리케이션 레벨에서 별도의 멱등성(idempotency) 로직과 중복 제거(deduplication) 테이블을 유지해야 했다. 이것이 시스템 복잡도를 크게 높이고, 모든 개발자가 올바르게 구현해야 하는 부담을 안겼다.

이 글에서 Neha Narkhede는 Kafka가 어떻게 EOS를 현실적인 성능 비용으로 달성했는지를 설명한다. 이 기능은 KIP-98(Exactly Once Delivery and Transactional Messaging)으로 제안되어 Kafka 0.11에 포함되었다.

### 3.2 문제

**Producer 측 중복 (Duplicate Writes):**
Producer가 메시지를 브로커에 전송한 후, 네트워크 타임아웃이나 일시적 장애로 ACK를 받지 못하면 메시지를 재전송한다. 이때 브로커에는 이미 메시지가 저장되어 있으므로 동일 메시지가 중복 저장된다. `acks=all`, `retries=MAX_INT` 설정으로 내구성을 높일수록 이 중복 문제는 더 빈번하게 발생한다. 이는 At-Least-Once의 본질적인 한계다.

**Consumer 측 중복 (Duplicate Reads):**
Consumer가 메시지를 처리한 뒤 오프셋 커밋 전에 크래시하면, 재시작 후 마지막으로 커밋된 오프셋부터 다시 읽기 때문에 동일 메시지를 재처리하게 된다. 이 문제를 해결하기 위해 애플리케이션에서 처리 완료된 메시지 ID를 외부 저장소에 기록하고, 중복 여부를 체크하는 로직을 구현해야 했다.

**Read-Process-Write 패턴의 원자성 부재:**
가장 복잡한 문제는 Kafka Streams나 stream processing에서 나타나는 read-process-write 패턴이다. 토픽 A에서 메시지를 읽고, 처리한 결과를 토픽 B에 쓰고, 오프셋을 커밋하는 세 가지 작업이 원자적으로 수행되어야 한다. 이 중간 단계에서 실패가 발생하면, 결과는 토픽 B에 기록되었지만 오프셋은 커밋되지 않아 재처리 시 중복 결과가 다운스트림에 전파되는 문제가 발생한다. 또는 반대로 오프셋은 커밋되었지만 결과가 기록되지 않아 메시지가 유실되는 상황도 가능하다.

**기존 해결 방식의 한계:**
애플리케이션 레벨 멱등성을 구현하려면 모든 메시지에 고유 ID를 부여하고, 처리 이력을 별도 데이터베이스에 저장하며, 매 처리 시 중복 체크 쿼리를 수행해야 한다. 이는 성능 오버헤드와 코드 복잡도를 증가시키며, 올바르게 구현하지 않으면 미묘한 버그를 유발한다. Two-Phase Commit 같은 분산 트랜잭션 프로토콜은 성능 비용이 너무 크고 가용성을 저하시킨다.

### 3.3 해결

Kafka 0.11(2017년)부터 도입된 EOS는 세 가지 주요 메커니즘의 조합으로 구현된다.

**Idempotent Producer (멱등성 프로듀서):**
`enable.idempotence=true` 설정으로 활성화한다. 각 Producer에 고유한 Producer ID(PID)가 할당되고, 각 파티션으로의 메시지에 순차적인 Sequence Number가 부여된다. 브로커는 `<PID, Partition, Sequence Number>` 조합을 추적하여, 이미 받은 Sequence Number와 동일하거나 더 낮은 번호의 메시지가 도착하면 중복으로 판단하여 무시한다. 이 메커니즘은 단일 Producer 세션 내에서 단일 파티션에 대한 중복을 제거한다.

구현 세부 사항으로, 브로커는 각 파티션별로 최근 5개의 produce request에 대한 Sequence Number를 메모리에 유지한다(`max.in.flight.requests.per.connection` 기본값 5에 대응). 이를 통해 in-flight 요청의 재시도 시에도 중복을 정확히 감지한다.

**Transactional API (트랜잭션 API):**
여러 파티션에 대한 쓰기와 오프셋 커밋을 하나의 원자적 트랜잭션으로 묶는다. `transactional.id`를 설정하면 Producer는 Transaction Coordinator(특정 브로커)와 통신하여 트랜잭션을 시작, 커밋, 또는 중단한다.

트랜잭션 흐름은 다음과 같다:

1. `initTransactions()` - Producer 초기화 시 Transaction Coordinator에 등록
2. `beginTransaction()` - 트랜잭션 시작
3. `send()` - 메시지 전송 (여러 파티션에 대해 가능)
4. `sendOffsetsToTransaction()` - Consumer 오프셋을 트랜잭션에 포함
5. `commitTransaction()` 또는 `abortTransaction()` - 원자적 커밋 또는 롤백

Transaction Coordinator는 `__transaction_state`라는 내부 토픽에 트랜잭션 상태를 기록하며, Two-Phase Commit과 유사하지만 Kafka 내부에서만 동작하므로 외부 분산 트랜잭션보다 훨씬 효율적이다.

**Consumer `read_committed` 격리 수준:**
`isolation.level=read_committed` 설정을 통해 Consumer가 커밋된 트랜잭션의 메시지만 읽도록 보장한다. 아직 커밋되지 않은 트랜잭션의 메시지나, 중단(abort)된 트랜잭션의 메시지는 Consumer에 노출되지 않는다. 기본값인 `read_uncommitted`에서는 트랜잭션 상태와 무관하게 모든 메시지를 읽는다.

**Kafka Streams에서의 통합:**
Kafka Streams는 `processing.guarantee=exactly_once_v2`(Kafka 2.5+) 설정만으로 EOS를 활성화할 수 있다. 내부적으로 Idempotent Producer, Transactional API, read_committed Consumer를 자동으로 구성하여, 개발자가 직접 트랜잭션 코드를 작성하지 않아도 된다. `exactly_once_v2`는 이전 버전(`exactly_once`)의 성능 제한을 개선한 것으로, Consumer Group 전체에 하나의 Producer를 사용하는 대신 각 태스크별 Producer를 공유하여 리소스 사용을 최적화했다.

### 3.4 주요 교훈

- EOS는 Idempotent Producer + Transactional API + Consumer `read_committed` 세 가지 요소의 조합이다. 이 중 하나라도 빠지면 end-to-end EOS가 보장되지 않는다
- EOS를 활성화하면 처리량이 감소할 수 있으므로(트랜잭션 커밋 오버헤드, LSO 기반 읽기 지연 등), 비즈니스 요구사항에 따라 적용 여부를 판단해야 한다
- `enable.idempotence=true`만으로도 Producer 측 중복은 해결되므로, 전체 트랜잭션이 필요 없는 경우 이것만 적용하는 것도 유효한 전략이다. Kafka 3.0부터는 `enable.idempotence`가 기본값으로 활성화된다
- EOS는 Kafka 내부(Kafka-to-Kafka) 처리에만 보장된다. Kafka에서 읽어서 외부 시스템(DB, API 등)에 쓰는 경우에는 외부 시스템과의 트랜잭션이 별도로 필요하다. 이 경우 Outbox 패턴이나 Change Data Capture(CDC)를 결합하는 방식을 고려해야 한다
- `transactional.id`는 Producer 인스턴스를 고유하게 식별해야 한다. 동일한 `transactional.id`를 가진 Producer가 동시에 활동하면 이전 Producer가 좀비 펜싱(zombie fencing)으로 차단된다. 이는 의도된 동작이지만, 잘못 구성하면 정상 Producer가 차단될 수 있다

---

## 4. Netflix - Keystone Pipeline에서의 Kafka 운영

- **출처:** [Kafka Inside Keystone Pipeline](https://netflixtechblog.com/kafka-inside-keystone-pipeline-dd5aeabaf6bb)
- **저자:** Netflix Data Engineering Team

### 4.1 상황

Netflix는 Keystone이라는 대규모 실시간 데이터 파이프라인을 운영한다. 이 파이프라인은 Netflix의 모든 마이크로서비스에서 발생하는 이벤트를 수집, 라우팅, 처리하는 중앙 데이터 인프라다. 사용자 시청 기록, 재생 품질 지표, A/B 테스트 결과, 서비스 로그, 에러 리포트, UI 상호작용 이벤트 등 다양한 종류의 데이터가 이 파이프라인을 통해 흐른다.

Keystone Pipeline의 규모는 하루 수천억 건 이상의 이벤트를 처리한다. 피크 타임(주말 저녁 등)에는 초당 수백만 건의 이벤트가 유입된다. 이 데이터는 실시간 분석, 배치 처리, ML 모델 학습, 대시보드 시각화 등 다양한 용도로 소비된다.

Keystone Pipeline의 아키텍처는 크게 세 단계로 구성된다: (1) 프로듀서 측의 이벤트 수집(fronting Kafka 클러스터), (2) 라우팅 및 필터링(router 서비스), (3) 컨슈머 측의 데이터 싱크(consumer Kafka 클러스터에서 S3, Elasticsearch, 기타 저장소로). 이 구조에서 Kafka는 각 단계 사이의 버퍼이자 메시지 버스 역할을 한다.

### 4.2 문제

**브로커 핫스팟과 부하 불균형:**
초당 수백만 건의 이벤트가 유입되면서 특정 토픽에 트래픽이 집중되었다. 인기 콘텐츠 출시 시 시청 이벤트가 폭증하거나, 특정 A/B 테스트가 대규모 사용자 그룹에 적용될 때 해당 이벤트 토픽의 부하가 급증했다. 파티션 키가 불균형하면 특정 파티션에 데이터가 몰리면서 해당 브로커가 핫스팟이 되었다.

**느린 Consumer에 의한 파이프라인 백프레셔:**
다운스트림 소비자 중 하나가 처리 속도가 느려지면(예: S3 쓰기 지연, Elasticsearch 인덱싱 지연) Consumer Lag이 누적된다. Lag이 토픽의 retention 기간을 초과하면 데이터 유실이 발생한다. 특히 배치 처리 Consumer가 재처리(backfill) 작업으로 대량의 과거 데이터를 읽으면, 실시간 Consumer와 I/O를 경쟁하면서 실시간 처리 성능이 저하되는 문제가 있었다.

**스키마 변경 시 하위 호환성 파괴:**
이벤트 스키마가 변경될 때 하위 호환성이 깨지면, 해당 토픽을 소비하는 모든 Consumer가 동시에 역직렬화(deserialization) 오류를 겪는다. 수십 개 팀이 동일한 이벤트를 소비하고 있으므로, 하나의 스키마 변경이 광범위한 장애를 유발할 수 있다.

**멀티 클러스터 간 데이터 복제:**
Netflix는 여러 AWS 리전에 걸쳐 서비스를 운영하므로, 리전 간 Kafka 데이터 복제가 필요하다. cross-region 복제의 지연 시간, 대역폭 비용, 장애 시 failover 전략 등이 복잡한 운영 과제였다.

### 4.3 해결

**동적 파티션 조정과 트래픽 기반 클러스터 관리:**
Netflix는 토픽별 트래픽 패턴을 분석하여 파티션 수를 동적으로 조정하는 자동화 도구를 구축했다. 트래픽이 급증하는 토픽의 파티션을 사전에 확장하고, 트래픽이 줄어드는 토픽은 별도 관리한다. 또한 고트래픽 토픽과 저트래픽 토픽을 물리적으로 다른 클러스터에 분리하여, 하나의 고트래픽 토픽이 다른 토픽에 영향을 미치는 것을 방지했다(noisy neighbor 문제 해결).

**Consumer 우선순위와 리소스 격리:**
Consumer 우선순위 개념을 도입하여 주요 소비자(실시간 대시보드, 알림 시스템 등)의 처리가 우선적으로 보장되도록 리소스를 격리했다. 티어 기반(tier-based) 접근으로, Tier-1(실시간 주요)과 Tier-2(배치, 분석) Consumer를 별도 클러스터 또는 별도 Consumer Group으로 분리한다.

**Avro 스키마 레지스트리와 호환성 강제:**
Confluent Schema Registry를 도입하여 모든 이벤트의 스키마를 중앙에서 관리한다. 스키마 호환성 규칙을 강제하여, 하위 호환성(backward compatibility)이 깨지는 변경은 배포 파이프라인에서 자동으로 차단한다. 허용되는 스키마 변경은 필드 추가(기본값 포함), 선택적 필드 제거 등이며, 필수 필드 변경이나 타입 변경은 차단된다. CI/CD 파이프라인에 스키마 호환성 체크를 통합하여, Producer 코드 변경 시 스키마 호환성이 자동으로 검증된다.

**멀티 클러스터 아키텍처로 장애 도메인 분리:**
Fronting Kafka(이벤트 수집), Routing(라우팅/필터링), Consumer Kafka(데이터 싱크) 클러스터를 물리적으로 분리하여 장애 도메인을 격리한다. 한 단계의 클러스터에 장애가 발생해도 다른 단계에 영향을 미치지 않도록 설계했다. 리전 간 복제는 MirrorMaker(또는 자체 복제 도구)를 사용하며, active-active 구성으로 리전 장애 시 자동 failover를 지원한다.

**자체 모니터링 및 자동 복구 시스템:**
Kafka 클러스터의 상태를 실시간으로 모니터링하고, 이상 징후 감지 시 자동으로 복구 조치를 수행하는 시스템을 구축했다. 브로커의 under-replicated partition 감지, Consumer Lag 급증 감지, 디스크 사용량 임계치 알림 등을 자동화했다. 문제가 감지되면 자동으로 트래픽 재라우팅, 파티션 재배치, 또는 브로커 교체를 수행한다.

### 4.4 주요 교훈

- 대규모 파이프라인에서는 Consumer별 격리(isolation)가 필수이며, 하나의 느린 Consumer가 전체 파이프라인을 위협할 수 있다. 티어 기반 격리와 물리적 클러스터 분리가 효과적이다
- 스키마 레지스트리를 통한 하위 호환성 강제는 운영 안정성의 핵심이다. CI/CD 파이프라인에 스키마 호환성 체크를 통합하여 배포 시점에 차단해야 한다
- 멀티 클러스터 아키텍처로 장애 도메인을 분리하면 blast radius를 줄일 수 있다. Fronting, Routing, Consumer 클러스터를 물리적으로 분리하는 것이 권장된다
- Noisy Neighbor 문제는 Kafka에서도 발생한다. 고트래픽 토픽과 저트래픽 토픽을 동일 클러스터에서 운영하면, 고트래픽 토픽의 부하가 다른 토픽의 성능에 영향을 미칠 수 있다
- 자동 복구(self-healing) 시스템은 대규모 운영에서 필수다. 수백 개의 브로커를 수동으로 모니터링하고 대응하는 것은 현실적으로 불가능하다

---

## 5. KEDA를 활용한 Kafka Consumer 자동 스케일링

- **출처:** [Scaling the Next Frontier](https://keda.sh/blog/2023-08-22-keda-cncf-graduation/)
- **저자:** KEDA Community / Tom Kerkhove (Microsoft)

### 5.1 상황

Kubernetes 환경에서 Kafka Consumer를 운영할 때 스케일링은 주요 과제다. 전통적인 배포 방식에서는 고정된 replica 수로 Deployment를 배포하는데, 이는 트래픽 변동에 대응하지 못한다. 피크 시간대에는 Consumer Lag이 쌓이면서 처리 지연이 발생하고, 한산한 시간대(새벽 등)에는 불필요한 리소스가 할당되어 비용이 낭비된다.

Kubernetes의 기본 HPA(Horizontal Pod Autoscaler)는 CPU 사용률이나 Memory 사용률 같은 리소스 메트릭을 기반으로 스케일링한다. 그러나 Kafka Consumer의 실제 부하는 CPU/Memory 사용률과 직접적인 상관관계가 없다. Consumer가 메시지를 빠르게 처리하더라도 유입 속도가 더 빠르면 Lag이 쌓이고, 반대로 CPU를 많이 사용하더라도 Lag이 없다면 스케일링이 불필요하다. 즉, Kafka Consumer의 올바른 스케일링 지표는 CPU/Memory가 아니라 Consumer Lag이다.

KEDA(Kubernetes Event-Driven Autoscaling)는 이 문제를 해결하기 위해 등장한 CNCF Graduated 프로젝트다. KEDA는 외부 이벤트 소스(Kafka, RabbitMQ, AWS SQS, Azure Service Bus 등)의 메트릭을 기반으로 Kubernetes 워크로드를 스케일링한다. 특히 Kafka의 경우, Consumer Group의 Lag을 직접 조회하여 이를 HPA의 외부 메트릭으로 제공하는 방식으로 동작한다.

### 5.2 문제

**CPU/Memory 기반 HPA의 부적합성:**
Kafka Consumer는 I/O 바운드 워크로드인 경우가 많아, CPU 사용률이 낮지만 Consumer Lag은 계속 증가하는 상황이 흔하다. 예를 들어 외부 API를 호출하거나 DB에 쓰기를 수행하는 Consumer는 대부분의 시간을 I/O 대기에 소비하므로 CPU 사용률이 10~20% 수준에 머문다. 이런 상황에서 CPU 기반 HPA는 스케일 아웃을 트리거하지 않으며, 결과적으로 Consumer Lag이 분 단위, 시간 단위로 누적된다.

**피크 트래픽 대응 불가:**
이벤트 드리븐 아키텍처에서 메시지 유입량은 급격하게 변동한다. 피크 시간대에 메시지 유입량이 평소의 10배 이상 증가하는 워크로드에서, 고정 replica로 운영하면 Lag이 급속도로 누적된다. 수동으로 replica를 늘리는 것은 대응 속도가 느리고, 자동화되지 않으면 야간이나 주말에 발생하는 트래픽 급증에 대응할 수 없다.

**과잉 프로비저닝에 의한 비용 낭비:**
피크 트래픽에 대비하여 항상 최대 replica를 유지하면 한산한 시간대에 리소스가 크게 낭비된다. 특히 클라우드 환경에서 불필요한 Pod는 직접적인 비용 증가로 이어진다. 그러나 너무 적게 유지하면 피크 시 처리 지연이 발생하므로, 동적 스케일링이 필수적이다.

**파티션 수와 Consumer 수의 관계:**
Kafka에서 하나의 파티션은 동일 Consumer Group 내에서 하나의 Consumer에만 할당된다. 따라서 파티션 수보다 많은 Consumer를 띄우면 유휴 Consumer가 발생하여 리소스가 낭비된다. 또한 Consumer 수가 변경될 때마다 Consumer Group 리밸런싱이 발생하여 일시적으로 처리가 중단되므로, 빈번한 스케일링은 오히려 역효과를 낼 수 있다.

### 5.3 해결

**KEDA Kafka Scaler 아키텍처:**
KEDA는 크게 세 가지 컴포넌트로 구성된다:

- **Operator**: ScaledObject/ScaledJob CRD를 감시하고, HPA를 자동 생성/관리한다
- **Metrics Adapter**: 외부 이벤트 소스에서 메트릭을 수집하여 Kubernetes Metrics API를 통해 HPA에 제공한다
- **Scaler**: 각 이벤트 소스별 메트릭 수집 로직을 구현한 플러그인이다. Kafka Scaler는 Kafka 브로커에 직접 연결하여 Consumer Group의 Lag을 조회한다

KEDA Kafka Scaler의 동작 흐름은 다음과 같다:

1. KEDA가 주기적으로(`pollingInterval`, 기본 30초) Kafka 브로커에서 Consumer Group의 Lag을 조회
2. 전체 Lag을 `lagThreshold`(파티션당 허용 Lag)로 나누어 필요한 replica 수를 계산
3. 계산된 replica 수를 HPA의 외부 메트릭(external metric)으로 제공
4. HPA가 이 메트릭을 기반으로 Deployment의 replica를 조정

**ScaledObject 구성:**

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: kafka-consumer-scaler
spec:
  scaleTargetRef:
    name: kafka-consumer
  pollingInterval: 15          # 메트릭 수집 주기 (초)
  cooldownPeriod: 300          # 스케일 다운 대기 시간 (초)
  minReplicaCount: 1           # 최소 replica 수
  maxReplicaCount: 10          # 최대 replica 수 (파티션 수 이하)
  triggers:
  - type: kafka
    metadata:
      bootstrapServers: kafka-broker:9092
      consumerGroup: my-consumer-group
      topic: my-topic
      lagThreshold: "100"      # 파티션당 허용 Lag
      offsetResetPolicy: latest
```

주요 설정 파라미터:

- `pollingInterval`: Lag 조회 주기. 너무 짧으면 Kafka 브로커에 부하를 줄 수 있고, 너무 길면 대응이 느려진다. 15~30초가 일반적이다
- `cooldownPeriod`: 마지막 스케일 이벤트 후 스케일 다운까지 대기하는 시간. 너무 짧으면 Lag이 잠시 줄었다가 다시 증가할 때 불필요한 스케일 다운/업이 반복된다. 리밸런싱 비용을 고려하여 300초 이상을 권장한다
- `lagThreshold`: 파티션당 허용 Lag. KEDA는 `총 Lag / lagThreshold`로 필요 replica 수를 계산한다. 비즈니스 SLA에 맞게 조정해야 한다
- `maxReplicaCount`: 반드시 해당 토픽의 파티션 수 이하로 설정해야 한다

**Zero-to-One 스케일링:**
KEDA는 Lag이 0일 때 Consumer를 0개로 스케일 다운할 수 있다(`minReplicaCount: 0`). 메시지가 도착하면 0에서 1로 스케일 업하여 처리를 시작한다. 이는 비용 최적화에 매우 효과적이지만, 0에서 1로 스케일 업하는 데 시간이 걸리므로(Pod 스케줄링, 컨테이너 시작, Consumer Group 합류 등) 지연에 민감한 워크로드에는 부적합할 수 있다. `idleReplicaCount`를 1로 설정하면 완전히 0으로 내려가지 않으면서도 리소스를 절약할 수 있다.

**ScaledJob을 활용한 배치 처리:**
지속적인 Consumer 대신 배치 방식으로 메시지를 처리해야 하는 경우, KEDA의 ScaledJob을 활용할 수 있다. ScaledJob은 Lag이 감지되면 Kubernetes Job을 생성하여 메시지를 처리하고, 처리 완료 후 Job이 자동 종료된다. 이는 이벤트 기반 배치 처리에 적합하며, Consumer Group 리밸런싱 없이 독립적으로 동작한다.

### 5.4 주요 교훈

- Kafka Consumer의 스케일링 지표는 CPU/Memory가 아닌 Consumer Lag이어야 한다. KEDA Kafka Scaler는 이 요구사항을 정확히 충족한다
- `maxReplicaCount`는 반드시 해당 토픽의 파티션 수 이하로 설정해야 한다. 파티션 수보다 Consumer가 많으면 유휴 Consumer가 발생하여 리소스 낭비와 불필요한 리밸런싱이 발생한다
- `cooldownPeriod`를 적절히 설정하여 스케일 다운 시 리밸런싱 폭풍을 방지해야 한다. 스케일 다운은 스케일 업보다 보수적으로 설정하는 것이 안전하다
- Consumer Group 리밸런싱 중에는 일시적으로 처리가 중단되므로, `partition.assignment.strategy`를 `CooperativeStickyAssignor`로 설정하면 리밸런싱 영향을 최소화할 수 있다
- Zero-to-One 스케일링은 비용 최적화에 효과적이지만, 지연에 민감한 워크로드에서는 최소 1개의 replica를 유지하는 것이 안전하다
- KEDA는 Kafka뿐 아니라 다양한 이벤트 소스에 대한 통합 스케일링 솔루션이다. 이벤트 기반 아키텍처에서 스케일링 전략을 통일하고자 할 때 유용하다

---

## 주요 키워드 정리

| 주제 | 주요 키워드 |
|------|------------|
| Consumer Lag | `max.poll.interval.ms`, `session.timeout.ms`, Consumer Proxy 패턴, 모니터링, Static Group Membership |
| 파티션 전략 | Rack-aware 배치, Hot Partition, 점진적 리밸런싱, 파티션 수 결정 기준, Noisy Neighbor |
| Exactly-Once | Idempotent Producer, Transactional API, `read_committed`, Sequence Number, Zombie Fencing |
| 스키마 관리 | Avro, Schema Registry, 하위 호환성(Backward Compatibility), CI/CD 통합 검증 |
| 자동 스케일링 | KEDA, Consumer Lag 기반 HPA, `maxReplicaCount` <= 파티션 수, `cooldownPeriod`, ScaledObject/ScaledJob |
| 대규모 운영 | 멀티 클러스터, Consumer 격리, ZooKeeper 부하 관리, KRaft 전환, 티어 기반 격리, Self-healing |

---

## 참고 공식 문서

- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [Confluent Developer Documentation](https://docs.confluent.io/)
- [KEDA Kafka Scaler](https://keda.sh/docs/latest/scalers/apache-kafka/)
- [Kafka KRaft - ZooKeeper 제거](https://kafka.apache.org/documentation/#kraft)
- [KIP-98: Exactly Once Delivery and Transactional Messaging](https://cwiki.apache.org/confluence/display/KAFKA/KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging)
- [KEDA Documentation](https://keda.sh/docs/)
