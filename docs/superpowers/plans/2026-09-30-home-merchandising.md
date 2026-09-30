# 어울몰 홈 전시·기획전 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 홈 추가 메뉴·기획전·공통 추천을 편집·미리보기·공개·복구하고, 고객은 현재 판매 가능한 상품만 실제 연결되는 Flat v2 홈과 기획전에서 본다.

**Architecture:** Nest API의 단일 편집본과 불변 공개 스냅샷/현재 포인터를 PostgreSQL에 저장한다. 공개 조회는 현재 상품 승인·판매중지·재고·이미지 상태와 기획전 기간을 요청마다 합성한다. Next.js 홈/기획전/관리자 화면은 이 계약을 소비하되 기존 검색·분류·상품 동선을 유지한다.

**Tech Stack:** Next.js 16/React 19/TypeScript, NestJS 12, `pg`/Drizzle/PostgreSQL, Node `--import tsx --test`, pnpm 11.

**Spec:** [승인된 홈 전시 설계](../specs/2026-09-30-home-merchandising-design.md). 이 계획은 [S2.4](../../WORK_PLAN.md)의 남은 홈 영역만 다루며 S3 할인, S5 실제 알림, Oracle/PG/UAT는 포함하지 않는다.

## Global Constraints

- 기존 `codex/flat-v2-prototypes` 단일 writer worktree를 사용하고 `main`에서 직접 개발하지 않는다. 이 계획을 코드 작업으로 바꾸기 전 서면 계획 검토를 받는다. Stage가 끝나지 않은 동안 다른 S2.4 작업과 같은 검증·rollback 경계로 묶는다.
- 외부 계정/실발송/Oracle/운영 DB를 쓰지 않는다. 새 0008 migration은 우선 고유 격리 DB에 전량 적용·복구 검증한다. 공유 개발 `shoppingmall` 적용 전 대상·SQL·기존 행 영향·되돌림을 기록하고 승인 경계를 확인한다. 실제 적용 실패는 추측하여 재실행/삭제하지 않는다.
- 각 작업은 RED 테스트 → 최소 구현 → GREEN → 관련 회귀 → `WORK_STATUS.md` 증거 → 안전 commit 순서다. WSL의 실DB 시험은 Git SSH 별칭으로 push한 동일 SHA를 지정 checkout에서 pull한 뒤만 수행한다. 로컬 환경 skip은 실DB PASS가 아니다.
- QA 계정/상품/이벤트에는 고유 `QA_RUN_ID`와 소유 작업·수명을 부여한다. 삭제 대상은 본 실행에서 만든 정확한 ID만 사전에 확인하고 자식 관계·감사 이력까지 시험 `finally`에서 회수한다. 다른 프로젝트 컨테이너/DB/파일을 건드리지 않는다.
- 편집본/미리보기/이력은 고객·판매자에게 반환하지 않는다. 쓰기에는 관리자 활성 역할, 세션 및 `requireOrigin`을 서버에서 검사한다. 메뉴의 내부 대상만 허용하고 임의 URL/HTML·긴 캐시를 금지한다. `GET /home/content` 장애 시 기존 고정 메뉴와 상품 탐색을 보존한다.
- 상품 가격·재고는 스냅샷에 동결하지 않는다. 상품 ID 지정 조회는 `PublicProducts.list()`의 첫 24개를 필터링하는 방식이 아니라 공유 가능한 현재 판매 가능 조회로 구현한다. 기존 `get()`만으로도 부족하다(품절·판매중지 상품이 반환됨).
- 완료 판정은 로컬 test/typecheck/lint/build, WSL 동일 SHA 실DB 전체 시험(해당 항목 0 skip), 실제 브라우저/역할 확인과 자원 정리 증거를 분리한다. 실제 200% 확대 입력이 확인되지 않으면 미검증이다. PR/병합은 남은 S2.4 전체 gate가 충족될 때만 프로젝트 규칙에 따라 수행한다.

## Review Focus

