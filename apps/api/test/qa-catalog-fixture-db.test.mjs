import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { runQaFixture } from '../scripts/qa-fixture.ts';
import { PublicProducts } from '../src/catalog/public-products.ts';

const runId = 'c7a9e210';
const password = 'test-only-password-12345';

test('five QA goods seed idempotently across three sellers and reset their own rows', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let catalogFixture;
  let accountSeeded = false;
  try {
    const existing = await pool.query(`SELECT
      (SELECT count(*)::int FROM account_identities WHERE identifier LIKE $1) AS accounts,
      (SELECT count(*)::int FROM product_categories WHERE name LIKE $2) AS categories`,
    [`qa+${runId}-%@example.invalid`, `qa-${runId}-%`]);
    assert.deepEqual(existing.rows[0], { accounts: 0, categories: 0 });
    await runQaFixture('seed', runId, process.env.DATABASE_URL, password);
    accountSeeded = true;
    ({ runQaCatalogFixture: catalogFixture } = await import('../scripts/qa-catalog-fixture.ts'));
    const first = await catalogFixture('seed', runId, process.env.DATABASE_URL);
    const products = await new PublicProducts(pool).list();
    assert.deepEqual(products.map((item) => item.title).sort(),
      ['qa-c7a9e210-고추', 'qa-c7a9e210-고춧가루', 'qa-c7a9e210-마늘',
        'qa-c7a9e210-블루베리', 'qa-c7a9e210-양파'].sort());
    assert.equal(new Set(products.map((item) => item.sellerId)).size, 3);
    assert.equal(new Set(products.map((item) => item.categoryId)).size, 3);
    const rows = await pool.query(`SELECT r.title,r.shipping_mode,o.name AS option_name,o.price_won,
        i.sellable_quantity FROM product_revisions r
        JOIN product_options o ON o.revision_id=r.id
        JOIN inventory_levels i ON i.option_id=o.id
        WHERE r.title LIKE $1 ORDER BY r.title`, [`qa-${runId}-%`]);
    assert.deepEqual(rows.rows.map((row) => [row.title, row.shipping_mode, row.option_name,
      row.price_won, row.sellable_quantity]).sort((a, b) => a[0].localeCompare(b[0])), [
      [`qa-${runId}-고추`, 'seller_direct', '500g', 23900, 7],
      [`qa-${runId}-고춧가루`, 'seller_direct', '1kg', 42000, 4],
      [`qa-${runId}-마늘`, 'seller_direct', '1kg', 19900, 8],
      [`qa-${runId}-블루베리`, 'owool_fulfillment', '500g', 28000, 6],
      [`qa-${runId}-양파`, 'seller_direct', '3kg', 15900, 12],
    ].sort((a, b) => a[0].localeCompare(b[0])));
    const second = await catalogFixture('seed', runId, process.env.DATABASE_URL);
    assert.deepEqual(second, first);
  } finally {
    try { if (catalogFixture) await catalogFixture('reset', runId, process.env.DATABASE_URL); }
    finally {
      if (accountSeeded) await runQaFixture('reset', runId, process.env.DATABASE_URL);
      await pool.end();
    }
  }
  const check = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const remain = await check.query(`SELECT
      (SELECT count(*)::int FROM account_identities WHERE identifier LIKE $1) AS accounts,
      (SELECT count(*)::int FROM product_categories WHERE name LIKE $2) AS categories,
      (SELECT count(*)::int FROM product_revisions WHERE title LIKE $2) AS products`,
    [`qa+${runId}-%@example.invalid`, `qa-${runId}-%`]);
    assert.deepEqual(remain.rows[0], { accounts: 0, categories: 0, products: 0 });
  } finally { await check.end(); }
});
