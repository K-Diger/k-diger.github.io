---
title: "Part 4: kubectl 마스터하기 - 필수 명령어와 팁"
date: 2026-01-05
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, kubectl, CLI]
layout: post
toc: true
math: true
mermaid: true
---

## 1. kubectl 기본 구조

### 1.1 명령어 형식

```bash
kubectl [command] [TYPE] [NAME] [flags]
```

| 요소 | 설명 | 예시 |
|------|------|------|
| command | 수행할 작업 | get, create, delete, apply |
| TYPE | 리소스 종류 | pod, deployment, service |
| NAME | 리소스 이름 | nginx, my-app |
| flags | 추가 옵션 | -n namespace, -o yaml |

```bash
# 예시
kubectl get pods nginx -n production -o yaml
#       │    │    │     │              │
#       │    │    │     │              └── 출력 형식
#       │    │    │     └── 네임스페이스 지정
#       │    │    └── 리소스 이름
#       │    └── 리소스 타입
#       └── 명령어
```

### 1.2 리소스 타입 약어

자주 사용하는 리소스의 약어를 알아두면 타이핑 시간을 줄일 수 있다.

```bash
# 리소스 타입과 약어 확인
kubectl api-resources
```

| 리소스 | 약어 | 리소스 | 약어 |
|--------|------|--------|------|
| pods | po | services | svc |
| deployments | deploy | replicasets | rs |
| configmaps | cm | secrets | - |
| persistentvolumes | pv | persistentvolumeclaims | pvc |
| namespaces | ns | nodes | no |
| serviceaccounts | sa | daemonsets | ds |
| statefulsets | sts | ingresses | ing |
| networkpolicies | netpol | endpoints | ep |

```bash
# 동일한 명령어
kubectl get pods
kubectl get po

kubectl get deployments
kubectl get deploy

kubectl get services
kubectl get svc
```

---

## 2. 필수 명령어

### 2.1 리소스 조회 (get)

```bash
# 기본 조회
kubectl get pods
kubectl get pods -o wide              # 추가 정보 (IP, Node)
kubectl get pods -o yaml              # YAML 출력
kubectl get pods -o json              # JSON 출력

# 특정 리소스 조회
kubectl get pod nginx
kubectl get pod nginx -o yaml

# 모든 네임스페이스
kubectl get pods -A
kubectl get pods --all-namespaces

# 특정 네임스페이스
kubectl get pods -n kube-system

# 여러 리소스 타입 동시 조회
kubectl get pods,svc,deploy

# 모든 리소스 조회
kubectl get all                       # 주요 리소스만
kubectl get all -A                    # 모든 네임스페이스

# Label 기반 필터링
kubectl get pods -l app=nginx
kubectl get pods -l "app in (nginx, apache)"
kubectl get pods -l app=nginx,version=v1

# 정렬
kubectl get pods --sort-by=.metadata.creationTimestamp
kubectl get pods --sort-by=.status.phase
```

### 2.2 상세 정보 조회 (describe)

```bash
# 리소스 상세 정보
kubectl describe pod nginx
kubectl describe node worker-1
kubectl describe deployment nginx

# Events 섹션이 트러블슈팅에 매우 유용
kubectl describe pod nginx | tail -20
```

`describe`는 다음 정보를 제공한다:
- 리소스 메타데이터 (이름, 라벨, 어노테이션)
- 현재 상태
- **Events** (최근 발생한 이벤트 - 트러블슈팅 핵심!)

### 2.3 리소스 생성 (create, apply)

```bash
# 명령형 생성
kubectl create deployment nginx --image=nginx
kubectl create namespace production
kubectl create configmap app-config --from-literal=key=value
kubectl create secret generic db-secret --from-literal=password=1234

# 선언형 생성/업데이트 (권장)
kubectl apply -f deployment.yaml
kubectl apply -f ./manifests/          # 디렉토리 내 모든 YAML
kubectl apply -f https://example.com/manifest.yaml  # URL

# 차이점:
# create: 리소스가 이미 존재하면 에러
# apply:  리소스가 존재하면 업데이트, 없으면 생성
```

### 2.4 리소스 삭제 (delete)

