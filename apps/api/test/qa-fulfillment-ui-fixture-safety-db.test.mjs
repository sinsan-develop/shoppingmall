import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import {
  fulfillmentUiEmails,
  runFulfillmentUiFixture,
} from '../scripts/qa-fulfillment-ui-fixture.ts';
import { assertOrderMutationQaTarget } from './order-schema-guard.mjs';

const databaseUrl = process.env.DATABASE_URL;
const systemId = process.env.S5_FULFILLMENT_UI_TEST_DB_SYSTEM_ID;
const runId = process.env.QA_RUN_ID ?? 'f5101006';
const password = process.env.QA_FIXTURE_PASSWORD ?? 'test-only-password-12345';

test('fulfillment fixture refuses a foreign identity and leaves it intact, then resets to zero residue',
  { skip: !databaseUrl || !systemId }, async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    let manifest;
    try {
      await assertOrderMutationQaTarget(pool, systemId);
      manifest = await runFulfillmentUiFixture('seed', runId, databaseUrl, password);
      assert.equal(manifest.accountIds.length, 5);
      assert.equal(manifest.sellerIds.length, 3);
      assert.equal(manifest.orderIds.length, 3);
      assert.equal(manifest.shipmentIds.length, 3);

      const foreignIdentifier = `qa+${runId}-foreign@example.invalid`;
      await pool.query(`INSERT INTO account_identities(id,account_id,kind,identifier)
        VALUES ($1,$2,'email',$3)`, [randomUUID(), manifest.accountIds[0], foreignIdentifier]);
      await assert.rejects(
        runFulfillmentUiFixture('reset', runId, databaseUrl, undefined, JSON.stringify(manifest)),
        /foreign|ownership/i,
      );
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM account_identities WHERE identifier=$1',
        [foreignIdentifier])).rows[0].count, 1);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM checkout_orders WHERE id=ANY($1::uuid[])',
        [manifest.orderIds])).rows[0].count, 3);

      await pool.query('DELETE FROM account_identities WHERE identifier=$1', [foreignIdentifier]);
      const reset = await runFulfillmentUiFixture(
        'reset', runId, databaseUrl, undefined, JSON.stringify(manifest));
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
        await runFulfillmentUiFixture('reset', runId, databaseUrl, undefined,
          JSON.stringify(manifest)).catch(() => undefined);
      }
      await pool.end();
    }
  });
