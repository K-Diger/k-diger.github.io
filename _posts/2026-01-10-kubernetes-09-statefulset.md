---
title: "Part 9: StatefulSet과 DaemonSet - 상태 관리와 노드별 배포"
date: 2026-01-10
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, StatefulSet, DaemonSet, Job, CronJob]
layout: post
toc: true
math: true
mermaid: true
---

## 1. StatefulSet

### 1.1 StatefulSet이란?

StatefulSet은 **상태가 있는(Stateful) 애플리케이션**을 위한 워크로드 컨트롤러다.

**Deployment vs StatefulSet:**

| 특성 | Deployment | StatefulSet |
|------|-----------|-------------|
| Pod 이름 | 랜덤 (nginx-6b9f7c8d5-abc12) | 순차적 (mysql-0, mysql-1) |
| 생성/삭제 순서 | 무작위 | 순차적 |
| 네트워크 ID | 변경됨 | 고정 (Headless Service) |
| 스토리지 | 공유 가능 | Pod별 독립 PVC |
| 적합한 워크로드 | 웹 서버, API | 데이터베이스, 분산 시스템 |

### 1.2 StatefulSet의 핵심 특징

**1. 안정적인 네트워크 ID:**
```
Pod 이름: <statefulset-name>-<ordinal>
DNS: <pod-name>.<headless-service>.<namespace>.svc.cluster.local

예시:
- mysql-0.mysql-headless.default.svc.cluster.local
- mysql-1.mysql-headless.default.svc.cluster.local
- mysql-2.mysql-headless.default.svc.cluster.local
```

**2. 순서 보장:**
- 생성: 0 → 1 → 2 순서로 생성
- 삭제: 2 → 1 → 0 역순으로 삭제
- 스케일 업: 이전 Pod이 Ready 상태여야 다음 Pod 생성
- 스케일 다운: 역순으로 하나씩 삭제

**3. 영구적인 스토리지:**
- 각 Pod에 독립적인 PVC 자동 생성
- Pod이 삭제되어도 PVC는 유지
- Pod이 다시 생성되면 같은 PVC에 연결

### 1.3 StatefulSet 정의

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mysql
spec:
  serviceName: mysql-headless    # Headless Service 이름 (필수)
  replicas: 3
  selector:
    matchLabels:
      app: mysql
  template:
    metadata:
      labels:
        app: mysql
    spec:
      containers:
      - name: mysql
        image: mysql:8.0
        ports:
        - containerPort: 3306
        volumeMounts:
        - name: data
          mountPath: /var/lib/mysql
        env:
        - name: MYSQL_ROOT_PASSWORD
          valueFrom:
            secretKeyRef:
              name: mysql-secret
              key: password
  volumeClaimTemplates:          # PVC 템플릿 (자동 생성)
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: standard
      resources:
        requests:
          storage: 10Gi
---
# Headless Service (ClusterIP: None)
apiVersion: v1
kind: Service
metadata:
  name: mysql-headless
spec:
  clusterIP: None               # Headless Service
  selector:
    app: mysql
  ports:
  - port: 3306
```

### 1.4 Headless Service

StatefulSet은 **Headless Service**를 사용하여 각 Pod에 고유한 DNS 레코드를 생성한다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mysql-headless
spec:
  clusterIP: None    # Headless Service 핵심
  selector:
    app: mysql
  ports:
  - port: 3306
```

**일반 Service vs Headless Service:**

| 구분 | 일반 Service | Headless Service |
|------|-------------|------------------|
| ClusterIP | 할당됨 | None |
| 로드 밸런싱 | Service IP로 분산 | 직접 Pod IP 반환 |
| DNS 응답 | Service IP | 모든 Pod IP |
| 용도 | 일반 애플리케이션 | StatefulSet, 개별 Pod 접근 |

### 1.5 Pod 관리 정책

```yaml
spec:
  podManagementPolicy: OrderedReady  # 기본값
  # OrderedReady: 순차적 생성/삭제
  # Parallel: 동시 생성/삭제 (순서 불필요 시)
```

### 1.6 업데이트 전략

```yaml
spec:
  updateStrategy:
    type: RollingUpdate        # 기본값
    rollingUpdate:
      partition: 2             # 이 값 이상의 ordinal만 업데이트
```

**partition 활용 (카나리 배포):**
- `partition: 2`로 설정하면 mysql-2만 업데이트
- 검증 후 `partition: 0`으로 변경하여 전체 업데이트

### 1.7 StatefulSet 사용 사례

- **데이터베이스**: MySQL, PostgreSQL, MongoDB
- **분산 시스템**: Kafka, Zookeeper, Elasticsearch
- **캐시 클러스터**: Redis Cluster
- **메시지 큐**: RabbitMQ

---

## 2. DaemonSet

