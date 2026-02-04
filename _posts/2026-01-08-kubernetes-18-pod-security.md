---
layout: post
title: "Part 18/26: SecurityContext와 PSA"
date: 2026-01-08
categories: [Kubernetes]
tags: [kubernetes, security, pod-security, securitycontext, psa, cka, cks]
---

Kubernetes에서 Pod와 컨테이너의 보안 설정은 **SecurityContext**와 **Pod Security Admission(PSA)**을 통해 제어한다. 이 기능들은 컨테이너가 호스트 시스템에 미치는 영향을 제한하고, 최소 권한 원칙을 적용하는 데 핵심적이다.

## SecurityContext

### 개념

> **원문 ([kubernetes.io - Security Context](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/)):**
> A security context defines privilege and access control settings for a Pod or Container. Security context settings include discretionary access control, SELinux, running as privileged or unprivileged, Linux Capabilities, and more.

**번역:** 보안 컨텍스트는 Pod 또는 컨테이너에 대한 권한 및 접근 제어 설정을 정의한다. 보안 컨텍스트 설정에는 임의 접근 제어, SELinux, 권한/비권한 실행, Linux Capabilities 등이 포함된다.

SecurityContext는 **Pod와 컨테이너의 권한 및 접근 제어 설정**을 정의한다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: security-pod
spec:
  securityContext:        # Pod 수준 (모든 컨테이너에 적용)
    runAsUser: 1000
    runAsGroup: 3000
    fsGroup: 2000
  containers:
  - name: app
    image: nginx
    securityContext:      # 컨테이너 수준 (이 컨테이너만)
      runAsNonRoot: true
      readOnlyRootFilesystem: true
      allowPrivilegeEscalation: false
      capabilities:
        drop:
        - ALL
```

**적용 우선순위**: 컨테이너 수준 > Pod 수준

### 주요 설정 옵션

#### runAsUser / runAsGroup

컨테이너 프로세스를 실행할 UID/GID를 지정한다.

```yaml
securityContext:
  runAsUser: 1000    # UID 1000으로 실행
  runAsGroup: 3000   # GID 3000으로 실행
```

```bash
# Pod 내부에서 확인
kubectl exec security-pod -- id
# uid=1000 gid=3000 groups=3000,2000
```

#### runAsNonRoot

root(UID 0)로 실행되는 것을 방지한다.

```yaml
securityContext:
  runAsNonRoot: true  # root로 실행 시 컨테이너 시작 실패
```

**이미지가 root로 실행되도록 설정된 경우** (예: nginx 기본 이미지):
- runAsNonRoot: true 설정 시 컨테이너가 시작되지 않음
- runAsUser로 non-root UID를 명시해야 함

#### fsGroup

볼륨에 접근할 때 사용할 supplementary group을 설정한다.

```yaml
securityContext:
  fsGroup: 2000  # 마운트된 볼륨의 그룹 소유권
```

마운트된 볼륨의 파일들이 이 GID 소유로 변경된다.

#### readOnlyRootFilesystem

컨테이너의 루트 파일시스템을 읽기 전용으로 설정한다.

```yaml
securityContext:
  readOnlyRootFilesystem: true
```

**주의**: 로그 파일, 임시 파일을 쓰려면 emptyDir 볼륨을 마운트해야 한다.

```yaml
spec:
  containers:
  - name: app
    image: myapp
    securityContext:
      readOnlyRootFilesystem: true
    volumeMounts:
    - name: tmp
      mountPath: /tmp
    - name: logs
      mountPath: /var/log
  volumes:
  - name: tmp
    emptyDir: {}
  - name: logs
    emptyDir: {}
```

#### allowPrivilegeEscalation

프로세스가 부모보다 더 많은 권한을 얻는 것을 방지한다.

```yaml
securityContext:
  allowPrivilegeEscalation: false  # setuid 비트 등 무효화
```

#### privileged

컨테이너에 모든 호스트 권한을 부여한다. **매우 위험**.

```yaml
securityContext:
  privileged: true  # 호스트의 모든 디바이스 접근 가능
