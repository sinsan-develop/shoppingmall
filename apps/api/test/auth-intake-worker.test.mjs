import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import * as worker from '../src/auth/intake-worker.ts';

test('idle intake worker expires old requests without an account lookup', async () => {
  assert.equal(typeof worker.processAuthIntakeOnce, 'function');
  const queries = [];
  const client = { async query(sql) {
    queries.push(sql);
    return { rows: [] };
  }, release() {} };
  const pool = { async query(sql) { queries.push(sql); return { rows: [] }; },
    async connect() { return client; } };
  assert.deepEqual(await worker.processAuthIntakeOnce(pool, new Date('2026-10-11T00:00:00Z')),
    { processed: false });
  assert.match(queries.join(' '), /UPDATE auth_intake_jobs SET status='dead'/);
  assert.doesNotMatch(queries.join(' '), /account_identities|accounts\b/);
});

test('valid SMTP starts the intake loop while disabled and non-loopback mock do not', async () => {
  const old = Object.fromEntries(['AUTH_DELIVERY_MODE', 'APP_ENV', 'API_HOST', 'AUTH_LINK_ORIGIN',
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURITY', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']
    .map((key) => [key, process.env[key]]));
  let calls = 0;
  const client = { async query() { return { rows: [] }; }, release() {} };
  const pool = { async query() { calls++; return { rows: [], rowCount: 0 }; },
    async connect() { return client; } };
  try {
    Object.assign(process.env, { AUTH_DELIVERY_MODE: 'smtp',
      AUTH_LINK_ORIGIN: 'https://shop.example.invalid', SMTP_HOST: 'mail.example.invalid',
      SMTP_PORT: '587', SMTP_SECURITY: 'starttls', SMTP_USER: 'test-user',
      SMTP_PASSWORD: 'fake-test-secret', SMTP_FROM: 'no-reply@example.invalid' });
    const stop = worker.startAuthIntakeLoop(pool);
    try { await new Promise((resolve) => setTimeout(resolve, 1100)); }
    finally { stop(); }
    assert.ok(calls > 0, 'SMTP mode must poll pending auth work');
    calls = 0;
    process.env.AUTH_DELIVERY_MODE = 'disabled';
    worker.startAuthIntakeLoop(pool)();
    process.env.AUTH_DELIVERY_MODE = 'mock';
    process.env.APP_ENV = 'development';
    process.env.API_HOST = '0.0.0.0';
    worker.startAuthIntakeLoop(pool)();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(calls, 0);
  } finally {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('invalid SMTP configuration stops main before opening a listener', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'apps/api/src/main.ts'], {
    cwd: new URL('../../../', import.meta.url), encoding: 'utf8', timeout: 10000,
    env: { ...process.env, AUTH_DELIVERY_MODE: 'smtp', AUTH_LINK_ORIGIN: 'https://shop.example.invalid',
      SMTP_HOST: 'mail.example.invalid', SMTP_PORT: '0', SMTP_SECURITY: 'starttls',
      SMTP_USER: 'test-user', SMTP_PASSWORD: 'fake-test-secret',
      SMTP_FROM: 'no-reply@example.invalid' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Auth delivery unavailable/);
  assert.doesNotMatch(result.stderr, /fake-test-secret|listen EADDRINUSE/);
});
