# S4.2 출고 전 취소·환불 계약 — 격리 구현 승인

상태: **2026-10-05 PMO 경유 신산님 지시로 현 branch의 0014 추가식 6관계·고객/관리자 API·권한/금액/재고 복원 계약과 격리 구현·검증 승인**. 기준 checkout은 `codex/s4-payment-refund@ad05adc874e4ff97005f8b50f04f7a7ba5c466a1`. 근거는 [DESIGN](DESIGN.md) R06/R07, [PRD](../PRD.md) 7.5·8.2·8.4, [WORK_PLAN](../WORK_PLAN.md) S4.2 및 기존 [S4.1 결제 계약](S4_PAYMENT_CONTRACT_DRAFT.md)이다. 공유 개발 DB 0014 적용, 실제 PG, Oracle/UAT, S5.2 출고 후 정책·약관, 쿠폰 재발행·sellable 자동 증가는 승인 범위 밖이다.

## 1. 범위와 권장안

- S4.2는 **출고 전** 결제 완료 발송 주문의 수량 단위 일부/전량 취소, 관리자 최종 결정과 모의 환불 실행, 원거래 링크·상태 이력까지 맡는다. 고객은 자기 주문에 요청할 수 있고 관리자는 사유 있는 직권 사례를 만들 수 있다. 판매자는 환불을 최종 결정·집행하지 않는다.
- S5.1은 출고 사실·운송장, S5.2는 **출고 후** 사유별 클레임/증빙·변경 가능한 시험 정책·관리자 심사/환불 연결을 맡는다. S4.2가 없는 출고 사건을 추정하거나 임시 출고 테이블을 선점하지 않는다. 실제 PG 부분 환불, Oracle, UAT, 최종 약관/반송비 판단은 이 계약 밖이다.
- 권장: 원 주문/금액은 결제 당시 사실로 보존하고, 환불을 별도 사례·검증 사건으로 누적한다. 원 주문 상태만 `REFUNDED`로 덮어쓰는 안은 한 통합결제의 다른 발송 주문·부분 수량을 표현하지 못한다. S4에서 임시 배송 상태를 만드는 안은 S5와 중복 계약이 된다.
- 완료 경계: S4.1+S4.2를 현재 단일 branch의 S4 Stage PR 1개로 제출한다. 필수 local/WSL DB/API/실제 브라우저·review gate 통과 후 병합·merged-main smoke·정리한다. 그 뒤 최신 `origin/main`에서 S5 branch/worktree를 만든다. 브라우저 도구 오류를 자동 시험 PASS로 대체하지 않는다.

## 2. 환불 금액·상태 불변식

