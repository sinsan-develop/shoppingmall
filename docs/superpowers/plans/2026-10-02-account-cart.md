# 로그인 계정 장바구니 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 고객의 웹·앱 공용 장바구니 CRUD와 현재 상품·재고·배송정책으로 계산하는 서버 견적을 제공한다.

**Architecture:** 계정·옵션 복합키의 저장 행은 선택과 수량만 보관한다. 기존 공개 상품 조회·`CheckoutQuote`를 통해 표시 상태와 금액을 매번 계산하고, 고객 쿠키 세션/Origin을 검사하는 별도 controller가 공개 계약을 제공한다. 예약·주문·결제는 다음 단위이며 장바구니 조작으로 재고를 변경하지 않는다.

**Tech Stack:** PostgreSQL/Drizzle migration, NestJS API, Next.js 16/React 19, Node 24 test/TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-02-account-cart-design.md`

## Global Constraints

- 정본은 `D:\Project\shoppingmall2\.worktrees\flat-v2-prototypes`의 기존 `codex/flat-v2-prototypes`이고 Git 원격은 `github-sinsan-develop` SSH alias만 쓴다. 새 브랜치·worktree를 만들지 않는다.
- 최대 100개 옵션/계정, 수량 1..1,000,000 정수. 서버 가격·현재 공개 버전·재고·배송정책만 사용한다.
- 카트 조작은 재고 예약이 아니며 최종 주문/PG를 성공으로 표시하지 않는다. 계정 범위는 세션에서만 유도한다.
- 기존 판매자 직접 재고 감소·0 차단·증가 승인·상품 개정·판매중지는 변경하지 않는다.
- Windows 전체 `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`; WSL exact SHA 실DB 전체 회귀와 QA 자료/컨테이너 잔류 확인. 로컬 skip은 DB PASS가 아니다.
- 신규 migration은 먼저 격리 DB에서 적용/복구 시험 후 지정 `local-postgres/shoppingmall`에 단계적으로 적용한다. 기존 자료를 삭제하지 않는다.

## Review Focus

1. 같은 계정의 두 기기가 같은 옵션을 동시에 PUT했을 때 수량이 합산되지 않고 마지막 성공 수량 하나만 남는가 → Task 2 동시 시험.
2. 상품 개정 또는 판매중지 뒤 오래된 장바구니 항목이 조용히 사라지지 않고 제거 가능한가 → Task 2 상태/삭제 시험.
3. 다른 고객의 optionId를 추측해도 타 고객 항목을 읽거나 지우지 못하는가 → Task 3 세션별 HTTP 시험.
4. 100번째 항목 허용/101번째 항목 거부를 병행 요청에서도 지키는가 → Task 2 DB 동시 시험.
5. 가격·재고·배송정책이 장바구니 저장 후 바뀌면 새 견적에만 현재값이 반영되고 저장 행에는 가격이 없는가 → Task 2 실DB 시험.

---

### Task 1: 장바구니 관계와 QA 정리

**Files:** `apps/api/src/db/schema.ts`, `apps/api/migrations/0009_s3_customer_cart.sql`, migration meta, `apps/api/scripts/qa-fixture.ts`, `apps/api/scripts/qa-public-fixture.ts`, `apps/api/scripts/qa-catalog-fixture.ts`, `apps/api/test/customer-cart-schema-db.test.mjs`.

**Interfaces:** Produces `customer_cart_items(account_id, option_id, quantity, created_at, updated_at)` 복합 PK/계정·옵션 FK/수량 CHECK. QA 계정 fixture는 계정 삭제 전, 상품 fixture는 옵션 삭제 전 해당 실행 소유 장바구니 행만 정리한다.

- [ ] Step 1: 실DB schema 시험을 먼저 작성한다. 실제 PK/FK/CHECK와 가격·재고·예약 열 부재, 가상 고객 A/B 분리를 단언한다.
- [ ] Step 2: 고유 격리 DB에서 기존 0000~0008만 적용한 exact SHA로 실행한다. Expected: 새 관계 부재의 예상 RED, skip 0.
- [ ] Step 3: Drizzle schema/0009 migration과 정확한 QA reset을 구현한다. 기존 표/행을 수정하지 않는다.
- [ ] Step 4: 같은 격리 DB에 0009 적용, schema 시험과 기존 fixture reset 시험 실행. Expected: 모두 PASS, 해당 fixture 잔류 0.
- [ ] Step 5: 빈 격리 DB에 0000~0009 전체 적용을 별도 확인하고 두 격리 DB/컨테이너를 정확한 이름으로 정리한다. 이후 개발 DB의 읽기 전용 dry-run이 대기 0009만 보여야 한다.
- [ ] Step 6: 변경 파일만 commit/push한 뒤 동일 SHA의 개발 DB에 0009를 적용하고 관계/Drizzle 이력·기존 행 보존을 확인한다.

### Task 2: 계정 범위 저장·목록·현재 견적

**Files:** `apps/api/src/checkout/customer-cart.ts`, `apps/api/test/customer-cart-db.test.mjs`, 기존 `catalog-selection.ts`/`quote.ts`는 필요한 최소 호출 변경만.

**Interfaces:** `CustomerCart(pool).list(accountId)`, `.set(accountId, optionId, quantity)`, `.remove(accountId, optionId)`, `.quote(accountId)`. 목록은 오래된 옵션을 포함한 저장 항목과 구매 가능 상태를 돌려준다. `quote`는 기존 `CheckoutQuote.quote` 결과를 사용한다.

- [ ] Step 1: 실제 DB/가상 판매·고객 fixture 시험을 먼저 작성한다. 고객 A/B 분리, 반복 PUT, DELETE 멱등, 100/101, 품절·판매중지·개정, 현재 가격/배송비, 동시 PUT/한도 요청을 각 행위의 결과로 검사한다.
- [ ] Step 2: exact SHA WSL 개발 DB에서 예상 RED를 확인한다(미구현 서비스 또는 관계의 실패; skip 0). fixture를 `finally`로 정리한다.
- [ ] Step 3: 한 계정/옵션의 원자적 UPSERT와 계정별 직렬화(100개 한도), 현재 공개본·재고 조회, read-only quote 연결을 최소 구현한다. DB 입력은 세션 계정·옵션 ID·수량만 허용한다.
- [ ] Step 4: 목표 실DB 시험 GREEN, 로컬 전체/정적 검사/빌드, WSL exact SHA 전체 순차 실DB 회귀. Expected: fail 0; 환경 skip 별도 표기, QA 행/컨테이너 0. 안전 commit/push.

### Task 3: 고객 전용 공개 API

**Files:** `apps/api/src/checkout/cart.controller.ts`, `apps/api/src/app.module.ts`, `apps/api/test/customer-cart-http-db.test.mjs`.

**Interfaces:** `GET /customer/cart`, `PUT/DELETE /customer/cart/items/:optionId`, `GET /customer/cart/quote`; 세션 고객만, 변경 Origin 검사, 400/401/403/409/503.

- [ ] Step 1: 실제 HTTP·실DB 시험을 먼저 작성한다. 비로그인/판매자/관리자/타 계정/Origin/형식 오류와 PUT 반복·수량/금액 변화를 검사한다.
- [ ] Step 2: exact SHA WSL에서 목표 404/계약 누락 RED를 확인한다. 실행별 가상 계정·상품만 정리한다.
- [ ] Step 3: 기존 `CustomerController`의 세션 검사를 따라 독립 controller 등록, 서비스 오류를 계획한 HTTP 상태로 변환한다.
- [ ] Step 4: 목표 실DB GREEN과 Windows 전체 4 gate/WSL exact SHA 전체 회귀·빌드, QA 잔류 0. 안전 commit/push.

### Task 4: 고객 웹 장바구니 조작·견적 화면

**Files:** `apps/web/app/cart/page.tsx`, `apps/web/app/products/[productId]/page.tsx` 또는 해당 고객 상품 상세 컴포넌트, 필요한 CSS, `apps/web/test/customer-cart-screen.test.mjs`.

**Interfaces:** 상품 상세에서 옵션·수량 PUT 후 `/cart`로 이동. `/cart`에서 수량 직접 수정·제거, 서버 견적·발송 묶음별 금액·품절/오류/빈 상태 표시. UI는 예약/결제 완료를 주장하지 않는다.

- [ ] Step 1: 기존 Flat v2 DOM/테마를 보존하는 화면 행동 시험 RED를 먼저 만든다. 단가×수량, 변경/제거, 서버 견적 3개 묶음, 오류/품절 상태를 점검한다.
- [ ] Step 2: 최소 화면 구현 후 목표 GREEN, 로컬 전체 `test/typecheck/lint/build`.
- [ ] Step 3: 안전 commit/push→WSL exact SHA 실제 브라우저에서 로그인 고객 담기→수량 변경→제거→새 견적·빈/품절 및 키보드/모바일 폭 확인. WSL 전체 실DB 회귀·빌드와 QA 계정/상품/장바구니·포트/컨테이너 0을 기록한다. 실제 200% 확대는 이미 승인된 UAT-03 이월로 UNVERIFIED 유지.

### Completion boundary

이 계획 완료는 **장바구니 저장·현재 재견적**까지만 뜻한다. 15분 예약·만료·재고 경합·주문 제출·통합 결제는 S3.1/S3.3 후속 계약과 시험이 통과하기 전까지 미구현으로 표시한다. Stage PR/병합은 전체 S3와 기존 누적 브랜치 gate가 충족되기 전 실행하지 않는다.
