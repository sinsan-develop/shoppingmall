import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { CheckoutReservations } from '../src/checkout/reservation-service.ts';
import {
  assertOrderMutationQaTarget,
  skipWithoutFulfillmentSchema,
  skipWithoutOrderSchema,
} from './order-schema-guard.mjs';

async function requireSchemas(context, pool) {
  if (await skipWithoutOrderSchema(context, pool)) return false;
  if (await skipWithoutFulfillmentSchema(context, pool)) return false;
  await assertOrderMutationQaTarget(pool, process.env.S5_ORDER_TEST_DB_SYSTEM_ID);
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

async function addPromotion(pool, scenario) {
  scenario.campaignId = (await pool.query(`INSERT INTO promotion_campaigns
    (title,kind,total_use_limit,per_account_use_limit,created_by_account_id)
    VALUES ($1,'goods_discount',10,10,$2) RETURNING id`, [
    `QA-${scenario.runId}`, scenario.adminId,
  ])).rows[0].id;
  const versionId = (await pool.query(`INSERT INTO promotion_versions
    (campaign_id,version,scope,starts_at,ends_at,amount_kind,amount_value,
      created_by_account_id)
    VALUES ($1,1,'all',now()-interval '1 hour',now()+interval '1 day',
      'fixed',5000,$2) RETURNING id`, [scenario.campaignId, scenario.adminId])).rows[0].id;
  scenario.grantId = (await pool.query(`INSERT INTO promotion_grants
    (account_id,version_id,source,issued_by_account_id,idempotency_key,reason)
    VALUES ($1,$2,'direct',$3,$4,'QA fulfillment order') RETURNING id`, [
    scenario.buyerId, versionId, scenario.adminId, randomUUID(),
  ])).rows[0].id;
}

async function assertSubmissionRollback(pool, scenario) {
  const row = (await pool.query(`SELECT
    (SELECT count(*)::int FROM checkout_orders WHERE reservation_id=$1) AS orders,
    (SELECT count(*)::int FROM promotion_uses WHERE reservation_id=$1) AS promotions,
    (SELECT status FROM checkout_reservations WHERE id=$1) AS reservation,
    (SELECT count(*)::int FROM checkout_reservation_lines WHERE reservation_id=$1) AS lines`,
  [scenario.reservationId])).rows[0];
  assert.deepEqual(row, {
    orders: 0,
    promotions: 0,
    reservation: 'ACTIVE',
    lines: 3,
  });
}

async function startConcurrentUpdate(pool, sql, params) {
  const client = await pool.connect();
  await client.query('BEGIN');
  const pid = (await client.query('SELECT pg_backend_pid()::int AS pid')).rows[0].pid;
  const done = (async () => {
    try {
      await client.query(sql, params);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  })();
  return { pid, done };
}

async function waitForBlock(pool, writerPid, orderPid) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query(
      'SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked',
      [orderPid, writerPid],
    );
    if (result.rows[0].blocked) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
}

function createBarrier() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
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
  await pool.query('DELETE FROM promotion_uses WHERE reservation_id=$1',
    [scenario.reservationId]);
  await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=$1',
    [scenario.reservationId]);
  await pool.query('DELETE FROM checkout_reservations WHERE id=$1', [scenario.reservationId]);
  if (scenario.campaignId) {
    await pool.query(`DELETE FROM promotion_grants WHERE version_id IN
      (SELECT id FROM promotion_versions WHERE campaign_id=$1)`, [scenario.campaignId]);
    await pool.query('DELETE FROM promotion_versions WHERE campaign_id=$1', [scenario.campaignId]);
    await pool.query('DELETE FROM promotion_campaigns WHERE id=$1', [scenario.campaignId]);
  }
  await pool.query('DELETE FROM customer_addresses WHERE id=$1', [scenario.addressId]);
  await pool.query(`DELETE FROM audit_events WHERE actor_account_id=$1
    AND action='shipping.global_update' AND target_type='shipping_policy_global'
    AND target_id='1'`, [scenario.buyerId]);
  if (scenario.dualRoleId) {
    await pool.query('DELETE FROM account_roles WHERE id=$1', [scenario.dualRoleId]);
  }
  await runQaCatalogFixture('reset', scenario.runId, process.env.DATABASE_URL);
}

