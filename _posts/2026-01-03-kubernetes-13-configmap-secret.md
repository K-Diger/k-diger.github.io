---
layout: post
title: "Part 13/26: ConfigMap과 Secret"
date: 2026-01-03
categories: [Kubernetes]
tags: [kubernetes, configmap, secret, configuration, cka]
---

애플리케이션 설정을 컨테이너 이미지에 하드코딩하면 환경별로 다른 이미지를 만들어야 한다. Kubernetes는 **ConfigMap**과 **Secret**을 통해 설정을 컨테이너와 분리하여 이식성과 보안성을 높인다.

## ConfigMap과 Secret의 차이

| 구분 | ConfigMap | Secret |
|------|-----------|--------|
| 용도 | 일반 설정 데이터 | 민감한 데이터 |
| 저장 형태 | 평문 | Base64 인코딩 |
| etcd 저장 | 평문 | 암호화 가능 (설정 필요) |
| 크기 제한 | 1MB | 1MB |
| 예시 | DB 호스트, 포트, 로그 레벨 | 비밀번호, API 키, 인증서 |

**주의**: Secret의 Base64 인코딩은 암호화가 아니다. 누구나 디코딩할 수 있다.

```bash
# Base64는 쉽게 디코딩됨
echo "c2VjcmV0LXBhc3N3b3Jk" | base64 -d
# secret-password
```

## ConfigMap

### ConfigMap 생성

**명령형 - 리터럴**:
```bash
kubectl create configmap app-config \
  --from-literal=DB_HOST=mysql.default.svc \
  --from-literal=DB_PORT=3306 \
  --from-literal=LOG_LEVEL=info
```

**명령형 - 파일에서**:
```bash
# 단일 파일
kubectl create configmap nginx-config --from-file=nginx.conf

# 디렉토리의 모든 파일
kubectl create configmap app-configs --from-file=./configs/

# 키 이름 지정
kubectl create configmap app-config --from-file=custom-key=./app.properties
```

**명령형 - env 파일에서**:
```bash
# app.env 파일
# DB_HOST=mysql
# DB_PORT=3306
kubectl create configmap app-config --from-env-file=app.env
```

**선언형 - YAML**:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  # 키-값 쌍
  DB_HOST: mysql.default.svc
  DB_PORT: "3306"
  LOG_LEVEL: info
  # 멀티라인 값
  nginx.conf: |
    server {
      listen 80;
      server_name localhost;
      location / {
        proxy_pass http://backend:8080;
      }
    }
```

### ConfigMap 사용 방법

**1. 환경 변수로 주입**:
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  containers:
  - name: app
    image: myapp:1.0
    env:
    # 개별 키 참조
    - name: DATABASE_HOST
      valueFrom:
        configMapKeyRef:
          name: app-config
          key: DB_HOST
    - name: DATABASE_PORT
      valueFrom:
        configMapKeyRef:
          name: app-config
          key: DB_PORT
          optional: true  # ConfigMap이 없어도 Pod 시작
```

**2. 모든 키를 환경 변수로**:
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  containers:
  - name: app
    image: myapp:1.0
    envFrom:
    - configMapRef:
        name: app-config
      prefix: APP_  # 선택적: 모든 키에 접두사 추가
```

**3. 볼륨으로 마운트**:
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  containers:
  - name: app
    image: nginx:1.24
    volumeMounts:
    - name: config-volume
      mountPath: /etc/nginx/conf.d
      readOnly: true
  volumes:
  - name: config-volume
    configMap:
      name: nginx-config
      # 특정 키만 마운트
      items:
      - key: nginx.conf
        path: default.conf  # 마운트될 파일명
```

**4. 특정 경로에 특정 파일만**:
```yaml
volumes:
- name: config-volume
  configMap:
    name: app-config
    items:
    - key: nginx.conf
      path: nginx.conf
    - key: app.properties
      path: application.properties
      mode: 0644  # 파일 권한
```

### ConfigMap 업데이트

**볼륨 마운트 시**: ConfigMap이 업데이트되면 kubelet이 주기적으로 동기화한다 (기본 1분).

**환경 변수로 사용 시**: Pod를 재시작해야 변경 사항이 적용된다.

