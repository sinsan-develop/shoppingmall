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

test('real isolated DB payment records the same original seller and shipment exactly once', {
  skip: !process.env.S6_EVENT_TEST_DB_SYSTEM_ID,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
  try {
    const identity = (await pool.query(`SELECT current_database() AS name,
      system_identifier::text AS system_id FROM pg_control_system()`)).rows[0];
    assert.deepEqual(identity, { name: 'shoppingmall',
      system_id: process.env.S6_EVENT_TEST_DB_SYSTEM_ID });
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n, 21);
    const runId = randomBytes(4).toString('hex');
    await runQaCatalogFixture('seed', runId, process.env.DATABASE_URL, 'test-only-password-12345');
    const names = qaNames(runId);
    const buyer = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [names.emails[0]])).rows[0].account_id;
    const option = (await pool.query(`SELECT option.id FROM product_options option
      JOIN product_revisions rev ON rev.id=option.revision_id WHERE rev.title=$1`,
    [`qa-${runId}-고추`])).rows[0].id;
    await pool.query('INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,1)',
      [buyer, option]);
    const address = (await pool.query(`INSERT INTO customer_addresses
      (account_id,label,recipient_name,phone,postal_code,line1)
      VALUES ($1,'시험','받는 분','01000000000','12345','시험 주소') RETURNING id`,
    [buyer])).rows[0].id;
    const hold = await new CheckoutReservations(pool).start(buyer, randomUUID());
    const order = await submitPendingOrder(pool, buyer, { reservationId: hold.id,
      addressId: address, selections: {}, expectedPayableWon: 26000,
      idempotencyKey: randomUUID() });
    const attempt = await startPaymentAttempt(pool, buyer, order.id, randomUUID(), 'approve',
      { APP_ENV: 'development', PAYMENT_MODE: 'mock' });
    const providerOrderId = (await pool.query('SELECT provider_order_id FROM payment_attempts WHERE id=$1',
      [attempt.id])).rows[0].provider_order_id;
    const verified = new MockPaymentAdapter().verify(providerOrderId, 'approve');
    const event = await recordVerifiedPaymentEvent(pool, attempt.id, verified);
    assert.equal((await processVerifiedPaymentEvent(pool, event.id)).processingStatus, 'APPLIED');
    const entries = (await pool.query(`SELECT kind,amount_won::int AS amount,
      seller_id AS "sellerId",checkout_order_id AS "orderId",
      shipment_order_id AS "shipmentId",occurred_at AS "occurredAt"
      FROM settlement_events WHERE checkout_order_id=$1 ORDER BY kind`, [order.id])).rows;
    assert.deepEqual(entries.map(({ kind, amount }) => [kind, amount]),
      [['sale', 23000], ['shipping_fee', 3000]]);
    assert.ok(entries.every((entry) => entry.orderId === order.id && entry.shipmentId));
    assert.ok(entries.every((entry) => entry.occurredAt instanceof Date));
    assert.equal((await processVerifiedPaymentEvent(pool, event.id)).processingStatus, 'APPLIED');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM settlement_events')).rows[0].n, 2);
  } finally {
    // This suite runs only in its own tmpfs PostgreSQL container. Immutable test rows
    // stay until that exact container and network are removed after the suite.
    await pool.end();
  }
});
