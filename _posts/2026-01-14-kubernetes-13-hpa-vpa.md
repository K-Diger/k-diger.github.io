---
title: "Part 13: HPA와 VPA - 자동 스케일링"
date: 2026-01-14
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, HPA, VPA, Autoscaling]
layout: post
toc: true
math: true
mermaid: true
---

# Part 13: Auto-scaling

## Auto-scaling 개요

Kubernetes는 세 가지 레벨의 auto-scaling을 제공한다:

**1. Horizontal Pod Autoscaler (HPA)**
- Pod 개수를 자동 조절 (Scale Out/In)
- CPU, 메모리, 커스텀 메트릭 기반

**2. Vertical Pod Autoscaler (VPA)**
- Pod의 리소스 requests/limits 자동 조절 (Scale Up/Down)
- 컨테이너 크기 최적화

**3. Cluster Autoscaler**
- 노드 개수를 자동 조절
- 클라우드 환경에서 동작

## Horizontal Pod Autoscaler (HPA)

HPA는 Deployment, ReplicaSet, StatefulSet의 Pod 개수를 메트릭 기반으로 자동 조절한다.

### HPA 동작 원리

**Control Loop:**

```
1. Metrics Server에서 메트릭 수집
2. 현재 메트릭 값과 목표 값 비교
3. 필요한 replica 수 계산
4. Deployment/ReplicaSet 업데이트
5. 30초마다 반복 (기본값)
```

**Replica 계산 공식:**

```
desiredReplicas = ceil[currentReplicas * (currentMetricValue / targetMetricValue)]
```

예시:
- 현재 replica: 3개
- 현재 CPU 사용률: 90%
- 목표 CPU 사용률: 50%

```
desiredReplicas = ceil[3 * (90 / 50)] = ceil[5.4] = 6개
```

### Metrics Server 설치

HPA는 Metrics Server가 필수다:

```bash
# Metrics Server 설치
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# 로컬 환경 (minikube, kind)에서는 TLS 검증 비활성화 필요
kubectl patch deployment metrics-server -n kube-system --type='json' \
  -p='[{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value": "--kubelet-insecure-tls"}]'

# 확인
kubectl top nodes
kubectl top pods -A
```

### HPA 생성 - CPU 기반

**명령형 방법:**

```bash
kubectl autoscale deployment nginx --cpu-percent=50 --min=2 --max=10
```

**선언형 방법 (autoscaling/v2):**

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: nginx-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: nginx
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50  # 50%
  behavior:  # Scaling 동작 제어 (v2.2+)
    scaleDown:
      stabilizationWindowSeconds: 300  # 5분 안정화 기간
      policies:
        - type: Percent
          value: 50  # 한 번에 최대 50%까지 감소
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0  # 즉시 scale up
      policies:
        - type: Pods
          value: 4  # 한 번에 최대 4개까지 증가
          periodSeconds: 60
```

**Pod에 resource requests 필수:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  replicas: 2
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
          image: nginx
          resources:
            requests:  # HPA를 위해 필수
              cpu: 200m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
```

### HPA - 메모리 기반

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: memory-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 70  # 70%
```

**주의사항:**

메모리 기반 HPA는 주의가 필요하다. 메모리는 압축 불가능한 리소스이므로:
- Scale down 시 메모리가 즉시 해제되지 않을 수 있음
- OOMKilled 위험
- CPU 기반과 병행 사용 권장

### HPA - 다중 메트릭

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: multi-metric-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 70
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "1k"  # 1000 RPS
```

**동작 방식:**

각 메트릭마다 필요한 replica 수를 계산하고, **가장 큰 값**을 선택한다.

예시:
- CPU 기준: 6개 필요
- Memory 기준: 4개 필요
- RPS 기준: 8개 필요
- 결과: 8개로 스케일링

### HPA - 커스텀 메트릭

Prometheus 등 외부 메트릭을 사용할 수 있다 (Prometheus Adapter 필요):

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: custom-metric-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-app
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: External
      external:
        metric:
          name: http_requests_per_second
          selector:
            matchLabels:
              app: web-app
        target:
          type: Value
          value: "1000"  # 1000 RPS
```

### HPA 모니터링

```bash
# HPA 상태 확인
kubectl get hpa

# NAME        REFERENCE          TARGETS   MINPODS   MAXPODS   REPLICAS   AGE
# nginx-hpa   Deployment/nginx   45%/50%   2         10        3          5m

# 상세 정보
kubectl describe hpa nginx-hpa

# HPA 이벤트 확인
kubectl get events --field-selector involvedObject.name=nginx-hpa

# 메트릭 직접 확인
kubectl top pods -l app=nginx
```

### HPA 부하 테스트

```bash
# 부하 생성기 실행
kubectl run -it --rm load-generator --image=busybox --restart=Never -- /bin/sh

