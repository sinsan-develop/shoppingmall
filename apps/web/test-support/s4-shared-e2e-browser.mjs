import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const fixture = JSON.parse(process.env.QA_FIXTURE_JSON ?? '{}');
const password = process.env.QA_FIXTURE_PASSWORD;
const evidenceDir = process.env.QA_EVIDENCE_DIR;
assert.match(fixture.runId ?? '', /^[0-9a-f]{8}$/);
assert.ok(fixture.emails?.every((email) => email.startsWith(`qa+${fixture.runId}-refund-`) && email.endsWith('@example.invalid')));
assert.ok(password?.length >= 12 && evidenceDir);
const web = 'http://127.0.0.1:9091';
const api = 'http://127.0.0.1:9092';
await mkdir(evidenceDir, { recursive: true });

const target = await fetch('http://127.0.0.1:9223/json/new?about:blank', { method: 'PUT' }).then((r) => r.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let serial = 0;
const pending = new Map();
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (!message.id) return;
  const waiter = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) waiter.reject(message.error);
  else waiter.resolve(message.result);
});
const command = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++serial;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function wait(expression, label = expression) {
  for (let attempt = 0; attempt < 240; attempt++) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await delay(250);
  }
  throw Error(`Timed out: ${label}; text=${(await evaluate('document.body?.innerText?.slice(0,600)')) ?? ''}`);
}
async function navigate(path) {
  await command('Page.navigate', { url: web + path });
  await wait(`location.pathname===${JSON.stringify(path)} && document.readyState==='complete'`, `navigate ${path}`);
}
async function clickText(selector, text) {
  await wait(`[...document.querySelectorAll(${JSON.stringify(selector)})].some((e)=>e.textContent.includes(${JSON.stringify(text)})&&!e.disabled)`, text);
  await evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].find((e)=>e.textContent.includes(${JSON.stringify(text)})&&!e.disabled).click()`);
}
async function login(role, email) {
  await navigate('/login');
  await wait("document.querySelector('#login-email')", 'login form');
  await evaluate(`(()=>{const role=document.querySelector('#login-role');role.value=${JSON.stringify(role)};role.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#login-email').value=${JSON.stringify(email)};document.querySelector('#login-password').value=${JSON.stringify(password)};document.querySelector('form').requestSubmit()})()`);
  await wait("location.pathname==='/account'", `${role} login`);
}
async function screenshot(name) {
  const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(evidenceDir, `${name}.png`), Buffer.from(result.data, 'base64'));
}
async function selectPaidOrder() {
  await navigate('/cart');
  await clickText('.refund-case-button', fixture.orderId);
  await wait("document.querySelector('.refund-customer form')", 'refund form');
}
async function requestRefund(quantity, reason) {
  await selectPaidOrder();
  await evaluate(`(()=>{const f=document.querySelector('.refund-customer form');f.querySelector('input[type=number]').value=${JSON.stringify(String(quantity))};f.querySelector('textarea').value=${JSON.stringify(reason)};f.requestSubmit()})()`);
  await wait(`document.querySelector('.refund-customer .refund-case-list')?.textContent.includes(${JSON.stringify(reason)})`, `refund request ${quantity}`);
  await screenshot(`refund-request-${quantity}`);
}
async function approveRefund(expectedWon) {
  await login('admin', fixture.emails[2]);
  await navigate('/account/admin/refunds');
  await clickText('.refund-case-button', fixture.shipmentId);
  await wait("document.querySelector('.refund-approve-form')", 'refund decision');
  const detail = await evaluate("document.querySelector('.refund-detail-panel').innerText");
  assert.ok(detail.includes(expectedWon), `expected ${expectedWon} in detail`);
  await evaluate(`(()=>{const f=document.querySelector('.refund-approve-form');f.querySelector('[name=preShipmentConfirmed]').checked=true;f.querySelector('[name=approvalReason]').value='QA 출고 전 상태 확인';f.requestSubmit()})()`);
  await wait("document.querySelector('.refund-message')?.textContent.includes('모의 환불 결과를 반영')", 'refund approved');
  await screenshot(`refund-approved-${expectedWon}`);
  const summary = await evaluate("document.querySelector('.refund-detail-panel').innerText");
  assert.ok(summary.includes('환불 완료'));
}