1. 24개보다 뒤에 있는 선택 상품: 기획전/추천에 정확히 노출되는지 Task 2·4의 실DB 시험.
2. 두 관리자의 동시 편집 및 공개/복구 경쟁: 버전 충돌, 원자적 포인터·감사 이력 불일치가 없는지 Task 3 실DB 시험.
3. 공개 후 품절·판매중지·개정 이미지 삭제·기간 종료: 링크/카드가 그 요청부터 숨겨지는지 Task 4 시험.
4. 판매자 역할/교차 Origin의 편집본 유출·쓰기: 401/403과 내용 비노출을 Task 3 시험.
5. API 장애/빈 추천/오래된 이벤트 URL: 홈 기본 탐색과 안내 동선이 살아 있는지 Task 5·6 화면 시험.

---

## Task 1 — 저장 구조와 격리 migration

**Files:** `apps/api/src/db/schema.ts`, `apps/api/migrations/0008_s2_home_content.sql`, `apps/api/migrations/meta/_journal.json`, 신규 `apps/api/migrations/meta/0008_snapshot.json`, `apps/api/test/home-schema-db.test.mjs`, `WORK_STATUS.md`.

- [x] 기존 0007 뒤 순서와 실제 migration 생성/실행 방식을 확인하고 시험용 격리 DB·컨테이너 이름, 소유, cleanup을 `WORK_STATUS.md`에 먼저 기록한다. 기존 DB dry-run 및 행 수를 읽기 전용 확인한다.
- [x] RED: 편집본 단일 행, JSON 객체/양의 버전, 수정자 FK, 불변 공개본 ID/게시자 FK, 단일 현재 포인터 FK와 초기 빈 구성, 기존 계정/상품 행 무변경을 검사하는 DB 시험을 먼저 작성한다. `node --import tsx --test apps/api/test/home-schema-db.test.mjs`의 예상 실패를 기록한다.
- [x] `home_content_draft`, `home_content_publications`, `home_content_current`의 Drizzle 정의와 0008 SQL/스냅샷을 일치시킨다. 초기 공개본이 없을 때 현재 포인터는 NULL이고 임의 임시 publication을 만들지 않는다. public API의 빈 구성 응답은 Task 4에서 검증한다. `audit_events`는 기존 테이블 재사용.
- [x] 격리 DB에 0000~0008 적용→시험 GREEN, 이전 코드가 새 테이블을 무시하고 기동하는지 확인, 새 schema 없이도 기존 행이 보존되는지 확인한다. 공유 개발 DB 적용 전 dry-run SQL과 영향/복구 경계를 재확인한다. `pnpm typecheck`도 실행한다.
- [x] 안전 commit 후 `git push`(SSH alias)→WSL `git pull --ff-only`·SHA 일치에서 실DB migration 시험을 수행하고 정확한 격리 DB/컨테이너만 정리한다. 승인된 공유 개발 DB 적용 시 0008만 적용·이력/행 수를 재확인하고 `WORK_STATUS.md`에 남긴다.

## Task 2 — 구성 타입·검증과 판매 가능 상품 조회

**Files:** 신규 `apps/api/src/home/types.ts`, `apps/api/src/home/validation.ts`, `apps/api/src/catalog/public-products.ts`, 신규 `apps/api/test/home-validation.test.mjs`, `apps/api/test/home-eligibility-db.test.mjs`.

**Contract:** `parseHomePayload(value: unknown): HomePayload`는 내부 대상의 discriminated union과 목록 상한/중복/문자열/기간을 검증해 잘못된 입력을 거부한다. `PublicProducts.getSellableByIds(ids: string[])`는 요청 순서의 현재 승인·판매 가능 상품과 유효 썸네일을 반환한다. 배치 조회로 한 번에 최대 기획전/추천 상한을 다루고 N+1·첫 페이지 절단을 피한다.

- [x] RED: 외부 URL·잘못된 UUID·중복 이벤트/상품·빈 이름·12/50/24 상한·종료≤시작·문자열을 벗어난 JSON·이벤트 ID 없는 메뉴를 거부하는 순수 시험을 작성한다. `node --import tsx --test apps/api/test/home-validation.test.mjs` 예상 실패.
- [x] RED: 25번째 이상 선택 상품, 품절 옵션만 있는 상품, 승인 개정 변경, 판매중지, 현재 가격/재고, 이미지 제거 대체를 격리/개발 실DB fixture로 검증한다. `node --import tsx --test apps/api/test/home-eligibility-db.test.mjs` 예상 실패를 정확히 분리한다.
- [x] 타입/검증 함수를 구현하고 카탈로그와 홈이 공유하는 판매 가능 SQL predicate 또는 서비스 메서드를 만든다. 기존 `list()`의 결과/정렬/검색을 바꾸지 않는 회귀 시험을 추가한다.
- [x] 두 목표 시험 GREEN 및 카탈로그 관련 회귀, typecheck/lint 확인. 실DB는 동일 SHA WSL에서 실행 후 fixture 잔류 0 확인, 오류·미검증 기록 및 commit.

