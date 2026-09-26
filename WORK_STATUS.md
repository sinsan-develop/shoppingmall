# 어울몰 작업현황

## 최신 상태 — 2026-09-27 고객 설정 브라우저 검증 및 정리

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@7694d45b0f85ebe116ef7122c358f98acb007e23` (로컬/SSH 원격/WSL 일치). WSL 시험 API 주소를 명시한 Next production build `/account/customer` 포함 통과. QA 실행 `c5d7e9f1`의 가상 고객으로 실제 브라우저 로그인→고객 설정 화면 진입→가상 배송지 저장 확인→연락처 끝 4자리만 목록 표시→이메일 수신 동의 저장→새로고침 후 배송지·동의 유지 확인.
- 탈퇴 요청 버튼의 확인 대화상자까지 열렸지만 시험 브라우저의 대화상자 조작이 응답하지 않아 **브라우저 최종 접수는 미검증**. DB 사전 조회 `account_deletion_requests=0`, 즉 이 브라우저 시도는 접수되지 않았다. API/DB 직접 통합시험의 탈퇴 요청 접수·중복 409는 별도로 통과한 범위다. 브라우저 시험 탭은 대화상자 때문에 명시적 닫기 실패; 에이전트 생성 임시 탭의 턴 종료 정리에 맡기고 기존 사용자 탭은 건드리지 않는다.
- 직접 띄운 `shoppingmall-s1-api`·`shoppingmall-s1-web`만 종료하고 정확한 `QA_RUN_ID=c5d7e9f1`로 fixture reset(`accounts=5`)했다. 사후 accounts/account_identities/customer_addresses/notification_preferences/account_deletion_requests/sellers 각 0행, `shoppingmall-s1-*` 컨테이너 0, WSL checkout clean. DB migration/스키마 보존. 고객 주소·동의 다른 역할 IDOR 및 웹 모바일·200% 확대·키보드는 추가 검증 필요.
- 오류 횟수: 브라우저 JS confirm 상호작용 1회 실패·재시도 1회 실패, 탭 닫기 1회 실패; 서버/DB 기능 오류로 판정하지 않음. 추가 근거 없이 UI 탈퇴 PASS로 표시하지 않는다. 다음: S1 남은 시험과 Stage gate, 다른 제품 기능 진행.

## 최신 상태 — 2026-09-27 S1 고객 배송지·동의·탈퇴 요청 웹 연결

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`. `apps/web/app/account/customer/page.tsx`에서 고객 세션 확인 후 배송지 목록/입력, 이메일·문자·푸시 마케팅 수신 동의, 계정 탈퇴 **요청 접수**를 기존 고객 API에 연결했다. 고객 이외 역할은 내용을 불러오지 않는다. 연락처는 화면 목록에서 끝 4자리만 노출하고 마케팅 수신은 기본 false로 시작한다. 실제 계정 삭제/법정 보존은 아직 구현되지 않는다.
- 웹 화면 시험 RED(파일 없음)→GREEN, 로컬 `pnpm test` 74개 중 65 pass·0 fail·9 DB 연결 전용 skip, PR 본문 검증 8 pass, 전체 typecheck/lint 통과. 이 결과는 DB/브라우저 최종 시험 대체가 아니다. WSL 정확한 커밋 production build, 고객 입력·동의·탈퇴 요청 실제 브라우저 검증 및 일회성 QA cleanup은 다음 조치.
- 현재 변경: `apps/web/app/account/customer/page.tsx`, `apps/web/app/account/page.tsx`, `apps/web/app/styles.css`, `apps/web/test/customer-profile.test.mjs`, `WORK_STATUS.md`. DB schema 추가 없음, 외부 서비스 연동 없음.

## 최신 상태 — 2026-09-27 S1 역할별 브라우저 로그인·정리

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@efdc3c1f9f2edef6b9af60c944b4b8f0e3dd4350` (로컬/SSH 원격/지정 WSL checkout 일치). WSL `node:24-bookworm-slim` 일회성 빌드에서 Next `/`, `/login`, `/account` production build 통과. 시험 브라우저 호출을 위해 `NEXT_PUBLIC_API_ORIGIN=http://127.0.0.1:9092`로 별도 빌드했으며 이는 운영 배포 설정이 아니다.
- 실제 HTTP: WSL 127.0.0.1:9092 `/health` 200, `/ready` 200, 웹 9091 `/login`·`/account` 200; Windows 127.0.0.1:9091 로그인 페이지 200. 실제 브라우저에서 QA 고객·판매자 A·운영자 각각 로그인→`/account`에 `구매자`·`판매자`·`운영자` 표시 확인, 각 계정 로그아웃 후 다음 계정 사용. 판매자 A 이메일로 운영자 역할 로그인을 시도하면 화면에서 권한 오류를 표시하고 `/login`에 머무름. 시험 계정/비밀번호는 가상 자료만 사용했다. 모바일·200% 확대·키보드 전 과정은 아직 미검증.
- 정리: 브라우저 시험 탭 닫음, 직접 띄운 `shoppingmall-s1-api`·`shoppingmall-s1-web` 두 컨테이너만 종료. 정확한 `QA_RUN_ID=b4c6d8e0` fixture reset으로 5계정 정리. 사후 `accounts/account_identities/auth_sessions/audit_events/sellers/seller_categories` 각각 0행, `shoppingmall-s1-*` 컨테이너 0, WSL checkout clean. DB 자체/기존 migration은 보존.
- 오류: QA 실행 ID별 사전 잔류 조회 SQL의 shell quoting 오류 1회(읽기 실패, 자료 변경 없음); 전체 행 수 5/5/3/1 확인 후 reset했고 사후 0행 재검증. 로컬 Windows Next build `EPERM`은 여전히 미해결. 고객 배송지·동의·탈퇴 실제 화면, 역할별 업무 화면 및 나머지 Stage/인수는 미완료. 다음: S1 사용자 화면·권한 없는 상태, 회귀/환경 gate를 마무리하고 S2 설계 순서대로 진행.

## 최신 상태 — 2026-09-27 S1 역할 로그인 웹 진입 화면

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`; `d355d1fa6375280879ffc464088a5e1f9536f84e` WSL 실제 DB에서 판매자 단일 소속 자동 선택/다중 소속 명시 선택/타 판매자 거부 1통과·0실패. QA fixture reset 완료.
- `apps/web/app/login/page.tsx`에 구매자·판매자·운영자 역할 선택, 이메일/비밀번호, API 응답별 오류와 서버 미설정 상태를 추가했다. 로그인 후 `/account`에서 실제 `/auth/me` 세션을 읽어 역할을 표시하고 로그아웃한다. 홈에 로그인 링크 추가. `apps/web/test/login.test.mjs`, `account.test.mjs` 각 RED(파일 없음)→GREEN, 웹 타입검사 통과. 시각 스타일은 기존 황금/크림 Flat 기조의 단순 계정 폼이며 판매자/운영자 업무 화면을 완료했다고 주장하지 않는다.
- API 주소는 비운영 로컬 기본 `127.0.0.1:9092`, 운영 빌드에서는 `NEXT_PUBLIC_API_ORIGIN` 없으면 폼을 비활성화한다. 실제 브라우저 로그인·모바일·200% 확대·키보드, WSL/운영 빌드의 API 주소/쿠키 경계는 아직 시험 전. 다중 판매자 계정의 편의 선택 UI도 후속 필요. 단계 전체 완료 아님.

## 최신 상태 — 2026-09-27 S1 역할별 로그인 범위 시험

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`. `45fb2d582e0dfad2eb58f29922bc1f60fd55e0d0`에서 WSL 실제 DB의 `seller-login-db.test.mjs`가 예상대로 RED: 판매자 1곳만 소속된 QA 계정도 판매자 ID를 따로 보내지 않으면 `Invalid credentials`로 실패했다. 시험 fixture는 정확한 실행 ID reset으로 정리됨.
- `AuthRepository`에서 해당 계정의 판매자 권한이 **정확히 하나**일 때만 로그인/역할 전환의 판매자 범위를 자동 선택하고, 두 곳 이상이면 명시적 sellerId를 요구하도록 변경했다. 다른 판매자의 ID를 지정하는 요청은 기존 DB grant 검사로 차단한다. 시험에 2곳 권한의 모호한 경우 거부와 명시 선택 성공을 추가. 로컬 API typecheck·루트 lint 통과; WSL DB GREEN/전체 회귀 전이다.
- 직전 `3967ced9019533a8e10705b051fc121556d4e0b8` WSL DB API 전체 24개 중 22 pass·0 fail·2 무DB 전용 skip, 시험 행/컨테이너 잔류 0. 브라우저 역할별 경로·웹 빌드는 이 변경에 대해 아직 시험하지 않았다.

## 최신 상태 — 2026-09-27 S1.2 mock 휴대폰 연결 검증

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`; 현재 원격/WSL `6e0b76b8bbd6b11adca8a7ff0d4cb90c69a2c7e0`. WSL 실제 DB/HTTP에서 고객 로그인→개발용 코드 발급→틀린 코드 차단→전화번호 신원 연결→코드 재사용 차단 시험 1통과·0실패. 실 SMS와 휴대폰 단독 가입/로그인은 미검증/미구현.
- 추가 안전 회귀: 운영 환경에서 `ENABLE_MOCK_OTP=1`이어도 mock API 404 시험 통과. 같은 계정의 새 challenge가 이전 것을 무효화하도록 `MockPhoneOtp`를 보강했고, 만료 항목 제거 및 메모리 최대 1024건 상한을 적용했다. 이 시험 RED(이전 코드 수용)→GREEN. 로컬 해당 시험 3통과 및 타입검사 통과. 변경 커밋/WSL 전체 재시험 전.
- 오류 횟수: 이 보강 시험 1회 RED는 의도한 결함 재현이며 수정·국소 재시험 통과. 외부 자격증명/실문자 사용 없음. Stage S1의 역할별 실제 브라우저 동선·앱·고객 탈퇴 운영 절차·전체 게이트는 아직 미완료.

## 최신 상태 — 2026-09-27 S1.2 개발 전용 휴대폰 연결 HTTP 준비

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`. `AuthController`의 `/auth/mock-phone/start-link`, `/auth/mock-phone/confirm-link`는 `ENABLE_MOCK_OTP=1`이면서 비운영 환경일 때만 동작한다. 고객의 검증된 세션·Origin을 요구하고, 1회용 코드의 확인 결과로 기존 계정에 전화 신원을 명시 연결한다. 반환되는 `testCode`는 **개발 mock**이며 실문자 송신이 아니다. 무설정 404 및 설정 뒤 무인증 401 시험 RED(404)→GREEN, mock 코드/만료 시험과 API 타입검사 통과.
- `apps/api/test/mock-phone-http-db.test.mjs`에 개발 모드의 로그인→mock challenge→틀린 코드 차단→연결→재사용 차단→DB 소유자 검증을 추가했으나 WSL DB 실행 전. 실문자/휴대폰 단독 가입·로그인/브라우저 시험은 미완료. mock이 운영에 노출되지 않는지 배포 설정 검사도 후속 필수다.
- 직전 `d8a471ef45255047d68eea8f277cc2d46ed4b518`의 WSL 전화 신원 자동 병합 차단·감사 DB 시험 2통과·0실패. 원격/WSL checkout 동일; 시험 QA 계정은 finally에서 지정 ID로 정리했다. 현재 HTTP 변경은 커밋 전.

## 최신 상태 — 2026-09-27 S1.2 전화번호 명시적 연결 DB 검증 준비

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`. `AuthRepository.linkPhoneIdentity`를 별도 행위로 추가했다. 고객 역할·동일 accountId의 OTP 확인 결과만 수용하고, 기존 전화 신원이 있으면 자동 계정 병합 없이 거부하며 검증 시각·PII 없는 감사 행위를 같은 트랜잭션에 저장한다. `apps/api/test/phone-link-db.test.mjs`는 method 부재 RED→GREEN; 고객 A 확인 결과를 B가 재사용하는 것, B가 같은 번호를 연결하는 것, 계정 간 병합 방지, 신원/감사를 DB로 시험하도록 추가했다. WSL DB 실행 전.
- 로컬 API 타입검사 통과. `apps/api`에는 `lint` 스크립트가 없어 그 디렉터리의 `pnpm lint`는 명령 없음으로 실패했으며 코드 검사 결과가 아니다. 루트 `pnpm lint` 재실행 필요. 실문자 수신, 전화 가입/로그인 및 HTTP UI 연동은 아직 구현되지 않았고 이 결과를 S1 완료로 표시하지 않는다.

## 최신 상태 — 2026-09-27 S1.2 휴대폰 OTP mock 검증기 착수

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`. `apps/api/src/auth/mock-phone-otp.ts`에 실문자 미발송 OTP mock 검증기를 추가했다. 인증 코드는 주입된 시험 전달자에게만 넘기며 5분 만료·최대 5회 시도·1회 사용·계정 ID 바인딩, 코드 해시 비교를 적용한다. 시험은 RED(모듈 없음)→GREEN 1통과, API 타입검사 통과.
- 범위 경계: 검증기는 **아직 DB 휴대폰 신원 연결/로그인 API나 화면에 연결되지 않았다.** 따라서 전화번호 가입·실문자 수신·계정 연결 전체 PASS 아님. 생산 환경에 mock 인증을 노출하지 않는다. 다음은 검증 증명과 명시적 계정 연결을 DB/HTTP에서 안전하게 이어 검증할 것.
- 직전 체크포인트: `ab38a1ba9dafacba0abf86c435e9351dcd27702e` 로컬/SSH 원격/WSL 일치, 모두 clean. 현재 OTP 파일/시험/현황은 커밋 전. 외부 서비스 가입·연동은 미실행.

## 최신 상태 — 2026-09-27 S1 고객 API·시험자료 재검증

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@a03343163b5aa33ec791c974ffd41ff303abdb9a` (로컬/SSH 원격/지정 WSL checkout 일치). `docs/QA_DATA_POLICY.md`에 가상 자료 사용, 실행 ID별 정리, 실패 시 보존·기록, 실제 탈퇴 요청과 fixture reset의 구분을 기록했다.
- WSL 실제 DB 연결 전체 API 재시험: 18개 중 16 pass, 0 fail, 2 skip(무DB 전용). 로컬 무DB 해당 시험 3 pass. QA fixture 단독 WSL 2 pass. 시험 후 DB accounts/sellers/seller_categories/customer_addresses/account_deletion_requests/notification_preferences 순서로 각 0행, `shoppingmall-s1-*` 일회성 컨테이너 0, 지정 WSL checkout clean 확인. 신규 3개 migration/테이블은 보존.
- 빌드: `052a358` 시점 WSL 분리 checkout의 Next production build 통과. 현재 HEAD의 로컬 typecheck/lint 통과; Windows 로컬 build `.next/trace-build` EPERM 원인 미확정, 따라서 로컬 build gate는 미충족. S1의 OTP mock·명시적 계정 연결·고객/판매자/관리자 실제 브라우저 동선 등은 여전히 미완료. 외부 서비스 실제 연동, Oracle staging, UAT는 미실행.
- 오류 누적: S1 고객 API 중복 탈퇴 매핑 1회 수정·재시험 통과, DB/무DB 혼합 시험 조건 1회 수정·재시험 통과, QA 잔류 조회 shell quoting 1회 읽기 실패 후 다른 조회로 확인. 미해결 `EPERM` 1건. 다음: S1 인증 잔여, 역할별 HTTP/웹 동선 및 현황 기록 후 Stage gate 판단.

## 최신 상태 — 2026-09-27 S1 QA 계정 fixture 착수

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`. `apps/api/scripts/qa-fixture.ts`는 8자리 hex `QA_RUN_ID`별로 고객·판매자 A/B·어울몰 판매자·관리자 5개 **서로 다른 가상 계정**을 생성하고 동일 ID의 데이터만 정리하도록 작성. `shoppingmall` DB명 검사, 명시적 `QA_FIXTURE_PASSWORD` 필요, 한 트랜잭션 seed/reset, 비밀번호 미출력. 역할별 세션·브라우저 검증에 사용할 준비 자료이며 실제 계정 아님.
- `apps/api/test/qa-fixture.test.mjs`에서 위험한 실행 ID 거부 RED(모듈 없음)→GREEN, 타입검사 통과. WSL DB 생성/초기화 통합시험 결과는 바로 아래 최신 기록을 따른다. 실패한 시험의 정확한 ID가 있으면 먼저 소유·참조 관계를 확인하고 그 ID만 정리하며 공유 DB 전체 초기화는 하지 않는다.
- WSL 실제 DB 시험: 정확한 `a0ed84895677e7b4b28dafdfcac2c83aac2342e6`에서 QA 5계정 seed→역할/판매자 분리 조회→동일 실행 ID reset 2통과·0실패. 이어 전체 API를 DB 연결 상태로 실행해 16통과·2실패를 발견: 두 실패는 “DB 미설정이면 503” 시험을 DB 연결 환경에서도 실행한 fixture 조건 오류. 해당 시험에 DB 연결 시 skip 조건을 추가하고 무DB 로컬 재시험 3통과. DB 연결 전체 재시험 전이다. 시험 실패는 제품 전체 gate 미통과로 기록한다.
- 직전 고객 API 결함: `052a3582d7d21f8e113faa2c051f77a77935183f`를 원격/WSL에 반영했고 탈퇴 중복 409 포함 HTTP DB 시험 1통과·0실패. WSL 독립 웹 production build 통과. 로컬 Windows `.next/trace-build` EPERM은 미해결로 분리 기록하며 빌드 전체 PASS로 바꾸지 않는다. WSL 고객 DB fixture 계정/배송지 0행 여부 최종 재조회 필요.

