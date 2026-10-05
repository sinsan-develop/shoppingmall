# S5.1 출고·배송정보 상세 구현계획

> 상태: PMO가 `c4860af` 계약 범위의 **격리 구현·시험**을 승인했다. 공유 `local-postgres/shoppingmall` 0015 적용과 공유 QA 쓰기는 별도 승인 전 실행하지 않는다. Stage 책임자는 승인·검증·통합을 관리하고 제품 코드는 PMO가 지정한 단일 code-writer만 수정한다.

**목표:** 직접발송과 공동출고 발송 주문에 담당 판매자를 고정하고, 결제 완료 이후 포장·지연·출고·운송장·관리자 정정·고객 즉시 조회와 출고 전 환불 경계를 일관되게 제공한다.

**핵심 구조:** 기존 주문/결제/환불 금액 snapshot은 유지한다. 0015의 singleton 설정, 발송 주문별 현재 출고행, 불변 출고사건을 추가한다. 주문 제출 때 담당자와 S3에서 실제 선택한 배송정책의 마감시간을 고정하고 결제 processor가 `READY`로 연다. 판매자/관리자 쓰기는 SQL seller scope, 낙관 잠금, 멱등키를 사용한다.

**기술:** NestJS 12, TypeScript, PostgreSQL/Drizzle schema, Next.js 16/React 19, Node test runner, private tmpfs PostgreSQL, 실제 Chrome QA.

## 공통 실행 규칙

- 위치: `D:\Project\shoppingmall2\.worktrees\s5-fulfillment-engagement`, branch `codex/s5-fulfillment-engagement`. 다른 branch/worktree를 만들지 않는다.
- 단일 writer: 동일 기능/파일의 동시 code writer 금지. reviewer는 읽기 전용으로만 사용한다.
- TDD: 각 Task에서 지정 시험을 먼저 추가해 목표 실패를 확인한 뒤 최소 구현으로 통과시킨다. RED는 예상 실패 이유와 개수를 `WORK_STATUS.md`에 기록한다.
- DB: private tmpfs PostgreSQL에는 0000~0015 fresh migration을 적용할 수 있다. 공유 DB에는 별도 승인 전 접속 확인·행수 조회 같은 읽기만 허용한다.
- 데이터: `qa-s5-<run-id>` 가상 계정·판매자·주문·운송장만 사용한다. 실제 고객 정보·실배송·실 알림·실 PG 금지.
- 보존: 원 주문 금액·결제/환불 사건과 불변 출고사건을 삭제·덮어쓰지 않는다. 장애 복구는 새 쓰기/화면 경로를 닫고 전진 보정한다.
- 미검증 표시: 공식 추적 링크와 실제 영업일 기반 “출고 가능일”은 현재 계약 밖이다. 고객에는 택배사·운송장과 “잠정 예상일/휴무일 미반영”만 표시하고 완료로 과장하지 않는다.

## Task 1 — 순수 계약 RED: 상태·마감일·운송장

**파일**

- 생성: `apps/api/src/fulfillment/rules.ts`
- 생성: `apps/api/test/fulfillment-rules.test.mjs`
- 수정: `WORK_STATUS.md`

**RED**

1. `READY→PACKING`, `READY|PACKING→DELAYED`, `DELAYED→PACKING`, `PACKING→SHIPPED` 외 판매자 전이를 거부한다.
2. 서울시간 마감 직전은 같은 날짜, 마감과 같은 시각·직후는 다음 달력 날짜다. 서버 실행 timezone이 달라도 결과가 같다.
3. `DELAYED`는 뒤의 예상일·사유·고객 안내가 모두 필요하다.
4. `SHIPPED`는 allowlist 택배사와 운송장, `other`는 기타 택배사명이 필요하다. 운송장 정규화·길이·문자 제한을 검증한다.
5. 관리자 정정은 `reason`, `customerMessage`, 허용 필드 전체 검증이 필요하며 `CANCELLED` 변경을 거부한다.

**GREEN**

- 외부 상태나 DB가 없는 순수 함수로 validation/normalization/date calculation을 구현한다.
- API 계약의 `expectedShipDate` 필드명은 유지하되, 코드 설명과 화면 라벨에서 “잠정 예상일/휴무일 미반영” 의미를 명확히 한다.

