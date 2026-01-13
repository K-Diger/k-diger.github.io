---
title: "Kubernetes 완벽 가이드 (CKA 대비)"
date: 2026-01-01
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, Orchestration, CKA]
layout: post
toc: true
math: true
mermaid: true
---

# Kubernetes 완벽 가이드

> **CKA(Certified Kubernetes Administrator) 자격증 대비 완벽 가이드**
> 기초부터 실전까지, 바텀업 방식으로 자연스럽게 학습한다.

---

## 학습 로드맵

이 가이드는 **7개의 Phase**로 구성되어 있으며, 각 Phase는 여러 Part로 나뉜다.
순서대로 학습하면 Kubernetes의 모든 개념을 체계적으로 익힐 수 있다.

---

## Phase 1: 기초 - Kubernetes 이해하기

**목표**: Kubernetes가 무엇이고, 왜 필요한지 이해하기

### [Part 1: 컨테이너 오케스트레이션 개요](./2026-01-02-kubernetes-01-container-orchestration)
- 컨테이너 오케스트레이션이란?
- 단일 호스트의 한계
- Kubernetes 개요 및 역사
- Docker와의 관계


---

### [Part 2: Kubernetes 아키텍처](./2026-01-03-kubernetes-02-architecture)
- 클러스터 구조
- Control Plane 컴포넌트 (API Server, etcd, Scheduler, Controller Manager)
- Worker Node 컴포넌트 (Kubelet, Kube-proxy, Container Runtime)
- 애드온 (CoreDNS, Dashboard, Metrics Server, CNI)


---

### [Part 3: Kubernetes 핵심 개념](./2026-01-04-kubernetes-03-pod-label-namespace)
- Pod (최소 배포 단위)
- Pod 생명주기 및 Multi-container Pod
- Label과 Selector
- Namespace

**실습**: Pod 생성 및 관리

---

## Phase 2: 기본 리소스 관리

**목표**: Kubernetes의 핵심 리소스를 이해하고 실습한다

### [Part 4: Workload 리소스](./2026-01-05-kubernetes-04-deployment-statefulset)
- ReplicaSet
- Deployment (롤링 업데이트, Rollback)
- StatefulSet
- DaemonSet
- Job과 CronJob

**실습**: Deployment를 이용한 애플리케이션 배포

---

### [Part 5: 설정 및 데이터 관리](./2026-01-06-kubernetes-05-configmap-secret)
- ConfigMap (설정 관리)
- Secret (민감 정보 관리)
- Volume으로 마운트
- 환경 변수로 주입

**실습**: ConfigMap과 Secret을 이용한 설정 분리

---

### [Part 6: 스토리지](./2026-01-07-kubernetes-06-volume-pv-pvc)
- Volume 종류 (emptyDir, hostPath, configMap/secret)
- PersistentVolume (PV)
- PersistentVolumeClaim (PVC)
- Storage Class 및 Dynamic Provisioning

**실습**: PV/PVC를 이용한 데이터 영속화

---

## Phase 3: 네트워킹

**목표**: Kubernetes 네트워킹의 모든 것을 마스터한다

### [Part 7: 네트워킹 기초](./2026-01-08-kubernetes-07-service-endpoint)
- Service (ClusterIP, NodePort, LoadBalancer, ExternalName)
- Endpoints
- Headless Service
- Session Affinity

**실습**: Service를 이용한 Pod 노출

---

### [Part 8: 고급 네트워킹](./2026-01-09-kubernetes-08-ingress-networkpolicy)
- Ingress (경로/호스트 기반 라우팅, TLS/SSL)
- Gateway API (Ingress의 후속 표준)
- NetworkPolicy (Ingress/Egress 제어)
- CNI 플러그인 (Calico, Flannel, Cilium, Weave)

**실습**: Ingress를 이용한 L7 라우팅, NetworkPolicy 설정

---

## Phase 4: 보안

**목표**: Kubernetes 클러스터를 안전하게 운영한다

