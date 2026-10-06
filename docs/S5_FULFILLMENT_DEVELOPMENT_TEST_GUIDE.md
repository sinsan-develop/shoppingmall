# S5.1 출고 개발 시험 안내

## 현재 판정

- 제품 SHA `39f3fe89f20b96a61e447545f7a691704c2c479f`에서 별도 격리 DB actual Chrome을 실행해 고객·판매자·관리자 경로와 1920×1080·1440×900·430×844·키보드 검사를 통과했다. 역할 경로 PASS와 viewport/keyboard PASS 두 runner 문구, screenshot 9개를 확인했다.
- signed reset 뒤 manifest 관련 25개 관계는 모두 0, `fulfillment_settings(id=1)`은 1행이며 전용 container·network·tunnel·Chrome/profile·secret·manifest·evidence는 모두 0이다.
- 공유 개발 DB는 승인된 0015 적용 완료 상태로 migration16·settings1·fulfillments0·events0·핵심 업무행0이며, 적용 전 rollback backup 2개는 보존 중이다.
- 위 결과는 `39f3fe89...`의 S5.1 actual Chrome 이력이다. 이후 fix round 2 commit의 actual Chrome·독립 review·Oracle/UAT는 재검증 전까지 미검증이며 S5 전체 완료로 해석하지 않는다.

## 고정 경계

- 정본 작업경로: `D:\Project\shoppingmall2\.worktrees\s5-fulfillment-engagement`
- WSL 시험 checkout: `/home/daon/deploy/shopping`
- Git 원격은 `git@github-sinsan-develop:sinsan-develop/shoppingmall.git` 별칭만 사용한다.
- 공유 DB `WSL-server/local-postgres/shoppingmall`에는 승인된 0015와 exact-SHA 회귀만 적용했다. 출고 Chrome fixture는 공유 DB에 seed하지 않고 별도 격리 DB만 사용한다.
- PG·택배·문자·메일·푸시 공급자와 Oracle/UAT는 이 시험 범위가 아니다.
- 실제 200% 확대는 UAT-03에서 검증한다.

## 준비된 fixture

- API fixture: `apps/api/scripts/qa-fulfillment-ui-fixture.ts`
- 안전 시험: `apps/api/test/qa-fulfillment-ui-fixture-safety-db.test.mjs`
- 계약 시험: `apps/api/test/qa-fulfillment-ui-fixture.test.mjs`
- 실제 Chrome runner: `scripts/qa-fulfillment-browser.mjs`
- CDP lifecycle helper: `scripts/qa-browser-cdp.mjs`
- runner 계약·단위시험: `apps/web/test/qa-fulfillment-browser-contract.test.mjs`, `apps/web/test/qa-browser-cdp.test.mjs`

fixture는 고유 8자리 `QA_RUN_ID`, 정확한 `shoppingmall_s5_fulfillment_ui_<runId>` DB 이름, PostgreSQL system identifier, 시험 비밀번호 HMAC manifest에 묶인다. 가상 고객·판매자 A/B·어울몰 판매자·관리자 5계정과 가상 3상품·3결제완료 주문·3출고만 생성한다.

## Task9에서 수행한 private 검증 이력

private tmpfs DB에서만 다음을 검증한다.

1. 0000~0015 migration 적용
2. fixture seed
3. 잘못된 system identifier와 변조 manifest 거부
4. 외부 identity·category·audit·참조가 있으면 삭제 전 rollback
5. reset과 동시에 들어오는 late child insert 차단
6. 정상 reset 뒤 manifest 관련 업무행 0, singleton 1
7. 정확한 container·network·cache와 checkout 잔류 0

이미 통과한 동일 fixture 안전시험은 근거가 유효한 동안 반복하지 않는다.

## 승인 후 실제 Chrome 시나리오와 재실행 절차

Task11 승인 뒤 Task12에서 아래 순서로 실행해 `39f3fe89...`에서 PASS·signed reset·자원0을 확인했다. 후속 commit을 검증할 때도 같은 절차를 반복한다.

1. 승인된 백업과 0015 공유 적용, 공유 DB exact-SHA 전체 회귀·잔류0을 확인한다.
2. 로컬·원격·WSL checkout의 exact SHA와 clean 상태를 확인한다.
3. 별도 `shoppingmall_s5_fulfillment_ui_<runId>` 격리 DB에 0000~0015를 적용하고, WSL loopback API `127.0.0.1:9092`와 Web `127.0.0.1:9091`을 같은 SHA로 실행한다.
4. Windows는 `WSL-server` SSH loopback tunnel과 격리 Chrome `127.0.0.1:9229`만 사용한다.
5. 고객 READY 조회 → 판매자 PACKING/SHIPPED → 관리자 DELAYED/READY 정정 → 고객 운송장·안내 재조회를 확인한다.
6. 1920×1080, 1440×900, 430×844의 가로 overflow와 보이는 활성 요소 전체 Tab 순회를 확인한다.
7. 성공·실패 모두 fixture reset 후 업무행 0을 확인하고 API/Web/DB container·network, tunnel, Chrome process/profile, 임시 evidence를 제거한다.

브라우저 runner는 exact loopback URL, `S5_ISOLATED_FULFILLMENT_<runId>` 동의값과 서명 manifest를 요구한다. CDP page/socket과 명령에는 유한 timeout이 있으며 오류·종료 시 pending 요청과 생성 page를 정리한다.

## PASS 표기 기준

- fixture·runner 단위/계약시험 PASS: 실행 도구 준비 증거
- private DB safety PASS: fixture 격리·정리 증거
- 공유 DB PASS: 승인된 0015 적용, exact-SHA 전체 회귀, 기존 자료 불변과 시험자료 잔류0 증거
- 실제 Chrome PASS: 같은 exact SHA·별도 격리 DB의 역할별 시나리오와 viewport/키보드 증거. 공유 DB actual Chrome PASS로 표기하지 않는다.
- PG·택배사 API·문자·메일·푸시·Oracle/UAT: 별도 실연동 증거가 없으면 미검증
