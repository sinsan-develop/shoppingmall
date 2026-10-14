# S7.2 카카오 mock 인증·웹/Android 복귀 계약안

- 작성: 2026-10-14, 어울. 기준 제품 `33f042665e919d19ef7758934c55ecba716926cb`.
- 상태: **계약안 작성만 승인됨. 내용 검토·구현 승인 전**. 이 문서는 기존 DESIGN·WORK_PLAN을 수정하거나 인증/API 변경을 허용하지 않는다.
- 추적: [개발 계획 S7.2](../WORK_PLAN.md), [설계 R11·계정 경계](DESIGN.md), [남은 장애](../design_change.md).

## 1. 목적·선택안

웹과 Android에서 개발용 모의 공급자 화면을 거쳐 고객 로그인과 취소/실패·앱 복귀를 시험한다. 화면만 성공으로 바꾸지 않고 실제 HTTP→DB 고객 세션→본인 자료 조회까지 연결한다. 실제 카카오 서버·SDK 로그인과 동일하거나 호환된다고 주장하지 않는다.

권고는 **폐기 QA DB에 미리 연결한 가상 고객 + 개발 전용 mock adapter**다. 신규 가입·이메일 자동 병합·역할 부여 없이 기존 계정/세션 구조로 검증할 수 있다. 대안인 mock 화면만 제작은 인증·DB 연결을 검증하지 못하므로 채택하지 않는다. 실제 카카오 SDK부터 연결하는 대안은 공급자 계정·Secret·동의/연결 정책이 필요하므로 인수 준비로 남긴다.

이번 변경은 기존 이메일 로그인·가입/복구·역할 전환을 대체하지 않는다. Apple, 판매자/관리자 소셜 로그인, 실제 PG 복귀·원격 푸시 등록은 제외한다.

## 2. 실행·자료 보호 경계

- API 기본 `KAKAO_AUTH_MODE=disabled`. `mock`은 `APP_ENV=development`, `NODE_ENV!=production`, `API_HOST=127.0.0.1`, 실제 접속 local/remote 주소 모두 루프백, 정확한 폐기 QA DB 이름·system ID 일치에서만 활성화한다. 설정 불일치는 listener 시작 전 실패하고 실행 요청에도 재검사한다. 실제 공급자 모드는 구현하지 않으며 알 수 없는 모드는 실패 폐쇄한다.
- 보호 system ID `7622490131194466339`이면 mock 시작을 거부한다. DB URL 이름만 믿지 않는다. 허용 폐기 DB·fixture 소유 manifest를 구현 계획에서 명시하고, seed/reset 전에 식별·소유·외부 참조를 검사한다. 고정 QA/보호 DB·지속 계정을 변경하지 않는다.
- Web는 개발 빌드+명시 mock 설정, Android는 `__DEV__`+명시 mock 설정일 때만 '카카오 모의 로그인 · 개발 전용' 버튼을 표시한다. 화면 flag는 서버 허가가 아니다. 기존 이메일 로그인은 flag/모드와 무관하게 유지한다.
- QA fixture가 별도 가상 고객과 `account_identities(kind='kakao', identifier='mock:s7:<runId>:customer-a')`를 사전 준비한다. 요청 본문의 이메일/전화/계정ID로 연결 대상을 선택하지 않는다. 서버에 로드한 해당 run의 허용 profile 이름→가상 식별자 매핑만 사용한다.
- 완료 시 계정이 활성이고 기존 customer 역할이 있는지 DB에서 재확인한다. 연결 미등록·disabled·역할 없음은 거부한다. 로그인 경로에서 accounts/identities/roles를 만들거나 바꾸지 않으며 seller/admin 요청 필드는 거부한다. 이메일이 같아도 자동 병합하지 않는다.

## 3. 거래·클라이언트 증명

