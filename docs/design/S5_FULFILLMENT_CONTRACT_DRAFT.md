# S5.1 출고·배송정보 계약 — 격리 구현 승인본

상태: **2026-10-05 PMO 경유로 현 branch의 0015 추가식 3관계·인증 API 8개·고객 주문 상세 확장·최소 배송지 노출·주문/결제/환불 결합의 격리 구현과 시험 승인**. 승인 기준 checkpoint는 `codex/s5-fulfillment-engagement@c4860af`다. 공동출고 cutoff가 S3의 전역정책을 유지한다는 후속 문서 보정은 기존 금액·정책 계약을 보존하며 승인 범위를 넓히지 않는다. 공유 개발 DB 0015 적용, 실제 택배사/배송·알림, Oracle/UAT, S5.2·S6는 승인 범위 밖이다. 근거는 [DESIGN](DESIGN.md) R02·R06~R08·R11, [PRD](../PRD.md) 7.5~7.7·8.2, [WORK_PLAN](../WORK_PLAN.md) S5.1과 완료된 S4 결제·출고 전 환불 계약이다.

PMO 조건·보완 승인: WORK_PLAN의 “추적 링크”는 운송장 자동조회 deep link가 아니라 아래 서버 고정 allowlist의 **공식 일반 배송조회 입력 페이지**로 제공한다. 운송장·고객정보·호출자 URL은 링크에 넣거나 DB에 저장하지 않는다. “다음 출고 가능일”은 영업일·휴무 정책이 없으므로 실제 가능일로 주장하지 않고 “잠정 예상일/휴무일 미반영”으로 표시하며, 출고 가능일 정책은 S5.1 완료 전에 정확한 보류 사유·권장 후속안을 다시 보고한다.

## 1. 목적·범위·비범위

- 판매자는 **자기 판매자 소속이 담당하는 발송 주문만** 조회하고 포장·지연·출고를 처리한다. 농가 판매자와 어울몰 판매자는 같은 절차와 권한 검사를 사용한다.
- 실제 출고 입력에는 택배사 코드와 운송장 번호가 필요하며 저장 성공 즉시 고객 주문 상세에 표시한다. 관리자 승인 대기는 두지 않는다.
- 결제 승인 시 승인된 배송정책의 마감시간을 기준으로 예상 출고일을 계산한다. 판매자가 지연을 기록하면 사유·새 예상일·고객 안내를 함께 보존한다.
- 관리자는 오입력된 상태·예상일·택배사·운송장을 사유와 고객 안내를 남기고 정정할 수 있다. 정정 전후 이력은 삭제하거나 덮어쓰지 않는다.
- 포함: 판매자 상태별 목록/상세, 최소 배송지 정보, 포장·지연·출고, 고객 즉시 조회, 관리자 목록/상세/정정, 출고 전 환불 차단 연계, 전량 환불된 발송 주문의 출고 취소 연계.
- 제외: 실제 택배사 API·자동 배송조회/완료, 송장 출력, 집하 예약, 실배송, 주말·공휴일 달력, 실제 문자·메일·푸시, Oracle/UAT, 출고 후 클레임/환불 정책(S5.2), 정산(S6).

## 2. 현행 구조의 공백과 권장 결정

1. 직접발송 `shipment_orders.seller_id`는 담당 판매자를 가리키지만, 공동출고 `owool_fulfillment`는 설계상 `seller_id=NULL`이다. 판매자 이름이나 상품 생산자를 보고 공동출고 담당자를 추측하면 권한 오배정이 생긴다.
2. 권장: 관리자가 전역 설정에서 **공동출고 담당 판매자 1곳**을 명시한다. 주문 제출 시 직접발송은 기존 `seller_id`, 공동출고는 이 설정값을 `fulfillment_seller_id`로 스냅샷한다. 이후 설정 변경은 새 주문에만 적용하며 기존 주문 담당자는 바꾸지 않는다.
3. 공동출고 담당자가 미설정이면 공동출고 상품을 포함한 주문 제출을 `503 fulfillment_not_configured`로 원자적으로 거부한다. 직접발송만 있는 주문은 영향을 받지 않는다.
4. 판매자 표시명은 바뀔 수 있으므로 권한 판단에 사용하지 않는다. 계정의 활성 판매자 역할과 고정된 `fulfillment_seller_id`가 같을 때만 허용한다.
5. 마이그레이션 시 기존 영업 주문을 추측해 소급 배정하지 않는다. 공유 DB 적용 전 실제 발송 주문 수를 다시 확인하고 0이 아니면 별도 backfill 계약·승인 없이는 적용을 중단한다.

