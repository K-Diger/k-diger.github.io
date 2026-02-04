---
layout: post
title: "Part 26/26: CKA 시험 준비"
date: 2026-01-16
categories: [Kubernetes]
tags: [kubernetes, cka, certification, exam, tips]
---

> **원문 ([CNCF - CKA Exam](https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/)):**
> The CKA exam tests your ability to perform tasks and solve problems in a command line environment. The exam consists of performance-based tasks to be completed in a remote command line environment.

**번역:** CKA 시험은 명령줄 환경에서 작업을 수행하고 문제를 해결하는 능력을 테스트한다. 시험은 원격 명령줄 환경에서 완료해야 하는 성능 기반 작업으로 구성된다.

**CKA(Certified Kubernetes Administrator)**는 Kubernetes 관리 능력을 검증하는 실무 기반 시험이다. 이 장에서는 시험 형식, 주요 주제, 시간 관리 전략, 필수 명령어를 정리한다.

## 시험 개요

### 시험 형식 (2025년 기준)

| 항목 | 내용 |
|------|------|
| 시간 | 2시간 |
| 문제 수 | 15-20문제 |
| 합격 점수 | 66% 이상 |
| 형식 | 실습 (CLI 기반, 성능 기반 테스트) |
| 환경 | 웹 터미널 + 공식 문서 접근 가능 |
| 재시험 | 1회 무료 재응시 포함 |
| 유효기간 | 2년 |
| 시험 비용 | $445 (재시험 1회 포함) |

### 2025년 2월 주요 변경사항

- **Gateway API** 시험 범위에 추가
- **HPA Custom Metrics** 관련 문제 추가
- Kubernetes 버전 분기별 업데이트 (최신 버전 기준)

### 허용 리소스

시험 중 **공식 문서**에 접근할 수 있다:
- kubernetes.io/docs
- kubernetes.io/blog
- helm.sh/docs
- **gateway-api.sigs.k8s.io** (신규 추가)

