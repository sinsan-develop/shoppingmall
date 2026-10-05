import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { AuthRepository } from '../src/auth/repository.ts';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';

const origin = 'http://127.0.0.1:9091';

test('customer mock payment HTTP is owned, same-origin, idempotent and verifies before PAID', {
  skip: !process.env.DATABASE_URL,
}, async (context) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const runId = randomBytes(4).toString('hex');
  const previous = { APP_ENV: process.env.APP_ENV, PAYMENT_MODE: process.env.PAYMENT_MODE,
    API_HOST: process.env.API_HOST };
  let seeded = false; let app; let otherBuyerId; let addressId; let reservationId; let orderId;
  try {
    const ready = await pool.query(`SELECT to_regclass('public.payment_events') IS NOT NULL AS ready`);
    if (!ready.rows[0].ready) {
      if (process.env.S4_PAYMENT_SCHEMA_REQUIRED === '1') throw new Error('S4 payment migration 0013 required');
      context.skip('S4 payment migration 0013 not applied');
      return;
    }
    await runQaCatalogFixture('seed', runId, process.env.DATABASE_URL, 'test-only-password-12345');
    seeded = true;
    const names = qaNames(runId);
    const buyerId = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [names.emails[0]])).rows[0].account_id;
    const otherEmail = `qa+${runId}-payment-other@example.invalid`;
    otherBuyerId = await new AuthRepository(pool).createCustomerAccount(
      otherEmail, 'test-only-password-12345');
    const optionId = (await pool.query(`SELECT o.id FROM product_options o
      JOIN product_revisions r ON r.id=o.revision_id WHERE r.title=$1`,
    [`qa-${runId}-고추`])).rows[0].id;
    await pool.query('INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,1)',
      [buyerId, optionId]);
    addressId = (await pool.query(`INSERT INTO customer_addresses
      (account_id,label,recipient_name,phone,postal_code,line1)
      VALUES ($1,'시험','받는 분','01000000000','12345','시험 주소') RETURNING id`,
    [buyerId])).rows[0].id;
    process.env.APP_ENV = 'development';
    process.env.PAYMENT_MODE = 'mock';
    process.env.API_HOST = '127.0.0.1';
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    async function login(email, role) {
      const response = await fetch(`${base}/auth/login`, { method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'test-only-password-12345', role }) });
      assert.equal(response.status, 201);
      return response.headers.get('set-cookie')?.split(';')[0];
    }
    const buyer = await login(names.emails[0], 'customer');
    const other = await login(otherEmail, 'customer');
    const seller = await login(names.emails[1], 'seller');
    const held = await fetch(`${base}/customer/checkout/reservations`, { method: 'POST',
      headers: { cookie: buyer, origin, 'idempotency-key': randomUUID() } });
    assert.equal(held.status, 201);
    const reservation = await held.json();
    reservationId = reservation.id;
    const submitted = await fetch(`${base}/customer/checkout/orders`, { method: 'POST',
      headers: { cookie: buyer, origin, 'content-type': 'application/json',
        'idempotency-key': randomUUID() },
      body: JSON.stringify({ reservationId, addressId, selections: {},
        expectedPayableWon: reservation.quote.totalWon }) });
    assert.equal(submitted.status, 201, await submitted.clone().text());
    orderId = (await submitted.json()).id;
    const url = `${base}/customer/checkout/orders/${orderId}/payment-attempts`;
    const key = randomUUID();
    const post = (testOutcome, cookie = buyer, requestOrigin = origin, idempotencyKey = key) =>
      fetch(url, { method: 'POST', headers: { cookie, origin: requestOrigin,
        'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: JSON.stringify({ testOutcome }) });
    assert.equal((await post('approve', '')).status, 401);
    assert.equal((await post('approve', seller)).status, 403);
    assert.equal((await post('approve', other)).status, 404);
    assert.equal((await post('approve', buyer, 'http://invalid.test')).status, 403);
    assert.equal((await post('approve', buyer, origin, 'invalid')).status, 400);
    const delayed = await post('delay');
    assert.equal(delayed.status, 201, await delayed.clone().text());
    const pending = await delayed.json();
    assert.equal(pending.status, 'PENDING');
    assert.equal(pending.mockOnly, true);
    assert.equal(pending.amountWon, reservation.quote.totalWon);
    assert.equal((await post('delay')).status, 200);
    assert.equal((await post('approve')).status, 409);
    const attemptUrl = `${url}/${pending.id}`;
    assert.equal((await fetch(attemptUrl, { headers: { cookie: buyer } })).status, 200);
    assert.equal((await fetch(attemptUrl, { headers: { cookie: other } })).status, 404);
    assert.equal((await fetch(attemptUrl, { headers: { cookie: seller } })).status, 403);
    assert.equal((await fetch(`${base}/customer/checkout/orders/${orderId}`,
      { headers: { cookie: buyer } }).then((r) => r.json())).status, 'PENDING_PAYMENT');
    const declined = await post('decline', buyer, origin, randomUUID());
    assert.equal(declined.status, 201, await declined.clone().text());
    assert.equal((await declined.json()).status, 'DECLINED');
    const approved = await post('approve', buyer, origin, randomUUID());
    assert.equal(approved.status, 201, await approved.clone().text());
    assert.equal((await approved.json()).status, 'APPROVED');
    const paid = await fetch(`${base}/customer/checkout/orders/${orderId}`,
      { headers: { cookie: buyer } }).then((r) => r.json());
    assert.equal(paid.status, 'PAID');
    assert.ok(paid.paidAt);
    assert.ok(paid.shipments.every((part) => part.status === 'PAID'));
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM order_status_events
      WHERE checkout_order_id=$1 AND status='PAID'`, [orderId])).rows[0].n, 1);
    process.env.API_HOST = '0.0.0.0';
    assert.equal((await post('approve', buyer, origin, randomUUID())).status, 404);
  } finally {
    if (app) await app.close();
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
    if (orderId) {
      await pool.query(`DELETE FROM payment_events WHERE payment_attempt_id IN
        (SELECT id FROM payment_attempts WHERE checkout_order_id=$1)`, [orderId]);
      await pool.query('DELETE FROM payment_attempts WHERE checkout_order_id=$1', [orderId]);
      await pool.query('DELETE FROM order_promotion_allocations WHERE checkout_order_id=$1', [orderId]);
      await pool.query('DELETE FROM order_status_events WHERE checkout_order_id=$1', [orderId]);
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
    if (otherBuyerId) {
      await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [otherBuyerId]);
      await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [otherBuyerId]);
      await pool.query('DELETE FROM account_roles WHERE account_id=$1', [otherBuyerId]);
      await pool.query('DELETE FROM account_identities WHERE account_id=$1', [otherBuyerId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [otherBuyerId]);
    }
    if (seeded) await runQaCatalogFixture('reset', runId, process.env.DATABASE_URL);
    await pool.end();
  }
});
