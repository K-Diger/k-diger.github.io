---
title: "Part 9: RBAC과 ServiceAccount - 인증과 인가"
date: 2026-01-10
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, TLS, RBAC, ServiceAccount, Security]
layout: post
toc: true
math: true
mermaid: true
---

> **Phase 4: 보안** (9/20)

---

# Part 9: 인증 및 인가

## 32. TLS 및 인증서 관리

### 32.1 TLS 기초

**TLS (Transport Layer Security)의 필요성:**

Kubernetes 클러스터의 모든 통신은 암호화되어야 한다:

```
kubectl → API Server → etcd
           ↓
      kubelet (Worker Nodes)
```

**대칭키 vs 비대칭키:**

```
대칭키 암호화:
- 암호화/복호화에 같은 키 사용
- 빠르지만 키 전달 문제
- 예: AES

비대칭키 암호화:
- 공개키(Public Key): 암호화
- 개인키(Private Key): 복호화
- 느리지만 안전
- 예: RSA
```

**인증서 구성 요소:**

```
개인키 (Private Key): server.key
공개키 (Public Key): 인증서에 포함
인증서 (Certificate): server.crt
  - 공개키
  - 소유자 정보 (CN, O)
  - CA 서명

CA (Certificate Authority):
  - CA 개인키: ca.key
  - CA 인증서: ca.crt
```

### 32.2 Kubernetes에서의 TLS

**Kubernetes 클러스터의 인증서:**

**1. CA 인증서 (최상위):**

```
/etc/kubernetes/pki/ca.crt
/etc/kubernetes/pki/ca.key
```

**2. Server 인증서 (서버 인증):**

```yaml
API Server:
  - /etc/kubernetes/pki/apiserver.crt
  - /etc/kubernetes/pki/apiserver.key

etcd:
  - /etc/kubernetes/pki/etcd/server.crt
  - /etc/kubernetes/pki/etcd/server.key

kubelet:
  - /var/lib/kubelet/pki/kubelet.crt
  - /var/lib/kubelet/pki/kubelet.key
```

**3. Client 인증서 (클라이언트 인증):**

```yaml
kubectl (admin):
  - ~/.kube/config 내 client-certificate-data
  - ~/.kube/config 내 client-key-data

API Server → etcd:
  - /etc/kubernetes/pki/apiserver-etcd-client.crt
  - /etc/kubernetes/pki/apiserver-etcd-client.key

API Server → kubelet:
  - /etc/kubernetes/pki/apiserver-kubelet-client.crt
  - /etc/kubernetes/pki/apiserver-kubelet-client.key
```

### 32.3 인증서 생성 및 관리

**수동 인증서 생성 (OpenSSL):**

**1. CA 인증서 생성:**

```bash
# CA 개인키 생성
openssl genrsa -out ca.key 2048

# CA 인증서 생성 (자체 서명)
openssl req -new -x509 -key ca.key -out ca.crt -days 3650 \
  -subj "/CN=KUBERNETES-CA/O=Kubernetes"
```

**2. Admin 사용자 인증서 생성:**

```bash
# Admin 개인키 생성
openssl genrsa -out admin.key 2048

# CSR (Certificate Signing Request) 생성
openssl req -new -key admin.key -out admin.csr \
  -subj "/CN=kube-admin/O=system:masters"

# CA로 서명하여 인증서 생성
openssl x509 -req -in admin.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out admin.crt -days 365
```

**3. kubeconfig 생성:**

```bash
kubectl config set-cluster kubernetes \
  --certificate-authority=ca.crt \
  --embed-certs=true \
  --server=https://10.0.0.1:6443

kubectl config set-credentials kube-admin \
  --client-certificate=admin.crt \
  --client-key=admin.key \
  --embed-certs=true

kubectl config set-context kubernetes-admin@kubernetes \
  --cluster=kubernetes \
  --user=kube-admin

kubectl config use-context kubernetes-admin@kubernetes
```

### 32.4 Certificates API

**Kubernetes 내장 인증서 관리:**

Kubernetes는 CSR (CertificateSigningRequest) 리소스를 통해 인증서 발급을 자동화한다.

**사용자 인증서 발급 프로세스:**

**1. 개인키 및 CSR 생성:**

```bash
# 개인키 생성
openssl genrsa -out john.key 2048

# CSR 생성
openssl req -new -key john.key -out john.csr \
  -subj "/CN=john/O=developers"

# CSR을 Base64 인코딩
cat john.csr | base64 -w 0
```

**2. CertificateSigningRequest 리소스 생성:**

```yaml
apiVersion: certificates.k8s.io/v1
kind: CertificateSigningRequest
metadata:
  name: john-developer
spec:
  request: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURSBSRVFVRVNULS0tLS0K...  # Base64 CSR
  signerName: kubernetes.io/kube-apiserver-client
  usages:
  - client auth
  expirationSeconds: 86400  # 24시간 (선택적)
```

```bash
kubectl apply -f john-csr.yaml
```

**3. 관리자가 승인:**

```bash
# CSR 목록 확인
kubectl get csr

# 승인
kubectl certificate approve john-developer

# 확인
kubectl get csr john-developer
```

**4. 인증서 추출:**

