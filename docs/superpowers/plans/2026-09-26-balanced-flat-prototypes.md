# 어울몰 균형형 Flat v2 시안 구현 계획

> 작업 담당: 어울 단일 writer. 구현 시 `superpowers:executing-plans`를 사용해 아래 Task를 순서대로 수행한다. 단계별 확인란은 실제 증거로만 완료 표시한다.

**목표:** 승인된 v1 시안과 클릭형 흐름을 보존하면서 고객·판매자·관리자에게 동일한 균형형 Flat 표현을 적용한 별도 검토본을 제공한다.

**구조:** 기존 CSS와 HTML을 수정하지 않고, 추가로 읽는 Flat v2 스타일시트와 별도 HTML 진입점을 만든다. 클릭형 v2는 기존 역할별 JavaScript를 그대로 사용하며 데이터·상태·권한 동작을 복제하거나 바꾸지 않는다. 관리자 프로모션은 현재 정본 클릭형 `admin.html`에 없으므로 이 작업에서 신규 기능으로 추가하지 않고, 승인된 시각 비교의 대표 예시로만 다룬다.

**기술:** 정적 HTML/CSS, 기존 classic JavaScript, Node `node:test`. 새 패키지·CDN·서버·DB 없음.

**설계:** [승인된 균형형 Flat 설계](../specs/2026-09-26-balanced-flat-prototype-design.md), [프로젝트 디자인 기준](../../design/DESIGN.md).

## 공통 제약

- `docs/design/assets/*-v1.html`, `owool-static-v1.css`, `docs/design/prototypes/customer.html`, `seller.html`, `admin.html`, `shared.css`, 역할별 `.js`를 덮어쓰거나 동작 변경하지 않는다.
- 브랜드명 어울몰, 황금 `#c79a3e`·크림·먹빛, 고운바탕 제목·가격, Noto Sans KR 본문·UI를 유지한다.
- 본문 12px, 주요 제목 18px, 상품명 13px, 가격 14px, 모바일 주요 입력 16px 기준을 유지한다.
- 카드·패널 8px, 버튼·입력 6px을 후보값으로 사용하고 그림자·hover 상승·장식용 히어로 그라데이션을 제거한다. 상태 문구와 focus 표시는 유지한다.
- 2026-09-27 신산님은 v2를 향후 제품 시각 기준으로 채택했다. v1은 비교·복구용으로 보존한다. 시각 채택은 실제 브라우저 QA 완료가 아니며 프로모션 결제 적용·비용 부담·정산 로직은 포함하지 않는다.
- 2026-09-27 신산님 지시·승인에 따라 `origin/main`의 `34b4186`에서 `codex/flat-v2-prototypes` 격리 worktree를 생성했다. 기존 `main`과 미추적 자료를 보존하며 각 Task를 작업 브랜치에 commit한다. 원격 push·PR·병합은 필수 검증과 승인 경계를 별도로 확인한다.

## 검토 중점

1. v2 상대경로가 깨지면 글꼴·스타일 또는 역할 JavaScript가 누락된다 → Task 1·2의 파일 연결 검사와 실제 브라우저 점검.
2. 원본과 v2의 내용이 달라지면 스타일 비교가 기능 비교로 바뀐다 → Task 1·2의 허용된 head/body 속성 차이 외 본문 동등성 검사.
3. 430px 또는 200% 확대에서 업무 버튼·수량 입력·정산 표가 겹친다 → Task 3의 viewport·확대 점검.
4. 그림자 제거로 선택·승인 대기·오류 상태가 구분되지 않는다 → Task 3의 텍스트·경계·focus/키보드 점검.
5. Flat CSS가 인쇄 전용 정산 서식에 영향을 준다 → Task 3의 인쇄 미리보기/PDF 점검; 실행 불가 시 미검증으로 기록.

---

### Task 1: Flat CSS와 고객 홈 비교본

**파일:**
- 생성: `docs/design/assets/owool-flat-v2.css` — `body[data-flat-v2]`로 범위를 제한한 단색 표면·경계·radius·상태 스타일
- 생성: `docs/design/assets/home-flat-v2.html` — 기존 `home-v1.html`과 같은 내용에 v2 CSS 연결 및 `data-flat-v2`만 추가
- 생성: `docs/design/assets/flat-v2.test.mjs` — 홈 링크·원본 본문 동등성·스타일 범위 검사

**연결:** `home-flat-v2.html`은 `owool-static-v1.css` 다음에 `owool-flat-v2.css`를 읽는다. v2 CSS는 클릭형 Task 2에서도 같은 파일을 소비한다. 검사에서 `flatHome`, `originalHome`, `flatCss`는 각각 해당 파일을 `readFileSync(..., 'utf8')`로 읽은 문자열이며 `bodyMarkup(html)`은 첫 `<body`부터 `</body>`까지의 부분 문자열이다.

- [x] **1. RED 검사 작성:** `flat-v2.test.mjs`에서 아래 이름과 기대값으로 검사한다. `<body>` 뒤 본문 비교는 v2의 `data-flat-v2`만 제거한 뒤 원본과 정확히 같아야 한다. title·추가 stylesheet만 head의 허용 차이다. 2026-09-27 검토에서 v2가 승인본으로 오인되지 않도록 하단 시안 상태 문구만 추가 예외로 허용했고, Windows CRLF/LF만 정규화했다. 그 밖의 본문은 동일하게 비교한다.

