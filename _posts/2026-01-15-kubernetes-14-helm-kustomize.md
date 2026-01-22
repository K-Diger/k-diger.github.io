---
title: "Part 14: Helm과 Kustomize - 배포 자동화"
date: 2026-01-15
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, Helm, Kustomize, Deployment]
layout: post
toc: true
math: true
mermaid: true
---

# Part 14: 배포 자동화

## 배포 전략

**Rolling Update**:

- 점진적 교체
- 무중단 배포
- Deployment의 기본 전략

**Blue-Green**:

- 두 환경 유지
- 즉시 전환
- 롤백 용이

**Canary**:

- 일부 트래픽만 신버전
- 점진적 확대
- 위험 최소화

**A/B Testing**:

- 사용자 그룹별 다른 버전
- 기능 검증

---

## Helm - Kubernetes 패키지 매니저

### Helm 개요

Helm은 Kubernetes의 패키지 매니저로, 애플리케이션을 Chart라는 패키지 형태로 관리한다.

**핵심 구성요소 관계도:**

```
┌─────────────────────────────────────────────────────────────┐
│                      Helm Repository                        │
│  (Chart 저장소 - 예: bitnami, argo)                          │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │  nginx   │  │  mysql   │  │ argo-cd  │  ...             │
│  │  Chart   │  │  Chart   │  │  Chart   │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────────────────────────────────────────┘
        │                │                │
        │ helm pull      │                │
        │ helm install   │                │
        ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                       │
│                                                             │
│  Chart 1 (nginx)           Chart 2 (mysql)                  │
│  ┌─────────────────┐      ┌─────────────────┐              │
│  │  Release:       │      │  Release:       │              │
│  │  "web-server"   │      │  "my-database"  │              │
│  │                 │      │                 │              │
│  │  Resources:     │      │  Resources:     │              │
│  │  - Deployment   │      │  - StatefulSet  │              │
│  │  - Service      │      │  - Service      │              │
│  │  - ConfigMap    │      │  - PVC          │              │
│  │                 │      │                 │              │
│  │  Values:        │      │  Values:        │              │
│  │  replicas: 3    │      │  storage: 10Gi  │              │
│  │  port: 80       │      │  password: ***  │              │
│  └─────────────────┘      └─────────────────┘              │
│                                                             │
│  동일 Chart로 여러 Release 생성 가능                          │
│  Chart (nginx) → Release: web-server, api-server, ...      │
└─────────────────────────────────────────────────────────────┘
```

**개념 설명:**

1. **Chart (차트)**
   - Kubernetes 애플리케이션을 정의하는 패키지
   - 템플릿 파일들의 모음 (Deployment, Service 등)
   - 비유: 요리 레시피 (재료 목록과 조리 방법)

2. **Repository (저장소)**
   - Chart를 저장하고 공유하는 곳
   - 비유: 앱스토어 (여러 앱을 다운로드할 수 있는 곳)
   - 예시: `bitnami`, `argo`, `prometheus-community`

3. **Release (릴리스)**
   - Chart를 실제로 클러스터에 설치한 인스턴스
   - 각 Release는 고유한 이름을 가짐
   - 비유: 레시피로 만든 실제 요리 (하나의 레시피로 여러 번 요리 가능)
   - 예시: `nginx` Chart → `web-server`, `api-server` Release 생성

4. **Values (설정값)**
   - Chart를 커스터마이징하는 변수들
   - 비유: 레시피의 재료 양 조절 (매운맛 조절, 양 조절)
   - 예시: `replicaCount: 3`, `service.type: LoadBalancer`

**작동 방식:**

```
1. Repository 추가
   helm repo add bitnami https://charts.bitnami.com/bitnami

   [로컬 환경]                    [Bitnami Repository]
   helm 클라이언트  <─── 연결 ───>  nginx, mysql, redis...

2. Chart 검색
   helm search repo nginx

   [로컬 환경]
   "bitnami repository에서 nginx 검색"
   결과: bitnami/nginx (버전 15.0.0, 15.1.0, ...)

3. Chart 설치 (Release 생성)
   helm install my-nginx bitnami/nginx

   [Chart]                 [Release]              [K8s Resources]
   nginx Chart  ────>  my-nginx Release  ────>  Deployment
   (템플릿)              (인스턴스)              Service
                                                ConfigMap

4. Values로 커스터마이징
   helm install my-nginx bitnami/nginx --set replicaCount=3

   [Chart 기본값]           [사용자 Values]         [최종 결과]
   replicaCount: 1    +    replicaCount: 3    =   3개 Pod 생성
   service.type: ClusterIP                         ClusterIP
```

---

### Helm Repository 관리

```bash
# Repository 추가
helm repo add <REPO_NAME> <REPO_URL>
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add argo https://argoproj.github.io/argo-helm

# Repository 목록 확인
helm repo list

# Repository 인덱스 업데이트 (필수!)
helm repo update

# Repository에서 Chart 검색
helm search repo nginx
helm search repo nginx --versions          # 모든 버전 확인
helm search repo bitnami/nginx --version 15.0.0

# Repository 제거
helm repo remove bitnami
```

**명령어 상세 설명:**

**1. `helm repo add <REPO_NAME> <REPO_URL>`**
- **용도**: 외부 Helm Chart Repository를 로컬 환경에 등록
- **사용사례**:
  - 시험에서 특정 Chart를 설치하라는 문제가 나올 때 가장 먼저 실행
  - 예: "Install nginx using bitnami chart" → bitnami repo를 먼저 추가해야 함
- **주의사항**:
  - Repository 이름(`<REPO_NAME>`)은 자유롭게 지정 가능하지만, 문제에서 특정 이름을 요구할 수 있음
  - URL을 정확히 입력해야 함 (보통 문제에 제공됨)
- **실전 팁**:
  - 시험에서는 repository URL이 이미 제공되므로 복사-붙여넣기 활용
  - 예: `helm repo add stable https://charts.helm.sh/stable`

**2. `helm repo list`**
- **용도**: 현재 등록된 모든 Repository 목록 확인
- **사용사례**:
  - 특정 repo가 이미 추가되어 있는지 확인할 때
  - 문제 풀기 전 환경 상태를 파악할 때
- **출력 예시**:
  ```
  NAME        URL
  bitnami     https://charts.bitnami.com/bitnami
  argo        https://argoproj.github.io/argo-helm
  ```

**3. `helm repo update`**
- **용도**: 모든 등록된 Repository의 최신 Chart 정보를 다운로드
- **사용사례**:
  - Repository를 추가한 직후 **반드시** 실행
  - Chart 검색이나 설치 전에 항상 실행 (최신 버전 정보 동기화)
- **시험 필수 절차**:
  ```bash
  helm repo add bitnami https://charts.bitnami.com/bitnami
  helm repo update              # 이 단계를 건너뛰면 안 됨!
  helm search repo bitnami/nginx
  ```
- **왜 필수인가**:
  - repo를 추가만 하면 로컬에 Chart 목록이 없음
  - update를 해야 실제 사용 가능한 Chart 정보가 로컬에 캐시됨
- **실전 팁**: "Chart를 찾을 수 없다"는 에러가 나면 `helm repo update`를 먼저 실행

**4. `helm search repo <CHART>`**
- **용도**: 로컬에 추가한 Repository에서 Chart 검색
- **사용사례**:
  - 설치 가능한 Chart가 있는지 확인할 때
  - 특정 Chart의 사용 가능한 버전을 확인할 때
- **주요 옵션**:
  - `--versions`: 해당 Chart의 모든 버전 표시
    ```bash
    helm search repo nginx --versions
    # 출력: nginx의 모든 버전 (15.0.0, 14.1.2, 14.0.1 등)
    ```
  - `--version <VERSION>`: 특정 버전만 검색
    ```bash
    helm search repo bitnami/nginx --version 15.0.0
    # 출력: nginx 15.0.0 버전만 표시
    ```
- **검색 패턴**:
  - `helm search repo nginx`: 모든 repo에서 "nginx" 검색
  - `helm search repo bitnami/nginx`: bitnami repo에서만 nginx 검색 (더 정확함)
- **실전 팁**:
  - 문제에서 특정 버전을 요구하면 `--versions`로 해당 버전이 있는지 먼저 확인
  - Chart 이름은 `<repo명>/<chart명>` 형식으로 사용 (예: `bitnami/nginx`)

**`helm search repo` vs `helm search hub`**

