import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { MockPaymentAdapter } from '../src/payments/mock-adapter.ts';
import { getPaymentAttempt, recordVerifiedPaymentEvent, startPaymentAttempt } from '../src/payments/service.ts';

test('payment attempt belongs to its buyer and an idempotency key cannot change outcome', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const ids = {};
  try {
    ids.owner = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    ids.other = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    ids.address = (await pool.query(`INSERT INTO customer_addresses
      (account_id,label,recipient_name,phone,postal_code,line1)
      VALUES ($1,'집','QA 고객','01000000000','12345','시험 주소') RETURNING id`, [ids.owner])).rows[0].id;
    ids.reservation = (await pool.query(`INSERT INTO checkout_reservations
      (account_id,idempotency_key,expires_at) VALUES ($1,$2,now()+interval '15 minutes') RETURNING id`,
    [ids.owner, randomUUID()])).rows[0].id;
    ids.order = (await pool.query(`INSERT INTO checkout_orders
      (account_id,reservation_id,idempotency_key,request_fingerprint,address_id,
       recipient_name,phone,postal_code,line1,goods_won,goods_discount_won,
       shipping_fee_won,shipping_support_won,payable_won,expires_at)
      VALUES ($1,$2,$3,$4,$5,'QA 고객','01000000000','12345','시험 주소',
        10000,0,3000,0,13000,now()+interval '10 minutes') RETURNING id`,
    [ids.owner, ids.reservation, randomUUID(), 'a'.repeat(64), ids.address])).rows[0].id;

    const key = randomUUID();
    const env = { APP_ENV: 'development', PAYMENT_MODE: 'mock' };
    await assert.rejects(startPaymentAttempt(pool, ids.owner, ids.order, randomUUID(),
      'approve', { APP_ENV: 'production', PAYMENT_MODE: 'mock' }));
    const first = await startPaymentAttempt(pool, ids.owner, ids.order, key, 'approve', env);
    assert.equal(first.amountWon, 13000);
    assert.equal(first.status, 'PENDING');
    const repeated = await startPaymentAttempt(pool, ids.owner, ids.order, key, 'approve', env);
    assert.equal(repeated.id, first.id);
    await assert.rejects(startPaymentAttempt(pool, ids.owner, ids.order, key, 'decline', env),
      /Payment conflict/);
    await assert.rejects(startPaymentAttempt(pool, ids.other, ids.order, randomUUID(), 'approve', env),
      /Payment unavailable/);
    assert.equal(await getPaymentAttempt(pool, ids.other, ids.order, first.id), null);
    assert.equal((await getPaymentAttempt(pool, ids.owner, ids.order, first.id)).status, 'PENDING');

    const saved = await pool.query('SELECT provider_order_id FROM payment_attempts WHERE id=$1', [first.id]);
    const verified = new MockPaymentAdapter().verify(saved.rows[0].provider_order_id, 'approve');
    const event = await recordVerifiedPaymentEvent(pool, first.id, verified);
    assert.equal(event.processingStatus, 'PENDING_PROCESSING');
    const duplicate = await recordVerifiedPaymentEvent(pool, first.id, verified);
    assert.equal(duplicate.id, event.id);
    await assert.rejects(recordVerifiedPaymentEvent(pool, first.id,
      { ...verified, amountWon: verified.amountWon + 1 }), /Payment event conflict/);
    const conflicts = await pool.query(`SELECT original_event_id,incoming_attempt_id,
      incoming_fingerprint,reason,received_at FROM payment_event_conflicts
      WHERE original_event_id=$1`, [event.id]);
    assert.equal(conflicts.rowCount, 1);
    assert.equal(conflicts.rows[0].original_event_id, event.id);
    assert.equal(conflicts.rows[0].incoming_attempt_id, first.id);
    assert.match(conflicts.rows[0].incoming_fingerprint, /^[0-9a-f]{64}$/);
    assert.equal(conflicts.rows[0].reason, 'FINGERPRINT_MISMATCH');
    assert.ok(conflicts.rows[0].received_at instanceof Date);
    const original = await pool.query(`SELECT event_fingerprint,amount_won,processing_status
      FROM payment_events WHERE id=$1`, [event.id]);
    assert.equal(original.rows[0].amount_won, 13000);
    assert.equal(original.rows[0].processing_status, 'PENDING_PROCESSING');
    const rows = await pool.query('SELECT count(*)::int AS n FROM payment_events WHERE payment_attempt_id=$1',
      [first.id]);
    assert.equal(rows.rows[0].n, 1);
    const unknownOrder = await recordVerifiedPaymentEvent(pool, first.id,
      { ...verified, eventId: `mock:event:${randomUUID()}`, orderId: randomUUID() });
    assert.equal(unknownOrder.processingStatus, 'REVIEW_REQUIRED');
    const wrongAmount = await recordVerifiedPaymentEvent(pool, first.id,
      { ...verified, eventId: `mock:event:${randomUUID()}`, amountWon: 13001 });
    assert.equal(wrongAmount.processingStatus, 'REVIEW_REQUIRED');
    const reviewed = await pool.query(`SELECT count(*)::int AS n FROM payment_events
      WHERE payment_attempt_id=$1 AND processing_status='REVIEW_REQUIRED'`, [first.id]);
    assert.equal(reviewed.rows[0].n, 2);
    assert.equal((await getPaymentAttempt(pool, ids.owner, ids.order, first.id)).status,
      'REVIEW_REQUIRED');
    assert.equal((await pool.query('SELECT status FROM checkout_orders WHERE id=$1', [ids.order])).rows[0].status,
      'PENDING_PAYMENT');
  } finally {
    if (ids.order) {
      const hasConflictTable = await pool.query(`SELECT to_regclass('public.payment_event_conflicts') AS relation`);
      if (hasConflictTable.rows[0].relation) {
        await pool.query(`DELETE FROM payment_event_conflicts WHERE incoming_attempt_id IN
          (SELECT id FROM payment_attempts WHERE checkout_order_id=$1)`, [ids.order]);
      }
      await pool.query(`DELETE FROM payment_events WHERE payment_attempt_id IN
        (SELECT id FROM payment_attempts WHERE checkout_order_id=$1)`, [ids.order]);
      await pool.query('DELETE FROM payment_attempts WHERE checkout_order_id=$1', [ids.order]);
      await pool.query('DELETE FROM checkout_orders WHERE id=$1', [ids.order]);
    }
    if (ids.reservation) await pool.query('DELETE FROM checkout_reservations WHERE id=$1', [ids.reservation]);
    if (ids.address) await pool.query('DELETE FROM customer_addresses WHERE id=$1', [ids.address]);
    if (ids.owner) await pool.query('DELETE FROM accounts WHERE id=$1', [ids.owner]);
    if (ids.other) await pool.query('DELETE FROM accounts WHERE id=$1', [ids.other]);
    await pool.end();
  }
});
