## 목적

승인된 후속 계획 `docs/WORK_PLAN_20260-10-09.md`의 C1/C1.2만 첫 번째 순차 PR로 검토한다. 정산 원장 오입력을 원행 변경 없이 발생 시점의 정정 사건으로 추적하고 관리자에게 입력·조회·인쇄 근거를 제공한다. C2 분류 이력 변경은 이 PR 결과에서 제외한다.

## 변경 요약

- additive migration 0022에 원사건 링크·증감 방향·멱등 요청 식별자를 추가했다. 원사건 종류·판매자는 서버가 읽고, 감소 초과·동시 경합·정정의 재정정을 거부한다.
- 관리자 전용 `POST /admin/settlement/corrections`와 금액·사유·원사건 입력/조회 화면을 추가했다. 판매자에게는 자신의 정산 자료 읽기만 유지한다.
- 발생 시점의 정정을 순합계에 반영하되 과거 완료 사건의 고정 금액은 바꾸지 않는다. 관련 DB/HTTP·화면·인쇄 계약 시험과 격리 브라우저 자료를 추가했다.
- 기존 C1+C2 혼합 커밋은 이력을 재작성하지 않고 후속 커밋으로 C2 결과 파일을 제외했다. C2 재개 근거인 과거 후보 SHA는 원격 이력에 남아 있다.

## 영향

- 정산 조회·관리자 입력 API 및 화면, `settlement_events`의 additive schema가 영향을 받는다. 기존 0020·0021 migration과 완료 금액의 불변성은 유지한다. 실제 송금이나 최종 지급액 계산은 범위 밖이다.
- 공유 `local-postgres/shoppingmall`에는 0022를 적용하지 않았다. 적용 시에는 대상·백업·복구 확인과 별도 환경 승인이 필요하다. 공유 DB 불변 가상 거래 행도 만들지 않는다.

## 검증

- UUID·동시 멱등성 보정 후 로컬 제품 시험 592건 중 428 pass·164 조건부 skip·0 fail, PR 본문 시험 8/8 pass. `pnpm lint`, `pnpm build`(웹 25경로), `pnpm typecheck` exit0. 대소문자 혼용을 수정 전 RED(정정 2건)→수정 후 GREEN(1건)으로 확인했다.
- WSL 동일 SHA `ff1ca8b`의 일회용 PostgreSQL 15에 0000~0022 적용·재실행(23 이력), 정정 DB/HTTP/동시 감소 경합 3건 0 skip/0 fail 및 대상 시험 11/11 pass. 해당 격리 DB·볼륨은 제거했다.
- 수정 SHA `9a80ff7ca005d9d441542a4924e967f6b2733e71`도 WSL 지정 checkout에 동기화했다. 새 격리 PostgreSQL 15(system identifier `7694660615772590117`)에서 0000~0022 적용·재실행 후 UUID 대소문자 재시도·원사건 변경 충돌, 관리자/판매자 HTTP와 동시 감소를 포함한 3건 0 skip/0 fail. 컨테이너·익명 볼륨·포트 잔류 0.
- 최신 제품 SHA `c0b386f4021ec3f1fc2434f22c6ec832d485d2bf`의 격리 PostgreSQL 15(system identifier `7694662024638005286`)에서 동일 UUID 동시 감소 두 건을 잠금 대기시킨 RED(두 번째 초과 거절)→GREEN(같은 사건 반환)과 전체 DB/HTTP/경합 4/4 pass·0 skip·0 fail. migration 0000~0022 재실행 후 23건, 전용 DB·볼륨·포트 잔류 0.
- 최신 브라우저 후보 `24deb93d9cf689944e1384888e379339a6a35c5b`의 별도 격리 DB에서 관리자/판매자 실제 화면을 확인했다. 원수수료 10,000원, 감소 정정 2,000원, 현재 8,000원, 과거 완료 고정 10,000원이 원사건/사유와 일치했다. 430 CSS px 가로 넘침 0, 시작일에서 종료일로 일부 Tab 이동 확인. 시험용 컨테이너·네트워크·볼륨·포트 전달은 제거했다.
- C1 인쇄 수정 제품 SHA `56c1b55`를 WSL 격리 PostgreSQL 15(system identifier `7694665941122375717`, migration 0000~0022)와 같은 웹/API 소스에서 검증했다. 실제 Chrome CDP가 관리자·판매자 PDF 각각 288,157 byte·A4 2쪽을 생성했고 원수수료 10,000원·정정 2,000원·현재 8,000원·완료 당시 10,000원 및 원사건·사유가 인쇄됐다. 첫 PDF에서 완료 이력 카드가 페이지 사이에 나뉘는 결함을 재현해 A4/분할 방지로 수정했고, 최종 PNG로 카드 전체가 한 쪽에 있는 것을 직접 확인했다. 1440·430 CSS px 가로 넘침 0, 실제 Tab 이동·`:focus-visible` 확인. 전용 컨테이너·DB 볼륨·네트워크·Chrome 프로필/PDF는 제거해 잔류 0이다.
- 인쇄 수정 후 로컬 `pnpm test` 제품 592건/428 pass/164 조건부 skip/0 fail, PR 본문 시험 8/8, `pnpm lint`, `pnpm typecheck`, `pnpm build` exit0(웹 25경로). 동일 SHA WSL Next production build 25경로도 통과했다.
- 현재 후보를 재검증해 로컬 제품 592건/428 pass/164 조건부 skip/0 fail, PR 본문 시험 8/8 pass, lint/build/typecheck exit0을 확인했다. 지정 WSL 시험 checkout은 동일 작업 SHA로 fast-forward했고 clean이다. 공유 DB를 읽기 전용 재조회해 migration 22건과 정산 사건·기간·연결 각 0행을 확인했다.
- 전체 26파일 독립 리뷰의 새 Important였던 잠금 대기 후 기록시각 역전을 격리 PostgreSQL 15(system ID 7694684847196008487, migration 23건)의 기존 동시 동일 UUID 시험에 추가해 수정 전 3 pass/1 fail/0 skip RED를 확인했다. 정정 INSERT의 발생·기록 시각을 같은 문장 시각으로 명시한 수정 SHA `5b738dd`에서 4/4 pass·0 skip GREEN, 로컬 제품 592건/428 pass/164 skip/0 fail, PR 본문 8/8, lint/build/typecheck exit0이다. 이 시험의 tmpfs DB/가상 사건·전용 network를 제거해 잔류 0을 확인했다.
- 제품 수정 `5b738dd`를 포함한 후보 `10badb1`을 WSL의 격리 PostgreSQL 15(system ID `7694687580848975911`, migration 23건)와 실제 컴파일 API·production 웹에서 재검증했다. Chrome 관리자·판매자 조회/인쇄는 Tab focus-visible, 1440/430 CSS px 넘침 0, A4 PDF 각 2쪽·285977 bytes였다. 양쪽 PDF의 실제 추출 텍스트에 10,000원·2,000원·8,000원·원사건·정정 사유가 있었고 렌더한 네 페이지를 육안 확인해 카드 분할·잘림이 없었다. 전용 DB·서비스·network·브라우저 프로필·임시 출력·포트는 정확한 대상 대조 후 제거해 잔류 0을 확인했다.
- 공개 읽기 전용 PR/CI 조회에서 후보 `10badb1`의 #16 본문 일치, Verify shoppingmall push 실행 `37949910164` 및 pull_request 실행 `37949918256` 모두 completed/success, mergeable_state clean을 확인했다. CI 성공은 공유 DB와 실제 OS 인쇄·확대 gate의 대체 증거가 아니다.

