---
title: "보안 기본기 - 대칭키, 비대칭키, SSH, TLS, mTLS, PKI, DevSecOps"
date: 2026-04-01
categories: [DevOps, Security]
tags: [security, devsecops, ssh, tls, mtls, pki, pem, crt, key, authorized_keys, known_hosts, secrets, iam, zero-trust, encryption, aes, rsa, ecdsa, diffie-hellman, shift-left, sbom, opa]
layout: post
toc: true
mermaid: true
---

## 1. 먼저 잡아야 하는 기본 개념

보안 파일 형식과 프로토콜을 이해하려면 아래 개념부터 분리해서 보는 것이 좋다.

### 1.1 비밀(secret)과 비밀이 아닌 것

- **개인키(private key)**, 비밀번호, 토큰은 비밀이다.
- **공개키(public key)**, 서버 인증서(certificate), CA 인증서는 일반적으로 비밀이 아니다.
- 다만 "비밀이 아니다"와 "아무렇게나 관리해도 된다"는 다르다. 공개 정보라도 무결성 보호는 필요하다.

예를 들어 TLS 서버 인증서는 공개되어야 하므로 브라우저가 받아서 검증할 수 있다. 반면 그 인증서에 대응하는 **개인키**는 외부에 노출되면 안 된다.

### 1.2 대칭키(Symmetric Key) 암호화

암호화와 복호화에 **같은 키**를 쓴다. 빠르다. 대량 데이터 암호화에 적합하다.

```mermaid
flowchart LR
    P["평문(plaintext)"] -->|"키 K로 암호화"| C["암호문(ciphertext)"]
    C -->|"같은 키 K로 복호화"| P2["평문(plaintext)"]
```

#### AES(Advanced Encryption Standard) 동작 원리

