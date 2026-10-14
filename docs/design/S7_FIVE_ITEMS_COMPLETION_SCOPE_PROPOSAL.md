# 지정 다섯 항목 개발 완료 경계·권고 계약

- 작성: 2026-10-14, 어울. 기준 `codex/s7-mobile-20261014@2ba7985`.
- 신산님 최신 지시: PG mock 복귀, 원격 Android 푸시 기능, 정식 초기 관리자 설정, 모바일 최종 통합·배포판/main·WSL 배포/정리, S8 연결·매뉴얼 리허설 **다섯 항목만** 완료하고 보고한다.
- 실제 메일/HTTPS, 실제 카카오·PG·푸시·실기기 확인, OS PDF 저장·열기는 보류·개발 완료 조건 제외다. 기존 DESIGN·WORK_PLAN은 수정하지 않는다.
- 이 문서는 새 API/기기정보 저장·관리자 전달·배포판에 필요한 정확한 결정을 제시한다. 작성 자체가 내용·schema/인증/지속 DB 변경 승인이나 구현 완료가 아니다.

## 1. PG mock 복귀

[PG 별도 계약안](S7_PG_MOCK_RETURN_CONTRACT_PROPOSAL.md)의5개 개발 전용 POST·고정 Web/Android 복귀·서버 결제 검증/재조회·보관된 사건 reconcile을 권고한다. 기존 결제 processor 기준·0원 정책·schema는 유지한다. 완료 증거는 새 브라우저 흐름과 실제 폐기 DB의 소유/금액/중복·실패·회복이다. 기존 구매/첨부/알림 전수 검사를 반복하지 않는다.

## 2. 원격 Android 푸시의 개발 기능