## 3. 출고 상태와 불변식

출고 상태는 결제/주문 상태와 분리한다. 원 `checkout_orders`·`shipment_orders`의 `PAID`와 금액 스냅샷을 바꾸지 않는다.

| 상태 | 의미 | 허용 주체·다음 상태 |
| --- | --- | --- |
| `PAYMENT_PENDING` | 주문은 생성됐으나 검증된 결제 승인이 아직 없음 | 결제 processor만 `READY`; 주문 만료 시 관련 행을 함께 제거하지 않고 주문 상태로 비활성 조회 |
| `READY` | 결제 완료, 포장 시작 전 | 담당 판매자 `PACKING` 또는 `DELAYED`; 전량 출고 전 환불 완료 시 서버가 `CANCELLED` |
| `PACKING` | 포장·출고 준비 중 | 담당 판매자 `SHIPPED` 또는 `DELAYED`; 전량 출고 전 환불 완료 시 서버가 `CANCELLED` |
| `DELAYED` | 예상 출고일을 넘기거나 사전 지연 등록 | 담당 판매자 `PACKING`; 전량 출고 전 환불 완료 시 서버가 `CANCELLED` |
| `SHIPPED` | 판매자가 실제 출고와 운송장을 입력 | 판매자에게 종결; 관리자만 사유 있는 정정 |
| `CANCELLED` | 출고 전에 해당 발송 주문 전 수량의 환불이 검증 완료됨 | 서버 종결; 판매자 출고 금지, 관리자도 출고 상태로 정정 금지 |

- 판매자는 `READY → PACKING`, `READY|PACKING → DELAYED`, `DELAYED → PACKING`, `PACKING → SHIPPED`만 요청한다. `READY → SHIPPED` 직행, 역행, `SHIPPED|CANCELLED` 변경은 거부한다.
- `SHIPPED`에는 허용 택배사 코드와 1~50자의 정규화된 운송장 번호가 필수다. 카드·주소·전화 등 개인정보를 사건 snapshot에 중복 저장하지 않는다.
- 관리자는 `READY|PACKING|DELAYED|SHIPPED` 사이의 오입력 정정과 예상일·택배사·운송장 정정을 할 수 있다. 1~500자 내부 정정 사유와 1~500자 고객 안내가 모두 필수며, 전후 snapshot을 사건으로 남긴다. `CANCELLED`는 정정 대상이 아니다.
- 판매자 전이와 관리자 정정은 발송 주문→출고 행→환불 사례 순으로 잠근 뒤 `APPROVED|PROCESSING|REVIEW_REQUIRED` 환불 사례가 하나라도 있으면 `SHIPPED` 저장을 409로 거부한다. 반대로 검증된 환불 사건이 이미 `SHIPPED`를 관찰하면 rollback해 `PROCESSING/PENDING_PROCESSING`으로 남기지 않고 사례·시도·사건을 같은 거래에서 `REVIEW_REQUIRED`로 확정해 S5.2 출고 후 클레임으로 연결한다. 관리자가 오출고 입력을 사유와 고객 안내로 정정해 현재 상태가 출고 전으로 돌아간 뒤에만 S4 경로를 다시 검토할 수 있다.
- 부분 환불은 상태를 취소로 바꾸지 않는다. 판매자 상세에는 원수량·완료 환불수량·남은 출고수량을 분리해 보여 주며, 판매자는 남은 수량만 출고한다.

## 4. 마감시간·예상 출고일

