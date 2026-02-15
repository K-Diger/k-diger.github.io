---
title: "Docker & 컨테이너 실무 사례 아카이브"
date: 2026-02-15
categories: [DevOps, Container]
tags: [Docker, Distroless, MultiStage, ContainerSecurity, ImageOptimization]
layout: post
toc: true
math: true
mermaid: true
---

Docker 컨테이너는 현대 인프라의 기본 빌딩 블록이 되었지만, 실제 프로덕션 환경에서는 이미지 크기 팽창, 보안 취약점 노출, 빌드 캐시 비효율 등 다양한 문제가 반복적으로 발생한다. 이 글에서는 Google, Snyk, Sysdig, Grab, Docker 공식 팀 등 업계를 대표하는 조직들이 프로덕션 환경에서 겪은 Docker/컨테이너 운영 경험을 정리하였다. 각 사례는 공개된 엔지니어링 블로그에서 수집한 내용이며, 원문 URL을 함께 제공하므로 상세 내용은 원문에서 확인할 수 있다.

---

## 1. Google의 Distroless 컨테이너 이미지 도입과 공격 표면 최소화

> **원문 ([Google Cloud Blog](https://cloud.google.com/blog/products/containers-kubernetes/kubernetes-best-practices-how-and-why-to-build-small-container-images)):**
> Kubernetes best practices: How and why to build small container images

**저자:** Sandeep Dinesh (Google Cloud)

### 1.1 상황

Google Cloud 팀은 Kubernetes 환경에서 컨테이너 이미지가 프로덕션 운영의 주요 산출물임에도 불구하고, 많은 조직이 이미지 크기와 구성에 대해 충분한 주의를 기울이지 않고 있음을 인식하였다. Kubernetes 위에서 운영되는 컨테이너 이미지의 크기는 배포 속도, 보안, 리소스 효율성에 직접적인 영향을 미친다. 일반적으로 개발자들이 `ubuntu`나 `debian` 등의 범용 베이스 이미지를 그대로 사용하여 프로덕션 컨테이너를 빌드하는 경우, 이미지 크기가 수백 MB에서 1GB 이상에 달하는 상황이 빈번하였다.

이 문제는 단일 서비스에서는 체감하기 어려울 수 있으나, 수십에서 수백 개의 마이크로서비스를 운영하는 대규모 환경에서는 레지스트리 스토리지 비용, 네트워크 대역폭 소모, Pod 스케줄링 대기 시간 등 다양한 영역에서 누적적인 비용을 발생시킨다. 특히 Kubernetes의 Auto Scaling 환경에서 새 노드가 추가되면 해당 노드에 필요한 이미지를 Pull해야 하는데, 이미지가 클수록 Pod가 실제로 Ready 상태가 되기까지의 시간(startup latency)이 길어져 트래픽 급증 시 대응 능력이 저하된다.

### 1.2 문제

범용 베이스 이미지에는 셸(bash, sh), 패키지 매니저(apt, yum), 디버깅 유틸리티(curl, wget, netcat, vi 등) 등 런타임에 전혀 필요하지 않은 바이너리와 라이브러리가 대량으로 포함되어 있었다. 이로 인해 다음과 같은 구체적인 문제가 발생하였다.

**첫째, 이미지 크기에 따른 배포 속도 저하.** 기본 `node` 이미지는 약 900MB, `golang` 이미지는 약 700MB에 달한다. 이 크기의 이미지를 Pull하는 데 네트워크 환경에 따라 수십 초에서 수 분이 소요될 수 있다. Kubernetes 클러스터에서 Horizontal Pod Autoscaler(HPA)가 트리거되어 새로운 Pod를 스케줄링할 때, 해당 노드에 이미지가 캐시되어 있지 않으면 이미지 Pull 시간이 그대로 Pod 시작 지연으로 이어진다. 이는 트래픽 급증 시 Auto Scaling의 실효성을 크게 떨어뜨린다.

**둘째, 보안 공격 표면(attack surface)의 확대.** 컨테이너 내부에 셸과 네트워크 도구가 존재하면, 컨테이너에 침입한 공격자가 이를 악용하여 내부 네트워크를 탐색(lateral movement)하거나 추가 악성 소프트웨어를 다운로드할 수 있다. 예를 들어 `curl`이나 `wget`이 있으면 외부에서 exploit 페이로드를 다운로드할 수 있고, `sh`/`bash`가 있으면 임의의 스크립트를 실행할 수 있다. 이러한 바이너리는 애플리케이션 실행에는 전혀 필요 없지만, 공격자에게는 강력한 도구가 된다.

**셋째, CVE(Common Vulnerabilities and Exposures) 스캐닝 부담 증가.** 범용 이미지에 포함된 수백 개의 패키지 각각이 취약점 스캐닝 대상이 된다. 실제 애플리케이션과 무관한 패키지에서 CVE가 검출되면, 보안 팀은 해당 CVE가 실제로 exploit 가능한지 분석하는 데 시간을 소모해야 한다. 이러한 노이즈 취약점이 진짜 위험한 취약점을 가리는 효과를 만들어, 보안 대응의 우선순위 결정을 어렵게 한다.

### 1.3 해결

Google은 이 문제를 근본적으로 해결하기 위해 **Distroless 이미지**(`gcr.io/distroless`)를 개발하여 오픈소스로 공개하였다. Distroless의 주요 설계 철학은 "애플리케이션 실행에 필요한 것만 포함하고, 나머지는 모두 제거한다"는 것이다.

**Distroless 이미지의 구성 요소:**

- 언어별 런타임(Java JRE, Python, Node.js 등) 또는 정적 바이너리 실행 환경
- CA 인증서(HTTPS 통신에 필요)
- 타임존 데이터(tzdata)
- glibc 또는 필수 공유 라이브러리

**Distroless 이미지에서 제거된 요소:**

- 셸(bash, sh, ash 등)
- 패키지 매니저(apt, apk 등)
- 네트워크 유틸리티(curl, wget, netcat 등)
- 텍스트 에디터, coreutils의 대부분

이 접근법을 실무에 적용하는 주요 패턴은 **Multi-stage 빌드**이다. 빌드 단계(builder stage)에서는 컴파일러, 패키지 매니저 등 빌드에 필요한 모든 도구가 포함된 이미지를 사용하고, 최종 런타임 단계에서는 Distroless 이미지에 빌드 결과물(바이너리, JAR 파일 등)만 복사하는 방식이다.

**Go 애플리케이션 예시의 크기 비교:**

| 빌드 방식 | 이미지 크기 |
|----------|-----------|
| `golang:latest` 기반 단일 단계 빌드 | 약 700MB |
| Multi-stage + `alpine` | 약 12MB |
| Multi-stage + `scratch` | 약 6-7MB (정적 링크 필요) |
| Multi-stage + `gcr.io/distroless/static` | 약 7-8MB (CA 인증서, tzdata 포함) |

Go는 정적 바이너리를 생성할 수 있어 `scratch` 이미지 사용이 가능하지만, `scratch`에는 CA 인증서나 타임존 정보가 없어 HTTPS 호출이나 시간대 처리에 문제가 발생할 수 있다. Distroless의 `static` 변형은 이러한 최소 필수 요소를 포함하면서도 셸은 제거된 상태이므로, `scratch`보다 실용적인 선택지가 된다.

**디버깅 전략:** Distroless 이미지에는 셸이 없으므로 `docker exec -it` 또는 `kubectl exec -it`로 컨테이너 내부에 접속해도 아무것도 할 수 없다. 이를 위해 Google은 두 가지 전략을 제시하였다.

1. **`-debug` 태그가 붙은 Distroless 변형:** BusyBox 셸이 포함되어 있어, 스테이징 환경에서 디버깅할 때 사용할 수 있다.
2. **`kubectl debug` (Ephemeral 컨테이너):** Kubernetes 1.23+에서 정식 지원되는 기능으로, 실행 중인 Pod에 디버그용 사이드카 컨테이너를 임시로 붙여 디버깅할 수 있다. 프로덕션 이미지는 Distroless를 유지하면서도 필요시 디버깅이 가능하다.

### 1.4 주요 교훈

- Distroless 이미지는 셸이 없으므로 컨테이너에 침입한 공격자가 활용할 수 있는 도구가 극히 제한된다. 이는 심층 방어(defense in depth) 전략의 중요한 한 축이다.
- Multi-stage 빌드는 빌드 의존성과 런타임 의존성을 분리하는 데 필수적인 패턴이다. 단일 stage Dockerfile은 프로덕션 환경에서 anti-pattern으로 간주해야 한다.
- 이미지 크기 축소는 단순한 디스크 최적화가 아니라 보안(CVE 감소, 공격 표면 축소), 운영 효율성(배포 속도, Auto Scaling 응답 시간), 비용 절감(레지스트리 스토리지, 네트워크 대역폭)에 동시에 기여하는 주요 운영 전략이다.
- 디버깅이 필요한 경우를 위해 `-debug` 태그가 붙은 Distroless 변형이나 Kubernetes의 Ephemeral 컨테이너(`kubectl debug`) 기능을 활용하는 전략이 유효하다. 프로덕션 이미지에 디버깅 도구를 포함시키는 것은 보안 관점에서 바람직하지 않다.
- Alpine 이미지는 크기 면에서 우수하지만, musl libc를 사용하므로 glibc 기반 라이브러리와의 호환성 문제(특히 DNS 해석, 일부 C 확장 모듈)가 발생할 수 있다. Distroless는 Debian 기반이므로 glibc 호환성 문제가 없다.

---

## 2. Snyk의 Node.js 컨테이너 보안 강화 10가지 실천 사항

> **원문 ([Snyk Blog](https://snyk.io/blog/10-best-practices-to-containerize-nodejs-web-applications-with-docker/)):**
> 10 best practices to containerize Node.js web applications with Docker

**저자:** Liran Tal, Yoni Goldberg (Snyk)

### 2.1 상황

Snyk는 개발자 보안(DevSecOps) 도구를 제공하는 기업으로, Docker Hub와 고객 환경에서 수백만 개의 컨테이너 이미지를 스캐닝하며 보안 취약점을 분석한다. 이 과정에서 **Node.js 기반 컨테이너에서 반복적으로 발생하는 보안 취약점 패턴**을 체계적으로 정리하여 10가지 베스트 프랙티스로 공개하였다.

Node.js는 컨테이너화가 쉬워 보이는 언어 중 하나이지만, 실제로는 PID 1 시그널 처리 문제, npm 생태계의 의존성 복잡도, 이미지 크기 팽창 등 컨테이너 특유의 함정이 존재한다. 많은 개발자가 Docker Hub에서 제공하는 공식 `node` 이미지의 기본 태그(`node:latest` 또는 `node:20`)를 그대로 사용하거나, 로컬 개발 환경의 Dockerfile을 프로덕션에도 그대로 적용하여 비효율적이고 보안에 취약한 이미지를 프로덕션에 배포하는 사례가 빈번하였다.

### 2.2 문제

Snyk 팀이 고객 환경 분석을 통해 발견한 주요 문제들은 다음과 같다.

**1) 부적절한 베이스 이미지 선택과 태그 관리.** `node:latest` 태그를 사용하면 빌드 시점에 따라 Node.js의 major 버전이 달라질 수 있어 빌드 재현성이 보장되지 않는다. 또한 기본 `node` 이미지는 full Debian 기반으로, 이미지 크기가 약 900MB 이상이며, 여기에 포함된 수백 개의 시스템 패키지에서 수백 개의 알려진 보안 취약점(CVE)이 검출된다. Snyk의 스캐닝 결과, 기본 `node:20` 이미지에서 600개 이상의 취약점이 검출되었으나 `node:20-bookworm-slim`에서는 그 수가 크게 줄어드는 것으로 나타났다.

**2) root 유저로 프로세스 실행.** Dockerfile에서 `USER` 지시어를 명시하지 않으면 컨테이너 프로세스는 기본적으로 root(UID 0)로 실행된다. 이 상태에서 애플리케이션에 RCE(Remote Code Execution) 취약점이 존재하면, 공격자는 컨테이너 내부에서 root 권한을 획득하게 되고, 컨테이너 런타임의 취약점을 통한 컨테이너 탈출(container escape) 시 호스트 시스템의 root 권한까지 획득할 위험이 있다.

**3) npm install의 비결정적 빌드.** 개발자들이 `npm install`을 사용하면 `package-lock.json`의 내용과 무관하게 최신 호환 버전의 패키지가 설치될 수 있다. 이는 로컬에서는 정상 동작하지만 CI/CD에서 빌드한 이미지에서는 다른 버전의 의존성이 설치되어 예기치 않은 동작이 발생하는 문제를 유발한다. 또한 `--only=production` 플래그 없이 실행하면 devDependencies(테스트 프레임워크, 린터 등)까지 프로덕션 이미지에 포함되어 이미지 크기가 불필요하게 커지고 공격 표면이 넓어진다.

**4) 민감 파일의 이미지 포함.** `COPY . .`로 전체 프로젝트 디렉토리를 복사하면서 `.env` 파일(환경 변수, API 키), `docker-compose.yml`(인프라 구성 정보), `.git` 디렉토리(소스 히스토리, 커밋 메시지의 시크릿), `.npmrc`(npm 레지스트리 인증 토큰) 등 민감 파일이 이미지에 포함될 수 있다. 이 이미지가 공개 레지스트리에 Push되거나 이미지 레이어가 유출되면 시크릿이 노출된다.

