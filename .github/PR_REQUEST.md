## 목적

SSH 별칭만으로 PR을 열되, PR 생성 요청이 곧 자동 병합으로 이어지지 않도록 생성 전용 요청 경로를 추가한다.

## 변경 요약

- `pr-create/**` 태그를 받는 `.github/workflows/auto-pr-create.yml`을 추가한다. 현재 `main`·정확한 작업 브랜치 HEAD·PR 본문을 검사하고, 기존 PR 본문 갱신 전과 생성/갱신 후 원격 ref·열린 PR의 HEAD를 다시 확인한다.
- 기존 `pr-request/**` 자동 병합 워크플로 파일은 수정하지 않는다. 두 태그 경로의 사용 시점과 승인 경계를 개발환경 문서에 구분해 기록한다.
- 기존 브로커가 읽는 `.github/pr-broker-gate.sh` Git blob의 CRLF 때문에 Linux Bash가 구문 오류로 종료되는 것을 확인했다. `.gitattributes`를 정확한 gate 파일에만 적용하고 blob을 LF로 정규화한다.

## 영향

- 제품 화면·API·DB schema·실사용 데이터·외부 공급자 설정은 바꾸지 않는다. 새 태그를 push하기 전에는 새 워크플로가 실행되지 않는다.
- 이 변경이 `main`에 병합된 뒤 `pr-create/**` 요청은 PR을 생성/갱신하지만 병합하지 않는다. 기존 `pr-request/**` 워크플로의 코드는 그대로지만, gate LF 수정으로 기존에 Bash 구문 오류에서 멈추던 **자동 병합 경로가 실행 가능해지는 영향**이 있다. 해당 태그는 별도 병합 승인과 필수 게이트 없이 보내지 않는다.

## 검증

- 변경 전·후 로컬 `pnpm test`가 각각 제품/시안 시험 230건 중 176 pass·54 환경 skip·0 fail, PR 본문 검사 8 pass였다. 변경 후 `pnpm typecheck`, `pnpm lint`, `pnpm build`가 exit 0이었다. 54개 skip은 통과로 합산하지 않는다.
- 두 워크플로를 YAML로 읽어 `pr-create/**`와 `pr-request/**` 트리거가 분리되고 생성 전용 단계에 `gh pr merge`가 없으며 기존 병합 단계는 남아 있음을 확인했다. 두 워크플로의 Bash 실행 단계 15개에 `bash -n`을 적용해 구문 통과를 확인했다.
- WSL checkout의 기존 gate Git blob은 CRLF 20개로 Linux `bash -n`에서 구문 오류 RED였다. 정규화한 브랜치 blob은 CR 0개·LF 20개이고 공백 무시 diff에서 내용 변경은 없다. 지정 WSL checkout이 SSH Git으로 `099cfab3744ad68a7a1158612066afec2c08b906`을 pull한 뒤 파일과 Git blob 모두 Linux `bash -n` GREEN, 신규·기존 workflow YAML 파싱과 PR 본문 검사 exit 0, `git diff --check origin/main...HEAD` exit 0 및 checkout clean을 확인했다.

## 미검증

- 새 워크플로의 실제 GitHub Actions 태그 실행과 PR 생성/본문 갱신, 원격 CI·branch protection·Actions PR 생성 권한은 아직 미검증이다. `GITHUB_TOKEN` 생성 PR의 `pull_request` CI는 승인 대기일 수 있어 브랜치 push CI와 PR 체크를 별도로 확인한다.
- 이번 도입 PR은 새 `pr-create/**` 경로를 사용할 수 없다. 기존 `pr-request/**` 경로는 PR 생성 직후 자동 병합을 시도하므로, 별도 병합 승인·필수 검증 없이 bootstrap 태그를 보내지 않는다. 첫 실제 사용 때 PR URL·정확한 HEAD·열린 상태를 확인한다.
- 현재 `main`의 gate는 Linux 구문 오류로 기존 요청 태그 역시 안전한 최초 PR 경로가 아니다. 이 브랜치를 `main`에 반영할 일회성 수단은 미확정이며, 직접 `main` push·GitHub 계정 사용으로 임의 우회하지 않는다.
- 이번 변경은 제품 기능이나 WSL DB·Oracle staging·사용자 인수의 통과 증거가 아니다.

## 롤백

- 문제가 발견되면 새 생성 전용 워크플로와 절차 문서를 되돌리는 후속 PR을 사용한다. gate 줄바꿈 수정은 기존 브로커의 Linux 실행에도 영향을 주므로 되돌리기 전에 자동 병합 경로의 안전성을 별도 확인한다. 제품 코드·DB는 보존한다.
- 실패한 요청 태그는 실제 원격 ref를 확인한 뒤 정확한 이름만 정리한다. 브랜치·다른 태그·기존 PR을 일괄 삭제하지 않는다.
