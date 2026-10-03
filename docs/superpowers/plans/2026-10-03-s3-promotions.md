# S3.2 통합 프로모션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고객이 목록 또는 공용 코드로 할인·배송비 지원을 선택하고, 관리자가 발행·중지하며, 서버가 발송 주문별 실제 금액과 사용 한도를 일치시키는 S3.2를 구현한다.

**Architecture:** 기존 배송 정책·재고 예약·발송 묶음 견적을 재사용하고, 별도 `promotions` 경계에 불변 규칙 버전과 발행·점유·사용 원장을 둔다. 목록과 코드는 같은 혜택 ID로 합류하고 주문 접수 시 DB transaction에서 재검증·점유한다. 금액 스냅샷의 주문 저장·PG 콜백 연결은 S3.3/S4가 이 원장을 소비한다.

**Tech Stack:** Node 24, TypeScript, NestJS 12, Next.js 16/React 19, PostgreSQL/Drizzle, node:test, pnpm 11.

**Spec:** `docs/design/S3_PROMOTION_CONTRACT_DRAFT.md`(신산님 상세 설계 승인). 상위 범위는 `docs/WORK_PLAN.md` S3.2와 `docs/design/DELIVERY_SCOPE_ADDENDUM.md` 28~32행이다.

## Global Constraints

- 정본은 `D:\Project\shoppingmall2`의 기존 clean 격리 worktree와 단일 writer다. `main` 직접 개발, OneDrive 작업, 새 후속 브랜치, GitHub 계정·토큰을 사용하지 않는다.
- 통합 결제당 상품금액 할인 최대 1개, 직접/어울몰 발송 묶음별 배송비 지원 최대 1개다. 무료배송은 각 묶음의 **할인 전** 상품금액 5만 원 이상으로 먼저 결정한다. 무료배송 묶음에 0원 지원을 사용 처리하지 않는다.
- 목록 쿠폰과 공용 코드는 같은 혜택 원장을 공유한다. 개인별 고유 코드·광고 과금·포인트·운영 비용 부담 자동 결정은 첫 범위에서 제외한다. 운영 혜택의 실제 값은 시험 fixture로 대체한다.
- 고객에게 보이는 견적은 권리 확보가 아니다. 접수 transaction은 현재 가격·재고·판매 상태·승인 배송 정책·혜택 버전·기간·한도를 다시 확인한다. 결제 실패/만료 미확정 점유는 해제하고, 결제 완료 후 전부/일부 취소 쿠폰은 자동 복원하지 않는다.
- 이미 접수된 주문의 혜택 버전·원 단위 배분은 불변이다. 분배에는 기존 `allocateShipmentDiscountWon`, 배송비 지원에는 `applyShipmentShippingSupportWon`을 재사용한다. S3.3 주문 snapshot, S4 PG 결과/환불, S6 정산 연결 전에는 종단 간 완료로 표시하지 않는다.
- **구현 전 별도 게이트:** 신산님의 이 계획 검토와 아래 정확한 공개 API·DB schema/migration 범위 승인을 확인한다. 공유 `WSL-server/local-postgres/shoppingmall`에 migration을 적용하기 직전에는 SQL·기존 행·백업/복구 영향을 제시해 그 지정 DB 적용 승인을 별도로 확인한다. 실제 PG/Oracle/운영 혜택 발행은 제외한다.
- 로컬 `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`; 안전 커밋을 SSH alias 원격에 push한 뒤 WSL `/home/daon/deploy/shopping`에서 exact SHA와 지정 DB로 시험한다. 로컬 DB skip은 PASS로 세지 않는다. 생성할 QA DB/계정/상품/쿠폰/컨테이너/포트는 `WORK_STATUS.md`에 이름·수명·정리 순서를 먼저 기록한다.

## Review Focus

1. 공용 코드와 직접 발행 쿠폰이 같은 계정에 겹쳐도 혜택 한도가 우회되지 않는가 → Task 3·5의 두 획득 경로 경쟁 시험.
2. 관리자 중지가 결제 진행 중인 이미 접수된 주문의 금액을 바꾸거나, 신규 접수를 통과시키는가 → Task 3·5의 중지/콜백 순서 시험.
3. 0원 배송비 지원이 쿠폰을 소진시키거나 상품금액 할인으로 전환되는가 → Task 1·5의 무료배송 시험.
4. 다른 고객의 grant ID 추측, code 대입 반복, 다른 역할의 관리자 경로 접근이 정보를 누설하는가 → Task 3·4의 HTTP/권한 시험.
5. 마지막 한도 1개를 서로 다른 계정이 동시에 점유하거나 만료 작업과 결제 완료가 경합할 때 초과 사용·이중 해제가 생기는가 → Task 5의 두 DB 세션 시험.

