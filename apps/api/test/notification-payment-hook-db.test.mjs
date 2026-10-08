import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { CheckoutReservations } from '../src/checkout/reservation-service.ts';
import { submitPendingOrder } from '../src/orders/service.ts';
import { MockPaymentAdapter } from '../src/payments/mock-adapter.ts';
import { recordVerifiedPaymentEvent, startPaymentAttempt } from '../src/payments/service.ts';
import { processVerifiedPaymentEvent } from '../src/payments/processor.ts';

test('only first applied approval and decline queue notices from their verified payment events', {
  skip: !process.env.S53_PAYMENT_TEST_DB_SYSTEM_ID,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall');
  const pool = new Pool();
  const runId = randomBytes(4).toString('hex');
  let seeded = false; let buyerId; let addressId;
  const reservations = []; const orders = [];
  try {
    const identity = (await pool.query(`SELECT current_database() AS name,
      system_identifier::text AS system_id FROM pg_control_system()`)).rows[0];
    assert.equal(identity.name, 'shoppingmall');
    assert.equal(identity.system_id, process.env.S53_PAYMENT_TEST_DB_SYSTEM_ID);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)).rows[0].n, 20);
    await runQaCatalogFixture('seed', runId, process.env.DATABASE_URL, 'test-only-password-12345');
    seeded = true;
    const names = qaNames(runId);
    buyerId = (await pool.query(`UPDATE account_identities SET verified_at=now()
      WHERE kind='email' AND identifier=$1 RETURNING account_id`, [names.emails[0]])).rows[0].account_id;
    const optionId = (await pool.query(`SELECT o.id FROM product_options o
      JOIN product_revisions r ON r.id=o.revision_id WHERE r.title=$1`,
    [`qa-${runId}-고추`])).rows[0].id;
    await pool.query(`INSERT INTO customer_cart_items(account_id,option_id,quantity)
      VALUES ($1,$2,1)`, [buyerId, optionId]);
    addressId = (await pool.query(`INSERT INTO customer_addresses
      (account_id,label,recipient_name,phone,postal_code,line1)
      VALUES ($1,'시험','받는 분','01000000000','12345','시험 주소') RETURNING id`,
    [buyerId])).rows[0].id;
    const makeOrder = async () => {
      const hold = await new CheckoutReservations(pool).start(buyerId, randomUUID());
      reservations.push(hold.id);
      const order = await submitPendingOrder(pool, buyerId, { reservationId:hold.id,
        addressId, selections:{}, expectedPayableWon:26000, idempotencyKey:randomUUID() });
      orders.push(order.id);
      return order;
    };
    const makeEvent = async (order, outcome) => {
      const attempt = await startPaymentAttempt(pool, buyerId, order.id, randomUUID(),
        outcome, { APP_ENV:'development', PAYMENT_MODE:'mock' });
      const providerOrderId = (await pool.query(`SELECT provider_order_id FROM payment_attempts
        WHERE id=$1`, [attempt.id])).rows[0].provider_order_id;
      const verified = new MockPaymentAdapter().verify(providerOrderId, outcome);
      const event = await recordVerifiedPaymentEvent(pool, attempt.id, verified);
      return { attempt, event, verified };
    };
    const count = async (kind) => (await pool.query(`SELECT count(*)::int AS n FROM notification_jobs
      WHERE account_id=$1 AND kind=$2`, [buyerId, kind])).rows[0].n;

    const approvedOrder = await makeOrder();
    const approval = await makeEvent(approvedOrder, 'approve');
    assert.equal(await count('payment_approved'), 0);
    assert.equal((await processVerifiedPaymentEvent(pool, approval.event.id)).processingStatus, 'APPLIED');
    assert.equal(await count('payment_approved'), 1);
    assert.deepEqual((await pool.query(`SELECT source_event_id FROM notification_jobs
      WHERE account_id=$1 AND kind='payment_approved'`, [buyerId])).rows,
    [{ source_event_id: approval.event.id }]);
    await processVerifiedPaymentEvent(pool, approval.event.id);
    assert.equal(await count('payment_approved'), 1);

    const declinedOrder = await makeOrder();
    const decline = await makeEvent(declinedOrder, 'decline');
    assert.equal(await count('payment_declined'), 0);
    assert.equal((await processVerifiedPaymentEvent(pool, decline.event.id)).processingStatus, 'APPLIED');
    assert.equal(await count('payment_declined'), 1);
    assert.deepEqual((await pool.query(`SELECT source_event_id FROM notification_jobs
      WHERE account_id=$1 AND kind='payment_declined'`, [buyerId])).rows,
    [{ source_event_id: decline.event.id }]);
    await processVerifiedPaymentEvent(pool, decline.event.id);
    const repeated = await recordVerifiedPaymentEvent(pool, decline.attempt.id,
      { ...decline.verified, eventId:`mock:event:${randomUUID()}` });
    assert.equal((await processVerifiedPaymentEvent(pool, repeated.id)).processingStatus, 'APPLIED');
    assert.equal(await count('payment_declined'), 1);
  } finally {
    if (buyerId) await pool.query('DELETE FROM notification_jobs WHERE account_id=$1', [buyerId]);
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
      await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=$1', [id]);
      await pool.query('DELETE FROM checkout_reservations WHERE id=$1', [id]);
    }
    if (addressId) await pool.query('DELETE FROM customer_addresses WHERE id=$1', [addressId]);
    if (seeded) await runQaCatalogFixture('reset', runId, process.env.DATABASE_URL);
    await pool.end();
  }
});
