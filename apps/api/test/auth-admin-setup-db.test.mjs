import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { AuthRepository } from '../src/auth/repository.ts';
import { provisionInitialAdmin, completeAdminSetup } from '../src/auth/onboarding.ts';
import { runInitialAdminCli } from '../scripts/provision-initial-admin.ts';

const systemId = process.env.AUTH_ADMIN_TEST_DB_SYSTEM_ID;
const expectedDatabase = 'shoppingmall_auth_admin_1010';

async function isolatedPool() {
  assert.equal(process.env.PGDATABASE, expectedDatabase);
  assert.match(systemId ?? '', /^\d+$/);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const identity = await pool.query('SELECT current_database() AS db, system_identifier::text AS id FROM pg_control_system()');
  assert.equal(identity.rows[0].db, expectedDatabase);
  assert.equal(identity.rows[0].id, systemId);
  return pool;
}

async function removeFixture(pool, email) {
  const identity = await pool.query("SELECT account_id FROM account_identities WHERE kind='email' AND identifier=$1", [email]);
  const accountId = identity.rows[0]?.account_id;
  await pool.query('DELETE FROM auth_action_tokens WHERE email=$1', [email]);
  if (accountId) {
    await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [accountId]);
    await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
    await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
    await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
    await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
  }
}

