import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

test('0011 adds five constrained promotion relations without changing existing rows', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  async function rejects(sql, args, code) {
    await client.query('SAVEPOINT promotion_constraint');
    try {
      await assert.rejects(client.query(sql, args), (error) => error.code === code);
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT promotion_constraint');
      await client.query('RELEASE SAVEPOINT promotion_constraint');
    }
  }
  try {
    for (const name of ['promotion_campaigns', 'promotion_versions', 'promotion_codes',
      'promotion_grants', 'promotion_uses']) {
      const result = await client.query('SELECT to_regclass($1) AS name', [name]);
      assert.ok(result.rows[0].name, `${name} must exist after 0011`);
    }
    const before = (await client.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n;
    await client.query('BEGIN');
    const adminId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const buyerId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const campaignId = (await client.query(`INSERT INTO promotion_campaigns
      (title,kind,status,direct_issue_limit,total_use_limit,per_account_use_limit,created_by_account_id)
      VALUES ('QA 혜택','goods_discount','active',2,3,1,$1) RETURNING id`, [adminId])).rows[0].id;
    await rejects(`INSERT INTO promotion_campaigns
      (title,kind,status,direct_issue_limit,total_use_limit,per_account_use_limit,created_by_account_id)
      VALUES ('bad','shipping_discount','active',1,1,1,$1)`, [adminId], '23514');
    const versionId = (await client.query(`INSERT INTO promotion_versions
      (campaign_id,version,scope,target_ids,starts_at,ends_at,minimum_eligible_goods_won,
        amount_kind,amount_value,max_discount_won,created_by_account_id)
      VALUES ($1,1,'all','{}',now()-interval '1 hour',now()+interval '1 day',0,'fixed',3000,NULL,$2)
      RETURNING id`, [campaignId, adminId])).rows[0].id;
    await rejects(`INSERT INTO promotion_versions
      (campaign_id,version,scope,target_ids,starts_at,ends_at,minimum_eligible_goods_won,
        amount_kind,amount_value,max_discount_won,created_by_account_id)
      VALUES ($1,2,'options','{}',now(),now()+interval '1 day',0,'fixed',100,NULL,$2)`,
    [campaignId, adminId], '23514');
    await client.query('INSERT INTO promotion_codes(version_id,code) VALUES ($1,$2)', [versionId, 'QA1003']);
    await rejects('INSERT INTO promotion_codes(version_id,code) VALUES ($1,$2)', [versionId, 'QA1003'], '23505');
    await rejects('INSERT INTO promotion_codes(version_id,code) VALUES ($1,$2)', [randomUUID(), 'OTHER'], '23503');
    const grantId = (await client.query(`INSERT INTO promotion_grants
      (account_id,version_id,source,issued_by_account_id,reason)
      VALUES ($1,$2,'direct',$3,'QA issuance') RETURNING id`, [buyerId, versionId, adminId])).rows[0].id;
    await rejects(`INSERT INTO promotion_grants
      (account_id,version_id,source,issued_by_account_id,reason)
      VALUES ($1,$2,'direct',$3,'QA duplicate')`, [buyerId, versionId, adminId], '23505');
    const reservationId = (await client.query(`INSERT INTO checkout_reservations
      (account_id,idempotency_key,expires_at) VALUES ($1,$2,now()+interval '15 minutes') RETURNING id`,
    [buyerId, randomUUID()])).rows[0].id;
    const useArgs = [buyerId, campaignId, versionId, grantId, reservationId, randomUUID()];
    await client.query(`INSERT INTO promotion_uses
      (account_id,campaign_id,version_id,grant_id,reservation_id,shipment_key,status,idempotency_key,expires_at)
      VALUES ($1,$2,$3,$4,$5,NULL,'HELD',$6,now()+interval '15 minutes')`, useArgs);
    await rejects(`INSERT INTO promotion_uses
      (account_id,campaign_id,version_id,grant_id,reservation_id,shipment_key,status,idempotency_key,expires_at)
      VALUES ($1,$2,$3,$4,$5,NULL,'HELD',$6,now()+interval '15 minutes')`,
    [...useArgs.slice(0, 5), randomUUID()], '23505');
    await rejects(`INSERT INTO promotion_uses
      (account_id,campaign_id,version_id,grant_id,reservation_id,shipment_key,status,idempotency_key,expires_at)
      VALUES ($1,$2,$3,$4,$5,NULL,'INVALID',$6,now()+interval '15 minutes')`,
    [...useArgs.slice(0, 5), randomUUID()], '23514');
    await client.query('ROLLBACK');
    const after = (await client.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n;
    assert.equal(after, before);
  } finally {
    try { await client.query('ROLLBACK'); } catch { /* connection may already be closed */ }
    client.release();
    await pool.end();
  }
});
