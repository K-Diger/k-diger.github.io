---
title: "키, 인증서, SSH, TLS를 한 번에 정리하고 가로채기 시나리오까지 따라가기"
date: 2026-01-05
categories: [DevOps, Security]
tags: [security, devsecops, ssh, tls, mtls, pki, mitm, pem, crt, key, authorized_keys, known_hosts, aes, rsa, ecdhe, ed25519]
layout: post
toc: true
mermaid: true
---

## 배경

보안 관련 파일과 프로토콜을 다룰 때마다 반쯤만 이해한 채로 넘어가는 것들이 있었다.

- 대칭키, 비대칭키, 개인키, 공개키가 각각 언제 쓰이는가. 특히 RSA와 AES와 SHA-256이 한 연결 안에 다 나오는데, 이것들이 서로 경쟁하는 선택지인가 아니면 각자 다른 일을 하는가.
- `.crt`, `.key`, `.pem`, `.csr`, `ca-bundle.pem`, `authorized_keys`가 다 무엇이고 서로 어떻게 다른가.
- SSH와 SSL/TLS는 무엇이 다른가. 둘 다 암호화하는데 왜 따로 있는가.
- HTTP와 HTTPS는 정확히 어디서 갈라지는가.

그리고 마지막이 가장 오래 걸렸다.

**통신 중간에서 해커가 가로챘을 때 각각 어떻게 되는가.** HTTP는 다 읽힌다는 것까지는 알겠는데, HTTPS는 왜 안 읽히는가. 안 읽힌다면 회사 보안 프록시나 Burp Suite는 어떻게 내 HTTPS를 다 보여주는가. SSH는 인증서도 CA도 없는데 무엇으로 상대를 확인하는가. `REMOTE HOST IDENTIFICATION HAS CHANGED` 경고는 정확히 무엇이 달라졌다는 뜻인가.

용어 하나하나를 풀어가면서 순서대로 정리했다. 앞에서 정의한 개념만 써서 뒤를 설명하도록 배치했으므로 위에서부터 읽는 것이 좋다.

이 글에서 인용하는 명세와 문서는 직접 확인한 뒤 한국어로 다시 정리했고, 원문 위치는 링크로 남겼다.

---

## 참고자료

