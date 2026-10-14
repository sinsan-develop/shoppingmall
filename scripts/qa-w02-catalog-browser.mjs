import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createCdpCommandChannel, openCdpPage, closeCdpPage } from './qa-browser-cdp.mjs';
const web='http://127.0.0.1:9091', debugging='http://127.0.0.1:9232';
const manifest=JSON.parse(await readFile(process.env.QA_W02_MANIFEST,'utf8'));
assert.match(manifest.systemId,/^\d+$/); assert.notEqual(manifest.systemId,'7622490131194466339');
assert.equal(manifest.title,'qa-a0140002-public-chili'); assert.equal(manifest.count,25);
const evidence=process.env.QA_W02_EVIDENCE;
assert.equal(evidence,'D:/tmp/shoppingmall-w02-20261014/evidence');
await mkdir(evidence,{recursive:true});
const {page,socket}=await openCdpPage({debugging});
const {send}=createCdpCommandChannel(socket,{timeoutMs:20000});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;}
async function wait(expression,label){const until=Date.now()+20000;while(Date.now()<until){try{if(await evaluate(expression))return;}catch{/*navigation*/}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`W02 timeout: ${label}`);}
async function navigate(path){await send('Page.navigate',{url:web+path});await wait(`document.querySelector('#product-query')&& !document.querySelector('[role="status"]')`,path);}
async function set(selector,value){assert.equal(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;const p=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}));return true})()`),true);}
async function submit(){await evaluate(`document.querySelector('.search-filters').requestSubmit();true`);await wait(`document.querySelector('#product-query')&&!document.querySelector('[role="status"]')`,'submitted query');}
const count=`document.querySelectorAll('.search-product').length`;
const passes=[];
function pass(name){passes.push(name);console.info(`W02 PASS: ${name}`);}
async function screenshot(name){const result=await send('Page.captureScreenshot',{captureBeyondViewport:true});await writeFile(`${evidence}/${name}.png`,Buffer.from(result.data,'base64'));}
try{
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Page.bringToFront');
 await navigate('/products');await wait(`${count}===24&&document.querySelector('#search-more')`,'first page');pass('real DB first page 24 of 25');
 await set('#product-query',manifest.title);await set('#product-category',manifest.majorId);await set('#product-seller',manifest.sellerId);await set('#product-sort','price_asc');await submit();
 await wait(`new URLSearchParams(location.search).get('sort')==='price_asc'&&${count}===24`,'combined form');
 assert.deepEqual(await evaluate(`(()=>{const p=new URLSearchParams(location.search);return [p.get('q'),p.get('categoryId'),p.get('sellerId')]})()`),[manifest.title,manifest.majorId,manifest.sellerId]);
 assert.deepEqual(await evaluate(`[...document.querySelectorAll('.product-price')].slice(0,3).map(e=>e.textContent)`),['23,000원부터','23,001원부터','23,002원부터']);pass('search + major category + seller + ascending price submit');
 await set('#product-category',manifest.minorId);await set('#product-sort','price_desc');await submit();
 await wait(`new URLSearchParams(location.search).get('sort')==='price_desc'&&${count}===24`,'descending');
 assert.deepEqual(await evaluate(`[...document.querySelectorAll('.product-price')].slice(0,3).map(e=>e.textContent)`),['23,024원부터','23,023원부터','23,022원부터']);pass('minor category and descending actual prices');
 await send('Network.setBlockedURLs',{urls:['*://127.0.0.1:9092/catalog/products*page=2*']});
 await evaluate(`document.querySelector('#search-more').click();true`);
 await wait(`document.querySelector('[role="alert"]')&& !document.querySelector('#search-more').disabled`,'more failure');
 assert.equal(await evaluate(count),24);pass('next page failure preserves first page, retry available');
 await send('Network.setBlockedURLs',{urls:[]});await evaluate(`document.querySelector('#search-more').click();true`);
 await wait(`${count}===25&&document.querySelector('#search-end')`,'more retry');
 assert.equal(await evaluate(`new Set([...document.querySelectorAll('.product-link')].map(e=>e.href)).size`),25);
 assert.equal(await evaluate(`document.querySelector('#search-more')===null`),true);pass('retry appends one product once, focus/end boundary');
 await screenshot('catalog-complete');
 await set('#product-query','W02-no-matching-product');await submit();
 await wait(`document.querySelector('.product-empty')?.textContent.includes('검색 결과가 없습니다')`,'empty search');assert.equal(await evaluate(count),0);pass('missing search -> empty result, no stale cards');
 await set('#product-query','');await set('#product-seller',manifest.emptySellerId);await submit();
 await wait(`new URLSearchParams(location.search).get('sellerId')===${JSON.stringify(manifest.emptySellerId)}&&document.querySelector('.product-empty')`,'empty seller');pass('seller without products -> empty result');
 await send('Network.setBlockedURLs',{urls:['*://127.0.0.1:9092/catalog/products*']});await send('Page.navigate',{url:web+'/products'});
 await wait(`document.querySelector('[role="alert"]')?.textContent.includes('검색을 불러올 수 없습니다')`,'initial error');assert.equal(await evaluate(count),0);await screenshot('catalog-error');
 await send('Network.setBlockedURLs',{urls:[]});await submit();await wait(`${count}===24`,'search retry');pass('initial fetch error -> same search form recovers real result');
 await send('Emulation.setDeviceMetricsOverride',{width:430,height:844,deviceScaleFactor:1,mobile:true});assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);await screenshot('catalog-mobile');pass('430px fields/results no horizontal overflow');
 await send('Emulation.clearDeviceMetricsOverride');
 await writeFile(`${evidence}/result.json`,JSON.stringify({page:'W02',systemId:manifest.systemId,passes},null,2));
}finally{assert.equal((await closeCdpPage({debugging,page,socket})).length,0,'owned page cleanup');}
console.info(`W02_BROWSER_PASS=${passes.length}`);
