import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { AuthRepository } from '../src/auth/repository.ts';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { assertOrderMutationQaTarget, skipWithoutFulfillmentSchema,
  skipWithoutOrderSchema } from './order-schema-guard.mjs';

const origin = 'http://127.0.0.1:9091';
const fingerprint = 'a'.repeat(64);

async function requireTask7Schema(context, pool) {
  await assertOrderMutationQaTarget(pool, process.env.S5_PAYMENT_TEST_DB_SYSTEM_ID);
  if (await skipWithoutOrderSchema(context, pool, true)) return false;
  if (await skipWithoutFulfillmentSchema(context, pool, true)) return false;
  const migrations = (await pool.query(
    'SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations',
  )).rows[0].count;
  assert.equal(migrations, 19);
  return true;
}

test('customer order HTTP is owned, same-origin and idempotent without claiming payment', {
  skip: !process.env.DATABASE_URL || !process.env.S5_PAYMENT_TEST_DB_SYSTEM_ID,
}, async (context) => {
  const runId = randomBytes(4).toString('hex');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let seeded = false; let app; let addressId; let deletedId; let foreignAddressId; let otherBuyerId;
  let reservationId; let orderId;
  try {
    if (!await requireTask7Schema(context, pool)) return;
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
    assert.equal((await fetch(`${url}/${orderId}`, { headers: { cookie: seller } })).status, 403);
    assert.equal((await fetch(`${url}/${orderId}`, { headers: { cookie: otherBuyer } })).status, 404);
    assert.equal((await fetch(`${url}/${randomUUID()}`, { headers: { cookie: buyer } })).status, 404);

    const shipment = (await pool.query(`SELECT s.id,s.seller_id AS "sellerId",
      r.account_id AS "sellerAccountId" FROM shipment_orders s
      JOIN account_roles r ON r.seller_id=s.seller_id AND r.role='seller'
      WHERE s.checkout_order_id=$1`, [orderId])).rows[0];
    const adminId = (await pool.query(`SELECT account_id FROM account_identities
      WHERE identifier=$1`, [names.emails[4]])).rows[0].account_id;
    assert.ok(shipment?.id && shipment.sellerId && shipment.sellerAccountId && adminId);
    await pool.query(`UPDATE checkout_orders SET status='PAID',paid_at=$2,ended_at=$2 WHERE id=$1`,
      [orderId, new Date('2026-10-06T01:00:00.000Z')]);
    await pool.query(`UPDATE shipment_orders SET status='PAID' WHERE id=$1`, [shipment.id]);
    await pool.query(`UPDATE shipment_fulfillments SET status='DELAYED',
      expected_ship_date='2026-10-08',updated_at=$2 WHERE shipment_order_id=$1`,
    [shipment.id, new Date('2026-10-06T01:10:00.000Z')]);
    const insertEvent = async ({ action, from, to, actorId = null, actorRole = null,
      actorSellerId = null, reason = null, customerMessage = null, before, after, at }) => {
      const scope = actorId ?? (action === 'PAYMENT_CONFIRMED' ? 'system:payment' : 'system:refund');
      await pool.query(`INSERT INTO shipment_fulfillment_events
        (shipment_order_id,action,from_status,to_status,actor_account_id,actor_role,
          actor_seller_id,reason,customer_message,before_snapshot,after_snapshot,
          idempotency_scope,idempotency_key,request_fingerprint,occurred_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15)`, [
        shipment.id, action, from, to, actorId, actorRole, actorSellerId, reason,
        customerMessage, JSON.stringify(before), JSON.stringify(after), scope,
        randomUUID(), fingerprint, new Date(at),
      ]);
    };
    await insertEvent({ action: 'PAYMENT_CONFIRMED', from: 'PAYMENT_PENDING', to: 'READY',
      before: { status: 'PAYMENT_PENDING', expectedShipDate: null,
        carrierCode: null, trackingNumber: null },
      after: { status: 'READY', expectedShipDate: '2026-10-07',
        carrierCode: null, trackingNumber: null }, at: '2026-10-06T01:00:00.000Z' });
    await insertEvent({ action: 'REPORT_DELAY', from: 'READY', to: 'DELAYED',
      actorId: shipment.sellerAccountId, actorRole: 'seller', actorSellerId: shipment.sellerId,
      reason: '폭우로 수확 지연', customerMessage: '수확이 하루 늦어졌습니다',
      before: { status: 'READY', expectedShipDate: '2026-10-07',
        carrierCode: null, trackingNumber: null },
      after: { status: 'DELAYED', expectedShipDate: '2026-10-08',
        carrierCode: null, trackingNumber: null }, at: '2026-10-06T01:10:00.000Z' });

    const delayedResponse = await fetch(`${url}/${orderId}`, { headers: { cookie: buyer } });
    assert.equal(delayedResponse.status, 200);
    const delayedOrder = await delayedResponse.json();
    const delayed = delayedOrder.shipments[0].fulfillment;
    assert.deepEqual(delayed, {
      status: 'DELAYED', expectedShipDate: '2026-10-08', delayedReason: '폭우로 수확 지연',
      customerMessage: '수확이 하루 늦어졌습니다', carrier: null, trackingNumber: null,
      packedAt: null, shippedAt: null, updatedAt: '2026-10-06T01:10:00.000Z',
      events: [
        { action: 'PAYMENT_CONFIRMED', status: 'READY', expectedShipDate: '2026-10-07',
          customerMessage: null, occurredAt: '2026-10-06T01:00:00.000Z' },
        { action: 'REPORT_DELAY', status: 'DELAYED', expectedShipDate: '2026-10-08',
          customerMessage: '수확이 하루 늦어졌습니다',
          occurredAt: '2026-10-06T01:10:00.000Z' },
      ],
    });

    await insertEvent({ action: 'ADMIN_CORRECT', from: 'DELAYED', to: 'DELAYED',
      actorId: adminId, actorRole: 'admin', reason: '관리자 내부 조정 사유',
      customerMessage: '10월 9일 출고 예정으로 확인했습니다',
      before: { status: 'DELAYED', expectedShipDate: '2026-10-08',
        carrierCode: null, trackingNumber: null },
      after: { status: 'DELAYED', expectedShipDate: '2026-10-09',
        carrierCode: null, trackingNumber: null }, at: '2026-10-06T01:20:00.000Z' });
    await insertEvent({ action: 'RESUME_PACKING', from: 'DELAYED', to: 'PACKING',
      actorId: shipment.sellerAccountId, actorRole: 'seller', actorSellerId: shipment.sellerId,
      before: { status: 'DELAYED', expectedShipDate: '2026-10-09',
        carrierCode: null, trackingNumber: null },
      after: { status: 'PACKING', expectedShipDate: '2026-10-09',
        carrierCode: null, trackingNumber: null }, at: '2026-10-06T01:30:00.000Z' });
    await insertEvent({ action: 'MARK_SHIPPED', from: 'PACKING', to: 'SHIPPED',
      actorId: shipment.sellerAccountId, actorRole: 'seller', actorSellerId: shipment.sellerId,
      before: { status: 'PACKING', expectedShipDate: '2026-10-09',
        carrierCode: null, trackingNumber: null },
      after: { status: 'SHIPPED', expectedShipDate: '2026-10-09',
        carrierCode: 'hanjin', trackingNumber: 'QA123456' }, at: '2026-10-06T01:40:00.000Z' });
    await pool.query(`UPDATE shipment_fulfillments SET status='SHIPPED',
      expected_ship_date='2026-10-09',packed_at=$2,carrier_code='hanjin',carrier_name=NULL,
      tracking_number='QA123456',first_shipped_at=$3,shipped_at=$3,updated_at=$3
      WHERE shipment_order_id=$1`, [shipment.id, new Date('2026-10-06T01:30:00.000Z'),
      new Date('2026-10-06T01:40:00.000Z')]);

    const shippedResponse = await fetch(`${url}/${orderId}`, { headers: { cookie: buyer } });
    assert.equal(shippedResponse.status, 200);
    const shipped = (await shippedResponse.json()).shipments[0].fulfillment;
    assert.deepEqual(Object.keys(shipped).sort(), [
      'carrier', 'customerMessage', 'events', 'expectedShipDate', 'packedAt',
      'shippedAt', 'status', 'trackingNumber', 'updatedAt',
    ].sort());
    assert.equal(shipped.status, 'SHIPPED');
    assert.equal(shipped.expectedShipDate, '2026-10-09');
    assert.deepEqual(shipped.carrier, { code: 'hanjin', displayName: '한진택배' });
    assert.equal(shipped.trackingNumber, 'QA123456');
    assert.equal(shipped.customerMessage, '10월 9일 출고 예정으로 확인했습니다');
    assert.equal(shipped.events.length, 5);
    for (const event of shipped.events) assert.deepEqual(Object.keys(event).sort(), [
      'action', 'customerMessage', 'expectedShipDate', 'occurredAt', 'status',
    ].sort());
    assert.deepEqual(shipped.events.map(({ action, status }) => ({ action, status })), [
      { action: 'PAYMENT_CONFIRMED', status: 'READY' },
      { action: 'REPORT_DELAY', status: 'DELAYED' },
      { action: 'ADMIN_CORRECT', status: 'DELAYED' },
      { action: 'RESUME_PACKING', status: 'PACKING' },
      { action: 'MARK_SHIPPED', status: 'SHIPPED' },
    ]);
    const publicFulfillment = JSON.stringify(shipped);
    for (const secret of ['관리자 내부 조정 사유', adminId, shipment.sellerAccountId,
      shipment.sellerId, '받는 분', '01000000000', '시험 주소', fingerprint,
      'idempotency', 'provider']) assert.equal(publicFulfillment.includes(secret), false, secret);
  } finally {
    if (app) await app.close();
    if (orderId) {
      await pool.query('DELETE FROM order_promotion_allocations WHERE checkout_order_id=$1', [orderId]);
      await pool.query('DELETE FROM order_status_events WHERE checkout_order_id=$1', [orderId]);
      await pool.query(`DELETE FROM shipment_fulfillment_events WHERE shipment_order_id IN
        (SELECT id FROM shipment_orders WHERE checkout_order_id=$1)`, [orderId]);
      await pool.query(`DELETE FROM shipment_order_lines WHERE shipment_order_id IN
        (SELECT id FROM shipment_orders WHERE checkout_order_id=$1)`, [orderId]);
      await pool.query(`DELETE FROM shipment_fulfillments WHERE shipment_order_id IN
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
