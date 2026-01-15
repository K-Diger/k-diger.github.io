---
title: "Part 18: CKA 시험 준비"
date: 2026-01-19
categories: [Container, Kubernetes, CKA]
tags: [Container, Kubernetes, CKA, Certification]
layout: post
toc: true
math: true
mermaid: true
---

# Part 18: CKA

## CKA 시험 개요

### 시험 형식

- **시간**: 2시간 (120분)
- **문제 수**: 15-20개 (버전에 따라 변동)
- **합격 점수**: 66%
- **시험 방식**: 실습 기반 (Performance-Based Exam)
- **환경**: 원격 감독 (PSI 브라우저)
- **재응시**: 1회 무료 재응시 포함
- **유효기간**: 3년

### 시험 환경

- **운영체제**: Ubuntu 20.04 LTS
- **Kubernetes 버전**: 1.28-1.30 (시험 시점에 따라 변동)
- **클러스터**: 4-6개 클러스터 (컨텍스트 전환 필요)
- **허용 도구**: kubectl, vim, tmux
- **참고 자료**: kubernetes.io 공식 문서만 허용

### 시험 도메인 및 배점

1. **Storage (10%)**
  - PersistentVolume, PersistentVolumeClaim
  - StorageClass

2. **Troubleshooting (30%)**
  - 클러스터 및 애플리케이션 장애 해결
  - Control Plane 및 Worker Node 문제 해결
  - 네트워크 문제 해결

3. **Workloads & Scheduling (15%)**
  - Deployment, ConfigMap, Secret
  - Resource Limits, 스케줄링

4. **Cluster Architecture, Installation & Configuration (25%)**
  - RBAC
  - 클러스터 업그레이드
  - etcd 백업/복원

5. **Services & Networking (20%)**
  - Service, Ingress
  - NetworkPolicy

---

## 시험 전 준비사항

### 시험 환경 설정

**시험 시작 전 필수 설정:**

```bash
# 1. Alias 설정 (시간 절약의 핵심!)
alias k=kubectl
alias kgp='kubectl get pods'
alias kgs='kubectl get svc'
alias kgn='kubectl get nodes'
alias kd='kubectl describe'
alias kdel='kubectl delete'
alias kaf='kubectl apply -f'

# ~/.bashrc 또는 ~/.bash_aliases에 저장
echo "alias k=kubectl" >> ~/.bashrc
source ~/.bashrc

# 2. kubectl 자동 완성
source <(kubectl completion bash)
complete -F __start_kubectl k  # alias에도 자동 완성 적용

# 3. 현재 컨텍스트 확인 (프롬프트에 표시)
# .bashrc에 추가
export PS1='[\u@\h \W $(kubectl config current-context)]\$ '

# 4. vim 설정
cat <<EOF > ~/.vimrc
set number
set expandtab
set tabstop=2
set shiftwidth=2
set autoindent
EOF
```

### tmux 기본 사용법

시험 환경에서 tmux를 사용하면 여러 작업을 동시에 진행할 수 있다.

```bash
# tmux 세션 시작
tmux

# 화면 분할
Ctrl+b %    # 세로 분할
Ctrl+b "    # 가로 분할

# 패널 이동
Ctrl+b 화살표

# 패널 닫기
exit 또는 Ctrl+d

# 세션 나가기 (백그라운드)
Ctrl+b d

# 세션 다시 연결
tmux attach
```

---

## Imperative vs Declarative

### Imperative 명령어 (시험에서 더 빠름!)

CKA 시험에서는 Imperative 명령어를 사용하는 것이 시간을 크게 절약할 수 있다.

**Pod 생성:**

