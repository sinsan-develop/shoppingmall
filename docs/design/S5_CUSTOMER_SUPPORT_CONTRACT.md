# S5.2 고객지원 계약 — 구현 기준 초안

기준: `main@59c3e86`의 DESIGN R07/R10/R11/R12, PRD 7.3/7.5/7.6/8.2, WORK_PLAN S5.2와 신산님의 2026-10-07 권장 A안·후속 세부 지시. 이 문서는 시험 정책과 개발 구현의 계약이다. 실제 약관·반송비·운영 Object Storage·실 PG 계약을 확정하지 않는다.

## 소유권과 상태

1. `shipment_orders.seller_id`는 `owool_fulfillment`에서 NULL이다. 구매확정·리뷰·클레임의 품목 식별자는 `(shipment_order_id, option_id)`이고 판매자 scope는 `shipment_order_lines.seller_id` snapshot이다. 배송 담당 `shipment_fulfillments.fulfillment_seller_id`를 고객지원 담당 판매자로 대체하지 않는다.
2. 문의는 로그인 고객이 공개 상품 `products.id`만으로 접수한다. 구매·출고 이력은 요구하지 않는다. 접수 당시 `products.seller_id`를 담당 판매자 snapshot으로 저장한다. 고객 본인과 담당 판매자, 관리자만 원문 및 이력을 조회한다. 판매자 답변은 관리자 공개 승인 후 정제 텍스트만 공개 상품 Q&A에 표시하고 고객 신원·비공개 metadata는 제외한다.
3. 구매확정은 고객 본인이 해당 `checkout_orders.account_id`이며 결제·발송 주문이 PAID, `shipment_fulfillments.status='SHIPPED'`일 때 수동 POST한다. 배송 완료를 자동 추정하지 않는다. `(shipment_order_id, option_id)`당 하나의 불변 사건으로, 배송 상태가 뒤에 정정돼도 사건을 지우지 않고 감사 이력을 유지한다. 같은 멱등키·본문 재시도는 같은 사건을 반환한다.
4. 리뷰는 위 구매확정 사건당 고객 본인 1개, 1~5점·텍스트·이미지를 지원한다. 작성 `Idempotency-Key`는 고객 범위로 최초 `CREATED` 비공개 사건에 저장한다. 동일 키·구매확정·최초 본문/평점 재시도만 같은 리뷰 ID를 반환하며, 키의 다른 구매확정 재사용이나 기존 구매확정의 다른 키/내용은 409다. 수정 키는 리뷰·고객 범위의 `EDITED` 사건에 저장하며 동일 키·내용 재시도는 버전/사건을 늘리지 않고, 동일 키·다른 내용은 409다. 두 키 모두 고객 조회 JSON에 포함하지 않는다. 제출 상태는 비공개 `PENDING`. 본인 수정은 내용/이미지 버전과 변경 시각을 이력으로 남기고 다시 공개 승인을 요구한다. 로그인 고객은 리뷰를 신고할 수 있으며 관리자에게 사유/시각/행위자를 기록한다. 타 고객의 신고 사유는 리뷰 작성자 상세에 보내지 않는다. 관리자는 리뷰를 공개 승인하거나 사유와 이력을 남겨 `HIDDEN`으로 숨긴다. 숨긴 리뷰와 이미지는 공개 조회에서 즉시 제외한다. 이미지 없는 텍스트 리뷰는 독립 승인 가능하다. 이미지가 있으면 관리자 승인 거래에서 재인코딩 파일을 다시 읽어 `scanImageWithClamd` PASS를 받고 파일 해시가 검사 전후 같음을 확인한다. PASS 표지만 신뢰하지 않는다. 검사한 이미지 ID별 해시를 비공개 승인 사건에 보존하고 공개 이미지 GET도 현재 파일의 해시를 대조한다. scanner 불가·실패·파일 부재·변조는 공개를 거부한다. 공개 조회는 현재 공개 상품 상세와 같은 publication+approved revision 경계, 승인 리뷰·검사 PASS 이미지 ID만 반환하며 기본20/최대50 커서 페이지를 사용한다. 저장 object key를 응답·로그에 넣지 않는다. 로컬 quarantine은 개발 전용이고 운영 Object Storage 완료를 의미하지 않는다.
5. 클레임 종류는 `CLAIM`, `RETURN`, `EXCHANGE`; 사유는 `quality_issue`, `damaged`, `wrong_delivery`, `change_of_mind`, `other`로 분리한다. 고객 본인의 결제 완료·SHIPPED `(shipment_order_id, option_id)`와 요청 수량을 필수로 묶는다. 판매자 답변은 그 품목 seller snapshot에 대해서만 가능하다. 관리자가 사유 있는 최종 승인/거절을 기록한다. 교환 승인 후 대체 발송 자동생성은 없다.
6. 클레임 증빙은 리뷰 이미지와 별도 비공개 metadata 및 다운로드 경로에 둔다. 고객 본인·해당 품목 담당 판매자·관리자에게만 원본을 읽혀 주고, 공개 상품/리뷰 경로에서는 절대 제공하지 않는다. 개발 전용 `ImageQuarantine` 파일도 비공개로 유지한다. 저장 key와 내부 경로는 어느 JSON에도 포함하지 않는다.

