---

title: "인증 방식을 고르고 JWT 재발급을 구현하면서 겪은 것들"
date: 2023-09-21
categories: [Security, Spring]
tags: [JWT, Session, RefreshToken, Authentication, Spring]
layout: post
toc: true
math: true
mermaid: true

---

## 참고자료

- [RFC 7519 - JSON Web Token](https://datatracker.ietf.org/doc/html/rfc7519)
- [RFC 6749 - OAuth 2.0, Refresh Token](https://datatracker.ietf.org/doc/html/rfc6749#section-1.5)
- [RFC 9700 - OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/html/rfc9700)
- [OWASP - Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

---

## 배경

서비스에 로그인을 붙이면서 세션과 토큰 중 하나를 골라야 했다. 각각의 장단점은 [이전 글](/posts/Session-JWT/)에서 명세와 톰캣 구현을 보면서 정리했고, 이 글은 **실제로 골라서 구현하고 나서 겪은 것들**이다.

구현하면서 답이 안 나온 것들이 있었다.

- 액세스 토큰 만료를 얼마로 잡을 것인가? 짧게 하면 사용자가 불편하고 길게 하면 위험하다.
- 리프레시 토큰을 DB에 저장했는데, 그러면 stateless라는 장점이 사라진 것 아닌가?
- 토큰이 만료됐는지 손상됐는지 없는지를 클라이언트가 구분할 수 있어야 하는데 어떻게 알려주는가?
- 로그아웃을 어떻게 구현하는가? 토큰은 서버가 회수할 수 없는데.

구현하고 나서 정리한 기록이다.

---

## 1. 무엇을 골랐고 왜인가

토큰 방식을 골랐다. 이유가 둘이었다.

**서버가 여러 대였다.** 세션을 쓰면 공용 저장소나 세션 복제가 필요한데, 그 인프라를 추가로 운영할 여력이 없었다.

**모바일 클라이언트가 있었다.** 세션 쿠키는 브라우저 전제가 강하다. 앱에서 쓰려면 결국 토큰 비슷한 것을 얹게 된다.

**대신 포기한 것이 있다.** 즉시 무효화다. 이 얘기가 5장에서 다시 나온다.

---

## 2. 두 방식을 다시 비교하면

구현하고 나서 정리한 표다. 이전 글의 이론과 실제로 겪은 것을 합쳤다.

| | 토큰 (JWT) | 서버 세션 |
|---|---|---|
| 확장 | 키만 공유하면 서버를 늘릴 수 있다 | 공용 저장소나 복제 필요 |
| 상태 | 서버가 저장하지 않는다 | 서버가 저장한다 |
| 권한 정보 | 토큰 안에 담을 수 있다 | 저장소를 조회해야 한다 |
| 즉시 무효화 | **구조적으로 불가** | 가능 |
| 페이로드 노출 | base64url 디코딩으로 읽힌다 | 식별자만 나간다 |
| 크기 | 클레임이 늘면 커진다 | 식별자 하나로 고정 |

**마지막 줄이 구현하면서 실감한 부분이다.** 권한 정보를 토큰에 넣으면 조회를 아낄 수 있는데, 권한이 많아지면 토큰이 커지고 그것이 모든 요청 헤더에 실린다.

그리고 **토큰 안의 권한은 발급 시점의 것**이다. 권한을 회수해도 기존 토큰이 만료될 때까지는 그 권한으로 동작한다.

---

## 3. 만료 시간을 얼마로 잡을 것인가

첫 번째 질문이다.

### 3.1 맞바꿈

액세스 토큰의 만료가 짧으면 탈취됐을 때 쓸 수 있는 시간이 줄어든다. 대신 재발급이 자주 일어난다.

길면 사용자가 편하지만 탈취 시 노출 시간이 길어진다.

**서버가 회수할 수 없으므로 만료 시간이 사실상 유일한 방어선이다.**

### 3.2 정한 값

```java
private static final long ACCESS_TOKEN_EXPIRE_TIME = 30 * 60 * 1000L;              // 30분
private static final long REFRESH_TOKEN_EXPIRE_TIME = 270L * 24 * 60 * 60 * 1000L;  // 270일
```

액세스 30분, 리프레시 270일로 잡았다.

액세스 30분은 흔한 값이다. 탈취돼도 30분 뒤에는 못 쓴다.

**리프레시 270일은 길다.** 사용자가 앱을 몇 달 안 써도 다시 로그인하지 않게 하려고 잡은 값인데, 지금 다시 보면 근거가 약했다. 리프레시 토큰이 탈취되면 그 기간 내내 액세스 토큰을 새로 뽑을 수 있다.

**리터럴 계산에서 실수하기 쉬운 부분**도 있었다. `270 * 24 * 60 * 60 * 1000`을 `int`로 계산하면 오버플로가 난다. 뒤에 `L`을 붙이거나 앞의 값을 `long`으로 만들어야 한다.

```java
270 * 24 * 60 * 60 * 1000       // int 오버플로. 음수가 나온다
270L * 24 * 60 * 60 * 1000      // 올바름
```

### 3.3 지금이라면 어떻게 할 것인가

정리하면서 바꾸고 싶어진 것들이다.

**리프레시 토큰의 만료를 훨씬 짧게 잡는다.** 2주 정도가 흔한 값이다. 그 안에 한 번도 안 쓰면 다시 로그인하게 한다.

**리프레시 토큰 회전을 적용한다.** 쓸 때마다 새 것을 발급하고 이전 것을 무효화한다. 그러면 실질적인 수명이 마지막 사용 시점 기준으로 갱신되므로, 만료를 짧게 잡아도 활성 사용자는 불편하지 않다.

**재사용 감지를 넣는다.** 이미 무효화된 리프레시 토큰이 다시 쓰이면 탈취를 의심한다. 정상 사용자와 공격자가 같은 토큰을 쓰려 하면 반드시 한쪽이 무효화된 것을 쓰게 되기 때문이다. 이 경우 그 계열의 토큰을 전부 끊는다.

---

## 4. DB에 저장하면 stateless가 아니지 않은가

두 번째 질문이다. 구현하고 나서 스스로에게 던진 질문이었다.

리프레시 토큰을 DB에 저장했다.

```java
@Transactional
public String provideRefreshTokenInLogin(User user) {
    Optional<RefreshToken> stored = refreshTokenCRUDService.loadByUserId(user.getId());

    if (stored.isEmpty()) {
        return createRefreshToken(user);   // 첫 로그인
    }

    RefreshToken refreshToken = stored.get();
    if (isExpiringSoon(refreshToken.getPayload())) {
        String renewed = reIssue(refreshToken);
        refreshToken.updatePayload(renewed);
        return renewed;
    }
    return refreshToken.getPayload();
}
```

### 4.1 답

**액세스 토큰은 여전히 stateless다.** 일반 API 요청은 서명만 검증하면 되고 DB를 조회하지 않는다. 그게 대부분의 요청이다.

**리프레시는 상태가 필요하다.** 그리고 그것이 맞다. 리프레시 토큰까지 stateless로 만들면 그것도 회수할 수 없게 되므로, 탈취 시 만료까지 손을 못 쓴다.

그래서 정리하면 이렇다.

| | 상태 | 빈도 |
|---|---|---|
| 액세스 토큰 검증 | 없음 (서명만) | 매 요청 |
| 리프레시 | 있음 (DB 조회) | 30분에 한 번 |

**빈도가 크게 다르므로 저장소 부하가 세션 방식과 같지 않다.** 세션은 모든 요청마다 조회하지만 여기서는 재발급 때만 조회한다.

"stateless"를 전부 아니면 전무로 볼 필요가 없다는 것이 이 정리의 결론이었다.

---

## 5. 로그아웃을 어떻게 구현하는가

네 번째 질문이다. 여기가 가장 애매했다.

### 5.1 문제

토큰은 서버가 회수할 수 없다. 발급한 뒤로는 만료될 때까지 유효하다.

그래서 **로그아웃 버튼을 눌러도 그 액세스 토큰은 남은 시간 동안 여전히 유효하다.**

### 5.2 선택지

세 가지를 검토했다.

**클라이언트에서 지우기만 한다.** 가장 단순하다. 대부분의 경우 이걸로 충분하다. 사용자가 로그아웃했는데 누가 그 토큰을 갖고 있을 상황이 아니라면.

**리프레시 토큰을 DB에서 지운다.** 액세스 토큰은 남지만 최대 30분 뒤에는 갱신이 안 되므로 자연히 끊긴다. **구현한 방식이 이것이다.**

**블랙리스트를 둔다.** 무효화된 액세스 토큰을 저장소에 넣고 매 요청마다 확인한다. 즉시 무효화가 되지만 **매 요청마다 조회가 들어가므로 stateless의 이점이 사라진다.**

### 5.3 고른 이유

두 번째를 골랐다. 판단 기준이 이랬다.

**즉시 무효화가 필요한 요구가 명시적으로 없었다.** 금융이나 관리자 권한이 걸린 기능이었다면 세 번째를 골랐을 것이다.

**30분이라는 최대 노출 시간을 감수할 수 있었다.** 이게 감수 안 되면 액세스 토큰 만료를 더 줄이거나 블랙리스트로 가야 한다.

**블랙리스트를 두면 결국 세션과 비슷해진다.** 매 요청 조회가 들어가면 애초에 세션을 쓰는 것과 운영 부담이 비슷해진다.

정리하면 **"즉시 무효화가 필요한가"가 이 선택 전체를 가른다.** 필요하면 토큰 방식의 이점을 상당 부분 포기해야 하고, 그럴 거면 세션이 더 단순하다.

---

## 6. 에러 코드를 구분하지 않아서 겪은 일

세 번째 질문이다. 구현하면서 가장 크게 데인 부분이다.

### 6.1 문제

처음에는 토큰 관련 실패를 전부 같은 응답으로 내려보냈다. 그랬더니 클라이언트가 무엇을 해야 할지 판단할 수 없었다.

**상황마다 클라이언트가 해야 할 일이 다르다.**

| 상황 | 클라이언트가 해야 할 일 |
|---|---|
| 액세스 토큰 만료 | 리프레시로 재발급 요청 |
| 액세스 토큰 손상 | 로그인 화면으로 |
| 액세스 토큰 없음 | 로그인 화면으로 |
| 리프레시 토큰 만료 | 로그인 화면으로 |
| 리프레시 토큰 불일치 | 로그인 화면으로, 이상 접속 경고 |

**첫 줄과 나머지가 완전히 다르다.** 액세스 토큰 만료는 자동으로 복구할 수 있는 상황이고, 나머지는 사용자가 다시 로그인해야 한다.

이걸 구분해주지 않으면 클라이언트는 **모든 401에서 로그인 화면으로 보내게 된다.** 그러면 30분마다 로그인해야 한다.

### 6.2 고친 방법

예외를 나누고 각각 다른 코드를 붙였다.

```java
public enum AuthErrorCode {
    ACCESS_TOKEN_EXPIRED("AUTH_001", "액세스 토큰이 만료되었습니다"),
    TOKEN_MALFORMED("AUTH_002", "토큰 형식이 올바르지 않습니다"),
    TOKEN_MISSING("AUTH_003", "인증 토큰이 없습니다"),
    REFRESH_TOKEN_EXPIRED("AUTH_004", "리프레시 토큰이 만료되었습니다"),
    REFRESH_TOKEN_MISMATCH("AUTH_005", "저장된 토큰과 일치하지 않습니다");
    // ...
}
```

검증 지점에서 예외를 구분해 던진다.

```java
public void validate(String token) {
    try {
        Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token);
    } catch (ExpiredJwtException e) {
        throw new AuthException(ACCESS_TOKEN_EXPIRED);
    } catch (MalformedJwtException | SignatureException | IllegalArgumentException e) {
        throw new AuthException(TOKEN_MALFORMED);
    }
}
```

**예외 종류를 구분해서 잡는 것**이 요점이다. 처음에는 전부 `catch (Exception e)`로 묶어서 구분이 불가능했다.

### 6.3 여기서 배운 것

**이건 기술 문제가 아니라 협업 문제였다.** 어떤 상황에서 어떤 코드를 내려줄지가 문서로 정해져 있지 않아서, 클라이언트 개발자와 매번 물어보고 확인하는 과정이 반복됐다.

그리고 나중에 코드를 추가할 때 **기존 코드와 겹치거나 의미가 애매한 값을 붙이는 일**도 생겼다.

지금이라면 **구현 전에 에러 응답 규격부터 문서로 정하고 시작할 것이다.** 어떤 상황이 있고 각각에서 클라이언트가 무엇을 해야 하는지를 표로 만들면, 구현할 예외 종류가 그대로 나온다.

---

## 7. 그 밖에 걸린 것들

### 7.1 토큰 갱신 시점 판단

만료된 뒤에 갱신하면 그 사이 요청이 실패한다. 그래서 **만료가 임박했을 때 미리 갱신**하는 로직을 넣었다.

```java
private boolean isExpiringSoon(String refreshToken) {
    Date expiration;
    try {
        expiration = Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(refreshToken)
                .getBody()
                .getExpiration();
    } catch (ExpiredJwtException e) {
        return true;   // 이미 만료됨
    }

    LocalDateTime expiresAt = expiration.toInstant()
            .atZone(ZoneId.systemDefault())
            .toLocalDateTime();

    // 만료까지 7일 미만이면 갱신 대상
    return expiresAt.isBefore(LocalDateTime.now().plusDays(7));
}
```

**여기서 실수했던 부분**이 있다. 처음에 `plusSeconds(604800)`이라고 썼는데, 이 숫자가 7일이라는 것을 코드만 보고는 알 수 없었다. `plusDays(7)`로 바꾸고 나서 읽기가 훨씬 나아졌다.

**시간 계산을 초 단위 리터럴로 쓰지 않는 것**이 이후로 습관이 됐다.

### 7.2 서명 키 관리

```java
@Value("${spring.secret-key}")
private String key;

private Key getSigningKey() {
    byte[] keyBytes = Decoders.BASE64.decode(this.key);
    return Keys.hmacShaKeyFor(keyBytes);
}
```

**HMAC-SHA256을 쓰려면 키가 최소 256비트여야 한다.** 짧으면 라이브러리가 예외를 던진다. 개발 편의로 짧은 문자열을 쓰다가 기동이 안 되는 경우가 있다.

그리고 **이 키가 유출되면 누구든 유효한 토큰을 만들 수 있다.** 계정 하나가 아니라 전체가 뚫린다. 설정 파일에 평문으로 두지 않고 환경 변수나 시크릿 저장소로 빼야 한다.

### 7.3 페이로드에 무엇을 넣을 것인가

```java
private Claims setAccessTokenClaims(User user) {
    Claims claims = Jwts.claims();
    claims.setSubject(user.getLoginId());
    claims.put("id", user.getId());
    claims.put("role", user.getRole());
    claims.put("restricted", user.getRestricted());
    return claims;
}
```

**여기 넣은 것은 누구나 읽을 수 있다.** 일반적인 JWT는 서명만 붙고 암호화되지 않으므로, base64url 디코딩만으로 내용이 드러난다.

그래서 **개인정보를 넣으면 안 된다.** 이메일, 전화번호, 실명이 여기 들어가면 토큰이 흘러가는 모든 곳에 그 정보가 함께 간다.

식별자와 권한 정도로 제한하는 것이 맞다.

---

## 정리하며

처음 던진 질문들에 대한 답이다.

**만료 시간을 얼마로 잡을 것인가.** 액세스는 30분 정도가 흔하다. 리프레시를 270일로 잡았는데 근거가 약했다. 지금이라면 훨씬 짧게 잡고, 대신 사용할 때마다 회전시켜서 활성 사용자는 불편하지 않게 만들 것이다.

**DB에 저장하면 stateless가 아닌가.** 액세스 토큰 검증은 여전히 DB를 안 본다. 상태가 필요한 것은 리프레시뿐이고 그건 30분에 한 번이다. 빈도가 크게 다르므로 세션 방식과 같은 부담이 아니다. 그리고 리프레시까지 stateless로 만들면 탈취 시 손쓸 방법이 없어진다.

**상황을 어떻게 구분해서 알려주는가.** 예외 종류를 나누고 각각 다른 코드를 내려준다. 액세스 토큰 만료는 자동 복구 가능한 상황이고 나머지는 재로그인이 필요하므로, 이 구분이 없으면 클라이언트가 30분마다 사용자를 로그인 화면으로 보낸다.

**로그아웃을 어떻게 구현하는가.** 리프레시 토큰을 지워서 갱신을 막고, 액세스 토큰은 만료를 기다린다. 즉시 무효화가 필요하면 블랙리스트가 필요하고, 그러면 매 요청 조회가 들어가서 토큰 방식의 이점이 상당 부분 사라진다.

돌아보면 구현에서 가장 오래 걸린 것은 토큰 자체가 아니라 **"어떤 상황에서 클라이언트가 무엇을 해야 하는가"를 정하는 일**이었다. 그걸 먼저 표로 만들었다면 구현할 예외 종류와 응답 규격이 자연스럽게 나왔을 것이다.
