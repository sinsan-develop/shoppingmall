import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { MockRefundAdapter, NoChargeRefundAdapter } from '../src/refunds/mock-adapter.ts';
import { processVerifiedRefundEvent } from '../src/refunds/processor.ts';
import { createRefundCase, decideRefundCase, getRefundCase,
  recordVerifiedRefundEvent } from '../src/refunds/service.ts';
import { assertOrderMutationQaTarget, skipWithoutFulfillmentSchema,
  skipWithoutOrderSchema } from './order-schema-guard.mjs';

const fingerprint = 'a'.repeat(64);

async function requireTask7Schema(context, pool) {
  await assertOrderMutationQaTarget(pool, process.env.S5_PAYMENT_TEST_DB_SYSTEM_ID);
  if (await skipWithoutOrderSchema(context, pool, true)) return false;
  if (await skipWithoutFulfillmentSchema(context, pool, true)) return false;
  const migrations = (await pool.query(
    'SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations',
  )).rows[0].count;
  assert.equal(migrations, 16);
  return true;
}

async function seedPaidOrder(pool) {
  const ids = { accounts: [], categories: [] };
  for (const role of ['customer', 'admin', 'seller']) {
    const accountId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    ids.accounts.push(accountId);
    ids[role === 'seller' ? 'sellerAccountId' : `${role}Id`] = accountId;
  }
  const sellerCategoryId = (await pool.query(
    'INSERT INTO seller_categories(name) VALUES ($1) RETURNING id', [`refund-${randomUUID()}`],
  )).rows[0].id;
  ids.sellerCategoryId = sellerCategoryId;
  ids.sellerId = (await pool.query(
    'INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
    [sellerCategoryId, `refund-seller-${randomUUID()}`],
  )).rows[0].id;
  await pool.query(`INSERT INTO account_roles(account_id,role,seller_id) VALUES
    ($1,'customer',NULL),($2,'admin',NULL),($3,'seller',$4)`,
  [ids.customerId, ids.adminId, ids.sellerAccountId, ids.sellerId]);
  const majorId = (await pool.query(
    'INSERT INTO product_categories(name) VALUES ($1) RETURNING id', [`refund-major-${randomUUID()}`],
  )).rows[0].id;
  const minorId = (await pool.query(
    'INSERT INTO product_categories(parent_id,name) VALUES ($1,$2) RETURNING id',
    [majorId, `refund-minor-${randomUUID()}`],
  )).rows[0].id;
  ids.categories.push(minorId, majorId);
  ids.productId = (await pool.query(
    'INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
    [ids.sellerId, minorId],
  )).rows[0].id;
  ids.revisionId = (await pool.query(`INSERT INTO product_revisions
    (product_id,version,title,description,origin_label,shipping_mode,status,
     proposed_by_account_id,reviewed_by_account_id,reviewed_at)
    VALUES ($1,1,'환불 시험 상품','환불 시험','시험 산지','seller_direct','approved',$2,$3,now())
    RETURNING id`, [ids.productId, ids.sellerAccountId, ids.adminId])).rows[0].id;
  ids.optionId = (await pool.query(`INSERT INTO product_options(revision_id,name,price_won)
    VALUES ($1,'기본',4000) RETURNING id`, [ids.revisionId])).rows[0].id;
  await pool.query(`INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity)
    VALUES ($1,7,7)`, [ids.optionId]);
  await pool.query(`INSERT INTO product_publications(product_id,revision_id,published_by_account_id)
    VALUES ($1,$2,$3)`, [ids.productId, ids.revisionId, ids.adminId]);
  ids.addressId = (await pool.query(`INSERT INTO customer_addresses
    (account_id,label,recipient_name,phone,postal_code,line1)
    VALUES ($1,'시험','받는 분','01000000000','12345','시험 주소') RETURNING id`,
  [ids.customerId])).rows[0].id;
  ids.reservationId = (await pool.query(`INSERT INTO checkout_reservations
    (account_id,idempotency_key,status,expires_at,ended_at)
    VALUES ($1,$2,'CONSUMED',now()+interval '1 hour',now()) RETURNING id`,
  [ids.customerId, randomUUID()])).rows[0].id;
  await pool.query(`INSERT INTO checkout_reservation_lines(reservation_id,option_id,quantity)
    VALUES ($1,$2,3)`, [ids.reservationId, ids.optionId]);
  ids.orderId = (await pool.query(`INSERT INTO checkout_orders
    (account_id,reservation_id,idempotency_key,request_fingerprint,address_id,
     recipient_name,phone,postal_code,line1,goods_won,goods_discount_won,
     shipping_fee_won,shipping_support_won,payable_won,status,expires_at,ended_at,paid_at)
    VALUES ($1,$2,$3,$4,$5,'받는 분','01000000000','12345','시험 주소',
      12000,2000,3000,1000,12000,'PAID',now()+interval '1 hour',now(),now()) RETURNING id`,
  [ids.customerId, ids.reservationId, randomUUID(), fingerprint, ids.addressId])).rows[0].id;
  ids.shipmentId = (await pool.query(`INSERT INTO shipment_orders
    (checkout_order_id,shipment_key,shipping_mode,seller_id,goods_won,goods_discount_won,
     shipping_fee_won,shipping_support_won,payable_won,status)
    VALUES ($1,$2,'seller_direct',$3,12000,2000,3000,1000,12000,'PAID') RETURNING id`,
  [ids.orderId, `seller:${ids.sellerId}`, ids.sellerId])).rows[0].id;
  await pool.query(`INSERT INTO shipment_order_lines
    (shipment_order_id,product_id,option_id,seller_id,product_name,option_name,
     unit_price_won,quantity,goods_discount_won,goods_payable_won)
    VALUES ($1,$2,$3,$4,'환불 시험 상품','기본',4000,3,2000,10000)`,
  [ids.shipmentId, ids.productId, ids.optionId, ids.sellerId]);
  await pool.query(`INSERT INTO shipment_fulfillments
    (shipment_order_id,fulfillment_seller_id,status,expected_ship_date)
    VALUES ($1,$2,'READY','2026-10-08')`, [ids.shipmentId, ids.sellerId]);
  ids.paymentAttemptId = (await pool.query(`INSERT INTO payment_attempts
    (checkout_order_id,provider,provider_order_id,requested_won,idempotency_key,
     request_fingerprint,status,ended_at)
    VALUES ($1,'mock',$2,12000,$3,$4,'APPROVED',now()) RETURNING id`,
  [ids.orderId, `mock:order:${ids.orderId}`, randomUUID(), fingerprint])).rows[0].id;
  ids.paymentId = `mock:payment:${randomUUID()}`;
  await pool.query(`INSERT INTO payment_events
    (payment_attempt_id,provider,provider_event_id,outcome,verified_order_id,
     provider_payment_id,amount_won,event_fingerprint,processing_status,processed_at)
    VALUES ($1,'mock',$2,'APPROVED',$3,$4,12000,$5,'APPLIED',now())`,
  [ids.paymentAttemptId, `mock:event:${randomUUID()}`, ids.orderId, ids.paymentId, fingerprint]);
  return ids;
}

