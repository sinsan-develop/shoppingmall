# 어울몰 역할별 클릭형 시안 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 신산님이 고객·판매자·관리자의 주요 화면 흐름을 각각 독립된 가상 클릭 시안으로 검토할 수 있게 한다.

**Architecture:** `docs/design/prototypes/`의 역할별 HTML 3개가 승인된 정적 시안 CSS를 참조한다. 각 역할의 JavaScript 스크립트는 독립된 메모리 상태와 DOM 조작을 담당하고, 새로고침 때 초기화한다. 서버·DB·브라우저 저장소·외부 API는 사용하지 않는다.

**Tech Stack:** HTML, CSS, 브라우저 기본 classic JavaScript(`file://` 검토를 위한 실행 중 변경), Node.js 내장 `node:test`·`assert`.

**Spec:** [승인된 역할별 독립 클릭형 시안 설계](../specs/2026-09-26-clickable-prototype-design.md)

## Global Constraints

- 작업 경로는 `D:\Project\shoppingmall2`. 기존 OneDrive 폴더와 `D:\Project\shoppingmall` 참고 저장소를 수정하지 않는다.
- 고객·판매자·관리자 상태는 서로 공유하지 않는다. 각 시안은 새로고침 시 초기 상태로 돌아가며 `localStorage`/`sessionStorage`를 쓰지 않는다.
- 기존 정적 시안 4개와 어울몰 브랜드·황금/크림 색상·서체를 유지한다. 본문 12px, 주요 제목 18px, 상품명 13px, 가격 14px, 모바일 주요 입력 16px 기준을 보존한다.
- 모든 가격·이름·주소·주문번호·운송장은 가상이다. 실제 로그인·결제·송금·발송·알림·권한 검사는 없다.
- `main` 직접 커밋 금지. 현 작업공간은 최초 커밋 없는 `master`이고 원격이 없으므로 시안 단계의 변경은 `WORK_STATUS.md`에 기록하되, 초기 기준선/branch 승인 전 `git commit`·push·worktree 생성은 하지 않는다.
- 브라우저 `file://` 접근 정책을 우회하지 않는다. 실제 브라우저 검증을 수행하지 못하면 자동검사와 분리해 미검증으로 기록한다.
- 상태 전이 함수는 입력 상태를 변경하지 않고 `{ state: 다음상태, error: null | 오류문구 }`를 반환한다. 화면은 `error`를 텍스트 상태 안내로 보여 준다. 목록·합계 조회 함수는 입력 상태를 변경하지 않는다.

## Review Focus

1. 빈 장바구니 → 결제 진행이 차단되고 금액 0원으로 보이는지 Task 1에서 검증.
2. 재고 0개 또는 품절 상품 → 장바구니 추가와 결제 진행이 차단되는지 Task 1에서 검증.
3. 모의 결제 실패 → 완료 주문이 생성되지 않고 재시도 안내가 나오는지 Task 1에서 검증.
4. 판매자 승인 대기 → 무료배송 공개 기준이 50,000원에서 60,000원으로 미리 바뀌지 않는지 Task 2에서 검증.
5. 정산 종료일이 시작일보다 앞서거나 같은 농가의 완료 기간과 겹침 → 완료 기록을 막되 다른 농가의 같은 기간은 허용하는지 Task 3에서 검증.

---

## 파일 책임 지도

| 파일 | 단일 책임 |
|---|---|
| `docs/design/prototypes/shared.css` | 기존 정적 CSS를 불러오고 클릭형 탭·상태·focus만 추가 |
| `docs/design/prototypes/customer.html`, `customer.js` | 고객 화면과 고객 가상 장바구니·결제·취소 상태 |
| `docs/design/prototypes/seller.html`, `seller.js` | 판매자 화면과 승인 대기·품절·출고 상태 |
| `docs/design/prototypes/admin.html`, `admin.js` | 관리자 화면과 승인·환불·기간별 정산 상태 |
| `docs/design/prototypes/*.test.mjs` | 각 역할의 순수 상태 전이·금액·기간 규칙 검사 |
| `docs/design/prototypes/README.md` | 신산님 검토 경로·가상 기능/미검증 안내 |

### Task 1: 고객 구매·취소 시안 — 정적 검사 완료, 브라우저 미검증

**Files:** Create `docs/design/prototypes/customer.html`, `customer.js`, `customer.test.mjs`, `shared.css`.

