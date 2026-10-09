# S6 공유 개발 DB 적용 계획

- 상태: **적용 승인 대기**. 이 문서는 승인 요청과 실행·복구 경계를 고정한다. 이 문서만으로 DB 쓰기를 허용하지 않는다.
- 대상: SSH alias `WSL-server`의 정확한 `local-postgres` 컨테이너/`shoppingmall` 데이터베이스. 다른 PostgreSQL 컨테이너·DB, Oracle 및 운영 환경은 제외한다.
- 제품 기준: Git `66537f1de2ce3550eacb96055dc9c0a247f37331`(이후 `fab45b5`는 작업현황만 추가). 0020 SQL SHA-256 `6DEFFF2AACA5714845DDFA1A433063CB7A7890F39A743C47A8E2F46CBF8E8CA5`; 0021 SQL SHA-256 `6860C47EE26602B2657E74F8A6E23FDDB5C1457C52BAE7CA9D5C334D6B7C0EF7`.

## 적용 전 확인

1. WSL checkout이 위 제품 SHA의 자손인 clean `codex/s6-settlement`인지, SQL 해시가 같은지 확인한다. `local-postgres`의 system ID가 `7622490131194466339`인지 재확인한다. 달라졌으면 중단·재보고한다.
2. `shoppingmall`이 PostgreSQL 15.18, migration 20건, 정산 완료 테이블/기존 완료 행 없음인지 확인한다. 계정·판매자·주문·결제·환불의 사전 행 수와 DB 크기를 기록한다. 예상과 다르면 중단한다.
3. 승인 후에만 `/home/daon/deploy/shopping-s6-db-backups/pre-0020-66537f1-20261009.dump`에 PostgreSQL custom-format 전량 백업을 생성한다. 전용 디렉터리는 소유자만 접근하도록 만들고, 해시·파일 크기·`pg_restore -l`을 기록한다. 별도 격리 PostgreSQL 15에 복원하여 migration 20과 사전 행 수가 같은지도 확인한다. 백업은 S6 병합 후 복구 필요 여부를 확인할 때까지 보존하고 임의 삭제하지 않는다.

## 적용·검증

1. 사용자의 **공유 DB 0020·0021 적용 특정 승인** 후 표준 Drizzle migrator로 0020→0021을 적용한다. 기존 migration 파일은 바꾸지 않는다.
2. migration 22건, 새 테이블/제약/트리거, 기존 행 수 보존을 읽기 전용으로 대조한다. API health 및 관리자/판매자 권한 없는 접근 거부를 실제 WSL 환경에서 확인한다. 이 검증은 빈 DB의 schema/읽기 smoke이며 행 기반 E2E PASS가 아니다.
3. 불변 정산 장부·완료 행의 실제 공유 DB QA는 **별도 구체적 승인** 전 생성하지 않는다. 격리 PG15/Chromium의 행 기반 PASS와 공유 DB schema PASS를 혼동하지 않는다. 별도 승인이 없으면 S6 정식 공유 DB 행 기반 E2E는 `UNVERIFIED`로 남긴다.

## 실패·복구

- migration 중 실패하면 즉시 중단하고 DB·백업·에러·현재 migration 수를 보존한다. 자동 역마이그레이션, 임의 데이터 삭제, 백업 덮어쓰기, 기존 서비스 재시작은 하지 않는다.
- 코드는 마지막 검증된 `main`으로 되돌리는 PR이 기본 복구 경로다. 영속 DB는 백업과 영향·동시 변경 여부를 검토한 뒤 별도 승인으로 복원하거나 전진 수정한다.
- 임시 백업 검증용 컨테이너/네트워크는 정확 ID를 확인한 뒤 제거한다. 백업 파일은 승인된 보존 기간 동안 유지한다.
