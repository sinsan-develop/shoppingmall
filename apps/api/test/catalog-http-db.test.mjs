import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { AuthRepository } from '../src/auth/repository.ts';

test('admin HTTP classification registration is scoped, public-readable and audited', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const auth = new AuthRepository(pool);
  const suffix = randomUUID().slice(0, 8);
  const password = 'test-only-password-12345';
  let accountId;
  let app;
  let major;
  let minor;
  let sellerCategory;
  let seller;
  try {
    accountId = await auth.createCustomerAccount(`qa+${randomUUID()}@example.invalid`, password);
    const email = (await pool.query('SELECT identifier FROM account_identities WHERE account_id=$1 AND kind=$2',
      [accountId, 'email'])).rows[0].identifier;
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const origin = 'http://127.0.0.1:9091';
    const login = async (role) => {
      const response = await fetch(`${base}/auth/login`, {
        method: 'POST', headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });
      assert.equal(response.status, 201);
      return response.headers.get('set-cookie').split(';')[0];
    };
    const create = (path, cookie, body, requestOrigin = origin) => fetch(`${base}/catalog/admin/${path}`, {
      method: 'POST', headers: { cookie, origin: requestOrigin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const customerCookie = await login('customer');
    assert.equal((await create('majors', customerCookie, { name: `과일-${suffix}` })).status, 403);
    assert.equal((await create('majors', undefined, { name: `과일-${suffix}` })).status, 401);
    await pool.query('INSERT INTO account_roles (account_id, role) VALUES ($1, $2)', [accountId, 'admin']);
    const adminCookie = await login('admin');
    assert.equal((await create('majors', adminCookie, { name: `과일-${suffix}` }, 'https://untrusted.invalid')).status, 403);
    assert.equal((await create('majors', adminCookie, { name: '  ' })).status, 400);
    let response = await create('majors', adminCookie, { name: `과일-${suffix}` });
    assert.equal(response.status, 201);
    major = (await response.json()).id;
    assert.match(major, /^[0-9a-f-]{36}$/);
    assert.equal((await create('majors', adminCookie, { name: `과일-${suffix}` })).status, 409);
    response = await create('minors', adminCookie, { parentId: major, name: `베리-${suffix}` });
    assert.equal(response.status, 201);
    minor = (await response.json()).id;
    assert.equal((await create('minors', adminCookie, { parentId: randomUUID(), name: `고아-${suffix}` })).status, 400);
    assert.equal((await create('minors', adminCookie, { parentId: major, name: '  ' })).status, 400);
    assert.equal((await create('minors', adminCookie, { parentId: major, name: `베리-${suffix}` })).status, 409);
    assert.equal((await create('minors', adminCookie, { parentId: minor, name: `3단계-${suffix}` })).status, 400);
    response = await create('seller-categories', adminCookie, { name: `생산자-${suffix}` });
    assert.equal(response.status, 201);
    sellerCategory = (await response.json()).id;
    assert.equal((await create('sellers', adminCookie, { categoryId: randomUUID(), name: '고아' })).status, 400);
    response = await create('sellers', adminCookie, { categoryId: sellerCategory, name: `시험 판매자-${suffix}` });
    assert.equal(response.status, 201);
    seller = (await response.json()).id;
    for (const [path, id] of [['categories', major], ['categories', minor],
      ['seller-categories', sellerCategory], ['sellers', seller]]) {
      response = await fetch(`${base}/catalog/${path}`);
      assert.equal(response.status, 200);
      assert.ok((await response.json()).some((entry) => entry.id === id));
    }
    response = await fetch(`${base}/catalog/categories`);
    assert.equal((await response.json()).find((item) => item.id === minor).parentId, major);
    const audit = await pool.query('SELECT action FROM audit_events WHERE actor_account_id=$1 ORDER BY occurred_at', [accountId]);
    for (const action of ['category.create_major', 'category.create_minor', 'seller_category.create', 'seller.create']) {
      assert.ok(audit.rows.some((item) => item.action === action));
    }
  } finally {
    if (app) await app.close();
    if (seller) await pool.query('DELETE FROM sellers WHERE id=$1', [seller]);
    if (minor) await pool.query('DELETE FROM product_categories WHERE id=$1', [minor]);
    if (major) await pool.query('DELETE FROM product_categories WHERE id=$1', [major]);
    if (sellerCategory) await pool.query('DELETE FROM seller_categories WHERE id=$1', [sellerCategory]);
    if (accountId) {
      await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [accountId]);
      await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    }
    await pool.end();
  }
});
