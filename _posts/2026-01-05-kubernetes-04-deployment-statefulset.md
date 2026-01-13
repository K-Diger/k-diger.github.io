---
title: "Part 4: Deployment, StatefulSet, DaemonSet - 워크로드 관리"
date: 2026-01-05
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, Deployment, StatefulSet, DaemonSet, Job]
layout: post
toc: true
math: true
mermaid: true
---

> **Phase 2: 기본 리소스 관리** (4/20)

---

# Part 4: Workload 리소스

## 10. ReplicaSet

### 10.1 ReplicaSet 개념

**정의:**

ReplicaSet은 **지정된 수의 Pod 복제본을 유지**하는 컨트롤러이다.

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: myapp-rs
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
        - name: myapp
          image: myapp:v1
```

### 10.2 Replica 수 유지

ReplicaSet Controller는 Reconciliation Loop를 통해:

1. 현재 Pod 수 확인
2. 목표 수와 비교
3. 부족하면 생성, 초과하면 제거

```bash
# ReplicaSet 스케일링
kubectl scale replicaset myapp-rs --replicas=5

# 상태 확인
kubectl get rs
kubectl describe rs myapp-rs
```

### 10.3 Label Selector

ReplicaSet은 Label을 통해 Pod을 선택하고 관리한다.

```yaml
selector:
  matchLabels:
    app: myapp
    version: v1
  matchExpressions:
    - key: environment
      operator: In
      values:
        - production
        - staging
```

---

## 11. Deployment

### 11.1 Deployment 개념

**정의:**

Deployment는 **ReplicaSet을 관리하면서 선언적 업데이트를 제공**한다.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
spec:
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
          image: nginx:1.20
          ports:
            - containerPort: 80
```

**ReplicaSet vs Deployment:**

- ReplicaSet: Pod 복제본 유지만 담당
- Deployment: ReplicaSet 관리 + 배포 전략

### 11.2 롤링 업데이트

**프로세스:**

```
v1.0 (3개)
       ↓ (1개 교체)
v1.0 (2개) + v1.1 (1개)
       ↓ (1개 교체)
v1.0 (1개) + v1.1 (2개)
       ↓ (1개 교체)
v1.1 (3개) ✓
```

**무중단 배포:**

- 항상 서비스 가능한 Pod 유지
- 사용자 영향 최소

### 11.3 업데이트 전략

**RollingUpdate (기본값):**

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1           # 추가로 만들 수 있는 Pod 수
      maxUnavailable: 1     # 동시에 사용 불가능한 Pod 수
```

**Recreate:**

```yaml
spec:
  strategy:
    type: Recreate  # 모든 Pod 삭제 후 재생성 (다운타임 있음)
```

### 11.4 Rollback

```bash
# 롤아웃 히스토리 확인
kubectl rollout history deployment/nginx-deployment

# 이전 버전으로 롤백
kubectl rollout undo deployment/nginx-deployment

# 특정 리비전으로 롤백
kubectl rollout undo deployment/nginx-deployment --to-revision=2

# 롤아웃 상태 확인
kubectl rollout status deployment/nginx-deployment
```

---

## 12. StatefulSet

### 12.1 StatefulSet 개념

**정의:**

StatefulSet은 **상태를 가진 애플리케이션**을 관리한다.

**Deployment와의 차이:**

- Deployment: 스테이트리스 애플리케이션 (웹 서버)
- StatefulSet: 스테이트풀 애플리케이션 (데이터베이스)

### 12.2 Pod Identity (순서 보장)

**특징:**

- Pod 이름이 고정 (web-0, web-1, web-2)
- 순차적 생성/삭제
- 순서 보장

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mysql
spec:
  serviceName: mysql  # Headless Service
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
          volumeMounts:
            - name: data
              mountPath: /var/lib/mysql
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ "ReadWriteOnce" ]
        resources:
          requests:
            storage: 10Gi
```

### 12.3 Persistent Volume 연동

StatefulSet은 volumeClaimTemplates를 통해 각 Pod마다 PVC를 자동 생성:

```
StatefulSet
  ├─ mysql-0 (PVC: mysql-0)
  ├─ mysql-1 (PVC: mysql-1)
  └─ mysql-2 (PVC: mysql-2)
```

Pod이 재시작되어도 같은 스토리지에 연결됨.

### 12.4 Headless Service

StatefulSet은 Headless Service와 함께 사용되어 고정 DNS 이름 제공:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mysql
spec:
  clusterIP: None  # Headless
  selector:
    app: mysql
  ports:
    - port: 3306
```

DNS: `mysql-0.mysql.default.svc.cluster.local`

---

## 13. DaemonSet

### 13.1 DaemonSet 개념

**정의:**

DaemonSet은 **모든 (또는 특정) 노드에서 Pod을 실행**한다.

**Deployment vs DaemonSet:**

- Deployment: replicas 수만큼 실행
- DaemonSet: 노드마다 정확히 1개 실행

### 13.2 노드마다 하나의 Pod

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter
spec:
  selector:
    matchLabels:
      app: node-exporter
  template:
    metadata:
      labels:
        app: node-exporter
    spec:
      tolerations: # Control Plane도 포함
        - key: node-role.kubernetes.io/control-plane
          effect: NoSchedule
      containers:
        - name: node-exporter
          image: prom/node-exporter:latest
          ports:
            - containerPort: 9100
```

