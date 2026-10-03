# 어울몰 개발·시험 환경 (초안)

## 2026-10-04 최신 상태 — S3.2 격리 화면·DB 검증, 공유 DB 0011 승인 대기

- `codex/s31-checkout-reservation-plan@a109758c33ab363291b3af096e4f47df54b72fe0`을 지정 SSH 별칭으로 WSL 시험 checkout에 맞췄다. 0011의 **수정된** SQL SHA-256 `75675ca05c8e55e3f0d8ecc7cba5ada64c304372adbde9d1bface5e82850c330`을 별도 tmpfs PostgreSQL의 빈 `/shoppingmall`에 0000~0011까지 적용했다. 관리자 등록·직접 발행·새 버전·중지와 구매자 목록/코드 쿠폰을 실제 production Web 브라우저에서 확인했다. 기본 49,000원에서 상품 할인 5,000원·배송비 지원 3,000원 적용 시 예상액 41,000원이며 결제는 아니다. 390px 가로 넘침 없음과 Tab 초점 이동, 예약 해제·장바구니 편집/제거도 확인했다. 실제 3발송 쿠폰 화면 및 200% 브라우저 확대는 미검증이다.
- 격리 DB 전체 회귀 첫 시도는 시험 프로세스가 `API_HOST=0.0.0.0`을 상속하여 루프백 전용 모의 전화/이미지 시험 6건이 실패했다. 시험 프로세스만 `API_HOST=127.0.0.1,NODE_ENV=test`로 재실행해 전체 종료 코드 0; 별도 PR 검사 8 pass. 로컬은 278건/211 pass/67 DB·환경 skip/0 fail, PR 검사 8 pass, typecheck/lint/build 성공. QA ID `b83f3204` 행을 reset한 뒤 13범주 0, 지정 임시 컨테이너 3개·전용 네트워크·SSH 포트 잔류 0, WSL checkout clean을 확인했다. 상세 오류·제약은 `WORK_STATUS.md`를 따른다.
- 공유 개발 DB `local-postgres/shoppingmall`은 **읽기 전용 확인만** 했으며 이력 11건·계정/예약 0건이다. 0011은 아직 적용하지 않았다. 별도 승인 후 적용·공유 DB 전체 검증을 수행해야 한다. 아래 2026-10-03 기록은 시점별 이력이며 최신 상태 판단에는 이 절을 우선한다.

## 2026-10-03 최신 상태 — 공유 개발 DB 0010 적용 완료

- S3.2 Task 1·2 진행 현황: 신산님이 S3.2 공개 API 7개·신규 프로모션 테이블 5개·0011 migration의 **구현**을 승인했다. 첫 격리 적용 체크포인트 `b854ee1b2b8bc6aafff47aca40a8cdf482fb0d8b`의 SQL SHA-256은 `8a16344acc0098535beb28253f231614c3912a02873670598fafa408c7d86e79`였고, 완전히 분리된 일회용 PostgreSQL에서 0000~0011 전량 재현(12건), schema/repository 2 pass·0 skip, 전체 실DB 순차 269건/262 pass/7 환경 skip/0 fail, QA 계정·상품·예약·프로모션·감사 0을 확인했다. 임시 컨테이너·두 임시 DB는 제거했다. **후속 수정:** Task 3의 직접 발행 멱등계약을 위해 동일 0011 신규 grant 테이블에 `idempotency_key`와 유일 제약을 추가했다. 수정 SQL SHA-256은 `75675ca05c8e55e3f0d8ecc7cba5ada64c304372adbde9d1bface5e82850c330`이며 새 격리 재검증 전이므로 이전 PASS를 수정본의 PASS로 대체하지 않는다. 공유 `local-postgres/shoppingmall`은 첫 버전 read-only 미리보기에서 11건 적용·0011 1건/30문장 대기, 계정/예약 0, 신규 관계 부재였고 **0011을 적용하지 않았다**. 변경된 SQL의 공유 DB read-only 미리보기와 새 격리 적용을 다시 확인해야 한다. 공유 DB 적용은 별도 승인받는다. 관리자/고객 API·실제 발행/결제/Oracle/UAT는 미완료다.