**5) Node.js의 PID 1 시그널 처리 문제.** Linux 컨테이너에서 PID 1(init process)은 특수한 시그널 처리 규칙을 따른다. 커널은 PID 1에 대해 기본 시그널 핸들러를 설정하지 않으므로, 명시적인 핸들러가 없으면 SIGTERM 등의 시그널이 무시된다. Node.js 프로세스가 PID 1로 실행되면 `SIGTERM`을 받아도 graceful shutdown을 수행하지 못하고, 결국 Docker가 10초 타임아웃 후 `SIGKILL`로 강제 종료한다. 이는 진행 중인 요청의 비정상 종료, 데이터 손실, 연결 pool의 정상적인 정리 실패 등을 초래한다.

**6) 불필요한 레이어와 캐시 비효율.** `package.json`과 소스 코드를 동시에 `COPY`한 후 `npm install`을 실행하면, 소스 코드만 변경되어도 `npm install` 레이어의 캐시가 무효화되어 의존성을 매번 다시 설치해야 한다. 수백 MB의 `node_modules`를 매 빌드마다 다시 다운로드하면 빌드 시간이 크게 증가한다.

### 2.3 해결

Snyk 팀은 위 문제들을 해결하기 위한 **10가지 베스트 프랙티스**를 체계화하였다.

