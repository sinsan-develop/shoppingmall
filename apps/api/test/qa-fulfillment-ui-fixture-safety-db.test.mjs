import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import {
  fulfillmentUiDatabaseName,
  fulfillmentUiEmails,
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

      const emails = fulfillmentUiEmails(runId);
      const residue = (await pool.query(`SELECT
        (SELECT count(*)::int FROM account_identities WHERE identifier=ANY($1::text[])) AS accounts,
        (SELECT count(*)::int FROM checkout_orders WHERE id=ANY($2::uuid[])) AS orders,
        (SELECT count(*)::int FROM shipment_orders WHERE id=ANY($3::uuid[])) AS shipments`,
      [emails, manifest.orderIds, manifest.shipmentIds])).rows[0];
      assert.deepEqual(residue, { accounts: 0, orders: 0, shipments: 0 });
      manifest = undefined;
    } finally {
      if (manifest) {
        await runFulfillmentUiFixture('reset', runId, databaseUrl, password,
          JSON.stringify(manifest), systemId).catch(() => undefined);
      }
      await pool.end();
    }
  });