- S3.2 내부 계산 커밋 `3b51f6ae1665d6e4ff32d7bc04b1f33a5913fa0b`에서 로컬 257건/195 pass/62 DB·환경 skip/0 fail, WSL exact SHA 공유 DB 전체 순차 257건/250 pass/7 환경 skip/0 fail. 시험 후 QA 9범주·일회용 Node 컨테이너 0, migration 11·WSL clean. 할인/배송비 지원은 아직 내부 순수 계산뿐이며 실제 프로모션·고객 결제금액/API/DB 계약은 미구현이다.
- WSL 지정 checkout exact SHA `c4fc056435aa546c8cb9c40df697758084a139c2`에서 공유 DB 전체 순차 시험 **250건/243 pass/7 환경 skip/0 fail**, exit 0. 사후 QA 9범주 모두 0, migration 11, 시험용 Node 컨테이너 0, checkout clean; 새 DB/볼륨/포트/백업 없음. 로컬 250건/188 pass/62 DB·환경 skip/0 fail, PR 본문 8 pass, typecheck/lint/build 성공. 실제 영속 주문/통합 결제·Oracle/UAT는 이 결과에 포함되지 않는다.
- 리뷰 보정 제품 SHA `feb5dc7`의 다판매자 상품명 구분·시험 정리 보강 후 QA ID `b83f1005`를 실제 Chrome에서 재검증했다. 첫 실패는 고유 QA 접두어를 빠뜨린 테스트 기대값 때문이었고 이를 고쳐 3발송 묶음의 상품명·상품금액·배송비·소계 및 장바구니 5개 제거가 PASS였다. 같은 ID reset 뒤 공유 DB 9범주 0, migration 11건, 지정 컨테이너/볼륨/암호 파일·Windows 터널/Chrome 프로필 0, WSL checkout clean. 영속 주문/통합 결제/Oracle/UAT는 검증되지 않았다.

- `70db095` 추가 검증: WSL 공유 DB exact SHA의 고객 HTTP 경계 시험 1 pass, 전체 순차 249건/242 pass/7 조건부 skip/0 fail. 실제 Chrome에서는 가상 고추·고춧가루·양파·마늘·블루베리 5상품이 직접 판매자 A/B+어울몰 발송 3개 견적 묶음(97,000+배송 9,000=106,000원)으로 표시됐다. 모든 QA 가상 행 9범주 0, 임시 컨테이너·볼륨·터널·프로필·암호 파일 0. 49,999/50,000원 경계는 HTTP/DB로 확인했으며 주문 저장·한 결제/PG 실연동은 미구현·미검증이다.
- 후속 `2c80c61` 공유 DB 실제 Chrome 검증: WSL exact SHA 읽기 전용 소스 + 전용 Docker 빌드 볼륨의 API 9092/Web 9091, Windows SSH 루프백/Chrome CDP 9229에서 고객 장바구니·예약 복구/해제·390px/키보드·제거 스크립트 exit 0. QA ID `b83f1003` reset, DB 9범주 0, 지정 컨테이너·볼륨·터널 포트·Chrome 프로필·임시 암호 파일 잔류 0. 다판매자 3묶음 브라우저·실제 200% 확대·Oracle/UAT는 이 검증에 포함되지 않는다.
- 신산님 승인 후 WSL-server의 `local-postgres/shoppingmall`에 `0010_s3_checkout_reservations`를 적용했다. 현재 Drizzle 이력은 11건, 시험 계정·상품·장바구니·예약·예약품목·재고대기·감사·세션 등 9범주 자료는 0건이다. 아래 과거 `0010 미적용` 문구는 당시의 기록으로 현재 상태가 아니다.
- 현재 작업 브랜치 `codex/s31-checkout-reservation-plan`의 `cf05ad7`에서 공유 개발 DB 루트 순차 시험은 248건/241 pass/7 환경 skip/0 fail. 로컬 시험은 248건/187 pass/61 DB·환경 skip/0 fail, PR 본문 시험 8 pass, typecheck/lint/build 성공. 브라우저 실제 공유 DB 시험·Oracle 배포·사용자 인수는 아직 미검증이다.
- 격리 fixture 시험용 컨테이너와 공유 DB 회귀용 컨테이너는 종료·제거했고, 이번 적용 전 생성한 `/tmp/shoppingmall-s31-0010-pre-20261003.dump`도 정확한 해시·경로 확인 뒤 삭제했다. 이후 브라우저 시험을 새로 진행한다면 고유 QA ID의 자료를 시험 직후 reset하고 잔류 0을 재확인해야 한다. 승인된 migration/schema는 삭제하지 않는다.

## 2026-10-03 S3.1 예약 작업의 현재 경계

