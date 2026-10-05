## 목적

승인된 S4의 모의 결제와 출고 전 취소·환불을 기존 장바구니·예약·발송 주문에 연결한다. 구매자는 자기 결제완료 주문만 조회하고 수량별 환불을 요청하며, 운영자는 출고 전 확인과 재고 처리 판단 뒤 승인·모의 환불 또는 반려한다. 공유 개발 DB의 가상 환불 자료는 외부 자료를 지우지 않는 fail-closed reset으로만 정리한다.

## 변경 요약

- `0013` 결제 시도·검증 사건·충돌 원장과 `0014` 환불 사례·품목·시도·검증 사건·상태 이력을 추가했다. 두 migration은 별도 승인과 백업·회귀를 거쳐 공유 개발 DB에 적용돼 현재 이력 15건/대기 0이다.
- 개발환경 전용 모의 결제 승인·거절·지연과 응답 유실 후 동일 멱등키 재확인, 검증 사건 기반 주문 확정, 고객의 이전 결제완료 주문 조회를 구현했다. 실제 PG나 카드 청구는 연결하지 않았다.
- 고객 출고 전 부분·전량 환불 요청과 운영자 승인·반려·모의 환불 화면/API를 구현했다. 상품금액은 원화 정수 비례배분하며 마지막 남은 수량 전량 취소 때 실제 납부 배송비를 한 번 포함한다. 판매중지 상태에서는 자동 판매가능재고 복원을 완료로 숨기지 않는다.
- 공유 QA reset은 생성 manifest와 계정·판매자·상품·예약·배송·주문·결제·환불 소유권을 대조한다. `READ COMMITTED`를 명시하고 FK 부모 및 감사/결제사건 잠금을 제한시간 안에서 사용하며, 기존·후발 교차 주문 충돌·외부 결제사건 역참조·프로모션 배분·외부 감사가 있으면 전체 rollback한다.

## 영향

- 영향 경로는 `apps/api`의 결제·환불·주문·재고·QA 도구, `apps/web`의 장바구니·구매자 환불·운영자 환불 화면, `0013`·`0014` 관계다. 기존 주문 금액·발송 snapshot과 검증 사건은 삭제하거나 재작성하지 않는다.
- 공유 개발 DB에는 승인된 additive migration만 유지하며 최종 안전성 보정은 schema·공개 API를 추가하지 않는다. 운영 DB·Oracle·실제 PG·자동 송금·S5.2 출고 후 교환/반품에는 적용하지 않았다.
- 사용자 소유 미추적 `apps/web/AGENTS.md`와 `apps/web/CLAUDE.md`는 읽거나 수정·삭제하지 않았다.

## 검증

- 최종 PR head에서 Windows 전체 자동검사 **355건/255 pass/100 DB·환경 skip/0 fail**, PR 본문 validator **8/8**, `pnpm typecheck`·`pnpm lint`·`pnpm build` 종료코드 0. skip은 PASS로 계산하지 않았다.
- 같은 PR head의 WSL 지정 checkout과 공유 `local-postgres/shoppingmall`에서 순차 전체 **356건/336 pass/20 조건부skip/0 fail**, PR 본문 **8/8**, API/Web/Mobile/contracts typecheck·lint와 API/Web build 종료코드 0. 로컬·원격·WSL SHA 일치와 WSL clean을 확인했다.
- fresh 0000~0014 tmpfs PostgreSQL의 공유 reset 경합 시험 **3 pass/0 skip/0 fail**. 외부 identity·장바구니·프로모션 배분, 기존/후발 결제·환불 conflict, 후발 예약·배송행, 동시 QA event와 외부 payment event의 QA 주문 역참조를 거부·보존한다. 사후 계정·상품·주문·감사 4범주0, 정확한 전용 PG/네트워크·공개 port·영속 mount 잔류0.
- 공유 DB의 환불 QA accounts/identities/sellers/products/cart/reservations/orders/payment attempts/events/refund cases/attempts/events/audit/sessions **14범주 각0**. migration15와 기존 `home_content_current`·`home_content_draft`·`shipping_policy_global` 각1을 보존했다.
- 독립 최종 리뷰는 제품·시험 코드 `b04d3824a312c8f44ec4bf3f247dad240a43e930`과 관련 FK를 정적 대조해 **Critical0/Important0/Minor0**으로 판정했다. 개발시험 안내의 `/login`→`/cart`→`/account/admin/refunds`, 모의 결제 한계와 부분 3,333원/잔여 전량 8,667원 예시는 현재 화면 코드와 일치한다.
- 실제 Chrome 증거는 제품 SHA `cfe1fc8f808b7d7ec7e8fdbb77f1b27a1adaf3e6`에서 모의 결제 거절·지연·승인 응답 유실 재시도, 고객 부분/전량 요청, 운영자 승인·모의 환불, 390px 가로 넘침0을 확인했다. 후속 변경은 QA reset 안전성 전용이며 제품 UI/API 동작을 바꾸지 않는다.

## 미검증

- 실제 PG 승인·카드 청구·실환불, Oracle staging 배포, 사용자 인수, 외부 문자·메일·푸시, Android 앱/실기기, 운영 약관·법률 검토는 이 PR에서 검증하지 않았다.
- 실제 200% 확대·인쇄와 다른 viewport 전체, S5.2 출고 후 교환·반품은 후속 범위다. `cfe1fc8` 이후 fixture 안전성 변경만 있었으므로 실제 Chrome을 다시 실행하지 않았고, 이전 화면 증거를 최종 사용자 인수로 승격하지 않는다.
- GitHub Actions와 자동 병합 결과는 요청 태그 처리 뒤 확인한다. CI 실패, PR head/base 불일치, 미해결 Critical/Important가 생기면 병합 완료로 표시하지 않는다.

## 롤백

- 코드 문제 시 모의 결제·환불·공유 QA reset 진입을 중지하고 마지막 검증된 `main` 코드로 되돌린다. 이미 생성된 주문·결제·환불·충돌·감사 사건은 삭제하지 않고 원거래와 함께 보존해 별도 복구 판단을 받는다.
- `0013`·`0014`는 공유 개발 DB에 적용된 additive migration이다. migration 이력을 삭제하거나 DB 전체를 초기화·역적용하지 않는다. 관계 보정이 필요하면 현 상태를 읽기 전용 확인하고 승인된 전진 보정 migration을 사용한다.
- QA reset이 timeout·외부 참조·manifest 불일치로 실패하면 트랜잭션 전체 rollback 상태를 유지하고 임의 SQL로 시험자료를 지우지 않는다. 원인과 정확한 남은 행을 기록한 뒤 다시 판단한다.
