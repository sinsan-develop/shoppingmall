# 어울몰 고객 찜·옵션별 재입고 신청 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고객 계정에 상품별 찜과 품절 옵션별 재입고 신청·취소를 영속화하고, 실제 고객 화면에서 확인한다.

**Architecture:** 기존 고객 세션/역할/Origin 검사 아래에 전용 고객 서비스와 두 관계 테이블을 더한다. 현재 공개 상품·옵션은 서버에서 검증하고, 같은 상품·옵션명의 새 개정에서도 신청을 유지한다. 실제 발송과 `notified` 전이는 S5.3 작업으로 남긴다.

**Tech Stack:** Node 24, pnpm 11.19.0, NestJS 12.1.0, Drizzle ORM 0.45.3, PostgreSQL, Next.js 16.3.6, React 19.2.3, node:test.

**Spec:** [승인된 고객 찜·재입고 설계](../specs/2026-09-29-customer-favorites-restock-design.md); 정본 범위는 [WORK_PLAN S2.4/S5.3](../../WORK_PLAN.md)와 [DESIGN R04/R10/R12](../../design/DESIGN.md).

## Global Constraints

- 제품명은 어울몰이며 Flat v2의 기존 색·서체·키보드 포커스 패턴과 고객·판매자·관리자 DOM/권한을 보존한다.
- 고객 찜은 계정+상품, 신청은 계정+상품+서버가 확인한 현재 공개 옵션명. 옵션 ID는 개정 시 바뀔 수 있다.
- S2.4는 저장·조회·취소·화면까지만; 실제 문자/메일/푸시 발송, `notified` 처리, 공급자 성공 표시는 S5.3/UAT 경계다.
- `main` 수정·새 브랜치 생성 금지. 기존 `codex/flat-v2-prototypes` 격리 worktree의 단일 writer가 작업한다.
- 개발 DB는 WSL-server의 `local-postgres/shoppingmall`만. Windows 소스는 Git SSH 별칭으로 push하고 WSL 지정 checkout에서 exact SHA를 pull한다. Oracle·실개인정보·실발송은 제외한다.
- 계획상 새 API·두 테이블 권한은 기존 질문에 대한 신산님의 `계속하자` 응답 범위로 기록돼 있다. 세부 계약이 이 계획을 벗어나면 작업 전에 다시 보고한다.

## Review Focus

1. 같은 고객이 동시에 같은 찜/옵션 신청을 보내도 현재 행 1건·감사 1건이어야 한다 — Task 2·3 동시 요청 시험.
2. 상품 개정으로 옵션 ID가 바뀌어도 같은 이름은 이어지고 이름이 없어진 옵션은 신청을 지우지 않되 `현재 없는 옵션`이어야 한다 — Task 3 조회 시험.
3. 타 고객 신청 ID, 판매자/관리자 세션, 잘못된 Origin으로 변경할 수 없어야 한다 — Task 2·3 HTTP 시험.
4. 판매 가능 0인 공개 옵션만 신청 가능하고 판매중지/비공개 상품에는 새 신청·발송 성공 표시가 없어야 한다 — Task 3 시험.
5. API/네트워크 오류 또는 늦은 응답이 고객 화면에서 저장 성공으로 보이거나 다른 상품의 상태를 덮지 않아야 한다 — Task 4 웹 시험/브라우저 확인.

---

### Task 1: 영속 관계와 격리 migration 계약

**Files:** Modify `apps/api/src/db/schema.ts`; Create `apps/api/migrations/0007_s2_customer_favorites_restock.sql`; Modify `apps/api/migrations/meta/_journal.json`; Create `apps/api/migrations/meta/0007_snapshot.json`; Create `apps/api/test/customer-engagement-schema-db.test.mjs`.

**Interfaces:** `customerFavorites(accountId, productId, createdAt)`에 `(accountId,productId)` 복합 PK. `restockSubscriptions(id,accountId,productId,optionName,status,requestedAt,cancelledAt,notifiedAt)`에 부분 unique `(accountId,productId,optionName) WHERE status='active'`; 상태 `active|cancelled|notified`, `optionName` 비공백. 계정/상품 FK는 기존 제한 방식과 맞춘다.

- [ ] **Step 1: RED** — 새 schema DB 시험에서 FK, 복합 PK, 활성 신청 부분 unique, 취소 후 같은 옵션 재신청 및 과거 행 보존을 단언한다.
- [ ] **Step 2: RED 확인** — 시험과 자원 계획만 commit/push하고 WSL 지정 checkout을 exact SHA로 pull한 뒤 격리 QA DB에 기존 0000→0006을 적용하고 `node --import tsx --test apps/api/test/customer-engagement-schema-db.test.mjs`; 예상: 새 테이블 부재로 목표 시험 실패, skip 0. 실행 전 자원 이름·소유·수명·정리법을 `WORK_STATUS.md`에 기록한다.
- [ ] **Step 3: GREEN** — Drizzle schema에 두 테이블을 추가하고 `0007` SQL/저널/스냅샷을 기존 0006 다음 순서로 생성한다. `notified` 값은 schema가 허용하되 S2 코드에서 전이시키지 않는다.
- [ ] **Step 4: GREEN 확인** — 구현을 commit/push하고 WSL exact SHA를 pull한 뒤 기존 0000→0006 격리 DB에 0007만 적용해 위 시험 PASS, DB/테이블/QA 행 잔류 확인. 별도 빈 격리 DB에서도 0000→0007 전체 적용을 확인하고 정확한 격리 DB만 정리한다.
- [ ] **Step 5: Checkpoint** — 승인된 개발 `shoppingmall` DB는 migration dry-run·격리 시험이 녹색이고 exact SHA를 WSL에서 확인한 뒤 적용하며, 기존 행 초기화는 금지한다. 적용 결과/복구 경계를 `WORK_STATUS.md`에 기록하고 commit/push한다.

