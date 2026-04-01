---
title: "보안 기본기 - PEM, CRT, KEY, SSH, TLS, mTLS, Secrets, IAM"
date: 2026-04-01
categories: [DevOps, Security]
tags: [security, devsecops, ssh, tls, mtls, pki, pem, crt, key, authorized_keys, known_hosts, secrets, iam]
layout: post
toc: true
mermaid: true
---

## 1. 먼저 잡아야 하는 6가지 기본 개념

보안 파일 형식과 프로토콜을 이해하려면 아래 개념부터 분리해서 보는 것이 좋다.

### 1.1 비밀(secret)과 비밀이 아닌 것

- **개인키(private key)**, 비밀번호, 토큰은 비밀이다.
- **공개키(public key)**, 서버 인증서(certificate), CA 인증서는 일반적으로 비밀이 아니다.
- 다만 "비밀이 아니다"와 "아무렇게나 관리해도 된다"는 다르다. 공개 정보라도 무결성 보호는 필요하다.

예를 들어 TLS 서버 인증서는 공개되어야 하므로 브라우저가 받아서 검증할 수 있다. 반면 그 인증서에 대응하는 **개인키**는 외부에 노출되면 안 된다.

### 1.2 대칭키와 비대칭키

- **대칭키**: 암호화와 복호화에 같은 키를 쓴다. 빠르다.
- **비대칭키**: 공개키와 개인키가 분리된다. 인증과 키 교환에 유리하다.

실무에서는 SSH와 TLS 모두 "처음에는 비대칭키로 신뢰를 세우고, 실제 대량 트래픽 보호는 대칭키로 한다"는 구조로 이해하면 된다.

### 1.3 해시(hash), 암호화(encryption), 전자서명(signature)은 다르다

- **해시**: 임의 길이 입력을 고정 길이 값으로 만든다. 무결성 확인에 쓴다.
- **암호화**: 읽을 수 있는 데이터를 읽지 못하게 만든다. 기밀성 제공이 목적이다.
- **전자서명**: 개인키로 서명하고 공개키로 검증한다. "누가 만들었는지"와 "중간에 안 바뀌었는지"를 확인하는 데 쓴다.

이 세 가지를 혼동하면 TLS/SSH 동작을 항상 반쯤 틀리게 이해하게 된다.

### 1.4 인증(authentication)과 인가(authorization)는 다르다

- **인증(AuthN)**: "너는 누구냐?"
- **인가(AuthZ)**: "너는 무엇을 할 수 있느냐?"

예를 들어 mTLS는 양쪽 신원을 인증할 수 있지만, 그 자체로 "이 클라이언트가 이 API를 호출해도 되는가"까지 결정하지는 않는다. 그 판단은 별도의 인가 정책이 한다.

### 1.5 인증서(certificate)는 키 자체가 아니라 "공개키에 대한 증명서"다

