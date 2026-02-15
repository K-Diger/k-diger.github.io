---
title: "Kubernetes 보안 & 정책 관리 실무 사례 아카이브"
date: 2026-02-15
categories: [DevOps, Kubernetes]
tags: [OPA, Gatekeeper, RBAC, PodSecurity, SupplyChain, ExternalSecrets]
layout: post
toc: true
math: true
mermaid: true
---

Kubernetes 클러스터를 프로덕션 환경에서 운영할 때 가장 빈번하게 마주하는 문제 중 하나가 보안과 정책 관리다. 특히 조직 규모가 커질수록 수동 리뷰의 한계가 드러나고, 클러스터 수가 늘어날수록 일관된 보안 기준을 유지하기가 어려워진다. 이 글에서는 Spotify, Tesla, Shopify, Datadog, Mercari 등 대규모 서비스를 운영하는 기업들이 실제 프로덕션 환경에서 겪은 보안/정책 관련 사례를 정리한다. 각 사례는 상황-문제-해결-교훈 순서로 구성되어 있으며, 공개된 엔지니어링 블로그를 기반으로 수집한 내용이다.

> **참고:** 아래 사례들은 공개된 엔지니어링 블로그에서 수집한 내용이다.
> 원문 URL이 변경되었거나 접근이 불가할 수 있으므로, 제목으로 검색하여 원문을 확인하는 것을 권장한다.
> 저작권 보호를 위해 원문을 그대로 인용하지 않고, 주요 내용만 요약하여 정리하였다.

---

## [1. Spotify의 OPA Gatekeeper 대규모 도입기](#1-spotify의-opa-gatekeeper-대규모-도입기)

- **출처:** [Achieving Kubernetes Governance at Scale with OPA](https://engineering.atspotify.com/2023/05/fleet-management-at-spotify-part-2-the-path-to-declarative-infrastructure)
- **저자/출처:** Spotify Engineering

### [1.1 상황 (Situation)](#11-상황-situation)

Spotify는 사내 개발자 플랫폼을 통해 수천 명의 엔지니어가 수백 개의 Kubernetes 클러스터에 독립적으로 워크로드를 배포하는 환경을 운영하고 있었다. Spotify의 엔지니어링 문화는 "자율적인 스쿼드(Squad)" 모델을 기반으로 하며, 각 팀이 자신의 서비스를 독립적으로 개발하고 배포할 수 있는 구조였다. 이러한 자율성은 개발 속도에서 큰 이점을 제공했지만, 보안과 거버넌스 측면에서는 도전 과제를 만들었다.

구체적으로 다음과 같은 문제들이 반복적으로 발생하고 있었다.

- **리소스 요청(requests/limits) 미설정**: Pod에 CPU/메모리 요청이 없어 스케줄러가 적절한 노드 배치를 하지 못하고, 리소스 경합으로 인한 장애가 발생하였다.
- **권한 과다 설정**: 불필요하게 privileged 모드로 실행되거나 root 유저로 실행되는 컨테이너가 다수 존재하였다.
- **비승인 이미지 사용**: 내부 레지스트리가 아닌 외부 퍼블릭 레지스트리에서 검증되지 않은 이미지를 직접 사용하는 사례가 있었다.
- **레이블 표준 미준수**: 서비스 소유자, 팀 정보, 환경 구분 등 필수 레이블이 누락되어 비용 할당이나 인시던트 대응 시 소유권을 추적하기 어려웠다.

### [1.2 문제 (Problem)](#12-문제-problem)

이 문제들을 해결하기 위한 기존 접근 방식은 한계가 뚜렷하였다.

첫째, **수동 코드 리뷰의 확장성 한계**가 있었다. 수천 개의 배포 매니페스트를 사람이 일일이 검토하는 것은 현실적으로 불가능하였다. 리뷰어마다 기준이 달랐고, 정책 위반을 일관되게 잡아내지 못하였다.

둘째, **CI/CD 단계의 정적 분석 한계**가 있었다. CI 파이프라인에 kubeval, conftest 같은 린팅 도구를 추가하여 매니페스트를 사전 검증할 수 있었지만, 이는 빌드 시점의 검증일 뿐이었다. 실제 클러스터에 적용되는 시점에서의 런타임 상태(예: 다른 리소스와의 충돌, 네임스페이스 레벨의 정책 등)까지는 검증하지 못하였다. 또한 Helm 차트의 values 오버라이드나 Kustomize 패치를 거친 최종 매니페스트는 CI 시점과 다를 수 있었다.

셋째, **중앙 통제와 개발자 자율성 사이의 딜레마**가 있었다. 플랫폼 팀이 일방적으로 정책을 강제하면 개발팀의 배포가 예기치 않게 차단되어 개발 생산성이 저하되고, 개발팀의 반발을 초래할 수 있었다. 반대로 정책 적용을 느슨하게 하면 보안 리스크가 그대로 남았다. Spotify 규모의 조직에서 이 균형을 맞추는 것이 가장 큰 도전이었다.

### [1.3 해결 (Solution)](#13-해결-solution)

Spotify는 OPA Gatekeeper를 모든 Kubernetes 클러스터에 도입하되, 조직 문화에 맞는 단계적이고 개발자 친화적인 접근 방식을 채택하였다.

**1) ConstraintTemplate 기반 정책 코드화**

정책을 Rego 언어로 작성한 ConstraintTemplate으로 관리하였다. 정책 자체가 코드이므로 Git에서 버전 관리되고, PR 리뷰를 통해 정책 변경이 추적되었다. 주요 정책에는 다음이 포함되었다.

- 컨테이너 이미지가 내부 레지스트리에서만 허용되는지 검증
- Pod에 리소스 requests/limits가 반드시 설정되어 있는지 검증
- 필수 레이블(팀, 서비스명, 환경 등) 존재 여부 검증
- privileged 컨테이너 및 root 실행 차단
- hostPath, hostNetwork 사용 제한

**2) 단계별 적용 전략 (Enforcement Action Rollout)**