```bash
# 단일 리소스 삭제
kubectl delete pod nginx
kubectl delete deployment nginx

# 여러 리소스 삭제
kubectl delete pod nginx apache tomcat

# 파일 기반 삭제
kubectl delete -f deployment.yaml

# Label 기반 삭제
kubectl delete pods -l app=nginx

# 네임스페이스의 모든 Pod 삭제
kubectl delete pods --all -n production

# 강제 삭제 (stuck 상태일 때)
kubectl delete pod nginx --grace-period=0 --force

# 네임스페이스 삭제 (내부 리소스 모두 삭제)
kubectl delete namespace production
```

### 2.5 리소스 수정 (edit)

```bash
# 리소스 편집 (기본 에디터)
kubectl edit deployment nginx

# 에디터 지정
KUBE_EDITOR="nano" kubectl edit deployment nginx
KUBE_EDITOR="code --wait" kubectl edit deployment nginx
```

### 2.6 로그 확인 (logs)

```bash
# Pod 로그
kubectl logs nginx
kubectl logs nginx -c container-name     # 특정 컨테이너
kubectl logs nginx --all-containers       # 모든 컨테이너

# 실시간 로그 (follow)
kubectl logs -f nginx

# 마지막 N줄
kubectl logs --tail=100 nginx

# 이전 컨테이너 로그 (재시작 전)
kubectl logs nginx --previous

# 시간 기반
kubectl logs nginx --since=1h
kubectl logs nginx --since-time=2024-01-01T00:00:00Z

# 여러 Pod 로그 (Label 기반)
kubectl logs -l app=nginx --all-containers
```

### 2.7 컨테이너 내부 접속 (exec)

```bash
# 단일 명령 실행
kubectl exec nginx -- ls /
kubectl exec nginx -- cat /etc/nginx/nginx.conf

# 인터랙티브 셸
kubectl exec -it nginx -- /bin/bash
kubectl exec -it nginx -- /bin/sh       # bash가 없는 경우

# 특정 컨테이너 지정
kubectl exec -it nginx -c sidecar -- /bin/sh
```

### 2.8 포트 포워딩 (port-forward)

```bash
# Pod 포트 포워딩
kubectl port-forward pod/nginx 8080:80

# Service 포트 포워딩
kubectl port-forward svc/nginx-service 8080:80

# Deployment 포트 포워딩
kubectl port-forward deployment/nginx 8080:80

# 백그라운드 실행
kubectl port-forward pod/nginx 8080:80 &
```

### 2.9 파일 복사 (cp)

```bash
# 로컬 → Pod
kubectl cp ./local-file.txt nginx:/tmp/file.txt

# Pod → 로컬
kubectl cp nginx:/var/log/nginx/access.log ./access.log

# 특정 컨테이너
kubectl cp nginx:/tmp/file.txt ./file.txt -c container-name
```

---

## 3. CKA 필수 명령어 (명령형)

CKA 시험에서는 시간이 중요하므로 명령형 명령어를 숙지해야 한다.

### 3.1 Pod 생성

```bash
# 기본 Pod 생성
kubectl run nginx --image=nginx

# 포트 노출
kubectl run nginx --image=nginx --port=80

# 환경 변수
kubectl run nginx --image=nginx --env="VAR1=value1"

# 리소스 제한
kubectl run nginx --image=nginx --requests="cpu=100m,memory=256Mi" --limits="cpu=200m,memory=512Mi"

# 커맨드/인자 지정
kubectl run busybox --image=busybox --command -- sleep 3600
kubectl run busybox --image=busybox -- sleep 3600   # args만

# Dry-run으로 YAML 생성
kubectl run nginx --image=nginx --dry-run=client -o yaml > pod.yaml

# Label 지정
kubectl run nginx --image=nginx --labels="app=nginx,env=prod"
```

### 3.2 Deployment 생성

```bash
# 기본 Deployment
kubectl create deployment nginx --image=nginx

# Replicas 지정
kubectl create deployment nginx --image=nginx --replicas=3

# Dry-run으로 YAML 생성
kubectl create deployment nginx --image=nginx --dry-run=client -o yaml > deployment.yaml
```

