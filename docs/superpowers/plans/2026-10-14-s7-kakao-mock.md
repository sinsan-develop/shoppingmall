# S7.2 카카오 mock 인증·복귀 실행 계획

> **실행 Agent:** 계획 승인 후 `superpowers:executing-plans`(어울 직접 실행 권고) 또는 신산님이 선택한 `superpowers:subagent-driven-development`로 Task별 수행한다. 아래 체크는 실행 증거를 얻었을 때만 현황에서 완료 처리한다.

**목표:** 개발 전용 가상 고객의 Web/Android mock 승인·취소·실패와 실제 고객 세션/본인 조회를 연결한다.
**구조:** 프로세스 메모리 거래 registry+폐기 DB 바인딩으로 서버 인증을 제한한다. Web popup/Android scheme 복귀의 수단은 S256 증명으로 소비하고 기존 HttpOnly 세션을 사용한다.
**기술:** 기존 Node24/Nest/PostgreSQL15, Next/React19, Expo57/RN0.86 및 기본 Web Crypto/Expo Crypto/Linking만 사용한다. 새 공급자 SDK/인프라/공통화는 하지 않는다.
**계약:** [S7_KAKAO_MOCK_CONTRACT_PROPOSAL.md](../../design/S7_KAKAO_MOCK_CONTRACT_PROPOSAL.md), 계약 commit `aec85126955f8631027265f6a50eb0efc441c29f`, 2026-10-14 신산님 내용 승인. 원문 상태는 작성 당시 이력으로 읽고 최신 승인 기록은 WORK_STATUS를 따른다.
**상태:** 실행 계획 검토·실행 승인 전. 계약 승인만으로 제품 구현/QA 쓰기를 시작하지 않는다. 기존 DESIGN/WORK_PLAN/WORK_PLAN_20260-10-11은 불변.

## 공통 제약

- 계약의 네 POST 경로와 고정 복귀주소만 구현한다. 기본 `KAKAO_AUTH_MODE=disabled`, mock은 development/비production/실제 양쪽 루프백/정확한 폐기 DB·manifest만 허용한다.
- verifier32바이트→base64url43자, S256만; 거래5분, code60초/거래만료 중 빠른시각, 전체1000건, 원격주소당5분10회. 코드/ticket32바이트·hash 저장, 세션24시간·token hash·HttpOnly/SameSite=Lax/customer/sellerId null.
- `mock:s7:<8자리 소문자hex runId>:customer-a`를 fixture가 미리 연결한다. 요청에서 계정/이메일/role/profile/redirect를 지정하거나 로그인 중 계정·식별자·역할을 생성/연결하지 않는다.
- 실제 카카오·PG·원격 푸시/Apple·Secret·외부비용·공개/Oracle·서명/OS권한·지속DB/migration은 제외한다. 기존 이메일 로그인·역할·가입/복구 기준과 검사 기대값을 유지한다.
- 작업은 기존 `codex/s7-mobile-20261014`에서 단일 writer. 동일 파일 병렬 수정·새 브랜치·자동 예약을 만들지 않는다. 필수 Gate 전 병합/개발 완료 선언은 금지한다.

## 검토 초점 — 추가 반례를 담당 Task에 배치

1. 비밀 수단이 URL fragment 처리 이후 개발 로그/history/referrer에 남지 않음(T2/T3), 원문 오류 echo 금지(T1).
2. Web 창차단/원래탭 종료·Android cold start/백그라운드 메모리 소실은 세션 없는 안전 재시작(T2/T3).
3. complete 응답 유실·이메일 로그인/로그아웃 경쟁·타탭 cookie 변경은 기존 세션을 잘못 덮어쓰지 않음(T1/T2/T3/T4).
4. DB 잠금/감사 삽입 실패·계정 disabled 경쟁은 로그인 반쯤 성공/중복 세션을 남기지 않음(T1).
5. manifest 위조·다른 run 자료·QA reset 외부 참조는 타 자료 변경 없이 실패(T1/T4).

## QA 자원 — 생성 전 다시 선언/점유 확인

