// Disposable Chromium evidence for historical seller-category settlement reports.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { closeCdpPage, createCdpCommandChannel, openCdpPage } from './qa-browser-cdp.mjs';

const web = 'http://127.0.0.1:9091';
const debugging = 'http://127.0.0.1:9229';
const run = process.env.S6_C2_BROWSER_RUN;
const output = process.env.S6_C2_PDF_DIR;
const x = process.env.S6_C2_X_ID;
const y = process.env.S6_C2_Y_ID;
if (!/^[a-f0-9]{8}$/.test(run ?? '') ||
  output !== 'D:/tmp/shoppingmall-s6-c2-pdf-1010' ||
  ![x, y].every((id) => /^[0-9a-f-]{36}$/.test(id ?? '')) ||
  process.env.QA_BROWSER_CONSENT !== `S6_C2_ISOLATED_${run}`) {
  throw new Error('C2 browser QA requires exact isolated inputs');
}

let page;
let socket;
let channel;
const send = (method, params = {}) => channel.send(method, params);
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression, label) {
  const until = Date.now() + 20_000;
  while (Date.now() < until) {
    try { if (await evaluate(`Boolean(${expression})`)) return; }
    catch (error) { if (!String(error).includes('context')) throw error; }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out: ${label}`);
}
async function navigate(route) {
  await send('Page.navigate', { url: `${web}${route}` });
  await waitFor(`location.pathname===${JSON.stringify(route)}`, route);
}
async function setValue(selector, value) {
  await waitFor(`document.querySelector(${JSON.stringify(selector)})`, selector);
  assert.equal(await evaluate(`(() => {
    const element=document.querySelector(${JSON.stringify(selector)});
    const prototype=element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,${JSON.stringify(value)});
    element.dispatchEvent(new Event('input',{bubbles:true}));
    element.dispatchEvent(new Event('change',{bubbles:true}));
    return element.value===${JSON.stringify(value)};
  })()`), true);
}
async function login(role) {
  await send('Storage.clearDataForOrigin', { origin: web, storageTypes: 'cookies,local_storage' });
  await navigate('/login');
  await waitFor(`document.querySelector('#login-email')`, 'login form');
  await waitFor(`Object.keys(document.querySelector('form'))
    .some((key)=>key.startsWith('__reactProps$'))`, 'login hydration');
  await setValue('#login-role', role);
  await setValue('#login-email', `qa+${run}-${role === 'seller' ? 'seller-a' : role}@example.invalid`);
  await setValue('#login-password', 'test-only-password-12345');
  await evaluate(`document.querySelector('form').requestSubmit(); true`);
  await waitFor(`location.pathname==='/account'`, `${role} login`);
}
async function report(categoryId, expected, absent) {
  await waitFor(`document.querySelector('form[aria-label="정산 조회 조건"]')`, 'filter');
  await setValue('input[name=from]', '2026-05-01');
  await setValue('input[name=to]', '2026-05-20');
  if (categoryId) {
    await waitFor(`document.querySelector('select[name=categoryId] option[value=${JSON.stringify(categoryId)}]')`,
      'category choice');
    await setValue('select[name=categoryId]', categoryId);
  }
  await evaluate(`document.querySelector('form[aria-label="정산 조회 조건"]')
    .requestSubmit(); true`);
  await waitFor(`(() => { const text=document.querySelector('.settlement-print')?.textContent ?? '';
    return ${JSON.stringify(expected)}.every((v)=>text.includes(v)) &&
      ${JSON.stringify(absent)}.every((v)=>!text.includes(v)); })()`, `report ${categoryId ?? 'all'}`);
  const text = await evaluate(`document.querySelector('.settlement-print').textContent`);
  assert.ok(expected.every((part) => text.includes(part)));
  assert.ok(absent.every((part) => !text.includes(part)));
  return text;
}
async function print(filename) {
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  assert.equal(await evaluate(`getComputedStyle(
    document.querySelector('.settlement-controls')).display`), 'none');
  const result = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  const bytes = Buffer.from(result.data ?? '', 'base64');
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.ok(bytes.length > 10_000);
  await writeFile(`${output}/${filename}`, bytes);
  await send('Emulation.setEmulatedMedia', { media: 'screen' });
  return bytes.length;
}
try {
  ({ page, socket } = await openCdpPage({ debugging }));
  channel = createCdpCommandChannel(socket);
  await send('Page.enable');
  await send('Runtime.enable');
  await login('admin');
  await navigate('/account/admin/settlement');
  const all = await report(null, ['14,000원', '10,000원', '4,000원', 'C2 과거 X', 'C2 현재 Y'], []);
  const allPdf = await print('admin-all.pdf');
  await evaluate(`document.querySelector('select[name=categoryId]').focus(); true`);
  await send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9,
  });
  assert.equal(await evaluate(`document.activeElement?.getAttribute('name')`), 'sellerId');
  assert.equal(await evaluate(`document.activeElement?.matches(':focus-visible')`), true);
  for (const width of [1440, 430]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width, height: 900, deviceScaleFactor: 1, mobile: width === 430,
    });
    const size = await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth})`);
    assert.equal(size.width, width);
    assert.ok(size.scroll <= width, `Horizontal overflow at ${width}: ${size.scroll}`);
  }
  await send('Emulation.clearDeviceMetricsOverride');
  const xReport = await report(x, ['10,000원', 'C2 0건 완료', '선택 분류 합계'], ['14,000원', '4,000원']);
  const xPdf = await print('admin-x.pdf');
  const yReport = await report(y, ['4,000원', '선택 분류 합계'], ['14,000원', '10,000원', 'C2 0건 완료']);
  const yPdf = await print('admin-y.pdf');
  await login('seller');
  await navigate('/account/seller/settlement');
  const own = await report(null, ['14,000원', '10,000원', '4,000원'], []);
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label="정정 사건 기록"]').length`), 0);
  const sellerPdf = await print('seller.pdf');
  console.info(JSON.stringify({ status: 'PASS', run, viewports: [1440, 430],
    all: all.includes('14,000원'), x: xReport.includes('10,000원'),
    y: yReport.includes('4,000원'), own: own.includes('14,000원'),
    pdfBytes: [allPdf, xPdf, yPdf, sellerPdf] }));
} finally { await closeCdpPage({ debugging, page, socket }); }
