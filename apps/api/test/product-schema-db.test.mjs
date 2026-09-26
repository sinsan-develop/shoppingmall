import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { AuthRepository } from '../src/auth/repository.ts';

test('product revisions keep options and image metadata apart from public publication', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = randomUUID().slice(0, 8);
  let accountId;
  let sellerCategoryId;
  let sellerId;
  let majorId;
  let minorId;
  let productId;
  let revisionId;
  try {
    accountId = await new AuthRepository(pool).createCustomerAccount(`qa+${randomUUID()}@example.invalid`, 'test-only-password-12345');
    sellerCategoryId = (await pool.query('INSERT INTO seller_categories (name) VALUES ($1) RETURNING id', [`qa-${suffix}-sellers`])).rows[0].id;
    sellerId = (await pool.query('INSERT INTO sellers (category_id, display_name) VALUES ($1,$2) RETURNING id',
      [sellerCategoryId, `qa-${suffix}-seller`])).rows[0].id;
    majorId = (await pool.query('INSERT INTO product_categories (name) VALUES ($1) RETURNING id', [`qa-${suffix}-fruit`])).rows[0].id;
    minorId = (await pool.query('INSERT INTO product_categories (parent_id,name) VALUES ($1,$2) RETURNING id',
      [majorId, `qa-${suffix}-berry`])).rows[0].id;
    productId = (await pool.query('INSERT INTO products (seller_id,category_id) VALUES ($1,$2) RETURNING id',
      [sellerId, minorId])).rows[0].id;
    revisionId = (await pool.query(
      `INSERT INTO product_revisions (product_id,version,title,description,origin_label,shipping_mode,proposed_by_account_id)
       VALUES ($1,1,$2,$3,$4,'seller_direct',$5) RETURNING id`,
      [productId, `시험 블루베리 ${suffix}`, '가상 상품', '지역 제한 없음', accountId],
    )).rows[0].id;
    await pool.query('INSERT INTO product_options (revision_id,name,price_won) VALUES ($1,$2,$3)', [revisionId, '500g', 23000]);
    await pool.query(`INSERT INTO product_images (revision_id,object_key,purpose,mime_type,size_bytes)
      VALUES ($1,$2,'thumbnail','image/webp',1024)`, [revisionId, `qa/${suffix}/thumbnail.webp`]);
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM product_publications WHERE product_id=$1', [productId])).rows[0].total, 0);
    await assert.rejects(pool.query('INSERT INTO product_options (revision_id,name,price_won) VALUES ($1,$2,$3)',
      [revisionId, 'invalid', -1]), { code: '23514' });
    await assert.rejects(pool.query(`INSERT INTO product_revisions
      (product_id,version,title,description,origin_label,shipping_mode,proposed_by_account_id)
      VALUES ($1,2,'  ','x','x','seller_direct',$2)`, [productId, accountId]), { code: '23514' });
  } finally {
    if (revisionId) {
      await pool.query('DELETE FROM product_images WHERE revision_id=$1', [revisionId]);
      await pool.query('DELETE FROM product_options WHERE revision_id=$1', [revisionId]);
      await pool.query('DELETE FROM product_revisions WHERE id=$1', [revisionId]);
    }
    if (productId) await pool.query('DELETE FROM products WHERE id=$1', [productId]);
    if (minorId) await pool.query('DELETE FROM product_categories WHERE id=$1', [minorId]);
    if (majorId) await pool.query('DELETE FROM product_categories WHERE id=$1', [majorId]);
    if (sellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [sellerId]);
    if (sellerCategoryId) await pool.query('DELETE FROM seller_categories WHERE id=$1', [sellerCategoryId]);
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