test('only a confirmed operator can provision one dormant admin; owner link enables chosen password once', {
  skip: !systemId,
}, async () => {
  const pool = await isolatedPool();
  const fixtureLock = await pool.connect();
  await fixtureLock.query("SELECT pg_advisory_lock(hashtext('auth-admin-qa-fixture'))");
  const email = `admin+${randomUUID()}@example.invalid`;
  const password = 'isolated-owner-password-123';
  const now = new Date('2026-10-10T12:00:00.000Z');
  const messages = [];
  const source = `qa-${randomUUID()}`;
  const originalDelivery = [process.env.AUTH_DELIVERY_MODE, process.env.APP_ENV,
    process.env.API_HOST, process.env.AUTH_LINK_ORIGIN];
  process.env.AUTH_DELIVERY_MODE = 'mock';
  process.env.APP_ENV = 'development';
  process.env.API_HOST = '127.0.0.1';
  process.env.AUTH_LINK_ORIGIN = 'http://127.0.0.1:9091';
  try {
    const before = await pool.query("SELECT count(*)::int AS n FROM account_roles WHERE role='admin'");
    assert.equal(before.rows[0].n, 0);
    await assert.rejects(provisionInitialAdmin(pool, { email, ownerConfirmed: false, operatorId: 'qa-operator', source, now,
      mockSink: async (message) => messages.push(message) }), /confirm/i);
    assert.equal(messages.length, 0);
    const result = await provisionInitialAdmin(pool, { email, ownerConfirmed: true, operatorId: 'qa-operator', source, now,
      mockSink: async (message) => messages.push(message) });
    assert.equal(result.status, 'pending');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].email, email);
    assert.equal(messages[0].purpose, 'admin_setup');
    const firstToken = new URL(messages[0].url).hash.slice('#token='.length);
    assert.ok(firstToken.length > 32);
    const repository = new AuthRepository(pool);
    await assert.rejects(repository.loginEmail(email, password, 'admin'), /Invalid credentials/);
    const dormant = await pool.query(`SELECT i.password_hash,i.verified_at,
      (SELECT count(*)::int FROM auth_sessions s WHERE s.account_id=i.account_id) AS sessions
      FROM account_identities i WHERE i.identifier=$1`, [email]);
    assert.equal(dormant.rows[0].password_hash, null);
    assert.equal(dormant.rows[0].verified_at, null);
    assert.equal(dormant.rows[0].sessions, 0);
    await assert.rejects(provisionInitialAdmin(pool, { email: `other+${randomUUID()}@example.invalid`,
      ownerConfirmed: true, operatorId: 'qa-operator', source, now,
      mockSink: async (message) => messages.push(message) }), /admin exists/i);
    await assert.rejects(completeAdminSetup(pool, 'bad-token', password, now, source), /invalid/i);
    await provisionInitialAdmin(pool, { email, ownerConfirmed: true, operatorId: 'qa-operator',
      source, now, mockSink: async (message) => messages.push(message) });
    const secondToken = new URL(messages[1].url).hash.slice('#token='.length);
    await assert.rejects(completeAdminSetup(pool, firstToken, password, now, source), /invalid/i);
    await assert.rejects(completeAdminSetup(pool, secondToken, password,
      new Date('2026-10-10T12:31:00.000Z'), source), /invalid/i);
    const retryAt = new Date('2026-10-10T12:32:00.000Z');
    await provisionInitialAdmin(pool, { email, ownerConfirmed: true, operatorId: 'qa-operator',
      source, now: retryAt, mockSink: async (message) => messages.push(message) });
    const token = new URL(messages[2].url).hash.slice('#token='.length);
    const attempts = await Promise.allSettled([
      completeAdminSetup(pool, token, password, retryAt, source),
      completeAdminSetup(pool, token, password, retryAt, source),
    ]);
    assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter((attempt) => attempt.status === 'rejected').length, 1);
    await assert.rejects(completeAdminSetup(pool, token, password, retryAt, source), /invalid/i);
    const activated = await pool.query('SELECT password_hash,verified_at FROM account_identities WHERE identifier=$1', [email]);
    assert.ok(activated.rows[0].password_hash?.startsWith('scrypt$'));
    assert.ok(activated.rows[0].verified_at);
    const session = await repository.loginEmail(email, password, 'admin');
    assert.equal((await repository.getSession(session.token)).role, 'admin');
    await assert.rejects(repository.loginEmail(email, password, 'customer'), /Invalid credentials/);
    await assert.rejects(provisionInitialAdmin(pool, { email, ownerConfirmed: true,
      operatorId: 'qa-operator', source, now,
      mockSink: async (message) => messages.push(message) }), /admin exists/i);
  } finally {
    await removeFixture(pool, email);
    await fixtureLock.query("SELECT pg_advisory_unlock(hashtext('auth-admin-qa-fixture'))");
    fixtureLock.release();
    await pool.end();
    const [mode, app, host, origin] = originalDelivery;
    for (const [key, value] of Object.entries({ AUTH_DELIVERY_MODE: mode, APP_ENV: app,
      API_HOST: host, AUTH_LINK_ORIGIN: origin })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('initial admin CLI refuses missing owner proof or delivery without writing an account', {
  skip: !systemId,
}, async () => {
  const pool = await isolatedPool();
  const fixtureLock = await pool.connect();
  await fixtureLock.query("SELECT pg_advisory_lock(hashtext('auth-admin-qa-fixture'))");
  const email = `admin-cli+${randomUUID()}@example.invalid`;
  const saved = [process.env.AUTH_DELIVERY_MODE, process.env.APP_ENV,
    process.env.API_HOST, process.env.AUTH_LINK_ORIGIN];
  try {
    const env = { EMAIL_TO: email, INITIAL_ADMIN_OPERATOR: `qa-operator-${randomUUID()}`,
      AUTH_DELIVERY_MODE: 'mock', APP_ENV: 'development', API_HOST: '127.0.0.1',
      AUTH_LINK_ORIGIN: 'http://127.0.0.1:9091',
      DATABASE_URL: process.env.DATABASE_URL, PGDATABASE: expectedDatabase,
      AUTH_ADMIN_TEST_DB_SYSTEM_ID: systemId };
    await assert.rejects(runInitialAdminCli(pool, [], env), /confirmation/i);
    await assert.rejects(runInitialAdminCli(pool, ['--owner-confirmed'], env), /delivery/i);
    const identities = await pool.query("SELECT count(*)::int AS n FROM account_identities WHERE identifier=$1", [email]);
    assert.equal(identities.rows[0].n, 0);
    process.env.AUTH_DELIVERY_MODE = 'mock';
    process.env.APP_ENV = 'development';
    process.env.API_HOST = '127.0.0.1';
    process.env.AUTH_LINK_ORIGIN = 'http://127.0.0.1:9091';
    const messages = [];
    const result = await runInitialAdminCli(pool, ['--owner-confirmed'], env,
      async (message) => messages.push(message));
    assert.equal(result.status, 'pending');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].email, email);
  } finally {
    await removeFixture(pool, email);
    await fixtureLock.query("SELECT pg_advisory_unlock(hashtext('auth-admin-qa-fixture'))");
    fixtureLock.release();
    await pool.end();
    for (const [key, value] of Object.entries({ AUTH_DELIVERY_MODE: saved[0], APP_ENV: saved[1],
      API_HOST: saved[2], AUTH_LINK_ORIGIN: saved[3] })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
