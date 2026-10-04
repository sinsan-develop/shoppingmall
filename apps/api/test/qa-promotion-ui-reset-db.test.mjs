import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { resetPromotionUiFixture } from '../scripts/qa-promotion-ui-reset.ts';

const runId = 'f44f1004';
const databaseUrl = process.env.DATABASE_URL;
const enabled = process.env.QA_ISOLATED_SHARED_FIXTURE_TEST === '1' &&
  databaseUrl && new URL(databaseUrl).hostname === 'local-postgres';

test('shared promotion reset refuses a foreign cart and leaves every QA row unchanged', {
  skip: !enabled,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let seeded = false;
  let foreignAccountId;
  try {
    await runQaCatalogFixture('seed', runId, databaseUrl, 'test-only-shared-reset-password');
    seeded = true;
    const option = await pool.query(`SELECT o.id FROM product_options o
      JOIN product_revisions r ON r.id=o.revision_id WHERE r.title=$1`, [`qa-${runId}-고추`]);
    foreignAccountId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await pool.query('INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,1)',
      [foreignAccountId, option.rows[0].id]);
    await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /outside QA accounts/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM customer_cart_items WHERE account_id=$1',
      [foreignAccountId])).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM product_revisions WHERE title LIKE $1',
      [`qa-${runId}-%`])).rows[0].n, 5);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_identities WHERE identifier LIKE $1',
      [`qa+${runId}-%@example.invalid`])).rows[0].n, 5);
  } finally {
    if (foreignAccountId) {
      await pool.query('DELETE FROM customer_cart_items WHERE account_id=$1', [foreignAccountId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [foreignAccountId]);
    }
    if (seeded) await resetPromotionUiFixture(runId, databaseUrl);
    await pool.end();
  }
});

test('shared promotion reset rolls back promotion and account rows if catalog is unsafe', {
  skip: !enabled,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let seeded = false;
  let imageId;
  try {
    await runQaCatalogFixture('seed', runId, databaseUrl, 'test-only-shared-reset-password');
    seeded = true;
    const admin = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [`qa+${runId}-admin@example.invalid`])).rows[0].account_id;
    await pool.query(`INSERT INTO promotion_campaigns(title,kind,total_use_limit,per_account_use_limit,created_by_account_id)
      VALUES ($1,'goods_discount',10,1,$2)`, [`QA-${runId}-test`, admin]);
    const revision = (await pool.query('SELECT id FROM product_revisions WHERE title=$1',
      [`qa-${runId}-고추`])).rows[0].id;
    imageId = (await pool.query(`INSERT INTO product_images(revision_id,object_key,purpose,mime_type,size_bytes)
      VALUES ($1,$2,'thumbnail','image/png',1) RETURNING id`, [revision, `qa/${runId}/foreign.png`])).rows[0].id;
    await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /additional revisions or images/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM promotion_campaigns WHERE created_by_account_id=$1',
      [admin])).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_identities WHERE identifier LIKE $1',
      [`qa+${runId}-%@example.invalid`])).rows[0].n, 5);
  } finally {
    if (imageId) await pool.query('DELETE FROM product_images WHERE id=$1', [imageId]);
    if (seeded) await resetPromotionUiFixture(runId, databaseUrl);
    await pool.end();
  }
});
