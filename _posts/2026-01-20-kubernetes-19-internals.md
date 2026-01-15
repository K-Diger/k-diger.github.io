---
title: "Part 19: Kubernetes Internals - 내부 동작 원리"
date: 2026-01-20
categories: [ Container, Kubernetes ]
tags: [ Container, Kubernetes, Architecture, DeepDive ]
layout: post
toc: true
math: true
mermaid: true
---

# Part 19: Kubernetes Internals - 내부 동작 원리

## Control Loop Pattern (제어 루프 패턴)

### Reconciliation Loop의 핵심 개념

Kubernetes의 모든 Controller는 **Reconciliation Loop**를 통해 동작한다. 이는 Kubernetes의 가장 핵심적인 디자인 패턴이다.

**동작 원리:**

```
1. Watch: API Server를 통해 리소스 상태 변경 감시
2. Compare: 현재 상태(Current State)와 원하는 상태(Desired State) 비교
3. Act: 차이가 있으면 현재 상태를 원하는 상태로 수렴시키는 액션 수행
4. Repeat: 무한 반복
```

### 실제 예시: ReplicaSet Controller

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: nginx-rs
spec:
  replicas: 3  # 원하는 상태: 3개의 Pod
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.21
```

**Reconciliation Loop 동작:**

```
상황 1: Pod이 하나 삭제됨
  원하는 상태: replicas=3
  현재 상태: 2개 Pod 실행 중
  액션: 1개 Pod 생성

상황 2: 수동으로 Pod 4개 생성
  원하는 상태: replicas=3
  현재 상태: 7개 Pod 실행 중 (원래 3개 + 수동 4개)
  액션: 4개 Pod 삭제

상황 3: Node 장애로 2개 Pod 손실
  원하는 상태: replicas=3
  현재 상태: 1개 Pod 실행 중
  액션: 2개 Pod 생성 (다른 정상 노드에)
```

### Controller의 종류와 역할

**Deployment Controller:**

- ReplicaSet을 관리한다
- Rolling Update와 Rollback을 제어한다
- 배포 전략을 실행한다

**Node Controller:**

- 노드 상태를 모니터링한다
- 5분간 응답 없는 노드를 Not Ready로 표시한다
- 해당 노드의 Pod를 다른 노드로 재배치한다

**Endpoint Controller:**

- Service와 Pod를 연결한다
- Pod의 IP 주소 변경을 감지하여 Endpoint를 자동 업데이트한다

**참고 자료:**

- [Kubernetes Controllers 공식 문서](https://kubernetes.io/docs/concepts/architecture/controller/)
- [Kubernetes Design Principles](https://kubernetes.io/docs/concepts/architecture/#kubernetes-control-plane)

---

## etcd Raft 합의 알고리즘

### Raft 알고리즘이란?

Raft는 분산 시스템에서 **합의(Consensus)**를 달성하기 위한 알고리즘이다. etcd는 Raft를 사용하여 클러스터의 모든 데이터 일관성을 보장한다.

### Raft의 핵심 개념

**Leader 선출 (Leader Election):**

```
1. 클러스터 시작 시 모든 노드는 Follower 상태
2. 일정 시간 동안 Leader로부터 heartbeat를 받지 못하면 Candidate로 전환
3. Candidate는 다른 노드들에게 투표 요청 (RequestVote RPC)
4. 과반수(Quorum) 득표 시 Leader로 선출
5. Leader는 주기적으로 heartbeat를 전송하여 자신의 상태를 알림
```

**상태 전이:**

```
[Follower] → (타임아웃) → [Candidate] → (과반수 득표) → [Leader]
     ↑                            ↓ (득표 실패)
     └────────────────────────────┘
```

**Log 복제 (Log Replication):**

```
Client → Leader: Write 요청
Leader → Followers: AppendEntries RPC (로그 전파)
Followers → Leader: ACK
Leader: 과반수 ACK 확인 후 Commit
Leader → Followers: Commit 알림
Followers: 로그 적용
Leader → Client: 성공 응답
```

### etcd 클러스터 크기 선택

**홀수 개 권장 이유:**

```
3노드 클러스터:
  Quorum: 2 (3/2 + 1)
  장애 허용: 1개 노드
  장애 시나리오: 2개 노드만 있어도 동작