- 최신 제품 SHA `cbdd439d8931376cac688b73ba8912a9bfc206fe`: 승인된 계정 소유 `GET /customer/checkout/reservations/active`와 장바구니의 저장 ID 없는 자동 조회를 추가했다. 로컬 246건/187 pass/59 DB·환경 skip/0 fail, typecheck/lint/build exit 0. WSL 격리 PostgreSQL에 0000~0010을 적용한 루트 순차 실DB 246건/239 pass/7 조건부 skip/0 fail, 신규 HTTP 목표 2 pass/0 fail. 일회용 QA 컨테이너·볼륨/자료 잔류 0, 지정 checkout clean·동일 SHA. 공유 DB는 여전히 migration 10건이며 0010 미적용; 실제 브라우저와 정식 공유 DB 통합/E2E·Oracle·사용자 인수는 이 SHA에서 아직 미검증이다.
- 후속 QA 스크립트 SHA `bc7594e3e22099b6b3baa6626c29c16339a600f6`에서 같은 제품을 격리 DB/가상 계정의 Chrome 실제 DOM으로 확인했다. 저장 ID·멱등키 없이 자기 활성 예약 ID·만료시각 자동 복구, 해제, 390px/Tab, 제거·빈 카트 통과. 가상 fixture 9범주 0, 세 QA 컨테이너·볼륨/Windows 터널·Chrome 프로필 잔류 0, 공유 migration 10건 불변. 별도 실제 기기, 정식 공유 DB 통합/E2E, Oracle/PG·사용자 인수는 여전히 미검증이다.
- 리뷰 경계 보정 제품 SHA `e0554df08ca8f560c0faaf6429714a391fcec312`: 조회 도중 만료될 때 409/rollback 대신 현재 행 재확인·만료/감사 전이·404. 격리 DB 목표 HTTP 2 pass, 루트 순차 실DB 246건/239 pass/7 조건부 skip/0 fail; 로컬 test/typecheck/lint/build 통과. 정확한 QA 자료·컨테이너·볼륨 0, WSL checkout clean, 공유 migration 10건 그대로. 공유 0010 적용·정식 통합·UAT 승인은 별도다.
- 2026-10-03 추가: 기존 POST 계약 내 예약·견적 원자성 보정 제품 SHA `d32ffaa915939e0c0a2161f878a51f12cc9821f6`. 격리 DB에서 견적 실패 후 예약 0 및 동일 멱등키 재시도, 목표 HTTP 2 pass; API suite 114건/107 pass/7 skip/0 fail; 루트 실DB suite 245건/238 pass/7 skip/0 fail. QA 9범주·일회용 자원 잔류 0. 공유 `local-postgres/shoppingmall` migration은 여전히 10건(0010 미적용). 이는 자체 격리 QA이며 정식 WSL 통합·타 탭/기기 복구·Oracle 인수 검증이 아니다.

- 현재 단일 작업 브랜치는 `codex/s31-checkout-reservation-plan`, Windows 작업 checkout은 `D:\Project\shoppingmall2\.worktrees\flat-v2-prototypes`, WSL 지정 checkout은 `/home/daon/deploy/shopping`이다. 아래 과거 `codex/flat-v2-prototypes` 명령·SHA는 당시 기록이며 현재 checkout 명령에 그대로 사용하지 않는다. 원격은 `git@github-sinsan-develop:sinsan-develop/shoppingmall.git` SSH alias만 사용한다.
- 공유 개발 DB는 `WSL-server`의 `local-postgres/shoppingmall`이다. 현재 적용 이력 0000~0009(10건), 예약 `0010`은 미적용이다. 2026-10-03 읽기 전용 미리보기에서 대기 `0010_s3_checkout_reservations` 1건/14문장/SHA-256 `2be18dda86fb4ed32df427628ace9f9359c714d117bd3429cfd7ff81dc42267c`를 확인했다. 공유 DB에 적용하려면 신산님의 정확한 별도 승인이 필요하다. `migrate.ts`는 dry-run이 아니다.
- 예약 전체 회귀는 WSL 지정 checkout의 제품 SHA `5f16e5785dd8fbd50b2316daff9497b0ae7a4333`의 **별도 일회용 PostgreSQL 컨테이너**(공유 DB와 다른 서버, DB명만 fixture 가드용 `shoppingmall`)에서 0000~0010 적용 후 실행했다. 245건/238 pass/7 조건부 skip/0 fail, 바깥 셸 종료 코드 0, QA 9범주 행 0 및 지정 컨테이너·볼륨 제거를 확인했다. 이는 자체 QA 검증이며 PMO가 요구하는 정식 WSL 통합·E2E PASS가 아니다. 공유 DB 적용 후 정식 시험을 별도로 실행한다.
- 실제 브라우저 QA는 일회용 9091 Web/9092 API와 격리 DB에서 가상 구매자 2명·판매자·운영자 계정으로 수행했다. 최신 제품 SHA에서는 서버 201을 브라우저에서만 409로 바꾸는 실패 주입 뒤 새로고침·동일키 기존 예약 ID/만료시각 회복을 확인했다. QA DB/계정/컨테이너·Windows 임시 터널/CDP 포트와 Chrome 프로필은 정리됐다. 실제 200% 확대, PG·Oracle·사용자 인수는 미검증이다. 구체적인 SHA·화면 항목·오류·잔류 증거는 `WORK_STATUS.md`를 따른다.

## 2026-10-02 SSH 별칭 기반 PR 요청 경로

