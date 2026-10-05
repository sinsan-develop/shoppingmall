# 어울몰 작업현황

## 검증 완료 — 2026-10-06 S5.1 Task2 0015 schema·migration

- **최신 판정: Task2 승인 조건 충족.** 검증 코드 `c488b56f66a7f300e02e5c793b9e1d593e960aad`; RED commit `ca6e48e586e2eb52b6ae4cc9bb821cb8dc895130` 보존. 실제 RED **11/2 pass/9 fail/0 skip** → fresh·upgrade 목표 각각 **17/17 pass/0 fail/0 skip**. 반례104개 거부 및 정상24쌍 수락을 두 snapshot에서 확인했다. writer 로컬 전체 **366/264 pass/102 skip/0 fail**, WSL 전체 **375/275 pass/100 skip/0 fail**, 양쪽 PR본문8/8·0 skip, 전체 typecheck·lint·API/Web build·diff check 성공. WSL 전체는 package scripts와 동등한 명령을 Node24 tmpfs 복사본에서 실행했다. 새 실행 오류0·계약 밖 변경0. skip은 PASS가 아니다.
- **controller 독립 검증·재리뷰:** 최종 기록 `66fd1330b77d9f0d240945db7b793efbcff5eb0a`에서 Windows·승인 SSH origin branch·WSL HEAD 일치와 양 checkout clean, Task2 접두 container/network0을 재확인했다. controller가 같은 SHA에서 `pnpm test` **366/264 pass/102 skip/0 fail** 및 PR본문 **8/8**, 전체 typecheck·lint·build·`git diff --check` exit0을 재실행했다. 최초 I1 리뷰어의 재검토 결과 중첩 PII 우회 해소, SQL/Drizzle 동등, 기존 상태·날짜·택배사·운송장 계약 일치, 실제 DB 반례/정상값 양 snapshot 검증을 확인해 **Critical0/Important0/Minor0·Approved**다. 앞선 읽기 전용 reviewer 1명은 장시간 응답 없이 종료해 검토 도구 오류1회로 기록하며 제품·Git·DB 변경은 없었다. 최종 WSL 문서 fast-forward 첫 명령은 PowerShell 명령 치환 가능성이 있어 증거에서 제외했다(동기화 미실행·변경0). 치환 없는 별도 status로 clean·자원0을 확인한 뒤 명시 ref fetch와 `merge --ff-only FETCH_HEAD`를 실행해 `2ac644c` clean으로 동기화했다.
- **self-review·hash·보존:** SQL/Drizzle snapshot CHECK 정규화 전체 표현식 일치. 수정은 객체/배열/number/boolean 및 잘못된 문자열을 거부하는 기존 값 도메인 검사뿐이며 nullable 3필드/키 부재 허용 유지. SQL 새 SHA-256 `ec41e1ff8281ff53c4fc424245d5f9601f04d001df024b4fa4e111d42f1d19ee`; journal 및 0000~0014 불변. upgrade 기존 schema 정규화 해시 전후 `4f1dc99f7ecd24a6f6e13fa8e6cdc220ffd94d5d3936b5f94ce7084d2b50bc39` 동일, 주문2/환불6관계 각0행 불변. migration16·CHECK19·FK7·PK3 유지. 전체 before/after diff는 ignored task-2-report.md에 보존했다.
- **cleanup0:** 최종 public 관계 전수 집계는 settings 및 기존 home current/draft·shipping global만 각1, 나머지0. 출고/사건/qa_snapshot_event/qa_fulfillment/qa_event 잔류0, PG 영속 mount0·외부 port0·tmpfs1, Node0 확인 후 정확한 private PG와 internal network를 제거해 Task2 접두 container/network/Node 잔류0을 확인했다. 공유 `local-postgres/shoppingmall`은 미접속·미변경. 최종 기록 commit은 검증 코드 대비 WORK_STATUS만 바꾸며 최종 SHA·clean·코드 diff0을 양쪽에서 확인한다. 일반 DB/환경 skip, 기존 영업행 upgrade, API/UI/Task3+, 외부서비스·Oracle/UAT 및 controller 독립 재리뷰는 미검증/별도 절차다.
- Fix Round 1 RED 증거: 선행 시험 commit `ca6e48e586e2eb52b6ae4cc9bb821cb8dc895130`을 지정 origin에 push→WSL clean fetch/ff-only exact SHA에 맞췄다. private PG에 기존0015 fresh 적용 후 schema 시험은 **11건/2 pass/9 fail/0 skip**; 두 snapshot×4키의 invalid 값 거부 8그룹과 부모시험이 실패했고 정상값 수락·기존 제약 시험은 통과했다. 시험행/임시관계 사후0. 반례104개(중첩 객체/배열/number/boolean/잘못된 문자열·날짜·운송장)와 정상24쌍을 고정했다. 이는 예상 RED이며 새로운 실행 오류가 아니다.
- 최소 GREEN 후보: SQL/Drizzle의 기존 snapshot CHECK에만 동일한 타입·값 검사를 추가했다. status는 기존6상태 문자열, 날짜는 기존 YYYY-MM-DD 실제 달력(월별 일수·윤년 포함) 문자열/null, carrier는 기존5코드 문자열/null, tracking은 ASCII 영숫자1~50문자/null; 네 키 모두 부재를 허용한다. 새 값·규칙·열·관계·API 변경0. 새 SQL SHA-256 `ec41e1ff8281ff53c4fc424245d5f9601f04d001df024b4fa4e111d42f1d19ee`. preview/guard6/6·API typecheck·diff check 통과, 실제 GREEN·전체 gate는 후속 검증 대기다.
- **현재 판정 NOT APPROVED:** 독립 리뷰 Important1은 snapshot CHECK가 최상위 키만 제한해 `{"status":{"phone":"..."}}` 같은 중첩 PII를 허용한다는 결함이다. 과거 `DONE_WITH_CONCERNS` 및 `ffbd1a8`은 Task2 최종 PASS가 아니며 아래 기록은 그 시점의 검증 이력으로만 보존한다. PMO 승인 Fix Round 1에서 단일 writer 어울이 실제 PG 반례 RED→snapshot CHECK 최소 보정→fresh/upgrade·전체 gate·self-review·cleanup을 수행한다. 재리뷰 및 승인 판정은 controller가 별도 reviewer로 수행한다.
- 기준: Windows/remote/WSL `ffbd1a84735cd7c43adf81caeecd18baff1afa4d`, 기존 branch/worktree만 사용. 허용 변경은 fulfillment-schema-db 시험, 0015 SQL/Drizzle의 snapshot CHECK, WORK_STATUS 및 ignored 보고서다. rules.ts·계약·기존 migration·API/UI/Task3+는 변경하지 않는다. 자원은 기존 사전 계획과 같은 internal `shoppingmall-s51-schema-1006`, tmpfs `shoppingmall-s51-schema-pg-1006`, 일회용 Node 접두 `shoppingmall-s51-schema-node-1006`만 재생성한다. 생성 전 충돌0·기존 images를 확인하고 성공/실패 모두 외부 port/영속 mount/시험행을 확인 후 정확한 자원만 제거한다. shared DB 미접속·미변경을 유지한다.

## 이전 검증 이력 — 독립 리뷰 I1로 최종 승인되지 않음

- **최종 판정 DONE_WITH_CONCERNS:** 제품·시험 검증 SHA `6a1b8132f106e665a5270cd8b6bd75cec83c4b2a`. 아래 과거 BLOCKED는 승인된 한 줄 보정과 검증 환경 보정으로 해소됐다. WSL private fresh 및 upgrade 목표 각 **7/7 pass·0 skip**, 로컬 전체 **365/264 pass·101 skip·0 fail**, WSL 전체 **365/265 pass·100 skip·0 fail**, 양쪽 PR 본문 **8/8 pass·0 skip**. 양쪽 API/Web/Mobile/contracts typecheck·lint·API/Web build 성공, SQL hash 불변·diff check 성공. WSL은 Node24의 지정 checkout 읽기 전용 mount와 일회용 tmpfs 검증 복사본에서 package scripts와 같은 명령을 실행했다. 이 최종 기록 commit은 검증 SHA 대비 WORK_STATUS만 바꾸며 제품·시험·migration 내용은 동일하게 유지한다.
- **최종 cleanup0:** 사후 public 관계 전체 행수를 확인해 기존 home_content_current/home_content_draft/shipping_policy_global 및 새 fulfillment_settings만 각1, 나머지는 모두0이었다. migration16, 출고/사건/qa 임시관계0. PG 영속 mount0·외부 port0·tmpfs만1, Node 잔류0 확인 후 정확한 private PG `shoppingmall-s51-schema-pg-1006`와 internal network `shoppingmall-s51-schema-1006`를 제거했다. 모든 Task2 접두 container/network/Node 잔류0, tmpfs 검증 복사본도 컨테이너와 함께 폐기됐다. 공유 `local-postgres/shoppingmall`은 **미접속·미변경**.
- self-review·미검증: 이번 승인 보정의 제품 diff는 없고 시험 `$2` 캐스팅 한 줄뿐임을 확인했다. 일반 DB/외부환경 의존 skip은 PASS가 아니며 기존 영업행이 있는 upgrade, 공유 DB 통합, API/UI/Task3+, 실서비스·Oracle/UAT는 미검증/범위 밖이다. schema FK는 실제 catalog로 확인하고 상태/actor/JSON/unique 동작은 실제 PostgreSQL의 원 제약을 복제한 TEMP 관계에서 시험했다. 기존 SQL 오류1·CR 도구 오류1 및 이전 Git 전달 장애 기록은 보존했다. 이번 환경 오류는 sandbox build EPERM1·tmpfs 복사 제외 조건1, 모두 코드 변경 없이 해소했으며 동일 CR/42P08 재발0이다. 상세 명령·수치는 `.superpowers/sdd/2026-10-05-s5-fulfillment/task-2-report.md`에 기록했다.
- **DB GREEN / 보정 commit `6a1b8132f106e665a5270cd8b6bd75cec83c4b2a`:** 승인된 `$2::uuid::text` 한 줄 보정 및 현황만 commit·명시 refspec push했다. Windows/WSL exact SHA·clean 확인 후 private fresh 0000~0015와 fresh 0000~0014→0015 upgrade 각각 schema/preview/guard **7건/7 pass/0 fail/0 skip**. 양쪽 migration16·settings 빈 seed1·fulfillments/events0·시험 temp 관계0. 신규관계3·CHECK19·FK7·PK3·index7 확인. upgrade의 기존 public schema(신규3관계 제외) 해시는 전후 `4f1dc99f7ecd24a6f6e13fa8e6cdc220ffd94d5d3936b5f94ce7084d2b50bc39`로 같고 원주문2/환불6 관계 각0행 불변이다. 기존 영업행이 있는 upgrade는 시험하지 않았다. 0015 SHA-256은 기존 `f6bc8d44faa1cbc0e62f6c8778343d78352a54973f9fb2e6e994f9524ea45c8e` 그대로다.
- 로컬 보정 후 전체 gate: `pnpm test` **365건/264 pass/0 fail/101 skip**, PR 본문 **8/8·0 skip**, `pnpm typecheck`(API/Web/Mobile/contracts), `pnpm lint`, `pnpm build`(API/Web), `git diff --check` 성공. 최초 build1회는 sandbox의 D: dist mkdir EPERM으로 차단돼 지정 worktree 쓰기 권한으로 동일 명령을 실행해 성공했다(코드·설정 변경0).
- WSL 검증 환경 오류1회: 임시 복사 명령의 전역 `--exclude=dist`가 의존성 tsx 실행파일도 제외해 `ERR_MODULE_NOT_FOUND`로 시험 프로세스 시작 실패. 이 실패를 PASS로 세지 않는다. 제품/DB는 수정하지 않고 승인된 일회용 Node tmpfs 복사에서 앱 출력의 정확한 경로 `./apps/api/dist`, `./apps/web/.next`만 제외했다. `WSL_RUNTIME_READY` 성공 후 같은 SHA 전체 gate 진행 중이다. 동일 CR 재발0·42P08 재발0이며 WSL 최종 수치·cleanup은 다음 기록으로 확정한다.
- **명령 전달 재시도 승인·확인:** 직전 경로 조회 도구 오류1회는 SSH 전달 마지막 인수의 CR 문자였다(제품/DB 실패 아님). PMO 승인 후 `ssh WSL-server 'cd /home/daon/deploy/shopping && ls -l node_modules/.bin apps/api/node_modules/.bin/tsc apps/web/node_modules/.bin/next ...'`의 CR 없는 단일행으로 같은 조회를 1회 실행, exit0·두 workspace 실행파일 존재·WSL `2dc963d` clean을 확인했다. 이후 here-string/CRLF 전달을 사용하지 않는다. Windows는 승인된 시험 한 줄과 이 기록만 변경하며 실제 DB GREEN/fresh/upgrade/전체 gate는 아래 후속 결과로 판정한다.
- **PMO 승인 재개 / 단일 writer 어울:** 기준 Windows/remote `2dc963d32969b723e5c4cffc31bbec3d0a502715`. 이전 시험 SQL 오류1회(42P08)의 정확한 최소 보정은 `fulfillment-schema-db.test.mjs`의 `$2::text` → `$2::uuid::text` 한 줄뿐이다. schema·계약·API/UI는 수정하지 않는다. 지정 WSL checkout은 clean에서 명시 ref fetch→ff-only로 기준 SHA에 맞췄다. 기존 자원 이름 충돌0 확인 후 아래 사전 계획과 같은 private network/PG/일회용 Node만 재생성하고 fresh·upgrade·로컬/WSL 전체 gate 뒤 제거한다. WSL 빌드 쓰기는 일회용 Node 내부 tmpfs 검증 복사본에서만 수행하며 지정 checkout은 읽기 전용 mount한다. 새 오류는 재시도 없이 중단 보고한다. 아직 완료 판정 아님.
- **BLOCKED / 2026-10-06 재개 후 중단:** 구현 후보 `3e49732c4d6c58dc32ed0a930f42fee62d8a9cd3` (`feat(s5): add fulfillment persistence schema`)를 명시 refspec으로 push하고 WSL clean checkout을 지정 fetch→ff-only로 동일 SHA에 맞췄다. private 0000~0014→0015 upgrade 성공·migration16, 신규관계3·빈 settings1·fulfillments/events0. 신규3관계를 제외한 public schema dump의 정규화 SHA-256은 전후 모두 `4f1dc99f7ecd24a6f6e13fa8e6cdc220ffd94d5d3936b5f94ce7084d2b50bc39`; 원주문2/환불6 관계는 각0행으로 전후 동일했다. 기존 영업행이 있는 upgrade는 미검증이다.
- 중단 원인·오류1회: 실제 DB 목표+preview/guard **7건/6 pass/1 fail/0 skip**. `fulfillment-schema-db.test.mjs:85`의 사건 INSERT가 `$2`를 UUID와 `$2::text`로 함께 사용해 **42P08 inconsistent types deduced for parameter $2 (text versus uuid)** 발생. 예상한 관계부재 RED와 다른 시험 SQL 오류다. 신산님 지시7에 따라 수정·재시도·추가 Git 작업 없이 중단했다. GREEN·fresh 0000~0015·전체 typecheck/lint/build는 미완료이며 재개 승인이 필요하다.
- 실패 시 정리 완료: 시험 finally ROLLBACK 뒤 accounts/sellers/checkout_orders/shipment_orders/refund_cases/fulfillments/events 및 임시 qa_fulfillment/qa_event 관계 각0, settings는 seed1, migration16이었다. PG mount `[]`, 외부 port `{}`, tmpfs만1, Node runner0 확인 후 정확한 `shoppingmall-s51-schema-pg-1006` 및 internal network `shoppingmall-s51-schema-1006`만 제거, Task2 접두 container/network 잔류0. 공유 `local-postgres/shoppingmall`은 미접속·미변경. 상세 보고서는 `.superpowers/sdd/2026-10-05-s5-fulfillment/task-2-report.md`에 보존했다.
- 재개·단일 writer 어울: Windows `37531dba6496d46b5494aabd2ed15d60c27e0dec`와 WSL RED `2d8abd7724f9d46834c3d82174fb3791aefb9943`의 지정 branch·clean 및 자원 이름 충돌0을 재확인했다. 제한된 fetch 설정을 보존하고 이후 WSL 동기화는 명시 ref fetch 및 `git merge --ff-only FETCH_HEAD`만 사용한다.
- 실제 RED: exact `2d8abd7`의 `node --import tsx scripts/migrate.ts`로 private tmpfs DB에 0000~0014 적용, 이력15·신규관계0 확인. `S5_SCHEMA_TEST_DB_SYSTEM_ID`를 실제 인스턴스와 대조한 `node --import tsx --test apps/api/test/fulfillment-schema-db.test.mjs`는 **1건/0 pass/1 fail/0 skip**, 원인은 `S5 fulfillment migration 0015 not applied`다. 예상 RED는 오류 횟수에 넣지 않는다. PG 영속 mount0·외부 port0, Node는 checkout 읽기 전용 bind만 사용한다.
- GREEN 후보: 0015 SQL/journal/Drizzle에 추가식 3관계와 빈 설정 singleton만 추가했다. 상태·actor·scope·fingerprint·JSON object/허용 키·FK·unique·조회 index를 정의했다. 판매자 자동선택·영업주문 backfill 없음. SQL SHA-256 `f6bc8d44faa1cbc0e62f6c8778343d78352a54973f9fb2e6e994f9524ea45c8e`.
- 로컬 검증: migration-preview/order-schema-guard **6/6 pass·0 fail·0 skip**, API typecheck exit0, `pnpm test` **365건/264 pass/0 fail/101 skip**, PR 본문 **8/8 pass·0 skip**, `git diff --check` exit0. skip은 PASS에 포함하지 않는다. 재개 후 예상 밖 실행 오류0. 다음은 후보 exact commit push→private upgrade/fresh 실제 DB 검증→전체 정적 gate→정리·최종 기록이다. 공유 DB는 미접속·미변경이며 API/UI/Task3·실서비스·Oracle는 미검증/범위 밖이다.
- 기준·범위: Task1 최종 `7f04eb9692df4eae583184b00d2f5ebacd430407`에서 PMO가 Task2 전용 새 단일 code-writer 1명 배정을 승인했다. 계획의 `0015_s5_fulfillment.sql`, journal, Drizzle schema, fulfillment schema DB 시험, migration preview/order schema guard와 `WORK_STATUS.md`만 수정한다. 승인된 추가식 3관계·FK/check/unique/index·빈 singleton seed·nullable 담당자·version·PII 비저장/멱등 제약만 구현하며 Task3 이후·API/UI·공유 DB 쓰기·외부 서비스는 제외한다.
- 격리 시험 자원 사전 계획: `WSL-server` Docker의 기존 `pgvector/pgvector:0.8.2-pg15`와 `node:24-bookworm-slim` 이미지만 사용한다. 전용 비공개 네트워크 `shoppingmall-s51-schema-1006`, tmpfs PostgreSQL `shoppingmall-s51-schema-pg-1006`, 일회용 Node 접두 `shoppingmall-s51-schema-node-1006`, 내부 DB `shoppingmall`을 사용한다. 외부 공개 포트·영속 볼륨·실사용 자료는 0이며, 수명은 Task2 RED→GREEN·fresh 0000~0015·0000~0014→0015·전체 목표 회귀까지다. 완료·실패·중단 시 정확한 컨테이너·네트워크만 제거하고 이름·mount·공개 포트·시험행 잔류 0을 확인한다. 공유 `local-postgres/shoppingmall`은 적용·QA 쓰기 대상이 아니다.
- 환경 사전 확인: Windows에는 `docker` 명령이 없고, 승인 SSH 별칭 밖 첫 sandbox 조회는 alias를 읽지 못해 1회 실패했다. 승인된 `ssh WSL-server`로 재확인한 Docker Server는 29.1.3이며 위 접두 컨테이너·네트워크와 임시 포트 55435 점유는 0이다. 동일 근본 원인 반복은 없다.
- RED 전달 장애 1회: 시험 선행 commit `2d8abd7724f9d46834c3d82174fb3791aefb9943`은 승인 SSH origin branch에 push됐다. WSL 지정 checkout의 `origin` fetch refspec이 과거 두 branch에만 제한된 상태에서 새 remote ref를 직접 fetch한 뒤 `checkout --track`을 선택해 실패했고, HEAD는 `main@94af5e8`인 채 branch 차이 10파일이 index/worktree에 staged로 남았다. writer는 즉시 모든 쓰기를 중단했으며 Docker/network 생성0, 공유 DB 미접속·미변경이다. controller의 읽기 전용 `git diff --cached --exit-code 2d8abd7`·`git diff --exit-code 2d8abd7`는 모두 0, unstaged/untracked0, remote ref=`2d8abd7`로 확인돼 파일 내용은 정확한 RED tree와 같다. reset/clean/restore 없이 HEAD만 같은 tree로 맞추는 `git switch -c codex/s5-fulfillment-engagement --no-track 2d8abd7` 복구와 동일 writer 재개를 PMO에 요청했고 승인 전 상태를 보존한다.
- WSL checkout 복구 완료: PMO가 위에서 특정한 정확한 1회 복구 명령을 승인했다. 실행 직전 root·동명 local branch 부재·commit 객체 존재·index/worktree가 `2d8abd7` tree와 정확히 같음·unstaged/untracked0·staged 10파일을 다시 확인했다. `git switch -c codex/s5-fulfillment-engagement --no-track 2d8abd7724f9d46834c3d82174fb3791aefb9943`을 한 번 실행한 뒤 WSL HEAD=`2d8abd7`, branch=`codex/s5-fulfillment-engagement`, status clean, tree 차이0을 확인했다. Task2 접두 Docker container/network는 각0이고 공유 DB는 접근·변경하지 않았다. 제한된 `origin.fetch` 설정은 바꾸지 않았으며 이후 WSL 동기화는 명시 ref fetch와 clean 상태의 fast-forward만 사용한다.

## 검증 완료 — 2026-10-06 S5.1 Task1 순수 계약 GREEN

- 담당: 어울, 단일 복구 code-writer. 기준 `codex/s5-fulfillment-engagement@505132945ff9fe1d6f422ceb1a702ed2e5a954e3`; Task1만 수행. 이전 writer의 미추적 RED 파일을 보존·인수하고 Windows 모듈 URL을 `rulesPath.href`로 보정했다.
- RED checkpoint: 집중 시험 6건/0 pass/6 fail/0 skip. 실패는 승인된 `rules.ts` export 미구현이며 `file:///D:/D:/...` 경로 오류는 없었다.
- GREEN: DB/외부 상태 없는 `apps/api/src/fulfillment/rules.ts`에 판매자 전이, 관리자 정정, 서울 기준 잠정 예상일, 운송장 정규화, 고정 택배사 일반 조회 URL을 구현했다. 입력 허용 필드·상태별 필수/금지값, 문구 길이, 날짜를 검증하고 방어 경계 시험 1건을 추가했다.
- 변경 파일: `apps/api/src/fulfillment/rules.ts`, `apps/api/test/fulfillment-rules.test.mjs`, `WORK_STATUS.md`. 상세 기록은 git-ignored `.superpowers/sdd/2026-10-05-s5-fulfillment/task-1-report.md`.
- 검증: 집중 시험 **7건/7 pass/0 fail/0 skip**; `pnpm --filter @shoppingmall/api typecheck` exit 0; `pnpm test` 주 시험 **362건/262 pass/0 fail/100 skip**, PR 본문 시험 **8건/8 pass/0 fail/0 skip**. skip은 PASS에 넣지 않았다.
- 오류 횟수: 구현 중 시험·typecheck 실패 0. RED 6 fail은 의도된 선행 상태다. 미검증: Task2, schema/0015 migration, API·권한·거래 결합, private/공유 DB, 실제 브라우저·WSL·Oracle. 이 Task1 시험은 그 범위의 완료 근거가 아니다.
- Fix Round 1 (독립 리뷰 Important 1건): 관리자 정정의 명시적 `corrected.status=null`이 기존 상태로 대체되는 결함을 확인했다. 회귀 시험 추가 후 RED **8건/7 pass/1 fail/0 skip** (`Missing expected exception`), 필드 생략만 기존 상태를 쓰도록 한 줄 보정 후 GREEN **8건/8 pass/0 fail/0 skip**. API typecheck exit 0, `pnpm test` 주 시험 **363건/263 pass/0 fail/100 skip** 및 PR 본문 **8건/8 pass/0 fail/0 skip**, `git diff --check` exit 0. skip은 PASS에 포함하지 않는다. 수정 파일은 `apps/api/src/fulfillment/rules.ts`, `apps/api/test/fulfillment-rules.test.mjs`, `WORK_STATUS.md`; Task2/DB/API/UI 검증은 여전히 미수행.
- 다음 조치: Task1 커밋을 기준으로 후속 Task2는 별도 지시와 해당 범위에 따라 진행한다.

## 진행 중 — 2026-10-05 S5.1 출고 계약 승인 준비

- 현행 구조 대조 판정: 직접발송 `shipment_orders.seller_id`는 담당 판매자를 가지지만 공동출고 `owool_fulfillment`는 의도적으로 NULL이라, 표시명이나 품목 생산자를 기준으로 어울몰 판매자를 추측하면 권한 오배정이 생긴다. 현재 주문/결제 상태는 `PENDING_PAYMENT|EXPIRED|PAID`뿐이고 출고·운송장 영속 관계는 없다. 승인된 배송정책은 `cutoffTime`을 제공하지만 영업일/공휴일 달력은 없다.
- 계약 초안: `docs/design/S5_FULFILLMENT_CONTRACT_DRAFT.md`에 관리자 지정 공동출고 담당 판매자, 주문 생성 시 담당자·마감시간 snapshot, `PAYMENT_PENDING→READY→PACKING/DELAYED→SHIPPED`와 전량 환불 `CANCELLED`, 고객 즉시 운송장 표시, 관리자 before/after·사유·고객 안내 정정, 출고 전 환불 결합을 정의했다. 직접발송은 판매자 유효정책, 공동출고는 S3와 같은 전역정책을 스냅샷하여 기존 금액·정책 선택 규칙을 바꾸지 않는다. 주말·공휴일 미반영을 명시하고 실 택배사 자동 동기화·실 알림·S5.2는 제외했다.
- 승인 경계: 제안은 0015 추가식 3관계, 인증 API 8개와 기존 고객 주문 상세 확장, 담당 판매자의 기존 주문 배송지 최소 노출, 주문/결제/환불 거래 결합을 포함한다. 아직 SQL·제품 코드·공유 DB·QA 자료·외부 서비스는 변경하지 않았다. 문서 checkpoint 뒤 PMO에 정확한 영향·검증·복구와 함께 격리 구현 승인을 요청한다. 공유 개발 DB 0015 적용은 SQL 해시·행수·백업/복원·정리 계획을 갖춘 별도 승인 경계로 유지한다.
- PMO 판정: checkpoint `c4860af` 계약 범위의 **격리 구현·시험 승인**. 이어 공식 사이트를 확인해 네 택배사의 일반 배송조회 입력 페이지를 서버 고정 allowlist로 제공하는 보완안을 승인받았다. 링크에는 운송장/고객정보를 넣지 않고 `other`는 null이며, 화면은 새 창과 직접 입력 안내를 사용한다. 특정 운송장 자동조회·택배사 API는 미구현이다. 출고일은 영업일 근거가 없어 “잠정 예상일/휴무일 미반영”으로만 표시하고 완료 전에 후속 권장안을 재보고한다. 공유 DB 0015 적용·실 외부서비스·Oracle/UAT·S5.2/S6는 계속 별도 경계다.
- 실행계획: `docs/superpowers/plans/2026-10-05-s5-fulfillment.md`에 RED→0015 private DB→주문/결제→판매자/관리자 API→고객/환불→역할별 UI→fixture/브라우저→전체 gate/review→공유 적용 별도 승인→PR/정리 순서를 고정했다. Stage 단일 code-writer와 읽기 전용 reviewer 원칙을 적용한다. 읽기 전용 연결 지도 조사에서 존재하지 않는 `apps/api/src/auth/access.ts`를 1회 요청했으나 실제 파일 `apps/api/src/access.ts`를 찾아 후속 조사했고 코드·DB 변경은 없었다.
- 단일 writer 인수 장애: Rawls는 파일/보고/응답 없이 종료, Nash는 미추적 `apps/api/test/fulfillment-rules.test.mjs`만 작성한 뒤 응답 없이 종료, PMO가 허용한 세 번째 Confucius는 계약을 읽고 동일 RED를 재현했으나 GREEN/보고서/commit 없이 최종 상태 요청에서 BLOCKED를 반환해 종료했다. controller 확인 RED는 **6 tests/0 pass/6 fail**, 모두 승인된 `rules.ts` export 미구현 원인이다. 동일 writer 진행 장애3회로 추가 배정을 중단했고, PMO 최신 지시에 따라 controller가 제품 코드를 대신 작성하지 않는다. RED 파일은 보존, tracked 제품 코드·DB·HEAD 변경0이며 Task1/S5.1은 미완료다. 정확한 원인·영향·재배정 외 대안을 PMO에 재보고한다.
- 읽기 전용 시험 정합 조사: 미추적 RED의 시간대 독립성 하위 실행이 Windows에서 `rulesPath.pathname`을 `pathToFileURL`로 다시 변환해 `file:///D:/D:/...`를 만드는 결함을 실제 출력으로 확인했다. 구현 파일 부재 시에는 앞선 export 오류에 가려지지만 GREEN 뒤 올바른 구현도 모듈 미발견으로 실패한다. 다음 승인된 단일 writer는 `rulesPath.href`를 직접 사용하도록 시험을 고친 뒤 RED→GREEN을 수행해야 한다. controller는 제품·시험 파일을 수정하지 않았다. 지연 로딩된 multi-agent 도구를 확인한 뒤 bounded 읽기 전용 agent Euclid(`01a10cb7-2824-7c81-a38d-f81388dff402`)가 같은 branch·`eda21af7982935e842cb87059af5e6c9da02467a`에서 이중 `D:`를 독립 재현하고 변경 0으로 정상 완료했다. Task1 제품 구현 재개는 PMO의 정확한 단일 writer 지정 전까지 보류한다.

## 진행 중 — 2026-10-05 S5 Stage 착수·S4 병합 정합

- 판정·기준선: PMO가 S4 개발/mock 범위 완료 보고를 접수했다. PR [#12](https://github.com/sinsan-develop/shoppingmall/pull/12)는 승인된 최종 branch head `ccf52a4a9d3d18aeb6c47e8a3e8486c996e03c5e`와 같은 tree `f0ed96717f3787a44b28d35ecda780bb22338054`로 `main@94af5e853b1019130ea9fc043519f8f91b07297b`에 squash 병합됐다. 원격/Windows/WSL의 S4 branch·요청 tag와 Windows S4 worktree를 정리했고, Windows·WSL checkout은 같은 `main@94af5e8`이다.
- S4 최종 증거: exact PR head에서 로컬 355건/255 pass·100 환경 skip·0 fail, WSL 공유 DB 356건/336 pass·20 조건부 skip·0 fail, 양쪽 PR 본문 8/8·typecheck/lint/build 성공, 독립 리뷰 Critical0/Important0/Minor0. merged main 재검증은 Windows 전체 358건/258 pass·100 환경 skip·0 fail 및 PR 본문8/8, typecheck 성공, WSL Node24 핵심7/7이다. 공유 `local-postgres/shoppingmall` 시험 자료 14범주0, migration15와 기존 home current/draft·global shipping singleton 각1을 유지한다. 실제 PG·Oracle/UAT·200% 확대와 최종 fixture 보정 뒤 브라우저 재실행은 미검증이다.
- 정리 중 환경 보정: Windows main checkout의 과거 migration 0000~0012가 `.gitattributes` 도입 전 CRLF로 남아 해시 시험1건이 실패했다. Git HEAD archive의 LF blob 해시를 확인해 작업 파일만 동일 원본으로 재전개하고 추적 diff0·전체 시험0 fail을 확인했다. 코드·DB 변경은 없다. S4 worktree의 사용자 소유 미추적 `apps/web/AGENTS.md`·`CLAUDE.md`는 정본 root에 해시 동일 보존했다. 기존 `legacy-onedrive/`와 함께 임의 커밋·삭제하지 않는다.
- S5 작업 위치·기준선: 최신 `origin/main@94af5e8`에서 단일 branch `codex/s5-fulfillment-engagement`, 격리 worktree `D:\Project\shoppingmall2\.worktrees\s5-fulfillment-engagement`를 만들었다. root `AGENTS.md`는 존재하지 않아 PMO `AGENTS.md`와 승인된 `docs/design/DESIGN.md`, `docs/WORK_PLAN.md`, 이 파일, `docs/DEVELOPMENT_ENVIRONMENT.md`를 적용한다. 잠금파일 설치는 다운로드0·재사용643으로 완료했고 기준선 `pnpm test`는 355건/255 pass·100 환경 skip·0 fail, PR 본문8/8이다.
- 첫 절편 S5.1: S4의 `PAID` 주문/발송 snapshot을 선행 입력으로 판매자 담당 주문 상태 필터, 포장·출고, 택배사·운송장, 마감 후 다음 출고 가능일, 지연 안내, 관리자 사유 있는 정정을 구현한다. 타 판매자 출고 거부·운송장 고객 즉시 표시·정정 전후/안내를 RED→GREEN으로 고정한다. 자동 택배사 동기화·실제 발송·실 문자/메일/푸시·Oracle/UAT는 이번 개발 PASS 밖이다.
- 승인 경계·다음 조치: 아직 S5 제품 코드·DB·공유 QA 자료·외부 서비스는 변경하지 않았다. 현행 주문/API/schema와 S5.1 계약을 대조하고 무상태 RED를 먼저 작성한다. 신규 공개 API·schema/migration·고객정보/증빙 저장·권한·알림 credential/실비용은 정확한 계약·영향·검증·rollback을 PMO에 보고해 별도 승인받은 뒤 적용한다. fixture는 별도 private tmpfs PostgreSQL·가상 운송장만 사용하고 이름·수명·정리 대상을 생성 전에 기록한다.

## 검증 완료·PR 진행 — 2026-10-05 S4 QA 후발 결제사건 경합 보정

- 담당 어울/단일 writer, `codex/s4-payment-refund` 기존 worktree만 사용. 최종 후보 **`b04d3824a312c8f44ec4bf3f247dad240a43e930`**은 공유 QA reset의 첫 문장에 `READ COMMITTED`를 고정하고, 비결제 fixture 정리 뒤 `payment_events` 잠금을 payment row 잠금보다 먼저 얻는다. 잠금 아래 교차 주문 conflict·외부 payment event 역참조를 다시 검사하고 이상 시 전체 rollback한다. 새 공개 API/schema·공유 DB seed·실 PG·Oracle·S5.2 없음. `apps/web/AGENTS.md`·`CLAUDE.md` 소유 불명 untracked 보존.
- 실DB RED/GREEN: 사전검사 뒤 외부 시도의 `verified_order_id=QA 주문` 사건이 들어오면 기존 reset이 거부하지 않는 RED를 확인했다. fresh 0000~0014 tmpfs PostgreSQL에서 외부 identity/장바구니, 기존·후발 결제/환불 conflict, 외부 프로모션 allocation, 후발 예약·배송행, 동시 QA payment event와 외부 payment event 역참조를 포함한 최종 **3 pass/0 skip/0 fail**. 사후 계정·상품·주문·감사 4범주0. 영속 mount0·공개 port0의 정확한 `shoppingmall-s4-fixture-pg-1005`와 `shoppingmall-s4-fixture-1005`만 제거해 이름 잔류0.
- exact SHA gate: 제품·시험 코드 `b04d382`에서 Windows 로컬 **355 tests/255 pass/100 DB·환경 skip/0 fail**, PR본문 **8/8**, 전체 typecheck/lint/build exit0. WSL 지정 checkout·공유 `local-postgres/shoppingmall` 순차 **356 tests/336 pass/20 조건부skip/0 fail**, PR본문 **8/8**, 일회성 쓰기 복사본의 API/Web/Mobile/contracts typecheck·lint·API/Web build exit0. 이 최상단 기록을 포함한 최종 docs-only HEAD도 같은 명령의 종료코드0으로 재검증한다. WSL checkout 동일 SHA·clean이며 skip은 PASS로 세지 않는다.
- 보존·리뷰·매뉴얼: 공유 DB의 환불 QA accounts/identities/sellers/products/cart/reservations/orders/payment attempts/events/refund cases/attempts/events/audit/sessions **14범주 각0**, migration15, 기존 `home_content_current`·`home_content_draft`·`shipping_policy_global` 각1 유지. 독립 최종 리뷰는 `b04d382`를 정적 대조해 **Critical0/Important0/Minor0**. `docs/S4_DEVELOPMENT_TEST_GUIDE.md`의 `/login`→`/cart`→`/account/admin/refunds`, 모의결제·부분3333원/잔여8667원·실PG 제외 문구를 현재 화면 코드와 대조해 일치했다.
- 오류 기록: 세션 인수 중 모델 용량 오류 재발1회는 PMO 지시로 같은 branch에서 복구. 의도한 경합 RED와 잠금 순서 변경 뒤 과거의 ‘초기부터 대기’ 기대 2건은 최종 재검사·외부행 보존 기준으로 고쳐 GREEN. WSL 일회성 빌드의 잘못된 TypeScript 경로1회는 실제 workspace bin으로 재실행해 통과. PowerShell SQL 인용 오류2회는 DB 전달 전 실패했으며 표준입력 방식으로 재조회했다. 제품·공유 DB 손상 없음. 기존 실제 Chrome 결제·환불은 `cfe1fc8`의 화면 증거이고 이번 fixture 전용 보정 뒤 재실행하지 않았다. 다음은 PR 목적·영향·검증·미검증·복구 기록→병합→merged-main smoke→branch/worktree 정리다.

## 진행 중 — 2026-10-05 S4 QA 정리 안전성 최종 재검증

- 담당 어울/단일 writer, 기존 `codex/s4-payment-refund`와 지정 WSL checkout 유지. 새 공개 API·schema·공유 DB 재시드·실 PG·Oracle·S5.2는 범위 밖. `apps/web/AGENTS.md`·`CLAUDE.md`의 소유 불명 untracked는 보존했다.
- 첫 독립 리뷰 Critical2를 고친 뒤 두 번째 리뷰의 Important2(시험 계정 예약에 외부 상품 옵션, 시험 작성자의 외부 대상 또는 외부 작성자의 시험 대상 감사 이력)를 확인했다. 격리 tmpfs PostgreSQL에 0000~0014를 적용해 외부 옵션 예약이 잘못 정리되는 RED 0/1을 실측했고, 매니페스트의 정확한 예약·옵션 소유권 및 양방향 감사 대상 사전검사·선별 삭제 후 GREEN 1/1을 확인했다. 외부 identity·장바구니·후발 FK 삽입 보호도 같은 시험에 포함됐다.
- 추가 독립 리뷰는 Critical0/Important2(감사 테이블 잠금 전 트랜잭션 스냅샷 경합, 매니페스트 배송 ID·판매자/옵션 소유권 누락)를 보고했다. 다른 판매자의 배송행이 시험 주문에 붙어도 정리가 진행되는 RED 0/1을 전용 DB에서 확인했다. 잠금을 첫 DB 읽기 전에 옮기고 원래 배송 ID 및 모든 시험 주문의 발송·배송행을 상품/옵션/판매자와 대조했다. 외부 감사 작성자가 미커밋 상태인 동안 reset이 실제 `audit_events` 잠금에서 대기한 뒤 커밋을 관찰하고 거부하는 시험을 추가했다. 최종 코드 후보 `9d2c5e5`의 격리 시험 1 pass/0 skip/0 fail, 사후 계정/상품/주문/감사 4범주0. 시험 DB는 외부 포트·영속 mount 없는 정확한 `shoppingmall-s4-fixture-pg-1005`이며 아직 정리 전이다.
- 중간 SHA `05b18c3`의 로컬 전체 352건/254 pass/98 환경 skip/0 fail·PR 본문8 pass 및 타입/린트/빌드 exit0, WSL 공유 DB 전체 353건/335 pass/18 조건부 skip/0 fail·PR본문8 pass, 사후 계정/상품/주문/환불/감사5범주0은 **그 SHA의 증거**다. 최종 후보 `9d2c5e5` 또는 이후 문서 SHA의 전체 gate 통과로 바꾸어 기록하지 않는다. 종전 공유 실제 Chrome E2E는 `cfe1fc8`의 증거이고, 환불 UI/공개 API 수정 없이 QA 정리 안전성만 보정했다.
- 오류/수정: 잘못된 Git 원격 이름 사용 1회는 실제 `origin`이 승인된 SSH 별칭 URL임을 확인해 정상 push로 해결. 첫 RED 시험의 실패 원인을 finally FK 정리 오류가 가린 1회는 disposable DB 전용 처리로 수정하고 같은 반례의 실제 `Missing expected rejection`을 재확인했다. 배송행 시험이 존재하지 않는 `id`를 가정한 초안은 스키마 대조 뒤 복합키로 고쳤다. 제품/공유 DB 손상 확인 없음.
- 남은 조건: 최종 문서 commit과 동일 SHA의 로컬/WSL 전체 test·typecheck·lint·build, 독립 리뷰 Critical0/Important0, 공유 DB QA 전수잔류0, 수동 안내 대조, PR 목적·영향·검증·미검증·복구 기록, 병합·merged-main smoke·안전한 branch/worktree 정리. 실제 PG·Oracle·사용자 인수/출시와 200%·키보드·인쇄는 이 Stage 증거가 아니다.

## 진행 중 — 2026-10-05 S4 공유 QA reset 독립 리뷰 보정

- 로컬 최종 후보 전량 `pnpm test` **352건/254pass/98skip/0fail**와 PR본문8/8, 전체 `pnpm typecheck/lint/build` exit0. 98skip은 로컬 DB/환경97+새 private tmpfs 경합1이며 PASS로 세지 않았다. 새 경합1건은 위 WSL 전용 tmpfs 실행에서 별도로 1pass/0skip/0fail이다. 브라우저는 앞선 SHA의 실제 화면 증거이며 보정은 fixture 전용이라 제품 UI/API 공개코드는 변하지 않았다.
- 보정 실DB 증거: checkpoint `9d5b43ca66566fccd14750abcb1f133b53afd63f`를 WSL 지정 checkout에 맞춰 전용 네트워크 `shoppingmall-s4-fixture-net-1005`의 tmpfs `shoppingmall-s4-fixture-pg-1005`(영속 mount0·공개 port0)에 0000~0014 migration15건을 적용했다. **격리 DB 목표1/1 pass·0skip·0fail**: QA 고객 계정에 외부 Kakao identity가 붙으면 reset 거부/원주문 보존, 외부 계정 장바구니 참조가 있으면 reset 거부/장바구니 보존, 사전검사 뒤 다른 계정이 삽입하는 경합은 option FK 부모 `FOR UPDATE` 잠금에 실제 대기했다가 QA reset commit 뒤 FK 오류로 실패, 외부 계정은 남고 QA 계정은 0. 시험 뒤 격리 accounts/cart/orders/products/refunds 5범주0, 공유 accounts/orders/refunds 3범주0을 재조회했다. 정확한 tmpfs 컨테이너·전용 네트워크 제거 및 잔류0, 실패/오류0. 이 실DB 시험은 브라우저 재실행·실 PG 검증이 아니다.
- 남음: 위 실DB 실행 이후 시험의 10초 대기 타이머만 정리한 코드 변경을 최종 commit으로 동기화하고 동일 SHA 전체 로컬/WSL gate·독립 재리뷰를 수행한다. 이전 reviewer Critical 2건은 수정 후보와 실DB 증거가 있으나 독립 재검토 전에는 해소 판정하지 않는다. 사용자 매뉴얼 대조·Stage PR/병합도 미완료.
- 독립 reviewer Volta는 `3392ed4..6bb25ed`의 공유 fixture를 읽기 전용 검토해 Critical 2건(외부 계정에 QA 이메일을 붙였을 때 과도 삭제, 외부 참조 사전검사와 삭제 사이 경합)·Important 2건(해당 안전성 시험 부족, 브라우저 스크립트 단독으론 DB 대조/정리 재현 불가)을 보고했고 **병합 보류**를 권고했다. PMO에 즉시 보고했고 같은 기존 branch에서 전용 fixture 보호 보정·격리 DB 경합 시험→독립 재검토→exact SHA 전체 gate 후 병합 판단을 지시받았다. 공유 DB의 정리 후 14범주0과 기존 브라우저 PASS 기록은 당시 증거로만 보존한다.
- 보정 중: 공유 reset은 생성 시 반환한 정확한 account/seller/product/revision/option/address/order UUID manifest가 없거나 현재 행과 다르면 삭제 전에 거부한다. QA 계정의 다른 identity·역할·주소·상품 revision/작성자·외부 환불/주문 actor를 거부하고, 계정/판매자/상품/revision/option FK 부모를 잠가 후발 외부 참조를 차단한다. 장바구니·찜·재입고 등 삭제에는 QA account 조건을 추가했다. isolated 기존 경로는 유지한다. 명세 없는 공유 DB 재시드나 새 API/schema는 없다.
- RED: manifest 검사 export가 없어서 목표시험 실패. 보정 후 로컬 목표6/6 PASS·API typecheck PASS, 별도 private DB 외부 identity/장바구니/후발 삽입 경합 시험은 파일 작성만 했고 아직 **실DB 미실행**이다. 최종 검증·재리뷰·S4 PR/병합은 미완료. 앱/웹의 소유 불명 untracked는 보존한다.

## 진행 중 — 2026-10-05 S4 공유 개발 DB 실제 브라우저 E2E

- 정식 공유 브라우저 E2E 자체 판정 **PASS**: 제품/QA 보호 SHA `cfe1fc8f808b7d7ec7e8fdbb77f1b27a1adaf3e6`에서 WSL 지정 checkout/API/Web와 Windows 루프백 Chrome을 연결했다. 고객이 기존 PAID 주문 수량1 부분 취소→관리자 모의 환불 3,333원(배송0), 잔여 수량2 전량 취소→관리자 모의 환불 8,667원(상품6,667+실납 배송2,000)을 실제 화면에서 완료했다. 원주문은 PAID/상품12,000/상품할인2,000/배송3,000/지원1,000/납부12,000 불변. 새 고객 주문은 모의 결제 거절→지연→승인 결과 응답 유실 주입 뒤 같은 버튼 재시도로 PAID가 되었고, 결제시도는 APPROVED2(원시드 포함)/DECLINED1/PENDING1·결제사건3, 주문 PAID2(원시드 포함)이다. 실제 카드/PG 승인이 아니다.
- 390px Chrome은 document/viewport 각각390으로 가로 넘침0. `D:\tmp\shoppingmall-s4-e2e-evidence-1005`의 8장 PNG를 보존했고 모바일/관리자 화면을 육안 확인했다. 단, 모바일 캡처의 장바구니 초기 로딩 문구가 남아 있어 스크립트를 완전 로드 후 캡처하도록 보정했으며 해당 새 캡처는 아직 재실행 미검증이다. 1920/1440/430·키보드·인쇄와 실제 200% 확대를 이 실행의 PASS로 쓰지 않는다(200%는 UAT-03).
- 가상 QA `e4231005` reset은 **계정3·주문2·상품1**만 반환했고, 공유 DB의 accounts/identities/sellers/products/cart/reservations/orders/payment attempts/events/refund cases/attempts/events/audit/sessions **14범주 각0**을 재확인했다. Windows Chrome PID10·전용 프로필·DPAPI 시험비밀번호·SSH 터널, WSL 전용 API/Web 컨테이너와 `/tmp/shoppingmall-s4-e2e-next-1005` 캐시를 제거했다. WSL `next-env.d.ts`는 dev 서버가 `/.next/dev`로 자동 수정한 정확한 diff만 확인하고 HEAD로 복구하여 clean·포트9091/9092 비점유. 공유 0014/기존 singleton은 유지. 서비스 준비 전 초기 API curl000 1회(추후 200 확인), 웹 기존 root 소유 캐시 lock 실패 1회(전용 캐시로 해결), 임시 컨테이너 제거에서 이미 자동 삭제된 API를 다시 찾은 오류 1회(잔류0), 읽기전용 SQL `created_at` 오타 1회(`requested_at` 재조회) 기록. 제품 기능 실패0.
- 남은 게이트: 이번 브라우저 QA 스크립트와 기록의 커밋·WSL exact SHA 전체 test/typecheck/lint/build·독립 리뷰·사용자 매뉴얼 대조·Stage PR/병합/merged-main smoke. 최종 사용자 인수, 실 PG, Oracle, S5.2는 미실행. 추가 공유 DB 쓰기/새 API/schema/새 branch는 하지 않는다.
- 담당 어울/단일 writer, 기존 `codex/s4-payment-refund`와 WSL 지정 checkout `3392ed42aacad64f3f08cc8133ac826e795df93b` 동일·clean. PMO 지시는 S4 공유 브라우저 결제 성공/거절/미확정 재시도와 관리자 출고 전 부분·전량 환불을 확인하고 필수 회귀·독립 리뷰·매뉴얼 확인까지 진행하는 것이다. S5.2·새 API/schema·실 PG·Oracle·새 branch는 제외한다.
- 가상 QA ID `e4231005`: `qa+e4231005-refund-{customer,seller,admin}@example.invalid` 3계정, `qa-e4231005-refund-ui` 판매자/판매자분류/상품분류, 고추 상품 1개·옵션1개·초기 PAID 주문1개를 생성한다. 고객 UI 결제 주문은 합계 최대 4개까지만 허용하며, 다른 계정이 QA 상품·주문을 참조하면 reset을 거부한다. 상품명/계정은 재사용하지 않고 종료 즉시 해당 ID의 시험 행만 트랜잭션으로 정리한다. 생성 전 공유 DB 계정0 확인. 비밀번호·DB URL은 Git/문서/출력에 남기지 않는다.
- 공유 fixture 보호: 기존 격리 DB 전용 경로는 유지하고 정확한 `shoppingmall` DB와 run ID 일치 opt-in만 별도 허용했다. 보호검사 구현 전 RED(내보낸 함수 없음), 구현 후 2/2 PASS, API typecheck PASS. 이 결과만으로 공유 DB/브라우저 E2E를 통과했다고 하지 않는다. 기존 `apps/web/AGENTS.md`·`CLAUDE.md`는 소유 불명 untracked로 보존한다.
- 다음: reset의 외부 참조 거부를 격리 DB에서 검증 → WSL exact SHA에서 임시 API/Web 실행 → 공유 DB 시험자료 생성·실제 Chrome 고객/관리자 시나리오 → 금액·상태·잔존자료 대조 및 선택적 정리 → 전량 회귀·독립 리뷰. 오류 횟수: 초기 시험 명령 로더 누락1회(정상 로더 재실행), WSL 읽기전용 inspect 출력 필드 불일치1회(계정0 확인, 서비스 주소 재조회 필요), 기능 실패0.

## 완료 — 2026-10-05 S4.2 공유 개발 DB 0014 적용·자동 회귀

- 완료 범위는 PMO 승인 A안의 공유0014 적용·목표/전체 **자동회귀**뿐이다. exact HEAD `cd10cbabffe1bade46245b70f2feabc565e77eaa`(제품은 `2a61f32`와 동일)에서 목표 **12/12 pass·0skip·0fail**, 공유DB 연결 루트 전체 **347건/330 pass/17조건부skip/0fail**, PR본문8 pass, outer exit0을 확인했다. 17skip 내역은 아래 Task6와 같으며 새 PASS로 치환하지 않았다. 테스트의 의도한 잘못된 배송정책 입력에서 Nest 예외로그가 출력됐지만 해당 rollback 시험이 PASS였고 실제 실패0이다.
- 최종 DB 읽기전용 전수행수: public50관계 중 **47관계0**, 기존 singleton `home_content_current`·`home_content_draft`·`shipping_policy_global`만 각1. 신규환불6관계/원주문·결제·계정·상품·세션·감사·쿠폰/QA자료0, Drizzle15이력 유지. 승인된 schema/기존서비스는 유지했다. 임시 runner0, 공개포트/새volume/상시mock서버 생성0. 검증 성공 뒤 정확한 백업 해시/경로를 재확인해 WSL·컨테이너 내부 `/tmp/shoppingmall-s42-0014-pre-20261005.dump` **두 사본만 삭제·부재 확인**했다. 이 시험용 백업은 더 이상 복구본으로 존재하지 않으며 다른 백업/자료는 변경하지 않았다.
- 보존 증거: `D:\tmp\shoppingmall-s42-shared-target-1005.log`, `D:\tmp\shoppingmall-s42-shared-full-1005.log`, 아래 사전 백업 해시·적용이력. 제품 코드/SQL 추가 변경 없음. 정식 공유DB **실제 브라우저** 성공/실패/재시도·환불 E2E는 아직 미검증이며, 앞선 Chrome 결과는 격리DB 자체QA다. 실PG·외부비용·Oracle·S5.2·S4 Stage PR/병합·최종 사용자 인수도 미실행이다. 다음은 이 결과를 PMO에 보고하고 S4의 남은 공유 브라우저 통합/Stage 판정 실행 범위를 지시받는다.

### 승인·적용 진행 이력

- 적용 완료/전체 회귀 진행: exact HEAD `cd10cbabffe1bade46245b70f2feabc565e77eaa`의 정식 WSL checkout clean, running 컨테이너 `local-postgres` ID `99f3bf939d40c265f44bc330fb143675ecad96c9ab27bd517500ef04eaa2506c`, DB `shoppingmall`을 확인했다. 이력14/대기0014만/해시 일치/기존6범주0에서 전체백업을 만들었다. custom-format v1.14·TOC305·TABLE DATA45·138365bytes·0600, SHA256 **b4d86c1c36f962db526f0918ef62e556e8065d61eb5ed3398342edad2db73668**. pg_dump가 생성한 컨테이너 내부 `/tmp` 파일과 WSL `/tmp` 복사본 모두 같은 해시/0600을 확인했다. 승인된 Drizzle 적용 후 **15적용/대기0·신규6관계·기존6범주0**이며 공유 목표시험 **12/12 pass·0skip·0fail**. 전체 루트 회귀 진행 중이므로 백업 두 사본은 아직 보존한다. 적용/목표 검증 오류0, 자동 역migration/실PG/상시mock서버 없음.
- PMO `01a054f5-c2b4-7af0-b31a-c8148ef74642`가 신산님의 권장안 승인에 따라 `local-postgres/shoppingmall`의 0014 한 건만 승인했다. 대상은 제품 `2a61f3258f441070838c78d4ff0215de7d201e95`와 제품 diff가 없는 문서 HEAD `cd10cbabffe1bade46245b70f2feabc565e77eaa`, SQL SHA-256 `fe1328de61502e1d19a7ade992862c9bd508667f432f0ac29de1df87a9c75181`다. 자체 격리 Task6 완료만 인정됐으며 S4 Stage/공유E2E/사용자 인수 완료가 아니다.
- 예정 자원: WSL 일회용 runner `shoppingmall-s42-shared-node-1005`(기존 Node24 image, WSL 정식 checkout 읽기전용, 기존 `local-postgres` 네트워크 namespace, 공개 포트/새 volume 없음), WSL 임시백업 **`/tmp/shoppingmall-s42-0014-pre-20261005.dump`**. 백업은 승인 적용 전 전체DB custom-format·0600·크기·목록·SHA256을 확인하고 회귀 성공/가상자료정리 뒤 정확한 파일만 제거한다. 실패하면 보존·PMO 보고하며 역migration/DB덮어쓰기를 하지 않는다. runner는 실행마다 `--rm`, 별도 API/mock 서버는 상시 실행하지 않는다. 공유 기존 데이터와 서비스는 유지한다.
- 실행 순서: 컨테이너/DB·이력14·대기0014만·SQL해시·기존6범주 재확인 → 전체 백업검증 → 정확한 migration → 이력15/대기0·6신규관계·기존행수불변 → 목표/전체 공유DB 회귀 → QA/runner/백업 잔류0. preflight 불일치/적용·검증 실패는 다음 변경을 중단하고 원사건을 보존해 PMO에 보고한다. 실PG·외부비용·Oracle·S5.2·새branch·Stage병합은 제외한다.

## 검증 완료·PMO 판정 요청 — 2026-10-05 S4.2 Task 6 격리 QA

- 담당 어울/단일 writer, 최종 제품 SHA **`2a61f3258f441070838c78d4ff0215de7d201e95`**, `codex/s4-payment-refund`; Windows/원격/WSL 동일 SHA. 다음 문서 커밋은 제품 diff가 없는 증거·체크리스트 갱신이다. `main` 병합/PR 자동병합 태그/공유0014/실PG/Oracle/UAT/S5.2는 하지 않았다.
- 최종 로컬 `pnpm test` **346건/249 pass/97 DB·환경skip/0 fail**, PR본문 **8 pass**, 전체 `pnpm typecheck/lint/build` 성공. WSL 동일 SHA의 **루트 전체** 순차 시험은 **347건/330 pass/17 조건부skip/0 fail**, PR본문8 pass, API/Web/Mobile/contracts typecheck·lint·API/Web build 성공이다. 17개 제외는 DB 미설정 전용경로6·실ClamAV1·별도 privateDB 우편구역1·공유QA reset 보호조건9이며 통과로 세지 않았다. S4 환불·결제 경쟁·본인목록 DB/HTTP 목표는 모두 실행됐다. 추가 집중11/11은 제품 API가 같은 직전 `9dcf950` 증거로 별도 구분한다.
- 실제 Chrome: 본인 이전 결제완료 주문(새 세션/후속 주문 이후)→부분 요청→관리자 승인→모의 환불 완료, 이후 최종 웹 코드에서 늦은 GET 차단·선택 중 강제 제출 POST0·동일 주문 Enter2회·1920/430/390px 가로넘침 없음·확정3333원 표시를 확인했다. 관리자 A→B 폼초기화는 현재와 동일 관리자 코드의 `9dcf950`에서 재검증. DB 확인은 원주문 PAID12000/배송3000/지원1000 불변, 완료사례1/시도1/사건1/환불3333/배송환불0. 전량 배송비1회·순차3333+6667·경쟁/멱등/재고복원은 자동DB 시험 증거이며 이 브라우저 시나리오와 구분한다.
- 독립 reviewer Huygens는 최종 `2a61f32`를 직접 대조해 **Critical0/Important0**, 독립 로컬27/27와 메모리 경합5/5를 보고했다. Main은 최종 diff·실제 브라우저 GREEN·전체 시험으로 교차확인했다. 조회세대뿐 아니라 선택/POST 공유 ref잠금·선택세대 성공/실패 검사까지 보정했다. 신규 공개API는 앞서 PMO가 승인한 본인 PAID 목록1개뿐이며 후속 schema 변경은 없다.
- 정리: 자동시험 DB의 계정·상품·주문·예약·환불사례/시도/사건·결제시도/사건9범주0, migration15 확인. 브라우저 전용DB는 확인된 가상3계정/1상품/4주문/요청3개만 포함했다. 영속 mount0·외부포트0·tmpfs/네트워크 유일PG를 검증한 뒤 `shoppingmall-s42-review-pg-1005`와 `shoppingmall-s42-review-1005`를 제거했다. 일회용 Node·네트워크·Chrome 프로세스/프로필·암호파일·임시QA도구·로컬9091/9092/9223/15439 잔류 **0**. 폐기한 tmpfs 가상 데이터는 복구 대상이 아니며 Git 회귀도구와 `D:\tmp\shoppingmall-s42-review-evidence`의 화면/DB 증거, `shoppingmall-s42-selection-final-local-test.log`, `shoppingmall-s42-2a61f32-wsl-full.log`, `shoppingmall-s42-2a61f32-wsl-build.log`는 보존했다. `apps/web/AGENTS.md`/`CLAUDE.md`·root `legacy-onedrive/`는 PMO 지시대로 보존한다.
- 공유DB 승인 패킷: `local-postgres/shoppingmall` 읽기전용 dry-run은 **14적용/0014 1대기/35문장**, SQL SHA-256 **fe1328de61502e1d19a7ade992862c9bd508667f432f0ac29de1df87a9c75181**, 6신규 환불관계 부재·기존 주요6범주0·SQL적용0 확인. 권장안은 정확한 현 SQL만 사전 custom-format 전체백업(0600·크기·목록·해시 확인) 후 Drizzle 적용→15이력/대기0·6관계·기존행수 불변 확인→목표/전체 회귀·가상자료정리다. 대안은 지금 격리 증거만 유지하고 공유 통합을 보류하는 것으로, 데이터 영향은 없지만 정식 통합은 미검증으로 남는다. 실패 시 모의 변경 경로를 끄고 행/공급자사건을 보존하며 임의 역migration/공유DB 덮어쓰기를 하지 않는다. 전진 보정 또는 격리 복원판단을 PMO에 보고한다. 적용·검증 성공 후 해당 임시백업만 삭제하며 실패 시 보존한다. PMO 지시 전 실제 공유 적용은 금지한다.
- 미검증: 정식 공유 DB 통합/E2E, 실제 PG·문자/메일/푸시 공급자, Oracle, 실제200% 확대/인쇄, 사용자 인수·전체 구축 완료. 자체 QA를 이에 대한 PASS로 승격하지 않는다. DB 드라이버의 기존 병렬 query deprecation 경고도 관찰했으나 현재 pg8에서 실패는 없었고 pg9 호환성은 주장하지 않는다. 다음 조치는 **PMO Task6 판정 및 공유0014 적용 지시 수신**이다.

### Task 6 진행·오류 이력

- `9dcf950d142974e864f5c1c0692bc4d74d7b9254` 검증: 로컬346/249 PASS/97 환경skip/0 fail + PR본문8 PASS, typecheck/lint/build PASS. WSL 같은SHA 집중 DB11/11, 전체 API189/172 PASS/17 조건부skip/0 fail, Web113/113 및 타입/lint/API·Web build PASS. 실제 Chrome 관리자 폼 초기화·고객 지연 GET 차단·동일 주문 Enter 재선택2회·1920/430/390 가로넘침 없음/완료3333원 표시 PASS. 후속 재리뷰는 POST 완료 후 새 generation 조회가 선택을 덮는 Important1을 추가 확인했다. 실제 선택 지연 중 강제 폼제출 RED(disabled=false/POST1)→선택/제출 공통ref 잠금·선택세대 검사로 GREEN(disabled=true/POST0)이며 다시 최종 검증 중이다. 승인 범위 밖 추가 API/schema 없음. 브라우저 전용DB는 가상3계정/1상품/4주문, 완료환불1·사건1·3333원/배송0·원주문12000원 불변이고 폼전환 QA 요청2건만 추가됐다. 공유DB는 읽기전용14 migration·6환불관계 부재·기존 주요6범주0 확인. lint의 시험도구 삼항식1회는 명시적 if로 수정했다.
- 후속 독립 리뷰에서 원래 Important4 해소, 새 Important3(이전 환불 응답 덮어쓰기·관리자 요청 전환 입력 잔류·결제/판매중지 잠금 역전)를 확인했다. 실제 브라우저에서 앞선 두 결함을 수정 전 재현했고, DB는 `f33e926c3d60632487271606a811320a61e90b00`에서 실제 판매중지 승인과 결제 처리의 `40P01` 교착을 재현했다. 관리자 선택 변경 시 승인/반려 폼 초기화와 체크 검증, 구매자 조회 세대 검증·동일 주문 재선택 재조회, 결제 제품 잠금 선행을 최소 보정 중이다. 웹 지연 응답 단위시험3 RED→GREEN, 웹 집중12 PASS, 실제 고객 지연응답/관리자 입력초기화 GREEN. 브라우저 재현 스크립트는 `apps/web/test-support/refund-switching-browser.mjs`로 보존한다. 브라우저 시험의 빈내역 문구 대조 실수1회는 실제 DOM 문구로 수정했으며, 제품 결함 실패와 구분한다. 최신 SHA 전체 회귀·DB GREEN·재리뷰·자원정리 전 Task6 완료가 아니다.
- 담당 어울, 단일 writer. 기준 `8a0078dafe924b1c8af3b87c60b54c5d23af732f`, 기존 `codex/s4-payment-refund`/worktree 유지. 독립 리뷰 Important 4건은 승인 이후 판매중지 시 재고 복원 누락을 완료로 숨기는 경로, 이전 주문 환불 접근 부재, UI 사유 코드 2개 불일치, 전체 취소 배송비 안내 불일치다.
- PMO 경유 승인: 본인 `GET /customer/checkout/orders?status=PAID&cursor=<opaque>&limit=<n>` 1개 추가, 기본20/최대50·created_at,id 내림차순 keyset·세션 고객 고정·최소 주문 snapshot 요약·기존 상세/환불 연결. 새 DB/schema 없음. 변경 전 마지막 sessionStorage 주문만 접근 → 변경 후 본인 이전 결제완료 주문 선택. rollback은 추가 GET/선택 UI exact diff revert. 공유 0014/실 PG/Oracle/S5.2는 제외.
- 재고 판단: 현 계약의 판매중지 자동복원 금지를 유지한다. 복원 불가 시 사건 보존·수동 검토 전환으로 완료 오표시를 해소하는 안을 PMO에 보고했다. 모든 복원 대상 검증 전 재고 변경을 하지 않는다.
- QA 예정 자원: WSL 전용 네트워크 `shoppingmall-s42-review-1005`, 외부 포트·영속 볼륨 없는 tmpfs PostgreSQL `shoppingmall-s42-review-pg-1005`, 내부 DB `shoppingmall`, 일회용 Node `shoppingmall-s42-review-node-1005`. 목적은 리뷰 회귀 RED/GREEN·전체 격리 시험이며 본 Task 종료 후 정확한 컨테이너·네트워크 제거/잔류0 확인. 공유 `local-postgres`는 대상이 아니다.
- 기존 수정 `apps/web/next-env.d.ts`, 미추적 `apps/web/AGENTS.md`/`CLAUDE.md`, root `legacy-onedrive/`는 보존. 과거 브라우저 QA 일부 캡처는 완료 전 화면이므로 최신 완료 증거와 혼동하지 않고 재검증한다.
- 리뷰 보정 `bb5723a45b752f23a8bf68a59e13df23d073afc1`: 로컬 342 tests/246 pass/96 환경 skip/0 fail, PR본문8 pass, typecheck/lint/build 통과. WSL 동일 SHA의 집중 DB9 pass/0 skip/0 fail. RED에서는 사유/배송비 UI2건·목록404·재고누락/제품잠금/다품목 검증3건이 각각 기대 실패했다. lint 미사용 변수1회 수정, 원격 stdin CRLF 끝줄 오류2회는 수신측 CR 제거로 해결했다.
- 브라우저 재검증 예정: 위 격리 PG 내부 전용 DB `shoppingmall_s4_refund_ui_e4211005`, Windows 루프백15439 SSH 터널(WSL 전용 PG IP로만 연결), 웹9091/API9092, Chrome9223·정확한 프로필 `D:\tmp\shoppingmall-s42-review-chrome`. 가상3계정·1상품·최초 주문과 후속 UI 주문만 사용. 비밀번호는 프로세스 환경에서 생성·사용하고 기록하지 않는다. 종료 후 전용 DB/터널/API/Web/Chrome·프로필을 제거하고 잔류0 확인. 증거는 `D:\tmp\shoppingmall-s42-review-evidence`에 보존한다. 공유 DB는 연결하지 않는다.

## 완료 — 2026-10-05 S4.2 Task 4 고객·관리자 환불 HTTP 계약

- 담당 어울, 단일 writer. 기준 `codex/s4-payment-refund@162cb9d3dcba6ce70107317dd28857bd110361f8`. 승인된 고객 POST/GET 목록/GET 상세와 관리자 POST 생성/GET 목록/GET 상세/POST 결정의 7개 endpoint를 기존 세션·활성 역할·동일 Origin·UUID 멱등키·loopback mock gate에 연결했다. 판매자는 생성·조회·결정이 거부되고 타 고객 주문은 404로 숨긴다. 고객 응답은 관리자 내부 판단·공급자 식별자를 제외하며, 관리자 상세만 품목 복원·결정·시도·검증 사건·상태 이력을 제공한다.
- 금액·멱등: 요청 직후에는 누적 승인 수량을 반영한 조회 시점 견적과 `amountFinal:false`를 반환하고, 경합으로 요청 수량 승인이 불가능해지면 500 대신 `estimateAvailable:false`·0원 견적으로 표시한다. 승인 시 Task 3 거래가 금액을 고정한다. 모의 사건 ID는 공급자 환불 ID에서 결정적으로 만들고 공급자+사건 ID advisory transaction lock을 추가해 재시작·동시 재호출도 사건 1건으로 수렴한다. 승인 재시도는 기존 사건을 재처리할 뿐 새 환불·재고 복원을 만들지 않는다.
- TDD·로컬: DB 미연결 경로가 404인 RED 0 pass/1 fail에서 시작해 503 GREEN을 확인했다. Windows 전용 DB `shoppingmall_s42_1005_5f8a7d8`에서 schema 1+처리 3+HTTP 2 **6 pass/0 fail/0 skip**, 사후 환불 사례·시도·사건·충돌·주문·결제시도·계정·상품·세션 9범주 0. DB 미설정 전체 **328 total/236 pass/92 환경 skip/0 fail**, PR 본문 **8 pass**, 전체 typecheck·lint·build exit 0이다. 이 결과는 공유 DB나 실제 PG 검증이 아니다.
- WSL exact-SHA: 승인 SSH 별칭으로 `/home/daon/deploy/shopping`을 `162cb9d3...`에 clean fast-forward했다. 외부 포트·영속 mount 없는 fresh tmpfs PostgreSQL에 0000~0014 **15 migration**을 적용한 API 전체 순차 실행은 **184 tests/167 pass/17 조건부 skip/0 fail**이었다. 별도 fresh DB의 목표 환불 재실행은 **6 pass/0 fail/0 skip, outer exit 0**, 사후 migration 15와 위 9범주 0. 정확한 Task 4 컨테이너 2개·네트워크 2개는 trap으로 제거 후 이름 부재, WSL checkout 동일 SHA·clean을 확인했다.
- 오류 기록: Windows 절대 경로 patch 전달을 처음 표준입력으로 시도해 UTF-8 인자 오류 1회, 긴 명령 인자 제한 1회가 발생했고 제품 파일은 바뀌지 않았다. native absolute `apply_patch`로 전환했다. DB 대상 미지정 시험 요청은 안전 검토에서 실행 전 1회 거부돼 공유 DB 무변경이며, 정확한 전용 DB 이름을 명시해 실행했다. WSL 입력 orchestration은 로컬 변수 선해석 1회, 닫힌 stdin 1회, 사용할 수 없는 JS 인코더 2회, TTY 종료문자 결합 1회가 있었고 각 경우 제품/공유 DB 변경은 없었다. TTY 실행의 Node 전체 suite 자체는 fail 0·잔류 0까지 끝났으나 외부 셸만 종료문자 때문에 exit 1이어서, 다른 전송 방식의 목표 6건을 fresh DB에서 outer exit 0으로 재검증했다. 비밀값은 출력·파일·Git에 남기지 않았다.
- 미검증/다음: 고객·관리자 Flat v2 화면과 실제 브라우저/390px/키보드, 공유 `local-postgres/shoppingmall` 0014 적용, 실제 PG, Oracle/UAT는 미검증이다. Task 5에서 현재 7개 endpoint를 소비하는 역할별 화면을 TDD로 구현한다. 공유 DB 0014는 최종 SQL 해시·dry-run·백업·행수·rollback 계획을 PMO에 별도 보고해 승인받기 전 적용하지 않는다.

## 진행 중 — 2026-10-05 S4.2 Task 3 환불 처리 core

- 담당 어울, 단일 writer. 기준 Task 2 `9a0363b`. `createRefundCase`, `decideRefundCase`, `recordVerifiedRefundEvent`, `processVerifiedRefundEvent`, 권한 제한 조회와 mock/no-charge adapter를 구현했다. 고객/관리자 요청과 결정의 UUID 멱등키·64자 지문, 주문→발송→품목→사례 잠금, 누적 floor 차액, 마지막 전량 사례의 실제 납부 배송비 1회, 공급자 사건/충돌 보존, `on_hand_only` 보유재고 1회 복원과 판매가능재고 불변을 적용했다.
- 계약 보정: 승인된 결정 API의 멱등성을 실제 저장하기 위해 아직 공유 DB에 미적용인 0014 `refund_cases`에 nullable 결정 멱등키·결정 지문과 상태 연동 check를 추가했다. 신규 관계나 공개 API는 늘리지 않았다. 현 0014 SHA-256 `fe1328de61502e1d19a7ade992862c9bd508667f432f0ac29de1df87a9c75181`, 공유 DB 읽기 전용 미리보기 14 적용/1 대기·35문장·SQL 적용 0이다.
- TDD: 처리 모듈 부재 RED 0 pass/1 fail에서 시작했다. 전용 격리 DB fresh 0000~0014에서 순차 1개+2개 환불의 상품액 3,333원+6,667원, 실제 배송비 2,000원 1회, 총 12,000원, 원 주문/발송/품목 snapshot 불변, 사건 중복·다른 지문 충돌 2건, 보유재고만 2개 복원, 판매중지 복원 거부를 확인했다. 병렬 2개+2개 승인은 한 건만 성공해 점유 2개, 0원은 no-charge 검증 사건으로 완료, 검증된 실패는 `REVIEW_REQUIRED`·완료시각 없음이다. 목표 DB **4 pass/0 fail**(schema 1+처리 3), 전체 **326 total/235 pass/91 환경 skip/0 fail**, PR 본문 8 pass, API typecheck·lint 종료 0이다.
- 오류 기록: 첫 처리 시험은 fixture의 판매자 계정 ID와 판매자 ID 이름 충돌로 FK 실패 1회였고 전용 DB fresh 재생성으로 잔류를 제거했다. 다음 시험은 집계 query에 허용되지 않는 `FOR UPDATE`를 붙여 1회 실패했다. 승인 거래 잠금을 주문→발송→원품목→사례 순서로 분리해 보정했다. 같은 근본 원인 3회 연속 없음.
- WSL exact-SHA: SSH 별칭 원격으로 `ad5bd93fcd4887c2c68cd57f3774c6cb881d2a92`를 push하고 `/home/daon/deploy/shopping`을 같은 SHA로 fast-forward했다. 외부 포트·영속 mount 없는 tmpfs PostgreSQL `shoppingmall-s42-task3-pg-1005`/전용 네트워크 `shoppingmall-s42-task3-1005`, DB 이름 `shoppingmall`에 fresh 0000~0014를 적용했다. Node 22.23.2에서 API 전체 순차 **182 tests/165 pass/17 환경 skip/0 fail**. 환불 사례/시도/사건/충돌/주문/결제시도/계정/상품 8범주 각 0을 확인하고 정확한 컨테이너·네트워크만 제거해 잔류 0, WSL checkout clean을 확인했다.
- WSL 실행 오류 2회: 첫 원격 시험 명령의 `$()`를 PowerShell이 로컬에서 먼저 해석해 시험 시작 전 실패했고, 단일 인용부호 보정 뒤에는 비대화형 PATH에 `pnpm`이 없어 migration 전 실패했다. 제품/DB 변경은 없었다. 실제 설치 Node 22 절대 경로와 기존 checkout `tsx`를 사용해 재실행했고 위 전체 PASS를 얻었다. 같은 근본 원인 3회 연속 없음.
- 정리/미검증: Windows 전용 격리 DB `shoppingmall_s42_1005_5f8a7d8`은 후속 Task 4~6에 재사용하되 시험 행 8범주 0이다. 고객·관리자 HTTP/화면, 실제 브라우저, 공유 DB 0014, 실제 PG, Oracle/UAT는 아직 미검증이다.

## 진행 중 — 2026-10-05 S4.2 Task 2 환불 원장 구조

- 담당 어울, 단일 writer. 기준 branch `codex/s4-payment-refund`, Task 1 commit `5f8a7d8`. 승인된 범위 안에서 새 `0014_s4_refunds.sql`과 환불 사례·품목·시도·공급자 사건·사건 충돌·상태 이력의 6관계만 추가했다. 기존 주문·결제·프로모션 금액 snapshot과 0000~0013 SQL은 변경하지 않았다.
- TDD: 공유 개발 DB의 관계 부재를 먼저 확인해 구조 시험 0 pass/1 fail RED를 만들었고, 전용 격리 DB `shoppingmall_s42_1005_5f8a7d8`에 0000~0014를 적용한 뒤 구조·제약·고유 인덱스 목표 시험 1 pass/0 fail GREEN을 확인했다. 커밋 전 계약 대조에서 `REVIEW_REQUIRED`가 완료시각을 요구해 환불 완료처럼 보이는 문제를 추가 RED로 고정했고, `REFUNDED`만 완료시각 필수·수동 검토는 완료시각 없음으로 보정한 fresh apply 뒤 다시 1 pass/0 fail이다. Task 2 커밋 당시 0014 SHA-256은 `8d92d378eee29db3dde3b3eac0b070a83130c99b54bc55d587a35143136864ea`였으며, 후속 Task 3의 결정 멱등 필드 추가로 현 해시는 위 Task 3 기록을 따른다. 공유 DB에는 적용하지 않았다.
- 마이그레이션 이력 오류 1회: Windows working tree의 기존 SQL이 CRLF로 변환되어 공유 DB의 LF 적용 해시와 달랐다. 기존 SQL 내용을 바꾸지 않고 `.gitattributes`에 migration LF 규칙을 추가·renormalize했으며, 0000~0013의 적용 해시 회귀시험을 저장소 루트와 `apps/api` 작업 위치 양쪽에서 각 3 pass로 확인했다.
- 시험 환경 오류 1회: 격리 DB에서 API 전체 회귀를 실행했으나 기존 QA fixture가 안전상 DB 이름을 정확히 `shoppingmall`로 제한하여 178 total/129 pass/31 fail/18 skip이었다. 제품/schema 회귀로 판정하지 않고 해당 안전장치를 유지했다. Task 2는 전용 구조 시험만 격리 DB에서 실행하고, 전체 회귀는 DB 미설정 경로로 **323 total/235 pass/88 환경 skip/0 fail**, PR 본문 검사 8 pass, API typecheck·프로젝트 lint·`git diff --check` 종료 0을 확인했다.
- 격리 DB 재생성 도구 오류 2회: 첫 존재 확인 SQL은 원격 인용부호가 깨져 보호 확인에서 중단돼 DB 무변경, 두 번째는 정확한 전용 DB를 재생성했으나 migrator를 저장소 루트에서 실행해 journal 상대경로를 찾지 못했다. 빈 전용 DB에 `apps/api` 기준으로 다시 실행해 0000~0014 적용과 목표 GREEN을 확인했다. 공유 DB와 제품 데이터 영향은 없다.
- 이력 출력 도구 오류 1회: 일회성 TypeScript 명령의 내부 따옴표가 PowerShell에서 제거되어 코드 변환 전에 실패했다. DB 영향 없음. 임시 스크립트를 만들지 않고 구조 회귀시험에 Drizzle 이력 15건 검증을 추가했다.
- 미검증/다음: 공유 DB 0014 적용, 실제 PG, 실제 브라우저, Oracle/UAT는 미검증이다. 격리 DB는 후속 Task 3 거래 시험에 재사용하며 전용 fixture와 정확한 DB 대상 guard를 사용한다. S4.2 종료 때 시험 행과 DB를 정리한다.

## 진행 중 — 2026-10-05 S4.2 계약 검토·PMO 보고 경로

- 구현 승인: PMO가 신산님 지시 경로로 `docs/design/S4_REFUND_CONTRACT_DRAFT.md`의 0014 추가식 6관계, 고객/관리자 API 7개, 권한·금액·멱등·충돌·사건 이력, 관리자 명시 `on_hand_only` 재고 복원의 **현 branch 격리 구현·검증**을 승인했다. 공유 DB 0014, 실제 PG, Oracle/UAT, S5.2 후출고 정책, 쿠폰 재발행·sellable 자동 증가는 제외다. `docs/superpowers/plans/2026-10-05-s4-pre-shipment-refunds.md`에 6 Task TDD 계획을 기록했다.
- 실행 도구 오류 누적 3회: Superpowers의 `sdd-workspace`를 Windows 경로, Git Bash형 `/c` 경로, WSL `/mnt/c` 경로로 실행했으나 각각 스크립트 경로 미해석 2회와 Windows Git worktree의 gitdir 경로 혼합 1회로 실패했다. 제품 파일·Git·DB 영향 없음. 동일 원인 반복을 중단하고 같은 형식의 plan-scoped git-ignored ledger를 `.superpowers/sdd/2026-10-05-s4-pre-shipment-refunds/progress.md`에 직접 만들었다.
- Task 1 완료: 변경 전 `pnpm test` 318 total/231 pass/87 DB·환경 skip/0 fail. 수량별 환급 RED는 `allocation.ts` 모듈 부재로 0 pass/1 fail을 확인했고, 누적 floor 차이를 BigInt로 계산하는 최소 구현 뒤 목표 3 pass/0 fail을 확인했다. 전체 회귀 321 total/234 pass/87 skip/0 fail과 typecheck를 거쳐 `5f8a7d8`로 커밋했다.
- 담당 어울, 단일 writer. 신산님 직접 지시에 따라 앞으로 보고·승인 요청은 지정 PMO 채팅 `01a054f5-c2b4-7af0-b31a-c8148ef74642`으로 보내고 그 지시를 확인한다. PMO를 통해 수량 단위 부분 취소, 관리자 최종 결정, 남은 주문 배송비 재부과 없음과 위 현 branch 격리 구현 범위가 전달·승인됐다. 공유 DB 적용 등 제외 범위는 여전히 별도 승인 전이다.
- 현재 로컬 `codex/s4-payment-refund@ad05adc874e4ff97005f8b50f04f7a7ba5c466a1` clean, WSL 지정 checkout도 같은 SHA·clean. WSL 공유 `local-postgres/shoppingmall` 읽기 전용 조회에서 migration 14건. `WORK_PLAN` S4.2, `DESIGN` R06/R07, `PRD` 7.5·8.2, 현행 DB schema·주문/결제 API를 대조해 환불 사례·품목·시도·사건·이력, 금액/배송비 규칙, 권한·멱등·검증/복구 계약안을 PMO에 보고했다. 실제 코드·DB 변경 없음.
- 의존성·승인된 계획 보정: 현행 주문 상태에는 출고 사건이 없으나 S4.2에 후출고 심사/증빙이 있고, 출고·클레임은 후속 S5.1/S5.2에 있었다. PMO가 신산님 지시 경로로 **S4.2는 출고 전 환불 core로 완료하고, 후출고 사유별 증빙·시험 정책 심사/환불 연결을 S5.2 완료조건으로 이동**하는 한 방향의 Stage 귀속 보정을 승인했다. `docs/WORK_PLAN.md`의 해당 S4/S5 문구만 최소 수정하고 DESIGN R07의 미확정 약관 경계는 유지했다. S4 Stage PR 병합·smoke·정리 전 S5 branch를 만들지 않는다. 이번 승인은 0014 schema/API 구현이나 공유 DB 적용 승인이 아니다. 실제 PG·브라우저/390px/키보드/인쇄·Oracle/UAT는 미검증.
- 도구 오류 1회: 이번 턴 첫 병렬 읽기 전용 `exec_command` 호출(메모리 rg: `C:\Users\cyhuh\.codex\memories\MEMORY.md`; `git status`와 문서 rg: `D:\Project\shoppingmall2\.worktrees\s4-payment-refund`)에서 process 생성 단계 `helper_unknown_error: apply deny-read ACLs` 발생. 어느 병렬 명령이 먼저 실패했는지는 불명이다. 안전한 대안으로 동일 D: checkout의 `git status`를 승인된 elevated 읽기 전용 명령으로 재실행해 성공했고 이후 문서·Git·WSL 읽기도 성공했다. ACL/설정 변경 없음. 기존 브라우저 제어 초기화 오류는 별개이며 이번 턴 재시도하지 않았다.
- 상세 계약 문서: `docs/design/S4_REFUND_CONTRACT_DRAFT.md`를 **미승인 제안**으로 작성했다. 기존 PAID/금액 스냅샷 불변, 수량 단위 할인 후 상품 환급/배송비 1회, 환불 사례·품목·시도·검증 사건·충돌·이력 6관계, 고객/관리자 제안 API, 역할·멱등·경합, 선택적 보유 재고 복원, 단계별 RED/GREEN/복구를 정의했다. 현재 `git diff --check` exit 0과 WORK_PLAN S4/S5의 순환 의존성 제거를 자체 확인했으며, SQL/API 구현·DB 적용·실제 브라우저 검증은 하지 않았다. 정확한 0014/API/재고 복원 권장안을 PMO에 보고해 답변을 기다린다.

## 진행 중 — 2026-10-05 S4.1 공유 개발 DB 0013 적용 승인

- 공유 DB 적용·검증: custom-format 전체 백업의 컨테이너/호스트 동일 SHA-256 `f256ae0643225ad1b31ce3ac9000918f86e61a596f4a012435bf5f2d0441a6a9`, 호스트 0600/127,635바이트, `pg_restore --list` 296행 확인 후 exact SHA `849ec696401e5516bb37fdafd1ae5fc14d9f828a9`의 migrator exit 0. 적용 후 Drizzle 이력 **14건**, 마지막 해시 `4556376ac133b0468015a56f631b93bf5bff8dd276ee1e3777c096d35456b547`, 읽기 전용 미리보기 **14 적용/0 대기**, 기존 계정·상품·예약·주문 각 0 불변, 신규 시도·사건·충돌 3관계 각 0. 첫 전체 회귀는 `DATABASE_URL` 누락으로 **173건/86 pass/87 환경 skip/0 fail**이었으므로 정식 DB 회귀로 계산하지 않았다(시험 환경 구성 오류 1회). 연결 비밀값을 로그·Git에 내지 않는 일회용 컨테이너의 내부 접속 주소를 구성해 목표 사건 시험 **1 pass/0 skip**, 공유 DB API 전체 순차 **174건/157 pass/17 환경 skip/0 fail**로 재실행했다. 사후 계정·판매자·상품·옵션·주소·예약·예약품목·주문·발송·발송품목·프로모션·쿠폰 사용·감사·시도·사건·충돌 **16범주 각 0**, migration 14. 일회용 Node 컨테이너 잔류 0·WSL 지정 checkout clean. 승인된 schema는 유지하며 임시 백업 두 사본은 정확한 경로·해시를 재확인한 뒤 제거 예정. 실제 브라우저/PG/Oracle/UAT와 S4.2는 미검증·미완료다.
- 임시 백업 정리: 양쪽 `/tmp/shoppingmall-s41-0013-pre-20261005.dump`의 실경로·같은 SHA-256을 재확인하고 **그 두 파일만** 제거했다. WSL 호스트/`local-postgres` 컨테이너 양쪽 부재, 이번 Node24 일회용 컨테이너 잔류 0을 확인했다. 삭제한 것은 이번 적용 직전 생성한 임시 백업이며, DB에 적용된 0013과 기존 자료는 삭제하지 않았다. 백업 파일은 복구할 수 없고, 적용된 schema는 전진 보정이 필요한 경우 별도 판단한다.
- 실제 화면 재시도: 공유 DB 검증 뒤 `mcp__cua_repl` 브라우저 도구의 초기 상태 조회 1회가 `windows sandbox failed: helper_unknown_error: apply deny-read ACLs`로 시작 전에 종료됐다. 이전과 동일한 도구 환경 오류이며 이번에는 브라우저/390px/키보드/인쇄 QA 자료나 서버를 새로 만들지 않았다. API/DB 자동 시험을 실제 브라우저 PASS로 승격하지 않는다. 동일 근본 원인 도구 실패가 누적됐으므로 같은 상태에서 재시도를 반복하지 않고 S4.2 계약 준비 등 영향받지 않는 계획 작업을 진행한다.

- 담당 어울, 단일 writer. 신산님이 `WSL-server/local-postgres/shoppingmall`에 정확한 `0013_s4_payments.sql` 적용을 별도 승인했다. 실제 PG/Oracle/UAT/S4.2 환불 및 임의 복원·역적용은 승인 범위 밖이다. 기준 Windows/WSL 지정 checkout `codex/s4-payment-refund@849ec696401e5516bb37fdafd1ae5fc14d9f828a9`; 양쪽 clean, SQL SHA-256 `4556376ac133b0468015a56f631b93bf5bff8dd276ee1e3777c096d35456b547` 일치.
- 적용 전 읽기 전용 증거: 공유 DB `shoppingmall`의 이력 13건, 계정/상품/예약/주문 각 0행, 결제 시도·사건·충돌 관계 부재. Drizzle 미리보기 exit 0: 적용 13/대기 `0013_s4_payments` 1건·23문장/해시 일치. 기존 0000~0012는 변경하지 않는다.
- 백업 자원: 정확한 `local-postgres:/tmp/shoppingmall-s41-0013-pre-20261005.dump`와 WSL 호스트 `/tmp/shoppingmall-s41-0013-pre-20261005.dump`가 모두 부재함을 확인했다. 공유 DB 전체 custom-format 백업을 먼저 컨테이너 내부에 생성해 호스트로 복사하고 형식/목록/0600 권한/크기/양쪽 해시를 검증한다. 적용 오류면 mock 시작을 끄고 DB 사건·백업을 보존해 별도 복구 결정을 요청한다. 성공 시 동일 SHA의 0013만 적용, 이력 14/기존 행 불변/신규 3관계, 정식 공유 DB 회귀·QA 행 정리 확인 후 정확한 두 임시 백업만 제거해 잔류 0을 확인한다. 일회용 Node 시험 컨테이너는 `--rm`이고 새 포트·네트워크·볼륨은 만들지 않는다.

## 진행 중 — 2026-10-05 S4.1 충돌 기록 보정 승인

- 새 충돌 기록 시험은 기존 0013 private DB에서 관계 부재(`42P01`)로 RED 0 pass/1 fail/0 skip을 확인했다. 최초 RED에서는 시험 정리가 같은 부재 관계를 먼저 조회해 원인 위치를 가렸고, 정리 guard 보정 뒤 본문 54행의 기대 실패로 확인했다(시험 경로 오류 1회, 보정 성공). 이 최초 실패로 남은 private 시험 사건 1건은 해당 컨테이너가 tmpfs·무외부포트·무영속 mount·전용 네트워크의 유일 구성원임을 대조하고 정확한 컨테이너만 제거/재생성해 소멸했다. 수정 0013 fresh 적용 이력 14건, 목표 **1 pass/0 skip**, WSL private API 전체 **174 total/157 pass/17 환경 skip/0 fail**, 사후 시도/사건/충돌 각 0. Windows 전체 **318 total/231 pass/87 환경 skip/0 fail**, PR 본문 8 pass, typecheck/lint/build exit 0. SQL SHA-256 `4556376ac133b0468015a56f631b93bf5bff8dd276ee1e3777c096d35456b547`. 이 결과는 actual browser/공유 DB/실 PG/Oracle/UAT PASS가 아니다.
- 격리 시험 후 전용 네트워크 구성원은 전용 PG 1개뿐, 해당 PG의 영속 mount/포트 바인딩 각 0, 시도·사건·충돌 각 0을 확인했다. 정확한 `shoppingmall-s41-conflict-pg-1005`와 `shoppingmall-s41-conflict-1005`를 제거하고 두 이름의 잔류 0을 확인했다. 공유 `local-postgres/shoppingmall` 읽기 전용 재확인은 migration **13건**, `payment_event_conflicts` 부재였다. 따라서 0013 공유 적용은 여전히 별도 승인 필요.

- 담당 어울, 단일 writer. 신산님이 아직 공유 DB에 적용하지 않은 0013에 결제 사건 충돌 전용 관계 1개를 추가하는 범위를 승인했다. 원사건 불변·새 사건 지문/시각/사유 영속·충돌 결제 확정 차단을 목표로 TDD 보정한다. 공유 DB 0013 적용·실 PG·Oracle·S4.2는 승인에 포함되지 않는다.
- 기준 `codex/s4-payment-refund@bc09ad13f8cfa9c82ade1eefcc917d02932e35e8`, Windows 격리 worktree clean·WSL 지정 checkout 동일 SHA/clean. 예상 변경: 0013 SQL, Drizzle schema, 결제 사건 서비스/저장소, DB 시험, 계약·환경·현황 문서. 기존 0000~0012·주문/결제 행 삭제 없음.
- 격리 시험 자원 사전 계획: WSL의 전용 네트워크 `shoppingmall-s41-conflict-1005`, tmpfs PostgreSQL `shoppingmall-s41-conflict-pg-1005`, 일회용 Node 시험 컨테이너만 사용한다. 외부 포트·영속 볼륨 0, 수명은 이번 RED→GREEN/전체 회귀까지. 기존 이름 잔류 없음 확인. 완료·실패·중단 시 고유 시험 행을 확인하고 정확한 전용 PG·네트워크만 제거해 잔류 0을 확인한다. 공유 `local-postgres/shoppingmall`은 변경하지 않는다.
- 실제 브라우저 검증은 이전 ACL 도구 오류로 미검증, 새 보정의 WSL 격리 DB 전체 회귀 및 공유 DB 적용도 아직 미실행이다. 동일 근본 원인 오류 연속 0회.

## 진행 중 — 2026-10-05 S4.1 결제 계약 구현 승인·착수

- 보정 재리뷰/최종 현재 판정: `24301094bf21ad67b8717ace9a4c2f2c134ed063`에서 이전 Important ②와 Minor는 읽기 전용 재리뷰로 해소 확인, Important ① 충돌 영속 기록은 새 관계 승인 대기라 **Stage 병합 보류**다. WSL 지정 checkout도 같은 SHA/clean이며 별도 인터넷·DB 없는 Node24 컨테이너에서 결제 adapter/장바구니 목표 **12 pass/0 skip/0 fail**, 임시 컨테이너 잔류 0. Windows 같은 SHA 전체 318 total/231 pass/87 환경 skip/0 fail·PR 검사 8 pass·typecheck/lint/build exit 0. 앞선 실DB 전체 173/156 pass/17 skip은 보정 전 SHA `fd12bbe`의 증거이며 최신 코드의 실DB 전체 PASS로 승격하지 않는다. 공유 0013 적용·실제 브라우저·S4.2/PG/Oracle/UAT 미검증은 그대로다.
- S4.1 읽기 전용 리뷰(검토 범위 `0b0746a..fd12bbe`): Critical 0, Important 2, Minor 1. Important ① 동일 공급자 사건 ID/다른 내용의 거부는 동작하지만 충돌 자체를 영속 기록하지 못한다. 기존 `audit_events`는 행위자 계정/역할 필수라 공급자 사건을 고객 행위로 허위 기록할 수 없고, 승인된 두 결제 표에는 충돌별 별도 행/원사건 연결 필드가 없다. **0013에 충돌 전용 관계 1개를 추가하는 별도 승인 질문을 신산님께 제시했으며 답 전 schema/공유 DB를 바꾸지 않는다.** Important ② 화면은 거절 확정 뒤 멱등키를 재사용해 새 시도를 만들지 못했다. RED 목표 시험 실패를 확인한 뒤 확정된 `DECLINED`/`APPROVED`/`REVIEW_REQUIRED` 응답에서만 다음 시도 키를 비우고, 응답 미확정·`PENDING`은 동일 키를 유지하도록 보정했다. Minor: 공개 API 호스트/운영 설정의 모의 모드는 요청 시 404였으나 기동 시 실패하지 않았다. 기동 전 설정 검사를 추가하고 RED→GREEN 단위 시험을 확인했다. 최신 Windows 전체 **318 total/231 pass/87 DB·환경 skip/0 fail** + PR 본문 8 pass, typecheck/lint/build exit 0. 이 결과는 아직 새 충돌 영속 기록·공유 DB·실제 브라우저 PASS가 아니다. 읽기 전용 재리뷰와 승인 경계가 남았다.
- 공유 DB 0013 별도 승인 준비(아직 **미적용**): 현재 `WSL-server/local-postgres/shoppingmall`의 Drizzle 이력은 읽기 전용으로 13건이며 충돌 관계는 없다. 2026-10-05 후속 승인으로 현재 `apps/api/migrations/0013_s4_payments.sql` SHA-256은 `4556376ac133b0468015a56f631b93bf5bff8dd276ee1e3777c096d35456b547`이다. 기존 주문에 `paid_at`을 추가하고 주문/발송/상태이력 제약에 `PAID`를 허용하며 `payment_attempts`·`payment_events`·`payment_event_conflicts` 3관계 및 유일키/인덱스를 새로 만든다. 기존 0000~0012 SQL·기존 행·금액은 변경하지 않는다. 적용 전 정확한 공유 DB custom-format 임시 백업과 목록/해시/권한·현재 migration/행 수를 검증하고, 같은 SQL 해시/정확한 SHA로 적용 후 migration 14건·기존 행 불변·신규 3관계·목표/전체 회귀를 확인하는 절차를 제안한다. 오류 시 모의 결제 시작을 끄고 사건·행을 보존하며, 이미 적용된 0013을 임의 역적용하지 않고 원인별 전진 보정/필요 시 격리 백업 복원 판단을 별도 승인받는다. 실제 적용은 신산님 별도 승인 전 금지.
- Task 5/6 최신 검증·정리: Windows/WSL 동일 작업 SHA `fd12bbe9cf1b975465306de2225bab8d2009a985`, 로컬 `pnpm test` **316 total/229 pass/87 DB·환경 skip/0 fail** + PR 본문 **8 pass**, typecheck/lint/build exit 0. WSL 전용 0013 tmpfs DB의 API 전체 순차 **173 total/156 pass/17 환경 skip/0 fail**, 동일 SHA의 Web 대상 **20 pass/0 skip**. 가상 브라우저 fixture `QA_RUN_ID=a41b1005`는 전용 DB에만 5계정/5상품으로 생성했으나 Windows 브라우저 제어 도구가 `apply deny-read ACLs`로 두 번 시작 실패해 실제 브라우저 동작·390px·키보드 증거는 **미검증**이다. WSL Web dev는 읽기 전용 checkout 자동 쓰기 EROFS 1회, 컨테이너 복사본의 Next 패키지 경계 오류 1회로 사용하지 않았고 정확한 컨테이너만 종료했다. 로컬 Web dev가 만든 추적 `next-env.d.ts` 변경과 자동 생성 `apps/web/AGENTS.md`·`CLAUDE.md`는 원본 대조 후 이번 실행 산출물만 복원·제거했다. 같은 근본 원인 연속 3회 없음. QA fixture reset 후 private 계정/상품/예약/주문/시도/사건 **6범주 모두 0**, 일회용 Node/API/Web 잔류 0. tmpfs·무공개포트·영속 mount 0·네트워크 유일 PG를 확인한 뒤 **정확한** `shoppingmall-s41-private-pg-1005`와 `shoppingmall-s41-private-1005`만 제거해 잔류 0. 공유 `local-postgres/shoppingmall`은 읽기 전용 이력 **13건**(0012까지)으로 불변. 실제 PG·Oracle·UAT·S4.2·공유 0013 적용은 미실행. 읽기 전용 S4.1 코드 리뷰 진행 중이며 Task 6의 실제 브라우저 조건은 미충족이다.
- Task 6 브라우저 QA 자원 사전 기록: 최신 exact SHA의 WSL checkout을 읽기 전용으로 마운트한 임시 Node24 API `shoppingmall-s41-private-api-1005`·Web `shoppingmall-s41-private-web-1005`를 WSL `host` 네트워크에서 **루프백 9092/9091**에만 실행한다. API는 전용 tmpfs PG의 확인된 private 주소에만 연결하며 공유 `local-postgres`를 사용하지 않는다. Windows에서는 SSH alias `WSL-server`를 통한 9091/9092 루프백 터널만 열고, 브라우저 QA 후 고유 가상 `QA_RUN_ID`의 주문/시도/사건/예약을 먼저 제거한 뒤 catalog fixture reset, 브라우저 탭·터널·정확한 두 컨테이너·포트 잔류 0을 확인한다. 이 자원은 브라우저 검증 중에만 사용하며 외부 공개·지속 볼륨·운영 데이터 변경은 없다.
- Task 5 진행: 고객 POST/GET 모의 결제 시도 API를 기존 구매자 세션·동일 Origin·UUID 멱등키·주문 소유권에 연결했다. POST는 `APP_ENV=development`+`PAYMENT_MODE=mock`+루프백 API 설정/실제 연결에서만 열고, 조회 GET은 모드 종료 후에도 본인 이력 확인을 허용한다. 서버는 저장된 공급자 주문 ID로 정규화 사건을 만든 뒤 단일 거래로 확정하며 고객 입력액/브라우저 복귀를 승인 근거로 쓰지 않는다. `2b2408d` RED 404→`f337b54` 격리 DB HTTP **1 pass/0 skip**, `615a0bb` 읽기 경계 RED 404를 확인했다. Windows 웹 관련 시험 첫 전체 실행은 기존 `결제 기능은 준비 중` 문구를 변경해 2건 실패했고, 기존 문구 복원 후 목표 화면 시험 **20 pass/0 skip**, typecheck 통과. 동일 근본 원인 연속 오류 0회. Web 전체 회귀·최신 exact-SHA WSL 전체 회귀·실제 브라우저는 아직 미완료다.
- Task 4 완료 증거: 정상·중복·거절 역순·재고 부족 사건 보존·만료 경쟁·판매중지·상품 23,000원+배송 3,000원을 쿠폰 2개로 0원 처리하는 격리 DB 시험 **1 pass/0 skip**. 0원은 `no_charge`로 기록하고 `PAID`/쿠폰 2건 `USED`/재고 1회 차감이다. WSL exact SHA `5c15b2731253108b009841bddcebf9722856af37` private 전체 API **172 total/155 pass/17 환경 skip/0 fail**, Windows `pnpm test`·typecheck·lint·build exit 0(당시 SHA). 시험 컨테이너 첫 시도는 부분 마운트로 `tsx` 연결 실패 1회, 전체 checkout 읽기 전용 마운트로 수정·재시험 성공. 공유 DB는 0013 미적용. Task 5 완료 전 PG·Oracle·UAT/실제 브라우저는 미검증.
- Task 4 착수: 승인 사건 처리 전후에 실제 S3 주문·발송·예약·쿠폰·재고를 대조하는 `apps/api/test/payment-processing-db.test.mjs`를 구현 전에 작성했다. QA `runId` 고유 계정/상품·주소/쿠폰/주문/시도/사건만 사용하고 정확한 본인 행을 `finally`에서 제거한다. RED→GREEN은 기존 `shoppingmall-s41-private-1005` 비공개 네트워크와 tmpfs PG에서 수행하며 공유 DB/실 PG는 변경하지 않는다. 먼저 정상 승인 1회·중복/역순 사건·재고 1회 차감을 고정하고, 이어 늦은 승인/경쟁/0원/판매중지 경계를 추가한다.
- Task 3 격리 검증 결과: `98ac367`의 서비스 부재 RED 후 `acbc976` 후보는 실제 DB에서 미존재 검증 주문 ID를 기록하려다 FK 오류 `23503`으로 실패했다. 해당 사건을 버리지 않고 검토 대상으로 남기기 위해 **공유 DB 미적용 상태의** 0013에서 `payment_events.verified_order_id`의 주문 FK만 제외하고 UUID 필수값은 유지했다. 공급자 주문 ID/검증 주문 ID/금액 중 하나라도 시도 기록과 다르면 사건·시도를 `REVIEW_REQUIRED`로 남기고 주문·재고는 변경하지 않는다. 현재 보정 SHA `192135d534206ab0929b3d4440048fbb789bcd4a`, 0013 SQL SHA-256 `a81448a81c600f25b28d36d89296a01831f26f8dc600746d5202bf2c01e12a7a`. private tmpfs PG의 이전 행 0·tmpfs 전용을 확인해 **정확한 private PG만** 재생성하고 현재 SQL 0000~0013 전체 14건을 재적용했다. 시도·사건 목표 시험 **1 pass/0 skip**, private 전체 순차 **313건/296 pass/17 환경 skip/0 fail**; Windows `pnpm test` **312건/227 pass/85 DB·환경 skip/0 fail** + PR 본문 8 pass, API typecheck/lint, API/웹 build exit 0. 사후 private 계정/주문/시도/사건 0, 일회용 Node 0; 공유 `local-postgres/shoppingmall`은 이력 **13건**으로 불변. 실제 PG·Oracle·UAT 및 결제확정 거래/API는 아직 미구현/미검증. 다음 Task 4에서 이상 사건이 출고·재고 전이를 차단하는지 실제 DB 시험으로 증명한다.
- Task 3 착수: 단일 writer가 `apps/api/test/payment-attempt-db.test.mjs`를 구현 전 작성했다. 소유자/다른 사용자, 동일 키의 다른 결과, 검증 사건의 동일 ID 중복/금액 변경 충돌, 사건만 기록한 상태에서 주문 미확정을 실제 격리 DB로 RED→GREEN 검증한다. 시험의 가상 계정·주소·예약·주문·시도/사건은 고유 UUID를 사용하고 `finally`에서 정확한 본인 행만 제거한다. 기존 private tmpfs PG/네트워크를 재사용하며 공유 DB는 건드리지 않는다.
- Task 2 mock adapter: 새 단위시험은 구현 전 `payments/adapter.ts` 부재로 RED(1 fail/0 skip), 구현 뒤 승인·거절·지연/중복 사건 ID/재시작 후 정규화/0원/1원 불일치·모드 차단 **4 pass/0 fail/0 skip**. 로컬 `pnpm test` **311건/227 pass/84 DB·환경 skip/0 fail**와 PR 본문 8 pass, API typecheck/lint exit 0. 서버는 여전히 결제 API를 노출하지 않으며 모의 adapter만 존재한다. 모드의 실제 프로세스 시작/루프백 제한·HTTP 권한 시험은 Task 5에서 검증해야 하고, mock PASS는 실제 PG 검증이 아니다.
- Task 1 격리 스키마 검증: RED 커밋 `7e8e587bb5426459dc078eb6ae10cc542b48bddf`를 SSH alias로 push해 WSL 지정 checkout에서 기존 0000~0012만 적용한 private tmpfs DB(이력 13건)에 목표 시험 **0 pass/1 예상 fail/0 skip**, 원인 `payment_attempts` 부재를 확인했다. `bc6e7360beb3cfece431a1cf3916b2e5f406ca2c`의 당시 0013 초안 SQL SHA-256 `9995a60ace186df2dd5cbc7ebc3ed57244146036765d68fafacdde1b0cc1a5ef`를 같은 방식으로 전달해 **전용 private DB에만** 적용했다. 이력 14건, 목표 결제/기존 주문/만료 3 pass/0 skip, 별도 빈 `shoppingmall_s41_fresh` DB에서 0000~0013 전량 적용·결제/주문 2 pass/0 skip. private DB 전체 순차 회귀 **308건/291 pass/17 환경 skip/0 fail**. Windows `pnpm test` 307건/223 pass/84 DB·환경 skip/0 fail + PR 본문 8 pass, API typecheck/lint exit 0. 0013 적용 전 첫 타입 검사에서 `paidAt`을 예약 관계에 잘못 선언한 오류 1회는 대상 테이블로 옮겨 재검사 성공. WSL 첫 DB readiness는 기동 직후 응답 없음 1회 뒤 준비 확인 성공, 브랜치 추적 refspec 오류 1회는 FETCH_HEAD의 동일 SHA로 안전 전환했다. 같은 근본 원인 연속 오류 0회.
- Task 1 시험 자원 `shoppingmall-s41-private-1005` 네트워크·`shoppingmall-s41-private-pg-1005` tmpfs PG는 후속 Task 3~5 DB 시험까지 **사용 중**이며, 두 일회용 Node 시험 컨테이너 이름은 `--rm` 후 부재다. fresh DB는 같은 전용 PG 안에만 있다. 공유 `local-postgres/shoppingmall` 0013 적용·실제 PG·Oracle·UAT는 여전히 미실행/미검증. 다음 Task 2 mock adapter RED→GREEN, 이후 사건 영속/확정/API를 진행하고 private 자원을 종료 때 정리한다.
- 담당 어울, 단일 writer. 작업 위치 `D:\Project\shoppingmall2\.worktrees\s4-payment-refund`, 브랜치 `codex/s4-payment-refund`, 승인 시 HEAD `f9d2cf87f74249e13d1dad415437eab20a7904ab`(원격 추적과 일치). `D:\Project\shoppingmall2`의 `main`은 직접 수정하지 않고 미추적 `legacy-onedrive/`·`.superpowers/`를 보존한다.
- 신산님이 `docs/design/S4_PAYMENT_CONTRACT_DRAFT.md`의 고객 결제 시도 POST/GET 2개·주문 GET 상태 확장, 내부 mock 검증 계약, 추가 `0013` 두 결제 관계와 상태 제약 확장의 **구현**을 승인했다. 공유 `WSL-server/local-postgres/shoppingmall` 적용, 실제 PG/Secret·비용, Oracle, S4.2 환불 API/schema는 승인 범위가 아니다.
- 실행 계획 `docs/superpowers/plans/2026-10-05-s4-mock-payments.md` Task 1~6. 기준 worktree 시험은 이전 체크포인트에서 306건/223 pass/83 DB·환경 skip/0 fail 및 PR 본문 8 pass; 이는 격리 실DB 증거가 아니다. 새 구현/격리 DB/브라우저/WSL exact-SHA 검증은 아직 미실행. 같은 근본 원인 연속 오류 0회.
- 계획 자원: Task 1/3/4/5의 사적 DB 시험은 WSL 기존 `pgvector/pgvector:0.8.2-pg15`와 `node:24-bookworm-slim` 이미지를 사용한 전용 비공개 네트워크 `shoppingmall-s41-private-1005`, tmpfs PostgreSQL `shoppingmall-s41-private-pg-1005`, 일회용 Node 시험 컨테이너 접두 `shoppingmall-s41-private-node-1005`에서만 수행한다. 외부 포트·영속 볼륨 없이 만들고 시험 종료/중단 후 정확한 자원만 제거·부재를 확인한다. 생성 전 이름 충돌과 지정 checkout/공유 DB 상태를 확인한다. 공유 DB migration/QA 자료는 변경하지 않는다.
- 현재 변경은 승인 상태/실행 계획/작업현황 문서뿐. 다음은 Task 1 RED 스키마 실DB 시험, 0013 구현, GREEN 및 후속 Task. 범위 밖의 실제 PG·Oracle·UAT는 미검증으로 유지한다. rollback은 mock 모드 비활성화 및 원사건 보존이며 적용된 migration을 임의 역적용하지 않는다.

## 진행 중 — 2026-10-05 S3 통합·정리 완료, S4 계약 준비

- 담당 어울. 신산님이 PR #11의 GitHub 검사 실행을 승인했고, `Verify shoppingmall` PR run `37217744284` attempt 2가 성공한 뒤 PR #11이 `0b0746aeee220ed37c097e46d1f85e9922413983`으로 병합됐다. PR head `d58f48decaee91b76da6cea822ab75e2173e7cdd`와 병합 `main`의 파일 내용은 동일하며 `refs/pull/11/head`는 원본 head를 가리킨다. 병합은 신산님 계정에서 이미 이루어져 중복 병합 요청을 하지 않았다.
- Windows `D:\Project\shoppingmall2`와 WSL `/home/daon/deploy/shopping`은 같은 병합 `main` SHA/clean tracked 상태다. 병합 `main`에서 로컬 `pnpm test` 309건/226 pass/83 환경 skip/0 fail 및 PR 본문 검사 8 pass, typecheck/lint/build exit 0. 루트의 미추적 `legacy-onedrive/`는 사용자 자료로 보존했으므로 이 루트 시험 309건은 정식 DB 시험으로 계산하지 않는다. 새 S4 worktree의 동일 기준 트리는 `pnpm test` 306건/223 pass/83 환경 skip/0 fail 및 PR 본문 검사 8 pass다. S3 공유 WSL DB·Chrome 결과는 아래 이전 기록의 exact PR 트리 검증이며 이번 병합 후 재실행한 DB/브라우저 시험은 아니다.
- 이전 S3 원격·Windows/WSL 로컬 작업 브랜치 `codex/s31-checkout-reservation-plan`을 삭제하고 작업 worktree를 정리했다. Windows Git 제거 중 긴 pnpm 파일명으로 orphan 폴더가 남아 정확한 폴더만 제거했다(정리 오류 1회·원인 Windows 경로 길이, 재시도 성공). worktree의 Git 비추적 `.superpowers` 기록 34개/130,644바이트는 SHA-256 대조 후 프로젝트 루트 `.superpowers`에 보존했다. 다른 사용자 미추적 자료·공유 DB는 변경하지 않았다.
- 다음 단일 작업 브랜치 `codex/s4-payment-refund`를 최신 `origin/main`에서 `D:\Project\shoppingmall2\.worktrees\s4-payment-refund`에 만들고 잠금파일 의존성·기준 시험을 확인했다. S4는 새 결제·환불 API/영속 schema 계약 승인이 별도로 필요한 단계다. 현재는 계약·계획 조사만 하며 신규 migration·공유 DB·외부 PG·Oracle은 변경하지 않았다. 다음 조치: S4.1 mock 결제 사건/상태 전이와 S4.2 취소·환불 계약을 나누어 신산님께 정확한 승인 범위를 제시하고, 승인된 부분을 TDD·격리 DB→WSL exact SHA 순서로 구현한다.
- S4.1 구조 조사 결과 기존 `0012`는 결제대기/만료만 허용하고, 예약에는 이미 `CONSUMED`, 쿠폰 점유에는 `USED` 상태가 있다. 새 고객 결제 시도·검증 사건·0원 결제·늦은 승인 처리와 `0013` 전진 migration 제안을 `docs/design/S4_PAYMENT_CONTRACT_DRAFT.md`에 **미승인 초안**으로 기록했다. 실제 코드·SQL·공유 DB 변경은 아직 없으며, 신산님에게 이 API/schema 계약의 구현 승인과 공유 DB 적용 승인을 별도로 확인한다.

## 진행 중 — 2026-10-04 S3.3 Task 6 공유 개발 DB 적용 승인

- Task 6 최종 코드 검증 판정: `7b1ab1fffe3b118f3f5c7eeb20dc0cbee738c486`에서 독립 리뷰의 Important(외부 작성 감사→QA 대상 참조 누락)를 전체 QA 허용 대상의 역방향 감사 검사로 수정했고, `ae1b7a3` 격리 DB RED→수정 후 23 pass/0 skip/0 fail GREEN을 확인했다. 같은 리뷰 agent의 읽기 전용 재판정은 새 Critical/Important 0, 기존 Minor `/skipped 1/`도 `\b`로 해소. 최신 SHA 로컬 `pnpm test` 306건/223 pass/83 DB·환경 skip/0 fail + PR 본문 8 pass, typecheck/lint/build exit 0(Next 15경로). WSL 지정 checkout 같은 SHA·공유 개발 DB 전체 순차 **307건/290 pass/17 환경 skip/0 fail**, 사후 QA 15범주 각 0·일회용 시험 컨테이너 0. 격리 PG/네트워크·QA API/Web·빌드 볼륨·9091/9092 포트·브라우저 탭·이번 임시 덤프 각각 잔류 0, 기존 DB migration 13건 보존. 실제 PG·Oracle·UAT·다른 구매자 브라우저 IDOR·자연 만료 UI·200% 확대는 PASS 아님. `.github/PR_REQUEST.md`는 S3.1 구문을 S3 전체의 목적/영향/검증/미검증/rollback으로 교정하고 validator exit 0; Stage PR/CI/병합은 이 문장 시점 아직 미수행이다.
- 독립 리뷰 결과: 최신 QA reset에는 **Important 1건**—외부 계정 작성 감사 이력이 QA 구매자 배송지를 가리킬 때 사전 거부하지 않아 고아 감사 이력이 남을 수 있음—과 Minor 1건(`/skipped 1/` 부분 일치)이 확인됐다. PR/병합을 보류하고 기존 `shoppingmall-s33-address-reset-pg-1005`/전용 네트워크 이름을 다시 쓰는 fresh tmpfs DB(외부 포트·볼륨 없음)에서 역방향 외부 감사 참조 RED→좁은 사전 거부 GREEN을 확인한다. 공유 DB는 QA 15종 0을 유지하며 이 수정 검증에 사용하지 않는다. 담당 어울 단일 writer, 리뷰 agent는 읽기 전용.
- 최종 공유 회귀 예정 자원: 보정된 exact SHA `07b8f71`을 WSL 지정 checkout에서 사용해 기존 `local-postgres/shoppingmall`에 연결한 일회용 `shoppingmall-s33-final-shared-test-node-1005`(기존 `node:24-bookworm-slim` 이미지, `--rm`, 기존 `postgres_env_default` 연결, 소스 읽기 전용)만 실행한다. `QA_ISOLATED_SHARED_FIXTURE_TEST`와 전역 배송정책 변이 식별자는 설정하지 않는다. 시험 후 QA 15범주 0·컨테이너 0·DB migration 13을 확인하고 기존 DB/네트워크/백업은 변경하지 않는다.
- 후속 보정 검증 결과: `07b8f715b12bb8ba80c93a9f672f5df25de23be8`의 추가 거부 시험은 QA 운영자의 감사 이력이 외부 계정 소유 `customer_address`를 지칭할 때 reset 전체가 rollback되는지 확인한다. 격리 tmpfs DB 0000~0012 적용 뒤 `qa-promotion-ui-reset-db.test.mjs` **23 pass/0 skip/0 fail**, 사후 계정/주문/감사/배송지 0. PG 컨테이너 tmpfs·볼륨 없음·외부 포트 없음, 정확한 임시 PG·네트워크 제거·부재 확인. 로컬 `pnpm test` 306건/223 pass/83 DB·환경 skip/0 fail + PR 본문 8 pass, `pnpm lint`·`pnpm typecheck` 성공. 첫 `pnpm build`는 D: 작업트리가 현재 도구의 쓰기 샌드박스 밖이라 API dist에 TS5033 EPERM(환경 오류 1회); 동일 소스에서 허용된 빌드 재실행 exit 0, Next 15 경로. 독립 리뷰는 진행 중이며 PG·Oracle·UAT·타 구매자 브라우저 IDOR·자연 만료는 여전히 미검증이다.
- 실제 Chrome/HTTP QA 결과(기준 `aae3ac9`): 가상 구매자 주소를 저장하고 판매자 A 고추 23,000원·어울몰 고춧가루 18,000원·판매자 B 마늘 16,000원을 장바구니에 담았다. 예약 원견적 상품 57,000원+발송별 배송비 9,000원=66,000원, 결제대기 주문 `274c0b70-daf6-4de0-aa5c-79b9ed565262` 1건/발송 주문 3건을 브라우저 생성·본인 재조회로 확인했다. 실제 결제/PG 없음. 구매자 주문 GET HTTP 200, 같은 idempotency key·같은 본문 POST 200/같은 주문 ID, 같은 key·금액 변경 POST 409, 판매자 GET 403·비로그인 GET 401. 판매자 세션의 구매자 화면 접근 거부, 390px 장바구니/고객 주문 조회 document scrollWidth=clientWidth 375px, Tab→Enter 주문 조회 성공. **다른 구매자 계정의 실제 브라우저 IDOR와 자연 만료는 별도 미검증**(격리 DB 회귀는 기존 통과).
- QA 정리 첫 시도는 구매자가 실제 UI에서 만든 `customer_address` 감사 이력이 reset 허용 대상에 없어 안전하게 rollback, 삭제 0건. 읽기 전용 감사 대상 조회에서 다른 불일치가 없음을 확인한 뒤 `b92a54d`가 허용 범위를 해당 QA 구매자 소유 배송지 ID로만 추가하고 실DB fixture에 같은 이력을 넣었다. 첫 push 대상 이름 오류 1회(`github-sinsan-develop`는 Git remote가 아닌 SSH host), 실제 `origin` URL이 그 별칭임을 확인하고 origin push→WSL fast-forward. 보정 reset은 계정 5건 포함 QA 주문·감사 전부 정리했고 사후 accounts/sellers/products/addresses/reservations/lines/orders/shipments/lines/allocations/events/campaigns/uses/audit/sessions **15범주 모두 0**. 임시 Chrome 탭·viewport override 원복, QA API/Web 컨테이너는 `--rm`으로 stop 즉시 자동 제거(별도 `docker rm`은 이름 없음 오류 1회), 전용 빌드 볼륨 2개 제거. 이번 0012 사전 덤프의 WSL 호스트·`local-postgres` 내부 정확한 파일은 크기/0600/동일 SHA-256을 재확인 후 두 개만 제거하고 부재 확인; 다른 백업은 보존했다.
- 후속 보정 검증 계획: 공유 DB는 현재 QA 잔류 0을 유지한다. 기존 이미지 `pgvector/pgvector:0.8.2-pg15`·`node:24-bookworm-slim`로 임시 `shoppingmall-s33-address-reset-pg-1005`와 전용 네트워크 `shoppingmall-s33-address-reset-1005`를 생성한다(외부 포트/영속 저장소 없음, PG tmpfs). 같은 `b92a54d` 소스로 0000~0012 적용 후 `qa-promotion-ui-reset-db.test.mjs` 실제 DB 회귀에서 자기 배송지 감사 허용/외부 대상 거부를 확인하고 정확한 임시 자원만 제거한다. 로컬 정적/전체 검사와 최종 독립 리뷰를 이어가며 PG/Oracle/UAT는 여전히 미검증이다.
- 후속 Task 6 실제 브라우저 QA 착수 계획: 기존 고정 공유 QA 식별자 `f44f1004`를 재사용하되 사전 15범주 행 0을 확인한다. 결제대기 주문이 생기면 기존 `qa-promotion-ui-reset.ts`가 주문 FK를 정리하지 못하므로, 단일 코드 writer가 주문·발송·혜택배분·상태사건의 QA 소유권 사전 검사와 역참조 삭제를 TDD로 추가한다. 본 공유 DB에 QA seed를 쓰기 전에 private tmpfs `shoppingmall-s33-reset-pg-1004`와 전용 네트워크 `shoppingmall-s33-reset-1004`에서 위험 거부·정상정리 테스트를 한다(외부 포트·영속 볼륨 없음). 이 두 전용 자원은 정확한 대상/데이터를 확인해 사용 후 제거한다. 기존 branch/worktree 외 신규 branch/worktree 금지, PG·Oracle·실결제 제외. 책임자 어울은 QA 자원·검증/리뷰·기록만 관리하고 코드 writer는 이 reset 도구·대상 테스트만 수정한다.
- 실제 브라우저 자원 사전 계획: reset 코드의 독립 검토 전 공유 DB seed 금지. 검토 후 WSL 지정 checkout의 동일 push SHA로 읽기 전용 소스를 사용해 일회용 `shoppingmall-s33-shared-ui-build-1004`, `shoppingmall-s33-shared-ui-api-1004`, `shoppingmall-s33-shared-ui-web-1004`와 전용 API dist/Web .next 빌드 볼륨 `shoppingmall-s33-shared-ui-api-dist-1004`, `shoppingmall-s33-shared-ui-web-next-1004`만 생성한다. WSL 루프백 9091/9092와 필요할 때만 Windows 임시 전달, 임시 Chrome 프로필/9229 포트를 사용한다. 사전 WSL/Windows 포트·컨테이너·볼륨 점유는 0으로 확인했고 shared 계정/상품/주문도 0이다. 사용 후 정확한 QA run 행·컨테이너·볼륨·포트·브라우저 프로필만 제거하고 잔류 0을 확인한다. 기존 네트워크·DB·다른 자원은 대상이 아니다.
- Task 6a 중간 판정: 단일 코드 writer `12542cc`는 시험 전용 reset과 실DB 테스트 두 파일만 커밋했고, private tmpfs 0012의 집중 19 pass·전체 316 total/308 pass/8 skip/0 fail, 로컬 304 total/222 pass/82 skip/0 fail, typecheck/lint exit 0을 보고했다. 책임자가 private PG/네트워크 부재와 shared 계정/주문/발송 0을 독립 조회했다. 그러나 독립 리뷰는 Important 2건(외부 혜택 사용이 QA 버전/발급을 참조하는 경우의 삭제 전 검사 누락, 새 실DB 시험의 host만 확인한 seed 선행)을 지적해 **공유 브라우저 QA 사용 보류**. 동일 writer에 fix round 1/5를 지시했고 새 private 검증·재리뷰 전까지 공유 seed 금지. 빌드는 이 Task에서 미실행; PG/Oracle/UAT 여전히 미검증.
- Task 6a 최종 판정: 같은 writer `96da5ff`가 위 두 Important를 RED→GREEN으로 보정했다. private 0012 집중 **23 pass/0 skip**, 전체 순차 **320 total/312 pass/8 환경 skip/0 fail**, typecheck/lint/PR 본문 8 pass. 정확한 private PG/네트워크 제거를 책임자가 독립 조회했고 공유 계정/주문/혜택사용 0을 확인했다. 수정 범위 재리뷰는 두 Important 모두 ADDRESSED, 신규 Critical/Important 0; `/skipped 1/` 정규식이 두 자릿수 skip도 부분 일치할 수 있다는 Minor 1건은 최종 리뷰에서 재평가한다. 실제 공유 Chrome·390px·키보드·PG·Oracle·UAT는 여전히 미검증. 이번 임시 전체 백업의 WSL 호스트 및 `local-postgres` 내부 정확한 파일 권한은 모두 0600으로 재확인했다.
- 실제 Chrome 착수: 검토된 단일 SHA `aae3ac9af3e22071b7f3b3333d83062d492d8fa8`이 로컬/원격/WSL 지정 checkout에서 같고 clean, SQL hash 불변, 공유 DB migration 13건·계정/상품/주문/캠페인 0건이었다. 계획한 9091/9092와 컨테이너/볼륨 이름의 사전 점유 0. 전용 API dist/Web .next 볼륨 두 개를 만들었다. 첫 API 빌드는 루트에 없는 `node_modules/.bin/tsc`를 지정해 시작 전 모듈 경로 오류 1회(제품/DB 영향 0); API 패키지의 실제 도구 경로를 읽기 전용 확인하고 같은 소스에서 재실행해 API exit 0, Web 생산 빌드 15 경로 exit 0. WSL 루프백 API `/ready`와 웹 `/login` 및 Windows 자동 전달의 두 주소 모두 HTTP 200. `shoppingmall-s33-shared-ui-api-1004`/`-web-1004`는 시험 중 가동 중이고 빌드 컨테이너는 자동 제거됐다. QA seed/reset 실행기는 추가로 정확한 `shoppingmall-s33-shared-ui-seed-1004` 일회용 Node 컨테이너 하나만 사용하며, 기존 `f44f1004`의 가상 5계정·3판매자·5상품과 시험 주문만 만든다. 시험 후 이 실행기도 0을 확인한다. API 첫 readiness 연결 거부 2회와 웹 1회는 기동 직후 200으로 회복된 startup race이며 제품 오류로 표시하지 않는다.

- 담당 어울, 기존 단일 writer `codex/s31-checkout-reservation-plan@81ac9ac34fe607b2fe3a1e7784842b48b313c3a7`. 신산님이 `WSL-server`의 `local-postgres/shoppingmall`에 검증된 `0012_s3_orders`만 적용하도록 별도 승인했다. PG·Oracle·실결제·운영 DB는 범위 밖이다.
- 적용 전 읽기 전용 확인: WSL 지정 checkout은 같은 SHA/clean, SQL SHA-256 `efe1d8848186d4b74c202241d20cc0a80a4417078e469aa3b082a294b8d267fa`, 공유 DB 이력 12건·신규 주문 테이블 부재·계정/상품/예약 0건. `local-postgres` 외 비슷한 이름의 다른 DB 컨테이너는 대상이 아니다.
- 사전 QA/복구 자원 계획: `local-postgres` 내부 `/tmp/shoppingmall-s33-0012-pre-20261004.dump`에 custom-format 전체 백업을 만들고 WSL 호스트 `/tmp/shoppingmall-s33-0012-pre-20261004.dump`로 복사해 형식·목록·해시를 확인한다. 0012만 적용하고 이력 13건/신규 5관계/기존 행 불변을 대조한다. 실패 시 임의 역마이그레이션·DB 초기화 없이 적용을 멈추고 백업을 보존하여 별도 복구 결정을 받는다. 성공 후 정식 공유 DB QA에는 고유 가상 계정/상품/주문만 쓰고 정확한 ID의 데이터·임시 컨테이너/포트/터널을 정리한다. 백업은 적용·QA 확인 전 제거하지 않는다.
- 미검증: 공유 DB 적용 결과, 공유 DB 순차 회귀·실제 Chrome 3발송/멱등/권한/390px·키보드, PG·Oracle·사용자 인수. 동일 근본 원인 연속 오류 0회.
- 적용·검증 결과: 지정 WSL clean checkout과 로컬 작업 기준은 `81ac9ac34fe607b2fe3a1e7784842b48b313c3a7`, SQL 해시는 위 값으로 일치했다. 기존 백업 경로 부재를 확인하고 `local-postgres/shoppingmall` 전체 custom-format 덤프를 생성해 형식·목록, 호스트 파일 0600/106,542바이트, 컨테이너·호스트 동일 SHA-256 `6f25730321c21727b46e8b81e9738f3208752b0ce771ddf7a0f2f83bae235d2c`를 확인했다. 읽기 전용 미리보기는 적용 12/대기 0012 한 건·32문장·SQL 해시 일치. 같은 SHA의 Drizzle migrator가 exit 0으로 0012를 적용했다. 사후 이력 13건/마지막 해시 일치·기존 계정/상품/예약 0건 불변·신규 주문 관계 5개 각 0건, 사후 미리보기 대기 0.
- 정식 공유 DB 회귀의 **첫 시도는 `DATABASE_URL`을 전달하지 않아 302건 중 80건이 DB 환경 skip**이었다. 이는 실DB 검증으로 세지 않았다. DB URL을 명시한 목표 주문 스키마 시험 1 pass/0 skip, 전체 순차 회귀 **303건/289 pass/14 skip/0 fail**, 종료 0. 격리 DB 고유 ID가 필요한 전역 배송정책 변이 시험은 공유 DB에서 실행하지 않았고, 나머지 환경 skip도 PASS로 승격하지 않는다. 사후 계정/판매자/상품/배송지/예약/예약품목/주문/발송/발송품목/혜택배분/주문상태/캠페인/혜택사용/감사/세션 15범주 모두 0; 지정 일회용 Node 컨테이너 잔류 0. 같은 근본 원인 연속 오류 1회(시험 DB URL 누락), 수정 후 재검증 성공.
- 임시 전체 덤프는 공유 DB의 실제 Chrome 주문 QA가 남아 있어 호스트 `/tmp/shoppingmall-s33-0012-pre-20261004.dump`와 `local-postgres` 내부 같은 경로에 보존한다. 다른 백업은 건드리지 않았다. 다음은 공유 DB의 정확한 가상 ID fixture/안전 reset 계획과 실제 Chrome 3발송·멱등·권한·390px/키보드 시험이다. 브라우저·PG·Oracle·UAT는 아직 PASS 아님.

## 진행 중 — 2026-10-04 S3.3 영속 주문 구현 승인

- 담당: 어울, 단일 writer. 신산님이 `S3_ORDER_CONTRACT_DRAFT.md`의 고객 API 2개와 `0012` 신규 관계 5개의 **구현**을 승인했다. 공유 `WSL-server`의 `local-postgres/shoppingmall` 적용, PG·Oracle 연동/배포는 승인 범위 밖이다.
- 작업 위치: `D:\Project\shoppingmall2\.worktrees\flat-v2-prototypes`, 브랜치 `codex/s31-checkout-reservation-plan`, 시작 HEAD `d630efe`. 새 branch/worktree를 만들지 않는다. 변경 전 Git clean, 원격은 `github-sinsan-develop` SSH alias.
- 기준 검사: 로컬 `pnpm test` 285건/212 pass/73 DB·환경 skip/0 fail, PR 본문 검사 8 pass. DB skip은 실DB 검증이 아니다. 다음은 격리 DB에서 0011 부재 RED → 0012 적용 GREEN, 이후 계획 Task 2~6을 차례로 수행한다.
- 격리 QA 자원 계획: WSL 지정 checkout의 동일 SHA를 Git으로 전달한 뒤 고유 `shoppingmall-s33-1004` 접두어의 전용 비공개 Docker 네트워크·tmpfs PostgreSQL 컨테이너(`shoppingmall` DB명은 fixture 가드용, 공유 `local-postgres`와 별도)와 일회용 Node 컨테이너를 사용한다. 외부 포트·영속 볼륨 없음. 각 시험 직후 정확한 QA 행·컨테이너·네트워크 잔류 0 확인 후 제거한다. 공유 DB schema/행은 변경하지 않는다.
- 미검증: S3.3 구현/실DB, 공유 개발 DB 0012, 실제 브라우저 주문, PG·Oracle·사용자 인수. 같은 근본 원인 연속 오류 0회.
- Task 1 주문 영속 계약: RED 시험 전용 커밋 `4574f22`을 SSH alias로 push→WSL 지정 checkout fast-forward하고, 독립 비공개 tmpfs `shoppingmall-s33-pg-1004`에 기존 0000~0011만 적용해 `order-schema-db` **0 pass/1 예상 fail/0 skip**(`checkout_orders` 부재)를 관찰했다. 이후 구현 커밋 `bfd38eb`을 동일 경로로 fast-forward하고 `0012_s3_orders.sql` SHA-256 `efe1d8848186d4b74c202241d20cc0a80a4417078e469aa3b082a294b8d267fa`를 적용했다. 새 관계 5개: `checkout_orders`, `shipment_orders`, `shipment_order_lines`, `order_promotion_allocations`, `order_status_events`. 기존 0000~0011 SQL은 불변이다.
- Task 1 검증: 위 private DB에서 목표 시험 **1 pass/0 fail/0 skip**, 전체 순차 실DB **286 total/273 pass/13 환경 skip/0 fail**, exit 0. 별도 새 tmpfs `shoppingmall-s33-fresh-pg-1004`의 빈 DB에서도 0000~0012 전량 적용·migration 13건·목표 시험 1 pass/0 skip 확인 뒤 정확한 fresh 컨테이너를 종료해 잔류 0 확인. 로컬 `pnpm typecheck`, `pnpm lint`, `git diff --check` 모두 exit 0. 원래 private PG와 private network는 Task 2~4 격리 검증을 위해 계속 사용하고, 사용 완료 시 정확한 자원만 제거한다. 공유 `local-postgres/shoppingmall`에는 0012를 적용하지 않았다.
- Task 1 복구 경계: 0012는 additive이며 주문·감사·혜택의 지속 행을 무단 삭제하거나 migration을 역적용하지 않는다. 장애 시 주문 제출을 중지하고 원인 조회 후 별도 승인된 보정 절차를 따른다. 보조 `task-start`의 Git Bash C: 경로 실행 실패 1회는 직접 `task-brief` 호출로 우회했고 제품 변경/시험 실패가 아니다. 동일 근본 원인 3회 반복 없음. 다음은 Task 2 스냅샷·원 단위 배분 RED→GREEN.
- Task 2 불변 스냅샷: `8b05ec8`에서 원 단위 안정 배분 3건을 모듈 부재 RED→GREEN으로, 실제 3발송·원판매자/혜택 버전·합계 거부 시험을 저장소 부재 RED(0 pass/1 fail/0 skip)로 준비했다. `51810d4`에서 `insertOrderSnapshot`/본인 `getOrderSnapshot` 구현 후 private DB 목표 **4 pass/0 skip/0 fail**; 발송·품목·혜택 배분의 원 합계와 모아 발송 원판매자 유지가 저장 후 조회에서도 일치했다. 실DB 전체 순차 **290 total/277 pass/13 환경 skip/0 fail**, 로컬 `pnpm test` **290 total/215 pass/75 환경 skip/0 fail** + PR 검사 8 pass, API typecheck exit 0. 입력 배열의 발송/품목 순서는 계약이 아니므로 시험은 key·집합 기준으로 수정했다. private DB는 실험을 위해 계속 보유하며 공유 DB 0012 미적용·PG/Oracle/UAT 미검증은 그대로다. 다음은 Task 3 예약 제출 원자성·멱등·혜택 점유.
- Task 3 예약 제출: 테스트 커밋 `7c0a427`을 WSL private 0012에서 신규 서비스 부재 RED(0 pass/1 fail/0 skip), 구현 `b15c1f0`에서 계정→예약→옵션/재고→혜택 잠금, 같은 키/같은 요청의 저장 스냅샷 반환, 다른 키 같은 예약 1회만 저장, 본인 배송지·현재 견적·실재고/혜택 검증과 불일치 전체 rollback을 구현했다. 첫 목표 실행은 주문 검증 뒤 **시험 정리 순서**가 reservation-line FK를 남긴 채 상품 옵션을 지우려 하여 23503 실패 1회. read-only 진단에서 전용 private DB의 `qa+928aae13-*` 5계정이 남았고, exact DB가 무공개포트/tmpfs/무볼륨임을 확인해 그 전용 컨테이너만 폐기·재생성하고 0000~0012를 재적용했다. `4ad69f0`에서 시험 예약 품목→예약 삭제를 카탈로그 reset보다 앞에 놓아 목표 1 pass; `fc248ff`에서 할인 쿠폰 점유·금액 불일치·품절·중지 캠페인 rollback을 추가해 목표 **2 pass/0 skip/0 fail**. 이후 private DB 계정·주문·예약·혜택 사용·캠페인 5범주 **0|0|0|0|0**.
- Task 3 전체 게이트: WSL 지정 checkout `fc248ff` private 0012 전체 순차 **292 total/279 pass/13 환경 skip/0 fail**, 로컬 `pnpm test` **292 total/215 pass/77 DB·환경 skip/0 fail**와 PR 검사 8 pass; `pnpm typecheck`, `pnpm lint`, `git diff --check` 모두 exit 0. 예상 실패/정리 오류를 성공으로 세지 않았다. 계정/쿠폰/주문은 같은 transaction이므로 금액 불일치 후 점유 0을 확인했다. 공유 DB 0012, 실제 브라우저 주문, PG·Oracle·UAT는 미검증. 다음은 Task 4 결제대기 만료와 기존 예약 만료 경로의 상태 일치.
- Task 4 결제대기 만료: 테스트 전용 `6e2fdfa`에서 새 만료 모듈 부재 RED(0 pass/1 fail/0 skip), 구현 `7d40f1c`에서 주문·하위 발송·예약·HELD 혜택을 하나의 transaction으로 종료한다. 기존 예약 조회/만료 배치도 같은 주문 종료 코어를 호출하게 해 이중 만료와 유령 주문을 막고, 결제대기 주문의 예약 단독 해제/취소를 거부한다. 계획 파일 목록 밖의 `checkout/reservation-service.ts` 수정은 이 일관성 때문에 필요했다. WSL private 0012 목표 **1 pass/0 fail/0 skip**, 전체 순차 **293 total/280 pass/13 환경 skip/0 fail**, 로컬 typecheck/lint exit 0. 공유 DB·PG·Oracle·UAT 미검증. 다음 Task 5는 본인 고객 API와 Flat v2 구매 화면이다.
- Task 5 고객 API·화면: 시험 전용 `5df2191`의 신규 HTTP 경로는 격리 DB에서 예상대로 404, 웹 helper 미구현은 로컬 import RED였다. 구현 `c9782ee`은 `POST /customer/checkout/orders`의 고객 세션/Origin/UUID 멱등키·서버 금액·본인 배송지 검증과 `GET /customer/checkout/orders/:id` 본인 스냅샷 조회, Flat v2 장바구니 배송지 선택/결제대기 주문 생성/계정 조회를 연결했다. `f722ee5`에서 HTTP 시험이 없는 GET 루트를 익명 인증 대상으로 삼은 시험 오류 1회 수정; `117716e`에서 QA 판매자 계정을 고객으로 로그인하려던 시험 오류 1회는 별도 시험 고객으로 수정(`29759ba`). private 목표 3 pass, 타 고객 주문·배송지 차단과 본인 삭제 배송지 구분도 추가 검증했다. 결제 완료/PG 호출은 없다.
- 1차 읽기 전용 리뷰 판정은 미해결 Important 6건으로 **병합 보류**였다. `d91f345` RED→`b0b6e92` GREEN으로 발송별 승인 배송 불가 우편번호를 서버 제출 트랜잭션에서 확인하고, `b6f3b7e` 격리 DB 잠금 경합 RED→`7e90930` GREEN으로 관리자 취소를 예약→옵션 잠금 순서로 맞췄다. `52de4f2` RED→`bef4254` GREEN으로 본인 GET의 주문·발송 상태를 RR 읽기 transaction 한 시점에 고정했다. 로컬 웹 RED→`6e6a039` GREEN으로 이전 주문과 새 예약을 세션에서 분리(공개 API 변경 없음), `03cc619` HTTP RED→`c6dab73` GREEN으로 본인 삭제 배송지는 409, 타인 배송지는 404를 반환한다. `0e07996`/`94df028`에서 0012 다섯 관계의 사전 존재 확인과 `S3_ORDER_SCHEMA_REQUIRED=1` 엄격 모드를 모든 S3.3 실DB 시험에 넣어 공유 0011에서 QA seed 전 skip하도록 했다. 첫 엄격 실행의 가드 단위 시험은 환경변수에 의존해 실패 1회였고 명시 인자로 분리해 재시험 **8 pass/0 skip/0 fail**. 각 오류는 별개 원인이며 동일 근본 원인 3회 연속 없음. 재리뷰 판정은 진행 중.
- Task 6 현재 검증 SHA `94df028172afb62bdef99a6aaa75900b4b71c66c`: 로컬 `pnpm test` **300 total/220 pass/80 DB·환경 skip/0 fail** + PR 본문 검사 **8 pass**, `pnpm typecheck`·`pnpm lint`·`pnpm build`·`git diff --check` exit 0. SSH 별칭 push→지정 WSL checkout fast-forward로 동일 SHA·clean을 확인하고 private 0012 tmpfs DB에서 엄격 모드 목표 **8 pass/0 skip/0 fail**, 전체 순차 **300 total/287 pass/13 환경 skip/0 fail**. QA accounts/products/reservations/orders/shipments/promotion uses/audit **7범주 모두 0**이며 일회용 Node 컨테이너 0. private PG·network는 재리뷰/추가 QA가 끝나면 정확한 자원만 종료·제거한다. 공유 `local-postgres/shoppingmall`은 읽기 전용으로 migration 12건·계정/상품/예약 0·`checkout_orders` 부재를 확인했을 뿐 0012 미적용. 공유 DB 0012 적용·그 환경의 실제 Chrome/390px/키보드·PG·Oracle·사용자 인수는 미검증이며 별도 승인 gate가 남았다. Stage PR/병합도 아직 하지 않았다.
- 2차 재리뷰는 기존 Important 6건 중 5건 해소, 이전 주문 복원 비동기 경합 1건과 전역 배송정책 변경 시험의 공유 DB 노출 1건을 Important로 판정했다. 로컬 RED→`ca47c67` GREEN에서 이전 GET의 주문·예약 ID를 시작 시 고정하고 응답 시 현재 저장 ID가 다르면 버린다. 배송 금지 시험은 `pg_control_system()`의 고유 시스템 식별자와 명시 `S3_ORDER_MUTATION_TEST_DB_SYSTEM_ID`가 같은 격리 DB에서만 실행하며, 없으면 하위 시험 skip이다. private DB ID를 읽기 전용으로 확인한 뒤 최신 SHA의 목표 **9 pass/0 fail/0 skip**. 최신 전체 회귀·3차 정적 재검토와 자원 정리는 진행 중이며, 이 문구는 이전 94df028 전체 PASS를 새 SHA의 PASS로 승격하지 않는다.
- 3차 읽기 전용 재리뷰는 앞선 Important 2건 모두 해소, 신규 Critical/Important 0으로 판정했다. 최신 코드 SHA `ca47c67`에서 로컬 `pnpm test` **302 total/222 pass/80 DB·환경 skip/0 fail** 및 PR 본문 **8 pass**, `pnpm lint`·`pnpm build`·`git diff --check` exit 0. `pnpm typecheck`를 Web build와 동시에 실행한 첫 회는 `.next/types` 재생성 경합으로 TS6053 실패 1회였고, 빌드가 끝난 뒤 동일 typecheck 단독 재실행 exit 0; 첫 실패를 숨기거나 통과로 대체하지 않는다. WSL 지정 checkout 동일 코드 SHA의 private 0012 전체 순차 **303 total/290 pass/13 환경 skip/0 fail**, 대상 변이 하위 시험 포함 목표 **9 pass/0 skip/0 fail**. 사후 계정/판매자/상품/배송지/예약/주문/발송/품목/혜택배분/상태사건/혜택사용/감사 **12범주 모두 0**. 정확한 PG `shoppingmall-s33-pg-1004`는 tmpfs·영속 mount 0·공개 port 0, 전용 네트워크 `shoppingmall-s33-1004`의 유일 컨테이너였음을 확인한 뒤 두 자원만 제거하여 부재 확인했다. 공유 `local-postgres`·기타 컨테이너/네트워크/백업은 변경하지 않았다. 남은 gate: 공유 DB 0012 적용 별도 승인, 그 환경의 실제 Chrome·390px/키보드·Stage PR/병합, Oracle/PG/UAT. S3.3을 인수 합격이나 결제 완료로 표시하지 않는다.

## 설계 검토 요청 — 2026-10-04 S3.3 영속 주문

- 담당 어울. S3.2 기능·QA 종료 뒤 현재 브랜치에서 `docs/design/S3_ORDER_CONTRACT_DRAFT.md`와 `docs/superpowers/plans/2026-10-04-s3-orders.md`를 **제안 문서만** 작성했다. 제안은 고객 공개 API 2개, additive `0012`의 신규 영속 관계 5개, 한 통합 결제대기 주문+판매자/발송별 주문 3건, 불변 주소·상품·혜택/금액 스냅샷, 15분 예약·쿠폰 점유와 동시 만료를 대상으로 한다. 실제 PG·결제 완료·환불은 포함하지 않는다.
- 신산님의 위 API·schema **구현** 직접 승인과, 격리 검증 후 공유 `local-postgres/shoppingmall`에 `0012` **적용**하는 별도 승인은 아직 없다. 설계·계획 초안은 이 승인을 대신하지 않으며 S3.3 코드·DB 변경은 시작하지 않는다. 기존 S3.2 완료 증거·브랜치/WSL SHA는 아래 기록. 문서 검토와 승인 요청 전·후에도 영향 없는 읽기 전용 분석은 가능하다.

## 진행 중 — 2026-10-04 S3.2 공유 DB 실제 화면 QA

- 담당 어울 단일 writer. 시작 기준 `codex/s31-checkout-reservation-plan@c73dd9c9c50e257f888ef70b5fd361cf65c35be8` clean, WSL checkout 동일 SHA. S3.2 Task 6 Step 4~5의 공유 DB 실제 운영자·구매자 Chrome 검증을 이어간다. 앞선 0011 적용·공유 DB 전체 278건 회귀와 격리 브라우저 3발송 결과는 재사용하되 정식 공유 DB 화면 PASS로 대신하지 않는다.
- 식별 자료/정리: 새 `QA_RUN_ID=f44f1004`, 가상 5계정·판매자 3·상품 5(기존 fixture), 이 ID 접두어 캠페인 최대 2개(상품 할인 직접 발행 1, 배송비 지원 코드 1), 고객 장바구니 3품목·15분 예약 1건만 사용한다. 기존 정리 도구의 격리 DB 전용 guard는 보존하고, 새 ID와 정확한 `local-postgres:5432/shoppingmall` 조합에서만 공유 QA reset을 허용하도록 테스트 RED→GREEN으로 보강한다. reset 전 QA 계정 5개·캠페인 제목/소유·상품 제목을 검사하고 부속 예약/프로모션/상품/계정을 역참조 정리한다. 정리 실패 시 일반 DB 전체 삭제나 기존 자료 수동 삭제로 우회하지 않는다.
- 시험 자원 계획: WSL 정식 checkout과 공유 `local-postgres/shoppingmall`, 기존 네트워크 `postgres_env_default`를 사용한다(네트워크 자체 변경 없음). 새 일회용 `shoppingmall-s32-shared-ui-build-1004`, `shoppingmall-s32-shared-ui-api-1004`, `shoppingmall-s32-shared-ui-web-1004`와 읽기 전용 소스의 빌드 출력만 담는 전용 Docker 볼륨 `shoppingmall-s32-shared-ui-api-dist-1004`·`shoppingmall-s32-shared-ui-web-next-1004`만 사용한다. Web/API 호스트 포트는 루프백 9091/9092, Windows는 `WSL-server` 별칭의 임시 SSH 터널만 연다. 브라우저 탭은 검증 후 닫는다. 시작 전에 이름/포트 점유·DB QA ID 부재를 확인하고 완료/실패 시 QA reset·주요 13범주 잔류 0과 정확한 컨테이너/볼륨/포트/터널 부재를 확인한다. 다른 컨테이너·DB·백업은 대상이 아니다.
- 검증 목표: 운영자 혜택 등록/직접 발행, 구매자 본인 목록·코드 입력, 직접 판매자 A/B+어울몰의 3발송, 상품/배송 할인과 통합 예상액, 타 역할 접근 차단, 390px·키보드 조작. 실제 주문/결제·200% 확대·Oracle/UAT는 제외한다. 필요한 로컬 test/typecheck/lint/build와 WSL 실DB 회귀를 정확한 QA 도구 커밋에서 다시 확인한다.
- 안전 정리 도구 준비: `apps/api/test/qa-promotion-ui-fixture.test.mjs`에 공유 QA run/DB 정확한 조합과 잘못된 run/host/DB 거부, 기존 격리 guard의 공유 DB 거부를 추가했다. 첫 실행은 새 export 부재로 module import 오류 1회라 판정하지 않았고, namespace import로 시험 본문 내 예상 RED(새 guard 함수 부재) 1 fail/0 skip을 확인했다. `apps/api/scripts/qa-promotion-ui-reset.ts`는 `f44f1004`에만 `local-postgres:5432/shoppingmall`을 허용하고 동일 ID의 5상품 정리 경로를 재사용한다. 목표 GREEN 2 pass/0 fail. 기존 계정·상품·프로모션을 무조건 삭제하는 경로는 없다. 같은 근본 원인 연속 3회 없음; 전체 로컬·WSL·브라우저는 후속 검증한다.
- 로컬 게이트: `pnpm test` 279건/212 pass/67 DB·환경 skip/0 fail 및 PR 본문 검사 8 pass, `pnpm typecheck`·`pnpm lint`·`pnpm build` 모두 exit 0. 로컬 skip은 공유 DB 검증으로 합치지 않는다. 변경 파일은 이 상태 문서와 QA reset/test 두 파일뿐이며 제품 API·화면·schema 변경 없음. 다음은 diff 확인·commit/push 후 WSL 지정 checkout exact SHA로 안전 guard 및 공유 DB 시험을 재현한다.
- 공유 DB 게이트: QA 도구 커밋 `965a87c512f7f6bca27e151630c32961728d3409`을 SSH alias 원격 push→WSL 지정 checkout fast-forward했고 양쪽 동일 SHA·clean이다. WSL 사전 accounts/products/campaigns/reservations `0/0/0/0`, 계획한 컨테이너와 9091/9092 listener 0, 기존 DB 네트워크 확인. QA 접두어 추가 조회 첫 시도는 SSH/SQL 인용 오류 1회로 실패했으나 앞선 accounts 0으로 해당 QA 계정 부재는 증명된다(데이터 변경 없음). 동일 SHA Node24 일회용 컨테이너의 공유 DB 전체 순차 suite는 **279 total/272 pass/7 환경 skip/0 fail, exit 0**. 다음은 전용 빌드 볼륨을 생성해 같은 SHA API/Web을 올리고 실제 화면·정리 확인이다.
- 공유 DB 실제 Chrome QA: 전용 API/Web 산출물 빌드 exit 0(Next 15 routes), WSL `local-postgres/shoppingmall`의 0011·같은 SHA에 연결한 API `/ready`·웹 `/login` HTTP 200. 가상 ID `f44f1004` 5계정·3판매자·5상품을 seed했다. 운영자 Chrome에서 상품할인 5,000원 캠페인 등록·가상 구매자 직접 발행 1건, 배송비 지원 3,000원 공용 코드 캠페인 등록을 확인했다. 구매자 Chrome은 자기 상품할인 쿠폰만 선택 가능했고 판매자 A 고추 23,000원, 어울몰 모아 발송 고춧가루 18,000원, 판매자 B 마늘 16,000원을 장바구니에 담아 3발송 원견적 상품 57,000원+배송비 9,000원=66,000원을 보았다. 15분 재고 예약 뒤 상품할인 5,000원과 각 발송 배송비 지원 3,000원씩 총 9,000원으로 예상 결제금액 **52,000원**을 확인했다(발송별 예상 20,982/16,421/14,597원). 키보드 Enter 재견적도 동일했고 390px viewport에서 문서폭/가로 스크롤폭 375/375px, 화면 크기 기본값 복원. 구매자가 운영자 프로모션 URL로 이동하면 운영자 로그인 요구 메시지만 보였다. 새 페이지에서 자기 예약 ID를 복구한 뒤 해제했다. 이는 실제 견적이며 주문·결제·쿠폰 사용 확정은 아니다.
- 오류·대응: API 첫 `/ready` 요청은 기동 직후 연결 종료 1회였고 후속 API/Web 200으로 startup race로 판단했다. Windows WSL 자동 relay와 임시 SSH tunnel이 동일 9091/9092에 동시에 LISTEN한 상태에서 in-app browser의 배송비 등록 2회가 결과 미확인으로 끝났고 DB에 미반영됨을 확인했다. 중복 포트 경합을 원인으로 추정해 해당 tunnel만 중지했고, 실제 Chrome에서 한 번 등록해 성공·목록 반영했다. Chrome CDP navigation 2회 timeout은 새 DOM 조회에서 실제 목적지 도달을 확인했고 무작정 재클릭하지 않았다. 읽기 전용 브라우저 진단식 `performance` 접근 실패 1회는 제품 데이터 영향 없음. 같은 근본 원인 세 번 연속 변경 시도는 없었다. Docker `--rm` API 컨테이너의 비동기 제거 중 전용 볼륨 제거 첫 시도 1회 거부; 정확한 컨테이너 부재를 확인한 다음 해당 볼륨만 제거했다. 다른 Windows SSH 프로세스나 서버 자원은 건드리지 않았다.
- 사용 후 정리: 공유 DB 사전 13범주 `0|0|0|0|0|0|0|0|0|0|0|0|0`, 시험 직전 정리 수치 `5|3|5|1|2|2|1|1|0|9|3|3|5`. 정확한 ID 가드의 `qa-promotion-ui-reset.ts reset`이 캠페인 2·계정 5를 제거했고 사후 accounts/sellers/products/reservations/campaigns/versions/codes/grants/uses/audit/sessions/cart/inventory **13범주 모두 0**. 생성한 API/Web/빌드 컨테이너 및 API/Web 산출물 볼륨 각 0, WSL·Windows 9091/9092 listener 0, SSH 시험 터널 종료, WSL checkout `965a87c` clean. Chrome 시험 탭은 닫혀 목록에서 사라졌고 390px override를 reset했다. in-app browser 임시 탭은 세션 교체 이후 브라우저 자체가 목록에 없어 별도 최종 재조회는 불가했으며 턴 범위 자동 정리 대상이다. 기존 `local-postgres`·타 컨테이너·기존 DB migration 12건은 보존. 미검증: 실제 200% 확대·인쇄, 영속 주문 3건·통합 PG 결제 1건·PG 환불/정산 연결, Oracle staging/UAT. 이 후 필수 review 결과를 반영해 Task 6 완료 판정과 다음 S3.3 작업을 이어간다.
- 필수 읽기 전용 리뷰는 초기 공유 QA reset에서 **Critical 1(타 계정 장바구니·쿠폰 참조 삭제 가능), Important 1(프로모션 선커밋 후 catalog 검사 실패 시 부분 정리)**을 지적해 최초 병합을 거부했다. 실제 공유 DB 시험 당시 13범주 잔류 0은 사실이나, 외부 계정이 섞인 경우의 안전성 증명으로 사용하지 않는다. `01e81ed`/`7262d2a`에서 공유 `f44f1004` 정리만 serializable 단일 트랜잭션으로 바꾸고, QA 5계정 밖의 카트·프로모션 발행/사용·수정 행을 사전 거부했다. 격리 DB의 외부 장바구니·예상 밖 상품 이미지·외부 프로모션 grant 회귀 **3 pass/0 skip/0 fail**, 각각 실패 시 타인 행과 QA 캠페인·계정이 유지됨을 확인했다. 기존 격리 정리 경로는 보존했다. 재리뷰 판정은 진행 중이며 통과 전 병합하지 않는다.
- 보완 후 정확한 WSL 시험 SHA `7262d2a8db423cba091f08aba0c426634be334c8`에서 새 일회용 private Docker 네트워크 `shoppingmall-s32-reset-1004`와 tmpfs PG `shoppingmall-s32-reset-pg-1004`(네트워크 별칭만 `local-postgres`, 공유 DB 아님)에 0000~0011을 재현했다. 전체 순차 실DB **282건/272 pass/10 환경 skip/0 fail, exit 0**(새 전용 3건은 플래그 미지정으로 여기서 skip, 앞의 목표 실행 3 pass로 별도 확인). 로컬 `pnpm test` 282건/212 pass/70 skip/0 fail + PR 본문 검사 8 pass, typecheck/lint/build exit 0. 첫 로컬 build는 D: sandbox 산출물 쓰기 EPERM 1회였고 같은 명령을 허용된 실행환경에서 재실행해 정상 종료했다. WSL `git pull`은 기존 제한 fetch refspec 때문에 1회 실패했으나 설정 변경 없이 정확한 브랜치만 `fetch`·`merge --ff-only FETCH_HEAD`로 현재 SHA에 맞췄다. 격리 시험 후 위 13범주 **전부 0**, 생성한 Node 컨테이너는 `--rm`으로 0, 정확한 PG 무영속·무공개포트 확인 후 해당 PG 컨테이너와 전용 네트워크만 제거·부재 확인했다. 공유 `local-postgres`와 그 migration·타 컨테이너·기존 백업은 건드리지 않았다. 같은 근본 원인 연속 오류 3회 없음. 남은 일: 재리뷰, 문서 commit/push·WSL exact SHA, S3.2 Stage PR gate 판정.
- 재리뷰는 앞선 Critical/Important가 해소됐음을 확인했으나 새 Important 2건(옵션/판매자 기준 삭제에서 타 계정 행위자 이력 미검사, 표시 이름 기준 상품·판매자 식별의 소유권 불충분)을 제기해 병합 보류를 유지했다. `01ef2b0`/`40f794c`에서 공유 reset 전 QA 판매자 역할·분류/상품 소유·카테고리 경로 및 QA 계정 외 재고/배송 행위자를 확인하고, QA 계정 감사 대상이 본 run의 계정·판매자·상품·예약·캠페인 등으로 한정되는지 검사한다. 외부 참조나 동일 이름의 추가 판매자가 있으면 단일 transaction 전체를 롤백한다. 새 전용 private tmpfs DB(`shoppingmall-s32-reset2-1004`)에 0000~0011 적용 후 외부 카트·쿠폰 발행·이미지로 인한 부분 실패·재고/배송 행위자·범위 밖 감사 대상·동명이인 판매자 경계를 **5 pass/0 skip/0 fail**로 재현했다. 정상 QA 캠페인 감사도 성공 정리 경로에 포함했다. 첫 lint의 미사용 callback 인자 1건을 제거해 재실행 lint/typecheck 성공; 이 실패를 통과로 대체하지 않는다. 최신 SHA 전체 실DB 회귀는 진행 중이며, 끝나기 전 1차 전체 282건을 최신 합격으로 표시하지 않는다. 두 번째 private DB·Node 자원은 시험 후 13범주 0과 정확한 대상 확인을 거쳐 정리한다.
- 두 번째 재리뷰는 위 두 Important 해소를 확인했지만 상품 revision의 외부 승인자·publication의 외부 게시자 검사가 빠진 Important 1건을 추가 제기했다. `b54253e4551a37c6879f9d2fe639e196b1758026`에서 QA admin 승인/게시 ID와 상품-개정 연결, QA 계정별 단일 시험 identity/role, 배송 정책의 본 run 승인 요청 참조까지 사전 검사한다. 이 커밋에 대한 마지막 읽기 전용 재리뷰는 **미해결 Critical/Important 없음**으로 판정했다. 별도 private DB의 외부 승인자/게시자 거부를 포함한 목표 회귀 **6 pass/0 skip/0 fail**, 정상 감사 정리도 확인했다. 같은 SHA의 로컬 `pnpm test` **285건/212 pass/73 DB·환경 skip/0 fail** + PR 본문 검증 8 pass, typecheck/lint/build exit 0. WSL 0000~0011 격리 DB 전체 순차 **285건/272 pass/13 환경 skip/0 fail, exit 0**; 목표 6건은 별도 명시적 플래그 실행으로 검증했으며 전체 suite의 skip을 pass로 합치지 않는다. 사후 13범주 전부 0, 일회용 Node 컨테이너 0, 정확한 두 번째 tmpfs PG(`shoppingmall-s32-reset2-pg-1004`, mount·공개포트 0)와 private 네트워크만 제거·부재 확인. 공유 `local-postgres/shoppingmall`은 이 보완 시험에서 변경하지 않았고 기존 migration 12건을 유지한다. 실제 주문/PG/Oracle/UAT·200% 확대·인쇄는 여전히 미검증이다. S3.2 Task 6의 기능·공유 브라우저·정리·리뷰 검증은 완료; 전체 S3는 S3.3 영속 주문 미구현으로 미완료이며 Stage 병합/PR은 아직 시작하지 않는다.

## 진행 중 — 2026-10-04 S3.2 공유 개발 DB 0011 적용

- 담당: 어울 단일 writer. 신산님이 직전의 정확한 공유 DB 0011 적용 요청에 `승인해`라고 답했다. 대상은 `WSL-server`의 `local-postgres/shoppingmall`과 `0011_s3_promotions.sql` 한 건이며 다른 DB·운영·Oracle·PG는 제외한다.
- 적용 전 읽기 전용 확인: 로컬/WSL 지정 checkout은 `codex/s31-checkout-reservation-plan@4b04591e347974d9272e8499b034355ac376cbe0` clean. 로컬/WSL SQL SHA-256 `75675ca05c8e55e3f0d8ecc7cba5ada64c304372adbde9d1bface5e82850c330`. 공유 DB `shoppingmall`, migration 11건, 계정·상품·예약 각 0, 신규 프로모션 관계 없음. 미존재 관계 확인의 첫 SQL은 셸 인용 오류로 실패 1회(읽기 전용); `psql \\dt promotion_*`로 재확인했다. 같은 원인 반복 0회.
- 적용·복구 계획: WSL checkout exact SHA의 기존 `node:24-bookworm-slim` 이미지로 일회용 `shoppingmall-s32-shared-migration-node-1004`를 `--rm --network container:local-postgres`에서 구동해 읽기 전용 dry-run(대기 0011 한 건/31문장)을 확인한다. 공유 DB 전체를 정확한 `/tmp/shoppingmall-s32-0011-pre-20261004.dump`에 0600 custom-format 덤프하고 `pg_restore --list`·크기·SHA-256을 검증한다. 기존 파일은 덮지 않는다. 그 뒤 동일 소스의 Drizzle `migrate.ts`로 0011만 적용해 이력 12건·신규 5관계·기존 행 수 불변을 확인한다. 실패하면 후속 쓰기를 중단하고 덤프와 DB 상태를 보존해 보고하며 DB 전체 restore·기존 관계 삭제는 하지 않는다.
- 적용 후 계획: 같은 checkout에서 새 프로모션 DB/HTTP 목표 시험과 전체 순차 실DB 회귀를 공유 DB로 실행한다. 식별된 QA fixture만 `finally` 정리하고 계정·상품·예약·프로모션·감사·세션 등 잔여를 조회한다. 성공 후 정확한 시험 컨테이너 부재와 백업 파일의 경로·형식·해시를 재확인한 다음 이 시험용 덤프만 정리한다. 브라우저 격리 QA의 성공을 공유 DB 회귀나 주문·PG·UAT 성공으로 대체하지 않는다. 현재 자원 생성 전, 오류 누계는 위 읽기 명령 1회.
- 실제 적용: exact SHA `7d64d81`의 일회용 Node 24에서 읽기 전용 미리보기 `11 applied/1 pending`, 대상 `0011_s3_promotions` 31문장·SQL SHA-256 일치를 확인했다. WSL `/tmp/shoppingmall-s32-0011-pre-20261004.dump`에 공유 DB 전체 PostgreSQL custom-format 덤프를 0600/86,302바이트로 만들고 `pg_restore --list` 213행·SHA-256 `061688b9514023efbb57e5b8a0070a6f6c63161a44b1edd27a1631caa027fec1`을 검증했다. 같은 SHA의 Drizzle `migrate.ts` 정상 종료 후 이력 **12건**, 최신 hash 위 0011과 동일, 신규 프로모션 5테이블, 기존 계정/상품/예약 각 0, 신규 5테이블 각 0을 확인했다. 사후 미리보기는 `12 applied/0 pending`이다.
- 공유 DB 회귀: 대상 schema/repository/admin HTTP/customer HTTP/usage DB 5 pass/0 skip/0 fail. 동일 checkout의 전체 순차 `node --test-concurrency=1 --import tsx --test --test-reporter=spec`는 **278건/271 pass/7 환경 skip/0 fail**, 바깥 셸 exit 0. 종료 후 계정/판매자/상품/예약/프로모션 5관계/감사/세션/장바구니/재고 13범주 모두 0, label `s32-shared-migration-20261004` 임시 컨테이너 0, WSL checkout clean. 덤프는 정확한 경로·형식·권한·해시를 재확인한 후 이 시험용 파일만 삭제했고 부재를 확인했다. 공유 DB에는 승인된 schema/이력만 지속된다.
- 오류·미검증: 적용 전 첫 `to_regclass` 셸 인용 실패 1회(읽기 전용), 수정 질의로 관계 부재 확인; 적용/시험 오류 0, 동일 근본 원인 연속 3회 없음. 정식 공유 DB를 통한 실제 브라우저 E2E, 실제 200% 확대, S3.3 영속 주문·S4 PG/환불, Oracle·사용자 인수는 미검증이다. 다음은 S3.2의 실제 공유 DB 화면 경로와 S3.3 새 주문 schema/API 계약 경계를 계획·증거에 대조한다.

## 진행 중 — 2026-10-03 S3.2 프로모션 구현 승인·착수

- 담당: 어울 단일 writer. 신산님이 상세 설계와 구현계획의 신규 공개 API 7개·신규 테이블 5개·0011 migration **구현**을 승인했다. 공유 개발 DB에 0011을 적용하는 승인은 별도로 확인한다.
- 작업 위치: `D:\Project\shoppingmall2\.worktrees\flat-v2-prototypes`, `codex/s31-checkout-reservation-plan@b4a13e622423896c3d9aedd61620d7e4eae69cf3`. 기존 worktree clean 및 로컬 기준선 `pnpm test` 257건/195 pass/62 환경 skip/0 fail, PR 검사 8 pass를 확인했다.
- 단계: Task 1 규칙·금액 계산 RED→GREEN 완료. 새 테스트는 모듈 부재 RED 뒤 9건 GREEN, 저가 상품 배송비 지원액이 상품금액에 잘못 묶이는 회귀를 별도 RED(1000≠3000)로 재현·수정해 최종 10건 GREEN. 원본 발송 견적은 변경하지 않는다. 전체 로컬 `pnpm test` 267건/205 pass/62 DB·환경 skip/0 fail, PR 검사 8 pass, `pnpm typecheck` 성공. lint·diff·commit은 후속 확인한다. 공유 DB·WSL checkout·운영 자원은 아직 변경하지 않았다.
- 환경 오류: 보조 계획 추적 스크립트가 D: sandbox 쓰기 거부를 만나 반복 출력을 시작해 정확한 새 `bash` 프로세스를 중지했다. 기능 오류 0, 보조 스크립트 오류 1회. 제품 파일 변경 전 상태였으며 이 실패를 제품 시험 결과로 세지 않는다. 추적은 이 파일로 지속한다.
- 미검증: S3.2 영속 schema·격리 DB·WSL 실DB/HTTP/브라우저·주문/PG/Oracle/UAT. 다음: Task 1 lint·diff·안전 commit, Task 2 격리 DB 이름·수명·정리 기록 후 schema RED→GREEN.

## 진행 중 — 2026-10-03 S3.2 Task 2 격리 DB 계획

- 담당: 어울 단일 writer. Task 1 `70688ff340412fae176a5e4d99004ca9f1e96466`을 지정 SSH 별칭으로 기존 원격 작업 브랜치에 push했다. 10건 RED→GREEN·전체 로컬 267건/205 pass/62 환경 skip/0 fail·PR 검사 8 pass·typecheck/lint·diff check 종료 0. 결제·PG·공유 DB는 미검증이다.
- Task 2 임시 자원 예정: `WSL-server`의 **새** 일회성 Docker 컨테이너 `shoppingmall-s32-pg-1003`(기존 `local-postgres` 아님), 내부 DB `shoppingmall_s32_qa_20261003`, 호스트 공개 포트/영속 볼륨 없음. 신규 DB에 0000~0010 → 예상 RED → 0011 → GREEN 및 전체 재현 시험을 실행한다. 시험 계정·캠페인·쿠폰·예약·사용 행은 해당 DB 트랜잭션에서 rollback하고, 완료 후 정확한 컨테이너만 삭제해 DB도 제거한다. 기존 공유 DB와 다른 컨테이너·백업은 변경하지 않는다.
- 준비 상태: WSL 지정 checkout은 읽기 전용 확인 시 `1900c1e`로 원격 브랜치보다 뒤이며 clean이었다. 시험은 새 커밋을 push한 후 해당 checkout을 fast-forward하고 정확한 SHA에서 진행한다. 임시 DB/컨테이너는 아직 생성하지 않았다.
- 환경 오류 누계: Task 1 보조 추적 스크립트 sandbox 쓰기 거부 1회, WSL 기본 `bash`와 Git Bash 경로 차이 1회; 권한 있는 Git Bash로 임시 추적 폴더를 정상 생성했다. 같은 근본 원인 연속 3회 아님. 다음: DB 제약 시험 파일 선작성 및 격리 DB RED.
- 실제 준비/RED: 지정 WSL checkout을 `583cf654b846ec263ff66eb63e3183cbe368ae05`로 clean fast-forward했다. 이름 붙인 신규 `shoppingmall-s32-pg-1003`는 기존 `pgvector/pgvector:0.8.2-pg15` 이미지, bridge 격리, 공개 포트 없음, tmpfs 데이터, Docker mount 0으로 실행했다. `shoppingmall_s32_qa_20261003`에 기존 0000~0010 migration 11건만 적용했고, 프로모션 관계 부재라는 정확한 사유로 새 DB 목표 시험 1건 RED/skip 0을 확인했다. 기존 `local-postgres/shoppingmall`은 변경하지 않았다.
- 0011 구현 초안: 신규 관계 5개·FK/CHECK/유일 인덱스, 읽기 전용 repository와 직접 발행/공용 코드 조회를 추가했다. SQL 파일 SHA-256 `8A16344ACC0098535BEB28253F231614C3912A02873670598FAFA408C7D86E79`. repository 모듈 부재의 별도 RED를 확인했다. 로컬 typecheck/lint 성공; 로컬 루트 시험 269건/205 pass/64 DB·환경 skip/0 fail, PR 검사 8 pass. 이 2개 신규 DB skip은 GREEN 증거가 아니며, 정확한 push/WSL SHA에서 격리 DB에 0011 적용 후 0 skip을 확인해야 한다.
- 격리 GREEN: 체크포인트 `b854ee1b2b8bc6aafff47aca40a8cdf482fb0d8b`를 지정 checkout에 clean fast-forward했다. 임시 DB에 0011 적용 후 migration 총 12건, 신규 schema/repository 실DB 목표 2 pass/0 skip/0 fail. 공유 `local-postgres/shoppingmall`은 읽기 전용으로 11건 적용·0011 1건 대기(30문장, 위와 동일한 SQL SHA-256)·계정/예약 0·신규 관계 부재를 확인했다. 공유 DB SQL 적용 없음.
- 전체 격리 회귀 1차는 **실패**: 기존 `qa-public-fixture.ts`와 `qa-fixture.ts`는 URL DB명이 `/shoppingmall`일 때만 동작하는데, 지정한 격리 DB 이름은 `/shoppingmall_s32_qa_20261003`였다. 실제 스택과 guard를 대조해 환경 원인을 확인했다. 이 결과를 PASS로 세지 않는다. 앱 코드/guard를 우회 변경하지 않고, 같은 임시 컨테이너 안에 추가로 `shoppingmall` DB를 생성해 0000~0011을 새로 재현한 뒤 전체 회귀한다. 이름이 같아도 기존 공유 `local-postgres/shoppingmall`과는 완전히 다른 컨테이너이며 외부 포트·볼륨은 없다. 완료 시 두 임시 DB는 정확한 `shoppingmall-s32-pg-1003` 컨테이너 삭제로 함께 제거한다. 실패 원인별 1회, 같은 근본 원인 연속 3회 아님.
- 로컬 production build 첫 시도는 D: sandbox의 산출물 쓰기 EPERM으로 실패했으나 정확히 같은 명령을 허용된 실행 환경에서 재시도해 API/Web build 종료 0. 제품 빌드 오류로 취급하지 않는다.
- Task 2 최종 격리 판정: 이름 제한에 맞춘 **별도 컨테이너 안**의 새 `/shoppingmall` DB에서 0000~0011 전체 12 migration 재현, `b854ee1b2b8bc6aafff47aca40a8cdf482fb0d8b` exact SHA 전체 순차 실DB 269건/262 pass/7 환경 skip/0 fail, 목표 2 pass/0 skip. 계정/상품/예약/프로모션 캠페인/사용·감사 잔류 각 0. `shoppingmall-s32-pg-1003`의 label `s32-20261003`·mount 0·호스트 포트 없음 재확인 후 컨테이너와 내부 두 tmpfs DB만 제거해 부재 확인. 임시 데이터는 복구본 없이 제거됐으며 실제 사용자 데이터는 없었다. 공유 DB 11 migration·기존 계정/예약 0은 read-only 그대로다.
- Task 2 오류·미검증: 첫 격리 DB의 잘못된 이름으로 fixture guard 회귀 실패 1회, 조사 후 독립 DB로 재시험 GREEN. 처음 로컬 빌드 sandbox EPERM 1회, 권한 실행 재시험 GREEN. 동일 근본 원인 3회 연속 없음. 아직 공유 DB 0011 실제 적용, 관리자/고객 HTTP·동시 사용·브라우저·PG/Oracle/UAT 미검증. 다음은 Task 3 관리자 API를 새 격리 DB에서 테스트 우선으로 구현한다.

## 진행 중 — 2026-10-03 S3.2 Task 3 관리자 혜택 API

- 담당 어울 단일 writer, 기준 `codex/s31-checkout-reservation-plan@421df39d30af57ee57ce7e878938e47d9c02667a` clean. 이번 Task 3는 승인된 관리자 공개 경로 5개와 감사/권한만 구현한다. 고객 사용·주문·PG·공유 DB 적용은 변경하지 않는다.
- 격리 QA 계획: `WSL-server`에 새 일회성 컨테이너 `shoppingmall-s32-admin-pg-1003`, 내부 DB명 `shoppingmall`(fixture guard용), 기존 `pgvector/pgvector:0.8.2-pg15` 이미지·공개 포트 없음·tmpfs·볼륨 없음. 0000~0011 migration 전체 적용 후 고유 `QA_RUN_ID` 계정 5개, 관리자 혜택/코드/직접 grant/감사만 시험한다. 시험 후 정확한 ID의 혜택·코드·grant·감사·계정/세션을 정리하고 잔류 0을 확인한 뒤 정확한 컨테이너만 제거한다. 기존 `local-postgres/shoppingmall`과 백업은 변경하지 않는다.
- 단계: HTTP/권한/코드 충돌/한도/버전/중지 RED 작성 전. Task 2의 목표 2 pass/0 skip 및 격리 전체 269건/262 pass/7 환경 skip/0 fail은 Task 3 합격을 대신하지 않는다. 오류 0, 미검증 관리자 API 전체. 다음: 테스트 선작성·실DB 404 RED.
- 관리자 HTTP 실DB RED: `7afd353fef83f3caceee457298f48761dca7fd2b`을 지정 WSL checkout에 clean fast-forward하고 새 일회용 `shoppingmall-s32-admin-pg-1003`(DB `shoppingmall`, migration 12)를 만들었다. 목표 1건은 등록 전 경로 404로 예상 RED/0 skip, 사후 계정·세션·혜택·감사 각 0. 공유 DB는 변경하지 않았다.
- 구현 전 계약 보정: 직접 발행 `Idempotency-Key`의 재시도 이력을 보존할 필드가 신규 `promotion_grants`에 없어 테스트 우선으로 같은 0011의 새 테이블 안에 UUID 키·유일 제약을 보강한다. 이는 승인된 직접 발행 멱등 계약의 필수 필드이며 새 테이블 수나 기존 테이블 구조를 늘리지 않는다. 기존 0011은 격리 DB에만 적용됐으므로 임시 컨테이너를 정확히 재생성해 보정 SQL을 처음부터 다시 시험한다. 공유 DB 적용 전 SQL hash가 바뀌면 read-only preview도 갱신한다.
- 멱등키 보정 RED: `5f37aa67484ab84c73fcbe3a22ef548d355e60e8`을 WSL checkout에 clean fast-forward하고 현재 일회용 DB에서 schema 시험 1건을 실행해 `promotion_grants.idempotency_key` 부재(`42703`)의 예상 RED/skip 0을 확인했다. 기존 0011 SQL SHA는 이제 유효한 최신 제안이 아니며 수정 SHA-256 `75675CA05C8E55E3F0D8ECC7CBA5ADA64C304372ADBDE9D1BFACE5E82850C330`이다. 수정본은 아직 실DB GREEN 전; 공유 DB는 여전히 11개 migration·0011 미적용. 다음은 현재 정확한 임시 컨테이너를 제거·재생성하고 수정 0011부터 실DB 검증한다.
- 멱등키 보정 GREEN: 구 0011 격리 컨테이너의 계정/캠페인/사용 0을 확인 후 정확히 제거했다. `6aefaa77e0546536098a19b0a5d0f48496acd981` exact SHA에서 새 컨테이너/빈 DB로 0000~수정 0011 전체 12 migration 재현, 새 schema·repository 2 pass/0 skip/0 fail. 공유 DB 읽기 전용 미리보기는 11개 적용·수정 0011 **31문장/동일 SHA-256** 1건 대기이며 SQL 적용 0.
- 관리자 API 5경로의 service/controller와 Nest 등록을 로컬에 추가했다. 직접 발행은 캠페인 행 잠금·UUID 멱등키·계정 역할·발행 한도·감사 트랜잭션으로 처리하고, 기존 발행 grant 버전은 새 버전과 분리한다. 로컬 `pnpm typecheck` 종료 0. 아직 HTTP GREEN/전체 회귀·실브라우저는 검증 전이며 공유 DB는 변경하지 않았다. 다음: 정확한 커밋/push→WSL 동일 SHA에서 목표 HTTP 시험.
- 관리자 첫 실DB HTTP GREEN: `32e6d987643bfad2c86b5d60be2a819dec891904` exact SHA, 신규 5경로의 등록→조회→직접 발행/멱등 재시도→새 버전→코드 충돌→중지, 비관리자/위조 Origin 차단, 감사 4사건 1 pass/0 skip/0 fail. 그러나 대상 ID의 실제 존재를 아직 확인하지 않아 후속 경계 시험을 추가했다.
- 대상 유효성 RED: `cce530757ea73bcbc37b5711649b40310e23165d` exact SHA에서 존재하지 않는 판매자 UUID 입력이 201로 통과해 기대 400에 대한 RED/0 skip을 재현했다. 시험 정리 뒤 계정·캠페인·버전·코드·감사 각 0. 이제 등록/버전 변경 transaction에서 판매자 실존 및 옵션의 현재 게시·판매 가능 개정을 확인하도록 보정했다. 로컬 typecheck 성공; 동일 SHA의 격리 HTTP GREEN은 아직 전이다. 공유 DB 미적용.
- 대상 유효성 GREEN: `70e07383625ac7d6a84355ddf5f315f15df1ba53` exact SHA 격리 실DB에서 관리자 HTTP·schema·repository 3 pass/0 skip/0 fail. 이어 `42daf07d48b3dc6f5a7706c7967e0fb7c3a3529c`에서 캠페인 중지 뒤 기존 발행 키 재시도가 409로 실패하는 추가 RED/0 skip을 확인했다. 중지 전에 이미 확정된 직접 발행의 같은 키·같은 대상 재시도는 기존 grant ID를 돌려주고, 새 키 발행만 중지 거부하도록 조회 순서를 보정했다. 보정 후 실DB GREEN은 아직 전. 공유 DB 미적용.
- Task 3 완료 판정: 최신 시험 전용 SHA `cf073a27dad61592f715a8257a52169559c47993`에서 관리자 목표 HTTP 1 pass/0 skip(생성·목록·버전·중지·직접발행/멱등·코드 충돌·발행 한도·역할/Origin·대상 ID·감사 포함), 로컬 루트 270건/205 pass/65 DB·환경 skip/0 fail·PR 검사 8 pass·typecheck/lint/build 종료 0. 지정 WSL 격리 DB 전체 순차 270건/263 pass/7 환경 skip/0 fail. 사후 계정·상품·예약·프로모션 5관계·감사·세션 10범주 각 0, 임시 Node 0. label `s32-admin-20261003`·mount 0·공개 포트 없음 확인 후 정확한 `shoppingmall-s32-admin-pg-1003` 컨테이너와 tmpfs DB를 제거해 부재 확인. 임시 데이터 별도 복구본 없음, 사용자 데이터 없음. 최종 SHA는 다음 상태 기록 커밋 후 다시 확인한다.
- 미검증: 공유 DB 0011 적용, 고객 쿠폰 목록/코드 견적, 사용 점유·경쟁, 화면·실브라우저, 주문/PG/Oracle/UAT. 다음은 Task 4 고객 API를 새 격리 DB에서 RED→GREEN으로 진행한다. 같은 근본 원인 3회 연속 없음.

## 진행 중 — 2026-10-03 S3.2 Task 4 고객 쿠폰·미확정 견적

- 담당 어울 단일 writer, 기존 clean `codex/s31-checkout-reservation-plan@4eea851c07428e98e0473aad00345c4449783852`. 관리자 Task 3 원격 보존·격리 회귀는 위에 기록했다. 새 고객 공개 경로 2개만 우선 구현하고, 기존 무혜택 예약 API/금액·장바구니 동작은 보존한다.
- 이번 격리 시험 자원 계획: WSL의 새 일회용 컨테이너 `shoppingmall-s32-customer-pg-1003`(label `s32-customer-20261003`), 내부 DB `shoppingmall`, tmpfs·무볼륨·호스트 공개 포트 없음. 승인된 0000~0011을 새로 적용한 뒤 `QA_RUN_ID` 가상 구매자·판매자·운영자 5계정/공개 상품 1개/옵션·재고/예약·직접 grant·공용 코드·감사만 시험한다. 정확한 시험 ID별 혜택 사용·grant·코드·버전·캠페인·예약/카트·상품/계정/세션·감사를 순서대로 정리하고 주요 잔류 0을 확인한 뒤 이 컨테이너만 제거한다. 기존 공유 `local-postgres/shoppingmall`과 백업은 변경하지 않는다.
- 착수 계획: 목록 선택/코드 입력의 동일 견적, 남의 grant 차단, 기간·중지·무료배송 0원·무기록 견적·역할/Origin을 테스트 우선으로 진행. 착수 당시 Task 4 파일·QA 자원 없음, 오류 0이었다.
- Task 4 완료 판정: 새 `apps/api/test/promotion-customer-http-db.test.mjs`가 미구현 404로 예상 RED·0 skip을 확인한 뒤 고객 `GET /customer/promotions/coupons`, `POST /customer/checkout/reservations/:id/promotions/quote`를 구현했다. 목록은 본인 직접 발행·활성 기간·잔여 한도만, 견적은 현재 예약/가격/승인 배송 정책과 코드·직접 쿠폰을 같은 규칙으로 계산한다. 타인 grant 404, 미래·만료·중지·한도 소진·해제 예약 409, 미인증 401·판매자/잘못된 Origin 403, 무료배송 지원 0원·안내와 사용 행 0을 시험했다. 기존 예약 조회 계약·금액은 변경하지 않았다.
- 오류 기록: 고객 새 경로의 정상 예약 UUID가 400으로 거부되는 현상이 진단 과정에서 5회 관찰되었다. 주 담당 어울이 직접 원인을 UUID 정규식의 4자리 구간 누락으로 확인·수정했고, 진단용 예약 ID 응답 필드는 제거했다. 최종 목표 HTTP 1 pass/0 skip. 같은 오류의 추가 subagent 지시는 없었다.
- 최신 시험 SHA `03ca70a`에서 로컬 `pnpm test` 271건/205 pass/66 DB·환경 skip/0 fail + PR 본문 8 pass, `pnpm typecheck`·`pnpm lint`·`pnpm build` 종료 0. WSL 격리 0011 DB의 전체 271건/264 pass/7 환경 skip/0 fail. 사후 계정·상품·예약·프로모션 5관계·감사·세션 10범주 모두 0. 정확한 label·mount 0·호스트 공개 포트 없음을 확인하고 `shoppingmall-s32-customer-pg-1003` 컨테이너/tmpfs만 제거해 부재를 확인했다. 가상 자료의 별도 복구본은 없으며 공유 DB와 백업은 건드리지 않았다.
- 다음 Task 5는 점유/해제/확정 서비스와 동시 경쟁. 공유 DB 0011 적용, 최종 주문·PG·화면·실브라우저·Oracle/UAT는 아직 미검증이다. 이 상태 문서 커밋 후 정확한 SHA를 다시 확인한다.

## 진행 중 — 2026-10-03 S3.2 Task 5 쿠폰 자리 점유·해제·확정

- 담당 어울 단일 writer, 시작 기준 clean `codex/s31-checkout-reservation-plan@d819c25843962323222a70102bde6f67e92ad94f`. 주문/PG 완료 경로는 추가하지 않고, 승인된 내부 거래 서비스와 DB 경합 시험만 만든다.
- 격리 시험 자원 계획: WSL 일회용 `shoppingmall-s32-usage-pg-1003`(label `s32-usage-20261003`), 내부 DB `shoppingmall`, tmpfs·무볼륨·호스트 공개 포트 없음. 가상 2계정/상품/예약과 한도 1개 캠페인·코드·grant·use를 만들어 두 독립 DB 세션 경쟁을 검증한다. 사용 행·grant·버전/캠페인·예약/장바구니·상품/계정·감사를 정확히 정리하고 잔류 0 후 컨테이너만 제거한다. 공유 `local-postgres/shoppingmall`과 백업은 변경하지 않는다.
- 예정 검증: 같은 멱등 키 재시도, 마지막 1회 경쟁, 중지/기간/타인 grant, 무료배송 0원 미점유, `HELD→USED` 또는 `HELD→RELEASED`의 일방 전이, 종료된 예약만 안전하게 만료 해제. S4 실제 결제 승인/콜백과 접수된 결제 시도 처리 전에는 자동 사용 확정으로 주장하지 않는다. 착수 오류 0, Task 5 전체 미검증.
- Task 5 완료 판정: 내부 `PromotionUsageService.holdInTransaction`은 계정·예약 확인 후 캠페인 ID순 행 잠금, 현재 재고/금액·정책 재견적, 직접 grant/공용 코드의 동일 총·계정 한도, 코드 grant 생성·HELD 기록을 호출자 DB transaction에 묶는다. `markPaidInTransaction`/`releaseInTransaction`은 일방 상태 전이·멱등, `releaseDue`는 종료 상태 예약만 해제하고 활성/결제 시도 가능 예약은 건드리지 않는다. S4 PG 콜백에 아직 연결하지 않았다.
- 오류 기록: 첫 경쟁 목표 시험의 경합 자체는 한 건만 성공했으나, 종료된 예약의 쿠폰 해제가 원래 만료시각까지 지연돼 목표 시험 1회 실패했다. 주 담당 어울이 종료 예약은 즉시 해제하되 활성/소비 예약은 제외하도록 고쳤다. 이후 목표 DB 시험 1 pass/0 skip; 추가 IDOR·활성 예약·무료배송 0원 미점유·중지·두 발송 묶음의 같은 캠페인 한도 시험도 2 pass/0 skip. 같은 근본 원인 3회 연속 없음.
- 최신 시험 SHA `95b27d5`에서 로컬 전체 `pnpm test` 272건/205 pass/67 DB·환경 skip/0 fail + PR 본문 8 pass, `pnpm typecheck`·`pnpm lint`·`pnpm build` 종료 0. WSL 격리 0011 DB 전체 272건/265 pass/7 환경 skip/0 fail. 사후 계정·상품·예약·프로모션 5관계·감사·세션 10범주 모두 0. label `s32-usage-20261003`·mount 0·호스트 공개 포트 없음 확인 뒤 정확한 `shoppingmall-s32-usage-pg-1003` 컨테이너/tmpfs만 제거해 부재 확인. 가상 자료 별도 복구본은 없고 공유 DB/백업은 무변경.
- 다음은 Task 6 관리자·고객 화면과 정식 WSL 확인. 공유 DB 0011 적용, 실제 브라우저/UAT, S3.3 주문·S4 PG는 미검증. 이 상태 문서 커밋 후 정확한 SHA를 다시 확인한다.

## 진행 중 — 2026-10-03 S3.2 Task 6 관리자·고객 화면

- 담당 어울 단일 writer, 시작 기준 clean `codex/s31-checkout-reservation-plan@2dbbea3a297938a863ac2c1291254e1cc9119a42`. 승인된 공개 API 7개 안에서 관리자 캠페인 등록/버전/중지/직접 발행 내역 및 고객 장바구니 쿠폰 선택/코드 입력/묶음별 할인·지원 견적을 구현한다. 기존 Flat v2 톤·장바구니 수량/제거·예약 동작·키보드 접근성 보존, 결제 완료 오인 금지.
- 첫 화면 작업은 정적 렌더 시험 RED→GREEN으로 진행하고, 관리자 조회 응답에는 기존 캠페인 GET 경로의 규칙·발행/사용 집계만 보강한다. 고객 대상 자동 검색용 새 공개 API는 승인된 7경로 밖이므로 추가하지 않는다. 직접 발행 화면은 고객 계정 ID 입력과 서버 검증을 제공하며, 보다 쉬운 고객 검색은 향후 별도 계약으로 남긴다.
- WSL 정식 개발 DB의 0011 적용은 앞선 명시 승인 경계가 남아 있어 격리 DB·실제 브라우저 가능한 부분을 먼저 진행한다. 공유 DB 적용 승인 없음을 재확인하지 않은 채 적용하지 않는다. 시작 오류 0, Task 6 미검증.
- 화면 QA 자원 계획: 지정 WSL checkout의 exact SHA를 pull한 뒤 Docker 전용 네트워크 `shoppingmall-s32-ui-net-1003`, PostgreSQL tmpfs `shoppingmall-s32-ui-pg-1003`(label `s32-ui-20261003`, DB `shoppingmall`, 공유 `local-postgres` 아님), API/Web 컨테이너 `shoppingmall-s32-ui-api-1003`·`shoppingmall-s32-ui-web-1003`를 만들고 호스트 루프백 9092/9091만 임시 공개한다. Windows에서 `WSL-server` 별칭의 SSH 로컬 터널과 격리 Chrome 프로필로 구매자·관리자 실제 DOM/키보드/390px·확대를 확인한다. `QA_RUN_ID` 가상 계정·상품·예약·쿠폰/감사만 만들고 정확히 reset·잔류 0 확인 후 정확한 세 컨테이너·네트워크·터널·프로필을 제거한다. 포트·이름 점유 및 기존 데이터는 먼저 조회한다. 실브라우저 경로가 환경상 불가하면 정적 시험으로 대체해 PASS라 하지 않는다.
- 화면 정적 단계: 신규 관리자/고객 화면 시험은 각각 미구현 import 오류로 예상 RED → 4 pass/0 fail. 관리자 캠페인 조회에 현재 버전의 기간·대상·금액·발행/사용 집계를 같은 승인된 GET 경로로 추가하고, 고객 예약 견적은 기존 카트 수량/제거를 보존한 채 선택/코드·발송별 금액을 연결했다. 로컬 전체 276건/209 pass/67 DB·환경 skip/0 fail, PR 본문 8 pass, typecheck 통과. 병렬 test+lint에서 Windows lint가 1회 메모리 부족(exit 134)으로 종료됐고, 순차 재실행 lint/build 종료 0. 이는 동시 실행 자원 오류이며 누락된 PASS로 합치지 않았다. 실DB의 새 조회 집계·실브라우저는 아직 미검증.
- 화면 QA 식별자: `QA_RUN_ID=b83f3204`. 격리 `shoppingmall-s32-ui-pg-1003`의 `/shoppingmall`에만 `qa+b83f3204-* @example.invalid` 형식의 시험 계정 5개(실제 식별자에는 공백 없음), 판매자 3개, 분류·상품 1개(23,000원/재고 5개), 이 식별자를 제목에 담은 시험 프로모션 2개와 직접 발행 1개를 만들 예정이다. 구매자 장바구니·예약·프로모션 사용/감사 등 부속 행도 이 QA 계정과 캠페인에만 귀속한다. 시험 뒤 정확한 식별자에 속한 사용·발행·코드·버전·캠페인·예약·장바구니·상품·계정·세션·감사를 역참조 순으로 삭제하고 0행을 확인한 후 세 임시 컨테이너·전용 네트워크·SSH 터널을 제거한다. 공유 개발 DB/실제 계정은 대상이 아니다.
- 실제 브라우저 QA 중 개발 모드의 `127.0.0.1` 리소스 차단으로 JS가 연결되지 않아 시험 계정 로그인 폼이 기본 GET 제출을 1회 수행했다. 시험 전용 비밀번호만 사용했으며 URL을 즉시 정리했다. 같은 격리 Web 컨테이너만 중지·교체하여 production build/start로 재시험했고 운영자 로그인과 역할 전환이 실제 작동했다. 이후 등록 폼에서 정액 기본값 5000원이 `min=0.01, step=1` 제약에 걸리는 결함을 발견, 정액 최소값 1원으로 회귀 시험 RED 1건→GREEN 3건/0 fail, typecheck 통과. 격리 DB에는 QA 5계정·1상품만 있으며 공유 DB는 무변경. 다음: 보정 SHA를 push·WSL fast-forward 후 Web 재빌드, 관리자·구매자 브라우저 흐름을 재개한다.
- `2f7ab0b` 정확한 SHA의 WSL production Web에서 운영자 등록(5,000원 상품 할인·3,000원 배송 지원), 구매자 직접 쿠폰 발행, 상품 2개 장바구니·15분 예약, 목록 쿠폰+배송 코드 및 상품 코드+배송 코드 두 경로의 예상액 **41,000원**(기본 49,000원), 390px 화면 가로 넘침 없음, Tab 초점 이동, 예약 해제·수량 2→1·제거, 관리자 새 버전 4,000원·배송 지원 중지 사유를 실제 브라우저에서 확인했다. 중지 첫 요청은 일시적 연결 실패 1회였고 읽기 전용 DB에서 미반영 확인 후 재시도하여 중지 표시를 확인했다. 200% 실제 브라우저 확대는 조작 효과를 확인하지 못해 미검증으로 남긴다. 결제·주문 완료는 수행하지 않았다.
- 격리 QA 정리 도구는 정확한 QA ID·호스트·DB만 허용하고 공유 `local-postgres` URL은 거부하도록 안전 시험 RED→GREEN 1건/0 fail, typecheck 통과. 다음: 해당 도구를 안전 commit·push 후 WSL의 정확한 SHA에서 QA 캠페인·발행·예약·상품·계정을 제거하고 0행, 전체 DB 회귀 및 임시 자원 철수를 확인한다.
- Task 6 격리 QA 정리: WSL `a109758c33ab363291b3af096e4f47df54b72fe0`에서 사전 계정 5·상품 1·예약 1·캠페인 2·grant 1·use 0을 확인하고 정확한 `b83f3204` reset을 실행해 캠페인 2·계정 5를 제거했다. 사후 계정·판매자·상품·예약·프로모션 5관계·감사·세션·장바구니·재고 13범주 모두 0. 지정 Web/API/PostgreSQL 컨테이너 3개·전용 네트워크는 이름/label/mount/포트를 확인하고 제거했으며 Windows 9091/9092 LISTEN 0, SSH 시험 터널 종료, WSL checkout clean. agent 생성 브라우저 탭 2개는 닫았고 오류 페이지 `data:`로 바뀐 첫 탭은 브라우저 정책상 수동 닫기가 거부되어 턴 종료 시 자동 정리 대상이다. 다른 서버·백업·공유 DB는 변경하지 않았다.
- 최신 회귀: 로컬 `pnpm test` 278건/211 pass/67 DB·환경 skip/0 fail, 별도 PR 본문 검사 8 pass/0 fail, `pnpm typecheck`·순차 `pnpm lint`·`pnpm build` 종료 0. WSL 격리 DB 전체 첫 실행은 API 컨테이너의 공개 바인드 `API_HOST=0.0.0.0` 때문에 루프백 전용 모의 전화/이미지 시험 6건이 404로 실패했다(정상 보안 차단). 제품 서버 설정은 유지하고 시험 프로세스만 `API_HOST=127.0.0.1,NODE_ENV=test`로 재실행해 전체 종료 코드 0; PR 검사 8 pass/0 fail. 첫 실패를 통과로 대체하지 않으며 동일 근본 원인 연속 3회 아님. 재시험 뒤 QA 13범주 다시 0.
- 남은 경계: 공유 `local-postgres/shoppingmall`을 읽기 전용 재확인해 migration 11건·계정/예약 0건이다. 0011 SQL SHA-256 `75675ca05c8e55e3f0d8ecc7cba5ada64c304372adbde9d1bface5e82850c330`, 신규 프로모션 테이블 5개·제약/인덱스이며 **공유 DB에는 미적용**. 별도 적용 승인을 요청했다. 200% 실제 확대, 공유 DB 통합, PG/주문/Oracle/UAT는 미검증이다. 격리 시험 통과만으로 S3.2 인수·PR 병합 완료라 판정하지 않는다.
- 후속 3발송 브라우저 QA 계획: 새 `QA_RUN_ID=e4401004`, Docker 전용 네트워크 `shoppingmall-s32-three-net-1004`, PostgreSQL tmpfs `shoppingmall-s32-three-pg-1004`, API/Web `shoppingmall-s32-three-api-1004`·`shoppingmall-s32-three-web-1004`, WSL 호스트 루프백 9092/9091, `WSL-server` 별칭 SSH 로컬 터널만 일시 사용한다. 빈 격리 DB에 0000~0011, 기존 5개 가상 상품 fixture(구매자/판매자/운영자 5계정)를 넣고 판매자 A·B·어울몰 발송 각 1개를 장바구니에 담는다. QA 접두어의 배송비 지원 캠페인/코드만 등록해 발송 3개별 지원과 합계를 확인한다. 종료 시 그 ID의 사용·코드·캠페인·예약·상품·계정·감사를 역참조 정리하고 13범주 0, 정확한 임시 컨테이너·네트워크·터널 제거를 확인한다. 공유 DB·다른 checkout/백업은 대상이 아니다.
- 후속 3발송 브라우저 QA 결과: `codex/s31-checkout-reservation-plan@6219196bbd840bb7fe86cc785559cb123646a824`의 production Web/API와 독립 DB 0000~0011에서 운영자가 배송비 지원 3,000원·공용 코드 `QA-E4401004-SHIP`(전체 10회/고객별 3회)를 등록했다. 구매자는 판매자 A 고추 23,000원, 어울몰 모아 발송 고춧가루 18,000원, 판매자 B 마늘 16,000원을 함께 담았고, 화면은 발송 3개·각 배송비 3,000원·합계 66,000원을 보여줬다. 15분 예약 뒤 동일 코드를 각 발송에 적용해 지원 3,000원×3=9,000원, 예상 결제금액 57,000원을 실제 브라우저에서 확인했다. 390px에서 viewport 390/document 375로 가로 넘침 없음. **주문 제출·결제는 하지 않았으며 견적만 검증**했다.
- 후속 정리: UI에서 예약을 해제한 후 격리 DB의 사전 13범주 계정/판매자/상품/예약/캠페인/버전/코드/grant/use/감사/세션/장바구니/재고가 `5|3|5|1|1|1|1|0|0|6|2|3|5`임을 확인했다. `QA_RUN_ID=e4401004`와 정확한 격리 DB host를 검증하는 reset으로 캠페인 1·계정 5를 제거했고 사후 13범주 모두 0. label로 확인한 이번 전용 Web/API/PostgreSQL 컨테이너 3개와 네트워크, 브라우저 탭, SSH 터널만 제거했다. 공유 DB/백업은 변경하지 않았다. 이번 브라우저 검증 오류 0; 실제 200% 확대는 계속 미검증이다.

## 진행 중 — 2026-10-03 S3.2 승인 설계의 구현계획 작성

- 신산님이 `docs/design/S3_PROMOTION_CONTRACT_DRAFT.md`에 대해 “설계서 대로 진행하자”라고 직접 지시했다. 상세 설계 승인으로 기록하고, 신규 공개 API·영속 schema/migration·공유 개발 DB 적용은 설계서 7절의 별도 경계로 유지한다.
- 담당 어울 단일 writer, 기존 `codex/s31-checkout-reservation-plan@5a4b35670fd71e5b5ddefb723c52f3e748c65b33` clean 기준. 변경 대상은 승인 상태 문구, `docs/superpowers/plans/2026-10-03-s3-promotions.md`, 이 작업현황이다. 제품 코드·DB·서버·QA 자원 변경 없음, 계획 작성 시 시험 실행 없음. 오류 0.
- 자체 검토: 설계 1~7절을 Task 1~6·후속 S3.3/S4 경계와 대조했고, Review Focus 5개가 소유 Task의 시험에 연결됐다. 목록/코드 선택 타입은 공용 코드의 미발행 grant를 견적에서 쓰지 않도록 보정했다. 계획의 새 공개 경로 7개와 신규 테이블 5개·0011 migration은 모두 **제안**이며 현재 승인된 실행 계약이 아니다. 문서 후행 공백·미해결 placeholder는 0, 제품 시험/WSL/DB 검증은 이 문서 작업에서 실행하지 않았다.
- 다음: 정확한 문서 diff 검사·안전 commit/SSH branch push 후 신산님께 이 계획과 공개 API·schema 구현 범위의 검토를 요청한다. 공유 DB 0011 적용은 격리 PASS와 정확한 SQL 영향 확인 뒤 별도 요청한다. S3.2 구현·PR/병합·Oracle/UAT는 미완료다.

## 진행 중 — 2026-10-03 S3.2 통합 쿠폰 상세 설계 초안

- 담당 어울 단일 writer, 기존 `codex/s31-checkout-reservation-plan@1900c1e816b05bb6752c6b13057708ca21bebdc0` clean 기준. 신산님의 “계속하자”를 직전 권장안인 목록 선택·코드 입력의 단일 쿠폰 원장 방향으로 상세 설계 진행 지시로 해석한다. 이는 새 API/schema/공유 DB 적용 승인이 아니다.
- 변경 범위는 `docs/design/S3_PROMOTION_CONTRACT_DRAFT.md`와 이 작업현황의 검토용 문서뿐이다. 제품 코드·DB·서버·시험 계정·임시 자원은 생성/변경하지 않는다. 초안에는 공유 코드·목록 발행, 혜택 대상/기간/한도, 원자적 점유·해제·사용, 배송지원 상한, 취소 후 불복원, 주문 금액 snapshot, 시험과 승인 경계를 제안했다. 개인별 고유 코드는 첫 범위에서 제외하는 **제안**이며 신산님 검토 전 확정이 아니다.
- 문서 자체의 상대 링크 존재·미해결 placeholder·후행 공백과 staged `git diff --check`를 확인했다. 문서 전용 커밋 `9b51b23020093bb898fd198a186b64d5760c16b7`을 지정 SSH 별칭의 기존 작업 브랜치에 push했다. 첫 `git add`는 D: Git 메타데이터 쓰기 sandbox 권한 거부 1회였고, 정확한 두 파일만 권한 있는 동일 명령으로 재시도해 성공했다. 동일 근본 원인 반복 0. 제품 시험은 실행하지 않았으므로 PASS로 표시하지 않는다.
- 다음: 신산님께 이 초안의 상세 계약 검토를 요청한다. 승인 전에는 새 공개 API/schema·공유 DB 변경을 진행하지 않는다. 실제 구현/DB 적용/PR·병합/Oracle·UAT는 미완료다.

## 진행 중 — 2026-10-03 S3.2 쿠폰 선택 경로 결정

- 신산님이 고객의 **사용 가능한 쿠폰 목록 선택과 쿠폰 코드 직접 입력을 모두 지원**하도록 직접 결정했다. 두 입력 경로는 같은 쿠폰 사용 한도·중복 방지·금액 계산에 합류해야 하며, 코드의 공유/개인 귀속 방식과 발행·사용 상세 계약은 아직 설계 검토 대상이다. 이 선택만으로 새 공개 API·schema·공유 DB 적용을 승인받은 것으로 해석하지 않는다.
- 담당 어울 단일 writer, 기존 `codex/s31-checkout-reservation-plan@7035d07d8ce091e94a23bd131e25ca7abadeda9f` clean. 이번에는 정책 기록만 변경하고 제품 코드·DB·QA 자원 없음, 오류 0. 다음은 기존 재고 예약과 홈 전시 경계를 재사용하는 S3.2 상세 설계안의 대안·권장안·영향을 제시하고 검토를 받는다. 실제 구현/검증·PR/병합·Oracle/UAT는 미완료다.

## 진행 중 — 2026-10-03 S3.2 일부 발송 주문 취소 시 쿠폰 정책 결정

- 신산님이 권장안을 직접 승인했다. 통합 결제의 일부 발송 주문만 취소하면, 취소 주문은 그 주문에 배분된 할인액을 반영한 실제 결제 상품금액을 기준으로 환불하고 남은 주문의 기존 할인액은 다시 계산하지 않는다. 쿠폰은 사용 완료 상태를 유지한다. 예: 쿠폰 5,000원을 A 2,000원/B 3,000원 배분한 뒤 A만 취소해도 B의 3,000원 할인은 불변이다. 이는 직전 전체 취소 시 자동 복원 없음 결정과 함께 S3.2/S4 환불 계약의 입력이며 실제 API·DB·PG 환불 구현/검증은 아니다.
- 담당 어울 단일 writer, 기존 `codex/s31-checkout-reservation-plan@6411927600c59f1bc501b00eb892cfaca4c8b2f7` clean. 이번에는 정책 기록만 변경하고 제품 코드·DB·QA 자원은 변경하지 않는다. 실행 오류 0. 다음은 남은 대상·기간·한도·사용 경쟁 규칙을 제안하고, 새 공개 API/schema 및 공유 DB 영향의 정확한 설계 승인 경계를 확인한다. 실제 브라우저/WSL/PG·Oracle/UAT·PR/병합은 여전히 미완료다.

## 진행 중 — 2026-10-03 S3.2 쿠폰 반환 정책 결정

- 신산님이 권장안을 직접 선택했다. 결제 실패·예약 만료로 확정되지 않은 쿠폰 점유는 자동 해제하고, 결제 완료 후 주문 **전체 취소**에는 쿠폰을 자동 복원하지 않는다. 예외적 재지급이 필요하면 운영자가 별도 이력으로 재발행하는 방향이다. 일부 취소의 쿠폰 상태는 아직 별도 결정하지 않았다. 이 결정은 쿠폰 사용·취소 시험의 정책 입력이며 실제 쿠폰 발행/적용, 새 공개 API·schema, 공유 DB 변경의 승인이나 구현 증거가 아니다.
- 담당 어울 단일 writer, 기존 격리 브랜치 `codex/s31-checkout-reservation-plan@99bec8928cffdc5cdbd0cccb1427eb3d03ff6e11` clean에서 계약 기록만 갱신한다. 제품 코드·DB·서버·QA 자원 변경 없음, 이번 기록의 실행 오류 0. 다음은 S3.2 대상·기간·최소구매액·사용 한도/동시성 등 남은 상세 계약을 한 항목씩 확인하고, 새 API·schema 영향과 승인 범위를 제시한다. 실제 검증·PR/병합·Oracle/UAT는 미완료다.

## 진행 중 — 2026-10-03 계획 순서 재대조

- 담당 어울 단일 writer, 기존 `codex/s31-checkout-reservation-plan@4a2dce34ab7e391a3a3de3fc7b46a3e0110a53a0` clean에서 읽기 전용 대조. 이번 기록은 제품 코드·공개 API·DB·QA 자원·원격 서비스를 변경하지 않는다.
- 과거 2026-09-28 S2 잔여 게이트 기록은 당시 시점의 기록이다. 현재 브랜치에는 S1.3 탈퇴 요청의 페이지 안 확인/취소와 실제 고객 화면→DB 요청·감사 대조, S2.2 판매중지 요청/관리자 결정 시험, S2.4 관리자 홈 편집·게시/복원 및 고객 노출/품절 시험, S3.1 마지막 수량 예약 경쟁 시험이 후속으로 존재한다. 기존 증거를 새 실행의 PASS로 재사용하지 않고, 미구현이라고 중복 작업하지 않는다.
- 현재 가장 앞선 제품 미완료는 S3.2의 실제 쿠폰·배송비 지원 발행/적용 및 뒤따르는 S3.3 영속 주문이다. `home` 기획전은 전시 기능이지 할인 발행·사용 원장이 아니다. S3.2 내부 할인·배송지원 산술은 이미 시험했지만 고객 견적·주문·DB에는 미연결이다. 확정 설계의 적용 대상/기간/사용 한도·취소 후 쿠폰 반환 및 새 공개 API·schema 계약은 별도 승인 경계이며, 이전에 요청한 결제 완료 후 취소 쿠폰 반환 결정이 아직 없다.
- 실행 오류: 대상 파일을 `rg`에 Windows glob으로 넘긴 읽기 전용 검색 오류 1회; 정확한 파일 경로로 재조회했다. 동일 원인 반복 0. 이번 대조의 테스트 실행은 없으므로 최신 전체 회귀/WSL/browser PASS는 주장하지 않는다. 200% 확대는 승인대로 UAT-03 미검증, Oracle/PG 실제 연동·인수와 PR/병합·branch 정리는 계속 남는다. 다음은 S3.2 상세 계약 결정 뒤 RED→GREEN 및 실제 금액/권한·경쟁 검증이다.

## 진행 중 — 2026-10-03 S3.2 독립 금액 배분 계산 선행

- 2026-10-03 다음 계약 준비 읽기 전용 대조: 기존 `home` 모듈에는 관리자 초안 저장·미리보기·게시·이력/복원, 기간 있는 `HomeEvent`의 대표 상품·대표 이미지, 고객의 현재 게시/판매 가능 기획전 조회가 이미 있다(`home/controller.ts`, `home/types.ts`, 관리자 화면과 실DB HTTP 시험). 이는 S2.4 기획전 전시 기능의 재사용 후보이며 금액 할인·쿠폰 발행/중지·사용 횟수/예산 기능을 증명하지 않는다. 별도 `promotions`·`orders` 모듈/테이블/공개 API는 현재 없고 `checkout_reservations`의 `CONSUMED` 상태도 주문 제출 경로에 연결되지 않았다. 그러므로 새 할인·주문 계약을 홈 콘텐츠 snapshot에 암묵적으로 넣거나 이미 구현됐다고 판정하지 않는다. 이전에 요청한 결제 완료 후 취소 쿠폰 반환 정책의 신산님 결정을 기다리되, 독립적인 기존 구현 중복 여부 대조는 완료했다.
- 최종 WSL 증거: `3b51f6ae1665d6e4ff32d7bc04b1f33a5913fa0b` exact SHA·clean에서 공유 개발 DB 전체 순차 **257건/250 pass/7 환경 skip/0 fail**, exit 0. 종료 뒤 migration 11, 계정/판매자/상품/카트/예약/예약품목/재고대기/감사/세션 9범주 모두 0, `shoppingmall-s32-allocation-node-1003` 컨테이너 0. 새 볼륨·포트·백업 없음. 로컬도 257건/195 pass/62 DB·환경 skip/0 fail, PR 본문 8 pass, typecheck/lint/build exit 0. 실제 프로모션 발행/고객 견적/주문·결제는 변경·검증하지 않았다.
- 다음 승인 경계: S3.2 관리자 프로모션의 대상 SKU/판매자/기간·최소 구매액·정액/정률 상한·발행/사용 횟수·동시 경쟁·취소 후 쿠폰 반환과 주문/환불 금액 snapshot, S3.3 주문 제출 공개 API·영속 schema/금액 배분 계약은 승인된 DESIGN 보완안 28~32행과 WORK_PLAN 194~196행이 별도 상세 계약·승인을 요구한다. 지금의 두 함수는 실제 화면/API에 연결하지 않고 확정 규칙의 내부 준비로만 보존한다. 상세 계약 승인 전에도 별도 외부 계정은 요구하지 않으며, 불명확한 운영 예산·비용 부담을 임의로 결정하지 않는다.
- `793cc81071f6ab03e8adb102d04ecc642cfac0f6`의 WSL 지정 checkout exact SHA·clean, 공유 `local-postgres/shoppingmall` 전체 순차 **255건/248 pass/7 환경 skip/0 fail**, exit 0. 사후 migration 11, QA 9범주 0, 일회용 `shoppingmall-s32-allocation-node-1003` 0. 사용자용 쿠폰·실제 주문 금액은 변하지 않았다.
- 다음 독립 계산: 발송 묶음별 승인된 배송비를 먼저 산정한 뒤 요청 지원액을 **실제 배송비 한도**로 제한하고, 이미 무료배송인 묶음은 지원 0원으로 처리한다. 한 발송 묶음의 지원 요청은 최대 1개로 검사한다. 순수 함수와 시험만 추가하며 실제 프로모션 발행·사용/예산·고객 견적·공개 API·DB 변경은 없다. Ruling: 명목 지원액이 실제 배송비보다 크면 거부 대신 실제 배송비로 상한 처리한다 — 확정 문구가 현금성 중복 할인 금지와 실제 배송비 이하 한도를 요구하기 때문이다 — 운영 정책이 초과 요청 자체를 오류로 정하면 관리자 등록 검증에서 별도 결정이 필요하다.
- 배송비 지원 RED→GREEN: 새 시험 2건은 함수 부재로 기존 10 pass/신규 2 fail, 내부 함수 구현 후 12/12 pass. 무료배송 묶음의 3,000원 지원은 0원, 실제 배송비 3,000원에 5,000원 요청은 3,000원 한도, 중복·외부 묶음·부적합 금액 거부를 확인했다. 로컬 루트 `pnpm test` **257건/195 pass/62 DB·환경 skip/0 fail** + PR 본문 8 pass, typecheck/lint/build exit 0. 새 계산 역시 고객 견적·DB·공개 API에 미연결이다.
- 배송비 지원 WSL 재현 자원: 기존 `shoppingmall-s32-allocation-node-1003`가 이전 실행 후 0임을 확인하고 같은 이름의 일회용 Node24 컨테이너만 다시 생성해 exact SHA의 공유 DB 전체 순차 회귀를 실행한다. 사전·사후 QA 9범주/컨테이너 0 및 migration 11, checkout clean을 확인하며 새 DB·볼륨·포트·백업·Secret 파일을 만들지 않는다.
- 담당 어울 단일 writer, 기존 격리 worktree `D:\Project\shoppingmall2\.worktrees\flat-v2-prototypes`, branch `codex/s31-checkout-reservation-plan@e7efbfc7b818ca04f4f09cd08d638e3c096e66d6`, clean. PMO 공통 지침은 읽었으나 이 저장소 root에는 `AGENTS.md`가 없어 신산님 제공 전역 지침·PMO 지침·승인된 DESIGN/WORK_PLAN을 따른다. S3.1 실DB 전체 250건/243 pass/7 환경 skip/0 fail과 임시 자원 0은 직전 증거이며 이번 새 기능의 검증으로 재사용하지 않는다.
- 계획 범위: 이미 확정된 R05의 통합 할인액을 할인 대상 상품의 **할인 전 금액** 비율로 발송 묶음에 원화 정수 배분하는 내부 순수 계산만 RED→GREEN으로 추가한다. 실제 쿠폰 발행·대상 SKU/판매자/기간·예산/사용 횟수, 배송비 지원·주문 저장·공개 API/DB schema는 구현하거나 활성화하지 않는다. 사용자에게 보이는 견적 금액은 기존대로 유지한다. 외부 계정·DB·컨테이너·포트·임시 QA 자료 생성 없음. 오류 시 새 순수 계산 변경만 이전 커밋으로 되돌릴 수 있고 기존 데이터에는 영향 없음.
- Ruling: 동일한 원 단위 잔여액은 비율 소수부가 큰 발송 묶음에 우선, 동률이면 안정적인 묶음 key 사전순으로 배분한다 — PRD는 결정적 조정을 요구하지만 동률 순서는 명시하지 않았고 장바구니 입력 순서에 따라 금액이 바뀌지 않아야 하기 때문이다 — 실제 주문 계약에서 다른 우선순위를 승인하면 배분 기대값과 주문 snapshot을 조정해야 한다. 이 계산은 아직 운영 금액 계약 승인이나 S3.2 완료를 의미하지 않는다.
- RED→GREEN 및 로컬 검증: 신규 `shipment-quote.test.mjs` 4건은 내부 배분 함수 부재로 예상 RED(기존 5 pass/신규 4 fail), 함수 추가 뒤 경계 1건까지 10/10 pass. 할인 대상 발송 묶음만 비례 배분, 1원 동률 key 순서, 52,000원에서 5,000원 할인 후에도 무료배송, 부적합 금액·중복 묶음 거부, 안전 정수 상한을 확인했다. 루트 `pnpm test` **255건/193 pass/62 DB·환경 skip/0 fail** 및 PR 본문 8 pass, typecheck/lint/build exit 0. 현재 이 함수는 기존 견적·공개 API에 연결되지 않아 실제 고객 결제 금액은 변하지 않는다.
- WSL 재현 자원 계획: 안전 커밋을 SSH alias 작업 브랜치에 push해 지정 `/home/daon/deploy/shopping`을 exact SHA로 fast-forward한다. 기존 공유 `local-postgres/shoppingmall`의 사전 QA 9범주 0과 migration 11건을 읽기 전용 확인한 뒤 일회용 Node24 컨테이너 `shoppingmall-s32-allocation-node-1003`만 `--rm --network container:local-postgres`로 연결해 루트 순차 회귀를 실행한다. 새 DB·볼륨·포트·백업·Secret 파일 없음. 실행 후 시험 자체의 fixture reset, QA 9범주 0, 정확한 컨테이너 0, WSL checkout clean·동일 SHA를 확인한다. 외부 서비스·운영 혜택은 사용하지 않는다.

## 진행 중 — 2026-10-03 S3.1 리뷰 보정·시험 자원 정리

- 최종 WSL 공유 DB 회귀: SSH alias 원격→지정 WSL checkout `c4fc056435aa546c8cb9c40df697758084a139c2` fast-forward·clean 확인 뒤, 계획한 `shoppingmall-s31-review-full-node-1003` Node24 일회용 컨테이너로 루트 순차 시험 **250건/243 pass/7 환경 skip/0 fail**, 바깥 명령 exit 0. 사후 migration 11건, QA 9범주 `0|0|0|0|0|0|0|0|0`, 정확한 시험 컨테이너 0, WSL checkout clean·동일 SHA. 새 DB·볼륨·포트·백업 없음. Windows 9091/9092/9229 listener 0. 7 skip은 통과로 간주하지 않는다. 영속 주문 3건·한 결제·Oracle/UAT는 미구현 또는 미검증이므로 S3.1/S3 완료·PR 병합 보류.
- 담당 어울 단일 writer, `codex/s31-checkout-reservation-plan@feb5dc7` 제품 SHA. 변경: 고객 장바구니 발송 묶음에 해당 상품명 표시, HTTP 경계 시험의 런타임 난수 비밀번호와 예외 시 중첩 `finally` 정리, 다판매자 Chrome UI 검증 강화. 화면 렌더 시험은 RED 1 실패 후 GREEN 5 통과했고 로컬 전체 250건/188 pass/62 DB·환경 skip/0 fail, PR 본문 8 pass, typecheck/lint/build exit 0. 공유 개발 DB 목표 HTTP 1 pass, 해당 QA 자료 9범주 0.
- WSL exact SHA `feb5dc7`, QA ID `b83f1005`의 실제 Chrome 첫 시도는 테스트 기대문구에 fixture의 `qa-<ID>-` 상품명 접두어를 누락해 실패했다. 실제 화면의 판매자 직접 발송 1행에 접두어를 포함한 고추·양파와 상품 35,000원/배송 3,000원/소계 38,000원이 표시된 것을 확인했다. 이는 화면 결함이 아니라 테스트 기대값 오류 1회다. 해당 고객의 카트 5행만 비운 뒤 스크립트 기대값을 같은 QA ID 상품명으로 수정해 재실행했고 직접 판매자 A/B·어울몰 3묶음 금액/상품명 및 5상품 제거가 모두 PASS, exit 0이었다. 초기 CDP 연결 실패 시 자체 탭 정리는 Minor 후속 후보로 남긴다.
- 사용 후 정리: 같은 QA ID fixture reset, 공유 DB 계정/판매자/상품/카트/예약/품목/재고대기/감사/세션 9범주 0, migration 11건 유지. 정확한 임시 API/Web/빌드 컨테이너와 두 빌드 볼륨·0600 암호 파일·Windows 9091/9092/9229 listener/터널·Chrome 프로필은 모두 0. WSL checkout은 `feb5dc7` clean. 이 시험은 견적 UI 증거이지 영속 주문 3건·통합 결제 1건 또는 사용자 인수가 아니다.
- 후속 전체 회귀 자원 계획: QA 스크립트 최종 보정·문서 커밋을 SSH alias로 push하고 WSL 지정 checkout을 exact SHA로 fast-forward한다. 기존 `local-postgres/shoppingmall`에 Node24 일회용 `shoppingmall-s31-review-full-node-1003`만 `--rm --network container:local-postgres`로 연결해 루트 순차 실DB suite를 재실행한다. 새 DB/볼륨/포트/백업은 만들지 않는다. 종료 시 컨테이너·QA 9범주 0, migration 11건, checkout clean·동일 SHA를 확인한다. 결제/주문 영속 계약은 별도 승인 경계이며 S3 완료·PR 병합을 선언하지 않는다.
- 최종 QA 스크립트 보정 뒤 로컬 재검증: `node --check`·`git diff --check` 통과, `pnpm test` 250건/188 pass/62 DB·환경 skip/0 fail 및 PR 본문 8 pass, typecheck/lint exit 0. 첫 `pnpm build`는 제한된 D: 작업 폴더의 `.next/trace` 쓰기 EPERM으로 실패 1회; 같은 명령을 필요한 파일 권한으로 재실행해 API/Web 빌드 exit 0. 제품 소스 추가 변경은 없다.

## 진행 중 — 2026-10-03 S3.1 공유 개발 DB 실제 브라우저 검증

- 담당 어울 단일 writer, branch `codex/s31-checkout-reservation-plan@2c80c61`, 로컬/SSH 원격/WSL exact SHA·clean. 공유 `local-postgres/shoppingmall`의 승인된 migration 11건과 기존 9범주 0을 확인한 뒤 QA ID `b83f1003`만 사용했다. 9091/9092/9229 사전 비점유, QA 컨테이너 0. 기존 WSL ignored dist 소유권을 변경하거나 삭제하지 않기 위해 exact SHA 소스를 읽기 전용 마운트한 Docker 전용 API/Web 산출물 볼륨에 빌드했고 Web 14 route 생성, WSL checkout dirty 0이었다.
- 실제 서비스: 지정 일회용 API/Web 컨테이너를 WSL 호스트 루프백 9092/9091에서 실행해 `/ready`·`/login` 각 HTTP 200. 고유 가상 고객·판매자·상품을 공유 DB에 seed하고 난수 비밀번호는 0600 일회용 파일에만 보관했다. Windows 숨김 SSH 터널/전용 Chrome CDP에서 `scripts/qa-cart-browser.mjs`를 실행해 로그인, 상품 수량 2→장바구니 49,000원, 수량 3→69,000원 무료배송, 서버 예약 201을 브라우저에서 409로 주입한 뒤 저장 ID·키 없는 새 진입에서 자기 예약 ID·만료시각 복구/해제, 390px 가로 넘침 없음·Tab 포커스, 상품 제거·빈 장바구니를 모두 통과했다. 브라우저 스크립트 exit 0. 이는 실제 공유 DB 연결 E2E이며 200% 확대·다판매자 주문/통합 결제·Oracle/UAT 증거는 아니다.
- 사용 후 정리: 같은 QA ID의 `qa-public-fixture.ts reset` 성공, accounts/sellers/products/cart/reservations/lines/deferred/audit/sessions **9범주 모두 0**, API/Web/빌드 지정 컨테이너 0, 전용 볼륨 0, 0600 임시 암호 파일 부재, Windows 9091/9092/9229 LISTEN 0·Chrome 프로필 부재, WSL checkout clean. 승인된 0010 migration은 보존한다. 실행 오류는 첫 빌드 경로 오류 1회·기존 ignored 산출물 쓰기 권한 오류 1회로 각각 원인 분리/대안 빌드 통과했으며 같은 근본 원인 3회 반복 없음.
- 현재 S3.1 미완료: 실제 판매자 A/B+어울몰 발송 3묶음의 고객 HTTP/브라우저 증거와 할인 전 49,999/50,000원 경계의 현재 정책·DB 증거를 추가한다. 주문 제출/통합 결제의 영속 계약은 `WORK_PLAN` S3.3/S4에 속하며 새 schema/API·금액 배분 계약은 별도 승인 경계다. 이 브라우저 통과만으로 S3.1 또는 Stage S3 전체 완료·PR 병합을 선언하지 않는다.
- 다음 다판매자 브라우저 검증 계획: 새 QA ID `b83f1004`의 기존 `qa-catalog-fixture.ts` 가상 5상품(직접 판매자 A/B·어울몰 발송)만 공유 `shoppingmall`에 seed한다. 현재 전역 배송정책은 읽기 전용으로 3,000원/50,000원 확인했다. 신규 테스트 전용 `scripts/qa-multiseller-browser.mjs`는 고객 화면에서 5개 상품을 담고 실제 HTTP 견적 3묶음 97,000+9,000=106,000원 및 UI 3행을 확인한 뒤 모든 상품을 제거한다. exact SHA 읽기 전용 소스와 전용 빌드 볼륨 `shoppingmall-s31-multiseller-api-dist-1003`/`...-web-next-1003`, 일회용 빌드/API/Web 컨테이너 `shoppingmall-s31-multiseller-(build|api|web)-1003`, WSL 9091/9092, Windows 숨김 SSH 터널·Chrome CDP 9229/전용 프로필, 난수 암호 0600 `/tmp/shoppingmall-s31-multiseller-qa-1003.env`만 사용한다. 사전 점유·QA 행 0 확인, 실패/성공 모두 같은 QA ID reset, 컨테이너·볼륨·포트·프로필·암호 파일·DB 9범주 0 확인. 결제/주문 저장은 생성하지 않는다.
- 다판매자 브라우저 실제 결과: `8dff8af` WSL exact SHA의 읽기 전용 소스·전용 볼륨 빌드, 고유 QA ID `b83f1004`, API/Web HTTP 200에서 Chrome script exit 0. 상품 5개 담기→직접 판매자 A 35,000+배송 3,000원, 어울몰 18,000+3,000원, 직접 판매자 B 44,000+3,000원으로 3발송 견적 상품 97,000+배송 9,000=106,000원과 화면 3행 일치·판매자 ID 분리 확인, 5개 제거 통과. 같은 ID reset 후 DB 9범주 0, 지정 컨테이너·볼륨·임시 암호 파일·Windows 9091/9092/9229 listener·Chrome 프로필 모두 0, WSL checkout clean, migration 11건 불변. 이는 결제/영속 주문이 아닌 브라우저 견적 증거다.
- 무료배송 경계 후속 시험 계획: 기존 전역 정책 3,000원/50,000원을 변경하지 않고 `checkout-shipping-boundary-http-db.test.mjs`가 매회 임의 8자리 QA ID의 가상 카탈로그 5상품만 seed하여 고추 옵션을 49,999원·마늘 옵션을 50,000원으로 수정한다. 고객 세션에서 직접 판매자 A/어울몰/B 세 상품의 GET `/customer/cart/quote`를 실제 API/DB로 검증하고 `finally`에서 동일 QA ID reset한다. WSL exact SHA 공유 `local-postgres/shoppingmall`에 기존 `node:24`의 일회용 `shoppingmall-s31-boundary-node-1003`만 연결(새 DB/볼륨/포트 없음), 종료 뒤 DB 9범주·컨테이너 0, checkout clean·migration 11건 확인. 전역 정책/기존 계정·상품은 건드리지 않는다.
- 경계·전체 회귀 결과: exact SHA `70db095` WSL 공유 DB 목표 고객 HTTP 1 pass/0 fail. 직접 판매자 A 49,999+배송 3,000원, 어울몰 18,000+3,000원, 직접 판매자 B 50,000+배송 0원, 전체 117,999+6,000=123,999원을 실제 API 응답으로 확인했다. 전체 순차 실DB **249건/242 pass/7 환경 skip/0 fail**, exit 0, 9범주 잔류 0·migration 11·WSL checkout clean. 로컬 `pnpm test` 249건/187 pass/62 DB·환경 skip/0 fail + PR body 8 pass, `pnpm typecheck`·`pnpm lint`·`pnpm build` 모두 exit 0. 브라우저 다판매자·경계 QA의 지정 컨테이너/볼륨·Windows 터널/프로필·임시 암호 파일은 0. 리뷰를 별도 수행 중이며 아직 PR/병합·S3 완료는 아니다.
- Ruling: `WORK_PLAN`의 S3.1 인수 문구에는 3주문/1결제가 있지만 영속 주문 제출·멱등성은 S3.3, 실제 결제는 S4로 분리돼 있다. 현재는 3개 발송 **견적 묶음**까지만 구현·검증된 것으로 판정하고 실제 3개 주문/한 결제는 구현됐다고 쓰지 않는다. 잘못 해석하면 Stage PR·S3.1 완료를 조기 선언할 위험이 있으므로 S3 전체 미완료로 유지한다. 새 주문 schema/API·금액 배분 계약은 기존 설계의 별도 승인 경계이며 이 분기에서 임의 구현하지 않는다.
- 독립 리뷰 대응 중: 리뷰 범위 `fece878..70db095`에서 Critical 0, Important 4, Minor 1. Important ① 공유 DB QA 고정 비밀번호를 런타임 난수로, ② `app.close`/`pool.end` 오류에도 fixture reset을 중첩 finally로 보장, ③ 다판매자 UI에서 기존 견적 품목으로 직접 발송 1/2와 상품명 표시 및 실제 브라우저 스크립트의 발송 방식·배송비·소계 검증 강화는 코드 수정·재시험 대상으로 수용했다. ④ 3주문/1결제는 위 Ruling대로 계획 단계 충돌을 명시하고 S3 완료·PR 병합 불가 판정 유지. Minor인 CDP 연결 초기 실패 시 자체 탭 정리는 Windows 외부 try/finally의 Chrome 프로필/프로세스 정리가 있어 이번 범위에서는 보류하되 후속 QA 도구 개선 후보로 기록한다. 리뷰어는 코드 정적 검사만 했고 런타임 증거를 독립 재실행하지 않았다.
- 리뷰 보정 실제 QA 자원 계획: 기존 API/Web/DB 계약 변경 없이 `QA_RUN_ID=b83f1005` 가상 5상품만 재생성해 수정된 다판매자 화면을 Chrome에서 검증한다. exact SHA WSL 소스 읽기 전용, `shoppingmall-s31-review-api-dist-1003`/`shoppingmall-s31-review-web-next-1003` 전용 볼륨, `shoppingmall-s31-review-(build|api|web)-1003` 일회용 컨테이너, WSL 9091/9092와 Windows 숨김 SSH 터널/CDP 9229·전용 Chrome 프로필, 0600 `/tmp/shoppingmall-s31-review-qa-1003.env`만 사용한다. 같은 ID fixture reset 후 9범주·컨테이너/볼륨/포트/프로필/암호 파일 0을 확인한다. 변경된 HTTP 경계 시험은 별도 일회용 `shoppingmall-s31-review-boundary-node-1003`로 공유 DB에서 실행하고 각 임의 QA ID를 시험 finally에서 정리한다.

## 진행 중 — 2026-10-03 S3.1 공유 개발 DB 0010 적용·정식 회귀

- 담당 어울, 단일 writer `codex/s31-checkout-reservation-plan@9f1f41ac4e751ed7b127a10ef9575d20e02b66b9`. 신산님이 공유 개발 DB 적용을 명시 승인했다. 대상은 `WSL-server`의 정확한 컨테이너 `local-postgres`, DB `shoppingmall`, migration `0010_s3_checkout_reservations` 1건뿐이다. Oracle·다른 DB/컨테이너·실제 외부 서비스·main/PR 병합은 이번 승인에 포함하지 않는다.
- 시작 읽기 전용 확인: 로컬/SSH 원격/WSL 작업 branch SHA 일치·clean, 공유 `shoppingmall|postgres|migration 10|accounts 0|products 0|audit 0`, 신규 예약 3테이블 미존재. SQL SHA-256 `2be18dda86fb4ed32df427628ace9f9359c714d117bd3429cfd7ff81dc42267c`, 격리 DB에서 0000~0010 적용과 246건/239 pass/7 skip/0 fail을 사전 확인했다. 첫 확인 질의에 미존재 테이블을 직접 SELECT해 관계 없음 오류 1회(읽기 전용/예상 상태) 뒤 기존 관계만 조회해 성공했다. 동일 근본 원인 반복 0회.
- 적용·복구 계획: Node24 일회용 `shoppingmall-s31-migrate-preflight-node-1003`로 Drizzle read-only dry-run 1건/14문장을 재확인한다. WSL `/tmp/shoppingmall-s31-0010-pre-20261003.dump`를 DB 전체 custom-format `pg_dump`로 `umask 077` 생성하고 `pg_restore --list`·크기·sha256을 검증한다. 대상 파일 기존 존재 시 덮지 않고 중단한다. 이어 정확한 동일 SHA의 `migrate.ts`로 0010만 적용하고 이력 11건·새 표/인덱스·기존 0행 불변을 확인한다. SQL 적용은 Drizzle 트랜잭션을 따른다. 실패 시 후속 쓰기를 멈추고 백업·DB 상태를 보존해 보고하며 광범위 restore/기존 DB 삭제는 하지 않는다.
- 정식 회귀 자원 계획: 지정 WSL checkout과 공유 `local-postgres/shoppingmall`만 사용, 기존 `node:24-bookworm-slim` 이미지의 일회용 `shoppingmall-s31-shared-test-node-1003`를 `--rm --network container:local-postgres`로 연결한다. 목표 HTTP/전체 루트 순차 실DB suite를 실행하되 DB URL·암호는 런타임에서만 주입하고 출력/문서화하지 않는다. 테스트는 자기 식별 QA 계정·상품을 `finally` 정리하며 9범주 잔류 0을 확인한다. 종료 시 두 정확한 Node 컨테이너·연결 볼륨 0, WSL checkout clean·공유 migration 11건을 확인한다. 성공 후 이번 백업 파일은 신산님의 ‘사용 후 모두 정리’ 지시에 따라 정확한 경로·형식·해시를 다시 확인하고 삭제해 잔류 0을 검사한다. 정식 실브라우저/E2E·Oracle 인수는 별도 검증이다.
- 적용 결과: WSL exact SHA `24e97a2056aa56f202095c74401427746c09472d`의 Node24 일회용 컨테이너에서 read-only dry-run **적용 10/대기 1, 0010 14문장**, 해시 일치. 지정 `/tmp/shoppingmall-s31-0010-pre-20261003.dump` custom-format 전체 덤프를 `0600`, 76,389바이트로 만들고 `pg_restore --list` 193행·SHA-256 `a40fbb1797fa5c9d2a7ad20ce5f88f2b4940643b2da99ab438451f83ff4a76af` 검증. 그 후 동일 exact SHA의 `migrate.ts`로 승인된 0010만 적용, 이력 **11건**, 새 3테이블 존재, 기존 accounts/products 및 새 예약·품목·재고대기 각 0건 확인. 적용 명령 exit 0. 백업은 정식 회귀 결과 전까지 보관 중이며 아직 삭제하지 않았다. 다른 DB/컨테이너 변경 없음.
- 공유 DB 정식 실DB 회귀: 목표 HTTP 2 pass/0 fail, 전체 루트 순차 246건/239 pass/7 환경 skip/0 fail, 바깥 셸 exit 0. 종료 뒤 accounts/sellers/products/cart/reservations/lines/deferred/audit/sessions 9범주 모두 0. 단, 실제 브라우저 시험에 기존 `qa-public-fixture.ts`를 사용하면 예약 해제 이력이 상품·계정의 FK로 남아 reset이 실패할 수 있음을 읽기 전용 코드·스키마 대조로 발견했다. 사용자 지시인 시험자료 완전 정리를 위해 fixture 정리를 TDD로 보강하고 그 후 공유 DB 브라우저 시험을 진행한다.
- fixture RED/GREEN 임시 자원: WSL 지정 checkout의 새 안전 commit을 SSH branch push→fast-forward해 일회용 `shoppingmall-s31-fixture-red-pg-1003`/`-node-1003`, 이후 `shoppingmall-s31-fixture-green-pg-1003`/`-node-1003`만 사용한다(기존 PG15/Node24 이미지, 각 내부 DB명 `shoppingmall`에 0000~0010). 외부 포트·영속 볼륨·공유 DB 쓰기 없음. 시험이 생성한 QA 상품/예약은 `finally`에서 정확한 ID만 삭제한 뒤 fixture reset. 성공/실패 뒤 두 컨테이너·볼륨 0, 9범주 0, WSL checkout clean·공유 migration 11건 확인. 런타임 암호 비출력. 보정은 `qa-public-fixture.ts`의 자기 QA 계정 예약품목→예약 및 자기 옵션의 재고 대기 목표 삭제 순서만 추가하고 다른 상품/계정은 건드리지 않는다.
- fixture RED 결과: `18ba1272908b454de2a27d90db67cc82c9cb29e5` WSL 격리 DB에서 신규 목표 1 fail/0 pass, 정확한 `23503 checkout_reservation_lines_option_id_product_options_id_fk`가 제품 옵션 삭제 시 발생했다. 시험 `finally`가 정확한 예약 ID의 품목/예약을 삭제한 뒤 fixture reset을 재실행해 계정·판매자·상품·예약·품목·감사 6범주 0, RED 컨테이너 자동 정리. 공유 DB에는 시험 쓰기 없음. 이 근본 원인은 1회 재현됐고 3회 반복 없음. GREEN은 해당 QA_RUN_ID의 email 계정 ID만 선별해 예약품목→예약을 공개상품 reset 트랜잭션에서 먼저 삭제한다.
- 예약 fixture GREEN: `c82e7ae2e1f53609a640edfb31b940ee8100386c` WSL 격리 DB 0000~0010에서 `qa-public-fixture-db.test.mjs` **5 pass/0 fail**, 계정·판매자·상품·예약·품목·감사 0; 정확한 GREEN 두 컨테이너/볼륨 0, WSL clean. 로컬 typecheck/lint exit 0. 같은 fixture가 판매자 재고 0 대기 이력을 만들면 옵션 FK 정리도 필요하므로 별도 RED→GREEN으로 검증한다. 정확한 일회용 이름은 `shoppingmall-s31-fixture-deferred-red-pg-1003`/`-node-1003`, 이후 `...-green-...`; 내부 DB `shoppingmall` 0000~0010, 외부 포트·영속 볼륨·공유 DB 쓰기 없음. 시험 `finally`가 정확한 대기 ID만 제거한 뒤 fixture reset하고 6범주/컨테이너·볼륨 0을 확인한다.
- 재고 대기 fixture RED: `6f647eb` WSL 격리 DB에서 신규 시험 1 fail/기존 5 pass, PostgreSQL `23503 inventory_deferred_stock_targets_option_id_product_options_id_f`를 확인했다. 첫 실행은 시험 컨테이너 작업 디렉터리를 루트로 설정해 migration journal을 찾지 못한 명령 오류 1회였고, `apps/api`로 수정해 재현했다. 시험 finally 후 accounts/products/deferred 0, 임시 컨테이너 제거. 공유 DB 쓰기 없음. 원인은 QA 상품 옵션 삭제 전에 해당 옵션의 재고 대기 이력이 남는 것이므로 정확한 QA 상품 소속 옵션만 선별해 먼저 삭제한다.
- 재고 대기 fixture GREEN/공유 DB 회귀: `cf05ad7` WSL 격리 DB 6 pass/0 fail, 잔류 accounts/products/deferred 0. 공유 DB 전체 첫 실행은 Alpine/musl Node24와 설치된 glibc용 sharp 불일치로 실패한 실행환경 오류 1회; glibc `node:24`로 같은 SHA를 재실행하여 **248건/241 pass/7 환경 skip/0 fail**, 9범주 잔류 0, migration 11건, 종료 코드 0. 두 실행의 지정 컨테이너는 종료/자동 제거됐다. 7 skip은 통과가 아니다.
- 다음 공유 DB 브라우저 시험 자원 계획: `QA_RUN_ID=b83f1003`의 가상 고객·판매자·상품만 `qa-public-fixture.ts seed`로 만들고, WSL 지정 checkout SHA에서 API/Web을 9092/9091 루프백에 띄워 Windows 로컬 Chrome과 SSH 터널로 장바구니·활성 예약 복구 흐름을 검증한다. 비밀번호는 실행 중 난수로만 보관·비출력한다. 시험 성공·실패 모두 같은 run ID의 reset을 실행하고 9범주 잔류 0을 확인한다. 지정 서비스 컨테이너·Chrome 프로필·터널을 정확히 종료/제거하고, 모든 검증 완료 후 이 작업 전용 `/tmp/shoppingmall-s31-0010-pre-20261003.dump`의 해시·경로를 재확인해 삭제한다. 공유 0010 migration과 무관한 데이터·자원은 삭제하지 않는다.
- 2026-10-03 종료 시점: 이번 공유 DB 브라우저 자원은 아직 생성하지 않았고 해당 시험은 미검증이다. 로컬 `pnpm test` 248건/187 pass/61 DB·환경 skip/0 fail 및 PR body 8 pass, `pnpm typecheck`·`pnpm lint` 성공. 로컬 `pnpm build` 첫 실행은 D: 산출물 쓰기 sandbox EPERM으로 실패 1회, 권한 있는 동일 명령 재실행 exit 0(API/Web 빌드 성공). 공유 DB 전체 회귀는 위의 248건/241 pass/7 skip/0 fail, 시험 행 9범주 0, migration 11건 유지. 지정 SHA-256·정확한 절대경로·0600·`pg_restore --list`를 재검증한 후 사용자 지시대로 작업 전용 백업 `/tmp/shoppingmall-s31-0010-pre-20261003.dump`를 삭제해 부재 확인. 지정 `shoppingmall-s31-*` 시험 컨테이너 잔류 0. migration/schema는 승인된 영속 변경이므로 보존한다. 다음 작업은 브라우저 실DB 흐름 시험 및 동일 ID reset·자원 정리이며, Oracle/UAT·PG 실제 연동은 별도 미검증이다.
- 공유 DB 브라우저 시험 착수 계획(어울 단일 writer, branch `codex/s31-checkout-reservation-plan`): 기존 `fece878` 정본에서 9091/9092 WSL 루프백과 Windows 9229/터널 포트의 점유·소유를 읽기 전용 확인한다. QA ID `b83f1003` 전용 가상 고객·상품, 런타임 난수 암호의 0600 일회용 `/tmp/shoppingmall-s31-browser-qa-1003.env`, 빌드 컨테이너 `shoppingmall-s31-browser-build-node-1003`, API `shoppingmall-s31-browser-api-1003`, Web `shoppingmall-s31-browser-web-1003`, Windows 숨김 SSH 터널/Chrome 전용 임시 프로필만 생성한다. WSL checkout exact SHA에서 빌드·실행, Windows Chrome에서 `scripts/qa-cart-browser.mjs`를 실행한다. 성공·실패 모두 동일 ID reset, 서비스/빌드 컨테이너·터널·Chrome·프로필·임시 암호 파일 제거, 9범주 행과 점유 포트 0을 확인한다. 기존 `local-postgres`와 다른 DB·컨테이너는 변경하지 않는다. 실제 200% 확대·Oracle/UAT는 이 시험 범위 밖이다.
- 빌드 실행 보정: WSL `477dca6` clean·9091/9092/9229 비점유·기존 QA 컨테이너/계정 0 확인. 첫 빌드 명령은 루트 `node_modules/.bin/tsc` 경로 오류 1회, 앱별 bin으로 수정한 재시도는 checkout의 기존 `apps/api/dist` 쓰기 권한 오류 1회다. 추정 권한 변경·기존 산출물 삭제 없이 exact SHA 소스를 읽기 전용 마운트하고 새 이름 있는 Docker volume `shoppingmall-s31-browser-api-dist-1003`와 `shoppingmall-s31-browser-web-next-1003`를 각각 API dist/Web .next 출력 전용으로 사용한다. 빌드·API/Web 런타임이 같은 volume을 재사용하고 시험 후 정확한 두 volume을 제거해 잔류 0 확인한다. 기존 소스 checkout의 ignored 산출물은 건드리지 않는다.

## 진행 중 — 2026-10-03 S3.1 계정 소유 활성 예약 조회

- 담당 어울, 기존 단일 writer `codex/s31-checkout-reservation-plan@93df4813d2849be36d2c887cd0c7979a62ee461a`, Windows/WSL 지정 checkout clean·동일 SHA. 신산님의 직전 공개 API 질문 후 `계속하자`를 `GET /customer/checkout/reservations/active`의 한정된 추가 승인으로 해석한다. 공유 DB 0010 적용·새 schema·Oracle/실서비스는 포함하지 않는다.
- 계약/범위: 로그인한 구매자 자기 계정의 유효 `ACTIVE` 예약 한 건에만 ID·DB 만료시각·품목·현재 견적을 기존 예약 조회와 같은 형태로 반환한다. 없거나 DB 시각상 만료면 404, 비로그인 401, 다른 역할 403, DB 미설정 503. 요청자 제공 계정 ID는 받지 않는다. 새 탭·기기에서 브라우저 저장 ID가 없어도 화면이 자기 예약을 찾고 해제할 수 있어야 한다. 만료된 행은 기존 만료 전이·감사를 거쳐 정리하며 시간을 연장하지 않는다.
- 변경 예상: `apps/api/src/checkout/reservation-service.ts`, `reservation.controller.ts`, 실DB HTTP 시험, 고객 장바구니 화면·시험/QA 도구, 이 현황. RED→GREEN 후 로컬 test/typecheck/lint/build, SSH alias push→WSL exact SHA 격리 실DB·브라우저 회귀. 최초 로컬 기준 `pnpm test` 245건/186 pass/59 DB·환경 skip/0 fail 및 PR validator 8 pass. DB skip은 실DB 증거가 아니다.
- RED 자체 QA 예정 자원: 지정 WSL checkout과 기존 `pgvector/pgvector:0.8.2-pg15`/`node:24-bookworm-slim` 이미지로 `shoppingmall-s31-active-red-pg-1003`, `shoppingmall-s31-active-red-node-1003` 두 일회용 컨테이너. 내부 fixture DB명만 `shoppingmall`, 0000~0010 적용, 외부 포트·영속 볼륨·공유 DB 쓰기 없음. 시험 암호는 런타임에서만 생성. 실패 재현 후 정확한 두 컨테이너·익명 볼륨 자동제거/잔류 0 확인. GREEN QA 자원은 실행 전 별도 기록한다.
- 오류 횟수 0. 다음: API HTTP 실패 시험 먼저 작성·WSL 격리 RED 확인.
- 첫 RED 실행은 0000~0010 적용 후 PowerShell→SSH 파이프의 마지막 인수에 CR 문자가 붙어 시험 파일을 찾지 못하고 종료됐다(제품 시험 미실행, 전달 래퍼 오류 1회). 지정 `shoppingmall-s31-active-red-*` 컨테이너·볼륨은 trap 정리 후 0, WSL checkout clean. 동일 스크립트를 LF 보존 전달로 재실행한다.
- LF 보존 재실행: 지정 WSL SHA `203befb5f86810d52678821b0829439e63eadfbe`의 실DB HTTP 시험 2건/1 pass/1 fail, 예약이 없는 본인 계정의 `/active`가 `404` 대신 ID 형식 오류 `400`을 반환하는 예상 RED. QA 두 컨테이너·볼륨 0, WSL clean, 공유 DB migration 10건 불변. 제품 목표 RED 1회, 스크립트 전달 오류 1회는 원인 구분.
- 화면 RED→GREEN: 새 탭에 저장된 ID가 없을 때 본인 예약을 조회하고 브라우저에 ID를 저장하는 목표 시험이 함수 부재로 1 fail, 호출 helper·화면 새로고침 연결 뒤 9 pass/0 fail. 서버는 계정 행 잠금, DB 시각 만료 처리, 같은 트랜잭션 견적을 거쳐 본인 ACTIVE만 반환하는 메서드와 정적 `/active` 라우트를 동적 `/:id`보다 먼저 등록했다.
- 로컬 변경 검증: `pnpm test` 246건/187 pass/59 DB·환경 skip/0 fail + PR validator 8 pass, `pnpm typecheck`, `pnpm lint`, 권한 상승 `pnpm build` 모두 exit 0. 로컬 DB skip을 실DB 합격으로 치지 않는다.
- GREEN 자체 QA 자원 계획: 지정 WSL checkout에 해당 제품 SHA를 SSH branch fast-forward한 뒤 일회용 `shoppingmall-s31-active-green-pg-1003`, `shoppingmall-s31-active-green-node-1003`(기존 이미지)에서 내부 `shoppingmall` DB에 0000~0010 적용, 목표 HTTP와 저장소 전체 순차 실DB 회귀를 실행한다. 외부 포트·영속 볼륨·공유 DB 쓰기 없음; 런타임 임시 암호만 사용하고 결과 후 QA 9범주 0, 정확한 두 컨테이너·익명 볼륨 0, checkout clean·공유 migration 10건 불변을 확인한다. 자체 QA만이며 정식 공유 DB E2E가 아니다.
- GREEN 결과: 제품 SHA `cbdd439d8931376cac688b73ba8912a9bfc206fe`를 SSH alias로 push하고 WSL 지정 checkout에 fast-forward했다. 격리 DB 0000~0010에서 새 HTTP 목표 2 pass/0 fail(권한·다른 고객·재로그인·만료·운영자 취소·DB 부재 포함), 루트 순차 실DB **246건/239 pass/7 조건부 skip/0 fail**, 바깥 셸 exit 0. QA 9범주 `0|0|0|0|0|0|0|0|0`, 지정 두 컨테이너·볼륨 0, WSL checkout clean·동일 SHA, 공유 migration 10건 불변. 기존 결함 주입에서 예상 Nest 오류 로그는 시험 실패가 아니다. 자체 격리 QA이며 정식 공유 DB 통합/E2E·실브라우저·UAT는 아직 미검증이다.
- 실브라우저 후속 준비: 기존 `QA_RESERVATION_RETRY=1` 자동화가 새 자동 계정 조회 전에 요구하던 수동 ‘이전 예약 결과 다시 확인’ 단계를 최신 계약에 맞춰 바꾼다. 서버에서 첫 예약 201·브라우저에는 409를 보여 준 뒤 브라우저 예약 ID/멱등키를 비우고 장바구니를 다시 열어 자기 ACTIVE 예약 ID·만료시각을 자동 복원하는지 확인한다. 시험은 격리 DB와 가상 계정에서만 수행하고 결과/자원 정리를 별도 기록한다.
- 실브라우저 QA 자원 계획: 최신 branch SHA를 SSH alias push→지정 WSL checkout fast-forward한 후 기존 PG15/Node24 이미지만 쓴다. 정확한 일회용 컨테이너 `shoppingmall-s31-active-ui-pg-1003`, `shoppingmall-s31-active-ui-api-1003`, `shoppingmall-s31-active-ui-web-1003`; PG 컨테이너 안의 고유 `shoppingmall` fixture DB에 0000~0010을 적용하고 `QA_RUN_ID=ac711003`의 가상 고객·판매자·관리자/상품만 만든다. WSL/Windows 127.0.0.1:9091/9092 터널, Windows 전용 Chrome 임시 profile/CDP 9229만 시험 중 사용한다. 사전 이름·포트 무점유, 종료 시 정확한 fixture reset·계정/판매자/상품/장바구니/예약/품목/재고대기/감사/세션 9범주 0, 전용 컨테이너·볼륨/포트/프로필 0, 지정 checkout clean·공유 migration 10건 불변을 확인한다. 실계정·실결제·영속 볼륨·공유 DB 쓰기 없음. 시험 암호는 실행 중 생성하고 로그/Git에 기록하지 않는다.
- 첫 Chrome 실행: 동일 SHA의 가상 구매자 로그인→상품·수량→서버 예약 201/브라우저 주입 409→저장 ID·키 제거 후 장바구니 새로 열기→계정 조회로 동일 ID·만료시각 자동 복구→예약 해제까지 통과. 뒤의 기존 390px/Tab 검사에서 1 fail: 시험은 sessionStorage 삭제만 기다렸으나 화면 `release()`는 그 직후 `refresh()`를 기다리며 `busy`를 유지하므로 입력이 disabled인 순간에 Tab을 보냈다. 입력 활성화를 조건으로 기다리도록 QA 스크립트만 수정한다. 제품 결함으로 판정하지 않고 fixture reset/reseed 뒤 전체 브라우저를 다시 실행한다. 시험 타이밍 오류 1회, 동일 원인 3회 반복 없음.
- 재시험/정리: `bc7594e3e22099b6b3baa6626c29c16339a600f6` WSL 지정 checkout·생산 API/Web 빌드·readiness 200. 가상 고객 Chrome 실제 DOM에서 로그인→상품 2개/49,000원→3개/69,000원→서버 예약 201을 브라우저에만 409로 주입→저장 ID·멱등키 모두 제거→장바구니 재방문 시 자기 예약 ID·만료시각 불변 자동 조회→예약 해제→390px 가로 넘침 없음/Tab 초점→상품 제거·빈 장바구니 **전부 통과**. 중간 한 재실행은 fixture reset/reseed 후 이전 상품 UUID를 시험 입력해 상품 상세 대기 timeout 1회(제품 결함 아님); 격리 DB에서 새 UUID를 확인해 동일 절차 재실행 통과. `QA_RUN_ID=ac711003`만 reset 후 9범주 `0|0|0|0|0|0|0|0|0`, 정확한 3컨테이너·볼륨 0, Windows 9091/9092/9229 listener·Chrome profile 0, WSL checkout clean·동일 SHA, 공유 migration 10건 불변. 오류는 시험 타이밍과 입력 UUID 각각 1회, 동일 원인 연속 3회 없음. 이 증거는 자체 격리 브라우저 QA이며 정식 공유 DB 통합/E2E·실제 별도 기기·사용자 인수/Oracle은 미검증이다.
- 독립 리뷰/만료 경계 보정 계획: 리뷰 대상 `93df481..bc7594e`에서 Critical 0, Important 2. 브라우저 재시험 기록 누락 지적은 후속 `4872cef`의 위 재시험 증거로 해소했다. 나머지는 `/active`가 첫 DB 만료 검사 뒤 견적의 두 번째 DB 시각 검사 전에 만료되면 `Reservation unavailable` 예외가 409로 변환되고 첫 만료 전이·감사가 롤백되는 경계다. 서비스·견적 함수를 대조해 재현 가능성을 확인했다. 계정 소유 QA 예약의 DB 만료시각을 두 검사 사이에만 이동시키는 실DB RED를 추가해 예외/미종료를 먼저 확인하고, 같은 트랜잭션에서 최신 행 재조회·만료 전이 후 null→404로 보정한다. 기존 POST/다른 견적 오류는 건드리지 않는다. RED/ GREEN 자원은 정확한 `shoppingmall-s31-active-boundary-red-pg-1003`/`-node-1003` 및 `...-green-...` 일회용 컨테이너, 내부 fixture `shoppingmall` DB 0000~0010, 외부 포트·영속 볼륨·공유 DB 쓰기 없음. 종료 시 9범주/컨테이너·볼륨 0, WSL clean·공유 migration 10건 확인. 암호 런타임 생성·비출력.
- 만료 경계 RED: 시험·계획 commit `051c679`을 WSL 지정 checkout에 fast-forward. 첫 QA 래퍼는 전체 SHA와 7자리 축약형을 비교해 컨테이너 생성 전 exit 1(시험 미실행, 공유 DB 불변); 축약형 비교로 바로잡아 격리 DB 0000~0010에서 목표 HTTP 2건/1 pass/1 fail, 새 경계 assertion은 `Reservation unavailable` 예상 오류. 가상 시험 행은 `finally` 정리, 정확한 RED 두 컨테이너·볼륨 0, WSL clean·공유 migration 10건. 래퍼 오류 1회와 의도한 제품 RED 1회는 원인 구분, 동일 원인 3회 반복 없음.
- GREEN 코드: `/active` 조회의 견적 중 만료 오류에 한해 현재 예약 행을 다시 읽고 동일 트랜잭션에서 만료·감사 전이 후 `null`을 반환한다. 견적 완료 뒤에도 DB 시각으로 한 번 더 검사한다. 상품·정책 변경 등 다른 견적 오류는 종전대로 전파한다. 로컬 `pnpm test` 246건/187 pass/59 DB·환경 skip/0 fail + PR validator 8 pass, typecheck/lint/build/diff check exit 0. 로컬 skip은 실DB GREEN 증거가 아니며 다음 정확한 SHA WSL 격리 목표/전체 suite가 남아 있다.
- GREEN 실DB: 제품 `e0554df08ca8f560c0faaf6429714a391fcec312`를 SSH alias push→WSL 지정 checkout fast-forward·clean. 격리 DB 0000~0010 적용 후 새 만료 경계·권한 포함 HTTP 목표 **2 pass/0 fail**, 루트 순차 실DB **246건/239 pass/7 조건부 skip/0 fail**, 바깥 셸 exit 0. 경계 시험은 첫 검사와 견적 검사 사이 DB 만료시각을 이동시킨 뒤 null→HTTP 404·EXPIRED·감사 1건을 단언한다. QA 9범주 `0|0|0|0|0|0|0|0|0`, 정확한 GREEN 두 컨테이너·볼륨 0, 지정 checkout 동일 SHA/clean, 공유 `local-postgres/shoppingmall` migration 10건 불변. 기존 잘못된 정책 주입의 예상 Nest 오류 로그는 suite 실패가 아니다. 코드 리뷰 Critical 0/Important 2 중 브라우저 재시험 증거와 만료 경계 보정을 각각 해결했으며 정식 공유 DB 통합/E2E·실제 기기/UAT/Oracle은 아직 미검증이다. 다음은 별도 요청한 공유 0010 적용 승인 결과 확인, 승인 시 대상·백업/rollback·dry-run 재확인 후 정식 통합을 실시한다. 승인 전에는 공유 DB를 쓰지 않는다.
- 리뷰 재확인: 같은 읽기 전용 리뷰 담당자는 후속 diff·시험·현황을 대조해 앞선 Important 2건이 모두 해소됐고 새 Critical/Important 회귀는 보이지 않는다고 판정했다. 리뷰어가 실DB 시험을 직접 재실행한 것은 아니며 위 실행 증거와 구분한다. 현재 로컬/SSH 원격/WSL 지정 checkout의 문서 checkpoint `638b0e8436aaebbb521547698353c98685cb1c50` 일치·clean. 공유 DB migration 0010은 별도 비차단 승인 질문에 대한 답변 대기 중이다.

## 진행 중 — 2026-10-03 S3.1 예약 생성·견적 원자성 보정

- 담당 어울. 기존 단일 writer `codex/s31-checkout-reservation-plan@19612b562f4b75854d4237e7fc79b90f53789427`의 clean 격리 worktree에서 진행한다. 새 공개 API·schema·공유 DB 쓰기·외부 서비스는 제외한다.
- 근거: `POST /customer/checkout/reservations`는 `CheckoutReservations.start`가 예약을 먼저 COMMIT한 뒤 별도 `quoteReservation`을 호출한다. 판매자 배송정책 조회·견적이 실패하면 고객에게 예약 ID 없이 오류가 돌아가지만 활성 예약이 남는다.
- 계획: 소유 QA 판매자에만 유효하지 않은 승인 정책을 넣어 HTTP 실패 후 예약 0을 단언하는 RED를 먼저 확인한다. 이후 기존 POST 성공 응답 계약은 유지하며 예약·현재 견적을 같은 DB 트랜잭션에서 완료하거나 함께 rollback하도록 고친다. 테스트 fixture의 정책과 계정·상품은 finally에서 정리한다. 로컬 4 gate와 exact SHA WSL 격리 DB 전체 회귀를 수행하고 정식 공유 DB 통합·타 탭/기기 회복은 별도 경계로 남긴다.
- 실패 재현 시험만 `638c184`로 SSH 별칭 원격에 push. WSL 지정 checkout은 직전 `19612b5` clean이며 해당 커밋을 fast-forward pull한다.
- RED 자체 QA 자원: WSL 기존 이미지 `pgvector/pgvector:0.8.2-pg15`, `node:24-bookworm-slim`의 일회용 `shoppingmall-s31-atomic-red-pg-1003`, `shoppingmall-s31-atomic-red-node-1003`. 내부 fixture DB명만 `shoppingmall`; 외부 포트·영속 볼륨·공유 `local-postgres` 쓰기 없음. 0000~0010 적용 후 목표 HTTP 실DB 시험만 실행하고 예측한 활성 예약 1개 결함을 확인한다. 완료·실패 즉시 정확한 두 컨테이너와 익명 볼륨을 제거하며 공유 migration 10건·WSL clean을 읽기 전용 재확인한다. 암호는 런타임에서만 생성, 로그·Git에 기록하지 않는다.
- 오류 횟수: 0. 다음: WSL 격리 RED 재현.
- RED 결과: WSL `638c184`에서 0000~0010 적용 후 목표 HTTP 실DB 시험 2건 중 1 fail/1 pass. 잘못된 QA 판매자 정책으로 POST 500, 이어 활성 예약 실제 1건(예상 0건)을 확인했다. 정확한 QA 컨테이너·이름 일치 볼륨 0, checkout clean. 래퍼 마지막 Bash 조건식이 줄 끝 처리 문제로 exit 1을 냈으나 목표 시험의 assertion 결과는 명확하며 제품 오류와 구분한다. 같은 근본 원인 반복 0회.
- GREEN 코드: 배송정책 읽기와 예약 견적을 기존 예약 생성 트랜잭션의 동일 DB 연결에서 수행하도록 내부 서비스만 수정했다. 견적·정책 조회 실패는 새 예약·품목·감사 모두 rollback한다. 기존 POST 성공 JSON은 그대로, GET 재견적도 같은 연결에서 정책을 읽는다. 실패 뒤 동일 멱등키로 정상 재시도되는 시험을 추가했다.
- 로컬 중간 검증: `pnpm typecheck` 통과; `pnpm test` 245건/186 pass/59 환경 skip/0 fail 및 PR validator 8 pass; `pnpm lint`는 미사용 `pool` 1건을 발견해 제거 후 통과. 첫 `pnpm build`는 D: sandbox의 기존 dist 쓰기 EPERM(제품 오류 아님), 동일 명령 권한 상승 재실행 exit 0. 최신 테스트 추가 후 WSL 격리 GREEN·로컬 재검증은 아직 미완료다.
- GREEN 자체 QA 자원: 제품/시험 `d32ffaa`를 지정 WSL checkout에 fast-forward pull한 뒤 기존 이미지로 `shoppingmall-s31-atomic-green-pg-1003`, `shoppingmall-s31-atomic-green-node-1003` 두 일회용 컨테이너를 사용한다. 내부 `shoppingmall` fixture DB에 0000~0010만 적용하고 대상 HTTP 실DB 시험을 먼저, 이어 전체 순차 DB suite를 실행한다. 외부 포트·영속 볼륨·공유 DB 쓰기 없음. 완료/실패 trap에서 정확한 두 컨테이너와 익명 볼륨을 제거하고 QA 9범주·WSL checkout·공유 migration을 확인한다. 암호는 런타임에만 둔다. 자체 격리 QA를 정식 WSL 통합/E2E로 대체하지 않는다.
- `d32ffaa` GREEN 결과: WSL 격리 DB에서 목표 HTTP 2 pass/0 fail, 정책 실패 뒤 활성 예약 0·동일 멱등키 재시도 201·예약 해제 통과. 이어 `/app/apps/api` 실행 suite는 114건/107 pass/7 조건부 skip/0 fail, 바깥 셸 exit 0이었다. 이 명령은 **API 시험만** 검색하므로 전체 저장소 245건 회귀로 잘못 승격하지 않는다. QA 9범주 `0,0,0,0,0,0,0,0,0`, 정확한 QA 두 컨테이너·볼륨 0, WSL checkout clean/동일 SHA, 공유 `local-postgres/shoppingmall` migration 10건 불변. 예상 500 오류는 결함 주입 결과다.
- 전체 저장소 회귀 추가 자원: 같은 exact SHA에서 새 일회용 `shoppingmall-s31-atomic-root-pg-1003`, `shoppingmall-s31-atomic-root-node-1003`를 사용한다. 동일 격리 규칙/0000~0010/런타임 암호/완료 즉시 정확한 자원 제거를 적용하고, 명령의 작업 디렉터리만 `/app`으로 바꿔 전체 실DB suite를 확인한다. 정식 공유 DB E2E 증거로 승격하지 않는다.
- 전체 저장소 실DB 결과: WSL 지정 checkout `d32ffaa915939e0c0a2161f878a51f12cc9821f6`, 격리 DB 0000~0010 적용, 루트 `/app` 순차 suite **245건/238 pass/7 조건부 skip/0 fail**, 바깥 셸 exit 0. QA 9범주 `0,0,0,0,0,0,0,0,0`; 정확한 GREEN·ROOT 컨테이너/이름 일치 볼륨 0; WSL checkout clean·동일 SHA; 공유 `local-postgres/shoppingmall` migration 10건 불변. 별도 API 목표 시험 2 pass·전체 API 114건/107 pass/7 skip/0 fail과 구분한다. 새 공개 활성 예약 조회·공유 0010 적용·정식 WSL 통합/E2E·Oracle/PG/인수는 여전히 미승인 또는 미검증이다.
- 판정: POST의 커밋 후 견적 오류로 숨은 예약이 남는 Important는 기존 계약 범위에서 재현·보정·실DB GREEN 확인. 다른 탭/기기에서 활성 예약 ID를 찾을 수 없는 Important는 그대로 남아 PR/병합 게이트 미충족. 다음: 정확한 공개 조회 계약 승인과 공유 0010 적용 승인 후 목표 RED→GREEN, 정식 WSL 통합·브라우저/리뷰 재검증.
- 후속 읽기 전용 확인: 로컬/WSL/SSH 원격 모두 문서 checkpoint `5f4079ac341167a09cb48bea30c1cfd5638b3470` 및 clean; 0010 SQL SHA-256 `2be18dda86fb4ed32df427628ace9f9359c714d117bd3429cfd7ff81dc42267c`; 공유 DB `shoppingmall|migration 10|accounts 0|products 0`. 첫 SQL 조회의 셸 인용 오류 1회는 조회 전 구문 오류였고 단순 SELECT로 재확인했으며 DB 쓰기 없음. 공개 활성 예약 조회 API 결정은 비차단 질문으로 요청했고, 답 전에는 구현하지 않는다. 공유 0010도 적용 승인 전 미실행.

## 진행 중 — 2026-10-03 S3.1 최신 화면의 멱등키 실브라우저 회귀

- 담당 어울, 단일 writer `codex/s31-checkout-reservation-plan@a73610c7085976449b02858042675470c3106ccf`. Windows/WSL 지정 checkout clean·동일 SHA, SSH 원격 alias 확인. 승인된 S3.1의 기존 POST/화면 동작만 검증하고 공개 API·schema·공유 DB·Secret 계약은 변경하지 않는다.
- 변경 예상: `scripts/qa-cart-browser.mjs`에 선택적 예약 재시도 시나리오와 이 작업현황 기록. 실제 브라우저에서 첫 POST의 서버 201을 네트워크 경계에서만 409로 바꿔 전달하고, 새로고침 후 같은 멱등키로 기존 ID·만료시각을 되찾고 명시적 해제하는지 본다. 브라우저 조작은 자체 QA이며 사용자 인수·타 탭/기기 회복 PASS가 아니다.
- 사전 QA 자원/정리: WSL 지정 checkout exact SHA, 고유 `QA_RUN_ID=a32f1003`; 기존 로컬 이미지로 일회용 `shoppingmall-s31-retry-ui-pg-1003`, `shoppingmall-s31-retry-ui-api-1003`, `shoppingmall-s31-retry-ui-web-1003` 컨테이너를 사용한다. DB는 컨테이너 내부의 정확한 `shoppingmall_s31_reservation_ui_1002`만 생성해 0000~0010 migration과 가상 구매자 2·판매자 1·관리자 1·상품 1 fixture를 넣는다. WSL loopback 9091/9092, Windows SSH loopback 터널 9091/9092, 별도 임시 Chrome profile/CDP만 시험 중 사용한다. 시작 전 이름·포트 점유를 확인하고 완료/실패 뒤 fixture reset과 QA 9범주 0, 정확한 컨테이너·포트·Chrome 임시 자원 0, WSL clean·공유 DB migration 10건 불변을 확인한다. 외부 포트/영속 볼륨/실계정/실결제 없음. 시험 암호는 실행 중 생성하고 로그/Git에 기록하지 않는다.
- 시작 전 환경: WSL 호스트 Node 18에는 `pnpm`이 없지만 기존 `node:24-bookworm-slim` 이미지와 checkout 의존성/빌드 도구는 존재한다. 9091/9092 LISTEN과 `shoppingmall-s31-*` 잔류 컨테이너가 없고 다른 프로젝트 컨테이너는 건드리지 않는다. 같은 근본 원인 오류 0회. 실패하면 이 QA 자원만 정리하고 실제 실패 지점을 기록한다.
- 첫 격리 QA 기동: 지정 SHA의 0000~0010 migration 11건과 API/Web 생산 빌드 통과. Web `/cart` 200이지만 API `/ready`는 연결 불가로 readiness 제한시간 종료(exit 1). `main.ts` 기본 `API_HOST=127.0.0.1`이 PG 컨테이너와 공유한 네트워크 namespace에서만 열려 호스트 포트 포워딩에 닿지 않은 원인이다. 제품 코드 수정 없이 QA API 컨테이너에만 `API_HOST=0.0.0.0`을 지정해 재시도한다. 첫 실행은 fixture seed 전이며 trap으로 정확한 QA 컨테이너 3개와 9091/9092 listener 0, WSL checkout clean을 확인했다. 같은 원인 연속 오류 1회, 공유 DB 영향 없음.
- 두 번째 기동: 같은 코드의 격리 migration/API·Web readiness 200, 가상 fixture seed 성공, Windows loopback SSH 터널 및 별도 headless Chrome CDP 200. 첫 브라우저 실행은 기존 QA harness가 Next 로그인 hydration 전 입력해 공란이 되는 시험 자동화 시간경합 1회(제품 로그인 실패 아님). React hydration 확인 뒤 입력·값 대기를 추가해 로그인/상품 2개·수량 3개 견적을 통과했다. 이어 서버 POST 201을 브라우저에만 409로 바꾼 실제 화면 시험에서 새로고침 뒤 재시도 버튼이 사라지는 제품 결함을 재현했다. 예약은 격리 DB에만 존재한다. QA 계정 암호를 브라우저 실행과 함께 사용할 수 있도록 fixture만 reset/reseed했으며 실계정 사용 없음. 서로 다른 원인 오류 각 1회, 동일 원인 3회 연속 없음.
- TDD 보정: 견적 없는 장바구니에 보존된 멱등키가 있을 때 재확인 버튼이 보이지 않는 실패 시험 1건을 먼저 확인했다. 기존 POST·키를 재사용하는 화면 버튼과 안내를 추가하고, 예약 해제·종료 시 키/버튼을 함께 정리했다. 목표 화면 시험 8 pass/0 fail. 로컬 `pnpm test` 245건/186 pass/59 DB·환경 skip/0 fail + PR 본문 validator 8 pass; `pnpm typecheck`, `pnpm lint`, `pnpm build` exit 0. 실제 브라우저 재시험과 최신 SHA WSL 격리 전체 회귀는 아직 미완료이며 공유 DB 0010은 미적용이다.
- 최신 실브라우저: `5f16e5785dd8fbd50b2316daff9497b0ae7a4333` WSL 지정 checkout/Next 생산 빌드·API/Web readiness 200. 첫 QA 웹 재기동 래퍼는 전체 SHA를 7자리 축약형과 비교해 build 전 exit 1(제품 오류 아님), 전체 SHA 비교로 단일 수정 후 exit 0. 가상 고객 로그인→상품 2개/49,000원→3개/69,000원→첫 예약은 서버 201·브라우저에만 409→새로고침 뒤 저장된 동일 키로 기존 예약 ID와 만료시각 불변 확인→예약 해제→390px 넘침 없음/Tab 초점→제거·빈 카트까지 Chrome 실제 DOM 통과. QA fixture `a32f1003` reset 후 계정·판매자·상품·카트·예약·품목·대기재고·감사·세션 9범주 `0|0|0|0|0|0|0|0|0`; 지정 QA 3컨테이너/볼륨·WSL 9091/9092, Windows 터널 9091/9092/CDP 9229·Chrome 프로필 0. WSL checkout clean, 공유 DB migration 10건 불변. 다른 탭·기기, 사용자 인수, 정식 공유 DB 통합은 미검증이다. 각 QA 래퍼/자동화 오류는 서로 다른 원인으로 1회씩 수정했으며 동일 원인 연속 3회 없음.
- 다음 WSL 격리 전체 suite 예정: 정확한 SHA `5f16e5785dd8fbd50b2316daff9497b0ae7a4333`에서 일회용 `shoppingmall-s31-retry-final-pg-1003`와 `shoppingmall-s31-retry-final-node-1003`(기존 `pgvector/pgvector:0.8.2-pg15`, `node:24-bookworm-slim`)만 생성한다. 컨테이너 내부 DB명 `shoppingmall`, 외부 포트/영속 볼륨/공유 DB 쓰기 없음. 0000~0010 적용·전체 순차 실DB 회귀 후 QA 9범주 0과 정확한 컨테이너·볼륨 0, WSL clean을 확인한다. 암호는 실행 중만 생성, 실패해도 정확한 두 QA 컨테이너만 자동 정리한다. 이 결과는 자체 격리 QA이며 정식 WSL 통합/E2E가 아니다.
- 최신 SHA 격리 전체 suite 결과: migration 0000~0010 11건, 순차 Node 실DB **245건/238 pass/7 조건부 skip/0 fail**, 바깥 셸 exit 0. QA 9범주 `0|0|0|0|0|0|0|0|0`, 정확한 두 QA 컨테이너와 연결 볼륨 0, 지정 checkout clean. 공유 `local-postgres/shoppingmall` migration은 읽기 전용 10건 그대로. 제품 SHA `5f16e5785dd8fbd50b2316daff9497b0ae7a4333`의 자체 격리 회귀 PASS이며 정식 공유 DB 통합/E2E·다른 탭/기기 회복·사용자 인수 PASS는 아니다. 남은 Important 2건과 새 공개 활성 예약 조회 API/공유 0010 별도 승인 대기 중이므로 PR·병합 게이트는 열지 않는다.

## 진행 중 — 2026-10-03 S3.1 기존 멱등키 재시도 회복 보정

- 담당 어울, 단일 writer `codex/s31-checkout-reservation-plan@e57dd81720f4a039bb4a0502e561c65492360a55`, 로컬/WSL checkout clean·동일 SHA, 공유 DB migration 10건을 읽기 전용 확인. 새 branch/공개 API/DB schema/공유 DB 쓰기 없음.
- 근거: 승인된 예약 설계의 동일 `Idempotency-Key` 재시도는 원래 예약을 되찾고 15분을 연장하지 않아야 한다. 현재 고객 장바구니 화면의 POST 409 분기가 키를 지워, 예약 DB 커밋 뒤 재견적 충돌이 나면 같은 키로 회복할 기회를 잃는다. 이 범위는 기존 공개 API의 고객측 재시도 보정이며 타 탭·기기 복구 문제 자체는 해결하지 않는다.
- 변경 예정: `apps/web/app/cart/page.tsx`, `apps/web/test/checkout-reservation-screen.test.mjs`, 이 작업현황. 외부 시스템/Secret/DB 영향 없음. 시험은 네트워크 경계만 가짜 응답으로 두고 실제 화면 요청 함수가 409 후 같은 키를 재사용하는지 RED→GREEN, 이후 로컬 전체 4 gate와 WSL exact SHA 격리 회귀를 수행한다. WSL QA 자원이 필요하면 생성 전 이름·수명·정리를 별도 기록한다.
- 화면 RED/GREEN: 기존 409 키 삭제 동작을 겨냥한 새 시험에서 요청 함수 부재로 1 fail을 확인하고, 실제 예약 시작 버튼이 호출하는 함수로 키 보존·동일 키 재시도·성공 시 ID 저장을 모았다. 목표 7 pass/0 fail. 로컬 `pnpm test` 244건/185 pass/59 DB·환경 skip/0 fail과 PR 본문 validator 8 pass, `pnpm typecheck`·`pnpm lint` exit 0. 첫 `pnpm build`는 제한 샌드박스의 D: 기존 `dist` 쓰기 `EPERM` 1회였고, 정확한 D: 작업 폴더 빌드만 권한 상승 실행해 동일 명령 exit 0. 제품 빌드 오류로 오인하지 않는다. 같은 원인 연속 오류 1회.
- WSL 자체 QA 예정 자원: 지정 checkout exact SHA에서 기존 로컬 `pgvector/pgvector:0.8.2-pg15`·`node:24-bookworm-slim` 이미지로 일회용 `shoppingmall-s31-key-postgres-1003`/`shoppingmall-s31-key-node-1003` 컨테이너를 만든다. 내부 fixture DB명만 `shoppingmall`, 외부 포트·영속 볼륨·공유 DB 쓰기 없음. 0000~0010 적용·전체 순차 실DB 회귀 후 QA 9범주 행 0, 정확한 두 컨테이너·볼륨 잔류 0과 WSL clean을 확인한다. 시험 암호는 실행 중에만 생성한다. 완료·실패 즉시 제거하고 정식 WSL 통합/E2E로 승격하지 않는다.
- WSL 격리 기동 오류: 전체 시험 래퍼가 QA DB 준비 전에 두 번 조기 종료(첫 실행 출력 0, 두 번째 `RUN_START/PG_STARTED`까지만 출력). 소규모 전달 시험과 Docker 초기 조건은 정상이었다. Docker 이벤트에서 `pg_isready` 첫 성공 직후 두 번째 호출의 exit 1과 trap의 컨테이너 종료를 확인했다. PostgreSQL 초기화 중 임시 서버를 준비 완료로 오인한 경쟁이 원인이다. 같은 원인 연속 오류 2회로 기록하고, 초기화 완료 로그 확인 후 최종 서버 응답을 기다리는 조건으로 보정한다. 제품 suite는 두 번 모두 시작되지 않았고 정확한 임시 컨테이너는 자동제거됐다. 공유 DB 영향 없음.
- 보정 후 WSL 자체 QA: 지정 checkout `aac5c6d94d468d15df930dc7678f82332944e631`에서 PostgreSQL 최종 초기화 로그·SQL 접속을 확인한 뒤 0000~0010 migration 11건 적용, `node --import tsx --test --test-concurrency=1 --test-reporter=spec` **244건/237 pass/7 조건부 skip/0 fail**, 바깥 셸 exit 0. 사후 QA 9범주 `0|0|0|0|0|0|0|0|0`; 정확한 두 QA 컨테이너·이름 일치 볼륨 0; WSL checkout clean. 공유 `local-postgres/shoppingmall` migration은 읽기 전용 재확인에서 10건 그대로다. 이 결과는 격리 실DB 회귀이며 정식 WSL 통합/E2E·실브라우저의 409 회복·신규 API/공유 DB 승인·인수 PASS는 아니다.
- 다음: 기존 409 키 삭제 보정과 격리 전체 회귀는 완료했다. 남은 서버 측 예약 ID 회복·타 탭/기기 활성 예약 발견은 별도 공개 API 승인 답변 뒤 RED→GREEN 및 실브라우저 재검증한다. 공유 0010 적용은 별도 승인 전 미실행. 두 Important가 남아 PR·병합 게이트는 열지 않는다.

## 진행 중 — 2026-10-03 S3.1 리뷰 후 최신 SHA 격리 전체 회귀

- 담당 어울, 기존 단일 writer `codex/s31-checkout-reservation-plan@a96ef42985feb697b3729bec950f4a1e8b103d93`. 로컬·WSL 지정 checkout clean/동일 SHA를 확인했다. 공유 `local-postgres/shoppingmall`의 0010은 여전히 미적용이다. 이전 전체 실DB suite는 UI 리뷰 보정 전 `4bb5234` 증거이므로 현재 SHA의 PASS로 합치지 않는다.
- 사전 QA 자원 계획: WSL 지정 checkout `/home/daon/deploy/shopping`의 기존 로컬 이미지와 설치된 의존성을 사용해 `shoppingmall-s31-final-postgres-1003`(일회용 PostgreSQL, 컨테이너 내부 DB명 `shoppingmall`)과 `shoppingmall-s31-final-node-1003`(일회용 Node 24)를 만든다. 외부 포트·영속 볼륨·공유 DB 변경 없이 0000~0010 적용과 전체 순차 실DB 시험만 수행한다. 시험 암호는 실행 환경에서만 생성·전달하고 로그/Git에 저장하지 않는다. 완료·실패 즉시 정확한 두 컨테이너를 제거하고 QA 계정·상품·예약 등 행 0, 컨테이너/볼륨 잔류 0, checkout clean을 확인한다. 이 시험은 자체 격리 QA이며 정식 WSL 통합/E2E가 아니다.
- 첫 실행 결과: 0010까지 migration 11건, Node 실DB 전체 suite 자체는 243건/236 pass/7 조건부 skip/0 fail, 종료 상태 `QA_SUITE_EXIT=0`, QA 9범주 `0|0|0|0|0|0|0|0|0`. 그러나 PowerShell→SSH 파이프의 CRLF로 마지막 Bash `exit 0\r`이 실패해 래퍼 종료 코드 1. 제품 실패로 오인하지 않으며 깨끗한 LF 전달 방식으로 재실행한다. 종료 trap 뒤 지정 두 컨테이너·이름 일치 볼륨 0, WSL checkout clean/동일 SHA를 읽기 전용 재확인했다. 같은 원인 연속 오류 1회.
- LF 재실행: 동일 WSL SHA `a96ef42985feb697b3729bec950f4a1e8b103d93`, 격리 DB migration 11건, `node --import tsx --test --test-concurrency=1 --test-reporter=spec` 243건/236 pass/7 조건부 skip/0 fail, **바깥 셸 종료 코드 0**. QA 9범주 `0|0|0|0|0|0|0|0|0`, 전용 두 컨테이너·이름 일치 볼륨 0, checkout clean. 읽기 전용 재확인에서 공유 `local-postgres/shoppingmall` migration 이력은 10건 그대로다. 실DB 회귀는 최신 코드의 자체 격리 QA PASS이나 정식 WSL 통합/E2E 또는 리뷰 Important 해소 PASS가 아니다.
- 독립 리뷰의 남은 Important: POST 커밋 후 견적 실패 시 ID 미전달, 다른 탭/기기에서 현재 ACTIVE 예약 복구 불가. 기존 네 공개 API 범위 내 동작을 먼저 분석했다. 새 공개 활성 예약 조회 API는 비차단 별도 승인 질문의 답변 전에는 추가하지 않는다. 공유 DB 0010 적용 역시 별도 승인 질문의 답변 전에는 수행하지 않는다.
- 다음: 최신 SHA 격리 전체 회귀와 자원 정리 증거 기록. 승인된 계약이 확정되면 남은 리뷰 항목을 RED→GREEN으로 수정하고 동일 SHA 정식 WSL 시험·재검토 후 PR 게이트를 판단한다.

## 진행 중 — 2026-10-03 S3.1 예약 Task 7 격리 전체 회귀

- 담당 어울, 기존 단일 작업 브랜치 `codex/s31-checkout-reservation-plan` / D: 격리 worktree. 현 WSL·원격 SHA `72bbbb5a8c8c4c524e026504f741f7bab98b24e7`, Windows 작업 트리에서 제품 코드는 추가 수정하지 않았다. 지정 공유 `local-postgres/shoppingmall` 0010은 미적용이며 정식 WSL 통합·UAT는 미검증.
- Task 6 실브라우저: 격리 DB `shoppingmall_s31_reservation_ui_1002`에서 구매자 예약 46,000원+배송 3,000원, 새로고침 복구·해제·품절 제거, 운영자 사유 취소의 구매자 표시, DB 시각 만료의 재견적, 판매자 재고 0 입력의 기존 예약 2개 보전/종료 후 0을 확인했다. 두 구매자 2개/4개 경쟁에서 첫 예약 중 두 번째 견적 거부, 첫 예약 만료 뒤 두 번째 예약 성공·92,000원 무료배송을 실제 화면에서 확인했다. 430/1440/1920px에서 가로 넘침 없음, 키보드 Enter 재견적 동작 확인. 실제 200% 확대는 계획대로 UAT-03 미검증. 결제·주문/UAT 완료 주장 아님.
- Task 6 QA 정리: 고유 `QA_RUN_ID=3c2b7a91`의 가상 계정·상품·장바구니·예약·예약품목·대기목표·감사·세션 등 9범주 `0|0|0|0|0|0|0|0|0`. `shoppingmall-s31-reservation-ui-api-1002`/`-web-1002` 자동제거, 전용 DB 정확히 drop 후 목록 부재, 공유 `shoppingmall` 보존, Windows 9091/9092 listener 부재. 삭제 자료는 재생성 가능한 격리 QA뿐. 초기 host-network DB 인증 실패 1회는 local-postgres 네트워크 공유로 수정했고, 잘못 지정한 Git remote 이름 push 실패 1회는 `origin` URL이 승인 SSH alias임을 확인한 뒤 정상 push했다. 동일 원인 3회 연속 없음.
- Task 7 로컬 4 gate: 현재 SHA `72bbbb5`의 `pnpm test` 241건/182 pass/59 DB·환경 skip/0 fail, PR 본문 8 pass, typecheck/lint/build exit 0. skip을 DB PASS로 간주하지 않는다.
- Task 7 자체 QA 자원 계획: WSL 지정 checkout exact SHA에서 기존 로컬 이미지 `pgvector/pgvector:0.8.2-pg15`로 이름 `shoppingmall-s31-full-postgres-1003`인 **일회용** PostgreSQL 컨테이너를 만든다. DB 이름만 fixture 가드용 `shoppingmall`이며 지정 공유 `local-postgres`와 다른 컨테이너다. 외부 포트/영속 볼륨은 만들지 않고 별도 시험 암호를 사용한다. Node24 일회용 컨테이너 `shoppingmall-s31-full-node-1003`가 해당 컨테이너의 network namespace로 접속해 0000~0010 migration·전체 suite를 순차 실행한다. 완료/실패 시 QA 행·두 컨테이너를 확인하고 정확한 두 자원만 제거한다. 이는 자체 QA 회귀이며 공유 DB 0010 적용 승인이나 정식 WSL 통합·E2E 증거를 대체하지 않는다.
- Task 7 격리 전체 회귀 결과: `4bb52349d5176d2e0c0ea4f9b5df73be90a05fae` WSL clean checkout에서 별도 PostgreSQL(`pgvector/pgvector:0.8.2-pg15`, DB명만 `shoppingmall`)에 0000~0010 migration 11건·예약 관계 3개 적용 후 `node --import tsx --test --test-concurrency=1` 241건/234 pass/7 환경 조건부 skip/0 fail. 사후 계정·판매자·상품·장바구니·예약·품목·대기목표·감사·세션 `0|0|0|0|0|0|0|0|0`, 전용 Node 컨테이너 0, PostgreSQL 컨테이너와 정확한 익명 볼륨 자동제거 확인. 외부 포트 0. 이 자료는 재생성 가능한 격리 QA이며 정식 WSL 통합/E2E와 구분한다.
- 공유 DB 읽기 전용 확인: `migrate-dry-run.ts`에서 적용 10건/대기 `0010_s3_checkout_reservations` 1건·14문장·SHA-256 `2be18dda86fb4ed32df427628ace9f9359c714d117bd3429cfd7ff81dc42267c`. 공유 계정/상품/카트 `0/0/0`, 예약 관계 부재, SQL 적용 0. 정확한 공유 DB 적용은 별도 승인 전 미실행이다.
- 독립 코드 리뷰는 Critical 0/Important 3/Minor 1로 병합 부적합 판정. Important: POST 커밋 후 견적 경합에서 ID 미전달, 탭 종료 후 활성 예약 복구 불가, 판매자 재고 409 문구가 초안 생성에 잘못 위치. 마지막 항목은 화면 시험 예상 RED 1 fail 후 재고 저장 함수로 409 처리를 이동해 목표 5 pass GREEN. Minor인 5초 재조회 지연 응답 순서 경합도 예상 RED 1 fail 후 세대 번호·취소 신호를 적용해 화면 시험 6 pass GREEN, typecheck/lint exit 0. 새 공개 활성 예약 조회 API는 승인 질문을 비차단으로 보냈고, 답 전에는 계약을 추가하지 않는다. 같은 원인 오류 3회 연속 없음.
- PR 설명 `.github/PR_REQUEST.md`를 이번 예약 단위의 목적·요약·영향·검증·미검증·rollback으로 교체했고 본문 validator 8 pass, `git diff --check` 이상 없음. `docs/DEVELOPMENT_ENVIRONMENT.md` 맨 위에 현재 브랜치·공유 DB 0010 미적용·격리 회귀와 정식 통합의 차이를 기록했다. 리뷰 후 화면 수정의 로컬 전체 `pnpm test` 243건/184 pass/59 DB·환경 skip/0 fail, typecheck/lint/build exit 0. 이전 `4bb5234` WSL 실DB 수치를 리뷰 후 변경의 PASS로 옮기지 않는다.
- 리뷰 보정 안전 checkpoint `cb40bcda6234f210d7d1b5dde96270b0ae79056f`를 지정 SSH alias로 기존 branch push→WSL checkout에 fast-forward. WSL 화면/기존 장바구니 목표 10 pass/0 skip/0 fail, 전용 `shoppingmall-s31-review-ui-1003` 컨테이너 자동제거·잔류 0. 공유 DB 변경 없음. 현재 PR 생성·병합은 미실행이며 리뷰 Important 2건과 공유 DB 0010 승인 경계가 남는다.
- 다음: 리뷰 지적의 계약 내 결함 수정·재검증, 현재 브랜치 PR 본문/환경 문서 정렬. 승인되면 계정 소유 활성 예약 조회를 추가하고 POST 견적 경합을 회복 가능하게 한다. 공유 `shoppingmall`의 0010 적용과 Oracle staging은 각각 별도 승인 경계다.

## 진행 중 — 2026-10-02 S3.1 예약 Task 6 Flat v2 화면

- 담당 어울, 기존 `codex/s31-checkout-reservation-plan` 격리 worktree. Task 5 완료 후보까지 공용 DB 0010은 미적용이고 전체 WSL suite·UAT는 미검증.
- 화면 RED/GREEN: `checkout-reservation-screen.test.mjs` 3건은 시작 버튼·15분 안내·예약 중 편집 차단/종료 재견적 부재로 RED 3 fail/0 skip; 기존 장바구니 Flat v2 구조에 별도 서버 예약 상태와 표시용 초시계·해제 버튼을 연결해 3 pass. 운영자 사유 취소 UI는 export 부재 RED 1 fail 후 현재 4 pass. 판매자 화면의 예약 중 재고 0/기존 보유/보류 적용 표시는 앞 Task 3 구현을 유지했다. 현재 로컬 `pnpm test` 241/182 pass/59 DB·환경 skip/0 fail, PR 본문 8 pass, typecheck/lint/build exit 0. 실제 브라우저는 아직 미검증.
- 실제 브라우저 QA 예정 자원: 지정 WSL `local-postgres`에 정확한 격리 DB `shoppingmall_s31_reservation_ui_1002`, `--rm` API/Web Node24 컨테이너 `shoppingmall-s31-reservation-ui-api-1002`/`shoppingmall-s31-reservation-ui-web-1002`, loopback 9092/9091 포트와 필요한 경우 Windows SSH 로컬 터널만 Task 6 시험 동안 사용한다. 가상 고객·판매자·관리자 각 1계정/상품/예약을 `QA_RUN_ID` 8자리로 식별해 만들고, 시험 전 DB·컨테이너·포트 점유를 확인한다. 종료 시 해당 QA 자료 0, 정확한 자원만 제거·부재 확인. 공용 `shoppingmall` DB·다른 프로젝트 자원은 보존한다.
- 다음: 화면 변경 안전 commit/push→WSL exact SHA, 격리 DB fixture/실제 브라우저 430/1440/1920px·키보드·예약/만료/관리자 취소를 확인. 200% 확대는 별도 UAT-03 미검증으로 둔다.

## 진행 중 — 2026-10-02 S3.1 예약 Task 5 완료 후보 / 다음 Task 6

- 담당 어울, 기존 `codex/s31-checkout-reservation-plan` 단일 writer. Task 4 구현 checkpoint는 `d3b9d8b26b8fc722934bbef1eff9cc9e76189060` 로컬/SSH 원격, WSL 지정 checkout은 Task 4 코드 `9e38d38` clean이며 다음 시험 전 fast-forward한다. Task 2 전체 gate·공용 DB 0010 미적용은 그대로 미충족.
- QA 자원 계획: WSL `local-postgres`의 새 격리 DB `shoppingmall_s31_reservation_http_1002`, `--rm` Node24 컨테이너 `shoppingmall-s31-reservation-http-1002`를 Task 5 RED/GREEN 기간에만 사용한다. HTTP 시험의 가상 고객 2/판매자/관리자·상품·예약·감사만 이 DB에 생성한다. 종료 시 QA 행 0, 정확한 DB/컨테이너 부재를 확인하며 공용 `shoppingmall`은 읽기 전용으로 보존한다.
- 다음: 기존 세션·Origin 계약으로 예약 HTTP 404 예상 RED부터 작성하고 관리자 사유 취소·DB 시각 만료 배치를 구현한다.
- Task 5 RED/GREEN: `5c40dd3`에서 미등록 경로 404 대 비로그인 401 예상 RED 1 fail/0 skip. `b40c734`의 고객 본인 예약 시작·조회·해제/운영자 사유 취소, 역할·Origin·멱등키·IDOR HTTP 실DB 1 pass/0 skip. 배치 시험은 최초 만료 조작에서 DB `expires_at > created_at` 제약을 어겨 시험 구성 오류 1회; `2b5072e`에서 양 시각 동시 조정 후 미구현 `reservation-cleanup.ts` 부재 RED 1 fail/0 skip. `175fc12`에서 DB 시각·멱등 배치 및 단발 CLI GREEN, CLI 실행 후 0 출력. `43a995b`에서 예약 중 카트 PUT/DELETE 409와 DB 미설정 503을 보강했다. 같은 원인 3회 연속 오류 없음.
- Task 5 검증/미검증: `43a995b` 동일 WSL SHA에서 HTTP·Task 4/기존 예약·상품·카트 실DB **8 pass/0 skip/0 fail**. 로컬 `pnpm test` **237 tests/178 pass/59 DB·환경 skip/0 fail**, PR 본문 8 pass, `pnpm typecheck`·`pnpm lint`·`pnpm build` exit 0. 배치 정지 중 만료된 ACTIVE 행도 신규 판매 수량을 차감하지 않고, 2회 실행은 1건/0건으로 멱등 확인. 앱별 타이머/운영 스케줄 설치는 하지 않았고 `docs/DEVELOPMENT_ENVIRONMENT.md`에 1분 외부 스케줄 제안·실패 재시도/감시 경계만 기록. 공용 DB 0010/WSL 전체 suite·브라우저/UAT는 미검증.
- QA 정리: 전용 격리 DB 사후 accounts/auth_sessions/sellers/products/reservations/deferred/audit `0/0/0/0/0/0/0`, 전용 `--rm` 컨테이너 0, 정확한 `shoppingmall_s31_reservation_http_1002` DB drop 후 목록 부재·공용 `shoppingmall` 보존. 삭제한 것은 재생성 가능한 이 격리 DB의 빈 시험 구조뿐이며 공유/운영 자료는 삭제하지 않았다. 다음은 Task 6 Flat v2 화면의 RED→GREEN과 실제 브라우저 검증.

## 진행 중 — 2026-10-02 S3.1 예약 Task 4 완료 후보 / 다음 Task 5

- 담당 어울, 기존 `codex/s31-checkout-reservation-plan` 격리 worktree에서 계속. Task 1~3 checkpoint는 유지하며 Task 2 전체 WSL gate 미충족과 공용 DB 0010 미적용을 PASS로 간주하지 않는다.
- QA 자원 계획: WSL `local-postgres`의 정확한 격리 DB `shoppingmall_s31_reservation_product_1002`와 `--rm` Node24 컨테이너 `shoppingmall-s31-reservation-product-1002`를 Task 4 RED/GREEN 실DB 검증 기간에만 사용한다. QA 계정·상품·예약은 해당 DB에서만 생성하고 사후 행 및 정확한 DB/컨테이너 부재를 확인한다. 공용 `shoppingmall`은 읽기 전용.
- 다음: Task 4의 예약 중 카트 변경·현재 견적·상품 승인·판매중지 시험을 먼저 추가하고 예상 RED를 확인한다.
- Task 4 RED/GREEN: `1675ed7`에서 예약 재견적 모듈 부재 1 fail/0 skip, `0434182`에서 카트 변경 차단·가격 재견적 1 pass. `9621a41`에서 활성 예약 중 개정 승인이 그대로 진행되는 예상 RED 1 fail/0 skip, `2645c48`에서 승인 보류 후 판매중지 취소 누락 RED 1 fail/0 skip, `dbe9bcd`에서 취소·감사 GREEN. 재견적 만료 판정에 JS 시각 사용 결함은 `86be25f`의 DB 시각 시험 1 fail/0 skip으로 확인하고 `c4465d1`에서 보정. 첫 개정 RED 시 기존 승인이 실제 실행되어 테스트 정리가 새 옵션 재고 FK에 막혔고, 전용 격리 DB의 QA 계정 1개만 확인한 뒤 정확한 DB를 재생성, 정리 순서를 고쳤다. 동일 근본 원인 반복 3회 없음.
- Task 4 기능/검증: `9e38d3872ade78770fd6e99e14211661e3d17c6c`의 WSL 격리 실DB 목표·상품 승인·판매중지·카트·예약·재고 **8 pass/0 skip/0 fail**. 두 상품 묶음 예약에서 한 상품 판매중지 시 예약 전체 CANCELLED, 관리자 사유/감사, 다른 상품의 보류 재고 0 적용까지 확인. 로컬 `pnpm test` **235 tests/177 pass/58 DB·환경 skip/0 fail**, PR 본문 8 pass; `pnpm typecheck`·`pnpm lint`·`pnpm build` exit 0. 새 시험은 현재 가격 및 승인된 판매자 배송정책의 변경을 재견적에 반영하고 고객 PC 시각을 판정에 사용하지 않는지 검증한다.
- QA 정리: 최신 격리 회귀 후 accounts/sellers/products/reservations/deferred/audit `0/0/0/0/0/0`, 전용 `--rm` 컨테이너 0. 정확한 `shoppingmall_s31_reservation_product_1002` DB만 drop하고 목록 부재·공용 `shoppingmall` 존재 확인. 이 DB의 가상 시험자료는 재생성 가능. 공용 DB 0010 적용 0, 실제 브라우저/전체 WSL suite/`checkout-quote-db`(기존 fixture DB명 제한)는 아직 PASS 아님. Task 2 전체 gate도 미충족. 다음은 Task 5 예약 HTTP·만료 작업 RED부터 시작.

## 진행 중 — 2026-10-02 S3.1 예약 Task 3 판매자 재고 0

- 담당/기준: 어울 단일 writer, `codex/s31-checkout-reservation-plan@75a53b030d9a04a942e249ba1290855646916d88` 로컬/원격/WSL clean. 기존 Task 2의 격리 DB 전체 회귀 17건은 기존 fixture의 `shoppingmall` DB 이름 제한으로 미충족이며 안전 guard를 변경하지 않는다. PMO의 독립 작업 계속 원칙에 따라 Task 3 RED/GREEN을 격리 진행하되 Task 2 전체 gate나 S3 완료로 승격하지 않는다.
- 사전 QA 자원 계획: 지정 WSL `local-postgres`에 **`shoppingmall_s31_reservation_stock_1002`** 격리 DB를 Task 3 동안만 만들고 0000~0010 migration을 적용한다. Node 24 일회용 컨테이너 **`shoppingmall-s31-reservation-stock-1002`**는 `--rm` 사용. 이 DB에만 QA 판매자/고객/상품/예약을 만들어 재고 0 즉시 차단·보류 목표·종료 후 0·양수 감소 거부를 시험한다. 종료 시 QA 행 0과 정확한 DB/컨테이너 부재 확인. 공유 `shoppingmall` DB는 읽기 전용, Oracle/외부 결제/타 프로젝트 자원 미접촉.
- 다음: 새 실DB 실패 시험을 먼저 작성·push하고 지정 WSL checkout exact SHA에서 예상 RED 확인.
- Task 3 RED/GREEN: `7fd0cf6` 테스트 전용 SHA를 지정 SSH push→WSL exact checkout하고 새 격리 DB 0000~0010에 적용. 재고 보유 3개 중 활성 예약 3개에서 판매자 입력 2개가 허용되는 예상 RED **1 fail/0 skip**을 확인했다. `42b7ed3`에서 계정→상품→옵션→재고 잠금과 활성 예약 보유량 미만 양수 입력 거부, 0 입력의 신규 판매 즉시 차단·보유량/대기 0 보전·마지막 예약 해제 시 0 적용을 구현해 목표 **1 pass/0 skip**. 기존 예약·재고·상품 승인 실DB 5건도 당시 GREEN.
- Task 3 HTTP/화면: 실제 판매자 HTTP에서 예약 보유량 미만 입력이 500인 RED를 확인했다. 첫 실행은 새 시험의 계정 역할 FK 정리 순서 오류가 최종 결과를 가려, 원인 확인 후 격리 DB의 가상 계정 4·판매자 1 잔여만 포함한 전용 DB를 정확히 drop/recreate하고 정리 순서를 수정했다. 재실행에서 **500 대 409 RED** 확인, `43adf5b`에서 409로 매핑해 목표 **1 pass/0 skip**. `29cbbd6`에서 판매자 조회의 예약 수량·대기 0과 화면 상태의 예상 RED(각 1 fail), `560df82`에서 API/Flat v2 판매자 화면을 연결해 화면 10 pass. 새 조회 필드로 기존 `inventory-db` 예상값 1건이 달라져 `c0547cb`에서 기대 계약만 갱신했으며 실DB 목표·예약 서비스·기존 재고·상품 승인 **5 pass/0 skip/0 fail**. `b31ce30`에서 판매자 0과 신규 고객 예약의 교차 경쟁 실DB 시험 **1 pass/0 skip/0 fail**. 오류 원인은 각각 확인·수정했으며 공유 DB·기존 자료 변경은 없음.
- Task 3 검증/정리: Windows 전체 `pnpm test` **234건 중 177 pass·57 DB/환경 skip·0 fail**, PR 본문 8 pass, `pnpm typecheck`/`pnpm lint`/허용된 D: `pnpm build` exit 0. WSL 전체 순차 suite는 기존 fixture의 DB 이름 제한과 공유 0010 미적용으로 아직 GREEN 미검증이며 실제 브라우저 조작도 미검증. 격리 DB 사후 accounts/sellers/products/reservations/deferred/audit `0/0/0/0/0/0`, 전용 컨테이너 잔류 0, `shoppingmall_s31_reservation_stock_1002` exact drop 후 목록 부재·공용 `shoppingmall` 보존 확인. 이 DB의 가상 시험자료는 재생성 가능. 다음은 Task 4 상품 개정·판매중지·카트/재견적 예약 연계의 RED부터 진행; Task 2 전체 gate와 공용 DB 적용은 별도 승인 전 미충족.

## 구현 착수 — 2026-10-02 S3.1 15분 예약 Task 1

- 담당/권한: 어울 단일 writer, 기존 `codex/s31-checkout-reservation-plan@325d3b4d544e2478ee97df354027d25862e4327b`. 신산님은 상세 계획과 새 공개 API 4개·예약 관계 3개·`0010` migration의 **구현/격리 시험 범위**를 승인했다. 공유 `WSL-server/local-postgres/shoppingmall` 실제 적용·Oracle·외부 결제는 승인 범위 밖이다.
- 기준 검증: Windows `pnpm test` 230건 중 176 pass·54 DB/환경 skip·0 fail, PR 본문 시험 8 pass·0 fail. Node 24.18.0, pnpm 11.25.0. 작업 worktree 추적 변경 0에서 시작했고 DB 실검증으로 오인하지 않는다.
- 사전 QA 자원 계획: Task 1은 `WSL-server`의 정확한 `local-postgres` 안에 **고유 격리 DB `shoppingmall_s31_reservation_1002`**와, 필요한 경우 이름 `shoppingmall-s31-reservation-test-1002`의 Node 24 일회용 컨테이너만 사용한다. 목적은 0000~0009 RED와 0010 전·후 schema 시험이며 수명은 Task 1 격리 검증 동안이다. `shoppingmall` 공유 DB·기존 계정·상품·주문은 읽기 전용으로 보존한다. 사용 후 정확한 격리 DB/컨테이너만 제거하고 부재·QA 행 잔류 0을 확인한다. 비밀값은 기록하지 않는다.
- 도구 오류/조치: 제공 `sdd-workspace`는 제한 Windows 셸의 D: 쓰기 거부로 디렉터리 생성에 실패했고, escalation 셸은 C: 플러그인 경로가 없는 WSL Linux여서 실행 실패했다. 반복 실패 프로세스는 PID를 확인해 해당 Bash만 종료했다. 제품/DB 파일 변경·QA 자원 생성은 없었다. 같은 원인의 추가 재시도 없이 무시 경로 장부와 이 파일에 직접 진척을 기록한다.
- Task 1 완료: `6505b6bfa7051ba5d30a4516a6f1129556e48cc6`를 지정 SSH alias로 push하고 WSL checkout도 동일 SHA·clean으로 확인했다. 0000~0009 위 0010 적용 및 새 빈 격리 DB의 0000~0010 전체 적용에서 schema 실DB 시험 각각 **1 pass/0 skip/0 fail**, Drizzle 11건·계정/상품/예약/대기목표 0행. `shoppingmall_s31_reservation_1002`를 정확한 이름으로 제거하고 목록 부재·전용 `--rm` 컨테이너 잔류 0 확인. Windows `pnpm test` 231건 중 176 pass·55 DB/환경 skip·0 fail, typecheck/lint/build exit 0. 공유 `shoppingmall` 읽기 전용 dry-run은 적용 10건·대기 0010 1건/14문장·SHA-256 `2be18dda86fb4ed32df427628ace9f9359c714d117bd3429cfd7ff81dc42267c`; **공유 DB에는 SQL을 적용하지 않았다**. 복구는 기존 데이터를 지우지 않고 예약 쓰기 경로를 닫은 뒤 보정 migration으로 한다.
- Task 2 사전 QA 자원 계획: `WSL-server/local-postgres` 안의 고유 격리 DB `shoppingmall_s31_reservation_service_1002`와 Node 24 자동제거 컨테이너 `shoppingmall-s31-reservation-service-1002`만 사용한다. 목적은 예약 시작·경합·만료·멱등 실DB RED/GREEN, 수명은 Task 2 동안이다. 가상 계정/상품/카트/예약/감사 행은 이 DB 안에서만 만들고 시험 정리 뒤 DB와 컨테이너를 정확한 이름으로 제거한다. 공유 `shoppingmall`은 읽기 전용으로 유지한다.
- Task 2 중간 검증: 테스트 전용 `cc1b732`를 SSH push→WSL exact SHA로 맞춰 위 격리 DB 0000~0010을 적용했다. 서비스 파일 부재 예상 RED **1 fail/0 skip**. 구현 `50ca05e`의 첫 실DB 시험은 두 요청 모두 `Invalid reservation request`였고 입력 UUID 유효성을 추가 확인해 서비스 정규식의 누락된 4자리 구간 1곳을 원인으로 확정했다. 수정 `62a8941`에서 마지막 1개 경합·동일 키/다른 키·타 고객 조회·명시 해제·만료 **1 pass/0 skip**. 이어 공개 수량 차감 예상 RED `f5ce5c7` **1 fail/0 skip**(실제 1, 기대 0), 수정 `bf43d71` 및 만료 worker 동시·재시작·판매중지 추가 시험 `01e3cac`에서 **1 pass/0 skip/0 fail**. 각 시점 WSL checkout은 branch exact SHA로 fast-forward했고 shared DB는 읽기 전용.
- Task 2 회귀 경계: Windows `pnpm test` 232건 중 176 pass·56 DB/환경 skip·0 fail, PR 본문 8 pass, typecheck/lint exit 0. 제한 셸 `pnpm build`는 D: 산출물 쓰기 `EPERM`으로 실패했으나, 동일 명령을 허용된 작업 경로에서 재실행해 API/Web build exit 0. 격리 DB 전체 순차 시험은 **232건 중 206 pass·17 fail·9 skip**으로 전체 gate 미통과. 실패 17건은 모두 기존 QA fixture가 DB 이름을 정확히 `shoppingmall`로 제한해 격리 DB를 거절한 동일 원인이다. 안전 guard를 완화하지 않았고 이 실패를 제품 회귀로 단정하거나 전체 통과로 표시하지 않는다. 그 외 실행 시험 중 예약 목표는 통과. 사후 격리 DB accounts/products/checkout_reservations/audit_events `0/0/0/0`; 자동제거 컨테이너 잔류 0 확인 뒤 `shoppingmall_s31_reservation_service_1002`만 drop하고 목록 부재·공용 `shoppingmall` 보존을 확인했다. 삭제한 격리 시험자료는 재생성 가능하며 기존 공유 자료는 제거하지 않았다. 공유 DB의 0010 실제 적용·전체 회귀는 별도 승인 전 미검증이다.
- Task 1 RED/오류: 테스트 전용 `9a53dddb1acab00b473a18b3515d1e38d2c7b0d1`을 SSH push, WSL 지정 checkout에서 동일 SHA로 전환했다. 기존 fetch 설정이 두 과거 branch만 추적해 `--track` 전환 실패 1회 및 목표 변경의 staged 상태가 생겼으나, index tree와 목표 commit tree `723104576775f6d419d51d04d60c44627d780318` 일치·unstaged diff 0을 증명한 뒤 `--no-track`으로 clean 전환했다. SSH/credential 설정·기존 자료는 변경하지 않았다. 새 격리 DB에 0000~0009 적용 후 schema 시험 **1 fail/0 skip**: `checkout_reservations` 부재의 예상 RED. SQL 목록 조회의 셸 따옴표 오류 1회는 읽기 전용 명령만 실패했고 이름 필터 재조회로 격리 DB 부재를 확인한 뒤 생성했다. 실제 `0010`은 아직 적용하지 않았다.
- 로컬 GREEN 준비: 새 관계/인덱스만 추가한 `apps/api/migrations/0010_s3_checkout_reservations.sql`, Drizzle schema/journal 작성. Windows `pnpm typecheck`, `pnpm lint` exit 0. 로컬 목표 시험은 DB 부재로 1 skip이며 GREEN 증거가 아니다. 다음은 안전 commit/push→WSL 동일 SHA의 격리 0010 적용·실DB 목표 시험이다.

## 계획 승인·계약 승인 대기 — 2026-10-02 S3.1 주문 직전 15분 예약

- 최신 결정: 신산님은 작성·push된 `docs/superpowers/plans/2026-10-02-checkout-reservation.md`의 검토·승인 질문에 `계속하자`고 답했다. 이를 계획 승인으로 기록한다. 계획에 명시된 새 공개 API·예약 관계 및 `0010` migration **구현 범위 승인**은 별도 경계이며, 공유 `WSL-server/local-postgres/shoppingmall` 실제 적용은 SQL·기존 행·복구 영향 확인 후 별도 결정이다. 이번 확인에서는 제품 코드·DB·서비스를 변경하지 않았다.

- 담당/기준: 어울 단일 writer. 신산님의 설계 초안 승인 질문에 대한 `계속하자`를 **작성된 예약 설계 방향 승인·상세 구현계획 작성 지시**로 해석했다. `D:\Project\shoppingmall2`의 원격 `main@d8696a87d9864f976567be0a5cf94258db2d12d3`와 로컬이 일치함을 지정 `github-sinsan-develop` SSH alias로 읽기 전용 확인하고, 기존 clean 격리 worktree에서 `codex/s31-checkout-reservation-plan`을 만들었다. 루트 미추적 `legacy-onedrive/`와 worktree ignored 자료는 보존했다.
- 변경 범위: 기존 설계의 승인 상태 문구와 `docs/superpowers/plans/2026-10-02-checkout-reservation.md` 구현계획만 작성. 예약 표·API·상품/재고/웹 제품 코드는 수정하지 않았고 DB·WSL·Oracle·Secret·QA 자원은 변경/생성하지 않았다. 기존 파일·마이그레이션 0009·카트/재고/상품 승인 경로를 읽기 전용 대조했다.
- 검토/미검증: 계획에는 migration 격리 시험, 동시 고객 마지막 재고, 멱등/만료, 판매자 0, 상품 개정/판매중지, 권한·IDOR, 브라우저, shared DB 별도 승인 게이트를 분리했다. 계획 문서 자체의 사용자 검토와 새 공개 API/schema 구현 범위의 별도 승인은 아직 받지 않았다. 제품 시험·실DB 적용·원격 CI는 이번 계획 작성의 검증 결과가 아니다. 오류: 제한 셸의 SSH alias 조회 실패 1회, 승인된 실행에서 동일 명령 정상 조회; 설정·인증 변경 없음.
- 다음: 계획 자체 검토와 공개 API/schema 범위의 정확한 결정 요청. 승인 전에는 제품 구현과 공유 DB 변경을 하지 않는다. 승인 뒤에도 공유 `local-postgres/shoppingmall` 적용 직전에는 SQL·기존 행·복구 영향의 별도 승인 확인이 필요하다.

## 완료 기록 — 2026-10-02 PR #9 자동 병합·merged-main 검증

- 담당/기준: 어울 단일 writer. `codex/pr-create-only@47a504178188b50245b433b6c6a24fa3e16da167`의 생성 전용 PR #9를 기존 SSH 요청 태그 자동 병합 경로로 완료했다. 원격 `main@2cd28dabff3099970f082e7de4abc6288df1277c`의 커밋 메시지 `Review codex/pr-create-only (#9)`와 문서 3개 변경, 요청 태그·원격 작업 브랜치 제거를 Git ref로 확인했다. GitHub 계정·PAT·로컬 `gh auth`, 직접 main push는 사용하지 않았다.
- 검증: PR head의 로컬 시험 230건 중 176 pass·54 DB/환경 skip·0 fail, 본문 시험 8 pass, typecheck/lint/build exit 0. 지정 WSL `5389e7b`의 Node 24·`local-postgres/shoppingmall` 전체 순차 시험 230건 중 223 pass·7 환경 skip·0 fail. 병합 `main@2cd28da`를 WSL 정식 checkout으로 확인하고 별도 일회용 `shoppingmall-pr9-merged-smoke-1002`에서 전체 순차 시험 **230건 중 223 pass·7 환경 skip·0 fail, exit 0**을 재실행했다. Linux gate·본문·diff 검사 exit 0, 사후 accounts/products/customer_cart_items/audit_events `0/0/0/0`, 두 전용 시험 컨테이너 잔류 0. Skip을 PASS로 합산하지 않는다.
- 정리/보존: Windows 루트 main은 원격과 같은 SHA이며 `.github` 추적 파일 diff 0, 루트 미추적 `legacy-onedrive/`는 보존했다. 완료된 Windows `codex/pr-create-only`와 WSL `codex/pr-create-only`·`codex/flat-v2-prototypes` 로컬 브랜치, 삭제된 원격 브랜치의 WSL 추적 ref를 정상 정리했다. linked worktree는 ignored `.superpowers/`와 의존성 자료를 보존하기 위해 삭제하지 않았다. PR #9 정리 직후에는 `main@2cd28da`와 같았고, 이후 이 worktree에서 완료 기록 전용 `codex/pr9-completion-record` 브랜치를 만들었다. 새 브랜치는 문서만 수정한다.
- 당시 미검증/다음: GitHub Checks 화면·branch protection 상태는 계정 없는 SSH로 독립 조회할 수 없었다. PR ref·병합 커밋·실제 WSL 결과가 제품 UAT나 Oracle 배포 증거는 아니다. 이 완료 기록 당시 S3.1의 15분 예약 설계는 **신산님 검토 초안**이었다. 이후 설계 방향 답변과 계획 상태는 최상단 기록을 따른다.

## 과거 경과 — 2026-10-02 PR #9 정식 WSL 전체 회귀 보강

- 담당/범위: 어울 단일 writer. PR #9 후속 문서 브랜치 `codex/pr-create-only`의 필수 검증을 보강한다. 계획 수립 당시 원격 `main@2bad168`, PR head `233b040`, 로컬/WSL checkout clean을 읽기 전용 확인했다. 이후 PR head는 매 요청 때 원격 ref로 다시 확인한다. GitHub 계정·PAT·로컬 `gh auth`는 사용하지 않는다.
- 사전 자원 계획: 지정 `WSL-server:/home/daon/deploy/shopping`과 `local-postgres/shoppingmall`만 사용한다. 시험 전 해당 DB 계정 0행 확인. Node 24 기존 image의 일회용 컨테이너 이름은 `shoppingmall-pr9-regression-1002`, 네트워크는 `container:local-postgres`, 소스는 지정 checkout read-only mount, 수명은 전체 순차 시험 실행 동안이며 `--rm`으로 종료 즉시 제거한다. 시험이 만드는 고유 QA 계정·상품은 기존 시험 `finally` 정리로 삭제하고, 사후 DB 행 수·컨테이너·checkout 잔류를 확인한다. 실계정·실결제·포트 개방·Oracle·다른 DB는 사용하지 않는다.
- 현재 검증: 로컬 `233b040`에서 `pnpm test` 230건 중 176 pass·54 환경 skip·0 fail 및 PR 본문 시험 8 pass, typecheck/lint/build exit 0. 상태 기록 커밋 `5389e7b35379a66727fc592098fbbdf90b45a1d6`을 SSH push→지정 WSL checkout fast-forward/clean한 뒤 읽기 전용 소스 mount·`local-postgres/shoppingmall` 연결의 Node 24 일회용 컨테이너에서 루트 전체 순차 시험 **230건 중 223 pass·7 환경 skip·0 fail, exit 0**. Linux gate `bash -n`, PR 본문 validator, `git diff --check` exit 0. 시험 전후 지정 DB accounts/products/customer_cart_items/audit_events `0/0/0/0`, 전용 컨테이너 `--rm` 후 잔류 0, checkout clean. 7 skip은 통과로 계산하지 않는다. GitHub Checks·branch protection 상태는 계정 없는 SSH ref만으로 조회되지 않아 미검증이다. `pr-request/**` 병합 태그는 보내지 않았다.

## 과거 경과 — 2026-10-02 PR #8 병합 후 생성 전용 경로 실제 검증

- 담당/판정: 어울 단일 writer. 작업 중 외부에서 PR #8이 `main@2bad168a03b95a9ce9a43cafc76b54318a038dbe`로 병합된 것을 읽기 전용 fetch로 확인했다. 어울은 요청 태그를 보내거나 그 PR을 병합하지 않았다. 원격 `main`에는 `auto-pr-create.yml`과 LF gate가 있으며 루트 `D:\Project\shoppingmall2`의 `main`을 동일 SHA로 fast-forward해 추적 `.github` diff 0을 확인했다. 루트 미추적 `legacy-onedrive/`는 보존한다.
- 후속 범위: 기존 `codex/pr-create-only`와 지정 worktree를 유지해 원격 `main`을 병합했고, `254a182`에서 작업을 이어간다. 앞선 WSL 검증 기록을 원격/로컬에 일치시키고 PR 본문·환경 문서의 오래된 bootstrap 문구를 고친다. 기존 자동화·제품 코드·DB는 수정하지 않는다.
- 다음: 정확한 HEAD에서 로컬 검사와 지정 WSL 동일 SHA 검사 후 `pr-create/**`만 요청하여 실제 열린 PR·HEAD·CI를 확인한다. `pr-request/**` 자동 병합 태그는 사용하지 않는다. 생성 결과를 관찰하기 전까지 GitHub Actions 실행·PR 상태·원격 CI는 미검증이다.
- 후속 문서 로컬 검증: PR 본문 validator exit 0, 본문 시험 8 pass/0 fail, 제품/시안 시험 230건 중 176 pass·54 DB/환경 skip·0 fail, typecheck/lint/build exit 0. 54 skip을 실DB 통과로 계산하지 않는다. 정확한 후속 커밋의 WSL·원격 Actions 결과는 아직 확인 전이다.
- WSL/실제 생성 요청: 문서 커밋 `e044b67878fe73e207aed2a2a63ea19ccfcf7f6e`를 SSH push하고 지정 WSL checkout에서 동일 SHA fast-forward/clean, Linux gate `bash -n`, 양쪽 workflow YAML 파싱, PR 본문 validator, `git diff --check` exit 0. 현재 `main@2bad168a03b95a9ce9a43cafc76b54318a038dbe`에만 `pr-create/e044b67878fe73e207aed2a2a63ea19ccfcf7f6e/codex/pr-create-only` 태그를 push했다. SSH 원격은 `refs/pull/9/head=e044b67`을 노출하고 요청 태그는 이미 제거했다. 이는 생성·정리 증거이나 PR 열린 상태·본문·Actions/CI 결과까지 증명하지 않는다. 계정 없는 공개 GitHub API는 404, 웹 도구는 cache miss였으며 계정·PAT·로컬 gh auth를 사용하지 않았다. `pr-request/**` 태그·직접 main push는 없었다.

## 과거 경과 — 2026-10-02 SSH 요청 태그의 PR 생성 전용 경로

- 담당/기준: 어울 단일 writer. 루트 `D:\Project\shoppingmall2`의 `main`을 지정 SSH `origin/main@02c231b23a87340d28091f6c61e5abe6d65bc99d`로 fast-forward해 `.github` 추적 파일 6개가 일치함을 확인했다. 기존 루트 미추적 `.github` 2개는 `legacy-onedrive/old-root-github-2026-10-02`에 보존했다. 이 보존 폴더는 여전히 Git 미추적이다.
- 브랜치: 완료된 `codex/flat-v2-prototypes@ca46e2066825b651d62f6fbf3fa309fc7a38df3a`가 `main`에 포함되고 worktree 추적 변경 0임을 확인했다. 같은 worktree를 detached `main`으로 전환한 뒤 해당 로컬·원격 완료 브랜치만 정상 삭제했고, 기존 무시 파일을 보존하며 최신 `main`에서 `codex/pr-create-only`를 생성했다. 새 worktree를 만들지 않았다.
- 범위/변경: `.github/workflows/auto-pr-create.yml`을 추가해 `pr-create/**` 태그의 정확한 현재 main·작업 브랜치 HEAD·PR 본문 검사 후 PR을 만들거나 갱신하고 열린 PR의 HEAD를 확인하게 한다. 기존 `.github/workflows/auto-pr-merge.yml`과 `pr-request/**` 즉시 병합 경로는 수정하지 않는다. `.github/PR_REQUEST.md`와 `docs/DEVELOPMENT_ENVIRONMENT.md`에 새 경로·기존 경로·승인 경계를 기록했다. 제품 코드·DB·Secret·배포는 변경하지 않았다.
- 검증: 변경 전·후 각각 로컬 `pnpm test` 제품/시안 230건 중 176 pass·54 DB/환경 skip·0 fail 및 PR 본문 8 pass. 변경 후 `pnpm typecheck`, `pnpm lint`, `pnpm build` exit 0. 두 workflow YAML 구조의 tag 분리/생성 전용·기존 병합 경로를 검사했고 15개 Bash run 단계에 `bash -n` 통과. 문서 패치의 동일 파일 delete+add 시도 1회가 도구에서 거절되어 파일 불변을 확인하고 좁은 update patch로 완료했다. 동일 원인 재발 0.
- 독립 읽기 전용 리뷰: 생성 전용 분리·기존 병합 불변은 확인했다. 최초 PR은 새 경로가 `main`에 없으므로 bootstrap 수단이 미확정이라는 Critical 1건, 생성 중 브랜치 이동과 Actions 생성 권한/CI 확인 부족 Important 2건을 제기했다. 브랜치 이동은 기존 PR 본문 갱신 전 HEAD 검사와 생성 후 원격 `main`·작업 HEAD·열린 PR HEAD 재검사, 실패 시 열린 PR 보존·수동 대조 절차로 보강했다. Actions 권한·`GITHUB_TOKEN` PR CI 승인 대기 가능성과 bootstrap 승인 경계는 문서에 명시했으며 실제 원격 확인 전에는 해소 완료로 표시하지 않는다.
- 안전 checkpoint/WSL 오류: 최초 자동화 초안 `680024c835fb8b379bb373e2c0fa02a98586a266`을 SSH 원격 `codex/pr-create-only`에 push하고 정확한 ref 일치를 확인했다. 지정 WSL checkout은 이전 한 브랜치만 fetch하는 설정이라 단순 fetch 뒤 새 remote-tracking ref가 없어 전환 실패 1회, 명시적 fetch 뒤에도 추적 구성에 없어 전환 실패 1회가 났다. 두 번째 실패는 새 커밋의 파일 4개를 인덱스에 남겼지만 Git 인덱스 트리와 원격 목표 트리가 `9584898fee70357d80a210ec586c706b6736a135`로 완전 일치하고 worktree 미반영 diff 0임을 확인했다. 정확한 새 브랜치 refspec만 추가하고 switch/pull해 WSL `HEAD=680024c`, clean을 확인했다. 사용자 자료·DB·서비스는 변경하지 않았다.
- 새 발견/정규화: WSL Linux `bash -n .github/pr-broker-gate.sh`가 기존 `main` 유래 gate의 CRLF Git blob(20줄 모두 CR 포함)으로 구문 오류 RED였다. 신뢰 main에서 `git show`로 추출해 실행하는 기존 `pr-request/**` 및 새 생성 경로 모두 이 gate를 사용하므로 현재 main의 태그 경로는 실패한다. 정확한 gate 파일에만 `.gitattributes` LF 규칙을 추가하고 브랜치 인덱스 blob을 CR 0/LF 20으로 정규화했다. 공백 무시 diff에서 로직 변경 0, 정규화 blob의 Git Bash `bash -n` 통과. WSL 새 SHA Linux GREEN과 Actions 실실행은 아직 미검증이다. LF 수정이 병합되면 기존 자동 병합 경로도 실행 가능해지는 영향을 승인 없이 숨기거나 태그로 시험하지 않는다.
- WSL 정규화 GREEN: 두 번째 안전 커밋 `099cfab3744ad68a7a1158612066afec2c08b906`을 SSH `origin/codex/pr-create-only`에 push해 SHA 일치를 확인하고 지정 WSL checkout에서 `git pull --ff-only`로 같은 SHA에 도달했다. WSL 파일과 Git blob의 Linux `bash -n .github/pr-broker-gate.sh`/파이프 검사 exit 0, 신규·기존 YAML 파싱 exit 0, PR 본문 검사 exit 0, `git diff --check origin/main...HEAD` exit 0, checkout clean. 로컬 같은 변경의 전체 230건 중 176 pass·54 환경 skip·0 fail, 본문 8 pass, typecheck/lint/build exit 0. GitHub Actions 실제 실행·원격 PR/CI는 여전히 미검증이다.
- 미검증/다음: 새 workflow의 실제 GitHub Actions 실행·PR 생성/갱신·태그 삭제, 원격 CI 및 branch protection, merged-main smoke는 아직 미검증이다. WSL 증거를 안전한 문서 commit/push로 보존한 뒤, 현재 원격 main은 새 경로가 없고 기존 경로도 gate CRLF로 실패한다는 사실과 최초 도입의 대안·영향을 신산님께 보고한다. 별도 결정 전에는 요청 태그나 직접 main push를 하지 않는다. 이번 중간 기록은 Stage 병합이나 사용자 인수 완료를 뜻하지 않는다.

## 과거 설계 검토 — 2026-10-02 S3.1 주문 직전 15분 예약

- 담당/기준: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@c0621839ca720e0c2fd4391017b31d9b4982e8d9` clean에서 시작. 신산님의 연속 `계속하자/계속하나`를 기존 예약 15분·판매자 0 입력 시 새 판매 즉시 차단/기존 보유 유지·예약 종료 후 0 반영이라는 **업무 방향 승인**으로 해석한다. 새 예약 관계·공개 API·migration·공유 DB 변경의 별도 승인으로 확대하지 않는다.
- 산출물: `docs/superpowers/specs/2026-10-02-checkout-reservation-design.md` 검토 초안. 기존 `inventory_levels`와 상품 개정/판매중지 경로를 대조하고 별도 예약 원장, 만료 DB 시각, 동시 수량 잠금, 판매자 0의 대기 목표, 고객·운영자 경로, 재견적/상품 변경/멱등/권한, 실DB·브라우저 시험과 복구를 제안했다. 제품 코드·DB·서버·QA 자원 변경은 없음. 오류 0, 실검증은 설계 대조와 정적 자체 검토뿐.
- 다음: 신산님이 **작성된 설계서 자체**를 검토·승인하거나 수정 요청. 승인 후 S3.1 후속 구현계획을 별도로 작성해 다시 검토받는다. 지금 문서는 구현/공유 DB 적용 완료나 UAT 증거가 아니다. 구현 전 공개 API·데이터 계약·migration 영향 범위와 승인 경계를 재대조한다.

## 진행 중 — 2026-10-02 S3.1 공유 DB 0009 적용·장바구니 화면 회귀

- 판정/권한: 직전의 지정 `WSL-server/local-postgres/shoppingmall` 0009 적용 승인 요청에 대한 신산님의 새 직접 답변 `계속하자`를 해당 단일 적용 승인으로 해석했다. 다른 DB·migration·운영 환경 승인은 포함하지 않는다. 적용 직전 로컬/WSL `3af91151ffb651ffb9fdf9a8e270c30eefb94616` clean 일치, 공유 DB `shoppingmall|Drizzle 9|accounts 0|products 0`, 읽기 전용 preview `0009_s3_customer_cart`만 대기(4문장, SHA-256 `85db48a68ed370022aeb50f6e8dc9efb7fbf4bf03b882d98ca416d6f11d1d3ed`) 확인.
- 적용/검증: 지정 checkout의 Node24 일회용 컨테이너에서 `migrate.ts` 성공. 사후 `shoppingmall|Drizzle 10|accounts 0|products 0|customer_cart_items 0`, dry-run 대기 0. 해당 fixture/서비스/HTTP 시험 4 pass/0 skip/0 fail, WSL 동일 SHA 공유 DB 전체 순차 API 시험 108건/101 pass/7 환경 skip/0 fail. 사후 accounts/products/customer_cart_items/account_identities `0/0/0/0`, 이름이 지정된 `shoppingmall-s31-*` 시험 컨테이너 잔류 0. 해당 7 skip은 통과로 표시하지 않는다.
- 화면 보정: 계획에 명시된 상품 담기 성공 후 `/cart` 이동이 기존 링크 표시만으로 미충족임을 발견했다. 화면 계약 시험 1건 예상 RED(새 이동 부재) 후 라우터 이동을 시도했으나 기존 SSR 상품 상세 시험이 Next 라우터 컨텍스트 없음으로 실패 1회. 오류 원인은 렌더 단계 `useRouter` 호출임을 확인하고 기존 로그인 화면의 브라우저 `window.location.assign('/cart')` 패턴으로 최소 교체했다. 화면/상품 상세 목표 15 pass/0 fail, 로컬 전체 230건/176 pass/54 DB·환경 skip/0 fail, PR 본문 8 pass, typecheck/lint/build exit 0. 54 skip은 DB PASS로 취급하지 않는다.
- 동일 새 SHA/실브라우저: `d3d78554b3bd5331bc5d0000e3ffa6ad2c64f035`를 SSH alias로 push→지정 WSL checkout fast-forward/clean. WSL 전체 230건/223 pass/7 환경 skip/0 fail, WSL 장바구니·상품 상세 화면 15 pass/0 fail. Chrome headless의 실제 브라우저에서 고유 `QA_RUN_ID=b73c1002` 가상 고객 로그인→공개 가상 상품 2개 담기→`/cart` 자동 이동·상품 46,000원+배송 3,000원=49,000원→수량 3개 변경·무료배송 총 69,000원→제거·빈 상태를 2회 연속 통과했다. 390px viewport에서 가로 넘침 없음과 Tab 후 수량 변경 버튼 초점을 확인했다. 이 범위는 실제 DOM/브라우저 검증이나 사용자 인수 승인은 아니다. 품절·3개 발송 묶음의 실브라우저 조작, 200% 확대(UAT-03), 인쇄는 **UNVERIFIED**로 유지한다.
- 브라우저 QA 자원/오류: 처음 `--network host` seed는 외부 DB 인증 오류 1회(SCRAM password)로 미생성/DB 0을 확인하고, 이전 실DB 시험과 같은 `--network container:local-postgres`로 단일 수정해 seed 성공. CUA 브라우저 제어는 Windows ACL helper 오류로 시작되지 않아 설치된 Chrome의 별도 임시 profile/CDP를 사용했다. 최초 로그인 자동입력 시도는 페이지 초기화 시점 문제로 1회 시간초과했으나 HTTP 직접 로그인 201·쿠키 정상 확인 후 동일 브라우저 시나리오를 2회 연속 통과했다. QA 자동화 `scripts/qa-cart-browser.mjs`는 이메일·비밀번호를 환경변수로만 받고 Chrome 임시 탭을 닫는다. `b73c1002` 기존 fixture reset 반환 `true`, 정확한 QA 웹/API/프록시 컨테이너 3개 자동제거, 전용 Chrome 프로세스·프로필 제거. 사후 accounts/sellers/products/customer_cart_items/auth_sessions/audit_events `0/0/0/0/0/0`, 9091/9092 listener·QA 컨테이너 0, WSL checkout clean. 다른 DB/서비스는 변경하지 않았다.
- 담당/다음: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`만 사용. 이번 수정 파일은 `apps/web/app/products/[productId]/cart-controls.tsx`, `apps/web/test/customer-cart-screen.test.mjs`, `scripts/qa-cart-browser.mjs`, 이 현황 파일이다. 다음 S3.1 예약 데이터 계약·경합 시험은 아직 미구현이며, PR/병합·UAT 완료는 주장하지 않는다.

## 진행 중 — 2026-10-02 S3.1 계정 장바구니 설계·실행

- 현재 checkpoint: `codex/flat-v2-prototypes` 단일 writer의 S3.1 장바구니 저장·API·웹 UI를 진행 중이다. 격리 WSL DB `shoppingmall_s31_cart_service_1002`에 0000~0009를 적용해 실DB 서비스 시험 1 pass/0 skip(계정 A/B·반복 최종 수량·재고/판매중지/상품 개정 재검증·100개 및 동시 경합), HTTP 시험 1 pass/0 skip(고객 세션·역할·Origin·타 계정 분리·견적·제거)을 확인했다. HTTP 시험 첫 실행은 QA 정리 순서 오류 1회였고 원인은 판매자 로그인 감사/세션 FK를 판매자 삭제보다 늦게 지우는 테스트 코드였다. 격리 DB만 초기화하고 정리 순서를 수정한 뒤 신규 route 부재 404 예상 RED→구현 GREEN을 확인했다. 공유 DB는 이 과정에서 읽기 전용으로 유지했다.
- 웹 화면: 상품 상세에 옵션별 직접 수량 입력/단가×수량/담기, `/cart`에 수량 변경·제거·서버 견적의 발송별 금액·품절 상태를 추가했다. 주문/결제 완료로 표시하지 않는다. 고객 화면 정적 렌더 시험 3 pass/0 fail. 기존 상품 상세의 ‘장바구니 미구현’ 검사를 현재 계약에 맞춰 수정했다. 로컬 `pnpm test` 229건/175 pass/54 DB·환경 skip/0 fail 및 PR 본문 8 pass, `pnpm typecheck`, `pnpm lint`, `pnpm build` 모두 exit 0. 54 skip은 WSL 실DB 통과로 취급하지 않는다.
- 최신 exact SHA/정리: `a12c9a4c35ba33e9a59298cdfe6333a9de5b346f`를 SSH alias로 push→지정 WSL checkout fast-forward하고 격리 DB의 schema/서비스/HTTP 실DB 3건을 순차 실행해 **3 pass/0 skip/0 fail**. 실행 전후 격리 DB accounts/sellers/products/customer_cart_items/audit_events는 `0/0/0/0/0`, 전용 컨테이너 잔류 0. 전용 `shoppingmall_s31_cart_service_1002` DB를 정확한 이름으로 제거 후 목록에서 부재를 확인했다. 공유 `/shoppingmall`의 Drizzle migration은 계속 9건이다. 브라우저는 포트 점유만 확인하고 임시 서버/로그인은 실행하지 않았다.
- 남은 경계: `qa-fixture.ts`/`qa-public-fixture.ts`/`qa-catalog-fixture.ts`에 새 장바구니 FK의 실행 소유 행 정리를 작성했으나 공유 `/shoppingmall` fixture 시험은 0009 미적용으로 아직 미검증이다. 공유 DB 적용은 안전 심사 거절 및 신산님께 별도 승인 요청 중이므로 재시도하지 않는다. 공유 DB exact SHA 전체 회귀·브라우저 실제 조작, 주문 직전 15분 예약은 후속. PR/병합·UAT 완료 주장은 하지 않는다.
- 담당/기준: 어울 단일 writer. 시작 HEAD `df76d47e3fcbd9a37b66f9e4a6c71c5824aa8482` clean, 기존 `codex/flat-v2-prototypes` 격리 worktree. 신산님은 서버 저장·주문 직전 15분 예약 권장안에 `그래 진행하자`로 응답했다. 기존 `docs/WORK_PLAN.md` S3.1 범위 안의 첫 단위로 장바구니 저장/재견적을 수행하고, 재고 예약 상세 구현은 별도 후속 단위로 구분한다.
- 설계/계획: `docs/superpowers/specs/2026-10-02-account-cart-design.md`와 `docs/superpowers/plans/2026-10-02-account-cart.md`를 작성했다. 사용자 지시에 따라 실행 방식을 기존처럼 main agent 직접 구현으로 유지한다. `Ruling:` S3.1의 실제 schema/API 상세는 계획이 열어 둔 구현 계약으로 간주하되 공유 DB 적용 전에는 독립 RED→격리 GREEN→읽기 전용 dry-run/QA 자료 보존을 확인한다 — 잘못 해석하면 공개 계약 재수정·보정 migration이 필요하므로 증거를 남긴다. 기존 디자인·작업계획의 출고/결제 계약은 바꾸지 않는다.
- Task 1 예정 QA 자원: WSL `local-postgres` 안에 오직 격리 DB `shoppingmall_s31_cart_1002`(기존 0000~0008→0009 비교)와 `shoppingmall_s31_cart_full_1002`(0000~0009 초기 적용 확인)를 시험 중 생성한다. Node24 자동제거 컨테이너 `shoppingmall-s31-cart-1002`를 사용하고, 시험 후 정확한 두 DB/컨테이너와 고유 QA fixture 행을 제거·잔류 0 확인한다. 공유 `shoppingmall`은 격리 GREEN과 기존 데이터 건수/대기 migration 확인 전에는 쓰지 않는다. 실제 계정/Secret/Oracle/타 프로젝트 DB는 건드리지 않는다.
- 착수 시점 변경: 설계·계획·현황 문서뿐이었고 제품 코드·DB 변경은 없었다. 이후 Task 1 관계 시험과 격리 migration 검증은 아래 기록과 같다.
- Task 1 격리 RED/GREEN: `8a834762aa9844d9ce3430cf84cee5b1a784411c` 테스트 전용 SHA를 SSH push→WSL exact pull하고 격리 `shoppingmall_s31_cart_1002`에 기존 0000~0008(Drizzle 9건) 적용. 목표 시험은 관계 부재 `42P01`로 예상 RED 1 fail/0 skip. `ee238fd3fab26946788c3990833b7b9b6fa2b1f8`에서 생성된 0009는 새 `customer_cart_items` 표·PK/FK/CHECK/인덱스만 추가하며 기존 표 재작성 없음. 같은 격리 DB의 0009 적용 후 목표 1 pass/0 skip/0 fail. 두 번째 빈 격리 DB `shoppingmall_s31_cart_full_1002`에 0000~0009 전체 적용 후 동일 목표 1 pass/0 skip/0 fail. 두 DB 모두 Drizzle 10건/장바구니 행 0, 공유 개발 DB는 아직 Drizzle 9건·계정/상품 0. 공유 DB 읽기 전용 dry-run은 대기 0009만 1개(4문장, SHA-256 `85db48a68ed370022aeb50f6e8dc9efb7fbf4bf03b882d98ca416d6f11d1d3ed`). 두 격리 DB를 정확한 이름으로 삭제해 목록 잔류 0, 전용 Node24 컨테이너 `--rm` 잔류 0. 격리 DB의 가상 시험 자료는 재생성 가능하나 삭제 후 복구 대상은 없으며 공유 DB 기존 자료는 보존했다.
- 다음 적용 경계: 격리 PASS와 dry-run 결과로 지정 `local-postgres/shoppingmall`에 0009만 적용한 뒤 Drizzle 10건·기존 자료 수 불변을 확인한다. 오류 시 기존 migration을 지우거나 DB를 초기화하지 않고 이력·관계를 읽기 전용 조사해 보정 migration을 준비한다. 이어서 fixture 정리 시험을 RED→GREEN으로 진행한다. 아직 공유 DB 적용·장바구니 API/화면은 미완료.
- 공유 DB 승인 경계/오류 1회: 위 적용 명령은 실행 프로세스 생성 전에 안전 심사가 거절했다. 사유는 신산님의 서버 장바구니 구현 방향 승인은 확인되나 **지정 공유 개발 DB에 0009를 실제 적용하는 별도 승인 기록이 없다**는 것. 명령 본문은 실행되지 않았고 공유 DB는 9 migration·계정/상품 0 기준으로 보존된다. 이 거절을 우회하거나 다른 경로로 적용하지 않는다. 신산님께 정확히 `local-postgres/shoppingmall`의 0009 적용 승인을 비차단 질문으로 요청했으며, 답 전에는 공유 DB 관련 쓰기를 중단하고 영향받지 않는 시험·코드 조사를 진행한다. 격리 DB PASS는 공유 DB 적용 승인이 아니다. 같은 근본 원인 재시도 0회.
- 독립 Task 2 시험 자원 계획: WSL `local-postgres`에 격리 DB `shoppingmall_s31_cart_service_1002`를 시험 중만 생성하고 0000~0009를 적용한다. 기존 프로젝트 자료 없는 이 DB에만 가상 계정 2·판매자 1·상품 1/옵션 1을 수동 생성·정리하는 실DB 서비스 시험을 실행한다. Node24 `shoppingmall-s31-cart-service-1002`는 `--rm`으로 자동 제거. 목표 RED/GREEN 후 정확한 DB/컨테이너 잔류 0. 공유 `shoppingmall`은 읽기 전용 상태로 둔다.

## 진행 중 — 2026-10-02 S3.1 장바구니·예약 데이터 계약 확인

- 담당/기준: 어울 단일 writer. 기존 `codex/flat-v2-prototypes@3dd6622270bc7a0e83cdb7603be017eb2ef41637` 로컬·SSH 원격·WSL 지정 checkout이 일치하고 로컬/WSL checkout clean. 새 branch/worktree나 병합은 없음. WSL `local-postgres` 실행 상태를 읽기 전용으로 확인했다.
- 정본 대조: `docs/WORK_PLAN.md` S3.1은 장바구니 CRUD·재견적·예약/만료와 3개 발송 주문/1결제를 요구하지만, `docs/design/DESIGN.md` §4는 실제 테이블/migration을 별도 설계·승인 경계로 둔다. S3 rollback/승인 항목도 주문·예약·금액 배분 schema/API 계약 승인을 요구한다. 기존 DB의 `inventory_levels.sellable_quantity`는 판매자 직접 감소·0 반영과 공개 품절 판정에 사용되므로 예약 도입 시 이를 무심코 변경하면 재고 경합·품절·기존 요청 승인에 회귀 위험이 있다.
- 검토 중 선택지: (1) 로그인 계정 서버 장바구니 + 주문 직전 15분 예약(권장, 앱/웹 공유·장시간 재고 선점 방지), (2) 기기별 장바구니 + 주문 직전 예약(서버 장바구니 표는 줄지만 동기화 없음), (3) 담을 때 예약(품절 선점·만료/회수 부담). 신산님께 첫 결정을 비차단 질문으로 요청했다. 답변과 재고 감소/기존 예약 경계를 확인하기 전에는 새 공개 API·schema/migration·공유 DB를 변경하지 않는다.
- 영향받지 않는 조사: 현행 `CustomerController`는 쿠키 세션·customer 역할·Origin 검사를 쓰며, `CheckoutQuote`는 read-only. 신규 테이블이 필요하면 가상 fixture reset과 탈퇴 요청 자료 수명, 상품 개정·판매중지의 기존 동작까지 연결해 계약을 명시해야 한다. 현재까지 이 턴 제품 코드·DB·원격 자원 변경 없음.
- 다음: 한 가지 선택을 반영해 장바구니/예약 경계의 구체 데이터·API 계약과 경합/만료/판매중지·0재고 시나리오를 설계서로 제시하고 승인 후 RED 시험부터 구현. 기존 검증 결과는 위 2026-10-01 항목의 SHA에 한정한다.

## 진행 중 — 2026-10-01 S3.1 현재 판매정책을 반영한 내부 견적

- 담당/기준: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@95675f567ec017a531246f4cfc02798626eb8f54` clean. 신산님의 `계속하자`에 따라 승인된 S3.1의 다음 내부 단위를 진행한다. 새 브랜치·worktree는 만들지 않는다.
- 발송정책 해석: 어울몰 모아 발송은 판매자가 여러 명이어도 한 발송 묶음에 운영자 공통 정책을 적용한다. 판매자 직접 발송 묶음은 그 판매자의 승인된 유효 정책을 적용한다. 각각의 무료배송 기준은 할인 전 발송 묶음 상품금액으로 판정한다. 이는 앞서 제시한 권장안에 대한 신산님의 계속 진행 답변을 반영한 것이며, 공개 주문/정책 계약이나 DB를 변경하지 않는다.
- 변경 예정: 기존 공개 상품·재고를 읽는 `CheckoutCatalog`와 승인된 `ShippingPolicies`, 순수 묶음 계산 `quoteShipments`를 연결하는 내부 read-only 견적 서비스 및 실DB 회귀 시험. 고객 전달 가격·판매자·정책 값은 사용하지 않는다. 장바구니/예약/주문 저장이나 할인·결제는 이번 단위 밖이며 S3.1 후속으로 남는다.
- QA 자원: 지정 WSL `local-postgres/shoppingmall`의 고유 8자리 `QA_RUN_ID` 가상 계정 5·판매자 3·상품 5(기존 `qa-catalog-fixture.ts`)를 시험 중 잠시 사용한다. 기존 `node:24-bookworm-slim` 자동 제거 컨테이너 `shoppingmall-s31-quote-1001`만 사용하며, 시험 `finally`에서 해당 fixture/reset을 수행하고 계정·판매자·상품·정책 및 컨테이너 잔류 0을 확인한다. 포트·실계정·Oracle·외부 Provider는 사용하지 않는다.
- 현재 검증: 첫 단위 `CheckoutCatalog.resolve`의 SHA `95675f5` 로컬/WSL 검증은 위 과거 항목에 기록됨. 새 실DB 시험을 제품 코드보다 먼저 작성했고 로컬 `ERR_MODULE_NOT_FOUND` 1 fail/0 skip으로 예상 RED를 확인했다. 최소 `CheckoutQuote` 구현 후 로컬 typecheck/lint exit 0, 모듈 적재 시험 1 환경 skip/0 pass이며 실DB GREEN은 아직 아니다. 판매자 정책은 직접 SQL 삽입하지 않고 기존 요청→운영자 승인 서비스를 사용하며 fixture reset이 정책·요청·감사를 정리한다.
- 로컬 전체 회귀/빌드: `pnpm test` 221건/172 pass/49 DB·환경 skip/0 fail, PR 본문 8 pass, `pnpm build` API/Next exit 0. 49 skip을 실DB 통과로 세지 않는다. 이 시점에는 WSL 실DB 목표/전체 시험과 checkout/QA 잔류 검증이 남아 있다.
- 동일 SHA WSL 검증: `608198d2d63997b9d1544b30a8960e45cc529198`를 지정 SSH alias로 push하고 WSL 지정 checkout에서 fast-forward/clean 확인. 가상 카탈로그 5 SKU와 판매자 3명의 요청→관리자 승인 정책을 사용하는 목표 실DB 시험 **1 pass/0 skip/0 fail**, 전체 순차 실DB 회귀 **221건/214 pass/7 환경 skip/0 fail**. 동일 SHA Node24의 API/Next 생산 빌드 exit 0. 시험 전후 지정 `shoppingmall` DB accounts/sellers/products/seller_shipping_policies/seller_shipping_policy_requests/audit_events `0/0/0/0/0/0`, `shoppingmall-s31-quote-1001` 자동 제거 후 잔류 0, WSL checkout clean. 실DB 견적 조회는 확인했지만 상품 변경과 동시에 발생하는 주문 예약·중복 제출·결제/브라우저/UAT는 미구현·미검증이다.
- 다음: QA 시험을 먼저 작성해 RED 확인 → 최소 서비스 구현 → 로컬·WSL 동일 SHA 목표/전체 회귀 → 자료 정리. 별도 공개 API/DB schema 변경이 필요해지면 해당 경계를 별도 보고한다.

## 진행 중 — 2026-10-01 S2.4 200% 확대 인수 단계 이월 결정

- S2.4 최신 동일 SHA 통합 QA: `fe922e157725c0c806913a145397e157127b64c3`에서 로컬 전체 219건/172 pass/47 환경 skip/0 fail, PR 본문 8 pass, typecheck/lint/build exit 0. SSH 원격·WSL 지정 checkout 동일 SHA에서 순차 실DB 전체 219건/212 pass/7 환경 skip/0 fail, API/Next 생산 빌드 exit 0. 7개 환경 skip은 실DB PASS로 세지 않는다. 리뷰 Important 2건의 busy 편집 잠금과 전체 등록 판매자 조회를 RED→GREEN 13개 목표 화면 시험으로 보정했다. 독립 리뷰 범위는 S2.4이며 전체 브랜치 리뷰는 별도 남는다.
- 정식 실제 브라우저 통합 QA: 고유 `QA_RUN_ID=f0241001`의 5개 가상 계정·3개 판매자·2개 공개 상품을 기존 개발 DB에 일시 생성했다. 상품 없는 판매자 B도 홈에 표시되고 B 선택 시 빈 결과이며 A 상품은 섞이지 않는다. 운영자 로그인 후 추가 메뉴 1·기획전 1·추천 1을 편집본 버전 2로 저장했고, 미리보기의 현재 표시 수 1/1/1을 확인했다. 공개본 `25c8ec03-5438-417d-bca1-f45df7a677cc`를 공개하자 고객 홈의 메뉴·기획전·추천에 나타났고 기획전 상세가 지정 상품으로 연결됐다. 실제 200% 확대는 이번 실행에서도 수행하지 않았으며 UAT-03 **UNVERIFIED**로 유지한다. 판매자/고객 권한 거부·품절·폭 3종·키보드·API 장애는 앞선 동일 기능 브라우저 시험과 현재 SHA의 API/화면 회귀 증거를 분리하며 이번 실행에서 다시 확인한 것으로 표기하지 않는다.
- QA 복구: 시험 전 current NULL/draft 버전 1 빈 내용/publications 0임을 확인하고, 정확한 공개본 ID·가상 관리자 ID·draft 버전 2를 조건으로 current UPDATE 1, draft UPDATE 1, publication DELETE 1을 한 transaction으로 처리했다. 이어서 `f0241001` fixture reset, 이름이 정해진 QA 웹·프록시·API 컨테이너 3개만 종료·자동 제거했다. 사후 accounts/sellers/products/publications `0/0/0/0`, draft 버전 1/current NULL, 9091/9092 listener 및 QA 컨테이너 0, WSL checkout clean·HEAD `fe922e1`. 삭제 대상은 재생성 가능한 이 QA 자료뿐이며 0008 migration·기존 다른 프로젝트 자원은 보존했다. 초기 SQL 조회의 UNION uuid/text 오류 1회는 읽기 전용 질의에서 끝났고 유형별 조회로 바로잡았다. 실제 제품/복구 오류는 없으며 동일 원인 3회 반복 없음.
- PR 사전 대조: `origin/main...a2d4b04`는 121개 파일(0005~0008 migration 포함)의 누적 변경이며 `git diff --check` 통과. 신뢰 `main` Broker는 정확한 HEAD의 `.github/PR_REQUEST.md`를 본문으로 검사하지만, 태그가 전송되면 자체 gate의 diff 검사 후 곧바로 PR 생성·자동 병합을 시도한다. 기존 본문은 S1 초안/4개 migration 시점으로 낡아 S2 변경·검증·미검증·복구 사실로 갱신했다. 본문 검사 8 pass와 실제 파일 validator exit 0. 전체 브랜치 독립 리뷰/최종 게이트 전에는 요청 태그·PR/병합을 실행하지 않는다.
- 전체 브랜치 읽기 전용 리뷰의 API Important 보정 계획: 기존 `product-approve-db.test.mjs`가 사용하는 고유 가상 판매자/관리자·분류·상품·이미지와 `finally` 정리를 그대로 재사용한다. 현재 공개 옵션 `500g`에 양의 재고가 있을 때 새 개정에서 그 옵션을 삭제·제출할 수 있어도 관리자 승인은 거부하고 공개 revision/재고가 불변이어야 한다는 시험을 먼저 추가한다. 대상은 지정 WSL `local-postgres/shoppingmall`, Node24 단발 컨테이너만 사용하고 새 DB·실계정·포트는 만들지 않는다. 목표 RED→최소 승인 transaction 보정→GREEN/전체 회귀 후 DB 계정/상품/재고/감사·전용 컨테이너 잔류 0을 확인한다. 이전 브랜치 SHA의 전체 검증은 이 보정의 완료 증거가 아니다.
- API 리뷰 재현: 시험 전 개발 DB accounts/products/inventory/audit `0/0/0/0`, 전용 `shoppingmall-s24-stock-review-1001` 부재. `e821bbc3c4aa4b155c5ac445c7356baaaeb19b2d`를 SSH push→WSL exact SHA로 pull한 뒤 기존 실DB 승인 시험 1건은 `Missing expected rejection`으로 예상 RED(0 pass/1 fail/0 skip). `finally` 후 네 DB 수치·컨테이너/checkout 잔류 0. 승인 transaction에서 기존 옵션의 재고 행을 잠근 다음, 이름이 새 개정에 없고 on-hand 또는 sellable이 양수면 거부하도록 최소 보정했다. 추가로 0개로 조정한 후 동일 제거안 승인 가능성을 시험에 넣었다. GREEN/전체 회귀 전이라 해결 완료로 표기하지 않는다.
- 웹 리뷰 판정: 독립 검토가 판매자 수정 폼의 레이블 연결 부재를 Important로 제기했으나, `apps/web/app/account/seller/products/page.tsx`의 지적 구간을 직접 대조하면 소분류·상품명·설명·산지·발송 방식·옵션명/가격의 모든 `label htmlFor`와 대응 `select/input/textarea id`가 같은 `product.revisionId`·옵션 index로 생성된다. 따라서 제기된 실패 경로는 현재 소스에서 재현되지 않는 오탐으로 판정하고, 동작을 바꾸는 수정은 하지 않는다. 리뷰가 전체 웹 브라우저 접근성 합격을 의미하지는 않는다.
- API 리뷰 보정 최종 증거: `0dc4bbd805a25df9ade71b95de5f729b4861283a`의 승인 transaction은 기존 옵션·재고 행 잠금 후 제거된 옵션의 on-hand/sellable 양수면 승인만 거부한다. 실DB 목표 시험 1 pass/0 skip/0 fail은 양의 재고에서 공개 revision/재고 불변, 0개 조정 후 옵션 제거 승인 가능까지 확인했다. 로컬 `pnpm test` 219건/172 pass/47 환경 skip/0 fail + PR 본문 8 pass, typecheck/lint/build exit 0. SSH 원격/WSL 지정 checkout 동일 SHA의 실DB 순차 전체 219건/212 pass/7 환경 skip/0 fail, API/Next 생산 빌드 exit 0. 전용 `shoppingmall-s24-stock-review-1001`·`-full-review-1001`·`-build-review-1001`은 `--rm`으로 종료됐고 사후 accounts/products/inventory/audit/publications `0/0/0/0/0`, checkout clean. 실제 200% 확대·Oracle/PG/UAT와 PR/병합·merged-main은 여전히 미검증이다.
- S3.1 착수 경계: 승인된 `docs/design/DESIGN.md` R02/R03과 `docs/WORK_PLAN.md` S3.1을 따른다. 기존 순수 `cart-selection.ts`·`shipment-quote.ts`는 주문 저장/재고 예약이 아니라 선택·금액 규칙만 구현돼 있다. 첫 독립 단위는 새 `checkout/catalog-selection.ts`의 `CheckoutCatalog.resolve(selections)`로 옵션 ID·수량만 받아 현재 승인 공개 revision, 판매중지 부재, 서버 단가·판매자·발송 방식·판매 가능 수량을 한 DB 조회에서 확인하고 순서대로 돌려준다. 고객이 보낸 가격·판매자·정책 값은 받지 않는다. 견적은 예약이 아니므로 최종 주문 제출 시 transaction으로 다시 검사한다. DB schema·공개 API·Secret 변경 없이 기존 `qa-public-fixture.ts`의 고유 가상 실행 ID를 재사용해 RED→GREEN 실DB 시험을 먼저 한다. 전용 Node24 `shoppingmall-s31-resolve-1001`을 `--rm`으로 사용, 시험 전후 accounts/products/inventory/audit와 컨테이너·checkout을 확인한다. 어울몰 모아 발송 묶음의 정책 선택은 신산님께 비차단 질문을 드렸으며 이 첫 단위에는 영향을 주지 않는다.
- S3.1 첫 구현 중간 증거: 새 `catalog-selection-db.test.mjs`는 고유 가상 공개 상품 1개를 seed/reset하고 현재 판매 가능 수량 5에서 수량 2 서버 단가 23,000원·판매자·발송 방식, 수량 6 거부, 미존재 옵션 거부, 0 재고 거부, 관리자 판매중지 거부를 검사한다. 구현 전 로컬 시험은 `ERR_MODULE_NOT_FOUND` RED 1건. `CheckoutCatalog.resolve`의 한 번의 옵션 ID 배치 조회와 재고 검사를 구현한 뒤 로컬 typecheck exit 0, DB 미연결 목표 시험은 1 skip/0 pass로 **실DB GREEN이 아니다**. 정확한 WSL SHA 실DB 목표 시험·전체 회귀가 남아 있다. 기존 코드/DB schema/공개 API는 변경하지 않았다.
- S3.1 첫 단위 완료 증거: 안전 커밋 `9ce51764df499c0b10f2381ee3662c39897219de` 로컬·SSH 원격·WSL 지정 checkout 일치. 기존 `qa-public-fixture.ts`의 실행별 5가상 계정·3판매자·공개 상품 1개를 사용한 실DB 목표 시험 **1 pass/0 skip/0 fail**. 로컬 전체 **220건/172 pass/48 DB·환경 skip/0 fail**와 PR 본문 **8 pass**, typecheck/lint/build exit 0. WSL exact SHA 정식 개발 DB 전체 순차 **220건/213 pass/7 환경 skip/0 fail**, API/Next 생산 빌드 exit 0. 사후 accounts/products/inventory/audit/sale-stop `0/0/0/0/0`, 전용 자동 제거 컨테이너 0, WSL checkout clean. 이 서비스는 내부 조회 단계로, DB에 장바구니·예약·주문을 저장하거나 공개 API·결제를 만들지 않았다. 다음은 정책 결정과 S3.1 영속 장바구니/예약·주문 계약을 승인 설계에 맞춰 세분화한다.
- 신산님이 실제 브라우저 200% 확대 검증의 인수테스트 이월에 직접 `그래`라고 승인했다. 기존 in-app/Chrome 자동 확대 시도는 배율 값이 바뀌지 않았고, Chrome 파일 URL 자동 접근은 브라우저 보안 정책으로 거부돼 우회하지 않았다. 430px viewport를 확대 증거로 대체하지 않으며 현재 판정은 **UNVERIFIED**다.
- 승인된 변경은 검증 **시점**만 UAT-03으로 옮기는 것이며 접근성 합격·UAT 합격·나머지 Stage gate 면제가 아니다. `docs/WORK_PLAN.md`의 S2.4/S8.1, 홈 전시 세부 계획, 별도 초안 `docs/DEPLOYMENT_UAT_PLAN.md`의 UAT-03에 명시한다. 후속 인수에서는 실제 200% 배율 값, 화면 넘침·겹침, 키보드/버튼 조작을 확인하고 불합격이면 branch 수정→로컬/WSL 재검증→인수 재시험한다.
- 다음: S2.4의 확대 외 남은 정식 WSL 통합·E2E, 전체 브랜치 리뷰, PR 필수 검증을 현재 `codex/flat-v2-prototypes`에서 대조한다. 사용자 인수·Oracle·실공급자 연동은 아직 수행하거나 승인된 것으로 간주하지 않는다. `main` 직접 수정·새 branch/worktree 생성 없음.
- S2.4 반복 가능 통합 QA 사전 자원 계획: 승인된 작업 branch의 exact SHA를 지정 WSL checkout으로 Git pull한 뒤, 기존 정식 개발 DB `local-postgres/shoppingmall`을 사용한다. 고정 가상 실행 ID `f0241001`(8자리 hex)의 기존 `qa-public-fixture.ts seed`로 5개 역할 계정·3판매자·공개 시험 상품 2개를 생성한다. 담당 어울, 수명 S2.4 관리자 편집→미리보기→공개→고객 기획전/상세·판매자 권한 거부·품절 동작 통합 재현 동안이며 실계정·실결제·실발송은 쓰지 않는다. WSL Node24 전용 컨테이너 이름은 `shoppingmall-s24-integration-api`, `shoppingmall-s24-integration-proxy`, `shoppingmall-s24-integration-web`; 기존 `local-postgres`의 네트워크를 API가 공유하고 새 DB·볼륨·네트워크는 만들지 않는다. 호스트 9091/9092와 이름/DB baseline을 사전 확인한 뒤 시작한다. 시험 후 QA 공개 포인터·초안/발행본이 정확한 시험 관리자·ID와 맞을 때만 원상 복구, 같은 `QA_RUN_ID` fixture reset, 전용 컨테이너 3개 종료·자동 제거, DB/포트/checkout 잔류 0을 확인한다. 조건이 다르면 광범위 정리하지 않고 중단·보고한다. 이 증거는 독립 일회성 자체 회귀와 별도로 기록한다.
- 통합 QA 시작 전 코드 리뷰: 읽기 전용 독립 검토는 S2.4 홈 전시 범위에서 Critical 0·Important 2건을 발견했다. (1) 관리자 저장 응답 대기 중 계속 입력하면 응답 payload가 새 입력을 지움. (2) 홈 판매자 링크를 최신 공개 상품 첫 24건에서 만들면 25번째 이후 상품만 가진 판매자가 누락됨. 다른 Stage 전체 검토·실DB 검증을 대신하지 않는다. 두 항목을 직접 코드에서 재확인하고 QA fixture 생성은 보정 후로 미뤘다.
- 리뷰 보정 로컬 RED→GREEN: 관리자 화면 목표 시험의 busy 상태에서 메뉴·기획전 fieldset이 비활성화되지 않는 RED 1건을 확인한 뒤, 두 편집 영역만 `disabled={busy}`로 묶어 같은 시험 **8 pass**. 홈 판매자 시험에서 24개 상품이 모두 A이고 등록 판매자 B가 별도로 있을 때 B 링크 누락 RED 1건을 확인했다. 새 공개 API/계약을 만들지 않고 기존 `GET /catalog/sellers`의 관리자 등록 판매자 전체를 읽어 홈 링크를 구성하도록 수정, 홈·관리자 목표 **13 pass**와 typecheck 통과. 따라서 아직 상품이 없는 등록 판매자도 빈 상품 결과 링크가 보일 수 있으며, 공개 상품의 판매 가능성은 기존 상품 목록에서 계속 검사한다. 로컬 전체·WSL·실브라우저 최종 회귀는 이 보정 이후 아직 미검증이다.
- 리뷰 보정 로컬 전체 회귀: 변경 파일 `apps/web/app/account/admin/home/page.tsx`, `apps/web/app/home-catalog.tsx`, 화면 시험 2개와 이 현황. `pnpm test` **219건/172 pass/47 DB·환경 skip/0 fail**, PR 본문 8 pass; `pnpm typecheck`·`pnpm lint`·`pnpm build` 모두 exit 0. 47 skip을 실DB PASS로 합산하지 않는다. 이 단계에서 WSL DB·브라우저/QA fixture는 변경하지 않았고 후속 동일 SHA 검증이 필요하다.

## 진행 중 — 2026-10-01 S2.4 홈 전시 실제 브라우저·회귀 checkpoint

- 담당/기준: 어울 단일 writer, 기존 `codex/flat-v2-prototypes` 격리 worktree. 시험 정리 도구까지 안전 commit/push한 로컬·원격·WSL HEAD는 `1c040facdaca22a9a0b2d90a93ccb2833c1453ee`, Git dirty 0. `main`·다른 프로젝트 자료·Oracle은 변경하지 않았다.
- 실제 브라우저: 개발 WSL의 HTTP 웹/API와 고유 가상 계정·공개 상품 `QA_RUN_ID=3c3676a2`로 관리자 로그인→기획전 1·추가 메뉴 1·공통 추천 1 편집→버전 2 저장→미리보기에서 이름·제외 0 확인. 저장만 한 상태의 구매자 홈은 기획전 0·추천 0·추가 메뉴 0이었다. 관리자 공개 이력 `5b6d6f24-d2f6-4793-9eec-2d19255506d7` 생성 후 구매자 홈에 세 영역 노출, 메뉴 클릭→기획전→상품 상세 링크를 확인했다. 빈 초기 홈·비인증 관리자 접근·없는 기획전 안내, 430×844/1440×900/1920×1080 폭의 가로 넘침 없음, Tab→Enter의 본문 건너뛰기를 확인했다. 실제 200% 브라우저 배율은 단축키 입력에도 배율/DPR이 바뀌지 않아 **미검증**이며 모바일 폭을 그 증거로 대체하지 않는다. 판매자/고객 로그인으로 관리자 편집 거부를 화면에서 별도 확인한 것은 아니고 HTTP 실DB 시험만 통과했다.
- 실제 화면 결함/조치: HTTP WSL IP에서 브라우저 `crypto.randomUUID` 미제공으로 기획전 추가 실패 1회. 환경의 비보안 origin에서 Web Crypto 일부 API가 빠지는 원인을 확인하고 `ids.ts`에 보안 난수 `crypto.getRandomValues` 기반 UUID v4를 적용, RED→GREEN 시험과 동일 SHA `f384f0d` push/pull/Next 재빌드 뒤 같은 브라우저 동작을 통과했다. 첫 QA API는 production Secure cookie가 HTTP QA origin에 저장되지 않아 로그인 상태를 유지하지 못했으므로 해당 전용 API만 development 쿠키 설정으로 다시 띄웠다. DB 인증을 우회하지 않고 전용 9092 TCP proxy를 사용했다. 첫 도구 실행의 pnpm 자동 install 프롬프트 실패는 제품/시험 실패로 간주하지 않고 기존 node_modules 직접 시험으로 바꾸었다. 동일 근본 원인 3회 반복 없음.
- QA 자원 정리: 확인한 위 공개본 ID와 가상 관리자 계정·draft 버전 2·현재 포인터가 정확히 일치할 때만 복구하는 `qa-home-browser-reset.ts`를 사용해 current NULL/draft 버전 1 빈 내용으로 되돌리고 해당 공개본만 삭제, 이어서 정확한 `QA_RUN_ID=3c3676a2` public fixture를 reset했다. 사후 개발 DB accounts/sellers/products/home publications `0/0/0/0`, draft 버전 1 빈 내용·current NULL. 이름을 확인한 `shoppingmall-s24-browser-web-1001`/`-proxy-1001`/`-api-1001` 세 QA 컨테이너만 종료·자동 제거해 같은 이름 잔류 0. 원래 DB의 0008 migration/초기 singleton은 보존했다. 이번 가상 시험 자료는 의도적으로 삭제됐으며 필요하면 동일 fixture로 재생성할 수 있다.
- 현재 검증: 로컬 `pnpm test` **214건/167 pass/47 DB·환경 skip/0 fail**와 PR 본문 **8 pass/0 fail**, `pnpm typecheck`·`pnpm lint` exit 0. 제한된 첫 `pnpm build`는 `apps/web/.next/trace-build` 쓰기 EPERM 1회였고 동일 소스 권한 있는 재실행에서 API/Next 전체 빌드 exit 0. WSL exact SHA `1c040fa` 실DB 전체 `node --import tsx --test` **214건/207 pass/7 환경 skip/0 fail**, PR 본문 **8 pass/0 fail**. WSL `corepack pnpm test`는 비대화형 의존성 제거 확인 프롬프트로 시험 시작 전 실패 1회라 실제 Node 테스트와 구분했다. 해당 시도에서 생긴 WSL `.pnpm-store`는 정확한 경로/크기(1.1MB)/소유를 확인 후 root 소유 파일을 일회성 Node 컨테이너에서만 삭제했고 checkout clean을 재확인했다. 환경 skip 7건을 PASS로 합산하지 않는다.
- 코드 리뷰/보정: 읽기 전용 독립 리뷰가 Important 2건(미리보기의 기간·숨김 불일치, 상세 사진을 대표로 선택 가능)과 Minor 1건(일회성 정리 도구 재사용 위험)을 제기했다. 실제 설계 26·32·43행과 API/UI를 대조해 Important 둘을 수용. 미리보기 `not_started`/`ended`/`hidden`/`inactive_event`와 지금 고객 노출 수를 구분하고, 미래 기획전은 공개 가능하되 기간 전 비노출로 유지했다. 썸네일만 선택·공개 허용하고 공개 후 사진이 사라지면 다른 썸네일/텍스트로 대체한다. 실DB RED `43ede2a`의 미래 기획전 미리보기 1 fail과 `8cb65fd`/`296b980`의 상세 사진 fallback/공개 검사 각각 1 fail을 확인, 보정 `f00b1e7` 동일 SHA WSL 목표 HTTP **3 pass/0 skip/0 fail**, 로컬 관리자 화면 **6 pass/0 fail**·typecheck/lint exit 0. 중간 `b8e708d` 목표 시험의 400 대 200은 추가한 미래 메뉴 참조를 시험 invalid payload에서 빠뜨린 fixture 오류 1회이며 참조를 유지하도록 고쳐 `bff0baa` 2 pass를 확인했다. 같은 원인 3회 반복 없음.
- Minor 처리: `qa-home-browser-reset.ts`는 위 실제 QA 복구에만 사용한 뒤 제품 트리에서 삭제한다. 재사용 시 미리 파악하지 않은 draft 내용 삭제 위험을 없애기 위한 조치이며, 새 QA에서는 별도 실행 ID·초기 상태를 다시 기록하고 복구를 설계해야 한다. 앞선 QA 가상 계정·자료 삭제는 재생성 가능하고 개발 DB 0008 구조는 보존된다.
- 리뷰 보정 후 로컬 회귀: `pnpm test` **216건/169 pass/47 DB·환경 skip/0 fail**, PR 본문 **8 pass/0 fail**; `pnpm typecheck`·`pnpm lint`·`pnpm build` 각 exit 0. 이 결과는 WSL 최종 전체 실DB 재시험/실브라우저 재확인을 대체하지 않는다.
- 리뷰 보정 후 WSL 최종 회귀: 로컬·SSH 원격·WSL 지정 checkout `997a47b57e2004697ef90559ab55347800e55c87` 일치. WSL 개발 DB 전체 순차 시험 **216건/209 pass/7 환경 skip/0 fail**, PR 본문 **8 pass/0 fail**, 같은 SHA Next production 빌드/API TypeScript 생산 빌드 exit 0. 사후 accounts/sellers/products/audit/home publications `0/0/0/0/0`, draft 버전 1 빈 내용/current NULL, WSL checkout clean, 이전 브라우저 QA 컨테이너 잔류 0. 아직 화면의 나머지 역할·품절·실제 200%를 완료로 승격하지 않는다.
- 남은 브라우저 QA 자원 계획: 같은 지정 WSL checkout/개발 `shoppingmall`에서 고유 `QA_RUN_ID=6a20d418`의 가상 계정 5개·판매자 3개·공개 상품 1개를 기존 `qa-public-fixture.ts`로 잠시 생성한다. 소유 어울 Task 5~6, 수명 판매자/구매자 관리자 접근 차단 및 재고 5→0의 상품 목록·상세 실브라우저 시험 동안. 전용 Node24 API/Web/9092 proxy의 정확한 이름은 `shoppingmall-s24-role-api-1001`/`-web-1001`/`-proxy-1001`이고 기존 9091/9092 listener와 이름 무점유를 먼저 확인한다. 홈 singleton/공개본은 만지지 않는다. 종료 시 정확한 QA run fixture reset과 세 전용 컨테이너 자동 제거, DB 계정·상품·감사·전시, checkout·포트 잔류를 확인한다. 실계정·실결제·발송·Oracle 없음.
- 남은 오류/확대 QA 자원 계획: 위 역할 시험 정리 뒤 동일 SHA WSL checkout의 기존 Next 빌드만 `shoppingmall-s24-error-web-1001`(Node24, 9091)으로 일시 기동하고 API는 의도적으로 종료된 상태로 둔다. 소유 어울 Task 5, 수명 홈 API 장애에서도 고정 메뉴·검색/분류가 남는지 실제 브라우저 확인 및 in-app 브라우저 확대 입력 확인 동안. 시작 전 9091/컨테이너 이름 무점유를 확인, 종료 시 그 컨테이너만 자동 제거하고 port·checkout 잔류를 확인한다. DB/fixture/Secret 변경 없음. 실제 확대 값 확인이 불가능하면 PASS로 간주하지 않는다.
- 역할·품절 실제 브라우저: 동일 SHA `997a47b`의 가상 `QA_RUN_ID=6a20d418`, 상품 `6a495cf7-f340-4d5e-9ffa-baa747c7372c`에서 옵션 `500g` 판매 가능 5개가 상세에 보이고 목록에도 상품이 노출됨을 확인했다. DB에서 정확히 확인한 QA 옵션 `509066bb-7085-482e-847d-9197f026c34a`만 sellable 5→0으로 업데이트한 뒤 새로고침하니 상세 `품절`, 목록 `검색 결과가 없습니다`로 즉시 바뀌었다. 구매자/판매자 QA 계정으로 각각 실제 로그인 후 `/account/admin/home`은 편집 내용을 노출하지 않고 `운영자 로그인 후 이용`만 보였다. 두 QA 세션은 화면에서 로그아웃했다. SQL 첫 조회의 원격 따옴표 오류 1회는 DB 실행 전 `syntax error`로 끝났고, 무조건 전체 옵션 조회로 유일한 QA 옵션을 확인한 뒤 조건부 UPDATE 1행만 수행했다. 제품 결함 없음.
- 역할·품절 QA 정리: 정확한 `6a20d418` public fixture reset 후 이름 확인한 `shoppingmall-s24-role-web-1001`/`-proxy-1001`/`-api-1001`만 stop/자동 제거. DB accounts/sellers/products/audit/home publications `0/0/0/0/0`, draft 버전 1/current NULL, 해당 컨테이너·9091/9092 listener 0, WSL checkout clean. 가상 재고 행도 QA 상품과 함께 제거했고 다른 프로젝트 자원은 변경하지 않았다.
- API 장애/확대 실제 브라우저: API 9092를 의도적으로 끈 상태에서 같은 SHA의 전용 웹 `shoppingmall-s24-error-web-1001`만 시작했다. 홈의 고정 홈/제철 메뉴와 검색창·상품 탐색 링크는 남고 기획전/추천은 `불러오지 못했습니다 · 다시 시도`, 분류/판매자는 오류 안내를 보여 단일 홈 전시 장애가 기본 탐색을 지우지 않았다. in-app 브라우저 `Control_L+equal` 확대 입력 전후 CSS width 1280, devicePixelRatio 1, visualViewport.scale 1로 변화 없어 **실제 200% 확대는 여전히 미검증**이다. 전용 웹만 stop/자동 제거 후 port·checkout 잔류 0.
- 관리자 반응형·키보드 QA 자원 계획: 문서 전용 checkpoint `5f614d4`를 WSL 지정 checkout에 exact SHA로 맞췄다. 고유 `QA_RUN_ID=72ab1001`의 가상 계정 5개·판매자 3개만 기존 `qa-fixture.ts`로 개발 `shoppingmall`에 생성하며 상품·홈 singleton·공개본은 변경하지 않는다. 소유 어울 Task 6, 수명 관리자 화면 430/1440 폭과 Tab/Enter 조작 확인 동안. 새 전용 컨테이너는 `shoppingmall-s24-admin-api-1001`/`-proxy-1001`/`-web-1001`, 9091/9092; 사전 이름·포트 무점유 확인, 종료 시 해당 QA run reset과 세 컨테이너 자동 제거, DB·포트·checkout 잔류를 대조한다. 실계정/실결제/발송 없음.
- 관리자 반응형·키보드 실제 결과: 같은 제품 소스/문서 전용 HEAD `5f614d4`에서 가상 `qa+72ab1001-admin@example.invalid`로 로그인해 운영자 역할과 전시 관리 접근 확인. 첫 Tab은 `본문으로 건너뛰기`, Enter 뒤 `#main-content` 포커스. 430×844에서 추가 메뉴/기획전/추천/저장·공개/이력 카드가 한 열로 보이고 버튼 줄바꿈 뒤에도 조작 가능, CSS innerWidth 430/scrollWidth 415. 1440×900에서는 두 열과 조작부가 보이며 innerWidth 1440/scrollWidth 1425. 임시 뷰포트 override는 reset했다. 관리자 화면 자체의 실제 200% 배율은 확인하지 못했다.
- 관리자 QA 정리: 화면에서 로그아웃한 뒤 정확한 `QA_RUN_ID=72ab1001` fixture reset이 5개 가상 계정을 제거했고, `shoppingmall-s24-admin-web-1001`/`-proxy-1001`/`-api-1001`만 stop/자동 제거했다. DB accounts/sellers/products/audit/home publications `0/0/0/0/0`, draft 버전 1/current NULL, 9091/9092 listener·해당 컨테이너 잔류 0, WSL checkout clean. 이전 사용자 자료나 다른 프로젝트 자원은 변경하지 않았다.
- 현재 판정/다음: S2.4 홈 전시 기능·실DB·역할/품절/오류/뷰포트/키보드 및 실제 UI의 버전 충돌 재로드·이전 공개본 복원은 확인했다(아래 후속 기록 참조). 성공한 저장 뒤 재조회 실패 문구는 단위 시험·코드로 구분했고 그 실패를 실제 브라우저에서 강제로 재현한 증거는 없다. 승인 계획의 실제 **브라우저 200% 확대**는 in-app 브라우저 확대 입력 전후 배율 값이 변하지 않아 UNVERIFIED다. 이 증거를 임의 PASS로 바꾸거나 430px 폭을 대체 증거로 쓰지 않는다. 실제 배율 수동 확인 또는 신산님의 인수 단계 이월 결정 전 S2.4 Stage PR/병합·다음 Stage로 승격하지 않는다. 사용자 인수/Oracle/외부 연동은 별도 단계다.
- 관리자 버전 충돌·복구 QA 사전 경계: WSL exact SHA `5f614d4`의 개발 `shoppingmall`에서 고유 `QA_RUN_ID=ee17c482` 기존 계정 fixture(가상 5계정·판매자 3개)를 생성한다. 시작 기준은 accounts/products/publications 0, 홈 draft v1 빈 내용/current NULL. 소유 어울 Task 6, 수명 두 브라우저 탭의 동시 편집 409·서버 재로드, 두 공개본 생성·첫 공개본 UI 복구를 관찰하는 동안. 전용 Node24 `shoppingmall-s24-interaction-api-1001`/`-proxy-1001`/`-web-1001`과 9091/9092를 사전 무점유 확인 후 사용하고, 다른 프로젝트 자원은 건드리지 않는다. 종료 시 정확한 QA 관리자 계정 ID·생성한 공개본 ID 두 개와 draft/current를 대조해 baseline으로 복구·해당 ID 공개본만 삭제한 뒤 fixture reset, 해당 컨테이너·port·DB 잔류 0을 확인한다. 실상품/실결제/발송/Oracle 없음. SQL 조건 불일치 시 광범위 삭제하지 않고 중단·보고한다.
- 관리자 버전 충돌·복구 실제 화면: 동일 초안 v1을 두 브라우저 탭에서 연 뒤 첫 탭이 `QA 첫 공개 메뉴`를 v2로 저장했다. 둘째 탭의 오래된 v1 저장은 HTTP 409와 다른 관리자 수정 안내를 표시했고, `서버 내용 다시 불러오기`로 v2를 회복했다. 첫 탭에서 공개본 `e636f8e6-39fa-4daa-9f89-63dffff26887` 생성→메뉴 삭제·v3 저장→빈 공개본 `bbbb44b0-9d85-48cf-831f-014a00372323` 생성→첫 공개본 복원을 실제 UI로 실행했다. 별도 구매자 탭에서 복원된 메뉴가 다시 노출되는 것을 확인했다. 이번 화면 검증의 고유 ID는 `ee17c482`; 실상품·실결제 없음.
- 충돌·복구 QA 정리: 사전 확인한 QA 관리자 `5f64a351-e9e0-4465-b348-1f267f04eb9c`·공개본 두 ID·draft v3·현재 포인터가 일치할 때만 transaction으로 current NULL(`UPDATE 1`), draft v1 빈 payload(`UPDATE 1`), 해당 공개본 2개 삭제(`DELETE 2`) 후 commit했다. 정확한 `QA_RUN_ID=ee17c482` fixture reset으로 시험 계정 5개를 제거하고 전용 web/proxy/api 컨테이너 3개만 중지했다. 사후 DB publications 0, draft v1 `menu/events/recommendations` 빈 배열, current NULL, accounts/sellers/products/해당 QA identity `0/0/0/0`; 실행 중인 해당 QA 컨테이너 0. 첫 잔류 확인 SQL은 `accounts.email` 컬럼이 없어 읽기 전용 오류 1회, 두 번째는 존재하지 않는 `audit_logs` 관계로 읽기 전용 오류 1회였으며 실제 `account_identities.identifier`로 재조회해 0을 확인했다. 제품·자료 변경 오류는 없고 같은 원인 3회 반복 없음. 공유 DB의 승인된 0008 migration과 singleton은 보존했다.
- 저장 확인 안내 보정: 리뷰 후 남아 있던 Task 6의 성공 응답 JSON 손상·재조회 실패 구분을 추가했다. 목표 시험은 새 helper 미구현으로 `ERR_MODULE_NOT_FOUND` RED 1회, 수정 후 관리자 화면 시험 **7 pass/0 fail**. 성공한 PUT의 응답 파싱이 안 되면 서버 편집본을 재조회하고, 그마저 실패하면 저장 자체를 실패로 단정하지 않고 `저장됐지만 서버 내용 재조회에 실패`로 안내한다. 로컬 전체 **217건/170 pass/47 DB·환경 skip/0 fail**, PR 본문 **8 pass/0 fail**, typecheck/lint/build 각 exit 0. 첫 제한 실행 Next build는 `.next/trace` EPERM 1회였고 같은 소스 권한 실행에서 API/Next build를 통과했다. 이 변경의 WSL 동일 SHA 실DB 전체 회귀 및 실제 브라우저 재확인은 아직 미검증이다.
- 저장 보정 WSL 실증: 변경 `b17206d6cceed4321fa39e4564514bebe2974d78`을 SSH 별칭 원격에 push해 WSL 지정 checkout fast-forward/clean·동일 SHA를 확인했다. WSL 목표 화면 **7 pass**, 개발 `local-postgres/shoppingmall` 전체 순차 **217건/210 pass/7 환경 skip/0 fail**(약 100초), 시험 후 accounts/sellers/products/home publications `0/0/0/0`, draft v1/current NULL, checkout clean. 일반 UID의 API `dist`/Next `.next` 빌드는 이전 root 소유 산출물 때문에 EACCES 1회씩 발생했으나 같은 SHA의 기존 산출물 경로를 일회성 root Node24 컨테이너로 재빌드해 API와 Next production build 모두 exit 0; 제품 소스·DB/권한 설정은 변경하지 않았다. 실제 200% 확대와 재조회 실패 UI의 실브라우저 재현은 여전히 미검증이다. Stage PR·병합·인수 합격으로 승격하지 않는다.
- 미검증/다음: Task 5·6의 판매자/고객 관리자 접근 화면, 품절 후 실제 화면 변화, 실제 200% 확대, 리뷰 보정 후 전체 회귀/빌드가 남았다. S2.4 전체 gate/PR·병합과 최종 인수는 아직 완료 아님. 먼저 보정 후 전체 검증·QA 잔류 확인, 실브라우저 미검증 경계를 재평가한 다음 `docs/WORK_PLAN.md`의 다음 Stage로 진행한다. 외부 PG·문자/메일/푸시·Oracle은 신산님 결정대로 구축 후 인수 단계로 남긴다.

## 진행 중 — 2026-10-01 S2.4 홈 전시 구현 Task 1 착수

- 담당/기준: 어울 단일 writer, `codex/flat-v2-prototypes@0c4a9966a3b16dfa92e1d77f9ef46d0a3e05e3f6` clean 격리 worktree. 신산님의 `계속하자`를 직전 제시한 홈 전시 구현 계획 검토 승인과 Task 1 착수 지시로 기록한다. `main`·새 branch/worktree는 변경하지 않는다.
- 기준선: 로컬 `pnpm test` 196건/157 pass/39 DB·환경 skip/0 fail, PR 본문 8 pass. 이는 새 홈 기능 증거가 아니다. WSL 지정 checkout은 아직 `3bf8338` clean, `local-postgres` 실행 중, 개발 `shoppingmall` DB 존재. WSL 상태 확인의 PowerShell SSH 인용 오류 1회는 원격 명령 실행 전 실패했고, 간단한 읽기 전용 명령으로 보정했다.
- Task 1 QA 자원 사전 계획: WSL `local-postgres`의 새 격리 DB `shoppingmall_s24_home_1001`(동명 부재를 최종 재확인 후 생성), 소유 어울 Task 1, 수명 0000~0008 migration RED/GREEN와 복구 검증 동안. 시험은 지정 checkout을 안전 commit/push→Git pull한 동일 SHA의 기존 Node24 이미지 일회성 컨테이너 `shoppingmall-s24-home-1001`에서만 실행한다. 기존 `shoppingmall`과 다른 DB/컨테이너/서비스는 보존한다. 종료 시 정확한 격리 DB와 이 컨테이너만 제거하고 목록/행 잔류를 확인한다. 비밀값은 기록하지 않는다.
- Task 1 시험 준비/미검증: 공유 개발 DB 읽기 전용 조회에서 Drizzle 이력 8건, accounts/products/audit 0/0/0. `apps/api/test/home-schema-db.test.mjs`에 초기 빈 편집본·단일 행·버전/JSON/FK와 불변 공개본/현재 포인터의 DB 행위 시험 2건을 먼저 작성했다. 로컬 실행은 0 pass/2 DB skip이므로 RED 증거가 아니다. 안전한 시험 전용 commit/push→지정 WSL checkout 동일 SHA에서 실제 개발 DB에 대해 미구현 관계 실패를 관찰한다. 격리 DB/컨테이너는 아직 생성하지 않았고 공유 개발 DB schema 변경도 없다. 홈 저장/API/화면·WSL GREEN·브라우저/UAT 미검증.
- Task 1 RED/구현 중간: 시험 전용 `b78e75e099bd49fa3d2b2435b7133b5106097f2e`를 SSH 별칭으로 push해 WSL 지정 checkout SHA/clean을 확인하고, 자동 제거 Node24 컨테이너의 기존 개발 DB에서 새 2건 모두 예상 RED(`42P01`, 두 관계 부재; skip 0)를 보았다. DB는 transaction rollback만 사용해 기존 행 무변경, 실행 후 컨테이너 자동 제거. 승인된 3테이블 Drizzle 구조와 0008 SQL/스냅샷, 초기 편집본/현재 행 INSERT를 작성했다. 로컬 `pnpm test` 198건/157 pass/41 DB·환경 skip/0 fail + PR 본문 8 pass, `pnpm typecheck`·`pnpm lint` 통과. 첫 제한된 `pnpm build`는 D: 산출물 EPERM 1회였고 동일 소스 권한 재실행은 API/Web 성공; 제품 결함으로 단정하지 않는다. 다음은 격리 DB 0000~0008 적용·실DB GREEN이며 아직 실제 migration은 어디에도 적용하지 않았다.
- Task 1 격리 GREEN/정리: 구현 `05071b8a4cd8d75d39b40ef943b2240276e34895` 로컬/SSH 원격/WSL 지정 checkout 일치. 고유 `shoppingmall_s24_home_1001` DB에 0000~0008 이력 9건 적용, 신규 홈 시험 2 pass/0 skip/0 fail. 기존 auth/product/shipping/health를 합친 대상 시험 8건/7 pass/1 의도된 환경 skip/0 fail. 격리 DB 전체 회귀는 여러 기존 QA fixture가 DB 이름 `/shoppingmall`만 허용하는 보호 규칙으로 실패했으며 이 규칙을 완화하거나 해당 실패를 제품 결함으로 둔갑시키지 않았다. 오류 원인 1회, 공유 DB migration 적용 뒤 정식 전체 회귀가 필요하다. 격리 시험 전/후 accounts/products/audit 0/0/0, 홈 초기 draft/current 1/1, 기존 개발 DB migration 8건 불변. 정확한 격리 DB `shoppingmall_s24_home_1001` 제거 후 존재 0, 전용 자동 제거 컨테이너 0, WSL checkout clean 확인. 공유 DB 0008 적용은 설계서의 별도 승인 경계라 신산님께 확인을 요청했고 답 전에는 적용하지 않는다. 독립적인 Task 2 입력 검증은 진행 가능하다.
- Task 1 완료 증거/다음: 신산님이 `local-postgres/shoppingmall` 개발 DB의 0008 적용을 별도 승인했다. 읽기 전용 dry-run은 기존 8건·대기 `0008_s2_home_content` 1건/8문장/SHA-256 `fb9878e9c9043a5686623556d19c1d1bd11a99185c7cc730a263574affa89538`. 격리 검증한 동일 `05071b8`에서 적용 후 신규 DB 시험 **2 pass/0 skip/0 fail**, WSL 실DB 전체 회귀 **198건/191 pass/7 환경 skip/0 fail**. 사후 migration 9건, accounts/products/audit 0/0/0, home draft/current/publications 1/1/0, 전용 컨테이너 0, WSL checkout clean. 기존 행 삭제 없음; 복구 시 이미 적용한 migration을 임의 삭제하지 않고 이전 검증 코드 또는 보정 migration을 사용한다. 홈 편집/공개 API와 화면은 아직 미구현. 다음 Task 2 구성 검증·상품 배치 조회를 RED부터 진행한다.
- Task 2 중간: `apps/api/test/home-validation.test.mjs`를 먼저 작성해 미구현 모듈 실패를 관찰하고 `apps/api/src/home/types.ts`/`validation.ts`의 내부 링크 종류·ID/중복/문자 길이/기간/개수 검증을 구현했다. 목표 3 pass/0 fail, typecheck/lint 통과. `apps/api/test/home-eligibility-db.test.mjs`는 고유 UUID의 25개 가상 상품·승인 개정·재고·이미지를 단일 DB transaction에 만들고 항상 rollback하여 현재 판매 가능 배치 조회의 순서/25번째/품절/판매중지/개정 교체를 검증하도록 제품 코드보다 먼저 작성했다. 로컬 DB 없는 실행은 RED 증거가 아니므로 안전 commit/push→WSL 동일 SHA에서 기대 실패를 확인한다. 새 공개 API/DB schema 변경은 없다.
- Task 2 실DB 시험 자원 사전 계획: 지정 개발 `local-postgres/shoppingmall`과 WSL exact SHA checkout만 사용. 기존 `node:24-bookworm-slim` 자동 제거 컨테이너의 정확한 이름은 `shoppingmall-s24-home-eligible-1001`, 소유 어울 Task 2, 수명은 각 RED/GREEN 명령 중. 고유 UUID `qa-home-*`의 가상 계정·판매자/분류·상품 최대 25개를 시험 DB transaction 안에만 만들고 `finally`에서 rollback한다. 컨테이너 이름/포트 점유를 사전 확인하고 종료 후 계정·상품·감사 수와 컨테이너 0을 확인한다. 다른 서비스·실상품·외부 발송은 사용하지 않는다.
- Task 2 배치 조회 RED/구현 중간: `239edb0a885cfe781cb296e2f6ee310166951786` 로컬/SSH 원격/WSL 일치, WSL 개발 DB 시험 3 fail/0 skip/0 pass는 모두 `getSellableByIds` 미구현 TypeError라는 예상 RED였다. 각 시험은 transaction rollback. `PublicProducts`에 요청 ID 순서의 단일 SQL 조회를 추가해 공개 승인/판매중지/양수 재고 조건을 기존 목록과 맞추고 현재 개정 이미지만 집계한다. 로컬 typecheck/lint 통과, 새 6건 중 순수 3 pass/DB 3 skip은 실DB GREEN이 아니다. 구현을 안전 commit/push→WSL 동일 SHA에서 실DB 목표 재시험·전체 회귀한다.
- Task 2 GREEN/정리: 구현 `f9734ebd85e62786e4784f761c4bd3448d20a2d9` 로컬/SSH 원격/WSL 지정 checkout 일치. 입력 검증+현재 판매 가능 배치 조회 WSL 목표 **6 pass/0 skip/0 fail**, 전체 개발 DB 회귀 **204건/197 pass/7 환경 skip/0 fail**. 기존 공개 검색 시험도 통과해 `list()`의 페이지·검색 동작을 보존했다. 사후 accounts/sellers/products/audit/home publications `0/0/0/0/0`, 전용 자동 제거 컨테이너 0, WSL checkout clean. 로컬 typecheck/lint 통과, 로컬 전체 204건/160 pass/44 DB·환경 skip/0 fail+PR 본문 8 pass. 새 schema·공개 API는 변경하지 않았다. 다음은 Task 3 관리자 편집/미리보기/공개/복구의 권한·원자성 HTTP RED이다.
- Task 3 사전 QA 자원: 관리자 HTTP 시험은 지정 WSL 개발 `shoppingmall`에서 8자리 hex `QA_RUN_ID`의 가상 고객·판매자·관리자 5계정을 기존 `runQaFixture`로 생성하고 단일 시험 종료 시 정확한 run ID로 reset한다. 홈 singleton 편집본은 시작 전 상태(version/payload/수정자)를 읽어 보관하고 해당 시험만 수정한 뒤 `finally`에서 먼저 복원하여 가상 관리자 FK를 해제한다. 공개본을 만들 경우 해당 관리자 ID의 공개본만 현재 포인터 복원 후 삭제한다. 소유 어울 Task 3, 수명 각 시험 1회. Node24 전용 자동 제거 컨테이너 `shoppingmall-s24-home-admin-1001`만 사용하며 포트 공개/실계정/외부 발송 없음. 생성 전 이름·기본 singleton 상태와 기존 QA 잔류를 확인하고 사후 계정/상품/감사/홈 공개본·컨테이너 0을 대조한다.
- Task 3 첫 RED 준비: `apps/api/test/home-admin-http-db.test.mjs`를 제품 API 구현 전 작성했다. 고객/판매자/비인증 차단, 관리자 편집본 조회, Origin/버전 충돌, 저장만으로 공개 포인터 불변, 감사 이력과 정확한 QA 복원을 검사한다. 현재 제품 관리자 `/home/admin/draft`는 아직 미등록이므로 WSL 실DB에서 예상 404 RED를 확인할 예정. 나머지 미리보기·공개·복구/경쟁 시험과 기능은 이후 같은 Task 3 안에서 진행한다.
- Task 3 첫 RED/구현 중간: 시험 전용 `b030cdb9e2001d9b44396d9fa38e633aa843de15` 로컬/SSH 원격/WSL 일치. 개발 DB의 초기 singleton version 1·빈 내용·수정자 NULL 확인 뒤 WSL HTTP 시험 1 fail/0 skip은 새 `/home/admin/draft` 미등록 404 대 기대 401의 예상 RED. 시험 fixture는 `finally`에서 reset. `apps/api/src/home/repository.ts`의 조건부 version 증가+감사 동시 transaction, `home/controller.ts`의 서버 세션/활성 admin/Origin/입력 검증, `app.module.ts` 라우트 등록을 최소 구현했다. 로컬 typecheck/lint 통과, DB 시험 로컬 1 skip은 GREEN 아님. 동일 SHA WSL 재시험 후 QA 잔류를 확인한다.
- Task 3 편집본 첫 GREEN/다음 RED: 구현 `d9a43aef7fbd628e0dbb831173fb0e8fda40fc0c`의 WSL HTTP 목표 1 pass/0 skip/0 fail. 같은 시험 파일에 가상 공개 상품 1건을 사용한 미리보기→첫 공개→다음 공개→이전본 복구/불변 스냅샷/감사 시험을 제품 구현 전에 추가했다. `finally`에서 시작 당시 singleton 편집본·현재 포인터를 복원하고 해당 QA 관리자 공개본만 삭제한 뒤 기존 public fixture reset을 수행하도록 지정했다. 해당 시험은 새 API 미구현의 예상 RED를 확인한 후 구현한다. 이 checkpoint는 Task 3 전체 완료가 아니다.
- Task 3 공개·복구 RED/구현 중간: 시험 전용 `4e46ff235412038f6f37a913a5ff2a62ab3e1f63` WSL 동일 SHA에서 기존 편집 시험 1 pass, 신규 workflow 1 fail/0 skip은 미등록 `/home/admin/preview`의 404 대 기대 200 예상 RED. `HomeRepository`에 현재 판매 가능 대상 검증, 행 잠금/transaction 안 공개 스냅샷·포인터·감사, 불변 공개 이력 조회, 이전 공개본 복구/감사를 구현하고 관리자 전용 route에 연결했다. 로컬 typecheck/lint 통과. 실DB GREEN·동시성/부정 입력 세부 검증과 QA 잔류 확인 전이므로 Task 3 완료가 아니다.
- Task 3 공개·복구 첫 GREEN/보강: 구현 `fcddcb9df4358714756181d03de9c8834eb5ee28`의 WSL 관리자 HTTP 2 pass/0 skip/0 fail, 전체 개발 DB 회귀 **206건/199 pass/7 환경 skip/0 fail**. 승인된 판매 가능 상품을 미리보기→공개→다음 공개→이전본 복구하면서 불변 snapshot/감사 기록을 확인했다. 이어서 존재하지 않는 선택 상품의 공개 거부·제외 사유와 같은 편집본 버전의 동시 저장 1성공/1충돌을 추가 검증 중이다. 추가 실DB 시험과 사후 QA 잔류 0 확인 전에는 Task 3 완료로 표시하지 않는다.
- Task 3 보강 회귀: `0a52a5dcf35436eaf397805cf0d8ffe74df23bfa` 동일 SHA의 WSL 관리자 HTTP 2 pass/0 skip/0 fail, 전체 **206건/199 pass/7 환경 skip/0 fail**. 존재하지 않는 선택 상품은 미리보기 제외·공개 400, 동시 저장은 1성공/1충돌(409), 기존 공개 포인터 불변. 사후 accounts/sellers/products/audit/publications `0/0/0/0/0`, singleton draft version 1·current NULL, QA 컨테이너 0, WSL checkout clean. 관리자 계정의 활성 판매자 역할 접근 거부를 시험에 추가했으며 동일 SHA 실DB 재시험을 남겨두었다. 로컬 typecheck/lint exit 0. Task 4 공개 API는 아직 미구현.
- Task 3 최종 보강/Task 4 사전 QA 계획: `782e7e5129bc562bb973c08239ecadbf5694154d` 동일 SHA WSL 관리자 HTTP 2 pass/0 skip/0 fail로 관리자 계정의 활성 seller 역할 403도 확인했다. Task 4 공개 HTTP 시험은 개발 `shoppingmall`에서 고유 8자리 `QA_RUN_ID`의 가상 계정 5개/판매자/상품 2개를 기존 public fixture로 만들고, 홈 singleton 편집본/현재 포인터를 시작 값으로 복원한 뒤 해당 QA 관리자 ID로 만든 공개본만 삭제하고 fixture reset한다. 소유 어울 Task 4, 수명 시험 1회. 전용 자동 제거 Node24 컨테이너 `shoppingmall-s24-home-public-1001`만 사용하고 포트를 외부 공개하지 않는다. WSL checkout 동일 SHA push/pull 후 시험, 사후 계정/상품/감사/공개본/컨테이너 잔류 0 확인. 현재 고객 공개 API/화면은 미구현이다.
- Task 4 RED/구현 중간: 시험 전용 `89d3281abf34f44e8b3b96b61271f01e390f933e` 동일 SHA에서 WSL 공개 HTTP 1 fail/0 skip은 미등록 `/home/content`의 404 대 빈 구성 200 예상 RED였다. 고객 공개본만 읽는 `/home/content`, `/home/events/:id`와 현재 판매 가능 상품·기간·메뉴 대상 재검사, no-store 응답을 구현했다. 상품/시간/메뉴 응답은 타입체크·lint 통과했으나 WSL GREEN 전이다. 기존 고객 화면과 관리자 편집본은 변경하지 않았다.
- Task 4 GREEN/정리: `104a96434b934d0efe830311444b42bed5f16873` 동일 SHA WSL 공개 HTTP **1 pass/0 skip/0 fail**, 전체 **207건/200 pass/7 환경 skip/0 fail**. 미공개 편집본 비노출, 선택 순서·시작 포함/종료 미포함, 추측한 이벤트·기간 밖 안내, 분류/판매자/상품 메뉴 유효성, 실시간 가격·재고/판매중지, 원본 이미지 삭제 후 텍스트 fallback/새 이미지 사용을 확인했다. 계정/판매자/상품/감사/공개본 `0/0/0/0/0`, singleton draft version 1/current NULL, 전용 컨테이너 0, WSL checkout clean. 로컬 typecheck/lint exit 0. React/Next.js 화면 작업에는 vercel-react-best-practices를 사용하여 전시 요청 장애와 기존 탐색 요청을 분리한다. 아직 실제 브라우저·고객 화면·관리자 화면/UAT는 미검증; 다음 Task 5.
- Task 5 로컬 구현/검증 중: 새 `home-merchandising.tsx` 시험은 모듈 부재 예상 RED, 기획전 상세 시험은 경로 부재 예상 RED를 확인했다. 단일 전시 요청의 메뉴/기획전/공통 추천, `/events/[id]` 상품 상세 동선, 빈/오류/재시도와 현재 상품 사진 ID의 fallback을 추가하고 기존 카테고리·판매자 탐색을 별도 요청으로 보존했다. 표적 Web 시험 18 pass/0 fail, 로컬 typecheck/lint/build exit 0(Next 홈 정적·기획전 동적). 첫 로컬 전체 시험은 기존 고정 `/#events-title` 메뉴를 기대한 `apps/web/test/public-products.test.mjs` 1건 실패. systematic-debugging으로 승인된 설계의 고정 메뉴가 홈/제철뿐이고 나머지는 공개본 메뉴라는 원인을 확인, 해당 레거시 기대값만 조정한 뒤 표적 18 pass 및 로컬 전체 **210건/163 pass/47 DB·환경 skip/0 fail**, PR 본문 8 pass. 화면 동작의 실제 브라우저·WSL 동일 SHA 빌드는 아직 미검증. 오류 원인 1회/수정 1회; 다른 기능·DB 변경 없음.
- Task 5 WSL 렌더/빌드: `1e15a3807398a3ccf2ff975117ce67a1e23eee28` 동일 SHA의 WSL Web 표적 18 pass/0 skip/0 fail. API TypeScript·Next 홈/기획전 빌드 통과. 첫 daon(UID 1000) 빌드 2회는 이전 빌드 산출물 `apps/api/dist/...` 및 `apps/web/.next/diagnostics/...`가 root 소유라 EACCES; 소스·DB 변경 없이 일회성 컨테이너 내부의 API 출력 경로와 기존 root 소유 ignored `.next`를 Node24 컨테이너로 갱신해 최종 빌드 exit 0. 출력 파일 소유권 원인 1종/조치 1종, 중단된 전용 컨테이너 0. 실제 브라우저 폭/키보드/200%는 아직 미검증이므로 Task 5 최종 gate는 열려 있다.
- Task 6 로컬 구현/검증 중: `apps/web/test/admin-home.test.mjs` RED(경로 없음) 후 관리자의 추가 메뉴/기획전·KST 기간/상품·대표 사진/공통 추천 편집 화면과 저장·미리보기·공개·이력 복구를 연결했다. 미저장 편집본으로 이전 서버 버전을 공개하는 결함 가능성은 별도 RED→GREEN 시험으로 막고, 미리보기에 이름·제외 사유가 보이도록 RED→GREEN 보강했다. 계정 관리자 메뉴 링크 추가. 표적 관리자 화면 **3 pass/0 fail**, 로컬 전체 **213건/166 pass/47 DB·환경 skip/0 fail**+PR 본문 8 pass, typecheck/lint/build exit 0(`/account/admin/home` route 생성). WSL 동일 SHA/실브라우저 역할·조작 검증 전이며 UAT는 아직 아니다.
- Task 6 WSL 빌드/실DB: `6db7d19529b3a02af0d14e47afa1123a3cbb68c0` 동일 SHA WSL 화면 21 pass/0 skip/0 fail, API/Next 빌드 exit 0(`/account/admin/home` route), 전체 실DB **213건/206 pass/7 환경 skip/0 fail**. 사후 accounts/sellers/products/audit/home publications `0/0/0/0/0`, draft version 1/current NULL, 자동 제거 컨테이너 0, checkout clean. 실제 브라우저 전에는 완료/UAT 판정하지 않는다.
- Task 5·6 실제 브라우저 QA 자원 계획: WSL 지정 checkout 동일 SHA, `local-postgres/shoppingmall`에서만 시험한다. 현재 WSL IP `172.27.253.53`, 9091/9092 LISTEN 없음, 고유 컨테이너 `shoppingmall-s24-browser-api-1001`/`shoppingmall-s24-browser-web-1001` 부재를 확인했다. Node24 일회성 API/Web 두 컨테이너는 QA가 끝나면 정확한 이름으로 종료하고 포트 해제 확인한다. 화면 시험은 우선 빈 상태·권한 없음·폭/키보드이며, 공개 상품 시험 자료를 만들면 고유 8자리 QA_RUN_ID와 소유·수명·정확한 초기 홈 포인터 복원 순서를 별도 기록한 후 생성한다. 실계정/실결제/발송/Oracle은 사용하지 않는다.
- 브라우저 QA 준비 오류 1: Web 200, API `/ready` 503. API를 `--network host`로 시작하면 `local-postgres`의 공개 5432 TCP 경로가 SCRAM 비밀번호를 요구한다는 `pg` 오류 코드/메시지로 근본 원인을 확인했다. 실DB 시험은 `--network container:local-postgres`의 local trust였으므로 제품 결함/DB 장애로 판정하지 않는다. DB 인증·Secret을 바꾸지 않고 정확한 QA API 컨테이너만 종료 후 같은 이름으로 해당 네트워크에서 재기동한다. Windows 브라우저 접근은 전용 이름 `shoppingmall-s24-browser-proxy-1001`의 Node24 TCP 전달 컨테이너가 WSL 호스트 9092→`local-postgres` 네트워크 IP `172.18.0.3:9092`만 임시 전달한다. 이 IP는 현 시험에서 확인한 값이며 재시작 시 재조회한다. QA 후 proxy/API/Web 정확한 세 이름만 종료하고 잔류 포트를 확인한다.
- 브라우저 빈 상태 확인/양성 fixture 사전 계획: API 네트워크 재기동 뒤 내부/WSL IP readiness 200, Web 200. In-app Browser에서 비로그인 홈의 빈 기획전/분류/판매자/추천, 관리자 URL의 로그인 요구, 존재하지 않는 기획전 URL 안내, 430×844·1440×900·1920×1080에서 가로 넘침 없음, Tab→Enter 본문 이동을 관찰했다. 200% 확대 단축키는 `innerWidth=1920`, DPR=1, scale=1 불변이라 **미검증**. 이후 양성 화면 시험용 고유 QA_RUN_ID `3c3676a2`를 예약한다(소유 어울 Task 5·6, 수명 이번 브라우저 시험). 생성 전 계정/판매자/분류/홈 공개본 모두 0, draft version 1·current NULL. 기존 `runQaPublicFixture`로 가상 고객/판매자/관리자 5계정과 공개 상품 2개만 생성한다. 홈을 공개하게 되면 시험 전 저장한 singleton version/payload/수정자·현재 포인터를 정확히 복원하고 **이 QA 관리자 ID가 생성한** 공개본만 제거한 다음 해당 `QA_RUN_ID`의 public fixture reset을 수행한다. 판매/결제/발송 자료는 만들지 않는다. 정리 뒤 계정/상품/분류/감사/공개본/컨테이너/포트 잔류를 확인한다.
- 브라우저 로그인 진단: `3c3676a2` public fixture의 가상 5계정·공개 상품 2개 생성 성공. 운영자 이메일/시험 비밀번호로 UI 로그인하면 `/account`로 이동하지만 비로그인 표시. API의 `setSessionCookie`는 `NODE_ENV=production`에서 `Secure`를 붙이고 현재 브라우저는 HTTP WSL IP로 접속하므로 브라우저가 세션을 보유하지 않는 것이 코드·화면 증거와 부합한다. 제품 코드나 운영 인증 설정은 변경하지 않는다. 정확한 QA API 컨테이너만 `NODE_ENV=development`(WEB_ORIGIN 명시, mock OTP 미활성)로 재기동한 뒤 동일 가상 계정으로 재시험한다. 오류 원인 1회, 조치 1회. 기존 QA fixture는 보존하고 시험 종료 때만 정리한다.
- 브라우저 관리자 양성/발견 결함: 개발 모드 QA API에서 가상 운영자 로그인 성공, 계정의 관리자 메뉴 및 `/account/admin/home` 편집본 version 1·상품 2개 선택지를 실제 브라우저에서 확인했다. `기획전 추가` 클릭은 반응이 없고 브라우저 오류 로그가 `crypto.randomUUID is not a function`을 기록했다. 원인: HTTP WSL IP는 secure context가 아니어서 브라우저의 `randomUUID` 사용 불가. 제품의 신규 메뉴/기획전 ID 생성만 `crypto.getRandomValues` 기반 UUID v4로 바꾸는 표적 RED(모듈 부재)→GREEN 4 pass/0 fail, 실제 브라우저 재확인 전이다. QA fixture `3c3676a2` 및 전용 서비스는 아직 ACTIVE이며 중단 시 이 항목의 정확한 run ID·컨테이너를 복구 기준으로 삼는다. 본 원인 1회/조치 1회, 운영 보안/DB는 변경 없음.

## 진행 중 — 2026-09-30 S2.4 홈 전시 서면 설계 승인·구현 계획 검토

- 담당/기준: 어울 단일 writer, 기존 `codex/flat-v2-prototypes` worktree. 신산님이 홈 전시 설계 검토 요청에 `계속하자`고 답한 것을 `docs/superpowers/specs/2026-09-30-home-merchandising-design.md`의 서면 승인으로 기록하고 `docs/superpowers/plans/2026-09-30-home-merchandising.md`에 구현 순서와 RED→GREEN/WSL exact-SHA/브라우저 gate를 작성했다. 변경 파일은 이 두 문서와 `WORK_STATUS.md`뿐이다.
- 범위/승인 경계: 승인된 추가 메뉴·기획전·공통 추천의 저장/공개·복구/API/화면 계약을 Task 1~7에 매핑했다. 문서 계획 검토 이후에만 제품 코드·0008 migration·실DB/QA 자원 작업을 시작한다. 기존 `main`, 다른 worktree, 개발 DB, 외부 서비스는 이번 문서 작업에서 변경하지 않았다.
- 검증/오류/미검증: 현재 Git 상태·기존 app/module/catalog·migration 0007/저널·웹 홈/관리자 패턴·시험 구조와 계획을 대조했다. 계획 7개 Task의 파일·RED/GREEN·실DB/화면/복구 경계, 설계/WORK_PLAN 상대 링크 존재, 구 설계 대기 문구 제거, `git diff --check` 오류 0을 자체 확인했다. 원인 오류 0회. 제품 test/typecheck/lint/build 및 WSL/브라우저 시험은 이번 문서 전용 단계에서 실행하지 않았으므로 새 기능 PASS가 아니다. 실제 200% 확대·전시 기능·Stage/UAT는 미검증이다.
- 다음: 문서 자체 검토와 안전 checkpoint 후 신산님께 구현 계획 검토를 요청한다. 승인되면 동일 worktree에서 Task 1 RED부터 진행한다.

## 진행 중 — 2026-09-30 S2.4 홈 전시 서면 설계 검토

- 담당/기준: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@9172dc563a7cd371b33a40ca21c99380137384d8` clean. 신산님이 관리자 편집본/공개본 분리와 기획전별 선택 상품 화면 방향을 대화에서 승인해 `docs/superpowers/specs/2026-09-30-home-merchandising-design.md` 서면 검토본을 작성했다. 기존 2026-09-26 홈 초안과 S2.4 계획·현재 코드의 검색/분류/판매 가능 조회를 대조했다.
- 설계 범위: 관리자 전용 추가 메뉴·기획전·공통 추천의 편집/미리보기/원자적 공개/이전본 복구, 선택 상품 기획전 화면, 현재 승인·판매 가능 상품/기간 재검사, 이력·권한·오류 분리. 고객별 개인화·실제 할인·판매자 행사 제안·외부 링크는 제외. 새 DB 구조·공개 API는 문서에 **제안**만 했고 서면 설계/별도 계약 승인 전 제품 코드·DB에는 적용하지 않았다.
- 검증/다음: 서면 문서의 경로·요구 충돌·미결정 표기·Git diff를 자체 확인한 뒤 현재 브랜치에 문서만 checkpoint하고 신산님에게 파일 검토를 요청한다. 이번 단계에서는 제품 테스트·WSL QA를 실행하지 않았으며 직전 `3ebda4d` 실DB 회귀 증거를 새 코드 증거로 갱신하지 않는다. 동일 근본 원인 오류 0, 미검증은 실제 200% 확대·S2.4 홈 구현/브라우저·전체 Stage/인수.

## 진행 중 — 2026-09-30 S2.4 코드 리뷰 보완·홈 편집 계약 확인

- 담당/기준: 어울 단일 writer, `codex/flat-v2-prototypes`. 읽기 전용 코드 리뷰에서 중요 2건(판매중지 승인↔재입고 신청 경합, 일반 QA 계정 reset의 새 관계 FK 누락), 경미 2건(저장 후 재조회 실패 문구, 판매 상태 변경 시 상세 취소 동선)을 확인했다. Critical 없음. S2.4 전체 완료·PR/병합·인수 판정은 아니다.
- RED: 시험 전용 `3c8a35c`를 SSH 별칭으로 push→지정 WSL checkout 동일 SHA에서 실DB 두 회귀시험이 각각 예상 실패(신청 성공으로 경합 확인, 계정 삭제 FK `23503`). 시험 fixture의 정확한 ID 정리 후 제품 코드의 상품 행 `FOR SHARE`를 기존 판매중지 승인 `FOR UPDATE`보다 먼저 획득하도록 맞추고, QA 계정 reset에서 해당 계정의 찜·신청 자식 행만 삭제했다. 스키마·공개 API·실계정은 변경하지 않았다.
- 중요 결함 GREEN: 수정 `cb5b518936b33c0a5624fe01565c71a8cf7e0bf4`의 로컬/SSH 원격/WSL 동일 SHA에서 WSL 개발 `shoppingmall` DB 전체 시험 **194건/187 pass/7 환경 skip/0 fail**. 사후 WSL checkout clean, accounts/products/favorites/restock/audit `0/0/0/0/0`, 전용 S2.4 컨테이너 0. 로컬 같은 시점 194건/155 pass/39 DB·환경 skip/0 fail와 PR 본문 8 pass, typecheck 0.
- 경미 보완: 상세 화면에서 변경 요청 성공 뒤 목록 재조회만 실패하면 `저장 실패` 대신 저장 완료·결과 확인 실패를 구분하고 새로고침 안내를 표시한다. 현재 품절 버튼 밖의 활성 신청도 판매중지/재입고/옵션 변경 후 상세에서 취소할 수 있게 한다. RED 시험은 새 helper 미구현 export로 실패, 수정 후 화면 목표 8 pass. 로컬 전체 **196건/157 pass/39 DB·환경 skip/0 fail**, PR 본문 8 pass, typecheck·lint 0. 첫 Windows production build는 제한된 실행의 `.next/trace` EPERM으로 중단됐으나 동일 소스 권한 실행 재시도에서 API/Web build 0; 제품 빌드 결함으로 판정하지 않는다. 경미 보완의 WSL 동일 SHA 시험은 다음 checkpoint에서 수행한다.
- 다음: 경미 보완 commit/push→WSL 동일 SHA 목표 화면·실DB 회귀와 clean/QA 잔류 확인, 코드 재검토. 홈 메뉴·기획전·관리자 편집 추천은 범위상 필요하지만 관리 저장 방식·권한/이력/링크 계약은 서면 초안이 미확정이다. 신산님께 관리자 직접 편집/공개 대 판매자 제안 포함 중 한 선택을 비차단 질문으로 요청했고, 답 전에는 새 홈 관리 schema/API를 만들지 않는다. 실제 200% 확대·외부 알림·Oracle·사용자 인수는 미검증으로 유지한다.
- 경미 보완 목표 확인: `3ebda4d36744c4f23f907133f57a42f63db32938` 로컬/SSH 원격/WSL 일치. WSL 실DB 재입고·QA reset 및 웹 목표 **13 pass/0 skip/0 fail**, WSL Next production build 0. 로컬 전체 196건/157 pass/39 환경 skip/0 fail, PR 본문 8 pass, typecheck/lint/build 0. WSL 시험 후 지정 DB accounts/products/favorites/restock/audit `0/0/0/0/0`, S2.4 임시 컨테이너 0, checkout clean. 이 시점에는 최신 SHA의 전체 WSL 회귀를 아직 실행하지 않았고, 그 결과는 다음 항목에 별도로 기록한다.
- 최종 코드 SHA 전체 회귀/재검토: `3ebda4d`에서 WSL 개발 DB 전체 **196건/189 pass/7 환경 skip/0 fail**, Node24 일회성 컨테이너 자동 제거. 첫 읽기 전용 리뷰 담당자가 수정 diff를 다시 보고 기존 중요 2·경미 2건 보완 및 새 Critical/Important 미발견을 판정했다. 리뷰는 시험 재실행이 아니며 실제 확대·외부 발송/인수 증거는 아니다.

## 진행 중 — 2026-09-30 S2.4 찜·재입고 신청 구현 시작

- 담당/기준: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@4d00fbee08ec39193994f8b7938b2249ef188c0a` clean 격리 worktree. 신산님의 `계속하자`에 따라 승인된 찜·재입고 상세 계획을 직접 구현한다. 새 브랜치/다른 checkout은 만들지 않는다.
- 시작 검증: Windows 로컬 `pnpm test` 182건/149 pass/33 DB·환경 skip/0 fail, 별도 PR 본문 8 pass/0 fail. 로컬 skip을 실DB PASS로 간주하지 않는다. 우선 Task 1의 새 관계와 migration을 RED→GREEN으로 진행한다.
- QA 자원 사전 계획: WSL 지정 checkout `/home/daon/deploy/shopping`, 기존 `local-postgres`에만 격리 DB `shoppingmall_s24_fav_0930` 생성(현재 이름/소유 확인 후), 기존 Node24 이미지의 자동제거 시험 컨테이너 `shoppingmall-s24-fav-0930`, 고유 가상 계정·상품/옵션 UUID를 사용한다. 격리 DB는 0000→0006 RED 및 0007 GREEN 검증 동안만, 컨테이너는 명령 실행 동안만 둔다. 종료 때 정확한 QA DB/컨테이너와 해당 fixture 행만 정리하고 잔류 0을 확인한다. 지정 개발 DB `shoppingmall`은 dry-run·격리 PASS 전 변경하지 않으며 실계정·실발송·Oracle은 제외한다.
- 현재 제품 코드/DB 변경·마이그레이션 적용/WSL 검증: 아직 없음. 다음은 Task 1 테스트 작성→exact SHA WSL RED이다.
- 진행/오류: Task 1의 실DB 관계 계약 시험 2건을 제품 코드보다 먼저 작성했다. WSL 지정 checkout은 `0068c8378caf0fa12c33c677dc31a83493173b8f` clean이며 `local-postgres` 실행 중이다. `shoppingmall_s24_fav_0930`은 DB 목록에 없고 동명 시험 컨테이너도 없다. 읽기 전용 DB명 SQL의 PowerShell→SSH 인용 오류 1회 후 `psql -lqt` 목록으로 확인했다. 계획 브리프 스크립트 내부의 Windows 경로 실행 오류 2회 후 동일 패키지 브리프 스크립트를 직접 호출해 회복했다. 같은 근본 원인 3회 반복 없음. 실제 DB RED/GREEN은 아직 수행 전이다.
- Task 1 RED 증거: 테스트 전용 commit `2d0fde64ef34936c16fca30a4d16ff22bad9346a`를 SSH 원격과 WSL 지정 checkout에서 같은 SHA로 확인했다. 격리 DB `shoppingmall_s24_fav_0930`에 기존 migration 0000~0006만 적용(7건); 목표 시험 2건 모두 새 테이블 부재 `42P01`로 예상 실패, skip 0. 공유 개발 `shoppingmall`은 기존 migration 7건 그대로이며 신규 SQL은 적용하지 않았다. 전용 Node24 컨테이너는 `--rm`으로 종료됐다. 이후 Drizzle generator가 새 `0007` SQL/스냅샷/저널을 생성했고 API typecheck exit 0; 실DB GREEN은 새 exact SHA에서 재검증 예정. 격리 DB는 GREEN까지 유지하고 정확한 이름으로 정리한다.
- Task 1 GREEN 중간 증거: commit `2785be19da46cd51756ac7ba974577fa7b27ddf1` 로컬/원격/WSL SHA 일치. 새 0007을 기존 격리 DB에 적용해 migration 8건을 확인했고 목표 관계 시험 2 pass/0 skip/0 fail. 로컬 전체 시험 184건/149 pass/35 DB·환경 skip/0 fail, PR 본문 8 pass, API typecheck·lint 각 exit 0(실DB 통과와 별개). 추가 전체 초기 적용 시험용 별도 격리 DB `shoppingmall_s24_fav_full_0930`을 기존 `local-postgres`에 잠시 생성할 계획이며, 현재 점유 0을 확인한 후 0000~0007 적용·동일 관계 시험을 수행하고 즉시 정확한 이름으로 제거한다. 기존 격리 DB도 Task 1 검증 뒤 제거한다. 이 두 DB 외 공유 DB는 이 단계에서 변경하지 않는다.
- Task 1 적용 전 판정: 두 번째 빈 격리 DB `shoppingmall_s24_fav_full_0930`에 0000~0007 전체 8건 적용 성공, 목표 관계 시험 2 pass/0 skip/0 fail. 지정 개발 `shoppingmall`에 대한 읽기 전용 dry-run은 적용 7건/대기 0007 1건(10 SQL 문장, SHA-256 `fc1aad9238071055a00eecabf2f273de520719cee2919d0c11158710b80dd56e`)이며 SQL은 적용하지 않았다. 이 격리 검증을 근거로 승인된 개발 DB에 동일 0007만 적용한다. 기존 행 삭제/초기화 없음; 오류 시 추가 적용을 멈추고 DB 이력·관계 행을 읽기 전용 조사해 보정 migration/코드 복구를 결정하며 이미 남긴 지속 이력은 임의 삭제하지 않는다.
- Task 1 완료 증거/경계: 같은 `2785be19da46cd51756ac7ba974577fa7b27ddf1`의 0007을 지정 개발 DB에 적용해 Drizzle 이력 총 8건·신규 관계 행 0/0을 확인했다. 실DB 관계 시험 2 pass/0 skip/0 fail, WSL 전체 회귀 **184 tests/177 pass/7 환경 skip/0 fail**; 로컬의 35 skip과 혼동하지 않는다. 격리 DB `shoppingmall_s24_fav_0930`·`shoppingmall_s24_fav_full_0930`을 정확한 이름으로 삭제해 잔류 0, 전용 자동 제거 컨테이너 0, 개발 DB accounts/products/favorites/restock `0/0/0/0`, WSL checkout clean을 확인했다. 제품 찜/신청 API·화면은 아직 구현 전이며 S2.4 완료가 아니다. 다음은 Task 2 고객 찜 API의 RED 시험이다.
- Task 2 사전 시험 자원: `apps/api/test/customer-favorites-http-db.test.mjs`는 실행마다 고유 8자리 hex `QA_RUN_ID`의 `qa-<id>` 가상 고객/판매자/관리자와 공개 상품 1건, 별도 가상 고객 1건만 `shoppingmall` 개발 DB에 만든다. 소유 작업 Task 2, 수명은 시험 1회, 종료 시 `finally`에서 공개 fixture reset과 별도 고객의 관계/감사/세션/역할/identity/account를 정확한 ID로 삭제한다. Node24 `shoppingmall-s24-fav-0930`은 `--rm`으로 시험 명령 동안만 사용하고, 포트 공개·실발송·운영/Oracle 없음. DB 계정/상품/찜/감사와 컨테이너 잔류를 사후 확인한다. 제품 코드보다 먼저 HTTP 시험을 작성했고 아직 실DB RED는 실행 전이다.
- Task 2 RED/로컬 중간 증거: 테스트 전용 `78cdc9075d50a3520e518c6a64032ceb36e41231` 로컬/원격/WSL SHA 일치. 실제 가상 고객 로그인과 공개 상품 seed 후 `GET /customer/favorites`가 미등록 404로 반환돼 목표 시험 1 fail/0 skip; 검증용 예상 RED다. 시험 종료 후 개발 DB 계정/상품/찜/감사 `0/0/0/0`, 전용 컨테이너 0, WSL checkout clean. 이후 고객 전용 서비스·controller와 가상 공개 상품 reset의 찜 자식 정리를 구현했다. 로컬 API typecheck/lint exit 0, 로컬 전체 185건/149 pass/36 DB·환경 skip/0 fail + PR 본문 8 pass; **실DB GREEN은 아직 미검증**이다.
- Task 2 결함 조사: 첫 GREEN 후보 `b436e3f65af05bc75555cd0fedd46f1b89de5d36`의 실DB 목표 시험은 1 fail/0 skip; 유효한 미등록 UUID에서 기대 404 대신 400(`customer-favorites-http-db.test.mjs:55`)을 받았다. 새 `customer/engagement.ts` UUID 정규식이 8-4-4-12로 한 구간 빠졌고, 기존 정상 `catalog/public-products.ts`는 8-4-4-4-12임을 대조했다. 같은 UUID에 두 패턴을 적용한 최소 재현에서 각각 false/true. 원인을 확인한 뒤 정규식 한 구간만 보정했다. 이 원인 오류 1회, 추가 다른 오류 여부/실DB GREEN은 아직 미확인. 시험 fixture·컨테이너 사후 잔류는 별도 확인한다.
- Task 2 시험 SQL 결함: 정규식 보정 `ded49ac9dc492a8710f82957c477b6ca23c056cc`의 WSL 실DB 목표 시험은 집계 SQL에서 `42883 text = uuid`로 1 fail/0 skip. `customer_favorites.product_id`(uuid)와 `audit_events.target_id`(text)를 같은 `$2` 매개변수로 비교해 타입 추론이 충돌한 것이며, 제품 HTTP 앞선 찜·해제·동시 요청 상태 검사까지는 진행됐다. 시험 SQL의 감사 열 비교에만 `$2::text`를 적용했다. 이 원인 오류 1회, 앞선 UUID 오류와 다른 근본 원인이다. 사후 계정/상품/찜/감사 `0/0/0/0`, 컨테이너 0. 재시험 전 PASS 판정 없음.
- Task 2 완료 증거/경계: 집계 SQL 보정 `229ae88f43710fe5c7b3001925a720eb49f85ce0` 로컬/원격/WSL 일치. 고객 찜 HTTP 실DB 목표 시험 **1 pass/0 skip/0 fail**(고객 간 격리, 판매자·관리자/Origin 거부, 공개/비공개, 추가·해제 재시도/동시성 및 감사 수 확인). WSL 전체 회귀 **185 tests/178 pass/7 환경 skip/0 fail**. 사후 개발 DB 계정/상품/찜/재입고/감사 `0/0/0/0/0`, 전용 Node24 컨테이너 0, WSL checkout clean. UUID 코드 결함 1회와 시험 SQL 타입 오류 1회가 각각 수정됐으며 같은 원인 3회 반복 없음. 실제 재입고 API·고객 화면·실알림은 아직 미구현; 다음 Task 3 옵션별 신청 API.
- Task 3 사전 QA 자원: 새 `customer-restock-http-db.test.mjs`는 실행마다 고유 8자리 hex `QA_RUN_ID`의 `qa-<id>` 가상 고객/판매자/관리자·공개 상품 1건, 별도 가상 고객 1건과 동일 상품의 승인된 시험 개정 2·3, 품절 옵션·신청·감사만 지정 `shoppingmall` 개발 DB에 만든다. 소유 작업 Task 3, 수명은 단일 시험. 실행 뒤 정확한 QA 상품의 신청 자식→상품/개정/옵션과 가상 계정·감사를 `finally`/fixture reset으로 삭제하며, 시험 실패 시 동일 productId 신청만 수동 fallback 후 실패를 유지한다. Node24 자동 제거 컨테이너 `shoppingmall-s24-fav-0930`만 재사용; 외부 알림/실계정/Oracle 없음. 사후 행·컨테이너·checkout clean 확인. 제품 코드보다 먼저 시험을 작성했으며 실DB RED 전이다.
- Task 3 RED/로컬 중간 증거: 테스트 전용 commit `73c938f233483cb2e2b140e5767d7c38bc803f0f`를 SSH 원격과 WSL 지정 checkout에서 동일 SHA로 확인했다. 옵션별 재입고 신청 HTTP 실DB 시험은 새 `GET /customer/restock-subscriptions` 미등록 404로 예상 실패 1건/skip 0. 사후 개발 DB 계정/상품/신청/감사 및 전용 컨테이너 잔류 0. 이후 고객 전용 조회·신청·취소 API, 현재 승인 옵션명/재고·판매중지 확인, 동시 중복 멱등·감사, fixture 신청 관계 정리를 구현했다. 로컬 API typecheck·lint exit 0, 로컬 전체 186건/149 pass/37 DB·환경 skip/0 fail와 PR 본문 8 pass. **실DB GREEN은 아직 미검증**이며 정확한 구현 commit을 원격/WSL에 반영해 목표 시험과 전체 회귀를 수행한다.
- Task 3 실DB 완료 증거/경계: 구현 commit `270d44e738b07c6caa47d4139c25c84a94e67fe4` 로컬/SSH 원격/WSL 지정 checkout SHA 일치. 실DB 목표 HTTP 시험 **1 pass/0 skip/0 fail**(고객·역할/Origin 분리, 품절·판매중지, 동시 재시도, 개정 후 동일 옵션명/삭제, 취소·감사). WSL 전체 회귀 **186 tests/179 pass/7 환경 skip/0 fail**. 사후 계정/상품/찜/신청/감사 `0/0/0/0/0`, 전용 자동 제거 컨테이너 0, WSL checkout clean. 실제 알림 전송 및 `notified` 전이는 S5 경계로 미구현. 다음 Task 4 고객 Flat v2 화면 RED→GREEN.
- Task 4 RED/로컬 중간 증거: `customer-engagement.test.mjs`를 컴포넌트 전 작성해 첫 실행은 미구현 `engagement-controls.tsx` 모듈 부재로 예상 RED 1건. 상세에 고객 찜·품절 옵션 신청/취소, 계정에 내 목록과 현재 없는 옵션 표시, 병렬 읽기·다른 상품의 늦은 응답 차단·변경 후 서버 재조회 확인을 연결했다. 화면 시험 4 pass/0 fail, `pnpm typecheck`·`pnpm lint`·`pnpm build` 각 exit 0, 로컬 전체 **190 tests/153 pass/37 DB·환경 skip/0 fail**, PR 본문 8 pass. 첫 GREEN 화면 시험의 HTML 속성 순서를 잘못 가정한 단언 1건을 실제 SSR 출력에 맞춰 수정했고 제품 결함은 아니었다. WSL exact SHA·실브라우저/모바일·200%·키보드·인증 흐름은 아직 미검증이며 이 로컬 결과로 승격하지 않는다.
- Task 4 WSL/브라우저 자원 사전 계획: 구현 `491a8cf5d4e8d09c9986ccb115bedcf5aa7da0b1`을 SSH 원격·WSL 지정 checkout에서 확인했고 WSL Node24 목표 화면 시험 4 pass 및 Next production build exit 0. 첫 빌드 명령은 루트에 없는 `node_modules/.bin/next` 경로를 사용해 시작 전 실패 1회; 실제 `apps/web/node_modules/next/dist/bin/next` 존재를 확인해 바로잡았다. 실브라우저용 고유 `QA_RUN_ID=5a2c7d91`의 기존 public fixture 가상 계정 5개/상품 1개를 시험 중 생성하고, 정확한 해당 옵션의 sellable만 0으로 해 신청을 검증한다. 전용 API/Web 자동 제거 컨테이너 `shoppingmall-s24-ui-api-0930`/`shoppingmall-s24-ui-web-0930`, loopback 9091/9092와 SSH 로컬 터널, 시험 브라우저 탭 1개만 사용한다. 시작 전 DB 계정/상품/찜/신청/감사 0, 포트·전용 컨테이너 0, WSL SHA/clean 확인. 종료 때 탭·정확한 컨테이너·터널을 중단하고 `5a2c7d91` fixture만 reset, DB/포트/컨테이너/checkout 잔류 0 확인. 실계정·실발송·Oracle 없음. WSL 전체 회귀와 실제 브라우저 결과는 아직 진행 전/중이며 PASS로 주장하지 않는다.
- Task 4 첫 실제 브라우저 QA: 같은 `491a8cf`에서 WSL 전체 회귀 **190 tests/183 pass/7 환경 skip/0 fail**와 Node24 웹 빌드 통과. 가상 fixture 5계정/상품 1개만 seed했고 유일한 500g 옵션(변경 전 sellable 5)의 sellable을 0으로 변경했다. 첫 API 시작은 이전 `dist` 산출물이어서 새 찜 GET이 404(시험 구성 오류 1); 해당 QA API 컨테이너만 중지, 같은 SHA `tsc -p tsconfig.build.json` 뒤 재시작해 `/ready` 200·찜 GET 비로그인 401. 최초 재시작 직후 `/ready` 000은 기동 경쟁 1회였고 대기 후 200. 실제 in-app 브라우저에서 비로그인 안내, 고객 로그인→찜 저장→500g 신청→계정별 이력→Enter로 취소, 판매자/운영자 로그인 후 고객 전용 버튼 부재를 확인했다. 430px/640px 가용 폭에서 카드 한 열 배치와 데스크톱 화면을 시각 확인했다. 확대 단축키는 in-app 브라우저의 배율/DOM DPR을 바꾸지 않아 **실제 200% 확대는 미검증**; 640px 폭을 그 증거로 대체하지 않는다. 판매자/운영자에게도 '로그인 후'라고 안내되는 문구 결함을 발견해 고객 역할 전환 안내로, 계정 제목을 새 쇼핑 목록 포함 문구로 보정했다. 새 시험 2건 RED→총 6 pass, 이후 로컬 전체 **192 tests/155 pass/37 DB·환경 skip/0 fail**, PR 본문 8 pass, typecheck/lint/build exit 0. 보정 후 실제 브라우저 재확인과 실제 200% 확대는 아직 미검증이다.
- Task 4 QA 정리: 시험 탭 종료, 이름 확인한 전용 Web/API 2컨테이너만 stop/자동 제거, 정확한 `QA_RUN_ID=5a2c7d91` public fixture reset. 사후 WSL 지정 checkout `491a8cf` clean, accounts/sellers/products/favorites/restock/audit `0/0/0/0/0/0`, 전용 컨테이너·WSL 9091/9092 listener 0; Windows 로컬 포트 listener도 0. 기존 개발 DB migration 0007과 다른 프로젝트 컨테이너는 보존했다. 경로·셸 인용 오류 각 1회, 동일 근본 원인 3회 반복 없음. 다음은 보정 commit/push→WSL exact SHA·빌드/회귀와 남은 확대/브라우저 확인.
- Task 4 보정 후 WSL/Chrome 증거: 보정 commit `5f920e55a09a3e16247b28138c7406b018ab72f6` 로컬/SSH 원격/WSL 지정 checkout 일치. WSL Node24 고객 화면 시험 **6 pass/0 skip/0 fail**, Next production build exit 0, 실DB 전체 회귀 **192 tests/185 pass/7 환경 skip/0 fail**. 두 번째 QA 실행 전 계정/상품/찜/신청/감사 0 및 포트 무점유 확인, 같은 `5a2c7d91`의 새 가상 상품/옵션을 다시 seed해 유일한 옵션 sellable만 0. Chrome에서 판매자 로그인 후 상품 상세에 '구매자 역할로 전환' 문구와 고객 전용 버튼 부재를 직접 확인했다. Chrome 확대 단축키도 DPR 1/가용 폭 불변이라 실제 200% 확대 증거가 되지 않는다. 탭 닫음, 전용 Web/API 2컨테이너만 중지, 정확한 fixture reset 후 accounts/sellers/products/favorites/restock/audit `0/0/0/0/0/0`, 전용 컨테이너·WSL 9091/9092 listener·Windows 포트 0, WSL checkout clean. 실제 발송/`notified`, Oracle·사용자 인수, 실제 200% 확대는 이 증거로 PASS 처리하지 않는다.

## 진행 중 — 2026-09-30 S2.4 찜·재입고 신청 상세 구현 계획

- 담당/기준: 어울 단일 writer, `codex/flat-v2-prototypes@6edcbcb9e9061f9df6a19bb671dbf2ed6e518def`. 신산님의 `계속하자`를 앞선 서면 설계 검토 후 다음 단계 진행으로 받아들여 `docs/superpowers/plans/2026-09-30-customer-favorites-restock.md`를 작성했다. 새 브랜치·제품 코드·DB·시험 자원은 이번 문서 작업에서 변경하지 않았다.
- 계획: 고객 찜/옵션별 신청 관계와 격리 migration, 고객 전용 API, Flat v2 화면, 로컬·WSL exact SHA/실DB·브라우저/정리의 RED→GREEN 및 checkpoint를 Task 1~5로 나눴다. 실제 알림 전달과 `notified` 전이는 S5.3/UAT 미검증으로 남긴다. 서면 계획 검토와 실행 방식 확인 후 구현한다.
- 자체 검토: 설계 요구사항과 권한·동시 중복·상품 개정·판매중지·화면 오류·QA FK 정리·복구 항목을 계획 작업에 연결했다. WSL DB RED/GREEN은 Git commit/push→exact SHA pull 순서로만 실행하도록 보정했다. 현재 제품 기능/DB/브라우저 PASS 판정은 없다.

## 진행 중 — 2026-09-29 S2.4 찜·재입고 신청 서면 설계

- 담당/결정: 어울 단일 writer, `codex/flat-v2-prototypes`. 신산님이 재입고 신청은 상품 내 **옵션별**, 알림은 **한 번 전달 후 종료**로 답했고, 상품 찜은 상품 단위의 계정 저장 방향을 검토 후 `그래 진행하자`고 했다. 이는 설계서 작성 진행 승인으로 기록하며 아직 작성된 서면 설계·실행 계획·제품 구현의 최종 검증과 혼동하지 않는다.
- 변경/검토: 신규 `docs/superpowers/specs/2026-09-29-customer-favorites-restock-design.md`에 계정별 두 관계, 현재 공개 옵션의 이름을 서버가 확인하는 연속성, 동시 중복/권한/취소, S5 알림 연결과 실제 발송 미포함, additive migration·격리 DB 검증/복구를 명시했다. 고객/상품/재고 제품 코드, DB·migration, 외부 서비스는 이번 문서 작업에서 변경하지 않는다. 서면 설계의 자체 검토와 신산님 검토를 다음 게이트로 둔다.
- 자체 검토: 문서 내 TBD/TODO·불완전한 결정 없음, 상대 링크 대상 3개 존재, 실제 상태 변경의 감사 이력과 멱등 재시도의 무변경을 분리했다. 옵션명이 사라질 때 발송하지 않고 고객에게 표시하는 규칙, 실제 전송은 S5 이후라는 경계가 앞선 사용자 결정과 모순되지 않는다. `git diff --check` 공백 오류 0. 제품 기능·DB·브라우저 검증은 이 문서 검사로 PASS 처리하지 않는다.

## 진행 중 — 2026-09-29 S2.4 찜·재입고 신청 설계 경계 확인

- 담당/기준: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@fd4a431062ef7e093221ec83a5fd2f9b15a6206d` 격리 worktree. 신산님에게 계정별 찜·재입고 신청의 새 DB 테이블·고객 API 승인 질문을 보낸 직후 신산님이 `계속하자`고 답했다. 이를 해당 설계·구현 진행 허용으로 해석했음을 대화에서 명시했다. 기존 S2 계획 범위와 R12를 벗어나지 않는다.
- 조사/경계: 현재 고객 배송지·수신 설정은 `customer/`의 세션·고객 역할·Origin 검사와 PostgreSQL 정본을 사용하고, 상품은 공개 버전마다 옵션 ID가 바뀔 수 있다. 찜·재입고 영속 테이블과 API는 아직 없다. `brainstorming` 지침에 따라 새 데이터 기능의 세부 단위(상품/옵션)를 사용자에게 한 질문씩 확인 중이며, 설계 검토 전 제품 코드·migration·DB 자료는 변경하지 않는다. 기존 연결 worktree를 재사용하고 새 branch/worktree는 만들지 않는다.
- 사전 로컬 기준선: `pnpm test` 182 tests/149 pass/33 DB·환경 skip/0 fail, 별도 PR 본문 8 pass/0 fail(exit 0). 이는 새 기능 통과 증거가 아니다. 다음은 재입고 신청 단위 결정과 승인된 설계·작업 경계 확인 후 RED→GREEN이다.

## 진행 중 — 2026-09-29 S2.2 판매중지 중복 요청 경합 회귀

- 담당/목적: 어울 단일 writer. 현재 승인된 판매중지 API·schema를 유지한 채 가상 판매자 계정의 동일 상품 재요청 HTTP 2건이 동시에 도착하면 하나만 접수되고 다른 하나는 409이며 추가 이력/감사 기록이 생기지 않는지 검증한다. 기존 `sale-stop-db.test.mjs`의 고유 UUID·`finally` 정리만 사용한다.
- 절차/자원: 로컬 시험은 DB 없을 때 해당 항목 skip이라고 분리 기록하고, 안전 commit/push→지정 WSL checkout 동일 SHA→기존 `local-postgres/shoppingmall` 개발 DB와 자동 제거 Node24 전용 `shoppingmall-s22-stop-race-d7a1` 컨테이너에서 목표 시험을 실행한다. 사전/사후 fixture 행·컨테이너·checkout 청결을 확인한다. 실상품·운영/Oracle·외부 계정은 건드리지 않는다.
- 완료 조건/미검증: 201 한 건과 409 한 건, 승인은 해당 한 건에만 가능, 공개 차단·이력 수 기존 계약 그대로, 목표 시험 0 skip. 재고 최종 1개 주문 경합은 S3 기능 이후의 별개 시험이다. 실패하면 원인 분석 후 같은 Stage 범위에서 최소 수정하고 실행 증거를 기록한다.
- 실제 결과/정리: 테스트·계획 commit `8a05dcc92ec337e85bed382fccce41dd53b996f8`을 지정 SSH 원격에 push하고 WSL checkout 동일 SHA fast-forward. 전용 Node24 컨테이너에서 실DB·HTTP 목표 시험 **1 pass·0 skip·0 fail**. 동시 2요청의 상태 코드 `[201,409]`, 관리자 대기 목록 1건, 해당 요청 승인·고객 목록 제외·승인/반려 총 이력·감사 수 기존 주장까지 통과했다. 사후 account_identities/sellers/product_categories/products/product_revisions/product_options/product_publications/product_images/product_sale_stop_requests/audit_events 각 0, 전용 시험 컨테이너 0, WSL checkout clean. 실행 오류 0, 같은 근본 원인 반복 0. 단일 상품 재요청 경합 증거이며 고객 주문 마지막 재고 경합 증거는 아니다.

## 진행 중 — 2026-09-29 S2.2 이미지 악성파일 실제 데몬 시험

- 담당/범위: 어울 단일 writer. WSL 지정 checkout `030fcaf792c6c00dcb5e92bc2975bcf1410b3bba` clean, 기존 로컬 이미지 `clamav/clamav-debian:1.4.3`과 포함된 오프라인 시그니처 DB를 확인했다. 전용 `clamd-local.conf`로 `127.0.0.1:3310`에서만 임시 `shoppingmall-s22-clamd-d7a1` 데몬을 구동했다. 다른 서비스·DB·운영 데이터·외부 다운로드는 변경하지 않았다.
- 검증/정리: healthy와 루프백 listener를 확인한 뒤 자동 제거 Node24 시험 컨테이너에서 `CLAMD_INTEGRATION=1` 대상 시험 **1 pass·0 skip·0 fail**. 재인코딩된 정상 WebP 허용 및 무해한 EICAR 시험 문자열 거부가 실제 데몬 응답으로 확인됐다. 전용 데몬 stop/`--rm` 후 해당 이름의 컨테이너 0·3310 listener 없음. 시그니처 DB가 7일 이상 오래됐다는 경고가 있어 최신 위협 탐지 성능·운영 스캐너 준비를 증명하지 않는다. 실행 오류 0, 같은 원인 반복 0.
- 상품 승인 통합: 후속 `d91e1c07d9b1292559e5f6716eaac6580cfffed5` WSL clean checkout에서 전용 `shoppingmall-s22-approve-clamd-d7a1`을 같은 루프백 설정으로 healthy 구동하고, `CLAMD_INTEGRATION=1`·실 `shoppingmall` 개발 DB를 연결한 기존 `product-approve-db.test.mjs`를 실행했다. **1 pass·0 skip·0 fail**: 관리자 승인 HTTP가 실제 스캐너를 거친 비공개 시험 WebP만 공개하고 판매자 권한 거부·승인 전 공개 차단·공개 이미지 조회·수정안 경계를 검사했다. 시험 종료 후 전용 데몬/시험 컨테이너 0, 3310 listener 없음, DB 계정/판매자/분류/상품/개정/옵션/공개/이미지/판매중지/감사 각 0, WSL checkout clean. 이 결과도 외부 객체 저장소·최신 시그니처/운영 환경의 증거는 아니다.
- 남은 범위: 이미지 엔드투엔드·실상품 자료, S2.2 전체 통합과 S2.3 이후 Stage, Oracle·사용자 인수는 미완료다.

## 진행 중 — 2026-09-29 S2.2 판매중지 실제 화면·시험 자원 정리

- 담당/대상: 어울 단일 writer. 승인된 개발 DB migration 0006, 제품 SHA `9299fd8`, WSL 지정 checkout과 일회성 Node24 API/Web, 고유 `QA_RUN_ID=d7a1e0c2`를 사용했다. 신규 공개 API·운영 배포·실결제는 없다.
- 실제 브라우저: 가상 판매자 A가 판매중지를 요청했을 때 관리자 승인 전 고객 목록/상세 판매는 유지됐다. 가상 관리자 반려 후 판매자 화면에 사유가 표시되고 재요청이 가능했다. 재요청을 승인하자 고객 목록은 `검색 결과가 없습니다`, 과거 상세 URL은 `판매중지 승인으로 신규 구매가 중단되었습니다` 및 옵션 `판매중지`를 표시했다. 상세 UI에 수량 숫자 0을 표시한 것은 아니며, API/DB 검사는 승인 후 sellableQuantity 0을 확인한다. 고객 장바구니·주문 기능은 아직 구축 중이므로 실제 주문 차단 브라우저 E2E 또는 결제 완료 증거로 확대하지 않는다.
- 시험/정리: 판매중지 이력이 있는 공개 상품 fixture reset이 FK `23503`으로 실패하는 결함을 전용 실DB 시험 RED로 재현한 뒤, 해당 실행의 상품 ID에 속한 중지 요청을 먼저 삭제하는 최소 수정 `9299fd8`로 GREEN(4 pass·0 skip) 확인했다. 브라우저 탭은 닫았고 종료 명령 시 해당 `--rm` API/Web 컨테이너는 이미 없어 Docker가 정확한 이름에 대해 `No such container`를 반환했다. `docker ps -a`에서 전용 이름 0, 고유 fixture reset `{"reset":true}`, 사후 account_identities/sellers/product_categories/products/product_revisions/product_options/product_publications/product_images/product_sale_stop_requests/audit_events 각 0을 확인했다. 컨테이너 종료 명령의 이미 없음 응답 1회는 제품 결함이 아니다.
- 수정 SHA 로컬 재검증: `pnpm test` 182건 중 149 pass·33 DB 미연결 skip·0 fail, PR 본문 8 pass, `pnpm typecheck`·`pnpm lint` 각 exit 0. 로컬 빌드 첫 시도는 D: 산출물 쓰기 제한 `EPERM`으로 실패했으나 동일 코드·명령을 승인된 파일 쓰기 권한으로 재실행하여 API/Next 12경로 build exit 0. WSL 실DB 전체 저장소 회귀는 진행 중이며 결과를 별도 기록한다. 로컬 skip과 WSL 실DB 결과를 혼동하지 않는다.
- WSL 전체 회귀/사후 확인: 지정 checkout `9299fd8496c09b0675047a8a526c3ddcf133e399`의 개발 DB 연결 전체 저장소 시험 **182 tests/175 pass/7 skip/0 fail**, PR 본문 **8 pass/0 fail**. API 단독 시험은 84 tests/77 pass/7 skip/0 fail이며 전체 저장소 집계를 대신하지 않는다. `git status --short` 빈 결과, 전용 컨테이너 0, 사후 위 DB 10개 테이블 각 0을 재확인했다. 이 검사는 개발 DB와 mock 계약 증거이며 Oracle/실공급자/UAT 증거가 아니다.
- 미검증/다음: S2.2 전체 Stage, 실브라우저 주문 차단, S2.3~S8 및 사용자 인수는 완료 판정하지 않는다. 실제 악성 파일 검사 데몬의 격리 시험 결과는 위 후속 기록에 별도 기재했다. 다음 독립 계획 작업을 이어간다.

## 진행 중 — 2026-09-29 S2.2 판매중지 migration·실DB 검증

- 담당/승인: 어울 단일 writer. 신산님이 신규 API와 `shoppingmall` 개발 DB의 전용 테이블·마이그레이션을 승인했고, 이번 턴에 작업 브랜치 4커밋의 지정 SSH 원격 push를 명시 승인했다. 로컬 `codex/flat-v2-prototypes@a765cc47d5bd4a77007c353ae3494ff26593eed0`의 `pnpm test` 181건 중 149 pass·32 DB/환경 skip·0 fail, PR 본문 8 pass, typecheck/lint/build 각 exit 0, diff check 0. 원격 같은 SHA를 `git ls-remote`로 확인했고 WSL 지정 `/home/daon/deploy/shopping`을 이 SHA로 `pull --ff-only`하여 clean 확인. 로컬의 32 skip은 DB PASS가 아니다.
- 자원/절차: 정확한 개발 DB는 WSL `local-postgres/shoppingmall`. 먼저 migration dry-run으로 현재 DB명·Drizzle 이력·대기 파일을 읽기 전용 확인한다. 격리 문법/적용 시험은 같은 개발 PostgreSQL 컨테이너 내 전용 임시 DB `shoppingmall_s22_d7a1e0c2`에서만 0000→0006을 적용하고 schema·시험 결과를 확인한 뒤 임시 DB를 제거한다. 대상 DB 기존 자료는 초기화하지 않고 0006의 신규 테이블/인덱스만 승인 범위에서 적용한다. Node24 자동 제거 컨테이너 접두사 `shoppingmall-s22-d7a1`과 지정 `postgres_env_default` 네트워크·기존 checkout만 사용하며 새 호스트 포트·제품 공개/실결제 없음. 전용 테스트는 자체 UUID QA 계정/판매자/상품/중지 요청을 `finally`로 정리한다. 종료 시 임시 DB/컨테이너·QA 행·checkout SHA/clean을 확인한다.
- 미검증/다음: 현재는 승인/원격/WSL SHA와 로컬 정적·단위 검증까지만 완료. 격리 migration, 개발 DB 실제 적용, 판매중지 DB·HTTP·브라우저, 경쟁 조건과 S2.2 전체 검증은 아직 수행 전. migration 오류 시 실제 개발 DB 적용을 중단하고 원인·복구 경계를 기록한다.
- migration·회귀 실제 결과: `shoppingmall` 개발 DB의 읽기 전용 dry-run은 기존 6건 적용·대기 `0006_s2_product_sale_stop` 1건/7문장/SHA-256 `9ee2bd00d8e3e2131efeb80e4238c6d80ae03436874b5596ebdb2d7ee1c8d523`이었다. 전용 빈 DB `shoppingmall_s22_d7a1e0c2`에 0000~0006을 적용한 뒤 판매중지 실DB·HTTP 시험 **1 pass·0 skip·0 fail**, migration 7건과 QA 행 0을 확인하고 정확한 임시 DB를 제거했다. 개발 `shoppingmall`에는 승인된 0006만 적용해 migration 총 7건·신규 판매중지 행 0; 동일 실DB·HTTP 시험 **1 pass·0 skip·0 fail**. 전체 WSL DB 연결 회귀는 **181 tests/174 pass/7 skip/0 fail**이며 로컬 DB 미연결 32 skip과 구분한다. 사후 계정/판매자/분류/상품/개정/옵션/공개/이미지/판매중지/감사 각 0, `shoppingmall-s22-d7a1*` 일회성 컨테이너 0, 임시 DB 부재, WSL checkout `a765cc4` clean. 첫 read-only SQL의 따옴표 인용 오류 1회 후 재실행 성공; 제품 오류/동일 원인 3회 반복 없음. 실제 브라우저와 S2.2 전체 완료는 여전히 미검증이다.

## 진행 중 — 2026-09-29 S2.2 판매중지 역할별 실브라우저 QA

- 담당/대상: 어울 단일 writer. 지정 WSL checkout `a765cc47d5bd4a77007c353ae3494ff26593eed0`, `local-postgres/shoppingmall`의 승인된 migration 7건 상태를 사용한다. 기존 가상 공개 상품 fixture `QA_RUN_ID=d7a1e0c2`, 가상 고객/판매자 A·B/어울몰·관리자 5계정/3판매자와 공개 상품 1개만 시험 중 생성한다. 비밀번호는 가상 시험 전용이고 문서·Git에 남기지 않는다.
- 자원/절차: 시작 전 9091/9092 포트·전용 컨테이너·관련 DB 행 0을 대조한다. Node24 자동 제거 빌드/API/Web 컨테이너 접두사 `shoppingmall-s22-stop-d7a1`, `postgres_env_default` 네트워크와 기존 checkout, loopback 9091/9092, 새 브라우저 시험 탭 1개만 사용한다. 판매자 A로 판매중지 요청→승인 전 고객 공개 상태 유지→관리자 계정으로 반려/재요청 또는 승인→고객 검색 제외/상세 판매 가능 수량 0을 실제 UI에서 확인한다. 실결제·실상품/실계정 없음. 시험 후 탭·정확한 전용 컨테이너만 종료, 고유 fixture reset, DB 계정/판매자/상품/판매중지/감사·포트·checkout 잔류를 검사한다. 실패한 단계를 PASS로 승격하지 않는다.
- QA 정리 결함 조사/RED 계획: 신규 `product_sale_stop_requests`는 `products`·`accounts`에 `ON DELETE no action` 외래키를 가지는데 기존 `qa-public-fixture.ts`의 `resetPublicProduct`는 공개/재고/사진/옵션/개정/상품만 지우고 판매중지 요청은 누락한다. `qa-fixture.ts`는 이후 계정 감사·역할을 지우므로 상품 삭제 단계에서 FK로 실패할 가능성이 높다. 관련 외래키·기존 정리 순서를 코드와 생성 SQL로 대조했고 가설은 “해당 QA 상품의 중지 이력 삭제 누락”이다. 테스트 파일에 승인된 중지 이력을 만든 뒤 전체 fixture reset과 해당 상품/계정/감사 잔류 0을 단언했다. RED 실행은 현재 로컬 DB가 없으므로 안전 commit/push→동일 WSL SHA의 지정 개발 DB에서 단일 시험으로 확인한다. 실패 시 시험의 `finally`가 정확한 productId 중지 요청만 삭제하고 fixture reset을 다시 실행하도록 복구 경로를 둔다. 이후 최소 수정은 QA fixture의 동일 productId 삭제 순서만 추가하고 GREEN/전체 회귀/브라우저를 수행한다. 실제 사용자 상품·판매중지 이력 삭제는 금지.
- QA 정리 RED 증거/최소 수정: 시험·현황 commit `91645a8`를 SSH 원격과 지정 WSL checkout에 fast-forward한 뒤 `qa-public-fixture-db.test.mjs` 4건 중 기존 3 pass, 신규 1건이 예상대로 PostgreSQL `23503 product_sale_stop_requests_product_id_products_id_fk`에서 실패했다. 시험 `finally`의 정확한 productId 중지 요청 제거→fixture reset 뒤 계정/상품/중지/감사 `0/0/0/0` 확인. 같은 원인 오류는 의도한 RED 1회, 제품/환경 우발 오류 0. 테스트가 가설을 실제로 재현했으므로 `resetPublicProduct`가 자기 run으로 선택한 productId의 중지 요청을 상품 삭제 전에 먼저 삭제하는 한 줄만 추가했다. GREEN/전체 회귀·브라우저는 새 커밋의 WSL exact SHA에서 이어서 검증한다.

## 진행 중 — 2026-09-29 S2.2 기존 검증 커밋 사진 버튼 실브라우저 보강

- 담당/경계: 어울 단일 writer. 현 로컬 작업 브랜치 `codex/flat-v2-prototypes@11907da`는 원격보다 3커밋 앞서며 push가 자동 안전 검토에서 2회 거부됐다. 이 변경의 실DB 검증은 진행하지 않는다. 사진 버튼 코드는 이미 지정 WSL checkout의 깨끗한 `da56a39c6643f4ea22ba445604d7eaf8da888664`에 있으므로 그 **이전 커밋의 기존 코드만** 독립 시험한다. 새 변경의 통합 증거로 승격하지 않는다.
- QA 자원/사전 상태: `WSL-server`의 지정 `/home/daon/deploy/shopping`과 `local-postgres/shoppingmall`만 사용. 9091/9092 listener·전용 shoppingmall 컨테이너 0, accounts/sellers/products/product_images/audit_events `0/0/0/0/0`. 고유 `QA_RUN_ID=c9e2b6a4`의 기존 `qa-public-fixture.ts` 가상 고객/판매자/관리자 계정과 공개 상품 1개를 시험 중에만 생성한다. 전용 Node24 자동 제거 API/Web 컨테이너 `shoppingmall-s22-photo-api-c9e2`/`shoppingmall-s22-photo-web-c9e2`, 필요 시 동일 접두사의 build 컨테이너, 루프백 9091/9092, 전용 `/tmp/shoppingmall-upload-photo-c9e2b6a4` 저장소, 새 브라우저 시험 탭 1개만 사용한다. 테스트 비밀번호는 가상 계정 전용이며 Git/문서에는 쓰지 않는다.
- 시험/정리: 가상 판매자 A로 기존 공개 상품의 비공개 수정안 생성→기존 승인 사진과 무관한 비공개 시험 사진 업로드→사진 목록의 `사진 1 위로 이동`/`사진 1 아래로 이동`/`사진 1 제거` 접근성 이름, 필요하면 두 번째 사진으로 행별 이름·키보드 조작을 확인한다. 비공개 사진만 사용하고 실제 승인/고객 공개·실결제 없음. 종료 시 시험 탭·정확한 전용 컨테이너만 닫고 `QA_RUN_ID=c9e2b6a4` fixture reset, 전용 이미지 object key/저장소만 정리한다. 계정/판매자/분류/상품/개정/옵션/공개/이미지/감사 행과 포트·컨테이너 잔류 0, WSL checkout SHA/clean을 대조한다. 실패 시 수행된 범위와 오류 횟수를 추가 기록하고 미검증으로 남긴다.
- 실제 결과: 이전 WSL SHA `da56a39c6643f4ea22ba445604d7eaf8da888664`에서 Node 24 production 웹 빌드 0, API `/ready` 정상/웹 `/login` 200. QA `c9e2b6a4`의 공개 상품에 비공개 수정안과 PNG 업로드 2건을 만들고 판매자 시험 계정으로 실제 브라우저 로그인했다. 등록 사진 관리의 접근성 트리에서 1·2번 사진마다 위로/아래로/제거 버튼의 행별 이름과 양끝 이동 버튼의 비활성 상태를 확인했다. `사진 2 위로 이동`에 Enter를 입력하자 사진 순서가 바뀌고 버튼 이름도 현재 행 번호로 갱신됐으며, 다시 Enter로 원래 순서로 되돌렸다. 사진 제거·순서 저장·관리자 승인/고객 공개는 실행하지 않았다. 이는 이전 SHA의 사진 UI만 검증하며 로컬 판매중지 신규 코드의 통합/실DB/실브라우저 검증은 아니다.
- 자원 정리/오류: 새 시험 탭 종료, 정확한 QA API/Web 컨테이너 2개 stop/자동 제거, fixture `reset:true`, 전용 `/tmp/shoppingmall-upload-photo-c9e2b6a4`의 실제 경로와 사진 2개를 확인한 후 해당 폴더만 제거했다. 사후 account_identities/sellers/product_categories/products/product_revisions/product_options/product_publications/product_images/audit_events `0/0/0/0/0/0/0/0/0`, 전용 컨테이너·업로드 폴더 잔류 0, 로컬 9091/9092 포트 미응답, WSL checkout 구 SHA/clean. 경로 확인용 일회성 PowerShell→SSH 인용 오류 1회 후 읽기 전용 재확인에 성공했으며 제품 실패 아님·같은 근본 원인 반복 0. 새 판매중지 DB 시험은 원격 전송 게이트로 여전히 미검증이다.

## 진행 중 — 2026-09-29 S2.2 판매중지 요청·관리자 결정

- 담당/승인: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`. 신산님이 판매중지 신규 API와 `shoppingmall` 개발 DB 전용 테이블·마이그레이션을 각각 직접 승인. 기존 분리 worktree만 사용한다. Superpowers 계획 형식은 정본 `docs/WORK_PLAN.md`의 Stage 표와 다르므로 계획 추적은 PMO 지정 `WORK_STATUS.md`에 이어 적고 새 worktree나 중복 계획 파일은 만들지 않는다.
- 계약: 판매자는 자기 판매 상품의 사유 있는 판매중지를 요청하고 관리자 승인 전 공개·재고·구매 가능 수량이 그대로다. 반려 후 재요청은 가능하다. 관리자 승인 시 신규 목록에서 제외하고 상세의 판매 가능 수량은 0으로 표시한다. 공개 버전·물리 재고·과거 이력은 보존하며 승인된 중지의 재개방은 별도 정책 전까지 제공하지 않는다. 타 판매자·고객·권한 없는 결정·중복 대기/승인을 차단한다. 모든 요청·결정·감사 이력을 남긴다.
- 자원/수명: 로컬 D: 작업 worktree에서 파일·로컬 시험만 사용. DB RED/GREEN은 branch 안전 commit/push 뒤 지정 WSL checkout의 exact SHA에서 기존 `local-postgres/shoppingmall` 개발 DB와 자동 제거 Node 24 QA 컨테이너 하나를 사용한다. 전용 UUID QA 계정/판매자/상품·중지 요청은 시험 `finally`에서 ID별 제거하고 DB 행 수·컨테이너·checkout 잔류를 확인한다. 기존 타 프로젝트/운영 자료, Oracle, 외부 계정은 건드리지 않는다. migration은 먼저 읽기 전용 dry-run과 격리 적용 검증, 이후 승인된 정확한 개발 DB에만 적용한다.
- 변경/검증: `sale-stop-db.test.mjs`에 타 판매자·관리자 요청 거부, 빈 사유/중복, 요청·반려 중 공개 유지, 승인 뒤 목록 제외·상세 수량 0, 기존 재고·공개 버전 보존, 감사 4건/이력 격리를 먼저 명시. 로컬 첫 실행은 새 서비스 파일 부재로 예상 RED 1건. `product-sale-stops.ts`, catalog controller/public-products, Drizzle schema와 생성된 `0006_s2_product_sale_stop` migration을 작업 중. `pnpm typecheck` 0. Drizzle 생성 첫 시도는 도구 진입 실패 1회, 직접 실행은 D: sandbox EPERM 1회(제품 오류 아님), 허용된 동일 경로 재실행으로 SQL·snapshot·journal 생성 성공. 같은 근본 원인 3회 연속 없음.
- 미검증/다음: 실DB migration 및 RED→GREEN, HTTP 권한·Origin·이력, 판매자/관리자 화면, 전체 회귀/브라우저, 재고 증가·상품 개정과 중지의 교차 경합, S3 주문 견적에서의 최종 구매 재검증, 정식 WSL E2E·인수/Oracle은 아직 검증 전. 다음은 HTTP·화면 계약을 보강한 뒤 안전 commit/push, 격리 migration 시험→정식 개발 DB 적용·QA·정리한다. 승인된 판매중지 기능이 S2.2 전체 완료를 뜻하지 않는다.
- 로컬 checkpoint: 판매자·관리자 화면 단위시험은 각 계약 RED 뒤 합계 **15 pass·0 fail**. 루트 `pnpm test` **180건 중 148 pass·32 환경/DB skip·0 fail**, 별도 PR 본문 8 pass. 새 실DB 시험은 DB 미연결로 skip이므로 GREEN 증거가 아니다. `pnpm typecheck`·`pnpm lint` 0, `pnpm build` 첫 시도는 D: build 출력 EPERM 1회, 허용된 같은 경로 재실행 종료 코드 0/Next 12경로. 이후 DB 시험에 HTTP 401·Origin/타 판매자 403·관리자 목록/결정·공개 GET까지 추가했고 WSL 실DB에서 첫 실행을 기다린다. `git diff --check` 0; 제품 오류 0, 동일 원인 3회 반복 없음.
- 원격 게이트: 로컬 checkpoint `53638b5`를 현재 브랜치에 commit. 지정 SSH 원격은 `git@github-sinsan-develop:sinsan-develop/shoppingmall.git`, 로컬 branch는 원격보다 1 commit 앞섰고 WSL 지정 checkout은 깨끗한 구 SHA `da56a39`. `git push`는 자동 안전 검토가 외부 소스·migration 전송의 현재 사용자 승인을 확인할 수 없다며 2회 거부했다. 원격/계획 읽기 전용 대조 뒤 재시도도 같은 거부이며 제3경로·소스 복사·다른 계정으로 우회하지 않았다. 정확한 현재 branch push의 명시 허용 또는 안전 검토 환경 변경 전에는 WSL exact-SHA, 개발 DB migration·E2E를 수행하지 않는다. 제품 오류가 아니라 전송 권한 게이트다. 영향받지 않는 로컬 상품 화면 작업은 계속한다.
- 로컬 후속: 고객 상세에서 승인된 중지를 일반 품절과 구별하는 `saleStopped` 안내와 판매자 목록의 중지 상태 표기를 RED→GREEN으로 보강했다. `public-products.test.mjs` 11 pass, `seller-products.test.mjs` 9 pass. 파일 `apps/web/app/products/[productId]/page.tsx`, `apps/web/test/public-products.test.mjs`, `apps/web/app/account/seller/products/page.tsx`, `apps/web/test/seller-products.test.mjs`는 다음 로컬 checkpoint에 포함한다. 실DB/실브라우저 결과는 여전히 미검증.
- 후속 전체 로컬 검증: 고객 상세와 판매자 상태의 두 예상 RED를 고친 뒤 `pnpm test` **181건 중 149 pass·32 DB/환경 skip·0 fail**, 별도 PR 본문 8 pass, `pnpm typecheck`·`pnpm lint`·허용된 D: `pnpm build` 모두 종료 코드 0(Next 12경로). 이 검증은 실DB/WSL/UAT가 아니며, 단일 판매중지 DB 시험은 여전히 skip이다. 자동 안전 검토 push 거부의 정확한 승인 질문을 신산님께 비동기로 보냈고 답변을 기다리는 동안 로컬 가능한 검증을 마쳤다.
- 2026-09-29 후속 회귀 준비: 원격 전송을 재시도하지 않은 채 `sale-stop-db.test.mjs`에 중지 승인 이후 물리 재고 증가와 새 공개 개정의 두 교차 사례를 추가했다. 두 경우 모두 제품 단위 승인된 중지가 유지돼 신규 목록에서 제외되고 상세의 판매 가능 수량 0이어야 한다. 두 번째 개정은 테스트가 직접 생성·공개하므로 `ProductReviews.approve` 전체 흐름의 검증으로 주장하지 않는다. 변경은 전용 QA UUID의 `finally` 정리까지 확장했으며 실DB RED/GREEN은 push 승인·마이그레이션 전까지 미검증이다. 작업 브랜치 `f5039d6`에서 원격 ahead 2·작업 트리 변경 2파일; 같은 push 거부를 우회하지 않는다.

## 진행 중 — 2026-09-29 S2.2 판매자 상품 사진·옵션 반복 동작 이름

- 담당/범위: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`. 판매자 상품 초안의 사진마다 `위로`·`아래로`·`사진 제거`, 옵션마다 `옵션 제거`가 반복되어 화면낭독기 버튼 목록에서 대상 행을 구별하기 어렵다. 기존 표시 문구·DOM 버튼·기능·디자인은 유지하고 버튼의 접근 가능한 이름에 1부터 시작하는 행 번호만 추가한다. API/schema/DB/Secret/권한 변경 없음.
- TDD/검증: `apps/web/test/seller-products.test.mjs`에 사진 이동·제거와 옵션 제거의 행별 `aria-label` 구조 단언을 먼저 추가해 기존 8건 중 1건 의도한 RED, 이어 `apps/web/app/account/seller/products/page.tsx`의 두 옵션 양식과 사진 버튼 3종에 `aria-label` 추가 후 목표 8 pass·0 fail. 파일 diff·전체 test/typecheck/lint/build 및 WSL exact-SHA production 빌드/브라우저는 별도로 확인한다. 현 제품 오류 0, 의도한 RED 1회, 동일 근본 원인 반복 0. 사진 실제 삭제·재정렬/업로드는 이 변경의 시험 범위가 아니다.
- 로컬 결과: 두 옵션 양식 모두 같은 행별 이름을 갖도록 단언을 보강했다. 루트 `pnpm test` 종료 코드 0(로컬 DB/환경 시험 skip은 별도), `pnpm typecheck`·`pnpm lint` 0, 허용된 D: 경로 `pnpm build` 0/Next 12경로. 새 제품 오류 0. 실제 로그인 뒤 비공개 사진 목록의 화면낭독기 AX 이름은 사진이 있는 가상 초안 브라우저 환경을 별도 구성해야 하므로 이번 구조 시험을 그 증거로 승격하지 않는다. 다음은 안전 commit/push 및 지정 WSL exact-SHA build 후 QA 자원을 정리한다.
- WSL exact-SHA/정리: `c366d748bde402e957c83a6b4f3faea0739295aa`를 승인된 SSH 별칭으로 push→지정 checkout `git pull --ff-only` 동일 SHA·clean. 기존 Node 24 이미지의 자동 제거 `shoppingmall-s22-a11y-build-c366`에서 Next production 12경로 빌드 종료 코드 0. 전용 컨테이너 잔류 0, checkout clean·동일 SHA. QA 계정/DB 자료·호스트 포트는 만들지 않았다. 실제 판매자 로그인·사진 목록 AX/키보드 조작은 별도 시험이 필요하며 이 빌드로 통과 처리하지 않는다. 실행 오류·동일 근본 원인 반복 0.
- 실브라우저 QA 준비: 고유 ID `d6f2a71c`의 기존 `qa-public-fixture.ts`를 지정 `local-postgres/shoppingmall`에 시험 중에만 seed해 가상 계정 5개·판매자 3개·공개 상품 1개를 만든다. 판매자 A로 로그인→해당 상품의 비공개 수정안 생성→옵션 추가→행별 옵션 제거 이름/키보드 포커스를 AX에서 확인한다. 비공개 사진 버튼은 사진 자료를 실제 마련했을 때만 확인하고 이번 옵션 시험으로 증명하지 않는다. Node 24 자동 제거 API/Web `shoppingmall-s22-a11y-api-d6f2`/`shoppingmall-s22-a11y-web-d6f2`, loopback 9091/9092, 새 시험 브라우저 탭 1개만 사용한다. 시작 전 이름·포트·DB 0을 확인하고, 끝나면 탭/정확한 컨테이너 종료, 전용 ID fixture reset, DB·포트·checkout 잔류 0을 확인한다. 다른 프로젝트/운영 자료/실결제/실계정 없음. 실패해도 생성한 전용 자원만 정리하고 미검증으로 기록한다.
- 실제 화면/정리: 계획 기록 commit `da56a39c6643f4ea22ba445604d7eaf8da888664`를 WSL 지정 checkout에 fast-forward·clean, Node 24 API/Next production 12경로 build 0, 전용 API `/ready`·웹 `/login` 각 HTTP 200. 가상 판매자 A 로그인→기존 공개 상품의 비공개 수정안 생성→초안 수정에서 두 번째 옵션 추가 후 AX에 `옵션 1 제거`·`옵션 2 제거`가 각각 표시됨을 확인했다. `옵션 2 제거`에서 Enter를 누르자 해당 옵션이 사라졌다. 읽기 전용 DB에는 시험 중 version 1 `approved`, version 2 `draft`였고 공개 변경은 없다. 시험 탭 종료, 정확한 Web/API 두 컨테이너 stop/자동 제거, `QA_RUN_ID=d6f2a71c` public fixture reset. 사후 accounts/sellers/categories/products/revisions/options/publications/audit 8종 각 0행, 9091/9092 listener·전용 컨테이너 0, WSL checkout clean/동일 SHA. 실제 사진 업로드·사진별 버튼 AX/키보드와 전체 UAT는 미검증이다.
- QA 실행 오류/조치: 첫 API는 운영 모드로 띄워 개발 전용 수정안 경로가 의도대로 404로 닫혔다(시험 구성 오류 1). 루프백 개발 모드로 고친 뒤 전용 저장소 이름이 `ImageQuarantine` 규칙에 맞지 않아 수정안 거부(구성 오류 1); 코드의 요구 접두사 `shoppingmall-upload`로 고친 세 번째 환경에서 브라우저 동작을 확인했다. 읽기 전용 psql의 셸 인용 오류 2회는 값 없는 조회로 정정했고 DB 변경 없음. 같은 근본 원인의 연속 3회 실패는 없으며 제품 코드 결함으로 판정하지 않는다. 다음 작업에는 개발 전용 루프백·저장소 접두사 조건을 시작 체크리스트에 먼저 대조한다.

## 검증 완료 — 2026-09-29 S1.2 계정 자동 병합 금지·명시 연결 실DB 회귀

- 담당/범위: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`. 기존 S1 계정 계약에서 이메일 계정과 별도 휴대폰 가입 계정은 합쳐지지 않으며, 다른 계정의 번호 연결은 거부하고 미사용 번호만 현재 고객 계정에 명시 연결된다는 DB 회귀를 보강한다. 제품 API/schema/Secret/권한 코드는 변경하지 않는다.
- 변경/검증: `apps/api/test/auth-db.test.mjs`에 고유 QA 이메일과 두 가상 번호로 분리 가입·중복 연결 거부·명시 연결 후 로그인 계정 ID를 대조하는 시험을 추가했다. `DATABASE_URL` 없는 로컬 실행은 skip으로 명시한다. 안전 commit/push 후 지정 WSL checkout exact SHA의 `local-postgres/shoppingmall`에서 목표 시험 0 skip을 요구한다. 시험 계정·세션·감사 행은 `finally`로 각 정확한 account ID만 정리하고 사전/사후 DB 행 수를 비교한다. 별도 호스트 포트, 외부 계정, 운영 자료 없음. 현재 실행 오류·같은 원인 반복 0.
- 로컬 검사: `node --check`·`git diff --check` 0. 루트 `pnpm test` 176건 중 145 pass·31 DB/환경 skip·0 fail, 별도 PR 본문 8 pass·0 fail. 새 DB 시험은 로컬에서 skip이므로 통과 증거로 쓰지 않는다. `pnpm typecheck`와 `pnpm lint`는 각각 0. 첫 `pnpm build`는 D: `.next/trace` 쓰기 EPERM으로 종료 코드 1(제품 오류 아님), 허용된 같은 작업 경로에서 재실행한 빌드는 종료 코드 0·Next 12경로. 빌드 쓰기 권한 오류 1회, 동일 원인 반복 0. 다음은 안전 commit/push와 WSL exact-SHA 실DB 목표 시험이다.
- WSL 실DB 검증/정리: 시험·계획 commit `368ddd364e30bd3a517c6a06a48977ab76994b54`를 승인된 SSH 별칭으로 push하고 지정 WSL checkout을 `git pull --ff-only`해 동일 SHA·clean을 확인했다. 실행 전 accounts 관련 identities/sessions/audit `0/0/0`. Node 24 자동 제거 `shoppingmall-s12-authlink-368d`에서 실 `local-postgres/shoppingmall`을 연결해 `auth-db.test.mjs` **2 pass·0 skip·0 fail**, 종료 코드 0. 분리 전화 가입과 이메일 계정 ID 불일치, 다른 계정 번호 연결 거부, 미사용 번호 명시 연결 뒤 원래 이메일 계정으로 휴대폰 로그인됨을 단언했다. 종료 후 accounts/identities/sessions/audit `0/0/0/0`, 해당 컨테이너 잔류 0, WSL checkout clean·동일 SHA. 본 시험의 제품 오류·반복 원인 0. 외부 SMS 본인 확인·실계정 연결·전체 S1 인수는 이 시험으로 증명되지 않는다.
- 전체 회귀 보강: 현황 commit `79ba3b539e1ff930cbd46ddde7de6668277cd433`까지 WSL 지정 checkout을 fast-forward·clean, 공유 WSL 가용 5.0GiB와 기존 타 프로젝트 컨테이너를 확인한 뒤 전용 자동 제거 `shoppingmall-s1-auth-full-79ba` 하나로 실DB 전체 `node --import tsx --test`를 실행했다. **176건 중 169 pass·7 환경 skip·0 fail**, 종료 코드 0(약 95초). 사후 accounts/sellers/products/identities/sessions/audit 각 0행, 전용 컨테이너 잔류 0. ClamAV 실제 daemon 등 7 skip, GitHub CI 실제 job, 실브라우저/UAT는 이 결과에 포함하지 않는다. 전체 검증 오류·같은 원인 반복 0.

## 검증 완료 — 2026-09-29 S1.3 탈퇴 요청 확인의 안전한 키보드 기본 포커스

- 담당/근거: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`. 고객 탈퇴 요청은 운영 검토용 접수이며 실제 계정 삭제는 별개다. 현재 확인 단계의 위험한 `요청 접수 확인` 버튼에 `autoFocus`가 있어 Enter 재입력으로 의도치 않은 접수가 가능하다. 기존 기능/문구/서버 권한은 그대로 두고 자동 포커스만 `취소`로 이동한다. 이는 S1.3 UI 안전성·접근성 범위이며 제품 API/schema/DB/Secret 변경 없음.
- 검증 계획: 기존 `customer-profile.test.mjs`에 확인 버튼 자동 포커스 금지·취소 버튼 자동 포커스 RED를 먼저 작성하고, `deletion-request-controls.tsx`만 수정해 GREEN. 전체 로컬 test/typecheck/lint/build, 기존 WSL exact-SHA DB 시험 및 가상 고객 실브라우저 흐름은 별도 범위로 구분한다. 적용 전/후 diff, 실패 횟수·미검증·rollback은 아래에 기록한다. 현재 오류/같은 원인 반복 0.
- RED→GREEN/변경 전후: 기존 HTML은 확인 버튼 `autofocus`이며 취소 버튼은 포커스 없음. 이 상태에서 새 목표 시험 2건 중 1건 실패(예상 RED)했고, 컴포넌트의 `autoFocus` 속성만 확인→취소로 옮기자 2 pass·0 skip·0 fail. 변경 파일 `deletion-request-controls.tsx`와 `customer-profile.test.mjs`, 현황. 기존 탈퇴 접수 API·문구·권한은 변경하지 않았다. 로컬 전체 `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` 각각 종료 코드 0(Next 12경로); 로컬 DB skip은 별도 유지. 실행 오류 0, 같은 원인 반복 0.
- 실브라우저 QA 계획: 안전 commit/push→지정 WSL checkout 동일 SHA. 고유 QA ID `f09a82c1`의 `qa+…@example.invalid` 5가상 계정/3판매자만 기존 `qa-fixture.ts`로 `local-postgres/shoppingmall`에 시험 중 생성하고, Node 24 자동 제거 build/API/Web `shoppingmall-s13-focus-build-f09a`/`shoppingmall-s13-focus-api-f09a`/`shoppingmall-s13-focus-web-f09a`, loopback 9091/9092, 새 in-app browser 시험 탭 1개를 쓴다. 사전 정확한 이름·포트/DB 0 확인. 가상 고객 로그인→탈퇴 요청 접수→초점 취소→Enter 취소→DB account_deletion_requests 0을 확인한다. **실제 가상 계정 삭제/탈퇴 처리하지 않음**. 끝나면 탭/두 컨테이너만 종료하고 ID `f09a82c1`만 reset, DB 계정/탈퇴 요청/audit·포트·컨테이너/checkout 잔류 0 확인. 비밀번호/DB URL 출력·문서화 금지, 다른 서비스 변경 없음.
- 실제 브라우저/DB 결과: WSL 지정 checkout과 원격 작업 브랜치가 `21c5325744184172acf5ae1e67d182a2ff502c66`으로 일치한 상태에서 Node 24 API/Next production 빌드, `/ready`·`/login` HTTP 200을 확인했다. 가상 고객 로그인 후 `탈퇴 요청 접수`를 눌렀을 때 AX 포커스는 `취소` 버튼이었다. Enter를 누르자 확인 단계가 닫혔고, 즉시 DB `account_deletion_requests`는 0건이었다. 실제 탈퇴 요청/계정 삭제는 하지 않았다. 시험 탭을 닫고 정확한 QA Web/API 두 컨테이너만 stop하여 자동 제거, `QA_RUN_ID=f09a82c1` fixture reset은 `accounts:5`를 반환했다. 사후 account_identities/sellers/account_deletion_requests/audit_events는 `0/0/0/0`이었다. 이 결과는 확인 단계의 기본 키보드 동작과 시험 요청 부재를 증명하며 운영 탈퇴 처리나 전 화면 접근성·UAT를 증명하지 않는다. 실행 오류 0, 같은 원인 반복 0.

## 진행 중 — 2026-09-29 S2.4 공통 키보드 본문 건너뛰기

- 담당/근거: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`. 승인된 실제 제품 접근성 점검에서 모든 구매자/판매자/운영자 화면에 `<main>`은 있으나 첫 키보드 포커스로 헤더/검색·메뉴를 건너뛸 공통 링크가 없음을 확인했다. 사용한 `web-design-guidelines`의 현행 규칙은 skip link와 가시적인 focus 상태를 요구한다. React 성능 스킬 기준에서는 기존 서버 layout의 정적 링크만 쓰며 새 클라이언트 상태/번들을 만들지 않는다.
- 변경 계약: `apps/web/app/layout.tsx`의 body 첫 요소에 `본문으로 건너뛰기` 앵커→`#main-content`, 화면 11개의 기존 `<main>`에 같은 id와 프로그램 포커스 대상 `tabIndex={-1}`만 추가한다. `styles.css`에는 평소 화면 밖·포커스 시 화면 안의 고대비 링크 스타일을 추가한다. RED 구조/렌더 시험→GREEN, typecheck/lint/build·제품 키보드 실제 확인을 순서대로 수행한다. 제품 API/schema/권한·DB/Secret/비용 영향 없음. 기존 헤더·본문 의미 구조 보존, 문제 시 이 commit 변경만 되돌릴 수 있다. 오류/동일 근본 원인 반복 현재 0.
- RED→GREEN 및 로컬: 새 `skip-navigation.test.mjs`의 첫 실행은 Next RootLayout의 CSS import를 Node 직접 import해 시험 하네스 `ERR_UNKNOWN_FILE_EXTENSION` 1회가 발생했다. 제품 실패가 아니어서 동일 파일의 정적 구조 검사로 고쳤고, 그 후 `body` 첫 skip link 부재를 예상대로 RED(exit 1) 확인했다. 정적 링크/11개 main target/포커스 시 보이는 CSS만 추가하자 목표 시험 **1 pass·0 skip·0 fail**. 로컬 전체 `pnpm test` 종료 코드 0(DB 미연결 skip 별도), PR 본문 8 pass, `pnpm typecheck`·`pnpm lint`·권한 허용 `pnpm build` 각각 0/Next 12경로. 첫 시험 하네스 오류 1회, 동일 원인 반복 0. 실제 브라우저 Tab→링크 표시→Enter→본문 포커스는 아직 미검증이며 WSL exact SHA에서 이어서 확인한다.
- 실브라우저 QA 자원: 단일 작업 브랜치의 안전 commit/push→WSL 지정 checkout `git pull --ff-only` 동일 SHA, Node 24 자동 제거 웹 빌드 `shoppingmall-s24-skip-build-7f48` 및 loopback 9091 자동 제거 웹 `shoppingmall-s24-skip-web-7f48`, 새 in-app browser 임시 탭 1개만 사용한다. DB 계정/상품 seed·API/9092·기존 사용자 탭 없음. 시작 전 전용 이름·포트·DB accounts/products 0, 종료 시 새 탭/웹 컨테이너만 닫고 포트·DB·checkout 잔류를 확인한다. 브라우저에서 첫 Tab 링크 표시→Enter 후 본문 목표, 다른 역할 URL에서도 첫 링크 존재를 검사한다. 인쇄·200% 배율/전체 UAT는 범위 밖이다.
- 실브라우저 결과/정리: 제품 commit `7f48e24`와 QA 계획 commit `649900eeb3bdcb6c509f88de07892d31dad08f8d`를 SSH push→WSL 지정 checkout 동일 SHA로 fast-forward·clean. Node 24 Next 12경로 빌드 0, 임시 웹 `/` HTTP 200. 새 in-app browser 탭 홈에서 첫 Tab 후 AX 포커스가 `본문으로 건너뛰기`, DOM의 활성 요소 top `12px`로 화면 안 표시를 확인했다. Enter 후 URL hash `#main-content`, `document.activeElement.id=main-content`, `<main>` 한 개. `/login`과 `/account/admin/proposals`의 AX에도 같은 링크와 본문 대상이 있었다. 이 두 화면은 API 미기동의 오류/권한 없음 상태만 보았고 실제 인증/판매자 업무를 재시험한 것은 아니다. 임시 탭 닫음, 정확한 웹 컨테이너 stop/`--rm`·9091 HTTP 미응답·DB accounts/products 0·WSL checkout clean. 작업 오류 1회(초기 CSS import 시험 하네스) 이후 재발 0, 3회 동일 원인 없음. 실제 200%·인쇄·전체 접근성/UAT는 별도 미검증.

## 진행 중 — 2026-09-29 S2.1 전국 산지 비제한 상품 초안 회귀

- 담당/목적: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`. 신산님이 지역은 브랜드 표현일 뿐 상품 등록의 내부 제한이 없다고 결정한 계약을 기존 상품 초안 실DB 시험에서 명시한다. 현 QA 초안의 모호한 `전국 어느 산지` 대신 경남 밖 시험 산지 `강원 양양`을 사용하고 DB `origin_label` 보존을 단언한다. 제품 code/schema/API/권한 변경 없음.
- 자원/검증: 기존 `product-drafts-db.test.mjs`의 고유 QA ID·`finally` 정리만 재사용. 기록 commit/push→지정 WSL checkout 동일 SHA의 Node 24 자동 제거 `shoppingmall-s21-origin-qa`에서 실 `local-postgres/shoppingmall` 연결 목표 시험 0 skip, 사전/사후 QA 계정·상품·개정·분류/감사·컨테이너 0 확인. 운영·Oracle/타 서비스와 host port 변경 없음. 실제 여러 지역 전체의 정책/상품 사진 승인은 별도 검증으로 남긴다. 오류·동일 근본 원인 반복 현재 0.
- 결과/정리: 구문·diff check 0, 테스트/현황 commit `03c684725bcf45e8c53721b254115808f61e0ed2` SSH push→WSL 동일 SHA fast-forward·clean. 기존 DB 시험은 `강원 양양` 산지를 입력하고 `origin_label`이 그대로 저장됐는지 대조한다. Node 24 실DB 목표 시험 **1 pass·0 skip·0 fail**, 종료 코드 0. 사전/사후 account_identities/products/product_revisions/product_categories/audit_events 각 `0/0/0/0/0`, 해당 QA 컨테이너 `--rm` 잔류 0, WSL checkout clean. 제품/API/schema 변경 없음, 실행 오류·같은 원인 반복 0. 이는 지역 비제한 샘플 한 건의 증거이지 전국 모든 상품이나 실제 승인/인수 증거가 아니다.

## 진행 중 — 2026-09-29 S2.1 소분류 유효성 실DB·HTTP 보강

- 담당/범위: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`. S2.1의 부모 없는 자식·빈 이름·같은 부모 중복 차단을 기존 분류 등록 DB/HTTP 시험에 명시한다. 기존 `catalog-http-db.test.mjs`의 무작위 QA 계정·분류 ID와 `finally` 정리를 재사용한다. 제품 code/schema/API/권한 변경 없음. 불변 계약 예상: 미존재 부모 400, 빈 소분류명 400, 같은 부모·이름 중복 409, 성공 행/감사 기록 수 불변.
- 자원/검증: 기록 commit/push 후 지정 WSL checkout을 동일 SHA로 fast-forward, Node 24 자동 제거 `shoppingmall-s21-minor-qa`로 `local-postgres/shoppingmall` 연결 목표 시험을 실행한다. 사전 전용 이름과 accounts/categories 0을 확인하며 호스트 포트·새 DB·운영 자료 없음. 시험은 자체 QA ID만 삭제한다. 사후 QA 계정/분류/감사·컨테이너·checkout 잔류 0을 확인한다. 오류/동일 근본 원인 반복 현재 0.
- 검증/정리: 변경 파일은 기존 `apps/api/test/catalog-http-db.test.mjs`의 경계 주장 3개와 현황뿐이다. 구문·diff check 0, 브랜치 commit `16b3edd8c599cfa6fcf3570a512f8213e9669610` SSH 원격 push→지정 WSL checkout 동일 SHA fast-forward. WSL 실DB HTTP 목표 시험 **1 pass·0 skip·0 fail**, 종료 코드 0. 미존재 부모·빈 이름 400, 같은 부모 중복 409를 확인했다. 실행 전/후 account_identities/product_categories/audit_events 각각 `0/0/0`, 전용 컨테이너 `--rm` 제거·잔류 0, WSL checkout clean. 제품 변경/DB schema 변경 없음, 테스트 실행 오류 0·동일 근본 원인 반복 0. 분류 이동/과거 주문 스냅샷은 주문 기능 이후 별도 확인하며 S2 전체 완료로 표시하지 않는다.

## 진행 중 — 2026-09-29 S2.4 Chrome 실제 200% 확대 재검증

- 담당/목적: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`. 과거 in-app browser에서는 키보드 확대가 배율을 바꾸지 않아 200%를 미검증으로 남겼다. 이번에는 기존 Chrome의 사용자 탭을 건드리지 않고 **새 시험 탭 하나**에서 실제 브라우저 확대 명령 및 현재 배율 신호를 확인한다. 배율이 실제 200%가 되지 않으면 viewport 축소를 대리 증거로 쓰지 않고 미검증을 유지한다. 제품 code/schema/API/DB 변경 없음.
- 자원/수명: 지정 WSL checkout을 안전 commit/push 후 동일 SHA로 fast-forward하고 Node 24 자동 제거 웹 빌드 컨테이너 `shoppingmall-s24-zoom-build-20260929`, loopback 9091의 자동 제거 웹 `shoppingmall-s24-zoom-web-20260929`만 사용한다. QA DB seed·API/9092·사용자 탭·Oracle/운영 자료는 건드리지 않는다. 시작 전 전용 이름/포트/checkout과 DB accounts/products 0을 확인한다. 종료 시 시험 탭을 닫고 배율이 변했다면 원래 값으로 복원, 해당 웹 컨테이너만 stop/remove, 포트/DB/checkout 잔류를 확인한다. 오류·같은 근본 원인 반복 현재 0.
- 실행/판정: 기록 commit `91abaed`를 WSL checkout에 fast-forward·clean, Node 24 exact-SHA Next 12경로 빌드 0, 임시 웹 `/` HTTP 200. 기존 사용자 Chrome 탭과 분리한 새 탭의 100% 기준 `devicePixelRatio=1`, `innerWidth=1928`, `clientWidth=scrollWidth=1913`을 측정했다. CUA의 `ctrl+plus`와 `ctrl+equal`을 각 1회 보냈으나 두 번 모두 dpr=1/폭 동일, 접근성 트리 변화도 없었다. 따라서 **실제 200% 확대 검증 미달**이며 640px viewport 시험을 그 증거로 대체하지 않는다. 같은 입력 경로의 실패 2회에서 재시도를 멈췄다. 확대가 적용되지 않아 복원할 배율 변경은 없었다.
- 정리/다음: 새 시험 탭 종료, 정확한 `shoppingmall-s24-zoom-web-20260929`만 stop/`--rm` 제거, 해당 이름 컨테이너 0·9091 HTTP 미응답, DB accounts/products 각 0, 지정 WSL checkout `91abaed` clean. 사용자 탭·DB 자료·Oracle에는 영향 없음. 실제 200%는 사용자 수동 Chrome 배율 또는 별도 신뢰 가능한 브라우저 제어 경로로 후속 확인한다. 이번 실패는 제품의 200% 레이아웃 결함을 증명하지도 않는다. 오류/동일 원인 반복 2회, 3회 중단 기준 미도달.

## 진행 중 — 2026-09-29 S2.2 심사 사진 누락의 관리자 실브라우저 차단 QA

- 준비 실패/원인 1회: exact SHA `0caf103`의 QA 빌드·가상 자료 seed·Web/API 기동과 readiness 200까지 확인했으나, 실화면 시험 직전에 비공개 사진 게이트가 `NODE_ENV=production`에서 닫히고 fixture의 `quarantine/qa-...` 키가 `ImageQuarantine`의 UUID `.webp` 계약과 맞지 않음을 코드로 확인했다. 이 구성으로는 실제 파일 누락을 검증할 수 없다. 해당 Web/API 두 컨테이너만 중지하고 정확한 `QA_RUN_ID=a41f7c92`를 reset했다. read-only 재확인에서 products·account_identities 각 0, QA 컨테이너 0. 제품 사진 게이트는 변경하지 않고 fixture 키를 계약에 맞게 RED→GREEN 검증한 후 개발 전용 비공개 미리보기 설정으로 재시험한다. 현재 실제 브라우저 결과·파일 누락 판정 없음, 동일 근본 원인 반복 0.
- 회귀 RED: `99581eb`를 WSL checkout에 fast-forward한 후 실제 DB 연결 `qa-review-fixture-db.test.mjs` 1건이 예상대로 실패(exit 1)했다. 실제 값 `quarantine/qa-…-metadata-only`가 이미지 저장소의 UUID `.webp` 형식과 불일치했다. 시험 자체의 `finally` 정리 뒤 QA ID를 포함한 기존 사용자 자료 변경은 없다. 이어 fixture 생성 키만 UUID 형식으로 변경해 GREEN을 확인한다.
- 회귀 GREEN·실브라우저 결과: fixture만 수정한 `bd0eedf`에서 로컬 test 구문·typecheck·diff check 종료 코드 0, WSL 동일 SHA/실DB의 목표 시험 **1 pass·0 skip·0 fail**. Node 24 임시 빌드에서 API/Next 12경로 빌드 종료 코드 0, QA 가상 ID `a41f7c92` seed 후 loopback `/ready`·`/login` HTTP 200. `NODE_ENV=development`·loopback API·`ENABLE_LOCAL_UPLOAD=1`·유효한 전용 절대 경로로 비공개 사진 게이트를 시험 전용으로 열고, 웹에는 loopback API 주소를 빌드 시 주입했다. 가상 운영자로 브라우저 로그인→`qa-a41f7c92-review-chili` 심사 화면→`심사 사진 보기`에서 **`이미지를 불러오지 못했습니다`** 표시, **`상품 승인` 버튼 없음**을 확인했다. DB 읽기에서 그 유일한 개정은 `pending`, product_publications 0. 실제 이미지 파일/악성코드 검사기 정상 처리·승인 성공은 이 시험으로 증명하지 않는다.
- 재부팅 이후 정리: 브라우저 시험 탭과 정확한 `shoppingmall-s22-missing-web-a41f`/`shoppingmall-s22-missing-api-a41f`는 재부팅 전 종료했고, 재부팅 뒤 지정 WSL checkout `bd0eedf` clean·해당 컨테이너 0·API 9092 미응답을 재확인했다. 정확한 `QA_RUN_ID=a41f7c92`만 fixture reset했다. 사후 accounts/sellers/products/revisions/images/publications/audit 각 `0/0/0/0/0/0/0`, 해당 컨테이너 0, 웹 9091 미응답, WSL checkout clean. 읽기 전용 SQL의 `audit_logs` 오기 1회와 인용 오류 1회는 정확한 `audit_events` 명칭·쿼리로 재확인했으며 자료 변경 없음, 동일 근본 원인 3회 반복 없음. S2 전체/사용자 인수/Oracle/GitHub CI 검증이 아니라 사진 누락 화면 경계만 확인한 것이다. 다음은 계획 순서의 남은 S1/S2 항목이다.
- 재부팅 뒤 전체 회귀: 기록 commit `4569ce3`을 지정 WSL checkout에 fast-forward해 같은 SHA의 Node 24 자동 제거 컨테이너 `shoppingmall-full-regression-4569`에서 루트 `node --test-concurrency=1 --import tsx --test`를 실 `local-postgres/shoppingmall` 연결로 실행했다. **174건 중 167 pass·7 환경 skip·0 fail**, 종료 코드 0. 앞선 API·웹·계약 부분집합은 130건 중 123 pass·7 skip·0 fail이었으며 전체 증거로 대체하지 않는다. 사후 accounts/products/revisions/images/audit 각 0, 시험 컨테이너는 `--rm`으로 제거. DB·브라우저·실공급자/Oracle 인수는 각각 별도 경계다.
- 로컬 동일 작업 HEAD 정적 게이트: `pnpm test` 종료 코드 0(174건 중 DB 미연결 등 30 skip·0 fail, PR 본문 8 pass), `pnpm typecheck`·`pnpm lint` 각각 0. 첫 `pnpm build`는 D: worktree 출력 파일 쓰기 샌드박스 `EPERM`으로 중단됐고, 같은 명령을 해당 경로 쓰기 권한으로 재실행해 API tsc·Next 12경로 build 종료 코드 0을 확인했다. 제품 실패가 아니라 실행 권한 경계였으며 동일 원인 반복 0. 이 증거는 실 DB·browser·UAT를 대신하지 않는다.
- ClamAV 실시험 가용성 조사: WSL에 `clamav/clamav-debian:1.4.3` 이미지는 있으나 실행 중인 scanner/3310 listener는 없다. 공유 WSL에는 다른 프로젝트 컨테이너가 다수 실행 중이고 조사 시점 가용 메모리 약 4.3Gi·swap 사용 약 4.8Gi였다. 이미지 존재만으로 `CLAMD_INTEGRATION=1` 시험을 실행/통과했다고 보지 않는다. 공유 서비스의 안정성을 위해 별도 ClamAV 컨테이너는 기동하지 않았고 실제 악성 패턴 차단은 미검증으로 유지한다. 타 서비스 중지·설정/데이터 변경 없음.

- 담당/목적: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`의 이미 승인된 사진 공개 게이트를 실제 관리자 화면에서 검증한다. 변경할 제품 code/schema/API/권한 없음. 기존 `qa-review-fixture.ts`는 메타데이터 전용 `quarantine/qa-*` 대표 사진 행만 만들며 실제 이미지 파일을 생성하지 않는다. 예상은 가상 관리자 로그인→대기 상품→`심사 사진 보기`→비공개 미리보기 실패 안내, `상품 승인` 버튼 비노출, 공개 publication 0·pending 유지다. 사진 검사기 자체 중단/복구와 성공 승인은 이 fixture로 증명하지 않는다.
- 자원/수명: 고유 QA ID `a41f7c92` 가상 계정 5개·판매자 3개·대기 상품 1개·사진 메타데이터 1행을 정확한 `WSL-server`의 `local-postgres/shoppingmall`에 시험 중에만 생성한다. Node 24 자동 제거 빌드 `shoppingmall-s22-missing-build-a41f`, loopback 9091/9092 API/Web `shoppingmall-s22-missing-api-a41f`/`shoppingmall-s22-missing-web-a41f`, 새 in-app browser 시험 탭 1개만 사용한다. 소유 어울, 수명 이번 화면 시험까지. 시작 전 DB·이름·포트 상태를 읽고 exact SHA build/seed 후 시험한다. 종료 시 탭/정확한 두 컨테이너만 닫고 `a41f7c92` fixture만 reset한 뒤 accounts/products/revisions/images/audit·컨테이너/포트/checkout 잔류 0을 확인한다. 실제 계정·사진·결제·Oracle/운영 자료 없음, 비밀값 원문 비기록. 현재 오류 0·반복 근본 원인 0.

## 진행 중 — 2026-09-29 S1.2 한 계정의 판매자·관리자 HTTP 권한 분리

- 담당/계약: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`. S1.2 필수 조건인 동일인의 판매자 세션으로 관리자 업무 불가와 반대 방향을 실DB·HTTP에서 명시 검증한다. 기존 `seller-login-db.test.mjs`의 고유 QA fixture/정리와 운영자 계정에 판매자 A/B grant를 부여하는 절차를 재사용한다. 동일 계정의 검증된 관리자·판매자 A 토큰으로 각각 자기 경로 200, 반대 역할 경로 403을 `x-role` 위조 헤더와 함께 확인한다. 제품 code/schema/API/권한 변경 없음.
- 자원/순서: 기존 브랜치에 시험·현황을 안전 commit/push하고 지정 WSL checkout 동일 SHA에서 `local-postgres/shoppingmall`에 연결한다. Node 24 자동 제거 컨테이너 `shoppingmall-s12-multirole-qa` 하나로 목표·전체 시험을 각각 실행한다(동시 실행 아님). 소유 어울, 이번 두 시험 명령 동안만, 새 DB·볼륨·호스트 포트 없음. 시험은 새 `qa+…@example.invalid` 5계정/3판매자를 고유 무작위 ID로 만들고 `finally`에서 그 ID만 reset한다. 실행 전 이름 점유/DB 행, 종료 후 accounts/sellers/sessions/audit·컨테이너/checkout 잔류 0을 확인한다. 비밀값은 출력하지 않는다. 실제 브라우저에서 한 사람이 역할을 전환하는 동선은 이 DB+HTTP 시험 범위 밖이며, 앞선 별개 계정의 역할별 화면 QA와 혼동하지 않는다. 현재 오류 0·같은 근본 원인 반복 0.
- 실행 결과: 시험/현황 commit `5be570c3174efc2b4f48f3ac940d87e227ea1956`를 SSH 별칭 원격 push→지정 WSL checkout fast-forward했다. 구문·typecheck·diff check 종료 코드 0, 로컬 전체 174건 중 144 pass·30 DB/환경 skip·0 fail 및 PR 본문 8 pass. WSL exact SHA에서 동일 관리자 계정의 관리자·판매자 A 토큰을 사용해 자기 역할 HTTP 200과 서로 반대 역할 HTTP 403을 각각 확인한 목표 시험 **1 pass·0 fail·0 skip**. 이어 전체 DB 연결 시험 **174건 중 167 pass·7 환경 skip·0 fail**, 종료 코드 0. 사전 accounts/sellers/sessions/audit `0/0/0/0`, 사후 accounts/sellers/seller_categories/sessions/audit `0/0/0/0/0`, 정확한 `shoppingmall-s12-multirole-qa` 컨테이너 0, WSL checkout clean·동일 SHA. 실제 한 사람의 브라우저 역할 전환·다른 API 전수·S1 Stage PR/인수는 이 증거 밖이다. 실행 오류 0, 반복 근본 원인 오류 0.

## 진행 중 — 2026-09-29 S1.2 만료 세션 실DB·HTTP 경계 재검증

- 담당/목적: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`. S1.2 계획의 세션 만료 거부는 `AuthRepository.getSession`에서 구현돼 있지만 실제 DB+HTTP의 독립 회귀 증거가 없었다. 기존 `apps/api/test/auth-http-db.test.mjs`의 고유 가상 계정과 `finally` 정리를 재사용해, 정상 세션 `/auth/me` 200을 먼저 확인한 뒤 **그 시험 계정의 유일한 활성 세션만** 과거 시각으로 만료시키고 `/auth/me`·판매자·관리자 API가 401인지 검사한다. 이는 이미 구현된 행동의 검증 보강이며 제품 code/schema/권한/API를 변경하지 않는다.
- 시험 자원: 변경 테스트를 기존 브랜치에 안전 commit/push하고 지정 WSL checkout 동일 SHA에서 기존 `local-postgres/shoppingmall`을 연결한 Node 24 자동 제거 `shoppingmall-s12-expiry-qa` 컨테이너 한 개로 목표 시험과 전체 DB suite를 실행한다. 소유 어울, 수명 해당 명령 동안만, 새 DB·볼륨·호스트 포트 없음. 시험의 `qa+UUID@example.invalid` 계정은 `finally`에서 정확한 accountId만 정리하며, 사후 accounts/sessions/audit·컨테이너/checkout 잔류 0을 확인한다. 실행 전 이름 점유와 DB 행을 확인하고 비밀값은 원격 프로세스 환경에만 공급한다. 현재 오류 0·반복 근본 원인 0.
- 경계: DB 미설정 로컬 skip은 합격 증거가 아니며 WSL 목표 시험이 실제 0 skip으로 끝나야 한다. 이미 구현된 만료 판정의 확인이므로 신규 제품 코드 RED/GREEN 변경은 없다. 브라우저의 세션 시간 경과, 실제 외부 로그인·Oracle 인수까지 증명하지 않는다.
- 실행 결과: 시험/현황 commit `6a5cffaec25190c8a8d82d87738815985cc242a2`를 SSH 별칭 push→지정 WSL checkout fast-forward했다. 추가 시험은 정상 세션 `/auth/me` 200, 시험 계정의 활성 세션 1개를 DB에서 과거 시각으로 만료한 뒤 `/auth/me`·판매자 상품·관리자 검토 API 각 401을 확인한다. 로컬 `node --check`·typecheck·diff check 종료 코드 0, 로컬 전체 174건 중 144 pass·30 DB/환경 skip·0 fail 및 PR 본문 8 pass. WSL exact SHA의 목표 HTTP+DB 시험 **1 pass·0 fail·0 skip**, 전체 DB 연결 시험 **174건 중 167 pass·7 환경 skip·0 fail**, 각 종료 코드 0. 사전 DB accounts/sessions/audit `0/0/0`, 사후 accounts/sessions/audit/sellers `0/0/0/0`, 정확한 `shoppingmall-s12-expiry-qa` 컨테이너 0, WSL checkout clean·동일 SHA. 실제 시간 경과 브라우저·외부 인증·S1 Stage PR/CI와 전체 인수는 미검증이다. 이 작업 실행 오류 0·동일 근본 원인 반복 0.

## 진행 중 — 2026-09-29 S1.2 역할별 실제 브라우저 경계 QA 준비

- 담당/목적: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`의 현재 기능 commit. S1.2 자동 권한 회귀와 별도로 고객·판매자·관리자 로그인 화면 및 다른 역할 URL의 권한 없음 표시를 실제 브라우저에서 확인한다. 제품/schema/API/권한 코드는 바꾸지 않는다. 판매중지 DB 범위 응답과 독립적인 기존 기능 QA다.
- 사전 읽기 전용 확인: 지정 WSL checkout `63cc3ce` clean, 원격 작업 브랜치는 이 기록 시점 `19263b2`이고 차이는 현황 문서뿐이다. `local-postgres/shoppingmall` accounts/sellers/products/revisions/images/audit 각 0행, 9091/9092 listener 0. 기존 DB 네트워크 `postgres_env_default`와 Node 24 이미지가 있으며 타 프로젝트 컨테이너는 유지한다.
- QA 자원/수명: 고유 `QA_RUN_ID=c834ad10`의 `qa+…@example.invalid` 가상 계정 5개(고객·판매자 A/B·어울몰 판매자·관리자)와 판매자 3개를 기존 `qa-fixture.ts`로 정확한 개발 DB에 시험 중에만 생성한다. 저장소의 같은 SHA를 Web/API 빌드하기 위한 자동 제거 `shoppingmall-s12-role-build-c834`, loopback 9091/9092의 자동 제거 API/Web `shoppingmall-s12-role-api-c834`·`shoppingmall-s12-role-web-c834`, 새 시험 브라우저 탭 1개만 쓴다. 실제 계정·결제·상품 없음. 시작 직전 이름·포트·DB 빈 상태를 다시 확인하고, 끝나면 시험 탭/정확한 두 실행 컨테이너만 종료하고 `c834ad10`만 reset하여 accounts/sellers/audit·포트/컨테이너/checkout 잔류 0을 확인한다. 시험 자격정보 원문은 기록하지 않는다. 오류·동일 근본 원인 반복 현재 0.
- 목표/미검증: 세 역할 각각 자기 화면 접근, 고객이 판매자/관리자 URL로 직접 진입 불가, 판매자가 관리자 URL로 직접 진입 불가, 로그아웃 후 비공개 자료 비노출을 브라우저 화면과 API/DB로 대조한다. 브라우저 환경에서 막히면 그 범위는 미검증으로 남기며 자동 시험을 실제 화면 증거로 승격하지 않는다.
- 실제 브라우저 결과: exact SHA `b0e50da494dc1c86dbac1a247ae8fa1632c8d759`의 WSL API·Next production build exit 0, `/ready`와 `/login` HTTP 200. 새 in-app browser 시험 탭에서 가상 고객 로그인→고객 배송지·알림 화면 표시, 직접 관리자/판매자 URL 각각 역할 로그인 안내로 비공개 자료 차단, 로그아웃 확인. 판매자 A 로그인→자기 상품 화면 표시, 관리자 검토 URL 역할 로그인 안내, 로그아웃 확인. 관리자 로그인→상품 요청 검토 화면 표시, 고객/판매자 URL 각각 역할 로그인 안내, 로그아웃 뒤 관리자 검토 URL 역할 로그인 안내를 확인했다. 이 검증은 브라우저 화면 동선이며 타 판매자 IDOR·실주문·모바일/200%·인쇄·Oracle 인수 증거가 아니다.
- PC 재부팅/정리: 시험 탭은 이미 닫혔다. 재부팅 후 읽기 전용 확인에서 정확한 QA Web/API 두 컨테이너와 accounts/sellers/audit `5/3/6`이 남아 있었다. 이름을 재확인한 두 컨테이너만 `docker stop`하여 `--rm` 제거하고 정확한 `QA_RUN_ID=c834ad10`에만 기존 fixture reset을 실행해 `accounts:5` 정리했다. 사후 accounts/sellers/seller_categories/auth_sessions/audit 각 0행, 해당 build/API/Web 컨테이너와 9091/9092 listener 0, WSL checkout clean·동일 SHA. 실제 제품 기능 오류 0, 반복 근본 원인 오류 0. 다음은 남은 S1/S2 계획 항목이며 GitHub CI 실제 job과 판매중지 DB 계약은 계속 미확정이다.

## 진행 중 — 2026-09-29 S2.2 판매중지 API 승인·기준선 동기화

- 담당/범위: 어울 단일 writer, 기존 `codex/flat-v2-prototypes` worktree. 신산님이 판매자 요청→관리자 승인/반려→승인 시 신규 구매 차단의 권장안에 필요한 새 API 추가를 직접 승인했다. 재시작 후에도 요청·결정·사유를 보존할 별도 DB 테이블/migration의 승인 포함 여부는 정확히 질문했고 답변 전에는 schema/API 제품 코드를 변경하지 않는다. 승인 전 기존 공개 상품 유지, 기존 주문·재고·감사 이력 보존이 목표다.
- Git 판정: 원격 `main@618c7ab`은 같은 작업 브랜치의 앞선 PR #4를 이미 병합했고 현재 브랜치에는 그 뒤 후속 commit이 있어 양쪽이 분기됐다. 기존 브랜치의 clean 상태와 merge-tree 충돌 0을 확인한 후 `git merge --no-edit origin/main`으로 현재 브랜치에 정상 병합했다. 새 브랜치/worktree, `main` 직접 커밋, force push 없음. 병합 commit `2a1d2f9`이며 원격 작업 브랜치 push/WSL 동기화는 이 기록 시점 미실행이다.
- 병합 후 로컬 검증: `pnpm test` 174건 중 144 pass·30 DB/환경 skip·0 fail, PR 본문 검사 8 pass; `pnpm typecheck`, `pnpm lint`, `pnpm build` 각각 종료 코드 0, Next 12개 경로. 이 결과는 DB 연결 30건·GitHub CI 실제 job·WSL exact-SHA·브라우저/사용자 인수를 증명하지 않는다. 이번 동기화 오류 0, 같은 근본 원인 반복 0.
- 다음: 이 기록을 안전한 commit으로 만든 뒤 승인된 SSH 원격에 작업 브랜치를 push하고 지정 WSL checkout에서 exact-SHA DB 회귀를 수행한다. 판매중지 schema 포함 답변이 오면 그 범위에 한해 RED→GREEN으로 구현한다. 승인받지 않은 DB 변경은 계속 보류하고 S1/S2 독립 미완료 작업을 진행한다.
- WSL QA 사전 자원 기록: 브랜치 merge·현황 기록 commit `63cc3ce6f306f04fe49e1ea26a0a370e87010742`를 SSH 별칭 원격에 push했고 지정 `/home/daon/deploy/shopping`이 같은 SHA로 fast-forward·clean임을 확인했다. 기존 `local-postgres/shoppingmall`의 DB 연결 회귀에 Node 24 기존 이미지와 자동 제거 `shoppingmall-s22-main-sync-63cc3ce` 컨테이너 1개만 사용한다. 소유 어울, 수명 이번 전체 시험 한 번, 호스트 port 노출/새 DB·볼륨 없음. 실행 직전 이름 충돌을 확인하고 끝나면 `--rm`과 이름 잔류 0·QA DB 행 0을 확인한다. DB 비밀값은 WSL 실행 환경에서만 전달하고 출력/파일화하지 않는다.
- WSL 실행/정리 결과: 사전 DB accounts/products/revisions/audit `0/0/0/0`, 컨테이너 이름 비어 있음을 확인했다. exact SHA `63cc3ce`에서 Node 24 전체 DB 연결 시험 **174건 중 167 pass·7 환경 skip·0 fail**, 종료 코드 0. 사후 accounts/sellers/products/revisions/images/audit 6종 각 0행, 해당 컨테이너 잔류 0, WSL checkout clean·동일 SHA. 이는 기존 main 동기화 후 회귀 증거이며 새 판매중지 기능/실브라우저/정식 인수 증거가 아니다. 시험·정리 오류 0, 같은 근본 원인 반복 0.

## 진행 중 — 2026-09-29 S1.1 깨끗한 소스 설치·빌드 재현

- 담당/기준: 어울 단일 writer, `codex/flat-v2-prototypes@74fe9bc11dd2babf5fbd935b0db19500e616b622`. 계획서 S1.1의 clean checkout frozen 설치/테스트/typecheck/lint/build 증거를 만든다. 제품 코드·schema/API/권한은 변경하지 않는다. 현재 branch clean, Node 24.18.0·pnpm 11.19.0, `D:\tmp` 가용·약 198GB 여유, 정확한 임시 대상 미존재를 확인했다.
- 격리 QA 자원: Git HEAD의 tracked source만 `D:\tmp\shoppingmall2-s11-clean-c7e14a59.tar`와 `D:\tmp\shoppingmall2-s11-clean-c7e14a59\`에 일시 추출한다. 이는 새 Git branch/worktree가 아니며 현재 작업 checkout과 WSL DB/서버에 쓰지 않는다. `pnpm install --frozen-lockfile --offline`부터 시도하고 루트 test/typecheck/lint/build를 명령별 종료 코드로 기록한다. 설치가 실제로 필요한 원격 패키지 때문에 실패하면 외부 저장소 경계를 확인해 원인을 기록하며 성공으로 간주하지 않는다. 시험 종료 시 절대경로·내용·소유를 재확인한 정확한 임시 archive/폴더만 제거하고 부재를 확인한다. GitHub CI 실제 job, DB/브라우저, Android native·인수 결과는 이 시험과 별개다. 현재 오류 0·같은 근본 원인 반복 0.
- 실행 결과: 계획 기록 커밋 `acabac2bfc891bd5db19e67e68ade1df1da301ff`의 tracked source를 격리 추출했다. Node 24.18.0/pnpm 11.19.0에서 `pnpm install --frozen-lockfile --offline`은 lockfile 검증·643개 패키지 로컬 store 재사용, 다운로드 0, 종료 코드 0. 격리 루트 `pnpm test` 174건 중 144 pass·30 DB/환경 skip·0 fail, PR 본문 검사 8 pass·0 fail; `pnpm typecheck`, `pnpm lint`, `pnpm build` 각각 종료 코드 0(Next 12개 경로). 임시 archive 2,027,520바이트, 추출 디렉터리는 `.git` 없는 비재분석점으로 확인한 뒤 정확한 `D:\tmp` 두 대상만 제거했고 둘 다 부재. 작업 브랜치 파일·WSL DB/서비스는 변경하지 않았다. 실행 오류·동일 근본 원인 반복 0.
- 판정/다음: S1.1의 깨끗한 소스 frozen 설치·로컬 검사 재현 증거는 확보했다. 로컬 30 skip을 DB PASS로 보지 않으며 GitHub CI 실제 job·별도 S1 Stage PR/merged-main smoke는 미검증이다. 다른 S1/S2 계약·전체 개발 완료는 이 검증의 범위 밖이다. 다음은 계획 순서상 가능한 S1.1 CI 실제 상태와 S1.2/1.3 잔여를 권한 경계 안에서 확인한다.

## 진행 중 — 2026-09-29 S2.2 상품 수정안 편집 후 기존 공개값 유지 화면 QA

- 담당/기준: 어울 단일 writer, `codex/flat-v2-prototypes@b14fc0dd6642ba5c7d47f0a9747b9250b4336506`. 이미 승인된 판매 중 상품의 비공개 수정안 생성/편집 API·화면을 실제 브라우저에서 연결해 확인한다. 새로운 제품 코드/schema/API/권한 변경은 없다. 지정 WSL checkout 동일 SHA·clean, 9091/9092 listener와 계획한 전용 컨테이너 0, 개발 DB accounts/products/revisions `0/0/0`을 사전 확인했다.
- QA 자원 계획: 고유 ID `9e7c42b1`의 가상 계정 5개·판매자 3개·공개 가상 고추 1개를 기존 `qa-public-fixture.ts`로 정확한 `WSL-server`의 `local-postgres/shoppingmall`에 시험 중에만 만든다. Node 24 자동 제거 빌드 컨테이너, loopback 9091/9092의 `shoppingmall-s22-edit-9e7c-web`/`shoppingmall-s22-edit-9e7c-api`, 새 Chrome 시험 탭 1개를 사용한다. 판매자 로그인→수정안 생성→제목·500g 가격 변경·저장→고객 상세의 기존 제목·23,000원·재고 5개 유지와 DB 공개/비공개 개정 분리를 대조한다. 실제 사진/결제/실계정 없음. 끝나면 정확한 탭·컨테이너만 종료, 같은 QA ID만 fixture reset, DB/포트/컨테이너/checkout 잔류 0을 확인한다. 실패 시 같은 범위만 정리하고 미검증으로 남긴다. 실행 오류 0, 반복 근본 원인 0.
- 실제 화면/DB 결과: exact SHA `c0ae375daadcb026f4345c645fde3a690f393bb7`의 WSL API/Next production 빌드 종료 코드 0, `/ready`·`/login` HTTP 200. 고유 QA ID `9e7c42b1`을 seed하고 새 Chrome 시험 탭에서 가상 판매자로 로그인→판매 중 고추의 비공개 수정안 생성→상품명 `qa-9e7c42b1-private-edited-chili`와 500g 가격 25,000원 저장 안내를 확인했다. 이어 고객 상세는 기존 `qa-9e7c42b1-public-chili`, 500g 23,000원, 판매 가능 5개를 그대로 표시했다. 읽기 전용 DB 대조는 version 1 `approved`/published=true/23,000원/재고 5, version 2 `draft`/published=false/25,000원/재고 0이었다. 사진 없는 fixture라 관리자 재승인과 실제 사진 보존은 이번 화면 시험에 포함하지 않았다.
- 정리/미검증: 시험 탭 종료, 실행 전 이름을 확인한 QA Web/API 두 컨테이너만 중지·자동 제거, `qa-public-fixture.ts reset`으로 ID `9e7c42b1`만 삭제. accounts/sellers/categories/products/revisions/options/publications/audit 8종 각 0행, 9091/9092 listener·해당 이름 실행 컨테이너 0, WSL checkout clean/동일 SHA. 첫 읽기 전용 DB 조회의 SQL 셸 인용 오류 1회는 전체 두 개정 조회로 바로잡았고 자료 변경 없음; 동일 원인 반복 0. 실이미지·재승인 뒤 가격 전환, 판매중지/수정안 취소, 마지막 재고 경쟁·주문/결제·200% 확대/인쇄·Oracle/UAT는 미검증 또는 미구현이며 S2 전체 완료로 판정하지 않는다.

## 진행 중 — 2026-09-28 S2.4 검색 중복 페이지 종료 경계

- 담당/범위: 어울 단일 writer, `codex/flat-v2-prototypes@21eecc26f8a512d42e00f6700e8bdea6f556a982`. 기존 공개 검색의 `더 보기`가 이미 표시된 24개만 다시 받으면 중복 상품은 숨기지만 다음 페이지 버튼을 계속 노출하는 경계를 보강한다. 승인된 S2.4 검색 범위의 화면 내부 상태 계산과 시험만 변경하고 DB/schema/공개 API/권한·상품 자료는 변경하지 않는다.
- RED/GREEN 계획: 기존 상품 ID 집합과 다음 페이지 ID를 비교해 모두 중복인 24개 응답은 종료 안내·버튼 제거, 새 상품이 있으면 중복 없이 추가·다음 페이지 유지, 빈 응답은 종료하는 순수 병합 규칙 시험을 먼저 실패시킨다. 그 결과를 기존 `loadMore` 상태에 연결하고 로컬 test/typecheck/lint/build 및 WSL 동일 SHA 회귀를 실행한다. 독립 단위시험이며 실제 브라우저·사용자 인수 증거는 아니다. QA DB 자료·컨테이너 생성 없음. 오류 0, 반복 근본 원인 0.
- RED→로컬 GREEN: Next 페이지 export 제약을 고려해 독립 `search-pagination.ts` 목표 시험을 작성하고 모듈 부재 `ERR_MODULE_NOT_FOUND` RED 1건을 확인했다. 구현 후 완전 중복 24건/새 ID와 중복 혼합/빈·마지막 짧은 페이지 3 pass·0 fail. 기존 목록은 보존하고 새 ID만 추가하며 새 ID가 전혀 없는 응답은 더 보기 버튼을 종료한다. 로컬 전체 `pnpm test` 174건 중 144 pass·30 환경/DB skip·0 fail, PR 본문 검사 8 pass, typecheck·lint·production build·diff check 종료 코드 0. 초기 시험에서 Next 페이지 export를 기대한 경로 오류 1회는 별도 순수 모듈 경로로 바로잡아 새 모듈 부재 RED를 재확인했다. 동일 근본 원인 3회 연속 없음. WSL exact SHA 회귀와 잔류 확인은 아직 미실행이다.
- WSL 검증/정리: 변경 커밋 `07ef2951cf705438efcdf58918e52eb1ac038537`을 승인된 SSH 별칭 원격에 push하고 지정 `/home/daon/deploy/shopping`에 fast-forward했다. Node 24 일회성 컨테이너에서 정확한 `local-postgres/shoppingmall` DB 연결 전체 시험 **174건 중 167 pass·7 환경 skip·0 fail**, 종료 코드 0. 사후 accounts/sellers/products/revisions/images/audit 6종 각 0행, WSL checkout clean·동일 SHA. 브라우저에서 서버가 실제 중복 페이지를 반환하는 상황은 재현하지 않았고, 이 순수 화면 규칙의 목표/전체 회귀만 PASS다. S2.2 판매중지 계약 승인과 전체 S2/S3·인수는 계속 남아 있다.

## 진행 중 — 2026-09-28 S2.2 관리자 상품 반려 실제 화면 검증

- 담당/기준: 어울 단일 writer, `codex/flat-v2-prototypes@d0d696f`. 기존 관리자 반려 API·DB 시험과 관리자 화면은 구현되어 있으나 실제 브라우저에서 사유 입력→반려→공개 차단의 증거가 없다. 제품 코드/schema/API를 변경하지 않는 독립 QA다.
- QA 자원 계획: 고유 ID `f2e9c4a1`의 가상 계정 5개·판매자 3개·대기 상품 1개·메타데이터 전용 가상 사진 1행을 `qa-review-fixture.ts seed`로 `WSL-server`의 `local-postgres/shoppingmall`에만 생성한다. 이미지 파일/실계정/실판매/실결제는 사용하지 않는다. 동일 SHA의 WSL 빌드용 자동 제거 컨테이너 `shoppingmall-s22-reject-build-f2e9`, loopback 9091/9092의 `shoppingmall-s22-reject-web-f2e9`·`shoppingmall-s22-reject-api-f2e9`, 새 시험 Chrome 탭 1개를 시험 중에만 사용한다. 관리자 로그인→사유 입력→반려 메시지, DB rejected/공개 0/감사 근거를 대조한다. 종료 시 탭과 정확한 두 실행 컨테이너만 종료하고 동일 ID fixture reset 뒤 계정·상품·이미지·감사·포트/컨테이너·Git 잔류를 확인한다. 생성 직전 점유를 다시 읽는다. 오류 0, 반복 근본 원인 0.
- 실제 결과: exact SHA `0b571bf3c4b304314c91495a27bd572d58f930f9`의 WSL API/Next 빌드 종료 코드 0, `/ready`·`/login` HTTP 200. seed 계정/상품/개정/이미지 `5/1/1/1`. 별도 Chrome 탭에서 가상 운영자 로그인→상품 요청 검토→대기 고추·판매자/산지/가격/대표 메타데이터 1건 확인→가상 사유 입력·반려 클릭을 수행했다. 화면은 대기 목록 빈 상태와 ‘반려 사유와 운영 이력을 기록했습니다’를 표시했다. DB 대조에서 개정 `rejected`, 공개 `0`, `review_reason`에 입력 사유, 관리자 ID·심사 시각 존재, `product.proposal_reject` 감사 사건 1건을 확인했다. `audit_events.details`는 비어 있고 **사유의 정본은 개정의 `review_reason`**이다. 이미지 파일이 없는 QA 메타데이터이므로 사진 열기·승인은 수행하지 않았다.
- 정리/경계: 시험 Chrome 탭 종료, 이름을 확인한 QA API/Web 두 컨테이너만 중지·자동 제거, `qa-review-fixture.ts reset`으로 ID `f2e9c4a1`만 제거. accounts/sellers/products/revisions/images/audit `0/0/0/0/0/0`, 9091/9092 listener·해당 이름 실행 컨테이너 0, WSL checkout clean/동일 SHA. 실이미지 검사·승인 성공, 타 판매자 브라우저 권한, 200% 확대·인쇄·Oracle/UAT는 이 검증의 범위 밖이다. 이 QA 기능 오류·반복 근본 원인 0.

## 진행 중 — 2026-09-28 S2.2 상품 수정안 실브라우저 QA 선행 fixture 정리 경계

- 담당/기준: 어울 단일 writer, `codex/flat-v2-prototypes@bbe58a0`. 신산님이 승인한 판매 중 상품 수정안 API·UI의 실제 화면 시험을 준비한다. 현재 `qa-public-fixture.ts reset`은 최초 revision만 가정해 추가 수정안이 생기면 QA 상품 삭제가 실패할 수 있다. 제품 schema/API/권한은 변경하지 않고 **고유 QA seller/category/product에 속한 모든 revision만** 정리하도록 시험 도구를 보강한다.
- RED/GREEN 계획: `qa-public-fixture-db.test.mjs`에 고유 무작위 QA ID의 공개 상품을 seed한 뒤 두 번째 비공개 revision과 옵션을 만들고 reset이 계정·상품·개정·옵션·분류까지 제거하는 시험을 먼저 추가한다. RED 시 정확한 상품 ID·run ID만 별도 안전 정리하고 전체 DB를 초기화하지 않는다. WSL 지정 `local-postgres/shoppingmall`에서 시험하고 사후 계정·상품·개정·이미지·감사 이력 0을 확인한다. 실제 브라우저 검증은 fixture 정리 GREEN 뒤 같은 SHA로 진행한다. QA 자료는 시험 중에만 존재하고 비밀번호·DB URL은 기록하지 않는다. 현재 기능 오류 0, 반복 근본 원인 0.
- RED 실제 결과: exact SHA `beefbec3c71de16eb2eecfd44e6a0b28cd1cb7b1`의 WSL DB 새 목표 시험 1 fail·0 skip. 두 번째 비공개 revision 때문에 기존 reset이 `product_publications_product_id_products_id_fk` 23503으로 실패했다. 시험의 별도 정확 ID 비상 정리 후 accounts/products/revisions/options/publications `0/0/0/0/0`, WSL checkout clean. 계획한 결함 재현이며 반복 오류가 아니다.
- GREEN 변경/로컬: `qa-public-fixture.ts` reset 대상을 고유 QA 판매자·분류의 상품 ID로 한정하고 그 상품의 publication·재고 요청·이미지·재고·옵션·모든 revision을 의존성 순서대로 삭제한 다음 기존 QA 계정을 정리한다. 로컬 `pnpm test` 171건 중 141 pass·30 DB/환경 skip·0 fail 및 PR 본문 검사 8 pass, typecheck·lint 종료 코드 0. 실DB 목표/전체·build·브라우저는 아직 미검증이며 통과로 표시하지 않는다. 제품 schema/API/권한 변경 없음.
- GREEN 검증: exact SHA `09182783055c5485347a8d6baa6604cf7715dd36`의 지정 WSL DB에서 공개 fixture 목표 3 pass·0 fail·0 skip, 전체 171건 중 164 pass·7 환경 skip·0 fail. 로컬 `pnpm build` 종료 코드 0. 앞선 로컬 30 skip과 WSL 7 skip을 PASS에 합치지 않는다. 실브라우저는 아직 미검증.
- 다음 실브라우저 QA 자원 계획: 고유 ID `c1a4e29b`의 가상 계정 5개·판매자 3개·공개 가상 고추 1개를 `qa-public-fixture.ts seed`로 정확한 개발 DB에 만든다. 지정 checkout의 같은 SHA에서 API/Web 빌드용 자동 제거 컨테이너 `shoppingmall-s22-revision-build-c1a4`, loopback 9092/9091의 개발 API/Web `shoppingmall-s22-revision-api-c1a4`/`shoppingmall-s22-revision-web-c1a4`와 새 시험 브라우저 탭 1개만 사용한다. 판매자 로그인→공개 고추의 수정안 버튼→비공개 초안과 기존 고객 공개 버전·재고 불변을 실제 화면/DB에서 대조한다. 시험 직후 탭과 정확한 두 실행 컨테이너만 종료하고 같은 QA ID의 fixture reset 후 accounts/products/revisions/options/publications/audit·포트/컨테이너/checkout 잔류를 확인한다. 실제 사진/실계정/실결제 없음. 포트/이름 점유는 생성 직전 재확인한다.
- 실제 브라우저/DB 결과: exact SHA `9a2afbdc17b296cd68d7d8937dfabebaba8de70b`에서 WSL API/Next production 웹 빌드 종료 코드 0, `/ready`·`/login` HTTP 200. 고유 QA ID `c1a4e29b` 5계정·3판매자·1공개 가상 상품을 seed했다. 별도 Chrome 시험 탭의 판매자 로그인→담당 판매 중 고추→`상품 수정안 만들기` 버튼으로 **비공개 초안 생성** 표시를 확인했다. 동일 탭 고객 상품 상세는 기존 500g·23,000원·판매 가능 5개 그대로였고 DB `version 1 approved/public=true`, `version 2 draft/public=false`, 재고 `5/5`로 대조했다. 수정안 사진 업로드·편집·관리자 재승인과 출고/결제는 이번 화면 시험 범위 밖이다.
- 장애·조치: 첫 QA API 실행에서 업로드 루트명을 필수 `shoppingmall-upload*` 형식이 아닌 `/tmp/qa-*`로 지정해 버튼 요청이 실패했다. 코드의 `ImageQuarantine` 경로 검사를 확인하고 **정확한 QA API 컨테이너만** 정상 루트명으로 재기동한 뒤 동일 버튼이 성공했다. 진단용 Node 한 줄 호출은 셸 인용 오류 1회로 실행되지 않았고, 읽기 전용 SQL 한 줄도 인용 오류 1회였으며 각각 제품/DB 상태 변경이 없었다. 제품 기능 수정은 하지 않았다. 같은 근본 원인 3회 연속 없음.
- 정리/미검증: 시험 탭 종료, 정확한 QA API/Web 두 컨테이너 중지·자동 제거, `qa-public-fixture.ts reset`으로 고유 ID `c1a4e29b`만 정리. accounts/sellers/products/revisions/options/publications/audit 각 `0`, 9091/9092 listener와 해당 실행 컨테이너 이름 잔류 0, WSL checkout clean·동일 SHA. 로컬 시험의 skip, WSL 환경 skip 7건, 실제 사진/ClamAV·다른 역할/상태·200% 확대·인쇄/Oracle/UAT는 이 시험으로 통과 처리하지 않는다. 다음은 S2.2 판매중지 요청의 별도 지속 계약 승인 경계와 독립적으로 가능한 S2/S1 남은 증거를 확인한다.

## 진행 중 — 2026-09-28 S2.2 승인된 판매 중 상품 수정안 API·화면

- 담당/승인: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@a3ca4db`. 신산님이 권장안의 신규 `POST /catalog/seller/products/:productId/revisions` 추가를 직접 승인했다. 이는 판매자가 **자기 판매 중 상품**의 비공개 수정안을 만드는 좁은 범위이며, 취소·판매중지·다른 Stage의 지속 API/schema까지 승인한 것은 아니다. 기존 `ProductDrafts.createRevision`과 공개 승인 경계를 재사용한다.
- TDD/변경: API 라우트/무인증 및 판매자 승인 상품 카드의 수정안 버튼 시험을 먼저 실행해 각각 의도된 실패 1건을 확인했다. API 컨트롤러는 origin·seller 세션·로컬 업로드 환경을 확인하고 기존 서비스에 위임하며 무효 대상 400, 활성 수정안 중복 409, 타 판매자 403으로 매핑한다. 판매자 화면은 승인된 상품만 수정안 생성 버튼을 보이고 새 비공개 초안을 다시 불러온다. 현재 공개 버전은 승인 전 변경하지 않는다. 변경 파일은 `apps/api/src/catalog/controller.ts`, `apps/web/app/account/seller/products/page.tsx`, API 라우트/DB 및 웹 시험, 이 현황이다.
- 로컬 검증: 목표 8 pass·0 fail, 전체 `pnpm test` 170건 중 141 pass·29 DB/환경 skip·0 fail 및 PR 본문 검사 8 pass. `pnpm typecheck`·`pnpm lint`·`pnpm build` 각각 종료 코드 0. DB 실연결 시험은 로컬 skip이므로 WSL exact SHA에서 재검증할 예정. 기존 가상 DB 시험은 무작위 `qa+*@example.invalid` 계정·고유 분류/판매자/상품과 독립 임시 사진 루트를 만들며 `finally`에서 해당 소유 자료만 정리한다. 다른 DB/서비스/계정은 변경하지 않는다. WSL 검증·잔류 확인은 아직 미실행이며 완료로 표기하지 않는다. 현재 오류 0, 동일 근본 원인 반복 0.
- WSL 검증/정리: 동일 SHA `ca44142f2e0f7de26efa8ddf40fe8cff1de22939`를 지정 SSH 별칭 원격에 push하고 `/home/daon/deploy/shopping`에 fast-forward했다. `local-postgres/shoppingmall`을 사용한 목표 DB 승인·수정안 시험 1 pass·0 fail·0 skip, Node 24 전체 시험 **170건 중 163 pass·7 환경 skip·0 fail**, 명령 종료 코드 모두 0. 판매자 쿠키만 생성 허용, 관리자/무인증/위조 origin 거부, 중복 409, 생성 전후 기존 공개 revision·사진 보존, 승인 후 같은 옵션 재고 승계가 해당 목표 시험에 포함된다. 사후 accounts/products/product_revisions/product_images/audit_events `0/0/0/0/0`, 이름 `shoppingmall-`인 시험 컨테이너 잔류 0, WSL checkout clean/동일 SHA. 실제 브라우저 화면·외부 ClamAV/PG 결제·정식 WSL 통합/사용자 인수는 이 증거가 아니다. 이번 변경 실행 오류 0, 동일 근본 원인 반복 0.

## 진행 중 — 2026-09-28 S0 migration 읽기 전용 미리보기 명령

- 담당/기준: 어울 단일 writer, `codex/flat-v2-prototypes@3754e41`. S0 명령표의 누락된 dry-run을 기존 적용용 `migrate.ts`와 분리해 `apps/api/scripts/migrate-dry-run.ts`·`migration-preview.ts` 및 목표 시험·package script로 추가했다. 적용 이력은 Drizzle journal 순서·SHA-256과 대조하고 불일치하면 실패한다. DB 접속은 `BEGIN TRANSACTION READ ONLY`에서 현재 DB 이름과 migration 이력만 읽고 `ROLLBACK`하며, 대기 파일 목록과 선택적 `--sql` 본문을 출력한다. schema/migration SQL/공개 API·권한 계약은 변경하지 않는다. 이는 SQL을 적용/롤백하는 검증이 아니라 **읽기 전용 적용 전 미리보기**이며 실제 SQL 실행 적합성은 격리 DB 적용 시험으로 별도 확인한다.
- RED→로컬 GREEN: 목표 시험은 새 모듈 부재 `ERR_MODULE_NOT_FOUND`로 RED, 구현 뒤 pending prefix/완료 0건/해시·순서 불일치 거부 2 pass·0 fail. 로컬 전체 168건 중 139 pass·29 DB/환경 skip·0 fail, PR 본문 시험 8 pass, typecheck·lint·production build·diff check 종료 코드 0. 로컬 skip은 WSL DB 검증의 대체가 아니다.
- WSL 검증 자원 계획: 안전 커밋을 지정 SSH 원격에 push하고 `/home/daon/deploy/shopping`에서 exact SHA fast-forward 후 Node 24 일회성 컨테이너로 명령 실행. 먼저 기존 `local-postgres/shoppingmall`의 migration 6건·계정/상품 0을 읽기 전용 비교하고, 별도 `pgvector/pgvector:0.8.2-pg15` 임시 컨테이너 `shoppingmall-s0-dryrun-86d4`(호스트 포트 없음, 임시 메모리 저장소, 독립 빈 `shoppingmall` DB)에 `--network container:...`로 실행해 기존 migration 6개를 pending으로 출력해도 drizzle schema/table이 만들어지지 않는지 확인한다. 공유 DB에도 같은 명령으로 0 pending·이력/자료 불변을 확인한다. 비밀값은 실행 중 난수/환경에서만 사용·출력하지 않고 정확한 QA 컨테이너는 시험 직후 stop/remove, 이름/포트/DB/checkout 잔류를 확인한다. 이 자체 QA를 정식 WSL 통합·운영 DB rollback으로 표기하지 않는다.
- WSL 결과: exact SHA `b748e07`을 SSH 별칭으로 push하고 지정 checkout에 fast-forward, clean 확인. 격리 빈 `shoppingmall` DB에서는 명령 종료 코드 0, `0 applied, 6 pending` 및 0000~0005를 출력했고 public 테이블/Drizzle schema 개수는 전후 `0/0`. 임시 DB 컨테이너는 `--rm`·`--tmpfs`로 실행해 종료 후 정확한 이름 잔류 0, 호스트 포트 공개 없음. 기존 `local-postgres/shoppingmall`에서는 명령 종료 코드 0, `6 applied, 0 pending`; migration/계정/상품은 전후 `6/0/0`. 같은 SHA의 WSL 개발 DB 연결 전체 시험 **168건 중 161 pass·7 환경 skip·0 fail**, 명령 종료 코드 0, 사후 accounts/products/revisions/images `0/0/0/0`, WSL checkout clean. 이는 자체 개발 회귀이며 정식 WSL 통합·미래 migration의 SQL 적합성·운영 DB upgrade/rollback을 증명하지 않는다. `--sql` 표시 모드는 별도 실제 DB 시험을 하지 않았다. 오류 0, 동일 근본 원인 반복 0.
- 명령문 확인/오류: 최초 문서의 `pnpm migration:dry-run -- --sql`은 pnpm이 리터럴 `--`까지 스크립트에 전달해 인자 검사 실패 1회. 명령 자체는 공유 DB에 접속하지 않았다. `pnpm migration:dry-run --sql`은 스크립트가 `--sql` 하나를 받는 것을 접근 불가 시험 포트에서 확인했고 문서를 바로잡았다. 제품 기능 오류가 아닌 사용법 표기 오류 1회, 동일 근본 원인 반복 0. 본문 출력은 실제 DB에서 별도 미검증이다.
- `--sql` 후속 QA 계획: 동일 exact SHA `3e7e7af`의 기존 명령을 새 격리 빈 PostgreSQL `shoppingmall-s0-dryrun-sql-15e6`에서 다시 실행한다. 호스트 포트·지속 volume 없이 tmpfs와 실행 중 난수 비밀번호를 사용한다. 표준출력은 파일에 저장하지 않고 shell 메모리에서 6 pending 및 SQL 본문 표식만 검사하며, 실행 전후 public 테이블·drizzle schema 0을 확인한다. 종료 시 정확한 임시 컨테이너만 stop/remove하고 이름·공유 DB·checkout 잔류를 확인한다. 공유 DB와 실제 적용 명령은 변경하지 않는다.
- `--sql` 후속 결과: exact SHA `3e7e7af`의 독립 빈 DB에서 실행 종료 코드 0, 출력에 `0 applied, 6 pending` 및 실제 `CREATE TABLE` SQL 본문이 포함됨을 shell 메모리에서 확인했다. public 테이블/Drizzle schema 전후 `0/0`, 정확한 QA 컨테이너 잔류 0, 공유 DB migrations/accounts/products `6/0/0`, WSL checkout clean. 앞선 ‘본문 별도 미검증’ 기록을 이 결과로 해소한다. 실제 migration SQL 적용 적합성·rollback은 이 결과의 범위 밖이다. 후속 오류 0, 같은 근본 원인 반복 0.
- 다음: 현재 명령표를 갱신해 로컬 문서 검사 후 동일 작업 브랜치에 push·WSL exact SHA 동기화한다. S0 전체 환경 gate·S2/S3 기능·정식 E2E는 별도 미완료다.

## 진행 중 — 2026-09-28 S2.4 실제 제품 200% 확대 확인

- 담당/범위: 어울 단일 writer, `codex/flat-v2-prototypes@3754e41`. 이미 승인된 Flat v2 제품 홈·상품검색의 **실제 Chrome 페이지 확대**를 확인한다. 단순 430px viewport 축소를 200% 증거로 대체하지 않는다. 제품 코드·DB/schema·API·권한 변경 없음.
- QA 사전 확인/자원 계획: 지정 WSL checkout `3754e41` clean, 개발 DB accounts/products `0/0`, 9091/9092 HTTP listener 0, `shoppingmall-s24-zoom-` 컨테이너 0. 정확한 임시 이름 `shoppingmall-s24-zoom-web-8ac1`/`shoppingmall-s24-zoom-api-8ac1`, loopback 127.0.0.1:9091/9092, 새 Chrome 시험 탭 한 개만 사용한다. 실제 브라우저 키 입력이 페이지 zoom을 바꿨는지 계산된 CSS viewport/DPR로 먼저 확인한 뒤 가로 넘침·기본 탐색을 검사한다. 적용되지 않으면 실패/미검증으로 남기고 대체 viewport를 합격으로 기록하지 않는다. 종료 시 확대·viewport를 기본으로 복원, 시험 탭·정확한 두 컨테이너만 닫고 포트·DB·Git 잔류를 확인한다. QA 계정·상품은 생성하지 않는다.
- 실행/판정: exact SHA `3754e41`의 임시 API `/ready`와 웹 홈 HTTP 각 200. 새 Chrome 시험 탭에서 기본 `devicePixelRatio=1`, `innerWidth=1584`, `clientWidth=scrollWidth=1569`, `visualViewport.scale=1`. 브라우저 입력 `ctrl+plus`, 대체 `ctrl+equal` 각각 뒤에 동일 지표 불변이어서 **실제 확대가 적용됐다는 증거 없음**. 이 환경에서 200% 표시·가로 넘침·키보드 결과는 **미검증**이며 앞서 확인한 430px viewport 결과로 대체하지 않는다. `ctrl+0` 후 기본 지표 불변, 탭 종료. 확대 입력 미적용 동일 원인 2회로 추가 키 반복을 멈췄다. 사용자 Chrome 설정·다른 탭은 변경하지 않았다.
- 정리/다음: 지정 컨테이너 두 개만 stop/remove 후 잔류 0, 9091/9092 HTTP listener 0, 개발 DB accounts/products `0/0`, WSL checkout clean. 실배율 조절을 노출하는 브라우저 환경에서 200%를 다시 검증해야 한다. 다른 S2 미완료 항목은 계속한다.

## 진행 중 — 2026-09-28 S2.4 승인된 Flat v2 홈 헤더·히어로 반영

- 담당/기준: 어울 단일 writer, `codex/flat-v2-prototypes@149ce75`. 신산님이 제품 시각 기준으로 채택한 `docs/design/assets/home-flat-v2.html`의 황금·크림 헤더/히어로·사진 자리표시를 현재 제품 홈의 기본 골격에 좁혀 반영한다. 새 디자인·콘텐츠 승인 판단이 아니라 기존 채택 시안의 구현이다. 상품 검색과 기존 메뉴 링크·서비스 구축 중 안내는 유지하고, 클릭 가능한 제철 상품/판매자 이야기 동선은 현재 실재하는 `/products`·`/#seller-story-title`만 쓴다. 장바구니·기획전 결제 등 미구현 링크를 만들지 않는다.
- 변경/검증 계획: `apps/web/app/page.tsx`·`styles.css`·기존 홈 시험에 한정, 테스트 RED→GREEN 후 전체 test/typecheck/lint/build, 지정 WSL exact SHA 웹 빌드·실제 1440/430px 시각/가로 넘침·키보드 확인. 사진은 `.ms-ph` 자리표시임을 명확히 두고 실제 산지/상품 사진이나 사용자 인수로 주장하지 않는다. DB/schema/공개 API/권한은 변경하지 않는다. 임시 HTTP QA가 필요하면 9091/9092와 고유 이름·수명·정리 대상을 별도 기록 후 시작한다.
- RED→로컬 GREEN: 기존 홈 제목·CTA 부재로 새 사용자 동선 시험 1 fail/9 pass RED를 확인한 뒤 상단 문구·브랜드 마크/보조 문구·시안의 두 칸 히어로·황금색 `.ms-ph` 세 자리표시·실경로 CTA를 추가했다. 기존 검색 form·메뉴·서비스 구축 중 안내와 상품 API 호출은 보존. 홈/검색/대비 목표 22 pass·0 fail, 전체 로컬 **166건 중 137 pass·29 DB/환경 skip·0 fail** 및 PR 본문 검사 8 pass, typecheck·lint·production build·diff check 종료 코드 0. 로컬 DB skip은 WSL 통합 PASS가 아니다.
- 실브라우저 QA 계획: 지정 WSL checkout을 이 변경 exact SHA로 fast-forward하고 웹/API 산출물을 제한된 Node 24 일회성 컨테이너에서 빌드한다. 개발 DB는 기존 `local-postgres/shoppingmall` 읽기 연결만 하며 가상 계정·상품 seed 없음. 포트 127.0.0.1:9091/9092와 이름 `shoppingmall-s24-home-web-7c2d`/`shoppingmall-s24-home-api-7c2d` 임시 컨테이너, 새 Chrome 시험 탭 1개만 사용한다. 1440×900·430×844에서 헤더/히어로/버튼, 가로 넘침과 키보드 초점을 확인하고 viewport override를 복원한다. 끝나면 시험 탭만 닫고 지정 컨테이너만 stop/remove, 포트·DB 행·checkout 잔류 0을 확인한다. 실제 이미지·기획전 데이터·200% 확대는 제외한다.
- WSL 재현: exact SHA `f6164bc`의 API TypeScript·Next production build 성공, 개발 DB 연결 전체 시험 **166건 중 159 pass·7 환경 skip·0 fail**, 종료 코드 0. 사후 accounts/products/revisions/images 각 0, WSL checkout clean. 로컬의 29 DB/환경 skip을 WSL PASS로 대체하지 않고 7 환경 skip은 계속 미검증이다.
- 실제 브라우저: 임시 API `/ready`와 웹 홈 HTTP 각 200. Chrome 새 시험 탭에서 1440×900은 `scrollWidth=clientWidth=1425`, 430×844는 `415=415`로 가로 넘침 없음. 두 폭 모두 승인된 제목·CTA·사진 자리표시 3개가 표시됐고 모바일에서 두 CTA가 화면 안에 위치함을 확인했다. 첫 CTA의 Tab 다음 초점은 둘째 CTA였으며 첫 CTA 클릭은 `/products` 상품 검색 화면, 둘째 CTA 클릭은 `/#seller-story-title` 판매자 이야기 제목으로 이동했다. 실제 사진·프로모션 운영 자료·200% 확대·인쇄·전 역할/상태·사용자 인수는 미검증이며 S2.4 전체 완료로 판정하지 않는다.
- 정리/오류: Chrome viewport override를 복원하고 새 시험 탭만 종료. 정확한 이름의 QA 컨테이너 둘만 stop/remove 후 잔류 0, 9091/9092 HTTP listener 0, DB accounts/products `0/0`, WSL checkout clean. 가상 계정·상품을 생성하지 않았고 다른 서비스는 건드리지 않았다. 이 QA 실행 오류·동일 근본 원인 반복 0.

## 진행 중 — 2026-09-28 S0 기존 migration 격리 재현

- 담당/범위: 어울 단일 writer, `codex/flat-v2-prototypes@70cabe1`. S0 명령표의 migration dry-run 공백을 공유 개발 DB 변경 없이 좁혀 검증한다. 현재 `apps/api/migrations/0000`~`0005`의 **기존 SQL만** 동일 source checkout의 일회성 PostgreSQL에 적용해 구문·순서·migration 이력을 확인한다. 새로운 migration, 공유 `local-postgres/shoppingmall` 적용, schema/API/권한 변경은 하지 않는다.
- 격리 자원 계획: WSL에 이미 있는 실제 개발 DB와 같은 `pgvector/pgvector:0.8.2-pg15` 이미지의 임시 컨테이너 `shoppingmall-s0-migrate-check-70ca`, 호스트 포트 미노출·별도 초기 빈 DB `shoppingmall`, QA ID `migrate-70ca`. 자격정보는 실행 시 난수로 생성해 기록·출력하지 않는다. Node 24 일회성 컨테이너는 해당 PostgreSQL의 네트워크만 공유하고 `/home/daon/deploy/shopping` checkout을 읽는다. 시험 뒤 임시 DB 컨테이너를 stop/remove하고 이름·볼륨·호스트 포트 잔류를 확인한다. 기존 `local-postgres` DB의 계정·상품·migration 상태는 시험 전후 읽기 전용으로 비교한다. 이것은 **격리된 빈 DB 적용 재현**이며 현재 공유 DB에 대한 실제 SQL preview/dry-run 또는 정식 WSL 통합 PASS로 표시하지 않는다.
- 실행/정리: exact SHA `b289069`의 읽기 전용 소스 마운트와 일회성 Node 24에서 기존 `migrate.ts`를 분리된 PostgreSQL 15 빈 DB에 실행했다. 첫 실행은 `Migrations applied` 후 **검증 SQL 셸 인용 오류 1회**로 종료 코드 1; `trap`이 지정 DB 컨테이너를 제거했고 공유 DB `accounts/products/migrations=0/0/6` 불변을 확인했다. 새 격리 DB에서 SQL 인용을 바로잡은 재실행은 `Migrations applied`, migration 이력 **6건**, public 테이블 **21개**, 종료 코드 0. 재실행 뒤 정확한 QA 컨테이너 0, 공유 DB `0/0/6`, WSL checkout clean. 호스트 포트는 공개하지 않았고 `--rm`으로 실행했으나 익명 Docker volume의 개별 ID별 삭제 증거는 수집하지 못했다. 실제 운영/공유 DB migration은 실행하지 않았고 새 SQL을 만들지 않았다. 같은 근본 원인 1회, 재시도 성공. 이는 빈 DB 기존 migration 재생 증거이며 공유 DB에 대한 미적용 migration preview/dry-run, rollback, 업그레이드 경로, 정식 통합의 대체 증거는 아니다.

## 진행 중 — 2026-09-28 S2.4 실제 제품 화면 1440/430 viewport QA

- 담당/범위: 어울 단일 writer, `codex/flat-v2-prototypes@bade774`. 상품 수정 신규 API는 승인 답변 전 보류한다. 그와 독립된 현재 제품 홈·검색/상품 카드의 1440×900·430×844 viewport에서 실제 가로 넘침, 핵심 탐색·키보드 조작을 새 Chrome 시험 탭의 HTTP 화면으로 확인한다. 이는 브라우저 배율 200%나 모든 역할 화면/인쇄의 합격 증거가 아니다.
- 사전 자원 확인: 지정 WSL checkout `bade774` clean, `local-postgres/shoppingmall` accounts/products 0, 9091/9092 listener 0, 지정 시험 컨테이너 이름 점유 0. 공유 WSL load 1.43, 가용 메모리 5.9Gi; 타 프로젝트 서비스는 건드리지 않는다.
- QA 자원 계획: 정확한 QA ID `f7c9a82e`, 5개 `qa+f7c9a82e-*@example.invalid` 가상 계정과 `qa-f7c9a82e-public-chili*` 가상 공개 상품 25개만 개발 DB에 seed. 127.0.0.1:9091/9092의 임시 `shoppingmall-s24-viewport-web-f7c9`/`shoppingmall-s24-viewport-api-f7c9` 컨테이너와 새 Chrome 시험 탭 하나를 사용한다. 현재 SHA에서 필요한 빌드 후 `/ready`·웹 200을 확인하고 화면을 시험한다. 종료 즉시 시험 탭만 닫고 지정 컨테이너만 stop/remove, 정확한 QA ID만 fixture reset, DB 7종·포트·checkout 잔류를 확인한다. 비밀값은 출력·문서화하지 않는다.
- 실행/실제 브라우저: exact SHA `9f1fe85`의 WSL API TypeScript·Next production build 종료 코드 0, 계정 5·공개 상품/공개 개정 각 25, 임시 API `/ready`·웹 검색 HTTP 각 200. 새 Chrome 시험 탭의 실제 viewport override에서 홈과 상품검색의 `scrollWidth=clientWidth`를 1920×1080(1905=1905), 1440×900(1425=1425), 430×844(415=415)에서 각각 확인했다. 검색 24개 카드가 각 폭에서 표시됐고 1440은 4열, 430은 1열로 시각 확인했다. 430px 검색 입력에서 Tab은 카테고리→판매자→정렬→검색 버튼으로 이동했다. 홈의 각 폭에서 검색·메뉴·기획전·카테고리 구조가 보였지만 기획전은 현재 임시 콘텐츠이고 실제 이미지/프로모션 운영 자료는 없다. 브라우저 배율은 1배이며 **200% 확대·전 역할/상태·인쇄는 미검증**이다. 지정 Chrome viewport override는 기본으로 복원했고 시험 탭만 종료했다.
- 정리/오류: 이름이 기록된 두 컨테이너만 stop/remove하고 QA ID `f7c9a82e`만 fixture reset. 사후 accounts/sellers/seller_categories/product_categories/products/revisions/publications/inventory 8종 0, 두 컨테이너·9091/9092 listener 0, WSL checkout clean. 기존 타 프로젝트 서비스·사용자 탭은 변경하지 않았다. QA 빌드·seed·실브라우저·reset 도중 오류 0, 동일 근본 원인 반복 0. 이 부분 viewport·키보드 증거는 S2.4 전체 기능/인수 완료 판정이 아니다.

## 진행 중 — 2026-09-28 S0 재현 명령표 현재화

- 담당/범위: 어울 단일 writer. 현재 root package scripts·API/Web package scripts·migration·QA fixture와 `docs/DEVELOPMENT_ENVIRONMENT.md`를 대조해 설치/검사/WSL 동기화/DB 연결 전체 시험/QA 수명/수동 브라우저 검증 명령표를 문서 상단에 정리했다. 제품 코드·schema/API/권한·공유 환경을 변경하지 않는다.
- 미구현·미검증: migration dry-run 명령과 자동 브라우저 E2E package script는 현재 없다. 실제 migration 스크립트는 적용 명령이라 공유 DB에서 시험 실행하지 않았다. 이 명령표가 S0/S2 전체 종료나 Oracle·PG·UAT 검증은 아니다. 문서 diff 검사와 동일 SHA push/WSL 동기화를 완료한 뒤 기록한다.
- 검증/정리: 문서 2개만 변경했고 `git diff --check` 종료 코드 0. exact SHA `0b390f2`를 지정 SSH 별칭의 원격 작업 브랜치에 push하고 WSL `/home/daon/deploy/shopping`에 fast-forward했다. 로컬·원격·WSL 모두 같은 SHA, 로컬·WSL checkout clean; 시험 자료·서버 변경 없음. 작업 오류·동일 근본 원인 반복 0. 남은 것은 실제 migration dry-run 기능/격리 DB 검증과 자동 브라우저 E2E 도구 확정이다.

## 진행 중 — 2026-09-28 S2.2 승인 직전 이미지·검사 장애 경계

- 담당/범위: 어울 단일 writer, 기존 작업 브랜치 `codex/flat-v2-prototypes@55d20c6`. 기존 `product-approve-db.test.mjs`의 정확한 가상 상품·격리 사진·`finally` 정리를 재사용해 승인 직전 실제 보관 사진 부재 및 검사 서비스 불가가 공개를 차단하는지 확인한다. 승인 서비스·DB/schema/공개 API/권한 계약은 변경하지 않는다.
- 시험 계획: 전용 임시 업로드 루트 안의 그 시험 사진만 `stageRemoval`로 잠시 격리하고 승인 거부를 확인한 뒤 반드시 복원한다. 이어 기존 시험용 스캔 콜백의 장애를 흉내 내어 승인 거부·기존 공개 상태 불변을 확인한다. WSL 지정 개발 DB에서 목표/전체 회귀를 실행하고 정확한 가상 DB 행·임시 파일 잔류 0을 확인한다. 실제 ClamAV 장애 주입이나 운영 저장소 검증으로 확대하지 않는다.
- 결과: exact SHA `44337cf`의 WSL 개발 DB에서 목표 시험 1 pass·0 fail·0 skip. 가상 상품 승인 직전에 그 시험 사진만 이동하자 `ENOENT`로 거부되고 제안은 `pending`, 공개 행 0이었다. 사진을 복원한 뒤 모의 검사 서비스 불가도 승인 거부·`pending`·공개 행 0을 확인했다. 기존 악성 검사 거부/정상 승인 경로도 같은 목표 시험에 포함된다. 로컬 typecheck·lint·diff check 통과, WSL 전체 **165건 중 158 pass·7 환경 skip·0 fail**·종료 코드 0. 사후 accounts/products/revisions/images 0, 체크아웃 clean. 테스트는 임시 전용 사진만 이동·복원하고 `finally`에서 전용 임시 루트를 정리한다. 기능 오류·반복 근본 원인 0. 실제 ClamAV 프로세스 중단, 외부 오브젝트 스토리지·운영 장애 복구는 이 증거가 아니다.

## 진행 중 — 2026-09-28 S2.4 검색 더 보기 키보드 초점 연속성

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@9f2b862`. 직전 25개 상품 브라우저 QA는 Enter로 더 보기 실행까지 확인했으나 버튼이 비활성화·제거된 뒤의 초점 위치는 확인하지 않았다. 실제 키보드 탐색이 첫 새 상품 또는 종료 안내로 이어지는지 먼저 재현한 뒤 필요한 경우 기존 검색 화면만 고친다. 새 API/DB/schema/권한 변경은 없다.
- QA 자원 계획: 지정 WSL `local-postgres/shoppingmall` 개발 DB의 정확한 QA ID `e51a4c20` 및 25개 `qa-e51a4c20-public-chili*` 가상 상품·가상 계정 5개, loopback 9091/9092, 임시 컨테이너 `shoppingmall-s24-focus-api-e51a`/`shoppingmall-s24-focus-web-e51a`, 새 Chrome 시험 탭. 사용자 탭·Oracle·운영 자료는 건드리지 않는다. 검증 후 탭 종료→정확한 컨테이너 stop/remove→그 QA ID만 fixture reset→DB/포트/checkout 잔류 0을 확인한다.
- 착수 판정: 초점 위치는 처음에는 가설로 두고 브라우저 RED를 먼저 확인한 뒤 화면 회귀 시험과 구현, 로컬/WSL/브라우저 GREEN을 분리한다. 실제 200% 확대는 이번 범위가 아니다.
- RED 재현: QA ID `e51a4c20` 가상 계정 5·공개 상품 25만 생성, 정확한 API/Web 임시 컨테이너의 `/ready`·검색 HTTP 200 확인. 첫 API curl은 기동 직후 000으로 실패했으나 컨테이너 재기동 없이 16초 뒤 200/200 확인(기동 지연 1회). Chrome 새 시험 탭에서 더 보기 버튼에 Enter→24개에서 25개·버튼 제거 직후 접근성 상태의 초점은 새 상품이 아닌 `AXWebArea`였다. 데이터 조회는 정상이며 **키보드 초점 연속성 결함**으로 판정한다.
- 수정/로컬: 화면 목표 시험에 상품 링크 ID·빈 다음 페이지의 포커스 가능한 종료 안내를 요구하는 RED를 작성했다. React의 서버 렌더 `tabIndex`가 소문자 `tabindex`로 직렬화되는 시험 정규식 오류 1회는 실제 출력에 맞게 고쳤다. 새 결과가 생기면 첫 상품 링크, 빈 마지막 페이지면 종료 안내, 요청 오류면 기존 더 보기 버튼으로 초점을 옮기며 중복 ID는 기존처럼 걸러낸다. 목표 화면 9 pass·0 fail, 로컬 루트 165건 중 136 pass·29 DB/환경 skip·0 fail, PR 검사 8 pass, typecheck·lint·production build·diff check 통과. 실제 수정 후 브라우저 초점/WSL 전체 회귀는 아직 미검증이며 QA 자료·컨테이너는 그 검증을 위해 임시 유지 중이다.
- 수정 후 브라우저 GREEN: WSL exact SHA `75aa147`을 배포한 새 Chrome 시험 탭에서 25개 결과의 24→25 더 보기 Enter 후 첫 신규 상품 링크에 실제 초점이 옮겨짐을 확인했다. 정확히 24개 결과의 다음 빈 페이지에서는 종료 안내 `search-end`에 초점이 옮겨졌다. 24개를 연 상태에서 임시 QA API만 잠시 중단해 더 보기 Enter 실패를 재현하자 기존 24개는 유지되고 오류 안내·재시도 버튼이 남으며 초점은 `search-more`에 유지됐다. QA API 복구 후 같은 버튼 Enter 재시도로 25개·첫 신규 상품 링크 초점·오류 안내 제거를 확인했다. API를 먼저 중단해 초기 목록 로딩에 실패한 시험 순서 오류 1회는 API 재기동·200 확인 후 올바른 기존 목록 상태에서 다시 재현했다. 재기동 직후 `api:000`은 준비 대기 후 200으로 확인했다. 제품 실패로 계산하지 않는다.
- 정리/WSL 회귀: 시험 탭만 닫고 정확한 `shoppingmall-s24-focus-web-e51a`·`shoppingmall-s24-focus-api-e51a` 컨테이너를 중단·제거한 뒤 QA ID `e51a4c20`만 fixture reset했다. accounts/sellers/categories/products/revisions/publications/inventory 각각 0, 지정 컨테이너·9091/9092 listener 0, checkout clean. 그 후 exact SHA `75aa147`의 Node 24 일회성 컨테이너·WSL 개발 DB 연결 전체 시험은 **165건 중 158 pass·7 환경 skip·0 fail**, 종료 코드 0, 사후 accounts/products/revisions/images 0이었다. 위 이전 문단의 '미검증·임시 유지'는 수정 직후 중간 시점이며 여기서 브라우저·회귀·정리까지 완료했다. 200% 확대·전체 역할의 시각 QA·UAT는 여전히 미검증이다.

## 현재 S2 Stage 잔여 게이트 대조 — 2026-09-28

- 기준: `docs/WORK_PLAN.md` S2.1~S2.4와 현재 코드·아래 누적 증거를 대조했다. S2 Stage PR/병합은 아직 진행하지 않으며 S3의 순수 계산 선행 검증은 S2 완료나 Stage 순서 건너뛰기가 아니다.
- S2.1: 관리자 대·소분류 및 판매자 분류/등록, 판매자 소속·산지 무제한의 기존 API/DB/화면 시험은 기록돼 있다. 주문 생성 이전이므로 과거 주문 근거 보존의 실제 주문 시험은 아직 없다.
- S2.2: 새 상품·사진·승인/반려와 공개 개정 서비스·동일 옵션 재고 승계 시험은 있다. 판매자가 공개 상품의 비공개 수정안을 화면에서 시작하는 공개 API/UI, 수정안 취소, 판매중지 요청/승인, 누락 사진·스캐너 장애의 실제 화면 경계는 미완료다. 신규 판매자 전용 개정 생성 API는 신산님의 직접 승인 질문을 별도로 드린 상태이며 응답 전 변경하지 않는다.
- 추가 확인(2026-09-28): 현재 판매자 화면의 `초안 삭제`는 사진·재고·공개 이력이 없는 **신규 미제출 상품**에만 연결되고, 공개 상품에서 분기한 비공개 수정안을 취소하는 API가 아니다. 기존 `deleteDraft`는 해당 상품의 다른 개정이 있으면 삭제를 거부한다. 따라서 이를 수정안 취소 완료로 재분류하지 않는다. 새 개정 시작 경로와 수정안 취소 계약은 각각 승인 전 변경하지 않는다.
- S2.3: 재고 직접 입력·0 즉시 차단·증가 승인, 배송 정책 제안/관리자 승인과 실제 브라우저 증거가 있다. ‘마지막 수량 동시 구매’와 기존 주문 정책 스냅샷은 아직 주문/예약이 없어서 미검증이다.
- S2.4: 공개 검색/필터/정렬·분류/판매자 링크, 25개 상품의 더 보기 클릭/Enter·빈 결과는 검증했다. 관리자 편집형 메뉴·기획전·공통 추천, 찜·재입고는 현재 API/화면 코드에서 확인되지 않았고 새 지속 데이터/API/권한 계약 승인 경계다. 사용자별 개인화로 표시하지 않는다. 실제 200% 확대, 모든 역할/상태의 3 viewport·인쇄·이미지 포함 시각 QA는 미검증; 명시된 CSS 색상 쌍의 대비만 별도 계산했다.
- 다음: 요청 중인 S2.2 경로 승인을 받으면 해당 범위부터 TDD→WSL DB/브라우저 검증으로 진행하고, 뒤의 수정안 취소·판매중지·S2.4 지속 기능은 각각 필요한 계약을 제시한다. 외부 계정/Oracle·UAT는 이 단계의 통과로 간주하지 않는다.

## 검증 기록 — 2026-09-28 S2 Flat v2 코드 색상 대비 계산

- 담당/대상: 어울 단일 writer, 현재 `apps/web/app/styles.css`에 명시된 전경/배경 RGB 쌍을 sRGB 상대 휘도 방식으로 계산했다. 본문 `#302a20/#faf7ef` 13.27:1, 검색 자리표시 `#756a55/#fffaf1` 5.11:1, 보조 문구 `#675b48/#fffaf1` 6.38:1, 링크 `#75561e/#fffaf1` 6.50:1, 기본 버튼 흰 글자/`#8b6828` 5.11:1, hover 흰 글자/`#815e22` 5.90:1, 초점색 `#9c2b22/#fffaf1` 7.26:1, 기획전 작은 글자 `#624a24/#e7d2a6` 5.61:1, eyebrow `#77551b/#faf7ef` 6.33:1이다.
- 판정/한계: 위 계산 쌍의 일반 글자 대비는 모두 4.5:1 이상이다. 입력 테두리 `#a18556/#fffaf1` 3.36:1, 검색 테두리 `#a47d3b/#fffaf1` 3.62:1; 장식용 카드 경계선 `#e9d2bb/#fffaf1`은 1.40:1이라 정보 전달 경계로 간주하지 않는다. 코드에 명시된 색상 계산이며 실제 브라우저의 모든 상태/사용자 확대·고대비 모드/이미지 위 글자·모든 화면의 시각 QA PASS가 아니다. 색상 코드는 변경하지 않았고 오류 반복 0. 실제 200% 확대는 여전히 미검증이다.

## 진행 중 — 2026-09-28 S2.4 검색 더 보기 실제 브라우저 QA 준비

- 담당/대상: 어울 단일 writer, `codex/flat-v2-prototypes`. 기존 `qa-public-fixture.ts`를 선택적 25개 공개 가상 상품으로 확장하되 기본 1개 사용자는 유지한다. 범위는 지정 WSL `local-postgres/shoppingmall` 개발 DB와 loopback 9091 웹/9092 API, 정확한 QA ID `c4e7a219` 및 `qa-c4e7a219-*` 식별 자료에만 한정한다. 운영·Oracle·실사용자 자료는 변경하지 않는다.
- 자원 계획: 시험 계정 5개(고객·판매자 A/B·어울몰·관리자, `qa+c4e7a219-*@example.invalid`), 판매자 분류/3판매자/상품 대·소분류/25개 가상 공개 상품, 임시 컨테이너 `shoppingmall-s24-page-api-c4e7`, `shoppingmall-s24-page-web-c4e7`. 비밀값·실개인정보는 출력/커밋하지 않는다. 본문에 이 계획을 남긴 뒤 seed하며, 시험 끝나면 fixture의 정확한 ID reset→DB/컨테이너/포트 0과 WSL clean을 확인한다.
- 판정: 실제 브라우저에서 24개 목록→더 보기→25개, 버튼 사라짐, 필터 조건 유지와 키보드 접근을 확인한다. 실패/차단 시 PASS로 표기하지 않고 정확한 잔류·미검증을 기록한다. 실제 200% 확대는 별도 정책/도구 제한으로 이번 시험 범위가 아니다.
- RED 실패/복구: exact SHA `4f884a7`의 WSL 목표 시험은 기존 함수가 신규 `productCount` 인자를 무시해 사전 거부 대신 1개 QA 상품을 만들면서 실패했다(시험 exit 1). 그 시험은 `seeded=true` 이전 실패라 `finally` reset을 건너뛴 결함도 드러냈다. 읽기 전용으로 `qa-2941fd0a-public-minor`/상품 1·계정 5를 정확히 식별하고 기존 `qa-public-fixture.ts reset`에 **그 ID만** 전달해 정리했으며 accounts/products/revisions/publications/categories/sellers 모두 0, checkout clean을 확인했다. 운영/타 자료는 변경하지 않았다. 같은 근본 원인 1회, 재시도 전에 무효 개수 시험에 별도 QA ID와 무조건 reset을 추가했다.
- GREEN 준비: `productCount`는 1~25 정수로 계정 seed 전에 검증, 기본 1개 유지. 추가 상품은 동일 QA ID/판매자/소분류 내 가상 공개 상품으로 만들고 reset은 정확한 제목 접두사의 상품만 지운 뒤 기존 계정 reset을 수행한다. 로컬 목표 DB 시험은 환경상 skip이므로 통과로 표시하지 않는다. 다음은 수정 커밋의 WSL DB 목표/전체 시험과 잔류 확인 후 브라우저 QA.
- GREEN/브라우저: exact SHA `8ddb46b`의 WSL 개발 DB 목표 fixture 시험 2 pass·0 fail·0 skip, 사후 계정/상품/개정/공개/분류/판매자 0. QA ID `c4e7a219`로 가상 계정 5·공개 상품 25를 생성하고 API `/ready`·웹 검색 200, Chrome 새 시험 탭에서 검색 결과 24건과 “상품 더 보기”를 확인했다. 버튼 클릭 후 25건·고유 상품 링크 25·검색어 유지·버튼 제거, 새로고침 뒤 버튼에 키보드 Enter로도 24→25건·버튼 제거를 확인했다. 이 검증은 HTTP 개발 화면의 실제 클릭 증거이며 200% 확대·인수 증거는 아니다.
- 정리/회귀: 시험 탭만 닫고 정확한 `shoppingmall-s24-page-web-c4e7`/`shoppingmall-s24-page-api-c4e7`을 stop/remove한 뒤 `c4e7a219`만 fixture reset. accounts/sellers/categories/products/revisions/publications/inventory 7종 0, 해당 컨테이너·9091/9092 listener 0, checkout clean. 이어 exact SHA `8ddb46b` Node 24 개발 DB 전체 시험 **165건 중 158 pass·7 환경 skip·0 fail**, 종료 코드 0, 사후 accounts/products/revisions/images 각 0. 공유 WSL의 기존 타 프로젝트 컨테이너는 그대로 두었다. 사전 읽기 전용 QA ID 확인 명령의 SQL 셸 인용 오류 1회는 다른 0행 확인과 사후 전체 잔류 검사로 보정했고 자료 변경은 없었다.

## 미검증 기록 — 2026-09-28 로컬 file 시안 확대 재확인 정책 차단

- 담당/대상: 어울 단일 writer, 기존 `file:///D:/Project/shoppingmall2/.worktrees/flat-v2-prototypes/docs/design/assets/home-flat-v2.html` 사용자 시안 탭의 200% 확대 재확인 시도.
- 결과/조치: 브라우저 제어 정책이 `file:` URL 접근을 차단했고 `http:`/`https:`만 허용한다고 반환했다. 금지된 탭 접근을 다른 브라우저·간접 명령으로 우회하지 않았다. 사용자 탭/설정·상품 DB·코드는 변경하지 않았다. 브라우저 정책 차단 1종, 동일 원인 반복 0.
- 판정/다음: 실제 200% 확대는 계속 미검증이다. 기존 HTTP 개발 화면의 430/640px viewport 결과와 동일시하지 않는다. 시안 file 탭으로의 접근에는 추가 시도하지 않고, 승인된 HTTP 제품 화면에 대해 별도 검증 가능한 환경이 있을 때 진행한다.

## 진행 중 — 2026-09-28 S2.4 공개 검색 24개 이후 더 보기

- 담당/범위: 어울 단일 writer, `codex/flat-v2-prototypes`. 기존 `GET /catalog/products?page=` 계약으로 고객 검색의 첫 24개 이후 페이지를 이어 붙인다. DB/schema/공개 API/권한·상품 노출 조건은 변경하지 않는다. 수동 더 보기이며 개인화·무한 스크롤로 표시하지 않는다.
- RED→GREEN: 구매자 화면의 24개 결과에서 더 보기 버튼이 없는 RED를 확인한 뒤 페이지 번호, 요청 중 중복 클릭 차단, 기존 조건 유지, 반환 상품 ID 중복 표시 방지, 마지막/빈 페이지 버튼 숨김, 추가 조회 오류와 기존 결과 분리를 구현했다. 화면 목표 시험 9 pass·0 fail. 기존 DB 검색 시험에는 식별 가능한 `qa-<run>` 가상 공개 상품 25개로 24+1 페이지와 중복 없는 ID를 확인하는 검사를 추가했고 원래 `finally`의 정확한 fixture ID 정리를 유지한다.
- 로컬 검증: 루트 164건 중 136 pass·28 DB/환경 skip·0 fail, PR 본문 검사 8 pass, typecheck·lint·production build·diff check 통과. DB 시험은 로컬에서 skip이므로 WSL 실제 개발 DB 검증 전에는 통과로 보지 않는다. 실제 브라우저 25개 더 보기·200% 확대/인쇄/인수는 별도 미검증. 동일 근본 원인 반복 0.
- WSL 재현: exact SHA `042254f`를 지정 checkout에 fast-forward한 뒤 Node 24 일회성 컨테이너에서 개발 DB 연결 전체 시험 **164건 중 157 pass·7 환경 skip·0 fail**, 종료 코드 0. 25개 식별 가상 공개 상품은 24+1 두 응답·중복 없는 ID를 확인하고 `finally`에서 정리됐다. 사후 accounts/products/stock_change_requests/product_images 각 0, WSL checkout clean. 브라우저 버튼 실제 클릭은 아직 이 시험의 증거가 아니다.

## 진행 중 — 2026-09-28 S3.1 발송 주문별 내부 합계 계산

- 담당/범위: 어울 단일 writer, `codex/flat-v2-prototypes`. 상품·재고 S2 Stage 완료나 S3 공개 견적 API 확정 없이 기존 내부 발송 묶음에 원화 정수 합계를 계산하는 순수 함수만 보강한다. DB/schema/공개 API/권한·프로모션 배분/주문 저장은 변경하지 않는다.
- RED→GREEN: `quoteShipments` 미구현으로 목표 시험 RED. 직접 발송 A 58,000원 무료, 어울몰 발송 18,000원+배송비 3,000원, 직접 발송 B 44,000원은 별도 승인된 40,000원 무료배송 정책을 공급하면 무료로 계산해 3발송 주문 상품 120,000원+배송 3,000원=123,000원임을 검증했다. 빈 장바구니·원화 합계 안전 정수 초과는 거부한다. 호출자가 서버의 최신 가격과 승인된 유효 배송 정책을 공급해야 하며 이 순수 함수는 이를 DB에서 확인하지 않는다.
- 로컬 검증: 목표 5 pass·0 fail, 루트 163건 중 135 pass·28 DB/환경 skip·0 fail 및 PR 검사 8 pass. typecheck·lint·production build·diff check 통과. 실제 서버 견적·프로모션·예약·통합 결제와 전체 Stage/UAT는 미검증. 기능 오류 0, 반복 근본 원인 0. 다음은 exact SHA WSL DB 전체 회귀·잔류 자료 확인.
- WSL 재현: exact SHA `917e4d9`를 지정 checkout에 fast-forward하고 Node 24 일회성 컨테이너와 개발 DB를 연결한 전체 시험 **163건 중 156 pass·7 환경 skip·0 fail**, 종료 코드 0. 사후 accounts/products/stock_change_requests/product_images 각 0, WSL checkout clean. 내부 합계 계산에 국한하며 주문 저장·실견적·사용자 인수는 계속 미검증이다.

## 진행 중 — 2026-09-28 S3.1 장바구니 선택 수량·제거 내부 규칙

- 담당/범위: 어울 단일 writer, `codex/flat-v2-prototypes`. S2 새 공개 상품 수정 API의 직접 승인 답변 전까지 S3.1의 독립된 장바구니 선택값 불변 연산만 선행한다. 기존 DB/schema/공개 API/권한/상품 가격·재고 계약을 변경하지 않는다.
- RED→GREEN: `apps/api/test/cart-selection.test.mjs` 3건을 먼저 작성해 모듈 부재 RED를 확인했다. `apps/api/src/checkout/cart-selection.ts`에서 같은 옵션 합산, 고객이 직접 입력한 양의 정수 수량 변경, 항목 제거, 잘못된 값·중복 상태·안전 정수 초과 차단을 구현했다. 원본 선택값은 변경하지 않는다.
- 로컬 검증: 목표 3 pass·0 fail; 루트 `pnpm test` 162건 중 134 pass·28 환경/DB skip·0 fail 및 PR 본문 검사 8 pass; `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check` 통과. 기능 오류 반복 0.
- 한계/다음: 이는 가격·재고를 신뢰하지 않는 내부 선택 의도 계산일 뿐 화면 장바구니 CRUD, DB 영속화, 서버 재견적·예약·결제는 아니다. S2/S3 Stage 완료나 사용자 인수로 판정하지 않는다. exact commit WSL DB 전체 회귀와 잔류 자료 확인 후 별도 기록한다.
- WSL 재현: exact SHA `4e9f832`을 지정 `/home/daon/deploy/shopping`에 fast-forward하고 Node 24 일회성 컨테이너·개발 DB 연결의 전체 루트 시험을 실행했다. **162건 중 155 pass·7 환경 skip·0 fail**, 명령 종료 코드 0. 사후 accounts/products/stock_change_requests/product_images 각각 0, checkout clean. 7 skip과 실제 UI·예약·주문·인수는 미검증으로 유지한다.

## 진행 중 — 2026-09-28 S3.1 독립 계산 규칙 선행 검증

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@045eb10`. S2 상품 수정의 새 공개 API 승인 대기 중에도 다른 시스템에 영향이 없는 S3.1 내부 순수 계산만 진행한다. 이것은 S2 완료 판정이나 S3 Stage 선행 게이트 통과가 아니다.
- 승인된 입력/범위: PRD 7.4·배송비 규칙과 `docs/design/DELIVERY_SCOPE_ADDENDUM.md`의 발송 방식별 묶음/판매자별 직접 발송·각 발송 주문 할인 전 50,000원 기준을 사용한다. 상품 옵션·판매자·수량·원화 단가의 가상 값으로 3개 발송 주문과 49,999/50,000/52,000(할인 후 47,000) 경계 시험을 RED→GREEN으로 작성한다.
- 영향·제외: `apps/api/src/checkout/`의 내부 순수 함수와 단위시험만 신규 생성, DB/schema/공개 API/인증·권한/주문 예약·실프로모션/외부 비용은 변경하지 않는다. 판매자별 승인된 배송 정책은 호출자가 인자로 공급한다. 실제 DB/웹 장바구니·최종 견적 합격으로 확대 해석하지 않는다.
- RED→GREEN: 신규 내부 모듈 부재 `ERR_MODULE_NOT_FOUND`로 목표 시험 RED, 구현 뒤 직접 판매자 A/B와 어울몰 발송 3묶음·할인 전 49,999/50,000원·비정상 수량/원화 오버플로 3 pass·0 fail. 첫 `apply_patch`는 신규 부모 폴더 부재로 1회 거부되어 정확한 `apps/api/src/checkout` 디렉터리만 만든 뒤 같은 패치를 적용했다. 제품 코드 오류나 사용자 자료 변경은 없고 같은 근본 원인 반복 0.
- 로컬 회귀: `pnpm test` 총 158건 중 130 pass·28 DB/환경 skip·0 fail, PR 본문 8 pass, typecheck·lint·API/웹 production build와 `git diff --check` 통과. 로컬 DB skip은 실제 DB 통합 PASS가 아니며 WSL exact commit 회귀는 push 뒤 별도 수행한다.
- WSL 재현: exact SHA `57129b7`을 지정 checkout으로 fast-forward 후 Node 24 일회성 컨테이너에서 실제 개발 DB 연결 전체 루트 시험 158건 중 **151 pass·7 환경 skip·0 fail**, 종료 코드 0. 사후 DB accounts/products/stock_change_requests/product_images 각 0, checkout clean. 이 순수 계산은 아직 장바구니·예약·판매자 정책 조회·실프로모션/결제에 연결되지 않았으며 S3.1/Stage 전체 완료 증거가 아니다.
- 추가 경계: 어울몰 발송에 서로 다른 생산 판매자 A/B의 상품을 함께 넣으면 하나의 50,000원 발송 묶음이 되고, A의 직접 발송 23,000원은 별도 묶음·배송비 3,000원임을 목표 4 pass·0 fail로 검증했다. 판매자 원본 ID는 각 상품 행에 보존한다. 해당 테스트 보강 후 WSL 전체 회귀는 아직 재실행 전이며 별도로 기록한다.
- 추가 WSL: exact SHA `89f5802`의 Node 24 일회성 시험에서 배송비·발송 묶음 단위시험 4 pass·0 fail·0 skip, checkout clean. 이 보강은 테스트만 변경했으며 위 전체 158건 WSL 회귀는 이전 SHA `57129b7` 증거임을 구분한다.

## 2026-09-28 최신 S1/S2 WSL 전체 회귀

- 담당/브랜치: 어울 단일 writer, 지정 WSL checkout exact SHA `8ee182a`. `local-postgres/shoppingmall` 연결의 Node 24 일회성 컨테이너에서 루트 `node --test-concurrency=1 --import tsx --test` 실행.
- 결과: 총 **155건, 148 pass·7 skip·0 fail**, 명령 종료 코드 0. 새 미승인 재고 증가/상품 개정 승인 및 병행 호출 시험을 포함한다. 환경 조건으로 건너뛴 7건·외부 AV 최신 정의·운영 연동·실브라우저 확대·인수는 PASS가 아니다.
- 사후: DB accounts/products/stock_change_requests/product_images 각 0, WSL checkout `8ee182a` clean. 이번 전체 회귀 실행 오류 0, 같은 근본 원인 반복 0. S1/S2 Stage PR·통합 병합·남은 S2 기능은 여전히 미완료다.

## 진행 중 — 2026-09-28 S2.4 실제 브라우저 200% 확대 재시험

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@daea5f7`. 이전 in-app browser 단축키 시험은 실제 배율이 불변이었으므로, 별도의 새 Chrome 시험 탭에서 브라우저 확대가 가능한지 확인한다. 기존 사용자 탭·설정은 건드리지 않고 시험 탭만 사용한다.
- 임시 자원: WSL loopback 9091의 `shoppingmall-s24-zoom-chrome-web-daea` 일회성 Web 컨테이너, 시험용 Chrome 새 탭 1개. 필요 시 읽기 전용 API 응답용 `shoppingmall-s24-zoom-chrome-api-daea`를 9092에만 켠다. 사전 9091/9092 listener·이 이름의 컨테이너 0, WSL SHA `daea5f7` clean. DB 자료 생성 없음. 종료 시 정확한 탭/컨테이너만 닫고 포트·DB 잔류를 확인한다.
- 판정 기준: 실제 브라우저 배율을 관측해 200%인지 확인한 뒤 홈/상품검색의 가로 넘침·검색 입력·키보드를 검사한다. 단축키가 배율을 바꾸지 못하면 실제 200%는 미검증으로 남기며 viewport 축소를 대신 제시하지 않는다. 사용자 브라우저 확대 설정이 바뀌면 반드시 원래 값으로 복원한다.
- 실제 결과: WSL exact SHA `f468624`의 Web·API 일회성 서버 HTTP 200(`/ready` 포함)에서 Chrome 새 시험 탭의 홈을 열었다. Chrome 기본 상태는 `devicePixelRatio=1`, `innerWidth=1898`, 문서 client/scroll 각 1883, 검색 입력 계산 글자 16px. `Control+plus` 입력 뒤에도 이 네 관측값과 접근성 상태가 불변이었다. 따라서 Chrome 자동 제어에서도 **실제 200% 확대가 적용되지 않았고 해당 QA는 미검증**이다. 화면 폭을 줄여 200% PASS로 표기하지 않는다. API 연결 전 홈 오류 표시는 API 시작 후 로딩 상태로 바뀌었으며 제품 결함 판정에 사용하지 않는다.
- 정리: 해당 Chrome 시험 탭 닫음, 이름을 기록한 Web/API 두 컨테이너만 stop·remove, 9091/9092 listener·이름 일치 실행 컨테이너 0, DB accounts/products 0, WSL checkout clean. 첫 시작 직후 `web:000`과 Chrome 일시적 CDP reload timeout 각 1회는 서버 기동 대기/브라우저 제어 지연으로, 이후 200 및 상태 조회로 구분했다. 사용자 브라우저 배율 값은 변하지 않아 복원할 변경이 없다. 실제 수동 브라우저 배율 QA는 후속 게이트다.

## 진행 중 — 2026-09-28 S2.2 재고 입력·상품 승인 병행 회귀

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@d287f00`. 기존 고유 가상 판매자/상품 시험의 공개 옵션을 재사용하고 상품 개정 승인과 구옵션 재고 감소 입력을 병행 호출한다. 새 fixture·schema/API/서비스 계약 변경은 없다.
- 기대: 재고 입력이 먼저 확정되면 새 같은 이름 옵션은 감소값 4·4를 승계한다. 상품 승인이 먼저 확정되면 새 옵션은 기존 8·6을 승계하고 구옵션 입력은 `Published option required`로 거부된다. 두 호출 중 상품 승인 실패·교착·그 외 결과는 결함으로 조사한다. 실제 WSL DB 시험 뒤 정확한 행/파일 잔류 0을 확인한다.
- 결과: exact SHA `9120c11`의 WSL 실제 DB 단일 병행 시험 1 pass·0 fail·0 skip. `Promise.allSettled`의 두 허용 직렬화 결과만 인정하는 회귀 검사를 추가했고 승인 성공·최신 공개 개정·승계 재고를 확인했다. 이 한 번의 실행이 가능한 두 선후관계를 모두 실제로 관측했다는 뜻은 아니다. 로컬 동일 시험은 DB가 없어 1 skip, `git diff --check` 통과.
- 사후: DB accounts/products/stock_change_requests/product_images 각 0, WSL checkout clean. 서비스/DB/API 변경 없이 시험만 보강했다. 실행 오류·동일 근본 원인 반복 0. 명시적 두 스케줄 강제시험, S3 마지막 수량 구매 경쟁, S2 전체 Gate는 미검증이다.

## 진행 중 — 2026-09-28 S2.2 미승인 재고 증가와 상품 개정 승인 경계

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@46b888a`. 기존 `product-approve-db.test.mjs`의 고유 가상 판매자/상품과 `finally` 정리를 재사용한다. 새 상품/계정 fixture나 schema/API는 만들지 않는다.
- 목표 검증: 공개 옵션 6개에서 판매자가 8개로 직접 입력하면 보유 8·판매 가능 6 및 관리자 증가 요청 대기다. 그 상태에서 다음 상품 수정안을 승인하면 같은 옵션명에 8·6만 승계하고 구옵션 대기 요청은 `superseded`, 뒤늦은 승인 시도는 거부되어야 한다. 먼저 기존 코드의 실제 WSL DB 시험으로 확인하며 실패 시 원인을 좁힌다.
- 검증/정리 경계: 지정 WSL `local-postgres/shoppingmall`의 고유 시험 행만 사용하고 종료 후 accounts/products/requests/images 0을 확인한다. 이번 순차 교차검증을 동시 실행·주문 예약·S2 전체 검증으로 과장하지 않는다.
- 실제 결과: exact SHA `8a10751`에서 단일 WSL DB 시험 1 pass·0 fail·0 skip. 같은 옵션의 새 개정에 보유 8·판매 가능 6이 승계되고, 새 옵션은 0, 구옵션 대기 증가 요청은 `superseded`, 뒤늦은 관리자 증가 승인은 거부됐다. 로컬 단일 시험 1 skip은 DB 부재 때문이며 GREEN 근거로 사용하지 않는다. `git diff --check` 통과.
- 사후: WSL 시험 DB accounts/products/stock_change_requests/product_images 각각 0, 지정 checkout clean. 제품 코드는 변경하지 않고 기존 테스트만 20행 보강했다. 기능 오류 0, 반복 근본 원인 0. 동시 실행 경쟁·주문 예약과 전체 Stage/UAT는 여전히 미검증이다.

## 진행 중 — 2026-09-28 S1.3 가상 고객 탈퇴 요청 실브라우저 재검증

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@73a1822`. 과거 신산님이 시험임을 모르고 취소한 흐름을, 실제 계정이 아닌 고유 가상 고객으로 명확히 구분해 재검증한다. 기능·권한·DB schema는 변경하지 않는다.
- 임시 자료/자원 계획: WSL 지정 `local-postgres/shoppingmall`에만 QA ID `b17e2d90`의 `qa+…@example.invalid` 계정 5개와 판매자 3개를 기존 `qa-fixture.ts`로 생성한다. 웹/API 일회성 실행 이름은 `shoppingmall-s1-delete-web-b17e`·`shoppingmall-s1-delete-api-b17e`, build 컨테이너는 `shoppingmall-s1-delete-build-b17e`(자동 제거), loopback 9091/9092와 새 시험용 in-app browser 탭 1개만 쓴다. 사전 지정 포트/이름 점유 0, DB 전체 accounts 0, WSL SHA `73a1822`를 확인했다.
- 수명·정리: 시험 직후 정확한 QA ID만 fixture reset으로 삭제하고 계정/탈퇴 요청/판매자 잔류 0을 확인한다. 시험용 탭·위 두 컨테이너만 닫고 9091/9092 listener 0을 확인한다. QA 비밀번호·DB 비밀번호는 출력·기록하지 않는다. 장애 시 데이터와 자원을 임의로 덮지 않고 정확한 ID를 조사한다.
- 합격 경계: 고객 로그인→탈퇴 요청 확인→접수 결과와 DB 상태·audit를 실제 브라우저/DB에서 대조한다. 이는 **요청 접수** 검증이며 실제 계정 삭제·운영 승인·UAT가 아니다.
- 실제 결과: WSL exact SHA `8332730`의 기존 API/Web 산출물을 지정 Node 24 일회성 컨테이너에서 기동하고 `/ready`·웹 HTTP 각 200을 확인했다. 첫 즉시 curl의 `api:000`은 기동 지연으로 재시도 후 `200`이었으며 제품 실패가 아니다. in-app browser의 별도 시험 탭에서 `qa+b17e2d90-customer@example.invalid` 가상 고객으로 로그인→내 계정→탈퇴 요청 확인→`요청 접수 확인`을 수행해 “탈퇴 요청이 접수되었습니다. 계정은 아직 삭제되지 않았습니다” 표시를 확인했다. DB 읽기 전용 대조에서 해당 계정 1건, 탈퇴 요청 1건, `customer.deletion_request` 감사 이력 1건이었다.
- 정리 검증: 시험 탭 닫음, `qa-fixture.ts reset`으로 정확한 `b17e2d90` 계정 5건 정리, 이름이 기록된 Web/API 두 컨테이너만 stop·remove. 사후 DB `accounts/account_deletion_requests/sellers` 각각 0, 9091/9092 listener와 해당 이름의 실행 컨테이너 0, WSL checkout clean. API/화면 코드는 변경하지 않았다. 오류 범주: 기동 전 확인 1회 재확인으로 해소, 반복 근본 원인 0.
- 미검증: 실제 계정 삭제, 운영자 처리, 사용자 인수·Oracle 배포·외부 알림은 이번 가상 계정 요청 접수 검증 범위가 아니다. 다음은 S2의 남은 승인된 구현/검증을 진행한다.

## 2026-09-28 S2 전체 WSL 시험 회귀

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@2a67e45`. 지정 WSL checkout의 정확한 커밋에서 Node 24 일회성 컨테이너로 루트 `node --test-concurrency=1 --import tsx --test` 전체 시험을 실제 `local-postgres/shoppingmall`에 연결해 실행했다.
- 결과: 총 155건 중 **148 pass, 7 skip, 0 fail**, 명령 종료 코드 0. 기존 5품목 QA fixture DB 시험도 통과했다. 환경 조건에 따른 7개 건너뜀과 실제 브라우저·운영 연동은 PASS로 간주하지 않는다.
- 사후 확인: 정확한 WSL checkout `2a67e45` clean, `accounts/products/stock_change_requests/product_images` 각각 0행, `shoppingmall-s24` 이름의 실행 컨테이너 0. 계정·상품의 신규 QA fixture 실행은 없었다.
- 오류·조치: 처음 잔류 확인 질의에서 존재하지 않는 `identity.accounts` schema를 사용해 1회 실패했다. 실제 `public.accounts` 등 테이블명을 조회한 뒤 동일한 읽기 전용 질의로 0행을 확인했다. 시험 실패나 데이터 변경은 아니다. 같은 원인 반복 0.
- 미완료/다음: 전체 회귀 PASS는 S2 전체 완료나 사용자 인수 증거가 아니다. 기존 구현과 계획·현황을 대조해 남은 S2 계약을 진행한다. 판매자 공개 상품 수정 HTTP·화면은 공개 API 신설의 직접 승인 응답을 기다리며, 승인 전에는 독립된 범위만 수행한다.

## 2026-09-28 S2 기존 시험 카탈로그 중복 착수 정정

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@80dccaf`. 좁은 파일 목록 확인으로 이미 구현된 `apps/api/scripts/qa-catalog-fixture.ts`와 기존 DB 시험을 놓쳐, 같은 파일의 대체 시험을 커밋했다. 기존 fixture의 5품목·3판매자/대소분류·발송·가상 재고 기능과 이전 실제 DB 시험 기록을 확인했다.
- 조치: 새 QA ID `c7a9e210`의 fixture 실행·계정/상품 생성은 **하지 않았다**. Git 이전 커밋의 시험 파일 내용을 직접 대조한 뒤 기존 시험으로 복원했다. 신규 fixture 계획은 취소하며 S2 완료 증거를 중복 주장하지 않는다. 이 파일을 다시 변경하기 전에 전체 파일 인덱스와 과거 `WORK_STATUS`를 확인한다.

## 진행 중 — 2026-09-28 S2.4 화면 확대·키보드 검증

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@a7c04ca`. 제품·DB 자료 변경 없이 지정 WSL checkout의 동일 SHA production build로 빈 카탈로그 홈/상품 목록을 실제 브라우저에서 검증한다.
- 임시 자원: 동일 SHA 웹 재빌드용 `shoppingmall-s24-zoom-build-a7c0`(자동 제거)과 `shoppingmall-s24-zoom-api-a7c0`·`shoppingmall-s24-zoom-web-a7c0` 두 실행 컨테이너를 WSL loopback 9092/9091에만 사용, 시험용 in-app browser 새 탭 1개를 사용한다. 사전 해당 포트·컨테이너 점유 0, accounts 0 확인. 검사 후 정확한 자원·시험 탭을 닫고 포트·DB 잔류 0을 확인한다.
- 검증 예정: 홈/상품목록의 200% 확대 시 주요 동작과 가로 넘침, 검색 입력·메뉴의 키보드 접근. 상품·판매자 데이터가 없는 화면이므로 채워진 카드·구매 흐름의 검증으로 확대 해석하지 않는다.
- 실제 결과: exact SHA `55ca391`의 WSL Node24 API·웹 production build 통과, API `/ready`와 홈 HTTP 200. 실제 in-app browser 기본 1280px에서는 document client/scroll 각 1265px. 430×844 viewport의 홈은 client/scroll 각 415px로 가로 넘침이 없고 검색·메뉴·히어로·기획전이 표시된다. 검색창→검색 버튼→로그인→홈/상품/기획전/판매자 이야기의 Tab 순서와 `:focus-visible`을 확인, Enter로 ‘고추’ 검색 시 `/products?q=...`의 빈 결과 화면으로 이동했고 해당 430px 화면도 client/scroll 각 430px이다.
- 미검증/오류: in-app browser의 `Ctrl+plus` 5회와 `Ctrl+equal` 1회 후에도 관측 배율(devicePixelRatio 1)·내부 폭이 불변이어서 **실제 브라우저 200% 확대는 미검증**이다. 좁은 viewport 시험을 실제 확대 PASS로 대체하지 않는다. 상품·분류·판매자 데이터가 없는 화면이어서 채워진 카드·상품 상세·결제는 미검증. 제품 동작 오류 0, 확대 제어 제한 1종.
- 정리: 시험 viewport reset·임시 탭 종료, 기록한 build 컨테이너 자동 제거 및 API/Web 두 컨테이너만 종료·제거. 사후 이름 일치 컨테이너 0, 9091/9092 listener 0, DB accounts/products 각 0, WSL checkout `55ca391` clean.

## 진행 중 — 2026-09-27 S2.2 공개 상품 개정·옵션 재고 승계

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@a3cc24a`. 신산님의 같은 옵션명 재고 승계 결정을 승인된 S2.2 범위 안에서 구현한다. 새 schema·외부 서비스·운영 데이터 변경은 하지 않는다.
- RED 시험: 기존 상품 승인 후 판매자 소속 위반 개정 거부, 새 개정의 사진 별도 사본·공개 구버전 불변, 승인 시점 동일 옵션의 현재 재고 6개 승계, 신규 1kg 옵션 0개, 구버전 재고 이력 보존을 `product-approve-db.test.mjs`에 추가한다. 현재 WSL 정식 개발 DB에는 기존 사용자 0명이며 시험만의 UUID 자료를 생성하고 `finally`에서 정확히 정리한다. 사진은 전용 임시 `shoppingmall-upload-*` 폴더에만 생성하고 시험 종료 시 제거한다.
- 다음: RED를 실제 WSL DB에서 확인하고 기존 schema를 이용한 서비스 구현→GREEN→전체 회귀. 별도 공개 API/DB 계약 변경이 필요하면 정확한 경계를 보고하고 독립 작업을 계속한다. 사용자 인수/Oracle은 미검증.
- 현재 결과: 새 수정 초안 서비스는 공개 버전을 유지하며 사진 파일을 별도 비공개 키로 복사한다. 관리자 승인 트랜잭션에서 기존 공개 옵션과 같은 이름의 승인 시점 재고만 새 버전에 옮기고 새 옵션은 0개다. 지난 옵션으로 재고를 다시 올리는 행위는 판매자 서비스에서 거부하며, 판매자 목록은 최신 개정 상태를 보여 준다. WSL 지정 DB 실제 시험은 기능 부재 RED→수정 후 1 pass·0 fail; 목록 구버전 노출과 구버전 재고 입력도 별도 RED→GREEN으로 확인했다. 사후 DB accounts/products/stock requests/images 0.
- 로컬 검증: `pnpm test` 155건 중 127 pass·28 DB/환경 skip·0 fail, PR 본문 8 pass; typecheck·lint 통과. 기본 sandbox에서 `pnpm build`가 `.next/trace` 쓰기 EPERM으로 2회 실패했으며, D: worktree 쓰기 권한으로 동일 명령 단독 재실행해 API·웹 production build 통과. sandbox 실패를 제품 결함으로 단정하지 않는다.
- 추가 회귀: exact SHA `a640ef4`의 지정 WSL `local-postgres/shoppingmall`에서 상품 초안·재고·승인·공개 검색 DB 시험을 `--test-concurrency=1`로 실행해 5 pass·0 fail·0 skip. 시험 뒤 DB accounts/products/stock requests/images 각각 0. 전체 DB suite와 실제 판매자 상품 수정 화면은 아직 미검증.
- 오류·복구: 새 메서드 UUID 검사에서 구간 하나 누락 1회→기존 검사와 비교해 수정; RED 시험의 `finally`가 재고 요청보다 옵션을 먼저 삭제해 FK 실패 1회→잔류 QA ID를 읽기 전용 확인 후 정확한 시험 행만 트랜잭션 삭제(사후 0), 정리 순서를 수정. 같은 근본 원인 3회 연속 없음.
- 미완료: 상품 수정의 실제 판매자 HTTP·화면 연결은 공개 API 추가 승인 응답 대기. 판매중지 요청, 최신 버전 초안 취소/삭제, 수정 전후 실제 브라우저·동시 재고 경쟁·전체 WSL 통합 회귀는 미검증. 기존 S2.2 전체 완료 또는 S2 Stage 종료를 주장하지 않는다.

## 진행 중 — 2026-09-27 S0 현재 명령표와 안전 경계 정리

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@67186de`; 문서만 변경하고 DB/schema/Secret/서비스는 건드리지 않는다.
- 발견: `docs/DEVELOPMENT_ENVIRONMENT.md`의 초기 명령표에는 WSL checkout 생성 전·migration 코드 부재 시절의 미정 항목이 남아 있다. 현재 WSL checkout·QA fixture와 실제 테스트 결과를 날짜가 있는 별도 최신 섹션에 기록한다. WSL 호스트에는 `pnpm`이 없으며 Node 24 컨테이너 실행은 검증됐다. `apps/api/scripts/migrate.ts`는 실제 적용만 하고 dry-run 스위치가 없으므로 공유 개발 DB에서 dry-run처럼 실행하지 않는다.
- 검증/다음: 기존 package scripts·migration 옵션·QA fixture를 코드와 대조했고, 문서 변경 후 링크/명령 경로·diff를 확인한다. 분리 DB의 migration 시뮬레이션은 정확한 schema 승인/대상 확정 전 미검증으로 남긴다.
- 신산님 직접 결정: 이미 공개된 동일 상품의 새 수정안이 관리자 승인되면 **같은 옵션명**의 기존 재고를 새 버전으로 승계한다. 새 옵션은 판매 가능 0개에서 시작해 관리자 재고 증가 승인을 받아야 한다. 이 선택은 S2.2 상품 수정 구현의 재고 계약이며, 가격/분류/사진 승인 절차와 기존 공개 버전 불변 원칙은 유지한다.

## 진행 중 — 2026-09-27 S2.4 핵심 화면 색상 대비

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@6310813`. 산지·상품·거래 구조와 무관한 승인 Flat v2 황금/크림 색상 내 접근성 보정이며 schema/API/권한 변경 없음.
- 근거/RED 후보: W3C WCAG 2.2 1.4.3 일반 작은 문자 최소 4.5:1, 1.4.11 식별에 필요한 UI 경계 최소 3:1. 현재 CSS 수치 계산상 기본 버튼 흰 글자/황금 배경 4.19, 히어로 작은 eyebrow/히어로 배경 4.26, 검색 힌트/헤더 3.99, 검색·보조 버튼 경계/크림 2.96, 입력 경계/크림 2.23. 화면별 실제 합성·전체 요소 검사는 별도로 남기며 이 다섯 조합을 우선 목표 테스트 RED→GREEN으로 고친다.
- 예상 변경/검증: `apps/web/app/styles.css`의 해당 색상 값만 최소 조정하고 `apps/web/test/contrast.test.mjs`에 명암비 계산 회귀 시험 추가. 로컬 전체 test/typecheck/lint/build 및 WSL production 화면·대비 재확인 후 push/pull, 상품/사용자 데이터는 생성하지 않는다. 동일 오류 3회 반복 시 중단 보고.
- RED→GREEN/로컬: 6개 목표 조합은 각 4.19/4.26/3.99/2.96/2.32/2.96으로 모두 RED. 기존 황금/크림 계열을 유지한 채 글자·경계선을 약간 짙게 하였고 같은 입력 경계의 검색 필터·textarea도 함께 검사했다. 최종 목표 8 pass·0 fail, 로컬 전체 155건 중 127 pass·28 환경별 skip·0 fail, PR 본문 검사 8 pass, typecheck/lint/API·Next production build 통과. 정적 색상 계산만으로 모든 화면·상태의 실제 WCAG 준수를 주장하지 않는다.
- 다음 WSL 자원: 정확한 변경 SHA를 SSH 별칭 push→WSL 지정 checkout pull/build 후 임시 컨테이너 `shoppingmall-s24-contrast-api`/`shoppingmall-s24-contrast-web`를 127.0.0.1:9092/9091에서 실행, 빈 개발 DB 공개 홈/로그인 화면의 실제 계산된 주요 색상을 브라우저에서 확인. 테스트 계정/상품은 만들지 않고 끝나면 두 컨테이너와 시험 탭만 종료, 포트/계정 0을 확인한다.
- 실제 브라우저 발견: `e3476aa` WSL build·API/Web 200에서 홈 시각 배치와 `hero .eyebrow=rgb(119,85,27)`, 검색 테두리 `rgb(164,125,59)` 적용 확인. 반면 정적 시험이 검사한 `.search-hint`는 화면에서 사용되지 않고, 실제 검색 placeholder는 브라우저 기본 `rgb(117,117,117)`/크림 배경으로 약 4.43:1이었다. 기존 시험은 이 요소를 검증하지 못하므로 placeholder pseudo-element 직접 검사로 RED→GREEN 보정한다. 임시 두 컨테이너는 재빌드 전에 정확히 종료한다.
- 추가 RED→GREEN: 실제 placeholder pseudo-element를 겨냥한 시험은 CSS 규칙 부재로 1 fail(기존 7 pass). `color:#756a55;opacity:1`을 명시해 목표 8 pass·0 fail. 현재 시험 탭/임시 컨테이너 2개 종료. 재빌드와 최종 브라우저 계산값·전체 회귀는 아직 남았다. 기존 미사용 `.search-hint` 수정 결과는 화면 대비 증거로 세지 않는다.
- 최종 대표 화면 검증/정리: `a71e5bd` SSH 별칭 push→WSL 지정 checkout pull 및 Next production build 통과, API/Web 200. 실제 브라우저 홈 computed style은 검색 placeholder `rgb(117,106,85)`, 헤더 `rgb(255,250,241)`, 검색 경계 `rgb(164,125,59)`, 히어로 eyebrow `rgb(119,85,27)`/배경 `rgb(242,230,200)`이며 문서 가로 clientWidth/scrollWidth 각 1265px. 로그인 화면은 기본 버튼 배경 `rgb(139,104,40)`/흰 글자, 입력 경계 `rgb(161,133,86)`/흰 표면 확인. 목표 정적 8 pass와 로컬 전체 test/typecheck/lint/build 통과, WSL 시험 계정·상품 생성 없음. 브라우저 탭/정확한 임시 두 컨테이너 종료, 사후 포트 listener·컨테이너 0, DB accounts 0, checkout `a71e5bd` clean. 실제 200% 확대·전체 화면/상태의 전수 대비·상품 데이터가 있는 카드 검증은 여전히 미검증이며 S2 전체 gate/인수 완료 아님. 동일 근본 원인 오류 3회 반복 없음.

## 진행 중 — 2026-09-27 S1.3 탈퇴 요청 실제 브라우저 재검증

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@3424236`. 신산님이 기능 유지를 명시했으므로 탈퇴 요청은 삭제하지 않으며 실제 영구 삭제와 구분한다.
- 시험 계약/자원: WSL 지정 개발 DB `local-postgres/shoppingmall`에 QA ID `7ac93f21` 가상 5계정 fixture만 생성하고, 이름이 고정된 임시 API/Web 컨테이너 `shoppingmall-s13-deletion-api-3424`/`shoppingmall-s13-deletion-web-3424`를 127.0.0.1:9092/9091에서 실행한다. localhost 고객 로그인→확인창 수락→접수 메시지/DB 요청/중복 요청을 확인한다. 시험이 성공·실패 어느 쪽이든 이 ID의 fixture만 reset하고 이번 임시 컨테이너·브라우저 탭만 종료한다. 다른 계정·서비스에는 쓰지 않는다.
- 사전 확인: 데스크톱 시험 자원 종료 후 9091/9092 listener 0, 전체 accounts 0. 이 시험은 탈퇴 **요청**만 검증하고 계정 영구 삭제·관리자 후속 처리·Oracle 인수 완료의 증거로 삼지 않는다. 동일 오류 3회 연속이면 재시도 중단·원인/예외 보고한다.
- 실제 결과: 가상 고객 로그인→구매자 역할→배송지·알림/탈퇴 요청 화면 및 ‘즉시 삭제되지 않음’ 안내까지 실제 브라우저에서 확인. 확인창을 띄우는 버튼을 누른 뒤 브라우저 제어 연결이 재초기화되었고, 재연결도 시간 초과됐다. 이전 회차와 같은 확인창 제어 오류가 반복되므로 추가 브라우저 조작은 중단했다. 읽기 전용 DB 확인상 `account_deletion_requests` 0건이므로 요청 **접수 성공은 미검증**이며 제품 기능 실패로 단정하지 않는다. 별도 API/DB 계약 시험은 이미 통과했으나 실제 화면 증거의 대체물이 아니다.
- 정리/오류: QA ID `7ac93f21` fixture reset으로 정확한 가상 계정 5개 제거, 지정 임시 API/Web 컨테이너 2개 종료. 사후 accounts 0, account_deletion_requests 0, 해당 컨테이너·9091/9092 listener 0. 첫 QA ID 부재 조회에서 읽기 전용 SQL 인용 오류 1회가 있었으나 사전 전체 accounts 0을 확인하고 진행했다. 브라우저 확인창 후 제어 실패 2회(이전 동일 근본 원인 반복 포함)로 재시도 중단. 시험 탭 종료는 제어 불능으로 직접 확인하지 못했으며 임시 탭은 세션 종료 시 자동 정리 대상이다. 다음에는 확인창을 브라우저 제어로 수락할 수 있는 환경에서 재검증한다.
- 승인 범위 내 개선 설계: 고객 탈퇴 기능/HTTP 계약은 그대로 두고 고객 화면의 네이티브 `window.confirm`만 페이지 안의 명시적 확인/취소 단계로 교체한다. 실제 삭제가 아닌 요청이며, 확인 전 서버 호출 금지·취소 가능·제출 중 중복 방지·접수 결과 안내를 유지한다. `apps/web/test/customer-profile.test.mjs`에 확인 전/확인 중 표시 계약을 RED로 추가한 후 최소 컴포넌트 수정, 로컬 전체 검사와 WSL 실제 브라우저 요청/중복을 재검증한다. 새 QA fixture는 별도 ID와 자원을 기록한 뒤 생성한다.
- RED→GREEN/로컬 검증: 목표 테스트는 새 확인 컴포넌트 부재로 1 fail, 컴포넌트·기존 고객 화면 연결 후 2 pass·0 fail. `window.confirm` 제거, 페이지 안에 ‘요청 접수 확인’·‘취소’ 및 실제 삭제 아님 안내를 표시하고 확인을 눌러야 기존 POST가 수행된다. 성공 또는 409 중복이면 확인 단계를 닫는다. 로컬 전체 147건 중 119 pass·28 DB/환경별 skip·0 fail, PR 본문 검사 8 pass, typecheck/lint/API·Next production build 통과. WSL 실제 브라우저 확인은 아직 남았다.
- 다음 시험 자원: 변경 SHA를 SSH 별칭 원격에 push→WSL 지정 checkout pull/build한 뒤 QA ID `b4e2c6a9` 가상 5계정, 임시 `shoppingmall-s13-inline-api`/`shoppingmall-s13-inline-web` 두 컨테이너(127.0.0.1:9092/9091)를 사용한다. 확인 전/취소 후 요청 0, 명시적 접수 뒤 1건·중복 안내를 실제 브라우저와 DB로 검증한다. 끝나면 이 ID fixture와 이 두 컨테이너/시험 탭만 정리하고 잔류 0을 확인한다. 다른 사용자 자료와 운영 환경은 변경하지 않는다.
- WSL/실브라우저 GREEN: `ffb3a2f`를 SSH 별칭 원격 push→WSL 지정 checkout pull. WSL 호스트에 `pnpm` 실행 파일이 없어 첫 빌드 명령이 1회 실패했으나, 동일 저장소의 Node 24 컨테이너에서 Next production build 통과. API `/ready` 200·Web `/login` 200. QA ID `b4e2c6a9` 가상 고객으로 로그인→탈퇴 요청 첫 클릭 시 페이지 안 확인/취소 버튼 및 즉시 삭제 아님 안내 표시, DB 요청 0. 취소 뒤 확인 단계 닫히고 DB 0. 다시 열어 ‘요청 접수 확인’ 클릭 시 실제 화면 접수 성공 메시지, DB 요청 1·계정 5개 그대로. 재요청 시 중복 안내와 DB 요청 1 유지. 고객 로그아웃·시험 탭 종료. 이 검증은 실제 영구 삭제가 아닌 요청 접수/중복 처리다.
- 정리/미검증: fixture reset으로 정확한 QA 가상 계정 5개/해당 요청 제거, 지정 임시 두 컨테이너 종료. 사후 WSL DB accounts 0·deletion requests 0, 9091/9092 listener 및 해당 컨테이너 0, checkout `ffb3a2f` clean. 과거 네이티브 확인창에서 멈췄던 임시 탭 8은 브라우저 제어 세션 재초기화 후 접근 불가(`Tab not found`)여서 직접 종료 증거가 없고, 세션 임시 탭 자동 정리 여부는 미확인이다. 제품의 탈퇴 요청 브라우저 흐름은 새 페이지 안 확인 방식으로 통과했으나 관리자 검토/실제 영구 삭제 및 UAT/Oracle은 미검증. 동일 근본 원인 반복 시 추가 시도 없이 main agent가 대안을 적용한 결과이며 현재 기능 오류 0.

## 진행 중 — 2026-09-27 S2.4 데스크톱 화면 검증

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@10e3da5`; 제품 코드·DB schema·계정은 변경하지 않는다.
- 시험 계약/자원: WSL 지정 checkout의 기존 production build를 확인한 뒤 이름이 고정된 임시 컨테이너 `shoppingmall-s24-desktop-api-10e3`, `shoppingmall-s24-desktop-web-10e3`만 생성하고 127.0.0.1:9092/9091에서 빈 개발 DB의 공개 홈을 읽기 전용 검증한다. 1920×1080, 1440×900 실제 브라우저 viewport와 화면·가로 넘침을 확인하고, 끝나면 이번 두 컨테이너와 포트 잔류 0을 확인한다. 사용자 브라우저 탭·기타 컨테이너는 건드리지 않는다.
- 사전 상태: 현재 로컬·WSL SHA `10e3da5`, 작업 브랜치 clean, 9091/9092 listener 없음. WSL의 기존 서비스 컨테이너는 독립 작업이므로 유지한다. 실제 브라우저 확대 200%/인쇄/대비 검증과 상품 데이터가 있는 홈은 이번 범위에 포함되지 않는다.
- 예상 검증/다음: API ready와 Web 200, 지정 화면 및 읽기 전용 DOM 치수, 임시 자원 정리를 증거로 기록한다. 이후 S2.2/S2.4 미완료 제품 계약은 별도로 계속한다.
- 결과: WSL API `/ready` 200·Web 홈 200. 실제 in-app browser 1920×1080에서 문서 clientWidth/scrollWidth 각 1905px, 1440×900에서 각 1425px이며 본문 폭 1180px. 두 화면에서 검색·메뉴·히어로·기획전·상품 카테고리의 배치를 시각 확인했고 1440 전체 페이지에서 추천 상품·판매자 이야기까지 확인했다. 빈 DB이므로 카테고리/상품/판매자 카드는 빈 상태이며 콘텐츠가 채워진 화면의 배치·실제 확대 200%·인쇄·대비는 미검증으로 유지한다.
- 정리: 브라우저 viewport reset·이번 임시 탭 종료, 정확한 이름의 API/Web 컨테이너 두 개 종료. 사후 해당 컨테이너 0, 9091/9092 listener 0, `shoppingmall.accounts` 0. 오류 0. S2 전체 gate와 사용자 인수는 미완료다.

## 진행 중 — 2026-09-27 S2.3 전역 배송 정책 시험 복구 경계

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@10b1673`; 현재 제품 코드·schema·권한 변경 없음. `apps/api/test/shipping-policy-db.test.mjs`의 `finally`가 시험 전 상태를 저장하지 않고 배송비 3,000원/무료배송 50,000원 등으로 고정 복구하므로 관리자 전역값이 달라진 개발 DB를 시험하면 원래 값을 잃을 수 있다.
- 시험 계약/자원: 원본 `WSL-server`의 `local-postgres/shoppingmall`은 읽기 전용으로 유지. 정확한 임시 DB `shoppingmall_s23_restore_10b1673`을 동일 PostgreSQL 컨테이너에 1개 생성·원본 schema/빈 가상 자료를 복제하고, 그 임시 DB에만 비기본 전역값을 설정해 현재 시험의 복구 실패 RED→원본 값·잠금·수정자·수정시각 보존 GREEN을 확인한다. 수명은 이번 단일 회귀 시험 동안만이며 시험·실패 직후 정확한 임시 DB만 drop하고 부재를 확인한다. 다른 DB/서비스·Oracle·실고객 자료에는 쓰지 않는다.
- 사전 상태/오류: 원본 accounts/sellers/shipping requests 각 0, 전역 정책 3,000원/50,000원·마감 없음·잠금 3개 false. DB 목록에 동일 이름 임시 DB 없음. 첫 읽기 전용 SQL에서 셸 인용 오류 1회였고 올바른 읽기 전용 조회로 재확인했다. 코드 수정 전 실제 격리 RED와 위험 필드 전체를 확인한 뒤 테스트 정리 로직만 최소 수정한다.
- 예상 변경/검증: 위 시험 파일과 본 현황만. `pnpm test`, typecheck/lint, WSL 임시 DB의 목표 시험·복구 전후 DB 값, 원본 DB 불변, 정확한 임시 자원 잔류 0을 증명한다. 동일 근본 원인 오류 3회 연속이면 재시도 중단·예외 보고한다.
- RED/구현: 원본 DB를 임시 DB로 덤프/복구한 뒤 임시 전역값만 4,500원/65,000원·배송비/기준 잠금 true로 설정했다. 기존 시험은 `4500 !== 3000`으로 실패했고 실패 직후 임시 DB 값이 3,000원/50,000원·잠금 false로 덮여 원인을 재현했다. `apps/api/test/shipping-policy-db.test.mjs`만 시험 전 전역 행 9필드를 저장·시험 기본값 설정·finally 원본 9필드 복원하도록 수정했다. PostgreSQL 마이크로초 시각을 잃지 않도록 `updated_at::text`로 스냅샷한다. 로컬 전체 146건 중 118 pass·28 DB/실검사 skip·0 fail, PR 검사 8 pass, typecheck/lint 통과; 실제 DB GREEN·build·임시 DB 정리는 아직 남았다.
- GREEN/정리: 정확한 수정 SHA `98104b980d8442ae6d81fca6f058ac6158156d04`를 SSH 별칭 push→WSL 지정 checkout pull. 임시 DB의 시험 전 4,500원/65,000원·잠금 3개 true·시각 `2026-09-27 13:30:46.671573+00`에서 목표 DB 시험 1 pass·0 fail 후 같은 값/시각으로 정확히 복원. 사전 확인한 다른 연결 0, 가상 계정·판매자·요청 각 0 상태에서 이번에 만든 임시 DB만 drop하고 DB 목록 잔류 0 확인. 원본 `shoppingmall`은 전후 3,000원/50,000원·잠금 3개 false, accounts/sellers/requests/audit 각 0. WSL 원본 DB API 전체 68건 중 61 pass·7 환경별 skip·0 fail, 로컬 전체 146건 중 118 pass·28 환경 skip·0 fail와 PR 검사 8 pass, typecheck/lint 및 API·Next production build 통과. 테스트 하네스의 복구 결함만 수정했으며 S2 제품 기능·전체 Stage는 여전히 미완료다. 동일 근본 원인 오류 3회 반복 없음.

## 정리 완료 — 2026-09-27 과거 계획 worktree·로컬 브랜치

- 담당/기준: 어울 단일 writer, 현재 `codex/flat-v2-prototypes@2713213ddd667a8eac30b63f4d21851b3904da09`. 사용자 지시의 과거 브랜치 로컬 정리만 수행; 현재 S2 작업 브랜치와 기본 `main` checkout의 기존 삭제 표시·미추적 `.github`는 보존했다.
- 사전 검증: `git fetch origin main` 후 원격 `main@618c7ab08b72423efa6dd97c3e434f59696e03d3`에 과거 `codex/end-to-end-work-plan@74a814d8f4b61881ccaf50c83ae9b778a8d99521`가 ancestor임을 확인. 해당 원격 작업 ref는 없고, `D:\tmp\shoppingmall2-end-to-end-work-plan`은 clean·미추적/무시 파일 0·사용 프로세스 0·해석된 절대 경로 일치였다.
- 조치/복구: 정확한 worktree를 정상 `git worktree remove`로 제거하고 해당 로컬 브랜치를 `git branch -d`로 삭제했다. 이후 worktree 목록에는 기본 checkout과 현재 S2 worktree만 남고 현재 브랜치는 clean이다. 제거한 계획 문서/커밋은 원격 `main`의 포함 이력에서 복구 가능하다. `main` checkout 자체는 업데이트·병합·초기화하지 않았다.
- 검증/미검증: 현재 로컬 `pnpm test`는 146건 중 118 pass·28 DB/실검사 환경 skip·0 fail, PR 본문 검사 8 pass. 이 결과는 S2 전체 통합/인수 증거가 아니며 코드 변경은 없다. 작업 범위 오류 0, 동일 근본 원인 반복 0. 다음은 S2.2 공개 상품 수정/판매중지와 S2.4 편집형 홈·찜/재입고의 미결정 계약 확인 후 진행한다.

## 미검증 기록 — 2026-09-27 S1.3 가상 고객 탈퇴 요청 브라우저 재시험

- 담당/기준: 어울 단일 writer, `codex/flat-v2-prototypes@1e99e168d15d21d07c8410437b7c81fac27bf3fd`; WSL 지정 checkout·`local-postgres/shoppingmall`의 정확한 QA ID `a9c61e34` 가상 고객/판매자/운영자 5계정만 사용. 실제 계정·운영 DB·Oracle·`main`은 건드리지 않았다.
- 실제 브라우저: 가상 고객 로그인→구매자 역할 확인→배송지·알림 설정→`탈퇴 요청 접수` 버튼과 “운영자가 검토하며 즉시 삭제되지 않는다” 안내를 확인. 클릭 시 브라우저 네이티브 확인창 문구 “탈퇴 요청을 접수할까요? 실제 계정 삭제는 운영 검토 후 진행됩니다.”까지 도달했다. 확인창 이후 브라우저 제어가 응답하지 않아 확인/접수 완료 화면은 검증하지 못했다. 읽기 전용 DB 조회상 탈퇴 요청 0건이므로 성공으로 표시하지 않는다.
- 오류/조치: 첫 fixture 연결은 PostgreSQL 비밀번호 미전달로 실패 1회, 트랜잭션 전 계정 0 확인 후 기존 DB 자격정보를 **출력하지 않고** 컨테이너에 전달하여 가상 5계정 생성. 첫 웹 실행은 `next` 실행 파일 경로 오류 1회, 실제 패키지 경로로 다시 시작하여 Web 200/API ready 200 확인. 브라우저 확인창 이후 같은 CDP 초점 조작 시간 초과가 AX·스크린샷·키 입력·탭 종료/재연결에서 3회 이상 반복되어 추가 UI 재시도를 중단하고 main agent가 직접 자원 정리. 제품 오류로 단정하지 않으며 브라우저 탭 종료 여부는 미확인이다.
- 정리/다음: 임시 Web/API 컨테이너 두 개 중지, `a9c61e34` fixture reset에서 정확한 가상 계정 5개 제거. 사후 accounts/deletion requests/sellers/seller categories 각 0행, 9091/9092 listener·해당 컨테이너 0, WSL checkout clean. 탈퇴 **요청** 기능은 유지하고 실제 영구 삭제와 구분한다. 브라우저 제어가 회복된 별도 시험에서 확인창 수락→접수 상태·중복 요청·관리자 검토를 재검증해야 하며 이번 회차는 UAT 합격 증거가 아니다.

## 검증 완료 — 2026-09-27 S2.4 홈 640px 유효 너비·키보드

- 담당/기준: 어울 단일 writer, `codex/flat-v2-prototypes@5a58177627bd0a6eb41c2af1dc8469f3d1f905c7`; WSL 지정 checkout의 시험용 API/Web만 127.0.0.1:9092/9091에 임시 실행. 개발 DB는 가상 계정·상품 0건으로 유지했고 `main`·Oracle·운영 데이터는 변경하지 않았다.
- 실제 브라우저: 기본 1280px에서 `devicePixelRatio=1`, 문서 clientWidth/scrollWidth 각 1265px. 유효 너비 640px으로 줄였을 때 각 625px로 가로 넘침이 없고 홈의 검색·메뉴·히어로·기획전 카드가 표시됨을 화면으로 확인했다. Tab 순서 검색 입력→검색 버튼→로그인→홈 메뉴, 각 `:focus-visible`과 검색 입력의 실제 포커스 테두리 표시를 확인했다. 상품·분류가 없는 빈 DB의 홈 화면만 대상으로 했다.
- 한계: 브라우저 확대 단축키 `Ctrl++`/`Ctrl+=` 후에도 배율 지표 `devicePixelRatio=1`, `visualViewport.scale=1`로 변하지 않았다. 640px viewport 시험은 200% **실제 브라우저 확대**의 대체 증거가 아니며 해당 항목·인쇄·대비·상품 데이터가 있는 홈은 미검증이다. 변경 가능한 브라우저 viewport를 reset하고 임시 탭을 종료했다.
- 정리/오류: 이름이 고정된 임시 API/Web 컨테이너 2개를 종료했고 해당 컨테이너·9091/9092 listener 0, DB 계정 0을 확인했다. 일반 sandbox에서는 사용자 SSH 별칭 설정에 접근하지 못해 호스트 해석 실패 1회가 있었고, 사용자 설정을 쓰는 승인된 실행 환경에서 같은 `WSL-server` 별칭으로 정리 완료. 제품 오류 0, 동일 근본 원인 3회 반복 없음. 다음은 승인된 S2 계약 중 독립 진행 가능한 작업과 실제 확대 가능한 브라우저에서의 재검증이다.

## 검증 완료 — 2026-09-27 S2.3 품절 해제 관리자 승인 브라우저

- 담당/기준: 어울 단일 writer, `codex/flat-v2-prototypes@174680e66b550620f7299302e9ff04ab03e6f695`, WSL 개발 DB QA ID `e401ab72` 가상 계정/5품목. 운영 상품·Oracle·`main` 미변경. fixture의 직접 승인 데이터는 실제 상품 제안/이미지 검사의 증거가 아니다.
- 실제 브라우저: 판매자 A의 고추 5개→0개 즉시 품절 후 0→7개 직접 입력. 판매자 화면 보유 7개/판매 가능 0개/증가 승인 대기, 고객의 해당 고추 검색 0건 확인. 가상 운영자 계정으로 별도 로그인해 정확한 판매자·상품·옵션·요청 7개/기존 판매 가능 0개를 확인한 뒤 `증가 승인` 실행. 대기 목록에서 요청이 사라지고 이력 안내 표시. 고객 검색 새로고침 후 해당 고추 1건 재노출, 상세 판매 가능 7개 확인. 판매자→관리자 역할 구분과 승인 전후 공개 상태를 실제 화면에서 검증했다.
- 정리/한계: 양 역할 로그아웃, 시험 탭 2개 종료, 지정 임시 API/Web 컨테이너 2개 종료, `e401ab72` fixture reset으로 5품목/가상 계정/재고 요청 제거. 사후 accounts/sellers/categories/products/revisions/inventory/stock requests/audit 8종 각 0행, 9091/9092 listener 및 해당 컨테이너 0, WSL checkout clean/정확한 SHA. 첫 상품 화면 이동은 브라우저 제어 시간 초과 1회였고 상태 확인 후 재시도 성공, 제품 오류 아님. 동시 구매·주문 견적·200% 확대/인쇄/대비는 미검증이며 S2 전체 완료 아님.

## 검증 완료 — 2026-09-27 S2.3 가상 판매자 품절 즉시 차단 브라우저

- 담당/기준: 어울 단일 writer, `codex/flat-v2-prototypes@d8b5ce353c1c25560bea96e08a298e7ab021c0ed`, WSL `local-postgres/shoppingmall` 개발 DB QA ID `d3e772a0`. 실제 판매 자료·계정·Oracle·`main`은 변경하지 않았다. 5품목 fixture는 승인된 공개 상품을 시험 DB에 직접 넣으므로 실제 상품 승인 경로의 증거가 아니다.
- 실제 브라우저: 가상 판매자 A 로그인→고추 옵션 보유/판매 가능 5개 확인→수량 0 직접 입력/적용→동일 판매자 화면에서 보유/판매 가능 0개 및 즉시 반영 안내 확인. 별도 고객 공개 검색에서는 고추가 사라지고 양파(판매자 A), 고춧가루(어울몰), 블루베리·마늘(판매자 B) 네 상품만 남았다. 판매자 권한과 공개 목록이 연결된 품절 즉시 차단 증거다. 동시 마지막 수량 구매/재고 재증가 승인/주문 견적은 이 시험에서 검증하지 않았다.
- 정리: 가상 판매자 로그아웃·시험 탭 2개 종료, 이름이 고정된 임시 Web/API 컨테이너 2개 stop, `d3e772a0` fixture reset에서 가상 상품 5개 및 동반 계정 제거. 사후 accounts/sellers/categories/products/revisions/inventory/stock requests/audit 8종 각 0행, 9091/9092 listener 및 해당 컨테이너 0, WSL checkout clean/정확한 SHA 확인. 검증 오류 0, 동일 근본 원인 3회 반복 없음. S2 전체 gate는 아직 미완료다.

## 진행 중 — 2026-09-27 S2.4 상품 분류 계층 표시 회귀

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`; WSL 개발 DB `shoppingmall`의 QA ID `c29e4a71` 가상 5품목만 사용. 실브라우저에서 분류 `<select>`가 API의 이름순 배열을 그대로 사용해 소분류와 대분류가 섞이는 결함을 확인했다. `대분류 → 해당 소분류 → 상품` 기존 승인 구조의 화면 표시 문제이며 DB 계약 변경은 없다.
- RED→GREEN: `apps/web/test/public-products.test.mjs`에 의도적으로 섞은 부모/자식 배열의 그룹·선택 가능 대분류·순서 시험을 추가하여 1 fail을 확인. `apps/web/app/products/page.tsx`에서 한국어 이름순 대분류 optgroup 안에 대분류 전체 선택과 해당 소분류를 배치하여 목표 7 pass·0 fail.
- 로컬 검증: 전체 145건 중 117 pass·28 환경 의존 skip·0 fail, PR 본문 검사 8 pass, 전체 typecheck/lint/API·Next production build 통과. 실제 WSL 새 빌드/브라우저 재시험은 이 기록 시점 미완료이며 로컬 PASS로 대신하지 않는다. 시험용 컨테이너 2개는 재빌드 전에 정확히 중지했다. 시험 계정·상품 fixture는 재검증 후 정확한 ID로 정리한다.
- 다음: 변경분 안전 커밋→SSH 별칭 push→WSL 지정 checkout pull/build, 브라우저에서 분류/판매자/정렬·모바일·키보드 재검증 후 fixture/포트/컨테이너 잔류 0 확인. 동일 근본 원인 오류 3회 반복 없음.
- `9aaabbe90ad1b57fbf05249da1a1e8cbbec750f6` SSH push→WSL 지정 checkout pull 및 Next production build·API/Web readiness 200. 실제 브라우저의 optgroup은 가공식품/과일/채소 아래 각각 고춧가루/블루베리/고추·마늘·양파를 표시했고 `채소 전체` 제출 결과는 세 상품만 나왔다. 430px viewport에서 문서 가로 넘침은 없었으나 필터 입력이 2열 중 좁은 한 열에 표시되어 분류명이 잘리는 결함을 새로 확인했다.
- 모바일 필터를 600px 이하에서 한 열로 배치하는 CSS/시험을 추가했다. 목표 시험 RED 1→GREEN 8 pass, 로컬 전체 146건 중 118 pass·28 환경 의존 skip·0 fail, PR 본문 검사 8 pass, typecheck/lint/API·Next build 통과. 첫 fixture 실행에서 필수 가상 비밀번호 설정을 누락해 1회 즉시 거부됐고 설정 후 5품목 생성에 성공했다. viewport 복원·기존 브라우저 탭/정확한 임시 컨테이너 종료. 수정 CSS의 실제 브라우저 재시험과 QA fixture 정리는 아직 남아 있다.
- `1aac087a2557f7428b8636c425d0e8332b4a910b` SSH 원격/WSL 동일 SHA에서 Next production build·API/Web readiness 200. 실제 430px 화면에서 필터가 각각 전폭 한 줄에 배치되어 이름 잘림을 해소하고 문서 scrollWidth/clientWidth 각 415px 확인. 키보드 Tab으로 검색어→카테고리→판매자 순서 확인. 채소 전체+판매자 B 교차 검색은 가상 마늘 1건만 표시, 상세에서 16,000원·판매 가능 5개·직접 발송 확인. 200% 실제 확대·인쇄·대비는 이번 검증에 포함하지 않았으며 S2/S8 전체 gate는 아직 미완료다.
- QA 종료: 브라우저 viewport reset·시험 탭 종료, 이름이 고정된 임시 API/Web 컨테이너 2개 stop, `c29e4a71` fixture reset에서 가상 상품 5개 및 동반 계정을 정리. 사후 WSL DB accounts/sellers/categories/products/revisions/publications/inventory 7종 각 0행, 9091/9092 listener·해당 임시 컨테이너 0, WSL checkout clean 및 SSH 원격 `1aac087` 일치 확인. 신규 모바일 표시 결함 1건은 수정·재시험 완료, 반복 오류 3회 없음. 다음은 S2 나머지 요구/전체 gate다.

## 진행 중 — 2026-09-27 S1.3 고객 탈퇴 요청 브라우저 확인

- 담당/기준: 어울 단일 writer, `codex/flat-v2-prototypes@7cd3a8b739b0146013bcc29b4a8bc67dabefb553`, WSL 개발 DB의 QA ID `b2c9e7d4` 가상 고객만 사용. 기존 API/DB 탈퇴 **요청** 시험은 통과했으며 실제 삭제 기능과 구분한다.
- 브라우저에서 탈퇴 요청 확인창까지 도달했으나 신산님이 시험인 줄 모르고 취소하셨다. 이는 제품 오류가 아니며 요청 접수 완료의 브라우저 증거는 아직 없다. 신산님은 탈퇴 기능의 유지를 명시했다. 구현을 삭제하거나 사용자 계정을 탈퇴 처리하지 않았다.
- 시험용 브라우저 탭을 닫고 QA ID 가상 계정 5개를 정확히 정리했다. `shoppingmall-s1-customer-web-7cd3`/`shoppingmall-s1-customer-api-7cd3` 두 시험 컨테이너만 중지하고 잔류 0, 개발 DB 전체 계정 0을 확인했다. 잔류 확인 SQL의 첫 시도는 셸 인용 문제 1회였고 전체 계정 수 읽기 전용 조회로 재확인했다. 동일 근본 원인 3회 반복 없음.
- 다음: 해당 실제 브라우저 접수 결과는 미검증으로 유지하고 S2의 다른 미완료 개발·검증을 계속한다. 향후 명확히 식별된 가상 계정으로 고객 탈퇴 요청 접수를 재검증하며 실제 계정 삭제/출시 인수로 오인하지 않는다.

## 진행 중 — 2026-09-27 S2 다중 판매자·5품목 반복 QA 세트

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@1adb271ded9b3c7124fcdf8bac20472e037fa683`, SSH 별칭 원격 push→WSL `/home/daon/deploy/shopping` pull. `main`·운영/Oracle DB·실판매 데이터는 변경하지 않았다.
- 목적/변경: `apps/api/scripts/qa-catalog-fixture.ts`와 `apps/api/test/qa-catalog-fixture-db.test.mjs`를 추가했다. 8자리 QA ID로 고객/농가 A/B/어울몰 판매자/관리자 가상 계정을 만든 후 고추·고춧가루·양파·마늘·블루베리 5개 상품을 3개 대분류와 각 소분류, 판매자 A/B/어울몰, 직접/어울몰 발송에 배치한다. 각 상품의 단일 옵션·가상 가격·판매 가능 5개는 통합시험 값이며 운영 초기값이 아니다. fixture가 DB에 승인 상태를 직접 넣으므로 이 시험은 실제 판매자 제안→관리자 악성코드 검사/승인의 증거가 아니다. 이미지는 생성하지 않고 기존 승인 이미지 별도 시험과 구분한다.
- RED→GREEN/검증: 모듈 부재 RED 후 순수 명세 1 pass·DB 없는 환경 1 skip. WSL `local-postgres/shoppingmall` 정확 SHA에서 생성→판매자·발송 방식·재고 검증→1회 정리→2회 반복 정리 2 pass·0 fail, API 전체 68건 중 61 pass·0 fail·환경별 7 skip. 로컬 전체 144건 중 116 pass·0 fail·DB/실 검사 28 skip 및 PR 본문 검증 8 pass, 전체 typecheck/lint/API·Next production build 통과. 동일 근본 원인 오류 3회 반복 없음.
- 정리/다음: 사후 WSL DB의 `qa-%` 개정·분류와 `qa+%@example.invalid` 계정 각 0행을 읽기 전용 확인. 새 테스트는 고유 ID만 지우고 추가 개정·이미지가 연결되면 자동 삭제를 멈추도록 설계했다. 다음 S2/S3 주문 분리·재고 경합 통합시험의 기반으로 사용한다. 실제 5품목 가격·사진·수량·판매자 배정은 신산님이 운영 준비 때 결정하며, 현 Stage/전체 구축 완료 아님.

## 진행 중 — 2026-09-27 S2 홈 메뉴·판매자 탐색 연결

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@27f7b61517e91b07f540643a158b30defa012dd5`, `main` 미변경. 승인된 홈 5영역 중 정적 메뉴를 실제 링크로 바꾸고 공개 상품의 판매자 이름→해당 판매자 상품 검색을 연결했다. 검색 화면은 판매자 필터의 현재 선택을 표시·수정하며 URL 조건을 유지한다. 판매자 소개는 공개/판매 가능 목록의 첫 페이지에 등장한 판매자만 표시하며 전체 판매자 디렉터리·편집 가능한 관리자 추천/기획전은 아직 아니다.
- RED→GREEN/변경: 홈 메뉴의 비상호작용 span 및 판매자 딥링크에 선택 필터 부재를 각 테스트에서 실패로 확인한 뒤 `apps/web/app/page.tsx`, `home-catalog.tsx`, `products/page.tsx`, `styles.css`, `test/page.test.mjs`, `test/public-products.test.mjs`만 변경. 메뉴 키보드 포커스 스타일과 5열 데스크톱/2열 모바일 검색 폼을 적용했다. 시도 중 잘못 지정한 `apps/web/app/styles.css` 상대 경로 1회는 실제 웹 패키지 경로로 수정했고 제품 오류는 아니다. 동일 근본 원인 3회 반복 없음.
- 로컬 검증: 전체 테스트 142건 중 115 pass·0 fail·DB/실 ClamAV 등 환경 의존 27 skip, PR 본문 검증 8 pass. 목표 웹 10 pass, 전체 typecheck/lint/API·Next production build 통과. 이 결과만으로 실제 DB·브라우저 PASS를 주장하지 않는다.
- WSL/브라우저: SSH 원격 push→WSL 지정 checkout pull, 동일 SHA production Web build와 API `/ready` 200·Web 200. QA ID `6fa1b209` 가상 공개 상품 1·판매자 A/B/어울몰/고객/관리자 계정으로 실제 브라우저 홈 메뉴·대분류·추천 상품·판매자 카드 표시를 확인했다. 판매자 A 링크에서 A 선택/상품 1건, 판매자 B로 바꿔 검색하면 0건. 430px 홈·검색 문서 `scrollWidth=clientWidth`(각 415/430), 판매자 필터에서 Tab 후 정렬 선택으로 이동 확인. 200% 실제 브라우저 확대/인쇄/대비는 미검증이며 viewport 축소를 확대 PASS로 대체하지 않는다. WSL API 전체 66건 중 59 pass·0 fail·환경별 7 skip.
- 정리: 시험 브라우저 탭/viewport·확대 키 상태를 기본으로 복원 후 탭 종료, 정확한 임시 Web/API 컨테이너 2개 종료. `qa-public-fixture reset` 이후 지정 상품/개정/분류/판매자 분류/판매자/계정 각 0행. 다음은 편집 가능한 홈 추천/기획전과 남은 S2 상품 수정·판매중지·찜·재입고 및 Stage gate이며, 전체 구축/인수 완료 아님. 기존 공개 상품의 새 버전에서 재고를 승계하는 방식은 신산님에게 선택 질문을 보냈고 응답 전에는 그 부분을 변경하지 않는다.

## 진행 중 — 2026-09-27 S2.2 승인 전후 실브라우저 사진·재고 검증

- 담당/기준: 어울 단일 writer, `codex/flat-v2-prototypes@5c75295bef2e6c65c4ca7fa501594fd75cd93c53`; 로컬→`github-sinsan-develop` SSH push→WSL `/home/daon/deploy/shopping` fast-forward pull. `main`·Oracle·운영 데이터 미변경. QA 실행 ID `a438c918`, `local-postgres`의 `shoppingmall` 개발 DB, 가상 계정 5개만 사용했다.
- 실제 브라우저: 운영자가 가상 대분류 `채소`/소분류 `고추` 등록, 판매자 A가 가상 햇고추 500g·23,000원 초안 및 64×64 PNG 1장 업로드→비공개 WebP 대표사진·보유 10/판매 가능 0 확인→상품/재고 증가 승인 요청. 비로그인 고객 검색은 승인 전 0건. 운영자 화면은 대표사진 1장·옵션·산지·판매자를 표시했고 실제 스캐너를 거친 상품 승인 및 재고 증가 승인 뒤 대기 목록이 비었다. 비로그인 고객 검색은 같은 상품 1건, 상세는 23,000원·판매 가능 10개·공개 대표사진 `naturalWidth=64` 확인.
- 발견/수정: 처음 비공개 심사 사진과 공개 상세 사진의 교차 출처 직접 `<img>`는 브라우저에서 `naturalWidth=0`으로 깨졌다. 인증된 비공개 사진은 `credentials: include`, 공개 사진은 `omit`으로 CORS fetch 후 브라우저 blob URL에 표시하고 정리 시 revoke한다. 관리자 승인 동작은 심사 사진 전부가 실제 로드된 뒤에만 노출한다. 수정 `5b8e2de`, `2381c6a`; QA 식별 자료·이미지 개별 정리 도구 `5c75295`.
- 검증: 사진 수정 목표 테스트 18 pass·0 fail, API QA 정리 대상 테스트 1 pass·0 fail, API/Web typecheck 및 Web production build 통과. WSL Web production build는 각 수정 SHA에서 통과. 브라우저에서 비공개/공개 이미지 모두 실제 64×64 로드 확인. 실제 ClamAV 검사는 앞선 `04a064d`의 HTTP/EICAR 증거와 이번 운영자 승인 성공으로 구분한다. 사진 출력 초기 오류 1종을 두 화면에서 수정했으며 `node --test`의 TSX 로더 누락 1회, npm workspace 위치 오류 1회, UI 자동화 locator timeout 2회는 올바른 실행/DOM 조회로 보정했다. 동일 근본 원인 3회 연속 오류 없음.
- 정리: QA 브라우저 탭 2개 종료, 지정 Web/API/ClamAV 일회성 컨테이너 3개 종료. 전용 정리 스크립트가 정확한 상품 1·격리 이미지 1·가상 계정 5개를 제거했다. 사후 지정 상품/개정/이미지/상품·판매자 분류/판매자/계정 7종 각 0행 확인; QA 업로드 전용 빈 폴더와 로컬 가상 PNG·빈 폴더 제거. WSL checkout은 `5c75295`로 pull, 원격 동일 SHA 확인. `shoppingmall` DB 백업은 보존한다.
- 미검증/다음: 이 회차는 기본 데스크톱 브라우저 실제 흐름만 검증했다. S2.2 기존 공개 버전의 새 수정 승인·판매중지, 사진 누락/검사기 장애의 실제 UI, 모바일·200%·키보드·대비, 운영 객체 스토리지/최신 바이러스 정의, Stage 전체 회귀·PR은 미완료다. 다음은 계획의 남은 S2.2 계약을 RED→GREEN으로 구현하고 S2 전체 필수 gate까지 계속한다. 외부 서비스 계정·Oracle·PG 실연동은 별도 U0 이후이며 이번 PASS로 주장하지 않는다.

## 진행 중 — 2026-09-27 S2.2 관리자 상품 승인·공개 이미지 연결

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@6136a64d0df661bebe5b80556e4187365b268e6f`. 선행 이미지 검사 계약은 모의/격리 실제 ClamAV에서 확인했으나 상품 승인과 공개 제공에는 아직 연결되지 않았다. 다음에는 pending revision의 모든 비공개 WebP 바이트를 실제 스캐너로 검사해 clean일 때만 관리자 권한 트랜잭션으로 approved/publication/audit를 기록하고, 공개 이미지 GET은 승인된 publication 포인터에 연결된 사진만 서버가 비공개 저장소에서 읽도록 한다. 직접 파일 경로/객체 키는 고객에게 공개하지 않는다.
- 예상 변경: `apps/api/src/catalog/product-reviews.ts`, `controller.ts`, `public-products.ts`, 승인·공개 이미지 DB/HTTP 시험, 관리자/고객 화면, 본 현황. 기존 migration/Secret/운영 데이터는 바꾸지 않으며 WSL QA 실행 ID와 격리 ClamAV만 사용한다. 파일은 계속 비공개 저장하고 승인된 DB 포인터를 통해서만 서버가 전송한다. 운영 객체 스토리지·최신 바이러스 정의/외부 서비스 결정은 구축 뒤 별도 인수 게이트다.
- RED/검증 계획: 관리자 아닌 승인 거부, 실제 이미지 누락/검사 감염·오류 시 공개 불변, 승인 전 고객 이미지 404, 승인 뒤 정확한 공개 버전만 반환, 중복·경합 승인 차단, 감사 이력·공개 검색/상세/브라우저를 시험한다. 실패 시 DB rollback과 기존 publication 유지, 시험 파일·행·컨테이너만 정확히 정리한다. 외부 공급자와 운영 서버에는 배포하지 않는다.
- 진행 증거: `53edad1` WSL 실제 DB에서 승인 함수/공개 이미지 조회 부재 RED; `adffc80` 관리자 권한·모든 사진 검사·pending 재확인·publication/audit 트랜잭션과 승인 이미지 내부 조회 GREEN 1. `6f101a0` 고객 이미지 HTTP 404→승인 뒤 200 요구 RED; `7181e4e` 승인된 이미지 ID에만 WebP·no-store·nosniff 반환 GREEN 1. `1f61bd7` 고객 상세 이미지 메타데이터/화면 누락 API·UI RED; `10832b4` 사진 ID·용도·순서만 상세 응답, 고객 갤러리 URL 연결 GREEN. `04a064d` 운영자 HTTP 승인 실제 검사 계약을 추가해 loopback 한정 ClamAV 컨테이너의 실제 WebP 승인/EICAR 거부 및 HTTP 승인→고객 이미지 제공 2 pass·0 fail. `caf32ad` 관리자 화면 승인 버튼·오류 안내 UI RED→GREEN 5 pass·0 fail.
- 검증/정리: 로컬 전체 136건 중 109 pass·0 fail·DB/실 ClamAV 등 27 skip, PR 본문 8 pass, 전체 typecheck/lint/API·Next production build 통과. WSL 동일 SHA `caf32ade371a0ba5a3a496a1b488c6e1b452a4bb` DB 포함 API 65건 중 58 pass·0 fail·환경 7 skip. 실 ClamAV HTTP 시험은 앞선 `04a064d`에서 별도 실행했고 당시 127.0.0.1:3310 바인딩·healthy를 확인했다. 해당 ClamAV/Node 컨테이너 종료, 3310 listener 0, accounts/sellers/products/revisions/images/publications/audit 각 0행, WSL checkout clean. 일반 전체 회귀의 ClamAV skip을 실 검사 PASS로 치환하지 않는다.
- 미검증/다음: 역할별 실제 브라우저에서 판매자 사진 제출→관리자 승인→고객 갤러리, 사진 누락/검사 불가 실제 UI, 모바일·200%·키보드/대비, 기존 공개 버전 수정·판매중지, 운영 객체 스토리지/최신 검사 정의는 아직 미검증·미구현이다. 현재 상품 사진 업로드/승인/제공은 로컬 개발 전용 게이트이며 production 공개 경로는 열지 않는다. S2.2 및 전체 구축 완료 아님.

## 진행 중 — 2026-09-27 S2.2 상품 사진 악성코드 검사 계약

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@00fe981d8d2bebf274f0e478d76531540f60df08`; S2.2 미완료인 공개 승인에 앞서 재인코딩된 이미지 바이트의 악성코드 검사 계약부터 RED→GREEN으로 구현한다. 다음 수정 대상은 `apps/api/src/catalog/image-scanner.ts`, 단위 시험, 본 현황. DB schema/지속 데이터/Secret/운영 공개 경로는 이번 단위에서 변경하지 않는다.
- 안전 경계: ClamAV 공식 INSTREAM 프로토콜의 4바이트 big-endian 길이·0 길이 종료·NUL 응답을 사용한다. 무인증 TCP 스캐너는 loopback만 허용하고 미설정·연결 실패·시간 초과·알 수 없는 응답은 모두 검사 실패로 닫는다. 검사기 GREEN은 실제 바이러스 DB·공개 승인·상품 이미지 제공의 증거가 아니며 그 통합 작업은 후속이다.
- 예정 검증: 가짜 로컬 스캐너의 clean/infected/error/timeout·구성 오류 계약 RED→GREEN, typecheck/lint/build와 WSL 동일 SHA 재실행. 실패 시 안전한 직전 commit 유지, 시험 소켓·컨테이너 잔류를 확인한다. 같은 근본 원인 오류가 3회 반복되면 예외 보고한다.
- 현재 결과: `apps/api/test/image-scanner.test.mjs`에서 모듈 부재 RED 1회 후 `apps/api/src/catalog/image-scanner.ts` 구현으로 clean/감염/오류/시간초과 3 pass·0 fail. 로컬 API typecheck·전체 lint·diff check 통과. 잘못 지정한 `node ../../node_modules/typescript/bin/tsc`는 패키지 실행 파일 위치 오류 1회였으며 올바른 `pnpm --filter @shoppingmall/api typecheck`에서 통과했다. ClamAV 프레이밍 근거는 [공식 프로토콜](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)이다. 실제 ClamAV 프로세스/바이러스 정의 갱신·공개 승인 연결·WSL 동일 SHA 시험은 아직 미검증이다.
- `dac27aecde32742a3502bdcfc884f8262ad7bb9d`를 지정 SSH 원격에 push→WSL checkout에서 pull하고 동일 SHA·clean으로 계약 시험 3 pass·0 fail, 일회성 컨테이너 자동 제거. 로컬 전체 132건 중 107 pass·0 fail·DB 25 skip, PR 본문 8 pass·0 fail, 전체 typecheck/lint 및 API·Next production build 통과. 이는 모의 daemon과의 프로토콜 시험이며 실제 ClamAV 검사 증거가 아니다. 다음은 실제 검사 서비스와 공개 승인·이미지 제공의 안전한 연결이다.
- 실제 검사 보강: `93c18bf8035a8865ce4a728e95be073de8b2ddb7` WSL 동일 SHA에서 이미지 `clamav/clamav-debian:1.4.3`을 외부 네트워크 없는 `shoppingmall-s22-clamd-7b2c` 일회성 컨테이너로 구동(1500MB 제한), 건강 상태 확인. 그 네트워크만 공유한 일회성 Node 시험에서 재인코딩 WebP `OK`·[EICAR 무해 시험 패턴](https://www.eicar.org/download-anti-malware-testfile/) `FOUND` → 통합 1 pass·0 fail. 두 일회성 컨테이너 종료·잔류 0, WSL checkout clean. 이미지에 포함된 바이러스 정의는 2026-03-02자이므로 최신 운영 정의 확인/갱신은 별도 게이트다. 로컬 통합 시험은 환경 없음을 이유로 1 skip이며 실 검사 PASS로 표기하지 않는다. `pnpm lint`를 API 폴더에서 호출한 명령 위치 오류 1회는 루트 재실행 통과로 바로잡았다. 아직 검사 결과를 관리자 승인·공개 이미지 경로에 연결하지 않았으므로 S2.2 전체 미완료다.

## 검증 완료 — 2026-09-27 S2.3 배송 정책 요청·승인 브라우저 흐름

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@5b124b1a9639f346aa22ebafcd84a5b48fa4a0a0`; 지정 SSH 원격/WSL 동일 SHA, `main` 미변경. 판매자 요청→관리자 승인→판매자별 공개 정책 변경을 시험 계정으로 브라우저에서 확인한다. 전역 정책 변경은 공유 시험 DB의 기본값을 바꾸므로 이번 QA에서 수행하지 않는다.
- QA 초기화 회귀: 새 배송 정책 요청/승인 레코드가 있는 실행 ID에서 기존 fixture reset이 판매자 FK(23503)로 실패하는 RED를 `a242f5f`에서 확인했다. `5b124b1`에서 해당 실행 ID의 판매자 배송 정책·요청만 계정/판매자 삭제 전에 제거하도록 수정. WSL 목표 2 pass·0 fail, API 전체 60건 중 54 pass·0 fail·환경별 6 skip. 로컬 전체 129건 중 104 pass·0 fail·DB 25 skip, PR 본문 8 pass, typecheck/lint/API·Next production build 통과. WSL 체크아웃 clean, 9091/9092 포트·shoppingmall 임시 컨테이너 0, accounts/sellers/배송 요청/판매자 정책/audit 각 0행, 전역 정책 기본 1행 확인. 브라우저 실제 상호작용은 아직 미검증.
- 실제 브라우저: `QA_RUN_ID=d39ac017`의 서로 다른 가상 계정 5개를 생성하고 `5b124b1` WSL API/Next 빌드로 시험했다. 최초 WSL 빌드 명령은 컨테이너에서 `pnpm` 실행 파일을 찾지 못해 1회 실패했으나, 동일 corepack의 `pnpm -r --if-present build`로 정상 빌드했다. API 최초 준비 확인은 서버 시작 직후여서 1회 연결 실패했고, 로그/포트상 정상 기동 확인 후 `/ready` 200 및 웹 200을 재확인했다. 제품 오류는 관찰되지 않았다.
- 판매자 A 브라우저 로그인→배송비 3,500원·할인 전 무료배송 기준 40,000원 변경 요청→현재 적용값은 3,000원·50,000원 유지·요청 이력 `승인 대기` 확인. 운영자 브라우저 로그인→판매자 A의 요청 1건 표시→승인→대기 목록에서 제거·성공 표시. 판매자 A 재로그인→적용값 3,500원·40,000원과 `승인 완료` 이력 확인. 판매자 B 별도 로그인→적용값 3,000원·50,000원, 요청 이력 없음 확인. 전역 기본값 수정은 하지 않았다.
- 정리: 브라우저 로그아웃·시험 탭 닫기, 정확한 일회성 API/웹 컨테이너 2개 중지, 실행 ID `d39ac017` fixture reset으로 계정 5개 정리. 사후 accounts/sellers/배송 요청/판매자 정책/audit 각 0행, 전역 정책 1행, 9091/9092 LISTEN 및 해당 임시 컨테이너 0, WSL checkout clean. 시험 DB migration/백업은 보존했다.
- 미검증/다음 조치: 실제 모바일 화면·200% 확대·키보드·인쇄, 관리자 전역값 실제 수정, 상품별 배송비/무료배송 주문 시점 스냅샷은 아직 미검증 또는 미구현이다. 승인된 작업계획의 다음 S2 작업을 계속하며 외부 PG/Oracle/실서비스 연동은 구축 뒤 사용자 인수 준비에서 결정한다.

## 진행 중 — 2026-09-27 S2.3 배송 정책 영속 저장·요청/승인 계약

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@ab3d3134cd686d1dc30ba8c87976ba040b1864d3`. 기존 승인된 전체 구축·S2.3 작업계획 범위에서 지정 `shoppingmall` 시험 DB만 migration 대상으로 삼고 실제 운영/Oracle DB는 건드리지 않는다.
- 목표: 관리자 전역 기본값·명시 잠금, 판매자별 승인된 정책, 판매자 변경 요청 및 관리자 개별 결정/이력을 분리한다. 하나의 판매자에 동시 pending 요청은 하나만 허용한다. 승인 전 공개 정책 불변·타 판매자 차단·관리자 금지 지역 우선. 요청/승인 actor·역할·시각을 감사 이력으로 남긴다.
- 단계: DB schema RED→migration·WSL DB GREEN, 서비스 DB/HTTP RED→GREEN, 역할별 화면·실제 브라우저 및 회귀. 이번 정책 단위값의 우편번호 구간/잠금은 운영 값 확정이 아니라 구현 계약이며 주문 스냅샷은 S3에서 다룬다. migration 전 DB 백업/현재 상태 확인 및 시험 가상 행만 정확히 정리한다.
- WSL `96174f6`에서 schema 시험은 `shipping_policy_global` 부재(42P01)로 의도된 RED. migration 전 다른 활성 DB 작업 0, accounts/sellers/products/product_images 각 0행. PostgreSQL custom dump를 `/home/daon/deploy/shopping-backups/shoppingmall-s23-pre-fZhaBe.dump`에 48,157 bytes·SHA256 `952b7025d6caa938213ef12decccceca7e1010c73da02181e38ec315527e9400`으로 보존했다. 이 백업은 시험 DB 전용이며 자동 복원/운영 배포 증거가 아니다. Drizzle 생성 SQL은 새 정책 테이블 3개와 신규 FK/제약/인덱스만 포함하며 전역 기본 1행 INSERT를 추가했다.
- `5931aedaa1148f0a9bec6d08c2321cd6fb2f1314`를 WSL에 pull했다. 기존 backup을 고유 임시 `shoppingmall_s23_dryrun_5931` DB에 복원(기존 migration 5개)→새 migration 적용→schema 시험 1 pass·0 fail→migration 6개/전역 정책 1행/계정 0 확인 후 임시 DB만 drop했다. 동일 SHA로 지정 `shoppingmall` 시험 DB에 migration 적용·schema 시험 1 pass·0 fail. 원본 DB 백업은 보존하며 Oracle/운영 DB는 건드리지 않았다. 서비스 요청/승인 로직·화면·정책 실제 적용은 아직 미구현이므로 schema GREEN을 S2.3 완료로 표시하지 않는다.

## 진행 중 — 2026-09-27 S2.3 배송 정책 결정 규칙

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@9b7395f07a06ca9ef6c25d182b7d45e53cfb0b47`; 로컬·원격·WSL clean 일치. S2 Stage 진행 중이며 S3는 착수하지 않는다.
- 확정 요구: 기본 배송비 3,000원, 무료배송 기준 50,000원(발송 주문별 할인 전 소계), 판매자 변경은 자기 범위의 요청→관리자 승인 후 반영, 관리자 설정 우선, 출고 마감·배송 불가 지역도 같은 승인 흐름. 관리자 전역 배송 불가 지역은 판매자 값으로 해제하지 않는다.
- 이번 최소 범위: 원화 정수·24시간 HH:mm·우편번호 구간 정책값 검증과 관리자 명시 잠금 필드/승인된 판매자 오버라이드의 순수 결정 함수만 RED→GREEN. 저장·요청·승인·시각·화면·주문 스냅샷은 후속 S2.3 Task로 별도 추적하며 이번 단위 PASS를 전체 정책 기능으로 주장하지 않는다. 실제 운영 지역·마감 값은 인수 준비에서 정한다.
- 순수 계약 결과: `apps/api/test/shipping-policy.test.mjs`는 모듈 부재로 RED, `apps/api/src/shipping/policy.ts`에서 3건 GREEN. 기본 마감은 임의 값을 만들지 않고 `null`; 관리자 명시 잠금이 없는 필드는 승인된 판매자값이 적용되고, 관리자 금지 우편번호 구간은 판매자 금지 구간과 합집합으로 유지한다. 우편번호 구간·잠금은 이번 구현 선택이며 운영 지역/예외 정책 확정이 아니다. 로컬 전체 123건 중 101 pass·0 fail·DB 22 skip, PR 본문 8 pass, typecheck/lint·API/Next build 통과. WSL 동일 SHA DB 회귀는 커밋 후 확인 예정.

## 진행 중 — 2026-09-27 S2.2 비공개 사진 인증 미리보기

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@2a5e0cd8397c78f486218ad67b810d7e0357f18c`. 고객 공개 이미지/상품 승인 경계는 닫힌 상태다.
- 목표/계약: 판매자는 자기 revision의 사진만, 운영자는 `pending` 심사 사진만 인증 세션으로 볼 수 있다. 응답은 정화된 WebP 바이트, no-store/nosniff, object key 비노출. 고객·타 판매자·미인증·관리자의 미제출 사진 접근은 거부한다. 개발 전용 격리 저장소 범위만 사용하며 production 공개 경로를 열지 않는다.
- 예정 검증: HTTP/DB 권한·미리보기 RED→GREEN, 역할별 화면 연결, 로컬·WSL 회귀·잔류 확인. 브라우저 실제 사진/200%/키보드는 별도 확인한다.
- 실행 결과: `65dba9b` WSL HTTP 목표는 preview route 부재 404로 의도된 RED. `4b4e68cf499032da87a3c7c2eb594882dbabf6d9`에서 판매자 소유 revision과 운영자 `pending`에 한정한 WebP 바이트 응답 및 운영자 사진 메타데이터 목록을 구현; WSL 목표 1 pass·0 fail. `996d4cd72c49b9f9b4db89637a43c2c00bd28bcf`에서 판매자·운영자 화면이 인증 URL로만 비공개 사진을 불러오며 object key는 표시하지 않는다. 로컬 역할별 화면 10 pass·0 fail, 전체 120건 중 98 pass·0 fail·DB 22 skip, PR 본문 8 pass, typecheck/lint와 API·Next production build 통과. WSL DB 포함 API 전체 54건 중 48 pass·0 fail·환경별 6 skip; SHA 일치·clean, 임시 S2 컨테이너 0, 핵심 9종 DB 각 0행. HTTP 시험은 판매자 세션/미인증/운영자 draft 거부 및 pending 운영자만 허용, 응답 `image/webp`·`private, no-store`·`nosniff`, 승인 전 공개 상세 404를 확인했다. 실제 브라우저 이미지 로딩·모바일/200%/키보드, production 이미지 저장·악성코드 검사·공개 승인은 아직 미검증·미구현. S2/전체 구축은 미완료.

## 진행 중 — 2026-09-27 S2.2 비공개 초안 사진 안전 제거

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@300c188465df3a4367a695f08e780ac885ed83f0`. 사진이 포함된 미제출 초안은 현재 영구 삭제가 차단된다.
- 목표/계약: 판매자는 자기 `draft` revision의 비공개 사진 한 장을 제거할 수 있다. 다른 판매자·제출/승인된 revision·다른 사진 ID는 차단한다. DB 행과 격리 파일은 먼저 같은 저장소의 비공개 복구 위치로 옮기고, DB 실패 시 원위치로 되돌린다. DB 성공 후 파일 제거가 실패하면 비공개 복구 위치에 남겨 고객 노출 없이 명시적으로 보고한다. 저장소·DB schema/Secret/외부 연동은 변경하지 않는다.
- 예정 검증: 저장소 단위·DB/HTTP RED→GREEN, 판매자 UI 확인 버튼, 로컬 및 WSL 시험·임시 자료 잔류. 파일/DB 원자성 실패 경계와 브라우저 미검증은 별도 기록한다.
- 실행 결과: `3d606ff`의 로컬 저장소·화면 시험 2건은 기능 부재로 의도된 RED, WSL DB/HTTP 목표 2건은 함수/route 부재로 RED. `0a281cc604112919ff14083ef6cace429cb2d06d`에서 비공개 quarantine→trash 이동·실패 복구·DB 확정 뒤 purge, 판매자 소유 `draft` 한정 제거 API/화면을 구현했다. 로컬 저장소/화면 9 pass·0 fail, 전체 120건 중 98 pass·0 fail·DB 22 skip, PR 본문 8 pass, 전체 typecheck/lint·API/Next production build 통과. WSL 지정 DB 목표 2 pass·0 fail, API 전체 54건 중 48 pass·0 fail·환경별 6 skip. WSL SHA 일치·clean, S2 임시 컨테이너 0, accounts/sellers/categories/products/revisions/options/images/publications/audit 9종 각 0행. DB 이후 purge 실패 시 응답은 `cleanup_pending`이며 trash의 수동 복구·정리 절차는 아직 미구현이다. 커밋 결과가 불명확해지는 DB 연결 단절과 서버 중단 중 이동된 파일의 자동 복구, 실제 브라우저 클릭·200% 확대·인쇄는 미검증. 이 기능은 개발용 로컬 업로드에만 열려 있고 생산 이미지 공개·승인은 여전히 차단한다. S2/전체 구축 미완료.

## 진행 중 — 2026-09-27 S2.2 미제출 상품 사진 순서·용도 관리

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@ef1c1ce53872d5bc8b02513b515b95b997d7bc1b`; 로컬·원격·WSL 동일, clean. S2 Stage 미완료이므로 S3/PR 병합은 시작하지 않는다.
- 목표/계약: 판매자는 자기 `draft` revision의 기존 비공개 사진 목록을 재정렬하고 대표/상세 용도를 지정할 수 있다. 전체 사진 ID를 중복·누락 없이 정확히 제출해야 하며, 타 판매자·제출된 revision은 수정할 수 없다. 최소 한 장을 대표 사진으로 유지한다. 저장·공개 경계나 DB schema를 바꾸지 않고 고객 공개 상태는 불변으로 둔다.
- 예정 검증: DB/HTTP RED→GREEN, 판매자 화면 연결, typecheck/lint/build와 WSL 지정 DB 실시험. 식별된 가상 자료·임시 파일만 정리하고 잔류 여부를 확인한다. 불완전 이미지 공개·관리자 승인 기능은 별도 후속 작업이다.
- 실행 결과: `0587508` DB 목표는 `reorderImages` 부재로 의도된 RED 1회, `5c3e7db`에서 DB 1 pass·0 fail. `bdde25e` HTTP 목표는 route 부재 404로 RED. `c31913a`의 최초 HTTP GREEN 시험은 시험 중 판매자 역할을 되돌려 기존 외부 판매자 세션이 무효화된 결과 401을 예상 403으로 잘못 비교해 실패 1회(제품 API 오류 아님); 기대값을 현재 보안 계약에 맞춘 `aaa381d`에서 HTTP 1 pass·0 fail. `434c9bf5ecef58b3de2f8770ec9cef6374b4b3c1` 판매자 UI에는 업로드 용도, 비공개 목록, 위/아래 순서, 대표 1장 검증·저장을 연결했다. 로컬 전체 120건 중 98 pass·0 fail·DB 22 skip, PR 본문 8 pass, 전체 typecheck/lint 및 API·Next 생산 빌드 통과. WSL DB 포함 API 전체 54건 중 48 pass·0 fail·환경별 6 skip. WSL SHA 일치·clean, S2 임시 컨테이너 0, 핵심 accounts/sellers/categories/products/revisions/options/images/publications/audit 각 0행. 실제 브라우저의 사진 관리 클릭·모바일/200%·키보드·인쇄와 안전한 공개 이미지/관리자 승인·판매중지는 아직 미검증·미구현. S2 Stage와 전체 구축은 미완료이며 다음 S2 계획 작업을 이어간다.

## 진행 중 — 2026-09-27 S2.2 판매자 미제출 초안 안전 삭제

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@05fa54131054003a38636a6ad684b16a0fd98be8` (로컬/원격/WSL 일치). 직전 QA 자료·포트·임시 컨테이너 잔류 0.
- 계약/범위: 판매자가 자기 소속의 `draft` 초안만 삭제 요청할 수 있다. 사진·재고/승인 요청·다른 revision·고객 공개 이력이 하나라도 있으면 삭제를 거부하며, 성공 시 옵션→revision→product를 트랜잭션으로 제거하고 감사 이력은 남긴다. 타 판매자·고객·pending/approved 삭제 금지. UI에는 영구 삭제 확인과 보호 조건을 명시한다. 현재 사진·재고를 가진 초안의 정리와 판매 중지는 별도 Task로 남긴다.
- 예상 파일: `apps/api/src/catalog/product-drafts.ts`, `controller.ts`, DB/HTTP 시험, 판매자 화면·시험, 본 현황. schema/Secret/외부 비용 없음. RED→GREEN·WSL 지정 DB 실제 시험, 가상 fixture는 식별 ID만 생성/정리한다. 실패 시 마지막 안전 commit을 유지하고 잔류 자료를 정확 ID로 정리한다.
- `762af11`에서 DB/HTTP 목표 2건과 로컬 UI 1건은 삭제 함수/라우트/버튼 부재로 의도된 RED, WSL 가상 자료 잔류 0. 구현 `a895c3a` 첫 WSL 목표 2건은 UUID 패턴의 한 블록 누락으로 정상 ID를 400 거부했다(구현 오류 1회, 삭제 전 차단, 잔류 0). `4c424f3`에서 정확 패턴으로 수정한 뒤 WSL 목표 2 pass·0 fail·자료 잔류 0. `609cfccdf754c5edc87ef18b9f21055d51fabf8d`에서 사진·재고 연결·제출 상태 삭제 거부와 성공 시 감사 이력까지 지정 DB 1 pass·0 fail. 최종 로컬 전체 120건 중 98 pass·0 fail·DB 22 skip, PR 본문 8 pass, WSL API 전체 54건 중 48 pass·0 fail·환경별 6 skip, 전체 typecheck/lint/API·Next production build 통과. WSL accounts/sellers/categories/products/revisions/options/images/inventory/publications/audit 10종 각 0행, 9091/9092 listener·S2 임시 컨테이너 0, checkout clean. 브라우저에서 삭제 확인 창의 실제 클릭·반응형·200% 확대는 아직 미검증. 사진/재고/공개 이력이 있는 상품은 삭제 기능 대상이 아니며 이후 별도 정리·판매중지 흐름이 필요하다.

## 진행 중 — 2026-09-27 S2.2 판매자 상품 초안 수정

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@f8840c78c70ad20a19771a845c97dd2216c4f564`. 선행 S2 공개 카탈로그 QA가 정상 종료되어 지정 DB 핵심 9종 0행·임시 포트/컨테이너 0. S3는 S2 완료 전 착수하지 않는다.
- 목표/계약: 판매자는 자기 소속 `draft`만 수정하고, 다른 판매자·pending/approved 상품·현재 공개 revision은 불변. 상품명/설명/산지/소분류/발송 방식과 옵션 이름·가격을 편집하되 재고·승인 대기가 연결된 옵션은 삭제하지 않는다. 변경은 감사 이력으로 남기며 고객 공개 API 결과는 그대로 유지한다.
- 예상 파일: `apps/api/src/catalog/product-drafts.ts`, `controller.ts`, DB/HTTP 시험, 판매자 상품 화면/시험, 본 현황. 새 schema·migration·Secret·외부 비용 없음. 먼저 DB/HTTP·UI RED를 확인하고 해당 파일만 구현한다. WSL 시험은 정확한 Git SHA를 pull해 지정 DB의 식별 가능한 가상 자료만 사용하고 finally 정리. 실패 시 직전 안전 commit 유지·해당 QA ID 자료만 제거한다.
- WSL DB/HTTP 수정 계약은 `6b188a4`에서 목표 2건 모두 의도된 RED(수정 함수/라우트 부재) 후 `1940a2f`에서 2 pass·0 fail. 이어 편집 자료 조회/화면 계약은 `177e888`에서 API 2건 RED·로컬 화면 1건 RED 후 `bbd5053e70831f414aadcbdd6bb9f4d9494fdf92`에서 WSL 목표 2 pass·전체 54건 중 48 pass·0 fail·환경별 6 skip, 로컬 전체 119건 중 97 pass·0 fail·DB 22 skip, PR 본문 8 pass, 전체 typecheck/lint/build(Next 정적 10·동적 상세 1) 통과. 편집 조회 구현의 미사용 변수 lint 오류 1회 수정 후 재검증, 반복 근본 원인 오류 0.
- 실제 브라우저 QA는 실행 ID `ae9a57da`로 기존 review fixture의 가상 계정/판매자/대·소분류/상품을 생성한 뒤 **그 ID의 정확한 revision 1개만** `pending→draft`로 바꿔 판매자 편집을 시험한다. 이는 시험자료 준비이며 제품 승인/고객 공개가 아니다. `shoppingmall-s2-draft-browser-api-bbd5`, `shoppingmall-s2-draft-browser-web-bbd5`만 임시 실행한다. 시험 뒤 브라우저 tab/viewport 원복, 두 컨테이너 stop, `runQaReviewFixture reset`으로 정확 ID 자료를 삭제하고 핵심 DB·포트·Git 잔류 0을 확인한다. 사전 accounts/sellers/categories/products/revisions/options/images/publications/audit 9종 각 0, listener·S2 컨테이너 0, WSL checkout clean.
- 정확한 QA revision `f90dbc39-28d8-4de2-b88f-1dcc1e537565`만 `pending→draft` 전환해 `bbd5053` API/Next에서 가상 판매자 로그인→상품 목록→초안 수정→상품명·가격 저장을 브라우저로 확인했다. 제목은 `qa-ae9a57da-edited-chili`, 가격은 25,000원으로 변경되고 공개 동작은 없었다. 이메일 입력에서 첫 UI 자동화 입력이 잘못 해석되어 브라우저 기본 형식 오류 1회 발생했으나 올바른 값 재입력 후 로그인 성공(제품 결함 아님). 390px 화면은 문서 scrollWidth 393/clientWidth 375로 가로 넘침 18px 발견; `.catalog-admin-grid .account-card`의 자동 최소 폭이 원인이다. `min-width:0`와 긴 문자열 줄바꿈만 추가하고 화면 재검증 예정. 현재 QA ID 자료/컨테이너/브라우저 탭은 사용 중이므로 reset 전까지 보존한다. 브라우저 폭 회귀 1회 수정 진행.
- 정확한 `25e94e00e01495a2ba988836cfccabaaf90580b5` WSL pull·Next production 재빌드 후 390px에서 열린 편집 폼의 scrollWidth/clientWidth 각 375, 수정 제목·25,000원 재조회, 비공개 key 미노출. 공개 검색 `[]`, DB draft/25,000원/publication 0으로 일치. QA review fixture의 reset은 최초 제목으로 상품을 찾으므로 수정된 가상 제목을 정확한 revision ID 조건으로 원복한 뒤 viewport/tab 원복, 두 QA 컨테이너 stop, ID `ae9a57da` reset 완료. accounts/sellers/categories/products/revisions/options/images/publications/audit 9종 각 0, 9091/9092 listener·S2 컨테이너 0, WSL checkout clean·SHA 일치. QA fixture가 제목 수정 후에도 자체 정리되도록 별도 시험과 수정이 필요하며 제품 기능 오류는 아니다.
- QA 도구 제목 변경 정리 시험은 `63840a4` WSL에서 예상된 FK 오류 RED 1회, 시험 finally의 정확 ID 제목 복원·reset 후 핵심 9종 잔류 0. `8990f25`에서 판매자·대/소분류의 QA 고유 식별자로 찾아 reset 목표 1 pass·0 fail·잔류 0. 별도 재고 연결 옵션 삭제 거부 시험 `624a4c3` WSL 목표 1 pass·0 fail·잔류 0.
- 기존 공개 상품에 새 draft revision이 생긴 경우 그 초안의 분류를 바꾸면 `products.category_id`를 통해 현재 공개 분류까지 바뀌는 경계를 `46f6a15` WSL DB에서 의도된 RED 1회로 재현했고 fixture 잔류 0을 확인했다. 제품 수정 `b27c8278caaa96a24dc5ae941e95b764017d121f`에서는 공개 포인터가 있으면 초안의 분류 변경만 409로 차단한다. 해당 DB 목표 1 pass·0 fail·자료 잔류 0, WSL 전체 API 54건 중 48 pass·0 fail·환경별 6 skip, 로컬 전체 120건 중 98 pass·0 fail·DB 22 skip 및 PR 본문 8 pass, 전체 typecheck/lint/API·Next production build 성공. WSL 핵심 10종 각 0행, 9091/9092 listener·S2 컨테이너 0, checkout clean. 현재 수정 API/UI는 초기 draft 편집까지며 승인 후 새 버전 생성·상품 판매중지·실이미지 공개는 미완료; S2 Stage PR/병합·S3 착수 전 남은 S2 계약을 이어간다.

## 진행 중 — 2026-09-27 S2.4 공개 상품 홈→상세 실제 브라우저 QA

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@c0ff1d2` (로컬/원격/WSL 체크포인트 일치). 기존 review QA는 정리 완료, 쇼핑몰 임시 컨테이너 0. 기존 고객 공개 조회 계약만 검증하며 제품의 관리자 승인 경로는 열지 않는다.
- 목표/범위: 정확한 8자리 QA 실행 ID의 가상 계정·판매자·대/소분류·승인 상태의 가상 상품 1개·옵션 재고·공개 포인터를 재현 가능한 시험 전용 도구로 만들고, 홈 카테고리/상품 카드→상세 가격·재고를 실제 브라우저에서 확인한다. 실이미지·실결제·실고객/실상품은 사용하지 않는다.
- 예상 변경: `apps/api/scripts/qa-public-fixture.ts`, `apps/api/test/qa-public-fixture-db.test.mjs`, 필요 시 해당 화면/시험/CSS, 본 현황. DB schema·Secret·외부 비용 없음. WSL 지정 `shoppingmall` DB에서 RED→GREEN·전체 회귀를 확인하고 안전 commit/SSH push→정확 SHA pull 후 일회성 `shoppingmall-s2-public-browser-*` 컨테이너를 사용한다.
- 정리/복구: 브라우저 탭·viewport 원복, 정확한 QA 상품의 publication→inventory→옵션/개정→상품→분류를 먼저 지운 뒤 기존 계정 fixture reset. 명명된 QA 컨테이너·9091/9092 listener·핵심 DB 잔류 0을 확인한다. 실패 시 마지막 안전 commit은 유지하고 해당 ID의 임시 자원만 정리한다. 200% 확대·키보드·인쇄/실이미지는 별도 검증으로 남긴다.
- WSL 정확한 `99af3b4`에서 새 시험 도구 부재의 의도된 RED 1회(자료 생성 전). `60bc63b81324e05f1e98d78db2ecd065608e89ab`에서 지정 DB 목표 1 pass·0 fail, 전체 API 54건 중 48 pass·0 fail·환경별 6 skip, 로컬 전체 118건 중 96 pass·0 fail·DB 22 skip 및 PR 본문 8 pass, API typecheck·lint 통과. 브라우저 QA 실행 ID `bbacf356`; 사전 핵심 9종 DB 행 각 0, 9091/9092 listener 0, 쇼핑몰 S2 컨테이너 0, WSL checkout clean. 생성 예정 자원은 QA ID `bbacf356` 자료와 `shoppingmall-s2-public-browser-api-60bc`, `shoppingmall-s2-public-browser-web-60bc` 두 컨테이너뿐이다.
- 동일 SHA의 WSL API/Next production build(정적 10·동적 상세 1) 후 `/ready` 정상, 가상 공개 상품 API 1건 확인. 실제 브라우저 홈 대분류·상품 카드→상세 클릭에서 500g·23,000원·판매 가능 5개·판매자 직접 발송·설명을 확인했고, 대분류→검색에서 선택된 분류와 동일 상품 1건을 확인했다. 390px 상세/430px 목록/1440px 목록은 문서 scrollWidth=clientWidth(각 375/430/1440), 비공개 `quarantine/` 문자열 노출 없음. 브라우저 viewport reset·임시 탭 종료, 지정 컨테이너 stop·QA ID `bbacf356` reset 후 accounts/sellers/categories/products/revisions/options/inventory/publications/audit 9종 각 0행, 9091/9092 listener·S2 임시 컨테이너 0, WSL checkout clean·SHA 일치. 오류 0. 실이미지·200% 확대·키보드·인쇄는 아직 미검증이며 관리자 승인 제품 흐름 증거가 아니다.

## 진행 중 — 2026-09-27 S2.2 관리자 상품 심사 자료 보강

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@5780102a2e79c1304d6ae31810147874d829bd8e` (로컬/원격/WSL 일치). 홈 QA 컨테이너·포트·시험 DB 자료 잔류 0을 확인한 뒤 착수한다.
- 목표: 대기 상품 심사 목록에 설명·산지·발송 방식·옵션별 가격·등록 사진 개수만 추가하고 비공개 object key·원본 이미지는 응답/화면에 포함하지 않는다. 승인·공개 실행, 새 schema, Secret/공급자 연동은 하지 않는다. 이 작업은 이미지 검사/공개 저장소와 승인 흐름을 대신하지 않는다.
- 예상 파일: `apps/api/src/catalog/product-reviews.ts`, `apps/api/test/product-review-db.test.mjs`, `apps/web/app/account/admin/proposals/page.tsx`, `apps/web/test/admin-proposals.test.mjs`, 본 현황. 로컬 화면 RED→GREEN, WSL 지정 DB의 QA fixture로 API RED→GREEN·정리 0 확인 후 전체 회귀. QA는 해당 DB 시험이 생성한 `qa-<suffix>` 가상 계정/판매자/분류/상품·사진 메타데이터만 사용하고 finally에서 ID별 삭제한다. 별도 지속 자원/포트 없음. 실패 시 직전 안전 commit 유지·QA 정확 ID 정리.
- 화면 목표 시험은 기존 상품명/반려만 보이고 설명이 누락되어 예상대로 RED 1회. DB 시험에는 같은 QA fixture의 옵션·비공개 사진 메타데이터를 추가하고 상세값·비공개 key 미노출을 요구한다. 안전한 시험-only commit/push 후 WSL 지정 DB에서 RED와 ID별 정리 0을 확인한다.
- WSL 정확한 `283587886933f92e9ab630fa47c8326509ca10d9` 지정 DB 시험은 `proposal.description` 부재로 예상 RED 1회, 이후 accounts/options/images/revisions/audit 5종 각 0행·일회성 시험 컨테이너 0. 서비스 조회 SQL에 설명·산지·발송 방식·가격 순서·사진 개수만 추가하고 key는 선택하지 않는다. 관리자 화면도 같은 계약을 표시한다. 로컬 목표 화면 4 pass, 전체 116건 중 96 pass·0 fail·DB 전용 20 skip, PR 본문 8 pass, typecheck·lint·API/Next build 10경로 통과. 실제 WSL DB GREEN/전체 회귀·브라우저 화면은 아직 미검증, 제품 코드 오류 0.
- 정확한 `7facaa3ff2b191b3d9e09a017c0535640e8de351` SSH push→WSL pull 후 지정 DB 심사 자료 목표 1 pass·0 fail, WSL API 전체 52건 중 46 pass·0 fail·환경별 6 skip, Next production build 10경로 성공. accounts/sellers/categories/products/revisions/options/images/publications/audit 9종 각 0행, 임시 review 컨테이너 0, WSL checkout clean. 화면 SSR 4 pass는 실제 로그인·대기 상품의 브라우저 검증을 대신하지 않는다. 관리자 승인·고객 이미지 공개는 여전히 닫힌 경계다.
- 다음 실제 브라우저 QA: 기존 `runQaFixture`의 8자리 16진수 실행 ID·가상 관리자 계정을 재사용하고 동일 ID 접두사의 대/소분류·대기 상품·옵션·비공개 사진 메타데이터를 만드는 재현 가능한 전용 script를 시험 우선으로 작성한다. WSL `shoppingmall` 지정 DB의 이 식별자만 seed/reset하고, API/웹 일회성 컨테이너는 `shoppingmall-s2-review-browser-api-*`·`shoppingmall-s2-review-browser-web-*`로 사용 후 중지한다. 실패 시 먼저 정확 ID 상품 종속 자료→카테고리→기존 fixture reset 순으로 정리하고 타 DB·계정/상품을 삭제하지 않는다. 실제 이미지 바이트/공개 URL은 이번 QA에 사용하지 않는다.
- WSL 정확한 `71fa72496ce3dc0e0cd00266b90a17a4a5266c45`에서 QA review fixture 함수 부재 assertion RED 1회(데이터 생성 전), `apps/api/scripts/qa-review-fixture.ts`에 `shoppingmall` 한정 seed/reset·가상 대기 상품/옵션·메타데이터만 구현했다. 원본 이미지 파일은 만들지 않는다. 로컬 DB 시험은 환경상 1 skip으로 GREEN 증거가 아니며, typecheck·lint 통과. 다음은 새 commit의 WSL 지정 DB에서 seed/reset 시험과 잔류 0을 확인한다.
- 정확한 `6832734aeeb10b0149470c01f4e793ce008847b0` SSH push→WSL pull 뒤 fixture 지정 DB 시험 1 pass·0 fail. 실제 브라우저 QA 실행 ID는 `03776b53`, 가상 관리자/판매자 계정은 기존 fixture 규칙, 상품명은 `qa-03776b53-review-chili`. 사전 accounts/revisions/images 3종 각 0행, 9091/9092·review 임시 컨테이너 점유 0. 사용할 컨테이너는 `shoppingmall-s2-review-browser-api-6832`, `shoppingmall-s2-review-browser-web-6832`; 정확한 fixture reset과 컨테이너 stop, 브라우저 임시 탭·viewport reset 후 잔류 0을 확인한다. 실계정·실상품·실이미지·실결제 없음.
- 동일 커밋에서 WSL API/Next 재빌드 후 가상 관리자 로그인→상품 요청 검토 실제 브라우저 경로를 확인했다. 대기 상품·판매자·산지·직접 발송·설명·500g/23,000원·대표 사진 1개가 표시되고 비공개 `quarantine/` 경로는 DOM에 없었다. 390px 모바일에서도 문서 scrollWidth/clientWidth 각 375px, 비공개 경로 없음. 키보드·200% 확대·실이미지 preview는 미검증. viewport reset·임시 탭 종료 뒤 지정 컨테이너 두 개 stop 및 실행 ID `03776b53` fixture reset; accounts/sellers/categories/products/revisions/options/images/publications/audit 9종 각 0행, 9091/9092 listener·임시 컨테이너 0, WSL checkout clean 확인. 브라우저 시험·정리 오류 0.

## 진행 중 — 2026-09-27 S2.4 고객 홈의 공개 카탈로그 연결

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@24a1342631985101db3b1bfe1fceae98826dc915`. Flat v2 홈·승인된 S2.4 계약을 따른다.
- 목표/범위: 관리자 등록 대분류와 실제 공개·판매 가능한 최신 상품을 홈에 조회·탐색 링크로 표시한다. 개인화·기획전 관리·이미지 공개·장바구니는 이번 작업에 포함하지 않으며, 데이터가 없거나 API 연결이 안 되면 실제 상태를 알린다. 새 DB schema·Secret·외부 서비스·운영 자료 변경 없음.
- 예상 파일: `apps/web/app/page.tsx`, `apps/web/test/page.test.mjs`, 필요 시 `apps/web/app/styles.css`, 본 현황. 기존 9091/9092는 현재 꺼져 있고 WSL `shoppingmall` DB QA 행 0, migration 5건. RED→GREEN 로컬 검증 후 안전한 commit/SSH push→WSL exact pull/build·브라우저 빈 상태 시험을 계획한다. 일회성 QA 컨테이너는 `shoppingmall-s2-home-api-*`, `shoppingmall-s2-home-web-*`로 명명하고 종료 후 포트·자료 잔류 0을 확인한다. 실패 시 이 branch의 직전 안전 commit으로 코드 복귀하고 DB에는 쓰지 않는다.
- 기존 홈 정적 섹션은 서버 컴포넌트로 유지하고 카탈로그 조회만 고객 클라이언트 컴포넌트로 분리했다. 관리자 대분류 링크·공개 최신 상품 4개/가격·빈 결과/연결 오류의 시험은 구현 전 `HomeCatalogView` 부재 RED, 로컬 목표 4 pass로 GREEN. 로컬 전체 test 115건 중 95 pass·0 fail·DB 전용 20 skip, PR 본문 검사 8 pass, typecheck·lint·API/Next production build 10경로 통과. 실제 WSL/브라우저와 공개 상품 표시·200% 확대는 아직 미검증; 반복 구현 오류 0.
- 정확한 `1251ecc958fedb0d293940303bd571e6e5c828cc` SSH push→WSL pull, Next build 10경로 성공. 최초 QA API `/ready`는 정상이나 카테고리/상품 GET 404였다. 소스의 카탈로그 라우트와 달리 WSL `apps/api/dist`에는 카탈로그 파일이 없는 구형 빌드였음을 확인해 같은 Git 소스로 API를 재빌드·일회성 서버 재시작한 뒤 두 GET이 `[]`로 정상화됐다(운영 절차 오류 1회, DB/소스 변경 없음). 실제 브라우저의 홈은 빈 대분류·상품 준비 중을 구분해 표시했다. 390px 화면에서 검색 입력 placeholder가 안 보였고 계산된 글자 크기 `0px`를 확인했다. 기존 모바일 `.search-preview{font-size:0}`의 상속이 원인으로, 검색 입력에만 16px 적용·재검증을 진행한다. 실제 공개 상품 카드·200% 확대는 여전히 미검증이다.
- 모바일 입력에 한정해 16px 규칙을 추가했다. 실제 브라우저의 `getComputedStyle` 0px가 수정 전 실패 증거이며, 수정 후 동일 브라우저 재검증은 아직이다. 로컬 전체 test 115건 중 95 pass·0 fail·DB 전용 20 skip, PR 본문 8 pass, typecheck·lint·API/Next build 10경로 재통과. 제품 코드 재시도 오류 0; 위 API 구형 빌드 원인/조치와 분리 기록한다.
- 정확한 `864bd0c343436998c52894741ed109a712974d9d` WSL pull·Next build 후 실제 390px 브라우저에서 입력 글자 `16px`를 확인했다. 동시에 document scrollWidth 405px/clientWidth 375px로 새 가로 넘침을 발견했다(같은 모바일 검색 크기 수정의 회귀 1회). 원인은 헤더 검색 form의 `min-width:auto`가 264px 아래로 줄지 않아 로그인 링크 오른쪽 끝이 405px인 것. form에 `min-width:0`만 추가하고 동일 viewport·가로폭을 재검증한다. 기존 QA 서버는 정확한 이름으로 중지 후 재빌드하며 DB 변경은 없다.
- 정확한 `03bbc2e2273d6b4b7fe5168561a3d5a4f29271e4` SSH push→WSL pull·Next build 10경로 성공. 실제 390px 브라우저에서 홈 빈 카테고리·상품 상태, 검색 입력 계산 글자 16px와 화면에 보이는 안내 문구를 확인했다. 문서 scrollWidth/clientWidth 각 375px, 로그인 링크 오른쪽 357px로 가로 넘침이 없어졌다. 브라우저 viewport reset·임시 탭 종료, 이름이 정해진 두 QA 컨테이너 종료 후 9091/9092 listener·`shoppingmall-s2-home-*` 컨테이너 0. WSL checkout clean/정확한 HEAD 일치, accounts/sellers/categories/products/publications/inventory/audit 7종 각 0행. 실제 공개 상품 카드→상세·200% 확대·인쇄는 미검증이다. 모바일 동일 기능 회귀 1회 수정 후 재검증 완료; 구형 API 빌드 운영 오류 1회 수정.

## 진행 중 — 2026-09-27 S2.4 공개 상품 상세 고객 화면

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@35c465968309fcfcab7b687a8f82a02c39936a10`. 공개 상품 목록/상세 API는 지정 DB 시험 통과, 이미지 공개/관리자 승인/장바구니는 아직 닫힌 경계다.
- 목표: 검색 결과에서 실제 상세 경로로 이동해 승인된 상품명·판매자·산지·발송 방식·설명·옵션 가격/판매 가능 수량과 품절 표시를 조회한다. 이미지는 허위 자리표시만 두고 사설 object key를 노출하지 않는다. S3 장바구니 전에는 구매 행동을 제공하지 않으며 준비 중임을 명시한다. 새 DB schema·Secret·외부 서비스 없음.
- 예상 파일: `apps/web/app/products/page.tsx`, `app/products/[productId]/page.tsx`, 화면 시험/CSS, 본 현황. WSL에서는 Git pull·production build 후 공개 데이터 없는 기본 빈 상태와 비공개 ID 404 경계를 실제 브라우저에서 확인한다. QA 계정/상품을 따로 만들지 않는다.
- 상세 화면 파일 부재 RED 1회 후 검색 카드 실제 링크와 승인 상품 상세 표시를 추가했다. 대표 사진은 미공개 안전 경계 때문에 자리표시, 구매 행동은 S3 전까지 제공하지 않는다. SSR 목표 3 pass, 로컬 전체 test·typecheck·lint·API/Next production build 통과하며 동적 `/products/[productId]` 경로가 생성됐다. 새 DB·외부 자원은 없다. 실제 WSL build/브라우저 비공개 ID 처리·모바일은 아직 미검증이다.
- 정확한 `06e33d1ce902c5c627036284aa5a8e0ca91acd5c` SSH push→WSL pull 후 Next production build 10 정적+상세 동적 경로 성공. 실제 브라우저에서 존재하지 않는 UUID의 상세는 상품 자료 없이 ‘상품을 찾을 수 없습니다’로 표시됐고, 시험 API/웹 컨테이너와 QA 탭을 종료했다. 최종 accounts/sellers/products/revisions/publications/audit 6종 각 0행, migration 5건, 9091/9092 listener·임시 컨테이너 0, WSL checkout clean. 실제 승인 상품 카드→상세 클릭/모바일 상세는 공개 상품 데이터가 없어 아직 미검증이며 SSR fixture 성공으로 대체하지 않는다.

## 진행 중 — 2026-09-27 S2.4 공개 상품 상세 읽기 경계

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@054dd68f32180fb362906a599adb26c6d42cac95`. 공개 목록 DB/API와 검색 화면은 확인됐으며 상품 승인/공개 쓰기·이미지 공개는 아직 닫혀 있다.
- 목표: 명시적 공개 포인터가 가리키는 approved revision만 상품 상세에서 읽고 옵션별 현재 판매 가능 수량·가격을 표시한다. 목록에서는 제외되는 품절 공개 상품의 상세는 품절 상태로 읽을 수 있으나 구매는 연결하지 않는다. pending/draft·다른 revision·비공개 object key는 응답에 넣지 않는다. 새 DB schema/Secret/외부 비용 없음.
- 예상 파일: `apps/api/src/catalog/public-products.ts`, `controller.ts`, 공개 상품 DB 시험, 본 현황. 현재 `shoppingmall` DB는 QA 행 0·migration 5건. 목표 시험은 기존 QA fixture의 정확한 ID만 사용하고 정리한다.
- 기존 공개 검색 DB fixture에 approved+재고 5 상세·pending 비공개·approved+품절 0 상세, object key 비노출, 잘못된 ID 400 및 HTTP 200/404를 요구하는 계약을 먼저 추가했다. 구현 전 WSL의 정확한 커밋에서 의도한 `service.get` 부재 RED를 확인하고 QA 잔류 0을 재조회한 뒤 구현한다.
- 정확한 `6d94b2e4a66b889a8686e66bc388c70186131b85`에서 WSL 실제 DB 목표 시험은 `service.get is not a function` RED 1회, 뒤이어 accounts/sellers/products/revisions/options/publications/inventory/categories 8종 각 0행·임시 컨테이너 0 확인. 승인 포인터의 공개 revision만 상세 조회하고 옵션별 보유가 아닌 판매 가능 수량을 읽는 서비스+익명 GET 경로를 구현했다. 로컬 API typecheck·lint 통과, 실제 DB GREEN/전체 회귀는 아직 미검증이다.
- 정확한 `1a21d70c4347d8dd8d322b6d793e739014ba3b88` SSH push→WSL pull 후 공개 상세 DB/HTTP 목표 1 pass·0 fail(승인 공개 옵션 5/품절 0/비공개 404/잘못된 ID 400), 전체 API 52건 중 46 pass·0 fail·환경별 6 skip. 로컬 전체 test·API typecheck·lint·API/웹 build 10경로 통과. 최종 QA 핵심 9종 각 0행, migration 5건·임시 컨테이너 0·WSL checkout clean. 상품 상세 고객 화면과 이미지 공개·장바구니는 아직 미구현이다.

## 진행 중 — 2026-09-27 S2.4 공개 상품 검색의 읽기 경계

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@2e45c4c831b0b9b2ac035ffad5682a84d84bc2fe`. 상품 승인·공개 쓰기 경계는 아직 닫힌 상태다.
- 목표/계약: 공개 상품 목록은 명시적 `product_publications` 포인터가 가리키는 `approved` revision만 읽고 현재 판매 가능 옵션이 1개 이상인 상품만 포함한다. 상품명/판매자 이름의 문자 그대로 검색, 대/소분류·판매자 필터와 최신/최저가 정렬을 서버에서 제한된 입력으로 처리한다. 이미지 원본/비공개 키는 응답에 포함하지 않는다. 이 단계는 목록 읽기만이며 개인별 추천·인기/리뷰 정렬·관리자 승인/고객 결제 증거가 아니다.
- 예상 파일: `apps/api/src/catalog/public-products.ts`, `controller.ts`, 단위/DB·HTTP 시험, 본 현황. 기존 DB schema·Secret·외부 서비스 변경 없음. QA는 정확한 시험 ID의 가상 seller/category/product/revision/option/inventory/publication만 생성·삭제하고 지정 DB의 다른 자료는 건드리지 않는다.
- DB 계약 시험은 서비스 파일 부재 RED 1회 후 공개 포인터+approved+판매 가능 재고만 반환하고 비공개 키 미노출/문자 그대로 검색/대·소분류·판매자 필터/최저가 정렬과 공개 HTTP 200·잘못된 정렬 400을 요구한다. 서비스·GET API 구현 후 로컬 typecheck 통과, 무DB에서 시험은 1 skip이므로 실제 GREEN이 아니다. 다음은 정확한 커밋으로 WSL DB 목표 시험과 전체 회귀·QA 정리를 확인한다.
- 정확한 `fa7e81730eb79f782dd8a82054d4d7a8d45dc384` SSH push→WSL pull 후 지정 DB 공개 검색 서비스+익명 HTTP 목표 시험 1 pass·0 fail, 전체 API 52건 중 46 pass·0 fail·환경별 6 skip. 로컬 110건 중 90 pass·0 fail·DB 전용 20 skip, PR 검사 8 pass·typecheck·lint·API/웹 build 9경로 통과. 최종 QA 핵심 10종 각 0행, migration 5건·임시 컨테이너 0·WSL checkout clean. 아직 실제 고객 화면에 API 연결·상품 승인/공개 쓰기·실이미지 URL·브라우저 검색 E2E는 미구현/미검증이다.
- 홈 장식용 검색을 실제 `/products?q=...` 폼으로 바꾸고, 공개 API 기반 상품 검색 화면(대/소분류·최신/가격 정렬·빈 결과·연결 오류)을 추가했다. SSR 시험 파일 부재 RED 1회→목표 2 pass, 로컬 전체 112건 중 92 pass·0 fail·DB 전용 20 skip, PR 검사 8 pass, typecheck·lint·API/Next build 10경로 통과. 검색 화면은 상품 상세·이미지·결제 링크를 아직 제공하지 않는다. 이 화면의 WSL/실제 브라우저·모바일 검증 전이며 공개 상품이 없는 DB의 빈 결과가 정상 기준이다.
- WSL 정확한 `1eedb9d7205e3eca98a47eebf1f33db9e98aac60` Next build 10경로·API health/공개 목록 []/웹 200 후 실제 in-app browser 홈 검색→결과 화면·390px 모바일 표시·Tab으로 분류/정렬 접근을 확인했다. 가격 정렬을 키보드로 제출하면 `categoryId=`가 포함되어 API 400, 화면 오류가 나는 실제 결함 1회 발견했다. 또한 URL 정렬값은 바뀌었는데 무제어 select 표시가 최신순으로 남았다. 정확한 두 시험 컨테이너 종료·viewport reset·QA 탭 종료 후 API의 빈 전체 필터 정규화와 검색 입력/select의 URL 상태 반영을 수정했다. 수정 전 WSL API 400 재현, 새 DB·UI 회귀 시험 추가, 로컬 전체 test·typecheck·lint·API/웹 build 통과. 수정 커밋의 WSL DB/browser GREEN은 아직 미검증이며 임시 서버를 재시작하지 않았다.
- 정확한 `1b29811f78a014b09a7b23a581b1cc8f83402018`에서 빈 전체 필터 DB·HTTP 시험 1 pass, WSL Next build 10경로, 앞서 400이던 동일 API 요청 200. 실제 브라우저는 오류 대신 빈 결과·최저가순을 보였지만 `key` 변경으로 검색 입력이 2개 렌더되는 결함 1회 확인했다. QA 탭과 시험 서버 종료 후 임시 key 방식 대신 query/category/sort를 제어 입력으로 변경했다. 로컬 해당 SSR 2 pass·typecheck·lint 통과, 새 변경의 WSL build/브라우저 재검증은 아직 미실행. 반복된 동일 원인 오류는 아니며 두 번째 별개 화면 상태 처리 결함이다.
- 정확한 `9e5776a084da99b2627d4ec5d44e8e54c0f44698` SSH push→WSL pull 후 Next production build 10경로 성공. 실제 브라우저에서 검색 입력 1개·고추 값·전체 카테고리·최저가순·정상 빈 결과를 확인하고 390px 모바일 화면 및 Tab→Tab→Enter 재검색에서 동일 URL/결과가 유지됨을 확인했다. 실제 상품 카드 표시·200% 확대·인쇄는 미검증이다. 모바일 viewport reset·QA 탭 및 이름이 정해진 임시 서버 2개 종료. QA 핵심 테이블 10종 각 0행, migration 5건, 9091/9092 listener 0·임시 컨테이너 0·WSL checkout clean. 두 브라우저 결함은 각각 1회 발생 후 수정·재확인했으며 이번 최종 반복 오류 0.

## 진행 중 — 2026-09-27 S2.2 이미지 안전 공개 경계

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@47d1c85190b81c6362a76e9131f9b0836a4407f7`. S2.3 브라우저 QA와 정리 완료 후, 고객 공개를 막고 있는 이미지 검증을 먼저 처리한다.
- 목표: 현재 개발 전용 quarantine의 컨테이너 식별은 실제 디코딩/메타데이터 제거 증거가 아니다. 승인된 PNG/JPEG/WebP 바이트만 픽셀 수·크기 제한 아래 디코딩하고 새 이미지로 재인코딩하는 시험과 모듈을 작성한다. 원본은 비공개 유지하며 이 단계만으로 관리자 승인/공개 API를 열지 않는다.
- 예상 파일: `apps/api/src/catalog/image-sanitizer.ts`, 해당 단위시험, API dependency/lockfile, 본 현황. 새 DB schema·Secret·외부 계약·운영 데이터 변경 없음. 패키지 설치가 필요하면 기존 pnpm lock의 버전을 우선 사용한다. 실패 시 새 모듈을 호출하지 않으며 기존 quarantine 경계 유지.
- 현재 증거: 공식 npm 메타데이터로 기존 lock의 sharp 0.35.4를 API 직접 의존성에 연결했다. 허용 형식 실제 decode→metadata 없는 WebP 재인코딩과 MIME 불일치·손상·SVG·가로 제한 시험 2건 RED(모듈 없음)→GREEN. 로컬 전체 109건 중 90 pass·0 fail·DB 전용 19 skip, PR 검사 8 pass, typecheck·lint 통과. 첫 제한된 Next build는 `.next/trace` EPERM 1회, 동일 D: 경로 권한으로 재실행해 API/웹 build 9경로 성공. 구현 반복 오류 0, 공급자/악성 코드 검사·스토리지 공개·관리자 승인 및 WSL native sharp 검증은 아직 남았다.
- WSL 정확한 `6ba4d16f620bcdbb0d4b9b291ffb172b27520043`에서 Linux native sharp·격리 저장 목표 시험 5 pass·0 fail, 지정 `shoppingmall` DB 전체 API 51건 중 45 pass·0 fail·환경별 6 skip. QA 핵심 테이블 10종 각 0행·migration 5건·임시 컨테이너 0. pnpm 실행이 만든 정확한 미추적 `.pnpm-store` 1.1MB를 범위 확인 후 제거, WSL checkout clean.
- 이어 비공개 스테이징 자체가 원본 PNG 대신 새 WebP를 저장하도록 강화했다. 저장 바이트·DB MIME/크기 일치 기대를 먼저 RED(원본 `.png`)로 확인한 뒤 GREEN 5건. 로컬 전체 109건 중 90 pass·0 fail·DB 전용 19 skip, PR 검사 8 pass, typecheck·lint·production build 재통과. 아직 이 두 번째 변경의 WSL DB/HTTP 통합시험은 미검증이며 관리자 승인·고객 공개도 열지 않았다.
- 정확한 `d89f40316544c14e5cfdb3a296975fc4f3bb7a16`을 SSH push→WSL pull 후 새 재인코딩의 상품 이미지 DB/인증 HTTP 목표 시험 2 pass·0 fail, 전체 API 51건 중 45 pass·0 fail·환경별 6 skip. QA 핵심 테이블 10종 각 0행, migration 5건·임시 컨테이너 0·WSL checkout clean. 업로드된 원본은 더 이상 그대로 보관하지 않지만 이 결과는 바이러스 스캔·고객 공개 승인/스토리지 제공이나 사용자 인수를 의미하지 않는다. 다음은 승인 전후 공개 포인터와 공개 조회 경계를 별도 시험으로 구현한다.

## 최신 상태 — 2026-09-27 S2.3 재고 역할별 브라우저 QA 완료

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@47d1c85190b81c6362a76e9131f9b0836a4407f7`. WSL 일회성 API/웹과 in-app browser에서 가상 운영자·판매자 A로 시험했다.
- 운영자 대/소분류 등록 → 판매자 500g/23,000원 상품 초안 저장 → 보유 10개 직접 입력 시 판매 가능 0개·승인 대기 → 운영자에게 판매자 이름으로 구분된 요청 노출·승인 → 판매자 재로그인 후 판매 가능 10개 → 0개 직접 입력 시 즉시 판매 가능 0개를 실제 화면에서 확인했다. 초안 상태라 고객 상품 노출·구매 차단 E2E는 이 시험의 증거가 아니다.
- QA 실행 `b47d1a20`의 정확한 상품·revision·옵션·재고/요청·대/소분류만 DB 트랜잭션으로 삭제, fixture 가상 계정 5개 reset, 브라우저 탭과 정확한 일회성 컨테이너 2개 종료. 최종 accounts/sellers/categories/products/revisions/options/inventory/requests/audit 9종 각 0행, migration 이력 5건, 9091·9092 listener/임시 컨테이너 0, WSL checkout clean 확인. 브라우저 시험·정리 오류 0.
- 실제 모바일 viewport·200% 확대·키보드·인쇄, 상품 안전 공개, 마지막 수량 동시 구매는 아직 미검증·미구현이다. 다음은 S2.2 안전한 이미지 공개·상품 승인 경계 또는 S2.3 구매 가능 재고의 동시성 계약을 이어간다.

## 최신 상태 — 2026-09-27 S2.3 역할별 재고 실제 브라우저 QA 자원 준비

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@47d1c85190b81c6362a76e9131f9b0836a4407f7` (SSH 원격/WSL 일치). 실제 브라우저 시험의 고객/판매자/관리자 URL은 WSL `http://172.27.253.53:9091`, API는 같은 호스트 9092. 시작 전 `ss`에서 9091·9092 LISTEN 0, `shoppingmall-s2-browser-*` 컨테이너 0 확인.
- 계획된 QA 자원: 지정 `shoppingmall` DB에 실행 ID `b47d1a20`의 가상 계정 5개·판매자 3개만 fixture로 생성하고, 시험용 대/소분류·상품·옵션·재고 요청을 이 ID에 연결한다. API/웹 일회성 컨테이너 이름은 `shoppingmall-s2-browser-api-47d1`, `shoppingmall-s2-browser-web-47d1`; 가상 비밀번호만 사용하고 실제 개인정보·결제는 사용하지 않는다. UI 검증 종료·실패 시 정확한 상품 종속 자료→분류→fixture reset 순서로 삭제, 컨테이너 종료·포트/DB 잔류 0을 확인한다. WSL 소스는 Git pull 이외 직접 수정하지 않으며 임시 Next build 산출물은 무시 대상이다.
- 검증 대상: 판매자 로그인/옵션 수량 직접 입력→0 즉시 반영→증가 승인 대기, 관리자 로그인/해당 판매자별 증가 요청 승인, 판매자 재조회. viewport·키보드·200% 확대는 가능한 실제 브라우저 상태에서 구분해 기록한다. 실제 결제·출고/인수는 이번 QA가 아니다.

## 최신 상태 — 2026-09-27 S2.3 재고 목록·역할별 화면 WSL DB/build GREEN

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@1c109c40efcdd0de452f473f1c29a2d04b3f5a28` (SSH 원격/WSL 일치). 판매자 소유 옵션/관리자 증가 요청 목록의 목표 WSL 실제 DB 시험 2 pass·0 fail. 전체 API 49개 중 43 pass·0 fail·환경별 6 skip, WSL Next.js production build 9경로 성공. 로컬 전체 test/typecheck/lint/build도 통과.
- 지정 `shoppingmall` DB migration 이력 5건, 계정/역할/세션/신원/판매자/분류/상품/옵션/재고/요청/감사 13종 각 0행, `shoppingmall-s2-*` 임시 컨테이너 0, WSL checkout clean. 시험 실패 오류 0. 판매자/관리자 화면 SSR은 서버 역할 확인 전 자료 비노출과 직접 수량 입력·증가 승인 표시를 확인했지만 실제 브라우저 동작·모바일·200% 확대·키보드·인쇄는 미검증이다.
- 변경 파일: 본 현황. S2.3의 실제 마지막 수량 동시 구매, 정책/배송, 관리자 요청 화면의 실제 브라우저, S2.2 안전 이미지 공개·상품 승인과 나머지 Stage가 남았다. 전체 구축/인수 준비 완료가 아니다. 다음은 브라우저 재고 흐름·반응형/접근성, 이후 이미지 승인과 주문 경합 구현을 계속한다.

## 최신 상태 — 2026-09-27 S2.3 재고 목록 API·판매자/관리자 화면 WSL 검증 대기

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@54d1589acd48bb71d6d8b6a484daa860ec6203f1` (SSH 원격/WSL 일치). 판매자 소유 옵션 목록과 관리자 증가 요청 목록의 실제 DB 시험은 `inventory.listOwned is not a function` RED 1회, QA 잔류 0 확인. 이어 소유 판매자 범위/대기 요청만 조회하는 API를 구현했고 가짜 역할 헤더 목록 GET은 404 RED→401 GREEN.
- 판매자 화면에 옵션별 보유/판매 가능 수량과 승인 대기 표시, 0 이상 정수 직접 입력·서버 재조회 추가. 관리자 요청 화면에는 판매자별 요청/현재 판매 가능 수량/승인 버튼을 추가했다. 목록 요청은 독립 호출을 병렬화했고 세션 역할 확인 전 비공개 자료를 표시하지 않는다. SSR 화면 시험 각 1건 RED→GREEN, 전체 로컬 test·typecheck·lint·API/Next production build 통과. 실제 목록 DB GREEN·브라우저 클릭/모바일·확대·키보드는 미검증.
- 변경 파일: `apps/api/src/inventory/service.ts`, `catalog/controller.ts`, `apps/api/test/inventory-db.test.mjs`, `inventory-http.test.mjs`, `apps/web/app/account/seller/products/page.tsx`, `admin/proposals/page.tsx`, 두 화면 시험, 본 현황. 오류: 의도한 목록 서비스 부재 RED 1회·경로 부재 RED 1회·관리자 컴포넌트 부재 RED 1회; 구현 반복 오류 0. 다음은 안전한 commit/push→WSL 정확한 커밋 DB 목록/전체 회귀·QA 정리→실제 브라우저 검증이다.

## 최신 상태 — 2026-09-27 S2.3 재고 인증 HTTP 실제 DB GREEN

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@81d9d8b95ab54900e97ccaf88ea4393d154881da` (SSH 원격/WSL 일치). 판매자/관리자 인증 HTTP 목표 시험 2 pass·0 fail: 신뢰하지 않은 Origin 403, 음수 400, 판매자 0 즉시 반영, 증가 대기, 판매자의 관리자 승인 거부 403, 관리자 승인 후 수량 7, 중복 409. 이전 정리 순서 오류는 수정됐고 이 실행의 QA 정리는 성공했다.
- WSL 실제 `shoppingmall` DB 전체 API 49개 중 43 pass·0 fail·무DB 전용 6 skip. migration 이력 5건 보존, 계정/역할/세션/신원/판매자/분류/상품/옵션/재고/요청/감사 13종 0행, `shoppingmall-s2-*` 임시 컨테이너 0, WSL checkout clean. 로컬 전체 105개 중 86 pass·0 fail·DB-only 19 skip, PR 본문 8 pass, typecheck·lint·API/Next build 통과.
- 변경 파일: 본 현황. 이번 목표/전체 재시험 오류 0. 판매자/관리자 재고 화면, 고객 구매의 재고 경합·예약, 안전 이미지 공개·상품 승인 및 이후 Stage는 미구현이다. S2.3 전체 완료가 아니다. 다음은 재고 화면/관리자 승인 목록 및 재고 경합 계약을 이어간다.

## 최신 상태 — 2026-09-27 재고 인증 HTTP 시험 QA 정리 순서 보정

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@1fa60b7d109b4936304b3b802a0ecb37625aaa71` (SSH 원격/WSL 일치). WSL 실제 DB 목표 시험은 `23503 account_roles_seller_id_sellers_id_fk`로 최종 `finally` 정리에서 실패 1회. 앞선 HTTP 본문 흐름도 PASS로 승격하지 않는다. 원인은 시험이 판매자를 지우기 전에 그 판매자에 묶인 `account_roles`·`auth_sessions`를 삭제하지 않은 순서다.
- 남은 자료를 읽기 전용으로 계정 2·역할 4·세션 2·판매자 1·판매자 분류 1행 및 정확한 ID/QA 이름으로 식별. 해당 행만 단일 트랜잭션에서 세션 2→역할 4→신원 2→계정 2→판매자 1→분류 1 삭제, COMMIT. 최종 계정/역할/세션/신원/판매자/분류/카탈로그/재고/요청/감사 13종 0행, 시험 컨테이너 0. 시험 `finally`에서도 계정 세션·역할 정리를 판매자 삭제보다 앞으로 옮겼다.
- 오류 누적: 이번 QA 정리 순서 1회, 동일 원인 반복 1회. 변경 파일: `apps/api/test/inventory-db.test.mjs`, 본 현황. 다음은 수정된 정확한 커밋을 push하여 WSL 실제 DB 목표 시험·전체 회귀를 다시 실행하고 잔류 0을 확인한다.

## 최신 상태 — 2026-09-27 S2.3 재고 인증 HTTP WSL 검증 대기

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@a50c3256fa4ab957c1f59da74202d22050f0ae2a` (SSH 원격/WSL 일치). 직전 migration 0004는 WSL QA DB dry-run·정확한 QA DB 삭제 후 지정 `shoppingmall`에 적용했고, 정식 DB 전체 API 48개 중 43 pass·0 fail·환경별 5 skip, QA 테이블 12종·임시 컨테이너 잔류 0.
- 판매자 `POST /catalog/seller/options/:optionId/stock`과 관리자 `POST /catalog/admin/stock-requests/:requestId/approve`를 세션 역할·Origin 확인 후 서비스에 연결했다. 가짜 역할 헤더의 미인증 404 RED→401 GREEN 로컬 HTTP 시험을 확인했다. 실제 DB HTTP 시험은 판매자/관리자 로그인, 다른 Origin, 음수, 0 즉시 반영, 7개 증가 승인, 판매자 승인 거부, 중복 승인 거부를 요구하도록 추가했으며 WSL 실제 실행 전이다.
- 변경 파일: `apps/api/src/catalog/controller.ts`, `apps/api/test/inventory-http.test.mjs`, `inventory-db.test.mjs`, 본 현황. 오류: 의도한 경로 부재 RED 1회. 다음은 전체 로컬 gate·정확한 커밋 push→WSL 실제 인증 HTTP GREEN/전체 회귀·QA 정리 확인. UI/고객 구매 재고 경합은 아직 미구현이다.

## 최신 상태 — 2026-09-27 S2.3 재고 migration·서비스 실제 WSL DB GREEN

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@a50c3256fa4ab957c1f59da74202d22050f0ae2a` (SSH 원격/WSL 일치). migration 0004는 기존 4건·옵션 0행·신규 테이블 부재를 확인한 후 적용했다. QA 전용 `shoppingmall_qa_mig_fc58`에서 5개 migration과 새 테이블 2개 생성 dry-run 성공; 정확한 QA DB를 삭제하고 부재 확인. 정식 개발 `shoppingmall`은 migration 이력 5건.
- 서비스 실제 DB 시험: 타 판매자/관리자 재고 입력 거부, 음수 거부, 판매자 10개 증가 시 판매 가능 0 유지, 판매자 승인 거부·관리자 승인 후 10, 중복 승인 거부, 0 즉시 차단, 4개 재입고 승인 대기. targeted 2 pass; 전체 API 48개 중 43 pass·0 fail·환경별 5 skip. 최종 accounts/sellers/categories/products/revisions/options/inventory/requests/images/publications/audit 12종 모두 0행, `shoppingmall-s2-*` 임시 컨테이너 0, WSL checkout clean.
- 변경 파일: 본 현황. 실제 DB 마이그레이션 오류 0; 처음 제한된 로컬 `drizzle-kit check`는 명령 접근 제한으로 실패 1회, 허용된 D: 작업 실행에서 재시도하여 통과. HTTP 권한·화면·판매자 재고 입력/관리자 승인 브라우저·마지막 수량 구매 경합은 미구현·미검증. S2.3 완료로 판정하지 않는다. 다음은 인증 HTTP API와 UI, 이후 고객 구매 전 재고 경합 계약을 진행한다.

## 최신 상태 — 2026-09-27 S2.3 재고 migration·서비스 WSL 검증 준비

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes@fc58e08c7ab57ed8e31125e28d0467658fc33daf` (SSH 원격·WSL 일치). 재고 규칙 WSL 단위시험 3 pass, 로컬 전체 102개 중 84 pass·0 fail·DB-only 18 skip, PR 검사 8 pass, typecheck·lint·build 통과.
- 계획된 DB 자원: WSL-server `local-postgres` 안에 **새 QA 전용** `shoppingmall_qa_mig_fc58`를 migration dry-run용으로만 생성한다. 기존 동일 이름 부재와 정확한 대상을 확인한 후 생성, 0000~0004 migration 적용·테이블/제약 확인 후 동일 QA DB만 삭제하고 부재를 재조회한다. `shoppingmall` 정식 개발 DB에는 검증 후 0004만 순서대로 적용한다. 일회성 Node container는 `shoppingmall-s2-mig-fc58` 이름으로 실행 후 `--rm` 및 잔류 0을 확인한다.
- 새 테이블 `inventory_levels`는 옵션별 실제 보유/판매 가능 수량을 분리하고, `stock_change_requests`는 증가 승인·중복 대기·결정 이력을 기록한다. 판매자 감소·0은 즉시 반영하고, 증가·재판매는 관리자 승인까지 sellable을 유지하는 DB 서비스와 정확한 QA fixture 시험을 작성했다. 현재 로컬 무DB 권한 시험 1 pass·DB-only 1 skip, typecheck·lint 통과. 정식 DB migration·DB GREEN·HTTP/화면·구매 경쟁은 아직 미검증/미구현.
- 변경 파일: `apps/api/src/db/schema.ts`, `migrations/0004_s2_inventory.sql`, `migrations/meta/*`, `apps/api/src/inventory/service.ts`, `apps/api/test/inventory-db.test.mjs`, 본 현황. 오류: 계획상 테이블 부재 확인 1회, 서비스 권한 RED 1회. 다음은 schema diff·전체 로컬 gate→safe commit/push→QA DB migration dry-run·삭제→정식 개발 DB migration·실제 DB 서비스 시험·잔류 확인.

## 최신 상태 — 2026-09-27 S2.3 재고 입력/승인 계산 규칙 시작

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`. S2.3 계획의 재고 직접 입력과 증가 승인 경계를 데이터 적용 전에 순수 계산 규칙으로 고정했다. 현재 판매 가능 수량 이하의 입력은 즉시 축소/0 처리하고, 초과 입력은 실제 보유 수량만 변경한 채 판매 가능 수량을 유지한다. 관리자 승인 시에는 요청 수량과 승인 시점 실제 보유 수량 중 작은 값까지만 열어 초과 판매를 피한다.
- 테스트 모듈 부재 RED 후 명시적 미구현 RED 3건→GREEN 3건. 로컬 전체 102건 중 84 pass·0 fail·DB-only 18 skip, PR 설명 8 pass, typecheck·lint·API/Next production build 통과. 변경 파일: `apps/api/src/inventory/stock-policy.ts`, `apps/api/test/stock-policy.test.mjs`, 본 현황. 초기 디렉터리 생성에 파일 도구 실패 1회 후 정확한 작업 경로만 생성했다.
- 이 코드는 아직 DB 저장·권한·관리자 승인 API·구매 경합에 연결되지 않았다. 따라서 실제 품절 차단이나 S2.3 완료의 증거가 아니다. 다음은 계획된 재고 migration/서비스·인증 HTTP·WSL DB 경합 시험이다. 외부 공급자 연결은 계속 구축 후 처리한다.

## 최신 상태 — 2026-09-27 S2.2 판매자 사진 메타데이터 조회 WSL GREEN

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@6f75994d76ab3536059db8230a72b5ac229f5c0f` (SSH 원격·WSL 일치). 판매자 본인만 사진 메타데이터를 조회하고 다른 판매자·고객은 거부하며 비공개 object key는 응답에서 제외하는 DB 시험 통과. 실제 WSL PostgreSQL 전체 API 43개 중 38 pass·0 fail·환경별 5 skip.
- 로컬 전체 99개 중 81 pass·0 fail·DB-only 18 skip, PR 본문 시험 8 pass, typecheck·lint·API/Next production build 통과. WSL 시험 후 accounts/sellers/categories/products/revisions/options/images/publications/audit 10종 각 0행, 일회성 컨테이너 0, WSL checkout clean.
- 변경 파일: 본 현황. 이번 실제 통합 시험 오류 0. S2.2의 완전한 이미지 디코딩/안전 공개 저장·관리자 승인/공개, S2.3 재고와 이후 Stage는 여전히 미구현이다. 다음은 승인된 계획의 이미지 안전 공개 경계 또는 독립적인 재고 계약을 계속 구현한다.

## 최신 상태 — 2026-09-27 S2.2 판매자 소유 사진 메타데이터 조회 검증 대기

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`. 직전 비공개 이미지 컨테이너 보강 커밋 `4922db758dd93dc00b42fd5cdd8736007c5b18ad`는 SSH 별칭 원격·WSL checkout 일치. WSL 실제 `shoppingmall` DB API 43개 중 38 pass·0 fail·환경별 5 skip, 핵심 QA 테이블 10종 전부 0행, 임시 컨테이너 0, WSL checkout clean.
- 다음 S2.2 범위로 판매자 본인 상품 revision의 사진 목적·형식·크기·표시 순서만 조회하고 원본 비공개 object key는 응답에서 제외한다. 다른 판매자/고객 거부를 DB 시험에 추가했고, 가짜 역할 헤더 GET은 404 RED→인증 필요 401 GREEN을 로컬 HTTP 시험으로 확인했다. 전체 typecheck·lint 통과; 실제 DB 목록 GREEN·전체 회귀·production build는 아직 미검증.
- 변경 파일: `apps/api/src/catalog/product-drafts.ts`, `controller.ts`, `apps/api/test/product-image-db.test.mjs`, `product-image-http.test.mjs`, 본 현황. 오류: 의도한 경로 부재 RED 1회; 현재 구현 오류 0. 이 조회는 이미지 본문 공개나 검증된 썸네일 제공이 아니다. 다음은 전체 로컬 gate→commit/push→WSL 정확한 커밋 DB GREEN·QA 잔류 확인이다.

## 최신 상태 — 2026-09-27 S2.2 비공개 이미지 컨테이너 검사 보강

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@ebb5b70504bc1ef5e6cfbe6d896b029ff85906d2`에서 계속. 기존 격리 worktree를 재사용하고 신규 브랜치·자동화는 만들지 않았다.
- 업로드 단계의 파일 시그니처만으로 잘린 PNG·추가 바이트·손상 CRC·잘린 JPEG·RIFF 길이가 틀린 WebP가 수락되는 결함을 RED 시험으로 재현했다. PNG 청크 경계/CRC/IEND, JPEG 종료 마커, WebP RIFF 길이/형식의 기본 검사를 추가해 비공개 저장 전에 거부한다. 실제 기존 1×1 PNG 시험 자료의 잘못된 IDAT CRC도 보정했다. HTTP 잘못된 컨테이너는 400으로 매핑했다.
- 로컬 `pnpm test` 99개 중 81 pass·0 fail·DB-only 18 skip, PR 본문 검사 8 pass, 전체 typecheck·lint 통과. 첫 build는 이 세션의 D: 쓰기 sandbox 권한 부족으로 TS5033 실패 1회; 같은 소스의 승인된 D: 작업 경로에서 권한을 높여 다시 실행한 build는 API·Next 9 정적 경로 모두 성공. 기능 결함 원인의 반복은 없다.
- 변경 파일: `apps/api/src/catalog/image-quarantine.ts`, `controller.ts`, `apps/api/test/image-quarantine.test.mjs`, `product-image-db.test.mjs`, `product-image-http-db.test.mjs`, 본 현황. 이 검사는 완전한 디코딩·재인코딩이나 악성코드 검사/공개 저장을 대신하지 않는다. 고객 공개·관리자 승인은 계속 닫혀 있으며 S2.2 미완료다. 다음은 SSH 별칭 원격 push→WSL 정확한 커밋의 실제 DB 회귀·시험 잔류 확인, 이후 안전 공개 이미지 처리와 승인 흐름이다.

## 최신 상태 — 2026-09-27 시간별 후속 자동 실행은 미설정

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@e9cd13ae0d93d45fdf19678080cb060028452172` (SSH 원격 최신). 전체 구축을 대화 간에 이어가기 위한 매시간 heartbeat 자동화 생성 1회는 사용자의 별도 일정·반복 실행 승인이 없다는 자동 검토에 의해 거부됐다. 자동화나 반복 실행은 생성되지 않았고 이를 우회하지 않는다.
- 승인된 현재 작업의 커밋·검증·WSL QA 정리는 유지된다. 이 예외는 이후 세션 자동 재개만 제한하며 승인된 일반 구현 자체의 중단 사유가 아니다. 시간별 자율 재개를 원하는 경우 빈도와 반복 실행 범위에 대한 신산님의 명시적 승인이 필요하다. 다음 수동 재개는 본 파일의 최신 체크포인트와 PMO/프로젝트 지침을 확인한 뒤 같은 브랜치에서 이어간다.

## 최신 상태 — 2026-09-27 운영자 인증 HTTP 반려 DB GREEN

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@844c6cd03207c5f68eeb048d0cc7c5a18cc4be64` (SSH 원격/WSL 일치). 실제 WSL PostgreSQL에서 운영자 로그인→승인 대기 조회→다른 Origin 403·빈 사유 400·정상 반려 201·중복 409·공개 0 시험 1 pass·0 fail. accounts/sellers/product_categories/products/revisions/audit 모두 0행.
- 변경 파일: 본 현황. 이번 HTTP DB 시험 오류 0. 안전한 이미지 디코딩·재인코딩·공개 저장 및 승인 전 고객 공개 차단 구현, 재고·검색/홈·주문/결제·정산·앱 등 승인된 계획의 나머지 Stage를 이어서 수행해야 한다. 외부 공급자 계정은 사용자 지시대로 구축 뒤 일괄 확인하며 현재의 mock/개발 경계와 구분한다.

## 최신 상태 — 2026-09-27 관리자 반려 실제 HTTP DB 계약 확장 검증 대기

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@11cf242b5be9af951cc58a44dbb407a57cfe3edd` (SSH 원격 최신). 앞선 WSL 실제 DB 전체 API 42건 중 37 pass·0 fail·무DB 전용 5 skip, Next production build 9경로, QA 잔류 0.
- 반려 서비스 DB 시험을 인증된 관리자 HTTP까지 확장: 실제 로그인 세션으로 pending 조회, 신뢰하지 않은 Origin 403, 빈 사유 400, 정상 반려 201, 중복 409, 고객 공개 0을 요구한다. 로컬 workspace typecheck·lint·diff check 통과. 실제 WSL DB 실행은 아직 미검증.
- 변경 파일: `apps/api/test/product-review-db.test.mjs`, 본 현황. 이번 변경 오류 0. 다음은 SSH push→WSL DB HTTP GREEN·정확한 QA 정리. 이미지 안전화/승인 버튼은 여전히 열지 않는다.

## 최신 상태 — 2026-09-27 운영자 상품 검토 WSL build·DB 회귀 통과

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@c7628ff3cb231373c67f417085df7925dc781c0c` (SSH 원격/WSL 일치). Next.js production build는 `/account/admin/proposals`를 포함한 정적 경로 9개 생성·TypeScript 통과. 전체 API 실제 WSL PostgreSQL 회귀 42건 중 37 pass·0 fail·무DB 전용 5 skip.
- 대기 목록/사유 반려 서비스 실제 DB 계약 및 가짜 관리자 헤더 무DB 401 경계, 운영자 화면 세션 전 비노출 SSR 통과. 최종 accounts/sellers/seller_categories/product_categories/products/revisions/options/images/publications/audit 모두 0행, 시험 컨테이너 0, WSL checkout clean.
- 변경 파일: 본 현황. 이번 build/회귀 오류 0. 관리자 HTTP의 인증된 실제 DB·브라우저 반려/반응형·접근성은 아직 미검증. 운영 승인/안전 이미지 공개·재고·검색/홈·장바구니/주문/결제/환불·정산·Android 앱은 미구현. 외부 서비스 계정은 사용자 지시대로 구축 뒤 일괄 준비하되 미연동 결과를 PASS로 대체하지 않는다.

## 최신 상태 — 2026-09-27 운영자 상품 반려 API·화면 WSL 검증 대기

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@90f75881a83c61f56eac2cdd582cb811ffcc9e85` (SSH 원격/WSL 일치). 운영자 전용 대기 목록과 사유 반려 서비스 WSL 실제 DB 1 pass·0 fail; 시험 QA 핵심 행 0. 반려는 별도 요청자/결정자·사유/시각·감사 기록을 남기고 고객 공개 0을 유지한다.
- `GET /catalog/admin/proposals`, `POST /catalog/admin/proposals/:id/reject`와 운영자 `/account/admin/proposals`를 연결했다. 가짜 `x-role: admin` 접근은 무DB HTTP 404 RED→401 GREEN; 화면은 세션 확인 전 목록 비노출 및 사유 필수/안전하지 않은 승인 버튼 없음 SSR RED→2 pass. 전체 workspace typecheck·lint·diff check 통과.
- 변경 파일: `apps/api/src/catalog/controller.ts`, `apps/api/test/catalog-http.test.mjs`, `apps/web/app/account/admin/proposals/page.tsx`, `apps/web/app/account/page.tsx`, `apps/web/test/admin-proposals.test.mjs`, 본 현황. 오류 누적: 의도한 API 경로 부재 RED 1회·화면 파일 부재 RED 1회, 새 화면 디렉터리 부재로 첫 apply_patch 실패 1회 후 정확한 경로 생성. WSL HTTP 실제 DB/Next production build·브라우저는 미검증. 상품 승인/공개는 이미지 안전화 이후 구현.

## 최신 상태 — 2026-09-27 운영자 상품 반려 서비스 실제 DB 검증 대기

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@b9910451de4fabd385977540395a49704205ba1b` (SSH 원격 최신). 승인 대기 목록과 운영자 사유 반려를 우선 구현한다. 반려는 `pending` revision만 행 잠금 아래 `rejected`로 바꾸고 결정자·시각·사유·감사 이력을 남기며 기존 공개 포인터는 건드리지 않는다. 이미지 악성 검사/안전한 공개 저장이 아직 없으므로 승인·공개는 구현하지 않았다.
- DB 시험은 판매자 목록·반려 거부, 빈 사유 거부, 운영자 반려 1회·중복 반려 거부, 공개 0, 별도 요청자/결정자 이력을 요구한다. 서비스 파일 부재 로컬 RED 1회→구현 후 로컬 typecheck·lint 통과. 무DB에서 이 시험은 skip이므로 실제 DB GREEN은 미검증.
- 변경 파일: `apps/api/src/catalog/product-reviews.ts`, `apps/api/test/product-review-db.test.mjs`, 본 현황. 오류 누적: 의도한 서비스 파일 부재 RED 1회. 다음은 SSH push→WSL 실제 DB GREEN·정확한 QA 정리 확인. 관리자 UI/HTTP·안전 이미지 승인 단계와 고객 공개는 아직 미구현.

## 최신 상태 — 2026-09-27 판매자 화면 실제 브라우저 QA·정리

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@af8974389765c50391d283a80fd153e450d76ac0` (SSH 원격/WSL 일치). WSL 테스트용 API·웹 컨테이너와 실행 ID `a1b2c3d4`의 가상 계정 5개로 실제 in-app browser에서 판매자 로그인→상품 화면→대/소분류 선택→`시험 고추`·옵션 500g/23,000원 초안 저장을 확인했다. 저장 직후 대표 사진 선택·업로드·승인 요청 제어가 나타나고, 사진 없는 승인 요청은 오류 안내를 보여주며 DB revision은 `draft`, publication은 0이었다.
- UI 파일 선택 후 실제 업로드/로컬 미리보기, 모바일·200% 확대·키보드 및 관리자 심사·공개는 미검증/미구현. API 서비스/HTTP 업로드 실제 DB 시험과 판매자 제출 서비스는 앞서 통과했으나 이를 브라우저 성공으로 대체하지 않는다.
- 정확한 QA 상품·revision·옵션·대/소분류 ID를 조회한 뒤 옵션 1·revision 1·상품 1·분류 2행만 삭제; `qa-fixture.ts reset`은 해당 run의 계정 5개만 정리. QA 브라우저 탭과 임시 컨테이너 2개 종료. 최종 accounts/sellers/seller_categories/product_categories/products/revisions/options/images/audit 모두 0행, 시험 컨테이너 0, WSL checkout clean. 이번 브라우저/정리 오류 0.
- 변경 파일: 본 현황. 다음은 관리자 승인·반려와 안전한 이미지 공개 경계 및 이후 S2 재고/상품 탐색. 고객 공개 상품·주문/결제/정산·Android 앱은 아직 미구현이므로 전체 구축/인수 준비 완료가 아니다.

## 최신 상태 — 2026-09-27 판매자 제품 화면 WSL production build 통과

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@652266ea8e443f7b263ba9ff7a1550f69eb9697a` (SSH 원격/WSL 일치). WSL Next.js production build에서 8개 정적 경로와 `/account/seller/products` 생성, 컴파일·TypeScript 통과. 직전 WSL API 실제 DB 전체 41건 중 36 pass·0 fail·무DB 전용 5 skip, QA 핵심 행 0.
- 사진 선택/기기 내 미리보기·개발 전용 비공개 업로드·승인 요청의 SSR 3 pass, 루트 typecheck/lint 통과. 실제 브라우저 파일 선택·업로드·상태 새로고침, 모바일·200% 확대·키보드 접근 및 관리자 승인/공개는 아직 미검증/미구현. 개발 전용 업로드 환경변수가 없으면 UI는 실패 안내를 표시한다.
- 변경 파일: 본 현황. 이번 WSL 빌드 오류 0. 다음은 브라우저 QA 및 관리자 심사·승인 안전 경계 구현; 외부 저장소/악성 파일 검사/운영 이미지 공개는 미구현이다.

## 최신 상태 — 2026-09-27 판매자 사진·승인 요청 웹 연결 검증 대기

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@6391b103e33b3a95e32f7a3a236f71161e541707` (SSH 원격/WSL 일치). 제출 서비스 실제 DB 시험 2 pass·0 fail 및 전체 DB 회귀 41건 중 36 pass·0 fail·무DB 전용 5 skip. 최종 accounts/sellers/categories/products/revisions/options/images/publications/audit 전부 0행, 시험 컨테이너 0.
- 판매자 상품 초안 목록에서 대표 사진 선택과 기기 내 미리보기, 개발용 비공개 업로드, 관리자 승인 요청을 구분했다. `pending`은 고객 공개가 아니며 실제 관리자 심사·안전 이미지 공개는 다음 구현 범위. SSR 화면 시험은 의도한 제어 부재 RED 1회→3 pass, 전체 workspace typecheck·lint·diff check 통과.
- 변경 파일: `apps/web/app/account/seller/products/page.tsx`, `apps/web/app/styles.css`, `apps/web/test/seller-products.test.mjs`, 본 현황. WSL production build·실제 브라우저 사진 선택/업로드/제출은 아직 미검증. 다음은 SSH push→WSL exact commit build·브라우저 QA·잔류 정리. 개발용 업로드는 토글/루프백/전용 폴더 설정이 없으면 실패하도록 닫혀 있다.

## 최신 상태 — 2026-09-27 S2.2 판매자 제출 경계 DB GREEN 대기

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@e1e52d9721372b520baca4c171618703e07605c2` (SSH 원격/WSL 일치). 앞선 사진 HTTP 전체 실제 DB 회귀 41건 중 36 pass·0 fail·무DB 전용 5 skip, QA 핵심 행 0 및 시험 컨테이너 0.
- 다음 계약은 소유 판매자만 자기 `draft` revision을 `pending`으로 제출하고, 대표 사진·옵션을 요구하며 감사 이력을 남기고 공개 포인터는 변경하지 않는 것이다. WSL DB에서 `drafts.submit is not a function` RED 1회 및 시험 QA 행 0 확인. `ProductDrafts.submit`과 HTTP POST 제출 경로를 구현했고 로컬 전체 workspace typecheck·lint·무DB 이미지 HTTP 시험 통과; 실제 DB GREEN은 아직 미검증.
- 변경 파일: `apps/api/src/catalog/product-drafts.ts`, `apps/api/src/catalog/controller.ts`, `apps/api/test/product-image-db.test.mjs`, `apps/api/test/product-drafts-db.test.mjs`, 본 현황. 오류 누적: 의도한 제출 기능 부재 RED 1회. 다음은 SSH push→WSL DB 제출 전후·전체 회귀·QA 정리. 관리자 승인, 이미지 안전화/공개 저장, 고객 공개는 미구현이며 `pending`만으로 노출하지 않는다.

## 최신 상태 — 2026-09-27 사진 HTTP DB 시험 정리 오류 수정

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@ceac18495518b671aeab1fb5f21fa57873dd04d1` (SSH 원격/WSL 일치). 실제 DB HTTP 시험 1회는 테스트 `finally`가 판매자 B를 삭제하기 전에 해당 판매자에 매인 인증 세션을 지우지 않아 FK `23503` 실패. 본문 검증은 최종 PASS로 간주하지 않는다.
- 읽기 전용으로 이 시험의 QA 계정 1·판매자 2·분류 1·세션 2·역할 2 및 실제 ID를 확인했다. 그 ID만 단일 트랜잭션에서 세션 2→역할 2→신원 1→계정 1→판매자 2→분류 1 삭제, COMMIT. 고객·운영 데이터는 건드리지 않았다. 시험 `finally` 정리 순서를 세션·역할 우선으로 수정했다.
- 변경 파일: `apps/api/test/product-image-http-db.test.mjs`, 본 현황. 오류 누적: 이 DB 시험 정리 FK 1회, 읽기 전용 SQL 인용 오류 1회(조회만 실패). 다음은 수정 커밋 push→WSL DB 본문 GREEN/잔류 0을 확인; 실패가 가려졌을 수 있어 본문 판정은 보류.

## 최신 상태 — 2026-09-27 개발 전용 사진 HTTP 업로드 실제 DB 검증 대기

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes` (직전 SSH/WSL 공통 체크포인트 `d41f0a8625268312c9b6a4b3943e140f74118432`). 사진 API는 개발용 토글·로컬 바인딩·전용 저장 경로에 한정하며 판매자 세션/Origin 확인 후 5MiB 이하 PNG/JPEG/WebP 원본만 비공개 격리한다. 실제 공급자 스토리지·바이러스 검사·고객 공개는 구현하지 않았다.
- 무DB HTTP 시험은 기본 404/가짜 판매자 헤더 401 통과. 소유 판매자 정상 등록, 잘못된 Origin/MIME, 다른 판매자 거부, 공개 0을 검증할 실제 DB HTTP 시험을 추가했다. 로컬 API typecheck, 루트 94건 중 77 pass·0 fail·DB 전용 17 skip, PR 본문 8 pass, lint 및 diff check 통과. `apps/api`에는 `test` script가 없는데 잘못 호출한 오류 1회는 루트 `pnpm test`로 교정했다.
- 변경 파일: `apps/api/src/catalog/controller.ts`, `apps/api/test/product-image-http*.test.mjs`, 본 현황. 다음은 SSH checkpoint→정확한 WSL 커밋에서 DB HTTP GREEN·전체 회귀·QA 파일/행·컨테이너 정리 확인. 이 단계는 S2.2/전체 구축 완료가 아니다.

## 최신 상태 — 2026-09-27 판매자 초안 사진 격리 저장 DB GREEN 대기

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@1087d9a0cbb142a17b0e9c66848b0b85118feea5` (SSH 원격/WSL 일치). WSL 실제 DB `product-image-db.test.mjs`는 `drafts.addImage is not a function`으로 의도한 RED 1회, 실패 시험 후 accounts/sellers/products/product_images/audit_events 및 컨테이너 0.
- `ProductDrafts.addImage`는 검증된 판매자 scope와 자기 draft revision만 허용하고 revision 행 잠금 아래 10장 상한·비공개 임시 파일·메타데이터/감사 기록을 처리한다. DB 실패 시 rollback과 해당 임시 파일 제거를 시도하고 제거 실패는 함께 드러낸다. 로컬 API typecheck와 격리 저장 unit 2통과; 실제 DB GREEN 및 전체 회귀는 아직 미검증.
- 변경 파일: `apps/api/src/catalog/product-drafts.ts`, 본 현황. 오류 누적: 의도한 메서드 부재 RED 1회. 다음은 SSH checkpoint→WSL DB GREEN·파일/QA 행 정리. 이 로컬 격리 저장은 이미지 내용 디코딩·AV 스캔·S3 전송/공개를 제공하지 않으며 운영 승인/고객 공개에 사용하지 않는다.

## 최신 상태 — 2026-09-27 비공개 이미지 격리 저장 계약 RED 준비

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@8c94393702339791c135c6e130795dbce7fd0933` (SSH 원격, WSL은 앞선 코드 체크포인트라 다음 pull 필요). 비공개 개발용 `ImageQuarantine`는 전용 절대 경로만 허용하고 5MiB 제한·PNG/JPEG/WebP 서명과 선언 MIME 비교·서버 생성 UUID 키·비공개 0600 파일·경로 순회 차단을 적용한다. 이 단계는 바이트를 디코딩/재인코딩하거나 악성 파일을 검사하지 않으므로 고객 공개 또는 운영 이미지 보안 PASS가 아니다.
- 로컬 이미지 보관/불일치·초과·경로 차단 2통과, API typecheck 통과. `ProductDrafts.addImage`의 판매자 소유·draft revision·메타데이터/파일 원자성에 대한 실제 DB 시험을 작성했으나 메서드는 아직 없고 무DB 로컬 시험은 skip. 의도한 파일 부재 RED 1회→저장기 unit GREEN; DB 기능 RED는 WSL exact commit에서 확인할 예정.
- 변경 파일: `apps/api/src/catalog/image-quarantine.ts`, `apps/api/test/image-quarantine.test.mjs`, `apps/api/test/product-image-db.test.mjs`, 본 현황. 다음은 push/WSL DB RED→판매자 범위 이미지 등록 구현→DB GREEN·임시 파일/QA 행 정리. S3 호환 저장·실제 AV/업로드 화면·관리자 미리보기는 후속 미구현.

## 최신 상태 — 2026-09-27 PR 본문 최신 범위 불일치 정정

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@666b7107402cd8f1876a44683f1f8e055f2362fc` (SSH 원격 HEAD; WSL checkout은 직전 코드 `cfeb8ad`로 문서 checkpoint만 아직 pull 전). `.github/PR_REQUEST.md`가 초기 S1.1 상태라 “DB schema 변경 없음/WSL 미검증”이라고 잘못 적혀 있었다. 실제 DB migration 0000~0003, S1 계정·권한, S2 분류/판매자 상품 초안, WSL/브라우저 검증과 미구현 범위를 목적·변경·영향·검증·미검증·롤백 항목에서 바로잡았다.
- 문서 전체 삭제 후 재작성 시도는 파일 보존 위험으로 도구 승인에서 1회 거부됐고 실제 삭제는 발생하지 않았다. 기존 파일을 유지한 문단별 in-place 수정으로 완료; 로컬 `pr-broker-body.mjs` 검증 통과, `git diff --check` 통과. 이 정정은 PR/병합을 시작하지 않으며 `main` 구버전 Broker와 GitHub 계정 사용 금지 경계는 그대로다.
- 변경 파일: `.github/PR_REQUEST.md`, 본 현황. 오류/예외 누적: 문서 삭제 시도 정책 거부 1회, 안전한 대체 방법 완료. 다음은 이미지 저장/검사와 승인 흐름 구현에 필요한 내부 계약 작업; 외부 서비스 계정은 구축 후 일괄 확인.

## 최신 상태 — 2026-09-27 상품 초안 실제 브라우저·회귀·정리

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@cfeb8add58c6c96809a22c57332d1801c3548413` (SSH 원격/WSL 일치). WSL Next production build에 `/account/seller/products` 포함 8개 정적 경로 생성. 전체 API 실제 DB 36개 중 32 pass·0 fail·무DB 전용 4 skip. 회귀 뒤 QA 핵심 행 0.
- 실제 브라우저 QA 실행 `7ab42026`: 운영자 로그인→가상 채소/고추 대·소분류 등록→로그아웃→판매자 A 로그인→고추 상품명·설명·산지·직접 발송·옵션 500g 23,000원/1kg 42,000원 초안 저장→새로고침 뒤 자기 목록에 초안 유지. DB에서 해당 revision 상태 `draft`, 옵션 2건, 공개 0건 확인. 고객/판매자 B 실제 브라우저 화면 접근과 모바일/200%/키보드, 사진·승인/공개는 여전히 미검증.
- 정확한 가상 상품 ID로 옵션 `DELETE 2`, revision·상품·소분류·대분류 각 `DELETE 1`; 시험 API·웹 컨테이너 2개 종료, 실행 ID fixture 5계정 reset. 최종 migration 4건 보존, accounts/sellers/seller_categories/product_categories/products/product_revisions/product_options/product_publications/audit_events 전부 0행, 시험 컨테이너 0, WSL checkout clean. 실제 운영 자료는 변경하지 않았다.
- 변경 파일: 본 현황만. 브라우저·빌드·회귀 이번 묶음 오류 0. 다음은 상품 다중 사진의 검증된 저장/비공개 미리보기, 제안 제출·관리자 승인, 공개 버전 불변과 재고 정책. 외부 스토리지·PG/알림 공급자 계약은 사용자의 구축 후 일괄 준비 원칙에 따라 mock/교체형 경계를 유지한다.

## 최신 상태 — 2026-09-27 판매자 상품 초안 웹 연결 검증 대기

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@61877f682b025fb32e1a2d78b1f42868af5a94c3` (SSH 원격/WSL 일치). WSL 실제 DB 상품 초안 HTTP 시험 1통과·0실패: 고객 등록 거부·Origin 거부·대분류 직접 지정 거부·판매자 A/B 목록 분리·초안 미공개. accounts/sellers/seller_categories/product_categories/products/product_revisions/product_options/audit_events 모두 0행, 시험 컨테이너 0.
- 웹 `/account/seller/products`를 계정 판매자 링크에 연결했다. 판매자는 소분류, 이름·설명·산지, 상품별 단일 발송 방식, 최대 20개 옵션 이름/원화 가격을 입력하며 저장된 자기 초안만 본다. 화면은 사진/승인 전이므로 미공개를 명시. SSR 시험은 파일 부재 RED→2통과; 로컬 전체 89개 중 74 pass·0 fail·DB-only 15 skip, PR 설명 8 pass, 전 workspace typecheck·root lint 통과.
- 변경 파일: `apps/web/app/account/seller/products/page.tsx`, `apps/web/app/account/page.tsx`, `apps/web/app/styles.css`, `apps/web/test/seller-products.test.mjs`, 본 현황. 오류 누적: 의도한 화면 파일 부재 RED 1회. WSL exact commit production build·실제 브라우저 입력과 모바일/확대/키보드는 미검증; 사진 업로드·승인·재고·고객 공개도 미구현. 다음은 push→WSL 빌드/브라우저 QA→안전한 정리.

## 최신 상태 — 2026-09-27 판매자 상품 초안 HTTP 경계 검증 대기

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@8702db31a6ab3465e4e04470dc107ceca7ca21c5` (SSH 원격/WSL 일치). 보정한 판매자 상품 초안 DB 시험 1통과·0실패, accounts/sellers/seller_categories/product_categories/products/product_revisions/audit_events `0|0|0|0|0|0|0` 및 시험 컨테이너 0.
- `GET/POST /catalog/seller/products`는 검증된 세션의 판매자 ID로만 조회/생성하며, 요청 헤더의 역할을 신뢰하지 않는다. POST는 신뢰한 Origin·초안 입력 검증을 요구한다. 무DB HTTP 시험은 경로 404 RED→무세션 401 GREEN 1통과. 실제 DB HTTP 시험은 고객 역할 거부, 판매자 A/B 목록 분리, 대분류 직접 지정 거부, 초안 미공개와 정확한 QA 정리를 검증하도록 작성했으나 아직 실행 전.
- 로컬 전체 87개 중 72 pass·0 fail·DB 전용 15 skip, PR 설명 8 pass, 전 workspace typecheck·root lint 통과. 변경 파일: `apps/api/src/catalog/controller.ts`, `product-drafts.ts`, `apps/api/test/product-http*.test.mjs`, 본 현황. 오류 누적: 의도한 경로 미존재 RED 1회. 다음은 SSH push→WSL DB HTTP·전체 회귀·QA 잔류 확인. 이미지 업로드/승인·화면은 미구현.

## 최신 상태 — 2026-09-27 상품 초안 시험 정리 순서 보정

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@534c7ec18c5e991109cf6fa8b81183b824bc859a` (SSH 원격/WSL 일치). WSL 상품 초안 DB 시험은 검증 중 마지막 QA 정리에서 감사 이력이 판매자를 참조하는 FK `23503`으로 실패했다. 기능 검증 결과를 PASS로 취급하지 않는다. 시험 코드에서 감사 이력 삭제를 판매자 삭제보다 앞으로 옮겼다.
- 잔류를 읽기 전용으로 계정 1·판매자 1·판매자 분류 1·감사 1행으로 식별. 수동 정리 첫 시도는 `account_identities.id`를 account_id로 착각해 `DELETE 0`·FK 거부 후 트랜잭션 롤백. 실제 `account_identities.account_id`와 감사 actor FK를 재조회하고 정확한 6개 종속 행을 단일 트랜잭션에서 각 `DELETE 1`로 정리했다. 최종 accounts/sellers/seller_categories/product_categories/products/audit_events `0|0|0|0|0|0`, 시험 컨테이너 0. 고객·운영 데이터 삭제 없음.
- 오류 횟수: 시험 정리 순서 1회, 수동 정리 ID 오인 1회. 원인별 후속 조치 완료; 동일 근본 원인 3회 연속 아님. 변경 파일: `apps/api/test/product-drafts-db.test.mjs`, 본 현황. 다음은 수정 시험을 정확한 WSL 커밋에서 재실행하여 GREEN/잔류 0을 확인.

## 최신 상태 — 2026-09-27 S2.2 판매자 전용 상품 초안 서비스 DB 검증 대기

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@0209285334fb36acbf81f5752b2b0b3eb8ca18bc` (SSH 원격, WSL은 앞선 `011707c`이므로 다음 pull 필요). `ProductDrafts`에 인증 세션에서 받은 판매자 범위만으로 초안을 만들고 해당 판매자의 초안만 조회하는 DB 트랜잭션을 추가했다. 소분류만 지정, 상품별 출고 방식 단일값, 제목·산지·옵션/가격 검증, 감사 이력; 초안은 `product_publications`를 건드리지 않는다.
- DB 시험은 고객 생성 거부, 대분류 직접 연결 거부, 옵션 없음/음수 가격 거부, 소속 판매자 A만 조회, B 조회 0, 미공개, 감사 기록 및 정확한 QA 행 정리를 요구한다. 서비스 파일 부재 로컬 RED 1회 확인 후 구현, API typecheck 통과. 실제 WSL DB 시험은 아직 미실행, 무DB 로컬 시험은 skip이므로 GREEN 아님. `pnpm lint`를 API 서브패키지에서 호출한 오류 1회는 스크립트가 루트에만 정의된 명령 위치 문제이며 루트 lint를 다음에 실행한다.
- 변경 파일: `apps/api/src/catalog/product-drafts.ts`, `apps/api/test/product-drafts-db.test.mjs`, 본 현황. 다음은 SSH push/WSL pull→DB GREEN·루트 lint·전체 회귀. 이미지 업로드, 초안 제출/승인, 판매자 화면·고객 공개는 여전히 미구현.

## 최신 상태 — 2026-09-27 S2.2 상품 DB GREEN·회귀

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@011707c8689d1c41303d300224c65d2188355417` (SSH 원격/WSL 일치). WSL 지정 `shoppingmall`에 0003 migration 적용 성공, 상품 revision DB 시험 1통과·0실패. 전체 API 실제 DB 33개 중 30 pass·0 fail·무DB 전용 3 skip. 최종 migration 이력 4건, accounts/sellers/product_categories/seller_categories/products/product_revisions/product_publications/audit_events 모두 0행, 시험 컨테이너 0, WSL checkout clean.
- 검증 범위: revision/옵션/이미지 메타데이터와 미공개 분리, 다른 상품 revision을 가리키는 공개 포인터의 DB 차단, 음수 가격·빈 제목 차단. 이미지 실제 업로드·악성 파일/형식 검사, 판매자 제안·관리자 승인·공개 조회 API/화면 및 고객 구매 가능 여부는 미구현·미검증. migration 성공만으로 S2.2 또는 전체 구축 완료를 선언하지 않는다.
- 이번 변경 파일: 본 현황만. 오류 누적: 의도한 42P01 RED 1회, 0003 인덱스 순서 오류 1회(수정 후 적용·GREEN). 다음은 소유 판매자 범위를 확인하는 상품 제안 서비스/HTTP, 승인 전 공개 불변 시험. 외부 이미지 저장소 연결은 구축 후 일괄 준비 원칙을 유지한다.

## 최신 상태 — 2026-09-27 S2.2 migration 생성 순서 오류 수정

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@b64a2ad12977fae463b4eea427dc6dc98cbe754b` (SSH 원격/WSL 일치). 적용 전 DB QA 핵심 행 0. Drizzle ORM migrator가 0003 복합 FK를 참조 고유 인덱스보다 먼저 실행해 PostgreSQL `42830`으로 실패했다. 읽기 전용 확인: 적용 migration 이력은 3건 그대로이고 `public.products`/`product_revisions` 모두 없음. 따라서 실패가 DB에 부분 지속 변경을 남기지 않았다.
- 미적용 `apps/api/migrations/0003_s2_product_revisions.sql`에서 해당 고유 인덱스 생성만 복합 FK 앞쪽으로 옮겼다. schema/snapshot 의미 변경 없음. 오류 누적: 의도한 42P01 RED 1회, migration 순서 오류 1회. 다음은 같은 0003 재적용→실제 DB 상품 시험 GREEN→전체 회귀 및 QA 잔류 확인. 통과 전 상품 schema 완료로 표시하지 않는다.

## 최신 상태 — 2026-09-27 S2.2 상품 revision migration 검증 대기

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@f41292169e2a42dd0215a1643e965a241441cb3d` (SSH 원격/WSL 일치). 실제 WSL DB 신규 시험 1 fail·0 pass: `42P01 relation "products" does not exist`, 의도한 migration 전 RED. 생성·정리한 가상 계정/분류/판매자 잔류 확인은 migration 이후 전체 점검에서 수행한다.
- Drizzle migration `0003_s2_product_revisions`를 생성하고, 공개 포인터가 다른 상품의 revision을 가리키지 못하도록 `(product_id, revision_id)` 복합 FK와 해당 unique index를 schema·시험에 보강했다. 기존 0000~0002는 변경하지 않는다. 로컬 API typecheck 통과. 이 migration은 아직 WSL DB 미적용/시험 GREEN 전이다.
- 변경 파일: `apps/api/src/db/schema.ts`, `apps/api/test/product-schema-db.test.mjs`, `apps/api/migrations/0003_s2_product_revisions.sql`, snapshot/journal, 본 현황. 오류 누적: 의도한 42P01 RED 1회. 추가 생성물 재생성은 미적용 0003만 대상으로 했고 지속 DB에는 영향 없음. 다음은 migration checkpoint→WSL 적용·GREEN/복합 FK·QA 잔류 점검.

## 최신 상태 — 2026-09-27 S2.2 상품 revision DB 계약 RED 준비

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`. 상품 소유 판매자·소분류와 제안 revision을 분리하고 옵션·이미지 메타데이터 및 명시적 공개 포인터를 추가하는 schema 초안. 고객 공개 자료는 제안과 별도 `product_publications`를 통해서만 선택하도록 설계한다. 배송 방식은 상품별 `seller_direct` 또는 `owool_fulfillment` 단일 값, 산지 문자열에는 지역 제한 없음.
- `apps/api/test/product-schema-db.test.mjs`는 가상 판매자/분류/상품/옵션/이미지 생성과 미공개 상태, 음수 가격·빈 제목 DB 거부, 정확한 ID 정리를 검증하도록 작성. 로컬 typecheck 통과, 무DB 환경 skip이므로 실제 RED/GREEN 아님. WSL 정확한 커밋 DB에서 migration 전 RED를 확인한 후 migration 생성·적용 예정. 이미지 파일 업로드/형식 검사, 제안·승인 서비스/API·실제 고객 공개는 아직 없으며 S2.2 완료가 아니다.
- 변경 파일: `apps/api/src/db/schema.ts`, `apps/api/test/product-schema-db.test.mjs`, 본 현황. 현시점 오류 0; 다음 조치: 안전한 checkpoint→WSL RED→migration→WSL GREEN·QA 잔류 0.

## 최신 상태 — 2026-09-27 S2.1 실제 브라우저 등록·QA 정리

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@f445c504abe092ce04f54127e38c0afd861d977c` (SSH 원격/WSL 일치). WSL 루프백 임시 API·Next production 서버, 가상 실행 `f7a92026`의 5계정으로 실제 브라우저 운영자 로그인→관리자 링크→대분류·소분류·판매자 분류·판매자 등록→새로고침 뒤 4개 자료 재표시 확인. 이 범위는 브라우저 PASS이며 고객/판매자 역할의 화면 접근, 모바일/200%/키보드, 상품 등록은 미검증.
- 시험 직후 브라우저 전용 분류·판매자 각 정확한 이름 4행을 트랜잭션에서 `DELETE 1`씩 제거하고 실행 ID fixture reset에서 5계정 제거. 임시 컨테이너는 정리 호출 시 이미 없어 실제 수동 중지 대상이 없었다. 최종 DB accounts/sellers/product_categories/seller_categories/audit_events `0|0|0|0|0`, `shoppingmall-s2-*` 컨테이너 0, WSL checkout clean. 이 기록은 개발·시험 QA 자료 정리이며 지속 schema/migration 3건은 보존.
- 변경 파일: 본 현황만. 오류/예외: 최초 컨테이너 기동 직후 health `000`은 기동 지연으로 분리되어 재확인 `200/200`; 정리 시 컨테이너 2개는 이미 종료돼 `No such container` 응답, 잔류 확인 0. 기능 결함으로 계산하지 않는다. 다음은 S2.2 상품 제안·공개 버전/옵션/이미지 계약과 DB·권한 시험.

## 최신 상태 — 2026-09-27 S2.1 웹 production 빌드 확인

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@38e7d0fdd34bd368d50e8ae8c34f30ffce833cf2`. SSH 원격과 WSL checkout의 SHA 일치. WSL `node:24-bookworm-slim`에서 `NEXT_PUBLIC_API_ORIGIN=http://127.0.0.1:9092`로 Next production build 통과: `/`, `/login`, `/account`, `/account/customer`, `/account/admin/catalog` 정적 경로 생성. 앞선 실제 DB HTTP 시험 1통과 후 QA 행/시험 컨테이너 0.
- S2.1 API/화면의 테스트·빌드 범위와 실제 브라우저 입력/모바일·200% 확대·키보드 검증은 구분한다. 관리자 화면 실사용·개별 역할 차단 브라우저 검증은 아직 미검증. S1 Stage PR/병합과 S2.2 이후 상품·이미지·재고·승인·고객 검색/홈은 남아 있으며 전체 구축 완료가 아니다. 이번 기록 변경만 추가; 오류 0. 다음은 S2.1 브라우저 등록 및 S2.2 상품 계약/DB 시험.

## 최신 상태 — 2026-09-27 S2.1 관리자 분류 화면 연결

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`. 앞선 `29550ef4d8f014e4a37b5a7379b317e00ab81e4f`는 SSH 원격/WSL 일치. WSL 실제 DB 분류 HTTP 1통과·0실패: 관리자/고객 권한, Origin, 대·소분류/판매자 등록과 공개 조회, 감사 이력. 시험 후 accounts/sellers/product_categories/seller_categories 0행, 시험 컨테이너 0, checkout clean.
- 웹 `/account/admin/catalog`에서 운영자 세션 확인 후 대·소분류와 판매자 분류·판매자 등록을 분리하여 조회/입력하고 계정 화면에서 링크한다. 브라우저 실행 전 SSR 시험은 파일 부재 RED→2통과, 로컬 전체 테스트 83개 중 71 pass·12 DB-only skip·0 fail, PR 본문 시험 8 pass, 전 workspace typecheck·lint 통과.
- 변경 파일: `apps/web/app/account/admin/catalog/page.tsx`, `apps/web/app/account/page.tsx`, `apps/web/app/styles.css`, `apps/web/test/admin-catalog.test.mjs`, 본 현황. 오류 누적: 의도한 파일 부재 RED 1회; 확인된 제품 결함 0. 남은 검증: WSL exact commit production build와 실제 브라우저 등록·모바일/확대/키보드. S2 상품 자체 등록·사진·재고·승인·검색은 아직 미구현이며 Stage 완료가 아니다.

## 최신 상태 — 2026-09-27 S2.1 분류 HTTP 계약 검증 대기

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`. 관리자 대·소분류와 판매자 분류·판매자 등록을 실제 세션의 admin 역할로 제한하고, 고객 공개 분류/판매자 조회를 연결했다. 헤더의 가짜 역할은 인정하지 않는다. 하위 분류의 3단계 생성, 빈 이름, 다른 Origin, 중복 이름을 거부하며 등록 감사 이력을 남긴다.
- 로컬 무DB HTTP 시험 RED(없는 경로 404)→GREEN(조회 503·무세션 401) 1통과, API typecheck 및 lint 통과. 실제 WSL DB의 HTTP 경계 시험은 아직 실행 전. 정적 분류 DB 시험은 이전 커밋에서 통과했지만 화면 등록·상품 등록/검색·운영 배포는 미구현/미검증. S2 Stage 완료로 표시하지 않는다.
- 이번 변경 파일: `apps/api/src/catalog/controller.ts`, `taxonomy.ts`, `app.module.ts`, `apps/api/test/catalog-http*.test.mjs`, 본 현황. 의도한 RED 1회 외 오류 0. 다음 조치: SSH 별칭으로 체크포인트 push→WSL fast-forward pull→DB HTTP 검증과 QA 행/컨테이너 정리→관리자 분류 화면.

## 최신 상태 — 2026-09-27 S1 개발 mock 회귀·S2 분류 API 준비

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@e79564549f5814c287b91c8aac6c1b60038700c0` (SSH 원격/WSL 일치). WSL 실제 `shoppingmall` DB API 전체 30개 중 28 pass·0 fail·2 무DB 전용 skip, 약 57초. 전화 mock 가입·로그인/번호 연결·role 전환, 고객 프로필·탈퇴 요청, QA fixture·분류 서비스가 동일 커밋에서 통과. 시험 뒤 accounts/account_identities/auth_sessions/audit_events/customer_addresses/sellers 각 0행, `shoppingmall-s1-*` 컨테이너 0, WSL checkout clean. migration 이력 3건과 표는 보존.
- S1 범위 경계: 휴대폰 mock은 루프백 개발 전용이고 실문자/공급자 검증이 아니다. 고객 역할 브라우저·배송지/수신 동의 확인은 통과했으나 탈퇴 확인창 최종 클릭, 휴대폰 mock UI, 모바일/확대/키보드 전체와 운영 배포는 미검증. 로컬/WSL production build는 앞선 체크포인트에서 통과. S1 Stage PR/병합/merged-main smoke는 없다. S1 완료 선언 없이 기존에 먼저 적용된 S2.1 분류 코드를 HTTP/화면과 연결하는 독립 작업을 이어간다.
- 오류 누적: 개발 mock 공개 인터페이스 노출 RED 1회 수정·전체 재검증 통과. QA 행·컨테이너 잔류 없음. 기존 로컬 EPERM은 worktree 쓰기 권한 경계로 분리됐고 허용된 동일 빌드 통과.

## 최신 상태 — 2026-09-27 휴대폰 mock 가입·로그인 DB/노출 경계

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@664adcc464cc29a99b94587f9ab073dfe4f173c0` (SSH 원격/WSL 일치). WSL 실제 DB의 `mock-phone-entry-http-db.test.mjs`에서 개발 전용 코드 발급→가입 목적과 로그인 목적 혼용 차단→신규 고객 세션→같은 번호 재로그인 동일 accountId→중복 가입 409→정확한 전화 identity 계정 정리 1통과·0실패. 실제 SMS/실번호 소유 증명은 아니다.
- 추가 보안 RED→GREEN: `ENABLE_MOCK_OTP=1`인 개발 모드가 `API_HOST=0.0.0.0` 등 공용 인터페이스로 바인딩될 때 `/auth/mock-phone/start`가 201로 열린 문제를 시험으로 재현했다. `requireMockOtp`는 비운영 모드·명시 토글뿐 아니라 `API_HOST`의 루프백 값(기본 `127.0.0.1`, `::1`, `localhost`)도 요구하도록 수정했다. 로컬 해당 HTTP 4통과 및 타입검사 통과. 단, 공용 역프록시가 루프백 API를 외부에 다시 공개하면 이 설정만으로 완전한 방어가 아니므로 배포 설정에서 토글을 금지한다.
- 이번 보강은 아직 커밋/WSL 전체 회귀 전. S1 고객 전화 가입 UI 및 실제 공급자 연동, 모바일·확대·키보드/전체 Stage gate는 남아 있다. 시험 오류 1회는 의도한 공개 바인딩 RED이며 수정·국소 GREEN.

## 최신 상태 — 2026-09-27 휴대폰 전용 개발 mock HTTP 검증 준비

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`. 개발 전용 `/auth/mock-phone/start`, `/auth/mock-phone/confirm`에서 가입/로그인 목적과 정규화된 전화번호를 challenge에 묶고 확인 결과가 일치할 때만 `AuthRepository`의 신규 고객 생성 또는 기존 고객 로그인으로 전달한다. 시험 코드는 개발 응답에 `mockOnly:true`로 표시; 운영 모드·토글 미설정에서는 404. 인증 전 목적 바꿔 확인하는 요청은 거부한다.
- 무DB HTTP 시험은 endpoint 없음 RED(404)→GREEN(201), 운영 모드 mock 차단 등 3 pass·0 fail; API typecheck 통과. `apps/api/test/mock-phone-entry-http-db.test.mjs`는 WSL 실제 DB로 신규 가입→같은 계정 재로그인→중복 가입 409→정확한 phone identity accountId cleanup을 검증할 예정이며 아직 실행 전. 실 SMS 수신/실전화번호 인증/외부 계정 가입은 범위 밖이다.
- 현재 기존 브랜치 SSH 원격/WSL은 `1e8a742328dc8fe0ab1ce93f4fc43a418ada4770` 일치. 해당 커밋에서 전화번호 신규 고객 DB 시험 2통과·0실패. 이번 HTTP 변경은 커밋 전.

## 최신 상태 — 2026-09-27 S1 휴대폰 전용 mock 계정 DB 경계

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`. `AuthRepository.createPhoneCustomerAfterVerification`와 `loginPhoneAfterVerification`를 추가했다. 인증 완료한 번호를 새 고객 계정의 전화 신원으로 저장하거나 기존 전화 신원 고객에게 세션을 발급하며, 기존 번호의 중복 신규 가입/다른 계정 자동 병합은 차단한다. 신규 가입·로그인 감사 이력을 남긴다. 메서드 부재 시험 RED→GREEN, 로컬 API typecheck 통과.
- `apps/api/test/phone-entry-db.test.mjs`의 실제 DB 생성→세션 확인→동일 번호 로그인→중복 가입 거부→정확한 accountId cleanup은 WSL 실행 전. 이 메서드는 **검증 완료 후에만 호출해야 하는 내부 경계**이며 외부 문자 송신/실번호 검증을 제공하지 않는다. 개발용 HTTP mock 계약·화면 연결은 후속. 실제 고객/운영 DB는 변경하지 않았다.

## 최신 상태 — 2026-09-27 로컬 빌드 EPERM 원인 분리

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`. 동일 `pnpm -r --if-present build`를 일반 샌드박스에서 실행하면 기존 API `dist/*.js` 쓰기 `EPERM`으로 실패했다. 작업 worktree에 대한 쓰기 허용으로 **같은 명령**을 다시 실행하자 API tsc 및 Next `/`, `/login`, `/account`, `/account/customer` production build 모두 통과. 따라서 앞선 로컬 `.next/trace-build`/`dist` EPERM은 코드 오류로 판정하지 않고 이 세션 파일시스템 권한 경계로 분리한다. WSL 빌드도 별도 통과. 산출물만 생성했고 추적 파일 변경 없음.
- 남은 미검증은 실제 PG/문자·메일·앱/Oracle/인수, 고객 탈퇴 확인창의 브라우저 최종 접수, 모바일·확대·키보드, S1 휴대폰 전용 가입/로그인과 이후 S2~S8 기능이다. 테스트/빌드 통과를 전체 제품 완료로 표시하지 않는다.

## 최신 상태 — 2026-09-27 고객 설정 브라우저 검증 및 정리

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@7694d45b0f85ebe116ef7122c358f98acb007e23` (로컬/SSH 원격/WSL 일치). WSL 시험 API 주소를 명시한 Next production build `/account/customer` 포함 통과. QA 실행 `c5d7e9f1`의 가상 고객으로 실제 브라우저 로그인→고객 설정 화면 진입→가상 배송지 저장 확인→연락처 끝 4자리만 목록 표시→이메일 수신 동의 저장→새로고침 후 배송지·동의 유지 확인.
- 탈퇴 요청 버튼의 확인 대화상자까지 열렸지만 시험 브라우저의 대화상자 조작이 응답하지 않아 **브라우저 최종 접수는 미검증**. DB 사전 조회 `account_deletion_requests=0`, 즉 이 브라우저 시도는 접수되지 않았다. API/DB 직접 통합시험의 탈퇴 요청 접수·중복 409는 별도로 통과한 범위다. 브라우저 시험 탭은 대화상자 때문에 명시적 닫기 실패; 에이전트 생성 임시 탭의 턴 종료 정리에 맡기고 기존 사용자 탭은 건드리지 않는다.
- 직접 띄운 `shoppingmall-s1-api`·`shoppingmall-s1-web`만 종료하고 정확한 `QA_RUN_ID=c5d7e9f1`로 fixture reset(`accounts=5`)했다. 사후 accounts/account_identities/customer_addresses/notification_preferences/account_deletion_requests/sellers 각 0행, `shoppingmall-s1-*` 컨테이너 0, WSL checkout clean. DB migration/스키마 보존. 고객 주소·동의 다른 역할 IDOR 및 웹 모바일·200% 확대·키보드는 추가 검증 필요.
- 오류 횟수: 브라우저 JS confirm 상호작용 1회 실패·재시도 1회 실패, 탭 닫기 1회 실패; 서버/DB 기능 오류로 판정하지 않음. 추가 근거 없이 UI 탈퇴 PASS로 표시하지 않는다. 다음: S1 남은 시험과 Stage gate, 다른 제품 기능 진행.

## 최신 상태 — 2026-09-27 S1 고객 배송지·동의·탈퇴 요청 웹 연결

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`. `apps/web/app/account/customer/page.tsx`에서 고객 세션 확인 후 배송지 목록/입력, 이메일·문자·푸시 마케팅 수신 동의, 계정 탈퇴 **요청 접수**를 기존 고객 API에 연결했다. 고객 이외 역할은 내용을 불러오지 않는다. 연락처는 화면 목록에서 끝 4자리만 노출하고 마케팅 수신은 기본 false로 시작한다. 실제 계정 삭제/법정 보존은 아직 구현되지 않는다.
- 웹 화면 시험 RED(파일 없음)→GREEN, 로컬 `pnpm test` 74개 중 65 pass·0 fail·9 DB 연결 전용 skip, PR 본문 검증 8 pass, 전체 typecheck/lint 통과. 이 결과는 DB/브라우저 최종 시험 대체가 아니다. WSL 정확한 커밋 production build, 고객 입력·동의·탈퇴 요청 실제 브라우저 검증 및 일회성 QA cleanup은 다음 조치.
- 현재 변경: `apps/web/app/account/customer/page.tsx`, `apps/web/app/account/page.tsx`, `apps/web/app/styles.css`, `apps/web/test/customer-profile.test.mjs`, `WORK_STATUS.md`. DB schema 추가 없음, 외부 서비스 연동 없음.

## 최신 상태 — 2026-09-27 S1 역할별 브라우저 로그인·정리

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@efdc3c1f9f2edef6b9af60c944b4b8f0e3dd4350` (로컬/SSH 원격/지정 WSL checkout 일치). WSL `node:24-bookworm-slim` 일회성 빌드에서 Next `/`, `/login`, `/account` production build 통과. 시험 브라우저 호출을 위해 `NEXT_PUBLIC_API_ORIGIN=http://127.0.0.1:9092`로 별도 빌드했으며 이는 운영 배포 설정이 아니다.
- 실제 HTTP: WSL 127.0.0.1:9092 `/health` 200, `/ready` 200, 웹 9091 `/login`·`/account` 200; Windows 127.0.0.1:9091 로그인 페이지 200. 실제 브라우저에서 QA 고객·판매자 A·운영자 각각 로그인→`/account`에 `구매자`·`판매자`·`운영자` 표시 확인, 각 계정 로그아웃 후 다음 계정 사용. 판매자 A 이메일로 운영자 역할 로그인을 시도하면 화면에서 권한 오류를 표시하고 `/login`에 머무름. 시험 계정/비밀번호는 가상 자료만 사용했다. 모바일·200% 확대·키보드 전 과정은 아직 미검증.
- 정리: 브라우저 시험 탭 닫음, 직접 띄운 `shoppingmall-s1-api`·`shoppingmall-s1-web` 두 컨테이너만 종료. 정확한 `QA_RUN_ID=b4c6d8e0` fixture reset으로 5계정 정리. 사후 `accounts/account_identities/auth_sessions/audit_events/sellers/seller_categories` 각각 0행, `shoppingmall-s1-*` 컨테이너 0, WSL checkout clean. DB 자체/기존 migration은 보존.
- 오류: QA 실행 ID별 사전 잔류 조회 SQL의 shell quoting 오류 1회(읽기 실패, 자료 변경 없음); 전체 행 수 5/5/3/1 확인 후 reset했고 사후 0행 재검증. 로컬 Windows Next build `EPERM`은 여전히 미해결. 고객 배송지·동의·탈퇴 실제 화면, 역할별 업무 화면 및 나머지 Stage/인수는 미완료. 다음: S1 사용자 화면·권한 없는 상태, 회귀/환경 gate를 마무리하고 S2 설계 순서대로 진행.

## 최신 상태 — 2026-09-27 S1 역할 로그인 웹 진입 화면

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`; `d355d1fa6375280879ffc464088a5e1f9536f84e` WSL 실제 DB에서 판매자 단일 소속 자동 선택/다중 소속 명시 선택/타 판매자 거부 1통과·0실패. QA fixture reset 완료.
- `apps/web/app/login/page.tsx`에 구매자·판매자·운영자 역할 선택, 이메일/비밀번호, API 응답별 오류와 서버 미설정 상태를 추가했다. 로그인 후 `/account`에서 실제 `/auth/me` 세션을 읽어 역할을 표시하고 로그아웃한다. 홈에 로그인 링크 추가. `apps/web/test/login.test.mjs`, `account.test.mjs` 각 RED(파일 없음)→GREEN, 웹 타입검사 통과. 시각 스타일은 기존 황금/크림 Flat 기조의 단순 계정 폼이며 판매자/운영자 업무 화면을 완료했다고 주장하지 않는다.
- API 주소는 비운영 로컬 기본 `127.0.0.1:9092`, 운영 빌드에서는 `NEXT_PUBLIC_API_ORIGIN` 없으면 폼을 비활성화한다. 실제 브라우저 로그인·모바일·200% 확대·키보드, WSL/운영 빌드의 API 주소/쿠키 경계는 아직 시험 전. 다중 판매자 계정의 편의 선택 UI도 후속 필요. 단계 전체 완료 아님.

## 최신 상태 — 2026-09-27 S1 역할별 로그인 범위 시험

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`. `45fb2d582e0dfad2eb58f29922bc1f60fd55e0d0`에서 WSL 실제 DB의 `seller-login-db.test.mjs`가 예상대로 RED: 판매자 1곳만 소속된 QA 계정도 판매자 ID를 따로 보내지 않으면 `Invalid credentials`로 실패했다. 시험 fixture는 정확한 실행 ID reset으로 정리됨.
- `AuthRepository`에서 해당 계정의 판매자 권한이 **정확히 하나**일 때만 로그인/역할 전환의 판매자 범위를 자동 선택하고, 두 곳 이상이면 명시적 sellerId를 요구하도록 변경했다. 다른 판매자의 ID를 지정하는 요청은 기존 DB grant 검사로 차단한다. 시험에 2곳 권한의 모호한 경우 거부와 명시 선택 성공을 추가. 로컬 API typecheck·루트 lint 통과; WSL DB GREEN/전체 회귀 전이다.
- 직전 `3967ced9019533a8e10705b051fc121556d4e0b8` WSL DB API 전체 24개 중 22 pass·0 fail·2 무DB 전용 skip, 시험 행/컨테이너 잔류 0. 브라우저 역할별 경로·웹 빌드는 이 변경에 대해 아직 시험하지 않았다.

## 최신 상태 — 2026-09-27 S1.2 mock 휴대폰 연결 검증

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`; 현재 원격/WSL `6e0b76b8bbd6b11adca8a7ff0d4cb90c69a2c7e0`. WSL 실제 DB/HTTP에서 고객 로그인→개발용 코드 발급→틀린 코드 차단→전화번호 신원 연결→코드 재사용 차단 시험 1통과·0실패. 실 SMS와 휴대폰 단독 가입/로그인은 미검증/미구현.
- 추가 안전 회귀: 운영 환경에서 `ENABLE_MOCK_OTP=1`이어도 mock API 404 시험 통과. 같은 계정의 새 challenge가 이전 것을 무효화하도록 `MockPhoneOtp`를 보강했고, 만료 항목 제거 및 메모리 최대 1024건 상한을 적용했다. 이 시험 RED(이전 코드 수용)→GREEN. 로컬 해당 시험 3통과 및 타입검사 통과. 변경 커밋/WSL 전체 재시험 전.
- 오류 횟수: 이 보강 시험 1회 RED는 의도한 결함 재현이며 수정·국소 재시험 통과. 외부 자격증명/실문자 사용 없음. Stage S1의 역할별 실제 브라우저 동선·앱·고객 탈퇴 운영 절차·전체 게이트는 아직 미완료.

## 최신 상태 — 2026-09-27 S1.2 개발 전용 휴대폰 연결 HTTP 준비

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`. `AuthController`의 `/auth/mock-phone/start-link`, `/auth/mock-phone/confirm-link`는 `ENABLE_MOCK_OTP=1`이면서 비운영 환경일 때만 동작한다. 고객의 검증된 세션·Origin을 요구하고, 1회용 코드의 확인 결과로 기존 계정에 전화 신원을 명시 연결한다. 반환되는 `testCode`는 **개발 mock**이며 실문자 송신이 아니다. 무설정 404 및 설정 뒤 무인증 401 시험 RED(404)→GREEN, mock 코드/만료 시험과 API 타입검사 통과.
- `apps/api/test/mock-phone-http-db.test.mjs`에 개발 모드의 로그인→mock challenge→틀린 코드 차단→연결→재사용 차단→DB 소유자 검증을 추가했으나 WSL DB 실행 전. 실문자/휴대폰 단독 가입·로그인/브라우저 시험은 미완료. mock이 운영에 노출되지 않는지 배포 설정 검사도 후속 필수다.
- 직전 `d8a471ef45255047d68eea8f277cc2d46ed4b518`의 WSL 전화 신원 자동 병합 차단·감사 DB 시험 2통과·0실패. 원격/WSL checkout 동일; 시험 QA 계정은 finally에서 지정 ID로 정리했다. 현재 HTTP 변경은 커밋 전.

## 최신 상태 — 2026-09-27 S1.2 전화번호 명시적 연결 DB 검증 준비

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`. `AuthRepository.linkPhoneIdentity`를 별도 행위로 추가했다. 고객 역할·동일 accountId의 OTP 확인 결과만 수용하고, 기존 전화 신원이 있으면 자동 계정 병합 없이 거부하며 검증 시각·PII 없는 감사 행위를 같은 트랜잭션에 저장한다. `apps/api/test/phone-link-db.test.mjs`는 method 부재 RED→GREEN; 고객 A 확인 결과를 B가 재사용하는 것, B가 같은 번호를 연결하는 것, 계정 간 병합 방지, 신원/감사를 DB로 시험하도록 추가했다. WSL DB 실행 전.
- 로컬 API 타입검사 통과. `apps/api`에는 `lint` 스크립트가 없어 그 디렉터리의 `pnpm lint`는 명령 없음으로 실패했으며 코드 검사 결과가 아니다. 루트 `pnpm lint` 재실행 필요. 실문자 수신, 전화 가입/로그인 및 HTTP UI 연동은 아직 구현되지 않았고 이 결과를 S1 완료로 표시하지 않는다.

## 최신 상태 — 2026-09-27 S1.2 휴대폰 OTP mock 검증기 착수

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`. `apps/api/src/auth/mock-phone-otp.ts`에 실문자 미발송 OTP mock 검증기를 추가했다. 인증 코드는 주입된 시험 전달자에게만 넘기며 5분 만료·최대 5회 시도·1회 사용·계정 ID 바인딩, 코드 해시 비교를 적용한다. 시험은 RED(모듈 없음)→GREEN 1통과, API 타입검사 통과.
- 범위 경계: 검증기는 **아직 DB 휴대폰 신원 연결/로그인 API나 화면에 연결되지 않았다.** 따라서 전화번호 가입·실문자 수신·계정 연결 전체 PASS 아님. 생산 환경에 mock 인증을 노출하지 않는다. 다음은 검증 증명과 명시적 계정 연결을 DB/HTTP에서 안전하게 이어 검증할 것.
- 직전 체크포인트: `ab38a1ba9dafacba0abf86c435e9351dcd27702e` 로컬/SSH 원격/WSL 일치, 모두 clean. 현재 OTP 파일/시험/현황은 커밋 전. 외부 서비스 가입·연동은 미실행.

## 최신 상태 — 2026-09-27 S1 고객 API·시험자료 재검증

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes@a03343163b5aa33ec791c974ffd41ff303abdb9a` (로컬/SSH 원격/지정 WSL checkout 일치). `docs/QA_DATA_POLICY.md`에 가상 자료 사용, 실행 ID별 정리, 실패 시 보존·기록, 실제 탈퇴 요청과 fixture reset의 구분을 기록했다.
- WSL 실제 DB 연결 전체 API 재시험: 18개 중 16 pass, 0 fail, 2 skip(무DB 전용). 로컬 무DB 해당 시험 3 pass. QA fixture 단독 WSL 2 pass. 시험 후 DB accounts/sellers/seller_categories/customer_addresses/account_deletion_requests/notification_preferences 순서로 각 0행, `shoppingmall-s1-*` 일회성 컨테이너 0, 지정 WSL checkout clean 확인. 신규 3개 migration/테이블은 보존.
- 빌드: `052a358` 시점 WSL 분리 checkout의 Next production build 통과. 현재 HEAD의 로컬 typecheck/lint 통과; Windows 로컬 build `.next/trace-build` EPERM 원인 미확정, 따라서 로컬 build gate는 미충족. S1의 OTP mock·명시적 계정 연결·고객/판매자/관리자 실제 브라우저 동선 등은 여전히 미완료. 외부 서비스 실제 연동, Oracle staging, UAT는 미실행.
- 오류 누적: S1 고객 API 중복 탈퇴 매핑 1회 수정·재시험 통과, DB/무DB 혼합 시험 조건 1회 수정·재시험 통과, QA 잔류 조회 shell quoting 1회 읽기 실패 후 다른 조회로 확인. 미해결 `EPERM` 1건. 다음: S1 인증 잔여, 역할별 HTTP/웹 동선 및 현황 기록 후 Stage gate 판단.

## 최신 상태 — 2026-09-27 S1 QA 계정 fixture 착수

- 담당/브랜치: 어울 단일 writer, `codex/flat-v2-prototypes`. `apps/api/scripts/qa-fixture.ts`는 8자리 hex `QA_RUN_ID`별로 고객·판매자 A/B·어울몰 판매자·관리자 5개 **서로 다른 가상 계정**을 생성하고 동일 ID의 데이터만 정리하도록 작성. `shoppingmall` DB명 검사, 명시적 `QA_FIXTURE_PASSWORD` 필요, 한 트랜잭션 seed/reset, 비밀번호 미출력. 역할별 세션·브라우저 검증에 사용할 준비 자료이며 실제 계정 아님.
- `apps/api/test/qa-fixture.test.mjs`에서 위험한 실행 ID 거부 RED(모듈 없음)→GREEN, 타입검사 통과. WSL DB 생성/초기화 통합시험 결과는 바로 아래 최신 기록을 따른다. 실패한 시험의 정확한 ID가 있으면 먼저 소유·참조 관계를 확인하고 그 ID만 정리하며 공유 DB 전체 초기화는 하지 않는다.
- WSL 실제 DB 시험: 정확한 `a0ed84895677e7b4b28dafdfcac2c83aac2342e6`에서 QA 5계정 seed→역할/판매자 분리 조회→동일 실행 ID reset 2통과·0실패. 이어 전체 API를 DB 연결 상태로 실행해 16통과·2실패를 발견: 두 실패는 “DB 미설정이면 503” 시험을 DB 연결 환경에서도 실행한 fixture 조건 오류. 해당 시험에 DB 연결 시 skip 조건을 추가하고 무DB 로컬 재시험 3통과. DB 연결 전체 재시험 전이다. 시험 실패는 제품 전체 gate 미통과로 기록한다.
- 직전 고객 API 결함: `052a3582d7d21f8e113faa2c051f77a77935183f`를 원격/WSL에 반영했고 탈퇴 중복 409 포함 HTTP DB 시험 1통과·0실패. WSL 독립 웹 production build 통과. 로컬 Windows `.next/trace-build` EPERM은 미해결로 분리 기록하며 빌드 전체 PASS로 바꾸지 않는다. WSL 고객 DB fixture 계정/배송지 0행 여부 최종 재조회 필요.

## 최신 상태 — 2026-09-27 S1.3 시험 DB 검증 및 고객 API 연결

- 담당/브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`; 새 branch/worktree 없음. `71b607540f54b03793aa9c88115fdc225d1f494d`를 SSH alias 원격에 push하고 WSL 지정 checkout에 fast-forward했다.
- DB/검증: `WSL-server`의 `local-postgres`/`shoppingmall`에서 `0002_s1_customer_privacy.sql`을 BEGIN/ROLLBACK 사전 검증 후 공식 ORM migrator로 적용. migration 이력 3건. 가상 고객 A/B의 배송지 IDOR, 수신 동의, 탈퇴 요청, 감사 DB 통합시험 1통과·0실패·0skip. 시험 후 accounts/addresses/deletion_requests/preferences 각 0행, 일회성 `shoppingmall-s1-profile` 컨테이너 잔류 0, WSL checkout clean. 기존 DB 이력/신규 테이블은 보존.
- 후속 구현: `apps/api/src/customer/controller.ts`에서 검증된 세션의 고객만 배송지·동의·탈퇴 요청 API에 접근하도록 연결하고 쓰기 요청 Origin을 검사했다. 무DB HTTP 접근 차단 시험 RED(404)→GREEN(401/403), 타입검사 통과. DB를 사용하는 HTTP 통합시험을 추가했으나 WSL 실행 전이며, 실제 브라우저 UI·QA seed/reset·보존규칙·OTP mock 등 S1 잔여는 미완료다.
- 로컬 재검증: `pnpm test` 57 pass/5 DB skip 및 PR 본문 검증 8 pass, typecheck/lint 통과. `pnpm -r build`는 `apps/web/.next/trace-build` 쓰기 `EPERM`으로 실패했다. 기존 `.next` 산출물과 다수 공용 Node 프로세스를 발견하여 무분별한 삭제/종료 없이 WSL의 분리된 checkout 빌드로 확인할 예정이다. 로컬 전체 빌드 PASS 아님.
- WSL HTTP DB 시험 첫 실행: 탈퇴 중복 요청 시 Drizzle가 원본 PostgreSQL `23505`를 `cause`로 감싸는데 controller가 겉 Error 메시지만 확인해 HTTP 500이 됐다(1회, 1 fail). SQL unique 제약 자체는 동작했고 시험 finally의 정확한 accountId 정리 후 재검증 예정. `cause.code`와 constraint를 확인해 409로 매핑하도록 수정했다. 성공 재시험 전.
- 오류 횟수: 이 단계 고객 API 중복 탈퇴 오류 1회(수정·재시험 통과), DB/무DB 혼합 시험 fixture 오류 1회(수정 후 전체 재시험 전). 최초 QA 잔류 조회 명령의 shell quoting 오류 1회는 자료 변경 없이 단순 전체 건수 조회로 재검증했다.

## 최신 상태 — 2026-09-27 Stage 순서 대조 및 S1.3 복귀

- S1.3 데이터 계약 착수: `apps/api/src/db/schema.ts`에 고객 배송지(계정 소속·기본 배송지 1개), 채널별 마케팅 동의 기본 false, 탈퇴 요청 상태/중복 방지 테이블을 추가하고 `0002_s1_customer_privacy.sql` migration을 Drizzle에서 생성·check 통과. `apps/api/src/customer/profile.ts`는 자기 계정만 배송지를 읽고 추가하며, 마케팅 동의를 명시 저장하고 탈퇴를 **요청 상태로만** 기록한다. 원문 배송지/전화는 감사 details에 저장하지 않으며 연락처 마스킹 도우미를 갖췄다. 실계정 삭제/보존기간 확정은 구현하지 않았다. `apps/api/test/customer-profile-db.test.mjs` RED 후 로컬 DB 미설정으로 SKIP, TypeScript 통과; WSL DB 검증 전이다.
- S1.3 DB 변경 사전 기록: 정확한 대상은 `WSL-server`의 `local-postgres` 내 `shoppingmall` 한 DB. 현재 세 번째 migration은 미적용. 승인된 계획 범위의 S1.3 테이블만 추가하고 기존 테이블·자료를 삭제하지 않는다. 기존 QA 계정/판매자/분류는 0행으로 확인했다. 커밋→SSH push→지정 WSL checkout pull→BEGIN/ROLLBACK SQL 시험→공식 ORM migrator 적용→이력/테이블·고객 A/B IDOR/감사 통합시험 순서. 일회성 `shoppingmall-s1-profile` 컨테이너는 명령 동안만 사용·`--rm`, QA 계정/배송지는 unique `qa+UUID@example.invalid`로 만들고 정확한 accountId로 정리한다. 실패 시 다른 DB/테이블을 초기화하지 않고 현재 상태를 기록한다.
- 실제 Git: 기존 단일 writer `codex/flat-v2-prototypes@caa18ac8b1dbc7b02fea67498bd95372e8dd1992`; 원격 `main@207e7961c12f87f88a229d443a70ed764db2c24a`. 별도 기존 `codex/end-to-end-work-plan@74a814d`와 root main worktree는 보존. 현재 S2.1 분류 migration/서비스를 커밋·push했고 WSL DB migration 이력 2건과 시험 1통과를 확인했으나 `main` 병합·merged-main smoke는 없다.
- 계획 대비 판정: S1.1 기반·S1.2 계정/역할 일부는 구현/시험했으나 S1.3 고객 배송지·알림 동의·탈퇴 요청 안내·QA seed/reset/보존, 휴대폰 OTP mock·명시적 계정 연결, 역할별 브라우저/API 최종 검증, CI 실제 실행 및 S1 Stage PR/병합/merged-main smoke는 **미완료/UNVERIFIED**. 그런데 S2.1에 먼저 착수해 순서가 계획과 어긋났다. S1이나 S2 완료를 선언하지 않는다.
- 대안: (1) 기존 브랜치·DB 이력을 보존한 채 S1.3과 S1 잔여를 우선 구현·검증하고 이후 S2를 계속한다. 단일 브랜치의 첫 PR에 선행 S2.1 변경이 함께 들어가므로 Stage별 PR 경계를 설명·검토해야 한다. (2) S2 변경을 되돌리거나 별도 분리한다. 이미 적용된 지속 DB 이력 및 사용자 기존 브랜치 보존 원칙에 비춰 위험이 크다. (3) 새 branch/worktree로 재구성한다. 신산님의 선행 브랜치 정리 전 새 branch 금지 지시와 충돌한다. **권장/진행:** (1), 새 branch·파괴적 rollback 없이 S1.3으로 돌아가고 범위/검증을 PR에 명시한다.
- 이번 작업 오류 횟수: Stage 순서 판단 1회. 수정: 계획과 실제 Git·WSL/DB 증거를 대조하고 현황에 미완료를 기록했다. S2.1 자료를 삭제·재포장하지 않으며 S1.3의 독립 구현을 계속한다.

## 최신 상태 — 2026-09-27 S2.1 분류·판매자 등록 착수

- WSL 실제 DB 결과: 정확한 `caa18ac8b1dbc7b02fea67498bd95372e8dd1992`에서 `0001_s2_categories.sql`을 BEGIN/ROLLBACK으로 오류 없이 검증한 뒤 공식 ORM migrator로 `shoppingmall` DB에 적용했다. `drizzle.__drizzle_migrations` 2건, 분류 테이블 2개 확인. 관리자 전용 2단계 분류·판매자 분류/판매자 등록·3단계 거부·중복 거부 및 감사 기록의 DB 통합 1통과·0실패. QA 상품/판매자 분류·판매자·이메일 행 모두 잔류 0, 일회성 컨테이너 잔류 0, WSL checkout clean. DB migration 이력/테이블은 지속 보존. HTTP/API·웹 관리 화면은 아직 미검증.
- 담당·브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`. 신산님 승인 계획에 따라 S1 인증 작업과 연계된 S2.1의 관리자 대분류→소분류·판매자 분류→판매자 모델을 착수했다. `shoppingmall` DB 기존 `sellers`·`accounts` 각각 0행을 읽기 전용 확인했으며 기존 다른 DB는 건드리지 않는다.
- 변경: `apps/api/src/db/schema.ts`에 상품/판매자 분류와 판매자 분류 FK, root/child 중복명 제약을 추가했고 Drizzle `0001_s2_categories.sql`을 생성·check 통과했다. `apps/api/src/catalog/taxonomy.ts`에는 관리자 역할 검사, 대분류·소분류 2단계 제한, 판매자 분류/판매자 등록 및 같은 트랜잭션 감사 기록을 구현 중이다. `apps/api/src/access.ts`의 관리자 action을 추가했고 권한 시험은 RED→GREEN, `apps/api/test/taxonomy-db.test.mjs`는 WSL DB에서 검증할 계약이다.
- 사전 DB 변경 기록: 정확한 대상 `WSL-server`의 `local-postgres` 안 `shoppingmall` DB. 현재 두 번째 migration은 미적용. source/SQL을 기존 SSH 브랜치에 안전하게 push하고 WSL에서 BEGIN/ROLLBACK 문법 시험 후 공식 ORM migrator로 이력을 남겨 적용한다. 일회성 QA 컨테이너 `shoppingmall-s2-taxonomy`는 적용·시험 동안만 사용하고 `--rm` 정리; 시험 행은 식별 가능한 `qa+UUID@example.invalid` 계정과 고유 이름 분류/판매자를 대상으로만 정리한다. 실제 운영 분류·판매자 자료 없음.
- 미검증·다음: 로컬 전체 회귀, SQL WSL dry-run, 실제 migration/DB·HTTP 분류 통합, 상품·옵션·재고, 역할별 UI 전부 미검증. 오류 횟수: 이번 S2.1 코드/DB 0회.

## 최신 상태 — 2026-09-27 S1.2 권한 경계 착수

- 감사 이력 GREEN: WSL 정확한 `359a8f505cd85e617461db3fba0f0702a5ec6128`에서 계정 저장소 및 HTTP+DB 통합 2통과·0실패. `auth.login`/`auth.switch_role`/`auth.logout`은 역할과 계정 근거를 남기고 세션 변경과 같은 트랜잭션으로 처리한다. 시험 QA 이메일 잔류 0, 일회성 `shoppingmall-s1-audit-green` 컨테이너 잔류 0, 지정 checkout clean을 확인했다. 정식 고객·판매자 화면, OTP와 실제 외부 계정·배포는 미검증이다.
- 인증 감사 이력 TDD: `apps/api/test/auth-db.test.mjs`에 로그인·역할 전환·로그아웃 역할별 사건 검사를 추가해 WSL DB에서 `auth.login` 누락 RED(1실패)를 실제 확인했다. `apps/api/src/auth/repository.ts`의 세션 생성·전환·해지를 각 감사 기록과 같은 트랜잭션으로 묶었다. 시험 계정과 종속 자료는 실패 후에도 `finally`에서 해당 accountId만 정리했다. 로컬 타입검사와 비DB 시험 통과, WSL 재검증은 다음 checkpoint에서 수행한다.
- HTTP 연결 진행: `apps/api/src/auth/controller.ts`를 추가해 `/auth/login`, `/auth/me`, `/auth/switch-role`, `/auth/logout`을 DB가 있는 경우에만 동작하도록 연결했다. 세션 토큰은 HttpOnly/SameSite=Lax 쿠키에만 전달하고 서버는 DB의 실제 grant를 재확인한다. 상태 변경 요청은 설정된 웹 Origin만 허용하고 운영 모드에서는 WEB_ORIGIN 미설정 시 닫힌다. `apps/api/test/auth-http.test.mjs`는 헤더 역할 가장 거부와 DB 미설정 503을 확인했다. 첫 구현은 DB 미설정 예외를 잘못 401로 바꾼 1회가 있어 예외 구분을 수정한 뒤 통과. `apps/api/test/auth-http-db.test.mjs`는 WSL 실제 HTTP+DB 경로 시험용으로 추가했으며 아직 실행 전이다. 로그인 시도 제한·이메일 검증·휴대폰 OTP·소셜 공급자·웹 화면은 미구현.
- WSL 계정 DB 통합 결과: 정확한 checkout `6fdff9b256ae4b27149cfabf47cedc29236e0b0a`에서 시험용 `qa+UUID@example.invalid` 계정으로 중복 이메일 거부, 잘못된 암호 거부, 고객 세션 조회, 미부여 판매자/관리자 역할 거부, DB에 관리자 역할을 명시 부여한 뒤 관리자 전환·기존 세션 해지·로그아웃을 통합 검사해 1통과·0실패했다. 시험 계정·종속 세션/역할/식별자는 해당 UUID로 정리했고 QA 이메일 잔류 0을 DB 조회로 확인했다. 일회성 `shoppingmall-s1-auth-test` 컨테이너 제거, 정확한 `.pnpm-store` 캐시 48MB 제거(재설치 가능), WSL Git checkout clean. 실제 HTTP 로그인·고객 웹 사용 경로는 아직 미검증이다.
- 계정/세션 저장소 진행: `apps/api/src/auth/credentials.ts`는 scrypt+랜덤 salt로 비밀번호를 해시하고 세션 원문 대신 SHA-256 해시를 저장하도록 설계했다. `apps/api/src/auth/repository.ts`는 이메일 정규화/중복 거부, 검증된 DB 역할의 세션 발급·만료/해지 확인·역할 전환을 구현 중이다. `apps/api/test/credentials.test.mjs`는 2개 RED→GREEN, Node crypto `promisify` overload 타입 오류 1회는 명시적 Promise 래퍼로 수정 후 타입검사 통과. `apps/api/test/auth-db.test.mjs`는 로컬 DB URL 미설정으로 SKIP이며 실제 WSL DB 시험 전이다. 이는 아직 HTTP 로그인/가입 노출이나 완료 판정이 아니다.
- WSL DB 적용 결과: 정확한 checkout `af78fe45126464ccbf87ca430cb009b05edd346e`에서 `apps/api/scripts/migrate.ts`의 Drizzle ORM 공식 migrator가 성공했다. `shoppingmall` DB `public`에 계정 관련 6테이블, `drizzle.__drizzle_migrations`에 1건을 읽기 전용 재확인했다. 동일 커밋 API를 WSL에서 빌드·일회성 실행해 `/ready` HTTP 200 `{"status":"ok","dependency":"database"}`을 확인했다. 시험용 API·migration 컨테이너는 종료/자동 제거, 9092 LISTEN 잔류 0. DB schema와 이력은 **지속 데이터**로 유지하며 임의 삭제하지 않는다. 계정·세션·권한 HTTP 경로는 아직 미구현이고 DB ready 200이 이를 증명하지 않는다.
- migration 진단 결론: psql 직접 연결과 ORM migrator는 통과했으나 Drizzle Kit CLI가 오류 상세 없이 exit 1을 반환한 원인은 확정되지 않았다. 공식 ORM migrator 스크립트를 재현 가능한 적용 경로로 채택하고 CLI 문제는 별도 미해결로 기록한다. WSL API smoke에는 기존 PostgreSQL의 `postgres` 자격을 일회성 환경변수로만 전달했으며 비밀값을 문서·Git에 저장하지 않았다. 제품용 최소권한 DB 역할은 아직 준비되지 않았다.
- WSL migration 진단: 정확한 commit `f037ebb`의 frozen 의존성 설치는 기존 store 경로(`/work/.pnpm-store/v11`) 재사용으로 성공. 다른 `/tmp/pnpm-store`를 지정한 첫 시도는 pnpm이 기존 modules 교체를 비대화형으로 거부(1회)하여 기존 메타데이터의 storeDir 확인 뒤 바로잡았다. 동일 PG 환경을 받은 독립 psql 컨테이너의 `SELECT 1`은 통과. `drizzle-kit migrate`는 일반/CI 출력 모두 spinner 뒤 종료 코드 1이고 오류 상세를 출력하지 않아 성공으로 보지 않는다(동일 원인 2회). DB `public`·`drizzle` 사용자 테이블/이력 0개, 시험 컨테이너 잔류 0 확인. Drizzle ORM 공식 migrator에 명시적인 오류 코드 출력을 더해 원인을 좁히되 비밀값은 출력하지 않는다.
- DB 변경 사전 기록: 대상은 `WSL-server`의 정확한 `local-postgres` 컨테이너 안 `shoppingmall` DB 한 개이며 현재 사용자 테이블 0개. 목적은 승인된 S1.2 계정·역할·세션·감사 migration과 이력 테이블 생성. 이전 커밋 `179e94f`의 SQL을 `BEGIN/ROLLBACK` 시험하여 오류 0, 시험 후 `accounts` 테이블 0개를 확인했다. 적용은 별도 일회성 `shoppingmall-s1-migrate` 컨테이너(소유 어울, 해당 migration 실행 동안만, `--rm` 정리)를 통해 실행하고 적용 테이블·이력을 확인한다. 실패하면 임의로 다른 DB를 초기화하지 않고 오류와 현재 상태를 기록한다. 기존 PostgreSQL 컨테이너·타 DB·운영 자료는 그대로 둔다.
- DB 준비 경로 추가: 앱 `/ready`는 DB 연결과 `accounts` schema가 모두 확인된 경우에만 200, 미설정·오류·schema 부재는 503. 신규 테스트 RED 후 구현했고 Nest 테스트 환경에서 생성자 metadata 자동 주입이 없어 500이 된 1회는 `@Inject(DatabaseService)` 명시로 복구했다. `apps/api/src/db/readiness.ts`, `service.ts`, `health.controller.ts`, `app.module.ts`, `test/database-readiness.test.mjs` 변경. 현재 실제 DB 연결 200은 미검증.
- 계정 DB 계약 추가: `apps/api/src/db/schema.ts`에 계정, 식별자(이메일/전화/카카오/Apple), 판매자, 계정별 활성 역할, 토큰 해시 세션, 행위 감사 테이블을 선언했다. 역할/판매자 소속 불일치와 빈 식별자를 DB 제약으로 막고 `apps/api/migrations/0000_s1_accounts.sql`을 Drizzle Kit에서 생성했다. `pg`·Drizzle 정확 버전 및 lockfile이 변경됐다. 기존 `shoppingmall` DB의 사용자 테이블은 0개임을 적용 전 읽기 전용 확인했다. 아직 migration을 적용하거나 계정을 생성하지 않았다.
- 스키마 검증: API `tsc --noEmit`, Drizzle Kit `check` 통과. 최초 생성물을 제약 추가 전 제거하면서 빈 기존 `drizzle/meta` 폴더의 journal 누락으로 재생성 실패 1회; 신규 표준 `migrations/` 경로로 생성하여 통과했다. 생성 SQL의 PostgreSQL 실제 실행/rollback·API 연동은 아직 미검증.
- 신산님은 상세 개발 작업계획 전체를 이미 승인했으며, 내부 Stage의 인증·권한·DB를 다시 승인받지 말고 구축 완료까지 중단 없이 진행하라고 재확인했다. 앞선 별도 승인 재요구는 담당자의 해석 오류로 정정한다. 외부 PG 시험상점/Oracle 접속 상세는 후속 실연동·인수 준비 항목으로 기록하고 독립 개발을 계속한다.
- 담당·브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes`. S1.2의 첫 부분으로 `apps/api/src/access.ts`의 서버용 역할·판매자/고객 소속 검사와 `apps/api/test/access.test.mjs`를 추가했다. 고객 IDOR, 판매자 A/B 자료 분리, 판매자 권한의 관리자 승인·환불·정산 금지, 같은 계정의 역할별 행위 분리를 검사한다.
- TDD·검증: 테스트 대상 모듈 부재 RED 후 신규 3개 테스트 GREEN, 전체 API 타입검사 포함 `pnpm typecheck` 통과. 이는 검증된 세션을 입력받아야 하는 순수 권한 검사이며 로그인·세션·PostgreSQL 연결·HTTP 경로에 아직 연결되지 않았다. S1.2 전체 완료나 실제 IDOR 방어 통합 PASS로 표시하지 않는다.
- 오류 횟수: 승인 경계 해석 오류 1회(사용자 정정 후 재요구 철회), 제품 검사 오류 0회. 다음은 테스트 계정/세션·지속 저장 및 API 경로에 동일 권한 계약을 연결하고 DB/API/웹 통합 검증이다.

## 최신 상태 — 2026-09-27 실제 고객 홈 구조 착수

- WSL exact SHA 검증: `ca90fd512183d31526d7f997238105cfe064c765`을 지정 checkout에서 `git pull --ff-only`로 반영하고 clean 상태를 확인했다. 일회성 컨테이너의 새 홈 테스트 2통과, Next production build 통과, 빌드 웹 `/` HTTP 200과 `상품 카테고리`·`추천 상품`·`상품 준비 중` 본문을 확인했다. 시험 컨테이너 종료·자동 제거 후 9091 LISTEN 잔류가 없다. 브라우저 시각/상호작용 증거 및 정식 DB 통합은 아니다.
- WSL 오류·조치: 컨테이너에 없는 `node_modules/.bin/pnpm`을 호출해 테스트 뒤 빌드 명령만 실패한 1회. 같은 checkout의 실제 Next 실행 파일로 빌드를 재실행해 통과했다. 실패/성공 컨테이너 모두 `--rm`으로 제거했다.
- 담당·브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes` worktree. 정적 Flat v2 시안 QA는 제품 착수 게이트로 사용하지 않고, 제품 Next.js 고객 홈에 승인된 다섯 영역(검색·메뉴·기획전·상품 카테고리·공통 추천)의 **데이터 연결 전 뼈대**를 구현했다.
- 변경 전/후: `apps/web/app/page.tsx`는 단일 구축 중 문구였고, 변경 후 의미 있는 헤더·섹션과 준비 중 표시가 있다. `apps/web/app/styles.css`는 기존 황금·크림·서체/최대 1180px을 유지하면서 균형형 Flat 카드·반응형 배열을 적용했다. 검색·메뉴·카테고리·추천은 아직 데이터/동작이 없으며 구매 가능한 상품으로 오인되지 않게 명시했다. `apps/web/test/page.test.mjs`에 다섯 영역 및 허위 결제 노출 금지 검사를 추가했다.
- TDD·검증: 추가 테스트가 `/상품 검색/` 누락으로 실제 RED(1실패) 후 GREEN(2통과). 전체 로컬 `pnpm test` 49+8=57통과·0실패, typecheck, ESLint lint, Nest/Next build 모두 통과했다. 제품 화면의 실제 브라우저·모바일·200% 확대·키보드·인쇄는 `UNVERIFIED`; 정적 HTML 시안 검사 통과로 대체하지 않는다.
- 오류·조치: 존재하지 않는 웹 test 스크립트를 filter로 호출해 검증이 실행되지 않은 1회는 root의 실제 `node --import tsx --test`로 재실행했다. CSS patch의 이전 내용 불일치/동일 파일 중복 패치 거절 각 1회 후 정확한 현 파일 기준으로 적용했다. 데이터·Secret·DB 변경 없음.
- 다음: 안전한 commit/push 후 지정 WSL checkout에서 exact SHA를 pull해 실제 웹 build/smoke를 확인한다. S1.2 인증·권한·DB 계약과 상품 데이터는 별도 승인 경계 및 후속 기능으로 남긴다.

## 최신 상태 — 2026-09-27 S1.1 WSL 재현·실행 확인

- 담당·기준: 어울 단일 writer, `codex/flat-v2-prototypes@eb74e536cb3464cd9032256bd56619302355fcb8`. 지정 SSH 별칭으로 `/home/daon/deploy/shopping`을 정확한 Git branch에서 clone했고 해당 HEAD를 원격과 대조했다. 기존 `local-postgres`의 `shoppingmall` DB는 읽기 전용으로만 확인했으며 schema·계정·Secret은 변경하지 않았다.
- WSL 자체 개발 검증: 기존 `node:24-bookworm-slim` 이미지의 일회성 `shoppingmall-s1-verify`에서 frozen install, `pnpm test` 48+8=56통과·0실패, typecheck, ESLint lint, Nest/Next build 모두 통과했다. 이는 정식 DB·E2E나 GitHub CI 실행 증거가 아니다.
- WSL 런타임 smoke: 동일 commit 빌드의 API `/health` HTTP 200 및 `{"status":"ok","service":"shoppingmall-api"}`, 고객 웹 `/` HTTP 200 및 `서비스 구축 중` 본문을 확인했다. 별도 일회성 `shoppingmall-s1-api`, `shoppingmall-s1-web` 컨테이너는 종료·`--rm` 제거했으며 9091 포트 LISTEN 잔류가 없다. API의 DB 준비 상태는 별개로 503이며 DB 통합 준비 완료를 뜻하지 않는다.
- 정리: 검증 컨테이너가 checkout에 남긴 정확한 `.pnpm-store` 캐시(약 697MB)를 경로·소유자·사용 중 여부 확인 후 제거했다. 패키지 lock/source와 무시 대상 `node_modules`는 보존했다. 캐시는 재설치로 복구 가능하다. 다른 프로젝트의 컨테이너와 DB는 건드리지 않았다.
- 변경 파일: 이번 기록은 `WORK_STATUS.md`, `docs/DEVELOPMENT_ENVIRONMENT.md`. 이전 제품 골격 commit과 테스트 결과는 아래 S1.1 항목에 보존한다. 오류 횟수: WSL 접속 제한 샌드박스 1회(허용된 SSH 별칭 실행에서 성공), 제품 오류 0회.
- 미검증·다음: GitHub CI 실제 실행, DB schema/권한/계정, 브라우저 역할별 경로, Android 앱/아이콘, 실제 Provider·Oracle 인수는 `UNVERIFIED`. S1.2의 인증·권한·DB 계약은 별도 승인 경계로 분리하고 영향받지 않는 작업을 계속한다. Flat v2 **로컬 정적 시안** QA는 신산님 지시로 제품 구축의 차단 조건에서 제외한다.

## 최신 상태 — 2026-09-27 S1.1 최소 실행 골격 작업 중

- WSL 시험 자원 사전 기록: `/home/daon/deploy/shopping` 정식 checkout을 지정 SSH alias에서 Git clone하여 `eb74e536cb3464cd9032256bd56619302355fcb8`과 원격 SHA 일치를 확인했다. WSL 시스템 Node는 18.19.1이고 pnpm이 없어 기존 `node:24-bookworm-slim` 이미지를 사용한 일회성 `shoppingmall-s1-verify` 컨테이너에서 checkout을 마운트해 설치·검사를 실행할 예정이다. 소유자 어울, 수명 이번 S1.1 검증 명령 동안, 종료 시 `--rm`으로 컨테이너 제거하고 정확한 이름의 잔류를 확인한다. 정식 DB·다른 컨테이너·시스템 Node는 변경하지 않는다.
- 담당·브랜치: 어울 단일 writer, 기존 `codex/flat-v2-prototypes` 격리 worktree. 원격 `main@207e7961c12f87f88a229d443a70ed764db2c24a`를 정상 merge하고 상세 계획 로컬 브랜치 `74a814d`를 이 브랜치에 정상 merge했다. 계획 브랜치와 기본 `main`의 사용자 자료는 삭제·수정하지 않았다. 신산님 최신 지시에 따라 Flat v2 로컬 정적 시안 QA 자체는 제품 착수의 차단조건이 아니며 실제 제품 QA는 후속 Stage로 남긴다.
- S1.1 변경: pnpm 모노레포 골격, Next.js 고객 웹 진입 화면, NestJS `/health` HTTP와 DB 연결 전 `/ready`의 503 응답, Expo 앱의 빌드 전 최소 진입점, 공유 계약 타입, 무비밀값 `.env.example`, Git 무시 규칙, 실제 ESLint 및 test/typecheck/build 스크립트, 읽기 권한만 가진 `.github/workflows/ci.yml`. 새 코드와 설정은 `apps/`, `packages/`, 루트 package/lock/config와 CI에 한정된다. 계정·상품·결제·DB schema·Secret·실연동은 아직 구현하지 않았다.
- TDD: health payload 시험은 누락/미구현 RED 뒤 GREEN, Nest HTTP `/health` 시험은 미구현 RED 뒤 GREEN, 웹 진입 화면 시험은 빈 화면 RED 뒤 GREEN을 확인했다. 환경 오류: pnpm이 `esbuild` 설치 스크립트를 거부해 해당 패키지만 승인 후 재설치(1회); 루트 TSX decorator 설정 누락으로 Nest 시험 실패 후 root tsconfig 보정(1회); 웹 ESM/JSX 테스트 설정 오류 2회 보정 후 실제 본문 누락 RED 확인; 일반 샌드박스의 pnpm 임시파일·tsbuildinfo 쓰기 거부는 허용된 실행 또는 비증분 타입검사로 검증했다.
- 로컬 검증: `/ready` 미등록 404 RED→DB 연결 전 503·본문 GREEN. 최종 `pnpm test` 48+8=56통과·0실패, `pnpm typecheck` 전 패키지 통과, `pnpm lint` ESLint 10 검사 통과, `pnpm build` Nest API·Next 웹 통과. 빌드 API `/health`와 Next 웹 `/` HTTP 200·응답 본문 확인, 종료 뒤 9091/9092 LISTEN 잔류 0. Android 앱 빌드/에뮬레이터는 아이콘 시안 승인 전이라 미실행. 깨끗한 checkout 재설치, WSL 동일 commit·DB/API/웹, CI 실제 실행, 실제 제품 브라우저 흐름은 `UNVERIFIED`.
- 환경: 로컬·WSL 9091/9092 현재 무점유 확인, `SINSAN`의 `/home/daon/deploy/shopping` 부재와 정확한 `local-postgres`의 `shoppingmall` DB 읽기 전용 확인. 새로운 WSL checkout/DB 사용자·schema는 생성하지 않았다. npm 패키지 설치 외 외부 서비스 가입·비용 없음. 실제 Secret 값은 파일·로그에 기록하지 않았다.
- 다음 조치: S1.1 최소 골격의 clean-checkout 재현·CI/실패 health 상태·환경 gate 잔여를 확인하고 안전한 commit/push로 exact SHA를 보존한다. 별도 승인 대상인 인증/권한·DB schema·Secret은 선행 계약 승인 전 구현·변경하지 않는다. 첫 PR Broker 경쟁 조건과 실제 제품 화면 QA는 각각 독립 미검증으로 남긴다.

## 최신 상태 — 2026-09-27 전체 구축 재지시와 정적 시안 QA 우선순위 변경

- 신산님은 `D:\tmp\shoppingmall2-end-to-end-work-plan\docs\WORK_PLAN.md` 전체 구축을 재지시하고 외부 서비스 가입·실연동을 구축 후 일괄 처리하기로 했다. 이어서 Flat v2 로컬 시안은 실제 제품이 아닌 참고 시안이므로 그 자체의 브라우저 QA를 무시하고 제품 구축을 진행하도록 직접 지시했다. 따라서 시안 QA를 제품 코드 착수의 선행 차단조건으로 두지 않는다. 실제 제품 브라우저·접근성·인쇄 QA는 해당 Stage에서 별도로 수행한다. 이 판정은 시안 QA를 PASS로 바꾸지 않는다.
- 작업 중 원격 `main`이 `207e7961c12f87f88a229d443a70ed764db2c24a`로 전진했으며 PR #2에서 기존 Flat v2 commit `11fdcbe`까지 병합했다. 현재 이 브랜치의 후속 PR Broker 보완 commit `5211ad3`은 main에 포함되지 않았다. 계획 branch `codex/end-to-end-work-plan@74a814d`는 로컬 worktree에 보존되어 있지만 원격의 실제 branch 목록에는 없다. 로컬 root `main`은 이전 상태이고 사용자 소유 미추적 `.github/`를 보존한다.
- 진행 원칙: 새 branch/worktree 없이 기존 격리 브랜치에서 최신 main과 승인된 상세 계획의 정확한 차이를 대조하고 S0의 독립 환경·계약 확인을 계속한다. 서비스 가입·비용·실연동·Oracle 배포·지속 DB 변경은 현재 수행하지 않는다.

## 최신 상태 — 2026-09-27 Flat v2 S0 화면 QA 재시도와 첫 PR 경로 검토

- 담당·브랜치: 어울 단일 writer / `codex/flat-v2-prototypes` HEAD `5211ad3af8a0d4dadb0c95cc7e24aa8ad53e62e8`. 신산님 지시에 따라 첫 PR 위험 때문에 독립 가능한 QA를 멈추지 않고 재개했다. 새 branch·worktree나 외부 자원을 만들지 않았다.
- 실제 브라우저 시도: 사용자에게 열려 있는 IAB의 `file:///D:/Project/shoppingmall2/.worktrees/flat-v2-prototypes/docs/design/assets/home-flat-v2.html` 탭에 접근했으나 Browser Use가 `file:` URL protocol을 거부했다. 응답은 `http:`·`https:`만 허용하며 대체 브라우저 표면·localhost·간접 명령으로 같은 결과를 얻는 우회를 금지한다. 거부 1회 후 우회·반복 시도하지 않았다.
- 허용된 정적 대조: 홈·고객·판매자·관리자 v2 모두 viewport meta와 기존 CSS/역할 스크립트 연결을 갖는다. `shared.css`에는 600px 이하 역할 화면 규칙, 버튼·입력 포커스 윤곽선, 관리자 정산 보고서 A4 인쇄 규칙이 있고 v2 CSS에도 포커스 윤곽선이 있다. 이는 규칙의 존재 확인이지 실제 적용·접근성·PDF 결과 증거가 아니다. 기존 시안 44개와 PR 설명 8개의 Node 검사, 총 52개 통과·0실패를 새로 실행했다.
- 실제 화면 QA 판정: 홈·고객·판매자·관리자 각각의 1920×1080 / 1440×900 / 430×844 렌더링, 200% 확대, 키보드 순서·focus, 관리자 인쇄/PDF는 전부 `UNVERIFIED`. 신산님의 시각 기준 채택은 유지하지만 이 세부 실행 증거와 동일시하지 않는다. 계획 S0 화면 검증 체크항목은 미완료로 둔다.
- 첫 PR 경로: (1) 현재 main 요청 태그 자동화는 SSH alias만으로 트리거할 수 있으나 구버전 Broker에 검증 HEAD 고정이 없어 경쟁 조건 Critical을 남기므로 권장하지 않는다. (2) 계정/API 사용을 별도 허용받아 사람이 PR 생성·정확한 SHA 대조 후 병합하면 위험을 통제할 수 있으나 신산님의 현행 GitHub 계정 사용 금지와 충돌한다. (3) `main`의 Broker를 먼저 고치면 그 수정 자체가 안전한 첫 PR 경로를 필요로 하므로 순환 문제이며 `main` 직접 push는 금지다. 어느 경로도 현행 권한·필수 gate를 모두 만족하지 않아 요청 태그를 보내지 않았다.
- 다음 조치: 신산님의 QA 증거 제공 또는 허용된 브라우저 경로, 그리고 첫 PR 예외 경로에 대한 명시적 결정을 받기 전에는 PR 병합하지 않는다. 영향받지 않는 기존 작업계획·환경 사실 확인은 계속할 수 있다. 외부 서비스 실제 가입·연동·Oracle 배포는 현재 범위에 포함하지 않는다.

## 최신 상태 — 2026-09-27 PR Broker 본문 보강 구현 검증 중

- 담당·브랜치: 어울 단일 writer / `codex/flat-v2-prototypes`, 시작 HEAD `11fdcbe83f8102e639bcd44779409ad78381b142`. 신산님이 첫 PR 한정으로 필수 설명을 추적 문서에 담고 Broker 수정본을 같은 PR에 포함하는 방식을 직접 승인했다. 원격 `main`의 구버전 Broker가 첫 PR에 실행된다는 한계는 숨기지 않는다.
- 변경: `.github/PR_REQUEST.md`에 이번 PR의 목적·변경 요약·영향·검증·미검증·롤백을 기록. `.github/pr-broker-body.mjs`와 Node 검사는 필수 여섯 항목의 누락·공백·중복·임시 문구·숨긴 주석·코드 블록 우회를 차단한다. `.github/workflows/auto-pr-merge.yml`은 다음 PR부터 신뢰된 `main` revision의 검사기를 사용해 정확한 branch HEAD의 설명 파일을 검증하고 신규·재사용 PR의 본문에 적용한다. 병합에는 `--match-head-commit`을 사용한다. 원격에 bootstrap branch가 없음을 확인한 후 완료된 bootstrap 자동 병합 경로를 제거했다. 계정 로그인·PAT·GitHub CLI 인증 설정을 바꾸지 않았다.
- TDD·검증: 검사기 부재 RED 1건, 누락/공백/중복/임시 문구 RED 4건, 숨긴 HTML 주석·코드 블록·목록형 임시 문구 RED 3건 확인 후 GREEN. 기존 시안 44개+신규 PR 본문 검사 8개=총 52개 통과·0실패, `node .github/pr-broker-body.mjs .github/PR_REQUEST.md` 성공, `git diff --check` 오류 0건. 로컬 `gh pr merge --help`에서 `--match-head-commit` 지원을 확인. GitHub Actions 실제 태그 실행·자동 PR·병합은 아직 미검증. Flat v2의 개별 viewport·확대·키보드·인쇄 실행 증거도 미검증이며 사용자 시각 승인과 구별한다.
- 리뷰·체크포인트: 읽기 전용 리뷰에서 새 workflow의 병합 경쟁 조건(Critical), 숨긴 주석/코드 블록 통과 및 bootstrap 우회(Important)를 지적받아 수정했다. 원격 bootstrap branch 없음 확인. 수정 commit `1f9f6d1a8208e9c77d73889fcebdf94943bd3bbd`을 지정 SSH alias에 push했고 원격 branch HEAD와 일치, worktree clean. 다만 첫 PR은 수정 전 `main` Broker가 실행되므로 이 Broker의 병합 순간 HEAD 고정 결함은 첫 PR에서 여전히 남는다. 해당 미해결 Critical와 실제 화면 QA 부족 상태로 요청 태그를 보내지 않는다.
- 다음 조치: 첫 PR에 사용할 안전한 병합 경로와 실제 화면 필수 QA 증거를 확보한다. 그 뒤 첫 PR을 통합하고, 두 번째 기존 계획 브랜치에 새 `main`을 정상 병합해 같은 PR 설명 검증을 적용한다. 두 브랜치 정리 전 새 브랜치는 생성하지 않는다.

## 최신 상태 — 2026-09-27 전체 구축 지시·외부 연동 후행 결정

- 신산님은 Flat v2 시안을 직접 확인하고 시각 기준으로 승인했다. 이는 사용자 시각 승인 기록이며 1920×1080/1440×900/430×844, 200% 확대, 키보드·인쇄/PDF별 실행 증거가 생겼다는 뜻은 아니다. 수행되지 않은 개별 검증은 `UNVERIFIED`로 유지한다.
- 신산님은 `D:/tmp/shoppingmall2-end-to-end-work-plan/docs/WORK_PLAN.md`의 상세 개발 범위로 전체 구축을 지시했다. 외부 서비스 가입·실연동에 필요한 사항은 구축 완료 후 일괄 처리하기로 했다. S1~S8은 mock/계약 검증으로 진행하고 PG·카카오·문자/메일·푸시의 실제 공급자 PASS와 Oracle UAT/공개 출시는 별도 증거·승인 전까지 선언하지 않는다. 계획서의 schema/migration·인증/권한·Secret·비용·Oracle 별도 승인 경계는 그대로다.
- 기존 두 브랜치의 순차 병합·정리 전 새 브랜치는 만들지 않는다는 신산님 직접 지시가 유지된다. 현재 `main`의 PR Broker는 일반 문구로 즉시 PR을 생성·자동 병합하고, PMO 필수 PR 본문 항목을 채우지 않는다. 신산님은 자동화 수정을 직접 지시했다. 수정본을 기존 Flat v2 브랜치에 작성해도 첫 요청 태그는 현재 `main`의 구버전 자동화를 실행하므로, 첫 병합 경로는 별도 해결이 필요하다. `main` 직접 수정·새 브랜치·GitHub 계정/PAT 사용·미검증 PASS 선언은 하지 않는다.
- 담당·현재 체크포인트: 어울 단일 writer, `codex/flat-v2-prototypes` 시작 HEAD `1c210a2320620be3570d0b0ed6b295b0feff3fe7`. 다음 안전 작업은 정본·Git 게이트 점검과 허용된 브랜치 내 기록 보존이며 PR 요청 태그·제품 신규 Stage 시작은 선행 경계 해결 뒤다.

## 최신 상태 — 2026-09-27 Flat v2 채택 표기 정정·병합 전 검증

- 단계·담당: Flat v2 병합 전 리뷰 대응 / 어울 단일 writer / `codex/flat-v2-prototypes`, 시작 HEAD `a8aaa4511508f035e594047205014822bf3c1f6b`.
- 신산님이 Flat v2를 향후 제품 시각 기준으로 채택한 사실을 `docs/design/DESIGN.md`, 시안 안내, 홈 상태 문구, 계획 문서 및 관련 검사에 일치시켰다. v1은 비교·복구용으로 보존하며 역할별 JavaScript·거래 기능은 변경하지 않았다. 채택은 브라우저 QA 완료가 아니다.
- 읽기 전용 코드 리뷰의 Important 2건 중 상태 표기 불일치를 수정했다. 실제 브라우저의 1920×1080/1440×900/430×844·200% 확대·키보드·인쇄/PDF 검증은 여전히 미완료로 남긴다. 보조 버튼 눌림 표현 Minor는 실제 화면 점검 대상이다.
- 회귀: 채택 문구 검사 RED 확인 후 `node --test` 44통과·0실패. 실제 화면을 테스트한 것으로 표시하지 않는다. 브라우저 자동화의 로컬 파일 프로토콜 정책 거부를 우회하지 않는다.
- Git·다음 조치: 채택 표기 정정 commit `572f3e97f2a6089cb9d4777577700202ee48bf6b`을 원격에 보존했다. 그 사이 원격 `main`이 PR Broker workflow 이름 변경 commit `770d7f010233ca9892792ff2f0f9a80c2a638602`로 전진하여 이를 현재 Flat v2 브랜치에 정상 merge했고, 재검사 44통과·0실패 뒤 merge commit `88b5645e7e3e69df068b958ff4ff04d59bf0d791`을 지정 SSH 원격에 push했다. 두 기존 브랜치의 순차 병합·정리와 새 브랜치 생성은 신산님의 직접 지시다. 실제 화면 검증 증거·필수 게이트를 확보한 뒤 PR Broker 요청 태그를 사용한다. 현재 broker가 생성하는 PR 본문에는 PMO 필수 목적·영향·검증·미검증·rollback이 모두 담기지 않아 그 경계도 해소해야 한다. 게이트 전 PR 태그·main 병합·브랜치 삭제는 하지 않는다.

## 최신 상태 — 2026-09-27 Flat v2 Task 3 문서·정적 검증 완료, 시각 인수 대기

- 단계·담당: 승인된 Flat v2 구현 계획 Task 3 / 어울 단일 writer / `codex/flat-v2-prototypes`, 기준 `origin/main` `34b4186`
- 변경: `docs/design/prototypes/README.md`에 v1과 Flat v2 비교 경로·가상 기능 경계 추가, `docs/design/DESIGN.md`에 v2를 미승인 후보로 명시, `prototype-shell.test.mjs`에 안내 링크 검사 추가. 계획 문서의 오래된 무커밋 `master`/commit 보류 전제를 신산님의 최신 작업 브랜치 지시에 맞게 정정. 원본 시안·역할별 JS·공유 CSS는 수정하지 않음
- 검증: 안내 링크 누락 RED 1건 확인. 읽기 전용 리뷰가 홈 v2 하단의 잘못된 'v1 승인' 표기를 Important로 찾아, 미승인 후보 표기 검사를 RED→GREEN으로 추가하고 하단 문구만 수정. 전체 Node 검사 44통과·0실패. 모든 v2 HTML의 로컬 CSS·JS 경로 11개 존재 확인. 실제 인앱 브라우저에서 `file://` 시안 열기는 브라우저 보안 정책이 프로토콜을 거부했으며 다른 표면·로컬 서버 우회는 시도하지 않음. 따라서 1920×1080/1440×900/430×844, 200% 확대, 키보드 focus, 상태 구분, 인쇄/PDF·스크린샷은 **미검증**. 신산님의 직접 시각 확인 필요
- 오류·조치: Task 3 코드 검사 오류 0건; 브라우저 URL 정책 거부 1회. 원본 9개 파일의 SHA256 불변과 `git diff --check` 오류 0건을 재확인. 임시 `.superpowers/sdd/2026-09-26-balanced-flat-prototypes/` 기록과 활성 worktree는 검토 전 보존
- Git 체크포인트: 작업 브랜치 `codex/flat-v2-prototypes`의 `9dd88603fc6754ef3360ad253aa483851cff045f`를 `origin/codex/flat-v2-prototypes`에 첫 push하고 `git ls-remote`에서 같은 SHA를 확인. 원격 `main`은 기준 `34b4186` 그대로이며 PR·병합·자동 요청 태그 생성 없음. 기본 작업 폴더의 뒤처진 로컬 `main`과 미추적 `.github` 사본도 보존
- 리뷰 잔여 Minor: 보조 버튼 hover 중 press 색 변화가 뚜렷하지 않음; HTML 검사가 모든 추가 head 요소·상대경로 존재를 자동 보장하지 않음(현재 CSS·JS 11개 경로는 별도 정적 확인). 화면 검토의 필수 차단은 아니나 향후 실제 브라우저 확인 대상
- 다음 조치: 신산님께 Flat v2 시각 후보를 제시해 검토·수정 의견을 받는다. Task 3 실제 브라우저 점검은 미완료이며 제품 개발 Stage·WSL/Oracle 배포·`main` 병합은 별도 경계

## 이전 상태 — 2026-09-27 Flat v2 Task 2 완료, Task 3 진행 전

- 단계·담당: 승인된 Flat v2 구현 계획 Task 2 / 어울 단일 writer / `codex/flat-v2-prototypes`, 기준 커밋 `02cffbe`
- 변경: `docs/design/prototypes/flat-v2/`에 고객·판매자·관리자 HTML 및 역할별 동등성 검사 추가. 원본 역할 HTML·JS와 `shared.css`는 수정하지 않음. v2는 기존 classic 역할 스크립트를 상대경로로 공유
- 검증: 신규 세 역할 검사에서 파일 부재 RED 3건 확인 후 역할 검사와 기존 검사 합계 37통과·0실패. 원본 HTML 3개·JS 3개·공유 CSS의 SHA256을 확인했고 `git diff --check` 오류 없음. 실제 브라우저·viewport·인쇄는 미검증
- 오류·조치: 제한된 셸에서 새 디렉터리 생성 거부 1회; 지정 worktree 안에만 허용된 권한으로 폴더 생성 후 `apply_patch`로 검사 작성. 코드 회귀 0건
- 다음 조치: Task 2 변경을 작업 브랜치에 commit한 뒤 Task 3 안내·설계 문서 및 가능한 시각 QA를 수행. 원본 시안과 v1 승인 상태 유지

## 이전 상태 — 2026-09-27 Flat v2 Task 1 완료, Task 2 진행 전

- 단계·담당: 신산님이 Flat v2 제작 계획을 승인하고 `main`에서 작업 브랜치를 만들도록 지시 / 어울 단일 writer
- 기준: `origin/main` `34b4186561a9c1f960bdea58ece4264cb95e100e`에서 `codex/flat-v2-prototypes`와 `D:\Project\shoppingmall2\.worktrees\flat-v2-prototypes`를 생성. 로컬 기존 `main`과 미추적 `.github` 사본은 변경하지 않음. 이 격리 폴더는 Flat v2 검토·병합 뒤 포함 여부와 dirty 상태를 확인하고 정리할 대상
- Task 1 변경: `docs/design/assets/flat-v2.test.mjs`, `home-flat-v2.html`, `owool-flat-v2.css`. 원본 홈 HTML·CSS는 불변 SHA256 `D31050A8…`, `5C45CE70…`. 본문·글자 크기·가상 상품 흐름은 보존하고 Flat 시각 규칙만 별도 적용
- 검증: 시작 기준 Node 37통과. Task 1 신규 검사에서 파일 부재 RED 2건 확인 후 2통과·0실패. 원본/비교본 줄끝 CRLF·LF 차이만 정규화해 본문 내용을 비교. 실제 브라우저·viewport·인쇄는 미검증
- 오류·조치: 제한된 셸에서 계획 기록 폴더 생성 권한 거부 1회; 반복 실행을 중단하고 지정 작업 경로에 허용된 권한으로 재실행하여 생성. 임시 계획 기록은 `.superpowers/sdd/2026-09-26-balanced-flat-prototypes/`에 격리·ignore. 업무 코드 오류 없음
- 다음 조치: Task 1 변경을 작업 브랜치에 안전하게 commit한 뒤 Task 2 역할별 비교 화면을 테스트 우선으로 제작. 계획의 과거 무커밋 `master` 전제는 최신 사용자 지시·실제 Git에 따라 적용하지 않음
## 최신 상태 — 2026-09-27 상세 계획 리뷰 정정·SSH PR 경로 확인

- 단계·담당: 기존 두 브랜치 병합 전 계획서 리뷰 대응 / 어울 단일 writer / `codex/end-to-end-work-plan`, 시작 HEAD `e7760ef9efebc1abdf5f66db2215f8fd7d3027f4`, 작업 시작 시 clean. 아래 이전 기록의 `1b40fc9` 및 ‘문서 4개 미커밋’은 과거 checkpoint이며 현재 Git 상태가 아니다.
- 읽기 전용 리뷰 Important 2건을 정정했다. `docs/WORK_PLAN.md`와 `docs/design/DELIVERY_SCOPE_ADDENDUM.md`에서 기존 승인 대기·실패 결제·미출고/지연·재고 이상·미처리 문의 예외를 유지한다고 명시했다. `docs/DEPLOYMENT_UAT_PLAN.md`의 Oracle staging migration·QA seed는 후보 commit/image/schema 고정 및 별도 승인 뒤 U2에서 실행하도록 옮겼다. 상세 계획 전체는 여전히 신산님 검토 초안이며 병합 요청은 내용 승인과 구별한다.
- 로컬 `node --test` 37통과·0실패. 실제 브라우저·PG/Oracle/WSL 연동은 시험하지 않았다. Flat v2의 실제 화면 QA 미완료는 두 브랜치 정리 순서의 선행 게이트다.
- PR 경로 정정: 아래 이전 기록의 ‘GitHub 계정/gh 인증 부재로 PR 불가’는 부정확했다. 원격 `main`은 이 기록 중 `770d7f010233ca9892792ff2f0f9a80c2a638602`로 전진했고 workflow가 `.github/workflows/auto-pr-merge.yml`로 정상 이름 변경됐다. SSH Git으로 `pr-request/<branch HEAD>/<branch>` 태그를 push하면 GitHub Actions가 PR을 생성·검사·squash 병합·원격 브랜치 삭제하도록 되어 있다. 계정 로그인/PAT/`gh`는 사용하지 않는다. 다만 현재 broker의 PR 본문은 자동 생성된 일반 문구라 PMO 필수 목적·영향·검증·미검증·rollback 전부를 담지 못한다. 요청 태그는 필수 검증 완료를 뜻하므로 화면 QA가 미완료인 현재 생성하지 않는다.
- 다음 조치: 두 브랜치 변경을 각각 안전한 commit/push로 보존하고, Flat v2의 실제 화면 검증 증거와 필수 리뷰 게이트를 확보한 뒤 기존 브랜치부터 순차 PR/병합·merged-main smoke·원격/로컬 worktree 정리한다. 둘 다 정리되기 전 새 작업 브랜치를 만들지 않는다. 기본 `main`의 미추적 `.github/` 파일은 덮어쓰거나 삭제하지 않는다.

## 최신 상태 — 2026-09-27 두 기존 브랜치 병합·정리 요청의 검증 게이트

- 판정: 신산님이 `codex/flat-v2-prototypes`와 `codex/end-to-end-work-plan`을 모두 `main`에 병합하고 원격·로컬 브랜치와 worktree를 정리한 **뒤** 최신 `main`에서 새 작업 브랜치를 만들도록 지시했다. 병합·삭제·새 브랜치 생성은 아직 미실행이다. 기존 작업 브랜치 종료 전 새 브랜치 생성의 예외는 없다는 최신 지시를 적용한다.
- 담당·Git: 어울 단일 writer. 원격 `main`=`34b4186561a9c1f960bdea58ece4264cb95e100e`; Flat v2=`a8aaa4511508f035e594047205014822bf3c1f6b`(main보다 5 commit 앞), 계획 초안=`1b40fc9d23244941c51e4c1242b68bd722965397`(1 commit 앞). 원격 세 ref는 SSH 읽기 전용으로 재확인했다. 로컬 기본 `main`은 원격보다 2 commit 뒤이며 미추적 `.github/` 두 파일은 소유·보존 대상이다.
- 이번 검증: Flat v2 worktree의 `node --test` 44통과·0실패, 계획 worktree의 `node --test` 37통과·0실패. 계획 branch에는 승인된 관리자 관제 범위의 문서 수정 4개 파일이 아직 미커밋으로 남아 있고 `git diff --check`는 0오류다. 이는 정적/모델 검사 결과이며 실제 브라우저·인쇄/반응형 QA가 아니다.
- 병합 차단 1: Flat v2 실제 브라우저 QA는 이전부터 미실행이다. 사용 가능한 브라우저 자동화가 `file://` 로컬 시안 열기를 보안 정책상 명시적으로 거부했으며 우회 금지 안내가 있어 다른 URL·브라우저·명령으로 같은 접근을 시도하지 않았다. 사용자가 직접 수행한 실제 브라우저 확인 또는 허용된 독립 검증 증거 없이는 필수 화면 검증을 통과로 표시하지 않는다.
- 병합 차단 2: 현재 `gh`의 GitHub 인증 토큰이 무효이고 Chrome의 현재 GitHub 계정에서도 대상 저장소는 404로 보인다. SSH Git ref 조회/branch push는 가능하지만 PR 조회·생성·병합 경로는 확인되지 않았다. 인증·계정 설정은 변경하지 않고, PR 없이 직접 `main`에 push하는 우회는 별도 보고·승인 없이 하지 않는다.
- 정확한 다음 조치: 승인된 관제 범위의 미커밋 문서를 검사해 안전한 branch checkpoint로 보존한다. Flat v2 화면 실브라우저 증거와 GitHub PR 접근을 확보하거나 신산님에게 미검증·절차 변경을 명시적으로 결정받은 뒤 순서대로 병합/merged-main smoke/정리한다. 두 브랜치가 모두 안전하게 정리되기 전에는 새 작업 브랜치를 만들지 않는다. 제품 구현·WSL/Oracle 배포·인수는 미시작.

## 이전 상태 — 2026-09-27 상세 개발·설치/인수 작업계획 초안 작성

- 판정: 계획 수립 중. 제품 구현·WSL/Oracle 배포·사용자 인수테스트는 미시작.
- 담당·Git: 어울 단일 writer, `D:\tmp\shoppingmall2-end-to-end-work-plan`의 `codex/end-to-end-work-plan` / `34b4186561a9c1f960bdea58ece4264cb95e100e` (`origin/main` 기준). 신산님이 Flat v2 미병합 상태에서 별도 계획서 브랜치를 만드는 예외를 직접 승인했다.
- 기존 작업 보존: `codex/flat-v2-prototypes`는 별도 worktree에서 clean·push 상태로 유지하고 실제 브라우저 점검·PR·병합은 미완료. 기본 `main`의 미추적 `.github/` 자료는 변경하지 않았다. 계획서 작성 후 Flat v2 병합 여부와 문서 기준을 대조한다.
- 확정된 인수 범위: Flat v2를 제품 디자인 기준으로 채택. PG 시험환경의 카드 결제·부분 환불·실패/중복 통지를 확인하고 실금액 거래는 인수 합격 조건에서 제외. Android는 신산님이 제시한 에뮬레이터에서 반복 시험하고 연결된 실기기에서도 최종 설치·로그인·결제 복귀·푸시를 확인할 계획이다. iPhone 실기기 검증은 후속. 카카오 로그인은 웹·Android 실제 연동, Apple 로그인은 후속 iPhone 인수 단계. 문자·이메일·Android 푸시는 시험 계정의 실제 수신까지 확인한다. Android 앱 아이콘은 앱 빌드 전 어울몰 전용 시안을 제작·신산님 승인 후 적용한다.
- Oracle 준비 현황: 신산님 답변에 따르면 Oracle Cloud 계정과 서버가 모두 있다. 정확한 서버 식별자·기존 서비스 점유·격리 배포 가능 여부·접속 권한·비용·도메인·DB/저장소 구성은 아직 확인하지 않았다. 기존 지시대로 환경 구성 결정과 배포 승인은 인수 준비 게이트에서 수행한다.
- 프로모션 인수 범위: 관리자 등록 프로모션은 배너 표시만이 아니라 상품·주문 할인과 배송비 지원을 실제 주문 견적·PG 시험 결제·환불·정산 발생 자료에 반영한다. 할인 쿠폰은 한 결제에 최대 1개, 배송비 지원은 발송 주문마다 최대 1개이며 두 종류는 함께 적용 가능하다. 5만 원 무료배송은 혜택 적용 전 해당 발송 주문의 상품금액으로 판정한다. 시험값과 실제 운영 혜택 예산은 구분한다.
- 외부 계정 준비 상태: 신산님 후속 답변에서 PG 개발자 **시험상점 없음**, 카카오 개발자 앱은 **가능**, 문자·메일 발송 서비스는 **준비됨**, Expo/Firebase는 **모름**. 각각의 소유·권한·실제 설정/비용은 미확인이다. 비밀값 수집 없이 인수 준비 단계의 접근·권한 확인 항목으로 둔다. PG 시험상점이 없더라도 mock·계약 시험은 진행하고 실제 PG 연동 PASS로 표시하지 않는다. 신산님이 에뮬레이터 화면과 연결된 실기기 보유를 알렸으나 실제 앱/푸시 시험은 미수행.
- 출고 후 교환·환불 인수 기준: 신산님은 변경 가능한 시험용 정책으로 접수·관리자 판단·PG 시험 환불 흐름을 인수하고, 최종 법률 검토·고객 약관 확정은 공개 출시 전 필수로 두는 권장안을 선택했다. 기능 인수 합격을 출시 승인으로 간주하지 않는다.
- 문서 변경: `docs/WORK_PLAN.md`의 S0~S8 상세 Task·gate 보완, `docs/design/DELIVERY_SCOPE_ADDENDUM.md`와 별도 `docs/DEPLOYMENT_UAT_PLAN.md` 초안 작성. 세 문서는 신산님 검토 전이며 제품 설계/개별 환경·비용 승인을 대신하지 않는다. 변경 전에는 S1~S8의 추상적 목록, 변경 후에는 분류·홈·프로모션 금액·정산/인쇄·아이콘·앱·Oracle 인수의 선행/증거/미검증/rollback 경계를 연결했다.
- 검증: 새 worktree의 기존 Node 시안 검사 37통과·0실패, `git diff --check` 0오류, 새 계획 문서 3개의 상대 링크 존재 검사 통과. 최신 사용자 결정과 오래된 문구의 충돌을 점검해 Android 에뮬레이터/실기기 시험 시점·카카오 계정 존재 미확인·판매자별 정산 표현을 정정했다. 이는 브라우저·제품·외부 연동 검증이 아니다. Flat v2 비교 시안의 브라우저·viewport·인쇄 검증도 여전히 미수행.
- WSL 읽기 전용 재확인: `WSL-server`의 `/home/daon/deploy/shopping`은 아직 없고, 정확한 `local-postgres` 컨테이너는 실행 중이다. 유사 이름의 다른 PostgreSQL 컨테이너도 존재하므로 정식 DB 작업 때 이름을 정확히 지정한다. `ss -ltn`에서 9091 포트 점유는 보이지 않았으나 로컬·Oracle까지 공통 포트 확정으로 보지 않는다. 서버 설정·DB·checkout 변경 없음.
- 오류·조치: 제한된 셸의 `git ls-remote`에서 SSH alias를 해석하지 못한 1회. 승인된 권한에서 같은 읽기 전용 조회가 성공했고 `origin/main` SHA가 `34b4186`으로 일치함을 확인. SSH 설정·credential 변경 없음. PMO 환경 가이드의 신규 worktree `D:\tmp` 규칙을 늦게 확인해 계획서 worktree를 한때 `D:\Project\shoppingmall2\.worktrees\end-to-end-work-plan`에 생성한 경로 판단 오류 1회; 즉시 보고 후 정확한 소스·대상·dirty 상태를 확인하고 `git worktree move`로 `D:\tmp\shoppingmall2-end-to-end-work-plan`에 이동했다. 원래 경로 부재·새 경로 정상·기존 Flat v2 불변 확인.
- 이번 결정·다음 조치: 신산님이 **이번 인수의 관리자 관제 필수 범위**를 주문·매출·재고·클레임 요약 및 실패 결제·미출고 처리 목록으로 승인했다. 자동 경보·점검 스위치·판매자 강제 정지는 후속이다. 이를 보완 설계, S5.4, UAT-11에 반영하고 세 문서의 검증을 마친 뒤 **계획 전체의 승인 또는 수정**을 요청한다. 이 관제 답변만으로 나머지 상세 실행 계획 전체를 승인받은 것으로 간주하지 않는다. PG 시험상점 준비, Oracle 격리·비용, schema/인증/Secret, 공개 출시 법률/약관은 각 별도 승인 경계다. 문서는 작업 branch의 검토 초안으로만 보존하고 PR/병합은 하지 않는다. 제품 구현·인수는 미착수.

## 이전 상태 — 2026-09-26 초기 Git main 기준선 생성·원격 확인

- 단계·담당: 신산님 직접 지시의 `sinsan-develop/shoppingmall` 초기 `main` 생성·커밋·push / 어울
- 현재 판정: `D:\Project\shoppingmall2`의 초기 `main` root commit `6c249b0be8b60604a86c4ddf7c3ea68159749d50` 생성. `origin=git@github-sinsan-develop:sinsan-develop/shoppingmall.git`; 비강제 `git push -u origin main` 성공. 이후 `git ls-remote --symref origin HEAD refs/heads/main`에서 원격 HEAD가 `main`을 가리키고 원격 SHA가 초기 커밋과 일치함을 확인
- 기준선 포함: `docs/`와 `WORK_STATUS.md` 32개 파일. `.github/pr-broker-gate.sh`와 `.github/workflows/ssh-pr-bridge.yml`은 자동 PR 병합을 수행하는 별개 자료라 로컬에 미추적으로 보존하고 초기 커밋·push에서 제외. 다른 자료 삭제·초기화 없음
- 검증: 기존 Node 모델·화면 연결·글자 크기 37통과·0실패, `git diff --cached --check` 0오류, 포함 파일의 private key·일반 토큰 형태 패턴 스캔 결과 해당 파일 0건. 실제 브라우저·인쇄·외부 연동은 미검증. Flat v2 제작 계획은 여전히 신산님 검토 대기
- 오류·조치: 제한된 셸의 SSH 별칭 해석 실패 1회와 `.git/HEAD.lock` 쓰기 거부 1회. 읽기 전용 Git 참조 확인 후 허용된 권한으로 동일 명령을 다시 실행해 정상 완료. SSH key·credential 내용·설정 변경 없음
- 다음 조치: Flat v2 계획의 신산님 검토·승인 여부 확인. 제품 Stage/WSL checkout·DB 변경은 별도 게이트

## 이전 상태 — 2026-09-26 균형형 Flat v2 시안 제작 계획 검토 대기

- 단계·담당: 승인된 Flat 설계의 구현 계획 수립 / 어울. 신산님이 2026-09-26 [서면 설계](docs/superpowers/specs/2026-09-26-balanced-flat-prototype-design.md)를 승인함
- 상태: [Flat v2 시안 제작 계획](docs/superpowers/plans/2026-09-26-balanced-flat-prototypes.md) 작성·자체 대조 완료, 신산님 검토 대기. v1 및 클릭형 시안 원본 수정·v2 제작은 아직 미시작
- 계획 경계: 별도 v2 CSS와 홈·고객·판매자·관리자 진입점; 기존 역할별 JS 재사용, 실제 결제·정산·프로모션 기능 변경 없음. 무커밋 `master`/remote 없음에 따라 Git commit·push는 초기 기준선 게이트 전 보류
- 변경 파일: 위 계획 파일과 `WORK_STATUS.md`. 기존 제품/시안 파일 미수정. 담당 writer 어울
- 검증·오류·미검증: 원본 HTML의 링크·역할 JS·현재 디자인 폰트 크기·PMO 화면 기준과 계획을 정적 대조. 기존 Node 모델·화면 연결·글자 크기 검사 37통과·0실패(위 계획의 기존 5개 시험 파일). Flat v2 구현 검사·브라우저·viewport·인쇄는 미실행, 이번 단계 오류 0건
- 정확한 다음 조치: 신산님이 계획의 파일 범위와 검증·미검증 경계를 검토·승인하면 단일 writer가 Task 1→3을 순서대로 진행. 실제 브라우저 접근이 정책상 차단되면 우회하지 않고 미검증으로 보고

## 이전 상태 — 2026-09-26 균형형 Flat 시안 설계 검토 대기

- 단계·담당: 화면 시각 변형 설계 / 어울. 신산님이 균형형 Flat 방향과 고객 상품·판매자 재고·관리자 프로모션 대표 비교를 확인함
- 상태: 기존 승인 정적 v1 및 클릭형 시안을 보존하는 별도 Flat v2의 [서면 설계](docs/superpowers/specs/2026-09-26-balanced-flat-prototype-design.md) 작성. 서면 설계 검토·승인 전이며 Flat v2 시안 제작·제품 구현 미시작
- 변경 파일: 위 설계 파일과 `WORK_STATUS.md`만. 기존 시안 HTML/CSS/JS·승인 디자인 기준은 변경하지 않음
- Git·환경: 무커밋 `master`, remote 미설정, 미추적 자료 보존. 프로젝트 root `AGENTS.md` 없음. 신규 branch/worktree·WSL·DB·배포 조치 없음
- 검증·오류: 설계 문구와 기존 디자인 프로필·PMO 화면 기준 정적 대조; 실제 브라우저·모바일·확대·키보드 검증 미수행. 이번 단계 명령 오류 0건
- 정확한 다음 조치: 신산님이 서면 설계 파일을 검토·수정 또는 승인. 승인 후 별도 Flat v2 제작 계획·검증 방법을 확정하고 원본을 덮어쓰지 않는 비교 시안만 제작

## 이전 상태 — 2026-09-26 메인 화면 확장 구조 및 분류·정산 설계 초안 검토 대기

- 판정: `SPEC_REVIEW_WAIT` (정적 시안 4개 승인, 역할별 독립 클릭형 시안 3개 정적 제작 완료. 상품·판매자 분류/등록/정산 조회와 메인 화면 확장 구조의 **서면 설계 초안** 작성, 신산님 검토 대기. 추가 화면 구현·실제 브라우저 검증·제품 구현은 미시작)
- 정본: 신산님이 지정한 현재 문서 작업공간 `D:\Project\shoppingmall2`; 이전 OneDrive 폴더는 보존된 복사 원본이며 이후 작업 정본으로 사용하지 않음. 개발 코드 정본과 실제 실행환경은 아직 미확정
- 작업계획: `docs/WORK_PLAN.md` 승인, S1~S8 모두 미시작
- Git: 무커밋 `master`, remote 미설정, 기존 `docs/`·`WORK_STATUS.md` 미추적 보존. 새 작업 폴더의 기존 `.github/` 두 파일도 보존·미추적; writer 어울; 기존 `D:\Project\shoppingmall`는 읽기 전용 참고
- 최근 결정: 신산님이 네이버 쇼핑을 장기 참조로 지정하고 검색·상단 메뉴·이벤트·상품 카테고리·개인별 추천 예시를 제시한 뒤 어울몰 메인을 이 구조로 하자고 결정. 기존 승인 MVP와 장기 확장 범위를 구분한 별도 서면 초안을 작성했으며 개인화·광고·공급자·후속 입점 모델 확정은 없음
- 현재 변경: 기존 `docs/design/prototypes/`의 역할별 HTML·classic JS·공유 CSS·검사·안내문과 `docs/design/DESIGN.md`, 계획 체크리스트를 보존. 두 서면 초안 `docs/superpowers/specs/2026-09-26-category-registration-and-settlement-prototype-design.md`, `docs/superpowers/specs/2026-09-26-home-discovery-expansion-design.md` 및 `WORK_STATUS.md`만 추가·수정. 기존 문서·자료와 새 폴더의 `.github/` 삭제 없음
- 실행·검증: 클릭형 역할 모델·화면 연결·파일 연결·기존 글자 크기 검사 37통과·0실패. 기존 참고 GitHub `main` HEAD `6cc92c0`과 크기 비교 결과, 개발 원격/WSL/DB의 이전 읽기 전용 확인은 유지. 실제 브라우저 시각/인쇄 PDF·반응형·키보드·200% 확대 검증, 제품 코드/외부 연동 검증 없음
- 오류와 조치: 브라우저 로컬 `file://` 접근 정책 차단(이번 수정 검증에서도 재확인, 우회하지 않음); 제한된 셸의 SSH 설정 접근 거부 1회(권한 범위 내 읽기 전용 재확인으로 원인 구분, 설정 변경 없음)
- 미검증·승인 경계: 실제 브라우저 렌더링·버튼 동작·인쇄/PDF 저장·모바일·키보드·200% 확대, 클릭형 시안 최종 승인, 개발 Git 기준선·WSL checkout·공통 포트, project root `AGENTS.md`, 외부 공급자/Oracle 인수 환경, schema·인증·Secret·비용, 출고 후 환불 법률·약관
- 정확한 다음 조치: 신산님이 메인 화면 구조와 분류·등록·정산 서면 설계 초안의 수정 또는 승인 여부 결정. 승인 뒤 구현 계획과 추가 기능의 초기 출시 포함 범위를 별도 검토. 기존 세 HTML 최종 검토와 최초 Git 기준선·공통 포트·환경 게이트도 미완료이므로 S1 착수 전 별도 확인

## 2026-09-26 메인 화면 탐색·장기 확장 설계 초안

- 단계·담당: 홈 정보 구조 서면 설계 / 어울
- 상태: 신산님이 제시한 검색창·상단 메뉴·이벤트 카드·상품 카테고리·개인별 추천 예시를 어울몰 홈의 순서 있는 다섯 영역으로 해석해 초안 작성. 이어서 재지정한 `D:\Project\shoppingmall`의 구매자·판매자·운영자 HTML/JS/CSS를 읽기 전용으로 대조하고 재활용/제외 범위를 6절에 추가. 네이버 서비스·이미지 복제는 제외하고 어울몰 브랜드/거래 규칙 유지. 서면 초안 자체의 신산님 검토·승인은 아직 없음
- 변경 파일: `docs/superpowers/specs/2026-09-26-home-discovery-expansion-design.md`, `WORK_STATUS.md`, 대화 내 홈 화면 시각화 원본; 기존 역할 시안 HTML/JS·제품 코드·DB·환경 미수정
- 범위 경계: 초기 공통 편집 추천과 후속 개인화/광고를 구분. 상품 분류와 이벤트/서비스 바로가기는 별개. 관리자 메뉴 편집 범위·이벤트 할인 연결은 질문 답변 전 미확정. 네이버 홈 직접 열람은 웹 접근 제한으로 수행하지 못했으며 신산님이 제공한 화면 예시와 공식 안내를 참고
- 검증·오류: 문서 링크·범위·모순 정적 자체 검토, 시각화 스크립트 구문 검사 수행. 실제 브라우저 렌더링/추천 품질·개인정보 검증 없음. 이번 문서 작성 중 실행 오류 0건. Git 무커밋 `master`·원격 미설정 상태로 커밋·push 없음. 기존 `D:\Project\shoppingmall`의 dirty/untracked 자료 보존
- 다음 조치: 신산님 서면 초안 검토 후 수정 또는 승인. 그 전 홈 시안 교체·구현 계획 착수 없음

## 2026-09-26 분류·등록·정산 및 운영 요구 설계 초안

- 단계·담당: 클릭형 시안 확장 서면 설계 / 어울
- 상태: 신산님이 분류·등록·정산 흐름 및 설계 문서 작성을 승인. 제공한 기능·관제·외부 연동·역할 여정·인프라 목록을 기존 PRD/DESIGN/WORK_PLAN/기술 방향에 대조하여 초안에 구분 기록. 서면 초안 자체의 검토·승인은 아직 없음
- 변경 파일: `docs/superpowers/specs/2026-09-26-category-registration-and-settlement-prototype-design.md`, `WORK_STATUS.md`. 제품/시안 HTML·JS·DB·설정 미수정
- 판정 근거: 권한·검색·장바구니·콜백·운송장·리뷰·감사 이력·S3 호환 이미지 저장소·PostgreSQL 검색은 기존 범위에 상당 부분 포함. 카테고리/판매자 분류, 상세 편집, 판매자 공지·클레임, 운영 KPI·경보/제어와 후보 연동은 구체화 또는 별도 승인 필요. 알려진 기본 운영자 PIN `0000`은 채택하지 않고 민감 조치 재인증 제안
- 검증: 기존 시안 자동 검사 37통과는 이전 코드 증거이며 이번 문서 수정 후 제품 시험을 새로 실행하지 않음. 문서 링크·미결정/범위 문구 정적 검토만 수행. 실제 브라우저·외부 연동·SLA 실측·PDF 출력 미검증
- 오류 횟수·조치: 이번 문서 단계 실행 오류 0건. Git은 무커밋 `master`/remote 미설정으로 기존 미추적 자료 보존; 커밋·push 없음
- 다음 조치: 신산님이 초안에서 시안에 넣을 범위와 후속 제품/운영 후보의 우선순위를 검토. 서면 설계 승인 전 구현 계획·시안 코드 변경 없음

## 2026-09-26 클릭형 제작 착수·작업공간 판정

- 단계: 클릭형 시안 계획 Task 1 시작
- 담당: 어울
- 상태: 신산님이 4개 Task 계획과 직접 순차 제작 승인. 기존 `D:\Project\shoppingmall2`은 Git 일반 checkout의 무커밋 `master`이고 모든 문서가 미추적이라 worktree 분리 불가. PMO·계획의 시안 단계 예외에 따라 현재 문서 작업공간에서만 작업하고 커밋·push하지 않음
- 사전 검사: `node --test docs/design/assets/typography.test.cjs` 3통과·0실패. Node 패키지 설치 파일·기존 `docs/design/prototypes/` 없음
- 사전 인터페이스 대조: Task 2·3은 Task 1 고객 상태를 import하지 않으며 `shared.css`만 소비. Task 4는 Task 1~3의 HTML 진입점과 각 역할 모듈을 검사. 동일 JS 상태 모델 공유 없음
- 결정 기록: 현재 무커밋 저장소에서 실행 계획용 worktree·Git 기반 ledger 스크립트는 사용할 수 없으므로 `WORK_STATUS.md`를 단계별 지속 기록으로 사용. 잘못되면 최초 Git 기준선 구성 시 과거 시안 자료의 출처 분리가 어려워질 수 있어 커밋/원격 전송은 별도 게이트까지 보류
- 미검증: 클릭형 코드·브라우저, Git 초기 기준선
- 다음 조치: Task 1 고객 시안 테스트를 먼저 작성하고 RED 확인

## 2026-09-26 Task 1 스크립트 형식 조정 결정

- 단계: 고객 클릭형 시안 제작 중
- 담당: 어울
- 상태: 고객 모델 검사 5개는 RED(기능 없음)→GREEN(5통과), 기존 폰트 검사 3통과 확인. 브라우저 `file://`에서 별도 서버 없이 열 시안에 ES module 로딩 의존성이 남을 위험을 발견
- 결정 기록: 설계의 "서버 없이 검토" 조건을 우선해 역할별 브라우저 스크립트를 classic `.js`로 작성하고 Node 검사는 CommonJS export를 사용한다. 기존 계획의 `.mjs` 역할 구현 파일 표기에서 벗어나지만 역할 독립·무저장소·가상 상태 계약은 그대로 유지. 판단이 틀리면 파일 URL 실행 환경별 차이를 다시 검증해야 한다
- 변경 파일: `docs/design/prototypes/customer.test.mjs`, `customer.html`, 고객 스크립트(전환 중), `WORK_STATUS.md`
- 미검증: 실제 브라우저 파일 열기·상호작용, 반응형
- 다음 조치: 일반 브라우저 스크립트 파싱 검사를 RED로 확인한 뒤 고객 구현을 classic 형식으로 전환

## 2026-09-26 Task 1 고객 클릭형 시안 정적 검사 완료

- 단계: 계획 Task 1 / 다음 Task 2
- 담당: 어울
- 상태: `customer.html`, `customer.js`, `shared.css` 작성. 브라우저 classic 스크립트로 동작하도록 계획의 ES module 구현 형식을 조정; 3발송 주문/통합 모의 결제/품절/실패/출고 전 취소 예시 포함
- 변경 파일: `docs/design/prototypes/customer.html`, `customer.js`, `customer.test.mjs`, `shared.css`, 계획 체크리스트, `WORK_STATUS.md`
- 테스트: 기능 부재 RED 5실패, classic 스크립트 형식 RED 6실패 확인 후 `node --test docs/design/prototypes/customer.test.mjs docs/design/assets/typography.test.cjs` 9통과·0실패; `node --check docs/design/prototypes/customer.js` 통과
- 미검증: 실제 브라우저에서 파일 열기·버튼 동작·반응형·접근성. 정적·모델 검사 통과를 브라우저 PASS로 표시하지 않음
- 다음 조치: Task 2 판매자 상태 테스트 RED부터 진행

## 2026-09-26 Task 2 판매자 클릭형 시안 정적 검사 완료

- 단계: 계획 Task 2 / 다음 Task 3
- 담당: 어울
- 상태: `seller.html`, `seller.js` 작성. 농가 A 담당 정책 요청·품절/재판매 승인 대기·출고 예시를 독립 표시
- 변경 파일: `docs/design/prototypes/seller.html`, `seller.js`, `seller.test.mjs`, 계획 체크리스트, `WORK_STATUS.md`
- 테스트: 기능 부재 RED 5실패 확인 후 `node --test docs/design/prototypes/seller.test.mjs docs/design/prototypes/customer.test.mjs` 11통과·0실패; `node --check docs/design/prototypes/seller.js` 통과
- 미검증: 실제 브라우저 파일 열기·상호작용·반응형·접근성. 관리자 시안과 실제 상태 공유 없음
- 다음 조치: Task 3 관리자 상태 테스트 RED부터 진행

## 2026-09-26 Task 3 관리자 클릭형 시안 정적 검사 완료

- 단계: 계획 Task 3 / 다음 Task 4
- 담당: 어울
- 상태: `admin.html`, `admin.js` 작성. 관리자 승인·반려 이력, 출고 전 배송비 포함 가상 환불, 발생일 기준 농가별 정산 자료·기간 완료를 독립 표시
- 변경 파일: `docs/design/prototypes/admin.html`, `admin.js`, `admin.test.mjs`, 계획 체크리스트, `WORK_STATUS.md`
- 테스트: 기능 부재 RED 5실패 확인 후 `node --test docs/design/prototypes/admin.test.mjs docs/design/prototypes/seller.test.mjs docs/design/prototypes/customer.test.mjs` 16통과·0실패; `node --check docs/design/prototypes/admin.js` 통과
- 오류 횟수: 예상한 테스트 RED 5건 외 실행 오류 0건
- 미검증: 실제 브라우저 파일 열기·상호작용·반응형·접근성. 세 역할의 실제 상태·권한은 연결되지 않음
- 다음 조치: Task 4 연결 검사와 안내문을 작성한 뒤 전체 정적·모델 검사를 실행하고 시안 검토를 요청

## 2026-09-26 Task 4 역할별 시안 연결·검토 인계

- 단계: 계획 Task 4 / 신산님 화면 검토 대기
- 담당: 어울
- 상태: 고객·판매자·관리자 HTML 진입점과 안내문을 연결. 세 시안은 독립 메모리 상태이며 실제 결제·계정·서버·DB·환불·송금·발송은 없음. 빈/부분 장바구니의 발송 주문 수가 고정 3개로 보이던 고객 제목을 현재 수로 변경하고, 판매자 초기화 시 운송장 입력값도 복원
- 변경 파일: `docs/design/prototypes/README.md`, `prototype-shell.test.mjs`, `customer.html`, `customer.js`, `seller.js`, `docs/design/DESIGN.md`, `docs/superpowers/plans/2026-09-26-role-prototypes.md`, `WORK_STATUS.md`
- 테스트: 연결 검사 RED 1실패(안내문 누락), 문구 누락으로 1실패 후 수정. 전체 `node --test docs/design/prototypes/customer.test.mjs docs/design/prototypes/seller.test.mjs docs/design/prototypes/admin.test.mjs docs/design/prototypes/prototype-shell.test.mjs docs/design/assets/typography.test.cjs` 24통과·0실패. 세 역할 JS `node --check` 결과 구문 오류 없음
- 오류 횟수: 예상된 RED 1건, 안내문 검사의 후속 실패 1건(수정 후 재실행 통과); 브라우저 정책 차단은 이전 기록 1건이며 이번 단계에서 우회·재시험하지 않음
- 미검증: 실제 브라우저 파일 열기·버튼 동작, 1920×1080/1440×900/430×844, 200% 확대, 키보드·focus·스크린리더, 실제 역할/권한·결제·서버·DB·연동. 정적 연결 검사는 브라우저 동작 검사가 아님
- 승인 경계: 시안 최종 승인 전. Git 최초 기준선이 없어 커밋·push·PR·WSL/Oracle 배포 없음
- 다음 조치: [고객](docs/design/prototypes/customer.html)·[판매자](docs/design/prototypes/seller.html)·[관리자](docs/design/prototypes/admin.html) 시안을 신산님이 검토하고 수정 의견 또는 승인 결정. 실제 브라우저 확인은 사용 가능한 환경에서 별도 수행

## 2026-09-26 클릭형 시안 수량·전체 정산 출력 보완

- 단계: 신산님 시안 검토 의견 반영 / 수정 시안 재검토 대기
- 담당: 어울
- 상태: 신산님이 요청한 고객 상품 수량 입력·장바구니 수량 수정/상품 제거·단가×수량 계산, 판매자 재고 수량 직접 입력, 관리자 농가별/전체 기간 조회와 브라우저 인쇄 창의 PDF 저장·프린터 출력을 반영. 상품 고추 예시 할인은 1개당 5,000원; 농가별/전체 조회는 가능하되 완료는 농가별만 가능. 실제 PDF 직접 생성·자동 다운로드는 하지 않음
- 변경 파일: `docs/design/prototypes/customer.js`, `customer.test.mjs`, `seller.js`, `seller.html`, `seller.test.mjs`, `admin.js`, `admin.html`, `admin.test.mjs`, `shared.css`, `README.md`, `docs/design/DESIGN.md`, `WORK_STATUS.md`
- 테스트: 기존 기준 24통과·0실패. 기능 부재 RED 9건, 화면 연결 RED, 빈 판매자 재고 입력 오류 RED를 확인하고 수정. 금액 테스트의 기대값 131,000원은 무료배송 적용을 빠뜨린 계산 오류였으며 128,000원으로 정정. 전체 Node 검사 37통과·0실패. 테스트는 실제 결제·재고·정산/인쇄를 수행하지 않는 메모리 모델과 가짜 DOM 연결 검사
- 오류 횟수: 의도한 테스트 RED와 예상값 정정 외 구현 중 실행 오류 0건; 실제 앱 브라우저 `file://` 자동 조작은 URL 보안 정책으로 차단되었고 다른 경로나 브라우저로 우회하지 않음
- 미검증: 실제 브라우저 버튼·화면·인쇄 창·PDF 저장 결과, 프린터 출력, 모바일/200% 확대/키보드·focus. 실제 결제·DB·서버·권한·재고 반영도 시안 범위 밖
- 승인 경계: 시안 수정안은 신산님이 채팅에서 승인했으나 수정 후 최종 시안 승인은 아직 없음. Git 무커밋 `master`/원격 미설정 상태 유지, 커밋·push·WSL/Oracle 배포 없음
- 다음 조치: 신산님이 세 HTML을 새로고침해 수량·정산 조회/인쇄 흐름을 확인하고 수정 의견 또는 최종 승인 결정

## 2026-09-26 클릭형 설계 승인·구현 계획 초안

- 단계: 클릭형 화면 시안 제작 계획 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 `docs/superpowers/specs/2026-09-26-clickable-prototype-design.md` 승인. 역할별 시안 제작을 4개 검증 가능한 Task로 분해한 계획은 검토 대기
- 변경 파일: `docs/superpowers/specs/2026-09-26-clickable-prototype-design.md`(승인 상태), `docs/superpowers/plans/2026-09-26-role-prototypes.md`, `docs/design/DESIGN.md`, `docs/design/assets/README.md`, `WORK_STATUS.md`
- 검증: 설계의 고객·판매자·관리자 독립 흐름, 가상/실제 경계, 테스트·브라우저 미검증, Git 무커밋 상태를 계획 Task와 대조. 실행 시험 없음
- 오류 횟수: 0
- 다음 조치: 신산님이 계획 내용과 실행 방식을 검토·승인. 승인 전 클릭형 코드 작성·커밋·push 없음

## 2026-09-26 작업 폴더 변경

- 단계: 로컬 문서 작업공간 이전 (제품 구현 전)
- 담당: 어울
- 상태: 신산님 지시로 작업 정본을 `D:\Project\shoppingmall2`로 변경. 이전 OneDrive 원본은 삭제하지 않고 보존
- 사전 상태: 대상 폴더에는 Git 저장소 없이 기존 `.github/pr-broker-gate.sh`, `.github/workflows/ssh-pr-bridge.yml`만 있었으며 원본의 `.git`, `docs`, `WORK_STATUS.md`와 이름 충돌 없음
- 수행: 원본의 `.git`, `docs`, `WORK_STATUS.md`를 대상 폴더로 복사. 원본과 대상의 복사 파일 251개 SHA-256 대조에서 누락 0·불일치 0. 대상의 기존 `.github` 두 파일 SHA-256은 복사 전후 동일
- Git: 대상 폴더에서 `git rev-parse --show-toplevel` 결과 `D:/Project/shoppingmall2`; 무커밋 `master`, remote 미설정, `.github/`·`docs/`·`WORK_STATUS.md` 미추적. 최초 기준선·branch/worktree는 구성하지 않음
- 변경 파일: `docs/DEVELOPMENT_ENVIRONMENT.md`, `WORK_STATUS.md`(새 작업 폴더에서 현재 경로 갱신)
- 미검증: 대상 `.github` 설정의 적용 적합성, 실제 브라우저 화면, 클릭형 시안·개발환경 게이트
- 다음 조치: 이후 문서·시안 작업은 새 경로에서만 수행. 신산님이 클릭형 설계 문서를 검토하고 승인 또는 수정 요청

## 2026-09-26 정적 시안 승인·클릭형 독립 구성 결정

- 단계: 화면 시안 승인 및 클릭형 설계 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 글자 크기를 조정한 정적 4화면 전체를 승인하고, 고객·판매자·관리자 클릭 시안을 역할별로 독립시키기로 결정. 구체 설계 문서는 별도 검토 대기
- 변경 파일: `docs/superpowers/specs/2026-09-26-clickable-prototype-design.md`, `docs/design/DESIGN.md`, `docs/design/assets/README.md`, `docs/design/assets/home-v1.html`(오래된 검토 전 표기만 정정), `WORK_STATUS.md`
- 검증: 승인된 PRD R01~R10·현재 정적 화면과 설계 초안의 구매/승인/환불/정산 범위를 대조. 실제 클릭형 코드·브라우저 시험 없음
- 미검증·승인 경계: 클릭형 설계 문서 검토·구현 계획·시안 제작, 실제 시각/키보드/반응형 검증, 최초 Git 기준선. 무커밋 `master`이므로 문서 커밋은 하지 않음
- 다음 조치: 신산님이 설계 초안을 검토·승인 또는 수정 요청. 승인 후 세부 구현 계획 작성

## 2026-09-26 참고 시안 글자 크기 반영

- 단계: 정적 화면 시안 수정 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 폰트 종류가 아닌 크기를 참조하도록 명확히 지시하고 적용안을 승인. 서체·색상·배치 변경 없이 공유 CSS의 본문/제목/상품명/가격과 보조 UI 크기를 조정
- 참조: `cyhuh7950/owoolmall` 원격 `main` HEAD와 로컬 HEAD가 동일한 `6cc92c0`. 참고 로컬의 기존 미커밋·미추적 자료는 수정하지 않음
- 변경 파일: `docs/design/assets/owool-static-v1.css`, `docs/design/assets/typography.test.cjs`, `docs/design/assets/README.md`, `docs/design/DESIGN.md`, `WORK_STATUS.md`
- 검증: `node --test docs/design/assets/typography.test.cjs`의 변경 전 2실패·1통과를 확인, 변경 후 3통과. 실제 브라우저 렌더링·반응형·폰트 fallback·접근성은 미검증
- 오류 횟수: 0 (예상된 테스트 RED 제외)
- 다음 조치: 신산님이 크기를 조정한 4개 정적 시안을 검토하고 승인 또는 수정 의견 제시. 클릭형 시안은 정적 승인 후 제작

## 2026-09-26 정적 시안 v1·환경 읽기 전용 조사

- 단계: 화면 시안 검토 준비·개발환경 착수 조건 확인 (제품 구현 전)
- 담당: 어울(시안·통합), 읽기 전용 병렬 조사자(환경)
- 상태: 고객 홈·결제 확인·판매자·관리자 정적 시안을 제작했으나 사용자 검토/승인 전. PMO 절차상 클릭형 시안은 아직 제작하지 않음. 환경은 DB 접속 가능, Git 기준선/WSL checkout 미준비
- 변경 파일: `docs/design/assets/owool-static-v1.css`, `home-v1.html`, `checkout-v1.html`, `seller-v1.html`, `admin-v1.html`, `README.md`, `docs/design/DESIGN.md`, `docs/DEVELOPMENT_ENVIRONMENT.md`, `WORK_STATUS.md`
- 검증: 네 HTML·CSS의 정적 문구/파일 경로 및 가상 결제 합계 확인; 제한된 셸 SSH 별칭 실패 원인을 설정 파일 접근 제한으로 확인하고 승인된 읽기 전용 SSH·Git 재시험 성공. WSL DB 조회 `shoppingmall`, checkout 없음, 원격 ref 없음
- 오류 횟수: 브라우저 파일 URL 보안 차단 1회, 제한 셸 SSH 설정 접근 거부 1회. 각 원인을 구분했으며 브라우저 정책 우회·SSH 설정 변경 없음
- 미검증: 화면 시각/반응형/접근성, 클릭형 흐름, S1~S8 실제 코드/DB/브라우저 테스트, 공통 포트 확정, 초기 Git 기준선, Oracle/PG 실연동
- 다음 조치: 사용자 정적 시안 검토 → 클릭형 제작·검토; 독립적으로 Git/포트/QA/Secret 환경 게이트 결정 및 기록

## 2026-09-26 설계서·개발 작업계획서 승인 기록

- 단계: 문서 승인 및 착수 전 조건 정리
- 담당: 어울
- 상태: 신산님이 직전 제시한 DESIGN·WORK_PLAN 초안을 `승인해`라고 승인. 범위·기술·Stage 순서 승인으로 기록하되, 아직 없는 화면 시안·미정 정책·외부 계약·Git 초기 기준선·환경 검증까지 승인한 것으로 확대하지 않음
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `docs/design/DESIGN.md`, `docs/WORK_PLAN.md`, `WORK_STATUS.md`
- 검증: 승인 요청 대상 두 문서와 승인 응답의 연결 확인, 실제 Git 무커밋·원격 미설정 상태 확인. 코드/DB/브라우저/외부 연동 시험 없음
- 오류 횟수: 0
- 미검증: 정적/클릭형 시안, 개발환경 게이트, Stage별 DB·인증·Secret·비용 승인, PG/Oracle/앱 실연동
- 다음 조치: 디자인 시안 검토와 환경 준비를 구분해 진행. S1 구현은 모든 착수 조건 충족 후 시작

## 2026-09-26 DESIGN·개발 작업계획 초안 작성

- 단계: 서면 설계·개발 계획 수립 (제품 구현 전)
- 담당: 어울
- 상태: 승인된 PRD·기술 방향을 요구 ID와 8개 개발 Stage로 나눔. 설치·Oracle 인수/배포는 개발 계획 밖에 둠
- 변경 파일: `docs/design/DESIGN.md`, `docs/WORK_PLAN.md`, `WORK_STATUS.md`
- 검증: PRD 범위와 역할·주문·정산·앱·보안·시안/환경 경계를 대조; 제품 코드/DB/브라우저 시험 없음
- 오류 횟수: 0
- 미검증: 계획 문서 신산님 검토, 실제 파일·인터페이스·테스트 명령(구현 전 고정), 환경 준비
- 다음 조치: 초안의 승인 또는 수정 의견 요청. 그 전에는 제품 구현·초기 commit·push·WSL checkout/배포 없음

## 2026-09-26 PRD·기술 초안 전체 승인 검토

- 단계: 설계 승인 전 범위·문서 정합성 검토 (제품 구현 전)
- 담당: 어울
- 상태: 현행 PRD와 기술 초안, 개발환경 문서 및 최신 직접 결정을 대조. 정산의 '계산' 표현이 최종 지급액 자동 산정으로 오해되지 않도록 초기 출시·시험 문구를 명확히 함. 문서 전체 승인 여부는 신산님 판단 대기
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 문서 내부 역할·주문 분리·통합 결제·환불·정산·개발/인수 환경 경계 대조; 주요 기술 후보의 공식 문서 확인. 제품 코드·실제 PG·외부 로그인·앱 빌드·배포 시험 없음
- 오류 횟수: 0
- 미검증: 출고 후 환불의 법률·약관, 실제 외부 연동·Oracle 환경·앱 빌드, 상세 화면 시안, 승인된 개발 작업계획과 개발환경 gate
- 다음 조치: 신산님에게 전체 범위와 기술 방향의 승인 여부를 요청. 승인 후 개발 작업계획 초안을 작성·검토하고 별도 계획 승인 전에는 구현하지 않음

## 2026-09-26 기존 론칭판 문서 선별 대조

- 단계: 현행 PRD의 참고 자료 선별 보완 (제품 구현 전)
- 담당: 어울
- 상태: 기존 설계서·작업계획서의 화면 운영·보안·복구 검증 항목 중 현행 역할·거래 구조와 충돌하지 않는 부분만 PRD 초안에 추가. 기존 완료 주장·고정 일정·기술/배포 가정은 미승계
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `WORK_STATUS.md`
- 검증: 신산님 최신 결정, 현행 PRD, 두 기존 문서의 요구·권한·환경 문구를 대조. 제품 코드·브라우저·DB·배포 테스트 없음
- 오류 횟수: 0
- 미검증: 상세 화면 시안, 이미지 제한값·검사 방식, 실제 백업/복원/복귀, PG·Oracle·외부 계정 연동 및 사용자 인수
- 다음 조치: 신산님이 선별 반영 항목과 현행 설계 초안을 검토. 승인된 설계·작업계획 및 개발환경 gate 전 구현·push·배포 없음

## 2026-09-26 잔여 설계 권장안 일괄 채택

- 단계: PRD·기술·인수 시나리오 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 제시한 11개 잔여 질문의 권장안을 모두 채택. 동일 농가 완료 정산 기간 중복 금지, 어울몰 발송 농가 생산품의 생산 농가 정산 근거 유지, 출고 전 일부 취소 시 새 배송비 미부과, 통합 할인 비례 배분, 출고 오류 이력 정정, 재고 증가·품절 해제 승인, 마감 후 다음 출고 가능일 안내, 가상 QA 값, 출고 후 환불 사유별 법률 검토, 임시 시안·핵심 인수 시나리오, 변경 가능한 시험 응답 기한을 반영
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `docs/DEVELOPMENT_ENVIRONMENT.md`, `WORK_STATUS.md`
- 검증: 신산님 최신 지시와 11개 권장안·현행 설계 문구 대조; 제품 코드·DB·브라우저·외부 연동 테스트 없음
- 오류 횟수: 1회(기존 문구가 이미 변경되어 보완 patch 문맥 불일치; 실제 문구 확인 후 필요한 참고 문서만 수정)
- 미검증: 출고 후 환불·반송비의 법률·약관 적합성, 실제 PG 부분 환불, 실가격·배송사·브랜드·Oracle·외부 로그인/문자/메일/앱 빌드와 사용자 인수
- 다음 조치: 신산님이 PRD·기술 초안을 검토하고 범위·시안·개발 작업계획 승인 여부를 결정. 승인 전 제품 구현·원격 push·WSL 배포 없음

## 2026-09-26 농가별 정산 완료 개별 표시 확정

- 단계: 정산 완료 단위 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 선택 기간의 정산 완료를 농가별로 개별 표시하도록 결정. 한 농가의 완료가 다른 농가의 완료 상태를 바꾸지 않음
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 정산 완료 단위·인수 시나리오 문구 대조; 제품 코드·DB·브라우저 테스트 없음
- 오류 횟수: 0
- 미결정: 동일 농가에 완료 기간과 겹치는 새 기간을 선택했을 때의 처리
- 다음 조치: 완료된 기간과 겹치는 기간의 중복 정산 허용 여부를 한 질문으로 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 관리자 선택 기간별 농가 정산 확정

- 단계: 정산 기간 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 매월 고정 기간 대신 관리자가 시작일·종료일을 선택해 농가별 항목 합계를 조회하고 정산 완료를 기록하는 방식을 선택
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 정산 기간·인수 시나리오 문구 대조; 제품 코드·DB·브라우저 테스트 없음
- 오류 횟수: 0
- 미결정: 완료 대상 농가의 묶음 방식, 동일 농가 기간 중복 처리 기준
- 다음 조치: 정산 완료 처리 대상을 농가별로 할지 전체 농가 일괄로 할지 한 질문으로 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 동일인의 판매자 요청·관리자 승인 이력 분리

- 단계: 승인 권한·감사 이력 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 동일 담당자의 판매자 요청과 관리자 승인을 별도 권한·이력으로 기록하는 방식을 선택. 요청만으로 자동 승인하지 않고, 각 역할로 별도 행위를 수행해야 고객 화면에 반영
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 역할·승인·인수 시나리오 문구 대조; 제품 코드·감사 로그·브라우저 테스트 없음
- 오류 횟수: 0
- 미검증: 실제 역할 전환·요청·승인 권한과 감사 기록
- 다음 조치: 남은 출고 후 환불 기준, 정산 기간 등 업무 규칙을 하나씩 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 실제 출고·운송장 즉시 고객 공개 예외 확정

- 단계: 판매자 승인 흐름·배송 안내 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 신산님의 '권장대로'를 앞서 제안한 실제 출고·운송장 즉시 고객 표시 예외 승인으로 해석. 농가·어울몰 판매자 모두 담당 주문에 동일 절차 적용. 그 밖의 판매자 제안은 관리자 승인 후 고객 공개
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 지시와 출고·고객 공개·인수 시나리오 문구 대조; 제품 코드·브라우저 테스트 없음
- 오류 횟수: 0
- 미결정: 출고 입력 오류·지연 시 고객 취소 안내의 예외 처리, 동일인이 판매자 제안을 관리자 역할로 승인할 수 있는지
- 다음 조치: 동일인의 판매자 요청·관리자 승인 허용 여부를 한 질문으로 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 어울몰·농가 판매자 동일 절차와 관리자 정산 책임

- 단계: 역할·업무 책임 설계 정정 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 실제 어울몰 판매자와 관리자가 동일인이어도 시스템에서는 다른 역할처럼 취급하고, 어울몰 판매자는 농가 판매자와 동일한 판매자 처리를 수행한다고 명시. 농가 정산 완료 기록의 주체는 관리자임을 명시
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 역할·출고·정산 문구 대조; 제품 코드·권한·브라우저 테스트 없음
- 오류 횟수: 0
- 미결정: 같은 실제 사람이 판매자 제안을 관리자 역할로 승인할 수 있는지, 실제 출고와 고객 공개 사이의 취소 가능 상태
- 다음 조치: 동일인의 판매자 요청·관리자 승인 허용 여부를 한 질문으로 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 판매자 역할 단일화 정정

- 단계: 역할 모델 설계 정정 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 역할은 고객·판매자·관리자 세 가지이며 농가와 어울몰은 동일한 판매자라고 명시. 앞서 두 판매자를 별도 역할로 적은 현행 PRD·기술·참고 대조 문구를 정정하고, 담당 상품·주문 범위만 구분
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 현행 역할 정의 문구 대조; 제품 코드·권한 테스트 없음
- 오류 횟수: 0
- 미검증: 판매자별 담당 범위의 실제 접근 통제, 상세 편집 권한
- 다음 조치: 판매자 공통 업무와 담당 범위의 미결정 항목을 하나씩 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 어울몰 판매자의 포장·출고·운송장 업무 확정

- 단계: 판매자·배송 업무 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 어울몰 발송 주문의 포장·출고 처리와 운송장 입력을 어울몰 판매자 업무로 확정. 고객 화면 공개는 기존 관리자 승인 원칙에 따라 구분
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 역할·배송 조회 문구 대조; 제품 코드·브라우저 테스트 없음
- 오류 횟수: 0
- 미결정: 실제 출고와 고객 공개 사이의 배송 안내 및 취소 가능 상태, 농가 판매자의 출고·운송장 업무 범위
- 다음 조치: 실제 출고 정보의 고객 공개 승인 대기 범위를 한 질문으로 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 어울몰 판매자의 발송 상품 재고 직접 관리

- 단계: 판매자 권한 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 어울몰 판매자의 어울몰 발송 상품 재고 직접 관리를 확정. 농가 직접 발송 상품은 해당 농가 판매자가 관리하는 역할 구분을 유지
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 역할·재고·인수 시나리오 문구 대조; 제품 코드·권한·브라우저 테스트 없음
- 오류 횟수: 0
- 미검증: 실제 역할별 재고 변경 통제와 재고 0개 즉시 구매 차단
- 다음 조치: 어울몰 판매자의 나머지 업무 권한을 한 항목씩 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 품절·재고 0개 즉시 구매 차단 확정

- 단계: 판매 승인 흐름 예외 설계 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 재고 0개·품절 상황에서 관리자 승인까지 구매를 계속 허용하지 않기로 결정. 해당 상품·옵션 구매는 즉시 차단하고 고객에게 판매 불가로 표시; 판매자의 다른 고객 화면 변경은 관리자 승인 후 공개
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 PRD·기술 초안·참고 시나리오 문구 대조; 실제 재고 동시성·주문·브라우저 시험 없음
- 오류 횟수: 0
- 미검증: 실제 재고 0개 전환과 결제 직전 검증, 어울몰 판매자의 상세 편집 권한
- 다음 조치: 판매자—어울몰의 업무·편집 권한을 한 항목씩 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 판매자 제안의 관리자 승인 후 고객 공개 원칙

- 단계: 역할·승인 흐름 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 농가·어울몰 판매자의 고객 화면 반영 제안은 관리자 승인 후에만 공개. 승인 전에는 기존 승인 내용 유지. 기본 배송비·무료배송 기준 변경도 동일 원칙 적용
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 PRD·기술 초안·참고 시나리오 문구 대조; 제품 코드·브라우저 테스트 없음
- 오류 횟수: 0
- 미결정: 재고 소진·품절의 즉시 판매 차단도 관리자 승인을 기다릴지 여부, 어울몰 판매자의 상세 편집 권한
- 다음 조치: 품절·판매 차단의 승인 대기 예외를 한 질문으로 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 고객·판매자·관리자 역할 분리와 농가 배송비 승인

- 단계: 역할·배송 정책 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 고객, 판매자—농가, 판매자—어울몰, 관리자를 별도 역할로 기록. 기존 '농가관리자'는 농가 판매자, '전체 관리자'는 관리자에 대응. 어울몰 판매자 세부 권한은 아직 미정. 농가 판매자의 자기 농가 기본 배송비 변경 요청도 관리자 승인 후 적용하며 승인 전에는 기존 기준 유지
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `WORK_STATUS.md`
- 검증: 신산님 최신 지시와 역할·배송비 문구 대조; 제품 코드·권한·브라우저 테스트 없음
- 오류 횟수: 0
- 미검증: 역할별 실제 접근 통제, 배송비 변경 승인 흐름, 어울몰 판매자 상세 권한
- 다음 조치: 어울몰 판매자의 업무·편집 권한을 한 항목씩 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 농가 무료배송 기준 변경 승인 절차 확정

- 단계: 배송 설정 권한 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 농가관리자의 자기 농가 무료배송 기준 변경은 전체 관리자 승인 후 적용. 승인 전에는 기존 기준 유지, 승인 후에도 자기 농가 발송 주문에만 적용
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 배송 설정·인수 시나리오 문구 대조; 제품 코드·브라우저 테스트 없음
- 오류 횟수: 0
- 미검증: 승인 요청·승인·적용의 실제 권한 및 계산 시험
- 다음 조치: 다른 배송 설정 항목의 농가관리자 변경 승인 범위를 항목별로 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 무료배송의 할인 전 상품금액 기준 확정

- 단계: 배송 정책 설계 보완 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 각 발송 주문의 5만 원 무료배송 여부를 할인 적용 전 상품금액으로 판정하도록 결정. 할인 후 결제금액이 5만 원 미만이어도 할인 전 상품금액이 기준 이상이면 무료배송
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `WORK_STATUS.md`
- 검증: 신산님 최신 지시와 문서의 배송 정책·인수 시나리오 문구 대조; 제품 코드·브라우저 테스트 없음
- 오류 횟수: 0
- 미검증: 실제 할인·배송비 계산 구현과 통합 결제 시험
- 다음 조치: 남은 관리자별 설정 권한과 출고 후 환불 기준 등을 한 항목씩 확인; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 출고 전 적법한 취소의 배송비 환불 기준 변경

- 단계: 환불 정책 설계 정정 (제품 구현 전)
- 담당: 어울
- 상태: 신산님 승인에 따라 출고 전 적법한 주문 취소는 해당 발송 주문의 상품금액과 실제 결제 배송비를 모두 환불하도록 PRD와 참고 자료 대조 문서를 정정. 통합 결제의 다른 발송 주문은 유지
- 근거: 현행 전자상거래법 제17조·제18조·제35조 대조. 배송 전 배송비 일률 미환급은 법적 위험이 있어 기존 결정을 대체
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 문서의 현행 규칙 대조; 제품 코드·PG·브라우저 테스트 없음
- 오류 횟수: 0
- 미검증: 출고 후 사유별 배송비·반송비 기준의 법률·약관 적합성, PG 부분 환불 구현 가능 범위
- 다음 조치: 출고 후 환불 세부 기준을 법률·약관 검토 후 별도로 확정; 설계·작업계획 승인 전 제품 구현 없음

## 2026-09-26 현행 설계 우선순위 확정

- 단계: 설계 자료 우선순위 정정 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 현재 설계가 최신이고 `D:\Project\shoppingmall` 및 `cyhuh7950/owoolmall`은 참고사항이라고 명시. PRD와 참고 자료 대조 문서의 기존 시안 승계 뉘앙스를 제거
- 추가 정리: 기존 참고 시안만 근거로 PRD에 더했던 운영 대시보드 필수 문구를 제거. 현행 PRD에 이미 있는 관리자 관리·운영 요구는 유지
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 현행 PRD·참고 대조 문구 비교; 제품 코드·브라우저 테스트 없음
- 오류 횟수: 0
- 다음 조치: 현행 PRD를 기준으로 설계·시안 검토를 진행하고 참고 자료는 필요할 때 선택적으로만 사용

## 2026-09-26 GitHub 기존 디자인 시안 확인 정정

- 단계: 설계 참고 자료 대조 (제품 구현 전)
- 담당: 어울
- 상태: 신산님 지적에 따라 `cyhuh7950/owoolmall` 원격 커밋에 3역할 HTML/CSS 화면 시안이 이미 있음을 확인. PRD의 '임시 시안' 설명을 기존 시안 참조로 정정
- 근거: 원격 `main` HEAD `6cc92c0`; 같은 커밋의 `index.html`, `seller.html`, `operator.html`, `styles.css`를 읽기 전용 확인. A/B/C 테마 전환은 로컬 미커밋 diff에만 있음
- 변경 파일: `docs/PRD.md`, `docs/design/REFERENCE_REVIEW.md`, `WORK_STATUS.md`
- 검증: Git 트리·커밋 내용과 로컬 dirty diff 비교; 브라우저 시각 검토·시안 승인·제품 코드 테스트는 미실행
- 오류 횟수: 0
- 다음 조치: 기존 원격 시안을 새 농산물 어울몰의 임시 디자인 기준으로 검토하되, 최신 역할·주문·환불·정산 결정에 맞게 변경할 부분을 설계 승인 대상으로 제시

## 2026-09-26 기존 어울몰 자료 설계 참조와 환불 기준

- 단계: 기존 자료 대조·PRD 초안 보강 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 `D:\Project\shoppingmall` 및 `cyhuh7950/owoolmall` 참조를 요청. 역할별 화면 정보구조와 업무 시나리오를 현행 PRD에 참고안으로 반영. 출고 전 취소를 포함한 환불은 상품금액만 돌려주고 배송비는 제외한다는 직접 결정을 반영
- 확인: 참고 로컬 repo `main` HEAD `6cc92c0`, 원격 SSH 별칭 `github-cyhuh7950` 조회의 `main`·HEAD도 동일. 참고 로컬의 수정·미추적 파일은 그대로 보존. 기존 정적 시안은 `localStorage`·샘플상품·고정 PIN `0000`·3.5% 정산 예시 등을 사용함을 확인
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `docs/DEVELOPMENT_ENVIRONMENT.md`, `docs/design/REFERENCE_REVIEW.md`, `WORK_STATUS.md`
- 검증: 문서·소스 읽기 전용 대조 및 최신 신산님 결정과의 충돌 분류. 제품 코드·브라우저·서버 기능 테스트는 수행하지 않음
- 오류 횟수: 최초 GitHub HTTPS·다른 별칭 조회 실패 각 1회(인증·설정 변경 없음); 제공된 `github-cyhuh7950` 별칭으로 원격 조회 성공
- 미검증: 참고 시안의 실제 브라우저 시각 품질과 기능 동작, 환불 시 배송비 미반환 정책의 법률·약관 적합성, 새 설계·시안 승인
- 다음 조치: 신산님이 참고 화면의 정보구조 채택 범위와 환불 정책의 운영 검토 경계를 확인. 승인된 DESIGN·WORK_PLAN·개발환경 gate 전 제품 구현 없음

## 2026-09-26 농가관리자 변경 범위 확인

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 농가관리자의 상품·재고·배송 설정 변경은 자기 농가 상품·주문에만 적용한다고 확인. 기존 전체 관리자 우선 원칙은 유지
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 역할·배송 권한 문구 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 역할별 정확한 편집 항목, 출고 전 취소의 배송비 처리, 할인 전후 무료배송 판정
- 다음 조치: 출고 전 주문 취소의 배송비 처리 여부를 한 질문으로 확인

## 2026-09-26 환불 시 배송비 제외

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 환불액에 배송비를 포함하지 않도록 지정. PRD 품질·배송 및 미결정 경계에 반영
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 사용자 최신 지시와 주문별 배송비·환불 요구 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 출고 전 취소에도 배송비를 환불하지 않는지, 할인 적용 전후 무료배송 판정, 농가관리자 설정 범위
- 다음 조치: 출고 전 주문 취소의 배송비 처리 기준을 한 질문으로 확인

## 2026-09-26 과거 판매·정산 후 환불의 발생 시점 기록 예시

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님 예시를 5월 1일 판매·5월 20일 정산·7월 1일 환불로 해석. 환불은 7월 1일 발생 내역에 기록하고 5월 1일 판매 주문·상품을 근거로 연결; 5월 완료 정산은 소급 수정하지 않음
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 사용자 날짜 예시와 정산 이벤트 발생 시점 원칙 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미검증: 실제 주문·환불 데이터와 통합 시험, 정산 기간 선택 방식
- 다음 조치: 환불 추적 시나리오를 설계·작업계획의 수용 기준에 포함하고 이후 실제 테스트로 검증

## 2026-09-26 운영 후 자동 정산·송금과 늦은 환불 귀속

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 초기 자동 정산·송금 제외, 일정 기간 운영 뒤 자동 정산 방식 결정 및 자동 송금 후속 개발을 지정. 완료 기간 뒤 발생한 환불은 환불 발생 시점에 기록하도록 확정
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 지시 3건을 Phase 1/후속 범위와 정산 시점 규칙에 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 초기 정산 기간 선택 방식·완료 대상 범위. 어울몰 담당자 입력은 완료 여부만으로 한정하며 최종 지급액 결정·송금은 오프라인. 후속 자동 정산·송금의 기간·연동·비용은 실제 운영 후 결정
- 다음 조치: 초기 수동 정산 흐름의 남은 입력·자료 범위를 한 항목씩 확인. 후속 자동 송금은 현재 개발·인수 전 검증 범위에 포함하지 않음

## 2026-09-26 정산 항목 발생 시점 기준 확인

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 수수료·배송비·할인·환불액을 각각의 발생 시점별로 정리하도록 명시. 일자별 조회·기간별 합계 요구와 연결해 PRD·기술 초안에 반영
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 사용자 최신 지시와 기간별 정산 요구 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 완료된 기간 이후 발생한 환불의 귀속, 오프라인 최종 지급액의 시스템 입력 여부
- 다음 조치: 완료 기간 이후 발생한 환불의 정산 귀속을 한 질문으로 확인

## 2026-09-26 농가 정산 비용 부담 판단 범위 정정

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 수수료·배송비·할인·환불액의 농가/어울몰 부담 판단과 가감 규칙은 시스템 업무범위 밖이며 오프라인에서 결정한다고 명시. PRD·기술 초안의 자동 최종 지급액 계산 해석을 제거
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 일자별·기간별 집계 요구를 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 오프라인 최종 지급액을 시스템에 입력·보관할지, 정산 기간 선택·완료 처리 대상 범위
- 다음 조치: 오프라인 결정 최종 지급액의 시스템 입력 여부를 한 질문으로 확인

## 2026-09-26 외부 연동 실제 검증 범위 결정 시점

- 단계: 제품 설계·검증 범위 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 카카오·Apple 로그인, 문자·메일, 앱 빌드 등의 실제 연동 검증 범위를 인수테스트 시점에 결정하도록 지정
- 변경 파일: `docs/TECH_STACK_PROPOSAL.md`, `docs/DEVELOPMENT_ENVIRONMENT.md`, `WORK_STATUS.md`
- 검증: 사용자 최신 지시와 기술·환경 문구 대조; 실제 Provider·앱 빌드 시험 미실행
- 오류 횟수: 문서 패치의 문맥 불일치 1회, 파일 재확인 후 범위를 좁혀 반영
- 미검증: 실제 로그인 Provider·문자·메일·앱 빌드. 모의시험 결과를 실제 연동 PASS로 표시하지 않음
- 다음 조치: 인수테스트 준비 시 실제 검증 범위·필요 계정·비용·일정을 신산님과 결정. 그 전에는 승인된 설계·계획에 따라 가능한 독립 개발·모의시험 진행

## 2026-09-26 농가 정산 일자·기간 집계 요구

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 수수료·배송비·할인·환불액을 포함한 일자별 관리와 기간별 전체 금액 정산을 지정. 농가별 일자 자료 및 기간 집계 요구를 PRD·기술 초안에 반영
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 사용자 최신 지시와 기존 정산·환불 범위 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 각 항목의 가산·차감 및 부담 주체, 일자 기준, 정산 기간 선정 방식
- 다음 조치: 수수료·배송비·할인·환불액이 모두 농가 지급액에서 차감되는지 한 질문으로 확인

## 2026-09-26 관리자 설정 우선순위 확인

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 전체 관리자 설정 우선, 전체 관리자·농가관리자 설정 권한 분리를 지시. PRD에 우선순위 반영
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 기존 관리자 권한·배송·환불 정책 문구와 사용자 최신 지시 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 관리자별 구체적인 설정 항목·적용 범위, 통합 결제 중 일부 주문 환불 방식, 무료배송 할인 전후 판정
- 다음 조치: 농가관리자의 설정 범위가 자기 농가에 한정되는지 한 질문으로 확인

## 2026-09-26 주문별 기본 배송비 확인

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 무료배송 기준 미달 발송 주문마다 기본 배송비 3,000원을 각각 부과하도록 확인
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 사용자 답변과 PRD 배송비 규칙 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 무료배송 금액의 할인 전후 판정 기준, 관리자별 배송 설정 우선순위
- 다음 조치: 쿠폰·할인 적용 전후 중 무료배송 판정 금액을 한 질문으로 확인

## 2026-09-26 무료배송 주문별 적용 확인

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 5만 원 무료배송 기준을 나뉜 발송 주문 각각의 금액에 적용하도록 선택
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 사용자 지시와 PRD 배송 정책 문구 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 기본 배송비 3,000원의 주문별 부과 방식, 할인 전후 무료배송 판정 금액, 관리자별 설정 우선순위
- 다음 조치: 무료배송 기준 미달 주문마다 기본 배송비를 부과할지 한 질문으로 확인

## 2026-09-26 시점별 완료 기록 후 시스템 정산 처리

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 어울몰 담당자가 시점별 정산 완료 여부를 기록하면 시스템이 정산 처리하도록 명시. PRD·기술 초안의 단순 완료 기록 표현을 수정
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 사용자 최신 지시와 두 문서의 정산 동작 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 완료 처리 대상 주문 범위와 정산 시점 선정 방식, 비용 부담 기준, 자료 다운로드 형식
- 다음 조치: 제안한 정산 흐름을 구체적 예로 신산님께 확인. 고정 주기 선택은 요구하지 않음

## 2026-09-26 정산 완료 여부 기록 범위 정정

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 어울몰 담당자의 정산 회차별 완료 여부 기록은 필요하다고 명시. 실제 송금은 시스템 밖에서 하며 자동 송금·이체 상세정보 관리는 제외
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 최신 직접 지시와 PRD·기술 초안 정산 범위를 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 정산 회차의 주기, 자료 다운로드 형식, 수수료·배송비·환불 부담 기준
- 다음 조치: 정산 회차를 어떤 주기로 묶을지 한 질문으로 확인

## 2026-09-26 농가 정산 자료 범위 정정

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 실제 송금은 어울몰 담당자가 시스템 밖에서 수행하고, 어울몰 시스템은 필요한 자료만 준비한다고 바로잡음. 앞서 임의로 포함했던 이체 완료 기록·지급 상태 관리를 현행 PRD·기술 초안에서 제외
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 사용자 최신 직접 지시와 정산 기능 범위 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 정산 자료의 제공 형태, 정산 주기·비용 부담 기준
- 다음 조치: 필요한 자료를 관리자 화면에서 조회만 할지 파일로도 내려받을지 한 질문으로 확인

## 2026-09-26 농가 정산 자동 송금 제외

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 농가 송금 자동화를 개발 범위에서 제외. 정산액 계산·확정·내역 관리와 외부 수동 이체 완료 기록을 PRD·기술 초안에 반영
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 사용자 지시와 정산 범위 문구 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 정산 주기와 비용 부담 기준, 통합 결제 주문별 배송비·무료배송 계산 단위
- 다음 조치: 정산 주기를 신산님께 한 질문으로 확인

## 2026-09-26 환불·농가 정산 책임 확인

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 고객 환불은 어울몰에서 결정·처리하고, 어울몰이 농가와 정산한다고 명시. PRD에 농가관리자의 기준 설정 권한과 어울몰의 개별 환불 결정·처리 권한을 구분해 반영
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 이전의 관리자별 환불 기준 설정 지시 및 농가 정산 요구와 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 실제 계좌 송금 자동화 여부, 환불 비용 부담 주체와 정산 조정 규칙, 농가관리자 기준 설정 범위·우선순위
- 다음 조치: 정산 모듈의 실제 계좌 송금 실행 범위를 한 질문으로 확인

## 2026-09-26 농가별 주문 분리 확인

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 서로 다른 농가의 직접 발송 상품은 농가별 주문으로 분리하도록 지정. 기존 한 번의 통합 결제 선택 유지
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 장바구니·주문·결제 규칙을 최신 직접 지시와 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 주문별 배송비·무료배송 계산 단위, 통합 결제 부분취소, 농가 정산의 실제 송금 실행 범위
- 다음 조치: 농가 정산 모듈이 실제 계좌 송금까지 실행해야 하는지 한 질문으로 확인

## 2026-09-26 농가 정산 모듈 추가 요청

- 단계: 제품 설계 범위 확장 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 어울몰→농가 금액 정산 모듈을 요청. PRD의 Phase 1과 기술 초안에 제안 요구로 반영
- 변경 파일: `docs/PRD.md`, `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 기존 주문·취소·환불·정산 관련 문구와 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 정산액 계산·확정·내역 관리만 할지, 실제 농가 계좌 송금까지 모듈이 실행할지; 주기·수수료·배송비/할인 부담 주체·권한
- 다음 조치: 실제 송금 실행 범위를 신산님께 한 질문으로 확인. PG 계약·요금 및 Oracle 환경 결정은 기존대로 인수테스트 시점에 유보

## 2026-09-26 통합 결제 선택

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 분리된 주문을 고객이 한 번에 통합 결제하도록 선택
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: PRD 주문·결제 요구와 사용자 선택 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 여러 농가의 발송 주문 분리 기준, 배송비 계산 단위, 통합 결제의 부분취소·환불 방식
- 다음 조치: 서로 다른 농가의 직접 발송 상품을 함께 살 때 주문을 농가별로 나눌지 확인

## 2026-09-26 장바구니·주문 분리 방식 선택

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 두 발송 방식의 상품을 장바구니에는 함께 담되 결제 시 주문을 나누도록 선택
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 장바구니·주문·출고 규칙을 사용자 답변과 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 분리 주문의 결제 횟수, 여러 농가의 농가 발송 상품 분리 기준, 배송비·무료배송 계산 단위
- 다음 조치: 분리 주문을 고객이 한 번에 결제할지 별도로 결제할지 한 질문으로 확인

## 2026-09-26 브랜드 자료 확인

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 현재 확정된 로고·색상 자료 없음. 신산님이 임시 시안으로 진행하도록 지정
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 사용자 답변을 PRD 원칙·미결정 사항에 반영; 시안 제작·검토는 아직 수행하지 않음
- 오류 횟수: 0
- 미결정: 실제 시안과 사용자 인수테스트 시나리오, 혼합 금지 장바구니 처리 방식
- 다음 조치: 장바구니에서 발송 방식이 다른 품목을 선택할 때의 처리 방식을 한 질문으로 확인

## 2026-09-26 발송 방식 혼합 금지 확인

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 어울몰 발송과 농가 발송은 혼합하지 않는다고 명시. 동일 주문 혼합 금지로 PRD 초안에 반영
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 사용자 지시와 PRD 문구 대조; 제품 코드 테스트 없음
- 오류 횟수: 0
- 미결정: 두 발송 방식의 상품을 장바구니에 함께 담을 때 차단할지, 결제 시 별도 주문으로 나눌지
- 다음 조치: 장바구니 처리 방식을 한 질문으로 확인

## 2026-09-26 사용자 운영 규칙 추가

- 단계: 제품 설계 질의 (제품 구현 전)
- 담당: 어울
- 상태: 신산님이 사용자 역할 3종, 초기 품목 5종, 품목별 출고 방식, 재고·배송·환불 설정 권한을 직접 지정; PRD 초안에 반영
- 변경 파일: `docs/PRD.md`, `WORK_STATUS.md`
- 검증: 신산님 원문과 PRD 반영 항목 대조; 제품 코드·런타임 테스트 대상 없음
- 오류 횟수: 0
- 미결정: "혼합은 없음"의 주문 단위 의미, 관리자별 설정 범위·우선순위, 실제 옵션·가격·재고, 브랜드 자료·인수 시나리오
- 다음 조치: 화면·인수 기준의 뜻을 비개발자 관점에서 설명하고, 남은 모호성은 한 번에 하나씩 확인. 설계·작업계획 승인 전 구현하지 않음

## 2026-09-26 개발 DB 생성 전 기록

- 단계: 개발환경 지정 (구현 전)
- 담당: 어울
- 상태: 신산님의 직접 요청에 따라 개발·통합시험용 DB 준비 중
- 대상: `WSL-server` (`SINSAN`)의 정확한 `local-postgres` 컨테이너 안 `shoppingmall` 데이터베이스
- 이유: 어울몰 전용 개발·통합시험 데이터 격리
- 수명·정리: 개발과 인수 전 검증 동안 유지. 다른 DB·컨테이너는 변경하지 않으며 DB 삭제는 별도 결정 후 수행
- 사전 검증: 컨테이너 실행 확인, `shoppingmall` DB 부재 확인
- Git: 로컬 `master` 무커밋·원격 미설정; 기존 `docs/`, `WORK_STATUS.md`는 보존
- 미검증: GitHub 원격 이력, WSL checkout, 애플리케이션 연결·스키마·테스트 계정
- 다음 조치: 요청된 DB만 생성·접속 검증하고 환경 문서에 결과 기록

## 2026-09-26 개발환경 확인 결과

- 단계: 설계·개발환경 준비 (제품 구현 전)
- 담당: 어울
- 상태: `shoppingmall` DB 생성·접속 확인. 개발 착수 조건은 미충족
- 변경 파일: `WORK_STATUS.md`, `docs/DEVELOPMENT_ENVIRONMENT.md`, `docs/TECH_STACK_PROPOSAL.md`
- 검증: `WSL-server` 접속, 정확한 `local-postgres` 실행, DB `shoppingmall` 접속 결과 확인; GitHub SSH URL의 `ls-remote` 성공(조회 ref 없음); WSL 지정 checkout 경로 부재 확인
- 오류 횟수: 0
- 미검증: 앱 DB 접속·스키마·migration, WSL 통합 환경, 테스트 계정·상품·주문, PG sandbox·실연동, Oracle 환경·인수테스트
- 승인 경계: 제품 설계·개발 작업계획 승인 전 구현 없음. GitHub 초기 커밋·push, WSL checkout 구성도 아직 하지 않음
- 다음 조치: 신산님이 남은 상품·배송·교환환불 정책을 항목별로 결정할 수 있게 설명하고 PRD/기술 초안 검토 요청. 설계·작업계획을 확정한 뒤 개발환경 gate와 구현 순서를 진행

## 2026-09-26 기술 스택 초안

- 단계: 설계·기술 선택 (구현 전)
- 담당: 어울
- 상태: 신산님의 항목별 선택을 기술 초안에 반영; 문서 전체 검토 대기
- 변경 파일: `docs/TECH_STACK_PROPOSAL.md`, `WORK_STATUS.md`
- 검증: 기술 선택 22개 핵심 표기 확인, PRD 배송 조회 요구와 대조, 상충하던 다중 PG 비교 문구 제거; 제품 코드 테스트 대상 없음
- 오류 횟수: 0
- 미검증: 외부 서비스 계약·요금·실제 연동, Oracle 서버·관리형 DB 환경, 앱 빌드, 운영 배포
- 다음 조치: 신산님이 기술 초안을 검토하고 수정 또는 승인 여부 결정. 승인해도 구현·계정 개설·배포는 별도 범위로 다룸
