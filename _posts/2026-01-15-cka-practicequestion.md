---
title: "CKA 2026 Mock Exam 1-17: Comprehensive Practice Guide"
date: 2026-01-15
categories: [CKA, Kubernetes, DevOps]
tags: [CKA, Helm, Sidecar, GatewayAPI, StorageClass, NetworkPolicy, HPA, Troubleshooting]
layout: post
toc: true
---

### Video

- https://www.youtube.com/playlist?list=PLkDZsCgo3Isr4NB5cmyqG7OZwYEx5XOjM

---

### Q. 1 Install ArgoCD using Helm
**Task:** Install ArgoCD in a Kubernetes cluster using Helm while ensuring that CRDs are not installed.
- Add the official ArgoCD repository with the name `argo` (URL: `https://argoproj.github.io/argo-helm`).
- Generate a template with a chart version of `7.7.3` in the `argocd` namespace.
- Save the generated YAML manifest to `/home/argo/argo-helm.yaml`.

- **공식문서 링크:** [Helm - Using Helm](https://helm.sh/docs/intro/using_helm/)
- **검색 키워드:** `helm template`, `helm install skip crds`

**Solution:**
```bash
# Add and update repository
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update

# Generate template without CRDs
helm template argo argo/argo-cd --version 7.7.3 \
--namespace argocd --set crds.install=false > /home/argo/argo-helm.yaml
```

---

### Q. 2 Sidecar Container Configuration
**Task:** Update the existing deployment `wordpress` by adding a container named `sidecar` using the `busybox:stable` image.
- The new sidecar container must run the following command: `/bin/sh -c "while true; do date >> /var/log/wordpress.log; sleep 1; done"`.
- Use a volume mounted at `/var/log` to make the log file `wordpress.log` available to both containers (shared via `emptyDir`).

- **공식문서 링크:** [Logging Architecture](https://kubernetes.io/docs/concepts/cluster-administration/logging/)
- **검색 키워드:** `sidecar container`, `emptyDir volume`

**Solution:**
```yaml
spec:
  template:
    spec:
      containers:
      - name: wordpress
        image: wordpress
        volumeMounts:
        - name: log-volume
          mountPath: /var/log
      - name: sidecar
        image: busybox:stable
        command: ["/bin/sh", "-c", "while true; do date >> /var/log/wordpress.log; sleep 1; done"]
        volumeMounts:
        - name: log-volume
          mountPath: /var/log
      volumes:
      - name: log-volume
        emptyDir: {}
```

---

### Q. 3 Gateway API & HTTPRoute
**Task:** Create a Gateway and an HTTPRoute to replace an existing Ingress resource.
- Create a Gateway named `web-gateway` using the `nginx-class`.
- Configure an HTTPS listener on port 443 with TLS mode `Terminate`, using the existing secret `web-tls`.
- Create an HTTPRoute named `web-route` that routes traffic to the `web-service` on port 80.

- **공식문서 링크:** [Gateway API](https://gateway-api.sigs.k8s.io/)
- **검색 키워드:** `Gateway`, `HTTPRoute`, `certificateRefs`

**Solution:**
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: web-gateway
spec:
  gatewayClassName: nginx-class
  listeners:
  - name: https
    protocol: HTTPS
    port: 443
    tls:
      mode: Terminate
      certificateRefs:
      - name: web-tls
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
spec:
  parentRefs: [{name: web-gateway}]
  rules:
  - matches: [{path: {type: PathPrefix, value: "/"}}]
    backendRefs: [{name: web-service, port: 80}]
```

---

### Q. 4 Resource Request & Limit Calculation
**Task:** Adjust the resource requests and limits for the `wordpress` deployment based on `node01` capacity.
- Calculate the allocatable CPU and Memory on `node01`.
- Subtract a 10% overhead for stability.
- Divide the remaining resources equally among 3 replicas.
- Scale the deployment to 3 replicas after applying the changes.

- **공식문서 링크:** [Manage Resources for Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- **검색 키워드:** `assign memory cpu resource`, `kubectl describe node`

**Solution:**
1. `kubectl describe node node01`로 가용 자원 확인.
2. (가용량 - 현재 사용량) * 0.9 / 3 계산 (예: CPU 250m, Mem 500Mi 도출).
3. `kubectl edit deploy wordpress` 혹은 `kubectl set resources`로 적용.
4. `kubectl scale deploy wordpress --replicas=3`.

---

### Q. 5 Default StorageClass
**Task:** Create a StorageClass named `local-kitty` and set it as the default StorageClass.
- Provisioner: `rancher.io/local-path`, Volume Binding Mode: `WaitForFirstConsumer`.
- Ensure the existing default StorageClass is no longer the default.

- **공식문서 링크:** [Change the default StorageClass](https://kubernetes.io/docs/tasks/administer-cluster/change-default-storage-class/)
- **검색 키워드:** `patch storageclass default`

**Solution:**
```bash
# Create SC then patch
kubectl patch sc local-kitty -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
# Remove default from old SC
kubectl patch sc local-path -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'
```

---

### Q. 6 PriorityClass & Patching
**Task:** Create a new PriorityClass named `high-priority` with a value exactly one less than the highest existing priority (current highest is 1000).
- Patch the existing deployment `busybox-logger` in the `priority` namespace to use this new PriorityClass.

- **공식문서 링크:** [Pod Priority and Preemption](https://kubernetes.io/docs/concepts/scheduling-eviction/pod-priority-preemption/)
- **검색 키워드:** `PriorityClass`, `kubectl patch deployment priorityClassName`

**Solution:**
```bash
kubectl create pc high-priority --value=999 --description="high priority workloads"
kubectl patch deploy busybox-logger -n priority -p '{"spec":{"template":{"spec":{"priorityClassName":"high-priority"}}}}'
```

---

### Q. 7 Ingress & Service Exposure
**Task:** Expose the `echo-server` deployment in the `echo-sound` namespace.
- Create a service named `echo-service` of type `NodePort` on port 8080.
- Create an Ingress named `echo` with host `example.org` routing to the service.

- **공식문서 링크:** [Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)
- **검색 키워드:** `kubectl expose nodeport`, `Ingress path prefix`

**Solution:**
```bash
kubectl expose deploy echo-server-deployment -n echo-sound --name=echo-service --port=8080 --type=NodePort
# Ingress YAML applies host: example.org and service: echo-service:8080
```

---

### Q. 8 CRD Listing & Documentation
**Task:** List all `cert-manager` related CRDs and save the list to `resources.yaml`.
- Extract the documentation for the `subject` field of the `certificate` resource and save it to a file named `subject`.

- **공식문서 링크:** [Custom Resources](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/)
- **검색 키워드:** `kubectl explain`, `kubectl get crd`

**Solution:**
```bash
kubectl get crd | grep cert-manager | awk '{print $1}' | xargs kubectl get -o yaml > resources.yaml
kubectl explain certificate.spec.subject > subject
```

---

### Q. 9 NetworkPolicy: Ingress Control
**Task:** Create a NetworkPolicy named `front-end-from-back-end` in the `backend` namespace.
- Allow ingress traffic only from pods in the `frontend` namespace on port 8080.

- **공식문서 링크:** [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
- **검색 키워드:** `NetworkPolicy ingress port namespaceSelector`

**Solution:**
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: front-end-from-back-end
  namespace: backend
spec:
  podSelector: {matchLabels: {app: backend}}
  ingress:
  - from:
    - namespaceSelector: {matchLabels: {app: frontend}}
    ports: [{protocol: TCP, port: 8080}]
```

---

### Q. 10 Horizontal Pod Autoscaler (HPA)
**Task:** Create an HPA named `Apache-server` for the `Apache-deployment` in the `autoscale` namespace.
- Target CPU: 50%, Min replicas: 1, Max replicas: 4.
- Set the `scaleDown` stabilization window to 30 seconds (requires `autoscaling/v2`).

- **공식문서 링크:** [Horizontal Pod Autoscaling](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- **검색 키워드:** `HPA behavior scaleDown`, `stabilizationWindowSeconds`

**Solution:**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: Apache-server
  namespace: autoscale
spec:
  scaleTargetRef: {apiVersion: apps/v1, kind: Deployment, name: Apache-deployment}
  minReplicas: 1
  maxReplicas: 4
  metrics:
  - type: Resource
    resource: {name: cpu, target: {type: Utilization, averageUtilization: 50}}
  behavior:
    scaleDown: {stabilizationWindowSeconds: 30}
```

---

### Q. 11 CNI Selection & Installation
**Task:** Choose and install a CNI that supports **Network Policy enforcement**.
- Options: Flannel, Calico.
- Install the chosen CNI using a manifest.

- **공식문서 링크:** [Install Addons](https://kubernetes.io/docs/concepts/cluster-administration/addons/)
- **검색 키워드:** `Calico network policy support`

**Solution:**
- Calico는 Network Policy를 지원하므로 선택.
```bash
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.25.0/manifests/calico.yaml
```

---

### Q. 12 PersistentVolumeClaim (PVC) Binding
**Task:** Create a PVC named `mariadb` in the `mariadb` namespace with `ReadWriteOnce` access and 250Mi capacity.
- Update the existing `mariadb` deployment to use this PVC.

- **공식문서 링크:** [Configure a Pod to Use a PersistentVolume for Storage](https://kubernetes.io/docs/tasks/configure-pod-container/configure-persistent-volume-storage/)
- **검색 키워드:** `PersistentVolumeClaim`, `claimName`

**Solution:**
1. `PVC` 생성 (용량 250Mi, RWO).
2. Deployment의 `volumes.persistentVolumeClaim.claimName`을 `mariadb`로 수정.

---

### Q. 13 CRI-Dockerd & Sysctl
**Task:** Install the `cri-dockerd` package and enable the service.
- Configure the system parameter `net.bridge.bridge-nf-call-iptables = 1` and ensure it persists.

- **공식문서 링크:** [Container Runtimes](https://kubernetes.io/docs/setup/production-environment/container-runtimes/)
- **검색 키워드:** `cri-dockerd`, `bridge-nf-call-iptables`

**Solution:**
```bash
sudo dpkg -i cri-dockerd_*.deb
sudo systemctl enable --now cri-docker.service
echo "net.bridge.bridge-nf-call-iptables = 1" >> /etc/sysctl.d/ck.conf
sudo sysctl --system
```

---

### Q. 14 Troubleshooting: Kube-API Server
**Task:** After a migration, `kubectl` commands fail with "Connection Refused". The API server is pointing to ETCD port `2380` instead of `2379`. Fix the configuration.

- **공식문서 링크:** [Static Pods](https://kubernetes.io/docs/tasks/configure-pod-container/static-pod/)
- **검색 키워드:** `kube-apiserver etcd-servers port`

**Solution:**
1. `/etc/kubernetes/manifests/kube-apiserver.yaml` 수정.
2. `--etcd-servers`의 포트를 `2380`에서 `2379`로 변경.

---

### Q. 15 Taints and Tolerations
**Task:** Add a taint `it=kitty:NoSchedule` to `node01`.
- Schedule a pod on `node01` by adding the correct toleration to its spec.

- **공식문서 링크:** [Taints and Tolerations](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/)
- **검색 키워드:** `kubectl taint node`, `tolerations`

**Solution:**
```bash
kubectl taint nodes node01 it=kitty:NoSchedule
# Pod Spec:
# tolerations:
# - key: "it", operator: "Equal", value: "kitty", effect: "NoSchedule"
# nodeName: node01
```

---

### Q. 16 Service: NodePort
**Task:** Expose the `nodeport-deployment` in the `relative` namespace.
- Service port: 80, Target port: 80, NodePort: 30080.

- **공식문서 링크:** [Service - NodePort](https://kubernetes.io/docs/concepts/services-networking/service/#type-nodeport)
- **검색 키워드:** `Service nodePort 30000-32767`

**Solution:**
- `type: NodePort` 지정 및 `nodePort: 30080` 설정.

---

### Q. 17 TLS v1.3 Only & /etc/hosts
**Task:** Modify the `enginex-config` ConfigMap to only support TLS v1.3 (disable v1.2).
- Add the service IP to `/etc/hosts` as `itkitty.k8s.local`.
- Verify using `curl -k --tlsv1.3`.

- **공식문서 링크:** [Configuring TLS](https://kubernetes.io/docs/concepts/services-networking/ingress/#tls)
- **검색 키워드:** `ssl_protocols TLSv1.3`

**Solution:**
1. ConfigMap에서 `ssl_protocols TLSv1.3;`으로 수정.
2. `echo "<IP> itkitty.k8s.local" >> /etc/hosts`.
3. `curl -k --tlsv1.3` 검증 (v1.2는 실패해야 함).

---

- 시험 중에는 `kubectl explain` 명령어를 통해 정확한 필드명을 확인하는 습관이 중요 
- 모든 작업 후에는 `kubectl get pods -A`로 클러스터 상태를 확인
