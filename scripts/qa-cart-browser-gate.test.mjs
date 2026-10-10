import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./qa-cart-browser.mjs', import.meta.url));
const productId = '11111111-1111-4111-8111-111111111111';

function runGate(overrides = {}) {
  return spawnSync(process.execPath, [script], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      QA_WEB_BASE: 'http://127.0.0.1:9091',
      QA_CHROME_DEBUGGING: 'http://127.0.0.1:9229',
      QA_PRODUCT_ID: productId,
      QA_EMAIL: 'qa+1234abcd-customer@example.invalid',
      QA_PASSWORD: 'test-only-password',
      ...overrides,
    },
  });
}

test('cart browser rejects a non-synthetic account before browser connection', () => {
  const result = runGate({ QA_EMAIL: 'real@example.com' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /QA browser inputs/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED/);
});

test('cart browser rejects an external web target before browser connection', () => {
  const result = runGate({ QA_WEB_BASE: 'https://example.com' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /QA browser inputs/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED/);
});

test('cart browser rejects an invalid product identifier before browser connection', () => {
  const result = runGate({ QA_PRODUCT_ID: 'not-a-product-id' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /QA browser inputs/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED/);
});

test('cart browser rejects a trailing-slash base that would create double-slash navigation', () => {
  const result = runGate({ QA_WEB_BASE: 'http://127.0.0.1:9091/' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /QA browser inputs/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED|EACCES/);
});