### 3.3 Service 생성

```bash
# ClusterIP (기본)
kubectl expose pod nginx --port=80 --target-port=80 --name=nginx-svc
kubectl expose deployment nginx --port=80 --target-port=80

# NodePort
kubectl expose deployment nginx --port=80 --type=NodePort

# Dry-run으로 YAML 생성
kubectl expose deployment nginx --port=80 --type=NodePort --dry-run=client -o yaml > service.yaml

# Service 직접 생성
kubectl create service clusterip nginx --tcp=80:80
kubectl create service nodeport nginx --tcp=80:80 --node-port=30080
```

### 3.4 ConfigMap & Secret

```bash
# ConfigMap 생성
kubectl create configmap app-config --from-literal=key1=value1 --from-literal=key2=value2
kubectl create configmap app-config --from-file=config.properties
kubectl create configmap app-config --from-env-file=.env

# Secret 생성
kubectl create secret generic db-secret --from-literal=username=admin --from-literal=password=1234
kubectl create secret docker-registry regcred --docker-server=registry.example.com --docker-username=user --docker-password=pass

# TLS Secret
kubectl create secret tls tls-secret --cert=tls.crt --key=tls.key
```

### 3.5 기타 유용한 명령어

```bash
# Label 추가/수정/삭제
kubectl label pod nginx env=production
kubectl label pod nginx env=staging --overwrite
kubectl label pod nginx env-                     # 삭제

# Annotation 추가
kubectl annotate pod nginx description="web server"

# Taint 추가/제거
kubectl taint node worker-1 key=value:NoSchedule
kubectl taint node worker-1 key=value:NoSchedule-   # 제거

# 스케일
kubectl scale deployment nginx --replicas=5

# 이미지 업데이트
kubectl set image deployment/nginx nginx=nginx:1.22

# 환경 변수 추가
kubectl set env deployment/nginx ENV=production
kubectl set env deployment/nginx --from=configmap/app-config

# 롤아웃 관리
kubectl rollout status deployment/nginx
kubectl rollout history deployment/nginx
kubectl rollout undo deployment/nginx
kubectl rollout undo deployment/nginx --to-revision=2
kubectl rollout restart deployment/nginx

# 노드 관리
kubectl cordon node-1                            # 스케줄링 비활성화
kubectl uncordon node-1                          # 스케줄링 활성화
kubectl drain node-1 --ignore-daemonsets --delete-emptydir-data
```

---

## 4. 출력 포맷과 jsonpath

### 4.1 기본 출력 포맷

```bash
# 기본
kubectl get pods

# 넓은 출력
kubectl get pods -o wide

# YAML
kubectl get pods nginx -o yaml

# JSON
kubectl get pods nginx -o json

# 이름만
kubectl get pods -o name

# 커스텀 컬럼
kubectl get pods -o custom-columns=NAME:.metadata.name,STATUS:.status.phase
```

### 4.2 jsonpath 사용

```bash
# 특정 필드 추출
kubectl get pod nginx -o jsonpath='{.status.podIP}'
kubectl get pod nginx -o jsonpath='{.spec.containers[0].image}'

# 모든 Pod의 이름
kubectl get pods -o jsonpath='{.items[*].metadata.name}'

# 줄바꿈 추가
kubectl get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}'

# 조건부 필터링
kubectl get pods -o jsonpath='{.items[?(@.status.phase=="Running")].metadata.name}'

# Node의 InternalIP
kubectl get nodes -o jsonpath='{.items[*].status.addresses[?(@.type=="InternalIP")].address}'
```

### 4.3 유용한 jsonpath 예시 (CKA)

```bash
# 모든 Pod의 이미지 목록
kubectl get pods -A -o jsonpath='{range .items[*]}{.spec.containers[*].image}{"\n"}{end}'

# 특정 Label을 가진 Pod 수
kubectl get pods -l app=nginx -o jsonpath='{.items}' | jq length

# Node의 Taint 확인
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{": "}{.spec.taints[*].effect}{"\n"}{end}'

# PV의 용량 확인
kubectl get pv -o jsonpath='{range .items[*]}{.metadata.name}{": "}{.spec.capacity.storage}{"\n"}{end}'

# Secret 디코딩
kubectl get secret db-secret -o jsonpath='{.data.password}' | base64 -d
```

