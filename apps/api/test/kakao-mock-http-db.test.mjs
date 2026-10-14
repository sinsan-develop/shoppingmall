import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash,randomBytes } from 'node:crypto';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { Pool } from 'pg';
import { runQaKakaoMockFixture } from '../scripts/qa-kakao-mock-fixture.ts';
import { createApp } from '../src/app.ts';

test('mock 인증 HTTP→DB는 고객 세션 한 번·계정 불변·실패 폐쇄를 보장한다',{
  skip:!process.env.QA_KAKAO_DB_SYSTEM_ID && process.env.QA_KAKAO_REQUIRED!=='1',
},async t=>{
  assert.ok(process.env.QA_KAKAO_DB_SYSTEM_ID,'required QA identity');
  const dir=await mkdtemp(process.platform==='win32'?'D:/tmp/s7-kakao-http-':'/tmp/s7-kakao-http-');
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const saved={KAKAO_AUTH_MODE:process.env.KAKAO_AUTH_MODE,QA_KAKAO_MANIFEST_PATH:process.env.QA_KAKAO_MANIFEST_PATH};
  t.after(()=>{for(const [key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  const file=`${dir}/manifest.json`;process.env.QA_KAKAO_MANIFEST_PATH=file;
  await runQaKakaoMockFixture('seed',process.env.QA_KAKAO_RUN_ID,process.env.DATABASE_URL,process.env.QA_KAKAO_DB_SYSTEM_ID,file);
  const manifest=JSON.parse(await readFile(file,'utf8'));
  const pool=new Pool({connectionString:process.env.DATABASE_URL});t.after(()=>pool.end());
  process.env.KAKAO_AUTH_MODE='mock';
  const app=await createApp();t.after(()=>app.close());
  const {KakaoMockService}=await import('../src/auth/kakao-mock-service.ts');await app.get(KakaoMockService).initialize();
  await app.listen(0,'127.0.0.1');const base=`http://127.0.0.1:${app.getHttpServer().address().port}`;
  const post=(route,body,headers={})=>fetch(`${base}/auth/kakao-mock/${route}`,{method:'POST',headers:{'content-type':'application/json',origin:'http://127.0.0.1:9091',...headers},body:JSON.stringify(body)});
  const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
  const begin={client:'web',state,challenge:createHash('sha256').update(verifier).digest('base64url'),method:'S256'};
  const flow=async(outcome='approve')=>{
    const response=await post('start',begin);assert.equal(response.status,200);const start=await response.json();
    const ticket=new URLSearchParams(new URL(start.authorizeUrl).hash.slice(1)).get('decisionTicket');
    const choice=await post('decision',{transactionId:start.transactionId,decisionTicket:ticket,outcome});assert.equal(choice.status,200);
    const returns=new URLSearchParams(new URL((await choice.json()).returnUrl).hash.slice(1));
    return {transactionId:start.transactionId,state,verifier,code:returns.get('code')??'X'.repeat(43)};
  };
  assert.equal((await post('start',begin,{origin:'http://evil.invalid'})).status,403);
  assert.equal((await post('start',{...begin,role:'admin'})).status,400);
  const cancelled=await flow('cancel');assert.equal((await post('complete',cancelled)).status,409);
  const failed=await flow('fail');assert.equal((await post('complete',failed)).status,409);
  // An audit failure must roll back the session insert, not create a half-login.
  const auditFailure=await flow();
  await pool.query(`CREATE FUNCTION s7_kakao_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'private database failure'; END $$;
    CREATE TRIGGER s7_kakao_audit_failure BEFORE INSERT ON audit_events
    FOR EACH ROW EXECUTE FUNCTION s7_kakao_audit_failure()`);
  try {
    const denied=await post('complete',auditFailure);assert.equal(denied.status,503);
    assert.deepEqual(await denied.json(),{status:'mock_auth_unavailable'});
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM auth_sessions')).rows[0].n,0);
    assert.equal((await post('complete',auditFailure)).status,409);
  } finally {await pool.query('DROP TRIGGER s7_kakao_audit_failure ON audit_events; DROP FUNCTION s7_kakao_audit_failure()');}
  const locked=await flow(),blocker=await pool.connect();
  await blocker.query('BEGIN');await blocker.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[manifest.accounts.customerA]);
  const pending=post('complete',locked);let waiting=false;
  try {
    const deadline=Date.now()+5000;
    while(Date.now()<deadline){
      waiting=(await pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%i.kind=%kakao%'`)).rows[0].n>0;
      if(waiting)break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.equal(waiting,true,'completion must wait for the account transaction');
    await blocker.query('UPDATE accounts SET disabled_at=now() WHERE id=$1',[manifest.accounts.customerA]);
    await blocker.query('COMMIT');assert.equal((await pending).status,401);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM auth_sessions')).rows[0].n,0);
  } finally {await blocker.query('ROLLBACK');blocker.release();}
  await pool.query('UPDATE accounts SET disabled_at=NULL WHERE id=$1',[manifest.accounts.customerA]);
  const accepted=await flow();assert.equal((await post('complete',{...accepted,verifier:'Z'.repeat(43)})).status,401);
  const responses=await Promise.all([post('complete',accepted),post('complete',accepted)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  const response=responses.find(r=>r.status===200);assert.deepEqual(await response.json(),{status:'ok',mockOnly:true});
  const setCookie=response.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Lax/);
  const cookie=setCookie.split(';')[0];
  const me=await fetch(`${base}/auth/me`,{headers:{cookie}});assert.equal(me.status,200);assert.equal((await me.json()).role,'customer');
  const addresses=await fetch(`${base}/customer/addresses`,{headers:{cookie}});assert.equal(addresses.status,200);
  const own=await addresses.json();assert.equal(own.length,1);assert.equal(own[0].label,'S7 Kakao customer-a');
  assert.equal((await post('start',begin,{cookie})).status,409);
  const sessionRows=(await pool.query('SELECT count(*)::int AS n FROM auth_sessions')).rows[0].n;
  const auditRows=(await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='auth.kakao_mock.login'")).rows[0].n;
  assert.equal(sessionRows,1);assert.equal(auditRows,1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,2);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_identities')).rows[0].n,3);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_roles')).rows[0].n,2);
  // A changed account is checked at completion, not only when the server starts.
  const disabled=await flow();await pool.query('UPDATE accounts SET disabled_at=now() WHERE id=$1',[manifest.accounts.customerA]);
  const denial=await post('complete',disabled);assert.equal(denial.status,401);assert.deepEqual(await denial.json(),{status:'invalid_mock_auth'});
  await pool.query('UPDATE accounts SET disabled_at=NULL WHERE id=$1',[manifest.accounts.customerA]);
  const noRole=await flow();await pool.query("DELETE FROM account_roles WHERE account_id=$1 AND role='customer'",[manifest.accounts.customerA]);
  assert.equal((await post('complete',noRole)).status,401);
  await pool.query("INSERT INTO account_roles(account_id,role)VALUES($1,'customer')",[manifest.accounts.customerA]);
  const missing=await flow();await pool.query("DELETE FROM account_identities WHERE id=$1",[manifest.identityId]);
  assert.equal((await post('complete',missing)).status,401);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM auth_sessions')).rows[0].n,1);
  if(process.env.QA_KAKAO_REQUIRED==='1'||process.env.QA_KAKAO_COOKIE_RACE_REQUIRED==='1'){
    // Two browser tabs share cookies, but an already sent request cannot see a later cookie.
    await pool.query("INSERT INTO account_identities(id,account_id,kind,identifier,verified_at) VALUES($1,$2,'kakao',$3,now())",
      [manifest.identityId,manifest.accounts.customerA,`mock:s7:${process.env.QA_KAKAO_RUN_ID}:customer-a`]);
    const logout=await fetch(`${base}/auth/logout`,{method:'POST',headers:{origin:'http://127.0.0.1:9091',cookie}});
    assert.ok(logout.ok);
    const race=await flow(),hold=await pool.connect();await hold.query('BEGIN');
    await hold.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[manifest.accounts.customerA]);
    const previousTab=post('complete',race);
    try{
      const deadline=Date.now()+5000;let blocked=false;
      while(Date.now()<deadline){blocked=(await pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%i.kind=%kakao%'`)).rows[0].n>0;
        if(blocked)break;await new Promise(resolve=>setTimeout(resolve,20));}
      assert.equal(blocked,true);
      const manual=await fetch(`${base}/auth/login`,{method:'POST',headers:{origin:'http://127.0.0.1:9091','content-type':'application/json'},
        body:JSON.stringify({email:`s7-kakao-${process.env.QA_KAKAO_RUN_ID}-customer-b@example.invalid`,password:`S7-Kakao-${process.env.QA_KAKAO_RUN_ID}-fixture-only`,role:'customer'})});
      assert.ok(manual.ok);const latestCookie=manual.headers.get('set-cookie').split(';')[0];
      assert.equal((await (await fetch(`${base}/auth/me`,{headers:{cookie:latestCookie}})).json()).accountId,manifest.accounts.customerB);
      await hold.query('COMMIT');const late=await previousTab;
      assert.equal(late.status,409);assert.equal(late.headers.get('set-cookie'),null);
      const finalCookie=late.headers.get('set-cookie')?.split(';')[0]??latestCookie;
      const finalActor=await (await fetch(`${base}/auth/me`,{headers:{cookie:finalCookie}})).json();
      assert.equal(finalActor.accountId,manifest.accounts.customerB,'late mock response must not overwrite the newer shared-cookie login');
      // Each case starts a fresh process-local registry; existing DB customer sessions remain real.
      let currentCookie=latestCookie;
      for(const action of ['failed-login','switch-role','logout']){
        await app.get(KakaoMockService).initialize();
        const next=await flow(),lockedAccount=await pool.connect();await lockedAccount.query('BEGIN');
        await lockedAccount.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[manifest.accounts.customerA]);
        const pendingMock=post('complete',next);
        try{
          const until=Date.now()+5000;let waiting=false;
          while(Date.now()<until){waiting=(await pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%i.kind=%kakao%'`)).rows[0].n>0;
            if(waiting)break;await new Promise(resolve=>setTimeout(resolve,20));}
          assert.equal(waiting,true);
          const route=action==='failed-login'?'login':action;
          const body=action==='failed-login'?{email:`s7-kakao-${process.env.QA_KAKAO_RUN_ID}-customer-b@example.invalid`,password:'wrong-password',role:'customer'}:
            action==='switch-role'?{role:'customer'}:undefined;
          const manual=await fetch(`${base}/auth/${route}`,{method:'POST',headers:{origin:'http://127.0.0.1:9091',cookie:currentCookie,
            ...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
          if(action==='failed-login')assert.equal(manual.status,401);else assert.ok(manual.ok);
          const afterManual=(await pool.query('SELECT count(*)::int AS n FROM auth_sessions')).rows[0].n;
          const cookieHeader=manual.headers.get('set-cookie');if(cookieHeader)currentCookie=cookieHeader.split(';')[0];
          await lockedAccount.query('COMMIT');const refused=await pendingMock;
          assert.equal(refused.status,409);assert.equal(refused.headers.get('set-cookie'),null);
          assert.equal((await pool.query('SELECT count(*)::int AS n FROM auth_sessions')).rows[0].n,afterManual);
          const actor=await fetch(`${base}/auth/me`,{headers:{cookie:currentCookie}});
          if(action==='logout')assert.equal(actor.status,401);
          else {assert.equal(actor.status,200);assert.equal((await actor.json()).accountId,manifest.accounts.customerB);}
        }finally{await lockedAccount.query('ROLLBACK');lockedAccount.release();}
      }
    }finally{await hold.query('ROLLBACK');hold.release();}
  }
  process.env.KAKAO_AUTH_MODE='disabled';assert.equal((await post('start',begin)).status,404);
  await assert.rejects(runQaKakaoMockFixture('reset',process.env.QA_KAKAO_RUN_ID,process.env.DATABASE_URL,process.env.QA_KAKAO_DB_SYSTEM_ID,file),
    'audit/history must not be deleted to make cleanup green; dispose the isolated DB instead');
});