# 부하 생성
while true; do wget -q -O- http://nginx; done

# 다른 터미널에서 모니터링
watch kubectl get hpa
watch kubectl get pods
```

## Vertical Pod Autoscaler (VPA)

VPA는 Pod의 CPU와 메모리 requests/limits를 자동으로 조정한다.

### VPA 설치

```bash
# VPA 설치 (공식 리포지토리)
git clone https://github.com/kubernetes/autoscaler.git
cd autoscaler/vertical-pod-autoscaler/
./hack/vpa-up.sh

# 확인
kubectl get pods -n kube-system | grep vpa
```

### VPA 컴포넌트

**1. VPA Recommender**
- 리소스 사용량 분석
- 최적 값 추천

**2. VPA Updater**
- Pod 재시작 필요 여부 결정
- Pod eviction 실행

**3. VPA Admission Controller**
- 새 Pod의 리소스 값 자동 설정

### VPA 생성

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: myapp-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  updatePolicy:
    updateMode: "Auto"  # Auto, Recreate, Initial, Off
  resourcePolicy:
    containerPolicies:
      - containerName: "*"
        minAllowed:  # 최소 리소스
          cpu: 100m
          memory: 128Mi
        maxAllowed:  # 최대 리소스
          cpu: 2
          memory: 2Gi
        controlledResources:  # 제어할 리소스
          - cpu
          - memory
```

### Update Modes

**1. Off**
- 추천만 제공, 자동 적용 안 함
- 모니터링 및 분석용

```yaml
updatePolicy:
  updateMode: "Off"
```

**2. Initial**
- Pod 최초 생성 시에만 적용
- 기존 Pod는 그대로 유지

```yaml
updatePolicy:
  updateMode: "Initial"
```

**3. Recreate**
- 리소스 변경 시 Pod 재생성
- 다운타임 발생

```yaml
updatePolicy:
  updateMode: "Recreate"
```

**4. Auto**
- Recreate와 동일하지만 eviction API 사용
- PodDisruptionBudget 준수

```yaml
updatePolicy:
  updateMode: "Auto"
```

### VPA 추천 확인

```bash
# VPA 상태 확인
kubectl get vpa

# 추천 값 확인
kubectl describe vpa myapp-vpa

# 출력 예시:
# Recommendation:
#   Container Recommendations:
#     Container Name:  myapp
#     Lower Bound:
#       Cpu:     25m
#       Memory:  262144k
#     Target:
#       Cpu:     587m
#       Memory:  262144k
#     Upper Bound:
#       Cpu:     21
#       Memory:  8Gi
```

### VPA 제약사항

**1. HPA와 동시 사용 불가 (CPU/Memory 기준)**

VPA와 HPA를 CPU/Memory 기준으로 동시 사용하면 충돌이 발생한다. 해결책:
- VPA: CPU/Memory
- HPA: Custom metrics (RPS 등)

**2. Pod 재시작 필요**

VPA는 리소스를 변경하기 위해 Pod를 재시작한다 (In-place resize는 아직 Alpha).

**3. StatefulSet 지원 제한**

StatefulSet은 조심스럽게 사용해야 한다 (순차적 재시작 필요).

## Cluster Autoscaler

Cluster Autoscaler는 노드 수를 자동으로 조절한다.

### 동작 원리

**Scale Up:**

```
1. Pending 상태 Pod 감지 (리소스 부족)
2. 클라우드 제공자에게 노드 추가 요청
3. 새 노드 프로비저닝
4. 새 노드에 Pod 스케줄링
```

**Scale Down:**

```
1. 유휴 노드 감지 (리소스 사용률 < 50%, 기본값)
2. Pod를 다른 노드로 이동 가능한지 확인
3. 10분 이상 유휴 상태 유지 (기본값)
4. 노드 drain 및 삭제
```

### GKE에서 Cluster Autoscaler

```bash
# 노드 풀 생성 시 auto-scaling 활성화
gcloud container clusters create my-cluster \
  --enable-autoscaling \
  --min-nodes=1 \
  --max-nodes=10 \
  --zone=us-central1-a

# 기존 노드 풀에 auto-scaling 활성화
gcloud container clusters update my-cluster \
  --enable-autoscaling \
  --min-nodes=1 \
  --max-nodes=10 \
  --zone=us-central1-a
```

### EKS에서 Cluster Autoscaler

```bash
# IAM policy 생성
cat <<EOF > cluster-autoscaler-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "autoscaling:DescribeAutoScalingGroups",
        "autoscaling:DescribeAutoScalingInstances",
        "autoscaling:DescribeLaunchConfigurations",
        "autoscaling:DescribeTags",
        "autoscaling:SetDesiredCapacity",
        "autoscaling:TerminateInstanceInAutoScalingGroup",
        "ec2:DescribeLaunchTemplateVersions"
      ],
      "Resource": "*"
    }
  ]
}
EOF

# Cluster Autoscaler 배포
kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/master/cluster-autoscaler/cloudprovider/aws/examples/cluster-autoscaler-autodiscover.yaml
```

