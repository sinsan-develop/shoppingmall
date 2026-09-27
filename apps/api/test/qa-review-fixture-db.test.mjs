import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

test('review browser fixture is repeatable and removes only its own pending product and account', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomBytes(4).toString('hex');
  const password = 'test-only-password-12345';
  const { runQaReviewFixture } = await import('../scripts/qa-review-fixture.ts').catch(() => ({}));
  assert.equal(typeof runQaReviewFixture, 'function');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const seeded = await runQaReviewFixture('seed', runId, process.env.DATABASE_URL, password);
    assert.equal(seeded.adminEmail, `qa+${runId}-admin@example.invalid`);
    const proposal = await pool.query(`SELECT r.title,o.name,o.price_won,i.purpose
      FROM product_revisions r JOIN product_options o ON o.revision_id=r.id
      JOIN product_images i ON i.revision_id=r.id WHERE r.id=$1`, [seeded.revisionId]);
    assert.deepEqual(proposal.rows.map((row) => [row.title, row.name, row.price_won, row.purpose]),
      [[`qa-${runId}-review-chili`, '500g', 23000, 'thumbnail']]);
  } finally {
    await runQaReviewFixture('reset', runId, process.env.DATABASE_URL);
    const remaining = await pool.query(`SELECT
      (SELECT count(*)::int FROM account_identities WHERE identifier=$1) AS accounts,
      (SELECT count(*)::int FROM product_categories WHERE name=$2) AS categories,
      (SELECT count(*)::int FROM product_revisions WHERE title=$3) AS revisions`,
    [`qa+${runId}-admin@example.invalid`, `qa-${runId}-major`, `qa-${runId}-review-chili`]);
    assert.deepEqual(remaining.rows[0], { accounts: 0, categories: 0, revisions: 0 });
    await pool.end();
  }
});
