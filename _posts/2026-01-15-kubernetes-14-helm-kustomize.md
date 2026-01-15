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

Helm은 Kubernetes의 패키지 매니저로, 애플리케이션을 Chart라는 패키지 형태로 관리합니다.

**핵심 구성요소:**

- **Chart**: 애플리케이션 실행에 필요한 모든 리소스를 포함하는 패키지
- **Release**: 클러스터에 배포된 Chart의 인스턴스 (동일 Chart를 여러 번 설치 가능)
- **Repository**: Chart를 저장하고 배포하는 저장소
- **Values**: Chart를 커스터마이징하는 설정 데이터

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

**CKA Mock Exam 예시:**

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

**CKA Mock Exam 예시:**

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

**CKA Mock Exam 예시:**

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

Helm Hooks는 특정 시점에 작업을 실행할 수 있게 해줍니다.

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

Kustomize는 템플릿 없이 Kubernetes manifest를 커스터마이징하는 도구입니다. kubectl에 내장되어 있습니다.

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

가장 일반적인 방법으로, 기존 리소스에 필드를 병합합니다.

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

정확한 경로를 지정하여 값을 추가/삭제/변경합니다.

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