```

**사용 사례**: 네트워크 플러그인, 스토리지 드라이버 등 시스템 컴포넌트에만 필요.

### Linux Capabilities

root 권한을 세분화하여 필요한 것만 부여한다.

```yaml
securityContext:
  capabilities:
    drop:
    - ALL              # 모든 capability 제거
    add:
    - NET_BIND_SERVICE # 1024 미만 포트 바인딩만 허용
```

**주요 Capabilities**:

| Capability | 설명 |
|------------|------|
| NET_BIND_SERVICE | 1024 미만 포트 바인딩 |
| NET_RAW | raw 소켓 사용 |
| SYS_ADMIN | 시스템 관리 권한 (매우 넓음) |
| SYS_PTRACE | 프로세스 추적 |
| SYS_TIME | 시스템 시간 변경 |
| CHOWN | 파일 소유권 변경 |
| DAC_OVERRIDE | 파일 권한 무시 |

**최소 권한 원칙**: `drop: ALL` 후 필요한 것만 `add`.

### seccompProfile

시스템 콜을 제한한다.

```yaml
securityContext:
  seccompProfile:
    type: RuntimeDefault  # 컨테이너 런타임 기본 프로파일
    # 또는
    # type: Localhost
    # localhostProfile: profiles/custom.json
```

**type 옵션**:
- `Unconfined`: 제한 없음 (기본값)
- `RuntimeDefault`: 런타임(containerd, CRI-O)의 기본 프로파일
- `Localhost`: 노드의 커스텀 프로파일

### 완전한 보안 설정 예시

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-pod
spec:
  securityContext:
    runAsUser: 1000
    runAsGroup: 3000
    fsGroup: 2000
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: app
    image: myapp:1.0
    securityContext:
      runAsNonRoot: true
      readOnlyRootFilesystem: true
      allowPrivilegeEscalation: false
      capabilities:
        drop:
        - ALL
    volumeMounts:
    - name: tmp
      mountPath: /tmp
  volumes:
  - name: tmp
    emptyDir: {}
```

## Pod Security Admission (PSA)

### 개념

> **원문 ([kubernetes.io - Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)):**
> Pod Security Standards define three different policies to broadly cover the security spectrum. These policies are cumulative and range from highly-permissive to highly-restrictive.

**번역:** Pod Security Standards는 보안 스펙트럼을 광범위하게 다루는 세 가지 정책을 정의한다. 이러한 정책은 누적되며 매우 허용적인 것부터 매우 제한적인 것까지 범위가 있다.

**Pod Security Admission**은 Kubernetes 1.25+에서 기본으로 활성화된 Admission Controller이다. PodSecurityPolicy(PSP)를 대체한다.

PSA는 **Pod Security Standards(PSS)**를 기준으로 Pod의 보안 설정을 검증한다.

### Pod Security Standards (PSS)

세 가지 수준(Level)을 정의한다:

| Level | 설명 | 사용 사례 |
|-------|------|----------|
| Privileged | 제한 없음 | 시스템 컴포넌트 |
| Baseline | 알려진 권한 상승 방지 | 대부분의 워크로드 |
| Restricted | 강화된 보안 | 민감한 워크로드 |

### PSA 모드

| Mode | 동작 |
|------|------|
| enforce | 위반 시 Pod 생성 거부 |
| audit | 위반 시 감사 로그에 기록 |
| warn | 위반 시 경고 메시지 출력 |

### Namespace에 PSA 적용

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    # enforce 모드로 restricted 수준 적용
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    # audit 모드도 함께 적용
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/audit-version: latest
    # warn 모드도 함께 적용
    pod-security.kubernetes.io/warn: restricted
    pod-security.kubernetes.io/warn-version: latest
```

```bash
# 기존 namespace에 라벨 추가
kubectl label namespace production \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/warn=restricted
```

### PSS 각 수준의 제한 사항

**Baseline**이 차단하는 것:
- hostNetwork, hostPID, hostIPC
- privileged 컨테이너
- 특정 위험한 capabilities (NET_RAW 등은 허용)
- hostPath 볼륨 (일부)
- /proc mount propagation

**Restricted**가 추가로 제한하는 것:
- root(UID 0)로 실행
- privilege escalation
- 모든 capabilities (drop: ALL 필요)
- 모든 hostPath 볼륨
- seccomp 프로파일 필수 (RuntimeDefault 이상)

### Restricted 수준 호환 Pod

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: restricted-compliant
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: app
    image: myapp:1.0
    securityContext:
      allowPrivilegeEscalation: false
      capabilities:
        drop:
        - ALL
```