### [Part 9: 인증 및 인가](./2026-01-10-kubernetes-09-rbac-serviceaccount)
- TLS 기초 및 인증서 관리
- Kubernetes 인증서 구조
- Certificates API
- RBAC (Role, ClusterRole, RoleBinding, ClusterRoleBinding)
- ServiceAccount

**실습**: 사용자 인증서 발급 및 RBAC 설정

---

### [Part 10: Pod 보안](./2026-01-11-kubernetes-10-securitycontext)
- SecurityContext
- Pod Security Standards
- PodSecurityPolicy (deprecated)

**실습**: SecurityContext를 이용한 Pod 보안 강화

---

### [Part 11: Admission Control 및 정책](./2026-01-12-kubernetes-11-admission-webhook)
- Admission Controllers (Validating/Mutating)
- Dynamic Admission Control
- Webhook 설정
- OPA (Open Policy Agent) 및 Gatekeeper

**실습**: Gatekeeper를 이용한 정책 적용

---

## Phase 5: 고급 운영

**목표**: 프로덕션 환경에서 Kubernetes를 운영한다

### [Part 12: 스케줄링](./2026-01-13-kubernetes-12-taint-affinity)
- Manual Scheduling
- Labels and Selectors
- Taints and Tolerations
- Node Affinity
- Resource Requests and Limits
- DaemonSets
- Static Pods
- Priority Classes

**실습**: Node Affinity와 Taints를 이용한 Pod 배치 제어

---

### [Part 13: Auto-scaling](./2026-01-14-kubernetes-13-hpa-vpa)
- HPA (Horizontal Pod Autoscaler)
- VPA (Vertical Pod Autoscaler)
- Cluster Autoscaler
- In-Place Resize of Pods (2025 업데이트)

**실습**: HPA를 이용한 자동 스케일링

---

### [Part 14: 배포 자동화](./2026-01-15-kubernetes-14-helm-kustomize)
- 배포 전략 (Rolling Update, Blue-Green, Canary, A/B Testing)
- Helm (Chart 구조, 명령어, Chart 작성)
- Kustomize (Base와 Overlay, Patch 전략)

**실습**: Helm과 Kustomize를 이용한 배포 자동화

---

## Phase 6: 클러스터 운영

**목표**: Kubernetes 클러스터를 안정적으로 운영한다

### [Part 15: 모니터링 및 로깅](./2026-01-16-kubernetes-15-prometheus-grafana)
- Prometheus + Grafana
- ELK/EFK Stack
- Loki
- Metrics Server

**실습**: Prometheus를 이용한 모니터링 구축

---

### [Part 16: 클러스터 유지보수](./2026-01-17-kubernetes-16-drain-upgrade)
- OS Upgrades (Node Drain/Cordon)
- Cluster Upgrade (kubeadm)
- Backup and Restore
- etcd Backup 및 복원

**실습**: 클러스터 업그레이드 및 etcd 백업

---

### [Part 17: Troubleshooting](./2026-01-18-kubernetes-17-troubleshooting)
- Application Failure
- Control Plane Failure
- Worker Node Failure
- Network Troubleshooting
- JSON PATH 활용

**실습**: 다양한 장애 상황 해결

---

### [Part 18: CKA 베스트 프랙티스](./2026-01-19-kubernetes-18-cka-exam)
- CKA 시험 환경 이해
- Imperative vs Declarative 명령어
- kubectl 필수 명령어
- vim 효율적 사용
- 시간 관리 전략
- 운영 베스트 프랙티스

**실습**: Mock Exam 풀이

---

## Phase 7: 심화 (선택 학습)

**목표**: Kubernetes 내부 동작 원리를 깊이 이해한다

### [Part 19: 아키텍처 심화](./2026-01-20-kubernetes-19-internals)
- Control Loop Pattern
- etcd Raft 합의 알고리즘
- Scheduler Pod 배치 알고리즘
- kube-proxy와 Service 메커니즘
- CNI 플러그인 패킷 흐름
- CSI와 Dynamic Provisioning


---

### [Part 20: 확장성](./2026-01-21-kubernetes-20-crd-operator)
- Custom Resource Definition (CRD)
- Custom Controllers
- Operator 패턴
- Operator Framework

**실습**: 간단한 Operator 구현

---

