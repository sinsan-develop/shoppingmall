## 목적

S5.1 출고 이행 기능과 최종 Stage review finding 보정을 통합한다. 결제 완료 주문의 판매자·공동출고 담당 처리, 고객 즉시 조회, 관리자 정정·이력과 환불–SHIPPED 경합을 안정 상태로 수렴시키며, 관리자 설정 공개 계약을 PUT 하나로 맞추고 판매자·관리자 화면의 늦은 응답이 최신 상태를 덮어쓰지 못하게 한다.

## 변경 요약

- 판매자 전이와 관리자 정정은 기존 발송 주문→출고 행 잠금 뒤 같은 발송의 `APPROVED|PROCESSING|REVIEW_REQUIRED` 환불 사례를 잠근다. 해당 사례가 있으면 SHIPPED 저장을 conflict로 거부한다.
- 검증된 환불 processor가 이미 SHIPPED인 출고를 관찰하면 rollback하지 않고 사례·시도·사건을 같은 거래에서 `REVIEW_REQUIRED`로 확정한다. 같은 사건 재호출은 확정 상태를 안정적으로 반환한다.
- 관리자 공동출고 설정의 계약 밖 `PATCH /fulfillment/admin/settings`를 제거하고 승인된 PUT만 유지했다.
- 판매자·관리자 출고 화면의 목록·상세 요청을 독립 최신 token으로 구분하고, mutation 시작 시 오래된 읽기를 무효화한다. busy는 전체 진행 요청 수로 계산해 늦은 `finally`가 먼저 해제하지 못한다.
- 실제 Chrome 조작 전에 React hydration을 확인해 정적 HTML 단계의 조기 입력을 막고, 역할별 시나리오·3 viewport·키보드 검증이 실제 이벤트 처리 뒤 수행되게 했다.
- S5.1 시험 안내·공유 DB 적용 이력·작업계획·S4/S5 계약을 실제 완료 이력과 남은 S5.2~S5.4 범위에 맞췄다. schema·migration·dependency·새 공개 API는 추가하지 않았다.

## 영향

- 영향 경로는 출고/환불 거래 서비스와 저장소, 관리자 설정 controller, 판매자·관리자 출고 화면, 관련 DB/HTTP/UI 회귀시험 및 S5 정본 문서다.
- 환불 승리 시 `REFUNDED/SUCCEEDED/APPLIED`와 출고 `CANCELLED`, 배송 승리 시 출고 `SHIPPED`와 환불 사례·시도·사건 `REVIEW_REQUIRED`로 수렴한다. `PROCESSING/PENDING_PROCESSING`은 성공 결과가 아니다.
- 기존 lock ordering, Flat v2 화면, 고객/판매자/관리자 권한, 원 주문·결제·환불 사건, migration16을 유지한다. 공유 DB, 운영 DB, 외부 공급자, GitHub 계정/토큰은 변경하지 않았다.

## 검증

- TDD RED: SHIPPED 후 환불 안정화 0/1, 기존 환불 상태의 seller/admin SHIPPED 차단 0/1, seller/admin 경쟁 0/2, PATCH 비노출 0/1, 역순 UI 응답·busy 0/2를 각각 재현했다.
- 전용 PostgreSQL 18.4 migration16에서 관련 실제 DB/HTTP 시험 **38/38 PASS**: 환불 처리 8, 환불–출고 결합 5, 관리자 HTTP 13, 판매자 HTTP 10, 환불 HTTP 2. seller/admin 경쟁 양쪽 결과와 PUT 존재·PATCH 404를 포함한다.
- UI focused 시험 **17/17 PASS**. 역순 목록 응답, mutation 무효화, 독립 상세, pending busy, 역할 화면과 기존 actual-Chrome runner 계약을 포함한다.
- 최종 제품·QA SHA `943a8cd99307f968ca21cbeaf283f610b2e52448`에서 Windows와 WSL이 각각 전체 Node 시험 **415 total / 298 pass / 117 planned DB·환경 skip / 0 fail**, PR 본문 validator **8/8 PASS**다. skip은 PASS로 계산하지 않았다.
- 양쪽 `pnpm typecheck`, `pnpm lint`, `pnpm build`가 exit 0이며 Next production build는 18 routes를 생성했다. `git diff --check`도 통과했다.
- 전용 PostgreSQL 18.4 migration16에서 관련 실제 DB/HTTP 시험 **38/38 PASS, fail0, skip0**다.
- 같은 SHA의 별도 격리 DB와 Chrome 154에서 역할 경로, 1920/1440/430·키보드가 PASS이고 screenshot 9개를 직접 확인했다. signed reset 뒤 25관계 합계0·설정1, f5141006 임시자원과 포트 잔류0이다.
- 공유 `local-postgres/shoppingmall`은 사후 `migration16|settings1|fulfillments0|events0|핵심 업무행0`으로 불변이며 적용 전 backup 2개의 크기·권한·SHA-256도 그대로다.

## 미검증

- 최종 Stage 독립 review, Oracle release candidate 배포, 신산님 UAT, 실제 택배사·문자·메일·푸시·PG, 실제 200% 확대는 미검증이다.
- actual Chrome은 별도 격리 DB 증거이며 공유 개발 DB를 브라우저가 사용했다는 뜻이 아니다.
- S5.2 문의/리뷰/클레임·출고 후 심사/환불, S5.3 알림, S5.4 관제는 미구현이며 S5 전체 완료가 아니다.

## 롤백

- 코드 문제 시 이 PR의 fix commit을 일반 revert하고 출고/환불 쓰기를 중지한 뒤 마지막 검증된 S5.1 기준으로 재검증한다. 이미 기록된 출고·환불·감사 사건은 삭제하거나 상태를 임의 덮어쓰지 않는다.
- migration16은 이미 공유 개발 DB에 적용된 additive migration이므로 역마이그레이션하거나 이력을 삭제하지 않는다. DB 보정이 필요하면 보존된 적용 전 backup과 현재 상태를 먼저 읽기 확인하고 별도 승인된 전진 보정을 사용한다.
- QA reset이 실패하면 거래 전체 rollback을 유지하고 임의 SQL로 삭제하지 않는다. 공유 DB 적용 전 backup 2개는 merged-main smoke와 복구 불필요 확인 전까지 보존한다.