4노드 클러스터:
  Quorum: 3 (4/2 + 1)
  장애 허용: 1개 노드
  장애 시나리오: 3개 노드 필요
  결론: 3노드와 같은 장애 허용성, 비용만 증가

5노드 클러스터:
  Quorum: 3 (5/2 + 1)
  장애 허용: 2개 노드
  장애 시나리오: 3개 노드만 있어도 동작
```

**권장 구성:**

- **소규모 클러스터**: 3개 etcd 노드 (1개 장애 허용)
- **프로덕션**: 5개 etcd 노드 (2개 장애 허용)
- **대규모 엔터프라이즈**: 7개 etcd 노드 (3개 장애 허용)

**7개 이상은 비권장:**

- 네트워크 지연 증가
- 합의 도달 시간 증가
- 성능 저하

### 장애 복구 시나리오

**Leader 장애:**

```
1. Followers가 heartbeat 타임아웃 감지 (150-300ms)
2. 한 Follower가 Candidate로 전환하여 투표 시작
3. 과반수 득표로 새 Leader 선출
4. 새 Leader가 클러스터 운영 재개
5. 전체 과정 소요 시간: 약 1-2초
```

**네트워크 분할 (Split Brain 방지):**

```
상황: 5노드 클러스터가 3-2로 분할

파티션 1 (3노드):
  Quorum 충족 (3 >= 3)
  → 정상 동작 가능
  → Leader 선출 가능

파티션 2 (2노드):
  Quorum 미충족 (2 < 3)
  → 읽기 전용 모드
  → Leader 선출 불가

결과: 데이터 일관성 보장 (Split Brain 방지)
```

**참고 자료:**

- [etcd 공식 문서](https://etcd.io/docs/latest/)
- [Raft 알고리즘 설명](https://raft.github.io/)
- [Raft Visualization](http://thesecretlivesofdata.com/raft/)

---

## Scheduler Pod 배치 알고리즘

### Scheduling 프로세스

Kubernetes Scheduler는 **2단계 알고리즘**을 사용한다:

1. **Filtering (Predicates)**: 조건에 맞지 않는 노드 제외
2. **Scoring (Priorities)**: 남은 노드들의 점수를 계산하여 최적 노드 선택

### Filtering 단계

**리소스 요구사항 체크:**

```go
// PodFitsResources predicate
func PodFitsResources(pod, node) bool {
    nodeAvailableCPU := node.Capacity.CPU - node.Allocated.CPU
    nodeAvailableMemory := node.Capacity.Memory - node.Allocated.Memory

    podRequestedCPU := sum(pod.Containers[].Resources.Requests.CPU)
    podRequestedMemory := sum(pod.Containers[].Resources.Requests.Memory)

    return nodeAvailableCPU >= podRequestedCPU &&
           nodeAvailableMemory >= podRequestedMemory
}
```

**Node Selector 체크:**

```yaml
# Pod 정의
spec:
  nodeSelector:
    disktype: ssd
    zone: us-west-1

# Scheduler는 disktype=ssd AND zone=us-west-1 라벨을 가진 노드만 선택
```

**Taints and Tolerations 체크:**

```yaml
# Node에 Taint 설정
kubectl taint nodes node1 key=value:NoSchedule

# Pod이 이 노드에 스케줄되려면 Toleration 필요
spec:
  tolerations:
  - key: "key"
    operator: "Equal"
    value: "value"
    effect: "NoSchedule"
```

**Pod Affinity/Anti-Affinity:**

```yaml
# 같은 zone의 노드에만 배치
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
      - matchExpressions:
        - key: failure-domain.beta.kubernetes.io/zone
          operator: In
          values:
          - us-west-1a
          - us-west-1b
```

### Scoring 단계

**점수 계산 알고리즘:**

Scheduler는 여러 플러그인을 사용하여 각 노드의 점수를 계산한다.

**1. LeastAllocated (리소스 균등 분산):**

```
Score = ((nodeCapacity - nodeAllocated - podRequest) / nodeCapacity) * 10

