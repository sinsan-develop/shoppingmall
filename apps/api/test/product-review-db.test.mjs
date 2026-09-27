import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { AuthRepository } from '../src/auth/repository.ts';
import { ProductReviews } from '../src/catalog/product-reviews.ts';

test('an operator sees pending seller proposals and rejects with reason without publishing', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = randomUUID().slice(0, 8);
  let sellerAccountId;
  let adminAccountId;
  let sellerCategoryId;
  let sellerId;
  let majorId;
  let minorId;
  let productId;
  let revisionId;
  let secondRevisionId;
  let app;
  try {
    const auth = new AuthRepository(pool);
    sellerAccountId = await auth.createCustomerAccount(`qa+${randomUUID()}@example.invalid`, 'test-only-password-12345');
    adminAccountId = await auth.createCustomerAccount(`qa+${randomUUID()}@example.invalid`, 'test-only-password-12345');
    sellerCategoryId = (await pool.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id', [`qa-${suffix}-group`])).rows[0].id;
    sellerId = (await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id', [sellerCategoryId, `qa-${suffix}-seller`])).rows[0].id;
    majorId = (await pool.query('INSERT INTO product_categories(name) VALUES ($1) RETURNING id', [`qa-${suffix}-major`])).rows[0].id;
    minorId = (await pool.query('INSERT INTO product_categories(parent_id,name) VALUES ($1,$2) RETURNING id', [majorId, `qa-${suffix}-minor`])).rows[0].id;
    productId = (await pool.query('INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id', [sellerId, minorId])).rows[0].id;
    revisionId = (await pool.query(`INSERT INTO product_revisions(product_id,version,title,description,origin_label,shipping_mode,status,proposed_by_account_id)
      VALUES ($1,1,'시험 고추','가상 상품','전국','seller_direct','pending',$2) RETURNING id`, [productId, sellerAccountId])).rows[0].id;
    const reviews = new ProductReviews(pool);
    const seller = { accountId: sellerAccountId, role: 'seller', sellerId };
    const admin = { accountId: adminAccountId, role: 'admin' };
    await assert.rejects(reviews.listPending(seller), /Forbidden/);
    assert.equal((await reviews.listPending(admin)).some((item) => item.revisionId === revisionId), true);
    await assert.rejects(reviews.reject(seller, revisionId, '품질 자료 부족'), /Forbidden/);
    await assert.rejects(reviews.reject(admin, revisionId, ' '), /Review reason required/);
    const result = await reviews.reject(admin, revisionId, '품질 자료 부족');
    assert.equal(result.status, 'rejected');
    assert.equal((await reviews.listPending(admin)).some((item) => item.revisionId === revisionId), false);
    const revision = (await pool.query('SELECT status,reviewed_by_account_id,review_reason FROM product_revisions WHERE id=$1', [revisionId])).rows[0];
    assert.equal(revision.status, 'rejected');
    assert.equal(revision.reviewed_by_account_id, adminAccountId);
    assert.equal(revision.review_reason, '품질 자료 부족');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM product_publications WHERE product_id=$1', [productId])).rows[0].n, 0);
    await assert.rejects(reviews.reject(admin, revisionId, '다시'), /Pending proposal required/);
    const audit = await pool.query('SELECT actor_account_id,active_role,action FROM audit_events WHERE target_id=$1', [revisionId]);
    assert.ok(audit.rows.some((row) => row.actor_account_id === adminAccountId && row.active_role === 'admin' && row.action === 'product.proposal_reject'));
    secondRevisionId = (await pool.query(`INSERT INTO product_revisions(product_id,version,title,description,origin_label,shipping_mode,status,proposed_by_account_id)
      VALUES ($1,2,'시험 고추 수정','가상 상품','전국','seller_direct','pending',$2) RETURNING id`, [productId, sellerAccountId])).rows[0].id;
    await pool.query('INSERT INTO account_roles(account_id,role) VALUES ($1,$2)', [adminAccountId, 'admin']);
    const email = (await pool.query('SELECT identifier FROM account_identities WHERE account_id=$1 AND kind=$2',
      [adminAccountId, 'email'])).rows[0].identifier;
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const origin = 'http://127.0.0.1:9091';
    const login = await fetch(`${base}/auth/login`, { method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'test-only-password-12345', role: 'admin' }),
    });
    assert.equal(login.status, 201);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const pending = await fetch(`${base}/catalog/admin/proposals`, { headers: { cookie } });
    assert.equal(pending.status, 200);
    assert.equal((await pending.json()).some((item) => item.revisionId === secondRevisionId), true);
    const rejectUrl = `${base}/catalog/admin/proposals/${secondRevisionId}/reject`;
    const reject = (requestOrigin, reason) => fetch(rejectUrl, { method: 'POST',
      headers: { cookie, origin: requestOrigin, 'content-type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    assert.equal((await reject('https://untrusted.invalid', '무단')).status, 403);
    assert.equal((await reject(origin, ' ')).status, 400);
    assert.equal((await reject(origin, '품질 자료 부족')).status, 201);
    assert.equal((await reject(origin, '중복')).status, 409);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM product_publications WHERE product_id=$1', [productId])).rows[0].n, 0);
  } finally {
    if (app) await app.close();
    if (adminAccountId && sellerAccountId) await pool.query('DELETE FROM audit_events WHERE actor_account_id = ANY($1::uuid[])', [[adminAccountId, sellerAccountId]]);
    if (adminAccountId) await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [adminAccountId]);
    if (secondRevisionId) await pool.query('DELETE FROM product_revisions WHERE id=$1', [secondRevisionId]);
    if (revisionId) await pool.query('DELETE FROM product_revisions WHERE id=$1', [revisionId]);
    if (productId) await pool.query('DELETE FROM products WHERE id=$1', [productId]);
    if (minorId) await pool.query('DELETE FROM product_categories WHERE id=$1', [minorId]);
    if (majorId) await pool.query('DELETE FROM product_categories WHERE id=$1', [majorId]);
    for (const accountId of [sellerAccountId, adminAccountId]) {
      if (!accountId) continue;
      await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    }
    if (sellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [sellerId]);
    if (sellerCategoryId) await pool.query('DELETE FROM seller_categories WHERE id=$1', [sellerCategoryId]);
    await pool.end();
  }
});
