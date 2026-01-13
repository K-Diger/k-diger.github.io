---
title: "Part 5: ConfigMap과 Secret - 설정 및 민감정보 관리"
date: 2026-01-06
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, ConfigMap, Secret]
layout: post
toc: true
math: true
mermaid: true
---

> **Phase 2: 기본 리소스 관리** (5/20)

---

# Part 5: 설정 및 데이터 관리

## 23. ConfigMap과 Secret

### 23.1 ConfigMap (설정 관리)

**용도:**

- 애플리케이션 설정
- 환경 변수
- 설정 파일

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: default
data:
  # Key-value 형식
  server.port: "8080"
  server.timeout: "30"
  # 파일 형식
  application.yaml: |
    server:
      port: 8080
      ssl: true
    database:
      host: localhost
      port: 5432
```

### 23.2 Secret (민감 정보 관리)

**종류:**

- **Opaque**: 기본, 임의의 데이터
- **kubernetes.io/service-account-token**: ServiceAccount 토큰
- **kubernetes.io/dockercfg**: Docker 설정
- **kubernetes.io/dockerconfigjson**: Docker 설정 (JSON)
- **kubernetes.io/basic-auth**: 기본 인증
- **kubernetes.io/ssh-auth**: SSH 인증
- **kubernetes.io/tls**: TLS 인증서

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-secret
type: Opaque
stringData: # base64 인코딩 자동
  username: admin
  password: securepassword
```

### 23.3 Volume으로 마운트

**ConfigMap:**

```yaml
volumeMounts:
  - name: config
    mountPath: /etc/config
volumes:
  - name: config
    configMap:
      name: app-config
```

**Secret:**

```yaml
volumeMounts:
  - name: secrets
    mountPath: /etc/secrets
    readOnly: true
volumes:
  - name: secrets
    secret:
      secretName: db-secret
```

### 23.4 환경 변수로 주입

**ConfigMap에서:**

```yaml
containers:
  - name: app
    env:
      - name: SERVER_PORT
        valueFrom:
          configMapKeyRef:
            name: app-config
            key: server.port
```

**Secret에서:**

```yaml
containers:
  - name: app
    env:
      - name: DB_PASSWORD
        valueFrom:
          secretKeyRef:
            name: db-secret
            key: password
```

---

## 학습 정리

### 핵심 개념

1. **ConfigMap**은 애플리케이션 설정을 컨테이너 이미지와 분리하여 관리
2. **Secret**은 민감한 정보를 안전하게 저장
3. 환경 변수 또는 볼륨으로 Pod에 주입 가능
4. 설정 변경 시 이미지 재빌드 불필요

### 다음 단계

✅ ConfigMap으로 설정 관리 이해
✅ Secret으로 민감 정보 관리 이해
✅ Volume과 환경 변수 주입 방법 학습
⬜ 스토리지 학습 → **[Part 6으로 이동](./2026-01-07-kubernetes-06-volume-pv-pvc)**

---

## 실습 과제

1. **ConfigMap 생성 및 사용**
   ```bash
   # ConfigMap 생성 (명령형)
   kubectl create configmap app-config \
     --from-literal=server.port=8080 \
     --from-literal=server.timeout=30

   # ConfigMap 확인
   kubectl get configmap app-config -o yaml

   # ConfigMap을 환경 변수로 사용
   kubectl run nginx --image=nginx --env=SERVER_PORT=configMap:app-config:server.port
   ```

2. **Secret 생성 및 사용**
   ```bash
   # Secret 생성 (명령형)
   kubectl create secret generic db-secret \
     --from-literal=username=admin \
     --from-literal=password=securepassword

   # Secret 확인 (base64 인코딩됨)
   kubectl get secret db-secret -o yaml

   # Secret 디코딩
   kubectl get secret db-secret -o jsonpath='{.data.password}' | base64 -d
   ```

3. **ConfigMap을 파일로 마운트**
   ```yaml
   apiVersion: v1
   kind: Pod
   metadata:
     name: configmap-pod
   spec:
     containers:
       - name: nginx
         image: nginx
         volumeMounts:
           - name: config
             mountPath: /etc/config
     volumes:
       - name: config
         configMap:
           name: app-config
   ```

   ```bash
   # Pod 생성
   kubectl apply -f configmap-pod.yaml

   # 마운트된 파일 확인
   kubectl exec configmap-pod -- ls /etc/config
   kubectl exec configmap-pod -- cat /etc/config/server.port
   ```

---

## 추가 학습 자료

- [ConfigMap 공식 문서](https://kubernetes.io/docs/concepts/configuration/configmap/)
- [Secret 공식 문서](https://kubernetes.io/docs/concepts/configuration/secret/)
- [ConfigMap과 Secret 사용 패턴](https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/)

---

**이전**: [Part 4: Workload 리소스](./2026-01-05-kubernetes-04-deployment-statefulset) ←
**다음**: [Part 6: 스토리지](./2026-01-07-kubernetes-06-volume-pv-pvc) →
