import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { AuthRepository } from '../src/auth/repository.ts';
import { PublicProducts } from '../src/catalog/public-products.ts';
import { ProductSaleStops } from '../src/catalog/product-sale-stops.ts';

test('seller stop requests wait for operator; rejection preserves sale and approval blocks new sale without deleting history', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const tag = randomUUID().slice(0, 8);
  const accounts = [];
  let sellerCategoryId; let sellerId; let otherSellerId; let majorId; let minorId;
  let productId; let revisionId; let optionId; let replacementRevisionId; let replacementOptionId;
  let app;
  try {
    const auth = new AuthRepository(pool);
    for (let i = 0; i < 3; i++) accounts.push(await auth.createCustomerAccount(
      `qa+${randomUUID()}@example.invalid`, 'test-only-password-12345'));
    sellerCategoryId = (await pool.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id', [`qa-${tag}-group`])).rows[0].id;
    sellerId = (await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [sellerCategoryId, `qa-${tag}-seller`])).rows[0].id;
    otherSellerId = (await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [sellerCategoryId, `qa-${tag}-other`])).rows[0].id;
    await pool.query('INSERT INTO account_roles(account_id,role,seller_id) VALUES ($1,$2,$3),($4,$2,$5)',
      [accounts[0], 'seller', sellerId, accounts[1], otherSellerId]);
    await pool.query('INSERT INTO account_roles(account_id,role) VALUES ($1,$2)', [accounts[2], 'admin']);
    majorId = (await pool.query('INSERT INTO product_categories(name) VALUES ($1) RETURNING id', [`qa-${tag}-major`])).rows[0].id;
    minorId = (await pool.query('INSERT INTO product_categories(parent_id,name) VALUES ($1,$2) RETURNING id',
      [majorId, `qa-${tag}-minor`])).rows[0].id;
    productId = (await pool.query('INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
      [sellerId, minorId])).rows[0].id;
    revisionId = (await pool.query(`INSERT INTO product_revisions
      (product_id,version,title,description,origin_label,shipping_mode,status,proposed_by_account_id)
      VALUES ($1,1,$2,'QA 설명','전국','seller_direct','approved',$3) RETURNING id`,
      [productId, `qa-${tag}-고추`, accounts[0]])).rows[0].id;
    optionId = (await pool.query('INSERT INTO product_options(revision_id,name,price_won) VALUES ($1,$2,$3) RETURNING id',
      [revisionId, '500g', 23000])).rows[0].id;
    await pool.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,5,5)', [optionId]);
    await pool.query('INSERT INTO product_publications(product_id,revision_id,published_by_account_id) VALUES ($1,$2,$3)',
      [productId, revisionId, accounts[2]]);
    const seller = { accountId: accounts[0], role: 'seller', sellerId };
    const other = { accountId: accounts[1], role: 'seller', sellerId: otherSellerId };
    const admin = { accountId: accounts[2], role: 'admin' };
    const stops = new ProductSaleStops(pool);
    const publicProducts = new PublicProducts(pool);
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const origin = 'http://127.0.0.1:9091';
    async function cookieFor(index, role) {
      const email = (await pool.query('SELECT identifier FROM account_identities WHERE account_id=$1 AND kind=$2',
        [accounts[index], 'email'])).rows[0].identifier;
      const response = await fetch(`${base}/auth/login`, { method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'test-only-password-12345', role }),
      });
      assert.equal(response.status, 201);
      return response.headers.get('set-cookie').split(';')[0];
    }
    const sellerCookie = await cookieFor(0, 'seller');
    const otherCookie = await cookieFor(1, 'seller');
    const adminCookie = await cookieFor(2, 'admin');
    const stopUrl = `${base}/catalog/seller/products/${productId}/sale-stop-requests`;
    assert.equal((await fetch(stopUrl, { method: 'POST', headers: { origin,
      'content-type': 'application/json' }, body: JSON.stringify({ reason: '중단' }) })).status, 401);
    assert.equal((await fetch(stopUrl, { method: 'POST', headers: { origin: 'https://untrusted.invalid',
      cookie: sellerCookie, 'content-type': 'application/json' }, body: JSON.stringify({ reason: '중단' }) })).status, 403);
    assert.equal((await fetch(stopUrl, { method: 'POST', headers: { origin, cookie: otherCookie,
      'content-type': 'application/json' }, body: JSON.stringify({ reason: '중단' }) })).status, 403);
    assert.equal((await publicProducts.get(productId)).options[0].sellableQuantity, 5);
    assert.deepEqual((await publicProducts.list({ query: `qa-${tag}-고추` })).map((p) => p.productId), [productId]);
    await assert.rejects(stops.request(other, productId, '판매 중단'), /Forbidden/);
    await assert.rejects(stops.request(admin, productId, '판매 중단'), /Forbidden/);
    await assert.rejects(stops.request(seller, productId, ' '), /Stop reason required/);
    const first = await stops.request(seller, productId, '첫 요청');
    assert.equal(first.status, 'pending');
    await assert.rejects(stops.request(seller, productId, '중복 요청'), /Pending stop request exists/);
    assert.equal((await publicProducts.get(productId)).options[0].sellableQuantity, 5);
    assert.equal((await stops.listPending(admin))[0].id, first.requestId);
    assert.equal((await fetch(`${base}/catalog/admin/sale-stop-requests`,
      { headers: { cookie: sellerCookie } })).status, 403);
    assert.equal((await fetch(`${base}/catalog/admin/sale-stop-requests`,
      { headers: { cookie: adminCookie } })).status, 200);
    assert.deepEqual((await stops.listOwn(seller)).map((r) => r.status), ['pending']);
    await assert.rejects(stops.approve(seller, first.requestId), /Forbidden/);
    assert.equal((await fetch(`${base}/catalog/admin/sale-stop-requests/${first.requestId}/reject`, {
      method: 'POST', headers: { origin, cookie: adminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: '계속 판매' }),
    })).status, 201);
    await assert.rejects(stops.approve(admin, first.requestId), /Pending stop request required/);
    assert.equal((await publicProducts.get(productId)).options[0].sellableQuantity, 5);
    const concurrentRequests = await Promise.all(Array.from({ length: 2 }, () => fetch(stopUrl, {
      method: 'POST', headers: { origin, cookie: sellerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: '재요청' }),
    })));
    assert.deepEqual(concurrentRequests.map((response) => response.status).sort(), [201, 409]);
    const second = await concurrentRequests.find((response) => response.status === 201).json();
    assert.equal((await stops.listPending(admin)).length, 1);
    assert.equal((await fetch(`${base}/catalog/admin/sale-stop-requests/${second.requestId}/approve`, {
      method: 'POST', headers: { origin, cookie: adminCookie },
    })).status, 201);
    await assert.rejects(stops.approve(admin, second.requestId), /Pending stop request required/);
    await assert.rejects(stops.request(seller, productId, '다시 중단'), /Sale already stopped/);
    assert.deepEqual(await publicProducts.list({ query: `qa-${tag}-고추` }), []);
    assert.deepEqual(await (await fetch(`${base}/catalog/products?q=qa-${tag}-고추`)).json(), []);
    assert.equal((await (await fetch(`${base}/catalog/products/${productId}`)).json()).saleStopped, true);
    const stopped = await publicProducts.get(productId);
    assert.equal(stopped.saleStopped, true);
    assert.equal(stopped.options[0].sellableQuantity, 0);
    assert.equal((await pool.query('SELECT sellable_quantity FROM inventory_levels WHERE option_id=$1', [optionId])).rows[0].sellable_quantity, 5);
    assert.equal((await pool.query('SELECT revision_id FROM product_publications WHERE product_id=$1', [productId])).rows[0].revision_id, revisionId);
    await pool.query('UPDATE inventory_levels SET on_hand_quantity=9,sellable_quantity=9 WHERE option_id=$1', [optionId]);
    assert.equal((await publicProducts.get(productId)).options[0].sellableQuantity, 0);
    assert.deepEqual(await publicProducts.list({ query: `qa-${tag}-고추` }), []);
    replacementRevisionId = (await pool.query(`INSERT INTO product_revisions
      (product_id,version,title,description,origin_label,shipping_mode,status,proposed_by_account_id)
      VALUES ($1,2,$2,'수정 설명','전국','seller_direct','approved',$3) RETURNING id`,
    [productId, `qa-${tag}-고추 수정`, accounts[0]])).rows[0].id;
    replacementOptionId = (await pool.query('INSERT INTO product_options(revision_id,name,price_won) VALUES ($1,$2,$3) RETURNING id',
      [replacementRevisionId, '500g', 25000])).rows[0].id;
    await pool.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,10,10)',
      [replacementOptionId]);
    await pool.query('UPDATE product_publications SET revision_id=$2 WHERE product_id=$1',
      [productId, replacementRevisionId]);
    const revisedStopped = await publicProducts.get(productId);
    assert.equal(revisedStopped.revisionId, replacementRevisionId);
    assert.equal(revisedStopped.saleStopped, true);
    assert.equal(revisedStopped.options[0].priceWon, 25000);
    assert.equal(revisedStopped.options[0].sellableQuantity, 0);
    assert.deepEqual(await publicProducts.list({ query: `qa-${tag}-고추` }), []);
    assert.deepEqual((await stops.listOwn(seller)).map((r) => r.status), ['approved', 'rejected']);
    assert.equal((await stops.listOwn(other)).length, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM audit_events WHERE target_id=ANY($1::text[])',
      [[first.requestId, second.requestId]])).rows[0].n, 4);
  } finally {
    if (app) await app.close();
    if (productId) await pool.query('DELETE FROM product_sale_stop_requests WHERE product_id=$1', [productId]);
    if (productId) await pool.query('DELETE FROM product_publications WHERE product_id=$1', [productId]);
    if (accounts.length) await pool.query('DELETE FROM audit_events WHERE actor_account_id=ANY($1::uuid[])', [accounts]);
    if (optionId) await pool.query('DELETE FROM inventory_levels WHERE option_id=$1', [optionId]);
    if (replacementOptionId) await pool.query('DELETE FROM inventory_levels WHERE option_id=$1', [replacementOptionId]);
    if (optionId) await pool.query('DELETE FROM product_options WHERE id=$1', [optionId]);
    if (replacementOptionId) await pool.query('DELETE FROM product_options WHERE id=$1', [replacementOptionId]);
    if (revisionId) await pool.query('DELETE FROM product_revisions WHERE id=$1', [revisionId]);
    if (replacementRevisionId) await pool.query('DELETE FROM product_revisions WHERE id=$1', [replacementRevisionId]);
    if (productId) await pool.query('DELETE FROM products WHERE id=$1', [productId]);
    if (minorId) await pool.query('DELETE FROM product_categories WHERE id=$1', [minorId]);
    if (majorId) await pool.query('DELETE FROM product_categories WHERE id=$1', [majorId]);
    for (const accountId of accounts) {
      await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    }
    if (sellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [sellerId]);
    if (otherSellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [otherSellerId]);
    if (sellerCategoryId) await pool.query('DELETE FROM seller_categories WHERE id=$1', [sellerCategoryId]);
    await pool.end();
  }
});