### Task 2: 고객 상품 찜 API

**Files:** Create `apps/api/src/customer/engagement.ts`; Modify `apps/api/src/customer/controller.ts`; Create `apps/api/test/customer-favorites-http-db.test.mjs`; Modify `apps/api/scripts/qa-public-fixture.ts` 및 필요한 고객 시험 fixture 정리 파일.

**Interfaces:** `CustomerEngagement(pool).listFavorites(actor: AccessContext): Promise<FavoriteItem[]>`, `addFavorite(actor, productId): Promise<{productId:string;favorite:true}>`, `removeFavorite(actor, productId): Promise<{productId:string;favorite:false}>`. HTTP `GET /customer/favorites`, `PUT /customer/favorites/:productId`, `DELETE /customer/favorites/:productId`. 목록은 상품 ID·현재 공개 이름/판매중지/현재 공개 부재를 구분해 반환하며 타 계정 정보는 반환하지 않는다.

- [ ] **Step 1: RED** — 실DB·HTTP 시험에서 공개 상품 찜→자기 목록→해제/재추가, 재시도 및 동시 PUT에서 행·감사 1건, 타 고객 분리, 비로그인·판매자·관리자·Origin 거부, 비공개/잘못된 상품 ID 거부를 단언한다.
- [ ] **Step 2: RED 확인** — 시험만 commit/push→WSL exact SHA pull 후 `node --import tsx --test apps/api/test/customer-favorites-http-db.test.mjs`; 예상: 새 route 404, skip 0(WSL DB). 로컬 DB 없는 skip은 RED 증거로 사용하지 않는다.
- [ ] **Step 3: GREEN** — 기존 controller `context()`와 `requireOrigin()`을 재사용하고 서비스에서 공개 이력·계정 소속을 검증한다. DB 충돌 처리는 부분/복합 unique에 의존해 멱등 응답을 반환하되 실제 삽입/삭제에만 감사 이벤트를 같은 transaction에서 쓴다.
- [ ] **Step 4: GREEN 확인** — 구현 commit/push→WSL exact SHA pull 후 목표 시험 PASS; 시험 fixture reset이 `customer_favorites`를 해당 QA product/account에 한정해 부모보다 먼저 지우고 다른 자료는 보존함을 시험한다.
- [ ] **Step 5: Checkpoint** — 관련 코드·시험·현황만 commit/push한다.

### Task 3: 옵션별 재입고 신청 API와 S5 연결 계약

**Files:** Modify `apps/api/src/customer/engagement.ts`, `apps/api/src/customer/controller.ts`, `apps/api/scripts/qa-public-fixture.ts`; Create `apps/api/test/customer-restock-http-db.test.mjs`.

**Interfaces:** `listRestockSubscriptions(actor): Promise<RestockItem[]>`, `addRestockSubscription(actor,productId,optionId): Promise<{id:string;status:'active'}>`, `cancelRestockSubscription(actor,subscriptionId): Promise<{id:string;status:'cancelled'}>`. HTTP `GET /customer/restock-subscriptions`, `POST /customer/restock-subscriptions` body `{productId,optionId}`, `DELETE /customer/restock-subscriptions/:subscriptionId`. `RestockItem`은 현재 공개 옵션 동일 이름의 존재/품절 여부와 `현재 없는 옵션` 표시용 상태를 포함한다. S5는 `status='active'`와 동일 상품·공개 옵션명을 재조회할 수 있으며 S2에 실제 전송 메서드는 없다.

