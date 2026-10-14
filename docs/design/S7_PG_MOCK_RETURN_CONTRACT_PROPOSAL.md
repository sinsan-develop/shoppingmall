# S7.2 PG mock 브라우저·Android 복귀 최소 계약안

- 작성: 2026-10-14, 어울. 기준 제품 `2ba7985e761145492f3f85af71ceb940a8a448af`.
- 상태: **별도 계약안 작성만 승인됨. 아래 내용 검토·구현 승인 전**. 기존 DESIGN·WORK_PLAN·승인된 카카오 계약은 수정하지 않는다. 제품 코드·DB·설정·QA 자원은 변경하지 않았다.
- 추적: [S7.2 계획](../WORK_PLAN.md), [R02~R06·R11](DESIGN.md), [잔여 경계](../design_change.md).

## 1. 목적과 권고안

Web와 Android의 명시 버튼 → 별도 모의 PG 브라우저에서 승인/거절/지연/취소/실패 선택 → 원래 화면 또는 앱 복귀 → 서버의 본인 결제 시도·주문 재조회까지 연결한다. 복귀 링크·화면 선택·HTTP 200만으로 결제 완료를 표시하지 않는다. 실제 PG SDK·서명 callback·카드 승인과 호환되는 구현이라는 뜻이 아니다.

권고는 **서버 메모리의 1회 거래 + 기존 결제 시도/검증 사건/processor 재사용**이다. 새 DB schema·migration 없이 개발용 모의 공급자 선택과 주문·금액·시도를 서버에서 묶는다. 대안인 client-only 결과 전달은 공급자 선택의 서버 바인딩을 증명하지 못하므로 채택하지 않는다. 실제 PG부터 연결하는 대안은 공급자 계정·Secret·비용·시험상점 승인이 필요하므로 인수 준비로 남긴다.

현재 제품의 단순 mock POST는 `testOutcome`을 받아 즉시 처리한다. 그대로 브라우저 복귀라고 부르지 않는다. 기존 `payMock` 버튼·POST/GET 응답·멱등 기준과 0원 `NoChargePaymentAdapter`는 유지한다. **0원 주문은 기존 무상 확정 경로를 사용하며 유료 PG 브라우저 거래를 만들지 않는다.**

## 2. 개발·자료 보호 경계

- 신규 기능 기본값은 `PG_MOCK_BROWSER_MODE=disabled`; 활성 값은 `mock`만 허용한다. `APP_ENV=development`, 비production, 기존 `PAYMENT_MODE=mock`, API host와 실제 요청의 local/remote 주소 모두 루프백, 고정 Web Origin을 모두 확인한다. 불일치는 listener 이전 거부, 요청에도 재검사한다. disabled는 신규 경로 404이며 기존 결제 정책을 바꾸지 않는다.
- 폐기 DB 이름 `shoppingmall_s7_pg_<8자리 소문자 hex runId>`, 실제 `current_database()`/systemID, 서명된 소유 manifest의 run/계정/주문/상품 ID를 대조한다. 보호 systemID `7622490131194466339`는 거부한다. 고정 QA/보호 shoppingmall DB·실사용 자료·지속 migration은 변경하지 않는다.
- `QA_PG_MOCK_RUN_ID`, `QA_PG_MOCK_DB_NAME`, `QA_PG_MOCK_DB_SYSTEM_ID`, `QA_PG_MOCK_MANIFEST_PATH`, 일회성 `QA_PG_MOCK_MANIFEST_KEY`는 실행 계획에서 정확히 고정한다. 키는 QA 프로세스에만 전달하고 Git·로그·일반 보고서에 쓰지 않는다. 실제 PG credential·SMTP 설정을 사용하지 않는다.
- 가상 고객 A/B, 가상 상품·배송지와 기존 checkout 절차로 준비한 본인 주문만 시험한다. 고객·주문을 browser 입력으로 생성하거나 역할을 부여하지 않는다. start/complete/cancel/reconcile은 기존 활성 customer 세션·주문 소유를 확인한다. decision만 모의 공급자 수단으로 동작하며 customer 세션을 만들거나 바꾸지 않는다.
- Web는 개발 빌드+`NEXT_PUBLIC_ENABLE_PG_MOCK_BROWSER=1`, Android는 `__DEV__`+`EXPO_PUBLIC_ENABLE_PG_MOCK_BROWSER=1`일 때만 별도 'PG 브라우저 모의 결제' 버튼을 보인다. flag는 서버 허가가 아니다. 새 SDK·OS 권한·서명·외부 배포를 추가하지 않는다.