**BP 1: 구체적인 베이스 이미지 태그 고정.** `node:20-bookworm-slim`처럼 Node.js 버전, OS 배포판, 변형(slim)을 모두 명시한다. 최고 수준의 재현성을 위해서는 이미지 다이제스트(SHA256 해시)를 고정하는 것이 가장 안전하다.

```dockerfile
FROM node:20-bookworm-slim@sha256:abc123...
```

이렇게 하면 동일한 Dockerfile이 언제 어디서 빌드되더라도 정확히 같은 베이스 이미지를 사용하게 된다.

**BP 2: Non-root 유저로 프로세스 실행.** 공식 `node` 이미지에는 이미 `node`라는 non-root 유저(UID 1000)가 포함되어 있다. `USER node` 지시어를 추가하여 이 유저로 프로세스를 실행한다. 파일 복사 시 `COPY --chown=node:node` 플래그를 사용하여 파일 소유권도 변경한다. 이 설정은 Kubernetes의 `securityContext.runAsNonRoot: true` 정책과 함께 사용하여, root로 실행을 시도하는 컨테이너를 클러스터 수준에서 차단할 수 있다.

**BP 3: `npm ci`로 결정적 빌드 보장.** `npm install` 대신 `npm ci`를 사용한다. `npm ci`는 `package-lock.json`에 명시된 정확한 버전의 패키지만 설치하며, `package.json`과 `package-lock.json` 간의 불일치가 있으면 에러를 발생시킨다. `--omit=dev` 플래그를 추가하여 devDependencies를 제외한다.

**BP 4: `.dockerignore` 활용.** `node_modules`, `.git`, `.env`, `docker-compose*.yml`, `*.md`, `.npmrc`, `.DS_Store`, `coverage/`, `test/` 등 이미지에 포함될 필요가 없는 파일과 디렉토리를 명시적으로 제외한다. 이를 통해 빌드 컨텍스트 크기를 줄여 빌드 속도를 개선하고, 민감 정보의 이미지 포함을 방지한다.

**BP 5: Multi-stage 빌드.** 빌드 단계에서 `npm ci`(devDependencies 포함)를 실행하고 TypeScript 컴파일 등을 수행한 뒤, 최종 런타임 단계에서는 프로덕션 의존성과 빌드 결과물만 복사한다. 이를 통해 TypeScript 컴파일러, 테스트 프레임워크, 빌드 도구 등이 최종 이미지에서 제거된다.

**BP 6: `dumb-init` 또는 `tini`를 PID 1 프로세스로 사용.** 이 init 프로세스들은 시그널을 올바르게 자식 프로세스에 전달하고, 좀비 프로세스를 수확(reap)하는 역할을 한다.

```dockerfile
RUN apt-get install -y dumb-init
ENTRYPOINT ["dumb-init", "node", "server.js"]
```

Docker 19.03+에서는 `--init` 플래그로 `tini`를 자동 주입할 수도 있다. 이를 통해 `SIGTERM` 시 Node.js 프로세스가 graceful shutdown을 정상적으로 수행할 수 있다.