- [ ] **Step 1: RED** — 공개 품절 옵션 신청→조회→취소→새 ID로 재신청, 동시 POST 1 활성/감사 1건, 타 고객 ID·역할/Origin 거부, 판매 가능/비공개/판매중지/다른 상품 옵션 거부를 실DB·HTTP로 단언한다.
- [ ] **Step 2: RED 확인** — 시험만 commit/push→WSL exact SHA pull 후 `node --import tsx --test apps/api/test/customer-restock-http-db.test.mjs`; 예상: route 404, skip 0(WSL DB).
- [ ] **Step 3: GREEN** — 공개 `product_publications`의 현재 승인 개정에서 `optionId→optionName`을 서버가 조회하고 판매 가능 수량 0·판매중지 부재를 transaction 안에서 재검증한다. 이름은 정확한 등록값으로 보관하며 활성 unique 경합을 멱등 처리한다. 취소는 자기 `active` 행만 변경하고 재시도 시 감사 추가 없이 현재 취소 상태를 돌려준다.
- [ ] **Step 4: 경계 시험** — 구현 commit/push→WSL exact SHA pull 후 같은 상품 새 공개 개정의 동일 이름/새 옵션 ID는 기존 신청을 유지하고, 이름 제거 시 과거 행은 남지만 `현재 없는 옵션`이며 새 신청/발송 완료는 없다. 보유 수량만 증가하거나 승인 전 판매 가능 재고가 0이면 `notified`로 바뀌지 않음을 DB로 단언한다. 목표 시험 PASS.
- [ ] **Step 5: Checkpoint** — QA reset의 정확한 신청 행 자식 삭제와 다른 고객 보존 시험 후 관련 파일만 commit/push한다.

### Task 4: Flat v2 고객 화면

**Files:** Modify `apps/web/app/products/[productId]/page.tsx`, `apps/web/app/account/customer/page.tsx`, `apps/web/app/styles.css`(필요한 클래스만); Create `apps/web/app/products/[productId]/engagement-controls.tsx`, `apps/web/app/account/customer/engagement-lists.tsx`, `apps/web/test/customer-engagement.test.mjs`.

**Interfaces:** 상세는 상품 찜 토글과 품절·판매중지 아닌 공개 옵션의 신청/취소 버튼을 제공한다. 계정은 자기 찜·신청 목록, 상태, 취소 동선을 제공한다. API는 위 Task 2·3 route만 사용하고 `credentials:'include'`로 인증한다.

- [ ] **Step 1: RED** — 웹 컴포넌트/상태 시험에서 미로그인 안내, 품절 옵션만 신청 가능, 현재 없는 옵션 표시, 처리중 중복 클릭 방지, 오류 시 성공 문구 부재, 늦은 다른 상품 응답 무시, 키보드 접근 가능한 버튼 이름을 단언한다.
- [ ] **Step 2: RED 확인** — `node --import tsx --test apps/web/test/customer-engagement.test.mjs`; 예상: 컴포넌트/상태 미구현으로 목표 실패.
- [ ] **Step 3: GREEN** — 기존 상품 상세·계정 카드 구조와 Flat v2 토큰을 보존해 필요한 컨트롤만 붙인다. 상세 공개 데이터 조회 실패는 찜/신청 실패와 분리하고, 요청 후 서버 확인 전 낙관적 성공을 표시하지 않는다.
- [ ] **Step 4: GREEN 확인** — 목표 시험 PASS, `pnpm typecheck`, `pnpm lint`, `pnpm build` PASS. 관련 화면·시험만 commit/push하고 WSL exact SHA를 pull한 뒤 실제 브라우저에서 고객/판매자/관리자, 데스크톱·430px 모바일·200% 확대·키보드/오류/빈 상태를 확인한다.
- [ ] **Step 5: Checkpoint** — 브라우저 결과·미검증을 `WORK_STATUS.md`에 기록하고 commit/push한다.

### Task 5: S2.4 통합 검증·회복·인수 기록

**Files:** Modify `WORK_STATUS.md`, `docs/DEVELOPMENT_ENVIRONMENT.md`(실제 재현 명령/경계만), 필요하면 `docs/WORK_PLAN.md`의 완료 증거 링크만; 새 기능 범위·승인 계약은 바꾸지 않는다.

**Interfaces:** S2.4의 DB/API/UI 증거를 S5.3 미구현·실발송 미검증과 구분한다.

- [ ] **Step 1: 전체 로컬 회귀** — `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`; pass/fail/skip을 각각 기록한다.
- [ ] **Step 2: 지정 WSL 회귀** — commit/push→`/home/daon/deploy/shopping`에서 fast-forward pull→로컬/원격/WSL exact SHA·clean 대조. `local-postgres/shoppingmall`의 migration 0007 적용 이력과 전용 QA 시험, 전체 DB/API 회귀를 확인한다.
- [ ] **Step 3: 실제 사용자 흐름** — 고유 QA 계정/상품의 공개 품절 옵션으로 찜·재입고 신청·취소·상품 개정 후 조회를 브라우저에서 확인한다. 구매자 외 역할의 거부와 모바일·200%·키보드 화면을 기록한다. 실제 외부 알림 수신은 수행하지 않는다.
- [ ] **Step 4: 정확한 정리·복구 확인** — 고유 QA 자식 행→상품→계정 순서의 reset, 임시 DB·컨테이너·포트·시험자료 잔류 0과 WSL checkout 청결을 확인한다. migration은 무조건 역삭제하지 않고 이슈 시 코드 롤백/후속 보정 migration으로 복구한다.
- [ ] **Step 5: Stage 판정** — `WORK_STATUS.md`에 SHA·파일·시험 집계·skip·오류 횟수·미검증·정리·다음 S2.4/S5 작업을 기록한다. S2 전체 gate가 아직 미완료면 PR 병합/완료를 선언하지 않고 남은 승인 계획 작업을 계속한다.
