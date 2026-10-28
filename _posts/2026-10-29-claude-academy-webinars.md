---

title: "[Claude Academy 12편] 웨비나 전체 목록 (주제별 분류, 엔지니어링 관련 우선순위)"
date: 2026-10-29
categories: [AI, Claude]
tags: [AI, Claude, Webinar, ClaudeCode, Agent]
layout: post
toc: true
math: false
mermaid: true
series: claude-academy
series_order: 12

---

## 참고자료

- [Claude Academy - 엔지니어링 과정 목록](https://academy.claude.com/ko/all?department=engineering)
- [Claude Academy 10편 - 업무 자동화 사용 사례와 웨비나](/posts/claude-academy-use-cases-workflow/)

---

## 배경

10편에서 웨비나를 일부만 표로 옮겼다. 목록 하단에 예정 4건과 녹화 다수(이 글의 표 기준 예정 4건, 녹화 99건)가 있어서, 빠짐없이 남기기 위해 전체를 이 글에 모았다.

웨비나는 영상이라 목록 페이지 하단 카드의 제목, 설명, 날짜만 수집했다. 영상 본문과 자막은 수집하지 않았고, 영상 속 발언, 시연 순서, 수치는 확인하지 못했다.

표의 내용 열은 카드의 영문 설명을 한국어로 줄인 것이어서, 영상에서 다룬 세부 내용은 미확인이다. 8월 이전 녹화 표는 카드 표기 순서를 따랐다. 날짜는 카드 표기의 월/일이고 연도가 없어서, 같은 날짜가 반복되는 항목은 시간순 정렬이 어긋날 수 있다. 일부 제목은 같은 주제의 재방송이나 재녹화 회차이며 카드만으로 내용 차이를 알 수 없다.

정리하면서 확인하고 싶었던 것들이다.

- 웨비나는 어떤 주제로 나뉘고, 이 시리즈의 어느 편과 이어지는가?
- 엔지니어링 업무에서 먼저 볼 웨비나는 무엇인가?
- 전체 목록은 어떻게 되는가?

---

## 1. 주제별 분류

첫 질문이다.

| 주제 | 대표 웨비나 | 이어지는 편 |
|---|---|---|
| Claude Code | Advanced Patterns(서브에이전트, hooks, MCP, CI 컨텍스트 전략), Maximizing Value from Claude Code(토큰이 쓰이는 곳), Loops(4가지 패턴), What We Shipped(월간), Claude Code: Foundations | [3편](/posts/claude-academy-claude-code-in-action/), [AI 6편](/posts/claude-code-tool-loop-hooks/) |
| 에이전트 구축과 평가 | Evals for AI Agents, How to ship and scale agents with Managed Agents, Building an SRE Incident Response Agent, Building on the Claude Platform(orchestrator 패턴), Long Running Agents | [2편](/posts/claude-academy-platform-and-cloud/) |
| Claude Tag와 Cowork 운영 | Claude Tag on-call, How Anthropic works with Claude Tag in Slack, Deploying Claude Cowork across the Enterprise(PayPal) | [7편](/posts/claude-academy-cowork/), [8편](/posts/claude-academy-tag-and-enterprise/) |
| 보안과 비용 | A CISO's Guide to Deploying Claude, Scaling Claude with Cost Controls, Compliance API and Security Integrations, Tokenomics on AWS, Claude Security | [8편](/posts/claude-academy-tag-and-enterprise/) |
| 클라우드 제공자 | AWS 운영 경로, Microsoft Foundry 도구 연동, Vertex AI의 Claude Code와 에이전트 모니터링 | [2편](/posts/claude-academy-platform-and-cloud/) |
| AI 역량과 조직 | Measuring AI Fluency at Your Organization, AI as an Engineering Leadership Multiplier, Roadmap with Decisions Rather Than Dates | [AI 8편](/posts/ai-fluency-4d-claude-code/) |
| 직무별 Cowork | 영업, 마케팅, 재무, 법무, 비영리, 투자팀 | [7편](/posts/claude-academy-cowork/) |
| 산업별 사례 | 금융, 의료, 생명과학, 지방정부, 반도체, 커머스, 고객 음성 | 해당 없음 |

---

## 2. 엔지니어링 업무에서 먼저 볼 것

두 번째 질문이다.

1인 DevOps 관점에서 제목과 설명만 보고 고른 우선순위다. 영상을 보지 않았으므로 내용이 기대와 다를 수 있다.

| 우선순위 | 웨비나 | 고른 이유 |
|---|---|---|
| 1 | Claude Code Advanced Patterns: Subagents, MCP, and Scaling to Real Codebases (3/24) | 서브에이전트, hooks, MCP, CI 컨텍스트 전략을 다룬다고 설명되어 있다. |
| 1 | Cooking with Claude: Building an SRE Incident Response Agent (6/25) | webhook, Skills, 사용자 정의 도구, 사람 승인 게이트를 엮는다고 한다. |
| 1 | Evals for AI Agents (7/14) | 종단 평가와 새 모델 도입 판단을 다룬다. |
| 2 | Maximizing Value from Claude Code (9/10) | 토큰이 쓰이는 곳과 낭비하는 세션의 습관을 다룬다. |
| 2 | Claude Tag on-call (10/15) | 인시던트 채널에서 로그 확인부터 수정안 초안까지 맡는 방식이다. |
| 2 | Securing & Governing Claude: The Compliance API (6/5) | 사용 데이터를 프로그램으로 접근해 보안 스택에 연결한다. |
| 3 | Claude on Google Cloud: Monitoring and Securing Agents at Scale (9/1) | 도구 호출 가드레일과 trace, 감사 이벤트를 다룬다. |
| 3 | Scaling Claude with Cost Controls (9/15) | 모델 기본값과 지출 가시성을 다룬다. |
| 3 | Startup Builds: Getting Started with Loops (7/24) | Claude Code loop 패턴 4가지를 다룬다. |

---

## 3. 시리즈와 이어 보는 방법

세 번째 질문이다.

웨비나 제목은 이 시리즈 각 편의 개선 항목과 맞닿아 있다. 11편 점검에서 나온 약점에 해당하는 웨비나를 골라 보면 효율이 높다.

| 점검에서 약한 부분 | 볼 웨비나 |
|---|---|
| 훅과 서브에이전트 구성 | Claude Code Advanced Patterns, Claude Code Best Practices(Lightspeed) |
| 직접 만든 에이전트의 평가 | Evals for AI Agents |
| 인시던트 대응 자동화의 승인 설계 | SRE Incident Response Agent, Claude Tag on-call |
| 비용 | Scaling Claude with Cost Controls, Maximizing Value from Claude Code |

---

## 4. 전체 목록

네 번째 질문이다.

### 4.1 예정

| 날짜 | 제목 | 내용 |
|---|---|---|
| 10/21 | Tokenomics on AWS: Control and optimize your Claude spend | AWS에서 관리자 통제, 기본 모델 설정, Bedrock과 API의 작업당 비용 측정으로 Claude 지출을 줄이는 방법 |
| 10/22 | Claude Rearview Roadmap Review: October 2026 | Claude 채팅, Cowork, Claude Code, Platform의 출시 내역 회고, 관리자와 사용자 영향, 데모와 Q&A |
| 10/28 | Unified Claude: What it means for admins | Chat과 Cowork가 하나의 Claude로 합쳐질 때 관리자와 보안팀에 생기는 변화(거버넌스, 보안 심사, 롤아웃) |
| 10/29 | Scaling AI Across the Portfolio: Anthropic and AWS for Private Equity | 사모펀드가 AWS에서 포트폴리오 전반에 Claude를 확대하는 방법, 이용 방식 3가지, PE 요금, 90일 롤아웃 |

### 4.2 녹화: 2026년 10월

| 날짜 | 제목 | 내용 |
|---|---|---|
| 10/15 | Claude Tag on-call: A new teammate in your incident channel | Slack 인시던트 채널에서 Claude Tag가 로그 확인부터 수정안 초안까지 맡는 방식과 직접 가능한 설정 |
| 10/14 | Inside the Cyber Verification Program: Tiers, Migration, and Best Practices | 보안팀을 위한 Cyber Verification Program의 접근 등급 3단계, 인증 순서 확인, 마이그레이션 안내 |
| 10/13 | Measuring AI Fluency at Your Organization | 사용량 지표를 넘어 조직의 AI 역량을 측정하고 결과를 교육 계획으로 옮기는 프레임워크 |
| 10/8 | AI as an Engineering Leadership Multiplier | 판단, 책임, 사람 중심 업무를 넘기지 않으면서 엔지니어링 리더십에 AI를 쓰는 방법 |
| 10/8 | Claude Corps Cohort 2: How to Become a Host Organization | Claude Corps 2기 일정, 개정된 인터뷰, 선발과 매칭, 호스트 기관 지원금과 계약 |
| 10/1 | Building with the Claude 5.5 Family: Choosing the Right Model and Getting More from Every Token | Claude 5.5 모델 구성, 평가(eval)로 모델 고르는 법, 캐싱과 오케스트레이션으로 작업당 비용 절감 |
| 10/1 | How to control costs and show ROI for Claude Code on Google Cloud | Google Cloud의 Claude apps gateway로 Claude Code 지출과 접근을 통제하고 사용 데이터로 ROI 자료를 만드는 방법 |
| 9/30 | Enterprise Transformation with Claude on AWS: Paths to Production | Platform API, Bedrock, Claude Enterprise, Desktop까지 AWS에서 Claude를 운영하는 경로와 Claude Code 라이브 시연 |
| 9/30 | Claude in Microsoft Foundry: Tool Integrations in Practice | Azure의 Foundry에서 tool search, MCP connector, web search, web fetch, structured outputs로 에이전트를 만드는 방법 |
| 9/30 | How to control costs and show ROI for Claude Code on Google Cloud | 10/1 동명 웨비나와 같은 주제의 다른 회차 |
| 9/29 | Claude in Microsoft Foundry: Tool Integrations in Practice | 9/30 동명 웨비나와 같은 주제의 다른 회차 |

### 4.3 녹화: 2026년 9월

| 날짜 | 제목 | 내용 |
|---|---|---|
| 9/25 | Opus 5.5 for Work | Claude Opus 5.5의 신기능과 글쓰기, 분석, 협업 업무 사례 |
| 9/24 | Modernizing Legacy Code with Claude Code | 모더나이제이션 플러그인으로 COBOL-to-Java 이전, 50만 줄 Java 업그레이드를 시연 |
| 9/21 | How to Roadmap with Decisions Rather Than Dates | AI 도구가 나아지는 상황에서 날짜 대신 의사결정 중심으로 로드맵을 이끄는 엔지니어링 조직 운영법 |
| 9/18 | Enterprise Readiness: A CISO's Guide to Deploying Claude | 배포 모델과 거버넌스 통제부터 채팅에서 Claude Code로 확장하는 방법까지 CISO 관점의 Claude Enterprise 롤아웃 |
| 9/18 | Inside Claude for Financial Advisors | 금융 자문가용 Claude가 미팅 준비, 후속 조치, CRM 업데이트, 컴플라이언스 확인을 처리하는 방식 |
| 9/16 | Enterprise Transformation with Claude on AWS: Paths to Production | 9/30 동명 웨비나와 같은 주제의 다른 회차 |
| 9/15 | Scaling Claude with Cost Controls | Claude Enterprise 비용 통제 설정: 모델 기본값, 팀원별 지출 가시성, Analytics Chat, 사용량 보고 |
| 9/10 | Building Claude Commerce Agents | 소매, 여행, 통신, 엔터테인먼트 기준 구현 사례와 소비자, 판매자용 커머스 에이전트 청사진 |
| 9/10 | Maximizing Value from Claude Code | Claude Code 토큰이 쓰이는 곳과 효율적인 세션, 낭비하는 세션을 가르는 습관과 설정 |
| 9/3 | Claude in Microsoft Foundry: Tool Integrations in Practice | Foundry에서의 도구 연동 에이전트 구축(앞선 회차와 같은 주제) |
| 9/3 | Getting Started with Claude Design | Claude Design을 쓸 상황, 브랜드 가이드라인 한 번에 가져오기, 브리프에서 덱 내보내기까지 |
| 9/1 | How to control costs and show ROI for Claude Code on Google Cloud | 같은 주제의 다른 회차 |
| 9/1 | Claude on Google Cloud: Monitoring and Securing Agents at Scale | Agent SDK로 Claude 에이전트를 만들고 모든 도구 호출에 가드레일을 걸며 trace와 감사 이벤트를 Cloud Observability로 보내는 방법 |

### 4.4 녹화: 2026년 8월 이전

| 날짜 | 제목 | 내용 |
|---|---|---|
| 8/20 | Claude Science AMA: How to accelerate scientific discovery | AI 워크벤치로 쓰는 Claude Science 시연과 Q&A, 암 연구에 에이전트를 쓴 해커톤 우승 사례 |
| 8/13 | Claude for Business Development Representatives | Anthropic BDR 팀이 매주 쓰는 Cowork 워크플로우(받은편지함 답장 초안, 야간 계정 점검) |
| 8/11 | Claude Code for Data Engineering | 데이터 엔지니어링 팀의 파이프라인 장애 분류, PR 리뷰 자동화, 설계 문서 초안 작성 사례 |
| 8/6 | Claude for Marketing Ops and Analytics | 마케팅팀이 매주 쓰는 Cowork 워크플로우(자동 지표 리포트, 캠페인 접수 구성) |
| 7/24 | Startup Builds: Getting Started with Loops | Claude Code의 loop 패턴 4가지와 코드베이스에 적용할 실행 가능한 레시피 |
| 7/24 | Claude for Investing Teams | 비상장 시장 투자팀이 Cowork와 Office Agents로 딜 스크리닝, 실사, 모니터링, LP 보고를 하는 방식 |
| 7/22 | Voice and Intelligence: Building the Human Interface for Customer Experience | Vapi CTO와 Anthropic이 실시간 음성 인프라와 Claude로 고객 응대 인터페이스를 만드는 방법 |
| 7/22 | Building on the Claude Platform: Claude Fable 5 and model orchestration patterns | Platform에서 모델 고르기, 작업별 평가 구성, advisor와 orchestrator 패턴으로 비용 절감 |
| 7/21 | Claude in Microsoft Foundry: Building agents for production | Foundry에 Claude 모델을 배포하고 거버넌스와 관측성을 갖춰 프로덕션으로 옮기는 방법 |
| 7/16 | Claude IT Setup for Nonprofits | 비영리 기관의 Claude 관리자 설정 전체: ID, 데이터 설정, 기능, 출시, 기존 계정 이전 |
| 7/16 | How to ship and scale agents with Claude Managed Agents | Managed Agents로 인시던트 조사 에이전트를 만들어 배포하는 과정과 Notion의 External Agents 사례 |
| 7/14 | Evals for AI Agents: How Product Builders Get the Most Out of Every New Model | 에이전트 제품 팀이 종단 평가를 하고 새 모델을 도입할지 빠르게 판단하는 방법 |
| 7/13 | Production-Grade Agents on Claude Sonnet 5: Live with Zed and ClickHouse | Zed와 ClickHouse가 Sonnet 5로 프로덕션 에이전트 작업을 돌리는 시연과 설계 시사점 |
| 7/9 | Cowork for Nonprofits | 비영리 결과물을 Cowork로 만들고 일정 실행으로 이사회 자료와 후원자 보고를 자동 조립하는 방법 |
| 7/9 | How Anthropic works with Claude Tag in Slack | Anthropic의 엔지니어링, GTM, 데이터 과학팀이 Slack에서 Claude Tag를 쓰는 방식, 일상 워크플로우, 권한 모델 |
| 7/8 | Claude Code: Foundations | CLI 설치, 실제 버그 수정, claude.md로 코드베이스 가르치기, MCP로 에이전트 확장하는 입문 실습 |
| 6/25 | Cooking with Claude: Building an SRE Incident Response Agent | Managed Agents로 webhook, Skills, 사용자 정의 도구, 사람 승인 게이트를 엮은 SRE 인시던트 대응 에이전트 구축 |
| 6/24 | Claude on Google Cloud: Monitoring and Securing Agents at Scale | Google Cloud에서 Agent SDK 기반 에이전트 구축, 가드레일, trace 감사(9/1 회차의 앞선 버전) |
| 6/17 | Claude Corps: How to Become a Host Organization | AI 교육을 받은 Claude Corps 펠로를 맞는 방법, 기관이 받는 것과 제공하는 것, 지원 방법 |
| 6/9 | Cowork Workshop: Foundations | Cowork 데스크톱 앱 설정, 여러 단계 업무 위임, 팀의 업무 방식 가르치기 입문 실습 |
| 6/5 | Securing & Governing Claude: The Compliance API and Security Integrations | Compliance API로 Primary Owner가 사용 데이터를 프로그램으로 접근하고 보안 스택에 연결하는 방법 |
| 6/4 | Building Agents with Claude Opus 4.8: Live Demos with Letta and Browserbase | Letta와 Browserbase가 Opus 4.8로 에이전트 제품을 만든 시연과 교훈 |
| 6/4 | How Anthropic's marketing team uses Claude Cowork | 성장팀의 아침 브리핑, Google Ads 검색어 감사, 실시간 리포트 대시보드 사례 |
| 6/2 | How finance teams use Claude Cowork | FP&A와 회계 통제팀의 예측, 차이 분석, 결산, 연결 작업 사례와 롤아웃 팁 |
| 5/28 | Claude Security: Putting Claude to Work for Defenders | Claude Security가 코드베이스를 스캔하고 결과를 확인하며 패치를 생성하는 시연, Claude Code로 이어서 처리 |
| 5/26 | How Anthropic's sales team run their week with Cowork | 영업팀이 매주 쓰는 Cowork 워크플로우(일일 브리핑, Salesforce 예측, 야간 계정 점수화) |
| 5/22 | Claude Code for State and Local Governments | 지방정부 팀이 레거시 시스템 이해, 안전한 변경, 신규 시민 서비스 제공에 Claude Code를 쓰는 시연 |
| 5/15 | How legal teams put Claude to work | 사내 법무팀과 로펌의 계약 리뷰, 레드라인, 초안 작성에 Cowork를 쓰는 방식과 실제 도입 모습 |
| 5/13 | How Warp builds self improving agents on Claude | Warp 창업자가 사람 피드백에서 배워 스스로 스킬을 고쳐 쓰는 에이전트를 만든 방법 |
| 5/12 | Secure the Advantage: A CISO's Guide to Agentic AI | Anthropic 부CISO가 에이전틱 AI의 역량, 위험, 거버넌스 요소를 평가하는 프레임워크를 설명 |
| 5/7 | Claude for Financial Services: Putting agents to work | 금융 서비스 워크플로우에 기존 데이터와 도구를 연결해 Claude 에이전트를 배포하는 실무 시연 |
| 5/6 | Claude for Nonprofits: Moving Your Workflow Beyond Chat | Projects, Skills, Connectors로 채팅을 넘어서는 비영리 워크플로우(기금 신청서, 후원자 데이터 분석) |
| 4/29 | Building Products on Claude Opus 4.7 - A Customer Success Story with Solve Intelligence and Blitzy | 두 회사가 Opus 4.7로 IP와 소프트웨어 개발 제품을 만든 시연과 프로덕션 프롬프팅 교훈 |
| 4/29 | Ship Code Faster with Claude Code on Vertex AI | Vertex AI에서 Claude Code 설정, 실제 코딩 시연, 인증 방식, 모범 사례 |
| 4/28 | Long Running Agents: How Outtake built a cyber investigator on Claude | Outtake의 Recon Agent가 위협 지표 하나에서 공격 네트워크 전체를 몇 분 안에 추적하는 방식 |
| 4/23 | Claude Code for Healthcare: How Physicians Build with AI | 의사들이 Claude Code와 Cowork로 임상 도구를 만드는 방법과 안전, 확인 팁 |
| 4/21 | Claude for Legal teams | 계약 리뷰, 레드라인, 초안 작성, 문서 비교 시연과 보안, 롤아웃 질의응답 |
| 4/16 | Deploying Claude Cowork across the Enterprise - with PayPal | 역할 기반 접근, 그룹 지출 상한, 사용 분석, 관리자 통제로 Cowork를 전사 배포하는 방법과 PayPal의 롤아웃 접근 |
| 4/8 | Plan First, Ship Faster: How CodeRabbit Built Agent Orchestration on Claude | CodeRabbit이 모호한 요구사항을 구조화된 계획으로 바꾼 뒤 코딩 에이전트가 실행하도록 한 오케스트레이션 계층 |
| 4/7 | What We Shipped: Feature Updates, Tips, and Live Q&A with the Claude Code Team | Claude Code 신기능, 팀 워크플로우 팁, 개발팀과의 라이브 Q&A(월간) |
| 4/2 | Ship Code Faster with Claude Code on Vertex AI | 4/29 동명 웨비나와 같은 주제 |
| 4/1 | Claude Cowork in an Hour: Where do I start? | Cowork 첫 실무 작업 실습, 좋은 요청의 조건, 다음에 넘길 할 일 고르기 |
| 3/31 | Claude Code for Semiconductor Teams: Live AMA with Anthropic's Applied AI Team | 반도체 엔지니어 대상 Claude Code와 MCP 서버 기반 AI 네이티브 설계 워크플로우 AMA |
| 3/24 | Claude Code Advanced Patterns: Subagents, MCP, and Scaling to Real Codebases | 서브에이전트, hooks, MCP 연동, 대규모 코드베이스와 CI에 맞춘 컨텍스트 전략 심화 |
| 3/18 | Best Practices: Claude for Excel and Claude for PowerPoint | 파일 준비, 프롬프팅, 커넥터까지 Excel과 PowerPoint용 Claude를 안정적인 업무 가속기로 쓰는 모범 사례 |
| 3/4 | Claude Code in an Hour: A Developer's Intro | 개발자용 입문: 설치, 컨텍스트, 실제 코딩 작업 시연 |
| 2/26 | From 0 to 1: How Zingage Built AI-Powered Home Care on Claude | Zingage가 400개 이상 기관의 일정, 접수, 청구, 컴플라이언스를 자동화한 재가 돌봄 플랫폼을 만든 과정 |
| 2/19 | Building Products on Claude Opus 4.6 - A Customer Success Story with Shortcut and Hex | Shortcut과 Hex가 Opus 4.6로 AI 제품을 만든 시연, 프로덕션 교훈, 프롬프팅 가이드 |
| 2/12 | How to transform work with Claude for Excel and Claude for PowerPoint | 분석가와 컨설턴트가 원시 데이터를 발표 가능한 결과물로 바꾸는 방법 첫 소개 |
| 1/30 | The Future of AI at Work: Introducing Cowork | 팀에 에이전틱 실행을 가져오는 Cowork 소개, 여러 단계 워크플로우 시연과 시작 안내 |
| 1/29 | Building with Advanced Agent Capabilities for Claude on Vertex AI | Vertex AI에서 영속 메모리, 다단계 추론, 사용자 정의 도구 연동을 갖춘 고급 에이전트 구축 |
| 1/27 | Claude Code for Service Delivery: Learn from Boris Cherny, Head of Claude Code | 서비스 딜리버리 팀의 레거시 현대화와 COBOL-to-cloud 이전 시연, Q&A |
| 12/18 | Claude Code for Financial Services: Learn from Boris Cherny, Head of Claude Code | 금융권 엔지니어링 팀 대상: Claude Code와 Agent SDK로 SWE, 컴플라이언스, 클레임 에이전트를 만드는 시연 |
| 12/11 | Building with Claude Code: Inside Notion's AI development workflow | Notion 엔지니어의 일상적인 Claude Code 사용, 디자인 파트너 역할, MCP로 Notion 연결 |
| 12/4 | Building with MCP and Claude Code: Sentry's 0 to 1 Story | Sentry가 MCP와 Claude Code를 프로토타입에서 프로덕션으로 옮긴 과정과 교훈 |
| 11/25 | Building with Claude in Europe: Agent Fundamentals | 에이전트 기본, 평가, 대규모 배포까지 프로덕션용 에이전트 기술 심층 설명 |
| 11/20 | Scaling AI Agent Development at Netflix: Production Insights with Claude Sonnet 4.5 | Netflix가 사내 AI 인프라, 평가 프레임워크, Sonnet 4.5로 3,000명 이상 개발자에게 생산성 도구를 확장한 방법 |
| 11/12 | Agent Skills: Transform Claude from Assistant to Specialized Agent | Agent Skills로 Claude를 전문 에이전트로 바꾸는 방법, 시연, 직접 만드는 안내 |
| 11/6 | Transform Legacy Systems into Strategic Assets: Code Modernization with AI | Claude Code로 COBOL 이전부터 마이크로서비스까지 수년 걸릴 현대화를 몇 주로 줄이는 기업 사례 |
| 10/28 | Advancing Claude for Financial Services | 시장 인텔리전스, Excel 워크플로우, 자율 실행 시연을 통한 금융기관 업무 혁신 |
| 10/21 | Claude for Life Sciences: Accelerating Discovery from Hypothesis to Breakthrough | 제약과 연구팀의 가설 생성, 프로토콜 최적화, 생물정보학 적용 |
| 10/15 | Claude Code Best Practices: Power User Insights from Lightspeed Portfolio Companies | 서브에이전트, hooks, 고급 워크플로우 시연과 실제 ROI 인사이트 |
| 10/14 | Transforming Financial Analysis at scale: How BCI leverages Claude's Financial Analysis solution | BCI가 금융 분석 솔루션, 원격 터미널, MCP 연동으로 투자 리서치를 확대한 방법 |
| 9/18 | Building for production ready use-cases: How Lovable scales with Claude | Lovable이 모델과 컨텍스트 윈도우를 평가해 개발 속도와 코드 품질을 높인 프로덕션 적용 방식 |
| 8/27 | Deploying multi-agent systems using MCP and A2A with Claude on Vertex AI | Vertex AI에서 MCP와 A2A로 협업하는 멀티 에이전트 시스템을 구성하는 시연과 프로덕션 패턴 |
| 8/21 | Claude Code in Financial Services: From Analyzing Data to Modernizing Legacy Systems | 거래 데이터 분석, 예측, COBOL 시스템의 클라우드 이전을 Claude Code로 시연 |
| 8/6 | How Anthropic and Asana transform work at scale with AI agents | Asana의 AI 프로토타입에서 대규모 프로덕션 에이전트까지의 여정과 Anthropic의 에이전트 아키텍처, 엔터프라이즈 배포 패턴 |
| 7/31 | Mastering Async Agents: Production Insights from Cognition Labs | Cognition의 Devin이 Claude로 프로덕션 비동기 에이전트를 배포하는 아키텍처와 모범 사례 |
| 7/24 | Building the future of AI coding with MCP in VS Code and Claude | VS Code의 MCP 구현, MCP 서버 구축, Claude 기반 GitHub Copilot 에이전트 모드 |
| 6/18 | Scaling development with remote agents: Best practices and deep dive with Augment Code | Augment Code가 수십 개 원격 AI 에이전트를 구축하고 감독하는 방법 |
| 5/29 | How Cursor is pioneering new coding frontiers with Claude Opus 4 | Cursor가 AI 코드 에디터에서 Opus 4를 최적화한 시연, 에이전트 구축 모범 사례, 프롬프트 엔지니어링 팁 |
| 5/15 | Transforming the world's largest sovereign wealth fund with Agentic AI: NBIM's journey with Anthropic and AWS | 세계 최대 국부펀드 운용사 NBIM이 에이전틱 AI를 도입한 과정 |
| 3/27 | Claude Code Live: Origin story, live demos, & best practices | Claude Code 제작진이 설명하는 개발 배경, 시연, 실제 코드베이스 도입 모범 사례 |
| 2/27 | AI agents in the Enterprise: Leadership lessons and demos from Box and Anthropic | Box가 Claude로 엔터프라이즈 에이전트를 구축하고 확장한 방법, 리더십 교훈, Claude Code 첫 공개 |
| 미상 | Claude for Work: Unlocking the power of Claude with research and the Google Workspace integration | Research와 Google Workspace 연동으로 메일, 캘린더, 문서, 웹을 검색해 출처가 달린 답을 받는 방법 |

---

## 정리하며

처음 던진 질문들에 대한 답이다.

**주제 분류.** Claude Code, 에이전트 구축과 평가, Tag와 Cowork 운영, 보안과 비용, 클라우드 제공자, 조직 역량, 직무별과 산업별 사례로 나뉜다. 시리즈의 2, 3, 7, 8편과 이어진다.

**먼저 볼 웨비나.** Claude Code 고급 패턴, SRE 인시던트 대응 에이전트, 에이전트 평가를 먼저 본다. 모두 제목 기준의 판단이고 영상 내용은 미확인이다.

**전체 목록.** 예정 4건과 녹화 99건을 위 표에 모두 남겼다.

정리하고 나서 가장 크게 바뀐 인식은 **웨비나 목록이 새 기능의 사용법보다 프로덕션에서 겪는 문제의 주제 지도**라는 점이었다. 그래서 점검에서 약한 부분이 나오면 해당 웨비나를 찾아 확인한다.