---

## 5. 컨텍스트와 설정

### 5.1 kubeconfig

```bash
# 현재 컨텍스트 확인
kubectl config current-context

# 모든 컨텍스트 목록
kubectl config get-contexts

# 컨텍스트 변경
kubectl config use-context my-cluster

# 기본 네임스페이스 변경
kubectl config set-context --current --namespace=production

# 새 컨텍스트 생성
kubectl config set-context my-context --cluster=my-cluster --user=my-user --namespace=production

# kubeconfig 파일 위치
# 기본: ~/.kube/config
# 환경변수로 지정: export KUBECONFIG=/path/to/config
```

### 5.2 여러 클러스터 관리

```bash
# KUBECONFIG 병합
export KUBECONFIG=~/.kube/config:~/.kube/cluster2.config

# 특정 파일 사용
kubectl --kubeconfig=/path/to/config get pods
```

---

## 6. 생산성 향상 팁

### 6.1 자동 완성 설정

```bash
# Bash
echo 'source <(kubectl completion bash)' >> ~/.bashrc
source ~/.bashrc

# Zsh
echo 'source <(kubectl completion zsh)' >> ~/.zshrc
source ~/.zshrc

# kubectl 별칭에도 자동완성 적용
echo 'alias k=kubectl' >> ~/.bashrc
echo 'complete -o default -F __start_kubectl k' >> ~/.bashrc
```

### 6.2 유용한 별칭

```bash
# ~/.bashrc 또는 ~/.zshrc에 추가
alias k='kubectl'
alias kg='kubectl get'
alias kd='kubectl describe'
alias kdel='kubectl delete'
alias ka='kubectl apply -f'
alias kl='kubectl logs'
alias ke='kubectl exec -it'
alias kgp='kubectl get pods'
alias kgs='kubectl get svc'
alias kgd='kubectl get deploy'
alias kgn='kubectl get nodes'
alias kga='kubectl get all'
alias kctx='kubectl config use-context'
alias kns='kubectl config set-context --current --namespace'

# 자주 사용하는 명령 조합
alias kgpw='kubectl get pods -o wide'
alias kgpa='kubectl get pods -A'
alias kgpaw='kubectl get pods -A -o wide'
```

### 6.3 CKA 시험용 설정

CKA 시험 시작 시 다음을 설정하면 효율적이다:

```bash
# 자동완성 활성화
source <(kubectl completion bash)

# 별칭 설정
alias k=kubectl
complete -o default -F __start_kubectl k

# 기본 에디터 설정 (선호에 따라)
export KUBE_EDITOR=vim
# 또는
export KUBE_EDITOR=nano

# dry-run 별칭 (YAML 생성용)
export do="--dry-run=client -o yaml"
# 사용: kubectl run nginx --image=nginx $do > pod.yaml
```

### 6.4 자주 실수하는 것들

```bash
# 실수: 네임스페이스 지정 안함
kubectl get pods                      # default 네임스페이스만
kubectl get pods -A                   # 모든 네임스페이스

# 실수: Service 타입 지정 안함
kubectl expose deployment nginx --port=80   # ClusterIP (클러스터 내부만)
kubectl expose deployment nginx --port=80 --type=NodePort  # 외부 접근 가능

# 실수: dry-run 잊음
kubectl run nginx --image=nginx       # 바로 생성됨
kubectl run nginx --image=nginx --dry-run=client -o yaml  # YAML만 출력

# 실수: Label selector 문법
kubectl get pods -l app=nginx         # O
kubectl get pods -l "app=nginx"       # O
kubectl get pods -l app:nginx         # X (콜론이 아님)
```

---

## 7. 디버깅 명령어

### 7.1 클러스터 상태 확인

```bash
# 클러스터 정보
kubectl cluster-info
kubectl cluster-info dump   # 상세 덤프

# 노드 상태
kubectl get nodes
kubectl describe node <node-name>
kubectl top nodes           # 리소스 사용량 (metrics-server 필요)

# 컴포넌트 상태
kubectl get componentstatuses   # deprecated지만 여전히 유용
kubectl get pods -n kube-system
```

