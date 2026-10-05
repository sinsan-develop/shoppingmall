import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { ProductSaleStops } from '../src/catalog/product-sale-stops.ts';
import { processVerifiedPaymentEvent } from '../src/payments/processor.ts';
import { seedRefundHttpFixture, cleanupRefundHttpFixture } from '../test-support/refund-http-fixture.mjs';

test('payment and real sale-stop approval serialize without reservation/product lock inversion', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
  let ids; let stopping; let processing; let releaseStop;
  const resume = new Promise(resolve => { releaseStop = resolve; });
  let acquired; const productLocked = new Promise(resolve => { acquired = resolve; });
  try {
    ids = await seedRefundHttpFixture(pool);
    await pool.query(`UPDATE checkout_orders SET status='PENDING_PAYMENT',ended_at=NULL,paid_at=NULL WHERE id=$1`, [ids.orderId]);
    await pool.query(`UPDATE shipment_orders SET status='PENDING_PAYMENT' WHERE id=$1`, [ids.shipmentId]);
    await pool.query(`UPDATE checkout_reservations SET status='ACTIVE',ended_at=NULL WHERE id=$1`, [ids.reservationId]);
    await pool.query(`UPDATE payment_attempts SET status='PENDING',ended_at=NULL WHERE id=$1`, [ids.paymentAttemptId]);
    const eventId = (await pool.query(`UPDATE payment_events SET processing_status='PENDING_PROCESSING',
      processed_at=NULL WHERE payment_attempt_id=$1 RETURNING id`, [ids.paymentAttemptId])).rows[0].id;
    const stops = new ProductSaleStops(pool);
    const request = await stops.request({ accountId: ids.sellerAccountId, role: 'seller', sellerId: ids.sellerId },
      ids.productId, '결제 동시 판매중지 시험');
    const coordinatedPool = { query: pool.query.bind(pool), connect: async () => {
      const client = await pool.connect();
      const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      return { release: () => client.release(), query: async (sql, values) => {
        const result = await client.query(sql, values);
        if (sql === 'SELECT id FROM products WHERE id=$1 FOR UPDATE' && values[0] === ids.productId) {
          acquired(pid); await resume;
        }
        return result;
      } };
    } };
    stopping = new ProductSaleStops(coordinatedPool).approve({ accountId: ids.adminId, role: 'admin' }, request.requestId);
    stopping.catch(() => {});
    const stopPid = await productLocked;
    processing = processVerifiedPaymentEvent(pool, eventId); processing.catch(() => {});
    let blocked = false;
    for (let n = 0; n < 80; n++) {
      blocked = (await pool.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
        WHERE $1=ANY(pg_blocking_pids(pid))) AS blocked`, [stopPid])).rows[0].blocked;
      if (blocked) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(blocked, true, 'payment must reach the held product lock');
    releaseStop();
    const results = await Promise.allSettled([stopping, processing]);
    assert.deepEqual(results.map(result => result.status), ['fulfilled', 'fulfilled'],
      results.map(result => result.reason?.code ?? result.status).join(','));
    assert.equal(results[1].value.processingStatus, 'REVIEW_REQUIRED');
    assert.equal((await pool.query('SELECT status FROM checkout_reservations WHERE id=$1',
      [ids.reservationId])).rows[0].status, 'CANCELLED');
    assert.equal((await pool.query('SELECT status FROM checkout_orders WHERE id=$1',
      [ids.orderId])).rows[0].status, 'PENDING_PAYMENT');
    assert.equal((await pool.query('SELECT on_hand_quantity FROM inventory_levels WHERE option_id=$1',
      [ids.optionId])).rows[0].on_hand_quantity, 7);
    assert.equal((await processVerifiedPaymentEvent(pool, eventId)).processingStatus, 'REVIEW_REQUIRED');
  } finally {
    releaseStop();
    await Promise.allSettled([stopping, processing].filter(Boolean));
    if (ids) {
      await pool.query('DELETE FROM order_status_events WHERE checkout_order_id=$1', [ids.orderId]);
      await cleanupRefundHttpFixture(pool, ids);
    }
    await pool.end();
  }
});
