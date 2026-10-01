import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { AuthRepository } from '../src/auth/repository.ts';

const origin = 'http://127.0.0.1:9091';

test('customer cart HTTP uses active customer session and trusted Origin, never a caller account ID', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const auth = new AuthRepository(pool);
  const run = randomUUID().slice(0, 8);
  const emailA = `qa+${run}-cart-a@example.invalid`;
  const emailB = `qa+${run}-cart-b@example.invalid`;
  const password = 'test-only-password-12345';
  const ids = {};
  let app;
  try {
    ids.accountA = await auth.createCustomerAccount(emailA, password);
    ids.accountB = await auth.createCustomerAccount(emailB, password);
    ids.sellerCategory = (await pool.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id',
      [`qa-${run}-cart-http`])).rows[0].id;
    ids.seller = (await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [ids.sellerCategory, `qa-${run}-seller`])).rows[0].id;
    await pool.query('INSERT INTO account_roles(account_id,role,seller_id) VALUES ($1,$2,$3)',
      [ids.accountA, 'seller', ids.seller]);
    await pool.query('INSERT INTO account_roles(account_id,role) VALUES ($1,$2)', [ids.accountA, 'admin']);
    ids.major = (await pool.query('INSERT INTO product_categories(name) VALUES ($1) RETURNING id',
      [`qa-${run}-major`])).rows[0].id;
    ids.minor = (await pool.query('INSERT INTO product_categories(parent_id,name) VALUES ($1,$2) RETURNING id',
      [ids.major, `qa-${run}-minor`])).rows[0].id;
    ids.product = (await pool.query('INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
      [ids.seller, ids.minor])).rows[0].id;
    ids.revision = (await pool.query(
      `INSERT INTO product_revisions(product_id,version,title,description,origin_label,shipping_mode,status,
       proposed_by_account_id,reviewed_by_account_id,reviewed_at)
       VALUES ($1,1,$2,'QA 상품','QA 산지','seller_direct','approved',$3,$3,now()) RETURNING id`,
      [ids.product, `qa-${run}-chili`, ids.accountA],
    )).rows[0].id;
    ids.option = (await pool.query(
      'INSERT INTO product_options(revision_id,name,price_won) VALUES ($1,$2,23000) RETURNING id',
      [ids.revision, '500g'],
    )).rows[0].id;
    await pool.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,5,5)',
      [ids.option]);
    await pool.query('INSERT INTO product_publications(product_id,revision_id,published_by_account_id) VALUES ($1,$2,$3)',
      [ids.product, ids.revision, ids.accountA]);

    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    async function cookie(email, role, sellerId) {
      const session = await auth.loginEmail(email, password, role, sellerId);
      return `sm_session=${session.token}`;
    }
    const customerA = await cookie(emailA, 'customer');
    const customerB = await cookie(emailB, 'customer');
    const seller = await cookie(emailA, 'seller', ids.seller);
    const admin = await cookie(emailA, 'admin');
    const path = `${base}/customer/cart`;
    const item = `${path}/items/${ids.option}`;
    const headers = { cookie: customerA, origin, 'content-type': 'application/json' };
    const put = (quantity, requestHeaders = headers) => fetch(item, {
      method: 'PUT', headers: requestHeaders, body: JSON.stringify({ quantity }),
    });

    assert.equal((await fetch(path)).status, 401);
    assert.equal((await fetch(path, { headers: { cookie: seller } })).status, 403);
    assert.equal((await fetch(path, { headers: { cookie: admin } })).status, 403);
    assert.equal((await fetch(path, { headers: { cookie: customerA } })).status, 200);
    assert.equal((await put(2, { ...headers, origin: 'http://invalid.test' })).status, 403);
    assert.equal((await put(0)).status, 400);
    assert.equal((await put(1.5)).status, 400);
    assert.equal((await fetch(`${path}/items/invalid`, { method: 'DELETE', headers })).status, 400);
    assert.equal((await put(2)).status, 200);
    assert.equal((await put(3)).status, 200);
    const own = await (await fetch(path, { headers: { cookie: customerA } })).json();
    assert.deepEqual(own.map(({ optionId, quantity }) => ({ optionId, quantity })),
      [{ optionId: ids.option, quantity: 3 }]);
    assert.deepEqual(await (await fetch(path, { headers: { cookie: customerB } })).json(), []);
    const quote = await (await fetch(`${path}/quote`, { headers: { cookie: customerA } })).json();
    assert.deepEqual({ goodsWon: quote.goodsWon, shippingWon: quote.shippingWon, totalWon: quote.totalWon },
      { goodsWon: 69000, shippingWon: 0, totalWon: 69000 });
    await pool.query('UPDATE inventory_levels SET sellable_quantity=0 WHERE option_id=$1', [ids.option]);
    assert.equal((await fetch(`${path}/quote`, { headers: { cookie: customerA } })).status, 409);
    assert.equal((await fetch(path, { headers: { cookie: customerA } })).status, 200);
    assert.equal((await fetch(item, { method: 'DELETE', headers })).status, 200);
    assert.equal((await fetch(item, { method: 'DELETE', headers })).status, 200);
    assert.deepEqual(await (await fetch(path, { headers: { cookie: customerA } })).json(), []);
  } finally {
    if (app) await app.close();
    if (ids.accountA || ids.accountB) await pool.query('DELETE FROM customer_cart_items WHERE account_id=ANY($1::uuid[])',
      [[ids.accountA, ids.accountB].filter(Boolean)]);
    if (ids.product) await pool.query('DELETE FROM product_publications WHERE product_id=$1', [ids.product]);
    if (ids.option) await pool.query('DELETE FROM inventory_levels WHERE option_id=$1', [ids.option]);
    if (ids.option) await pool.query('DELETE FROM product_options WHERE id=$1', [ids.option]);
    if (ids.revision) await pool.query('DELETE FROM product_revisions WHERE id=$1', [ids.revision]);
    if (ids.product) await pool.query('DELETE FROM products WHERE id=$1', [ids.product]);
    if (ids.minor) await pool.query('DELETE FROM product_categories WHERE id=$1', [ids.minor]);
    if (ids.major) await pool.query('DELETE FROM product_categories WHERE id=$1', [ids.major]);
    if (ids.accountA) await pool.query('DELETE FROM account_roles WHERE account_id=$1 AND role=$2',
      [ids.accountA, 'seller']);
    if (ids.seller) await pool.query('DELETE FROM sellers WHERE id=$1', [ids.seller]);
    if (ids.sellerCategory) await pool.query('DELETE FROM seller_categories WHERE id=$1', [ids.sellerCategory]);
    for (const id of [ids.accountA, ids.accountB]) {
      if (!id) continue;
      await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [id]);
      await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [id]);
      await pool.query('DELETE FROM account_roles WHERE account_id=$1', [id]);
      await pool.query('DELETE FROM account_identities WHERE account_id=$1', [id]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [id]);
    }
    await pool.end();
  }
});
