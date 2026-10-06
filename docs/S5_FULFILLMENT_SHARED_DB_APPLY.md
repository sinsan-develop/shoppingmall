# S5.1 출고 공유 DB 적용 승인 패킷

## 1. 현재 판정

- 이 문서는 **승인 요청 자료**다. migration 적용, QA seed/reset, 실제 Chrome 공유 쓰기 승인이 아니다.
- 공유 대상은 `WSL-server`의 Docker container `local-postgres`, database `shoppingmall`이다.
- PostgreSQL은 `pgvector/pgvector:0.8.2-pg15`, 실제 server version은 `15.18`이다.
- 제품 코드 기준 commit은 `553d4af28bbe30d975fadb80a5dae547ac936f9a`다. Task10 완료·패킷 작성 직전 local/origin/WSL exact commit은 `d8c851a35b91034d1dae8138807a8c3879e524a6`이며 이후 packet 문서 commit은 PMO 승인 요청 본문에서 별도 고정한다.
- Task10 private gate는 upgrade 11/11, 전체 441건 중 421 pass·20 planned skip·0 fail, PR 본문 8/8, typecheck·lint·build 18 routes, 업무행 잔류0·임시자원0, 독립 review C0/I0/M0다.

## 2. 적용 대상 migration

- 파일: `apps/api/migrations/0015_s5_fulfillment.sql`
- Windows와 WSL exact checkout SHA-256: `ec41e1ff8281ff53c4fc424245d5f9601f04d001df024b4fa4e111d42f1d19ee`
- 현재 공유 Drizzle 이력: 15건, 마지막 적용 hash `fe1328de61502e1d19a7ade992862c9bd508667f432f0ac29de1df87a9c75181`
- 현재 신규 관계: `fulfillment_settings`, `shipment_fulfillments`, `shipment_fulfillment_events` 모두 없음
- 적용 후 기대: Drizzle 이력 16건, 위 세 관계 생성, `fulfillment_settings(id=1)` 정확히 1행, 신규 출고·사건 0행
- migration은 기존 관계를 수정하거나 기존 발송 주문을 backfill하지 않고 세 관계와 singleton만 전진 추가한다.

## 3. 공유 DB 사전 읽기 결과

2026-10-06 읽기 전용 조회 결과다.

| 관계 | 실제 행수 |
|---|---:|
| `home_content_current` | 1 |
| `home_content_draft` | 1 |
| `shipping_policy_global` | 1 |
| `shipment_orders` | 0 |

다음 기존 관계는 각각 0행이다.

`account_deletion_requests`, `account_identities`, `account_roles`, `accounts`, `audit_events`, `auth_sessions`, `checkout_orders`, `checkout_reservation_lines`, `checkout_reservations`, `customer_addresses`, `customer_cart_items`, `customer_favorites`, `home_content_publications`, `inventory_deferred_stock_targets`, `inventory_levels`, `notification_preferences`, `order_promotion_allocations`, `order_status_events`, `payment_attempts`, `payment_event_conflicts`, `payment_events`, `product_categories`, `product_images`, `product_options`, `product_publications`, `product_revisions`, `product_sale_stop_requests`, `products`, `promotion_campaigns`, `promotion_codes`, `promotion_grants`, `promotion_uses`, `promotion_versions`, `refund_attempts`, `refund_case_events`, `refund_case_lines`, `refund_cases`, `refund_event_conflicts`, `refund_events`, `restock_subscriptions`, `seller_categories`, `seller_shipping_policies`, `seller_shipping_policy_requests`, `sellers`, `shipment_order_lines`, `stock_change_requests`.

- 총 기존 public table 50개를 실제 `count(*)`로 조회했다.
- 발송 주문이 0이므로 현재 backfill 대상은 없다.
- 적용 직전 `shipment_orders`가 1행 이상이거나 위 baseline이 바뀌면 **즉시 적용을 중단**하고 기존 주문용 backfill·초기 담당자 결정안을 별도로 설계·승인받는다.

## 4. 백업과 복원 검증

- host 경로: `/tmp/shoppingmall-s51-0015-pre-20261006.dump`
- 형식: PostgreSQL custom format, `--no-owner --no-acl`
- SHA-256: `90b7d634c9f629a2ddb1774a12dfde2cba0bcc85535a65401e5ed3b288f19681`
- 크기·권한·소유자: `165682 bytes`, `0600`, `daon:daon`
- 목록 검증: TOC 348건, TABLE DATA 51건
- 실제 격리 복원: 같은 PostgreSQL 15 이미지의 무포트·무볼륨 일회용 container에 새 `shoppingmall` DB를 만들고 아래 `pg_restore` 방식으로 복원했다. 복원 후 migration15, `shipment_orders=0`, 홈 current1·draft1·전역 배송정책1을 확인했다.
- 복원 검증 container `shoppingmall-s51-task11-restore-pg-1006`은 제거해 잔류 0이다.

검증에 사용한 복원 명령 형태는 다음과 같다.

```bash
docker exec RESTORE_CONTAINER createdb -U postgres shoppingmall
docker exec -i RESTORE_CONTAINER \
  pg_restore -U postgres -d shoppingmall --no-owner --no-acl \
  < /tmp/shoppingmall-s51-0015-pre-20261006.dump
```