**검증·commit**

- `node --import tsx --test apps/api/test/fulfillment-rules.test.mjs`
- `pnpm --filter @shoppingmall/api typecheck`
- commit: `test(s5): define fulfillment transition rules`

## Task 2 — 0015 schema·migration RED/GREEN

**파일**

- 생성: `apps/api/migrations/0015_s5_fulfillment.sql`
- 수정: `apps/api/migrations/meta/_journal.json`
- 수정: `apps/api/src/db/schema.ts`
- 생성: `apps/api/test/fulfillment-schema-db.test.mjs`
- 수정: `apps/api/test/migration-preview.test.mjs`
- 수정: `apps/api/test/order-schema-guard.mjs`
- 수정: `apps/api/test/order-schema-guard.test.mjs`
- 수정: `WORK_STATUS.md`

**RED**

1. 0015가 없어서 3관계·FK·check·unique/index 검사가 실패한다.
2. 공동출고 설정 singleton, nullable 담당자, version, 감사 actor FK를 검증한다.
3. 출고행의 상태별 필수/금지 필드와 담당 판매자 FK, cutoff 형식, version 비음수를 검증한다.
4. 사건의 개인정보 비저장 열 구성, before/after JSON object, non-null idempotency scope/key/fingerprint, 발송 주문+scope+key unique를 검증한다.
5. fresh 0000~0015 및 0000~0014 기존 DB에 0015 추가 적용이 모두 성공하고 기존 원주문/환불 관계를 바꾸지 않음을 검증한다.

**GREEN**

- 승인된 3관계만 전진 추가한다. `fulfillment_settings(id=1)` 빈 행만 seed하고 판매자를 자동 선택하지 않는다.
- 0010 이후 migration은 현재 저장소 관례대로 SQL·journal·`schema.ts`를 동기화하고 존재하지 않는 snapshot 생성을 억지로 추가하지 않는다.
- 공유 DB 적용 SQL 해시는 이 Task 완료 commit에서 계산해 기록하되 적용하지 않는다.

**검증·commit**

- private tmpfs PostgreSQL에서 schema 목표시험
- `node --import tsx --test apps/api/test/migration-preview.test.mjs apps/api/test/order-schema-guard.test.mjs`
- `pnpm --filter @shoppingmall/api typecheck`
- commit: `feat(s5): add fulfillment persistence schema`

## Task 3 — 주문 제출 시 담당자·cutoff snapshot

**파일**

- 생성: `apps/api/src/fulfillment/repository.ts`
- 수정: `apps/api/src/orders/repository.ts`
- 수정: `apps/api/src/orders/service.ts`
- 생성: `apps/api/test/fulfillment-order-db.test.mjs`
- 수정: `apps/api/test/order-submit-db.test.mjs`
- 수정: `WORK_STATUS.md`

**RED**

1. 직접발송은 원 `shipment_orders.seller_id`, 공동출고는 `fulfillment_settings.owool_seller_id`를 고정한다.
2. 공동출고 담당 미설정, 삭제/비활성 계정만 가진 판매자 설정이면 주문·출고행·프로모션 사용·예약 소비가 모두 남지 않는다.
3. 직접발송 cutoff는 해당 판매자의 승인된 유효정책, 공동출고 cutoff는 S3와 같은 전역정책을 사용한다.
4. 설정/정책이 주문 제출과 경합해도 한 거래의 일관된 담당자·cutoff만 저장한다.
5. 같은 주문 멱등 재시도는 출고행을 추가하지 않는다.

**GREEN**

- 기존 주문 snapshot 삽입 거래 안에서 설정·정책을 잠그고 각 발송 주문의 `PAYMENT_PENDING` 출고행을 함께 생성한다.
- S3 견적 금액·정책 선택 규칙은 변경하지 않는다.

**검증·commit**

- private DB 목표시험과 기존 `order-submit/order-snapshot` 회귀
- `pnpm --filter @shoppingmall/api typecheck`
- commit: `feat(s5): assign fulfillment ownership on order submission`

## Task 4 — 결제 승인→READY·잠정 예상일

**파일**

- 수정: `apps/api/src/payments/processor.ts`
- 수정: `apps/api/src/fulfillment/repository.ts`
- 생성: `apps/api/test/fulfillment-payment-db.test.mjs`
- 수정: `apps/api/test/payment-processing-db.test.mjs`
- 수정: `WORK_STATUS.md`

