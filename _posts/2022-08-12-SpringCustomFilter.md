---

title: "필터를 직접 만들어보면서 확인한 등록과 순서"
date: 2022-08-12
categories: [Spring, Java]
tags: [Spring, Filter, ServletFilter, JWT, QueryDSL, FilterRegistrationBean]
layout: post
toc: true
math: true
mermaid: true

---

## 참고자료

- [Spring Boot Reference - Servlet Web Applications](https://docs.spring.io/spring-boot/reference/web/servlet.html)
- [FilterRegistrationBean Javadoc](https://docs.spring.io/spring-boot/api/java/org/springframework/boot/web/servlet/FilterRegistrationBean.html)
- [ServletContextInitializerBeans.java 소스](https://github.com/spring-projects/spring-boot/blob/3.3.x/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/web/servlet/ServletContextInitializerBeans.java)
- [Ordered Javadoc](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/core/Ordered.html)
- [AnnotationAwareOrderComparator Javadoc](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/core/annotation/AnnotationAwareOrderComparator.html)

---

## 배경

필터가 무엇인지는 [앞 글](/posts/Filter-DispatchServlet-Interceptor/)에서 정리했다. 이번에는 직접 만들어보면서 문서만 봐서는 안 보이던 것들을 확인했다.

특히 등록하는 방법이 여러 가지인데 **무엇을 쓰든 같은 결과가 나오는 것이 아니었다.** 순서를 지정하는 방법도 등록 방식에 따라 달랐다.

정리하면서 확인하고 싶었던 것들이다.

- 필터를 등록하는 방법이 여러 가지인데 무엇이 다른가?
- 필터 여러 개의 실행 순서는 무엇으로 정해지는가?
- 필터에서 던진 예외는 어떻게 처리해야 하는가?
- 필터에 빈을 주입받아도 되는가?

---

## 시나리오

필터를 직접 만들어보기 위해 요구사항을 이렇게 잡았다.

- `POST /diger/join`으로 회원가입한다. 파라미터는 `userName(String)`, `age(int)`다.
- `POST /diger/login`으로 로그인한다. 파라미터는 `userName(String)`이고 액세스 토큰 문자열을 돌려준다.
- `GET /diger/filtering`을 요청할 수 있다. 헤더에 액세스 토큰을 담는다. 토큰에 들어 있는 나이가 서버가 정한 기준보다 적으면 이 요청은 거부된다.
- 모든 요청은 필터 단계에서 카운팅되어 데이터베이스에 기록된다.

패키지 이름은 이 글을 쓸 당시의 `javax.servlet` 기준이다. 스프링 부트 3.x 이상에서는 `jakarta.servlet`으로 읽어야 한다.

---

## 필터를 두 개로 나눈다

- `CustomJwtFilter`: JWT를 검증하고 나이 조건을 판정한다.
- `CustomApiRequestCountFilter`: API 요청 수를 센다.

---

## DTO와 Controller

### RequestDto.java

```java
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

public class RequestDto {

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class JoinForm {
        private String userName;
        private int age;
    }

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class LoginForm {
        private String userName;
    }
}
```

### DigerController.java

```java
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import study.querydsl.entity.Member;
import study.querydsl.jwt.JwtUtilizer;
import study.querydsl.repository.member.MemberRepository;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class DigerController {

    private final MemberRepository memberRepository;
    private final JwtUtilizer jwtUtilizer;

    @PostMapping("/diger/join")
    public void join(@RequestBody RequestDto.JoinForm joinForm) {
        Member newMember = Member.builder()
                .age(joinForm.getAge())
                .username(joinForm.getUserName())
                .build();

        memberRepository.save(newMember);
    }

    @PostMapping("/diger/login")
    public String login(@RequestBody RequestDto.LoginForm loginForm) {
        List<Member> members = memberRepository.findByUsername(loginForm.getUserName());

        if (members.isEmpty()) {
            throw new IllegalArgumentException("존재하지 않는 사용자입니다.");
        }
        return jwtUtilizer.createAccessToken(members.get(0));
    }

    @GetMapping("/diger/filtering")
    public String filtered() {
        return "필터링을 거치고 요청이 성공했습니다!";
    }
}
```

로그인 실패를 `"로그인 실패!"`라는 문자열로 돌려주면 HTTP 상태가 200이 된다. 클라이언트가 본문을 파싱하기 전까지 성공과 실패를 구분할 수 없으므로 예외를 던지고 `@RestControllerAdvice`에서 상태 코드를 붙이는 편이 낫다.

---

## Repository

### ApiRequestCountRepository

```java
import org.springframework.data.jpa.repository.JpaRepository;
import study.querydsl.entity.ApiRequestCount;

public interface ApiRequestCountRepository
        extends JpaRepository<ApiRequestCount, Long>, ApiRequestCountRepositoryCustom {
}
```

### ApiRequestCountRepositoryCustom

```java
public interface ApiRequestCountRepositoryCustom {

    void increaseApiRequestCount();
}
```

### ApiRequestCountRepositoryCustomImpl

```java
import com.querydsl.jpa.impl.JPAQueryFactory;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import static study.querydsl.entity.QApiRequestCount.apiRequestCount;

@RequiredArgsConstructor
@Repository
@Transactional
public class ApiRequestCountRepositoryImpl implements ApiRequestCountRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public void increaseApiRequestCount() {
        queryFactory
                .update(apiRequestCount)
                .set(apiRequestCount.count, apiRequestCount.count.add(1L))
                .where(apiRequestCount.id.eq(1L))
                .execute();
    }
}
```

QueryDSL의 `update`는 JPQL 벌크 연산이므로 영속성 컨텍스트를 거치지 않고 DB에 직접 나간다. 그래서 카운터를 여러 스레드가 동시에 올려도 `count = count + 1`이 DB에서 수행되어 갱신 손실이 나지 않는다. 대신 같은 트랜잭션에서 이 엔티티를 이미 조회했다면 1차 캐시의 값이 낡은 채로 남는다.

구현체 이름이 `ApiRequestCountRepositoryImpl`인 것도 우연이 아니다. 스프링 데이터 JPA는 사용자 정의 구현체를 찾을 때 `리포지토리 인터페이스명 + Impl` 규칙을 쓴다. `ApiRequestCountRepositoryCustomImpl`로 지으면 기본 설정에서는 인식되지 않는다.

---

## Filter

### CustomJwtFilter.java

```java
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import study.querydsl.jwt.JwtUtilizer;

import javax.servlet.*;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

@Slf4j
@Component
@RequiredArgsConstructor
public class CustomJwtFilter implements Filter {

    private static final int MIN_AGE = 24;

    private final JwtUtilizer jwtUtilizer;

    @Override
    public void init(FilterConfig filterConfig) throws ServletException {
        log.info("CustomJwtFilter init, filterName={}", filterConfig.getFilterName());
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;
        String path = httpRequest.getServletPath();

        // 인증이 필요 없는 경로는 그대로 통과
        if (path.equals("/diger/join") || path.equals("/diger/login")) {
            chain.doFilter(request, response);
            return;
        }

        String token = httpRequest.getHeader("AccessToken");
        if (token == null || token.isBlank()) {
            httpResponse.sendError(HttpServletResponse.SC_UNAUTHORIZED, "AccessToken이 없습니다.");
            return;
        }

        int requestedUserAge;
        try {
            requestedUserAge = Integer.parseInt(jwtUtilizer.getUserAgeByToken(token));
        } catch (Exception e) {
            httpResponse.sendError(HttpServletResponse.SC_UNAUTHORIZED, "토큰이 유효하지 않습니다.");
            return;
        }

        if (requestedUserAge < MIN_AGE) {
            httpResponse.sendError(HttpServletResponse.SC_FORBIDDEN, "이용 가능한 나이가 아닙니다.");
            return;
        }

        chain.doFilter(request, response);
    }
}
```

처음 작성했을 때는 나이 조건을 판정한 뒤 로그만 찍고 `chain.doFilter()`를 그대로 호출했다. 조건을 만족하지 않는 요청이 콘솔에는 "이용할 수 없다"고 찍히면서 컨트롤러까지 가서 200을 받았다. 필터에서 요청을 끊는 방법은 `chain.doFilter()`를 호출하지 않는 것뿐이다.

경로 판정을 `contains`에서 `equals`로 바꾼 이유도 있다. `contains("/diger/join")`은 `/diger/join-admin` 같은 경로까지 통과시킨다. 인증을 건너뛰는 조건은 넓게 잡을수록 위험하다.

### CustomApiRequestCountFilter.java

```java
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import study.querydsl.repository.count.ApiRequestCountRepository;

import javax.servlet.*;
import java.io.IOException;

@Component
@RequiredArgsConstructor
@Slf4j
public class CustomApiRequestCountFilter implements Filter {

    private final ApiRequestCountRepository apiRequestCountRepository;

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        apiRequestCountRepository.increaseApiRequestCount();

        chain.doFilter(request, response);
    }
}
```

---

## 뭔가 이상한데, 왜 카운트 필터가 먼저 실행되는가

구현을 마치고 요청을 보내니 로그가 이렇게 찍혔다.

```
Api Count 필터 가동!
CustomJwtFilter 가동!
```

`CustomApiRequestCountFilter`가 먼저 돌았다. 순서를 지정한 코드는 어디에도 없다. 그런데 왜 이 순서로 정해졌는가.

### 필터 빈이 등록되는 경로

`Filter`를 구현한 클래스에 `@Component`를 붙이면 스프링 부트가 이 빈을 찾아 서블릿 컨테이너에 자동으로 등록한다. 이 작업을 하는 것이 `ServletContextInitializerBeans`다. 등록과 정렬을 담당하는 부분을 보면 이렇다.

```java
private <T> List<Entry<String, T>> getOrderedBeansOfType(ListableBeanFactory beanFactory, Class<T> type,
        Seen seen) {
    String[] names = beanFactory.getBeanNamesForType(type, true, false);
    Map<String, T> map = new LinkedHashMap<>();
    for (String name : names) {
        if (!seen.contains(type, name) && !ScopedProxyUtils.isScopedTarget(name)) {
            T bean = beanFactory.getBean(name, type);
            if (!seen.contains(type, bean)) {
                map.put(name, bean);
            }
        }
    }
    List<Entry<String, T>> beans = new ArrayList<>(map.entrySet());
    beans.sort((o1, o2) -> AnnotationAwareOrderComparator.INSTANCE.compare(o1.getValue(), o2.getValue()));
    return beans;
}
```

세 가지를 읽을 수 있다.

**첫째, 초기 순서는 빈 이름 목록의 순서다.** `getBeanNamesForType`이 돌려준 배열을 `LinkedHashMap`에 그대로 담으므로 삽입 순서가 유지된다.

**둘째, 그 목록을 `AnnotationAwareOrderComparator`로 정렬한다.** 이 비교자는 `@Order` 애노테이션이나 `Ordered` 인터페이스에서 순서 값을 읽는다. 두 필터 모두 둘 중 어느 것도 없다.

**셋째, 순서 값이 없으면 `Ordered.LOWEST_PRECEDENCE`를 쓴다.** 값은 `Integer.MAX_VALUE`다. 두 필터의 순서 값이 같다는 뜻이다.

같은 코드 바로 아래에서 등록 시점의 order도 확인할 수 있다.

```java
RegistrationBean registration = adapter.createRegistrationBean(beanName, bean, entries.size());
int order = getOrder(bean);
registration.setOrder(order);
```

### 그래서 순서를 가른 것은 무엇인가

`List.sort`는 안정 정렬(stable sort)이다. 비교 결과가 같은 원소들은 정렬 전 순서를 그대로 유지한다. 두 필터의 순서 값이 `Integer.MAX_VALUE`로 같으므로, 정렬은 아무것도 바꾸지 못하고 **`getBeanNamesForType`이 돌려준 순서가 그대로 최종 순서가 된다.**

그 빈 이름 순서는 컴포넌트 스캔이 클래스를 발견한 순서를 따른다. 클래스패스를 훑는 순서는 파일 시스템이 디렉터리 항목을 돌려주는 순서에 좌우되므로, 스프링이 명세로 보장하는 값이 아니다. 이 환경에서 `CustomApiRequestCountFilter`가 `CustomJwtFilter`보다 먼저 나온 것은 그 스캔 결과가 그랬기 때문이지, 어떤 규칙이 그렇게 정한 것이 아니다.

즉 **지금 이 순서는 우연이다.** 클래스 이름을 바꾸거나 패키지를 옮기거나 빌드 도구가 달라지면 순서가 뒤집힐 수 있다. 인증 필터가 카운트 필터보다 나중에 도는 지금 구조에서는 인증에 실패한 요청까지 카운트에 잡히는데, 이것이 의도한 동작이든 아니든 우연에 기대고 있다는 사실은 그대로다.

### 순서를 명시하는 두 가지 방법

**방법 1. `@Order`**

```java
@Component
@Order(1)
public class CustomJwtFilter implements Filter { ... }

@Component
@Order(2)
public class CustomApiRequestCountFilter implements Filter { ... }
```

숫자가 작을수록 먼저 실행된다. 인증에 실패한 요청을 카운트에서 빼려면 인증 필터가 앞에 와야 한다.

**방법 2. `FilterRegistrationBean`**

```java
@Configuration
public class FilterConfig {

    @Bean
    public FilterRegistrationBean<CustomJwtFilter> jwtFilter(JwtUtilizer jwtUtilizer) {
        FilterRegistrationBean<CustomJwtFilter> registration =
                new FilterRegistrationBean<>(new CustomJwtFilter(jwtUtilizer));
        registration.addUrlPatterns("/diger/*");
        registration.setOrder(1);
        return registration;
    }

    @Bean
    public FilterRegistrationBean<CustomApiRequestCountFilter> countFilter(
            ApiRequestCountRepository repository) {
        FilterRegistrationBean<CustomApiRequestCountFilter> registration =
                new FilterRegistrationBean<>(new CustomApiRequestCountFilter(repository));
        registration.addUrlPatterns("/diger/*");
        registration.setOrder(2);
        return registration;
    }
}
```

이쪽을 권한다. 순서뿐 아니라 **적용 URL 패턴까지 지정할 수 있기 때문**이다.

`@Component`만 붙인 필터는 `/*`에 매핑된다. 정적 자원 요청, 파비콘 요청, 헬스체크 요청까지 전부 이 필터를 지나간다. 카운트 필터에는 이 차이가 곧바로 드러난다. 브라우저가 페이지 하나를 여는 동안 CSS와 이미지 요청이 함께 나가므로, "API 요청 수"를 세려던 카운터가 실제로는 정적 자원 요청까지 더한 값을 기록한다. DB `UPDATE`가 그만큼 더 나가는 것도 함께 따라온다.

이 필터를 `@Component`로 두면서 URL 패턴만 제한하고 싶다면, `FilterRegistrationBean`으로 등록한 뒤 자동 등록을 꺼야 한다. 같은 필터가 두 번 등록되는 것을 막기 위해서다.

```java
@Bean
public FilterRegistrationBean<CustomJwtFilter> disableAutoRegistration(CustomJwtFilter filter) {
    FilterRegistrationBean<CustomJwtFilter> registration = new FilterRegistrationBean<>(filter);
    registration.setEnabled(false);
    return registration;
}
```

---

## 정리하며

처음 던진 질문은 "순서를 준 적이 없는데 왜 이 순서인가"였다. 답은 "순서가 정해진 게 아니라 정렬이 아무것도 하지 않았고, 스캔 순서가 남은 것"이다.

`AnnotationAwareOrderComparator`는 순서 값이 없는 빈을 전부 `Integer.MAX_VALUE`로 보고, 안정 정렬이라 동률은 입력 순서를 유지한다. 그 입력 순서는 클래스패스 스캔 결과이므로 보장되지 않는다.

필터가 두 개 이상이고 그중 하나라도 요청을 끊을 수 있다면, 순서는 반드시 `@Order`나 `FilterRegistrationBean`으로 명시해야 한다. 지금 잘 도는 것처럼 보이는 것과 그렇게 동작하도록 정해둔 것은 다르다.

---

## 정리하며

처음 던진 질문들에 대한 답이다.

**등록 방법의 차이.** `@Component`로 올리면 스프링 부트가 알아서 모든 요청에 등록한다. 간편하지만 **URL 패턴을 제한할 수 없다.** 정적 파일 요청까지 전부 지나간다.

`FilterRegistrationBean`으로 등록하면 URL 패턴, 순서, 이름, 활성화 여부를 전부 지정할 수 있다. **대신 필터 클래스에 `@Component`를 붙이면 안 된다.** 붙이면 자동 등록과 수동 등록이 겹쳐서 같은 필터가 두 번 지나간다.

**실행 순서를 무엇이 정하는가.** `FilterRegistrationBean`의 `setOrder()`이거나 필터가 구현한 `Ordered`의 값이다. **숫자가 작을수록 먼저 실행된다.**

여기서 주의할 것이 있다. **`@Order` 애노테이션은 필터 등록 순서에 반영되지 않는 경우가 있다.** 확실하게 하려면 `FilterRegistrationBean`에서 명시하는 편이 낫다.

순서가 중요한 이유는 **뒤 필터가 앞 필터의 결과에 의존하기 때문**이다. 인증 필터가 먼저 돌아야 요청 카운팅 필터가 사용자 정보를 쓸 수 있다.

**예외를 어떻게 처리하는가.** 던지면 안 된다. 필터는 디스패처 서블릿 바깥이라 `@ControllerAdvice`가 못 받고, **컨테이너의 기본 에러 페이지로 떨어진다.** JSON을 기대하는 클라이언트에게 HTML이 간다.

그래서 응답을 직접 써야 한다.

```java
response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
response.setContentType("application/json;charset=UTF-8");
response.getWriter().write("{\"message\":\"토큰이 유효하지 않습니다\"}");
```

에러 응답 형식이 컨트롤러 쪽과 달라지기 쉬우므로, **공통 응답 객체를 필터에서도 쓸 수 있게 빼두는 편이 낫다.**

**빈을 주입받아도 되는가.** 된다. `FilterRegistrationBean`으로 등록하면 필터 자체를 빈으로 만들어 생성자 주입을 받을 수 있다.

다만 **요청마다 달라지는 빈은 조심해야 한다.** 필터는 싱글턴이므로 요청 범위 빈을 직접 주입받으면 안 되고, 프록시를 거치거나 필요할 때 꺼내 써야 한다.

**DB 접근을 필터에 넣는 것도 다시 생각할 부분**이었다. 모든 요청이 지나가는 자리라서 여기서 조회를 하면 그만큼 부하가 곱해진다. 이 글에서 만든 요청 카운팅도 매 요청마다 저장하는 방식이라, 실제로 쓴다면 메모리에 모았다가 주기적으로 반영하는 쪽이 맞다.

만들어보고 나서 남은 감각은 **필터가 싸 보이지만 모든 요청이 지나가는 자리**라는 것이었다. 여기 넣은 코드는 전체 트래픽만큼 실행되므로, 편의를 위해 넣은 것 하나가 전체 응답 시간에 그대로 더해진다.