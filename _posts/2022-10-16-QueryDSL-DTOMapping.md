---

title: "QueryDSL 조회 결과를 DTO로 받는 네 가지 방법과 그 차이"
date: 2022-10-16
categories: [QueryDSL, JPA]
tags: [QueryDSL, DTO, Projections, QueryProjection, JPA]
layout: post
toc: true
math: true
mermaid: true

---

## 참고자료

- [QueryDSL GitHub](https://github.com/querydsl/querydsl)
- [Spring Data JPA - Projections](https://docs.spring.io/spring-data/jpa/reference/repositories/projections.html)
- [Jakarta Persistence 명세](https://jakarta.ee/specifications/persistence/3.1/)

---

## 배경

QueryDSL로 조회 결과를 엔티티가 아니라 DTO로 받고 싶었다. 방법을 찾아보니 네 가지가 나왔는데, 무엇을 골라야 할지 판단이 안 섰다.

- 네 가지가 각각 어떻게 동작하는가? 무엇이 다른가?
- 왜 `@QueryProjection`이 권장되는가?
- 불변 객체로 만들고 싶은데 어느 것을 써야 하는가?
- 컴파일은 되는데 값이 `null`로 들어오는 경우가 있다. 왜인가?

하나씩 확인하면서 정리했다.

---

## 0. 왜 DTO로 받는가

먼저 이걸 짚고 시작한다.

엔티티를 그대로 반환하면 편하지만 문제가 생긴다.

**필요 없는 컬럼까지 다 가져온다.** 화면에 제목만 필요한데 본문까지 조회한다.

**연관 관계를 따라가면서 추가 쿼리가 나간다.** 지연 로딩된 필드를 직렬화하는 시점에 쿼리가 발생하고, 목록이면 그것이 N번 나간다.

**엔티티 구조가 API 응답 구조에 묶인다.** 컬럼 이름을 바꾸면 API 응답이 바뀐다.

그래서 조회 전용 결과는 DTO로 받는다. QueryDSL은 이 매핑을 네 가지 방식으로 지원한다.

---

## 1. 네 가지 방법

예제로 쓸 DTO다.

```java
public class SearchResultResponse {
    private Long id;
    private String imageLink;
    private String contactPlace;
    private LocalDateTime updatedAt;
    private String title;
    private Integer price;
    private String nickname;
    private String category;
}
```

### 1.1 Projections.bean, 세터로 채우기

```java
@Override
public List<SearchResultResponse> searchPost(Pageable pageable, String searchValue) {
    return queryFactory
            .select(Projections.bean(SearchResultResponse.class,
                    productPost.id,
                    productPostFile.imageLink,
                    productPost.contactPlace,
                    productPost.updatedAt,
                    productPost.title,
                    productPost.price,
                    productPost.user.nickname,
                    productPost.category))
            .from(productPost)
            .leftJoin(productPostFile).on(productPostFile.productPost.id.eq(productPost.id))
            .where(productPost.title.contains(searchValue))
            .orderBy(productPost.updatedAt.desc())
            .offset(pageable.getOffset())
            .limit(pageable.getPageSize())
            .fetch();
}
```

**동작 방식.** 기본 생성자로 객체를 만들고, 각 필드에 대응하는 세터를 호출해서 값을 채운다.

**필요한 것.** 기본 생성자와 모든 필드의 세터.

**따라오는 제약.** 세터가 있어야 하므로 **불변 객체로 만들 수 없다.** 객체가 만들어진 뒤에 값이 바뀌는 것을 막을 수 없고, 어느 시점에 객체가 완성됐는지도 코드로 드러나지 않는다.

### 1.2 Projections.fields, 필드에 직접 넣기

```java
return queryFactory
        .select(Projections.fields(SearchResultResponse.class,
                productPost.id,
                productPostFile.imageLink,
                // ... 나머지 동일
        ))
        // ...
        .fetch();
```

**동작 방식.** 리플렉션으로 필드에 직접 값을 넣는다. 세터를 호출하지 않는다.

**필요한 것.** 기본 생성자만 있으면 된다. `private` 필드여도 접근 제어를 우회해서 넣는다.

**세터가 필요 없다는 것이 장점**처럼 보이지만, 여전히 기본 생성자로 만든 뒤에 값을 채우는 구조라서 진짜 불변은 아니다. 객체 생성 시점과 값이 채워지는 시점이 분리되어 있다.

### 1.3 Projections.constructor, 생성자로 만들기

```java
return queryFactory
        .select(Projections.constructor(SearchResultResponse.class,
                productPost.id,
                productPostFile.imageLink,
                // ... 나머지 동일
        ))
        // ...
        .fetch();
```

**동작 방식.** 인자 타입이 맞는 생성자를 찾아서 호출한다.

**필요한 것.** 조회 컬럼과 타입, 순서가 맞는 생성자.

**진짜 불변 객체를 만들 수 있다.** 필드를 `final`로 두고 생성자에서만 채울 수 있다.

```java
public class SearchResultResponse {

    private final Long id;
    private final String imageLink;
    // ...

    public SearchResultResponse(Long id, String imageLink, /* ... */) {
        this.id = id;
        this.imageLink = imageLink;
        // ...
    }
}
```

**그런데 여기에 함정이 있다.** 네 번째 질문의 답이 여기서 나온다.

### 1.4 @QueryProjection, 생성자를 컴파일 시점에 연결하기

DTO의 생성자에 애노테이션을 붙인다.

```java
public class SearchResultResponse {

    private final Long id;
    private final String imageLink;
    private final String contactPlace;
    private final LocalDateTime updatedAt;
    private final String title;
    private final Integer price;
    private final String nickname;
    private final String category;

    @QueryProjection
    public SearchResultResponse(Long id, String imageLink, String contactPlace,
                                LocalDateTime updatedAt, String title, Integer price,
                                String nickname, String category) {
        this.id = id;
        this.imageLink = imageLink;
        this.contactPlace = contactPlace;
        this.updatedAt = updatedAt;
        this.title = title;
        this.price = price;
        this.nickname = nickname;
        this.category = category;
    }
}
```

그러면 애노테이션 프로세서가 `QSearchResultResponse`라는 클래스를 생성한다. 조회할 때 이걸 쓴다.

```java
return queryFactory
        .select(new QSearchResultResponse(
                productPost.id,
                productPostFile.imageLink,
                productPost.contactPlace,
                productPost.updatedAt,
                productPost.title,
                productPost.price,
                productPost.user.nickname,
                productPost.category))
        .from(productPost)
        .leftJoin(productPostFile).on(productPostFile.productPost.id.eq(productPost.id))
        .where(productPost.title.contains(searchValue))
        .orderBy(productPost.updatedAt.desc())
        .offset(pageable.getOffset())
        .limit(pageable.getPageSize())
        .fetch();
```

`Projections.constructor`가 아니라 **일반 자바 생성자 호출**이 됐다는 점이 요점이다.

---

## 2. 무엇이 다른가

### 2.1 언제 오류를 발견하는가

네 방법의 결정적인 차이가 이것이다.

| 방법 | 오류 발견 시점 |
|---|---|
| `Projections.bean` | 실행 시점 |
| `Projections.fields` | 실행 시점 |
| `Projections.constructor` | 실행 시점 |
| `@QueryProjection` | **컴파일 시점** |

`Projections.constructor`는 조회 컬럼의 개수나 순서가 생성자와 안 맞아도 **컴파일이 된다.** 리플렉션으로 생성자를 찾기 때문에 컴파일러가 검사할 방법이 없다.

`@QueryProjection`이 만드는 `QSearchResultResponse`는 실제 생성자 시그니처를 그대로 가진 자바 클래스다. 그래서 인자를 빠뜨리거나 순서를 바꾸면 **컴파일 에러가 난다.**

두 번째 질문의 답이 이것이다. 권장되는 이유가 컴파일 시점 검증이다.

### 2.2 값이 null로 들어오는 경우

네 번째 질문이다. 세 가지 원인이 있다.

**이름이 안 맞는다 (`bean`, `fields`).** 이 두 방식은 **이름으로** 매칭한다. DTO 필드가 `imageLink`인데 조회 컬럼이 `image_link` 별칭이면 안 들어간다. 에러 없이 조용히 `null`이다.

```java
// 이름이 다르면 별칭으로 맞춘다
Projections.fields(SearchResultResponse.class,
        productPostFile.imageLink.as("imageLink"))
```

**타입은 맞는데 순서가 다르다 (`constructor`).** 같은 타입 필드가 여럿이면 순서가 바뀌어도 생성자를 찾는다. `title`과 `category`가 둘 다 `String`이면, 순서를 바꿔 써도 컴파일되고 실행되고 **값만 뒤바뀐다.**

이게 가장 찾기 어려운 종류의 버그다. 예외가 안 나므로 화면에서 이상한 값을 보고 나서야 안다.

**조인 결과가 없다.** 외부 조인에서 짝이 없으면 그 컬럼은 `null`이다. 이건 정상 동작이지만, DTO 필드가 기본형(`int`, `long`)이면 `null`을 넣을 수 없어서 예외가 난다. 조회 대상 필드는 래퍼 타입으로 두는 편이 안전하다.

### 2.3 표로 정리

| | `bean` | `fields` | `constructor` | `@QueryProjection` |
|---|---|---|---|---|
| 매칭 기준 | 이름 (세터) | 이름 (필드) | 타입과 순서 | 타입과 순서 |
| 기본 생성자 | 필요 | 필요 | 불필요 | 불필요 |
| 세터 | 필요 | 불필요 | 불필요 | 불필요 |
| 불변 객체 | 불가 | 사실상 불가 | 가능 | 가능 |
| 컴파일 시점 검증 | 없음 | 없음 | 없음 | **있다** |
| DTO의 QueryDSL 의존 | 없음 | 없음 | 없음 | **있다** |

---

## 3. 그래서 무엇을 쓸 것인가

### 3.1 `@QueryProjection`의 대가

권장된다고 했지만 단점이 하나 있다. **DTO가 QueryDSL에 의존하게 된다.**

`@QueryProjection`은 QueryDSL이 제공하는 애노테이션이다. 이걸 붙이면 그 DTO는 QueryDSL 없이는 컴파일되지 않는다.

DTO가 API 응답 객체로도 쓰인다면, **표현 계층 객체가 데이터 접근 기술에 묶이는 것**이다. 나중에 QueryDSL을 걷어내려면 그 DTO들을 전부 손봐야 한다.

### 3.2 정한 기준

이렇게 나눴다.

**리포지토리 안에서만 쓰는 조회 전용 DTO**에는 `@QueryProjection`을 쓴다. 어차피 데이터 접근 계층 안에 있으므로 의존이 문제가 안 되고, 컴파일 시점 검증을 얻는다.

**API 응답으로 나가는 DTO**에는 `Projections.constructor`를 쓰거나, 조회 전용 DTO를 따로 두고 변환한다. 표현 계층 객체를 특정 기술에 묶지 않기 위해서다.

```java
// 리포지토리 안: @QueryProjection 사용
public record PostSearchRow(Long id, String title, Integer price) {
    @QueryProjection
    public PostSearchRow { }
}

// 서비스에서 API 응답으로 변환
public List<PostSearchResponse> search(String keyword) {
    return postRepository.searchRows(keyword).stream()
            .map(PostSearchResponse::from)
            .toList();
}
```

**한 계층 늘어나는 것이 비용이다.** 조회 대상이 몇 개 안 되고 API 응답과 구조가 같으면 그냥 하나로 쓰는 것도 합리적이다. 판단 기준은 "이 DTO가 계층을 넘어 다니는가"다.

### 3.3 record와 함께 쓰기

자바 16 이상에서는 `record`로 DTO를 만드는 편이 간결하다. 필드가 자동으로 `final`이고 모든 필드를 받는 생성자가 만들어진다.

```java
public record SearchResultResponse(
        Long id,
        String imageLink,
        String contactPlace,
        LocalDateTime updatedAt,
        String title,
        Integer price,
        String nickname,
        String category
) {
    @QueryProjection
    public SearchResultResponse { }
}
```

`record`에는 세터가 없으므로 `Projections.bean`은 쓸 수 없다. 필드가 `final`이라 `Projections.fields`도 안 된다. **생성자 방식만 가능하다.**

---

## 4. 실제로 걸렸던 것들

### 4.1 애노테이션 프로세서 설정

`@QueryProjection`을 붙였는데 `Q` 클래스가 안 만들어지는 경우가 있다. 애노테이션 프로세서가 등록되지 않은 것이다.

```gradle
dependencies {
    implementation 'com.querydsl:querydsl-jpa:5.1.0:jakarta'
    annotationProcessor 'com.querydsl:querydsl-apt:5.1.0:jakarta'
    annotationProcessor 'jakarta.annotation:jakarta.annotation-api'
    annotationProcessor 'jakarta.persistence:jakarta.persistence-api'
}
```

**빌드 후 생성된 클래스가 보이지 않으면 빌드 디렉터리를 지우고 다시 빌드한다.** 이전 생성물이 남아 있으면 DTO를 고쳐도 `Q` 클래스가 옛날 시그니처를 유지한다. 그러면 컴파일 에러 메시지가 실제 코드와 안 맞아서 한참 헤맨다.

```bash
./gradlew clean build
```

### 4.2 `null` 처리

조회 결과에 `null`이 섞이면 DTO 안에서 처리하기 어렵다. 쿼리에서 처리하는 편이 낫다.

```java
// 외부 조인 결과가 없으면 기본값
.select(new QSearchResultResponse(
        productPost.id,
        productPostFile.imageLink.coalesce("/images/default.png"),
        // ...
))
```

`coalesce`는 앞의 값이 `null`이면 뒤의 값을 쓴다. SQL의 같은 이름 함수로 번역된다.

### 4.3 컬렉션은 담을 수 없다

`Projections`와 `@QueryProjection`은 **평평한 결과**를 만든다. 하나의 DTO 안에 리스트를 담으려면 별도 처리가 필요하다.

```java
// 이렇게는 안 된다
new QPostWithComments(post.id, post.title, comments)   // comments가 리스트
```

조회를 두 번 나눠서 하고 애플리케이션에서 묶는 것이 일반적이다. 게시글 목록을 먼저 가져오고, 그 ID들로 댓글을 한 번에 조회한 다음 그룹핑한다.

```java
List<PostRow> posts = queryFactory.select(new QPostRow(...)).fetch();
List<Long> postIds = posts.stream().map(PostRow::id).toList();

Map<Long, List<CommentRow>> commentsByPost = queryFactory
        .select(new QCommentRow(...))
        .where(comment.post.id.in(postIds))
        .fetch()
        .stream()
        .collect(groupingBy(CommentRow::postId));
```

**쿼리가 두 번 나가지만 N+1보다는 낫다.** 목록이 100개면 101번이 2번이 된다.

---

## 정리하며

처음 던진 질문들에 대한 답이다.

**네 가지가 어떻게 다른가.** `bean`은 세터로, `fields`는 리플렉션으로 필드에 직접, `constructor`는 리플렉션으로 생성자를 찾아서, `@QueryProjection`은 생성된 클래스의 실제 생성자로 채운다. 앞의 둘은 이름으로 매칭하고 뒤의 둘은 타입과 순서로 매칭한다.

**왜 `@QueryProjection`이 권장되는가.** 유일하게 컴파일 시점에 검증되기 때문이다. 나머지 셋은 인자를 빠뜨리거나 순서를 바꿔도 컴파일이 되고, 실행 시점에 예외가 나거나 값이 조용히 뒤바뀐다.

**불변 객체로 만들려면 무엇을 쓰는가.** 생성자 방식 둘 중 하나다. `bean`과 `fields`는 기본 생성자로 만든 뒤 값을 채우는 구조라 불변이 안 된다.

**값이 `null`로 들어오는 이유.** `bean`과 `fields`에서는 이름이 안 맞아서, `constructor`에서는 같은 타입 필드의 순서가 뒤바뀌어서, 그리고 외부 조인 결과가 없어서다. 앞의 둘은 조용히 실패하므로 특히 주의가 필요하다.

정리하고 나서 남은 기준은 **"이 오류를 언제 발견할 수 있는가"** 였다. 실행 시점에 조용히 틀리는 것과 컴파일 시점에 막히는 것의 차이가 크다.