## 데이터와 환불 연결

- 새 0016 migration은 기존 테이블·자료에 additive로 적용한다. 문의 답변은 `support_question_messages` 여러 행과 작성/공개/숨김 `support_question_message_events`의 append-only 이력으로 저장한다. 수정은 원문 UPDATE가 아니라 새 message와 공개 사건이다. 클레임 판매자·고객·관리자 답변도 `support_claim_messages` 여러 행에 본문·역할·시각을 보존하고 상태 전이는 별도 `support_claim_events`에 기록한다. 구매확정, 리뷰·이미지, 증빙, 정책 버전 관계와 각 소유자·주문·상품 FK, 상태·평점·수량·금액 CHECK, 멱등 UNIQUE를 둔다. 0014/0015는 수정하지 않는다.
- append-only는 S5.2 업무 API의 쓰기 계약이다. API는 기록 UPDATE/DELETE를 노출하지 않는다. 무조건 DB DELETE 차단 trigger는 signed QA fixture의 소유 범위 정리까지 막으므로 사용하지 않는다. 공유 DB QA는 별도 서명 manifest·외부참조 검사·대상 범위 확인을 통과한 reset 경로 없이는 수행하거나 완료로 주장하지 않는다.
- `refund_cases.post_shipment_claim_id`는 nullable UNIQUE composite FK로 `(claim ID,checkout order ID,shipment order ID,requester account ID)`가 동일 claim의 `(ID,checkout order ID,shipment order ID,customer account ID)`를 참조한다. NULL인 기존 PRE 사건은 기존 제약/금액/재입고/fulfillment 취소 로직을 그대로 탄다. POST 사건은 claim 하나에 refund case 최대 하나다. `refund_cases_state_ck`는 POST branch의 pre-shipment 확인 열 NULL을 허용하되 기존 PRE branch를 강화하거나 완화하지 않는다.
- 초기 정책은 `code=POST_SHIPMENT_TRIAL`, `version=1`이며 버전·효력 시작 시각·관리자 변경 이력을 보존한다. 관리자 결정에는 적용 버전과 상품 환불액 snapshot을 기록한다. POST 승인 수량의 누적 환불액은 해당 `shipment_order_lines.goods_payable_won`의 잔여액 이내이며, 배송비 환급은 0, `refund_case_lines.restock_mode='none'` 및 재입고 수량 0이다. 원 결제·환불 attempt/event와 1:1 연결하고 idempotency와 잠금으로 중복/경합을 차단한다.
- POST 환불의 verified event는 동일 S4 결제/환불 검증 경계를 거치되 SHIPPED 자체를 거부하지 않는다. 성공해도 출고 상태·운송장, checkout/shipment 원 총액, 다른 발송 묶음, 기존 S4 후속 사건을 변경하지 않는다. PRE 사건의 SHIPPED 거부·배송비·재입고·CANCELLED 전이는 별도 회귀로 보존한다. 실제 Provider 환불은 시험하지 않는다.

## HTTP 계약 목표