## 최신 상태 — 2026-09-27 S1.3 시험 DB 검증 및 고객 API 연결

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`; 새 branch/worktree 없음. `71b607540f54b03793aa9c88115fdc225d1f494d`를 SSH alias 원격에 push하고 WSL 지정 checkout에 fast-forward했다.
- DB/검증: `WSL-server`의 `local-postgres`/`shoppingmall`에서 `0002_s1_customer_privacy.sql`을 BEGIN/ROLLBACK 사전 검증 후 공식 ORM migrator로 적용. migration 이력 3건. 가상 고객 A/B의 배송지 IDOR, 수신 동의, 탈퇴 요청, 감사 DB 통합시험 1통과·0실패·0skip. 시험 후 accounts/addresses/deletion_requests/preferences 각 0행, 일회성 `shoppingmall-s1-profile` 컨테이너 잔류 0, WSL checkout clean. 기존 DB 이력/신규 테이블은 보존.
- 후속 구현: `apps/api/src/customer/controller.ts`에서 검증된 세션의 고객만 배송지·동의·탈퇴 요청 API에 접근하도록 연결하고 쓰기 요청 Origin을 검사했다. 무DB HTTP 접근 차단 시험 RED(404)→GREEN(401/403), 타입검사 통과. DB를 사용하는 HTTP 통합시험을 추가했으나 WSL 실행 전이며, 실제 브라우저 UI·QA seed/reset·보존규칙·OTP mock 등 S1 잔여는 미완료다.
- 로컬 재검증: `pnpm test` 57 pass/5 DB skip 및 PR 본문 검증 8 pass, typecheck/lint 통과. `pnpm -r build`는 `apps/web/.next/trace-build` 쓰기 `EPERM`으로 실패했다. 기존 `.next` 산출물과 다수 공용 Node 프로세스를 발견하여 무분별한 삭제/종료 없이 WSL의 분리된 checkout 빌드로 확인할 예정이다. 로컬 전체 빌드 PASS 아님.
- WSL HTTP DB 시험 첫 실행: 탈퇴 중복 요청 시 Drizzle가 원본 PostgreSQL `23505`를 `cause`로 감싸는데 controller가 겉 Error 메시지만 확인해 HTTP 500이 됐다(1회, 1 fail). SQL unique 제약 자체는 동작했고 시험 finally의 정확한 accountId 정리 후 재검증 예정. `cause.code`와 constraint를 확인해 409로 매핑하도록 수정했다. 성공 재시험 전.
- 오류 횟수: 이 단계 고객 API 중복 탈퇴 오류 1회(수정·재시험 통과), DB/무DB 혼합 시험 fixture 오류 1회(수정 후 전체 재시험 전). 최초 QA 잔류 조회 명령의 shell quoting 오류 1회는 자료 변경 없이 단순 전체 건수 조회로 재검증했다.

## 최신 상태 — 2026-09-27 Stage 순서 대조 및 S1.3 복귀

- S1.3 데이터 계약 착수: `apps/api/src/db/schema.ts`에 고객 배송지(계정 소속·기본 배송지 1개), 채널별 마케팅 동의 기본 false, 탈퇴 요청 상태/중복 방지 테이블을 추가하고 `0002_s1_customer_privacy.sql` migration을 Drizzle에서 생성·check 통과. `apps/api/src/customer/profile.ts`는 자기 계정만 배송지를 읽고 추가하며, 마케팅 동의를 명시 저장하고 탈퇴를 **요청 상태로만** 기록한다. 원문 배송지/전화는 감사 details에 저장하지 않으며 연락처 마스킹 도우미를 갖췄다. 실계정 삭제/보존기간 확정은 구현하지 않았다. `apps/api/test/customer-profile-db.test.mjs` RED 후 로컬 DB 미설정으로 SKIP, TypeScript 통과; WSL DB 검증 전이다.
- S1.3 DB 변경 사전 기록: 정확한 대상은 `WSL-server`의 `local-postgres` 내 `shoppingmall` 한 DB. 현재 세 번째 migration은 미적용. 승인된 계획 범위의 S1.3 테이블만 추가하고 기존 테이블·자료를 삭제하지 않는다. 기존 QA 계정/판매자/분류는 0행으로 확인했다. 커밋→SSH push→지정 WSL checkout pull→BEGIN/ROLLBACK SQL 시험→공식 ORM migrator 적용→이력/테이블·고객 A/B IDOR/감사 통합시험 순서. 일회성 `shoppingmall-s1-profile` 컨테이너는 명령 동안만 사용·`--rm`, QA 계정/배송지는 unique `qa+UUID@example.invalid`로 만들고 정확한 accountId로 정리한다. 실패 시 다른 DB/테이블을 초기화하지 않고 현재 상태를 기록한다.
- 실제 Git: 기존 단일 writer `codex/flat-v2-prototypes@caa18ac8b1dbc7b02fea67498bd95372e8dd1992`; 원격 `main@207e7961c12f87f88a229d443a70ed764db2c24a`. 별도 기존 `codex/end-to-end-work-plan@74a814d`와 root main worktree는 보존. 현재 S2.1 분류 migration/서비스를 커밋·push했고 WSL DB migration 이력 2건과 시험 1통과를 확인했으나 `main` 병합·merged-main smoke는 없다.
- 계획 대비 판정: S1.1 기반·S1.2 계정/역할 일부는 구현/시험했으나 S1.3 고객 배송지·알림 동의·탈퇴 요청 안내·QA seed/reset/보존, 휴대폰 OTP mock·명시적 계정 연결, 역할별 브라우저/API 최종 검증, CI 실제 실행 및 S1 Stage PR/병합/merged-main smoke는 **미완료/UNVERIFIED**. 그런데 S2.1에 먼저 착수해 순서가 계획과 어긋났다. S1이나 S2 완료를 선언하지 않는다.
- 대안: (1) 기존 브랜치·DB 이력을 보존한 채 S1.3과 S1 잔여를 우선 구현·검증하고 이후 S2를 계속한다. 단일 브랜치의 첫 PR에 선행 S2.1 변경이 함께 들어가므로 Stage별 PR 경계를 설명·검토해야 한다. (2) S2 변경을 되돌리거나 별도 분리한다. 이미 적용된 지속 DB 이력 및 사용자 기존 브랜치 보존 원칙에 비춰 위험이 크다. (3) 새 branch/worktree로 재구성한다. 신산님의 선행 브랜치 정리 전 새 branch 금지 지시와 충돌한다. **권장/진행:** (1), 새 branch·파괴적 rollback 없이 S1.3으로 돌아가고 범위/검증을 PR에 명시한다.
- 이번 작업 오류 횟수: Stage 순서 판단 1회. 수정: 계획과 실제 Git·WSL/DB 증거를 대조하고 현황에 미완료를 기록했다. S2.1 자료를 삭제·재포장하지 않으며 S1.3의 독립 구현을 계속한다.

## 최신 상태 — 2026-09-27 S2.1 분류·판매자 등록 착수

- WSL 실제 DB 결과: 정확한 `caa18ac8b1dbc7b02fea67498bd95372e8dd1992`에서 `0001_s2_categories.sql`을 BEGIN/ROLLBACK으로 오류 없이 검증한 뒤 공식 ORM migrator로 `shoppingmall` DB에 적용했다. `drizzle.__drizzle_migrations` 2건, 분류 테이블 2개 확인. 관리자 전용 2단계 분류·판매자 분류/판매자 등록·3단계 거부·중복 거부 및 감사 기록의 DB 통합 1통과·0실패. QA 상품/판매자 분류·판매자·이메일 행 모두 잔류 0, 일회성 컨테이너 잔류 0, WSL checkout clean. DB migration 이력/테이블은 지속 보존. HTTP/API·웹 관리 화면은 아직 미검증.
- 담당·브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`. 신산님 승인 계획에 따라 S1 인증 작업과 연계된 S2.1의 관리자 대분류→소분류·판매자 분류→판매자 모델을 착수했다. `shoppingmall` DB 기존 `sellers`·`accounts` 각각 0행을 읽기 전용 확인했으며 기존 다른 DB는 건드리지 않는다.
- 변경: `apps/api/src/db/schema.ts`에 상품/판매자 분류와 판매자 분류 FK, root/child 중복명 제약을 추가했고 Drizzle `0001_s2_categories.sql`을 생성·check 통과했다. `apps/api/src/catalog/taxonomy.ts`에는 관리자 역할 검사, 대분류·소분류 2단계 제한, 판매자 분류/판매자 등록 및 같은 트랜잭션 감사 기록을 구현 중이다. `apps/api/src/access.ts`의 관리자 action을 추가했고 권한 시험은 RED→GREEN, `apps/api/test/taxonomy-db.test.mjs`는 WSL DB에서 검증할 계약이다.
- 사전 DB 변경 기록: 정확한 대상 `WSL-server`의 `local-postgres` 안 `shoppingmall` DB. 현재 두 번째 migration은 미적용. source/SQL을 기존 SSH 브랜치에 안전하게 push하고 WSL에서 BEGIN/ROLLBACK 문법 시험 후 공식 ORM migrator로 이력을 남겨 적용한다. 일회성 QA 컨테이너 `shoppingmall-s2-taxonomy`는 적용·시험 동안만 사용하고 `--rm` 정리; 시험 행은 식별 가능한 `qa+UUID@example.invalid` 계정과 고유 이름 분류/판매자를 대상으로만 정리한다. 실제 운영 분류·판매자 자료 없음.
- 미검증·다음: 로컬 전체 회귀, SQL WSL dry-run, 실제 migration/DB·HTTP 분류 통합, 상품·옵션·재고, 역할별 UI 전부 미검증. 오류 횟수: 이번 S2.1 코드/DB 0회.

## 최신 상태 — 2026-09-27 S1.2 권한 경계 착수

- 감사 이력 GREEN: WSL 정확한 `359a8f505cd85e617461db3fba0f0702a5ec6128`에서 계정 저장소 및 HTTP+DB 통합 2통과·0실패. `auth.login`/`auth.switch_role`/`auth.logout`은 역할과 계정 근거를 남기고 세션 변경과 같은 트랜잭션으로 처리한다. 시험 QA 이메일 잔류 0, 일회성 `shoppingmall-s1-audit-green` 컨테이너 잔류 0, 지정 checkout clean을 확인했다. 정식 고객·판매자 화면, OTP와 실제 외부 계정·배포는 미검증이다.
- 인증 감사 이력 TDD: `apps/api/test/auth-db.test.mjs`에 로그인·역할 전환·로그아웃 역할별 사건 검사를 추가해 WSL DB에서 `auth.login` 누락 RED(1실패)를 실제 확인했다. `apps/api/src/auth/repository.ts`의 세션 생성·전환·해지를 각 감사 기록과 같은 트랜잭션으로 묶었다. 시험 계정과 종속 자료는 실패 후에도 `finally`에서 해당 accountId만 정리했다. 로컬 타입검사와 비DB 시험 통과, WSL 재검증은 다음 checkpoint에서 수행한다.
- HTTP 연결 진행: `apps/api/src/auth/controller.ts`를 추가해 `/auth/login`, `/auth/me`, `/auth/switch-role`, `/auth/logout`을 DB가 있는 경우에만 동작하도록 연결했다. 세션 토큰은 HttpOnly/SameSite=Lax 쿠키에만 전달하고 서버는 DB의 실제 grant를 재확인한다. 상태 변경 요청은 설정된 웹 Origin만 허용하고 운영 모드에서는 WEB_ORIGIN 미설정 시 닫힌다. `apps/api/test/auth-http.test.mjs`는 헤더 역할 가장 거부와 DB 미설정 503을 확인했다. 첫 구현은 DB 미설정 예외를 잘못 401로 바꾼 1회가 있어 예외 구분을 수정한 뒤 통과. `apps/api/test/auth-http-db.test.mjs`는 WSL 실제 HTTP+DB 경로 시험용으로 추가했으며 아직 실행 전이다. 로그인 시도 제한·이메일 검증·휴대폰 OTP·소셜 공급자·웹 화면은 미구현.
- WSL 계정 DB 통합 결과: 정확한 checkout `6fdff9b256ae4b27149cfabf47cedc29236e0b0a`에서 시험용 `qa+UUID@example.invalid` 계정으로 중복 이메일 거부, 잘못된 암호 거부, 고객 세션 조회, 미부여 판매자/관리자 역할 거부, DB에 관리자 역할을 명시 부여한 뒤 관리자 전환·기존 세션 해지·로그아웃을 통합 검사해 1통과·0실패했다. 시험 계정·종속 세션/역할/식별자는 해당 UUID로 정리했고 QA 이메일 잔류 0을 DB 조회로 확인했다. 일회성 `shoppingmall-s1-auth-test` 컨테이너 제거, 정확한 `.pnpm-store` 캐시 48MB 제거(재설치 가능), WSL Git checkout clean. 실제 HTTP 로그인·고객 웹 사용 경로는 아직 미검증이다.
- 계정/세션 저장소 진행: `apps/api/src/auth/credentials.ts`는 scrypt+랜덤 salt로 비밀번호를 해시하고 세션 원문 대신 SHA-256 해시를 저장하도록 설계했다. `apps/api/src/auth/repository.ts`는 이메일 정규화/중복 거부, 검증된 DB 역할의 세션 발급·만료/해지 확인·역할 전환을 구현 중이다. `apps/api/test/credentials.test.mjs`는 2개 RED→GREEN, Node crypto `promisify` overload 타입 오류 1회는 명시적 Promise 래퍼로 수정 후 타입검사 통과. `apps/api/test/auth-db.test.mjs`는 로컬 DB URL 미설정으로 SKIP이며 실제 WSL DB 시험 전이다. 이는 아직 HTTP 로그인/가입 노출이나 완료 판정이 아니다.
- WSL DB 적용 결과: 정확한 checkout `af78fe45126464ccbf87ca430cb009b05edd346e`에서 `apps/api/scripts/migrate.ts`의 Drizzle ORM 공식 migrator가 성공했다. `shoppingmall` DB `public`에 계정 관련 6테이블, `drizzle.__drizzle_migrations`에 1건을 읽기 전용 재확인했다. 동일 커밋 API를 WSL에서 빌드·일회성 실행해 `/ready` HTTP 200 `{"status":"ok","dependency":"database"}`을 확인했다. 시험용 API·migration 컨테이너는 종료/자동 제거, 9092 LISTEN 잔류 0. DB schema와 이력은 **지속 데이터**로 유지하며 임의 삭제하지 않는다. 계정·세션·권한 HTTP 경로는 아직 미구현이고 DB ready 200이 이를 증명하지 않는다.
- migration 진단 결론: psql 직접 연결과 ORM migrator는 통과했으나 Drizzle Kit CLI가 오류 상세 없이 exit 1을 반환한 원인은 확정되지 않았다. 공식 ORM migrator 스크립트를 재현 가능한 적용 경로로 채택하고 CLI 문제는 별도 미해결로 기록한다. WSL API smoke에는 기존 PostgreSQL의 `postgres` 자격을 일회성 환경변수로만 전달했으며 비밀값을 문서·Git에 저장하지 않았다. 제품용 최소권한 DB 역할은 아직 준비되지 않았다.
- WSL migration 진단: 정확한 commit `f037ebb`의 frozen 의존성 설치는 기존 store 경로(`/work/.pnpm-store/v11`) 재사용으로 성공. 다른 `/tmp/pnpm-store`를 지정한 첫 시도는 pnpm이 기존 modules 교체를 비대화형으로 거부(1회)하여 기존 메타데이터의 storeDir 확인 뒤 바로잡았다. 동일 PG 환경을 받은 독립 psql 컨테이너의 `SELECT 1`은 통과. `drizzle-kit migrate`는 일반/CI 출력 모두 spinner 뒤 종료 코드 1이고 오류 상세를 출력하지 않아 성공으로 보지 않는다(동일 원인 2회). DB `public`·`drizzle` 사용자 테이블/이력 0개, 시험 컨테이너 잔류 0 확인. Drizzle ORM 공식 migrator에 명시적인 오류 코드 출력을 더해 원인을 좁히되 비밀값은 출력하지 않는다.
- DB 변경 사전 기록: 대상은 `WSL-server`의 정확한 `local-postgres` 컨테이너 안 `shoppingmall` DB 한 개이며 현재 사용자 테이블 0개. 목적은 승인된 S1.2 계정·역할·세션·감사 migration과 이력 테이블 생성. 이전 커밋 `179e94f`의 SQL을 `BEGIN/ROLLBACK` 시험하여 오류 0, 시험 후 `accounts` 테이블 0개를 확인했다. 적용은 별도 일회성 `shoppingmall-s1-migrate` 컨테이너(소유 어울, 해당 migration 실행 동안만, `--rm` 정리)를 통해 실행하고 적용 테이블·이력을 확인한다. 실패하면 임의로 다른 DB를 초기화하지 않고 오류와 현재 상태를 기록한다. 기존 PostgreSQL 컨테이너·타 DB·운영 자료는 그대로 둔다.
- DB 준비 경로 추가: 앱 `/ready`는 DB 연결과 `accounts` schema가 모두 확인된 경우에만 200, 미설정·오류·schema 부재는 503. 신규 테스트 RED 후 구현했고 Nest 테스트 환경에서 생성자 metadata 자동 주입이 없어 500이 된 1회는 `@Inject(DatabaseService)` 명시로 복구했다. `apps/api/src/db/readiness.ts`, `service.ts`, `health.controller.ts`, `app.module.ts`, `test/database-readiness.test.mjs` 변경. 현재 실제 DB 연결 200은 미검증.
- 계정 DB 계약 추가: `apps/api/src/db/schema.ts`에 계정, 식별자(이메일/전화/카카오/Apple), 판매자, 계정별 활성 역할, 토큰 해시 세션, 행위 감사 테이블을 선언했다. 역할/판매자 소속 불일치와 빈 식별자를 DB 제약으로 막고 `apps/api/migrations/0000_s1_accounts.sql`을 Drizzle Kit에서 생성했다. `pg`·Drizzle 정확 버전 및 lockfile이 변경됐다. 기존 `shoppingmall` DB의 사용자 테이블은 0개임을 적용 전 읽기 전용 확인했다. 아직 migration을 적용하거나 계정을 생성하지 않았다.
- 스키마 검증: API `tsc --noEmit`, Drizzle Kit `check` 통과. 최초 생성물을 제약 추가 전 제거하면서 빈 기존 `drizzle/meta` 폴더의 journal 누락으로 재생성 실패 1회; 신규 표준 `migrations/` 경로로 생성하여 통과했다. 생성 SQL의 PostgreSQL 실제 실행/rollback·API 연동은 아직 미검증.
- 신산님은 상세 개발 작업계획 전체를 이미 승인했으며, 내부 Stage의 인증·권한·DB를 다시 승인받지 말고 구축 완료까지 중단 없이 진행하라고 재확인했다. 앞선 별도 승인 재요구는 담당자의 해석 오류로 정정한다. 외부 PG 시험상점/Oracle 접속 상세는 후속 실연동·인수 준비 항목으로 기록하고 독립 개발을 계속한다.
- 담당·브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`. S1.2의 첫 부분으로 `apps/api/src/access.ts`의 서버용 역할·판매자/고객 소속 검사와 `apps/api/test/access.test.mjs`를 추가했다. 고객 IDOR, 판매자 A/B 자료 분리, 판매자 권한의 관리자 승인·환불·정산 금지, 같은 계정의 역할별 행위 분리를 검사한다.
- TDD·검증: 테스트 대상 모듈 부재 RED 후 신규 3개 테스트 GREEN, 전체 API 타입검사 포함 `pnpm typecheck` 통과. 이는 검증된 세션을 입력받아야 하는 순수 권한 검사이며 로그인·세션·PostgreSQL 연결·HTTP 경로에 아직 연결되지 않았다. S1.2 전체 완료나 실제 IDOR 방어 통합 PASS로 표시하지 않는다.
- 오류 횟수: 승인 경계 해석 오류 1회(사용자 정정 후 재요구 철회), 제품 검사 오류 0회. 다음은 테스트 계정/세션·지속 저장 및 API 경로에 동일 권한 계약을 연결하고 DB/API/웹 통합 검증이다.

## 최신 상태 — 2026-09-27 실제 고객 홈 구조 착수

- WSL exact SHA 검증: `ca90fd512183d31526d7f997238105cfe064c765`을 지정 checkout에서 `git pull --ff-only`로 반영하고 clean 상태를 확인했다. 일회성 컨테이너의 새 홈 테스트 2통과, Next production build 통과, 빌드 웹 `/` HTTP 200과 `상품 카테고리`·`추천 상품`·`상품 준비 중` 본문을 확인했다. 시험 컨테이너 종료·자동 제거 후 9091 LISTEN 잔류가 없다. 브라우저 시각/상호작용 증거 및 정식 DB 통합은 아니다.
- WSL 오류·조치: 컨테이너에 없는 `node_modules/.bin/pnpm`을 호출해 테스트 뒤 빌드 명령만 실패한 1회. 같은 checkout의 실제 Next 실행 파일로 빌드를 재실행해 통과했다. 실패/성공 컨테이너 모두 `--rm`으로 제거했다.
- 담당·브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes` worktree. 정적 Flat v2 시안 QA는 제품 착수 게이트로 사용하지 않고, 제품 Next.js 고객 홈에 승인된 다섯 영역(검색·메뉴·기획전·상품 카테고리·공통 추천)의 **데이터 연결 전 뼈대**를 구현했다.
- 변경 전/후: `apps/web/app/page.tsx`는 단일 구축 중 문구였고, 변경 후 의미 있는 헤더·섹션과 준비 중 표시가 있다. `apps/web/app/styles.css`는 기존 황금·크림·서체/최대 1180px을 유지하면서 균형형 Flat 카드·반응형 배열을 적용했다. 검색·메뉴·카테고리·추천은 아직 데이터/동작이 없으며 구매 가능한 상품으로 오인되지 않게 명시했다. `apps/web/test/page.test.mjs`에 다섯 영역 및 허위 결제 노출 금지 검사를 추가했다.
- TDD·검증: 추가 테스트가 `/상품 검색/` 누락으로 실제 RED(1실패) 후 GREEN(2통과). 전체 로컬 `pnpm test` 49+8=57통과·0실패, typecheck, ESLint lint, Nest/Next build 모두 통과했다. 제품 화면의 실제 브라우저·모바일·200% 확대·키보드·인쇄는 `UNVERIFIED`; 정적 HTML 시안 검사 통과로 대체하지 않는다.
- 오류·조치: 존재하지 않는 웹 test 스크립트를 filter로 호출해 검증이 실행되지 않은 1회는 root의 실제 `node --import tsx --test`로 재실행했다. CSS patch의 이전 내용 불일치/동일 파일 중복 패치 거절 각 1회 후 정확한 현 파일 기준으로 적용했다. 데이터·Secret·DB 변경 없음.
- 다음: 안전한 commit/push 후 지정 WSL checkout에서 exact SHA를 pull해 실제 웹 build/smoke를 확인한다. S1.2 인증·권한·DB 계약과 상품 데이터는 별도 승인 경계 및 후속 기능으로 남긴다.

