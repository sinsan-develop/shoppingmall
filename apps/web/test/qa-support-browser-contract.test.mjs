import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSupportBrowserBounds,inspectListDetail } from
  '../../../scripts/qa-support-browser-contract.mjs';

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

test('S5.2 list detail assertion waits for list, opens it, then checks detail', async () => {
  const order = [];
  await inspectListDetail(async () => { order.push('list'); },
    async () => { order.push('open'); },async () => { order.push('detail'); });
  assert.deepEqual(order,['list','open','detail']);
});
