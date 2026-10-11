## 목적

신산님의 2026-10-11 직접 지시에 따라 `docs/WORK_PLAN_20260-10-10-2.md` 작업 브랜치를 `main`에 통합한다. 실행할 수 없는 계획 항목은 `docs/design_change.md` 기록으로 이번 작업에서 처리하되, 실제 검증 합격이나 출시 승인으로 표시하지 않는다.

## 변경 요약

- 격리 QA DB 대상 검증, 모의 결제 부하 시작 차단·실제 DB 식별 사전검사, 18개 역할 화면 경로 감사와 관련 회귀 시험을 추가했다.
- 계정·고객·카탈로그 브라우저 시험 자료 생성기의 승인 QA DB 식별/정리 가드를 보강했다.
- 병합 전 검토에서 발견된 부하 API의 보호 DB 시작 위험을 수정했다. QA 부하 모드는 허용된 DB 설정·system ID를 확인하고 실제 연결 대상이 일치해야만 HTTP 리스너를 연다.
- `WORK_STATUS.md`와 `docs/evidence/three-role-menu-matrix.md`에 실행 증거를, `docs/design_change.md`에 미검증·재개 경계를 남겼다. 설계서와 승인된 작업계획서는 실행 중 수정하지 않았고 DB migration은 추가하지 않았다.

## 영향

- 일반 주문·결제 정책은 바꾸지 않는다. 개발용 mock 결제 프로세스의 QA 부하 시작 가드와 시험 도구만 확장한다.
- 로컬·WSL의 승인 QA DB만 시험 대상으로 사용했고 보호 `shoppingmall` DB에 시험 거래를 만들지 않았다. 실제 외부 PG, Oracle 배포, 운영 Secret·공급자 설정은 변경하지 않는다.
- 이번 병합은 신산님의 직접 통합 지시에 따른 것이다. 아래 미검증 항목을 PASS로 승격하거나 실서비스 출시를 허용하지 않는다.

## 검증

- 병합 요청 전 작업 SHA `caabf5533d41daa1f2a17357a094f26170aad0a8`에서 로컬 `pnpm test`: 654건 중 459 pass·195 DB 조건부 skip·0 fail, PR 본문 검사 8/8 pass. 후속 안전 수정 뒤 전체 `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`를 다시 실행해 각 exit 0, Web 31경로 생성을 확인했다. 보호/불일치 DB 설정·실제 QA DB 연결 실패의 거부 시험을 추가했다.
- 격리 모의 결제 단일 사용자 smoke와 실제 QA DB 식별 사전검사, 일부 역할 화면의 로컬 브라우저·DB/API 부분 시험은 `WORK_STATUS.md` 및 행렬의 범위대로 확인했다. 로컬·원격·WSL 작업 SHA 일치, QA DB와 보호 DB의 계정/정산 사건 각 0/0, 시험용 Windows 포트 9091/9092/9229/15442 listener 0을 확인했다.
- `git diff --check origin/main...HEAD`와 `node .github/pr-broker-body.mjs .github/PR_REQUEST.md`를 병합 요청 직전에 실행한다. PR/merged-main CI 및 병합 뒤 smoke는 실행 결과를 별도로 판정한다.
## 미검증

- 7일 PITR·14개 백업·실제 이미지 동일 시점 결합 복원은 미검증이며, 기존 PostgreSQL의 `archive_mode=off`를 읽기 전용으로 확인했다.
- 외부 PG 요청 0을 계측한 100사용자·30분 부하, WSL Web/API의 세 역할 18화면 정상·오류·권한·재시도 전수, Chrome·Edge 실제 200% 확대는 미검증이다. DB 조건부 skip 195건을 실DB 합격으로 계산하지 않는다.
- 판매자 본인 신청 조회 신규 API, 실제 관리자 메일 수신·첫 로그인, 인증 응답 시간차 방어도 미검증이다. 판정·영향·재개 조건은 `docs/design_change.md`에 기록돼 있으며 Oracle/사용자 인수/출시는 이 PR의 합격 범위가 아니다.

## 롤백

- 병합 뒤 새 결함이 확인되면 정확한 병합 SHA와 원격 `main` 상태를 확인한 후 새 복구 PR에서 이 병합의 제품·시험 코드 변경을 되돌린다. 이미 기록한 미검증·안전 근거를 조용히 삭제하지 않는다.
- 공유 DB schema·운영 Secret·외부 공급자를 변경하지 않았으므로 이 PR에 별도 DB 복원이나 외부 서비스 취소 작업은 없다. 사용자 소유 비추적 파일은 정리 대상에서 제외한다.
