---
title: "Linux 기초 & 성능 분석 실무 사례 아카이브"
date: 2026-02-15
categories: [DevOps, Linux]
tags: [Linux, Performance, cgroups, inode, Kernel, ZombieProcess]
layout: post
toc: true
math: true
mermaid: true
---

Linux는 프로덕션 인프라의 근간이다. 컨테이너, 오케스트레이션, 클라우드 네이티브 기술이 아무리 발전하더라도, 그 아래에서 동작하는 것은 결국 Linux 커널과 운영체제이다. 실제로 대규모 서비스를 운영하는 기업들이 프로덕션에서 마주한 Linux 레벨의 장애 사례를 살펴보면, 커널 파라미터 하나, 프로세스 관리 로직 하나가 전체 서비스 가용성에 어떤 영향을 미치는지 체감할 수 있다.

이 글에서는 Netflix, Cloudflare, LinkedIn, Sentry, Uber 등 대규모 인프라를 운영하는 기업들의 공개된 엔지니어링 블로그에서 수집한 Linux 운영 사례를 정리한다. 각 사례는 상황, 문제, 해결, 교훈의 구조로 서술하며, Kubernetes 환경에서의 적용 방안도 함께 다룬다.

> **참고:** 아래 사례들은 공개된 엔지니어링 블로그에서 수집한 내용이다. 원문 URL이 변경되었거나 접근이 불가할 수 있으므로, 제목으로 검색하여 원문을 확인하는 것을 권장한다. 저작권 보호를 위해 원문을 그대로 인용하지 않고, 주요 내용만 요약하여 정리하였다.

---

## 1. Netflix의 Linux 성능 분석 60초 체크리스트

