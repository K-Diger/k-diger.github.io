---
title: "CKA Mock Exam - 2"
date: 2026-01-15
categories: [CKA, Kubernetes, StorageClass, Sidecar, Ingress, Deployment, RBAC, CSR, DNS, StaticPod, HPA, Gateway, Helm, NetworkPolicy]
tags: [CKA, Kubernetes, StorageClass, Sidecar, Ingress, Deployment, RBAC, CSR, DNS, StaticPod, HPA, Gateway, Helm, NetworkPolicy]
layout: post
toc: true
math: true
mermaid: true
---

### Q. 1 StorageClass Configuration

**Task:** Create a StorageClass named local-sc with the following specifications and set it as the default storage class:
- The provisioner should be kubernetes.io/no-provisioner
- The volume binding mode should be WaitForFirstConsumer
- Volume expansion should be enabled

- **공식문서 링크:**
  - [StorageClass](https://kubernetes.io/docs/concepts/storage/storage-classes/)
  - [Local Persistent Volume](https://kubernetes.io/docs/concepts/storage/volumes/#local)
- **검색 키워드:** `StorageClass`, `no-provisioner`, `WaitForFirstConsumer`, `allowVolumeExpansion`, `default storage class`

**Solution:**
```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: local-sc
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
```

```bash
kubectl apply -f local-sc.yaml
kubectl get storageclass
```

---

### Q. 2 Sidecar Container Pattern

**Task:** Create a deployment named logging-deployment in the namespace logging-ns with 1 replica, with the following specifications:
- The main container should be named app-container, use the image busybox, and should run the following command to simulate writing logs:
  ```
  sh -c "while true; do echo 'Log entry' >> /var/log/app/app.log; sleep 5; done"
  ```
- Add a sidecar container named log-agent that also uses the busybox image and runs the command:
  ```
  tail -f /var/log/app/app.log
  ```
- log-agent logs should display the entries logged by the main app-container

- **공식문서 링크:**
  - [Sidecar Containers](https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/)
  - [Share Process Namespace](https://kubernetes.io/docs/tasks/configure-pod-container/share-process-namespace/)
  - [Logging Architecture](https://kubernetes.io/docs/concepts/cluster-administration/logging/)
- **검색 키워드:** `sidecar container`, `emptyDir`, `volumeMounts`, `logging pattern`

**Solution:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: logging-deployment
  namespace: logging-ns
spec:
  replicas: 1
  selector:
    matchLabels:
      app: logger
  template:
    metadata:
      labels:
        app: logger
    spec:
      containers:
      - name: app-container
        image: busybox
        command: ["sh", "-c", "while true; do echo 'Log entry' >> /var/log/app/app.log; sleep 5; done"]
        volumeMounts:
        - name: log-volume
          mountPath: /var/log/app
      - name: log-agent
        image: busybox
        command: ["sh", "-c", "tail -f /var/log/app/app.log"]
        volumeMounts:
        - name: log-volume
          mountPath: /var/log/app
      volumes:
      - name: log-volume
        emptyDir: {}
```

```bash
kubectl apply -f logging-deployment.yaml
kubectl logs -n logging-ns deployment/logging-deployment -c log-agent
```

---

### Q. 3 Ingress Configuration

**Task:** A Deployment named webapp-deploy is running in the ingress-ns namespace and is exposed via a Service named webapp-svc. Create an Ingress resource called webapp-ingress in the same namespace that will route traffic to the service. The Ingress must:
- Use pathType: Prefix
- Route requests sent to path / to the backend service
- Forward traffic to port 80 of the service
- Be configured for the host kodekloud-ingress.app

Test app availability using the following command:
```bash
curl -s http://kodekloud-ingress.app/
```

- **공식문서 링크:**
  - [Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)
  - [Ingress Path Types](https://kubernetes.io/docs/concepts/services-networking/ingress/#path-types)
- **검색 키워드:** `Ingress`, `pathType Prefix`, `ingress rules`, `host`

**Solution:**
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: webapp-ingress
  namespace: ingress-ns
spec:
  rules:
  - host: kodekloud-ingress.app
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: webapp-svc
            port:
              number: 80
```

```bash
kubectl apply -f webapp-ingress.yaml
curl -s http://kodekloud-ingress.app/
```

---

### Q. 4 Deployment Rolling Update

**Task:** Create a new deployment called nginx-deploy, with image nginx:1.16 and 1 replica. Next, upgrade the deployment to version 1.17 using rolling update.

Note: Use the kubectl apply command to create or update the deployment.

- **공식문서 링크:**
  - [Deployments - Updating](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#updating-a-deployment)
  - [kubectl set image](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_set/kubectl_set_image/)
  - [Rollout History](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/kubectl_rollout_history/)
- **검색 키워드:** `deployment rolling update`, `kubectl set image`, `rollout history`, `--record`

**Solution:**
```bash
kubectl create deployment nginx-deploy --image=nginx:1.16 --replicas=1 --dry-run=client -o yaml > nginx-deploy.yaml
kubectl apply -f nginx-deploy.yaml --record
kubectl rollout history deployment nginx-deploy
kubectl set image deployment/nginx-deploy nginx=nginx:1.17 --record
kubectl rollout history deployment nginx-deploy
```

---

### Q. 5 Certificate Signing Request (CSR) & RBAC

**Task:** Create a new user called john. Grant him access to the cluster using a csr named john-developer. Create a role developer which should grant John the permission to create, list, get, update and delete pods in the development namespace. The private key exists in the location: /root/CKA/john.key and csr at /root/CKA/john.csr.

Important Note: As of kubernetes 1.19, the CertificateSigningRequest object expects a signerName.

- **공식문서 링크:**
  - [Certificate Signing Requests](https://kubernetes.io/docs/reference/access-authn-authz/certificate-signing-requests/)
  - [RBAC - Role and RoleBinding](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
- **검색 키워드:** `CertificateSigningRequest`, `signerName`, `kubectl certificate approve`, `Role`, `RoleBinding`

**Solution:**
```yaml
apiVersion: certificates.k8s.io/v1
kind: CertificateSigningRequest
metadata:
  name: john-developer
spec:
  request: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURSBSRVFVRVNULS0tLS0KTUlJQ1ZEQ0NBVHdDQVFBd0R6RU5NQXNHQTFVRUF3d0VhbTlvYmpDQ0FTSXdEUVlKS29aSWh2Y05BUUVCQlFBRApnZ0VQQURDQ0FRb0NnZ0VCQUt2Um1tQ0h2ZjBrTHNldlF3aWVKSzcrVVdRck04ZGtkdzkyYUJTdG1uUVNhMGFPCjV3c3cwbVZyNkNjcEJFRmVreHk5NUVydkgyTHhqQTNiSHVsTVVub2ZkUU9rbjYra1NNY2o3TzdWYlBld2k2OEIKa3JoM2prRFNuZGFvV1NPWXBKOFg1WUZ5c2ZvNUpxby82YU92czFGcEc3bm5SMG1JYWpySTlNVVFEdTVncGw4bgpjakY0TG4vQ3NEb3o3QXNadEgwcVpwc0dXYVpURTBKOWNrQmswZWhiV2tMeDJUK3pEYzlmaDVIMjZsSE4zbHM4CktiSlRuSnY3WDFsNndCeTN5WUFUSXRNclpUR28wZ2c1QS9uREZ4SXdHcXNlMTdLZDRaa1k3RDJIZ3R4UytkMEMKMTNBeHNVdzQyWVZ6ZzhkYXJzVGRMZzcxQ2NaanRxdS9YSmlyQmxVQ0F3RUFBYUFBTUEwR0NTcUdTSWIzRFFFQgpDd1VBQTRJQkFRQ1VKTnNMelBKczB2czlGTTVpUzJ0akMyaVYvdXptcmwxTGNUTStsbXpSODNsS09uL0NoMTZlClNLNHplRlFtbGF0c0hCOGZBU2ZhQnRaOUJ2UnVlMUZnbHk1b2VuTk5LaW9FMnc3TUx1a0oyODBWRWFxUjN2SSsKNzRiNnduNkhYclJsYVhaM25VMTFQVTlsT3RBSGxQeDNYVWpCVk5QaGhlUlBmR3p3TTRselZuQW5mNm96bEtxSgpvT3RORStlZ2FYWDdvc3BvZmdWZWVqc25Yd0RjZ05pSFFTbDgzSkljUCtjOVBHMDJtNyt0NmpJU3VoRllTVjZtCmlqblNucHBKZWhFUGxPMkFNcmJzU0VpaFB1N294Wm9iZDFtdWF4bWtVa0NoSzZLeGV0RjVEdWhRMi80NEMvSDIKOWk1bnpMMlRST3RndGRJZjAveUF5N05COHlOY3FPR0QKLS0tLS1FTkQgQ0VSVElGSUNBVEUgUkVRVUVTVC0tLS0tCg==
  signerName: kubernetes.io/kube-apiserver-client
  usages:
  - digital signature
  - key encipherment
  - client auth
```

```bash
kubectl apply -f john-csr.yaml
kubectl certificate approve john-developer
kubectl create role developer --resource=pods --verb=create,list,get,update,delete --namespace=development
kubectl create rolebinding developer-role-binding --role=developer --user=john --namespace=development
kubectl auth can-i update pods --as=john --namespace=development
```

---

### Q. 6 DNS Resolution & Service Discovery

**Task:** Create an nginx pod named nginx-resolver using the nginx image and expose it internally using a ClusterIP service called nginx-resolver-service. From within the cluster, verify:
- DNS resolution of the service name
- Network reachability of the pod using its IP address

Use the busybox:1.28 image to perform the lookups. Save the service DNS lookup output to /root/CKA/nginx.svc and the pod IP lookup output to /root/CKA/nginx.pod.

- **공식문서 링크:**
  - [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)
  - [Debugging DNS Resolution](https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/)
- **검색 키워드:** `DNS pod service`, `nslookup`, `service discovery`, `pod dns`

**Solution:**
```bash
kubectl run nginx-resolver --image=nginx
kubectl expose pod nginx-resolver --name=nginx-resolver-service --port=80 --target-port=80 --type=ClusterIP
kubectl run test-nslookup --image=busybox:1.28 --rm -it --restart=Never -- nslookup nginx-resolver-service > /root/CKA/nginx.svc
kubectl get pod nginx-resolver -o wide
kubectl run test-nslookup --image=busybox:1.28 --rm -it --restart=Never -- nslookup <P-O-D-I-P.default.pod> > /root/CKA/nginx.pod
```

---

### Q. 7 Static Pod

**Task:** Create a static pod on node01 called nginx-critical with the image nginx. Make sure that it is recreated/restarted automatically in case of a failure. For example, use /etc/kubernetes/manifests as the static Pod path.

- **공식문서 링크:**
  - [Static Pods](https://kubernetes.io/docs/tasks/configure-pod-container/static-pod/)
  - [kubelet Configuration](https://kubernetes.io/docs/reference/config-api/kubelet-config.v1beta1/)
- **검색 키워드:** `static pod`, `staticPodPath`, `kubelet config`, `/etc/kubernetes/manifests`

**Solution:**
```bash
kubectl run nginx-critical --image=nginx --dry-run=client -o yaml > static.yaml
scp static.yaml node01:/root/
ssh node01
mkdir -p /etc/kubernetes/manifests
cp /root/static.yaml /etc/kubernetes/manifests/
exit
kubectl get pods
```

---

### Q. 8 Horizontal Pod Autoscaler (HPA) - Memory

**Task:** Create a Horizontal Pod Autoscaler with name backend-hpa for the deployment named backend-deployment in the backend namespace with the webapp-hpa.yaml file located under the root folder. Ensure that the HPA scales the deployment based on memory utilization, maintaining an average memory usage of 65% across all pods. Configure the HPA with a minimum of 3 replicas and a maximum of 15.

- **공식문서 링크:**
  - [Horizontal Pod Autoscaler](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
  - [HPA Walkthrough](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale-walkthrough/)
- **검색 키워드:** `HPA memory`, `horizontal pod autoscaler memory`, `averageUtilization`, `resource metrics`

**Solution:**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
  namespace: backend
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend-deployment
  minReplicas: 3
  maxReplicas: 15
  metrics:
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 65
```

```bash
kubectl create -f webapp-hpa.yaml
```

---

### Q. 9 Gateway API - TLS Configuration

**Task:** Modify the existing web-gateway on cka5673 namespace to handle HTTPS traffic on port 443 for kodekloud.com, using a TLS certificate stored in a secret named kodekloud-tls.

- **공식문서 링크:**
  - [Gateway API - TLS](https://gateway-api.sigs.k8s.io/guides/tls/)
  - [Gateway API Reference](https://gateway-api.sigs.k8s.io/api-types/gateway/)
- **검색 키워드:** `Gateway TLS`, `certificateRefs`, `HTTPS gateway`, `gateway listener`

**Solution:**
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: web-gateway
  namespace: cka5673
spec:
  gatewayClassName: kodekloud
  listeners:
  - name: https
    protocol: HTTPS
    port: 443
    hostname: kodekloud.com
    tls:
      certificateRefs:
      - name: kodekloud-tls
```

```bash
kubectl apply -f web-gateway.yaml
```

---

### Q. 10 Helm - Find and Uninstall

**Task:** On the cluster, the team has installed multiple helm charts on a different namespace. By mistake, those deployed resources include one of the vulnerable images called kodekloud/webapp-color:v1. Find out the release name and uninstall it.

- **공식문서 링크:**
  - [Helm Uninstall](https://helm.sh/docs/helm/helm_uninstall/)
  - [Helm List](https://helm.sh/docs/helm/helm_list/)
- **검색 키워드:** `helm list`, `helm uninstall`, `kubectl get deployments`, `jq`

**Solution:**
```bash
# 모든 Helm 릴리스 확인
helm ls -A

# 각 네임스페이스의 Deployment에서 이미지 찾기
kubectl get deploy -n <NAMESPACE> <DEPLOYMENT-NAME> -o json | jq -r '.spec.template.spec.containers[].image'

# 취약한 이미지를 사용하는 릴리스 삭제
helm uninstall <RELEASE-NAME> -n <NAMESPACE>
```

---

### Q. 11 NetworkPolicy

**Task:** You are requested to create a NetworkPolicy to allow traffic from frontend apps located in the frontend namespace, to backend apps located in the backend namespace, but not from the databases in the databases namespace. There are three policies available in the /root folder. Apply the most restrictive policy from the provided YAML files to achieve the desired result. Do not delete any existing policies.

- **공식문서 링크:**
  - [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
  - [Declare Network Policy](https://kubernetes.io/docs/tasks/administer-cluster/declare-network-policy/)
- **검색 키워드:** `NetworkPolicy`, `namespaceSelector`, `podSelector`, `ingress rules`

**Solution:**
```bash
# 세 정책 파일 확인
cat /root/net-pol-1.yaml  # 너무 광범위
cat /root/net-pol-2.yaml  # frontend와 databases 모두 허용
cat /root/net-pol-3.yaml  # 정확함 (frontend만 허용)

# 가장 제한적인 정책 적용
kubectl apply -f /root/net-pol-3.yaml
kubectl get netpol -n backend
```

---

## 문제 풀이 팁

### kubectl explain 활용법
```bash
# 리소스의 전체 구조 확인
kubectl explain <resource>

# 특정 필드의 상세 정보 확인
kubectl explain <resource>.spec
kubectl explain <resource>.spec.field

# 재귀적으로 모든 필드 확인
kubectl explain <resource> --recursive

# 예시
kubectl explain storageclass
kubectl explain ingress.spec.rules
kubectl explain hpa.spec.metrics
```

### 공식문서 검색 전략
1. **Kubernetes 공식 문서:** https://kubernetes.io/docs/
2. **kubectl 치트시트:** https://kubernetes.io/docs/reference/kubectl/cheatsheet/
3. **API Reference:** https://kubernetes.io/docs/reference/kubernetes-api/
4. **Gateway API:** https://gateway-api.sigs.k8s.io/
5. **Helm 문서:** https://helm.sh/docs/
6. **시험 중 검색 키워드:**
   - `kubectl <resource>` (예: `kubectl storageclass`)
   - `kubernetes <개념>` (예: `kubernetes networkpolicy`)
   - `<resource> example` (예: `ingress example`)

### 시험 시 주의사항
1. **항상 namespace 확인:** `-n` 옵션 사용
2. **dry-run 활용:** `--dry-run=client -o yaml`로 템플릿 생성
3. **kubectl explain 활용:** 필드명이나 구조가 불확실할 때
4. **리소스 확인:** `kubectl get`, `kubectl describe`로 검증
5. **공식문서 즐겨찾기:** 시험 시작 전 주요 페이지 북마크
6. **Base64 인코딩:** `cat file | base64 | tr -d '\n'`
7. **YAML 문법 검증:** 들여쓰기와 구조 확인


