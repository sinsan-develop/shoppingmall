import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { CheckoutReservations } from '../src/checkout/reservation-service.ts';

test('two direct sellers and pooled goods submit once with an exact pending amount and owned address', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const { submitPendingOrder } = await import('../src/orders/service.ts');
  const runId = randomBytes(4).toString('hex');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
  let seeded = false;
  let buyerId;
  let addressId;
  let reservationId;
  try {
    await runQaCatalogFixture('seed', runId, process.env.DATABASE_URL, 'test-only-password-12345');
    seeded = true;
    const names = qaNames(runId);
    buyerId = (await pool.query(`SELECT account_id FROM account_identities
      WHERE kind='email' AND identifier=$1`, [names.emails[0]])).rows[0].account_id;
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
  } finally {
    if (reservationId) {
      const orders = (await pool.query('SELECT id FROM checkout_orders WHERE reservation_id=$1',
        [reservationId])).rows;
      for (const { id } of orders) {
        await pool.query('DELETE FROM order_promotion_allocations WHERE checkout_order_id=$1', [id]);
        await pool.query('DELETE FROM order_status_events WHERE checkout_order_id=$1', [id]);
        await pool.query(`DELETE FROM shipment_order_lines WHERE shipment_order_id IN
          (SELECT id FROM shipment_orders WHERE checkout_order_id=$1)`, [id]);
        await pool.query('DELETE FROM shipment_orders WHERE checkout_order_id=$1', [id]);
        await pool.query('DELETE FROM checkout_orders WHERE id=$1', [id]);
      }
    }
    if (addressId) await pool.query('DELETE FROM customer_addresses WHERE id=$1', [addressId]);
    if (seeded) await runQaCatalogFixture('reset', runId, process.env.DATABASE_URL);
    await pool.end();
  }
});