가장 널리 쓰이는 대칭키 알고리즘이다. NIST가 2001년 표준으로 선정했다. [NIST FIPS 197](https://csrc.nist.gov/pubs/fips/197/final)

AES는 **블록 암호(block cipher)**다. 평문을 128비트(16바이트) 블록 단위로 나누고, 각 블록에 여러 라운드의 치환(substitution)과 확산(diffusion) 변환을 반복 적용한다. 키 길이에 따라 AES-128(10라운드), AES-192(12라운드), AES-256(14라운드)으로 나뉜다.

실무에서 중요한 것은 내부 라운드 구조보다 **어떤 키 길이와 운용 모드를 선택하느냐**다.

#### 블록 암호 운용 모드

AES 자체는 128비트 블록 하나만 처리한다. 실제 데이터는 이보다 크므로 **운용 모드(mode of operation)**가 필요하다.

| 모드 | 동작 | 실무 사용 |
|------|------|-----------|
| **CBC** (Cipher Block Chaining) | 이전 암호문 블록을 다음 블록 입력에 XOR. IV(초기화 벡터) 필요 | TLS 1.2에서 사용됐으나 padding oracle 공격에 취약. TLS 1.3에서 제거됨 |
| **CTR** (Counter) | 카운터 값을 암호화한 뒤 평문과 XOR. 병렬 처리 가능 | GCM의 기반 모드 |
| **GCM** (Galois/Counter Mode) | CTR 모드 + GMAC 인증 태그. **AEAD** 방식 | TLS 1.2/1.3에서 권장. 암호화와 무결성을 동시 제공 |

**AEAD(Authenticated Encryption with Associated Data)**는 암호화와 무결성 검증을 하나의 연산으로 처리한다. GCM은 대표적인 AEAD 모드다.

```mermaid
flowchart LR
    subgraph "AES-GCM"
        P["평문"] --> ENC["AES-CTR 암호화"]
        ENC --> C["암호문"]
        C --> GMAC["GMAC 계산"]
        AAD["부가 인증 데이터<br/>(헤더 등)"] --> GMAC
        GMAC --> T["인증 태그<br/>(16바이트)"]
    end
```

수신자는 인증 태그를 먼저 검증하고, 통과해야만 복호화를 진행한다. 태그가 불일치하면 암호문이 변조된 것이므로 복호화를 거부한다.

TLS 1.3은 **AEAD만 허용**한다. CBC 등 비인증 모드는 완전히 제거됐다. TLS 1.3 RFC는 `TLS_AES_128_GCM_SHA256`과 `TLS_AES_256_GCM_SHA384` 등 AEAD 기반 cipher suite만을 정의한다. [RFC 8446 Section 9.1](https://www.rfc-editor.org/rfc/rfc8446#section-9.1)

**대칭키의 근본적 약점은 키 배포 문제**다. 통신 상대에게 비밀키를 안전하게 전달하려면 이미 안전한 채널이 있어야 한다. 이 닭과 달걀 문제를 해결하는 것이 비대칭키와 키 교환 알고리즘이다.

### 1.3 비대칭키(Asymmetric Key) 암호화

공개키(public key)와 개인키(private key)라는 **수학적으로 연결된 두 키**를 사용한다.

- 공개키로 암호화한 것은 **개인키로만** 복호화할 수 있다
- 개인키로 서명한 것은 **공개키로만** 검증할 수 있다

```mermaid
flowchart TB
    subgraph "암호화 (기밀성)"
        P1["평문"] -->|"수신자의 공개키로 암호화"| C1["암호문"]
        C1 -->|"수신자의 개인키로 복호화"| P1R["평문"]
    end
    subgraph "전자서명 (인증+무결성)"
        M["메시지"] -->|"송신자의 개인키로 서명"| S["서명값"]
        S -->|"송신자의 공개키로 검증"| V["검증 성공/실패"]
    end
```

#### 실무에서 비대칭키가 쓰이는 구체적 사례

위 다이어그램만 보면 "그래서 언제 쓰는 건데?"라는 의문이 생길 수 있다. 실무에서 비대칭키는 매일, 거의 모든 곳에서 쓰이고 있다. 직접 의식하지 못할 뿐이다. 아래 5가지 사례를 통해 비대칭키의 두 가지 용도(암호화/서명)가 각각 어디에 쓰이는지 구체적으로 본다.

---

**사례 1: `ssh user@server` — 서버 접속할 때마다 일어나는 일**

DevOps 엔지니어가 매일 하는 SSH 접속. 이 한 번의 접속에 비대칭키가 **두 번** 쓰인다.

```mermaid
sequenceDiagram
    participant Me as 내 맥북<br/>(~/.ssh/id_ed25519)
    participant Srv as 운영 서버<br/>(/etc/ssh/ssh_host_ed25519_key)

    Note over Me,Srv: [1단계] 서버 인증 - "이 서버가 진짜 맞나?"
    Me->>Srv: TCP 연결 + 키 교환 시작
    Srv->>Me: 서버의 host 공개키 + 교환 해시에 대한 서명
    Me->>Me: 서버의 공개키가 known_hosts에 있는지 확인
    Me->>Me: 서명을 서버 공개키로 검증 ✓
    Note over Me: 비대칭키 용도: 전자서명 (서버가 개인키로 서명 → 내가 공개키로 검증)

    Note over Me,Srv: [2단계] 키 교환 - ECDH로 대칭키 합의
    Note over Me,Srv: (이 부분은 DH 키 교환 — 아래 별도 설명)

    Note over Me,Srv: [3단계] 사용자 인증 - "내가 접속 권한이 있는 사람 맞다"
    Me->>Srv: "이 공개키로 로그인하겠다" + 세션ID를 개인키로 서명
    Srv->>Srv: authorized_keys에서 공개키 찾기
    Srv->>Srv: 서명을 내 공개키로 검증 ✓
    Srv->>Me: 인증 성공
    Note over Me: 비대칭키 용도: 전자서명 (내가 개인키로 서명 → 서버가 공개키로 검증)
```

정리하면:

| 단계 | 누가 서명하나 | 누가 검증하나 | 목적 |
|------|-------------|-------------|------|
| 서버 인증 | 서버 (host 개인키) | 내 맥북 (host 공개키 = known_hosts) | "이 서버가 가짜가 아닌지" |
| 사용자 인증 | 내 맥북 (id_ed25519) | 서버 (id_ed25519.pub = authorized_keys) | "이 사람이 접속 권한이 있는지" |

**핵심:** SSH에서 비대칭키는 **"암호화"가 아니라 "서명"**으로 쓰인다. 데이터 암호화는 키 교환 후 만들어진 대칭키(AES)가 한다.

---

**사례 2: `https://api.example.com` — 브라우저/curl이 API 서버에 접속할 때**

HTTPS 접속 = TLS 핸드셰이크. 여기서도 비대칭키가 두 가지 역할을 한다.

```mermaid
sequenceDiagram
    participant B as 브라우저/curl
    participant S as API 서버<br/>(server.key + server.crt)

    Note over B,S: [1] 키 교환 (ECDHE) — 비대칭키 용도: 키 합의
    B->>S: ClientHello + 내 ECDH 공개값
    S->>B: ServerHello + 서버 ECDH 공개값
    Note over B,S: 양쪽이 ECDH로 공유 비밀 계산<br/>(이 공유 비밀로 대칭키 도출)

    Note over B,S: [2] 서버 인증서 전송
    S->>B: Certificate (server.crt = 공개키 + CA 서명)
    Note over B: "이 인증서의 공개키가 api.example.com의 것이 맞는지"<br/>CA 서명을 CA 공개키로 검증 ✓<br/>→ 비대칭키 용도: 전자서명 검증

    Note over B,S: [3] 서버가 개인키 소유를 증명
    S->>B: CertificateVerify = 핸드셰이크 내용 전체를 server.key로 서명
    B->>B: 이 서명을 server.crt의 공개키로 검증 ✓
    Note over B: "이 서버가 인증서에 적힌 개인키를 정말 갖고 있다"<br/>→ 비대칭키 용도: 전자서명

    Note over B,S: [4] 이후 모든 데이터는 대칭키(AES-256-GCM)로 암호화
    B->>S: 암호화된 HTTP 요청
    S->>B: 암호화된 HTTP 응답
```

여기서 비대칭키의 역할 3가지:

| 역할 | 구체적 동작 | 비대칭키 용도 |
|------|-----------|-------------|
| 키 교환 | ECDH로 양쪽이 공유 비밀 합의 | 키 합의 (DH) |
| 인증서 검증 | CA가 server.crt에 해 둔 서명을 CA 공개키로 검증 | 전자서명 검증 |
| 서버 신원 증명 | 서버가 핸드셰이크를 server.key로 서명 | 전자서명 |

**핵심:** TLS에서도 비대칭키는 **"누구인지 확인"**과 **"대칭키를 안전하게 합의"**하는 데만 쓰인다. 실제 HTTP 요청/응답 데이터 암호화는 대칭키(AES)가 한다.

---

**사례 3: Let's Encrypt 인증서 발급 — `certbot certonly`**

인증서를 발급받을 때 비대칭키가 어떤 역할을 하는지 풀어보면:

```mermaid
sequenceDiagram
    participant Ops as DevOps 엔지니어<br/>(certbot)
    participant LE as Let's Encrypt CA

    Note over Ops: [준비] 비대칭 키쌍 생성
    Ops->>Ops: openssl genrsa → server.key (개인키)
    Ops->>Ops: server.key에서 공개키 추출

    Note over Ops,LE: [1] CSR 생성 — "이 공개키에 대한 인증서를 발급해주세요"
    Ops->>Ops: CSR 생성: 공개키 + 도메인명 + 조직명
    Ops->>Ops: CSR 전체를 server.key(개인키)로 서명
    Note over Ops: → 비대칭키 용도: 전자서명<br/>"이 CSR을 만든 사람이 개인키를 갖고 있다"는 증명
    Ops->>LE: CSR 제출

    Note over Ops,LE: [2] 도메인 소유권 검증 (ACME 챌린지)
    LE->>Ops: "이 토큰을 .well-known/acme-challenge/에 올려라"
    Ops->>Ops: 토큰 배치
    LE->>Ops: HTTP로 토큰 확인 ✓

    Note over Ops,LE: [3] 인증서 발급
    LE->>LE: CSR의 공개키 + 도메인명으로 인증서 생성
    LE->>LE: Let's Encrypt 개인키로 인증서에 서명
    Note over LE: → 비대칭키 용도: 전자서명<br/>"이 공개키가 이 도메인의 것이다"라는 CA의 보증
    LE->>Ops: server.crt (서명된 인증서)
```

결과물:

```text
server.key  → 내 개인키 (절대 비밀)
server.crt  → CA가 서명한 인증서 (공개키 + CA 서명 포함)
```

이제 이 두 파일을 Nginx/Kong에 설정하면, 사례 2의 TLS 핸드셰이크가 가능해진다.

**핵심:** 인증서 발급 과정에서 비대칭키는 **"이 사람이 개인키를 정말 갖고 있다"**(CSR 서명)와 **"이 공개키가 이 도메인의 것이다"**(CA 서명) 두 가지를 증명하는 데 쓰인다.

---

**사례 4: Git 커밋 서명 — `git commit -S`**

오픈소스 기여나 보안이 중요한 프로젝트에서는 커밋에 서명을 한다.

```text
$ git log --show-signature
commit a1b2c3d
gpg: Signature made Wed Apr 01 10:00:00 2026 KST
gpg: using EDDSA key ABC123...
gpg: Good signature from "Kim Dohyeon <kim@example.com>"
```

동작 과정:

1. 커밋 내용(트리 해시, 부모 해시, 커밋 메시지 등)을 **내 GPG/SSH 개인키로 서명**한다
2. 서명값이 커밋 객체에 포함된다
3. 다른 사람이 **내 공개키로 서명을 검증**한다 → "이 커밋을 정말 이 사람이 만들었다"

| 행위 | 사용하는 키 | 비대칭키 용도 |
|------|-----------|-------------|
| 커밋 서명 | 내 개인키 | 전자서명 (부인 방지 + 무결성) |
| 커밋 검증 | 내 공개키 | 서명 검증 |

GitHub에서 커밋에 "Verified" 배지가 붙는 것이 바로 이 서명이 검증됐다는 의미다. Kubernetes 오픈소스 기여 시 DCO(Developer Certificate of Origin) 서명도 같은 원리다.

---

**사례 5: 컨테이너 이미지 서명 — `cosign sign`**

Harbor나 ECR에 푸시한 이미지가 **변조되지 않았음**을 보장하는 데도 비대칭키가 쓰인다.

```bash
# 서명 (CI/CD 파이프라인에서)
cosign sign --key cosign.key registry.example.com/app:v1.2.3

# 검증 (배포 시 admission webhook에서)
cosign verify --key cosign.pub registry.example.com/app:v1.2.3
```

```mermaid
flowchart LR
    subgraph "CI/CD (빌드 서버)"
        A["이미지 빌드"] --> B["이미지 다이제스트 계산"]
        B --> C["다이제스트를 cosign.key(개인키)로 서명"]
        C --> D["이미지 + 서명을 레지스트리에 푸시"]
    end
    subgraph "K8s (배포 시)"
        E["이미지 Pull 요청"] --> F["Admission Webhook이<br/>cosign.pub(공개키)로 서명 검증"]
        F -->|"검증 성공"| G["배포 허용"]
        F -->|"검증 실패"| H["배포 거부"]
    end
```

| 행위 | 사용하는 키 | 비대칭키 용도 |
|------|-----------|-------------|
| 이미지 서명 | cosign.key (개인키) | 전자서명 ("이 이미지를 우리 파이프라인이 빌드했다") |
| 이미지 검증 | cosign.pub (공개키) | 서명 검증 ("변조되지 않은 원본인가") |

**핵심:** 공급망 보안의 핵심이 바로 비대칭키 서명이다. "이 아티팩트가 어디서 왔고, 중간에 변조되지 않았는가"를 증명한다.

---

**5가지 사례를 관통하는 패턴 정리:**

결국 비대칭키는 실무에서 **딱 세 가지 용도**로 쓰인다:

```mermaid
flowchart TB
    A["비대칭키의 실무 용도"] --> B["1. 전자서명<br/>(가장 흔함)"]
    A --> C["2. 키 교환/합의<br/>(DH/ECDH)"]
    A --> D["3. 직접 암호화<br/>(거의 안 씀)"]

    B --> B1["SSH 서버/사용자 인증"]
    B --> B2["TLS CertificateVerify"]
    B --> B3["인증서 발급 (CA 서명)"]
    B --> B4["Git 커밋 서명"]
    B --> B5["이미지/아티팩트 서명"]

    C --> C1["TLS ECDHE 핸드셰이크"]
    C --> C2["SSH ECDH 키 교환"]

    D --> D1["TLS 1.2 RSA 키 교환<br/>(deprecated, PFS 없음)"]
    D --> D2["PGP 이메일 암호화<br/>(DevOps에서는 거의 안 씀)"]
```

실무에서 비대칭키가 "데이터를 암호화"하는 경우는 사실상 없다. **서명과 키 교환**이 99%다. 실제 데이터 암호화는 항상 대칭키(AES)가 한다.

---

#### RSA

RSA는 **큰 수의 소인수분해가 계산적으로 어렵다**는 수학적 난제에 기반한다. 두 개의 큰 소수를 곱하는 것은 쉽지만, 그 결과물을 다시 소수로 분해하는 것은 현재 기술로 불가능하다.

- **공개키**와 **개인키**가 이 소인수분해 관계로 연결되어 있다
- 공개키로 암호화한 것은 개인키 없이 복호화할 수 없다
- 키 길이가 길어야 안전하다: 현재 최소 **2048비트**, NIST는 2031년 이후 **3072비트** 이상 권장 [NIST SP 800-57 Part 1](https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final)
- RSA는 **느리다** — 그래서 대량 데이터 암호화에는 쓰지 않고, 서명/키 교환에만 쓴다

#### ECDSA와 EdDSA (타원곡선 암호)

타원곡선 암호(ECC)는 RSA와 다른 수학적 난제(타원곡선 이산로그 문제)에 기반한다. 같은 보안 수준에서 RSA보다 키가 **훨씬** 짧고 빠르다:

| 보안 강도(비트) | RSA 키 길이 | ECC 키 길이 |
|----------------|-------------|-------------|
| 128 | 3072비트 | 256비트 |
| 192 | 7680비트 | 384비트 |
| 256 | 15360비트 | 521비트 |

현재 SSH와 TLS에서 가장 권장되는 알고리즘은 **Ed25519**다:

- RSA보다 **빠르고 키가 작다** (공개키 32바이트, 서명 64바이트)
- 현재 `ssh-keygen` 기본 추천 알고리즘
- `ssh-keygen -t ed25519`로 생성

[RFC 8032](https://www.rfc-editor.org/rfc/rfc8032)

#### Diffie-Hellman 키 교환

Diffie-Hellman(DH)은 암호화나 서명을 하는 알고리즘이 아니다. **두 당사자가 공개 채널만으로 공유 비밀을 합의하는** 키 교환 프로토콜이다.

```mermaid
sequenceDiagram
    participant A as Alice
    participant E as 도청자 (Eve)
    participant B as Bob
    Note over A,B: 공개 파라미터: 소수 p, 생성자 g (도청자도 알고 있음)
    A->>A: 비밀값 a를 랜덤 선택
    A->>B: A = g^a mod p (공개값 전송)
    Note over E: g^a mod p를 볼 수 있음
    B->>B: 비밀값 b를 랜덤 선택
    B->>A: B = g^b mod p (공개값 전송)
    Note over E: g^b mod p도 볼 수 있음
    A->>A: 공유 비밀 = B^a mod p = g^(ab) mod p
    B->>B: 공유 비밀 = A^b mod p = g^(ab) mod p
    Note over A,B: 양쪽이 동일한 공유 비밀 g^(ab) mod p를 얻음
    Note over E: g^a mod p와 g^b mod p만으로<br/>g^(ab) mod p를 계산할 수 없음<br/>(이산로그 문제)
```

**왜 안전한가:** 도청자는 `g^a mod p`와 `g^b mod p`를 모두 볼 수 있다. 하지만 이 두 값으로부터 `g^(ab) mod p`를 계산하려면 `a` 또는 `b`를 알아야 하고, 이를 구하는 것이 **이산로그 문제**라서 계산적으로 불가능하다.

현대 프로토콜에서는 타원곡선 기반 **ECDH(Elliptic Curve Diffie-Hellman)**를 사용한다:

- **X25519**: TLS 1.3과 SSH에서 가장 널리 사용되는 ECDH 곡선
- **X448**: 더 높은 보안 강도가 필요할 때

TLS 1.3 RFC는 `secp256r1`, `x25519`, `x448` 등의 key share 그룹을 정의한다. [RFC 8446 Section 4.2.7](https://www.rfc-editor.org/rfc/rfc8446#section-4.2.7)

#### Ephemeral 키와 Perfect Forward Secrecy

DH에서 매 세션마다 새로운 임시 비밀값(a, b)을 생성하면 **DHE(Ephemeral DH)** 또는 **ECDHE**라고 한다.

이 방식이 제공하는 것이 **Perfect Forward Secrecy(PFS, 전방향 비밀성)**다:

- 서버의 장기 개인키가 **나중에** 유출되더라도
- **과거에 기록된 암호화 트래픽은 복호화할 수 없다**
- 왜냐하면 각 세션의 대칭키는 이미 폐기된 임시 비밀값으로 만들어졌기 때문이다

```mermaid
flowchart TB
    subgraph "PFS 없음 (정적 RSA 키 교환)"
        A1["서버 개인키 유출"] --> B1["과거 트래픽에서<br/>세션키 복원 가능"] --> C1["과거 모든 통신<br/>복호화 가능"]
    end
    subgraph "PFS 있음 (ECDHE)"
        A2["서버 개인키 유출"] --> B2["임시 DH 비밀값은<br/>이미 폐기됨"] --> C2["과거 통신은<br/>복호화 불가"]
    end
```

TLS 1.3은 **모든 키 교환에 ephemeral DH를 필수**로 한다. 정적 RSA 키 교환은 완전히 제거됐다. [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446)

### 1.4 하이브리드 암호화: 실무에서의 결합

실무에서 비대칭키만으로 대량 데이터를 암호화하지 않는다. RSA-2048 암호화는 AES-256보다 약 1000배 느리다.

SSH와 TLS 모두 다음 패턴을 따른다:

```mermaid
flowchart TB
    A["1단계: 비대칭키로 키 교환<br/>(ECDHE로 공유 비밀 합의)"] --> B["2단계: 키 도출 함수(KDF)로<br/>세션 대칭키 생성"]
    B --> C["3단계: 대칭키(AES-256-GCM 등)로<br/>실제 데이터 암호화"]
```

1. **비대칭키**(ECDHE)로 양쪽이 **공유 비밀**을 합의한다
2. 공유 비밀에서 **키 도출 함수(KDF, 예: HKDF)**를 통해 **세션 대칭키**를 만든다
3. 이후 모든 데이터는 **대칭키**(AES-256-GCM 등)로 암호화한다

이것이 "처음에는 비대칭키로 신뢰를 세우고, 실제 대량 트래픽 보호는 대칭키로 한다"는 의미다.

### 1.5 해시(hash), 암호화(encryption), 전자서명(signature)은 다르다

- **해시**: 임의 길이 입력을 고정 길이 값으로 만든다. 무결성 확인에 쓴다.
- **암호화**: 읽을 수 있는 데이터를 읽지 못하게 만든다. 기밀성 제공이 목적이다.
- **전자서명**: 개인키로 서명하고 공개키로 검증한다. "누가 만들었는지"와 "중간에 안 바뀌었는지"를 확인하는 데 쓴다.

이 세 가지를 혼동하면 TLS/SSH 동작을 항상 반쯤 틀리게 이해하게 된다.

| 특성 | 해시 | 암호화 | 전자서명 |
|------|------|--------|----------|
| 역변환 가능 | 불가능 (단방향) | 가능 (키 필요) | 불가능 (검증만 가능) |
| 키 필요 여부 | 불필요 | 필요 | 필요 (개인키/공개키) |
| 제공하는 것 | 무결성 | 기밀성 | 인증 + 무결성 + 부인 방지 |
| 대표 알고리즘 | SHA-256, SHA-3 | AES, ChaCha20 | RSA-PSS, Ed25519 |

### 1.6 인증(authentication)과 인가(authorization)는 다르다

- **인증(AuthN)**: "너는 누구냐?"
- **인가(AuthZ)**: "너는 무엇을 할 수 있느냐?"

예를 들어 mTLS는 양쪽 신원을 인증할 수 있지만, 그 자체로 "이 클라이언트가 이 API를 호출해도 되는가"까지 결정하지는 않는다. 그 판단은 별도의 인가 정책이 한다.

### 1.7 인증서(certificate)는 키 자체가 아니라 "공개키에 대한 증명서"다

X.509 인증서는 공개키, Subject, Issuer, 유효기간, 확장 정보 등을 담는 데이터 구조다. 인터넷 PKI에서 경로 검증(path validation)은 **신뢰한 루트(trust anchor)**로부터 대상 인증서까지 이어지는 체인을 검증하는 방식으로 이뤄진다. [RFC 5280](https://www.rfc-editor.org/rfc/rfc5280)

### 1.8 파일 이름은 타입 보장이 아니다

이게 제일 중요하다.

- `server.crt`라고 해서 항상 텍스트 PEM은 아니다.
- `server.key`라고 해서 항상 PKCS#8도 아니다.
- `ca-bundle.crt`라고 해서 항상 루트 CA만 들어 있는 것도 아니다.
- `PEM`은 "무엇을 담는가"가 아니라 "어떻게 텍스트로 감싸는가"에 가깝다.

즉, **확장자보다 파일 내부 내용**을 봐야 한다.

---

## 2. PEM, CRT, KEY, CSR, ca-bundle, authorized_keys를 한 번에 구분하기

### 2.1 핵심만 먼저

| 이름 | 보통 무엇을 담는가 | 비밀 여부 | 포인트 |
|------|-------------------|-----------|--------|
| `PEM` | 인증서, 공개키, 개인키, CSR 등을 텍스트로 감싼 형식 | 내용에 따라 다름 | **형식/인코딩**이지 오브젝트 종류가 아니다 |
| `CRT` / `CER` | 보통 인증서 | 보통 비밀 아님 | 확장자는 관례일 뿐이며 PEM/DER 둘 다 가능 |
| `KEY` | 보통 개인키 | **비밀** | 확장자는 관례일 뿐, PKCS#8/전통 형식/OpenSSH 등 다양함 |
| `CSR` | 인증서 서명 요청 | 보통 비밀 아님 | 공개키와 subject 정보가 들어가며 CA에 제출 |
| `ca-bundle` | 여러 CA 인증서 묶음 | 보통 비밀 아님 | trust store 또는 체인 보조 파일로 사용 |
| `authorized_keys` | SSH 로그인 허용 공개키 목록 | 비밀 아님 | **SSH 사용자 인증**용 |
| `known_hosts` | 신뢰하는 SSH 서버 host key 목록 | 비밀 아님 | **SSH 서버 검증**용 |

### 2.2 PEM이 정확히 무엇인가

IETF는 [RFC 7468](https://www.rfc-editor.org/rfc/rfc7468)에서 PKIX/PKCS/CMS 구조의 **textual encoding**을 정의한다. 즉 PEM은 보통 다음 같은 형태다.

```text
-----BEGIN CERTIFICATE-----
BASE64...
-----END CERTIFICATE-----
```

또는:

```text
-----BEGIN PRIVATE KEY-----
BASE64...
-----END PRIVATE KEY-----
```

즉 `PEM`은 "인증서"를 뜻하지 않는다.
`BEGIN ... END ...` 라벨에 따라 **무엇이 들어 있는지**가 달라진다. [RFC 7468](https://www.rfc-editor.org/rfc/rfc7468)

대표 라벨:

- `BEGIN CERTIFICATE`
- `BEGIN CERTIFICATE REQUEST`
- `BEGIN PUBLIC KEY`
- `BEGIN PRIVATE KEY`
- `BEGIN ENCRYPTED PRIVATE KEY`

또한 RFC 7468은 **하나의 파일에 여러 textual encoding 인스턴스가 들어갈 수 있다**고 명시한다. 그래서 PEM 파일 하나에 인증서 여러 장이 연속으로 붙어 있는 경우도 흔하다. [RFC 7468](https://www.rfc-editor.org/rfc/rfc7468)

### 2.3 CRT / CER는 무엇인가

`CRT`와 `CER`는 보통 인증서 파일에 붙는 이름이다. 하지만 중요한 점은:

- 이것들은 **정식 보안 오브젝트 타입 이름이 아니라 파일명 관례**에 가깝다.
- 실제 내용은 **PEM일 수도 있고 DER일 수도 있다**.

RFC 7468은 textual encoding certificate에 `.crt` 사용을 권장하면서도, 실제로는 `.cer`를 쓰는 도구도 많다고 설명한다. 그리고 예전 RFC 2585 등록은 `.cer`를 DER 기반 단일 인증서로 설명한다. 즉, 실무에서는 `.crt`/`.cer`만 보고 포맷을 단정하면 안 된다. [RFC 7468](https://www.rfc-editor.org/rfc/rfc7468)

정리하면:

- `server.crt`
  - 보통 서버 인증서
  - 그러나 PEM인지 DER인지는 내용 확인 필요

### 2.4 KEY는 무엇인가

`KEY`는 보통 **개인키 파일**이다. 하지만 이것도 확장자일 뿐이다.

실제 내용은 여러 경우가 있다.

- PKCS#8 unencrypted: `BEGIN PRIVATE KEY`
- PKCS#8 encrypted: `BEGIN ENCRYPTED PRIVATE KEY`
- 전통 PEM RSA 키: `BEGIN RSA PRIVATE KEY`
- 전통 PEM EC 키: `BEGIN EC PRIVATE KEY`
- OpenSSH private key: OpenSSH 전용 포맷

OpenSSL `pkey` 문서는 현재 표준 private key 출력 형식으로 **PKCS#8**을 사용한다고 설명하고, `-traditional` 옵션을 주면 구형 전통 형식을 사용한다고 설명한다. [OpenSSL pkey](https://docs.openssl.org/1.1.1/man1/pkey/)

즉 `server.key`를 보면 "개인키일 가능성은 높다" 정도만 말할 수 있고, 정확한 내부 포맷은 확인해야 한다.

### 2.5 CSR는 무엇인가

`CSR`은 **Certificate Signing Request**, 즉 인증서 서명 요청 파일이다.

PEM으로 보면 보통 이렇게 생긴다.

```text
-----BEGIN CERTIFICATE REQUEST-----
...
-----END CERTIFICATE REQUEST-----
```

RFC 7468은 PKCS#10 요청을 `CERTIFICATE REQUEST` 라벨로 인코딩한다고 정의한다. [RFC 7468](https://www.rfc-editor.org/rfc/rfc7468)

CSR에는 일반적으로 다음이 들어 있다.

- 공개키
- subject 정보
- CA에 요청할 확장 정보
- 요청에 대한 서명

**개인키는 CSR에 들어 있지 않다.**

### 2.6 ca-bundle은 무엇인가

`ca-bundle`은 표준화된 타입 이름이 아니라 **여러 CA 인증서를 하나의 파일에 묶어 둔 관례적 이름**이다.

실무에서는 두 가지 의미로 자주 쓰인다.

1. **신뢰 저장소(trust store)** 역할
   예: OpenSSL `verify -CAfile file`에서 `CAfile`은 **trusted certificates** 파일이며, 하나 이상의 PEM 인증서를 포함한다. [OpenSSL verify](https://docs.openssl.org/1.1.1/man1/verify/)

2. **체인 보조 파일(chain/bundle)** 역할
   일부 서버/프록시 제품은 leaf cert 외에 intermediate CA들을 묶어 둔 파일을 bundle이라고 부른다.

그래서 `ca-bundle.crt`라는 이름만으로는 이것이:

- 루트 CA 묶음인지
- intermediate 체인인지
- 둘이 섞여 있는지

를 단정하면 안 된다. **제품 문서와 파일 내용을 같이 확인해야 한다.**

### 2.7 authorized_keys는 위 파일들과 왜 다른가

`authorized_keys`는 TLS/X.509 인증서 파일이 아니다.
이건 **OpenSSH가 사용자 로그인을 허용할 공개키 목록**이다.

OpenSSH `ssh(1)` 문서는 `~/.ssh/authorized_keys`에 로그인 허용 공개키를 둔다고 설명하고, 로그인 시 클라이언트가 개인키를 가지고 있음을 증명하면 서버가 그 공개키가 허용된 것인지 확인한다고 설명한다. [OpenSSH ssh(1)](https://man.openbsd.org/ssh.1)

즉:

- `authorized_keys` = "이 사용자 계정으로 들어와도 되는 **클라이언트 공개키 allowlist**"
- `server.crt` = "이 서버 공개키가 어떤 이름/주체에 속하는지 CA가 서명한 **X.509 인증서**"

완전히 다른 체계다.

### 2.8 known_hosts는 또 무엇인가

`known_hosts`는 클라이언트가 신뢰하는 **SSH 서버 host key 목록**이다.

OpenSSH는 접속한 서버의 host key를 `~/.ssh/known_hosts`에 저장하고, 나중에 키가 바뀌면 경고한다. 이는 서버 스푸핑과 MITM 방지를 위한 장치다. [OpenSSH ssh(1)](https://man.openbsd.org/ssh.1)

즉:

- `authorized_keys` = 서버가 클라이언트를 검증
- `known_hosts` = 클라이언트가 서버를 검증

---

## 3. 파일 이름보다 내용을 보는 법

확장자를 믿지 말고 실제 내용을 검사해야 한다.

### 3.1 인증서 확인

```bash
# PEM 인증서 읽기
openssl x509 -in server.crt -text -noout

# DER 인증서 읽기
openssl x509 -inform DER -in server.cer -text -noout
```

OpenSSL `x509` 명령은 입력/출력 포맷으로 `DER`와 `PEM`을 지원한다. [OpenSSL x509](https://docs.openssl.org/3.3/man1/openssl-x509/)

### 3.2 개인키 확인

```bash
openssl pkey -in server.key -text -noout
```

OpenSSL `pkey`는 현대적인 private key 처리 명령이며, 기본 private key 출력 형식은 PKCS#8이다. [OpenSSL pkey](https://docs.openssl.org/1.1.1/man1/pkey/)

### 3.3 CSR 확인

```bash
openssl req -in server.csr -text -noout
```

### 3.4 인증서 체인 확인

```bash
# trusted CA 파일을 이용한 검증
openssl verify -CAfile ca-bundle.crt server.crt

# intermediate를 별도 지정해 검증
openssl verify -CAfile root-ca.crt -untrusted intermediate-ca.crt server.crt
```

OpenSSL `verify`는 certificate chain을 검증하며, `-CAfile`은 **trusted certificates** 파일, `-untrusted`는 **intermediate issuer CAs**를 chain 구성용으로 사용한다. [OpenSSL verify](https://docs.openssl.org/1.1.1/man1/verify/)

### 3.5 SSH 키 확인

```bash
# 공개키 fingerprint 확인
ssh-keygen -lf ~/.ssh/id_ed25519.pub

# 개인키에서 공개키 추출
ssh-keygen -y -f ~/.ssh/id_ed25519
```

---

## 4. SSH를 정확히 이해하기

### 4.1 SSH는 무엇인가

SSH는 **불안전한 네트워크 위에서 secure remote login과 기타 secure network service를 제공하는 프로토콜**이다. IETF SSH transport RFC는 SSH가 강한 암호화, 서버 인증, 무결성 보호를 제공한다고 설명한다. [RFC 4253](https://www.rfc-editor.org/rfc/rfc4253)

즉 SSH는 단순히 "리눅스 서버 접속 명령"이 아니라, 다음을 제공하는 보안 채널이다.

- 원격 로그인
- 명령 실행
- 포트 포워딩
- 파일 전송(SCP/SFTP)
- 터널링

### 4.2 SSH에서 중요한 키는 2종류다

SSH에서는 최소 두 종류의 키를 분리해서 봐야 한다.

1. **서버 host key**
   - 서버 자신의 신원
   - 클라이언트는 이 키를 `known_hosts`로 기억

2. **사용자 key pair**
   - 사용자가 로그인할 때 쓰는 키
   - 서버는 허용 공개키를 `authorized_keys`에서 확인

이 둘을 섞어서 생각하면 `authorized_keys`와 `known_hosts`의 차이가 영원히 헷갈린다.

### 4.3 SSH 공개키 인증 동작 방식

OpenSSH 문서는 public key authentication을 이렇게 설명한다.

- 사용자는 공개키/개인키 쌍을 가진다.
- 서버는 공개키를 알고 있다.
- 클라이언트는 개인키를 갖고 있음을 증명한다.
- 서버는 그 공개키가 허용된 키인지 확인한다.
  [OpenSSH ssh(1)](https://man.openbsd.org/ssh.1), [RFC 4252](https://www.rfc-editor.org/rfc/rfc4252)

조금 더 풀면:

1. 클라이언트가 서버에 TCP 연결을 연다.
2. SSH transport 계층에서 알고리즘 협상과 키 교환을 한다.
3. 서버는 자신의 host key로 **서버 정체성**을 증명한다.
4. 클라이언트는 이 서버 host key가 자신이 아는 서버인지 `known_hosts`로 확인한다.
5. 암호화된 채널이 성립된 뒤 사용자 인증 단계(`ssh-userauth`)가 시작된다.
6. 클라이언트는 "이 공개키로 로그인하겠다"고 말한다.
7. 클라이언트는 해당 공개키에 대응하는 **개인키로 세션 식별자 등을 서명**한다.
8. 서버는 그 서명을 검증하고, 해당 공개키가 `authorized_keys`에 있는지 확인한다.
   [RFC 4252](https://www.rfc-editor.org/rfc/rfc4252)

RFC 4252는 public key 인증 요청에 서명이 포함되며, 그 서명은 세션 식별자와 요청 데이터 위에 개인키로 생성된다고 정의한다. [RFC 4252](https://www.rfc-editor.org/rfc/rfc4252)

### 4.4 SSH 키 교환(Key Exchange) 상세 동작

SSH 연결에서 가장 먼저 일어나는 것은 **키 교환**이다. 이 단계에서 양쪽은 암호화된 채널을 위한 세션 키를 합의한다.

RFC 4253은 SSH transport layer의 키 교환 절차를 다음과 같이 정의한다. [RFC 4253](https://www.rfc-editor.org/rfc/rfc4253)

**1단계: 프로토콜 버전 교환**

양쪽이 SSH 프로토콜 버전 문자열을 교환한다.

```text
SSH-2.0-OpenSSH_9.7
```

**2단계: 알고리즘 협상 (SSH_MSG_KEXINIT)**

양쪽이 지원하는 알고리즘 목록을 교환한다:

| 협상 항목 | 예시 |
|-----------|------|
| 키 교환 알고리즘 | `curve25519-sha256`, `diffie-hellman-group16-sha512` |
| 서버 host key 알고리즘 | `ssh-ed25519`, `rsa-sha2-512` |
| 암호화 알고리즘 (양방향) | `chacha20-poly1305@openssh.com`, `aes256-gcm@openssh.com` |
| MAC 알고리즘 (양방향) | `hmac-sha2-256-etm@openssh.com` (AEAD 사용 시 불필요) |
| 압축 알고리즘 | `none`, `zlib@openssh.com` |

양쪽 리스트에서 **서로 지원하는 첫 번째 알고리즘**이 선택된다.

**3단계: 키 교환 실행**

가장 널리 쓰이는 `curve25519-sha256`을 예로 들면:

```mermaid
sequenceDiagram
    participant C as SSH Client
    participant S as SSH Server
    C->>S: SSH_MSG_KEX_ECDH_INIT<br/>(클라이언트 ECDH 공개값)
    S->>S: ECDH 공유 비밀 계산
    S->>S: 교환 해시 H 계산
    S->>S: host key로 H에 서명
    S->>C: SSH_MSG_KEX_ECDH_REPLY<br/>(서버 host key + 서버 ECDH 공개값 + H 서명)
    C->>C: ECDH 공유 비밀 계산
    C->>C: 서버 host key로 서명 검증
    C->>C: known_hosts에서 host key 확인
    Note over C,S: 공유 비밀에서 세션 키 도출
```

여기서 **교환 해시 H**의 역할이 중요하다:

- H는 키 교환 과정의 모든 정보(프로토콜 버전, 알고리즘 목록, DH 공개값, 공유 비밀 등)를 해시한 값이다
- 서버는 **자신의 host key 개인키로 H에 서명**한다 — 이것이 서버의 신원을 증명하는 핵심이다
- 첫 번째 키 교환의 H가 **세션 식별자(session_id)**가 된다

**4단계: 세션 키 도출**

공유 비밀과 교환 해시로부터 암호화 키, MAC 키, IV가 **방향별(client→server, server→client)**로 각각 도출된다. 양방향 키가 분리되어 있으므로 한쪽 방향의 키가 노출되어도 반대 방향 통신은 영향받지 않는다. [RFC 4253 Section 7.2](https://www.rfc-editor.org/rfc/rfc4253#section-7.2)

**5단계: SSH_MSG_NEWKEYS**

양쪽이 `SSH_MSG_NEWKEYS`를 보내면, 이 시점부터 **모든 통신이 새로 합의된 알고리즘과 키로 암호화**된다.

### 4.5 SSH 전체 메시지 흐름

```mermaid
sequenceDiagram
    participant C as SSH Client
    participant S as SSH Server

    rect rgb(240, 240, 255)
        Note over C,S: Transport Layer (키 교환)
        C->>S: TCP connect :22
        C->>S: 프로토콜 버전 문자열
        S->>C: 프로토콜 버전 문자열
        C->>S: SSH_MSG_KEXINIT (지원 알고리즘 목록)
        S->>C: SSH_MSG_KEXINIT (지원 알고리즘 목록)
        C->>S: SSH_MSG_KEX_ECDH_INIT (클라이언트 DH 공개값)
        S->>C: SSH_MSG_KEX_ECDH_REPLY (host key + 서버 DH 공개값 + 서명)
        C->>C: host key 검증 (known_hosts)
        C->>S: SSH_MSG_NEWKEYS
        S->>C: SSH_MSG_NEWKEYS
    end

    rect rgb(240, 255, 240)
        Note over C,S: User Authentication Layer
        Note over C,S: 이후 모든 메시지는 암호화됨
        C->>S: SSH_MSG_USERAUTH_REQUEST (publickey)
        C->>S: 개인키로 서명한 인증 데이터
        S->>S: 서명 검증 + authorized_keys 확인
        S->>C: SSH_MSG_USERAUTH_SUCCESS
    end

    rect rgb(255, 240, 240)
        Note over C,S: Connection Layer
        C->>S: SSH_MSG_CHANNEL_OPEN (session)
        S->>C: SSH_MSG_CHANNEL_OPEN_CONFIRMATION
        Note over C,S: 암호화된 애플리케이션 데이터
    end
```

핵심은:

- **서버 인증**은 host key (Transport Layer에서)
- **사용자 인증**은 user key (Authentication Layer에서)
- 둘은 서로 다른 계층, 다른 단계에서 쓰인다

### 4.6 authorized_keys와 known_hosts 차이

| 파일 | 누가 갖는가 | 무엇을 저장하는가 | 용도 |
|------|-------------|------------------|------|
| `~/.ssh/authorized_keys` | 서버 측 사용자 계정 | 로그인 허용 공개키 | 서버가 클라이언트 인증 |
| `~/.ssh/known_hosts` | 클라이언트 | 신뢰하는 서버 host key | 클라이언트가 서버 인증 |

### 4.7 SSH에서 자주 보이는 파일

| 파일 | 의미 | 비밀 여부 |
|------|------|-----------|
| `~/.ssh/id_ed25519` | 사용자 개인키 | **비밀** |
| `~/.ssh/id_ed25519.pub` | 사용자 공개키 | 비밀 아님 |
| `/etc/ssh/ssh_host_ed25519_key` | 서버 host 개인키 | **비밀** |
| `/etc/ssh/ssh_host_ed25519_key.pub` | 서버 host 공개키 | 비밀 아님 |
| `~/.ssh/authorized_keys` | 로그인 허용 공개키 목록 | 비밀 아님 |
| `~/.ssh/known_hosts` | 신뢰하는 서버 host key 목록 | 비밀 아님 |

OpenSSH는 개인키 파일이 타인에게 열려 있으면 무시할 수 있으며, 개인키 파일은 민감 데이터라고 설명한다. [OpenSSH ssh(1)](https://man.openbsd.org/ssh.1)

### 4.8 SSH 재키잉(Rekeying)

장시간 연결을 유지하거나 대량 데이터를 전송할 때, 같은 세션 키를 계속 쓰면 암호학적 약점이 생길 수 있다. 그래서 SSH는 **연결 중에도 새로운 키 교환을 수행**할 수 있다.

RFC 4253은 양쪽이 언제든 `SSH_MSG_KEXINIT`를 보내 재키잉을 시작할 수 있다고 정의한다. OpenSSH는 기본적으로 **1GB 전송 후 또는 1시간 후** 재키잉을 수행한다. [RFC 4253 Section 9](https://www.rfc-editor.org/rfc/rfc4253#section-9)

### 4.9 실무 사례: Jenkins SSH 플러그인이 id_rsa로 서버에 접속하는 원리

Jenkins에서 빌드 결과물을 배포 서버에 전송하거나 원격 명령을 실행할 때, [SSH Agent Plugin](https://plugins.jenkins.io/ssh-agent/) 또는 [Publish Over SSH](https://plugins.jenkins.io/publish-over-ssh/) 같은 플러그인을 쓴다. 설정 화면에서 대상 서버의 `id_rsa` 파일 내용(개인키)을 통째로 붙여넣으면 접속이 된다. 이것이 어떤 원리인지 위에서 설명한 SSH 인증 흐름에 대입해보면 바로 이해된다.

#### 무엇을 설정하는 것인가

Jenkins 관리 화면(**Manage Jenkins → Credentials**)에서 "SSH Username with private key" 타입의 credential을 추가하면, 아래와 같은 입력란이 나온다:

```text
Kind:       SSH Username with private key
Username:   deploy
Private Key:
  -----BEGIN OPENSSH PRIVATE KEY-----
  b3BlbnNzaC1rZXktdjEAAAAABG5vbmUA...
  -----END OPENSSH PRIVATE KEY-----
```

여기에 붙여넣는 것이 **대상 서버에 접속할 사용자의 개인키**다. `id_rsa`든 `id_ed25519`든 알고리즘은 상관없다. 핵심은 **이 개인키에 대응하는 공개키가 대상 서버의 `~deploy/.ssh/authorized_keys`에 등록되어 있어야 한다**는 것이다.

#### 접속 시 일어나는 일

Jenkins가 이 credential을 사용해서 배포 서버에 SSH 접속할 때, 위 4.3~4.5에서 설명한 SSH 공개키 인증이 **그대로** 일어난다.

```mermaid
sequenceDiagram
    participant J as Jenkins<br/>(Credentials에 저장된 개인키)
    participant D as 배포 서버<br/>(~deploy/.ssh/authorized_keys)

    Note over J,D: [1] Transport Layer — 키 교환
    J->>D: TCP 연결 + SSH_MSG_KEXINIT
    D->>J: SSH_MSG_KEX_ECDH_REPLY (host key + 서명)
    J->>J: host key 검증
    Note over J,D: 암호화 채널 성립

    Note over J,D: [2] User Authentication Layer
    J->>D: SSH_MSG_USERAUTH_REQUEST<br/>("deploy" 사용자, publickey 방식)
    J->>J: 세션ID + 요청 데이터를<br/>Credentials의 개인키로 서명
    J->>D: 서명값 전송
    D->>D: authorized_keys에서 대응하는 공개키 검색
    D->>D: 해당 공개키로 서명 검증 ✓
    D->>J: SSH_MSG_USERAUTH_SUCCESS

    Note over J,D: [3] Connection Layer — 배포 명령 실행
    J->>D: scp build.jar /app/ 또는 sh deploy.sh
```

**터미널에서 `ssh deploy@server` 치는 것과 완전히 동일한 프로토콜이 동작한다.** 차이점은 단 하나: 개인키를 `~/.ssh/id_rsa` 파일에서 읽느냐, Jenkins Credentials 저장소에서 읽느냐뿐이다.

#### 왜 "개인키를 붙여넣는 것"만으로 접속이 되는가

이 질문을 분해하면:

| 조건 | 설명 |
|------|------|
| **Jenkins에 개인키가 있다** | 서명을 생성할 수 있다 (4.3절의 7단계) |
| **배포 서버 authorized_keys에 대응하는 공개키가 있다** | 서버가 "이 사용자를 허용한다"고 판단할 수 있다 (4.3절의 8단계) |
| **개인키로 만든 서명을 공개키로 검증할 수 있다** | 비대칭키의 수학적 성질 (1.3절) |

세 조건이 충족되면 SSH 공개키 인증은 성공한다. 비밀번호는 필요 없다. Jenkins 플러그인은 이 과정을 자동화해주는 SSH 클라이언트일 뿐이다.

#### 보안 관점에서 주의할 점

Jenkins Credentials에 개인키를 저장한다는 것은, **Jenkins 서버가 해당 배포 서버에 대한 접속 권한을 보유한다**는 의미다. 따라서:

- **Jenkins 서버 자체의 보안이 곧 배포 서버의 보안**이다. Jenkins가 뚫리면 개인키가 노출되고, 배포 서버까지 접근 가능해진다
- 개인키에 **passphrase를 설정**하면 키 파일이 유출되더라도 바로 사용할 수 없다. Jenkins Credentials 설정에서 passphrase 입력란을 지원하는 이유가 이것이다
- **배포 전용 키를 별도로 생성**하는 것이 좋다. DevOps 엔지니어 개인의 `id_rsa`를 Jenkins에 넣으면, 그 사람이 퇴사하거나 키를 교체할 때 파이프라인이 깨진다
- `authorized_keys`에 등록할 때 **`command=`, `from=` 제한자**를 걸면, 해당 키로 할 수 있는 행위를 제한할 수 있다. 예를 들어 배포 스크립트만 실행 가능하게 제한하는 식이다

```text
# 배포 서버의 ~/.ssh/authorized_keys 예시
command="/app/deploy.sh",from="10.0.1.50" ssh-ed25519 AAAA... jenkins-deploy-key
```

이렇게 설정하면 이 키로는 `/app/deploy.sh`만 실행 가능하고, Jenkins 서버 IP(10.0.1.50)에서만 접속할 수 있다.

#### 정리

Jenkins SSH 플러그인은 마법이 아니다. SSH 공개키 인증이라는 표준 메커니즘 위에서 **"개인키 저장소를 파일시스템 대신 Jenkins Credentials로 바꾼 것"**에 불과하다. 원리를 알면 "왜 `id_rsa` 내용을 붙여넣으면 되는지"가 당연하게 느껴진다. 개인키가 있으니 서명을 만들 수 있고, 서버에 공개키가 등록되어 있으니 그 서명을 검증할 수 있다. 그게 전부다.

---

## 5. TLS, SSL, mTLS를 정확히 이해하기

### 5.1 먼저: SSL과 TLS는 같은 말이 아니다

실무에서는 아직도 "SSL 인증서", "SSL 설정"이라고 많이 말하지만, 현대적으로 맞는 표현은 대부분 **TLS**다.

- SSL 2.0: 사용 금지 [RFC 6176](https://www.rfc-editor.org/rfc/rfc6176)
- SSL 3.0: 사용 금지 [RFC 7568](https://www.rfc-editor.org/rfc/rfc7568)
- TLS 1.0 / 1.1: 사용 금지 [RFC 8996](https://www.rfc-editor.org/rfc/rfc8996)
- 현재 일반적인 최소선: **TLS 1.2 이상**
- 가능하면 **TLS 1.3 우선**

IETF BCP 195 갱신 문서인 RFC 9325는 SSLv2, SSLv3, TLS 1.0, TLS 1.1을 협상하면 안 된다고 권고하고, TLS 1.2 지원과 TLS 1.3 우선 사용을 권고한다. [RFC 9325](https://datatracker.ietf.org/doc/html/rfc9325)

### 5.2 TLS는 무엇을 제공하나

TLS 1.3 RFC는 handshake가 다음을 하게 해 준다고 설명한다.

- 프로토콜 버전 협상
- 암호 알고리즘 선택
- 필요하면 상호 인증
- 공유 비밀키 성립
  [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446)

즉 TLS가 제공하려는 핵심은:

- **기밀성(confidentiality)**
- **무결성(integrity)**
- **인증(authentication)**

### 5.3 TLS 1.2 핸드셰이크 상세 동작

TLS 1.2는 아직 많은 시스템에서 사용되고 있다. 동작 원리를 이해하면 1.3에서 무엇이 바뀌었는지가 명확해진다.

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server

    rect rgb(255, 245, 230)
        Note over C,S: 평문 (암호화 안 됨)
        C->>S: ClientHello<br/>(TLS 버전, 지원 cipher suite 목록,<br/>클라이언트 랜덤값, 지원 확장)
        S->>C: ServerHello<br/>(선택된 cipher suite,<br/>서버 랜덤값)
        S->>C: Certificate<br/>(서버 인증서 체인)
        S->>C: ServerKeyExchange<br/>(ECDHE 파라미터 + 서명)<br/>※ 정적 RSA 시에는 생략
        S->>C: ServerHelloDone
    end

    rect rgb(230, 255, 230)
        Note over C,S: 키 교환
        C->>C: 서버 인증서 체인 검증
        C->>S: ClientKeyExchange<br/>(클라이언트 ECDH 공개값<br/>또는 RSA로 암호화한 pre-master secret)
        Note over C,S: 양쪽이 pre-master secret에서<br/>master secret 도출
        Note over C,S: master secret에서<br/>세션 키 도출
        C->>S: ChangeCipherSpec<br/>(이제부터 암호화)
        C->>S: Finished (암호화됨)
        S->>C: ChangeCipherSpec
        S->>C: Finished (암호화됨)
    end

    rect rgb(230, 230, 255)
        Note over C,S: 암호화된 애플리케이션 데이터
    end
```

TLS 1.2의 키 도출 과정:

1. 클라이언트와 서버가 **DH 또는 RSA로 pre-master secret**을 합의한다
2. pre-master secret + 양쪽 랜덤값 → **master secret** 도출
3. master secret → **세션 키**(encryption key, MAC key, IV) 도출

각 세션마다 랜덤값이 다르므로 세션 키도 매번 달라진다. [RFC 5246 Section 8.1](https://www.rfc-editor.org/rfc/rfc5246#section-8.1)

**TLS 1.2의 문제점:**

- **2-RTT**: 핸드셰이크에 2번의 왕복이 필요하다 (ServerHelloDone까지 1 RTT, Finished까지 1 RTT)
- **RSA 키 교환 허용**: 정적 RSA 키 교환을 사용하면 PFS가 없다
- **CBC 모드 허용**: padding oracle 공격(POODLE, Lucky13 등)에 취약할 수 있다
- **복잡한 cipher suite 조합**: 수백 가지 조합 중 안전한 것을 골라야 한다

### 5.4 TLS 1.3 핸드셰이크 상세 동작

TLS 1.3은 핸드셰이크를 근본적으로 재설계했다.

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server

    rect rgb(255, 245, 230)
        Note over C,S: 1-RTT 핸드셰이크
        C->>S: ClientHello<br/>(지원 cipher suite,<br/>key_share 확장에 ECDH 공개값 포함,<br/>supported_groups, signature_algorithms)
    end

    rect rgb(230, 255, 230)
        Note over C,S: 서버 응답 (이 시점부터 암호화)
        S->>C: ServerHello<br/>(선택된 cipher suite,<br/>key_share에 서버 ECDH 공개값)
        Note over C,S: 양쪽이 ECDHE로 handshake secret 도출
        S->>C: EncryptedExtensions
        S->>C: Certificate (서버 인증서 체인)
        S->>C: CertificateVerify<br/>(handshake 전체에 대한<br/>서버 개인키 서명)
        S->>C: Finished (handshake MAC)
    end

    rect rgb(230, 230, 255)
        C->>C: 인증서 체인 검증 + 서명 검증
        C->>S: Finished (handshake MAC)
        Note over C,S: 암호화된 애플리케이션 데이터
    end
```

**TLS 1.3의 핵심 변경점:**

| 항목 | TLS 1.2 | TLS 1.3 |
|------|---------|---------|
| 핸드셰이크 RTT | 2-RTT | **1-RTT** (0-RTT도 가능) |
| 키 교환 | RSA, DHE, ECDHE | **ECDHE/DHE만** (PFS 필수) |
| 암호화 모드 | CBC, GCM, CCM | **AEAD만** (GCM, CCM, ChaCha20-Poly1305) |
| 서버 인증서 | 평문 전송 | **암호화 전송** (도청자가 볼 수 없음) |
| 해시 함수 | MD5, SHA-1 허용 | **SHA-256/384만** |
| ChangeCipherSpec | 필요 | **제거** |
| Cipher suite 수 | 수백 개 | **5개** |
| 재협상(renegotiation) | 가능 (취약점 원인) | **제거** |
| 압축 | 가능 (CRIME 공격) | **제거** |

**1-RTT가 가능한 이유:** 클라이언트가 `ClientHello`에 key_share를 미리 포함시키기 때문이다. TLS 1.2에서는 서버가 먼저 파라미터를 보내야 클라이언트가 키 교환을 시작할 수 있었지만, 1.3에서는 클라이언트가 "아마 이 곡선을 쓸 것이다"라고 추측하고 미리 공개값을 보낸다.

TLS 1.3은 **HKDF(HMAC-based Key Derivation Function)**로 키를 도출하며, **핸드셰이크 단계와 애플리케이션 데이터 단계에서 서로 다른 키**를 사용한다. 핸드셰이크 메시지 자체도 암호화되므로 도청자가 인증서 내용을 볼 수 없다 — TLS 1.2와의 큰 차이다. [RFC 8446 Section 7.1](https://www.rfc-editor.org/rfc/rfc8446#section-7.1)

#### 0-RTT 재연결 (Early Data)

TLS 1.3은 이전에 연결했던 서버에 **0-RTT로 재연결**할 수 있다:

1. 이전 연결에서 서버가 PSK(Pre-Shared Key)를 발급한다
2. 다음 연결에서 클라이언트가 `ClientHello`와 함께 PSK로 암호화한 **early data**를 보낸다
3. 서버는 ServerHello 전에 early data를 복호화하고 처리할 수 있다

**0-RTT의 보안 주의점:** early data는 **재전송 공격(replay attack)**에 취약하다. 공격자가 0-RTT 데이터를 캡처해 서버에 다시 보낼 수 있다. 그래서 0-RTT에는 **비멱등(non-idempotent) 요청을 보내면 안 된다**. GET은 괜찮지만 POST는 위험하다. [RFC 8446 Section 8](https://www.rfc-editor.org/rfc/rfc8446#section-8)

### 5.5 TLS 서버 인증 동작

가장 흔한 HTTPS 시나리오에서는:

1. 클라이언트가 `ClientHello`를 보낸다.
2. 서버가 `ServerHello`를 보내고, 이어서 자신의 인증서(`Certificate`)를 보낸다.
3. 서버는 `CertificateVerify`로 "내가 이 인증서의 공개키에 대응하는 개인키를 정말 가지고 있다"는 것을 증명한다.
4. 양쪽은 `Finished`를 주고받아 핸드셰이크 전체와 키를 확인한다.
   [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446)

TLS 1.3 RFC는 `CertificateVerify`가 **handshake 전체에 대한 서명**이고, `Finished`가 **handshake와 계산된 키를 인증하는 MAC**이라고 설명한다. [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446)

이 세 메시지의 역할을 정리하면:

| 메시지 | 증명하는 것 | 실패하면 |
|--------|------------|----------|
| `Certificate` | "이 인증서가 내 신원이다" | 인증서 없음 → 인증 불가 |
| `CertificateVerify` | "이 인증서의 개인키를 정말 갖고 있다" | 서명 불일치 → 인증서 도용 탐지 |
| `Finished` | "핸드셰이크가 변조되지 않았다" | MAC 불일치 → MITM 탐지 |

### 5.6 인증서 체인은 어떻게 검증되나

X.509 검증은 "내가 믿는 trust anchor로부터 대상 인증서까지 이어지는 체인"을 확인하는 과정이다.

일반적인 구조:

```text
Root CA (trust anchor)
  -> Intermediate CA
    -> Leaf certificate (server.example.com)
```

RFC 5280은 경로 검증 시 다음 조건들을 확인한다고 설명한다.

- 각 인증서의 subject/issuer 연결
- trust anchor로부터 시작되는지
- 마지막이 검증 대상 cert인지
- 유효기간이 맞는지
  [RFC 5280](https://www.rfc-editor.org/rfc/rfc5280)

또한 RFC 5280은 trust anchor가 self-signed certificate 형태로 제공되더라도, 그 self-signed cert 자체는 prospective certification path에 포함되지 않는다고 설명한다. 실무적으로 말하면 **루트 인증서는 보통 클라이언트 trust store에 있고, 서버는 보통 leaf와 intermediate를 보낸다**고 이해하면 된다. [RFC 5280](https://www.rfc-editor.org/rfc/rfc5280)

### 5.7 hostname 검증은 왜 중요한가

인증서가 "유효한 CA가 서명한 인증서"라는 사실만으로는 부족하다.
그 인증서가 **내가 접속하려는 호스트 이름과도 일치해야 한다**.

OpenSSL `verify`는 `-verify_hostname` 옵션으로 Subject Alternative Name의 DNS name 또는 subject Common Name과의 매칭을 확인할 수 있다고 설명한다. [OpenSSL verify](https://docs.openssl.org/1.1.1/man1/verify/)

즉 TLS 검증은 보통 최소한 아래를 본다.

- 서명 체인
- 유효기간
- 폐기 상태(환경에 따라)
- hostname 또는 IP 매칭
- key usage / extended key usage(용도)

### 5.8 인증서 폐기(Revocation) 확인

인증서의 유효기간이 남아 있더라도, 개인키 유출 등의 이유로 **폐기**됐을 수 있다. 폐기 여부를 확인하는 방법은 두 가지다.

**CRL(Certificate Revocation List):**
- CA가 주기적으로 발행하는 폐기된 인증서 목록
- 인증서의 CRL Distribution Points 확장에 URL이 명시됨
- 단점: 목록이 커질 수 있고, 업데이트 주기 사이에 지연이 있다
- [RFC 5280 Section 5](https://www.rfc-editor.org/rfc/rfc5280#section-5)

**OCSP(Online Certificate Status Protocol):**
- CA의 OCSP 응답기에 개별 인증서의 상태를 실시간 질의
- 인증서의 Authority Information Access 확장에 OCSP 응답기 URL이 명시됨
- **OCSP Stapling**: 서버가 OCSP 응답을 미리 받아 TLS 핸드셰이크에 포함시킴. 클라이언트가 직접 OCSP 서버에 질의할 필요가 없다
- [RFC 6960](https://www.rfc-editor.org/rfc/rfc6960)

실무에서는 OCSP Stapling이 권장된다. 클라이언트의 프라이버시를 보호하고(어떤 사이트를 방문하는지 CA에 노출하지 않음), 연결 속도도 빠르다.

### 5.9 mTLS는 무엇이 추가된 것인가

**mTLS(mutual TLS)**는 TLS의 서버 인증에 더해 **클라이언트도 인증서를 제시**하는 방식이다.

TLS 1.3 흐름에서 서버가 `CertificateRequest`를 보내면, 클라이언트도:

- `Certificate`
- `CertificateVerify`
- `Finished`

를 보낼 수 있다. [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446)

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server

    C->>S: ClientHello + key_share
    S->>C: ServerHello + key_share
    S->>C: EncryptedExtensions
    S->>C: CertificateRequest ← mTLS 핵심
    S->>C: Certificate (서버)
    S->>C: CertificateVerify (서버)
    S->>C: Finished
    C->>C: 서버 인증서 검증
    C->>S: Certificate (클라이언트) ← mTLS 핵심
    C->>S: CertificateVerify (클라이언트) ← mTLS 핵심
    C->>S: Finished
    Note over C,S: 양쪽 모두 인증 완료
```

즉 차이는 간단하다.

- 일반 TLS: 보통 **서버만 인증서 제시**
- mTLS: **서버와 클라이언트 모두 인증서 제시**

### 5.10 mTLS를 오해하면 안 되는 지점

mTLS는 다음을 해 준다.

- 양쪽 신원 인증
- 채널 암호화
- 채널 무결성

하지만 다음까지 자동으로 해 주는 것은 아니다.

- 세밀한 권한 부여
- 요청 단위 business authorization
- 데이터 분류 정책
- 감사 정책

즉 "mTLS를 켰다 = zero trust 완성"은 틀린 이해다.

---

## 6. SSH와 TLS는 무엇이 다른가

둘 다 암호화와 인증을 제공하지만, 설계 철학과 신뢰 모델이 다르다.

| 항목 | SSH | TLS |
|------|-----|-----|
| 주 용도 | 원격 로그인, 터널링, 파일 전송 | HTTPS 등 애플리케이션 채널 보호 |
| 기본 포트 예시 | 22 | 443 |
| 서버 신원 확인 | host key / known_hosts | X.509 cert / CA trust store |
| 클라이언트 인증 | 비밀번호, 공개키, 인증서 등 | 보통 없음, 필요 시 client cert(mTLS) |
| 사용자 허용 목록 | `authorized_keys` | 애플리케이션/프록시 정책 |
| 공개키 파일 포맷 | OpenSSH 형식이 흔함 | X.509 / PKIX 생태계 |
| 신뢰 모델 | key pinning 또는 SSH CA | PKI와 CA 체인 |
| 키 교환 | KEXINIT로 협상 | ClientHello/ServerHello로 협상 |
| PFS | ECDHE 기본 지원 | TLS 1.3 필수, 1.2는 설정에 따라 |

가장 큰 차이는 **신뢰 모델**이다:

- SSH는 **Trust on First Use(TOFU)**: 처음 접속 시 host key를 기억하고, 이후 변경을 감지한다. 또는 SSH CA를 사용해 중앙 관리할 수 있다.
- TLS는 **PKI(Public Key Infrastructure)**: 사전에 신뢰된 CA 목록(trust store)으로부터 인증서 체인을 검증한다.

---

## 7. DevOps/DevSecOps 엔지니어가 반드시 알아야 할 기본 보안 지식

이제 파일과 프로토콜을 넘어, 운영자가 가져야 할 기본 보안 원칙을 정리한다.

### 7.1 최소 권한(Least Privilege)

NIST는 최소 권한을 "할당된 작업을 수행하는 데 필요한 최소한의 권한만 부여하는 보안 원칙"으로 정의한다. [NIST CSRC Glossary](https://csrc.nist.gov/glossary/term/least_privilege)

실무 적용:

- 사람 계정과 머신 계정을 분리
- 관리자 권한 상시 사용 금지
- 서비스 계정은 업무에 필요한 리소스에만 접근
- 읽기/쓰기/관리 권한 분리
- 가능하면 장기 자격증명보다 단기 자격증명 사용

### 7.2 Secret 관리

반드시 알아야 할 원칙:

- Git에 secret commit 금지
- 환경 변수는 편하지만 만능이 아님
- 가능하면 Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault 같은 전용 secret store 사용
- 복호화 권한과 secret 조회 권한 분리
- rotation 가능한 secret은 자동 회전
- 개인키는 "파일이 있으니 백업해두자"가 아니라 **누가 접근 가능한지**를 먼저 본다

특히 다음은 자주 발생하는 사고 패턴이다.

- `.env` 파일이 저장소에 올라감
- CI 로그에 토큰이 찍힘
- Kubernetes Secret을 "암호화돼 있으니 안전"하다고 오해함
- 만료된 인증서를 수동 교체하다가 개인키 유출

### 7.3 인증과 인가를 분리해서 설계

예를 들어:

- IAM Role이 있다고 해서 모든 API 호출을 허용하면 안 된다
- mTLS가 된다고 해서 모든 서비스 호출을 허용하면 안 된다
- Kubernetes RBAC가 있다고 해서 애플리케이션 레벨 권한까지 해결되는 것은 아니다

운영 관점에서는 보통 아래 층위가 따로 있다.

1. 네트워크 레벨 연결 허용 여부
2. 프로토콜 레벨 인증 여부
3. 애플리케이션 레벨 인가 여부
4. 데이터 레벨 접근 통제 여부

### 7.4 네트워크 보안은 "기본 허용"보다 "기본 차단"이 낫다

최소한 아래는 익숙해야 한다.

- Ingress / Egress 분리
- Security Group / Firewall / NACL 역할 차이
- East-West / North-South 트래픽 차이
- Private subnet / bastion / jump host
- Kubernetes NetworkPolicy
- 서비스 간 통신에서 TLS 또는 mTLS 필요 여부

실무에서 흔한 문제는 "외부 공개 포트만 막으면 된다"는 생각이다. 실제 사고는 내부 lateral movement, overly permissive egress, metadata endpoint 노출에서 많이 난다.

### 7.5 공급망(Supply Chain) 보안

이미지와 패키지는 "실행되기 전부터" 보안 대상이다.

최소한 알아야 할 것:

- image tag보다 **digest pinning**이 재현성이 높다
- 취약점 스캔 결과는 "개수"보다 **실제 exploitability**가 중요하다
- base image 업데이트 주기와 지원 종료일을 알아야 한다
- SBOM이 무엇인지 이해해야 한다
- 서명된 아티팩트와 provenance가 왜 필요한지 알아야 한다

DevSecOps에서 "빌드가 되면 배포"보다 중요한 것은 "무엇을 빌드했고, 어디서 왔고, 변조되지 않았는가"다.

### 7.6 로그와 감사(Audit)

보안은 예방만으로 끝나지 않는다. **누가, 언제, 무엇을 했는지**가 남아야 한다.

최소한 필요한 것:

- SSH 로그인 로그
- sudo / privilege escalation 로그
- CI/CD 실행 로그
- IAM 변경 로그
- Secret 접근 로그
- Kubernetes audit log / cloud control plane audit log

그리고 이 로그는 중앙화되어야 한다. 시스템이 침해됐을 때 같은 시스템의 로컬 로그만 믿는 것은 위험하다.

### 7.7 인증서와 키의 라이프사이클 관리

인증서/키 운영에서 자주 놓치는 것:

- 만료일 모니터링 부재
- intermediate 누락
- leaf cert만 교체하고 체인을 안 맞춤
- 서버 인증서 교체 후 오래된 개인키 계속 사용
- 개인키 백업본이 여기저기 남아 있음
- 루트/중간 CA 교체 계획 부재

운영자는 최소한 다음 질문에 답할 수 있어야 한다.

- 이 인증서는 어디에 배포돼 있는가?
- 누가 발급했는가?
- 어떤 개인키와 짝인가?
- 언제 만료되는가?
- 교체 자동화가 있는가?
- 폐기나 rotation 절차가 문서화돼 있는가?

### 7.8 패치와 지원 종료(EOL)

취약점 대응에서 중요한 것은 단순 CVE 숫자가 아니라:

- 이 버전이 아직 지원되는지
- 패치가 존재하는지
- 인터넷 노출 자산인지
- exploit가 쉬운지
- compensating control이 있는지

운영 체계가 성숙하려면 "정기 패치"와 "긴급 패치"가 분리돼 있어야 한다.

### 7.9 사람 계정 보안

사람 계정은 거의 항상 가장 약한 고리다.

최소한 기본기:

- MFA 적용
- 장기 static access key 최소화
- 개인 SSH 키 passphrase 사용
- 퇴사/이동 시 권한 회수 자동화
- shared account 금지
- break-glass 계정 관리

### 7.10 침해 대응 기본기

사고가 나면 보통 가장 먼저 해야 할 일은 "서비스를 빨리 다시 띄우기"가 아니라:

1. 확산 차단
2. 자격증명 회수/회전
3. 증거 보존
4. 영향 범위 파악
5. 원인 제거
6. 재발 방지

즉, DevOps 엔지니어도 운영 자동화만이 아니라 **rotation, revoke, isolate, restore**의 순서를 이해해야 한다.

### 7.11 Zero Trust Architecture

전통적 보안 모델은 "네트워크 경계 안쪽은 신뢰, 바깥쪽은 불신"이었다. Zero Trust는 이를 뒤집는다.

**핵심 원칙:** "아무것도 묵시적으로 신뢰하지 않는다. 모든 접근을 매번 검증한다."

NIST SP 800-207은 Zero Trust Architecture의 핵심 원칙을 다음과 같이 정의한다:

1. 모든 데이터 소스와 컴퓨팅 서비스를 **리소스**로 간주한다
2. 네트워크 위치와 관계없이 **모든 통신을 보호**한다
3. 기업 리소스 접근은 **세션 단위로 부여**한다
4. 리소스 접근은 **동적 정책**으로 결정한다 (클라이언트 ID, 애플리케이션, 요청 자산 상태, 행동 속성 등)
5. 기업은 소유/관련 자산의 **보안 상태를 모니터링하고 측정**한다
6. 인증과 인가는 **접근 허용 전에 엄격하게 시행**한다
7. 기업은 자산, 네트워크 인프라, 통신 상태에 대한 **정보를 수집하고 보안 개선에 사용**한다

[NIST SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final)

**DevSecOps 실무에서의 적용:**

| 전통 모델 | Zero Trust |
|-----------|------------|
| VPN 접속 = 내부 네트워크 전체 접근 | 각 서비스별 인증/인가 필요 |
| 방화벽 안쪽은 평문 통신 허용 | 내부 통신도 mTLS/암호화 |
| IP 기반 접근 제어 | ID 기반 접근 제어 |
| 한 번 인증하면 세션 종료까지 유효 | 지속적 검증 (continuous verification) |

Kubernetes + Istio/Cilium 환경에서 Zero Trust를 구현하는 일반적인 레이어:

```mermaid
flowchart TB
    A["1. 네트워크: NetworkPolicy로 Pod 간 기본 차단"] --> B["2. 전송: mTLS로 모든 서비스 간 통신 암호화"]
    B --> C["3. 인증: 서비스 ID 기반 peer 인증<br/>(SPIFFE/SPIRE, Istio Identity)"]
    C --> D["4. 인가: AuthorizationPolicy로<br/>서비스별/경로별/메서드별 접근 제어"]
    D --> E["5. 관측: 모든 접근에 대한 감사 로그"]
```

### 7.12 컨테이너 보안 (Container Security)

DevSecOps에서 컨테이너 보안은 빌드, 배포, 런타임 전 단계에 걸쳐 있다.

#### 빌드 타임

- **최소 base image 사용**: Alpine이나 distroless 이미지로 공격 표면을 줄인다
- **root 실행 금지**: Dockerfile에서 `USER nonroot` 설정
- **multi-stage 빌드**: 빌드 도구가 런타임 이미지에 포함되지 않게 한다
- **COPY vs ADD**: ADD는 URL 다운로드와 tar 자동 해제가 가능해서 예기치 않은 동작을 할 수 있다. COPY가 더 안전하다
- **secret 분리**: 빌드 인자로 secret을 넘기지 않는다. `--mount=type=secret` 사용

#### 배포 타임 (Kubernetes)

- **Pod Security Standards**: Kubernetes 1.25+에서 기본 제공. `restricted` 프로파일이 권장된다
  - `runAsNonRoot: true`
  - `allowPrivilegeEscalation: false`
  - `readOnlyRootFilesystem: true`
  - `seccompProfile: RuntimeDefault`
- **리소스 제한**: `resources.limits`를 반드시 설정. 리소스 제한 없는 컨테이너는 노드 전체에 영향을 줄 수 있다
- **이미지 정책**: 허용된 레지스트리에서만 이미지를 풀하도록 제한

[Kubernetes Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)

#### 런타임

- **읽기 전용 파일시스템**: 컨테이너 내부에 쓰기가 필요하면 명시적으로 volume을 마운트한다
- **syscall 제한**: seccomp 프로파일로 불필요한 시스템 콜을 차단한다
- **런타임 이상 탐지**: Falco 같은 도구로 비정상 프로세스 실행, 파일 접근, 네트워크 연결을 감지한다

### 7.13 Shift-Left Security: SAST, DAST, SCA

"Shift-Left"는 보안을 개발 프로세스 초기 단계로 당기는 것이다. 배포 후 발견하는 취약점은 수정 비용이 기하급수적으로 증가한다.

```mermaid
flowchart LR
    subgraph "Shift-Left"
        A["코드 작성"] --> B["코드 리뷰"]
        B --> C["빌드"]
        C --> D["테스트"]
        D --> E["스테이징"]
        E --> F["프로덕션"]
    end
    G["SAST"] -.->|"코드 분석"| A
    G -.-> B
    H["SCA"] -.->|"의존성 분석"| C
    I["DAST"] -.->|"실행 중 분석"| E
    J["Runtime Security"] -.->|"실시간 탐지"| F
```

| 도구 | 대상 | 시점 | 예시 |
|------|------|------|------|
| **SAST** (Static Application Security Testing) | 소스코드 | 코드 작성/리뷰 시 | Semgrep, SonarQube, CodeQL |
| **SCA** (Software Composition Analysis) | 오픈소스 의존성 | 빌드 시 | Snyk, Trivy, Dependabot |
| **DAST** (Dynamic Application Security Testing) | 실행 중인 애플리케이션 | 스테이징/프로덕션 | OWASP ZAP, Burp Suite |
| **IaC 스캐닝** | Terraform, Helm, Dockerfile | 코드 리뷰/빌드 시 | Checkov, tfsec, Trivy |

**CI/CD 파이프라인에 통합하는 패턴:**

```text
git push
  → SAST 스캔 (코드 취약점)
  → SCA 스캔 (의존성 CVE)
  → 컨테이너 이미지 빌드
  → 이미지 취약점 스캔 (Trivy)
  → IaC 스캐닝 (Checkov)
  → 테스트 환경 배포
  → DAST 스캔
  → 결과 임계값 초과 시 파이프라인 실패
```

### 7.14 Policy as Code

수동 검토에 의존하면 일관성이 떨어지고 확장이 안 된다. **정책을 코드로 정의하고 자동으로 시행**하는 것이 Policy as Code다.

| 도구 | 적용 대상 | 언어 |
|------|-----------|------|
| **OPA/Gatekeeper** | Kubernetes admission control | Rego |
| **Kyverno** | Kubernetes admission control | YAML (선언적) |
| **Sentinel** | Terraform 정책 | Sentinel |
| **Checkov** | IaC 파일 (Terraform, CloudFormation, K8s) | Python/YAML |

예를 들어, Kyverno로 "모든 Pod에 리소스 제한이 있어야 한다"를 강제할 수 있다:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-resource-limits
spec:
  validationFailureAction: Enforce
  rules:
  - name: check-limits
    match:
      any:
      - resources:
          kinds:
          - Pod
    validate:
      message: "CPU and memory limits are required"
      pattern:
        spec:
          containers:
          - resources:
              limits:
                memory: "?*"
                cpu: "?*"
```

핵심은 "사람이 리뷰할 때만 잡히는 것"을 "자동으로, 항상, 일관되게" 잡는 것이다.

### 7.15 Identity Federation: OIDC, SAML, JWT

서비스와 사용자가 많아지면 각 시스템에 개별 계정을 만드는 것은 관리가 불가능해진다. 그래서 **중앙 ID 제공자(IdP)**가 인증을 담당하고, 각 서비스는 그 결과를 신뢰하는 구조가 필요하다.

| 프로토콜 | 주 용도 | 토큰 형식 |
|----------|---------|-----------|
| **SAML 2.0** | 웹 SSO (주로 기업 환경) | XML 기반 Assertion |
| **OIDC** (OpenID Connect) | 웹/모바일/API 인증 | JWT (JSON Web Token) |
| **OAuth 2.0** | API 인가 | Access Token (JWT 또는 opaque) |

**OIDC 동작 흐름 (Authorization Code Flow):**

```mermaid
sequenceDiagram
    participant U as 사용자
    participant App as 애플리케이션
    participant IdP as ID 제공자<br/>(Keycloak, Okta 등)

    U->>App: 서비스 접근
    App->>IdP: 인증 요청 (redirect)
    IdP->>U: 로그인 페이지
    U->>IdP: 자격증명 제출
    IdP->>App: Authorization Code
    App->>IdP: Code → Token 교환<br/>(client_id + client_secret)
    IdP->>App: ID Token(JWT) + Access Token
    App->>App: JWT 서명 검증 + 클레임 확인
    App->>U: 인증된 세션
```

**DevOps에서 OIDC가 중요한 이유:**

- **CI/CD에서 장기 자격증명 제거**: GitHub Actions, GitLab CI 등이 OIDC로 AWS/GCP에 임시 자격증명을 발급받을 수 있다. 더 이상 IAM access key를 CI secret에 저장할 필요가 없다.
- **Kubernetes OIDC 인증**: kube-apiserver가 OIDC ID Token을 검증해 사용자를 인증할 수 있다.
- **서비스 메시 ID**: SPIFFE/SPIRE가 워크로드에 자동으로 ID를 부여하고, 서비스 간 mTLS에 사용한다.

[OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)

### 7.16 Encryption at Rest (저장 데이터 암호화)

TLS는 **전송 중(in transit)** 데이터를 보호한다. 하지만 데이터는 **저장 중(at rest)**에도 보호돼야 한다.

| 계층 | 방식 | 보호 대상 |
|------|------|-----------|
| **디스크/볼륨 수준** | LUKS, AWS EBS 암호화, GCE 디스크 암호화 | 물리적 디스크 도난/재사용 |
| **파일시스템 수준** | eCryptfs, fscrypt | 특정 디렉토리/파일 |
| **애플리케이션 수준** | 필드 단위 암호화, Envelope Encryption | 특정 민감 데이터 (PII, 카드번호 등) |
| **데이터베이스 수준** | TDE (Transparent Data Encryption) | DB 파일 전체 |

**Envelope Encryption 패턴:**

대부분의 클라우드 KMS가 사용하는 방식이다.

```mermaid
flowchart TB
    subgraph "암호화"
        A["KMS Master Key<br/>(HSM에 저장, 절대 외부 노출 안 됨)"] -->|"DEK 암호화"| B["Encrypted DEK"]
        C["Data Encryption Key(DEK)<br/>(로컬에서 랜덤 생성)"] -->|"데이터 암호화"| D["Encrypted Data"]
        C --> B
    end
    subgraph "저장"
        B --> E["Encrypted DEK + Encrypted Data<br/>함께 저장"]
    end
```

1. 로컬에서 **DEK(Data Encryption Key)**를 랜덤 생성한다
2. DEK로 데이터를 암호화한다 (빠른 대칭키 암호화)
3. KMS의 Master Key로 DEK를 암호화한다
4. 암호화된 DEK + 암호화된 데이터를 함께 저장한다
5. 복호화 시: KMS에 암호화된 DEK를 보내 복호화 → 원래 DEK로 데이터 복호화

**Kubernetes에서의 Encryption at Rest:**

Kubernetes Secret은 기본적으로 etcd에 **Base64 인코딩**으로 저장된다. 이것은 **암호화가 아니다**. etcd 접근 권한이 있으면 모든 Secret을 읽을 수 있다.

반드시 **EncryptionConfiguration**을 설정해야 한다:

```yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
      - secrets
    providers:
      - aescbc:
          keys:
            - name: key1
              secret: <base64-encoded-key>
      - identity: {}
```

또는 클라우드 KMS를 연동해 봉투 암호화를 사용하는 것이 권장된다.

[Kubernetes Encrypting Confidential Data at Rest](https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/)

### 7.17 Threat Modeling (위협 모델링)

보안은 "모든 곳에 모든 대책"이 아니라 **가장 위험한 곳에 가장 적절한 대책**을 배치하는 것이다. 위협 모델링은 이를 체계적으로 수행하는 방법이다.

**STRIDE 모델** (Microsoft가 제안, 가장 널리 사용):

| 위협 | 의미 | 대응 |
|------|------|------|
| **S**poofing | 신원 위장 | 인증 (AuthN) |
| **T**ampering | 데이터 변조 | 무결성 (해시, 서명, MAC) |
| **R**epudiation | 행위 부인 | 감사 로그, 부인 방지 |
| **I**nformation Disclosure | 정보 유출 | 암호화, 접근 제어 |
| **D**enial of Service | 서비스 거부 | 가용성, 부하 분산, rate limiting |
| **E**levation of Privilege | 권한 상승 | 인가 (AuthZ), 최소 권한 |

**DevSecOps에서 위협 모델링을 적용하는 시점:**

- 새로운 서비스/마이크로서비스 설계 시
- 기존 아키텍처에 외부 연동 추가 시
- 데이터 흐름이 변경될 때
- 인프라 전환(Docker Compose → K8s 등) 시

기본적인 질문 프레임워크:

1. **무엇을 만드는가?** (시스템 다이어그램, 데이터 흐름)
2. **무엇이 잘못될 수 있는가?** (STRIDE로 각 구성 요소 분석)
3. **잘못됐을 때 어떻게 대응하는가?** (완화 전략)
4. **제대로 했는가?** (검증)

### 7.18 OWASP Top 10: 웹 애플리케이션 보안 필수 지식

DevSecOps 엔지니어가 인프라만 알아서는 안 된다. 애플리케이션이 어떤 공격에 취약한지도 이해해야 한다. OWASP Top 10은 웹 애플리케이션의 가장 심각한 보안 위험 10가지를 정리한 것이다.

OWASP Top 10 (2021):

| 순위 | 위험 | DevOps 관련 포인트 |
|------|------|-------------------|
| A01 | **Broken Access Control** | API Gateway 인가 정책, RBAC 설정 검증 |
| A02 | **Cryptographic Failures** | TLS 설정, secret 관리, 약한 알고리즘 사용 |
| A03 | **Injection** | WAF 룰, 입력 검증, SQL/OS command injection |
| A04 | **Insecure Design** | 위협 모델링, 보안 요구사항 단계에서 정의 |
| A05 | **Security Misconfiguration** | 기본 계정/설정 제거, 불필요한 포트 닫기, 헤더 설정 |
| A06 | **Vulnerable Components** | SCA 도구, 의존성 업데이트, SBOM |
| A07 | **Authentication Failures** | MFA, brute-force 방지, 세션 관리 |
| A08 | **Software and Data Integrity Failures** | CI/CD 파이프라인 보호, 서명 검증, SBOM |
| A09 | **Security Logging and Monitoring Failures** | 중앙 로그, 알람, 감사 추적 |
| A10 | **SSRF** (Server-Side Request Forgery) | 메타데이터 엔드포인트 차단, 아웃바운드 트래픽 제어 |

[OWASP Top 10 (2021)](https://owasp.org/Top10/)

특히 **A10 SSRF**는 클라우드 환경에서 매우 위험하다. 공격자가 애플리케이션을 통해 `http://169.254.169.254` (클라우드 메타데이터 엔드포인트)에 접근하면 IAM 자격증명을 탈취할 수 있다. AWS IMDSv2나 GCP 메타데이터 서버 헤더 요구 설정은 반드시 적용해야 한다.

---

## 8. 실무에서 정말 자주 나오는 오해

### 8.1 "PEM = 인증서"

틀리다.
PEM은 텍스트 인코딩 방식이고, 안에 인증서가 들어갈 수도 있고 개인키가 들어갈 수도 있다.

### 8.2 ".crt니까 공개해도 된다"

대개는 맞지만 항상 그런 것은 아니다.
`.crt`는 보통 인증서지만, 민감한 메타데이터가 섞일 수 있고 파일명만으로 내용을 단정할 수 없다.

### 8.3 ".key는 그냥 인증서 짝 파일"

절반만 맞다.
`KEY`는 보통 개인키이며, **가장 민감한 파일 중 하나**다.

### 8.4 "authorized_keys는 인증서 저장소다"

아니다.
`authorized_keys`는 SSH 공개키 허용 목록이지 X.509 인증서 체인이 아니다.

### 8.5 "known_hosts는 접속 편의를 위한 캐시다"

아니다.
이 파일은 **서버 신원 검증**을 위한 trust database다. OpenSSH는 host key가 바뀌면 경고하고 MITM 방지를 위해 password auth까지 비활성화할 수 있다. [OpenSSH ssh(1)](https://man.openbsd.org/ssh.1)

### 8.6 "mTLS면 권한 문제도 끝난다"

아니다.
mTLS는 peer authentication과 channel protection을 제공하지만, 세밀한 authorization까지 해결하지는 않는다.

### 8.7 "암호화만 되어 있으면 안전하다"

아니다.
기밀성만 있고 무결성/인증/권한 통제가 없으면 실제 운영 보안은 쉽게 뚫린다.

### 8.8 "Kubernetes Secret은 암호화되어 있다"

기본적으로 아니다.
Kubernetes Secret은 etcd에 **Base64 인코딩**으로 저장된다. Base64는 암호화가 아니라 인코딩이다. 별도의 EncryptionConfiguration 또는 KMS 연동을 설정해야 진짜 암호화된다.

### 8.9 "TLS 1.2면 충분하다"

조건부로 맞다.
TLS 1.2 자체는 아직 사용 가능하지만, cipher suite 설정이 잘못되면 위험하다. RSA 키 교환(PFS 없음), CBC 모드(padding oracle), SHA-1(약한 해시) 등을 허용하면 안 된다. 가능하면 TLS 1.3을 우선하는 것이 맞다.

---

## 9. 이 글을 읽고 나면 최소한 구분할 수 있어야 하는 것

아래 질문에 답할 수 있으면 기본기는 잡힌 것이다.

**암호화 기본:**
- 대칭키와 비대칭키의 차이, 각각 실무에서 어디에 쓰이는지 설명할 수 있는가?
- AES-GCM이 CBC보다 나은 이유(AEAD)를 설명할 수 있는가?
- 비대칭키가 실무에서 주로 서명과 키 교환에 쓰인다는 것을 아는가?
- ECDHE와 PFS(Perfect Forward Secrecy)의 관계를 설명할 수 있는가?
- 하이브리드 암호화에서 비대칭키와 대칭키의 역할 분담을 설명할 수 있는가?

**파일과 형식:**
- `PEM`은 오브젝트 타입인가, 인코딩 형식인가?
- `CRT`와 `CER`만 보고 PEM/DER를 단정할 수 있는가?
- `KEY` 파일은 왜 민감한가?
- `authorized_keys`와 `known_hosts`는 누가 누구를 검증하는 파일인가?

**프로토콜:**
- SSH에서 서버 인증과 사용자 인증은 각각 어떤 키로, 어떤 단계에서 이뤄지는가?
- SSH 키 교환에서 교환 해시 H의 역할은 무엇인가?
- TLS 1.2와 1.3의 핸드셰이크 차이를 3가지 이상 말할 수 있는가?
- TLS에서 `Certificate`, `CertificateVerify`, `Finished`는 각각 무엇을 증명하는가?
- 0-RTT의 보안 위험과 사용 조건을 설명할 수 있는가?
- mTLS는 무엇을 추가하고, 무엇은 추가하지 않는가?

**DevSecOps:**
- Zero Trust의 핵심 원칙을 3가지 이상 말할 수 있는가?
- Shift-Left에서 SAST, SCA, DAST의 차이를 설명할 수 있는가?
- Kubernetes Secret이 기본적으로 왜 안전하지 않은지 설명할 수 있는가?
- STRIDE 모델의 6가지 위협과 각 대응을 연결할 수 있는가?
- Envelope Encryption 패턴을 설명할 수 있는가?
- 인증(authentication)과 인가(authorization)를 구분하는가?
- 최소 권한, secret rotation, audit log, certificate lifecycle 관리가 왜 중요한지 설명할 수 있는가?

---

## 10. 마무리

대부분의 사고는 다음처럼 아주 기본적인 오해에서 시작된다.

- 공개키와 개인키를 구분하지 못함
- `authorized_keys`와 인증서를 같은 종류로 생각함
- `ca-bundle`의 의미를 제품마다 다를 수 있다는 사실을 모름
- TLS와 mTLS를 "그냥 자물쇠 아이콘" 정도로만 이해함
- 인증과 인가를 같은 것으로 봄
- Base64 인코딩을 암호화로 착각함
- "내부 네트워크는 안전하다"고 가정함

운영자는 "이 파일 이름이 익숙하다" 수준을 넘어서, **무엇이 비밀이고, 누가 누구를 검증하며, 어떤 trust model 위에 서비스가 서 있는지**를 설명할 수 있어야 한다.

그리고 DevSecOps 엔지니어라면 한 걸음 더 나아가 **보안이 개발-배포-운영 전 단계에 내장되는 구조**를 만들 수 있어야 한다. "사후 점검"이 아니라 "사전 내재화"가 DevSecOps의 핵심이다.

---

## References

- [RFC 4252 - The Secure Shell (SSH) Authentication Protocol](https://www.rfc-editor.org/rfc/rfc4252)
- [RFC 4253 - The Secure Shell (SSH) Transport Layer Protocol](https://www.rfc-editor.org/rfc/rfc4253)
- [RFC 5246 - The Transport Layer Security (TLS) Protocol Version 1.2](https://www.rfc-editor.org/rfc/rfc5246)
- [RFC 5280 - Internet X.509 Public Key Infrastructure Certificate and Certificate Revocation List (CRL) Profile](https://www.rfc-editor.org/rfc/rfc5280)
- [RFC 6176 - Prohibiting Secure Sockets Layer (SSL) Version 2.0](https://www.rfc-editor.org/rfc/rfc6176)
- [RFC 6960 - X.509 Internet Public Key Infrastructure Online Certificate Status Protocol - OCSP](https://www.rfc-editor.org/rfc/rfc6960)
- [RFC 7468 - Textual Encodings of PKIX, PKCS, and CMS Structures](https://www.rfc-editor.org/rfc/rfc7468)
- [RFC 7568 - Deprecating Secure Sockets Layer Version 3.0](https://www.rfc-editor.org/rfc/rfc7568)
- [RFC 8032 - Edwards-Curve Digital Signature Algorithm (EdDSA)](https://www.rfc-editor.org/rfc/rfc8032)
- [RFC 8446 - The Transport Layer Security (TLS) Protocol Version 1.3](https://www.rfc-editor.org/rfc/rfc8446)
- [RFC 8996 - Deprecating TLS 1.0 and TLS 1.1](https://www.rfc-editor.org/rfc/rfc8996)
- [RFC 9325 - Recommendations for Secure Use of TLS and DTLS](https://datatracker.ietf.org/doc/html/rfc9325)
- [NIST FIPS 197 - Advanced Encryption Standard (AES)](https://csrc.nist.gov/pubs/fips/197/final)
- [NIST SP 800-57 Part 1 - Recommendation for Key Management](https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final)
- [NIST SP 800-207 - Zero Trust Architecture](https://csrc.nist.gov/pubs/sp/800/207/final)
- [NIST CSRC Glossary - least privilege](https://csrc.nist.gov/glossary/term/least_privilege)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [OWASP Top 10 (2021)](https://owasp.org/Top10/)
- [Kubernetes Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- [Kubernetes Encrypting Confidential Data at Rest](https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/)
- [OpenSSH ssh(1)](https://man.openbsd.org/ssh.1)
- [OpenSSH sshd_config(5)](https://man.openbsd.org/sshd_config)
- [OpenSSL openssl-x509](https://docs.openssl.org/3.3/man1/openssl-x509/)
- [OpenSSL pkey](https://docs.openssl.org/1.1.1/man1/pkey/)
- [OpenSSL verify](https://docs.openssl.org/1.1.1/man1/verify/)