**BP 7: `HEALTHCHECK` 지시어 추가.** Dockerfile에 `HEALTHCHECK` 지시어를 추가하여 컨테이너 상태를 Docker 런타임이 주기적으로 모니터링하도록 한다.

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node healthcheck.js
```

이를 통해 프로세스는 실행 중이지만 실제로는 요청을 처리하지 못하는 상태(예: 이벤트 루프 블로킹, DB 연결 끊김)를 감지할 수 있다.

**BP 8: 적절한 레이어 캐싱 전략.** `package.json`과 `package-lock.json`을 먼저 복사하고 `npm ci`를 실행한 후, 그다음에 소스 코드를 복사한다. 이렇게 하면 소스 코드만 변경된 경우 의존성 설치 레이어는 캐시에서 재사용되어 빌드 시간이 크게 단축된다.

**BP 9: `ENTRYPOINT`와 `CMD` 조합 사용.** `ENTRYPOINT`로 실행할 프로세스를 고정하고 `CMD`로 기본 인자를 제공하는 패턴을 사용하여, 컨테이너 실행 시 프로세스가 명확하게 정의되도록 한다.

**BP 10: 이미지 취약점 스캐닝 자동화.** CI/CD 파이프라인에 Snyk, Trivy 등의 이미지 스캐너를 통합하여 빌드 시점에 취약점을 탐지한다. Critical 또는 High 수준의 취약점이 발견되면 빌드를 실패시키는 정책을 적용하여, 취약한 이미지가 프로덕션에 배포되지 않도록 방지한다.

### 2.4 주요 교훈

- `latest` 태그는 프로덕션에서 절대 사용하면 안 된다. 이미지 다이제스트(SHA256)를 고정하는 것이 가장 안전하며, 최소한 `node:20-bookworm-slim`처럼 버전과 변형까지 명시해야 한다.
- 컨테이너 프로세스는 반드시 non-root 유저로 실행해야 하며, 이는 Kubernetes의 `securityContext.runAsNonRoot: true` 및 Pod Security Standards의 `restricted` 프로필과 연계된다.
- Node.js 프로세스는 PID 1에서 시그널을 올바르게 처리하지 못하므로, `tini`나 `dumb-init` 같은 init 프로세스를 사용해야 SIGTERM 수신 시 graceful shutdown이 가능하다. 이 문제를 해결하지 않으면 Kubernetes의 rolling update 시 기존 Pod가 연결을 정상적으로 drain하지 못하고 강제 종료되어 사용자에게 에러를 반환할 수 있다.
- `.dockerignore` 미설정은 민감 정보 유출의 직접적인 원인이 되므로 반드시 설정해야 한다. 특히 `.npmrc`에 포함된 npm 레지스트리 인증 토큰 유출은 공급망 공격(supply chain attack)의 진입점이 될 수 있다.
- `npm ci`와 `npm install`의 차이를 정확히 이해해야 한다. 프로덕션 환경에서는 `npm ci --omit=dev`를 사용하여 결정적 빌드를 보장하고 불필요한 패키지를 제외해야 한다.

---

## 3. Sysdig의 Dockerfile 보안 베스트 프랙티스 - 프로덕션 컨테이너 보안 강화

> **원문 ([Sysdig Blog](https://sysdig.com/blog/dockerfile-best-practices/)):**
> Top 20 Dockerfile Best Practices

**저자:** Alvaro Iradier (Sysdig)

### 3.1 상황

Sysdig는 컨테이너 보안 및 런타임 모니터링 플랫폼을 운영하면서, 고객 환경에서 수천 개의 Dockerfile과 컨테이너 이미지를 분석해왔다. 이 과정에서 발견한 중요한 패턴은, 런타임에서 탐지되는 보안 사고의 상당 부분이 **Dockerfile 작성 단계에서 이미 내재된 취약점**에서 비롯된다는 것이었다. 즉, 컨테이너 보안의 출발점은 런타임 모니터링이 아니라 Dockerfile 작성 시점이다.

Sysdig 팀은 고객 환경과 공개된 Docker Hub 이미지에서 반복적으로 발견되는 보안 문제를 체계화하여, Dockerfile 수준에서 적용할 수 있는 보안 베스트 프랙티스를 정리하였다. 이는 Shift-Left Security 접근법의 구체적인 실현이라 할 수 있다. 빌드 타임에 보안을 강화하면 런타임에서 탐지하고 대응해야 하는 보안 이벤트의 수 자체가 줄어들기 때문이다.

### 3.2 문제

고객 환경에서 발견된 주요 Dockerfile 보안 문제는 크게 네 가지 영역으로 분류되었다.

**1) 시크릿의 이미지 레이어 노출.** `RUN` 지시어에서 환경 변수나 빌드 인자(`ARG`)를 통해 API 키, 비밀번호, 인증 토큰을 전달하는 패턴이 빈번하게 발견되었다. 예를 들어 `ARG API_KEY`로 전달한 뒤 `RUN curl -H "Authorization: Bearer $API_KEY" ...`와 같이 사용하면, 이 빌드 인자는 `docker history` 명령으로 확인할 수 있고, 이미지 레이어 파일 시스템에도 기록될 수 있다. `ENV`로 설정된 시크릿은 더 위험한데, 컨테이너 실행 중에도 환경 변수로 노출되기 때문이다. 일부 케이스에서는 `RUN`에서 시크릿을 사용한 후 같은 레이어에서 삭제하더라도, Docker의 레이어 구조 특성상 이전 레이어에 해당 정보가 남아 있어 `docker save`와 레이어 추출로 복원할 수 있다.

**2) `ADD` 지시어의 보안 위험.** `ADD` 지시어는 `COPY`와 달리 원격 URL에서 파일을 다운로드하는 기능과 tar 자동 압축 해제 기능을 갖고 있다. 원격 URL 다운로드 시 체크섬 검증이 이루어지지 않으므로, 중간자 공격(MITM) 또는 소스 서버 변조를 통해 악성 파일이 이미지에 포함될 수 있다(공급망 공격). tar 자동 해제 기능은 악의적으로 조작된 아카이브 파일이 예상치 못한 경로에 파일을 생성하는 path traversal 공격의 벡터가 될 수 있다.

**3) 불필요한 패키지와 레이어 비대화.** `apt-get install`로 패키지를 설치한 후 별도의 `RUN` 레이어에서 캐시를 정리하는 패턴이 빈번하였다. Docker의 유니온 파일 시스템 구조에서 각 `RUN` 지시어는 새로운 레이어를 생성하므로, 이전 레이어에서 생성된 파일은 이후 레이어에서 삭제하더라도 최종 이미지 크기에는 여전히 포함된다. 또한 `apt-get install`에 `--no-install-recommends` 플래그를 사용하지 않으면 수십 개의 불필요한 추천 패키지가 함께 설치되어 이미지 크기와 공격 표면이 모두 증가한다.

**4) 파일 권한 및 소유권 문제.** `COPY` 또는 `ADD`로 파일을 복사할 때 기본적으로 root(UID 0, GID 0) 소유권이 설정된다. `--chown` 플래그 없이 파일을 복사하면 non-root 유저로 프로세스를 실행하더라도 해당 파일의 소유권은 root로 남아, 최소 권한 원칙(principle of least privilege)에 위배된다.

### 3.3 해결

Sysdig 팀은 위 문제들에 대한 구체적인 해결 방안을 다음과 같이 정리하였다.

**시크릿 관리: BuildKit의 `--mount=type=secret` 활용.** Docker BuildKit(Docker 18.09+)의 시크릿 마운트 기능을 사용하면 시크릿이 빌드 프로세스에서만 임시로 접근 가능하고, 이미지 레이어에는 일체 기록되지 않는다.

```dockerfile
RUN --mount=type=secret,id=my_secret cat /run/secrets/my_secret
```

빌드 시 `docker build --secret id=my_secret,src=./secret.txt`로 시크릿을 전달한다. CI/CD 환경에서는 파이프라인의 시크릿 매니저(GitHub Actions secrets, GitLab CI variables 등)와 연동하여 빌드 시점에 주입한다.

**`ADD` 대신 `COPY` 사용, 외부 파일은 `RUN curl` + 체크섬 검증.** `COPY`는 로컬 파일 시스템에서만 파일을 복사하므로 원격 다운로드 관련 보안 위험이 없다. 외부에서 파일을 가져와야 하는 경우, 명시적으로 다운로드하고 체크섬을 검증하는 패턴을 사용한다.

```bash
RUN curl -fsSL -o file.tar.gz https://example.com/file.tar.gz && \
    echo "expected_sha256 file.tar.gz" | sha256sum -c -