```bash
kubectl get csr john-developer -o jsonpath='{.status.certificate}' | base64 -d > john.crt
```

**5. kubeconfig 생성:**

```bash
kubectl config set-credentials john \
  --client-certificate=john.crt \
  --client-key=john.key \
  --embed-certs=true

kubectl config set-context john-context \
  --cluster=kubernetes \
  --user=john

# Role/RoleBinding 생성 (권한 부여)
kubectl create role developer --verb=get,list,create --resource=pods
kubectl create rolebinding john-developer --role=developer --user=john
```

### 32.5 인증서 문제 해결

**인증서 정보 확인:**

```bash
# 인증서 상세 정보 출력
openssl x509 -in /etc/kubernetes/pki/apiserver.crt -text -noout

# 주요 확인 항목:
# - Subject: CN (Common Name), O (Organization)
# - Issuer: 발급자 (CA)
# - Validity: Not Before, Not After (만료일)
# - Subject Alternative Name: DNS, IP (중요!)
```

**인증서 갱신 (kubeadm):**

```bash
# 모든 인증서 만료일 확인
kubeadm certs check-expiration

# 모든 인증서 갱신
kubeadm certs renew all

# 특정 인증서만 갱신
kubeadm certs renew apiserver
```

---

## 24. RBAC (Role-Based Access Control)

### 24.1 ServiceAccount

**정의:**

ServiceAccount는 **Pod이 API Server와 통신할 때 사용하는 신원**이다.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: myapp-sa
  namespace: default
```

```bash
# ServiceAccount 확인
kubectl get serviceaccount
kubectl describe serviceaccount myapp-sa

# 토큰 확인
kubectl get secret
```

### 24.2 Role과 ClusterRole

**Role (Namespace 범위):**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: default
rules:
  - apiGroups: [ "" ]
    resources: [ "pods" ]
    verbs: [ "get", "list", "watch" ]
  - apiGroups: [ "" ]
    resources: [ "pods/logs" ]
    verbs: [ "get" ]
```

**ClusterRole (전체 클러스터 범위):**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: admin
rules:
  - apiGroups: [ "*" ]
    resources: [ "*" ]
    verbs: [ "*" ]
```

### 24.3 RoleBinding과 ClusterRoleBinding

**RoleBinding:**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods
  namespace: default
subjects:
  - kind: ServiceAccount
    name: myapp-sa
    namespace: default
  - kind: User
    name: user@example.com
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

**ClusterRoleBinding:**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: read-secrets-global
subjects:
  - kind: ServiceAccount
    name: myapp-sa
    namespace: default
roleRef:
  kind: ClusterRole
  name: secret-reader
  apiGroup: rbac.authorization.k8s.io
```

---

## 학습 정리

### 핵심 개념

1. **TLS**로 모든 클러스터 통신 암호화
2. **Certificates API**로 사용자 인증서 발급 자동화
3. **RBAC**으로 세밀한 권한 관리
4. **ServiceAccount**로 Pod에 권한 부여
5. **Role/ClusterRole**과 **RoleBinding/ClusterRoleBinding**으로 권한 분리

### 다음 단계

✅ TLS 및 인증서 관리 이해
✅ Certificates API로 인증서 발급
✅ RBAC로 권한 관리
⬜ Pod 보안 학습 → **[Part 10으로 이동](./2026-01-11-kubernetes-10-securitycontext)**

---

## 실습 과제

1. **사용자 인증서 발급 (Certificates API)**
   ```bash
   # 개인키 생성
   openssl genrsa -out jane.key 2048

   # CSR 생성
   openssl req -new -key jane.key -out jane.csr -subj "/CN=jane/O=developers"

   # Base64 인코딩
   cat jane.csr | base64 -w 0

   # CSR 리소스 생성 및 적용
   kubectl apply -f jane-csr.yaml

   # 승인
   kubectl certificate approve jane-developer

   # 인증서 추출
   kubectl get csr jane-developer -o jsonpath='{.status.certificate}' | base64 -d > jane.crt
   ```

2. **RBAC 설정**
   ```bash
   # ServiceAccount 생성
   kubectl create serviceaccount app-sa

   # Role 생성 (Pod 읽기만 허용)
   kubectl create role pod-reader --verb=get,list,watch --resource=pods

   # RoleBinding 생성
   kubectl create rolebinding app-sa-binding --role=pod-reader --serviceaccount=default:app-sa

   # Pod에 ServiceAccount 적용
   kubectl run nginx --image=nginx --serviceaccount=app-sa

   # 권한 테스트
   kubectl auth can-i get pods --as=system:serviceaccount:default:app-sa
   ```

---

## 추가 학습 자료

- [TLS 인증서 공식 문서](https://kubernetes.io/docs/tasks/tls/managing-tls-in-a-cluster/)
- [Certificates API](https://kubernetes.io/docs/reference/access-authn-authz/certificate-signing-requests/)
- [RBAC 공식 문서](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
- [ServiceAccount 공식 문서](https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/)

---

**이전**: [Part 8: 고급 네트워킹](./2026-01-09-kubernetes-08-ingress-networkpolicy) ←
**다음**: [Part 10: Pod 보안](./2026-01-11-kubernetes-10-securitycontext) →