**RED**

1. 검증된 승인 사건과 같은 거래에서 모든 발송 출고행이 `READY`가 되고 서버 결제시각 기준 잠정 예상일·사건이 한 번 저장된다.
2. 결제 거절/미확정/검토필요는 `PAYMENT_PENDING`을 열지 않는다.
3. 승인 사건 재처리는 상태·사건·version을 중복 변경하지 않는다.
4. 발송 주문 일부의 출고행 누락/담당자 충돌 시 결제 적용을 부분 완료하지 않고 검토 경계로 멈춘다.

**GREEN**

- 기존 주문→예약→재고 잠금 순서와 충돌하지 않도록 출고행 잠금 순서를 고정한다.
- 사건 키는 `system:payment`+원 payment event UUID다.

**검증·commit**

- private DB 목표시험과 `payment-processing/payment-attempt/order-cancel-race` 회귀
- commit: `feat(s5): open fulfillment after verified payment`

## Task 5 — 판매자 목록·상세·전이 API

**파일**

- 생성: `apps/api/src/fulfillment/seller.controller.ts`
- 생성: `apps/api/src/fulfillment/service.ts`
- 수정: `apps/api/src/fulfillment/repository.ts`
- 수정: `apps/api/src/app.module.ts`
- 수정: `apps/api/src/access.ts`
- 수정: `apps/api/test/access.test.mjs`
- 생성: `apps/api/test/fulfillment-seller-http-db.test.mjs`
- 수정: `WORK_STATUS.md`

**RED**

1. 판매자 A가 B 직접발송/공동출고 담당 주문을 목록·ID로 읽거나 바꾸면 404이며 행·사건 변화가 없다.
2. 목록은 활성 seller scope와 결제완료 발송만, 상태 filter·불투명 keyset·기본20/최대50을 지킨다.
3. 상세는 PAID 담당 주문의 기존 배송지와 원/환불완료/남은수량만 반환하고 목록은 이름·전화를 마스킹한다.
4. 상태 전이·Origin·UUID 멱등키·expectedVersion·같은 키 다른 본문·낡은 version을 검증한다.
5. 출고 저장 직후 동일 DB snapshot의 고객 조회 대상 값이 존재한다.

**GREEN**

- seller scope를 SQL WHERE에 포함하고 권한 비교만 애플리케이션에 의존하지 않는다.
- 사건/감사 details에 고객 이름·전화·주소를 넣지 않는다.

**검증·commit**

- private DB HTTP/직접 service 시험, 기존 auth/access 회귀
- commit: `feat(s5): add seller fulfillment workflow`

## Task 6 — 관리자 설정·조회·정정 API

**파일**

- 생성: `apps/api/src/fulfillment/admin.controller.ts`
- 수정: `apps/api/src/fulfillment/service.ts`
- 수정: `apps/api/src/fulfillment/repository.ts`
- 수정: `apps/api/src/app.module.ts`
- 생성: `apps/api/test/fulfillment-admin-http-db.test.mjs`
- 수정: `WORK_STATUS.md`

**RED**

1. 관리자 외 역할은 설정/전체조회/정정 403이다.
2. 담당 판매자 설정은 활성 seller grant가 없는 판매자를 거부하고 expectedVersion·reason·멱등을 지킨다. 기존 주문 담당자 불변.
3. 정정은 before/after·내부 reason·고객 안내·감사행을 원자적으로 1회 기록한다.
4. 허용하지 않은 필드, 부분적으로 불완전한 SHIPPED, `CANCELLED` 정정, 낡은 version은 거부한다.
5. 같은 키 재시도는 고객 안내·사건을 중복 생성하지 않는다.

**GREEN**

- 설정 변경은 `audit_events`, 주문 정정은 출고사건+`audit_events`에 남긴다.
- 관리자 목록은 기본 PII 마스킹, 상세에서만 기존 배송지를 반환한다.

**검증·commit**

- private DB HTTP/경합 시험
- commit: `feat(s5): add fulfillment administration`

## Task 7 — 고객 즉시 조회·S4 환불 결합

**파일**