1. `checkout_orders`와 `shipment_orders`의 `PAID`, 원 상품/할인/배송비/배송지원/결제액, `shipment_order_lines`의 수량과 `goods_payable_won`은 **변경하지 않는다**. 고객·관리자 조회는 원결제와 누적 환불을 별도 표시한다. 통합 주문의 다른 발송 주문에 취소를 전파하지 않는다.
2. 환불 가능 수량은 원 품목 수량 Q에서 앞선 승인/처리 중/완료 사례의 점유 수량을 뺀 값 이하. 거절 사례는 점유하지 않는다. 같은 품목의 앞서 **승인되어 점유한** 누적 수량 r과 이번 q, 원 품목 실결제 상품금액 P에 대해 이번 환급액은 `floor(P×(r+q)/Q) - floor(P×r/Q)` 원이다. DB 거래 안에서 앞선 점유 수량을 잠그고 계산한다. 각 사례의 수량·액수는 승인 시 고정하고 이후 재계산하지 않는다. 결제 결과 미확인 사례는 점유를 유지하며 새 사례가 그 수량을 재사용하지 못한다. 동일 품목 전량의 합은 P다.
3. 출고 전 발송 주문의 **모든** 품목이 취소되는 마지막 사례에는 원래 고객이 실제 납부한 배송비 `shipping_fee_won - shipping_support_won`을 **최대 1회** 환급한다. 마지막 사례 승인 전 다른 점유 사례의 환불 완료를 확인해 배송비를 조기/중복 예약하지 않는다. 이전 일부 취소 때 남은 상품의 무료배송 기준을 재평가하거나 새 배송비를 청구하지 않는다. 배송비 지원액은 고객 납부액이 아니므로 고객에게 환급하지 않는다. 전체 환급 총액은 원 `payable_won` 이하다.
4. 프로모션/쿠폰의 원 사용·배분 스냅샷은 과거 근거로 유지한다. 환불 때문에 원 할인액을 새 가격으로 역산하지 않는다. 쿠폰 재발행·재사용·비용 부담/최종 판매자 지급액 자동 판정은 S4.2에서 하지 않는다. S6은 환불 발생일에 원주문·원상품 링크를 가진 별도 정산 자료로 읽는다.
5. 환불 완료는 모의 공급자의 검증된 결과 사건이 저장·적용됐을 때뿐이다. 화면 클릭이나 관리자 승인만으로 `REFUNDED`라고 표시하지 않는다. 결과 미확인·중복 ID의 다른 지문·원결제보다 큰 액수는 `REVIEW_REQUIRED`로 멈추고 자동 재집행하지 않는다. 0원 원결제는 실 PG 요청 없이 `no_charge` 검증 사건을 남긴다.
6. 재고는 결제 시 이미 `on_hand_quantity`와 `sellable_quantity`가 차감된다. 환불이 재고의 재판매 가능성을 뜻하지 않으므로 `sellable_quantity`를 자동 증가시키지 않는다. 관리자 결정은 품목마다 `restockMode: none | on_hand_only`를 명시하고 기본값은 `none`으로 둔다. `on_hand_only`는 관리자가 실제 보유를 확인한 경우에만 `on_hand_quantity`를 완료 수량만큼 한 번 복원하고, 판매중지·품절 해제나 판매 가능 수량 증가에는 기존 승인 절차를 별도로 거친다. 판매중지 상태나 보유 근거가 불명확하면 자동 복원을 금지하고 별도 재고 정정을 요구한다. 환불 완료 사건과 복원량을 연결해 중복 복원을 막는다.

## 3. 0014 영속 계약 — 현 branch 격리 구현 승인

기존 0000~0013 SQL/행/제약은 건드리지 않는 **전진 추가**가 우선이다. 정확한 이름·열·FK/인덱스·제약은 아래대로 검토하며, 승인된 SQL 해시가 나오기 전 공유 DB에 적용하지 않는다.

| 신규 관계 | 필수 열·제약 |
| --- | --- |
| `refund_cases` | UUID PK; 원 `checkout_order_id`, `shipment_order_id` FK 및 동일 통합 주문 복합 FK; 요청자 account/역할, 사유 코드·설명, 출고 전 근거(`ADMIN_CONFIRMED_NOT_DISPATCHED`만 우선 허용)와 확인 관리자/시각, 정책 코드/버전, UUID 요청 멱등키·64자 지문, 승인 시 확정하는 `goods_refund_won`/`shipping_refund_won`/`total_refund_won`(합계·비음수 check), `REQUESTED/APPROVED/REJECTED/PROCESSING/REFUNDED/REVIEW_REQUIRED` 상태, 요청/결정/완료 시각과 결정 관리자/사유. 요청자+원주문+멱등키 unique, 결정/완료 시각과 상태 check, 사유 길이 check. 출고 전 확인이 없으면 승인할 수 없다. |
| `refund_case_lines` | 사례 FK, 원 `shipment_order_id+option_id` 복합 FK, 정수 취소 수량>0, 승인 시 고정한 원 상품 실결제 환급 원화 정수>=0, 관리자 지정 `restock_mode` 및 완료 시 복원 수량(0~취소 수량), PK(사례, 옵션). 원 품목 수량 초과·여러 사례 간 누적 초과는 잠금 거래로 막는다. |
| `refund_attempts` | UUID PK, 사례 FK, 원 승인 `payment_attempt_id` FK(0원은 `no_charge`), 공급자 코드, 공급자 환불 ID/요청 금액, UUID 실행 멱등키, `PENDING/SUCCEEDED/FAILED/REVIEW_REQUIRED`, 생성/종료 시각. 사례+실행키·공급자+환불 ID unique. 한 사례의 불명확한 시도가 남은 동안 새 실행 금지. |
| `refund_events` | UUID PK, 시도 FK, 공급자+사건 ID unique, 정규화 검증된 원 결제 ID·환불 ID·원화 금액/결과·사건 지문, 수신/처리 시각, `PENDING_PROCESSING/APPLIED/REVIEW_REQUIRED`. 공급자 원문·카드·민감 개인정보 비저장. 동일 사건 ID 다른 지문은 성공으로 처리하지 않고 별도 충돌/검토 근거를 남긴다. |
| `refund_event_conflicts` | UUID PK, 원 `refund_event_id`·들어온 `refund_attempt_id` FK, 새 사건 지문, 충돌 사유(`FINGERPRINT_MISMATCH`/`ATTEMPT_MISMATCH`), 발견 시각. 원 사건을 덮어쓰거나 추가 환불을 하지 않는다. |
| `refund_case_events` | UUID PK, 사례 FK, 전/후 상태, 행위자 account/활성 역할, 사유·시각·원 환불 사건 ID(있는 경우). 생성/관리자 결정/집행·실패 각 단계의 별도 감사 행. 삭제·덮어쓰기 금지. |

