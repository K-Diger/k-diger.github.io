---
layout: post
title: "Part 14/26: Volume, PV, PVC, StorageClass"
date: 2026-01-04
categories: [Kubernetes]
tags: [kubernetes, volume, persistentvolume, pvc, storage, cka]
---

컨테이너의 파일시스템은 **일시적(ephemeral)**이다. 컨테이너가 재시작되면 모든 데이터가 사라진다. Kubernetes는 **Volume**을 통해 데이터 지속성을 제공하고, **PersistentVolume(PV)**과 **PersistentVolumeClaim(PVC)**을 통해 스토리지를 추상화한다.

## Volume의 필요성

### 컨테이너 스토리지의 한계

```
컨테이너 재시작 시:
┌────────────────┐      ┌────────────────┐
│  Container A   │  →   │  Container A'  │
│  /data/file.txt│      │  /data/ (비어있음)│
└────────────────┘      └────────────────┘
         기존 데이터 손실
```

Volume의 역할:
1. **데이터 지속성**: 컨테이너 재시작에도 데이터 유지
2. **데이터 공유**: 동일 Pod 내 컨테이너 간 파일 공유
3. **외부 스토리지 연결**: 클라우드 스토리지, NFS 등 연결

## Volume 타입

### emptyDir

Pod가 노드에 스케줄될 때 생성되고, **Pod가 삭제되면 함께 삭제**된다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: emptydir-pod
spec:
  containers:
  - name: writer
    image: busybox
    command: ["sh", "-c", "echo 'data' > /cache/data.txt; sleep 3600"]
    volumeMounts:
    - name: cache-volume
      mountPath: /cache
  - name: reader
    image: busybox
    command: ["sh", "-c", "cat /cache/data.txt; sleep 3600"]
    volumeMounts:
    - name: cache-volume
      mountPath: /cache
  volumes:
  - name: cache-volume
    emptyDir: {}
```

**메모리 기반 emptyDir** (tmpfs):
```yaml
volumes:
- name: cache-volume
  emptyDir:
    medium: Memory  # RAM에 저장 (더 빠르지만 용량 제한)
    sizeLimit: 100Mi
```

**용도**:
- 컨테이너 간 임시 데이터 공유
- 캐시 데이터
- 작업 디렉토리

### hostPath

**노드의 파일시스템을 직접 마운트**한다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: hostpath-pod
spec:
  containers:
  - name: app
    image: nginx
    volumeMounts:
    - name: host-data
      mountPath: /data
  volumes:
  - name: host-data
    hostPath:
      path: /mnt/data
      type: DirectoryOrCreate  # 없으면 생성
```

**hostPath type 옵션**:

| type | 설명 |
|------|------|
| (빈 문자열) | 검사 없음 |
| DirectoryOrCreate | 없으면 디렉토리 생성 (755 권한) |
| Directory | 디렉토리가 존재해야 함 |
| FileOrCreate | 없으면 파일 생성 (644 권한) |
| File | 파일이 존재해야 함 |
| Socket | UNIX 소켓이 존재해야 함 |
| CharDevice | 문자 디바이스가 존재해야 함 |
| BlockDevice | 블록 디바이스가 존재해야 함 |

**주의사항**:
- 특정 노드에 의존하므로 Pod 이동 시 데이터 접근 불가
- 보안 위험: 노드 파일시스템 접근 가능
- 운영 환경에서 사용 지양 (DaemonSet 로그 수집 등 예외)

### NFS

네트워크 파일 시스템을 마운트한다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nfs-pod
spec:
  containers:
  - name: app
    image: nginx
    volumeMounts:
    - name: nfs-volume
      mountPath: /data
  volumes:
  - name: nfs-volume
    nfs:
      server: nfs-server.example.com
      path: /exports/data
      readOnly: false
```

### ConfigMap과 Secret 볼륨

```yaml
volumes:
- name: config-volume
  configMap:
    name: app-config
- name: secret-volume
  secret:
    secretName: app-secret
    defaultMode: 0400  # 파일 권한
```

### Projected Volume

여러 소스를 하나의 볼륨으로 합친다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: projected-pod
spec:
  containers:
  - name: app
    image: nginx
    volumeMounts:
    - name: all-in-one
      mountPath: /projected
  volumes:
  - name: all-in-one
    projected:
      sources:
      - secret:
          name: db-secret
      - configMap:
          name: app-config
      - serviceAccountToken:
          path: token
          expirationSeconds: 3600
```

