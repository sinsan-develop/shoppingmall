# 인증 링크 SMTP 전달 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가입·비밀번호 복구의 기존 비동기 접수 뒤 실제 SMTP 링크 전달을 연결하되, 모의 모드·권한·비밀 보호를 유지한다.

**Architecture:** 기존 `auth_intake_jobs`와 작업자를 그대로 사용한다. `delivery.ts`가 `disabled`·루프백 `mock`·서버 측 `smtp`를 구분하고, 작업자만 SMTP를 호출한다. SMTP 설정 오류는 서버 시작 전 실패 폐쇄하고 발송 실패는 기존 작업 재시도 계약을 따른다.

**Tech Stack:** Node.js >=22.13.0, TypeScript, NestJS, PostgreSQL, pnpm 11, Nodemailer 10 및 격리 SMTP 시험 서버.

**Spec:** `docs/superpowers/specs/2026-10-13-auth-smtp-delivery-design.md`

## Global Constraints

- 기존 `docs/design/DESIGN.md`, `docs/WORK_PLAN_20260-10-11.md`, DB schema 및 0026·0027 SQL을 수정하지 않는다.
- 공개 가입·복구 API는 계정 존재 여부와 관계없이 동일한 `{status:'accepted'}`를 유지하며 요청 처리 중 SMTP를 호출하지 않는다.
- 링크·토큰·비밀번호·실제 주소를 DB, 일반 로그, Git, PR 본문에 원문으로 남기지 않는다. 루트 `.env`의 기존 노출 자격정보를 읽거나 사용하지 않는다.
- `disabled`는 실패 폐쇄, `mock`은 기존 개발 루프백 조건을 유지한다. SMTP는 설정이 완전할 때만 선택 가능하며 `admin_setup` 전송을 새로 허용하지 않는다.
- 보호 `shoppingmall` DB에 시험 거래를 만들지 않는다. QA DB 0026·0027 적용, 실제 외부 발송, Oracle 이전은 각각 기존 별도 승인 경계를 따른다.
- 1단계는 변경 기능과 직접 영향받는 정상·실패·권한만 확인한다. 광범위한 브라우저·부하·복구는 2단계다.

## Review Focus

1. 누락·잘못된 SMTP 설정 또는 HTTP 링크 → 시작 전에 실패 폐쇄: Task 1의 설정 시험.
2. 등록/미등록 이메일 교차 접수 → 응답 내용 동일·부적격 주소 무발송: Task 3의 HTTP/DB 시험.
3. SMTP 거부·시간초과와 작업자 재시작 → 비밀 없는 오류·한정 재시도: Task 2·3의 작업자 시험.
4. 옛 작업의 늦은 재시도 → 새 링크 폐기·중복 발송 없음: Task 3의 경합 시험.
5. 인증 링크와 공급자 오류의 원문 → DB·일반 로그에 노출 없음: Task 1·3의 비노출 시험.

---

## 파일 책임

- `apps/api/src/auth/delivery.ts`: 전달 모드·URL·설정 검증과 SMTP 전송. 기존 비공개 mock sink는 유지.
- `apps/api/src/auth/intake-worker.ts`, `apps/api/src/main.ts`: `smtp` 모드의 기존 작업자 가동과 시작 전 설정 검사.
- `apps/api/src/auth/intake.ts`, `onboarding.ts`, `password-recovery.ts`: 기존 함수·응답 계약 유지; 전달 모드 통합에 필요한 최소 호출부만 수정.
- `apps/api/package.json`, `pnpm-lock.yaml`, `.env.example`: 인증 서버 전용 SMTP 의존성·비밀 없는 설정 이름.
- `apps/api/test/auth-smtp-delivery.test.mjs`와 기존 `auth-intake*`, `auth-onboarding-http-db`, `auth-password-reset-db` 시험: 격리 전송·실DB 접수·재시도 경계.

### Task 1: SMTP 설정·전달 어댑터

**Files:** Modify `apps/api/src/auth/delivery.ts`, `apps/api/package.json`, `pnpm-lock.yaml`, `.env.example`; create `apps/api/test/auth-smtp-delivery.test.mjs`.

**Interfaces:** `assertAuthDeliveryBootConfig(env: NodeJS.ProcessEnv): void`; 기존 `requireAuthDelivery(purpose, mockSink?)`와 `deliverAuthLink(purpose, email, url, mockSink?)` 서명을 유지한다. 새 모드는 `AUTH_DELIVERY_MODE=smtp`; 비밀 없는 설정 이름은 `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURITY`(`implicit_tls` 또는 `starttls`), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `AUTH_LINK_ORIGIN`이다. 실제 값은 저장소에 넣지 않는다.

- [ ] **Step 1: 실패 시험 작성.** `smtp` 설정 누락, 무효 포트·보안 모드, HTTPS 아닌 링크·다른 origin·URL 사용자정보/검색식, 유효하지 않은 수신 주소와 `admin_setup` 목적을 거부하고 어떤 오류·로그에도 링크/자격정보 원문이 없는지 단언한다. `disabled` 및 기존 루프백 `mock`의 성공/거부 기대값은 그대로 둔다.
- [ ] **Step 2: 대상 시험 RED 확인.** `pnpm exec node --import tsx --test apps/api/test/auth-smtp-delivery.test.mjs`에서 새 설정/전달 기능 부재로 실패하고 기존 시험 기준은 바꾸지 않는다.
- [ ] **Step 3: 최소 구현.** `nodemailer@10`을 API 의존성에 고정하고, 필요한 경우 격리 시험 서버 `smtp-server`만 devDependency로 추가한다. `SMTP_SECURITY=implicit_tls`는 TLS 연결, `starttls`는 필수 TLS 업그레이드로 설정한다. 메일에는 정규화된 요청 주소 한 명과 목적별 제목·일회용 링크만 포함한다. 외부로 전달될 URL은 정확한 HTTPS `AUTH_LINK_ORIGIN` 및 예상 경로와 토큰 fragment만 허용한다. SMTP 예외는 원문 없이 내부 코드로 변환한다.
- [ ] **Step 4: 대상 시험 GREEN 및 commit.** 위 대상 시험과 기존 `apps/api/test/auth-onboarding-schema-db.test.mjs`를 실행해 0 fail을 확인하고 이 Task 파일만 커밋한다.

