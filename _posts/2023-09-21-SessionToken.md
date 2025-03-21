---

title: 사용자 인증 방식에 관하여 (Session vs Token)
date: 2023-09-21
categories: [SUWIKI]
tags: [SUWIKI]
layout: post
toc: true
math: true
mermaid: true

---

# JWT를 활용한 토큰 기반 인증 vs 세션 기반 인증

사용자 인증을 수행하기 위해 크게 토큰 기반, 세션 기반 두 방법이있다. 둘 중 어떤 방법을 택할 것인지 결정하기 위해 각 장단점을 비교해봤다.

---

# JWT를 활용한 토큰 기반 인증 방식 장/단점

- 장점 1. 확장성과 분산화
    - JWT는 토큰을 생성하고 검증하는 키를 기반으로 동작하며, 토큰에 필요한 정보를 담을 수 있어서 서버 간에 토큰을 공유하거나 전달할 수 있어 확장성이 뛰어나고 분산 환경에서 사용하기 용이하다.

- 장점 2. 상태 없음(Stateless)
    - 서버 측에서 토큰을 검증하고 필요한 정보를 추출하므로, 서버는 클라이언트의 상태를 저장할 필요가 없어 리소스가 절약 될 수 있다.

- 장점 3. 유연한 사용자 권한 관리
    - 토큰 내에 사용자 권한과 관련된 정보를 포함하여 사용자 권한 관리가 용이하며, 토큰의 내용을 이용하여 권한 검사를 수행할 수 있다.

- 단점 1. 토큰 크기와 보안
    - JWT는 탈취될 가능성이 있다. 중요한 정보를 토큰에 포함시키면 보안 문제가 발생할 수 있다.

- 단점 2. 토큰 유효성 검증의 어려움
    - 토큰이 변조되지 않았는지 확인하기 위해 서명을 검증해야 하기 때문에 서명 검증 과정이 추가로 필요하며, 이에 따른 복잡성이 발생할 수 있다.

---

# 서버 측 세션(Session) 기반 인증 방식 장/단점

- 장점 1. 보안성
    - 세션은 서버에 저장되므로 클라이언트에 노출되지 않는다. 토큰 기반 인증에 비해 보안성이 높다.

- 장점 2. 세션 탈취 시 대처가능
    - 세션을 사용하면 만료 시간을 쉽게 조절하고 조절할 수 있으며, 만료 시간이 지나면 자동으로 세션을 무효화시킬 수 있다.

- 단점 1. 상태 유지
    - 세션은 서버 측에서 상태를 유지해야 하므로, 서버의 메모리를 사용하게 되어 클라이언트가 많을 때 성능 저하가 발생할 수 있다.

- 단점 2. 확장성
    - 분산 환경에서 각 서버마다 발급하는 세션을 관리하기 위해 세션 클러스터를 운영해야하는 복잡성이 증가한다.

---

# 공격자로부터 클라이언트의 세션이 탈취되었음을 서버측에서는 어떻게 알 수 있을까?

- 클라이언트의 세션 ID가 이전에 없던 위치에서 사용되었거나, 단기간 내에 많은 요청이 발생하는 경우 이상행동으로 간주하여 해당 세션을 무효화한다.

- 클라이언트의 로그인 위치를 기록하고, 동일한 세션 ID가 다른 지역에서 사용되는 경우 해당 세션을 무효화한다.

---

# 토큰이든 세션이든 탈취될 수 있는 가능성을 최소화하려면 어떻게 해야할까?

- **토큰**은 유효기간을 짧게 가져가고 `Refresh Token`을 적극적으로 사용할 수 있도록 한다.
- 또한 **토큰**의 내용은 암호화를 하여 사용하기 어렵게 하면 좋다. 구체적으로는 해싱을 하는 것이 일반적이다.

- **세션** ID를 암호화 혹은 해싱하여 탈취되었을 때 유효하게 사용하기 어렵게 한다.

---

# 토큰 기반 인증 방식 구현

RefreshToken을 활용하여 토큰을 재발급 하는 로직을 작성하는 것이 굉장히 어려웠었다. 구현 능력 뿐만 아니라 이 로직을 사용해야하는 팀원들과에도 어려움이 있었다.

예를들면, RefreshToken이 만료된 것일 경우 어떤 에러코드를 내려줄지? AccessToken이 만료되었을경우 혹은 손상되었을 경우 등 상황에 맞는 에러코드를 명확하게 문서화 해놓지 않아 커뮤니케이션적으로 어려움을 많이 겪었었다.