### 2.1 DaemonSet이란?

DaemonSet은 **모든(또는 일부) 노드에 Pod을 하나씩 실행**하는 컨트롤러다.

```
┌─────────────────────────────────────────────────────────────┐
│                      Kubernetes Cluster                      │
│                                                             │
│  Node 1         Node 2         Node 3         Node 4        │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐     │
│  │DaemonSet│   │DaemonSet│   │DaemonSet│   │DaemonSet│     │
│  │Pod (log │   │Pod (log │   │Pod (log │   │Pod (log │     │
│  │collector)│   │collector)│   │collector)│   │collector)│     │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘     │
│                                                             │
│  새 노드가 추가되면 자동으로 DaemonSet Pod 생성              │
│  노드가 제거되면 해당 노드의 DaemonSet Pod도 삭제            │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 DaemonSet 사용 사례

- **로그 수집**: Fluentd, Filebeat
- **모니터링 에이전트**: Prometheus Node Exporter, Datadog Agent
- **네트워킹**: CNI 플러그인 (Calico, Flannel)
- **스토리지**: CSI 드라이버
- **보안**: Falco, Sysdig

### 2.3 DaemonSet 정의

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd
  namespace: kube-system
spec:
  selector:
    matchLabels:
      name: fluentd
  template:
    metadata:
      labels:
        name: fluentd
    spec:
      containers:
      - name: fluentd
        image: fluentd:latest
        resources:
          limits:
            cpu: 200m
            memory: 200Mi
          requests:
            cpu: 100m
            memory: 100Mi
        volumeMounts:
        - name: varlog
          mountPath: /var/log
        - name: varlibdockercontainers
          mountPath: /var/lib/docker/containers
          readOnly: true
      volumes:
      - name: varlog
        hostPath:
          path: /var/log
      - name: varlibdockercontainers
        hostPath:
          path: /var/lib/docker/containers
```

### 2.4 특정 노드에만 배포

**nodeSelector 사용:**
```yaml
spec:
  template:
    spec:
      nodeSelector:
        disktype: ssd
```

**nodeAffinity 사용:**
```yaml
spec:
  template:
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: node-type
                operator: In
                values:
                - worker
```

### 2.5 Taint Toleration

Control Plane 노드에도 DaemonSet Pod을 실행하려면:

```yaml
spec:
  template:
    spec:
      tolerations:
      - key: node-role.kubernetes.io/control-plane
        operator: Exists
        effect: NoSchedule
      - key: node-role.kubernetes.io/master
        operator: Exists
        effect: NoSchedule
```

### 2.6 업데이트 전략

```yaml
spec:
  updateStrategy:
    type: RollingUpdate        # 기본값
    rollingUpdate:
      maxUnavailable: 1        # 동시에 업데이트할 수 있는 노드 수
```

- **RollingUpdate**: 순차적으로 업데이트
- **OnDelete**: 수동으로 Pod 삭제 시에만 업데이트

---

## 3. Job

### 3.1 Job이란?

Job은 **일회성 작업을 완료될 때까지 실행**하는 컨트롤러다.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: backup-job
spec:
  template:
    spec:
      containers:
      - name: backup
        image: backup-tool:latest
        command: ["/bin/sh", "-c", "backup.sh"]
      restartPolicy: OnFailure   # Never 또는 OnFailure (Always 불가)
  backoffLimit: 4                # 재시도 횟수
```

### 3.2 Job 완료 조건

```yaml
spec:
  completions: 5                 # 성공적으로 완료해야 하는 Pod 수
  parallelism: 2                 # 동시에 실행할 Pod 수
```

| 설정 | 동작 |
|------|------|
| `completions=1, parallelism=1` | 단일 Pod 실행 (기본) |
| `completions=5, parallelism=1` | 순차적으로 5개 완료 |
| `completions=5, parallelism=2` | 2개씩 병렬로 총 5개 완료 |

### 3.3 Job 정리

```yaml
spec:
  ttlSecondsAfterFinished: 3600  # 완료 후 1시간 뒤 자동 삭제
```

---

## 4. CronJob

### 4.1 CronJob이란?

CronJob은 **스케줄에 따라 Job을 생성**하는 컨트롤러다.

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: daily-backup
spec:
  schedule: "0 2 * * *"          # 매일 오전 2시
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: backup-tool:latest
            command: ["/bin/sh", "-c", "backup.sh"]
          restartPolicy: OnFailure
```

### 4.2 Cron 스케줄 형식

```
┌───────────── 분 (0-59)
│ ┌───────────── 시 (0-23)
│ │ ┌───────────── 일 (1-31)
│ │ │ ┌───────────── 월 (1-12)
│ │ │ │ ┌───────────── 요일 (0-6, 0=일요일)
│ │ │ │ │
* * * * *
```

