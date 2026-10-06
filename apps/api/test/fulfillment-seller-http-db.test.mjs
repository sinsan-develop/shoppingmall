import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { qaNames } from '../scripts/qa-fixture.ts';
import { createApp } from '../src/app.ts';
import {
  assertOrderMutationQaTarget,
  skipWithoutFulfillmentSchema,
  skipWithoutOrderSchema,
} from './order-schema-guard.mjs';

const origin = 'http://127.0.0.1:9091';
const password = 'test-only-password-12345';
const fingerprint = 'd'.repeat(64);
const expectedShipDate = '2026-10-08';

async function requirePrivateSchema(context, pool) {
  await assertOrderMutationQaTarget(pool, process.env.S5_PAYMENT_TEST_DB_SYSTEM_ID);
  if (await skipWithoutOrderSchema(context, pool, true)) return false;
  if (await skipWithoutFulfillmentSchema(context, pool, true)) return false;
  const schema = (await pool.query(`SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations,
    to_regclass('public.refund_cases') IS NOT NULL AS refunds`)).rows[0];
  assert.deepEqual(schema, { migrations: 16, refunds: true });
  return true;
}

function fixtureState() {
  return {
    runId: randomBytes(4).toString('hex'),
    seedAttempted: false,
    orderIds: [],
    reservationIds: [],
    shipmentIds: [],
  };
}

function fulfillmentColumns(status, paidAt) {
  const changedAt = paidAt ?? new Date('2026-10-06T00:00:00.000Z');
  return {
    expectedShipDate: status === 'PAYMENT_PENDING' ? null : expectedShipDate,
    packedAt: status === 'PACKING' ? changedAt : null,
    carrierCode: status === 'SHIPPED' ? 'hanjin' : null,
    carrierName: null,
    trackingNumber: status === 'SHIPPED' ? 'QA123456' : null,
    firstShippedAt: status === 'SHIPPED' ? changedAt : null,
    shippedAt: status === 'SHIPPED' ? changedAt : null,
    cancelledAt: status === 'CANCELLED' ? changedAt : null,
  };
}

