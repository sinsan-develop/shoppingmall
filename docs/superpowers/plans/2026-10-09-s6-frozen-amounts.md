# S6 완료 금액 고정 구현 계획

## Goal

완료 기간의 포함 사건과 항목별 금액을 불변으로 고정하고, 소급 입력된 수수료 등 추가 사건을 분리 조회·인쇄한다.

## Architecture / Spec

승인된 `docs/S6_COMPLETED_AMOUNT_DESIGN_PROPOSAL.md`를 기준으로 `0021` 연결 테이블, 원자적 완료, 기간 조회의 고정/추가 구획, 관리자 수수료 입력을 구현한다. 기존 `0020`은 수정하지 않는다.

## Global Constraints

- `codex/s6-settlement`의 기존 격리 worktree만 사용한다. `main` 직접 변경 금지.
- 공유 `local-postgres/shoppingmall`의 migration 및 QA 행은 별도 직접 승인 전 금지.
- PG 실험은 사전 식별한 격리 DB에서 수행하고 정확한 자원만 정리한다.
- 기존 결제·환불 장부 불변과 원주문 연결, 판매자 권한 격리를 유지한다.
- 실제 발송·인수테스트는 현 완료 대상에서 제외한다.

## Tasks

### 1. 0021 고정 연결 스키마

Files: `apps/api/migrations/0021_s6_completed_event_links.sql`, `apps/api/migrations/meta/_journal.json`, `apps/api/src/db/schema.ts`, `apps/api/test/settlement-schema-db.test.mjs`.

Test first: 기존 완료 기간이 있으면 migration 거부, 연결 중복·판매자/기간 불일치·UPDATE/DELETE 거부를 RED로 확인한다. 0021을 추가하고 격리 PG15에서 GREEN을 확인한다.

Produces: `(period_id,event_id)`의 불변·고유 관계. Consumed by Tasks 2–3.

### 2. 완료 원자성과 조회 분리

Files: `apps/api/src/settlement/{complete,controller,repository,summary}.ts`, 완료/조회 단위·DB·HTTP 시험.

Test first: 완료가 보이는 사건만 연결하고 0건 기간도 고정되며, 나중에 들어온 과거 사건은 `lateGroups/lateTotals`로만 보이고 `frozenTotals`가 유지되는 시험을 RED로 확인한다. 완료 DB 트랜잭션과 일관된 읽기 스냅샷을 구현한다.

Produces: 관리자·판매자 정산 조회 확장. Consumed by Task 3 UI.

### 3. 관리자 수수료 수동 기록

Files: `apps/api/src/settlement/{commission,controller}.ts`, 인증·입력·중복·DB/HTTP 시험.

Test first: 관리자 전용·Origin·양의 안전 정수·발생시각·근거·UUID 중복, 판매자 IDOR 거부를 RED로 확인한다. 동일 요청 재시도는 사건 한 개만 반환하고 다른 본문은 충돌로 거부한다.

Produces: `POST /admin/settlement/commissions`.

### 4. 조회 화면·인쇄·검증

Files: `apps/web/app/account/{settlement-page,settlement-report}.tsx`, 화면/브라우저 시험, `WORK_STATUS.md`.

Test first: 완료 당시 금액과 추가 발생의 분리, 발생일/기록일/근거, 전체·분류·개별·판매자 본인·PDF 일치를 RED로 확인한다. 로컬 test/typecheck/lint/build, 격리 PG15/HTTP/Chromium/PDF, exact SHA WSL을 검증한다. 공유 DB 적용은 별도 승인 gate로 남긴다.

## Review Focus

동시 결제와 완료의 포함 경계, READ COMMITTED에서의 조회 일관성, 기존 완료 행을 소급 채우지 않는 migration, 수수료 중복 요청의 본문 충돌, 판매자 데이터 누출, 인쇄 합계와 API 합계 일치.
