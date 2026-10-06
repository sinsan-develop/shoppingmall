import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { CheckoutReservations } from '../src/checkout/reservation-service.ts';
import { submitPendingOrder } from '../src/orders/service.ts';
import { MockPaymentAdapter } from '../src/payments/mock-adapter.ts';
import { processVerifiedPaymentEvent } from '../src/payments/processor.ts';
import { recordVerifiedPaymentEvent, startPaymentAttempt } from '../src/payments/service.ts';
import {
  assertOrderMutationQaTarget,
  skipWithoutFulfillmentSchema,
  skipWithoutOrderSchema,
} from './order-schema-guard.mjs';

const paymentEnv = { APP_ENV: 'development', PAYMENT_MODE: 'mock' };

async function requireFreshIsolatedSchema(context, pool) {
  await assertOrderMutationQaTarget(pool, process.env.S5_PAYMENT_TEST_DB_SYSTEM_ID);
  if (await skipWithoutOrderSchema(context, pool, true)) return false;
  if (await skipWithoutFulfillmentSchema(context, pool, true)) return false;
  const schema = (await pool.query(`SELECT
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations,
    to_regclass('public.payment_attempts') IS NOT NULL AS attempts,
    to_regclass('public.payment_events') IS NOT NULL AS events`)).rows[0];
  assert.deepEqual(schema, { migrations: 17, attempts: true, events: true });
  return true;
}

async function approveSellerPolicy(pool, scenario, seller, cutoffTime) {
  const policy = {
    feeWon: 3000,
    freeThresholdWon: 50000,
    cutoffTime,
    blockedPostalRanges: [],
  };
  const requestId = (await pool.query(`INSERT INTO seller_shipping_policy_requests
    (seller_id,policy,status,requested_by_account_id,decided_by_account_id,decided_at)
    VALUES ($1,$2::jsonb,'approved',$3,$4,clock_timestamp()) RETURNING id`, [
    seller.id, JSON.stringify(policy), seller.accountId, scenario.adminId,
  ])).rows[0].id;
  scenario.policyRequestIds.push(requestId);
  await pool.query(`INSERT INTO seller_shipping_policies
    (seller_id,policy,approved_request_id,approved_by_account_id)
    VALUES ($1,$2::jsonb,$3,$4)`, [
    seller.id, JSON.stringify(policy), requestId, scenario.adminId,
  ]);
  scenario.policySellerIds.push(seller.id);
}

async function seedScenario(pool, scenario) {
  scenario.seeded = true;
  await runQaCatalogFixture(
    'seed', scenario.runId, process.env.DATABASE_URL, 'test-only-password-12345',
  );
  const names = qaNames(scenario.runId);
  scenario.buyerId = (await pool.query(`SELECT account_id FROM account_identities
    WHERE kind='email' AND identifier=$1`, [names.emails[0]])).rows[0].account_id;
  scenario.adminId = (await pool.query(`SELECT account_id FROM account_identities
    WHERE kind='email' AND identifier=$1`, [names.emails[4]])).rows[0].account_id;
  const sellers = (await pool.query(`SELECT s.id,s.display_name AS name,
    role.account_id AS "accountId" FROM sellers s JOIN account_roles role
      ON role.seller_id=s.id AND role.role='seller'
    WHERE s.display_name=ANY($1::text[])`, [
    [names.sellerA, names.sellerB, names.owool],
  ])).rows;
  const byName = new Map(sellers.map((row) => [row.name, row]));
  scenario.sellerA = byName.get(names.sellerA);
  scenario.sellerB = byName.get(names.sellerB);
  scenario.owool = byName.get(names.owool);
  assert.ok(scenario.sellerA && scenario.sellerB && scenario.owool);
  scenario.optionIds = (await pool.query(`SELECT o.id,r.title FROM product_options o
    JOIN product_revisions r ON r.id=o.revision_id
    WHERE r.title=ANY($1::text[]) ORDER BY r.title`, [
    ['고추', '마늘', '고춧가루'].map((name) => `qa-${scenario.runId}-${name}`),
  ])).rows.map(({ id }) => id);
  assert.equal(scenario.optionIds.length, 3);
  scenario.addressId = (await pool.query(`INSERT INTO customer_addresses
    (account_id,label,recipient_name,phone,postal_code,line1)
    VALUES ($1,'시험','받는 분','01000000000','12345','시험 주소') RETURNING id`,
  [scenario.buyerId])).rows[0].id;
  scenario.setting = (await pool.query('SELECT * FROM fulfillment_settings WHERE id=1')).rows[0];
  scenario.globalPolicy = (await pool.query('SELECT * FROM shipping_policy_global WHERE id=1')).rows[0];
  await pool.query(`UPDATE shipping_policy_global
    SET cutoff_time='00:00',updated_at=clock_timestamp() WHERE id=1`);
  await approveSellerPolicy(pool, scenario, scenario.sellerA, '23:59');
  await approveSellerPolicy(pool, scenario, scenario.sellerB, '00:00');
  await pool.query(`UPDATE fulfillment_settings SET owool_seller_id=$1,updated_by=$2,
    version=version+1,updated_at=clock_timestamp() WHERE id=1`,
  [scenario.owool.id, scenario.adminId]);
  return scenario;
}

