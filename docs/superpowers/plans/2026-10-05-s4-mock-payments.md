# S4.1 Mock Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미 저장된 한 통합 주문을 검증된 모의 결제 사건으로 한 번만 확정하고, 발송 주문·재고·쿠폰을 일관되게 전이한다.

**Architecture:** PostgreSQL에 결제 시도와 정규화 사건을 분리 저장한다. 공급자 adapter가 검증한 사건을 먼저 기록하고 별도 DB 거래에서 주문·예약·재고·쿠폰을 확정한다. 고객 HTTP는 시도/조회만 제공하고 브라우저 복귀 자체는 승인 근거가 아니다.

**Tech Stack:** NestJS 12, TypeScript, PostgreSQL/pg, Drizzle SQL migration, Node test runner, Next.js 16.

**Spec:** `docs/design/S4_PAYMENT_CONTRACT_DRAFT.md`; 상위 범위 `docs/WORK_PLAN.md` S4.1, `docs/design/DESIGN.md` R05~R07.

## Global Constraints

- 단일 writer: `codex/s4-payment-refund` / `D:\Project\shoppingmall2\.worktrees\s4-payment-refund`; `main` 직접 수정 금지.
- 기존 0000~0012 migration과 저장된 주문·금액·주소를 바꾸거나 삭제하지 않는다. 0013은 전진 추가만 한다.
- mock은 `APP_ENV=development` + `PAYMENT_MODE=mock` 양쪽을 명시한 로컬/WSL 루프백 환경만 허용한다. 기본은 `disabled`다.
- 실제 PG·카드번호·공급자 원문 payload·실제 Secret·외부 비용·Oracle·S4.2 환불은 범위 밖이다.
- 공유 `WSL-server/local-postgres/shoppingmall` 0013 적용은 이번 구현 승인에 포함되지 않는다. 별도 증거와 승인 전 적용하지 않는다.
- 개발은 Windows 로컬, WSL 검증은 SSH alias로 push한 exact SHA를 지정 checkout에서 Git으로 받는다. 격리 QA 자원은 사전 이름/수명/정리 기록, 사용 후 잔류 0을 확인한다.

## Review Focus

1. 늦은 승인과 만료 작업이 동시에 들어와도 한쪽만 상태 전이를 하고 돈 받은 미출고는 운영 검토로 남는가? Task 4 경쟁 시험.
2. 동일 사건 ID에 다른 금액/주문이 재전송되면 기존 사건을 덮거나 승인으로 오인하지 않는가? Task 3 충돌 시험.
3. 다른 사건 ID로 같은 시도가 승인돼도 재고와 쿠폰이 두 번 차감되지 않는가? Task 4 중복 시험.
4. 판매중지로 `sellable_quantity=0`인 재고의 예약 확정이 실제 `on_hand_quantity`만 줄이고 음수 판매가능량을 만들지 않는가? Task 4 재고 시험.
5. 타인 주문/시도 ID 및 잘못된 Origin·모드로 API를 호출해도 금액·상태·개인정보가 노출되거나 mock이 공개되지 않는가? Task 5 권한·환경 시험.

---

### Task 1: 결제 스키마와 전진 migration

**Files:**
- Create: `apps/api/migrations/0013_s4_payments.sql`
- Modify: `apps/api/migrations/meta/_journal.json`, `apps/api/src/db/schema.ts`
- Test: `apps/api/test/payment-schema-db.test.mjs`, `apps/api/test/order-schema-db.test.mjs`

**Interfaces:**
- Consumes: 0012의 `checkout_orders`, `shipment_orders`, `order_status_events`, 예약·쿠폰 관계.
- Produces: `payment_attempts`, `payment_events`, 후속 승인된 `payment_event_conflicts`, `PAID` 주문/발송/상태 사건, `paid_at`; Task 3/4의 SQL 정본.

