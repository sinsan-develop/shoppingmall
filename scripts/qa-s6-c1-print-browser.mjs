// Actual Chromium print check for the disposable C1 settlement fixture.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { closeCdpPage, createCdpCommandChannel, openCdpPage } from './qa-browser-cdp.mjs';

const web = process.env.QA_WEB_BASE;
const debugging = process.env.QA_CHROME_DEBUGGING;
const password = process.env.QA_FIXTURE_PASSWORD;
const run = process.env.S6_C1_BROWSER_RUN;
const output = process.env.S6_C1_PDF_DIR;
if (web !== 'http://127.0.0.1:9091' || debugging !== 'http://127.0.0.1:9229' ||
  !/^[a-f0-9]{8}$/.test(run ?? '') || !password ||
  output !== 'D:/tmp/shoppingmall-s6-c1-print-1009' ||
  process.env.QA_BROWSER_CONSENT !== `S6_C1_ISOLATED_${run}`) {
  throw new Error('C1 browser print QA requires exact isolated inputs');
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
  await setValue('#login-email', `qa-s6-c1-${role}-${run}@example.invalid`);
  await setValue('#login-password', password);
  await evaluate(`document.querySelector('form').requestSubmit(); true`);
  await waitFor(`location.pathname==='/account'`, `${role} login`);
}
async function queryReport(route) {
  await navigate(route);
  await waitFor(`document.querySelector('form[aria-label="정산 조회 조건"]')`, 'filter');
  await setValue('input[name=from]', '2026-05-01');
  await setValue('input[name=to]', '2026-12-31');
  await evaluate(`document.querySelector('form[aria-label="정산 조회 조건"]')
    .requestSubmit(); true`);
  await waitFor(`document.querySelector('.settlement-print')?.textContent
    .includes('브라우저 QA 정정')`, 'correction report');
  const report = await evaluate(`document.querySelector('.settlement-print').textContent`);
  for (const expected of ['10,000원', '2,000원', '8,000원', '원사건', '브라우저 QA 정정']) {
    assert.ok(report.includes(expected), `Missing report evidence: ${expected}`);
  }
  return report;
}
async function print(filename) {
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  assert.equal(await evaluate(`getComputedStyle(
    document.querySelector('.settlement-controls')).display`), 'none');
  const printed = await send('Page.printToPDF', {
    printBackground: true, preferCSSPageSize: true,
  });
  const pdf = Buffer.from(printed.data ?? '', 'base64');
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.ok(pdf.length > 10_000, `PDF too small: ${pdf.length}`);
  await writeFile(`${output}/${filename}`, pdf);
  const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;
  assert.ok(pageCount >= 1 && pageCount <= 2,
    `Fixture print should fit within two pages: ${pageCount}`);
  await send('Emulation.setEmulatedMedia', { media: 'screen' });
  return pdf.length;
}
try {
  ({ page, socket } = await openCdpPage({ debugging }));
  channel = createCdpCommandChannel(socket);
  await send('Page.enable');
  await send('Runtime.enable');
  await login('admin');
  const admin = await queryReport('/account/admin/settlement');
  const adminPdfBytes = await print('admin.pdf');
  for (const width of [1440, 430]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width, height: 900, deviceScaleFactor: 1, mobile: width === 430,
    });
    const state = await evaluate(`({width:innerWidth,
      scroll:document.documentElement.scrollWidth})`);
    assert.equal(state.width, width);
    assert.ok(state.scroll <= width, `Horizontal overflow at ${width}: ${state.scroll}`);
  }
  await send('Emulation.clearDeviceMetricsOverride');
  await login('seller');
  const seller = await queryReport('/account/seller/settlement');
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label="정정 사건 기록"]').length`), 0);
  const sellerPdfBytes = await print('seller.pdf');
  console.log(JSON.stringify({ status: 'PASS', run, adminPdfBytes, sellerPdfBytes,
    adminEvidence: admin.includes('브라우저 QA 정정'),
    sellerEvidence: seller.includes('브라우저 QA 정정'),
    viewports: [1440, 430] }));
} finally {
  await closeCdpPage({ debugging, page, socket });
}