async function cleanup(pool, ids) {
  if (!ids?.orderId) return;
  await pool.query(`DELETE FROM refund_event_conflicts WHERE original_event_id IN
    (SELECT e.id FROM refund_events e JOIN refund_attempts a ON a.id=e.refund_attempt_id
     JOIN refund_cases c ON c.id=a.refund_case_id WHERE c.checkout_order_id=$1)`, [ids.orderId]);
  await pool.query(`DELETE FROM refund_case_events WHERE refund_case_id IN
    (SELECT id FROM refund_cases WHERE checkout_order_id=$1)`, [ids.orderId]);
  await pool.query(`DELETE FROM refund_events WHERE refund_attempt_id IN
    (SELECT a.id FROM refund_attempts a JOIN refund_cases c ON c.id=a.refund_case_id
     WHERE c.checkout_order_id=$1)`, [ids.orderId]);
  await pool.query(`DELETE FROM refund_attempts WHERE refund_case_id IN
    (SELECT id FROM refund_cases WHERE checkout_order_id=$1)`, [ids.orderId]);
  await pool.query(`DELETE FROM refund_case_lines WHERE refund_case_id IN
    (SELECT id FROM refund_cases WHERE checkout_order_id=$1)`, [ids.orderId]);
  await pool.query('DELETE FROM refund_cases WHERE checkout_order_id=$1', [ids.orderId]);
  await pool.query('DELETE FROM payment_events WHERE payment_attempt_id=$1', [ids.paymentAttemptId]);
  await pool.query('DELETE FROM payment_attempts WHERE id=$1', [ids.paymentAttemptId]);
  await pool.query('DELETE FROM shipment_fulfillment_events WHERE shipment_order_id=$1', [ids.shipmentId]);
  await pool.query('DELETE FROM shipment_order_lines WHERE shipment_order_id=$1', [ids.shipmentId]);
  await pool.query('DELETE FROM shipment_fulfillments WHERE shipment_order_id=$1', [ids.shipmentId]);
  await pool.query('DELETE FROM shipment_orders WHERE id=$1', [ids.shipmentId]);
  await pool.query('DELETE FROM checkout_orders WHERE id=$1', [ids.orderId]);
  await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=$1', [ids.reservationId]);
  await pool.query('DELETE FROM checkout_reservations WHERE id=$1', [ids.reservationId]);
  await pool.query('DELETE FROM customer_addresses WHERE id=$1', [ids.addressId]);
  await pool.query('DELETE FROM product_publications WHERE product_id=$1', [ids.productId]);
  await pool.query('DELETE FROM product_sale_stop_requests WHERE product_id=$1', [ids.productId]);
  await pool.query('DELETE FROM inventory_levels WHERE option_id=$1', [ids.optionId]);
  await pool.query('DELETE FROM product_options WHERE id=$1', [ids.optionId]);
  if (ids.extraOption) {
    await pool.query('DELETE FROM inventory_levels WHERE option_id=$1', [ids.extraOption]);
    await pool.query('DELETE FROM product_options WHERE id=$1', [ids.extraOption]);
  }
  await pool.query('DELETE FROM product_revisions WHERE id=$1', [ids.revisionId]);
  await pool.query('DELETE FROM products WHERE id=$1', [ids.productId]);
  for (const categoryId of ids.categories) await pool.query('DELETE FROM product_categories WHERE id=$1', [categoryId]);
  await pool.query('DELETE FROM account_roles WHERE account_id=ANY($1::uuid[])', [ids.accounts]);
  await pool.query('DELETE FROM sellers WHERE id=$1', [ids.sellerId]);
  await pool.query('DELETE FROM seller_categories WHERE id=$1', [ids.sellerCategoryId]);
  await pool.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])', [ids.accounts]);
}