- WSL 전용 `/home/daon/deploy/shopping-qa-s7-kakao-20261014`, `shoppingmall-s7-kakao-20261014-{pg,node,web}`, 내부 network `shoppingmall-s7-kakao-20261014-net`. PG15 tmpfs·공개PG포트/영속볼륨 없음. Node CPU1/메모리1GiB, PG CPU0.5/512MiB. 기존 서비스와 충돌/중단 시 생성하지 않고 원인을 기록한다.
- DB는 고유 runId의 `shoppingmall_s7_kakao_<runId>`. `QA_KAKAO_RUN_ID`, `QA_KAKAO_DB_NAME`, `QA_KAKAO_DB_SYSTEM_ID`, `QA_KAKAO_MANIFEST_PATH`를 명시한다. 실제 current_database/systemID/manifest 소유ID 대조, 보호 systemID `7622490131194466339` 거부, 최초 빈 계정 gate 뒤 seed. synthetic 자격정보는 Git/일반로그에 넣지 않는다.
- 승인 원격의 exact commit을 Git으로 받는다. 폐기 DB에 기존 migration28개 적용/대기0을 확인하되 보호/고정QA에 적용하지 않는다. 최초 생성 systemID와 migration 집합·소유 manifest를 보존한다.
- 가상 customer-a/customer-b와 미등록/disabled/권한없음 반례, 본인 배송지 한 건씩만 사용한다. 이미 확인한 가상 상품/구매/결제·정산을 다시 만들지 않는다. 식별자·역할·sessions/audit의 정확한 소유를 기록한다.
- Windows 임시 root `D:\tmp\s7kakao1014`, 증거 `D:\tmp\shoppingmall-s7-kakao-20261014`, 전용 AVD `shoppingmall_s7_kakao_20261014`/5580·Metro8081·Web9091/API9092 loopback tunnel. Android `adb reverse tcp:8081 tcp:8081`,9091/9092도 같은방식으로 연결하고 API/Web Origin은 `http://127.0.0.1:9092`/`http://127.0.0.1:9091`로 일치시킨다. 에뮬레이터127 주소가 Windows를 가리키도록 확인하여 계약상 Web Origin을10.0.2.2로 임의 확장하지 않는다.
- Chrome 전용 QA profile/CDP9229만 사용하며 사용자 탭은 조작하지 않는다. 새로 생성할 때 resource명·이유·수명·정리를 WORK_STATUS/commentary에 선언한다. 종료 trap/finally로 정확한 소유 프로세스·AVD·소스·container/network/DB/profile를 회수하고 listener/행 잔류를 확인한다. APK/영수증·마스킹 증거만 남긴다.

## T1. 서버 mock 거래·세션과 폐기 QA 안전성

**파일:** 신규 `apps/api/src/auth/kakao-mock-{registry,gate,service,controller}.ts`, `apps/api/scripts/qa-kakao-mock-fixture.ts`, `apps/api/test/kakao-mock-{registry,gate,http-db,fixture-db}.test.mjs`. 수정 `apps/api/src/{main,app.module}.ts`, `auth/repository.ts`, `auth/controller.ts`의 기존 cookie helper export만. 기존 auth controller의 다른 동작/구조는 유지한다.

**인터페이스:**
- gate: `assertKakaoMockBootConfig(env):'disabled'|'mock'`; `attestKakaoMockDatabase(pool,env):Promise<KakaoQaBinding>`; `assertKakaoMockRequest(request,env):void`. binding은 `{runId,dbName,systemId,identifier,accountId}`이며 검증 완료 후 내부에서만 생성한다.
- registry: `new KakaoMockRegistry({webOrigin,identifier,now,randomBytes})`; `start({client,state,challenge,method},remoteAddress):{transactionId,authorizeUrl,expiresAt,mockOnly:true}`; `decision({transactionId,decisionTicket,outcome}):{returnUrl,mockOnly:true}`; `complete({transactionId,state,code,verifier},issueSession:(identifier:string)=>Promise<MockSession>):Promise<MockSession>`; `cancel({transactionId,state,verifier}):{status:'cancelled',mockOnly:true}`. `MockSession={token:string,expiresAt:Date}`는 HTTP JSON에 노출하지 않는다.
- service: `initialize():Promise<void>`에서 gate·실제DB/manifest를 확인하고 registry를1개 생성, controller의 네 요청을 중계한다. createApp 후 main/test가 listen 전에 initialize를 호출한다. disabled일 때 DB 식별/새 세션 쓰기 없이404.
- repository: `loginMockKakao(binding:KakaoQaBinding):Promise<MockSession>`는 고정 가상 identifier/계정과 활성 customer 역할을 같은 DB transaction에서 잠금·재확인하고 기존 sessions/audit만 쓴다. 외부 body의 accountId는 받지 않는다.
- QA: `runQaKakaoMockFixture(action:'seed'|'reset',runId:string,url:string,systemId:string,manifestPath:string):Promise<void>`; 실패 시 비밀 없는 오류, 외부참조/소유 불일치 reset전체rollback. 불변 audit 제거를 임의 강행하지 않으며 처리가 불가능하면 전용 폐기 DB 자체를 제거한다.

