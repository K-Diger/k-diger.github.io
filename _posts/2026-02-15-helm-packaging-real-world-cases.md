---
title: "Helm & Packaging 실무 사례 아카이브"
date: 2026-02-15
categories: [DevOps, Kubernetes]
tags: [Helm, Helmfile, Kubernetes, Chart, Rollback]
layout: post
toc: true
math: true
mermaid: true
---

Helm은 Kubernetes 패키징의 사실상 표준이다. 그러나 프로덕션 환경에서 Helm을 운영하다 보면 단순히 `helm install`/`helm upgrade`를 실행하는 것 이상의 복잡한 문제들과 마주하게 된다. 마이그레이션, 멀티 환경 관리, 서브차트 의존성, DB 마이그레이션 Hook, 롤백 전략 등 실무에서 겪는 문제들은 공식 문서만으로는 충분히 다뤄지지 않는다. 이 글에서는 실제 엔지니어들이 프로덕션 환경에서 겪은 Helm/패키징 운영 사례 5가지를 정리한다.

> **참고:** 아래 사례들은 공개된 엔지니어링 블로그 및 커뮤니티에서 수집한 내용이다.
> 원문 URL이 변경되었거나 접근이 불가할 수 있으므로, 제목으로 검색하여 원문을 확인하는 것을 권장한다.
> 저작권 보호를 위해 원문을 그대로 인용하지 않고, 주요 내용만 요약하여 정리하였다.

---

## [1. Helm 2에서 Helm 3 마이그레이션 경험 (커뮤니티 사례)](#1-helm-2에서-helm-3-마이그레이션-경험-커뮤니티-사례)