```
┌─────────────────────────────────────────────────────────────────┐
│                     helm search repo                            │
│  (로컬에 추가한 Repository에서만 검색)                            │
│                                                                 │
│  [로컬 환경]                                                     │
│  ┌──────────────┐                                              │
│  │ helm 클라이언트 │                                              │
│  │              │                                              │
│  │ 등록된 repo:  │                                              │
│  │ - bitnami    │  ← 이 목록에서만 검색                          │
│  │ - argo       │                                              │
│  └──────────────┘                                              │
│                                                                 │
│  예시: helm search repo nginx                                   │
│  결과: bitnami/nginx, 다른 로컬 repo의 nginx만 검색              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     helm search hub                             │
│  (Artifact Hub - 전 세계 공개 Repository 검색)                   │
│                                                                 │
│  [로컬 환경]           [인터넷]        [Artifact Hub]           │
│  ┌──────────────┐     ───>      ┌─────────────────────┐       │
│  │ helm 클라이언트 │              │  https://           │       │
│  │              │              │  artifacthub.io     │       │
│  └──────────────┘              │                     │       │
│                                │ - bitnami charts    │       │
│                                │ - stable charts     │       │
│                                │ - prometheus charts │       │
│                                │ - 수천 개의 charts... │       │
│                                └─────────────────────┘       │
│                                                                 │
│  예시: helm search hub nginx                                    │
│  결과: 전 세계 모든 공개 repo의 nginx 검색                        │
└─────────────────────────────────────────────────────────────────┘
```

**비교표:**

| 특징 | `helm search repo` | `helm search hub` |
|------|-------------------|-------------------|
| **검색 범위** | 로컬에 추가한 Repository만 | Artifact Hub의 모든 공개 Repository |
| **인터넷 필요** | 불필요 (로컬 캐시 검색) | 필요 |
| **사전 작업** | `helm repo add` 필수 | 불필요 |
| **검색 속도** | 빠름 | 느림 (네트워크 요청) |
| **결과 양** | 적음 (추가한 repo만) | 많음 (수천 개) |
| **사용 시기** | 이미 알고 있는 repo에서 Chart 찾을 때 | 새로운 Chart 발견할 때 |

**실제 사용 예시:**

```bash
# 1. helm search repo (로컬 검색)
# 먼저 repo를 추가해야 함
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# 로컬에 추가한 repo에서만 검색
helm search repo nginx
# 출력:
# NAME                CHART VERSION   APP VERSION     DESCRIPTION
# bitnami/nginx       15.0.0          1.21.0          NGINX Open Source...

# 2. helm search hub (전역 검색)
# repo 추가 없이 바로 검색 가능
helm search hub nginx
# 출력:
# URL                                                     CHART VERSION   APP VERSION     DESCRIPTION
# https://artifacthub.io/packages/helm/bitnami/nginx      15.0.0          1.21.0          NGINX Open Source...
# https://artifacthub.io/packages/helm/stable/nginx       12.0.0          1.19.0          ...
# https://artifacthub.io/packages/helm/nginx-inc/nginx    1.0.0           ...             ...
# ... (수십 개의 결과)
```

**활용:**

**상황 1: 특정 Chart 설치 (repo를 알고 있을 때)**
```bash
# 빠르고 정확한 방법
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
helm search repo bitnami/nginx --versions
helm install my-nginx bitnami/nginx --version 15.0.0
```

**상황 2: 어떤 Chart가 있는지 탐색**
```bash
# 먼저 hub에서 검색해서 어떤 repo가 좋은지 확인
helm search hub prometheus

# 출력에서 적절한 repo 찾기
# URL: https://artifacthub.io/packages/helm/prometheus-community/prometheus

# 해당 repo 추가
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# 이후 로컬에서 빠르게 검색
helm search repo prometheus-community/prometheus
```

**CKA 시험에서:**
- `helm search repo` 사용 (시험 환경에서 인터넷 제한적)
- Repository URL은 문제에서 제공됨
- 순서: `helm repo add` → `helm repo update` → `helm search repo`

**5. `helm repo remove <REPO_NAME>`**
- **용도**: 등록된 Repository 제거
- **사용사례**: CKA 시험에서는 거의 사용 안 함 (정리 작업 시)
- **예시**: `helm repo remove bitnami`

**실전 예시:**

```bash
# Mock Exam 1 - Q.12: Helm Repository 업데이트 후 특정 버전으로 업그레이드
helm list -n kk-ns
helm repo update
helm search repo kk-mock1/nginx --versions
helm upgrade kk-mock1 kk-mock1/nginx -n kk-ns --version 18.1.15
```

---

### Helm Chart 설치 및 관리

```bash
# Chart 설치
helm install <RELEASE_NAME> <CHART> [flags]
helm install my-nginx bitnami/nginx
helm install my-nginx bitnami/nginx --namespace web --create-namespace
helm install my-nginx bitnami/nginx --version 15.0.0
helm install my-nginx bitnami/nginx --set replicaCount=3
helm install my-nginx bitnami/nginx -f custom-values.yaml

# 설치 시 CRD 제외 (ArgoCD 등)
helm install argo argo/argo-cd --version 7.7.3 \
  --namespace argocd --set crds.install=false

# Release 목록 확인
helm list                                  # 현재 namespace
helm list -A                               # 모든 namespace
helm list -n production                    # 특정 namespace
helm list --all-namespaces

# Release 상태 확인
helm status <RELEASE_NAME>
helm status my-nginx -n web

# Release 정보 조회
helm get all <RELEASE_NAME>                # 모든 정보
helm get values <RELEASE_NAME>             # 사용자 정의 values
helm get manifest <RELEASE_NAME>           # 생성된 Kubernetes manifest
helm get notes <RELEASE_NAME>              # 설치 후 안내 메시지
helm get hooks <RELEASE_NAME>              # Helm hook 정보
```

**명령어 상세 설명:**

**1. `helm install <RELEASE_NAME> <CHART>`** (핵심 명령어)
- **용도**: Helm Chart를 Kubernetes 클러스터에 설치
- **Release란?**: Chart를 설치한 인스턴스의 이름 (동일 Chart를 여러 번 설치 가능)
- **기본 사용**:
  ```bash
  helm install my-nginx bitnami/nginx
  # my-nginx: Release 이름 (자유롭게 지정)
  # bitnami/nginx: Chart 이름 (repo명/chart명)
  ```

**주요 옵션:**

**a) `--namespace <NS>` + `--create-namespace`**
- **용도**: 특정 namespace에 설치, namespace가 없으면 자동 생성
- **사용사례**: 거의 모든 문제에서 namespace 지정이 요구됨
- **예시**:
  ```bash
  helm install my-app bitnami/nginx --namespace production --create-namespace
  # production namespace가 없으면 자동으로 생성하고 그 안에 설치
  ```
- **주의**: `--namespace`만 쓰면 namespace가 없을 때 에러 발생
- **실전 팁**: 시험에서는 거의 항상 `--create-namespace`와 함께 사용

**b) `--version <VERSION>`**
- **용도**: 특정 Chart 버전 설치
- **사용사례**: 문제에서 특정 버전을 명시할 때 (매우 자주 나옴)
- **예시**:
  ```bash
  helm install my-nginx bitnami/nginx --version 15.0.0
  ```
- **실전 팁**:
  - 버전을 지정하지 않으면 최신 버전이 설치됨
  - 시험에서 특정 버전을 요구하면 반드시 `--version` 사용

**c) `--set <KEY>=<VALUE>`**
- **용도**: Chart의 values.yaml 값을 명령줄에서 직접 오버라이드
- **사용사례**: 간단한 값 하나만 변경할 때
- **예시**:
  ```bash
  helm install my-nginx bitnami/nginx --set replicaCount=3
  helm install my-nginx bitnami/nginx --set service.type=LoadBalancer
  helm install my-nginx bitnami/nginx --set image.tag=1.21.0
  ```
- **여러 값 설정**:
  ```bash
  helm install my-nginx bitnami/nginx \
    --set replicaCount=3 \
    --set service.type=NodePort \
    --set service.nodePort=30080
  ```
- **실전 팁**: 중첩된 값은 점(`.`)으로 구분

**d) `-f <VALUES_FILE>` 또는 `--values <VALUES_FILE>`**
- **용도**: 사용자 정의 values 파일로 여러 값을 한 번에 오버라이드
- **사용사례**: 많은 값을 변경해야 할 때
- **예시**:
  ```bash
  # custom-values.yaml 파일 생성 후
  helm install my-nginx bitnami/nginx -f custom-values.yaml
  ```
- **custom-values.yaml 예시**:
  ```yaml
  replicaCount: 3
  service:
    type: LoadBalancer
    port: 8080
  image:
    tag: "1.21.0"
  ```

**e) `--dry-run --debug`**
- **용도**: 실제 설치 없이 생성될 manifest를 미리 확인 (매우 유용!)
- **사용사례**:
  - 설치 전 어떤 리소스가 생성될지 확인
  - values 설정이 올바른지 검증
  - 문법 오류 확인