X.509 인증서는 공개키, Subject, Issuer, 유효기간, 확장 정보 등을 담는 데이터 구조다. 인터넷 PKI에서 경로 검증(path validation)은 **신뢰한 루트(trust anchor)**로부터 대상 인증서까지 이어지는 체인을 검증하는 방식으로 이뤄진다. [RFC 5280](https://www.rfc-editor.org/rfc/rfc5280)

### 1.6 파일 이름은 타입 보장이 아니다

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

### 4.4 SSH 메시지 흐름을 아주 단순화하면

```mermaid
sequenceDiagram
    participant C as SSH Client
    participant S as SSH Server

    C->>S: TCP connect :22
    C->>S: protocol version / KEXINIT
    S->>C: protocol version / KEXINIT
    C->>S: key exchange
    S->>C: host key + key exchange response
    Note over C,S: encrypted transport established
    C->>S: userauth request (public key)
    C->>S: signature with user's private key
    S->>S: verify signature + check authorized_keys
    S->>C: auth success
```

핵심은:

- **서버 인증**은 host key
- **사용자 인증**은 user key
- 둘은 서로 다른 단계에서 쓰인다

### 4.5 authorized_keys와 known_hosts 차이

| 파일 | 누가 갖는가 | 무엇을 저장하는가 | 용도 |
|------|-------------|------------------|------|
| `~/.ssh/authorized_keys` | 서버 측 사용자 계정 | 로그인 허용 공개키 | 서버가 클라이언트 인증 |
| `~/.ssh/known_hosts` | 클라이언트 | 신뢰하는 서버 host key | 클라이언트가 서버 인증 |

### 4.6 SSH에서 자주 보이는 파일

| 파일 | 의미 | 비밀 여부 |
|------|------|-----------|
| `~/.ssh/id_ed25519` | 사용자 개인키 | **비밀** |
| `~/.ssh/id_ed25519.pub` | 사용자 공개키 | 비밀 아님 |
| `/etc/ssh/ssh_host_ed25519_key` | 서버 host 개인키 | **비밀** |
| `/etc/ssh/ssh_host_ed25519_key.pub` | 서버 host 공개키 | 비밀 아님 |
| `~/.ssh/authorized_keys` | 로그인 허용 공개키 목록 | 비밀 아님 |
| `~/.ssh/known_hosts` | 신뢰하는 서버 host key 목록 | 비밀 아님 |

OpenSSH는 개인키 파일이 타인에게 열려 있으면 무시할 수 있으며, 개인키 파일은 민감 데이터라고 설명한다. [OpenSSH ssh(1)](https://man.openbsd.org/ssh.1)

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

### 5.3 TLS 서버 인증은 어떻게 이뤄지나

가장 흔한 HTTPS 시나리오에서는:

1. 클라이언트가 `ClientHello`를 보낸다.
2. 서버가 `ServerHello`를 보내고, 이어서 자신의 인증서(`Certificate`)를 보낸다.
3. 서버는 `CertificateVerify`로 "내가 이 인증서의 공개키에 대응하는 개인키를 정말 가지고 있다"는 것을 증명한다.
4. 양쪽은 `Finished`를 주고받아 핸드셰이크 전체와 키를 확인한다.  
   [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446)

TLS 1.3 RFC는 `CertificateVerify`가 **handshake 전체에 대한 서명**이고, `Finished`가 **handshake와 계산된 키를 인증하는 MAC**이라고 설명한다. [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446)

### 5.4 TLS 1.3 메시지 흐름

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server

    C->>S: ClientHello + key_share
    S->>C: ServerHello + key_share
    S->>C: EncryptedExtensions
    S->>C: Certificate
    S->>C: CertificateVerify
    S->>C: Finished
    C->>C: verify cert chain + hostname + signature
    C->>S: Finished
    Note over C,S: encrypted application data
```

RFC 8446의 기본 흐름도에서도 `ClientHello`, `ServerHello`, `Certificate`, `CertificateVerify`, `Finished`가 보이며, `CertificateRequest`가 있으면 클라이언트도 인증서를 보낸다. [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446)

### 5.5 인증서 체인은 어떻게 검증되나

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

### 5.6 hostname 검증은 왜 중요한가

인증서가 "유효한 CA가 서명한 인증서"라는 사실만으로는 부족하다.  
그 인증서가 **내가 접속하려는 호스트 이름과도 일치해야 한다**.

OpenSSL `verify`는 `-verify_hostname` 옵션으로 Subject Alternative Name의 DNS name 또는 subject Common Name과의 매칭을 확인할 수 있다고 설명한다. [OpenSSL verify](https://docs.openssl.org/1.1.1/man1/verify/)

즉 TLS 검증은 보통 최소한 아래를 본다.

- 서명 체인
- 유효기간
- 폐기 상태(환경에 따라)
- hostname 또는 IP 매칭
- key usage / extended key usage(용도)

### 5.7 mTLS는 무엇이 추가된 것인가

**mTLS(mutual TLS)**는 TLS의 서버 인증에 더해 **클라이언트도 인증서를 제시**하는 방식이다.

TLS 1.3 흐름에서 서버가 `CertificateRequest`를 보내면, 클라이언트도:

- `Certificate`
- `CertificateVerify`
- `Finished`

를 보낼 수 있다. [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446)

즉 차이는 간단하다.

- 일반 TLS: 보통 **서버만 인증서 제시**
- mTLS: **서버와 클라이언트 모두 인증서 제시**

### 5.8 mTLS를 오해하면 안 되는 지점

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

가장 큰 차이는 다음 두 줄로 정리된다.

- SSH는 **host key와 user key를 분리**해서 생각해야 한다.
- TLS는 **certificate chain과 trust anchor**를 중심으로 생각해야 한다.

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

---

## 9. 이 글을 읽고 나면 최소한 구분할 수 있어야 하는 것

아래 질문에 답할 수 있으면 기본기는 잡힌 것이다.

- `PEM`은 오브젝트 타입인가, 인코딩 형식인가?
- `CRT`와 `CER`만 보고 PEM/DER를 단정할 수 있는가?
- `KEY` 파일은 왜 민감한가?
- `authorized_keys`와 `known_hosts`는 누가 누구를 검증하는 파일인가?
- SSH에서 서버 인증과 사용자 인증은 각각 어떤 키로 이뤄지는가?
- TLS에서 `Certificate`, `CertificateVerify`, `Finished`는 각각 무엇을 증명하는가?
- mTLS는 무엇을 추가하고, 무엇은 추가하지 않는가?
- `ca-bundle` 파일은 trust anchor 묶음일 수도 있고 chain helper일 수도 있다는 점을 이해하는가?
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

운영자는 "이 파일 이름이 익숙하다" 수준을 넘어서, **무엇이 비밀이고, 누가 누구를 검증하며, 어떤 trust model 위에 서비스가 서 있는지**를 설명할 수 있어야 한다.

---

## References

- [RFC 4252 - The Secure Shell (SSH) Authentication Protocol](https://www.rfc-editor.org/rfc/rfc4252)
- [RFC 4253 - The Secure Shell (SSH) Transport Layer Protocol](https://www.rfc-editor.org/rfc/rfc4253)
- [RFC 5280 - Internet X.509 Public Key Infrastructure Certificate and Certificate Revocation List (CRL) Profile](https://www.rfc-editor.org/rfc/rfc5280)
- [RFC 6176 - Prohibiting Secure Sockets Layer (SSL) Version 2.0](https://www.rfc-editor.org/rfc/rfc6176)
- [RFC 7468 - Textual Encodings of PKIX, PKCS, and CMS Structures](https://www.rfc-editor.org/rfc/rfc7468)
- [RFC 7568 - Deprecating Secure Sockets Layer Version 3.0](https://www.rfc-editor.org/rfc/rfc7568)
- [RFC 8446 - The Transport Layer Security (TLS) Protocol Version 1.3](https://www.rfc-editor.org/rfc/rfc8446)
- [RFC 8996 - Deprecating TLS 1.0 and TLS 1.1](https://www.rfc-editor.org/rfc/rfc8996)
- [RFC 9325 - Recommendations for Secure Use of TLS and DTLS](https://datatracker.ietf.org/doc/html/rfc9325)
- [OpenSSH ssh(1)](https://man.openbsd.org/ssh.1)
- [OpenSSH sshd_config(5)](https://man.openbsd.org/sshd_config)
- [OpenSSL openssl-x509](https://docs.openssl.org/3.3/man1/openssl-x509/)
- [OpenSSL pkey](https://docs.openssl.org/1.1.1/man1/pkey/)
- [OpenSSL verify](https://docs.openssl.org/1.1.1/man1/verify/)
- [NIST CSRC Glossary - least privilege](https://csrc.nist.gov/glossary/term/least_privilege)
