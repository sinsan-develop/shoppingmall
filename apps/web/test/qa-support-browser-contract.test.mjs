import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertSupportBrowserBounds,inspectListDetail } from
  '../../../scripts/qa-support-browser-contract.mjs';
import * as browserContract from '../../../scripts/qa-support-browser-contract.mjs';

const runId = 'a52c1007';
const good = {
  QA_WEB_BASE: 'http://127.0.0.1:9091',
  QA_CHROME_DEBUGGING: 'http://127.0.0.1:9229',
  QA_BROWSER_CONSENT: `S52_ISOLATED_SUPPORT_${runId}`,
  QA_EVIDENCE_DIR: 'D:\\tmp\\shoppingmall-s52-browser-a52c1007-evidence',
  QA_BROWSER_ATTEMPT: 'r1',
};

test('S5.2 browser is bound to exact loopback, run consent and evidence folder', () => {
  assert.equal(assertSupportBrowserBounds(good,runId,'win32').evidenceDir,
    good.QA_EVIDENCE_DIR);
  assert.equal(assertSupportBrowserBounds({ ...good,QA_BROWSER_ATTEMPT:'r2' },runId,'win32').attempt,
    'r2');
  for (const changed of [
    { QA_WEB_BASE: 'http://localhost:9091' },
    { QA_CHROME_DEBUGGING: 'http://127.0.0.1:9230' },
    { QA_BROWSER_CONSENT: 'S52_ISOLATED_SUPPORT_other' },
    { QA_EVIDENCE_DIR: 'D:\\tmp\\another-run' },
    { QA_BROWSER_ATTEMPT: '../r2' },
  ]) assert.throws(() => assertSupportBrowserBounds({ ...good,...changed },runId,'win32'));
  assert.throws(() => assertSupportBrowserBounds(good,'invalid','win32'));
  assert.throws(() => assertSupportBrowserBounds(good,runId,'linux'));
});

test('formal shared S5.2 browser requires a separate matching opt-in and no resume mode', () => {
  const consent = `SHARED_S52_SUPPORT_UI_${runId}`;
  const shared = { ...good,QA_BROWSER_CONSENT:consent,
    QA_SHARED_SUPPORT_UI:consent };
  assert.equal(assertSupportBrowserBounds(shared,runId,'win32').attempt,'r1');
  assert.throws(() => assertSupportBrowserBounds({ ...shared,
    QA_SHARED_SUPPORT_UI:undefined },runId,'win32'));
  assert.throws(() => assertSupportBrowserBounds({ ...good,
    QA_SHARED_SUPPORT_UI:consent },runId,'win32'));
  assert.throws(() => browserContract.assertSupportResumeTarget({ ...shared,
    QA_SUPPORT_FLOW:'resume' },runId));
});

test('refund-resume browser flow is limited to its isolated PostgreSQL and system ID', () => {
  const env = { ...good,QA_SUPPORT_FLOW:'resume',
    DATABASE_URL:'postgresql://postgres:test-only@127.0.0.1:15439/shoppingmall_s52_support_ui_a52c1007',
    S52_SUPPORT_UI_DB_SYSTEM_ID:'7693877180765425702' };
  const target = browserContract.assertSupportResumeTarget(env,runId);
  assert.equal(target.database,'shoppingmall_s52_support_ui_a52c1007');
  assert.equal(target.systemId,'7693877180765425702');
  assert.equal(browserContract.assertSupportResumeTarget(good,runId),null);
  for (const changed of [
    { DATABASE_URL:'postgresql://postgres:test-only@127.0.0.1:15439/shoppingmall' },
    { DATABASE_URL:'postgresql://postgres:test-only@localhost:15439/shoppingmall_s52_support_ui_a52c1007' },
    { DATABASE_URL:'postgresql://postgres:test-only@127.0.0.1:5432/shoppingmall_s52_support_ui_a52c1007' },
    { S52_SUPPORT_UI_DB_SYSTEM_ID:'' },
    { QA_SUPPORT_FLOW:'unknown' },
  ]) assert.throws(() => browserContract.assertSupportResumeTarget({ ...env,...changed },runId));
});

test('S5.2 list detail assertion waits for list, opens it, then checks detail', async () => {
  const order = [];
  await inspectListDetail(async () => { order.push('list'); },
    async () => { order.push('open'); },async () => { order.push('detail'); });
  assert.deepEqual(order,['list','open','detail']);
});

test('S5.2 browser waits for the localized refunded claim, not the DB enum', () => {
  assert.equal(typeof browserContract.browserClaimStatusVisibleExpression,'function');
  const expression=browserContract.browserClaimStatusVisibleExpression('REFUNDED');
  const visible=(innerText) => Function('document',`return ${expression}`)(
    { body:{ innerText } });
  assert.equal(visible('반품 · 환불 완료 · 훼손'),true);
  assert.equal(visible('RETURN · REFUNDED · damaged'),false);
});

test('pending resume checks selected detail status rather than the filter option', () => {
  const expression=browserContract.browserSelectedClaimStatusExpression('REFUND_PROCESSING');
  const visible=(detailText,filterText) => Function('document',`return ${expression}`)({
    body:{innerText:filterText},
    querySelector:() => detailText === null ? null : {textContent:detailText},
  });
  assert.equal(visible('환불 처리 중',''),true);
  assert.equal(visible('판매자 답변','환불 처리 중'),false);
  assert.equal(visible(null,'환불 처리 중'),false);
});

test('browser runner loads API-owned PostgreSQL dependency before fixture validation', () => {
  const result = spawnSync(process.execPath,['--import','tsx',
    fileURLToPath(new URL('../../../scripts/qa-support-browser.mjs',import.meta.url))],{
    cwd:fileURLToPath(new URL('../../../',import.meta.url)),
    env:{ ...process.env,QA_FIXTURE_JSON:'null',QA_FIXTURE_PASSWORD:'' },encoding:'utf8',
  });
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Signed S5\.2 fixture is required/);
  assert.doesNotMatch(result.stderr,/ERR_MODULE_NOT_FOUND/);
});

test('S5.2 navigation waits for a document body after the URL changes', () => {
  assert.equal(typeof browserContract.browserNavigationReadyExpression,'function');
  const expression=browserContract.browserNavigationReadyExpression('/products/product-1');
  const ready=(pathname,readyState,body) =>
    Function('location','document',`return ${expression}`)(
      { pathname },{ readyState,body });
  assert.equal(ready('/products/product-1','loading',null),false);
  assert.equal(ready('/products/product-1','interactive',{}),true);
  assert.equal(ready('/products/other','complete',{}),false);
});

test('S5.2 browser drives customer confirmation and review through the account UI', () => {
  const source = readFileSync(new URL('../../../scripts/qa-support-browser.mjs',import.meta.url),'utf8');
  assert.match(source,/click\('section\[aria-label\$="고객지원"\] button'\)/);
  assert.match(source,/#review-text-/);
  assert.doesNotMatch(source,/browserJson\('\/customer\/support\/confirmations',\{\s*method:'POST'/);
  assert.match(source,/querySelectorAll\('section\[aria-label\$="고객지원"\] button'\)/);
  assert.match(source,/\.some\(\(button\) => button\.textContent\?\.includes\('구매확정'\)\)/);
});
