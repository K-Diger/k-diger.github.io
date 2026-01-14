---
title: "CKA Mock Exam - 1"
date: 2026-01-14
categories: [CKA, Container, Kubernetes]
tags: [CKA, Container, Kubernetes, CRD, Operator, Extensibility]
layout: post
toc: true
math: true
mermaid: true
---

### Q. 1 Multi-container Pod

**Task:** Create a Pod `mc-pod` in the `mc-namespace` namespace with three containers. `mc-pod-1` (nginx:1-alpine) with `NODE_NAME` env. `mc-pod-2` (busybox:1) logging `date` to `/var/log/shared/date.log`. `mc-pod-3` (busybox:1) tailing `date.log`. Use a shared `emptyDir` volume.

- **공식문서 링크:** [Configure a Pod to Use a Volume for Storage](https://kubernetes.io/docs/tasks/configure-pod-container/configure-volume-storage/) / [Environment variables from fieldRef](https://www.google.com/search?q=https://kubernetes.io/docs/tasks/inject-data-application/environment-variable-expose-pod-information/%23use-pod-fields-as-values-for-environment-variables)
- **검색 키워드:** `emptyDir`, `fieldRef`

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: mc-pod
  namespace: mc-namespace
spec:
  containers:
  - name: mc-pod-1
    image: nginx:1-alpine
    env:
    - name: NODE_NAME
      valueFrom:
        fieldRef:
          fieldPath: spec.nodeName
  - name: mc-pod-2
    image: busybox:1
    command: ["sh", "-c", "while true; do date >> /var/log/shared/date.log; sleep 1; done"]
    volumeMounts:
    - name: shared-volume
      mountPath: /var/log/shared
  - name: mc-pod-3
    image: busybox:1
    command: ["sh", "-c", "tail -f /var/log/shared/date.log"]
    volumeMounts:
    - name: shared-volume
      mountPath: /var/log/shared
  volumes:
  - name: shared-volume
    emptyDir: {}

```

---

### Q. 2 Install Container Runtime (cri-docker)

**Task:** On `node01`, install `cri-docker_0.3.16.3-0.debian.deb`. Ensure the service is running and enabled on boot.

- **공식문서 링크:** [Container Runtimes (cri-dockerd)](https://www.google.com/search?q=https://kubernetes.io/docs/setup/production-environment/container-runtimes/%23docker-engine)
- **검색 키워드:** `container runtimes`

```bash
# node01 SSH 접속
ssh bob@node01
# root 권한 획득
sudo -i

# 패키지 설치
dpkg -i /root/cri-docker_0.3.16.3-0.debian.deb

# 서비스 활성화 및 시작
systemctl daemon-reload
systemctl enable --now cri-docker

# 상태 확인
systemctl is-active cri-docker
systemctl is-enabled cri-docker

```

---

### Q. 3 Identify CRDs

**Task:** On `controlplane`, identify all CRDs related to `VerticalPodAutoscaler` and save their names into `/root/vpa-crds.txt`.

- **공식문서 링크:** [Custom Resources](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/)
- **검색 키워드:** `kubectl get crd`

```bash
# CRD 목록 조회 및 필터링 후 파일 저장
kubectl get crd -o custom-columns=NAME:.metadata.name | grep verticalpodautoscaler > /root/vpa-crds.txt

# 확인
cat /root/vpa-crds.txt

```

---

### Q. 4 Messaging Service

**Task:** Create a service named `messaging-service` to expose the `messaging` pod within the cluster on port `6379`. (default namespace)

- **공식문서 링크:** [Service (kubectl expose)](https://kubernetes.io/docs/concepts/services-networking/service/)
- **검색 키워드:** `kubectl expose`

```bash
# 명령형 커맨드로 서비스 생성
kubectl expose pod messaging --port=6379 --name messaging-service

```

---

### Q. 5 Create Deployment

**Task:** Create a deployment named `hr-web-app` using the image `kodekloud/webapp-color` with 2 replicas.

- **공식문서 링크:** [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- **검색 키워드:** `kubectl create deployment`

```bash
# 명령형 커맨드로 Deployment 생성
kubectl create deployment hr-web-app --image=kodekloud/webapp-color --replicas=2

```

---

### Q. 6 Fix Broken Pod (InitContainer)

**Task:** Identify and fix the issue in the `orange` pod. (InitContainer command has a typo `sleeeep`).

- **공식문서 링크:** [Init Containers](https://kubernetes.io/docs/concepts/workloads/pods/init-containers/)
- **검색 키워드:** `init containers`

```bash
# Pod 정보 확인
kubectl describe po orange

# 수정 시도 (Pod은 실행 중 수정에 제한이 있으므로 replace 사용)
kubectl get pod orange -o yaml > orange.yaml
# vi로 sleeeep 2를 sleep 2로 수정
vi orange.yaml

# 기존 Pod 삭제 후 재생성
kubectl replace -f orange.yaml --force

```

---

### Q. 7 Expose Deployment as NodePort

**Task:** Expose `hr-web-app` as `hr-web-app-service` on port `30082`. App listens on `8080`.

- **공식문서 링크:** [Service NodePort](https://www.google.com/search?q=https://kubernetes.io/docs/concepts/services-networking/service/%23type-nodeport)
- **검색 키워드:** `Service NodePort`

```bash
# YAML 생성
kubectl expose deployment hr-web-app --type=NodePort --port=8080 --name=hr-web-app-service --dry-run=client -o yaml > hr-web-app-service.yaml

# vi로 nodePort 필드 추가 (spec.ports 아래)
vi hr-web-app-service.yaml
# nodePort: 30082 추가

# 서비스 생성
kubectl apply -f hr-web-app-service.yaml

```

---

### Q. 8 Persistent Volume

**Task:** Create a PV named `pv-analytics` with 100Mi, ReadWriteMany, and hostPath `/pv/data-analytics`.

- **공식문서 링크:** [Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
- **검색 키워드:** `PersistentVolume hostPath`

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-analytics
spec:
  capacity:
    storage: 100Mi
  volumeMode: Filesystem
  accessModes:
    - ReadWriteMany
  hostPath:
    path: /pv/data-analytics

```

---

### Q. 9 Horizontal Pod Autoscaler (HPA)

**Task:** Create HPA `webapp-hpa` for `kkapp-deploy`. CPU 50% target. Stabilization window 300s for scale down.

- **공식문서 링크:** [HPA Behavior](https://www.google.com/search?q=https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/%23configurable-scaling-behavior)
- **검색 키워드:** `stabilizationWindowSeconds`

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: webapp-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: kkapp-deploy
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300

```

---

### Q. 10 Vertical Pod Autoscaler (VPA)

**Task:** Deploy VPA `analytics-vpa` for `analytics-deployment` in `Recreate` mode.

- **공식문서 링크:** [VPA (External Repo)](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler)
- **검색 키워드:** `VerticalPodAutoscaler` (보통 시험 환경에서 제공되는 예제 문서나 `kubectl explain vpa` 활용)

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: analytics-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: analytics-deployment
  updatePolicy:
    updateMode: "Recreate"

```

---

### Q. 11 Kubernetes Gateway

**Task:** Create Gateway `web-gateway` in namespace `nginx-gateway` with `GatewayClass` nginx, HTTP, port 80.

- **공식문서 링크:** [Gateway API](https://gateway-api.sigs.k8s.io/api-types/gateway/)
- **검색 키워드:** `Gateway API spec`

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: web-gateway
  namespace: nginx-gateway
spec:
  gatewayClassName: nginx
  listeners:
    - name: http
      protocol: HTTP
      port: 80

```

---

### Q. 12 Helm Repo and Upgrade

**Task:** Update helm repo `kk-mock1`. Upgrade chart version to `18.1.15` and replicas to 2 in namespace `kk-ns`.

- **공식문서 링크:** [Helm Upgrade](https://helm.sh/docs/helm/helm_upgrade/)
- **검색 키워드:** `helm upgrade`, `helm repo update`

```bash
# 리포지토리 목록 확인 및 업데이트
helm repo ls
helm repo update

# 차트 버전 확인
helm search repo kk-mock1/nginx --versions

# 업그레이드 (replicas 변경 포함)
helm upgrade kk-mock1 kk-mock1/nginx -n kk-ns --version 18.1.15 --set replicaCount=2

# 결과 확인
helm ls -n kk-ns

```