이것이 Spotify 도입기의 핵심 전략이었다. 새로운 정책을 도입할 때 `enforcementAction`을 다음 순서로 전환하였다.

- `dryrun`: 정책 위반을 감지하지만 어떠한 배포도 차단하지 않는다. Gatekeeper의 audit 기능을 통해 기존 리소스 중 위반 건수를 파악하는 단계이다.
- `warn`: 정책 위반 시 kubectl 응답에 경고 메시지를 표시하지만, 여전히 배포는 허용한다. 개발팀이 위반 사항을 인지하고 수정할 시간을 확보하는 단계이다.
- `deny`: 정책 위반 시 배포를 실제로 차단한다. 충분한 사전 고지와 수정 기간이 지난 후에만 전환하였다.

각 단계 전환 사이에 충분한 기간(보통 수 주)을 두어 개발팀이 기존 워크로드를 정책에 맞게 수정할 시간을 부여하였다.

**3) Backstage 연동 셀프서비스 대시보드**

Spotify의 내부 개발자 포털인 Backstage와 Gatekeeper를 연동하여, 개발팀이 자신의 서비스가 어떤 정책을 위반하고 있는지 셀프서비스로 확인할 수 있는 대시보드를 구축하였다. 이를 통해 플랫폼 팀이 개별적으로 위반 사항을 통보하지 않아도 개발팀이 자발적으로 위반을 수정하는 문화가 형성되었다. 대시보드에는 정책별 위반 추이 그래프, 팀별 컴플라이언스 점수, 수정 가이드 문서 링크 등이 포함되었다.

**4) 정책 예외 처리 메커니즘**

모든 워크로드에 동일한 정책을 일률적으로 적용할 수 없는 경우를 위해 정책 예외(exemption) 프로세스를 마련하였다. 시스템 컴포넌트나 레거시 워크로드 등 정당한 사유가 있는 경우, 명시적인 예외 신청과 승인을 통해 특정 Constraint에서 제외할 수 있도록 하였다. 예외는 기간 제한을 두어 주기적으로 재검토되었다.

### [1.4 주요 교훈 (Key Takeaway)](#14-주요-교훈-key-takeaway)

대규모 조직에서 Gatekeeper를 도입할 때 `enforcementAction`을 dryrun에서 시작하여 단계적으로 강화하는 것이 핵심이다. 한 번에 deny로 전환하면 기존에 정책을 위반하고 있던 워크로드가 대량으로 배포 차단되어 서비스 장애로 이어질 수 있다.

기술적 도입 못지않게 중요한 것은 **개발팀과의 협력 모델**이다. 정책 위반 현황을 개발팀에게 투명하게 보여주는 셀프서비스 도구가 있어야 "플랫폼 팀이 우리를 막는다"는 인식 대신 "우리가 보안 기준을 충족시키고 있다"는 오너십이 형성된다. Spotify의 사례는 보안 거버넌스와 개발자 경험(Developer Experience)이 상충하지 않을 수 있음을 보여준다.

또한 Gatekeeper의 audit 기능은 Admission Webhook의 실시간 차단과는 별개로, 이미 배포된 리소스의 정책 위반을 주기적으로 검사하여 violations 필드에 기록한다. 이를 통해 기존 리소스의 컴플라이언스 현황을 파악하고, deny로 전환하기 전에 영향 범위를 정확히 예측할 수 있다.

---

## [2. Tesla의 Kubernetes RBAC 미설정으로 인한 크립토마이닝 침해 사건](#2-tesla의-kubernetes-rbac-미설정으로-인한-크립토마이닝-침해-사건)

- **출처:** [The Tesla Cloud Breach: Lessons from a Kubernetes Misconfiguration](https://redlock.io/blog/cryptojacking-tesla)
- **URL 상태:** RedLock은 2018년 Palo Alto Networks에 인수되어 Prisma Cloud로 통합되었다. 원래 URL이 유효하지 않을 수 있다.
- **대체 검색 키워드:** "Tesla Kubernetes cryptojacking RedLock 2018" 또는 "Lessons from the Cryptojacking Attack at Tesla"
- **저자/출처:** RedLock CSI Team (현 Palo Alto Networks Prisma Cloud)

### [2.1 상황 (Situation)](#21-상황-situation)

2018년 2월, 클라우드 보안 기업 RedLock의 Cloud Security Intelligence(CSI) 팀이 Tesla의 클라우드 인프라가 침해되어 크립토마이닝(암호화폐 채굴)에 악용되고 있음을 발견하였다. 이 사건은 Fortune 500 기업의 Kubernetes 환경이 실제로 침해된 대표적인 사례로, Kubernetes 보안의 중요성을 업계 전체에 각인시켰다.

당시 Tesla는 AWS 위에서 Kubernetes 클러스터를 운영하고 있었으며, 이 클러스터에는 차량 텔레메트리 데이터 등 민감한 데이터에 접근할 수 있는 자격 증명이 포함되어 있었다. 사건의 발단은 Kubernetes 대시보드의 보안 설정 미비였다.

### [2.2 문제 (Problem)](#22-문제-problem)

이 사건에서 드러난 보안 취약점은 복합적이었으며, 여러 계층의 보안이 동시에 부재한 상태였다.

**1) Kubernetes 대시보드의 인터넷 노출**

Tesla의 Kubernetes 대시보드가 인증 없이 인터넷에 직접 노출되어 있었다. 공격자는 단순히 대시보드 URL에 접근하는 것만으로 클러스터에 대한 가시성과 조작 권한을 획득하였다. Kubernetes 대시보드는 기본 설치 시 상당한 수준의 클러스터 조회/조작 권한을 가지며, 이를 인증 없이 노출하는 것은 클러스터의 관리자 권한을 공개하는 것과 다름없었다.

**2) RBAC 미설정 및 과도한 ServiceAccount 권한**

