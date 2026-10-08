import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const evidenceDir = process.env.S6_BROWSER_EVIDENCE_DIR;
const profileDir = process.env.S6_BROWSER_PROFILE_DIR;
const chromePath = process.env.S6_BROWSER_CHROME_PATH;
assert.ok(evidenceDir && profileDir && chromePath, 'browser QA paths required');
assert.equal(resolve(profileDir), 'D:\\tmp\\shoppingmall-s6-browser-1009e-profile');
assert.equal(resolve(evidenceDir), 'D:\\tmp\\shoppingmall-s6-browser-1009e-evidence');

const kinds = { sale: 0, goods_discount: 0, shipping_fee: 0, shipping_support: 0,
  goods_refund: 0, shipping_refund: 0, commission: 0, correction: 0 };
const farmA = { sellerId: '11111111-1111-4111-8111-111111111111', sellerName: '농가 A',
  sellerCategoryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sellerCategoryName: '농가',
  totals: { ...kinds, goods_refund: 12000 }, items: [{
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', kind: 'goods_refund', amountWon: 12000,
    occurredAt: '2026-07-01T00:00:00Z', checkoutOrderId: 'may-original-order',
    shipmentOrderId: 'may-original-shipment', productName: '고추', optionName: '500g',
  }] };
const farmB = { sellerId: '22222222-2222-4222-8222-222222222222', sellerName: '농가 B',
  sellerCategoryId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', sellerCategoryName: '다른 분류',
  totals: { ...kinds, sale: 23000 }, items: [{
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', kind: 'sale', amountWon: 23000,
    occurredAt: '2026-07-02T00:00:00Z', checkoutOrderId: 'july-original-order',
    shipmentOrderId: 'july-original-shipment', productName: '블루베리', optionName: '1kg',
  }] };
const report = { filter: { from: '2026-07-01', to: '2026-07-31',
  categoryId: null, sellerId: null }, totals: { ...kinds, goods_refund: 12000, sale: 23000 },
 groups: [farmA, farmB], completions: [{
  id: '33333333-3333-4333-8333-333333333333', sellerId: farmA.sellerId,
  sellerName: farmA.sellerName, startDate: '2026-07-01', endDate: '2026-07-31',
  completedAt: '2026-08-01T00:00:00Z', reason: '오프라인 정산 확인',
 }] };
let actorRole = 'admin';
const api = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:9091');
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
  const url = new URL(request.url, 'http://127.0.0.1:9092');
  let body;
  if (url.pathname === '/auth/me') body = { role: actorRole };
  else if (url.pathname === '/catalog/seller-categories') body = { items: [
    { id: farmA.sellerCategoryId, name: '농가' },
    { id: farmB.sellerCategoryId, name: '다른 분류' }] };
  else if (url.pathname === '/catalog/sellers') body = { items: [
    { id: farmA.sellerId, displayName: farmA.sellerName },
    { id: farmB.sellerId, displayName: farmB.sellerName }] };
  else if (url.pathname === '/admin/settlement') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (from !== '2026-07-01' || to !== '2026-07-31') {
      body = { ...report, filter: { ...report.filter, from, to },
        groups: [], totals: kinds };
    } else {
    const sellerId = url.searchParams.get('sellerId');
    const categoryId = url.searchParams.get('categoryId');
    const groups = report.groups.filter((group) =>
      (!sellerId || group.sellerId === sellerId) &&
      (!categoryId || group.sellerCategoryId === categoryId));
    body = { ...report, filter: { ...report.filter, sellerId, categoryId }, groups,
      totals: groups.length === 2 ? report.totals : groups[0]?.totals ?? kinds };
    }
  } else if (url.pathname === '/seller/settlement' && actorRole === 'seller') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    body = { ...report, filter: { ...report.filter, from, to, sellerId: farmA.sellerId },
      groups: from === '2026-07-01' && to === '2026-07-31' ? [farmA] : [],
      totals: from === '2026-07-01' && to === '2026-07-31' ? farmA.totals : kinds };
  } else { response.writeHead(404); response.end('{}'); return; }
  response.writeHead(200);
  response.end(JSON.stringify(body));
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* server starting */ }
    await delay(200);
  }
  throw new Error(`Server did not start: ${url}`);
}