## Task 3 — 관리자 편집·공개·복구 API

**Files:** 신규 `apps/api/src/home/repository.ts`, `apps/api/src/home/admin.ts`, `apps/api/src/home/controller.ts`, `apps/api/src/app.module.ts`, 신규 `apps/api/test/home-admin-http-db.test.mjs`.

**Contract:** `/home/admin/draft` GET/PUT `{version,payload}`, `/home/admin/preview` GET `{payload,excluded}`, `/home/admin/publish` POST `{version}` → `{publicationId}`, `/home/admin/history` GET, `/home/admin/restore/:publicationId` POST. 저장 성공 시 version 증가. 오래된 버전은 409, 잘못된 payload/대상은 400, 비인증 401·잘못된 활성 역할/Origin 403. 복구는 과거 publication을 수정하지 않고 현재 포인터만 변경한다.

- [x] RED HTTP 실DB 시험: 고객/판매자 접근·판매자 역할로 전환한 관리자·교차 Origin·버전 경합, 저장만 하고 public 불변, 유효하지 않은 메뉴/기획전 참조와 최소 1개 판매 가능 상품, 공개/복구 포인터와 행위자·역할·이전/새 ID 감사 기록을 검사한다. 별도 QA 계정/상품 정리 경로까지 시험한다.
- [x] 서비스에 transaction과 편집본 row/version 조건부 갱신을 구현한다. 공개는 서버 재검증 후 스냅샷 삽입·포인터 교체·감사 기록을 한 transaction으로 수행한다. 복구도 포인터/감사를 같은 transaction으로 수행하며 이미 제거된 상품은 이후 공개 조회에서 걸러진다.
- [x] controller에서 기존 `AuthRepository`/`readToken`/`requireOrigin` 패턴을 적용하고 `AppModule`에 등록한다. 응답에 DB 비밀/편집본을 섞지 않는다.
- [ ] 목표 실DB GREEN, 동시 요청 반복 시험과 전체 API 회귀, typecheck/lint. WSL 동일 SHA 및 QA cleanup, `WORK_STATUS.md`, commit.

## Task 4 — 공개 홈·기획전 API 및 런타임 재검사

**Files:** 신규 `apps/api/src/home/public.ts`, `apps/api/src/home/controller.ts`, 신규 `apps/api/test/home-public-http-db.test.mjs`.

**Contract:** `GET /home/content` → `{menu,events,recommendations}`; `GET /home/events/:id` → `{id,title,description,products}` 또는 종류가 명확한 안내 상태. 인증 불필요. 고정 메뉴는 프런트에서 보장하고 API는 편집된 추가 메뉴만 반환한다. 기간은 KST 관리자 입력을 UTC instant로 저장/비교하고 시작 포함·종료 미포함이다.

- [ ] RED: 미공개 편집본 비노출, 공개된 카드/추천/기획전 상품 선택 순서, 현재 재고·가격, 시작 전·종료 시각·종료 후, 공개 뒤 모두 품절, 판매중지, 개정/이미지 교체, 무효 메뉴 category/seller/event/product 제거, 추측한 미공개 이벤트 ID를 검사한다.
- [ ] 공개 스냅샷과 현재 판매 가능 상품을 합성한다. 한 공개 응답의 projection에서 시간 기준을 한 번만 잡고 menu/event/recommendation을 일관되게 필터링한다. 장기 HTTP cache를 설정하지 않는다.
- [ ] 목표 시험 GREEN, 카탈로그 조회 회귀·typecheck/lint·WSL 동일 SHA 실DB 시험. fixture·포트·컨테이너 잔류와 audit 수를 확인하고 commit.

## Task 5 — Flat v2 고객 홈·기획전 화면