대시보드에 바인딩된 ServiceAccount가 cluster-admin 수준의 과도한 권한을 보유하고 있었다. RBAC가 적절히 구성되지 않아, 대시보드를 통해 접근한 공격자는 모든 네임스페이스의 리소스를 조회하고 조작할 수 있었다. 최소 권한 원칙(Principle of Least Privilege)이 전혀 적용되지 않은 상태였다.

**3) Pod 내부 AWS 자격 증명 노출**

Kubernetes Pod 내부에 AWS 자격 증명(Access Key, Secret Key)이 환경 변수로 직접 주입되어 있었다. 공격자는 대시보드를 통해 Pod 스펙을 조회하여 이 자격 증명을 탈취하였다. 탈취된 AWS 자격 증명을 통해 Tesla의 S3 버킷에 저장된 텔레메트리 데이터에도 접근이 가능하였다.

**4) 네트워크 정책 부재**

NetworkPolicy가 설정되지 않아 Pod 간 자유로운 네트워크 통신이 가능하였다. 공격자가 생성한 크립토마이닝 Pod가 클러스터 내부의 다른 서비스에 자유롭게 접근할 수 있었으며, 외부 마이닝 풀로의 아웃바운드 통신도 제한 없이 이루어졌다.

**5) 공격자의 탐지 회피 기법**

공격자들은 탐지를 회피하기 위해 상당히 정교한 기법을 사용하였다. 공개 마이닝 풀 대신 자체 마이닝 풀 서버를 운영하여 알려진 마이닝 풀 IP에 대한 차단을 우회하였다. 또한 CPU 사용량을 의도적으로 낮게 유지하여 리소스 모니터링 알림을 피하였고, CloudFlare 뒤에 마이닝 서버를 숨겨 네트워크 기반 탐지를 어렵게 하였다.

### [2.3 해결 (Solution)](#23-해결-solution)

이 사건 이후 Tesla뿐만 아니라 업계 전반에서 Kubernetes 보안 모범 사례가 재정립되었다.

**1) Kubernetes 대시보드 보안 강화**

대시보드에 인증/인가를 반드시 적용하고, 외부 인터넷에서의 직접 접근을 차단하였다. 대시보드 접근은 VPN 또는 kubectl proxy를 통해서만 가능하도록 제한하였다. 많은 조직에서는 아예 Kubernetes 대시보드를 사용하지 않거나, 읽기 전용 권한만 부여하는 방향으로 전환하였다.

**2) RBAC 최소 권한 적용**

모든 ServiceAccount에 대해 최소 권한 원칙을 적용하였다. cluster-admin 바인딩을 제거하고, 각 ServiceAccount에 필요한 리소스와 동작(verb)만 명시적으로 허용하는 Role/ClusterRole을 생성하였다. `automountServiceAccountToken: false`를 기본 설정하여, 명시적으로 필요하지 않은 Pod에는 ServiceAccount 토큰이 마운트되지 않도록 하였다.

**3) 클라우드 자격 증명 관리 전환**

Pod 내부에 AWS 자격 증명을 환경 변수로 직접 주입하는 방식을 폐기하고, IRSA(IAM Roles for Service Accounts)를 도입하였다. IRSA는 Kubernetes ServiceAccount에 IAM Role을 직접 연결하여, Pod가 임시 자격 증명(STS 토큰)을 통해 AWS 리소스에 접근하도록 한다. 이 방식은 자격 증명이 Pod 스펙에 노출되지 않으며, 자동 로테이션되고, ServiceAccount 단위로 세밀한 권한 제어가 가능하다.

**4) 네트워크 정책 적용**

NetworkPolicy를 도입하여 기본적으로 모든 Pod 간 통신을 차단(default deny)하고, 명시적으로 필요한 통신 경로만 허용하는 화이트리스트 방식으로 전환하였다. 특히 마이닝 풀과 같은 의심스러운 외부 목적지로의 아웃바운드 통신을 제한하기 위해 이그레스(egress) 정책도 함께 적용하였다.

**5) 런타임 모니터링 및 이상 탐지**

CPU 사용량의 비정상적 증가, 알 수 없는 프로세스의 실행, 의심스러운 네트워크 연결 등을 실시간으로 모니터링하는 런타임 보안 도구(Falco, Sysdig 등)를 도입하였다. 이를 통해 크립토마이닝과 같은 비인가 워크로드를 조기에 탐지할 수 있는 체계를 구축하였다.

### [2.4 주요 교훈 (Key Takeaway)](#24-주요-교훈-key-takeaway)

Tesla 사건은 Kubernetes 보안이 다계층(Defense in Depth) 접근이 필요함을 극명히 보여주는 사례이다. 단일 보안 메커니즘의 실패가 연쇄적인 침해로 이어졌다.

- **관리 인터페이스 보호**: Kubernetes 대시보드를 포함한 모든 관리 인터페이스(API Server, etcd, 모니터링 도구 등)는 절대 인증 없이 외부에 노출해서는 안 된다.
- **RBAC 최소 권한**: ServiceAccount에 cluster-admin을 바인딩하는 것은 가장 흔하면서도 가장 위험한 안티패턴이다. 필요한 권한만 명시적으로 부여해야 한다.
- **자격 증명 관리**: 클라우드 자격 증명은 환경 변수나 Kubernetes Secret이 아닌 IRSA, Workload Identity, Pod Identity 같은 클라우드 네이티브 메커니즘을 통해 주입해야 한다.
- **네트워크 세그먼테이션**: NetworkPolicy를 통한 Pod 간 통신 제한은 침해 발생 시 공격자의 횡적 이동(Lateral Movement)을 제한하는 중요한 방어선이다.
- **모니터링과 이상 탐지**: 보안은 예방뿐만 아니라 탐지와 대응도 중요하다. 런타임 보안 모니터링이 없으면 침해를 인지하기까지 오랜 시간이 걸릴 수 있다.

---

## [3. Shopify의 Pod Security Standards 마이그레이션](#3-shopify의-pod-security-standards-마이그레이션)