```

**레이어 최적화: 단일 RUN에서 설치와 정리 수행.** 패키지 설치, 설정, 캐시 정리를 모두 하나의 `RUN` 지시어에서 수행한다.

```dockerfile
RUN apt-get update && \
    apt-get install -y --no-install-recommends package1 package2 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

`--no-install-recommends` 플래그로 추천 패키지 자동 설치를 방지하고, `apt-get clean`과 lists 디렉토리 삭제로 패키지 캐시를 제거한다. 이를 하나의 `RUN`에서 수행함으로써 중간 레이어에 불필요한 파일이 남지 않는다.

**CI/CD 파이프라인에 이미지 스캐닝 통합.** Trivy, Snyk Container, Sysdig Secure 등의 이미지 스캐닝 도구를 CI/CD 파이프라인에 필수 단계로 포함한다. 스캐닝 결과에 따라 빌드 성공/실패를 결정하는 정책을 수립한다. 예를 들어 "Critical CVE 1개 이상 또는 High CVE 10개 이상이면 빌드 실패"와 같은 임계치를 설정한다. 이를 통해 취약한 이미지가 레지스트리에 Push되는 것 자체를 차단할 수 있다.

**빌드 캐시 최적화: BuildKit의 `--mount=type=cache` 활용.** 패키지 매니저의 캐시 디렉토리를 빌드 간에 공유할 수 있다.

```dockerfile
RUN --mount=type=cache,target=/var/cache/apt apt-get install ...
```

apt 캐시가 빌드 간에 재사용되어 동일 패키지를 반복 다운로드하지 않아도 된다. 이는 CI/CD 환경에서 빌드 시간 단축에 크게 기여한다.

**최소 권한 원칙 적용.** `COPY --chown=appuser:appgroup` 플래그로 파일 소유권을 non-root 유저로 설정한다. `RUN chmod`로 불필요한 실행 권한을 제거한다. `USER` 지시어로 non-root 유저를 설정하되, 이전에 root 권한이 필요한 작업(패키지 설치 등)은 `USER root` 상태에서 수행하고, 마지막에 `USER appuser`로 전환하는 순서를 따른다.

### 3.4 주요 교훈

- 이미지 레이어는 유니온 파일 시스템의 특성상 삭제해도 히스토리에 남으므로, 시크릿은 절대 `RUN`, `ENV`, `ARG`로 전달하면 안 된다. BuildKit의 `--mount=type=secret`이 유일하게 안전한 방법이다.
- BuildKit의 `--mount=type=secret`과 `--mount=type=cache`는 보안과 빌드 성능을 동시에 개선하는 주요 기능이다. BuildKit을 활성화하지 않은 프로덕션 빌드 파이프라인은 보안과 성능 모두에서 최적이 아닌 상태이다.
- 컨테이너 보안은 런타임이 아닌 빌드 타임부터 시작해야 하며, Shift-Left Security 전략의 핵심이 바로 Dockerfile 수준에 있다. Dockerfile에서 보안을 강화하면 런타임에서 방어해야 할 공격 벡터 자체가 줄어든다.
- CI/CD 파이프라인에 이미지 스캐닝을 필수 단계로 포함하고, 임계치 이상의 CVE가 발견되면 빌드를 실패시키는 정책이 필요하다.
- `ADD`는 명시적인 필요성이 없는 한 사용하지 않아야 한다. `COPY`가 더 예측 가능하고 안전한 대안이며, 외부 파일 다운로드는 `RUN curl` + 체크섬 검증으로 대체해야 한다.

---

## 4. Grab의 Docker 이미지 크기 90% 절감 사례

