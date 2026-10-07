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
const fingerprint = 'a'.repeat(64);
const expectedShipDate = '2026-10-08';

async function requirePrivateSchema(context, pool) {
  await assertOrderMutationQaTarget(pool, process.env.S5_ADMIN_TEST_DB_SYSTEM_ID);
  if (await skipWithoutOrderSchema(context, pool, true)) return false;
  if (await skipWithoutFulfillmentSchema(context, pool, true)) return false;
  const schema = (await pool.query(`SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations,
    to_regclass('public.refund_cases') IS NOT NULL AS refunds`)).rows[0];
  assert.deepEqual(schema, { migrations: 20, refunds: true });
  return true;
}

function fixtureState() {
  return {
    runId: randomBytes(4).toString('hex'),
    seedAttempted: false,
    orderIds: [],
    reservationIds: [],
  };
}

function fulfillmentColumns(status, changedAt) {
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
  product, fulfillmentSellerId, shippingMode = 'seller_direct', status = 'READY', paidAt, label,
  checkoutStatus = 'PAID', shipmentStatus = 'PAID',
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
  const orderId = (await pool.query(`INSERT INTO checkout_orders
    (account_id,reservation_id,idempotency_key,request_fingerprint,address_id,
      recipient_name,phone,postal_code,line1,line2,goods_won,goods_discount_won,
      shipping_fee_won,shipping_support_won,payable_won,status,created_at,expires_at,ended_at,paid_at)
    VALUES ($1,$2,$3,$4,$5,'가상고객','01012345678','12345','서울시 가상구 테스트로 1',
      '가상 101호',12000,2000,3000,1000,12000,$6,$7,$8,$9,$10) RETURNING id`, [
    fixture.customerId, reservationId, randomUUID(), fingerprint, fixture.addressId,
    checkoutStatus, createdAt, new Date(createdAt.getTime() + 60 * 60_000),
    checkoutStatus === 'PAID' ? paidAt : null, checkoutStatus === 'PAID' ? paidAt : null,
  ])).rows[0].id;
  fixture.orderIds.push(orderId);
  const sellerId = shippingMode === 'seller_direct' ? product.sellerId : null;
  const shipmentId = (await pool.query(`INSERT INTO shipment_orders
    (checkout_order_id,shipment_key,shipping_mode,seller_id,goods_won,goods_discount_won,
      shipping_fee_won,shipping_support_won,payable_won,status)
    VALUES ($1,$2,$3,$4,12000,2000,3000,1000,12000,$5) RETURNING id`, [
    orderId, `${shippingMode}:${label}`, shippingMode, sellerId, shipmentStatus,
  ])).rows[0].id;
  await pool.query(`INSERT INTO shipment_order_lines
    (shipment_order_id,product_id,option_id,seller_id,product_name,option_name,
      unit_price_won,quantity,goods_discount_won,goods_payable_won)
    VALUES ($1,$2,$3,$4,$5,'기본',4000,3,2000,10000)`, [
    shipmentId, product.productId, product.optionId, product.sellerId, product.title,
  ]);
  const fields = fulfillmentColumns(status, paidAt ?? createdAt);
  await pool.query(`INSERT INTO shipment_fulfillments
    (shipment_order_id,fulfillment_seller_id,status,expected_ship_date,packed_at,
      carrier_code,carrier_name,tracking_number,first_shipped_at,shipped_at,cancelled_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [
    shipmentId, fulfillmentSellerId, status, fields.expectedShipDate, fields.packedAt,
    fields.carrierCode, fields.carrierName, fields.trackingNumber, fields.firstShippedAt,
    fields.shippedAt, fields.cancelledAt, paidAt ?? createdAt,
  ]);
  return { orderId, shipmentId, paidAt: paidAt?.toISOString() ?? null, status, product };
}

async function seedPaymentEvent(pool, fixture, shipment) {
  const idempotencyKey = randomUUID();
  await pool.query(`INSERT INTO shipment_fulfillment_events
    (shipment_order_id,action,from_status,to_status,before_snapshot,after_snapshot,
      idempotency_scope,idempotency_key,request_fingerprint,occurred_at)
    VALUES ($1,'PAYMENT_CONFIRMED','PAYMENT_PENDING','READY',$2::jsonb,$3::jsonb,
      'system:payment',$4,$5,$6)`, [
    shipment.shipmentId,
    JSON.stringify({ status: 'PAYMENT_PENDING', expectedShipDate: null,
      carrierCode: null, trackingNumber: null }),
    JSON.stringify({ status: 'READY', expectedShipDate,
      carrierCode: null, trackingNumber: null }),
    idempotencyKey, fingerprint, new Date(shipment.paidAt),
  ]);
  fixture.seedEventIds = [...(fixture.seedEventIds ?? []), idempotencyKey];
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
  const sellers = (await pool.query(`SELECT s.id,s.display_name AS name,s.category_id AS "sellerCategoryId",
      r.account_id AS "accountId"
    FROM sellers s JOIN account_roles r ON r.seller_id=s.id AND r.role='seller'
    WHERE s.display_name=ANY($1::text[])`, [[names.sellerA, names.sellerB, names.owool]])).rows;
  const sellerByName = new Map(sellers.map((row) => [row.name, row]));
  fixture.sellerA = sellerByName.get(names.sellerA);
  fixture.sellerB = sellerByName.get(names.sellerB);
  fixture.owool = sellerByName.get(names.owool);
  assert.ok(fixture.customerId && fixture.adminId && fixture.sellerA && fixture.sellerB && fixture.owool);
  const products = (await pool.query(`SELECT p.id AS "productId",o.id AS "optionId",
    p.seller_id AS "sellerId",p.category_id AS "categoryId",minor.name AS "categoryName",r.title
    FROM products p JOIN product_revisions r ON r.product_id=p.id
    JOIN product_options o ON o.revision_id=r.id
    JOIN product_categories minor ON minor.id=p.category_id
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
  fixture.currentSetting = (await pool.query(`UPDATE fulfillment_settings SET owool_seller_id=$1,
    updated_by=$2,version=version+1,updated_at=clock_timestamp() WHERE id=1
    RETURNING owool_seller_id AS "owoolSellerId",version`, [fixture.owool.id, fixture.adminId])).rows[0];

  const statuses = ['READY', 'PACKING', 'DELAYED', 'SHIPPED', 'CANCELLED'];
  fixture.sellerAOrders = [];
  const newest = Date.parse('2026-10-06T03:00:00.000Z');
  for (let index = 0; index < 23; index += 1) {
    fixture.sellerAOrders.push(await seedShipment(pool, fixture, {
      product: fixture.productA, fulfillmentSellerId: fixture.sellerA.id,
      status: statuses[index % statuses.length],
      paidAt: new Date(newest - Math.floor(index / 2) * 60_000), label: `a-${index}`,
    }));
  }
  fixture.detailOrder = fixture.sellerAOrders[0];
  fixture.correctionOrder = fixture.sellerAOrders[5];
  fixture.invalidOrder = fixture.sellerAOrders[10];
  fixture.concurrentOrder = fixture.sellerAOrders[15];
  fixture.replayConcurrentOrder = fixture.sellerAOrders[20];
  await seedPaymentEvent(pool, fixture, fixture.detailOrder);
  fixture.sellerBOrder = await seedShipment(pool, fixture, {
    product: fixture.productB, fulfillmentSellerId: fixture.sellerB.id, status: 'READY',
    paidAt: new Date(newest + 60_000), label: 'seller-b',
  });
  fixture.pooledOrder = await seedShipment(pool, fixture, {
    product: fixture.productPooled, fulfillmentSellerId: fixture.owool.id,
    shippingMode: 'owool_fulfillment', status: 'READY',
    paidAt: new Date(newest + 120_000), label: 'pooled',
  });
  fixture.unpaidOrder = await seedShipment(pool, fixture, {
    product: fixture.productA, fulfillmentSellerId: fixture.sellerA.id,
    status: 'PAYMENT_PENDING', paidAt: null, checkoutStatus: 'PENDING_PAYMENT',
    shipmentStatus: 'PENDING_PAYMENT', label: 'unpaid',
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
  if (fixture.seedAttempted) await runQaCatalogFixture('reset', fixture.runId, process.env.DATABASE_URL);
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

function updateSetting(base, body, cookie, key = randomUUID(), requestOrigin = origin) {
  return fetch(`${base}/fulfillment/admin/settings`, {
    method: 'PUT',
    headers: {
      ...(cookie ? { cookie } : {}), origin: requestOrigin,
      'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}),
    },
    body: JSON.stringify(body),
  });
}

function correct(base, shipmentId, body, cookie, key = randomUUID(), requestOrigin = origin) {
  return fetch(`${base}/fulfillment/admin/shipments/${shipmentId}/corrections`, {
    method: 'POST',
    headers: {
      ...(cookie ? { cookie } : {}), origin: requestOrigin,
      'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}),
    },
    body: JSON.stringify(body),
  });
}

function cachePolicy(response) {
  const directives = (response.headers.get('cache-control') ?? '')
    .split(',').map((directive) => directive.trim().toLowerCase());
  return {
    private: directives.includes('private'),
    noStore: directives.includes('no-store'),
  };
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

async function observeCorrectionLockPair(pool, blockerPid, deadlineMs = 10_000) {
  const deadline = Date.now() + deadlineMs;
  let lastObserved = [];
  while (Date.now() < deadline) {
    lastObserved = (await pool.query(`SELECT a.pid,a.wait_event_type AS "waitEventType",
      a.wait_event AS "waitEvent",pg_blocking_pids(a.pid) AS "blockingPids",
      EXISTS (SELECT 1 FROM pg_locks l WHERE l.pid=a.pid AND NOT l.granted)
        AS "hasPendingLock",
      CASE
        WHEN a.query ~* 'FOR[[:space:]]+UPDATE[[:space:]]+OF[[:space:]]+f' THEN 'fulfillment'
        WHEN a.query ~* 'FOR[[:space:]]+UPDATE[[:space:]]+OF[[:space:]]+s' THEN 'shipment'
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
  assert.fail(`two correction backends did not reach PostgreSQL lock waits: ${JSON.stringify(
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
    const waits = await observeCorrectionLockPair(pool, blockerPid);
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

async function correctionWriteCounts(pool, shipmentId) {
  return (await pool.query(`SELECT f.version,
    (SELECT count(*)::int FROM shipment_fulfillment_events e
      WHERE e.shipment_order_id=f.shipment_order_id AND e.action='ADMIN_CORRECT') AS "eventCount",
    (SELECT count(*)::int FROM audit_events a
      WHERE a.action='fulfillment.admin_correction' AND a.target_type='shipment_order'
        AND a.target_id=f.shipment_order_id::text) AS "auditCount"
    FROM shipment_fulfillments f WHERE f.shipment_order_id=$1`, [shipmentId])).rows[0];
}

async function fulfillmentState(pool, shipmentId) {
  return (await pool.query(`SELECT f.fulfillment_seller_id AS "fulfillmentSellerId",f.status,
    f.version,f.expected_ship_date::text AS "expectedShipDate",f.carrier_code AS "carrierCode",
    f.carrier_name AS "carrierName",f.tracking_number AS "trackingNumber",
    (SELECT count(*)::int FROM shipment_fulfillment_events e
      WHERE e.shipment_order_id=f.shipment_order_id) AS events,
    (SELECT count(*)::int FROM audit_events a
      WHERE a.target_type='shipment_order' AND a.target_id=f.shipment_order_id::text) AS audits
    FROM shipment_fulfillments f WHERE f.shipment_order_id=$1`, [shipmentId])).rows[0];
}

test('admin fulfillment routes exist before a database is configured', async () => {
  const saved = process.env.DATABASE_URL;
  let app;
  try {
    delete process.env.DATABASE_URL;
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const headers = { cookie: 'sm_session=fulfillment-admin-route-contract' };
    for (const path of ['/fulfillment/admin/settings', '/fulfillment/admin/shipments']) {
      const response = await fetch(`${base}${path}`, { headers });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).dependency, 'database');
    }
    const writeHeaders = { ...headers, origin, 'content-type': 'application/json',
      'idempotency-key': randomUUID() };
    const put = await fetch(`${base}/fulfillment/admin/settings`, {
      method: 'PUT', headers: writeHeaders, body: JSON.stringify({}),
    });
    assert.equal(put.status, 503, 'approved PUT route remains registered');
    const patch = await fetch(`${base}/fulfillment/admin/settings`, {
      method: 'PATCH', headers: writeHeaders, body: JSON.stringify({}),
    });
    assert.equal(patch.status, 404, 'unapproved PATCH route must not be exposed');
  } finally {
    if (app) await app.close();
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  }
});

test('admin paid-date query parser accepts inclusive ISO dates and rejects invalid ranges', async () => {
  const { parseAdminFulfillmentListQuery } = await import('../src/fulfillment/service.ts');
  assert.equal(typeof parseAdminFulfillmentListQuery, 'function');
  assert.deepEqual(parseAdminFulfillmentListQuery({
    from: '2026-10-01', to: '2026-10-06', limit: '50',
  }), {
    from: '2026-10-01', to: '2026-10-06', limit: 50,
  });
  for (const query of [
    { from: '2026-02-30' }, { to: '2026-10-6' },
    { from: '0000-01-01' }, { to: '0000-12-31' },
    { from: '2026-10-07', to: '2026-10-06' },
  ]) assert.throws(() => parseAdminFulfillmentListQuery(query),
    /Invalid fulfillment request/);
});

test('admin fulfillment HTTP manages singleton ownership, all paid work and corrections', {
  skip: !process.env.DATABASE_URL,
}, async (context) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
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
      seller: await login(base, fixture.names.emails[1], 'seller'),
      admin: await login(base, fixture.names.emails[4], 'admin'),
    };
    const settingsPath = `${base}/fulfillment/admin/settings`;
    const listPath = `${base}/fulfillment/admin/shipments`;

    await context.test('public, customer and seller are denied and role headers never elevate', async () => {
      const correctionBody = {
        expectedVersion: 0, corrected: { status: 'PACKING' },
        reason: '가상 관리자 정정', customerMessage: '가상 고객 안내',
      };
      const reads = [settingsPath, listPath, `${listPath}/${fixture.detailOrder.shipmentId}`];
      for (const path of reads) {
        assert.equal((await fetch(path, { headers: { 'x-role': 'admin' } })).status, 401);
        assert.equal((await fetch(path, {
          headers: { cookie: cookies.customer, 'x-role': 'admin' },
        })).status, 403);
        assert.equal((await fetch(path, {
          headers: { cookie: cookies.seller, 'x-role': 'admin' },
        })).status, 403);
      }
      for (const cookie of ['', cookies.customer, cookies.seller]) {
        const response = await correct(base, fixture.invalidOrder.shipmentId,
          correctionBody, cookie);
        assert.equal(response.status, cookie ? 403 : 401);
      }
      for (const cookie of ['', cookies.customer, cookies.seller]) {
        const response = await updateSetting(base, {
          owoolSellerId: fixture.sellerB.id,
          expectedVersion: fixture.currentSetting.version,
          reason: '가상 담당 변경',
        }, cookie);
        assert.equal(response.status, cookie ? 403 : 401);
      }
    });

    await context.test('admin GET settings, list and detail prohibit private response caching', async () => {
      const responses = await Promise.all([
        fetch(settingsPath, { headers: { cookie: cookies.admin } }),
        fetch(listPath, { headers: { cookie: cookies.admin } }),
        fetch(`${listPath}/${fixture.detailOrder.shipmentId}`, {
          headers: { cookie: cookies.admin },
        }),
      ]);
      assert.deepEqual(responses.map(({ status }) => status), [200, 200, 200]);
      assert.deepEqual(responses.map(cachePolicy), [
        { private: true, noStore: true },
        { private: true, noStore: true },
        { private: true, noStore: true },
      ]);
    });

    await context.test('singleton setting requires active seller grant, version, reason and idempotency', async () => {
      const initial = (await pool.query(`SELECT setting.owool_seller_id AS "owoolSellerId",
        seller.display_name AS "owoolSellerDisplayName",setting.version,
        setting.updated_at AS "updatedAt"
        FROM fulfillment_settings setting
        LEFT JOIN sellers seller ON seller.id=setting.owool_seller_id
        WHERE setting.id=1`)).rows[0];
      const readResponse = await fetch(settingsPath, { headers: { cookie: cookies.admin } });
      assert.equal(readResponse.status, 200, await readResponse.clone().text());
      const readSetting = await readResponse.json();
      assert.deepEqual(readSetting, {
        owoolSellerId: initial.owoolSellerId,
        owoolSellerDisplayName: initial.owoolSellerDisplayName,
        version: initial.version,
        updatedAt: initial.updatedAt.toISOString(),
      });
      const pooledOwner = (await pool.query(`SELECT fulfillment_seller_id AS "sellerId"
        FROM shipment_fulfillments WHERE shipment_order_id=$1`,
      [fixture.pooledOrder.shipmentId])).rows[0].sellerId;
      const baseBody = {
        owoolSellerId: fixture.sellerB.id,
        expectedVersion: initial.version,
        reason: '가상 공동출고 담당 변경',
      };
      assert.equal((await updateSetting(base, baseBody, cookies.admin, randomUUID(),
        'https://invalid.example')).status, 403);
      assert.equal((await updateSetting(base, baseBody, cookies.admin, '')).status, 400);
      assert.equal((await updateSetting(base, { ...baseBody, unexpected: true },
        cookies.admin)).status, 400);
      assert.equal((await updateSetting(base, { ...baseBody, reason: '' },
        cookies.admin)).status, 400);
      assert.equal((await updateSetting(base, { ...baseBody, expectedVersion: -1 },
        cookies.admin)).status, 400);

      await pool.query(`DELETE FROM account_roles WHERE account_id=$1 AND role='seller'
        AND seller_id=$2`, [fixture.sellerB.accountId, fixture.sellerB.id]);
      try {
        assert.equal((await updateSetting(base, baseBody, cookies.admin)).status, 400);
      } finally {
        await pool.query(`INSERT INTO account_roles(account_id,role,seller_id)
          VALUES ($1,'seller',$2)`, [fixture.sellerB.accountId, fixture.sellerB.id]);
      }
      await pool.query('UPDATE accounts SET disabled_at=clock_timestamp() WHERE id=$1',
        [fixture.sellerB.accountId]);
      try {
        assert.equal((await updateSetting(base, baseBody, cookies.admin)).status, 400);
      } finally {
        await pool.query('UPDATE accounts SET disabled_at=NULL WHERE id=$1',
          [fixture.sellerB.accountId]);
      }
      assert.deepEqual((await pool.query(`SELECT owool_seller_id AS "owoolSellerId",version
        FROM fulfillment_settings WHERE id=1`)).rows[0], {
        owoolSellerId: initial.owoolSellerId, version: initial.version,
      });

      const key = randomUUID();
      const changedResponse = await updateSetting(base, baseBody, cookies.admin, key);
      assert.equal(changedResponse.status, 200, await changedResponse.clone().text());
      const changed = await changedResponse.json();
      assert.equal(changed.owoolSellerId, fixture.sellerB.id);
      assert.equal(changed.owoolSellerDisplayName, fixture.sellerB.name);
      assert.equal(changed.version, initial.version + 1);
      assert.match(changed.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
      const replay = await updateSetting(base, baseBody, cookies.admin, key);
      assert.equal(replay.status, 200);
      assert.deepEqual(await replay.json(), changed);
      assert.equal((await updateSetting(base, { ...baseBody, reason: '다른 가상 사유' },
        cookies.admin, key)).status, 409);
      assert.equal((await updateSetting(base, { ...baseBody, expectedVersion: initial.version },
        cookies.admin)).status, 409);
      assert.equal((await pool.query(`SELECT fulfillment_seller_id AS "sellerId"
        FROM shipment_fulfillments WHERE shipment_order_id=$1`,
      [fixture.pooledOrder.shipmentId])).rows[0].sellerId, pooledOwner);
      const audit = (await pool.query(`SELECT details FROM audit_events
        WHERE actor_account_id=$1 AND action='fulfillment.admin_setting'
          AND target_type='fulfillment_settings' AND target_id='1'`, [fixture.adminId])).rows;
      assert.equal(audit.length, 1);
      assert.equal(audit[0].details.reason, baseBody.reason);
      assert.equal(audit[0].details.idempotencyKey, key);
      assert.doesNotMatch(JSON.stringify(audit),
        /가상고객|01012345678|서울시 가상구|가상 101호|12345/);
    });

    await context.test('admin list filters all paid work with stable opaque paging and masked PII', async () => {
      for (const query of ['?status=PAYMENT_PENDING', '?status=bad', '?status=', '?limit=0',
        '?limit=51', '?limit=1.5', '?sellerId=bad', '?categoryId=bad', '?cursor=bad',
        '?from=2026-02-30', '?to=2026-10-6', '?from=0000-01-01', '?to=0000-12-31',
        '?from=2026-10-07&to=2026-10-06',
        '?unexpected=1']) {
        assert.equal((await fetch(`${listPath}${query}`, {
          headers: { cookie: cookies.admin },
        })).status, 400, query);
      }
      const expected = (await pool.query(`SELECT s.id FROM shipment_orders s
        JOIN checkout_orders o ON o.id=s.checkout_order_id
        JOIN shipment_fulfillments f ON f.shipment_order_id=s.id
        WHERE o.status='PAID' AND s.status='PAID'
        ORDER BY o.paid_at DESC,s.id DESC`)).rows.map((row) => row.id);
      assert.equal(expected.length, 25);
      assert.equal(expected.includes(fixture.unpaidOrder.shipmentId), false);
      const firstResponse = await fetch(listPath, { headers: { cookie: cookies.admin } });
      assert.equal(firstResponse.status, 200, await firstResponse.clone().text());
      const first = await firstResponse.json();
      assert.equal(first.items.length, 20);
      assert.deepEqual(first.items.map((item) => item.shipmentOrderId), expected.slice(0, 20));
      assert.equal(typeof first.nextCursor, 'string');
      assert.doesNotMatch(first.nextCursor, new RegExp(expected[19]));
      assert.doesNotMatch(Buffer.from(first.nextCursor, 'base64url').toString('utf8'),
        /2026-10-06|shipmentOrderId/);
      for (const item of first.items) {
        assert.equal(item.recipientName, '가**객');
        assert.equal(item.phone, '***-***-5678');
        assert.equal(typeof item.fulfillmentSeller?.id, 'string');
        assert.equal(typeof item.fulfillmentSeller?.displayName, 'string');
        assert.equal(Array.isArray(item.categories), true);
        assert.equal(item.categories.length, 1);
        assert.doesNotMatch(JSON.stringify(item), /line1|line2|postalCode|addressId|accountId/);
      }

      const paged = [];
      let cursor = null;
      do {
        const query = new URLSearchParams({ limit: '7' });
        if (cursor) query.set('cursor', cursor);
        const response = await fetch(`${listPath}?${query}`, { headers: { cookie: cookies.admin } });
        assert.equal(response.status, 200, await response.clone().text());
        const page = await response.json();
        paged.push(...page.items.map((item) => item.shipmentOrderId));
        cursor = page.nextCursor;
      } while (cursor);
      assert.deepEqual(paged, expected);
      assert.equal(new Set(paged).size, expected.length);

      const sellerFilter = await fetch(`${listPath}?sellerId=${fixture.sellerB.id}&limit=50`, {
        headers: { cookie: cookies.admin },
      });
      assert.equal(sellerFilter.status, 200, await sellerFilter.clone().text());
      assert.deepEqual((await sellerFilter.json()).items.map((item) => item.shipmentOrderId),
        [fixture.sellerBOrder.shipmentId]);
      const categoryFilter = await fetch(
        `${listPath}?categoryId=${fixture.productPooled.categoryId}&limit=50`,
        { headers: { cookie: cookies.admin } },
      );
      assert.equal(categoryFilter.status, 200, await categoryFilter.clone().text());
      assert.deepEqual((await categoryFilter.json()).items.map((item) => item.shipmentOrderId),
        [fixture.pooledOrder.shipmentId]);
      const statusFilter = await fetch(`${listPath}?status=READY&limit=50`, {
        headers: { cookie: cookies.admin },
      });
      assert.equal(statusFilter.status, 200, await statusFilter.clone().text());
      assert.equal((await statusFilter.json()).items.every((item) => item.status === 'READY'), true);
      assert.equal((await fetch(`${listPath}?limit=50`, {
        headers: { cookie: cookies.admin },
      })).status, 200);

      const paidDateFilter = await fetch(
        `${listPath}?from=2026-10-06&to=2026-10-06&limit=50`,
        { headers: { cookie: cookies.admin } },
      );
      assert.equal(paidDateFilter.status, 200, await paidDateFilter.clone().text());
      assert.deepEqual((await paidDateFilter.json()).items.map((item) => item.shipmentOrderId),
        expected);
      const outsidePaidDate = await fetch(
        `${listPath}?from=2026-10-07&to=2026-10-07&limit=50`,
        { headers: { cookie: cookies.admin } },
      );
      assert.equal(outsidePaidDate.status, 200, await outsidePaidDate.clone().text());
      assert.deepEqual((await outsidePaidDate.json()).items, []);

      await pool.query(`UPDATE checkout_orders SET recipient_name='이율' WHERE id=$1`,
        [fixture.sellerBOrder.orderId]);
      const shortNameResponse = await fetch(
        `${listPath}?sellerId=${fixture.sellerB.id}&limit=50`,
        { headers: { cookie: cookies.admin } },
      );
      assert.equal(shortNameResponse.status, 200, await shortNameResponse.clone().text());
      const shortName = (await shortNameResponse.json()).items[0].recipientName;
      assert.notEqual(shortName, '이율');
      assert.match(shortName, /\*/);
      assert.equal(shortName.includes('이') && shortName.includes('율'), false,
        `two-character recipient leaked both original characters: ${shortName}`);
    });

    await context.test('admin detail returns minimum address, current values and safe events', async () => {
      assert.equal((await fetch(`${listPath}/${fixture.unpaidOrder.shipmentId}`, {
        headers: { cookie: cookies.admin },
      })).status, 404);
      const response = await fetch(`${listPath}/${fixture.detailOrder.shipmentId}`, {
        headers: { cookie: cookies.admin },
      });
      assert.equal(response.status, 200, await response.clone().text());
      const detail = await response.json();
      assert.equal(detail.shipmentOrderId, fixture.detailOrder.shipmentId);
      assert.equal(detail.status, 'READY');
      assert.equal(detail.version, 0);
      assert.deepEqual(detail.address, {
        recipientName: '가상고객', phone: '01012345678', postalCode: '12345',
        line1: '서울시 가상구 테스트로 1', line2: '가상 101호',
      });
      assert.deepEqual(detail.fulfillmentSeller, {
        id: fixture.sellerA.id, displayName: fixture.sellerA.name,
      });
      assert.deepEqual(detail.lines, [{
        productId: fixture.productA.productId,
        optionId: fixture.productA.optionId,
        sellerId: fixture.productA.sellerId,
        productName: fixture.productA.title,
        optionName: '기본', quantity: 3,
        category: { id: fixture.productA.categoryId, name: fixture.productA.categoryName },
      }]);
      assert.equal(detail.events.length, 1);
      assert.deepEqual(detail.events[0].before, {
        status: 'PAYMENT_PENDING', expectedShipDate: null,
        carrierCode: null, trackingNumber: null,
      });
      assert.deepEqual(detail.events[0].after, {
        status: 'READY', expectedShipDate,
        carrierCode: null, trackingNumber: null,
      });
      assert.equal(detail.events[0].action, 'PAYMENT_CONFIRMED');
      assert.doesNotMatch(JSON.stringify(detail),
        /actorAccountId|actorSellerId|idempotencyKey|idempotencyScope|requestFingerprint|addressId|accountId/);
      assert.equal((await fetch(`${listPath}/${randomUUID()}`, {
        headers: { cookie: cookies.admin },
      })).status, 404);
      assert.equal((await fetch(`${listPath}/not-a-uuid`, {
        headers: { cookie: cookies.admin },
      })).status, 400);
    });

    await context.test('admin correction rejects invalid requests with zero mutation', async () => {
      const shipmentId = fixture.invalidOrder.shipmentId;
      const before = await fulfillmentState(pool, shipmentId);
      const valid = {
        expectedVersion: 0,
        corrected: { status: 'PACKING' },
        reason: '가상 관리자 정정', customerMessage: '가상 고객 안내',
      };
      assert.equal((await correct(base, shipmentId, valid, cookies.admin, randomUUID(),
        'https://invalid.example')).status, 403);
      assert.equal((await correct(base, shipmentId, valid, cookies.admin, '')).status, 400);
      assert.equal((await correct(base, shipmentId, { ...valid, expectedVersion: -1 },
        cookies.admin)).status, 400);
      assert.equal((await correct(base, shipmentId, { ...valid, expectedVersion: 99 },
        cookies.admin)).status, 409);
      assert.equal((await correct(base, shipmentId, { ...valid, unexpected: true },
        cookies.admin)).status, 400);
      assert.equal((await correct(base, shipmentId, { ...valid, reason: '' },
        cookies.admin)).status, 400);
      assert.equal((await correct(base, shipmentId, {
        ...valid, corrected: { status: 'CANCELLED' },
      }, cookies.admin)).status, 400);
      assert.equal((await correct(base, shipmentId, {
        ...valid, corrected: { status: 'SHIPPED', expectedShipDate },
      }, cookies.admin)).status, 400);
      assert.equal((await correct(base, shipmentId, {
        ...valid, corrected: { status: 'SHIPPED', expectedShipDate,
          carrierCode: 'cj_logistics', trackingNumber: 'ADMIN123', unknown: true },
      }, cookies.admin)).status, 400);
      assert.equal((await correct(base, shipmentId, {
        ...valid, corrected: { status: 'PACKING', expectedShipDate: '0000-01-01' },
      }, cookies.admin)).status, 400);
      assert.deepEqual(await fulfillmentState(pool, shipmentId), before);
    });

    await context.test('admin correction stores before/after, notices and audit exactly once', async () => {
      const shipmentId = fixture.correctionOrder.shipmentId;
      const key = randomUUID();
      const body = {
        expectedVersion: 0,
        corrected: {
          status: 'SHIPPED', expectedShipDate: '2026-10-09',
          carrierCode: 'cj_logistics', trackingNumber: 'ADMIN-123',
        },
        reason: '가상 관리자 출고정보 정정',
        customerMessage: '가상 안내: 운송장 정보를 정정했습니다',
      };
      const response = await correct(base, shipmentId, body, cookies.admin, key);
      assert.equal(response.status, 200, await response.clone().text());
      const corrected = await response.json();
      assert.deepEqual(corrected, {
        shipmentOrderId: shipmentId, status: 'SHIPPED', version: 1,
        expectedShipDate: '2026-10-09',
        customerMessage: body.customerMessage,
        carrierCode: 'cj_logistics', carrierName: null, trackingNumber: 'ADMIN123',
      });
      const replay = await correct(base, shipmentId, body, cookies.admin, key);
      assert.equal(replay.status, 200);
      assert.deepEqual(await replay.json(), corrected);
      assert.equal((await correct(base, shipmentId, {
        ...body, customerMessage: '다른 가상 안내',
      }, cookies.admin, key)).status, 409);
      assert.deepEqual(await correctionWriteCounts(pool, shipmentId), {
        version: 1, eventCount: 1, auditCount: 1,
      });
      const event = (await pool.query(`SELECT action,from_status AS "fromStatus",
        to_status AS "toStatus",actor_account_id AS "actorAccountId",actor_role AS "actorRole",
        actor_seller_id AS "actorSellerId",reason,customer_message AS "customerMessage",
        before_snapshot AS before,after_snapshot AS after,idempotency_scope AS "idempotencyScope",
        idempotency_key AS "idempotencyKey",request_fingerprint AS "requestFingerprint"
        FROM shipment_fulfillment_events
        WHERE shipment_order_id=$1 AND action='ADMIN_CORRECT'`, [shipmentId])).rows[0];
      assert.deepEqual(event, {
        action: 'ADMIN_CORRECT', fromStatus: 'READY', toStatus: 'SHIPPED',
        actorAccountId: fixture.adminId, actorRole: 'admin', actorSellerId: null,
        reason: body.reason, customerMessage: body.customerMessage,
        before: { status: 'READY', expectedShipDate,
          carrierCode: null, trackingNumber: null },
        after: { status: 'SHIPPED', expectedShipDate: '2026-10-09',
          carrierCode: 'cj_logistics', trackingNumber: 'ADMIN123' },
        idempotencyScope: fixture.adminId, idempotencyKey: key,
        requestFingerprint: event.requestFingerprint,
      });
      assert.match(event.requestFingerprint, /^[0-9a-f]{64}$/);
      const audit = (await pool.query(`SELECT details FROM audit_events
        WHERE actor_account_id=$1 AND active_role='admin' AND seller_id IS NULL
          AND action='fulfillment.admin_correction' AND target_type='shipment_order'
          AND target_id=$2`, [fixture.adminId, shipmentId])).rows;
      assert.equal(audit.length, 1);
      assert.equal(audit[0].details.idempotencyKey, key);
      assert.equal(audit[0].details.reason, body.reason);
      const persisted = JSON.stringify({ event, audit });
      assert.doesNotMatch(persisted,
        /가상고객|01012345678|서울시 가상구|가상 101호|12345/);
    });

    await context.test('SHIPPED other-carrier correction preserves ship times and complete PII-free audit', async () => {
      const shipment = fixture.sellerAOrders.find(({ status }) => status === 'SHIPPED');
      assert.ok(shipment);
      const before = (await pool.query(`UPDATE shipment_fulfillments
        SET carrier_code='other',carrier_name='기타 택배 A',tracking_number='OTHERBEFORE'
        WHERE shipment_order_id=$1
        RETURNING status,version,expected_ship_date::text AS "expectedShipDate",
          carrier_code AS "carrierCode",carrier_name AS "carrierName",
          tracking_number AS "trackingNumber",first_shipped_at AS "firstShippedAt",
          shipped_at AS "shippedAt"`, [shipment.shipmentId])).rows[0];
      assert.equal(before.status, 'SHIPPED');
      assert.equal(before.version, 0);
      assert.ok(before.firstShippedAt instanceof Date);
      assert.ok(before.shippedAt instanceof Date);

      const body = {
        expectedVersion: 0,
        corrected: {
          status: 'SHIPPED', expectedShipDate: before.expectedShipDate,
          carrierCode: 'other', carrierName: '기타 택배 B', trackingNumber: 'OTHERAFTER',
        },
        reason: '가상 기타 택배사·운송장 정정',
        customerMessage: '가상 안내: 택배사와 운송장을 정정했습니다',
      };
      const response = await correct(base, shipment.shipmentId, body, cookies.admin);
      assert.equal(response.status, 200, await response.clone().text());

      const persisted = (await pool.query(`SELECT f.first_shipped_at AS "firstShippedAt",
          f.shipped_at AS "shippedAt",a.details,
          e.before_snapshot AS "eventBefore",e.after_snapshot AS "eventAfter"
        FROM shipment_fulfillments f
        JOIN audit_events a ON a.action='fulfillment.admin_correction'
          AND a.target_type='shipment_order' AND a.target_id=f.shipment_order_id::text
        JOIN shipment_fulfillment_events e ON e.shipment_order_id=f.shipment_order_id
          AND e.action='ADMIN_CORRECT'
        WHERE f.shipment_order_id=$1`, [shipment.shipmentId])).rows[0];
      const piiPattern = /가상고객|01012345678|서울시 가상구|가상 101호|12345/;
      assert.deepEqual({
        firstShippedAt: persisted.firstShippedAt.toISOString(),
        shippedAt: persisted.shippedAt.toISOString(),
        audit: {
          before: persisted.details.before,
          after: persisted.details.after,
          reason: persisted.details.reason,
          customerMessage: persisted.details.customerMessage,
        },
        piiFree: !piiPattern.test(JSON.stringify(persisted.details)),
        eventSnapshotKeys: {
          before: Object.keys(persisted.eventBefore).sort(),
          after: Object.keys(persisted.eventAfter).sort(),
        },
      }, {
        firstShippedAt: before.firstShippedAt.toISOString(),
        shippedAt: before.shippedAt.toISOString(),
        audit: {
          before: {
            status: 'SHIPPED', expectedShipDate: before.expectedShipDate,
            carrierCode: 'other', carrierName: '기타 택배 A', trackingNumber: 'OTHERBEFORE',
          },
          after: {
            status: 'SHIPPED', expectedShipDate: before.expectedShipDate,
            carrierCode: 'other', carrierName: '기타 택배 B', trackingNumber: 'OTHERAFTER',
          },
          reason: body.reason,
          customerMessage: body.customerMessage,
        },
        piiFree: true,
        eventSnapshotKeys: {
          before: ['carrierCode', 'expectedShipDate', 'status', 'trackingNumber'],
          after: ['carrierCode', 'expectedShipDate', 'status', 'trackingNumber'],
        },
      });
    });

    await context.test('concurrent different keys observe real locks and allow one version winner', async () => {
      const shipmentId = fixture.concurrentOrder.shipmentId;
      const probe = await fetch(`${listPath}/${shipmentId}`, {
        headers: { cookie: cookies.admin },
      });
      assert.equal(probe.status, 200, await probe.clone().text());
      const body = {
        expectedVersion: 0, corrected: { status: 'PACKING' },
        reason: '가상 동시 정정', customerMessage: '가상 동시 정정 안내',
      };
      const keys = [randomUUID(), randomUUID()];
      const { results, waits } = await runBehindFulfillmentRowLock(pool, shipmentId,
        keys.map((key) => async () => {
          const response = await correct(base, shipmentId, body, cookies.admin, key);
          return { status: response.status, payload: await response.json() };
        }));
      assert.deepEqual(waits.map(({ waitTarget }) => waitTarget).sort(),
        ['fulfillment', 'shipment']);
      assert.equal(waits.every(({ waitEventType, hasPendingLock }) =>
        waitEventType === 'Lock' && hasPendingLock), true);
      assert.deepEqual(results.map(({ status }) => status).sort((left, right) => left - right),
        [200, 409], JSON.stringify(results));
      const winner = results.find(({ status }) => status === 200);
      assert.equal(winner?.payload.status, 'PACKING');
      assert.equal(winner?.payload.version, 1);
      assert.deepEqual(await correctionWriteCounts(pool, shipmentId), {
        version: 1, eventCount: 1, auditCount: 1,
      });
    });

    await context.test('concurrent same-key replay observes real locks and persists once', async () => {
      const shipmentId = fixture.replayConcurrentOrder.shipmentId;
      const probe = await fetch(`${listPath}/${shipmentId}`, {
        headers: { cookie: cookies.admin },
      });
      assert.equal(probe.status, 200, await probe.clone().text());
      const body = {
        expectedVersion: 0, corrected: { status: 'PACKING' },
        reason: '가상 멱등 동시 정정', customerMessage: '가상 멱등 안내',
      };
      const key = randomUUID();
      const { results, waits } = await runBehindFulfillmentRowLock(pool, shipmentId,
        [0, 1].map(() => async () => {
          const response = await correct(base, shipmentId, body, cookies.admin, key);
          return { status: response.status, payload: await response.json() };
        }));
      assert.deepEqual(waits.map(({ waitTarget }) => waitTarget).sort(),
        ['fulfillment', 'shipment']);
      assert.equal(waits.every(({ waitEventType, hasPendingLock }) =>
        waitEventType === 'Lock' && hasPendingLock), true);
      assert.deepEqual(results.map(({ status }) => status), [200, 200], JSON.stringify(results));
      assert.deepEqual(results[1].payload, results[0].payload);
      assert.equal(results[0].payload.status, 'PACKING');
      assert.equal(results[0].payload.version, 1);
      assert.deepEqual(await correctionWriteCounts(pool, shipmentId), {
        version: 1, eventCount: 1, auditCount: 1,
      });
    });
  } finally {
    if (app) await app.close();
    await cleanupFixture(pool, fixture);
    await pool.end();
  }
});