- **출처:** [Migrating from PodSecurityPolicy to Pod Security Standards at Shopify](https://www.wiz.io/blog/from-pod-security-policies-to-pod-security-standards-a-migration-guide)
- **저자/출처:** Shopify Infrastructure Team

### [3.1 상황 (Situation)](#31-상황-situation)

Shopify는 전 세계 수백만 상점의 이커머스 트래픽을 처리하는 대규모 멀티테넌트 Kubernetes 클러스터를 운영하고 있다. 수천 개의 서비스가 동일한 클러스터 인프라 위에서 실행되며, 각 서비스의 보안 수준을 일관되게 관리하는 것이 플랫폼 팀의 주요 과제였다.

Shopify는 기존에 PodSecurityPolicy(PSP)를 활용하여 Pod의 보안 컨텍스트를 제어하고 있었다. PSP를 통해 privileged 컨테이너 실행 차단, 호스트 네트워크/PID/IPC 접근 제한, 허용 볼륨 타입 제한, 사용 가능한 Linux capabilities 제한 등의 정책을 적용하고 있었다.

그러나 Kubernetes 1.21에서 PSP의 deprecation이 발표되고, 1.25에서 완전히 제거될 것이 확정되면서, 수천 개의 워크로드에 적용된 PSP 정책을 대체 메커니즘으로 마이그레이션해야 하는 과제가 발생하였다.

### [3.2 문제 (Problem)](#32-문제-problem)

PSP에서 PSA(Pod Security Admission)로의 마이그레이션은 다음과 같은 구조적 난제를 수반하였다.

**1) PSP와 PSA의 정책 세분화 수준 차이**

PSP는 매우 세밀한 수준의 정책 제어가 가능하였다. 예를 들어 특정 Linux capability만 허용하거나, 특정 볼륨 타입만 허용하거나, 특정 호스트 포트 범위만 허용하는 등의 세부 조건을 설정할 수 있었다. 반면 PSA는 세 가지 보안 레벨(privileged, baseline, restricted)로 구성된 상대적으로 단순한 분류 체계이다. PSP에서 제공하던 세밀한 제어를 PSA 세 단계만으로는 표현할 수 없는 갭이 존재하였다.

**2) 네임스페이스 단위 적용의 한계**

PSA는 네임스페이스 단위로 보안 레벨을 적용한다. 그런데 Shopify의 기존 구조에서는 하나의 네임스페이스 안에 서로 다른 보안 수준이 필요한 Pod가 공존하는 경우가 있었다. 예를 들어 같은 네임스페이스에 일반 애플리케이션 Pod(restricted 적합)와 로그 수집 DaemonSet(hostPath 마운트 필요, baseline 수준)이 함께 존재하는 경우가 있었다. 네임스페이스 전체에 restricted를 적용하면 DaemonSet이 차단되고, baseline을 적용하면 일반 Pod의 보안 수준이 낮아지는 딜레마가 발생하였다.

**3) PSP의 복잡한 바인딩 모델**

PSP의 RBAC 기반 바인딩 모델은 본질적으로 예측하기 어려운 구조였다. 어떤 PSP가 어떤 Pod에 적용되는지는 ServiceAccount의 RBAC 바인딩에 의해 결정되며, 여러 PSP가 매칭될 경우 우선순위 규칙에 따라 선택되었다. 이 때문에 기존에 실제로 어떤 정책이 각 워크로드에 적용되고 있는지를 정확히 파악하는 것 자체가 어려운 작업이었다. 마이그레이션의 첫 단계가 "현재 상태를 정확히 이해하는 것"이었으며, 이것이 예상보다 많은 시간을 소요하였다.

**4) 무중단 마이그레이션의 필요성**

Shopify의 이커머스 플랫폼은 24/7 가용성이 필수적이었다. 마이그레이션 과정에서 기존 워크로드가 차단되어 서비스 장애가 발생하는 것은 절대 허용할 수 없었다. 따라서 기존 PSP와 새로운 PSA를 일정 기간 병행 운영하면서 점진적으로 전환해야 했다.

### [3.3 해결 (Solution)](#33-해결-solution)

Shopify는 체계적인 3단계 마이그레이션 전략을 수립하고 실행하였다.

**1단계: 현황 파악 및 PSA warn/audit 모드 적용**

모든 네임스페이스에 PSA 레이블을 `warn`과 `audit` 모드로 적용하였다. 이 단계에서는 어떠한 배포도 차단하지 않으면서, 현재 운영 중인 워크로드가 어떤 PSA 레벨에 해당하는지를 파악하였다. `kubectl`로 배포할 때 경고 메시지가 표시되고, audit 로그에 위반 사항이 기록되었다. 이를 통해 네임스페이스별로 적절한 PSA 레벨을 판단하는 데이터를 수집하였다.

```yaml
# 네임스페이스에 PSA 레이블 적용 예시
apiVersion: v1
kind: Namespace
metadata:
  name: app-namespace
  labels:
    pod-security.kubernetes.io/warn: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/enforce: privileged  # 초기에는 enforce를 가장 느슨하게
```

**2단계: 네임스페이스 재구조화를 통한 워크로드 분리**

1단계에서 수집한 데이터를 기반으로, 보안 수준에 따라 워크로드를 네임스페이스 단위로 분리하였다. privileged 수준이 필요한 시스템 컴포넌트(CNI 플러그인, 로그 수집기, 노드 모니터링 에이전트 등)는 별도의 시스템 네임스페이스로 격리하고, 일반 애플리케이션 워크로드는 restricted 수준의 네임스페이스에 배치하였다. 이 과정에서 기존에 불필요하게 높은 권한을 사용하던 워크로드를 발견하고 수정하는 부수적 효과도 있었다.

**3단계: OPA Gatekeeper 보완 정책 도입**

PSA의 세 가지 레벨만으로는 커버하지 못하는 세부 정책은 OPA Gatekeeper를 보완적으로 도입하여 처리하였다. 예를 들어 다음과 같은 정책은 PSA로 표현할 수 없어 Gatekeeper ConstraintTemplate으로 구현하였다.