> **원문 ([Grab Engineering Blog](https://engineering.grab.com/reducing-your-go-binary-size)):**
> Reducing Docker Image Sizes

**저자:** Grab Engineering Team

### 4.1 상황

Grab은 동남아시아 최대 슈퍼앱으로, 차량 호출, 음식 배달, 결제, 금융 서비스 등 다양한 서비스를 하나의 플랫폼에서 제공한다. 이 거대한 생태계를 **수백 개의 마이크로서비스**로 운영하고 있으며, 각 서비스는 Docker 컨테이너로 패키징되어 Kubernetes 클러스터 위에서 실행된다.

Grab의 개발 조직은 수백 명의 엔지니어로 구성되어 있으며, 하루에 수백 번의 배포가 이루어지는 높은 배포 빈도(deployment velocity)를 가지고 있었다. 각 서비스팀이 독립적으로 Dockerfile을 작성하고 이미지를 빌드했기 때문에, 이미지 최적화에 대한 일관된 가이드라인이 존재하지 않았고, 서비스별 이미지 크기 편차가 매우 컸다. 일부 서비스의 Docker 이미지는 1GB 이상에 달하는 경우가 빈번하였다.

### 4.2 문제

대형 이미지로 인해 **세 가지 주요 영역**에서 운영 문제가 발생하였으며, 이는 조직 규모에 비례하여 비용과 영향이 증폭되는 구조적 문제였다.

**첫째, 컨테이너 레지스트리 스토리지 비용의 급격한 증가.** 수백 개 서비스의 이미지가 버전별로 누적되면서 Amazon ECR에 TB 단위의 스토리지를 소비하였다. 각 서비스가 하루에 여러 번 빌드하고, 각 빌드마다 1GB 이상의 이미지가 Push되므로 스토리지 사용량이 기하급수적으로 증가하였다. ECR의 스토리지 비용은 GB당 월 $0.10이므로, 수십 TB의 이미지 저장에만 상당한 월 비용이 발생하였다.

**둘째, 스케일 아웃(Scale-Out) 시 이미지 Pull 지연.** Kubernetes에서 HPA(Horizontal Pod Autoscaler) 또는 Cluster Autoscaler가 새로운 노드를 추가하면, 해당 노드에 서비스 이미지가 캐시되어 있지 않으므로 레지스트리에서 이미지를 Pull해야 한다. 1GB 이미지의 Pull에는 네트워크 환경에 따라 30초에서 1분 이상이 소요될 수 있다. 이 시간 동안 Pod는 `ContainerCreating` 상태에 머무르며 트래픽을 처리하지 못한다. 동남아시아의 교통 패턴(출퇴근 시간), 프로모션 이벤트 등으로 인한 급격한 트래픽 증가에 대응해야 하는 Grab의 환경에서, 이 지연은 사용자 경험에 직접적인 영향을 미쳤다.

**셋째, CI/CD 파이프라인의 피드백 루프 지연.** 대형 이미지의 빌드와 Push에 소요되는 시간이 길어지면서, 개발자가 코드를 커밋한 시점부터 해당 변경사항이 스테이징 환경에 배포되기까지의 시간이 증가하였다. 이미지 빌드 자체에 5-10분, Push에 2-5분이 소요되면, 하루에 여러 번 배포하는 팀의 경우 누적 대기 시간이 상당하였다. 이는 개발자의 배포 피드백 루프를 느리게 만들어 생산성과 배포 빈도 모두에 부정적 영향을 미쳤다.

### 4.3 해결

Grab 팀은 체계적인 **이미지 최적화 프로젝트**를 전사적으로 진행하였다. 이 프로젝트는 일회성 개선이 아니라, 표준화된 가이드라인과 도구를 통해 지속적으로 이미지 크기를 관리하는 체계를 구축하는 것을 목표로 하였다.

**Multi-stage 빌드 전사 표준화.** 모든 서비스에 Multi-stage 빌드를 의무화하여 빌드 의존성(컴파일러, 패키지 매니저, 테스트 프레임워크 등)을 런타임 이미지에서 완전히 제거하였다. 서비스팀이 참고할 수 있는 언어별 표준 Dockerfile 템플릿을 제공하여 일관성을 확보하였다.

**언어별 최적화 전략:**

- **Go 서비스:** 정적 링크 바이너리를 생성(`CGO_ENABLED=0`)하여 `scratch` 또는 Distroless의 `static` 이미지를 베이스로 사용하였다. Go 바이너리 자체가 5-15MB 수준이므로, 최종 이미지 크기가 10-20MB로 줄어들었다.
- **Java 서비스:** 기존에 full JDK가 포함된 이미지(약 500MB+)를 JRE-only slim 이미지로 전환하였다. 더 나아가 Java 9+의 `jlink` 도구를 활용하여 애플리케이션이 실제로 사용하는 Java 모듈만 포함하는 **커스텀 JRE**를 생성하였다. 이를 통해 JRE 크기를 200MB+ 에서 40-60MB 수준으로 줄일 수 있었다.
- **Node.js 서비스:** `node:alpine` 또는 `node:slim` 변형을 베이스로 사용하고, `npm ci --only=production`으로 devDependencies를 제외하였다. `node_modules`의 불필요한 파일(README, test 디렉토리, TypeScript 소스 등)을 제거하는 추가 최적화도 적용하였다.

**`.dockerignore` 표준화.** 전사 표준 `.dockerignore` 템플릿을 배포하여, `.git`, `node_modules`, `*.md`, `test/`, `coverage/`, `.env`, `docker-compose*.yml` 등 이미지에 포함될 필요 없는 파일을 일관되게 제외하였다.

**레이어 캐싱 최적화.** Dockerfile에서 의존성 정의 파일(`go.mod`, `go.sum`, `package.json`, `package-lock.json`, `pom.xml` 등)을 먼저 복사하고 의존성을 설치한 뒤, 그다음에 소스 코드를 복사하는 순서를 표준화하였다. 이를 통해 소스 코드만 변경된 경우 의존성 설치 레이어가 캐시에서 재사용되어 빌드 시간이 크게 단축되었다.

**이미지 라이프사이클 관리.** ECR Lifecycle Policy를 설정하여 오래된 이미지를 자동으로 정리하는 체계를 구축하였다. 예를 들어 "최근 10개 태그만 유지하고 나머지는 삭제" 또는 "30일 이상 된 untagged 이미지 삭제"와 같은 정책을 적용하였다.

**최적화 결과:** 이러한 체계적 최적화를 통해 Grab은 서비스 전반에 걸쳐 **평균 이미지 크기를 약 90% 절감**하는 성과를 달성하였다. 이는 레지스트리 스토리지 비용 절감, 배포 속도 향상, CI/CD 파이프라인 효율화, 스케일 아웃 응답 시간 단축 등 다방면에서 긍정적인 효과를 가져왔다.

### 4.4 주요 교훈

- 이미지 최적화는 단순히 디스크 절약이 아니라 배포 속도, 스케일링 응답 시간, CI/CD 피드백 루프, 인프라 비용에 직접적으로 영향을 미치는 주요 운영 이슈이다. 특히 대규모 마이크로서비스 환경에서는 서비스 수에 비례하여 비효율이 증폭된다.
- 언어별 최적화 전략이 다르다는 점을 인식하고, 표준 Dockerfile 템플릿을 제공하는 것이 조직 전체의 이미지 품질을 높이는 효과적인 접근이다. Go는 `scratch`/Distroless + 정적 바이너리, Java는 `jlink` + JRE-only, Node.js는 `slim` + `npm ci --omit=dev`가 각 언어의 권장 패턴이다.
- Dockerfile의 `COPY` 순서를 빈번히 변경되지 않는 파일(의존성 정의 파일)부터 배치하여 레이어 캐시 효율을 극대화해야 한다. 이 순서를 잘못 배치하면 매 빌드마다 의존성을 다시 설치하게 되어 빌드 시간이 수 배로 증가한다.
- 레지스트리의 이미지 라이프사이클 정책(ECR Lifecycle Policy, GCR Retention Policy 등)을 설정하여 오래된 이미지를 자동 정리하는 것은 스토리지 비용 관리의 기본이다. 이 정책 없이 운영하면 시간이 지남에 따라 레지스트리 비용이 무한히 증가한다.
- 이미지 최적화는 개별 팀의 노력만으로는 한계가 있으며, 표준 템플릿, 가이드라인, 자동화된 검증(CI에서 이미지 크기 임계치 검사 등)을 통해 조직 수준에서 관리해야 지속 가능하다.

---

## 5. Docker 공식 블로그의 Multi-stage 빌드를 통한 프로덕션 이미지 최적화

> **원문 ([Docker 공식 블로그](https://www.docker.com/blog/intro-guide-to-dockerfile-best-practices/)):**
> Intro Guide to Dockerfile Best Practices

**저자:** Tibor Vass (Docker)

### 5.1 상황

Docker 공식 팀은 Docker Hub에 업로드된 수백만 개의 이미지와 그 Dockerfile을 분석하면서, **대다수의 Dockerfile이 비효율적인 패턴으로 작성**되어 빌드 시간이 불필요하게 길고 이미지 크기가 과도하게 큰 것을 확인하였다. Docker의 주요 기능 중 하나인 빌드 캐시(build cache)는 올바르게 활용하면 빌드 시간을 수십 배 단축할 수 있지만, Dockerfile의 지시어 순서가 잘못되면 거의 매번 전체 재빌드가 발생하여 캐시의 이점을 전혀 누리지 못하게 된다.

Docker 엔진의 빌드 시스템은 전통적인 빌더(legacy builder)에서 BuildKit으로 진화해왔으며, BuildKit은 병렬 빌드, 시크릿 마운트, 캐시 마운트 등 다양한 고급 기능을 제공한다. 하지만 많은 사용자가 여전히 기존 빌더 기반의 패턴으로 Dockerfile을 작성하고 있어 BuildKit의 이점을 활용하지 못하고 있었다.

### 5.2 문제

Docker 공식 팀이 가장 빈번하게 관찰한 비효율적 패턴들은 다음과 같다.

**1) 빌드 캐시를 무효화하는 `COPY` 순서.** Dockerfile에서 `COPY . .`를 의존성 설치(`npm install`, `pip install`, `go mod download` 등) 이전에 배치하는 패턴이 가장 빈번하게 관찰되었다. Docker의 빌드 캐시는 특정 레이어가 변경되면 **해당 레이어 이후의 모든 레이어 캐시가 무효화**되는 cascade invalidation 방식으로 동작한다. 따라서 `COPY . .`가 먼저 실행되면, 소스 코드 한 줄 변경만으로도 이후의 의존성 설치 레이어까지 모두 재실행된다. Node.js 프로젝트에서 수백 MB의 `node_modules`를 매번 다시 다운로드하거나, Java 프로젝트에서 Maven/Gradle 의존성을 매번 다시 받는 것은 빌드 시간을 수 분에서 수십 분으로 증가시킨다.

**2) 빌드 도구가 프로덕션 이미지에 잔존.** Multi-stage 빌드를 사용하지 않는 단일 stage Dockerfile이 빈번하게 발견되었다. 이 경우 컴파일러(gcc, g++), 빌드 도구(make, cmake), 패키지 매니저(npm with devDependencies), 테스트 프레임워크(jest, pytest) 등이 프로덕션 이미지에 그대로 포함된다. 이는 이미지 크기를 수백 MB 증가시킬 뿐 아니라, 보안 공격 표면도 불필요하게 넓힌다. 프로덕션 환경에서 컴파일러나 빌드 도구가 존재하면, 공격자가 컨테이너 내부에서 추가 도구를 빌드하거나 exploit을 컴파일할 수 있다.

**3) 비효율적인 레이어 구성.** 각 `RUN` 명령을 별도의 레이어로 분리하는 패턴이 빈번하였다. 예를 들어 `RUN apt-get update`, `RUN apt-get install ...`, `RUN apt-get clean`을 세 개의 별도 레이어로 작성하면, `apt-get update`로 생성된 패키지 목록 캐시가 첫 번째 레이어에 남고, `apt-get clean`은 세 번째 레이어에서 실행되지만 첫 번째 레이어의 데이터는 여전히 이미지에 포함된다. 또한 `apt-get update`와 `apt-get install`이 별도 레이어에 있으면, `apt-get install` 레이어의 캐시가 유효한 상태에서 패키지 저장소의 메타데이터가 변경되면 오래된 패키지가 설치되는 문제가 발생할 수 있다.

**4) `.dockerignore` 미설정으로 인한 빌드 컨텍스트 비대화.** Docker는 빌드 시작 전에 Dockerfile이 위치한 디렉토리의 모든 파일을 빌드 컨텍스트로 Docker 데몬에 전송한다. `.git` 디렉토리(수백 MB), `node_modules`(수백 MB), 테스트 데이터, 빌드 산출물 등이 빌드 컨텍스트에 포함되면, 빌드 시작 전에 이 데이터를 전송하는 것만으로도 수 초에서 수십 초가 소요된다. 또한 빌드 컨텍스트의 파일이 변경되면 관련 `COPY` 레이어의 캐시가 무효화되므로, 불필요한 파일의 변경이 빌드 캐시를 오염시킬 수 있다.

