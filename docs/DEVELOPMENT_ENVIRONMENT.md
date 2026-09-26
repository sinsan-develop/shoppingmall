# 어울몰 개발·시험 환경 (초안)

- 확인일: 2026-09-26
- 상태: 설계·개발 작업계획 승인 후 착수 전 환경 확인. 화면 시안 승인·Git 기준선·공통 포트·QA/Secret 절차·환경 준비 판정 전에는 제품 구현을 시작하지 않음.

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
- 로컬 Git: 무커밋 `master`, remote 미설정. 기존 미추적 문서 보존 중.
- 지정 GitHub SSH URL: `git@github-sinsan-develop:sinsan-develop/shoppingmall.git`. `git ls-remote` 접속은 성공했으나 2026-09-26 현재 조회된 `HEAD`, `main`, `master` ref는 없음. 최초 커밋·기준 브랜치는 아직 만들지 않음.
- WSL SSH 별칭: `WSL-server`로 `SINSAN` 접속 확인. 앞선 대화의 `ssh-WSL` 표기보다 사용자가 제공한 실제 SSH 설정의 `WSL-server`를 적용.
- WSL checkout 경로: `/home/daon/deploy/shopping`은 2026-09-26 현재 없음. 생성·clone·pull 미실행.
- WSL DB: 실행 중인 정확한 `local-postgres` 컨테이너에 `shoppingmall` 데이터베이스 생성 완료, `psql` 접속과 현재 DB명 확인. 같은 서버의 유사 이름 컨테이너·타 프로젝트 DB는 변경하지 않음.

### 2026-09-26 재확인(읽기 전용)

- `git ls-remote git@github-sinsan-develop:sinsan-develop/shoppingmall.git`는 SSH 설정 접근이 허용된 실행에서 종료 코드 0이었으나 ref 출력이 없다. 따라서 원격 저장소 접속은 가능하지만 `main` 기준선은 아직 없다.
- `ssh WSL-server`로 `SINSAN`을 확인했고 `/home/daon/deploy/shopping`은 없다. 정확한 commit pull·WSL 앱 실행은 아직 미검증이다.
- `ssh WSL-server`를 통한 `local-postgres`의 `shoppingmall` DB 읽기 전용 `SELECT current_database()` 결과가 `shoppingmall`이다. 애플리케이션 schema·권한·migration은 미준비다.
- 제한된 로컬 셸에서는 `C:\Users\cyhuh\.ssh\config` 접근이 거부되어 SSH alias가 일반 호스트명처럼 처리됐다. 이는 서버·GitHub 접속 실패의 증거가 아니다. 설정 접근이 허용된 읽기 전용 재시험에서 위 접속이 성공했으며 SSH 설정·credential은 변경하지 않았다.
- 병렬 조사 시점에 9089·9091 포트 점유는 관찰되지 않았으나 프로젝트 공통 포트로 확정하지 않았다. 실제 선정 때 로컬·WSL·향후 인수환경의 점유와 소유자를 다시 확인한다.
- 프로젝트 root `AGENTS.md`와 정식 개발 Git 기준선·WSL checkout은 아직 없다. 현재 문서 작업공간의 `docs/` 및 `WORK_STATUS.md`는 무커밋·미추적 상태로 보존한다.

## 향후 준비·검증 항목

- 승인된 설계·개발 작업계획을 기준으로 기본 브랜치, 격리 작업 브랜치·worktree, 첫 push 절차를 정하고 실제 저장소 이력과 대조. 원격이 빈 상태이므로 최초 기준선·로컬 개발 정본 위치는 별도 결정이 필요하다.
- WSL 지정 checkout을 Git으로 구성하고 exact commit을 확인. 소스 복사나 원격 직접 수정은 하지 않음.
- 앱·API·DB·객체 저장소·발송 mock/sandbox의 포트와 컨테이너·네트워크·볼륨 이름, Secret 저장 위치(값 제외)를 계획에 명시.
- `shoppingmall` DB의 앱 전용 권한, migration, 테스트 seed/reset·복구 절차는 승인된 설계·작업계획에 따라 정의. 현재 DB는 비어 있으며 스키마·계정은 만들지 않음.
- QA 고객·관리자·농가 계정과 상품·주문 자료는 식별 가능한 테스트 데이터로 생성; 실제 개인정보·실결제·실발송을 피하고 Secret은 문서·Git에 저장하지 않음.
- 고추·고춧가루·양파·마늘·블루베리의 개발용 옵션·가격·재고는 식별 가능한 가상값으로 준비. 실제 판매값은 사용자 인수테스트 준비 시 관리자가 확인·설정하며, 시험값을 실판매값으로 간주하지 않음.
- PG 계약·요금과 Oracle 환경은 개발 완료 후 사용자 인수테스트 시점에 결정. 그 전에는 결제 mock/sandbox 및 테스트 계정으로 검증하고 실연동 미검증 범위를 명시.
- 카카오·Apple 로그인, 문자·메일, 앱 빌드 등 실제 외부 연동 검증의 범위·계정 준비는 사용자 인수테스트 시점에 결정. 개발 중 가능한 로컬·모의시험을 진행하되 실제 Provider·기기 빌드 시험을 수행하지 않은 부분은 미검증으로 기록.