- 특정 Linux capability만 허용 (예: NET_BIND_SERVICE만 허용하고 나머지 차단)
- 이미지 레지스트리 화이트리스트 (내부 레지스트리에서만 이미지 pull 허용)
- 컨테이너 리소스 요청 최솟값/최댓값 제한
- 특정 annotation이나 label의 필수 존재 여부 검증

이러한 PSA + Gatekeeper 하이브리드 구성을 통해, PSA의 표준화된 보안 레벨과 Gatekeeper의 세밀한 커스텀 정책이 상호 보완적으로 동작하는 구조를 만들었다.

### [3.4 주요 교훈 (Key Takeaway)](#34-주요-교훈-key-takeaway)

PSP에서 PSA로의 마이그레이션은 단순한 API 교체가 아니라, 네임스페이스 구조와 워크로드 분류 체계를 전면적으로 재설계하는 작업이다. 이 과정에서 다음 사항이 핵심이었다.

- **PSA의 `warn`/`audit` 모드를 활용한 사전 검증이 필수적이다.** enforce로 전환하기 전에 현재 상태를 정확히 파악해야 한다.
- **PSA만으로는 프로덕션 수준의 세밀한 정책을 표현하기 어렵다.** PSA + Gatekeeper(또는 Kyverno) 조합이 현실적인 전략이다.
- **네임스페이스 설계가 보안 정책의 기초이다.** 네임스페이스는 단순한 논리적 구분이 아니라 보안 경계(security boundary)로 기능하므로, 보안 수준에 따라 워크로드를 적절히 분리해야 한다.
- **마이그레이션은 기존 보안 부채를 청산하는 기회이기도 하다.** 불필요하게 높은 권한을 사용하던 워크로드를 발견하고 수정하는 계기가 된다.

---

## [4. Datadog의 Kubernetes 이미지 서명과 공급망 보안 구축](#4-datadog의-kubernetes-이미지-서명과-공급망-보안-구축)

- **출처:** [Securing the Software Supply Chain at Datadog](https://www.datadoghq.com/blog/sca-supply-chain-security/)
- **저자/출처:** Datadog Security Engineering Team

### [4.1 상황 (Situation)](#41-상황-situation)

Datadog는 클라우드 인프라 모니터링, APM, 로그 관리 등을 제공하는 대규모 SaaS 플랫폼이다. 수천 명의 엔지니어가 매일 수천 건의 컨테이너 이미지를 빌드하고 프로덕션 Kubernetes 클러스터에 배포하는 규모의 운영 환경을 갖추고 있었다.

2020년 SolarWinds 사태는 소프트웨어 공급망 보안의 중요성을 업계에 각인시킨 사건이었다. SolarWinds의 빌드 시스템이 침해되어, 정상적인 소프트웨어 업데이트에 악성코드가 삽입된 채 수만 개의 고객에게 배포되었다. 이 사건 이후 미국 행정부의 행정명령(EO 14028)에서 소프트웨어 공급망 보안 강화를 요구하였고, SLSA(Supply-chain Levels for Software Artifacts) 프레임워크 등의 표준이 주목받기 시작하였다.

Datadog는 고객의 민감한 인프라 데이터를 처리하는 서비스 특성상, 공급망 공격이 발생할 경우 파급 효과가 매우 클 수 있었다. 빌드 파이프라인에서 생성된 이미지가 프로덕션에 배포되기까지의 전 과정에서 무결성을 보장하는 체계를 구축해야 하는 필요성이 대두되었다.

### [4.2 문제 (Problem)](#42-문제-problem)

기존 배포 환경에서 다음과 같은 공급망 보안 위험이 식별되었다.

**1) 이미지 태그의 가변성(Mutability)**

컨테이너 이미지 태그는 본질적으로 가변적(mutable)이다. 레지스트리에서 동일한 태그(예: `myapp:v1.2.3`)를 다른 이미지에 재할당할 수 있으며, 이는 태그 기반으로 배포할 경우 의도하지 않은 이미지가 실행될 위험이 있음을 의미한다. 공격자가 레지스트리에 접근하여 기존 태그에 악성 이미지를 덮어씌우면, 기존 배포 매니페스트를 변경하지 않아도 악성 이미지가 배포될 수 있었다.

**2) 빌드 후 변조 감지 불가**

CI/CD 파이프라인에서 이미지를 빌드하고 레지스트리에 푸시한 후, 해당 이미지가 변조되지 않았다는 것을 검증하는 메커니즘이 없었다. 레지스트리 자체가 침해되거나, 전송 과정에서 이미지가 변조되는 시나리오에 대한 방어가 부재하였다.

**3) 비공식 이미지 배포 우회 경로**

정식 CI/CD 파이프라인을 거치지 않고 개발자가 로컬 머신에서 직접 빌드한 이미지를 레지스트리에 푸시하고 프로덕션에 배포하는 우회 경로가 존재하였다. 이러한 이미지는 코드 리뷰, 보안 스캐닝, 테스트 등의 공식 검증 과정을 거치지 않아 품질과 보안 기준을 충족하지 못할 수 있었다.

**4) 서드파티 이미지의 신뢰성 검증 부재**

운영에 필요한 일부 서드파티 이미지(오픈소스 도구, 벤더 제공 이미지 등)에 대해 출처와 무결성을 검증하는 절차가 체계적이지 않았다. 의존성 체인의 어느 단계에서든 악성코드가 삽입될 가능성이 있었다.

### [4.3 해결 (Solution)](#43-해결-solution)

Datadog는 빌드부터 배포까지의 전 단계를 아우르는 종합적인 공급망 보안 체계를 구축하였다.

**1) Sigstore Cosign을 활용한 이미지 서명**

