// Actual Chrome check against the one-use S6 PostgreSQL fixture.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { closeCdpPage, createCdpCommandChannel, openCdpPage } from './qa-browser-cdp.mjs';

const web = process.env.QA_WEB_BASE;
const debugging = process.env.QA_CHROME_DEBUGGING;
const password = process.env.QA_FIXTURE_PASSWORD;
const runId = process.env.S6_BROWSER_QA_RUN_ID;
if (web !== 'http://127.0.0.1:9091' || debugging !== 'http://127.0.0.1:9229' ||
  !/^[a-f0-9]{8}$/i.test(runId ?? '') || !password ||
  process.env.QA_BROWSER_CONSENT !== `S6_ISOLATED_SETTLEMENT_${runId}`) {
  throw new Error('S6 browser QA requires exact isolated inputs');
}

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
  await waitFor(`location.pathname===${JSON.stringify(route)}`, `navigate ${route}`);
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
async function login(role, email) {
  await send('Storage.clearDataForOrigin', { origin: web, storageTypes: 'cookies,local_storage' });
  await navigate('/login');
  await waitFor(`document.querySelector('#login-email')`, 'login form');
  await waitFor(`Object.keys(document.querySelector('form')).some((key)=>key.startsWith('__reactProps$'))`, 'login hydration');
  await setValue('#login-role', role);
  await setValue('#login-email', email);
  await setValue('#login-password', password);
  await evaluate(`document.querySelector('form').requestSubmit(); true`);
  await waitFor(`location.pathname==='/account'`, `${role} login`);
}
async function queryPeriod(expectedTotal) {
  await waitFor(`document.querySelector('form[aria-label="정산 조회 조건"]')`, 'settlement form');
  await setValue('input[name=from]', '2026-05-01');
  await setValue('input[name=to]', '2026-05-20');
  await evaluate(`document.querySelector('form[aria-label="정산 조회 조건"]').requestSubmit(); true`);
  try {
    await waitFor(`document.querySelector('[aria-label="전체 정산 자료 합계"]')?.textContent.includes(${JSON.stringify(expectedTotal)})`, 'settlement report');
  } catch (error) {
    const diagnostic = await evaluate(`({path:location.pathname,
      from:document.querySelector('input[name=from]')?.value,
      to:document.querySelector('input[name=to]')?.value,
      alert:document.querySelector('[role=alert]')?.textContent,
      report:document.querySelector('.settlement-print')?.textContent.slice(0,600),
      busy:document.querySelector('main')?.textContent.slice(0,400)})`);
    throw new Error(`Settlement browser diagnostic: ${JSON.stringify(diagnostic)}`, {cause:error});
  }
}
try {
  ({ page, socket } = await openCdpPage({ debugging }));
  channel = createCdpCommandChannel(socket);
  await send('Page.enable');
  await send('Runtime.enable');
  await login('admin', `qa+${runId}-admin@example.invalid`);
  await navigate('/account/admin/settlement');
  await queryPeriod('19,000원');
  const all = await evaluate(`({groups:[...document.querySelectorAll('.settlement-print > .settlement-group')].map(x=>x.textContent),
    total:document.querySelector('[aria-label="전체 정산 자료 합계"]')?.textContent})`);
  assert.equal(all.groups.length, 2);
  assert.ok(all.groups.some((group) => group.includes(`qa-${runId}-seller-a`) && group.includes('12,000원')));
  assert.ok(all.groups.some((group) => group.includes(`qa-${runId}-seller-b`) && group.includes('7,000원')));
  assert.match(all.total, /19,000원/);
  assert.equal(await evaluate(`document.querySelectorAll('.settlement-completion').length`), 2);
  assert.ok(await evaluate(`[...document.querySelectorAll('.settlement-completion h3')]
    .some((heading)=>heading.textContent==='qa-${runId}-seller-c')`));
  await evaluate(`(() => { const form=[...document.querySelectorAll('.settlement-completion')]
    .find((item)=>item.querySelector('h3')?.textContent==='qa-${runId}-seller-c');
    form.querySelector('input[name=reason]').value='0건 완료 검증';
    form.requestSubmit(); return true; })()`);
  await waitFor(`document.querySelector('.settlement-history')?.textContent.includes('0건 완료 검증')`,
    'zero-event seller completed');
  assert.equal(await evaluate(`document.querySelectorAll('.settlement-completion').length`), 1);
  assert.match(await evaluate(`document.querySelector('.settlement-history')?.textContent`), /0원/);
  assert.match(await evaluate(`document.querySelector('[aria-label="판매자별 완료 기록"]')?.textContent`),
    /이미 완료된 기간과 겹칩니다/);
  assert.match(await evaluate(`document.querySelector('.settlement-history')?.textContent`),
    /오프라인 확인/);
  assert.match(await evaluate(`document.querySelector('.settlement-history')?.textContent`),
    /12,000원/);
  assert.match(await evaluate(`document.querySelector('.settlement-late')?.textContent`),
    /1,300원/);
  const categoryId = await evaluate(`[...document.querySelectorAll('select[name=categoryId] option')]
    .find((option)=>option.textContent==='qa-${runId}-sellers')?.value`);
  const sellerBId = await evaluate(`[...document.querySelectorAll('select[name=sellerId] option')]
    .find((option)=>option.textContent==='qa-${runId}-seller-b')?.value`);
  assert.ok(categoryId && sellerBId);
  await setValue('select[name=categoryId]', categoryId);
  await queryPeriod('12,000원');
  assert.equal(await evaluate(`document.querySelectorAll('.settlement-print > .settlement-group').length`), 1);
  await setValue('select[name=categoryId]', '');
  await setValue('select[name=sellerId]', sellerBId);
  await queryPeriod('7,000원');
  assert.equal(await evaluate(`document.querySelectorAll('.settlement-print > .settlement-group').length`), 1);
  await setValue('select[name=sellerId]', '');
  await queryPeriod('19,000원');
  await send('Emulation.setEmulatedMedia', {media:'print'});
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.settlement-controls')).display`), 'none');
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.settlement-print')).display`), 'none');
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.settlement-history')).display`), 'none');
  const printed = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  const pdf = Buffer.from(printed.data ?? '', 'base64');
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.ok(pdf.length > 10000, `printed PDF too small: ${pdf.length} bytes`);
  if (process.env.S6_BROWSER_PDF_OUTPUT) {
    if (process.env.S6_BROWSER_PDF_OUTPUT !== '/evidence/settlement.pdf')
      throw new Error('Unexpected S6 browser PDF output path');
    await writeFile(process.env.S6_BROWSER_PDF_OUTPUT, pdf);
  }
  await send('Emulation.setEmulatedMedia', {media:'screen'});
  for (const width of [1440, 430]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 430 });
    const state = await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth})`);
    assert.equal(state.width, width);
    assert.ok(state.scroll <= width, `horizontal overflow at ${width}: ${state.scroll}`);
  }
  await login('seller', `qa+${runId}-seller-a@example.invalid`);
  await navigate('/account/seller/settlement');
  await queryPeriod('12,000원');
  const own = await evaluate(`({groups:[...document.querySelectorAll('.settlement-print > .settlement-group')].map(x=>x.textContent),
    total:document.querySelector('[aria-label="전체 정산 자료 합계"]')?.textContent,
    completion:document.querySelectorAll('.settlement-completion').length})`);
  assert.equal(own.groups.length, 1);
  assert.match(own.groups[0], new RegExp(`qa-${runId}-seller-a`));
  assert.match(own.total, /12,000원/);
  assert.equal(own.completion, 0);
  assert.match(await evaluate(`document.querySelector('.settlement-history')?.textContent`),
    /오프라인 확인/);
  assert.match(await evaluate(`document.querySelector('.settlement-late')?.textContent`),
    /1,300원/);
  await navigate('/account/admin/settlement');
  await waitFor(`document.querySelector('[role=alert]')?.textContent.includes('현재 역할')`, 'seller denied');
  console.log(JSON.stringify({status:'PASS', runId, adminGroups:all.groups.length,
    adminCommission:19000, sellerCommission:12000, pdfBytes:pdf.length,
    viewports:[1440,430], sellerDenied:true}));
} finally {
  await closeCdpPage({ debugging, page, socket });
}