기존 `order_status_events`는 PENDING_PAYMENT/EXPIRED/PAID만 허용한다. 이를 환불 사건 저장소로 재사용하거나 원 주문 PAID를 환불 상태로 덮지 않는다. 고객용 파생 표시(`partially_refunded`/`fully_refunded`)는 환불 사례·사건에서 계산한다.

## 4. 공개 API 7개 — 현 branch 격리 구현 승인

| 경로 | 계약 |
| --- | --- |
| `POST /customer/checkout/orders/:orderId/refund-cases` | 본인 PAID 주문, 동일 Origin·세션·UUID `Idempotency-Key`. 본문: `shipmentOrderId`, `lines:[{optionId,quantity}]`, `reasonCode: customer_request|quality_issue|wrong_delivery|damaged|other`, 1~500자 `reason`. 서버가 원결제 스냅샷·가능 수량·견적을 계산하되 출고 전으로 확정하지 않는다. 201 생성/200 같은 키 같은 본문 재조회, 다른 본문 409, 타인 주문 404, 판매자 403. 카드·계좌정보 없음. |
| `GET /customer/checkout/orders/:orderId/refund-cases` 및 `GET .../:caseId` | 본인 주문만 상태·수량·상품액/실배송비 환급·요청/결정/완료 시각·사유·원거래 식별자를 조회. 결정 전 금액은 확정액이 아닌 견적으로 표시한다. 관리자 내부 메모·증빙/개인정보 비노출. |
| `POST /refunds/admin/cases` | 관리자 직권 요청. 본문에 고객 요청 필드와 원 `checkoutOrderId`를 추가한다. 동일 Origin·세션·UUID `Idempotency-Key`; 생성과 결정은 별도 호출·이력이다. |
| `GET /refunds/admin/cases` 및 `GET .../:caseId` | 관리자 전체 사례 상태/기간/발송 주문 조회, 금액·검증 사건·감사 이력 확인. 판매자/고객 접근 거부. |
| `POST /refunds/admin/cases/:caseId/decision` | 관리자 세션·Origin·UUID 실행 멱등키. 본문은 `decision: approve|reject`, 1~500자 `reason`, 승인일 때 `preShipmentConfirmed: true`, `preShipmentEvidence: ADMIN_CONFIRMED_NOT_DISPATCHED`, `lines:[{optionId,restockMode:none|on_hand_only}]`. 승인 시 DB 잠금 아래 금액·원결제·출고 전 확인·실제 보유 근거를 재검증 후 고정한다. 거절은 실행액 0·상태 이력만 남긴다. 모의 공급자 사건이 확인되어야 완료되고 중복 승인은 추가 환불·재고 복원을 만들지 않는다. |

