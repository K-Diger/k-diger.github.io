---
title: "Part 7: Service와 Endpoint - 네트워킹 기초"
date: 2026-01-08
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, Service, Networking]
layout: post
toc: true
math: true
mermaid: true
---

# Part 7: 네트워킹 기초

## 15. Service

### 15.1 Service 개념 (안정적인 엔드포인트)

**정의:**

Service는 **Pod 집합에 대한 안정적인 네트워크 엔드포인트**를 제공한다.

**필요 이유:**

- Pod IP는 동적 (Pod 재생성 시 변경)
- Pod이 여러 개 있을 때 로드 밸런싱 필요
- 클러스터 내부/외부 접근 경로 필요

```
┌──────────────────────────────┐
│      Service (안정적)        │
│  ClusterIP: 10.0.1.5         │
│  Port: 80                    │
└─────────────┬────────────────┘
      │ 라우팅
      ├────→ Pod-A: 172.17.0.2
      ├────→ Pod-B: 172.17.0.3
      └────→ Pod-C: 172.17.0.4
```

### 15.2 ClusterIP (기본값)

**특징:**

- 클러스터 내부에서만 접근 가능
- VIP (Virtual IP) 할당
- 로드 밸런싱

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  type: ClusterIP
  selector:
    app: myapp
  ports:
    - port: 80          # Service 포트
      targetPort: 8080  # Pod 포트
```

```bash
# 클러스터 내부에서만 접근 가능
kubectl run -it --image=busybox --restart=Never -- wget http://myapp
```

### 15.3 NodePort

**특징:**

- 모든 노드의 특정 포트에 노출
- 클러스터 외부에서 접근 가능
- ClusterIP + NodePort

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  type: NodePort
  selector:
    app: myapp
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080  # 선택사항 (자동 할당: 30000-32767)
```

```bash
# 접근 방법
curl http://<node-ip>:30080
```

### 15.4 LoadBalancer

**특징:**

- 클라우드 제공자의 로드 밸런서 사용
- 외부 IP 할당
- NodePort + LoadBalancer

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  type: LoadBalancer
  selector:
    app: myapp
  ports:
    - port: 80
      targetPort: 8080
```

### 15.5 ExternalName

**특징:**

- 클러스터 외부 서비스 매핑
- CNAME 리다이렉트

```yaml
apiVersion: v1
kind: Service
metadata:
  name: external-db
spec:
  type: ExternalName
  externalName: db.example.com
  ports:
    - port: 3306
```

### 15.6 Headless Service

**특징:**

- ClusterIP 없음 (None)
- Pod DNS 이름 직접 노출
- StatefulSet과 함께 사용

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mysql-headless
spec:
  clusterIP: None
  selector:
    app: mysql
  ports:
    - port: 3306
```

DNS: `mysql-0.mysql-headless.default.svc.cluster.local`

### 15.7 Session Affinity

```yaml
spec:
  sessionAffinity: ClientIP  # 같은 클라이언트는 같은 Pod으로
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800
```

---

## 16. Endpoints

### 16.1 Endpoints 자동 생성

Service가 생성되면 Endpoint 컨트롤러가 자동으로 Endpoint를 생성/관리한다.

```bash
# Endpoints 확인
kubectl get endpoints
kubectl describe endpoints myapp
```

### 16.2 수동 Endpoints 관리

Service 없이 Endpoint를 수동 생성할 수 있다:

```yaml
apiVersion: v1
kind: Endpoints
metadata:
  name: external-service
subsets:
  - addresses:
      - ip: 192.168.1.100
    ports:
      - port: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: external-service
spec:
  ports:
    - port: 80
      targetPort: 8080
  # selector 없음 (수동 Endpoints 사용)
```

---

## 실습 과제

1. **ClusterIP Service 생성**
   ```bash
   # Deployment 생성
   kubectl create deployment nginx --image=nginx --replicas=3

   # ClusterIP Service 노출
   kubectl expose deployment nginx --port=80 --target-port=80 --type=ClusterIP

   # Service 확인
   kubectl get svc nginx

   # 클러스터 내부에서 접근 테스트
   kubectl run -it --rm debug --image=busybox --restart=Never -- wget -O- http://nginx
   ```

2. **NodePort Service 생성**
   ```bash
   # NodePort Service로 변경
   kubectl patch service nginx -p '{"spec":{"type":"NodePort"}}'

   # NodePort 확인
   kubectl get svc nginx

   # 외부에서 접근
   curl http://<node-ip>:<node-port>
   ```

3. **Headless Service 실습**
   ```bash
   # Headless Service 생성
   kubectl create service clusterip mysql --tcp=3306:3306 --clusterip="None"

   # StatefulSet과 함께 사용
   kubectl apply -f mysql-statefulset.yaml

   # DNS 조회
   kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup mysql-0.mysql.default.svc.cluster.local
   ```

---

## 추가 학습 자료

- [Service 공식 문서](https://kubernetes.io/docs/concepts/services-networking/service/)
- [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)
- [Connecting Applications with Services](https://kubernetes.io/docs/tutorials/services/connect-applications-service/)

---

**이전**: [Part 6: Volume, PV, PVC](https://k-diger.github.io/posts//posts/kubernetes-06-volume-pv-pvc) ←
**다음**: [Part 8: Ingress와 NetworkPolicy](https://k-diger.github.io/posts//posts/kubernetes-08-ingress-networkpolicy) →
