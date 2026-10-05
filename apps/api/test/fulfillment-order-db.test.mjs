import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { CheckoutReservations } from '../src/checkout/reservation-service.ts';
import {
  skipWithoutFulfillmentSchema,
  skipWithoutOrderSchema,
} from './order-schema-guard.mjs';

async function requireSchemas(context, pool) {
  if (await skipWithoutOrderSchema(context, pool)) return false;
  if (await skipWithoutFulfillmentSchema(context, pool)) return false;
  return true;
}

async function seedOrderScenario(pool, runId) {
  await runQaCatalogFixture(
    'seed', runId, process.env.DATABASE_URL, 'test-only-password-12345',
  );
  const names = qaNames(runId);
  const buyerId = (await pool.query(`SELECT account_id FROM account_identities
    WHERE kind='email' AND identifier=$1`, [names.emails[0]])).rows[0].account_id;
  const adminId = (await pool.query(`SELECT account_id FROM account_identities
    WHERE kind='email' AND identifier=$1`, [names.emails[4]])).rows[0].account_id;
  const sellers = (await pool.query(`SELECT s.id,s.display_name AS name,
    role.account_id AS "accountId" FROM sellers s JOIN account_roles role
      ON role.seller_id=s.id AND role.role='seller'
    WHERE s.display_name=ANY($1::text[])`, [
    [names.sellerA, names.sellerB, names.owool],
  ])).rows;
  const byName = new Map(sellers.map((row) => [row.name, row]));
  const sellerA = byName.get(names.sellerA);
  const sellerB = byName.get(names.sellerB);
  const owool = byName.get(names.owool);
  assert.ok(sellerA && sellerB && owool);

  const options = await pool.query(`SELECT o.id,r.title FROM product_options o
    JOIN product_revisions r ON r.id=o.revision_id
    WHERE r.title=ANY($1::text[])`, [
    ['고추', '마늘', '고춧가루'].map((name) => `qa-${runId}-${name}`),
  ]);
  assert.equal(options.rows.length, 3);
  for (const { id } of options.rows) {
    await pool.query(`INSERT INTO customer_cart_items(account_id,option_id,quantity)
      VALUES ($1,$2,1)`, [buyerId, id]);
  }
  const addressId = (await pool.query(`INSERT INTO customer_addresses
    (account_id,label,recipient_name,phone,postal_code,line1)
    VALUES ($1,'시험','받는 분','01000000000','12345','시험 주소') RETURNING id`,
  [buyerId])).rows[0].id;
  const hold = await new CheckoutReservations(pool).start(buyerId, randomUUID(), true);
  assert.equal(hold.quote.shipments.length, 3);
  assert.equal(hold.quote.totalWon, 66000);
  return {
    runId, names, buyerId, adminId, sellerA, sellerB, owool, addressId,
    reservationId: hold.id,
    setting: (await pool.query('SELECT * FROM fulfillment_settings WHERE id=1')).rows[0],
    globalPolicy: (await pool.query('SELECT * FROM shipping_policy_global WHERE id=1')).rows[0],
  };
}

async function approveSellerPolicy(pool, seller, adminId, cutoffTime) {
  const policy = {
    feeWon: 3000,
    freeThresholdWon: 50000,
    cutoffTime,
    blockedPostalRanges: [],
  };
  const requestId = (await pool.query(`INSERT INTO seller_shipping_policy_requests
    (seller_id,policy,status,requested_by_account_id,decided_by_account_id,decided_at)
    VALUES ($1,$2::jsonb,'approved',$3,$4,now()) RETURNING id`, [
    seller.id, JSON.stringify(policy), seller.accountId, adminId,
  ])).rows[0].id;
  await pool.query(`INSERT INTO seller_shipping_policies
    (seller_id,policy,approved_request_id,approved_by_account_id)
    VALUES ($1,$2::jsonb,$3,$4)`, [
    seller.id, JSON.stringify(policy), requestId, adminId,
  ]);
}

async function configureFulfillment(pool, scenario) {
  await pool.query(`UPDATE shipping_policy_global
    SET cutoff_time='12:00',updated_at=now() WHERE id=1`);
  await approveSellerPolicy(pool, scenario.sellerA, scenario.adminId, '13:00');
  await approveSellerPolicy(pool, scenario.sellerB, scenario.adminId, '14:00');
  await pool.query(`UPDATE fulfillment_settings SET owool_seller_id=$1,updated_by=$2,
    version=version+1,updated_at=now() WHERE id=1`, [scenario.owool.id, scenario.adminId]);
}