## 최신 상태 — 2026-09-27 S1.1 WSL 재현·실행 확인

- 담당·기준: 어울 단일 writer, `codex/flat-v2-prototypes@eb74e536cb3464cd9032256bd56619302355fcb8`. 지정 SSH 별칭으로 `/home/daon/deploy/shopping`을 정확한 Git branch에서 clone했고 해당 HEAD를 원격과 대조했다. 기존 `local-postgres`의 `shoppingmall` DB는 읽기 전용으로만 확인했으며 schema·계정·Secret은 변경하지 않았다.
- WSL 자체 개발 검증: 기존 `node:24-bookworm-slim` 이미지의 일회성 `shoppingmall-s1-verify`에서 frozen install, `pnpm test` 48+8=56통과·0실패, typecheck, ESLint lint, Nest/Next build 모두 통과했다. 이는 정식 DB·E2E나 GitHub CI 실행 증거가 아니다.
- WSL 런타임 smoke: 동일 commit 빌드의 API `/health` HTTP 200 및 `{"status":"ok","service":"shoppingmall-api"}`, 고객 웹 `/` HTTP 200 및 `서비스 구축 중` 본문을 확인했다. 별도 일회성 `shoppingmall-s1-api`, `shoppingmall-s1-web` 컨테이너는 종료·`--rm` 제거했으며 9091 포트 LISTEN 잔류가 없다. API의 DB 준비 상태는 별개로 503이며 DB 통합 준비 완료를 뜻하지 않는다.
- 정리: 검증 컨테이너가 checkout에 남긴 정확한 `.pnpm-store` 캐시(약 697MB)를 경로·소유자·사용 중 여부 확인 후 제거했다. 패키지 lock/source와 무시 대상 `node_modules`는 보존했다. 캐시는 재설치로 복구 가능하다. 다른 프로젝트의 컨테이너와 DB는 건드리지 않았다.
- 변경 파일: 이번 기록은 `WORK_STATUS.md`, `docs/DEVELOPMENT_ENVIRONMENT.md`. 이전 제품 골격 commit과 테스트 결과는 아래 S1.1 항목에 보존한다. 오류 횟수: WSL 접속 제한 샌드박스 1회(허용된 SSH 별칭 실행에서 성공), 제품 오류 0회.
- 미검증·다음: GitHub CI 실제 실행, DB schema/권한/계정, 브라우저 역할별 경로, Android 앱/아이콘, 실제 Provider·Oracle 인수는 `UNVERIFIED`. S1.2의 인증·권한·DB 계약은 별도 승인 경계로 분리하고 영향받지 않는 작업을 계속한다. Flat v2 **로컬 정적 시안** QA는 신산님 지시로 제품 구축의 차단 조건에서 제외한다.

## 최신 상태 — 2026-09-27 S1.1 최소 실행 골격 작업 중

- WSL 시험 자원 사전 기록: `/home/daon/deploy/shopping` 정식 checkout을 지정 SSH alias에서 Git clone하여 `eb74e536cb3464cd9032256bd56619302355fcb8`과 원격 SHA 일치를 확인했다. WSL 시스템 Node는 18.19.1이고 pnpm이 없어 기존 `node:24-bookworm-slim` 이미지를 사용한 일회성 `shoppingmall-s1-verify` 컨테이너에서 checkout을 마운트해 설치·검사를 실행할 예정이다. 소유자 어울, 수명 이번 S1.1 검증 명령 동안, 종료 시 `--rm`으로 컨테이너 제거하고 정확한 이름의 잔류를 확인한다. 정식 DB·다른 컨테이너·시스템 Node는 변경하지 않는다.
- 담당·브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes` 격리 worktree. 원격 `main@207e7961c12f87f88a229d443a70ed764db2c24a`를 정상 merge하고 상세 계획 로컬 브랜치 `74a814d`를 이 브랜치에 정상 merge했다. 계획 브랜치와 기본 `main`의 사용자 자료는 삭제·수정하지 않았다. 신산님 최신 지시에 따라 Flat v2 로컬 정적 시안 QA 자체는 제품 착수의 차단조건이 아니며 실제 제품 QA는 후속 Stage로 남긴다.
- S1.1 변경: pnpm 모노레포 골격, Next.js 고객 웹 진입 화면, NestJS `/health` HTTP와 DB 연결 전 `/ready`의 503 응답, Expo 앱의 빌드 전 최소 진입점, 공유 계약 타입, 무비밀값 `.env.example`, Git 무시 규칙, 실제 ESLint 및 test/typecheck/build 스크립트, 읽기 권한만 가진 `.github/workflows/ci.yml`. 새 코드와 설정은 `apps/`, `packages/`, 루트 package/lock/config와 CI에 한정된다. 계정·상품·결제·DB schema·Secret·실연동은 아직 구현하지 않았다.
- TDD: health payload 시험은 누락/미구현 RED 뒤 GREEN, Nest HTTP `/health` 시험은 미구현 RED 뒤 GREEN, 웹 진입 화면 시험은 빈 화면 RED 뒤 GREEN을 확인했다. 환경 오류: pnpm이 `esbuild` 설치 스크립트를 거부해 해당 패키지만 승인 후 재설치(1회); 루트 TSX decorator 설정 누락으로 Nest 시험 실패 후 root tsconfig 보정(1회); 웹 ESM/JSX 테스트 설정 오류 2회 보정 후 실제 본문 누락 RED 확인; 일반 샌드박스의 pnpm 임시파일·tsbuildinfo 쓰기 거부는 허용된 실행 또는 비증분 타입검사로 검증했다.
- 로컬 검증: `/ready` 미등록 404 RED→DB 연결 전 503·본문 GREEN. 최종 `pnpm test` 48+8=56통과·0실패, `pnpm typecheck` 전 패키지 통과, `pnpm lint` ESLint 10 검사 통과, `pnpm build` Nest API·Next 웹 통과. 빌드 API `/health`와 Next 웹 `/` HTTP 200·응답 본문 확인, 종료 뒤 9091/9092 LISTEN 잔류 0. Android 앱 빌드/에뮬레이터는 아이콘 시안 승인 전이라 미실행. 깨끗한 checkout 재설치, WSL 동일 commit·DB/API/웹, CI 실제 실행, 실제 제품 브라우저 흐름은 `UNVERIFIED`.
- 환경: 로컬·WSL 9091/9092 현재 무점유 확인, `SINSAN`의 `/home/daon/deploy/shopping` 부재와 정확한 `local-postgres`의 `shoppingmall` DB 읽기 전용 확인. 새로운 WSL checkout/DB 사용자·schema는 생성하지 않았다. npm 패키지 설치 외 외부 서비스 가입·비용 없음. 실제 Secret 값은 파일·로그에 기록하지 않았다.
- 다음 조치: S1.1 최소 골격의 clean-checkout 재현·CI/실패 health 상태·환경 gate 잔여를 확인하고 안전한 commit/push로 exact SHA를 보존한다. 별도 승인 대상인 인증/권한·DB schema·Secret은 선행 계약 승인 전 구현·변경하지 않는다. 첫 PR Broker 경쟁 조건과 실제 제품 화면 QA는 각각 독립 미검증으로 남긴다.

## 최신 상태 — 2026-09-27 전체 구축 재지시와 정적 시안 QA 우선순위 변경

- 신산님은 `D:\tmp\shoppingmall2-end-to-end-work-plan\docs\WORK_PLAN.md` 전체 구축을 재지시하고 외부 서비스 가입·실연동을 구축 후 일괄 처리하기로 했다. 이어서 Flat v2 로컬 시안은 실제 제품이 아닌 참고 시안이므로 그 자체의 브라우저 QA를 무시하고 제품 구축을 진행하도록 직접 지시했다. 따라서 시안 QA를 제품 코드 착수의 선행 차단조건으로 두지 않는다. 실제 제품 브라우저·접근성·인쇄 QA는 해당 Stage에서 별도로 수행한다. 이 판정은 시안 QA를 PASS로 바꾸지 않는다.
- 작업 중 원격 `main`이 `207e7961c12f87f88a229d443a70ed764db2c24a`로 전진했으며 PR #2에서 기존 Flat v2 commit `11fdcbe`까지 병합했다. 현재 이 브랜치의 후속 PR Broker 보완 commit `5211ad3`은 main에 포함되지 않았다. 계획 branch `codex/end-to-end-work-plan@74a814d`는 로컬 worktree에 보존되어 있지만 원격의 실제 branch 목록에는 없다. 로컬 root `main`은 이전 상태이고 사용자 소유 미추적 `.github/`를 보존한다.
- 진행 원칙: 새 branch/worktree 없이 기존 격리 브랜치에서 최신 main과 승인된 상세 계획의 정확한 차이를 대조하고 S0의 독립 환경·계약 확인을 계속한다. 서비스 가입·비용·실연동·Oracle 배포·지속 DB 변경은 현재 수행하지 않는다.

## 최신 상태 — 2026-09-27 Flat v2 S0 화면 QA 재시도와 첫 PR 경로 검토

- 담당·브랜치: 어울 단일 writer / `codex/flat-v2-prototypes` HEAD `5211ad3af8a0d4dadb0c95cc7e24aa8ad53e62e8`. 신산님 지시에 따라 첫 PR 위험 때문에 독립 가능한 QA를 멈추지 않고 재개했다. 새 branch·worktree나 외부 자원을 만들지 않았다.
- 실제 브라우저 시도: 사용자에게 열려 있는 IAB의 `file:///D:/Project/shoppingmall2/.worktrees/flat-v2-prototypes/docs/design/assets/home-flat-v2.html` 탭에 접근했으나 Browser Use가 `file:` URL protocol을 거부했다. 응답은 `http:`·`https:`만 허용하며 대체 브라우저 표면·localhost·간접 명령으로 같은 결과를 얻는 우회를 금지한다. 거부 1회 후 우회·반복 시도하지 않았다.
- 허용된 정적 대조: 홈·고객·판매자·관리자 v2 모두 viewport meta와 기존 CSS/역할 스크립트 연결을 갖는다. `shared.css`에는 600px 이하 역할 화면 규칙, 버튼·입력 포커스 윤곽선, 관리자 정산 보고서 A4 인쇄 규칙이 있고 v2 CSS에도 포커스 윤곽선이 있다. 이는 규칙의 존재 확인이지 실제 적용·접근성·PDF 결과 증거가 아니다. 기존 시안 44개와 PR 설명 8개의 Node 검사, 총 52개 통과·0실패를 새로 실행했다.
- 실제 화면 QA 판정: 홈·고객·판매자·관리자 각각의 1920×1080 / 1440×900 / 430×844 렌더링, 200% 확대, 키보드 순서·focus, 관리자 인쇄/PDF는 전부 `UNVERIFIED`. 신산님의 시각 기준 채택은 유지하지만 이 세부 실행 증거와 동일시하지 않는다. 계획 S0 화면 검증 체크항목은 미완료로 둔다.
- 첫 PR 경로: (1) 현재 main 요청 태그 자동화는 SSH alias만으로 트리거할 수 있으나 구버전 Broker에 검증 HEAD 고정이 없어 경쟁 조건 Critical을 남기므로 권장하지 않는다. (2) 계정/API 사용을 별도 허용받아 사람이 PR 생성·정확한 SHA 대조 후 병합하면 위험을 통제할 수 있으나 신산님의 현행 GitHub 계정 사용 금지와 충돌한다. (3) `main`의 Broker를 먼저 고치면 그 수정 자체가 안전한 첫 PR 경로를 필요로 하므로 순환 문제이며 `main` 직접 push는 금지다. 어느 경로도 현행 권한·필수 gate를 모두 만족하지 않아 요청 태그를 보내지 않았다.
- 다음 조치: 신산님의 QA 증거 제공 또는 허용된 브라우저 경로, 그리고 첫 PR 예외 경로에 대한 명시적 결정을 받기 전에는 PR 병합하지 않는다. 영향받지 않는 기존 작업계획·환경 사실 확인은 계속할 수 있다. 외부 서비스 실제 가입·연동·Oracle 배포는 현재 범위에 포함하지 않는다.

## 최신 상태 — 2026-09-27 PR Broker 본문 보강 구현 검증 중

- 담당·브랜치: 어울 단일 writer / `codex/flat-v2-prototypes`, 시작 HEAD `11fdcbe83f8102e639bcd44779409ad78381b142`. 신산님이 첫 PR 한정으로 필수 설명을 추적 문서에 담고 Broker 수정본을 같은 PR에 포함하는 방식을 직접 승인했다. 원격 `main`의 구버전 Broker가 첫 PR에 실행된다는 한계는 숨기지 않는다.
- 변경: `.github/PR_REQUEST.md`에 이번 PR의 목적·변경 요약·영향·검증·미검증·롤백을 기록. `.github/pr-broker-body.mjs`와 Node 검사는 필수 여섯 항목의 누락·공백·중복·임시 문구·숨긴 주석·코드 블록 우회를 차단한다. `.github/workflows/auto-pr-merge.yml`은 다음 PR부터 신뢰된 `main` revision의 검사기를 사용해 정확한 branch HEAD의 설명 파일을 검증하고 신규·재사용 PR의 본문에 적용한다. 병합에는 `--match-head-commit`을 사용한다. 원격에 bootstrap branch가 없음을 확인한 후 완료된 bootstrap 자동 병합 경로를 제거했다. 계정 로그인·PAT·GitHub CLI 인증 설정을 바꾸지 않았다.
- TDD·검증: 검사기 부재 RED 1건, 누락/공백/중복/임시 문구 RED 4건, 숨긴 HTML 주석·코드 블록·목록형 임시 문구 RED 3건 확인 후 GREEN. 기존 시안 44개+신규 PR 본문 검사 8개=총 52개 통과·0실패, `node .github/pr-broker-body.mjs .github/PR_REQUEST.md` 성공, `git diff --check` 오류 0건. 로컬 `gh pr merge --help`에서 `--match-head-commit` 지원을 확인. GitHub Actions 실제 태그 실행·자동 PR·병합은 아직 미검증. Flat v2의 개별 viewport·확대·키보드·인쇄 실행 증거도 미검증이며 사용자 시각 승인과 구별한다.
- 리뷰·체크포인트: 읽기 전용 리뷰에서 새 workflow의 병합 경쟁 조건(Critical), 숨긴 주석/코드 블록 통과 및 bootstrap 우회(Important)를 지적받아 수정했다. 원격 bootstrap branch 없음 확인. 수정 commit `1f9f6d1a8208e9c77d73889fcebdf94943bd3bbd`을 지정 SSH alias에 push했고 원격 branch HEAD와 일치, worktree clean. 다만 첫 PR은 수정 전 `main` Broker가 실행되므로 이 Broker의 병합 순간 HEAD 고정 결함은 첫 PR에서 여전히 남는다. 해당 미해결 Critical와 실제 화면 QA 부족 상태로 요청 태그를 보내지 않는다.
- 다음 조치: 첫 PR에 사용할 안전한 병합 경로와 실제 화면 필수 QA 증거를 확보한다. 그 뒤 첫 PR을 통합하고, 두 번째 기존 계획 브랜치에 새 `main`을 정상 병합해 같은 PR 설명 검증을 적용한다. 두 브랜치 정리 전 새 브랜치는 생성하지 않는다.

