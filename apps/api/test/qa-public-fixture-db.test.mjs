import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { PublicProducts } from '../src/catalog/public-products.ts';
import { ProductSaleStops } from '../src/catalog/product-sale-stops.ts';

test('public browser fixture exposes one sellable QA product and resets only its run', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomBytes(4).toString('hex');
  const { runQaPublicFixture } = await import('../scripts/qa-public-fixture.ts').catch(() => ({}));
  assert.equal(typeof runQaPublicFixture, 'function');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let seeded = false;
  try {
    await assert.rejects(
      runQaPublicFixture('seed', runId, 'postgresql://postgres@127.0.0.1:5432/not-shoppingmall', 'test-only-password-12345'),
      /shoppingmall database/,
    );
    const result = await runQaPublicFixture('seed', runId, process.env.DATABASE_URL, 'test-only-password-12345');
    seeded = true;
    assert.equal(result.title, `qa-${runId}-public-chili`);
    const service = new PublicProducts(pool);
    const listed = await service.list({ query: result.title, categoryId: result.majorId });
    assert.deepEqual(listed.map((item) => item.productId), [result.productId]);
    assert.equal(listed[0].minPriceWon, 23000);
    const detail = await service.get(result.productId);
    assert.deepEqual(detail.options.map((option) => [option.name, option.priceWon, option.sellableQuantity]),
      [['500g', 23000, 5]]);
    assert.equal('objectKey' in detail, false);
    const images = await pool.query('SELECT count(*)::int AS count FROM product_images WHERE revision_id=$1', [result.revisionId]);
    assert.equal(images.rows[0].count, 0);
  } finally {
    if (seeded) await runQaPublicFixture('reset', runId, process.env.DATABASE_URL);
    const remaining = await pool.query(`SELECT
      (SELECT count(*)::int FROM account_identities WHERE identifier=$1) AS accounts,
      (SELECT count(*)::int FROM product_categories WHERE name=$2) AS categories,
      (SELECT count(*)::int FROM product_revisions WHERE title=$3) AS revisions,
      (SELECT count(*)::int FROM product_publications pub JOIN product_revisions r ON r.id=pub.revision_id WHERE r.title=$3) AS publications`,
    [`qa+${runId}-admin@example.invalid`, `qa-${runId}-public-major`, `qa-${runId}-public-chili`]);
    assert.deepEqual(remaining.rows[0], { accounts: 0, categories: 0, revisions: 0, publications: 0 });
    await pool.end();
  }
});

test('public browser fixture can seed 25 paginated products and remove only its run', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomBytes(4).toString('hex');
  const invalidRunId = randomBytes(4).toString('hex');
  const { runQaPublicFixture } = await import('../scripts/qa-public-fixture.ts');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let seeded = false;
  try {
    try {
      await assert.rejects(runQaPublicFixture('seed', invalidRunId, process.env.DATABASE_URL,
        'test-only-password-12345', 26), /QA product count/);
    } finally {
      await runQaPublicFixture('reset', invalidRunId, process.env.DATABASE_URL);
    }
    const result = await runQaPublicFixture('seed', runId, process.env.DATABASE_URL,
      'test-only-password-12345', 25);
    seeded = true;
    const service = new PublicProducts(pool);
    assert.equal((await service.list({ query: `qa-${runId}-public-chili`, page: 1 })).length, 24);
    assert.equal((await service.list({ query: `qa-${runId}-public-chili`, page: 2 })).length, 1);
    assert.equal(result.title, `qa-${runId}-public-chili`);
  } finally {
    if (seeded) await runQaPublicFixture('reset', runId, process.env.DATABASE_URL);
    const remaining = await pool.query(`SELECT
      (SELECT count(*)::int FROM product_revisions WHERE title LIKE $1) AS products,
      (SELECT count(*)::int FROM product_categories WHERE name=$2) AS categories,
      (SELECT count(*)::int FROM account_identities WHERE identifier=$3) AS accounts`,
    [`qa-${runId}-public-chili%`, `qa-${runId}-public-major`, `qa+${runId}-admin@example.invalid`]);
    assert.deepEqual(remaining.rows[0], { products: 0, categories: 0, accounts: 0 });
    await pool.end();
  }
});