```bash
# 기본 Pod
kubectl run nginx --image=nginx

# 포트 지정
kubectl run nginx --image=nginx --port=80

# 환경변수 추가
kubectl run nginx --image=nginx --env="DNS_DOMAIN=cluster" --env="POD_NAMESPACE=default"

# Labels 추가
kubectl run nginx --image=nginx --labels="app=nginx,tier=frontend"

# Dry-run으로 YAML 생성 (중요!)
kubectl run nginx --image=nginx --dry-run=client -o yaml > pod.yaml

# 즉시 실행하지 않고 YAML만 생성
kubectl run nginx --image=nginx --dry-run=client -o yaml | kubectl apply -f -
```

**Deployment 생성:**

```bash
# 기본 Deployment
kubectl create deployment nginx --image=nginx

# Replicas 지정
kubectl create deployment nginx --image=nginx --replicas=3

# YAML 생성
kubectl create deployment nginx --image=nginx --replicas=3 --dry-run=client -o yaml > deployment.yaml

# Scale
kubectl scale deployment nginx --replicas=5

# 이미지 업데이트
kubectl set image deployment/nginx nginx=nginx:1.21

# Autoscale
kubectl autoscale deployment nginx --min=2 --max=10 --cpu-percent=80
```

**Service 생성:**

```bash
# ClusterIP
kubectl expose pod nginx --port=80 --target-port=8080 --name=nginx-service

# NodePort
kubectl expose deployment nginx --port=80 --type=NodePort --name=nginx-service

# LoadBalancer
kubectl expose deployment nginx --port=80 --type=LoadBalancer

# YAML 생성
kubectl create service clusterip nginx --tcp=80:80 --dry-run=client -o yaml > service.yaml

# Deployment를 expose하며 생성
kubectl expose deployment nginx --port=80 --target-port=8080 --type=ClusterIP --name=nginx-svc
```

**ConfigMap/Secret:**

```bash
# ConfigMap from literal
kubectl create configmap app-config --from-literal=key1=value1 --from-literal=key2=value2

# ConfigMap from file
kubectl create configmap app-config --from-file=config.properties

# Secret from literal
kubectl create secret generic db-secret --from-literal=username=admin --from-literal=password=secret

# Secret for Docker registry
kubectl create secret docker-registry regcred \
  --docker-server=myregistry.com \
  --docker-username=user \
  --docker-password=pass \
  --docker-email=email@example.com

# TLS Secret
kubectl create secret tls tls-secret --cert=path/to/cert.crt --key=path/to/key.key
```

**Namespace:**

```bash
# Namespace 생성
kubectl create namespace dev

# Namespace에 리소스 생성
kubectl run nginx --image=nginx -n dev

# 기본 네임스페이스 설정
kubectl config set-context --current --namespace=dev
```

**ServiceAccount:**

```bash
# ServiceAccount 생성
kubectl create serviceaccount app-sa

# YAML 생성
kubectl create serviceaccount app-sa --dry-run=client -o yaml > sa.yaml
```

### Declarative 방식

**파일 수정 후 적용:**

```bash
# 적용
kubectl apply -f deployment.yaml

# 디렉토리 전체 적용
kubectl apply -f ./configs/

# 실행 중인 리소스 편집
kubectl edit deployment nginx

# YAML 추출
kubectl get deployment nginx -o yaml > deployment.yaml
```

---

## kubectl 마스터하기

### 필수 플래그

```bash
# -o wide: 추가 정보 출력
kubectl get pods -o wide
# NAME    READY   STATUS    RESTARTS   AGE   IP            NODE
# nginx   1/1     Running   0          5m    10.244.1.5    node01

# -o yaml: YAML 형식 출력
kubectl get pod nginx -o yaml

# -o json: JSON 형식 출력
kubectl get pod nginx -o json

# --dry-run=client: 실제 생성 없이 검증
kubectl run nginx --image=nginx --dry-run=client

# --force: 강제 삭제/재생성
kubectl delete pod nginx --force --grace-period=0

# -n: 네임스페이스 지정
kubectl get pods -n kube-system

# -A, --all-namespaces: 모든 네임스페이스
kubectl get pods -A

# --show-labels: 레이블 표시
kubectl get pods --show-labels

# -l: 레이블 셀렉터
kubectl get pods -l app=nginx

# --sort-by: 정렬
kubectl get pods --sort-by=.metadata.creationTimestamp

# --field-selector: 필드 필터
kubectl get pods --field-selector status.phase=Running

# -w, --watch: 실시간 모니터링
kubectl get pods -w
```