```java
@Component
@RequiredArgsConstructor
public class JwtAgent {
    @Value("${spring.secret-key}")
    private String key;

    private static final Long ACCESS_TOKEN_EXPIRE_TIME = 30 * 60 * 1000L; // 30분
    private static final Long REFRESH_TOKEN_EXPIRE_TIME = 270 * 24 * 60 * 60 * 1000L; // 270일 -> 9개월
//    private static final Long ACCESS_TOKEN_EXPIRE_TIME = 1 * 1000L; // 1초
//    private static final Long REFRESH_TOKEN_EXPIRE_TIME = 5 * 60 * 1000L; // 5분

    private final RefreshTokenCRUDService refreshTokenCRUDService;


    @Transactional
    public String provideRefreshTokenInLogin(User user) {
        Optional<RefreshToken> wrappedRefreshToken =
                refreshTokenCRUDService.loadRefreshTokenFromUserIdx(user.getId());
        // 생애 첫 로그인 시 리프레시 토큰 신규 발급
        if (wrappedRefreshToken.isEmpty()) {
            return createRefreshToken(user);
        }

        // 그렇지 않으면 DB에서 꺼내기
        RefreshToken refreshToken = wrappedRefreshToken.get();
        if (isRefreshTokenExpired(refreshToken.getPayload())) {
            String payload = reIssueRefreshToken(refreshToken);
            wrappedRefreshToken.get().updatePayload(payload);
            return payload;
        }
        return refreshToken.getPayload();
    }

    @Transactional
    public String refreshTokenRefresh(String payload) {
        Optional<RefreshToken> refreshToken = refreshTokenCRUDService.loadRefreshTokenFromPayload(payload);
        if (refreshToken.isPresent()) {
            if (refreshToken.get().getPayload().equals(payload)) {
                // 리프레시 토큰이 만료되지 않았으면
                if (isRefreshTokenExpired(payload)) {
                    log.error(LocalDateTime.now() + " - 리프레시 토큰이 만료되었습니다.");
                    throw new AccountException(TOKEN_IS_EXPIRED);
                }
                String newPayload = reIssueRefreshToken(refreshToken.get());
                refreshToken.get().updatePayload(newPayload);
                return newPayload;
            }
        }
        log.error(LocalDateTime.now() + " - 토큰이 DB와 일치하지 않습니다.");
        throw new AccountException(TOKEN_IS_BROKEN);
    }

    @Transactional
    public String reIssueRefreshToken(RefreshToken refreshToken) {
        refreshToken.updatePayload(
                buildRefreshToken(new Date(new Date().getTime() + REFRESH_TOKEN_EXPIRE_TIME))
        );
        return refreshToken.getPayload();
    }

    public void validateJwt(String token) {
        try {
            Jwts.parserBuilder()
                    .setSigningKey(getSigningKey()).build()
                    .parseClaimsJws(token);
        } catch (MalformedJwtException | IllegalArgumentException ex) {
            throw new AccountException(LOGIN_REQUIRED);
        } catch (ExpiredJwtException exception) {
            throw new AccountException(TOKEN_IS_EXPIRED);
        }
    }

    public String createAccessToken(User user) {
        return buildAccessToken(
                setAccessTokenClaimsByUser(user),
                new Date(new Date().getTime() + ACCESS_TOKEN_EXPIRE_TIME)
        );
    }

    public String createRefreshToken(User user) {
        String buildRefreshToken = buildRefreshToken(new Date(new Date().getTime() + REFRESH_TOKEN_EXPIRE_TIME));
        refreshTokenCRUDService.save(RefreshToken.buildRefreshToken(user.getId(), buildRefreshToken));

        return buildRefreshToken;
    }

    public Long getId(String token) {
        validateJwt(token);
        Object id = Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody().get("id");
        return Long.valueOf(String.valueOf(id));
    }

    public String getUserRole(String token) {
        validateJwt(token);
        return (String) Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody().get("role");
    }

    public Boolean getUserIsRestricted(String token) {
        validateJwt(token);
        return (Boolean) Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody().get("restricted");
    }

    private Boolean isRefreshTokenExpired(String refreshToken) {
        Date claims;
        try {
            claims = Jwts.parserBuilder()
                    .setSigningKey(getSigningKey())
                    .build()
                    .parseClaimsJws(refreshToken)
                    .getBody().getExpiration();
        } catch (ExpiredJwtException expiredJwtException) {
            return true;
        }

        // Jwt Claims LocalDateTime 으로 형변환
        LocalDateTime tokenExpiredAt = claims
                .toInstant()
                .atZone(ZoneId.systemDefault())
                .toLocalDateTime();

        // 현재시간 - 7일(초단위) 를 한 피연산자 할당
        LocalDateTime subDetractedDateTime = LocalDateTime.now().plusSeconds(604800);

        // 피연산자 보다 이전 이면 True 반환 및 갱신해줘야함
        return tokenExpiredAt.isBefore(subDetractedDateTime);
    }

    private Key getSigningKey() {
        final byte[] keyBytes = Decoders.BASE64.decode(this.key);
        return Keys.hmacShaKeyFor(keyBytes);
    }

    private Claims setAccessTokenClaimsByUser(User user) {
        Claims claims = Jwts.claims();
        claims.setSubject(user.getLoginId());
        claims.put("id", user.getId());
        claims.put("loginId", user.getLoginId());
        claims.put("role", user.getRole());
        claims.put("restricted", user.getRestricted());
        return claims;
    }

    private String buildAccessToken(Claims claims, Date accessTokenExpireIn) {
        return Jwts.builder()
                .signWith(getSigningKey())
                .setHeaderParam("type", "JWT")
                .setClaims(claims)
                .setExpiration(accessTokenExpireIn)
                .compact();
    }

    private String buildRefreshToken(Date refreshTokenExpireIn) {
        return Jwts.builder()
                .signWith(getSigningKey())
                .setHeaderParam("type", "JWT")
                .setExpiration(refreshTokenExpireIn)
                .compact();
    }
}
```