- **예시**:
  ```bash
  helm install my-nginx bitnami/nginx --dry-run --debug
  # 실제 설치는 안 되고, 생성될 YAML만 출력됨
  ```
- **실전 팁**: 복잡한 설정일 때 먼저 dry-run으로 확인 후 실제 설치

**2. `helm list` (또는 `helm ls`)**
- **용도**: 설치된 Release 목록 확인
- **기본 사용**: 현재 namespace의 Release만 표시
  ```bash
  helm list
  ```
- **주요 옵션**:
  - `-A` 또는 `--all-namespaces`: 모든 namespace의 Release 표시
    ```bash
    helm list -A
    # 출력: 모든 namespace의 모든 Release
    ```
  - `-n <NAMESPACE>`: 특정 namespace의 Release만 표시
    ```bash
    helm list -n production
    ```
- **출력 정보**:
  ```
  NAME        NAMESPACE   REVISION  UPDATED                   STATUS    CHART          APP VERSION
  my-nginx    default     1         2026-01-15 10:30:00 KST   deployed  nginx-15.0.0   1.21.0
  ```
  - `REVISION`: 업그레이드 횟수 (1부터 시작, 업그레이드마다 증가)
  - `STATUS`: deployed, failed, pending 등
- **실전 팁**:
  - 문제에서 "기존 Release를 찾아서..."라고 하면 `helm list -A`로 먼저 확인
  - Release 이름과 namespace를 정확히 파악하는 것이 중요

**3. `helm status <RELEASE_NAME>`**
- **용도**: 특정 Release의 상태와 설치 정보 확인
- **사용사례**:
  - Release가 정상적으로 배포되었는지 확인
  - Pod가 Running 상태인지 확인
  - 설치 후 안내 메시지(NOTES) 다시 보기
- **예시**:
  ```bash
  helm status my-nginx -n production
  ```
- **출력 내용**:
  - Release 상태 (deployed, failed 등)
  - 마지막 배포 시간
  - 설치된 리소스 정보
  - NOTES (설치 후 안내 메시지)

**4. `helm get` 명령어 그룹**

**a) `helm get values <RELEASE_NAME>`** (유용)
- **용도**: 사용자가 설정한 값(오버라이드한 값)만 확인
- **사용사례**:
  - 어떤 값을 커스터마이징했는지 확인
  - 업그레이드 시 기존 설정 확인
- **예시**:
  ```bash
  helm get values my-nginx -n production
  # 출력: replicaCount: 3, service.type: LoadBalancer 등
  ```
- **옵션**:
  - `-a` 또는 `--all`: 모든 값(기본값 포함) 표시
    ```bash
    helm get values my-nginx -a
    ```

**b) `helm get manifest <RELEASE_NAME>`**
- **용도**: 실제로 생성된 Kubernetes manifest YAML 확인
- **사용사례**:
  - 정확히 어떤 리소스가 생성되었는지 확인
  - Deployment, Service, ConfigMap 등의 실제 스펙 확인
- **예시**:
  ```bash
  helm get manifest my-nginx -n production
  # 출력: Deployment, Service 등의 전체 YAML
  ```

**c) `helm get notes <RELEASE_NAME>`**
- **용도**: 설치 후 안내 메시지 다시 보기
- **사용사례**:
  - 설치 후 추가 작업이 필요한지 확인
  - Service URL, 접속 방법 등 확인
- **예시**:
  ```bash
  helm get notes my-nginx
  # 출력: "Service URL: http://...", "로그인 정보: ..." 등
  ```

**d) `helm get all <RELEASE_NAME>`**
- **용도**: 위의 모든 정보(values, manifest, notes, hooks)를 한 번에 확인
- **사용사례**: Release에 대한 전체 정보가 필요할 때

**실전 예시:**

```bash
# Practice Question - Q.1: ArgoCD Helm Chart 템플릿 생성
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
helm template argo argo/argo-cd --version 7.7.3 \
  --namespace argocd --set crds.install=false > /home/argo/argo-helm.yaml
```

---

### Helm Chart 업그레이드 및 롤백

```bash
# Chart 업그레이드
helm upgrade <RELEASE_NAME> <CHART> [flags]
helm upgrade my-nginx bitnami/nginx --version 15.1.0
helm upgrade my-nginx bitnami/nginx --set replicaCount=5
helm upgrade my-nginx bitnami/nginx -f new-values.yaml
helm upgrade my-nginx bitnami/nginx --reuse-values    # 기존 values 유지

# Dry-run으로 변경사항 미리 확인
helm upgrade my-nginx bitnami/nginx --dry-run --debug

# Release History 확인
helm history <RELEASE_NAME>
helm history my-nginx -n web

# 특정 리비전으로 롤백
helm rollback <RELEASE_NAME> <REVISION>
helm rollback my-nginx 1                   # 리비전 1로 롤백
helm rollback my-nginx 0                   # 직전 리비전으로 롤백

# Release 삭제
helm uninstall <RELEASE_NAME>
helm uninstall my-nginx
helm uninstall my-nginx -n web --keep-history  # 히스토리 유지
```

**명령어 상세 설명:**

**1. `helm upgrade <RELEASE_NAME> <CHART>`**
- **용도**: 이미 설치된 Release를 새 버전 또는 새 설정으로 업그레이드
- **사용사례**:
  - Chart를 새 버전으로 업데이트할 때
  - 설정 값(replicas, image 등)을 변경할 때
  - 문제에서 "Upgrade the release to version X" 같은 요구사항
- **기본 동작**: Rolling Update로 무중단 배포

**주요 옵션:**

**a) `--version <VERSION>`**
- **용도**: Chart를 특정 버전으로 업그레이드
- **예시**:
  ```bash
  # 현재 15.0.0 → 15.1.0으로 업그레이드
  helm upgrade my-nginx bitnami/nginx --version 15.1.0 -n production
  ```
- **실전 팁**:
  - 문제에서 "Upgrade to version X"라고 하면 반드시 `--version` 사용
  - 버전을 생략하면 최신 버전으로 업그레이드됨 (의도하지 않은 결과 가능)

**b) `--set <KEY>=<VALUE>`**
- **용도**: 설정 값만 변경 (Chart 버전은 그대로)
- **예시**:
  ```bash
  # replica 수만 3개에서 5개로 증가
  helm upgrade my-nginx bitnami/nginx --set replicaCount=5
  ```
- **주의**: 이전에 설정한 다른 값들은 그대로 유지됨

**c) `--reuse-values`** (중요)
- **용도**: 이전 업그레이드/설치 시 사용한 값을 그대로 유지
- **사용사례**:
  - Chart 버전만 올리고 기존 설정은 그대로 유지하고 싶을 때
  - 기존에 `--set`으로 설정한 값들을 잃고 싶지 않을 때
- **예시**:
  ```bash
  # 기존: helm install my-nginx bitnami/nginx --set replicaCount=3
  # 업그레이드 시 replicaCount=3을 유지하면서 버전만 올림
  helm upgrade my-nginx bitnami/nginx --version 15.1.0 --reuse-values
  ```
- **주의사항**:
  - `--reuse-values` 없이 upgrade하면 기본값으로 돌아감!
  - 새로운 `--set`과 함께 쓰면 해당 값만 오버라이드됨

**d) `-f <VALUES_FILE>` 또는 `--values <VALUES_FILE>`**
- **용도**: 새로운 values 파일로 업그레이드
- **예시**:
  ```bash
  helm upgrade my-nginx bitnami/nginx -f production-values.yaml
  ```

**e) `--dry-run --debug`**
- **용도**: 업그레이드를 실제로 하지 않고 변경사항만 미리 확인
- **사용사례**:
  - 업그레이드 전 어떤 리소스가 변경될지 확인
  - 설정이 올바른지 검증
- **예시**:
  ```bash
  helm upgrade my-nginx bitnami/nginx --version 15.1.0 --dry-run --debug
  ```
- **실전 팁**: 복잡한 업그레이드일 때 반드시 dry-run으로 먼저 확인!

**f) Namespace 지정**
- **주의**: upgrade 시에도 `-n <NAMESPACE>` 반드시 필요
  ```bash
  helm upgrade my-nginx bitnami/nginx --version 15.1.0 -n production
  ```

**2. `helm history <RELEASE_NAME>`** (롤백 전 필수)
- **용도**: Release의 모든 업그레이드 이력(revision) 확인
- **사용사례**:
  - 롤백할 revision 번호를 찾을 때
  - 각 revision에서 무엇이 변경되었는지 확인
- **예시**:
  ```bash
  helm history my-nginx -n production
  ```