try {
  await command('Page.enable');
  await command('Runtime.enable');
  await login('customer', fixture.emails[0]);
  await requestRefund(1, 'QA 부분 1개 취소');
  await approveRefund('3,333원');
  await login('customer', fixture.emails[0]);
  await requestRefund(2, 'QA 잔여 2개 전량 취소');
  await approveRefund('8,667원');
  await login('customer', fixture.emails[0]);
  const put = await evaluate(`fetch(${JSON.stringify(`${api}/customer/cart/items/${fixture.optionId}`)}, {method:'PUT',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({quantity:1})}).then(async r=>({status:r.status,body:await r.text()}))`);
  assert.equal(put.status, 200, `cart item: ${put.body}`);
  await navigate('/cart');
  await clickText('button', '결제 준비 · 15분 재고 예약');
  await wait("document.querySelector('#checkout-address')?.value && [...document.querySelectorAll('button')].some(b=>b.textContent.includes('결제대기 주문 생성')&&!b.disabled)", 'reservation/address');
  await clickText('button', '결제대기 주문 생성');
  await wait("document.querySelector('#mock-payment-outcome')", 'mock payment');
  await screenshot('payment-pending');
  async function chooseOutcome(value) {
    await evaluate(`(()=>{const s=document.querySelector('#mock-payment-outcome');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes(${JSON.stringify(value === 'decline' ? '모의 결제 거절' : value === 'delay' ? '모의 결제 지연' : '모의 결제 승인')})&&!b.disabled)`, `choose ${value}`);
  }
  await chooseOutcome('decline');
  await clickText('button', '모의 결제 거절');
  await wait("document.body.innerText.includes('모의 결제가 거절됐습니다')", 'payment declined');
  assert.ok((await evaluate("document.body.innerText")).includes('결제대기'));
  await screenshot('payment-declined');
  await chooseOutcome('delay');
  await clickText('button', '모의 결제 지연');
  await wait("document.body.innerText.includes('모의 결제 확인이 지연 중입니다')", 'payment delayed');
  await chooseOutcome('approve');
  await evaluate(`(()=>{const original=window.fetch.bind(window);window.__qaResponseLost=false;window.fetch=async (...args)=>{const r=await original(...args);if(!window.__qaResponseLost&&String(args[0]).endsWith('/payment-attempts')&&args[1]?.method==='POST'&&JSON.parse(args[1].body).testOutcome==='approve'){window.__qaResponseLost=true;throw Error('QA approval response lost');}return r;};})()`);
  await clickText('button', '모의 결제 승인');
  await wait("window.__qaResponseLost && document.body.innerText.includes('QA approval response lost')", 'approved response lost');
  await clickText('button', '모의 결제 승인');
  await wait("document.body.innerText.includes('모의 결제 승인과 주문 확정을 확인했습니다')", 'idempotent approved retry');
  await screenshot('payment-approved-retry');
  const mobile = await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  void mobile;
  await navigate('/cart');
  await wait("document.querySelector('.cart-main') && !document.body.innerText.includes('장바구니를 불러오고 있습니다')", 'mobile cart loaded');
  const width = await evaluate('({viewport:innerWidth,document:document.documentElement.scrollWidth})');
  assert.ok(width.document <= width.viewport + 1, `mobile overflow ${JSON.stringify(width)}`);
  await screenshot('payment-mobile-390');
  console.log(JSON.stringify({ runId: fixture.runId, refund: ['3333 partial', '8667 remainder and shipping'], payment: ['decline', 'delay', 'approve response loss and retry'], mobile: width, result: 'PASS' }));
} finally {
  socket.close();
}