test('public browser fixture reset removes a QA product after a private second revision exists', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomBytes(4).toString('hex');
  const { runQaPublicFixture } = await import('../scripts/qa-public-fixture.ts');
  const { runQaFixture } = await import('../scripts/qa-fixture.ts');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let productId;
  let cleaned = false;
  try {
    const seeded = await runQaPublicFixture('seed', runId, process.env.DATABASE_URL, 'test-only-password-12345');
    productId = seeded.productId;
    const account = await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [`qa+${runId}-seller-a@example.invalid`]);
    const draft = await pool.query(
      `INSERT INTO product_revisions(product_id,version,title,description,origin_label,shipping_mode,status,proposed_by_account_id)
       VALUES ($1,2,$2,'QA private revision','경남 진주','seller_direct','draft',$3) RETURNING id`,
      [productId, `qa-${runId}-public-chili`, account.rows[0].account_id],
    );
    await pool.query('INSERT INTO product_options(revision_id,name,price_won,display_order) VALUES ($1,$2,$3,0)',
      [draft.rows[0].id, '500g', 25000]);
    await runQaPublicFixture('reset', runId, process.env.DATABASE_URL);
    const remaining = await pool.query(`SELECT
      (SELECT count(*)::int FROM products WHERE id=$1) AS products,
      (SELECT count(*)::int FROM product_revisions WHERE product_id=$1) AS revisions,
      (SELECT count(*)::int FROM account_identities WHERE identifier=$2) AS accounts`,
    [productId, `qa+${runId}-seller-a@example.invalid`]);
    assert.deepEqual(remaining.rows[0], { products: 0, revisions: 0, accounts: 0 });
    cleaned = true;
  } finally {
    if (!cleaned && productId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM product_publications WHERE product_id=$1', [productId]);
        await client.query(`DELETE FROM inventory_levels WHERE option_id IN
          (SELECT o.id FROM product_options o JOIN product_revisions r ON r.id=o.revision_id WHERE r.product_id=$1)`, [productId]);
        await client.query(`DELETE FROM product_options WHERE revision_id IN
          (SELECT id FROM product_revisions WHERE product_id=$1)`, [productId]);
        await client.query('DELETE FROM product_revisions WHERE product_id=$1', [productId]);
        await client.query('DELETE FROM products WHERE id=$1', [productId]);
        await client.query('DELETE FROM product_categories WHERE name=$1', [`qa-${runId}-public-minor`]);
        await client.query('DELETE FROM product_categories WHERE name=$1', [`qa-${runId}-public-major`]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
      await runQaFixture('reset', runId, process.env.DATABASE_URL);
    }
    await pool.end();
  }
});

test('public browser fixture reset removes approved sale-stop history for only its QA product', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomBytes(4).toString('hex');
  const { runQaPublicFixture } = await import('../scripts/qa-public-fixture.ts');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let productId;
  let reset = false;
  try {
    const seeded = await runQaPublicFixture('seed', runId, process.env.DATABASE_URL, 'test-only-password-12345');
    productId = seeded.productId;
    const seller = await pool.query(
      `SELECT r.account_id AS "accountId",r.seller_id AS "sellerId"
       FROM account_roles r JOIN account_identities i ON i.account_id=r.account_id
       WHERE i.identifier=$1 AND r.role='seller'`, [`qa+${runId}-seller-a@example.invalid`]);
    const admin = await pool.query(
      `SELECT r.account_id AS "accountId" FROM account_roles r
       JOIN account_identities i ON i.account_id=r.account_id
       WHERE i.identifier=$1 AND r.role='admin'`, [`qa+${runId}-admin@example.invalid`]);
    const stops = new ProductSaleStops(pool);
    const requested = await stops.request({ ...seller.rows[0], role: 'seller' }, productId, 'QA 판매중지');
    await stops.approve({ ...admin.rows[0], role: 'admin' }, requested.requestId);
    await runQaPublicFixture('reset', runId, process.env.DATABASE_URL);
    reset = true;
    const remaining = await pool.query(`SELECT
      (SELECT count(*)::int FROM product_sale_stop_requests WHERE product_id=$1) AS stops,
      (SELECT count(*)::int FROM products WHERE id=$1) AS products,
      (SELECT count(*)::int FROM account_identities WHERE identifier=$2) AS accounts,
      (SELECT count(*)::int FROM audit_events WHERE target_id=$3) AS audit`,
    [productId, `qa+${runId}-seller-a@example.invalid`, requested.requestId]);
    assert.deepEqual(remaining.rows[0], { stops: 0, products: 0, accounts: 0, audit: 0 });
  } finally {
    if (!reset && productId) {
      await pool.query('DELETE FROM product_sale_stop_requests WHERE product_id=$1', [productId]);
      await runQaPublicFixture('reset', runId, process.env.DATABASE_URL);
    }
    await pool.end();
  }
});
