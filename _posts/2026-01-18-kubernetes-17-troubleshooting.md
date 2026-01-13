---
title: "Part 17: Troubleshooting - 장애 해결"
date: 2026-01-18
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, Troubleshooting, Debug]
layout: post
toc: true
math: true
mermaid: true
---

# Part 17: Troubleshooting

## Troubleshooting 접근법

### 체계적인 문제 해결 단계

1. **증상 파악**: 무엇이 작동하지 않는가?
2. **범위 좁히기**: Application, Control Plane, Worker Node, Network?
3. **로그 확인**: 에러 메시지 수집
4. **설정 검증**: YAML, 인증서, 권한 등
5. **테스트**: 변경 후 검증
6. **문서화**: 해결 과정 기록

### 핵심 디버깅 명령어

```bash
# 리소스 상태 확인
kubectl get <resource> -o wide
kubectl describe <resource> <name>

# 로그 확인
kubectl logs <pod-name>
kubectl logs <pod-name> -c <container-name>
kubectl logs <pod-name> --previous

# 이벤트 확인 (시간순 정렬)
kubectl get events --sort-by='.metadata.creationTimestamp'
kubectl get events -n <namespace> --sort-by='.lastTimestamp'

# 상세 출력
kubectl get <resource> -o yaml
kubectl get <resource> -o json

# 임시 디버그 Pod
kubectl run debug --image=busybox -it --rm --restart=Never -- sh

# Pod 내부 접속
kubectl exec -it <pod-name> -- /bin/bash
kubectl exec -it <pod-name> -c <container-name> -- /bin/sh

# Port Forward로 직접 접근
kubectl port-forward <pod-name> 8080:80

# 리소스 편집
kubectl edit <resource> <name>
```

---

## Application Failure

### Pod가 시작하지 않는 경우

**시나리오 1: ImagePullBackOff**

```bash
# 증상
kubectl get pods
# NAME                    READY   STATUS             RESTARTS   AGE
# nginx-deployment-xxx    0/1     ImagePullBackOff   0          2m

# 진단
kubectl describe pod nginx-deployment-xxx

# 에러 메시지 예:
# Events:
#   Type     Reason     Age                From               Message
#   ----     ------     ----               ----               -------
#   Normal   Scheduled  2m                 default-scheduler  Successfully assigned default/nginx-deployment-xxx to node01
#   Normal   Pulling    1m (x4 over 2m)    kubelet            Pulling image "nginx:typo"
#   Warning  Failed     1m (x4 over 2m)    kubelet            Failed to pull image "nginx:typo": rpc error: code = NotFound desc = failed to pull and unpack image "docker.io/library/nginx:typo": failed to resolve reference "docker.io/library/nginx:typo": docker.io/library/nginx:typo: not found
#   Warning  Failed     1m (x4 over 2m)    kubelet            Error: ErrImagePull
#   Normal   BackOff    1m (x6 over 2m)    kubelet            Back-off pulling image "nginx:typo"
#   Warning  Failed     1m (x6 over 2m)    kubelet            Error: ImagePullBackOff

# 해결
# 1. 이미지 이름 확인
# 2. 태그 확인
# 3. Private registry인 경우 imagePullSecrets 설정
kubectl edit deployment nginx-deployment
# image: nginx:typo → nginx:latest

# imagePullSecrets 생성 (Private Registry)
kubectl create secret docker-registry regcred \
  --docker-server=myregistry.com \
  --docker-username=user \
  --docker-password=pass \
  --docker-email=email@example.com

# Deployment에 추가
spec:
  template:
    spec:
      imagePullSecrets:
        - name: regcred
```

**시나리오 2: CrashLoopBackOff**

```bash
# 증상
kubectl get pods
# NAME                    READY   STATUS             RESTARTS      AGE
# app-xxx                 0/1     CrashLoopBackOff   5 (2m ago)    10m

# 진단
kubectl logs app-xxx
kubectl logs app-xxx --previous  # 이전 컨테이너 로그

# 일반적인 원인:
# - 애플리케이션 코드 오류
# - 설정 오류 (ConfigMap, Secret)
# - 필요한 의존성 누락
# - 리소스 부족

# 추가 디버깅
kubectl describe pod app-xxx

# Events 확인:
# Warning  BackOff    2m (x10 over 5m)  kubelet  Back-off restarting failed container

# 해결
# 1. 로그에서 에러 확인
# 2. ConfigMap/Secret 확인
kubectl get configmap
kubectl describe configmap app-config

# 3. 리소스 요구사항 확인
kubectl describe pod app-xxx | grep -A 5 "Limits:"

# 4. 라이브니스/리디니스 프로브 조정
kubectl edit deployment app
# livenessProbe:
#   initialDelaySeconds: 30  # 증가
#   periodSeconds: 10
```