- 클라이언트는 매 시작마다 암호학적 난수 `state`와 `verifier`를 새로 만든다. verifier는 32바이트 난수의 base64url(43자), challenge는 `base64url(SHA256(ASCII(verifier)))`인 **S256만** 허용한다. 형식은 [RFC 7636 4.1·4.2](https://datatracker.ietf.org/doc/html/rfc7636#section-4.1)를 참조하지만 이 mock 전체가 카카오 OAuth 구현이라는 뜻은 아니다.
- Web의 state/verifier/거래ID는 해당 탭 메모리에만, Android는 현재 앱 메모리에만 둔다. 로그·URL·localStorage·AsyncStorage·공개 설정에 verifier/세션을 넣지 않는다. Web는 원래 탭을 유지하고 새 mock 창에서 돌아오도록 하며 창 차단은 오류로 안내한다. 앱/원래 탭 재시작으로 증명을 잃으면 로그인부터 다시 시작한다.
- API의 거래 registry는 프로세스 메모리, 유효기간 시작 후 5분, 전체 최대1000건이다. 시작 시 만료 항목을 정리한다. 클라이언트가 재시작할 때 보관 중인 이전 거래는 cancel 증명으로 취소하고 새 거래를 시작한다. 인증되지 않은 client 이름/주소만으로 다른 거래를 취소하지 않는다. 초과는429, 서버 재시작은 기존 거래 전부 무효다. 무제한 캐시/영속 migration은 만들지 않는다.
- registry는 거래ID·state·challenge·client종류·고정복귀주소·허용QAprofile·상태·만료시각·decisionTicket/hash·code/hash·최종소비 상태를 보관한다. 코드·decisionTicket은 32바이트 난수이며 저장은 hash, 복귀코드는 발급 후60초/거래 만료 중 빠른 시각까지 유효하다.
- 상태는 `STARTED→APPROVED→EXCHANGING→CONSUMED`, 또는 `STARTED→CANCELLED/FAILED/EXPIRED`. 완료 요청 경쟁에는 동기 상태 점유를 사용해 같은 code로 세션을 두 번 만들지 않는다. DB 실패 시 거래를 FAILED로 닫고 새 시작을 요구한다.

## 4. 제안 HTTP 계약 — 구현 승인 대상

모든 응답 `Cache-Control:no-store`, 원문 수단/개인정보를 일반 로그에 남기지 않는다. 아래 mock 경로는 disabled 모드에서404이며 기존 고객 API에는 영향이 없다. POST는 기존 정확한 WEB_ORIGIN 검사와 실제 루프백 접근 검사를 함께 적용한다. 추가 미정 필드는 허용하지 않는다.

| 경로 | 입력·처리 | 결과 |
|---|---|---|
| `POST /auth/kakao-mock/start` | `{client:'web'\|'android', state, challenge, method:'S256'}`. 고객 로그인 화면에서 시작하며 기존 로그인 세션이 있으면409. profile/role/accountId/returnUrl 입력 금지. | `{transactionId, authorizeUrl, expiresAt, mockOnly:true}`. 서버 고정 Web mock 화면 URL의 fragment에 transactionId·decisionTicket만 넣는다. |
| `POST /auth/kakao-mock/decision` | `{transactionId, decisionTicket, outcome:'approve'\|'cancel'\|'fail'}`. mock 화면에 세 선택을 명시하고 허용한 단일 가상 profile을 서버가 선택. ticket은1회용, 동일 거래의 두 결정은409. | 고정 returnUri+fragment의 `transactionId,state,code` 또는 `transactionId,state,error:'cancelled'\|'mock_failed'`. JSON `{returnUrl,mockOnly:true}`이며 임의 redirect 주소를 받지 않는다. 승인만으로 세션을 만들지 않는다. |
| `POST /auth/kakao-mock/complete` | `{transactionId,state,code,verifier}`. state/거래/challenge/만료/승인/미소비·고객 바인딩 대조 후 DB 트랜잭션으로 고객 세션과 최소 감사 이력 생성. | 기존 `sm_session` HttpOnly cookie+`{status:'ok',mockOnly:true}`. session/token/accountId를 JSON·복귀 URL로 반환하지 않는다. |
| `POST /auth/kakao-mock/cancel` | `{transactionId,state,verifier}` 증명 확인 후 미완료 거래 무효화. 거래가 이미 취소된 경우만 멱등 성공, 소비된 거래409. | `{status:'cancelled',mockOnly:true}`, 세션 생성0. |

오류:400 형식/미지원 client·method,403 Origin/루프백 거부,404 비활성 mock,401 위조·미등록·만료·계정 사용 불가(공개 오류는 동일 `invalid_mock_auth`),409 이미 결정/소비/로그인됨,429 시작 제한(원격주소당5분10회와전체1000개),503 DB/registry 준비 실패. stack·입력코드·식별자·계정 존재를 공개 오류에 포함하지 않는다.

complete 성공은 기존 세션과 동일한24시간·token hash 저장·고객 역할·sellerId null·HttpOnly/SameSite=Lax 계약을 적용한다. 감사에는 customer actor/action·account target만 남기고 state/code/verifier/외부 토큰은 기록하지 않는다. 기존 로그인 SQL의 활성/역할 검사·세션/감사 atomicity를 유지하며 비밀번호 검사를 우회하는 공개 범용 accountId 세션 발급 API는 만들지 않는다.

응답 유실 시 같은 code를 반복하여 새 세션을 만들지 않는다. 먼저 `/auth/me`로 현재 고객 세션을 확인하고, 없으면 새 mock 거래를 시작한다. 성공한 code 재사용은409이며 기존 세션은 유지한다. 기존 이메일 로그인/로그아웃이 시작되면 보류 mock 거래와 클라이언트 세대를 무효화하여 늦은 복귀가 새 로그인/로그아웃을 덮어쓰지 못하게 한다.

## 5. 복귀 주소·화면

- Web 고정 복귀: 정확한 허용 루프백 WEB_ORIGIN의 `/auth/kakao-mock/return`. 임의 hostname·port·경로·userinfo·redirect query는 금지한다. mock 페이지 역시 같은 Web Origin의 `/auth/kakao-mock/authorize`다.
- Web 복귀 창은 state/code를 읽고 URL fragment를 즉시 제거한 뒤 `postMessage`를 원래 창의 **정확한 Origin**으로 전달한다. 원래 창은 `event.origin`, `event.source===자신이 연 mock 창`, 거래ID/state/현재세대를 모두 확인한 뒤 complete를 호출한다. opener 없음/새로고침/다른 창이면 거부하며 이메일 로그인으로 안내한다.
- Android 고정 복귀: 기존 scheme의 `owoolmall-dev://auth/kakao-mock/return`. 경로를 정확히 검증하고 현재 메모리에 보관한 transactionId/state와 일치할 때만 처리한다. URL의 code만으로 고객 인증 완료 금지, verifier는 URL에 넣지 않는다. custom scheme은 앱 독점 보장이 없으므로 code 가로채기를 S256 증명으로 차단하는 개발 시험만 수행한다.
- Android는 기존 Linking API의 링크 listener/초기 URL을 사용하되 시작 증명이 없는 cold start는 거부한다. 대기 중 링크 중복·다른 거래·logout 이후 응답은 무시/안내하고 리스너를 정리한다. OS 수신 성공과 서버 세션 확인을 분리한다. 다른 기존 링크/이메일 로그인 화면은 유지한다.
- 성공 뒤 반드시 `/auth/me` customer 확인→기존 장바구니/주문·배송 조회로 연결한다. 취소/실패/시간초과/창 닫힘은 로그인 상태false로 남기고 재시도·이메일 로그인 버튼을 제공한다. 기존 사용자 세션이 발생하면 mock 결과로 교체하지 않는다.

## 6. 데이터·의존성·실환경 전환

제품 migration/schema 변경은 **제안하지 않는다**. 기존 account_identities/roles/sessions/audit를 재사용하며 가상 연결은 소유가 명확한 폐기 QA fixture에서만 준비/정리한다. 세션 발급·감사 기록은 DB 쓰기이며 신규 HTTP 인증 계약과 함께 별도 구현 승인 대상이다. 기존 계정 자료 보존과 QA reset 실패 시 rollback 기준을 실행 계획에 둔다.

모의 공급자는 내부 adapter의 approve/cancel/fail만 구현한다. 실제 카카오 code/token 검증·가입·연결·refresh/logout·동의 scope·서명/key hash·HTTPS/App Links는 이번 adapter로 활성화하지 않는다. 실제 모드 전환은 별도 계약/환경 승인 후 추가해야 하며 flag만 바꿔 mock으로 로그인하게 하지 않는다. 기존 APK debug 서명·앱 OS 권한 변경과 외부 SDK 의존성 추가는 이번 제안 범위에 없다.

## 7. 구현 전 확정할 검증 기준

- RED→GREEN: 모드·Origin/루프백·DB 식별 실패 폐쇄, 정상1회 세션/감사·고객 조회, 같은code 동시/반복 소비 차단, 잘못된 state/verifier/challenge/client/복귀주소·ticket 재사용·만료·서버재시작 차단.
- 계정 보호: 미등록/disabled/역할없음 거부, 입력이메일/계정ID/role 주입·같은이메일 자동병합 금지, seller/admin mock 로그인 금지, accounts/identities/roles 행수 불변. 생성 세션/감사 소유와 다른 고객 본인자료 격리는 실DB에서 검사한다.
- Web 실제 화면: 별도 QA 창에서 승인→복귀→본인 조회, 취소/실패·창차단/닫힘·다른 창/Origin·새로고침/증명소실, 기존 이메일 로그인·로그아웃과 늦은 응답 경쟁을 확인한다.
- Android 실제 개발 APK: 명시 mock 시작→Web 모의 선택→scheme 복귀→HTTP customer 세션·본인조회, 취소/실패·증명없는 cold start·중복/위조 link·logout 경쟁. 단순 adb로 URL만 열어 화면을 바꾼 결과를 인증 전체 PASS로 취급하지 않는다.
- 변경 범위 unit/typecheck/lint/build, 기존 로그인·권한 핵심 회귀. 테스트 skip은 실제DB/native 통과로 표시하지 않는다. 외부 요청0·Secret/수단 로그0·QA자원/행 정리는 별도 확인한다. 해당 결과가 나오기 전까지 **미구현**이다.

## 8. 승인 요청·복구

1. **이번 요청:** 이 계약안의 개발 전용 범위·고객 바인딩·네 경로·일회용 증명/복귀·세션/감사 쓰기 방향을 검토한다. 승인 답변은 계약 검토 승인으로 기록한다.
2. **다음:** 같은 S7 범위의 별도 실행 계획에 정확한 변경 파일·QA 대상/수명/정리·RED/실제 화면·rollback을 작성해 검토받는다. 기존 frozen 설계/계획서는 수정하지 않는다. 계약 승인만으로 제품 구현을 시작하지 않는다.
3. 제품 구현/QA 쓰기는 별도 실행 승인 후 수행한다. 실제 카카오 계정·키·운영 연결·지속DB/Oracle·공개배포·서명/권한 변경은 포함하지 않는다.

복구는 mock 모드/화면 flag를 끄고 해당 코드 변경을 되돌리는 방식이다. 기존 이메일 로그인/거래는 유지하고 폐기 QA의 소유 자료만 reset한다. schema 역적용·기존 계정/외부 연결 삭제가 필요 없는 범위로 제한한다. 문서 작성·승인은 구현/인수 완료보고가 아니다.
