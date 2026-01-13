---
title: "Part 12: Taint, Toleration, Affinity - 스케줄링 제어"
date: 2026-01-13
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, Scheduling, Taints, NodeAffinity]
layout: post
toc: true
math: true
mermaid: true
---

# Part 12: 스케줄링

## 스케줄링 개요

Kubernetes Scheduler는 새로 생성된 Pod를 가장 적합한 Node에 배치하는 역할을 한다. Scheduler는 두 단계로 동작한다:

**1. Filtering (필터링)**

조건을 만족하지 않는 노드를 제외한다:
- 리소스 요구사항을 만족하는가?
- Node Selector, Node Affinity 조건을 만족하는가?
- Taint를 Tolerate할 수 있는가?
- 볼륨을 마운트할 수 있는가?

**2. Scoring (점수 부여)**

남은 노드들에 점수를 부여하여 가장 적합한 노드를 선택한다:
- 리소스 가용량
- Pod 분산 정도
- Data locality
- Inter-pod affinity

## Manual Scheduling

Scheduler를 우회하고 Pod를 특정 노드에 직접 배치할 수 있다.

**방법 1: nodeName 사용**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: manual-pod
spec:
  nodeName: node01  # 직접 노드 지정
  containers:
    - name: nginx
      image: nginx
```

`nodeName` 필드를 설정하면 Scheduler를 거치지 않고 즉시 해당 노드에 바인딩된다. 단, 해당 노드가 존재하지 않거나 리소스가 부족하면 Pod는 Pending 상태가 된다.

**방법 2: Binding 객체 생성**

이미 생성된 Pod를 특정 노드에 바인딩:

```yaml
apiVersion: v1
kind: Binding
metadata:
  name: existing-pod
target:
  apiVersion: v1
  kind: Node
  name: node01
```

```bash
curl -X POST https://kube-apiserver:6443/api/v1/namespaces/default/pods/existing-pod/binding \
  -H "Content-Type: application/json" \
  -d @binding.json
```

## Node Selector

가장 간단한 노드 선택 방법이다. Node의 Label을 기반으로 Pod를 특정 노드 그룹에만 스케줄링한다.

**노드에 Label 추가:**

```bash
kubectl label nodes node01 disktype=ssd
kubectl label nodes node01 size=large
kubectl label nodes node02 disktype=hdd
kubectl label nodes node02 size=medium
```

**Pod에서 Node Selector 사용:**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx
spec:
  nodeSelector:
    disktype: ssd  # disktype=ssd 라벨이 있는 노드에만 배치
    size: large    # AND 조건
  containers:
    - name: nginx
      image: nginx
```

**제약사항:**
- OR 조건 불가
- NOT 조건 불가
- 복잡한 표현식 불가

이러한 제약을 극복하기 위해 Node Affinity를 사용한다.

## Node Affinity

Node Selector보다 더 유연하고 강력한 노드 선택 메커니즘이다.

**종류:**

**1. requiredDuringSchedulingIgnoredDuringExecution**

Hard requirement. 조건을 만족하는 노드가 없으면 Pod가 스케줄링되지 않는다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: with-node-affinity
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: size
                operator: In
                values:
                  - Large
                  - Medium
  containers:
    - name: nginx
      image: nginx
```

**2. preferredDuringSchedulingIgnoredDuringExecution**

Soft requirement. 선호하지만 필수는 아니다. 조건을 만족하는 노드가 없어도 다른 노드에 스케줄링된다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: with-node-affinity-preferred
spec:
  affinity:
    nodeAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100  # 가중치 (1-100)
          preference:
            matchExpressions:
              - key: disktype
                operator: In
                values:
                  - ssd
        - weight: 50
          preference:
            matchExpressions:
              - key: zone
                operator: In
                values:
                  - us-west-1a
  containers:
    - name: nginx
      image: nginx
```

**연산자 (Operators):**

- `In`: 값이 목록에 포함
- `NotIn`: 값이 목록에 미포함
- `Exists`: 키가 존재 (값 무관)
- `DoesNotExist`: 키가 존재하지 않음
- `Gt`: 값이 더 큼 (숫자)
- `Lt`: 값이 더 작음 (숫자)

**복합 조건:**

