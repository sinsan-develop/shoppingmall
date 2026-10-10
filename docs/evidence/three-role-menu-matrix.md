# 세 역할 18개 대표 화면 검증 행렬

- 대상 계획: `docs/WORK_PLAN_20260-10-10-2.md` Task 6·7.
- 기준 브랜치: `codex/work-plan-20261010-2`; 실행 SHA·QA DB system ID·브라우저 버전은 실행 때 행별로 기록한다.
- 판정 규칙: 아래 모든 행은 아직 `UNVERIFIED`다. 로컬 빌드의 경로 생성과 화면 조작·DB·WSL·PC 200% 검증은 다르다.
- 2026-10-11 정적 준비 확인: `e425dba580e6fd1dccd9166beb5dc12a8ec2da0e`의 Windows `pnpm build`에서 이 행렬의 정적 17경로와 동적 `/products/[productId]` 1경로가 모두 생성됐다. 이는 라우트 존재 확인일 뿐 아래 WSL·브라우저 판정을 바꾸지 않는다.
- 2026-10-11 부분 증거: WSL exact SHA `f475cb8b7c7214cd3fffa833e80091ef6f514edb`의 전용 QA DB에서 공개 상품 DB 시험 7/7과 관리자 분류 실제 HTTP 권한 시험 1/1이 통과했다. QA 자료·일회성 실행기 잔류 0. 이는 #2·#3·#11의 DB/API 일부 경로에 한정하며 Next 화면 조작·재시도·18행 전수·PC 200%의 `UNVERIFIED` 판정은 그대로다.
- 2026-10-11 부분 증거: WSL exact SHA `d8908372ca76e7ae1dc617312c84b6bc5da0069f`에서 판매자 상품 실제 HTTP 시험 1/1 통과. 판매자 A/B 초안 조회·수정/삭제 권한 분리와 미공개 유지가 #6의 API 부분에 해당한다. 시험 행·실행기 잔류 0이며 #6의 Next 화면·재시도 및 200%는 여전히 `UNVERIFIED`다.
- 2026-10-11 부분 증거: WSL exact SHA `7602c1c2fa21c8eb49a35f56518cf636330d0454`에서 홈 공개 실제 HTTP 시험 1/1 통과. 미발행/활성/품절/가격 변경에 따른 #1의 API 부분만 확인했다. 홈 단일 설정과 QA 자료는 원상 복귀, 일회성 실행기 잔류 0. #1의 Next 화면·재시도 및 200%는 `UNVERIFIED`다.
- 2026-10-11 별도 계정 화면 부분 증거: exact SHA `f622c1fef93a3f55e4d15f59e065b3fa0e1f7315`에서 Windows 로컬 Web/API·Chrome 154.0.8037.98과 승인된 WSL 전용 QA DB를 루프백 터널로 연결해 가입→판매자 신청/심사→관리자 모의 첫 설정→비밀번호 재설정, 무효 링크·전달 실패, 430/1440px·Tab을 확인했다. QA·보호 DB의 대상 계정/역할/토큰/신청 잔류 0, 시험 포트·프로필 잔류 0. 이 결과는 18개 대표 메뉴의 WSL API/Next 실행이나 실제 메일 수신·Chrome/Edge 브라우저 자체 200% 검증으로 승격하지 않는다.
- 2026-10-11 구매자 #3·#4 로컬 브라우저 부분 증거: exact SHA `7979f55dafe6a73990b1c474802e26b786e57a80`의 Windows 로컬 Web/API·격리 Chrome과 WSL 전용 QA DB에서 가상 상품 상세의 수량 2→장바구니 49,000원→수량 3 무료배송 69,000원→390px/Tab→제거·빈 목록을 확인했다. QA ID `c7511011`의 대상 행·포트·프로필 잔류는 정리 후 0. WSL에서 실행한 Web/API, 다른 판매자/권한·오류 재시도, PC 실제 200%는 미실행이므로 #3·#4 전체 행은 `UNVERIFIED`다.
- 2026-10-11 구매자 #3·#5 로컬 브라우저 부분 증거: exact SHA `56734f3f6550cf61682c1d9f30d76401d1cc8650`의 Windows 로컬 Web/API·격리 Chrome과 WSL 전용 QA DB에서 가상 고객 로그인, 이메일 수신 동의 저장·재방문, 430px/Tab, 상품 찜, 품절 1kg 옵션 재입고 신청→계정 목록→재방문 유지→취소를 확인했다. QA ID `e7411011`의 전용/보호 DB 대상 계정·판매자·상품·분류와 네 시험 포트·프로필 잔류는 0이다. #5의 주문·배송·클레임, 오류/권한·재시도, WSL 실행 Web/API와 PC 실제 200%를 시험한 것은 아니므로 #3·#5 전체 행은 계속 `UNVERIFIED`다.
- 계정/자료 규칙: 전용 WSL QA DB에 8자리 `<runId>`로 `qa+<runId>-<role>@example.invalid` 계정과 `qa-<runId>-...` 판매자·상품을 멱등 생성한다. 서로 다른 판매자 A/B와 구매자·운영자를 분리한다. 보호 `shoppingmall` DB에는 시험 거래를 쓰지 않는다. 생성 manifest에 해당 실행의 계정·상품·주문·불변 사건 ID를 남기고, 시험 후 소유 행과 외부 참조를 확인한다. 불변 사건을 임의 삭제하지 않으며 보존/폐기는 정확한 전용 QA DB 식별과 계획 경계에 따른다.
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