| 예시 | 설명 |
|------|------|
| `*/5 * * * *` | 5분마다 |
| `0 * * * *` | 매시 정각 |
| `0 2 * * *` | 매일 오전 2시 |
| `0 0 1 * *` | 매월 1일 자정 |
| `0 0 * * 0` | 매주 일요일 자정 |

### 4.3 동시성 정책

```yaml
spec:
  concurrencyPolicy: Allow       # 기본값
  # Allow: 동시 실행 허용
  # Forbid: 이전 Job 실행 중이면 스킵
  # Replace: 이전 Job 취소하고 새 Job 실행
```

### 4.4 시작 기한

```yaml
spec:
  startingDeadlineSeconds: 200   # 스케줄 시간 후 이 시간 내에 시작 못하면 실패 처리
```

---

## 5. 면접 빈출 질문

### Q1. StatefulSet을 사용해야 하는 경우는?

다음 중 하나라도 해당되면 StatefulSet 사용:
1. **고유한 네트워크 ID 필요**: 각 Pod에 안정적인 DNS 이름
2. **안정적인 스토리지 필요**: Pod 재시작 후에도 같은 볼륨
3. **순서 보장 필요**: 순차적 생성/삭제/업데이트
4. **클러스터 멤버십 필요**: 분산 시스템에서 노드 식별

예: MySQL, PostgreSQL, Kafka, Zookeeper, Elasticsearch

### Q2. StatefulSet에서 Headless Service가 필요한 이유는?

Headless Service는 개별 Pod에 대한 DNS 레코드를 생성한다.

일반 Service는 로드 밸런싱을 위해 단일 ClusterIP를 제공하지만, Headless Service는:
- 각 Pod에 고유한 DNS 이름 제공
- 클라이언트가 특정 Pod에 직접 연결 가능
- 분산 시스템에서 노드 간 통신에 필수

### Q3. DaemonSet Pod이 특정 노드에서 실행되지 않는 이유는?

1. **Taint가 있는 노드**: Toleration이 없으면 스케줄되지 않음
2. **nodeSelector/nodeAffinity**: 조건에 맞지 않는 노드 제외
3. **Unschedulable 노드**: `kubectl cordon`으로 스케줄 비활성화된 노드
4. **리소스 부족**: Pod의 requests를 만족할 수 없는 노드

### Q4. Job의 restartPolicy가 Always일 수 없는 이유는?

Job은 완료를 목적으로 하는데, `Always`는 컨테이너가 종료될 때마다 무한히 재시작한다. 이는 "완료"라는 개념과 충돌한다.

Job에서 허용되는 정책:
- `OnFailure`: 실패 시에만 재시작 (같은 Pod에서)
- `Never`: 재시작 안함 (새 Pod으로 재시도)

---

## 6. CKA 실습

### 6.1 StatefulSet 생성

```bash
# Headless Service 먼저 생성
kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: nginx-headless
spec:
  clusterIP: None
  selector:
    app: nginx
  ports:
  - port: 80
EOF

# StatefulSet 생성
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: nginx
spec:
  serviceName: nginx-headless
  replicas: 3
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
        ports:
        - containerPort: 80
EOF

# Pod 이름 확인 (nginx-0, nginx-1, nginx-2)
kubectl get pods

# DNS 확인
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup nginx-headless
```

### 6.2 DaemonSet 생성

```bash
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd
spec:
  selector:
    matchLabels:
      name: fluentd
  template:
    metadata:
      labels:
        name: fluentd
    spec:
      containers:
      - name: fluentd
        image: fluentd
EOF

# 각 노드에 Pod 확인
kubectl get pods -o wide
```

### 6.3 Job 생성

```bash
kubectl create job backup --image=busybox -- /bin/sh -c "echo backup done"

# Job 상태 확인
kubectl get jobs
kubectl get pods

# 로그 확인
kubectl logs job/backup
```

### 6.4 CronJob 생성

```bash
kubectl create cronjob daily-backup --image=busybox --schedule="*/1 * * * *" -- /bin/sh -c "date; echo backup"

# CronJob 확인
kubectl get cronjobs

# 생성된 Job 확인
kubectl get jobs
```

---

## 정리

### 주요 개념 체크리스트

- StatefulSet의 핵심 특징 (순서, 네트워크 ID, 스토리지)
- Headless Service의 역할
- DaemonSet의 용도와 동작
- Job과 CronJob의 차이
- 각 워크로드의 적절한 사용 사례

### 다음 포스트

[Part 10: Job과 CronJob - 배치 작업 처리](/posts/kubernetes-10-job)에서는 배치 작업의 세부 설정을 다룬다.

---

## 참고 자료

- [StatefulSets](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)
- [DaemonSet](https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/)
- [Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/)
- [CronJob](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/)