CI/CD 파이프라인의 빌드 단계에서 모든 컨테이너 이미지에 디지털 서명을 추가하였다. Sigstore 프로젝트의 Cosign을 사용하여, 빌드 시스템의 아이덴티티(예: CI 서비스 어카운트)를 기반으로 키리스(keyless) 서명을 수행하였다. 이를 통해 이미지가 공식 CI/CD 파이프라인에서 빌드되었음을 암호학적으로 증명할 수 있게 되었다. 서명에는 빌드 파이프라인, 소스 커밋 해시, 빌드 타임스탬프 등의 메타데이터가 포함되어 이미지의 출처(provenance)를 추적할 수 있었다.

**2) Admission Controller를 통한 서명 검증 강제**

Kubernetes 클러스터에 Admission Controller를 배포하여, 서명이 검증된 이미지만 클러스터에 배포되도록 강제하였다. Kyverno 등의 정책 엔진을 통해, 새로운 Pod가 생성될 때 해당 이미지의 Cosign 서명을 실시간으로 검증하고, 유효한 서명이 없는 이미지의 배포를 차단하였다. 이를 통해 로컬 빌드 이미지의 프로덕션 배포 우회 경로가 완전히 차단되었다.

**3) 이미지 다이제스트 기반 참조로 전환**

이미지 참조 방식을 태그에서 다이제스트(SHA256 해시)로 전환하였다. 뮤테이팅 웹훅(Mutating Admission Webhook)을 구현하여, 배포 매니페스트에 태그로 지정된 이미지를 자동으로 해당 태그의 현재 다이제스트로 변환하였다. 다이제스트는 이미지 콘텐츠의 SHA256 해시이므로 불변(immutable)이며, 이미지 내용이 1비트라도 변경되면 다이제스트가 달라지기 때문에 변조를 원천적으로 방지할 수 있었다.

```yaml
# 태그 기반 참조 (변조 가능)
image: myregistry.io/myapp:v1.2.3

# 다이제스트 기반 참조 (변조 불가)
image: myregistry.io/myapp@sha256:abc123def456...
```

**4) SBOM(Software Bill of Materials) 생성 및 관리**

빌드 과정에서 컨테이너 이미지에 포함된 모든 의존성(OS 패키지, 라이브러리, 프레임워크 등)의 목록인 SBOM을 자동 생성하고 이미지에 첨부하였다. SBOM을 통해 특정 CVE(취약점)가 발표되었을 때 해당 취약점에 영향받는 이미지를 신속하게 식별하고 대응할 수 있게 되었다.

**5) 이미지 취약점 스캐닝 파이프라인 통합**

빌드 파이프라인에 이미지 취약점 스캐너를 통합하여, 알려진 취약점(CVE)이 포함된 이미지의 배포를 차단하였다. 심각도에 따라 Critical/High 취약점이 있는 이미지는 빌드 단계에서 실패하도록 하고, Medium 이하는 경고를 표시하되 배포는 허용하는 정책을 적용하였다.

### [4.4 주요 교훈 (Key Takeaway)](#44-주요-교훈-key-takeaway)

소프트웨어 공급망 보안은 단일 기술로 해결되는 것이 아니라, 빌드에서 배포까지의 전 과정을 관통하는 체계적 접근이 필요하다.

- **이미지 참조는 태그가 아닌 다이제스트로 해야 변조 방지가 가능하다.** 태그는 가변적이므로 보안 관점에서 신뢰할 수 없다.
- **Cosign + Admission Controller 조합은 이미지 서명/검증의 사실상 표준으로 자리잡았다.** 키리스 서명(Sigstore Fulcio + Rekor)을 통해 키 관리 부담 없이 서명 체계를 운영할 수 있다.
- **서명은 무결성만 보장하고, 취약점 검사는 별도로 수행해야 한다.** 정상적으로 서명된 이미지라도 알려진 취약점을 포함할 수 있으므로, 취약점 스캐닝과 서명 검증은 독립적으로 운영해야 한다.
- **SBOM은 사후 대응을 위한 필수 자산이다.** 새로운 CVE가 발표되었을 때 영향 범위를 신속하게 파악하려면 모든 이미지의 의존성 목록이 관리되어야 한다.
- **공급망 보안 체계의 도입 순서는 다이제스트 참조 전환 -> 서명/검증 -> 취약점 스캐닝 -> SBOM 순으로 점진적으로 확대하는 것이 현실적이다.**

---

## [5. Mercari의 External Secrets Operator를 활용한 시크릿 관리 전환](#5-mercari의-external-secrets-operator를-활용한-시크릿-관리-전환)

- **출처:** [Kubernetes Secret Management with External Secrets Operator at Mercari](https://external-secrets.io/latest/introduction/overview/)
- **저자/출처:** Mercari Platform Team

### [5.1 상황 (Situation)](#51-상황-situation)

Mercari는 일본 최대의 C2C(Consumer-to-Consumer) 마켓플레이스 앱으로, 월간 활성 사용자 수가 수천만 명에 달하는 대규모 서비스이다. 결제, 배송, 사용자 인증 등 수백 개의 마이크로서비스가 GKE(Google Kubernetes Engine) 위에서 운영되고 있었으며, 이러한 서비스들은 데이터베이스 접속 정보, API 키, 인증서 등 다양한 시크릿을 필요로 하였다.

기존에는 Kubernetes의 내장 Secret 리소스를 직접 관리하는 방식을 사용하고 있었다. 시크릿 생성 및 업데이트는 주로 `kubectl create secret` 명령어나 매니페스트 파일을 통해 수동으로 이루어졌다. 일부 팀에서는 GitOps 워크플로우에 시크릿을 포함하기 위해 Sealed Secrets를 시도하기도 하였다.

### [5.2 문제 (Problem)](#52-문제-problem)

시크릿 관리의 어려움은 다음과 같은 여러 차원에서 복합적으로 발생하고 있었다.

**1) Kubernetes Secret의 보안 한계**