```bash
# ConfigMap 수정
kubectl edit configmap app-config

# 또는 replace
kubectl create configmap app-config --from-file=app.conf \
  --dry-run=client -o yaml | kubectl replace -f -
```

**주의사항**:
- 볼륨 마운트된 ConfigMap은 자동 업데이트되지만, 애플리케이션이 파일 변경을 감지해야 함
- subPath로 마운트된 ConfigMap은 자동 업데이트되지 않음

## Secret

### Secret 타입

| 타입 | 용도 |
|-----|------|
| Opaque | 기본 타입, 임의의 키-값 |
| kubernetes.io/dockerconfigjson | Docker registry 인증 |
| kubernetes.io/tls | TLS 인증서 |
| kubernetes.io/basic-auth | Basic 인증 |
| kubernetes.io/ssh-auth | SSH 인증 |
| kubernetes.io/service-account-token | ServiceAccount 토큰 |

### Secret 생성

**명령형 - 리터럴**:
```bash
kubectl create secret generic db-secret \
  --from-literal=username=admin \
  --from-literal=password='S3cr3t!'
```

**명령형 - 파일에서**:
```bash
kubectl create secret generic tls-secret \
  --from-file=tls.crt \
  --from-file=tls.key
```

**TLS Secret**:
```bash
kubectl create secret tls my-tls-secret \
  --cert=tls.crt \
  --key=tls.key
```

**Docker Registry Secret**:
```bash
kubectl create secret docker-registry regcred \
  --docker-server=registry.example.com \
  --docker-username=user \
  --docker-password=password \
  --docker-email=user@example.com
```

**선언형 - YAML**:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-secret
type: Opaque
data:
  # Base64 인코딩된 값
  username: YWRtaW4=
  password: UzNjcjN0IQ==
---
# stringData 사용 (평문으로 작성, 저장 시 Base64 인코딩)
apiVersion: v1
kind: Secret
metadata:
  name: db-secret
type: Opaque
stringData:
  username: admin
  password: S3cr3t!
```

**Base64 인코딩/디코딩**:
```bash
# 인코딩
echo -n 'admin' | base64
# YWRtaW4=

# 디코딩
echo 'YWRtaW4=' | base64 -d
# admin

# 주의: echo 뒤에 -n 없으면 개행문자 포함됨
echo 'admin' | base64     # YWRtaW4K (잘못됨)
echo -n 'admin' | base64  # YWRtaW4= (올바름)
```

### Secret 사용 방법

**1. 환경 변수로 주입**:
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  containers:
  - name: app
    image: myapp:1.0
    env:
    - name: DB_USERNAME
      valueFrom:
        secretKeyRef:
          name: db-secret
          key: username
    - name: DB_PASSWORD
      valueFrom:
        secretKeyRef:
          name: db-secret
          key: password
```

**2. 모든 키를 환경 변수로**:
```yaml
spec:
  containers:
  - name: app
    image: myapp:1.0
    envFrom:
    - secretRef:
        name: db-secret
```

**3. 볼륨으로 마운트**:
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  containers:
  - name: app
    image: myapp:1.0
    volumeMounts:
    - name: secret-volume
      mountPath: /etc/secrets
      readOnly: true
  volumes:
  - name: secret-volume
    secret:
      secretName: db-secret
      defaultMode: 0400  # 파일 권한
```

**4. Docker Registry Secret 사용**:
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: private-app
spec:
  containers:
  - name: app
    image: registry.example.com/myapp:1.0
  imagePullSecrets:
  - name: regcred
```

### Secret 보안 강화

**1. etcd 암호화**:
```yaml
# /etc/kubernetes/encryption-config.yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
- resources:
  - secrets
  providers:
  - aescbc:
      keys:
      - name: key1
        secret: <base64-encoded-32-byte-key>
  - identity: {}  # 암호화되지 않은 Secret 읽기 용
```

API Server 설정에 추가:
```
--encryption-provider-config=/etc/kubernetes/encryption-config.yaml
```

**2. RBAC으로 접근 제한**:
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: secret-reader
rules:
- apiGroups: [""]
  resources: ["secrets"]
  resourceNames: ["allowed-secret"]  # 특정 Secret만
  verbs: ["get"]