**북마크 추천**:
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- [API Reference](https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.29/)
- [Gateway API](https://gateway-api.sigs.k8s.io/)

### Killer.sh 시뮬레이터

시험 등록 시 **Killer.sh** 시뮬레이터 접근 권한이 제공된다:
- 2회 시뮬레이션 시도 가능
- 각 시도당 36시간 접근 가능
- 실제 시험보다 어렵게 설계되어 있음

## 주제별 출제 비중

### 시험 도메인 (2025년 기준)

| 도메인 | 비중 |
|--------|------|
| Troubleshooting | 30% |
| Cluster Architecture, Installation & Configuration | 25% |
| Services & Networking | 20% |
| Workloads & Scheduling | 15% |
| Storage | 10% |

### 주요 출제 주제

**1. 클러스터 아키텍처 (25%)**
- kubeadm으로 클러스터 업그레이드
- etcd 백업/복원
- RBAC 설정
- 노드 유지보수 (drain, cordon)

**2. 트러블슈팅 (30%)**
- Pod 문제 진단 (CrashLoopBackOff, Pending 등)
- 노드 문제 진단 (NotReady)
- 네트워크 문제 진단
- 로그 분석 및 클러스터 컴포넌트 디버깅

**3. 워크로드 & 스케줄링 (15%)**
- Deployment 생성/수정
- Pod 스케줄링 (nodeSelector, affinity, taints/tolerations)
- 리소스 제한 (requests, limits)
- ConfigMap, Secret
- **HPA (Custom Metrics 포함)** - 신규

**4. 서비스 & 네트워킹 (20%)**
- Service 생성 (ClusterIP, NodePort, LoadBalancer)
- **Gateway API (HTTPRoute, Gateway)** - 신규 추가
- Ingress 설정
- NetworkPolicy
- DNS 트러블슈팅

**5. 스토리지 (10%)**
- PV, PVC 생성
- StorageClass
- Pod에 볼륨 마운트

## 필수 명령어 정리

### kubectl 기본

```bash
# 리소스 조회
kubectl get <resource> -o wide
kubectl get <resource> -o yaml
kubectl get <resource> --show-labels
kubectl get all -A

# 리소스 상세
kubectl describe <resource> <name>

# 리소스 생성/수정
kubectl apply -f <file>
kubectl create -f <file>
kubectl edit <resource> <name>

# 리소스 삭제
kubectl delete <resource> <name>
kubectl delete -f <file>

# 빠른 YAML 생성
kubectl run nginx --image=nginx --dry-run=client -o yaml > pod.yaml
kubectl create deployment nginx --image=nginx --dry-run=client -o yaml > deploy.yaml
kubectl expose deployment nginx --port=80 --dry-run=client -o yaml > svc.yaml
```

### Pod 관련

```bash
# Pod 생성
kubectl run nginx --image=nginx
kubectl run nginx --image=nginx --port=80
kubectl run nginx --image=nginx --command -- sleep 3600

# Pod에 라벨 추가
kubectl run nginx --image=nginx --labels=app=web,env=prod

# Pod 로그
kubectl logs <pod>
kubectl logs <pod> -c <container>
kubectl logs <pod> --previous
kubectl logs -f <pod>

# Pod 접속
kubectl exec -it <pod> -- /bin/sh
kubectl exec <pod> -- cat /etc/config

# Pod 복사
kubectl cp <pod>:/path/file ./local-file
```

### Deployment 관련

```bash
# Deployment 생성
kubectl create deployment nginx --image=nginx --replicas=3

# 스케일
kubectl scale deployment nginx --replicas=5

# 이미지 업데이트
kubectl set image deployment/nginx nginx=nginx:1.25

# 롤아웃
kubectl rollout status deployment/nginx
kubectl rollout history deployment/nginx
kubectl rollout undo deployment/nginx
kubectl rollout restart deployment/nginx
```

### Service 관련

```bash
# Service 생성
kubectl expose deployment nginx --port=80 --target-port=8080
kubectl expose deployment nginx --port=80 --type=NodePort
kubectl expose pod nginx --port=80 --name=nginx-svc

# Service 조회
kubectl get svc,endpoints
```

### ConfigMap & Secret

```bash
# ConfigMap
kubectl create configmap app-config --from-literal=key=value
kubectl create configmap app-config --from-file=config.txt

# Secret
kubectl create secret generic db-secret --from-literal=password=secret
kubectl create secret tls tls-secret --cert=tls.crt --key=tls.key
```

### RBAC

```bash
# Role/ClusterRole
kubectl create role pod-reader --verb=get,list --resource=pods -n dev
kubectl create clusterrole node-reader --verb=get,list --resource=nodes

# RoleBinding/ClusterRoleBinding
kubectl create rolebinding pod-reader-binding --role=pod-reader --user=jane -n dev
kubectl create clusterrolebinding admin-binding --clusterrole=cluster-admin --user=admin

# ServiceAccount
kubectl create serviceaccount my-sa -n dev

# 권한 확인
kubectl auth can-i list pods --as jane
kubectl auth can-i --list
```

### 노드 유지보수

```bash
# 노드 관리
kubectl cordon <node>
kubectl uncordon <node>
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data

# 노드 라벨
kubectl label nodes <node> disk=ssd
kubectl label nodes <node> disk-

# Taint
kubectl taint nodes <node> key=value:NoSchedule
kubectl taint nodes <node> key-
```

### etcd 백업/복원

```bash
# 백업
ETCDCTL_API=3 etcdctl snapshot save /backup/etcd.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# 복원
ETCDCTL_API=3 etcdctl snapshot restore /backup/etcd.db \
  --data-dir=/var/lib/etcd-new
```

### 클러스터 업그레이드

```bash
# Control Plane
sudo apt-mark unhold kubeadm
sudo apt-get install -y kubeadm=1.29.0-1.1
sudo apt-mark hold kubeadm
sudo kubeadm upgrade plan
sudo kubeadm upgrade apply v1.29.0

# kubelet, kubectl
sudo apt-mark unhold kubelet kubectl
sudo apt-get install -y kubelet=1.29.0-1.1 kubectl=1.29.0-1.1
sudo apt-mark hold kubelet kubectl
sudo systemctl daemon-reload
sudo systemctl restart kubelet
```

### 트러블슈팅

```bash
# Pod 상태
kubectl get pods -A
kubectl describe pod <pod>
kubectl logs <pod> --previous

# 노드 상태
kubectl get nodes
kubectl describe node <node>
sudo systemctl status kubelet
sudo journalctl -u kubelet

# Service 연결
kubectl get svc,endpoints
kubectl run test --rm -it --image=busybox -- wget -qO- http://svc:port

# DNS
kubectl run test --rm -it --image=busybox -- nslookup kubernetes.default
```

## 시간 관리 전략

### 문제 접근법

**1. 빠른 문제 먼저**
- 배점과 난이도 파악
- 쉬운 문제로 점수 확보
- 어려운 문제는 나중에

**2. 컨텍스트 전환 주의**
```bash
# 문제마다 컨텍스트 변경 필요
kubectl config use-context <context-name>
```

**3. YAML 복사 활용**
- 공식 문서에서 YAML 복사
- 필요한 부분만 수정

**4. 명령형 커맨드 활용**
```bash
# YAML 작성보다 빠름
kubectl run nginx --image=nginx
kubectl create deployment nginx --image=nginx
kubectl expose deployment nginx --port=80
```

### 시간 배분

| 단계 | 시간 |
|------|------|
| 쉬운 문제 (5-6개) | 30분 |
| 중간 문제 (5-6개) | 50분 |
| 어려운 문제 (3-4개) | 30분 |
| 검토 | 10분 |

## 자주 출제되는 시나리오

### 시나리오 1: Pod 생성

```bash
# 특정 image, label, port로 Pod 생성
kubectl run web --image=nginx:1.24 --port=80 --labels=app=web,tier=frontend
```

### 시나리오 2: Deployment + Service

```bash
# Deployment 생성
kubectl create deployment web --image=nginx --replicas=3

# Service 노출
kubectl expose deployment web --port=80 --type=NodePort
```

### 시나리오 3: 스케줄링

```yaml
# nodeSelector
spec:
  nodeSelector:
    disk: ssd
  containers:
  - name: app
    image: nginx

# Toleration
spec:
  tolerations:
  - key: "node-role.kubernetes.io/control-plane"
    operator: "Exists"
    effect: "NoSchedule"
```

### 시나리오 4: PV/PVC

```yaml
# PV
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-log
spec:
  capacity:
    storage: 100Mi
  accessModes:
  - ReadWriteMany
  hostPath:
    path: /pv/log
---
# PVC
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: claim-log
spec:
  accessModes:
  - ReadWriteMany
  resources:
    requests:
      storage: 50Mi
```

### 시나리오 5: Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
  - host: example.com
    http:
      paths:
      - path: /app
        pathType: Prefix
        backend:
          service:
            name: app-service
            port:
              number: 80
```

### 시나리오 6: NetworkPolicy

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-app
spec:
  podSelector:
    matchLabels:
      app: db
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: web
    ports:
    - protocol: TCP
      port: 3306
```

### 시나리오 7: 노드 유지보수

```bash
kubectl cordon node01
kubectl drain node01 --ignore-daemonsets --delete-emptydir-data
# 작업 수행
kubectl uncordon node01
```

### 시나리오 8: 트러블슈팅

```bash
# Pod가 Pending일 때
kubectl describe pod <pod>
# → 스케줄링 문제 (리소스, nodeSelector, taint)

# Pod가 CrashLoopBackOff일 때
kubectl logs <pod> --previous
# → 애플리케이션 오류, 설정 문제

# Service 연결 안 될 때
kubectl get endpoints <svc>
# → Endpoints 비어있으면 selector 확인
```

## 시험 당일 체크리스트

```
□ 신분증 준비
□ 웹캠, 마이크 테스트
□ 조용한 환경 확보
□ 시험 환경 시스템 점검
□ kubernetes.io/docs 북마크
□ kubectl Cheat Sheet 북마크
□ API Reference 북마크
```

## 마무리 조언

1. **공식 문서에 익숙해지기** - 시험 중 검색 시간 단축
2. **명령형 커맨드 암기** - YAML 작성 시간 절약
3. **killer.sh 연습** - 실제 시험 환경과 유사
4. **시간 관리** - 어려운 문제에 매달리지 않기
5. **컨텍스트 확인** - 매 문제마다 확인

---

## 참고 자료

### 공식 자료

- [CKA Exam Curriculum](https://github.com/cncf/curriculum)
- [CKA Exam Information](https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)

### 권장 학습 경로

1. Kubernetes 공식 튜토리얼 완료
2. killer.sh 모의 시험 2회 이상
3. kubectl 명령어 숙달
4. etcd 백업/복원 실습
5. 클러스터 업그레이드 실습

## 다음 단계

- [Kubernetes - 보안 심화 (TLS/PKI)](/kubernetes/kubernetes-27-security-tls)
- [Kubernetes 생태계 - Helm, Istio, CNI 플러그인](/kubernetes/kubernetes-ecosystem)
