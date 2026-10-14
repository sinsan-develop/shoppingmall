import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { randomBytes,createHash } from 'node:crypto';
import { createKakaoMockClient,parseKakaoMockReturn,parseKakaoMockAuthorize,KakaoMockHttpError,withKakaoAuthLock } from '../lib/kakao-mock-client.ts';

test('개발 인증 잠금은 서로 다른 탭의 HTTP 응답 처리까지 직렬화하고 미지원 mock은 거부한다',async()=>{
  const oldWindow=globalThis.window,nav=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const mode=process.env.NODE_ENV,flag=process.env.NEXT_PUBLIC_ENABLE_KAKAO_MOCK;
  const order=[];let release,chain=Promise.resolve();const held=new Promise(resolve=>release=resolve);
  try{
    process.env.NODE_ENV='development';process.env.NEXT_PUBLIC_ENABLE_KAKAO_MOCK='1';
    globalThis.window={location:{origin:'http://127.0.0.1:9091'}};
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request(name,options,run){
      assert.equal(name,'owoolmall-development-auth');assert.deepEqual(options,{mode:'exclusive'});
      const pending=chain.then(run);chain=pending.catch(()=>{});return pending;
    }}}});
    const first=withKakaoAuthLock(async()=>{order.push('mock-start');await held;order.push('mock-response');},true);
    const second=withKakaoAuthLock(async()=>{order.push('email-start');order.push('email-response');});
    await Promise.resolve();assert.deepEqual(order,['mock-start']);release();await first;await second;
    assert.deepEqual(order,['mock-start','mock-response','email-start','email-response']);
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
    await assert.rejects(withKakaoAuthLock(async()=>assert.fail('unsupported mock must not send'),true));
    assert.equal(await withKakaoAuthLock(async()=>'email-still-available'),'email-still-available');
    process.env.NEXT_PUBLIC_ENABLE_KAKAO_MOCK='0';assert.equal(await withKakaoAuthLock(async()=>'normal'),'normal');
  }finally{
    globalThis.window=oldWindow;if(nav)Object.defineProperty(globalThis,'navigator',nav);else delete globalThis.navigator;
    if(mode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=mode;
    if(flag===undefined)delete process.env.NEXT_PUBLIC_ENABLE_KAKAO_MOCK;else process.env.NEXT_PUBLIC_ENABLE_KAKAO_MOCK=flag;
  }
});

