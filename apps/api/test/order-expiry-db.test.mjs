import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { CheckoutReservations } from '../src/checkout/reservation-service.ts';
import { submitPendingOrder } from '../src/orders/service.ts';
import { skipWithoutOrderSchema } from './order-schema-guard.mjs';

test('pending order expiry and existing reservation expiry race end order, hold and coupon exactly once', {
  skip: !process.env.DATABASE_URL,
}, async (context) => {
  const { expirePendingOrders } = await import('../src/orders/expiry.ts');
  const runId = randomBytes(4).toString('hex');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
  let seeded = false; let addressId; let campaignId;
  const reservations = []; const orders = [];
  try {
    if (await skipWithoutOrderSchema(context, pool)) return;
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
      VALUES ($1,$2,'direct',$3,$4,'QA expiry') RETURNING id`,
    [buyerId, versionId, adminId, randomUUID()])).rows[0].id;
    async function submit() {
      const reservationId = (await new CheckoutReservations(pool).start(buyerId, randomUUID())).id;
      reservations.push(reservationId);
      const order = await submitPendingOrder(pool, buyerId, { reservationId, addressId,
        selections: { goodsCoupon: { grantId } }, expectedPayableWon: 21000,
        idempotencyKey: randomUUID() });
      orders.push(order.id);
      return { reservationId, orderId: order.id };
    }
    async function due({ reservationId, orderId }) {
      await pool.query(`UPDATE checkout_orders SET created_at=clock_timestamp()-interval '16 minutes',
        expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`, [orderId]);
      await pool.query(`UPDATE checkout_reservations SET created_at=clock_timestamp()-interval '16 minutes',
        expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`, [reservationId]);
    }
    async function verifyExpired({ reservationId, orderId }) {
      const state = await pool.query(`SELECT o.status AS order_status,r.status AS reservation_status
        FROM checkout_orders o JOIN checkout_reservations r ON r.id=o.reservation_id
        WHERE o.id=$1`, [orderId]);
      assert.deepEqual(state.rows[0], { order_status: 'EXPIRED', reservation_status: 'EXPIRED' });
      const uses = await pool.query('SELECT status FROM promotion_uses WHERE reservation_id=$1',
        [reservationId]);
      assert.deepEqual(uses.rows.map(({ status }) => status), ['RELEASED']);
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM order_status_events
        WHERE checkout_order_id=$1 AND status='EXPIRED'`, [orderId])).rows[0].n, 1);
    }
    await assert.rejects(() => expirePendingOrders(pool, 0), /Invalid expiry limit/);
    const first = await submit();
    assert.equal(await expirePendingOrders(pool, 10), 0);
    assert.equal((await pool.query('SELECT status FROM checkout_orders WHERE id=$1',
      [first.orderId])).rows[0].status, 'PENDING_PAYMENT');
    await assert.rejects(() => new CheckoutReservations(pool).release(buyerId, first.reservationId),
      /Pending order/);
    await assert.rejects(() => new CheckoutReservations(pool).cancel(adminId, first.reservationId,
      'QA cancellation'), /Pending order/);
    await due(first);
    assert.equal((await new CheckoutReservations(pool).get(buyerId, first.reservationId)).status, 'EXPIRED');
    await verifyExpired(first);
    assert.equal(await expirePendingOrders(pool, 10), 0);
    const second = await submit();
    await due(second);
    const results = await Promise.all([expirePendingOrders(pool, 10),
      new CheckoutReservations(pool).expireDue(10)]);
    assert.equal(results.reduce((sum, count) => sum + count, 0), 1);
    await verifyExpired(second);
    assert.equal(await expirePendingOrders(pool, 10), 0);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM checkout_reservations
      WHERE status='ACTIVE' AND id=ANY($1::uuid[])`, [reservations])).rows[0].n, 0);
  } finally {
    for (const id of orders) {
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