async function readTask7MutationState(pool, ids, caseId) {
  const refund = (await pool.query(`SELECT status,goods_refund_won,shipping_refund_won,
    total_refund_won,completed_at FROM refund_cases WHERE id=$1`, [caseId])).rows[0];
  const fulfillment = (await pool.query(`SELECT status,version,cancelled_at,
    first_shipped_at,shipped_at FROM shipment_fulfillments WHERE shipment_order_id=$1`,
  [ids.shipmentId])).rows[0];
  const stock = (await pool.query(`SELECT on_hand_quantity,sellable_quantity
    FROM inventory_levels WHERE option_id=$1`, [ids.optionId])).rows[0];
  const counts = (await pool.query(`SELECT
    (SELECT count(*)::int FROM refund_attempts WHERE refund_case_id=$1) AS attempts,
    (SELECT count(*)::int FROM refund_events e JOIN refund_attempts a
      ON a.id=e.refund_attempt_id WHERE a.refund_case_id=$1) AS refund_events,
    (SELECT count(*)::int FROM shipment_fulfillment_events
      WHERE shipment_order_id=$2) AS fulfillment_events`, [caseId, ids.shipmentId])).rows[0];
  return { refund, fulfillment, stock, counts };
}

test('sequential pre-shipment refunds preserve snapshots and refund shipping once', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
  let ids;
  try {
    ids = await seedPaidOrder(pool);
    const firstKey = randomUUID();
    const firstRequest = { actorAccountId: ids.customerId, actorRole: 'customer',
      checkoutOrderId: ids.orderId, shipmentOrderId: ids.shipmentId,
      lines: [{ optionId: ids.optionId, quantity: 1 }], reasonCode: 'customer_request',
      reason: '첫 번째 출고 전 취소', idempotencyKey: firstKey };
    const first = await createRefundCase(pool, firstRequest);
    assert.equal(first.status, 'REQUESTED');
    await assert.rejects(() => createRefundCase(pool, { ...firstRequest,
      actorAccountId: ids.sellerAccountId, actorRole: 'seller', idempotencyKey: randomUUID() }),
    /Invalid refund request|Refund unavailable/);
    assert.equal((await createRefundCase(pool, firstRequest)).id, first.id);
    await assert.rejects(() => createRefundCase(pool, { ...firstRequest,
      lines: [{ optionId: ids.optionId, quantity: 2 }] }), /Refund conflict/);

    const concurrentRequest = { ...firstRequest, idempotencyKey: randomUUID(),
      reason: '거절될 별도 요청' };
    const concurrentCases = await Promise.all([
      createRefundCase(pool, concurrentRequest), createRefundCase(pool, concurrentRequest),
    ]);
    assert.equal(concurrentCases[0].id, concurrentCases[1].id);
    const rejected = concurrentCases[0];
    const rejectKey = randomUUID();
    const rejectedDecision = await decideRefundCase(pool, { adminAccountId: ids.adminId,
      caseId: rejected.id, idempotencyKey: rejectKey, decision: 'reject', reason: '출고 전 아님',
      preShipmentConfirmed: false, lines: [] },
    { APP_ENV: 'development', PAYMENT_MODE: 'mock' });
    assert.equal(rejectedDecision.status, 'REJECTED');
    assert.equal((await decideRefundCase(pool, { adminAccountId: ids.adminId,
      caseId: rejected.id, idempotencyKey: rejectKey, decision: 'reject', reason: '출고 전 아님',
      preShipmentConfirmed: false, lines: [] },
    { APP_ENV: 'development', PAYMENT_MODE: 'mock' })).status, 'REJECTED');

    const firstDecisionKey = randomUUID();
    const firstDecisionRequest = { adminAccountId: ids.adminId,
      caseId: first.id, idempotencyKey: firstDecisionKey, decision: 'approve', reason: '미출고 확인',
      preShipmentConfirmed: true, preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
      lines: [{ optionId: ids.optionId, restockMode: 'none' }] };
    await assert.rejects(() => decideRefundCase(pool, { ...firstDecisionRequest,
      adminAccountId: ids.customerId }, { APP_ENV: 'development', PAYMENT_MODE: 'mock' }),
    /Refund unavailable/);
    const firstDecision = await decideRefundCase(pool, firstDecisionRequest,
    { APP_ENV: 'development', PAYMENT_MODE: 'mock' });
    assert.deepEqual([firstDecision.goodsRefundWon, firstDecision.shippingRefundWon,
      firstDecision.totalRefundWon], [3333, 0, 3333]);
    assert.equal((await decideRefundCase(pool, firstDecisionRequest,
    { APP_ENV: 'development', PAYMENT_MODE: 'mock' })).attemptId, firstDecision.attemptId);
    await assert.rejects(() => decideRefundCase(pool, { ...firstDecisionRequest,
      reason: '다른 결정 내용' }, { APP_ENV: 'development', PAYMENT_MODE: 'mock' }),
    /Refund conflict/);
    const adapter = new MockRefundAdapter();
    const firstVerified = adapter.verify({ providerRefundId: firstDecision.providerRefundId,
      orderId: ids.orderId, paymentId: ids.paymentId, amountWon: firstDecision.totalRefundWon,
      outcome: 'SUCCEEDED' });
    const firstEvent = await recordVerifiedRefundEvent(pool, firstDecision.attemptId, firstVerified);
    assert.equal((await processVerifiedRefundEvent(pool, firstEvent.id)).processingStatus, 'APPLIED');
    assert.equal((await processVerifiedRefundEvent(pool, firstEvent.id)).processingStatus, 'APPLIED');
    assert.equal((await recordVerifiedRefundEvent(pool, firstDecision.attemptId, firstVerified)).id,
      firstEvent.id);
    await assert.rejects(() => recordVerifiedRefundEvent(pool, firstDecision.attemptId,
      { ...firstVerified, amountWon: firstVerified.amountWon + 1 }), /Refund event conflict/);

    const second = await createRefundCase(pool, { ...firstRequest, idempotencyKey: randomUUID(),
      lines: [{ optionId: ids.optionId, quantity: 2 }], reason: '나머지 출고 전 취소' });
    await pool.query(`INSERT INTO product_sale_stop_requests
      (product_id,reason,requested_by_account_id,status,decided_by_account_id,decided_at)
      VALUES ($1,'시험 판매중지',$2,'approved',$2,now())`, [ids.productId, ids.adminId]);
    await assert.rejects(() => decideRefundCase(pool, { adminAccountId: ids.adminId,
      caseId: second.id, idempotencyKey: randomUUID(), decision: 'approve', reason: '미출고 확인',
      preShipmentConfirmed: true, preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
      lines: [{ optionId: ids.optionId, restockMode: 'on_hand_only' }] },
    { APP_ENV: 'development', PAYMENT_MODE: 'mock' }), /Restock unavailable/);
    await pool.query('DELETE FROM product_sale_stop_requests WHERE product_id=$1', [ids.productId]);
    const secondDecision = await decideRefundCase(pool, { adminAccountId: ids.adminId,
      caseId: second.id, idempotencyKey: randomUUID(), decision: 'approve', reason: '미출고 및 보유 확인',
      preShipmentConfirmed: true, preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
      lines: [{ optionId: ids.optionId, restockMode: 'on_hand_only' }] },
    { APP_ENV: 'development', PAYMENT_MODE: 'mock' });
    assert.deepEqual([secondDecision.goodsRefundWon, secondDecision.shippingRefundWon,
      secondDecision.totalRefundWon], [6667, 2000, 8667]);
    const secondVerified = adapter.verify({ providerRefundId: secondDecision.providerRefundId,
      orderId: ids.orderId, paymentId: ids.paymentId, amountWon: secondDecision.totalRefundWon,
      outcome: 'SUCCEEDED' });
    const secondEvent = await recordVerifiedRefundEvent(pool, secondDecision.attemptId, secondVerified);
    assert.equal((await processVerifiedRefundEvent(pool, secondEvent.id)).processingStatus, 'APPLIED');
    assert.equal((await processVerifiedRefundEvent(pool, secondEvent.id)).processingStatus, 'APPLIED');
    assert.equal((await recordVerifiedRefundEvent(pool, secondDecision.attemptId, secondVerified)).id,
      secondEvent.id);
    await assert.rejects(() => recordVerifiedRefundEvent(pool, secondDecision.attemptId,
      { ...secondVerified, amountWon: secondVerified.amountWon + 1 }), /Refund event conflict/);

    const caseRows = await pool.query(`SELECT status,goods_refund_won,shipping_refund_won,
      total_refund_won FROM refund_cases WHERE checkout_order_id=$1 ORDER BY requested_at,id`,
    [ids.orderId]);
    assert.equal(caseRows.rows.filter(({ status }) => status === 'REFUNDED').length, 2);
    assert.equal(caseRows.rows.reduce((sum, row) => sum + row.total_refund_won, 0), 12000);
    assert.equal(caseRows.rows.reduce((sum, row) => sum + row.shipping_refund_won, 0), 2000);
    const stock = (await pool.query(`SELECT on_hand_quantity,sellable_quantity
      FROM inventory_levels WHERE option_id=$1`, [ids.optionId])).rows[0];
    assert.deepEqual(stock, { on_hand_quantity: 9, sellable_quantity: 7 });
    const original = (await pool.query(`SELECT o.status,o.payable_won,s.status AS shipment_status,
      l.quantity,l.goods_payable_won FROM checkout_orders o
      JOIN shipment_orders s ON s.checkout_order_id=o.id
      JOIN shipment_order_lines l ON l.shipment_order_id=s.id WHERE o.id=$1`, [ids.orderId])).rows[0];
    assert.deepEqual(original, { status: 'PAID', payable_won: 12000, shipment_status: 'PAID',
      quantity: 3, goods_payable_won: 10000 });
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM refund_event_conflicts')).rows[0].n, 2);
    assert.equal((await getRefundCase(pool, ids.customerId, 'customer', second.id)).id, second.id);
    assert.equal(await getRefundCase(pool, ids.sellerId, 'seller', second.id), null);
  } finally {
    await cleanup(pool, ids);
    await pool.end();
  }
});

