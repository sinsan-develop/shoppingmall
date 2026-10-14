import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {openCdpPage,closeCdpPage,createCdpCommandChannel} from './qa-browser-cdp.mjs';
const m=JSON.parse(await readFile(process.env.QA_W14_MANIFEST,'utf8'));const c=JSON.parse(await readFile(process.env.QA_W14_CREDENTIAL,'utf8'));assert.equal(c.email,'qa+a0150014-seller-a@example.invalid');assert.notEqual(m.systemId,'7622490131194466339');
const evidence=process.env.QA_W14_EVIDENCE;assert.equal(evidence,'D:/tmp/shoppingmall-w14-20261015/evidence');await mkdir(evidence,{recursive:true});
const debugging='http://127.0.0.1:9236',web='http://127.0.0.1:9091',api='http://127.0.0.1:9092';
const {page,socket}=await openCdpPage({debugging});const {send}=createCdpCommandChannel(socket,{timeoutMs:20000});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;}
async function wait(expression,label){const end=Date.now()+20000;while(Date.now()<end){try{if(await evaluate(`Boolean(${expression})`))return;}catch{/*navigation*/}await new Promise(r=>setTimeout(r,100));}await shot('failure').catch(()=>{});throw Error(`W14 timeout: ${label}`);}
async function shot(name){const r=await send('Page.captureScreenshot',{captureBeyondViewport:true});await writeFile(`${evidence}/${name}.png`,Buffer.from(r.data,'base64'));}
async function set(selector,value){assert.equal(await evaluate(`(()=>{const i=document.querySelector(${JSON.stringify(selector)});if(!i)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`),true);}
const photoRow=`[...document.querySelectorAll('.draft-product-item')].find(r=>r.querySelector('strong')?.textContent==='qa-a0150014-private-photos')`;
const emptyRow=`[...document.querySelectorAll('.draft-product-item')].find(r=>r.querySelector('strong')?.textContent==='qa-a0150014-empty-draft')`;
async function clickIn(row,text){assert.equal(await evaluate(`(()=>{const r=${row};const b=[...r.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b)return false;b.click();return true;})()`),true);}
async function imageList(){return evaluate(`fetch(${JSON.stringify(api+'/catalog/seller/products/'+m.photos.productId+'/revisions/'+m.photos.revisionId+'/images')},{credentials:'include'}).then(async r=>{if(!r.ok)throw Error('image list failed');return r.json()})`);}
let dialogOpen=false,deletes=0;const passes=[];
try{
 socket.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.method==='Page.javascriptDialogOpening')dialogOpen=true;if(d.method==='Network.requestWillBeSent'&&d.params.request.method==='DELETE')deletes++;});
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 // Login and prebuilt fixtures are setup, not repeated registration/upload tests.
 await send('Page.navigate',{url:web+'/login'});await wait(`document.querySelector('#login-email')&&Object.keys(document.querySelector('form')).some(k=>k.startsWith('__reactProps$'))`,'setup login');await set('#login-email',c.email);await set('#login-password',c.password);await evaluate(`document.querySelector('.account-form').requestSubmit();true`);await wait(`location.pathname==='/account'`,'setup session');
 await send('Page.navigate',{url:web+'/account/seller/products'});await wait(`${photoRow}&&${emptyRow}`,'prepared private targets');await clickIn(photoRow,'등록 사진 관리');await wait(`(${photoRow}).querySelectorAll('.draft-image-list li').length===2`,'private image list');
 await evaluate(`(${photoRow}).querySelector('[aria-label="사진 2 위로 이동"]').click();true`);await clickIn(photoRow,'사진 순서 저장');await wait(`document.body.textContent.includes('사진 순서를 저장했습니다')`,'order persisted');
 assert.deepEqual((await imageList()).map(i=>i.id),[m.imageIds[1],m.imageIds[0]]);await send('Page.reload',{ignoreCache:true});await wait(`${photoRow}`,'revisit');await clickIn(photoRow,'등록 사진 관리');await wait(`(${photoRow}).querySelectorAll('.draft-image-list li').length===2`,'restored order');assert.equal(await evaluate(`(${photoRow}).querySelector('.draft-image-list select').id`),'image-purpose-'+m.imageIds[1]);await shot('photo-order-saved');passes.push('photo order save persists and survives real revisit');
 async function confirmAction(row,text,accept){dialogOpen=false;assert.equal(await evaluate(`(()=>{const r=${row};const b=[...r.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b)return false;setTimeout(()=>b.click(),0);return true;})()`),true);const until=Date.now()+5000;while(!dialogOpen&&Date.now()<until)await new Promise(r=>setTimeout(r,50));assert.equal(dialogOpen,true);await send('Page.handleJavaScriptDialog',{accept});}
 // Cancel removal: no DELETE; then remove only this known first private image.
 const before=deletes;await confirmAction(photoRow,'사진 제거',false);assert.equal(deletes,before);await confirmAction(photoRow,'사진 제거',true);await wait(`(${photoRow}).querySelectorAll('.draft-image-list li').length===1`,'one photo removed');assert.deepEqual((await imageList()).map(i=>i.id),[m.imageIds[0]]);await shot('photo-removed');passes.push('private photo removal cancel has no DELETE, confirm removes exact image');
 const beforeDraft=deletes;await confirmAction(emptyRow,'초안 삭제',false);assert.equal(deletes,beforeDraft);assert.equal(await evaluate(`Boolean(${emptyRow})`),true);await confirmAction(emptyRow,'초안 삭제',true);await wait(`!(${emptyRow})`,'safe empty draft removed');assert.equal(await evaluate(`Boolean(${photoRow})`),true);await shot('empty-draft-deleted');passes.push('safe empty draft cancel preserves it, confirm removes only selected draft');
 await writeFile(`${evidence}/result.json`,JSON.stringify({page:'W14',scope:'previously unverified private save/removal/delete only',systemId:m.systemId,passes},null,2));
}finally{assert.equal((await closeCdpPage({debugging,page,socket})).length,0);}
console.info(`W14_BROWSER_PASS=${passes.length}`);