- [RFC 8446 - TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446.html)
- [RFC 5246 - TLS 1.2](https://www.rfc-editor.org/rfc/rfc5246.html)
- [RFC 5280 - X.509 인증서와 CRL 프로파일](https://www.rfc-editor.org/rfc/rfc5280.html)
- [RFC 7468 - PEM 형식](https://www.rfc-editor.org/rfc/rfc7468.html)
- [RFC 4251 - SSH 프로토콜 아키텍처](https://www.rfc-editor.org/rfc/rfc4251.html)
- [RFC 4252 - SSH 인증 프로토콜](https://www.rfc-editor.org/rfc/rfc4252.html)
- [RFC 4253 - SSH 전송 계층 프로토콜](https://www.rfc-editor.org/rfc/rfc4253.html)
- [RFC 9110 - HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [RFC 6797 - HSTS](https://www.rfc-editor.org/rfc/rfc6797.html)
- [RFC 2104 - HMAC](https://www.rfc-editor.org/rfc/rfc2104.html)
- [NIST FIPS 197 - AES](https://csrc.nist.gov/pubs/fips/197/final)
- [NIST SP 800-38D - GCM 운영 모드](https://csrc.nist.gov/pubs/sp/800/38/d/final)
- [OpenSSL 문서](https://docs.openssl.org/master/)

---

## 1. 개념부터 하나씩

### 1.1 비밀인 것과 비밀이 아닌 것

먼저 이것부터 나눠야 나머지가 정리된다.

**비밀이어야 하는 것**은 개인키(private key), 비밀번호, 토큰이다. 유출되면 그 순간 남이 나를 흉내 낼 수 있다.

**비밀이 아니어도 되는 것**은 공개키(public key), 서버 인증서(certificate), CA 인증서다. 오히려 널리 배포되어야 제 역할을 한다.

다만 "비밀이 아니다"와 "아무렇게나 관리해도 된다"는 다르다. 공개 정보라도 **누가 바꿔치기하지 못하게** 지켜야 한다. 신뢰하는 CA 인증서 목록이 조작되면 그 순간 전체 검증이 무너진다. 뒤에서 다시 나온다.

### 1.2 대칭키 암호: 같은 키로 잠그고 연다

암호화할 때와 복호화할 때 **같은 키**를 쓰는 방식이다.

```mermaid
flowchart LR
    P["평문(plaintext)<br/>읽을 수 있는 원래 데이터"] -->|"키 K로 암호화"| C["암호문(ciphertext)<br/>읽을 수 없는 데이터"]
    C -->|"같은 키 K로 복호화"| P2["평문(plaintext)"]
```

빠르다. 그래서 실제로 오가는 데이터는 거의 전부 이쪽이 처리한다.

#### AES가 무엇인가

AES(Advanced Encryption Standard)는 가장 널리 쓰이는 대칭키 알고리즘이다. 미국 표준기술연구소(NIST)가 2001년 표준으로 정했다. 자세한 정의는 [NIST FIPS 197](https://csrc.nist.gov/pubs/fips/197/final)에 있다.

AES는 **블록 암호(block cipher)** 다. 블록 암호란 데이터를 정해진 크기 덩어리로 잘라서 덩어리 하나씩 처리하는 방식을 말한다. AES의 덩어리 크기는 128비트, 즉 16바이트로 고정되어 있다.

키 길이는 세 가지를 고를 수 있고, 길수록 내부 변환을 더 많이 반복한다.

| 이름 | 키 길이 | 라운드 수 |
|---|---|---|
| AES-128 | 128비트 | 10 |
| AES-192 | 192비트 | 12 |
| AES-256 | 256비트 | 14 |

내부에서 무슨 변환을 하는지보다 실무에서 중요한 것은 **키 길이를 무엇으로 고를 것인가**와 **운용 모드를 무엇으로 고를 것인가**다.

참고로 요즘 CPU에는 AES-NI라는 AES 전용 명령어가 들어 있다. 하드웨어가 직접 처리하므로 소프트웨어로 계산하는 것보다 몇 배 빠르다.

#### 운용 모드가 왜 필요한가

AES는 16바이트 블록 하나만 처리한다. 그런데 실제 데이터는 16바이트보다 훨씬 크다. 그래서 **여러 블록을 어떤 방식으로 이어 붙여 처리할 것인가**를 정해야 하고, 그 방식을 운용 모드(mode of operation)라고 부른다.

| 모드 | 이름 | 어떻게 동작하는가 | 실무 |
|---|---|---|---|
| ECB | Electronic Codebook | 블록마다 독립적으로 암호화 | 쓰면 안 된다 |
| CBC | Cipher Block Chaining | 이전 암호문 블록을 다음 블록 입력에 XOR. 시작값으로 IV(초기화 벡터)가 필요 | TLS 1.2까지 쓰였으나 1.3에서 제거 |
| CTR | Counter | 카운터 값을 암호화한 뒤 평문과 XOR. 블록끼리 독립이라 병렬 처리 가능 | GCM의 기반 |
| GCM | Galois/Counter Mode | CTR 모드에 GMAC이라는 인증 태그 계산을 붙인 것 | TLS 1.2, 1.3에서 권장 |

**ECB를 쓰면 안 되는 이유**가 직관적이다. 블록마다 독립적으로 암호화하므로 **같은 평문 블록이 항상 같은 암호문 블록이 된다.** 이미지를 ECB로 암호화하면 원본의 윤곽이 그대로 보인다. 데이터의 패턴이 암호문에 그대로 남는다는 뜻이다.

**CBC의 문제**는 다른 곳에 있다. 암호화는 제대로 하지만 **데이터가 중간에 바뀌었는지를 확인하는 장치가 없다.** 공격자가 암호문 바이트를 뒤집으면 복호화 결과가 이상해지는데, 서버가 그 이상함에 어떻게 반응하는지를 관찰해서 평문을 알아내는 공격이 있다. 패딩 오라클(padding oracle) 공격이라고 부른다.

#### AEAD, 암호화와 무결성을 한 번에

그래서 나온 것이 AEAD다. Authenticated Encryption with Associated Data의 줄임말이고, 우리말로 옮기면 "연관 데이터를 포함한 인증된 암호화"다.

이름이 길지만 하는 일은 두 가지다. **암호화**하고, 동시에 **중간에 바뀌지 않았음을 증명하는 값(인증 태그)** 을 만든다.

```mermaid
flowchart LR
    subgraph AESGCM["AES-GCM"]
        P["평문"] --> ENC["AES-CTR로 암호화"]
        ENC --> C["암호문"]
        C --> GMAC["GMAC 계산"]
        AAD["부가 인증 데이터<br/>암호화하지 않지만<br/>변조는 막고 싶은 부분<br/>(헤더 등)"] --> GMAC
        GMAC --> T["인증 태그 16바이트"]
    end
```

받는 쪽은 **인증 태그를 먼저 검사하고, 통과해야만 복호화**한다. 태그가 맞지 않으면 복호화 결과를 아예 돌려주지 않는다. 그래서 공격자가 암호문을 조금 바꿔서 반응을 보는 공격이 성립하지 않는다.

"연관 데이터(Associated Data)"라는 부분이 붙은 이유도 있다. 패킷에는 암호화하면 안 되는 부분이 있다. 예를 들어 어느 연결의 데이터인지 알려주는 헤더는 중간 장비가 읽어야 하므로 평문이어야 한다. 그런데 그 헤더도 위조되면 안 된다. AEAD는 이 부분을 "암호화는 안 하지만 인증 태그 계산에는 포함"시켜서 해결한다.

TLS 1.3은 **AEAD만 허용**한다. CBC 같은 비인증 모드는 통째로 제거됐다. TLS 1.3이 정의하는 암호 스위트가 다섯 개뿐인 것도 이 때문이다.

#### ChaCha20-Poly1305

AES-GCM의 대안이다. ChaCha20은 스트림 암호(블록으로 자르지 않고 키스트림을 만들어 평문과 XOR하는 방식)이고, Poly1305는 여기에 붙는 인증 태그 계산 알고리즘이다. 둘을 합쳐 AEAD를 이룬다. 정의는 [RFC 8439](https://datatracker.ietf.org/doc/html/rfc8439)에 있다.

AES-NI 같은 전용 명령어가 없는 CPU에서 AES보다 빠르다. 주로 모바일 기기가 여기 해당한다. 그래서 모바일 트래픽이 많은 서버는 이쪽을 우선순위에 두기도 한다.

#### 대칭키의 근본적인 문제

여기까지가 **읽히지 않게 만드는 부분**이다. 공격자가 AES-GCM으로 암호화된 바이트를 아무리 들여다봐도 키 없이는 복원하지 못한다.

그런데 문제가 하나 남는다. **그 키를 상대와 어떻게 나눠 갖는가.**

처음 만나는 서버와 같은 키를 공유해야 하는데, 그 키를 전달하려면 이미 안전한 통로가 필요하다. 안전한 통로를 만들려고 키를 나누는 건데 키를 나누려고 안전한 통로가 필요하다. 순환이다.

이 문제를 푸는 것이 다음 절이다.

### 1.3 비대칭키 암호: 키가 두 개다

수학적으로 짝지어진 **두 개의 키**를 쓴다. 공개키(public key)와 개인키(private key)다.

성질이 두 가지다.

- 공개키로 잠근 것은 **개인키로만** 열 수 있다.
- 개인키로 서명한 것은 **공개키로만** 검증할 수 있다.

```mermaid
flowchart TB
    subgraph ENC["용도 1. 암호화 (기밀성)"]
        P1["평문"] -->|"받는 사람의 공개키로 암호화"| C1["암호문"]
        C1 -->|"받는 사람의 개인키로 복호화"| P1R["평문"]
    end
    subgraph SIG["용도 2. 전자서명 (인증과 무결성)"]
        M["메시지"] -->|"보낸 사람의 개인키로 서명"| S["서명값"]
        S -->|"보낸 사람의 공개키로 검증"| V["검증 성공 또는 실패"]
    end
```

두 용도가 정반대 방향이라는 점이 헷갈리기 쉽다. 암호화는 **받는 사람의** 공개키를 쓰고, 서명은 **보내는 사람의** 개인키를 쓴다.

#### RSA가 무엇인가

RSA는 **큰 수를 소인수분해하기 어렵다**는 성질에 기댄 알고리즘이다. 만든 세 사람(Rivest, Shamir, Adleman)의 머리글자에서 이름을 땄다.

큰 소수 두 개를 곱하는 것은 쉽다. 그런데 그 곱셈 결과만 주고 원래 두 소수를 찾으라고 하면 지금 기술로는 현실적인 시간 안에 못 한다. 공개키와 개인키가 이 관계로 묶여 있다.

암호화와 서명을 둘 다 할 수 있다. 대신 **느리다.** 그래서 대량 데이터를 직접 암호화하는 데는 쓰지 않는다.

키 길이는 현재 최소 2048비트이고, [NIST SP 800-57 Part 1](https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final)은 2031년 이후 3072비트 이상을 권고한다.

#### 타원곡선 암호: ECDSA와 Ed25519

타원곡선 암호(ECC, Elliptic Curve Cryptography)는 RSA와 다른 수학 문제에 기댄다. 타원곡선이라는 곡선 위에서 점을 여러 번 더하는 연산을 정의하는데, 결과 점만 보고 몇 번 더했는지를 역산하는 것이 어렵다. 이것을 타원곡선 이산로그 문제라고 부른다.

장점은 **같은 안전성을 훨씬 짧은 키로 얻는다**는 것이다.

| 안전성 수준(비트) | RSA 키 길이 | 타원곡선 키 길이 |
|---|---|---|
| 128 | 3072비트 | 256비트 |
| 192 | 7680비트 | 384비트 |
| 256 | 15360비트 | 521비트 |

"안전성 수준 128비트"는 공격자가 평균 2의 128제곱번 시도해야 뚫린다는 뜻이다. RSA는 3072비트가 필요한데 타원곡선은 256비트면 같은 수준이 나온다.

**ECDSA**는 타원곡선 기반 서명 알고리즘이다. **Ed25519**는 그 개량판으로, ECDSA에서 서명할 때마다 새 난수가 필요하고 그 난수를 재사용하면 개인키가 노출되는 문제가 있었는데, 난수 대신 결정론적 값을 쓰도록 바꿔 그 위험을 없앴다. 정의는 [RFC 8032](https://datatracker.ietf.org/doc/html/rfc8032)에 있다.

지금 SSH와 TLS에서 가장 권장되는 것이 Ed25519다. 공개키가 32바이트, 서명이 64바이트로 매우 짧다.

```bash
# 같은 수준 안전성에서 키 크기 차이를 직접 본다
ssh-keygen -t rsa -b 3072 -f /tmp/k_rsa -N ''    # 공개키 약 570자
ssh-keygen -t ed25519 -f /tmp/k_ed -N ''          # 공개키 약 80자
```

#### 그런데 비대칭키로 키를 전달하면 문제가 하나 남는다

1.2절 끝의 순환 문제로 돌아가자. 비대칭키가 있으면 이렇게 풀 수 있다.

클라이언트가 대칭키 재료를 만들어서 **서버 공개키로 암호화해서** 보낸다. 서버만 개인키로 열 수 있다. 이 방식을 RSA 키 전송이라고 부르고, TLS 1.2 이하에서 실제로 썼다.

그런데 여기에 문제가 있다. **공격자가 오가는 트래픽을 통째로 저장해두었다가, 나중에 서버 개인키를 손에 넣으면 저장해둔 과거 트래픽을 전부 복호화할 수 있다.** 대칭키 재료가 회선을 지나갔기 때문이다.

이것을 "harvest now, decrypt later"(지금 모아두고 나중에 푼다)라고 부른다. 그래서 다른 방법이 필요했다.

### 1.4 Diffie-Hellman: 키를 보내지 않고 나눠 갖기

Diffie-Hellman(DH)은 암호화 알고리즘도 아니고 서명 알고리즘도 아니다. **두 사람이 공개된 통로만 써서 같은 비밀값에 도달하는 방법**이다. 키를 전송하지 않는다는 것이 요점이다.

먼저 필요한 용어 두 개를 짚는다.

**mod(모듈러 연산)** 는 나눗셈의 나머지를 구하는 연산이다. `17 mod 5`는 2다. 큰 수를 다루면서도 결과를 일정 범위 안에 가둘 수 있다.

**이산로그 문제**는 `g^a mod p = A`에서 `g`, `p`, `A`를 알 때 `a`를 구하는 문제다. `p`가 충분히 크면 현실적인 시간 안에 못 푼다. DH의 안전성이 여기에 기댄다.

동작은 이렇다.

```mermaid
sequenceDiagram
    participant A as Alice
    participant E as 도청자
    participant B as Bob
    Note over A,B: 공개 파라미터: 소수 p, 생성원 g<br/>(도청자도 알고 있다)
    A->>A: 비밀값 a를 무작위로 고른다
    A->>B: A = g^a mod p 를 보낸다
    Note over E: g^a mod p 를 볼 수 있다
    B->>B: 비밀값 b를 무작위로 고른다
    B->>A: B = g^b mod p 를 보낸다
    Note over E: g^b mod p 도 볼 수 있다
    A->>A: 공유 비밀 = B^a mod p = g^(ab) mod p
    B->>B: 공유 비밀 = A^b mod p = g^(ab) mod p
    Note over A,B: 양쪽이 같은 g^(ab) mod p 에 도달
    Note over E: g^a 와 g^b 만으로는<br/>g^(ab) 를 계산할 수 없다
```

같은 값에 도달하는 이유는 지수 법칙이다. `(g^b)^a`와 `(g^a)^b`는 둘 다 `g^(ab)`다.

도청자는 `g^a mod p`와 `g^b mod p`를 다 본다. 그런데 `g^(ab) mod p`를 계산하려면 `a`나 `b` 중 하나를 알아야 하고, 그것을 구하는 것이 이산로그 문제다.

#### ECDH: 타원곡선 위에서 하는 DH

같은 원리를 정수 대신 타원곡선 위에서 하는 것이다. 앞서 본 것처럼 같은 안전성을 짧은 키로 얻는다.

TLS 1.3과 SSH에서 가장 널리 쓰는 곡선이 **X25519**다. 더 높은 강도가 필요하면 X448을 쓴다. TLS 1.3이 정의하는 그룹 목록은 [RFC 8446 4.2.7절](https://datatracker.ietf.org/doc/html/rfc8446#section-4.2.7)에 있다.

#### ECDHE의 마지막 글자 E

**ECDHE**는 `EC` + `DH` + `E`로 읽는다.

- `EC`: Elliptic Curve, 타원곡선 위에서 한다
- `DH`: Diffie-Hellman, 위에서 본 키 합의 방식
- `E`: Ephemeral, 임시

`E`가 뜻하는 것은 **연결마다 비밀값 `a`, `b`를 새로 만들고 연결이 끝나면 버린다**는 것이다. 이 글자 하나가 만드는 성질이 크다.

#### Perfect Forward Secrecy, 전방향 안전성

비밀값을 매번 새로 만들고 버리면 어떤 일이 생기는가.

**서버의 장기 개인키가 나중에 유출되어도, 과거에 기록해둔 트래픽은 복호화할 수 없다.** 그 세션의 대칭키는 이미 폐기된 임시 비밀값으로 만들어졌고, 그 임시값은 어디에도 저장되지 않았기 때문이다.

이 성질을 Perfect Forward Secrecy(PFS), 우리말로 전방향 안전성이라고 부른다.

```mermaid
flowchart TB
    subgraph NOPFS["PFS 없음 (RSA 키 전송)"]
        A1["서버 개인키 유출"] --> B1["저장해둔 트래픽에서<br/>대칭키 재료 복호화"] --> C1["과거 통신 전부<br/>복호화 가능"]
    end
    subgraph YESPFS["PFS 있음 (ECDHE)"]
        A2["서버 개인키 유출"] --> B2["임시 비밀값은<br/>이미 폐기됨"] --> C2["과거 통신은<br/>복호화 불가"]
    end
```

TLS 1.3이 RSA 키 전송을 아예 제거하고 모든 키 교환에 임시 DH를 의무화한 이유가 이것이다.

### 1.5 해시, MAC, 전자서명은 각각 다르다

이 셋을 섞으면 프로토콜 동작을 계속 반쯤 틀리게 이해하게 된다.

#### 해시

임의 길이 입력을 고정 길이 값으로 줄이는 함수다. SHA-256은 입력이 무엇이든 256비트(32바이트)를 내놓는다.

성질이 셋이다. 되돌릴 수 없고, 입력이 1비트만 달라도 출력이 완전히 달라지고, 서로 다른 입력이 같은 출력을 내는 경우(충돌)를 찾기 어렵다.

SHA-1과 MD5는 충돌이 실제로 만들어졌으므로 서명 용도로 쓰면 안 된다.

**해시만으로는 무결성을 보장하지 못한다.** 공격자가 데이터를 고치고 해시도 다시 계산해서 붙이면 그만이기 때문이다. 그래서 키가 필요하다.

#### MAC

Message Authentication Code, 메시지 인증 코드다. **키를 섞은 해시**라고 보면 된다. 같은 키를 가진 쪽만 그 값을 만들 수 있으므로, 값이 맞으면 "같은 키를 가진 상대가 만들었고 중간에 안 바뀌었다"가 증명된다.

가장 흔한 구현이 HMAC이다. 앞서 본 AES-GCM의 인증 태그도 같은 역할을 한다.

#### 전자서명

비대칭키를 쓴다. 개인키로 만들고 공개키로 검증한다.

MAC과의 결정적 차이는 이것이다. **MAC은 양쪽이 같은 키를 가지므로 "상대가 만든 것"이라고 제3자에게 증명할 수 없다.** 내가 만들었을 수도 있기 때문이다. 서명은 개인키를 가진 쪽만 만들 수 있으므로 제3자에게도 증명된다. 이것을 부인 방지(non-repudiation)라고 부른다.

TLS 인증서에 MAC이 아니라 서명이 붙는 이유가 이것이다.

| | 하는 일 | 키 | 누가 검증할 수 있는가 |
|---|---|---|---|
| 해시 (SHA-256) | 지문 생성 | 없음 | 누구나. 대신 위조도 누구나 |
| MAC (HMAC, GMAC) | 무결성 + 출처 | 대칭키 (양쪽이 공유) | 같은 키를 가진 쪽만 |
| 서명 (RSA, Ed25519) | 무결성 + 출처 + 부인 방지 | 비대칭키 | 공개키를 가진 누구나 |

### 1.6 인증과 인가는 다르다

- **인증(Authentication, AuthN)**: 너는 누구인가
- **인가(Authorization, AuthZ)**: 너는 무엇을 할 수 있는가

뒤에 나올 mTLS는 양쪽 신원을 인증하지만, 그 자체로 "이 클라이언트가 이 API를 호출해도 되는가"까지 정하지는 않는다. 그 판단은 별도의 인가 정책이 한다.

### 1.7 인증서는 키가 아니라 공개키에 대한 증명서다

X.509 인증서는 공개키, 주체(Subject), 발급자(Issuer), 유효기간, 확장 정보를 담은 데이터 구조다.

"이 공개키는 `example.com`의 것이다"라고 제3자(CA)가 서명해서 보증한 문서라고 보면 된다. 인증서 안에 개인키는 들어 있지 않다.

검증은 **내가 신뢰하는 뿌리(trust anchor)에서 대상 인증서까지 이어지는 서명 사슬을 확인**하는 방식이다. 절차는 [RFC 5280](https://datatracker.ietf.org/doc/html/rfc5280)에 정의되어 있다.

### 1.8 하이브리드 암호화, 실무에서의 결합

지금까지 본 것을 합치면 실제 프로토콜의 뼈대가 나온다.

RSA-2048 암호화는 AES-256보다 대략 1000배 느리다. 그래서 대량 데이터를 비대칭키로 암호화하지 않는다. SSH와 TLS 모두 같은 패턴을 쓴다.

```mermaid
flowchart TB
    A["1단계. 비대칭키 계열로 키 합의<br/>ECDHE로 공유 비밀 도출"] --> B["2단계. 키 도출 함수로<br/>세션 대칭키 생성"]
    B --> C["3단계. 대칭키로 실제 데이터 암호화<br/>AES-256-GCM 등"]
```

2단계의 **키 도출 함수(KDF, Key Derivation Function)** 를 설명하고 넘어간다. DH로 얻은 공유 비밀은 그 자체로 암호화 키로 쓰기에 적절하지 않다. 길이도 안 맞고, 여러 용도에 쓸 키가 여러 개 필요하기 때문이다. 그래서 공유 비밀을 입력으로 넣어 용도별 키를 뽑아내는 함수를 거친다. TLS 1.3은 HKDF(HMAC 기반 KDF)를 쓴다.

### 1.9 암호 스위트 이름 읽기

이제 앞의 개념들이 하나로 모인다. TLS 1.2의 암호 스위트 이름은 **누가 어느 일을 맡는지를 그대로 적어놓은 것**이다.

```
TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
     └─┬─┘ └┬┘      └──────┬──────┘ └──┬──┘
    키 합의  인증        대칭 암호화     해시
```

- `ECDHE`: 세션키를 어떻게 합의할 것인가 (1.4절)
- `RSA`: 서버가 신원을 어떻게 증명할 것인가, 즉 서명 알고리즘 (1.3절)
- `AES_128_GCM`: 실제 데이터를 어떻게 암호화할 것인가 (1.2절)
- `SHA256`: 키 도출과 무결성 계산에 어떤 해시를 쓸 것인가 (1.5절)

**이것들은 서로 경쟁하는 선택지가 아니다.** 한 연결 안에서 각자 다른 일을 맡는다.

TLS 1.3에서는 이름이 `TLS_AES_128_GCM_SHA256`으로 짧아졌다. 키 합의는 (EC)DHE로, 인증 방식은 별도 확장으로 고정됐기 때문에 스위트 이름에서 빠진 것이다.

연결 하나가 시작될 때 순서는 이렇다.

```mermaid
flowchart TB
    A["1. 키 합의<br/>ECDHE<br/>양쪽이 공유 비밀 계산"] --> B["2. 키 유도<br/>HKDF + SHA-256<br/>용도별 세션키 생성"]
    B --> C["3. 신원 증명<br/>RSA 또는 Ed25519 서명<br/>CertificateVerify"]
    C --> D["4. 데이터 암호화<br/>AES-128-GCM 또는 ChaCha20-Poly1305"]
```

SSH도 구조가 같다. 키 합의는 `curve25519-sha256`, 호스트 인증은 `ssh-ed25519` 서명, 데이터는 `chacha20-poly1305` 또는 `aes256-gcm`이 맡는다. 이름만 다르고 분업의 형태는 동일하다.

실제로 무엇이 협상됐는지는 직접 확인할 수 있다.

```bash
# TLS
openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null \
  | grep -E "Protocol|Cipher|Peer signature type|Server Temp Key"

# SSH
ssh -vv server.example.com 2>&1 | grep -E "kex:|cipher:|host key algorithm"
```

`Server Temp Key: X25519, 253 bits`처럼 나오면 ECDHE가 쓰였다는 뜻이다. 이 줄이 없으면 RSA 키 전송이라 전방향 안전성이 없다.

### 1.10 비대칭키가 실무에서 실제로 쓰이는 곳

개념만 보면 "그래서 언제 쓰는 건데"가 남는다. 매일 쓰고 있는데 의식하지 못할 뿐이다. 다섯 가지를 보면 패턴이 보인다.

#### 사례 1. `ssh user@server`

SSH 접속 한 번에 비대칭키가 **두 번** 쓰인다.

```mermaid
sequenceDiagram
    participant Me as 내 노트북<br/>(~/.ssh/id_ed25519)
    participant Srv as 서버<br/>(/etc/ssh/ssh_host_ed25519_key)

    Note over Me,Srv: 1단계. 서버 인증, 이 서버가 진짜 맞나
    Me->>Srv: TCP 연결 후 키 교환 시작
    Srv->>Me: 서버 호스트 공개키 + 교환 해시에 대한 서명
    Me->>Me: 이 공개키가 known_hosts에 있는지 확인
    Me->>Me: 서명을 그 공개키로 검증
    Note over Me: 비대칭키 용도: 전자서명 검증

    Note over Me,Srv: 2단계. 키 합의, ECDH로 대칭키 도출

    Note over Me,Srv: 3단계. 사용자 인증, 내가 접속 권한이 있나
    Me->>Srv: 이 공개키로 로그인하겠다 + 세션 식별자를 개인키로 서명
    Srv->>Srv: authorized_keys에서 그 공개키를 찾는다
    Srv->>Srv: 서명을 그 공개키로 검증
    Srv->>Me: 인증 성공
    Note over Me: 비대칭키 용도: 전자서명 생성
```

| 단계 | 누가 서명 | 누가 검증 | 확인하는 것 |
|---|---|---|---|
| 서버 인증 | 서버 (호스트 개인키) | 클라이언트 (`known_hosts`의 공개키) | 이 서버가 가짜가 아닌지 |
| 사용자 인증 | 클라이언트 (`id_ed25519`) | 서버 (`authorized_keys`의 공개키) | 이 사람에게 접속 권한이 있는지 |

SSH에서 비대칭키는 **암호화가 아니라 서명**으로 쓰인다. 데이터 암호화는 키 합의 후 만들어진 대칭키가 한다.

#### 사례 2. `https://api.example.com`

HTTPS 접속에서는 비대칭키가 세 가지 역할을 한다.

| 역할 | 하는 일 | 용도 |
|---|---|---|
| 키 합의 | ECDH로 양쪽이 공유 비밀에 도달 | DH 키 합의 |
| 인증서 검증 | CA가 서버 인증서에 해둔 서명을 CA 공개키로 검증 | 서명 검증 |
| 서버 신원 증명 | 서버가 핸드셰이크 내용을 자기 개인키로 서명 | 서명 생성 |

여기서도 실제 HTTP 요청과 응답의 암호화는 대칭키가 한다.

#### 사례 3. 인증서 발급 (`certbot`)

```mermaid
sequenceDiagram
    participant Ops as 운영자 (certbot)
    participant CA as 인증기관

    Note over Ops: 준비. 키 쌍 생성
    Ops->>Ops: 개인키 server.key 생성, 공개키 추출

    Note over Ops,CA: 1. CSR 생성
    Ops->>Ops: CSR = 공개키 + 도메인명 + 조직명
    Ops->>Ops: CSR 전체를 개인키로 서명
    Note over Ops: 이 CSR을 만든 사람이 개인키를 갖고 있다는 증명
    Ops->>CA: CSR 제출

    Note over Ops,CA: 2. 도메인 소유권 검증
    CA->>Ops: 이 토큰을 특정 경로에 올려라
    Ops->>Ops: 토큰 배치
    CA->>Ops: HTTP로 토큰 확인

    Note over Ops,CA: 3. 인증서 발급
    CA->>CA: CSR의 공개키 + 도메인명으로 인증서 생성
    CA->>CA: CA 개인키로 인증서에 서명
    Note over CA: 이 공개키가 이 도메인의 것이라는 보증
    CA->>Ops: 서명된 인증서 server.crt
```

결과물은 두 파일이다. `server.key`는 내 개인키라 절대 비밀이고, `server.crt`는 CA가 서명한 인증서라 공개해도 된다.

#### 사례 4. Git 커밋 서명

```bash
git commit -S -m "message"
```

커밋 내용(트리 해시, 부모 해시, 메시지)을 내 개인키로 서명하고, 서명값이 커밋 객체에 포함된다. 다른 사람이 내 공개키로 검증하면 "이 커밋을 정말 이 사람이 만들었다"가 확인된다. GitHub에서 커밋에 Verified 배지가 붙는 것이 이 검증이 통과했다는 뜻이다.

#### 사례 5. 컨테이너 이미지 서명

```bash
# 빌드 파이프라인에서 서명
cosign sign --key cosign.key registry.example.com/app:v1.2.3

# 배포 시점 admission webhook에서 검증
cosign verify --key cosign.pub registry.example.com/app:v1.2.3
```

레지스트리에 올린 이미지가 중간에 바뀌지 않았음을 보증한다. 공급망 보안의 기본이 이 서명이다.

#### 다섯 사례를 관통하는 것

```mermaid
flowchart TB
    A["비대칭키의 실무 용도"] --> B["1. 전자서명<br/>(대부분)"]
    A --> C["2. 키 합의<br/>(DH, ECDH)"]
    A --> D["3. 직접 암호화<br/>(거의 안 씀)"]

    B --> B1["SSH 서버, 사용자 인증"]
    B --> B2["TLS CertificateVerify"]
    B --> B3["인증서 발급 시 CA 서명"]
    B --> B4["Git 커밋 서명"]
    B --> B5["이미지, 아티팩트 서명"]

    C --> C1["TLS ECDHE"]
    C --> C2["SSH ECDH"]

    D --> D1["TLS 1.2 RSA 키 전송<br/>(제거됨, PFS 없음)"]
    D --> D2["PGP 이메일 암호화"]
```

실무에서 비대칭키가 데이터를 직접 암호화하는 경우는 사실상 없다. **서명과 키 합의가 거의 전부**다. 실제 데이터 암호화는 항상 대칭키가 한다.

---

## 2. 파일 형식: PEM, CRT, KEY, CSR, ca-bundle, authorized_keys

### 2.1 먼저 표로 한 번

| 이름 | 보통 무엇이 들어 있는가 | 비밀인가 | 짚어둘 점 |
|---|---|---|---|
| `PEM` | 인증서, 공개키, 개인키, CSR 등을 텍스트로 감싼 형식 | 내용에 따라 다름 | **형식**이지 내용물 종류가 아니다 |
| `CRT`, `CER` | 보통 인증서 | 보통 비밀 아님 | 확장자는 관례. PEM일 수도 DER일 수도 있다 |
| `KEY` | 보통 개인키 | **비밀** | 내부 형식은 여러 가지 |
| `CSR` | 인증서 서명 요청 | 보통 비밀 아님 | 공개키와 주체 정보가 들어가고 CA에 제출 |
| `ca-bundle` | 여러 CA 인증서 묶음 | 보통 비밀 아님 | 신뢰 저장소일 수도, 체인 보조 파일일 수도 |
| `authorized_keys` | SSH 로그인을 허용할 공개키 목록 | 비밀 아님 | 서버가 **클라이언트**를 검증 |
| `known_hosts` | 신뢰하는 SSH 서버 호스트 키 목록 | 비밀 아님 | 클라이언트가 **서버**를 검증 |

### 2.2 PEM은 형식이지 내용이 아니다

가장 많이 헷갈리는 지점이다. PEM은 **바이너리 데이터를 텍스트로 감싸는 방법**이다. 무엇을 감쌌는지는 별개다.

생김새는 이렇다.

```text
-----BEGIN CERTIFICATE-----
BASE64...
-----END CERTIFICATE-----
```

```text
-----BEGIN PRIVATE KEY-----
BASE64...
-----END PRIVATE KEY-----
```

두 파일 다 PEM이다. 그런데 하나는 공개해도 되는 인증서이고 하나는 절대 노출되면 안 되는 개인키다. **`BEGIN ... END ...` 라벨이 내용물을 알려준다.**

주요 라벨은 이렇다.

- `BEGIN CERTIFICATE`: 인증서
- `BEGIN CERTIFICATE REQUEST`: CSR
- `BEGIN PUBLIC KEY`: 공개키
- `BEGIN PRIVATE KEY`: 개인키 (PKCS#8 형식)
- `BEGIN ENCRYPTED PRIVATE KEY`: 암호로 잠긴 개인키
- `BEGIN RSA PRIVATE KEY`: 개인키 (구형 형식)

PEM의 정의는 [RFC 7468](https://datatracker.ietf.org/doc/html/rfc7468)에 있다. 이 문서는 **한 파일에 여러 개가 연속으로 들어갈 수 있다**고도 정한다. 그래서 PEM 파일 하나에 인증서 여러 장이 붙어 있는 경우가 흔하다.

**DER**이라는 것도 알아둘 필요가 있다. PEM이 텍스트라면 DER은 같은 내용의 바이너리 형태다. PEM은 DER을 base64로 인코딩하고 앞뒤에 라벨을 붙인 것이라고 보면 된다.

### 2.3 CRT와 CER

둘 다 보통 인증서 파일에 붙는 이름이다. 다만 이것들은 **정식 타입 이름이 아니라 파일명 관례**에 가깝다. 실제 내용은 PEM일 수도 DER일 수도 있다.

RFC 7468은 텍스트 인코딩된 인증서에 `.crt`를 쓸 것을 권하지만 실제로는 `.cer`를 쓰는 도구도 많다고 언급한다. 그리고 오래된 등록 정보는 `.cer`를 DER 기반 단일 인증서로 설명한다.

정리하면 `server.crt`를 보고 "서버 인증서일 가능성이 높다" 정도만 말할 수 있고, PEM인지 DER인지는 열어봐야 안다.

### 2.4 KEY

보통 개인키 파일이다. 내부 형식은 여러 가지다.

| 라벨 | 형식 |
|---|---|
| `BEGIN PRIVATE KEY` | PKCS#8, 암호화 안 됨 |
| `BEGIN ENCRYPTED PRIVATE KEY` | PKCS#8, 암호로 잠김 |
| `BEGIN RSA PRIVATE KEY` | 구형 PEM RSA |
| `BEGIN EC PRIVATE KEY` | 구형 PEM 타원곡선 |
| `BEGIN OPENSSH PRIVATE KEY` | OpenSSH 전용 형식 |

OpenSSL은 현재 표준 개인키 출력 형식으로 PKCS#8을 쓰고, `-traditional` 옵션을 주면 구형 형식으로 낸다. 상세는 [OpenSSL pkey 문서](https://docs.openssl.org/1.1.1/man1/pkey/)에 있다.

### 2.5 CSR

Certificate Signing Request, 인증서 서명 요청이다.

```text
-----BEGIN CERTIFICATE REQUEST-----
...
-----END CERTIFICATE REQUEST-----
```

들어 있는 것은 공개키, 주체 정보, CA에 요청할 확장 정보, 그리고 그 요청 전체에 대한 서명이다.

**개인키는 CSR에 들어 있지 않다.** 서명이 들어 있을 뿐이고, 그 서명이 "이 CSR을 만든 사람이 대응하는 개인키를 갖고 있다"를 증명한다.

### 2.6 ca-bundle

표준 타입 이름이 아니라 **여러 CA 인증서를 한 파일에 묶어둔 관례적 이름**이다. 실무에서 두 가지 다른 의미로 쓰인다.

**신뢰 저장소(trust store) 역할.** "내가 믿기로 한 CA들의 목록"이다. OpenSSL `verify -CAfile`에 주는 파일이 이 역할이다.

**체인 보조 파일 역할.** 서버 인증서와 루트 CA 사이에 있는 중간 CA들을 묶어둔 파일이다. 서버가 클라이언트에게 보내주는 용도다.

그래서 `ca-bundle.crt`라는 이름만으로는 루트 묶음인지 중간 체인인지 섞여 있는지 알 수 없다. 제품 문서와 파일 내용을 같이 봐야 한다.

### 2.7 authorized_keys와 known_hosts

이 둘은 위 파일들과 계보가 아예 다르다. X.509 인증서 체계가 아니라 SSH 체계다.

**`authorized_keys`** 는 서버 쪽 사용자 계정에 있다. "이 계정으로 로그인해도 되는 클라이언트 공개키 목록"이다. 서버가 클라이언트를 검증하는 데 쓴다.

**`known_hosts`** 는 클라이언트에 있다. "내가 접속해본 적 있는 서버들의 호스트 공개키 목록"이다. 클라이언트가 서버를 검증하는 데 쓴다.

방향이 정반대다. 이 둘을 섞어서 생각하면 계속 헷갈린다.

| 파일 | 누가 갖고 있나 | 무엇을 저장 | 누가 누구를 검증 |
|---|---|---|---|
| `~/.ssh/authorized_keys` | 서버 | 로그인 허용 공개키 | 서버가 클라이언트를 |
| `~/.ssh/known_hosts` | 클라이언트 | 서버 호스트 공개키 | 클라이언트가 서버를 |

### 2.8 파일 이름은 아무것도 보장하지 않는다

지금까지 반복해서 나온 결론이다.

- `server.crt`라고 항상 PEM인 것은 아니다.
- `server.key`라고 항상 PKCS#8인 것은 아니다.
- `ca-bundle.crt`라고 항상 루트 CA만 들어 있는 것은 아니다.

확장자보다 **내용을 봐야 한다.**

### 2.9 내용을 확인하는 명령들

```bash
# 인증서 (PEM)
openssl x509 -in server.crt -text -noout

# 인증서 (DER)
openssl x509 -inform DER -in server.cer -text -noout

# 개인키
openssl pkey -in server.key -text -noout

# CSR
openssl req -in server.csr -text -noout

# 신뢰 CA 파일로 체인 검증
openssl verify -CAfile ca-bundle.crt server.crt

# 중간 CA를 따로 지정해 검증
openssl verify -CAfile root-ca.crt -untrusted intermediate-ca.crt server.crt

# SSH 공개키 지문
ssh-keygen -lf ~/.ssh/id_ed25519.pub

# 개인키에서 공개키 추출
ssh-keygen -y -f ~/.ssh/id_ed25519

# 만료일과 주체, 발급자만 빠르게
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null \
  | openssl x509 -noout -dates -subject -issuer
```

라벨만 빠르게 보고 싶으면 이렇게 한다.

```bash
grep -- '-----BEGIN' unknown-file.pem
```

---

## 3. SSH를 정확히 이해하기

### 3.1 SSH가 무엇인가

안전하지 않은 네트워크 위에서 원격 로그인과 그 밖의 보안 네트워크 서비스를 제공하는 프로토콜이다. 강한 암호화, 서버 인증, 무결성 보호를 제공한다고 [RFC 4253](https://datatracker.ietf.org/doc/html/rfc4253)이 규정한다.

리눅스 서버 접속 명령이라고만 알기 쉬운데, 실제로는 그 위에 여러 서비스가 올라간다. 원격 로그인, 명령 실행, 포트 포워딩, 파일 전송(SCP, SFTP), 터널링이 전부 이 채널을 쓴다.

### 3.2 SSH의 키는 두 종류다

이것부터 분리해야 한다.

**서버 호스트 키.** 서버 자신의 신원이다. `/etc/ssh/ssh_host_ed25519_key`에 개인키가, `.pub`에 공개키가 있다. 클라이언트는 이 공개키를 `known_hosts`에 기억한다.

**사용자 키 쌍.** 사용자가 로그인할 때 쓴다. `~/.ssh/id_ed25519`가 개인키, `.pub`이 공개키다. 서버는 허용할 공개키를 `authorized_keys`에서 확인한다.

이 둘을 섞으면 `authorized_keys`와 `known_hosts`의 차이가 영원히 안 잡힌다.

| 파일 | 의미 | 비밀인가 |
|---|---|---|
| `~/.ssh/id_ed25519` | 사용자 개인키 | **비밀** |
| `~/.ssh/id_ed25519.pub` | 사용자 공개키 | 아님 |
| `/etc/ssh/ssh_host_ed25519_key` | 서버 호스트 개인키 | **비밀** |
| `/etc/ssh/ssh_host_ed25519_key.pub` | 서버 호스트 공개키 | 아님 |
| `~/.ssh/authorized_keys` | 로그인 허용 공개키 목록 | 아님 |
| `~/.ssh/known_hosts` | 신뢰하는 서버 호스트 키 목록 | 아님 |

OpenSSH는 개인키 파일의 권한이 너무 열려 있으면 그 키를 아예 무시한다. `chmod 600`이 필요한 이유다.

### 3.3 키 교환 단계

SSH 연결에서 가장 먼저 일어나는 일이다. 절차는 [RFC 4253](https://datatracker.ietf.org/doc/html/rfc4253)에 정의되어 있다.

**1. 프로토콜 버전 교환.** 양쪽이 버전 문자열을 주고받는다.

```text
SSH-2.0-OpenSSH_9.7
```

**2. 알고리즘 협상 (`SSH_MSG_KEXINIT`).** 지원하는 알고리즘 목록을 교환한다.

| 협상 항목 | 예시 |
|---|---|
| 키 교환 | `curve25519-sha256`, `diffie-hellman-group16-sha512` |
| 서버 호스트 키 | `ssh-ed25519`, `rsa-sha2-512` |
| 암호화 (방향별) | `chacha20-poly1305@openssh.com`, `aes256-gcm@openssh.com` |
| MAC (방향별) | `hmac-sha2-256-etm@openssh.com` (AEAD를 쓰면 불필요) |
| 압축 | `none`, `zlib@openssh.com` |

양쪽 목록에서 **서로 지원하는 첫 번째 알고리즘**이 선택된다.

**3. 키 교환 실행.**

```mermaid
sequenceDiagram
    participant C as SSH Client
    participant S as SSH Server
    C->>S: SSH_MSG_KEX_ECDH_INIT<br/>클라이언트 ECDH 공개값
    S->>S: ECDH 공유 비밀 계산
    S->>S: 교환 해시 H 계산
    S->>S: 호스트 개인키로 H에 서명
    S->>C: SSH_MSG_KEX_ECDH_REPLY<br/>호스트 공개키 + 서버 ECDH 공개값 + H 서명
    C->>C: ECDH 공유 비밀 계산
    C->>C: 호스트 공개키로 서명 검증
    C->>C: known_hosts에서 그 호스트 키 확인
    Note over C,S: 공유 비밀에서 세션 키 도출
```

여기서 **교환 해시 H**가 핵심 장치다. H를 계산할 때 들어가는 재료가 정해져 있다.

- 클라이언트 버전 문자열
- 서버 버전 문자열
- 클라이언트 `KEXINIT` 페이로드
- 서버 `KEXINIT` 페이로드
- 서버 호스트 공개키
- 클라이언트 DH 공개값
- 서버 DH 공개값
- 공유 비밀

즉 **지금까지 주고받은 모든 것과 방금 합의한 비밀이 전부 들어간다.** 서버가 이 H에 호스트 개인키로 서명해서 보내면, 클라이언트는 `known_hosts`에 있는 공개키로 그 서명을 검증한다.

이 설계 덕분에 두 가지가 동시에 확인된다. 서버가 진짜 그 호스트 개인키를 갖고 있다는 것과, 협상 과정이 중간에 조작되지 않았다는 것이다. 공격자가 `KEXINIT`에서 약한 알고리즘만 남기도록 고치면 H가 달라져서 서명 검증이 깨진다.

그리고 **첫 키 교환의 H가 세션 식별자(session id)가 된다.** 뒤에서 다시 나온다.

**4. 세션 키 도출.** 공유 비밀과 H로부터 암호화 키, MAC 키, IV를 **방향별로 따로** 만든다. 클라이언트에서 서버로 가는 키와 반대 방향 키가 분리되어 있다.

**5. `SSH_MSG_NEWKEYS`.** 양쪽이 이 메시지를 보내면 그 시점부터 모든 통신이 새 키로 암호화된다.

### 3.4 사용자 인증 단계

암호화 채널이 만들어진 뒤에 시작된다. 절차는 [RFC 4252](https://datatracker.ietf.org/doc/html/rfc4252)에 있다.

공개키 인증에서 클라이언트는 **개인키를 서버로 보내지 않는다.** 서명만 만들어 보낸다. 그 서명의 대상이 무엇인지가 중요하다.

RFC 4252가 규정하는 서명 대상은 아래 항목을 순서대로 이어붙인 것이다.

1. **세션 식별자** (3.3절의 교환 해시 H)
2. 메시지 타입 (`SSH_MSG_USERAUTH_REQUEST`)
3. 사용자 이름
4. 서비스 이름
5. 문자열 `"publickey"`
6. 불리언 `TRUE`
7. 공개키 알고리즘 이름
8. 인증에 사용할 공개키

맨 앞의 세션 식별자가 이 서명을 **다른 세션에서 재사용할 수 없게** 만든다. H에는 양쪽의 임시 DH 공개값이 들어가므로 세션마다 값이 다르다. 도청으로 서명을 통째로 복사해도 다른 연결에서는 검증에 실패한다.

같은 RFC가 세션 식별자를 두고 "이 세션을 고유하게 식별하며, 개인키 소유를 증명하기 위해 서명하기에 적합하다"고 설명한다.

### 3.5 전체 흐름

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
        S->>C: SSH_MSG_KEX_ECDH_REPLY (호스트 키 + 서버 DH 공개값 + 서명)
        C->>C: 호스트 키 검증 (known_hosts)
        C->>S: SSH_MSG_NEWKEYS
        S->>C: SSH_MSG_NEWKEYS
    end

    rect rgb(240, 255, 240)
        Note over C,S: User Authentication Layer (여기부터 암호화됨)
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

정리하면 **서버 인증은 호스트 키로 Transport Layer에서**, **사용자 인증은 사용자 키로 Authentication Layer에서** 이뤄진다. 서로 다른 계층, 다른 단계다.

### 3.6 재키잉

같은 세션 키를 오래 쓰면 암호학적으로 약해진다. 그래서 SSH는 연결 도중에도 키 교환을 다시 할 수 있다. 양쪽 어느 쪽이든 `SSH_MSG_KEXINIT`를 다시 보내면 시작된다. OpenSSH 기본값은 1GB 전송 후 또는 1시간 후다.

### 3.7 실무 사례: Jenkins가 개인키만으로 서버에 접속하는 원리

배포 파이프라인에서 SSH 플러그인 설정 화면에 개인키 내용을 통째로 붙여넣으면 접속이 된다. 이게 어떤 원리인지 위 흐름에 대입하면 바로 풀린다.

설정 화면에 넣는 것은 **대상 서버에 접속할 사용자의 개인키**다.

```text
Kind:       SSH Username with private key
Username:   deploy
Private Key:
  -----BEGIN OPENSSH PRIVATE KEY-----
  b3BlbnNzaC1rZXktdjEAAAAABG5vbmUA...
  -----END OPENSSH PRIVATE KEY-----
```

접속할 때 3.3절과 3.4절이 그대로 일어난다.

```mermaid
sequenceDiagram
    participant J as Jenkins<br/>(Credentials의 개인키)
    participant D as 배포 서버<br/>(~deploy/.ssh/authorized_keys)

    Note over J,D: 1. Transport Layer, 키 교환
    J->>D: TCP 연결 + SSH_MSG_KEXINIT
    D->>J: SSH_MSG_KEX_ECDH_REPLY (호스트 키 + 서명)
    J->>J: 호스트 키 검증
    Note over J,D: 암호화 채널 성립

    Note over J,D: 2. User Authentication Layer
    J->>D: SSH_MSG_USERAUTH_REQUEST (deploy 사용자, publickey)
    J->>J: 세션 식별자와 요청 데이터를 개인키로 서명
    J->>D: 서명 전송
    D->>D: authorized_keys에서 대응 공개키 검색
    D->>D: 그 공개키로 서명 검증
    D->>J: SSH_MSG_USERAUTH_SUCCESS

    Note over J,D: 3. Connection Layer, 배포 명령 실행
    J->>D: scp build.jar /app/ 또는 sh deploy.sh
```

터미널에서 `ssh deploy@server`를 치는 것과 **완전히 같은 프로토콜**이 돈다. 차이는 개인키를 `~/.ssh/id_rsa` 파일에서 읽느냐 자격증명 저장소에서 읽느냐뿐이다.

성립 조건을 분해하면 셋이다.

| 조건 | 대응하는 절 |
|---|---|
| 개인키가 있으니 서명을 만들 수 있다 | 3.4절 |
| 서버 `authorized_keys`에 대응 공개키가 있으니 허용 판단이 된다 | 3.4절 |
| 개인키로 만든 서명을 공개키로 검증할 수 있다 | 1.3절 |

#### 여기서 따라오는 보안 문제

자격증명 저장소에 개인키를 넣는다는 것은 **그 CI 서버가 배포 서버 접속 권한을 보유한다**는 뜻이다.

- CI 서버 자체의 보안이 곧 배포 서버의 보안이 된다. CI가 뚫리면 개인키가 나가고 배포 서버까지 열린다.
- 개인키에 passphrase를 걸면 파일이 유출돼도 바로는 못 쓴다.
- 개인 계정 키를 넣지 말고 **배포 전용 키를 따로** 만든다. 그 사람이 퇴사하거나 키를 교체하면 파이프라인이 깨진다.
- `authorized_keys`에 제한자를 걸어 그 키로 할 수 있는 일을 좁힌다.

```text
# 배포 서버의 ~/.ssh/authorized_keys
command="/app/deploy.sh",from="10.0.1.50" ssh-ed25519 AAAA... jenkins-deploy-key
```

이렇게 두면 이 키로는 지정한 스크립트만 실행할 수 있고, 지정한 IP에서만 접속할 수 있다.

---

## 4. TLS, SSL, mTLS

### 4.1 SSL과 TLS는 같은 말이 아니다

아직도 "SSL 인증서"라고 많이 부르지만 지금 쓰는 것은 대부분 TLS다. SSL이 먼저 나왔고 TLS가 그 후속 표준이다.

| 버전 | 상태 | 근거 |
|---|---|---|
| SSL 2.0 | 사용 금지 | [RFC 6176](https://datatracker.ietf.org/doc/html/rfc6176) |
| SSL 3.0 | 사용 금지 | [RFC 7568](https://datatracker.ietf.org/doc/html/rfc7568) |
| TLS 1.0, 1.1 | 사용 금지 | [RFC 8996](https://datatracker.ietf.org/doc/html/rfc8996) |
| TLS 1.2 | 최소선 | |
| TLS 1.3 | 우선 사용 | |

[RFC 9325](https://datatracker.ietf.org/doc/html/rfc9325)가 이 권고를 정리한다. SSL 2.0, 3.0과 TLS 1.0, 1.1은 협상하면 안 되고, TLS 1.2를 지원하되 1.3을 우선 쓰라는 내용이다.

### 4.2 TLS가 제공하는 것

핸드셰이크가 하는 일은 네 가지다. 프로토콜 버전 협상, 암호 알고리즘 선택, 필요하면 상호 인증, 공유 비밀키 성립이다.

그 결과로 얻는 것이 셋이다. **기밀성**(남이 못 읽음), **무결성**(중간에 안 바뀜), **인증**(상대가 맞음).

### 4.3 TLS 1.2 핸드셰이크

1.3에서 무엇이 바뀌었는지 보려면 1.2를 먼저 봐야 한다.

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server

    rect rgb(255, 245, 230)
        Note over C,S: 평문 구간 (암호화 안 됨)
        C->>S: ClientHello<br/>TLS 버전, 지원 암호 스위트 목록,<br/>클라이언트 랜덤값
        S->>C: ServerHello<br/>선택된 암호 스위트, 서버 랜덤값
        S->>C: Certificate (서버 인증서 체인)
        S->>C: ServerKeyExchange<br/>ECDHE 파라미터와 서명<br/>(RSA 키 전송 시에는 생략)
        S->>C: ServerHelloDone
    end

    rect rgb(230, 255, 230)
        Note over C,S: 키 교환
        C->>C: 서버 인증서 체인 검증
        C->>S: ClientKeyExchange<br/>클라이언트 ECDH 공개값<br/>또는 RSA로 암호화한 pre-master secret
        Note over C,S: 양쪽이 pre-master secret에서 master secret 도출
        Note over C,S: master secret에서 세션 키 도출
        C->>S: ChangeCipherSpec (이제부터 암호화)
        C->>S: Finished (암호화됨)
        S->>C: ChangeCipherSpec
        S->>C: Finished (암호화됨)
    end

    rect rgb(230, 230, 255)
        Note over C,S: 암호화된 애플리케이션 데이터
    end
```

키 도출은 세 단계다. 먼저 DH 또는 RSA로 pre-master secret을 합의하고, 거기에 양쪽 랜덤값을 섞어 master secret을 만들고, 거기서 세션 키(암호화 키, MAC 키, IV)를 뽑는다.

TLS 1.2의 문제가 넷이다.

- **2-RTT.** 핸드셰이크에 왕복이 두 번 필요하다. `ServerHelloDone`까지 한 번, `Finished`까지 한 번.
- **RSA 키 전송을 허용한다.** 1.3절에서 본 그대로 전방향 안전성이 없다.
- **CBC 모드를 허용한다.** 패딩 오라클 계열 공격에 노출된다.
- **암호 스위트 조합이 수백 가지다.** 그중 안전한 것을 골라야 한다.

### 4.4 TLS 1.3 핸드셰이크

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server

    rect rgb(255, 245, 230)
        Note over C,S: 1-RTT 핸드셰이크
        C->>S: ClientHello<br/>지원 암호 스위트,<br/>key_share에 ECDH 공개값 미리 포함,<br/>supported_groups, signature_algorithms
    end

    rect rgb(230, 255, 230)
        Note over C,S: 서버 응답 (이 시점부터 암호화)
        S->>C: ServerHello<br/>선택된 스위트, key_share에 서버 ECDH 공개값
        Note over C,S: 양쪽이 ECDHE로 handshake secret 도출
        S->>C: EncryptedExtensions
        S->>C: Certificate (서버 인증서 체인)
        S->>C: CertificateVerify<br/>핸드셰이크 전체에 대한 서버 개인키 서명
        S->>C: Finished
    end

    rect rgb(230, 230, 255)
        C->>C: 인증서 체인 검증 + 서명 검증
        C->>S: Finished
        Note over C,S: 암호화된 애플리케이션 데이터
    end
```

바뀐 것을 표로 정리하면 이렇다.

| 항목 | TLS 1.2 | TLS 1.3 |
|---|---|---|
| 핸드셰이크 왕복 | 2-RTT | **1-RTT** (0-RTT도 가능) |
| 키 교환 | RSA, DHE, ECDHE | **(EC)DHE만**, 전방향 안전성 필수 |
| 암호화 모드 | CBC, GCM, CCM | **AEAD만** |
| 서버 인증서 | 평문 전송 | **암호화 전송** |
| 해시 | MD5, SHA-1 허용 | SHA-256, SHA-384만 |
| ChangeCipherSpec | 있음 | 제거 |
| 암호 스위트 수 | 수백 개 | **5개** |
| 재협상 | 가능 (취약점 원인) | 제거 |
| 압축 | 가능 (CRIME 공격) | 제거 |

**1-RTT가 가능해진 이유**는 클라이언트가 `ClientHello`에 `key_share`를 미리 넣기 때문이다. 1.2에서는 서버가 파라미터를 먼저 줘야 클라이언트가 키 교환을 시작할 수 있었다. 1.3에서는 클라이언트가 "아마 이 곡선을 쓸 것"이라고 추측해서 공개값을 미리 보낸다. 추측이 틀리면 서버가 `HelloRetryRequest`로 다시 요청하고, 그때만 왕복이 한 번 더 든다.

**서버 인증서가 암호화되는 것**도 큰 변화다. 1.2에서는 도청자가 인증서를 그대로 볼 수 있었다. 1.3에서는 `ServerHello` 직후부터 암호화되므로 볼 수 없다.

#### CertificateVerify가 하는 일

TLS 1.3에서 서버 개인키가 쓰이는 유일한 자리다. [RFC 8446 4.4.3절](https://datatracker.ietf.org/doc/html/rfc8446#section-4.4.3)이 목적을 두 가지로 규정한다.

1. 이 종단이 자기 인증서에 대응하는 **개인키를 갖고 있음을 증명**한다.
2. 이 시점까지의 **핸드셰이크에 대한 무결성**을 제공한다.

서명 대상이 인증서 하나가 아니라 **그때까지 오간 핸드셰이크 메시지 전체의 해시(트랜스크립트 해시)** 라는 점이 요점이다. SSH의 교환 해시 H와 같은 발상이다. 공격자가 `ClientHello`에서 암호 스위트 목록을 약한 것만 남기도록 고쳐도, 그 조작이 해시를 바꿔 서명 검증에서 걸린다.

같은 RFC가 서명 앞에 0x20 바이트 64개와 문맥 문자열을 붙이는 이유도 설명한다. 이전 버전에서 공격자가 원하는 32바이트 접두사를 가진 메시지의 서명을 얻어낼 수 있었던 문제를 막기 위해서다.

#### 0-RTT 재연결

한 번 연결했던 서버에 다시 붙을 때 왕복 없이 데이터를 먼저 보낼 수 있다.

1. 이전 연결에서 서버가 PSK(Pre-Shared Key, 미리 공유된 키)를 발급한다.
2. 다음 연결에서 클라이언트가 `ClientHello`와 함께 PSK로 암호화한 early data를 보낸다.
3. 서버는 `ServerHello`를 보내기 전에 그 데이터를 처리할 수 있다.

**주의할 점이 있다.** early data는 **재전송 공격(replay attack)** 에 취약하다. 공격자가 그 데이터를 캡처해서 서버에 다시 보낼 수 있다. 그래서 0-RTT에는 여러 번 실행돼도 결과가 같은 요청만 보내야 한다. `GET`은 괜찮지만 `POST`는 위험하다.

### 4.5 세 메시지의 역할

| 메시지 | 증명하는 것 | 실패하면 |
|---|---|---|
| `Certificate` | 이 인증서가 내 신원이다 | 인증 불가 |
| `CertificateVerify` | 이 인증서의 개인키를 정말 갖고 있다 | 인증서 도용 탐지 |
| `Finished` | 핸드셰이크가 변조되지 않았다 | 중간자 탐지 |

### 4.6 인증서 체인 검증

구조는 이렇다.

```text
Root CA (신뢰의 뿌리, 클라이언트 신뢰 저장소에 있음)
  └─ Intermediate CA (중간 CA)
       └─ Leaf certificate (server.example.com)
```

[RFC 5280](https://datatracker.ietf.org/doc/html/rfc5280)이 정하는 경로 검증에서 확인하는 것들이다.

- 각 인증서의 주체와 발급자가 사슬로 이어지는가
- 그 사슬이 신뢰하는 뿌리에서 시작하는가
- 마지막이 검증 대상 인증서인가
- 각 인증서의 유효기간이 맞는가

실무 관점으로 옮기면 이렇다. **루트 인증서는 클라이언트 신뢰 저장소에 있고, 서버는 자기 인증서와 중간 CA를 보낸다.** 중간 CA를 안 보내면 클라이언트가 사슬을 잇지 못해 검증에 실패한다. 서버 설정에서 자주 나는 실수다.

### 4.7 호스트명 검증

체인이 유효하다는 것만으로는 부족하다. **그 인증서가 내가 접속하려는 이름의 것인지**도 확인해야 한다.

인증서의 SAN(Subject Alternative Name) 확장에 들어 있는 DNS 이름과 접속 대상 호스트명을 비교한다. 예전에는 주체의 CN(Common Name)을 썼지만 지금은 SAN이 기준이다.

이 검증을 빠뜨리면 어떻게 되는지가 6장에서 다시 나온다.

TLS 검증이 보는 항목을 정리하면 이렇다.

- 서명 체인
- 유효기간
- 폐기 상태 (환경에 따라)
- 호스트명 또는 IP 일치
- 키 용도 (Key Usage, Extended Key Usage)

### 4.8 인증서 폐기 확인

유효기간이 남아 있어도 개인키가 유출되면 인증서를 폐기해야 한다. 확인 방법이 두 가지다.

**CRL(Certificate Revocation List).** CA가 주기적으로 발행하는 폐기 목록이다. 인증서의 CRL Distribution Points 확장에 목록 URL이 적혀 있다. 단점은 목록이 커질 수 있고 갱신 주기 사이에 시차가 생긴다는 것이다.

**OCSP(Online Certificate Status Protocol).** CA의 응답 서버에 개별 인증서 상태를 실시간으로 묻는다. 인증서의 Authority Information Access 확장에 URL이 있다. 정의는 [RFC 6960](https://datatracker.ietf.org/doc/html/rfc6960)이다.

**OCSP Stapling**이 실무 권장이다. 서버가 OCSP 응답을 미리 받아두었다가 TLS 핸드셰이크에 함께 실어 보낸다. 클라이언트가 CA에 직접 물어볼 필요가 없어져서 두 가지가 좋아진다. 연결이 빨라지고, 사용자가 어떤 사이트에 접속하는지가 CA에 노출되지 않는다.

### 4.9 mTLS

**mTLS(mutual TLS, 상호 TLS)** 는 서버뿐 아니라 **클라이언트도 인증서를 제시**하는 방식이다.

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server

    C->>S: ClientHello + key_share
    S->>C: ServerHello + key_share
    S->>C: EncryptedExtensions
    S->>C: CertificateRequest
    Note over S: 이 메시지가 mTLS의 시작점
    S->>C: Certificate (서버)
    S->>C: CertificateVerify (서버)
    S->>C: Finished
    C->>C: 서버 인증서 검증
    C->>S: Certificate (클라이언트)
    C->>S: CertificateVerify (클라이언트)
    C->>S: Finished
    Note over C,S: 양쪽 모두 인증 완료
```

차이는 간단하다. 일반 TLS는 보통 서버만 인증서를 내고, mTLS는 양쪽이 다 낸다.

**오해하면 안 되는 지점**이 있다. mTLS는 양쪽 신원 인증, 채널 암호화, 채널 무결성을 제공한다. 그러나 세밀한 권한 부여, 요청 단위 업무 인가, 데이터 분류 정책, 감사 정책까지 자동으로 해주지는 않는다. 1.6절에서 본 인증과 인가의 구분이 여기서 다시 나온다. "mTLS를 켰으니 제로 트러스트 완성"은 틀린 이해다.

---

## 5. HTTP와 HTTPS는 어디서 갈라지는가

### 5.1 HTTPS는 별도 프로토콜이 아니다

HTTP 메시지를 그대로 두고, 그것을 TLS 위에 올린 것이다.

```mermaid
flowchart TB
    subgraph HTTP["HTTP"]
        H1["HTTP 메시지"] --> T1["TCP"] --> I1["IP"]
    end
    subgraph HTTPS["HTTPS"]
        H2["HTTP 메시지"] --> TLS["TLS 레코드 계층<br/>암호화 + 무결성"] --> T2["TCP"] --> I2["IP"]
    end
```

메시지 형식(`GET /path HTTP/1.1`, 헤더, 본문)은 완전히 같다. 달라지는 것은 그 바이트가 TCP에 실리기 전에 TLS 레코드로 감싸지는지 여부뿐이다. 그래서 HTTPS로 바꾼다고 애플리케이션 코드가 바뀌지 않는다.

### 5.2 TLS가 감싸지 못하는 것

TLS를 켜도 여전히 밖에서 보이는 것이 있다.

| 정보 | HTTP | HTTPS |
|---|---|---|
| 요청 경로, 헤더, 쿠키, 본문 | 노출 | 보호 |
| 목적지 IP와 포트 | 노출 | 노출 |
| 접속하려는 도메인 이름 | 노출 | **SNI로 노출** |
| 인증서에 적힌 도메인 | 해당 없음 | TLS 1.2는 노출, 1.3은 암호화 |
| 전송량과 타이밍 패턴 | 노출 | 노출 |

**SNI(Server Name Indication)** 를 설명하고 넘어간다. 서버 하나가 IP 하나로 여러 도메인을 서비스하는 경우가 많다. 그러면 서버는 어느 도메인의 인증서를 내밀지 정해야 하는데, 그 시점에는 아직 암호화 키가 없다. 그래서 클라이언트가 `ClientHello`에 목적지 도메인 이름을 평문으로 적어 보낸다. 이것이 SNI다.

결과적으로 **어떤 사이트에 접속했는지는 HTTPS로도 감춰지지 않는다.** 감추려면 Encrypted Client Hello(ECH)라는 별도 확장이 필요하다.

---

## 6. 가로채면 실제로 무슨 일이 벌어지는가

지금까지 쌓은 개념으로 원래 질문에 답한다.

### 6.0 공격자가 할 수 있는 두 가지

"가로챈다"는 말을 먼저 둘로 나눈다.

**수동 도청.** 지나가는 패킷을 복사해 읽기만 한다. 스위치 미러 포트, 무선 스니핑, 회선 탭이 여기 해당한다. 흐름을 바꾸지 않으므로 탐지가 어렵다.

**능동 중간자(MITM, Man-In-The-Middle).** 트래픽을 자기 쪽으로 끌어와 양쪽 연결을 각각 맺고, 내용을 읽고 고쳐서 전달한다. ARP 스푸핑, DNS 스푸핑, 악성 Wi-Fi 접속점, 그리고 회사가 합법적으로 운영하는 TLS 검사 프록시가 모두 이 형태다.

```mermaid
flowchart LR
    subgraph P["수동 도청"]
        C1[Client] --> S1[Server]
        C1 -.복사.-> A1[공격자]
    end
```

```mermaid
flowchart LR
    subgraph A["능동 중간자"]
        C2[Client] <--> M[공격자] <--> S2[Server]
    end
```

여기서 이 글의 뼈대가 되는 문장이 나온다.

**암호화는 수동 도청을 막고, 인증은 능동 중간자를 막는다.**

암호화만 있고 인증이 없으면 공격자와 안전하게 대화하게 된다. 아래 세 케이스가 이 문장을 각각 다르게 보여준다.

### 6.1 HTTP를 가로챘을 때

전부 보인다.

```
GET /admin/users?page=1 HTTP/1.1
Host: internal.example.com
Cookie: JSESSIONID=A1B2C3D4E5F6; remember_me=eyJhbGciOi...
Authorization: Basic YWRtaW46cGFzc3dvcmQxMjM=
User-Agent: Mozilla/5.0 ...
```

캡처한 사람이 바로 얻는 것들이다.

- 요청 URL과 쿼리 파라미터
- 세션 쿠키 값. 이 값을 자기 브라우저에 넣으면 그 사용자로 로그인된다.
- `Authorization: Basic`의 값은 base64 인코딩일 뿐이므로 `base64 -d` 한 번이면 `admin:password123`이 나온다.
- POST 본문의 폼 데이터와 JSON

수동 도청만으로 자격 증명이 넘어간다. 능동 공격까지 가면 응답 본문에 스크립트를 끼워 넣거나 다운로드 파일을 바꿔치기하는 것도 그대로 된다. 프로토콜에 막는 장치가 없다.

#### HTTP에서 HTTPS로 넘어가는 그 순간

여기가 실제로 자주 뚫리는 지점이다. 사용자는 주소창에 `example.com`만 친다. 브라우저는 `http://example.com`으로 먼저 요청하고, 서버가 `301 Location: https://...`로 리다이렉트한다.

**그 첫 요청은 평문이다.** 능동 공격자는 이 리다이렉트를 가로채서 사용자에게는 계속 HTTP로 응답하고, 자기는 서버와 HTTPS로 통신한다. 이 기법을 sslstrip이라고 부른다.

```mermaid
sequenceDiagram
    participant C as Client
    participant M as 공격자
    participant S as Server

    C->>M: GET http://example.com (평문)
    M->>S: GET https://example.com (TLS)
    S-->>M: 200 OK (TLS로 보호됨)
    M-->>C: 200 OK (평문으로 다시 씀)
    Note over C,M: 사용자는 계속 HTTP로 통신<br/>자물쇠 아이콘 없음
    C->>M: POST /login (id, pw 평문)
    Note over M: 자격 증명 획득
```

막는 장치가 **HSTS(HTTP Strict Transport Security)** 다. 서버가 이 헤더를 보내면 브라우저는 그 도메인에 대해 지정 기간 동안 HTTP 요청 자체를 만들지 않고 내부에서 HTTPS로 바꾼다. 정의는 [RFC 6797](https://datatracker.ietf.org/doc/html/rfc6797)이다.

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

여기에도 구멍이 하나 남는다. HSTS 헤더는 HTTPS 응답으로만 전달되므로 **그 도메인에 처음 접속하는 순간에는 아직 받은 적이 없다.** 이 최초 1회 문제를 없애려고 브라우저 배포본에 도메인 목록을 미리 심어두는 것이 `preload`다.

### 6.2 HTTPS를 가로챘을 때

#### 수동 도청은 왜 실패하는가

1.4절의 ECDHE가 답이다. 양쪽이 `key_share`로 공개값만 주고받고 공유 비밀은 각자 계산한다. 도청자는 두 공개값을 다 보지만 이산로그 문제 때문에 공유 비밀을 얻지 못한다. 그래서 `{Certificate}`부터 애플리케이션 데이터까지 전부 읽지 못한다.

**여기서 서버 개인키의 역할을 다시 확인해둔다.** TLS 1.3에서 서버 개인키는 복호화에 쓰이지 않는다. `CertificateVerify` 서명 하나를 만드는 데만 쓰인다(4.4절). 그래서 나중에 개인키가 유출돼도 저장해둔 과거 트래픽을 풀 수 없다.

#### 능동 중간자는 어디서 막히는가

공격자가 양쪽 연결을 각각 맺으면 **암호화는 아무 문제 없이 동작한다.** 양쪽 키를 다 갖고 있으니까. 막히는 곳은 암호화가 아니라 **인증**이다.

```mermaid
sequenceDiagram
    participant C as Client
    participant M as 공격자
    participant S as Server

    C->>M: ClientHello
    M->>S: ClientHello
    S->>M: ServerHello, Certificate(진짜)
    Note over M: 진짜 인증서를 그대로 넘기면?<br/>대응하는 개인키가 없어<br/>CertificateVerify를 만들 수 없다
    M->>C: ServerHello, Certificate(공격자 것)
    M->>C: CertificateVerify (공격자 키로 서명)
    Note over C: 인증서 검증 실패<br/>발급자를 신뢰 저장소에서 찾을 수 없음
    C--xM: 연결 중단
```

공격자에게 두 갈래 길이 있고 둘 다 막힌다.

**진짜 서버 인증서를 그대로 전달하는 길.** 인증서는 공개 정보라 복사할 수 있다. 그런데 `CertificateVerify`는 그 인증서의 공개키에 대응하는 개인키로 서명해야 한다. 공격자에게 그 개인키가 없다. 서명을 못 만드니 핸드셰이크가 끝나지 않는다.

**자기 인증서를 내미는 길.** 서명은 만들 수 있다. 대신 클라이언트가 4.6절의 경로 검증을 한다. 발급자를 따라 올라가 신뢰 저장소의 루트에 닿아야 하는데, 공격자가 만든 인증서는 거기에 닿지 못한다. 브라우저가 경고를 띄우는 지점이다.

#### 그런데 왜 사내 프록시와 Burp는 되는가

**위 검증을 통과하도록 미리 만들어놓았기 때문이다.**

TLS 검사 프록시는 자체 루트 CA를 하나 갖고 있고, 그 루트 CA 인증서를 사내 PC의 **신뢰 저장소에 설치**한다. 그룹 정책이나 MDM으로 배포한다. Burp Suite를 쓸 때 인증서를 받아 설치하라고 하는 것도 같은 절차다.

그다음부터 프록시는 접속하는 도메인마다 즉석에서 인증서를 만들어 자기 루트 CA로 서명한다. 클라이언트 입장에서는 신뢰하는 루트에서 내려온 사슬이므로 검증을 통과한다.

```mermaid
flowchart LR
    subgraph N["정상"]
        RC["공인 CA<br/>(브라우저 기본 신뢰)"] --> SC["example.com 인증서"]
    end
    subgraph P["검사 프록시"]
        PC["사내 루트 CA<br/>(관리자가 설치)"] --> PS["example.com 인증서<br/>(프록시가 즉석 발급)"]
    end
```

**이 구조는 TLS를 깬 것이 아니라 신뢰 저장소를 바꾼 것이다.** 여기서 두 가지가 따라 나온다.

첫째, 사내 장비에서 하는 HTTPS 통신은 그 프록시에 평문으로 보인다. 개인 계정 비밀번호를 회사 PC에서 입력하면 프록시 로그에 남을 수 있다.

둘째, 공격자가 어떤 방법으로든 루트 CA 하나를 신뢰 저장소에 심으면 같은 일을 할 수 있다. 악성코드가 인증서를 설치하는 것이 이 목적이다. **결국 TLS 보안의 실제 경계선은 암호 알고리즘이 아니라 신뢰 저장소에 무엇이 들어 있는가**가 된다.

```bash
# macOS 시스템 신뢰 저장소 확인
security dump-trust-settings -d

# Linux에 추가된 인증서 확인
ls -la /usr/local/share/ca-certificates/
```

이 우회를 원천 차단하려면 신뢰 저장소에 기대지 않아야 한다. **인증서 피닝(pinning)** 이 그 방법이다. 애플리케이션이 특정 공개키나 인증서 지문을 코드에 박아두고, 그것과 다르면 신뢰 저장소가 뭐라고 하든 연결을 끊는다. 모바일 뱅킹 앱에 프록시를 물리면 아무 통신도 안 되는 이유다.

#### 검증이 실제로 뚫리는 경우들

MITM이 성공하는 상황은 대부분 검증을 스스로 꺼놓은 경우다.

**인증서 검증 비활성화.** 개발 중 자체 서명 인증서 에러를 없애려고 넣었다가 그대로 배포되는 코드다.

```java
// 이 코드가 운영에 올라가면 TLS의 인증 부분이 사라진다
TrustManager[] trustAll = new TrustManager[] {
    new X509TrustManager() {
        public void checkClientTrusted(X509Certificate[] c, String a) {}
        public void checkServerTrusted(X509Certificate[] c, String a) {}  // 무조건 통과
        public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
    }
};
```

```bash
curl -k https://api.example.com          # -k 는 검증 생략
wget --no-check-certificate ...
```

암호화는 여전히 동작한다. 그래서 겉으로는 아무 문제가 없어 보인다. 사라진 것은 상대가 진짜인지 확인하는 절차뿐이다.

**호스트명 검증만 빠뜨리는 경우.** 4.7절의 SAN 비교를 안 하면, 공격자가 아무 도메인에 대해서든 정상 발급받은 인증서 하나로 모든 사이트를 위장할 수 있다.

**약한 프로토콜과 스위트를 허용하는 경우.** TLS 1.0, 1.1이나 RC4, 3DES, RSA 키 전송이 남아 있으면 그쪽으로 끌어내리는 다운그레이드 시도가 가능하다.

```bash
# 거부되어야 정상이다
openssl s_client -connect example.com:443 -tls1_1
nmap --script ssl-enum-ciphers -p 443 example.com
```

**신뢰 저장소가 오염된 경우.** 바로 위에서 본 그대로다.

### 6.3 SSH를 가로챘을 때

#### SSH에는 CA가 없다

TLS는 공인 CA라는 제3자를 두고 "이 공개키가 이 도메인의 것"임을 보증받는다. SSH는 기본 구성에서 그런 제3자가 없다. 대신 처음 접속할 때 사용자에게 직접 묻는다.

```
The authenticity of host 'server.example.com (10.0.1.5)' can't be established.
ED25519 key fingerprint is SHA256:XlD8W9ye5c3TQ5v6b8N2K7HqPz1RvY4mA6ZcJfEwUo0.
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

`yes`를 누르면 그 호스트 키가 `known_hosts`에 저장된다. 이후 접속부터는 저장된 키와 대조한다. 이 모델을 **TOFU(Trust On First Use, 최초 사용 시 신뢰)** 라고 부른다.

[RFC 4251 4.1절](https://datatracker.ietf.org/doc/html/rfc4251#section-4.1)이 이 선택을 명시적으로 설명한다. 클라이언트는 호스트 이름과 그에 대응하는 공개 호스트 키를 연결해둔 로컬 데이터베이스를 갖는 것으로 기대되며, 다른 대안은 그 연결을 신뢰할 수 있는 인증기관이 인증하게 하는 것인데 이 대안이 많은 환경에서 실용적이지 않을 수 있다는 내용이다.

#### 첫 접속을 가로채면

**성공한다.** 여기가 SSH의 구조적 약점이다.

```mermaid
sequenceDiagram
    participant C as Client
    participant M as 공격자
    participant S as Server

    Note over C: known_hosts에 이 서버 없음
    C->>M: SSH 연결 시도
    M->>C: 공격자의 호스트 키 제시
    Note over C: "authenticity can't be established"<br/>사용자가 yes 입력
    C->>C: known_hosts에 공격자 키 저장
    C->>M: 비밀번호 입력
    Note over M: 비밀번호 획득
    M->>S: 획득한 비밀번호로 실제 접속
```

사용자가 지문을 대조하지 않고 `yes`를 누르는 순간 공격자의 키가 신뢰 목록에 들어간다. 그 뒤로는 경고조차 뜨지 않는다.

그래서 그 지문은 **다른 경로로 미리 받아둔 값과 비교해야** 의미가 있다. 서버 콘솔에서 직접 뽑거나, 구축 문서에 적어두거나, `ssh-keyscan`으로 미리 넣어두는 방식이다.

```bash
# 서버에서 직접 지문 확인 (이 값을 안전한 경로로 전달)
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub

# 클라이언트에 미리 등록해 첫 접속 프롬프트 자체를 없앤다
ssh-keyscan -t ed25519 server.example.com >> ~/.ssh/known_hosts

# 프롬프트에서 yes를 못 누르게 강제
ssh -o StrictHostKeyChecking=yes server.example.com
```

CI 파이프라인에서 `StrictHostKeyChecking=no`를 넣는 관행이 있는데, 이것은 TOFU의 검증 단계를 통째로 없애는 설정이다. 매번 처음 보는 키를 무조건 받아들이므로 첫 접속 MITM이 항상 성립한다. 신뢰하는 `known_hosts` 파일을 파이프라인에 주입하는 편이 맞다.

구조적으로 없애려면 **SSH 인증서**를 쓴다. SSH에도 CA 개념이 있다. CA 키로 호스트 키에 서명해두고 클라이언트는 항목 하나만 신뢰하면, 새 서버가 늘어나도 첫 접속 프롬프트가 뜨지 않는다.

```
# ~/.ssh/known_hosts
@cert-authority *.example.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA...
```

#### 두 번째 접속부터 가로채면

막힌다. 그리고 요란하게 막힌다.

```
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!
Someone could be eavesdropping on you right now (man-in-the-middle attack)!
It is also possible that a host key has just been changed.
```

**무엇이 달라졌다는 뜻인가.** `known_hosts`에 저장된 호스트 공개키와 지금 서버가 제시한 호스트 공개키가 다르다는 뜻이다.

공격자가 이 검사를 통과하려면 저장된 그 공개키에 대응하는 **개인키**가 필요하다. 3.3절에서 본 대로 서버가 교환 해시 H에 그 개인키로 서명해야 하기 때문이다. 그런데 그 개인키가 있으면 애초에 중간에 설 필요가 없다.

이 경고가 실제 공격이 아니라 서버를 재설치했거나 IP를 재사용했을 때도 뜬다는 점이 함정이다. 반사적으로 `ssh-keygen -R` 하고 넘어가는 습관이 생기기 쉬운데, 그 순간 진짜 공격도 같이 통과시키게 된다.

```bash
# 이 명령은 "이 서버 키가 왜 바뀌었는지 내가 안다"는 뜻이어야 한다
ssh-keygen -R server.example.com
```

#### 비밀번호 인증과 공개키 인증의 차이

3.4절에서 본 서명 대상이 여기서 결정적으로 작용한다.

공격자가 클라이언트 쪽 구간과 서버 쪽 구간을 각각 맺으면 **두 구간의 세션 식별자 H가 서로 다르다.** 클라이언트에게서 받은 서명은 클라이언트 쪽 H에 묶여 있으므로, 서버 쪽 세션에 그대로 중계해봐야 검증에 실패한다. 인증 자체를 중계할 수 없게 만든 설계다.

| 방식 | 가로챘을 때 |
|---|---|
| 비밀번호 인증 | 첫 접속 MITM이 성공하면 비밀번호가 그대로 넘어간다. 그 값으로 진짜 서버에 접속할 수 있다 |
| 공개키 인증 | 개인키가 회선에 나오지 않는다. MITM이 성공해도 세션에 묶인 서명 하나만 얻으므로 재사용할 수 없다 |

`PasswordAuthentication no`를 권하는 이유가 이것이다. 첫 접속 MITM이라는 구조적 약점이 남아 있어도, 공개키 인증이면 공격자가 얻는 것이 그 세션 하나로 제한된다.

**`ssh-agent` 포워딩(`ssh -A`)** 은 반대 방향으로 위험을 만든다. 접속한 서버의 에이전트 소켓을 통해 내 개인키로 서명을 요청할 수 있게 되므로, 그 서버가 장악되어 있으면 내가 접속해 있는 동안 내 키로 다른 서버에 들어갈 수 있다. `ProxyJump`가 이 문제를 피하는 대안이다.

### 6.4 세 프로토콜을 나란히 놓고

| 항목 | HTTP | HTTPS (TLS 1.3) | SSH |
|---|---|---|---|
| 암호화 | 없음 | (EC)DHE로 세션키 합의 | (EC)DH로 세션키 합의 |
| 상대 인증 근거 | 없음 | 공인 CA가 서명한 X.509 인증서 | `known_hosts`의 호스트 키 (TOFU) |
| 신뢰의 뿌리 | 없음 | OS와 브라우저의 루트 CA 저장소 | 사용자 로컬 파일 |
| 수동 도청 | 전부 노출 | 읽을 수 없음 | 읽을 수 없음 |
| 능동 MITM, 최초 접속 | 성립 | 인증서 검증에서 차단 | **성립 (사용자가 yes를 누르면)** |
| 능동 MITM, 재접속 | 성립 | 인증서 검증에서 차단 | 호스트 키 불일치 경고로 차단 |
| 전방향 안전성 | 해당 없음 | 있음 | 있음 |
| 실제로 무너지는 지점 | 프로토콜 자체 | 신뢰 저장소 오염, 검증 비활성화 | 첫 접속 지문 미확인 |

### 6.5 알고리즘별로 공격자가 얻는 것

| 공격자가 손에 넣은 것 | 결과 |
|---|---|
| 암호문만 (AES-GCM) | 아무것도 못 얻는다 |
| DH 공개값 두 개 | 공유 비밀을 계산할 수 없다 (이산로그) |
| 서버 인증서 | 공개 정보다. 서명을 못 만들어 위장에 못 쓴다 |
| 세션키 (메모리 덤프 등) | 그 세션 하나가 뚫린다. 다른 세션은 무관 |
| 서버 개인키 + ECDHE 사용 | 이후 위장은 가능. 저장해둔 과거 트래픽은 못 푼다 |
| 서버 개인키 + RSA 키 전송 사용 | 저장해둔 **과거 트래픽 전부** 복호화 가능 |
| 신뢰 저장소에 자기 루트 CA 심기 | 인증 검증을 통과한다. 전부 뚫린다 |

맨 아래 두 줄이 요점이다. 알고리즘을 깨서 뚫리는 경우는 사실상 없고, **키 관리와 신뢰 관계에서 뚫린다.**

---

## 7. SSH와 TLS는 왜 다른 신뢰 모델을 골랐는가

둘 다 암호화와 인증을 제공하지만 설계 전제가 다르다.

| 항목 | SSH | TLS |
|---|---|---|
| 주 용도 | 원격 로그인, 터널링, 파일 전송 | HTTPS 등 애플리케이션 채널 보호 |
| 기본 포트 | 22 | 443 |
| 서버 신원 확인 | 호스트 키와 `known_hosts` | X.509 인증서와 CA 신뢰 저장소 |
| 클라이언트 인증 | 비밀번호, 공개키, SSH 인증서 | 보통 없음, 필요 시 mTLS |
| 사용자 허용 목록 | `authorized_keys` | 애플리케이션 또는 프록시 정책 |
| 공개키 파일 형식 | OpenSSH 형식 | X.509, PKIX 생태계 |
| 신뢰 모델 | TOFU 또는 SSH CA | PKI와 CA 체인 |

**TLS는 처음 보는 서버에 접속하는 일이 기본**인 환경을 상정한다. 브라우저는 사용자가 한 번도 본 적 없는 도메인에 매일 접속한다. 매번 지문을 확인하라고 할 수 없으므로 제3자에게 보증을 위임하는 PKI를 골랐다. 대가로 CA 하나가 뚫리면 그 CA를 신뢰하는 모든 클라이언트가 영향을 받는다.

**SSH는 관리자가 자기 서버에 접속하는 일이 기본**인 환경을 상정한다. 대상 서버가 한정적이고, 관리자는 그 서버의 지문을 다른 경로로 확인할 수 있는 위치에 있다. 그래서 제3자 없이 로컬 데이터베이스로 충분하다고 봤다. 대가로 첫 접속의 안전이 사용자 행동에 달린다.

두 모델 모두 "신뢰의 뿌리를 어디에 두는가"라는 같은 질문에 답한 것이고, 그 뿌리가 오염되면 둘 다 무너진다는 점도 같다. 사내 프록시가 루트 CA를 심는 것과 `StrictHostKeyChecking=no`가 아무 키나 받아들이는 것은 결국 같은 종류의 사건이다.

---

## 8. 그래서 무엇을 확인할 것인가

### HTTP를 쓰고 있다면

내부망이라는 이유로 평문이 남아 있는 곳을 찾는다. 관리 콘솔, 헬스체크 엔드포인트, 서버 간 내부 호출이 대표적이다. 내부망 도청은 외부보다 오히려 쉽다.

```bash
# 평문으로 열려 있는 포트
ss -tlnp | grep -v 443

# 리다이렉트만 있고 HSTS가 없는지
curl -sI http://example.com | grep -i location
curl -sI https://example.com | grep -i strict-transport-security
```

### HTTPS를 쓰고 있다면

암호화가 켜져 있다는 것과 검증이 켜져 있다는 것은 다른 사실이다. 검증을 끄는 패턴부터 찾는다.

```bash
grep -rn "checkServerTrusted\|TrustAllCerts\|InsecureSkipVerify\|verify=False\|rejectUnauthorized: *false" .
grep -rn "curl .*-k\b\|--insecure\|--no-check-certificate" .
```

프로토콜 버전과 인증서 상태도 본다.

```bash
openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null \
  | grep -E "Protocol|Cipher|Verify return code"

echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null \
  | openssl x509 -noout -dates -subject -issuer
```

### SSH를 쓰고 있다면

첫 접속 경로를 어떻게 관리하는지가 전부다.

```bash
# 검증을 끄는 설정이 파이프라인이나 설정 파일에 있는지
grep -rn "StrictHostKeyChecking[ =]*no\|UserKnownHostsFile=/dev/null" .

# 비밀번호 인증이 열려 있는지
grep -E "^PasswordAuthentication|^PermitRootLogin|^PubkeyAuthentication" /etc/ssh/sshd_config

# known_hosts에 등록된 호스트 키 지문
ssh-keygen -lf ~/.ssh/known_hosts
```

### 키와 인증서의 수명 관리

여기까지 다 맞춰도 만료되면 전부 멈춘다. 인증서 사고는 대부분 알고리즘이 아니라 날짜에서 난다.

- 만료일을 모니터링에 넣는다. 남은 일수를 메트릭으로 노출하고 임계치에 알림을 건다.
- 갱신 절차를 자동화하고, 자동화가 실패했을 때 알림이 오는지까지 확인한다.
- 인증서와 개인키를 **수동으로 서버에 복사하지 않는다.** 어느 서버에 어떤 버전이 올라가 있는지 추적할 수 없게 되고, 짝이 안 맞는 조합이 배포되면 게이트웨이 전체가 내려간다.
- 개인키는 매니페스트나 레포에 넣지 않는다. 외부 시크릿 저장소에 두고 참조만 남긴다.

---

## 정리하며

처음 던진 질문들에 대한 답이다.

**RSA, AES, SHA-256, ECDHE는 서로 경쟁하는가.** 아니다. 한 연결 안에서 분업한다. ECDHE가 세션키를 합의하고, RSA나 Ed25519가 신원을 서명으로 증명하고, AES-GCM이나 ChaCha20-Poly1305가 실제 데이터를 암호화하고, SHA-256이 키 유도와 무결성 계산을 맡는다. 암호 스위트 이름이 이 분업을 순서대로 적어놓은 것이다.

**`.crt`, `.key`, `.pem`은 무엇이 다른가.** `.pem`은 형식이고 나머지는 관례적인 파일명이다. 무엇이 들어 있는지는 `-----BEGIN ...-----` 라벨이 알려준다. 확장자를 믿지 말고 열어봐야 한다.

**`authorized_keys`와 `known_hosts`는 왜 헷갈리는가.** 방향이 반대이기 때문이다. `authorized_keys`는 서버가 클라이언트를 검증하는 목록이고, `known_hosts`는 클라이언트가 서버를 검증하는 목록이다.

**SSH와 TLS는 무엇이 다른가.** 신뢰의 뿌리를 어디에 두느냐가 다르다. TLS는 공인 CA라는 제3자에게 위임하고, SSH는 처음 접속할 때 사용자에게 물어 로컬에 기억한다.

**HTTP와 HTTPS는 어디서 갈라지는가.** 메시지는 똑같고, 그것이 TCP에 실리기 전에 TLS 레코드로 감싸지는지 여부만 다르다. 그래서 목적지 IP와 SNI는 여전히 밖에서 보인다.

**HTTPS는 왜 안 읽히는가.** (EC)DHE로 세션키를 합의하기 때문이다. 도청자는 양쪽 공개값을 다 봐도 공유 비밀을 계산할 수 없다.

**그런데 사내 프록시는 어떻게 보는가.** TLS를 깬 것이 아니라 신뢰 저장소를 바꾼 것이다. 자체 루트 CA를 클라이언트에 설치해두고 도메인마다 인증서를 즉석 발급한다.

**SSH는 CA도 없는데 무엇으로 상대를 확인하는가.** `known_hosts`에 저장해둔 호스트 공개키다. 저장된 적이 없는 최초 접속에서는 검증할 근거가 없어서 사용자에게 묻는다.

**`REMOTE HOST IDENTIFICATION HAS CHANGED`는 무슨 뜻인가.** 저장된 공개키와 지금 제시된 공개키가 다르다는 뜻이다.

전부 따라가고 나서 남은 문장은 하나다. **암호화는 읽히는 것을 막고, 인증은 상대가 바뀌는 것을 막는다.** AES가 깨져서 사고가 나는 일은 사실상 없다. 사고는 인증을 스스로 끄거나, 신뢰의 뿌리를 넘겨주거나, 키를 흘렸을 때 일어난다.
