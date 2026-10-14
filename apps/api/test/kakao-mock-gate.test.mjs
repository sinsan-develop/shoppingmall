import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import test from 'node:test';
import { assertKakaoMockBootConfig, assertKakaoMockRequest, attestKakaoMockDatabase,
  signKakaoQaManifest } from '../src/auth/kakao-mock-gate.ts';

const key='synthetic-kakao-manifest-key-20261014';
function config() { return { KAKAO_AUTH_MODE:'mock',APP_ENV:'development',API_HOST:'127.0.0.1',WEB_ORIGIN:'http://127.0.0.1:9091',
  QA_KAKAO_RUN_ID:'7a141001',QA_KAKAO_DB_NAME:'shoppingmall_s7_kakao_7a141001',QA_KAKAO_DB_SYSTEM_ID:'900000000000000001',
  DATABASE_URL:'postgresql://synthetic:synthetic@shoppingmall-s7-kakao-20261014-pg:5432/shoppingmall_s7_kakao_7a141001',
  QA_KAKAO_MANIFEST_PATH:'/tmp/owned-kakao.json',QA_KAKAO_MANIFEST_KEY:key }; }
test('카카오 mock은 기본 비활성이며 공개/production/보호DB/알수없는모드는 listener 전에 거부한다', () => {
  assert.equal(assertKakaoMockBootConfig({}), 'disabled'); assert.equal(assertKakaoMockBootConfig(config()), 'mock');
  for (const patch of [{NODE_ENV:'production'},{APP_ENV:'production'},{API_HOST:'0.0.0.0'},
    {KAKAO_AUTH_MODE:'kakao'}, {QA_KAKAO_DB_SYSTEM_ID:'7622490131194466339'}, {QA_KAKAO_DB_NAME:'shoppingmall'},
    {DATABASE_URL:'postgresql://secret-do-not-print@external:5432/shoppingmall'}, {QA_KAKAO_MANIFEST_KEY:''},
    {WEB_ORIGIN:'http://127.0.0.1:9091/escape'}, {WEB_ORIGIN:'http://evil.invalid'}]) {
    assert.throws(() => assertKakaoMockBootConfig({...config(),...patch}), e => e.status===503 && !e.message.includes('secret'));
  }
});
test('요청은 개발 gate·정확 Origin·실제 양쪽 루프백을 모두 검사한다', () => {
  const request={headers:{origin:'http://127.0.0.1:9091'},socket:{localAddress:'127.0.0.1',remoteAddress:'::ffff:127.0.0.1'}};
  assertKakaoMockRequest(request,config());
  assert.throws(()=>assertKakaoMockRequest(request,{}),e=>e.status===404);
  for (const patch of [{headers:{origin:'http://evil.invalid'}},{headers:{'x-forwarded-for':'127.0.0.1'}},
    {socket:{localAddress:'127.0.0.1',remoteAddress:'192.0.2.1'}},{socket:{localAddress:'192.0.2.1',remoteAddress:'127.0.0.1'}}]) {
    assert.throws(()=>assertKakaoMockRequest({...request,...patch},config()),e=>e.status===403);
  }
});
test('실제 DB 식별·서명 manifest·고객 바인딩 불일치는 모두 비밀 없는 실패로 닫는다', async t => {
  const directory=await mkdtemp(process.platform==='win32'?'D:/tmp/s7-kakao-gate-':'/tmp/s7-kakao-gate-');
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const env={...config(),QA_KAKAO_MANIFEST_PATH:`${directory}/manifest.json`};
  const manifest={version:1,runId:env.QA_KAKAO_RUN_ID,dbName:env.QA_KAKAO_DB_NAME,systemId:env.QA_KAKAO_DB_SYSTEM_ID,
    nonce:randomUUID(),accounts:{customerA:randomUUID(),customerB:randomUUID()},identityId:randomUUID(),addressIds:[randomUUID(),randomUUID()]};
  await writeFile(env.QA_KAKAO_MANIFEST_PATH,JSON.stringify({...manifest,hmac:signKakaoQaManifest(manifest,key)}),{mode:0o600});
  let database=manifest.dbName,systemId=manifest.systemId,accountId=manifest.accounts.customerA;
  const pool={query:async sql=> ({rows: sql.includes('current_database') ? [{db:database,system_id:systemId}] :
    [{account_id:accountId,identity_id:manifest.identityId,identifier:'mock:s7:7a141001:customer-a',disabled_at:null,role:'customer'}]})};
  assert.equal((await attestKakaoMockDatabase(pool,env)).accountId,manifest.accounts.customerA);
  database='shoppingmall'; await assert.rejects(attestKakaoMockDatabase(pool,env),e=>e.status===503); database=manifest.dbName;
  systemId='7622490131194466339'; await assert.rejects(attestKakaoMockDatabase(pool,env),e=>e.status===503); systemId=manifest.systemId;
  accountId=manifest.accounts.customerB; await assert.rejects(attestKakaoMockDatabase(pool,env),e=>e.status===503);accountId=manifest.accounts.customerA;
  await writeFile(env.QA_KAKAO_MANIFEST_PATH,JSON.stringify({...manifest,identityId:randomUUID(),hmac:signKakaoQaManifest(manifest,key)}));
  await assert.rejects(attestKakaoMockDatabase(pool,env),e=>e.status===503);
  await assert.rejects(attestKakaoMockDatabase({query:async()=>{throw Error('private-connection-url');}},env),e=>e.status===503 && !e.message.includes('private'));
});