예시:
Node1: CPU 16 cores, 사용 중 8 cores, Pod 요청 2 cores
  Score = ((16 - 8 - 2) / 16) * 10 = 3.75

Node2: CPU 16 cores, 사용 중 4 cores, Pod 요청 2 cores
  Score = ((16 - 4 - 2) / 16) * 10 = 6.25

→ Node2가 더 높은 점수 (더 많은 여유 리소스)
```

**2. BalancedResourceAllocation (CPU/Memory 균형):**

```
CPU 사용률과 Memory 사용률의 차이가 작을수록 높은 점수

Node1: CPU 50% 사용, Memory 70% 사용
  차이 = |50 - 70| = 20

Node2: CPU 55% 사용, Memory 50% 사용
  차이 = |55 - 50| = 5

→ Node2가 더 높은 점수 (더 균형잡힌 리소스 사용)
```

**3. NodeAffinity (선호도):**

```yaml
affinity:
  nodeAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 1
      preference:
        matchExpressions:
        - key: disktype
          operator: In
          values:
          - ssd

# disktype=ssd 노드에 가중치 1 추가
```

**4. ImageLocality (이미지 존재 여부):**

```
이미지가 이미 노드에 있으면 다운로드 시간 절약
→ 이미지가 있는 노드에 더 높은 점수
```

**최종 점수 계산:**

```
최종 점수 = Σ (플러그인 점수 × 가중치)

예시:
Node1:
  LeastAllocated: 3.75 × weight(1) = 3.75
  BalancedResource: 8 × weight(1) = 8
  NodeAffinity: 0 × weight(1) = 0
  ImageLocality: 5 × weight(1) = 5
  총점: 16.75

Node2:
  LeastAllocated: 6.25 × weight(1) = 6.25
  BalancedResource: 9 × weight(1) = 9
  NodeAffinity: 10 × weight(1) = 10
  ImageLocality: 0 × weight(1) = 0
  총점: 25.25

→ Node2 선택
```

**참고 자료:**

- [Scheduler 공식 문서](https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/)
- [Scheduler Configuration](https://kubernetes.io/docs/reference/scheduling/config/)

---

## kube-proxy와 Service 메커니즘

### kube-proxy의 역할

kube-proxy는 각 노드에서 실행되며, **Service 추상화를 실제 네트워크 규칙으로 구현**한다.

### iptables 모드 (기본값)

**동작 원리:**

```
1. kube-proxy가 API Server를 Watch하여 Service/Endpoint 변경 감지
2. iptables 규칙을 동적으로 생성/수정
3. 클라이언트 요청이 들어오면 iptables 규칙에 따라 Pod로 라우팅
```

**실제 iptables 규칙 예시:**

```bash
# Service: myapp (ClusterIP: 10.96.1.100:80)
# Endpoints: 10.244.1.5:8080, 10.244.2.6:8080, 10.244.3.7:8080

# KUBE-SERVICES 체인
-A KUBE-SERVICES -d 10.96.1.100/32 -p tcp -m tcp --dport 80 -j KUBE-SVC-MYAPP

# KUBE-SVC-MYAPP 체인 (로드 밸런싱)
-A KUBE-SVC-MYAPP -m statistic --mode random --probability 0.33 -j KUBE-SEP-1
-A KUBE-SVC-MYAPP -m statistic --mode random --probability 0.50 -j KUBE-SEP-2
-A KUBE-SVC-MYAPP -j KUBE-SEP-3

# KUBE-SEP-* 체인 (실제 Pod로 DNAT)
-A KUBE-SEP-1 -p tcp -j DNAT --to-destination 10.244.1.5:8080
-A KUBE-SEP-2 -p tcp -j DNAT --to-destination 10.244.2.6:8080
-A KUBE-SEP-3 -p tcp -j DNAT --to-destination 10.244.3.7:8080
```

**패킷 흐름:**

```
Client (10.244.0.5) → Service (10.96.1.100:80)
  ↓
