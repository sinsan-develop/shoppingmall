# 어울몰 개발 시험자료 운영 기준

이 문서는 `shoppingmall` 개발 DB의 가상 시험자료에만 적용한다. 실제 고객·농가의 개인정보를 seed나 자동 시험에 사용하지 않는다.

## 생성과 접근

- `apps/api/scripts/qa-fixture.ts`는 8자리 16진수 `QA_RUN_ID`별 고객, 판매자 A/B, 어울몰 판매자, 관리자 계정을 각각 따로 만든다. 이메일은 `example.invalid`이고 이름은 `qa-<run-id>-...`다.
- `QA_FIXTURE_PASSWORD`는 실행 환경에서만 제공한다. 저장소, 문서, 테스트 출력에 비밀번호·실제 전화번호·주소·토큰을 기록하지 않는다. 다른 실행 ID의 계정과 실제 사용자를 시험에 섞지 않는다.
- fixture는 `shoppingmall` DB에서만 작동한다. 서버 접속과 DB 권한은 개발 담당자에게만 제공하며 운영 DB에서는 실행하지 않는다.

## 정리와 보존

- 자동 DB 시험은 고유 실행 ID를 만들고 `finally`에서 해당 ID의 행만 정리한다. 수동 seed 자료는 사용한 담당자가 동일 ID의 `reset`을 수행한 뒤 0행을 확인한다. 세션·감사·동의·배송지·탈퇴 요청도 해당 계정 ID에 한해 정리한다.
- 시험에 실패하면 실패 ID, 담당자, 사용 DB, 남은 행, 다음 정리 조치를 `WORK_STATUS.md`에 기록한다. 참조 관계를 확인하기 전 전체 DB 초기화·패턴 일괄 삭제를 하지 않는다. Stage 종료 전 잔류 자료 0건을 확인하고, 근거 보존이 필요하면 개인 정보 없는 로그/시험 결과만 남긴다.
- 실제 고객의 탈퇴 요청은 시험 fixture reset과 다르다. `requested` 상태 기록만 구현했으며 실제 삭제·법정 보존·운영 처리 기한은 출시 전 약관/법률 검토와 운영 절차에서 별도 확정한다. 이 단계에서 자동 삭제를 약속하거나 수행하지 않는다.

## 재현 명령

API 작업 디렉터리에서 `DATABASE_URL`, `QA_RUN_ID`, `QA_FIXTURE_PASSWORD`를 안전한 실행 환경에 지정한 뒤 `node --import tsx scripts/qa-fixture.ts seed`를 실행한다. 시험이 끝나면 같은 `DATABASE_URL`과 `QA_RUN_ID`로 `node --import tsx scripts/qa-fixture.ts reset`을 실행한다. 비밀번호는 reset에 필요하지 않다. WSL 시험에서는 지정 checkout `/home/daon/deploy/shopping`과 `local-postgres`의 `shoppingmall` DB만 사용한다.
