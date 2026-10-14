import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { KakaoMockRegistry } from '../src/auth/kakao-mock-registry.ts';

const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const state = 'X'.repeat(43);
const startInput = { client: 'web', state, challenge, method: 'S256' };
function registry(now = () => 0) { return new KakaoMockRegistry({ webOrigin: 'http://127.0.0.1:9091',
  identifier: 'mock:s7:7a141001:customer-a', now, randomBytes }); }
function approve(reg, client = 'web') {
  const start = reg.start({ ...startInput, client }, '127.0.0.1');
  const fragment = new URLSearchParams(new URL(start.authorizeUrl).hash.slice(1));
  const decision = reg.decision({ transactionId: start.transactionId, decisionTicket: fragment.get('decisionTicket'), outcome: 'approve' });
  const returned = new URLSearchParams(new URL(decision.returnUrl).hash.slice(1));
  return { start, ticket: fragment.get('decisionTicket'), decision, input: { transactionId: start.transactionId,
    state, code: returned.get('code'), verifier } };
}
test('S256 증명 확인 후만 가상 고객 세션을 정확히 한 번 발급한다', async () => {
  const reg = registry(); const flow = approve(reg); let sessions = 0;
  assert.equal(new URL(flow.start.authorizeUrl).origin, 'http://127.0.0.1:9091');
  assert.equal(new URL(flow.decision.returnUrl).pathname, '/auth/kakao-mock/return');
  assert.equal(flow.decision.returnUrl.includes(verifier), false);
  assert.deepEqual(await reg.complete(flow.input, async identifier => {
    assert.equal(identifier, 'mock:s7:7a141001:customer-a'); sessions++; return { token: 'synthetic-session', expiresAt: new Date(86400000) };
  }), { token: 'synthetic-session', expiresAt: new Date(86400000) });
  await assert.rejects(reg.complete(flow.input, async () => { sessions++; }), e => e.status === 409);
  assert.equal(sessions, 1);
});

