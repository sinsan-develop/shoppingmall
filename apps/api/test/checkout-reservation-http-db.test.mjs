import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { AuthRepository } from '../src/auth/repository.ts';

test('checkout reservation HTTP enforces customer ownership, idempotency and admin cancellation', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const ids = { accounts: [] };
  const tag = randomUUID().slice(0, 8);
  const password = 'test-only-password-12345';
  const origin = 'http://127.0.0.1:9091';
  let app;
  try {
    const auth = new AuthRepository(pool);
    const emails = [];
    for (const role of ['customer', 'other', 'seller', 'admin']) {
      const email = `qa+${tag}-${role}@example.invalid`;
      emails.push(email);
      ids.accounts.push(await auth.createCustomerAccount(email, password));
    }
    ids.sellerCategory = (await pool.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id',
      [`qa-${tag}-seller-category`])).rows[0].id;
    ids.seller = (await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [ids.sellerCategory, `qa-${tag}-seller`])).rows[0].id;
    await pool.query('INSERT INTO account_roles(account_id,role,seller_id) VALUES ($1,$2,$3)',
      [ids.accounts[2], 'seller', ids.seller]);
    await pool.query('INSERT INTO account_roles(account_id,role) VALUES ($1,$2)', [ids.accounts[3], 'admin']);
    ids.category = (await pool.query('INSERT INTO product_categories(name) VALUES ($1) RETURNING id',
      [`qa-${tag}-category`])).rows[0].id;
    ids.product = (await pool.query('INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
      [ids.seller, ids.category])).rows[0].id;
    ids.revision = (await pool.query(
      `INSERT INTO product_revisions(product_id,version,title,description,origin_label,
       shipping_mode,status,proposed_by_account_id,reviewed_by_account_id,reviewed_at)
       VALUES ($1,1,$2,'QA 설명','QA 산지','seller_direct','approved',$3,$4,now()) RETURNING id`,
      [ids.product, `qa-${tag}-고추`, ids.accounts[2], ids.accounts[3]])).rows[0].id;
    ids.option = (await pool.query('INSERT INTO product_options(revision_id,name,price_won) VALUES ($1,$2,23000) RETURNING id',
      [ids.revision, '500g'])).rows[0].id;
    await pool.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,1,1)',
      [ids.option]);
    await pool.query('INSERT INTO product_publications(product_id,revision_id,published_by_account_id) VALUES ($1,$2,$3)',
      [ids.product, ids.revision, ids.accounts[3]]);
    await pool.query('INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,1)',
      [ids.accounts[0], ids.option]);
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    async function cookie(index, role) {
      const response = await fetch(`${base}/auth/login`, { method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email: emails[index], password, role }) });
      assert.equal(response.status, 201);
      return response.headers.get('set-cookie').split(';')[0];
    }
    const customer = await cookie(0, 'customer');
    const customerElsewhere = await cookie(0, 'customer');
    const other = await cookie(1, 'customer');
    const seller = await cookie(2, 'seller');
    const admin = await cookie(3, 'admin');
    const url = `${base}/customer/checkout/reservations`;
    const activeUrl = `${url}/active`;
    const key = randomUUID();
    const start = (cookieValue, keyValue, requestOrigin = origin) => fetch(url, {
      method: 'POST', headers: { origin: requestOrigin, cookie: cookieValue,
        'idempotency-key': keyValue },
    });
    assert.equal((await fetch(activeUrl)).status, 401);
    assert.equal((await fetch(activeUrl, { headers: { cookie: seller } })).status, 403);
    assert.equal((await fetch(activeUrl, { headers: { cookie: customer } })).status, 404);
    // A quote failure must not leave an undiscoverable active hold behind.
    ids.invalidPolicyRequest = (await pool.query(
      `INSERT INTO seller_shipping_policy_requests(seller_id,policy,status,requested_by_account_id,
       decided_by_account_id,decided_at) VALUES ($1,$2::jsonb,'approved',$3,$3,now()) RETURNING id`,
      [ids.seller, JSON.stringify({ feeWon: -1 }), ids.accounts[3]],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO seller_shipping_policies(seller_id,policy,approved_request_id,approved_by_account_id)
       VALUES ($1,$2::jsonb,$3,$4)`,
      [ids.seller, JSON.stringify({ feeWon: -1 }), ids.invalidPolicyRequest, ids.accounts[3]],
    );
    const failedKey = randomUUID();
    assert.equal((await start(customer, failedKey)).status, 500);
    assert.equal((await pool.query(
      `SELECT count(*)::int AS count FROM checkout_reservations WHERE account_id=$1 AND status='ACTIVE'`,
      [ids.accounts[0]],
    )).rows[0].count, 0, 'failed quote must roll back the new reservation');
    await pool.query('DELETE FROM seller_shipping_policies WHERE seller_id=$1', [ids.seller]);
    await pool.query('DELETE FROM seller_shipping_policy_requests WHERE id=$1', [ids.invalidPolicyRequest]);
    ids.invalidPolicyRequest = null;
    const recovered = await start(customer, failedKey);
    assert.equal(recovered.status, 201);
    const recoveredHold = await recovered.json();
    assert.equal(recoveredHold.quote.totalWon, 26000);
    assert.equal((await fetch(`${url}/${recoveredHold.id}`, {
      method: 'DELETE', headers: { cookie: customer, origin },
    })).status, 200);
    assert.equal((await start('', key)).status, 401);
    assert.equal((await start(seller, key)).status, 403);
    assert.equal((await start(customer, key, 'https://untrusted.invalid')).status, 403);
    assert.equal((await start(customer, 'not-a-uuid')).status, 400);
    const started = await start(customer, key);
    assert.equal(started.status, 201);
    const hold = await started.json();
    assert.match(hold.id, /^[0-9a-f-]{36}$/i);
    assert.equal(hold.status, 'ACTIVE');
    assert.deepEqual({ goodsWon: hold.quote.goodsWon, shippingWon: hold.quote.shippingWon },
      { goodsWon: 23000, shippingWon: 3000 });
    assert.equal((await fetch(activeUrl, { headers: { cookie: other } })).status, 404);
    const discovered = await fetch(activeUrl, { headers: { cookie: customerElsewhere } });
    assert.equal(discovered.status, 200);
    const discoveredHold = await discovered.json();
    assert.equal(discoveredHold.id, hold.id);
    assert.equal(discoveredHold.expiresAt, hold.expiresAt);
    assert.equal(discoveredHold.quote.totalWon, 26000);
    const cartItem = `${base}/customer/cart/items/${ids.option}`;
    assert.equal((await fetch(cartItem, { method: 'DELETE', headers: { cookie: customer, origin } })).status, 409);
    assert.equal((await fetch(cartItem, { method: 'PUT', headers: {
      cookie: customer, origin, 'content-type': 'application/json' }, body: JSON.stringify({ quantity: 1 }),
    })).status, 409);
    assert.equal((await (await start(customer, key)).json()).id, hold.id);
    assert.equal((await start(customer, randomUUID())).status, 409);
    const item = `${url}/${hold.id}`;
    assert.equal((await fetch(item, { headers: { cookie: other } })).status, 404);
    assert.equal((await fetch(item, { method: 'DELETE', headers: { cookie: other, origin } })).status, 404);
    assert.equal((await fetch(item, { headers: { cookie: seller } })).status, 403);
    assert.equal((await fetch(item, { headers: { cookie: customer } })).status, 200);
    assert.equal((await fetch(item, { method: 'DELETE', headers: {
      cookie: customer, origin: 'https://untrusted.invalid' } })).status, 403);
    const cancelUrl = `${base}/checkout/admin/reservations/${hold.id}/cancel`;
    const cancel = (cookieValue, reason, requestOrigin = origin) => fetch(cancelUrl, {
      method: 'POST', headers: { origin: requestOrigin, cookie: cookieValue,
        'content-type': 'application/json' }, body: JSON.stringify({ reason }),
    });
    assert.equal((await cancel(seller, '출고 불가')).status, 403);
    assert.equal((await cancel(admin, '출고 불가', 'https://untrusted.invalid')).status, 403);
    assert.equal((await cancel(admin, '')).status, 400);
    assert.equal((await cancel(admin, 'x'.repeat(501))).status, 400);
    const cancelled = await cancel(admin, 'QA 출고 불가');
    assert.equal(cancelled.status, 201);
    assert.equal((await cancelled.json()).status, 'CANCELLED');
    assert.equal((await fetch(activeUrl, { headers: { cookie: customerElsewhere } })).status, 404);
    const own = await (await fetch(item, { headers: { cookie: customer } })).json();
    assert.equal(own.status, 'CANCELLED');
    assert.match(own.endReason, /QA 출고 불가/);
    assert.equal((await (await start(customer, key)).json()).status, 'CANCELLED');
    assert.equal((await (await fetch(item, { method: 'DELETE', headers: { cookie: customer, origin } })).json()).status,
      'CANCELLED');
    assert.equal((await fetch(`${url}/${randomUUID()}`, { headers: { cookie: customer } })).status, 404);
    const next = await (await start(customer, randomUUID())).json();
    assert.equal(next.status, 'ACTIVE');
    await pool.query(
      `UPDATE checkout_reservations SET created_at=clock_timestamp()-interval '16 minutes',
       expires_at=clock_timestamp()-interval '1 second'
       WHERE id=$1`, [next.id]);
    const { CheckoutCatalog } = await import('../src/checkout/catalog-selection.ts');
    assert.equal((await new CheckoutCatalog(pool).resolve([
      { optionId: ids.option, quantity: 1 },
    ])).length, 1, 'an overdue ACTIVE row must not hold sellable stock while the worker is stopped');
    const { expireReservationBatch } = await import('../src/checkout/reservation-cleanup.ts');
    assert.equal(await expireReservationBatch(pool, 100), 1);
    assert.equal(await expireReservationBatch(pool, 100), 0);
    assert.equal((await (await fetch(`${url}/${next.id}`, { headers: { cookie: customer } })).json()).status,
      'EXPIRED');
    const dueOnDiscovery = await (await start(customerElsewhere, randomUUID())).json();
    await pool.query(
      `UPDATE checkout_reservations SET created_at=clock_timestamp()-interval '16 minutes',
       expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`, [dueOnDiscovery.id]);
    assert.equal((await fetch(activeUrl, { headers: { cookie: customer } })).status, 404);
    assert.equal((await pool.query('SELECT status FROM checkout_reservations WHERE id=$1',
      [dueOnDiscovery.id])).rows[0].status, 'EXPIRED');
  } finally {
    if (app) await app.close();
    for (const id of ids.accounts) {
      await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [id]);
      await pool.query('DELETE FROM customer_cart_items WHERE account_id=$1', [id]);
      await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id IN (SELECT id FROM checkout_reservations WHERE account_id=$1)', [id]);
      await pool.query('DELETE FROM checkout_reservations WHERE account_id=$1', [id]);
    }
    if (ids.product) await pool.query('DELETE FROM product_publications WHERE product_id=$1', [ids.product]);
    if (ids.seller) await pool.query('DELETE FROM seller_shipping_policies WHERE seller_id=$1', [ids.seller]);
    if (ids.invalidPolicyRequest) await pool.query('DELETE FROM seller_shipping_policy_requests WHERE id=$1',
      [ids.invalidPolicyRequest]);
    if (ids.option) await pool.query('DELETE FROM inventory_levels WHERE option_id=$1', [ids.option]);
    if (ids.option) await pool.query('DELETE FROM product_options WHERE id=$1', [ids.option]);
    if (ids.revision) await pool.query('DELETE FROM product_revisions WHERE id=$1', [ids.revision]);
    if (ids.product) await pool.query('DELETE FROM products WHERE id=$1', [ids.product]);
    if (ids.category) await pool.query('DELETE FROM product_categories WHERE id=$1', [ids.category]);
    for (const id of ids.accounts) {
      await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [id]);
      await pool.query('DELETE FROM account_roles WHERE account_id=$1', [id]);
      await pool.query('DELETE FROM account_identities WHERE account_id=$1', [id]);
    }
    if (ids.seller) await pool.query('DELETE FROM sellers WHERE id=$1', [ids.seller]);
    if (ids.sellerCategory) await pool.query('DELETE FROM seller_categories WHERE id=$1', [ids.sellerCategory]);
    for (const id of ids.accounts) await pool.query('DELETE FROM accounts WHERE id=$1', [id]);
    await pool.end();
  }
});

test('reservation endpoints report 503 when the database is not configured', async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  let app;
  try {
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const headers = { cookie: 'sm_session=test-only-invalid-session', origin: 'http://127.0.0.1:9091' };
    assert.equal((await fetch(`${base}/customer/checkout/reservations/${randomUUID()}`,
      { headers })).status, 503);
    assert.equal((await fetch(`${base}/customer/checkout/reservations`, { method: 'POST',
      headers: { ...headers, 'idempotency-key': randomUUID() } })).status, 503);
    assert.equal((await fetch(`${base}/customer/checkout/reservations/active`, { headers })).status, 503);
    assert.equal((await fetch(`${base}/checkout/admin/reservations/${randomUUID()}/cancel`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'QA 사유' }),
    })).status, 503);
  } finally {
    if (app) await app.close();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