```

**3. Pod Security Standards 적용**:
- Privileged 컨테이너 제한
- hostPath 마운트 제한
- 서비스 어카운트 토큰 자동 마운트 비활성화

## Immutable ConfigMap/Secret

Kubernetes 1.21+에서 불변(immutable) ConfigMap/Secret을 지원한다.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: immutable-config
data:
  key: value
immutable: true  # 변경 불가
---
apiVersion: v1
kind: Secret
metadata:
  name: immutable-secret
type: Opaque
data:
  password: cGFzc3dvcmQ=
immutable: true
```

**장점**:
- 실수로 인한 설정 변경 방지
- kubelet의 watch 부하 감소 (클러스터 규모가 클 때 유의미)

**수정이 필요하면**: 새 ConfigMap/Secret을 만들고 Pod를 업데이트해야 함

## 실전 패턴

### 애플리케이션 설정 분리

```yaml
# 환경별 ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config-dev
data:
  LOG_LEVEL: debug
  CACHE_TTL: "60"
  FEATURE_FLAG_X: "true"
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config-prod
data:
  LOG_LEVEL: warn
  CACHE_TTL: "3600"
  FEATURE_FLAG_X: "false"
```

### 설정 파일과 환경 변수 조합

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  containers:
  - name: app
    image: myapp:1.0
    env:
    - name: DB_PASSWORD
      valueFrom:
        secretKeyRef:
          name: db-secret
          key: password
    envFrom:
    - configMapRef:
        name: app-config
    volumeMounts:
    - name: config-file
      mountPath: /etc/app/config.yaml
      subPath: config.yaml
  volumes:
  - name: config-file
    configMap:
      name: app-file-config
```

### 인증서 관리

```yaml
# TLS Secret 생성
apiVersion: v1
kind: Secret
metadata:
  name: tls-certs
type: kubernetes.io/tls
data:
  tls.crt: <base64-encoded-cert>
  tls.key: <base64-encoded-key>
---
# Pod에서 사용
apiVersion: v1
kind: Pod
metadata:
  name: secure-app
spec:
  containers:
  - name: app
    image: myapp:1.0
    volumeMounts:
    - name: certs
      mountPath: /etc/ssl/certs
      readOnly: true
  volumes:
  - name: certs
    secret:
      secretName: tls-certs
      defaultMode: 0400
```

## 트러블슈팅

### 일반적인 문제

**ConfigMap/Secret이 마운트되지 않음**:
```bash
# Pod 이벤트 확인
kubectl describe pod <pod-name>

# ConfigMap/Secret 존재 확인
kubectl get configmap <name>
kubectl get secret <name>

# 참조 오류 확인
# "Error: configmaps "xxx" not found"
```

**환경 변수가 설정되지 않음**:
```bash
# Pod 내부에서 확인
kubectl exec <pod> -- env | grep <VAR_NAME>

# ConfigMap의 키 확인
kubectl get configmap <name> -o yaml
```

**Base64 인코딩 오류**:
```bash
# 개행 문자 포함 여부 확인
echo -n 'value' | base64  # -n 필수!

# 올바른 디코딩 확인
kubectl get secret <name> -o jsonpath='{.data.key}' | base64 -d
```

### 디버깅 명령어

```bash
# ConfigMap 내용 확인
kubectl get configmap <name> -o yaml

# Secret 내용 확인 (Base64 디코딩)
kubectl get secret <name> -o jsonpath='{.data.password}' | base64 -d

# Pod에 마운트된 파일 확인
kubectl exec <pod> -- ls -la /etc/config/
kubectl exec <pod> -- cat /etc/config/app.conf

