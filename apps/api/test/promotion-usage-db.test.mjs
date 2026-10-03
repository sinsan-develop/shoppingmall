import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaPublicFixture } from '../scripts/qa-public-fixture.ts';
import { CheckoutReservations } from '../src/checkout/reservation-service.ts';
import { PromotionUsageService } from '../src/promotions/usage-service.ts';

test('one final coupon place is serialized across direct/code customers, then released or paid exactly once', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomBytes(4).toString('hex');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
  let seeded = false; let extraAccountId; let campaignId; let optionId;
  const reservations = [];
  try {
    const product = await runQaPublicFixture('seed', runId, process.env.DATABASE_URL,
      'test-only-password-12345');
    seeded = true;
    const names = qaNames(runId);
    optionId = (await pool.query('SELECT id FROM product_options WHERE revision_id=$1',
      [product.revisionId])).rows[0].id;
    const identities = (await pool.query('SELECT identifier,account_id FROM account_identities WHERE identifier=ANY($1::text[])',
      [names.emails])).rows;
    const customerId = identities.find((row) => row.identifier === names.emails[0]).account_id;
    const adminId = identities.find((row) => row.identifier === names.emails[4]).account_id;
    extraAccountId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await pool.query("INSERT INTO account_roles(account_id,role) VALUES ($1,'customer')", [extraAccountId]);
    for (const accountId of [customerId, extraAccountId]) {
      await pool.query('INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,1)',
        [accountId, optionId]);
      const view = await new CheckoutReservations(pool).start(accountId, randomUUID(), true);
      assert.equal(view.status, 'ACTIVE');
      reservations.push({ accountId, id: view.id, expiresAt: view.expiresAt });
    }
    campaignId = (await pool.query(`INSERT INTO promotion_campaigns
      (title,kind,direct_issue_limit,total_use_limit,per_account_use_limit,created_by_account_id)
      VALUES ($1,'goods_discount',2,1,1,$2) RETURNING id`, [`QA-${runId}-one-place`, adminId])).rows[0].id;
    const versionId = (await pool.query(`INSERT INTO promotion_versions
      (campaign_id,version,scope,starts_at,ends_at,minimum_eligible_goods_won,
        amount_kind,amount_value,created_by_account_id)
      VALUES ($1,1,'all',$2,$3,0,'fixed',5000,$4) RETURNING id`,
    [campaignId, new Date(Date.now() - 60_000), new Date(Date.now() + 3_600_000), adminId])).rows[0].id;
    const code = `U${runId.toUpperCase()}`;
    await pool.query('INSERT INTO promotion_codes(version_id,code) VALUES ($1,$2)', [versionId, code]);
    const grantId = (await pool.query(`INSERT INTO promotion_grants
      (account_id,version_id,source,issued_by_account_id,idempotency_key,reason)
      VALUES ($1,$2,'direct',$3,$4,'QA usage') RETURNING id`,
    [customerId, versionId, adminId, randomUUID()])).rows[0].id;
    const service = new PromotionUsageService(pool);
    const requests = [
      { ...reservations[0], key: randomUUID(), selection: { goodsCoupon: { grantId } } },
      { ...reservations[1], key: randomUUID(), selection: { goodsCoupon: { code } } },
    ];
    async function hold(request) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await service.holdInTransaction(client, request.accountId, request.id,
          request.selection, request.key, request.expiresAt);
        await client.query('COMMIT');
        return result;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    async function transition(method, ids, reason) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await service[method](client, ids, reason);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    const race = await Promise.allSettled(requests.map(hold));
    assert.equal(race.filter((part) => part.status === 'fulfilled').length, 1);
    assert.equal(race.filter((part) => part.status === 'rejected').length, 1);
    const winnerIndex = race.findIndex((part) => part.status === 'fulfilled');
    const loserIndex = 1 - winnerIndex;
    const winner = race[winnerIndex].value[0];
    assert.equal(winner.status, 'HELD');
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM promotion_uses WHERE status='HELD'" )).rows[0].n, 1);
    const retry = await hold(requests[winnerIndex]);
    assert.equal(retry[0].id, winner.id);
    await transition('releaseInTransaction', [winner.id], 'QA release');
    await transition('releaseInTransaction', [winner.id], 'QA release');
    assert.equal((await pool.query('SELECT status FROM promotion_uses WHERE id=$1', [winner.id])).rows[0].status,
      'RELEASED');
    await assert.rejects(() => transition('markPaidInTransaction', [winner.id]), /Promotion conflict/);
    const second = (await hold(requests[loserIndex]))[0];
    assert.equal(second.status, 'HELD');
    await new CheckoutReservations(pool).release(requests[loserIndex].accountId,
      requests[loserIndex].id);
    assert.equal(await service.releaseDue(10), 1);
    assert.equal(await service.releaseDue(10), 0);
    assert.equal((await pool.query('SELECT status FROM promotion_uses WHERE id=$1', [second.id])).rows[0].status,
      'RELEASED');
    const third = (await hold({ ...requests[winnerIndex], key: randomUUID() }))[0];
    await transition('markPaidInTransaction', [third.id]);
    await transition('markPaidInTransaction', [third.id]);
    assert.equal((await pool.query('SELECT status FROM promotion_uses WHERE id=$1', [third.id])).rows[0].status,
      'USED');
    await assert.rejects(() => transition('releaseInTransaction', [third.id], 'cannot undo paid'),
      /Promotion conflict/);
    await assert.rejects(() => hold({ ...requests[loserIndex], key: randomUUID() }),
      /Promotion conflict|Reservation unavailable/);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM promotion_uses WHERE status='USED'" )).rows[0].n, 1);
  } finally {
    if (campaignId) {
      await pool.query('DELETE FROM promotion_uses WHERE campaign_id=$1', [campaignId]);
      await pool.query('DELETE FROM promotion_grants WHERE version_id IN (SELECT id FROM promotion_versions WHERE campaign_id=$1)', [campaignId]);
      await pool.query('DELETE FROM promotion_codes WHERE version_id IN (SELECT id FROM promotion_versions WHERE campaign_id=$1)', [campaignId]);
      await pool.query('DELETE FROM promotion_versions WHERE campaign_id=$1', [campaignId]);
      await pool.query('DELETE FROM promotion_campaigns WHERE id=$1', [campaignId]);
    }
    if (extraAccountId) {
      await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id IN (SELECT id FROM checkout_reservations WHERE account_id=$1)', [extraAccountId]);
      await pool.query('DELETE FROM checkout_reservations WHERE account_id=$1', [extraAccountId]);
      await pool.query('DELETE FROM customer_cart_items WHERE account_id=$1', [extraAccountId]);
      await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [extraAccountId]);
      await pool.query('DELETE FROM account_roles WHERE account_id=$1', [extraAccountId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [extraAccountId]);
    }
    if (seeded) await runQaPublicFixture('reset', runId, process.env.DATABASE_URL);
    await pool.end();
  }
});
