import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { cleanupRefundHttpFixture, refundCookies,
  seedRefundHttpFixture } from '../test-support/refund-http-fixture.mjs';

const origin = 'http://127.0.0.1:9091';

test('refund HTTP keeps customer ownership and lets only admin decide and execute mock refunds', {
  skip: !process.env.DATABASE_URL,
}, async (context) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
  const previous = { APP_ENV: process.env.APP_ENV, PAYMENT_MODE: process.env.PAYMENT_MODE,
    API_HOST: process.env.API_HOST };
  let app; let ids;
  try {
    const ready = await pool.query("SELECT to_regclass('public.refund_cases') IS NOT NULL AS ready");
    if (!ready.rows[0].ready) {
      if (process.env.S4_REFUND_SCHEMA_REQUIRED === '1') throw new Error('S4 refund migration 0014 required');
      context.skip('S4 refund migration 0014 not applied');
      return;
    }
    ids = await seedRefundHttpFixture(pool);
    const cookies = refundCookies(ids);
    process.env.APP_ENV = 'development';
    process.env.PAYMENT_MODE = 'mock';
    process.env.API_HOST = '127.0.0.1';
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const customerPath = `${base}/customer/checkout/orders/${ids.orderId}/refund-cases`;
    const adminPath = `${base}/refunds/admin/cases`;
    const payload = { shipmentOrderId: ids.shipmentId,
      lines: [{ optionId: ids.optionId, quantity: 1 }], reasonCode: 'customer_request',
      reason: '출고 전 일부 취소 요청' };
    const post = (url, body, cookie, key = randomUUID(), requestOrigin = origin) => fetch(url, {
      method: 'POST', headers: { ...(cookie ? { cookie } : {}), origin: requestOrigin,
        'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body),
    });

    assert.equal((await post(customerPath, payload)).status, 401);
    assert.equal((await post(customerPath, payload, cookies.seller)).status, 403);
    assert.equal((await post(customerPath, payload, cookies.otherCustomer)).status, 404);
    assert.equal((await post(customerPath, payload, cookies.customer, randomUUID(),
      'http://invalid.test')).status, 403);
    assert.equal((await post(customerPath, payload, cookies.customer, 'invalid')).status, 400);
    assert.equal((await post(customerPath, { ...payload, extra: true }, cookies.customer)).status, 400);

    const requestKey = randomUUID();
    const createdResponse = await post(customerPath, payload, cookies.customer, requestKey);
    assert.equal(createdResponse.status, 201, await createdResponse.clone().text());
    const created = await createdResponse.json();
    assert.equal(created.status, 'REQUESTED');
    assert.equal(created.amountFinal, false);
    assert.equal(created.estimateAvailable, true);
    assert.deepEqual([created.goodsRefundWon, created.shippingRefundWon, created.totalRefundWon],
      [3333, 0, 3333]);
    assert.deepEqual(created.lines.map(({ optionId, quantity }) => ({ optionId, quantity })), payload.lines);
    const retryResponse = await post(customerPath, payload, cookies.customer, requestKey);
    assert.equal(retryResponse.status, 200);
    assert.equal((await retryResponse.json()).id, created.id);
    assert.equal((await post(customerPath, { ...payload, reason: '다른 요청 본문' },
      cookies.customer, requestKey)).status, 409);

    const customerList = await fetch(customerPath, { headers: { cookie: cookies.customer } });
    assert.equal(customerList.status, 200);
    const customerRows = await customerList.json();
    assert.equal(customerRows.length, 1);
    assert.equal(customerRows[0].id, created.id);
    assert.deepEqual(customerRows[0].lines.map(({ optionId, quantity }) => ({ optionId, quantity })),
      payload.lines);
    for (const privateKey of ['decisionReason', 'preShipmentEvidence', 'attempts', 'providerRefundId']) {
      assert.equal(Object.hasOwn(customerRows[0], privateKey), false);
    }
    const customerDetailPath = `${customerPath}/${created.id}`;
    assert.equal((await fetch(customerDetailPath, { headers: { cookie: cookies.customer } })).status, 200);
    assert.equal((await fetch(customerDetailPath, { headers: { cookie: cookies.otherCustomer } })).status, 404);
    assert.equal((await fetch(customerDetailPath, { headers: { cookie: cookies.seller } })).status, 403);
    assert.equal((await fetch(`${customerPath}/${randomUUID()}`,
      { headers: { cookie: cookies.customer } })).status, 404);

    assert.equal((await fetch(adminPath)).status, 401);
    assert.equal((await fetch(adminPath, { headers: { cookie: cookies.customer } })).status, 403);
    assert.equal((await fetch(adminPath, { headers: { cookie: cookies.seller } })).status, 403);
    const adminList = await fetch(adminPath, { headers: { cookie: cookies.admin } });
    assert.equal(adminList.status, 200);
    assert.equal((await adminList.json()).some(({ id }) => id === created.id), true);
    const adminDetail = await fetch(`${adminPath}/${created.id}`, { headers: { cookie: cookies.admin } });
    assert.equal(adminDetail.status, 200);
    assert.equal((await adminDetail.json()).history[0].toStatus, 'REQUESTED');

    const decisionPath = `${adminPath}/${created.id}/decision`;
    assert.equal((await post(decisionPath, { decision: 'approve', reason: '근거 누락',
      preShipmentConfirmed: false, lines: [{ optionId: ids.optionId, restockMode: 'none' }] },
    cookies.admin)).status, 400);
    assert.equal((await post(decisionPath, { decision: 'approve', reason: '미출고 확인',
      preShipmentConfirmed: true, preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
      lines: [{ optionId: ids.optionId, restockMode: 'none' }] }, cookies.seller)).status, 403);
    const decisionKey = randomUUID();
    const approvedResponse = await post(decisionPath, { decision: 'approve', reason: '미출고 확인',
      preShipmentConfirmed: true, preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
      lines: [{ optionId: ids.optionId, restockMode: 'none' }] }, cookies.admin, decisionKey);
    assert.equal(approvedResponse.status, 200, await approvedResponse.clone().text());
    const approved = await approvedResponse.json();
    assert.equal(approved.status, 'REFUNDED');
    assert.deepEqual([approved.goodsRefundWon, approved.shippingRefundWon, approved.totalRefundWon],
      [3333, 0, 3333]);
    assert.equal(approved.attempts.length, 1);
    assert.equal(approved.attempts[0].events.length, 1);
    assert.equal(approved.attempts[0].events[0].processingStatus, 'APPLIED');
    const decisionRetry = await post(decisionPath, { decision: 'approve', reason: '미출고 확인',
      preShipmentConfirmed: true, preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
      lines: [{ optionId: ids.optionId, restockMode: 'none' }] }, cookies.admin, decisionKey);
    assert.equal(decisionRetry.status, 200);
    assert.equal((await decisionRetry.json()).status, 'REFUNDED');
    assert.equal((await post(decisionPath, { decision: 'approve', reason: '다른 결정 내용',
      preShipmentConfirmed: true, preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
      lines: [{ optionId: ids.optionId, restockMode: 'none' }] }, cookies.admin, decisionKey)).status, 409);

    const rejectedRequest = await post(customerPath, { ...payload,
      lines: [{ optionId: ids.optionId, quantity: 3 }], reason: '잔여 수량을 넘긴 별도 요청' },
      cookies.customer, randomUUID());
    assert.equal(rejectedRequest.status, 201);
    const rejectedCase = await rejectedRequest.json();
    const staleEstimate = await fetch(`${customerPath}/${rejectedCase.id}`,
      { headers: { cookie: cookies.customer } }).then((response) => response.json());
    assert.equal(staleEstimate.amountFinal, false);
    assert.equal(staleEstimate.estimateAvailable, false);
    assert.deepEqual([staleEstimate.goodsRefundWon, staleEstimate.shippingRefundWon,
      staleEstimate.totalRefundWon], [0, 0, 0]);
    const rejected = await post(`${adminPath}/${rejectedCase.id}/decision`,
      { decision: 'reject', reason: '요청 조건 불충족', preShipmentConfirmed: false, lines: [] },
      cookies.admin, randomUUID());
    assert.equal(rejected.status, 200);
    assert.equal((await rejected.json()).status, 'REJECTED');

    const adminCreatedResponse = await post(adminPath, { checkoutOrderId: ids.orderId,
      shipmentOrderId: ids.shipmentId, lines: [{ optionId: ids.optionId, quantity: 2 }],
      reasonCode: 'other', reason: '관리자 직권 전량 취소' }, cookies.admin, randomUUID());
    assert.equal(adminCreatedResponse.status, 201, await adminCreatedResponse.clone().text());
    const adminCreated = await adminCreatedResponse.json();
    assert.equal(adminCreated.requesterRole, 'admin');
    assert.equal(adminCreated.amountFinal, false);
    assert.deepEqual([adminCreated.goodsRefundWon, adminCreated.shippingRefundWon,
      adminCreated.totalRefundWon], [6667, 2000, 8667]);
    const finalResponse = await post(`${adminPath}/${adminCreated.id}/decision`,
      { decision: 'approve', reason: '미출고 및 회수 확인', preShipmentConfirmed: true,
        preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
        lines: [{ optionId: ids.optionId, restockMode: 'on_hand_only' }] },
      cookies.admin, randomUUID());
    assert.equal(finalResponse.status, 200, await finalResponse.clone().text());
    const final = await finalResponse.json();
    assert.equal(final.status, 'REFUNDED');
    assert.deepEqual([final.goodsRefundWon, final.shippingRefundWon, final.totalRefundWon],
      [6667, 2000, 8667]);
    const originalOrder = (await pool.query(`SELECT goods_won AS "goodsWon",
      goods_discount_won AS "goodsDiscountWon",shipping_fee_won AS "shippingFeeWon",
      shipping_support_won AS "shippingSupportWon",payable_won AS "payableWon",status
      FROM checkout_orders WHERE id=$1`, [ids.orderId])).rows[0];
    assert.deepEqual(originalOrder, { goodsWon: 12000, goodsDiscountWon: 2000,
      shippingFeeWon: 3000, shippingSupportWon: 1000, payableWon: 12000, status: 'PAID' });
    const originalShipment = (await pool.query(`SELECT goods_won AS "goodsWon",
      goods_discount_won AS "goodsDiscountWon",shipping_fee_won AS "shippingFeeWon",
      shipping_support_won AS "shippingSupportWon",payable_won AS "payableWon",status
      FROM shipment_orders WHERE id=$1`, [ids.shipmentId])).rows[0];
    assert.deepEqual(originalShipment, { goodsWon: 12000, goodsDiscountWon: 2000,
      shippingFeeWon: 3000, shippingSupportWon: 1000, payableWon: 12000, status: 'PAID' });
    const filtered = await fetch(`${adminPath}?status=REFUNDED&shipmentOrderId=${ids.shipmentId}`,
      { headers: { cookie: cookies.admin } });
    assert.equal(filtered.status, 200);
    assert.equal((await filtered.json()).length, 2);
    const stock = (await pool.query(`SELECT on_hand_quantity,sellable_quantity
      FROM inventory_levels WHERE option_id=$1`, [ids.optionId])).rows[0];
    assert.deepEqual(stock, { on_hand_quantity: 9, sellable_quantity: 7 });
    const persisted = (await pool.query(`SELECT
      (SELECT count(*)::int FROM refund_attempts a JOIN refund_cases c ON c.id=a.refund_case_id
        WHERE c.checkout_order_id=$1) AS attempts,
      (SELECT count(*)::int FROM refund_events e JOIN refund_attempts a ON a.id=e.refund_attempt_id
        JOIN refund_cases c ON c.id=a.refund_case_id WHERE c.checkout_order_id=$1) AS events`,
    [ids.orderId])).rows[0];
    assert.deepEqual(persisted, { attempts: 2, events: 2 });
  } finally {
    if (app) await app.close();
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
    if (ids) await cleanupRefundHttpFixture(pool, ids);
    await pool.end();
  }
});

test('refund HTTP reports database unavailable without exposing a route as missing', async () => {
  const saved = process.env.DATABASE_URL;
  let app;
  try {
    delete process.env.DATABASE_URL;
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const response = await fetch(`${base}/customer/checkout/orders/${randomUUID()}/refund-cases`,
      { headers: { cookie: 'sm_session=unavailable-test' } });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).dependency, 'database');
  } finally {
    if (app) await app.close();
    if (saved === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = saved;
  }
});