- [ ] **Step 1: 실패하는 실제 DB 시험 작성.** 0012까지 적용한 격리 DB에서 두 결제 테이블 부재, 0013 후 테이블/유일키/금액·상태 제약, 기존 만료 행 보존, `PAID` 행 수용을 검사한다. 시험명은 위 변경에 따라 실패하는 행위를 드러낸다.
- [ ] **Step 2: RED 확인.** 격리 PostgreSQL에서 `node --import tsx --test apps/api/test/payment-schema-db.test.mjs`; 기대: 0013 전 새 관계 부재로 목표 실패, 환경 skip 0.
- [ ] **Step 3: SQL·Drizzle 정의.** UUID 주문+멱등키/공급자+주문ID 및 공급자+사건ID 유일, 정수 원 금액 CHECK, 사건 지문/처리 상태 CHECK, FK·필요 인덱스. 기존 0012 파일은 불변.
- [ ] **Step 4: GREEN과 기존 스키마 회귀.** 0000~0013 fresh DB 적용, 목표 시험 pass/skip 0. 기존 `order-schema-db.test.mjs`가 0012의 `PAID` 거부를 역사적 가정으로 검사하므로 새 허용 행위를 시험하고 무효 상태 거부로 회귀 목적을 유지한다. 기존 order/expiry schema DB 시험 pass.
- [ ] **Step 5: 변경 파일만 커밋.** `feat(payment): add durable attempt and event schema`.

### Task 2: fail-closed mock adapter와 사건 정규화

**Files:**
- Create: `apps/api/src/payments/adapter.ts`, `apps/api/src/payments/mock-adapter.ts`
- Test: `apps/api/test/payment-adapter.test.mjs`

**Interfaces:**
- Consumes: 서버 주문 ID와 저장된 원화 금액.
- Produces: `PaymentAdapter.start(orderId, amountWon)`과 `verify(providerOrderId, testOutcome)`의 정규화 결과 `{provider, providerOrderId, eventId, paymentId, orderId, amountWon, outcome}`; Task 3/5가 사용.

- [ ] **Step 1: 실패 시험 작성.** disabled 기본값, mock+development 조합만 허용, 0원 no-charge는 PG 미호출, approve/decline/delay 결과와 1원 불일치·잘못된 provider/order 식별자 검증을 독립 기대값으로 작성.
- [ ] **Step 2: RED 실행.** `node --import tsx --test apps/api/test/payment-adapter.test.mjs`; 기대: 모듈/기능 부재 때문에 목표 실패.
- [ ] **Step 3: adapter 최소 구현.** 고객 입력 금액·승인 상태를 신뢰하지 않고 공급자 재조회 경계에서 정규화; 실제 PG 구현 없음.
- [ ] **Step 4: GREEN 및 `pnpm test`.** 목표 pass, 전체 기존 시험 0 fail; DB 환경 skip은 따로 기록.
- [ ] **Step 5: 변경 파일만 커밋.** `feat(payment): add fail-closed mock adapter`.

### Task 3: 시도·검증 사건의 영속성과 멱등성

**Files:**
- Create: `apps/api/src/payments/repository.ts`, `apps/api/src/payments/service.ts`
- Test: `apps/api/test/payment-attempt-db.test.mjs`

**Interfaces:**
- Consumes: Task 1의 관계, Task 2의 정규화 사건.
- Produces: `startPaymentAttempt(pool, accountId, orderId, idempotencyKey, testOutcome)` 및 `getPaymentAttempt(pool, accountId, orderId, attemptId)`; `recordVerifiedPaymentEvent(pool, attemptId, verified)`가 Task 4/5에 사용.

- [ ] **Step 1: 실패하는 DB 시험 작성.** 소유자 전용 접근, 동일 키·입력 재조회/다른 입력 충돌, 공급자 사건 ID 중복은 한 행, 같은 ID의 다른 지문은 거부, 사건은 처리 전 `PENDING_PROCESSING`으로 남음을 확인.
- [ ] **Step 2: RED 실행.** 격리 DB에서 목표 시험, skip 0/예상 실패 확인.
- [ ] **Step 3: 최소 영속 로직 작성.** 계정→주문 순서 잠금, 저장된 `payable_won` 사용, SHA-256 요청/사건 지문, 원문/카드/PII 비저장. 후속 승인에 따라 동일 공급자 사건 ID의 내용 충돌은 원사건을 바꾸지 않고 별도 충돌 행을 커밋한 뒤 거부한다.
- [ ] **Step 4: GREEN 및 기존 주문 DB 회귀.** 목표·전체 관련 DB 시험 pass/skip 0.
- [ ] **Step 5: 변경 파일만 커밋.** `feat(payment): persist verified payment attempts and events`.

### Task 4: 단일 결제 확정 거래와 만료 경쟁

**Files:**
- Create: `apps/api/src/payments/processor.ts`
- Modify: `apps/api/src/orders/repository.ts`, 필요 시 `apps/api/src/orders/expiry-core.ts`
- Test: `apps/api/test/payment-processing-db.test.mjs`, 기존 `order-expiry-db.test.mjs`