### PSA 예외 처리

특정 리소스나 사용자를 예외 처리할 수 있다.

```yaml
# AdmissionConfiguration으로 설정
apiVersion: apiserver.config.k8s.io/v1
kind: AdmissionConfiguration
plugins:
- name: PodSecurity
  configuration:
    apiVersion: pod-security.admission.config.k8s.io/v1
    kind: PodSecurityConfiguration
    defaults:
      enforce: baseline
      enforce-version: latest
    exemptions:
      usernames:
      - system:serviceaccount:kube-system:*
      namespaces:
      - kube-system
      runtimeClasses:
      - special-runtime
```

## 실전 보안 설정 패턴

### 최소 권한 Pod

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: minimal-privileges
spec:
  automountServiceAccountToken: false  # SA 토큰 마운트 안 함
  securityContext:
    runAsUser: 65534    # nobody
    runAsGroup: 65534
    fsGroup: 65534
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: app
    image: distroless/static:latest
    securityContext:
      runAsNonRoot: true
      readOnlyRootFilesystem: true
      allowPrivilegeEscalation: false
      capabilities:
        drop:
        - ALL
    resources:
      limits:
        cpu: "100m"
        memory: "128Mi"
```

### 네트워크 애플리케이션

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: network-app
spec:
  securityContext:
    runAsUser: 1000
    runAsGroup: 1000
  containers:
  - name: web
    image: nginx:unprivileged  # non-root nginx
    securityContext:
      allowPrivilegeEscalation: false
      capabilities:
        drop:
        - ALL
        add:
        - NET_BIND_SERVICE  # 80 포트 사용 시
```

### 시스템 컴포넌트 (예: CNI)

```yaml
# Privileged가 필요한 경우 (최소화)
apiVersion: v1
kind: Pod
metadata:
  name: cni-installer
spec:
  hostNetwork: true
  containers:
  - name: cni
    image: calico/cni
    securityContext:
      privileged: true  # 필요한 경우에만
```

## 트러블슈팅

### Pod 생성 실패 (PSA)

```bash
# 에러 예시
Error from server (Forbidden): pods "test" is forbidden: violates PodSecurity "restricted:latest":
allowPrivilegeEscalation != false, unrestricted capabilities, runAsNonRoot != true

# 해결: Pod 보안 설정 수정
securityContext:
  runAsNonRoot: true
  allowPrivilegeEscalation: false
  capabilities:
    drop:
    - ALL
```

### 컨테이너가 root로 실행되는 경우

```bash
# 이미지 기본 사용자 확인
docker inspect nginx:latest | grep -i user
# "User": ""  → root로 실행됨

# 해결 1: runAsUser 지정
securityContext:
  runAsUser: 1000

# 해결 2: non-root 이미지 사용
image: nginx:unprivileged
# 또는
image: bitnami/nginx  # non-root by default
```

### readOnlyRootFilesystem으로 인한 실패

```bash
# 에러: Read-only file system
# 해결: 쓰기가 필요한 경로에 emptyDir 마운트
volumeMounts:
- name: tmp
  mountPath: /tmp
- name: cache
  mountPath: /var/cache/nginx
volumes:
- name: tmp
  emptyDir: {}
- name: cache
  emptyDir: {}
```

## 기술 면접 대비

### 자주 묻는 질문

**Q: Pod SecurityContext와 Container SecurityContext의 차이는?**

A: Pod SecurityContext는 모든 컨테이너에 공통으로 적용되고, Container SecurityContext는 특정 컨테이너에만 적용된다. 같은 설정이 둘 다 있으면 컨테이너 수준 설정이 우선한다. fsGroup 같은 일부 설정은 Pod 수준에서만 가능하고, capabilities 같은 설정은 컨테이너 수준에서만 가능하다.

