// Run only against the run-scoped S5 fulfillment fixture and an isolated Chrome profile.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fulfillmentUiExpectedShipDate,
  validateFulfillmentUiManifest } from '../apps/api/scripts/qa-fulfillment-ui-fixture.ts';
import { closeCdpPage, createCdpCommandChannel, openCdpPage,
  visitKeyboardTargets } from './qa-browser-cdp.mjs';

const web = process.env.QA_WEB_BASE;
const password = process.env.QA_FIXTURE_PASSWORD;
const candidateFixture = JSON.parse(process.env.QA_FIXTURE_JSON ?? 'null');
const debugging = process.env.QA_CHROME_DEBUGGING ?? 'http://127.0.0.1:9229';
const evidenceDir = process.env.QA_EVIDENCE_DIR;
if (web !== 'http://127.0.0.1:9091' || debugging !== 'http://127.0.0.1:9229' || !password ||
    process.env.QA_BROWSER_CONSENT !== `S5_ISOLATED_FULFILLMENT_${candidateFixture?.runId ?? ''}`)
  throw new Error('QA fulfillment browser inputs missing');
const fixture = validateFulfillmentUiManifest(candidateFixture.runId, candidateFixture, password);

const roles = ['customer', 'seller', 'admin'];
const viewports = [
  { width: 1920, height: 1080, name: '1920' },
  { width: 1440, height: 900, name: '1440' },
  { width: 430, height: 844, name: '430' },
];

let page;
let socket;
let commandChannel;
let sellerFaultIdentifier;

function send(method, params = {}) {
  if (!commandChannel) return Promise.reject(new Error('Chrome socket unavailable'));
  return commandChannel.send(method, params);
}

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}

async function waitFor(expression, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await evaluate(`Boolean(${expression})`)) return; }
    catch (error) { if (!String(error).includes('context')) throw error; }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out: ${label}`);
}

async function navigate(route) {
  await send('Page.navigate', { url: `${web}${route}` });
  await waitFor(`location.pathname === ${JSON.stringify(route)}`, `navigation ${route}`);
}

function setInput(selector, value) {
  return evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype :
      input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

async function clickText(text) {
  assert.equal(await evaluate(`(() => {
    const target = [...document.querySelectorAll('button,a')].find((node) =>
      node.textContent?.includes(${JSON.stringify(text)}) && !node.disabled);
    if (!target) return false; target.click(); return true;
  })()`), true, `missing action: ${text}`);
}

async function clearSession() {
  await send('Storage.clearDataForOrigin', { origin: new URL(web).origin, storageTypes: 'cookies,local_storage' });
}

async function clearSellerListFault() {
  if (!sellerFaultIdentifier) return;
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: sellerFaultIdentifier });
  sellerFaultIdentifier = undefined;
}

async function installSellerListFault(mode) {
  assert.ok(['delay', 'error'].includes(mode));
  await clearSellerListFault();
  const result = await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const url = String(args[0] instanceof Request ? args[0].url : args[0]);
      if (!globalThis.__qaSellerListFaultUsed && url.includes('/fulfillment/seller/shipments?')) {
        globalThis.__qaSellerListFaultUsed = true;
        if (${JSON.stringify(mode)} === 'delay') await new Promise((resolve) => setTimeout(resolve, 800));
        if (${JSON.stringify(mode)} === 'error') return new Response('{}', {
          status: 503, headers: { 'content-type': 'application/json' },
        });
      }
      return originalFetch(...args);
    };
  })();` });
  sellerFaultIdentifier = result.identifier;
}

