import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { PromotionRepository } from '../src/promotions/repository.ts';

test('repository resolves owned direct grants and normalized public codes to one version', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let adminId; let buyerId; let otherId; let campaignId; let versionId; let grantId;
  const code = `QA${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  try {
    adminId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    buyerId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    otherId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    campaignId = (await pool.query(`INSERT INTO promotion_campaigns
      (title,kind,total_use_limit,per_account_use_limit,created_by_account_id)
      VALUES ('QA repo','goods_discount',3,1,$1) RETURNING id`, [adminId])).rows[0].id;
    versionId = (await pool.query(`INSERT INTO promotion_versions
      (campaign_id,version,scope,starts_at,ends_at,amount_kind,amount_value,created_by_account_id)
      VALUES ($1,1,'all',now()-interval '1 hour',now()+interval '1 day','fixed',1000,$2)
      RETURNING id`, [campaignId, adminId])).rows[0].id;
    await pool.query('INSERT INTO promotion_codes(version_id,code) VALUES ($1,$2)', [versionId, code]);
    grantId = (await pool.query(`INSERT INTO promotion_grants
      (account_id,version_id,source,issued_by_account_id,reason)
      VALUES ($1,$2,'direct',$3,'QA') RETURNING id`, [buyerId, versionId, adminId])).rows[0].id;

    const repo = new PromotionRepository(pool);
    const version = await repo.getVersionById(versionId);
    assert.equal(version.campaignId, campaignId);
    assert.equal(version.rule.amountValue, 1000);
    assert.equal(version.rule.kind, 'goods_discount');
    assert.equal(await repo.getVersionById(randomUUID()), null);
    assert.deepEqual((await repo.listCustomerGrants(buyerId)).map((grant) => grant.id), [grantId]);
    assert.deepEqual(await repo.listCustomerGrants(otherId), []);
    assert.deepEqual(await repo.resolveSelection(buyerId, { grantId }),
      { campaignId, versionId, grantId, source: 'direct' });
    assert.equal(await repo.resolveSelection(otherId, { grantId }), null);
    assert.deepEqual(await repo.resolveSelection(buyerId, { code: ` ${code.toLowerCase()} ` }),
      { campaignId, versionId, grantId: null, source: 'code' });
    assert.equal(await repo.resolveSelection(buyerId, { code: 'NONEXISTENT' }), null);
  } finally {
    if (grantId) await pool.query('DELETE FROM promotion_grants WHERE id=$1', [grantId]);
    if (versionId) {
      await pool.query('DELETE FROM promotion_codes WHERE version_id=$1', [versionId]);
      await pool.query('DELETE FROM promotion_versions WHERE id=$1', [versionId]);
    }
    if (campaignId) await pool.query('DELETE FROM promotion_campaigns WHERE id=$1', [campaignId]);
    for (const accountId of [adminId, buyerId, otherId])
      if (accountId) await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    await pool.end();
  }
});
