import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
const fixture=JSON.parse(process.env.QA_FIXTURE_JSON);
const password=process.env.QA_FIXTURE_PASSWORD;
// Dedicated QA fixture only; never use a real account or an exposed browser profile.
assert.ok(fixture.emails.every(email=>email.startsWith('qa+')&&email.endsWith('@example.invalid')));
assert.ok(password&&process.env.QA_EVIDENCE_DIR);
const web='http://127.0.0.1:9091', api='http://127.0.0.1:9092';
const target=await fetch('http://127.0.0.1:9223/json/new?about:blank',{method:'PUT'}).then(r=>r.json());
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let serial=0;const pending=new Map();
ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(!m.id)return;
 const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(m.error);else p.resolve(m.result);});
const cmd=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
async function evaluate(expression){const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression){for(let i=0;i<120;i++){if(await evaluate(`Boolean(${expression})`))return;await delay(150);}throw Error(`Timeout: ${expression}`);}
async function nav(path){await cmd('Page.navigate',{url:web+path});await wait(`location.pathname===${JSON.stringify(path)}&&document.readyState==='complete'`);await delay(400);}
async function login(role,email){await nav('/login');await wait("document.querySelector('#login-email')");
 await evaluate(`(()=>{const r=document.querySelector('#login-role');r.value=${JSON.stringify(role)};r.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#login-email').value=${JSON.stringify(email)};document.querySelector('#login-password').value=${JSON.stringify(password)};document.querySelector('form').requestSubmit()})()`);
 await wait("location.pathname==='/account'");}
async function click(selector){await wait(`document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled`);await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);}
async function selectOrder(id){await wait(`[...document.querySelectorAll('.refund-case-button')].some(b=>!b.disabled&&b.textContent.includes(${JSON.stringify(id)}))`);
 await evaluate(`[...document.querySelectorAll('.refund-case-button')].find(b=>b.textContent.includes(${JSON.stringify(id)})).click()`);await wait("document.activeElement.id==='customer-refund-heading'");}
try{
 await cmd('Page.bringToFront'); await login('customer',fixture.emails[0]);
 if(process.argv.includes('--admin')){
  const caseIds=await evaluate(`(async()=>{const base=${JSON.stringify(api+'/customer/checkout/orders/'+fixture.orderId+'/refund-cases')};
   const existing=await fetch(base,{credentials:'include'}).then(r=>r.json());const ids=[];
   for(const reason of ['QA 승인 선택 초기화 A','QA 승인 선택 초기화 B']){
    let found=existing.find(c=>c.reason===reason);
    if(!found){const r=await fetch(base,{method:'POST',credentials:'include',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({shipmentOrderId:${JSON.stringify(fixture.shipmentId)},lines:[{optionId:${JSON.stringify(fixture.optionId)},quantity:1}],reasonCode:'other',reason})});if(!r.ok)throw Error('request '+r.status);found=await r.json();}ids.push(found.id);
   }return ids;})()`);
  await login('admin',fixture.emails[2]);await nav('/account/admin/refunds');
  await wait("document.querySelectorAll('.refund-case-button').length>=2");
  const cases=await evaluate(`fetch(${JSON.stringify(api+'/refunds/admin/cases')},{credentials:'include'}).then(r=>r.json())`);
  const selectCase=async id=>{const index=cases.findIndex(c=>c.id===id);assert.ok(index>=0);
   await wait(`!document.querySelectorAll('.refund-case-button')[${index}]?.disabled`);
   await evaluate(`document.querySelectorAll('.refund-case-button')[${index}].click()`);
   await wait(`document.querySelectorAll('.refund-case-button')[${index}].getAttribute('aria-pressed')==='true'`);};
  await selectCase(caseIds[0]);await wait("document.querySelector('[name=preShipmentConfirmed]')");
  await evaluate("document.querySelector('[name=preShipmentConfirmed]').checked=true;document.querySelector('[name=approvalReason]').value='A에만 해당하는 승인 사유';document.querySelector('[name=rejectionReason]').value='A 반려 사유';document.querySelector('[name^=restock-]').value='on_hand_only'");
  await selectCase(caseIds[1]);
  const values=await evaluate("({confirmed:document.querySelector('[name=preShipmentConfirmed]').checked,approval:document.querySelector('[name=approvalReason]').value,rejection:document.querySelector('[name=rejectionReason]').value,stock:document.querySelector('[name^=restock-]').value})");
  console.log(JSON.stringify({test:'admin-switching',values}));
  assert.deepEqual(values,{confirmed:false,approval:'',rejection:'',stock:'none'});
 }else{
  await nav('/cart');await selectOrder(fixture.orderId);await wait("document.querySelector('.refund-customer .refund-case-list')?.textContent.includes('3,333원')");
  await evaluate(`(()=>{const send=window.fetch.bind(window);window.__qaDeferred=null;window.__qaHeld=false;window.fetch=async(...args)=>{const r=await send(...args);if(String(args[0]).endsWith(${JSON.stringify('/'+fixture.orderId+'/refund-cases')})&&!window.__qaHeld){window.__qaHeld=true;return new Promise(resolve=>window.__qaDeferred=()=>resolve(r));}return r;};})()`);
  await click('.refund-customer button');await wait('window.__qaDeferred');
  const other=await evaluate(`[...document.querySelectorAll('.refund-case-button')].map(b=>b.textContent.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/)?.[0]).find(id=>id&&id!==${JSON.stringify(fixture.orderId)})`);assert.ok(other);
  await selectOrder(other);await wait("document.querySelector('.refund-customer')?.textContent.includes('접수된 환불 요청이 없습니다')");
  await evaluate('window.__qaDeferred()');await delay(500);
  assert.equal(await evaluate("document.querySelector('.refund-customer')?.textContent.includes('3,333원')"),false,'prior order refund must not overwrite the selected order');
  console.log(JSON.stringify({test:'customer-switching',lateResponseIgnored:true}));
 }
 const shot=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 await writeFile(join(process.env.QA_EVIDENCE_DIR,`${process.argv.includes('--admin')?'admin':'customer'}-switching.png`),Buffer.from(shot.data,'base64'));
}finally{ws.close();}