test('order submission snapshots direct and pooled owners and cutoffs exactly once', {
  skip: !process.env.DATABASE_URL || !process.env.S5_ORDER_TEST_DB_SYSTEM_ID,
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
    ].sort((left, right) => left.key.localeCompare(right.key)));

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

test('unusable pooled owner rolls back order promotion hold and reservation consumption', {
  skip: !process.env.DATABASE_URL || !process.env.S5_ORDER_TEST_DB_SYSTEM_ID,
}, async (context) => {
  const { submitPendingOrder } = await import('../src/orders/service.ts');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
  let scenario;
  try {
    if (!await requireSchemas(context, pool)) return;
    scenario = await seedOrderScenario(pool, randomBytes(4).toString('hex'));
    await addPromotion(pool, scenario);
    const request = () => submitPendingOrder(pool, scenario.buyerId, {
      reservationId: scenario.reservationId,
      addressId: scenario.addressId,
      selections: { goodsCoupon: { grantId: scenario.grantId } },
      expectedPayableWon: 61000,
      idempotencyKey: randomUUID(),
    });

    await pool.query(`UPDATE fulfillment_settings SET owool_seller_id=NULL,
      updated_by=NULL,version=version+1,updated_at=now() WHERE id=1`);
    await assert.rejects(request, /Fulfillment not configured/);
    await assertSubmissionRollback(pool, scenario);

    await pool.query(`UPDATE fulfillment_settings SET owool_seller_id=$1,
      updated_by=$2,version=version+1,updated_at=now() WHERE id=1`,
    [scenario.owool.id, scenario.adminId]);
    const removed = await pool.query(`DELETE FROM account_roles
      WHERE account_id=$1 AND role='seller' AND seller_id=$2 RETURNING account_id`,
    [scenario.owool.accountId, scenario.owool.id]);
    assert.equal(removed.rowCount, 1);
    try {
      await assert.rejects(request, /Fulfillment seller unavailable/);
      await assertSubmissionRollback(pool, scenario);
    } finally {
      await pool.query(`INSERT INTO account_roles(account_id,role,seller_id)
        VALUES ($1,'seller',$2)`, [scenario.owool.accountId, scenario.owool.id]);
    }

    await pool.query('UPDATE accounts SET disabled_at=now() WHERE id=$1',
      [scenario.owool.accountId]);
    try {
      await assert.rejects(request, /Fulfillment seller unavailable/);
      await assertSubmissionRollback(pool, scenario);
    } finally {
      await pool.query('UPDATE accounts SET disabled_at=NULL WHERE id=$1',
        [scenario.owool.accountId]);
    }
  } finally {
    await cleanupScenario(pool, scenario);
    await pool.end();
  }
});

