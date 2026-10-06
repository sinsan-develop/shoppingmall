import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { AdminFulfillmentService, SellerFulfillmentService } from '../src/fulfillment/service.ts';
import { getSellerFulfillmentDetail } from '../src/fulfillment/repository.ts';
import { getOrderSnapshotConsistent } from '../src/orders/repository.ts';
import { MockRefundAdapter } from '../src/refunds/mock-adapter.ts';
import { processVerifiedRefundEvent } from '../src/refunds/processor.ts';
import { createRefundCase, decideRefundCase, recordVerifiedRefundEvent } from '../src/refunds/service.ts';
import { assertOrderMutationQaTarget, skipWithoutFulfillmentSchema,
  skipWithoutOrderSchema } from './order-schema-guard.mjs';

const fingerprint = 'a'.repeat(64);

async function requireTask7Schema(context, pool) {
  await assertOrderMutationQaTarget(pool, process.env.S5_PAYMENT_TEST_DB_SYSTEM_ID);
  if (await skipWithoutOrderSchema(context, pool, true)) return false;
  if (await skipWithoutFulfillmentSchema(context, pool, true)) return false;
  const schema = (await pool.query(`SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations,
    to_regclass('public.refund_cases') IS NOT NULL AS refunds`)).rows[0];
  assert.deepEqual(schema, { migrations: 18, refunds: true });
  return true;
}

