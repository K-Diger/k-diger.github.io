---

title: 관찰 가능성 엔지니어링 - Chapter3 (자동 계측)
date: 2025-02-09
categories: [Opentelementry]
tags: [Opentelementry]
layout: post
toc: true
math: true
mermaid: true

---

# 원격 측정의 목표

시스템의 정보를 전달하여 장애가 발생 했을 때의 근본적인 원인을 분석할 수 있게하기 위함이다.

또한 장애가 해소된 후 기록된 추적/메트릭/로그 정보를 소급하면 정확히 어떤 문제가 발생한 것인지 알아낼 수 있다.

자동 계측은 이러한 사용성을 제공하기 위한 편의성을 확보하고자 코드를 계측하는 행위를 자동화한 것이다.

---

# 자동 계측 환경설정 - 고장 난 전화기 게임

고요속의 외침과 비슷하다. 첫 번째 사람이 속으로 생각한 문장을 두 번째 사람에게 속삭여서 전달하고 두 번째 사람은 세 번째 사람에게 전달한다.

마지막 사람이 이 문장을 모든 사람들에게 공유할 때 까지 반복하는 게임이다.

```shell
git clone https://github.com/PacktPublishing/Cloud-Native-Observability
cd Cloud-Native-Observability/Chapter03
docker compose up
```

위 명령어로 예제 환경을 구동시킬 수 있다.

---

# 자동 계측

Otel은 소스코드 수정 없이 이식 가능한 원격 측정 데이터를 추출할 수 있는 자동화된 기능을 요구사항으로 전달받았다.

즉, 사용자가 수동 계측을 위한 코드의 수정을 하지 않아도 Otel로 전환했을 때 원격 측정을 이어서 수행할 수 있도록 하는 것이 과제인 것이다.

그러면 수동 계측을 시행하기위한 과제는 아래와 같다.

---

# 자동 계측 컴포넌트

Otel에서 자동 계측은 두 부분으로 구성된다.

## 자동 계측 컴포넌트 1. 계측 라이브러리

| 언어   | 라이브러리/프레임워크                                        |
|------|----------------------------------------------------|
| GO   | gin, gomemcache, gorilla/mux, net/http             |
| Java | Akka, gRPC, Hibernate, JDBC, Kafka, Spring, Tomcat |
| ...  | ...                                                |

대부분의 계측 라이브러리는 계측 범위가 해당 라이브러리에 한정된다. 예를들어 Hibernate가 지원하는 계측은 Hibernate가 활용된 범위내의 계측 정보만 전달하는 등

## 자동 계측 컴포넌트 2. Agent/Runner

사용자의 별다른 조치 없이 자동으로 계측 라이브러리를 호출할 수 있도록 도와주는 요소이다.

실전에서는 이 Agent 혹은 Runner라고 불리는 구성요소가 실제 계측 라이브러리를 불러오는데 사용된다.

---

# 자동 계측의 한계

## 1. 애플리케이션에 특화된 코드를 측정할 수 없다.

HTTP 계측 라이브러리를 통해 웹 페이지를 요청하는 코드를 예시로 들어본다.

```python
def do_something_important():
  # 메서드 내부 동작 수행

def client_request():
  do_somthing_important()
  requests.get("https://webserver")
```

자동 계측이 계측하는 범위는 client_request 메서드가 실행된 부분에 한해서만 측정된다.

즉, do_something_important()에 대해서는 아무런 정보가 포착되지 않는다. 앞서 자동 계측 컴포넌트에서 말했듯이 대부분의 계측 라이브러리는 본인이 제공하는 기능의 범위 한해서만 계측을 수행하기 때문이다.

## 2. 관심 없는 정보도 계측될 수 있다.

동일한 네트워크 호출이 중복되어 계측되거나 계측 라이브러리에서 제공하지만 우리에겐 관심 없는 정보가 생성될 수 있다.

이런 한계점이 있음을 알고 Java환경에서 자동 계측이 어떻게 구현되어있는지 알아본다.

---

# 바이트코드 조작

## Java Agent