- **출력 예시**:
  ```
  REVISION  UPDATED                   STATUS      CHART          APP VERSION  DESCRIPTION
  1         Mon Jan 15 10:00:00 2026  superseded  nginx-15.0.0   1.21.0       Install complete
  2         Mon Jan 15 11:00:00 2026  superseded  nginx-15.1.0   1.21.1       Upgrade complete
  3         Mon Jan 15 12:00:00 2026  deployed    nginx-15.2.0   1.21.2       Upgrade complete
  ```
  - `REVISION`: 버전 번호 (1부터 시작, 업그레이드마다 증가)
  - `STATUS`:
    - `deployed`: 현재 배포 중인 버전
    - `superseded`: 이전 버전 (현재는 사용 안 함)
    - `failed`: 실패한 배포
  - `DESCRIPTION`: 어떤 작업이었는지
- **실전 팁**:
  - 롤백하기 전에 반드시 history를 확인해서 어느 revision으로 돌아갈지 결정
  - 현재 deployed 상태인 revision 확인

**3. `helm rollback <RELEASE_NAME> <REVISION>`** (중요)
- **용도**: 이전 revision으로 롤백 (되돌리기)
- **사용사례**:
  - 업그레이드 후 문제가 생겼을 때
  - 이전 버전으로 빠르게 복구해야 할 때
- **예시**:
  ```bash
  # Revision 1로 롤백
  helm rollback my-nginx 1 -n production

  # 바로 이전 revision으로 롤백 (0 = 직전 버전)
  helm rollback my-nginx 0 -n production
  ```
- **롤백 후**:
  - 새로운 revision이 생성됨 (예: revision 4)
  - 내용은 지정한 revision(예: 1)과 동일
  - `helm history`로 확인하면:
    ```
    REVISION  STATUS       CHART          DESCRIPTION
    1         superseded   nginx-15.0.0   Install complete
    2         superseded   nginx-15.1.0   Upgrade complete
    3         superseded   nginx-15.2.0   Upgrade complete
    4         deployed     nginx-15.0.0   Rollback to 1
    ```
- **실전 시나리오**:
  ```bash
  # 1. 현재 상태 확인
  helm list -n production

  # 2. 히스토리 확인
  helm history my-nginx -n production

  # 3. 문제가 있어서 revision 2로 롤백 결정
  helm rollback my-nginx 2 -n production

  # 4. 롤백 확인
  kubectl get pods -n production  # Pod들이 재시작됨
  helm history my-nginx -n production  # 새 revision 생성 확인
  ```
- **주의사항**:
  - 롤백도 revision을 증가시킴 (되돌리기 ≠ 삭제)
  - 여러 번 롤백하면 revision 번호가 계속 증가

**4. `helm uninstall <RELEASE_NAME>`** (또는 `helm delete`)
- **용도**: Release 완전 삭제 (모든 Kubernetes 리소스 제거)
- **사용사례**:
  - Release가 더 이상 필요 없을 때
  - 문제에서 "Remove the release" 요구
- **기본 동작**: Release와 모든 리소스(Pod, Service 등) 삭제
  ```bash
  helm uninstall my-nginx -n production
  ```
- **주요 옵션**:
  - `--keep-history`: 리소스는 삭제하지만 히스토리는 보존
    ```bash
    helm uninstall my-nginx -n production --keep-history
    # 나중에 helm list --uninstalled로 확인 가능
    ```
  - **사용사례**: 나중에 같은 이름으로 다시 설치하되, 이전 기록을 남기고 싶을 때
- **삭제 확인**:
  ```bash
  # 삭제 전
  helm list -n production
  kubectl get all -n production

  # 삭제
  helm uninstall my-nginx -n production

  # 삭제 확인
  helm list -n production  # my-nginx가 없어야 함
  kubectl get all -n production  # 관련 리소스 모두 삭제됨
  ```
- **실전 팁**:
  - CKA 시험에서는 보통 `--keep-history` 없이 완전 삭제
  - 삭제 시 namespace도 `-n`으로 반드시 지정

**실전 예시:**

```bash
# Mock Exam 2 - Q.10: 취약한 이미지를 사용하는 Helm Release 찾아 제거
# 모든 Helm Release 확인
helm ls -A

# 각 Deployment의 이미지 확인
kubectl get deploy -n <NAMESPACE> <DEPLOYMENT-NAME> -o json | jq -r '.spec.template.spec.containers[].image'

# 취약한 이미지(kodekloud/webapp-color:v1)를 사용하는 Release 삭제
helm uninstall <RELEASE-NAME> -n <NAMESPACE>
```

```bash
# Mock Exam 3 - Q.13: Helm Chart 검증 후 신규 설치 및 구버전 제거
helm ls -n default
cd /root/
helm lint ./new-version                    # Chart 검증
helm install webpage-server-02 ./new-version
helm uninstall webpage-server-01 -n default
```

---

### Helm Chart 개발 및 템플릿

```bash
# 템플릿 렌더링 (설치 없이 확인)
helm template <RELEASE_NAME> <CHART>
helm template my-nginx bitnami/nginx
helm template my-nginx ./mychart --values values.yaml

# Chart 구조 검증
helm lint <CHART_DIR>
helm lint ./mychart

# Chart 정보 확인
helm show all <CHART>                      # 모든 정보
helm show chart <CHART>                    # Chart.yaml
helm show values <CHART>                   # values.yaml
helm show readme <CHART>                   # README

# Chart 다운로드
helm pull <CHART>
helm pull bitnami/nginx --untar            # 압축 해제
helm pull bitnami/nginx --version 15.0.0

# 새 Chart 생성
helm create <CHART_NAME>
helm create myapp
```

**명령어 상세 설명:**

**1. `helm template <RELEASE_NAME> <CHART>`** (자주 사용되는 명령어)
- **용도**: Chart를 클러스터에 설치하지 않고, 렌더링된 Kubernetes manifest만 생성
- **사용사례**:
  - Helm Chart를 YAML 파일로 변환해야 할 때
  - 문제: "Generate manifest from Helm Chart and save to file"
  - ArgoCD 같은 도구에서 CRD를 제외하고 manifest 생성할 때
- **vs `helm install --dry-run`**:
  - `template`: 클러스터 연결 불필요, 순수 템플릿 렌더링
  - `install --dry-run`: 클러스터 연결 필요, 실제 설치 시뮬레이션
- **기본 사용**:
  ```bash
  helm template my-nginx bitnami/nginx
  # 출력: Deployment, Service 등의 YAML이 터미널에 출력됨
  ```
- **파일로 저장** (시험에서 매우 자주 요구됨):
  ```bash
  helm template my-nginx bitnami/nginx > /path/to/output.yaml
  ```

**주요 옵션:**

**a) `--version <VERSION>`**
- **예시**:
  ```bash
  helm template argo argo/argo-cd --version 7.7.3 > argo.yaml
  ```

**b) `--namespace <NS>`**
- **용도**: 특정 namespace용 manifest 생성
- **예시**:
  ```bash
  helm template my-app bitnami/nginx --namespace production > manifest.yaml
  ```

**c) `--set <KEY>=<VALUE>`**
- **용도**: 특정 값을 오버라이드한 manifest 생성
- **예시**:
  ```bash
  # CRD 설치 제외 (ArgoCD 같은 경우 자주 요구됨)
  helm template argo argo/argo-cd --version 7.7.3 \
    --namespace argocd \
    --set crds.install=false > /home/argo/argo-helm.yaml
  ```

**d) `-f <VALUES_FILE>` 또는 `--values <VALUES_FILE>`**
- **예시**:
  ```bash
  helm template my-app ./mychart --values custom-values.yaml > output.yaml
  ```

**실전 시나리오**:
```bash
# 문제: "ArgoCD Helm Chart를 사용하여 manifest 생성 (CRD 제외), /home/argo/argo-helm.yaml에 저장"

# 1. Repository 추가 및 업데이트
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update

# 2. 사용 가능한 버전 확인 (문제에서 특정 버전 요구 시)
helm search repo argo/argo-cd --versions

# 3. Template 생성 (CRD 제외)
helm template argo argo/argo-cd --version 7.7.3 \
  --namespace argocd \
  --set crds.install=false > /home/argo/argo-helm.yaml

# 4. 생성된 파일 확인
less /home/argo/argo-helm.yaml
```

**2. `helm lint <CHART_DIR>`** (중요)
- **용도**: Chart의 구조와 문법을 검증 (설치 전 에러 체크)
- **사용사례**:
  - Chart를 직접 수정한 후
  - 문제: "Verify the Chart is valid before installing"
  - 설치 실패를 방지하기 위해
- **검증 항목**:
  - Chart.yaml 필수 필드 확인
  - values.yaml 문법 확인
  - templates/ 디렉토리의 YAML 문법
  - 템플릿 함수 사용 오류