1. 주문 제출 시 S3 견적에 실제 적용된 배송정책의 `cutoffTime`을 출고 행에 스냅샷한다. 직접발송은 해당 판매자의 승인된 유효 정책, 공동출고는 기존 계약대로 전역 배송정책을 사용한다. 공동출고 담당 판매자 설정은 처리 권한을 정할 뿐 배송비·마감 정책을 암묵적으로 바꾸지 않는다.
2. 검증된 결제 승인 시각을 `Asia/Seoul`로 변환한다. 마감시간이 없거나 현지 시각이 마감시간보다 이르면 현지 결제일, 마감시간과 같거나 늦으면 다음 **달력 날짜**를 최초 예상 출고일로 기록한다.
3. 현재 시스템에는 영업일·주말·공휴일 달력이 없으므로 이를 “다음 영업일”로 표현하지 않는다. 화면에는 “예상 출고일(휴무일 미반영)”이라고 표시한다. 판매자는 실제 휴무일이면 `DELAYED`와 새 날짜를 기록한다.
4. 지연 새 예상일은 기존 예상일보다 뒤이고 현재 서울 날짜보다 빠르지 않아야 한다. 사유와 고객 안내가 필수다. 과거 지연 기록은 새 포장 시작 뒤에도 사건 이력에 남는다.
5. 서버 시간이 유일한 기준이다. 브라우저가 보낸 시각·날짜로 마감 판정을 하지 않는다.

## 5. 0015 추가 schema 제안

기존 0000~0014와 원주문/결제/환불 행을 변경하지 않는 전진 추가가 우선이다. 승인 전에는 SQL을 작성하거나 공유 DB에 적용하지 않는다.

| 신규 관계 | 필수 열·제약 |
| --- | --- |
| `fulfillment_settings` | singleton `id=1`; nullable `owool_seller_id` FK; 설정 관리자, 낙관적 잠금 `version>=0`, 변경 시각. 빈 초기 행만 생성하며 판매자 자동 선택 금지. 설정 변경은 기존 `audit_events`에 별도 기록한다. |
| `shipment_fulfillments` | `shipment_order_id` PK/FK; 고정 `fulfillment_seller_id` FK; `PAYMENT_PENDING/READY/PACKING/DELAYED/SHIPPED/CANCELLED`; 마감시간 snapshot·고정 timezone `Asia/Seoul`; 예상 출고일; 택배사 코드·기타 택배사명·운송장; 포장/최초 출고/현재 출고/취소 시각; 낙관적 잠금 `version>=0`; 생성/변경 시각. 상태별 필수값·금지값 check. |
| `shipment_fulfillment_events` | UUID PK; 발송 주문 FK; 행위 `PAYMENT_CONFIRMED/START_PACKING/REPORT_DELAY/RESUME_PACKING/MARK_SHIPPED/ADMIN_CORRECT/REFUND_CANCELLED`; 전/후 상태; actor account·활성 역할·seller(서버 사건은 nullable); 사유·고객 안내; 개인정보 없는 before/after JSON snapshot; non-null 멱등 범위·UUID 멱등키·64자 요청 지문; 시각. `shipment_order_id+idempotency_scope+idempotency_key` unique, 같은 키 다른 지문 거부. 사용자 요청의 범위는 account ID, 서버 사건의 범위는 `system:payment` 또는 `system:refund`이며 원 결제/환불 사건 UUID를 키로 쓴다. |

- 출고 행은 주문 snapshot 생성 거래에서 함께 만든다. 주문 거래는 `REPEATABLE READ`의 한 일관 snapshot에서 공동출고 담당자와 직접/공동출고 마감시간을 확정한다. account의 `FOR NO KEY UPDATE`와 sellers·account_roles/accounts의 active-owner 유효성 `FOR SHARE`는 유지하되, 변경 가능한 source인 `fulfillment_settings`·`shipping_policy_global`·`seller_shipping_policies`에는 `FOR SHARE`를 사용하지 않는다. 주문/출고 행의 원자성은 유지하며 둘 중 하나만 저장되는 상태를 허용하지 않는다.
- 결제 processor는 결제 검증·주문 `PAID` 처리와 같은 거래에서 출고를 `READY`로 바꾸고 최초 예상 출고일과 사건을 기록한다. 중복 결제 사건은 출고 사건을 추가 생성하지 않는다.
- S4 환불 processor는 출고 행과 같은 발송의 환불 사례를 고정 순서로 잠근다. 현재 `SHIPPED`이면 사례·시도·사건을 원자적으로 `REVIEW_REQUIRED`로 확정하고 같은 사건 재호출에도 그 상태를 반환한다. 검증 완료 환불수량이 발송 주문 전 수량과 같아지면 같은 거래에서 `CANCELLED`와 사건을 한 번 기록한다.
- 사건의 before/after에는 상태, 예상일, 택배사 코드, 운송장 번호만 포함한다. 고객 이름·전화·주소, 내부 인증정보, 공급자 원문은 저장하지 않는다.

