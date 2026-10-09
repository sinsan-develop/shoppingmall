import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { MockRefundAdapter } from '../src/refunds/mock-adapter.ts';
import { createRefundCase, decideRefundCase, recordVerifiedRefundEvent } from '../src/refunds/service.ts';
import { processVerifiedRefundEvent } from '../src/refunds/processor.ts';

test('real isolated DB refund records its occurrence and the original paid order once', {
  skip: !process.env.S6_EVENT_TEST_DB_SYSTEM_ID,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
  try {
    const identity = (await pool.query('SELECT system_identifier::text AS id FROM pg_control_system()'))
      .rows[0].id;
    assert.equal(identity, process.env.S6_EVENT_TEST_DB_SYSTEM_ID);
    const orders = (await pool.query(`SELECT id,account_id AS "buyerId" FROM checkout_orders
      WHERE status='PAID'`)).rows;
    assert.equal(orders.length, 1, 'run payment hook first in this disposable DB');
    const order = orders[0];
    const admin = (await pool.query(`SELECT account_id AS id FROM account_roles
      WHERE role='admin'`)).rows[0].id;
    const shipment = (await pool.query(`SELECT sh.id,line.option_id AS "optionId"
      FROM shipment_orders sh JOIN shipment_order_lines line ON line.shipment_order_id=sh.id
      WHERE sh.checkout_order_id=$1`, [order.id])).rows[0];
    const payment = (await pool.query(`SELECT event.provider_payment_id AS "paymentId"
      FROM payment_events event JOIN payment_attempts attempt
        ON attempt.id=event.payment_attempt_id
      WHERE attempt.checkout_order_id=$1 AND event.processing_status='APPLIED'`,
    [order.id])).rows[0];
    const request = await createRefundCase(pool, { actorAccountId: order.buyerId,
      actorRole: 'customer', checkoutOrderId: order.id, shipmentOrderId: shipment.id,
      lines: [{ optionId: shipment.optionId, quantity: 1 }],
      reasonCode: 'customer_request', reason: 'QA 출고 전 취소', idempotencyKey: randomUUID() });
    const decision = await decideRefundCase(pool, { adminAccountId: admin, caseId: request.id,
      idempotencyKey: randomUUID(), decision: 'approve', reason: 'QA 출고 전 확인',
      preShipmentConfirmed: true, preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
      lines: [{ optionId: shipment.optionId, restockMode: 'none' }] },
    { APP_ENV: 'development', PAYMENT_MODE: 'mock' });
    const verified = new MockRefundAdapter().verify({
      providerRefundId: decision.providerRefundId, orderId: order.id,
      paymentId: payment.paymentId, amountWon: decision.totalRefundWon, outcome: 'SUCCEEDED',
    });
    const event = await recordVerifiedRefundEvent(pool, decision.attemptId, verified);
    assert.equal((await processVerifiedRefundEvent(pool, event.id)).processingStatus, 'APPLIED');
    const caseRow = (await pool.query(`SELECT status,completed_at AS "completedAt"
      FROM refund_cases WHERE id=$1`, [request.id])).rows[0];
    assert.equal(caseRow.status, 'REFUNDED');
    const eventAt = (await pool.query(`SELECT received_at AS "eventAt"
      FROM refund_events WHERE id=$1`, [event.id])).rows[0].eventAt;
    const entries = (await pool.query(`SELECT kind,amount_won::int AS amount,
      checkout_order_id AS "orderId",shipment_order_id AS "shipmentId",
      source_event_id AS "sourceEventId",occurred_at AS "occurredAt"
      FROM settlement_events WHERE source_event_kind='refund' AND source_event_id=$1
      ORDER BY kind`, [event.id])).rows;
    assert.equal(entries.length, decision.shippingRefundWon ? 2 : 1);
    assert.equal(entries.reduce((sum, row) => sum + row.amount, 0), decision.totalRefundWon);
    assert.ok(entries.every((row) => row.orderId === order.id &&
      row.shipmentId === shipment.id && row.sourceEventId === event.id &&
      row.occurredAt.getTime() === eventAt.getTime()));
    assert.equal((await processVerifiedRefundEvent(pool, event.id)).processingStatus, 'APPLIED');
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM settlement_events
      WHERE source_event_id=$1`, [event.id])).rows[0].n, entries.length);
  } finally {
    // All rows remain in this one-use tmpfs DB until the exact container is removed.
    await pool.end();
  }
});
