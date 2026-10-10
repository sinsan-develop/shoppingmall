import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./qa-s5-customer-browser.mjs', import.meta.url));
const valid = {
  QA_WEB_BASE: 'http://127.0.0.1:9091',
  QA_CHROME_DEBUGGING: 'http://127.0.0.1:1',
  QA_EMAIL: 'qa+abc01234-customer@example.invalid',
  QA_PASSWORD: 'test-only-password-12345',
  QA_PRODUCT_ID: '123e4567-e89b-42d3-a456-426614174000',
};

for (const [name, changes] of [
  ['external web origin', { QA_WEB_BASE: 'https://example.com' }],
  ['external Chrome endpoint', { QA_CHROME_DEBUGGING: 'https://example.com' }],
  ['invalid product ID', { QA_PRODUCT_ID: '../../account/admin' }],
]) {
  test(`customer browser refuses ${name} before Chrome connection`, () => {
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, ...valid, ...changes },
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /QA browser inputs invalid/);
    assert.doesNotMatch(result.stderr, /ECONNREFUSED|fetch failed/);
  });
}