---

## 파일·책임 지도와 승인 대상 계약

| 위치 | 책임 |
|---|---|
| `apps/api/src/promotions/rules.ts`, `quote.ts` | 규칙 검증·대상 상품/판매자 계산·원화 정수 견적; DB와 분리 |
| `apps/api/src/db/schema.ts`, `apps/api/migrations/0011_s3_promotions.sql`, `meta/_journal.json` | 신규 혜택 관계·제약·인덱스. 기존 0000~0010 migration 수정 금지 |
| `apps/api/src/promotions/repository.ts`, `admin-service.ts`, `usage-service.ts` | 혜택 버전/발행/코드·원자적 점유/확정/해제, 감사 |
| `apps/api/src/promotions/admin.controller.ts`, `customer.controller.ts`, `apps/api/src/app.module.ts` | 신규 공개 API, 인증·역할·Origin·오류 매핑 |
| `apps/api/src/checkout/reservation-quote.ts`, `apps/web/app/cart/page.tsx` | 현재 예약 견적에 선택한 혜택을 별도 미확정 견적으로 보여줌; 기존 무혜택 경로 보존 |
| `apps/web/app/account/admin/promotions/page.tsx` | 관리자 등록·버전 변경·중지·직접 발행·조회 |
| `apps/api/test/promotion-*.test.mjs`, `apps/web/test/*promotion*.test.mjs`, QA fixture 소유 파일 | RED→GREEN, 실DB/HTTP/화면·정확한 정리 |

제안 DB 변경은 새 테이블 5개: `promotion_campaigns`(유형·상태·총/계정별 사용 한도·직접 발행 한도), `promotion_versions`(캠페인 버전·기간·정액/정률·상한·최소 적격금액·대상 방식과 ID 목록), `promotion_codes`(대문자 정규화 코드의 전역 유일값·버전), `promotion_grants`(계정·버전·직접/코드 획득·발행 actor), `promotion_uses`(계정·grant·예약·발송 key·HELD/USED/RELEASED·시각·멱등 키). 모든 관계는 UUID/FK·허용 상태·양수 한도와 부분 유일 인덱스로 보호한다. 캠페인 총 사용 한도는 모든 버전·두 획득 경로의 유효 HELD+USED 합계다. 직접 발행 한도는 직접 grant만 센다. 기존 계정·상품·예약 행은 변경하거나 삭제하지 않는다.

제안 신규 공개 API 경로: 관리자 `GET/POST /promotions/admin/campaigns`, `POST /promotions/admin/campaigns/:id/versions`, `POST /promotions/admin/campaigns/:id/stop`, `POST /promotions/admin/campaigns/:id/grants`; 고객 `GET /customer/promotions/coupons`, `POST /customer/checkout/reservations/:id/promotions/quote`. 등록 본문은 `{ title, kind, scope, targetIds, startsAt, endsAt, minimumEligibleGoodsWon, amountKind, amountValue, maxDiscountWon, directIssueLimit, totalUseLimit, perAccountUseLimit, code? }`이고 `scope`는 `all|sellers|options` 중 하나, `targetIds`는 `all`이면 빈 배열·나머지는 해당 UUID 배열이다. `amountKind`는 상품 할인에 `fixed|percent`(정률은 1..10000 basis points), 배송비 지원에 `fixed`만 허용한다. 한도는 양의 정수이며 미사용 기능의 값은 `null`이다. 새 버전 본문은 같은 규칙 필드와 선택적 새 `code`; 중지 본문은 1..500자 `reason`; 직접 발행 본문은 `{ accountId, reason }`와 UUID `Idempotency-Key` 헤더다. 고객 견적 입력은 `{ goodsCoupon?: { grantId?: UUID, code?: string }, shippingCoupons?: { shipmentKey: string, grantId?: UUID, code?: string }[] }`이며 각 선택자는 ID·코드 중 정확히 하나만 가진다. 반환은 기존 `ShipmentQuote`에 묶음별 `discountWon`, `supportWon`, `payableGoodsWon`, `payableShippingWon`, `totalWon`과 통합 합계를 추가한다. 코드 확인은 견적 route 안에서만 하며 코드 존재 여부를 별도 공개 조회하지 않는다.

### Task 1: 혜택 규칙·금액 계산

**Files:** Create `apps/api/src/promotions/rules.ts`, `quote.ts`, `apps/api/test/promotion-quote.test.mjs`; use existing `apps/api/src/checkout/shipment-quote.ts` without changing its current 무혜택 반환 계약.

