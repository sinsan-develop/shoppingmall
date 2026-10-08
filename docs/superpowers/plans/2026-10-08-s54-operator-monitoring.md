# S5.4 관리자 관제 구현 계획

> 기존 승인 `docs/WORK_PLAN.md` S5.4와 `docs/design/DELIVERY_SCOPE_ADDENDUM.md` 운영 범위를 실행한다. 신산님의 관리자 전용 읽기 API 직접 승인(2026-10-08)을 적용한다. 별도 schema·자동 경보·실발송은 범위 밖이다.

**목표:** 관리자만 기간·상태·판매자별 주문·상품매출·재고·클레임 요약과 실패 결제·미출고 및 기존 운영 예외를 조회하고 근거 화면으로 이동한다.

**구조:** Nest 읽기 전용 `/admin/monitoring`은 기존 쿠키 세션의 `admin` 역할만 허용한다. 필터 파싱을 순수 함수로 분리하고, PostgreSQL 반복 가능 읽기 트랜잭션에서 항목별 원자료를 집계한다. Next 관리자 화면은 한 요청으로 요약과 제한된 예외 목록을 받고, 운영자의 수동 새로고침으로 조치 후 갱신한다.

**기술:** NestJS·pg·PostgreSQL·Next.js/React·Node test. 신규 migration/dependency 없음.

**숫자 계약:** 주문 건수는 선택 기간(Asia/Seoul)의 생성된 통합 주문 수이며 선택 주문 상태를 따른다. 상품매출은 같은 기간에 결제 완료된 발송 주문의 `shipment_order_lines.goods_payable_won` 합(배송비 제외·사후 환불 차감 전)이다. 재고는 조회 시각의 현재 공개 옵션 건수·품절 건수이며 기간 필터와 무관하다. 클레임 건수는 기간 내 접수 건수이며 선택 클레임 상태를 따른다. 실패 결제는 기간 내 `DECLINED`/`REVIEW_REQUIRED` 시도 이력으로, 이후 주문이 결제 완료돼도 시도 이력을 보존하고 현재 주문 상태를 함께 표시한다. 실패 시도의 `requestedWon`은 판매자 몫이 아니라 통합 주문 전체 요청액이다. 미출고는 기간 내 결제된 `READY`/`PACKING`/`DELAYED` 발송 주문이다. 판매자 범위는 주문·매출·결제의 원판매자 라인, 재고·클레임·문의의 소유 판매자, 출고의 담당 판매자로 명시한다. 요약은 정산 지급액이나 실시간 SLA가 아니다.

**검토 초점:** 두 판매자가 섞인 주문의 중복 집계, 할인·배송비를 상품매출에 잘못 포함, 날짜의 KST 경계, 판매자/구매자 직접 호출, 조치 뒤 예외 잔류, 목록 제한으로 인한 요약 누락.

## Task 1 — 필터·읽기 API

- 파일: `apps/api/src/monitoring/query.ts`, `apps/api/src/monitoring/repository.ts`, `apps/api/src/monitoring/controller.ts`, `apps/api/src/app.module.ts`, `apps/api/test/monitoring-query.test.mjs`, `apps/api/test/monitoring-http-db.test.mjs`.
- 인터페이스: `parseMonitoringQuery(query, now?) -> MonitoringFilter`; `readMonitoring(pool, filter) -> MonitoringOverview`; `GET /admin/monitoring?from&to&sellerId&orderStatus&claimStatus`.
- [ ] 입력·KST 경계·잘못된 UUID/상태/날짜가 거부되는 순수 시험을 먼저 추가하고 실패를 본다.
- [ ] 관리자 인증/타 역할 401·403, 두 판매자 합계·기간/상태·빈 목록·원자료 ID를 검증하는 실제 DB/HTTP 시험을 먼저 추가하고 실패를 본다.
- [ ] 파서·읽기 전용 snapshot SQL·controller를 최소 구현한다. SQL은 값 매개변수화, 제한 목록은 최신순+ID 보조 정렬, 전체 요약은 제한 없이 산출한다.
- [ ] 표적 시험·전체 로컬 시험·typecheck/lint/build를 실행한다. QA 행은 해당 run만 정리한다.

## Task 2 — 관리자 화면·근거 이동

- 파일: `apps/web/app/account/admin/monitoring/page.tsx`, `apps/web/app/account/page.tsx`, `apps/web/app/globals.css`(필요할 때만), `apps/web/test/monitoring-page.test.mjs`.
- 인터페이스: 관리자 계정 메뉴 `/account/admin/monitoring`; 화면은 날짜·원판매자/담당 판매자·주문/클레임 상태 필터와 명확한 금액·시점 라벨, 예외 빈 상태, 원자료 화면 링크를 제공한다.
- [ ] 필터/요약/목록/오류·빈 상태·근거 링크를 검증하는 화면 시험을 먼저 추가하고 실패를 본다.
- [ ] 기존 Flat v2 토큰·컴포넌트로 최소 화면을 구현한다. 요청 중복·경쟁은 AbortController로 폐기하고 자동 폴링하지 않는다.
- [ ] 화면 시험·전체 로컬 gate를 실행한다.

## Task 3 — 정식 WSL·브라우저·종료

- [ ] 안전 commit을 SSH 별칭 원격 작업 브랜치에 push하고 WSL 지정 checkout을 exact SHA로 ff-only 맞춘다. 공유 개발 DB migration 불변을 확인한다.
- [ ] 정식 WSL Web/API에서 합성 계정·주문/예외를 seed한 뒤 관리자 API 숫자와 실제 Chrome 1920/430·키보드·원자료 이동·새로고침을 대조하고 타 역할 거부를 확인한다.
- [ ] fixture reset, DB 소유 행0, 정확 임시 container/port/profile0을 확인한다. 로컬 전체 gate·리뷰 후 Stage PR 본문에 목적·영향·검증·미검증·rollback을 기록하고 기존 `.github` 자동화로 PR/병합·merged-main smoke·branch/worktree 정리를 진행한다.