test('a sale stop after approval preserves refund evidence for review without silently skipping restock', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  let ids;
  try {
    ids = await seedPaidOrder(pool);
    const requested = await createRefundCase(pool, { actorAccountId: ids.customerId,
      actorRole: 'customer', checkoutOrderId: ids.orderId, shipmentOrderId: ids.shipmentId,
      lines: [{ optionId: ids.optionId, quantity: 1 }], reasonCode: 'customer_request',
      reason: '승인 이후 판매중지 시험', idempotencyKey: randomUUID() });
    const decision = await decideRefundCase(pool, { adminAccountId: ids.adminId,
      caseId: requested.id, idempotencyKey: randomUUID(), decision: 'approve', reason: '보유 확인',
      preShipmentConfirmed: true, preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
      lines: [{ optionId: ids.optionId, restockMode: 'on_hand_only' }] },
    { APP_ENV: 'development', PAYMENT_MODE: 'mock' });
    await pool.query(`INSERT INTO product_sale_stop_requests
      (product_id,reason,requested_by_account_id,status,decided_by_account_id,decided_at)
      VALUES ($1,'승인 이후 판매중지',$2,'approved',$2,now())`, [ids.productId, ids.adminId]);
    const verified = new MockRefundAdapter().verify({ providerRefundId: decision.providerRefundId,
      orderId: ids.orderId, paymentId: ids.paymentId, amountWon: decision.totalRefundWon,
      outcome: 'SUCCEEDED' });
    const event = await recordVerifiedRefundEvent(pool, decision.attemptId, verified);
    for (let i = 0; i < 2; i++) assert.equal(
      (await processVerifiedRefundEvent(pool, event.id)).processingStatus, 'REVIEW_REQUIRED');
    assert.deepEqual((await pool.query(`SELECT status,completed_at IS NOT NULL AS completed
      FROM refund_cases WHERE id=$1`, [requested.id])).rows[0],
    { status: 'REVIEW_REQUIRED', completed: false });
    assert.deepEqual((await pool.query(`SELECT on_hand_quantity,sellable_quantity
      FROM inventory_levels WHERE option_id=$1`, [ids.optionId])).rows[0],
    { on_hand_quantity: 7, sellable_quantity: 7 });
    assert.equal((await pool.query(`SELECT restocked_quantity FROM refund_case_lines
      WHERE refund_case_id=$1`, [requested.id])).rows[0].restocked_quantity, 0);
    assert.equal((await pool.query(`SELECT outcome FROM refund_events WHERE id=$1`,
      [event.id])).rows[0].outcome, 'SUCCEEDED');
    const history = await pool.query(`SELECT reason FROM refund_case_events
      WHERE refund_case_id=$1 AND to_status='REVIEW_REQUIRED'`, [requested.id]);
    assert.equal(history.rowCount, 1);
    assert.match(history.rows[0].reason, /stock|재고/i);
  } finally { await cleanup(pool, ids); await pool.end(); }
});

