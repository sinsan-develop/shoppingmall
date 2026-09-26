# 어울몰 기술 조합 결정서

- 상태: 신산님이 전체 기술 방향을 개발 계획 기준으로 승인(2026-09-26). 공급자·계약·요금·실연동은 후보 또는 미결정
- 조사 기준일: 2026-09-26
- 제품 근거: [PRD](PRD.md)
- 결정 범위: 구축에 사용할 기술 조합과 선택 조건. 구현·계정 개설·설치·배포는 이 문서의 범위가 아니다.

## 1. 결정 기준

어울몰은 계약 농가의 농산물을 전국 고객에게 판매하는 단일 브랜드몰이다. 출시 범위에는 반응형 웹, iOS·Android 앱, 고객 주문, 결제, 배송 조회, 농가·재고·주문 관리자 화면이 포함된다. 따라서 다음 기준을 우선한다.

1. 상품·산지 페이지의 검색 노출과 공유 링크 품질
2. 웹·앱에서 동일한 가격·재고·주문 상태와 정책 사용
3. 결제 중복과 초과 판매를 방지할 수 있는 데이터 경계
4. 국내 실물상품 결제와 앱 결제 흐름의 호환성
5. Windows 로컬 개발, Git push 후 WSL-server Git pull을 통한 통합 검증, 사용자 인수테스트 시점의 Oracle 운영환경 결정
6. 초기 운영 인력에게 과도한 인프라를 요구하지 않는 구성

현재 저장소에는 PRD·기술·환경·참고 대조 문서가 있지만 구현 코드·기존 런타임은 없다. 팀 규모, 예산, 기존 개발 역량, 계약 PG, 택배사, Oracle 운영 서버 사양은 아직 확인되지 않았다. PG 계약·요금과 Oracle 운영환경은 개발 완료 후 사용자 인수테스트 시점에 결정한다. 개발·검증은 로컬과 WSL-server의 격리된 테스트 자원·계정으로 진행한다. [개발환경](DEVELOPMENT_ENVIRONMENT.md). 아래 권고는 이 조건이 바뀌면 재평가한다.

기존 `D:\Project\shoppingmall`와 `cyhuh7950/owoolmall`의 HTML/CSS/JS 시안은 [역할별 화면·업무 흐름 참고](design/REFERENCE_REVIEW.md)로 사용한다. 해당 시안의 `localStorage`, 고정 PIN, 고정 수수료, 판매자 직접 환불, 9088 포트·배포 경로와 별도 Redis·큐·관제 구성은 현행 기술 결정으로 자동 승계하지 않는다.

## 2. 대안 비교

| 대안 | 구성 | 장점 | 어울몰에서의 부담 | 판정 |
|---|---|---|---|---|
| A. TypeScript 공통 스택 | Next.js 웹·관리자 + Expo React Native 앱 + NestJS API + PostgreSQL | 웹 SEO, 웹·앱 계약 공유, 단일 언어, 자체 운영 가능 | 웹·앱 화면은 각각 구현; 운영 API와 결제 흐름 직접 개발 | **MVP 권장** |
| B. 헤드리스 커머스 | Next.js + Expo + Medusa + PostgreSQL | 상품·장바구니·주문·재고 기본 모듈 확보 | 농가·출고일·신선식품 예외·국내 PG/택배 연동을 확장해야 함. 확장 범위 검증 전에는 빠르다고 단정할 수 없음 | 비교 후보 |
| C. Flutter 중심 | Flutter 앱·웹 + 별도 API·DB | 앱 화면 코드 공유 비율을 높일 수 있음 | 상품·산지 콘텐츠의 웹 검색 노출에 별도 웹 계층이 필요해질 가능성 | 웹 중심 판매에 비권장 |

