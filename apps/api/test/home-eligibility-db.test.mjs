import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { PublicProducts } from '../src/catalog/public-products.ts';

async function withProducts(count, run) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const suffix = randomUUID();
    const accountId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const sellerCategoryId = (await client.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id',
      [`qa-home-seller-${suffix}`])).rows[0].id;
    const categoryId = (await client.query('INSERT INTO product_categories(name) VALUES ($1) RETURNING id',
      [`qa-home-product-${suffix}`])).rows[0].id;
    const sellerId = (await client.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [sellerCategoryId, `qa-home-${suffix}`])).rows[0].id;
    const products = [];
    for (let n = 0; n < count; n++) {
      const productId = (await client.query('INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
        [sellerId, categoryId])).rows[0].id;
      const revisionId = (await client.query(
        `INSERT INTO product_revisions(product_id,version,title,description,origin_label,shipping_mode,status,
          proposed_by_account_id,reviewed_by_account_id,reviewed_at)
         VALUES ($1,1,$2,'QA 상품','경남 진주','seller_direct','approved',$3,$3,now()) RETURNING id`,
        [productId, `QA 상품 ${n}`, accountId],
      )).rows[0].id;
      const optionId = (await client.query(
        'INSERT INTO product_options(revision_id,name,price_won,display_order) VALUES ($1,$2,$3,0) RETURNING id',
        [revisionId, '500g', 23000 + n],
      )).rows[0].id;
      await client.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,5,5)',
        [optionId]);
      await client.query('INSERT INTO product_publications(product_id,revision_id,published_by_account_id) VALUES ($1,$2,$3)',
        [productId, revisionId, accountId]);
      products.push({ productId, revisionId, optionId, title: `QA 상품 ${n}` });
    }
    await run(client, { products, accountId, sellerId, categoryId });
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
}

test('selected products beyond the first catalog page keep selected order and current prices', {
  skip: !process.env.DATABASE_URL,
}, async () => withProducts(25, async (client, { products }) => {
  const selected = [products[24].productId, products[0].productId];
  const rows = await new PublicProducts(client).getSellableByIds(selected);
  assert.deepEqual(rows.map((item) => item.productId), selected);
  assert.deepEqual(rows.map((item) => item.minPriceWon), [23024, 23000]);
  assert.deepEqual(rows.map((item) => item.title), ['QA 상품 24', 'QA 상품 0']);
}));

test('selection drops sold-out and approved sale-stopped products immediately', {
  skip: !process.env.DATABASE_URL,
}, async () => withProducts(2, async (client, { products, accountId }) => {
  const catalog = new PublicProducts(client);
  const ids = products.map((item) => item.productId);
  assert.equal((await catalog.getSellableByIds(ids)).length, 2);
  await client.query('UPDATE inventory_levels SET sellable_quantity=0 WHERE option_id=$1', [products[0].optionId]);
  await client.query(
    `INSERT INTO product_sale_stop_requests(product_id,status,reason,requested_by_account_id,decided_by_account_id,decided_at)
     VALUES ($1,'approved','QA stop',$2,$2,now())`, [products[1].productId, accountId],
  );
  assert.deepEqual(await catalog.getSellableByIds(ids), []);
}));

test('selection reads images from the current approved revision only', {
  skip: !process.env.DATABASE_URL,
}, async () => withProducts(1, async (client, { products, accountId }) => {
  const product = products[0];
  const firstImage = (await client.query(
    `INSERT INTO product_images(revision_id,object_key,purpose,mime_type,size_bytes,display_order)
     VALUES ($1,$2,'thumbnail','image/webp',100,0) RETURNING id`, [product.revisionId, `qa/${randomUUID()}.webp`],
  )).rows[0].id;
  const catalog = new PublicProducts(client);
  assert.equal((await catalog.getSellableByIds([product.productId]))[0].images[0].id, firstImage);
  const nextRevision = (await client.query(
    `INSERT INTO product_revisions(product_id,version,title,description,origin_label,shipping_mode,status,
      proposed_by_account_id,reviewed_by_account_id,reviewed_at)
     VALUES ($1,2,'새 개정','QA 상품','경남 진주','seller_direct','approved',$2,$2,now()) RETURNING id`,
    [product.productId, accountId],
  )).rows[0].id;
  const nextOption = (await client.query(
    'INSERT INTO product_options(revision_id,name,price_won,display_order) VALUES ($1,$2,25000,0) RETURNING id',
    [nextRevision, '500g'],
  )).rows[0].id;
  await client.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,5,5)',
    [nextOption]);
  await client.query('UPDATE product_publications SET revision_id=$1 WHERE product_id=$2',
    [nextRevision, product.productId]);
  const result = (await catalog.getSellableByIds([product.productId]))[0];
  assert.equal(result.minPriceWon, 25000);
  assert.deepEqual(result.images, []);
}));