### Cluster Autoscaler 설정

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cluster-autoscaler
  namespace: kube-system
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cluster-autoscaler
  template:
    metadata:
      labels:
        app: cluster-autoscaler
    spec:
      serviceAccountName: cluster-autoscaler
      containers:
        - name: cluster-autoscaler
          image: k8s.gcr.io/autoscaling/cluster-autoscaler:v1.27.0
          command:
            - ./cluster-autoscaler
            - --v=4
            - --stderrthreshold=info
            - --cloud-provider=aws
            - --skip-nodes-with-local-storage=false
            - --expander=least-waste  # 확장 전략
            - --node-group-auto-discovery=asg:tag=k8s.io/cluster-autoscaler/enabled,k8s.io/cluster-autoscaler/my-cluster
            - --balance-similar-node-groups
            - --skip-nodes-with-system-pods=false
            - --scale-down-delay-after-add=10m  # scale-up 후 대기
            - --scale-down-unneeded-time=10m    # 유휴 시간
            - --scale-down-utilization-threshold=0.5  # CPU 사용률 임계값
```

### Scale Down 방지

특정 노드나 Pod가 scale down되지 않도록 설정:

**노드 Annotation:**

```bash
kubectl annotate node <node-name> cluster-autoscaler.kubernetes.io/scale-down-disabled=true
```

**Pod Annotation:**

```yaml
metadata:
  annotations:
    cluster-autoscaler.kubernetes.io/safe-to-evict: "false"
```

### Priority-based Expander

여러 노드 그룹이 있을 때 우선순위 기반 선택:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cluster-autoscaler-priority-expander
  namespace: kube-system
data:
  priorities: |
    10:
      - .*-spot-.*  # Spot 인스턴스 우선
    50:
      - .*-on-demand-.*  # 그 다음 On-Demand
```

## Auto-scaling 모범 사례

**1. HPA와 리소스 requests 설정**

```yaml
# Bad: requests 없음
containers:
  - name: app
    image: myapp

# Good: requests 설정
containers:
  - name: app
    image: myapp
    resources:
      requests:
        cpu: 200m
        memory: 256Mi
```

**2. PodDisruptionBudget 설정**

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: myapp-pdb
spec:
  minAvailable: 1  # 항상 최소 1개 유지
  selector:
    matchLabels:
      app: myapp
```

**3. Readiness Probe 설정**

```yaml
readinessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
```

**4. HPA behavior 커스터마이징**

급격한 scale up/down 방지:

```yaml
behavior:
  scaleDown:
    stabilizationWindowSeconds: 300
    policies:
      - type: Percent
        value: 25  # 한 번에 25%만 감소
        periodSeconds: 60
```

**5. 메트릭 모니터링**

```bash
# HPA 메트릭 확인
kubectl get hpa --watch

# Custom metrics 확인
kubectl get --raw /apis/custom.metrics.k8s.io/v1beta1
```

## 실습 과제

**1. HPA 테스트**

```bash
# Deployment 생성
kubectl create deployment php-apache --image=k8s.gcr.io/hpa-example --port=80
kubectl set resources deployment php-apache --requests=cpu=200m
kubectl expose deployment php-apache --port=80

# HPA 생성
kubectl autoscale deployment php-apache --cpu-percent=50 --min=1 --max=10

# 부하 생성
kubectl run -it load-generator --rm --image=busybox --restart=Never -- /bin/sh -c "while sleep 0.01; do wget -q -O- http://php-apache; done"

# 모니터링
kubectl get hpa php-apache --watch
kubectl get pods --watch
```

**2. VPA 테스트**

```bash
# VPA 설치 (공식 스크립트)
git clone https://github.com/kubernetes/autoscaler.git
cd autoscaler/vertical-pod-autoscaler/
./hack/vpa-up.sh

# VPA 생성
cat <<EOF | kubectl apply -f -
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: hamster-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: hamster
  updatePolicy:
    updateMode: "Auto"
EOF

# 추천 확인
kubectl describe vpa hamster-vpa
```

## 참고 자료

- [Horizontal Pod Autoscaler](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [Vertical Pod Autoscaler](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler)
- [Cluster Autoscaler](https://github.com/kubernetes/autoscaler/tree/master/cluster-autoscaler)
- [Metrics Server](https://github.com/kubernetes-sigs/metrics-server)

---

**이전**: [Part 12: 스케줄링](./2026-01-13-kubernetes-12-taint-affinity)
**다음**: [Part 14: 배포 자동화](./2026-01-15-kubernetes-14-helm-kustomize)
