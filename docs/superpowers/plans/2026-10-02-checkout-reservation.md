# 주문 직전 15분 재고 예약 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 고객이 결제 진행을 시작할 때 장바구니 수량을 DB 시각 기준 15분간 예약하고, 동시 구매·판매자 재고 변경·상품 승인과 충돌해도 초과 판매 없이 종료한다.

**Architecture:** 기존 `inventory_levels`는 실물 보유량과 승인 판매량을 유지하고, 별도 예약 원장·품목 행에서 유효 예약 수량을 뺀 값을 신규 구매 가능량으로 삼는다. 계정이 관련되면 계정, 이어서 상품 ID·옵션 ID·재고 순으로 잠그고 하나의 DB 트랜잭션에서 예약·해제·만료·판매자 재고 0·상품 판매중지를 직렬화한다. 장바구니는 선택만 저장하며 예약은 가격·할인·배송비·주문·결제를 확정하지 않는다.

**Tech Stack:** Node 24, TypeScript, NestJS 12, Next.js 16/React 19, PostgreSQL/Drizzle, node:test, pnpm 11.

**Spec:** `docs/superpowers/specs/2026-10-02-checkout-reservation-design.md`

## Global Constraints

- 작업 정본은 `D:\Project\shoppingmall2`, 원격은 `git@github-sinsan-develop:sinsan-develop/shoppingmall.git`; 기존 clean 격리 worktree의 단일 브랜치에서 작업한다. OneDrive를 작업 정본으로 쓰지 않는다.
- 고객 장바구니 담기·수정·견적은 예약하지 않는다. 예약 기간은 DB `clock_timestamp()` 기준 정확히 15분이고 같은 멱등키 재시도는 연장하지 않는다.
- 계정별 활성 예약은 1개, 품목별 수량은 양의 정수, 장바구니 옵션은 최대 100개/옵션당 1..1,000,000개다. 가격·재고·만료시각·판매자 ID는 클라이언트 입력을 믿지 않는다.
- 판매자의 0 입력은 신규 판매를 즉시 닫되 기존 예약을 보전한다. 대기 0은 마지막 활성 예약 종료 뒤 적용하며, 운영자 취소에는 사유와 감사 사건이 필수다.
- 상품 개정 승인은 활성 예약이 있으면 409, 판매중지 승인은 활성 예약을 취소한다. 기존 동일 옵션명 재고 승계와 승인 전 공개 불변 규칙은 유지한다.
- 이 단위는 예약·해제·표시까지만 구현한다. `CONSUMED`의 실제 주문·결제 소비, PG, 할인 배분, 발송 주문 저장은 S3.2~S4 후속이다. 예약만으로 주문/결제 성공 화면을 보여주지 않는다.
- **실행 전 별도 게이트:** 이 계획 검토·승인과 새 공개 API/데이터 계약·`0010` migration 구현 범위의 신산님 별도 승인을 확인한다. 격리 DB migration 시험과 공유 `WSL-server/local-postgres/shoppingmall` 적용은 구분하며, 공유 DB 적용 직전 SQL·기존 행·복구 영향에 대한 정확한 승인을 다시 확인한다. Oracle·실결제·실발송은 제외한다.
- Windows `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`; SSH branch push 뒤 WSL `/home/daon/deploy/shopping`의 exact SHA로 실DB·브라우저 검증한다. 로컬 DB skip은 통과로 합산하지 않는다. QA 자원은 생성 전 이름·수명·정리를 `WORK_STATUS.md`에 기록한다.

## Review Focus

1. 마지막 1개에 고객 2명이 동시에 접근해도 한 명만 예약하고 다른 쪽은 409인가 → Task 2 실제 두 DB 세션 시험.
2. 예약 종료 뒤 같은 멱등키 재시도나 늦은 정리 작업이 예약을 되살리거나 15분을 연장하지 않는가 → Task 2 반복·만료 시험.
3. 판매자가 예약 중 재고 0을 입력한 직후 신규 고객은 차단되고 기존 고객 예약은 유지되며 종료 뒤 보유 0이 되는가 → Task 3 교차 전이 시험.
4. 다른 고객의 예약 ID를 조회·해제하거나 판매자 세션으로 운영자 취소를 할 수 없는가 → Task 5 HTTP/IDOR 시험.
5. 정책·가격 변경 후 예약 고객에게 예전 견적을 결제 확정액처럼 보여주지 않는가 → Task 4 재견적, Task 6 화면 시험.

