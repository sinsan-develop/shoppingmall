# S7 카카오 mock 공유 인증 경합 보완 계약

2026-10-14 신산님이 추가 인증 세대 가드·탭 간 직렬화, 기존 로그인/로그아웃/역할 변경과 Web 계정 화면의 수정 범위를 승인했다. 기존 설계서·작업계획서·기본 mock 계약은 수정하지 않는다. 이 문서는 승인된 제한 보완을 기록한다.

## 서버

- 정상 `disabled` 모드는 기존 동작 그대로다. 실제 폐기 DB/manifest를 확인해 활성화한 개발 mock에서만 아래 가드를 사용한다. 새 HTTP 필드·쿠키·계정 연결·역할·DBschema/migration·Secret을 추가하지 않는다.
- registry가 메모리 인증 세대를 갖고 각 거래의 시작 세대를 저장한다. 허용 Origin·입력 확인을 마친 기존 이메일 로그인, 로그아웃, 역할 변경이 시작되면 세대를 증가시킨다. 실패한 로그인 시도도 보류 mock을 무효화한다. 이는 가상 고객 하나만 사용하는 개발 QA 프로세스의 보수적 전역 무효화이며, 다른 보류 mock은 안전한 재시작을 요구한다.
- mock 완료는 점유 전·DB transaction의 세션/감사 INSERT 전·COMMIT 전 및 결과 반환 전에 세대를 확인한다. 불일치는409/Set-Cookie 없음. COMMIT 대기 중 세대가 바뀌었다면 새로 발급한 정확 token의 세션만 revoke하고 cookie를 내보내지 않는다. 기존 이메일 세션/감사/계정은 변경하지 않는다.
- 취소는 기존 S256/state 소유 증명을 확인한다. 세대가 바뀐 대기 거래도 증명 있는 취소를 받아 닫고, 교환 중 거래의 점유를 풀어 두 번째 발급 경로를 만들지 않는다.
- 구현: registry/service/repository 및 기존 AuthController의 세 핸들러 접점만 수정한다. 정상 역할·비밀번호 판정/Origin·응답 계약은 유지한다.

## Web

- 개발 mock의 start/complete와 같은 Origin의 기존 이메일 제출·계정 로그아웃은 `navigator.locks`의 고정 개발 인증 lock으로 HTTP 응답과 고객 me 확인이 끝날 때까지 직렬화한다. 잠금 획득 실패는 성공으로 처리하지 않는다.
- Web Locks 미지원에서는 mock 시작을 거부하고 이메일 로그인을 안내한다. 기존 이메일/로그아웃은 그대로 이용할 수 있다. 브라우저 storage에 verifier/token을 넣거나 새 인증정보 저장을 도입하지 않는다.
- 다른 탭의 먼저 시작된 기존 인증은 서버 세대 가드로 오래된 거래를 거부한다. 이미 교환 중이라면 Web lock의 응답 순서로 뒤의 인증 cookie가 최종 상태가 되게 한다. `/auth/me`는 실제 customer 확인에만 사용하고 명시 HTTP 거부를 이전 cookie 성공으로 대체하지 않는다.
- 구현: 기존 KakaoMockLogin/client/login 및 새로 승인된 `apps/web/app/account/page.tsx`·관련 시험. 새 공통 인증 체계나 정상 production 정책 개편은 하지 않는다.

## 순서와 완료 조건

1. 기존 공유-cookie RED를 유지하고 registry의 세대/교환 중 취소·점유·DB 실패 시험을 선행한다.
2. 서버 가드→기존 인증 접점→Web 탭간 lock 순서로 단일 writer가 구현한다.
3. 같은 실제 폐기 DB 경합은 최신 customer-b 유지/늦은mock cookie0/기존 계정과 정상 세션 보존으로 GREEN이어야 한다. 로그인뿐 아니라 로그아웃·실패 로그인·역할 변경 무효화와 disabled 기존회귀도 확인한다.
4. 계획의 실제 Chrome·Android 복귀/본인 조회, 표적 검사·type/lint/build, 최종 독립review·정리·Git gate를 이어간다. 새 가드가 통과했다고 전체 계획/실카카오 인수를 완료로 표시하지 않는다.

복구는 개발 mock 비활성화와 이 보완 커밋만 되돌리는 것이다. DB migration rollback이나 기존 계정 자료 삭제는 없다. 인증 세대는 재시작 시 사라지고 기존 거래도 함께 사라진다.