### 7.2 Pod 디버깅

```bash
# Pod 상태 확인
kubectl get pods
kubectl describe pod <pod-name>

# 이벤트 확인
kubectl get events
kubectl get events --sort-by=.metadata.creationTimestamp
kubectl get events --field-selector involvedObject.name=<pod-name>

# 로그 확인
kubectl logs <pod-name>
kubectl logs <pod-name> --previous    # 이전 컨테이너

# 컨테이너 접속
kubectl exec -it <pod-name> -- /bin/sh

# 임시 디버그 컨테이너 (K8s 1.18+)
kubectl debug <pod-name> -it --image=busybox
```

### 7.3 네트워크 디버깅

```bash
# Service 확인
kubectl get svc
kubectl describe svc <service-name>

# Endpoint 확인 (Service가 Pod에 연결되어 있는지)
kubectl get endpoints <service-name>

# DNS 테스트
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup kubernetes.default

# 네트워크 연결 테스트
kubectl run -it --rm debug --image=nicolaka/netshoot --restart=Never -- /bin/bash
# 내부에서: curl, dig, ping 등 사용
```

---

## 8. 면접 빈출 질문

### Q1. kubectl apply와 kubectl create의 차이는?

**create:**
- 리소스를 새로 생성
- 리소스가 이미 존재하면 에러 발생
- 명령형 방식

**apply:**
- 리소스가 없으면 생성, 있으면 업데이트
- 마지막으로 적용된 설정을 annotation에 저장 (three-way merge)
- 선언형 방식
- GitOps, CI/CD에 적합

실무에서는 `apply`가 권장된다. 멱등성이 보장되고 반복 실행해도 안전하기 때문이다.

### Q2. Pod이 Pending 상태일 때 어떻게 디버깅하는가?

1. `kubectl describe pod <pod-name>`으로 Events 확인
2. 일반적인 원인:
   - **Insufficient resources**: 노드에 CPU/Memory 부족
   - **Unschedulable**: Taint/Toleration 불일치, NodeSelector 불일치
   - **No PV available**: PVC가 바인딩되지 않음
   - **Image pull failed**: 이미지 다운로드 실패

```bash
kubectl describe pod <pod-name> | grep -A 10 Events
```

### Q3. kubectl exec와 kubectl attach의 차이는?

**exec:**
- 새로운 프로세스를 시작하여 컨테이너에서 실행
- 주로 셸 접속, 디버깅 명령 실행에 사용
- `kubectl exec -it nginx -- /bin/bash`

**attach:**
- 이미 실행 중인 컨테이너의 메인 프로세스(PID 1)에 연결
- stdin/stdout/stderr를 연결
- `kubectl attach -it nginx`
- 컨테이너가 입력을 기다리는 경우에 유용

---

## 정리

### CKA 필수 암기 명령어

```bash
# Pod
kubectl run nginx --image=nginx --dry-run=client -o yaml > pod.yaml

# Deployment
kubectl create deployment nginx --image=nginx --replicas=3 --dry-run=client -o yaml > deploy.yaml

# Service
kubectl expose deployment nginx --port=80 --type=NodePort --dry-run=client -o yaml > svc.yaml

# ConfigMap
kubectl create configmap app-config --from-literal=key=value

# Secret
kubectl create secret generic db-secret --from-literal=password=1234

# 롤아웃
kubectl rollout status deployment/nginx
kubectl rollout undo deployment/nginx

# 노드 관리
kubectl cordon node-1
kubectl drain node-1 --ignore-daemonsets --delete-emptydir-data
kubectl uncordon node-1
```

### 다음 포스트

[Part 5: Pod 가이드](/posts/kubernetes-05-pod)에서는 Pod의 생명주기, 멀티컨테이너 패턴, Probe를 상세히 다룬다.

---

## 참고 자료

- [kubectl 공식 치트시트](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- [kubectl 명령어 레퍼런스](https://kubernetes.io/docs/reference/generated/kubectl/kubectl-commands)
- [jsonpath 문법](https://kubernetes.io/docs/reference/kubectl/jsonpath/)