**Files:** `apps/web/app/page.tsx`, `apps/web/app/home-catalog.tsx`, 신규 `apps/web/app/home-merchandising.tsx`, 신규 `apps/web/app/events/[id]/page.tsx`, `apps/web/app/styles.css`, 신규 `apps/web/test/home-merchandising.test.mjs`, 기존 `apps/web/test/page.test.mjs`.

- [ ] RED 렌더/상태 시험: 고정 홈·제철 메뉴, 관리자 추가 메뉴 순서, 선택 상품만 노출되는 카드/기획전, 이벤트→상품 상세 링크, 추천 0건, 이미지 fallback, API 실패 시 고정 메뉴·검색/분류 유지, 종료 URL 안내를 작성한다.
- [ ] 고객 컴포넌트가 public API만 읽게 구현한다. `home-catalog.tsx`의 최신 공개 4건을 관리자 공통 추천으로 교체하되 카테고리·판매자 탐색이 추천 0건/홈 API 장애 때문에 사라지지 않게 별도 로드 상태를 둔다. 현 검색 form/상품 detail 경로를 유지한다.
- [ ] Flat v2 색·타이포·focus/hover·반응형 카드와 텍스트 이미지 fallback을 적용한다. 특정 상품의 행사 문구를 임의 할인·배송 보장처럼 표시하지 않는다.
- [ ] 목표 시험 GREEN, `pnpm typecheck`, `pnpm lint`, `pnpm build`, 홈/상품 관련 회귀. 같은 SHA의 WSL 빌드·실브라우저 1920×1080/1440×900/430×844, Tab/Enter, 빈/오류/품절을 기록한다. 확대 200%는 실제 브라우저 배율 증거가 없으면 미검증. commit.

## Task 6 — Flat v2 관리자 편집 화면

**Files:** 신규 `apps/web/app/account/admin/home/page.tsx`, 필요 시 `apps/web/app/account/admin/page.tsx`의 내비게이션, `apps/web/app/styles.css`, 신규 `apps/web/test/admin-home.test.mjs`.

- [ ] RED 화면 시험: 관리자 접근, 메뉴 대상 선택·순서, 기획전 상품/이미지/기간, 추천 순서, 저장/미리보기/공개/복구의 분리, 충돌 409 재로드 안내, 제외 사유, 저장/공개 후 재조회 실패 문구 구별, 비관리자 접근 차단.
- [ ] 기존 관리자 세션/role 확인·credential fetch 패턴을 재사용한다. 선택 가능한 category/seller/product는 현재 catalog API에서 가져오고 id만 저장한다. 시간 입력은 KST 표기와 유효성 안내, 게시 전 서버 검증 오류는 필드/대상과 연결한다.
- [ ] 목표 시험 GREEN 및 typecheck/lint/build. 실브라우저 관리자/판매자/고객으로 권한·키보드/반응형/미리보기와 공개 전후 차이를 확인한다. 오류/fixture 수·미검증과 commit을 남긴다.

## Task 7 — Stage 검증·정리·인수 경계

**Files:** `WORK_STATUS.md`, 필요할 때 `docs/WORK_PLAN.md`의 실제 완료/미검증 체크만 업데이트. 설계 변경은 별도 승인 경계.

- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `.github/pr-broker-body.test.mjs`를 실행하고 개별 pass/fail/skip을 기록한다. 관련 실DB 시험은 동일 commit SHA WSL `shoppingmall`에서 0 skip으로 다시 실행한다.
- [ ] 테스트 전/후 개발 DB 계정/상품/전시 관계·감사 QA 잔류, 임시 DB/컨테이너/포트, Git status를 비교한다. 지운 것은 정확한 QA 자원과 복구 가능성을 기록한다.
- [ ] 브라우저의 고객/판매자/관리자 시나리오, 폭 3종, 키보드, 빈 상태, 실제 200% 확대를 각각 PASS/미검증으로 남긴다. 코드 리뷰의 Critical/Important를 해결하고 새 API/DB 계약과 spec 편차를 점검한다.
- [ ] S2.4 전체 검증/계획상 gate를 확인해 PR에 목적·변경·영향·검증·미검증·rollback을 기재한다. 이 계획의 일부만 끝났으면 S2.4 완료/PR 병합/UAT로 승격하지 않는다. 고객 인수·외부 연동은 후속 계획과 별도 evidence다.
