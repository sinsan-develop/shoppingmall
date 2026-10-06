import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import {
  fulfillmentUiDatabaseName,
  runFulfillmentUiFixture,
} from '../scripts/qa-fulfillment-ui-fixture.ts';

const databaseUrl = process.env.DATABASE_URL;
const systemId = process.env.S5_FULFILLMENT_UI_TEST_DB_SYSTEM_ID;
const runId = process.env.QA_RUN_ID ?? 'f5101006';
const password = process.env.QA_FIXTURE_PASSWORD ?? 'test-only-password-12345';

async function waitForLock(pool, predicate, label) {
  const deadline = Date.now() + 700;
  while (Date.now() < deadline) {
    const rows = (await pool.query(`SELECT pid,application_name,wait_event_type
      FROM pg_stat_activity WHERE datname=current_database()`)).rows;
    if (rows.some(predicate)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

test('fulfillment fixture refuses a foreign identity and leaves it intact, then resets to zero residue',
  { skip: !databaseUrl || !systemId }, async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    let manifest;
    try {
      assert.match(systemId, /^\d{10,}$/);
      const target = (await pool.query(`SELECT system_identifier::text AS "systemId",
        current_database() AS "databaseName" FROM pg_control_system()`)).rows[0];
      assert.deepEqual(target, {
        systemId,
        databaseName: fulfillmentUiDatabaseName(runId),
      });
      await assert.rejects(
        runFulfillmentUiFixture('seed', runId, databaseUrl, password, undefined, '999999999999'),
        /system identifier|target/i,
      );
      manifest = await runFulfillmentUiFixture('seed', runId, databaseUrl, password, undefined, systemId);
      assert.equal(manifest.accountIds.length, 5);
      assert.equal(manifest.sellerIds.length, 3);
      assert.equal(manifest.orderIds.length, 3);
      assert.equal(manifest.shipmentIds.length, 3);

      const foreignIdentifier = `qa+${runId}-foreign@example.invalid`;
      await pool.query(`INSERT INTO account_identities(id,account_id,kind,identifier)
        VALUES ($1,$2,'email',$3)`, [randomUUID(), manifest.accountIds[0], foreignIdentifier]);
      await assert.rejects(
        runFulfillmentUiFixture('reset', runId, databaseUrl, password, JSON.stringify(manifest), systemId),
        /foreign|ownership/i,
      );
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM account_identities WHERE identifier=$1',
        [foreignIdentifier])).rows[0].count, 1);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM checkout_orders WHERE id=ANY($1::uuid[])',
        [manifest.orderIds])).rows[0].count, 3);

      await pool.query('DELETE FROM account_identities WHERE identifier=$1', [foreignIdentifier]);
      const foreignAuditId = (await pool.query(`INSERT INTO audit_events
        (actor_account_id,active_role,action,target_type,target_id)
        VALUES ($1,'customer','qa.foreign','account',$2) RETURNING id`,
      [manifest.accountIds[0], randomUUID()])).rows[0].id;
      await assert.rejects(
        runFulfillmentUiFixture('reset', runId, databaseUrl, password, JSON.stringify(manifest), systemId),
        /foreign|ownership/i,
      );
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM audit_events WHERE id=$1',
        [foreignAuditId])).rows[0].count, 1);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM checkout_orders WHERE id=ANY($1::uuid[])',
        [manifest.orderIds])).rows[0].count, 3);
      await pool.query('DELETE FROM audit_events WHERE id=$1', [foreignAuditId]);

      const foreignCategoryId = (await pool.query(
        'INSERT INTO product_categories(name) VALUES ($1) RETURNING id',
        [`qa-${runId}-fulfillment-foreign-category`])).rows[0].id;
      await assert.rejects(
        runFulfillmentUiFixture('reset', runId, databaseUrl, password, JSON.stringify(manifest), systemId),
        /foreign|ownership/i,
      );
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM product_categories WHERE id=$1',
        [foreignCategoryId])).rows[0].count, 1);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM checkout_orders WHERE id=ANY($1::uuid[])',
        [manifest.orderIds])).rows[0].count, 3);
      await pool.query('DELETE FROM product_categories WHERE id=$1', [foreignCategoryId]);

      const qaPayment = (await pool.query(`SELECT a.id AS "attemptId",e.id AS "eventId"
        FROM payment_attempts a JOIN payment_events e ON e.payment_attempt_id=a.id
        WHERE a.checkout_order_id=$1`, [manifest.orderIds[0]])).rows[0];
      const foreignPaymentConflictId = (await pool.query(`INSERT INTO payment_event_conflicts
        (original_event_id,incoming_attempt_id,incoming_fingerprint,reason)
        VALUES ($1,$2,$3,'FINGERPRINT_MISMATCH') RETURNING id`,
      [qaPayment.eventId, qaPayment.attemptId, '9'.repeat(64)])).rows[0].id;
      await assert.rejects(
        runFulfillmentUiFixture('reset', runId, databaseUrl, password, JSON.stringify(manifest), systemId),
        /foreign payment conflict/i,
      );
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM payment_event_conflicts WHERE id=$1',
        [foreignPaymentConflictId])).rows[0].count, 1);
      await pool.query('DELETE FROM payment_event_conflicts WHERE id=$1', [foreignPaymentConflictId]);

      const blocker = await pool.connect();
      const lateWriter = await pool.connect();
      let reset;
      try {
        await blocker.query('BEGIN');
        await blocker.query('LOCK TABLE audit_events IN ACCESS EXCLUSIVE MODE');
        const resetTarget = new URL(databaseUrl);
        const resetApplication = `qa-fulfillment-reset-${runId}`;
        resetTarget.searchParams.set('application_name', resetApplication);
        const resetPromise = runFulfillmentUiFixture(
          'reset', runId, resetTarget.toString(), password, JSON.stringify(manifest), systemId);
        await waitForLock(pool, (row) => row.application_name === resetApplication &&
          row.wait_event_type === 'Lock', 'reset audit lock');
        const latePid = (await lateWriter.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const lateInsert = lateWriter.query(`INSERT INTO account_identities(id,account_id,kind,identifier)
          VALUES ($1,$2,'email',$3)`, [randomUUID(), manifest.accountIds[0],
          `qa+${runId}-late@example.invalid`]);
        await waitForLock(pool, (row) => row.pid === latePid && row.wait_event_type === 'Lock',
          'late foreign child lock');
        await blocker.query('COMMIT');
        reset = await resetPromise;
        await assert.rejects(lateInsert, (error) => error?.code === '23503');
      } finally {
        await blocker.query('ROLLBACK').catch(() => undefined);
        blocker.release();
        lateWriter.release();
      }
      assert.deepEqual(reset, { accounts: 5, sellers: 3, products: 3, orders: 3, shipments: 3 });

      const residue = (await pool.query(`SELECT
        (SELECT count(*)::int FROM accounts) AS accounts,
        (SELECT count(*)::int FROM account_identities) AS identities,
        (SELECT count(*)::int FROM account_roles) AS roles,
        (SELECT count(*)::int FROM sellers) AS sellers,
        (SELECT count(*)::int FROM seller_categories) AS seller_categories,
        (SELECT count(*)::int FROM product_categories) AS product_categories,
        (SELECT count(*)::int FROM products) AS products,
        (SELECT count(*)::int FROM product_revisions) AS revisions,
        (SELECT count(*)::int FROM product_options) AS options,
        (SELECT count(*)::int FROM product_publications) AS publications,
        (SELECT count(*)::int FROM inventory_levels) AS inventory,
        (SELECT count(*)::int FROM customer_addresses) AS addresses,
        (SELECT count(*)::int FROM checkout_reservations) AS reservations,
        (SELECT count(*)::int FROM checkout_reservation_lines) AS reservation_lines,
        (SELECT count(*)::int FROM checkout_orders) AS orders,
        (SELECT count(*)::int FROM order_status_events) AS order_events,
        (SELECT count(*)::int FROM shipment_orders) AS shipments,
        (SELECT count(*)::int FROM shipment_order_lines) AS shipment_lines,
        (SELECT count(*)::int FROM shipment_fulfillments) AS fulfillments,
        (SELECT count(*)::int FROM shipment_fulfillment_events) AS fulfillment_events,
        (SELECT count(*)::int FROM payment_attempts) AS payment_attempts,
        (SELECT count(*)::int FROM payment_events) AS payment_events,
        (SELECT count(*)::int FROM payment_event_conflicts) AS payment_conflicts,
        (SELECT count(*)::int FROM audit_events) AS audits,
        (SELECT count(*)::int FROM auth_sessions) AS sessions`)).rows[0];
      assert.ok(Object.values(residue).every((count) => count === 0), JSON.stringify(residue));
      const restoredSetting = (await pool.query(`SELECT owool_seller_id AS "owoolSellerId",
        updated_by AS "updatedBy",version,updated_at AS "updatedAt" FROM fulfillment_settings WHERE id=1`)).rows[0];
      assert.deepEqual({ ...restoredSetting, updatedAt: restoredSetting.updatedAt.toISOString() },
        manifest.previousFulfillmentSetting);
      manifest = undefined;
    } finally {
      if (manifest) {
        await runFulfillmentUiFixture('reset', runId, databaseUrl, password,
          JSON.stringify(manifest), systemId).catch(() => undefined);
      }
      await pool.end();
    }
  });