iptables KUBE-SERVICES 체인 매칭
  ↓
KUBE-SVC-MYAPP으로 점프
  ↓
랜덤 확률로 KUBE-SEP-2 선택 (33.3% 확률)
  ↓
DNAT: 10.96.1.100:80 → 10.244.2.6:8080
  ↓
Pod-2로 패킷 전달
```

### IPVS 모드 (고성능)

**iptables vs IPVS 비교:**

```
iptables:
  - 규칙이 많아질수록 선형적으로 성능 저하 (O(n))
  - 1만개 Service 시 눈에 띄는 지연
  - 로드 밸런싱 알고리즘 제한적 (랜덤만)

IPVS:
  - 해시 테이블 사용으로 일정한 성능 (O(1))
  - 수만개 Service도 처리 가능
  - 다양한 로드 밸런싱 알고리즘 지원
```

**IPVS 로드 밸런싱 알고리즘:**

```bash
# rr (Round Robin) - 기본값
ipvsadm -A -t 10.96.1.100:80 -s rr
ipvsadm -a -t 10.96.1.100:80 -r 10.244.1.5:8080
ipvsadm -a -t 10.96.1.100:80 -r 10.244.2.6:8080
ipvsadm -a -t 10.96.1.100:80 -r 10.244.3.7:8080

# lc (Least Connection) - 연결 수가 적은 Pod 선택
ipvsadm -A -t 10.96.1.100:80 -s lc

# sh (Source Hashing) - 같은 클라이언트는 같은 Pod로
ipvsadm -A -t 10.96.1.100:80 -s sh
```

**IPVS 모드 활성화:**

```yaml
# kube-proxy ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: kube-proxy
  namespace: kube-system
data:
  config.conf: |
    mode: ipvs
    ipvs:
      scheduler: rr  # rr, lc, dh, sh 등
```

**참고 자료:**

- [kube-proxy 공식 문서](https://kubernetes.io/docs/reference/command-line-tools-reference/kube-proxy/)
- [IPVS 모드](https://kubernetes.io/blog/2018/07/09/ipvs-based-in-cluster-load-balancing-deep-dive/)

---

## CNI 플러그인 패킷 흐름

### Container Network Interface (CNI)

CNI는 **컨테이너 네트워킹의 표준 인터페이스**다. Kubernetes는 CNI 플러그인을 통해 Pod 네트워킹을 구현한다.

### Pod 생성 시 네트워크 설정 과정

```
1. kubelet이 Container Runtime에게 Pod 생성 요청
2. Container Runtime이 네트워크 네임스페이스 생성
3. Container Runtime이 CNI 플러그인 호출
4. CNI 플러그인이 네트워크 설정:
   - veth pair 생성 (한쪽은 Pod, 한쪽은 Host)
   - Pod에 IP 주소 할당
   - 라우팅 규칙 설정
5. Pod에서 네트워크 사용 가능
```

### 실제 패킷 흐름

**Pod-to-Pod (같은 노드):**

```
Pod A (10.244.1.5)
  ↓ veth0 (Pod 내부)
  ↓
Host의 veth1 (Bridge에 연결)
  ↓
Bridge (cbr0 또는 cni0)
  ↓
Host의 veth2 (Bridge에 연결)
  ↓ veth0 (Pod 내부)
Pod B (10.244.1.6)
```

**Pod-to-Pod (다른 노드):**

```
Node1의 Pod A (10.244.1.5)
  ↓ veth pair
Node1의 Bridge
  ↓ 라우팅 테이블 확인
Node1의 eth0 (물리 NIC)
  ↓ Overlay 네트워크 (VXLAN, IP-in-IP 등)
Node2의 eth0
  ↓ 라우팅 테이블 확인
Node2의 Bridge
  ↓ veth pair