## PersistentVolume (PV)

> **원문 ([kubernetes.io - Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)):**
> A PersistentVolume (PV) is a piece of storage in the cluster that has been provisioned by an administrator or dynamically provisioned using Storage Classes.

**번역:** PersistentVolume(PV)은 관리자가 프로비저닝했거나 Storage Class를 사용하여 동적으로 프로비저닝된 클러스터의 스토리지 조각이다.

즉, **PV는 클러스터 레벨의 스토리지 리소스**이다. 관리자가 프로비저닝하거나 StorageClass를 통해 동적으로 생성된다.

### PV 정의

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-example
spec:
  capacity:
    storage: 10Gi
  accessModes:
  - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: manual
  hostPath:
    path: /mnt/data
```

### Access Modes

| 모드 | 약어 | 설명 |
|-----|------|------|
| ReadWriteOnce | RWO | 단일 노드에서 읽기/쓰기 |
| ReadOnlyMany | ROX | 여러 노드에서 읽기 전용 |
| ReadWriteMany | RWX | 여러 노드에서 읽기/쓰기 |
| ReadWriteOncePod | RWOP | 단일 Pod에서만 읽기/쓰기 (1.22+) |

**스토리지 타입별 지원**:
- **AWS EBS**: RWO만 지원
- **NFS**: RWO, ROX, RWX 모두 지원
- **GCE PD**: RWO, ROX 지원

### Reclaim Policy

PVC가 삭제될 때 PV의 처리 방식:

| 정책 | 설명 | 용도 |
|-----|------|------|
| Retain | PV와 데이터 유지 | 중요 데이터, 수동 복구 필요 |
| Delete | PV와 외부 스토리지 삭제 | 동적 프로비저닝 기본값 |
| Recycle | 데이터 삭제 후 재사용 (deprecated) | 사용하지 않음 |

```yaml
spec:
  persistentVolumeReclaimPolicy: Retain  # 또는 Delete
```

### PV 상태

| 상태 | 설명 |
|------|------|
| Available | PVC에 바인딩되지 않은 상태 |
| Bound | PVC에 바인딩됨 |
| Released | PVC 삭제됨, 아직 재사용 불가 |
| Failed | 자동 복구 실패 |

## PersistentVolumeClaim (PVC)

> **원문 ([kubernetes.io - Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)):**
> A PersistentVolumeClaim (PVC) is a request for storage by a user. It is similar to a Pod. Pods consume node resources and PVCs consume PV resources.

**번역:** PersistentVolumeClaim(PVC)은 사용자의 스토리지 요청이다. Pod와 유사하다. Pod는 노드 리소스를 소비하고 PVC는 PV 리소스를 소비한다.

즉, **PVC는 사용자의 스토리지 요청**이다. Pod는 PVC를 통해 PV를 사용한다.

### PVC 정의

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pvc-example
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  storageClassName: manual  # PV의 storageClassName과 일치해야 함
```

### PVC와 PV 바인딩

PVC는 다음 조건을 만족하는 PV에 바인딩된다:
1. **accessModes** 일치
2. **storageClassName** 일치
3. **capacity** >= requests.storage
4. **selector** 조건 만족 (지정된 경우)

```yaml
# Label Selector로 특정 PV 선택
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pvc-selector
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  selector:
    matchLabels:
      type: ssd
```

### Pod에서 PVC 사용

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: pod-with-pvc
spec:
  containers:
  - name: app
    image: nginx
    volumeMounts:
    - name: data-volume
      mountPath: /data
  volumes:
  - name: data-volume
    persistentVolumeClaim:
      claimName: pvc-example
```

## StorageClass

**StorageClass는 동적 프로비저닝을 위한 스토리지 유형 정의**이다.

### StorageClass 정의

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-storage
provisioner: kubernetes.io/aws-ebs
parameters:
  type: gp3
  iopsPerGB: "10"
  fsType: ext4
reclaimPolicy: Delete
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
```

### 주요 Provisioner

| 환경 | Provisioner | 설명 |
|-----|-------------|------|
| AWS | kubernetes.io/aws-ebs | EBS 볼륨 |
| GCP | kubernetes.io/gce-pd | GCE Persistent Disk |
| Azure | kubernetes.io/azure-disk | Azure Disk |
| NFS | 별도 provisioner 필요 | NFS 동적 프로비저닝 |
| Local | kubernetes.io/no-provisioner | 로컬 볼륨 (수동) |

