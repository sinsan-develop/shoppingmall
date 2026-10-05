import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { CheckoutReservations } from '../src/checkout/reservation-service.ts';
import { submitPendingOrder } from '../src/orders/service.ts';
import { getOrderSnapshotConsistent } from '../src/orders/repository.ts';
import { expirePendingOrders } from '../src/orders/expiry.ts';
import { MockPaymentAdapter, NoChargePaymentAdapter } from '../src/payments/mock-adapter.ts';
import { recordVerifiedPaymentEvent, startPaymentAttempt } from '../src/payments/service.ts';
import { processVerifiedPaymentEvent } from '../src/payments/processor.ts';

test('one verified approval pays its shipment, reservation, coupon and stock only once', {
  skip: !process.env.DATABASE_URL,
}, async (context) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
  const runId = randomBytes(4).toString('hex');
  const reservations = []; const orders = []; const campaignIds = [];
  let seeded = false; let addressId;
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
    const campaignId = (await pool.query(`INSERT INTO promotion_campaigns
      (title,kind,total_use_limit,per_account_use_limit,created_by_account_id)
      VALUES ($1,'goods_discount',2,2,$2) RETURNING id`, [`QA-${runId}`, adminId])).rows[0].id;
    campaignIds.push(campaignId);
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

    const lateHold = await new CheckoutReservations(pool).start(buyerId, randomUUID());
    reservations.push(lateHold.id);
    const lateOrder = await submitPendingOrder(pool, buyerId, {
      reservationId: lateHold.id, addressId, selections: {},
      expectedPayableWon: 26000, idempotencyKey: randomUUID(),
    });
    orders.push(lateOrder.id);
    const lateAttempt = await startPaymentAttempt(pool, buyerId, lateOrder.id, randomUUID(), 'approve',
      { APP_ENV: 'development', PAYMENT_MODE: 'mock' });
    const lateProviderOrderId = (await pool.query('SELECT provider_order_id FROM payment_attempts WHERE id=$1',
      [lateAttempt.id])).rows[0].provider_order_id;
    const lateEvent = await recordVerifiedPaymentEvent(pool, lateAttempt.id,
      new MockPaymentAdapter().verify(lateProviderOrderId, 'approve'));
    await pool.query(`UPDATE inventory_levels SET on_hand_quantity=0,sellable_quantity=0
      WHERE option_id=$1`, [optionId]);
    await assert.rejects(() => processVerifiedPaymentEvent(pool, lateEvent.id), /Payment stock unavailable/);
    assert.equal((await pool.query('SELECT processing_status FROM payment_events WHERE id=$1',
      [lateEvent.id])).rows[0].processing_status, 'PENDING_PROCESSING');
    assert.equal((await pool.query('SELECT status FROM checkout_orders WHERE id=$1',
      [lateOrder.id])).rows[0].status, 'PENDING_PAYMENT');
    await pool.query(`UPDATE inventory_levels SET on_hand_quantity=$2,sellable_quantity=$3
      WHERE option_id=$1`, [optionId, after.on_hand_quantity, after.sellable_quantity]);
    await pool.query(`UPDATE checkout_orders SET created_at=clock_timestamp()-interval '16 minutes',
      expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`, [lateOrder.id]);
    await pool.query(`UPDATE checkout_reservations SET created_at=clock_timestamp()-interval '16 minutes',
      expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`, [lateHold.id]);
    const raced = await Promise.all([processVerifiedPaymentEvent(pool, lateEvent.id),
      expirePendingOrders(pool, 10)]);
    assert.equal(raced[0].processingStatus, 'REVIEW_REQUIRED');
    assert.equal(raced[1], 1);
    assert.equal((await pool.query('SELECT status FROM checkout_orders WHERE id=$1',
      [lateOrder.id])).rows[0].status, 'EXPIRED');
    assert.equal((await pool.query('SELECT on_hand_quantity FROM inventory_levels WHERE option_id=$1',
      [optionId])).rows[0].on_hand_quantity, after.on_hand_quantity);

    const stoppedHold = await new CheckoutReservations(pool).start(buyerId, randomUUID());
    reservations.push(stoppedHold.id);
    const stoppedOrder = await submitPendingOrder(pool, buyerId, {
      reservationId: stoppedHold.id, addressId, selections: {},
      expectedPayableWon: 26000, idempotencyKey: randomUUID(),
    });
    orders.push(stoppedOrder.id);
    const stoppedAttempt = await startPaymentAttempt(pool, buyerId, stoppedOrder.id, randomUUID(),
      'approve', { APP_ENV: 'development', PAYMENT_MODE: 'mock' });
    const stoppedProviderOrderId = (await pool.query('SELECT provider_order_id FROM payment_attempts WHERE id=$1',
      [stoppedAttempt.id])).rows[0].provider_order_id;
    const stoppedEvent = await recordVerifiedPaymentEvent(pool, stoppedAttempt.id,
      new MockPaymentAdapter().verify(stoppedProviderOrderId, 'approve'));
    await pool.query('UPDATE inventory_levels SET sellable_quantity=0 WHERE option_id=$1', [optionId]);
    assert.equal((await processVerifiedPaymentEvent(pool, stoppedEvent.id)).processingStatus, 'APPLIED');
    const stoppedStock = (await pool.query(`SELECT on_hand_quantity,sellable_quantity
      FROM inventory_levels WHERE option_id=$1`, [optionId])).rows[0];
    assert.equal(stoppedStock.on_hand_quantity, after.on_hand_quantity - 1);
    assert.equal(stoppedStock.sellable_quantity, 0);

    await pool.query(`UPDATE inventory_levels SET sellable_quantity=on_hand_quantity
      WHERE option_id=$1`, [optionId]);
    const couponGrants = {};
    for (const [kind, amount] of [['goods_discount', 23000], ['shipping_support', 3000]]) {
      const couponCampaignId = (await pool.query(`INSERT INTO promotion_campaigns
        (title,kind,total_use_limit,per_account_use_limit,created_by_account_id)
        VALUES ($1,$2,2,2,$3) RETURNING id`, [`QA-zero-${kind}-${runId}`, kind, adminId])).rows[0].id;
      campaignIds.push(couponCampaignId);
      const couponVersionId = (await pool.query(`INSERT INTO promotion_versions
        (campaign_id,version,scope,starts_at,ends_at,amount_kind,amount_value,created_by_account_id)
        VALUES ($1,1,'all',now()-interval '1 hour',now()+interval '1 day','fixed',$2,$3)
        RETURNING id`, [couponCampaignId, amount, adminId])).rows[0].id;
      couponGrants[kind] = (await pool.query(`INSERT INTO promotion_grants
        (account_id,version_id,source,issued_by_account_id,idempotency_key,reason)
        VALUES ($1,$2,'direct',$3,$4,'QA zero payment') RETURNING id`,
      [buyerId, couponVersionId, adminId, randomUUID()])).rows[0].id;
    }
    const zeroHold = await new CheckoutReservations(pool).start(buyerId, randomUUID(), true);
    reservations.push(zeroHold.id);
    assert.equal(zeroHold.quote.totalWon, 26000);
    const zeroOrder = await submitPendingOrder(pool, buyerId, {
      reservationId: zeroHold.id, addressId, expectedPayableWon: 0,
      selections: { goodsCoupon: { grantId: couponGrants.goods_discount },
        shippingCoupons: [{ shipmentKey: zeroHold.quote.shipments[0].key,
          selector: { grantId: couponGrants.shipping_support } }] },
      idempotencyKey: randomUUID(),
    });
    orders.push(zeroOrder.id);
    assert.equal(zeroOrder.payableWon, 0);
    const zeroAttempt = await startPaymentAttempt(pool, buyerId, zeroOrder.id, randomUUID(),
      'approve', { APP_ENV: 'development', PAYMENT_MODE: 'mock' });
    const zeroProvider = (await pool.query(`SELECT provider,provider_order_id AS "providerOrderId"
      FROM payment_attempts WHERE id=$1`, [zeroAttempt.id])).rows[0];
    assert.equal(zeroProvider.provider, 'no_charge');
    const zeroEvent = await recordVerifiedPaymentEvent(pool, zeroAttempt.id,
      new NoChargePaymentAdapter().verify(zeroProvider.providerOrderId, 'approve'));
    const zeroBefore = (await pool.query('SELECT on_hand_quantity FROM inventory_levels WHERE option_id=$1',
      [optionId])).rows[0].on_hand_quantity;
    assert.equal((await processVerifiedPaymentEvent(pool, zeroEvent.id)).processingStatus, 'APPLIED');
    assert.equal((await processVerifiedPaymentEvent(pool, zeroEvent.id)).processingStatus, 'APPLIED');
    assert.equal((await getOrderSnapshotConsistent(pool, buyerId, zeroOrder.id)).status, 'PAID');
    assert.equal((await pool.query('SELECT on_hand_quantity FROM inventory_levels WHERE option_id=$1',
      [optionId])).rows[0].on_hand_quantity, zeroBefore - 1);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM promotion_uses
      WHERE reservation_id=$1 AND status='USED'`, [zeroHold.id])).rows[0].n, 2);
  } finally {
    for (const id of orders) {
      await pool.query(`DELETE FROM shipment_fulfillment_events WHERE shipment_order_id IN
        (SELECT id FROM shipment_orders WHERE checkout_order_id=$1)`, [id]);
      await pool.query(`DELETE FROM payment_events WHERE payment_attempt_id IN
        (SELECT id FROM payment_attempts WHERE checkout_order_id=$1)`, [id]);
      await pool.query('DELETE FROM payment_attempts WHERE checkout_order_id=$1', [id]);
      await pool.query('DELETE FROM order_promotion_allocations WHERE checkout_order_id=$1', [id]);
      await pool.query('DELETE FROM order_status_events WHERE checkout_order_id=$1', [id]);
      await pool.query(`DELETE FROM shipment_order_lines WHERE shipment_order_id IN
        (SELECT id FROM shipment_orders WHERE checkout_order_id=$1)`, [id]);
      await pool.query(`DELETE FROM shipment_fulfillments WHERE shipment_order_id IN
        (SELECT id FROM shipment_orders WHERE checkout_order_id=$1)`, [id]);
      await pool.query('DELETE FROM shipment_orders WHERE checkout_order_id=$1', [id]);
      await pool.query('DELETE FROM checkout_orders WHERE id=$1', [id]);
    }
    for (const id of reservations) {
      await pool.query('DELETE FROM promotion_uses WHERE reservation_id=$1', [id]);
      await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=$1', [id]);
      await pool.query('DELETE FROM checkout_reservations WHERE id=$1', [id]);
    }
    for (const campaignId of campaignIds) {
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
