import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { AuthRepository } from '../src/auth/repository.ts';

test('HTTP login, role switch and logout use persisted grants, not request headers', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repository = new AuthRepository(pool);
  const email = `qa+${randomUUID()}@example.invalid`;
  const password = 'test-only-password-12345';
  let accountId;
  let app;
  try {
    accountId = await repository.createCustomerAccount(email, password);
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const base = `http://127.0.0.1:${address.port}`;

    const deniedOrigin = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://untrusted.invalid' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(deniedOrigin.status, 403);

    const login = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:9091' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 201);
    const customerCookie = login.headers.get('set-cookie')?.split(';')[0];
    assert.match(customerCookie ?? '', /^sm_session=/);
    assert.match(login.headers.get('set-cookie') ?? '', /HttpOnly/);

    const customer = await fetch(`${base}/auth/me`, {
      headers: { cookie: customerCookie, 'x-role': 'admin' },
    });
    assert.equal(customer.status, 200);
    assert.equal((await customer.json()).role, 'customer');
    const deniedSwitch = await fetch(`${base}/auth/switch-role`, {
      method: 'POST', headers: { cookie: customerCookie, origin: 'http://127.0.0.1:9091', 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    });
    assert.equal(deniedSwitch.status, 403);

    await pool.query('INSERT INTO account_roles (account_id, role) VALUES ($1, $2)', [accountId, 'admin']);
    const switchResponse = await fetch(`${base}/auth/switch-role`, {
      method: 'POST', headers: { cookie: customerCookie, origin: 'http://127.0.0.1:9091', 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    });
    assert.equal(switchResponse.status, 201);
    const adminCookie = switchResponse.headers.get('set-cookie')?.split(';')[0];
    assert.equal((await fetch(`${base}/auth/me`, { headers: { cookie: customerCookie } })).status, 401);
    const admin = await fetch(`${base}/auth/me`, { headers: { cookie: adminCookie } });
    assert.equal((await admin.json()).role, 'admin');

    const logout = await fetch(`${base}/auth/logout`, {
      method: 'POST', headers: { cookie: adminCookie, origin: 'http://127.0.0.1:9091' },
    });
    assert.equal(logout.status, 201);
    assert.equal((await fetch(`${base}/auth/me`, { headers: { cookie: adminCookie } })).status, 401);

    const expiringLogin = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:9091' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(expiringLogin.status, 201);
    const expiringCookie = expiringLogin.headers.get('set-cookie')?.split(';')[0];
    assert.equal((await fetch(`${base}/auth/me`, { headers: { cookie: expiringCookie } })).status, 200);
    const expired = await pool.query(
      `UPDATE auth_sessions SET expires_at=now()-interval '1 second'
       WHERE account_id=$1 AND revoked_at IS NULL RETURNING id`, [accountId],
    );
    assert.equal(expired.rowCount, 1);
    assert.equal((await fetch(`${base}/auth/me`, { headers: { cookie: expiringCookie } })).status, 401);
    assert.equal((await fetch(`${base}/catalog/seller/products`, {
      headers: { cookie: expiringCookie, 'x-role': 'seller' },
    })).status, 401);
    assert.equal((await fetch(`${base}/catalog/admin/proposals`, {
      headers: { cookie: expiringCookie, 'x-role': 'admin' },
    })).status, 401);
  } finally {
    if (app) await app.close();
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