**Interfaces:** `createCustomerState(): CustomerState`, `addItem(state, productId): ActionResult`, `quoteCart(state): { groups, total }`, `simulatePayment(state, result: 'success'|'failure'): ActionResult`, `cancelPreShipment(state, shipmentId): ActionResult`를 `customer.js`에서 Node 검사 시 CommonJS로 노출한다. 각 group은 `{ shipmentId, subtotal, discount, shipping, payable }`이고 취소 결과 상태에는 `refundAmount`가 남는다. DOM 초기화는 `mountCustomer(root)`가 담당한다.

- [x] **Step 1: 실패하는 상태·금액 테스트 작성.** `customer.test.mjs`에서 기본 예시 고추 52,000원·양파 30,000원·마늘 18,000원, 할인 5,000원, 배송비 0/3,000/3,000원, 통합 합계 101,000원을 단정한다. 빈 장바구니, 품절 추가 거부, 모의 결제 실패 후 주문 없음, 출고 전 농가 B 전체 취소 환불 33,000원과 다른 두 주문 유지도 각각 검증한다.
- [x] **Step 2: RED 확인.** `node --test docs/design/prototypes/customer.test.mjs`를 실행해 구현 누락 때문에 실패함을 확인한다.
- [x] **Step 3: 최소 상태 모델 구현.** 5개 대표 상품의 가상 정보, 농가 A/B·어울몰 발송 구분, 고추 주문에만 적용된 예시 할인 5,000원, 할인 전 5만 원 무료배송, 결제 성공/실패, 출고 전 전체 취소만 구현한다. 품절 옵션과 빈 장바구니는 결제 불가로 처리하고 출고 후 환불액은 계산하지 않는다.
- [x] **Step 4: 고객 HTML·상호작용 구현.** 홈→상품 정보→장바구니→분리 주문/통합 결제→성공/실패→주문별 취소 안내를 버튼과 상태 문구로 연결한다. 결제 버튼에는 항상 `모의`를 표시하고 실제 PG·API 호출은 하지 않는다. `shared.css`는 `../assets/owool-static-v1.css`를 불러온다.
- [x] **Step 5: GREEN 확인.** `node --test docs/design/prototypes/customer.test.mjs docs/design/assets/typography.test.cjs`; 두 파일 모두 실패 0건이어야 한다. 결과와 미검증 브라우저 항목을 `WORK_STATUS.md`에 기록한다.

### Task 2: 판매자 담당 업무 시안 — 정적 검사 완료, 브라우저 미검증

**Files:** Create `docs/design/prototypes/seller.html`, `seller.js`, `seller.test.mjs`; reuse `shared.css`.

**Interfaces:** `createSellerState(): SellerState`, `requestFreeShipping(state, proposedThreshold): ActionResult`, `markSoldOut(state, productId): ActionResult`, `requestRestock(state, productId, proposedStock): ActionResult`, `shipOrder(state, orderId, trackingNumber): ActionResult`를 `seller.js`에서 Node 검사 시 CommonJS로 노출하고 `mountSeller(root)`로 DOM을 연결한다. Task 1의 고객 상태는 import하지 않는다.

- [x] **Step 1: 실패하는 판매자 상태 테스트 작성.** 50,000→60,000원 요청 후 공개 기준 50,000원 유지·요청 상태 `승인 대기`, 재고 0개 즉시 구매 차단, 재고 증가 요청 후에도 차단 유지, 유효한 운송장 입력 시 즉시 출고 표시를 검증한다. 빈 운송장과 다른 판매자 주문 식별자도 거부한다.
- [x] **Step 2: RED 확인.** `node --test docs/design/prototypes/seller.test.mjs`에서 기대한 미구현 실패를 확인한다.
- [x] **Step 3: 모델과 화면 구현.** 농가 A 담당 범위의 상품·주문만 표시하고 정책 변경 요청, 품절, 재판매 요청, 출고·운송장 예시를 독립적으로 체험하게 한다. 환불 최종 결정과 정산 완료 조작은 제공하지 않는다.
- [x] **Step 4: GREEN 확인.** `node --test docs/design/prototypes/seller.test.mjs docs/design/prototypes/customer.test.mjs`; 실패 0건이어야 한다. 결과와 미검증을 `WORK_STATUS.md`에 기록한다.

### Task 3: 관리자 승인·환불·정산 시안 — 정적 검사 완료, 브라우저 미검증

**Files:** Create `docs/design/prototypes/admin.html`, `admin.js`, `admin.test.mjs`; reuse `shared.css`.