- `D:\Project\shoppingmall2`의 `main`과 원격 `main`은 작업 전 같은 커밋인지 확인한다. 작업 코드는 격리 브랜치에서 검증하고 `git@github-sinsan-develop:sinsan-develop/shoppingmall.git`로 push한다. GitHub 계정·PAT·`gh auth`를 로컬에서 사용하지 않는다.
- PR **생성만** 요청할 때는 현재 원격 `main` 커밋에 `pr-create/<작업 브랜치의 40자리 HEAD SHA>/codex/<브랜치 이름>` 태그를 만들어 SSH `origin`에 push한다. `.github/workflows/auto-pr-create.yml`은 원격 브랜치 HEAD·현재 `main` 기준·PR 본문 6개 항목을 검사해 PR을 생성하거나 본문을 갱신하고, 열린 PR이 정확한 HEAD를 가리키는지 확인한 뒤 요청 태그를 지운다. 이 경로는 병합하지 않는다.
- 기존 `pr-request/**` 태그와 `.github/workflows/auto-pr-merge.yml`은 **PR 생성과 즉시 병합 시도** 경로로 그대로 남는다. 과거 trusted gate Git blob의 CRLF 구문 오류는 PR #8의 LF 정규화가 `main`에 병합되며 해결되어 이 자동 병합 경로도 실행 가능해졌다. 신산님 인수 대상에는 사용하지 않고, 필수 검증·리뷰·별도 승인 경계를 충족한 병합 가능 Stage에만 적용한다. `pr-create/**`와 혼동해 보내지 않는다.
- PR 생성 자동화의 로컬 검사 통과는 GitHub Actions 실행 성공이나 branch protection·CI·WSL·Oracle 인수 증거가 아니다. GitHub 저장소 설정에서 Actions의 PR 생성 허용 여부는 최초 사용 전에 확인해야 한다. `GITHUB_TOKEN`으로 만든 PR의 `pull_request` CI가 승인 대기 상태일 수 있으므로, 작업 브랜치 `push` CI와 PR 필수 체크를 정확한 HEAD에서 별도로 확인한다.
- 생성 전후에 브랜치 또는 `main`이 이동하면 워크플로는 실패하고 요청 태그와 이미 열린 PR이 남을 수 있다. 실패한 PR의 실제 HEAD·본문·체크를 확인한 뒤 새 정확한 SHA로 재요청하며, 기존 PR이나 다른 ref를 자동 삭제하지 않는다. 첫 실제 요청 결과와 정확한 PR URL·HEAD·미검증 범위를 `WORK_STATUS.md`에 기록한다.
- 2026-10-02 확인 당시 원격 `main@2bad168a03b95a9ce9a43cafc76b54318a038dbe`에는 PR #8로 생성 전용 워크플로와 LF gate가 이미 들어 있다. 최초 도입 전용 bootstrap 경고는 과거 기록이며, 실제 첫 `pr-create/**` 요청의 결과·Actions 권한·PR 체크는 별도 검증한다. 직접 `main`에 push하지 않는다.

## 2026-09-30 S2.4 찜·옵션별 재입고 신청 재현 경계

- 로컬 변경 검증은 작업 worktree 루트의 `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. DB 없는 Windows의 고객 관계/HTTP 시험 skip은 실DB PASS가 아니다.
- 작업 브랜치를 승인된 `github-sinsan-develop` SSH 별칭으로 push한 뒤 지정 WSL checkout `/home/daon/deploy/shopping`을 `git pull --ff-only origin codex/flat-v2-prototypes`로 동일 SHA에 맞춘다. `local-postgres/shoppingmall`에는 격리 시험을 거친 0007 migration이 적용돼 있다.
- WSL Node24 컨테이너에서 `node --import tsx --test apps/api/test/customer-engagement-schema-db.test.mjs apps/api/test/customer-favorites-http-db.test.mjs apps/api/test/customer-restock-http-db.test.mjs`로 관계·권한·동시성·옵션 개정 실DB 시험을 수행한다. `node --test-concurrency=1 --import tsx --test`는 전체 실DB 회귀다. `DATABASE_URL`은 실행 환경에서만 주입하고 로그·Git에 남기지 않는다.
- 실제 브라우저 QA는 고유 8자리 `QA_RUN_ID`의 `qa-public-fixture.ts seed`로 가상 고객·상품을 잠시 만들고, 시험 종료 후 같은 ID의 `reset`으로 자식 신청·찜→상품→계정을 정리한다. 품절 신청 검증 시에는 먼저 해당 QA 상품·옵션만 존재하는지 확인하고 그 옵션의 `sellable_quantity`만 0으로 설정한다. API `apps/api`의 최신 `tsc -p tsconfig.build.json`, Web의 `NEXT_PUBLIC_API_ORIGIN=http://127.0.0.1:9092` 지정 Next 빌드를 실제 서버 시작 전에 수행한다. `/ready` 200만으로 신규 route 반영을 보증하지 않으므로 비로그인 `/customer/favorites`의 401도 확인한다.
- S2.4에는 저장·조회·취소만 포함한다. 실제 문자·메일·푸시 발송과 `notified` 전이는 S5.3, Oracle·사용자 인수는 별도 검증이다. in-app/Chrome 자동화에서 확대 단축키가 배율을 변경하지 않았으므로 430px·640px 화면 확인을 실제 200% 확대 증거로 사용하지 않는다.

