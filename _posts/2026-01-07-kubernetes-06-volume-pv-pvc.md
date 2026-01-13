---
title: "Part 6: Volume, PV, PVC - 스토리지 관리"
date: 2026-01-07
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, Volume, PersistentVolume, PVC, StorageClass]
layout: post
toc: true
math: true
mermaid: true
---

# Part 6: 스토리지

## 20. Volume

### 20.1 Volume 종류

Volume은 Pod의 생명주기와 관계없이 데이터를 유지한다.

### 20.2 emptyDir

**특징:**

- Pod 생성 시 생성, 삭제 시 삭제
- Pod 내 컨테이너 간 데이터 공유
- 노드의 임시 스토리지 사용

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: emptydir-example
spec:
  containers:
    - name: writer
      image: ubuntu
      command: [ "sh", "-c", "while true; do echo $RANDOM >> /tmp/shared-data/data.txt; sleep 10; done" ]
      volumeMounts:
        - name: shared
          mountPath: /tmp/shared-data
    - name: reader
      image: ubuntu
      command: [ "sh", "-c", "while true; do tail -10 /tmp/shared-data/data.txt; sleep 5; done" ]
      volumeMounts:
        - name: shared
          mountPath: /tmp/shared-data
  volumes:
    - name: shared
      emptyDir: { }
```

### 20.3 hostPath

**특징:**

- 호스트 노드의 파일 시스템 접근
- 노드 특화 작업 (로그, 시스템 파일)
- 보안 위험 (Pod이 호스트 파일 접근 가능)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: hostpath-example
spec:
  containers:
    - name: app
      image: myapp:v1
      volumeMounts:
        - name: logs
          mountPath: /var/log
        - name: host-root
          mountPath: /host
          readOnly: true
  volumes:
    - name: logs
      hostPath:
        path: /var/log
        type: Directory
    - name: host-root
      hostPath:
        path: /
        type: Directory
```

### 20.4 configMap/secret

**configMap 사용:**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  app.properties: |
    server.port=8080
    app.name=myapp
---
apiVersion: v1
kind: Pod
metadata:
  name: configmap-example
spec:
  containers:
    - name: app
      image: myapp:v1
      volumeMounts:
        - name: config
          mountPath: /etc/config
  volumes:
    - name: config
      configMap:
        name: app-config
```

**secret 사용:**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
type: Opaque
data:
  username: dXNlcg==  # base64 encoded "user"
  password: cGFzc3dvcmQ=  # base64 encoded "password"
---
apiVersion: v1
kind: Pod
metadata:
  name: secret-example
spec:
  containers:
    - name: app
      image: myapp:v1
      volumeMounts:
        - name: secrets
          mountPath: /etc/secrets
  volumes:
    - name: secrets
      secret:
        secretName: db-credentials
```

### 20.5 PV/PVC

Persistent Volume과 Persistent Volume Claim의 조합으로 영구 스토리지 제공.

---

## 21. PersistentVolume (PV)

### 21.1 PV 개념

**정의:**

PV는 **클러스터 레벨의 스토리지 리소스**로 관리자가 프로비저닝한다.

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: my-pv
spec:
  capacity:
    storage: 10Gi
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: fast-ssd
  nfs:
    server: 192.168.1.100
    path: "/mnt/data"
```

**accessModes:**

- **ReadWriteOnce (RWO)**: 한 노드에서 읽기/쓰기
- **ReadOnlyMany (ROX)**: 여러 노드에서 읽기만
- **ReadWriteMany (RWX)**: 여러 노드에서 읽기/쓰기

**persistentVolumeReclaimPolicy:**

- **Retain**: PVC 삭제 후 PV 유지 (수동 정리)
- **Delete**: PVC 삭제 시 PV도 삭제
- **Recycle**: PVC 삭제 시 데이터 삭제 후 PV 재사용 (deprecated)

### 21.2 Storage Class

**정의:**

StorageClass는 **PV를 동적으로 생성하는 템플릿**이다. 클러스터 관리자가 제공하는 스토리지의 "클래스"를 정의하며, 다양한 품질 수준, 백업 정책, 성능 특성을 제공할 수 있다.

**주요 구성 요소:**

- **provisioner**: 스토리지를 프로비저닝할 플러그인 지정 (예: AWS EBS, GCE PD, Azure Disk)
- **parameters**: provisioner에 전달될 매개변수 (스토리지 타입, IOPS 등)
- **reclaimPolicy**: PV 회수 정책 (Delete 또는 Retain)
- **allowVolumeExpansion**: 볼륨 확장 허용 여부
- **volumeBindingMode**: PV 바인딩 시점 제어
  - **Immediate**: PVC 생성 즉시 PV 바인딩
  - **WaitForFirstConsumer**: Pod가 스케줄링될 때까지 바인딩 지연 (토폴로지 제약 조건 고려)

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: kubernetes.io/aws-ebs
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
  fstype: ext4
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
```

**다양한 클라우드 프로바이더 예제:**

AWS EBS:
```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: aws-standard
provisioner: kubernetes.io/aws-ebs
parameters:
  type: gp3
  fsType: ext4
  encrypted: "true"
```

GCE Persistent Disk:
```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gce-pd-ssd
provisioner: kubernetes.io/gce-pd
parameters:
  type: pd-ssd
  replication-type: regional-pd
```

Azure Disk:
```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: azure-disk
provisioner: kubernetes.io/azure-disk
parameters:
  storageaccounttype: Premium_LRS
  kind: Managed
```

