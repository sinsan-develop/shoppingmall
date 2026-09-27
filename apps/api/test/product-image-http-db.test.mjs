import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { AuthRepository } from '../src/auth/repository.ts';
import { ProductDrafts } from '../src/catalog/product-drafts.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');

test('the local-only HTTP upload accepts an owned draft, rejects cross-seller access and never publishes it', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const previous = { enabled: process.env.ENABLE_LOCAL_UPLOAD, root: process.env.SHOPPINGMALL_UPLOAD_ROOT };
  const root = await mkdtemp(join(tmpdir(), 'shoppingmall-upload-http-test-'));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = randomUUID().slice(0, 8);
  let accountId;
  let sellerCategoryId;
  let sellerA;
  let sellerB;
  let majorId;
  let minorId;
  let productId;
  let revisionId;
  let app;
  try {
    process.env.ENABLE_LOCAL_UPLOAD = '1';
    process.env.SHOPPINGMALL_UPLOAD_ROOT = root;
    const auth = new AuthRepository(pool);
    const password = 'test-only-password-12345';
    accountId = await auth.createCustomerAccount(`qa+${randomUUID()}@example.invalid`, password);
    const email = (await pool.query('SELECT identifier FROM account_identities WHERE account_id=$1 AND kind=$2',
      [accountId, 'email'])).rows[0].identifier;
    sellerCategoryId = (await pool.query('INSERT INTO seller_categories (name) VALUES ($1) RETURNING id', [`qa-${suffix}-group`])).rows[0].id;
    sellerA = (await pool.query('INSERT INTO sellers (category_id,display_name) VALUES ($1,$2) RETURNING id', [sellerCategoryId, `qa-${suffix}-a`])).rows[0].id;
    sellerB = (await pool.query('INSERT INTO sellers (category_id,display_name) VALUES ($1,$2) RETURNING id', [sellerCategoryId, `qa-${suffix}-b`])).rows[0].id;
    majorId = (await pool.query('INSERT INTO product_categories (name) VALUES ($1) RETURNING id', [`qa-${suffix}-major`])).rows[0].id;
    minorId = (await pool.query('INSERT INTO product_categories (parent_id,name) VALUES ($1,$2) RETURNING id', [majorId, `qa-${suffix}-minor`])).rows[0].id;
    await pool.query('INSERT INTO account_roles (account_id,role,seller_id) VALUES ($1,$2,$3)', [accountId, 'seller', sellerA]);
    const created = await new ProductDrafts(pool).create({ accountId, role: 'seller', sellerId: sellerA }, {
      categoryId: minorId, title: '시험 고추', description: '업로드 시험', originLabel: '전국',
      shippingMode: 'seller_direct', options: [{ name: '500g', priceWon: 23000 }],
    });
    productId = created.productId;
    revisionId = created.revisionId;
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const origin = 'http://127.0.0.1:9091';
    const login = await fetch(`${base}/auth/login`, { method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, role: 'seller' }),
    });
    assert.equal(login.status, 201);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const url = `${base}/catalog/seller/products/${productId}/revisions/${revisionId}/images`;
    const upload = (body, headers = {}) => fetch(url, { method: 'POST',
      headers: { cookie, origin, 'x-image-purpose': 'thumbnail', 'content-type': 'image/png', ...headers }, body,
    });
    assert.equal((await upload(png, { origin: 'https://untrusted.invalid' })).status, 403);
    assert.equal((await upload(png, { 'content-type': 'image/jpeg' })).status, 400);
    await pool.query('UPDATE account_roles SET seller_id=$1 WHERE account_id=$2 AND role=$3', [sellerB, accountId, 'seller']);
    const wrongSellerLogin = await fetch(`${base}/auth/login`, { method: 'POST',
      headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password, role: 'seller' }),
    });
    assert.equal(wrongSellerLogin.status, 201);
    const wrongCookie = wrongSellerLogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await upload(png, { cookie: wrongCookie })).status, 403);
    await pool.query('UPDATE account_roles SET seller_id=$1 WHERE account_id=$2 AND role=$3', [sellerA, accountId, 'seller']);
    const response = await upload(png);
    assert.equal(response.status, 201);
    const image = await response.json();
    assert.match(image.objectKey, /^quarantine\//);
    assert.equal(image.mimeType, 'image/webp');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM product_images WHERE revision_id=$1', [revisionId])).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM product_publications WHERE product_id=$1', [productId])).rows[0].n, 0);
    assert.equal((await readdir(join(root, 'quarantine'))).length, 1);
  } finally {
    if (app) await app.close();
    if (accountId) await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [accountId]);
    if (accountId) await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
    if (accountId) await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
    if (revisionId) {
      await pool.query('DELETE FROM product_images WHERE revision_id=$1', [revisionId]);
      await pool.query('DELETE FROM product_options WHERE revision_id=$1', [revisionId]);
      await pool.query('DELETE FROM product_revisions WHERE id=$1', [revisionId]);
    }
    if (productId) await pool.query('DELETE FROM products WHERE id=$1', [productId]);
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
    if (previous.enabled === undefined) delete process.env.ENABLE_LOCAL_UPLOAD;
    else process.env.ENABLE_LOCAL_UPLOAD = previous.enabled;
    if (previous.root === undefined) delete process.env.SHOPPINGMALL_UPLOAD_ROOT;
    else process.env.SHOPPINGMALL_UPLOAD_ROOT = previous.root;
    if (root.startsWith(join(tmpdir(), 'shoppingmall-upload-http-test-'))) await rm(root, { recursive: true, force: true });
  }
});