## 2026-09-28 현재 실행 명령표와 미구현 경계

| 작업 | 현재 실제 명령·경로 | 확인 범위 |
|---|---|---|
| Windows 설치 | 작업 worktree 루트에서 `pnpm install --frozen-lockfile` | `pnpm-lock.yaml` 고정 의존성 설치 |
| Windows 기본 검증 | 같은 루트에서 `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` | DB 연결이 없는 로컬 시험의 skip은 별도 집계 |
| WSL 코드 동기화 | 로컬 작업 브랜치를 `git@github-sinsan-develop:sinsan-develop/shoppingmall.git`로 push한 뒤 `ssh WSL-server`, `/home/daon/deploy/shopping`에서 `git pull --ff-only git@github-sinsan-develop:sinsan-develop/shoppingmall.git codex/flat-v2-prototypes`, `git rev-parse HEAD`, `git status --short` | 정확한 commit과 clean 여부를 먼저 대조. WSL checkout에서 직접 개발하지 않음 |
| WSL DB 연결 전체 시험 | 지정 checkout을 마운트한 Node 24 일회성 컨테이너의 `/app`에서 `node --test-concurrency=1 --import tsx --test` | `DATABASE_URL`은 실행 환경의 비밀값으로 공급. 현재 환경 skip 7건을 PASS로 합치지 않음. 가상 자료 정리·DB 잔류를 별도 확인 |
| QA seed/reset | `apps/api`에서 `node --import tsx scripts/qa-fixture.ts seed|reset` 또는 `node --import tsx scripts/qa-public-fixture.ts seed|reset`(실행 시 `seed`와 `reset` 중 하나만 입력) | 고유 `QA_RUN_ID`, 환경의 `DATABASE_URL`, seed 시 `QA_FIXTURE_PASSWORD`; 공개 fixture는 선택적으로 `QA_PUBLIC_PRODUCT_COUNT=1..25`. 예상 행 수·수명·정리 대상을 작업현황에 먼저 기록. 비밀번호·DB URL은 대화·Git에 기록하지 않음 |
| 실제 제품 브라우저 확인 | 개발 웹 `http://127.0.0.1:9091`, API `http://127.0.0.1:9092/ready`에서 같은 SHA·HTTP 상태를 확인하고 고객/판매자/관리자 흐름을 수동 검증 | 현재 자동 브라우저 E2E package script 없음. 실제 200% 배율·인쇄·인수는 별도 증거 없으면 미검증 |
| migration dry-run | `apps/api`에서 `pnpm migration:dry-run` (SQL 본문: `pnpm migration:dry-run --sql`) | `migrate-dry-run.ts`가 현재 DB와 Drizzle 이력을 읽기 전용 트랜잭션으로 조회하고 대기 파일을 미리 보여준다. SQL 적용·구문 유효성 검증·rollback은 하지 않는다. 실제 적용 시험은 격리 DB에서 별도로 수행 |

위 표는 존재하는 명령과 현재 한계를 적은 것이며 Stage 전체 통과 선언이 아니다. 포트·컨테이너·QA ID는 매 시험 전 점유와 소유자를 다시 확인한다.

## 2026-09-27 재현 명령·현재 경계

### S3.1 예약 만료 배치 준비(공유 DB 미적용)

- `apps/api/scripts/expire-reservations.ts`는 `DATABASE_URL` 대상의 유효기간 지난 활성 예약을 DB 시각으로 최대 100건씩 종료하고 처리 건수를 stdout에 출력한다. `apps/api`에서 `node --import tsx scripts/expire-reservations.ts 100`으로 1회 실행하며, `DATABASE_URL` 미설정·잘못된 1~1000건 한도·DB 오류는 비정상 종료한다. 자격정보는 문서나 실행 로그에 기록하지 않는다.
- 운영 시 API 인스턴스별 타이머가 아니라 외부 스케줄러 1곳에서 1분 간격으로 실행하고 실패를 감시한다. 실패하면 원인을 확인하고 다음 주기에 재시도하며, 중복 실행은 계정/상품 잠금과 상태 전이의 멱등성으로 보호한다. 배치 중지 중에도 신규 판매 가능량은 `expires_at > clock_timestamp()`인 예약만 차감한다.
- 공유 `local-postgres/shoppingmall`의 0010 migration 적용은 미승인 상태이므로 이 배치를 해당 DB에 등록·가동하지 않는다. 격리 DB에서만 시험하고, 실제 스케줄·로그 저장/알림 경로는 운영환경 결정 시 확정한다.