async function seedShipment(pool, fixture, {
  product, fulfillmentSellerId, shippingMode = 'seller_direct', checkoutStatus = 'PAID',
  shipmentStatus = 'PAID', fulfillmentStatus = 'READY', paidAt, label,
}) {
  const createdAt = paidAt
    ? new Date(paidAt.getTime() - 10 * 60_000) : new Date('2026-10-06T00:00:00.000Z');
  const reservationId = (await pool.query(`INSERT INTO checkout_reservations
    (account_id,idempotency_key,status,created_at,expires_at,ended_at)
    VALUES ($1,$2,'CONSUMED',$3,$4,$5) RETURNING id`, [
    fixture.customerId, randomUUID(), createdAt,
    new Date(createdAt.getTime() + 60 * 60_000), new Date(createdAt.getTime() + 60_000),
  ])).rows[0].id;
  fixture.reservationIds.push(reservationId);
  await pool.query(`INSERT INTO checkout_reservation_lines(reservation_id,option_id,quantity)
    VALUES ($1,$2,3)`, [reservationId, product.optionId]);
  const checkoutPaidAt = checkoutStatus === 'PAID' ? paidAt : null;
  const orderId = (await pool.query(`INSERT INTO checkout_orders
    (account_id,reservation_id,idempotency_key,request_fingerprint,address_id,
      recipient_name,phone,postal_code,line1,line2,goods_won,goods_discount_won,
      shipping_fee_won,shipping_support_won,payable_won,status,created_at,expires_at,ended_at,paid_at)
    VALUES ($1,$2,$3,$4,$5,'가상고객','01012345678','12345','서울시 가상구 테스트로 1',
      '가상 101호',12000,2000,3000,1000,12000,$6,$7,$8,$9,$10) RETURNING id`, [
    fixture.customerId, reservationId, randomUUID(), fingerprint, fixture.addressId,
    checkoutStatus, createdAt, new Date(createdAt.getTime() + 60 * 60_000),
    checkoutStatus === 'PAID' ? checkoutPaidAt : null, checkoutPaidAt,
  ])).rows[0].id;
  fixture.orderIds.push(orderId);
  const sellerId = shippingMode === 'seller_direct' ? product.sellerId : null;
  const shipmentKey = shippingMode === 'seller_direct'
    ? `seller:${product.sellerId}:${label}` : `owool:${label}`;
  const shipmentId = (await pool.query(`INSERT INTO shipment_orders
    (checkout_order_id,shipment_key,shipping_mode,seller_id,goods_won,goods_discount_won,
      shipping_fee_won,shipping_support_won,payable_won,status)
    VALUES ($1,$2,$3,$4,12000,2000,3000,1000,12000,$5) RETURNING id`, [
    orderId, shipmentKey, shippingMode, sellerId, shipmentStatus,
  ])).rows[0].id;
  fixture.shipmentIds.push(shipmentId);
  await pool.query(`INSERT INTO shipment_order_lines
    (shipment_order_id,product_id,option_id,seller_id,product_name,option_name,
      unit_price_won,quantity,goods_discount_won,goods_payable_won)
    VALUES ($1,$2,$3,$4,$5,'기본',4000,3,2000,10000)`, [
    shipmentId, product.productId, product.optionId, product.sellerId, product.title,
  ]);
  const fields = fulfillmentColumns(fulfillmentStatus, checkoutPaidAt);
  await pool.query(`INSERT INTO shipment_fulfillments
    (shipment_order_id,fulfillment_seller_id,status,expected_ship_date,packed_at,
      carrier_code,carrier_name,tracking_number,first_shipped_at,shipped_at,cancelled_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [
    shipmentId, fulfillmentSellerId, fulfillmentStatus, fields.expectedShipDate, fields.packedAt,
    fields.carrierCode, fields.carrierName, fields.trackingNumber, fields.firstShippedAt,
    fields.shippedAt, fields.cancelledAt, checkoutPaidAt ?? createdAt,
  ]);
  return {
    orderId, shipmentId, paidAt: checkoutPaidAt?.toISOString() ?? null,
    status: fulfillmentStatus, product,
  };
}

async function seedCompletedRefund(pool, fixture, shipment) {
  const refundId = (await pool.query(`INSERT INTO refund_cases
    (checkout_order_id,shipment_order_id,requester_account_id,requester_role,reason_code,reason,
      pre_shipment_evidence,pre_shipment_confirmed_by,pre_shipment_confirmed_at,idempotency_key,
      request_fingerprint,goods_refund_won,shipping_refund_won,total_refund_won,status,decided_at,
      completed_at,decision_by,decision_reason,decision_idempotency_key,decision_fingerprint)
    VALUES ($1,$2,$3,'customer','customer_request','가상 부분 환불',
      'ADMIN_CONFIRMED_NOT_DISPATCHED',$4,clock_timestamp(),$5,$6,3333,0,3333,'REFUNDED',
      clock_timestamp(),clock_timestamp(),$4,'가상 환불 승인',$7,$6) RETURNING id`, [
    shipment.orderId, shipment.shipmentId, fixture.customerId, fixture.adminId,
    randomUUID(), fingerprint, randomUUID(),
  ])).rows[0].id;
  await pool.query(`INSERT INTO refund_case_lines
    (refund_case_id,shipment_order_id,option_id,quantity,goods_refund_won)
    VALUES ($1,$2,$3,1,3333)`, [refundId, shipment.shipmentId, shipment.product.optionId]);
}

async function seedFixture(pool, fixture) {
  fixture.seedAttempted = true;
  await runQaCatalogFixture('seed', fixture.runId, process.env.DATABASE_URL, password);
  const names = qaNames(fixture.runId);
  fixture.names = names;
  const accounts = (await pool.query(`SELECT identifier,account_id AS "accountId"
    FROM account_identities WHERE kind='email' AND identifier=ANY($1::text[])`,
  [names.emails])).rows;
  const accountByEmail = new Map(accounts.map((row) => [row.identifier, row.accountId]));
  fixture.customerId = accountByEmail.get(names.emails[0]);
  fixture.adminId = accountByEmail.get(names.emails[4]);
  const sellers = (await pool.query(`SELECT s.id,s.display_name AS name,r.account_id AS "accountId"
    FROM sellers s JOIN account_roles r ON r.seller_id=s.id AND r.role='seller'
    WHERE s.display_name=ANY($1::text[])`, [[names.sellerA, names.sellerB, names.owool]])).rows;
  const sellerByName = new Map(sellers.map((row) => [row.name, row]));
  fixture.sellerA = sellerByName.get(names.sellerA);
  fixture.sellerB = sellerByName.get(names.sellerB);
  fixture.owool = sellerByName.get(names.owool);
  assert.ok(fixture.customerId && fixture.adminId && fixture.sellerA && fixture.sellerB && fixture.owool);
  const products = (await pool.query(`SELECT p.id AS "productId",o.id AS "optionId",
    p.seller_id AS "sellerId",r.title FROM products p JOIN product_revisions r ON r.product_id=p.id
    JOIN product_options o ON o.revision_id=r.id
    WHERE r.title=ANY($1::text[])`, [[
    `qa-${fixture.runId}-고추`, `qa-${fixture.runId}-마늘`, `qa-${fixture.runId}-고춧가루`,
  ]])).rows;
  fixture.productA = products.find((row) => row.title.endsWith('-고추'));
  fixture.productB = products.find((row) => row.title.endsWith('-마늘'));
  fixture.productPooled = products.find((row) => row.title.endsWith('-고춧가루'));
  assert.ok(fixture.productA && fixture.productB && fixture.productPooled);
  fixture.addressId = (await pool.query(`INSERT INTO customer_addresses
    (account_id,label,recipient_name,phone,postal_code,line1,line2)
    VALUES ($1,'가상 배송지','가상고객','01012345678','12345',
      '서울시 가상구 테스트로 1','가상 101호') RETURNING id`, [fixture.customerId])).rows[0].id;
  fixture.setting = (await pool.query('SELECT * FROM fulfillment_settings WHERE id=1')).rows[0];
  fixture.globalPolicy = (await pool.query('SELECT * FROM shipping_policy_global WHERE id=1')).rows[0];
  await pool.query(`UPDATE fulfillment_settings SET owool_seller_id=$1,updated_by=$2,
    version=version+1,updated_at=clock_timestamp() WHERE id=1`, [fixture.owool.id, fixture.adminId]);

  const statuses = ['READY', 'PACKING', 'DELAYED', 'SHIPPED', 'CANCELLED'];
  fixture.sellerAOrders = [];
  const newest = Date.parse('2026-10-06T03:00:00.000Z');
  for (let index = 0; index < 23; index += 1) {
    const paidAt = new Date(newest - Math.floor(index / 2) * 60_000);
    fixture.sellerAOrders.push(await seedShipment(pool, fixture, {
      product: fixture.productA, fulfillmentSellerId: fixture.sellerA.id,
      fulfillmentStatus: statuses[index % statuses.length], paidAt, label: `a-${index}`,
    }));
  }
  fixture.transitionOrder = fixture.sellerAOrders[5];
  fixture.detailOrder = fixture.sellerAOrders[10];
  fixture.invalidOrder = fixture.sellerAOrders[15];
  await seedCompletedRefund(pool, fixture, fixture.detailOrder);
  fixture.sellerBOrder = await seedShipment(pool, fixture, {
    product: fixture.productB, fulfillmentSellerId: fixture.sellerB.id,
    fulfillmentStatus: 'READY', paidAt: new Date(newest + 60_000), label: 'seller-b',
  });
  fixture.pooledOrder = await seedShipment(pool, fixture, {
    product: fixture.productPooled, fulfillmentSellerId: fixture.owool.id,
    shippingMode: 'owool_fulfillment', fulfillmentStatus: 'READY',
    paidAt: new Date(newest + 120_000), label: 'pooled',
  });
  fixture.unpaidCheckout = await seedShipment(pool, fixture, {
    product: fixture.productA, fulfillmentSellerId: fixture.sellerA.id,
    checkoutStatus: 'PENDING_PAYMENT', shipmentStatus: 'PAID', fulfillmentStatus: 'READY',
    paidAt: null, label: 'unpaid-checkout',
  });
  fixture.unpaidShipment = await seedShipment(pool, fixture, {
    product: fixture.productA, fulfillmentSellerId: fixture.sellerA.id,
    checkoutStatus: 'PAID', shipmentStatus: 'PENDING_PAYMENT', fulfillmentStatus: 'READY',
    paidAt: new Date(newest + 180_000), label: 'unpaid-shipment',
  });
}

async function cleanupFixture(pool, fixture) {
  if (!fixture) return;
  const orderIds = fixture.orderIds ?? [];
  if (orderIds.length) {
    await pool.query(`DELETE FROM refund_event_conflicts WHERE original_event_id IN
      (SELECT e.id FROM refund_events e JOIN refund_attempts a ON a.id=e.refund_attempt_id
       JOIN refund_cases c ON c.id=a.refund_case_id WHERE c.checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
    await pool.query(`DELETE FROM refund_case_events WHERE refund_case_id IN
      (SELECT id FROM refund_cases WHERE checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
    await pool.query(`DELETE FROM refund_events WHERE refund_attempt_id IN
      (SELECT a.id FROM refund_attempts a JOIN refund_cases c ON c.id=a.refund_case_id
       WHERE c.checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
    await pool.query(`DELETE FROM refund_attempts WHERE refund_case_id IN
      (SELECT id FROM refund_cases WHERE checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
    await pool.query(`DELETE FROM refund_case_lines WHERE refund_case_id IN
      (SELECT id FROM refund_cases WHERE checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
    await pool.query('DELETE FROM refund_cases WHERE checkout_order_id=ANY($1::uuid[])', [orderIds]);
    await pool.query(`DELETE FROM shipment_fulfillment_events WHERE shipment_order_id IN
      (SELECT id FROM shipment_orders WHERE checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
    await pool.query(`DELETE FROM payment_event_conflicts WHERE original_event_id IN
      (SELECT e.id FROM payment_events e JOIN payment_attempts a ON a.id=e.payment_attempt_id
       WHERE a.checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
    await pool.query(`DELETE FROM payment_events WHERE payment_attempt_id IN
      (SELECT id FROM payment_attempts WHERE checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
    await pool.query('DELETE FROM payment_attempts WHERE checkout_order_id=ANY($1::uuid[])', [orderIds]);
    await pool.query('DELETE FROM order_promotion_allocations WHERE checkout_order_id=ANY($1::uuid[])', [orderIds]);
    await pool.query('DELETE FROM order_status_events WHERE checkout_order_id=ANY($1::uuid[])', [orderIds]);
    await pool.query(`DELETE FROM shipment_order_lines WHERE shipment_order_id IN
      (SELECT id FROM shipment_orders WHERE checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
    await pool.query(`DELETE FROM shipment_fulfillments WHERE shipment_order_id IN
      (SELECT id FROM shipment_orders WHERE checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
    await pool.query('DELETE FROM shipment_orders WHERE checkout_order_id=ANY($1::uuid[])', [orderIds]);
    await pool.query('DELETE FROM checkout_orders WHERE id=ANY($1::uuid[])', [orderIds]);
  }
  const reservationIds = fixture.reservationIds ?? [];
  if (reservationIds.length) {
    await pool.query('DELETE FROM promotion_uses WHERE reservation_id=ANY($1::uuid[])', [reservationIds]);
    await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=ANY($1::uuid[])', [reservationIds]);
    await pool.query('DELETE FROM checkout_reservations WHERE id=ANY($1::uuid[])', [reservationIds]);
  }
  if (fixture.addressId) await pool.query('DELETE FROM customer_addresses WHERE id=$1', [fixture.addressId]);
  if (fixture.setting) {
    await pool.query(`UPDATE fulfillment_settings SET owool_seller_id=$1,updated_by=$2,
      version=$3,updated_at=$4 WHERE id=1`, [fixture.setting.owool_seller_id,
      fixture.setting.updated_by, fixture.setting.version, fixture.setting.updated_at]);
  }
  if (fixture.globalPolicy) {
    await pool.query(`UPDATE shipping_policy_global SET fee_won=$1,free_threshold_won=$2,
      cutoff_time=$3,blocked_postal_ranges=$4::jsonb,locked_fee=$5,locked_threshold=$6,
      locked_cutoff=$7,updated_by_account_id=$8,updated_at=$9 WHERE id=1`, [
      fixture.globalPolicy.fee_won, fixture.globalPolicy.free_threshold_won,
      fixture.globalPolicy.cutoff_time, JSON.stringify(fixture.globalPolicy.blocked_postal_ranges),
      fixture.globalPolicy.locked_fee, fixture.globalPolicy.locked_threshold,
      fixture.globalPolicy.locked_cutoff, fixture.globalPolicy.updated_by_account_id,
      fixture.globalPolicy.updated_at,
    ]);
  }
  if (fixture.seedAttempted) {
    await runQaCatalogFixture('reset', fixture.runId, process.env.DATABASE_URL);
  }
}

async function login(base, email, role) {
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, role }),
  });
  assert.equal(response.status, 201, await response.clone().text());
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.match(cookie ?? '', /^sm_session=/);
  return cookie;
}

function transition(base, shipmentId, body, cookie, key = randomUUID(), requestOrigin = origin) {
  return fetch(`${base}/fulfillment/seller/shipments/${shipmentId}/transitions`, {
    method: 'POST',
    headers: {
      ...(cookie ? { cookie } : {}), origin: requestOrigin, 'content-type': 'application/json',
      ...(key ? { 'idempotency-key': key } : {}),
    },
    body: JSON.stringify(body),
  });
}

function promiseBarrier(parties) {
  let arrived = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  return async () => {
    arrived += 1;
    if (arrived === parties) release();
    await gate;
  };
}

async function observeTransitionLockPair(pool, blockerPid, deadlineMs = 10_000) {
  const deadline = Date.now() + deadlineMs;
  let lastObserved = [];
  while (Date.now() < deadline) {
    lastObserved = (await pool.query(`SELECT a.pid,a.wait_event_type AS "waitEventType",
      a.wait_event AS "waitEvent",pg_blocking_pids(a.pid) AS "blockingPids",
      EXISTS (SELECT 1 FROM pg_locks l WHERE l.pid=a.pid AND NOT l.granted)
        AS "hasPendingLock",
      CASE
        WHEN a.query ~* 'FOR[[:space:]]+UPDATE[[:space:]]+OF[[:space:]]+f'
          THEN 'fulfillment'
        WHEN a.query ~* 'FOR[[:space:]]+UPDATE[[:space:]]+OF[[:space:]]+s'
          THEN 'shipment'
        ELSE 'other'
      END AS "waitTarget"
      FROM pg_stat_activity a
      WHERE a.datname=current_database() AND a.backend_type='client backend'
        AND a.pid<>$1 AND a.state='active' AND a.wait_event_type='Lock'
        AND a.query ILIKE '%shipment_fulfillments%'
        AND (a.query ~* 'FOR[[:space:]]+UPDATE[[:space:]]+OF[[:space:]]+f'
          OR a.query ~* 'FOR[[:space:]]+UPDATE[[:space:]]+OF[[:space:]]+s')`,
    [blockerPid])).rows;
    const fulfillmentWait = lastObserved.find((row) => row.waitTarget === 'fulfillment' &&
      row.hasPendingLock && row.blockingPids.includes(blockerPid));
    const shipmentWait = fulfillmentWait && lastObserved.find((row) =>
      row.waitTarget === 'shipment' && row.hasPendingLock &&
      row.blockingPids.includes(fulfillmentWait.pid));
    if (fulfillmentWait && shipmentWait) return [fulfillmentWait, shipmentWait];
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`two transition backends did not reach PostgreSQL lock waits: ${JSON.stringify(
    lastObserved,
  )}`);
}

async function runBehindFulfillmentRowLock(pool, shipmentId, requestFactories) {
  const blocker = await pool.connect();
  let transactionOpen = false;
  let pending;
  try {
    await blocker.query('BEGIN');
    transactionOpen = true;
    const blockerPid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const locked = await blocker.query(`SELECT shipment_order_id FROM shipment_fulfillments
      WHERE shipment_order_id=$1 FOR UPDATE`, [shipmentId]);
    assert.equal(locked.rowCount, 1);

    const arrive = promiseBarrier(requestFactories.length);
    pending = Promise.all(requestFactories.map(async (request) => {
      await arrive();
      return request();
    }));
    void pending.catch(() => {});
    const waits = await observeTransitionLockPair(pool, blockerPid);

    await blocker.query('COMMIT');
    transactionOpen = false;
    return { results: await pending, waits };
  } catch (error) {
    if (transactionOpen) {
      await blocker.query('ROLLBACK').catch(() => {});
      transactionOpen = false;
    }
    if (pending) await Promise.allSettled([pending]);
    throw error;
  } finally {
    if (transactionOpen) await blocker.query('ROLLBACK').catch(() => {});
    blocker.release();
  }
}

async function fulfillmentWriteCounts(pool, shipmentId) {
  return (await pool.query(`SELECT f.version,
    (SELECT count(*)::int FROM shipment_fulfillment_events e
      WHERE e.shipment_order_id=f.shipment_order_id) AS "eventCount",
    (SELECT count(*)::int FROM audit_events a
      WHERE a.action='fulfillment.seller_transition'
        AND a.target_type='shipment_order'
        AND a.target_id=f.shipment_order_id::text) AS "auditCount"
    FROM shipment_fulfillments f WHERE f.shipment_order_id=$1`, [shipmentId])).rows[0];
}

async function shipmentState(pool, shipmentIds) {
  return (await pool.query(`SELECT s.id,s.status AS "shipmentStatus",o.status AS "orderStatus",
    f.fulfillment_seller_id AS "fulfillmentSellerId",f.status,f.version,
    f.expected_ship_date::text AS "expectedShipDate",f.carrier_code AS "carrierCode",
    f.tracking_number AS "trackingNumber",
    (SELECT count(*)::int FROM shipment_fulfillment_events e
      WHERE e.shipment_order_id=s.id) AS events
    FROM shipment_orders s JOIN checkout_orders o ON o.id=s.checkout_order_id
    JOIN shipment_fulfillments f ON f.shipment_order_id=s.id
    WHERE s.id=ANY($1::uuid[]) ORDER BY s.id`, [shipmentIds])).rows;
}

function cachePolicy(response) {
  const directives = new Set((response.headers.get('cache-control') ?? '')
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
  return { private: directives.has('private'), noStore: directives.has('no-store') };
}

test('seller fulfillment route exists before a database is configured', async () => {
  const saved = process.env.DATABASE_URL;
  let app;
  try {
    delete process.env.DATABASE_URL;
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const response = await fetch(`${base}/fulfillment/seller/shipments`, {
      headers: { cookie: 'sm_session=fulfillment-route-contract' },
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).dependency, 'database');
  } finally {
    if (app) await app.close();
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  }
});

test('seller fulfillment HTTP scopes paid work, exposes minimum detail and persists transitions', {
  skip: !process.env.DATABASE_URL,
}, async (context) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
  let fixture; let app;
  try {
    if (!await requirePrivateSchema(context, pool)) return;
    fixture = fixtureState();
    await seedFixture(pool, fixture);
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const cookies = {
      customer: await login(base, fixture.names.emails[0], 'customer'),
      sellerA: await login(base, fixture.names.emails[1], 'seller'),
      sellerB: await login(base, fixture.names.emails[2], 'seller'),
      owool: await login(base, fixture.names.emails[3], 'seller'),
      admin: await login(base, fixture.names.emails[4], 'admin'),
    };
    const listPath = `${base}/fulfillment/seller/shipments`;
    const get = (query = '', cookie = cookies.sellerA) => fetch(`${listPath}${query}`, {
      headers: cookie ? { cookie } : {},
    });

    await context.test('seller list and address detail prohibit private response caching', async () => {
      const responses = await Promise.all([
        get('?limit=1'),
        fetch(`${listPath}/${fixture.detailOrder.shipmentId}`, {
          headers: { cookie: cookies.sellerA },
        }),
      ]);
      assert.deepEqual(responses.map(({ status }) => status), [200, 200]);
      assert.deepEqual(responses.map(cachePolicy), [
        { private: true, noStore: true },
        { private: true, noStore: true },
      ]);
    });

    await context.test('list requires an active seller and stable opaque paid-order paging', async () => {
      assert.equal((await get('', '')).status, 401);
      assert.equal((await get('', cookies.customer)).status, 403);
      assert.equal((await get('', cookies.admin)).status, 403);
      for (const query of ['?status=PAYMENT_PENDING', '?status=bad', '?status=', '?limit=0',
        '?limit=51', '?limit=1.5', '?cursor=bad', '?limit=2&limit=3']) {
        assert.equal((await get(query)).status, 400, query);
      }
      for (const status of ['READY', 'PACKING', 'DELAYED', 'SHIPPED', 'CANCELLED']) {
        const response = await get(`?status=${status}&limit=50`);
        assert.equal(response.status, 200, status);
        const page = await response.json();
        assert.ok(page.items.length > 0, status);
        assert.equal(page.items.every((item) => item.status === status), true, status);
      }
      const expected = [...fixture.sellerAOrders].sort((left, right) =>
        right.paidAt.localeCompare(left.paidAt) || right.shipmentId.localeCompare(left.shipmentId));
      const firstResponse = await get();
      assert.equal(firstResponse.status, 200, await firstResponse.clone().text());
      const first = await firstResponse.json();
      assert.equal(first.items.length, 20);
      assert.ok(first.nextCursor);
      assert.deepEqual(first.items.map((item) => item.shipmentOrderId),
        expected.slice(0, 20).map((item) => item.shipmentId));
      assert.equal(first.items[0].recipientName, '가**객');
      assert.equal(first.items[0].phone, '***-***-5678');
      assert.doesNotMatch(JSON.stringify(first),
        /가상고객|01012345678|서울시 가상구|가상 101호|"postalCode"|"line1"|"line2"|"address"/);
      assert.equal(expected.some((item) => first.nextCursor.includes(item.shipmentId)), false);
      assert.equal(first.nextCursor.includes(expected[0].paidAt), false);
      const allResponse = await get('?limit=50');
      assert.equal(allResponse.status, 200);
      const all = await allResponse.json();
      assert.equal(all.items.length, 23);
      assert.equal(all.nextCursor, null);
      assert.equal(all.items.some((item) => [fixture.sellerBOrder.shipmentId,
        fixture.pooledOrder.shipmentId, fixture.unpaidCheckout.shipmentId,
        fixture.unpaidShipment.shipmentId].includes(item.shipmentOrderId)), false);

      const paged = [];
      let cursor = null;
      for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
        const response = await get(`?limit=7${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
        assert.equal(response.status, 200);
        const page = await response.json();
        paged.push(...page.items.map((item) => item.shipmentOrderId));
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      assert.deepEqual(paged, expected.map((item) => item.shipmentId));
      assert.equal(new Set(paged).size, paged.length);

      await pool.query(`DELETE FROM account_roles WHERE account_id=$1 AND role='seller'
        AND seller_id=$2`, [fixture.sellerA.accountId, fixture.sellerA.id]);
      try {
        assert.equal((await get()).status, 401);
      } finally {
        await pool.query(`INSERT INTO account_roles(account_id,role,seller_id)
          VALUES ($1,'seller',$2)`, [fixture.sellerA.accountId, fixture.sellerA.id]);
      }
    });

    await context.test('SQL seller scope hides direct-B and pooled work with zero mutation', async () => {
      const protectedIds = [fixture.sellerBOrder.shipmentId, fixture.pooledOrder.shipmentId];
      const before = await shipmentState(pool, protectedIds);
      for (const shipmentId of protectedIds) {
        const detail = await fetch(`${listPath}/${shipmentId}`, { headers: { cookie: cookies.sellerA } });
        assert.equal(detail.status, 404);
        const write = await transition(base, shipmentId,
          { targetStatus: 'PACKING', expectedVersion: 0 }, cookies.sellerA);
        assert.equal(write.status, 404);
      }
      assert.deepEqual(await shipmentState(pool, protectedIds), before);
      assert.equal((await fetch(`${listPath}/${fixture.sellerBOrder.shipmentId}`,
        { headers: { cookie: cookies.sellerB } })).status, 200);
      assert.equal((await fetch(`${listPath}/${fixture.pooledOrder.shipmentId}`,
        { headers: { cookie: cookies.owool } })).status, 200);
    });

    await context.test('detail exposes paid shipment snapshots, completed refunds and minimum address', async () => {
      for (const shipmentId of [fixture.unpaidCheckout.shipmentId, fixture.unpaidShipment.shipmentId]) {
        assert.equal((await fetch(`${listPath}/${shipmentId}`,
          { headers: { cookie: cookies.sellerA } })).status, 404);
      }
      const response = await fetch(`${listPath}/${fixture.detailOrder.shipmentId}`,
        { headers: { cookie: cookies.sellerA } });
      assert.equal(response.status, 200, await response.clone().text());
      const detail = await response.json();
      assert.equal(detail.shipmentOrderId, fixture.detailOrder.shipmentId);
      assert.equal(detail.status, 'READY');
      assert.equal(detail.version, 0);
      assert.equal(detail.expectedShipDate, expectedShipDate);
      assert.deepEqual(detail.amounts, {
        goodsWon: 12000, goodsDiscountWon: 2000, shippingFeeWon: 3000,
        shippingSupportWon: 1000, payableWon: 12000,
      });
      assert.deepEqual(detail.address, {
        recipientName: '가상고객', phone: '01012345678', postalCode: '12345',
        line1: '서울시 가상구 테스트로 1', line2: '가상 101호',
      });
      assert.deepEqual(detail.lines, [{
        productId: fixture.detailOrder.product.productId,
        optionId: fixture.detailOrder.product.optionId,
        sellerId: fixture.detailOrder.product.sellerId,
        productName: fixture.detailOrder.product.title,
        optionName: '기본', unitPriceWon: 4000, originalQuantity: 3,
        refundedQuantity: 1, remainingQuantity: 2,
        goodsDiscountWon: 2000, goodsPayableWon: 10000,
      }]);
      assert.doesNotMatch(JSON.stringify(detail), /accountId|addressId|providerPayment|password|email/);
    });

    await context.test('transition rejects missing authority, Origin, key, version and invalid rules payloads', async () => {
      const shipmentId = fixture.invalidOrder.shipmentId;
      const before = await shipmentState(pool, [shipmentId]);
      const body = { targetStatus: 'PACKING', expectedVersion: 0 };
      assert.equal((await transition(base, shipmentId, body, '')).status, 401);
      assert.equal((await transition(base, shipmentId, body, cookies.customer)).status, 403);
      assert.equal((await transition(base, shipmentId, body, cookies.admin)).status, 403);
      assert.equal((await transition(base, shipmentId, body, cookies.sellerA, randomUUID(),
        'https://invalid.example')).status, 403);
      assert.equal((await transition(base, shipmentId, body, cookies.sellerA, '')).status, 400);
      assert.equal((await transition(base, shipmentId, body, cookies.sellerA, 'bad')).status, 400);
      assert.equal((await transition(base, shipmentId, { targetStatus: 'PACKING' },
        cookies.sellerA)).status, 400);
      assert.equal((await transition(base, shipmentId,
        { targetStatus: 'SHIPPED', expectedVersion: 0 }, cookies.sellerA)).status, 400);
      assert.equal((await transition(base, shipmentId,
        { targetStatus: 'CANCELLED', expectedVersion: 0 }, cookies.sellerA)).status, 400);
      assert.equal((await transition(base, shipmentId,
        { ...body, unexpected: true }, cookies.sellerA)).status, 400);
      assert.deepEqual(await shipmentState(pool, [shipmentId]), before);
    });

    await context.test('concurrent different keys allow one version winner and persist one write', async () => {
      const shipmentId = fixture.sellerAOrders[0].shipmentId;
      const body = { targetStatus: 'PACKING', expectedVersion: 0 };
      const keys = [randomUUID(), randomUUID()];
      const { results, waits } = await runBehindFulfillmentRowLock(pool, shipmentId,
        keys.map((key) => async () => {
          const response = await transition(base, shipmentId, body, cookies.sellerA, key);
          return { status: response.status, payload: await response.json() };
        }));

      assert.deepEqual(waits.map(({ waitTarget }) => waitTarget).sort(), ['fulfillment', 'shipment']);
      assert.equal(waits.every(({ waitEventType, hasPendingLock }) =>
        waitEventType === 'Lock' && hasPendingLock), true);
      assert.deepEqual(results.map(({ status }) => status).sort((left, right) => left - right),
        [200, 409], JSON.stringify(results));
      const winner = results.find(({ status }) => status === 200);
      assert.equal(winner?.payload.status, 'PACKING');
      assert.equal(winner?.payload.version, 1);
      assert.deepEqual(await fulfillmentWriteCounts(pool, shipmentId), {
        version: 1, eventCount: 1, auditCount: 1,
      });
    });

    await context.test('concurrent same-key retries reuse one result and persist one write', async () => {
      const shipmentId = fixture.sellerAOrders[20].shipmentId;
      const body = { targetStatus: 'PACKING', expectedVersion: 0 };
      const key = randomUUID();
      const { results, waits } = await runBehindFulfillmentRowLock(pool, shipmentId,
        [0, 1].map(() => async () => {
          const response = await transition(base, shipmentId, body, cookies.sellerA, key);
          return { status: response.status, payload: await response.json() };
        }));

      assert.deepEqual(waits.map(({ waitTarget }) => waitTarget).sort(), ['fulfillment', 'shipment']);
      assert.equal(waits.every(({ waitEventType, hasPendingLock }) =>
        waitEventType === 'Lock' && hasPendingLock), true);
      assert.deepEqual(results.map(({ status }) => status), [200, 200], JSON.stringify(results));
      assert.deepEqual(results[1].payload, results[0].payload);
      assert.equal(results[0].payload.status, 'PACKING');
      assert.equal(results[0].payload.version, 1);
      assert.deepEqual(await fulfillmentWriteCounts(pool, shipmentId), {
        version: 1, eventCount: 1, auditCount: 1,
      });
    });

    await context.test('transition is versioned, idempotent and immediately forms the customer DB view', async () => {
      const shipmentId = fixture.transitionOrder.shipmentId;
      const packingKey = randomUUID();
      const packingBody = { targetStatus: 'PACKING', expectedVersion: 0 };
      const packedResponse = await transition(base, shipmentId, packingBody, cookies.sellerA, packingKey);
      assert.equal(packedResponse.status, 200, await packedResponse.clone().text());
      const packed = await packedResponse.json();
      assert.equal(packed.status, 'PACKING');
      assert.equal(packed.version, 1);
      const replayResponse = await transition(base, shipmentId, packingBody, cookies.sellerA, packingKey);
      assert.equal(replayResponse.status, 200);
      assert.deepEqual(await replayResponse.json(), packed);
      assert.deepEqual(await fulfillmentWriteCounts(pool, shipmentId), {
        version: 1, eventCount: 1, auditCount: 1,
      });

      const delayedBody = {
        targetStatus: 'DELAYED', expectedVersion: 1, reason: '가상 포장 지연',
        customerMessage: '가상 안내: 10월 10일 출고 예정', expectedShipDate: '2026-10-10',
      };
      assert.equal((await transition(base, shipmentId,
        { ...delayedBody, expectedVersion: 0 }, cookies.sellerA, packingKey)).status, 409);
      assert.equal((await transition(base, shipmentId,
        { ...delayedBody, expectedVersion: 0 }, cookies.sellerA)).status, 409);
      const delayedResponse = await transition(base, shipmentId, delayedBody, cookies.sellerA);
      assert.equal(delayedResponse.status, 200, await delayedResponse.clone().text());
      assert.equal((await delayedResponse.json()).status, 'DELAYED');
      const resumedResponse = await transition(base, shipmentId,
        { targetStatus: 'PACKING', expectedVersion: 2 }, cookies.sellerA);
      assert.equal(resumedResponse.status, 200, await resumedResponse.clone().text());
      const shippedResponse = await transition(base, shipmentId, {
        targetStatus: 'SHIPPED', expectedVersion: 3,
        carrierCode: 'cj_logistics', trackingNumber: '1234-ABCD',
      }, cookies.sellerA);
      assert.equal(shippedResponse.status, 200, await shippedResponse.clone().text());
      const shipped = await shippedResponse.json();
      assert.equal(shipped.status, 'SHIPPED');
      assert.equal(shipped.trackingNumber, '1234ABCD');

      const current = (await pool.query(`SELECT f.status,f.version,
        f.expected_ship_date::text AS "expectedShipDate",f.carrier_code AS "carrierCode",
        f.tracking_number AS "trackingNumber",
        (SELECT customer_message FROM shipment_fulfillment_events e
          WHERE e.shipment_order_id=f.shipment_order_id AND e.customer_message IS NOT NULL
          ORDER BY e.occurred_at DESC,e.id DESC LIMIT 1) AS "customerMessage",
        (SELECT count(*)::int FROM shipment_fulfillment_events e
          WHERE e.shipment_order_id=f.shipment_order_id) AS "eventCount"
        FROM shipment_fulfillments f WHERE f.shipment_order_id=$1`, [shipmentId])).rows[0];
      assert.deepEqual(current, {
        status: 'SHIPPED', version: 4, expectedShipDate: '2026-10-10',
        customerMessage: '가상 안내: 10월 10일 출고 예정',
        carrierCode: 'cj_logistics', trackingNumber: '1234ABCD', eventCount: 4,
      });
      assert.deepEqual(await fulfillmentWriteCounts(pool, shipmentId), {
        version: 4, eventCount: 4, auditCount: 4,
      });
      const persistedText = JSON.stringify((await pool.query(`SELECT e.before_snapshot,e.after_snapshot,
        e.reason,e.customer_message,a.details FROM shipment_fulfillment_events e
        LEFT JOIN audit_events a ON a.actor_account_id=e.actor_account_id
          AND a.target_id=e.shipment_order_id::text
        WHERE e.shipment_order_id=$1 ORDER BY e.occurred_at,e.id`, [shipmentId])).rows);
      assert.doesNotMatch(persistedText,
        /가상고객|01012345678|서울시 가상구|가상 101호|12345/);
    });
  } finally {
    if (app) await app.close();
    await cleanupFixture(pool, fixture);
    await pool.end();
  }
});