- 수정: `apps/api/src/orders/repository.ts`
- 수정: `apps/api/src/refunds/service.ts`
- 수정: `apps/api/src/refunds/processor.ts`
- 수정: `apps/api/test/order-customer-http-db.test.mjs`
- 생성: `apps/api/test/fulfillment-refund-db.test.mjs`
- 수정: `apps/api/test/refund-processing-db.test.mjs`
- 수정: `WORK_STATUS.md`

**RED**

1. 고객 자기 주문 상세에 상태·잠정 예상일·고객 지연/정정 안내·택배사·운송장·고객용 사건만 표시한다.
2. 타 고객 주문은 404, 관리자 내부 reason/actor ID/PII 중복·공급자 원문은 응답에서 제외한다.
3. 현재 `SHIPPED`이면 S4 출고 전 승인/집행이 거부된다.
4. 검증 완료 전량 환불은 같은 거래에서 `CANCELLED`+`system:refund` 사건 1개, 부분 환불은 상태 불변과 남은수량 감소다.
5. 환불/출고 동시 경합은 둘 다 성공하지 않으며 잠금 순서가 교착을 만들지 않는다.

**GREEN**

- 고객 view를 기존 endpoint에서 확장한다.
- 환불 processor가 실제 `REFUNDED`를 적용하는 지점에서만 출고 취소를 확정한다.

**검증·commit**

- private DB 목표/경합 시험과 전체 S4 환불 회귀
- commit: `feat(s5): connect fulfillment to customer and refunds`

## Task 8 — 역할별 Flat v2 화면

**파일**

- 생성: `apps/web/app/account/seller/orders/page.tsx`
- 생성: `apps/web/app/account/admin/fulfillment/page.tsx`
- 생성 또는 수정: 고객 주문 상세 컴포넌트(`apps/web/app/account/customer/` 아래 실제 기존 구조에 맞춰 최소 추가)
- 수정: `apps/web/app/account/page.tsx`
- 수정: `apps/web/app/globals.css` 또는 기존 토큰 파일의 필요한 selector만
- 생성: 화면 순수 helper 시험(실제 분리 파일 경로는 구현 전 결정)
- 수정: `WORK_STATUS.md`

**RED**

1. 판매자 상태 filter·빈 목록·오류·권한 없음·저장 중·409 재조회·포장/지연/출고 form 상태를 검증한다.
2. 관리자 설정·filter·상세·정정 before/after/고객 안내를 검증한다.
3. 고객 발송 묶음에 잠정 예상일/휴무일 미반영, 지연·정정 안내, 택배사·운송장을 표시한다.
4. 운송장/사용자 문자열을 HTML로 삽입하지 않고 실제 역할별 DOM·Flat v2 토큰을 유지한다.

**GREEN**

- 기존 account 역할 메뉴에 새 화면 링크를 연결한다.
- 클릭/저장 성공 후 API 재조회로 서버 상태를 즉시 반영한다.
- 택배 추적 링크는 공식 패턴 검증 전 렌더링하지 않는다.

**검증·commit**

- `pnpm --filter @shoppingmall/web typecheck`
- `pnpm lint`
- `pnpm --filter @shoppingmall/web build`
- commit: `feat(s5): add fulfillment role screens`

## Task 9 — 격리 fixture·브라우저 시나리오 준비

**파일**

- 생성: `apps/api/test/qa-fulfillment-ui-fixture.test.mjs`
- 생성: `scripts/qa-s5-fulfillment-browser.mjs`
- 생성: `docs/S5_FULFILLMENT_DEVELOPMENT_TEST_GUIDE.md`
- 수정: `WORK_STATUS.md`

**RED/GREEN**

1. 가상 고객·판매자 A/B·어울몰 판매자·관리자, 직접 A/B+공동출고 PAID 주문과 출고행을 멱등 생성한다.
2. reset은 정확한 run ID/manifest/소유권/FK를 확인하며 외부 참조가 있으면 삭제 전 거부한다.
3. 브라우저 시나리오: 타판매자 404, A 포장/출고→고객 즉시 운송장, 공동출고 담당 seller 처리, cutoff 경계 표시, 지연, 관리자 정정 전후/고객 안내.
4. 1920×1080, 1440×900, 430×844, 키보드 주요 흐름, 가로 overflow, 로딩/오류/빈 상태를 증거화한다. 200%는 UAT로 유지한다.