모든 변경 요청은 기존 session cookie, 역할 검사, `Origin` 검사를 사용한다. 중요한 재시도는 `Idempotency-Key` UUID를 필수로 한다. 타 고객/판매자 식별자는 `404`로 감춘다. 형식 오류는 `400`, 상태 충돌은 `409`, DB/이미지 검사 불가에는 `503`을 사용한다.

| 역할 | 경로·행위 | 핵심 입력/출력 |
|---|---|---|
| 고객 | `POST /customer/support/confirmations` | orderId, shipmentOrderId, optionId, 멱등키 → 사건 ID·시각 |
| 고객 | `POST /customer/support/reviews`, `PUT/GET /customer/support/reviews/:id`, `POST /customer/support/reviews/:id/reports` | confirmationId, rating, text·이미지; 본인 수정은 이력+재승인 대기, 로그인 고객 신고 |
| 공개 | `GET /catalog/products/:productId/customer-reviews`, `GET .../customer-reviews/:reviewId/images/:imageId`; `GET /catalog/products/:productId/questions` | 승인 리뷰·검사 PASS 이미지 참조만; 이미지 바이트는 승인 사건 해시와 현재 파일 해시 일치 시에만 반환; 문의는 질문 본문+관리자가 마지막으로 선택·공개 승인한 답변 한 건만, account ID·비공개 metadata 제외 |
| 고객 | `POST /customer/support/questions` | productId, text → 비공개 문의·담당 seller snapshot |
| 고객 | `POST /customer/support/claims` | orderId, shipmentOrderId, optionId, kind, reasonCode, reason, quantity → claim ID |
| 고객 | `GET /customer/support/questions`, `GET /customer/support/claims/:id` | 문의 목록은 본인 건만 기본 20/최대 50, `created_at,id` 내림차순 `limit/cursor`와 `items/nextCursor`; 저장 key 제외 |
| 판매자 | `GET /seller/support/questions`, `GET /seller/support/claims`; `POST .../:id/replies` | 문의 목록은 담당 seller snapshot과 활성 grant 범위의 동일 페이지 계약, 답변 멱등키 재시도는 동일 message |
| 관리자 | `GET /admin/support/questions?status=ANSWERED`, `GET /admin/support/questions/:id`; `POST /admin/support/reviews/:id/approve`, `POST /admin/support/reviews/:id/hide`; `POST /admin/support/questions/:id/publish`; `POST /admin/support/claims/:id/decision` | 문의 승인 대기 목록은 동일 페이지 계약과 `status=ANSWERED` 필터, 상세는 질문·판매자 메시지 ID/사건 이력으로 승인 대상 확인; 공개 실행은 관리자만. 검사 PASS 공개, 사유 있는 숨김/신고 이력, 최종 사유·정책 버전·환불 실행 |
| 권한별 | `POST/GET .../:id/images` 또는 `.../:id/evidence` | raw 이미지 5MiB 이하, MIME·재인코딩 검사, key 비노출 |

정확한 이미지 경로와 응답 DTO는 기존 catalog image controller와의 충돌을 확인해 API RED 시험에서 고정한다. 이 표는 구현 중 결정할 세부 경로의 출발점이며, 변경은 `WORK_STATUS.md`에 근거를 남긴다.

## 검증 경계

- RED→GREEN: 구매 전 문의와 판매자 답변의 관리자 공개 승인, 본인/타인·SHIPPED/READY 경계, 공동출고 상품 판매자 scope, 리뷰 수정 이력/재승인·로그인 신고·관리자 사유 숨김과 공개 즉시 제외·scan 실패 비공개, 클레임 증빙 IDOR/key 누출, 상태·정책 버전·멱등/동시 요청, POST 금액 상한/배송비0/재입고0과 PRE 회귀.
- 로컬 unit·API·typecheck·lint·build, 격리 PostgreSQL fresh 및 0015→0016 upgrade·기존 자료 불변, 실제 고객/판매자/관리자 웹 경로와 3 viewport·키보드를 구분해서 기록한다. DB skip/fixture PASS는 실제 DB/브라우저/Provider PASS가 아니다.
- 공유 WSL `local-postgres/shoppingmall` 신규 migration, Oracle, 실 Provider는 이 Stage writer 검증 대상이 아니다. 신규 시험자원은 생성 전에 이름·이유·수명·정리 방법을 `WORK_STATUS.md`에 기록한다.
