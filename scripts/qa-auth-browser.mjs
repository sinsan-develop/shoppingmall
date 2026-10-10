// Isolated, loopback-only account journey QA. Never run against the shared development DB.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createApp } from '../apps/api/src/app.ts';
import { provisionInitialAdmin } from '../apps/api/src/auth/onboarding.ts';
import { setQaAuthSink } from '../apps/api/src/auth/delivery.ts';
import { closeCdpPage, createCdpCommandChannel, openCdpPage, visitKeyboardTargets } from './qa-browser-cdp.mjs';

const { Pool } = createRequire(new URL('../apps/api/package.json', import.meta.url))('pg');

const web = 'http://127.0.0.1:9091';
const debugging = 'http://127.0.0.1:9229';
const expectedDb = 'shoppingmall_auth_admin_1010';
const expectedSystem = '7695033535935234087';
const required = {
  PGDATABASE: expectedDb,
  AUTH_ADMIN_TEST_DB_SYSTEM_ID: expectedSystem,
  APP_ENV: 'development', API_HOST: '127.0.0.1', AUTH_DELIVERY_MODE: 'mock',
  AUTH_LINK_ORIGIN: web, WEB_ORIGIN: web,
};
for (const [key, value] of Object.entries(required)) assert.equal(process.env[key], value, `${key} QA guard`);
assert.equal(new URL(process.env.DATABASE_URL ?? '').hostname, '127.0.0.1');
assert.equal(new URL(process.env.DATABASE_URL).port, '15442');
assert.equal(new URL(process.env.DATABASE_URL).pathname, `/${expectedDb}`);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const run = randomUUID();
const customerEmail = `browser-customer+${run}@example.invalid`;
const adminEmail = `browser-admin+${run}@example.invalid`;
const customerPassword = 'Browser-isolated-customer-123';
const nextPassword = 'Browser-isolated-customer-456';
const adminPassword = 'Browser-isolated-admin-123';
const messages = [];
const accounts = [];
let categoryId;
let sellerId;
let api;
let webProcess;
let chrome;
let profile;
let page;
let socket;
let channel;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function send(method, params = {}) { return channel.send(method, params); }
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}
async function waitFor(expression, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (await evaluate(`Boolean(${expression})`)) return; }
    catch (error) { if (!String(error).includes('context')) throw error; }
    await pause(120);
  }
  const state = await evaluate(`({ path: location.pathname, fragmentPresent: Boolean(location.hash),
    heading: document.querySelector('h1')?.textContent ?? '',
    status: document.querySelector('[role="status"],[role="alert"]')?.textContent ?? '',
    inputCount: document.querySelectorAll('input').length })`).catch(() => null);
  throw new Error(`Timed out: ${label}; ${JSON.stringify(state)}`);
}
async function navigate(routeOrUrl) {
  const url = routeOrUrl.startsWith('http') ? routeOrUrl : `${web}${routeOrUrl}`;
  await send('Page.navigate', { url });
  await waitFor(`location.pathname === ${JSON.stringify(new URL(url).pathname)}`, 'navigation');
}
async function hydrate(selector) {
  await waitFor(`(() => { const n=document.querySelector(${JSON.stringify(selector)});
    return n && Object.keys(n).some(k => k.startsWith('__reactProps$')); })()`, `hydration ${selector}`);
}
async function setInput(selector, value) {
  await hydrate(selector);
  assert.equal(await evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)});
    const proto=n instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(n,${JSON.stringify(value)});
    n.dispatchEvent(new Event('input',{bubbles:true})); n.dispatchEvent(new Event('change',{bubbles:true}));
    return n.value; })()`), value);
}
async function clickButton(text) {
  await waitFor(`[...document.querySelectorAll('button')].some(n => n.textContent?.includes(${JSON.stringify(text)}) && !n.disabled)`, `button ${text}`);
  assert.equal(await evaluate(`(() => { const n=[...document.querySelectorAll('button')]
    .find(n => n.textContent?.includes(${JSON.stringify(text)}) && !n.disabled);
    if (!n) return false; n.click(); return true; })()`), true);
}
async function pageEvidence(name) {
  for (const width of [1440, 430]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width, height: 900, deviceScaleFactor: 1, mobile: width === 430,
    });
    const result = await evaluate(`({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      heading: document.querySelector('h1')?.textContent ?? '' })`);
    assert.equal(result.width, width, `${name} viewport`);
    assert.ok(result.scroll <= width, `${name} ${width}px horizontal overflow: ${result.scroll}`);
    const focusCount = await evaluate(`(() => { const nodes=[...document.querySelectorAll(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')]
      .filter(n => { const s=getComputedStyle(n),r=n.getBoundingClientRect();
        return s.display!=='none' && s.visibility!=='hidden' && r.width>0 && r.height>0; });
      nodes.forEach((n,i) => n.dataset.qaFocusIndex=String(i));
      document.body.tabIndex=-1; document.body.focus(); return nodes.length; })()`);
    assert.ok(focusCount > 0, `${name} has no focus targets`);
    const visited = await visitKeyboardTargets(focusCount, async () => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      return evaluate('document.activeElement?.dataset?.qaFocusIndex ?? null');
    });
    assert.equal(visited.size, focusCount, `${name} ${width}px keyboard traversal`);
  }
  await send('Emulation.clearDeviceMetricsOverride');
}
async function login(role, email, password) {
  await navigate('/login');
  await setInput('#login-role', role);
  await setInput('#login-email', email);
  await setInput('#login-password', password);
  await clickButton('로그인');
  await waitFor("location.pathname === '/account'", `${role} login`);
}
function message(purpose) {
  const found = messages.findLast((item) => item.purpose === purpose);
  assert.ok(found, `${purpose} mock delivery`);
  return found;
}
async function waitHttp(url) {
  for (let i=0; i<100; i++) {
    try { if ((await fetch(url)).status < 500) return; } catch { /* starting */ }
    await pause(120);
  }
  throw new Error('Loopback service did not start');
}
async function assertPortFree(port) {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve) => probe.close(resolve));
}
try {
  const id = await pool.query('SELECT system_identifier::text AS id FROM pg_control_system()');
  assert.equal(id.rows[0].id, expectedSystem);
  for (const table of ['accounts','account_roles','auth_sessions','auth_action_tokens','seller_applications']) {
    const count = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
    assert.equal(count.rows[0].n, 0, `QA ${table} not empty`);
  }
  await Promise.all([9091, 9092, 9229].map(assertPortFree));
  setQaAuthSink(async (item) => { messages.push(item); });
  api = await createApp();
  await api.listen(9092, '127.0.0.1');
  webProcess = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start',
    '--hostname', '127.0.0.1', '--port', '9091'], {
    cwd: path.resolve(import.meta.dirname, '../apps/web'), env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'ignore', windowsHide: true,
  });
  await waitHttp(web + '/login');
  profile = await mkdtemp(path.join(os.tmpdir(), 'shoppingmall-auth-browser-'));
  chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9229',
    '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  await waitHttp(debugging + '/json/version');
  ({ page, socket } = await openCdpPage({ debugging }));
  channel = createCdpCommandChannel(socket);
  await send('Page.enable'); await send('Runtime.enable');

  await navigate('/login');
  await waitFor("document.querySelector('a[href=\"/signup\"]') && document.querySelector('a[href=\"/forgot-password\"]')", 'account links');
  await pageEvidence('login');
  await navigate('/signup');
  await pageEvidence('signup');
  await setInput('#signup-email', customerEmail);
  await clickButton('확인 링크 요청');
  await waitFor("document.body.innerText.includes('메일함을 확인')", 'signup request');
  await navigate(message('customer_signup').url);
  await waitFor("document.querySelector('#signup-password') && !location.hash", 'signup fragment scrub');
  await setInput('#signup-password', customerPassword);
  await setInput('#signup-repeat', customerPassword);
  await clickButton('구매자 가입');
  await waitFor("document.body.innerText.includes('가입되었습니다')", 'signup confirmation');
  assert.equal(await evaluate('location.hash'), '');
  await login('customer', customerEmail, customerPassword);
  await navigate('/account/seller/apply');
  await waitFor("document.querySelector('#seller-display-name')", 'seller application form');
  await pageEvidence('seller-apply');
  await setInput('#seller-display-name', 'QA Browser Seller');
  await clickButton('판매자 신청하기');
  await waitFor("document.body.innerText.includes('신청 상태: 심사 대기')", 'seller pending');

  const category = await pool.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id', [`qa-browser-${run}`]);
  categoryId = category.rows[0].id;
  const seller = await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
    [categoryId, 'QA Browser Seller']);
  sellerId = seller.rows[0].id;
  await provisionInitialAdmin(pool, { email: adminEmail, ownerConfirmed: true, operatorId: 'qa-browser',
    source: `qa-${run}`, now: new Date(), mockSink: async (item) => messages.push(item) });
  await navigate(message('admin_setup').url);
  await waitFor("document.querySelector('#admin-setup-password') && !location.hash", 'admin fragment scrub');
  await pageEvidence('admin-setup');
  await setInput('#admin-setup-password', adminPassword);
  await setInput('#admin-setup-repeat', adminPassword);
  await clickButton('관리자 비밀번호 설정');
  await waitFor("document.body.innerText.includes('관리자 비밀번호를 설정')", 'admin setup');
  await login('admin', adminEmail, adminPassword);
  await navigate('/account/admin/seller-applications');
  await waitFor("document.body.innerText.includes('QA Browser Seller') && document.querySelector('select[name=\"sellerId\"]')", 'review');
  await pageEvidence('seller-review');
  await setInput('select[name="sellerId"]', sellerId);
  await clickButton('승인');
  await waitFor("document.body.innerText.includes('판매자 소속을 승인')", 'seller approval');

  await navigate('/forgot-password');
  await pageEvidence('forgot-password');
  await setInput('#forgot-email', customerEmail);
  await clickButton('재설정 링크 요청');
  await waitFor("document.body.innerText.includes('메일함을 확인')", 'reset request');
  await navigate(message('password_reset').url);
  await waitFor("document.querySelector('#reset-password') && !location.hash", 'reset fragment scrub');
  await pageEvidence('reset-password');
  await setInput('#reset-password', nextPassword);
  await setInput('#reset-repeat', nextPassword);
  await clickButton('비밀번호 변경');
  await waitFor("document.body.innerText.includes('비밀번호가 변경')", 'reset confirmation');
  await login('seller', customerEmail, nextPassword);
  console.log('AUTH_BROWSER_QA_PASS signup admin setup seller review reset viewport keyboard fragment');
} finally {
  await closeCdpPage({ debugging, page, socket }).catch(() => {});
  if (chrome) chrome.kill();
  if (webProcess) webProcess.kill();
  if (api) await api.close();
  setQaAuthSink(undefined);
  const identities = await pool.query("SELECT account_id FROM account_identities WHERE kind='email' AND identifier=ANY($1::text[])",
    [[customerEmail, adminEmail]]);
  accounts.push(...identities.rows.map((row) => row.account_id));
  await pool.query('DELETE FROM auth_action_tokens WHERE email=ANY($1::text[])', [[customerEmail, adminEmail]]);
  if (accounts.length) {
    await pool.query('DELETE FROM seller_applications WHERE account_id=ANY($1::uuid[])', [accounts]);
    await pool.query('DELETE FROM audit_events WHERE actor_account_id=ANY($1::uuid[])', [accounts]);
    await pool.query('DELETE FROM auth_sessions WHERE account_id=ANY($1::uuid[])', [accounts]);
    await pool.query('DELETE FROM account_roles WHERE account_id=ANY($1::uuid[])', [accounts]);
    await pool.query('DELETE FROM account_identities WHERE account_id=ANY($1::uuid[])', [accounts]);
    await pool.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])', [accounts]);
  }
  if (sellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [sellerId]);
  if (categoryId) await pool.query('DELETE FROM seller_categories WHERE id=$1', [categoryId]);
  await pool.end();
  if (profile && profile.startsWith(path.join(os.tmpdir(), 'shoppingmall-auth-browser-'))) {
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
