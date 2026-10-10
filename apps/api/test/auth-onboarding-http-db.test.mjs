import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { provisionInitialAdmin } from '../src/auth/onboarding.ts';

const systemId = process.env.AUTH_ADMIN_TEST_DB_SYSTEM_ID;

test('admin setup HTTP is owner-link only, Origin protected, and creates no session cookie', {
  skip: !systemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_auth_admin_1010');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const fixtureLock = await pool.connect();
  await fixtureLock.query("SELECT pg_advisory_lock(hashtext('auth-admin-qa-fixture'))");
  const httpSources = ['127.0.0.1', '::ffff:127.0.0.1', '::1'].map((address) =>
    createHmac('sha256', process.env.AUTH_AUDIT_HMAC_KEY).update(`source:${address}`).digest('hex'));
  await pool.query("DELETE FROM auth_security_events WHERE purpose='admin_setup' AND source_hash=ANY($1::text[])",
    [httpSources]);
  const id = await pool.query('SELECT system_identifier::text AS id FROM pg_control_system()');
  assert.equal(id.rows[0].id, systemId);
  const email = `admin-http+${randomUUID()}@example.invalid`;
  const password = 'isolated-http-password-123';
  const source = `qa-${randomUUID()}`;
  const previous = [process.env.AUTH_DELIVERY_MODE, process.env.APP_ENV,
    process.env.API_HOST, process.env.AUTH_LINK_ORIGIN];
  process.env.AUTH_DELIVERY_MODE = 'mock';
  process.env.APP_ENV = 'development';
  process.env.API_HOST = '127.0.0.1';
  process.env.AUTH_LINK_ORIGIN = 'http://127.0.0.1:9091';
  const messages = [];
  let app;
  try {
    await provisionInitialAdmin(pool, { email, ownerConfirmed: true, operatorId: 'qa-operator',
      source, now: new Date(), mockSink: async (message) => messages.push(message) });
    const token = new URL(messages[0].url).hash.slice('#token='.length);
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const post = (origin, body) => fetch(`${base}/auth/admin-setup/complete`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify(body),
    });
    assert.equal((await post('https://untrusted.invalid', { token, password })).status, 403);
    const invalid = await post('http://127.0.0.1:9091', { token: 'bad', password, role: 'admin' });
    assert.equal(invalid.status, 401);
    const ok = await post('http://127.0.0.1:9091', { token, password, role: 'seller' });
    assert.equal(ok.status, 201);
    assert.equal(ok.headers.get('set-cookie'), null);
    assert.deepEqual(await ok.json(), { status: 'ok' });
    assert.equal((await post('http://127.0.0.1:9091', { token, password })).status, 401);
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:9091' },
      body: JSON.stringify({ email, password, role: 'admin' }),
    });
    assert.equal(login.status, 201);
    assert.match(login.headers.get('set-cookie') ?? '', /HttpOnly/);
  } finally {
    if (app) await app.close();
    const account = await pool.query("SELECT account_id FROM account_identities WHERE kind='email' AND identifier=$1", [email]);
    const accountId = account.rows[0]?.account_id;
    await pool.query('DELETE FROM auth_action_tokens WHERE email=$1', [email]);
    if (accountId) {
      await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [accountId]);
      await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    }
    await pool.query("DELETE FROM auth_security_events WHERE purpose='admin_setup' AND source_hash=ANY($1::text[])",
      [httpSources]);
    await fixtureLock.query("SELECT pg_advisory_unlock(hashtext('auth-admin-qa-fixture'))");
    fixtureLock.release();
    await pool.end();
    for (const [key, value] of Object.entries({ AUTH_DELIVERY_MODE: previous[0], APP_ENV: previous[1],
      API_HOST: previous[2], AUTH_LINK_ORIGIN: previous[3] })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
