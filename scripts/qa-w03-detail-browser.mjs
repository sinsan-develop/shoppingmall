import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {openCdpPage,closeCdpPage,createCdpCommandChannel} from './qa-browser-cdp.mjs';
const m=JSON.parse(await readFile(process.env.QA_W03_MANIFEST,'utf8'));
const credential=JSON.parse(await readFile(process.env.QA_W03_CREDENTIAL,'utf8'));
assert.equal(m.title,'qa-a0150003-public-chili');assert.notEqual(m.systemId,'7622490131194466339');
assert.equal(credential.email,'qa+a0150003-customer@example.invalid');
const evidence=process.env.QA_W03_EVIDENCE;assert.equal(evidence,'D:/tmp/shoppingmall-w03-20261015/evidence');await mkdir(evidence,{recursive:true});
const debugging='http://127.0.0.1:9233',web='http://127.0.0.1:9091',api='http://127.0.0.1:9092';
const {page,socket}=await openCdpPage({debugging});const {send}=createCdpCommandChannel(socket,{timeoutMs:20000});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;}
async function wait(expression,label){const until=Date.now()+20000;while(Date.now()<until){try{if(await evaluate(`Boolean(${expression})`))return;}catch{/*navigation*/}await new Promise(r=>setTimeout(r,100));}throw Error(`W03 timeout: ${label}`);}
async function detail(){await send('Page.navigate',{url:`${web}/products/${m.productId}`});await wait(`document.querySelector('h1')?.textContent===${JSON.stringify(m.title)}&&document.querySelector('.engagement-controls')&&!document.querySelector('.engagement-controls [role="status"]')`,'detail ready');}
async function set(selector,value){assert.equal(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`),true);}
async function click(selector){assert.equal(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.click();return true})()`),true);}
async function read(path){return evaluate(`(async()=>{const r=await fetch(${JSON.stringify(api+path)},{credentials:'include'});return {status:r.status,body:await r.json()}})()`);}
async function shot(name){const r=await send('Page.captureScreenshot',{captureBeyondViewport:true});await writeFile(`${evidence}/${name}.png`,Buffer.from(r.data,'base64'));}
const passes=[];function pass(name){passes.push(name);console.info(`W03 PASS: ${name}`);}
const qty=`#cart-qty-${m.availableId}`;
const availableButton=`.detail-cart-option:has(${qty}) button`;
try{
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Page.bringToFront');await detail();
 await wait(`document.querySelectorAll('.detail-gallery img').length===2&&[...document.querySelectorAll('.detail-gallery img')].every(i=>i.complete&&i.naturalWidth===16)`,'real stored images');
 assert.equal(await evaluate(`document.querySelector('.detail-options').textContent.includes('500g')&&document.querySelector('.detail-options').textContent.includes('23,000')&&document.querySelector('.detail-options').textContent.includes('46,000')&&document.querySelector('.detail-options').textContent.includes('품절')`),true);await shot('detail-public');pass('actual stored WebP images, description, option prices and sold-out');
 assert.equal(await evaluate(`document.querySelector('#cart-qty-${m.soldOutId}').disabled`),true);
 for(const value of ['0','6','1.5']){await set(qty,value);assert.equal(await evaluate(`document.querySelector(${JSON.stringify(availableButton)}).disabled`),true);}await set(qty,'2');
 assert.equal(await evaluate(`document.querySelector(${JSON.stringify(availableButton)}).disabled`),false);pass('sold-out and invalid/over-stock quantity blocked');
 await click(availableButton);await wait(`document.body.textContent.includes('로그인 후 장바구니를 이용해 주세요')`,'anonymous cart rejected');assert.equal((await read('/customer/cart')).status,401);pass('anonymous cart/engagement denied');
 await send('Page.navigate',{url:web+'/login'});await wait(`document.querySelector('#login-email')&&Object.keys(document.querySelector('form')).some(k=>k.startsWith('__reactProps$'))`,'hydrated login');
 await set('#login-email',credential.email);await set('#login-password',credential.password);await evaluate(`document.querySelector('.account-form').requestSubmit();true`);await wait(`location.pathname==='/account'`,'customer login');await detail();
 await click('.engagement-controls button');await wait(`document.querySelector('.engagement-controls button').textContent==='찜 해제'`,'favorite saved');assert.equal((await read('/customer/favorites')).body[0].productId,m.productId);await detail();await wait(`document.querySelector('.engagement-controls button').textContent==='찜 해제'`,'favorite restored');pass('favorite UI -> DB -> reload');
 await click('[aria-label="1kg 재입고 신청"]');await wait(`document.querySelector('[aria-label="1kg 재입고 신청 취소"]')`,'restock saved');assert.equal((await read('/customer/restock-subscriptions')).body[0].status,'active');await detail();await wait(`document.querySelector('[aria-label="1kg 재입고 신청 취소"]')`,'restock restored');await shot('detail-engagement');pass('sold-out subscription UI -> DB -> reload');
 await click('[aria-label="1kg 재입고 신청 취소"]');await wait(`document.querySelector('[aria-label="1kg 재입고 신청"]')&&!document.querySelector('[aria-label="1kg 재입고 신청 취소"]')`,'restock cancelled');await click('.engagement-controls button');await wait(`document.querySelector('.engagement-controls button').textContent==='상품 찜하기'`,'favorite removed');assert.equal((await read('/customer/favorites')).body.length,0);pass('owned favorite remove and restock cancel');
 await set(qty,'2');await click(availableButton);await wait(`location.pathname==='/cart'&&document.body.textContent.includes(${JSON.stringify(m.title)})`,'cart persisted');const cart=await read('/customer/cart');assert.equal(cart.status,200);assert.equal(cart.body[0].quantity,2);assert.equal(cart.body[0].optionId,m.availableId);pass('quantity 2 add -> actual cart persistence');
 await detail();await send('Network.setBlockedURLs',{urls:[`*://127.0.0.1:9092/catalog/products/${m.productId}`]});await send('Page.reload');await wait(`document.querySelector('[role="alert"]')?.textContent==='상품을 불러올 수 없습니다'`,'detail failure');assert.equal(await evaluate(`document.querySelector('.detail-cart-controls')===null`),true);await send('Network.setBlockedURLs',{urls:[]});await detail();pass('detail network failure hides purchase; reload restores');
 await send('Page.navigate',{url:web+'/products/00000000-0000-4000-8000-000000000003'});await wait(`document.querySelector('[role="alert"]')?.textContent==='상품을 찾을 수 없습니다'`,'missing product');assert.equal(await evaluate(`document.querySelector('.detail-cart-controls')===null`),true);pass('missing product no stale purchase controls');
 await detail();await send('Emulation.setDeviceMetricsOverride',{width:430,height:844,deviceScaleFactor:1,mobile:true});assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);await shot('detail-mobile');pass('430px option/image/actions layout');
 await writeFile(`${evidence}/result.json`,JSON.stringify({page:'W03',systemId:m.systemId,passes},null,2));
}finally{assert.equal((await closeCdpPage({debugging,page,socket})).length,0,'owned page cleanup');}
console.info(`W03_BROWSER_PASS=${passes.length}`);
