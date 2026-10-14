import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createCdpCommandChannel, openCdpPage, closeCdpPage } from './qa-browser-cdp.mjs';

const web = 'http://127.0.0.1:9091';
const debugging = 'http://127.0.0.1:9231';
const manifest = JSON.parse(await readFile(process.env.QA_W01_MANIFEST, 'utf8'));
assert.match(manifest.systemId, /^\d+$/);
assert.notEqual(manifest.systemId, '7622490131194466339');
assert.equal(manifest.title, 'qa-a0140001-public-chili');
const evidence = process.env.QA_W01_EVIDENCE;
assert.equal(evidence, 'D:/tmp/shoppingmall-w01-20261014/evidence');
await mkdir(evidence, { recursive: true });
const { page, socket } = await openCdpPage({ debugging });
const { send } = createCdpCommandChannel(socket, { timeoutMs: 20000 });
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function wait(expression, label) {
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    try { if (await evaluate(expression)) return; } catch { /* navigation context */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`W01 timeout: ${label}`);
}
async function home() {
  await send('Page.navigate', { url: web });
  await wait(`document.querySelector('.home-products')?.textContent.includes(${JSON.stringify(manifest.title)})`, 'live home product');
}
async function click(selector, condition, label) {
  assert.equal(await evaluate(`(()=>{const a=document.querySelector(${JSON.stringify(selector)});if(!a)return false;a.click();return true})()`), true);
  await wait(condition, label);
}
async function screenshot(name) {
  const result = await send('Page.captureScreenshot', { captureBeyondViewport: true });
  await writeFile(`${evidence}/${name}.png`, Buffer.from(result.data, 'base64'));
}
const passes = [];
function pass(name) { passes.push(name); console.info(`W01 PASS: ${name}`); }
try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Page.bringToFront');
  if (process.env.QA_W01_EMPTY === '1') {
    await send('Page.navigate', { url: web });
    await wait(`document.body.textContent.includes('현재 진행 중인 기획전이 없습니다')&&document.body.textContent.includes('관리자가 추천 상품을 준비 중입니다')`, 'DB empty home');
    assert.equal(await evaluate(`document.querySelectorAll('.site-menu a').length`), 2);
    assert.equal(await evaluate(`document.querySelectorAll('.home-products .product-link,.event-card').length`), 0);
    await screenshot('home-empty'); pass('real DB empty publication -> no stale products, fixed navigation');
    await writeFile(`${evidence}/empty-result.json`, JSON.stringify({ page: 'W01', systemId: manifest.systemId, passes }, null, 2));
  } else {
  await home();
  const data = await evaluate(`(async()=>{const r=await fetch('http://127.0.0.1:9092/home/content');return {status:r.status,body:await r.json()}})()`);
  assert.equal(data.status, 200);
  assert.equal(data.body.recommendations[0].productId, manifest.productId);
  assert.equal(await evaluate(`document.querySelector('.home-products').textContent.includes('23,000원')`), true);
  assert.equal(await evaluate(`document.querySelector('.site-menu').textContent.includes('W01 숨김 메뉴')`), false);
  await screenshot('home-populated'); pass('real API/DB published home, price, hidden menu');
  await evaluate(`(()=>{const i=document.querySelector('#home-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(manifest.title)});i.dispatchEvent(new Event('input',{bubbles:true}));i.form.requestSubmit();return true})()`);
  await wait(`location.pathname==='/products'&&new URLSearchParams(location.search).get('q')===${JSON.stringify(manifest.title)}&&document.body.textContent.includes(${JSON.stringify(manifest.title)})`, 'search result'); pass('home search submit -> real product result');
  await home();
  await click(`a[href="/products?categoryId=${manifest.majorId}"]`, `new URLSearchParams(location.search).get('categoryId')===${JSON.stringify(manifest.majorId)}&&document.querySelector('.search-results')?.textContent.includes(${JSON.stringify(manifest.title)})`, 'category'); pass('category -> DB product');
  await home();
  await click(`a[href="/products?sellerId=${manifest.sellerId}"]`, `new URLSearchParams(location.search).get('sellerId')===${JSON.stringify(manifest.sellerId)}&&document.querySelector('.search-results')?.textContent.includes(${JSON.stringify(manifest.title)})`, 'seller'); pass('seller -> owned public catalog');
  await home();
  await click('.event-card', `location.pathname==='/events/${manifest.eventId}'&&document.body.textContent.includes(${JSON.stringify(manifest.title)})`, 'event'); pass('event card -> actual selected product');
  await home();
  await click('.home-products .product-link', `location.pathname==='/products/${manifest.productId}'&&document.body.textContent.includes('500g')&&document.body.textContent.includes('23,000')`, 'recommendation'); pass('recommendation -> real option/price');
  await home();
  await click('.site-menu a[href="/products/'+manifest.productId+'"]', `location.pathname==='/products/${manifest.productId}'&&document.body.textContent.includes('500g')`, 'menu'); pass('published menu -> real detail');
  await send('Network.setBlockedURLs', { urls: ['*://127.0.0.1:9092/home/content'] });
  await send('Page.navigate', { url: web });
  await wait(`document.querySelectorAll('[role="alert"] button').length===2`, 'home error retry');
  assert.equal(await evaluate(`document.querySelectorAll('.home-products .product-link').length`), 0);
  await screenshot('home-error');
  await send('Network.setBlockedURLs', { urls: [] });
  await click('[role="alert"] button', `document.querySelector('.home-products')?.textContent.includes(${JSON.stringify(manifest.title)})`, 'retry'); pass('network failure clears data -> explicit retry restores real data');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 844, deviceScaleFactor: 1, mobile: true });
  await wait(`innerWidth===430`, 'mobile width');
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), true);
  await screenshot('home-mobile'); pass('430px no horizontal overflow');
  await send('Emulation.clearDeviceMetricsOverride');
  await writeFile(`${evidence}/result.json`, JSON.stringify({ page: 'W01', systemId: manifest.systemId, passes }, null, 2));
  }
} finally {
  const errors = await closeCdpPage({ debugging, page, socket });
  assert.equal(errors.length, 0, 'W01 owned page cleanup');
}
console.info(`W01_BROWSER_PASS=${passes.length}`);
