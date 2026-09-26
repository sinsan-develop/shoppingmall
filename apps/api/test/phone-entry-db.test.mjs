import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { AuthRepository } from '../src/auth/repository.ts';

test('verified phone account creation and login are explicit repository operations', async () => {
  const pool = new Pool();
  const auth = new AuthRepository(pool);
  assert.equal(typeof auth.createPhoneCustomerAfterVerification, 'function');
  assert.equal(typeof auth.loginPhoneAfterVerification, 'function');
  await pool.end();
});

test('verified phone can create a distinct customer, then login without auto-merging other identities', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const auth = new AuthRepository(pool);
  const phone = `010${randomInt(10000000, 99999999)}`;
  let accountId;
  try {
    const created = await auth.createPhoneCustomerAfterVerification(phone);
    accountId = created.accountId;
    assert.equal((await auth.getSession(created.token)).accountId, accountId);
    const returned = await auth.loginPhoneAfterVerification(phone);
    assert.equal((await auth.getSession(returned.token)).accountId, accountId);
    await assert.rejects(auth.createPhoneCustomerAfterVerification(phone));
    const records = await pool.query('SELECT count(*)::int AS total FROM account_identities WHERE account_id = $1', [accountId]);
    assert.equal(records.rows[0].total, 1);
  } finally {
    if (accountId) {
      await pool.query('DELETE FROM audit_events WHERE actor_account_id = $1', [accountId]);
      await pool.query('DELETE FROM auth_sessions WHERE account_id = $1', [accountId]);
      await pool.query('DELETE FROM account_roles WHERE account_id = $1', [accountId]);
      await pool.query('DELETE FROM account_identities WHERE account_id = $1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id = $1', [accountId]);
    }
    await pool.end();
  }
});
