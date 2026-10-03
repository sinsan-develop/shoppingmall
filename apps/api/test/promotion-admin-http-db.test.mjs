import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { qaNames, runQaFixture } from '../scripts/qa-fixture.ts';

const origin = 'http://127.0.0.1:9091';
const password = 'test-only-password-12345';

test('admin may create, version, issue and stop one campaign while role and Origin controls hold', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomBytes(4).toString('hex');
  const names = qaNames(runId);
  const title = `QA-${runId}-discount`;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let app; let seeded = false; let adminId; let extraBuyerId;
  try {
    await runQaFixture('seed', runId, process.env.DATABASE_URL, password);
    seeded = true;
    adminId = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [names.emails[4]])).rows[0].account_id;
    const customerId = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [names.emails[0]])).rows[0].account_id;
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    async function cookieFor(email, role) {
      const response = await fetch(`${base}/auth/login`, { method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, role }) });
      assert.equal(response.status, 201);
      return response.headers.get('set-cookie')?.split(';')[0];
    }
    const admin = await cookieFor(names.emails[4], 'admin');
    const customer = await cookieFor(names.emails[0], 'customer');
    const seller = await cookieFor(names.emails[1], 'seller');
    const path = `${base}/promotions/admin/campaigns`;
    const code = `QA${runId.toUpperCase()}`;
    const campaign = { title, kind: 'goods_discount', scope: 'all', targetIds: [],
      startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2027-01-01T00:00:00.000Z',
      minimumEligibleGoodsWon: 0, amountKind: 'fixed', amountValue: 3000,
      maxDiscountWon: null, directIssueLimit: 1, totalUseLimit: 2, perAccountUseLimit: 1, code };
    const post = (url, body, cookie = admin, requestOrigin = origin, key) => fetch(url, { method: 'POST',
      headers: { cookie, origin: requestOrigin, 'content-type': 'application/json',
        ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body) });

    assert.equal((await post(path, campaign, undefined, 'http://invalid.test')).status, 403);
    assert.equal((await post(path, campaign, customer)).status, 403);
    assert.equal((await post(path, campaign, seller)).status, 403);
    assert.equal((await fetch(path)).status, 401);
    assert.equal((await post(path, { ...campaign, title: `QA-${runId}-unknown-seller`,
      scope: 'sellers', targetIds: [randomUUID()], code: `S${code}` })).status, 400);
    assert.equal((await post(path, { ...campaign, title: `QA-${runId}-unknown-option`,
      scope: 'options', targetIds: [randomUUID()], code: `O${code}` })).status, 400);
    const created = await post(path, campaign);
    assert.equal(created.status, 201);
    const first = await created.json();
    assert.ok(first.id && first.versionId);
    const listed = await fetch(path, { headers: { cookie: admin } });
    assert.equal(listed.status, 200);
    const listedCampaign = (await listed.json()).find((item) => item.id === first.id);
    assert.ok(listedCampaign);
    assert.equal(listedCampaign.amountValue, 3000);
    assert.equal(listedCampaign.totalUseLimit, 2);
    assert.equal(listedCampaign.directIssuedCount, 0);
    assert.equal(listedCampaign.activeUseCount, 0);
    assert.equal(listedCampaign.startsAt, campaign.startsAt);

    const issueKey = randomUUID();
    const grantsPath = `${path}/${first.id}/grants`;
    const issued = await post(grantsPath, { accountId: customerId, reason: 'QA direct issue' }, admin, origin, issueKey);
    assert.equal(issued.status, 201);
    const grant = await issued.json();
    assert.ok(grant.id);
    const retry = await post(grantsPath, { accountId: customerId, reason: 'QA direct issue' }, admin, origin, issueKey);
    assert.equal(retry.status, 201);
    assert.equal((await retry.json()).id, grant.id);
    extraBuyerId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await pool.query("INSERT INTO account_roles(account_id,role) VALUES ($1,'customer')", [extraBuyerId]);
    assert.equal((await post(grantsPath, { accountId: extraBuyerId, reason: 'over direct limit' },
      admin, origin, randomUUID())).status, 409);
    const sellerAccountId = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [names.emails[1]])).rows[0].account_id;
    assert.equal((await post(grantsPath, { accountId: sellerAccountId, reason: 'seller issue' },
      admin, origin, randomUUID())).status, 400);
    const oldVersion = (await pool.query('SELECT version_id FROM promotion_grants WHERE id=$1', [grant.id])).rows[0].version_id;
    assert.equal(oldVersion, first.versionId);

    const newVersion = await post(`${path}/${first.id}/versions`,
      { ...campaign, amountValue: 4000, code: `${code}V2` });
    assert.equal(newVersion.status, 201);
    const second = await newVersion.json();
    assert.notEqual(second.versionId, first.versionId);
    assert.equal((await pool.query('SELECT version_id FROM promotion_grants WHERE id=$1', [grant.id])).rows[0].version_id,
      first.versionId);
    assert.equal((await post(`${path}/${first.id}/versions`, { ...campaign, code })).status, 409);
    assert.equal((await post(`${path}/${first.id}/stop`, { reason: 'QA end' })).status, 201);
    assert.equal((await post(grantsPath, { accountId: customerId, reason: 'late issue' }, admin,
      origin, randomUUID())).status, 409);
    const stoppedRetry = await post(grantsPath, { accountId: customerId, reason: 'QA direct issue' },
      admin, origin, issueKey);
    assert.equal(stoppedRetry.status, 201);
    assert.equal((await stoppedRetry.json()).id, grant.id);
    const actions = (await pool.query("SELECT action FROM audit_events WHERE actor_account_id=$1 AND action LIKE 'promotion.%' ORDER BY occurred_at,id",
      [adminId])).rows.map((row) => row.action);
    assert.deepEqual(actions, ['promotion.campaign_created', 'promotion.grant_issued',
      'promotion.version_created', 'promotion.campaign_stopped']);
  } finally {
    if (app) await app.close();
    if (seeded) {
      const campaigns = (await pool.query('SELECT id FROM promotion_campaigns WHERE title LIKE $1',
        [`QA-${runId}-%`])).rows.map((row) => row.id);
      if (campaigns.length) {
        await pool.query('DELETE FROM promotion_uses WHERE campaign_id=ANY($1::uuid[])', [campaigns]);
        await pool.query('DELETE FROM promotion_grants WHERE version_id IN (SELECT id FROM promotion_versions WHERE campaign_id=ANY($1::uuid[]))', [campaigns]);
        await pool.query('DELETE FROM promotion_codes WHERE version_id IN (SELECT id FROM promotion_versions WHERE campaign_id=ANY($1::uuid[]))', [campaigns]);
        await pool.query('DELETE FROM promotion_versions WHERE campaign_id=ANY($1::uuid[])', [campaigns]);
        await pool.query('DELETE FROM promotion_campaigns WHERE id=ANY($1::uuid[])', [campaigns]);
      }
      if (adminId) await pool.query("DELETE FROM audit_events WHERE actor_account_id=$1 AND action LIKE 'promotion.%'", [adminId]);
      if (extraBuyerId) {
        await pool.query('DELETE FROM account_roles WHERE account_id=$1', [extraBuyerId]);
        await pool.query('DELETE FROM accounts WHERE id=$1', [extraBuyerId]);
      }
      await runQaFixture('reset', runId, process.env.DATABASE_URL);
    }
    await pool.end();
  }
});