**Q: allowPrivilegeEscalation: false의 효과는?**

A: 컨테이너 내 프로세스가 부모 프로세스보다 더 많은 권한을 얻는 것을 방지한다. setuid/setgid 비트가 있는 실행 파일이나 no_new_privs 플래그를 설정한다. 이를 통해 컨테이너 탈출이나 권한 상승 공격을 방어할 수 있다.

**Q: Pod Security Standards의 Baseline과 Restricted 차이는?**

A: Baseline은 알려진 권한 상승을 막는 최소한의 정책이다. privileged 컨테이너, hostNetwork, hostPID 등을 차단하지만 root 실행은 허용한다. Restricted는 추가로 root 실행 차단, 모든 capabilities drop, seccomp 프로파일 필수 등 더 엄격한 정책을 적용한다. 대부분의 워크로드는 Baseline으로 시작하고, 민감한 환경은 Restricted를 적용한다.

**Q: readOnlyRootFilesystem의 보안상 이점은?**

A: 공격자가 컨테이너에 침투해도 파일시스템에 악성 파일을 쓸 수 없다. 웹쉘 설치, 악성 스크립트 저장 등을 방지한다. 컨테이너의 불변성(immutability)을 보장하여 보안 베이스라인을 유지할 수 있다.

**Q: Linux Capabilities를 drop: ALL 후 add하는 이유는?**

A: 최소 권한 원칙을 적용하기 위해서다. 기본적으로 컨테이너는 많은 capabilities를 가지고 있어 불필요한 권한이 포함된다. 모두 제거한 후 꼭 필요한 것만 추가하면 공격 표면을 최소화할 수 있다.

---

## 참고 자료

### 공식 문서

- [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- [Pod Security Admission](https://kubernetes.io/docs/concepts/security/pod-security-admission/)
- [Configure a Security Context for a Pod or Container](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/)
- [Set capabilities for a Container](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/#set-capabilities-for-a-container)

## CKA 시험 대비 필수 명령어

```bash
# Pod 보안 컨텍스트 확인
kubectl get pod <pod> -o jsonpath='{.spec.securityContext}'
kubectl get pod <pod> -o jsonpath='{.spec.containers[0].securityContext}'

# Namespace PSA 라벨 확인
kubectl get namespace -L pod-security.kubernetes.io/enforce

# Namespace에 PSA 적용
kubectl label namespace <ns> pod-security.kubernetes.io/enforce=restricted
kubectl label namespace <ns> pod-security.kubernetes.io/warn=baseline

# Pod 내부에서 현재 사용자 확인
kubectl exec <pod> -- id
kubectl exec <pod> -- whoami
```

### CKA 빈출 시나리오

```yaml
# 시나리오 1: non-root로 실행하는 Pod
apiVersion: v1
kind: Pod
metadata:
  name: nonroot-pod
spec:
  securityContext:
    runAsUser: 1000
    runAsGroup: 3000
  containers:
  - name: app
    image: busybox
    command: ["sleep", "3600"]
    securityContext:
      runAsNonRoot: true

# 시나리오 2: 읽기 전용 파일시스템 + 쓰기 볼륨
apiVersion: v1
kind: Pod
metadata:
  name: readonly-pod
spec:
  containers:
  - name: app
    image: nginx
    securityContext:
      readOnlyRootFilesystem: true
    volumeMounts:
    - name: cache
      mountPath: /var/cache/nginx
    - name: run
      mountPath: /var/run
  volumes:
  - name: cache
    emptyDir: {}
  - name: run
    emptyDir: {}

# 시나리오 3: 최소 capabilities
apiVersion: v1
kind: Pod
metadata:
  name: minimal-cap-pod
spec:
  containers:
  - name: app
    image: nginx
    securityContext:
      capabilities:
        drop:
        - ALL
        add:
        - NET_BIND_SERVICE
```

## 다음 단계

- [Kubernetes - Admission Controller](/kubernetes/kubernetes-19-admission-controller)
- [Kubernetes - 클러스터 유지보수](/kubernetes/kubernetes-20-cluster-maintenance)
