// S5.4 actual Chrome check against the exact signed isolated fulfillment fixture.
import assert from 'node:assert/strict';
import { validateFulfillmentUiManifest } from '../apps/api/scripts/qa-fulfillment-ui-fixture.ts';
import { closeCdpPage, createCdpCommandChannel, openCdpPage } from './qa-browser-cdp.mjs';

const web = process.env.QA_WEB_BASE;
const debugging = process.env.QA_CHROME_DEBUGGING;
const password = process.env.QA_FIXTURE_PASSWORD;
const candidate = JSON.parse(process.env.QA_FIXTURE_JSON ?? 'null');
if (web !== 'http://127.0.0.1:9091' || debugging !== 'http://127.0.0.1:9229' ||
    !password || process.env.QA_BROWSER_CONSENT !== `S54_ISOLATED_MONITOR_${candidate?.runId ?? ''}`)
  throw new Error('S5.4 browser QA requires exact isolated inputs');
const fixture = validateFulfillmentUiManifest(candidate.runId, candidate, password);
let page;
let socket;
let channel;
const send = (method, params = {}) => channel.send(method, params);
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression, label) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    try { if (await evaluate(`Boolean(${expression})`)) return; }
    catch (error) { if (!String(error).includes('context')) throw error; }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out: ${label}`);
}
async function navigate(route) {
  await send('Page.navigate', { url: `${web}${route}` });
  await waitFor(`location.pathname===${JSON.stringify(route.split('?')[0])}`, `navigate ${route}`);
}
async function setValue(selector, value) {
  await waitFor(`document.querySelector(${JSON.stringify(selector)})`, `field ${selector}`);
  assert.equal(await evaluate(`(() => {
    const element=document.querySelector(${JSON.stringify(selector)});
    const prototype=element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,${JSON.stringify(value)});
    element.dispatchEvent(new Event('input',{bubbles:true}));
    element.dispatchEvent(new Event('change',{bubbles:true}));
    return element.value===${JSON.stringify(value)};
  })()`), true);
}
async function click(selector) {
  await waitFor(`document.querySelector(${JSON.stringify(selector)})`, `button ${selector}`);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click(); true`);
}
async function login(role, email) {
  await send('Storage.clearDataForOrigin', { origin: web, storageTypes: 'cookies,local_storage' });
  await navigate('/login');
  await waitFor(`document.querySelector('#login-email')`, 'login form');
  await setValue('#login-role', role);
  await setValue('#login-email', email);
  await setValue('#login-password', password);
  await waitFor(`Object.keys(document.querySelector('form')).some((key)=>key.startsWith('__reactProps$'))`, 'login hydration');
  await evaluate(`document.querySelector('form').requestSubmit(); true`);
  await waitFor(`location.pathname==='/account'`, `${role} login`);
}
try {
  ({ page, socket } = await openCdpPage({ debugging }));
  channel = createCdpCommandChannel(socket);
  await send('Page.enable');
  await send('Runtime.enable');
  await login('admin', fixture.emails[4]);
  await navigate('/account/admin/monitoring');
  await waitFor(`document.querySelector('input[name=from]')`, 'monitoring form');
  await setValue('input[name=from]', '2026-10-06');
  await setValue('input[name=to]', '2026-10-06');
  await evaluate(`document.querySelector('form[aria-label="관제 조회 조건"]').requestSubmit(); true`);
  await waitFor(`document.querySelector('[aria-label="관제 요약"]')?.textContent.includes('57,000원')`, 'all seller summary');
  const all = await evaluate(`({ heading:document.querySelector('h1')?.textContent,
    summary:document.querySelector('[aria-label="관제 요약"]')?.textContent,
    source:document.querySelector('a[href^="/account/admin/fulfillment?id="]')?.getAttribute('href') })`);
  assert.match(all.heading, /관리자 관제/);
  assert.match(all.summary, /주문 생성 3건/);
  assert.ok(all.source?.includes(fixture.shipmentIds[0]) || all.source?.includes(fixture.shipmentIds[1]));
  await setValue('select[name=sellerId]', fixture.sellerIds[0]);
  await evaluate(`document.querySelector('form[aria-label="관제 조회 조건"]').requestSubmit(); true`);
  await waitFor(`document.querySelector('[aria-label="관제 요약"]')?.textContent.includes('23,000원')`, 'seller summary');
  const scoped = await evaluate(`document.querySelector('[aria-label="관제 요약"]')?.textContent`);
  assert.match(scoped, /주문 생성 1건/);
  await navigate(`/account/admin/fulfillment?id=${fixture.shipmentIds[0]}`);
  await waitFor(`document.body.textContent.includes(${JSON.stringify(fixture.shipmentIds[0])})`, 'shipment detail');
  await navigate('/account/admin/monitoring');
  for (const width of [1920, 430]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 430 });
    await waitFor(`document.querySelector('h1')?.textContent.includes('관리자 관제')`, `viewport ${width}`);
    const state = await evaluate(`({ width:innerWidth,scroll:document.documentElement.scrollWidth,
      focusable:document.querySelectorAll('input,select,button,a[href]').length })`);
    assert.equal(state.width, width);
    assert.ok(state.scroll <= width, `horizontal overflow at ${width}: ${state.scroll}`);
    assert.ok(state.focusable >= 5);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    assert.ok(await evaluate(`document.activeElement !== document.body`));
  }
  await login('seller', fixture.emails[1]);
  await navigate('/account/admin/monitoring');
  await waitFor(`document.querySelector('[role=alert]')?.textContent.includes('관리자만')`, 'seller denied');
  console.log(JSON.stringify({ status: 'PASS', adminSummary: all.summary,
    sellerSummary: scoped, viewports: [1920, 430], source: all.source, sellerDenied: true }));
} finally {
  await closeCdpPage({ debugging, page, socket });
}