---

## 파일·책임 지도

| 파일 | 책임 |
|---|---|
| `apps/api/src/db/schema.ts`, `apps/api/migrations/0010_s3_checkout_reservations.sql`, `apps/api/migrations/meta/_journal.json` | 예약·대기 0 관계와 제약 |
| `apps/api/src/checkout/reservation-service.ts` | 예약 시작·상태·해제·만료, 옵션 잠금·유효 수량·멱등 |
| `apps/api/src/checkout/reservation-quote.ts` | 예약 소유자용 현재 가격·배송정책 재견적; 가격 고정 금지 |
| `apps/api/src/checkout/reservation.controller.ts` | 고객/운영자 인증·Origin·HTTP 오류 계약 |
| `apps/api/src/checkout/reservation-cleanup.ts`, `apps/api/scripts/expire-reservations.ts` | 주기 실행 가능한 멱등 만료 배치와 운영 명령 |
| `apps/api/src/inventory/service.ts`, `apps/api/src/catalog/product-reviews.ts`, `apps/api/src/catalog/product-sale-stops.ts`, `apps/api/src/catalog/controller.ts` | 기존 재고·상품 승인과 예약의 잠금/전이·409 연결 |
| `apps/api/src/checkout/customer-cart.ts`, `apps/api/src/checkout/catalog-selection.ts`, `apps/api/src/catalog/public-products.ts` | 예약 중 카트 변경 차단과 예약 차감 판매 가능 표시 |
| `apps/web/app/cart/page.tsx`, `apps/web/app/account/seller/products/page.tsx`, `apps/web/app/account/admin/proposals/page.tsx`, 관련 화면 시험 | 예약 시작·만료·오류·재견적·대기 0/운영자 취소 화면; 기존 Flat v2 DOM 유지 |
| `apps/api/test/checkout-reservation-*.test.mjs`, 기존 영향 시험 | schema·서비스 동시성·HTTP 권한·회귀 |

### Task 1: 예약 관계·migration·QA 정리 계약

**Files:** Create `apps/api/migrations/0010_s3_checkout_reservations.sql`, `apps/api/test/checkout-reservation-schema-db.test.mjs`; modify `apps/api/src/db/schema.ts`, `apps/api/migrations/meta/_journal.json`, 실행별 QA fixture 정리 스크립트 중 실제 FK 소유 파일만.

**Interfaces:** `checkout_reservations(id,account_id,idempotency_key,status,created_at,expires_at,ended_at,end_reason)`; `checkout_reservation_lines(reservation_id,option_id,quantity)`; `inventory_deferred_stock_targets(id,option_id,target_on_hand,requested_by_account_id,requested_at,status,applied_at)`. 계정+키 유일, 계정당 `ACTIVE` 1개, 옵션당 `pending` 목표 1개, 품목 `(reservation_id,option_id)` PK/FK, 양의 수량, `target_on_hand=0`, 종료 상태·시각 제약을 둔다. 정확한 상태 문자열은 spec의 `ACTIVE/EXPIRED/RELEASED/CANCELLED/CONSUMED`, 대기 목표의 `pending/applied/superseded`로 고정한다.

- [ ] Step 1: `checkout-reservation-schema-db.test.mjs`에 0009 적용 DB에서는 세 관계가 없어서 실패하고 0010 후 PK/FK/CHECK/부분 유일 인덱스·기존 행 보존을 단언하는 시험을 쓴다.
- [ ] Step 2: 이름 붙인 격리 DB에 0000~0009만 적용해 새 관계 부재의 예상 RED를 확인한다. 기존 공유 DB는 읽기만 한다.
- [ ] Step 3: Drizzle schema·0010 SQL·journal을 추가한다. 기존 0000~0009 SQL과 기존 행은 변경하지 않는다.
- [ ] Step 4: 격리 DB에 0010 적용 및 새 빈 DB 전체 적용을 시험하고 schema 시험 GREEN·QA FK 정리 순서·잔류 0을 확인한다.
- [ ] Step 5: 정확한 대상·SQL checksum·rollback(쓰기 경로 중단 후 보정 migration)을 기록하고 격리 DB/컨테이너만 제거한다. 공유 DB 적용은 승인 전 실행하지 않는다.
- [ ] Step 6: 변경 파일만 안전 commit 후 branch에 push한다.

