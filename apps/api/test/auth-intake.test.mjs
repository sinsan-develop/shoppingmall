import assert from 'node:assert/strict';
import test from 'node:test';
import * as intake from '../src/auth/intake.ts';

test('signup and reset use the same account-blind durable intake before response', async () => {
  assert.equal(typeof intake.enqueueAuthIntake, 'function');
  const queries = [];
  const client = { async query(sql, values) {
    queries.push({ sql, values });
    if (sql.includes('count(*)')) return { rows: [{ subject_count: 0, source_count: 0 }] };
    return { rows: [], rowCount: 1 };
  }, release() {} };
  const pool = { async connect() { return client; } };
  const saved = [process.env.AUTH_DELIVERY_MODE, process.env.APP_ENV,
    process.env.API_HOST, process.env.AUTH_LINK_ORIGIN, process.env.AUTH_AUDIT_HMAC_KEY];
  process.env.AUTH_DELIVERY_MODE = 'mock';
  process.env.APP_ENV = 'development';
  process.env.API_HOST = '127.0.0.1';
  process.env.AUTH_LINK_ORIGIN = 'http://127.0.0.1:9091';
  process.env.AUTH_AUDIT_HMAC_KEY = 'test-only-key-with-at-least-thirty-two-characters';
  try {
    for (const purpose of ['customer_signup', 'password_reset']) {
      const before = queries.length;
      assert.deepEqual(await intake.enqueueAuthIntake(pool, purpose,
        ' Test@Example.invalid ', '127.0.0.1', new Date('2026-10-11T00:00:00Z'), async () => {}),
      { status: 'accepted' });
      const sql = queries.slice(before).map((item) => item.sql).join(' ');
      assert.match(sql, /INSERT INTO auth_intake_jobs/);
      assert.equal((sql.match(/pg_advisory_xact_lock/g) ?? []).length, 2);
      assert.doesNotMatch(sql, /account_identities|accounts\b|auth_action_tokens/);
    }
  } finally {
    for (const [name, value] of Object.entries({ AUTH_DELIVERY_MODE: saved[0], APP_ENV: saved[1],
      API_HOST: saved[2], AUTH_LINK_ORIGIN: saved[3], AUTH_AUDIT_HMAC_KEY: saved[4] })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('worker claims one queued request with an expiring lease before touching an account', async () => {
  assert.equal(typeof intake.claimAuthIntakeJob, 'function');
  const queries = [];
  const client = { async query(sql, values) {
    queries.push({ sql, values });
    if (sql.includes('UPDATE auth_intake_jobs')) return { rows: [{ id: 'job-1', purpose: 'password_reset',
      email: 'test@example.invalid', source_hash: 'a'.repeat(64), attempts: 1 }] };
    return { rows: [] };
  }, release() {} };
  const job = await intake.claimAuthIntakeJob({ async connect() { return client; } },
    new Date('2026-10-11T00:00:00Z'));
  assert.equal(job.id, 'job-1');
  assert.match(queries.map((q) => q.sql).join(' '), /SKIP LOCKED/);
  assert.doesNotMatch(queries.map((q) => q.sql).join(' '), /account_identities|accounts\b/);
});
