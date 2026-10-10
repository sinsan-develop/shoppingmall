# 세 역할 18개 대표 화면 검증 행렬

- 대상 계획: `docs/WORK_PLAN_20260-10-10-2.md` Task 6·7.
- 기준 브랜치: `codex/work-plan-20261010-2`; 실행 SHA·QA DB system ID·브라우저 버전은 실행 때 행별로 기록한다.
- 판정 규칙: 아래 모든 행은 아직 `UNVERIFIED`다. 로컬 빌드의 경로 생성과 화면 조작·DB·WSL·PC 200% 검증은 다르다.
- 2026-10-11 정적 준비 확인: `e425dba580e6fd1dccd9166beb5dc12a8ec2da0e`의 Windows `pnpm build`에서 이 행렬의 정적 17경로와 동적 `/products/[productId]` 1경로가 모두 생성됐다. 이는 라우트 존재 확인일 뿐 아래 WSL·브라우저 판정을 바꾸지 않는다.
- 계정/자료 규칙: 전용 WSL QA DB에 `qa-1010-2-<runId>` 접두 계정·판매자·상품·주문을 멱등 생성한다. 서로 다른 판매자 A/B와 구매자·운영자를 분리한다. 보호 `shoppingmall` DB에는 시험 거래를 쓰지 않는다. 생성 manifest에 계정·상품·주문·불변 사건 ID를 남기고, 시험 후 소유 행과 외부 참조를 확인한다. 불변 사건을 임의 삭제하지 않으며 보존/폐기는 정확한 전용 QA DB 식별과 계획 경계에 따른다.
- 공통 관찰: 각 화면마다 정상 자료 표시/조작, 빈 자료 또는 오류, 익명·타 역할·타 판매자 접근, 서버 오류·중복 요청 뒤 재시도를 각각 별도로 기록한다. 화면 HTTP 200만으로 합격하지 않는다.

| # | 역할 | 경로 | 정상·금액/상태 | 빈/오류 | 권한·소속 | 재시도/멱등 | WSL 판정 | Chrome·Edge 200% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 구매자 | `/` | 전시 상품·가격·이벤트 | 빈 전시/조회 실패 | 공개 정보만 | 재조회 | UNVERIFIED | UNVERIFIED |
| 2 | 구매자 | `/products` | 검색·분류·가격·재고 | 결과 없음/조회 실패 | 미공개 상품 차단 | 필터 재적용 | UNVERIFIED | UNVERIFIED |
| 3 | 구매자 | `/products/[productId]` | 고정 QA 상품 옵션·배송 | 없는/품절 상품 | 미공개 상품 차단 | 옵션 재선택 | UNVERIFIED | UNVERIFIED |
| 4 | 구매자 | `/cart` | 수량×가격·배송비·삭제 | 빈 장바구니/재고 부족 | 다른 계정 장바구니 차단 | 수량 변경·견적 재조회 | UNVERIFIED | UNVERIFIED |
| 5 | 구매자 | `/account/customer` | 자기 주문·배송·클레임 | 주문 없음/조회 실패 | 타 계정·익명 차단 | 상태 재조회 | UNVERIFIED | UNVERIFIED |
| 6 | 판매자 | `/account/seller/products` | 자기 상품·재고 | 상품 없음/수정 실패 | 타 판매자 변경 차단 | 요청 재조회 | UNVERIFIED | UNVERIFIED |
| 7 | 판매자 | `/account/seller/orders` | 자기 주문·상태 | 주문 없음/조회 실패 | 타 판매자 주문 차단 | 필터 재조회 | UNVERIFIED | UNVERIFIED |
| 8 | 판매자 | `/account/seller/shipping` | 출고·운송장 | 운송장 오류/빈 목록 | 타 판매자 발송 차단 | 중복 갱신 | UNVERIFIED | UNVERIFIED |
| 9 | 판매자 | `/account/seller/support` | 자기 문의·클레임 | 문의 없음/처리 오류 | 타 판매자 자료 차단 | 처리 재조회 | UNVERIFIED | UNVERIFIED |
| 10 | 판매자 | `/account/seller/settlement` | 자기 분류·발생액 | 사건 없음/조회 실패 | 타 판매자 정산 차단 | 기간 재조회 | UNVERIFIED | UNVERIFIED |
| 11 | 관리자 | `/account/admin/catalog` | 분류·상품 승인 | 제안 없음/승인 실패 | 비관리자 차단 | 승인 재조회 | UNVERIFIED | UNVERIFIED |
| 12 | 관리자 | `/account/admin/proposals` | 판매자 요청·심사 | 요청 없음/반려 오류 | 비관리자 차단 | 중복 심사 | UNVERIFIED | UNVERIFIED |
| 13 | 관리자 | `/account/admin/promotions` | 배너·혜택 상태 | 혜택 없음/등록 오류 | 비관리자 차단 | 등록 재조회 | UNVERIFIED | UNVERIFIED |
| 14 | 관리자 | `/account/admin/fulfillment` | 발송·지연 목록 | 주문 없음/전이 오류 | 비관리자 차단 | 상태 재조회 | UNVERIFIED | UNVERIFIED |
| 15 | 관리자 | `/account/admin/refunds` | 요청·결정·금액 | 요청 없음/환불 실패 | 비관리자 차단 | 중복 처리 | UNVERIFIED | UNVERIFIED |
| 16 | 관리자 | `/account/admin/support/claims` | 사유·증빙·결정 | 클레임 없음/처리 오류 | 비관리자 차단 | 결정 재조회 | UNVERIFIED | UNVERIFIED |
| 17 | 관리자 | `/account/admin/settlement` | 전체·분류·판매자별 발생액 | 사건 없음/조회 실패 | 비관리자 차단 | 기간·인쇄 재조회 | UNVERIFIED | UNVERIFIED |
| 18 | 관리자 | `/account/admin/monitoring` | 주문·결제·지연 지표 | 사건 없음/조회 실패 | 비관리자 차단 | 알림 재조회 | UNVERIFIED | UNVERIFIED |

별도 계정 화면 `/signup`, `/admin-setup`, `/forgot-password`, `/reset-password`, `/account/seller/apply`, `/account/admin/seller-applications`는 Task 5·7에서 동일한 정상·오류·권한·재시도 및 실제 브라우저 200% 기준으로 기록한다. 앞선 관리자·판매자 정산 인쇄의 사용자 직접 확인은 당시 시험 자료의 증거이며 이 행렬의 새 SHA/QA DB 검증으로 승계하지 않는다.