### Task 2: 예약 핵심 서비스와 동시 수량 불변식

**Files:** Create `apps/api/src/checkout/reservation-service.ts`, `apps/api/test/checkout-reservation-service-db.test.mjs`; modify `apps/api/src/checkout/catalog-selection.ts`, `apps/api/src/catalog/public-products.ts`의 판매 가능 수량 투영만.

**Interfaces:** `CheckoutReservations(pool).start(accountId: string, key: string): Promise<ReservationView>`; `.get(accountId: string, id: string): Promise<ReservationView | null>`; `.release(accountId: string, id: string): Promise<ReservationView | null>`; `.expireDue(limit: number): Promise<number>`; `ReservationView = { id: string; status: 'ACTIVE' | 'EXPIRED' | 'RELEASED' | 'CANCELLED' | 'CONSUMED'; expiresAt: Date; lines: { optionId: string; quantity: number }[] }`. `start`는 저장 카트만 읽고 계정→상품 ID→옵션 ID→재고 순으로 잠근다. 상품/옵션은 각각 ID 오름차순이며 판매중지 승인도 상품→옵션→재고 순서다. 모든 수량 질의는 `status='ACTIVE' AND expires_at > clock_timestamp()`로 유효 기간을 판정한다. DB 계정 행 잠금으로 동일 계정 두 요청을 직렬화한다.

- [ ] Step 1: 두 실제 DB 세션의 마지막 1개 경쟁, 최대 100개·빈/구버전/판매중지/품절, 키 반복과 다른 키 충돌, 만료시각 조작 후 중복 만료, 재시작 후 조회, 장바구니 예약분 차감 표시 시험을 쓴다.
- [ ] Step 2: 기존 0009 격리 DB에서 route/서비스 부재의 예상 RED를 확인한다. 환경 skip 0을 확인한다.
- [ ] Step 3: 하나의 트랜잭션에서 위 계정→상품→옵션→재고 잠금, 카트/공개본 재검증, 유효 예약 합계 차감, 15분 DB 시각 예약·품목·감사 기록을 구현한다. 동일 키는 원결과만 돌려주고 만료를 연장하지 않는다.
- [ ] Step 4: 해제·만료를 단방향 상태 전이로 구현하고 `expireDue`는 서로 다른 worker의 중복 처리에도 한 번만 종료하도록 한다. 만료 뒤 신규 판매 가능 수량은 정리 작업 실행 여부와 무관해야 한다.
- [ ] Step 5: 목표 실DB GREEN, 기존 카탈로그/카트·상품 조회 영향 시험 GREEN, 같은 SHA에서 동시·중복 실행 후 예약·QA 행 잔류 0을 확인하고 안전 commit/push한다.

### Task 3: 판매자 재고 0과 대기 목표

**Files:** Modify `apps/api/src/inventory/service.ts`, `apps/api/src/catalog/controller.ts`, `apps/web/app/account/seller/products/page.tsx`; create `apps/api/test/checkout-reservation-stock-db.test.mjs`.

**Interfaces:** 기존 `InventoryService.setStock(actor, optionId, target)` 반환 계약을 보존하되, 예약 중 `target=0`은 `sellable_quantity=0` 즉시·`on_hand_quantity>=활성 예약 수량`·대기 0 기록, `target>0`이 활성 예약 수량 미만이면 409로 매핑 가능한 충돌 오류를 반환한다. 마지막 예약 종료는 Task 2의 동일 잠금 규칙으로 pending 0을 적용한다.

- [ ] Step 1: 예약 1개/복수, 0 입력 직후 신규 409·기존 예약 유지, 최종 해제/만료 뒤 보유 0, 양수 부족 거부·기존 재고 불변, 타 판매자 거부, 승인 대기 재고 증가 불변 시험을 쓴다.
- [ ] Step 2: 기존 `setStock`에서 0 입력이 예약을 무시하는 예상 RED를 확인한다.
- [ ] Step 3: 옵션→재고 잠금 아래 유효 예약 합계를 검증하고 보류 목표 생성/대체/적용·감사를 구현한다. 재고를 예약 수량 밑으로 줄이지 않는다.
- [ ] Step 4: 실DB 교차 경쟁 시험과 기존 `inventory-db`/`product-approve-db` 회귀 GREEN, 판매자 화면의 `새 판매 중단/기존 예약/종료 후 0` 구분 확인 후 commit/push한다.