## 3. 거래·결제 처리 계약

- 매 시작마다 32바이트 난수의 base64url43자 `state`/`verifier`, `S256=base64url(SHA256(ASCII(verifier)))`를 사용한다. verifier·세션·멱등키·주문 개인정보는 URL/로그/browser storage에 넣지 않는다. 클라이언트 proof는 메모리에만 둔다.
- 서버 registry는 actor·현재 세션 token의 hash·주문/시도 ID·서버 금액·client·고정 복귀주소·state/challenge·상태·만료·ticket/code hash·선택 결과를 보관한다. session hash는 새 인증정보나 공개 응답이 아니다. 같은 고객의 다른 로그인 세션으로 이전 거래를 소비하지 않는다.
- 거래5분, code60초와 거래 만료 중 빠른 시각, 전체 최대1000건·고객당5분10회 start로 제한한다. 종료/만료 항목을 정리한다. client 시계 차이는 정상 응답을 거부하는 이유로 삼지 않고 로컬 대기는 최대5분으로 제한한다.
- start는 DB에서 본인 `PENDING_PAYMENT`·유효 주문·양수 금액을 확인하고 기존 결제 시도 관계에 `PENDING` 시도를 만든다. PG 전용 request fingerprint는 `SHA256(JSON.stringify({kind:'s7_pg_browser_mock_v1'}))`로 구분한다. 기존 단순 mock fingerprint·멱등키 충돌은409로 거부한다. 금액·providerOrderId는 서버 저장값/기존 MockPaymentAdapter에서만 얻는다.
- start header의 UUID 멱등키는 client 메모리에 보존한다. 같은 key/주문/세션/client/state/challenge의 통신 재시도는 같은 시도를 사용한다. 미선택 거래의 ticket만 새로 발급해 이전 ticket을 무효화한다. 살아 있는 거래에서 다른 proof/client를 같은 key에 붙이면409이다. 한 QA API 프로세스에서 동일 주문의 살아 있는 브라우저 거래는1건만 허용한다. DB await 전에 해당 주문의 시작 slot을 점유하며 별도 API 프로세스까지 메모리 잠금이 전파된다고 주장하지 않는다.
- start 응답 유실로 시도 ID를 몰라도 같은 key·proof로만 재확인한다. 임의 새 key로 결과를 우회하지 않는다. 서버 재시작·proof 소실 후에는 본인 주문을 먼저 재조회한다. 검증 사건이 없는 PENDING 시도는 같은 key의 새 증명으로 다시 연결할 수 있지만, 이전 선택·ticket·code는 되살리지 않는다. 원래 key/proof를 잃었는데 서버의 이전 거래가 아직 살아 있으면409·대기 만료시각을 안내한다. 만료 전 임의 key나 타 세션으로 기존 거래를 빼앗지 않으며, 이미 기록된 사건이 있으면 명시 reconcile만 허용한다.
- 상태는 `STARTED → DECIDED → EXCHANGING → CONSUMED`, 또는 `CANCELLED/FAILED/EXPIRED`다. decision/complete는 await 전 동기 점유로 중복 처리를 막는다. 서버에 기록한 모의 선택만 사용하고 complete body/복귀 URL에서 금액·주문·결과를 받아들이지 않는다.
- approve/decline은 저장된 providerOrderId에 기존 `MockPaymentAdapter.verify`를 적용하고 `recordVerifiedPaymentEvent` → `processVerifiedPaymentEvent`로 처리한다. 기존 주문/요청/검증 금액 대조·재고/쿠폰 전이·중복 사건·만료/품절의 REVIEW_REQUIRED 기준을 유지한다. 이 기능이 processor의 계약을 느슨하게 만들지 않는다.
- delay는 검증 사건을 만들지 않아 시도 PENDING/미결제 상태로 조회한다. cancel/fail/창 닫힘은 거래를 닫을 뿐 이미 만든 시도 이력을 삭제하거나 승인·거절 사건을 합성하지 않는다. 주문/예약은 기존 만료·조회 절차를 따른다. **decline도 기존 processor대로 시도 DECLINED이며 주문/예약을 임의 취소·재고 해제하지 않는다.**
- DB 사건 기록과 processor 적용은 기존의 별도 transaction이다. 중간 실패·응답 유실을 전체 rollback이라고 표시하지 않는다. complete 재사용으로 새 검증을 만들지 않고, 알려진 시도 GET/주문 GET을 먼저 확인한다. 이미 서버가 검증해 보관한 PENDING_PROCESSING 사건만 아래 reconcile로 멱등 적용할 수 있다. 기존에 없는 자동 복구 worker가 있다고 가정하지 않는다.