위 표는 고객 POST 1+GET 2, 관리자 POST 2+GET 2의 **총 7 endpoint**다. 서버는 `400 invalid_refund`, `401` 미인증, `403` 역할·Origin 거부, `404` 타인 주문/없는 ID 숨김, `409 refund_conflict`, `503 unavailable`을 구분한다. mock 환불 집행이 포함된 관리자 승인 쓰기 경로는 S4.1과 같은 development+loopback+비운영 가드를 사용하며 실제 공개 운영에 열지 않는다. 고객 요청과 관리자 직권 요청은 mock 공급자를 호출하지 않는다.

## 5. 처리 순서·보안

1. 고객 또는 관리자가 요청하면 서버가 주문 소유/역할·PAID·발송 주문 소속·수량을 검증하고 요청+감사 이력을 원자적으로 저장한다. 관리자는 결정을 **별도 요청·별도 이력**으로 수행한다.
2. 승인 거래에서는 통합 주문→발송 주문→해당 품목→선행 환불 사례/시도 순으로 일관되게 잠근다. 이미 확정/진행 중인 수량·배송비를 포함해 상한을 다시 검증하고 환불 시도 예약을 남긴 뒤 공급자 경계를 호출한다. 네트워크 호출을 DB 잠금 안에 두지 않는다.
3. 공급자 응답은 원 결제·주문·공급자 환불 ID·금액을 서버에서 대조해 사건을 먼저 보존한다. 별도 거래가 사건을 한 번만 적용하고 환불 사례를 완료하며, 선택된 `on_hand_only` 재고 복원을 같은 거래에서 한 번 수행한다. 실패하면 사건은 보존하고 재처리/관리자 검토한다. 같은 시도/사건 ID 재전달은 같은 결과를 돌려주고 새 환불·재고 복원을 만들지 않는다.
4. S4.2에는 아직 S5.1 출고 사건이 없다. 개발 중 기존 주문은 출고 전 시험 주문만 취급하되, 확인할 수 없는 외부/수동 발송 이력은 출고 전이라고 추측하지 않는다. S5.1 합류 시 출고 사실을 같은 잠금/정책 판단에 결합하여 출고 후에는 이 경로를 차단하고 S5.2로 넘긴다.

## 6. 검증·영향·복구 게이트

- RED: 타 고객/판매자 접근, 미결제/지연·이중 요청, 동일 키 다른 본문, 3개 중 1개·순차 전량의 원 단위 합, 할인/배송비 지원, 다른 발송 주문 불변, 배송비 1회, 부분 취소 후 새 배송비 0, 0원, 거절/지연/중복·다른 지문 사건, 병렬 승인·초과 환불, 관리자 사유/감사 누락, 재고 복원 기본 0·선택 복원 1회·판매중지 복원 거부. GREEN: 순수 계산→격리 DB 0000~0014 fresh/기존 migration 호환→HTTP 역할/상태/사건 시험→실제 브라우저 고객/관리자/390px/키보드→typecheck/lint/build/review→WSL exact SHA. 자동 HTTP 시험을 실제 브라우저 PASS로 부르지 않는다.
- 영향: 신규 6관계 및 고객·관리자 환불 API/화면, 조회 파생 상태, 승인된 경우의 보유 재고 복원, 정산 원사건 연결. 기존 원주문·프로모션·결제 승인 데이터와 S4.1 API는 유지. 테스트 계정·가상 주문만 사용하고 실제 결제·송금 금지. 실제 PG 부분 환불은 U0/U3 경계.
- 공유 DB 적용은 **별도 승인**이다. 승인 요청에 최종 SQL 해시, 기존 행수/마이그레이션 dry-run, 정확한 백업·복원 검증, 사후 API/DB/행수 대조, QA 잔류 정리를 포함한다. 실패 시 mock 환불 쓰기를 닫고 사건/원거래를 보존한다. 이미 발생한 금전 사건을 임의 삭제하거나 공유 DB를 역마이그레이션하지 않고 전진 보정·복구를 별도로 결정한다.
- 이 계약의 현 branch 격리 구현은 승인됐지만 공유 DB 적용은 별도 승인이다. 미해결·후속: S5.1 출고 사건과의 자동 결합, 실제 브라우저 도구 경로, 실제 PG/Oracle/UAT, 출고 후 법률·약관.
