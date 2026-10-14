import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {openCdpPage,closeCdpPage,createCdpCommandChannel} from './qa-browser-cdp.mjs';
const m=JSON.parse(await readFile(process.env.QA_W12_MANIFEST,'utf8'));
const credential=JSON.parse(await readFile(process.env.QA_W12_CREDENTIAL,'utf8'));
assert.notEqual(m.systemId,'7622490131194466339');assert.equal(credential.email,'qa+a0150012-customer@example.invalid');
const evidence=process.env.QA_W12_EVIDENCE;assert.equal(evidence,'D:/tmp/shoppingmall-w12-20261015/evidence');await mkdir(evidence,{recursive:true});
const debugging='http://127.0.0.1:9235',web='http://127.0.0.1:9091';
const {page,socket}=await openCdpPage({debugging});const {send}=createCdpCommandChannel(socket,{timeoutMs:20000});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;}
async function wait(expression,label){const until=Date.now()+20000;while(Date.now()<until){try{if(await evaluate(`Boolean(${expression})`))return;}catch{/*navigation*/}await new Promise(r=>setTimeout(r,100));}throw Error(`W12 timeout: ${label}`);}
async function click(text){assert.equal(await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b)return false;b.click();return true;})()`),true);}
async function set(selector,value){assert.equal(await evaluate(`(()=>{const i=document.querySelector(${JSON.stringify(selector)});if(!i)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`),true);}
async function shot(name){const r=await send('Page.captureScreenshot',{captureBeyondViewport:true});await writeFile(`${evidence}/${name}.png`,Buffer.from(r.data,'base64'));}
const passes=[];let posts=0;const responses=[];
try {
 socket.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.method==='Network.requestWillBeSent'&&d.params.request.url.endsWith('/customer/deletion-request')&&d.params.request.method==='POST')posts++;if(d.method==='Network.responseReceived'&&d.params.response.url.endsWith('/customer/deletion-request'))responses.push(d.params.response.status);});
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 // Login is setup only: no repeated login test or completion claim.
 await send('Page.navigate',{url:web+'/login'});await wait(`document.querySelector('#login-email')&&Object.keys(document.querySelector('form')).some(k=>k.startsWith('__reactProps$'))`,'login setup');
 await set('#login-email',credential.email);await set('#login-password',credential.password);await evaluate(`document.querySelector('.account-form').requestSubmit();true`);await wait(`location.pathname==='/account'`,'session setup');
 await send('Page.navigate',{url:web+'/account/customer'});await wait(`document.querySelector('#deletion-title')`,'deletion section');
 await click('탈퇴 요청 접수');await wait(`document.querySelector('#deletion-confirm-title')&&document.activeElement?.textContent==='취소'`,'explicit confirmation and safe cancel focus');assert.equal(posts,0);await click('취소');await wait(`!document.querySelector('#deletion-confirm-title')`,'cancel');assert.equal(posts,0);passes.push('confirmation and cancel issue no deletion POST');
 await click('탈퇴 요청 접수');await click('요청 접수 확인');await wait(`document.querySelector('.profile-message')?.textContent==='탈퇴 요청이 접수되었습니다. 계정은 아직 삭제되지 않았습니다'`,'actual request accepted');assert.equal(posts,1);assert.equal(responses.length,1);assert.ok(responses[0]>=200&&responses[0]<300);await shot('deletion-requested');passes.push('explicit Web confirmation posts one accepted request');
 await send('Page.navigate',{url:web+'/account/customer'});await wait(`document.querySelector('#deletion-title')`,'account remains usable');await click('탈퇴 요청 접수');await click('요청 접수 확인');await wait(`document.querySelector('.profile-message')?.textContent==='이미 접수된 탈퇴 요청이 있습니다'`,'duplicate request');assert.equal(posts,2);assert.equal(responses[1],409);await shot('deletion-duplicate');passes.push('revisit retains account and duplicate returns 409');
 await writeFile(`${evidence}/result.json`,JSON.stringify({page:'W12',scope:'previously unverified Web deletion only',systemId:m.systemId,passes,responses},null,2));
} finally {assert.equal((await closeCdpPage({debugging,page,socket})).length,0);}
console.info(`W12_DELETION_BROWSER_PASS=${passes.length}`);