**시나리오 3: Pending**

```bash
# 증상
kubectl get pods
# NAME      READY   STATUS    RESTARTS   AGE
# app-xxx   0/1     Pending   0          5m

# 진단
kubectl describe pod app-xxx

# 원인 1: 리소스 부족
# Events:
#   Warning  FailedScheduling  2m  default-scheduler  0/3 nodes are available: 3 Insufficient cpu.

# 해결: 리소스 요구사항 줄이기 또는 노드 추가
kubectl edit deployment app
# resources:
#   requests:
#     cpu: 100m  # 1000m → 100m로 감소

# 원인 2: PVC Pending
kubectl get pvc
# NAME       STATUS    VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   AGE
# data-pvc   Pending                                      standard       5m

kubectl describe pvc data-pvc

# 해결: StorageClass 확인 및 생성
kubectl get storageclass
kubectl describe storageclass standard

# 원인 3: Node Selector/Affinity 불일치
kubectl describe pod app-xxx
# Node-Selectors:  disktype=ssd
# Events:
#   Warning  FailedScheduling  0/3 nodes are available: 3 node(s) didn't match node selector.

# 해결: 노드에 레이블 추가 또는 selector 제거
kubectl label node node01 disktype=ssd
```

**시나리오 4: Init Container 실패**

```bash
# 증상
kubectl get pods
# NAME      READY   STATUS                  RESTARTS   AGE
# app-xxx   0/1     Init:CrashLoopBackOff   3          5m

# 진단
kubectl describe pod app-xxx
kubectl logs app-xxx -c init-container-name

# 해결
# Init Container의 로그를 확인하고 문제 수정
```

### Service 연결 문제

**시나리오: Service로 접근 불가**

```bash
# 1. Service 확인
kubectl get svc
kubectl describe svc my-service

# 2. Endpoints 확인 (가장 중요!)
kubectl get endpoints my-service

# 정상:
# NAME         ENDPOINTS                         AGE
# my-service   10.244.1.5:80,10.244.2.6:80      5m

# 문제:
# NAME         ENDPOINTS   AGE
# my-service   <none>      5m

# 원인: Selector가 Pod Label과 불일치
kubectl get pods --show-labels
# NAME      READY   STATUS    LABELS
# app-xxx   1/1     Running   app=myapp,version=v1

kubectl get svc my-service -o yaml | grep -A 5 selector
# selector:
#   app: wrong-label  # 불일치!

# 해결
kubectl edit svc my-service
# selector:
#   app: myapp  # 수정

# 검증
kubectl get endpoints my-service
# ENDPOINTS가 생성되었는지 확인

# 3. Port 확인
kubectl describe svc my-service
# Port:              80/TCP
# TargetPort:        8080/TCP

# Pod의 실제 포트 확인
kubectl get pod app-xxx -o yaml | grep -A 3 "ports:"
# ports:
#   - containerPort: 80  # TargetPort와 일치해야 함

# 4. 네트워크 연결 테스트
kubectl run test --image=busybox -it --rm --restart=Never -- wget -O- my-service

# 5. DNS 확인
kubectl run test --image=busybox -it --rm --restart=Never -- nslookup my-service
```

### ConfigMap/Secret 문제

```bash
# ConfigMap이 Pod에 마운트되지 않음
kubectl get pods
kubectl describe pod app-xxx

# Events:
# Warning  FailedMount  1m  kubelet  MountVolume.SetUp failed for volume "config" : configmap "app-config" not found

# 해결: ConfigMap 생성 확인
kubectl get configmap
kubectl create configmap app-config --from-file=config.yaml

# Secret 권한 문제
kubectl get secret
kubectl describe secret my-secret

# Secret을 환경변수로 사용 시
kubectl logs app-xxx
# Error: SECRET_KEY not found

# Secret YAML 확인
kubectl get secret my-secret -o yaml
# data:
#   password: cGFzc3dvcmQ=  # base64 인코딩 확인

# 디코딩 확인
echo "cGFzc3dvcmQ=" | base64 -d
```

