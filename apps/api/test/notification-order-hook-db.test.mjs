import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { CheckoutReservations } from '../src/checkout/reservation-service.ts';
import { submitPendingOrder } from '../src/orders/service.ts';

test('new order queues one transactional notice in its commit but invalid and repeated submissions do not', {
  skip: !process.env.S53_ORDER_TEST_DB_SYSTEM_ID,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_s53_order_1008');
  const pool = new Pool();
  const identity = (await pool.query(`SELECT current_database() AS name,
    system_identifier::text AS system_id FROM pg_control_system()`)).rows[0];
  assert.equal(identity.name, 'shoppingmall_s53_order_1008');
  assert.equal(identity.system_id, process.env.S53_ORDER_TEST_DB_SYSTEM_ID);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)).rows[0].n, 20);
  const runId = randomBytes(4).toString('hex');
  let seeded = false; let buyerId; let addressId; let reservationId; let orderId;
  try {
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
    const hold = await new CheckoutReservations(pool).start(buyerId, randomUUID());
    reservationId = hold.id;
    const input = { reservationId, addressId, selections: {},
      expectedPayableWon: hold.quote.totalWon, idempotencyKey: randomUUID() };
    await assert.rejects(() => submitPendingOrder(pool, buyerId,
      { ...input, expectedPayableWon: input.expectedPayableWon - 1 }), /Order conflict/);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM notification_jobs
      WHERE account_id=$1`, [buyerId])).rows[0].n, 0);
    const order = await submitPendingOrder(pool, buyerId, input);
    orderId = order.id;
    const first = (await pool.query(`SELECT kind,source_event_id,account_id,channel,status
      FROM notification_jobs WHERE account_id=$1`, [buyerId])).rows;
    assert.deepEqual(first, [{ kind:'order_submitted', source_event_id:orderId,
      account_id:buyerId, channel:'email', status:'QUEUED' }]);
    assert.deepEqual(await submitPendingOrder(pool, buyerId, input), order);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM notification_jobs
      WHERE account_id=$1`, [buyerId])).rows[0].n, 1);
  } finally {
    if (buyerId) await pool.query(`DELETE FROM notification_jobs
      WHERE account_id=$1 AND kind='order_submitted'`, [buyerId]);
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
      await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=$1', [reservationId]);
      await pool.query('DELETE FROM checkout_reservations WHERE id=$1', [reservationId]);
    }
    if (addressId) await pool.query('DELETE FROM customer_addresses WHERE id=$1', [addressId]);
    if (seeded) await runQaCatalogFixture('reset', runId, process.env.DATABASE_URL);
    await pool.end();
  }
});
