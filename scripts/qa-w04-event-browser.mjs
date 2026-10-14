import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {openCdpPage,closeCdpPage,createCdpCommandChannel} from './qa-browser-cdp.mjs';
const m=JSON.parse(await readFile(process.env.QA_W04_MANIFEST,'utf8'));assert.equal(m.title,'qa-a0150004-public-chili');assert.notEqual(m.systemId,'7622490131194466339');
const evidence=process.env.QA_W04_EVIDENCE;assert.equal(evidence,'D:/tmp/shoppingmall-w04-20261015/evidence');await mkdir(evidence,{recursive:true});
const web='http://127.0.0.1:9091',debugging='http://127.0.0.1:9234';
const {page,socket}=await openCdpPage({debugging});const {send}=createCdpCommandChannel(socket,{timeoutMs:20000});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;}
async function wait(expression,label){const until=Date.now()+20000;while(Date.now()<until){try{if(await evaluate(`Boolean(${expression})`))return;}catch{/*navigation context*/}await new Promise(r=>setTimeout(r,100));}const state=await evaluate(`({title:document.querySelector('h1')?.textContent,images:[...document.querySelectorAll('img')].map(i=>({src:i.currentSrc,complete:i.complete,width:i.naturalWidth}))})`).catch(()=>({}));await shot('failure').catch(()=>{});throw Error(`W04 timeout: ${label}; ${JSON.stringify(state)}`);}
async function event(id,title){await send('Page.navigate',{url:web+'/events/'+id});await wait(`document.querySelector('h1')?.textContent===${JSON.stringify(title)}`,title);}
async function shot(name){const r=await send('Page.captureScreenshot',{captureBeyondViewport:true});await writeFile(`${evidence}/${name}.png`,Buffer.from(r.data,'base64'));}
const passes=[];function pass(name){passes.push(name);console.info(`W04 PASS: ${name}`);}
try{
 socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.method==='Network.loadingFailed')console.info('W04 NETWORK_FAILURE',JSON.stringify({error:data.params.errorText,blocked:data.params.blockedReason}));});
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Page.bringToFront');
 if(process.env.QA_W04_EMPTY==='1'){
  await event(m.activeId,'지금은 볼 수 없는 기획전입니다');assert.equal(await evaluate(`document.querySelectorAll('.product-link').length`),0);await shot('event-sold-out');pass('actual DB sold-out event unavailable, no stale product');
 }else{
  await event(m.activeId,'W04 진행 기획전');await wait(`document.querySelector('.home-product-photo')?.complete&&document.querySelector('.home-product-photo')?.naturalWidth===16`,'stored image');
  assert.equal(await evaluate(`document.body.textContent.includes('W04 격리 상품 상세 확인')&&document.querySelector('.product-price')?.textContent==='23,000원부터'`),true);assert.equal(await evaluate(`document.querySelector('.product-link').textContent`),m.title);await shot('event-active');pass('actual event title/description/product/price/image');
  await evaluate(`document.querySelector('.product-link').click();true`);await wait(`location.pathname==='/products/${m.productId}'&&document.querySelector('h1')?.textContent===${JSON.stringify(m.title)}`,'selected product link');pass('event product link reaches matching actual detail');
  for(const id of [m.futureId,m.expiredId,'00000000-0000-4000-8000-000000000004']){await event(id,'지금은 볼 수 없는 기획전입니다');assert.equal(await evaluate(`document.querySelectorAll('.product-link').length`),0);}await shot('event-unavailable');pass('future/expired/missing event excludes purchase products');
  await event('invalid-event-id','기획전을 불러오지 못했습니다');assert.equal(await evaluate(`document.querySelectorAll('.product-link').length`),0);await shot('event-error');
  await evaluate(`document.querySelector('a[href="/products"]').click();true`);await wait(`location.pathname==='/products'`,'catalog fallback');pass('real API invalid-target error and usable catalog fallback');
  await event(m.activeId,'W04 진행 기획전');await send('Emulation.setDeviceMetricsOverride',{width:430,height:844,deviceScaleFactor:1,mobile:true});assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);await shot('event-mobile');pass('valid revisit and 430px no overflow');
 }
 await writeFile(`${evidence}/${process.env.QA_W04_EMPTY==='1'?'empty-result':'result'}.json`,JSON.stringify({page:'W04',systemId:m.systemId,passes},null,2));
}finally{assert.equal((await closeCdpPage({debugging,page,socket})).length,0,'owned page cleanup');}
console.info(`W04_BROWSER_PASS=${passes.length}`);
