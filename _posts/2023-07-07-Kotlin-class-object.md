---

title: "코틀린의 class와 object 키워드, 디컴파일해서 확인하기"
date: 2023-07-07
categories: [Kotlin, Java]
tags: [Kotlin, Class, Object, Bytecode, Companion, ValueClass]
layout: post
toc: true
math: true
mermaid: true

---

## 참고자료

- [Kotlin Docs - Classes](https://kotlinlang.org/docs/classes.html)
- [Kotlin Docs - Data classes](https://kotlinlang.org/docs/data-classes.html)
- [Kotlin Docs - Sealed classes and interfaces](https://kotlinlang.org/docs/sealed-classes.html)
- [Kotlin Docs - Enum classes](https://kotlinlang.org/docs/enum-classes.html)
- [Kotlin Docs - Inline value classes](https://kotlinlang.org/docs/inline-classes.html)
- [Kotlin Docs - Nested and inner classes](https://kotlinlang.org/docs/nested-classes.html)
- [Kotlin Docs - Object declarations and expressions](https://kotlinlang.org/docs/object-declarations.html)
- [Kotlin Docs - Calling Kotlin from Java](https://kotlinlang.org/docs/java-to-kotlin-interop.html)

---

## 배경

자바를 쓰다가 코틀린으로 넘어오니 클래스를 만드는 방법이 너무 많았다. `class`, `data class`, `sealed class`, `enum class`, `value class`, 그리고 `object`와 `companion object`까지.

이름만 봐서는 무엇이 무엇인지 구분이 안 갔다. 특히 `object`와 `companion object`는 둘 다 "static 비슷한 것" 정도로만 알고 썼다.

문서를 읽는 것으로는 감이 안 잡혀서 **디컴파일해서 자바 코드로 바꿔 봤다.** 자바는 아는 언어니까 그쪽으로 옮겨 놓으면 실체가 보일 거라고 생각했다.

정리하면서 확인하고 싶었던 것들이다.

- `object`가 왜 싱글턴이 되는가? 동시성 문제는 어떻게 해결하는가?
- `object`와 `companion object`는 컴파일 결과가 어떻게 다른가?
- 자바의 내부 클래스와 코틀린의 내부 클래스가 반대로 동작하는 것 같은데 맞는가?
- `value class`는 컴파일하면 정말 사라지는가?

---

## 1. class

자바의 클래스와 크게 다르지 않다. 문법 차이만 짚는다.

### 1.1 기본 생성자

```kotlin
class Person(
    val firstName: String,  // getter 생성
    val lastName: String,   // getter 생성
    var age: Int,           // getter, setter 생성
)
```

클래스 이름 뒤 소괄호가 기본 생성자다. 자바에서 롬복의 `@AllArgsConstructor`를 붙이거나 직접 쓰던 것을 문법으로 흡수한 셈이다.

**`val`이면 getter만, `var`이면 getter와 setter가 함께 생긴다.**

여기서 자바와 다른 점 하나를 짚어둔다. **코틀린에는 필드가 아니라 프로퍼티가 있다.** `person.age`라고 쓰면 필드에 직접 접근하는 것처럼 보이지만 실제로는 getter가 호출된다. 그래서 나중에 getter에 로직을 넣어도 쓰는 쪽 코드가 바뀌지 않는다.

### 1.2 커스텀 접근자와 백킹 필드

```kotlin
class Person(
    val firstName: String,
    val lastName: String,
    private var _age: Int,
) {
    val age: Int
        get() = if (_age < 0) 0 else _age

    var ageWithCustomSetter: Int
        get() = _age
        set(value) {
            if (value >= 0) {
                _age = value
            } else {
                println("Invalid age value: $value")
            }
        }
}
```

`_age`와 `age`가 따로 있다. **`_age`가 값을 실제로 담고 있는 백킹 필드(backing field)이고, `age`는 그 값을 가공해서 내주는 프로퍼티다.**

이름 앞에 밑줄을 붙이는 것은 관례다. 프로퍼티와 이름이 겹치면 안 되기 때문에 구분을 두는 것이다.

**코틀린이 자동으로 만들어주는 백킹 필드도 있다.** 커스텀 접근자 안에서 `field`라는 이름으로 접근한다.

```kotlin
var age: Int = 0
    set(value) {
        field = if (value < 0) 0 else value   // field가 백킹 필드
    }
```

이쪽을 쓰면 별도 프로퍼티를 만들 필요가 없다. 다만 기본 생성자에서 받은 값을 검증해야 하는 상황이면 앞의 방식이 편하다.

### 1.3 부 생성자

```kotlin
class Person(
    val firstName: String,
    val lastName: String,
    private var _age: Int,
    val hungry: Boolean,
) {
    constructor(firstName: String, lastName: String, hungry: Boolean)
        : this(firstName, lastName, 0, hungry)
}
```

자바에서 생성자를 오버로딩하는 것과 같다. **부 생성자는 반드시 기본 생성자를 호출해야 한다.** `: this(...)` 부분이 그것이다.

기본 생성자에 없는 값은 부 생성자가 채워 넣는다. 위 예시에서는 나이를 받지 않는 대신 0으로 채웠다.

### 1.4 init 블록

```kotlin
class Person(
    firstName: String,
    lastName: String,
    private var _age: Int,
) {
    val firstName: String
    val lastName: String

    init {
        this.firstName = firstName.ifEmpty { "Unknown" }
        this.lastName = lastName.ifEmpty { "Unknown" }
        if (_age < 0) {
            _age = 0
        }
    }
}
```

객체가 만들어지는 시점에 실행할 로직을 담는다. 검증이 대표적이다.

**여기서 실수하기 쉬운 부분이 있다.** 기본 생성자 파라미터에 `val`을 붙이면 그 순간 읽기 전용 프로퍼티가 된다. `init` 블록에서 다시 대입하면 컴파일 에러다.

```kotlin
class Person(val firstName: String) {
    init {
        firstName = "Unknown"   // 컴파일 에러. val은 재할당 불가
    }
}
```

값을 가공해야 하면 위 예시처럼 **파라미터에서 `val`을 떼고, 프로퍼티를 따로 선언한 다음 `init`에서 채운다.**

`init` 블록과 프로퍼티 초기화식은 **선언된 순서대로 실행된다.** 그래서 아직 초기화 안 된 프로퍼티를 `init`에서 읽으면 문제가 생긴다.

---

## 2. data class

```kotlin
data class User(val name: String, val age: Int)
```

기본 생성자에 선언된 프로퍼티를 기준으로 네 가지를 자동으로 만들어준다.

| 메서드 | 하는 일 |
|---|---|
| `equals()` | 프로퍼티 값이 같으면 같은 객체로 판정 |
| `hashCode()` | `equals()`와 짝을 맞춘 해시 |
| `toString()` | `User(name=diger, age=30)` 형태 |
| `copy()` | 일부 값만 바꾼 새 객체 생성 |

**기준이 "기본 생성자에 선언된 프로퍼티"라는 것이 중요하다.** 본문에 선언한 프로퍼티는 `equals`나 `toString`에 들어가지 않는다.

```kotlin
data class User(val name: String) {
    var age: Int = 0
}

User("kim").apply { age = 30 } == User("kim").apply { age = 40 }   // true
```

나이가 달라도 같은 객체로 판정된다. 값 비교를 위해 `data class`를 썼는데 정작 비교에서 빠지는 필드가 생기는 것이다.

`copy()`가 유용한 이유도 짚어둔다. 프로퍼티가 전부 `val`이면 값을 바꿀 수 없다. 대신 바뀐 값만 지정해서 새 객체를 만든다.

```kotlin
val user = User("kim", 30)
val older = user.copy(age = 31)
```

**자바의 `record`와 자주 비교되는데 방향은 반대다.** 코틀린의 `data class`가 먼저 나왔고(2016년 1.0), 자바의 `record`는 2021년 Java 16에서 정식이 됐다. 둘 다 "값을 담는 그릇"이라는 같은 문제를 풀지만, `record`가 더 엄격하다. `record`는 모든 필드가 `final`이고 상속이 불가능한 반면, `data class`는 `var` 프로퍼티도 가질 수 있다.

---

## 3. sealed class

**상속 가능한 하위 타입을 컴파일 시점에 전부 알 수 있게 제한하는 클래스**다.

```kotlin
sealed class Result {
    data class Success(val data: String) : Result()
    data class Error(val message: String) : Result()
}

fun handleResult(result: Result) {
    when (result) {
        is Result.Success -> println("Success: ${result.data}")
        is Result.Error -> println("Error: ${result.message}")
    }
}
```

### 3.1 왜 유용한가

`when`에 `else`가 없다. **컴파일러가 하위 타입이 둘뿐이라는 것을 알기 때문에** 두 경우를 다 처리하면 완전하다고 판단한다.

sealed가 아니면 이렇게 못 쓴다.

```kotlin
abstract class Result
class Success(val data: String) : Result()
class Error(val message: String) : Result()

fun handleResult(result: Result) {
    when (result) {
        is Success -> println("Success: ${result.data}")
        is Error -> println("Error: ${result.message}")
        else -> println("Unknown result")   // else가 없으면 컴파일 에러
    }
}
```

**여기서 진짜 값어치가 드러난다.** 나중에 `Result`에 `Loading`이라는 하위 타입을 추가한다고 하자.

sealed면 **`when`을 쓴 모든 곳에서 컴파일 에러가 난다.** 처리를 빠뜨린 자리를 컴파일러가 전부 찾아준다.

sealed가 아니면 `else`가 조용히 받아버린다. `Loading` 상태가 "Unknown result"로 처리되고, 실행해봐야 안다.

### 3.2 어디까지 상속할 수 있는가

sealed 클래스의 생성자는 항상 `private`이다. 그래서 외부에서 마음대로 상속할 수 없다.

**허용 범위가 코틀린 버전에 따라 달라졌다.**

| 버전 | 하위 타입을 어디에 둘 수 있는가 |
|---|---|
| 1.0 | 같은 파일의 중첩 클래스로만 |
| 1.1 | 같은 파일 안이면 어디든 |
| 1.5 이후 | 같은 모듈, 같은 패키지 안이면 어디든 |

지금은 같은 파일에 몰아넣지 않아도 되지만, **모듈 경계를 넘어갈 수는 없다.** 이 제한이 있어야 컴파일러가 하위 타입 전체를 알 수 있기 때문이다.

`sealed interface`도 1.5부터 쓸 수 있다. 클래스는 하나만 상속할 수 있지만 인터페이스는 여러 개 구현할 수 있어서 더 유연하다.

---

## 4. enum class

상수를 관리하는 클래스다.

### 4.1 왜 상수를 `val`로 두지 않는가

```kotlin
class Order {
    val statusReady = "READY"    // 인스턴스마다 새로 만들어진다
}
```

이렇게 두면 `Order` 객체를 만들 때마다 프로퍼티가 딸려온다. 값은 늘 같은데 자리만 차지한다.

`const val`이나 `companion object`에 두면 인스턴스마다 만들어지지는 않는다. 그럼에도 `enum class`를 쓰는 이유가 따로 있다.

**타입이 생긴다.** `String`으로 두면 아무 문자열이나 들어올 수 있지만, `enum`이면 정의된 값만 들어온다. 오타가 컴파일 에러가 된다.

**`when`에서 완전성 검사를 받는다.** sealed class와 같은 이유다.

### 4.2 프로퍼티와 메서드 갖기

```kotlin
enum class Planet(val mass: Double, val radius: Double) {
    MERCURY(3.303e+23, 2.4397e6),
    VENUS(4.869e+24, 6.0518e6),
    EARTH(5.976e+24, 6.37814e6),
    MARS(6.421e+23, 3.3972e6);

    fun diameter(): Double = radius * 2
}

fun main() {
    val p = Planet.MERCURY
    println("$p mass : ${p.mass}, diameter : ${p.diameter()}")
}
```

**여기서 `val`을 빠뜨리면 다르게 동작한다.**

```kotlin
enum class Planet(mass: Double, radius: Double) {   // val 없음
    MERCURY(3.303e+23, 2.4397e6)
}

Planet.MERCURY.mass   // 컴파일 에러. 그런 프로퍼티가 없다
```

`val` 없이 쓰면 **생성자 파라미터일 뿐 프로퍼티가 아니다.** `init` 블록 안에서만 쓸 수 있고 밖에서는 접근할 수 없다. 클래스의 기본 생성자와 같은 규칙이다.

### 4.3 제약과 기본 제공 기능

**enum 상수를 다른 클래스가 상속할 수 없다.** 생성자가 `private`이기 때문이다. 다만 인터페이스 구현은 가능하다.

```kotlin
interface Printable {
    fun display(): String
}

enum class Color : Printable {
    RED { override fun display() = "빨강" },
    BLUE { override fun display() = "파랑" }
}
```

상수마다 본문을 따로 줄 수도 있다. 위처럼 쓰면 각 상수가 익명 하위 클래스가 된다.

기본으로 딸려오는 것들이다.

| 이름 | 내용 |
|---|---|
| `entries` | 모든 상수의 목록 (1.9부터. 이전에는 `values()`) |
| `valueOf(name)` | 이름으로 상수 찾기. 없으면 예외 |
| `name` | 상수 이름 문자열 |
| `ordinal` | 선언 순서 (0부터) |

**`ordinal`을 DB에 저장하면 안 된다.** 상수 순서를 바꾸거나 중간에 하나를 넣으면 기존 데이터의 의미가 통째로 바뀐다. 저장할 때는 `name`을 쓴다.

---

## 5. value class

값 하나를 감싸는 타입을 만들면서, **런타임에는 그 값 자체로 취급되게** 하는 것이다.

### 5.1 왜 필요한가

이런 엔티티가 있다고 하자.

```kotlin
class User(
    name: String,
    email: String,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0

    val name: String = name
    val email: String = email

    init {
        validateUserName()
        validateUserEmail()
    }

    private fun validateUserName() {
        if (name.isBlank()) {
            throw IllegalArgumentException("invalid user name: $name")
        }
    }

    private fun validateUserEmail() {
        if (email.split('@').size != 2) {
            throw IllegalArgumentException("invalid user email: $email")
        }
    }
}
```

문제가 둘이다.

**타입이 너무 넓다.** 이메일을 `String`으로 다루면 어떤 문자열이든 들어올 수 있다. 검증을 어디선가 한 번 빠뜨리면 잘못된 값이 그대로 흘러간다.

**같은 타입 인자가 여러 개면 순서를 헷갈린다.** `User("kim@example.com", "kim")`처럼 순서를 바꿔 넣어도 컴파일러가 못 잡는다.

### 5.2 JPA의 방식

`@Embeddable`로 값 객체를 만드는 방법이 있다.

```kotlin
@Entity
class User(
    name: UserName,
    email: UserEmail,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0

    @Embedded
    val name: UserName = name

    @Embedded
    val email: UserEmail = email
}

@Embeddable
data class UserName(
    @Column(name = "name")
    val value: String,
) {
    init {
        if (value.isBlank()) {
            throw IllegalArgumentException("invalid user name: $value")
        }
    }
}
```

타입이 분리되니 순서를 바꿔 넣으면 컴파일 에러가 난다. 검증도 생성 시점에 한 번만 하면 된다.

**대신 문제가 남는다.** 값 객체마다 `@Embeddable`, `@Column`을 붙여야 하고, **JPA에 의존하게 된다.** 순수한 도메인 개념인 "사용자 이름"이 영속화 기술을 알고 있어야 하는 상황이다.

### 5.3 value class

```kotlin
@JvmInline
value class UserName(val value: String) {
    init {
        if (value.isBlank()) {
            throw IllegalArgumentException("invalid user name: $value")
        }
    }
}

@JvmInline
value class UserEmail(val value: String) {
    init {
        if (value.split('@').size != 2) {
            throw IllegalArgumentException("invalid user email: $value")
        }
    }
}
```

**애노테이션이 `@JvmInline` 하나뿐이다.** JPA를 전혀 모른다.

### 5.4 정말 사라지는가

네 번째 질문이다. 디컴파일해보면 이렇다.

```kotlin
fun greet(name: UserName) {
    println(name.value)
}
```

```java
public static final void greet_TqDgH0k(String name) {
    System.out.println(name);
}
```

**`UserName` 타입이 사라지고 `String`이 됐다.** 객체를 하나 더 만드는 비용 없이 타입 안전성만 얻는 것이다.

메서드 이름 뒤에 붙은 `_TqDgH0k`가 눈에 띈다. **이름 뒤섞기(mangling)** 다.

이게 왜 필요한지 생각해보면 이렇다. `greet(UserName)`과 `greet(UserEmail)`은 코틀린에서 다른 함수지만, 인라인되면 둘 다 `greet(String)`이 된다. 자바 바이트코드 수준에서 시그니처가 겹쳐버린다. 그래서 컴파일러가 타입 정보를 해시해서 이름 뒤에 붙인다.

**여기서 따라오는 제약이 있다.** 자바 코드에서 이 함수를 부르려면 뒤섞인 이름을 그대로 써야 한다. 자바와 섞어 쓰는 코드에서는 불편하다.

### 5.5 인라인되지 않는 경우

항상 사라지는 것은 아니다. **박싱이 필요한 상황에서는 실제 객체가 만들어진다.**

| 상황 | 결과 |
|---|---|
| 함수 파라미터, 지역 변수 | 인라인됨 |
| 제네릭 타입 인자 (`List<UserName>`) | 박싱됨 |
| nullable로 쓸 때 (`UserName?`) | 박싱됨 |
| 인터페이스 타입으로 다룰 때 | 박싱됨 |

성능을 위해 쓴다면 이 경계를 알아야 한다. 타입 안전성만 목적이라면 박싱돼도 문제될 것은 없다.

### 5.6 JPA와 함께 쓸 때 주의

`value class`를 엔티티 프로퍼티 타입으로 쓰는 것은 **JPA가 공식적으로 지원하는 방식이 아니다.**

필드 접근 전략에서는 컴파일된 필드 타입이 `String`이라 동작할 수 있지만, 프로퍼티 접근 전략에서는 getter 이름이 뒤섞여 있어 하이버네이트가 찾지 못한다. 하이버네이트 버전에 따라서도 달라진다.

**확실하게 쓰려면 `AttributeConverter`를 함께 두는 것이 안전하다.**

```kotlin
@Converter(autoApply = true)
class UserNameConverter : AttributeConverter<UserName, String> {
    override fun convertToDatabaseColumn(attribute: UserName): String = attribute.value
    override fun convertToEntityAttribute(dbData: String): UserName = UserName(dbData)
}
```

---

## 6. nested class와 inner class

세 번째 질문이다. **자바와 코틀린이 서로 반대다.**

### 6.1 자바

```java
class Outer {
    private String outer = "Outer";

    class InnerClass {              // 키워드 없음 = inner
        public InnerClass() {
            System.out.println(outer);   // 접근 가능
        }
    }
}
```

**자바는 아무 키워드도 안 붙이면 내부(inner) 클래스다.** 바깥 인스턴스에 대한 참조를 몰래 들고 있어서 바깥의 인스턴스 변수에 접근할 수 있다.

```java
class Outer {
    private String outer = "Outer";

    static class NestedClass {      // static = nested
        public NestedClass() {
            System.out.println(outer);   // 컴파일 에러
        }
    }
}
```

`static`을 붙이면 중첩(nested) 클래스가 되고 바깥 참조가 사라진다.

### 6.2 코틀린

```kotlin
class Outer {
    private val outer = "Outer"

    class NestedClass {             // 키워드 없음 = nested
        init {
            print(outer)            // 컴파일 에러
        }
    }
}
```

**코틀린은 아무 키워드도 안 붙이면 중첩 클래스다.** 자바의 `static class`에 해당한다.

```kotlin
class Outer {
    private val outer = "Outer"

    inner class InnerClass {        // inner를 명시해야 inner
        init {
            print(outer)            // 접근 가능
        }
    }
}
```

`inner`를 명시해야 바깥 참조를 갖는다.

### 6.3 왜 반대로 만들었는가

정리하면 이렇다.

| 언어 | 키워드 없음 | 키워드 붙임 |
|---|---|---|
| 자바 | inner (바깥 참조 있음) | `static` -> nested (참조 없음) |
| 코틀린 | nested (참조 없음) | `inner` -> inner (참조 있음) |

**자바의 기본값이 문제를 많이 일으켰기 때문이다.**

내부 클래스가 바깥 인스턴스 참조를 들고 있으면 **바깥 객체가 메모리에서 안 없어진다.** 내부 클래스 인스턴스 하나가 살아 있으면 바깥 객체도 통째로 붙잡혀 있다. 자바에서 흔한 메모리 누수 원인이다.

**필요할 때만 명시적으로 켜는 쪽이 안전하다.** 코틀린은 위험한 쪽을 기본값에서 뺐다.

공통점도 있다. **inner 클래스는 바깥 인스턴스가 있어야 만들 수 있다.**

```kotlin
val outer = Outer()
val inner = outer.InnerClass()      // 바깥 인스턴스를 통해서만
val nested = Outer.NestedClass()    // 독립적으로 가능
```

### 6.4 스프링 빈으로 등록할 때

중첩 클래스는 독립적으로 만들 수 있으므로 **컴포넌트 스캔이 그대로 잡는다.**

```kotlin
@Component
class OuterClass {
    @Component
    class NestedClass
}
```

inner 클래스는 바깥 인스턴스 없이 만들 수 없어서 **컴포넌트 스캔으로 등록되지 않는다.** 등록하려면 `@Bean` 메서드로 직접 만들어줘야 한다.

```kotlin
@Configuration
class InnerBeanConfig {

    @Bean
    fun innerBean(outer: OuterClass): OuterClass.InnerClass = outer.InnerClass()
}
```

**애초에 inner 클래스를 빈으로 만들 이유가 별로 없다.** 바깥 상태에 묶여 있다는 뜻이고, 그건 싱글턴 빈으로 관리할 대상이 아니다.

---

## 7. object

코틀린에는 `static` 키워드가 없다. `object`가 그 자리를 대신한다.

### 7.1 왜 싱글턴이 되는가

첫 질문이다. 디컴파일해보면 답이 나온다.

```kotlin
object CustomClassByObject {
    var customValue: Int = 20

    fun printCustomValue() {
        println("customValue is : $customValue")
    }
}
```

```java
public final class CustomClassByObject {
   private static int customValue;

   @NotNull
   public static final CustomClassByObject INSTANCE;

   public final int getCustomValue() {
      return customValue;
   }

   public final void printCustomValue() {
      System.out.println("customValue is : " + customValue);
   }

   private CustomClassByObject() {
   }

   static {
      CustomClassByObject var0 = new CustomClassByObject();
      INSTANCE = var0;
      customValue = 20;
   }
}
```

세 가지가 보인다.

**생성자가 `private`이다.** 밖에서 `new`를 할 수 없다.

**인스턴스를 담은 `INSTANCE`가 `static final`이다.** 한 번 대입되면 바뀌지 않는다.

**인스턴스 생성이 static 초기화 블록에서 일어난다.**

마지막이 동시성 문제의 답이다. **static 초기화 블록은 클래스가 처음 로딩될 때 딱 한 번 실행되고, 그 과정을 JVM이 락으로 보호한다.**

여러 스레드가 동시에 `CustomClassByObject`를 처음 건드려도, 클래스 로딩은 한 스레드만 수행하고 나머지는 끝날 때까지 기다린다. 자바 언어 명세가 보장하는 동작이다.

**그래서 `synchronized`나 이중 검사 잠금 같은 코드를 직접 쓸 필요가 없다.** 자바에서 싱글턴을 만들 때 골치 아팠던 부분이 언어 차원에서 해결돼 있다.

여기에는 부수 효과가 하나 있다. **`object`는 처음 접근할 때 만들어진다.** 클래스 로딩이 그때 일어나기 때문이다. 미리 만들어두는 것이 아니라 필요할 때 만들어지는 셈이다.

### 7.2 익명 객체

`object`는 익명 객체를 만드는 데에도 쓴다.

```kotlin
interface TestInterface {
    val a: Int
    fun calculate(): Int
}

fun main() {
    val someObject = object : TestInterface {
        override val a: Int = 5
        override fun calculate(): Int = a * a + 12
    }

    println(someObject.calculate())
}
```

**같은 키워드지만 의미가 다르다.** 이름을 붙여 선언하면 싱글턴이고, 식으로 쓰면 매번 새 객체가 만들어진다.

```kotlin
object Foo { }                  // 선언. 싱글턴
val bar = object : Baz() { }    // 식. 호출할 때마다 새 객체
```

자바의 익명 클래스에 해당한다.

---

## 8. companion object

### 8.1 왜 생겼는가

`object`를 클래스 안에 두면 접근 경로가 길어진다.

```kotlin
class ClassForTest {
    object SomeObjectClass {
        var someValue: Int = 24
        fun printSomeValue() = println("SomeValue is $someValue")
    }
}

ClassForTest.SomeObjectClass.printSomeValue()   // 중간에 이름이 하나 더
```

`companion object`는 이 중간 이름을 생략할 수 있게 한다.

```kotlin
class ClassForTest {
    companion object {
        val someValue = 24
        fun printSomeValue() = println(someValue)
    }
}

ClassForTest.printSomeValue()   // 바로 접근
```

**클래스 하나에 `companion object`는 하나만 둘 수 있다.** 중간 이름을 생략하는 것이 목적이니 여러 개면 구분할 방법이 없다.

이름을 붙일 수도 있다. 붙여도 생략은 그대로 된다.

```kotlin
class ClassForTest {
    companion object Factory {
        fun create() = ClassForTest()
    }
}

ClassForTest.create()          // 생략 가능
ClassForTest.Factory.create()  // 이름으로도 접근 가능
```

### 8.2 컴파일 결과 비교

두 번째 질문이다. 같은 클래스에 둘 다 넣고 디컴파일해봤다.

```kotlin
class ClassForTest {
    companion object {
        val someValueInCompanionObject = 24
        fun printSomeValue() = println(someValueInCompanionObject)
    }

    object ObjectForTest {
        val someValueInObject = 24
        fun printSomeValue() = println(someValueInObject)
    }
}
```

**`object` 쪽**은 앞에서 본 것과 같다. 자기 클래스 안에 값과 `INSTANCE`를 갖는다.

```java
public static final class ObjectForTest {
   private static final int someValueInObject;

   @NotNull
   public static final ClassForTest.ObjectForTest INSTANCE;

   private ObjectForTest() { }

   static {
      ClassForTest.ObjectForTest var0 = new ClassForTest.ObjectForTest();
      INSTANCE = var0;
      someValueInObject = 24;
   }
}
```

**`companion object` 쪽**은 다르다.

```java
public final class ClassForTest {
   private static final int someValueInCompanionObject = 24;   // 바깥 클래스의 필드

   @NotNull
   public static final ClassForTest.Companion Companion
       = new ClassForTest.Companion((DefaultConstructorMarker)null);

   public static final class Companion {
      public final int getSomeValueInCompanionObject() {
         return ClassForTest.someValueInCompanionObject;       // 바깥 필드를 읽는다
      }

      public final void printSomeValue() {
         System.out.println(this.getSomeValueInCompanionObject());
      }

      private Companion() { }
   }
}
```

**차이가 분명하다.**

`object`는 **값과 인스턴스가 모두 자기 클래스 안에** 있다.

`companion object`는 **값이 바깥 클래스의 static 필드로 나가 있고, `Companion`은 그것을 읽어주는 창구 역할**만 한다.

초기화 시점도 다르다. `object`는 static 초기화 블록에서 만들어지고, `companion object`는 **바깥 클래스의 필드 초기화식에서 만들어진다.** 그래서 바깥 클래스가 로딩될 때 함께 만들어진다.

### 8.3 static이 아니라는 점

컴파일 결과에서 알 수 있는 사실이 하나 더 있다. **`companion object`의 멤버는 진짜 static 멤버가 아니다.** `Companion`이라는 객체의 인스턴스 메서드다.

코틀린에서는 `ClassForTest.printSomeValue()`로 쓸 수 있지만, **자바에서 부르려면 `Companion`을 거쳐야 한다.**

```java
ClassForTest.Companion.printSomeValue();
```

이게 싫으면 `@JvmStatic`을 붙인다.

```kotlin
class ClassForTest {
    companion object {
        @JvmStatic
        fun printSomeValue() = println("hello")
    }
}
```

```java
ClassForTest.printSomeValue();   // 이제 가능
```

**진짜 static이 아니라는 점이 장점이 되기도 한다.** `companion object`는 인터페이스를 구현할 수 있고 확장 함수를 붙일 수도 있다. 자바의 static 멤버로는 못 하는 일이다.

```kotlin
interface Factory<T> {
    fun create(): T
}

class User private constructor(val name: String) {
    companion object : Factory<User> {
        override fun create() = User("default")
    }
}

fun makeAll(factory: Factory<*>) { }
makeAll(User)     // companion object를 값으로 넘길 수 있다
```

### 8.4 무엇을 언제 쓰는가

| 상황 | 선택 |
|---|---|
| 특정 클래스에 딸린 팩토리 메서드나 상수 | `companion object` |
| 클래스와 무관한 독립 싱글턴 (설정, 레지스트리) | `object` |
| 인터페이스 구현체를 하나만 두고 싶을 때 | `object` |
| 자바에서 static처럼 부르고 싶을 때 | `companion object` + `@JvmStatic` |

---

## 정리하며

처음 던진 질문들에 대한 답이다.

**`object`가 왜 싱글턴이 되는가.** 디컴파일하면 생성자가 `private`이고, `INSTANCE`가 `static final`이며, 인스턴스 생성이 static 초기화 블록에서 일어난다. 클래스 로딩은 JVM이 한 스레드만 수행하도록 보장하므로 동시성 문제가 언어 차원에서 해결된다. 직접 `synchronized`를 쓸 이유가 없다.

**`object`와 `companion object`의 컴파일 결과 차이.** `object`는 값과 인스턴스를 모두 자기 클래스 안에 갖고 static 초기화 블록에서 만들어진다. `companion object`는 값이 바깥 클래스의 static 필드로 나가고 `Companion`은 그것을 읽어주는 창구 역할만 하며, 바깥 클래스의 필드 초기화식에서 만들어진다.

**자바와 코틀린의 내부 클래스가 반대인가.** 맞다. 자바는 키워드 없이 쓰면 바깥 참조를 갖는 inner이고 `static`을 붙여야 참조가 없어진다. 코틀린은 키워드 없이 쓰면 참조가 없는 nested이고 `inner`를 붙여야 참조가 생긴다. 바깥 참조가 메모리 누수의 원인이 되므로 위험한 쪽을 기본값에서 뺀 것이다.

**`value class`가 정말 사라지는가.** 함수 파라미터나 지역 변수로 쓰면 사라지고 감싼 값 자체가 된다. 다만 제네릭 타입 인자, nullable, 인터페이스 타입으로 다룰 때는 박싱된다. 이름 뒤섞기 때문에 자바에서 부르기 불편해지는 대가도 있다.

디컴파일해보고 나서 남은 감각은 **코틀린의 문법 대부분이 자바로 옮겨지는 규칙**이라는 것이었다. 새로운 개념이 아니라 자바에서 손으로 쓰던 패턴을 언어가 흡수한 것이라 보면 대부분 설명이 됐다.