### Application Failure 실습 과제

1. ImagePullBackOff 상황 만들고 해결하기
2. CrashLoopBackOff로 인한 장애 디버깅
3. Service Endpoints가 없는 문제 해결
4. ConfigMap 마운트 실패 시나리오 해결

---

## Control Plane Failure

### kube-apiserver 장애

```bash
# 증상: kubectl 명령이 작동하지 않음
kubectl get nodes
# The connection to the server localhost:8080 was refused

# 진단
# 1. API Server Pod 확인
kubectl get pods -n kube-system
# 작동하지 않으면 직접 확인

# Control Plane 노드에서
docker ps | grep kube-apiserver
crictl ps | grep kube-apiserver

# 2. API Server 로그 확인
# Static Pod로 실행되는 경우
tail -f /var/log/pods/kube-system_kube-apiserver-*/*/*.log

# 또는
journalctl -u kubelet | grep apiserver

# 3. Static Pod Manifest 확인
cat /etc/kubernetes/manifests/kube-apiserver.yaml

# 일반적인 오류:
# - 잘못된 인증서 경로
# - etcd 연결 실패
# - 포트 충돌

# 해결 예시: 인증서 경로 수정
vim /etc/kubernetes/manifests/kube-apiserver.yaml
# --client-ca-file=/etc/kubernetes/pki/ca.crt  # 올바른 경로 확인

# kubelet이 자동으로 재시작
# 또는 수동 재시작
systemctl restart kubelet

# 4. API Server 접근 테스트
curl -k https://localhost:6443/version

# 5. kubeconfig 확인
cat ~/.kube/config
# server: https://controlplane:6443  # 올바른 주소 확인
```

### etcd 장애

```bash
# 증상: 클러스터 상태 변경 불가, API Server 응답 느림

# 진단
# 1. etcd Pod 확인
kubectl get pods -n kube-system | grep etcd

# 2. etcd 로그 확인
kubectl logs -n kube-system etcd-controlplane

# 또는
journalctl -u etcd

# 3. etcd 멤버 상태 확인
ETCDCTL_API=3 etcdctl member list \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# 4. etcd 상태 확인
ETCDCTL_API=3 etcdctl endpoint health \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# 출력:
# https://127.0.0.1:2379 is healthy: successfully committed proposal: took = 2.345ms

# 5. etcd Manifest 확인
cat /etc/kubernetes/manifests/etcd.yaml

# 일반적인 오류:
# - 데이터 디렉토리 손상
# - 인증서 만료
# - 디스크 공간 부족
# - 권한 문제

# 해결 예시: 데이터 디렉토리 권한
ls -ld /var/lib/etcd
# drwx------  3 root root 4096 Dec 13 12:00 /var/lib/etcd

chown -R etcd:etcd /var/lib/etcd  # 필요시

# 디스크 공간 확인
df -h /var/lib/etcd

# 6. etcd 복구 (백업에서)
# Part 16 Backup and Restore 참조
```

### kube-scheduler 장애

```bash
# 증상: Pod가 Pending 상태로 유지

# 진단
# 1. Scheduler Pod 확인
kubectl get pods -n kube-system | grep scheduler

# 2. Scheduler 로그
kubectl logs -n kube-system kube-scheduler-controlplane

# 일반적인 에러:
# - kubeconfig 경로 오류
# - API Server 연결 실패
# - 권한 부족

# 3. Scheduler Manifest 확인
cat /etc/kubernetes/manifests/kube-scheduler.yaml

# 4. Scheduler가 작동하는지 확인
kubectl get events | grep -i scheduled

# 해결 예시: kubeconfig 경로 수정
vim /etc/kubernetes/manifests/kube-scheduler.yaml
# --kubeconfig=/etc/kubernetes/scheduler.conf  # 올바른 경로

# Pod 재생성 확인
kubectl get pods -n kube-system -w
```

### kube-controller-manager 장애