## 최신 상태 — 2026-09-27 전체 구축 지시·외부 연동 후행 결정

- 신산님은 Flat v2 시안을 직접 확인하고 시각 기준으로 승인했다. 이는 사용자 시각 승인 기록이며 1920×1080/1440×900/430×844, 200% 확대, 키보드·인쇄/PDF별 실행 증거가 생겼다는 뜻은 아니다. 수행되지 않은 개별 검증은 `UNVERIFIED`로 유지한다.
- 신산님은 `D:/tmp/shoppingmall2-end-to-end-work-plan/docs/WORK_PLAN.md`의 상세 개발 범위로 전체 구축을 지시했다. 외부 서비스 가입·실연동에 필요한 사항은 구축 완료 후 일괄 처리하기로 했다. S1~S8은 mock/계약 검증으로 진행하고 PG·카카오·문자/메일·푸시의 실제 공급자 PASS와 Oracle UAT/공개 출시는 별도 증거·승인 전까지 선언하지 않는다. 계획서의 schema/migration·인증/권한·Secret·비용·Oracle 별도 승인 경계는 그대로다.
- 기존 두 브랜치의 순차 병합·정리 전 새 브랜치는 만들지 않는다는 신산님 직접 지시가 유지된다. 현재 `main`의 PR Broker는 일반 문구로 즉시 PR을 생성·자동 병합하고, PMO 필수 PR 본문 항목을 채우지 않는다. 신산님은 자동화 수정을 직접 지시했다. 수정본을 기존 Flat v2 브랜치에 작성해도 첫 요청 태그는 현재 `main`의 구버전 자동화를 실행하므로, 첫 병합 경로는 별도 해결이 필요하다. `main` 직접 수정·새 브랜치·GitHub 계정/PAT 사용·미검증 PASS 선언은 하지 않는다.
- 담당·현재 체크포인트: 어울 단일 writer, `codex/flat-v2-prototypes` 시작 HEAD `1c210a2320620be3570d0b0ed6b295b0feff3fe7`. 다음 안전 작업은 정본·Git 게이트 점검과 허용된 브랜치 내 기록 보존이며 PR 요청 태그·제품 신규 Stage 시작은 선행 경계 해결 뒤다.

## 최신 상태 — 2026-09-27 Flat v2 채택 표기 정정·병합 전 검증

- 단계·담당: Flat v2 병합 전 리뷰 대응 / 어울 단일 writer / `codex/flat-v2-prototypes`, 시작 HEAD `a8aaa4511508f035e594047205014822bf3c1f6b`.
- 신산님이 Flat v2를 향후 제품 시각 기준으로 채택한 사실을 `docs/design/DESIGN.md`, 시안 안내, 홈 상태 문구, 계획 문서 및 관련 검사에 일치시켰다. v1은 비교·복구용으로 보존하며 역할별 JavaScript·거래 기능은 변경하지 않았다. 채택은 브라우저 QA 완료가 아니다.
- 읽기 전용 코드 리뷰의 Important 2건 중 상태 표기 불일치를 수정했다. 실제 브라우저의 1920×1080/1440×900/430×844·200% 확대·키보드·인쇄/PDF 검증은 여전히 미완료로 남긴다. 보조 버튼 눌림 표현 Minor는 실제 화면 점검 대상이다.
- 회귀: 채택 문구 검사 RED 확인 후 `node --test` 44통과·0실패. 실제 화면을 테스트한 것으로 표시하지 않는다. 브라우저 자동화의 로컬 파일 프로토콜 정책 거부를 우회하지 않는다.
- Git·다음 조치: 채택 표기 정정 commit `572f3e97f2a6089cb9d4777577700202ee48bf6b`을 원격에 보존했다. 그 사이 원격 `main`이 PR Broker workflow 이름 변경 commit `770d7f010233ca9892792ff2f0f9a80c2a638602`로 전진하여 이를 현재 Flat v2 브랜치에 정상 merge했고, 재검사 44통과·0실패 뒤 merge commit `88b5645e7e3e69df068b958ff4ff04d59bf0d791`을 지정 SSH 원격에 push했다. 두 기존 브랜치의 순차 병합·정리와 새 브랜치 생성은 신산님의 직접 지시다. 실제 화면 검증 증거·필수 게이트를 확보한 뒤 PR Broker 요청 태그를 사용한다. 현재 broker가 생성하는 PR 본문에는 PMO 필수 목적·영향·검증·미검증·rollback이 모두 담기지 않아 그 경계도 해소해야 한다. 게이트 전 PR 태그·main 병합·브랜치 삭제는 하지 않는다.

## 최신 상태 — 2026-09-27 Flat v2 Task 3 문서·정적 검증 완료, 시각 인수 대기

- 단계·담당: 승인된 Flat v2 구현 계획 Task 3 / 어울 단일 writer / `codex/flat-v2-prototypes`, 기준 `origin/main` `34b4186`
- 변경: `docs/design/prototypes/README.md`에 v1과 Flat v2 비교 경로·가상 기능 경계 추가, `docs/design/DESIGN.md`에 v2를 미승인 후보로 명시, `prototype-shell.test.mjs`에 안내 링크 검사 추가. 계획 문서의 오래된 무커밋 `master`/commit 보류 전제를 신산님의 최신 작업 브랜치 지시에 맞게 정정. 원본 시안·역할별 JS·공유 CSS는 수정하지 않음
- 검증: 안내 링크 누락 RED 1건 확인. 읽기 전용 리뷰가 홈 v2 하단의 잘못된 'v1 승인' 표기를 Important로 찾아, 미승인 후보 표기 검사를 RED→GREEN으로 추가하고 하단 문구만 수정. 전체 Node 검사 44통과·0실패. 모든 v2 HTML의 로컬 CSS·JS 경로 11개 존재 확인. 실제 인앱 브라우저에서 `file://` 시안 열기는 브라우저 보안 정책이 프로토콜을 거부했으며 다른 표면·로컬 서버 우회는 시도하지 않음. 따라서 1920×1080/1440×900/430×844, 200% 확대, 키보드 focus, 상태 구분, 인쇄/PDF·스크린샷은 **미검증**. 신산님의 직접 시각 확인 필요
- 오류·조치: Task 3 코드 검사 오류 0건; 브라우저 URL 정책 거부 1회. 원본 9개 파일의 SHA256 불변과 `git diff --check` 오류 0건을 재확인. 임시 `.superpowers/sdd/2026-09-26-balanced-flat-prototypes/` 기록과 활성 worktree는 검토 전 보존
- Git 체크포인트: 작업 브랜치 `codex/flat-v2-prototypes`의 `9dd88603fc6754ef3360ad253aa483851cff045f`를 `origin/codex/flat-v2-prototypes`에 첫 push하고 `git ls-remote`에서 같은 SHA를 확인. 원격 `main`은 기준 `34b4186` 그대로이며 PR·병합·자동 요청 태그 생성 없음. 기본 작업 폴더의 뒤처진 로컬 `main`과 미추적 `.github` 사본도 보존
- 리뷰 잔여 Minor: 보조 버튼 hover 중 press 색 변화가 뚜렷하지 않음; HTML 검사가 모든 추가 head 요소·상대경로 존재를 자동 보장하지 않음(현재 CSS·JS 11개 경로는 별도 정적 확인). 화면 검토의 필수 차단은 아니나 향후 실제 브라우저 확인 대상
- 다음 조치: 신산님께 Flat v2 시각 후보를 제시해 검토·수정 의견을 받는다. Task 3 실제 브라우저 점검은 미완료이며 제품 개발 Stage·WSL/Oracle 배포·`main` 병합은 별도 경계

## 이전 상태 — 2026-09-27 Flat v2 Task 2 완료, Task 3 진행 전

- 단계·담당: 승인된 Flat v2 구현 계획 Task 2 / 어울 단일 writer / `codex/flat-v2-prototypes`, 기준 커밋 `02cffbe`
- 변경: `docs/design/prototypes/flat-v2/`에 고객·판매자·관리자 HTML 및 역할별 동등성 검사 추가. 원본 역할 HTML·JS와 `shared.css`는 수정하지 않음. v2는 기존 classic 역할 스크립트를 상대경로로 공유
- 검증: 신규 세 역할 검사에서 파일 부재 RED 3건 확인 후 역할 검사와 기존 검사 합계 37통과·0실패. 원본 HTML 3개·JS 3개·공유 CSS의 SHA256을 확인했고 `git diff --check` 오류 없음. 실제 브라우저·viewport·인쇄는 미검증
- 오류·조치: 제한된 셸에서 새 디렉터리 생성 거부 1회; 지정 worktree 안에만 허용된 권한으로 폴더 생성 후 `apply_patch`로 검사 작성. 코드 회귀 0건
- 다음 조치: Task 2 변경을 작업 브랜치에 commit한 뒤 Task 3 안내·설계 문서 및 가능한 시각 QA를 수행. 원본 시안과 v1 승인 상태 유지

## 이전 상태 — 2026-09-27 Flat v2 Task 1 완료, Task 2 진행 전

- 단계·담당: 신산님이 Flat v2 제작 계획을 승인하고 `main`에서 작업 브랜치를 만들도록 지시 / 어울 단일 writer
- 기준: `origin/main` `34b4186561a9c1f960bdea58ece4264cb95e100e`에서 `codex/flat-v2-prototypes`와 `D:\Project\shoppingmall2\.worktrees\flat-v2-prototypes`를 생성. 로컬 기존 `main`과 미추적 `.github` 사본은 변경하지 않음. 이 격리 폴더는 Flat v2 검토·병합 뒤 포함 여부와 dirty 상태를 확인하고 정리할 대상
- Task 1 변경: `docs/design/assets/flat-v2.test.mjs`, `home-flat-v2.html`, `owool-flat-v2.css`. 원본 홈 HTML·CSS는 불변 SHA256 `D31050A8…`, `5C45CE70…`. 본문·글자 크기·가상 상품 흐름은 보존하고 Flat 시각 규칙만 별도 적용
- 검증: 시작 기준 Node 37통과. Task 1 신규 검사에서 파일 부재 RED 2건 확인 후 2통과·0실패. 원본/비교본 줄끝 CRLF·LF 차이만 정규화해 본문 내용을 비교. 실제 브라우저·viewport·인쇄는 미검증
- 오류·조치: 제한된 셸에서 계획 기록 폴더 생성 권한 거부 1회; 반복 실행을 중단하고 지정 작업 경로에 허용된 권한으로 재실행하여 생성. 임시 계획 기록은 `.superpowers/sdd/2026-09-26-balanced-flat-prototypes/`에 격리·ignore. 업무 코드 오류 없음
- 다음 조치: Task 1 변경을 작업 브랜치에 안전하게 commit한 뒤 Task 2 역할별 비교 화면을 테스트 우선으로 제작. 계획의 과거 무커밋 `master` 전제는 최신 사용자 지시·실제 Git에 따라 적용하지 않음
## 최신 상태 — 2026-09-27 상세 계획 리뷰 정정·SSH PR 경로 확인

- 단계·담당: 기존 두 브랜치 병합 전 계획서 리뷰 대응 / 어울 단일 writer / `codex/end-to-end-work-plan`, 시작 HEAD `e7760ef9efebc1abdf5f66db2215f8fd7d3027f4`, 작업 시작 시 clean. 아래 이전 기록의 `1b40fc9` 및 ‘문서 4개 미커밋’은 과거 checkpoint이며 현재 Git 상태가 아니다.
- 읽기 전용 리뷰 Important 2건을 정정했다. `docs/WORK_PLAN.md`와 `docs/design/DELIVERY_SCOPE_ADDENDUM.md`에서 기존 승인 대기·실패 결제·미출고/지연·재고 이상·미처리 문의 예외를 유지한다고 명시했다. `docs/DEPLOYMENT_UAT_PLAN.md`의 Oracle staging migration·QA seed는 후보 commit/image/schema 고정 및 별도 승인 뒤 U2에서 실행하도록 옮겼다. 상세 계획 전체는 여전히 신산님 검토 초안이며 병합 요청은 내용 승인과 구별한다.
- 로컬 `node --test` 37통과·0실패. 실제 브라우저·PG/Oracle/WSL 연동은 시험하지 않았다. Flat v2의 실제 화면 QA 미완료는 두 브랜치 정리 순서의 선행 게이트다.
- PR 경로 정정: 아래 이전 기록의 ‘GitHub 계정/gh 인증 부재로 PR 불가’는 부정확했다. 원격 `main`은 이 기록 중 `770d7f010233ca9892792ff2f0f9a80c2a638602`로 전진했고 workflow가 `.github/workflows/auto-pr-merge.yml`로 정상 이름 변경됐다. SSH Git으로 `pr-request/<branch HEAD>/<branch>` 태그를 push하면 GitHub Actions가 PR을 생성·검사·squash 병합·원격 브랜치 삭제하도록 되어 있다. 계정 로그인/PAT/`gh`는 사용하지 않는다. 다만 현재 broker의 PR 본문은 자동 생성된 일반 문구라 PMO 필수 목적·영향·검증·미검증·rollback 전부를 담지 못한다. 요청 태그는 필수 검증 완료를 뜻하므로 화면 QA가 미완료인 현재 생성하지 않는다.
- 다음 조치: 두 브랜치 변경을 각각 안전한 commit/push로 보존하고, Flat v2의 실제 화면 검증 증거와 필수 리뷰 게이트를 확보한 뒤 기존 브랜치부터 순차 PR/병합·merged-main smoke·원격/로컬 worktree 정리한다. 둘 다 정리되기 전 새 작업 브랜치를 만들지 않는다. 기본 `main`의 미추적 `.github/` 파일은 덮어쓰거나 삭제하지 않는다.

## 최신 상태 — 2026-09-27 두 기존 브랜치 병합·정리 요청의 검증 게이트

- 판정: 신산님이 `codex/flat-v2-prototypes`와 `codex/end-to-end-work-plan`을 모두 `main`에 병합하고 원격·로컬 브랜치와 worktree를 정리한 **뒤** 최신 `main`에서 새 작업 브랜치를 만들도록 지시했다. 병합·삭제·새 브랜치 생성은 아직 미실행이다. 기존 작업 브랜치 종료 전 새 브랜치 생성의 예외는 없다는 최신 지시를 적용한다.
- 담당·Git: 어울 단일 writer. 원격 `main`=`34b4186561a9c1f960bdea58ece4264cb95e100e`; Flat v2=`a8aaa4511508f035e594047205014822bf3c1f6b`(main보다 5 commit 앞), 계획 초안=`1b40fc9d23244941c51e4c1242b68bd722965397`(1 commit 앞). 원격 세 ref는 SSH 읽기 전용으로 재확인했다. 로컬 기본 `main`은 원격보다 2 commit 뒤이며 미추적 `.github/` 두 파일은 소유·보존 대상이다.
- 이번 검증: Flat v2 worktree의 `node --test` 44통과·0실패, 계획 worktree의 `node --test` 37통과·0실패. 계획 branch에는 승인된 관리자 관제 범위의 문서 수정 4개 파일이 아직 미커밋으로 남아 있고 `git diff --check`는 0오류다. 이는 정적/모델 검사 결과이며 실제 브라우저·인쇄/반응형 QA가 아니다.
- 병합 차단 1: Flat v2 실제 브라우저 QA는 이전부터 미실행이다. 사용 가능한 브라우저 자동화가 `file://` 로컬 시안 열기를 보안 정책상 명시적으로 거부했으며 우회 금지 안내가 있어 다른 URL·브라우저·명령으로 같은 접근을 시도하지 않았다. 사용자가 직접 수행한 실제 브라우저 확인 또는 허용된 독립 검증 증거 없이는 필수 화면 검증을 통과로 표시하지 않는다.
- 병합 차단 2: 현재 `gh`의 GitHub 인증 토큰이 무효이고 Chrome의 현재 GitHub 계정에서도 대상 저장소는 404로 보인다. SSH Git ref 조회/branch push는 가능하지만 PR 조회·생성·병합 경로는 확인되지 않았다. 인증·계정 설정은 변경하지 않고, PR 없이 직접 `main`에 push하는 우회는 별도 보고·승인 없이 하지 않는다.
- 정확한 다음 조치: 승인된 관제 범위의 미커밋 문서를 검사해 안전한 branch checkpoint로 보존한다. Flat v2 화면 실브라우저 증거와 GitHub PR 접근을 확보하거나 신산님에게 미검증·절차 변경을 명시적으로 결정받은 뒤 순서대로 병합/merged-main smoke/정리한다. 두 브랜치가 모두 안전하게 정리되기 전에는 새 작업 브랜치를 만들지 않는다. 제품 구현·WSL/Oracle 배포·인수는 미시작.

## 이전 상태 — 2026-09-27 상세 개발·설치/인수 작업계획 초안 작성