### 5.3 해결

Docker 팀은 효율적인 Dockerfile 작성 패턴을 다음과 같이 체계적으로 정리하였다.

**1) 레이어 캐싱을 최적화하는 지시어 순서.** 변경 빈도가 낮은 지시어를 Dockerfile 상단에, 높은 지시어를 하단에 배치하는 것이 주요 원칙이다. 구체적인 순서는 다음과 같다.

```dockerfile
# 1. 베이스 이미지 (거의 변경되지 않음)
FROM node:20-slim

# 2. 시스템 패키지 설치 (드물게 변경)
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init

# 3. 의존성 정의 파일 복사 (가끔 변경)
COPY package.json package-lock.json ./

# 4. 의존성 설치 (의존성 변경 시에만 재실행)
RUN npm ci --omit=dev

# 5. 소스 코드 복사 (매 빌드마다 변경)
COPY . .

# 6. 빌드 명령
RUN npm run build
```

이 순서를 지키면 소스 코드만 변경된 경우(가장 빈번한 빌드 시나리오) 4번까지의 레이어는 캐시에서 재사용되어 빌드 시간이 크게 단축된다.

**2) Multi-stage 빌드로 빌드/런타임 분리.** `FROM node:20 AS builder`로 빌드 단계를 정의하고 의존성 설치와 빌드를 수행한 뒤, `FROM node:20-slim`(또는 Distroless)으로 시작하는 최종 단계에서 필요한 파일만 복사한다.