```bash
# 증상: ReplicaSet이 Pod를 생성하지 않음, Deployment 롤아웃 실패

# 진단
# 1. Controller Manager Pod 확인
kubectl get pods -n kube-system | grep controller-manager

# 2. 로그 확인
kubectl logs -n kube-system kube-controller-manager-controlplane

# 일반적인 에러:
# - Service Account 권한 부족
# - API Server 연결 실패
# - 인증서 문제

# 3. Manifest 확인
cat /etc/kubernetes/manifests/kube-controller-manager.yaml

# 4. Controller가 작동하는지 테스트
kubectl scale deployment nginx --replicas=3
kubectl get pods -w

# 해결: 설정 수정 후 자동 재시작 대기
```

### Control Plane Failure 실습 과제

1. kube-apiserver manifest를 고의로 손상시키고 복구
2. etcd 장애 시뮬레이션 및 복구
3. scheduler 장애로 인한 Pod Pending 해결
4. controller-manager 장애 디버깅

---

## Worker Node Failure

### Node NotReady 상태

```bash
# 증상
kubectl get nodes
# NAME     STATUS     ROLES    AGE   VERSION
# node01   NotReady   <none>   10d   v1.28.0

# 진단
# 1. Node 상세 정보
kubectl describe node node01

# Conditions:
# Ready   False   Wed, 13 Dec 2023 12:00:00 +0000   Wed, 13 Dec 2023 11:55:00 +0000   KubeletNotReady   kubelet is not ready: runtime network not ready: NetworkReady=false reason:NetworkPluginNotReady message:docker: network plugin is not ready: cni config uninitialized

# 2. 문제 원인별 해결

# 원인 1: kubelet이 실행되지 않음
# Node에 SSH 접속
ssh node01

systemctl status kubelet
# ● kubelet.service - kubelet: The Kubernetes Node Agent
#    Loaded: loaded (/lib/systemd/system/kubelet.service; enabled; vendor preset: enabled)
#    Active: inactive (dead)

# kubelet 시작
systemctl start kubelet
systemctl enable kubelet

# 로그 확인
journalctl -u kubelet -f

# 원인 2: kubelet 설정 오류
cat /var/lib/kubelet/config.yaml

# 일반적인 오류:
# - API Server 주소 잘못됨
# - 인증서 경로 오류
# - CNI 설정 오류

# API Server 주소 확인
grep server /etc/kubernetes/kubelet.conf
# server: https://controlplane:6443

# 인증서 확인
ls -l /var/lib/kubelet/pki/
openssl x509 -in /var/lib/kubelet/pki/kubelet-client-current.pem -text -noout

# 원인 3: 디스크/메모리 부족
df -h
free -m

# Disk Pressure 해결
# 불필요한 이미지 삭제
crictl images
crictl rmi <image-id>

# 로그 정리
journalctl --vacuum-time=2d

# 원인 4: Container Runtime 문제
systemctl status containerd
# 또는
systemctl status docker

systemctl restart containerd

# CRI 소켓 확인
crictl info

# 원인 5: CNI 플러그인 문제
ls /etc/cni/net.d/
cat /etc/cni/net.d/10-calico.conflist

# CNI 바이너리 확인
ls /opt/cni/bin/

# Calico/Flannel 등 CNI Pod 확인
kubectl get pods -n kube-system | grep -E "calico|flannel|weave"
```

### kubelet 인증서 만료

```bash
# 증상: Node가 NotReady, kubelet 로그에 인증서 에러

# 진단
journalctl -u kubelet | grep -i certificate

# 에러 예:
# certificate has expired or is not yet valid

# 인증서 확인
openssl x509 -in /var/lib/kubelet/pki/kubelet-client-current.pem -text -noout | grep -A 2 Validity

# Validity
#   Not Before: Dec 13 11:00:00 2022 GMT
#   Not After : Dec 13 11:00:00 2023 GMT  # 만료됨!

# 해결
# 1. 인증서 자동 갱신 설정 확인
cat /var/lib/kubelet/config.yaml | grep rotateCertificates
# rotateCertificates: true

# 2. kubelet 재시작하여 인증서 갱신 트리거
systemctl restart kubelet

# 3. 수동 갱신 (필요시)
kubeadm certs renew all

# 4. kubelet.conf 재생성
kubeadm init phase kubeconfig kubelet

# 5. 검증
kubectl get nodes
```

### 리소스 고갈

