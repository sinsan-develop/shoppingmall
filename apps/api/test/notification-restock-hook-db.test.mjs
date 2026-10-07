import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaPublicFixture } from '../scripts/qa-public-fixture.ts';
import { CustomerEngagement } from '../src/customer/engagement.ts';
import { InventoryService } from '../src/inventory/service.ts';
import { assertOrderMutationQaTarget } from './order-schema-guard.mjs';

test('only approved zero-to-sellable public stock queues an active restock request once', {
  skip: !process.env.S53_RESTOCK_TEST_DB_SYSTEM_ID,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const runId = randomBytes(4).toString('hex');
  let seeded = false;
  let productId;
  let subscriptionId;
  try {
    await assertOrderMutationQaTarget(pool, process.env.S53_RESTOCK_TEST_DB_SYSTEM_ID);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n, 20);
    ({ productId } = await runQaPublicFixture('seed', runId,
      process.env.DATABASE_URL, 'test-only-password-12345'));
    seeded = true;
    const names = qaNames(runId);
    const identities = (await pool.query(`SELECT identifier,account_id AS id FROM account_identities
      WHERE identifier=ANY($1::text[])`, [names.emails])).rows;
    const byEmail = new Map(identities.map(({ identifier, id }) => [identifier, id]));
    const customerId = byEmail.get(names.emails[0]);
    const sellerId = byEmail.get(names.emails[1]);
    const adminId = byEmail.get(names.emails[4]);
    assert.ok(customerId && sellerId && adminId);
    const option = (await pool.query(`SELECT o.id,p.seller_id AS "sellerId" FROM product_publications pub
      JOIN product_revisions r ON r.id=pub.revision_id AND r.status='approved'
      JOIN product_options o ON o.revision_id=r.id AND o.name='500g'
      JOIN products p ON p.id=pub.product_id WHERE p.id=$1`, [productId])).rows[0];
    assert.ok(option?.id);
    const seller = { accountId: sellerId, role: 'seller', sellerId: option.sellerId };
    const admin = { accountId: adminId, role: 'admin' };
    const inventory = new InventoryService(pool);
    await inventory.setStock(seller, option.id, 0);
    const subscription = await new CustomerEngagement(pool).addRestockSubscription(
      { accountId: customerId, role: 'customer' }, productId, option.id);
    subscriptionId = subscription.id;
    const pending = await inventory.setStock(seller, option.id, 5);
    assert.equal(pending.sellable, 0);
    assert.ok(pending.requestId);
    const jobs = async () => (await pool.query(`SELECT kind,source_event_id AS "eventId",
      restock_subscription_id AS "subscriptionId",account_id AS "accountId",channel
      FROM notification_jobs WHERE restock_subscription_id=$1`, [subscriptionId])).rows;
    assert.deepEqual(await jobs(), []);
    assert.equal((await inventory.approveIncrease(admin, pending.requestId)).sellable, 5);
    assert.deepEqual(await jobs(), [{ kind: 'restock_available',eventId: pending.requestId,
      subscriptionId,accountId: customerId,channel: 'email' }]);
    await assert.rejects(() => inventory.approveIncrease(admin, pending.requestId),
      /Pending stock request required/);
    assert.equal((await jobs()).length, 1);
  } finally {
    if (subscriptionId) {
      const unsafe = (await pool.query(`SELECT j.id FROM notification_jobs j
        WHERE j.restock_subscription_id=$1 AND
          (j.status<>'QUEUED' OR EXISTS (SELECT 1 FROM notification_attempts a WHERE a.job_id=j.id))`,
      [subscriptionId])).rows;
      assert.equal(unsafe.length, 0, 'QA restock notification was already processed');
      await pool.query(`DELETE FROM notification_jobs WHERE restock_subscription_id=$1`, [subscriptionId]);
      await pool.query('DELETE FROM restock_subscriptions WHERE id=$1', [subscriptionId]);
    }
    if (seeded) await runQaPublicFixture('reset', runId, process.env.DATABASE_URL);
    await pool.end();
  }
});