공유 DB 장애 복구에서는 실패 DB를 즉시 삭제하지 않는다. API/Web 쓰기를 중지하고 연결을 종료한 뒤 실패 DB를 보존 이름으로 바꾸고 새 `shoppingmall`에 위 백업을 복원한다. 이 실제 rename/restore는 파괴적 복구이므로 별도 직접 승인 후 수행한다. 복구 전에는 먼저 별도 recovery DB에 같은 dump를 복원하고 위 baseline을 재검증한다.

백업은 Task12 전체 성공, merged-main smoke, 복구 불필요 확인 전까지 보존한다. 성공 뒤 exact 경로·해시를 다시 확인해 해당 파일만 삭제한다.

## 5. 승인 후 적용 절차와 중단 조건

1. local/origin/WSL의 승인된 exact SHA와 clean 상태, 0015 SHA-256을 다시 대조한다.
2. `local-postgres/shoppingmall`과 migration15, `shipment_orders=0`, 기존 baseline, 백업 해시·0600을 다시 확인한다.
3. exact checkout의 정식 `apps/api/scripts/migrate.ts`를 자격정보 비노출 환경에서 1회 실행한다. `migrate-dry-run.ts`를 적용 명령으로 오용하지 않는다.
4. migration16, 신규 세 관계, singleton1, 신규 출고·사건0, 기존 50관계 행수 불변을 즉시 대조한다.
5. 어느 값이라도 다르면 API/Web·fixture 실행을 시작하지 않고 PMO에 보고한다. migration15·신규 관계 없음이면 원인을 조사하고 재시도 승인을 받는다. migration16인데 baseline 불일치면 백업 복구 승인 경계로 전환한다.
6. migration 검증이 모두 맞을 때만 승인된 실제 Chrome QA 방식으로 진행한다.

## 6. QA run과 생성·정리 범위

- 예정 `QA_RUN_ID`: `f5111006` (8자리 hex)
- 가상 정보만 사용: 고객1, 판매자 A/B/어울몰3, 관리자1의 계정·identity·role; 판매자 분류1; 상품 분류5; 상품·revision·option·inventory·publication 각3; 주소1; 소비된 예약·예약품목·결제완료 주문·발송 주문·발송 품목·결제시도·결제사건 각3; 출고3과 출고사건; 해당 run의 정확한 audit/session만 허용한다.
- fixture는 PostgreSQL system identifier, run ID, 시험 비밀번호 HMAC signature, 생성 UUID manifest에 묶는다.
- reset은 account/identity/role, seller/category, product/category/revision/option/publication/inventory, address, reservation/line, order/status event, shipment/line, payment attempt/event/conflict, fulfillment/event, 정확한 audit/session을 역참조 순서로 제거한다.
- manifest 밖 identity·role·category·audit·cart·favorite·restock·stock target·refund·payment conflict·다른 주문/예약/배송 참조가 있으면 삭제 전에 transaction 전체를 rollback한다. late child insert는 부모 잠금과 FK로 차단한다.
- 성공·실패 모두 reset 후 manifest 관련 모든 관계 0과 기존 singleton 원복을 확인한다. 임의 SQL로 억지 삭제하지 않는다.
- 임시 정리 대상: migration/QA Node container, API/Web container, 필요 시 private DB container와 network/volume, WSL loopback 9091·9092, Windows SSH tunnel, Chrome CDP 9229 process와 격리 profile, 임시 비밀번호·manifest 파일, screenshot/evidence 임시폴더. 승인된 migration과 적용 전 백업은 Task12 최종 판정 전 삭제하지 않는다.

## 7. 실행계약 정정 — A안

기존 계획과 시험 안내는 실제 Chrome을 공유 `local-postgres/shoppingmall`에서 수행한다고 적었지만, 현재 `qa-fulfillment-ui-fixture.ts`의 DB 이름·system-ID guard는 정확한 `shoppingmall_s5_fulfillment_ui_<runId>`만 허용하며 `/shoppingmall`을 의도적으로 거부한다.

- **채택 A안:** 공유 DB에는 0015 적용과 exact-SHA 전체 회귀만 수행하고, 실제 Chrome fixture는 같은 exact SHA의 별도 격리 DB에서 실행한다. 기존 검증된 fixture guard를 유지하고 공유 자료 오염 위험을 최소화한다.
- 공유 DB 회귀와 격리 Chrome은 서로 다른 증거로 보고하며, 격리 Chrome 결과를 공유 DB browser PASS로 승격하지 않는다.
- shared fixture mode를 추가하지 않으므로 fixture 제품 코드·DB 안전장치·공개 API·schema를 변경하지 않는다.

신산님의 최신 직접 지시 `진행하자`에 따라 권장 A안으로 문서를 정정한다. PMO에 정확한 범위 확인을 요청했으며, PMO가 shared migration·전체 회귀 실행 범위를 전달하기 전에는 shared DB 쓰기를 시작하지 않는다.

## 8. 승인 요청 범위

다음 실행 승인은 정정 문서의 exact packet commit을 기준으로 요청한다.

1. `local-postgres/shoppingmall`에 0015 적용 및 exact-SHA 전체 회귀
2. 같은 exact SHA의 별도 격리 DB actual Chrome과 reset·임시자원 정리

외부 PG·택배 API·문자·메일·푸시, Oracle/UAT, 운영 전환은 이 승인 범위에 포함하지 않는다.