async function assertSellerCannotAccess(shipmentId) {
  const status = await evaluate(`fetch(${JSON.stringify(`http://127.0.0.1:9092/fulfillment/seller/shipments/`)} +
    encodeURIComponent(${JSON.stringify(shipmentId)}), { credentials: 'include', cache: 'no-store' })
    .then((response) => response.status)`);
  assert.equal(status, 404, `seller unexpectedly accessed shipment ${shipmentId}`);
}

async function login(role, email) {
  assert.ok(roles.includes(role));
  await clearSession();
  await navigate('/login');
  await waitFor("document.querySelector('#login-role') && document.querySelector('#login-email')", 'login form');
  assert.equal(await setInput('#login-role', role), true);
  assert.equal(await setInput('#login-email', email), true);
  assert.equal(await setInput('#login-password', password), true);
  await evaluate("document.querySelector('form').requestSubmit(); true");
  await waitFor("location.pathname === '/account'", `${role} login`);
}

async function keyboardAndViewportEvidence(label) {
  for (const viewport of viewports) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width === 430,
    });
    const dimensions = await evaluate(`({ width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      heading: document.querySelector('h1')?.textContent ?? '' })`);
    assert.equal(dimensions.width, viewport.width);
    assert.ok(dimensions.scrollWidth <= viewport.width,
      `${label} ${viewport.name}px horizontal overflow: ${dimensions.scrollWidth}`);
    const visibleFocusables = await evaluate(`(() => {
      const selector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
      const nodes = [...document.querySelectorAll(selector)].filter((node) => {
        const style = getComputedStyle(node); const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });
      nodes.forEach((node, index) => node.dataset.qaFocusIndex = String(index));
      document.body.tabIndex = -1; document.body.focus();
      return nodes.length;
    })()`);
    assert.ok(visibleFocusables > 0, `${label} has no visible keyboard targets`);
    const visited = await visitKeyboardTargets(visibleFocusables, async () => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      return evaluate("document.activeElement?.dataset?.qaFocusIndex ?? null");
    });
    assert.equal(visited.size, visibleFocusables,
      `${label} ${viewport.name}px keyboard traversal ${visited.size}/${visibleFocusables}`);
    if (evidenceDir) {
      await mkdir(evidenceDir, { recursive: true });
      const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(path.join(evidenceDir, `${label}-${viewport.name}.png`), Buffer.from(image.data, 'base64'));
    }
  }
}

async function customerOrder(orderId, expectedText) {
  await navigate('/account/customer');
  await waitFor("document.querySelector('#pending-order-id')", 'customer order form');
  assert.equal(await setInput('#pending-order-id', orderId), true);
  await clickText('본인 주문 확인');
  await waitFor(`document.body.innerText.includes(${JSON.stringify(expectedText)})`, `customer sees ${expectedText}`);
}

try {
  ({ page, socket } = await openCdpPage({ debugging }));
  commandChannel = createCdpCommandChannel(socket);
  await send('Page.enable'); await send('Runtime.enable');

  await login('customer', fixture.emails[0]);
  await customerOrder(fixture.orderIds[0], fulfillmentUiExpectedShipDate);
  await waitFor("document.body.innerText.includes('READY')", 'customer sees ready fulfillment');
  await keyboardAndViewportEvidence('customer-ready');

  await login('seller', fixture.emails[1]);
  await navigate('/account/seller/orders');
  await waitFor("document.body.innerText.includes('판매자 주문 출고') && document.body.innerText.includes('READY')",
    'seller fulfillment list');
  await assertSellerCannotAccess(fixture.shipmentIds[1]);
  await assertSellerCannotAccess(fixture.shipmentIds[2]);
  await evaluate(`document.querySelector('.fulfillment-list-button')?.click(); true`);
  await waitFor("document.body.innerText.includes('받는 분 가상고객')", 'seller detail');
  await clickText('포장 시작');
  await waitFor("document.body.innerText.includes('PACKING') && document.querySelector('#seller-tracking')",
    'seller packing');
  assert.equal(await setInput('#seller-tracking', `QA${fixture.runId.toUpperCase()}SELLER`), true);
  await clickText('출고 처리');
  await waitFor("document.body.innerText.includes('SHIPPED') && document.body.innerText.includes('최신 정보를 반영')",
    'seller shipped');
  await keyboardAndViewportEvidence('seller-shipped');

  await login('seller', fixture.emails[2]);
  await installSellerListFault('delay');
  await navigate('/account/seller/orders');
  await waitFor("globalThis.__qaSellerListFaultUsed === true && document.body.innerText.includes('판매자 권한 확인 중')",
    'seller-b active list loading state');
  await waitFor("document.body.innerText.includes('DELAYED') && document.body.innerText.includes('2026-10-10')",
    'seller-b delayed fulfillment after loading');
  await clearSellerListFault();
  await installSellerListFault('error');
  await navigate('/account/seller/orders');
  await waitFor("globalThis.__qaSellerListFaultUsed === true && document.body.innerText.includes('출고 목록을 불러오지 못했습니다')",
    'seller-b active error state');
  await clearSellerListFault();
  await navigate('/account');
  await navigate('/account/seller/orders');
  await waitFor("document.body.innerText.includes('DELAYED') && document.body.innerText.includes('2026-10-10') && document.body.innerText.includes('휴무일 미반영')",
    'seller-b delayed cutoff result');
  assert.equal(await setInput('#seller-status-filter', 'SHIPPED'), true);
  await clickText('조회');
  await waitFor("document.body.innerText.includes('처리할 발송 주문이 없습니다')", 'seller empty state');

  await login('seller', fixture.emails[3]);
  await navigate('/account/seller/orders');
  await waitFor(`document.body.innerText.includes('SHIPPED') && document.body.innerText.includes(${JSON.stringify(fulfillmentUiExpectedShipDate)})`,
    'owool fulfillment seller list');
  await assertSellerCannotAccess(fixture.shipmentIds[0]);
  await evaluate(`document.querySelector('.fulfillment-list-button')?.click(); true`);
  await waitFor(`document.body.innerText.includes(${JSON.stringify(`QA${fixture.runId.toUpperCase()}`)})`,
    'owool seller sees assigned shipment');

  await login('admin', fixture.emails[4]);
  await navigate('/account/admin/fulfillment');
  await waitFor("document.body.innerText.includes('출고 운영 관리') && document.querySelectorAll('.fulfillment-list-button').length === 3",
    'admin fulfillment list');
  const delayedSelected = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.fulfillment-list-button')]
      .find((node) => node.textContent.includes('DELAYED'));
    if (!button) return false; button.click(); return true;
  })()`);
  assert.equal(delayedSelected, true);
  await waitFor("document.querySelector('#correction-reason')", 'admin correction form');
  assert.equal(await setInput('#corrected-status', 'READY'), true);
  assert.equal(await setInput('#correction-reason', '가상 시험 출고 상태 정정'), true);
  assert.equal(await setInput('#admin-customer-message', '가상 시험 주문의 출고 상태를 정정했습니다'), true);
  await clickText('정정 저장');
  await waitFor("document.body.innerText.includes('최신 정보를 반영') && document.body.innerText.includes('ADMIN_CORRECT')",
    'admin correction');
  await keyboardAndViewportEvidence('admin-corrected');

  await login('customer', fixture.emails[0]);
  await customerOrder(fixture.orderIds[0], 'SHIPPED');
  await waitFor(`document.body.innerText.includes(${JSON.stringify(`QA${fixture.runId.toUpperCase()}SELLER`)})`,
    'customer sees tracking');
  await customerOrder(fixture.orderIds[1], 'READY');
  await waitFor("document.body.innerText.includes('가상 시험 주문의 출고 상태를 정정했습니다')",
    'customer sees admin notice');
  console.info('browser: customer, seller and admin fulfillment paths PASS');
  console.info('browser: 1920, 1440, 430 and keyboard checks PASS');
} finally {
  await clearSellerListFault().catch(() => undefined);
  const cleanupErrors = await closeCdpPage({ debugging, page, socket });
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Chrome cleanup failed');
}
