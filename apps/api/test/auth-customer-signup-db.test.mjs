import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { AuthRepository } from '../src/auth/repository.ts';
import { startCustomerSignup, completeCustomerSignup } from '../src/auth/onboarding.ts';

const systemId = process.env.AUTH_ADMIN_TEST_DB_SYSTEM_ID;

test('email ownership creates exactly one customer only after confirmation; existing email response matches', {
  skip: !systemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_auth_admin_1010');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const identity = await pool.query('SELECT system_identifier::text AS id FROM pg_control_system()');
  assert.equal(identity.rows[0].id, systemId);
  const email = `customer+${randomUUID()}@example.invalid`;
  const existingEmail = `existing+${randomUUID()}@example.invalid`;
  const password = 'isolated-customer-password-123';
  const source = `qa-${randomUUID()}`;
  const now = new Date('2026-10-10T12:00:00.000Z');
  const previous = [process.env.AUTH_DELIVERY_MODE, process.env.APP_ENV,
    process.env.API_HOST, process.env.AUTH_LINK_ORIGIN];
  process.env.AUTH_DELIVERY_MODE = 'mock';
  process.env.APP_ENV = 'development';
  process.env.API_HOST = '127.0.0.1';
  process.env.AUTH_LINK_ORIGIN = 'http://127.0.0.1:9091';
  const messages = [];
  try {
    const repository = new AuthRepository(pool);
    await repository.createCustomerAccount(existingEmail, password);
    const accepted = await startCustomerSignup(pool, email, source, now,
      async (message) => messages.push(message));
    const acceptedExisting = await startCustomerSignup(pool, existingEmail, source, now,
      async (message) => messages.push(message));
    assert.deepEqual(accepted, acceptedExisting);
    assert.deepEqual(accepted, { status: 'accepted' });
    assert.equal(messages.length, 1);
    const before = await pool.query("SELECT count(*)::int AS n FROM account_identities WHERE kind='email' AND identifier=$1", [email]);
    assert.equal(before.rows[0].n, 0);
    const token = new URL(messages[0].url).hash.slice('#token='.length);
    await assert.rejects(completeCustomerSignup(pool, 'bad', password, now, source), /invalid/i);
    const attempts = await Promise.allSettled([
      completeCustomerSignup(pool, token, password, now, source),
      completeCustomerSignup(pool, token, password, now, source),
    ]);
    assert.equal(attempts.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter((item) => item.status === 'rejected').length, 1);
    assert.deepEqual(attempts.find((item) => item.status === 'fulfilled').value, { status: 'ok' });
    await assert.rejects(completeCustomerSignup(pool, token, password, now, source), /invalid/i);
    const created = await pool.query(`SELECT i.account_id,i.verified_at,i.password_hash,r.role,
      (SELECT count(*)::int FROM auth_sessions s WHERE s.account_id=i.account_id) AS sessions
      FROM account_identities i JOIN account_roles r ON r.account_id=i.account_id
      WHERE i.kind='email' AND i.identifier=$1`, [email]);
    assert.equal(created.rowCount, 1);
    assert.equal(created.rows[0].role, 'customer');
    assert.ok(created.rows[0].verified_at);
    assert.ok(created.rows[0].password_hash?.startsWith('scrypt$'));
    assert.equal(created.rows[0].sessions, 0);
    const login = await repository.loginEmail(email, password, 'customer');
    assert.equal((await repository.getSession(login.token)).role, 'customer');
    await assert.rejects(repository.loginEmail(email, password, 'admin'), /Invalid credentials/);
  } finally {
    for (const target of [email, existingEmail]) {
      const account = await pool.query("SELECT account_id FROM account_identities WHERE kind='email' AND identifier=$1", [target]);
      const accountId = account.rows[0]?.account_id;
      await pool.query('DELETE FROM auth_action_tokens WHERE email=$1', [target]);
      if (accountId) {
        await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [accountId]);
        await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
        await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
        await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
        await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
      }
    }
    await pool.end();
    for (const [key, value] of Object.entries({ AUTH_DELIVERY_MODE: previous[0], APP_ENV: previous[1],
      API_HOST: previous[2], AUTH_LINK_ORIGIN: previous[3] })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
