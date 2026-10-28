---
title: "[AI 5편] MCP 서버와 클라이언트 구현, 프리미티브와 전송 방식 정리"
date: 2026-06-13
categories: [AI]
tags: [AI, MCP, Agent, ClaudeCode]
layout: post
toc: true
math: false
mermaid: true
series: ai
series_order: 5
---

## 참고자료

- [Anthropic Academy - Introduction to Model Context Protocol](https://anthropic.skilljar.com/introduction-to-model-context-protocol)
- [Anthropic Academy - Model Context Protocol: Advanced Topics](https://anthropic.skilljar.com/model-context-protocol-advanced-topics)
- [Model Context Protocol - Specification](https://modelcontextprotocol.io/specification/latest)
- [Model Context Protocol - Transports](https://modelcontextprotocol.io/specification/latest/basic/transports)
- [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)
- [Claude Code Docs - MCP](https://code.claude.com/docs/en/mcp)
- [Claude Academy - 엔지니어링 과정 목록](https://academy.claude.com/ko/all?department=engineering) (Claude Code 101, Claude Platform 101, 커넥터 튜토리얼 보완분)

---

## 배경

스터디 5주차는 MCP(Model Context Protocol) 입문과 심화 강의였다.

Claude Code에 `claude mcp add`로 MCP 서버를 연결해 쓰고 있었지만, 지난주에 정리한 도구 사용(tool use)과 무엇이 다른지, 서버를 별도로 두는 이유가 무엇인지는 설명하지 못했다.

강의를 따라 문서를 읽고 수정하는 MCP 서버와 그 서버에 연결하는 클라이언트를 모두 구현했다. 실무에서는 보통 한쪽만 만들지만, 양쪽을 구현하면 메시지 흐름을 확인할 수 있다.

정리하면서 확인하고 싶었던 것들이다.

- MCP는 도구 사용을 대체하는가, 보완하는가?
- 도구(tools) 외에 리소스(resources)와 프롬프트(prompts)를 따로 두는 이유는 무엇인가?
- 서버가 클라이언트에게 요청을 보내는 경우는 언제인가?
- 로컬에서 동작하던 서버가 HTTP로 배포한 뒤 일부 기능이 동작하지 않는 이유는 무엇인가?
- 외부 OAuth가 차단된 폐쇄망에서는 MCP를 어떻게 사용할 수 있는가?

---

## 큰 그림

MCP는 모델에게 제공할 도구와 데이터를 누가 구현하고 어떤 형식으로 전달할지 정의한 프로토콜이다. 구성 요소는 호스트, 클라이언트, 서버다.

```mermaid
flowchart LR
    subgraph App[애플리케이션]
        H[호스트<br/>Claude Code 등]
        C[MCP 클라이언트]
    end
    S[MCP 서버]
    X[외부 시스템<br/>GitHub, 문서, DB]
    M[모델]

    H <--> M
    H --- C
    C <-->|JSON 메시지<br/>stdio 또는 HTTP| S
    S <--> X
```

모델과 통신하는 애플리케이션(호스트) 안에 MCP 클라이언트가 있고, 클라이언트가 MCP 서버와 JSON 메시지를 주고받는다. 외부 시스템 연동은 서버가 담당한다. 1절은 서버를 분리하는 이유, 2절은 서버가 제공하는 3가지 프리미티브, 3절은 메시지 종류와 서버 측 요청, 4절은 전송 방식을 다룬다.

---

## 1. 서버를 분리하는 이유

GitHub 정보를 조회하는 챗봇을 만든다고 하자. 도구 사용 방식으로 직접 구현하면 저장소 목록, PR, 이슈마다 도구 스키마를 작성하고, GitHub API를 호출하는 함수를 구현하고, GitHub API가 바뀌면 수정해야 한다. 연동할 서비스가 5개면 작업량도 5배다.

MCP는 이 작업을 서버로 분리한다. GitHub용 MCP 서버가 GitHub 기능을 표준 형식의 도구 목록으로 제공하고, 애플리케이션은 서버에 연결만 한다. 서비스 제공사가 공식 서버를 배포하기도 하고, 누구나 직접 만들 수도 있다.

MCP는 도구 사용을 대체하지 않는다. 모델이 도구를 선택하고 호출을 요청하는 방식은 도구 사용 그대로이고, 도구의 정의와 실행을 MCP 서버가 담당한다.

```mermaid
sequenceDiagram
    participant U as 사용자
    participant App as 애플리케이션
    participant C as MCP 클라이언트
    participant S as MCP 서버
    participant M as 모델

    U->>App: "내 저장소 목록 보여 줘"
    App->>C: 도구 목록 요청
    C->>S: ListToolsRequest
    S-->>C: 도구 목록
    App->>M: 질문 + 도구 목록
    M-->>App: list_repos 호출 요청
    App->>C: 실행 요청
    C->>S: CallToolRequest
    S->>S: GitHub API 호출
    S-->>C: CallToolResult
    App->>M: 도구 결과
    M-->>App: 최종 응답
```

모델은 도구를 선택하고, 애플리케이션은 요청을 전달하고, 서버는 도구를 실행한다.

서버는 Python SDK의 `FastMCP`로 구현했다. 함수에 데코레이터를 붙이고 타입 힌트와 설명을 작성하면 SDK가 JSON 스키마를 생성한다.

```python
from mcp.server.fastmcp import FastMCP
from pydantic import Field

mcp = FastMCP("DocumentMCP")
docs = {"report.pdf": "20m 응축탑의 상태를 다룬 보고서다."}

@mcp.tool(name="read_doc_contents", description="문서 내용을 문자열로 반환한다.")
def read_document(doc_id: str = Field(description="읽을 문서의 ID")):
    if doc_id not in docs:
        raise ValueError(f"{doc_id} 문서가 없다")  # 예외는 오류 결과로 모델에 전달된다
    return docs[doc_id]
```

`mcp dev server.py`로 실행하면 브라우저에서 서버를 테스트하는 인스펙터가 열린다. 애플리케이션에 연결하기 전에 도구 목록 확인, 입력값을 넣은 실행, 수정 후 재조회를 바로 반복할 수 있다. 애플리케이션에 연결한 뒤 디버깅하면 오류 원인이 서버, 애플리케이션, 모델 중 어디인지 구분하기 어렵다.

---

## 2. 3가지 프리미티브: tools, resources, prompts

MCP 서버가 제공하는 기본 단위(프리미티브)는 3가지이고, 사용 여부를 결정하는 주체가 다르다.

| 프리미티브 | 사용 결정 주체 | 용도 | 예 |
|---|---|---|---|
| 도구(tools) | 모델 | 모델이 필요할 때 호출하는 기능 | 문서 수정, 계산 |
| 리소스(resources) | 애플리케이션 코드 | 애플리케이션이 조회해서 화면이나 대화에 넣는 데이터 | 문서 목록, 문서 내용 |
| 프롬프트(prompts) | 사용자 | 사용자가 선택해 실행하는 검증된 지시 템플릿 | "문서를 마크다운으로 변환" 명령 |

리소스는 HTTP의 GET 요청과 비슷하게 데이터를 조회하는 용도다. 강의 예제는 `@문서이름`으로 문서를 지정하는 기능이었다. `@`를 입력하면 애플리케이션이 문서 목록 리소스를 조회해 자동 완성을 표시하고, 선택하면 문서 내용을 프롬프트에 바로 포함한다. 모델이 도구를 호출해 문서를 읽는 단계가 하나 줄어든다.

```python
@mcp.resource("docs://documents", mime_type="application/json")
def list_docs() -> list[str]:          # 고정 URI
    return list(docs.keys())

@mcp.resource("docs://documents/{doc_id}", mime_type="text/plain")
def fetch_doc(doc_id: str) -> str:    # 파라미터가 포함된 URI 템플릿
    return docs[doc_id]
```

프롬프트는 서버 작성자가 미리 작성하고 테스트한 지시문이다. 예외 상황을 고려해 검증한 지시문이 사용자가 매번 직접 작성하는 지시문보다 결과가 안정적이다. Claude Code에서는 `/`를 입력하면 서버가 제공하는 프롬프트가 명령 목록에 표시된다.

서버를 설계할 때 기능마다 사용 결정 주체를 먼저 정한다. 운영 환경을 변경하는 기능을 모델이 판단해서 호출하는 도구로 둘지, 사용자가 실행하는 프롬프트로 둘지 검토해야 한다.

---

## 3. 메시지 종류와 서버 측 요청

MCP 통신은 JSON 메시지로 이뤄지고, 메시지는 2종류다.

| 종류 | 특징 | 예 |
|---|---|---|
| 요청과 결과 | 요청 후 결과를 기다린다 | 도구 호출, 프롬프트 목록, 리소스 조회, 초기화 |
| 알림(notification) | 단방향, 응답 없음 | 진행률, 로그, 도구 목록 변경 |

연결은 초기화 메시지 3개로 시작한다. 클라이언트가 초기화 요청을 보내고, 서버가 지원 기능 목록을 응답하고, 클라이언트가 초기화 완료 알림을 보낸다. 이 과정이 끝난 뒤 도구 호출 등의 요청을 보낼 수 있다.

MCP는 양방향 프로토콜이다. 클라이언트뿐 아니라 서버도 클라이언트에게 요청을 보낼 수 있다. 대표적인 기능이 샘플링과 루트 조회다.

### 3.1 샘플링

위키 문서를 수집해서 요약하는 서버가 있다고 하자. 서버가 직접 모델을 호출하려면 서버에 API 키가 있어야 하고 호출 비용도 서버 운영자가 부담한다. 공개 서버라면 모든 사용자의 요약 비용을 서버 운영자가 내야 한다.

샘플링(sampling)은 서버가 프롬프트를 만들어 클라이언트에게 모델 호출을 요청하는 기능이다. 클라이언트가 자신의 모델 연결로 호출하고 결과를 서버에 반환한다. 서버에는 API 키가 필요 없고, 비용은 기능을 사용하는 클라이언트가 부담한다.

```python
@mcp.tool()
async def summarize(text: str, ctx: Context):
    result = await ctx.session.create_message(        # 클라이언트에 모델 호출 요청
        messages=[SamplingMessage(role="user", content=TextContent(type="text", text=f"요약해라:\n{text}"))],
        max_tokens=4000,
    )
    return result.content.text
```

### 3.2 진행 알림과 루트

실행 시간이 긴 도구는 진행률과 로그를 알림으로 보낼 수 있다. 사용자는 작업이 진행 중인지 멈췄는지 확인할 수 있다.

루트(roots)는 클라이언트가 서버에 접근을 허용한 디렉터리 목록이다. "biking.mp4를 변환해 줘"처럼 파일 이름만 입력해도 서버가 루트 안에서 파일을 찾는다. SDK는 루트 범위를 자동으로 강제하지 않으므로, 요청 경로가 루트 안에 있는지 검사하는 코드는 서버에서 직접 구현해야 한다. Claude Code 훅(Hook, 정해진 시점에 자동 실행되는 셸 명령)에서 경로의 `..` 포함 여부를 검사하는 것과 같은 이유다.

---

## 4. 전송 방식: stdio와 StreamableHTTP

전송 방식(transport)은 JSON 메시지가 오가는 통신 채널이다.

### 4.1 stdio

클라이언트가 서버를 자식 프로세스로 실행하고, 서버의 표준 입력으로 메시지를 보내고 표준 출력으로 받는다. 양쪽 모두 언제든 메시지를 보낼 수 있어 3절의 서버 측 요청도 그대로 동작한다. 같은 PC에서만 사용할 수 있다. `claude mcp add 이름 -- uv run server.py`로 연결하는 로컬 서버가 이 방식이다.

### 4.2 StreamableHTTP

서버를 원격에 두려면 HTTP를 사용한다. 클라이언트는 서버 주소를 알기 때문에 요청을 보낼 수 있지만, 서버는 클라이언트 주소를 모르기 때문에 먼저 요청을 보낼 수 없다.

StreamableHTTP는 SSE(Server-Sent Events, 서버가 하나의 HTTP 응답으로 여러 메시지를 계속 보내는 방식)로 이 문제를 해결한다. 초기화 시 서버가 세션 ID를 발급하고, 클라이언트는 GET 요청으로 응답 스트림을 열어 둔다. 서버는 이 스트림으로 필요할 때 메시지를 보낸다. 도구를 호출하면 해당 호출 전용 스트림이 추가로 열렸다가 결과 전송 후 닫힌다.

서버를 여러 대로 확장하면 문제가 생긴다. 로드 밸런서가 GET 스트림은 1번 서버로, 도구 호출 POST는 2번 서버로 보낼 수 있다. 2번 서버가 샘플링 요청을 보내려면 1번 서버가 유지 중인 스트림을 써야 하므로 서버 간 조율이 필요하다.

이를 위해 설정 2개가 있다.

| 설정 | 동작 | 사용할 수 없게 되는 기능 |
|---|---|---|
| `stateless_http` | 세션 없이 요청마다 독립 처리. 어느 서버로 라우팅돼도 동작 | 서버 측 요청(샘플링, 루트 조회), 진행 알림, 구독 |
| `json_response` | 스트리밍 없이 최종 결과만 JSON 하나로 반환 | 실행 중 진행률과 로그 |

로컬 stdio에서 동작하던 서버를 HTTP로 배포한 뒤 진행 표시가 사라지거나 샘플링이 실패하면 이 설정을 먼저 확인한다. 강의에서는 개발 단계부터 운영과 같은 전송 방식으로 테스트하라고 권장한다. 개발은 stdio, 운영은 stateless HTTP로 다르게 구성하면 차이를 배포 후에 발견하게 된다.

---

## 5. 업무 적용 계획

회사 환경은 로컬에서 클러스터에 직접 접근할 수 없고 외부 OAuth가 차단되어 있다. 사내 메신저나 대시보드용 공개 MCP 서버는 대부분 OAuth 인증을 쓰기 때문에 바로 사용할 수 없었다.

그래서 다음과 같이 정했다.

1. 로컬 파일만 다루는 서버부터 직접 구현한다. 강의에서 만든 문서 서버를 수정해서 사내 PDF와 워드 문서를 마크다운으로 변환하는 도구를 stdio로 연결했다. 외부망이 필요 없다.
2. 조회 기능과 변경 기능을 분리한다. 조회는 모델이 호출하는 도구로 두고, 변경은 확인 인자가 명시적으로 전달될 때만 실행되게 한다.
3. 서버를 클러스터에 배포할 때는 처음부터 HTTP로 테스트하고, 서버 측 요청이 필요 없는 조회 전용 기능으로 시작한다.

(2026년 8월 추가) 조회 전용 MCP 서버를 클러스터 내부 파드로 배포해 팀에서 함께 쓰고 있다. 읽기 전용 ServiceAccount(Pod가 자신을 증명할 때 쓰는 계정), 기본 차단 NetworkPolicy(Pod 사이 통신을 라벨과 포트로 허용하거나 막는 리소스), 사용자별 API 키 인증을 적용했고, 배포 과정에서 게이트웨이 라우트 설정 오류로 기존 경로가 404를 반환한 장애가 있었다. 자세한 내용은 [인프라 운영 AI 에이전트 구축](/posts/ai-agent-for-infra-operations/) 글에 정리했다.

---

## 6. 보완: 사용하는 쪽에서 본 MCP

### 6.1 연결해 쓰는 쪽

이 절은 서버를 구현하는 쪽이 아니라 이미 있는 서버를 연결해 쓰는 쪽의 기준을 더한 것이다. 플랫폼 API와 앱 커넥터는 [Claude Academy 2편](/posts/claude-academy-platform-and-cloud/), [6편](/posts/claude-academy-claude-app/)에 있다.

| 환경 | 연결 방법 | 확인할 점 |
|---|---|---|
| Claude Code | MCP는 외부 도구와 데이터 소스를 연결하는 개방형 표준이다. `claude mcp add`로 HTTP나 stdio 서버를 등록한다. 범위는 local, user, project 세 가지이고 project는 `.mcp.json`을 버전 관리에 올려 팀이 같은 서버를 받는다. 영상 예시는 Linear MCP로 이슈를, Context7 MCP로 최신 문서를 가져오는 것이다. | MCP 도구 정의가 컨텍스트의 10%를 넘으면 도구 검색 모드로 자동 전환되는데 성능이 떨어질 수 있다. `/mcp`로 쓰지 않는 서버를 끈다. `gh`, `aws`처럼 CLI가 있는 도구는 CLI를 우선한다. |
| Claude API | `mcp_servers`에 type, URL, 이름, 선택적 인증 토큰을 적고 `mcp_toolset`으로 도구를 고른다. 기본 비활성화 설정으로 읽기 전용 도구만 허용할 수 있다. | 영상 시점에 베타 기능이라 베타 헤더가 필요하다. 읽기 전용 설정의 이름은 `default_config`이고 쓰기 권한이 필요 없는 서버에 쓴다. Linear 서버 예시는 type, URL, 이름, 선택적 인증 토큰을 적는다. Slack은 검색과 채널 목록만 열고 게시와 삭제는 막는 설정이 예로 나온다. |
| claude.ai 앱 | 채팅 창 왼쪽 아래 검색 및 도구 버튼(search and tools)에서 커넥터를 추가하고 관리한다. 디렉터리는 생산성, 커뮤니케이션, 개발, 비즈니스, 자동화, 데스크톱 확장 분류이고 웹 도구와 로컬 파일을 모두 지원한다. 설정은 MCP로 자동 처리되고 목록은 claude.ai/directory에서 확인한다. | 연결한 뒤 Claude에게 그 도구에 접근할 수 있는지 물어 확인한다. 부여된 권한은 커넥터를 눌러 확인하고 항목별로 켜고 끈다. Claude는 사용자가 접근할 수 있는 데이터만 본다. 커넥터와 웹 검색이 모두 켜져 있으면 Claude가 어느 소스를 쓸지 판단하며, 프롬프트에서 지정할 수도 있다. |

역할 구분은 도구가 내부 시스템용, 스킬이 순서용, MCP가 제3자 서비스용이다. 서비스 제공자가 연동 유지보수를 맡는다는 점이 MCP를 쓰는 이유다. 사용자 지정 커넥터는 조직 소유자가 Admin settings의 Connectors에서 Add custom connector를 눌러 URL과 이름을 넣고 Add를 눌러 추가하고, LSEG 시장 데이터가 그 예다. 접속하려면 서비스 쪽의 MCP 서버 접근 권한이 따로 필요하다.

LSEG(London Stock Exchange Group, 시장 데이터 제공 기업) 커넥터의 URL은 `https://api.analytics.lseg.com/lfa/mcp`이고 이름은 예를 들어 "LSEG MCP"로 적는다. 개별 사용자는 LSEG의 도구 찾기와 연결 문서를 따르며, LSEG MCP 서버 문서는 LSEG 포털에 곧 공개될 예정이라고 안내된다. 기능, 예시 프롬프트, 사용 요령, 주의사항은 [6편](/posts/claude-academy-claude-app/)에 정리했다.

커넥터 사용 예로는 Linear에서 이번 주 완료 티켓을 가져오고 파일의 표준 템플릿을 찾아 릴리스 노트를 쓰는 작업이 나온다. 회의록을 프로젝트 작업으로, 프로젝트 업데이트를 임원 요약으로 바꾸는 작업에도 쓴다.

연결한 서버가 많을수록 컨텍스트가 줄고 권한 범위가 넓어진다. 설치하기 전에 서버가 쓰기 권한을 갖는지 읽고, 쓰기는 승인을 거치게 한다. 이는 위 5절의 폐쇄망 구성과 같은 원칙이다.


### 6.2 강의 세부 보완

1~4절에 담지 못한 강의 세부를 모았다. 입문 강의는 다음과 같다.

| 항목 | 내용 |
|---|---|
| 전송 방식 독립 | 클라이언트와 서버는 표준 입출력, HTTP, WebSocket(하나의 연결로 양방향 메시지를 주고받는 프로토콜) 중 어느 방식으로든 통신할 수 있는 구조다. 4절은 이 중 stdio와 StreamableHTTP를 다룬다. |
| 클라이언트의 위치 | 클라이언트는 애플리케이션 서버와 MCP 서버 사이의 통신 창구다. 사용자 질의가 도구 목록 조회, Claude 판단, 도구 실행, 결과 반환 순으로 흐른다. |
| 클라이언트 구현 | 클래스에 `list_tools()`와 `call_tool()`을 구현해 세션을 감싼다. `report.pdf` 내용을 묻는 질문으로 전체 흐름을 시험한다. 세션은 연결 정리가 필요하므로 자원 해제를 처리하는 래퍼 클래스로 감싸는 구성이 필요하다. |
| 도구 스키마 | 타입 힌트와 Pydantic `Field` 설명이 스키마 역할을 해서 JSON 스키마를 직접 쓰지 않는다. `Field` 설명을 구체적으로 써야 Claude가 인수 형식을 정확히 이해한다. 실습에서는 문서 읽기 도구와 문서 편집 도구를 만든다. |
| 인스펙터 | `mcp dev mcp_server.py`로 브라우저 인스펙터를 열고 Connect를 누른 뒤 도구를 직접 실행한다. 호출 사이에 서버 상태가 유지되어 편집한 뒤 읽기 도구로 결과를 확인할 수 있다. |
| 리소스 접근 | 리소스는 정적 URI의 직접 리소스와 `{doc_id}` 같은 매개변수를 쓰는 템플릿 리소스로 나뉜다. 클라이언트에 `read_resource`를 구현하고, MIME 타입(데이터 형식 표기)에 따라 JSON으로 파싱할지 정한다. |
| 프롬프트 접근 | 서버 작성자가 시험한 프롬프트를 여러 클라이언트가 공유한다. 클라이언트는 `list_prompts`와 `get_prompt`를 구현하고, 인수는 프롬프트 함수의 키워드 인수로 들어가 변수가 채워진다. |
| 기능 선택 기준 | 모델이 판단해 호출할 기능은 도구, 화면 구성이나 문맥 주입용 데이터는 리소스, 반복 워크플로는 프롬프트로 나눈다. 외부 서비스를 연동하기 전에 공식 또는 공개 MCP 서버가 있는지 먼저 확인하면 스키마 작성과 유지보수를 줄인다. |
| 본문이 없는 레슨 | 입문 강의의 최종 평가는 본문이 없다. |

심화 강의는 다음과 같다.

| 항목 | 내용 |
|---|---|
| 샘플링 효과 | 서버 복잡도와 비용 부담이 줄어 공개 서버에 적합하다. |
| 로그와 진척률 | 서버는 Context 객체의 `context.info()`로 로그를, `context.report_progress()`로 진척률을 보낸다. 클라이언트는 `logging_callback`과 `progress_callback`을 작성해 받는다. 표시 방식은 CLI, 웹, 데스크톱 앱마다 클라이언트가 정한다. |
| 메시지 명세 | MCP 메시지는 요청과 결과 쌍, 응답이 없는 알림으로 나뉘고, 명세는 별도 저장소에 TypeScript로 정의되어 있다. |
| 초기화 메시지 이름 | `initialize` 요청, 그 결과, `initialized` 알림 순서다. |
| 세션 헤더 | StreamableHTTP에서 세션 ID는 `mcp-session-id` 헤더로 오가고, 클라이언트가 GET 요청으로 SSE 연결을 연다. 도구 호출마다 전용 SSE 연결이 추가로 생긴다. |
| 두 플래그 | 강의는 두 플래그를 모두 true로 두면 진척률, 로그, 샘플링이 깨진다고 설명한다. `stateless_http`는 로드 밸런서 뒤에서 수평 확장하려고 켜는데 세션 ID, 샘플링, 진척률, 구독을 잃는다. `json_response`는 스트리밍을 끄고 최종 결과만 반환한다. |
| 본문이 없는 레슨 | 샘플링 실습, 알림 실습, Roots 실습은 대화형 실습 레슨이고 개념 평가는 퀴즈다. |

4절 표의 `stateless_http` 행에 있는 루트 조회는 강의 요약이 명시한 기능이 아니다. 루트 조회도 서버가 먼저 보내는 요청이므로 같은 제약을 받는다는 것은 추측이고, 강의 영상으로 확인이 필요하다.

---

## 정리하며

처음 던진 질문들에 대한 답이다.

- **MCP는 도구 사용을 대체하는가?** 보완한다. 모델의 도구 선택과 호출 요청 방식은 그대로이고, 도구의 정의와 실행을 서버가 담당한다.
- **프리미티브를 3가지로 나눈 이유는?** 사용 결정 주체가 다르다. 도구는 모델, 리소스는 애플리케이션, 프롬프트는 사용자가 결정한다.
- **서버가 클라이언트에게 요청하는 경우는?** 샘플링으로 모델 호출을 요청하거나 루트 목록을 조회할 때다. 샘플링을 쓰면 서버에 API 키와 모델 호출 비용이 필요 없다.
- **HTTP 배포 후 일부 기능이 동작하지 않는 이유는?** HTTP에서는 서버가 먼저 요청을 보내기 어렵고, 확장을 위해 `stateless_http`를 켜면 서버 측 요청 기능을 쓸 수 없다. 개발 단계부터 운영과 같은 전송 방식으로 테스트한다.
- **(보완) 이미 있는 서버를 연결할 때 확인할 것은?** 범위(local, user, project), 컨텍스트 비용, 쓰기 권한이다. 사용하지 않는 서버는 끈다. 강의 세부는 6.2에 모았다.
- **폐쇄망에서는 어떻게 사용하는가?** 로컬 파일 기반 서버를 직접 구현해 stdio로 연결했고, 변경 기능은 사용자가 명시적으로 승인할 때만 실행되게 했다.

다음 주차는 AI Fluency 강의로 모델의 특성과 결과 검증 방법을 다뤘다.