**검증·commit**

- 먼저 private fixture에서 생성/외부참조 거부/reset 잔류0을 검증한다.
- 브라우저 스크립트 작성만으로 PASS 처리하지 않는다. 실제 실행은 공유 DB 승인 뒤 exact SHA에서 수행한다.
- commit: `test(s5): prepare fulfillment acceptance fixtures`

## Task 10 — 격리 전체 gate·독립 리뷰

**파일**

- 수정: `WORK_STATUS.md`
- 필요 시 보정: 위 Task에서 변경한 파일만

**순서**

1. private tmpfs fresh 0000~0015와 기존 0000~0014→0015 upgrade 시험.
2. 모든 S5.1 목표시험, 전체 `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
3. private DB fixture 전수 잔류0, 컨테이너/네트워크/volume/포트 잔류0.
4. read-only reviewer에게 계약·권한/IDOR·경합/멱등·PII·환불 회귀·migration rollback을 검토시켜 Critical0/Important0까지 보정한다.
5. 최종 제품 SHA를 고정하고 WSL 지정 checkout에서 같은 SHA의 전체 gate를 수행한다. 공유 DB write가 필요한 시험은 아직 실행하지 않는다.

**commit**

- 발견사항별 TDD 보정 commit 후 docs-only checkpoint: `docs(s5): record isolated fulfillment gate`

## Task 11 — 공유 DB 적용 승인 패킷

**파일**

- 수정: `WORK_STATUS.md`
- 필요 시 생성: `docs/S5_FULFILLMENT_SHARED_DB_APPLY.md`

**승인 요청에 반드시 포함**

- 최종 0015 SQL SHA256, exact 제품 commit, 기존 migration15/관계별 실제 행수와 발송 주문0 여부.
- 0이 아닌 기존 발송 주문이 있으면 적용 중단 및 별도 backfill 권장안.
- 정확한 백업 경로/해시/복원 명령 검증, DB 연결 대상 `local-postgres/shoppingmall` 재확인.
- 적용 후 migration16, 신규 singleton1/신규 출고·사건0, 기존 singleton/행수 불변 예상.
- QA run ID, 생성 범위, 외부참조 거부, reset 전수 대상과 임시 컨테이너/포트/프로필 정리 목록.

**경계**

- PMO 경유 별도 승인이 오기 전 migration 적용·seed·브라우저 공유 쓰기를 실행하지 않는다.

## Task 12 — 공유 exact-SHA QA·PR·병합·정리

별도 승인 뒤에만 수행한다.

1. 검증된 백업 후 0015 적용, schema/행수/singleton 대조.
2. WSL exact SHA API/Web 실행, Windows 실제 Chrome 시나리오와 viewport/키보드 증거 수집.
3. QA reset 후 accounts/roles/sellers/orders/payments/refunds/fulfillment/events/audit/session 등 manifest 관련 전수잔류0, 임시자원0.
4. 전체 local/WSL exact-SHA gate 재실행, 독립 최종 C0/I0.
5. `WORK_STATUS.md`에 추적 링크·실제 출고 가능일이 미검증임을 유지하고 공식 링크/영업일 정책 후속안을 PMO에 보고한다.
6. 목적·영향·검증·미검증·rollback을 포함한 Stage PR 생성. 필수 gate가 모두 통과한 일반 내부 Stage면 자동화 절차로 병합하고 merged-main smoke를 수행한다.
7. `main` 포함·원격 복구 ref·clean을 확인한 뒤 S5 branch/worktree와 정확한 임시자원만 정상 정리한다. PR은 이력으로 남긴다.

## 완료 판정

- 완료: 타 판매자 접근 차단, 담당자 고정, 결제 후 포장/지연/출고, 고객 즉시 택배사·운송장, 관리자 정정 전후/사유/고객 안내, cutoff 잠정일, 출고/환불 경합이 API·DB·실제 역할별 브라우저에서 일치한다.
- 미완료로 유지: 공식 추적 링크, 주말·공휴일을 반영한 실제 출고 가능일, 실 택배사 동기화/실배송, 실 문자·메일·푸시, 출고 후 약관·클레임, Oracle/UAT, 운영 전환.