**Interfaces:**
- Consumes: Task 3 사건/시도, 예약·쿠폰·재고·주문 S3 관계.
- Produces: `processVerifiedPaymentEvent(pool, eventId)`가 성공 시 한 거래로 `PAID`, 실패/만료는 사건 상태 근거를 반환; Task 5에서 호출.

- [ ] **Step 1: 실패 DB 시험 작성.** 승인 전 고객 복귀는 미확정, 성공은 한 번만 재고/쿠폰/예약/발송 확정, 1원 불일치·역순·만료/동시성·마지막 재고·판매중지·0원 경계 확인.
- [ ] **Step 2: RED 실행.** 격리 DB 목표 실패/skip 0 확인.
- [ ] **Step 3: 거래 구현.** 계정→주문→쿠폰→예약→상품/옵션/재고 고정 잠금, 사건 선기록 후 별도 상태 거래; 실패 시 사건 `PENDING_PROCESSING` 유지, 늦은 승인 `REVIEW_REQUIRED`.
- [ ] **Step 4: GREEN과 주문/만료 회귀.** 목표·관련 DB 시험 pass/skip 0, 전체 suite 0 fail.
- [ ] **Step 5: 변경 파일만 커밋.** `feat(payment): settle verified approvals exactly once`.

### Task 5: 고객 API·모의 결제 화면과 단계 검증

**Files:**
- Modify: `apps/api/src/orders/customer.controller.ts`, `apps/api/src/app.module.ts`, `apps/web/app/cart/page.tsx`, `apps/web/app/account/customer/page.tsx`
- Test: `apps/api/test/payment-customer-http-db.test.mjs`, 웹 관련 시험 파일.

**Interfaces:**
- Consumes: Task 3/4 서비스와 Task 2의 모드 제어.
- Produces: 승인된 고객 POST/GET 시도 API와 주문 GET의 `PAID`/`paidAt`, 고객 화면의 명시적 모의 결제·실패/지연/재시도 표시.

- [ ] **Step 1: 실패 HTTP/웹 시험 작성.** 다른 고객 404, 비로그인 401, 판매자 403, Origin 거부, 동일 키 다른 입력 409, 조회 무상태, mock 비활성 거부, 주문 `PAID`/시각 표시.
- [ ] **Step 2: RED 실행.** 목표 시험 실패/DB skip 0 확인.
- [ ] **Step 3: 최소 API/화면 구현.** 주문 저장 금액만 사용; 고객 복귀를 확정으로 표시하지 않음. 390px·키보드 흐름 수동 확인.
- [ ] **Step 4: GREEN·전체 회귀.** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`; DB 시험은 격리 DB에서 skip 0, 실제 브라우저 증거 분리.
- [ ] **Step 5: 변경 파일만 커밋.** `feat(payment): expose mock payment attempt flow`.

### Task 6: exact-SHA WSL 검증과 적용 경계 기록

**Files:**
- Modify: `WORK_STATUS.md`, `docs/DEVELOPMENT_ENVIRONMENT.md`, 필요 시 `.github/PR_REQUEST.md`
- Test: 전체 로컬/WSL suite, 실제 브라우저 mock 흐름, migration fresh/apply 검증.

**Interfaces:**
- Consumes: Task 1~5의 안전한 커밋들.
- Produces: 동일 SHA·migration 해시·격리 자원 정리·미검증/rollback 기록과 공유 DB 적용 별도 승인 패킷.

- [ ] **Step 1: 시험 계획을 작업현황에 먼저 기록.** 전용 격리 PG/Node/브라우저 자원 이름·수명·정리 및 공유 DB 무변경을 명시.
- [ ] **Step 2: 원격 push → WSL 지정 checkout exact SHA.** SSH alias만 사용; checkout에 dirty/타인 변경이 있으면 덮지 않음.
- [ ] **Step 3: WSL 격리 DB 전체 migration/회귀·실제 브라우저 성공/실패/지연·중복/재시도, 390px·키보드 시험.** 각 실제 증거와 미검증 분리.
- [ ] **Step 4: 자원 정리·상태/복구 기록·최종 리뷰.** 임시 PG/컨테이너/포트/프로필 잔류 0을 확인하고 공유 DB는 불변, 실제 PG/Oracle/UAT 미검증 유지.
- [ ] **Step 5: 증거와 문서만 커밋/push.** S4.2 계약·공유 DB 적용은 별도 승인 후 이어간다.