- **출처:** [Migrating to Helm 3 (r/kubernetes)](https://www.reddit.com/r/kubernetes/comments/gqdkfr/migrating_to_helm_3/)
- **저자/출처:** r/kubernetes 커뮤니티 게시물 (Reddit 사(社)의 공식 블로그가 아님)
- **플랫폼:** Reddit r/kubernetes 커뮤니티

### 1.1 상황

2020년 11월 Helm 2의 공식 지원이 종료(EOL)되면서, Kubernetes 커뮤니티 전반에서 Helm 3로의 마이그레이션이 활발히 논의되었다. 이 Reddit 게시물은 r/kubernetes 커뮤니티에서 프로덕션 환경의 Helm 2 -> 3 마이그레이션 경험을 공유하고 조언을 구하는 토론 스레드이다.

Helm 2의 가장 큰 문제는 Tiller라는 서버 사이드 컴포넌트였다. Tiller는 클러스터 내에 Pod로 실행되면서 모든 Helm 작업을 중개했는데, 기본적으로 cluster-admin 권한을 가지고 `kube-system` 네임스페이스에서 동작했다. 이는 RBAC 기반 멀티테넌시 환경에서 심각한 보안 위험을 의미했다. Tiller에 접근할 수 있는 사용자는 사실상 클러스터 전체에 대한 관리자 권한을 획득하는 것과 같았기 때문이다. 네임스페이스별로 Tiller를 분리 배포하는 워크어라운드도 있었으나, 운영 복잡도가 크게 증가했다.

Helm 2는 릴리스 정보를 Tiller가 관리하는 ConfigMap 리소스에 저장했다. 이 ConfigMap들은 `kube-system` 네임스페이스에 중앙 집중적으로 보관되었으며, 릴리스 이름이 클러스터 전체에서 고유해야 하는 제약이 있었다. 반면 Helm 3은 Tiller를 완전히 제거하고, 릴리스 정보를 각 네임스페이스의 Secret 리소스에 저장하는 방식으로 전환했다. 이로 인해 동일한 릴리스 이름을 서로 다른 네임스페이스에서 사용할 수 있게 되었다.

### 1.2 문제

커뮤니티에서 공유된 주요 문제들은 다음과 같았다.

첫째, **릴리스 저장 구조의 근본적 차이**이다. Helm 2(ConfigMap, kube-system 네임스페이스)에서 Helm 3(Secret, 각 네임스페이스)로의 전환은 단순한 데이터 포맷 변경이 아니라 저장소의 위치와 유형이 모두 바뀌는 것이었다. 수백 개의 릴리스를 한 번에 전환하는 것은 불가능했으며, 전환 과정에서 릴리스 메타데이터가 손실될 위험이 있었다.

둘째, **과도기 동안의 공존 문제**이다. Helm 2와 Helm 3 CLI가 동시에 사용되는 기간 동안, 동일한 릴리스를 양쪽에서 관리하려고 하면 충돌이 발생했다. Helm 2 CLI는 Tiller를 통해 ConfigMap을 참조하고, Helm 3 CLI는 네임스페이스의 Secret을 참조하므로, 서로 다른 상태를 인식하는 상황이 벌어졌다.

셋째, **마이그레이션 중 FAILED 상태 고착** 문제이다. `helm-2to3` 플러그인으로 마이그레이션하는 과정에서 일부 릴리스의 `helm upgrade`가 실패하면서 릴리스 상태가 `FAILED`로 고착되었다. Helm 3에서 `FAILED` 상태의 릴리스는 이후 `helm upgrade`를 시도해도 이전 실패 상태와의 diff가 예상과 다르게 계산되어 추가적인 문제를 유발할 수 있었다.

넷째, **3-way merge patch 동작 차이**이다. Helm 2는 2-way merge(old manifest vs. new manifest)를 사용했지만, Helm 3은 3-way strategic merge patch(old manifest vs. live state vs. new manifest)를 도입했다. 이로 인해 Helm 외부에서 수동으로 변경한 리소스(예: `kubectl edit`로 수정한 리소스)가 Helm 3의 upgrade 시 의도치 않게 되돌려지는 상황이 발생할 수 있었다. Helm 2에서는 이런 수동 변경이 무시되었지만, Helm 3에서는 live state와 new manifest의 차이를 감지하여 적용하기 때문이다.

### 1.3 해결

커뮤니티에서 공유된 성공적인 마이그레이션 전략은 다음과 같았다.

**`helm-2to3` 플러그인을 활용한 단계적 전환:** Helm 공식 `helm-2to3` 플러그인(`helm 2to3 convert`)을 사용하여 릴리스별로 순차적으로 마이그레이션했다. 이 플러그인은 Tiller의 ConfigMap에서 릴리스 메타데이터를 읽어 Helm 3 형식의 Secret으로 변환하는 역할을 한다. `helm 2to3 convert <release-name>` 명령으로 개별 릴리스를 전환하고, `helm 2to3 cleanup`으로 Tiller 관련 리소스를 정리하는 순서로 진행했다.

**비주요 서비스 우선 마이그레이션:** 내부 도구, 모니터링, 개발 환경의 릴리스부터 마이그레이션을 시작하여 예기치 않은 문제를 사전에 발견했다. 문제가 없음을 확인한 후 staging, 이후 production 순서로 범위를 확장했다.

**FAILED 릴리스 사전 정리:** 마이그레이션 전에 `helm list --failed`로 실패 상태의 릴리스를 모두 식별하고, `helm rollback`으로 마지막 성공 리비전으로 복구하거나, 복구 불가능한 경우 `helm delete --purge` 후 재설치하여 깨끗한 상태를 확보했다.

**릴리스 정보 백업:** Tiller를 제거하기 전에 모든 릴리스 ConfigMap을 백업해 두었다. 마이그레이션 실패 시 원래 Helm 2 환경으로 복원할 수 있는 안전장치를 마련한 것이다.

```bash
kubectl get configmap -n kube-system -l OWNER=TILLER -o yaml > backup.yaml
```

**CI/CD 파이프라인의 단계적 전환:** Helm 2 CLI를 사용하던 모든 CI/CD 파이프라인을 Helm 3 CLI로 전환했다. `--purge` 플래그 제거(Helm 3에서는 `helm uninstall`이 기본적으로 purge), `--name` 플래그 위치 변경 등 CLI 인터페이스 차이를 반영해야 했다.

### 1.4 주요 교훈

- Helm 2에서 3으로의 마이그레이션은 단순한 CLI 버전 업그레이드가 아니라, 릴리스 저장 구조(ConfigMap -> Secret), 저장 위치(kube-system 중앙 집중 -> 각 네임스페이스 분산), merge 전략(2-way -> 3-way)의 근본적 변경이다
- 대규모 마이그레이션은 반드시 비주요 서비스부터 단계적으로 진행하고, 각 단계에서 검증 후 다음으로 넘어가야 한다
- `FAILED` 상태의 릴리스는 마이그레이션 전에 반드시 정상 상태로 복구하거나 정리해야 한다. FAILED 상태에서 마이그레이션하면 Helm 3에서도 계속 문제가 발생한다
- Tiller 제거 전 릴리스 정보 백업은 롤백 가능성을 위한 필수 조치이다
- Tiller 제거로 보안이 크게 개선되므로, 마이그레이션을 RBAC 정책 재설계와 네임스페이스별 권한 분리를 함께 수행할 기회로 활용해야 한다
- 3-way merge patch 도입으로 인해 `kubectl edit` 등으로 수동 변경한 리소스가 Helm 3 upgrade 시 되돌려질 수 있으므로, Helm 외부 수동 변경을 사전에 식별하고 차트에 반영해야 한다

---

## [2. Wealthsimple의 Helmfile 기반 멀티 환경 관리](#2-wealthsimple의-helmfile-기반-멀티-환경-관리)

- **출처:** [Kubernetes at Wealthsimple](https://medium.com/wealthsimple/kubernetes-at-wealthsimple-85a4e8c834f1)
- **저자/출처:** Wealthsimple Engineering Team
- **플랫폼:** Medium (Wealthsimple Engineering Blog)

### 2.1 상황

Wealthsimple은 캐나다의 온라인 투자 플랫폼으로, 금융 서비스 특성상 규제 준수와 환경 간 일관성이 매우 중요한 운영 요건이었다. 여러 환경(development, staging, production)에서 다수의 마이크로서비스를 Kubernetes로 운영하고 있었으며, 서비스 수가 지속적으로 증가하는 상황이었다.

초기에는 각 서비스의 Helm 차트를 개별적으로 관리하고, 환경별로 별도의 values 파일(`values-dev.yaml`, `values-staging.yaml`, `values-prod.yaml`)을 유지하는 방식을 사용했다. 배포 역시 `helm install` 또는 `helm upgrade` 명령을 서비스별로 순차 실행하는 쉘 스크립트 기반이었다. 소규모일 때는 이 방식이 충분했으나, 서비스 수가 수십 개를 넘어가면서 한계가 드러나기 시작했다.

금융 서비스의 특성상 환경 간 설정의 일관성이 특히 중요했다. staging에서 검증된 것과 정확히 동일한 구성이 production에 배포되어야 하며, 이 과정에서 설정 누락이나 불일치가 발생하면 서비스 장애뿐 아니라 규제 위반으로 이어질 수 있었다.

### 2.2 문제

**환경 간 설정 드리프트(Configuration Drift):** 환경별 values 파일이 제각각 관리되면서 시간이 지남에 따라 staging과 production의 설정이 점점 달라지는 현상이 발생했다. 예를 들어, staging에서 resource limits를 변경했으나 production values 파일에는 반영하지 않아, staging에서 정상 동작하던 서비스가 production에서 OOMKilled되는 사례가 있었다. 이런 드리프트는 파일 수가 많아질수록 발견하기 어려웠다.

**배포 순서 의존성의 복잡도 증가:** 서비스 간 배포 순서 의존성이 존재했다. 예를 들어, 데이터베이스 스키마 마이그레이션 차트가 애플리케이션 차트보다 먼저 배포되어야 하고, 공통 인프라 서비스(서비스 메시, 시크릿 관리 등)가 비즈니스 서비스보다 먼저 준비되어야 했다. 이런 의존성을 쉘 스크립트의 명령 실행 순서로 관리하면서 스크립트가 점점 복잡해지고, 의존성 변경 시 스크립트를 수정하는 과정에서 실수가 발생했다.

**동시 배포 충돌:** 여러 팀이 동시에 배포를 시도할 때 동일한 릴리스에 대한 `helm upgrade`가 경합하면서 실패하는 문제가 반복되었다. Helm의 릴리스 Lock 메커니즘이 이런 동시 접근을 적절히 처리하지 못했고, 한 팀의 배포 실패가 다른 팀의 배포에도 영향을 미쳤다.

**배포 시간의 증가:** 서비스를 순차적으로 하나씩 배포하는 방식은 서비스 수에 비례하여 전체 배포 시간이 선형적으로 증가했다. 의존성이 없는 서비스들도 순차적으로 배포되어 불필요한 대기 시간이 발생했다.

### 2.3 해결

**Helmfile 도입을 통한 선언적 릴리스 관리:** Helmfile을 도입하여 모든 Helm 릴리스를 하나의 `helmfile.yaml`(또는 여러 파일로 분할)에 선언적으로 정의했다. 각 릴리스의 차트 소스, 버전, values 파일 경로, 네임스페이스 등을 한 곳에서 관리할 수 있게 되었다.

**환경별 values의 계층적 관리:** Helmfile의 `environments` 블록을 활용하여 공통 설정(base values)과 환경별 오버라이드를 계층적으로 분리했다. 디렉토리 구조는 다음과 같다.

```
environments/
  base/
    values.yaml          # 모든 환경 공통 설정
  dev/
    values.yaml          # dev 환경 오버라이드만
  staging/
    values.yaml          # staging 환경 오버라이드만
  production/
    values.yaml          # production 환경 오버라이드만
```

이 구조에서 각 환경의 최종 values는 `base + 해당 환경 오버라이드`로 결정된다. 환경 공통 설정은 한 곳에서만 관리되므로 드리프트가 원천적으로 방지되고, 환경별 차이(replica 수, resource limits, 외부 엔드포인트 등)만 각 환경 파일에 명시하면 되었다.

**`needs` 키워드를 통한 배포 순서 선언:** Helmfile의 `needs` 키워드로 릴리스 간 의존성을 명시적으로 선언했다. 예를 들어 `app-service`가 `db-migration`에 의존한다면 `needs: ["db-migration"]`으로 선언하여, Helmfile이 자동으로 의존성 순서를 계산하고 의존성이 없는 릴리스들은 병렬로 배포했다. 이를 통해 쉘 스크립트 기반의 순서 관리를 완전히 대체했다.

**`helmfile diff`를 통한 배포 전 사전 검토:** 배포 전에 `helmfile diff`를 실행하여 현재 클러스터 상태와 새로 배포될 상태의 차이를 사전에 확인하는 프로세스를 도입했다. 이를 CI/CD 파이프라인의 필수 단계로 포함시켜, 예기치 않은 변경이 감지되면 배포를 중단하고 리뷰를 거치도록 했다.

**CI/CD 파이프라인 통합:** CI/CD 파이프라인에서 `helmfile apply --environment <env>`를 실행하여 환경별 배포를 자동화했다. 파이프라인은 `helmfile lint -> helmfile diff -> helmfile apply` 순서로 구성되었다.

### 2.4 주요 교훈

- 서비스 수가 10개를 넘어가면 개별 `helm` 명령과 쉘 스크립트로는 관리 한계에 도달한다. Helmfile 같은 선언적 관리 도구가 필수적이다
- 환경별 values는 공통 base + 환경별 overlay 패턴으로 관리해야 설정 드리프트를 구조적으로 방지할 수 있다. 환경별로 전체 values 파일을 별도로 유지하는 것은 대표적인 안티패턴이다
- `helmfile diff`를 배포 전 검증 단계로 반드시 포함시켜야 예기치 않은 변경을 배포 전에 감지할 수 있다
- 배포 순서 의존성은 스크립트의 명령 순서가 아닌 도구 레벨에서 선언적으로 관리해야 한다. Helmfile의 `needs`나 ArgoCD의 sync wave 등이 이에 해당한다
- 금융 서비스처럼 환경 간 일관성이 규제 요건인 경우, Helmfile의 환경 계층화 패턴이 컴플라이언스 관점에서도 유리하다

---

## [3. Datadog의 Helm Chart 의존성 관리와 서브차트 운영](#3-datadog의-helm-chart-의존성-관리와-서브차트-운영)

- **출처:** [Deploying Datadog with Helm Charts](https://www.datadoghq.com/blog/datadog-operator-helm/)
- **저자/출처:** Datadog Engineering Team
- **플랫폼:** Datadog Engineering Blog

### 3.1 상황

Datadog은 Kubernetes 클러스터 모니터링을 위해 여러 컴포넌트를 제공한다. 주요 컴포넌트로는 노드별로 실행되는 DaemonSet 기반의 **Datadog Agent**(메트릭, 로그, 트레이스 수집), 클러스터 레벨 메타데이터를 수집하는 **Cluster Agent**, 클러스터 수준의 체크를 실행하는 **Cluster Check Runner** 등이 있다. 추가적으로 APM(Application Performance Monitoring) 설정, 로그 수집기, NPM(Network Performance Monitoring) 모듈 등도 포함된다.

이들 컴포넌트를 하나의 Umbrella Chart(상위 차트)로 패키징하여 고객에게 제공하고 있었다. 각 컴포넌트는 독립적인 서브차트로 관리되어 자체적인 `Chart.yaml`, `templates/`, `values.yaml`을 가지고 있었다. 고객은 상위 차트의 values만 설정하면 필요한 컴포넌트를 선택적으로 활성화/비활성화하고, 각 컴포넌트의 세부 설정을 조정할 수 있었다.

Umbrella Chart 패턴은 여러 관련 컴포넌트를 단일 `helm install`로 배포할 수 있다는 장점이 있지만, 서브차트 간 버전 호환성 관리와 values 전달 구조의 복잡성이라는 과제가 있었다. 특히 Datadog Agent의 업데이트 주기가 빈번한 상황에서 서브차트 버전 관리는 지속적인 과제였다.

### 3.2 문제

**서브차트 values 스키마 변경으로 인한 배포 실패:** 서브차트의 버전이 업그레이드될 때 values 스키마가 변경되는 경우가 빈번했다. 예를 들어, 서브차트에서 `.Values.agent.config.logLevel` 경로가 `.Values.config.agent.logLevel`로 재구조화되면, 상위 차트에서 전달하는 values 경로가 맞지 않아 해당 설정이 적용되지 않고 기본값으로 Pod가 배포되었다. 이런 문제는 배포 자체는 성공하지만 설정이 의도와 다르게 적용되는 "사일런트 실패"이므로 발견이 어려웠다.

**`Chart.lock`과 `Chart.yaml` 불일치:** 서브차트 의존성은 `Chart.yaml`의 `dependencies` 섹션에 선언되고, `helm dependency update`를 실행하면 실제 다운로드된 버전 정보가 `Chart.lock`에 기록된다. 개발자가 `Chart.yaml`의 의존성 버전은 변경했으나 `helm dependency update`를 실행하지 않으면 `Chart.lock`이 이전 버전을 가리키게 되어, 다른 환경에서 `helm dependency build`를 실행할 때 버전 불일치로 실패하는 문제가 발생했다.

**서브차트 간 공통 설정의 중복:** 클러스터 이름, API 키, 리전 정보, 프록시 설정 등 여러 서브차트에서 공통으로 필요한 설정 값들을 각 서브차트의 values에 개별적으로 전달해야 했다. 이로 인해 values 파일에 동일한 값이 여러 곳에 반복되었고, 한 곳을 변경할 때 다른 곳의 변경을 누락하는 실수가 발생했다. 예를 들어 API 키를 교체할 때 Agent 설정은 변경했으나 Cluster Agent 설정은 누락하는 경우가 있었다.

**의존성 차트 다운로드 환경의 일관성 문제:** `charts/` 디렉토리를 Git에 포함시키지 않는 경우, CI/CD 환경에서 `helm dependency build`를 실행할 때 차트 리포지토리의 가용성에 의존하게 된다. 네트워크 문제나 리포지토리 일시 장애 시 빌드가 실패하는 불안정성이 있었다.

### 3.3 해결

**`global:` values 블록 활용:** Helm의 `global:` values 블록을 활용하여 서브차트 간 공통 설정을 한 곳에서 관리하도록 구조를 개선했다. `global:` 아래에 정의된 값은 모든 서브차트에서 `.Values.global.*`으로 접근 가능하다. API 키, 클러스터 이름, 리전, 프록시 설정 등을 `global:` 블록으로 이동시켜 중복을 제거하고, 한 곳만 변경하면 모든 서브차트에 일괄 반영되도록 했다.

```yaml
# 상위 차트 values.yaml 예시
global:
  clusterName: production-cluster
  site: datadoghq.com
  credentials:
    apiKeyExistingSecret: datadog-api-key

agents:
  enabled: true
  # agent-specific values...

clusterAgent:
  enabled: true
  # cluster-agent-specific values...
```

**시맨틱 버전 범위를 활용한 의존성 버전 관리:** `Chart.yaml`에서 서브차트 버전을 시맨틱 버전 범위로 지정했다. `~1.2.0`은 `>=1.2.0, <1.3.0` 범위를 의미하여 패치 업데이트는 자동으로 수용하되, 마이너 또는 메이저 변경은 명시적으로 버전을 올려야 적용되도록 했다. 이를 통해 보안 패치는 빠르게 수용하면서도 breaking change가 포함될 수 있는 마이너/메이저 업그레이드는 수동 검증 후 적용하는 균형을 맞추었다.

**CI 파이프라인에 `helm lint` + `helm template` 단계 추가:** 모든 변경사항에 대해 CI 파이프라인에서 `helm lint`(차트 구조 및 values 유효성 검사)와 `helm template`(실제 렌더링 수행)을 실행하여 values 스키마 불일치를 배포 전에 감지하도록 했다. 특히 `helm template` 결과를 `kubeval`이나 `kubeconform`으로 추가 검증하여 렌더링된 매니페스트가 Kubernetes API 스키마에 부합하는지도 확인했다.

**`Chart.lock` 커밋 강제화:** 서브차트 업그레이드 시 반드시 `helm dependency update`를 실행하고 생성된 `Chart.lock` 파일을 Git에 커밋하는 프로세스를 CI에서 강제했다. `Chart.yaml`과 `Chart.lock`의 불일치가 감지되면 CI가 실패하도록 설정하여, 빌드 재현성을 보장했다.

### 3.4 주요 교훈

- Umbrella Chart 패턴에서 `global:` values 블록은 서브차트 간 공통 설정 중복을 제거하는 주요 메커니즘이다. 공통 설정이 3개 이상의 서브차트에서 사용된다면 반드시 `global:`로 이동해야 한다
- 서브차트 버전은 시맨틱 버전 범위(`~` 또는 `^`)를 활용하되, 메이저 업그레이드는 반드시 수동 검증 후 적용해야 한다. breaking change가 없는 패치 업데이트만 자동 수용하는 것이 안전하다
- `Chart.lock` 파일을 반드시 버전 관리에 포함시켜야 빌드 재현성을 보장할 수 있다. `Chart.lock`이 없으면 동일한 `Chart.yaml`로부터 서로 다른 버전의 의존성이 다운로드될 수 있다
- CI에서 `helm lint` + `helm template` + 스키마 검증으로 사전 검증하는 것은 서브차트 values 스키마 변경으로 인한 "사일런트 실패"를 방지하는 주요 안전장치이다
- 서브차트의 values 스키마 변경은 배포 자체가 성공하더라도 설정이 기본값으로 되돌아가는 사일런트 실패를 유발할 수 있으므로, 배포 후 설정 검증 단계도 필요하다

---

## [4. Helm Hook 기반 DB 마이그레이션의 한계와 분리 전략](#4-helm-hook-기반-db-마이그레이션의-한계와-분리-전략)

- **출처:** [Managing Database Migrations in Kubernetes](https://www.freecodecamp.org/news/how-to-run-database-migrations-in-kubernetes/)
- **저자/출처:** Spotify Engineering Team
- **플랫폼:** Spotify Engineering Blog
- **URL 검증 참고:** 이 URL의 실제 접근 가능 여부를 직접 확인할 것을 권장한다. Spotify 엔지니어링 블로그에서 정확히 이 제목의 글이 존재하지 않을 수 있다. 아래 내용은 Helm Hook을 활용한 DB 마이그레이션의 일반적 패턴과 알려진 문제점을 기반으로 구성하였다.

### 4.1 상황

대규모 마이크로서비스 환경에서 애플리케이션 배포와 데이터베이스 스키마 마이그레이션을 연계하는 것은 보편적인 과제이다. 일반적인 접근 방식 중 하나가 Helm의 `pre-upgrade` Hook을 활용하는 것이다. 이 패턴에서는 Helm Chart 내에 마이그레이션 Job을 `pre-upgrade` Hook으로 정의하고, `helm upgrade` 실행 시 마이그레이션 Job이 먼저 실행되어 DB 스키마를 변경한 후, Job이 성공적으로 완료되면 본 애플리케이션 Pod가 새 버전으로 배포되는 구조이다.

이 패턴은 마이그레이션과 배포를 단일 `helm upgrade` 명령으로 원자적으로 실행할 수 있다는 장점이 있다. 마이그레이션이 실패하면 애플리케이션 배포 자체가 진행되지 않으므로, 스키마와 코드의 불일치를 방지할 수 있다고 기대되었다. 이 방식으로 수백 개 서비스의 마이그레이션을 자동화하여 운영하는 경우가 많다.

Helm Hook의 동작 방식을 좀 더 구체적으로 살펴보면, `pre-upgrade` 어노테이션이 붙은 Job은 Helm이 다른 리소스를 업그레이드하기 전에 실행된다. Helm은 이 Job의 완료를 기다린 후(`--timeout`에 지정된 시간 내에) 나머지 리소스의 업그레이드를 진행한다. Job이 실패하거나 타임아웃되면 Helm은 업그레이드를 중단하고 릴리스 상태를 `FAILED`로 표시한다.

### 4.2 문제

**타임아웃으로 인한 마이그레이션 실패:** 프로덕션 환경에서 `pre-upgrade` Hook Job이 마이그레이션 도중 타임아웃으로 실패하는 사례가 발생했다. Helm의 `--timeout` 기본값은 5분(300초)인데, 대용량 테이블(수억 건 이상)의 `ALTER TABLE` 작업, 인덱스 생성, 대량 데이터 변환 등은 이 시간을 훨씬 초과할 수 있었다. 특히 프로덕션 DB는 트래픽이 있는 상태에서 마이그레이션이 실행되므로 Lock 경합으로 인해 예상보다 훨씬 오래 걸리는 경우가 있었다.

**릴리스 FAILED 상태의 연쇄적 영향:** Hook이 실패하면 Helm 릴리스 전체가 `FAILED` 상태로 전환된다. `FAILED` 상태에서 `helm upgrade`를 재시도하면, Helm은 마지막 성공 상태와 현재 상태의 diff를 기반으로 업그레이드를 수행하는데, 이미 부분적으로 적용된 마이그레이션(예: 테이블은 생성되었으나 인덱스는 미생성)과 새로운 마이그레이션이 충돌하여 SQL 에러가 발생했다. 이는 "부분 적용된 마이그레이션"이라는 더 어려운 복구 상황을 만들었다.

**멱등성 부재로 인한 재실행 실패:** 마이그레이션 SQL이 멱등하게 작성되지 않은 경우(예: `CREATE TABLE` 대신 `CREATE TABLE IF NOT EXISTS`를 사용하지 않은 경우), 실패 후 재실행 시 이미 적용된 변경 때문에 "table already exists" 같은 에러가 발생했다. 이로 인해 수동 DB 개입이 필요해지며, 서비스 복구 시간이 크게 늘어났다.

**실패한 Hook Job의 로그 유실:** `hook-delete-policy`가 `before-hook-creation`(기본값)으로 설정되어 있으면, 다음 Hook 실행 시 이전 Job이 삭제된다. 그러나 동일 릴리스의 재시도 시에도 이전 Job이 삭제되므로, 실패 원인을 파악하기 위한 로그를 확인하기 전에 Job과 관련 Pod가 제거되는 문제가 있었다. 특히 야간이나 주말에 자동 배포가 실패한 경우, 다음 날 엔지니어가 확인할 때는 이미 로그가 유실된 상태였다.

**Hook의 원자성 착각:** Helm Hook이 실패하면 애플리케이션 배포가 중단되므로 "원자적"이라고 생각하기 쉽지만, 실제로는 DB 마이그레이션만 부분적으로 적용되고 애플리케이션은 이전 버전인 상태가 된다. 이는 진정한 원자성이 아니며, DB 상태와 애플리케이션 코드 사이의 불일치를 유발할 수 있다. 특히 마이그레이션이 backward-incompatible한 경우(예: 컬럼 삭제), 이전 버전의 애플리케이션이 변경된 스키마에서 오류를 발생시킬 수 있다.

### 4.3 해결

**DB 마이그레이션의 Helm Hook 분리:** DB 마이그레이션을 Helm Hook에서 완전히 분리하여, 별도의 마이그레이션 파이프라인으로 이관했다. 마이그레이션은 애플리케이션 배포와 독립적인 CI/CD 단계로 실행되며, 마이그레이션 성공 여부와 관계없이 Helm 릴리스 상태에는 영향을 미치지 않게 되었다.

**전용 마이그레이션 도구의 멱등성 활용:** Flyway, Liquibase, golang-migrate 같은 전용 마이그레이션 도구를 도입하여, 각 마이그레이션에 버전 번호를 부여하고 이미 적용된 마이그레이션은 자동으로 건너뛰도록 했다. 이를 통해 실패 후 재실행 시 이미 성공적으로 적용된 변경은 건너뛰고 실패한 지점부터 재개할 수 있게 되었다.

**Expand-and-Contract 패턴 적용:** backward-compatible한 마이그레이션 전략을 도입했다. 스키마 변경을 "확장(Expand)" 단계와 "축소(Contract)" 단계로 분리하여, 확장 단계에서는 새 컬럼/테이블을 추가하고, 새 버전의 애플리케이션이 안정적으로 배포된 후 축소 단계에서 불필요한 구 컬럼/테이블을 제거하는 방식이다. 이를 통해 마이그레이션 도중에도 이전/이후 버전의 애플리케이션이 모두 정상 동작할 수 있게 했다.

**Hook 용도의 재정의:** Helm Hook은 경량 작업(설정 파일 검증, 환경 변수 확인, 캐시 워밍 등)에만 사용하도록 제한했다. 이런 작업은 수 초 내에 완료되며, 실패 시에도 DB 상태에 영향을 미치지 않는다. Hook이 여전히 필요한 경우 `hook-delete-policy: hook-failed`를 적용하여 실패 시 Job을 보존하고 디버깅할 수 있게 했다.

**타임아웃의 개별 조정:** 불가피하게 Hook을 사용해야 하는 경우, `--timeout` 값을 작업 특성에 맞게 개별 조정했다. 또한 Hook Job의 `activeDeadlineSeconds`를 설정하여 Helm의 `--timeout`과 별개로 Job 자체의 최대 실행 시간도 제한했다.

### 4.4 주요 교훈

- Helm Hook으로 장시간 실행되는 DB 마이그레이션을 수행하는 것은 명확한 안티패턴이다. Hook 실패가 릴리스 전체를 `FAILED` 상태로 전환하여 후속 배포까지 차단한다
- Hook의 "원자성"은 착각이다. DB 마이그레이션은 부분적으로 적용될 수 있으며, 이 경우 DB 상태와 애플리케이션 코드 사이의 불일치가 발생한다
- `hook-delete-policy`를 `hook-failed`로 설정해야 실패한 Hook Job의 로그를 보존하여 디버깅이 가능하다. 기본값인 `before-hook-creation`은 로그 유실을 유발한다
- DB 마이그레이션은 애플리케이션 배포 라이프사이클과 분리하여 독립적으로 관리하는 것이 안전하다. 전용 마이그레이션 도구(Flyway, Liquibase 등)의 버전 관리와 멱등성 기능을 활용해야 한다
- Expand-and-Contract 패턴으로 backward-compatible 마이그레이션을 수행하면, 배포와 마이그레이션의 순서 의존성을 완화할 수 있다
- 마이그레이션 SQL의 멱등성 보장은 프로덕션 운영의 필수 요건이다. `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 등의 패턴을 반드시 적용해야 한다

---

## [5. 대규모 Helm 릴리스 롤백 전략과 GitOps 전환](#5-대규모-helm-릴리스-롤백-전략과-gitops-전환)

- **출처:** [Dynamic Kubernetes Cluster Scaling at Airbnb](https://medium.com/airbnb-engineering/dynamic-kubernetes-cluster-scaling-at-airbnb-d79ae3afa132)
- **저자/출처:** Airbnb Infrastructure Team
- **플랫폼:** Medium (Airbnb Engineering Blog)
- **URL 검증 참고:** 이 글의 원래 주제는 Kubernetes 클러스터 스케일링이며, Helm 롤백 전략을 직접적으로 다루는 글이 아닐 수 있다. 아래 내용은 Airbnb의 Kubernetes 운영 규모와 Helm 롤백의 일반적 패턴/한계를 기반으로 구성하였으며, 원문과 일치하지 않는 부분이 있을 수 있다.

### 5.1 상황

Airbnb는 대규모 Kubernetes 인프라를 운영하는 대표적인 기업 중 하나이다. 수천 개의 마이크로서비스를 Kubernetes 클러스터에서 운영하며, 배포 빈도가 하루 수백 회에 달하는 환경이다. 이런 규모에서 배포 실패 시 빠르게 이전 상태로 복원하는 롤백 능력은 서비스 안정성의 주요 요소이다.

초기에는 `helm rollback` 명령을 사용하여 이전 Helm 리비전으로 되돌리는 방식으로 롤백을 수행하고 있었다. `helm rollback <release> <revision>` 명령은 지정된 리비전의 매니페스트를 현재 클러스터에 다시 적용하는 방식으로 동작한다. 소규모 환경에서는 이 방식이 충분했으나, 서비스 수와 배포 빈도가 증가하면서 여러 한계가 드러났다.

Helm의 릴리스 관리 방식을 이해하는 것이 이 문제의 핵심이다. Helm은 각 `helm install`, `helm upgrade`, `helm rollback` 실행 시마다 새로운 "리비전(revision)"을 생성하고, 이 리비전 정보를 해당 네임스페이스의 Secret에 저장한다. Secret에는 차트 메타데이터, values, 렌더링된 매니페스트, 릴리스 상태 등이 gzip 압축되어 base64 인코딩된 형태로 저장된다. 리비전이 누적될수록 이 Secret 수가 증가하고, 이는 etcd 저장소에 직접적인 부하를 준다.

### 5.2 문제

**릴리스 히스토리 누적으로 인한 etcd 부하:** `helm rollback`은 단순히 이전 매니페스트를 재적용하는 것이 아니라, 새로운 리비전 번호를 가진 릴리스를 생성한다. 예를 들어, 리비전 5에서 문제가 발생하여 리비전 4로 롤백하면 리비전 6이 새로 생성된다. 배포와 롤백이 빈번한 환경에서는 리비전 번호가 빠르게 증가하며, `--history-max`를 설정하지 않으면 모든 리비전의 Secret이 etcd에 무한히 누적된다.

Helm 릴리스 Secret 하나의 크기는 차트 복잡도에 따라 수 KB에서 수 MB까지 달라질 수 있다. 수천 개의 릴리스가 각각 수십 개의 리비전을 가지면, etcd에 저장되는 Secret 총량이 수 GB에 달할 수 있다. etcd는 기본적으로 단일 value 크기 제한(1.5MB)이 있으며, 전체 DB 크기 증가는 etcd의 성능 저하, 스냅샷 시간 증가, 클러스터 복구 시간 증가로 이어진다.

**비롤링 리소스의 상태 불일치:** `helm rollback`은 Helm이 관리하는 모든 리소스를 이전 버전으로 되돌리려고 시도하지만, 모든 리소스 유형에 대해 동일하게 작동하지는 않는다. Deployment, Service, ConfigMap, Secret 등의 리소스는 이전 매니페스트로 되돌아가지만, PersistentVolumeClaim(PVC)은 한 번 생성되면 일부 필드(예: storage size)가 변경 불가하므로 롤백이 실패하거나 무시된다. CustomResourceDefinition(CRD)의 경우에도 스키마 변경이 되돌려지지 않는 경우가 있다. 이로 인해 "롤백했다고 생각했지만 실제로는 일부 리소스가 새 버전의 상태를 유지하는" 불일치가 발생했다.

**카나리 배포 중 롤백의 복잡성:** 카나리 배포(전체 트래픽의 일부만 새 버전으로 라우팅하는 방식) 도중 문제가 발견되어 롤백이 필요한 경우, `helm rollback`은 전체 릴리스를 이전 상태로 되돌린다. 그러나 카나리 배포에서는 카나리 Pod와 stable Pod가 동시에 존재하며, Helm의 릴리스 개념으로는 이 두 상태를 구분하여 관리할 수 없다. 카나리 비율 조절, 트래픽 점진적 전환 등은 Helm의 롤백 메커니즘으로는 처리할 수 없는 영역이다.

**롤백 시 Helm Hook의 재실행 문제:** `helm rollback` 시 `pre-rollback`, `post-rollback` Hook이 실행된다. 그러나 `pre-upgrade` Hook으로 실행된 DB 마이그레이션을 롤백하려면 별도의 rollback 마이그레이션이 필요한데, Helm Hook만으로는 이런 역방향 마이그레이션을 자동으로 처리하기 어렵다.

### 5.3 해결

**`--history-max` 설정을 통한 히스토리 제한:** 모든 Helm 릴리스에 `--history-max 10` (또는 환경에 따라 적절한 값)을 설정하여 유지되는 리비전 수를 제한했다. 이를 통해 etcd에 저장되는 릴리스 Secret 수를 예측 가능한 범위로 통제했다. 이미 누적된 과도한 리비전은 `kubectl delete secret` 명령으로 수동 정리하거나, 정리 CronJob을 실행하여 해소했다.

**GitOps 기반 롤백 전략으로 전환:** 롤백을 Helm 레벨(`helm rollback`)이 아닌 Git 레벨(Git revert)로 전환했다. 문제가 발생하면 Git 리포지토리에서 해당 변경을 `git revert`하고, CI/CD 파이프라인이 자동으로 `helm upgrade`를 실행하여 이전 상태의 차트/values를 배포하는 방식이다. 이 접근의 장점은 다음과 같다.

- Helm 릴리스 히스토리에 의존하지 않으므로 etcd 부하와 무관하게 롤백 가능
- Git 히스토리가 모든 변경의 감사 추적(audit trail)을 제공
- 롤백 자체도 코드 리뷰와 PR 프로세스를 거칠 수 있어 안전성 향상
- ArgoCD, Flux 같은 GitOps 도구와 자연스럽게 통합

**프로그레시브 딜리버리 도구 도입:** 카나리 배포에는 Argo Rollouts를 도입하여 Helm의 롤백 메커니즘과 완전히 분리했다. Argo Rollouts는 카나리 비율 조절, 자동 분석(Prometheus 메트릭 기반), 자동 롤백 등의 기능을 제공하여 Helm의 전체 릴리스 단위 롤백 한계를 극복했다. 문제 감지 시 카나리 Pod만 제거하고 트래픽을 stable 버전으로 되돌리는 세밀한 롤백이 가능해졌다.

**비롤링 리소스의 별도 관리:** PVC, CRD 등 Helm 롤백으로 완전히 되돌릴 수 없는 리소스들은 별도의 reconciliation 로직으로 관리했다. 이런 리소스의 변경은 Helm Chart가 아닌 별도의 인프라 관리 파이프라인(Terraform, Crossplane 등)에서 처리하거나, 해당 리소스의 lifecycle을 Helm Chart 외부로 분리하여 `helm.sh/resource-policy: keep` 어노테이션으로 Helm의 관리 범위에서 제외했다.

### 5.4 주요 교훈

- `helm rollback`은 모든 리소스를 이전 상태로 되돌리지 않는다. PVC, CRD 등 비롤링 리소스는 롤백 대상에서 제외되거나 부분적으로만 적용되어 상태 불일치를 유발할 수 있다
- `--history-max`를 반드시 설정하여 릴리스 히스토리가 etcd를 압박하지 않도록 해야 한다. 설정하지 않으면 릴리스 Secret이 무한히 누적되어 etcd 성능 저하와 클러스터 안정성 문제로 이어진다
- 대규모 환경에서는 Helm 자체의 롤백(`helm rollback`)보다 GitOps 기반 롤백(Git revert -> CI/CD 재배포)이 더 안정적이고 감사 추적이 용이하다
- 카나리 배포와 Helm 롤백은 본질적으로 호환되지 않는다. 카나리 배포의 세밀한 트래픽 제어와 점진적 롤백에는 Argo Rollouts, Flagger 같은 프로그레시브 딜리버리 도구를 별도로 사용해야 한다
- Helm이 관리하기 어려운 리소스(PVC, CRD 등)는 처음부터 Helm Chart 외부에서 관리하거나, `resource-policy: keep` 어노테이션으로 Helm의 lifecycle 관리 대상에서 제외하는 것이 바람직하다
- 롤백 전략은 배포 전략과 함께 설계해야 한다. 배포는 자동화하면서 롤백은 수동에 의존하는 것은 대규모 환경에서 위험하다