- Windows 정본은 `D:\Project\shoppingmall2`의 격리 worktree이며 현재 제품 작업 브랜치는 `codex/flat-v2-prototypes`다. `main`에 직접 개발하지 않는다. 실제 작업 checkout에서 `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`를 실행한다. 로컬 `pnpm test`의 DB 의존 skip은 WSL DB 검증을 대신하지 않는다.
- 소스 전달은 GitHub 계정/토큰이 아니라 `git@github-sinsan-develop:sinsan-develop/shoppingmall.git` SSH 별칭을 사용한다. 작업 브랜치를 push한 뒤 `ssh WSL-server`로 접속해 정확한 `/home/daon/deploy/shopping`에서 `git pull --ff-only origin codex/flat-v2-prototypes`, `git rev-parse HEAD`, `git status --short --branch`로 동일 커밋·clean 상태를 확인한다. 다른 WSL 서비스와 checkout을 덮거나 초기화하지 않는다.
- WSL 호스트에는 시스템 `pnpm`이 없다. 검증된 Node 24 컨테이너로 저장소를 `/app`에 마운트해 `apps/web/node_modules/.bin/next build`(작업 디렉터리 `/app/apps/web`)와 `apps/api/node_modules/.bin/tsx scripts/qa-fixture.ts seed|reset`(작업 디렉터리 `/app/apps/api`)을 실행했다. QA fixture는 `QA_RUN_ID` 8자리와 `QA_FIXTURE_PASSWORD`(seed만), 정확한 개발 DB URL이 필요하며 생성 전 ID·수명·정리 대상과 기존 계정 수를 `WORK_STATUS.md`에 기록한다. 실제 자격정보는 Git/문서/대화에 쓰지 않는다.
- 개발 DB는 `WSL-server`의 정확한 `local-postgres/shoppingmall`이다. 임시 Web 127.0.0.1:9091과 API 127.0.0.1:9092를 켤 때 먼저 listener·컨테이너 이름을 확인하고, 시험 뒤 지정 컨테이너만 종료한다. API `/ready` 200·Web HTTP 200과 동일 SHA를 확인해도 결제/외부 Provider/UAT 합격을 뜻하지 않는다.
- `apps/api/scripts/migrate.ts`는 실제 migration **적용** 명령이므로 공유 DB에서 dry-run으로 실행하지 않는다. 별도 `migrate-dry-run.ts`는 `apps/api`에서 `pnpm migration:dry-run`으로 실행하는 읽기 전용 미리보기다. 현재 DB가 `shoppingmall`인지 확인하고 Drizzle 이력과 파일의 시각·SHA-256을 대조해 대기 파일/문장 수를 출력한다. `pnpm migration:dry-run --sql`은 대기 SQL 본문도 표시한다. DB에 SQL을 적용하거나 구문·rollback을 검증하지 않으므로 실제 변경은 격리 DB 적용·복구 절차가 따로 필요하다. 이미 적용된 migration·실데이터를 초기화하지 않는다.
- Android 앱 빌드/실기기·실제 PG·문자/메일/푸시 연동·Oracle staging 검증은 위 로컬/WSL 명령의 통과 범위 밖이다. 실제 실행 여부와 잔여 gate는 `WORK_STATUS.md` 및 별도 인수 계획으로 추적한다.

## 2026-09-27 S1.1 WSL 시험 결과 (현재 사실)

- 지정 SSH 별칭 `WSL-server`의 `/home/daon/deploy/shopping`에 `git@github-sinsan-develop:sinsan-develop/shoppingmall.git`의 `codex/flat-v2-prototypes` 브랜치를 clone했다. 시험 HEAD는 `eb74e536cb3464cd9032256bd56619302355fcb8`이며 당시 원격과 일치했다. 아래 과거 항목의 `checkout 부재`는 생성 전 역사 기록이다.
- WSL 시스템 Node 18.19.1에는 pnpm이 없다. 시스템 런타임은 바꾸지 않고 기존 `node:24-bookworm-slim` 이미지를 일회성 `shoppingmall-s1-verify` 컨테이너에 사용했다. 동일 checkout에서 `npx pnpm@11.19.0 install --frozen-lockfile`, test(56통과), typecheck, lint, build가 통과했다. 이것은 일회성 자체 검증이며 정식 DB 통합·E2E 검증은 아니다.
- 동일 commit의 빌드 API `/health`는 HTTP 200과 정상 본문, Next 웹 `/`는 HTTP 200과 `서비스 구축 중` 본문을 반환했다. `shoppingmall-s1-api`, `shoppingmall-s1-web` 일회성 컨테이너를 중지·제거하고 포트 점유 잔류를 확인했다. DB 미연결 상태의 `/ready`는 503을 의도하며, 실제 DB 연동 성공으로 해석하지 않는다.
- 일회성 패키지 캐시 `/home/daon/deploy/shopping/.pnpm-store`만 안전 확인 후 제거했다. Git checkout은 clean, `node_modules`는 무시 대상으로 남겨 두었다. `local-postgres`/`shoppingmall` DB는 기존 상태로 보존했다. GitHub CI 실행, 모바일 빌드/실기기, 실제 제품 브라우저 흐름, 외부 연동은 아직 미검증이다.

## 2026-09-27 S1.1 착수 중 확인