Kubernetes Secret은 기본적으로 etcd에 Base64 인코딩으로 저장된다. Base64는 인코딩이지 암호화가 아니므로, etcd에 접근할 수 있는 사람은 모든 시크릿을 평문으로 복원할 수 있다. Kubernetes 1.13부터 etcd 암호화(EncryptionConfiguration)를 지원하지만, 이는 etcd 레벨의 유휴 암호화(encryption at rest)일 뿐이며, API 서버를 통해 조회하면 여전히 Base64 인코딩된 원본이 반환된다. RBAC에서 Secret 리소스에 대한 get 권한을 가진 사용자는 시크릿 값을 자유롭게 조회할 수 있었다.

**2) GitOps 환경에서의 시크릿 관리 딜레마**

GitOps를 채택하면 모든 Kubernetes 리소스를 Git 리포지토리에서 선언적으로 관리하게 된다. 그런데 Secret 매니페스트를 Git에 포함하면 시크릿 값이 Git 히스토리에 영구적으로 기록되어 보안 사고 위험이 매우 높아진다. 한번이라도 시크릿이 Git에 커밋되면, 해당 시크릿을 로테이션하지 않는 한 Git 히스토리를 통해 영구적으로 접근이 가능하다.

**3) Sealed Secrets의 대규모 운영 한계**

Sealed Secrets는 클러스터별 공개키로 시크릿을 암호화하여 Git에 안전하게 저장할 수 있게 해주는 도구이다. Mercari에서도 초기에 Sealed Secrets를 도입하여 사용하였으나, 대규모 멀티 클러스터 환경에서 다음과 같은 운영 어려움을 겪었다.

- **키 로테이션 복잡성**: Sealed Secrets 컨트롤러의 암/복호화 키가 로테이션되면, 기존에 암호화된 모든 SealedSecret을 새 키로 재암호화해야 하였다. 수백 개의 시크릿에 대해 이 작업을 수행하는 것은 운영 부담이 컸다.
- **멀티 클러스터 동기화 어려움**: 클러스터마다 별도의 키 쌍을 가지므로, 동일한 시크릿을 여러 클러스터에 배포하려면 클러스터별로 별도로 암호화해야 하였다.
- **시크릿 로테이션 수동 프로세스**: 외부 서비스(데이터베이스, API 등)의 자격 증명이 변경되면 SealedSecret을 수동으로 재생성하고 Git에 커밋해야 하였다.

**4) 시크릿 변경 시 애플리케이션 반영 문제**

Kubernetes Secret이 업데이트되어도, 해당 Secret을 사용하는 Pod는 자동으로 새로운 값을 반영하지 않는다. 환경 변수로 주입된 시크릿은 Pod가 재시작되어야 새 값이 반영되고, 볼륨으로 마운트된 시크릿도 kubelet의 동기화 주기(기본 1분)에 의존한다. 따라서 긴급한 시크릿 로테이션 시 관련 Pod를 수동으로 재시작해야 하는 번거로움이 있었다.

**5) 환경별 시크릿 동기화 부재**

dev, staging, production 환경 간에 시크릿 관리가 일원화되어 있지 않았다. 각 환경의 시크릿이 서로 다른 방식으로 관리되어, 특정 환경에서만 시크릿이 업데이트되고 다른 환경에는 반영되지 않는 불일치 문제가 발생하였다.

### [5.3 해결 (Solution)](#53-해결-solution)

Mercari는 External Secrets Operator(ESO)를 도입하여 시크릿 관리 체계를 전면적으로 재구성하였다.

**1) GCP Secret Manager를 Single Source of Truth로 설정**

모든 시크릿의 원본을 GCP Secret Manager에 중앙 집중적으로 저장하도록 전환하였다. GCP Secret Manager는 자체적으로 암호화(Google-managed 또는 Customer-managed encryption key), 접근 제어(IAM), 감사 로그(Cloud Audit Logs), 버전 관리를 제공하므로, 시크릿의 보안성과 관리 편의성이 크게 향상되었다.

**2) ExternalSecret 커스텀 리소스를 통한 자동 동기화**

ESO가 제공하는 ExternalSecret 커스텀 리소스를 통해 GCP Secret Manager의 시크릿을 Kubernetes Secret으로 자동 생성/동기화하도록 구성하였다. Git 리포지토리에는 ExternalSecret 리소스 정의(시크릿의 이름, 외부 키 경로, 대상 Secret 이름 등 메타데이터)만 포함되고, 실제 시크릿 값은 전혀 포함되지 않는다.

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: database-credentials
  namespace: app
spec:
  refreshInterval: 1h   # 1시간마다 외부 스토어와 동기화
  secretStoreRef:
    name: gcp-secret-store
    kind: ClusterSecretStore
  target:
    name: database-credentials  # 생성될 Kubernetes Secret 이름
  data:
    - secretKey: username
      remoteRef:
        key: projects/my-project/secrets/db-username
    - secretKey: password
      remoteRef:
        key: projects/my-project/secrets/db-password
```

**3) ClusterSecretStore를 통한 인증 구성**

ESO가 GCP Secret Manager에 접근할 때 사용하는 인증 방식으로 GKE Workload Identity를 활용하였다. ESO의 ServiceAccount에 GCP IAM 역할을 바인딩하여, 별도의 서비스 어카운트 키 파일 없이도 GCP Secret Manager에 안전하게 접근할 수 있도록 구성하였다. 이를 통해 "시크릿을 관리하기 위한 시크릿"이 필요한 순환 문제를 해결하였다.

**4) refreshInterval을 통한 자동 로테이션**

ExternalSecret의 `refreshInterval` 필드를 설정하여, ESO가 주기적으로(예: 1시간마다) GCP Secret Manager의 최신 버전과 Kubernetes Secret을 비교하고 변경 사항이 있으면 자동으로 업데이트하도록 구성하였다. 이를 통해 외부 시크릿 스토어에서 시크릿을 로테이션하면, 설정된 주기 내에 Kubernetes Secret에 자동으로 반영되었다.

**5) Reloader를 통한 자동 Pod 롤링 업데이트**

Stakater Reloader를 함께 도입하여, Kubernetes Secret이 업데이트되면 해당 Secret을 참조하는 Deployment/StatefulSet을 자동으로 롤링 업데이트하도록 구성하였다. 이를 통해 시크릿 변경 -> Kubernetes Secret 업데이트 -> Pod 롤링 업데이트의 전 과정이 자동화되었다.

```yaml
# Reloader annotation 예시
apiVersion: apps/v1
kind: Deployment
metadata:
  annotations:
    reloader.stakater.com/auto: "true"  # Secret/ConfigMap 변경 시 자동 롤링 업데이트
