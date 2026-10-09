import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { createApp } from '../src/app.ts';

const origin = 'http://127.0.0.1:9091';
const password = 'test-only-password-12345';

test('actual HTTP confines settlement reads to role and seller, with admin-only individual completion', {
  skip: !process.env.S6_EVENT_TEST_DB_SYSTEM_ID,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let app;
  try {
    const identity = (await pool.query('SELECT system_identifier::text AS id FROM pg_control_system()'))
      .rows[0].id;
    assert.equal(identity, process.env.S6_EVENT_TEST_DB_SYSTEM_ID);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations'))
      .rows[0].n, 22);
    const runId = process.env.S6_BROWSER_QA_RUN_ID ?? randomBytes(4).toString('hex');
    const names = qaNames(runId);
    await runQaCatalogFixture('seed', runId, process.env.DATABASE_URL, password);
    const adminId = (await pool.query(`SELECT account_id AS id FROM account_identities
      WHERE identifier=$1`, [names.emails[4]])).rows[0].id;
    const sellers = (await pool.query(`SELECT id,display_name AS name,category_id AS "categoryId"
      FROM sellers WHERE display_name=ANY($1::text[])`, [[names.sellerA, names.sellerB]]))
      .rows;
    const a = sellers.find((row) => row.name === names.sellerA);
    const b = sellers.find((row) => row.name === names.sellerB);
    assert.ok(a && b);
    const otherCategory = (await pool.query(`INSERT INTO seller_categories(name)
      VALUES ($1) RETURNING id`, [`qa-${runId}-other-sellers`])).rows[0].id;
    await pool.query('UPDATE sellers SET category_id=$1 WHERE id=$2', [otherCategory, b.id]);
    b.categoryId = otherCategory;
    for (const [seller, amount] of [[a, 12000], [b, 7000]]) {
      const eventId = randomUUID();
      await pool.query(`INSERT INTO settlement_events
        (dedupe_key,kind,amount_won,occurred_at,seller_id,seller_name,
         seller_category_id,seller_category_name,source_event_kind,source_event_id,
         recorded_by,reason)
        SELECT $1,'commission',$2,'2026-05-01T00:00:00Z',$3,$4,
          category.id,category.name,'manual_commission',$5,$6,'QA 근거'
        FROM seller_categories category WHERE category.id=$7`,
      [`qa:${eventId}`, amount, seller.id, seller.name, eventId, adminId, seller.categoryId]);
    }
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    async function login(email, role) {
      const response = await fetch(`${base}/auth/login`, { method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, role }) });
      assert.equal(response.status, 201);
      return response.headers.get('set-cookie')?.split(';')[0];
    }
    const admin = await login(names.emails[4], 'admin');
    const sellerA = await login(names.emails[1], 'seller');
    const customer = await login(names.emails[0], 'customer');
    const period = '?from=2026-05-01&to=2026-05-20';
    const adminPath = `${base}/admin/settlement${period}`;
    const sellerPath = `${base}/seller/settlement${period}`;
    assert.equal((await fetch(adminPath, { headers: { cookie: sellerA } })).status, 403);
    assert.equal((await fetch(sellerPath, { headers: { cookie: customer } })).status, 403);
    const allResponse = await fetch(adminPath, { headers: { cookie: admin } });
    assert.equal(allResponse.status, 200);
    assert.match(allResponse.headers.get('cache-control'), /no-store/);
    const all = await allResponse.json();
    assert.equal(all.groups.length, 2);
    assert.equal(all.totals.commission, 19000);
    const categoryResponse = await fetch(`${adminPath}&categoryId=${a.categoryId}`,
      { headers: { cookie: admin } });
    assert.equal(categoryResponse.status, 200);
    assert.deepEqual((await categoryResponse.json()).groups.map((group) => group.sellerId), [a.id]);
    const individualResponse = await fetch(`${adminPath}&sellerId=${b.id}`,
      { headers: { cookie: admin } });
    assert.equal(individualResponse.status, 200);
    assert.deepEqual((await individualResponse.json()).groups.map((group) => group.sellerId), [b.id]);
    const ownResponse = await fetch(sellerPath, { headers: { cookie: sellerA } });
    assert.equal(ownResponse.status, 200);
    const own = await ownResponse.json();
    assert.deepEqual(own.groups.map((group) => group.sellerId), [a.id]);
    assert.equal(own.totals.commission, 12000);
    assert.equal((await fetch(`${sellerPath}&sellerId=${b.id}`,
      { headers: { cookie: sellerA } })).status, 400);
    const completionPath = `${base}/admin/settlement/completions`;
    const body = JSON.stringify({ sellerId: a.id, from: '2026-05-01',
      to: '2026-05-20', reason: 'QA 오프라인 확인' });
    for (const cookie of [sellerA, customer]) {
      assert.equal((await fetch(completionPath, { method: 'POST',
        headers: { cookie, origin, 'content-type': 'application/json' }, body })).status, 403);
    }
    const completed = await fetch(completionPath, { method: 'POST',
      headers: { cookie: admin, origin, 'content-type': 'application/json' }, body });
    assert.equal(completed.status, 201);
    assert.equal((await completed.json()).sellerId, a.id);
    assert.equal((await fetch(completionPath, { method: 'POST',
      headers: { cookie: admin, origin, 'content-type': 'application/json' }, body })).status, 409);
    const afterCompletion = await fetch(adminPath, { headers: { cookie: admin } });
    assert.equal(afterCompletion.status, 200);
    assert.deepEqual((await afterCompletion.json()).completions.map(({ sellerId }) => sellerId), [a.id]);
    const sellerAfterCompletion = await fetch(sellerPath, { headers: { cookie: sellerA } });
    assert.equal(sellerAfterCompletion.status, 200);
    assert.deepEqual((await sellerAfterCompletion.json()).completions.map(({ sellerId }) => sellerId), [a.id]);
    const commissionPath = `${base}/admin/settlement/commissions`;
    const manual = { sellerId: a.id, requestId: randomUUID(), amountWon: 1300,
      occurredAt: '2026-05-02T00:00:00.000Z', reason: '뒤늦은 5월 수수료' };
    const commissionHeaders = { origin, 'content-type': 'application/json' };
    assert.equal((await fetch(commissionPath, { method: 'POST',
      headers: { ...commissionHeaders, cookie: sellerA }, body: JSON.stringify(manual) })).status, 403);
    const firstCommission = await fetch(commissionPath, { method: 'POST',
      headers: { ...commissionHeaders, cookie: admin }, body: JSON.stringify(manual) });
    assert.equal(firstCommission.status, 201);
    const commissionId = (await firstCommission.json()).id;
    const repeatedCommission = await fetch(commissionPath, { method: 'POST',
      headers: { ...commissionHeaders, cookie: admin }, body: JSON.stringify(manual) });
    assert.equal(repeatedCommission.status, 201);
    assert.equal((await repeatedCommission.json()).id, commissionId);
    assert.equal((await fetch(commissionPath, { method: 'POST',
      headers: { ...commissionHeaders, cookie: admin },
      body: JSON.stringify({ ...manual, amountWon: 1400 }) })).status, 409);
    const frozenReport = await (await fetch(adminPath, { headers: { cookie: admin } })).json();
    assert.equal(frozenReport.totals.commission, 19000);
    assert.equal(frozenReport.lateTotals.commission, 1300);
    assert.equal(frozenReport.completions[0].frozenTotals.commission, 12000);
    assert.deepEqual(frozenReport.lateGroups.map(({ sellerId }) => sellerId), [a.id]);
    const sellerFrozen = await (await fetch(sellerPath, { headers: { cookie: sellerA } })).json();
    assert.equal(sellerFrozen.lateTotals.commission, 1300);
    const rows = (await pool.query(`SELECT seller_id AS "sellerId" FROM seller_settlement_periods`))
      .rows;
    assert.deepEqual(rows, [{ sellerId: a.id }]);
  } finally {
    if (app) await app.close();
    await pool.end();
    // The one-use tmpfs DB is removed as a whole, preserving immutable ledger semantics.
  }
});
