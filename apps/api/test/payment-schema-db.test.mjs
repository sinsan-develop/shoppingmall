import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

test('0013 stores one payment attempt and event per provider key while keeping paid orders valid', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  async function rejects(sql, args, code) {
    await client.query('SAVEPOINT payment_constraint');
    try {
      await assert.rejects(client.query(sql, args), (error) => error.code === code);
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT payment_constraint');
      await client.query('RELEASE SAVEPOINT payment_constraint');
    }
  }
  try {
    for (const relation of ['checkout_orders', 'payment_attempts', 'payment_events']) {
      const found = await client.query('SELECT to_regclass($1) AS relation', [`public.${relation}`]);
      assert.ok(found.rows[0].relation, `${relation} must exist after 0013`);
    }
    await client.query('BEGIN');
    const accountId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const addressId = (await client.query(`INSERT INTO customer_addresses
      (account_id,label,recipient_name,phone,postal_code,line1)
      VALUES ($1,'집','QA 고객','01000000000','12345','시험 주소') RETURNING id`, [accountId])).rows[0].id;
    const reservationId = (await client.query(`INSERT INTO checkout_reservations
      (account_id,idempotency_key,expires_at) VALUES ($1,$2,now()+interval '15 minutes') RETURNING id`,
    [accountId, randomUUID()])).rows[0].id;
    const orderId = (await client.query(`INSERT INTO checkout_orders
      (account_id,reservation_id,idempotency_key,request_fingerprint,address_id,
       recipient_name,phone,postal_code,line1,goods_won,goods_discount_won,
       shipping_fee_won,shipping_support_won,payable_won,expires_at)
      VALUES ($1,$2,$3,$4,$5,'QA 고객','01000000000','12345','시험 주소',
        10000,0,3000,0,13000,now()+interval '10 minutes') RETURNING id`,
    [accountId, reservationId, randomUUID(), 'a'.repeat(64), addressId])).rows[0].id;

    const attemptArgs = [orderId, 'mock', `mock:${randomUUID()}`, 13000, randomUUID(), 'b'.repeat(64)];
    const insertAttempt = `INSERT INTO payment_attempts
      (checkout_order_id,provider,provider_order_id,requested_won,idempotency_key,request_fingerprint)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`;
    const attemptId = (await client.query(insertAttempt, attemptArgs)).rows[0].id;
    await rejects(insertAttempt, attemptArgs, '23505');
    await rejects(insertAttempt, [orderId, 'mock', attemptArgs[2], 13000, randomUUID(), 'c'.repeat(64)], '23505');
    await rejects(insertAttempt, [orderId, 'mock', `mock:${randomUUID()}`, -1, randomUUID(), 'c'.repeat(64)], '23514');

    const eventArgs = [attemptId, 'mock', `event:${randomUUID()}`, 'APPROVED', orderId,
      `payment:${randomUUID()}`, 13000, 'd'.repeat(64)];
    const insertEvent = `INSERT INTO payment_events
      (payment_attempt_id,provider,provider_event_id,outcome,verified_order_id,
       provider_payment_id,amount_won,event_fingerprint)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`;
    await client.query(insertEvent, eventArgs);
    await rejects(insertEvent, eventArgs, '23505');
    await rejects(insertEvent, [attemptId, 'mock', `event:${randomUUID()}`,
      'APPROVED', orderId, `payment:${randomUUID()}`, -1, 'd'.repeat(64)], '23514');
    await rejects(insertEvent, [attemptId, 'mock', `event:${randomUUID()}`,
      'SUCCESS', orderId, `payment:${randomUUID()}`, 13000, 'd'.repeat(64)], '23514');

    await client.query(`UPDATE checkout_orders SET status='PAID',paid_at=clock_timestamp(),
      ended_at=clock_timestamp() WHERE id=$1`, [orderId]);
    await client.query(`INSERT INTO order_status_events (checkout_order_id,status,reason)
      VALUES ($1,'PAID','Verified payment')`, [orderId]);
    const paid = await client.query('SELECT status,paid_at FROM checkout_orders WHERE id=$1', [orderId]);
    assert.equal(paid.rows[0].status, 'PAID');
    assert.ok(paid.rows[0].paid_at);
    await client.query('ROLLBACK');
  } finally {
    try { await client.query('ROLLBACK'); } catch { /* already closed */ }
    client.release();
    await pool.end();
  }
});
