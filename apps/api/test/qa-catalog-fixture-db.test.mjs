import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { catalogQaSpecs, runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';

test('five virtual SKUs cover both direct farm sellers and the owool seller', () => {
  assert.deepEqual(catalogQaSpecs.map((item) => item.item),
    ['고추', '고춧가루', '양파', '마늘', '블루베리']);
  assert.deepEqual([...new Set(catalogQaSpecs.map((item) => item.seller))].sort(),
    ['owool', 'sellerA', 'sellerB']);
  assert.equal(catalogQaSpecs.filter((item) => item.shippingMode === 'owool_fulfillment').length, 1);
});

test('five-SKU fixture seeds and resets only its own product, options and account rows', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const id = randomBytes(4).toString('hex');
  const databaseUrl = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString: databaseUrl });
  let seeded = false;
  try {
    const result = await runQaCatalogFixture('seed', id, databaseUrl, 'test-only-catalog-password');
    seeded = true;
    assert.equal(result.products, 5);
    const rows = await pool.query(`SELECT r.title,s.display_name,r.shipping_mode,o.price_won,
      i.sellable_quantity FROM product_revisions r JOIN products p ON p.id=r.product_id
      JOIN sellers s ON s.id=p.seller_id JOIN product_options o ON o.revision_id=r.id
      JOIN inventory_levels i ON i.option_id=o.id
      WHERE r.title LIKE $1 ORDER BY r.title`, [`qa-${id}-%`]);
    assert.equal(rows.rowCount, 5);
    assert.equal(rows.rows.every((row) => row.price_won > 0 && row.sellable_quantity === 5), true);
    assert.equal(rows.rows.filter((row) => row.shipping_mode === 'owool_fulfillment').length, 1);
  } finally {
    if (seeded) {
      await runQaCatalogFixture('reset', id, databaseUrl);
      assert.deepEqual(await runQaCatalogFixture('reset', id, databaseUrl), { products: 0 });
    }
    const remains = await pool.query(`SELECT
      (SELECT count(*)::int FROM account_identities WHERE identifier LIKE $1) AS accounts,
      (SELECT count(*)::int FROM product_revisions WHERE title LIKE $2) AS revisions,
      (SELECT count(*)::int FROM product_categories WHERE name LIKE $2) AS categories`,
    [`qa+${id}-%@example.invalid`, `qa-${id}-%`]);
    assert.deepEqual(remains.rows[0], { accounts: 0, revisions: 0, categories: 0 });
    await pool.end();
  }
});
