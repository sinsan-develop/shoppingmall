import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { CheckoutReservations } from '../src/checkout/reservation-service.ts';
import { submitPendingOrder } from '../src/orders/service.ts';
import { getOrderSnapshotConsistent } from '../src/orders/repository.ts';
import { MockPaymentAdapter } from '../src/payments/mock-adapter.ts';
import { recordVerifiedPaymentEvent, startPaymentAttempt } from '../src/payments/service.ts';
import { processVerifiedPaymentEvent } from '../src/payments/processor.ts';

test('one verified approval pays its shipment, reservation, coupon and stock only once', {
  skip: !process.env.DATABASE_URL,
}, async (context) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
  const runId = randomBytes(4).toString('hex');
  const reservations = []; const orders = [];
  let seeded = false; let addressId; let campaignId;
  try {
    const ready = await pool.query(`SELECT to_regclass('public.payment_events') IS NOT NULL AS ready`);
    if (!ready.rows[0].ready) {
      if (process.env.S4_PAYMENT_SCHEMA_REQUIRED === '1') throw new Error('S4 payment migration 0013 required');
      context.skip('S4 payment migration 0013 not applied');
      return;
    }
    await runQaCatalogFixture('seed', runId, process.env.DATABASE_URL, 'test-only-password-12345');
    seeded = true;
    const names = qaNames(runId);
    const buyerId = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [names.emails[0]])).rows[0].account_id;
    const adminId = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [names.emails[4]])).rows[0].account_id;
    const optionId = (await pool.query(`SELECT o.id FROM product_options o
      JOIN product_revisions r ON r.id=o.revision_id WHERE r.title=$1`,
    [`qa-${runId}-고추`])).rows[0].id;
    await pool.query('INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,1)',
      [buyerId, optionId]);
    addressId = (await pool.query(`INSERT INTO customer_addresses
      (account_id,label,recipient_name,phone,postal_code,line1)
      VALUES ($1,'시험','받는 분','01000000000','12345','시험 주소') RETURNING id`,
    [buyerId])).rows[0].id;
    campaignId = (await pool.query(`INSERT INTO promotion_campaigns
      (title,kind,total_use_limit,per_account_use_limit,created_by_account_id)
      VALUES ($1,'goods_discount',2,2,$2) RETURNING id`, [`QA-${runId}`, adminId])).rows[0].id;
    const versionId = (await pool.query(`INSERT INTO promotion_versions
      (campaign_id,version,scope,starts_at,ends_at,amount_kind,amount_value,created_by_account_id)
      VALUES ($1,1,'all',now()-interval '1 hour',now()+interval '1 day','fixed',5000,$2)
      RETURNING id`, [campaignId, adminId])).rows[0].id;
    const grantId = (await pool.query(`INSERT INTO promotion_grants
      (account_id,version_id,source,issued_by_account_id,idempotency_key,reason)
      VALUES ($1,$2,'direct',$3,$4,'QA payment') RETURNING id`,
    [buyerId, versionId, adminId, randomUUID()])).rows[0].id;
    const before = (await pool.query(`SELECT on_hand_quantity,sellable_quantity
      FROM inventory_levels WHERE option_id=$1`, [optionId])).rows[0];
    const hold = await new CheckoutReservations(pool).start(buyerId, randomUUID());
    reservations.push(hold.id);
    const order = await submitPendingOrder(pool, buyerId, {
      reservationId: hold.id, addressId, selections: { goodsCoupon: { grantId } },
      expectedPayableWon: 21000, idempotencyKey: randomUUID(),
    });
    orders.push(order.id);
    const attempt = await startPaymentAttempt(pool, buyerId, order.id, randomUUID(), 'approve',
      { APP_ENV: 'development', PAYMENT_MODE: 'mock' });
    const providerOrderId = (await pool.query('SELECT provider_order_id FROM payment_attempts WHERE id=$1',
      [attempt.id])).rows[0].provider_order_id;
    const verified = new MockPaymentAdapter().verify(providerOrderId, 'approve');
    const event = await recordVerifiedPaymentEvent(pool, attempt.id, verified);
    assert.equal((await getOrderSnapshotConsistent(pool, buyerId, order.id)).status, 'PENDING_PAYMENT');
    assert.equal((await pool.query('SELECT status FROM promotion_uses WHERE reservation_id=$1',
      [hold.id])).rows[0].status, 'HELD');
    assert.equal((await pool.query('SELECT on_hand_quantity FROM inventory_levels WHERE option_id=$1',
      [optionId])).rows[0].on_hand_quantity, before.on_hand_quantity);

    const applied = await processVerifiedPaymentEvent(pool, event.id);
    assert.equal(applied.processingStatus, 'APPLIED');
    const paid = await getOrderSnapshotConsistent(pool, buyerId, order.id);
    assert.equal(paid.status, 'PAID');
    assert.ok(paid.paidAt);
    assert.ok(paid.shipments.every((shipment) => shipment.status === 'PAID'));
    assert.equal((await pool.query('SELECT status FROM checkout_reservations WHERE id=$1',
      [hold.id])).rows[0].status, 'CONSUMED');
    assert.equal((await pool.query('SELECT status FROM promotion_uses WHERE reservation_id=$1',
      [hold.id])).rows[0].status, 'USED');
    const after = (await pool.query(`SELECT on_hand_quantity,sellable_quantity
      FROM inventory_levels WHERE option_id=$1`, [optionId])).rows[0];
    assert.equal(after.on_hand_quantity, before.on_hand_quantity - 1);
    assert.equal(after.sellable_quantity, before.sellable_quantity - 1);
    assert.equal((await processVerifiedPaymentEvent(pool, event.id)).processingStatus, 'APPLIED');
    const second = await recordVerifiedPaymentEvent(pool, attempt.id,
      { ...verified, eventId: `mock:event:${randomUUID()}` });
    assert.equal((await processVerifiedPaymentEvent(pool, second.id)).processingStatus, 'APPLIED');
    const staleDecline = await recordVerifiedPaymentEvent(pool, attempt.id,
      { ...verified, eventId: `mock:event:${randomUUID()}`, outcome: 'DECLINED' });
    assert.equal((await processVerifiedPaymentEvent(pool, staleDecline.id)).processingStatus,
      'REVIEW_REQUIRED');
    assert.equal((await pool.query('SELECT on_hand_quantity FROM inventory_levels WHERE option_id=$1',
      [optionId])).rows[0].on_hand_quantity, after.on_hand_quantity);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM order_status_events
      WHERE checkout_order_id=$1 AND status='PAID'`, [order.id])).rows[0].n, 1);
  } finally {
    for (const id of orders) {
      await pool.query(`DELETE FROM payment_events WHERE payment_attempt_id IN
        (SELECT id FROM payment_attempts WHERE checkout_order_id=$1)`, [id]);
      await pool.query('DELETE FROM payment_attempts WHERE checkout_order_id=$1', [id]);
      await pool.query('DELETE FROM order_promotion_allocations WHERE checkout_order_id=$1', [id]);
      await pool.query('DELETE FROM order_status_events WHERE checkout_order_id=$1', [id]);
      await pool.query(`DELETE FROM shipment_order_lines WHERE shipment_order_id IN
        (SELECT id FROM shipment_orders WHERE checkout_order_id=$1)`, [id]);
      await pool.query('DELETE FROM shipment_orders WHERE checkout_order_id=$1', [id]);
      await pool.query('DELETE FROM checkout_orders WHERE id=$1', [id]);
    }
    for (const id of reservations) {
      await pool.query('DELETE FROM promotion_uses WHERE reservation_id=$1', [id]);
      await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=$1', [id]);
      await pool.query('DELETE FROM checkout_reservations WHERE id=$1', [id]);
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
