// Real browser smoke for the five synthetic catalog products. No payment or order is created.
import assert from 'node:assert/strict';

const web = process.env.QA_WEB_BASE;
const products = JSON.parse(process.env.QA_PRODUCTS_JSON ?? '[]');
const email = process.env.QA_EMAIL;
const password = process.env.QA_PASSWORD;
const debugging = process.env.QA_CHROME_DEBUGGING ?? 'http://127.0.0.1:9229';
if (!web || products.length !== 5 || !email || !password) throw new Error('QA browser inputs missing');
const qaRunId = /^qa\+([0-9a-f]{8})-customer@example\.invalid$/.exec(email)?.[1];
if (!qaRunId) throw new Error('QA customer email required');

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
  await waitFor("document.querySelector('#login-email') && document.querySelector('#login-password')", 'login form');
  await waitFor("Object.keys(document.querySelector('form') ?? {}).some((key) => key.startsWith('__reactProps$'))",
    'login hydration');
  assert.equal(await setInput('#login-email', email), true);
  assert.equal(await setInput('#login-password', password), true);
  await evaluate("document.querySelector('form').requestSubmit(); true");
  await waitFor("location.pathname === '/account'", 'customer login');
  for (const [index, productId] of products.entries()) {
    await navigate(`/products/${encodeURIComponent(productId)}`);
    await waitFor("document.querySelector('input[id^=cart-qty-]') && document.body.innerText.includes('장바구니에 담기')",
      `product detail ${index + 1}`);
    assert.equal(await setInput('input[id^=cart-qty-]', '1'), true);
    await evaluate("[...document.querySelectorAll('button')].find((button) => button.textContent.includes('장바구니에 담기')).click(); true");
    await waitFor(`location.pathname === '/cart' && document.querySelectorAll('.cart-item').length === ${index + 1}`,
      `cart item ${index + 1}`);
  }
  await waitFor("document.querySelectorAll('[aria-label=\"현재 장바구니 견적\"] li').length === 3",
    'three shipment groups');
  const quote = await evaluate(`(async () => {
    const response = await fetch('http://127.0.0.1:9092/customer/cart/quote', { credentials: 'include' });
    return { status: response.status, body: await response.json() };
  })()`);
  assert.equal(quote.status, 200);
  assert.equal(quote.body.shipments.length, 3);
  assert.deepEqual(quote.body.shipments.map(({ goodsWon, shippingWon }) => [goodsWon, shippingWon]),
    [[35000, 3000], [18000, 3000], [44000, 3000]]);
  assert.equal(quote.body.shipments.filter(({ shippingMode }) => shippingMode === 'seller_direct').length, 2);
  assert.notEqual(quote.body.shipments[0].sellerId, quote.body.shipments[2].sellerId);
  assert.equal(quote.body.shipments[1].shippingMode, 'owool_fulfillment');
  assert.deepEqual([quote.body.goodsWon, quote.body.shippingWon, quote.body.totalWon], [97000, 9000, 106000]);
  const screen = await evaluate(`({
    groups: [...document.querySelectorAll('[aria-label="현재 장바구니 견적"] li')].map((row) => row.innerText),
    total: document.querySelector('[aria-label="현재 장바구니 견적"] p')?.innerText
  })`);
  assert.equal(screen.groups.length, 3);
  for (const [index, expected] of [
    [`판매자 직접 발송 1 · qa-${qaRunId}-고추·qa-${qaRunId}-양파`,
      '상품 35,000원', '배송비 3,000원', '소계 38,000원'],
    [`어울몰 모아 발송 · qa-${qaRunId}-고춧가루`,
      '상품 18,000원', '배송비 3,000원', '소계 21,000원'],
    [`판매자 직접 발송 2 · qa-${qaRunId}-마늘·qa-${qaRunId}-블루베리`,
      '상품 44,000원', '배송비 3,000원', '소계 47,000원'],
  ].entries()) {
    for (const text of expected) assert.ok(screen.groups[index].includes(text),
      `shipment ${index + 1}: ${text}; actual=${JSON.stringify(screen.groups[index])}`);
  }
  assert.ok(screen.total.includes('106,000원'));
  console.info('browser: two direct sellers + owool grouped into three shipment quotes PASS');
  for (let count = 5; count > 0; count--) {
    await evaluate("document.querySelector('.cart-item button:last-child').click(); true");
    await waitFor(`document.querySelectorAll('.cart-item').length === ${count - 1}`, `remove item ${count}`);
  }
  await waitFor("document.body.innerText.includes('장바구니가 비어 있습니다')", 'empty cart');
  console.info('browser: five QA cart items removed PASS');
} finally {
  socket.close();
  await fetch(`${debugging}/json/close/${page.id}`).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 100));
}