async function createPendingOrder(pool, scenario) {
  await pool.query('DELETE FROM customer_cart_items WHERE account_id=$1', [scenario.buyerId]);
  for (const optionId of scenario.optionIds) {
    await pool.query(`INSERT INTO customer_cart_items(account_id,option_id,quantity)
      VALUES ($1,$2,1)`, [scenario.buyerId, optionId]);
  }
  const hold = await new CheckoutReservations(pool).start(scenario.buyerId, randomUUID(), true);
  assert.equal(hold.quote.shipments.length, 3);
  assert.equal(hold.quote.totalWon, 66000);
  scenario.reservationIds.push(hold.id);
  const order = await submitPendingOrder(pool, scenario.buyerId, {
    reservationId: hold.id,
    addressId: scenario.addressId,
    selections: {},
    expectedPayableWon: 66000,
    idempotencyKey: randomUUID(),
  });
  scenario.orderIds.push(order.id);
  return { ...order, reservationId: hold.id };
}

async function createPaymentEvent(pool, scenario, order, outcome = 'APPROVED', mutate = value => value) {
  const localOutcome = outcome === 'DECLINED' ? 'decline' : 'approve';
  const attempt = await startPaymentAttempt(
    pool, scenario.buyerId, order.id, randomUUID(), localOutcome, paymentEnv,
  );
  scenario.attemptIds.push(attempt.id);
  const providerOrderId = (await pool.query(`SELECT provider_order_id FROM payment_attempts
    WHERE id=$1`, [attempt.id])).rows[0].provider_order_id;
  const verified = new MockPaymentAdapter().verify(providerOrderId, localOutcome);
  const event = await recordVerifiedPaymentEvent(pool, attempt.id, mutate(verified));
  return { attempt, event, verified };
}

async function fulfillmentState(pool, orderId) {
  return (await pool.query(`SELECT s.id AS "shipmentOrderId",s.shipment_key AS "shipmentKey",
    f.fulfillment_seller_id AS "fulfillmentSellerId",f.status,f.version,
    f.cutoff_time AS "cutoffTime",f.expected_ship_date::text AS "expectedShipDate",
    to_char((o.paid_at AT TIME ZONE 'Asia/Seoul')::date + CASE
      WHEN f.cutoff_time IS NOT NULL
        AND to_char(o.paid_at AT TIME ZONE 'Asia/Seoul','HH24:MI') >= f.cutoff_time
      THEN 1 ELSE 0 END,'YYYY-MM-DD') AS "expectedFromPaidAt"
    FROM checkout_orders o JOIN shipment_orders s ON s.checkout_order_id=o.id
    JOIN shipment_fulfillments f ON f.shipment_order_id=s.id
    WHERE o.id=$1 ORDER BY s.shipment_key`, [orderId])).rows;
}