- 판정: 계획 수립 중. 제품 구현·WSL/Oracle 배포·사용자 인수테스트는 미시작.
- 담당·Git: 어울 단일 writer, `D:\tmp\shoppingmall2-end-to-end-work-plan`의 `codex/end-to-end-work-plan` / `34b4186561a9c1f960bdea58ece4264cb95e100e` (`origin/main` 기준). 신산님이 Flat v2 미병합 상태에서 별도 계획서 브랜치를 만드는 예외를 직접 승인했다.
- 기존 작업 보존: `codex/flat-v2-prototypes`는 별도 worktree에서 clean·push 상태로 유지하고 실제 브라우저 점검·PR·병합은 미완료. 기본 `main`의 미추적 `.github/` 자료는 변경하지 않았다. 계획서 작성 후 Flat v2 병합 여부와 문서 기준을 대조한다.
- 확정된 인수 범위: Flat v2를 제품 디자인 기준으로 채택. PG 시험환경의 카드 결제·부분 환불·실패/중복 통지를 확인하고 실금액 거래는 인수 합격 조건에서 제외. Android는 신산님이 제시한 에뮬레이터에서 반복 시험하고 연결된 실기기에서도 최종 설치·로그인·결제 복귀·푸시를 확인할 계획이다. iPhone 실기기 검증은 후속. 카카오 로그인은 웹·Android 실제 연동, Apple 로그인은 후속 iPhone 인수 단계. 문자·이메일·Android 푸시는 시험 계정의 실제 수신까지 확인한다. Android 앱 아이콘은 앱 빌드 전 어울몰 전용 시안을 제작·신산님 승인 후 적용한다.
- Oracle 준비 현황: 신산님 답변에 따르면 Oracle Cloud 계정과 서버가 모두 있다. 정확한 서버 식별자·기존 서비스 점유·격리 배포 가능 여부·접속 권한·비용·도메인·DB/저장소 구성은 아직 확인하지 않았다. 기존 지시대로 환경 구성 결정과 배포 승인은 인수 준비 게이트에서 수행한다.
- 프로모션 인수 범위: 관리자 등록 프로모션은 배너 표시만이 아니라 상품·주문 할인과 배송비 지원을 실제 주문 견적·PG 시험 결제·환불·정산 발생 자료에 반영한다. 할인 쿠폰은 한 결제에 최대 1개, 배송비 지원은 발송 주문마다 최대 1개이며 두 종류는 함께 적용 가능하다. 5만 원 무료배송은 혜택 적용 전 해당 발송 주문의 상품금액으로 판정한다. 시험값과 실제 운영 혜택 예산은 구분한다.
- 외부 계정 준비 상태: 신산님 후속 답변에서 PG 개발자 **시험상점 없음**, 카카오 개발자 앱은 **가능**, 문자·메일 발송 서비스는 **준비됨**, Expo/Firebase는 **모름**. 각각의 소유·권한·실제 설정/비용은 미확인이다. 비밀값 수집 없이 인수 준비 단계의 접근·권한 확인 항목으로 둔다. PG 시험상점이 없더라도 mock·계약 시험은 진행하고 실제 PG 연동 PASS로 표시하지 않는다. 신산님이 에뮬레이터 화면과 연결된 실기기 보유를 알렸으나 실제 앱/푸시 시험은 미수행.
- 출고 후 교환·환불 인수 기준: 신산님은 변경 가능한 시험용 정책으로 접수·관리자 판단·PG 시험 환불 흐름을 인수하고, 최종 법률 검토·고객 약관 확정은 공개 출시 전 필수로 두는 권장안을 선택했다. 기능 인수 합격을 출시 승인으로 간주하지 않는다.
- 문서 변경: `docs/WORK_PLAN.md`의 S0~S8 상세 Task·gate 보완, `docs/design/DELIVERY_SCOPE_ADDENDUM.md`와 별도 `docs/DEPLOYMENT_UAT_PLAN.md` 초안 작성. 세 문서는 신산님 검토 전이며 제품 설계/개별 환경·비용 승인을 대신하지 않는다. 변경 전에는 S1~S8의 추상적 목록, 변경 후에는 분류·홈·프로모션 금액·정산/인쇄·아이콘·앱·Oracle 인수의 선행/증거/미검증/rollback 경계를 연결했다.
- 검증: 새 worktree의 기존 Node 시안 검사 37통과·0실패, `git diff --check` 0오류, 새 계획 문서 3개의 상대 링크 존재 검사 통과. 최신 사용자 결정과 오래된 문구의 충돌을 점검해 Android 에뮬레이터/실기기 시험 시점·카카오 계정 존재 미확인·판매자별 정산 표현을 정정했다. 이는 브라우저·제품·외부 연동 검증이 아니다. Flat v2 비교 시안의 브라우저·viewport·인쇄 검증도 여전히 미수행.
- WSL 읽기 전용 재확인: `WSL-server`의 `/home/daon/deploy/shopping`은 아직 없고, 정확한 `local-postgres` 컨테이너는 실행 중이다. 유사 이름의 다른 PostgreSQL 컨테이너도 존재하므로 정식 DB 작업 때 이름을 정확히 지정한다. `ss -ltn`에서 9091 포트 점유는 보이지 않았으나 로컬·Oracle까지 공통 포트 확정으로 보지 않는다. 서버 설정·DB·checkout 변경 없음.
- 오류·조치: 제한된 셸의 `git ls-remote`에서 SSH alias를 해석하지 못한 1회. 승인된 권한에서 같은 읽기 전용 조회가 성공했고 `origin/main` SHA가 `34b4186`으로 일치함을 확인. SSH 설정·credential 변경 없음. PMO 환경 가이드의 신규 worktree `D:\tmp` 규칙을 늦게 확인해 계획서 worktree를 한때 `D:\Project\shoppingmall2\.worktrees\end-to-end-work-plan`에 생성한 경로 판단 오류 1회; 즉시 보고 후 정확한 소스·대상·dirty 상태를 확인하고 `git worktree move`로 `D:\tmp\shoppingmall2-end-to-end-work-plan`에 이동했다. 원래 경로 부재·새 경로 정상·기존 Flat v2 불변 확인.
- 이번 결정·다음 조치: 신산님이 **이번 인수의 관리자 관제 필수 범위**를 주문·매출·재고·클레임 요약 및 실패 결제·미출고 처리 목록으로 승인했다. 자동 경보·점검 스위치·판매자 강제 정지는 후속이다. 이를 보완 설계, S5.4, UAT-11에 반영하고 세 문서의 검증을 마친 뒤 **계획 전체의 승인 또는 수정**을 요청한다. 이 관제 답변만으로 나머지 상세 실행 계획 전체를 승인받은 것으로 간주하지 않는다. PG 시험상점 준비, Oracle 격리·비용, schema/인증/Secret, 공개 출시 법률/약관은 각 별도 승인 경계다. 문서는 작업 branch의 검토 초안으로만 보존하고 PR/병합은 하지 않는다. 제품 구현·인수는 미착수.

## 이전 상태 — 2026-09-26 초기 Git main 기준선 생성·원격 확인

- 단계·담당: 신산님 직접 지시의 `sinsan-develop/shoppingmall` 초기 `main` 생성·커밋·push / 어울
- 현재 판정: `D:\Project\shoppingmall2`의 초기 `main` root commit `6c249b0be8b60604a86c4ddf7c3ea68159749d50` 생성. `origin=git@github-sinsan-develop:sinsan-develop/shoppingmall.git`; 비강제 `git push -u origin main` 성공. 이후 `git ls-remote --symref origin HEAD refs/heads/main`에서 원격 HEAD가 `main`을 가리키고 원격 SHA가 초기 커밋과 일치함을 확인
- 기준선 포함: `docs/`와 `WORK_STATUS.md` 32개 파일. `.github/pr-broker-gate.sh`와 `.github/workflows/ssh-pr-bridge.yml`은 자동 PR 병합을 수행하는 별개 자료라 로컬에 미추적으로 보존하고 초기 커밋·push에서 제외. 다른 자료 삭제·초기화 없음
- 검증: 기존 Node 모델·화면 연결·글자 크기 37통과·0실패, `git diff --cached --check` 0오류, 포함 파일의 private key·일반 토큰 형태 패턴 스캔 결과 해당 파일 0건. 실제 브라우저·인쇄·외부 연동은 미검증. Flat v2 제작 계획은 여전히 신산님 검토 대기
- 오류·조치: 제한된 셸의 SSH 별칭 해석 실패 1회와 `.git/HEAD.lock` 쓰기 거부 1회. 읽기 전용 Git 참조 확인 후 허용된 권한으로 동일 명령을 다시 실행해 정상 완료. SSH key·credential 내용·설정 변경 없음
- 다음 조치: Flat v2 계획의 신산님 검토·승인 여부 확인. 제품 Stage/WSL checkout·DB 변경은 별도 게이트

## 이전 상태 — 2026-09-26 균형형 Flat v2 시안 제작 계획 검토 대기

- 단계·담당: 승인된 Flat 설계의 구현 계획 수립 / 어울. 신산님이 2026-09-26 [서면 설계](docs/superpowers/specs/2026-09-26-balanced-flat-prototype-design.md)를 승인함
- 상태: [Flat v2 시안 제작 계획](docs/superpowers/plans/2026-09-26-balanced-flat-prototypes.md) 작성·자체 대조 완료, 신산님 검토 대기. v1 및 클릭형 시안 원본 수정·v2 제작은 아직 미시작
- 계획 경계: 별도 v2 CSS와 홈·고객·판매자·관리자 진입점; 기존 역할별 JS 재사용, 실제 결제·정산·프로모션 기능 변경 없음. 무커밋 `master`/remote 없음에 따라 Git commit·push는 초기 기준선 게이트 전 보류
- 변경 파일: 위 계획 파일과 `WORK_STATUS.md`. 기존 제품/시안 파일 미수정. 담당 writer 어울
- 검증·오류·미검증: 원본 HTML의 링크·역할 JS·현재 디자인 폰트 크기·PMO 화면 기준과 계획을 정적 대조. 기존 Node 모델·화면 연결·글자 크기 검사 37통과·0실패(위 계획의 기존 5개 시험 파일). Flat v2 구현 검사·브라우저·viewport·인쇄는 미실행, 이번 단계 오류 0건
- 정확한 다음 조치: 신산님이 계획의 파일 범위와 검증·미검증 경계를 검토·승인하면 단일 writer가 Task 1→3을 순서대로 진행. 실제 브라우저 접근이 정책상 차단되면 우회하지 않고 미검증으로 보고

## 이전 상태 — 2026-09-26 균형형 Flat 시안 설계 검토 대기

- 단계·담당: 화면 시각 변형 설계 / 어울. 신산님이 균형형 Flat 방향과 고객 상품·판매자 재고·관리자 프로모션 대표 비교를 확인함
- 상태: 기존 승인 정적 v1 및 클릭형 시안을 보존하는 별도 Flat v2의 [서면 설계](docs/superpowers/specs/2026-09-26-balanced-flat-prototype-design.md) 작성. 서면 설계 검토·승인 전이며 Flat v2 시안 제작·제품 구현 미시작
- 변경 파일: 위 설계 파일과 `WORK_STATUS.md`만. 기존 시안 HTML/CSS/JS·승인 디자인 기준은 변경하지 않음
- Git·환경: 무커밋 `master`, remote 미설정, 미추적 자료 보존. 프로젝트 root `AGENTS.md` 없음. 신규 branch/worktree·WSL·DB·배포 조치 없음
- 검증·오류: 설계 문구와 기존 디자인 프로필·PMO 화면 기준 정적 대조; 실제 브라우저·모바일·확대·키보드 검증 미수행. 이번 단계 명령 오류 0건
- 정확한 다음 조치: 신산님이 서면 설계 파일을 검토·수정 또는 승인. 승인 후 별도 Flat v2 제작 계획·검증 방법을 확정하고 원본을 덮어쓰지 않는 비교 시안만 제작

## 이전 상태 — 2026-09-26 메인 화면 확장 구조 및 분류·정산 설계 초안 검토 대기

- 판정: `SPEC_REVIEW_WAIT` (정적 시안 4개 승인, 역할별 독립 클릭형 시안 3개 정적 제작 완료. 상품·판매자 분류/등록/정산 조회와 메인 화면 확장 구조의 **서면 설계 초안** 작성, 신산님 검토 대기. 추가 화면 구현·실제 브라우저 검증·제품 구현은 미시작)
- 정본: 신산님이 지정한 현재 문서 작업공간 `D:\Project\shoppingmall2`; 이전 OneDrive 폴더는 보존된 복사 원본이며 이후 작업 정본으로 사용하지 않음. 개발 코드 정본과 실제 실행환경은 아직 미확정
- 작업계획: `docs/WORK_PLAN.md` 승인, S1~S8 모두 미시작
- Git: 무커밋 `master`, remote 미설정, 기존 `docs/`·`WORK_STATUS.md` 미추적 보존. 새 작업 폴더의 기존 `.github/` 두 파일도 보존·미추적; writer 어울; 기존 `D:\Project\shoppingmall`는 읽기 전용 참고
- 최근 결정: 신산님이 네이버 쇼핑을 장기 참조로 지정하고 검색·상단 메뉴·이벤트·상품 카테고리·개인별 추천 예시를 제시한 뒤 어울몰 메인을 이 구조로 하자고 결정. 기존 승인 MVP와 장기 확장 범위를 구분한 별도 서면 초안을 작성했으며 개인화·광고·공급자·후속 입점 모델 확정은 없음
- 현재 변경: 기존 `docs/design/prototypes/`의 역할별 HTML·classic JS·공유 CSS·검사·안내문과 `docs/design/DESIGN.md`, 계획 체크리스트를 보존. 두 서면 초안 `docs/superpowers/specs/2026-09-26-category-registration-and-settlement-prototype-design.md`, `docs/superpowers/specs/2026-09-26-home-discovery-expansion-design.md` 및 `WORK_STATUS.md`만 추가·수정. 기존 문서·자료와 새 폴더의 `.github/` 삭제 없음
- 실행·검증: 클릭형 역할 모델·화면 연결·파일 연결·기존 글자 크기 검사 37통과·0실패. 기존 참고 GitHub `main` HEAD `6cc92c0`과 크기 비교 결과, 개발 원격/WSL/DB의 이전 읽기 전용 확인은 유지. 실제 브라우저 시각/인쇄 PDF·반응형·키보드·200% 확대 검증, 제품 코드/외부 연동 검증 없음
- 오류와 조치: 브라우저 로컬 `file://` 접근 정책 차단(이번 수정 검증에서도 재확인, 우회하지 않음); 제한된 셸의 SSH 설정 접근 거부 1회(권한 범위 내 읽기 전용 재확인으로 원인 구분, 설정 변경 없음)
- 미검증·승인 경계: 실제 브라우저 렌더링·버튼 동작·인쇄/PDF 저장·모바일·키보드·200% 확대, 클릭형 시안 최종 승인, 개발 Git 기준선·WSL checkout·공통 포트, project root `AGENTS.md`, 외부 공급자/Oracle 인수 환경, schema·인증·Secret·비용, 출고 후 환불 법률·약관
- 정확한 다음 조치: 신산님이 메인 화면 구조와 분류·등록·정산 서면 설계 초안의 수정 또는 승인 여부 결정. 승인 뒤 구현 계획과 추가 기능의 초기 출시 포함 범위를 별도 검토. 기존 세 HTML 최종 검토와 최초 Git 기준선·공통 포트·환경 게이트도 미완료이므로 S1 착수 전 별도 확인

## 2026-09-26 메인 화면 탐색·장기 확장 설계 초안

- 단계·담당: 홈 정보 구조 서면 설계 / 어울
- 상태: 신산님이 제시한 검색창·상단 메뉴·이벤트 카드·상품 카테고리·개인별 추천 예시를 어울몰 홈의 순서 있는 다섯 영역으로 해석해 초안 작성. 이어서 재지정한 `D:\Project\shoppingmall`의 구매자·판매자·운영자 HTML/JS/CSS를 읽기 전용으로 대조하고 재활용/제외 범위를 6절에 추가. 네이버 서비스·이미지 복제는 제외하고 어울몰 브랜드/거래 규칙 유지. 서면 초안 자체의 신산님 검토·승인은 아직 없음
- 변경 파일: `docs/superpowers/specs/2026-09-26-home-discovery-expansion-design.md`, `WORK_STATUS.md`, 대화 내 홈 화면 시각화 원본; 기존 역할 시안 HTML/JS·제품 코드·DB·환경 미수정
- 범위 경계: 초기 공통 편집 추천과 후속 개인화/광고를 구분. 상품 분류와 이벤트/서비스 바로가기는 별개. 관리자 메뉴 편집 범위·이벤트 할인 연결은 질문 답변 전 미확정. 네이버 홈 직접 열람은 웹 접근 제한으로 수행하지 못했으며 신산님이 제공한 화면 예시와 공식 안내를 참고
- 검증·오류: 문서 링크·범위·모순 정적 자체 검토, 시각화 스크립트 구문 검사 수행. 실제 브라우저 렌더링/추천 품질·개인정보 검증 없음. 이번 문서 작성 중 실행 오류 0건. Git 무커밋 `master`·원격 미설정 상태로 커밋·push 없음. 기존 `D:\Project\shoppingmall`의 dirty/untracked 자료 보존
- 다음 조치: 신산님 서면 초안 검토 후 수정 또는 승인. 그 전 홈 시안 교체·구현 계획 착수 없음

## 2026-09-26 분류·등록·정산 및 운영 요구 설계 초안