### jsonpath 활용

```bash
# 특정 필드만 추출
kubectl get pods -o jsonpath='{.items[*].metadata.name}'

# 복합 출력
kubectl get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.podIP}{"\n"}{end}'

# 조건부 필터
kubectl get pods -o jsonpath='{.items[?(@.status.phase=="Running")].metadata.name}'

# Node의 Internal IP 추출
kubectl get nodes -o jsonpath='{.items[*].status.addresses[?(@.type=="InternalIP")].address}'

# PV 용량 추출
kubectl get pv -o jsonpath='{.items[*].spec.capacity.storage}'

# Custom Columns
kubectl get pods -o custom-columns=NAME:.metadata.name,STATUS:.status.phase,IP:.status.podIP
```

### 자주 사용하는 패턴

```bash
# Pod 강제 삭제
kubectl delete pod nginx --force --grace-period=0

# 특정 레이블 Pod만 삭제
kubectl delete pods -l app=nginx

# 모든 리소스 삭제 (네임스페이스 내)
kubectl delete all --all

# 리소스 상태 확인 (Loop)
kubectl get pods -w

# 로그 스트리밍
kubectl logs -f <pod-name>

# 이전 컨테이너 로그
kubectl logs <pod-name> --previous

# 여러 컨테이너 중 특정 컨테이너 로그
kubectl logs <pod-name> -c <container-name>

# Pod에 명령 실행
kubectl exec <pod-name> -- ls /app

# 인터랙티브 쉘
kubectl exec -it <pod-name> -- /bin/bash

# 파일 복사
kubectl cp <pod-name>:/path/to/file ./local-file
kubectl cp ./local-file <pod-name>:/path/to/file

# Port Forwarding
kubectl port-forward pod/nginx 8080:80

# Describe (상세 정보 + 이벤트)
kubectl describe pod nginx

# Events 확인
kubectl get events --sort-by='.lastTimestamp'

# Top (리소스 사용량)
kubectl top nodes
kubectl top pods
```

---

## 시험 시간 관리 전략

### 1. 초반 10분: 환경 설정

```bash
# Alias 설정
alias k=kubectl
source <(kubectl completion bash)
complete -F __start_kubectl k

# vim 설정
cat <<EOF > ~/.vimrc
set number
set expandtab
set tabstop=2
set shiftwidth=2
EOF

# 모든 클러스터 확인
kubectl config get-contexts
```

### 2. 문제 풀이 순서

1. **점수 대비 시간이 짧은 문제 먼저**
  - 1-2분 안에 풀 수 있는 문제
  - Imperative 명령어로 바로 해결 가능한 문제

2. **배점이 높은 문제**
  - Troubleshooting (30%)
  - Cluster Architecture (25%)

3. **어려운 문제는 Flag**
  - 시험 인터페이스의 Flag 기능 활용
  - 모든 문제를 한 번 훑은 후 다시 돌아오기

### 3. 각 문제당 시간 배분

- **쉬운 문제 (1-3점)**: 3-5분
- **중간 문제 (4-7점)**: 8-12분
- **어려운 문제 (8-10점)**: 15-20분

**예시 시간표:**

- 00:00-00:10: 환경 설정
- 00:10-00:50: 쉬운 문제 8개 (40분)
- 00:50-01:30: 중간 문제 5개 (40분)
- 01:30-01:50: 어려운 문제 2-3개 (20분)
- 01:50-02:00: Flag한 문제 재확인 (10분)

### 4. 시험 중 팁

