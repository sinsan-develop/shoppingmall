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
    const other = await cookie(1, 'customer');
    const seller = await cookie(2, 'seller');
    const admin = await cookie(3, 'admin');
    const url = `${base}/customer/checkout/reservations`;
    const key = randomUUID();
    const start = (cookieValue, keyValue, requestOrigin = origin) => fetch(url, {
      method: 'POST', headers: { origin: requestOrigin, cookie: cookieValue,
        'idempotency-key': keyValue },
    });
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
      `UPDATE checkout_reservations SET expires_at=clock_timestamp()-interval '1 second'
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
  } finally {
    if (app) await app.close();
    for (const id of ids.accounts) {
      await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [id]);
      await pool.query('DELETE FROM customer_cart_items WHERE account_id=$1', [id]);
      await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id IN (SELECT id FROM checkout_reservations WHERE account_id=$1)', [id]);
      await pool.query('DELETE FROM checkout_reservations WHERE account_id=$1', [id]);
    }
    if (ids.product) await pool.query('DELETE FROM product_publications WHERE product_id=$1', [ids.product]);
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
