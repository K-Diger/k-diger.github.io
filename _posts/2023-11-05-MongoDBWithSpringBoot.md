---

title: "MongoDB를 Spring Boot에 붙이면서 막혔던 두 가지"
date: 2023-11-05
categories: [Database, Spring]
tags: [MongoDB, NoSQL, SpringData, Document, JPMS]
layout: post
toc: true
math: true
mermaid: true

---

## 참고자료

- [Spring Data MongoDB - Mapping](https://docs.spring.io/spring-data/mongodb/reference/mongodb/mapping/mapping.html)
- [Spring Data MongoDB - Transactions](https://docs.spring.io/spring-data/mongodb/reference/mongodb/client-session-transactions.html)
- [MongoDB Manual - Transactions](https://www.mongodb.com/docs/manual/core/transactions/)
- [MongoDB Manual - GridFS](https://www.mongodb.com/docs/manual/core/gridfs/)
- [JEP 261 - Module System](https://openjdk.org/jeps/261)
- [JEP 403 - Strongly Encapsulate JDK Internals](https://openjdk.org/jeps/403)
- [Spring Framework - MultipartFile Javadoc](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/web/multipart/MultipartFile.html)

---

## 배경

RDBMS만 쓰다가 MongoDB를 붙여보기로 했다. 연동 자체는 의존성 하나와 접속 정보 한 줄이면 끝났는데, **그 뒤에 두 가지에서 막혔다.**

하나는 값 객체를 담은 도큐먼트를 조회하면 매핑 예외가 났고, 다른 하나는 `MultipartFile`을 필드로 두니 애플리케이션이 아예 안 떴다.

당시에는 원인을 못 찾고 타입만 바꿔서 넘겼다. 이제 와서 다시 보니 둘 다 설명이 되므로 정리해둔다.

정리하면서 확인하고 싶었던 것들이다.

- JPA를 쓰던 습관 중에 MongoDB에서 안 통하는 것은 무엇인가?
- 생성자 파라미터를 못 묶겠다는 예외는 왜 나는가?
- `MultipartFile`을 필드에 두면 왜 애플리케이션이 안 뜨는가?

---

## 1. 연동

### 1.1 의존성과 접속 정보

```groovy
implementation 'org.springframework.boot:spring-boot-starter-data-mongodb'
```

```yaml
spring:
  data:
    mongodb:
      uri: mongodb+srv://${MONGO_USER}:${MONGO_PASSWORD}@cluster0.example.mongodb.net/${MONGO_DATABASE}?retryWrites=true&w=majority
```

**URI 끝의 경로에 들어가는 것은 컬렉션이 아니라 데이터베이스 이름이다.** 처음에 컬렉션 이름을 넣었다가 헤맸다.

MongoDB의 개념을 RDBMS와 대응시키면 이렇다.

| MongoDB | RDBMS |
|---|---|
| database | database |
| collection | table |
| document | row |
| field | column |

**계정 정보를 yml에 직접 쓰면 안 된다.** 위 예시처럼 환경 변수로 빼거나 시크릿 저장소에서 읽어야 한다. 접속 문자열 하나가 그대로 DB 전체 접근 권한이다.

### 1.2 파라미터의 의미

`retryWrites=true`는 쓰기가 네트워크 문제로 실패하면 한 번 다시 시도한다는 뜻이다.

`w=majority`는 쓰기 확인 수준이다. **과반수 노드에 기록될 때까지 기다린다.** 이게 없으면 프라이머리에만 쓰인 상태에서 성공 응답을 받고, 그 노드가 죽으면 데이터가 사라질 수 있다.

---

## 2. JPA 습관이 안 통하는 곳

### 2.1 변경 감지가 없다

JPA에서는 이렇게 써도 반영된다.

```java
@Service
@Transactional
@RequiredArgsConstructor
public class UserAuthenticator {

    private final UserRepository userRepository;

    public void execute(LoginId loginId, Password password) {
        User user = userRepository.findByLoginIdAndPassword(loginId, password);
        user.updateAuthority(Authority.NORMAL);
        // save() 없이도 UPDATE가 나간다
    }
}
```

**MongoDB에서는 아무 일도 일어나지 않는다.**

JPA의 변경 감지는 영속성 컨텍스트가 있어서 가능하다. 조회 시점의 상태를 스냅샷으로 떠두고, 커밋할 때 지금 상태와 비교해서 달라진 것만 UPDATE로 만든다.

**Spring Data MongoDB에는 이런 것이 없다.** 조회하면 그냥 객체를 만들어서 돌려주고 끝이다. 그 객체를 고쳐도 아무도 안 본다.

```java
@Service
@RequiredArgsConstructor
public class UserAuthenticator {

    private final UserRepository userRepository;

    public void execute(LoginId loginId, Password password) {
        User user = userRepository.findByLoginIdAndPassword(loginId, password);
        user.updateAuthority(Authority.NORMAL);
        userRepository.save(user);   // 직접 불러야 한다
    }
}
```

**`@Transactional`도 뗐다.** 없으면 없는 대로 동작하고, 오히려 있으면 문제가 생길 수 있다. 다음 절에서 다룬다.

### 2.2 트랜잭션은 조건부다

MongoDB도 4.0부터 다중 도큐먼트 트랜잭션을 지원한다. 다만 **아무 데서나 되는 것이 아니다.**

**복제 셋이나 샤드 클러스터여야 한다.** 단일 노드로 띄운 개발용 인스턴스에서는 안 된다.

그리고 스프링에서 쓰려면 트랜잭션 매니저를 직접 등록해야 한다.

```java
@Configuration
public class MongoTransactionConfig {

    @Bean
    public MongoTransactionManager mongoTransactionManager(MongoDatabaseFactory factory) {
        return new MongoTransactionManager(factory);
    }
}
```

**이 빈이 없는데 `@Transactional`만 붙이면 조용히 아무 일도 안 한다.** 트랜잭션이 걸린 줄 알고 짠 코드가 걸리지 않은 채로 돈다. JPA 습관대로 붙였다가 이렇게 되기 쉽다.

애초에 MongoDB의 설계 방향은 **트랜잭션이 필요 없게 도큐먼트를 묶어두는 것**이다. 게시글과 댓글을 한 도큐먼트에 넣으면 한 번의 쓰기로 끝나고 트랜잭션이 필요 없다. 여러 컬렉션을 오가는 트랜잭션이 자꾸 필요하다면 모델링을 다시 볼 여지가 있다.

---

## 3. 응답이 빈 객체로 나갔던 일

응답 껍데기를 이렇게 만들었는데 **본문이 `{}`로만 나갔다.**

```java
@JsonInclude(JsonInclude.Include.NON_NULL)
@AllArgsConstructor
@NoArgsConstructor
public class ResponseForm<T> {

    private Integer status;
    private T data;

    public static <T> ResponseForm<T> success(HttpStatus httpStatus) {
        return new ResponseForm<>(httpStatus.value(), null);
    }

    public static <T> ResponseForm<T> success(HttpStatus httpStatus, T data) {
        return new ResponseForm<>(httpStatus.value(), data);
    }
}
```

**getter가 없어서였다.**

잭슨은 기본적으로 **public getter를 보고 어떤 속성을 내보낼지 정한다.** 필드가 `private`이고 getter가 없으면 잭슨 입장에서는 내보낼 속성이 하나도 없는 객체다. 그래서 빈 객체가 나간다.

여기서 짚어둘 것이 있다. **이건 자바의 직렬화가 아니라 잭슨의 규칙이다.** `java.io.Serializable`로 하는 직렬화는 필드를 직접 읽으므로 getter가 없어도 된다. 둘을 같은 것으로 알고 있었던 것이 원인이었다.

`@Getter`를 붙이면 해결된다. 필드 접근을 쓰게 설정할 수도 있다.

```java
@JsonAutoDetect(fieldVisibility = JsonAutoDetect.Visibility.ANY)
```

**getter 없는 객체를 응답으로 내보내면 에러도 안 나고 조용히 빈 객체가 나간다는 것**이 이 문제를 찾기 어렵게 만들었다.

---

## 4. 첫 번째 벽: 생성자 파라미터 바인딩

두 번째 질문이다.

### 4.1 상황

게시글 도큐먼트에 값 객체를 넣었다.

```java
@Getter
@AllArgsConstructor
@Builder
@Document("board")
public class Board extends BaseDocument {

    private Title title;
    private TextContent textContent;
    private StaticContent staticContent;
    private String writer;
}
```

```java
@Getter
@Document(collection = "staticContent")
public class StaticContent {

    private final List<String> links = new ArrayList<>();

    public StaticContent(List<String> value) {
        links.addAll(value);
    }
}
```

저장은 됐다. **조회할 때 터졌다.**

```text
org.springframework.data.mapping.MappingException:
No property value found on entity class ...domain.StaticContent
to bind constructor parameter to
```

### 4.2 원인

예외 문구를 그대로 읽으면 답이 나온다. **"`value`라는 이름의 속성을 못 찾아서 생성자 파라미터에 묶을 수 없다"** 는 뜻이다. 여기서 `value`는 생성자 파라미터 이름이다.

Spring Data MongoDB가 도큐먼트를 객체로 되돌리는 과정은 이렇다.

```mermaid
flowchart TB
    D["MongoDB 도큐먼트<br/>{ links: ['a', 'b'] }"] --> C["생성자를 찾는다<br/>StaticContent(List value)"]
    C --> M["파라미터 이름 'value'와<br/>같은 이름의 속성을 찾는다"]
    M --> F["도큐먼트에는 'links'만 있다"]
    F --> E["MappingException"]
```

**저장할 때는 필드 이름을 쓰고, 되돌릴 때는 생성자 파라미터 이름을 쓴다.** 두 이름이 다르면 연결이 끊긴다.

저장된 도큐먼트에는 `links`가 들어 있는데, 생성자는 `value`라는 이름을 요구한다. 매핑할 방법이 없다.

### 4.3 해결

**이름을 맞추는 것이 가장 간단하다.**

```java
@Getter
public class StaticContent {

    private final List<String> links;

    public StaticContent(List<String> links) {
        this.links = new ArrayList<>(links);
    }
}
```

이름을 유지해야 한다면 `@PersistenceCreator`와 표현식으로 연결할 수 있다.

```java
@PersistenceCreator
public StaticContent(@Value("#root.links") List<String> value) {
    this.links = new ArrayList<>(value);
}
```

**`@Document`도 빼야 한다.** `StaticContent`는 `Board` 안에 묻히는 값 객체이지 독립된 컬렉션이 아니다. `@Document`가 붙어 있으면 "이건 따로 저장되는 도큐먼트"라는 신호가 되어 혼란을 만든다.

### 4.4 왜 이런 구조인가

JPA는 기본 생성자로 객체를 만든 뒤 리플렉션으로 필드에 값을 꽂는다. 그래서 `final` 필드를 못 쓰고 기본 생성자가 필수다.

**Spring Data는 생성자를 통해 만드는 것을 우선한다.** 그래서 `final` 필드와 불변 객체를 쓸 수 있다. 대신 **파라미터 이름이 계약의 일부가 된다.**

여기에 함정이 하나 더 있다. **파라미터 이름은 컴파일할 때 `-parameters` 옵션이 있어야 클래스 파일에 남는다.** 없으면 `arg0`, `arg1`이 되어 매핑이 전부 깨진다. 스프링 부트의 그레이들, 메이븐 플러그인은 이 옵션을 기본으로 켜주지만, 직접 빌드 설정을 만졌다면 확인해야 한다.

---

## 5. 두 번째 벽: MultipartFile 필드 바인딩

세 번째 질문이다. 이쪽이 훨씬 오래 걸렸다.

### 5.1 상황

댓글에 파일을 붙이려고 이렇게 썼다.

```java
@Getter
@AllArgsConstructor
@Document(collection = "comment")
public class Comment extends BaseDocument {

    private final String value;
    private final MultipartFile file;
    private final User writer;
}
```

애플리케이션이 아예 안 떴다.

```text
UnsatisfiedDependencyException: Error creating bean with name 'boardCrateApi'
  ...
Caused by: BeanCreationException: Error creating bean with name 'boardRepository'
  ...
Caused by: java.lang.reflect.InaccessibleObjectException:
  Unable to make field private final java.lang.String java.io.File.path accessible:
  module java.base does not "opens java.io" to unnamed module @3ce1e309
    at java.base/java.lang.reflect.AccessibleObject.checkCanSetAccessible(...)
    at org.springframework.util.ReflectionUtils.makeAccessible(...)
    at org.springframework.data.mapping.context.AbstractMappingContext$PersistentPropertyCreator.doWith(...)
    at org.springframework.data.mapping.context.AbstractMappingContext.doAddPersistentEntity(...)
```

맨 위 예외만 보면 빈 주입 문제로 보인다. **생성자 주입을 쓰고 있었고 주입이 안 될 이유가 없어서 몇 시간을 헤맸다.**

당시에는 원인을 못 찾고 타입을 `String`으로 바꿔서 넘어갔다.

```java
@Getter
@AllArgsConstructor
@Document(collection = "comment")
public class Comment extends BaseDocument {

    private final String value;
    private final String fileLink;
    private final User writer;
}
```

### 5.2 스택 트레이스를 아래에서 읽기

**진짜 원인은 맨 아래에 있다.**

```text
InaccessibleObjectException:
  Unable to make field private final java.lang.String java.io.File.path accessible:
  module java.base does not "opens java.io" to unnamed module
```

빈 주입 문제가 아니라 **리플렉션 접근이 막힌 것**이다.

`Caused by`가 세 겹으로 쌓여 있으면 맨 아래가 실제 원인이다. 위쪽은 그 실패가 전파되면서 감싸진 것이다. 이걸 몰라서 맨 위 문구로 검색했고, 나오는 답이 전부 상황과 안 맞았다.

### 5.3 왜 java.io.File을 건드리는가

Spring Data는 애플리케이션이 뜰 때 **모든 도큐먼트 클래스의 구조를 미리 훑는다.** 필드를 하나씩 보면서 "이건 저장 가능한 속성인가"를 판단하고, 그 필드가 다시 객체 타입이면 그 안까지 들어간다.

```mermaid
flowchart TB
    C["Comment"] --> V["String value"]
    C --> F["MultipartFile file"]
    C --> W["User writer"]
    F --> I["구현체를 따라 들어간다"]
    I --> FI["java.io.File 관련 내부 필드"]
    FI --> X["setAccessible() 시도"]
    X --> E["InaccessibleObjectException"]
```

`MultipartFile`을 만나면 그 안으로 들어가고, 구현체를 따라가다 보면 `java.io.File`에 닿는다. 그 내부 필드에 `setAccessible(true)`를 부르는 순간 막힌다.

### 5.4 왜 막히는가

자바 9에서 모듈 시스템이 들어왔다. 여기서 **패키지를 밖에 열어줄지를 모듈이 직접 정한다.**

`java.base` 모듈은 `java.io` 패키지를 `exports`한다. 그래서 `new File(...)`처럼 공개 API는 쓸 수 있다.

하지만 `opens`는 하지 않는다. **`opens`가 되어 있어야 리플렉션으로 private 멤버에 접근할 수 있다.**

```mermaid
flowchart LR
    E["exports<br/>공개 API를 쓸 수 있다"] --> A["new File(...)  가능"]
    O["opens<br/>리플렉션으로 내부까지 접근"] --> B["file.path 필드 접근"]
    JB["java.base는 java.io를<br/>exports만 하고 opens 안 함"] --> A
    JB -.막힘.-x B
```

자바 9부터 16까지는 이런 접근에 경고만 내고 통과시켰다. **자바 16부터 기본이 거부로 바뀌었고, 17에서 굳어졌다.** JDK 내부 구현이 외부 코드에 묶여 있으면 JDK를 못 고치게 되기 때문이다.

이 프로젝트는 스프링 부트 3.1.5를 쓰고 있었으니 자바 17 이상이었다. 자바 11에서 같은 코드를 돌렸다면 경고만 나오고 떴을 수도 있다.

### 5.5 강제로 여는 방법과 그러면 안 되는 이유

실행 옵션으로 열 수는 있다.

```bash
java --add-opens java.base/java.io=ALL-UNNAMED -jar app.jar
```

**그런데 이건 하면 안 되는 해법이다.** 증상을 덮을 뿐 문제를 그대로 둔다.

문제의 본질은 **`MultipartFile`을 저장하려 한 것 자체**다.

`MultipartFile`은 데이터가 아니라 **업로드 요청을 다루기 위한 임시 껍데기**다. 요청이 끝나면 임시 파일이 지워지고 내용도 사라진다. 이걸 DB에 넣는다는 것은 성립하지 않는 요구다.

`String fileLink`로 바꿔서 해결됐던 것은 우연이 아니다. **저장해야 할 것은 파일이 아니라 파일이 있는 곳**이다.

### 5.6 파일을 실제로 저장하려면

```java
@Service
@RequiredArgsConstructor
public class CommentCreator {

    private final FileStorage fileStorage;
    private final CommentRepository commentRepository;

    public void create(String value, MultipartFile file, User writer) {
        String fileLink = fileStorage.store(file);   // 여기서 소비하고 위치만 남긴다
        commentRepository.save(new Comment(value, fileLink, writer));
    }
}
```

**컨트롤러와 서비스 경계에서 `MultipartFile`을 소비하고, 도메인에는 위치만 넘긴다.**

저장 위치는 몇 가지 선택지가 있다.

| 방식 | 언제 |
|---|---|
| S3 같은 오브젝트 스토리지 | 대부분의 경우. 서버가 늘어나도 문제없다 |
| MongoDB GridFS | 파일도 MongoDB에 두고 싶을 때 |
| 도큐먼트에 바이너리로 직접 | 16MB 미만의 작은 파일만 |

**도큐먼트 하나의 크기 상한이 16MB**라서 마지막 방식은 쓸 수 있는 범위가 좁다. GridFS는 파일을 조각내서 별도 컬렉션에 나눠 담아 이 제한을 우회하는 방식이다.

---

## 정리하며

처음 던진 질문들에 대한 답이다.

**JPA 습관 중 안 통하는 것.** 변경 감지가 없다. 조회한 객체를 고쳐도 `save()`를 안 부르면 반영되지 않는다. `@Transactional`도 `MongoTransactionManager` 빈을 등록하고 복제 셋 환경이어야 동작하며, 그렇지 않으면 조용히 아무 일도 안 한다.

**생성자 파라미터를 못 묶는 예외.** Spring Data는 도큐먼트를 되돌릴 때 생성자 파라미터 이름과 같은 이름의 속성을 찾는다. 필드 이름이 `links`인데 생성자 파라미터가 `value`면 연결할 방법이 없다. 이름을 맞추거나 `@PersistenceCreator`와 표현식으로 이어줘야 한다.

**`MultipartFile`을 필드에 두면 왜 안 뜨는가.** Spring Data가 시작할 때 도큐먼트 클래스 구조를 훑다가 `MultipartFile` 안의 `java.io.File`까지 들어가고, 거기서 리플렉션 접근이 모듈 시스템에 막힌다. `java.base`는 `java.io`를 `exports`하지만 `opens`하지 않고, 자바 16부터 이 규칙이 강제된다. 근본 원인은 요청용 임시 껍데기를 저장하려 한 것이므로, 파일은 따로 저장하고 위치만 남기는 것이 맞다.

돌아보고 나서 남은 것은 **스택 트레이스를 아래에서부터 읽어야 한다는 것**이었다. 맨 위의 "빈 주입 실패"로 몇 시간을 검색했는데, 맨 아래 한 줄에 답이 그대로 적혀 있었다. `Caused by`가 겹겹이 쌓여 있으면 가장 안쪽이 실제로 일어난 일이다.
