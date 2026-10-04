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
    const campaignId = (await pool.query(`INSERT INTO promotion_campaigns
      (title,kind,total_use_limit,per_account_use_limit,created_by_account_id)
      VALUES ($1,'goods_discount',10,1,$2) RETURNING id`, [`QA-${runId}-test`, admin])).rows[0].id;
    await pool.query(`INSERT INTO audit_events(actor_account_id,active_role,action,target_type,target_id)
      VALUES ($1,'admin','promotion.campaign_create','promotion_campaign',$2)`, [admin, campaignId]);
    const revision = (await pool.query('SELECT id FROM product_revisions WHERE title=$1',
      [`qa-${runId}-고추`])).rows[0].id;
    imageId = (await pool.query(`INSERT INTO product_images(revision_id,object_key,purpose,mime_type,size_bytes)
      VALUES ($1,$2,'thumbnail','image/png',1) RETURNING id`, [revision, `qa/${runId}/foreign.png`])).rows[0].id;
    await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /additional revisions or images/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM promotion_campaigns WHERE created_by_account_id=$1',
      [admin])).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_identities WHERE identifier LIKE $1',
      [`qa+${runId}-%@example.invalid`])).rows[0].n, 5);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1',
      [campaignId])).rows[0].n, 1);
  } finally {
    if (imageId) await pool.query('DELETE FROM product_images WHERE id=$1', [imageId]);
    if (seeded) await resetPromotionUiFixture(runId, databaseUrl);
    await pool.end();
  }
});

test('shared promotion reset refuses a foreign grant without deleting its campaign', {
  skip: !enabled,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let seeded = false;
  let foreignAccountId;
  let foreignGrantId;
  try {
    await runQaCatalogFixture('seed', runId, databaseUrl, 'test-only-shared-reset-password');
    seeded = true;
    const admin = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [`qa+${runId}-admin@example.invalid`])).rows[0].account_id;
    const campaignId = (await pool.query(`INSERT INTO promotion_campaigns
      (title,kind,total_use_limit,per_account_use_limit,created_by_account_id)
      VALUES ($1,'goods_discount',10,1,$2) RETURNING id`, [`QA-${runId}-foreign-grant`, admin])).rows[0].id;
    const versionId = (await pool.query(`INSERT INTO promotion_versions
      (campaign_id,version,scope,starts_at,ends_at,amount_kind,amount_value,created_by_account_id)
      VALUES ($1,1,'all',now(),now()+interval '1 day','fixed',1000,$2) RETURNING id`,
    [campaignId, admin])).rows[0].id;
    foreignAccountId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    foreignGrantId = (await pool.query(`INSERT INTO promotion_grants(account_id,version_id,source)
      VALUES ($1,$2,'code') RETURNING id`, [foreignAccountId, versionId])).rows[0].id;
    await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /outside QA accounts/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM promotion_grants WHERE id=$1',
      [foreignGrantId])).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM promotion_campaigns WHERE id=$1',
      [campaignId])).rows[0].n, 1);
  } finally {
    if (foreignGrantId) await pool.query('DELETE FROM promotion_grants WHERE id=$1', [foreignGrantId]);
    if (foreignAccountId) await pool.query('DELETE FROM accounts WHERE id=$1', [foreignAccountId]);
    if (seeded) await resetPromotionUiFixture(runId, databaseUrl);
    await pool.end();
  }
});

test('shared reset refuses foreign stock and shipping actors and off-run audit targets', {
  skip: !enabled,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let seeded = false;
  let foreignAccountId;
  let requestId;
  let auditId;
  try {
    await runQaCatalogFixture('seed', runId, databaseUrl, 'test-only-shared-reset-password');
    seeded = true;
    foreignAccountId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const optionId = (await pool.query(`SELECT o.id FROM product_options o
      JOIN product_revisions r ON r.id=o.revision_id WHERE r.title=$1`, [`qa-${runId}-고추`])).rows[0].id;
    requestId = (await pool.query(`INSERT INTO stock_change_requests
      (option_id,target_on_hand,requested_by_account_id) VALUES ($1,6,$2) RETURNING id`,
    [optionId, foreignAccountId])).rows[0].id;
    await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /outside QA accounts/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM stock_change_requests WHERE id=$1',
      [requestId])).rows[0].n, 1);
    await pool.query('DELETE FROM stock_change_requests WHERE id=$1', [requestId]);
    requestId = undefined;

    const sellerId = (await pool.query('SELECT id FROM sellers WHERE display_name=$1',
      [`qa-${runId}-seller-a`])).rows[0].id;
    requestId = (await pool.query(`INSERT INTO seller_shipping_policy_requests
      (seller_id,policy,requested_by_account_id) VALUES ($1,$2::jsonb,$3) RETURNING id`,
    [sellerId, '{}', foreignAccountId])).rows[0].id;
    await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /outside QA accounts/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM seller_shipping_policy_requests WHERE id=$1',
      [requestId])).rows[0].n, 1);
    await pool.query('DELETE FROM seller_shipping_policy_requests WHERE id=$1', [requestId]);
    requestId = undefined;

    const adminId = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [`qa+${runId}-admin@example.invalid`])).rows[0].account_id;
    auditId = (await pool.query(`INSERT INTO audit_events
      (actor_account_id,active_role,action,target_type,target_id)
      VALUES ($1,'admin','qa.test','product',$2) RETURNING id`,
    [adminId, foreignAccountId])).rows[0].id;
    await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /audit history references/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM audit_events WHERE id=$1',
      [auditId])).rows[0].n, 1);
  } finally {
    if (auditId) await pool.query('DELETE FROM audit_events WHERE id=$1', [auditId]);
    if (requestId) {
      await pool.query('DELETE FROM stock_change_requests WHERE id=$1', [requestId]);
      await pool.query('DELETE FROM seller_shipping_policy_requests WHERE id=$1', [requestId]);
    }
    if (foreignAccountId) await pool.query('DELETE FROM accounts WHERE id=$1', [foreignAccountId]);
    if (seeded) await resetPromotionUiFixture(runId, databaseUrl);
    await pool.end();
  }
});

test('shared reset refuses a duplicate-name seller in its QA category', {
  skip: !enabled,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let seeded = false;
  let duplicateSellerId;
  try {
    await runQaCatalogFixture('seed', runId, databaseUrl, 'test-only-shared-reset-password');
    seeded = true;
    duplicateSellerId = (await pool.query(`INSERT INTO sellers(category_id,display_name)
      SELECT id,$2 FROM seller_categories WHERE name=$1 RETURNING id`,
    [`qa-${runId}-sellers`, `qa-${runId}-seller-a`])).rows[0].id;
    await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /unexpected seller/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM sellers WHERE id=$1',
      [duplicateSellerId])).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_identities WHERE identifier LIKE $1',
      [`qa+${runId}-%@example.invalid`])).rows[0].n, 5);
  } finally {
    if (duplicateSellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [duplicateSellerId]);
    if (seeded) await resetPromotionUiFixture(runId, databaseUrl);
    await pool.end();
  }
});
