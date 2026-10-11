import assert from 'node:assert/strict';
import test from 'node:test';
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
