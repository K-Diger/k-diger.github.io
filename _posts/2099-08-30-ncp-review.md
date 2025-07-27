---

title: MashUp 15기 - NCP 적용 후기
date: 2025-07-27
categories: [NCP]
tags: [NCP]
layout: post
toc: true
math: true
mermaid: true

---

# Q. 프로젝트 소개

Flif'n은 금전운 기반 소비습관 개선 서비스다. 기존 가계부 앱들이 단순히 기록과 분석에만 집중하는 것과 달리, 게임화 요소를 통해 재미있게 소비습관을 개선할 수 있도록 설계했다. 매일 금전운 카드를 통해 개인화된 미션 난이도를 제공하고, 미션 성공률과 소비 패턴을 분석해 또래와 비교할 수 있는 리포트를 제공한다. 향후 카드 수집 시스템도 추가할 예정이다.

- [iOS](https://apps.apple.com/kr/app/flifn-%ED%94%8C%EB%A6%AC%ED%95%80/id6744862480)
- [Android](https://play.google.com/store/apps/details?id=com.dhc.dhcandroid&hl=ko)

---

# Q. Ncloud에서 어떤 서비스를 활용하셨나요?

- VPC (Virtual Private Cloud)
- Subnet
- Server (Cloud Server)
- Public IP
- Object Storage
- Container Registry
- Load Balancer
- Global DNS
- Certificate Manager

# Q. Ncloud 서비스를 어떻게 적용 하였나요?

- VPC로 네트워크 환경을 구성
- Public Subnet으로 서브넷 환경 구성
- Load Balancer를 활용해 HTTPS 리버스 프록싱 적용 
- Container Registry에 애플리케이션 이미지를 저장
- Object Storage를 통해 사용자 프로필 이미지와 카드 이미지 등의 정적 파일을 관리
- Certificate Manager로 SSL 인증서를 관리하고, 
- Global DNS를 통해 도메인 연결 및 글로벌 서비스 제공을 위한 DNS 라우팅을 처리했다.

# Q. Ncloud 사용 중 특히 만족했던 점과, 아쉬웠던 점은 무엇인가요?

만족했던 점: 국내 서비스라서 문서가 한국어로 잘 정리되어 있고, 콘솔 UI가 직관적이어서 학습 비용이 적었다. Load Balancer의 설정이 간단하면서도 안정적이었고, Certificate Manager를 통한 SSL 인증서 자동 갱신 기능이 매우 편리했다. Object Storage의 성능과 안정성도 뛰어났다.

아쉬웠던 점: Terraform과 Object Storage 가 연동되지 않는점이 아쉬웠다.

# Q. Green Developers 프로그램 참여 소감 말씀 부탁 드립니다

무료로 다양한 클라우드 서비스를 활용해 볼 수 있어서 부담없이 작업할 수 있었습니다. 매번 사용할 때마다 느끼는 점은, Ncloud는 문서가 한글친화적이여서 큰 장점인 것 같습니다. 

# Q. 마지막 한 말씀 부탁 드립니다.

향후에는 Auto Scaling이나 컨테이너 오케스트레이션 서비스도 Ncloud에서 시도해보고 싶다. 조금 더 숙련된 인프라 역량을 갖게 되면 기회를 활용해볼 것 같다.