- [ ] RED: registry 표적 시험은 정상 start/approve/complete의 issueSession1회, 같은code 병렬 complete 중1성공/1conflict, cancel/fail 이후 issueSession0을 검사한다. fake clock `now=0→300001` 거래만료, 발급뒤60001 code만료, 10회뒤11회429/전체1001회429, 잘못된state/verifier/ticket/client/URL·재시작·원문오류 반례를 추가한다.
- [ ] 실행: `node --import tsx --test apps/api/test/kakao-mock-registry.test.mjs apps/api/test/kakao-mock-gate.test.mjs`. 신규 동작 부재의 RED를 확인한다. 초과/주소 검사는 각자 독립 입력으로 확인하고 전역1000 gate를 개별 rate gate가 대신 통과하게 하지 않는다.
- [ ] 구현: 위 인터페이스와 정확한 수명·엄격 body key·status 계약만 적용한다. ticket/code/state/verifier의 비교는 형식 검증 뒤 hash/길이/일정시간 비교, complete 상태 점유는 await 전에 수행한다. 일반 오류에는 수단/SQL/계정 존재를 넣지 않는다.
- [ ] DB/HTTP RED: 실제 폐기 DB에 대해 `{status:'ok',mockOnly:true}`·HttpOnly cookie·me customer, sessions/audit 각각정상1건·accounts/identities/roles변화0; 미등록/disabled/role없음·role/accountId주입401/400·Origin403·disabled404·active session409을 검사한다. 감사 INSERT 실패/계정 잠금·disabled 경쟁은 transaction rollback 및 세션0. 동시 complete0/1·응답유실 재사용409/새세션0, API payload와 오류에token/identifier/code echo없음을 확인한다.
- [ ] fixture RED: 다른systemID·보호DB·manifest hash/소유ID 변경·타run·부분seed/reset 재실행/외부참조에서 타 자료행 불변. manifest는 runId/DB/systemID/소유IDs/생성nonce·HMAC을 포함하고 일회QA HMAC키는 runtime메모리 또는0600 QA파일만 사용한다. 서버 gate도 manifest 검증을 생략하지 않는다.
- [ ] GREEN: 위4시험을 실제DB 필수 모드로 `QA_KAKAO_REQUIRED=1 node --import tsx --test --test-concurrency=1 apps/api/test/kakao-mock-*.test.mjs`; pass/fail/skip별 기록, 목표0skip/0fail. 기존 `auth-http.test.mjs`·이메일/역할 DB회귀를 변경 영향 범위에서 실행하고 main의 mock boot실패는 listener0을 검사한다. API typecheck/build·변경lint 후 파일별 stage/commit.

## T2. Web 모의 공급자 화면·안전한 복귀

**파일:** 신규 `apps/web/lib/kakao-mock-client.ts`, `apps/web/components/KakaoMockLogin.tsx`, `apps/web/app/auth/kakao-mock/{authorize,return}/page.tsx`, `apps/web/test/kakao-mock-client.test.mjs`, `scripts/qa-kakao-mock-browser.mjs`; 수정 `apps/web/app/login/page.tsx`, `apps/web/test/login.test.mjs`. 기존 로그인 폼/role 흐름은 유지한다.

**소비/생산:** T1 네 POST·`/auth/me`. `createKakaoMockClient({apiOrigin,webOrigin,send,randomBytes,digest}):{start():Promise<StartResult>,acceptReturn(event,expectedWindow):Promise<void>,cancel():Promise<void>,invalidate():void}`. 현재 proof/세대는 closure메모리만 사용하고 authorize/return parser는 정확한URL/허용 fragment key만 반환한다. HTTP status별 안전한한국어 안내를 client가 만들고 원문오류를 표시하지 않는다.

