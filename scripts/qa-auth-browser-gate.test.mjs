import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./qa-auth-browser.mjs', import.meta.url));
const approvedSystem = '7622490131194466339';

function runGate(overrides = {}) {
  return spawnSync(process.execPath, ['--import', 'tsx', script], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      PGDATABASE: 'shoppingmall_qa_20261010_2',
      QA_ROLE_MATRIX_DB_SYSTEM_ID: approvedSystem,
      AUTH_ADMIN_TEST_DB_SYSTEM_ID: approvedSystem,
      DATABASE_URL: 'postgresql://qa@127.0.0.1:15442/shoppingmall_qa_20261010_2',
      APP_ENV: 'development', API_HOST: '127.0.0.1', AUTH_DELIVERY_MODE: 'mock',
      AUTH_LINK_ORIGIN: 'http://127.0.0.1:9091', WEB_ORIGIN: 'http://127.0.0.1:9091',
      ...overrides,
    },
  });
}

test('approved QA database configuration reaches the connection check instead of the obsolete DB guard', () => {
  const result = runGate();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ECONNREFUSED/);
  assert.doesNotMatch(result.stderr, /PGDATABASE QA guard/);
});

test('protected database name is rejected before any connection', () => {
  const result = runGate({
    PGDATABASE: 'shoppingmall',
    DATABASE_URL: 'postgresql://qa@127.0.0.1:15442/shoppingmall',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /QA guard/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED/);
});