- **예시**:
  ```bash
  helm lint ./mychart
  ```
- **출력 예시**:
  ```
  ==> Linting ./mychart
  [INFO] Chart.yaml: icon is recommended
  [ERROR] templates/deployment.yaml: unable to parse YAML
  Error: 1 chart(s) linted, 1 chart(s) failed
  ```
- **실전 팁**:
  - lint 통과 → `helm template` → `helm install` 순서로 진행
  - 에러가 있으면 반드시 수정 후 다시 lint

**실전 시나리오**:
```bash
# 문제: "새 버전 Chart를 검증하고 설치, 기존 버전은 삭제"

# 1. 기존 Release 확인
helm list -n default

# 2. 새 Chart 검증
cd /root/new-version
helm lint ./
# 출력: "1 chart(s) linted, 0 chart(s) failed" → OK

# 3. 새 버전 설치
helm install webpage-server-02 ./new-version -n default

# 4. 기존 버전 삭제
helm uninstall webpage-server-01 -n default
```

**3. `helm show` 명령어 그룹**

**a) `helm show values <CHART>`** (매우 유용)
- **용도**: Chart의 기본 values.yaml 내용 확인
- **사용사례**:
  - 어떤 값을 커스터마이징할 수 있는지 확인
  - 설치 전에 설정 가능한 옵션 파악
- **예시**:
  ```bash
  helm show values bitnami/nginx
  ```
- **출력 예시**:
  ```yaml
  ## Global Docker image parameters
  replicaCount: 1

  image:
    registry: docker.io
    repository: bitnami/nginx
    tag: 1.21.0
    pullPolicy: IfNotPresent

  service:
    type: ClusterIP
    port: 80

  resources:
    limits:
      cpu: 100m
      memory: 128Mi
    requests:
      cpu: 50m
      memory: 64Mi
  ```
- **실전 활용**:
  ```bash
  # values.yaml 내용을 파일로 저장 후 수정
  helm show values bitnami/nginx > custom-values.yaml

  # custom-values.yaml 수정 (예: replicaCount를 3으로 변경)
  vim custom-values.yaml

  # 수정한 values로 설치
  helm install my-nginx bitnami/nginx -f custom-values.yaml
  ```

**b) `helm show chart <CHART>`**
- **용도**: Chart.yaml (메타데이터) 확인
- **예시**:
  ```bash
  helm show chart bitnami/nginx
  ```
- **출력 예시**:
  ```yaml
  apiVersion: v2
  name: nginx
  version: 15.0.0
  appVersion: 1.21.0
  description: NGINX Open Source is a web server...
  ```

**c) `helm show readme <CHART>`**
- **용도**: Chart의 README.md 확인 (사용법, 설명)
- **예시**:
  ```bash
  helm show readme bitnami/nginx
  ```

**d) `helm show all <CHART>`**
- **용도**: Chart의 모든 정보 (Chart.yaml + values.yaml + README) 한 번에 확인

**4. `helm pull <CHART>`**
- **용도**: Chart를 로컬에 다운로드 (.tgz 압축 파일로)
- **사용사례**:
  - Chart를 수정하고 싶을 때
  - 오프라인 환경에서 사용할 Chart를 준비할 때
- **예시**:
  ```bash
  # 압축 파일로 다운로드
  helm pull bitnami/nginx
  # 결과: nginx-15.0.0.tgz 생성

  # 압축 해제하여 다운로드
  helm pull bitnami/nginx --untar
  # 결과: nginx/ 디렉토리 생성 (Chart 파일들)

  # 특정 버전 다운로드
  helm pull bitnami/nginx --version 15.0.0 --untar
  ```
- **다운로드 후 수정**:
  ```bash
  helm pull bitnami/nginx --untar
  cd nginx/
  vim values.yaml  # 수정
  helm lint ./     # 검증
  helm install my-nginx ./  # 로컬 Chart로 설치
  ```

**5. `helm create <CHART_NAME>`**
- **용도**: 새 Helm Chart 템플릿 생성 (스캐폴딩)
- **사용사례**: 처음부터 새로운 Chart를 만들 때 (CKA에서는 거의 안 나옴)
- **예시**:
  ```bash
  helm create myapp
  ```
- **생성되는 구조**:
  ```
  myapp/
  ├── Chart.yaml          # Chart 메타데이터
  ├── values.yaml         # 기본 설정값
  ├── charts/            # 의존성 Chart
  ├── templates/         # Kubernetes manifest 템플릿
  │   ├── deployment.yaml
  │   ├── service.yaml
  │   ├── ingress.yaml
  │   ├── _helpers.tpl
  │   └── NOTES.txt
  └── .helmignore
  ```
- **참고**: 실무에서는 보통 기존 Chart를 수정하거나 template 명령어 사용이 더 흔함

---

### Helm Chart 구조

```
myapp-chart/
├── Chart.yaml              # Chart 메타데이터
├── values.yaml             # 기본 설정값
├── charts/                 # 의존성 Chart
├── templates/              # Kubernetes manifest 템플릿
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── _helpers.tpl       # 재사용 가능한 템플릿 함수
│   ├── NOTES.txt          # 설치 후 안내 메시지
│   └── tests/             # Helm test 파일
├── .helmignore            # 패키징 시 제외할 파일
├── README.md
└── LICENSE
```

**Chart.yaml 예시:**

```yaml
apiVersion: v2
name: myapp
description: My Kubernetes application
type: application
version: 1.0.0               # Chart 버전
appVersion: "2.0"            # 애플리케이션 버전

# 의존성 정의
dependencies:
  - name: mysql
    version: 9.3.4
    repository: https://charts.bitnami.com/bitnami
    condition: mysql.enabled

maintainers:
  - name: DevOps Team
    email: devops@example.com

keywords:
  - web
  - application
```

**values.yaml 예시:**

```yaml
# 기본 설정값
replicaCount: 2

image:
  repository: nginx
  tag: "1.20.0"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 80
  targetPort: 8080

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: myapp.example.com
      paths:
        - path: /
          pathType: Prefix

resources:
  limits:
    cpu: 100m
    memory: 128Mi
  requests:
    cpu: 50m
    memory: 64Mi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80

mysql:
  enabled: true
  auth:
    rootPassword: changeme
```

---

### Helm 템플릿 문법 (Go Template)

```yaml
# templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}-{{ .Chart.Name }}
  labels:
    app: {{ .Chart.Name }}
    version: {{ .Chart.AppVersion | quote }}
    release: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ .Chart.Name }}
  template:
    metadata:
      labels:
        app: {{ .Chart.Name }}
    spec:
      containers:
      - name: {{ .Chart.Name }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
        ports:
        - containerPort: {{ .Values.service.targetPort }}
        resources:
          {{- toYaml .Values.resources | nindent 10 }}
        {{- if .Values.env }}
        env:
          {{- range $key, $value := .Values.env }}
          - name: {{ $key }}
            value: {{ $value | quote }}
          {{- end }}
        {{- end }}

{{- if .Values.ingress.enabled }}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ .Release.Name }}-ingress
spec:
  ingressClassName: {{ .Values.ingress.className }}
  rules:
  {{- range .Values.ingress.hosts }}
  - host: {{ .host }}
    http:
      paths:
      {{- range .paths }}
      - path: {{ .path }}
        pathType: {{ .pathType }}
        backend:
          service:
            name: {{ $.Release.Name }}-service
            port:
              number: {{ $.Values.service.port }}
      {{- end }}
  {{- end }}
{{- end }}
```

**주요 템플릿 함수:**

```yaml
# 조건문
{{ if .Values.enabled }}...{{ end }}
{{ if eq .Values.type "production" }}...{{ else }}...{{ end }}

# 반복문
{{ range .Values.items }}
  - {{ . }}
{{ end }}

# 기본값 설정
{{ .Values.image.tag | default "latest" }}

# 문자열 처리
{{ .Values.name | upper }}              # 대문자
{{ .Values.name | lower }}              # 소문자
{{ .Values.name | quote }}              # 따옴표 추가
{{ .Values.name | indent 2 }}           # 들여쓰기
{{ .Values.name | nindent 2 }}          # 새 줄 + 들여쓰기

# YAML 변환
{{ toYaml .Values.resources | nindent 10 }}
{{ toJson .Values.config }}

# 필수값 체크
{{ required "replicaCount is required" .Values.replicaCount }}

# Include 함수 (재사용)
{{ include "myapp.labels" . | nindent 4 }}
```

**_helpers.tpl 예시:**

```yaml
{{/*
공통 레이블
*/}}
{{- define "myapp.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector 레이블
*/}}
{{- define "myapp.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
```

---

### Helm Hooks

Helm Hooks는 특정 시점에 작업을 실행할 수 있게 해준다.