## 4. 제안 API·복귀 주소 — 별도 구현 승인 대상

신규 경로는 모두 정확한 Origin·실제 loopback·QA 식별 gate와 `Cache-Control:no-store`를 적용한다. 형식/미정 필드400, 세션401, customer 권한403, 타인/없는 주문·시도404, 거래·멱등·상태 충돌409, 한도429, dependency 실패503을 비밀 없는 응답으로 구분한다. provider 세부값·driver 오류를 echo하지 않는다.

| 경로 | 입력·처리 | 결과 |
|---|---|---|
| POST `/payments/pg-mock/start` | `{client:'web'|'android',orderId,state,challenge,method:'S256'}` + UUID `Idempotency-Key`; 본인 주문·QA·기존 PG 시도 검사/시작 | `{status:'ready',transactionId,attempt:{id,status:'PENDING',amountWon},authorizeUrl,expiresAt,mockOnly:true}`. 해당 주문에 보관된 미적용 검증 사건이 있으면 새 시도 대신409 `{status:'reconcile_required',attemptId}` |
| POST `/payments/pg-mock/decision` | `{transactionId,decisionTicket,outcome:'approve'|'decline'|'delay'|'cancel'|'fail'}`; ticket 확인 후1회 선택, session 대신 모의 공급자 수단 | `{returnUrl,mockOnly:true}`. approve/decline/delay는code, cancel/fail은허용된error만 복귀 fragment에 넣음 |
| POST `/payments/pg-mock/complete` | `{transactionId,state,code,verifier}`; 시작 때와 같은 활성 customer 세션·소유·S256·1회code·서버 선택 확인 | `{attempt:{id,status,amountWon},mockOnly:true}`; client는 기존 본인 주문 GET도 확인. 중복 complete는409이며 결과 확인용 GET은 계속 허용 |
| POST `/payments/pg-mock/cancel` | `{transactionId,state,verifier}` + 본인 시작 세션; 기다리는 거래만 닫음 | `{status:'cancelled',mockOnly:true}`. EXCHANGING은409·결과 조회 필요; 결제 기록을 삭제/되돌리지 않음 |
| POST `/payments/pg-mock/reconcile` | `{orderId,attemptId}`; 현재 customer·본인 소유·manifest·PG 전용 fingerprint 확인, **DB에 이미 검증·보관된 사건만** 기존 processor로 적용 | `{attempt:{id,status,amountWon},mockOnly:true}`. 사건 없음은PENDING 조회 결과, 이미 처리됨은동일 결과, REVIEW_REQUIRED는그대로 유지. 새 outcome/금액/공급자 사건 입력은거부 |

마지막 POST는 실제 확인된 '사건 보관 성공→processor 실패' 경계를 복구하기 위한 최소 쓰기 계약이다. GET을 몰래 쓰기 작업으로 바꾸거나 browser 문자열을 복구 근거로 쓰지 않는다. 이 신규 경로도 내용·구현 승인 전 실행하지 않는다.

- Web authorize: `http://127.0.0.1:9091/payments/pg-mock/authorize#transactionId=…&decisionTicket=…`.
- Web return: `http://127.0.0.1:9091/payments/pg-mock/return#transactionId=…&state=…&code=…` 또는허용된error.
- Android return: `owoolmall-dev://payments/pg-mock/return#transactionId=…&state=…&code=…` 또는허용된error.
- 고정 scheme/host/port/path만 허용하며 client가 redirect/계정/금액/시도/결과를 덧붙이지 못한다. query·중복/미정 fragment·custom scheme port·userinfo는거부한다. 금액·주문 ID·outcome·verifier는이 URL에 넣지 않는다.
- authorize/return은 fragment를 읽은 즉시history에서제거하고 no-referrer·외부script/assets없는 페이지를사용한다. Web 원래 창은 정확한 Origin/source/state/거래를 확인한다. Android는 현재 메모리 proof를 확인한다. 창 차단·no-opener·cold start·복귀 위조는complete0이며 안전 재시작/기존 본인 조회를안내한다.