## 학습 가이드

### 추천 학습 순서

1. **초보자 (Kubernetes를 처음 접하는 경우)**
   - Phase 1-3을 순서대로 학습한다 (약 2-3주)
   - 각 Part마다 실습이 필수다
   - Part 4-6에서 리소스 관리를 실습한다 (약 1-2주)

2. **중급자 (Docker 경험이 있는 경우)**
   - Phase 1은 빠르게 훑고, Phase 2-4에 집중한다 (약 2-3주)
   - 네트워킹과 보안에 특히 집중한다
   - Phase 5-6에서 실전 운영 경험을 쌓는다 (약 2-3주)

3. **CKA 시험 준비**
   - 전체 Phase 1-6을 완주한다 (약 6-8주)
   - Part 18 (CKA 베스트 프랙티스)를 반복 학습한다
   - Mock Exam을 최소 3회 이상 푼다
   - Troubleshooting 섹션을 집중 연습한다

4. **실무자 (특정 주제 심화)**
   - 필요한 Part만 선택적으로 학습한다
   - Phase 7 (심화)로 내부 동작 원리를 이해한다

---

## 학습 목표 달성 기준

### Phase 1-3 완료 시
- [ ] Pod를 직접 생성하고 관리할 수 있다
- [ ] Deployment를 이용해 애플리케이션을 배포할 수 있다
- [ ] Service를 이용해 Pod를 노출할 수 있다
- [ ] Namespace를 이용해 리소스를 격리할 수 있다

### Phase 4-5 완료 시
- [ ] ConfigMap/Secret으로 설정을 관리할 수 있다
- [ ] PV/PVC를 이용해 데이터를 영속화할 수 있다
- [ ] Ingress를 이용해 L7 라우팅을 구성할 수 있다
- [ ] NetworkPolicy로 네트워크를 제어할 수 있다
- [ ] RBAC으로 권한을 관리할 수 있다

### Phase 6 완료 시
- [ ] HPA를 이용해 자동 스케일링을 구성할 수 있다
- [ ] Helm/Kustomize로 배포를 자동화할 수 있다
- [ ] 클러스터를 업그레이드할 수 있다
- [ ] etcd를 백업하고 복원할 수 있다
- [ ] 다양한 장애 상황을 해결할 수 있다

### CKA 시험 준비 완료 시
- [ ] kubectl 명령어를 빠르게 사용할 수 있다
- [ ] YAML 파일을 빠르게 작성할 수 있다
- [ ] JSON PATH를 활용할 수 있다
- [ ] 시간 내에 문제를 해결할 수 있다

---

## 학습 팁

1. **반드시 실습한다**: 이론만 읽지 말고, 직접 클러스터에서 실습한다.
   - minikube, kind, k3s 등으로 로컬 클러스터를 구성한다
   - 각 명령어를 직접 타이핑하면서 익힌다

2. **공식 문서 활용**: kubernetes.io 문서를 항상 참고한다.
   - CKA 시험에서는 공식 문서만 참고 가능하다
   - 문서 검색 연습이 중요하다

3. **반복 학습**: 어려운 개념은 여러 번 반복한다.
   - 특히 네트워킹, RBAC, Troubleshooting

4. **커뮤니티 활용**: 막히는 부분은 질문한다.
   - Kubernetes Slack
   - Stack Overflow
   - GitHub Issues

5. **실전 프로젝트**: 간단한 애플리케이션을 Kubernetes에 배포한다.
   - 3-tier 애플리케이션 (Frontend, Backend, Database)
   - CI/CD 파이프라인 구축

---

## 참고 자료

- [Kubernetes 공식 문서](https://kubernetes.io/docs)
- [CKA 시험 정보](https://www.cncf.io/certification/cka/)
- [Kubernetes the Hard Way](https://github.com/kelseyhightower/kubernetes-the-hard-way)
- [KodeKloud CKA 강의](https://kodekloud.com/courses/certified-kubernetes-administrator-cka/)

---

## 시작하기

[Part 1: 컨테이너 오케스트레이션 개요](./2026-01-02-kubernetes-01-container-orchestration)부터 시작한다.