- **출처:** [Linux Performance Analysis in 60,000 Milliseconds](https://netflixtechblog.medium.com/linux-performance-analysis-in-60-000-milliseconds-accc10403c55)
- **저자/출처:** Brendan Gregg (Netflix Performance Engineering)

### 1.1 상황

Netflix는 AWS 위에서 수천 대의 Linux 서버로 구성된 대규모 스트리밍 인프라를 운영하고 있다. 전 세계 수억 명의 사용자에게 스트리밍 서비스를 제공하는 인프라 특성상, 성능 이슈가 발생하면 사용자 경험에 직접적인 영향을 미친다. Netflix의 Performance Engineering 팀은 성능 분석 전문가 Brendan Gregg를 중심으로 대규모 인프라에서의 성능 이슈 진단 방법론을 체계화해 왔다.

프로덕션에서 성능 이슈가 보고되면, 엔지니어가 SSH로 문제 서버에 접속하여 최초 진단을 수행하는 상황이 빈번하게 발생한다. 이때 최초 60초(60,000밀리초) 이내에 문제의 방향성을 파악할 수 있으면, 이후 심층 분석에 집중할 영역을 빠르게 결정할 수 있어 전체 MTTR(Mean Time To Resolve)을 크게 단축할 수 있다.

### 1.2 문제

대규모 인프라에서 성능 저하가 발생했을 때의 주요 문제는 다음과 같다.

첫째, **진단 표준화 부재**이다. 엔지니어마다 습관적으로 사용하는 명령어와 점검 순서가 달라, 동일한 이슈에 대해서도 진단 시간에 큰 편차가 발생하였다. 어떤 엔지니어는 CPU를 먼저 보고, 어떤 엔지니어는 디스크를 먼저 보는 식으로 접근이 제각각이었다.

둘째, **병목 지점 미특정 상태에서의 삽질**이다. 성능 이슈의 원인은 CPU saturation, 메모리 부족(OOM 직전 상태), 디스크 I/O 병목, 네트워크 대역폭 포화, 커널 레벨 이슈 등 매우 다양하다. 체계적 접근 없이 무작정 조사를 시작하면, 실제 원인과 무관한 영역에 시간을 낭비하게 된다.

셋째, **리소스 간 상호 영향의 복잡성**이다. 메모리 부족이 swap을 유발하고, swap이 디스크 I/O를 증가시키며, 디스크 I/O 증가가 CPU iowait를 높이는 등 리소스 간 연쇄 반응이 발생한다. 단일 지표만 보면 근본 원인이 아닌 증상에 속을 수 있다.

### 1.3 해결: 10단계 체크리스트

Brendan Gregg가 제시한 체크리스트는 10가지 명령어를 특정 순서로 실행하는 방식이다. 각 명령어는 서로 다른 리소스 영역을 점검하며, 순서는 가장 빠르게 전체 상황을 파악할 수 있도록 설계되었다.

**1단계: `uptime`**

시스템의 load average를 확인한다. 1분, 5분, 15분 평균이 표시되며, 이 세 값의 추이를 비교하면 부하가 증가하고 있는지, 감소하고 있는지, 안정적인지를 즉시 파악할 수 있다. load average가 CPU 코어 수보다 높으면 CPU saturation이 발생하고 있다는 신호이다. 다만 load average는 CPU뿐 아니라 uninterruptible I/O(D state) 상태의 프로세스도 포함하므로, 높은 load average가 반드시 CPU 문제를 의미하지는 않는다.

**2단계: `dmesg | tail`**

커널 링 버퍼의 최근 메시지를 확인한다. OOM killer 발동, 하드웨어 에러, TCP 관련 커널 경고, 파일시스템 에러 등 커널 레벨에서 감지된 이상 징후를 빠르게 파악할 수 있다. 성능 이슈의 원인이 되는 커널 레벨 문제가 여기서 즉시 드러나는 경우가 많다.

**3단계: `vmstat 1`**

가상 메모리 통계를 1초 간격으로 표시한다. `r` 컬럼(run queue)은 CPU를 기다리는 프로세스 수로, CPU saturation의 직접적인 지표이다. `free` 컬럼은 가용 메모리, `si`/`so`는 swap in/out 횟수이다. swap이 활발하게 발생하고 있으면 메모리 부족 상태이다. `us`/`sy`/`id`/`wa` 컬럼으로 CPU 시간의 분포(user, system, idle, iowait)를 확인한다.

**4단계: `mpstat -P ALL 1`**

모든 CPU 코어의 사용률을 개별적으로 표시한다. 전체 평균은 정상이지만 특정 코어만 100%인 경우(CPU 불균형)를 감지할 수 있다. 단일 스레드 병목이나 인터럽트 편중(IRQ affinity 문제) 등을 발견하는 데 유용하다.

**5단계: `pidstat 1`**

프로세스별 CPU 사용량을 1초 간격으로 표시한다. `top`과 유사하지만 롤링 출력이므로 패턴을 관찰하기 더 용이하다. 어떤 프로세스가 CPU를 가장 많이 소비하는지, 짧은 수명의 프로세스가 반복적으로 생성/종료되는지를 확인한다.

**6단계: `iostat -xz 1`**

블록 디바이스별 확장 I/O 통계를 표시한다. `r/s`와 `w/s`는 초당 읽기/쓰기 요청 수, `await`는 평균 I/O 응답 시간(밀리초), `%util`은 디바이스 활용도이다. `await`가 비정상적으로 높거나 `%util`이 100%에 가까우면 디스크 I/O 병목이다. 다만 최신 SSD/NVMe에서는 `%util`이 내부 병렬 처리를 반영하지 못하므로 주의가 필요하다.

**7단계: `free -m`**

메모리 사용 현황을 메가바이트 단위로 표시한다. `available` 값이 핵심이며, 이 값이 매우 낮으면 메모리 부족 상태이다. Linux는 가용 메모리를 적극적으로 page cache로 사용하므로, `used`가 높은 것 자체는 정상이다. `available`이 충분한지가 실제 메모리 압박 여부를 판단하는 기준이다.

**8단계: `sar -n DEV 1`**

네트워크 인터페이스별 처리량(rxkB/s, txkB/s)과 패킷 수를 표시한다. 네트워크 대역폭이 포화 상태인지, 특정 인터페이스에 트래픽이 집중되어 있는지를 확인한다.

**9단계: `sar -n TCP,ETCP 1`**

TCP 연결 통계를 표시한다. `active/s`는 초당 새로운 아웃바운드 TCP 연결 수, `passive/s`는 초당 새로운 인바운드 TCP 연결 수, `retrans/s`는 초당 TCP 재전송 횟수이다. 재전송 비율이 높으면 네트워크 품질 문제(패킷 손실, 지연)를 의미한다.

**10단계: `top`**

마지막으로 `top`을 실행하여 전체 시스템 상태를 종합적으로 확인한다. 앞서 수집한 정보를 바탕으로 특정 프로세스나 리소스에 집중하여 관찰한다. `top`은 대화형 도구이므로 최종 확인 단계에서 사용하는 것이 적절하다.

이 체크리스트의 이론적 기반은 Brendan Gregg가 제안한 **USE Method(Utilization, Saturation, Errors)**이다. 모든 리소스에 대해 세 가지를 확인한다: 해당 리소스가 얼마나 사용되고 있는지(Utilization), 대기열이 쌓이고 있는지(Saturation), 에러가 발생하고 있는지(Errors). 이 프레임워크를 CPU, 메모리, 디스크, 네트워크 순서로 적용하면 대부분의 리소스 병목을 체계적으로 발견할 수 있다.

### 1.4 주요 교훈

Linux 성능 진단은 체계적인 순서와 프레임워크가 핵심이다. USE Method를 기반으로 CPU, 메모리, 디스크, 네트워크 순서로 리소스 병목을 확인하면, 10가지 명령어만으로도 대부분의 성능 이슈의 방향성을 60초 이내에 파악할 수 있다.

프로덕션 환경에서 이 체크리스트가 갖는 의미는 단순한 명령어 목록 이상이다. 팀 전체가 동일한 진단 절차를 공유하면 온콜 엔지니어의 숙련도에 관계없이 일관된 초기 진단 품질을 보장할 수 있고, 이는 MTTR 단축에 직결된다. 이 체크리스트를 런북(Runbook)으로 문서화하여 팀 차원에서 관리하는 것이 권장된다.

추가적으로, 이 체크리스트는 "첫 번째 단계"에 불과하다. 방향성을 파악한 후에는 `perf`, `ftrace`, `bpftrace`, `strace` 등의 심층 분석 도구로 근본 원인을 추적해야 한다. Brendan Gregg의 [Linux Performance 사이트](https://www.brendangregg.com/linuxperf.html)에서 더 깊은 분석 방법론을 참고할 수 있다.

Kubernetes 환경에서는 노드 레벨 성능 진단 시 이 체크리스트를 그대로 적용할 수 있다. `kubectl debug node/<node-name>` 명령으로 노드에 디버깅 컨테이너를 생성하고, `chroot /host`로 호스트 네임스페이스에 진입한 후 동일한 명령어를 실행하면 된다.

---

## 2. Cloudflare의 Linux 커널 소켓 메모리 문제로 인한 레이턴시 스파이크

- **출처:** [The story of one latency spike](https://blog.cloudflare.com/the-story-of-one-latency-spike/)
- **저자/출처:** Marek Majkowski (Cloudflare)

### 2.1 상황

Cloudflare는 전 세계 수백 개 PoP(Point of Presence)에서 수백만 개의 도메인에 대한 HTTP/HTTPS 트래픽을 처리하는 CDN, DDoS 방어, 보안 서비스를 운영하고 있다. 각 에지 서버는 수십만 개의 동시 TCP 연결을 유지하며, p99 레이턴시를 수 밀리초 수준으로 유지하는 것이 SLA의 핵심이다.

정상적으로 운영되던 서버에서 간헐적으로 수백 밀리초의 레이턴시 스파이크가 발생하였다. 이 스파이크는 불규칙하게 나타났으며, 발생 주기와 지속 시간도 일정하지 않았다. 기존 모니터링 지표(CPU 사용률, 메모리 사용량, 디스크 I/O)에서는 뚜렷한 이상 징후가 관찰되지 않아, 초기에는 원인 파악이 난항을 겪었다.

### 2.2 문제

이 문제의 디버깅 과정은 Linux 커널 네트워킹 스택에 대한 깊은 이해가 필요한 사례였다.

**레이턴시 스파이크의 패턴 분석:** 스파이크가 발생하는 시점에 애플리케이션 레벨 로그에는 특별한 이상이 없었다. 애플리케이션 자체의 처리 시간은 정상이었으나, 커넥션이 수립되는 시점이나 데이터 전송 시작 시점에서 지연이 발생하고 있었다. 이는 문제가 애플리케이션 레이어가 아닌 그 아래, 즉 커널의 네트워크 스택에 있을 가능성을 시사하였다.

**TCP 소켓 메모리 pressure 메커니즘:** 조사 결과, 레이턴시 스파이크의 근본 원인은 Linux 커널의 TCP 메모리 관리 메커니즘에 있었다. Linux 커널은 시스템 전체에서 TCP 소켓이 사용할 수 있는 메모리 총량을 `net.ipv4.tcp_mem` 파라미터로 제한한다. 이 파라미터는 세 개의 값(low, pressure, high)으로 구성되며, 페이지 단위로 설정된다.

TCP 소켓의 전체 메모리 사용량이 pressure 임계값을 초과하면, 커널은 `tcp_memory_pressure` 상태에 진입한다. 이 상태에서는 새로운 소켓 버퍼 할당이 제한되고, 기존 소켓의 메모리도 적극적으로 회수(reclaim)하려 한다. 이 회수 과정에서 소켓 할당이 일시적으로 차단되며, 새로운 연결 수립이나 기존 연결의 데이터 전송에 지연이 발생한다.

**기본값의 한계:** `tcp_mem`의 기본값은 시스템 부팅 시 전체 물리 메모리의 일정 비율을 기반으로 자동 계산된다. 일반적인 서버 워크로드에서는 이 기본값이 충분하지만, Cloudflare처럼 수십만 개의 동시 연결을 유지하는 서버에서는 기본값이 부족하였다. 각 TCP 소켓의 send/receive 버퍼가 메모리를 소비하며, 연결 수가 많으면 총 사용량이 pressure 임계값을 쉽게 초과하게 된다.

`ss -m` 명령으로 개별 소켓의 메모리 사용량을 확인했을 때, 소켓당 할당된 버퍼 크기가 예상보다 큰 경우가 관찰되었다. `dmesg`에서는 스파이크 발생 시점에 TCP 메모리 관련 커널 경고 메시지가 기록되어 있었으며, 이것이 결정적인 단서가 되었다.

### 2.3 해결

해결은 커널 TCP 메모리 관련 파라미터를 서버의 실제 워크로드 특성에 맞게 튜닝하는 것이었다.

**`net.ipv4.tcp_mem` 상향 조정:** pressure와 high 임계값을 서버의 물리 메모리 용량과 동시 연결 수를 고려하여 대폭 상향 조정하였다. 이를 통해 정상 운영 상태에서 pressure 상태에 진입하지 않도록 하였다.

**`net.ipv4.tcp_rmem`과 `net.ipv4.tcp_wmem` 최적화:** 이 파라미터는 개별 소켓의 수신/송신 버퍼 크기를 제어한다. 세 개의 값(min, default, max)으로 구성되며, max 값이 너무 크면 소수의 소켓이 과도한 메모리를 점유할 수 있다. 반대로 너무 작으면 대용량 전송의 처리량(throughput)이 저하된다. 워크로드 특성(대부분 짧은 HTTP 응답)을 분석하여 적절한 max 값을 설정하였다.

**모니터링 강화:** `/proc/net/sockstat`에서 TCP 소켓 메모리 사용량을 주기적으로 수집하고, pressure 임계값 대비 사용률을 모니터링하는 지표를 추가하였다. 사용률이 임계값의 80%에 도달하면 사전 경고를 발생시키도록 구성하였다.

이러한 변경은 `sysctl` 설정으로 적용하며, `/etc/sysctl.conf` 또는 `/etc/sysctl.d/` 하위에 설정 파일을 배치하여 재부팅 후에도 유지되도록 한다.

### 2.4 주요 교훈

프로덕션 레이턴시 이슈의 원인은 애플리케이션 레벨에만 존재하는 것이 아니다. Linux 커널의 네트워크 스택, 특히 TCP 메모리 관리 메커니즘은 대규모 트래픽 환경에서 반드시 이해하고 튜닝해야 하는 영역이다.

주요 파라미터 정리:

| 파라미터 | 설명 | 단위 |
|----------|------|------|
| `net.ipv4.tcp_mem` | 시스템 전체 TCP 소켓 메모리 제한 (low/pressure/high) | 페이지 |
| `net.ipv4.tcp_rmem` | 개별 소켓 수신 버퍼 크기 (min/default/max) | 바이트 |
| `net.ipv4.tcp_wmem` | 개별 소켓 송신 버퍼 크기 (min/default/max) | 바이트 |

`dmesg`에서 `TCP: out of memory` 또는 `socket memory pressure` 관련 메시지가 나타나면 이 파라미터들을 즉시 점검해야 한다. 또한 `/proc/net/sockstat`의 `TCP: mem` 값을 모니터링하면 pressure 상태 진입을 사전에 감지할 수 있다.

이 사례는 "모니터링 지표가 정상인데 성능 문제가 발생하는" 상황에서 커널 레벨 파라미터를 의심해야 한다는 교훈을 준다. Kubernetes 환경에서도 노드의 커널 파라미터는 Pod 성능에 직접적인 영향을 미치므로, DaemonSet이나 MachineConfig(OpenShift의 경우)를 통해 노드 레벨 sysctl 튜닝을 관리하는 것이 바람직하다.

---

## 3. LinkedIn의 cgroups 미관리로 인한 프로덕션 장애

- **출처:** [Don't Let Linux Control Groups Uncontrolled](https://engineering.linkedin.com/blog/2016/08/don-t-let-linux-control-groups-uncontrolled)
- **저자/출처:** Zhenyun Zhuang (LinkedIn Infrastructure)
- **참고:** LinkedIn 엔지니어링 블로그의 URL 구조가 변경된 적이 있어 접근이 불가할 수 있다. 제목으로 검색하면 원문을 찾을 수 있다.

### 3.1 상황

LinkedIn은 수천 대의 서버에서 다양한 마이크로서비스를 운영하는 대규모 인프라를 보유하고 있다. 서비스들은 동일한 물리 서버 위에서 함께 실행되며, Linux의 cgroups(Control Groups)를 통해 CPU, 메모리, I/O 등의 리소스를 서비스별로 격리하고 있었다. systemd가 서비스 관리자로 사용되었으며, systemd는 각 서비스 유닛을 자동으로 cgroup 계층 구조에 배치하여 관리한다.

서버가 오래 운영되면서(수주~수개월), 특정 서비스의 성능이 간헐적으로 급격히 저하되는 현상이 보고되기 시작하였다. 이 문제는 새로 프로비저닝된 서버에서는 발생하지 않고, 오래 운영된 서버에서만 나타나는 특성이 있었다.

### 3.2 문제

원인은 cgroup 계층 구조의 비정상적인 성장과 "zombie cgroup"의 누적에 있었다.

**cgroup 계층 구조의 비대화:** systemd는 서비스가 시작될 때 cgroup을 생성하고, 서비스가 종료될 때 cgroup을 삭제한다. 그러나 실제로는 cgroup 삭제가 항상 깨끗하게 이루어지지 않는 경우가 있었다. 서비스가 비정상 종료되거나, cgroup 내부에 하위 cgroup이 남아 있거나, 커널 내부에서 cgroup에 대한 참조가 남아 있는 경우 cgroup 디렉토리가 삭제되지 않고 남게 된다. 이러한 빈 cgroup 디렉토리가 시간이 지남에 따라 수천 개까지 누적되었다.

**zombie cgroup 문제:** 특히 메모리 cgroup에서 심각한 문제가 발생하였다. 메모리 cgroup이 삭제되더라도, 해당 cgroup에 속했던 메모리 페이지가 page cache에 남아 있으면 커널 내부에서 cgroup 구조체가 완전히 해제되지 않는다. 이를 "zombie cgroup"이라 한다. 외부에서 보면 cgroup 디렉토리가 삭제된 것처럼 보이지만, 커널 내부적으로는 메모리 통계 집계 등을 위해 cgroup 구조가 유지되고 있다.

**성능 영향:** cgroup 수가 수천 개로 증가하면 다음과 같은 성능 영향이 발생한다.

- 새로운 cgroup 생성/삭제 시 커널이 전체 cgroup 트리를 순회해야 하므로 지연이 증가한다.
- 메모리 통계 집계(`memory.stat` 읽기)가 모든 하위 cgroup을 재귀적으로 순회하므로 극도로 느려진다. 모니터링 에이전트가 이 파일을 주기적으로 읽는 경우 CPU 사용량이 급증한다.
- cgroup 관련 커널 락(lock) 경합이 증가하여 전체 시스템 성능이 저하된다.
- OOM killer가 발동할 때 cgroup 계층을 순회하는 데 매우 오랜 시간이 소요되어, OOM 처리 자체가 지연된다.

### 3.3 해결

LinkedIn은 다층적인 해결 방안을 적용하였다.

**즉각적 대응 - cgroup 정리 자동화:** 비어 있는 cgroup 디렉토리를 주기적으로 탐지하고 삭제하는 정리 스크립트를 작성하여 cron job으로 등록하였다. `/sys/fs/cgroup/` 하위의 각 서브시스템(memory, cpu, blkio 등)에서 프로세스가 하나도 없고 하위 cgroup도 없는 빈 디렉토리를 삭제하는 방식이다.

**메모리 cgroup 강제 정리:** 메모리 cgroup 삭제 전에 `memory.force_empty`를 활용하여 해당 cgroup에 속한 메모리 페이지를 상위 cgroup으로 강제 이동(charge migration)시키는 절차를 추가하였다. 이를 통해 zombie cgroup의 발생을 줄일 수 있다.

**systemd 설정 최적화:** `Delegate=` 옵션을 활용하여 서비스별 cgroup 관리 권한을 명확히 위임하고, 불필요한 중첩 계층 생성을 제한하였다. 서비스 유닛 파일에서 cgroup 구성을 명시적으로 관리하여 의도하지 않은 cgroup 생성을 방지하였다.

**모니터링 추가:** cgroup 수를 추적하는 커스텀 메트릭을 모니터링 시스템에 추가하여, 특정 서버의 cgroup 수가 임계값을 초과하면 경고 알림이 발생하도록 구성하였다.

### 3.4 주요 교훈

cgroups는 Linux 컨테이너 격리의 핵심 메커니즘이지만, 능동적으로 관리하지 않으면 오히려 성능 문제의 원인이 된다. 이 교훈은 Kubernetes 환경에서 더욱 중요하다.

Kubernetes에서는 Pod가 빈번하게 생성/삭제되므로, cgroup도 동일한 빈도로 생성/삭제된다. 특히 CrashLoopBackOff 상태의 Pod나, 빈번한 배포(Rolling Update)를 수행하는 서비스가 있는 노드에서는 zombie cgroup이 빠르게 누적될 수 있다. kubelet은 cgroup을 관리하지만, zombie cgroup의 완전한 정리까지는 보장하지 않는다.

점검 방법:

- `/sys/fs/cgroup/memory/` 하위의 디렉토리 수를 확인한다.
- `cat /proc/cgroups`의 `num_cgroups` 컬럼을 확인한다. 수천 개 이상이면 주의가 필요하다.
- cgroup v2 환경에서는 `cat /sys/fs/cgroup/cgroup.stat`에서 `dying_descendants` 수를 확인한다.

cgroup v2로의 전환도 이 문제 완화에 도움이 된다. cgroup v2는 단일 통합 계층 구조를 사용하므로 관리가 단순해지고, zombie cgroup 처리도 개선되었다.

---

## 4. Sentry의 inode 고갈로 인한 디스크 full 장애

- **출처:** [Filesystem inodes: what they are and how they can cause issues](https://www.ctrl.blog/entry/how-to-all-out-of-inodes.html)
- **저자/출처:** Sentry Infrastructure Team

### 4.1 상황

Sentry는 소프트웨어 에러 트래킹 및 성능 모니터링 서비스를 운영하며, 수많은 애플리케이션에서 발생하는 에러 이벤트, 스택 트레이스, 성능 데이터를 실시간으로 수집하고 저장한다. 이 과정에서 대량의 로그 파일, 임시 파일, 캐시 파일이 디스크에 생성된다.

특정 프로덕션 서버에서 파일 생성이 실패하는 장애가 발생하였다. 애플리케이션에서 `No space left on device` 에러가 발생하였으나, `df -h` 명령으로 확인한 디스크 용량은 충분히 남아 있었다. 디스크 사용률이 50% 미만이었음에도 파일을 생성할 수 없는 상황이었다.

### 4.2 문제

**inode의 개념과 역할:** Linux 파일시스템에서 모든 파일과 디렉토리는 inode(index node)라는 데이터 구조를 갖는다. inode에는 파일의 메타데이터(소유자, 권한, 타임스탬프, 데이터 블록 포인터 등)가 저장되며, 파일명은 디렉토리 엔트리에서 inode 번호와 매핑되는 방식으로 관리된다. 즉, 파일 하나를 생성하려면 데이터 저장 공간(블록)과 inode가 모두 필요하다.

**inode 고갈 발생:** `df -i` 명령으로 확인한 결과, inode 사용률이 100%에 도달한 상태였다. 디스크 용량(블록)은 남아 있었지만, 할당 가능한 inode가 모두 소진되어 더 이상 새로운 파일을 생성할 수 없었다.

**원인 분석:** inode 고갈의 원인은 크기가 매우 작은(수 바이트~수 KB) 파일이 수백만 개 누적된 것이었다. 구체적으로는 다음과 같은 유형의 파일들이 원인이었다:

- 애플리케이션이 생성하는 임시 파일: 이벤트 처리 과정에서 생성되는 임시 파일이 정리되지 않고 누적되었다.
- 로그 파일: 세분화된 로그 파일이 개별 파일로 생성되어 대량으로 쌓였다.
- 캐시 파일: 파일 기반 캐시 시스템에서 캐시 엔트리 하나당 파일 하나를 생성하는 패턴이 사용되었다.

각 파일의 크기는 매우 작았기 때문에 디스크 용량 관점에서는 소비하는 공간이 미미하였으나, 파일 하나당 inode 하나를 소비하므로 inode가 먼저 고갈되었다.

**ext4의 구조적 제약:** ext4 파일시스템에서 inode 수는 파일시스템 생성 시점(`mkfs.ext4`)에 결정되며, 생성 이후에는 동적으로 늘릴 수 없다. `mkfs.ext4`의 기본 설정은 일반적인 파일 크기 분포를 가정하여 적절한 inode 밀도를 계산하는데, 매우 작은 파일이 대량으로 생성되는 워크로드에서는 이 기본값이 부족하게 된다.

### 4.3 해결

**즉각적 대응 - 파일 정리:** `find` 명령을 사용하여 불필요한 임시 파일과 오래된 로그 파일을 식별하고 삭제하여 inode를 회수하였다. 파일 수가 매우 많은 디렉토리에서는 `ls` 명령이 응답하지 않을 수 있으므로, `find` 또는 `ls -f`를 사용해야 한다. 대량 삭제 시 `find ... -delete`를 사용하되, 한 번에 너무 많은 파일을 삭제하면 I/O 부하가 발생할 수 있으므로 `ionice`와 함께 사용하거나 배치로 나누어 삭제하는 것이 좋다.

**logrotate 설정 강화:** 로그 파일의 최대 보관 수를 엄격하게 제한하고, 보관 기한이 지난 로그를 자동 삭제하도록 `logrotate` 설정을 강화하였다. `maxsize`와 `rotate` 옵션을 조합하여 로그 파일 수의 상한을 명확히 설정하였다.

**임시 파일 관리 개선:** 임시 파일을 생성하는 애플리케이션 로직을 수정하여, 사용 후 즉시 삭제하도록 변경하였다. `tmpwatch` 또는 `systemd-tmpfiles`를 활용하여 `/tmp` 및 애플리케이션 임시 디렉토리의 오래된 파일을 주기적으로 정리하는 자동화를 구성하였다.

**모니터링 추가:** 디스크 용량(`df -h`)과 함께 inode 사용률(`df -i`)을 모니터링 지표에 추가하였다. inode 사용률이 80%를 초과하면 경고(warning), 90%를 초과하면 위험(critical) 알림을 발생시키도록 구성하였다. Prometheus 환경에서는 `node_filesystem_files_free` 및 `node_filesystem_files` 메트릭을 활용하여 inode 고갈을 사전에 감지할 수 있다.

**파일시스템 선택 검토:** 향후 서버 프로비저닝 시 XFS 파일시스템의 사용을 검토하였다. XFS는 inode를 동적으로 할당할 수 있어 이러한 유형의 문제에 더 유연하게 대응할 수 있다. XFS에서는 사용 가능한 디스크 공간이 있는 한 inode도 할당할 수 있으므로, inode만 먼저 고갈되는 상황이 발생하지 않는다.

### 4.4 주요 교훈

디스크 모니터링에서 가장 흔한 실수는 용량(`df -h`)만 모니터링하고 inode(`df -i`)를 간과하는 것이다. 소규모 파일이 대량으로 생성되는 워크로드에서는 inode 고갈이 디스크 용량보다 먼저 발생할 수 있으며, 증상은 동일하게 `No space left on device` 에러로 나타나기 때문에 혼란을 야기한다.

Kubernetes 환경에서 inode 고갈은 더 빈번하게 발생할 수 있다:

- 컨테이너 로그 파일: kubelet이 관리하는 컨테이너 로그 파일이 노드에 쌓인다.
- emptyDir 볼륨: Pod 내 임시 데이터가 노드의 파일시스템에 저장된다.
- 이미지 레이어: 컨테이너 이미지의 레이어 파일이 노드에 캐시된다.
- ConfigMap/Secret 마운트: 각 마운트 시 심볼릭 링크와 파일이 생성된다.

kubelet은 `imageGCHighThresholdPercent`와 `evictionHard` 설정으로 디스크 용량을 관리하지만, inode 기반 eviction도 별도로 설정해야 한다. `evictionHard`에 `nodefs.inodesFree`를 추가하면 inode 고갈 시 Pod eviction이 자동으로 수행된다.

파일시스템 생성 시 `mkfs.ext4 -i <bytes-per-inode>` 옵션으로 inode 밀도를 높게 설정하거나, XFS를 사용하는 것이 근본적인 예방 방법이다.

---

## 5. Uber의 좀비 프로세스 및 PID 고갈 장애

- **출처:** [Debugging a Production Issue with PID Exhaustion](https://www.uber.com/blog/debugging-pid-exhaustion/)
- **저자/출처:** Uber Infrastructure Team

### 5.1 상황

Uber는 대규모 마이크로서비스 아키텍처를 운영하고 있으며, 실시간 라이드 매칭, 결제 처리, 지도 데이터 처리 등 다양한 서비스가 상호작용한다. 일부 서비스는 작업 처리를 위해 자식 프로세스를 `fork()`하여 병렬로 작업을 수행하는 패턴을 사용하고 있었다.

특정 프로덕션 호스트에서 갑작스럽게 모든 서비스가 새로운 프로세스를 생성할 수 없다는 에러와 함께 중단되었다. `fork()` 시스템 콜이 `EAGAIN` 에러를 반환하였고, 사용자 세션에서는 `fork: retry: Resource temporarily unavailable` 메시지가 표시되었다. SSH 접속조차 불가능한 상태가 되어 원격 진단이 어려웠다.

### 5.2 문제

**PID 고갈 현상:** 조사 결과, 시스템의 PID 공간이 완전히 소진된 상태였다. Linux에서는 `kernel.pid_max` 파라미터로 시스템에서 할당 가능한 최대 PID 수를 제한하며, 기본값은 32768이다. 모든 PID가 사용 중이면 새로운 프로세스를 생성할 수 없으며, 이는 시스템 전체에 영향을 미치는 전역 장애가 된다.

**좀비 프로세스의 누적:** `ps aux` 출력을 분석하면 `STAT` 컬럼이 `Z`(zombie)인 프로세스가 수만 개 존재하고 있었다. 좀비(zombie) 프로세스란, 실행이 완료되어 종료되었지만 부모 프로세스가 종료 상태를 수거(reap)하지 않아 프로세스 테이블에 남아 있는 프로세스를 말한다.

**좀비 프로세스의 발생 메커니즘:** Unix/Linux에서 프로세스가 종료되면, 커널은 종료 코드(exit status)를 프로세스 테이블에 보존하고, 부모 프로세스에게 `SIGCHLD` 시그널을 보내 자식의 종료를 알린다. 부모 프로세스는 `wait()` 또는 `waitpid()` 시스템 콜을 호출하여 자식의 종료 코드를 수거해야 한다. 이 수거가 이루어지면 커널은 프로세스 테이블 엔트리를 완전히 제거한다.

문제의 서비스 코드에서는 `fork()` 후 자식 프로세스의 종료 상태를 수거하지 않는 버그가 있었다. 자식 프로세스는 작업을 완료하고 종료되었지만, 부모 프로세스가 `SIGCHLD` 시그널을 적절히 처리하지 않고 `waitpid()`도 호출하지 않았다. 그 결과 자식 프로세스들이 좀비 상태로 계속 남게 되었고, 각 좀비가 하나의 PID를 점유하므로 시간이 지남에 따라 가용 PID가 고갈되었다.

**좀비 프로세스의 특성:** 좀비 프로세스는 이미 종료된 상태이므로 CPU나 메모리를 소비하지 않는다. 따라서 CPU/메모리 사용률 기반의 일반적인 모니터링으로는 이 문제를 감지할 수 없다. 좀비가 점유하는 것은 PID(프로세스 테이블의 슬롯)뿐이지만, PID 공간은 유한하므로 누적되면 시스템 전체를 마비시킬 수 있다.

### 5.3 해결

**즉각적 대응 - 좀비 수거:** 좀비 프로세스 자체는 이미 종료된 상태이므로 `kill` 명령으로 직접 제거할 수 없다. 좀비를 수거하려면 부모 프로세스가 `wait()`를 호출해야 한다. 가장 빠른 해결 방법은 좀비의 부모 프로세스를 종료하는 것이다. 부모가 종료되면, 좀비 프로세스들은 init 프로세스(PID 1)에게 재부모(reparent)된다. init 프로세스는 기본적으로 고아 프로세스를 `wait()`하여 수거하는 역할을 수행하므로, 좀비가 자동으로 정리된다.

```bash
# 좀비 프로세스의 부모 PID 확인
ps -eo pid,ppid,stat,comm | awk '$3 ~ /Z/ {print $2}' | sort -u
# 해당 부모 프로세스를 종료하여 좀비 수거 유도
kill <parent_pid>
```

**근본 수정 - 코드 레벨 버그 수정:** 서비스 코드에 `SIGCHLD` 시그널 핸들러를 등록하여, 자식 프로세스가 종료될 때마다 즉시 `waitpid(-1, &status, WNOHANG)`을 호출하도록 변경하였다. `WNOHANG` 플래그를 사용하면 수거할 자식이 없는 경우 블로킹 없이 즉시 리턴하므로, 여러 자식이 동시에 종료되는 상황에서도 안전하다.

대안으로, `SIGCHLD` 시그널의 핸들러를 `SIG_IGN`으로 설정하면 커널이 자식 프로세스 종료 시 자동으로 수거하도록 할 수도 있다. 다만 이 경우 자식의 종료 코드를 확인할 수 없으므로, 종료 코드가 필요한 경우에는 명시적인 `waitpid()` 호출이 더 적절하다.

**PID 공간 확장:** `kernel.pid_max` 값을 기본값인 32768에서 적절히 상향 조정(예: 65536 또는 그 이상)하여 PID 고갈에 대한 여유를 확보하였다. 이는 근본 해결이 아닌 완화 조치이지만, 다른 유형의 PID 누수에 대한 버퍼 역할을 한다.

```bash
# 현재 PID 최대값 확인
cat /proc/sys/kernel/pid_max
# PID 최대값 상향 (런타임)
sysctl -w kernel.pid_max=65536
# 영구 적용
echo "kernel.pid_max = 65536" >> /etc/sysctl.d/99-pid-max.conf
```

**모니터링 추가:** 좀비 프로세스 수를 모니터링하는 지표를 추가하였다. Prometheus의 `node_processes_state` 메트릭이나 커스텀 스크립트로 좀비 수를 추적하고, 임계값 초과 시 경고 알림을 발생시키도록 구성하였다. 또한 `/proc/sys/kernel/pid_max` 대비 현재 사용 중인 프로세스 수 비율도 모니터링하여 PID 고갈을 사전에 감지할 수 있도록 하였다.

### 5.4 주요 교훈

좀비 프로세스 자체는 CPU나 메모리를 소비하지 않지만, PID 공간은 유한한 시스템 리소스이므로 좀비가 누적되면 시스템 전체를 마비시키는 전역 장애를 유발할 수 있다. `fork()`를 사용하는 모든 코드에서는 반드시 자식 프로세스의 종료 상태를 수거하는 로직이 포함되어야 한다.

Kubernetes 환경에서 이 문제는 더 세밀하게 고려해야 한다:

**컨테이너의 PID 1 문제:** 컨테이너 내부에서 애플리케이션이 PID 1로 실행되는 경우, 해당 애플리케이션이 init 프로세스의 역할(고아 프로세스 수거)을 수행하지 못하면 좀비가 누적될 수 있다. 이를 방지하기 위해 `tini`나 `dumb-init` 같은 경량 init 프로세스를 PID 1로 사용하는 것이 권장된다. Kubernetes 1.28 이상에서는 `shareProcessNamespace: true`를 Pod spec에 설정하면 pause 컨테이너가 PID 1 역할을 하며 좀비를 수거해 준다.

**PID 기반 리소스 제한:** Kubernetes에서는 `pids.max`를 cgroup 레벨로 설정하여 컨테이너/Pod별 최대 PID 수를 제한할 수 있다. kubelet의 `--pod-max-pids` 플래그를 통해 Pod당 PID 상한을 설정하면, 하나의 Pod에서 PID를 과도하게 소비하여 노드 전체에 영향을 미치는 것을 방지할 수 있다.

**모니터링 필수 지표:**

- 노드 레벨 좀비 프로세스 수
- 노드 레벨 전체 프로세스/스레드 수 vs `pid_max`
- Pod/컨테이너 레벨 PID 사용 수 (cgroup `pids.current`)

---

## 요약: Linux 프로덕션 운영 주요 체크리스트

| 영역 | 점검 항목 | 주요 명령어 |
|------|-----------|-------------|
| 성능 진단 | CPU, 메모리, I/O, 네트워크 병목 | `uptime`, `vmstat`, `iostat`, `sar` |
| 커널 튜닝 | TCP 메모리, 소켓 버퍼, conntrack | `sysctl -a`, `ss -m`, `dmesg` |
| cgroups | zombie cgroup 누적, 메모리 pressure | `/sys/fs/cgroup/` 하위 디렉토리 수 확인 |
| 파일시스템 | 디스크 용량 + inode 사용률 | `df -h`, `df -i`, `lsof` |
| 프로세스 | 좀비 프로세스, PID 고갈 | `ps aux`, `/proc/sys/kernel/pid_max` |

---

## 참고 자료

- [Linux Performance (Brendan Gregg)](https://www.brendangregg.com/linuxperf.html) - Linux 성능 분석 종합 자료
- [The USE Method](https://www.brendangregg.com/usemethod.html) - Utilization, Saturation, Errors 기반 성능 분석 프레임워크
- [Linux Kernel Documentation](https://www.kernel.org/doc/html/latest/) - Linux 커널 공식 문서
- [Red Hat Performance Tuning Guide](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/8/html/monitoring_and_managing_system_status_and_performance/) - RHEL 성능 튜닝 가이드
