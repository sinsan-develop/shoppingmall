# S4.2 Pre-shipment Refunds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 결제 완료 발송 주문의 출고 전 수량 부분·전량 취소를 고객이 요청하고 관리자가 금액·재고 복원을 결정해 모의 환불 사건까지 안전하게 완료한다.

**Architecture:** 원 주문·결제 스냅샷은 불변으로 두고 별도 환불 사례, 품목, 시도, 검증 사건, 사건 충돌, 상태 이력을 0014로 추가한다. 순수 함수가 할인 후 품목액을 수량 순서에 맞춰 원 단위로 배분하고, 거래 서비스가 주문/사례를 잠가 상한·멱등·배송비 1회를 보장한다. 고객과 관리자 NestJS controller 및 Next.js 역할 화면이 같은 계약을 사용한다.

**Tech Stack:** TypeScript, NestJS 12, PostgreSQL/Drizzle SQL, Next.js/React, Node test runner, pnpm.

**Spec:** `docs/design/S4_REFUND_CONTRACT_DRAFT.md`

## Global Constraints

- 작업 위치는 기존 `D:\Project\shoppingmall2\.worktrees\s4-payment-refund`, branch는 `codex/s4-payment-refund`; 새 branch/worktree를 만들지 않는다.
- 원 `checkout_orders`, `shipment_orders`, `shipment_order_lines`, 프로모션·결제 스냅샷을 환불 때문에 수정하지 않는다.
- 출고 전만 구현한다. 출고 근거가 없으면 출고 전으로 추정하지 않고, S5.2 후출고 정책·증빙은 구현하지 않는다.
- mock 환불은 development+loopback에서만 쓰고 공유 DB 0014, 실제 PG, Oracle, UAT는 별도 승인 전 수행하지 않는다.
- 관리자 명시 `on_hand_only`만 환불 완료와 같은 거래에서 on-hand를 한 번 복원한다. sellable과 판매중지 상태는 변경하지 않는다.
- 모든 쓰기는 검증된 세션·역할·Origin·UUID 멱등키를 검사한다. 판매자는 환불을 결정·실행하지 않는다.

## Review Focus

- 동시에 같은 마지막 수량을 승인하는 두 요청 중 하나만 성공하고 원 수량·원 결제액을 넘지 않아야 한다.
- 일부 환불이 처리 중인 동안 마지막 전량 사례가 배송비를 조기 예약하거나 두 번 환급하지 않아야 한다.
- 동일 공급자 사건 ID에 다른 지문/시도가 오면 원 사건을 덮지 않고 충돌 이력을 남겨야 한다.
- 판매중지 또는 보유 근거가 없는 품목에서 `on_hand_only`가 재고를 늘리거나 sellable을 열지 않아야 한다.
- 타 고객 UUID를 바꾼 조회가 사례 존재 여부·관리자 메모를 노출하지 않아야 한다.

---

### Task 1: 계약 정합화와 수량별 금액 계산

**Files:**
- Modify: `docs/design/S4_REFUND_CONTRACT_DRAFT.md`
- Create: `apps/api/src/refunds/allocation.ts`
- Create: `apps/api/test/refund-allocation.test.mjs`

**Interfaces:**
- Produces: `allocateIncrementalRefundWon(totalPaidWon: number, originalQuantity: number, alreadyApprovedQuantity: number, requestedQuantity: number): number`
- Produces: 확정된 7개 endpoint(POST 3, GET 4), 6관계, 상태·DTO·오류 계약.

- [ ] **Step 1:** 문서의 승인 상태를 갱신하고 endpoint를 7개로 명시한다. `refund_cases` 금액·상태, 여섯 관계, `restockMode`와 출고 전 근거를 정합화한다.
- [ ] **Step 2:** 10,000원/3개의 순차 환불이 3,333+3,333+3,334, 중간 시작·전량·0원·범위 오류를 검증하는 실패 테스트를 작성한다.
- [ ] **Step 3:** `pnpm exec tsx --test apps/api/test/refund-allocation.test.mjs`가 모듈 부재로 실패하는지 확인한다.
- [ ] **Step 4:** 안전 정수·비음수·수량 상한을 검사하고 누적 floor 차이를 반환하는 최소 함수를 구현한다.
- [ ] **Step 5:** 목표 테스트와 전체 비-DB suite를 실행해 통과를 확인한다.
- [ ] **Step 6:** `feat(refunds): define incremental refund allocation`으로 커밋하고 ledger에 결과를 기록한다.