**기본 StorageClass 설정:**

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: standard
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: kubernetes.io/aws-ebs
parameters:
  type: gp2
```

PVC에서 `storageClassName`을 지정하지 않으면 기본 StorageClass가 사용된다.

### 21.3 Dynamic Provisioning

**정의:**

Dynamic Provisioning은 관리자가 수동으로 PV를 생성하지 않아도, StorageClass를 기반으로 자동으로 스토리지를 프로비저닝하는 기능이다.

**프로세스:**

```
1. 사용자가 PVC 생성
   ↓
2. Kubernetes가 PVC의 storageClassName 확인
   ↓
3. StorageClass에 정의된 provisioner 호출
   ↓
4. Provisioner가 실제 스토리지 생성 (클라우드 API 호출)
   ↓
5. PV 자동 생성 및 PVC와 바인딩
   ↓
6. Pod에서 PVC를 통해 사용
```

**동작 원리:**

1. **PVC 생성 시**:
   - PVC에 `storageClassName`이 지정되면 해당 StorageClass 사용
   - 지정되지 않으면 기본(default) StorageClass 사용
   - `storageClassName: ""`로 지정하면 정적 프로비저닝만 사용

2. **PV 자동 생성**:
   - StorageClass의 provisioner가 클라우드 제공자 API 호출
   - 실제 물리적 스토리지 리소스 생성 (EBS 볼륨, GCE PD 등)
   - 생성된 스토리지를 참조하는 PV 객체 자동 생성

3. **바인딩 시점 제어** (volumeBindingMode):
   - **Immediate**: PVC 생성 즉시 바인딩, 가용 영역 미고려 가능
   - **WaitForFirstConsumer**: Pod 스케줄링 시 바인딩, Pod와 같은 가용 영역에 생성

**예제:**

```yaml
# StorageClass 정의
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-storage
provisioner: kubernetes.io/aws-ebs
parameters:
  type: io2
  iopsPerGB: "50"
volumeBindingMode: WaitForFirstConsumer
---
# PVC 생성 (동적 프로비저닝 요청)
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: dynamic-pvc
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: fast-storage
  resources:
    requests:
      storage: 100Gi
---
# Pod에서 사용
apiVersion: v1
kind: Pod
metadata:
  name: app-pod
spec:
  containers:
    - name: app
      image: myapp:v1
      volumeMounts:
        - name: storage
          mountPath: /data
  volumes:
    - name: storage
      persistentVolumeClaim:
        claimName: dynamic-pvc
```

**정적 vs 동적 프로비저닝:**

| 특성 | 정적 프로비저닝 | 동적 프로비저닝 |
|------|----------------|----------------|
| PV 생성 | 관리자가 수동 생성 | 자동 생성 |
| 관리 오버헤드 | 높음 | 낮음 |
| 유연성 | 낮음 | 높음 |
| 사용 사례 | 온프레미스, 특수 요구사항 | 클라우드, 일반적 사용 |
| StorageClass 필요 | 선택사항 | 필수 |

---

## 22. PersistentVolumeClaim (PVC)

### 22.1 PVC 개념

**정의:**

PVC는 **사용자가 스토리지를 요청**하는 것이다.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  storageClassName: fast-ssd
```

### 22.2 PV와 바인딩

**바인딩 프로세스:**

```
PVC 생성
   ↓
조건 일치하는 PV 검색
   ↓
PV와 PVC 바인딩
   ↓
Pod에서 PVC 사용
```

**사용 예:**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: mysql-pod
spec:
  containers:
    - name: mysql
      image: mysql:8.0
      volumeMounts:
        - name: data
          mountPath: /var/lib/mysql
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: my-pvc
```

---

## 실습 과제

1. **emptyDir Volume 실습**
   ```bash
   # emptyDir Pod 생성
   kubectl apply -f emptydir-example.yaml

   # writer 컨테이너 로그 확인
   kubectl logs emptydir-example -c writer

   # reader 컨테이너 로그 확인
   kubectl logs emptydir-example -c reader
   ```

2. **PV와 PVC 실습**
   ```bash
   # PV 생성
   kubectl apply -f my-pv.yaml

   # PV 확인
   kubectl get pv

   # PVC 생성
   kubectl apply -f my-pvc.yaml

   # PVC 상태 확인 (Bound 확인)
   kubectl get pvc

   # PVC를 사용하는 Pod 생성
   kubectl apply -f mysql-pod.yaml

   # Pod에서 마운트 확인
   kubectl exec mysql-pod -- df -h
   ```

3. **StorageClass와 동적 프로비저닝**
   ```bash
   # StorageClass 확인
   kubectl get storageclass

   # PVC 생성 (StorageClass 지정)
   kubectl apply -f dynamic-pvc.yaml

   # 자동으로 PV 생성되는지 확인
   kubectl get pv
   kubectl get pvc
   ```

---

## 추가 학습 자료

- [Volume 공식 문서](https://kubernetes.io/docs/concepts/storage/volumes/)
- [PersistentVolume 공식 문서](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
- [StorageClass 공식 문서](https://kubernetes.io/docs/concepts/storage/storage-classes/)
- [Dynamic Volume Provisioning](https://kubernetes.io/docs/concepts/storage/dynamic-provisioning/)

---

**이전**: [Part 5: ConfigMap과 Secret](https://k-diger.github.io/posts//posts/kubernetes-05-configmap-secret) ←
**다음**: [Part 7: Service와 Endpoint](https://k-diger.github.io/posts//posts/kubernetes-07-service-endpoint) →