```yaml
# templates/job-pre-install.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ .Release.Name }}-db-migration
  annotations:
    "helm.sh/hook": pre-install,pre-upgrade
    "helm.sh/hook-weight": "-5"
    "helm.sh/hook-delete-policy": before-hook-creation
spec:
  template:
    spec:
      containers:
      - name: db-migrate
        image: migrate/migrate
        command: ["migrate", "-database", "$(DB_URL)", "-path", "/migrations", "up"]
      restartPolicy: Never
```

**Hook 종류:**

- `pre-install`: Chart 설치 전
- `post-install`: Chart 설치 후
- `pre-delete`: Chart 삭제 전
- `post-delete`: Chart 삭제 후
- `pre-upgrade`: Chart 업그레이드 전
- `post-upgrade`: Chart 업그레이드 후
- `pre-rollback`: 롤백 전
- `post-rollback`: 롤백 후
- `test`: Helm test 실행 시

---

### Helm 의존성 관리

```bash
# 의존성 업데이트
helm dependency update ./mychart
helm dependency build ./mychart

# 의존성 목록
helm dependency list ./mychart
```

**Chart.yaml에서 의존성 정의:**

```yaml
dependencies:
  - name: mysql
    version: 9.3.4
    repository: https://charts.bitnami.com/bitnami
    condition: mysql.enabled        # values.yaml의 mysql.enabled가 true일 때만 설치
    tags:
      - database

  - name: redis
    version: 17.0.0
    repository: https://charts.bitnami.com/bitnami
    alias: cache                    # 다른 이름으로 사용
```

---

### Helm Best Practices

1. **Chart 검증**: 항상 `helm lint`로 Chart 구조 검증
2. **Dry-run 활용**: `helm install --dry-run --debug`로 사전 확인
3. **버전 관리**: Chart version과 appVersion을 명확히 구분
4. **기본값 제공**: values.yaml에 합리적인 기본값 설정
5. **문서화**: README.md와 NOTES.txt로 사용법 안내
6. **네이밍 일관성**: Kubernetes와 Helm 네이밍 규칙 준수
7. **템플릿 재사용**: _helpers.tpl로 공통 템플릿 정의
8. **필수값 검증**: `required` 함수로 필수 값 체크
9. **리소스 제한**: 모든 컨테이너에 resources 설정 권장
10. **Namespace 명시**: 환경별로 명확히 namespace 지정

---

## Kustomize - YAML 커스터마이징 도구

### Kustomize 개요

Kustomize는 템플릿 없이 Kubernetes manifest를 커스터마이징하는 도구이다. kubectl에 내장되어 있다.

**핵심 개념:**

- **Base**: 애플리케이션의 기본 manifest 집합 (환경 독립적)
- **Overlay**: Base를 참조하고 환경별 커스터마이징 적용
- **Patches**: Base 리소스에 적용할 변경사항
- **Resources**: Kubernetes manifest 파일들
- **Kustomization**: 어떤 리소스를 포함하고 어떻게 커스터마이징할지 정의

---

### Kustomize 디렉토리 구조

```
myapp/
├── base/                           # 기본 manifest
│   ├── kustomization.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   └── configmap.yaml
└── overlays/                       # 환경별 오버레이
    ├── dev/
    │   ├── kustomization.yaml
    │   ├── deployment-patch.yaml
    │   └── dev-configmap.yaml
    ├── staging/
    │   ├── kustomization.yaml
    │   └── staging-patch.yaml
    └── production/
        ├── kustomization.yaml
        ├── deployment-patch.yaml
        └── hpa.yaml
```

---

### Kustomize 기본 사용법

```bash
# kustomization 빌드 (manifest 생성)
kubectl kustomize <DIR>
kubectl kustomize base/
kubectl kustomize overlays/production/

# 직접 적용
kubectl apply -k <DIR>
kubectl apply -k overlays/production/

# 리소스 확인 (적용 전)
kubectl kustomize overlays/production/ | less

# 특정 리소스만 확인
kubectl kustomize overlays/production/ | grep -A 10 "kind: Deployment"
```

---

### Base 구성

**base/kustomization.yaml:**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

# 포함할 리소스 파일
resources:
  - deployment.yaml
  - service.yaml
  - configmap.yaml

# 모든 리소스에 적용할 공통 레이블
commonLabels:
  app: myapp
  managed-by: kustomize

# 모든 리소스에 적용할 공통 Annotation
commonAnnotations:
  version: "1.0"
  contact: devops@example.com

# ConfigMap 생성
configMapGenerator:
  - name: app-config
    literals:
      - LOG_LEVEL=info
      - TIMEOUT=30s
```

**base/deployment.yaml:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: app
        image: myapp:latest
        ports:
        - containerPort: 8080
        envFrom:
        - configMapRef:
            name: app-config
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 200m
            memory: 256Mi
```

**base/service.yaml:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  selector:
    app: myapp
  ports:
  - port: 80
    targetPort: 8080
  type: ClusterIP
```

---

### Overlay 구성 (환경별 커스터마이징)

**overlays/production/kustomization.yaml:**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

# Base 참조
bases:
  - ../../base

# 또는 resources로도 가능 (Kustomize v4+)
# resources:
#   - ../../base

# Namespace 지정
namespace: production

# 이름 접두사/접미사
namePrefix: prod-
nameSuffix: -v1

# 환경별 레이블 추가
commonLabels:
  environment: production
  tier: frontend

# Replica 수 조정
replicas:
  - name: myapp
    count: 3

# 이미지 변경
images:
  - name: myapp
    newName: registry.example.com/myapp
    newTag: v1.0.0

# ConfigMap 재정의
configMapGenerator:
  - name: app-config
    behavior: merge              # create, replace, merge
    literals:
      - LOG_LEVEL=warn
      - CACHE_TTL=3600
      - MAX_CONNECTIONS=100

# Strategic Merge Patch 적용
patchesStrategicMerge:
  - deployment-patch.yaml

# JSON Patch 적용
patchesJson6902:
  - target:
      group: ""
      version: v1
      kind: Service
      name: myapp
    patch: |-
      - op: replace
        path: /spec/type
        value: LoadBalancer
      - op: add
        path: /metadata/annotations
        value:
          service.beta.kubernetes.io/aws-load-balancer-type: "nlb"

# 추가 리소스
resources:
  - hpa.yaml
  - ingress.yaml
```

**overlays/production/deployment-patch.yaml (Strategic Merge):**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  template:
    spec:
      containers:
      - name: app
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 1000m
            memory: 1Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
        env:
        - name: ENVIRONMENT
          value: production
```

**overlays/production/hpa.yaml:**

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

---

### kustomization.yaml 주요 필드

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

# Namespace 설정
namespace: default

# Base 또는 Resources
bases:
  - ../base
# resources:
#   - deployment.yaml

# 이름 변경
namePrefix: dev-
nameSuffix: -v2

# 공통 레이블 (모든 리소스 + selector)
commonLabels:
  app: myapp
  environment: dev

# 공통 Annotation
commonAnnotations:
  managed-by: kustomize

# 이미지 변경
images:
  - name: nginx
    newName: nginx
    newTag: 1.21.0
  - name: myapp
    newName: registry.io/myapp
    newTag: v2.0.0
    digest: sha256:abc123...

# Replica 수 조정
replicas:
  - name: backend
    count: 5

# ConfigMap 생성
configMapGenerator:
  - name: app-config
    behavior: create            # create|replace|merge
    files:
      - app.conf
      - logging.yaml
    literals:
      - LOG_LEVEL=debug
    envs:
      - .env.production
    options:
      labels:
        type: config
      annotations:
        note: "Generated by Kustomize"
      disableNameSuffixHash: false

# Secret 생성
secretGenerator:
  - name: db-secret
    type: Opaque
    files:
      - password.txt
    literals:
      - username=admin
    options:
      disableNameSuffixHash: true

# Strategic Merge Patch
patchesStrategicMerge:
  - deployment-patch.yaml

# JSON Patch (RFC 6902)
patchesJson6902:
  - target:
      group: apps
      version: v1
      kind: Deployment
      name: myapp
    patch: |-
      - op: add
        path: /spec/template/spec/containers/0/env/-
        value:
          name: NEW_VAR
          value: "value"

# Patch files
patches:
  - path: patch-file.yaml
    target:
      kind: Deployment
      name: myapp

# Replacements (변수 치환)
replacements:
  - source:
      kind: ConfigMap
      name: app-config
      fieldPath: data.db_host
    targets:
      - select:
          kind: Deployment
        fieldPaths:
          - spec.template.spec.containers.0.env.[name=DB_HOST].value
```

---

### Kustomize 주요 기능