**컨텍스트 전환 필수:**

```bash
# 문제마다 컨텍스트가 명시됨
kubectl config use-context <cluster-name>

# 항상 확인
kubectl config current-context
```

**검증 습관화:**

```bash
# 리소스 생성 후 항상 확인
kubectl get <resource>
kubectl describe <resource> <name>

# 로그 확인
kubectl logs <pod-name>

# 이벤트 확인
kubectl get events --sort-by='.lastTimestamp' | tail -10
```

**빠른 YAML 편집:**

```bash
# 기존 리소스 수정
kubectl edit <resource> <name>

# 또는 YAML 추출 후 수정
kubectl get <resource> <name> -o yaml > resource.yaml
vim resource.yaml
kubectl apply -f resource.yaml
```

---

## 공식 문서 활용

### kubernetes.io 검색 전략

**1. 검색 키워드:**

- "pod example"
- "deployment yaml"
- "persistent volume"
- "rbac serviceaccount"
- "network policy example"

**2. 자주 사용하는 문서 경로:**

- Tasks: https://kubernetes.io/docs/tasks/
- Concepts: https://kubernetes.io/docs/concepts/
- Reference: https://kubernetes.io/docs/reference/

**3. 빠른 네비게이션:**

- Ctrl+F로 페이지 내 검색
- 예제 YAML 복사 → 붙여넣기 → 수정

**4. 북마크 추천:**

시험 중 북마크는 허용되지 않지만, 연습 시 다음 페이지를 자주 참고하세요:

- Pod: https://kubernetes.io/docs/concepts/workloads/pods/
- Service: https://kubernetes.io/docs/concepts/services-networking/service/
- Ingress: https://kubernetes.io/docs/concepts/services-networking/ingress/
- PV/PVC: https://kubernetes.io/docs/concepts/storage/persistent-volumes/
- RBAC: https://kubernetes.io/docs/reference/access-authn-authz/rbac/
- NetworkPolicy: https://kubernetes.io/docs/concepts/services-networking/network-policies/

---

## 도메인별 베스트 프랙티스

### 1. Storage (10%)

**빠른 PVC 생성:**

```bash
# PVC 생성 (Imperative 불가, YAML 필요)
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: myclaim
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
  storageClassName: standard
EOF

# Pod에 PVC 마운트
kubectl run nginx --image=nginx --dry-run=client -o yaml > pod.yaml
# 수동으로 volumes 섹션 추가 후
kubectl apply -f pod.yaml
```

**PV 확인:**

```bash
kubectl get pv
kubectl get pvc
kubectl describe pvc myclaim
```

### 2. Troubleshooting (30%)

**체크리스트:**

1. **Pod 문제:**
   ```bash
   kubectl get pods
   kubectl describe pod <name>
   kubectl logs <name>
   kubectl logs <name> --previous
   ```

2. **Service 문제:**
   ```bash
   kubectl get svc
   kubectl get endpoints <service-name>
   kubectl describe svc <service-name>
   ```

3. **Node 문제:**
   ```bash
   kubectl get nodes
   kubectl describe node <node-name>
   ssh <node>
   systemctl status kubelet
   journalctl -u kubelet
   ```

4. **Control Plane 문제:**
   ```bash
   kubectl get pods -n kube-system
   kubectl logs -n kube-system <component-pod>
   cat /etc/kubernetes/manifests/<component>.yaml
   ```

### 3. Workloads & Scheduling (15%)

**Resource Limits 설정:**

```bash
# Imperative (불가)
# Declarative 필요
kubectl run nginx --image=nginx --dry-run=client -o yaml > pod.yaml

# pod.yaml 수정
spec:
  containers:
  - name: nginx
    image: nginx
    resources:
      requests:
        memory: "64Mi"
        cpu: "250m"
      limits:
        memory: "128Mi"
        cpu: "500m"
```

**Node Selector:**

