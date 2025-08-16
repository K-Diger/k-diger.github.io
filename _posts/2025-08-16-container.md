---

title: 컨테이너 기술의 진화
date: 2025-08-16
categories: [Container]
tags: [Container]
layout: post
toc: true
math: true
mermaid: true

---

# 0. 참고 자료

## 공식 문서

- [OCI Specifications](https://opencontainers.org/)
- [Kubernetes API Reference](https://kubernetes.io/docs/reference/kubernetes-api/)
- [etcd Documentation](https://etcd.io/docs/)

---

# 쿠버네티스를 위한 사전 요구사항

쿠버네티스를 제대로 이해하기 위해서는 먼저 기반 기술들에 대한 깊은 이해가 필요하다. 이 글에서는 DevOps 엔지니어 관점에서 쿠버네티스 학습 전 반드시 알아야 할 핵심 개념들을 정리해보겠다.

## 1. 컨테이너 기술의 이해

### 1.1 컨테이너 기본 개념

쿠버네티스는 컨테이너 오케스트레이션 플랫폼이다. 따라서 컨테이너가 무엇인지, 어떻게 동작하는지 명확히 이해해야 한다.

컨테이너는 애플리케이션과 그 실행에 필요한 모든 의존성을 패키징한 경량화된 실행 단위다. 가상머신과 달리 호스트 OS의 커널을 공유하면서도 프로세스 수준에서 격리를 제공한다.

### 1.2 Linux 격리 기술의 심화 이해

컨테이너의 격리는 세 가지 핵심 Linux 기술을 통해 구현된다.

#### Namespaces: 리소스 격리의 핵심

네임스페이스는 커널 리소스를 추상화 레이어로 감싸서, 네임스페이스 내의 프로세스들이 해당 리소스의 격리된 인스턴스를 가지는 것처럼 보이게 만든다.

**7가지 네임스페이스 타입:**

**PID Namespace (프로세스 격리)**
```bash
# 새로운 PID 네임스페이스 생성
sudo unshare --pid --fork --mount-proc sh
# 컨테이너 내부에서는 PID 1부터 시작
ps aux  # 컨테이너 프로세스만 보임
```
PID 네임스페이스는 프로세스 ID 공간을 격리한다. 각 컨테이너는 자체 PID 1(init 프로세스)을 가지며, 컨테이너 외부의 프로세스를 볼 수 없다.

**Network Namespace (네트워크 격리)**
```bash
# 새로운 네트워크 네임스페이스 생성
sudo ip netns add container1
sudo ip netns exec container1 ip link show
# 독립적인 네트워크 스택: 인터페이스, 라우팅 테이블, 방화벽 규칙
```

**Mount Namespace (파일시스템 격리)**
```bash
# 새로운 마운트 네임스페이스에서 파일시스템 변경
sudo unshare --mount sh
mount -t tmpfs tmpfs /tmp  # 이 변경은 네임스페이스 내부에서만 보임
```

**UTS Namespace (호스트명 격리)**
```bash
# 컨테이너만의 호스트명 설정
sudo unshare --uts sh
hostname container-hostname
```

**IPC Namespace (프로세스간 통신 격리)**
System V IPC 객체와 POSIX 메시지 큐를 격리한다.

**User Namespace (사용자/그룹 격리)**
```bash
# 컨테이너 내부의 root가 호스트에서는 일반 사용자로 매핑
sudo unshare --user --map-root-user sh
id  # uid=0(root) gid=0(root) - 컨테이너 내부
# 하지만 호스트에서는 원래 사용자 권한만 가짐
```

**Cgroup Namespace (리소스 제어 격리)**
프로세스가 자체 cgroup 계층을 생성할 수 있게 한다.

#### Cgroups: 리소스 제한과 계량

Control Groups는 프로세스 그룹의 리소스 사용량을 제한, 격리, 측정하는 Linux 커널 기능이다.

**Cgroups v1과 v2의 차이:**
- **v1**: 각 리소스 타입별로 별도 계층 구조
- **v2**: 단일 통합 계층 구조, 더 나은 성능과 일관성

**주요 Cgroup 컨트롤러:**

**Memory Controller**
```bash
# 메모리 제한 설정
echo "100M" > /sys/fs/cgroup/memory/myapp/memory.limit_in_bytes
echo $ > /sys/fs/cgroup/memory/myapp/cgroup.procs
```

**CPU Controller**
```bash
# CPU 사용량 제한 (CFS - Completely Fair Scheduler)
echo "50000" > /sys/fs/cgroup/cpu/myapp/cpu.cfs_quota_us  # 50% CPU
echo "100000" > /sys/fs/cgroup/cpu/myapp/cpu.cfs_period_us
```

**실제 컨테이너에서의 cgroups 확인:**
```bash
# Docker 컨테이너의 cgroup 경로 확인
docker run -d --name test-container --memory="512m" --cpus="0.5" nginx
cat /proc/$(docker inspect test-container -f '{{.State.Pid}}')/cgroup
```

#### chroot와 pivot_root: 파일시스템 격리

**chroot의 한계:**
```bash
# chroot는 보안 격리가 아닌 편의 기능
mkdir /tmp/jail
# chroot로는 완전한 격리 불가 - 여전히 /proc, /sys 접근 가능
```

**pivot_root를 통한 안전한 격리:**
```bash
# pivot_root는 더 안전한 루트 파일시스템 변경
mount --bind /new/rootfs /new/rootfs
mkdir /new/rootfs/.old
pivot_root /new/rootfs /new/rootfs/.old
umount /.old  # 기존 루트 파일시스템 제거
```

### 1.3 실습: 수동으로 컨테이너 만들기

```bash
#!/bin/bash
# 기본적인 컨테이너 환경 구성

# 1. 루트 파일시스템 준비
mkdir -p /tmp/container-demo/{rootfs,upper,work}
tar -xf alpine-minirootfs.tar.gz -C /tmp/container-demo/rootfs

# 2. 네임스페이스와 함께 새 프로세스 생성
sudo unshare \
  --pid --fork \
  --net \
  --mount \
  --uts \
  --ipc \
  /bin/bash -c "
    # 3. 파일시스템 격리
    mount --bind /tmp/container-demo/rootfs /tmp/container-demo/rootfs
    chroot /tmp/container-demo/rootfs /bin/sh -c '
      # 4. /proc 마운트 (PID 네임스페이스 반영)
      mount -t proc proc /proc
      
      # 5. 컨테이너 환경 확인
      echo \"Container hostname: \$(hostname)\"
      echo \"Container PID 1: \$(ps aux | head -2)\"
      echo \"Container processes: \$(ps aux | wc -l)\"
      
      # 6. 애플리케이션 실행
      /bin/sh
    '
  "
```

### 1.4 컨테이너 런타임 아키텍처 심화

컨테이너 생태계는 표준화를 통해 상호 운용성을 확보한다. 이는 OCI(Open Container Initiative)와 CRI(Container Runtime Interface)라는 두 가지 핵심 표준을 통해 달성된다.

#### OCI (Open Container Initiative) 표준

OCI는 컨테이너 기술의 개방형 표준을 정의한다. 2015년 Docker와 다른 컨테이너 업계 리더들에 의해 설립된 OCI는 현재 세 가지 사양을 포함한다.

**OCI Runtime Specification (runtime-spec)**
디스크에 압축 해제된 "파일시스템 번들"을 실행하는 방법을 설명한다. 이는 컨테이너가 어떻게 생성되고 실행되어야 하는지를 정의한다.

```json
{
  "ociVersion": "1.0.2",
  "process": {
    "terminal": true,
    "user": {
      "uid": 0,
      "gid": 0
    },
    "args": ["/bin/sh"],
    "env": ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"],
    "cwd": "/",
    "capabilities": {
      "bounding": ["CAP_AUDIT_WRITE", "CAP_KILL", "CAP_NET_BIND_SERVICE"],
      "effective": ["CAP_AUDIT_WRITE", "CAP_KILL", "CAP_NET_BIND_SERVICE"],
      "inheritable": ["CAP_AUDIT_WRITE", "CAP_KILL", "CAP_NET_BIND_SERVICE"],
      "permitted": ["CAP_AUDIT_WRITE", "CAP_KILL", "CAP_NET_BIND_SERVICE"]
    }
  },
  "root": {
    "path": "rootfs",
    "readonly": true
  },
  "linux": {
    "namespaces": [
      {"type": "pid"},
      {"type": "network"},
      {"type": "ipc"},
      {"type": "uts"},
      {"type": "mount"}
    ],
    "cgroupsPath": "/mycontainer"
  }
}
```

**OCI Image Specification (image-spec)**
컨테이너 이미지의 구조와 메타데이터를 정의한다. 레이어화된 파일시스템과 설정 정보를 포함한다.

**OCI Distribution Specification (distribution-spec)**
컨테이너 이미지 배포를 위한 API 프로토콜을 정의한다.

#### CRI (Container Runtime Interface)

CRI는 kubelet이 다양한 컨테이너 런타임을 사용할 수 있게 해주는 플러그인 인터페이스다. gRPC 프로토콜을 통해 kubelet과 컨테이너 런타임 간 통신을 정의한다.

**CRI gRPC 서비스 정의:**
```protobuf
service RuntimeService {
    rpc CreateContainer(CreateContainerRequest) returns (CreateContainerResponse);
    rpc StartContainer(StartContainerRequest) returns (StartContainerResponse);
    rpc StopContainer(StopContainerRequest) returns (StopContainerResponse);
    rpc RemoveContainer(RemoveContainerRequest) returns (RemoveContainerResponse);
    rpc ListContainers(ListContainersRequest) returns (ListContainersResponse);
}

service ImageService {
    rpc PullImage(PullImageRequest) returns (PullImageResponse);
    rpc ListImages(ListImagesRequest) returns (ListImagesResponse);
    rpc RemoveImage(RemoveImageRequest) returns (RemoveImageResponse);
}
```

### 1.5 컨테이너 런타임 계층구조

현대 컨테이너 환경은 명확하게 분리된 계층구조를 가진다.

#### High-level Runtime (사용자 친화적 도구)

**Docker Engine**
- 완전한 컨테이너 플랫폼
- 이미지 빌드, 레지스트리 연동, 네트워킹, 볼륨 관리
- containerd를 기반으로 구축

**Podman**
- 데몬리스 컨테이너 엔진
- rootless 컨테이너 지원
- Docker API 호환성

**nerdctl**
- containerd를 위한 Docker 호환 CLI
- Docker Compose 파일 지원

#### Container Runtime (CRI 호환 중간 계층)

**containerd**
Docker에서 개발하여 CNCF에 기부한 업계 표준 컨테이너 런타임이다. Google Kubernetes Engine과 IBM Kubernetes Service 같은 관리형 쿠버네티스 플랫폼에서 널리 사용된다.

**containerd 아키텍처:**
```
┌─────────────────┐
│   High-level    │  Docker, nerdctl, crictl
│   Clients       │
├─────────────────┤
│   containerd    │  Image management, Container lifecycle
│   daemon        │  Snapshot management, Content store
├─────────────────┤
│   containerd-   │  gRPC shim for each container
│   shim          │
├─────────────────┤
│   runc          │  OCI runtime implementation
└─────────────────┘
```

**CRI-O**
쿠버네티스 전용으로 설계된 OCI 호환 런타임이다. 쿠버네티스에서 Docker를 사용하는 것에 대한 경량화된 대안으로 설계되었다.

**CRI-O 워크플로우:**
1. kubelet이 CRI를 통해 Pod 생성 요청
2. CRI-O가 containers/image 라이브러리로 이미지 풀
3. containers/storage로 컨테이너 루트 파일시스템 생성
4. OCI 런타임 스펙 JSON 파일 생성
5. runc를 호출하여 컨테이너 실행
6. conmon이 각 컨테이너를 모니터링

#### Low-level Runtime (OCI 구현체)

**runc**
runc는 OCI 런타임 사양에 따라 컨테이너를 생성하고 실행하는 CLI 도구다. 2015년 7월에 버전 0.0.1로 처음 출시되었으며 2021년 6월 22일에 버전 1.0.0에 도달했다.

**runc 실습 예제:**
```bash
# 1. OCI 번들 디렉토리 생성
mkdir /tmp/runc-demo && cd /tmp/runc-demo

# 2. 루트 파일시스템 준비
mkdir rootfs
docker export $(docker create busybox) | tar -C rootfs -xvf -

# 3. OCI 런타임 스펙 생성
runc spec

# 4. config.json 수정 (터미널 비활성화)
sed -i 's/"terminal": true/"terminal": false/' config.json

# 5. 컨테이너 실행
runc run mycontainer

# 라이프사이클 기반 실행
runc create mycontainer    # 컨테이너 생성 (created 상태)
runc start mycontainer     # 프로세스 시작
runc list                  # 컨테이너 목록 확인
runc delete mycontainer    # 컨테이너 삭제
```

**crun**
C로 작성된 빠르고 낮은 메모리 사용량의 OCI 컨테이너 런타임이다. crun 바이너리는 runc보다 최대 50배 작고 최대 2배 빠르다.

**kata-runtime & gVisor**
가상화 기반 컨테이너 런타임으로, 더 강한 격리를 제공한다.

### 1.6 실습

#### 실습 1: 계층별 컨테이너 실행

```bash
# 1. runc로 직접 실행
mkdir /tmp/low-level && cd /tmp/low-level
mkdir rootfs
docker export $(docker create alpine) | tar -C rootfs -xvf -
runc spec
runc run test-container

# 2. containerd + nerdctl 실행
nerdctl pull nginx:alpine
nerdctl run -d --name mid-level-test nginx:alpine

# 3. Docker 실행 (비교용)
docker run -d --name high-level-test nginx:alpine
```

#### 실습 2: CRI-O와 crictl 사용

```bash
# crictl로 CRI 인터페이스 테스트
crictl version
crictl images
crictl ps
crictl logs <container-id>
```

#### 실습 3: 컨테이너 런타임 전환

```bash
# containerd로 전환
systemctl stop docker
systemctl start containerd

# CRI-O로 전환
systemctl stop containerd
systemctl start crio
```

## 2. 분산 시스템 이론

### 2.1 분산 시스템의 기본 개념

분산 시스템은 네트워크로 연결된 여러 컴퓨터가 함께 작동하여 서비스를 제공하거나 문제를 해결하는 시스템이다. 쿠버네티스 자체가 분산 시스템이므로 이 개념의 이해는 필수적이다.

**분산 시스템의 특징:**
- **투명성 (Transparency)**: 사용자는 시스템이 분산되어 있다는 것을 인지하지 못함
- **확장성 (Scalability)**: 노드 추가를 통한 성능 향상 가능
- **가용성 (Availability)**: 일부 노드 장애 시에도 서비스 지속
- **일관성 (Consistency)**: 모든 노드가 동일한 데이터 상태 유지

### 2.2 CAP 정리 (CAP Theorem)

CAP 정리는 분산 시스템에서 일관성(Consistency), 가용성(Availability), 분할 내성(Partition Tolerance) 중 최대 두 가지만 동시에 보장할 수 있다고 명시한다.

**Consistency (일관성):**
모든 클라이언트가 연결된 노드에 관계없이 동시에 동일한 데이터를 볼 수 있어야 한다. 한 노드에 데이터가 쓰여지면 다른 모든 노드에 즉시 복제되어야 한다.

**Availability (가용성):**
하나 이상의 노드가 다운되어도 데이터 요청을 하는 모든 클라이언트가 응답을 받을 수 있어야 한다.

**Partition Tolerance (분할 내성):**
분할은 분산 시스템 내의 통신 중단으로, 두 노드 간의 연결이 손실되거나 일시적으로 지연되는 것이다. 분할 내성은 노드 간 통신 중단이 발생해도 클러스터가 계속 작동해야 함을 의미한다.

### 2.3 쿠버네티스와 CAP 정리

쿠버네티스는 CAP 공간에서 가용성(A)과 분할 내성(P)을 보장하는 시스템이다. 네트워크 분할이 발생해도 서비스를 계속 제공하지만, 일시적으로 일관성이 깨질 수 있다.

예를 들어, etcd 클러스터에서 네트워크 분할이 발생하면:
- **리더가 있는 파티션**: 쓰기 작업 계속 가능 (가용성 유지)
- **리더가 없는 파티션**: 읽기 전용 모드 (일관성보다 가용성 우선)

### 2.4 합의 알고리즘

**Raft 알고리즘:**
etcd는 Raft 합의 알고리즘을 사용한다. Raft는 다음 단계로 동작한다:

1. **리더 선출**: 클러스터에서 하나의 리더 노드 선택
2. **로그 복제**: 리더가 모든 변경사항을 팔로워에게 복제
3. **안전성 보장**: 과반수 노드가 합의해야 변경사항 확정

## 3. 네트워킹 기초

### 3.1 TCP/IP와 OSI 모델

쿠버네티스 네트워킹을 이해하려면 네트워크 계층 모델에 대한 이해가 필요하다.

**OSI 7계층과 쿠버네티스:**
- **L3 (Network)**: Pod-to-Pod 통신, CNI 플러그인
- **L4 (Transport)**: Service, kube-proxy의 로드밸런싱
- **L7 (Application)**: Ingress, 애플리케이션 레벨 라우팅

### 3.2 DNS와 Service Discovery

**DNS 기본 개념:**
- A 레코드, CNAME, SRV 레코드
- DNS 캐싱과 TTL

**쿠버네티스 DNS:**
- CoreDNS의 역할
- Service DNS: `<service-name>.<namespace>.svc.cluster.local`
- Pod DNS: `<pod-ip-with-dashes>.<namespace>.pod.cluster.local`

### 3.3 로드 밸런싱

**로드 밸런싱 알고리즘:**
- Round Robin
- Least Connections
- Weighted Round Robin
- IP Hash

쿠버네티스 Service는 기본적으로 랜덤 선택을 사용하며, sessionAffinity를 통해 클라이언트 IP 기반 스티키 세션을 지원한다.

## 4. 인증과 인가 (Authentication & Authorization)

### 4.1 인증 vs 인가

**Authentication (인증):**
- "당신이 누구인가?"를 확인
- 신원 증명 과정

**Authorization (인가):**
- "당신이 무엇을 할 수 있는가?"를 결정
- 권한 부여 과정

### 4.2 쿠버네티스 인증 방식

**X.509 클라이언트 인증서:**
- kubectl과 API 서버 간 상호 TLS 인증
- CN(Common Name)이 사용자명, O(Organization)가 그룹명으로 사용

**Bearer Token:**
- ServiceAccount 토큰
- OIDC 토큰
- Webhook 토큰

### 4.3 RBAC (Role-Based Access Control)

RBAC는 4가지 주요 리소스로 구성된다:

**Role과 ClusterRole:**
- Role: 특정 네임스페이스 내 권한 정의
- ClusterRole: 클러스터 전체 권한 정의

**RoleBinding과 ClusterRoleBinding:**
- 사용자/그룹을 Role/ClusterRole에 바인딩

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: default
  name: pod-reader
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "watch", "list"]
```

## 5. 키-값 저장소 (Key-Value Store)

### 5.1 NoSQL 데이터베이스 기초

**관계형 DB vs NoSQL:**
- ACID vs BASE
- 스키마 유무
- 확장성 차이점

### 5.2 etcd 심화

**etcd의 특징:**
- Raft 기반 분산 합의
- gRPC API 제공
- Watch 기능으로 실시간 변경 감지
- 트랜잭션 지원

**etcd 운영 고려사항:**
- 3, 5, 7개 홀수 노드 권장 (과반수 원칙)
- 디스크 I/O 성능이 중요 (SSD 권장)
- 네트워크 지연시간 최소화

### 5.3 etcd 실습

```bash
# etcd 클러스터 상태 확인
etcdctl --endpoints=https://localhost:2379 \
  --cert=/etc/kubernetes/pki/etcd/peer.crt \
  --key=/etc/kubernetes/pki/etcd/peer.key \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  endpoint health

# 쿠버네티스 리소스 조회
etcdctl --endpoints=https://localhost:2379 \
  --cert=/etc/kubernetes/pki/etcd/peer.crt \
  --key=/etc/kubernetes/pki/etcd/peer.key \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  get /registry/pods/default/ --prefix
```

## 6. API와 REST

### 6.1 REST API 원칙

**HTTP 메서드와 의미:**
- GET: 리소스 조회 (멱등성)
- POST: 리소스 생성
- PUT: 리소스 전체 업데이트 (멱등성)
- PATCH: 리소스 부분 업데이트
- DELETE: 리소스 삭제 (멱등성)

### 6.2 쿠버네티스 API

**API 버전 관리:**
- Alpha (v1alpha1): 불안정, 기본적으로 비활성화
- Beta (v1beta1): 상대적으로 안정, 기본 활성화
- Stable (v1): 안정, 호환성 보장

**API 그룹:**
- Core Group (""): Pod, Service, ConfigMap 등
- Apps Group (apps/v1): Deployment, DaemonSet 등
- Extensions Group: Ingress 등

### 6.3 kubectl과 API 서버

```bash
# kubectl이 실제로 호출하는 REST API 확인
kubectl get pods --v=6

# curl로 직접 API 호출
kubectl proxy --port=8001 &
curl http://localhost:8001/api/v1/pods

# 인증서를 사용한 직접 API 호출
kubectl config view --raw -o jsonpath='{.clusters[0].cluster.server}'
```

