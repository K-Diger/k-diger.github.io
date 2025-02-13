---

title: 운영 중인 프로덕션의 테스트 환경 개선에 관하여 (+테스트 대역)
date: 2023-09-21
categories: [SUWIKI]
tags: [SUWIKI]
layout: post
toc: true
math: true
mermaid: true

---

# 테스트 환경을 개선하여 테스트 코드 작성으로 발생할 생산성 저하 문제 개선

기존에는 테스트 환경이 전혀 마련되어있지 않고 Postman으로 일일히 E2E테스트를 하는게 전부였다.

때문에 실제 프로덕트에서 예상치 못한 버그가 발생한 경우가 조금씩 나오게 되면서 테스트 프레임워크를 활용한 자동화된 테스트 환경을 도입하기로 했다.

그런데, 이미 발생한 버그들을 찾기 위해선 빠르게 테스트 환경을 마련해야할 필요가 있었는데 이 때 통합 테스트를 작성하되 사용자의 행위에 대한 시나리오에 대응할 수 있는 테스트 템플릿을 만들어야겠다고 생각했다.

![](https://github.com/K-Diger/K-Diger.github.io/assets/60564431/0bb8bed9-80a2-4478-93dd-b2d78927865c)

![](https://github.com/K-Diger/K-Diger.github.io/assets/60564431/0deccb5b-eaeb-452b-8b50-44fe7410add1)

위 그림은 해당 테스트 템플릿의 일부이다. 위 SQL 구문을 활용, 테스트 베이스 객체를 상속받으면 통합테스트를 아주 간편하게 작성할 수 있게 된다.

---

# 테스트 대역의 종류는 무엇이 있을까?

우선 테스트 대역이란, 실제 객체가 아닌 단순한 객체를 이용하여 테스트하는 것을 말한다.

- Mock (행위에 집중하기 위함)
    - Mock (실제 객체의 동작을 모방한 가짜 객체)
        - Mock은 실제 객체를 완전히 대체한다.
        - Spy와 달리 해당 객체의 일부분만을 스텁으로 대체할 수 없다.

    - Spy (실제 객체를 기반으로 생성된 가짜 객체)
        - 실제 메서드가 실행되고 그 메서드가 실제로 테스트된다.
        - 또한 일부분을 스텁으로 대체할 수 있다.

- Stub (상태에 집중하기 위함)
    - Stub (mock객체의 기대 행위(when() ~~ then())를 작성하여 테스트에서 원하는 상황을 작성하는 것을 Stub이라한다.)
    - Dummy (객체가 필요하지만 내부 기능이 필요하지는 않을 때 사용)
    - Fake (실제로 사용된 객체는 아니지만 같은 동작을 하는 구현된 객체이다.(원래 객체의 단순화된 버전))

---

# 테스트 대역이 왜 필요한가?

1. OrderRepository.findOrderList()로 기존 주문서 조회
2. 주문서가 있다면 중복으로 간주해 OrderDuplicateException 발생
3. OrderRepository.createOrder()로 주문서 생성
4. Argument로 넘어온 isNotify가 true이면 NotificationClient.notifyToMobile()를 이용해 알림 발생

위와 같은 OrderService의 createOrder() 비즈니스 로직 시나리오가 있다고 가정했을 때 OrderService의 로직을 테스트하려면 아래 절차가 반드시 필요하다.

- OrderRepository가 사용할 RDB connection 세팅
- RDB에 로직 테스트 조건에 맞는 데이터 세팅
- NotificationClient가 사용할 Notification Server 연결
- Notification이 성공했을 때의 데이터 롤백 처리

이러한 선행 조건이 많아지게 될수록 테스트는 느려지고 복잡도가 증가하게 된다. 또한 외부의 영향으로 로직 자체를 테스트 못하는 경우도 생길 수 있다.

이런 문제 영역을 `메소드의 실제 내부 동작은 실행되지 않고` 상황 설정만 할 수 있도록 해결한 것이 `테스트 대역`이다.

---

## Mockito를 사용하여 외부 의존성을 제거하여 테스트 작성

```java
public class MockitoTest {
    private OrderService orderService;

    @Test
    public void createOrderTest() {
        // Arrange
        OrderRepository orderRepository = Mockito.mock(OrderRepository.class);
        NotificationClient notificationClient = Mockito.mock(NotificationClient.class);
        orderService = new OrderService(orderRepository, notificationClient);

        // Arrange - Stub
        Mockito.when(orderRepository.findOrderList()).then(invocation -> {
            System.out.println("모킹된 레포지토리 실행");
            return Collections.emptyList();
        });

        // Arrange - Stub
        Mockito.doAnswer(invocation -> {
            System.out.println("모킹된 푸쉬 알림 클라 실행");
            return null;
        }).when(notificationClient).notifyToMobile();

        // Act
        orderService.createOrder(true);

        // Assert
        Mockito.verify(orderRepository, Mockito.times(1)).createOrder();
        Mockito.verify(notificationClient, Mockito.times(1)).notifyToMobile();
    }
}
```

---

## @Mock 애노테이션을 사용하여 Mock 객체 더 쉽게 만들기

```java
@ExtendWith(MockitoExtension.class)
public class MockitoTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private NotificationClient notificationClient;

    private OrderService orderService;

    @Test
    public void createOrderTest() {
        // Arrange
        orderService = new OrderService(orderRepository, notificationClient);

        // Arrange - Stub
        Mockito.when(orderRepository.findOrderList()).then(invocation -> {
            System.out.println("모킹된 레포지토리 실행");
            return Collections.emptyList();
        });

        // Arrange - Stub
        Mockito.doAnswer(invocation -> {
            System.out.println("모킹된 푸쉬 알림 클라 실행");
            return null;
        }).when(notificationClient).notifyToMobile();

        // Act
        orderService.createOrder(true);

        // Assert
        Mockito.verify(orderRepository, Mockito.times(1)).createOrder();
        Mockito.verify(notificationClient, Mockito.times(1)).notifyToMobile();
    }
}
```

- 한 가지 주의 할 점은 @ExtendWith(MockitoExtension.class)를 사용해야지만 테스트 시작전 어노테이션을 감지해서 mock 객체를 주입하기 때문에 꼭 함께 사용해야 한다.

- 또한 실제 테스트 대상은 다른 의존성에 대한 Mock 과 달리 Stub을 지정해주지 않았는데 `Mockito의 기본전략`이 `Answers.RETURNS_DEFAULTS`이 이를 해결해준 것이다.
    - 이로 인해 아무런 내용이 없는 메서드가 타입에 맞게 (void) 실행된 것이다.

---

## @InjectMocks 애노테이션을 사용하여 테스트 대상 Mock 객체에 Mock 의존성 주입하기

```java
@ExtendWith(MockitoExtension.class)
public class MockitoTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private NotificationClient notificationClient;

    @InjectMocks
    private OrderService orderService;

    @Test
    public void createOrderTest() {
        // Arrange - Stub
        Mockito.when(orderRepository.findOrderList()).then(invocation -> {
            System.out.println("모킹된 레포지토리 실행");
            return Collections.emptyList();
        });

        // Arrange - Stub
        Mockito.doAnswer(invocation -> {
            System.out.println("모킹된 푸쉬 알림 클라 실행");
            return null;
        }).when(notificationClient).notifyToMobile();

        // Act
        orderService.createOrder(true);

        // Assert
        Mockito.verify(orderRepository, Mockito.times(1)).createOrder();
        Mockito.verify(notificationClient, Mockito.times(1)).notifyToMobile();
    }
}
```

- @InjectMocks 애노테이션을 활용하면 Arrange 범위에서 의존성을 주입해줄 필요가 없게 된다.

---

## @Spy 애노테이션을 활용하기

OrderRepository의 메소드 중 createOrder()는 stub하고 findOrderList()는 실제 기능을 그대로 사용하고 싶을 때 `Spy`를 사용하면 좋다.

Spy는 Mock과 달리 객체의 전체를 대체하는 것이 아닌 일부분만 대체하여 사용하는 것이 가능하다.

```java
@ExtendWith(MockitoExtension.class)
public class MockitoTest {

    @Spy
    private OrderRepository orderRepository;

    @Spy
    private NotificationClient notificationClient;

    @InjectMocks
    private OrderService orderService;

    @Test
    public void createOrderTest() {
        // Arrange - Stub
        Mockito.doAnswer(invocation -> {
            System.out.println("Spy 객체로, OrderRepository의 CreateOrder 메서드를 Stub으로 대체한다.");
            return null;
        }).when(orderRepository).createOrder();

        // Arrange - Stub
        Mockito.doAnswer(invocation -> {
            System.out.println("모킹된 푸쉬 알림 클라 실행");
            return null;
        }).when(notificationClient).notifyToMobile();

        // Act
        orderService.createOrder(true);

        // Assert
        Mockito.verify(orderRepository, Mockito.times(1)).createOrder();
        Mockito.verify(notificationClient, Mockito.times(1)).notifyToMobile();
    }
}
```

- 이렇게 특정 객체의 특정 메서드만 스텁으로 대체해서 사용하고 싶다면, Spy를 쓸 수 있고, 스텁으로 대체하지 않은 메서드는 실제 메서드로 사용된다.

---

## @MockBean 애노테이션 활용하기 (@SpringBootTest)

```java
@SpringBootTest
class BasicSpringTests {

    @Autowired
    private OrderService orderService;

    @Test
    void createOrderTest() {
        orderService.createOrder(true);
    }
}
```

위 코드는 실제 모든 빈과 Ioc/DI 컨테이너를 다 띄우고 테스트한다. 따라서 테스트 대역을 사용하지 않았을 때의 문제점을 모두 안고가는 테스트이다.

이 과정을 더 단축시키기 위해 @MockBean 애노테이션이 쓰인다. 이 애노테이션은 컨테이너에 실제 객체가 아닌 Mock객체를 등록하게한다.

```java
@SpringBootTest
class BasicSpringTests {

    @MockBean
    private OrderRepository orderRepository;

    @MockBean
    private NotificationClient notificationClient;

    @Autowired
    private OrderService orderService;

    @Test
    void createOrderTest() {
        // Arrange - Stub
        Mockito.when(orderRepository.findOrderList()).then(invocation -> {
            System.out.println("MockBean 애노테이션으로 만들어진 OrderRepository를 사용한다.");
            return Collcetions.emptyList();
        });
        // Arrange - Stub
        Mockito.doAnsewr(invocation -> {
            System.out.println("MockBean 애노테이션으로 만들어진 NotificationClient를 사용한다.");
            return null;
        }).when(notificationClient).notifyToMobile();

        // Act
        orderService.createOrder(true);

        // Assert
        Mockito.verify(orderRepository, Mockito.times(1)).createOrder();
        Mockito.verify(notificationClient, Mockito.times(1)).notifyToMobile();
    }
}
```

- `@Mock` 애노테이션이 달린 객체는 `@InjectMocks`에 주입된다.
- `@MockBean` 애노테이션이 달린 객체는 `@SpringBootTest`에 주입된다.