**Interfaces:** `validatePromotionRule(input: unknown): PromotionRule`; `applyPromotionQuote(base: ShipmentQuote, lines: ShipmentLine[], discount?: PromotionRule, supports?: { shipmentKey: string; rule: PromotionRule }[]): AppliedPromotionQuote`. `PromotionRule = { kind: 'goods_discount'|'shipping_support'; scope: 'all'|'sellers'|'options'; targetIds: string[]; startAt: Date; endAt: Date; minimumEligibleGoodsWon: number; amountKind: 'fixed'|'percent'; amountValue: number; maxDiscountWon: number|null }`; 고정액은 원, 정률은 1..10000 basis points. `AppliedPromotionQuote` keeps each existing shipment key and adds integer discount/support/payable fields.

- [ ] Step 1: 49,999/50,000원 무료배송, 적격 옵션/판매자만 할인, 52,000원에서 5,000원 할인 후 무료배송, 정률 1원 미만 버림/상한, 무료배송 지원 0원, 중복 지원 거부와 합계 보존 시험을 쓴다.
- [ ] Step 2: `node --import tsx --test apps/api/test/promotion-quote.test.mjs`를 실행해 새 함수 부재의 예상 RED를 확인한다.
- [ ] Step 3: 기존 두 원 단위 배분 함수를 호출하고 원본 `ShipmentQuote`는 수정하지 않는 최소 규칙·계산을 구현한다.
- [ ] Step 4: 같은 명령 GREEN, `pnpm typecheck`, `pnpm lint` 종료 코드 0을 확인하고 이 파일만 commit한다.

### Task 2: 혜택 원장 schema·격리 migration

**Files:** Modify `apps/api/src/db/schema.ts`, `apps/api/migrations/meta/_journal.json`; create `apps/api/migrations/0011_s3_promotions.sql`, `apps/api/src/promotions/repository.ts`, `apps/api/test/promotion-schema-db.test.mjs`.

**Interfaces:** 위 5개 테이블; `CouponSelector = { grantId: string; code?: never } | { code: string; grantId?: never }`; `PromotionVersion = { id: string; campaignId: string; rule: PromotionRule }`; `PromotionGrant = { id: string; accountId: string; versionId: string; source: 'direct'|'code' }`; `ResolvedPromotion = { campaignId: string; versionId: string; grantId: string|null; source: 'direct'|'code' }`. `PromotionRepository(pool).getVersionById(versionId: string): Promise<PromotionVersion|null>`, `.resolveSelection(accountId: string, selector: CouponSelector): Promise<ResolvedPromotion|null>`, `.listCustomerGrants(accountId: string): Promise<PromotionGrant[]>`. 공용 코드의 `resolveSelection`은 아직 grant 행을 만들지 않고 `grantId:null`을 반환하며 Task 5의 점유 transaction에서만 코드 grant를 만든다. `promotion_versions`의 `scope`는 하나만 선택하며 `target_ids`는 해당 종류의 ID만 가진다. 직접 발행 grant는 발행 시 버전에 고정하고, 공용 코드는 연결된 버전에 고정한다. 관리자 변경은 새 버전/새 코드 또는 신규 grant부터 적용하고 기존 발행 약속을 소급 변경하지 않는다. 캠페인 중지는 모든 버전의 신규 사용을 막는다.

- [ ] Step 1: 기존 0010 격리 DB에서 새 관계 부재 RED, 0011 적용 뒤 5개 테이블·FK/CHECK/코드 유일·예약/캠페인 사용 유일·기존 행 보존을 단언하는 시험을 쓴다.
- [ ] Step 2: 이름 붙인 격리 DB에서 0000~0010을 적용한 뒤 `node --import tsx --test apps/api/test/promotion-schema-db.test.mjs`로 새 관계 부재 RED·0 skip을 확인한다. 지정 공유 `shoppingmall`은 읽기만 한다.
- [ ] Step 3: Drizzle schema·0011 SQL·journal과 repository를 추가한다. PostgreSQL 한 transaction에서 계정→기존 예약/재고→캠페인→grant 순 잠금이 가능하도록 조회 경계를 제공한다.
- [ ] Step 4: 격리 DB에 0011 적용한 뒤 같은 목표 명령 GREEN·0 skip, 새 빈 DB 전체 migration 재현, `migration:dry-run`의 공유 DB read-only preview 및 기존 행 수 불변을 확인한다. 격리 DB·컨테이너를 정확히 제거한다.
- [ ] Step 5: schema·SQL checksum·복구는 신규 쓰기 중단 후 보정 migration 원칙을 기록하고 안전 commit/push한다. 공유 DB 적용은 별도 승인 전 실행하지 않는다.