- 신산님은 상세 작업계획에 따른 전체 구축과 외부 서비스 가입·실연동의 구축 후 일괄 처리를 지시했다. Flat v2 로컬 정적 시안 자체의 브라우저 QA는 제품 코드 착수의 차단조건에서 제외했다. 실제 제품의 브라우저 QA는 해당 Stage에서 수행한다.
- Windows Node `24.18.0`, pnpm `11.19.0`. 승인된 Next.js 16.3.6 / NestJS 12.1.0 / Expo 57.0.25를 현재 격리 worktree의 `pnpm-lock.yaml`에 고정했다. Expo SDK 57의 React 19.2.3·React Native 0.86 호환표에 맞춰 앱 패키지 버전을 지정했다. Android 앱 아이콘 승인 전이므로 앱 빌드·에뮬레이터 실행은 아직 하지 않았다.
- 9091 웹 공개 포트와 9092 로컬 API 포트는 확인 시 Windows·WSL-server 모두 LISTEN 점유가 없었다. 로컬 빌드된 웹 `http://127.0.0.1:9091/`은 HTTP 200과 한국어 구축 중 화면, API `http://127.0.0.1:9092/health`는 HTTP 200과 `{ "status": "ok", "service": "shoppingmall-api" }`를 반환했다. 시험 프로세스를 종료했고 두 포트의 LISTEN 잔류가 없음을 재확인했다. Oracle 포트/배포 구성은 미결정이며 이 기록은 운영 포트 확정이 아니다.
- `WSL-server` 호스트명은 `SINSAN`; `/home/daon/deploy/shopping`은 아직 없고 `local-postgres`는 실행 중이며 `shoppingmall` DB 읽기 전용 조회가 성공했다. WSL checkout 생성·DB schema/권한 변경은 수행하지 않았다.
- 무비밀값 참조 이름은 [`.env.example`](../.env.example)에 있다. 실제 `DATABASE_URL`·결제/발송/로그인 provider Secret은 등록하지 않았다. `.env`는 Git 무시 대상이다.
- 현재 반복 명령: root에서 `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`; API `pnpm --filter @shoppingmall/api dev`, 웹 `pnpm --filter @shoppingmall/web dev`. 웹 9091/API 9092를 기본 사용한다. `pnpm approve-builds esbuild`로 정확한 설치 빌드 스크립트만 허용했다. 실제 WSL exact commit pull·DB migration dry-run·seed/E2E 명령은 해당 코드·승인 전까지 미정이다.

- 확인일: 2026-09-26
- 상태: 설계·개발 작업계획 승인 후 착수 전 환경 확인. 2026-09-26 Git `main` 초기 기준선은 생성했으며, 화면 시안 승인·공통 포트·QA/Secret 절차·환경 준비 판정 전에는 제품 구현을 시작하지 않음.

## 환경 역할

1. Windows 로컬: 소스 개발, 정적 검사, 단위시험, 빠른 회귀시험.
2. GitHub `sinsan-develop/shoppingmall`: 작업 브랜치의 안전한 커밋 전달. 사용자가 지정한 URL은 `https://github.com/sinsan-develop/shoppingmall`이며 실제 SSH 접속 별칭은 `github-sinsan-develop`.
3. `WSL-server` (`daon@SINSAN`): Git에서 동일 커밋을 받아 정식 통합·E2E 시험. 사용자가 지정한 경로는 `~/deploy/shopping` (`/home/daon/deploy/shopping`).
4. Oracle: 개발 완료 후 사용자 인수테스트 시점에 서버 환경을 결정. 현재 개발·시험에는 사용하지 않음.

## 기존 자료의 읽기 전용 참조

- `D:\Project\shoppingmall`와 `git@github-cyhuh7950:cyhuh7950/owoolmall.git`은 신산님이 지정한 **설계 참고 자료**다. 2026-09-26 원격 `main`과 로컬 HEAD는 `6cc92c0`으로 같지만, 로컬 작업 트리에는 미커밋·미추적 자료가 있다. 이 자료는 보존하고 현재 어울몰의 개발 원격·작업 checkout으로 바꾸지 않는다.
- 기존 정적 시안의 WSL 경로 `~/deploy/owoolmall`과 포트 `9088`은 이 프로젝트에 자동 적용하지 않는다. 현재 어울몰의 지정 원격은 `sinsan-develop/shoppingmall`, WSL 시험 경로는 `~/deploy/shopping`이다. [참고 자료 반영 검토](design/REFERENCE_REVIEW.md).

## 현재 확인한 사실

