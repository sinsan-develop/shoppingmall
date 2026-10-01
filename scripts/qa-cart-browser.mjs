// Run against a temporary Chrome remote-debugging instance and QA-only fixture.
// Required: QA_WEB_BASE, QA_PRODUCT_ID, QA_EMAIL, QA_PASSWORD.
import assert from 'node:assert/strict';

const web = process.env.QA_WEB_BASE;
const productId = process.env.QA_PRODUCT_ID;
const email = process.env.QA_EMAIL;
const password = process.env.QA_PASSWORD;
const debugging = process.env.QA_CHROME_DEBUGGING ?? 'http://127.0.0.1:9229';
if (![web, productId, email, password].every(Boolean)) throw new Error('QA browser inputs missing');

const page = await fetch(`${debugging}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json());
const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});
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
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}
async function waitFor(expression, label, timeoutMs = 12000) {
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
  throw new Error(`Timed out: ${label}`);
}
async function navigate(path) {
  await send('Page.navigate', { url: `${web}${path}` });
  await waitFor(`location.pathname === ${JSON.stringify(path)}`, `navigation ${path}`);
}
function setInput(selector, value) {
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
  await waitFor("document.querySelector('#login-email') && document.querySelector('#login-password')", 'login form');
  assert.equal(await setInput('#login-email', email), true);
  assert.equal(await setInput('#login-password', password), true);
  await evaluate("document.querySelector('form').requestSubmit(); true");
  try {
    await waitFor("location.pathname === '/account'", 'customer login');
  } catch (error) {
    console.error('login diagnostics', await evaluate(`({ path: location.pathname,
      message: document.querySelector('[role=alert]')?.textContent,
      email: document.querySelector('#login-email')?.value,
      passwordEntered: !!document.querySelector('#login-password')?.value })`));
    throw error;
  }
  console.info('browser: QA customer login PASS');

  await navigate(`/products/${encodeURIComponent(productId)}`);
  await waitFor("document.querySelector('input[id^=cart-qty-]') && document.body.innerText.includes('장바구니에 담기')", 'product detail');
  const optionSelector = 'input[id^=cart-qty-]';
  assert.equal(await setInput(optionSelector, '2'), true);
  await waitFor("document.querySelector('input[id^=cart-qty-]').value === '2'", 'quantity input');
  await evaluate("[...document.querySelectorAll('button')].find((button) => button.textContent.includes('장바구니에 담기')).click(); true");
  await waitFor("location.pathname === '/cart'", 'cart navigation');
  await waitFor("document.body.innerText.includes('46,000원') && document.body.innerText.includes('49,000원')", 'two-item quote');
  console.info('browser: add quantity 2, redirect and 49,000-won quote PASS');

  assert.equal(await setInput('input[id^=cart-edit-]', '3'), true);
  await evaluate("[...document.querySelectorAll('button')].find((button) => button.textContent.includes('수량 변경')).click(); true");
  await waitFor("document.body.innerText.includes('69,000원') && document.body.innerText.includes('총 69,000원')", 'quantity update');
  console.info('browser: quantity update and free-shipping quote PASS');

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const mobile = await evaluate('({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth })');
  assert.equal(mobile.width, 390);
  assert.ok(mobile.scrollWidth <= 390, `mobile horizontal overflow: ${mobile.scrollWidth}`);
  await evaluate("document.querySelector('input[id^=cart-edit-]').focus(); true");
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate("document.activeElement?.textContent?.includes('수량 변경')"), true);
  console.info('browser: 390px width and keyboard focus PASS');

  await evaluate("[...document.querySelectorAll('button')].find((button) => button.textContent.includes('제거')).click(); true");
  await waitFor("document.body.innerText.includes('장바구니가 비어 있습니다')", 'cart remove');
  console.info('browser: remove and empty cart PASS');
} finally {
  socket.close();
  await fetch(`${debugging}/json/close/${page.id}`).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 100));
}