### Task 3: 관리자 발행·버전·중지 API

**Files:** Create `apps/api/src/promotions/admin-service.ts`, `admin.controller.ts`, `apps/api/test/promotion-admin-http-db.test.mjs`; modify `apps/api/src/app.module.ts`.

**Interfaces:** 위 `promotions/admin/campaigns` 경로. 관리자만 campaign 생성·목록·새 버전·중지·고유 계정 직접 발행 가능하다. 코드 정규화는 주변 공백 제거와 대문자화이며 저장 전 중복을 거부한다. 직접 발행은 총 발행 한도를 DB 캠페인 잠금 아래 검사하고 `audit_events`에 actor·대상·변경 근거를 남긴다. 고객/판매자/무인증/위조 Origin은 변경 불가.

- [ ] Step 1: 관리자 생성→조회→발행→새 버전→중지, 코드 충돌·발행 한도, 기존 grant 버전 보존, 역할·타 계정·Origin 거부와 감사 사건을 시험에 쓴다.
- [ ] Step 2: 격리 0011 DB에서 `node --import tsx --test apps/api/test/promotion-admin-http-db.test.mjs`를 실행해 미등록 route 404/서비스 부재 예상 RED·0 skip을 확인한다.
- [ ] Step 3: service/controller와 Nest 등록을 구현하고 입력 검증·DB transaction·오류 상태를 연결한다. 관리자 중지는 이미 접수된 주문 스냅샷을 수정하지 않는다.
- [ ] Step 4: 같은 목표 명령 GREEN·0 skip, `pnpm typecheck`, `pnpm lint` 종료 코드 0, 가상 발행/감사 행 정리·잔류 0 확인 후 안전 commit/push한다.

### Task 4: 고객 목록·코드·미확정 혜택 견적

**Files:** Create `apps/api/src/promotions/customer-service.ts`, `customer.controller.ts`, `apps/api/test/promotion-customer-http-db.test.mjs`; modify `apps/api/src/checkout/reservation-quote.ts`, `apps/api/src/app.module.ts`의 등록만.

**Interfaces:** `GET /customer/promotions/coupons`는 본인 직접 발행 grant와 사용 가능 상태만 반환한다. `POST /customer/checkout/reservations/:id/promotions/quote`는 위 선택 JSON을 받고 계정 소유 활성 예약·현재 상품/정책·혜택 대상/기간/한도를 재검사해 `AppliedPromotionQuote`를 반환한다. 견적은 grant/uses를 쓰지 않는다. 타 계정 grant와 코드 조회의 상세 존재 여부는 숨긴다.

- [ ] Step 1: 목록/코드의 동일 계산, 남의 grant 추측, 시작·종료 시각, 품절/예약 만료/중지, 판매자 역할·무인증·Origin 거부, 견적 호출 전후 use 행 0 시험을 쓴다.
- [ ] Step 2: 격리 0011 DB에서 `node --import tsx --test apps/api/test/promotion-customer-http-db.test.mjs`를 실행해 등록 전 404/서비스 부재 예상 RED·0 skip을 확인한다.
- [ ] Step 3: 고객 service/controller와 현재 예약 재견적 호출을 연결한다. 무료배송으로 지원액이 0원이면 선택 버튼을 비활성화하고 `무료배송 상품에는 배송비 지원이 적용되지 않습니다`를 표시하며 사용 행은 만들지 않는다. 기존 무혜택 예약 조회 반환은 유지한다.
- [ ] Step 4: 같은 목표 명령 GREEN·0 skip, 로컬 typecheck/lint/build 종료 코드 0, QA 행 정리·잔류 0 확인 후 안전 commit/push한다.

### Task 5: 사용 자리 경쟁·해제·확정 서비스

**Files:** Create `apps/api/src/promotions/usage-service.ts`, `apps/api/test/promotion-usage-db.test.mjs`; modify QA fixture reset의 실제 소유 파일만.

**Interfaces:** `PromotionSelection = { goodsCoupon?: CouponSelector; shippingCoupons?: { shipmentKey: string; selector: CouponSelector }[] }`; `PromotionUseView = { id: string; campaignId: string; versionId: string; reservationId: string; shipmentKey: string|null; status: 'HELD'|'USED'|'RELEASED' }`. `PromotionUsageService.holdInTransaction(client: PoolClient, accountId: string, reservationId: string, selections: PromotionSelection, idempotencyKey: string, expiresAt: Date): Promise<PromotionUseView[]>`; `.markPaidInTransaction(client: PoolClient, useIds: string[]): Promise<void>`; `.releaseInTransaction(client: PoolClient, useIds: string[], reason: string): Promise<void>`; `.releaseDue(limit: number): Promise<number>`. 계정·예약 잠금 뒤 캠페인 ID 오름차순 잠금으로 HELD+USED 총/계정별 한도를 검사한다. grant·코드 두 경로는 캠페인 한도를 공유한다. 상태는 `HELD→USED` 또는 `HELD→RELEASED` 단방향; 이미 끝난 행은 멱등 반환한다. `markPaid`는 S4의 실제 PG 승인 입력 전까지 시험 서비스 호출만 허용한다.

