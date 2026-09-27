import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import { AuthRepository } from '../src/auth/repository.ts';
import { ImageQuarantine } from '../src/catalog/image-quarantine.ts';
import { ProductDrafts } from '../src/catalog/product-drafts.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');

test('only the owning seller stages private image metadata for its draft revision', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'shoppingmall-upload-test-'));
  const store = new ImageQuarantine(root);
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
  let objectKey;
  try {
    accountId = await new AuthRepository(pool).createCustomerAccount(`qa+${randomUUID()}@example.invalid`, 'test-only-password-12345');
    sellerCategoryId = (await pool.query('INSERT INTO seller_categories (name) VALUES ($1) RETURNING id', [`qa-${suffix}-group`])).rows[0].id;
    sellerA = (await pool.query('INSERT INTO sellers (category_id,display_name) VALUES ($1,$2) RETURNING id', [sellerCategoryId, `qa-${suffix}-a`])).rows[0].id;
    sellerB = (await pool.query('INSERT INTO sellers (category_id,display_name) VALUES ($1,$2) RETURNING id', [sellerCategoryId, `qa-${suffix}-b`])).rows[0].id;
    majorId = (await pool.query('INSERT INTO product_categories (name) VALUES ($1) RETURNING id', [`qa-${suffix}-major`])).rows[0].id;
    minorId = (await pool.query('INSERT INTO product_categories (parent_id,name) VALUES ($1,$2) RETURNING id', [majorId, `qa-${suffix}-minor`])).rows[0].id;
    const drafts = new ProductDrafts(pool);
    const seller = { accountId, role: 'seller', sellerId: sellerA };
    const created = await drafts.create(seller, {
      categoryId: minorId, title: '시험 고추', description: '가상 사진 시험', originLabel: '제한 없음',
      shippingMode: 'seller_direct', options: [{ name: '500g', priceWon: 23000 }],
    });
    productId = created.productId;
    revisionId = created.revisionId;
    await assert.rejects(drafts.addImage({ accountId, role: 'seller', sellerId: sellerB },
      productId, revisionId, 'thumbnail', png, 'image/png', store), /Forbidden/);
    await assert.rejects(drafts.addImage(seller, productId, revisionId, 'thumbnail', png, 'image/jpeg', store), /Image MIME mismatch/);
    const image = await drafts.addImage(seller, productId, revisionId, 'thumbnail', png, 'image/png', store);
    objectKey = image.objectKey;
    assert.match(objectKey, /^quarantine\//);
    const rows = await pool.query('SELECT purpose,object_key,mime_type,size_bytes FROM product_images WHERE revision_id=$1', [revisionId]);
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].purpose, 'thumbnail');
    assert.equal(rows.rows[0].object_key, objectKey);
    assert.deepEqual(await store.read(objectKey), png);
    await assert.rejects(drafts.listImages({ accountId, role: 'seller', sellerId: sellerB }, productId, revisionId), /Forbidden/);
    await assert.rejects(drafts.listImages({ accountId, role: 'customer' }, productId, revisionId), /Forbidden/);
    assert.deepEqual(await drafts.listImages(seller, productId, revisionId), [{
      id: image.id, purpose: 'thumbnail', mimeType: 'image/png', sizeBytes: png.length, displayOrder: 0,
    }]);
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM product_publications WHERE product_id=$1', [productId])).rows[0].total, 0);
    await assert.rejects(drafts.submit({ accountId, role: 'seller', sellerId: sellerB }, productId, revisionId), /Forbidden/);
    const submitted = await drafts.submit(seller, productId, revisionId);
    assert.equal(submitted.status, 'pending');
    assert.equal((await pool.query('SELECT status FROM product_revisions WHERE id=$1', [revisionId])).rows[0].status, 'pending');
    await assert.rejects(drafts.submit(seller, productId, revisionId), /Draft required/);
    await assert.rejects(drafts.addImage(seller, productId, revisionId, 'detail', png, 'image/png', store), /Draft required/);
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM product_publications WHERE product_id=$1', [productId])).rows[0].total, 0);
  } finally {
    if (accountId) await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [accountId]);
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
      await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    }
    await pool.end();
    if (objectKey) await store.remove(objectKey);
    if (resolve(root).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')) &&
        root.includes('shoppingmall-upload-test-')) await rm(root, { recursive: true, force: true });
  }
});