### 13.3 사용 사례

- **로그 수집**: Fluentd, Logstash, Filebeat
- **모니터링**: Node Exporter, Datadog Agent, New Relic Agent
- **네트워크**: Calico, Flannel, Weave
- **스토리지**: Ceph, GlusterFS
- **보안**: Falco, Twistlock

---

## 14. Job과 CronJob

### 14.1 Job (일회성 작업)

**정의:**

Job은 **하나 이상의 Pod를 실행하고 정상 종료를 보장**하는 리소스이다.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: data-processing
spec:
  completions: 10        # 성공해야 하는 Pod 수
  parallelism: 3         # 동시 실행 Pod 수
  backoffLimit: 4        # 재시도 횟수
  activeDeadlineSeconds: 600  # 최대 실행 시간
  template:
    spec:
      containers:
        - name: processor
          image: processor:v1
          command: [ "python", "process.py" ]
      restartPolicy: OnFailure
```

**상태:**

- Active: 실행 중
- Succeeded: 완료
- Failed: 실패

```bash
# Job 상태 확인
kubectl get jobs
kubectl describe job data-processing
kubectl logs -f <pod-name>
```

### 14.2 CronJob (주기적 작업)

**정의:**

CronJob은 **스케줄에 따라 주기적으로 Job을 실행**한다.

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup
spec:
  schedule: "0 2 * * *"  # 매일 오전 2시
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: backup
              image: backup-tool:v1
              command: [ "bash", "backup.sh" ]
          restartPolicy: OnFailure
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
```

**Cron 표현식:**

```
분 시 일 월 요일
0  2  *  *  *    매일 오전 2시
0  */6 * * *    6시간마다
30 18 * * 1     매주 월요일 오후 6시 30분
0  0  1 * *     매달 1일
```

---

## 학습 정리

### 핵심 개념

1. **ReplicaSet**은 지정된 수의 Pod 복제본을 유지
2. **Deployment**는 ReplicaSet을 관리하며 롤링 업데이트와 롤백을 지원
3. **StatefulSet**은 상태를 가진 애플리케이션(DB 등)에 사용
4. **DaemonSet**은 모든 노드에서 Pod을 실행 (모니터링, 로그 수집 등)
5. **Job**은 일회성 작업, **CronJob**은 주기적 작업 실행

### 다음 단계

✅ Deployment를 이용한 애플리케이션 배포 이해
✅ StatefulSet과 DaemonSet 차이 파악
✅ Job과 CronJob 사용법 학습
⬜ 설정 관리 학습 → **[Part 5로 이동](./2026-01-06-kubernetes-05-configmap-secret)**

---

## 실습 과제

1. **Deployment 생성 및 업데이트**
   ```bash
   # Deployment 생성
   kubectl create deployment nginx --image=nginx:1.20 --replicas=3

   # 상태 확인
   kubectl get deployments
   kubectl get rs
   kubectl get pods

   # 이미지 업데이트
   kubectl set image deployment/nginx nginx=nginx:1.21

   # 롤아웃 상태 확인
   kubectl rollout status deployment/nginx

   # 히스토리 확인
   kubectl rollout history deployment/nginx

   # 롤백
   kubectl rollout undo deployment/nginx
   ```

2. **StatefulSet 실습**
   ```bash
   # Headless Service 생성
   kubectl create -f mysql-headless-svc.yaml

   # StatefulSet 생성
   kubectl create -f mysql-statefulset.yaml

   # Pod 이름 확인 (mysql-0, mysql-1, mysql-2)
   kubectl get pods -l app=mysql

   # DNS 테스트
   kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup mysql-0.mysql
   ```

3. **DaemonSet 실습**
   ```bash
   # DaemonSet 생성
   kubectl create -f node-exporter-daemonset.yaml

   # 모든 노드에 Pod 확인
   kubectl get pods -o wide
   ```

4. **CronJob 실습**
   ```bash
   # CronJob 생성
   kubectl create -f backup-cronjob.yaml

   # CronJob 상태 확인
   kubectl get cronjobs

   # 실행된 Job 확인
   kubectl get jobs
   ```

---

## 추가 학습 자료

- [Deployment 공식 문서](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [StatefulSet 공식 문서](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)
- [DaemonSet 공식 문서](https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/)
- [Job과 CronJob 공식 문서](https://kubernetes.io/docs/concepts/workloads/controllers/job/)

---

**이전**: [Part 3: Kubernetes 핵심 개념](./2026-01-04-kubernetes-03-pod-label-namespace) ←
**다음**: [Part 5: 설정 및 데이터 관리](./2026-01-06-kubernetes-05-configmap-secret) →
