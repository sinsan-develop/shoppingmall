// Dedicated QA Chrome only. Source comes from Git; fixtures are attested disposable DB rows.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir,writeFile } from 'node:fs/promises';
import { attestKakaoMockDatabase,readKakaoQaManifest,assertKakaoMockBootConfig } from '../apps/api/src/auth/kakao-mock-gate.ts';
import { openCdpPage,closeCdpPage,createCdpCommandChannel } from './qa-browser-cdp.mjs';
const {Pool}=createRequire(new URL('../apps/api/package.json',import.meta.url))('pg');
const web='http://127.0.0.1:9091',api='http://127.0.0.1:9092',debugging='http://127.0.0.1:9229';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let pool,browserSocket,browser,lockedAccount,step='preflight';
const owned=new Map(),popupTargets=new Map();
async function connect(socketUrl){
  const url=new URL(socketUrl);assert.equal(url.protocol,'ws:');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'9229');
  const socket=new WebSocket(socketUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('CDP timeout')),5000);
    socket.onopen=()=>{clearTimeout(timer);resolve();};socket.onerror=()=>{clearTimeout(timer);reject(new Error('CDP failed'));};});
  return socket;
}
function observer(socket,handler){const original=socket.onmessage;socket.onmessage=event=>{
  const message=JSON.parse(event.data);if(message.method)handler(message);original(event);
};}
async function attach(page){
  const socket=await connect(page.webSocketDebuggerUrl),channel=createCdpCommandChannel(socket),requests=[];
  observer(socket,event=>{if(event.method==='Network.requestWillBeSent')requests.push(new URL(event.params.request.url).pathname);});
  const client={page,socket,channel,requests};owned.set(page.id,client);
  await channel.send('Page.enable');await channel.send('Runtime.enable');await channel.send('Network.enable');return client;
}
async function newPage(){
  const created=await openCdpPage({debugging});
  created.socket.close();return attach(created.page);
}
async function evaluate(client,expression,userGesture=false){
  const value=await client.channel.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture});
  assert.ok(!value.exceptionDetails,'QA page expression failed');return value.result.value;
}
async function wait(check,label,timeout=20000){
  const end=Date.now()+timeout;while(Date.now()<end){try{if(await check())return;}catch{/* page navigation replaces its context */}await pause(100);}
  throw new Error(label);
}
async function visit(client,path){await client.channel.send('Page.navigate',{url:web+path});
  await wait(()=>evaluate(client,`location.pathname===${JSON.stringify(new URL(web+path).pathname)}&&document.readyState==='complete'`),'navigation');}