```bash
# 노드에 레이블 추가
kubectl label node node01 disktype=ssd

# Pod에 NodeSelector 설정
spec:
  nodeSelector:
    disktype: ssd
```

### 4. Cluster Architecture (25%)

**RBAC 설정:**

```bash
# Role 생성
kubectl create role pod-reader --verb=get,list,watch --resource=pods

# RoleBinding 생성
kubectl create rolebinding pod-reader-binding --role=pod-reader --user=jane

# ClusterRole 생성
kubectl create clusterrole node-reader --verb=get,list --resource=nodes

# ClusterRoleBinding
kubectl create clusterrolebinding node-reader-binding --clusterrole=node-reader --user=bob

# ServiceAccount 생성
kubectl create serviceaccount app-sa

# ServiceAccount에 Role 바인딩
kubectl create rolebinding app-sa-binding --role=pod-reader --serviceaccount=default:app-sa
```

**kubeadm Upgrade:**

```bash
# Control Plane
apt-get update
apt-get install -y kubeadm=1.28.0-00
kubeadm upgrade apply v1.28.0
apt-get install -y kubelet=1.28.0-00 kubectl=1.28.0-00
systemctl daemon-reload
systemctl restart kubelet

# Worker Node
kubectl drain node01 --ignore-daemonsets
# node01에서
apt-get update
apt-get install -y kubeadm=1.28.0-00
kubeadm upgrade node
apt-get install -y kubelet=1.28.0-00
systemctl daemon-reload
systemctl restart kubelet
# Control Plane에서
kubectl uncordon node01
```

**etcd Backup:**

```bash
ETCDCTL_API=3 etcdctl snapshot save /tmp/etcd-backup.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
```

### 5. Services & Networking (20%)

**NetworkPolicy:**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-specific
spec:
  podSelector:
    matchLabels:
      app: myapp
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
      ports:
        - protocol: TCP
          port: 80
```

**Ingress:**

```bash
# Ingress 생성 (YAML 필요)
kubectl create ingress myapp --rule="myapp.com/=myapp-svc:80" --dry-run=client -o yaml > ingress.yaml
kubectl apply -f ingress.yaml
```

---

## 실전 Mock Exam 접근법

### 문제 예시 1: Pod 생성 (쉬움, 2분)

**문제:** "nginx 이미지를 사용하는 Pod를 생성하고, 레이블 app=web을 추가하세요."

**풀이:**

```bash
kubectl run nginx --image=nginx --labels="app=web"
kubectl get pods --show-labels
```

### 문제 예시 2: Deployment Scale (쉬움, 2분)

**문제:** "nginx Deployment의 Replica를 5개로 증가시키세요."

**풀이:**

```bash
kubectl scale deployment nginx --replicas=5
kubectl get deployment nginx
```

### 문제 예시 3: Service 생성 (중간, 5분)

**문제:** "nginx Deployment를 ClusterIP 서비스로 노출하세요. 포트는 80이다."

**풀이:**

```bash
kubectl expose deployment nginx --port=80 --type=ClusterIP --name=nginx-svc
kubectl get svc nginx-svc
kubectl get endpoints nginx-svc
```

### 문제 예시 4: Troubleshooting (어려움, 10분)

**문제:** "webapp Pod가 CrashLoopBackOff 상태이다. 원인을 찾아 수정하세요."

**풀이:**

```bash
# 1. 상태 확인
kubectl get pods

# 2. 상세 정보
kubectl describe pod webapp

# 3. 로그 확인
kubectl logs webapp
kubectl logs webapp --previous

# 4. 원인 파악 (예: ConfigMap 누락)
kubectl get configmap

# 5. 수정 (ConfigMap 생성)
kubectl create configmap webapp-config --from-literal=key=value