test('order submission locks assignment and cutoff sources until its snapshot commits', {
  skip: !process.env.DATABASE_URL || !process.env.S5_ORDER_TEST_DB_SYSTEM_ID,
}, async (context) => {
  const { submitPendingOrder } = await import('../src/orders/service.ts');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 12 });
  let scenario;
  let writers = [];
  try {
    if (!await requireSchemas(context, pool)) return;
    scenario = await seedOrderScenario(pool, randomBytes(4).toString('hex'));
    await configureFulfillment(pool, scenario);
    let observedBlocks = [];
    let intercepted = false;
    const racingPool = {
      connect: async () => {
        const client = await pool.connect();
        const orderPid = (await client.query(
          'SELECT pg_backend_pid()::int AS pid',
        )).rows[0].pid;
        return {
          query: async (...args) => {
            const result = await client.query(...args);
            if (!intercepted && typeof args[0] === 'string' &&
                args[0].includes('INSERT INTO checkout_orders')) {
              intercepted = true;
              writers = await Promise.all([
                startConcurrentUpdate(pool, `UPDATE fulfillment_settings
                  SET owool_seller_id=$1,version=version+1,updated_at=now() WHERE id=1`,
                [scenario.sellerA.id]),
                startConcurrentUpdate(pool, `UPDATE shipping_policy_global
                  SET cutoff_time='22:00',updated_at=now() WHERE id=1`, []),
                startConcurrentUpdate(pool, `UPDATE seller_shipping_policies
                  SET policy=jsonb_set(policy,'{cutoffTime}','"23:00"'::jsonb),
                    approved_at=now() WHERE seller_id=ANY($1::uuid[])`,
                [[scenario.sellerA.id, scenario.sellerB.id]]),
              ]);
              observedBlocks = await Promise.all(
                writers.map((writer) => waitForBlock(pool, writer.pid, orderPid)),
              );
            }
            return result;
          },
          release: () => client.release(),
        };
      },
    };
    const saved = await submitPendingOrder(racingPool, scenario.buyerId, {
      reservationId: scenario.reservationId,
      addressId: scenario.addressId,
      selections: {},
      expectedPayableWon: 66000,
      idempotencyKey: randomUUID(),
    });
    await Promise.all(writers.map((writer) => writer.done));
    assert.equal(intercepted, true);
    assert.deepEqual(observedBlocks, [true, true, true]);
    const snapshot = (await pool.query(`SELECT s.shipment_key AS key,
      f.fulfillment_seller_id AS "fulfillmentSellerId",f.cutoff_time AS "cutoffTime"
      FROM shipment_orders s JOIN shipment_fulfillments f ON f.shipment_order_id=s.id
      WHERE s.checkout_order_id=$1 ORDER BY s.shipment_key`, [saved.id])).rows;
    assert.deepEqual(snapshot.map((row) => [row.key, row.fulfillmentSellerId, row.cutoffTime]), [
      ['owool_fulfillment', scenario.owool.id, '12:00'],
      [`seller_direct:${scenario.sellerA.id}`, scenario.sellerA.id, '13:00'],
      [`seller_direct:${scenario.sellerB.id}`, scenario.sellerB.id, '14:00'],
    ].sort((left, right) => left[0].localeCompare(right[0])));
  } finally {
    await Promise.all(writers.map((writer) => writer.done.catch(() => {})));
    await cleanupScenario(pool, scenario);
    await pool.end();
  }
});