### Task 2: 서버 시작·작업자 모드 연결

**Files:** Modify `apps/api/src/auth/intake-worker.ts`, `apps/api/src/main.ts`; test `apps/api/test/auth-intake-worker.test.mjs`, `apps/api/test/auth-smtp-delivery.test.mjs`.

**Interfaces:** Task 1의 `assertAuthDeliveryBootConfig(env)`를 `app.listen` 전에 호출한다. 기존 `startAuthIntakeLoop(pool): () => void`과 `processAuthIntakeOnce(pool, now, mockSink?)` 서명 및 리스·최대 5시도·만료 계약은 유지한다.

- [ ] **Step 1: 실패 시험 작성.** 유효한 `smtp`에서 작업자가 시작되고 `disabled`/불완전 설정에서는 시작 전 거부되며, 기존 `mock` 루프백 조건이 넓어지지 않음을 단언한다. SMTP 전송 예외 후 작업이 `pending` 또는 최종 `dead`로 전이하고 오류 기록은 비밀 없는 코드임을 확인한다.
- [ ] **Step 2: 대상 시험 RED 확인.** `pnpm exec node --import tsx --test apps/api/test/auth-intake-worker.test.mjs apps/api/test/auth-smtp-delivery.test.mjs`에서 신규 조건만 실패한다.
- [ ] **Step 3: 최소 연결.** `main.ts` 시작 전에 Task 1 설정 검사를 호출하고 `smtp` 또는 기존 허용된 `mock`에서만 작업자 루프를 시작한다. 공개 요청 경로에 SMTP 호출을 추가하지 않는다.
- [ ] **Step 4: 대상 시험 GREEN 및 commit.** 위 대상 시험 0 fail, `pnpm --filter @shoppingmall/api typecheck` exit 0을 확인하고 이 Task 파일만 커밋한다.

### Task 3: 격리 SMTP와 사용자 흐름의 핵심 검증

**Files:** Test `apps/api/test/auth-smtp-delivery.test.mjs`, `apps/api/test/auth-onboarding-http-db.test.mjs`, `apps/api/test/auth-password-reset-db.test.mjs`, `apps/api/test/auth-intake-db.test.mjs`; 필요 시 변경 범위 코드·`WORK_STATUS.md`.

**Interfaces:** 기존 공개 가입·복구 화면/API·DB와 Task 1·2의 전달 설정을 그대로 사용한다. 별도 신규 공개 엔드포인트·DB migration은 없다.

- [ ] **Step 1: 실패 시험 작성.** 루프백 격리 SMTP 서버와 일회성 격리 DB에서 가입·복구의 접수→작업자→메일의 정확한 수신 주소/링크→1회용 완료·DB 저장·조회, 미등록 복구/중복 가입 무발송, SMTP 거부·시간초과·재시작 재시도, 교차 작업 경합, 비밀 비노출을 각각 단언한다. 브라우저와 실제 공급자 수신은 별도 미확인으로 기록한다.
- [ ] **Step 2: 대상 시험 RED/원인 확인 후 최소 보정.** 새 실패가 드러난 경우에만 `delivery.ts`·작업자·기존 호출부를 수정한다. 기존 테스트의 기대값·합격 기준을 낮추지 않는다.
- [ ] **Step 3: 핵심 GREEN 검증.** `pnpm exec node --import tsx --test apps/api/test/auth-smtp-delivery.test.mjs apps/api/test/auth-intake-worker.test.mjs` 및 격리 DB용 기존 인증 HTTP/DB 시험을 0 skip·0 fail로 확인한다. DB 시험은 정확한 승인 Git SHA의 격리 자원과 사전 선언·사후 제거를 사용한다. 변경 영향의 `pnpm --filter @shoppingmall/api typecheck`, `pnpm --filter @shoppingmall/api build`, 변경 파일 lint를 실행한다.
- [ ] **Step 4: 상태·정리·commit.** 신산님이 직접 확인할 가입/복구 화면과 방법, `구현 완료·핵심 동작 확인`/`구현했지만 실제 수신 미확인`을 구분한다. 외부 메일은 비밀번호 교체·정확한 대상/범위 승인 전 호출하지 않는다. 격리 DB·SMTP 서버 잔류 0과 보호 DB 쓰기 0을 기록하고 변경 파일만 커밋한다.

## 실행 전 승인 경계

이 계획은 기존 `WORK_PLAN_20260-10-11.md`의 승인 범위를 넓히지 않는다. 신산님의 계획 검토·실행 승인을 받은 뒤 코드 구현을 시작한다. 로컬 commit은 원격 전송 승인이 아니며, 앞서 자동 검토가 거절한 push를 우회하지 않는다. 실제 외부 발송·기존 비밀번호 재사용·QA DB 지속 migration·Oracle 배포는 별도 확인 전 실행하지 않는다.