Medusa는 재고 예약과 결제 제공자 확장 지점을 제공한다. 다만 공식 결제 제공자 예시는 Stripe이며 국내 PG 적용 작업량은 별도 검증이 필요하다. [재고 모듈](https://docs.medusajs.com/resources/commerce-modules/inventory), [결제 제공자](https://docs.medusajs.com/resources/commerce-modules/payment/payment-provider). Flutter 공식 문서도 Flutter Web의 검색 엔진 색인 한계를 설명한다. [Flutter Web FAQ](https://docs.flutter.dev/platform-integration/web/faq).

## 3. 신산님이 승인한 기술 방향과 검증 후보

| 영역 | 권장 기술 | 선택 이유와 경계 |
|---|---|---|
| 고객 웹·운영자 웹 | **Next.js App Router + React + TypeScript** | 상품 상세·산지 콘텐츠를 서버 렌더링하고 메타데이터·사이트맵을 관리한다. 운영자 화면은 같은 Next.js 앱 안에 두되 별도 경로와 서버 측 권한 검사로 분리한다. [메타데이터](https://nextjs.org/docs/app/getting-started/metadata-and-og-images), [자가 호스팅](https://nextjs.org/docs/app/guides/self-hosting). |
| 고객 모바일 앱 | **Expo 기반 React Native + TypeScript** | iOS·Android 앱, 푸시, 앱 링크를 지원한다. 실제 결제 SDK·푸시·딥링크 검증은 Expo Go가 아닌 개발 빌드에서 한다. [개발 빌드 제약](https://docs.expo.dev/develop/development-builds/faq/), [푸시](https://docs.expo.dev/push-notifications/overview/). |
| 업무 API | **NestJS + TypeScript, 단일 배포 서비스** | 웹·앱·관리자 요청에 동일한 상품·가격·재고·주문 규칙을 적용한다. 모듈은 상품/농가, 재고·출고, 주문·결제, 농가 정산, 배송, 회원·권한, 문의·리뷰로 분리하되 MVP에서 마이크로서비스로 나누지 않는다. [NestJS 데이터베이스 통합](https://docs.nestjs.com/techniques/database). |
| 데이터베이스 | **PostgreSQL + Drizzle ORM** | 주문·재고·결제 상태에 관계형 제약과 트랜잭션을 사용한다. SQL이 필요한 재고 잠금·집계는 명시적 쿼리로 다룬다. Drizzle은 NestJS의 공식 통합 문서가 있다. [Drizzle 통합](https://docs.nestjs.com/data/drizzle). |
| 상품 검색 | **PostgreSQL 검색부터 시작** | 초기 카탈로그에서는 상품명·산지·농가명 필터와 부분 일치 검색을 구현한다. 필요하면 `pg_trgm` 인덱스를 적용한다. 한국어 형태소 분석·동의어·오타 보정은 품질을 측정한 뒤 전문 검색 엔진 도입을 판단한다. 짧은 검색어는 trigram 효율이 떨어질 수 있다. [pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html). |
| 이미지·첨부 | **S3 호환 객체 저장소 인터페이스** | 상품 이미지·리뷰 사진·품질 증빙을 DB와 분리한다. Oracle Object Storage를 첫 검토 후보로 두되 공급자·비용은 저장 용량·트래픽·백업 요구 확인 후 결정한다. |
| 결제 | **단일 PG 직접 연동, 토스페이먼츠 첫 검증 후보** | 웹과 React Native용 공식 결제 문서가 있다. 앱투앱 이동·복귀, 취소·환불, 지원 결제수단, 계약 조건을 샌드박스에서 확인한 뒤 확정한다. 초기에는 다중 PG 중개 계층을 두지 않는다. [토스 React Native SDK](https://docs.tosspayments.com/sdk/widget-rn), [토스 웹뷰 안내](https://docs.tosspayments.com/guides/v2/webview). |
| 알림 | **Expo Push Service + 중요 안내 문자(SMS) + 계정용 이메일** | 앱 푸시는 앱 설치 고객에게 사용한다. 문자는 주문·출고 변경의 초기 기본 채널이고 SENS를 첫 검증 후보로 둔다. 계정 확인·비밀번호 재설정 메일은 SENS MAIL을 첫 검증 후보로 둔다. 주문 상태를 API·DB에 먼저 기록하고 알림은 DB 기반 작업·재시도로 발송한다. |
| 개발·검증 운영 | **로컬 개발 + GitHub push + WSL-server pull·통합검증** | 로컬에서 구현·빠른 검증을 하고, 안전한 작업 커밋을 지정 GitHub 저장소에 push한 뒤 WSL-server의 지정 경로에서 동일 커밋을 Git으로 받아 통합 검증한다. Docker Compose는 개발·통합 검증의 실행 후보이다. Oracle 운영 서버 구성과 PG 계약·요금은 사용자 인수테스트 시점에 결정한다. |

### 3.1 항목별 선택과 확정 경계

아래의 '선택'은 기술 방향에 대한 신산님의 항목별 의사표시다. **문서 전체 승인, 외부 계약, 계정 개설, 구현·배포 승인을 뜻하지 않는다.** '첫 검증 후보'는 실제 환경·요금·계약·연동 검증에 실패하면 재검토한다.

| 구분 | 선택한 방향 | 남은 경계 |
|---|---|---|
| 웹 | Next.js App Router·React·TypeScript; 고객/판매자/관리자 화면은 같은 앱 | 농가·어울몰은 동일 판매자 역할이고 담당 상품·주문 범위를 서버에서 구분; 일반 판매자 제안은 관리자 승인 후 고객 화면에 공개. 동일인이 요청·승인해도 역할·행위 이력을 분리. 재고 0개·품절 시 구매 차단과 실제 출고·운송장 정보는 즉시 반영 |
| 앱 | React Native·Expo·TypeScript; 앱 빌드는 EAS Build 우선 | 계정·비용·iOS/Android 실제 빌드 검증 범위는 인수테스트 시점에 결정; 미수행 결과는 미검증 |
| 업무 서버 | NestJS 단일 서비스·REST API | 웹·앱과 주문·가격·재고 규칙 공유 |
| 데이터 | PostgreSQL·Drizzle ORM; PostgreSQL 상품 검색으로 시작 | WSL 검증은 `local-postgres`의 전용 `shoppingmall` DB 사용; 운영용 관리형 PostgreSQL 후보·요금은 인수테스트 시점에 결정 |
| 데이터 백업 | 운영 DB 도입 시 관리형 자동 백업과 정기 복구 시험 | 개발·검증 중에는 QA 데이터의 격리·재생성 절차를 별도로 마련; 운영 보관 기간·복구 목표는 인수테스트 시점에 확정 |
| 이미지 | S3 호환 인터페이스, Oracle Object Storage 첫 검토 후보 | 실제 공급자·요금 미확정 |
| 결제 | 단일 PG 직접 연동; 토스페이먼츠 첫 기술 검증 후보 | 개발 중에는 mock·sandbox·테스트 계정으로 검증; PG 계약·요금·운영사는 사용자 인수테스트 시점에 결정 |
| 고객 로그인 | 이메일+비밀번호, 휴대폰 문자 인증번호; 이메일 없는 휴대폰 가입 허용 | 자체 서버/DB 인증 운영, 검증된 라이브러리 사용; Better Auth는 첫 검증 후보일 뿐 최종 확정 아님 |
| 소셜 로그인 | 첫 출시 범위는 카카오와 Apple; 네이버는 후속 후보 | 개발 중 모의·계약 테스트 가능. 실제 외부 계정 연동 검증 범위는 인수테스트 시점에 결정 |
| 계정 연결 | 고객이 로그인 상태에서 새 방식을 직접 인증·연결 | 이메일/번호 일치만으로 계정·주문을 자동 병합하지 않음 |
| 고객 알림 | Expo Push Service; 중요 주문·배송 안내의 초기 기본 채널은 SMS | SENS 문자 발송 첫 검증 후보; 실제 발송·수신 검증 범위는 인수테스트 시점에 결정 |
| 계정 메일 | SENS MAIL 첫 검증 후보 | 실제 도메인 인증·발송·수신 검증 범위는 인수테스트 시점에 결정 |
| 비동기 작업 | PostgreSQL 기반 발송 작업·재시도 | 초기 Redis/전용 큐 미도입; 처리량에 따라 재평가 |
| 배송 조회 | 농가·어울몰 판매자가 각자 담당 주문의 출고·택배사·운송장을 입력하면 고객에게 출고 상태·추적 링크를 즉시 제공 | 동일한 판매자 절차 적용; 출고 처리·운송장 입력·고객 표시 시각을 기록. 오입력·지연 입력은 관리자가 사유·이력을 남겨 정정하고 고객 안내도 바로잡음. 초기 배송 상태 자동 동기화는 하지 않음; 계약 택배사는 인수테스트 준비 시 확인 |
| 개발환경 | 로컬 개발, 지정 GitHub 원격, `WSL-server`의 `~/deploy/shopping` Git checkout에서 pull·통합 테스트 | GitHub SSH 접속 확인·조회 ref 없음; WSL 접속 확인·checkout 경로 아직 없음; 로컬 무커밋·원격 미설정 |
| 운영 서버 | Oracle 운영환경 결정은 사용자 인수테스트 시점으로 유보 | 이전의 'Oracle 가상 서버 한 대' 초기안은 확정안에서 제외; 사양·배포 구조 미정 |
| 보안 연결 | 기존 승인된 역방향 프록시 재사용, 없으면 Caddy 검토 | 운영 서버 결정 시 실제 구성 확인 전 설치·교체 결정 금지 |
| 코드·검사 | 지정 GitHub 저장소, GitHub Actions로 변경 코드 자동 검사 | 현재 로컬 원격 미설정; 원격 branch·권한·요금제 확인 전 push 금지 |
| 운영 배포 | 승인된 버전만 수동 시작, 정해진 절차는 자동화하는 방향 | 인수테스트 시점의 Oracle 환경 결정과 별도 배포 승인 필요 |
| 관측 | Sentry 오류 추적 첫 검증 후보; Oracle 환경 결정 후 Cloud Monitoring·Health Checks 검토 | 수집 데이터 최소화, 비용·경보 경로 확인 |
| 구매 흐름 분석 | GA4 첫 검증 후보 | 분석 이벤트와 실제 주문 데이터 대조, 개인정보 전송 방지 |

인증은 특히 검증이 필요하다. Better Auth는 사용자 계정에 이메일 값을 요구하고, 휴대폰만으로 가입할 때 임시 이메일 생성 방식을 안내한다. 이 값은 실제 연락처가 아니므로 계정 확인·재설정 메일을 보내지 않게 해야 한다. 카카오 로그인에서 이메일 정보를 받으려면 카카오 Biz App 조건도 확인해야 한다. [휴대폰 가입](https://better-auth.com/docs/plugins/phone-number), [이메일 요구](https://better-auth.com/docs/concepts/email), [카카오 연동](https://better-auth.com/docs/authentication/kakao). Apple 로그인은 iOS 앱의 동등한 개인정보 보호 로그인 옵션으로 선택했다. Apple의 심사 기준이 특정 서비스만을 강제하는 것은 아니며 출시 시점에 재확인한다. [Apple 심사 지침](https://developer.apple.com/app-store/review/guidelines/).

문자·메일의 SENS 선택은 같은 발송 서비스에서 두 채널을 운영해 보는 첫 후보라는 의미다. 메일 발신 도메인 인증과 문자 발신번호 등록은 실제 사용 전 확인한다. [SENS 개요](https://guide.ncloud-docs.com/docs/sens-overview), [발신번호](https://guide.ncloud-docs.com/docs/sens-smsmessage), [메일 도메인](https://guide.ncloud-docs.com/docs/cloudoutboundmailer-use-domain). 배송 추적 링크는 PRD의 '링크 또는 상태 표시' 요구를 충족하는 초기안이며, 자동 배송 상태 연동이 필요해지면 택배사 또는 통합 조회 API를 비교한다. [스마트택배 API 예시](https://tracking.sweettracker.co.kr/).

운영·분석 후보의 근거와 제약도 출시 전 다시 확인한다. [관리형 PostgreSQL과 자동 백업 예시](https://docs.oracle.com/en-us/iaas/Content/postgresql/overview.htm), [Caddy 자동 HTTPS](https://caddyserver.com/docs/automatic-https), [GitHub Actions 수동 실행](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow), [Expo의 Sentry 연동](https://docs.expo.dev/guides/using-sentry/), [Oracle Health Checks](https://docs.oracle.com/en-us/iaas/Content/HealthChecks/Concepts/healthchecks.htm), [GA4 쇼핑몰 이벤트](https://support.google.com/analytics/answer/9267735?hl=ko).

웹과 앱은 화면 코드를 억지로 하나로 묶지 않는다. TypeScript 타입, API 스키마, 입력 검증 규칙, 디자인 토큰 중 실제로 공통인 부분만 공유한다. 웹 관리자 화면은 고객 웹과 동일한 저장소에 둘 수 있지만 권한 검사와 접근 경계는 API에서 강제한다.

## 4. 거래 데이터 경계

1. 웹·앱은 서버에 주문 초안을 요청한다. 서버가 현재 가격·할인·배송비·판매 가능 수량을 재계산한다. 같은 농가 직접 발송 상품은 한 발송 주문으로 묶고, 대상 상품의 할인 전 금액에 비례해 통합 할인을 배분하되 원 단위 배분 합계는 실제 할인액과 일치시킨다.
2. 서버는 중복 주문 방지 키와 재고 예약 만료 시점을 기록한다. 결제 승인 전후 상태 전이는 DB 트랜잭션과 유일 제약으로 보호한다.
3. 클라이언트가 결제 결과 화면에 돌아온 사실만으로 주문을 결제 완료로 처리하지 않는다. 서버가 PG 결제 조회·승인 결과와 주문번호·금액을 대조한다.
4. PG 콜백은 중복·지연·역순 도착을 예상하고 멱등 처리한다. 처리 실패한 이벤트는 재조회·재처리할 수 있어야 한다. 토스는 결제 상태 웹훅과 POST 멱등성 키를 제공한다. [웹훅](https://docs.tosspayments.com/guides/v2/webhook), [API 멱등성](https://docs.tosspayments.com/en/api-guide).
5. 결제 성공·실패·취소에 따라 예약 재고를 확정하거나 해제한다. 재고 0개·품절은 즉시 구매를 차단하고 재고 증가·품절 해제는 관리자 승인 후 구매에 반영한다. 산지 출고 중단 시 관리자가 영향을 받은 주문을 조회하고 변경·취소 처리한다.
6. 출고 전 상품 일부 취소로 남은 발송 주문이 무료배송 기준 아래로 내려가도 새 배송비를 부과하지 않는다. 발송 주문 전체를 출고 전 적법하게 취소하면 실제 결제한 상품금액·배송비를 환불한다. 결제·환불 거래는 주문별 할인·배송비 배분 및 원래 결제 금액과 대조한다.

농산물은 실물상품이다. 현재 Apple 지침은 앱 밖에서 소비되는 실물상품에 인앱구매 외 결제수단을 요구하고, Google Play 정책도 실물상품 구매에 Play 결제를 사용하지 않도록 규정한다. 구체적인 앱 결제 화면과 심사 요건은 출시 시점에 다시 확인한다. [Apple App Review 3.1.3(e)](https://developer.apple.com/app-store/review/guidelines/), [Google Play 결제 정책](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en).

## 5. 지금 도입하지 않을 구성

- Redis·전용 메시지 큐: 초기 주문량과 비동기 작업량이 확인되기 전에는 운영 부담이 크다. DB 기반 재시도와 관측으로 시작한다.
- Elasticsearch/OpenSearch: 초기 상품 규모와 한국어 검색 실패 사례가 확인된 뒤 결정한다.
- 마이크로서비스·Kubernetes: 단일 브랜드 MVP의 팀·배포 복잡도에 비해 이득이 확인되지 않았다.
- 별도 고객 데이터 플랫폼·추천 엔진: PRD 2단계 과제다. MVP는 구매 전환, 결제 실패, 클레임, 재구매 등 최소 이벤트만 정의한다.

## 6. 확정 전 확인 항목

| 항목 | 확인 내용 | 결정에 미치는 영향 |
|---|---|---|
| 팀 역량·인원 | TypeScript/React Native/NestJS 경험, 앱 담당 가능 여부 | A안 유지 또는 B안 재검토 |
| 초기 상품 수·주문량 | SKU·옵션·산지 수, 피크 주문량, 검색어 특성 | 검색·재고·큐 구성 |
| 배송 모델 | 산지별 합배송 가능 여부, 출고 마감, 배송비 계산, 택배사 | 주문·배송 데이터 모델 |
| 결제 계약 | 개발 중 mock·sandbox·테스트 계정으로 결제 흐름 검증; 실제 수수료·정산·취소/부분취소·앱 복귀·지원 수단은 인수테스트 시점에 확인 | 토스페이먼츠 또는 다른 단일 PG 운영 계약 결정 |
| 농가 정산 | 초기에는 농가별 매출·수수료·배송비·할인·환불액을 각각의 발생 시점으로 기록하고 일자별 조회·관리자가 선택한 시작일~종료일의 항목 합계를 산정; 어울몰 발송 농가 생산품도 생산 농가의 정산 근거를 유지. 늦은 환불은 환불 발생 시점에 기록하고 원래 판매 주문·상품에 연결. 관리자만 선택 기간의 농가별 완료 여부를 개별 기록하고 시스템이 해당 농가·기간의 정산을 완료 처리. 실제 송금·최종 지급액 결정은 초기 범위에서 제외 | 월 단위 고정 아님. 동일 농가의 완료된 정산 기간과 겹치는 중복 완료는 금지. 초기 비용 부담·가감 판단은 오프라인. 일정 기간 운영 후 자동 정산 방식을 결정하고 자동 송금까지 후속 개발하며, 연동·비용·보안 범위는 그때 별도 확정 |
| 앱 출시 범위 | iOS·Android 동시 출시 여부, Apple 개발자 계정·빌드 경로 | Expo 빌드·심사 일정 |
| 인프라 | 로컬/WSL 테스트 자원은 개발 전 확인; Oracle 운영 서버 사양, 백업·복구, 이미지 저장소, 객체 저장소는 인수테스트 시점에 결정 | 배포 구성·월 운영비 |
| 인증 | 이메일 없는 휴대폰 가입과 임시 이메일 분리, 카카오 Biz App 이메일 제공, Apple 로그인 및 명시적 계정 연결 | Better Auth 적합성·심사 조건; 휴대폰 문자 인증은 법적 본인확인이 아님 |
| 발송 서비스 | SENS 문자 발신번호·한도·요금, MAIL 도메인 인증·전달률 | SMS·계정 메일 공급자 확정 |
| 코드·배포 | 비공개 GitHub 저장소 계정·요금제, 자동 검사 범위, 수동 시작 배포의 권한·비밀정보 보관 | 실제 저장소 생성·CI/CD 구성 |
| 관측·분석 | Sentry·GA4 비용과 개인정보 최소 수집, Oracle 감시 경보 수신자 | 운영 모니터링·분석 서비스 확정 |
| 데이터 복구 | 관리형 DB 자동 백업의 보관 기간·복구 목표·정기 복구 시험 | 사고 시 복구 가능성 확인 |

Windows 로컬만으로 iOS 앱 빌드를 완결할 수 있다고 가정하지 않는다. Expo의 iOS 원격 빌드는 macOS 빌드 환경을 사용하고, 로컬 빌드의 Windows 지원에는 제한이 있다. [iOS 빌드](https://docs.expo.dev/build-reference/ios-builds/), [로컬 빌드 제한](https://docs.expo.dev/build-reference/local-builds/).

## 7. 권고 판정

신산님의 항목별 선택에 따라 **A안을 기본 기술 조합으로 기록**한다. 상품 검색 노출, 웹·앱 공통 거래 규칙, 주문 정합성, 자체 운영 환경에 가장 직접적으로 맞는다. 단, 결제사·인증 라이브러리·관리형 DB·객체 저장소·발송·오류 추적·분석 서비스는 위 표의 검증 조건을 통과하기 전까지 최종 확정하지 않는다. B안은 팀 규모가 작고 Medusa의 국내 PG·농가 출고 확장이 예상보다 간단하다는 증거가 있을 때 재평가한다.

신산님의 승인은 기술 조합의 방향에 대한 결정이다. 개별 검증 후보의 최종 계약·요금, 실연동 범위, 서버 배포 승인을 뜻하지 않는다.
