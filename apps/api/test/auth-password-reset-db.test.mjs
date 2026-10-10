import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { AuthRepository } from '../src/auth/repository.ts';
import { issueActionToken } from '../src/auth/action-tokens.ts';
import { startPasswordReset, completePasswordReset } from '../src/auth/password-recovery.ts';

const systemId = process.env.AUTH_ADMIN_TEST_DB_SYSTEM_ID;

test('verified owner reset revokes customer, seller and admin sessions atomically', {
  skip: !systemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_auth_admin_1010');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const fixtureLock = await pool.connect();
  await fixtureLock.query("SELECT pg_advisory_lock(hashtext('auth-admin-qa-fixture'))");
  const system = await pool.query('SELECT system_identifier::text AS id FROM pg_control_system()');
  assert.equal(system.rows[0].id, systemId);
  const email = `reset+${randomUUID()}@example.invalid`;
  const unknownEmail = `unknown+${randomUUID()}@example.invalid`;
  const password = 'isolated-reset-old-password-123';
  const replacement = 'isolated-reset-new-password-123';
  const source = `qa-${randomUUID()}`;
  const now = new Date('2026-10-10T12:00:00.000Z');
  const saved = [process.env.AUTH_DELIVERY_MODE, process.env.APP_ENV,
    process.env.API_HOST, process.env.AUTH_LINK_ORIGIN];
  process.env.AUTH_DELIVERY_MODE = 'mock';
  process.env.APP_ENV = 'development';
  process.env.API_HOST = '127.0.0.1';
  process.env.AUTH_LINK_ORIGIN = 'http://127.0.0.1:9091';
  const messages = [];
  let accountId;
  let categoryId;
  let sellerId;
  try {
    const repository = new AuthRepository(pool);
    accountId = await repository.createCustomerAccount(email, password);
    await pool.query('UPDATE account_identities SET verified_at=$2 WHERE account_id=$1', [accountId, now]);
    await pool.query("INSERT INTO account_roles(account_id,role) VALUES ($1,'admin')", [accountId]);
    const category = await pool.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id',
      [`qa-reset-${randomUUID()}`]);
    categoryId = category.rows[0].id;
    const seller = await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [categoryId, 'Reset QA Seller']);
    sellerId = seller.rows[0].id;
    await pool.query("INSERT INTO account_roles(account_id,role,seller_id) VALUES ($1,'seller',$2)", [accountId, sellerId]);
    const beforeSessions = await Promise.all([
      repository.loginEmail(email, password, 'customer'),
      repository.loginEmail(email, password, 'admin'),
      repository.loginEmail(email, password, 'seller', sellerId),
    ]);
    await pool.query('UPDATE account_identities SET verified_at=NULL WHERE account_id=$1', [accountId]);
    assert.deepEqual(await startPasswordReset(pool, email, source, now,
      async (message) => messages.push(message)), { status: 'accepted' });
    assert.equal(messages.length, 0);
    await pool.query('UPDATE account_identities SET verified_at=$2 WHERE account_id=$1', [accountId, now]);
    await pool.query('UPDATE accounts SET disabled_at=$2 WHERE id=$1', [accountId, now]);
    assert.deepEqual(await startPasswordReset(pool, email, source, now,
      async (message) => messages.push(message)), { status: 'accepted' });
    assert.equal(messages.length, 0);
    await pool.query('UPDATE accounts SET disabled_at=NULL WHERE id=$1', [accountId]);
    assert.deepEqual(await startPasswordReset(pool, email, source, now,
      async () => { throw new Error('isolated mock delivery failure'); }), { status: 'accepted' });
    const failedDelivery = await pool.query(`SELECT count(*)::int AS n FROM auth_action_tokens
      WHERE email=$1 AND purpose='password_reset' AND revoked_at IS NOT NULL`, [email]);
    assert.equal(failedDelivery.rows[0].n, 1);
    const acceptedUnknown = await startPasswordReset(pool, unknownEmail, source, now,
      async (message) => messages.push(message));
    const acceptedKnown = await startPasswordReset(pool, email, source, now,
      async (message) => messages.push(message));
    assert.deepEqual(acceptedUnknown, acceptedKnown);
    assert.deepEqual(acceptedKnown, { status: 'accepted' });
    assert.equal(messages.length, 1);
    const obsolete = new URL(messages[0].url).hash.slice('#token='.length);
    await startPasswordReset(pool, email, source, now, async (message) => messages.push(message));
    const expired = new URL(messages[1].url).hash.slice('#token='.length);
    await assert.rejects(completePasswordReset(pool, obsolete, replacement, now, source), /invalid/i);
    await assert.rejects(completePasswordReset(pool, expired, replacement,
      new Date('2026-10-10T12:31:00.000Z'), source), /invalid/i);
    const retryAt = new Date('2026-10-10T12:32:00.000Z');
    await startPasswordReset(pool, email, source, retryAt, async (message) => messages.push(message));
    const token = new URL(messages[2].url).hash.slice('#token='.length);
    const wrongPurpose = await issueActionToken(pool, { purpose: 'admin_setup', email,
      accountId, source, now });
    await assert.rejects(completePasswordReset(pool, wrongPurpose, replacement, retryAt, source), /invalid/i);
    await assert.rejects(completePasswordReset(pool, 'bad', replacement, retryAt, source), /invalid/i);
    const results = await Promise.allSettled([
      completePasswordReset(pool, token, replacement, retryAt, source),
      completePasswordReset(pool, token, replacement, retryAt, source),
    ]);
    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(results.filter((item) => item.status === 'rejected').length, 1);
    await assert.rejects(completePasswordReset(pool, token, replacement, retryAt, source), /invalid/i);
    for (const session of beforeSessions) assert.equal(await repository.getSession(session.token), undefined);
    await assert.rejects(repository.loginEmail(email, password, 'customer'), /Invalid credentials/);
    assert.equal((await repository.getSession((await repository.loginEmail(email, replacement, 'customer')).token)).role,
      'customer');
    assert.equal((await repository.getSession((await repository.loginEmail(email, replacement, 'admin')).token)).role,
      'admin');
    assert.equal((await repository.getSession((await repository.loginEmail(email, replacement, 'seller', sellerId)).token)).role,
      'seller');
  } finally {
    await pool.query('DELETE FROM auth_action_tokens WHERE email=ANY($1::text[])', [[email, unknownEmail]]);
    if (accountId) {
      await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [accountId]);
      await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    }
    if (sellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [sellerId]);
    if (categoryId) await pool.query('DELETE FROM seller_categories WHERE id=$1', [categoryId]);
    await fixtureLock.query("SELECT pg_advisory_unlock(hashtext('auth-admin-qa-fixture'))");
    fixtureLock.release();
    await pool.end();
    for (const [key, value] of Object.entries({ AUTH_DELIVERY_MODE: saved[0], APP_ENV: saved[1],
      API_HOST: saved[2], AUTH_LINK_ORIGIN: saved[3] })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
