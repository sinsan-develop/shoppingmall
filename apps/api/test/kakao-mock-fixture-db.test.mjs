import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { runQaKakaoMockFixture } from '../scripts/qa-kakao-mock-fixture.ts';

test('폐기 DB fixture는 서명·소유·systemID를 확인하고 타자료를 지우지 않는다',{
  skip:!process.env.QA_KAKAO_DB_SYSTEM_ID && process.env.QA_KAKAO_REQUIRED!=='1',
},async t=>{
  assert.ok(process.env.QA_KAKAO_DB_SYSTEM_ID,'required QA identity');
  const dir=await mkdtemp(process.platform==='win32'?'D:/tmp/s7-kakao-fixture-':'/tmp/s7-kakao-fixture-');
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=`${dir}/manifest.json`,url=process.env.DATABASE_URL,id=process.env.QA_KAKAO_DB_SYSTEM_ID;
  const run=process.env.QA_KAKAO_RUN_ID; const pool=new Pool({connectionString:url}); t.after(()=>pool.end());
  const count=async()=>Number((await pool.query('SELECT count(*) AS n FROM accounts')).rows[0].n);
  assert.equal(await count(),0);
  await assert.rejects(runQaKakaoMockFixture('seed',run,url,'7622490131194466339',file)); assert.equal(await count(),0);
  await runQaKakaoMockFixture('seed',run,url,id,file); assert.equal(await count(),2);
  await assert.rejects(runQaKakaoMockFixture('seed',run,url,id,file)); assert.equal(await count(),2);
  const raw=await readFile(file,'utf8'),manifest=JSON.parse(raw);
  await writeFile(file,JSON.stringify({...manifest,accounts:{...manifest.accounts,customerA:manifest.accounts.customerB}}));
  await assert.rejects(runQaKakaoMockFixture('reset',run,url,id,file)); assert.equal(await count(),2);
  await writeFile(file,raw);
  const extra=(await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
  await assert.rejects(runQaKakaoMockFixture('reset',run,url,id,file)); assert.equal(await count(),3);
  await pool.query('DELETE FROM accounts WHERE id=$1',[extra]);
  const reference=(await pool.query('INSERT INTO account_deletion_requests(account_id) VALUES($1) RETURNING id',[manifest.accounts.customerA])).rows[0].id;
  await assert.rejects(runQaKakaoMockFixture('reset',run,url,id,file));assert.equal(await count(),2);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM customer_addresses')).rows[0].n,2);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_deletion_requests WHERE id=$1',[reference])).rows[0].n,1);
  await pool.query('DELETE FROM account_deletion_requests WHERE id=$1',[reference]);
  await runQaKakaoMockFixture('reset',run,url,id,file); assert.equal(await count(),0);
  await runQaKakaoMockFixture('reset',run,url,id,file); assert.equal(await count(),0);
});