### Task 2: 0014 추가식 데이터 계약

**Files:**
- Create: `apps/api/migrations/0014_s4_refunds.sql`
- Modify: `apps/api/migrations/meta/_journal.json`
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/test/refund-schema-db.test.mjs`
- Modify: `apps/api/test/migration-preview.test.mjs`

**Interfaces:**
- Consumes: Task 1의 승인 계약.
- Produces: `refund_cases`, `refund_case_lines`, `refund_attempts`, `refund_events`, `refund_event_conflicts`, `refund_case_events`.

- [ ] **Step 1:** 신규 관계 부재, FK/상태/금액/고유키/지문/복원량 제약을 검증하는 DB 테스트와 migration preview 기대값을 먼저 작성한다.
- [ ] **Step 2:** 0013 격리 DB에서 테스트가 관계 부재로 실패하는지 확인한다.
- [ ] **Step 3:** 0014 SQL·journal·Drizzle schema를 추가한다. 기존 테이블은 변경하지 않는다.
- [ ] **Step 4:** fresh 격리 PostgreSQL에 0000~0014를 적용하고 schema 테스트·dry-run 15 applied/0 pending을 확인한다.
- [ ] **Step 5:** `feat(refunds): add pre-shipment refund ledger`로 커밋하고 ledger에 결과를 기록한다.

### Task 3: 환불 도메인과 모의 공급자 사건 처리

**Files:**
- Create: `apps/api/src/refunds/adapter.ts`
- Create: `apps/api/src/refunds/mock-adapter.ts`
- Create: `apps/api/src/refunds/repository.ts`
- Create: `apps/api/src/refunds/service.ts`
- Create: `apps/api/src/refunds/processor.ts`
- Create: `apps/api/test/refund-processing-db.test.mjs`

**Interfaces:**
- Produces: `createRefundCase`, `decideRefundCase`, `recordVerifiedRefundEvent`, `processVerifiedRefundEvent`, 사례 조회 함수.
- Consumes: Task 1 계산 함수와 Task 2 관계.

- [ ] **Step 1:** 원 스냅샷 불변, 부분/전량 배송비, 중복·경합·충돌, 0원, 관리자 재고 `none/on_hand_only`, 판매중지 거부를 실제 DB로 검증하는 실패 테스트를 작성한다.
- [ ] **Step 2:** 테스트가 도메인 모듈 부재/행동 미구현으로 실패하는지 확인한다.
- [ ] **Step 3:** 요청 지문·멱등 생성, 관리자 승인/거절, 거래 잠금·상한·금액 고정, 모의 공급자 정규화 사건과 충돌 보존, 완료/재고 1회 적용을 최소 구현한다.
- [ ] **Step 4:** 목표 DB 테스트와 기존 payment/order DB 테스트를 실행해 통과를 확인한다.
- [ ] **Step 5:** `feat(refunds): process idempotent mock refunds`로 커밋하고 ledger에 결과를 기록한다.

### Task 4: 고객·관리자 환불 HTTP 계약

**Files:**
- Create: `apps/api/src/refunds/customer.controller.ts`
- Create: `apps/api/src/refunds/admin.controller.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/refund-http-db.test.mjs`
- Modify: `apps/api/test/access.test.mjs`

**Interfaces:**
- Produces: 고객 POST/GET list/GET detail 3개, 관리자 POST create/GET list/GET detail/POST decision 4개 endpoint.
- Consumes: Task 3 서비스.

- [ ] **Step 1:** 401/403/404/409/503, Origin, 본인 범위, 관리자 결정, 판매자 금지, 같은 키 재조회/다른 본문 충돌을 검증하는 HTTP 실패 테스트를 작성한다.
- [ ] **Step 2:** route 부재로 기대한 404/잘못된 결과를 확인한다.
- [ ] **Step 3:** DTO를 엄격히 검증하고 기존 세션·Origin 패턴과 mock loopback gate를 재사용하는 controller를 구현한다.
- [ ] **Step 4:** 목표 HTTP DB 테스트와 기존 auth/payment HTTP 테스트를 실행해 통과를 확인한다.
- [ ] **Step 5:** `feat(refunds): expose customer and admin refund APIs`로 커밋하고 ledger에 결과를 기록한다.

### Task 5: 고객·관리자 역할 화면

**Files:**
- Modify: `apps/web/app/cart/page.tsx`
- Create: `apps/web/app/account/admin/refunds/page.tsx`
- Modify: `apps/web/app/account/page.tsx`
- Modify: `apps/web/app/styles.css`
- Create: `apps/web/test/customer-refunds.test.mjs`
- Create: `apps/web/test/admin-refunds.test.mjs`

**Interfaces:**
- Consumes: Task 4 endpoint와 상태/DTO.
- Produces: 결제 완료 주문의 발송 주문·옵션별 수량/사유 요청, 관리자 사례 필터·상세·승인/반려·재고 복원 선택.

- [ ] **Step 1:** 구매자 수량/사유·견적/상태, 관리자 금액/이력·결정·`on_hand_only`, 좁은 화면/키보드 이름을 검증하는 렌더·요청 실패 테스트를 작성한다.
- [ ] **Step 2:** 컴포넌트/링크 부재로 실패하는지 확인한다.
- [ ] **Step 3:** 현재 Flat v2·폰트 크기·카드 구조를 유지해 고객/관리자 화면과 안전한 불명확 결과 재조회 동작을 최소 구현한다.
- [ ] **Step 4:** 목표 web 테스트, web typecheck/build와 기존 checkout/account 회귀를 실행한다.
- [ ] **Step 5:** `feat(refunds): add customer and admin refund screens`으로 커밋하고 ledger에 결과를 기록한다.

### Task 6: 격리 통합 QA·문서·독립 review

2026-10-05 PMO 추가 승인: 리뷰 결함 해소를 위해 고객 본인 결제완료 주문의 목록 GET 1개와 이전 주문 선택 UI를 추가한다. 상세 계약은 `S4_REFUND_CONTRACT_DRAFT.md`의 Task 6 보정 절을 따른다. 고객/타인/역할·잘못된 cursor/limit·동일시각 페이지 경계·새 세션/다음 주문 후 이전 주문 접근을 검증한다. 승인 이후 판매중지/재고행 부재는 전체 복원0·검토상태·공급자 성공 보존·완료시각 없음으로 보정하고 판매중지와 실제 DB 잠금 경합·중복 사건을 검증한다. 사유 코드/배송비 안내는 기존 승인 계약과 일치시킨다. 새 schema·공유 DB 적용·실 PG·Oracle/S5.2는 포함하지 않는다.

**Files:**
- Create or modify only if needed: `apps/api/scripts/qa-refund-fixture.ts`, associated test
- Modify: `WORK_STATUS.md`, `docs/DEVELOPMENT_ENVIRONMENT.md`

**Interfaces:**
- Consumes: Tasks 1–5 전체.
- Produces: fresh 격리 DB, local/WSL exact SHA, 실제 브라우저 가능 경로, 정리/미검증 증거.

- [ ] **Step 1:** fresh 격리 PostgreSQL 0000~0014에서 실제 HTTP 고객 요청→관리자 승인→모의 사건→DB/재고/배송비/원 주문 불변을 검증한다.
- [ ] **Step 2:** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`을 실행하고 결과를 읽는다.
- [ ] **Step 3:** branch를 SSH alias로 push하고 WSL 지정 checkout을 exact SHA로 맞춘 뒤 전용 격리 DB에서 같은 검증을 실행한다. 공유 `shoppingmall`에는 0014를 적용하지 않는다.
- [ ] **Step 4:** 실제 브라우저에서 고객/관리자, 390px, 키보드 흐름을 확인한다. 도구가 막히면 자동 HTTP와 구분해 미검증으로 남기고 S4 완료를 주장하지 않는다.
- [ ] **Step 5:** QA 계정/행/컨테이너/네트워크/포트/백업을 정확한 이름으로 정리하고 잔류를 확인한다.
- [ ] **Step 6:** whole-branch Critical/Important review를 수행하고 발견을 RED→GREEN 한 번의 fix pass로 처리한다.
- [ ] **Step 7:** 증거·오류·미검증·rollback을 WORK_STATUS/환경 문서에 기록하고 커밋한다. 공유 DB 0014 적용 전 최종 SQL 해시·dry-run·백업/행수·복구안을 PMO에 별도 요청한다.