test('restock waits for the sale-stop product lock and observes its committed decision', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
  let ids; let locker; let processing;
  try {
    ids = await seedPaidOrder(pool);
    const requested = await createRefundCase(pool, { actorAccountId: ids.customerId,
      actorRole: 'customer', checkoutOrderId: ids.orderId, shipmentOrderId: ids.shipmentId,
      lines: [{ optionId: ids.optionId, quantity: 1 }], reasonCode: 'other',
      reason: '판매중지 잠금 경합', idempotencyKey: randomUUID() });
    const decision = await decideRefundCase(pool, { adminAccountId: ids.adminId,
      caseId: requested.id, idempotencyKey: randomUUID(), decision: 'approve', reason: '보유 확인',
      preShipmentConfirmed: true, preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
      lines: [{ optionId: ids.optionId, restockMode: 'on_hand_only' }] },
    { APP_ENV: 'development', PAYMENT_MODE: 'mock' });
    const event = await recordVerifiedRefundEvent(pool, decision.attemptId,
      new MockRefundAdapter().verify({ providerRefundId: decision.providerRefundId,
        orderId: ids.orderId, paymentId: ids.paymentId, amountWon: decision.totalRefundWon,
        outcome: 'SUCCEEDED' }));
    locker = await pool.connect();
    await locker.query('BEGIN');
    const pid = (await locker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await locker.query('SELECT id FROM products WHERE id=$1 FOR UPDATE', [ids.productId]);
    processing = processVerifiedRefundEvent(pool, event.id);
    let blocked = false;
    for (let i = 0; i < 40; i++) {
      blocked = (await pool.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
        WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE '%SELECT p.id FROM products%') AS blocked`,
      [pid])).rows[0].blocked;
      if (blocked) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(blocked, true, 'refund processing must wait on the sale-stop product lock');
    await locker.query(`INSERT INTO product_sale_stop_requests
      (product_id,reason,requested_by_account_id,status,decided_by_account_id,decided_at)
      VALUES ($1,'동시 판매중지',$2,'approved',$2,now())`, [ids.productId, ids.adminId]);
    await locker.query('COMMIT');
    assert.equal((await processing).processingStatus, 'REVIEW_REQUIRED');
    assert.deepEqual((await pool.query(`SELECT on_hand_quantity,sellable_quantity
      FROM inventory_levels WHERE option_id=$1`, [ids.optionId])).rows[0],
    { on_hand_quantity: 7, sellable_quantity: 7 });
  } finally {
    if (locker) { await locker.query('ROLLBACK'); locker.release(); }
    if (processing) await processing.catch(() => {});
    await cleanup(pool, ids); await pool.end();
  }
});

test('missing stock on a later line leaves every selected restoration unapplied', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  let ids; let extraOption;
  try {
    ids = await seedPaidOrder(pool);
    extraOption = `ffffffff-ffff-4fff-afff-${randomUUID().slice(-12)}`;
    await pool.query(`INSERT INTO product_options(id,revision_id,name,price_won)
      VALUES ($1,$2,'추가 시험 옵션',100)`, [extraOption, ids.revisionId]);
    await pool.query(`INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity)
      VALUES ($1,7,7)`, [extraOption]);
    await pool.query(`INSERT INTO shipment_order_lines
      (shipment_order_id,product_id,option_id,seller_id,product_name,option_name,
       unit_price_won,quantity,goods_discount_won,goods_payable_won)
      VALUES ($1,$2,$3,$4,'환불 시험 상품','추가 시험 옵션',0,1,0,0)`,
    [ids.shipmentId, ids.productId, extraOption, ids.sellerId]);
    const lines = [{ optionId: ids.optionId, quantity: 1 }, { optionId: extraOption, quantity: 1 }];
    const requested = await createRefundCase(pool, { actorAccountId: ids.customerId,
      actorRole: 'customer', checkoutOrderId: ids.orderId, shipmentOrderId: ids.shipmentId,
      lines, reasonCode: 'other', reason: '전체 복원 사전검증', idempotencyKey: randomUUID() });
    const decision = await decideRefundCase(pool, { adminAccountId: ids.adminId,
      caseId: requested.id, idempotencyKey: randomUUID(), decision: 'approve', reason: '보유 확인',
      preShipmentConfirmed: true, preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
      lines: lines.map(({ optionId }) => ({ optionId, restockMode: 'on_hand_only' })) },
    { APP_ENV: 'development', PAYMENT_MODE: 'mock' });
    await pool.query('DELETE FROM inventory_levels WHERE option_id=$1', [extraOption]);
    const event = await recordVerifiedRefundEvent(pool, decision.attemptId,
      new MockRefundAdapter().verify({ providerRefundId: decision.providerRefundId,
        orderId: ids.orderId, paymentId: ids.paymentId, amountWon: decision.totalRefundWon,
        outcome: 'SUCCEEDED' }));
    assert.equal((await processVerifiedRefundEvent(pool, event.id)).processingStatus, 'REVIEW_REQUIRED');
    assert.equal((await pool.query('SELECT on_hand_quantity FROM inventory_levels WHERE option_id=$1',
      [ids.optionId])).rows[0].on_hand_quantity, 7);
    assert.equal((await pool.query(`SELECT sum(restocked_quantity)::int AS total
      FROM refund_case_lines WHERE refund_case_id=$1`, [requested.id])).rows[0].total, 0);
  } finally {
    // The normal fixture cleanup owns all shipment/refund rows; include its second option there.
    if (ids && extraOption) ids.extraOption = extraOption;
    await cleanup(pool, ids); await pool.end();
  }
});

test('parallel approvals cannot occupy more than the paid quantity', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
  let ids;
  try {
    ids = await seedPaidOrder(pool);
    const cases = [];
    for (const reason of ['경합 요청 A', '경합 요청 B']) cases.push(await createRefundCase(pool, {
      actorAccountId: ids.customerId, actorRole: 'customer', checkoutOrderId: ids.orderId,
      shipmentOrderId: ids.shipmentId, lines: [{ optionId: ids.optionId, quantity: 2 }],
      reasonCode: 'customer_request', reason, idempotencyKey: randomUUID(),
    }));
    const results = await Promise.allSettled(cases.map((item) => decideRefundCase(pool, {
      adminAccountId: ids.adminId, caseId: item.id, idempotencyKey: randomUUID(),
      decision: 'approve', reason: '미출고 확인', preShipmentConfirmed: true,
      preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
      lines: [{ optionId: ids.optionId, restockMode: 'none' }],
    }, { APP_ENV: 'development', PAYMENT_MODE: 'mock' })));
    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
    assert.match(results.find(({ status }) => status === 'rejected').reason.message, /Refund conflict/);
    const occupied = (await pool.query(`SELECT coalesce(sum(l.quantity),0)::int AS quantity
      FROM refund_case_lines l JOIN refund_cases c ON c.id=l.refund_case_id
      WHERE c.checkout_order_id=$1 AND c.status IN ('PROCESSING','REFUNDED','REVIEW_REQUIRED')`,
    [ids.orderId])).rows[0].quantity;
    assert.equal(occupied, 2);
  } finally {
    await cleanup(pool, ids);
    await pool.end();
  }
});

test('zero-won refund uses no-charge evidence and a verified failure stays incomplete', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  let zeroIds; let failedIds;
  try {
    zeroIds = await seedPaidOrder(pool);
    await pool.query(`UPDATE shipment_order_lines SET goods_discount_won=12000,goods_payable_won=0
      WHERE shipment_order_id=$1`, [zeroIds.shipmentId]);
    await pool.query(`UPDATE shipment_orders SET goods_discount_won=12000,
      shipping_support_won=3000,payable_won=0 WHERE id=$1`, [zeroIds.shipmentId]);
    await pool.query(`UPDATE checkout_orders SET goods_discount_won=12000,
      shipping_support_won=3000,payable_won=0 WHERE id=$1`, [zeroIds.orderId]);
    await pool.query(`UPDATE payment_attempts SET provider='no_charge',provider_order_id=$2,
      requested_won=0 WHERE id=$1`, [zeroIds.paymentAttemptId, `no_charge:order:${zeroIds.orderId}`]);
    await pool.query(`UPDATE payment_events SET provider='no_charge',amount_won=0
      WHERE payment_attempt_id=$1`, [zeroIds.paymentAttemptId]);
    const zeroCase = await createRefundCase(pool, { actorAccountId: zeroIds.customerId,
      actorRole: 'customer', checkoutOrderId: zeroIds.orderId, shipmentOrderId: zeroIds.shipmentId,
      lines: [{ optionId: zeroIds.optionId, quantity: 3 }], reasonCode: 'customer_request',
      reason: '0원 주문 출고 전 취소', idempotencyKey: randomUUID() });
    const zeroDecision = await decideRefundCase(pool, { adminAccountId: zeroIds.adminId,
      caseId: zeroCase.id, idempotencyKey: randomUUID(), decision: 'approve', reason: '미출고 확인',
      preShipmentConfirmed: true, preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
      lines: [{ optionId: zeroIds.optionId, restockMode: 'none' }] },
    { APP_ENV: 'development', PAYMENT_MODE: 'mock' });
    assert.equal(zeroDecision.totalRefundWon, 0);
    assert.match(zeroDecision.providerRefundId, /^no_charge:/);
    const zeroVerified = new NoChargeRefundAdapter().verify({
      providerRefundId: zeroDecision.providerRefundId, orderId: zeroIds.orderId,
      paymentId: zeroIds.paymentId, amountWon: 0, outcome: 'SUCCEEDED',
    });
    const zeroEvent = await recordVerifiedRefundEvent(pool, zeroDecision.attemptId, zeroVerified);
    await processVerifiedRefundEvent(pool, zeroEvent.id);
    const zeroState = (await pool.query(`SELECT status,completed_at IS NOT NULL AS completed
      FROM refund_cases WHERE id=$1`, [zeroCase.id])).rows[0];
    assert.deepEqual(zeroState, { status: 'REFUNDED', completed: true });

    failedIds = await seedPaidOrder(pool);
    const failedCase = await createRefundCase(pool, { actorAccountId: failedIds.customerId,
      actorRole: 'customer', checkoutOrderId: failedIds.orderId, shipmentOrderId: failedIds.shipmentId,
      lines: [{ optionId: failedIds.optionId, quantity: 1 }], reasonCode: 'customer_request',
      reason: '실패 사건 시험', idempotencyKey: randomUUID() });
    const failedDecision = await decideRefundCase(pool, { adminAccountId: failedIds.adminId,
      caseId: failedCase.id, idempotencyKey: randomUUID(), decision: 'approve', reason: '미출고 확인',
      preShipmentConfirmed: true, preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
      lines: [{ optionId: failedIds.optionId, restockMode: 'none' }] },
    { APP_ENV: 'development', PAYMENT_MODE: 'mock' });
    const failedVerified = new MockRefundAdapter().verify({
      providerRefundId: failedDecision.providerRefundId, orderId: failedIds.orderId,
      paymentId: failedIds.paymentId, amountWon: failedDecision.totalRefundWon, outcome: 'FAILED',
    });
    const failedEvent = await recordVerifiedRefundEvent(pool, failedDecision.attemptId, failedVerified);
    await processVerifiedRefundEvent(pool, failedEvent.id);
    const failedState = (await pool.query(`SELECT status,completed_at IS NOT NULL AS completed
      FROM refund_cases WHERE id=$1`, [failedCase.id])).rows[0];
    assert.deepEqual(failedState, { status: 'REVIEW_REQUIRED', completed: false });
  } finally {
    await cleanup(pool, failedIds);
    await cleanup(pool, zeroIds);
    await pool.end();
  }
});

test('SHIPPED fulfillment rejects pre-shipment approval without any mutation', {
  skip: !process.env.DATABASE_URL || !process.env.S5_PAYMENT_TEST_DB_SYSTEM_ID,
}, async (context) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  let ids;
  try {
    if (!await requireTask7Schema(context, pool)) return;
    ids = await seedPaidOrder(pool);
    const requested = await createRefundCase(pool, { actorAccountId: ids.customerId,
      actorRole: 'customer', checkoutOrderId: ids.orderId, shipmentOrderId: ids.shipmentId,
      lines: [{ optionId: ids.optionId, quantity: 3 }], reasonCode: 'customer_request',
      reason: '이미 출고된 주문 승인 거부', idempotencyKey: randomUUID() });
    const shippedAt = new Date('2026-10-06T02:00:00.000Z');
    await pool.query(`UPDATE shipment_fulfillments SET status='SHIPPED',carrier_code='hanjin',
      tracking_number='QAAPPROVAL1',first_shipped_at=$2,shipped_at=$2,updated_at=$2
      WHERE shipment_order_id=$1`, [ids.shipmentId, shippedAt]);
    const before = await readTask7MutationState(pool, ids, requested.id);
    await assert.rejects(() => decideRefundCase(pool, { adminAccountId: ids.adminId,
      caseId: requested.id, idempotencyKey: randomUUID(), decision: 'approve',
      reason: '출고 전으로 잘못 승인하면 안 됨', preShipmentConfirmed: true,
      preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
      lines: [{ optionId: ids.optionId, restockMode: 'on_hand_only' }] },
    { APP_ENV: 'development', PAYMENT_MODE: 'mock' }), /Refund unavailable|Refund conflict/);
    assert.deepEqual(await readTask7MutationState(pool, ids, requested.id), before);
  } finally {
    await cleanup(pool, ids);
    await pool.end();
  }
});

test('SHIPPED fulfillment rejects verified refund processing without any mutation', {
  skip: !process.env.DATABASE_URL || !process.env.S5_PAYMENT_TEST_DB_SYSTEM_ID,
}, async (context) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  let ids;
  try {
    if (!await requireTask7Schema(context, pool)) return;
    ids = await seedPaidOrder(pool);
    const requested = await createRefundCase(pool, { actorAccountId: ids.customerId,
      actorRole: 'customer', checkoutOrderId: ids.orderId, shipmentOrderId: ids.shipmentId,
      lines: [{ optionId: ids.optionId, quantity: 3 }], reasonCode: 'customer_request',
      reason: '처리 직전 출고 경합 거부', idempotencyKey: randomUUID() });
    const decision = await decideRefundCase(pool, { adminAccountId: ids.adminId,
      caseId: requested.id, idempotencyKey: randomUUID(), decision: 'approve', reason: '미출고 확인',
      preShipmentConfirmed: true, preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
      lines: [{ optionId: ids.optionId, restockMode: 'on_hand_only' }] },
    { APP_ENV: 'development', PAYMENT_MODE: 'mock' });
    const verified = new MockRefundAdapter().verify({ providerRefundId: decision.providerRefundId,
      orderId: ids.orderId, paymentId: ids.paymentId, amountWon: decision.totalRefundWon,
      outcome: 'SUCCEEDED' });
    const event = await recordVerifiedRefundEvent(pool, decision.attemptId, verified);
    const shippedAt = new Date('2026-10-06T02:10:00.000Z');
    await pool.query(`UPDATE shipment_fulfillments SET status='SHIPPED',carrier_code='hanjin',
      tracking_number='QAPROCESS1',first_shipped_at=$2,shipped_at=$2,updated_at=$2
      WHERE shipment_order_id=$1`, [ids.shipmentId, shippedAt]);
    const before = await readTask7MutationState(pool, ids, requested.id);
    await assert.rejects(() => processVerifiedRefundEvent(pool, event.id),
      /Refund unavailable|Refund conflict/);
    assert.deepEqual(await readTask7MutationState(pool, ids, requested.id), before);
  } finally {
    await cleanup(pool, ids);
    await pool.end();
  }
});