**1. namePrefix / nameSuffix**

```yaml
namePrefix: prod-
nameSuffix: -stable

# myapp → prod-myapp-stable
# Service, Deployment, ConfigMap 등 모든 리소스에 적용
```

**2. commonLabels / commonAnnotations**

```yaml
commonLabels:
  app: myapp
  environment: production
  team: platform

# 모든 리소스의 metadata.labels와 selector에 자동 추가
```

**3. images (이미지 변경)**

```yaml
images:
  - name: nginx              # 기존 이미지 이름
    newName: my-registry/nginx
    newTag: 1.21.0
  - name: app
    newName: registry.io/app
    digest: sha256:abc123...  # digest 사용 (tag 무시됨)
```

**4. replicas (복제본 수 조정)**

```yaml
replicas:
  - name: backend
    count: 5
  - name: worker
    count: 3
```

**5. configMapGenerator**

```yaml
configMapGenerator:
  - name: app-config
    files:
      - configs/app.conf
    literals:
      - LOG_LEVEL=debug
      - TIMEOUT=30s
    envs:
      - .env.production
    options:
      disableNameSuffixHash: false  # Hash 자동 추가 (기본값: false)
      labels:
        type: config
```

생성된 ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config-4gh5k2m8f9   # Hash 자동 추가됨
data:
  app.conf: |
    [config content]
  LOG_LEVEL: debug
  TIMEOUT: 30s
```

**6. secretGenerator**

```yaml
secretGenerator:
  - name: db-secret
    type: Opaque
    files:
      - db-password.txt
    literals:
      - username=admin
      - password=secret123
    options:
      disableNameSuffixHash: true  # Hash 추가 안 함
```

---

### Kustomize Patch 전략

**1. Strategic Merge Patch**

가장 일반적인 방법으로, 기존 리소스에 필드를 병합한다.

```yaml
# kustomization.yaml
patchesStrategicMerge:
  - deployment-patch.yaml

# deployment-patch.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: app
        env:
        - name: ENV
          value: production
```

**2. JSON Patch (RFC 6902)**

정확한 경로를 지정하여 값을 추가/삭제/변경한다.

```yaml
patchesJson6902:
  - target:
      group: apps
      version: v1
      kind: Deployment
      name: myapp
    patch: |-
      - op: replace
        path: /spec/replicas
        value: 5

      - op: add
        path: /spec/template/spec/containers/0/env/-
        value:
          name: NEW_VAR
          value: "new_value"

      - op: remove
        path: /spec/template/spec/containers/0/resources/limits/memory
```

**JSON Patch 연산:**

- `add`: 필드 추가
- `remove`: 필드 삭제
- `replace`: 필드 값 변경
- `move`: 필드 이동
- `copy`: 필드 복사
- `test`: 값 검증

---

### 실전 예시: Multi-Environment Setup

**디렉토리 구조:**

```
k8s/
├── base/
│   ├── kustomization.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   └── configmap.yaml
├── overlays/
│   ├── dev/
│   │   ├── kustomization.yaml
│   │   └── dev-patch.yaml
│   ├── staging/
│   │   ├── kustomization.yaml
│   │   └── staging-patch.yaml
│   └── production/
│       ├── kustomization.yaml
│       ├── prod-patch.yaml
│       ├── hpa.yaml
│       └── ingress.yaml
```

**Dev 환경:**

```yaml
# overlays/dev/kustomization.yaml
bases:
  - ../../base

namespace: dev

namePrefix: dev-

commonLabels:
  environment: dev

replicas:
  - name: myapp
    count: 1

images:
  - name: myapp
    newTag: latest

configMapGenerator:
  - name: app-config
    literals:
      - LOG_LEVEL=debug
```

**Production 환경:**

```yaml
# overlays/production/kustomization.yaml
bases:
  - ../../base

namespace: production

namePrefix: prod-

commonLabels:
  environment: production

replicas:
  - name: myapp
    count: 3

images:
  - name: myapp
    newTag: v1.0.0

configMapGenerator:
  - name: app-config
    literals:
      - LOG_LEVEL=warn

patchesStrategicMerge:
  - prod-patch.yaml

resources:
  - hpa.yaml
  - ingress.yaml
```

**배포:**

```bash
# Dev 환경 배포
kubectl apply -k overlays/dev/

# Production 환경 배포
kubectl apply -k overlays/production/

# 배포 전 확인
kubectl kustomize overlays/production/ | less
```

---

### Kustomize Best Practices

1. **Base는 범용적으로**: Base에는 환경 독립적인 설정만 포함
2. **Overlay로 환경 분리**: dev, staging, production 등 환경별 overlay 구성
3. **commonLabels 활용**: 모든 리소스에 일관된 레이블 적용
4. **configMapGenerator 사용**: ConfigMap 변경 시 자동으로 Hash 생성되어 롤링 업데이트 트리거
5. **namePrefix/Suffix로 구분**: 환경별 리소스 이름 구분
6. **Strategic Merge 우선**: 간단한 변경은 Strategic Merge Patch 사용
7. **JSON Patch는 복잡한 경우만**: 정확한 경로 지정이 필요할 때만 사용
8. **Overlay 깊이 제한**: Base + 1~2 레벨 Overlay로 유지
9. **문서화**: 각 Overlay의 목적과 차이점 명시
10. **버전 관리**: kustomization.yaml도 Git으로 관리

---

## Helm vs Kustomize 비교

| 특징         | Helm                        | Kustomize             |
|------------|-----------------------------|-----------------------|
| **접근 방식**  | 템플릿 기반 (Go Template)        | 선언적 오버레이              |
| **학습 곡선**  | 높음 (템플릿 문법 학습 필요)           | 낮음 (YAML만 알면 됨)       |
| **패키징**    | Chart로 패키징 및 배포             | 디렉토리 구조로 관리           |
| **버전 관리**  | Chart 버전, Release 관리        | Git 기반 버전 관리          |
| **재사용성**   | 높음 (Chart 공유 가능)            | 보통 (Base 재사용)         |
| **커스터마이징** | values.yaml로 동적 설정          | Overlay와 Patch로 정적 변경 |
| **복잡도**    | 복잡한 애플리케이션에 적합              | 단순한 커스터마이징에 적합        |
| **롤백**     | helm rollback으로 쉬운 롤백       | kubectl rollout으로 롤백  |
| **생태계**    | 풍부한 public chart repository | kubectl 내장, 별도 설치 불필요 |
| **의존성 관리** | Chart 의존성 관리 가능             | 직접 관리 필요              |

**언제 Helm을 사용하나?**

- 복잡한 애플리케이션 배포 (DB, 모니터링 등)
- 재사용 가능한 패키지 필요
- 버전 관리와 롤백이 중요한 경우
- Public chart 활용 (nginx, mysql, prometheus 등)

**언제 Kustomize를 사용하나?**

- 환경별 설정 차이만 있는 경우
- 템플릿 없이 순수 YAML 선호
- 간단한 커스터마이징 (replicas, image tag 등)
- GitOps 워크플로우 (ArgoCD, Flux)

---

## CKA 시험 준비 체크리스트

### Helm 필수 명령어

```bash
# Repository 관리
helm repo add <NAME> <URL>
helm repo update
helm search repo <CHART>

# Release 관리
helm install <RELEASE> <CHART> -n <NAMESPACE>
helm upgrade <RELEASE> <CHART> --version <VERSION>
helm rollback <RELEASE> <REVISION>
helm uninstall <RELEASE>

# 정보 조회
helm list -A
helm history <RELEASE>
helm get values <RELEASE>

# 개발 및 검증
helm template <RELEASE> <CHART>
helm lint <CHART_DIR>
helm show values <CHART>
```

### CKA Helm 문제 유형별 해결 전략

**유형 1: Helm Chart 설치**
```bash
# 문제 예시: "Install nginx using bitnami/nginx chart version 15.0.0 in the 'web' namespace with 3 replicas"

# 해결 단계:
# 1. Repository 추가 (이미 있는지 확인)
helm repo list
helm repo add bitnami https://charts.bitnami.com/bitnami

# 2. Repository 업데이트 (필수!)
helm repo update

# 3. 버전 확인 (특정 버전 요구 시)
helm search repo bitnami/nginx --versions | grep 15.0.0

# 4. 설치 (namespace 생성 포함)
helm install my-nginx bitnami/nginx \
  --version 15.0.0 \
  --namespace web \
  --create-namespace \
  --set replicaCount=3

# 5. 확인
helm list -n web
kubectl get pods -n web
```

**유형 2: Helm Release 업그레이드**
```bash
# 문제 예시: "Upgrade the 'my-app' release in 'production' namespace to version 2.0.0"

# 해결 단계:
# 1. 현재 상태 확인
helm list -n production
helm history my-app -n production