### volumeBindingMode

| 모드 | 설명 |
|------|------|
| Immediate | PVC 생성 시 즉시 PV 바인딩 |
| WaitForFirstConsumer | Pod가 스케줄될 때 바인딩 (권장) |

**WaitForFirstConsumer 장점**:
- Pod가 스케줄될 노드의 토폴로지 고려
- 적절한 가용 영역에 볼륨 생성

### 동적 프로비저닝 예시

```yaml
# StorageClass
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: standard
provisioner: kubernetes.io/aws-ebs
parameters:
  type: gp2
---
# PVC (StorageClass 참조)
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: dynamic-pvc
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: standard  # StorageClass 참조
# PV가 자동으로 생성되고 바인딩됨
```

### Default StorageClass

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: standard
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"  # 기본 SC
provisioner: kubernetes.io/aws-ebs
```

PVC에서 storageClassName을 지정하지 않으면 기본 StorageClass가 사용된다.

```yaml
# storageClassName 생략 시 기본 SC 사용
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: default-sc-pvc
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  # storageClassName 생략
```

**동적 프로비저닝을 원하지 않을 때**:
```yaml
spec:
  storageClassName: ""  # 빈 문자열로 명시
```

## Volume Expansion

StorageClass에서 allowVolumeExpansion이 true면 PVC 크기를 확장할 수 있다.

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: expandable
provisioner: kubernetes.io/aws-ebs
allowVolumeExpansion: true
```

```bash
# PVC 크기 확장
kubectl patch pvc my-pvc -p '{"spec":{"resources":{"requests":{"storage":"20Gi"}}}}'

# 또는 edit
kubectl edit pvc my-pvc
# spec.resources.requests.storage 값 수정
```

**주의**:
- 축소(shrink)는 지원되지 않음
- 일부 스토리지는 Pod 재시작 필요
- 파일시스템 확장은 자동 또는 수동

## StatefulSet과 volumeClaimTemplates

StatefulSet은 각 Pod마다 별도의 PVC를 생성한다.

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mysql
spec:
  serviceName: mysql
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
      accessModes: ["ReadWriteOnce"]
      storageClassName: standard
      resources:
        requests:
          storage: 10Gi
```

생성되는 PVC:
- `data-mysql-0`
- `data-mysql-1`
- `data-mysql-2`

**StatefulSet 삭제 시 PVC는 유지**된다. 수동으로 삭제해야 한다.

## 트러블슈팅

### PVC가 Pending 상태

```bash
# PVC 상태 확인
kubectl get pvc
kubectl describe pvc <pvc-name>

# 이벤트 확인
# "waiting for first consumer" → volumeBindingMode: WaitForFirstConsumer
# "no persistent volumes available" → 조건 맞는 PV 없음
```

**원인과 해결**:
1. **PV 부족**: PV 생성 또는 StorageClass 확인
2. **accessModes 불일치**: PV와 PVC의 accessModes 확인
3. **storageClassName 불일치**: 두 리소스의 storageClassName 확인
4. **용량 부족**: PV 용량 >= PVC 요청 용량

### Volume 마운트 실패

```bash
# Pod 이벤트 확인
kubectl describe pod <pod-name>

# "Unable to mount volumes" 확인
# "MountVolume.SetUp failed" 확인
```

**원인과 해결**:
1. **PVC 바인딩 안 됨**: PVC 상태 확인
2. **노드에 볼륨 연결 실패**: 클라우드 권한, 네트워크 확인
3. **파일시스템 오류**: fsType 확인

### 디버깅 명령어

```bash
# 스토리지 리소스 전체 확인
kubectl get pv,pvc,sc

# PV 상세 정보
kubectl describe pv <pv-name>

# PVC 상세 정보
kubectl describe pvc <pvc-name>

# StorageClass 확인
kubectl get storageclass
kubectl describe storageclass <sc-name>