**Interfaces:** `createAdminState(): AdminState`, `decideRequest(state, requestId, decision: 'approve'|'reject'): ActionResult`, `refundPreShipment(state, shipmentId): ActionResult`, `sumSettlement(state, farmId, startDate, endDate): { totals, error }`, `completeSettlement(state, farmId, startDate, endDate): ActionResult`를 `admin.js`에서 Node 검사 시 CommonJS로 노출하고 `mountAdmin(root)`로 DOM을 연결한다. `totals`는 `{ sales, fees, shipping, discounts, refunds }`이고 날짜는 `YYYY-MM-DD` 문자열이다. 다른 역할의 상태는 import하지 않는다.

- [x] **Step 1: 실패하는 관리자 상태 테스트 작성.** 요청 승인·반려의 시안 내 이력, 출고 전 농가 B 주문의 상품 30,000원+배송비 3,000원 환불, 출고 후 환불액 자동결정 금지를 검증한다. 5월 1일 판매와 7월 1일 환불의 발생일 분리·원주문 연결, 농가 A 완료/농가 B 미완료 독립성, 같은 농가 기간 중복·역전 날짜 거부를 검증한다.
- [x] **Step 2: RED 확인.** `node --test docs/design/prototypes/admin.test.mjs`에서 기대한 미구현 실패를 확인한다.
- [x] **Step 3: 모델과 화면 구현.** 요청 비교·승인/반려, 출고 전 전체 취소, 출고 후 사유/증빙 확인까지만, 날짜별 항목/기간 합계·농가별 개별 완료를 표시한다. 수수료 등 항목은 가상 발생 자료만 표시하고 최종 지급액·송금을 계산하거나 실행하지 않는다.
- [x] **Step 4: GREEN 확인.** `node --test docs/design/prototypes/admin.test.mjs docs/design/prototypes/seller.test.mjs docs/design/prototypes/customer.test.mjs`; 실패 0건이어야 한다. 결과와 미검증을 `WORK_STATUS.md`에 기록한다.

### Task 4: 역할별 화면 연결·검토 인계 — 정적 검사 완료, 사용자 검토 대기

**Files:** Create `docs/design/prototypes/README.md`, `docs/design/prototypes/prototype-shell.test.mjs`; Modify `docs/design/DESIGN.md`, `WORK_STATUS.md`.

**Interfaces:** 각 HTML은 자신의 classic `.js`와 `shared.css`만 불러온다. `README.md`는 세 시안의 시작 파일과 클릭 순서, 가상/실제 기능 경계, 초기화 방법을 안내한다.

- [x] **Step 1: 실패하는 연결 테스트 작성.** `prototype-shell.test.mjs`에서 HTML 3개가 각각 해당 역할 스크립트와 공유 CSS를 참조하고, 다른 역할 스크립트·브라우저 저장소·원격 API 참조가 없으며, 모든 시안에 `가상` 안내와 `처음부터` 조작이 있음을 검사한다.
- [x] **Step 2: RED 확인.** `node --test docs/design/prototypes/prototype-shell.test.mjs`에서 누락 요소 때문에 실패함을 확인한다.
- [x] **Step 3: 화면·안내 보정.** 세 진입점의 연결·버튼·키보드 focus 스타일·상태 문구를 코드에서 확인하고 `README.md`와 `DESIGN.md`에 시안 링크와 범위를 연결한다. 실제 브라우저 동작·키보드 흐름은 미검증으로 남긴다.
- [x] **Step 4: 전체 자동 검사.** `node --test docs/design/prototypes/customer.test.mjs docs/design/prototypes/seller.test.mjs docs/design/prototypes/admin.test.mjs docs/design/prototypes/prototype-shell.test.mjs docs/design/assets/typography.test.cjs`에서 24통과·0실패를 확인했다. 실제 브라우저로 1920×1080, 1440×900, 430×844, 200% 확대와 키보드 흐름을 시험할 수 있을 때만 별도로 PASS를 기록한다.
- [x] **Step 5: 사용자 검토 인계.** `WORK_STATUS.md`에 변경 파일·시험 증거·브라우저 미검증·신산님 검토 경로를 기록한다. 클릭형 시안 최종 승인은 신산님께 요청한다. Git 초기 기준선 승인 전 커밋·push·PR·WSL/Oracle 배포는 하지 않는다.

## 실행·승인 경계

이 계획은 클릭형 **디자인 시안**만 다룬다. 제품의 Next.js/Expo/NestJS 구현, 실제 계정·결제·DB/PG 연동, Oracle 배포와 법률 미확정 환불 정책을 포함하지 않는다. 신산님이 2026-09-26 이 계획과 직접 순차 제작을 승인했다. 각 Task는 검증을 거쳐 진행하되 최초 Git 기준선 승인 전 커밋·push는 하지 않는다.
