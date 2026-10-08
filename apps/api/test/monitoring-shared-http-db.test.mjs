import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { qaNames, runQaFixture } from '../scripts/qa-fixture.ts';
import { createApp } from '../src/app.ts';

const runId = process.env.S54_SHARED_RUN_ID;
const password = 'test-only-password-12345';
test('shared shoppingmall DB serves empty monitoring safely to admin only', {
  skip: !runId,
}, async () => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.equal(new URL(databaseUrl).pathname, '/shoppingmall');
  const pool = new Pool({ connectionString: databaseUrl });
  let seeded = false;
  let app;
  try {
    const baseline = (await pool.query(`SELECT
      (SELECT count(*) FROM accounts)::integer AS accounts,
      (SELECT count(*) FROM checkout_orders)::integer AS orders,
      (SELECT count(*) FROM products)::integer AS products`)).rows[0];
    assert.deepEqual(baseline, { accounts: 0, orders: 0, products: 0 });
    await runQaFixture('seed', runId, databaseUrl, password);
    seeded = true;
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    async function cookie(email, role) {
      const response = await fetch(`${base}/auth/login`, { method: 'POST',
        headers: { origin: 'http://127.0.0.1:9091', 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, role }) });
      assert.equal(response.status, 201);
      return response.headers.get('set-cookie')?.split(';')[0];
    }
    const emails = qaNames(runId).emails;
    const admin = await cookie(emails[4], 'admin');
    const seller = await cookie(emails[1], 'seller');
    const path = '/admin/monitoring?from=2026-10-06&to=2026-10-06';
    assert.equal((await fetch(`${base}${path}`, { headers: { cookie: seller } })).status, 403);
    const response = await fetch(`${base}${path}`, { headers: { cookie: admin } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const overview = await response.json();
    assert.deepEqual(overview.summary, { orderCount: 0, goodsSalesWon: 0,
      publishedOptionCount: 0, soldOutOptionCount: 0, claimCount: 0,
      pendingApprovalCount: 0, openQuestionCount: 0 });
    for (const key of ['failedPayments','unshipped','pendingApprovals','stockIssues',
      'openQuestions','openClaims']) assert.deepEqual(overview[key], []);
  } finally {
    if (app) await app.close();
    if (seeded) await runQaFixture('reset', runId, databaseUrl);
    await pool.end();
  }
});