# Pod 볼륨 마운트 확인
kubectl exec <pod> -- df -h
kubectl exec <pod> -- ls -la /data
```

## 기술 면접 대비

### 자주 묻는 질문

**Q: PV와 PVC의 차이점과 관계는?**

A: PV(PersistentVolume)는 클러스터 관리자가 프로비저닝하는 스토리지 리소스이다. PVC(PersistentVolumeClaim)는 사용자의 스토리지 요청이다. PVC는 조건에 맞는 PV에 바인딩되고, Pod는 PVC를 통해 스토리지를 사용한다. 이 추상화를 통해 사용자는 실제 스토리지 구현을 알 필요 없이 스토리지를 요청할 수 있다.

**Q: Dynamic Provisioning이란?**

A: StorageClass를 정의해두면 PVC 생성 시 자동으로 PV가 생성되는 것이다. 관리자가 미리 PV를 만들 필요 없이 PVC의 요청에 따라 클라우드 스토리지(EBS, GCE PD 등)가 동적으로 프로비저닝된다. volumeBindingMode를 WaitForFirstConsumer로 설정하면 Pod 스케줄링 시점에 적절한 토폴로지에 볼륨이 생성된다.

**Q: Reclaim Policy의 Retain과 Delete 차이는?**

A: Delete는 PVC 삭제 시 PV와 연결된 외부 스토리지(EBS 등)도 함께 삭제된다. Retain은 PVC가 삭제되어도 PV와 데이터가 유지되며, 수동으로 복구하거나 재사용할 수 있다. 동적 프로비저닝의 기본값은 Delete이므로, 중요 데이터는 Retain으로 설정하거나 백업 전략이 필요하다.

**Q: emptyDir과 hostPath의 차이는?**

A: emptyDir은 Pod 생성 시 빈 디렉토리가 만들어지고 Pod 삭제 시 함께 삭제된다. 같은 Pod 내 컨테이너 간 데이터 공유에 사용한다. hostPath는 노드의 파일시스템을 직접 마운트하므로 Pod 삭제 후에도 데이터가 유지된다. 하지만 특정 노드에 의존하게 되고 보안 위험이 있어 운영 환경에서는 지양한다.

**Q: volumeBindingMode WaitForFirstConsumer의 장점은?**

A: PVC 생성 시 즉시 바인딩(Immediate)하면 Pod가 스케줄될 노드와 다른 가용 영역에 볼륨이 생성될 수 있다. WaitForFirstConsumer는 Pod가 실제로 스케줄될 때 해당 노드의 토폴로지를 고려해 볼륨을 생성하므로, 가용 영역 불일치 문제를 방지한다.

## CKA 시험 대비 필수 명령어

```bash
# PV 생성 (YAML 필수)
kubectl apply -f pv.yaml

# PVC 생성 (YAML 필수)
kubectl apply -f pvc.yaml

# 조회
kubectl get pv
kubectl get pvc
kubectl get storageclass
kubectl get sc  # 축약형

# 상세 정보
kubectl describe pv <pv-name>
kubectl describe pvc <pvc-name>

# PVC 삭제
kubectl delete pvc <pvc-name>

# PV 수동 재활용 (Released → Available)
kubectl patch pv <pv-name> -p '{"spec":{"claimRef": null}}'
```

### CKA 빈출 시나리오

```yaml
# 시나리오 1: PV 생성
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-storage
spec:
  capacity:
    storage: 100Mi
  accessModes:
  - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  hostPath:
    path: /mnt/data

# 시나리오 2: PVC 생성
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pvc-storage
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 50Mi

# 시나리오 3: Pod에서 PVC 사용
apiVersion: v1
kind: Pod
metadata:
  name: pod-storage
spec:
  containers:
  - name: app
    image: nginx
    volumeMounts:
    - name: data
      mountPath: /usr/share/nginx/html
  volumes:
  - name: data
    persistentVolumeClaim:
      claimName: pvc-storage
```

---

## 참고 자료

### 공식 문서

- [Persistent Volumes 공식 문서](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
- [Storage Classes](https://kubernetes.io/docs/concepts/storage/storage-classes/)
- [Volume Snapshots](https://kubernetes.io/docs/concepts/storage/volume-snapshots/)
- [CSI Drivers 목록](https://kubernetes-csi.github.io/docs/drivers.html)
- [Dynamic Volume Provisioning](https://kubernetes.io/docs/concepts/storage/dynamic-provisioning/)

## 다음 단계

- [Kubernetes - 스케줄링](/kubernetes/kubernetes-15-scheduling)
- [Kubernetes - 리소스 관리](/kubernetes/kubernetes-16-resource-management)