권고 공급자는 기존 `expo-notifications`를 사용하는 **Expo Push Service**다. 직접 FCM adapter보다 새 앱 SDK를 적게 추가할 수 있다. Android 실제 연결에는 Expo projectId 및 Firebase/FCM 설정이 필요하다([공식 설정](https://docs.expo.dev/push-notifications/push-notifications-setup/), [FCM 자격정보](https://docs.expo.dev/push-notifications/fcm-credentials/)). 현재 저장소 app 설정에 projectId/google-services 설정이 없고, 루트 설정 키에도 해당 연결 설정이 없다. 새 외부 계정·키를 임의 생성하지 않는다.

개발 구현 범위:

- customer 명시 기기등록/해제·상태조회 API와 Android 권한 확인→SDK token 획득→본인 서버 저장→서버 동의/세션 확인을 연결한다. OS 권한을 앱 시작에 자동 요청하지 않는다. 초기 설정 부족은 오류/미확인으로 표시하고 가상 token을 실제 SDK token으로 대체하지 않는다.
- 제안 API: POST `/customer/push-devices` `{provider:'expo',platform:'android',installationId,token}`, GET `/customer/push-devices`, DELETE `/customer/push-devices/:id`. 기존 세션/customer·정확 Origin·본인 소유를 확인한다. 목록/응답/로그에 raw token을 내보내지 않는다.
- 제안 신규 migration: `push_devices`(account/session 연결, 설치 UUID, provider/platform, token hash·암호문, 등록/해제 시각·상태), `push_deliveries`(기존 알림 job/device 연결, ticket/receipt·상태·시각·안전 오류코드). 같은 token의 활성 등록은1개이며 비활성 이력은 보존한다. 타 계정 임의 이전·타인 해제를 거부한다. 종료/만료 세션의 기기는 발송 후보에서 제외한다. 같은 기기의 새 로그인은 이전 정상 해제 또는 명시 소유 재확인 후 연결하며, 앱 저장 설치ID만을 인증 증명으로 취급하지 않는다.
- 알림 접수 때도 등록 여부를 실제 DB의 본인 활성 기기/세션에서 계산한다. 현재 함수의 `registeredDevice` 인수나 hardcoded false만 유지한 채 발송 adapter만 만들고 완료라고 하지 않는다. 기존 동의·채널 선택 계약을 유지하면서 source 조회·queue·worker를 함께 연결한다.
- 기존 알림 worker와 연결해 동의·활성 세션·기기등록을 발송 직전에 확인한다. generic 안내와 허용된 화면 식별만 보내고 개인정보/인증/임의 URL은 payload에 넣지 않는다. 서버 receipt의 `DeviceNotRegistered`는 해당 기기를 비활성화한다. HTTP429/5xx·timeout·lease/retry·중복·영구 거부를 기존 알림 계약에 맞춰 처리한다.
- 공급자 전송 기본값은 disabled. `PUSH_TOKEN_ENCRYPTION_KEY`·Expo project 설정·push access token은 승인된 배포 시에만 비공개 저장소로 설정한다. 개발 QA는 일회성 키와 격리 HTTP 공급자 시험기를 사용한다. 실제 Expo/FCM 전송·수신 확인은 보류한다.
- `expo-notifications`의 ticket/receipt 수락은 실제 기기 수신 증거가 아니다([공식 발송·receipt 설명](https://docs.expo.dev/push-notifications/sending-notifications/)). 완료보고에서 adapter/API/DB 핵심 확인과 공급자 설정·실수신 미확인을 분리한다.

native 설정 변경은 Android 푸시에 직접 필요한 기존 차단 항목 `ACCESS_NETWORK_STATE`, `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED`, `com.google.android.c2dm.permission.RECEIVE`만 재검토한다. 실제 최종 manifest diff를 확인하고 badge/추적 등 무관 권한은 추가하지 않는다. Firebase/EAS 연결 파일·계정 권한이 없으면 native 설정 부족으로 남기며 이를 mock PASS로 숨기지 않는다. 계약 승인 뒤 별도 실행 계획에 실제 파일·schema/보관·암호화 키 경계와 정확 native diff를 고정한다.

## 3. 정식 초기 관리자 기능·첫 계정

확인한 현재 사실: WSL `local-postgres/shoppingmall`, systemID `7622490131194466339`, migration 이력26건, admin 역할0건. 루트 `.env`에 `EMAIL_TO` 설정이 존재한다. 이메일 값은 출력하지 않았다. 기존 CLI는 `shoppingmall_auth_admin_1010`의 private QA IPC만 허용하고 SMTP의 admin_setup은 거부한다.

실제 메일/HTTPS 보류를 지키는 권고는 **명시 운영자 CLI→소유자 확인→30분·1회용 설정 수단을 소유자 전용 비공개 파일에 전달→사용자가 비밀번호 설정→첫 관리자 로그인**이다.

- 이 방식은 QA 링크를 정식 결과로 승격하는 우회가 아니라 별도 admin_setup 전달 방식·CLI 허용 경계를 승인받아 구현하는 것이다. 공개 HTTP/stdout/일반 로그로 raw 링크를 전달하지 않는다. 파일은 비공개 수단이며 Secret처럼 취급한다.
- target은 위 WSL DB의 최초 관리자1개, 이메일은 기존 `EMAIL_TO`; 신산님의 해당 이메일 소유 확인과 지속 admin 생성 승인이 필요하다. 가상 구매/결제/정산 거래는 보호 DB에 만들지 않는다.
- 초기 계정은 pending 상태만 만들고 설정 전 로그인/세션 발급을 금지한다. 기존 admin 존재 시 중단, 재발급은 소유 확인 후 이전 수단 폐기, 30분 만료/1회 소비/본인 설정 이후에만 활성화한다. 고정 암호나 Agent 임의 관리자 암호를 만들지 않는다.
- 파일 전달은 명시 opt-in·정확 경로·소유자 권한(WSL0600/Windows 소유자 전용 ACL)·symlink/overwrite 거부·원문 로그0·폐기 확인을 검증한다. 실제 메일 경로·SMTP signup/reset 정책은 변경하지 않는다.
- 최초 실제 계정 생성은 격리 DB/HTTP에서 위 경계가 검증되고 target·기존 행·백업/복구 조건을 다시 확인한 후에만 수행한다. 데이터 변경 실패는 임의 전체복원/계정 삭제로 복구하지 않는다.

## 4. 모바일 통합·배포판/main·WSL 정리

현재 단계에 맞춰 **Metro가 필요 없는 standalone WSL 개발 후보 APK**와 모의 흐름용 개발 APK를 구분해 제공하는 것을 권고한다. standalone은 arm64-v8a/x86_64 설치 후보·실제 JS/native 버전/해시·서버 주소·설치법을 기록한다. 기존 개발 서명을 재사용하고 새 운영 서명키·Play/iOS 출시를 하지 않는다. 기존 개발 서명 후보를 운영 출시판이라고 부르지 않는다. 신산님이 운영 release 서명을 원하면 별도 키/보관·권한 결정을 받는다.

PG/푸시/관리자와 직접 영향 핵심 검사→동일 후보 WSL 검증→독립 C0/I0→PR→main 병합→merged-main smoke→WSL 정식 개발 배포→원격/로컬 branch 정리 순서다. 신산님의 이번 지시에서 허용한 배포 대상은 **WSL-server 개발 실행**이며 Oracle/공개 운영 이전은 보류다. 대상 서비스/DB를 바꾸거나 기존 공유 migration을 적용하는 것은 정확한 변경안을 확인한 별도 승인 뒤 수행한다.

현재 공유 DB는26개 이력으로, QA의28개 및 앞으로 만들 푸시 migration을 적용했다고 가정하지 않는다. 실제 SQL 해시·백업/격리 복원·기존 행 불변을 제시한 뒤 공유 적용 승인을 요청한다. 이 승인 전에는 새 테이블을 쓰는 정식 WSL 기능을 완료로 표시하지 않는다.

## 5. S8 연결·매뉴얼 리허설

앞 네 항목과 동일 후보의 고객/판매자/관리자 사용자 화면→HTTP→DB 핵심 흐름 및 로그인/권한·데이터 위험을 확인한다. 기존 완료 근거는 재사용하되 변경으로 직접 영향받는 경로만 다시 확인한다. 매뉴얼은 그 후보에서 실제 따라간 경로/버튼/오류와 일치시킨다. broad 부하/복구·다기기·외부 수신·OS PDF를 다시 개발 진도로 넣지 않는다.

실제 메일/HTTPS·외부 카카오/PG/푸시·실기기·OS PDF·운영 출시를 제외한 **지정 다섯 항목의 개발 완료**로만 보고한다. 설정 부족으로 사용하지 못하는 기능은 숨기지 않고 `구현했지만 동작 미확인` 또는 `부분 구현`으로 표시하며 그 상태를 구현 완료라고 바꾸지 않는다.

## 내용 승인 시 필요한 정확한 결정

1. PG 별도 계약안의5개 mock API·서버 검증/reconcile·QA 쓰기 내용 승인.
2. Expo 기반 기기등록/adapter, 제안 customer API·기기/receipt 저장·암호화·필요 native 변경을 개발 범위로 승인. 실제 계정/키 설정·외부 발송은 보류, 지속 DB 적용은 SQL·백업 증거 뒤 별도 판단.
3. `EMAIL_TO`를 본인 소유로 확인하고 위 WSL DB에 최초 관리자1개 및 비공개 일회 파일 전달 방식을 승인하거나, 다른 소유자/대상을 지정.
4. 기존 개발 서명의 standalone WSL 개발 후보를 최종 개발 배포 산출물로 승인(운영 release/Play 서명 아님).

내용 승인 뒤 별도 실행 계획을 작성·검토받고 단일 writer 어울이 순서대로 진행한다. 위 구체 결정 전 제품/권한/DB/키를 임의 변경하지 않는다.