async function fulfillmentEvents(pool, orderId) {
  return (await pool.query(`SELECT e.shipment_order_id AS "shipmentOrderId",e.action,
    e.from_status AS "fromStatus",e.to_status AS "toStatus",
    e.before_snapshot AS "beforeSnapshot",e.after_snapshot AS "afterSnapshot",
    e.idempotency_scope AS "idempotencyScope",e.idempotency_key AS "idempotencyKey",
    e.request_fingerprint AS "requestFingerprint"
    FROM shipment_fulfillment_events e JOIN shipment_orders s ON s.id=e.shipment_order_id
    WHERE s.checkout_order_id=$1 ORDER BY s.shipment_key,e.occurred_at,e.id`, [orderId])).rows;
}

async function reviewBoundaryState(pool, order, paymentEventId) {
  return (await pool.query(`SELECT
    (SELECT status FROM checkout_orders WHERE id=$1) AS "orderStatus",
    (SELECT paid_at IS NULL FROM checkout_orders WHERE id=$1) AS "paidAtNull",
    (SELECT status FROM checkout_reservations WHERE id=$2) AS "reservationStatus",
    (SELECT processing_status FROM payment_events WHERE id=$3) AS "paymentEventStatus",
    (SELECT status FROM payment_attempts WHERE id=(SELECT payment_attempt_id
      FROM payment_events WHERE id=$3)) AS "paymentAttemptStatus",
    (SELECT count(*)::int FROM shipment_fulfillments f JOIN shipment_orders s
      ON s.id=f.shipment_order_id WHERE s.checkout_order_id=$1 AND f.status='READY') AS ready,
    (SELECT count(*)::int FROM shipment_orders
      WHERE checkout_order_id=$1 AND status='PENDING_PAYMENT') AS "pendingShipments",
    (SELECT count(*)::int FROM shipment_fulfillment_events e JOIN shipment_orders s
      ON s.id=e.shipment_order_id WHERE s.checkout_order_id=$1) AS "fulfillmentEvents",
    (SELECT coalesce(sum(version),0)::int FROM shipment_fulfillments f JOIN shipment_orders s
      ON s.id=f.shipment_order_id WHERE s.checkout_order_id=$1) AS "fulfillmentVersions"
  `, [order.id, order.reservationId, paymentEventId])).rows[0];
}

async function stockState(pool, optionIds) {
  return (await pool.query(`SELECT option_id AS "optionId",on_hand_quantity AS "onHand",
    sellable_quantity AS sellable FROM inventory_levels
    WHERE option_id=ANY($1::uuid[]) ORDER BY option_id`, [optionIds])).rows;
}

