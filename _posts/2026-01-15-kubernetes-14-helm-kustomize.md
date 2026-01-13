---
title: "Part 14: Helm과 Kustomize - 배포 자동화"
date: 2026-01-15
categories: [Container, Kubernetes]
tags: [Container, Kubernetes, Helm, Kustomize, Deployment]
layout: post
toc: true
math: true
mermaid: true
---

# Part 14: 배포 자동화

## 배포 전략

**Rolling Update**:
- 점진적 교체
- 무중단 배포

**Blue-Green**:
- 두 환경 유지
- 즉시 전환

**Canary**:
- 일부 트래픽만 신버전
- 점진적 확대

**A/B Testing**:
- 사용자 그룹별 다른 버전

## Helm

**Helm = Kubernetes 패키지 매니저**

```bash
# 차트 저장소 추가
helm repo add nginx-stable https://helm.nginx.com/stable
helm repo update

# 차트 설치
helm install my-nginx nginx-stable/nginx-ingress

# 업그레이드
helm upgrade my-nginx nginx-stable/nginx-ingress --set replicas=3

# 롤백
helm rollback my-nginx 1

# 제거
helm uninstall my-nginx
```

**Chart 구조:**

```
myapp-chart/
├── Chart.yaml
├── values.yaml
├── templates/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── _helpers.tpl
└── charts/
```

## Kustomize

**Kustomize = YAML 커스터마이징 도구**

```bash
# 적용
kubectl apply -k overlays/production

# 확인
kubectl kustomize overlays/production
```

**구조:**

```
base/
├── kustomization.yaml
├── deployment.yaml
└── service.yaml

overlays/
├── dev/
│   └── kustomization.yaml
└── prod/
    └── kustomization.yaml
```

---

## 학습 정리

### 핵심 개념

1. **배포 전략**: Rolling, Blue-Green, Canary, A/B
2. **Helm**으로 패키지 관리
3. **Kustomize**로 환경별 커스터마이징

### 다음 단계

- 배포 자동화 이해
- 모니터링 학습 → **[Part 15로 이동](https://k-diger.github.io/posts//posts/kubernetes-16-prometheus-grafana)**

---
