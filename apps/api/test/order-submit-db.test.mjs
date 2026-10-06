import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { CheckoutReservations } from '../src/checkout/reservation-service.ts';
import { assertOrderMutationQaTarget, skipWithoutFulfillmentSchema,
  skipWithoutOrderSchema } from './order-schema-guard.mjs';

test('two direct sellers and pooled goods submit once with an exact pending amount and owned address', {
  skip: !process.env.DATABASE_URL,
}, async (context) => {
  const { submitPendingOrder } = await import('../src/orders/service.ts');
  const runId = randomBytes(4).toString('hex');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
  let seeded = false;
  let buyerId;
  let addressId;
  let reservationId;
  let originalFulfillmentSetting;
  try {
    if (await skipWithoutOrderSchema(context, pool)) return;
    if (await skipWithoutFulfillmentSchema(context, pool)) return;
    await runQaCatalogFixture('seed', runId, process.env.DATABASE_URL, 'test-only-password-12345');
    seeded = true;
    const names = qaNames(runId);
    originalFulfillmentSetting = (await pool.query(`SELECT owool_seller_id AS "owoolSellerId",
      updated_by AS "updatedBy",version,updated_at AS "updatedAt"
      FROM fulfillment_settings WHERE id=1`)).rows[0];
    buyerId = (await pool.query(`SELECT account_id FROM account_identities
      WHERE kind='email' AND identifier=$1`, [names.emails[0]])).rows[0].account_id;
    const fulfillmentOwner = (await pool.query(`SELECT r.seller_id AS "sellerId",
      r.account_id AS "accountId" FROM account_roles r JOIN accounts a ON a.id=r.account_id
      WHERE r.role='seller' AND a.disabled_at IS NULL ORDER BY r.seller_id LIMIT 1`)).rows[0];
    assert.ok(fulfillmentOwner);
    await pool.query(`UPDATE fulfillment_settings SET owool_seller_id=$1,updated_by=$2,
      version=version+1,updated_at=now() WHERE id=1`,
    [fulfillmentOwner.sellerId, fulfillmentOwner.accountId]);
    const options = await pool.query(`SELECT o.id,r.title FROM product_options o
      JOIN product_revisions r ON r.id=o.revision_id WHERE r.title=ANY($1::text[])`,
    [['고추', '마늘', '고춧가루'].map((name) => `qa-${runId}-${name}`)]);
    assert.equal(options.rows.length, 3);
    for (const { id } of options.rows) await pool.query(`INSERT INTO customer_cart_items
      (account_id,option_id,quantity) VALUES ($1,$2,1)`, [buyerId, id]);
    addressId = (await pool.query(`INSERT INTO customer_addresses
      (account_id,label,recipient_name,phone,postal_code,line1)
      VALUES ($1,'시험','받는 분','01000000000','12345','시험 주소') RETURNING id`,
    [buyerId])).rows[0].id;
    const hold = await new CheckoutReservations(pool).start(buyerId, randomUUID(), true);
    reservationId = hold.id;
    assert.equal(hold.quote.shipments.length, 3);
    assert.equal(hold.quote.totalWon, 66000);
    const base = { reservationId: hold.id, addressId, selections: {}, expectedPayableWon: 66000 };
    await context.test('blocked postal range rejects the whole order on an exact private DB', {
      skip: !process.env.S3_ORDER_MUTATION_TEST_DB_SYSTEM_ID,
    }, async () => {
      await assertOrderMutationQaTarget(pool, process.env.S3_ORDER_MUTATION_TEST_DB_SYSTEM_ID);
      const originalRanges = (await pool.query(`SELECT blocked_postal_ranges AS ranges
        FROM shipping_policy_global WHERE id=1`)).rows[0].ranges;
      try {
        await pool.query(`UPDATE shipping_policy_global SET blocked_postal_ranges=$1::jsonb WHERE id=1`,
          [JSON.stringify([{ start: '12345', end: '12345' }])]);
        await assert.rejects(() => submitPendingOrder(pool, buyerId,
          { ...base, idempotencyKey: randomUUID() }), /Delivery unavailable/);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM checkout_orders WHERE account_id=$1',
          [buyerId])).rows[0].n, 0);
      } finally {
        await pool.query(`UPDATE shipping_policy_global SET blocked_postal_ranges=$1::jsonb WHERE id=1`,
          [JSON.stringify(originalRanges)]);
      }
    });
    await assert.rejects(() => submitPendingOrder(pool, buyerId,
      { ...base, expectedPayableWon: 65999, idempotencyKey: randomUUID() }), /Order conflict/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM checkout_orders WHERE account_id=$1',
      [buyerId])).rows[0].n, 0);
    const wrongAddress = randomUUID();
    await assert.rejects(() => submitPendingOrder(pool, buyerId,
      { ...base, addressId: wrongAddress, idempotencyKey: randomUUID() }), /Address unavailable/);
    const keys = [randomUUID(), randomUUID()];
    const race = await Promise.allSettled(keys.map((idempotencyKey) =>
      submitPendingOrder(pool, buyerId, { ...base, idempotencyKey })));
    assert.equal(race.filter((result) => result.status === 'fulfilled').length, 1,
      race.map((result) => result.status === 'rejected' ? result.reason?.stack : 'ok').join('\n'));
    const winner = race.findIndex((result) => result.status === 'fulfilled');
    const saved = race[winner].value;
    assert.equal(saved.status, 'PENDING_PAYMENT');
    assert.equal(saved.payableWon, 66000);
    assert.equal(saved.shipments.length, 3);
    assert.equal(saved.shipments.reduce((sum, group) => sum + group.payableWon, 0), 66000);
    const retry = await submitPendingOrder(pool, buyerId, { ...base, idempotencyKey: keys[winner] });
    assert.deepEqual(retry, saved);
    await assert.rejects(() => submitPendingOrder(pool, buyerId,
      { ...base, expectedPayableWon: 65000, idempotencyKey: keys[winner] }), /Order conflict/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM checkout_orders WHERE reservation_id=$1',
      [hold.id])).rows[0].n, 1);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM promotion_uses
      WHERE reservation_id=$1`, [hold.id])).rows[0].n, 0);
    const { getOrderSnapshotConsistent } = await import('../src/orders/repository.ts');
    let changedBetweenReads = false;
    const readerPool = { connect: async () => {
      const reader = await pool.connect();
      return { query: async (...args) => {
        const result = await reader.query(...args);
        if (!changedBetweenReads && typeof args[0] === 'string' &&
            args[0].includes('FROM checkout_orders WHERE id=$1 AND account_id=$2')) {
          changedBetweenReads = true;
          const writer = await pool.connect();
          try {
            await writer.query('BEGIN');
            await writer.query(`UPDATE checkout_orders SET status='EXPIRED',ended_at=now() WHERE id=$1`, [saved.id]);
            await writer.query(`UPDATE shipment_orders SET status='EXPIRED' WHERE checkout_order_id=$1`, [saved.id]);
            await writer.query('COMMIT');
          } catch (error) { await writer.query('ROLLBACK'); throw error; }
          finally { writer.release(); }
        }
        return result;
      }, release: () => reader.release() };
    } };
    const consistent = await getOrderSnapshotConsistent(readerPool, buyerId, saved.id);
    assert.equal(changedBetweenReads, true);
    assert.equal(consistent.status, 'PENDING_PAYMENT');
    assert.ok(consistent.shipments.every((shipment) => shipment.status === 'PENDING_PAYMENT'));
  } finally {
    if (reservationId) {
      const orders = (await pool.query('SELECT id FROM checkout_orders WHERE reservation_id=$1',
        [reservationId])).rows;
      for (const { id } of orders) {
        await pool.query('DELETE FROM order_promotion_allocations WHERE checkout_order_id=$1', [id]);
        await pool.query('DELETE FROM order_status_events WHERE checkout_order_id=$1', [id]);
        await pool.query(`DELETE FROM shipment_fulfillments WHERE shipment_order_id IN
          (SELECT id FROM shipment_orders WHERE checkout_order_id=$1)`, [id]);
        await pool.query(`DELETE FROM shipment_order_lines WHERE shipment_order_id IN
          (SELECT id FROM shipment_orders WHERE checkout_order_id=$1)`, [id]);
        await pool.query('DELETE FROM shipment_orders WHERE checkout_order_id=$1', [id]);
        await pool.query('DELETE FROM checkout_orders WHERE id=$1', [id]);
      }
      await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=$1', [reservationId]);
      await pool.query('DELETE FROM checkout_reservations WHERE id=$1', [reservationId]);
    }
    if (originalFulfillmentSetting) await pool.query(`UPDATE fulfillment_settings
      SET owool_seller_id=$1,updated_by=$2,version=$3,updated_at=$4 WHERE id=1`,
    [originalFulfillmentSetting.owoolSellerId, originalFulfillmentSetting.updatedBy,
      originalFulfillmentSetting.version, originalFulfillmentSetting.updatedAt]);
    if (addressId) await pool.query('DELETE FROM customer_addresses WHERE id=$1', [addressId]);
    if (seeded) await runQaCatalogFixture('reset', runId, process.env.DATABASE_URL);
    await pool.end();
  }
});

test('changed money, stock and campaign roll back order and coupon hold; valid snapshot preserves use', {
  skip: !process.env.DATABASE_URL,
}, async (context) => {
  const { submitPendingOrder } = await import('../src/orders/service.ts');
  const runId = randomBytes(4).toString('hex');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  let seeded = false; let reservationId; let addressId; let campaignId; let orderId;
  try {
    if (await skipWithoutOrderSchema(context, pool)) return;
    if (await skipWithoutFulfillmentSchema(context, pool)) return;
    await runQaCatalogFixture('seed', runId, process.env.DATABASE_URL, 'test-only-password-12345');
    seeded = true;
    const names = qaNames(runId);
    const buyerId = (await pool.query(`SELECT account_id FROM account_identities
      WHERE identifier=$1`, [names.emails[0]])).rows[0].account_id;
    const adminId = (await pool.query(`SELECT account_id FROM account_identities
      WHERE identifier=$1`, [names.emails[4]])).rows[0].account_id;
    const optionId = (await pool.query(`SELECT o.id FROM product_options o
      JOIN product_revisions r ON r.id=o.revision_id WHERE r.title=$1`,
    [`qa-${runId}-고추`])).rows[0].id;
    await pool.query('INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,1)',
      [buyerId, optionId]);
    addressId = (await pool.query(`INSERT INTO customer_addresses
      (account_id,label,recipient_name,phone,postal_code,line1)
      VALUES ($1,'시험','받는 분','01000000000','12345','시험 주소') RETURNING id`,
    [buyerId])).rows[0].id;
    reservationId = (await new CheckoutReservations(pool).start(buyerId, randomUUID())).id;
    campaignId = (await pool.query(`INSERT INTO promotion_campaigns
      (title,kind,total_use_limit,per_account_use_limit,created_by_account_id)
      VALUES ($1,'goods_discount',1,1,$2) RETURNING id`, [`QA-${runId}`, adminId])).rows[0].id;
    const versionId = (await pool.query(`INSERT INTO promotion_versions
      (campaign_id,version,scope,starts_at,ends_at,amount_kind,amount_value,created_by_account_id)
      VALUES ($1,1,'all',now()-interval '1 hour',now()+interval '1 day','fixed',5000,$2)
      RETURNING id`, [campaignId, adminId])).rows[0].id;
    const grantId = (await pool.query(`INSERT INTO promotion_grants
      (account_id,version_id,source,issued_by_account_id,idempotency_key,reason)
      VALUES ($1,$2,'direct',$3,$4,'QA order') RETURNING id`,
    [buyerId, versionId, adminId, randomUUID()])).rows[0].id;
    const base = { reservationId, addressId, selections: { goodsCoupon: { grantId } },
      expectedPayableWon: 21000 };
    await assert.rejects(() => submitPendingOrder(pool, buyerId,
      { ...base, expectedPayableWon: 21001, idempotencyKey: randomUUID() }), /Order conflict/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM promotion_uses WHERE reservation_id=$1',
      [reservationId])).rows[0].n, 0);
    await pool.query('UPDATE inventory_levels SET sellable_quantity=0 WHERE option_id=$1', [optionId]);
    await assert.rejects(() => submitPendingOrder(pool, buyerId,
      { ...base, idempotencyKey: randomUUID() }), /Reserved product changed/);
    await pool.query('UPDATE inventory_levels SET sellable_quantity=5 WHERE option_id=$1', [optionId]);
    await pool.query(`UPDATE promotion_campaigns SET status='stopped',stopped_by_account_id=$2,
      stopped_at=now(),stop_reason='QA stopped' WHERE id=$1`, [campaignId, adminId]);
    await assert.rejects(() => submitPendingOrder(pool, buyerId,
      { ...base, idempotencyKey: randomUUID() }), /Promotion conflict/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM checkout_orders WHERE reservation_id=$1',
      [reservationId])).rows[0].n, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM promotion_uses WHERE reservation_id=$1',
      [reservationId])).rows[0].n, 0);
    await pool.query(`UPDATE promotion_campaigns SET status='active',stopped_by_account_id=NULL,
      stopped_at=NULL,stop_reason=NULL WHERE id=$1`, [campaignId]);
    const saved = await submitPendingOrder(pool, buyerId, { ...base, idempotencyKey: randomUUID() });
    orderId = saved.id;
    assert.equal(saved.goodsDiscountWon, 5000);
    assert.equal(saved.payableWon, 21000);
    assert.equal(saved.shipments[0].promotions[0].versionId, versionId);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM promotion_uses
      WHERE reservation_id=$1 AND status='HELD'`, [reservationId])).rows[0].n, 1);
  } finally {
    if (orderId) {
      await pool.query('DELETE FROM order_promotion_allocations WHERE checkout_order_id=$1', [orderId]);
      await pool.query('DELETE FROM order_status_events WHERE checkout_order_id=$1', [orderId]);
      await pool.query(`DELETE FROM shipment_fulfillments WHERE shipment_order_id IN
        (SELECT id FROM shipment_orders WHERE checkout_order_id=$1)`, [orderId]);
      await pool.query(`DELETE FROM shipment_order_lines WHERE shipment_order_id IN
        (SELECT id FROM shipment_orders WHERE checkout_order_id=$1)`, [orderId]);
      await pool.query('DELETE FROM shipment_orders WHERE checkout_order_id=$1', [orderId]);
      await pool.query('DELETE FROM checkout_orders WHERE id=$1', [orderId]);
    }
    if (reservationId) {
      await pool.query('DELETE FROM promotion_uses WHERE reservation_id=$1', [reservationId]);
      await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=$1', [reservationId]);
      await pool.query('DELETE FROM checkout_reservations WHERE id=$1', [reservationId]);
    }
    if (campaignId) {
      await pool.query(`DELETE FROM promotion_grants WHERE version_id IN
        (SELECT id FROM promotion_versions WHERE campaign_id=$1)`, [campaignId]);
      await pool.query('DELETE FROM promotion_versions WHERE campaign_id=$1', [campaignId]);
      await pool.query('DELETE FROM promotion_campaigns WHERE id=$1', [campaignId]);
    }
    if (addressId) await pool.query('DELETE FROM customer_addresses WHERE id=$1', [addressId]);
    if (seeded) await runQaCatalogFixture('reset', runId, process.env.DATABASE_URL);
    await pool.end();
  }
});
