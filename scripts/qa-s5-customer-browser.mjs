// WSL-built Web/API smoke through a real Chrome tab. Uses one disposable QA customer only.
import assert from 'node:assert/strict';

const web = process.env.QA_WEB_BASE;
const email = process.env.QA_EMAIL;
const password = process.env.QA_PASSWORD;
const productId = process.env.QA_PRODUCT_ID;
const debugging = process.env.QA_CHROME_DEBUGGING ?? 'http://127.0.0.1:9229';
if (!web || !/^qa\+[0-9a-f]{8}-customer@example\.invalid$/.test(email ?? '') || !password || !productId) {
  throw new Error('QA browser inputs missing or customer is not synthetic');
}

const page = await fetch(`${debugging}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json());
const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await evaluate(expression);
      if (value) return value;
    } catch (error) {
      if (!String(error).includes('context')) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const diagnostic = await evaluate("({ path: location.pathname, message: document.querySelector('[role=alert]')?.textContent ?? '', title: document.title })").catch(() => ({}));
  throw new Error(`Timed out: ${label}; page=${JSON.stringify(diagnostic)}`);
}
async function navigate(path) {
  await send('Page.navigate', { url: `${web}${path}` });
  await waitFor(`location.pathname === ${JSON.stringify(path)}`, `navigate ${path}`);
}
async function setInput(selector, value) {
  return evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await navigate('/login');
  await waitFor("document.querySelector('#login-email') && Object.keys(document.querySelector('form') ?? {}).some((key) => key.startsWith('__reactProps$'))", 'hydrated login');
  assert.equal(await setInput('#login-email', email), true);
  assert.equal(await setInput('#login-password', password), true);
  await evaluate("document.querySelector('form').requestSubmit(); true");
  await waitFor("location.pathname === '/account'", 'customer login');

  await navigate('/account/customer');
  await waitFor("document.querySelector('#consent-title') && document.querySelectorAll('#consent-title + p + form input[type=checkbox]').length === 3", 'customer preferences');
  const initial = await evaluate("[...document.querySelectorAll('#consent-title + p + form input[type=checkbox]')].map((input) => input.checked)");
  assert.deepEqual(initial.slice(1), [false, false]);
  if (!initial[0]) await evaluate("document.querySelector('#consent-title + p + form input[type=checkbox]').click(); true");
  await waitFor("document.querySelector('#consent-title + p + form input[type=checkbox]').checked", 'email opt in');
  await evaluate("document.querySelector('#consent-title + p + form').requestSubmit(); true");
  await waitFor("document.querySelector('.profile-message')?.textContent.includes('수신 설정을 저장했습니다')", 'preferences saved');
  await navigate('/account/customer');
  await waitFor("document.querySelector('#consent-title + p + form input[type=checkbox]')?.checked", 'persisted opt in');
  console.info('browser: login + customer email opt-in persisted PASS');

  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 900, deviceScaleFactor: 1, mobile: true });
  const mobile = await evaluate("({ width: innerWidth, scroll: document.documentElement.scrollWidth, title: document.querySelector('h1')?.textContent })");
  assert.equal(mobile.width, 430);
  assert.ok(mobile.scroll <= 431, `customer mobile horizontal overflow: ${mobile.scroll}`);
  assert.ok(mobile.title);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.ok(await evaluate("Boolean(document.activeElement && document.activeElement !== document.body)"), 'keyboard focus');
  console.info('browser: 430px customer page + keyboard focus PASS');

  await send('Emulation.clearDeviceMetricsOverride');
  await navigate(`/products/${encodeURIComponent(productId)}`);
  await waitFor("Boolean(document.querySelector('[aria-label=\"찜과 재입고 신청\"] button'))", 'product engagement');
  await evaluate("(() => { const button = [...document.querySelectorAll('[aria-label=\"찜과 재입고 신청\"] button')].find((item) => item.textContent.includes('상품 찜하기')); if (button) button.click(); return true; })()");
  await waitFor("document.querySelector('[aria-label=\"찜과 재입고 신청\"] button')?.textContent.includes('찜 해제')", 'favorite saved');
  console.info('browser: product detail + favorite PASS');

  await waitFor("[...document.querySelectorAll('[aria-label=\"찜과 재입고 신청\"] button')].some((button) => button.textContent === '재입고 신청')", 'out of stock option');
  await evaluate("[...document.querySelectorAll('[aria-label=\"찜과 재입고 신청\"] button')].find((button) => button.textContent === '재입고 신청').click(); true");
  await waitFor("[...document.querySelectorAll('[aria-label=\"찜과 재입고 신청\"] button')].some((button) => button.textContent === '재입고 신청 취소')", 'restock subscribed');
  await navigate('/account/customer');
  await waitFor("document.body.innerText.includes('재입고 신청')", 'account restock listing');
  await navigate(`/products/${encodeURIComponent(productId)}`);
  await waitFor("[...document.querySelectorAll('[aria-label=\"찜과 재입고 신청\"] button')].some((button) => button.textContent === '재입고 신청 취소')", 'restock persisted');
  await evaluate("[...document.querySelectorAll('[aria-label=\"찜과 재입고 신청\"] button')].find((button) => button.textContent === '재입고 신청 취소').click(); true");
  await waitFor("[...document.querySelectorAll('[aria-label=\"찜과 재입고 신청\"] button')].some((button) => button.textContent === '재입고 신청')", 'restock cancelled');
  console.info('browser: out-of-stock restock subscribe + account + cancel PASS');
} finally {
  socket.close();
  await fetch(`${debugging}/json/close/${page.id}`).catch(() => undefined);
}