## 6. 인증 API 8개와 기존 고객 API 확장

모든 쓰기는 현재 세션·활성 역할·동일 Origin을 검사하고 UUID `Idempotency-Key`와 `expectedVersion`을 요구한다. 목록은 기본 20/최대 50의 서버 불투명 keyset cursor를 사용한다.

| 경로 | 계약 |
| --- | --- |
| `GET /fulfillment/admin/settings` | 관리자만 공동출고 담당 판매자 ID·표시명·변경시각 조회. |
| `PUT /fulfillment/admin/settings` | 관리자만 `{owoolSellerId, expectedVersion, reason}` 설정. 실제 존재하고 판매자 역할 계정을 가진 판매자인지 검증, 1~500자 변경 사유 필수. 기존 주문 담당자 불변. 이 설정 쓰기는 PUT 하나뿐이며 PATCH route는 노출하지 않는다. |
| `GET /fulfillment/seller/shipments?status=&cursor=&limit=` | 활성 판매자와 `fulfillment_seller_id`가 같은 결제완료 발송 주문만. 상태 필터 필수값은 `READY|PACKING|DELAYED|SHIPPED|CANCELLED`; 최신 결제시각·ID 내림차순. 목록의 고객 이름/전화는 마스킹한다. |
| `GET /fulfillment/seller/shipments/:shipmentOrderId` | 담당 판매자만 품목별 원수량·환불완료수량·남은수량, 금액 snapshot, 예상일/상태/출고정보와 **출고에 필요한 기존 주문 배송지**를 조회. 주소·수령인·전화는 새 테이블에 복제하지 않으며 PAID 이후 담당자에게만 반환한다. 타 판매자는 존재 여부를 숨겨 404. |
| `POST /fulfillment/seller/shipments/:shipmentOrderId/transitions` | `{targetStatus, expectedVersion, reason?, customerMessage?, expectedShipDate?, carrierCode?, carrierName?, trackingNumber?}`. 상태별 필수값 검사, 담당자·현재 상태·잔여수량 재검증. 같은 키/본문은 같은 응답, 다른 본문 409. |
| `GET /fulfillment/admin/shipments?status=&sellerId=&from=&to=&cursor=&limit=` | 관리자 전체 상태/담당 판매자/결제일 필터 목록. 기본 개인정보 마스킹. |
| `GET /fulfillment/admin/shipments/:shipmentOrderId` | 관리자 상세, 전후 사건 이력과 기존 배송지. 환불/결제 민감 공급자 원문은 제외. |
| `POST /fulfillment/admin/shipments/:shipmentOrderId/corrections` | `{expectedVersion, corrected:{status?,expectedShipDate?,carrierCode?,carrierName?,trackingNumber?}, reason, customerMessage}`. 허용 필드만 전체 치환 검증 후 원자 적용; before/after·사유·고객 안내 사건 필수. `CANCELLED` 변경 금지. |

기존 `GET /customer/checkout/orders/:orderId`의 각 발송 주문에 다음을 추가한다. 새 고객 endpoint는 만들지 않는다.

```text
fulfillment: {
  status, expectedShipDate, delayedReason?, customerMessage?,
  carrier: { code, displayName } | null,
  trackingNumber: string | null,
  packedAt, shippedAt, updatedAt,
  events: [{ action, status, expectedShipDate, customerMessage, occurredAt }]
}
```

- 고객은 자기 주문만 조회한다. 관리자 내부 사유, actor ID, 판매자 내부 메모, 다른 고객/주문 정보는 제외한다.
- 서버는 택배사 코드·표시명과 아래 공식 일반 조회 페이지를 고정 allowlist로 관리한다. 호출자가 URL을 입력하거나 DB에 URL을 저장할 수 없다. 링크에는 운송장·고객정보를 삽입하지 않으며 고객 화면은 택배사명·운송장 번호와 “공식 배송조회 페이지 열기(운송장 직접 입력)”를 분리해 표시한다. `other`는 링크가 없다.
- 공통 오류: `400 invalid_fulfillment`, `401` 미인증, `403` 역할/Origin, `404` 타 판매자·타 고객 자료 숨김, `409 fulfillment_conflict`, `503 fulfillment_not_configured|unavailable`.