# 6. Pod 재생성
kubectl delete pod webapp --force --grace-period=0
```

### 문제 예시 5: RBAC (어려움, 15분)

**문제:** "developer라는 사용자에게 dev 네임스페이스의 Pod에 대한 get, list 권한을 부여하세요."

**풀이:**

```bash
# 1. Role 생성
kubectl create role pod-reader --verb=get,list --resource=pods -n dev

# 2. RoleBinding 생성
kubectl create rolebinding dev-pod-reader --role=pod-reader --user=developer -n dev

# 3. 검증
kubectl auth can-i get pods --as=developer -n dev
# yes
```

---

## 시험 당일 체크리스트

### 시험 시작 전

- [ ] 신분증 준비 (여권, 주민등록증)
- [ ] 시험 환경 정리 (책상 위 물건 제거)
- [ ] 웹캠, 마이크 테스트
- [ ] 안정적인 인터넷 연결 확인
- [ ] 조용한 환경 확보

### 시험 시작 후 (첫 10분)

- [ ] Alias 설정 (`alias k=kubectl`)
- [ ] kubectl 자동 완성 활성화
- [ ] vim 설정
- [ ] 모든 클러스터 컨텍스트 확인
- [ ] 모든 문제 훑어보기

### 문제 풀이 중

- [ ] 문제마다 컨텍스트 확인
- [ ] 리소스 생성 후 검증
- [ ] Flag 기능 활용 (어려운 문제)
- [ ] 시간 배분 체크

### 시험 종료 전 (마지막 10분)

- [ ] Flag한 문제 재확인
- [ ] 모든 답안 검증
- [ ] 불필요한 리소스 삭제 확인

---

## 추가 학습 리소스

### 공식 리소스

- Kubernetes 공식 문서: https://kubernetes.io/docs/
- CKA 시험 커리큘럼: https://github.com/cncf/curriculum
- kubectl Cheat Sheet: https://kubernetes.io/docs/reference/kubectl/cheatsheet/

### 연습 환경

- Killer.sh: CKA 시험 환경과 유사한 Mock Exam (시험 등록 시 2회 제공)
- Katacoda Kubernetes Playground
- Play with Kubernetes

### Mock Exam 사이트

- Killer.sh (가장 추천)
- Udemy - Mumshad Mannambeth의 CKA 과정
- Linux Academy / A Cloud Guru

---

## 최종 정리

### 반드시 암기할 명령어

```bash
# Pod 생성
kubectl run <name> --image=<image>

# Deployment 생성
kubectl create deployment <name> --image=<image> --replicas=<n>

# Service 노출
kubectl expose deployment <name> --port=<port> --type=<type>

# Scale
kubectl scale deployment <name> --replicas=<n>

# YAML 생성
--dry-run=client -o yaml

# 컨텍스트 전환
kubectl config use-context <context>

# Troubleshooting
kubectl describe <resource> <name>
kubectl logs <pod> [-c container] [--previous]
kubectl get events --sort-by='.lastTimestamp'

# Node 관리
kubectl drain <node> --ignore-daemonsets
kubectl uncordon <node>

# RBAC
kubectl create role <name> --verb=<verbs> --resource=<resources>
kubectl create rolebinding <name> --role=<role> --user=<user>

# etcd Backup
ETCDCTL_API=3 etcdctl snapshot save <file> --endpoints=<ep> --cacert=<ca> --cert=<cert> --key=<key>
```

### 시험 전략

1. **시간 관리**: 쉬운 문제로 점수 확보 후 어려운 문제 도전
2. **Imperative 명령어 숙달**: --dry-run=client -o yaml 활용
3. **검증 습관화**: 모든 작업 후 kubectl get/describe로 확인
4. **공식 문서 검색 연습**: 빠르게 예제 찾아 적용
5. **Troubleshooting 집중**: 30% 배점, describe + logs + events 순서로
6. **컨텍스트 전환 확인**: 매 문제마다 kubectl config use-context 확인
7. **Mock Exam 반복**: Killer.sh를 최소 3회 이상 풀어보기

---