### Task 4: 상품 승인·판매중지와 현재 견적

**Files:** Modify `apps/api/src/catalog/product-reviews.ts`, `apps/api/src/catalog/product-sale-stops.ts`, `apps/api/src/catalog/controller.ts`, `apps/api/src/checkout/customer-cart.ts`; create `apps/api/src/checkout/reservation-quote.ts`, `apps/api/test/checkout-reservation-product-db.test.mjs`.

**Interfaces:** `ProductReviews.approve`는 현재 공개 옵션의 유효 `ACTIVE` 예약이 있으면 controller가 409로 번역할 도메인 충돌을 내고, `ProductSaleStops.approve`는 동일 상품의 예약을 사유 포함 `CANCELLED`로 만든 후 판매중지를 확정한다. 카트 PUT/DELETE는 같은 계정의 활성 예약 중 409. `quoteReservation(pool: Pool, accountId: string, id: string): Promise<ShipmentQuote>`는 자기 예약 수량을 일반 신규 판매 가능량과 분리해 현재 서버 가격·배송정책으로 재견적하고, 이미 종료/변경된 상품은 충돌을 반환한다.

- [ ] Step 1: 예약 중 개정 승인 보류, 판매중지 승인 시 취소·감사, 기존 예약 고객의 재견적, 가격/배송정책 변경 재견적, 예약 중 카트 수정 거부·해제 후 허용 시험을 쓴다.
- [ ] Step 2: 기존 경로에서 예약 검사가 없는 예상 RED를 확인한다.
- [ ] Step 3: 기존 상품/옵션 잠금 순서와 교착 없는 동일 순서로 승인·중지·카트를 연결하고 주문 접수 시 새 금액 수락이 필요하다는 결과만 반환한다. 이 단위에서 결제 확정 또는 `CONSUMED` 처리는 추가하지 않는다.
- [ ] Step 4: 목표 실DB GREEN과 기존 `product-approve-db`, `sale-stop-db`, `customer-cart-db`, `checkout-quote-db` 회귀 GREEN 후 commit/push한다.

### Task 5: 고객·운영자 API와 만료 작업

**Files:** Create `apps/api/src/checkout/reservation.controller.ts`, `apps/api/src/checkout/reservation-cleanup.ts`, `apps/api/scripts/expire-reservations.ts`, `apps/api/test/checkout-reservation-http-db.test.mjs`; modify `apps/api/src/app.module.ts`.

**Interfaces:** `POST /customer/checkout/reservations` (`Idempotency-Key` UUID 필수), `GET/DELETE /customer/checkout/reservations/:id`, `POST /checkout/admin/reservations/:id/cancel` (`reason` 1..500자). 고객은 자기 세션만, 운영자 취소는 관리자 세션·신뢰 Origin만 허용한다. HTTP 400/401/403/404/409/503은 spec과 일치시키고 다른 고객 예약 ID는 404. `expireDue(limit)`를 호출하는 배치는 DB 시각·멱등 처리만 수행하며 API 프로세스마다 무제한 타이머를 두지 않는다.

- [ ] Step 1: 비로그인/타 역할/Origin/타 계정 IDOR, 키 형식, 재시도, 운영자 사유, 404·409·503, 배치 2회 실행 시험을 쓴다.
- [ ] Step 2: 목표 route 404의 예상 RED를 확인한다.
- [ ] Step 3: 기존 `readToken`/`requireOrigin`/`AuthRepository` 패턴으로 controller와 오류 번역을 구현한다. 응답에 타 고객 예약 수량·SQL·자격정보를 포함하지 않는다.
- [ ] Step 4: 만료 배치의 호출 명령·운영 간격·실패 재시도와 인스턴스 중복 안전성을 문서화한다. 만료 작업이 멈춰도 신규 판매 가능량 계산이 정확한지 실DB로 확인한다.
- [ ] Step 5: HTTP·배치 실DB GREEN, 기존 인증/카트 route 회귀 GREEN 후 commit/push한다.

