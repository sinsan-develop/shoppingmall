import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { AuthRepository } from '../src/auth/repository.ts';
import { PublicProducts } from '../src/catalog/public-products.ts';

test('public search only returns approved published revisions with sellable stock', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const run = randomUUID().slice(0, 8);
  const accounts = [];
  const products = [];
  const revisions = [];
  const options = [];
  let sellerCategoryId;
  let sellerId;
  let majorId;
  let minorId;
  let app;
  try {
    const auth = new AuthRepository(pool);
    for (let i = 0; i < 2; i++) {
      accounts.push(await auth.createCustomerAccount(`qa+${randomUUID()}@example.invalid`, 'test-only-password-12345'));
    }
    sellerCategoryId = (await pool.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id', [`qa-${run}-sellers`])).rows[0].id;
    sellerId = (await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id', [sellerCategoryId, `qa-${run}-농가`])).rows[0].id;
    majorId = (await pool.query('INSERT INTO product_categories(name) VALUES ($1) RETURNING id', [`qa-${run}-채소`])).rows[0].id;
    minorId = (await pool.query('INSERT INTO product_categories(parent_id,name) VALUES ($1,$2) RETURNING id', [majorId, `qa-${run}-고추`])).rows[0].id;
    const makeProduct = async (title, status, quantity, published) => {
      const productId = (await pool.query('INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id', [sellerId, minorId])).rows[0].id;
      products.push(productId);
      const revisionId = (await pool.query(`INSERT INTO product_revisions(product_id,version,title,description,origin_label,shipping_mode,status,proposed_by_account_id)
        VALUES ($1,1,$2,'QA 설명','경남 진주','seller_direct',$3,$4) RETURNING id`, [productId, title, status, accounts[0]])).rows[0].id;
      revisions.push(revisionId);
      const optionId = (await pool.query('INSERT INTO product_options(revision_id,name,price_won) VALUES ($1,$2,$3) RETURNING id', [revisionId, '500g', 23000])).rows[0].id;
      options.push(optionId);
      await pool.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,$2,$2)', [optionId, quantity]);
      if (published) await pool.query('INSERT INTO product_publications(product_id,revision_id,published_by_account_id) VALUES ($1,$2,$3)', [productId, revisionId, accounts[1]]);
      return productId;
    };
    const visibleId = await makeProduct(`qa-${run}-고추`, 'approved', 5, true);
    await makeProduct(`qa-${run}-비밀 양파`, 'pending', 5, false);
    await makeProduct(`qa-${run}-품절 마늘`, 'approved', 0, true);
    const service = new PublicProducts(pool);
    const visible = await service.list({ query: `qa-${run}`, categoryId: majorId, sellerId, sort: 'latest' });
    assert.deepEqual(visible.map((item) => item.productId), [visibleId]);
    assert.equal(visible[0].minPriceWon, 23000);
    assert.equal(visible[0].sellerName, `qa-${run}-농가`);
    assert.equal('objectKey' in visible[0], false);
    assert.deepEqual(await service.list({ query: `qa-${run}-비밀` }), []);
    assert.deepEqual(await service.list({ query: `qa-${run}-품절` }), []);
    assert.deepEqual((await service.list({ query: `qa-${run}-농가`, categoryId: minorId, sort: 'price_asc' }))
      .map((item) => item.productId), [visibleId]);
    await assert.rejects(service.list({ sort: 'bogus' }), /Invalid search/);

    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const response = await fetch(`${base}/catalog/products?q=${encodeURIComponent(`qa-${run}`)}&categoryId=${majorId}&sort=latest`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).map((item) => item.productId), [visibleId]);
    const allCategories = await fetch(`${base}/catalog/products?q=${encodeURIComponent(`qa-${run}`)}&categoryId=&sort=price_asc`);
    assert.equal(allCategories.status, 200);
    assert.deepEqual((await allCategories.json()).map((item) => item.productId), [visibleId]);
    assert.equal((await fetch(`${base}/catalog/products?sort=bogus`)).status, 400);
  } finally {
    if (app) await app.close();
    if (products.length) await pool.query('DELETE FROM product_publications WHERE product_id = ANY($1::uuid[])', [products]);
    if (options.length) await pool.query('DELETE FROM inventory_levels WHERE option_id = ANY($1::uuid[])', [options]);
    if (options.length) await pool.query('DELETE FROM product_options WHERE id = ANY($1::uuid[])', [options]);
    if (revisions.length) await pool.query('DELETE FROM product_revisions WHERE id = ANY($1::uuid[])', [revisions]);
    if (products.length) await pool.query('DELETE FROM products WHERE id = ANY($1::uuid[])', [products]);
    if (minorId) await pool.query('DELETE FROM product_categories WHERE id=$1', [minorId]);
    if (majorId) await pool.query('DELETE FROM product_categories WHERE id=$1', [majorId]);
    if (sellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [sellerId]);
    if (sellerCategoryId) await pool.query('DELETE FROM seller_categories WHERE id=$1', [sellerCategoryId]);
    for (const accountId of accounts) {
      await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    }
    await pool.end();
  }
});