## 미검증

- 공유 개발 DB 0022 적용·읽기 smoke는 별도 승인 전이므로 미실행이다. 공유 DB 거래 행 E2E는 사용자 결정에 따라 실행하지 않는다. 로컬 조건부 skip 164건은 PASS로 계산하지 않는다. 새 조회 코드가 0022의 original_event_id 열을 참조하므로 공유 DB 적용 전 새 API를 연결하면 조회 실패 위험이 있다.
- 정확한 C1 SHA의 Chrome 자동 PDF와 일부 실제 Tab 이동은 확인했지만 OS 인쇄 창 ‘PDF로 저장’, 브라우저 200% 실제 확대, 전체 폼 키보드 탐색, WSL production API image 검증은 미검증이다. 확대 단축키 전후 브라우저 값이 변하지 않아 430px 반응형 시험을 확대 증거로 대체하지 않는다. WSL 웹 production 빌드와 컴파일 API 실행은 확인했으나 정식 image 검증과는 구분한다.
- 독립 읽기 전용 리뷰의 최초 Important 1·Minor 2와 재리뷰 Important 1(동시 동일 요청)을 수정했다. 최신 재검토의 확인 가능한 C1 정정 경로에서 새 계산 결함은 발견되지 않았으나 파일 읽기 정체로 전체 PR 차이·Git 인덱스 상태를 끝까지 대조하거나 재시험하지 못했다. PDF 내부 금액·사유·원사건 자동 단언도 없다. 전체 리뷰 PASS로 표시하지 않는다. PR CI 상세, 병합 및 merged-main smoke는 이 본문 작성 시점에는 아직 확인·수행되지 않았다. 실제 발송·PG 실거래·Oracle 배포·사용자 인수시험은 승인된 이번 계획의 대상 밖이다.
- 후속 독립 리뷰어는 base `07e996e`부터 당시 head `f58f9ca`의 변경 26파일 전체를 확인해 Critical 0, Important 2, Minor 1을 보고했다. Important의 시각 역전은 위 RED→GREEN으로 보정했다. 다른 Important인 공유 DB 0022 미적용 상태의 새 API 선연결은 별도 환경 승인·적용/읽기 smoke 전까지 배포·병합하지 않는 순서 제약이다. PDF 내부 근거 자동 단언은 Minor로 남기며, 실제 PDF 추출·렌더의 수동 확인과 구분한다. 최신 제품 수정 뒤 PR/CI와 격리 브라우저 실증은 위와 같이 확인했지만 공유 DB gate, OS 인쇄·확대, 병합·merged-main smoke는 미실행이다.

## 롤백

- 코드 회귀는 병합된 C1 커밋을 새 revert PR로 되돌린다. 이미 기록된 불변 정산 사건·완료 연결을 직접 삭제하거나 역마이그레이션하지 않는다.
- 공유 DB는 0022 미적용이다. 향후 승인 적용 시 백업·복구는 별도 승인 절차를 따르고, 이 PR만으로 공유 DB 복원을 실행하지 않는다.
