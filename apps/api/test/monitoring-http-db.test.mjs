import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { runFulfillmentUiFixture, fulfillmentUiEmails } from '../scripts/qa-fulfillment-ui-fixture.ts';
import { createApp } from '../src/app.ts';

const origin = 'http://127.0.0.1:9091';
const password = 'test-only-password-12345';
const runId = process.env.S54_MONITOR_RUN_ID;
const systemId = process.env.S54_MONITOR_TEST_DB_SYSTEM_ID;

test('admin monitoring aggregates paid orders per seller and denies other roles', {
  skip: !runId || !systemId,
}, async () => {
  const databaseUrl = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString: databaseUrl });
  let manifest;
  let app;
  try {
    manifest = await runFulfillmentUiFixture('seed', runId, databaseUrl, password, undefined, systemId);
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const emails = fulfillmentUiEmails(runId);
    async function login(email, role) {
      const response = await fetch(`${base}/auth/login`, {
        method: 'POST', headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });
      assert.equal(response.status, 201);
      return response.headers.get('set-cookie')?.split(';')[0];
    }
    const adminCookie = await login(emails[4], 'admin');
    const sellerCookie = await login(emails[1], 'seller');
    const customerCookie = await login(emails[0], 'customer');
    const path = '/admin/monitoring?from=2026-10-06&to=2026-10-06';
    for (const cookie of [sellerCookie, customerCookie]) {
      const denied = await fetch(`${base}${path}`, { headers: { cookie } });
      assert.equal(denied.status, 403);
    }
    const response = await fetch(`${base}${path}`, { headers: { cookie: adminCookie } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const all = await response.json();
    assert.deepEqual([all.summary.orderCount, all.summary.goodsSalesWon,
      all.summary.publishedOptionCount, all.summary.soldOutOptionCount, all.summary.claimCount],
    [3, 57000, 3, 0, 0]);
    assert.equal(all.unshipped.length, 2);
    assert.deepEqual(all.failedPayments, []);
    assert.ok(all.unshipped.every((item) => manifest.shipmentIds.includes(item.shipmentOrderId)));
    const seller = await fetch(`${base}${path}&sellerId=${manifest.sellerIds[0]}`,
      { headers: { cookie: adminCookie } });
    assert.equal(seller.status, 200);
    const scoped = await seller.json();
    assert.deepEqual([scoped.summary.orderCount, scoped.summary.goodsSalesWon,
      scoped.summary.publishedOptionCount, scoped.unshipped.length], [1, 23000, 1, 1]);
    const empty = await fetch(`${base}${path}&orderStatus=EXPIRED`,
      { headers: { cookie: adminCookie } });
    assert.equal(empty.status, 200);
    assert.equal((await empty.json()).summary.orderCount, 0);
    const invalid = await fetch(`${base}/admin/monitoring?from=2026-02-30&to=2026-03-01`,
      { headers: { cookie: adminCookie } });
    assert.equal(invalid.status, 400);
  } finally {
    if (app) await app.close();
    if (manifest) await runFulfillmentUiFixture('reset', runId, databaseUrl, password,
      JSON.stringify(manifest), systemId);
    await pool.end();
  }
});