- 단계·담당: 클릭형 시안 확장 서면 설계 / 어울
- 상태: 신산님이 분류·등록·정산 흐름 및 설계 문서 작성을 승인. 제공한 기능·관제·외부 연동·역할 여정·인프라 목록을 기존 PRD/DESIGN/WORK_PLAN/기술 방향에 대조하여 초안에 구분 기록. 서면 초안 자체의 검토·승인은 아직 없음
- 변경 파일: `docs/superpowers/specs/2026-09-26-category-registration-and-settlement-prototype-design.md`, `WORK_STATUS.md`. 제품/시안 HTML·JS·DB·설정 미수정
- 판정 근거: 권한·검색·장바구니·콜백·운송장·리뷰·감사 이력·S3 호환 이미지 저장소·PostgreSQL 검색은 기존 범위에 상당 부분 포함. 카테고리/판매자 분류, 상세 편집, 판매자 공지·클레임, 운영 KPI·경보/제어와 후보 연동은 구체화 또는 별도 승인 필요. 알려진 기본 운영자 PIN `0000`은 채택하지 않고 민감 조치 재인증 제안
- 검증: 기존 시안 자동 검사 37통과는 이전 코드 증거이며 이번 문서 수정 후 제품 시험을 새로 실행하지 않음. 문서 링크·미결정/범위 문구 정적 검토만 수행. 실제 브라우저·외부 연동·SLA 실측·PDF 출력 미검증
- 오류 횟수·조치: 이번 문서 단계 실행 오류 0건. Git은 무커밋 `master`/remote 미설정으로 기존 미추적 자료 보존; 커밋·push 없음
- 다음 조치: 신산님이 초안에서 시안에 넣을 범위와 후속 제품/운영 후보의 우선순위를 검토. 서면 설계 승인 전 구현 계획·시안 코드 변경 없음

## 2026-09-26 클릭형 제작 착수·작업공간 판정

- 단계: 클릭형 시안 계획 Task 1 시작
- 담당: 어울
- 상태: 신산님이 4개 Task 계획과 직접 순차 제작 승인. 기존 `D:\Project\shoppingmall2`은 Git 일반 checkout의 무커밋 `master`이고 모든 문서가 미추적이라 worktree 분리 불가. PMO·계획의 시안 단계 예외에 따라 현재 문서 작업공간에서만 작업하고 커밋·push하지 않음
- 사전 검사: `node --test docs/design/assets/typography.test.cjs` 3통과·0실패. Node 패키지 설치 파일·기존 `docs/design/prototypes/` 없음
- 사전 인터페이스 대조: Task 2·3은 Task 1 고객 상태를 import하지 않으며 `shared.css`만 소비. Task 4는 Task 1~3의 HTML 진입점과 각 역할 모듈을 검사. 동일 JS 상태 모델 공유 없음
- 결정 기록: 현재 무커밋 저장소에서 실행 계획용 worktree·Git 기반 ledger 스크립트는 사용할 수 없으므로 `WORK_STATUS.md`를 단계별 지속 기록으로 사용. 잘못되면 최초 Git 기준선 구성 시 과거 시안 자료의 출처 분리가 어려워질 수 있어 커밋/원격 전송은 별도 게이트까지 보류
- 미검증: 클릭형 코드·브라우저, Git 초기 기준선
- 다음 조치: Task 1 고객 시안 테스트를 먼저 작성하고 RED 확인

## 2026-09-26 Task 1 스크립트 형식 조정 결정

- 단계: 고객 클릭형 시안 제작 중
- 담당: 어울
- 상태: 고객 모델 검사 5개는 RED(기능 없음)→GREEN(5통과), 기존 폰트 검사 3통과 확인. 브라우저 `file://`에서 별도 서버 없이 열 시안에 ES module 로딩 의존성이 남을 위험을 발견
- 결정 기록: 설계의 "서버 없이 검토" 조건을 우선해 역할별 브라우저 스크립트를 classic `.js`로 작성하고 Node 검사는 CommonJS export를 사용한다. 기존 계획의 `.mjs` 역할 구현 파일 표기에서 벗어나지만 역할 독립·무저장소·가상 상태 계약은 그대로 유지. 판단이 틀리면 파일 URL 실행 환경별 차이를 다시 검증해야 한다
- 변경 파일: `docs/design/prototypes/customer.test.mjs`, `customer.html`, 고객 스크립트(전환 중), `WORK_STATUS.md`
- 미검증: 실제 브라우저 파일 열기·상호작용, 반응형
- 다음 조치: 일반 브라우저 스크립트 파싱 검사를 RED로 확인한 뒤 고객 구현을 classic 형식으로 전환

## 2026-09-26 Task 1 고객 클릭형 시안 정적 검사 완료

- 단계: 계획 Task 1 / 다음 Task 2
- 담당: 어울
- 상태: `customer.html`, `customer.js`, `shared.css` 작성. 브라우저 classic 스크립트로 동작하도록 계획의 ES module 구현 형식을 조정; 3발송 주문/통합 모의 결제/품절/실패/출고 전 취소 예시 포함
- 변경 파일: `docs/design/prototypes/customer.html`, `customer.js`, `customer.test.mjs`, `shared.css`, 계획 체크리스트, `WORK_STATUS.md`
- 테스트: 기능 부재 RED 5실패, classic 스크립트 형식 RED 6실패 확인 후 `node --test docs/design/prototypes/customer.test.mjs docs/design/assets/typography.test.cjs` 9통과·0실패; `node --check docs/design/prototypes/customer.js` 통과
- 미검증: 실제 브라우저에서 파일 열기·버튼 동작·반응형·접근성. 정적·모델 검사 통과를 브라우저 PASS로 표시하지 않음
- 다음 조치: Task 2 판매자 상태 테스트 RED부터 진행

## 2026-09-26 Task 2 판매자 클릭형 시안 정적 검사 완료

- 단계: 계획 Task 2 / 다음 Task 3
- 담당: 어울
- 상태: `seller.html`, `seller.js` 작성. 농가 A 담당 정책 요청·품절/재판매 승인 대기·출고 예시를 독립 표시
- 변경 파일: `docs/design/prototypes/seller.html`, `seller.js`, `seller.test.mjs`, 계획 체크리스트, `WORK_STATUS.md`
- 테스트: 기능 부재 RED 5실패 확인 후 `node --test docs/design/prototypes/seller.test.mjs docs/design/prototypes/customer.test.mjs` 11통과·0실패; `node --check docs/design/prototypes/seller.js` 통과
- 미검증: 실제 브라우저 파일 열기·상호작용·반응형·접근성. 관리자 시안과 실제 상태 공유 없음
- 다음 조치: Task 3 관리자 상태 테스트 RED부터 진행

## 2026-09-26 Task 3 관리자 클릭형 시안 정적 검사 완료

- 단계: 계획 Task 3 / 다음 Task 4
- 담당: 어울
- 상태: `admin.html`, `admin.js` 작성. 관리자 승인·반려 이력, 출고 전 배송비 포함 가상 환불, 발생일 기준 농가별 정산 자료·기간 완료를 독립 표시
- 변경 파일: `docs/design/prototypes/admin.html`, `admin.js`, `admin.test.mjs`, 계획 체크리스트, `WORK_STATUS.md`
- 테스트: 기능 부재 RED 5실패 확인 후 `node --test docs/design/prototypes/admin.test.mjs docs/design/prototypes/seller.test.mjs docs/design/prototypes/customer.test.mjs` 16통과·0실패; `node --check docs/design/prototypes/admin.js` 통과
- 오류 횟수: 예상한 테스트 RED 5건 외 실행 오류 0건
- 미검증: 실제 브라우저 파일 열기·상호작용·반응형·접근성. 세 역할의 실제 상태·권한은 연결되지 않음
- 다음 조치: Task 4 연결 검사와 안내문을 작성한 뒤 전체 정적·모델 검사를 실행하고 시안 검토를 요청

## 2026-09-26 Task 4 역할별 시안 연결·검토 인계

- 단계: 계획 Task 4 / 신산님 화면 검토 대기
- 담당: 어울
- 상태: 고객·판매자·관리자 HTML 진입점과 안내문을 연결. 세 시안은 독립 메모리 상태이며 실제 결제·계정·서버·DB·환불·송금·발송은 없음. 빈/부분 장바구니의 발송 주문 수가 고정 3개로 보이던 고객 제목을 현재 수로 변경하고, 판매자 초기화 시 운송장 입력값도 복원
- 변경 파일: `docs/design/prototypes/README.md`, `prototype-shell.test.mjs`, `customer.html`, `customer.js`, `seller.js`, `docs/design/DESIGN.md`, `docs/superpowers/plans/2026-09-26-role-prototypes.md`, `WORK_STATUS.md`
- 테스트: 연결 검사 RED 1실패(안내문 누락), 문구 누락으로 1실패 후 수정. 전체 `node --test docs/design/prototypes/customer.test.mjs docs/design/prototypes/seller.test.mjs docs/design/prototypes/admin.test.mjs docs/design/prototypes/prototype-shell.test.mjs docs/design/assets/typography.test.cjs` 24통과·0실패. 세 역할 JS `node --check` 결과 구문 오류 없음
- 오류 횟수: 예상된 RED 1건, 안내문 검사의 후속 실패 1건(수정 후 재실행 통과); 브라우저 정책 차단은 이전 기록 1건이며 이번 단계에서 우회·재시험하지 않음
- 미검증: 실제 브라우저 파일 열기·버튼 동작, 1920×1080/1440×900/430×844, 200% 확대, 키보드·focus·스크린리더, 실제 역할/권한·결제·서버·DB·연동. 정적 연결 검사는 브라우저 동작 검사가 아님
- 승인 경계: 시안 최종 승인 전. Git 최초 기준선이 없어 커밋·push·PR·WSL/Oracle 배포 없음
- 다음 조치: [고객](docs/design/prototypes/customer.html)·[판매자](docs/design/prototypes/seller.html)·[관리자](docs/design/prototypes/admin.html) 시안을 신산님이 검토하고 수정 의견 또는 승인 결정. 실제 브라우저 확인은 사용 가능한 환경에서 별도 수행

## 2026-09-26 클릭형 시안 수량·전체 정산 출력 보완

- 단계: 신산님 시안 검토 의견 반영 / 수정 시안 재검토 대기
- 담당: 어울
- 상태: 신산님이 요청한 고객 상품 수량 입력·장바구니 수량 수정/상품 제거·단가×수량 계산, 판매자 재고 수량 직접 입력, 관리자 농가별/전체 기간 조회와 브라우저 인쇄 창의 PDF 저장·프린터 출력을 반영. 상품 고추 예시 할인은 1개당 5,000원; 농가별/전체 조회는 가능하되 완료는 농가별만 가능. 실제 PDF 직접 생성·자동 다운로드는 하지 않음
- 변경 파일: `docs/design/prototypes/customer.js`, `customer.test.mjs`, `seller.js`, `seller.html`, `seller.test.mjs`, `admin.js`, `admin.html`, `admin.test.mjs`, `shared.css`, `README.md`, `docs/design/DESIGN.md`, `WORK_STATUS.md`
- 테스트: 기존 기준 24통과·0실패. 기능 부재 RED 9건, 화면 연결 RED, 빈 판매자 재고 입력 오류 RED를 확인하고 수정. 금액 테스트의 기대값 131,000원은 무료배송 적용을 빠뜨린 계산 오류였으며 128,000원으로 정정. 전체 Node 검사 37통과·0실패. 테스트는 실제 결제·재고·정산/인쇄를 수행하지 않는 메모리 모델과 가짜 DOM 연결 검사
- 오류 횟수: 의도한 테스트 RED와 예상값 정정 외 구현 중 실행 오류 0건; 실제 앱 브라우저 `file://` 자동 조작은 URL 보안 정책으로 차단되었고 다른 경로나 브라우저로 우회하지 않음
- 미검증: 실제 브라우저 버튼·화면·인쇄 창·PDF 저장 결과, 프린터 출력, 모바일/200% 확대/키보드·focus. 실제 결제·DB·서버·권한·재고 반영도 시안 범위 밖
- 승인 경계: 시안 수정안은 신산님이 채팅에서 승인했으나 수정 후 최종 시안 승인은 아직 없음. Git 무커밋 `master`/원격 미설정 상태 유지, 커밋·push·WSL/Oracle 배포 없음
- 다음 조치: 신산님이 세 HTML을 새로고침해 수량·정산 조회/인쇄 흐름을 확인하고 수정 의견 또는 최종 승인 결정

## 2026-09-26 클릭형 설계 승인·구현 계획 초안

- 단계: 클릭형 화면 시안 제작 계획 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 `docs/superpowers/specs/2026-09-26-clickable-prototype-design.md` 승인. 역할별 시안 제작을 4개 검증 가능한 Task로 분해한 계획은 검토 대기
- 변경 파일: `docs/superpowers/specs/2026-09-26-clickable-prototype-design.md`(승인 상태), `docs/superpowers/plans/2026-09-26-role-prototypes.md`, `docs/design/DESIGN.md`, `docs/design/assets/README.md`, `WORK_STATUS.md`
- 검증: 설계의 고객·판매자·관리자 독립 흐름, 가상/실제 경계, 테스트·브라우저 미검증, Git 무커밋 상태를 계획 Task와 대조. 실행 시험 없음
- 오류 횟수: 0
- 다음 조치: 신산님이 계획 내용과 실행 방식을 검토·승인. 승인 전 클릭형 코드 작성·커밋·push 없음

## 2026-09-26 작업 폴더 변경

- 단계: 로컬 문서 작업공간 이전 (제품 구현 전)
- 담당: 어울
- 상태: 신산님 지시로 작업 정본을 `D:\Project\shoppingmall2`로 변경. 이전 OneDrive 원본은 삭제하지 않고 보존
- 사전 상태: 대상 폴더에는 Git 저장소 없이 기존 `.github/pr-broker-gate.sh`, `.github/workflows/ssh-pr-bridge.yml`만 있었으며 원본의 `.git`, `docs`, `WORK_STATUS.md`와 이름 충돌 없음
- 수행: 원본의 `.git`, `docs`, `WORK_STATUS.md`를 대상 폴더로 복사. 원본과 대상의 복사 파일 251개 SHA-256 대조에서 누락 0·불일치 0. 대상의 기존 `.github` 두 파일 SHA-256은 복사 전후 동일
- Git: 대상 폴더에서 `git rev-parse --show-toplevel` 결과 `D:/Project/shoppingmall2`; 무커밋 `master`, remote 미설정, `.github/`·`docs/`·`WORK_STATUS.md` 미추적. 최초 기준선·branch/worktree는 구성하지 않음
- 변경 파일: `docs/DEVELOPMENT_ENVIRONMENT.md`, `WORK_STATUS.md`(새 작업 폴더에서 현재 경로 갱신)
- 미검증: 대상 `.github` 설정의 적용 적합성, 실제 브라우저 화면, 클릭형 시안·개발환경 게이트
- 다음 조치: 이후 문서·시안 작업은 새 경로에서만 수행. 신산님이 클릭형 설계 문서를 검토하고 승인 또는 수정 요청

## 2026-09-26 정적 시안 승인·클릭형 독립 구성 결정

- 단계: 화면 시안 승인 및 클릭형 설계 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 글자 크기를 조정한 정적 4화면 전체를 승인하고, 고객·판매자·관리자 클릭 시안을 역할별로 독립시키기로 결정. 구체 설계 문서는 별도 검토 대기
- 변경 파일: `docs/superpowers/specs/2026-09-26-clickable-prototype-design.md`, `docs/design/DESIGN.md`, `docs/design/assets/README.md`, `docs/design/assets/home-v1.html`(오래된 검토 전 표기만 정정), `WORK_STATUS.md`
- 검증: 승인된 PRD R01~R10·현재 정적 화면과 설계 초안의 구매/승인/환불/정산 범위를 대조. 실제 클릭형 코드·브라우저 시험 없음
- 미검증·승인 경계: 클릭형 설계 문서 검토·구현 계획·시안 제작, 실제 시각/키보드/반응형 검증, 최초 Git 기준선. 무커밋 `master`이므로 문서 커밋은 하지 않음
- 다음 조치: 신산님이 설계 초안을 검토·승인 또는 수정 요청. 승인 후 세부 구현 계획 작성

## 2026-09-26 참고 시안 글자 크기 반영

- 단계: 정적 화면 시안 수정 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 폰트 종류가 아닌 크기를 참조하도록 명확히 지시하고 적용안을 승인. 서체·색상·배치 변경 없이 공유 CSS의 본문/제목/상품명/가격과 보조 UI 크기를 조정
- 참조: `cyhuh7950/owoolmall` 원격 `main` HEAD와 로컬 HEAD가 동일한 `6cc92c0`. 참고 로컬의 기존 미커밋·미추적 자료는 수정하지 않음
- 변경 파일: `docs/design/assets/owool-static-v1.css`, `docs/design/assets/typography.test.cjs`, `docs/design/assets/README.md`, `docs/design/DESIGN.md`, `WORK_STATUS.md`
- 검증: `node --test docs/design/assets/typography.test.cjs`의 변경 전 2실패·1통과를 확인, 변경 후 3통과. 실제 브라우저 렌더링·반응형·폰트 fallback·접근성은 미검증
- 오류 횟수: 0 (예상된 테스트 RED 제외)
- 다음 조치: 신산님이 크기를 조정한 4개 정적 시안을 검토하고 승인 또는 수정 의견 제시. 클릭형 시안은 정적 승인 후 제작

## 2026-09-26 정적 시안 v1·환경 읽기 전용 조사

- 단계: 화면 시안 검토 준비·개발환경 착수 조건 확인 (제품 구현 전)
- 담당: 어울(시안·통합), 읽기 전용 병렬 조사자(환경)
- 상태: 고객 홈·결제 확인·판매자·관리자 정적 시안을 제작했으나 사용자 검토/승인 전. PMO 절차상 클릭형 시안은 아직 제작하지 않음. 환경은 DB 접속 가능, Git 기준선/WSL checkout 미준비
- 변경 파일: `docs/design/assets/owool-static-v1.css`, `home-v1.html`, `checkout-v1.html`, `seller-v1.html`, `admin-v1.html`, `README.md`, `docs/design/DESIGN.md`, `docs/DEVELOPMENT_ENVIRONMENT.md`, `WORK_STATUS.md`
- 검증: 네 HTML·CSS의 정적 문구/파일 경로 및 가상 결제 합계 확인; 제한된 셸 SSH 별칭 실패 원인을 설정 파일 접근 제한으로 확인하고 승인된 읽기 전용 SSH·Git 재시험 성공. WSL DB 조회 `shoppingmall`, checkout 없음, 원격 ref 없음
- 오류 횟수: 브라우저 파일 URL 보안 차단 1회, 제한 셸 SSH 설정 접근 거부 1회. 각 원인을 구분했으며 브라우저 정책 우회·SSH 설정 변경 없음
- 미검증: 화면 시각/반응형/접근성, 클릭형 흐름, S1~S8 실제 코드/DB/브라우저 테스트, 공통 포트 확정, 초기 Git 기준선, Oracle/PG 실연동
- 다음 조치: 사용자 정적 시안 검토 → 클릭형 제작·검토; 독립적으로 Git/포트/QA/Secret 환경 게이트 결정 및 기록