async function cleanupScenario(pool, scenario) {
  if (!scenario) return;
  const orderIds = scenario.orderIds ?? [];
  if (orderIds.length) {
    await pool.query(`DELETE FROM payment_event_conflicts WHERE original_event_id IN
      (SELECT e.id FROM payment_events e JOIN payment_attempts a ON a.id=e.payment_attempt_id
       WHERE a.checkout_order_id=ANY($1::uuid[])) OR incoming_attempt_id IN
      (SELECT id FROM payment_attempts WHERE checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
    await pool.query(`DELETE FROM shipment_fulfillment_events WHERE shipment_order_id IN
      (SELECT id FROM shipment_orders WHERE checkout_order_id=ANY($1::uuid[]))`, [orderIds]);
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
  const reservationIds = scenario.reservationIds ?? [];
  if (reservationIds.length) {
    await pool.query('DELETE FROM promotion_uses WHERE reservation_id=ANY($1::uuid[])', [reservationIds]);
    await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=ANY($1::uuid[])', [reservationIds]);
    await pool.query('DELETE FROM checkout_reservations WHERE id=ANY($1::uuid[])', [reservationIds]);
  }
  if (scenario.buyerId) {
    await pool.query('DELETE FROM customer_cart_items WHERE account_id=$1', [scenario.buyerId]);
  }
  if (scenario.setting) {
    await pool.query(`UPDATE fulfillment_settings SET owool_seller_id=$1,updated_by=$2,
      version=$3,updated_at=$4 WHERE id=1`, [
      scenario.setting.owool_seller_id, scenario.setting.updated_by,
      scenario.setting.version, scenario.setting.updated_at,
    ]);
  }
  if (scenario.globalPolicy) {
    await pool.query(`UPDATE shipping_policy_global SET fee_won=$1,free_threshold_won=$2,
      cutoff_time=$3,blocked_postal_ranges=$4::jsonb,locked_fee=$5,locked_threshold=$6,
      locked_cutoff=$7,updated_by_account_id=$8,updated_at=$9 WHERE id=1`, [
      scenario.globalPolicy.fee_won, scenario.globalPolicy.free_threshold_won,
      scenario.globalPolicy.cutoff_time, JSON.stringify(scenario.globalPolicy.blocked_postal_ranges),
      scenario.globalPolicy.locked_fee, scenario.globalPolicy.locked_threshold,
      scenario.globalPolicy.locked_cutoff, scenario.globalPolicy.updated_by_account_id,
      scenario.globalPolicy.updated_at,
    ]);
  }
  if (scenario.policySellerIds?.length) {
    await pool.query('DELETE FROM seller_shipping_policies WHERE seller_id=ANY($1::uuid[])',
      [scenario.policySellerIds]);
  }
  if (scenario.policyRequestIds?.length) {
    await pool.query('DELETE FROM seller_shipping_policy_requests WHERE id=ANY($1::uuid[])',
      [scenario.policyRequestIds]);
  }
  if (scenario.addressId) {
    await pool.query('DELETE FROM customer_addresses WHERE id=$1', [scenario.addressId]);
  }
  if (scenario.seeded) {
    await runQaCatalogFixture('reset', scenario.runId, process.env.DATABASE_URL);
  }
}

function createScenario() {
  return {
    runId: randomBytes(4).toString('hex'),
    seeded: false,
    orderIds: [],
    reservationIds: [],
    attemptIds: [],
    policyRequestIds: [],
    policySellerIds: [],
  };
}

async function withIsolatedScenario(context, callback) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
  let scenario;
  try {
    if (!await requireFreshIsolatedSchema(context, pool)) return;
    scenario = createScenario();
    await seedScenario(pool, scenario);
    await callback(pool, scenario);
  } finally {
    await cleanupScenario(pool, scenario);
    await pool.end();
  }
}

async function assertFulfillmentRemainsPending(pool, order) {
  const fulfillments = await fulfillmentState(pool, order.id);
  assert.equal(fulfillments.length, 3);
  assert.deepEqual(fulfillments.map(({ status, version, expectedShipDate }) =>
    ({ status, version, expectedShipDate })), Array.from({ length: 3 }, () => ({
    status: 'PAYMENT_PENDING', version: 0, expectedShipDate: null,
  })));
  assert.deepEqual(await fulfillmentEvents(pool, order.id), []);
}

test('verified payment opens every fulfillment once and rejects partial payment application', {
  skip: !process.env.DATABASE_URL || !process.env.S5_PAYMENT_TEST_DB_SYSTEM_ID,
  timeout: 120000,
}, async (t) => {
  await t.test('approval and replay share one isolated payment scenario', async (approvalGroup) => {
    await withIsolatedScenario(approvalGroup, async (pool, scenario) => {
      let approved;
      await approvalGroup.test(
        'approval stores READY, paid_at provisional dates and system events for all shipments',
        async () => {
          const order = await createPendingOrder(pool, scenario);
          const payment = await createPaymentEvent(pool, scenario, order);
          approved = { order, payment };
          const applied = await processVerifiedPaymentEvent(pool, payment.event.id);
          const fulfillments = await fulfillmentState(pool, order.id);
          const events = await fulfillmentEvents(pool, order.id);
          assert.equal(applied.processingStatus, 'APPLIED');
          assert.equal(fulfillments.length, 3);
          assert.deepEqual(fulfillments.map(({
            status, version, expectedShipDate, expectedFromPaidAt,
          }) => ({ status, version, expectedShipDate, expectedFromPaidAt })),
          fulfillments.map(({ expectedFromPaidAt }) => ({
            status: 'READY', version: 1,
            expectedShipDate: expectedFromPaidAt, expectedFromPaidAt,
          })));
          assert.equal(events.length, 3);
          for (const event of events) {
            const fulfillment = fulfillments.find(({ shipmentOrderId }) =>
              shipmentOrderId === event.shipmentOrderId);
            assert.deepEqual({
              action: event.action,
              fromStatus: event.fromStatus,
              toStatus: event.toStatus,
              beforeSnapshot: event.beforeSnapshot,
              afterSnapshot: event.afterSnapshot,
              idempotencyScope: event.idempotencyScope,
              idempotencyKey: event.idempotencyKey,
            }, {
              action: 'PAYMENT_CONFIRMED',
              fromStatus: 'PAYMENT_PENDING',
              toStatus: 'READY',
              beforeSnapshot: {
                status: 'PAYMENT_PENDING', expectedShipDate: null,
                carrierCode: null, trackingNumber: null,
              },
              afterSnapshot: {
                status: 'READY', expectedShipDate: fulfillment.expectedShipDate,
                carrierCode: null, trackingNumber: null,
              },
              idempotencyScope: 'system:payment',
              idempotencyKey: payment.event.id,
            });
            assert.match(event.requestFingerprint, /^[0-9a-f]{64}$/);
          }
        },
      );

      await approvalGroup.test(
        'replaying the original approval does not change status, version or event count again',
        async () => {
          assert.ok(approved);
          const before = await fulfillmentState(pool, approved.order.id);
          const beforeEvents = await fulfillmentEvents(pool, approved.order.id);
          assert.deepEqual(before.map(({ status, version }) => ({ status, version })),
            Array.from({ length: 3 }, () => ({ status: 'READY', version: 1 })));
          assert.equal(beforeEvents.length, 3);
          assert.equal((await processVerifiedPaymentEvent(
            pool, approved.payment.event.id,
          )).processingStatus, 'APPLIED');
          const replayed = await recordVerifiedPaymentEvent(
            pool, approved.payment.attempt.id, approved.payment.verified,
          );
          assert.equal(replayed.id, approved.payment.event.id);
          assert.equal((await processVerifiedPaymentEvent(pool, replayed.id)).processingStatus,
            'APPLIED');
          assert.deepEqual(await fulfillmentState(pool, approved.order.id), before);
          assert.deepEqual(await fulfillmentEvents(pool, approved.order.id), beforeEvents);
        },
      );
    });
  });

  await t.test('declined payment leaves fulfillment pending in its own scenario', async (scenarioTest) => {
    await withIsolatedScenario(scenarioTest, async (pool, scenario) => {
      const order = await createPendingOrder(pool, scenario);
      const declined = await createPaymentEvent(pool, scenario, order, 'DECLINED');
      assert.equal((await processVerifiedPaymentEvent(pool, declined.event.id)).processingStatus,
        'APPLIED');
      await assertFulfillmentRemainsPending(pool, order);
    });
  });

  await t.test('unconfirmed payment leaves fulfillment pending in its own scenario', async (scenarioTest) => {
    await withIsolatedScenario(scenarioTest, async (pool, scenario) => {
      const order = await createPendingOrder(pool, scenario);
      const attempt = await startPaymentAttempt(
        pool, scenario.buyerId, order.id, randomUUID(), 'delay', paymentEnv,
      );
      scenario.attemptIds.push(attempt.id);
      await assertFulfillmentRemainsPending(pool, order);
    });
  });

  await t.test('review-required payment leaves fulfillment pending in its own scenario',
    async (scenarioTest) => {
      await withIsolatedScenario(scenarioTest, async (pool, scenario) => {
        const order = await createPendingOrder(pool, scenario);
        const review = await createPaymentEvent(pool, scenario, order, 'APPROVED',
          verified => ({ ...verified, amountWon: verified.amountWon + 1 }));
        assert.equal(review.event.processingStatus, 'REVIEW_REQUIRED');
        assert.equal((await processVerifiedPaymentEvent(pool, review.event.id)).processingStatus,
          'REVIEW_REQUIRED');
        await assertFulfillmentRemainsPending(pool, order);
      });
    });

  await t.test('a missing fulfillment leaves zero partial changes and moves payment to review',
    async (scenarioTest) => {
      await withIsolatedScenario(scenarioTest, async (pool, scenario) => {
      const order = await createPendingOrder(pool, scenario);
      const payment = await createPaymentEvent(pool, scenario, order);
      const missingId = (await pool.query(`SELECT f.shipment_order_id FROM shipment_fulfillments f
        JOIN shipment_orders s ON s.id=f.shipment_order_id WHERE s.checkout_order_id=$1
        ORDER BY s.shipment_key LIMIT 1`, [order.id])).rows[0].shipment_order_id;
      await pool.query('DELETE FROM shipment_fulfillments WHERE shipment_order_id=$1', [missingId]);
      const stockBefore = await stockState(pool, scenario.optionIds);
      const result = await processVerifiedPaymentEvent(pool, payment.event.id);
      assert.deepEqual({ processingStatus: result.processingStatus,
        ...await reviewBoundaryState(pool, order, payment.event.id) }, {
        processingStatus: 'REVIEW_REQUIRED',
        orderStatus: 'PENDING_PAYMENT', paidAtNull: true,
        reservationStatus: 'ACTIVE', paymentEventStatus: 'REVIEW_REQUIRED',
        paymentAttemptStatus: 'REVIEW_REQUIRED', ready: 0,
        pendingShipments: 3, fulfillmentEvents: 0, fulfillmentVersions: 0,
      });
      assert.deepEqual(await stockState(pool, scenario.optionIds), stockBefore);
      });
    });

  await t.test('a conflicting fulfillment owner leaves zero partial changes and moves payment to review',
    async (scenarioTest) => {
      await withIsolatedScenario(scenarioTest, async (pool, scenario) => {
      const order = await createPendingOrder(pool, scenario);
      const payment = await createPaymentEvent(pool, scenario, order);
      const direct = (await pool.query(`SELECT s.id FROM shipment_orders s
        WHERE s.checkout_order_id=$1 AND s.shipping_mode='seller_direct'
        ORDER BY s.shipment_key LIMIT 1`, [order.id])).rows[0];
      await pool.query(`UPDATE shipment_fulfillments SET fulfillment_seller_id=$2
        WHERE shipment_order_id=$1`, [direct.id, scenario.owool.id]);
      const stockBefore = await stockState(pool, scenario.optionIds);
      const result = await processVerifiedPaymentEvent(pool, payment.event.id);
      assert.deepEqual({ processingStatus: result.processingStatus,
        ...await reviewBoundaryState(pool, order, payment.event.id) }, {
        processingStatus: 'REVIEW_REQUIRED',
        orderStatus: 'PENDING_PAYMENT', paidAtNull: true,
        reservationStatus: 'ACTIVE', paymentEventStatus: 'REVIEW_REQUIRED',
        paymentAttemptStatus: 'REVIEW_REQUIRED', ready: 0,
        pendingShipments: 3, fulfillmentEvents: 0, fulfillmentVersions: 0,
      });
      assert.deepEqual(await stockState(pool, scenario.optionIds), stockBefore);
      });
    });
});