```yaml
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:  # OR 관계
              - key: size
                operator: In
                values:
                  - Large
              - key: zone
                operator: NotIn
                values:
                  - us-east-1
          - matchExpressions:  # 또는 이 조건
              - key: disktype
                operator: In
                values:
                  - ssd
```

## Taints and Tolerations

Taint는 노드에 "오염"을 표시하여 특정 Pod만 스케줄링되도록 제한한다. Toleration은 Pod가 특정 Taint를 "용인"할 수 있음을 나타낸다.

**개념:**

Taint/Toleration은 Node Affinity와 반대 개념이다:
- Node Affinity: Pod가 특정 노드를 선택
- Taint/Toleration: 노드가 특정 Pod만 허용

**Taint 추가:**

```bash
kubectl taint nodes node01 key=value:NoSchedule
kubectl taint nodes node01 gpu=true:NoSchedule
kubectl taint nodes node01 dedicated=special-workload:NoExecute
```

**Taint 확인:**

```bash
kubectl describe node node01 | grep Taint
```

**Taint 제거:**

```bash
kubectl taint nodes node01 key=value:NoSchedule-
kubectl taint nodes node01 gpu-  # key만으로도 제거 가능
```

**Taint Effect:**

**1. NoSchedule**

새로운 Pod가 스케줄링되지 않는다. 기존 Pod는 영향 없음.

**2. PreferNoSchedule**

가능하면 스케줄링하지 않는다 (Soft). 다른 노드가 없으면 스케줄링될 수 있다.

**3. NoExecute**

새로운 Pod 스케줄링 차단 + 기존 Pod도 제거 (Toleration 없는 경우).

```bash
kubectl taint nodes node01 maintenance=true:NoExecute
```

기존에 node01에서 실행 중이던 Pod들이 즉시 종료되고 다른 노드로 이동한다.

**Toleration 추가:**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: tolerant-pod
spec:
  tolerations:
    - key: "gpu"
      operator: "Equal"
      value: "true"
      effect: "NoSchedule"
  containers:
    - name: gpu-app
      image: tensorflow/tensorflow:latest-gpu
```

**Toleration Operators:**

**Equal (기본값)**

```yaml
tolerations:
  - key: "key1"
    operator: "Equal"
    value: "value1"
    effect: "NoSchedule"
```

key, value, effect 모두 일치해야 함.

**Exists**

```yaml
tolerations:
  - key: "key1"
    operator: "Exists"
    effect: "NoSchedule"
```

key와 effect만 일치하면 됨 (value 무관).

**모든 Taint 용인:**

```yaml
tolerations:
  - operator: "Exists"
```

**NoExecute와 tolerationSeconds:**

```yaml
tolerations:
  - key: "node.kubernetes.io/not-ready"
    operator: "Exists"
    effect: "NoExecute"
    tolerationSeconds: 300  # 5분간 유지 후 제거
```

노드가 Not Ready 상태가 되어도 5분 동안은 Pod를 유지한다.

**Use Case:**

```bash
# Control Plane 노드에 Taint 설정 (기본값)
kubectl taint nodes master-node node-role.kubernetes.io/control-plane:NoSchedule

# GPU 노드 전용화
kubectl taint nodes gpu-node gpu=true:NoSchedule

# 특정 팀 전용 노드
kubectl taint nodes team-a-node dedicated=team-a:NoSchedule

# 유지보수 모드
kubectl taint nodes node01 maintenance=true:NoExecute
```

## Pod Affinity and Anti-Affinity

Pod 간의 관계를 기반으로 스케줄링한다.

**Pod Affinity**

특정 Pod와 같은 노드(또는 토폴로지)에 배치:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: with-pod-affinity
spec:
  affinity:
    podAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        - labelSelector:
            matchExpressions:
              - key: app
                operator: In
                values:
                  - cache
          topologyKey: kubernetes.io/hostname  # 같은 노드
  containers:
    - name: web
      image: nginx
```

이 Pod는 `app=cache` 라벨을 가진 Pod와 같은 노드에 배치된다.

**Pod Anti-Affinity**

특정 Pod와 다른 노드에 배치:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: with-pod-anti-affinity
  labels:
    app: web
spec:
  affinity:
    podAntiAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        - labelSelector:
            matchExpressions:
              - key: app
                operator: In
                values:
                  - web
          topologyKey: kubernetes.io/hostname
  containers:
    - name: web
      image: nginx