# 2. Repository 업데이트
helm repo update

# 3. 사용 가능한 버전 확인
helm search repo <repo>/<chart> --versions

# 4. 업그레이드 (기존 설정 유지)
helm upgrade my-app <repo>/<chart> \
  --version 2.0.0 \
  --namespace production \
  --reuse-values

# 5. 확인
helm history my-app -n production
kubectl get pods -n production -w
```

**유형 3: Helm Template 생성 (매우 자주 출제)**
```bash
# 문제 예시: "Generate Kubernetes manifests from argo/argo-cd chart version 7.7.3 with CRDs disabled, save to /home/argo/argo-helm.yaml"

# 해결 단계:
# 1. Repository 추가 및 업데이트
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update

# 2. Chart 정보 확인 (필요 시)
helm show values argo/argo-cd | grep -i crd

# 3. Template 생성
helm template argo argo/argo-cd \
  --version 7.7.3 \
  --namespace argocd \
  --set crds.install=false > /home/argo/argo-helm.yaml

# 4. 생성된 파일 확인
wc -l /home/argo/argo-helm.yaml
head -20 /home/argo/argo-helm.yaml
```

**유형 4: Helm Chart 검증 및 교체**
```bash
# 문제 예시: "Verify the new Chart at /root/new-version, install it as 'app-v2', and remove the old 'app-v1' release"

# 해결 단계:
# 1. 기존 Release 확인
helm list -A

# 2. 새 Chart 검증
cd /root/new-version
helm lint ./

# 3. Lint 통과 확인
# 출력: "1 chart(s) linted, 0 chart(s) failed" → OK

# 4. 새 버전 설치
helm install app-v2 ./new-version -n default

# 5. 설치 확인
helm list -n default
kubectl get pods -n default

# 6. 구버전 삭제
helm uninstall app-v1 -n default

# 7. 최종 확인
helm list -n default
```

**유형 5: 취약한 이미지 찾아 Release 삭제**
```bash
# 문제 예시: "Find and delete all Helm releases using the vulnerable image 'kodekloud/webapp-color:v1'"

# 해결 단계:
# 1. 모든 Release 확인
helm list -A

# 2. 각 Release의 이미지 확인 (jq 활용)
# 방법 1: Deployment 직접 확인
kubectl get deploy -n <NS> <DEPLOY> -o jsonpath='{.spec.template.spec.containers[*].image}'

# 방법 2: Helm manifest에서 확인
helm get manifest <RELEASE> -n <NS> | grep -i image

# 3. 취약한 이미지 사용하는 Release 찾기
for ns in $(kubectl get ns -o jsonpath='{.items[*].metadata.name}'); do
  for release in $(helm list -n $ns -q); do
    echo "Checking $release in namespace $ns"
    helm get manifest $release -n $ns | grep "kodekloud/webapp-color:v1" && echo "FOUND: $release"
  done
done

# 4. 해당 Release 삭제
helm uninstall <RELEASE-NAME> -n <NAMESPACE>

# 5. 확인
helm list -A
```

**유형 6: Helm Release 롤백**
```bash
# 문제 예시: "The 'api-server' release in 'backend' namespace is failing. Rollback to the previous working version."

# 해결 단계:
# 1. Release 상태 확인
helm list -n backend
helm status api-server -n backend

# 2. History 확인 (어느 revision이 정상이었는지 파악)
helm history api-server -n backend

# 3. 롤백 (마지막 정상 버전으로)
# 예: revision 2가 deployed였고, 3이 failed라면
helm rollback api-server 2 -n backend

# 또는 바로 직전 버전으로
helm rollback api-server 0 -n backend

# 4. 롤백 확인
helm history api-server -n backend
kubectl get pods -n backend -w

# 5. Pod 상태 확인
kubectl get pods -n backend
```

### 실전 팁 요약

**1. 항상 지켜야 할 순서:**
```bash
helm repo add <name> <url>    # Repository 추가
helm repo update               # 업데이트 (필수!)
helm search repo <chart>       # Chart 및 버전 확인
helm install/upgrade...        # 실제 작업
helm list -A                   # 확인
```

**2. Namespace 관련:**
- 거의 모든 helm 명령어에 `-n <namespace>` 필요
- 설치 시 `--create-namespace` 사용하면 namespace 없어도 자동 생성
- 실수 방지: 먼저 `kubectl get ns`로 namespace 존재 여부 확인

**3. 버전 관련:**
- `--version` 생략 시 최신 버전 설치됨 (의도하지 않은 결과 가능)
- 특정 버전 요구 시 반드시 `--version` 명시
- `helm search repo <chart> --versions`로 사용 가능한 버전 확인

**4. 값 오버라이드:**
- 간단한 값 1-2개: `--set key=value`
- 여러 값: `-f custom-values.yaml`
- 업그레이드 시 기존 값 유지: `--reuse-values`

**5. Dry-run 활용:**
- 복잡한 작업 전 `--dry-run --debug`로 미리 확인
- `helm template`로 생성될 manifest 사전 검토

**6. 문제 해결:**
- 설치/업그레이드 실패 시: `helm status <release> -n <ns>`로 에러 확인
- 히스토리 확인: `helm history <release> -n <ns>`
- manifest 확인: `helm get manifest <release> -n <ns>`
- 롤백: `helm rollback <release> <revision> -n <ns>`

**7. 시간 절약 팁:**
- Tab 자동완성 활용
- 명령어 히스토리 (`history` 또는 Ctrl+R)
- 긴 명령어는 백슬래시(`\`)로 여러 줄로 작성
- Repository URL은 문제에서 복사-붙여넣기

### Kustomize 필수 명령어

```bash
# 빌드 및 적용
kubectl kustomize <DIR>
kubectl apply -k <DIR>

# 주요 kustomization.yaml 필드
- resources
- bases (또는 resources)
- namespace
- namePrefix / nameSuffix
- commonLabels / commonAnnotations
- images
- replicas
- configMapGenerator / secretGenerator
- patchesStrategicMerge
- patchesJson6902
```

### 시험 팁

1. **Helm Repository는 항상 업데이트**: `helm repo update` 먼저 실행
2. **버전 확인**: `helm search repo --versions`로 사용 가능한 버전 확인
3. **Namespace 지정**: `-n` 옵션 또는 `--namespace` 필수
4. **Dry-run 활용**: `helm install --dry-run` 또는 `kubectl kustomize`로 사전 확인
5. **공식문서 참고**: helm.sh/docs와 kubernetes.io/docs 활용

---

## 학습 정리

### 핵심 개념

1. **배포 전략**: Rolling Update, Blue-Green, Canary, A/B Testing
2. **Helm**: Kubernetes 패키지 매니저
  - Chart, Release, Repository, Values 개념
  - 모든 주요 명령어 (install, upgrade, rollback, uninstall, list, search)
  - Chart 구조 (Chart.yaml, values.yaml, templates/)
  - Go Template 문법
  - Hooks 및 의존성 관리
3. **Kustomize**: 템플릿 없는 YAML 커스터마이징
  - Base와 Overlay 구조
  - kustomization.yaml 주요 필드
  - Strategic Merge Patch vs JSON Patch
  - 환경별 배포 전략

### CKA 시험 관련 문제 유형

1. **Helm Repository 관리**: Repository 추가, 업데이트, Chart 검색
2. **Helm Release 관리**: 설치, 업그레이드, 롤백, 삭제
3. **Helm Template 생성**: `helm template`로 manifest 생성 (CRD 제외 등)
4. **Helm Chart 검증**: `helm lint`로 Chart 구조 검증
5. **취약한 이미지 탐지**: Helm Release 중 특정 이미지 사용하는 것 찾아 삭제

### 실무 활용

**Helm 활용 시나리오:**

- 복잡한 애플리케이션 배포 (Prometheus, Grafana, ArgoCD)
- 팀 간 Chart 공유 및 재사용
- 버전 관리 및 쉬운 롤백
- 동적 설정 변경

**Kustomize 활용 시나리오:**

- Dev, Staging, Production 환경 분리
- GitOps 워크플로우 (ArgoCD, Flux와 통합)
- 간단한 환경별 설정 차이 관리
- 순수 YAML 기반 관리

### 다음 단계

- 배포 자동화 완료
- 모니터링 및 로깅 학습 → **[Part 15로 이동](https://k-diger.github.io/posts/kubernetes-16-prometheus-grafana)**

---

## 참고 자료

- **Helm 공식 문서**: https://helm.sh/docs/
- **Kustomize 공식 문서**: https://kubectl.docs.kubernetes.io/
- **Kubernetes 공식 문서**: https://kubernetes.io/docs/
- **CKA 시험 가이드**: https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/

---