```bash
# CPU/Memory 압박
kubectl describe node node01

# Conditions:
# MemoryPressure   True
# DiskPressure     False

# 메모리 사용량 확인
kubectl top node node01
kubectl top pods --all-namespaces --sort-by=memory

# 해결
# 1. 리소스를 많이 사용하는 Pod 찾기
kubectl top pods -A --sort-by=memory | head -20

# 2. 불필요한 Pod 삭제
kubectl delete pod <pod-name> -n <namespace>

# 3. Resource Limits 적용
kubectl edit deployment <deployment-name>
# resources:
#   limits:
#     memory: "512Mi"
#   requests:
#     memory: "256Mi"
```

### Worker Node Failure 실습 과제

1. kubelet 중지 후 Node NotReady 상태 해결
2. CNI 플러그인 문제 디버깅 및 복구
3. 디스크 압박 시뮬레이션 및 해결
4. kubelet 인증서 갱신

---

## Network Troubleshooting

### Pod 간 통신 불가

```bash
# 시나리오: Pod A에서 Pod B로 ping 실패

# 1. 기본 연결 테스트
kubectl exec -it pod-a -- ping <pod-b-ip>

# 2. CNI 플러그인 확인
kubectl get pods -n kube-system | grep -E "calico|flannel|weave|cilium"

# CNI Pod 로그 확인
kubectl logs -n kube-system <cni-pod-name>

# 3. NetworkPolicy 확인
kubectl get networkpolicy -A

# NetworkPolicy가 있다면
kubectl describe networkpolicy <policy-name> -n <namespace>

# 4. Pod IP 확인
kubectl get pods -o wide

# 5. 라우팅 테스트
kubectl exec -it pod-a -- traceroute <pod-b-ip>

# 6. iptables 규칙 확인 (Node에서)
ssh node01
iptables -L -n -v -t nat | grep <pod-ip>

# 해결 예시: NetworkPolicy 수정
kubectl edit networkpolicy deny-all

# 모든 Ingress 허용
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - {}  # 모든 소스 허용
```

### DNS 문제

```bash
# 증상: Service 이름으로 접근 불가

# 1. DNS 테스트
kubectl run test --image=busybox -it --rm --restart=Never -- nslookup kubernetes.default

# 정상:
# Server:    10.96.0.10
# Address 1: 10.96.0.10 kube-dns.kube-system.svc.cluster.local
# Name:      kubernetes.default
# Address 1: 10.96.0.1 kubernetes.default.svc.cluster.local

# 에러:
# Server:    10.96.0.10
# Address 1: 10.96.0.10
# nslookup: can't resolve 'kubernetes.default'

# 2. CoreDNS Pod 확인
kubectl get pods -n kube-system -l k8s-app=kube-dns

# NAME                       READY   STATUS    RESTARTS   AGE
# coredns-74ff55c5b-abc12    1/1     Running   0          10d
# coredns-74ff55c5b-def34    1/1     Running   0          10d

# 3. CoreDNS 로그
kubectl logs -n kube-system -l k8s-app=kube-dns

# 4. CoreDNS ConfigMap 확인
kubectl get configmap -n kube-system coredns -o yaml

# apiVersion: v1
# kind: ConfigMap
# metadata:
#   name: coredns
#   namespace: kube-system
# data:
#   Corefile: |
#     .:53 {
#         errors
#         health {
#            lameduck 5s
#         }
#         ready
#         kubernetes cluster.local in-addr.arpa ip6.arpa {
#            pods insecure
#            fallthrough in-addr.arpa ip6.arpa
#            ttl 30
#         }
#         prometheus :9153
#         forward . /etc/resolv.conf {
#            max_concurrent 1000
#         }
#         cache 30
#         loop
#         reload
#         loadbalance
#     }

# 5. kube-dns Service 확인
kubectl get svc -n kube-system kube-dns

# NAME       TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)         AGE
# kube-dns   ClusterIP   10.96.0.10   <none>        53/UDP,53/TCP   10d

# 6. Pod의 DNS 설정 확인
kubectl exec -it test-pod -- cat /etc/resolv.conf

# nameserver 10.96.0.10
# search default.svc.cluster.local svc.cluster.local cluster.local
# options ndots:5

# 해결 예시: CoreDNS 재시작
kubectl rollout restart deployment coredns -n kube-system

# DNS 캐시 플러시 (Pod 재생성)
kubectl delete pod <pod-name>
```

### Service 접근 불가