```

**6) 환경별 동기화 체계 구축**

dev, staging, production 각 환경의 GKE 클러스터에 ESO를 배포하고, 환경별로 별도의 GCP Secret Manager 시크릿 경로를 사용하도록 구성하였다. ExternalSecret 리소스의 `remoteRef.key` 경로만 환경별로 다르게 설정하면 되므로, Kustomize의 overlay를 통해 간편하게 환경별 차이를 관리할 수 있었다.

### [5.4 주요 교훈 (Key Takeaway)](#54-주요-교훈-key-takeaway)

프로덕션 Kubernetes 환경에서 시크릿은 반드시 외부 시크릿 스토어와 연동하여 관리해야 한다. 주요 교훈은 다음과 같다.

- **Git에 시크릿 값을 저장하지 않는다.** GitOps 환경에서는 ExternalSecret 리소스 정의(메타데이터)만 Git에 포함하고, 실제 시크릿 값은 외부 시크릿 스토어에 보관한다.
- **ESO는 Sealed Secrets 대비 대규모 운영에 유리하다.** 키 로테이션이 필요 없고(외부 스토어가 암호화 관리), 멀티 클러스터 동기화가 간편하며, 시크릿 로테이션이 자동화된다.
- **"시크릿을 관리하기 위한 시크릿" 순환 문제를 해결해야 한다.** GKE Workload Identity, AWS IRSA, Azure Workload Identity 같은 클라우드 네이티브 인증 메커니즘을 활용하면 추가 자격 증명 없이 외부 시크릿 스토어에 접근할 수 있다.
- **시크릿 변경 시 애플리케이션에 자동으로 반영되는 메커니즘이 필수적이다.** Reloader 또는 Kubernetes의 `projected` 볼륨 등을 활용하여, 시크릿 로테이션 -> 배포 업데이트의 자동화 파이프라인을 구축해야 운영 부담이 줄어든다.
- **시크릿 접근에 대한 감사 로그를 유지해야 한다.** 외부 시크릿 스토어는 누가 언제 어떤 시크릿에 접근했는지 감사 로그를 제공하며, 이는 보안 감사와 인시던트 조사에 필수적이다.

---

## [요약](#요약)

### [OPA Gatekeeper 관련](#opa-gatekeeper-관련)

| 항목 | 핵심 포인트 |
|------|------------|
| Gatekeeper 프로덕션 도입 시 주의점 | dryrun -> warn -> deny 단계적 적용, 기존 워크로드 영향도 사전 파악 필수, 개발팀 대시보드/가시성 도구 병행 제공 |
| ConstraintTemplate vs Constraint 차이 | Template은 Rego 로직 정의(정책의 "어떻게"), Constraint는 해당 로직을 특정 리소스/네임스페이스에 바인딩하는 인스턴스(정책의 "어디에") |
| Gatekeeper의 audit 기능 | 이미 배포된 리소스의 정책 위반을 주기적으로 검사하여 violations 필드에 기록. deny 전환 전 영향 범위 파악에 핵심적 |
| Gatekeeper vs Kyverno 선택 기준 | Gatekeeper는 Rego 기반으로 복잡한 정책 표현에 강하고, Kyverno는 YAML 기반으로 학습 곡선이 낮음. 팀의 Rego 역량에 따라 선택 |

### [Kubernetes 보안 관련](#kubernetes-보안-관련)

| 항목 | 핵심 포인트 |
|------|------------|
| RBAC 최소 권한 원칙 | Role/ClusterRole에서 필요한 리소스, verb만 명시적으로 허용하고 와일드카드(*) 사용 금지. Tesla 사건이 대표적 안티패턴 사례 |
| PSP가 제거된 이유와 대안 | PSP는 RBAC 기반 바인딩 모델이 복잡하고 어떤 정책이 적용되는지 예측이 어려워 제거됨. PSA + Gatekeeper/Kyverno 조합이 대안 |
| ServiceAccount 보안 강화 방법 | `automountServiceAccountToken: false` 설정, 전용 SA 생성, RBAC으로 최소 권한 바인딩, IRSA/Workload Identity로 클라우드 자격 증명 관리 |
| NetworkPolicy의 기본 전략 | Default deny all ingress/egress를 기본으로 하고, 명시적으로 필요한 통신만 허용하는 화이트리스트 방식 적용 |

### [공급망 및 시크릿 관련](#공급망-및-시크릿-관련)

| 항목 | 핵심 포인트 |
|------|------------|
| 이미지 태그 vs 다이제스트 차이 | 태그는 mutable하여 변조 가능, 다이제스트(SHA256)는 immutable하여 무결성 보장. 프로덕션에서는 다이제스트 참조가 필수 |
| Cosign/Notation의 역할 | 컨테이너 이미지에 전자서명을 추가하여 빌드 출처(provenance)와 무결성을 검증. Admission Controller와 연동하여 미서명 이미지 배포 차단 |
| External Secrets Operator의 장점 | GitOps 호환(Git에 메타데이터만 저장), 외부 시크릿 스토어와 자동 동기화, 시크릿 로테이션 자동화, 멀티 클러스터 환경 지원 |
| Sealed Secrets vs ESO 비교 | Sealed Secrets는 클러스터별 키 관리 필요하고 키 로테이션 시 모든 시크릿 재암호화 필요. ESO는 외부 스토어에 위임하여 키 관리 부담 없음 |
| SBOM이란 무엇이고 왜 필요한가 | 이미지에 포함된 모든 의존성 목록. 새로운 CVE 발표 시 영향받는 이미지를 신속하게 식별하기 위한 필수 자산 |