## 5. 사용자 화면·경쟁·미확인 처리

- 서버가 반환한 시도금액만 표시한다. 복귀 선택은 결제 성공 표시가 아니다. 시도 APPROVED와 본인 주문 PAID를 재조회한 뒤만 성공으로 표시한다. DECLINED·PENDING·REVIEW_REQUIRED·401/403/409·네트워크 불명은 각기 다른 상태이며 성공으로 대체하지 않는다.
- 응답을 잃으면 알고 있는 시도/주문을 조회한다. 필요할 때만 명시 '서버 처리 재확인'으로 reconcile하며 새 key/approve를 자동 생성하지 않는다. 지연 후 다시 시작은 본인 상태 확인 뒤 새 명시 의도이며 이전 code가 뒤늦게 승인할 수 없다.
- waiting 중 다른 주문 선택·이메일 인증/로그아웃 시작은 로컬 proof와 진행 세대를 무효화하고 소유 cancel을 확인한다. 교환 중 이미 승인된 서버 처리/확정 기록은 client 취소·로그아웃으로 rollback하지 않는다. 늦은 응답이 새 계정/화면에 성공을 표시하지 않게 세대·현재 me/소유 조회를 확인한다. 새로운 session cookie나 기존 인증 정책 변경은 하지 않는다.
- 결제 진행 중 같은 client의 다른 결제·주문 변경을 동기 점유로 제한한다. 타탭/다른 기기 또는 기존 단순 mock과의 경쟁은 서버의 기존 주문/시도 lock·금액·처리상태 검사로 해결하며, 이득을 얻기 위해 클라이언트 잠금만으로 서버 검증을 대체하지 않는다.

## 6. 구현 전에 검토할 범위·핵심 완료 조건

내용 승인 뒤에만 별도 실행 계획을 작성하고, 그 계획의 구현 승인을 받아 진행한다. 예상 제품 범위는 신규 PG registry/gate/service/controller, 기존 결제 repository/서비스의 PG 시도 구분·processor 호출 접점, Web 모의 페이지/결제 UI, Android core/Linking·CustomerApi/결제 UI와 해당 시험이다. 기존 processor 정책·DBschema·Kakao/auth controller·native 설정을 바꿔야 한다면 이유와 별도 승인을 먼저 요청한다.

필수 증거는 다음에 한정하고 기존 구매/첨부/알림 전수 시험을 반복하지 않는다.

- 정상 Web/Android 브라우저 선택→실제 HTTP/폐기 DB→본인 PAID 조회; 기존 시도/주문/재고/쿠폰은정확1회처리, 타고객비노출.
- 거절/지연/취소/실패·창닫힘/차단·cold start·서버재시작·wrong-window/Origin·다른세션/주문·금액/결과주입·중복/동시complete·만료/재고경합의중요실패조건.
- 실제DB의사건삽입전실패/삽입후processor실패·COMMIT후응답유실과보관된사건reconcile; 새승인합성0·중복재고전이0·불변이력보존. 완료하지못한검증은미확인으로남김.
- disabled 기존결제/0원경로·영향받은auth/UI회귀, 변경type/lint/build, 새SDK/native설정diff0일때기존검증APK+exactJS구분, 읽기전용검토와소유QA자원0.

QA source·container/내부network/폐기 DB·고정9091/9092·전용Chrome/AVD/Metro·fixture·증거·reset거부시폐기DB정리의정확이름·수명은실행계획에서선언한다. 시작부터결제/감사이력삭제를정리수단으로설계하지않는다.

## 7. 승인 요청과 제외 범위

신산님께 필요한 다음 결정은 **이 계약안의 내용 승인 또는 수정 요청**이다. 특히5개신규mockPOST, PG전용fingerprint·서버사건reconcile, 고정복귀주소·가상QA주문쓰기범위를검토한다. 내용승인은별도실행계획작성까지이며아직제품구현/QA쓰기/배포승인이아니다.

실제 PG SDK/Secret·카드정보·실결제/환불·외부callback·푸시/기기등록·새앱서명/권한·persistent DB/migration·Oracle/공개배포·0원정책변경은제외한다. 카카오mock완료와이계약안작성을전체S7/S8완료로표시하지않는다.

복구는신규PGmock기능비활성화와해당제품커밋만되돌리는것이다. 기존단순mock/주문조회는유지하고정확소유폐기QA만회수한다. 이미확정한주문/결제/감사이력을지우는rollback은약속하지않는다.