- [ ] RED: 실제 client/React 이벤트에 start문구·명시 flag/dev 조합·customer에서만버튼, window차단·unknown origin/source·다른transaction/state·메모리소실·중복message·no-opener·이메일로그인/로그아웃 경쟁을 검사한다. iframe/다른창이 보낸 성공메시지로 session을 주지 않는 반례를 포함한다. `acceptReturn` 잘못된입력→complete호출0, 유효한복귀→1회/me customer·계정화면이 핵심 assertion이다.
- [ ] 실행: `node --import tsx --test apps/web/test/kakao-mock-client.test.mjs apps/web/test/login.test.mjs` RED 확인.
- [ ] 구현: 사용자 gesture에서 빈popup을먼저 열고 start성공뒤 고정 authorizeURL로 이동한다. fragment의 ticket/code는 소비 후즉시history에서제거, `Referrer-Policy:no-referrer` 및 logs금지. popup은 승인/취소/실패를 직접 선택→decision 응답의고정returnURL로만 이동. return은정확Origin/source를검사하는 원래창으로message를전달한다. 외부script/assets를넣지 않는다.
- [ ] 경쟁 처리: waiting단계에서 다른 로그인/로그아웃 시작은 증명cancel을확인하고 세대를바꾼다. complete가진행중이면 새인증동작을 같은client queue에서 완료확인 뒤 실행해 늦은Set-Cookie가최신세션을덮지않게 한다. 응답유실은me조회→기존고객확인 또는새시작이며 code 재교환은금지한다. 공유cookie타탭 경쟁은T4 실제검증의필수gate로두며 실패하면 새인증결합수단을임의추가하지않고 계약예외를보고한다.
- [ ] GREEN: 위시험0fail 및 Web typecheck/build·변경lint. `qa-kakao-mock-browser.mjs`는기존CDP 도구를사용해 별도QA창의 승인/취소/실패·고객배송지조회·타창/Origin거부·로그아웃을실DB와대조한다. 서명된QAmanifest/대상ID 확인과finally정리만추가하고 기존전체여정스크립트를수정하지않는다. 파일별stage/commit.

## T3. Android mock 시작·scheme 복귀·고객 세션

**파일:** 신규 `apps/mobile/src/kakao-mock-core.ts`, `apps/mobile/src/kakao-mock-bridge.ts`, `apps/mobile/src/KakaoMockLogin.tsx`, `apps/mobile/test/kakao-mock.test.mjs`; 수정 `apps/mobile/App.tsx`, `apps/mobile/src/customer-api.ts`, `apps/mobile/src/CustomerApp.tsx`, `apps/mobile/test/customer-api.test.mjs`, `apps/mobile/test/customer-screen.test.mjs`. app.json/OS권한·서명·native의존성은변경하지않는다.

**인터페이스:** CustomerApi에 `startKakaoMock(input):Promise<StartResult>`, `completeKakaoMock(input):Promise<{status:'ok',mockOnly:true}>`, `cancelKakaoMock(input):Promise<{status:'cancelled',mockOnly:true}>`. core의 `createKakaoMockFlow({api,randomBytes,digest,openUrl}):{start():Promise<void>,handleReturn(url:string):Promise<boolean>,cancel():Promise<void>,invalidate():void}`. bridge는기존ExpoCrypto·Linking으로입출력만 연결하며 source없는cold start를실패폐쇄한다.

