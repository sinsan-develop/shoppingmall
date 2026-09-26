import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { AuthRepository } from '../src/auth/repository.ts';

const origin = 'http://127.0.0.1:9091';

test('customer HTTP saves only the signed-in account profile and records a deletion request', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const auth = new AuthRepository(pool);
  const email = `qa+${randomUUID()}@example.invalid`;
  const password = 'test-only-password-12345';
  let accountId;
  let app;
  try {
    accountId = await auth.createCustomerAccount(email, password);
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 201);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    const headers = { cookie, origin, 'content-type': 'application/json' };
    const defaultPreferences = await fetch(`${base}/customer/preferences`, { headers });
    assert.deepEqual(await defaultPreferences.json(), { marketingEmail: false, marketingSms: false, push: false });
    const add = await fetch(`${base}/customer/addresses`, {
      method: 'POST', headers,
      body: JSON.stringify({ label: '집', recipientName: '가상고객', phone: '010-0000-1234',
        postalCode: '00000', line1: '가상 주소', line2: '', isDefault: true }),
    });
    assert.equal(add.status, 201);
    const listed = await fetch(`${base}/customer/addresses`, { headers });
    assert.equal((await listed.json()).length, 1);
    const invalid = await fetch(`${base}/customer/addresses`, {
      method: 'POST', headers, body: JSON.stringify({ label: '불완전' }),
    });
    assert.equal(invalid.status, 400);
    const consent = await fetch(`${base}/customer/preferences`, {
      method: 'PUT', headers,
      body: JSON.stringify({ marketingEmail: true, marketingSms: false, push: false }),
    });
    assert.equal(consent.status, 200);
    assert.equal((await (await fetch(`${base}/customer/preferences`, { headers })).json()).marketingEmail, true);
    const request = await fetch(`${base}/customer/deletion-request`, { method: 'POST', headers });
    assert.equal(request.status, 201);
    assert.equal((await request.json()).status, 'requested');
    const duplicate = await fetch(`${base}/customer/deletion-request`, { method: 'POST', headers });
    assert.equal(duplicate.status, 409);
  } finally {
    if (app) await app.close();
    if (accountId) {
      for (const table of ['customer_addresses', 'notification_preferences', 'account_deletion_requests',
        'audit_events', 'auth_sessions', 'account_roles', 'account_identities']) {
        await pool.query(`DELETE FROM ${table} WHERE ${table === 'audit_events' ? 'actor_account_id' : 'account_id'} = $1`, [accountId]);
      }
      await pool.query('DELETE FROM accounts WHERE id = $1', [accountId]);
    }
    await pool.end();
  }
});
