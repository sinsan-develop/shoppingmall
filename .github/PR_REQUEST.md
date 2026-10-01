## 목적

이미 `main`에 병합된 PR 생성 전용 경로를 실제 시험할 수 있도록 후속 검증 문서를 현재 상태에 맞춘다.

## 변경 요약

- 개발환경 문서의 최초 도입 전용 bootstrap 안내를 PR #8 병합 후 상태에 맞게 고친다.
- 작업현황에 원격 `main`의 정확한 SHA와 첫 실제 생성 시험의 경계를 남긴다. 워크플로·gate·제품 코드는 이번 후속 PR에서 수정하지 않는다.

## 영향

- 이번 후속 변경은 문서만 다룬다. 제품 화면·API·DB·실사용 자료와 두 워크플로는 변경하지 않는다.
- 원격 `main@2bad168a03b95a9ce9a43cafc76b54318a038dbe`에는 PR #8을 통해 생성 전용 워크플로와 LF gate가 이미 병합되었다. `pr-request/**`는 자동 병합 경로라 이번 시험에 사용하지 않는다.

## 검증

- 앞선 PR #8의 코드 변경은 로컬 제품/시안 시험 230건 중 176 pass·54 환경 skip·0 fail, PR 본문 검사 8 pass, typecheck/lint/build exit 0, 지정 WSL 동일 SHA의 Linux gate 구문·YAML·본문 검사 exit 0으로 확인했다. 54 skip은 통과로 세지 않는다.
- 이번 후속 문서는 정확한 HEAD의 본문 검사와 diff 검사, 지정 WSL 동일 SHA 검증을 수행하고 결과를 작업현황에 남긴다.

## 미검증

- 새 워크플로의 실제 GitHub Actions 태그 실행과 PR 생성/본문 갱신, 원격 CI·branch protection·Actions PR 생성 권한은 실제 요청 결과를 확인하기 전까지 미검증이다. `GITHUB_TOKEN` 생성 PR의 `pull_request` CI는 승인 대기일 수 있어 브랜치 push CI와 PR 체크를 별도로 확인한다.
- 이번 변경은 제품 기능이나 WSL DB·Oracle staging·사용자 인수의 통과 증거가 아니다.

## 롤백

- 이번 후속 문서에 문제가 발견되면 문서만 후속 PR에서 되돌린다. 이미 `main`에 들어간 자동화·gate와 제품 코드·DB는 보존한다.
- 실패한 요청 태그는 실제 원격 ref를 확인한 뒤 정확한 이름만 정리한다. 브랜치·다른 태그·기존 PR을 일괄 삭제하지 않는다.
