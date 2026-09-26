import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { AuthRepository } from '../src/auth/repository.ts';
import { MockPhoneOtp } from '../src/auth/mock-phone-otp.ts';

test('phone linking is an explicit repository action', () => {
  const pool = new Pool();
  assert.equal(typeof new AuthRepository(pool).linkPhoneIdentity, 'function');
  return pool.end();
});

test('verified phone links only to its signed-in customer and never auto-merges by number', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const auth = new AuthRepository(pool);
  const accounts = [];
  const phone = `010${randomInt(10000000, 99999999)}`;
  let code;
  const otp = new MockPhoneOtp((_phone, delivered) => { code = delivered; });
  try {
    const a = await auth.createCustomerAccount(`qa+${randomUUID()}@example.invalid`, 'test-only-password-12345');
    accounts.push(a);
    const b = await auth.createCustomerAccount(`qa+${randomUUID()}@example.invalid`, 'test-only-password-12345');
    accounts.push(b);
    const challenge = otp.issue(phone, a);
    const proof = otp.verify(challenge.challengeId, code, a);
    assert.ok(proof);
    await assert.rejects(auth.linkPhoneIdentity({ accountId: b, role: 'customer' }, proof));
    await auth.linkPhoneIdentity({ accountId: a, role: 'customer' }, proof);
    const bChallenge = otp.issue(phone, b);
    const bProof = otp.verify(bChallenge.challengeId, code, b);
    await assert.rejects(auth.linkPhoneIdentity({ accountId: b, role: 'customer' }, bProof));
    const result = await pool.query('SELECT account_id, verified_at FROM account_identities WHERE kind = $1 AND identifier = $2',
      ['phone', phone]);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].account_id, a);
    assert.ok(result.rows[0].verified_at);
    const audit = await pool.query('SELECT count(*)::int AS total FROM audit_events WHERE actor_account_id = $1 AND action = $2',
      [a, 'auth.link_phone']);
    assert.equal(audit.rows[0].total, 1);
  } finally {
    for (const accountId of accounts) {
      await pool.query('DELETE FROM audit_events WHERE actor_account_id = $1', [accountId]);
      await pool.query('DELETE FROM auth_sessions WHERE account_id = $1', [accountId]);
      await pool.query('DELETE FROM account_roles WHERE account_id = $1', [accountId]);
      await pool.query('DELETE FROM account_identities WHERE account_id = $1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id = $1', [accountId]);
    }
    await pool.end();
  }
});
