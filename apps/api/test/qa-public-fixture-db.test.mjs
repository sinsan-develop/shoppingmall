import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { PublicProducts } from '../src/catalog/public-products.ts';

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