## 7. 택배사·운송장 입력 규칙

- 개발 허용 코드는 `cj_logistics`, `korea_post`, `hanjin`, `lotte`, `other`다. 표시는 각각 CJ대한통운, 우체국택배, 한진택배, 롯데택배, 기타로 한다. 동일 사업자 중복 표기는 두지 않는다.
- 공식 일반 조회 페이지 allowlist는 다음과 같다. `cj_logistics`=`https://www.cjlogistics.com/ko/tool/parcel/tracking`, `korea_post`=`https://www.koreapost.go.kr/kpost/subIndex/138.do`, `hanjin`=`https://hanjin.com/kor/CMS/DeliveryMgr/WaybillSch.do?mCode=MN038`, `lotte`=`https://lotteglogis.com/home/reservation/tracking/index`, `other`=null.
- `other`는 1~50자의 택배사 표시명을 별도 입력해야 한다. 자동 추적 링크는 만들지 않는다.
- 운송장 번호는 앞뒤 공백·일반 하이픈을 제거한 뒤 영문 대소문자와 숫자 1~50자만 허용한다. 원문을 HTML로 렌더링하지 않는다.
- 형식 검증은 오타 가능성을 줄이는 수준이며 실제 택배사 발급 여부를 증명하지 않는다. 실 API 검증·자동 상태 동기화는 후속 승인 범위다.

## 8. 동시성·권한·개인정보

1. 쓰기 거래는 발송 주문→출고 행→환불 사례 순의 고정 잠금 순서를 사용한다. `SHIPPED` 쓰기 전에 같은 발송의 `APPROVED|PROCESSING|REVIEW_REQUIRED` 사례를 잠가 존재하면 409로 거부한다. `expectedVersion`이 다르면 409로 재조회시키고 자동 덮어쓰지 않는다.
2. 사용자 요청의 멱등 범위는 actor account ID, 결제·환불 서버 사건은 각각 `system:payment`·`system:refund`로 고정한다. 같은 발송 주문·범위·키의 같은 지문은 기존 결과, 다른 지문은 409다. 재시도는 사건·고객 안내를 중복 생성하지 않는다.
3. 판매자 목록·상세 쿼리는 요청받은 ID를 먼저 조회한 뒤 애플리케이션에서만 비교하지 않고 SQL 자체에 `fulfillment_seller_id=actor.sellerId`를 포함한다. 관리자와 어울몰 판매자가 실제 같은 사람이어도 활성 역할이 다르면 권한을 공유하지 않는다.
4. 판매자에게 노출되는 고객 정보는 이미 결제된 담당 주문의 출고에 필요한 수령인·전화·우편번호·주소로 제한한다. 검색·내보내기·새 저장은 이번 범위에 넣지 않는다. 로그·사건·감사 `details`에는 개인정보를 남기지 않는다.
5. 관리자의 공동출고 담당 변경, 판매자 전이, 관리자 정정, 환불 자동 취소를 공통 감사 이력과 출고 사건에 기록한다. 판매자는 관리자 내부 사유를 보지 않고 고객 안내만 본다.

## 9. 화면 계약

- 판매자: 상태 탭/필터, 담당 발송 주문 목록, 주문 상세의 상품·남은 수량·배송지, 포장 시작, 지연 등록, 출고 등록. 수량은 직접 입력하는 상품/재고 화면 규칙과 혼동하지 않고 출고할 남은 수량은 서버 계산값으로 표시한다.
- 고객: 주문 상세의 발송 묶음별 상태, 예상 출고일, 지연 안내, 택배사·운송장, 정정 안내. 출고 저장 후 새로고침 없이 재조회 결과에 즉시 나타나야 한다.
- 관리자: 담당 판매자/상태/기간 필터, 전체와 판매자별 상세, 정정 폼, before/after·고객 안내 이력. 실제 출고정보 정정은 프로모션·정산 승인과 분리한다.
- 공통: Flat v2 토큰과 기존 역할별 DOM/테마를 유지하고 로딩·빈 목록·오류·권한 없음·저장 중·충돌 재조회 상태를 제공한다.

