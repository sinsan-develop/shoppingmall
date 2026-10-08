import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
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
  const extras = { stock: null, question: null, claim: null };
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
    extras.stock = randomUUID();
    extras.question = randomUUID();
    extras.claim = randomUUID();
    await pool.query('UPDATE inventory_levels SET sellable_quantity=0 WHERE option_id=$1',
      [manifest.optionIds[0]]);
    await pool.query(`INSERT INTO stock_change_requests
      (id,option_id,target_on_hand,requested_by_account_id)
      VALUES ($1,$2,10,$3)`, [extras.stock, manifest.optionIds[0], manifest.accountIds[1]]);
    await pool.query(`INSERT INTO support_questions
      (id,product_id,customer_account_id,seller_id,body,idempotency_key,created_at)
      VALUES ($1,$2,$3,$4,'QA 문의',$5,'2026-10-06T06:00:00Z')`,
    [extras.question, manifest.productIds[0], manifest.accountIds[0],
      manifest.sellerIds[0], randomUUID()]);
    await pool.query(`INSERT INTO support_claims
      (id,checkout_order_id,shipment_order_id,option_id,product_id,customer_account_id,
       seller_id,kind,reason_code,reason,quantity,idempotency_key,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'CLAIM','quality_issue','QA 품질',$8,$9,'2026-10-06T06:00:00Z')`,
    [extras.claim, manifest.orderIds[0], manifest.shipmentIds[0], manifest.optionIds[0],
      manifest.productIds[0], manifest.accountIds[0], manifest.sellerIds[0], 1, randomUUID()]);
    const withExceptions = await fetch(`${base}${path}`, { headers: { cookie: adminCookie } });
    assert.equal(withExceptions.status, 200);
    const observed = await withExceptions.json();
    assert.equal(observed.summary.soldOutOptionCount, 1);
    assert.equal(observed.summary.pendingApprovalCount, 1);
    assert.equal(observed.summary.openQuestionCount, 1);
    assert.equal(observed.summary.claimCount, 1);
    assert.equal(observed.stockIssues[0].optionId, manifest.optionIds[0]);
    assert.equal(observed.pendingApprovals[0].id, extras.stock);
    assert.equal(observed.openQuestions[0].id, extras.question);
    assert.equal(observed.openClaims[0].id, extras.claim);
    const wrongSeller = await fetch(`${base}${path}&sellerId=${manifest.sellerIds[1]}`,
      { headers: { cookie: adminCookie } });
    const other = await wrongSeller.json();
    assert.deepEqual([other.summary.soldOutOptionCount, other.summary.pendingApprovalCount,
      other.summary.openQuestionCount, other.summary.claimCount], [0, 0, 0, 0]);
    assert.deepEqual([other.stockIssues, other.pendingApprovals, other.openQuestions,
      other.openClaims], [[], [], [], []]);
  } finally {
    if (app) await app.close();
    if (extras.claim) await pool.query('DELETE FROM support_claims WHERE id=$1', [extras.claim]);
    if (extras.question) await pool.query('DELETE FROM support_questions WHERE id=$1', [extras.question]);
    if (extras.stock) await pool.query('DELETE FROM stock_change_requests WHERE id=$1', [extras.stock]);
    if (manifest) await runFulfillmentUiFixture('reset', runId, databaseUrl, password,
      JSON.stringify(manifest), systemId);
    await pool.end();
  }
});