test('기존 인증 시작은 대기 mock을 무효화하며 교환중 DB 확정 가드도 거부한다',async()=>{
  const reg=registry();assert.equal(typeof reg.invalidateAuth,'function');
  const old=approve(reg);reg.invalidateAuth();let sessions=0;
  await assert.rejects(reg.complete(old.input,async()=>{sessions++;}),e=>e.status===409);assert.equal(sessions,0);
  assert.deepEqual(reg.cancel({transactionId:old.input.transactionId,state,verifier}),{status:'cancelled',mockOnly:true});
  const current=approve(reg);let release,assertCurrent;
  const held=new Promise(resolve=>release=resolve);
  const result=reg.complete(current.input,async(_identifier,guard)=>{
    assertCurrent=guard;await held;guard();sessions++;return {token:'synthetic',expiresAt:new Date(86400000)};
  });
  assert.equal(typeof assertCurrent,'function');reg.invalidateAuth();assert.throws(assertCurrent,e=>e.status===409);
  const denied=assert.rejects(result,e=>e.status===409);release();await denied;assert.equal(sessions,0);
  const fresh=approve(reg);await reg.complete(fresh.input,async(_identifier,guard)=>{
    guard();sessions++;return {token:'synthetic',expiresAt:new Date(86400000)};
  });assert.equal(sessions,1);
});
test('잘못된 증명·ticket과 주입 필드는 로그인 부작용 없이 거부한다', async () => {
  const reg = registry(); const flow = approve(reg); let sessions = 0;
  for (const patch of [{ state: 'Y'.repeat(43) }, { verifier: 'Z'.repeat(43) }, { code: 'Y'.repeat(43) }, { role: 'admin' }]) {
    await assert.rejects(reg.complete({ ...flow.input, ...patch }, async () => { sessions++; }), e => [400,401].includes(e.status));
  }
  assert.equal(sessions, 0);
  assert.throws(() => reg.start({ ...startInput, accountId: 'injected' }, '127.0.0.1'), e => e.status === 400);
  assert.throws(() => reg.start({ ...startInput, method: 'plain' }, '127.0.0.1'), e => e.status === 400);
  assert.throws(() => reg.decision({ transactionId: flow.start.transactionId, decisionTicket: 'bad', outcome: 'approve' }), e => e.status === 401);
  assert.throws(() => reg.decision({ transactionId: flow.start.transactionId, decisionTicket: flow.ticket, outcome: 'approve' }), e => e.status === 409);
});
test('동시 완료와 교환 중 취소는 발급 한 건을 넘지 않는다', async () => {
  const reg = registry(); const flow = approve(reg); let release, calls = 0;
  const held = new Promise(resolve => { release = resolve; });
  const first = reg.complete(flow.input, async () => { calls++; await held; return { token:'synthetic', expiresAt:new Date(86400000) }; });
  await assert.rejects(reg.complete(flow.input, async () => { calls++; }), e => e.status === 409);
  assert.throws(() => reg.cancel({ transactionId: flow.input.transactionId, state, verifier }), e => e.status === 409);
  release(); await first; assert.equal(calls, 1);
});
test('취소·실패·만료·서버 재시작 뒤에는 고객 세션을 발급하지 않는다', async () => {
  let now = 0; const reg = registry(() => now);
  for (const outcome of ['cancel','fail']) {
    const started = reg.start(startInput, '127.0.0.1');
    const ticket = new URLSearchParams(new URL(started.authorizeUrl).hash.slice(1)).get('decisionTicket');
    assert.ok(new URL(reg.decision({ transactionId: started.transactionId, decisionTicket: ticket, outcome }).returnUrl).hash.includes('error='));
    await assert.rejects(reg.complete({ transactionId:started.transactionId, state, verifier, code:'Z'.repeat(43) }, async () => { assert.fail('session prohibited'); }), e => e.status === 409);
  }
  const flow = approve(reg); now = 60001;
  await assert.rejects(reg.complete(flow.input, async () => { assert.fail('expired code'); }), e => e.status === 401);
  now = 0; const fresh = approve(reg); now = 300001;
  await assert.rejects(reg.complete(fresh.input, async () => { assert.fail('expired transaction'); }), e => e.status === 401);
  await assert.rejects(registry().complete(fresh.input, async () => { assert.fail('restart'); }), e => e.status === 401);
});
test('거래 한도와 주소별 rate 한도는 각각 독립적으로 제한된다', () => {
  let now = 0; const reg = registry(() => now);
  for (let i=0;i<10;i++) reg.start(startInput, '127.0.0.1');
  assert.throws(() => reg.start(startInput, '127.0.0.1'), e => e.status === 429);
  now=300001; assert.ok(reg.start(startInput,'127.0.0.1').transactionId);
  const many = registry(); for (let i=0;i<1000;i++) many.start(startInput, `client-${i}`);
  assert.throws(() => many.start(startInput,'new-client'), e => e.status === 429);
});
test('고정 Android 복귀·증명 있는 명시취소·DB 실패는 실패 폐쇄된다', async () => {
  const reg = registry(); const flow = approve(reg, 'android');
  const url = new URL(flow.decision.returnUrl); assert.equal(`${url.protocol}//${url.host}${url.pathname}`, 'owoolmall-dev://auth/kakao-mock/return');
  assert.throws(() => reg.cancel({ transactionId:flow.start.transactionId, state, verifier:'Z'.repeat(43) }), e => e.status === 401);
  assert.deepEqual(reg.cancel({transactionId:flow.start.transactionId,state,verifier}), {status:'cancelled',mockOnly:true});
  assert.deepEqual(reg.cancel({transactionId:flow.start.transactionId,state,verifier}), {status:'cancelled',mockOnly:true});
  const bad = approve(reg); await assert.rejects(reg.complete(bad.input, async () => { throw Error('private-sql-detail'); }), e => e.status === 503 && !e.message.includes('private-sql-detail'));
  await assert.rejects(reg.complete(bad.input, async () => { assert.fail('failure replay'); }), e => e.status === 409);
});
