---
title: "CKA Mock Exam 4"
date: 2026-02-15
categories: [ CKA, Kubernetes, PersistentVolume, StorageClass, ArgoCD, Helm, Sidecar, GatewayAPI, HTTPRoute, ResourceQuota, PriorityClass, CRD, CNI, NetworkPolicy, HPA, Ingress, CRI, Troubleshooting, NodePort, TLS, Scheduling, Kustomize, CoreDNS, StatefulSet, PodSecurity, Taint ]
tags: [ CKA, Kubernetes, PersistentVolume, StorageClass, ArgoCD, Helm, Sidecar, GatewayAPI, HTTPRoute, ResourceQuota, PriorityClass, CRD, CNI, NetworkPolicy, HPA, Ingress, CRI, Troubleshooting, NodePort, TLS, Scheduling, Kustomize, CoreDNS, StatefulSet, PodSecurity, Taint ]
layout: post
toc: true
math: true
mermaid: true
---

> 이 문제 세트는 아래 3개의 YouTube CKA 재생목록과 Alta3 Research의 종합 영상에서 다루는 CKA 시험 문제를 종합 정리한 것이다.
>
> - [CKA-2k25 (JayDemy)](https://www.youtube.com/playlist?list=PLSsEvm2nF_8nGkhMyD1sq-DqjwQq8fAii) - 18개 영상
> - [Practice Questions CKA EXAM 2026 (IT Kiddie)](https://www.youtube.com/playlist?list=PLkDZsCgo3Isr4NB5cmyqG7OZwYEx5XOjM) - 18개 영상
> - [CKA 2025 (DumbITGuy)](https://www.youtube.com/playlist?list=PLvZb3tGyqC1TOasSaN36haM5xlCxHQBlA) - 18개 영상
> - [2025 CKA Exam Questions & Solutions UPDATE (Alta3 Research)](https://www.youtube.com/watch?v=eGv6iPWQKyo) - 14 Tasks 종합

---

### Q. 1 Dynamic PVC (PersistentVolumeClaim)

**Task:** Create a PersistentVolumeClaim named `data-pvc` in the `default` namespace that dynamically provisions storage using the existing StorageClass `standard`. The PVC should request 1Gi of storage with ReadWriteOnce access mode. Then, create a Pod named `data-pod` using the image `nginx:1.26` that mounts this PVC at `/usr/share/nginx/html`.

- **공식문서 링크:**
  - [Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
  - [Configure a Pod to Use a PersistentVolume](https://kubernetes.io/docs/tasks/configure-pod-container/configure-persistent-volume-storage/)ㅇ
- **검색 키워드:** `PersistentVolumeClaim`, `dynamic provisioning`, `storageClassName`, `volumeMounts`

**풀이 과정:**

1단계: 문제를 읽고 두 가지를 파악한다. (1) PVC 생성 (2) Pod에 PVC 마운트. Dynamic provisioning이므로 PV를 직접 만들 필요 없이 StorageClass가 자동으로 PV를 생성한다.

2단계: 사용 가능한 StorageClass를 먼저 확인한다.

```bash
kubectl get storageclass
```

`standard`가 존재하는지, provisioner가 무엇인지 확인한다. Dynamic provisioning은 provisioner가 `kubernetes.io/no-provisioner`가 아닌 경우에만 동작한다.

3단계: PVC를 만든다.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
  storageClassName: standard
```

4단계: Pod를 만든다. `kubectl run`으로 빠르게 뼈대를 생성한 후 volumes/volumeMounts를 추가한다.

```bash
kubectl run data-pod --image=nginx:1.26 --dry-run=client -o yaml > data-pod.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: data-pod
spec:
  containers:
    - name: data-pod
      image: nginx:1.26
      volumeMounts:
        - name: data-volume
          mountPath: /usr/share/nginx/html
  volumes:
    - name: data-volume
      persistentVolumeClaim:
        claimName: data-pvc
```

5단계: 적용하고 확인한다.

```bash
kubectl apply -f pvc.yaml
kubectl apply -f data-pod.yaml
kubectl get pvc data-pvc
kubectl get pod data-pod
```

PVC의 STATUS가 `Bound`이고 Pod이 `Running`이면 성공이다. Dynamic provisioning에서는 PVC를 생성하면 PV가 자동으로 만들어진다.

---

### Q. 2 StorageClass

**Task:** Create a new StorageClass named `local-kiddie` with the provisioner `rancher.io/local-path`. Set the `volumeBindingMode` to `WaitForFirstConsumer`. Configure this StorageClass as the default StorageClass. Do not modify any existing Deployments or PersistentVolumeClaims.

- **공식문서 링크:**
  - [Storage Classes](https://kubernetes.io/docs/concepts/storage/storage-classes/)
  - [Change the Default StorageClass](https://kubernetes.io/docs/tasks/administer-cluster/change-default-storage-class/)
- **검색 키워드:** `StorageClass`, `provisioner`, `volumeBindingMode`, `default StorageClass annotation`

**풀이 과정:**

1단계: 현재 default StorageClass가 있는지 확인한다.

```bash
kubectl get storageclass
```

`(default)` 표시가 있는 StorageClass가 있다면, 새로 만든 것을 default로 설정하기 전에 기존 것의 annotation을 제거해야 한다. 클러스터에 default StorageClass가 2개이면 PVC가 어떤 것을 사용할지 모호해진다.

2단계: 기존 default StorageClass가 있다면 annotation을 먼저 제거한다.

```bash
kubectl patch storageclass <기존-SC-이름> -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'
```

3단계: StorageClass를 생성한다.

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: local-kiddie
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: rancher.io/local-path
volumeBindingMode: WaitForFirstConsumer
```

핵심: `volumeBindingMode: WaitForFirstConsumer`는 PVC가 생성되어도 즉시 바인딩하지 않고, Pod이 스케줄링될 때 해당 노드의 PV에 바인딩한다. 로컬 스토리지에서 필수적인 설정이다. 문제에서 "기존 Deployment나 PVC를 수정하지 마라"고 명시했으므로, 기존 리소스가 사용 중인 SC를 건드리지 않도록 주의한다.

4단계: 적용하고 확인한다.

```bash
kubectl apply -f local-kiddie.yaml
kubectl get storageclass
```

`local-kiddie (default)`로 표시되고, 기존 SC에는 `(default)`가 없어야 한다.

---

### Q. 3 PVC Binding and Deployment Update (MariaDB)

**Task:** A Persistent Volume already exists and is retained for reuse. Create a PersistentVolumeClaim named `MariaDB` in the `mariadb` namespace as follows:

1. Access mode `ReadWriteOnce`
2. Storage capacity `250Mi`

Edit the maria-deployment in the file located at `maria.deploy.yaml` to use the newly created PVC. Verify that the deployment is running and is stable.

- **공식문서 링크:**
  - [Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
  - [Configure a Pod to Use a PersistentVolume](https://kubernetes.io/docs/tasks/configure-pod-container/configure-persistent-volume-storage/)
- **검색 키워드:** `PersistentVolumeClaim`, `volumeMounts`, `persistentVolumeClaim`, `Deployment volume`

**풀이 과정:**

1단계: 기존 PV를 먼저 확인한다. PVC가 기존 PV에 바인딩되려면 accessModes, storageClassName, capacity가 호환되어야 한다.

```bash
kubectl get pv
kubectl get pv <pv-name> -o yaml
```

PV의 `storageClassName`, `capacity`, `accessModes`를 메모한다. PVC에서 동일한 storageClassName을 사용해야 바인딩된다.

2단계: PVC를 만든다.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: MariaDB
  namespace: mariadb
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 250Mi
  storageClassName: <PV에서-확인한-값>
```

PVC의 요청 용량은 PV의 capacity 이하여야 한다. PV가 Available 상태인지도 확인한다. 이전에 사용된 PV가 Released 상태라면 `claimRef`를 제거해야 재바인딩된다.

3단계: PVC를 적용하고 바인딩을 확인한다.

```bash
kubectl apply -f pvc.yaml
kubectl get pvc MariaDB -n mariadb
```

4단계: `maria.deploy.yaml` 파일을 편집하여 PVC를 마운트한다.

```bash
vi maria.deploy.yaml
```

spec.template.spec 아래에 volumes와 volumeMounts를 추가한다:

```yaml
spec:
  template:
    spec:
      containers:
        - name: mariadb
          # 기존 설정 유지
          volumeMounts:
            - name: mariadb-storage
              mountPath: /var/lib/mysql
      volumes:
        - name: mariadb-storage
          persistentVolumeClaim:
            claimName: MariaDB
```

5단계: 배포하고 안정성을 확인한다.

```bash
kubectl apply -f maria.deploy.yaml
kubectl get deploy -n mariadb
kubectl get pods -n mariadb
kubectl rollout status deployment maria-deployment -n mariadb
```

Pod가 Running이고 READY가 1/1이면 성공이다. `rollout status`로 stable 상태를 확인한다.

---

### Q. 4 HPA (Horizontal Pod Autoscaler)

**Task:** Create a new HorizontalPodAutoscaler (HPA) named `apache-server` in the `autoscale` namespace. The HPA should:

1. Target the existing Deployment `apache-deployment` in the `autoscale` namespace
2. Target 50% CPU usage per Pod
3. Have a minimum of 1 Pod and maximum of 4 Pods
4. Set the downscale stabilization window to 30 seconds

- **공식문서 링크:**
  - [Horizontal Pod Autoscaler](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
  - [HPA Walkthrough](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale-walkthrough/)
- **검색 키워드:** `HPA`, `autoscale`, `cpu-percent`, `behavior`, `scaleDown`, `stabilizationWindowSeconds`

**풀이 과정:**

1단계: Deployment가 존재하는지, 그리고 resource requests가 설정되어 있는지 먼저 확인한다. HPA의 CPU 기반 오토스케일링은 컨테이너에 `resources.requests.cpu`가 설정되어 있어야 동작한다.

```bash
kubectl get deploy apache-deployment -n autoscale
kubectl describe deploy apache-deployment -n autoscale | grep -A 3 "Requests"
```

2단계: `kubectl autoscale`로 기본 HPA를 만들 수 있지만, downscale stabilization window 설정은 CLI로 불가능하다. 반드시 YAML로 작성해야 한다.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: apache-server
  namespace: autoscale
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: apache-deployment
  minReplicas: 1
  maxReplicas: 4
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 30
```

핵심: `behavior.scaleDown.stabilizationWindowSeconds`는 `autoscaling/v2` API에서만 사용 가능하다. `autoscaling/v1`에는 이 필드가 없다. 공식문서에서 "Configurable scaling behavior" 섹션을 참고한다. 기본값은 300초(5분)인데, 문제에서 30초로 요구하고 있다.

3단계: 적용하고 확인한다.

```bash
kubectl apply -f hpa.yaml
kubectl get hpa apache-server -n autoscale
kubectl describe hpa apache-server -n autoscale | grep -A 5 "Behavior"
```

TARGETS 컬럼에 `<unknown>/50%`가 표시될 수 있다. 이는 metrics-server가 아직 메트릭을 수집하지 않은 것이며, HPA 자체는 정상적으로 생성된 것이다. MINPODS=1, MAXPODS=4가 맞는지, Behavior에서 scaleDown stabilization이 30s인지 확인한다.

---

### Q. 5 Node Affinity

**Task:** Schedule a Pod named `cache-pod` with the image `redis:7` on a node that has the label `disktype=ssd`. Use `requiredDuringSchedulingIgnoredDuringExecution` node affinity. The Pod should be created in the `default` namespace.

- **공식문서 링크:**
  - [Assign Pods to Nodes using Node Affinity](https://kubernetes.io/docs/tasks/configure-pod-container/assign-pods-nodes-using-node-affinity/)
  - [Node Affinity](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/#node-affinity)
- **검색 키워드:** `nodeAffinity`, `requiredDuringSchedulingIgnoredDuringExecution`, `nodeSelectorTerms`

**풀이 과정:**

1단계: 해당 라벨이 있는 노드가 있는지 확인한다.

```bash
kubectl get nodes --show-labels | grep disktype
```

2단계: `kubectl run`으로 Pod 뼈대를 생성한다.

```bash
kubectl run cache-pod --image=redis:7 --dry-run=client -o yaml > cache-pod.yaml
```

3단계: YAML에 nodeAffinity를 추가한다. 이 부분은 구조가 복잡하므로 공식문서에서 복사하는 것이 안전하다. `kubernetes.io/docs` → 검색 `node affinity` → 예시 복사.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: cache-pod
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: disktype
                operator: In
                values:
                  - ssd
  containers:
    - name: cache-pod
      image: redis:7
```

nodeSelector와의 차이: nodeSelector는 단순 key=value 매칭만 가능하다. nodeAffinity는 `In`, `NotIn`, `Exists`, `DoesNotExist`, `Gt`, `Lt` 연산자를 지원한다. 문제에서 `nodeAffinity`를 명시적으로 요구하면 반드시 affinity 구문을 써야 한다.

4단계: 적용하고 확인한다.

```bash
kubectl apply -f cache-pod.yaml
kubectl get pod cache-pod -o wide
```

NODE 컬럼에 `disktype=ssd` 라벨이 있는 노드가 표시되는지 확인한다.

---

### Q. 6 Pod Security (Pod Security Admission)

**Task:** Configure the namespace `restricted-ns` to enforce the `restricted` Pod Security Standard. Then verify that a Pod with `privileged: true` in its securityContext cannot be created in this namespace.

- **공식문서 링크:**
  - [Pod Security Admission](https://kubernetes.io/docs/concepts/security/pod-security-admission/)
  - [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- **검색 키워드:** `pod-security.kubernetes.io/enforce`, `Pod Security Standards`, `restricted`

**풀이 과정:**

1단계: Pod Security Admission은 namespace에 label을 붙여서 적용한다. 3가지 모드가 있다:
- `enforce`: 위반 Pod 생성 거부
- `audit`: 위반 Pod 허용하지만 감사 로그 기록
- `warn`: 위반 Pod 허용하지만 경고 표시

2단계: namespace에 enforce 레이블을 붙인다.

```bash
kubectl label namespace restricted-ns \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/enforce-version=latest
```

3단계: privileged Pod 생성을 시도하여 거부되는지 확인한다.

```bash
kubectl run test-pod --image=nginx -n restricted-ns \
  --overrides='{"spec":{"containers":[{"name":"test","image":"nginx","securityContext":{"privileged":true}}]}}' \
  --dry-run=server
```

`Error from server (Forbidden)` 메시지가 나오면 PSA가 정상 동작하는 것이다.

4단계: restricted 정책을 준수하는 Pod를 만들어서 정상 생성되는지도 확인한다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: compliant-pod
  namespace: restricted-ns
spec:
  securityContext:
    runAsNonRoot: true
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: app
      image: nginx:1.26
      securityContext:
        allowPrivilegeEscalation: false
        capabilities:
          drop:
            - ALL
```

---

### Q. 7 Taints and Tolerations

**Task:** Taint the worker node `node01` with key `env`, value `production`, and effect `NoSchedule`. Then create a Pod named `prod-pod` with image `nginx:1.26` that has a toleration for this taint and is guaranteed to be scheduled on `node01`.

- **공식문서 링크:**
  - [Taints and Tolerations](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/)
- **검색 키워드:** `kubectl taint`, `tolerations`, `NoSchedule`, `nodeSelector`

**풀이 과정:**

1단계: 노드에 taint를 추가한다.

```bash
kubectl taint node node01 env=production:NoSchedule
```

2단계: taint가 적용되었는지 확인한다.

```bash
kubectl describe node node01 | grep -A 3 Taints
```

3단계: toleration만으로는 해당 노드에 "반드시" 스케줄링되지 않는다. toleration은 "taint가 있어도 스케줄링 될 수 있다"는 의미이지, "반드시 그 노드에 간다"는 뜻이 아니다. 문제에서 "guaranteed to be scheduled on node01"을 요구하면 `nodeSelector`나 `nodeName`을 함께 사용해야 한다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: prod-pod
spec:
  nodeSelector:
    kubernetes.io/hostname: node01
  tolerations:
    - key: env
      operator: Equal
      value: production
      effect: NoSchedule
  containers:
    - name: prod-pod
      image: nginx:1.26
```

4단계: 적용하고 확인한다.

```bash
kubectl apply -f prod-pod.yaml
kubectl get pod prod-pod -o wide
```

NODE 컬럼에 `node01`이 표시되고 Pod이 Running이면 성공이다.

---

### Q. 8 StatefulSet and Headless Service

**Task:** Create a Headless Service named `db-headless` and a StatefulSet named `db-statefulset` in the `database` namespace. The StatefulSet should:

- Use the image `postgres:16`
- Have 3 replicas
- Use the headless service `db-headless` for stable network identity
- Have a volumeClaimTemplate requesting 5Gi with StorageClass `standard`

- **공식문서 링크:**
  - [StatefulSets](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)
  - [Headless Services](https://kubernetes.io/docs/concepts/services-networking/service/#headless-services)
- **검색 키워드:** `StatefulSet`, `Headless Service`, `clusterIP: None`, `volumeClaimTemplates`

**풀이 과정:**

1단계: StatefulSet은 Deployment와 달리 각 Pod이 고유한 이름(db-statefulset-0, db-statefulset-1, db-statefulset-2)과 안정적인 네트워크 ID를 갖는다. 이를 위해 Headless Service가 필수이다.

2단계: Headless Service를 먼저 만든다. Headless Service는 `clusterIP: None`으로 설정한다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: db-headless
  namespace: database
spec:
  clusterIP: None
  selector:
    app: db
  ports:
    - port: 5432
      targetPort: 5432
```

3단계: StatefulSet을 만든다. 공식문서에서 예시를 복사하는 것이 안전하다.

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: db-statefulset
  namespace: database
spec:
  serviceName: db-headless
  replicas: 3
  selector:
    matchLabels:
      app: db
  template:
    metadata:
      labels:
        app: db
    spec:
      containers:
        - name: postgres
          image: postgres:16
          ports:
            - containerPort: 5432
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes:
          - ReadWriteOnce
        storageClassName: standard
        resources:
          requests:
            storage: 5Gi
```

핵심 필드:
- `serviceName`은 Headless Service의 이름과 정확히 일치해야 한다.
- `volumeClaimTemplates`는 각 Pod마다 개별 PVC를 자동 생성한다.
- selector의 matchLabels와 template의 labels가 일치해야 한다.

4단계: 적용하고 확인한다.

```bash
kubectl apply -f headless-svc.yaml
kubectl apply -f statefulset.yaml
kubectl get pods -n database -w
kubectl get pvc -n database
```

Pod가 순서대로(0→1→2) 생성되고, 각각의 PVC가 자동으로 만들어지면 성공이다.

---

### Q. 9 CoreDNS Troubleshooting

**Task:** DNS resolution is not working in the cluster. Pods cannot resolve Service names. Investigate and fix the CoreDNS issue. The CoreDNS pods may be in CrashLoopBackOff or have configuration errors.

- **공식문서 링크:**
  - [Debugging DNS Resolution](https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/)
  - [Customizing DNS Service](https://kubernetes.io/docs/tasks/administer-cluster/dns-custom-nameservers/)
- **검색 키워드:** `CoreDNS`, `kube-dns`, `DNS troubleshooting`, `Corefile`

**풀이 과정:**

1단계: CoreDNS Pod의 상태를 확인한다.

```bash
kubectl get pods -n kube-system -l k8s-app=kube-dns
```

CrashLoopBackOff이면 로그를 확인한다.

```bash
kubectl logs -n kube-system -l k8s-app=kube-dns
```

2단계: CoreDNS ConfigMap을 확인한다.

```bash
kubectl get configmap coredns -n kube-system -o yaml
```

자주 발생하는 오류:
- Corefile에 오타 (예: `kubernetse` → `kubernetes`)
- `loop` 플러그인이 있을 때 `/etc/resolv.conf`의 upstream DNS가 CoreDNS 자신을 가리키면 루프 감지로 CrashLoopBackOff 발생
- `forward` 지시어의 upstream DNS가 잘못됨

3단계: 문제를 수정한다. 예를 들어 loop 문제인 경우:

```bash
kubectl edit configmap coredns -n kube-system
```

`loop` 줄을 제거하거나, `forward . /etc/resolv.conf`를 `forward . 8.8.8.8`으로 변경한다.

4단계: CoreDNS Pod를 재시작한다. ConfigMap을 변경해도 기존 Pod는 자동으로 재시작되지 않는다.

```bash
kubectl rollout restart deployment coredns -n kube-system
```

5단계: DNS 해석이 되는지 확인한다.

```bash
kubectl run dnstest --image=busybox:1.36 --rm -it --restart=Never -- nslookup kubernetes.default
```

응답이 돌아오면 성공이다.

---

### Q. 10 CoreDNS Configuration (Custom DNS)

**Task:** Configure CoreDNS to forward DNS queries for the domain `company.local` to the custom DNS server at `10.0.0.53`. All other queries should continue to use the default upstream DNS.

- **공식문서 링크:**
  - [Customizing DNS Service](https://kubernetes.io/docs/tasks/administer-cluster/dns-custom-nameservers/)
- **검색 키워드:** `CoreDNS`, `Corefile`, `forward`, `stub domain`

**풀이 과정:**

1단계: 현재 CoreDNS ConfigMap을 확인한다.

```bash
kubectl get configmap coredns -n kube-system -o yaml
```

기존 Corefile 구조를 파악한다.

2단계: ConfigMap을 편집하여 `company.local` 서버 블록을 추가한다.

```bash
kubectl edit configmap coredns -n kube-system
```

Corefile의 데이터에 새 서버 블록을 추가한다:

```
company.local:53 {
    errors
    cache 30
    forward . 10.0.0.53
}
```

기존 `.` 서버 블록은 그대로 유지한다. 전체 Corefile은 이런 형태가 된다:

```
.:53 {
    errors
    health
    ready
    kubernetes cluster.local in-addr.arpa ip6.arpa {
       pods insecure
       fallthrough in-addr.arpa ip6.arpa
    }
    prometheus :9153
    forward . /etc/resolv.conf
    cache 30
    loop
    reload
    loadbalance
}
company.local:53 {
    errors
    cache 30
    forward . 10.0.0.53
}
```

3단계: CoreDNS를 재시작한다.

```bash
kubectl rollout restart deployment coredns -n kube-system
```

4단계: 확인한다. `company.local` 도메인의 DNS 해석이 10.0.0.53에서 처리되는지 확인한다.

```bash
kubectl run dnstest --image=busybox:1.36 --rm -it --restart=Never -- nslookup test.company.local
```

---

### Q. 11 Helm (Install / Upgrade / Uninstall)

**Task:** A Helm chart is available at `/opt/course/webapp-chart`. Validate the chart, then install it as a release named `webapp` in the `webapp` namespace. After verifying the installation, a new version of the chart is available at `/opt/course/webapp-chart-v2`. Upgrade the release to the new version.

- **공식문서 링크:**
  - [Helm Install](https://helm.sh/docs/helm/helm_install/)
  - [Helm Upgrade](https://helm.sh/docs/helm/helm_upgrade/)
  - [Helm Lint](https://helm.sh/docs/helm/helm_lint/)
- **검색 키워드:** `helm install`, `helm upgrade`, `helm lint`, `helm ls`

**풀이 과정:**

1단계: namespace를 생성한다.

```bash
kubectl create namespace webapp
```

2단계: 차트를 lint로 검증한다.

```bash
helm lint /opt/course/webapp-chart
```

ERROR가 없으면 진행한다.

3단계: 설치한다.

```bash
helm install webapp /opt/course/webapp-chart -n webapp
```

4단계: 설치 확인한다.

```bash
helm ls -n webapp
kubectl get pods -n webapp
```

STATUS가 `deployed`이고 Pod들이 Running이면 정상이다.

5단계: v2 차트도 lint한다.

```bash
helm lint /opt/course/webapp-chart-v2
```

6단계: 업그레이드한다.

```bash
helm upgrade webapp /opt/course/webapp-chart-v2 -n webapp
```

7단계: 업그레이드 확인한다.

```bash
helm ls -n webapp
helm history webapp -n webapp
```

REVISION이 2가 되고, STATUS가 `deployed`이면 성공이다.

---

### Q. 12 Kustomize

**Task:** In the directory `/opt/course/kustomize/`, a base deployment configuration exists. Create a Kustomization that:

- Uses the base from `./base/`
- Sets the namespace to `staging`
- Adds the label `env: staging` to all resources
- Changes the image from `nginx:1.25` to `nginx:1.26`

Apply the kustomization to the cluster.

- **공식문서 링크:**
  - [Kustomize](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/)
- **검색 키워드:** `kustomize`, `kustomization.yaml`, `kubectl apply -k`, `commonLabels`

**풀이 과정:**

1단계: base 디렉토리 구조를 확인한다.

```bash
ls /opt/course/kustomize/base/
cat /opt/course/kustomize/base/kustomization.yaml
```

2단계: overlay 디렉토리에 kustomization.yaml을 작성한다.

```bash
cd /opt/course/kustomize/
```

```yaml
# /opt/course/kustomize/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ./base/
namespace: staging
commonLabels:
  env: staging
images:
  - name: nginx
    newTag: "1.26"
```

핵심:
- `resources`로 base를 참조한다
- `namespace`는 모든 리소스에 namespace를 설정한다
- `commonLabels`는 모든 리소스와 selector에 라벨을 추가한다
- `images`는 이미지 태그를 변경한다

3단계: 적용 전에 미리보기로 확인한다.

```bash
kubectl kustomize /opt/course/kustomize/
```

출력된 YAML에서 namespace, labels, image가 의도대로 변경되었는지 확인한다.

4단계: 적용한다.

```bash
kubectl apply -k /opt/course/kustomize/
```

5단계: 확인한다.

```bash
kubectl get all -n staging --show-labels
```

---

### Q. 13 Gateway API - Ingress Migration

**Task:** You have an existing web application deployed in a Kubernetes cluster using an Ingress resource named `web`. You must migrate the existing Ingress configuration to the new Kubernetes Gateway API, maintaining the existing HTTPS access configuration.

Tasks:
1. Create a Gateway resource named `web-gateway` with hostname `gateway.web.k8s.local` that maintains the existing TLS and listener configuration from the existing Ingress resource named `web`
2. Create an HTTPRoute resource named `web-route` with hostname `gateway.web.k8s.local` that maintains the existing routing rules from the current Ingress resource named `web`

Note: A GatewayClass named `nginx-class` is already installed in the cluster.

- **공식문서 링크:**
  - [Gateway API - HTTPRoute](https://gateway-api.sigs.k8s.io/api-types/httproute/)
  - [Gateway API - Gateway](https://gateway-api.sigs.k8s.io/api-types/gateway/)
  - [Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)
- **검색 키워드:** `Gateway`, `HTTPRoute`, `GatewayClass`, `Ingress migration`, `TLS`, `parentRefs`

**풀이 과정:**

1단계: 기존 Ingress 설정을 먼저 확인한다. 마이그레이션이므로 원본 설정을 정확히 파악해야 한다.

```bash
kubectl get ingress web -o yaml
```

TLS 설정(host, secretName), 라우팅 룰(host, path, backend service, port)을 메모한다.

2단계: GatewayClass 존재 여부를 확인한다.

```bash
kubectl get gatewayclass
```

`nginx-class`가 존재하는지 확인한다.

3단계: 기존 Ingress의 TLS 설정을 기반으로 Gateway를 만든다.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: web-gateway
spec:
  gatewayClassName: nginx-class
  listeners:
    - name: https
      hostname: gateway.web.k8s.local
      port: 443
      protocol: HTTPS
      tls:
        mode: Terminate
        certificateRefs:
          - name: <Ingress에서-확인한-TLS-secret-이름>
```

핵심: 기존 Ingress의 `spec.tls[].secretName`을 Gateway의 `certificateRefs`에 매핑한다. Ingress의 호스트명은 문제에서 요구한 `gateway.web.k8s.local`로 변경한다.

4단계: 기존 Ingress의 라우팅 룰을 기반으로 HTTPRoute를 만든다.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
spec:
  parentRefs:
    - name: web-gateway
  hostnames:
    - gateway.web.k8s.local
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: <Ingress에서-확인한-backend-service-이름>
          port: <Ingress에서-확인한-port>
```

5단계: 적용하고 확인한다.

```bash
kubectl apply -f gateway.yaml
kubectl apply -f httproute.yaml
kubectl get gateway web-gateway
kubectl describe gateway web-gateway
kubectl get httproute web-route
kubectl describe httproute web-route
```

Gateway의 Conditions에서 `Accepted: True`, HTTPRoute의 Parents에서 `Accepted: True`가 표시되면 성공이다. 기존 Ingress는 삭제하지 않아도 된다(문제에서 요구하지 않는 한).

---

### Q. 14 Pod Admission / LimitRange

**Task:** Create a LimitRange named `resource-limits` in the `dev` namespace that sets:

- Default CPU request: 100m
- Default CPU limit: 200m
- Default Memory request: 128Mi
- Default Memory limit: 256Mi
- Maximum CPU: 1
- Maximum Memory: 1Gi

- **공식문서 링크:**
  - [Limit Ranges](https://kubernetes.io/docs/concepts/policy/limit-range/)
  - [Configure Default CPU Requests and Limits](https://kubernetes.io/docs/tasks/administer-cluster/manage-resources/cpu-default-namespace/)
- **검색 키워드:** `LimitRange`, `default`, `defaultRequest`, `max`, `min`

**풀이 과정:**

1단계: LimitRange는 namespace 수준에서 Pod/Container에 기본 리소스 제한을 설정한다. 리소스를 명시하지 않은 Pod에 자동으로 기본값이 적용된다.

2단계: 공식문서에서 예시를 찾는다. `kubernetes.io/docs` → 검색 `limit range`

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: resource-limits
  namespace: dev
spec:
  limits:
    - type: Container
      default:
        cpu: "200m"
        memory: "256Mi"
      defaultRequest:
        cpu: "100m"
        memory: "128Mi"
      max:
        cpu: "1"
        memory: "1Gi"
```

핵심 필드 정리:
- `default`: 컨테이너에 limits를 지정하지 않았을 때 적용되는 기본 limits
- `defaultRequest`: 컨테이너에 requests를 지정하지 않았을 때 적용되는 기본 requests
- `max`: 해당 namespace에서 컨테이너가 요청할 수 있는 최대값

3단계: 적용하고 확인한다.

```bash
kubectl apply -f limitrange.yaml
kubectl describe limitrange resource-limits -n dev
```

4단계: 검증을 위해 리소스를 지정하지 않은 Pod를 만들어본다.

```bash
kubectl run test-pod --image=nginx -n dev
kubectl describe pod test-pod -n dev | grep -A 5 "Limits\|Requests"
```

자동으로 기본값이 적용되어 있으면 성공이다.

---

### Q. 15 Sidecar Container

**Task:** Update the existing Deployment `wordpress`, adding a sidecar container named `sidecar` using the `busybox:stable` image to the existing Pod. The new sidecar container has to run the following command: `/bin/sh -c "tail -f /var/log/wordpress.log"`. Use a volume mounted at `/var/log` to make the log file `wordpress.log` available to the co-located container.

- **공식문서 링크:**
  - [Sidecar Containers](https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/)
  - [Init Containers](https://kubernetes.io/docs/concepts/workloads/pods/init-containers/)
- **검색 키워드:** `sidecar container`, `emptyDir`, `restartPolicy: Always`, `initContainers`

**풀이 과정:**

1단계: 기존 Deployment를 확인한다. Pod가 아닌 Deployment이므로 `kubectl edit`으로 직접 수정할 수 있다.

```bash
kubectl get deploy wordpress -o yaml
```

기존 컨테이너의 volumeMounts 설정을 확인한다. 이미 `/var/log`에 마운트된 볼륨이 있는지 본다.

2단계: Deployment를 편집한다.

```bash
kubectl edit deploy wordpress
```

3단계: emptyDir 볼륨을 `spec.template.spec.volumes`에 추가한다(아직 없는 경우).

```yaml
volumes:
  - name: log-volume
    emptyDir: {}
```

4단계: 기존 wordpress 컨테이너에 volumeMounts를 추가한다(아직 없는 경우).

```yaml
volumeMounts:
  - name: log-volume
    mountPath: /var/log
```

5단계: 네이티브 사이드카를 `spec.template.spec.initContainers`에 추가한다. CKA 2025/2026에서는 `initContainers`에 `restartPolicy: Always`를 지정하는 것이 네이티브 사이드카 패턴이다.

```yaml
initContainers:
  - name: sidecar
    image: busybox:stable
    restartPolicy: Always
    command: ["/bin/sh", "-c", "tail -f /var/log/wordpress.log"]
    volumeMounts:
      - name: log-volume
        mountPath: /var/log
```

핵심: 이미지가 `busybox:1.36`이 아닌 `busybox:stable`이다. 문제에서 지정한 이미지 태그를 정확히 사용해야 한다. command도 문제에서 제시한 것과 동일하게 작성한다.

6단계: 저장하면 롤링 업데이트가 진행된다. 확인한다.

```bash
kubectl get pods
kubectl logs <wordpress-pod-이름> -c sidecar
```

Pod가 Running이고, sidecar 컨테이너의 로그에 wordpress.log 내용이 출력되면 성공이다.

---

### Q. 16 ArgoCD Installation with Helm

**Task:** Install Argo CD in a Kubernetes cluster using Helm while ensuring that CRDs are not installed (as they are pre-installed). Follow the steps below:

Requirements:
1. Add the official Argo CD Helm repository with the name `argo`
2. Generate a Helm template from the Argo CD chart version `7.7.3` for the `argocd` namespace
3. Ensure that CRDs are not installed by configuring the chart accordingly
4. Save the generated YAML manifest to `~/home/argo/argo-helm.yaml`

- **공식문서 링크:**
  - [Helm Repo Add](https://helm.sh/docs/helm/helm_repo_add/)
  - [Helm Template](https://helm.sh/docs/helm/helm_template/)
  - [Helm Install](https://helm.sh/docs/helm/helm_install/)
- **검색 키워드:** `helm repo add`, `helm template`, `--skip-crds`, `--set crds.install=false`, `--version`

**풀이 과정:**

1단계: ArgoCD 공식 Helm 차트 저장소를 추가한다.

```bash
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
```

2단계: 사용 가능한 chart 버전을 확인한다.

```bash
helm search repo argo/argo-cd --versions | head -10
```

`7.7.3` 버전이 있는지 확인한다.

3단계: `helm template`으로 YAML 매니페스트를 생성한다. `helm install`이 아니라 `helm template`이다. template은 실제 클러스터에 배포하지 않고 렌더링된 YAML만 출력한다.

```bash
helm template argo/argo-cd \
  --version 7.7.3 \
  --namespace argocd \
  --set crds.install=false \
  > ~/home/argo/argo-helm.yaml
```

핵심: CRD를 설치하지 않는 방법은 chart마다 다르다. ArgoCD Helm chart에서는 `--set crds.install=false`로 설정한다. `--skip-crds` 플래그도 있지만, chart의 values.yaml에서 crds.install을 false로 설정하는 것이 더 확실하다.

4단계: 생성된 파일을 확인한다.

```bash
ls -la ~/home/argo/argo-helm.yaml
grep -c "CustomResourceDefinition" ~/home/argo/argo-helm.yaml
```

CRD가 포함되어 있지 않아야 한다. `grep` 결과가 0이면 성공이다.

---

### Q. 17 CRD (Custom Resource Definition)

**Task:**
1. Create a list of all cert-manager CRDs and save it to `~/resources.yaml`. Make sure `kubectl` uses default output format and use `kubectl` to list CRDs.
2. Using `kubectl`, extract the documentation for the subject specification field of the Certificate Custom Resource and save it to `~/subject.yaml`. You may use any output format that `kubectl` supports.

- **공식문서 링크:**
  - [Custom Resources](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/)
  - [CustomResourceDefinitions](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/)
- **검색 키워드:** `CRD`, `CustomResourceDefinition`, `kubectl get crd`, `kubectl explain`

**풀이 과정:**

1단계: cert-manager 관련 CRD를 모두 나열한다. "default output format"이므로 `-o yaml`이나 `-o json`을 붙이지 않고 기본 테이블 출력을 사용한다.

```bash
kubectl get crd | grep cert-manager > ~/resources.yaml
```

또는 더 정확하게:

```bash
kubectl get crd -o name | grep cert-manager > ~/resources.yaml
```

핵심: 문제에서 "default output format"을 강조하고 있다. `-o yaml`, `-o json` 등을 사용하지 않는다. 기본 `kubectl get` 출력이 default format이다.

2단계: Certificate CRD의 subject 필드 문서를 추출한다. `kubectl explain`을 사용한다.

```bash
kubectl explain certificate.spec.subject --api-version=cert-manager.io/v1
```

이 출력 결과를 파일로 저장한다:

```bash
kubectl explain certificate.spec.subject --api-version=cert-manager.io/v1 > ~/subject.yaml
```

3단계: 두 파일이 정상적으로 생성되었는지 확인한다.

```bash
cat ~/resources.yaml
cat ~/subject.yaml
```

`resources.yaml`에 cert-manager 관련 CRD 목록이 있고, `subject.yaml`에 subject 필드의 설명이 포함되어 있으면 성공이다.

---

### Q. 18 NetworkPolicy

**Task:** There are 2 deployments, Frontend and Backend. Frontend will be in `frontend` namespace and Backend will be in `backend` namespace.

Task: Create a network policy to have interaction between frontend and backend deployment. The network policy has to be least permissive.

- **공식문서 링크:**
  - [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
- **검색 키워드:** `NetworkPolicy`, `podSelector`, `namespaceSelector`, `policyTypes`, `ingress`, `egress`

**풀이 과정:**

1단계: "least permissive"가 핵심이다. 필요한 최소한의 트래픽만 허용해야 한다. 먼저 두 Deployment의 라벨과 포트를 확인한다.

```bash
kubectl get deploy -n frontend -o wide
kubectl get deploy -n backend -o wide
kubectl get pods -n frontend --show-labels
kubectl get pods -n backend --show-labels
kubectl get ns frontend --show-labels
kubectl get ns backend --show-labels
```

2단계: Frontend에서 Backend로의 egress, Backend에서 Frontend로의 ingress를 각각 허용해야 한다. 서로 다른 namespace이므로 `namespaceSelector`를 사용한다.

3단계: Backend 쪽 NetworkPolicy를 만든다 (Frontend로부터의 ingress 허용).

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  namespace: backend
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: frontend
          podSelector:
            matchLabels:
              app: frontend
      ports:
        - protocol: TCP
          port: <backend-포트>
```

4단계: Frontend 쪽 NetworkPolicy를 만든다 (Backend로의 egress 허용 + DNS).

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend-egress
  namespace: frontend
spec:
  podSelector:
    matchLabels:
      app: frontend
  policyTypes:
    - Egress
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: backend
          podSelector:
            matchLabels:
              app: backend
      ports:
        - protocol: TCP
          port: <backend-포트>
    - ports:
        - protocol: TCP
          port: 53
        - protocol: UDP
          port: 53
```

핵심: "least permissive"이므로 podSelector와 namespaceSelector를 **모두** 사용하여 특정 Pod에서 특정 Pod로만 트래픽을 허용한다. namespaceSelector만 사용하면 해당 namespace의 모든 Pod에서 접근 가능해져서 least permissive가 아니다. DNS(port 53) egress도 허용해야 Service 이름 해석이 가능하다.

5단계: 적용하고 확인한다.

```bash
kubectl apply -f backend-netpol.yaml
kubectl apply -f frontend-netpol.yaml
kubectl describe netpol -n frontend
kubectl describe netpol -n backend
```

---

### Q. 19 CNI (Container Network Interface)

**Task:** Install and configure a CNI of your choice that meets the specified requirements, choose one of the following:

- Flannel (v0.26.1) using the manifest: `kube-flannel.yml` (`https://github.com/flannel-io/flannel/releases/download/v0.26.1/kube-flannel.yml`)
- Calico (v3.28.2) using the manifest: `tigera-operator.yaml` (`https://raw.githubusercontent.com/projectcalico/calico/v3.28.2/manifests/tigera-operator.yaml`)

The CNI you choose must:
1. Let pods communicate with each other
2. Support network policy enforcement
3. Install from manifest

- **공식문서 링크:**
  - [Cluster Networking](https://kubernetes.io/docs/concepts/cluster-administration/networking/)
  - [Install a Network Policy Provider](https://kubernetes.io/docs/tasks/administer-cluster/network-policy-provider/)
  - [Calico](https://docs.tigera.io/calico/latest/getting-started/kubernetes/)
- **검색 키워드:** `CNI`, `Calico`, `Flannel`, `network policy`, `kube-flannel`, `tigera-operator`

**풀이 과정:**

1단계: 요구사항을 분석한다. 3가지 조건 중 핵심은 **"Support network policy enforcement"** 이다.
- Flannel: Pod 간 통신은 지원하지만, **NetworkPolicy를 지원하지 않는다.**
- Calico: Pod 간 통신, NetworkPolicy 지원, manifest 설치 모두 가능하다.

따라서 **Calico를 선택해야 한다.**

2단계: 현재 CNI 상태를 확인한다.

```bash
kubectl get nodes
kubectl get pods -n kube-system
```

노드가 NotReady 상태이거나 coredns Pod가 Pending이면 CNI가 설치되지 않은 것이다.

3단계: Calico를 설치한다.

```bash
kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.28.2/manifests/tigera-operator.yaml
```

4단계: Calico custom resource를 설치한다 (필요한 경우).

```bash
kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.28.2/manifests/custom-resources.yaml
```

5단계: 설치가 완료될 때까지 기다린다.

```bash
kubectl get pods -n calico-system -w
kubectl get nodes
```

모든 Calico Pod가 Running이고 노드가 Ready 상태가 되면 성공이다.

핵심: Flannel을 선택하면 NetworkPolicy 요구사항을 충족하지 못해서 감점된다. 시험에서 CNI 선택 문제가 나오면 반드시 NetworkPolicy 지원 여부를 기준으로 판단한다. Flannel + Calico를 함께 사용하는 Canal 구성도 있지만, 시험에서는 Calico 단독 설치가 가장 깔끔하다.

---

### Q. 20 NodePort Service

**Task:** There is a Deployment named `nodeport-deployment` in the relative namespace.

Tasks:
1. Configure the deployment so it can be exposed using port 80 and protocol TCP name http
2. Create a new Service named `nodeport-service` exposing the container port 80 and TCP
3. Configure the new Service to also expose the individual pods using `NodePort`

- **공식문서 링크:**
  - [Service](https://kubernetes.io/docs/concepts/services-networking/service/)
  - [Type NodePort](https://kubernetes.io/docs/concepts/services-networking/service/#type-nodeport)
- **검색 키워드:** `NodePort`, `kubectl expose`, `containerPort`, `protocol TCP`

**풀이 과정:**

1단계: Deployment를 확인한다. "relative namespace"이므로 현재 컨텍스트의 namespace를 확인한다.

```bash
kubectl config get-contexts
kubectl get deploy nodeport-deployment -n <relative-ns>
```

2단계: Deployment의 containerPort가 설정되어 있는지 확인한다. 문제에서 "port 80, protocol TCP, name http"로 expose하라고 했으므로 containerPort를 확인/수정한다.

```bash
kubectl get deploy nodeport-deployment -n <relative-ns> -o yaml | grep -A 5 "ports"
```

containerPort가 없거나 다르면 수정한다:

```bash
kubectl edit deploy nodeport-deployment -n <relative-ns>
```

```yaml
containers:
  - name: ...
    ports:
      - containerPort: 80
        protocol: TCP
        name: http
```

3단계: `kubectl expose`로 NodePort Service를 만든다.

```bash
kubectl expose deployment nodeport-deployment -n <relative-ns> \
  --name=nodeport-service \
  --type=NodePort \
  --port=80 \
  --target-port=80 \
  --protocol=TCP
```

4단계: 확인한다.

```bash
kubectl get svc nodeport-service -n <relative-ns>
kubectl get endpoints nodeport-service -n <relative-ns>
```

TYPE이 `NodePort`이고 PORT(S)에 `80:<자동할당된포트>/TCP`가 표시되면 성공이다. ENDPOINTS에 Pod IP가 나열되는지도 확인한다.

---

### Q. 21 TLS Configuration (ConfigMap + /etc/hosts)

**Task:** There is an existing deployment called `nginx-static` in the `nginx-static` namespace. The deployment contains a ConfigMap that supports TLSv1.2 and TLSv1.3, and a Secret for TLS. There is a service called `nginx-static` in the `nginx-static` namespace that is currently exposing the deployment.

Tasks:
1. Configure the ConfigMap to only support TLSv1.3
2. Add the IP address of the service in `/etc/hosts` and name `ITKiddie.k8s.local`
3. Verify that everything is working using the following command:
   - `curl --tls-max 1.2 https://ITKiddie.k8s.local -k` (TLSv1.2 should not work)
   - `curl --tlsv1.3 https://ITKiddie.k8s.local -k`

- **공식문서 링크:**
  - [ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)
  - [TLS Secrets](https://kubernetes.io/docs/concepts/configuration/secret/#tls-secrets)
- **검색 키워드:** `ConfigMap`, `nginx ssl_protocols`, `TLSv1.3`, `/etc/hosts`

**풀이 과정:**

1단계: 먼저 현재 ConfigMap을 확인한다.

```bash
kubectl get configmap -n nginx-static
kubectl get configmap <configmap-이름> -n nginx-static -o yaml
```

nginx 설정에서 `ssl_protocols` 라인을 찾는다. 현재 `TLSv1.2 TLSv1.3`으로 되어 있을 것이다.

2단계: ConfigMap을 편집하여 TLSv1.3만 지원하도록 변경한다.

```bash
kubectl edit configmap <configmap-이름> -n nginx-static
```

```
ssl_protocols TLSv1.2 TLSv1.3;
```

이 부분을 아래처럼 변경한다:

```
ssl_protocols TLSv1.3;
```

3단계: ConfigMap 변경 후 Pod를 재시작해야 반영된다.

```bash
kubectl rollout restart deployment nginx-static -n nginx-static
kubectl rollout status deployment nginx-static -n nginx-static
```

4단계: Service의 ClusterIP를 확인하고 `/etc/hosts`에 추가한다.

```bash
kubectl get svc nginx-static -n nginx-static
```

ClusterIP를 확인한 후:

```bash
echo "<ClusterIP> ITKiddie.k8s.local" >> /etc/hosts
```

5단계: 검증한다.

```bash
curl --tls-max 1.2 https://ITKiddie.k8s.local -k
```

이 명령은 실패해야 한다 (TLSv1.2 비활성화).

```bash
curl --tlsv1.3 https://ITKiddie.k8s.local -k
```

이 명령은 성공해야 한다 (TLSv1.3 활성화). 200 응답이 오면 성공이다.

---

### Q. 22 Ingress Resource

**Task:** Create a new Ingress resource named `echo` in `echo-sound` namespace with the following tasks:

1. Expose the deployment with a service named `echo-service` on `http://example.org/echo` using Service port 8080 type `NodePort`
2. The availability of Service echo-service can be checked using the following command which should return 200:
   `curl -o /dev/null -s -w "%{http_code}\n" http://example.org/echo`

- **공식문서 링크:**
  - [Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)
  - [Service](https://kubernetes.io/docs/concepts/services-networking/service/)
- **검색 키워드:** `Ingress`, `ingressClassName`, `pathType Prefix`, `kubectl expose`, `NodePort`

**풀이 과정:**

1단계: 이 문제는 Service 생성과 Ingress 생성 두 가지를 해야 한다. 먼저 Deployment를 확인한다.

```bash
kubectl get deploy -n echo-sound
kubectl get svc -n echo-sound
```

2단계: NodePort Service를 만든다.

```bash
kubectl expose deployment <deployment-이름> -n echo-sound \
  --name=echo-service \
  --type=NodePort \
  --port=8080
```

3단계: IngressClass를 확인한다.

```bash
kubectl get ingressclass
```

4단계: Ingress를 만든다.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: echo
  namespace: echo-sound
spec:
  ingressClassName: nginx
  rules:
    - host: example.org
      http:
        paths:
          - path: /echo
            pathType: Prefix
            backend:
              service:
                name: echo-service
                port:
                  number: 8080
```

5단계: 적용하고 검증한다.

```bash
kubectl apply -f ingress.yaml
kubectl describe ingress echo -n echo-sound
curl -o /dev/null -s -w "%{http_code}\n" http://example.org/echo
```

200이 반환되면 성공이다. 만약 실패하면 Ingress Controller가 정상 동작 중인지, Service의 Endpoints가 올바른지 확인한다.

---

### Q. 23 CRI-Dockerd Setup

**Task:** Set up cri-dockerd.

1. Install the Debian package `~/cri-dockerd_0.3.9.3-0.ubuntu-jammy_amd64.deb` using `dpkg`
2. Enable and start the cri-docker service
3. Configure these system parameters:
   - Set `net.bridge.bridge-nf-call-iptables` to 1
   - Set `net.ipv6.conf.all.forwarding` to 1
   - Set `net.ipv4.ip_forward` to 1
   - Set `net.netfilter.nf_conntrack_max` to 131072

- **공식문서 링크:**
  - [Container Runtimes](https://kubernetes.io/docs/setup/production-environment/container-runtimes/)
  - [Installing kubeadm - Prerequisites](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/install-kubeadm/#letting-iptables-see-bridged-traffic)
- **검색 키워드:** `cri-dockerd`, `dpkg`, `sysctl`, `bridge-nf-call-iptables`, `ip_forward`

**풀이 과정:**

1단계: dpkg로 cri-dockerd 패키지를 설치한다.

```bash
sudo dpkg -i ~/cri-dockerd_0.3.9.3-0.ubuntu-jammy_amd64.deb
```

의존성 에러가 발생하면 `sudo apt-get install -f`로 해결한다.

2단계: cri-docker 서비스를 활성화하고 시작한다.

```bash
sudo systemctl enable cri-docker
sudo systemctl start cri-docker
sudo systemctl status cri-docker
```

`active (running)` 상태인지 확인한다.

3단계: sysctl 파라미터를 설정한다. 먼저 설정 파일을 만든다.

```bash
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables = 1
net.ipv6.conf.all.forwarding = 1
net.ipv4.ip_forward = 1
net.netfilter.nf_conntrack_max = 131072
EOF
```

4단계: 커널 모듈이 로드되어 있는지 확인한다. `bridge-nf-call-iptables`를 사용하려면 `br_netfilter` 모듈이 필요하다.

```bash
sudo modprobe br_netfilter
sudo modprobe nf_conntrack
```

5단계: sysctl 설정을 적용한다.

```bash
sudo sysctl --system
```

6단계: 적용 결과를 검증한다.

```bash
sysctl net.bridge.bridge-nf-call-iptables
sysctl net.ipv6.conf.all.forwarding
sysctl net.ipv4.ip_forward
sysctl net.netfilter.nf_conntrack_max
```

모든 값이 문제에서 요구한 대로 설정되어 있으면 성공이다.

---

### Q. 24 Troubleshooting - kube-apiserver / etcd (Cluster Migration)

**Task:** After a cluster migration, the controlplane `kube-apiserver` is not coming up.

Before migration:
- `etcd` was external and in HA

After migration, `kube-apiserver` was pointing to etcd peer port `2380` instead of `2379`.

Fix it.

- **공식문서 링크:**
  - [Troubleshooting Clusters](https://kubernetes.io/docs/tasks/debug/debug-cluster/)
  - [Static Pods](https://kubernetes.io/docs/tasks/configure-pod-container/static-pod/)
- **검색 키워드:** `kube-apiserver`, `static pod`, `etcd`, `/etc/kubernetes/manifests`, `etcd peer port`, `client port`

**풀이 과정:**

1단계: kubectl이 동작하지 않으므로 controlplane에서 직접 컨테이너 상태를 확인한다.

```bash
crictl ps -a | grep kube-apiserver
crictl logs <container-id>
```

로그에서 etcd 연결 관련 에러(connection refused 등)를 찾는다.

2단계: static pod manifest를 확인한다. 핵심은 etcd의 포트 설정이다.

```bash
grep etcd /etc/kubernetes/manifests/kube-apiserver.yaml
```

문제 상황: `--etcd-servers=https://127.0.0.1:2380`으로 되어 있다. 2380은 etcd의 **peer** 포트(etcd 노드 간 통신용)이고, kube-apiserver가 연결해야 하는 것은 **client** 포트인 2379이다.

핵심: etcd의 포트 구분을 반드시 알아야 한다.
- **2379**: client port - kube-apiserver, etcdctl 등이 연결하는 포트
- **2380**: peer port - etcd 클러스터 멤버 간 통신 포트

3단계: 실제 etcd의 client 포트를 확인한다.

```bash
grep "listen-client" /etc/kubernetes/manifests/etcd.yaml
```

`--listen-client-urls`에 2379가 포함되어 있는 것을 확인한다.

4단계: kube-apiserver manifest를 수정한다.

```bash
vi /etc/kubernetes/manifests/kube-apiserver.yaml
```

`--etcd-servers=https://127.0.0.1:2380` → `--etcd-servers=https://127.0.0.1:2379`

5단계: 파일을 저장하면 kubelet이 static pod를 자동 재시작한다. 1~2분 기다린 후 확인한다.

```bash
kubectl get nodes
kubectl get pods -n kube-system
```

kube-apiserver Pod가 Running이고 kubectl 명령이 정상 동작하면 성공이다.

---

### Q. 25 PriorityClass

**Task:** You're working in a Kubernetes cluster with an existing Deployment named `busybox-logger` running in a namespace called `priority`. The cluster already has at least one user-defined Priority Class.

Perform the following tasks:
1. Create a new Priority Class named `high-priority` for user workloads. The value of this Priority Class should be exactly one less than the highest existing user-defined Priority Class value.
2. Patch the existing Deployment `busybox-logger` in the `priority` namespace to use the newly created `high-priority` Priority Class.

- **공식문서 링크:**
  - [Pod Priority and Preemption](https://kubernetes.io/docs/concepts/scheduling-eviction/pod-priority-preemption/)
- **검색 키워드:** `PriorityClass`, `priorityClassName`, `kubectl patch`, `kubectl get priorityclass`

**풀이 과정:**

1단계: 기존 PriorityClass를 모두 확인한다. system-cluster-critical, system-node-critical은 시스템용이므로 **user-defined** PriorityClass를 찾아야 한다.

```bash
kubectl get priorityclass
```

출력에서 시스템 PriorityClass(system-cluster-critical: 2000000000, system-node-critical: 2000001000)를 제외하고, 사용자가 만든 PriorityClass 중 가장 높은 값을 찾는다.

2단계: 예를 들어 기존 사용자 정의 PriorityClass의 최고값이 `1000000`이면, 새로 만들 값은 `999999`이다.

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: high-priority
value: 999999
globalDefault: false
description: "High priority for user workloads"
```

핵심: "exactly one less"이므로 기존 최고값에서 정확히 1을 뺀다. 계산 실수를 하면 안 된다.

3단계: PriorityClass를 적용한다.

```bash
kubectl apply -f pc.yaml
```

4단계: 기존 Deployment를 패치한다.

```bash
kubectl patch deployment busybox-logger -n priority \
  --type='json' \
  -p='[{"op": "add", "path": "/spec/template/spec/priorityClassName", "value": "high-priority"}]'
```

또는 `kubectl edit`으로 직접 수정한다:

```bash
kubectl edit deploy busybox-logger -n priority
```

`spec.template.spec` 아래에 `priorityClassName: high-priority`를 추가한다.

5단계: 확인한다.

```bash
kubectl get deploy busybox-logger -n priority -o yaml | grep -i priority
kubectl get pods -n priority
```

Pod가 `high-priority` PriorityClass를 사용하고 Running 상태이면 성공이다.

---

### Q. 26 Resource Requests and Limits

**Task:** You are managing a WordPress application running in a Kubernetes cluster. Your task is to adjust the Pod resource requests and limits to ensure stable operation. Follow the instructions below:

1. Scale down the `wordpress` Deployment to 0 replicas
2. Edit the Deployment and divide node resources evenly across all 3 Pods
3. Assign fair and equal CPU and memory requests to each Pod
4. Add sufficient overhead to avoid node instability

Ensure that both the `init` containers and main containers use exactly the same resource requests and limits. After making the changes, scale the Deployment back to 3 replicas.

- **공식문서 링크:**
  - [Resource Management for Pods](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- **검색 키워드:** `resources`, `requests`, `limits`, `init container resources`, `kubectl scale`

**풀이 과정:**

1단계: 먼저 Deployment를 0으로 스케일 다운한다. 이렇게 하면 리소스 변경 중 서비스 중단을 방지한다.

```bash
kubectl scale deploy wordpress --replicas=0
```

2단계: 노드의 allocatable 리소스를 확인한다.

```bash
kubectl describe nodes | grep -A 6 "Allocatable"
```

예: CPU 4000m, Memory 8Gi인 노드에서 3개 Pod를 균등 분배하면 Pod당 약 CPU 1300m, Memory 2.6Gi. 시스템 오버헤드를 고려하여 약간 낮게 설정한다.

3단계: Deployment를 편집한다.

```bash
kubectl edit deploy wordpress
```

main container와 init container **모두** 동일한 리소스를 설정한다:

```yaml
spec:
  template:
    spec:
      initContainers:
        - name: init-container
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "250m"
              memory: "256Mi"
      containers:
        - name: wordpress
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "250m"
              memory: "256Mi"
```

핵심: "init containers and main containers use exactly the same resource requests and limits"이므로, 값이 정확히 동일해야 한다. 값 자체는 노드의 allocatable 리소스를 3으로 나눈 것 기준으로 설정한다.

4단계: 3 replicas로 스케일 업한다.

```bash
kubectl scale deploy wordpress --replicas=3
```

5단계: 확인한다.

```bash
kubectl get pods
kubectl describe deploy wordpress | grep -A 6 "Limits\|Requests"
kubectl top pods
```

3개 Pod가 모두 Running이고, 각 Pod의 리소스 설정이 동일하면 성공이다.

---

### Bonus: Troubleshooting Part 2 (Connection Refused)

**Task:** `kubectl` commands are failing with "The connection to the server was refused - did you specify the right host or port?" error. The kube-apiserver is not coming up. Investigate and fix the issue.

- **공식문서 링크:**
  - [Troubleshooting Clusters](https://kubernetes.io/docs/tasks/debug/debug-cluster/)
  - [Static Pods](https://kubernetes.io/docs/tasks/configure-pod-container/static-pod/)
- **검색 키워드:** `connection refused`, `kube-apiserver`, `static pod`, `crictl`, `/etc/kubernetes/manifests`

**풀이 과정:**

이 문제는 CKA에서 가장 난이도가 높은 유형 중 하나다. kubectl 자체가 동작하지 않으므로 일반적인 디버깅 방법을 사용할 수 없다.

1단계: kubectl이 동작하지 않으므로 `crictl`로 컨테이너 상태를 확인한다.

```bash
crictl ps -a | grep kube-apiserver
```

kube-apiserver 컨테이너가 계속 CrashLoopBackOff 상태이거나 아예 없을 수 있다.

2단계: 로그를 확인한다.

```bash
crictl logs <container-id>
```

또는 static pod이 아예 시작하지 못하면:

```bash
journalctl -u kubelet -n 100 --no-pager | grep -i error
```

3단계: static pod manifest를 확인한다.

```bash
ls /etc/kubernetes/manifests/
cat /etc/kubernetes/manifests/kube-apiserver.yaml
```

흔한 원인들:
- `--etcd-servers` 포트가 2379가 아닌 2380
- `--etcd-cafile`, `--etcd-certfile`, `--etcd-keyfile` 경로나 파일명 오타
- `--service-cluster-ip-range` 또는 `--advertise-address` 오류
- 인증서 파일이 존재하지 않는 경로를 참조

4단계: etcd 설정과 비교하여 문제를 특정한다.

```bash
cat /etc/kubernetes/manifests/etcd.yaml | grep -E "listen-client|advertise-client|cert-file|key-file"
```

5단계: 문제를 수정한다.

```bash
vi /etc/kubernetes/manifests/kube-apiserver.yaml
```

6단계: 파일 저장 후 kubelet이 static pod를 자동 재시작한다. 1~2분 기다린 후 확인한다.

```bash
crictl ps | grep kube-apiserver
kubectl get nodes
kubectl get pods -n kube-system
```

kubectl 명령이 정상 동작하면 성공이다.

---

## 시험 전략 요약

### 시간 배분 (2시간 기준)

| 난이도 | 문제 유형 | 예상 소요 시간 | 전략 |
|--------|-----------|---------------|------|
| 하 | PV/PVC, PriorityClass, NodePort, CRD 조회 | 3~5분 | kubectl 명령어로 빠르게 처리 |
| 중 | NetworkPolicy, Ingress, HPA, StorageClass, LimitRange, CNI | 5~8분 | 공식문서 예시 복사 후 수정 |
| 상 | Gateway API 마이그레이션, Sidecar, StatefulSet, Kustomize, ArgoCD Helm | 8~12분 | 차분하게 단계별 접근 |
| 최상 | Troubleshooting(etcd/apiserver), CRI-Dockerd Setup, TLS 설정 | 10~15분 | 공식문서 순서 그대로 따라감 |

### 필수 북마크 (시험 시작 전)

1. **kubectl Cheat Sheet**: `https://kubernetes.io/docs/reference/kubectl/cheatsheet/`
2. **Network Policy**: `https://kubernetes.io/docs/concepts/services-networking/network-policies/`
3. **Persistent Volumes**: `https://kubernetes.io/docs/concepts/storage/persistent-volumes/`
4. **kubeadm Upgrade**: `https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/`
5. **Gateway API HTTPRoute**: `https://gateway-api.sigs.k8s.io/api-types/httproute/`
6. **Sidecar Containers**: `https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/`
7. **StatefulSet**: `https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/`
8. **CoreDNS Debugging**: `https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/`
9. **Kustomize**: `https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/`
10. **LimitRange**: `https://kubernetes.io/docs/concepts/policy/limit-range/`

### 풀이 순서 전략

1. **쉬운 문제부터 풀어서 점수를 확보한다.** kubectl 명령어 한 줄로 풀 수 있는 문제(Secret, TLS Secret, PriorityClass, NodePort expose)를 먼저 해결한다.
2. **Troubleshooting은 중반에 배치한다.** 시간이 많이 소요될 수 있어서 마지막에 풀면 시간 부족 위험이 크다.
3. **YAML 작성 시 공식문서에서 복사한다.** 처음부터 외워서 치지 말고, 공식문서 예시를 복사한 후 문제 조건에 맞게 수정한다.
4. **항상 결과를 검증한다.** `kubectl get`, `kubectl describe`로 리소스가 정상인지 확인하는 데 10초를 투자한다. 확인 안 하고 다음 문제로 넘어갔다가 틀리면 돌아와서 고치는 시간이 더 오래 걸린다.
5. **namespace를 항상 확인한다.** `-n <namespace>`를 습관적으로 붙인다. 기본 namespace에 만들어야 할 것을 다른 namespace에 만들면 0점이다.
6. **`kubectl explain`을 적극 활용한다.** 필드명이 기억나지 않을 때 공식문서보다 빠르다.

```bash
kubectl explain pod.spec.affinity.nodeAffinity
kubectl explain statefulset.spec.volumeClaimTemplates
kubectl explain networkpolicy.spec.egress
```