```bash
# 1. Service 확인
kubectl get svc my-service
kubectl describe svc my-service

# 2. Endpoints 확인 (핵심!)
kubectl get endpoints my-service

# 문제: Endpoints가 없음
# 원인: Selector가 Pod Label과 불일치

# 3. Selector 검증
kubectl get svc my-service -o yaml | grep -A 5 selector
# selector:
#   app: myapp

kubectl get pods --show-labels | grep myapp

# 4. TargetPort 검증
kubectl get svc my-service -o yaml | grep targetPort
# targetPort: 8080

kubectl get pod <pod-name> -o yaml | grep containerPort
# containerPort: 80  # 불일치!

# 해결
kubectl edit svc my-service
# targetPort: 80  # 수정

# 5. kube-proxy 확인
kubectl get pods -n kube-system | grep kube-proxy
kubectl logs -n kube-system <kube-proxy-pod>

# 6. iptables 규칙 확인
ssh node01
iptables-save | grep my-service
```

### Ingress 문제

```bash
# 1. Ingress Controller 확인
kubectl get pods -n ingress-nginx

# 2. Ingress 리소스 확인
kubectl get ingress
kubectl describe ingress my-ingress

# 3. Ingress Controller 로그
kubectl logs -n ingress-nginx <ingress-controller-pod>

# 4. Backend Service 확인
kubectl get svc my-service
kubectl get endpoints my-service

# 5. Host 헤더 테스트
curl -H "Host: myapp.example.com" http://<ingress-ip>/

# 6. TLS 인증서 확인
kubectl get secret my-tls-secret -o yaml
kubectl describe ingress my-ingress | grep -A 5 TLS
```

### Network Troubleshooting 실습 과제

1. NetworkPolicy로 Pod 간 통신 차단하고 해결
2. CoreDNS 장애 시뮬레이션 및 복구
3. Service Endpoints 불일치 문제 디버깅
4. Ingress 라우팅 문제 해결

---

## 고급 디버깅 기법

### JSON PATH 활용

```bash
# 모든 Pod 이름 추출
kubectl get pods -o jsonpath='{.items[*].metadata.name}'

# 특정 필드만 추출
kubectl get pods -o jsonpath='{.items[*].spec.containers[*].image}' | tr ' ' '\n'

# 조건부 필터 (Running 상태인 Pod만)
kubectl get pods -o jsonpath='{.items[?(@.status.phase=="Running")].metadata.name}'

# 복합 출력 (이름과 IP)
kubectl get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.podIP}{"\n"}{end}'

# Node의 CPU/Memory 용량
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.capacity.cpu}{"\t"}{.status.capacity.memory}{"\n"}{end}'

# PVC의 StorageClass
kubectl get pvc -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.storageClassName}{"\n"}{end}'

# 정렬 (PV를 용량순으로)
kubectl get pv --sort-by=.spec.capacity.storage

# Custom Columns
kubectl get pods -o custom-columns=NAME:.metadata.name,STATUS:.status.phase,NODE:.spec.nodeName,IP:.status.podIP
```

### 임시 디버그 컨테이너

```bash
# Ephemeral Container (Kubernetes 1.23+)
kubectl debug -it <pod-name> --image=busybox --target=<container-name>

# 새로운 디버그 Pod 생성
kubectl run debug --image=nicolaka/netshoot -it --rm --restart=Never -- /bin/bash

# 안에서 네트워크 도구 사용
# ping, curl, nslookup, traceroute, tcpdump 등

# 특정 Node에서 디버그
kubectl debug node/node01 -it --image=ubuntu

# Node의 파일시스템은 /host에 마운트됨
chroot /host
```

### 이벤트 분석

```bash
# 시간순 정렬
kubectl get events --sort-by='.lastTimestamp'

# 특정 네임스페이스
kubectl get events -n kube-system --sort-by='.lastTimestamp'

# Warning만 필터
kubectl get events --field-selector type=Warning

# 특정 리소스 관련 이벤트
kubectl get events --field-selector involvedObject.name=my-pod

# 실시간 모니터링
kubectl get events -w

# 이벤트를 시간대별로 그룹화
kubectl get events --sort-by='.lastTimestamp' -o custom-columns=TIME:.lastTimestamp,TYPE:.type,REASON:.reason,MESSAGE:.message
```

### 리소스 사용량 모니터링