## 2026-09-26 설계서·개발 작업계획서 승인 기록

- 단계: 문서 승인 및 착수 전 조건 정리
- 담당: 어울
- 상태: 신산님이 직전 제시한 DESIGN·WORK_PLAN 초안을 `승인해`라고 승인. 범위·기술·Stage 순서 승인으로 기록하되, 아직 없는 화면 시안·미정 정책·외부 계약·Git 초기 기준선·환경 검증까지 승인한 것으로 확대하지 않음
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `docs/design/DESIGN.md`, `docs/WORK_PLAN.md`, `WORK_STATUS.md`
- 검증: 승인 요청 대상 두 문서와 승인 응답의 연결 확인, 실제 Git 무커밋·원격 미설정 상태 확인. 코드/DB/브라우저/외부 연동 시험 없음
- 오류 횟수: 0
- 미검증: 정적/클릭형 시안, 개발환경 게이트, Stage별 DB·인증·Secret·비용 승인, PG/Oracle/앱 실연동
- 다음 조치: 디자인 시안 검토와 환경 준비를 구분해 진행. S1 구현은 모든 착수 조건 충족 후 시작

## 2026-09-26 DESIGN·개발 작업계획 초안 작성

- 단계: 서면 설계·개발 계획 수립 (제품 구현 전)
- 담당: 어울
- 상태: 승인된 PRD·기술 방향을 요구 ID와 8개 개발 Stage로 나눔. 설치·Oracle 인수/배포는 개발 계획 밖에 둠
- 변경 파일: `docs/design/DESIGN.md`, `docs/WORK_PLAN.md`, `WORK_STATUS.md`
- 검증: PRD 범위와 역할·주문·정산·앱·보안·시안/환경 경계를 대조; 제품 코드/DB/브라우저 시험 없음
- 오류 횟수: 0
- 미검증: 계획 문서 신산님 검토, 실제 파일·인터페이스·테스트 명령(구현 전 고정), 환경 준비
- 다음 조치: 초안의 승인 또는 수정 의견 요청. 그 전에는 제품 구현·초기 commit·push·WSL checkout/배포 없음

## 2026-09-26 PRD·기술 초안 전체 승인 검토

- 단계: 설계 승인 전 범위·문서 정합성 검토 (제품 구현 전)
- 담당: 어울
- 상태: 현행 PRD와 기술 초안, 개발환경 문서 및 최신 직접 결정을 대조. 정산의 '계산' 표현이 최종 지급액 자동 산정으로 오해되지 않도록 초기 출시·시험 문구를 명확히 함. 문서 전체 승인 여부는 신산님 판단 대기
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 문서 내부 역할·주문 분리·통합 결제·환불·정산·개발/인수 환경 경계 대조; 주요 기술 후보의 공식 문서 확인. 제품 코드·실제 PG·외부 로그인·앱 빌드·배포 시험 없음
- 오류 횟수: 0
- 미검증: 출고 후 환불의 법률·약관, 실제 외부 연동·Oracle 환경·앱 빌드, 상세 화면 시안, 승인된 개발 작업계획과 개발환경 gate
- 다음 조치: 신산님에게 전체 범위와 기술 방향의 승인 여부를 요청. 승인 후 개발 작업계획 초안을 작성·검토하고 별도 계획 승인 전에는 구현하지 않음

## 2026-09-26 기존 론칭판 문서 선별 대조

- 단계: 현행 PRD의 참고 자료 선별 보완 (제품 구현 전)
- 담당: 어울
- 상태: 기존 설계서·작업계획서의 화면 운영·보안·복구 검증 항목 중 현행 역할·거래 구조와 충돌하지 않는 부분만 PRD 초안에 추가. 기존 완료 주장·고정 일정·기술/배포 가정은 미승계
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `WORK_STATUS.md`
- 검증: 신산님 최신 결정, 현행 PRD, 두 기존 문서의 요구·권한·환경 문구를 대조. 제품 코드·브라우저·DB·배포 테스트 없음
- 오류 횟수: 0
- 미검증: 상세 화면 시안, 이미지 제한값·검사 방식, 실제 백업/복원/복귀, PG·Oracle·외부 계정 연동 및 사용자 인수
- 다음 조치: 신산님이 선별 반영 항목과 현행 설계 초안을 검토. 승인된 설계·작업계획 및 개발환경 gate 전 구현·push·배포 없음

## 2026-09-26 잔여 설계 권장안 일괄 채택

- 단계: PRD·기술·인수 시나리오 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 제시한 11개 잔여 질문의 권장안을 모두 채택. 동일 농가 완료 정산 기간 중복 금지, 어울몰 발송 농가 생산품의 생산 농가 정산 근거 유지, 출고 전 일부 취소 시 새 배송비 미부과, 통합 할인 비례 배분, 출고 오류 이력 정정, 재고 증가·품절 해제 승인, 마감 후 다음 출고 가능일 안내, 가상 QA 값, 출고 후 환불 사유별 법률 검토, 임시 시안·핵심 인수 시나리오, 변경 가능한 시험 응답 기한을 반영
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `docs/DEVELOPMENT_ENVIRONMENT.md`, `WORK_STATUS.md`
- 검증: 신산님 최신 지시와 11개 권장안·현행 설계 문구 대조; 제품 코드·DB·브라우저·외부 연동 테스트 없음
- 오류 횟수: 1회(기존 문구가 이미 변경되어 보완 patch 문맥 불일치; 실제 문구 확인 후 필요한 참고 문서만 수정)
- 미검증: 출고 후 환불·반송비의 법률·약관 적합성, 실제 PG 부분 환불, 실가격·배송사·브랜드·Oracle·외부 로그인/문자/메일/앱 빌드와 사용자 인수
- 다음 조치: 신산님이 PRD·기술 초안을 검토하고 범위·시안·개발 작업계획 승인 여부를 결정. 승인 전 제품 구현·원격 push·WSL 배포 없음

## 2026-09-26 농가별 정산 완료 개별 표시 확정

- 단계: 정산 완료 단위 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 선택 기간의 정산 완료를 농가별로 개별 표시하도록 결정. 한 농가의 완료가 다른 농가의 완료 상태를 바꾸지 않음
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 정산 완료 단위·인수 시나리오 문구 대조; 제품 코드·DB·브라우저 테스트 없음
- 오류 횟수: 0
- 미결정: 동일 농가에 완료 기간과 겹치는 새 기간을 선택했을 때의 처리
- 다음 조치: 완료된 기간과 겹치는 기간의 중복 정산 허용 여부를 한 질문으로 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 관리자 선택 기간별 농가 정산 확정

- 단계: 정산 기간 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 매월 고정 기간 대신 관리자가 시작일·종료일을 선택해 농가별 항목 합계를 조회하고 정산 완료를 기록하는 방식을 선택
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 정산 기간·인수 시나리오 문구 대조; 제품 코드·DB·브라우저 테스트 없음
- 오류 횟수: 0
- 미결정: 완료 대상 농가의 묶음 방식, 동일 농가 기간 중복 처리 기준
- 다음 조치: 정산 완료 처리 대상을 농가별로 할지 전체 농가 일괄로 할지 한 질문으로 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 동일인의 판매자 요청·관리자 승인 이력 분리

- 단계: 승인 권한·감사 이력 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 동일 담당자의 판매자 요청과 관리자 승인을 별도 권한·이력으로 기록하는 방식을 선택. 요청만으로 자동 승인하지 않고, 각 역할로 별도 행위를 수행해야 고객 화면에 반영
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 역할·승인·인수 시나리오 문구 대조; 제품 코드·감사 로그·브라우저 테스트 없음
- 오류 횟수: 0
- 미검증: 실제 역할 전환·요청·승인 권한과 감사 기록
- 다음 조치: 남은 출고 후 환불 기준, 정산 기간 등 업무 규칙을 하나씩 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 실제 출고·운송장 즉시 고객 공개 예외 확정

- 단계: 판매자 승인 흐름·배송 안내 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 신산님의 '권장대로'를 앞서 제안한 실제 출고·운송장 즉시 고객 표시 예외 승인으로 해석. 농가·어울몰 판매자 모두 담당 주문에 동일 절차 적용. 그 밖의 판매자 제안은 관리자 승인 후 고객 공개
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 지시와 출고·고객 공개·인수 시나리오 문구 대조; 제품 코드·브라우저 테스트 없음
- 오류 횟수: 0
- 미결정: 출고 입력 오류·지연 시 고객 취소 안내의 예외 처리, 동일인이 판매자 제안을 관리자 역할로 승인할 수 있는지
- 다음 조치: 동일인의 판매자 요청·관리자 승인 허용 여부를 한 질문으로 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 어울몰·농가 판매자 동일 절차와 관리자 정산 책임

- 단계: 역할·업무 책임 설계 정정 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 실제 어울몰 판매자와 관리자가 동일인이어도 시스템에서는 다른 역할처럼 취급하고, 어울몰 판매자는 농가 판매자와 동일한 판매자 처리를 수행한다고 명시. 농가 정산 완료 기록의 주체는 관리자임을 명시
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 역할·출고·정산 문구 대조; 제품 코드·권한·브라우저 테스트 없음
- 오류 횟수: 0
- 미결정: 같은 실제 사람이 판매자 제안을 관리자 역할로 승인할 수 있는지, 실제 출고와 고객 공개 사이의 취소 가능 상태
- 다음 조치: 동일인의 판매자 요청·관리자 승인 허용 여부를 한 질문으로 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 판매자 역할 단일화 정정

- 단계: 역할 모델 설계 정정 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 역할은 고객·판매자·관리자 세 가지이며 농가와 어울몰은 동일한 판매자라고 명시. 앞서 두 판매자를 별도 역할로 적은 현행 PRD·기술·참고 대조 문구를 정정하고, 담당 상품·주문 범위만 구분
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 현행 역할 정의 문구 대조; 제품 코드·권한 테스트 없음
- 오류 횟수: 0
- 미검증: 판매자별 담당 범위의 실제 접근 통제, 상세 편집 권한
- 다음 조치: 판매자 공통 업무와 담당 범위의 미결정 항목을 하나씩 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 어울몰 판매자의 포장·출고·운송장 업무 확정

- 단계: 판매자·배송 업무 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 어울몰 발송 주문의 포장·출고 처리와 운송장 입력을 어울몰 판매자 업무로 확정. 고객 화면 공개는 기존 관리자 승인 원칙에 따라 구분
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 역할·배송 조회 문구 대조; 제품 코드·브라우저 테스트 없음
- 오류 횟수: 0
- 미결정: 실제 출고와 고객 공개 사이의 배송 안내 및 취소 가능 상태, 농가 판매자의 출고·운송장 업무 범위
- 다음 조치: 실제 출고 정보의 고객 공개 승인 대기 범위를 한 질문으로 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 어울몰 판매자의 발송 상품 재고 직접 관리

- 단계: 판매자 권한 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 어울몰 판매자의 어울몰 발송 상품 재고 직접 관리를 확정. 농가 직접 발송 상품은 해당 농가 판매자가 관리하는 역할 구분을 유지
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 역할·재고·인수 시나리오 문구 대조; 제품 코드·권한·브라우저 테스트 없음
- 오류 횟수: 0
- 미검증: 실제 역할별 재고 변경 통제와 재고 0개 즉시 구매 차단
- 다음 조치: 어울몰 판매자의 나머지 업무 권한을 한 항목씩 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 품절·재고 0개 즉시 구매 차단 확정

- 단계: 판매 승인 흐름 예외 설계 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 재고 0개·품절 상황에서 관리자 승인까지 구매를 계속 허용하지 않기로 결정. 해당 상품·옵션 구매는 즉시 차단하고 고객에게 판매 불가로 표시; 판매자의 다른 고객 화면 변경은 관리자 승인 후 공개
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 PRD·기술 초안·참고 시나리오 문구 대조; 실제 재고 동시성·주문·브라우저 시험 없음
- 오류 횟수: 0
- 미검증: 실제 재고 0개 전환과 결제 직전 검증, 어울몰 판매자의 상세 편집 권한
- 다음 조치: 판매자—어울몰의 업무·편집 권한을 한 항목씩 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 판매자 제안의 관리자 승인 후 고객 공개 원칙

- 단계: 역할·승인 흐름 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 농가·어울몰 판매자의 고객 화면 반영 제안은 관리자 승인 후에만 공개. 승인 전에는 기존 승인 내용 유지. 기본 배송비·무료배송 기준 변경도 동일 원칙 적용
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 PRD·기술 초안·참고 시나리오 문구 대조; 제품 코드·브라우저 테스트 없음
- 오류 횟수: 0
- 미결정: 재고 소진·품절의 즉시 판매 차단도 관리자 승인을 기다릴지 여부, 어울몰 판매자의 상세 편집 권한
- 다음 조치: 품절·판매 차단의 승인 대기 예외를 한 질문으로 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 고객·판매자·관리자 역할 분리와 농가 배송비 승인

- 단계: 역할·배송 정책 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 고객, 판매자—농가, 판매자—어울몰, 관리자를 별도 역할로 기록. 기존 '농가관리자'는 농가 판매자, '전체 관리자'는 관리자에 대응. 어울몰 판매자 세부 권한은 아직 미정. 농가 판매자의 자기 농가 기본 배송비 변경 요청도 관리자 승인 후 적용하며 승인 전에는 기존 기준 유지
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `WORK_STATUS.md`
- 검증: 신산님 최신 지시와 역할·배송비 문구 대조; 제품 코드·권한·브라우저 테스트 없음
- 오류 횟수: 0
- 미검증: 역할별 실제 접근 통제, 배송비 변경 승인 흐름, 어울몰 판매자 상세 권한
- 다음 조치: 어울몰 판매자의 업무·편집 권한을 한 항목씩 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 농가 무료배송 기준 변경 승인 절차 확정

- 단계: 배송 설정 권한 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 농가관리자의 자기 농가 무료배송 기준 변경은 전체 관리자 승인 후 적용. 승인 전에는 기존 기준 유지, 승인 후에도 자기 농가 발송 주문에만 적용
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 배송 설정·인수 시나리오 문구 대조; 제품 코드·브라우저 테스트 없음
- 오류 횟수: 0
- 미검증: 승인 요청·승인·적용의 실제 권한 및 계산 시험
- 다음 조치: 다른 배송 설정 항목의 농가관리자 변경 승인 범위를 항목별로 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 무료배송의 할인 전 상품금액 기준 확정

- 단계: 배송 정책 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 각 발송 주문의 5만 원 무료배송 여부를 할인 적용 전 상품금액으로 판정하도록 결정. 할인 후 결제금액이 5만 원 미만이어도 할인 전 상품금액이 기준 이상이면 무료배송
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `WORK_STATUS.md`
- 검증: 신산님 최신 지시와 문서의 배송 정책·인수 시나리오 문구 대조; 제품 코드·브라우저 테스트 없음
- 오류 횟수: 0
- 미검증: 실제 할인·배송비 계산 구현과 통합 결제 시험
- 다음 조치: 남은 관리자별 설정 권한과 출고 후 환불 기준 등을 한 항목씩 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 출고 전 적법한 취소의 배송비 환불 기준 변경

- 단계: 환불 정책 설계 정정 (제품 구현 전)
- 담당: 어울
- 상태: 신산님 승인에 따라 출고 전 적법한 주문 취소는 해당 발송 주문의 상품금액과 실제 결제 배송비를 모두 환불하도록 PRD와 참고 자료 대조 문서를 정정. 통합 결제의 다른 발송 주문은 유지
- 근거: 현행 전자상거래법 제17조·제18조·제35조 대조. 배송 전 배송비 일률 미환급은 법적 위험이 있어 기존 결정을 대체
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 문서의 현행 규칙 대조; 제품 코드·PG·브라우저 테스트 없음
- 오류 횟수: 0
- 미검증: 출고 후 사유별 배송비·반송비 기준의 법률·약관 적합성, PG 부분 환불 구현 가능 범위
- 다음 조치: 출고 후 환불 세부 기준을 법률·약관 검토 후 별도로 확정; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 현행 설계 우선순위 확정

- 단계: 설계 자료 우선순위 정정 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 현재 설계가 최신이고 `D:\Project\shoppingmall` 및 `cyhuh7950/owoolmall`은 참고사항이라고 명시. PRD와 참고 자료 대조 문서의 기존 시안 승계 뉘앙스를 제거
- 추가 정리: 기존 참고 시안만 근거로 PRD에 더했던 운영 대시보드 필수 문구를 제거. 현행 PRD에 이미 있는 관리자 관리·운영 요구는 유지
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 현행 PRD·참고 대조 문구 비교; 제품 코드·브라우저 테스트 없음
- 오류 횟수: 0
- 다음 조치: 현행 PRD를 기준으로 설계·시안 검토를 진행하고 참고 자료는 필요할 때 선택적으로만 사용

## 2026-09-26 GitHub 기존 디자인 시안 확인 정정

- 단계: 설계 참고 자료 대조 (제품 구현 전)
- 담당: 어울
- 상태: 신산님 지적에 따라 `cyhuh7950/owoolmall` 원격 커밋에 3역할 HTML/CSS 화면 시안이 이미 있음을 확인. PRD의 '임시 시안' 설명을 기존 시안 참조로 정정
- 근거: 원격 `main` HEAD `6cc92c0`; 같은 커밋의 `index.html`, `seller.html`, `operator.html`, `styles.css`를 읽기 전용 확인. A/B/C 테마 전환은 로컬 미커밋 diff에만 있음
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `WORK_STATUS.md`
- 검증: Git 트리·커밋 내용과 로컬 dirty diff 비교; 브라우저 시각 검토·시안 승인·제품 코드 테스트는 미실행
- 오류 횟수: 0
- 다음 조치: 기존 원격 시안을 새 농산물 어울몰의 임시 디자인 기준으로 검토하되, 최신 역할·주문·환불·정산 결정에 맞게 변경할 부분을 설계 승인 대상으로 제시

## 2026-09-26 기존 어울몰 자료 설계 참조와 환불 기준