Node2의 Pod B (10.244.2.6)
```

### CNI 플러그인 비교

**Flannel:**

```
간단하고 안정적
Overlay: VXLAN, UDP, host-gw
성능: 중간
NetworkPolicy 지원: 없음 (Calico와 함께 사용)
```

**Calico:**

```
고성능, BGP 기반
Overlay: IP-in-IP, VXLAN
성능: 높음
NetworkPolicy 지원: 완전 지원
```

**Weave:**

```
자동 구성, 암호화 지원
Overlay: VXLAN (자동 구성)
성능: 중간
NetworkPolicy 지원: 지원
```

**Cilium:**

```
eBPF 기반, 차세대 CNI
Overlay: VXLAN, Geneve
성능: 매우 높음
NetworkPolicy 지원: 완전 지원 + L7 정책
```

**참고 자료:**

- [CNI 공식 문서](https://www.cni.dev/)
- [Kubernetes 네트워킹 모델](https://kubernetes.io/docs/concepts/services-networking/)

---

## CSI와 Dynamic Provisioning

### Container Storage Interface (CSI)

CSI는 **컨테이너 스토리지의 표준 인터페이스**다. Kubernetes는 CSI를 통해 다양한 스토리지 시스템을 지원한다.

### CSI의 장점

**기존 in-tree 볼륨 플러그인 문제:**

```
문제 1: Kubernetes 코어에 스토리지 드라이버 포함
  → Kubernetes 릴리스 주기에 종속
  → 새 스토리지 지원 어려움

문제 2: 모든 스토리지 드라이버를 kubelet에 컴파일
  → kubelet 바이너리 크기 증가
  → 불필요한 의존성

문제 3: 보안 이슈
  → 스토리지 드라이버가 kubelet 권한으로 실행
```

**CSI 해결 방법:**

```
CSI Driver를 독립된 컨테이너로 실행
  → Kubernetes 코어와 분리
  → 각 스토리지 벤더가 독립적으로 릴리스
  → 필요한 드라이버만 설치
```

### CSI 아키텍처

**CSI Driver 구성 요소:**

```
Node Plugin (DaemonSet):
  - 각 노드에서 실행
  - 볼륨을 노드에 마운트
  - 컨테이너에서 볼륨 사용 가능하게 설정

Controller Plugin (Deployment):
  - 클러스터 레벨 동작
  - 볼륨 생성/삭제
  - 볼륨 Attach/Detach
  - 스냅샷 생성
```

### Dynamic Provisioning 동작 과정

```
1. 사용자가 PVC 생성:
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-pvc
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: fast-ssd

2. CSI Controller가 PVC 감지
3. StorageClass 확인:
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "3000"

4. CSI Controller가 스토리지 API 호출 (예: AWS EBS 생성)
5. PV 자동 생성:
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pvc-abc123
spec:
  capacity:
    storage: 10Gi
  accessModes:
  - ReadWriteOnce
  persistentVolumeReclaimPolicy: Delete
  storageClassName: fast-ssd
  csi:
    driver: ebs.csi.aws.com
    volumeHandle: vol-0abc123

6. PV와 PVC 자동 바인딩
7. Pod 생성 시 CSI Node Plugin이 볼륨 마운트
```

### CSI 고급 기능

**Volume Snapshot:**

```yaml
# VolumeSnapshot 생성
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: my-snapshot
spec:
  volumeSnapshotClassName: csi-snapclass
  source:
    persistentVolumeClaimName: my-pvc

# Snapshot에서 볼륨 복원
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: restored-pvc
spec:
  dataSource:
    name: my-snapshot
    kind: VolumeSnapshot
    apiGroup: snapshot.storage.k8s.io
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

**Volume Cloning:**

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: cloned-pvc
spec:
  dataSource:
    name: source-pvc
    kind: PersistentVolumeClaim
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

**Volume Resize (확장):**

```yaml
# StorageClass에서 allowVolumeExpansion 활성화
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: expandable-sc
provisioner: ebs.csi.aws.com
allowVolumeExpansion: true

# PVC 크기 확장
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-pvc
spec:
  resources:
    requests:
      storage: 20Gi  # 10Gi → 20Gi로 확장
```

**참고 자료:**

- [CSI 공식 문서](https://kubernetes-csi.github.io/docs/)
- [Kubernetes Storage](https://kubernetes.io/docs/concepts/storage/)

---