```

같은 `app=web` 라벨을 가진 Pod들이 서로 다른 노드에 분산된다.

**Topology Key**

- `kubernetes.io/hostname`: 같은 노드
- `topology.kubernetes.io/zone`: 같은 가용 영역
- `topology.kubernetes.io/region`: 같은 리전

**Deployment에서의 활용:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
spec:
  replicas: 3
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector:
                matchLabels:
                  app: redis
              topologyKey: kubernetes.io/hostname
      containers:
        - name: redis
          image: redis:6.2
```

3개의 Redis Pod가 서로 다른 노드에 배치되어 고가용성 확보.

## Resource Requests and Limits

Scheduler는 리소스 요청량을 기반으로 Pod를 배치한다.

**Requests vs Limits:**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: resource-demo
spec:
  containers:
    - name: app
      image: myapp
      resources:
        requests:  # 스케줄링 기준 (최소 보장)
          cpu: "250m"      # 0.25 core
          memory: "256Mi"  # 256 MiB
        limits:    # 최대 사용량
          cpu: "500m"      # 0.5 core
          memory: "512Mi"  # 512 MiB
```

**CPU 단위:**
- `1` = 1 CPU core
- `1000m` = 1000 millicores = 1 core
- `500m` = 0.5 core
- `100m` = 0.1 core

**메모리 단위:**
- `128974848` (bytes)
- `129e6` (129 * 10^6)
- `129M` (129 Megabytes)
- `123Mi` (123 Mebibytes = 123 * 1024 * 1024)
- `1Gi` (1 Gibibyte)

**QoS Classes:**

Kubernetes는 requests와 limits 설정에 따라 Pod를 세 가지 QoS 클래스로 분류한다.

**1. Guaranteed (최우선)**

모든 컨테이너가 requests == limits:

```yaml
resources:
  requests:
    cpu: "500m"
    memory: "512Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"
```

**2. Burstable (중간)**

requests < limits 또는 일부만 설정:

```yaml
resources:
  requests:
    cpu: "250m"
    memory: "256Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"
```

**3. BestEffort (최하위)**

requests와 limits를 설정하지 않음:

```yaml
# resources 필드 없음
```

**메모리 부족 시 제거 순서:**
1. BestEffort Pod 먼저
2. Burstable Pod (limits 초과한 경우)
3. Guaranteed Pod (limits 초과한 경우)

## LimitRange

Namespace별 리소스 제한:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: mem-limit-range
  namespace: production
spec:
  limits:
    - max:  # 최대값
        cpu: "2"
        memory: "2Gi"
      min:  # 최소값
        cpu: "100m"
        memory: "128Mi"
      default:  # 기본 limits
        cpu: "500m"
        memory: "512Mi"
      defaultRequest:  # 기본 requests
        cpu: "250m"
        memory: "256Mi"
      type: Container
```

## ResourceQuota

Namespace 전체 리소스 제한:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: compute-quota
  namespace: production
spec:
  hard:
    requests.cpu: "10"
    requests.memory: "20Gi"
    limits.cpu: "20"
    limits.memory: "40Gi"
    pods: "100"
    services: "10"
    persistentvolumeclaims: "20"
```

## Priority and Preemption

Pod 우선순위를 설정하여 리소스 부족 시 우선순위가 낮은 Pod를 제거할 수 있다.

**PriorityClass 생성:**

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: high-priority
value: 1000000  # 높을수록 우선순위 높음
globalDefault: false
description: "Critical system pods"
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: medium-priority
value: 1000
globalDefault: false
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: low-priority
value: 100
globalDefault: true  # 기본값
```

**Pod에 Priority 설정:**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: critical-pod
spec:
  priorityClassName: high-priority
  containers:
    - name: app
      image: critical-app
```

**Preemption 동작:**

1. 리소스 부족으로 high-priority Pod를 스케줄링할 수 없음
2. Scheduler가 low-priority Pod를 찾음
3. Low-priority Pod를 제거(Evict)
4. High-priority Pod를 스케줄링

**System Priority:**

Kubernetes 시스템 Pod는 더 높은 우선순위를 가진다:
- `system-cluster-critical`: 2000000000
- `system-node-critical`: 2000001000

## Static Pods

kubelet이 직접 관리하는 Pod로, API Server 없이도 실행된다.

**생성 방법:**

`/etc/kubernetes/manifests/` 디렉토리에 YAML 파일 배치:

```bash
cat <<EOF > /etc/kubernetes/manifests/static-web.yaml
apiVersion: v1
kind: Pod
metadata:
  name: static-web