const origin='http://127.0.0.1:9091',id='T'.repeat(43),ticket='D'.repeat(43),code='C'.repeat(43);
test('브라우저 실행기는 mock QA 승인 환경 없이는 Chrome나 DB를 쓰지 않고 거부한다',()=>{
  const result=spawnSync(process.execPath,['--import','tsx','scripts/qa-kakao-mock-browser.mjs'],
    {env:{...process.env,KAKAO_AUTH_MODE:'disabled'},encoding:'utf8',timeout:10000});
  assert.notEqual(result.status,0);assert.match(result.stderr,/KAKAO_BROWSER_QA_FAILED/);assert.equal(result.stdout,'');
});
function setup(sendOverride,expiryMs=300000){
  const calls=[];
  const send=async(path,body)=>{
    calls.push({path,body});
    if(sendOverride){const result=await sendOverride(path,body);if(result!==undefined)return result;}
    if(path.endsWith('/start'))return {transactionId:id,authorizeUrl:`${origin}/auth/kakao-mock/authorize#transactionId=${id}&decisionTicket=${ticket}`,expiresAt:new Date(Date.now()+expiryMs).toISOString(),mockOnly:true};
    if(path==='/auth/me')return {role:'customer',accountId:'qa-customer'};
    return {status:'ok',mockOnly:true};
  };
  return {calls,client:createKakaoMockClient({apiOrigin:'http://127.0.0.1:9092',webOrigin:origin,send,
    randomBytes:()=>randomBytes(32),digest:async value=>createHash('sha256').update(value).digest()})};
}
const event=(start,source)=>({origin,source,data:{transactionId:id,state:start.state,code}});
test('서버 시계 차이를 거부 사유로 삼지 않으며 클라이언트의 대기는 5분으로 제한한다',async()=>{
  const original=Date.now,at=original();Date.now=()=>at;
  try{const {client,calls}=setup(undefined,301250),source={};const start=await client.start();
    Date.now=()=>at+300001;await assert.rejects(client.acceptReturn(event(start,source),source));
    assert.equal(calls.filter(c=>c.path.endsWith('/complete')).length,0);
    await client.cancel();assert.equal(calls.filter(c=>c.path.endsWith('/cancel')).length,0);
    await client.start();assert.equal(calls.filter(c=>c.path.endsWith('/start')).length,2);
  }finally{Date.now=original;}
});
test('인증 거부 응답은 이전 고객 cookie를 새 mock 성공으로 표시하지 않는다',async()=>{
  const {client,calls}=setup(async path=>{if(path.endsWith('/complete'))throw new KakaoMockHttpError(401);});
  const start=await client.start(),source={};await assert.rejects(client.acceptReturn(event(start,source),source));
  assert.equal(calls.filter(c=>c.path==='/auth/me').length,0);
});
test('원래 창·Origin·거래·state를 확인한 복귀만 한 번 complete하고 고객 조회한다',async()=>{
  const {calls,client}=setup(),source={};const start=await client.start();
  for(const e of [{...event(start,source),origin:'http://evil.invalid'},{...event(start,source),source:{}},
    {...event(start,source),data:{...event(start,source).data,state:'Z'.repeat(43)}}])await assert.rejects(client.acceptReturn(e,source));
  assert.equal(calls.filter(c=>c.path.endsWith('/complete')).length,0);
  assert.equal((await client.acceptReturn(event(start,source),source)).role,'customer');
  await assert.rejects(client.acceptReturn(event(start,source),source));
  assert.equal(calls.filter(c=>c.path.endsWith('/complete')).length,1);
  const body=calls.find(c=>c.path.endsWith('/complete')).body;
  assert.equal(createHash('sha256').update(body.verifier).digest('base64url'),calls[0].body.challenge);
});
test('취소·실패·증명 소실은 complete나 고객 세션 성공으로 바꾸지 않는다',async()=>{
  for(const error of ['cancelled','mock_failed']){
    const {calls,client}=setup(),source={};const start=await client.start();
    await assert.rejects(client.acceptReturn({origin,source,data:{transactionId:id,state:start.state,error}},source));
    assert.equal(calls.filter(c=>c.path.endsWith('/complete')).length,0);
  }
  const {calls,client}=setup(),source={};const start=await client.start();client.invalidate();
  await assert.rejects(client.acceptReturn(event(start,source),source));assert.equal(calls.length,1);
});
test('complete 응답 유실은 me만 확인하고 같은 code를 다시 소비하지 않는다',async()=>{
  const {client,calls}=setup(async path=>{if(path.endsWith('/complete'))throw new Error('private failure');});
  const start=await client.start(),source={};assert.equal((await client.acceptReturn(event(start,source),source)).role,'customer');
  assert.equal(calls.filter(c=>c.path.endsWith('/complete')).length,1);
});
test('진행중 complete와 명시 취소는 직렬화되어 이전 cookie 뒤 다음 인증을 시작한다',async()=>{
  let release;const wait=new Promise(resolve=>release=resolve);
  const {client,calls}=setup(async path=>{if(path.endsWith('/complete')){await wait;return {status:'ok',mockOnly:true};}});
  const start=await client.start(),source={};const completing=client.acceptReturn(event(start,source),source);
  let cancelled=false;const cancel=client.cancel().then(()=>cancelled=true);
  await Promise.resolve();assert.equal(cancelled,false);release();await completing;await cancel;
  assert.equal(calls.filter(c=>c.path.endsWith('/cancel')).length,0);
});
test('고정 복귀·승인 URL은 query·중복 fragment·외부주소·필드 주입을 거부한다',()=>{
  const valid=`${origin}/auth/kakao-mock/return#transactionId=${id}&state=${'S'.repeat(43)}&code=${code}`;
  assert.equal(parseKakaoMockReturn(valid,origin).code,code);
  for(const value of [valid.replace(origin,'http://evil.invalid'),valid.replace('#','?q=1#'),valid+'&code='+code,
    valid+'&role=admin',valid.replace('/return','/else')])assert.throws(()=>parseKakaoMockReturn(value,origin));
  assert.equal(parseKakaoMockAuthorize(`${origin}/auth/kakao-mock/authorize#transactionId=${id}&decisionTicket=${ticket}`,origin).decisionTicket,ticket);
});
