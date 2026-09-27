import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { AuthRepository } from '../src/auth/repository.ts';
import { ImageQuarantine } from '../src/catalog/image-quarantine.ts';
import { ProductDrafts } from '../src/catalog/product-drafts.ts';
import { ProductReviews } from '../src/catalog/product-reviews.ts';
import { PublicProducts } from '../src/catalog/public-products.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');

test('only an operator publishes a fully scanned pending product and its exact private image', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const previous = { enabled: process.env.ENABLE_LOCAL_UPLOAD, root: process.env.SHOPPINGMALL_UPLOAD_ROOT };
  const root = await mkdtemp(join(tmpdir(), 'shoppingmall-upload-approve-'));
  const store = new ImageQuarantine(root);
  const suffix = randomUUID().slice(0, 8);
  let sellerAccountId; let adminAccountId; let sellerCategoryId; let sellerId;
  let majorId; let minorId; let productId; let revisionId; let imageId; let objectKey;
  let app;
  try {
    process.env.ENABLE_LOCAL_UPLOAD = '1';
    process.env.SHOPPINGMALL_UPLOAD_ROOT = root;
    const auth = new AuthRepository(pool);
    sellerAccountId = await auth.createCustomerAccount(`qa+${randomUUID()}@example.invalid`, 'test-only-password-12345');
    adminAccountId = await auth.createCustomerAccount(`qa+${randomUUID()}@example.invalid`, 'test-only-password-12345');
    sellerCategoryId = (await pool.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id', [`qa-${suffix}-group`])).rows[0].id;
    sellerId = (await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id', [sellerCategoryId, `qa-${suffix}-seller`])).rows[0].id;
    await pool.query('INSERT INTO account_roles(account_id,role,seller_id) VALUES ($1,$2,$3)', [sellerAccountId, 'seller', sellerId]);
    await pool.query('INSERT INTO account_roles(account_id,role) VALUES ($1,$2)', [adminAccountId, 'admin']);
    majorId = (await pool.query('INSERT INTO product_categories(name) VALUES ($1) RETURNING id', [`qa-${suffix}-major`])).rows[0].id;
    minorId = (await pool.query('INSERT INTO product_categories(parent_id,name) VALUES ($1,$2) RETURNING id', [majorId, `qa-${suffix}-minor`])).rows[0].id;
    const seller = { accountId: sellerAccountId, role: 'seller', sellerId };
    const admin = { accountId: adminAccountId, role: 'admin' };
    const drafts = new ProductDrafts(pool);
    ({ productId, revisionId } = await drafts.create(seller, {
      categoryId: minorId, title: '시험 고추', description: '승인 시험', originLabel: '전국',
      shippingMode: 'seller_direct', options: [{ name: '500g', priceWon: 23000 }],
    }));
    ({ id: imageId, objectKey } = await drafts.addImage(seller, productId, revisionId, 'thumbnail', png, 'image/png', store));
    await drafts.submit(seller, productId, revisionId);
    const reviews = new ProductReviews(pool);
    const publicProducts = new PublicProducts(pool);
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const publicImageUrl = `${base}/catalog/products/${productId}/images/${imageId}`;
    assert.equal((await fetch(publicImageUrl)).status, 404);
    assert.equal(await publicProducts.getPublishedImage(productId, imageId), null);
    await assert.rejects(reviews.approve(seller, revisionId, store, async () => {}), /Forbidden/);
    await assert.rejects(reviews.approve(admin, revisionId, store, async () => { throw new Error('Image scan rejected'); }),
      /Image scan rejected/);
    assert.equal((await pool.query('SELECT status FROM product_revisions WHERE id=$1', [revisionId])).rows[0].status, 'pending');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM product_publications WHERE product_id=$1', [productId])).rows[0].n, 0);
    let scanned = 0;
    const approved = await reviews.approve(admin, revisionId, store, async (bytes) => {
      scanned++;
      assert.deepEqual(bytes, await store.read(objectKey));
    });
    assert.equal(approved.status, 'approved');
    assert.equal(scanned, 1);
    assert.equal((await publicProducts.get(productId)).revisionId, revisionId);
    assert.deepEqual(await publicProducts.getPublishedImage(productId, imageId), { objectKey, mimeType: 'image/webp' });
    const publishedImage = await fetch(publicImageUrl);
    assert.equal(publishedImage.status, 200);
    assert.equal(publishedImage.headers.get('content-type'), 'image/webp');
    assert.match(publishedImage.headers.get('cache-control') ?? '', /no-store/);
    assert.equal(publishedImage.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await publishedImage.arrayBuffer()), await store.read(objectKey));
    assert.equal((await fetch(`${base}/catalog/products/${productId}/images/${randomUUID()}`)).status, 404);
    await assert.rejects(reviews.approve(admin, revisionId, store, async () => {}), /Pending proposal required/);
    const audit = await pool.query('SELECT action,actor_account_id FROM audit_events WHERE target_id=$1', [revisionId]);
    assert.ok(audit.rows.some((row) => row.action === 'product.proposal_approve' && row.actor_account_id === adminAccountId));
  } finally {
    if (app) await app.close();
    if (productId) await pool.query('DELETE FROM product_publications WHERE product_id=$1', [productId]);
    if (sellerAccountId && adminAccountId) await pool.query('DELETE FROM audit_events WHERE actor_account_id = ANY($1::uuid[])', [[sellerAccountId, adminAccountId]]);
    if (imageId) await pool.query('DELETE FROM product_images WHERE id=$1', [imageId]);
    if (revisionId) await pool.query('DELETE FROM product_options WHERE revision_id=$1', [revisionId]);
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
    if (objectKey) await store.remove(objectKey);
    await rm(root, { recursive: true });
    for (const [key, value] of [['ENABLE_LOCAL_UPLOAD', previous.enabled], ['SHOPPINGMALL_UPLOAD_ROOT', previous.root]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