```bash
# Metrics Server 설치 확인
kubectl get deployment metrics-server -n kube-system

# Node 리소스 사용량
kubectl top nodes

# Pod 리소스 사용량
kubectl top pods -A --sort-by=cpu
kubectl top pods -A --sort-by=memory

# 특정 Pod의 컨테이너별 리소스
kubectl top pod <pod-name> --containers

# 실시간 모니터링 (watch)
watch -n 1 kubectl top pods
```

### 로그 고급 활용

```bash
# 이전 컨테이너 로그 (재시작된 경우)
kubectl logs <pod-name> --previous

# 여러 컨테이너 중 특정 컨테이너
kubectl logs <pod-name> -c <container-name>

# 마지막 N줄만
kubectl logs <pod-name> --tail=100

# 특정 시간 이후 로그
kubectl logs <pod-name> --since=1h
kubectl logs <pod-name> --since=2023-12-13T10:00:00Z

# 실시간 로그 스트리밍
kubectl logs <pod-name> -f

# 여러 Pod 로그 동시 보기 (Label Selector)
kubectl logs -l app=nginx --all-containers=true

# 타임스탬프 포함
kubectl logs <pod-name> --timestamps

# 로그 저장
kubectl logs <pod-name> > pod.log
```

### Kubectl Plugins

```bash
# kubectl-debug 플러그인 설치
kubectl krew install debug

# 사용
kubectl debug <pod-name>

# kubectl-tree (리소스 계층 구조)
kubectl krew install tree
kubectl tree deployment nginx

# kubectl-whoami (현재 인증 정보)
kubectl krew install whoami
kubectl whoami

# kubectl-stern (다중 Pod 로그)
kubectl stern <pod-query>
```

---

## 실전 Troubleshooting 시나리오

### 시나리오 1: 애플리케이션이 갑자기 응답하지 않음

```bash
# 1단계: Pod 상태 확인
kubectl get pods -l app=myapp

# 2단계: 최근 이벤트
kubectl get events --sort-by='.lastTimestamp' | head -20

# 3단계: Pod 로그
kubectl logs -l app=myapp --tail=100

# 4단계: Service/Endpoints
kubectl get svc myapp-service
kubectl get endpoints myapp-service

# 5단계: 리소스 사용량
kubectl top pods -l app=myapp

# 6단계: 네트워크 테스트
kubectl run test --image=busybox -it --rm -- wget -O- myapp-service

# 해결 사례:
# - OOMKilled: Memory Limit 증가
# - CrashLoopBackOff: 애플리케이션 로그 확인
# - Endpoints 없음: Selector 수정
```

### 시나리오 2: 클러스터 전체 성능 저하

```bash
# 1단계: Node 상태
kubectl get nodes
kubectl top nodes

# 2단계: Control Plane 컴포넌트
kubectl get pods -n kube-system
kubectl top pods -n kube-system --sort-by=cpu

# 3단계: etcd 성능
ETCDCTL_API=3 etcdctl endpoint status --cluster -w table

# 4단계: API Server 부하
kubectl get --raw /metrics | grep apiserver_request_total

# 5단계: 리소스 고갈 Pod
kubectl top pods -A --sort-by=memory | head -20

# 해결 사례:
# - etcd 디스크 느림: SSD로 이전
# - API Server 과부하: Rate Limiting 조정
# - Memory Leak: Pod 재시작 및 코드 수정
```

### 시나리오 3: 특정 Node의 Pod만 문제

```bash
# 1단계: Node 상세 정보
kubectl describe node node01

# 2단계: Node의 모든 Pod
kubectl get pods -A -o wide --field-selector spec.nodeName=node01

# 3단계: Node에 SSH 접속
ssh node01

# kubelet 상태
systemctl status kubelet
journalctl -u kubelet -f

# Container Runtime
systemctl status containerd

# 디스크/메모리
df -h
free -m

# 4단계: CNI 문제
ls /etc/cni/net.d/
ls /opt/cni/bin/

# 해결 사례:
# - Disk Pressure: 로그/이미지 정리
# - CNI 손상: CNI 재설치
# - kubelet 설정 오류: config.yaml 수정
```

---

**이전**: [Part 16: 클러스터 유지보수](./2026-01-17-kubernetes-16-drain-upgrade) ←
**다음**: [Part 18: CKA 베스트 프랙티스](./2026-01-19-kubernetes-18-cka-exam) →