## 10. RED→GREEN·통합 검증

필수 RED:

1. 판매자 A가 판매자 B 직접발송 또는 공동출고 담당 주문을 ID로 조회/변경하면 404이고 DB 변화가 없다.
2. 공동출고 담당 미설정 주문 제출은 전체 rollback되며 부분 주문/예약 소비가 남지 않는다.
3. 마감 직전은 결제일, 마감과 같은 시각·직후는 다음 달력 날짜이며 서버 timezone/DST 비의존(Asia/Seoul)이다.
4. `PACKING → SHIPPED` 저장 직후 고객 상세에 택배사·운송장이 보이고 관리자 승인 행이 필요하지 않다.
5. 같은 멱등키 재시도는 사건 1개, 다른 본문은 409, 낡은 version은 409다.
6. 관리자 정정은 reason/customerMessage 누락 시 실패하고 성공 시 before/after·감사·고객 안내가 모두 남는다.
7. 환불이 잠금을 먼저 얻으면 전량 환불은 `REFUNDED/APPLIED`와 출고 `CANCELLED`로 끝나고, 배송이 먼저 `SHIPPED`를 확정하면 환불 사례·시도·사건은 모두 `REVIEW_REQUIRED`로 안정 수렴한다. 어느 경우에도 `PROCESSING/PENDING_PROCESSING`을 성공 상태로 인정하지 않는다. 부분 환불 후에는 남은 수량만 표시된다.
8. 고객/판매자 API·로그·사건에 허용 범위 밖 개인정보·공급자 원문이 노출되지 않는다.
9. 택배사별 공식 링크는 고정 allowlist와 일치하고 `other`는 null이며, 운송장·호출자 URL을 포함하거나 임의 URL로 바꿀 수 없다.

GREEN·통합 순서:

- 순수 상태 전이/마감일/운송장 정규화 시험 → private tmpfs PostgreSQL의 fresh 0000~0015·기존 migration 호환/권한/경합 시험 → API 역할/멱등/환불 결합 → 고객/판매자/관리자 실제 브라우저 1920·1440·430, 키보드 → typecheck/lint/build → 독립 리뷰 C0/I0 → WSL exact SHA.
- fixture는 식별 가능한 가상 고객·판매자 A/B·어울몰 판매자·가상 운송장만 사용한다. 실제 배송·문자·메일·푸시·PG·운영 고객정보는 사용하지 않는다.
- 공유 `local-postgres/shoppingmall`의 0015 적용과 QA 자료 생성은 SQL 해시·사전 행수·백업/복원·사후 검증·정리 계획을 보고하고 **별도 승인**받는다.

## 11. 영향·복구·승인 요청

- 영향: 신규 3관계, 인증 API 8개, 기존 고객 주문 상세 응답 확장, 주문 생성·결제 processor·S4 환불 processor의 거래 결합, 판매자/관리자/고객 화면. 원 주문 금액·결제/환불 사건과 직접/공동출고에 적용되는 기존 배송정책 선택 규칙은 변경하지 않는다.
- 복구: 문제가 나면 새 쓰기 경로와 화면을 닫고 이전 코드로 배포하되 0015 관계와 사건은 삭제하지 않는다. 이미 고객에게 보인 출고/정정 이력을 역마이그레이션하지 않고 전진 보정한다. 공유 DB/운영 데이터의 destructive down migration은 하지 않는다.
- PMO 승인 요청 범위: 위 0015 추가식 3관계, API 8개와 고객 응답 확장, 공동출고 담당 판매자 설정, 담당 판매자에 대한 최소 배송지 노출, 주문/결제/환불 거래 결합, 격리 구현·시험.
- 이번 요청에 포함되지 않음: 특정 운송장 자동조회/deep link, 택배사 API·실배송, 공유 개발 DB 0015 적용, 실 알림 credential·비용, Oracle/UAT, S5.2 출고 후 약관·증빙, S6 정산.
- 권장안: 위 계약으로 S5.1 격리 구현을 승인한다. 이유는 이름 추측 없이 어울몰 판매자를 일반 판매자와 같은 권한 모델로 처리하고, 출고 사실·환불·고객 안내를 한 발송 주문 이력으로 직렬화할 수 있기 때문이다.
