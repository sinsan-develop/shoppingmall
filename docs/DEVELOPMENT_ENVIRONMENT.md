# 어울몰 개발·시험 환경 (초안)

## 2026-09-28 현재 실행 명령표와 미구현 경계

| 작업 | 현재 실제 명령·경로 | 확인 범위 |
|---|---|---|
| Windows 설치 | 작업 worktree 루트에서 `pnpm install --frozen-lockfile` | `pnpm-lock.yaml` 고정 의존성 설치 |
| Windows 기본 검증 | 같은 루트에서 `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` | DB 연결이 없는 로컬 시험의 skip은 별도 집계 |
| WSL 코드 동기화 | 로컬 작업 브랜치를 `git@github-sinsan-develop:sinsan-develop/shoppingmall.git`로 push한 뒤 `ssh WSL-server`, `/home/daon/deploy/shopping`에서 `git pull --ff-only git@github-sinsan-develop:sinsan-develop/shoppingmall.git codex/flat-v2-prototypes`, `git rev-parse HEAD`, `git status --short` | 정확한 commit과 clean 여부를 먼저 대조. WSL checkout에서 직접 개발하지 않음 |
| WSL DB 연결 전체 시험 | 지정 checkout을 마운트한 Node 24 일회성 컨테이너의 `/app`에서 `node --test-concurrency=1 --import tsx --test` | `DATABASE_URL`은 실행 환경의 비밀값으로 공급. 현재 환경 skip 7건을 PASS로 합치지 않음. 가상 자료 정리·DB 잔류를 별도 확인 |
| QA seed/reset | `apps/api`에서 `node --import tsx scripts/qa-fixture.ts seed|reset` 또는 `node --import tsx scripts/qa-public-fixture.ts seed|reset`(실행 시 `seed`와 `reset` 중 하나만 입력) | 고유 `QA_RUN_ID`, 환경의 `DATABASE_URL`, seed 시 `QA_FIXTURE_PASSWORD`; 공개 fixture는 선택적으로 `QA_PUBLIC_PRODUCT_COUNT=1..25`. 예상 행 수·수명·정리 대상을 작업현황에 먼저 기록. 비밀번호·DB URL은 대화·Git에 기록하지 않음 |
| 실제 제품 브라우저 확인 | 개발 웹 `http://127.0.0.1:9091`, API `http://127.0.0.1:9092/ready`에서 같은 SHA·HTTP 상태를 확인하고 고객/판매자/관리자 흐름을 수동 검증 | 현재 자동 브라우저 E2E package script 없음. 실제 200% 배율·인쇄·인수는 별도 증거 없으면 미검증 |
| migration dry-run | **명령 없음**. `apps/api/scripts/migrate.ts`는 실제 DB 적용만 수행 | 공유 `shoppingmall` DB에서 dry-run으로 실행 금지. 격리 시험 DB·복구 경계와 dry-run 구현 후 검증 필요 |

위 표는 존재하는 명령과 현재 한계를 적은 것이며 Stage 전체 통과 선언이 아니다. 포트·컨테이너·QA ID는 매 시험 전 점유와 소유자를 다시 확인한다.

## 2026-09-27 재현 명령·현재 경계

- Windows 정본은 `D:\Project\shoppingmall2`의 격리 worktree이며 현재 제품 작업 브랜치는 `codex/flat-v2-prototypes`다. `main`에 직접 개발하지 않는다. 실제 작업 checkout에서 `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`를 실행한다. 로컬 `pnpm test`의 DB 의존 skip은 WSL DB 검증을 대신하지 않는다.
- 소스 전달은 GitHub 계정/토큰이 아니라 `git@github-sinsan-develop:sinsan-develop/shoppingmall.git` SSH 별칭을 사용한다. 작업 브랜치를 push한 뒤 `ssh WSL-server`로 접속해 정확한 `/home/daon/deploy/shopping`에서 `git pull --ff-only origin codex/flat-v2-prototypes`, `git rev-parse HEAD`, `git status --short --branch`로 동일 커밋·clean 상태를 확인한다. 다른 WSL 서비스와 checkout을 덮거나 초기화하지 않는다.
- WSL 호스트에는 시스템 `pnpm`이 없다. 검증된 Node 24 컨테이너로 저장소를 `/app`에 마운트해 `apps/web/node_modules/.bin/next build`(작업 디렉터리 `/app/apps/web`)와 `apps/api/node_modules/.bin/tsx scripts/qa-fixture.ts seed|reset`(작업 디렉터리 `/app/apps/api`)을 실행했다. QA fixture는 `QA_RUN_ID` 8자리와 `QA_FIXTURE_PASSWORD`(seed만), 정확한 개발 DB URL이 필요하며 생성 전 ID·수명·정리 대상과 기존 계정 수를 `WORK_STATUS.md`에 기록한다. 실제 자격정보는 Git/문서/대화에 쓰지 않는다.
- 개발 DB는 `WSL-server`의 정확한 `local-postgres/shoppingmall`이다. 임시 Web 127.0.0.1:9091과 API 127.0.0.1:9092를 켤 때 먼저 listener·컨테이너 이름을 확인하고, 시험 뒤 지정 컨테이너만 종료한다. API `/ready` 200·Web HTTP 200과 동일 SHA를 확인해도 결제/외부 Provider/UAT 합격을 뜻하지 않는다.
- `apps/api/scripts/migrate.ts`는 실제 migration **적용** 명령이며 dry-run 옵션이 없다. 따라서 이를 공유 DB에서 dry-run으로 실행하지 않는다. migration dry-run은 승인된 schema와 정확한 격리 시험 DB·복구 절차가 확정된 뒤 별도 검증해야 하며 현재 **미검증**이다. 이미 적용된 migration·실데이터를 초기화하지 않는다.
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