Otel을 위한 자동 계측 자바 구현체는 [코드를 계측하기 위해 자바 계측 API를 활용한다.](https://docs.oracle.com/javase/8/docs/api/java/lang/instrument/Instrumentation.html)

또한 [GitHub 저장소](https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases)에서 JAR파일로도 다운로드할 수 있다. 이 JAR가 포함하고있는 컴포넌트는 아래와 같다.

- javaagent 모듈
- 여러 프레임워크/서드파티 라이브러리 계측을 지원하는 라이브러리
- Otel 컴포넌트를 초기화 및 구성

위 파일은 커맨드라인에 -javaagent 옵션을 지정하여 호출할 수 있다.

```shell
java -javaagent:/app/opentelemetry-javaagent.jar \
     -Dotel.resource.attributes=service.name=broken-telephonejava \
     -Dotel.traces.exporter=oltp \
     -jar broken-telephone.jar
```

위 명령어처럼 otel 에이전트를 로드하면 다른 코드가 실행되기 전에 라이브러리들의 바이트 코드를 수정할 수 있다.

- -javaagent 옵션 지정 후 실행
  - OpenTelemetryAgent는 아래 작업을 비동기로 진행
    - OpenTelemetryInstaller를 통해 Otel 구성
    - AgentInstaller가 Byte Buddy와 서드파티 계측 라이브러리를 설치

다음은 gRPC 요청을 보내는 코드이다.

```java
// BrokenTelephoneServer.java
static class BrokenTelephoneImpl extends BrokenTelephonGrpc.BrokenTelephoneImplBase {
    @Override
    public void saySomthing(
        Brokentelephone.BropenTelephoneRequest req,
        StreamObserver<BrokenTElephone.BrokenTelephoneResponse> responseObserver
    ) {
        BrokenTelephone.BrokenTelephoneResponse reply = Brokentelephone
            .BrokenTelephoneResponse
          .newBuilder()
          .setMessage("Hello " + req.getMessage()).build();
        responseObserver.onNext(reply);
        responseObserver.onCompleted();
    }
}
```

여기서는 Otel에 관한 내용은 어디서도 볼 수 없다. 하지만 에이전트가 런타임에 호출되고, 계측에 관한 바이트코드를 주입하여 수행한다.

---

## Runtime Hook, Monkey Patching

파이썬의 계측 라이브러리는 여러 컴포넌트에 의존한다.

### 파이썬의 계측 컴포넌트 의존성 1. 계측 라이브러리

- 계측 대상 라이브러리가 노출하는 이벤트훅은 이벤트 발생 시 원격측정을 등록하고 데이터를 만들 수 있게한다.
- 라이브러리에 대한 호출 가로채기는 계측 후 몽키 패칭이라고 알려진 기술을 통해 런타임에 대체된다. (바이트 코드 주입과 유사하다.)

각 계측 라이브러리는 독립적으로 패키징되어있어 계측 라이브러리 설치 시 의존성 수를 줄여줄지만 필요한 계측 라이브러리를 사용자가 일일히 설치해야한다는 단점이 있다. 이를 회피하기 위한 방법이 Chapter 7에 등장한다.

### 파이썬의 계측 컴포넌트 의존성 2. 계측기 인터페이스

계측 인터페이스는 다음 메서드를 구현하고 제공하도록하여 사용자에게 일관된 계측 정보를 전달하고자 제안한다.

- `_instrument`
  - 계측 라이브러리의 초기화 로직을 담고 있으며 몽키 패칭이나 이벤트 훅에 대한 등록이 이 메서드에 구현된다.
- `_uninstrument`
  - 이벤트 훅에 대한 등록 취소나 몽키 패칭 삭제를 위한 로직을 구현한다. 라이브러리와 관련된 추가적인 정리 로직도 구현해야한다.
- `instrument_dependencies`
  - 계측 라이브러리가 지원하는 라이브러리와 버전 목록을 반환한다.

파이썬은 이 인터페이스를 제공하는 것 처럼 자동 계측을 지원하는 계측 라이브러리는 엔트리 포인트를 통해 자신을 직접 등록해야한다.

### 파이썬의 계측 컴포넌트 의존성 3. 래퍼 스크립트

위 컴포넌트 2가지를 작동할 수 있도록 래퍼 스크립트를 제공한다.

이 스크립트는 `opentelemetry_instrumentor`이름으로 등록된 엔트리 포인트를 호출하여 해당 환경에 설치된 모든 계측 라이브러리를 탐색한다.

---

이처럼 Otel은 사용자의 코드에 부가적인 내용이 들어가지 않더라도 `자동화 + 원격 측정`의 성격을 갖는 계측 데이터를 생산해 낼 수 있도록 하고 있다. 다음 장에서는 이러한 기법들을 활용하여 애플리케이션을 계측하기 위한 구성요소(분산 추적, 메트릭, 로그, 계측 라이브러리)를 알아본다.
