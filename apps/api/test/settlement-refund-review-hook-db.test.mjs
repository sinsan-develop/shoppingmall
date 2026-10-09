import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { CheckoutReservations } from '../src/checkout/reservation-service.ts';
import { submitPendingOrder } from '../src/orders/service.ts';
import { MockPaymentAdapter } from '../src/payments/mock-adapter.ts';
import { recordVerifiedPaymentEvent, startPaymentAttempt } from '../src/payments/service.ts';
import { processVerifiedPaymentEvent } from '../src/payments/processor.ts';
import { MockRefundAdapter } from '../src/refunds/mock-adapter.ts';
import { createRefundCase, decideRefundCase, recordVerifiedRefundEvent } from '../src/refunds/service.ts';
import { processVerifiedRefundEvent } from '../src/refunds/processor.ts';

test('verified refund with unavailable restock records original-order occurrence in review', {
  skip: !process.env.S6_EVENT_TEST_DB_SYSTEM_ID,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
  try {
    assert.equal((await pool.query('SELECT system_identifier::text AS id FROM pg_control_system()'))
      .rows[0].id, process.env.S6_EVENT_TEST_DB_SYSTEM_ID);
    const buyer = (await pool.query(`SELECT account_id AS id FROM account_roles
      WHERE role='customer' ORDER BY account_id LIMIT 1`)).rows[0].id;
    const admin = (await pool.query(`SELECT account_id AS id FROM account_roles
      WHERE role='admin' ORDER BY account_id LIMIT 1`)).rows[0].id;
    const option = (await pool.query(`SELECT o.id,p.id AS "productId" FROM product_options o
      JOIN product_revisions r ON r.id=o.revision_id JOIN products p ON p.id=r.product_id
      WHERE r.title LIKE 'qa-%-고추' LIMIT 1`)).rows[0];
    await pool.query(`INSERT INTO customer_cart_items(account_id,option_id,quantity)
      VALUES ($1,$2,1) ON CONFLICT (account_id,option_id)
      DO UPDATE SET quantity=1`, [buyer, option.id]);
    const address = (await pool.query(`SELECT id FROM customer_addresses
      WHERE account_id=$1 LIMIT 1`, [buyer])).rows[0].id;
    const hold = await new CheckoutReservations(pool).start(buyer, randomUUID());
    const order = await submitPendingOrder(pool, buyer, { reservationId: hold.id,
      addressId: address, selections: {}, expectedPayableWon: 26000,
      idempotencyKey: randomUUID() });
    const attempt = await startPaymentAttempt(pool, buyer, order.id, randomUUID(), 'approve',
      { APP_ENV: 'development', PAYMENT_MODE: 'mock' });
    const providerOrderId = (await pool.query(`SELECT provider_order_id AS id
      FROM payment_attempts WHERE id=$1`, [attempt.id])).rows[0].id;
    const payment = await recordVerifiedPaymentEvent(pool, attempt.id,
      new MockPaymentAdapter().verify(providerOrderId, 'approve'));
    assert.equal((await processVerifiedPaymentEvent(pool, payment.id)).processingStatus, 'APPLIED');
    const shipment = (await pool.query(`SELECT sh.id FROM shipment_orders sh
      WHERE sh.checkout_order_id=$1`, [order.id])).rows[0];
    const providerPaymentId = (await pool.query(`SELECT provider_payment_id AS id
      FROM payment_events WHERE id=$1`, [payment.id])).rows[0].id;
    const requested = await createRefundCase(pool, { actorAccountId: buyer,
      actorRole: 'customer', checkoutOrderId: order.id, shipmentOrderId: shipment.id,
      lines: [{ optionId: option.id, quantity: 1 }], reasonCode: 'customer_request',
      reason: '승인 뒤 판매중지', idempotencyKey: randomUUID() });
    const decision = await decideRefundCase(pool, { adminAccountId: admin, caseId: requested.id,
      idempotencyKey: randomUUID(), decision: 'approve', reason: '미출고 확인',
      preShipmentConfirmed: true, preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
      lines: [{ optionId: option.id, restockMode: 'on_hand_only' }] },
    { APP_ENV: 'development', PAYMENT_MODE: 'mock' });
    await pool.query(`INSERT INTO product_sale_stop_requests
      (product_id,reason,requested_by_account_id,status,decided_by_account_id,decided_at)
      VALUES ($1,'승인 뒤 판매중지',$2,'approved',$2,now())`, [option.productId, admin]);
    const refund = await recordVerifiedRefundEvent(pool, decision.attemptId,
      new MockRefundAdapter().verify({ providerRefundId: decision.providerRefundId,
        orderId: order.id, paymentId: providerPaymentId,
        amountWon: decision.totalRefundWon, outcome: 'SUCCEEDED' }));
    assert.equal((await processVerifiedRefundEvent(pool, refund.id)).processingStatus,
      'REVIEW_REQUIRED');
    assert.deepEqual((await pool.query(`SELECT status,completed_at AS "completedAt"
      FROM refund_cases WHERE id=$1`, [requested.id])).rows[0],
    { status: 'REVIEW_REQUIRED', completedAt: null });
    const eventAt = (await pool.query(`SELECT received_at AS "eventAt" FROM refund_events
      WHERE id=$1`, [refund.id])).rows[0].eventAt;
    const entries = (await pool.query(`SELECT kind,amount_won::int AS amount,
      checkout_order_id AS "orderId",occurred_at AS "occurredAt"
      FROM settlement_events WHERE source_event_id=$1 ORDER BY kind`, [refund.id])).rows;
    assert.equal(entries.length, decision.shippingRefundWon ? 2 : 1);
    assert.equal(entries.reduce((sum, row) => sum + row.amount, 0), decision.totalRefundWon);
    assert.ok(entries.every((row) => row.orderId === order.id &&
      row.occurredAt.getTime() === eventAt.getTime()));
    assert.equal((await processVerifiedRefundEvent(pool, refund.id)).processingStatus,
      'REVIEW_REQUIRED');
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM settlement_events
      WHERE source_event_id=$1`, [refund.id])).rows[0].n, entries.length);
  } finally {
    // Synthetic rows are destroyed only by removing this one-use tmpfs DB container.
    await pool.end();
  }
});