let web;
let chrome;
let socket;
try {
  await mkdir(evidenceDir, { recursive: true });
  await mkdir(profileDir, { recursive: true });
  await new Promise((resolveListen) => api.listen(9092, '127.0.0.1', resolveListen));
  web = spawn(process.execPath, [join(webRoot, 'node_modules/next/dist/bin/next'),
    'start', '--hostname', '127.0.0.1', '--port', '9091'],
  { cwd: webRoot, windowsHide: true, stdio: 'ignore' });
  await waitFor('http://127.0.0.1:9091/account/admin/settlement');
  chrome = spawn(chromePath, ['--headless=new', '--no-first-run',
    '--no-default-browser-check', '--disable-background-networking',
    '--remote-debugging-port=9223', `--user-data-dir=${profileDir}`, 'about:blank'],
  { windowsHide: true, stdio: 'ignore' });
  await waitFor('http://127.0.0.1:9223/json/version');
  const target = await fetch('http://127.0.0.1:9223/json/new?about:blank',
    { method: 'PUT' }).then((response) => response.json());
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen) => socket.addEventListener('open', resolveOpen, { once: true }));
  let serial = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  const command = (method, params = {}) => new Promise((resolveCommand, rejectCommand) => {
    const id = ++serial;
    pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
    socket.send(JSON.stringify({ id, method, params }));
  });
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression,
      awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ??
      JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function wait(expression) {
    for (let i = 0; i < 120; i++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await delay(200);
    }
    throw new Error(`Browser condition timed out: ${expression}`);
  }
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900,
    deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: 'http://127.0.0.1:9091/account/admin/settlement' });
  await wait("document.querySelector('.settlement-print')");
  await evaluate(`(()=>{const f=document.querySelector('.settlement-filter');
    f.querySelector('input[name=from]').value='2026-07-01';
    f.querySelector('input[name=to]').value='2026-07-31';f.requestSubmit()})()`);
  await wait("document.querySelectorAll('.settlement-group').length===2");
  assert.equal(await evaluate(`document.querySelector('.settlement-history')?.innerText.includes('오프라인 정산 확인')`), true);
  assert.equal(await evaluate(`document.querySelector('.settlement-print').innerText.includes('may-original-order')`), true);
  assert.equal(await evaluate(`document.querySelector('.settlement-print').innerText.includes('23,000원')`), true);
  await evaluate(`(()=>{const f=document.querySelector('.settlement-filter');
    f.querySelector('select[name=sellerId]').value='${farmB.sellerId}';f.requestSubmit()})()`);
  await wait("document.querySelectorAll('.settlement-group').length===1 && document.querySelector('.settlement-group')?.innerText.includes('농가 B')");
  assert.equal(await evaluate(`document.querySelector('.settlement-group').innerText.includes('농가 A')`), false);
  await evaluate(`(()=>{const f=document.querySelector('.settlement-filter');
    f.querySelector('select[name=sellerId]').value='';f.requestSubmit()})()`);
  await wait("document.querySelectorAll('.settlement-group').length===2");
  await evaluate(`(()=>{const f=document.querySelector('.settlement-filter');
    f.querySelector('select[name=categoryId]').value='${farmA.sellerCategoryId}';f.requestSubmit()})()`);
  await wait("document.querySelectorAll('.settlement-group').length===1 && document.querySelector('.settlement-group')?.innerText.includes('농가 A')");
  assert.equal(await evaluate(`document.querySelector('.settlement-group').innerText.includes('농가 B')`), false);
  await evaluate(`(()=>{const f=document.querySelector('.settlement-filter');
    f.querySelector('select[name=categoryId]').value='';f.requestSubmit()})()`);
  await wait("document.querySelectorAll('.settlement-group').length===2");
  const desktop = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(evidenceDir, 'settlement-desktop.png'), Buffer.from(desktop.data, 'base64'));
  await command('Page.bringToFront');
  await evaluate(`document.querySelector('input[name=from]').focus()`);
  for (let i = 0; i < 6 && await evaluate(`document.activeElement?.name`) !== 'to'; i++) {
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  }
  assert.equal(await evaluate(`document.activeElement?.name`), 'to');
  await command('Emulation.setDeviceMetricsOverride', { width: 430, height: 844,
    deviceScaleFactor: 1, mobile: true });
  await wait('window.innerWidth===430');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'), true);
  const mobile = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(evidenceDir, 'settlement-mobile.png'), Buffer.from(mobile.data, 'base64'));
  await command('Emulation.setEmulatedMedia', { media: 'print' });
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.settlement-controls')).display`), 'none');
  const printed = await command('Page.printToPDF', { printBackground: true,
    paperWidth: 8.27, paperHeight: 11.69, marginTop: 0.3, marginBottom: 0.3,
    marginLeft: 0.3, marginRight: 0.3 });
  await writeFile(join(evidenceDir, 'settlement-print.pdf'), Buffer.from(printed.data, 'base64'));
  const pdfInfo = execFileSync(process.env.S6_BROWSER_PDFINFO_PATH ?? 'pdfinfo',
    [join(evidenceDir, 'settlement-print.pdf')], { encoding: 'utf8' });
  assert.match(pdfInfo, /^Pages:\s+1\r?$/m, 'compact seller report must not split overall totals');
  actorRole = 'seller';
  await command('Emulation.setEmulatedMedia', { media: 'screen' });
  await command('Page.navigate', { url: 'http://127.0.0.1:9091/account/seller/settlement' });
  await wait("document.querySelector('.settlement-print')");
  await evaluate(`(()=>{const f=document.querySelector('.settlement-filter');
    f.querySelector('input[name=from]').value='2026-07-01';
    f.querySelector('input[name=to]').value='2026-07-31';f.requestSubmit()})()`);
  await wait("document.querySelector('.settlement-print')?.innerText.includes('농가 A')");
  assert.equal(await evaluate(`document.querySelector('.settlement-print').innerText.includes('농가 B')`), false);
  assert.equal(await evaluate(`document.querySelector('.settlement-completion')===null`), true);
  assert.equal(await evaluate(`document.querySelector('select[name=sellerId]')===null`), true);
  const sellerMobile = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(evidenceDir, 'settlement-seller-mobile.png'),
    Buffer.from(sellerMobile.data, 'base64'));
  console.info('S6 browser QA: admin desktop/mobile/keyboard/print PDF and seller mobile PASS; API responses synthetic');
} finally {
  socket?.close();
  chrome?.kill();
  web?.kill();
  await new Promise((resolveClose) => api.close(resolveClose));
}
