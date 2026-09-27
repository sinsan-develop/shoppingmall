import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { AuthRepository } from '../src/auth/repository.ts';

test('HTTP shipping proposals stay seller-scoped and become public only after an operator decision', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = randomUUID().slice(0, 8);
  const password = 'test-only-password-12345';
  let sellerAccountId;
  let adminAccountId;
  let sellerCategoryId;
  let sellerA;
  let sellerB;
  let app;
  try {
    const auth = new AuthRepository(pool);
    sellerAccountId = await auth.createCustomerAccount(`qa+${randomUUID()}@example.invalid`, password);
    adminAccountId = await auth.createCustomerAccount(`qa+${randomUUID()}@example.invalid`, password);
    sellerCategoryId = (await pool.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id',
      [`qa-${suffix}-group`])).rows[0].id;
    sellerA = (await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [sellerCategoryId, `qa-${suffix}-a`])).rows[0].id;
    sellerB = (await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [sellerCategoryId, `qa-${suffix}-b`])).rows[0].id;
    await pool.query('INSERT INTO account_roles(account_id,role,seller_id) VALUES ($1,$2,$3)',
      [sellerAccountId, 'seller', sellerA]);
    await pool.query('INSERT INTO account_roles(account_id,role) VALUES ($1,$2)', [adminAccountId, 'admin']);
    const email = async (accountId) => (await pool.query(
      'SELECT identifier FROM account_identities WHERE account_id=$1 AND kind=$2', [accountId, 'email'],
    )).rows[0].identifier;
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}/shipping`;
    const origin = 'http://127.0.0.1:9091';
    const login = async (accountId, role) => {
      const response = await fetch(`http://127.0.0.1:${app.getHttpServer().address().port}/auth/login`, {
        method: 'POST', headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email: await email(accountId), password, role }),
      });
      assert.equal(response.status, 201);
      return response.headers.get('set-cookie').split(';')[0];
    };
    const sellerCookie = await login(sellerAccountId, 'seller');
    const adminCookie = await login(adminAccountId, 'admin');
    const sellerUrl = `${base}/sellers/${sellerA}/policy`;
    const initial = await fetch(sellerUrl);
    assert.equal(initial.status, 200);
    assert.equal((await initial.json()).policy.feeWon, 3000);
    const proposal = { feeWon: 2000, freeThresholdWon: 60000, cutoffTime: '15:30', blockedPostalRanges: [] };
    const submit = (requestOrigin) => fetch(`${base}/seller/requests`, { method: 'POST',
      headers: { cookie: sellerCookie, origin: requestOrigin, 'content-type': 'application/json' },
      body: JSON.stringify({ policy: proposal, sellerId: sellerB }),
    });
    assert.equal((await submit('https://untrusted.invalid')).status, 403);
    assert.equal((await submit(origin)).status, 201);
    assert.equal((await (await fetch(sellerUrl)).json()).policy.feeWon, 3000);
    assert.equal((await (await fetch(`${base}/sellers/${sellerB}/policy`)).json()).policy.feeWon, 3000);
    const own = await fetch(`${base}/seller/requests`, { headers: { cookie: sellerCookie } });
    assert.equal(own.status, 200);
    assert.equal((await own.json()).length, 1);
    assert.equal((await fetch(`${base}/admin/requests`, { headers: { cookie: sellerCookie } })).status, 403);
    const pending = await fetch(`${base}/admin/requests`, { headers: { cookie: adminCookie } });
    assert.equal(pending.status, 200);
    const requestId = (await pending.json()).find((item) => item.sellerId === sellerA)?.id;
    assert.match(requestId, /^[0-9a-f-]{36}$/);
    assert.equal((await fetch(`${base}/admin/requests/${requestId}/approve`, {
      method: 'POST', headers: { cookie: sellerCookie, origin },
    })).status, 403);
    assert.equal((await fetch(`${base}/admin/requests/${requestId}/approve`, {
      method: 'POST', headers: { cookie: adminCookie, origin },
    })).status, 201);
    assert.equal((await (await fetch(sellerUrl)).json()).policy.feeWon, 2000);
    assert.equal((await (await fetch(`${base}/sellers/${sellerB}/policy`)).json()).policy.feeWon, 3000);
    assert.equal((await fetch(`${base}/admin/requests/${requestId}/approve`, {
      method: 'POST', headers: { cookie: adminCookie, origin },
    })).status, 409);
  } finally {
    if (app) await app.close();
    if (adminAccountId && sellerAccountId) await pool.query(
      'DELETE FROM audit_events WHERE actor_account_id = ANY($1::uuid[])', [[sellerAccountId, adminAccountId]],
    );
    if (sellerA) await pool.query('DELETE FROM seller_shipping_policies WHERE seller_id=$1', [sellerA]);
    if (sellerA) await pool.query('DELETE FROM seller_shipping_policy_requests WHERE seller_id=$1', [sellerA]);
    for (const accountId of [sellerAccountId, adminAccountId]) {
      if (!accountId) continue;
      await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
    }
    for (const sellerId of [sellerB, sellerA]) {
      if (sellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [sellerId]);
    }
    if (sellerCategoryId) await pool.query('DELETE FROM seller_categories WHERE id=$1', [sellerCategoryId]);
    for (const accountId of [sellerAccountId, adminAccountId]) {
      if (!accountId) continue;
      await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    }
    await pool.end();
  }
});