# 환경 변수 확인
kubectl exec <pod> -- env
```

## 기술 면접 대비

### 자주 묻는 질문

**Q: ConfigMap과 Secret의 차이점은?**

A: ConfigMap은 일반 설정 데이터를 저장하고 평문으로 저장된다. Secret은 민감한 데이터를 저장하며 Base64로 인코딩되어 저장된다. 단, Base64는 암호화가 아니므로 etcd 암호화를 별도로 설정해야 진정한 보안이 된다. 두 리소스 모두 1MB 크기 제한이 있다.

**Q: Secret의 Base64 인코딩은 보안인가?**

A: 아니다. Base64는 단순 인코딩으로 누구나 디코딩할 수 있다. 보안을 위해서는 etcd 암호화, RBAC을 통한 접근 제어, 네트워크 정책 등 추가 조치가 필요하다. stringData 필드를 사용하면 YAML에서 평문으로 작성할 수 있지만, 저장 시 Base64로 인코딩된다.

**Q: ConfigMap이 업데이트되면 Pod에 어떻게 반영되는가?**

A: 볼륨으로 마운트된 경우 kubelet이 주기적으로 동기화한다 (기본 약 1분). 그러나 애플리케이션이 파일 변경을 감지하고 다시 로드해야 실제 반영된다. 환경 변수로 사용된 경우 Pod를 재시작해야 변경이 적용된다. subPath로 마운트된 경우 자동 업데이트되지 않는다.

**Q: Immutable ConfigMap/Secret의 장점은?**

A: 설정 변경으로 인한 장애를 방지하고, kubelet의 watch 부하를 줄인다. 불변이므로 수정이 필요하면 새로운 리소스를 만들고 Pod 사양을 업데이트해야 한다. 클러스터 규모가 클 때 성능상 이점이 있다.

**Q: Docker Registry Secret의 용도는?**

A: 프라이빗 레지스트리에서 이미지를 pull할 때 인증 정보를 제공한다. Pod의 imagePullSecrets 필드에 지정하거나, ServiceAccount에 연결하여 해당 SA를 사용하는 모든 Pod에 자동 적용할 수 있다.

## CKA 시험 대비 필수 명령어

```bash
# ConfigMap 생성
kubectl create configmap app-config --from-literal=key=value
kubectl create configmap app-config --from-file=config.txt
kubectl create configmap app-config --from-env-file=app.env

# Secret 생성
kubectl create secret generic db-secret --from-literal=password=secret
kubectl create secret generic db-secret --from-file=password.txt
kubectl create secret tls tls-secret --cert=tls.crt --key=tls.key
kubectl create secret docker-registry regcred \
  --docker-server=registry.io \
  --docker-username=user \
  --docker-password=pass

# 조회
kubectl get configmap
kubectl get secret
kubectl describe configmap <name>
kubectl describe secret <name>

# 내용 확인
kubectl get configmap <name> -o yaml
kubectl get secret <name> -o yaml
kubectl get secret <name> -o jsonpath='{.data.password}' | base64 -d

# 수정
kubectl edit configmap <name>
kubectl edit secret <name>

# 빠른 YAML 생성
kubectl create configmap app-config --from-literal=key=value \
  --dry-run=client -o yaml > configmap.yaml
kubectl create secret generic db-secret --from-literal=password=secret \
  --dry-run=client -o yaml > secret.yaml
```

### CKA 빈출 시나리오

```yaml
# 시나리오 1: ConfigMap을 환경 변수로
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  containers:
  - name: app
    image: nginx
    envFrom:
    - configMapRef:
        name: app-config

# 시나리오 2: Secret을 볼륨으로 마운트
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  containers:
  - name: app
    image: nginx
    volumeMounts:
    - name: secret-vol
      mountPath: /etc/secrets
      readOnly: true
  volumes:
  - name: secret-vol
    secret:
      secretName: db-secret

# 시나리오 3: 특정 키만 환경 변수로
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  containers:
  - name: app
    image: nginx
    env:
    - name: DB_PASSWORD
      valueFrom:
        secretKeyRef:
          name: db-secret
          key: password

# 시나리오 4: 볼륨에 특정 키만 마운트
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  containers:
  - name: app
    image: nginx
    volumeMounts:
    - name: config-vol
      mountPath: /etc/nginx/conf.d
  volumes:
  - name: config-vol
    configMap:
      name: nginx-config
      items:
      - key: nginx.conf
        path: default.conf
```

## 다음 단계

- [Kubernetes - Volume과 PersistentVolume](/kubernetes/kubernetes-14-volume)
- [Kubernetes - 스케줄링](/kubernetes/kubernetes-15-scheduling)