```dockerfile
FROM node:20 AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/server.js"]
```

BuildKit을 사용하면 **독립적인 Multi-stage 단계가 병렬로 빌드**되어 전체 빌드 시간이 단축된다.

**3) 관련 `RUN` 명령 체이닝.** 논리적으로 관련 있는 명령들을 `&&`로 체이닝하여 하나의 레이어로 합친다. 특히 패키지 설치와 캐시 정리는 반드시 같은 레이어에서 수행해야 한다. `\`(백슬래시)를 사용한 줄바꿈으로 가독성을 유지하면서 레이어 수를 최소화한다.

**4) BuildKit 활성화와 고급 기능 활용.** `DOCKER_BUILDKIT=1` 환경 변수를 설정하거나 Docker Desktop의 설정에서 BuildKit을 기본 빌더로 활성화한다. BuildKit은 다음과 같은 주요 기능을 제공한다.

- **병렬 빌드:** Multi-stage의 독립적인 stage들이 동시에 빌드됨
- **캐시 마운트 (`--mount=type=cache`):** 패키지 매니저 캐시를 빌드 간에 공유하여 의존성 다운로드 시간 절약
- **시크릿 마운트 (`--mount=type=secret`):** 빌드 시 시크릿을 안전하게 전달 (레이어에 기록되지 않음)
- **SSH 마운트 (`--mount=type=ssh`):** 프라이빗 Git 저장소 접근 등에 SSH 키를 안전하게 사용

**5) `.dockerignore` 파일 구성.** `.gitignore`와 유사한 문법으로, 빌드 컨텍스트에서 제외할 파일과 디렉토리를 지정한다. 최소한 `.git`, `node_modules`, `*.md`, `docker-compose*.yml`, `.env`, `.vscode`, `coverage/`, `test/`, `*.log`를 포함해야 한다.

### 5.4 주요 교훈

- Dockerfile의 지시어 순서가 빌드 캐시 효율성을 결정하며, "변경 빈도가 낮은 것부터 높은 순서로 배치"하는 것이 가장 중요한 원칙이다. 이 원칙을 지키지 않으면 Docker의 빌드 캐시 메커니즘이 사실상 무용지물이 된다.
- Multi-stage 빌드는 이미지 크기 최적화뿐 아니라 보안(빌드 도구를 프로덕션 이미지에서 분리), 빌드 속도(BuildKit 병렬 빌드), 관심사 분리(빌드 로직과 런타임 로직의 명확한 구분)에도 기여하는 다목적 패턴이다.
- BuildKit은 기존 빌드 엔진 대비 캐싱, 병렬 처리, 시크릿 마운트, 캐시 마운트 등 다양한 이점을 제공하므로 프로덕션 환경에서 반드시 활성화해야 한다. Docker 23.0+ 에서는 BuildKit이 기본 빌더이지만, 이전 버전에서는 명시적 활성화가 필요하다.
- `.dockerignore`는 빌드 컨텍스트 크기를 줄여 빌드 시작 속도를 개선하고, 불필요한 파일 변경에 의한 캐시 무효화를 방지하며, 민감 파일의 이미지 포함을 차단하는 일석삼조의 효과를 가진다. 가장 간단하면서도 효과적인 최적화 조치이므로 모든 프로젝트에서 반드시 설정해야 한다.
- Docker 빌드 캐시의 cascade invalidation 특성(특정 레이어 변경 시 이후 모든 레이어 캐시 무효화)을 이해하는 것은 효율적인 Dockerfile 작성의 전제 조건이다.

---

## 주요 요약

| 주제 | 주요 포인트 | 관련 사례 |
|------|------------|-----------|
| **Multi-stage 빌드** | 빌드/런타임 분리, 레이어 캐시 최적화, BuildKit 병렬 빌드 활용, 이미지 크기와 공격 표면 동시 감소 | 사례 1, 4, 5 |
| **Distroless/Minimal 이미지** | 셸 제거로 공격 표면 최소화, 언어별 최적 베이스 이미지 선택, Alpine musl libc 호환성 주의 | 사례 1, 4 |
| **컨테이너 보안** | non-root 실행, 시크릿 관리(`--mount=type=secret`), 이미지 스캐닝 CI 통합, PID 1 시그널 처리 | 사례 2, 3 |
| **이미지 크기 최적화** | `.dockerignore`, 레이어 합치기, 의존성 분리, 언어별 최적화(jlink, scratch, slim), 레지스트리 라이프사이클 정책 | 사례 4, 5 |
| **빌드 캐시 전략** | 지시어 순서(변경 빈도 낮은 것 우선), cascade invalidation 이해, BuildKit 캐시 마운트, `.dockerignore` 활용 | 사례 5 |
| **Shift-Left Security** | Dockerfile 수준에서 보안 강화, 빌드 타임 취약점 탐지, ADD 대신 COPY 사용, 체크섬 검증 | 사례 3 |

---

## 참고 자료

- [Docker 공식 문서 - Multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- [Docker 공식 문서 - Best practices for writing Dockerfiles](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
- [Docker 공식 문서 - BuildKit](https://docs.docker.com/build/buildkit/)
- [Google Distroless Images GitHub](https://github.com/GoogleContainerTools/distroless)
- [Kubernetes 공식 문서 - Security Context](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/)
- [Trivy - Container Image Scanner](https://aquasecurity.github.io/trivy/)
- [Kubernetes 공식 문서 - Ephemeral Containers](https://kubernetes.io/docs/concepts/workloads/pods/ephemeral-containers/)
- [Docker 공식 문서 - BuildKit Secret Mounts](https://docs.docker.com/build/building/secrets/)