async function seedPaidOrder(pool, status = 'READY') {
  const runId = randomBytes(4).toString('hex');
  const ids = { runId, accounts: [], categories: [] };
  ids.setting = (await pool.query('SELECT * FROM fulfillment_settings WHERE id=1')).rows[0];
  ids.globalPolicy = (await pool.query('SELECT * FROM shipping_policy_global WHERE id=1')).rows[0];
  for (const role of ['customer', 'admin', 'seller']) {
    const accountId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    ids.accounts.push(accountId);
    ids[role === 'seller' ? 'sellerAccountId' : `${role}Id`] = accountId;
  }
  ids.sellerCategoryId = (await pool.query(`INSERT INTO seller_categories(name)
    VALUES ($1) RETURNING id`, [`qa-s5-${runId}-판매자분류`])).rows[0].id;
  ids.sellerId = (await pool.query(`INSERT INTO sellers(category_id,display_name)
    VALUES ($1,$2) RETURNING id`, [ids.sellerCategoryId, `qa-s5-${runId}-판매자`])).rows[0].id;
  await pool.query(`INSERT INTO account_roles(account_id,role,seller_id) VALUES
    ($1,'customer',NULL),($2,'admin',NULL),($3,'seller',$4)`,
  [ids.customerId, ids.adminId, ids.sellerAccountId, ids.sellerId]);
  const majorId = (await pool.query(`INSERT INTO product_categories(name)
    VALUES ($1) RETURNING id`, [`qa-s5-${runId}-대분류`])).rows[0].id;
  const minorId = (await pool.query(`INSERT INTO product_categories(parent_id,name)
    VALUES ($1,$2) RETURNING id`, [majorId, `qa-s5-${runId}-소분류`])).rows[0].id;
  ids.categories.push(minorId, majorId);
  ids.productId = (await pool.query(`INSERT INTO products(seller_id,category_id)
    VALUES ($1,$2) RETURNING id`, [ids.sellerId, minorId])).rows[0].id;
  ids.revisionId = (await pool.query(`INSERT INTO product_revisions
    (product_id,version,title,description,origin_label,shipping_mode,status,
      proposed_by_account_id,reviewed_by_account_id,reviewed_at)
    VALUES ($1,1,$2,'Task7 환불 시험','시험 산지','seller_direct','approved',$3,$4,now())
    RETURNING id`, [ids.productId, `qa-s5-${runId}-환불상품`, ids.sellerAccountId,
    ids.adminId])).rows[0].id;
  ids.optionId = (await pool.query(`INSERT INTO product_options(revision_id,name,price_won)
    VALUES ($1,'기본',4000) RETURNING id`, [ids.revisionId])).rows[0].id;
  await pool.query(`INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity)
    VALUES ($1,7,7)`, [ids.optionId]);
  await pool.query(`INSERT INTO product_publications(product_id,revision_id,published_by_account_id)
    VALUES ($1,$2,$3)`, [ids.productId, ids.revisionId, ids.adminId]);
  ids.addressId = (await pool.query(`INSERT INTO customer_addresses
    (account_id,label,recipient_name,phone,postal_code,line1)
    VALUES ($1,'qa-s5','가상 고객','01000000000','12345','가상 주소') RETURNING id`,
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
    VALUES ($1,$2,$3,$4,$5,'가상 고객','01000000000','12345','가상 주소',
      12000,2000,3000,1000,12000,'PAID',now()+interval '1 hour',now(),now()) RETURNING id`,
  [ids.customerId, ids.reservationId, randomUUID(), fingerprint, ids.addressId])).rows[0].id;
  ids.shipmentId = (await pool.query(`INSERT INTO shipment_orders
    (checkout_order_id,shipment_key,shipping_mode,seller_id,goods_won,goods_discount_won,
      shipping_fee_won,shipping_support_won,payable_won,status)
    VALUES ($1,$2,'seller_direct',$3,12000,2000,3000,1000,12000,'PAID') RETURNING id`,
  [ids.orderId, `seller_direct:${ids.sellerId}`, ids.sellerId])).rows[0].id;
  await pool.query(`INSERT INTO shipment_order_lines
    (shipment_order_id,product_id,option_id,seller_id,product_name,option_name,
      unit_price_won,quantity,goods_discount_won,goods_payable_won)
    VALUES ($1,$2,$3,$4,$5,'기본',4000,3,2000,10000)`,
  [ids.shipmentId, ids.productId, ids.optionId, ids.sellerId, `qa-s5-${runId}-환불상품`]);
  await pool.query(`INSERT INTO shipment_fulfillments
    (shipment_order_id,fulfillment_seller_id,status,expected_ship_date,packed_at)
    VALUES ($1,$2,$3,'2026-10-08',CASE WHEN $3='PACKING' THEN now() ELSE NULL END)`,
  [ids.shipmentId, ids.sellerId, status]);
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

async function prepareVerifiedRefund(pool, ids, quantity, reason) {
  const requested = await createRefundCase(pool, { actorAccountId: ids.customerId,
    actorRole: 'customer', checkoutOrderId: ids.orderId, shipmentOrderId: ids.shipmentId,
    lines: [{ optionId: ids.optionId, quantity }], reasonCode: 'customer_request', reason,
    idempotencyKey: randomUUID() });
  const decision = await decideRefundCase(pool, { adminAccountId: ids.adminId,
    caseId: requested.id, idempotencyKey: randomUUID(), decision: 'approve', reason: '미출고 확인',
    preShipmentConfirmed: true, preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
    lines: [{ optionId: ids.optionId, restockMode: 'on_hand_only' }] },
  { APP_ENV: 'development', PAYMENT_MODE: 'mock' });
  const verified = new MockRefundAdapter().verify({ providerRefundId: decision.providerRefundId,
    orderId: ids.orderId, paymentId: ids.paymentId, amountWon: decision.totalRefundWon,
    outcome: 'SUCCEEDED' });
  const event = await recordVerifiedRefundEvent(pool, decision.attemptId, verified);
  return { requested, decision, event };
}

async function cleanup(pool, ids) {
  if (!ids) return;
  if (ids.orderId) {
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
    await pool.query('DELETE FROM shipment_fulfillment_events WHERE shipment_order_id=$1', [ids.shipmentId]);
    await pool.query(`DELETE FROM payment_event_conflicts WHERE original_event_id IN
      (SELECT id FROM payment_events WHERE payment_attempt_id=$1)`, [ids.paymentAttemptId]);
    await pool.query('DELETE FROM payment_events WHERE payment_attempt_id=$1', [ids.paymentAttemptId]);
    await pool.query('DELETE FROM payment_attempts WHERE id=$1', [ids.paymentAttemptId]);
    await pool.query(`DELETE FROM audit_events WHERE actor_account_id=ANY($1::uuid[])
      OR target_id=ANY($2::text[])`, [ids.accounts, [ids.orderId, ids.shipmentId]]);
    await pool.query('DELETE FROM order_promotion_allocations WHERE checkout_order_id=$1', [ids.orderId]);
    await pool.query('DELETE FROM order_status_events WHERE checkout_order_id=$1', [ids.orderId]);
    await pool.query('DELETE FROM shipment_order_lines WHERE shipment_order_id=$1', [ids.shipmentId]);
    await pool.query('DELETE FROM shipment_fulfillments WHERE shipment_order_id=$1', [ids.shipmentId]);
    await pool.query('DELETE FROM shipment_orders WHERE id=$1', [ids.shipmentId]);
    await pool.query('DELETE FROM checkout_orders WHERE id=$1', [ids.orderId]);
  }
  if (ids.reservationId) {
    await pool.query('DELETE FROM promotion_uses WHERE reservation_id=$1', [ids.reservationId]);
    await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=$1', [ids.reservationId]);
    await pool.query('DELETE FROM checkout_reservations WHERE id=$1', [ids.reservationId]);
  }
  if (ids.addressId) await pool.query('DELETE FROM customer_addresses WHERE id=$1', [ids.addressId]);
  if (ids.productId) {
    await pool.query('DELETE FROM product_publications WHERE product_id=$1', [ids.productId]);
    await pool.query('DELETE FROM product_sale_stop_requests WHERE product_id=$1', [ids.productId]);
  }
  if (ids.optionId) {
    await pool.query('DELETE FROM inventory_levels WHERE option_id=$1', [ids.optionId]);
    await pool.query('DELETE FROM product_options WHERE id=$1', [ids.optionId]);
  }
  if (ids.revisionId) await pool.query('DELETE FROM product_revisions WHERE id=$1', [ids.revisionId]);
  if (ids.productId) await pool.query('DELETE FROM products WHERE id=$1', [ids.productId]);
  for (const categoryId of ids.categories ?? []) {
    await pool.query('DELETE FROM product_categories WHERE id=$1', [categoryId]);
  }
  if (ids.accounts?.length) await pool.query(
    'DELETE FROM account_roles WHERE account_id=ANY($1::uuid[])', [ids.accounts],
  );
  if (ids.sellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [ids.sellerId]);
  if (ids.sellerCategoryId) await pool.query(
    'DELETE FROM seller_categories WHERE id=$1', [ids.sellerCategoryId],
  );
  if (ids.accounts?.length) await pool.query(
    'DELETE FROM accounts WHERE id=ANY($1::uuid[])', [ids.accounts],
  );
  if (ids.setting) await pool.query(`UPDATE fulfillment_settings SET owool_seller_id=$1,
    updated_by=$2,version=$3,updated_at=$4 WHERE id=1`, [ids.setting.owool_seller_id,
    ids.setting.updated_by, ids.setting.version, ids.setting.updated_at]);
  if (ids.globalPolicy) await pool.query(`UPDATE shipping_policy_global SET fee_won=$1,
    free_threshold_won=$2,cutoff_time=$3,blocked_postal_ranges=$4::jsonb,locked_fee=$5,
    locked_threshold=$6,locked_cutoff=$7,updated_by_account_id=$8,updated_at=$9 WHERE id=1`, [
    ids.globalPolicy.fee_won, ids.globalPolicy.free_threshold_won, ids.globalPolicy.cutoff_time,
    JSON.stringify(ids.globalPolicy.blocked_postal_ranges), ids.globalPolicy.locked_fee,
    ids.globalPolicy.locked_threshold, ids.globalPolicy.locked_cutoff,
    ids.globalPolicy.updated_by_account_id, ids.globalPolicy.updated_at,
  ]);
}

test('verified partial refund preserves fulfillment and updates customer and seller quantities', {
  skip: !process.env.DATABASE_URL || !process.env.S5_PAYMENT_TEST_DB_SYSTEM_ID,
}, async (context) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  let ids;
  try {
    if (!await requireTask7Schema(context, pool)) return;
    ids = await seedPaidOrder(pool);
    const first = await prepareVerifiedRefund(pool, ids, 1, '부분 환불');
    assert.equal((await processVerifiedRefundEvent(pool, first.event.id)).processingStatus, 'APPLIED');
    const fulfillment = (await pool.query(`SELECT status,version,cancelled_at FROM shipment_fulfillments
      WHERE shipment_order_id=$1`, [ids.shipmentId])).rows[0];
    assert.deepEqual(fulfillment, { status: 'READY', version: 0, cancelled_at: null });
    assert.equal((await pool.query(`SELECT count(*)::int AS count FROM shipment_fulfillment_events
      WHERE shipment_order_id=$1`, [ids.shipmentId])).rows[0].count, 0);
    assert.equal((await pool.query(`SELECT count(*)::int AS count FROM audit_events
      WHERE action='fulfillment.refund_cancelled' AND target_type='shipment_order'
        AND target_id=$1`, [ids.shipmentId])).rows[0].count, 0);
    const customer = await getOrderSnapshotConsistent(pool, ids.customerId, ids.orderId);
    const seller = await getSellerFulfillmentDetail(pool, ids.sellerId, ids.shipmentId);
    assert.equal(customer.shipments[0].lines[0].completedRefundQuantity, 1);
    assert.equal(customer.shipments[0].lines[0].remainingQuantity, 2);
    assert.equal(seller.lines[0].refundedQuantity, 1);
    assert.equal(seller.lines[0].remainingQuantity, 2);
  } finally {
    await cleanup(pool, ids);
    await pool.end();
  }
});

test('cumulative full refund cancels fulfillment once and replay stays idempotent', {
  skip: !process.env.DATABASE_URL || !process.env.S5_PAYMENT_TEST_DB_SYSTEM_ID,
}, async (context) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  let ids;
  try {
    if (!await requireTask7Schema(context, pool)) return;
    ids = await seedPaidOrder(pool);
    const first = await prepareVerifiedRefund(pool, ids, 1, '첫 부분 환불');
    await processVerifiedRefundEvent(pool, first.event.id);
    const second = await prepareVerifiedRefund(pool, ids, 2, '누적 전량 환불');
    assert.equal((await processVerifiedRefundEvent(pool, second.event.id)).processingStatus, 'APPLIED');
    assert.equal((await processVerifiedRefundEvent(pool, second.event.id)).processingStatus, 'APPLIED');
    const fulfillment = (await pool.query(`SELECT status,version,cancelled_at IS NOT NULL AS cancelled
      FROM shipment_fulfillments WHERE shipment_order_id=$1`, [ids.shipmentId])).rows[0];
    assert.deepEqual(fulfillment, { status: 'CANCELLED', version: 1, cancelled: true });
    const events = (await pool.query(`SELECT action,from_status,to_status,idempotency_scope,
      idempotency_key::text AS "idempotencyKey",actor_account_id,actor_role,actor_seller_id,
      before_snapshot AS before,after_snapshot AS after
      FROM shipment_fulfillment_events WHERE shipment_order_id=$1`, [ids.shipmentId])).rows;
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], { action: 'REFUND_CANCELLED', from_status: 'READY',
      to_status: 'CANCELLED', idempotency_scope: 'system:refund',
      idempotencyKey: second.event.id, actor_account_id: null, actor_role: null,
      actor_seller_id: null,
      before: { status: 'READY', expectedShipDate: '2026-10-08',
        carrierCode: null, trackingNumber: null },
      after: { status: 'CANCELLED', expectedShipDate: '2026-10-08',
        carrierCode: null, trackingNumber: null } });
    const audits = (await pool.query(`SELECT actor_account_id AS "actorAccountId",
      active_role AS "activeRole",seller_id AS "sellerId",action,
      target_type AS "targetType",target_id AS "targetId",details
      FROM audit_events WHERE action='fulfillment.refund_cancelled'
        AND target_type='shipment_order' AND target_id=$1
      ORDER BY occurred_at,id`, [ids.shipmentId])).rows;
    assert.equal(audits.length, 1);
    assert.deepEqual(audits[0], {
      actorAccountId: ids.adminId,
      activeRole: 'admin',
      sellerId: null,
      action: 'fulfillment.refund_cancelled',
      targetType: 'shipment_order',
      targetId: ids.shipmentId,
      details: {
        refundEventId: second.event.id,
        before: { status: 'READY', expectedShipDate: '2026-10-08',
          carrierCode: null, trackingNumber: null },
        after: { status: 'CANCELLED', expectedShipDate: '2026-10-08',
          carrierCode: null, trackingNumber: null },
      },
    });
    const auditDetails = JSON.stringify(audits[0].details);
    for (const privateValue of ['01000000000', '시험 주소', ids.customerId, '미출고 확인']) {
      assert.equal(auditDetails.includes(privateValue), false);
    }
    const customer = await getOrderSnapshotConsistent(pool, ids.customerId, ids.orderId);
    const seller = await getSellerFulfillmentDetail(pool, ids.sellerId, ids.shipmentId);
    assert.equal(customer.shipments[0].lines[0].completedRefundQuantity, 3);
    assert.equal(customer.shipments[0].lines[0].remainingQuantity, 0);
    assert.equal(seller.lines[0].refundedQuantity, 3);
    assert.equal(seller.lines[0].remainingQuantity, 0);
  } finally {
    await cleanup(pool, ids);
    await pool.end();
  }
});

async function waitForBothBlocked(pool, applicationNames) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const count = (await pool.query(`SELECT count(DISTINCT application_name)::int AS count
      FROM pg_stat_activity WHERE application_name=ANY($1::text[]) AND state='active'
        AND wait_event_type='Lock' AND query LIKE '%shipment_orders%'
        AND cardinality(pg_blocking_pids(pid))>0`, [applicationNames])).rows[0].count;
    if (count === 2) return count;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return (await pool.query(`SELECT count(DISTINCT application_name)::int AS count
    FROM pg_stat_activity WHERE application_name=ANY($1::text[]) AND state='active'
      AND wait_event_type='Lock' AND query LIKE '%shipment_orders%'
      AND cardinality(pg_blocking_pids(pid))>0`, [applicationNames])).rows[0].count;
}

async function settleWithin(promise) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Task7 race timeout')), 5000);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

test('seller and admin SHIPPED reject approved, processing and review-required refunds', {
  skip: !process.env.DATABASE_URL || !process.env.S5_PAYMENT_TEST_DB_SYSTEM_ID,
}, async (context) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  const created = [];
  try {
    if (!await requireTask7Schema(context, pool)) return;
    for (const mode of ['seller', 'admin']) {
      for (const refundStatus of ['APPROVED', 'PROCESSING', 'REVIEW_REQUIRED']) {
        const ids = await seedPaidOrder(pool, mode === 'seller' ? 'PACKING' : 'READY');
        created.push(ids);
        const refund = await prepareVerifiedRefund(pool, ids, 1,
          `${mode} ${refundStatus} 출고 차단`);
        if (refundStatus !== 'PROCESSING') await pool.query(
          'UPDATE refund_cases SET status=$2 WHERE id=$1', [refund.requested.id, refundStatus],
        );
        const operation = mode === 'seller'
          ? new SellerFulfillmentService(pool, { accountId: ids.sellerAccountId,
            role: 'seller', sellerId: ids.sellerId }).transition(ids.shipmentId, randomUUID(), {
            targetStatus: 'SHIPPED', expectedVersion: 0, carrierCode: 'hanjin',
            trackingNumber: `QABLOCK${refundStatus.replaceAll('_', '')}`,
          })
          : new AdminFulfillmentService(pool, { accountId: ids.adminId, role: 'admin' })
            .correct(ids.shipmentId, randomUUID(), { expectedVersion: 0,
              corrected: { status: 'SHIPPED', carrierCode: 'hanjin',
                trackingNumber: `QABLOCK${refundStatus.replaceAll('_', '')}` },
              reason: '미결 환불 출고 차단', customerMessage: '환불 상태를 먼저 확인합니다',
            });
        await assert.rejects(operation, /Fulfillment conflict/,
          `${mode} must block ${refundStatus}`);
        const fulfillment = (await pool.query(`SELECT status,version,
          (SELECT count(*)::int FROM shipment_fulfillment_events e
            WHERE e.shipment_order_id=f.shipment_order_id) AS events
          FROM shipment_fulfillments f WHERE shipment_order_id=$1`, [ids.shipmentId])).rows[0];
        assert.deepEqual(fulfillment, {
          status: mode === 'seller' ? 'PACKING' : 'READY', version: 0, events: 0,
        });
      }
    }
  } finally {
    for (const ids of created.reverse()) await cleanup(pool, ids);
    await pool.end();
  }
});

for (const mode of ['seller', 'admin']) test(`refund and ${mode} SHIPPED race converges`, {
  skip: !process.env.DATABASE_URL || !process.env.S5_PAYMENT_TEST_DB_SYSTEM_ID,
}, async (context) => {
  const suffix = randomBytes(4).toString('hex');
  const main = new Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
  const refundName = `qa-s5-${suffix}-refund`;
  const shipName = `qa-s5-${suffix}-${mode}`;
  const refundPool = new Pool({ connectionString: process.env.DATABASE_URL,
    application_name: refundName, max: 2 });
  const shipPool = new Pool({ connectionString: process.env.DATABASE_URL,
    application_name: shipName, max: 2 });
  let ids; let locker; let settled;
  try {
    if (!await requireTask7Schema(context, main)) return;
    ids = await seedPaidOrder(main, mode === 'seller' ? 'PACKING' : 'READY');
    const refund = await prepareVerifiedRefund(main, ids, 3, `${mode} 출고 경합`);
    locker = await main.connect();
    await locker.query('BEGIN');
    await locker.query('SELECT id FROM shipment_orders WHERE id=$1 FOR UPDATE', [ids.shipmentId]);
    const refundPromise = processVerifiedRefundEvent(refundPool, refund.event.id);
    const shipPromise = mode === 'seller'
      ? new SellerFulfillmentService(shipPool, { accountId: ids.sellerAccountId,
        role: 'seller', sellerId: ids.sellerId }).transition(ids.shipmentId, randomUUID(), {
        targetStatus: 'SHIPPED', expectedVersion: 0, carrierCode: 'hanjin',
        trackingNumber: `QARACE${suffix}`,
      })
      : new AdminFulfillmentService(shipPool, { accountId: ids.adminId, role: 'admin' })
        .correct(ids.shipmentId, randomUUID(), { expectedVersion: 0,
          corrected: { status: 'SHIPPED', carrierCode: 'hanjin',
            trackingNumber: `QARACE${suffix}` },
          reason: '환불과 동시 출고 정정', customerMessage: '출고 여부를 다시 확인했습니다',
        });
    const pending = Promise.allSettled([refundPromise, shipPromise]);
    try {
      assert.equal(await waitForBothBlocked(main, [refundName, shipName]), 2,
        'refund and ship must both wait on shipment_orders before later locks');
    } finally {
      await locker.query('COMMIT');
      locker.release();
      locker = null;
      settled = await settleWithin(pending);
    }
    for (const result of settled.filter(({ status }) => status === 'rejected')) {
      assert.notEqual(result.reason?.code, '40P01', 'race must not deadlock');
    }
    const fulfillment = (await main.query(`SELECT status,version FROM shipment_fulfillments
      WHERE shipment_order_id=$1`, [ids.shipmentId])).rows[0];
    assert.equal(fulfillment.version, 1);
    const fulfillmentEvents = (await main.query(`SELECT action,idempotency_scope,
      idempotency_key::text AS "idempotencyKey" FROM shipment_fulfillment_events
      WHERE shipment_order_id=$1`, [ids.shipmentId])).rows;
    assert.equal(fulfillmentEvents.length, 1);
    const refundState = (await main.query(`SELECT c.status,a.status AS "attemptStatus",
      e.processing_status AS "eventStatus"
      FROM refund_cases c JOIN refund_attempts a ON a.refund_case_id=c.id
      JOIN refund_events e ON e.refund_attempt_id=a.id WHERE c.id=$1`, [refund.requested.id])).rows[0];
    if (fulfillment.status === 'CANCELLED') {
      assert.equal(settled[0].status, 'fulfilled');
      assert.equal(settled[1].status, 'rejected');
      assert.equal(settled.filter(({ status }) => status === 'fulfilled').length, 1);
      assert.equal(settled.filter(({ status }) => status === 'rejected').length, 1);
      assert.deepEqual(refundState,
        { status: 'REFUNDED', attemptStatus: 'SUCCEEDED', eventStatus: 'APPLIED' });
      assert.deepEqual(fulfillmentEvents[0], { action: 'REFUND_CANCELLED',
        idempotency_scope: 'system:refund', idempotencyKey: refund.event.id });
    } else {
      assert.equal(fulfillment.status, 'SHIPPED');
      assert.equal(settled[0].status, 'fulfilled');
      assert.equal(settled[1].status, 'fulfilled');
      assert.equal(settled[0].value.processingStatus, 'REVIEW_REQUIRED');
      assert.deepEqual(refundState, { status: 'REVIEW_REQUIRED',
        attemptStatus: 'REVIEW_REQUIRED', eventStatus: 'REVIEW_REQUIRED' });
      assert.equal(fulfillmentEvents[0].action,
        mode === 'seller' ? 'MARK_SHIPPED' : 'ADMIN_CORRECT');
    }
  } finally {
    if (locker) {
      await locker.query('ROLLBACK').catch(() => {});
      locker.release();
    }
    await refundPool.end();
    await shipPool.end();
    await cleanup(main, ids);
    await main.end();
  }
});