- [ ] Step 1: 두 DB 세션의 마지막 1회 경쟁, 같은 키 반복, 코드·목록 중복, 다른 계정 grant, 관리자 중지와 신규 hold 경합, 유효 만료 해제/중복 release/paid 충돌, 무료배송 0원 미사용 시험을 쓴다.
- [ ] Step 2: 격리 DB에서 `node --import tsx --test apps/api/test/promotion-usage-db.test.mjs`로 새 서비스 부재 예상 RED·0 skip을 확인한다.
- [ ] Step 3: 한 transaction의 재검증·잠금·조건부 전이·감사 이력을 구현한다. S3.3 주문 제출이 같은 client로 호출할 수 있게 하고, 결제 시도 만료/늦은 승인은 S4 상태 계약 전 자동 확정하지 않는다.
- [ ] Step 4: 같은 목표 명령 GREEN·0 skip, 두 세션 경합 후 HELD/USED/RELEASED 합과 QA 잔류 0, 전체 로컬 test/typecheck/lint/build 종료 코드 0을 확인하고 안전 commit/push한다.

### Task 6: 관리자·고객 화면과 정식 WSL 확인

**Files:** Create `apps/web/app/account/admin/promotions/page.tsx`, `apps/web/test/admin-promotions.test.mjs`, `apps/web/test/customer-promotions.test.mjs`; modify `apps/web/app/cart/page.tsx`와 실제 관리자 메뉴 소유 파일, 문서화된 QA 스크립트/fixture의 직접 소유 파일만.

**Interfaces:** 관리자에게 현재 버전·기간·대상·한도·발행/중지 이력을 보여주고, 고객 예약 화면에는 사용 가능한 목록 선택과 코드 입력, 묶음별 실제 할인·배송지원·총액·오류/0원 안내를 표시한다. 기존 Flat v2 시각 토큰·수량/제거·예약 해제·키보드 흐름은 보존한다. 실제 결제 완료처럼 보이지 않게 `견적`임을 표시한다.

- [ ] Step 1: 관리자 저장/중지·고객 목록/코드·무료배송 0원·예약 만료/오류·키보드 이름과 기존 카트 회귀 화면 시험을 쓴다.
- [ ] Step 2: 새 화면/선택 controls 부재의 예상 RED를 확인하고 최소 UI/API 연결 뒤 목표 GREEN을 확인한다.
- [ ] Step 3: 로컬 전체 `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`를 실행해 실패 0, skip은 분리 기록한다.
- [ ] Step 4: 정확한 커밋을 SSH alias로 push→지정 WSL checkout Git fast-forward. 승인된 공유 DB migration gate 후에만 `local-postgres/shoppingmall`에 0011 적용하고 이전 행·migration 수를 확인한다. 실DB 전체·두 역할 HTTP·실제 Chrome의 목록/코드·3발송 묶음·권한·키보드/반응형을 재현한다.
- [ ] Step 5: 식별 QA 계정·상품·쿠폰·예약·감사·임시 컨테이너/포트/브라우저 프로필을 정확히 정리하고 잔류 0, exact SHA·clean·미검증 PG/주문/UAT를 `WORK_STATUS.md`에 기록한다. 필수 review의 Critical/Important를 RED→GREEN으로 해소한다. S3.3/S4 연결 전에는 최종 발행·사용·환불 완료로 표기하지 않는다.

## 이후 단계 연결

S3.3은 Task 5의 `holdInTransaction`을 발송 주문 3건+통합 결제 1건 저장과 같은 transaction에서 호출하고 혜택 버전·발송별 금액을 불변 snapshot으로 저장한다. S4는 PG 성공/실패·만료/중복 콜백에서 `markPaidInTransaction`/`releaseInTransaction`을 호출한다. S4 환불과 S6 정산은 주문 snapshot의 할인·배송지원 발생액을 참조한다. 이 후속 계약은 각각의 계획·승인 경계에서 상세화하며 이번 S3.2만으로 실제 결제·환불 사용 완료를 주장하지 않는다.