async function button(client,label){
  await wait(()=>evaluate(client,`[...document.querySelectorAll('button')].some(n=>n.textContent.includes(${JSON.stringify(label)})&&!n.disabled&&Object.keys(n).some(k=>k.startsWith('__reactProps$')))`),'button');
  await evaluate(client,`[...document.querySelectorAll('button')].find(n=>n.textContent.includes(${JSON.stringify(label)})&&!n.disabled).click()`,true);
}
async function session(client){return evaluate(client,`fetch('${api}/auth/me',{credentials:'include'}).then(async r=>({status:r.status,actor:r.ok?await r.json():null}))`);}
async function popup(client){
  await button(client,'카카오 모의 로그인');let target;
  await wait(async()=>{target=[...popupTargets.values()].find(t=>t.openerId===client.page.id&&!owned.has(t.targetId));
    return target&&new URL(target.url).pathname==='/auth/kakao-mock/authorize';},'popup');
  const pages=await (await fetch(debugging+'/json/list')).json();const page=pages.find(p=>p.id===target.targetId);assert.ok(page);
  const opened=await attach(page);
  await wait(()=>evaluate(opened,"document.body.innerText.includes('가상 고객')&&!location.hash"),'fragment scrub');return opened;
}
async function evidence(client,name){
  assert.equal(await evaluate(client,'Boolean(location.hash)'),false);
  const dir=process.env.QA_KAKAO_BROWSER_EVIDENCE_DIR;
  assert.ok(dir?.startsWith('/tmp/shoppingmall-s7-kakao-')||dir?.replaceAll('\\','/').startsWith('D:/tmp/shoppingmall-s7-kakao-'));
  await mkdir(dir,{recursive:true});const shot=await client.channel.send('Page.captureScreenshot',{format:'png'});
  await writeFile(`${dir}/${name}.png`,Buffer.from(shot.data,'base64'));
}
async function run(){
  assert.equal(assertKakaoMockBootConfig(process.env),'mock');
  const profile=process.env.QA_KAKAO_CDP_PROFILE?.replaceAll('\\','/');
  assert.ok(profile?.startsWith('D:/tmp/shoppingmall-s7-kakao-20261014/chrome-'));
  pool=new Pool({connectionString:process.env.DATABASE_URL,max:3});
  const binding=await attestKakaoMockDatabase(pool,process.env),manifest=await readKakaoQaManifest(process.env);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,2);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM auth_sessions')).rows[0].n,0);
  const version=await (await fetch(debugging+'/json/version')).json();browserSocket=await connect(version.webSocketDebuggerUrl);
  browser=createCdpCommandChannel(browserSocket);
  const args=(await browser.send('Browser.getBrowserCommandLine')).arguments;
  assert.ok(args.some(arg=>arg.startsWith('--user-data-dir=')&&arg.slice(16).replaceAll('\\','/')===profile),'owned QA browser only');
  observer(browserSocket,event=>{if(event.method==='Target.targetCreated'||event.method==='Target.targetInfoChanged'){
    const info=event.params.targetInfo;if(info.type==='page')popupTargets.set(info.targetId,info);
  }else if(event.method==='Target.targetDestroyed')popupTargets.delete(event.params.targetId);});
  await browser.send('Target.setDiscoverTargets',{discover:true});
  const original=await newPage();
  for(const [outcome,label]of [['cancel','모의 취소'],['fail','모의 실패']]){
    step=outcome;await visit(original,'/login');const opened=await popup(original);await button(opened,label);
    await wait(()=>evaluate(original,"Boolean(document.querySelector('[role=alert]'))"),'safe failure UI');
    assert.equal((await session(original)).status,401);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM auth_sessions')).rows[0].n,0);
  }
  step='popup-close';await visit(original,'/login');const closed=await popup(original);
  await closeCdpPage({debugging,...closed});owned.delete(closed.page.id);
  await wait(()=>evaluate(original,"[...document.querySelectorAll('button')].some(n=>n.textContent==='카카오 모의 로그인'&&!n.disabled)"),'closed popup cancel');
  assert.equal((await session(original)).status,401);
  step='reload';const reload=await popup(original);await reload.channel.send('Page.reload');
  await wait(()=>evaluate(reload,"document.body.innerText.includes('다시 시작')"),'proof loss reload');
  assert.equal((await session(original)).status,401);await button(original,'모의 로그인 취소');
  step='no-opener';const cold=await newPage();await visit(cold,`/auth/kakao-mock/return#transactionId=${'T'.repeat(43)}&state=${'S'.repeat(43)}&code=${'C'.repeat(43)}`);
  await wait(()=>evaluate(cold,"!location.hash&&document.body.innerText.includes('다시 시작')"),'no opener');
  assert.equal((await session(original)).status,401);
  step='approve';await visit(original,'/login');const approved=await popup(original);
  // A message from the main window is not from the expected popup and must create no session.
  await evaluate(original,`window.postMessage({transactionId:'${'Z'.repeat(43)}',state:'${'Z'.repeat(43)}',code:'${'Z'.repeat(43)}'},'${web}')`);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM auth_sessions')).rows[0].n,0);
  await button(approved,'모의 승인');await wait(()=>evaluate(original,"location.pathname==='/account'&&document.body.innerText.includes('로그아웃')"),'customer login');
  assert.equal((await session(original)).actor.accountId,binding.accountId);
  await visit(original,'/account/customer');await wait(()=>evaluate(original,"document.body.innerText.includes('S7 Kakao customer-a')"),'owned address UI');
  assert.equal(await evaluate(original,"document.body.innerText.includes('S7 Kakao customer-b')"),false);await evidence(original,'customer-a');
  await visit(original,'/account');await button(original,'로그아웃');await wait(()=>evaluate(original,"location.pathname==='/login'"),'logout');
  assert.equal((await session(original)).status,401);
  step='cross-tab-lock';const race=await popup(original);lockedAccount=await pool.connect();await lockedAccount.query('BEGIN');
  await lockedAccount.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[binding.accountId]);await button(race,'모의 승인');
  await wait(async()=>Number((await pool.query("SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%i.kind=%kakao%'")).rows[0].n)>0,'real mock exchange lock');
  const later=await newPage();await visit(later,'/login');
  for(const [selector,value]of [['#login-email',`s7-kakao-${manifest.runId}-customer-b@example.invalid`],['#login-password',`S7-Kakao-${manifest.runId}-fixture-only`]]){
    await wait(()=>evaluate(later,`Boolean(document.querySelector('${selector}')&&Object.keys(document.querySelector('${selector}')).some(k=>k.startsWith('__reactProps$')))`),'input hydration');
    await evaluate(later,`(()=>{const n=document.querySelector('${selector}');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  }
  await button(later,'로그인');await wait(()=>evaluate(later,"document.body.innerText.includes('확인 중')"),'pending manual auth');
  assert.equal(later.requests.filter(path=>path==='/auth/login').length,0,'other tab must wait for mock HTTP response');
  await lockedAccount.query('COMMIT');lockedAccount.release();lockedAccount=undefined;
  await wait(()=>evaluate(later,"location.pathname==='/account'&&document.body.innerText.includes('로그아웃')"),'later auth complete');
  assert.equal((await session(original)).actor.accountId,manifest.accounts.customerB);
  await visit(original,'/account/customer');await wait(()=>evaluate(original,"document.body.innerText.includes('S7 Kakao customer-b')"),'latest address UI');
  await evidence(original,'latest-customer-b');await visit(later,'/account');await button(later,'로그아웃');
  await wait(async()=>(await session(original)).status===401,'cross-tab logout');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,2);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_identities')).rows[0].n,3);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_roles')).rows[0].n,2);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='auth.kakao_mock.login'")).rows[0].n,2);
  console.log('KAKAO_BROWSER_CORE_PASS approve cancel fail closed-popup reload no-opener owned-address cross-tab-lock logout');
}
try{await run();}catch{console.error(`KAKAO_BROWSER_QA_FAILED step=${step}`);process.exitCode=1;}
finally{
  if(lockedAccount){await lockedAccount.query('ROLLBACK');lockedAccount.release();}
  for(const client of owned.values())await closeCdpPage({debugging,...client});
  if(browserSocket)browserSocket.close();if(pool)await pool.end();
}
