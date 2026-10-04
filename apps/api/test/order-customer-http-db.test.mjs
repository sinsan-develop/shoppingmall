import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { AuthRepository } from '../src/auth/repository.ts';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';

const origin = 'http://127.0.0.1:9091';
test('customer order HTTP is owned, same-origin and idempotent without claiming payment', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomBytes(4).toString('hex');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let seeded = false; let app; let addressId; let deletedId; let foreignAddressId; let otherBuyerId;
  let reservationId; let orderId;
  try {
    await runQaCatalogFixture('seed', runId, process.env.DATABASE_URL, 'test-only-password-12345');
    seeded = true;
    const names = qaNames(runId);
    const buyerId = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [names.emails[0]])).rows[0].account_id;
    const otherEmail = `qa+${runId}-order-other@example.invalid`;
    otherBuyerId = await new AuthRepository(pool).createCustomerAccount(
      otherEmail, 'test-only-password-12345');
    const optionId = (await pool.query(`SELECT o.id FROM product_options o
      JOIN product_revisions r ON r.id=o.revision_id WHERE r.title=$1`,
    [`qa-${runId}-고추`])).rows[0].id;
    await pool.query('INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,1)',
      [buyerId, optionId]);
    async function address(deleted) {
      return (await pool.query(`INSERT INTO customer_addresses
        (account_id,label,recipient_name,phone,postal_code,line1,deleted_at)
        VALUES ($1,'시험','받는 분','01000000000','12345','시험 주소',$2) RETURNING id`,
      [buyerId, deleted ? new Date() : null])).rows[0].id;
    }
    addressId = await address(false);
    deletedId = await address(true);
    foreignAddressId = (await pool.query(`INSERT INTO customer_addresses
      (account_id,label,recipient_name,phone,postal_code,line1)
      VALUES ($1,'타인','다른 분','01000000000','12345','타인 주소') RETURNING id`,
    [otherBuyerId])).rows[0].id;
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
    const otherBuyer = await login(otherEmail, 'customer');
    const seller = await login(names.emails[1], 'seller');
    const reservation = await fetch(`${base}/customer/checkout/reservations`, { method: 'POST',
      headers: { cookie: buyer, origin, 'idempotency-key': randomUUID() } });
    assert.equal(reservation.status, 201);
    const hold = await reservation.json();
    reservationId = hold.id;
    const url = `${base}/customer/checkout/orders`;
    const key = randomUUID();
    const body = { reservationId, addressId, selections: {}, expectedPayableWon: hold.quote.totalWon };
    const post = (payload = body, cookie = buyer, requestOrigin = origin, idKey = key) =>
      fetch(url, { method: 'POST', headers: { cookie, origin: requestOrigin,
        'idempotency-key': idKey, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal((await post(body, '')).status, 401);
    assert.equal((await post(body, seller)).status, 403);
    assert.equal((await post(body, buyer, 'http://invalid.test')).status, 403);
    assert.equal((await post({ ...body, addressId: deletedId }, buyer, origin, randomUUID())).status, 409);
    assert.equal((await post({ ...body, addressId: foreignAddressId }, buyer, origin, randomUUID())).status, 404);
    assert.notEqual((await post(body, otherBuyer, origin, randomUUID())).status, 201);
    const created = await post();
    assert.equal(created.status, 201, await created.clone().text());
    const order = await created.json();
    orderId = order.id;
    assert.equal(order.status, 'PENDING_PAYMENT');
    assert.equal(order.payableWon, body.expectedPayableWon);
    assert.equal((await post()).status, 200);
    assert.equal((await post({ ...body, expectedPayableWon: body.expectedPayableWon - 1 })).status, 409);
    assert.equal((await fetch(`${url}/${orderId}`, { headers: { cookie: buyer } })).status, 200);
    assert.equal((await fetch(`${url}/${orderId}`, { headers: { cookie: seller } })).status, 403);
    assert.equal((await fetch(`${url}/${orderId}`, { headers: { cookie: otherBuyer } })).status, 404);
    assert.equal((await fetch(`${url}/${randomUUID()}`, { headers: { cookie: buyer } })).status, 404);
  } finally {
    if (app) await app.close();
    if (orderId) {
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
    if (deletedId) await pool.query('DELETE FROM customer_addresses WHERE id=$1', [deletedId]);
    if (foreignAddressId) await pool.query('DELETE FROM customer_addresses WHERE id=$1', [foreignAddressId]);
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