```js
test('flat home preserves v1 content and loads styles in order', () => {
  assert.match(flatHome, /href="owool-static-v1\.css"[\s\S]*href="owool-flat-v2\.css"/);
  assert.match(flatHome, /<body data-flat-v2>/);
  assert.equal(bodyMarkup(flatHome).replace('<body data-flat-v2>', '<body>'), bodyMarkup(originalHome));
});
test('flat rules are scoped and remove depth without changing type sizes', () => {
  assert.match(flatCss, /body\[data-flat-v2\]/);
  assert.match(flatCss, /box-shadow:\s*none/);
  assert.doesNotMatch(flatCss, /font-size\s*:/);
});
```
- [x] **2. 실패 확인:** `node --test docs/design/assets/flat-v2.test.mjs` → v2 파일 부재로 예상한 실패.
- [x] **3. 최소 구현:** 기존 홈 내용을 보존한 별도 HTML과 공통 v2 CSS를 만든다. CSS는 단색 히어로, 카드·패널 경계, 버튼·입력·상태, 선택 메뉴만 덮어쓰며 글자 크기와 실제 사진 자리는 바꾸지 않는다.
- [x] **4. 통과 확인:** 위 검사 0실패, `Get-FileHash`로 기록한 v1 CSS·홈 HTML 해시 불변 확인.
- [x] **5. 기록:** `WORK_STATUS.md`에 파일·검사·미검증·다음 Task를 기록하고 작업 브랜치에 commit.

### Task 2: 세 역할 클릭형 Flat 진입점

**파일:**
- 생성: `docs/design/prototypes/flat-v2/customer.html`, `seller.html`, `admin.html` — 원본 HTML의 역할·내용·상태 표식을 보존한 별도 진입점
- 생성: `docs/design/prototypes/flat-v2/flat-v2.test.mjs` — 상대경로·역할 분리·본문 동등성 검사

**연결:** 각 v2 HTML은 `../shared.css` → `../../assets/owool-flat-v2.css` 순서로 읽고 역할별 기존 `../customer.js`, `../seller.js`, `../admin.js`를 그대로 사용한다. `body[data-flat-v2]`만 시각 분기점이다. 검사에서 `flatHtml`/`originalHtml`은 반복 중인 역할의 v2/v1을 읽은 문자열이며 `normalizeFlatBody(html)`은 `bodyMarkup(html)`에서 ` data-flat-v2`만 제거한다.

- [x] **1. RED 검사 작성:** 역할별 `flat-v2.test.mjs`에서 아래 사례를 각각 실행한다. title·CSS link·script 경로와 `data-flat-v2`만 허용 차이로 정규화하고 `<body>` 본문은 원본과 정확히 비교한다.

```js
for (const role of ['customer', 'seller', 'admin']) {
  test(`${role} flat page keeps the same flow and local role script`, () => {
    assert.match(flatHtml, /href="\.\.\/shared\.css"[\s\S]*href="\.\.\/\.\.\/assets\/owool-flat-v2\.css"/);
    assert.match(flatHtml, new RegExp(`src="\\.\\./${role}\\.js"`));
    assert.equal(normalizeFlatBody(flatHtml), bodyMarkup(originalHtml));
  });
}
```
- [x] **2. 실패 확인:** `node --test docs/design/prototypes/flat-v2/flat-v2.test.mjs` → v2 파일 부재로 예상한 실패.
- [x] **3. 최소 구현:** 원본 세 HTML을 별도 파일로 보존 복제하고 허용된 title·link·script 경로·body 속성만 변경한다. 기존 역할 JS와 데이터는 수정하지 않는다.
- [x] **4. 통과 확인:** 위 검사와 기존 `customer.test.mjs`, `seller.test.mjs`, `admin.test.mjs`, `prototype-shell.test.mjs` 모두 0실패. 원본 HTML·JS·`shared.css` 해시 불변 확인.
- [x] **5. 기록:** `WORK_STATUS.md`에 결과와 브라우저 미검증 범위를 기록하고 작업 브랜치에 commit. 원격 push는 최종 검증 뒤 결정.

### Task 3: 검토 안내와 시각 QA

**파일:**
- 수정: `docs/design/prototypes/README.md` — v1/v2 역할별 시작 경로와 가상 기능 경계
- 수정: `docs/design/DESIGN.md` — Flat v2를 제품 시각 기준으로 연결, v1은 비교·복구용으로 유지
- 수정: `WORK_STATUS.md` — 실제 확인 결과와 남은 인수 항목

**연결:** Task 1·2의 진입점만 안내한다. 새 상태 모델이나 실제 프로모션 기능을 추가하지 않는다.

- [x] **1. 링크 검사 작성:** 기존 `prototype-shell.test.mjs`에 v2 링크와 v1 유지·가상 경계 안내 검사를 먼저 추가하고 실패를 확인한다.
- [x] **2. 문서 반영:** README와 DESIGN에 별도 비교 경로·현재 채택 상태 및 미검증 범위를 명시한다.
- [x] **3. 전체 정적 회귀:** `node --test docs/design/assets/typography.test.cjs docs/design/assets/flat-v2.test.mjs docs/design/prototypes/customer.test.mjs docs/design/prototypes/seller.test.mjs docs/design/prototypes/admin.test.mjs docs/design/prototypes/prototype-shell.test.mjs docs/design/prototypes/flat-v2/flat-v2.test.mjs` → 0실패.
- [ ] **4. 실제 화면 점검:** 허용된 브라우저에서 홈·고객·판매자·관리자 v1/v2를 1920×1080, 1440×900, 430×844와 200% 확대, 키보드 focus, 상태 구분, 인쇄 미리보기로 비교한다. 로컬 파일 열기가 정책상 차단되면 우회하지 않고 해당 항목을 미검증으로 남긴다.
- [ ] **5. 최종 기록·검토 요청:** 차이, 스크린샷/실행 증거, 미검증, 원본 해시 불변, 임시 자원 잔류를 `WORK_STATUS.md`에 적고 신산님께 Flat v2 승인 여부를 요청한다. 제품 UI 확정·개발 Stage 착수는 별도 게이트다.
