# 설계 변경사항·미진사항 기록

이 파일은 현재 작업 Stage의 변경·결정·미검증을 누적하는 보조 기록이다. 승인된 정본 `docs/design/DESIGN.md`, `docs/WORK_PLAN.md`, `WORK_STATUS.md`를 대체하지 않으며, 이 파일 자체는 설계·DB·공개 API 변경 승인 근거가 아니다. 상태가 바뀌면 기존 항목을 지우지 말고 날짜와 근거를 추가한다.

## S6 판매자별 정산 — 2026-10-09

| 상태 | 대상·내용 | 근거·영향 | 남은 검증·다음 조치 |
|---|---|---|---|
| 승인됨·구현됨 | 발생일별 불변 `settlement_events`, 판매자별 개별 완료 `seller_settlement_periods`, 관리자/판매자 범위별 조회·인쇄 | `docs/S6_SETTLEMENT_CONTRACT_PROPOSAL.md`; `docs/design/DESIGN.md` R09와 `docs/WORK_PLAN.md` S6. 원판매자·출고 담당자·원주문과 발생 당시 판매자 분류를 분리해 보존하며 자동 지급액·송금은 제외 | 격리 PostgreSQL/실제 Chromium·PDF 증거는 `WORK_STATUS.md` 최신 S6 절 참조. 공유 DB 행 기반 정산 E2E는 아래 사용자 결정대로 미검증 |
| 승인됨·구현됨 | 완료 당시 포함 사건 ID와 항목별 금액을 고정하는 0021 연결, 완료 후 소급 사건 별도 표시, 관리자 수수료 수동 입력 API | `docs/S6_COMPLETED_AMOUNT_DESIGN_PROPOSAL.md`의 신산님 승인. 완료 기간이 나중의 입력으로 바뀌지 않고 0건 판매자도 완료 가능 | 격리 DB의 경합·과거 완료 행 migration 거부·역할 HTTP와 브라우저/PDF를 확인. 공유 DB 실제 거래 행 처리와 최종 독립 리뷰는 미검증 |
| 승인됨·적용됨 | WSL `local-postgres/shoppingmall`에 migration 0020·0021 적용 | 신산님 위임 범위 내 특정 적용 승인과 `docs/S6_SHARED_DB_APPLICATION_PLAN.md`. 사전 백업을 별도 DB에 복원 검증했고 공유 DB migration22/대기0, 기존 업무행0 | 공유 DB의 `/health`·`/ready`·권한 차단 읽기 smoke까지만 확인. 백업 보존, 영속 DB 복구는 별도 승인 |
| 신산님 결정·미검증 유지 | 공유 DB에 가상 불변 정산 시험 행을 남기지 않는다. 공유 DB 행 기반 E2E는 `UNVERIFIED`로 표기 | 신산님 2026-10-09 직접 선택. 약70행을 영구 보존하는 권장안을 채택하지 않아 공유 DB 자료는 계정·판매자·정산 사건·완료·연결 각0행 유지 | 격리 DB PASS를 정식 공유 DB 행 E2E PASS로 바꾸지 않는다. 나중에 이 검증이 필수가 되면 새 선택·보존/정리 방안이 필요 |
| 미진·미검증 | 최종 독립 전체 브랜치 리뷰, PR CI, 병합 및 merged-main smoke | 독립 reviewer는 실행기 초기화 오류로 실제 diff를 읽지 못했다. `WORK_STATUS.md`에 오류 기록. 검토용 PR #15를 생성했으며 자동 병합은 요청하지 않았다 | 접근 가능한 리뷰 경로로 Critical/Important 확인·해소, PR/CI 확인. 공유 DB 행 E2E가 원래 S6 계획의 필수 gate인 점을 유지하며 미충족 상태에서는 S6 전체 완료·병합으로 표시하지 않음 |

### 범위 밖·향후 검토

- 실제 송금 자동화, 수수료·할인·배송비·환불의 부담 주체 및 최종 지급액 자동 결정은 S6 범위가 아니다. 운영 후 별도 정책·설계·승인이 필요하다.
- PG 실거래·실발송·사용자 인수테스트·Oracle staging/출시는 신산님이 이번 개발 완료 대상에서 제외했다. 별도 환경·계정·승인·법률/약관 검토가 필요하며 현재 PASS로 표시하지 않는다.