async function cleanupScenario(pool, scenario) {
  if (!scenario) return;
  await pool.query(`UPDATE fulfillment_settings SET owool_seller_id=$1,updated_by=$2,
    version=$3,updated_at=$4 WHERE id=1`, [
    scenario.setting.owool_seller_id, scenario.setting.updated_by,
    scenario.setting.version, scenario.setting.updated_at,
  ]);
  await pool.query(`UPDATE shipping_policy_global SET fee_won=$1,free_threshold_won=$2,
    cutoff_time=$3,blocked_postal_ranges=$4::jsonb,locked_fee=$5,locked_threshold=$6,
    locked_cutoff=$7,updated_by_account_id=$8,updated_at=$9 WHERE id=1`, [
    scenario.globalPolicy.fee_won, scenario.globalPolicy.free_threshold_won,
    scenario.globalPolicy.cutoff_time, JSON.stringify(scenario.globalPolicy.blocked_postal_ranges),
    scenario.globalPolicy.locked_fee, scenario.globalPolicy.locked_threshold,
    scenario.globalPolicy.locked_cutoff, scenario.globalPolicy.updated_by_account_id,
    scenario.globalPolicy.updated_at,
  ]);
  const orders = (await pool.query(
    'SELECT id FROM checkout_orders WHERE reservation_id=$1', [scenario.reservationId],
  )).rows;
  for (const { id } of orders) {
    await pool.query(`DELETE FROM shipment_fulfillment_events WHERE shipment_order_id IN
      (SELECT id FROM shipment_orders WHERE checkout_order_id=$1)`, [id]);
    await pool.query(`DELETE FROM shipment_fulfillments WHERE shipment_order_id IN
      (SELECT id FROM shipment_orders WHERE checkout_order_id=$1)`, [id]);
    await pool.query('DELETE FROM order_promotion_allocations WHERE checkout_order_id=$1', [id]);
    await pool.query('DELETE FROM order_status_events WHERE checkout_order_id=$1', [id]);
    await pool.query(`DELETE FROM shipment_order_lines WHERE shipment_order_id IN
      (SELECT id FROM shipment_orders WHERE checkout_order_id=$1)`, [id]);
    await pool.query('DELETE FROM shipment_orders WHERE checkout_order_id=$1', [id]);
    await pool.query('DELETE FROM checkout_orders WHERE id=$1', [id]);
  }
  await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=$1',
    [scenario.reservationId]);
  await pool.query('DELETE FROM checkout_reservations WHERE id=$1', [scenario.reservationId]);
  await pool.query('DELETE FROM customer_addresses WHERE id=$1', [scenario.addressId]);
  await runQaCatalogFixture('reset', scenario.runId, process.env.DATABASE_URL);
}

test('order submission snapshots direct and pooled owners and cutoffs exactly once', {
  skip: !process.env.DATABASE_URL,
}, async (context) => {
  const { submitPendingOrder } = await import('../src/orders/service.ts');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
  let scenario;
  try {
    if (!await requireSchemas(context, pool)) return;
    scenario = await seedOrderScenario(pool, randomBytes(4).toString('hex'));
    await configureFulfillment(pool, scenario);
    const input = {
      reservationId: scenario.reservationId,
      addressId: scenario.addressId,
      selections: {},
      expectedPayableWon: 66000,
      idempotencyKey: randomUUID(),
    };
    const saved = await submitPendingOrder(pool, scenario.buyerId, input);
    const rows = (await pool.query(`SELECT s.shipment_key AS key,
      s.seller_id AS "sellerId",f.fulfillment_seller_id AS "fulfillmentSellerId",
      f.cutoff_time AS "cutoffTime",f.status,f.timezone
      FROM shipment_orders s JOIN shipment_fulfillments f ON f.shipment_order_id=s.id
      WHERE s.checkout_order_id=$1 ORDER BY s.shipment_key`, [saved.id])).rows;
    assert.deepEqual(rows, [
      {
        key: 'owool_fulfillment',
        sellerId: null,
        fulfillmentSellerId: scenario.owool.id,
        cutoffTime: '12:00',
        status: 'PAYMENT_PENDING',
        timezone: 'Asia/Seoul',
      },
      {
        key: `seller_direct:${scenario.sellerA.id}`,
        sellerId: scenario.sellerA.id,
        fulfillmentSellerId: scenario.sellerA.id,
        cutoffTime: '13:00',
        status: 'PAYMENT_PENDING',
        timezone: 'Asia/Seoul',
      },
      {
        key: `seller_direct:${scenario.sellerB.id}`,
        sellerId: scenario.sellerB.id,
        fulfillmentSellerId: scenario.sellerB.id,
        cutoffTime: '14:00',
        status: 'PAYMENT_PENDING',
        timezone: 'Asia/Seoul',
      },
    ]);

    const retried = await submitPendingOrder(pool, scenario.buyerId, input);
    assert.deepEqual(retried, saved);
    assert.equal((await pool.query(`SELECT count(*)::int AS n
      FROM shipment_fulfillments f JOIN shipment_orders s ON s.id=f.shipment_order_id
      WHERE s.checkout_order_id=$1`, [saved.id])).rows[0].n, 3);
  } finally {
    await cleanupScenario(pool, scenario);
    await pool.end();
  }
});
