---
title: "CKA Mock Exam 3"
date: 2026-01-26
categories: [ CKA, Kubernetes, Sysctl, ServiceAccount, StorageClass, ConfigMap, PriorityClass, NetworkPolicy, Taint, PersistentVolume, Kubeconfig, Troubleshooting, HPA, HTTPRoute, Helm, PodCIDR ]
tags: [ CKA, Kubernetes, Sysctl, ServiceAccount, StorageClass, ConfigMap, PriorityClass, NetworkPolicy, Taint, PersistentVolume, Kubeconfig, Troubleshooting, HPA, HTTPRoute, Helm, PodCIDR ]
layout: post
toc: true
math: true
mermaid: true
---

### Q. 1 Sysctl Configuration

**Task:** You are an administrator preparing your environment to deploy a Kubernetes cluster using kubeadm. Adjust the following network parameters on the system to the following values, and make sure your changes persist reboots:

- net.ipv4.ip_forward = 1
- net.bridge.bridge-nf-call-iptables = 1

- **공식문서 링크:**
  - [Install kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/install-kubeadm/)
  - [Container Runtimes](https://kubernetes.io/docs/setup/production-environment/container-runtimes/)
- **검색 키워드:** `sysctl`, `kubeadm prerequisites`, `ip_forward`, `bridge-nf-call-iptables`

**Solution:**

```bash
echo 'net.ipv4.ip_forward = 1' >> /etc/sysctl.conf
echo 'net.bridge.bridge-nf-call-iptables = 1' >> /etc/sysctl.conf
sysctl -p
sysctl net.ipv4.ip_forward
sysctl net.bridge.bridge-nf-call-iptables
```

---

### Q. 2 ServiceAccount & RBAC

**Task:** Create a new service account with the name pvviewer. Grant this Service account access to list all PersistentVolumes in the cluster by creating an appropriate cluster role called pvviewer-role and ClusterRoleBinding called pvviewer-role-binding. Next, create a pod called pvviewer with the image: redis and serviceAccount: pvviewer in the default namespace.

- **공식문서 링크:**
  - [Configure Service Accounts](https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/)
  - [Using RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
- **검색 키워드:** `ServiceAccount`, `ClusterRole`, `ClusterRoleBinding`, `serviceAccountName`

**Solution:**

```bash
kubectl create serviceaccount pvviewer
kubectl create clusterrole pvviewer-role --resource=persistentvolumes --verb=list
kubectl create clusterrolebinding pvviewer-role-binding --clusterrole=pvviewer-role --serviceaccount=default:pvviewer
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: pvviewer
  labels:
    run: pvviewer
spec:
  containers:
    - image: redis
      name: pvviewer
  serviceAccountName: pvviewer
```

```bash
kubectl apply -f pvviewer.yaml
```

---

### Q. 3 StorageClass Configuration

**Task:** Create a StorageClass named rancher-sc with the following specifications:

- The provisioner should be rancher.io/local-path
- The volume binding mode should be WaitForFirstConsumer
- Volume expansion should be enabled

- **공식문서 링크:**
  - [StorageClass](https://kubernetes.io/docs/concepts/storage/storage-classes/)
  - [Local Persistent Volume](https://kubernetes.io/docs/concepts/storage/volumes/#local)
- **검색 키워드:** `StorageClass`, `provisioner`, `volumeBindingMode`, `allowVolumeExpansion`

**Solution:**

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: rancher-sc
provisioner: rancher.io/local-path
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
```

```bash
kubectl apply -f rancher-sc.yaml
kubectl get storageclass rancher-sc
```

---

### Q. 4 ConfigMap & Environment Variables

**Task:** Create a ConfigMap named app-config in the namespace cm-namespace with the following key-value pairs:

- ENV=production
- LOG_LEVEL=info

Then, modify the existing Deployment named cm-webapp in the same namespace to use the app-config ConfigMap by setting the environment variables ENV and LOG_LEVEL in the container from the ConfigMap.

- **공식문서 링크:**
  - [ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)
  - [Configure a Pod to Use a ConfigMap](https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/)
- **검색 키워드:** `ConfigMap`, `kubectl create configmap`, `kubectl set env`, `envFrom`

**Solution:**

```bash
kubectl create configmap app-config -n cm-namespace \
  --from-literal=ENV=production \
  --from-literal=LOG_LEVEL=info
kubectl set env deployment/cm-webapp -n cm-namespace --from=configmap/app-config
```

---

### Q. 5 PriorityClass

**Task:** Create a PriorityClass named low-priority with a value of 50000. A pod named lp-pod exists in the namespace low-priority. Modify the pod to use the priority class you created. Recreate the pod if necessary.

- **공식문서 링크:**
  - [Pod Priority and Preemption](https://kubernetes.io/docs/concepts/scheduling-eviction/pod-priority-preemption/)
  - [PriorityClass](https://kubernetes.io/docs/concepts/scheduling-eviction/pod-priority-preemption/#priorityclass)
- **검색 키워드:** `PriorityClass`, `priorityClassName`, `pod priority`

**Solution:**

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: low-priority
value: 50000
globalDefault: false
description: "Low priority class"
```

```bash
kubectl apply -f pc.yaml
kubectl get pod lp-pod -n low-priority -o yaml > lp-pod.yaml
# Edit lp-pod.yaml to add priorityClassName: low-priority under spec
kubectl delete pod lp-pod -n low-priority
kubectl apply -f lp-pod.yaml
```

---

### Q. 6 NetworkPolicy - Ingress

**Task:** We have deployed a new pod called np-test-1 and a service called np-test-service. Incoming connections to this service are not working. Troubleshoot and fix it. Create NetworkPolicy, by the name ingress-to-nptest that allows incoming connections to the service over port 80.

Important: Don't delete any current objects deployed.

- **공식문서 링크:**
  - [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
  - [Declare Network Policy](https://kubernetes.io/docs/tasks/administer-cluster/declare-network-policy/)
- **검색 키워드:** `NetworkPolicy`, `Ingress`, `podSelector`, `policyTypes`

**Solution:**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ingress-to-nptest
  namespace: default
spec:
  podSelector:
    matchLabels:
      run: np-test-1
  policyTypes:
    - Ingress
  ingress:
    - ports:
        - protocol: TCP
          port: 80
```

```bash
kubectl apply -f ingress-to-nptest.yaml
```

---

### Q. 7 Taints and Tolerations

**Task:** Taint the worker node node01 to be Unschedulable. Once done, create a pod called dev-redis, image redis:alpine, to ensure workloads are not scheduled to this worker node. Finally, create a new pod called prod-redis and image: redis:alpine with toleration to be scheduled on node01.

- key: env_type
- value: production
- operator: Equal
- effect: NoSchedule

- **공식문서 링크:**
  - [Taints and Tolerations](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/)
- **검색 키워드:** `kubectl taint`, `tolerations`, `NoSchedule`

**Solution:**

```bash
kubectl taint node node01 env_type=production:NoSchedule
kubectl run dev-redis --image=redis:alpine
kubectl get pods -o wide
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: prod-redis
spec:
  containers:
    - name: prod-redis
      image: redis:alpine
  tolerations:
    - effect: NoSchedule
      key: env_type
      operator: Equal
      value: production
```

```bash
kubectl apply -f prod-redis.yaml
kubectl get pods -o wide | grep prod-redis
```

---

### Q. 8 PersistentVolume & PersistentVolumeClaim Troubleshooting

**Task:** A PersistentVolumeClaim named app-pvc exists in the namespace storage-ns, but it is not getting bound to the available PersistentVolume named app-pv. Inspect both the PVC and PV and identify why the PVC is not being bound and fix the issue so that the PVC successfully binds to the PV. Do not modify the PV resource.

- **공식문서 링크:**
  - [Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
  - [Configure a Pod to Use a PersistentVolume](https://kubernetes.io/docs/tasks/configure-pod-container/configure-persistent-volume-storage/)
- **검색 키워드:** `PersistentVolume`, `PersistentVolumeClaim`, `accessModes`, `binding`

**Solution:**

```bash
kubectl describe pv app-pv
kubectl describe pvc app-pvc -n storage-ns
kubectl get pvc app-pvc -n storage-ns -o yaml > pvc.yaml
# Edit pvc.yaml to fix accessModes to match PV (e.g., ReadWriteOnce)
kubectl delete pvc app-pvc -n storage-ns
kubectl apply -f pvc.yaml
kubectl get pvc app-pvc -n storage-ns
```

---

### Q. 9 Kubeconfig Troubleshooting

**Task:** A kubeconfig file called super.kubeconfig has been created under /root/CKA. There is something wrong with the configuration. Troubleshoot and fix it.

- **공식문서 링크:**
  - [Organizing Cluster Access Using kubeconfig Files](https://kubernetes.io/docs/concepts/configuration/organize-cluster-access-kubeconfig/)
  - [Configure Access to Multiple Clusters](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)
- **검색 키워드:** `kubeconfig`, `kubectl cluster-info`, `kube-apiserver port`

**Solution:**

```bash
vi /root/CKA/super.kubeconfig
# Change port from 9999 to 6443
kubectl cluster-info --kubeconfig=/root/CKA/super.kubeconfig
```

---

### Q. 10 Troubleshooting - Controller Manager

**Task:** We have created a new deployment called nginx-deploy. Scale the deployment to 3 replicas. Has the number of replicas increased? Troubleshoot and fix the issue.

- **공식문서 링크:**
  - [kube-controller-manager](https://kubernetes.io/docs/reference/command-line-tools-reference/kube-controller-manager/)
  - [Troubleshooting Clusters](https://kubernetes.io/docs/tasks/debug/debug-cluster/)
- **검색 키워드:** `kube-controller-manager`, `static pods`, `troubleshooting`

**Solution:**

```bash
kubectl scale deploy nginx-deploy --replicas=3
kubectl get pods -n kube-system
sed -i 's/kube-contro1ler-manager/kube-controller-manager/g' /etc/kubernetes/manifests/kube-controller-manager.yaml
kubectl get deploy
```

---

### Q. 11 HPA with Custom Metrics

**Task:** Create a Horizontal Pod Autoscaler (HPA) api-hpa for the deployment named api-deployment located in the api namespace. The HPA should scale the deployment based on a custom metric named requests_per_second, targeting an average value of 1000 requests per second across all pods. Set the minimum number of replicas to 1 and the maximum to 20.

Note: Deployment named api-deployment is available in api namespace. Ignore errors due to the metric requests_per_second not being tracked in metrics-server.

- **공식문서 링크:**
  - [Horizontal Pod Autoscaler](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
  - [HPA with Custom Metrics](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale-walkthrough/#autoscaling-on-multiple-metrics-and-custom-metrics)
- **검색 키워드:** `HPA custom metrics`, `Pods metric type`, `AverageValue`

**Solution:**

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
  namespace: api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-deployment
  minReplicas: 1
  maxReplicas: 20
  metrics:
    - type: Pods
      pods:
        metric:
          name: requests_per_second
        target:
          type: AverageValue
          averageValue: "1000"
```

```bash
kubectl create -f api-hpa.yaml
```

---

### Q. 12 Gateway API - HTTPRoute Traffic Splitting

**Task:** Configure the web-route to split traffic between web-service and web-service-v2. The configuration should ensure that 80% of the traffic is routed to web-service and 20% is routed to web-service-v2.

Note: web-gateway, web-service, and web-service-v2 have already been created and are available on the cluster.

- **공식문서 링크:**
  - [Gateway API - HTTPRoute](https://gateway-api.sigs.k8s.io/api-types/httproute/)
  - [Traffic Splitting](https://gateway-api.sigs.k8s.io/guides/traffic-splitting/)
- **검색 키워드:** `HTTPRoute`, `traffic splitting`, `weight`, `backendRefs`

**Solution:**

```bash
kubectl create -n default -f - <<EOF
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
  namespace: default
spec:
  parentRefs:
  - name: web-gateway
    namespace: default
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: web-service
      port: 80
      weight: 80
    - name: web-service-v2
      port: 80
      weight: 20
EOF
```

---

### Q. 13 Helm - Upgrade and Uninstall

**Task:** One application, webpage-server-01, is currently deployed on the Kubernetes cluster using Helm. A new version of the application is available in a Helm chart located at /root/new-version. Validate this new Helm chart, then install it as a new release named webpage-server-02. After confirming the new release is installed, uninstall the old release webpage-server-01.

- **공식문서 링크:**
  - [Helm Install](https://helm.sh/docs/helm/helm_install/)
  - [Helm Lint](https://helm.sh/docs/helm/helm_lint/)
  - [Helm Uninstall](https://helm.sh/docs/helm/helm_uninstall/)
- **검색 키워드:** `helm lint`, `helm install`, `helm uninstall`, `helm ls`

**Solution:**

```bash
helm ls -n default
cd /root/
helm lint ./new-version
helm install webpage-server-02 ./new-version
helm uninstall webpage-server-01 -n default
```

---

### Q. 14 Pod CIDR Configuration

**Task:** While preparing to install a CNI plugin on your Kubernetes cluster, you typically need to confirm the cluster-wide Pod network CIDR. Identify the Pod subnet configured for the cluster (the value specified under podSubnet in the kubeadm configuration). Output this CIDR in the format x.x.x.x/x to a file located at /root/pod-cidr.txt.

- **공식문서 링크:**
  - [Installing a Pod Network Add-on](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/create-cluster-kubeadm/#pod-network)
  - [kubeadm Configuration](https://kubernetes.io/docs/reference/config-api/kubeadm-config.v1beta3/)
- **검색 키워드:** `podSubnet`, `kubeadm-config`, `CNI`, `pod network CIDR`

**Solution:**

```bash
kubectl -n kube-system get configmap kubeadm-config -o yaml | grep podSubnet
kubectl -n kube-system get configmap kubeadm-config -o yaml | awk '/podSubnet:/{print $2}' > /root/pod-cidr.txt
cat /root/pod-cidr.txt
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
kubectl explain priorityclass
kubectl explain networkpolicy.spec
kubectl explain hpa.spec.metrics
```

### 공식문서 검색 전략

1. **Kubernetes 공식 문서:** https://kubernetes.io/docs/
2. **kubectl 치트시트:** https://kubernetes.io/docs/reference/kubectl/cheatsheet/
3. **API Reference:** https://kubernetes.io/docs/reference/kubernetes-api/
4. **Gateway API:** https://gateway-api.sigs.k8s.io/
5. **Helm 문서:** https://helm.sh/docs/
6. **시험 중 검색 키워드:**

- `kubectl <resource>` (예: `kubectl priorityclass`)
- `kubernetes <개념>` (예: `kubernetes taints`)
- `<resource> example` (예: `httproute example`)

### 시험 시 주의사항

1. **항상 namespace 확인:** `-n` 옵션 사용
2. **dry-run 활용:** `--dry-run=client -o yaml`로 템플릿 생성
3. **kubectl explain 활용:** 필드명이나 구조가 불확실할 때
4. **리소스 확인:** `kubectl get`, `kubectl describe`로 검증
5. **공식문서 즐겨찾기:** 시험 시작 전 주요 페이지 북마크
6. **Troubleshooting 순서:** Pods → Events → Logs → Config files
7. **Static Pod 경로:** `/etc/kubernetes/manifests`