- [ ] RED: 실제CustomerApi→HTTP 정확body/Origin/cookie, 화면이명시시작하기전외부URL호출0, approve/cancel/fail 복귀와메모리state/verifier 없이complete0, wrongscheme/host/path/query/중복fragment·다른state/거래·중복URL·logout전후늦은응답을검사한다. callback만받은screen은signedIn을true로바꾸지않고me customer확인뒤기존개인조회가가능해야한다.
- [ ] 실행: `node --import tsx --test apps/mobile/test/kakao-mock.test.mjs apps/mobile/test/customer-api.test.mjs apps/mobile/test/customer-screen.test.mjs` RED 확인.
- [ ] 구현: `__DEV__ && EXPO_PUBLIC_ENABLE_KAKAO_MOCK==='1'`에서만표시한다. ExpoCrypto의기존난수/SHA256 API와Linking으로브라우저authorizeURL을열고 정확한`owoolmall-dev://auth/kakao-mock/return`을처리한다. pending proof는메모리, listeners cleanup·getInitialURL증명소실거부·세대/중복guard·T2와동일한인증직렬화/응답유실판정을적용한다. 이메일/복원/일반401기존경로는보존한다.
- [ ] GREEN: 모바일변경범위시험0fail·typecheck·lint 및AndroidJS bundle. 기존native설정/의존성diff0이면검증한APK와새JS exactSHA를구분해기록한다. native변경을요구하게되면재빌드/별도권한승인경계를보고하고이계획에서몰래추가하지않는다. 파일별stage/commit.

## T4. 동일 후보 실제 연결·독립 검토·정리

**파일:** `WORK_STATUS.md`, `docs/design_change.md`, `docs/MOBILE_DEVELOPMENT_GUIDE.md`; T1 QAfixture/T2 browser실행기. 기존설계·계획·이번승인계약은임의수정하지않는다.

- [ ] 구현commit push→WSL 전용Git exactSHA checkout, T1~3 code/native조건을확인한다. source압축복사나정식main checkout을 QA로전용하지않는다.
- [ ] 동일SHA에서 T1 실제DB시험0skip/0fail, T2 별도Chrome 정상/취소/실패·popup닫힘/증명소실·다른창/Origin·로그아웃, T3 Android브라우저mock선택→scheme→기존HttpOnly고객세션·본인배송지조회를확인한다. Android반환scheme만adb로열었다고인증성공처리하지않는다.
- [ ] 실DB 정상1회세션/감사, 계정/연결/role불변·본인customer-a배송지/다른customer-b불노출. code재사용/동시complete·DB실패·응답유실·serverrestart·coldstart0세션. Web타탭이메일로그인/로그아웃와inflight complete의Set-Cookie순서도확인해최신세션보존을판정한다. 해당위험을해결못하면미통과로기록하고계약수정을별도요청한다.
- [ ] 이번Stage완료/PR전에변경영향auth/Web/mobile시험·typecheck·lint·API/Webbuild, 독립읽기전용검토에서Critical/Important0을확인한다. 기존구매/첨부/알림native·부하·복구·모든기기검사는재실행하지않는다. 새실패는실제기능방해/즉시보안데이터위험/2단계정밀로분류하고검사기준을낮추지않는다.
- [ ] fixture reset은소유manifest/외부참조검사후정확범위만, 실패하면소유폐기DB자원제거로정리한다. 기존WSlmain·서비스불변, 전용container/network/DB·Node/Chrome/Metro/tunnel/AVD/profile/소스없음·listener0을확인한다. 해당계약의completed기록만장애파일에서제거하고실연동미구현/인수경계를유지한다.
- [ ] 실행commit·DB/systemID/migration·화면/코드hash·시험수/skip/오류/소유자원정리·미검증·사용방법을짧게누적하고checkpoint commit/push. 카카오mock완료를전체S7/실카카오인수로표시하지않는다. 다른S7.2 PG/푸시계약gate는독립적으로남는다.

## 실행 승인·중단·복구

권고는 어울이직접단일writer로T1→T2→T3→T4를수행하고전체변경을마지막독립review로확인하는방식이다. 작업별새writer방식도선택할수있지만같은auth/화면인터페이스를수정하므로병렬코드수정은하지않는다. 신산님이이계획과실행방식을승인한뒤시작한다.

이승인은네개발mockPOST/가상연결·폐기QA세션/감사쓰기/표적브라우저·AVD시험범위다. 계약변경·새schema/지속자료·실공급자/Secret/권한/서명/Oracle·공개·파괴적Git은추가승인대상이다. gateway접근이나Web popup/scheme문제가생겨도검사를우회하거나현재QA를실인수로승격하지않는다.

복구: mock서버/화면flag비활성→이계획의제품커밋만되돌림→기존이메일로그인/auth/me·개인조회핵심smoke. DBmigration없음, 기존자료/계정연결삭제없음. 정확소유폐기자원만회수한다. 승인대기때는문서상태만기록하고자동예약·제품코드·QA자원생성을시작하지않는다.