### Task 6: 고객·판매자·관리자 화면과 실제 브라우저

**Files:** Modify `apps/web/app/cart/page.tsx`, `apps/web/app/account/seller/products/page.tsx`, `apps/web/app/account/admin/proposals/page.tsx`, `apps/web/test/customer-cart-screen.test.mjs`, `scripts/qa-cart-browser.mjs`; create `apps/web/test/checkout-reservation-screen.test.mjs`.

**Interfaces:** 고객은 `/cart`에서 예약 시작·DB 만료시각·남은 시간 안내·명시적 해제·만료/운영자 취소 뒤 재견적을 본다. 브라우저 타이머는 표시만 한다. 예약 중 수량 수정/제거는 비활성 또는 409 안내 후 해제 경로를 제공한다. 판매자는 대기 0, 관리자는 사유 있는 취소를 자기 권한으로만 본다.

- [ ] Step 1: 기존 Flat v2 DOM/폰트 크기·접근 가능한 버튼/상태 문구를 보존하는 고객 예약/만료/재견적·판매자 대기 0·운영자 취소 화면 시험을 작성해 예상 RED를 확인한다.
- [ ] Step 2: 최소 화면을 구현해 시험 GREEN, `pnpm test/typecheck/lint/build` exit 0을 확인한다.
- [ ] Step 3: branch 안전 commit/push→WSL 지정 checkout exact SHA에서 고객 2명 경쟁·15분 만료 조작·판매자 0·관리자 취소를 가상 계정과 실제 브라우저로 확인한다. 430/1440/1920px·키보드·오류/빈 상태를 기록하고 200% 확대는 UAT-03 미검증으로 남긴다.

### Task 7: 전체 회귀·DB 적용 게이트·기록

**Files:** Modify `WORK_STATUS.md`, `.github/PR_REQUEST.md`, `docs/DEVELOPMENT_ENVIRONMENT.md`; 제품 코드 변경은 앞 Task에서만.

**Interfaces:** 로컬 commit→SSH 원격 branch→WSL 지정 checkout exact SHA. 작업 상태에 시작/중간/완료·오류 횟수·QA 자원 이름/수명/정리·검증/미검증을 누적한다.

- [ ] Step 1: 격리 DB의 0009→0010와 새 DB 0000→0010 migration/복구 시험 증거, 공유 DB dry-run SQL/checksum·기존 행 수를 기록한다. 승인 전 공유 DB 쓰기는 하지 않는다.
- [ ] Step 2: 신산님이 정확한 공유 DB 적용을 승인한 경우에만 `WSL-server/local-postgres/shoppingmall`에 0010을 적용하고 migration 이력·기존 행 보존·시험자료 정리 확인. 승인 전에는 독립 가능한 로컬/격리 DB 검증만 진행한다.
- [ ] Step 3: 로컬 전체 4 gate와 WSL exact SHA 실DB 전체 순차 시험·실제 API/브라우저 경로를 검증한다. skip/미실행은 PASS가 아니다.
- [ ] Step 4: QA 계정·예약·상품·감사 행, 정확히 이름 붙인 DB/컨테이너/포트의 잔류 0과 Git clean, 재현·rollback을 기록한다. PR 본문에는 목적·영향·검증·미검증·복구를 기재하고 독립 리뷰의 Critical/Important 0을 확인한다.
- [ ] Step 5: 이 예약 단위의 승인/검증 경계가 모두 충족되면 기존 SSH `pr-create/**` 경로로 PR을 생성한다. 실제 결제·Oracle UAT나 미구현 주문 소비를 이 PR의 PASS로 표시하지 않는다.

## Completion boundary

예약 ID와 15분 DB 만료, 동시 수량 불변식, 판매자 0 대기·상품 중지, 고객/운영자 권한과 화면이 같은 exact SHA에서 재현되면 이 계획의 구현 완료 후보이다. S3 전체(프로모션·분할 주문·통합 결제 대상), S4 결제, Oracle 인수와 공개 출시는 별도로 남는다. 새 API/schema/공유 DB 승인이나 실제 실DB 증거가 없으면 완료로 표시하지 않는다.
