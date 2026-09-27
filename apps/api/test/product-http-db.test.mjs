import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { AuthRepository } from '../src/auth/repository.ts';

test('seller draft HTTP persists only its verified seller scope and stays unpublished', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = randomUUID().slice(0, 8);
  const email = `qa+${randomUUID()}@example.invalid`;
  const password = 'test-only-password-12345';
  let accountId;
  let sellerCategoryId;
  let sellerA;
  let sellerB;
  let majorId;
  let minorId;
  let productId;
  let app;
  try {
    accountId = await new AuthRepository(pool).createCustomerAccount(email, password);
    sellerCategoryId = (await pool.query('INSERT INTO seller_categories (name) VALUES ($1) RETURNING id', [`qa-${suffix}-group`])).rows[0].id;
    sellerA = (await pool.query('INSERT INTO sellers (category_id,display_name) VALUES ($1,$2) RETURNING id', [sellerCategoryId, `qa-${suffix}-a`])).rows[0].id;
    sellerB = (await pool.query('INSERT INTO sellers (category_id,display_name) VALUES ($1,$2) RETURNING id', [sellerCategoryId, `qa-${suffix}-b`])).rows[0].id;
    for (const sellerId of [sellerA, sellerB]) {
      await pool.query('INSERT INTO account_roles (account_id,role,seller_id) VALUES ($1,$2,$3)', [accountId, 'seller', sellerId]);
    }
    majorId = (await pool.query('INSERT INTO product_categories (name) VALUES ($1) RETURNING id', [`qa-${suffix}-major`])).rows[0].id;
    minorId = (await pool.query('INSERT INTO product_categories (parent_id,name) VALUES ($1,$2) RETURNING id', [majorId, `qa-${suffix}-minor`])).rows[0].id;
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const origin = 'http://127.0.0.1:9091';
    const login = async (role, sellerId) => {
      const response = await fetch(`${base}/auth/login`, { method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, role, sellerId }),
      });
      assert.equal(response.status, 201);
      return response.headers.get('set-cookie').split(';')[0];
    };
    const customerCookie = await login('customer');
    const sellerCookieA = await login('seller', sellerA);
    const sellerCookieB = await login('seller', sellerB);
    const input = { categoryId: minorId, title: '시험 마늘', description: '가상 상품',
      originLabel: '전국 산지', shippingMode: 'owool_fulfillment', options: [{ name: '1kg', priceWon: 20000 }] };
    const create = (cookie, body = input, requestOrigin = origin) => fetch(`${base}/catalog/seller/products`, {
      method: 'POST', headers: { cookie, origin: requestOrigin, 'x-role': 'admin', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal((await create(customerCookie)).status, 403);
    assert.equal((await create(sellerCookieA, input, 'https://untrusted.invalid')).status, 403);
    assert.equal((await create(sellerCookieA, { ...input, categoryId: majorId })).status, 400);
    const response = await create(sellerCookieA);
    assert.equal(response.status, 201);
    const created = await response.json();
    productId = created.productId;
    const editUrl = `${base}/catalog/seller/products/${productId}/revisions/${created.revisionId}`;
    assert.equal((await fetch(editUrl, { headers: { cookie: sellerCookieB } })).status, 403);
    const editableResponse = await fetch(editUrl, { headers: { cookie: sellerCookieA } });
    assert.equal(editableResponse.status, 200);
    assert.equal((await editableResponse.json()).title, '시험 마늘');
    const edit = (cookie, requestOrigin = origin) => fetch(
      editUrl, {
        method: 'PATCH', headers: { cookie, origin: requestOrigin, 'content-type': 'application/json' },
        body: JSON.stringify({ ...input, title: '수정 마늘', options: [{ name: '1kg', priceWon: 21000 }] }),
      });
    assert.equal((await edit(customerCookie)).status, 403);
    assert.equal((await edit(sellerCookieB)).status, 403);
    assert.equal((await edit(sellerCookieA, 'https://untrusted.invalid')).status, 403);
    assert.equal((await edit(sellerCookieA)).status, 200);
    assert.equal((await pool.query('SELECT title FROM product_revisions WHERE id=$1', [created.revisionId])).rows[0].title,
      '수정 마늘');
    assert.equal((await pool.query('SELECT seller_id FROM products WHERE id=$1', [productId])).rows[0].seller_id, sellerA);
    const listingA = await fetch(`${base}/catalog/seller/products`, { headers: { cookie: sellerCookieA } });
    assert.equal(listingA.status, 200);
    assert.ok((await listingA.json()).some((item) => item.productId === productId));
    const listingB = await fetch(`${base}/catalog/seller/products`, { headers: { cookie: sellerCookieB } });
    assert.equal(listingB.status, 200);
    assert.ok(!(await listingB.json()).some((item) => item.productId === productId));
    assert.equal((await fetch(`${base}/catalog/seller/products`, { headers: { cookie: customerCookie } })).status, 403);
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM product_publications WHERE product_id=$1', [productId])).rows[0].total, 0);
  } finally {
    if (app) await app.close();
    if (accountId) await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [accountId]);
    if (productId) {
      await pool.query('DELETE FROM product_options WHERE revision_id IN (SELECT id FROM product_revisions WHERE product_id=$1)', [productId]);
      await pool.query('DELETE FROM product_revisions WHERE product_id=$1', [productId]);
      await pool.query('DELETE FROM products WHERE id=$1', [productId]);
    }
    if (accountId) {
      await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
    }
    if (minorId) await pool.query('DELETE FROM product_categories WHERE id=$1', [minorId]);
    if (majorId) await pool.query('DELETE FROM product_categories WHERE id=$1', [majorId]);
    if (sellerB) await pool.query('DELETE FROM sellers WHERE id=$1', [sellerB]);
    if (sellerA) await pool.query('DELETE FROM sellers WHERE id=$1', [sellerA]);
    if (sellerCategoryId) await pool.query('DELETE FROM seller_categories WHERE id=$1', [sellerCategoryId]);
    if (accountId) {
      await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    }
    await pool.end();
  }
});