- 로컬 작업 폴더: `D:\Project\shoppingmall2` (신산님이 2026-09-26 변경 지시). 이전 `C:\Users\cyhuh\OneDrive\문서\ChatGPT\쇼핑몰`은 검증용 원본으로 보존하며 이후 작업 정본으로 사용하지 않음.
- 로컬 Git: 2026-09-26 `main` 초기 root commit `6c249b0be8b60604a86c4ddf7c3ea68159749d50` 생성, `origin/main` 추적. 문서·시안·검사 32개 파일을 최초 기준선으로 push했고 별개 `.github` 자동화 두 파일은 미추적으로 보존.
- 지정 GitHub SSH URL: `git@github-sinsan-develop:sinsan-develop/shoppingmall.git`. 초기 push 후 `git ls-remote --symref origin HEAD refs/heads/main`에서 원격 HEAD와 `main`이 위 root commit을 가리키는 것을 확인.
- WSL SSH 별칭: `WSL-server`로 `SINSAN` 접속 확인. 앞선 대화의 `ssh-WSL` 표기보다 사용자가 제공한 실제 SSH 설정의 `WSL-server`를 적용.
- WSL checkout 경로: `/home/daon/deploy/shopping`은 2026-09-26 현재 없음. 생성·clone·pull 미실행.
- WSL DB: 실행 중인 정확한 `local-postgres` 컨테이너에 `shoppingmall` 데이터베이스 생성 완료, `psql` 접속과 현재 DB명 확인. 같은 서버의 유사 이름 컨테이너·타 프로젝트 DB는 변경하지 않음.

### 2026-09-26 초기 push 전 재확인(읽기 전용 역사 기록)

- `git ls-remote git@github-sinsan-develop:sinsan-develop/shoppingmall.git`는 SSH 설정 접근이 허용된 실행에서 종료 코드 0이었으나 ref 출력이 없다. 따라서 원격 저장소 접속은 가능하지만 `main` 기준선은 아직 없다.
- `ssh WSL-server`로 `SINSAN`을 확인했고 `/home/daon/deploy/shopping`은 없다. 정확한 commit pull·WSL 앱 실행은 아직 미검증이다.
- `ssh WSL-server`를 통한 `local-postgres`의 `shoppingmall` DB 읽기 전용 `SELECT current_database()` 결과가 `shoppingmall`이다. 애플리케이션 schema·권한·migration은 미준비다.
- 제한된 로컬 셸에서는 `C:\Users\cyhuh\.ssh\config` 접근이 거부되어 SSH alias가 일반 호스트명처럼 처리됐다. 이는 서버·GitHub 접속 실패의 증거가 아니다. 설정 접근이 허용된 읽기 전용 재시험에서 위 접속이 성공했으며 SSH 설정·credential은 변경하지 않았다.
- 병렬 조사 시점에 9089·9091 포트 점유는 관찰되지 않았으나 프로젝트 공통 포트로 확정하지 않았다. 실제 선정 때 로컬·WSL·향후 인수환경의 점유와 소유자를 다시 확인한다.
- 당시 프로젝트 root `AGENTS.md`와 정식 개발 Git 기준선·WSL checkout은 없었고, `docs/` 및 `WORK_STATUS.md`는 미추적 상태였다. 이후 Git `main` 기준선은 위와 같이 생성했다. 프로젝트 root `AGENTS.md`와 WSL checkout은 아직 없다.

## 향후 준비·검증 항목

- 승인된 설계·개발 작업계획과 현재 `origin/main` 기준선에서 격리 작업 브랜치·worktree 절차를 준비하고 실제 저장소 이력과 대조한다. 현재 문서·시안 정본 위치는 `D:\Project\shoppingmall2`다.
- WSL 지정 checkout을 Git으로 구성하고 exact commit을 확인. 소스 복사나 원격 직접 수정은 하지 않음.
- 앱·API·DB·객체 저장소·발송 mock/sandbox의 포트와 컨테이너·네트워크·볼륨 이름, Secret 저장 위치(값 제외)를 계획에 명시.
- `shoppingmall` DB의 앱 전용 권한, migration, 테스트 seed/reset·복구 절차는 승인된 설계·작업계획에 따라 정의. 현재 DB는 비어 있으며 스키마·계정은 만들지 않음.
- QA 고객·관리자·농가 계정과 상품·주문 자료는 식별 가능한 테스트 데이터로 생성; 실제 개인정보·실결제·실발송을 피하고 Secret은 문서·Git에 저장하지 않음.
- 고추·고춧가루·양파·마늘·블루베리의 개발용 옵션·가격·재고는 식별 가능한 가상값으로 준비. 실제 판매값은 사용자 인수테스트 준비 시 관리자가 확인·설정하며, 시험값을 실판매값으로 간주하지 않음.
- PG 계약·요금과 Oracle 환경은 개발 완료 후 사용자 인수테스트 시점에 결정. 그 전에는 결제 mock/sandbox 및 테스트 계정으로 검증하고 실연동 미검증 범위를 명시.
- 카카오·Apple 로그인, 문자·메일, 앱 빌드 등 실제 외부 연동 검증의 범위·계정 준비는 사용자 인수테스트 시점에 결정. 개발 중 가능한 로컬·모의시험을 진행하되 실제 Provider·기기 빌드 시험을 수행하지 않은 부분은 미검증으로 기록.
