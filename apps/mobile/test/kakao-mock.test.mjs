import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes,createHash } from 'node:crypto';
import { createKakaoMockFlow,KakaoMockStartError } from '../src/kakao-mock-core.ts';
import { CustomerApiError } from '../src/customer-api.ts';
const id='T'.repeat(43),code='C'.repeat(43),ticket='D'.repeat(43);
function setup(override={},expiryMs=300000){
  const calls=[],urls=[];let state;
  const api={startKakaoMock:async body=>{calls.push(['start',body]);state=body.state;return {transactionId:id,
    authorizeUrl:`http://127.0.0.1:9091/auth/kakao-mock/authorize#transactionId=${id}&decisionTicket=${ticket}`,
    expiresAt:new Date(Date.now()+expiryMs).toISOString(),mockOnly:true};},
    completeKakaoMock:async body=>{calls.push(['complete',body]);return {status:'ok',mockOnly:true};},
    cancelKakaoMock:async body=>{calls.push(['cancel',body]);return {status:'cancelled',mockOnly:true};},
    me:async()=>{calls.push(['me']);return {role:'customer'};},...override};
  const flow=createKakaoMockFlow({api,randomBytes:()=>randomBytes(32),digest:async text=>createHash('sha256').update(text).digest(),openUrl:async url=>urls.push(url)});
  return {flow,calls,urls,returned:()=>`owoolmall-dev://auth/kakao-mock/return#transactionId=${id}&state=${state}&code=${code}`};
}
test('명시 인증 거부를 기존 고객 me 성공으로 대체하지 않는다',async()=>{
  const {flow,calls,returned}=setup({completeKakaoMock:async()=>{throw new CustomerApiError('unauthorized');}});
  await flow.start();await assert.rejects(flow.handleReturn(returned()));assert.equal(calls.some(c=>c[0]==='me'),false);
});
test('시작 오류는 원문 수단 없이 서버 연결·응답·브라우저 단계를 구분한다',async()=>{
  const request=setup({startKakaoMock:async()=>{throw new Error('private credentials');}});
  await assert.rejects(request.flow.start(),e=>e instanceof KakaoMockStartError&&e.phase==='request'&&!e.message.includes('private'));
  const response=setup({startKakaoMock:async()=>({mockOnly:false})});
  await assert.rejects(response.flow.start(),e=>e instanceof KakaoMockStartError&&e.phase==='response');
});
test('기기 시계가 서버보다 늦어도 정상 시작하되 로컬 대기는 5분을 넘기지 않는다',async()=>{
  const original=Date.now,at=original();Date.now=()=>at;
  try{const {flow,calls,urls,returned}=setup({},301250);await flow.start();assert.equal(urls.length,1);
    Date.now=()=>at+300001;assert.equal(await flow.handleReturn(returned()),false);assert.equal(calls.some(c=>c[0]==='complete'),false);
    await flow.cancel();assert.equal(calls.some(c=>c[0]==='cancel'),false);await flow.start();assert.equal(urls.length,2);
  }finally{Date.now=original;}
});
test('명시 start→고정 브라우저→정확 scheme·S256 complete·me 고객 확인만 로그인한다',async()=>{
  const {flow,calls,urls,returned}=setup();assert.equal(urls.length,0);await flow.start();assert.equal(urls.length,1);
  assert.equal(await flow.handleReturn(returned()),true);assert.equal(await flow.handleReturn(returned()),false);
  assert.deepEqual(calls.map(x=>x[0]),['start','complete','me']);
  assert.equal(createHash('sha256').update(calls[1][1].verifier).digest('base64url'),calls[0][1].challenge);
});
test('cold start·다른scheme/거래/state·중복fragment·query는 세션을 만들지 않는다',async()=>{
  const {flow,calls,returned}=setup();assert.equal(await flow.handleReturn(returned()),false);await flow.start();
  for(const url of [returned().replace('owoolmall-dev:','https:'),returned().replace('/return','/wrong'),
    returned().replace('://auth/','://auth:123/'),
    returned().replace('#','?role=admin#'),returned()+`&code=${code}`,returned().replace(`transactionId=${id}`,`transactionId=${'Z'.repeat(43)}`)])
    assert.equal(await flow.handleReturn(url),false);
  assert.equal(calls.length,1);flow.invalidate();assert.equal(await flow.handleReturn(returned()),false);
});
test('명시취소·공급자 실패·고객 아닌 me는 로그인 성공이 아니다',async()=>{
  for(const error of ['cancelled','mock_failed']){const {flow,calls,returned}=setup();await flow.start();
    assert.equal(await flow.handleReturn(returned().replace(`code=${code}`,`error=${error}`)),false);assert.equal(calls.length,1);}
  const {flow,returned}=setup({me:async()=>({role:'admin'})});await flow.start();await assert.rejects(flow.handleReturn(returned()));
});
test('응답유실은 me로 확인하며 코드 재시도 없이 취소가 진행중 교환을 기다린다',async()=>{
  let release;const wait=new Promise(resolve=>release=resolve);
  const {flow,calls,returned}=setup({completeKakaoMock:async()=>{await wait;throw new CustomerApiError('offline');}});await flow.start();
  const completing=flow.handleReturn(returned());let cancelled=false;const cancel=flow.cancel().then(()=>cancelled=true);
  await Promise.resolve();assert.equal(cancelled,false);release();assert.equal(await completing,true);await cancel;
  assert.deepEqual(calls.map(x=>x[0]),['start','me']);
});