- 단계: 기존 자료 대조·PRD 초안 보강 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 `D:\Project\shoppingmall` 및 `cyhuh7950/owoolmall` 참조를 요청. 역할별 화면 정보구조와 업무 시나리오를 현행 PRD에 참고안으로 반영. 출고 전 취소를 포함한 환불은 상품금액만 돌려주고 배송비는 제외한다는 직접 결정을 반영
- 확인: 참고 로컬 repo `main` HEAD `6cc92c0`, 원격 SSH 별칭 `github-cyhuh7950` 조회의 `main`·HEAD도 동일. 참고 로컬의 수정·미추적 파일은 그대로 보존. 기존 정적 시안은 `localStorage`·샘플상품·고정 PIN `0000`·3.5% 정산 예시 등을 사용함을 확인
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `docs/DEVELOPMENT_ENVIRONMENT.md`, `docs/design/REFERENCE_REVIEW.md`, `WORK_STATUS.md`
- 검증: 문서·소스 읽기 전용 대조 및 최신 신산님 결정과의 충돌 분류. 제품 코드·브라우저·서버 기능 테스트는 수행하지 않음
- 오류 횟수: 최초 GitHub HTTPS·다른 별칭 조회 실패 각 1회(인증·설정 변경 없음); 제공된 `github-cyhuh7950` 별칭으로 원격 조회 성공
- 미검증: 참고 시안의 실제 브라우저 시각 품질과 기능 동작, 환불 시 배송비 미반환 정책의 법률·약관 적합성, 새 설계·시안 승인
- 다음 조치: 신산님이 참고 화면의 정보구조 채택 범위와 환불 정책의 운영 검토 경계를 확인. 승인된 DESIGN·WORK_PLAN·개발환경 gate 전 제품 구현 없음

## 2026-09-26 농가관리자 변경 범위 확인

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 농가관리자의 상품·재고·배송 설정 변경은 자기 농가 상품·주문에만 적용한다고 확인. 기존 전체 관리자 우선 원칙은 유지
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 역할·배송 권한 문구 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 역할별 정확한 편집 항목, 출고 전 취소의 배송비 처리, 할인 전후 무료배송 판정
- 다음 조치: 출고 전 주문 취소의 배송비 처리 여부를 한 질문으로 확인

## 2026-09-26 환불 시 배송비 제외

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 환불액에 배송비를 포함하지 않도록 지정. PRD 품질·배송 및 미결정 경계에 반영
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 사용자 최신 지시와 주문별 배송비·환불 요구 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 출고 전 취소에도 배송비를 환불하지 않는지, 할인 적용 전후 무료배송 판정, 농가관리자 설정 범위
- 다음 조치: 출고 전 주문 취소의 배송비 처리 기준을 한 질문으로 확인

## 2026-09-26 과거 판매·정산 후 환불의 발생 시점 기록 예시

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님 예시를 5월 1일 판매·5월 20일 정산·7월 1일 환불로 해석. 환불은 7월 1일 발생 내역에 기록하고 5월 1일 판매 주문·상품을 근거로 연결; 5월 완료 정산은 소급 수정하지 않음
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 사용자 날짜 예시와 정산 이벤트 발생 시점 원칙 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미검증: 실제 주문·환불 데이터와 통합 시험, 정산 기간 선택 방식
- 다음 조치: 환불 추적 시나리오를 설계·작업계획의 수용 기준에 포함하고 이후 실제 테스트로 검증

## 2026-09-26 운영 후 자동 정산·송금과 늦은 환불 귀속

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 초기 자동 정산·송금 제외, 일정 기간 운영 뒤 자동 정산 방식 결정 및 자동 송금 후속 개발을 지정. 완료 기간 뒤 발생한 환불은 환불 발생 시점에 기록하도록 확정
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 지시 3건을 Phase 1/후속 범위와 정산 시점 규칙에 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 초기 정산 기간 선택 방식·완료 대상 범위. 어울몰 담당자 입력은 완료 여부만으로 한정하며 최종 지급액 결정·송금은 오프라인. 후속 자동 정산·송금의 기간·연동·비용은 실제 운영 후 결정
- 다음 조치: 초기 수동 정산 흐름의 남은 입력·자료 범위를 한 항목씩 확인. 후속 자동 송금은 현재 개발·인수 전 검증 범위에 포함하지 않음

## 2026-09-26 정산 항목 발생 시점 기준 확인

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 수수료·배송비·할인·환불액을 각각의 발생 시점별로 정리하도록 명시. 일자별 조회·기간별 합계 요구와 연결해 PRD·기술 초안에 반영
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 사용자 최신 지시와 기간별 정산 요구 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 완료된 기간 이후 발생한 환불의 귀속, 오프라인 최종 지급액의 시스템 입력 여부
- 다음 조치: 완료 기간 이후 발생한 환불의 정산 귀속을 한 질문으로 확인

## 2026-09-26 농가 정산 비용 부담 판단 범위 정정

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 수수료·배송비·할인·환불액의 농가/어울몰 부담 판단과 가감 규칙은 시스템 업무범위 밖이며 오프라인에서 결정한다고 명시. PRD·기술 초안의 자동 최종 지급액 계산 해석을 제거
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 일자별·기간별 집계 요구를 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 오프라인 최종 지급액을 시스템에 입력·보관할지, 정산 기간 선택·완료 처리 대상 범위
- 다음 조치: 오프라인 결정 최종 지급액의 시스템 입력 여부를 한 질문으로 확인

## 2026-09-26 외부 연동 실제 검증 범위 결정 시점

- 단계: 제품 설계·검증 범위 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 카카오·Apple 로그인, 문자·메일, 앱 빌드 등의 실제 연동 검증 범위를 인수테스트 시점에 결정하도록 지정
- 변경 파일: `docs/TECH_STACK_PROPOSAL.md`, `docs/DEVELOPMENT_ENVIRONMENT.md`, `WORK_STATUS.md`
- 검증: 사용자 최신 지시와 기술·환경 문구 대조; 실제 Provider·앱 빌드 시험 미실행
- 오류 횟수: 문서 패치의 문맥 불일치 1회, 파일 재확인 후 범위를 좁혀 반영
- 미검증: 실제 로그인 Provider·문자·메일·앱 빌드. 모의시험 결과를 실제 연동 PASS로 표시하지 않음
- 다음 조치: 인수테스트 준비 시 실제 검증 범위·필요 계정·비용·일정을 신산님과 결정. 그 전에는 승인된 설계·계획에 따라 가능한 독립 개발·모의시험 진행

## 2026-09-26 농가 정산 일자·기간 집계 요구

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 수수료·배송비·할인·환불액을 포함한 일자별 관리와 기간별 전체 금액 정산을 지정. 농가별 일자 자료 및 기간 집계 요구를 PRD·기술 초안에 반영
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 사용자 최신 지시와 기존 정산·환불 범위 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 각 항목의 가산·차감 및 부담 주체, 일자 기준, 정산 기간 선정 방식
- 다음 조치: 수수료·배송비·할인·환불액이 모두 농가 지급액에서 차감되는지 한 질문으로 확인

## 2026-09-26 관리자 설정 우선순위 확인

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 전체 관리자 설정 우선, 전체 관리자·농가관리자 설정 권한 분리를 지시. PRD에 우선순위 반영
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 기존 관리자 권한·배송·환불 정책 문구와 사용자 최신 지시 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 관리자별 구체적인 설정 항목·적용 범위, 통합 결제 중 일부 주문 환불 방식, 무료배송 할인 전후 판정
- 다음 조치: 농가관리자의 설정 범위가 자기 농가에 한정되는지 한 질문으로 확인

## 2026-09-26 주문별 기본 배송비 확인

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 무료배송 기준 미달 발송 주문마다 기본 배송비 3,000원을 각각 부과하도록 확인
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 사용자 답변과 PRD 배송비 규칙 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 무료배송 금액의 할인 전후 판정 기준, 관리자별 배송 설정 우선순위
- 다음 조치: 쿠폰·할인 적용 전후 중 무료배송 판정 금액을 한 질문으로 확인

## 2026-09-26 무료배송 주문별 적용 확인

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 5만 원 무료배송 기준을 나뉜 발송 주문 각각의 금액에 적용하도록 선택
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 사용자 지시와 PRD 배송 정책 문구 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 기본 배송비 3,000원의 주문별 부과 방식, 할인 전후 무료배송 판정 금액, 관리자별 설정 우선순위
- 다음 조치: 무료배송 기준 미달 주문마다 기본 배송비를 부과할지 한 질문으로 확인

## 2026-09-26 시점별 완료 기록 후 시스템 정산 처리

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 어울몰 담당자가 시점별 정산 완료 여부를 기록하면 시스템이 정산 처리하도록 명시. PRD·기술 초안의 단순 완료 기록 표현을 수정
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 사용자 최신 지시와 두 문서의 정산 동작 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 완료 처리 대상 주문 범위와 정산 시점 선정 방식, 비용 부담 기준, 자료 다운로드 형식
- 다음 조치: 제안한 정산 흐름을 구체적 예로 신산님께 확인. 고정 주기 선택은 요구하지 않음

## 2026-09-26 정산 완료 여부 기록 범위 정정

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 어울몰 담당자의 정산 회차별 완료 여부 기록은 필요하다고 명시. 실제 송금은 시스템 밖에서 하며 자동 송금·이체 상세정보 관리는 제외
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 PRD·기술 초안 정산 범위를 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 정산 회차의 주기, 자료 다운로드 형식, 수수료·배송비·환불 부담 기준
- 다음 조치: 정산 회차를 어떤 주기로 묶을지 한 질문으로 확인

## 2026-09-26 농가 정산 자료 범위 정정

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 실제 송금은 어울몰 담당자가 시스템 밖에서 수행하고, 어울몰 시스템은 필요한 자료만 준비한다고 바로잡음. 앞서 임의로 포함했던 이체 완료 기록·지급 상태 관리를 현행 PRD·기술 초안에서 제외
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 사용자 최신 직접 지시와 정산 기능 범위 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 정산 자료의 제공 형태, 정산 주기·비용 부담 기준
- 다음 조치: 필요한 자료를 관리자 화면에서 조회만 할지 파일로도 내려받을지 한 질문으로 확인

## 2026-09-26 농가 정산 자동 송금 제외

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 농가 송금 자동화를 개발 범위에서 제외. 정산액 계산·확정·내역 관리와 외부 수동 이체 완료 기록을 PRD·기술 초안에 반영
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 사용자 지시와 정산 범위 문구 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 정산 주기와 비용 부담 기준, 통합 결제 주문별 배송비·무료배송 계산 단위
- 다음 조치: 정산 주기를 신산님께 한 질문으로 확인

## 2026-09-26 환불·농가 정산 책임 확인

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 고객 환불은 어울몰에서 결정·처리하고, 어울몰이 농가와 정산한다고 명시. PRD에 농가관리자의 기준 설정 권한과 어울몰의 개별 환불 결정·처리 권한을 구분해 반영
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 이전의 관리자별 환불 기준 설정 지시 및 농가 정산 요구와 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 실제 계좌 송금 자동화 여부, 환불 비용 부담 주체와 정산 조정 규칙, 농가관리자 기준 설정 범위·우선순위
- 다음 조치: 정산 모듈의 실제 계좌 송금 실행 범위를 한 질문으로 확인

## 2026-09-26 농가별 주문 분리 확인

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 서로 다른 농가의 직접 발송 상품은 농가별 주문으로 분리하도록 지정. 기존 한 번의 통합 결제 선택 유지
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 장바구니·주문·결제 규칙을 최신 직접 지시와 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 주문별 배송비·무료배송 계산 단위, 통합 결제 부분취소, 농가 정산의 실제 송금 실행 범위
- 다음 조치: 농가 정산 모듈이 실제 계좌 송금까지 실행해야 하는지 한 질문으로 확인

## 2026-09-26 농가 정산 모듈 추가 요청

- 단계: 제품 설계 범위 확장 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 어울몰→농가 금액 정산 모듈을 요청. PRD의 Phase 1과 기술 초안에 제안 요구로 반영
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 기존 주문·취소·환불·정산 관련 문구와 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 정산액 계산·확정·내역 관리만 할지, 실제 농가 계좌 송금까지 모듈이 실행할지; 주기·수수료·배송비/할인 부담 주체·권한
- 다음 조치: 실제 송금 실행 범위를 신산님께 한 질문으로 확인. PG 계약·요금 및 Oracle 환경 결정은 기존대로 인수테스트 시점에 유보

## 2026-09-26 통합 결제 선택

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 분리된 주문을 고객이 한 번에 통합 결제하도록 선택
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: PRD 주문·결제 요구와 사용자 선택 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 여러 농가의 발송 주문 분리 기준, 배송비 계산 단위, 통합 결제의 부분취소·환불 방식
- 다음 조치: 서로 다른 농가의 직접 발송 상품을 함께 살 때 주문을 농가별로 나눌지 확인

## 2026-09-26 장바구니·주문 분리 방식 선택

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 두 발송 방식의 상품을 장바구니에는 함께 담되 결제 시 주문을 나누도록 선택
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 장바구니·주문·출고 규칙을 사용자 답변과 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 분리 주문의 결제 횟수, 여러 농가의 농가 발송 상품 분리 기준, 배송비·무료배송 계산 단위
- 다음 조치: 분리 주문을 고객이 한 번에 결제할지 별도로 결제할지 한 질문으로 확인

## 2026-09-26 브랜드 자료 확인

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 현재 확정된 로고·색상 자료 없음. 신산님이 임시 시안으로 진행하도록 지정
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 사용자 답변을 PRD 원칙·미결정 사항에 반영; 시안 제작·검토는 아직 수행하지 않음
- 오류 횟수: 0
- 미결정: 실제 시안과 사용자 인수테스트 시나리오, 혼합 금지 장바구니 처리 방식
- 다음 조치: 장바구니에서 발송 방식이 다른 품목을 선택할 때의 처리 방식을 한 질문으로 확인

## 2026-09-26 발송 방식 혼합 금지 확인

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 어울몰 발송과 농가 발송은 혼합하지 않는다고 명시. 동일 주문 혼합 금지로 PRD 초안에 반영
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 사용자 지시와 PRD 문구 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 두 발송 방식의 상품을 장바구니에 함께 담을 때 차단할지, 결제 시 별도 주문으로 나눌지
- 다음 조치: 장바구니 처리 방식을 한 질문으로 확인

## 2026-09-26 사용자 운영 규칙 추가

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 사용자 역할 3종, 초기 품목 5종, 품목별 출고 방식, 재고·배송·환불 설정 권한을 직접 지정; PRD 초안에 반영
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 신산님 원문과 PRD 반영 항목 대조; 제품 코드·런타임 테스트 대상 없음
- 오류 횟수: 0
- 미결정: "혼합은 없음"의 주문 단위 의미, 관리자별 설정 범위·우선순위, 실제 옵션·가격·재고, 브랜드 자료·인수 시나리오
- 다음 조치: 화면·인수 기준의 뜻을 비개발자 관점에서 설명하고, 남은 모호성은 한 번에 하나씩 확인. 설계·작업계획 승인 전 구현하지 않음

## 2026-09-26 개발 DB 생성 전 기록

- 단계: 개발환경 지정 (구현 전)
- 담당: 어울
- 상태: 신산님의 직접 요청에 따라 개발·통합시험용 DB 준비 중
- 대상: `WSL-server` (`SINSAN`)의 정확한 `local-postgres` 컨테이너 안 `shoppingmall` 데이터베이스
- 이유: 어울몰 전용 개발·통합시험 데이터 격리
- 수명·정리: 개발과 인수 전 검증 동안 유지. 다른 DB·컨테이너는 변경하지 않으며 DB 삭제는 별도 결정 후 수행
- 사전 검증: 컨테이너 실행 확인, `shoppingmall` DB 부재 확인
- Git: 로컬 `master` 무커밋·원격 미설정; 기존 `docs/`, `WORK_STATUS.md`는 보존
- 미검증: GitHub 원격 이력, WSL checkout, 애플리케이션 연결·스키마·테스트 계정
- 다음 조치: 요청된 DB만 생성·접속 검증하고 환경 문서에 결과 기록

## 2026-09-26 개발환경 확인 결과

- 단계: 설계·개발환경 준비 (제품 구현 전)
- 담당: 어울
- 상태: `shoppingmall` DB 생성·접속 확인. 개발 착수 조건은 미충족
- 변경 파일: `WORK_STATUS.md`, `docs/DEVELOPMENT_ENVIRONMENT.md`, `docs/TECH_STACK_PROPOSAL.md`
- 검증: `WSL-server` 접속, 정확한 `local-postgres` 실행, DB `shoppingmall` 접속 결과 확인; GitHub SSH URL의 `ls-remote` 성공(조회 ref 없음); WSL 지정 checkout 경로 부재 확인
- 오류 횟수: 0
- 미검증: 앱 DB 접속·스키마·migration, WSL 통합 환경, 테스트 계정·상품·주문, PG sandbox·실연동, Oracle 환경·인수테스트
- 승인 경계: 제품 설계·개발 작업계획 승인 전 구현 없음. GitHub 초기 커밋·push, WSL checkout 구성도 아직 하지 않음
- 다음 조치: 신산님이 남은 상품·배송·교환환불 정책을 항목별로 결정할 수 있게 설명하고 PRD/기술 초안 검토 요청. 설계·작업계획을 확정한 뒤 개발환경 gate와 구현 순서를 진행

## 2026-09-26 기술 스택 초안

- 단계: 설계·기술 선택 (구현 전)
- 담당: 어울
- 상태: 신산님의 항목별 선택을 기술 초안에 반영; 문서 전체 검토 대기
- 변경 파일: `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 기술 선택 22개 핵심 표기 확인, PRD 배송 조회 요구와 대조, 상충하던 다중 PG 비교 문구 제거; 제품 코드 테스트 대상 없음
- 오류 횟수: 0
- 미검증: 외부 서비스 계약·요금·실제 연동, Oracle 서버·관리형 DB 환경, 앱 빌드, 운영 배포
- 다음 조치: 신산님이 기술 초안을 검토하고 수정 또는 승인 여부 결정. 승인해도 구현·계정 개설·배포는 별도 범위로 다룸