spec:
  containers:
    - name: nginx
      image: nginx
EOF
```

kubelet이 자동으로 감지하여 Pod를 생성한다.

**특징:**
- API Server에 Mirror Pod로 표시됨
- kubectl delete로 삭제 불가 (파일 삭제 필요)
- Control Plane 컴포넌트가 Static Pod로 실행됨

**확인:**

```bash
kubectl get pods -n kube-system | grep master-node
# kube-apiserver-master-node
# kube-controller-manager-master-node
# kube-scheduler-master-node
# etcd-master-node
```

## DaemonSet Scheduling

DaemonSet은 모든 (또는 특정) 노드에서 정확히 하나의 Pod를 실행한다.

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: monitoring-agent
spec:
  selector:
    matchLabels:
      app: monitoring
  template:
    metadata:
      labels:
        app: monitoring
    spec:
      tolerations:  # Control Plane에서도 실행
        - key: node-role.kubernetes.io/control-plane
          effect: NoSchedule
      containers:
        - name: agent
          image: monitoring-agent:latest
```

**특정 노드에만 실행:**

```yaml
spec:
  template:
    spec:
      nodeSelector:
        disktype: ssd  # SSD가 있는 노드에만
```

## Multiple Schedulers

커스텀 Scheduler를 생성하여 사용할 수 있다.

**커스텀 Scheduler 배포:**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-custom-scheduler
  namespace: kube-system
spec:
  containers:
    - name: scheduler
      image: custom-scheduler:1.0
      command:
        - /usr/local/bin/custom-scheduler
        - --scheduler-name=my-scheduler
```

**Pod에서 Scheduler 지정:**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx
spec:
  schedulerName: my-scheduler  # 커스텀 스케줄러 사용
  containers:
    - name: nginx
      image: nginx
```

## 실습 과제

**1. Node Selector와 Node Affinity**

```bash
# 노드 라벨링
kubectl label nodes node01 disktype=ssd
kubectl label nodes node02 disktype=hdd

# Node Selector Pod 생성
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: ssd-pod
spec:
  nodeSelector:
    disktype: ssd
  containers:
    - name: nginx
      image: nginx
EOF

# 배치 확인
kubectl get pod ssd-pod -o wide
```

**2. Taints and Tolerations**

```bash
# Taint 추가
kubectl taint nodes node01 gpu=true:NoSchedule

# Toleration 없는 Pod (실패)
kubectl run no-toleration --image=nginx

# Toleration 있는 Pod (성공)
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: with-toleration
spec:
  tolerations:
    - key: "gpu"
      operator: "Equal"
      value: "true"
      effect: "NoSchedule"
  containers:
    - name: nginx
      image: nginx
EOF

# Taint 제거
kubectl taint nodes node01 gpu=true:NoSchedule-
```

**3. Resource Requests and Limits**

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: resource-pod
spec:
  containers:
    - name: app
      image: nginx
      resources:
        requests:
          cpu: "250m"
          memory: "256Mi"
        limits:
          cpu: "500m"
          memory: "512Mi"
EOF

# QoS Class 확인
kubectl describe pod resource-pod | grep QoS
```

**4. Priority Classes**

```bash
# PriorityClass 생성
kubectl apply -f - <<EOF
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: high-priority
value: 1000
globalDefault: false
EOF

# High priority Pod 생성
kubectl run high-pod --image=nginx --restart=Never --dry-run=client -o yaml > high-pod.yaml
echo "  priorityClassName: high-priority" >> high-pod.yaml
kubectl apply -f high-pod.yaml
```

## 참고 자료

- [Kubernetes Scheduler](https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/)
- [Taints and Tolerations](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/)
- [Node Affinity](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/#affinity-and-anti-affinity)
- [Resource Management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Pod Priority and Preemption](https://kubernetes.io/docs/concepts/scheduling-eviction/pod-priority-preemption/)

---

**이전**: [Part 11: Admission Webhook](https://k-diger.github.io/posts//posts/kubernetes-11-admission-webhook) ←
**다음**: [Part 13: HPA와 VPA](https://k-diger.github.io/posts//posts/kubernetes-13-hpa-vpa) →