test('dual-role global policy audit cannot deadlock an order snapshot', {
  skip: !process.env.DATABASE_URL || !process.env.S5_ORDER_TEST_DB_SYSTEM_ID,
  timeout: 30000,
}, async (context) => {
  const { submitPendingOrder } = await import('../src/orders/service.ts');
  const { ShippingPolicies } = await import('../src/shipping/service.ts');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 12 });
  const accountLocked = createBarrier();
  const releaseOrder = createBarrier();
  const policyRowLocked = createBarrier();
  const releasePolicy = createBarrier();
  let scenario;
  let orderPromise;
  let policyPromise;
  let policyProbe;
  try {
    if (!await requireSchemas(context, pool)) return;
    scenario = await seedOrderScenario(pool, randomBytes(4).toString('hex'));
    await configureFulfillment(pool, scenario);
    scenario.dualRoleId = (await pool.query(`INSERT INTO account_roles(account_id,role)
      VALUES ($1,'admin') RETURNING id`, [scenario.buyerId])).rows[0].id;
    assert.deepEqual((await pool.query(`SELECT role FROM account_roles
      WHERE account_id=$1 ORDER BY role`, [scenario.buyerId])).rows.map(({ role }) => role),
    ['admin', 'customer']);

    const policyBefore = (await pool.query(`SELECT fee_won,free_threshold_won,cutoff_time,
      blocked_postal_ranges,locked_fee,locked_threshold,locked_cutoff
      FROM shipping_policy_global WHERE id=1`)).rows[0];
    assert.equal(policyBefore.cutoff_time, '12:00');
    let orderPid;
    let policyPid;
    let accountIntercepted = false;
    let policyIntercepted = false;
    const orderPool = {
      connect: async () => {
        const client = await pool.connect();
        orderPid = (await client.query('SELECT pg_backend_pid()::int AS pid')).rows[0].pid;
        return {
          query: async (...args) => {
            const result = await client.query(...args);
            if (!accountIntercepted && typeof args[0] === 'string' &&
                args[0].includes('SELECT id FROM accounts WHERE id=$1 FOR')) {
              accountIntercepted = true;
              accountLocked.resolve();
              await releaseOrder.promise;
            }
            return result;
          },
          release: () => client.release(),
        };
      },
    };
    const policyPool = {
      connect: async () => {
        const client = await pool.connect();
        policyPid = (await client.query('SELECT pg_backend_pid()::int AS pid')).rows[0].pid;
        return {
          query: async (...args) => {
            const result = await client.query(...args);
            if (!policyIntercepted && typeof args[0] === 'string' &&
                args[0].includes('UPDATE shipping_policy_global SET')) {
              policyIntercepted = true;
              policyRowLocked.resolve();
              await releasePolicy.promise;
            }
            return result;
          },
          release: () => client.release(),
        };
      },
      query: (...args) => pool.query(...args),
    };
    orderPromise = submitPendingOrder(orderPool, scenario.buyerId, {
      reservationId: scenario.reservationId,
      addressId: scenario.addressId,
      selections: {},
      expectedPayableWon: 66000,
      idempotencyKey: randomUUID(),
    });
    orderPromise.catch(() => {});
    await Promise.race([
      accountLocked.promise,
      orderPromise.then(() => { throw new Error('Order committed before account lock barrier'); }),
    ]);

    policyPromise = new ShippingPolicies(policyPool).updateGlobal(
      { accountId: scenario.buyerId, role: 'admin' },
      {
        feeWon: policyBefore.fee_won,
        freeThresholdWon: policyBefore.free_threshold_won,
        cutoffTime: '22:00',
        blockedPostalRanges: policyBefore.blocked_postal_ranges,
      },
      {
        feeWon: policyBefore.locked_fee,
        freeThresholdWon: policyBefore.locked_threshold,
        cutoffTime: policyBefore.locked_cutoff,
      },
    );
    policyPromise.catch(() => {});
    await Promise.race([
      policyRowLocked.promise,
      policyPromise.then(() => { throw new Error('Policy committed before row lock barrier'); }),
    ]);
    policyProbe = await startConcurrentUpdate(pool,
      'SELECT id FROM shipping_policy_global WHERE id=1 FOR SHARE', []);
    policyProbe.done.catch(() => {});
    assert.equal(await waitForBlock(pool, policyProbe.pid, policyPid), true,
      'global policy writer must hold the policy row lock');

    releasePolicy.resolve();
    const policyAuditWaitedForOrder = await waitForBlock(pool, policyPid, orderPid);
    releaseOrder.resolve();
    const outcomes = await Promise.allSettled([orderPromise, policyPromise, policyProbe.done]);
    const failures = outcomes.slice(0, 2).filter(({ status }) => status === 'rejected')
      .map(({ reason }) => `${reason?.code ?? 'UNKNOWN'} ${reason?.message ?? reason}`);
    assert.deepEqual(failures, [], `order and policy transactions must both commit: ${failures.join('; ')}`);
    assert.equal(policyAuditWaitedForOrder, false,
      'policy audit FK must not wait for the order account lock');

    const saved = outcomes[0].value;
    const pooledCutoff = (await pool.query(`SELECT f.cutoff_time FROM shipment_fulfillments f
      JOIN shipment_orders s ON s.id=f.shipment_order_id
      WHERE s.checkout_order_id=$1 AND s.shipment_key='owool_fulfillment'`,
    [saved.id])).rows[0]?.cutoff_time;
    assert.equal(pooledCutoff, '12:00');
    assert.equal((await pool.query(`SELECT cutoff_time FROM shipping_policy_global
      WHERE id=1`)).rows[0].cutoff_time, '22:00');
  } finally {
    releasePolicy.resolve();
    releaseOrder.resolve();
    await Promise.allSettled([
      orderPromise, policyPromise, policyProbe?.done,
    ].filter(Boolean));
    await cleanupScenario(pool, scenario);
    await pool.end();
  }
});
