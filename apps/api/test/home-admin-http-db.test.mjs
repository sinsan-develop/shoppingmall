import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { qaNames, runQaFixture } from '../scripts/qa-fixture.ts';
import { runQaPublicFixture } from '../scripts/qa-public-fixture.ts';

const origin = 'http://127.0.0.1:9091';
const password = 'test-only-password-12345';

test('only an admin session may save a versioned home draft without publishing it', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomBytes(4).toString('hex');
  const names = qaNames(runId);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let app;
  let seeded = false;
  let initial;
  try {
    const draft = await pool.query('SELECT version,payload,updated_by_account_id FROM home_content_draft WHERE id=1');
    assert.equal(draft.rows.length, 1);
    initial = draft.rows[0];
    assert.deepEqual(initial.payload, { menu: [], events: [], recommendations: [] });
    const pointerBefore = (await pool.query('SELECT publication_id FROM home_content_current WHERE id=1')).rows[0].publication_id;
    await runQaFixture('seed', runId, process.env.DATABASE_URL, password);
    seeded = true;
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    async function cookieFor(email, role) {
      const response = await fetch(`${base}/auth/login`, { method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });
      assert.equal(response.status, 201);
      return response.headers.get('set-cookie')?.split(';')[0];
    }
    const customer = await cookieFor(names.emails[0], 'customer');
    const seller = await cookieFor(names.emails[1], 'seller');
    const admin = await cookieFor(names.emails[4], 'admin');
    const adminAccountId = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [names.emails[4]])).rows[0].account_id;
    const sellerId = (await pool.query('SELECT id FROM sellers WHERE display_name=$1', [names.sellerA])).rows[0].id;
    await pool.query('INSERT INTO account_roles(account_id,role,seller_id) VALUES ($1,$2,$3)',
      [adminAccountId, 'seller', sellerId]);
    const adminAsSeller = await cookieFor(names.emails[4], 'seller');
    const path = `${base}/home/admin/draft`;
    assert.equal((await fetch(path)).status, 401);
    assert.equal((await fetch(path, { headers: { cookie: customer } })).status, 403);
    assert.equal((await fetch(path, { headers: { cookie: seller } })).status, 403);
    assert.equal((await fetch(path, { headers: { cookie: adminAsSeller } })).status, 403);
    const before = await fetch(path, { headers: { cookie: admin } });
    assert.equal(before.status, 200);
    assert.deepEqual(await before.json(), { version: initial.version, payload: initial.payload });
    const body = JSON.stringify({ version: initial.version, payload: initial.payload });
    const put = (requestOrigin = origin) => fetch(path, { method: 'PUT',
      headers: { cookie: admin, origin: requestOrigin, 'content-type': 'application/json' }, body,
    });
    assert.equal((await put('http://invalid.test')).status, 403);
    const saved = await put();
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), { version: initial.version + 1, payload: initial.payload });
    assert.equal((await put()).status, 409);
    assert.equal((await pool.query('SELECT publication_id FROM home_content_current WHERE id=1')).rows[0].publication_id,
      pointerBefore);
    const audit = await pool.query(
      "SELECT action,active_role FROM audit_events WHERE actor_account_id=$1 AND action='home.draft_saved'", [adminAccountId]);
    assert.deepEqual(audit.rows, [{ action: 'home.draft_saved', active_role: 'admin' }]);
  } finally {
    if (app) await app.close();
    if (initial) await pool.query(
      'UPDATE home_content_draft SET version=$1,payload=$2,updated_by_account_id=$3 WHERE id=1',
      [initial.version, initial.payload, initial.updated_by_account_id],
    );
    if (seeded) await runQaFixture('reset', runId, process.env.DATABASE_URL);
    await pool.end();
  }
});

test('admin previews, publishes and restores immutable home snapshots with audit history', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomBytes(4).toString('hex');
  const names = qaNames(runId);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let app;
  let seeded = false;
  let adminAccountId;
  let initialDraft;
  let initialCurrent;
  try {
    initialDraft = (await pool.query(
      'SELECT version,payload,updated_by_account_id FROM home_content_draft WHERE id=1')).rows[0];
    initialCurrent = (await pool.query('SELECT publication_id FROM home_content_current WHERE id=1')).rows[0].publication_id;
    assert.deepEqual(initialDraft.payload, { menu: [], events: [], recommendations: [] });
    const { productId } = await runQaPublicFixture('seed', runId, process.env.DATABASE_URL, password);
    seeded = true;
    adminAccountId = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [names.emails[4]])).rows[0].account_id;
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const login = await fetch(`${base}/auth/login`, { method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: names.emails[4], password, role: 'admin' }),
    });
    assert.equal(login.status, 201);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    const headers = { cookie, origin, 'content-type': 'application/json' };
    const eventId = randomUUID();
    const event = { id: eventId, title: '제철 기획전', description: '정성껏 고른 상품', displayOrder: 0,
      startAt: new Date(Date.now() - 3600000).toISOString(),
      endAt: new Date(Date.now() + 86400000).toISOString(),
      productIds: [productId], heroProductId: productId, heroImageId: null };
    const futureId = randomUUID();
    const future = { ...event, id: futureId, title: '다음 기획전', displayOrder: 1,
      startAt: new Date(Date.now() + 3600000).toISOString(),
      endAt: new Date(Date.now() + 7200000).toISOString() };
    const futureMenuId = randomUUID();
    const hiddenMenuId = randomUUID();
    const firstPayload = { menu: [
      { id: randomUUID(), label: '기획전', displayOrder: 0, visible: true, target: { type: 'event', id: eventId } },
      { id: futureMenuId, label: '다음', displayOrder: 1, visible: true, target: { type: 'event', id: futureId } },
      { id: hiddenMenuId, label: '숨김', displayOrder: 2, visible: false, target: { type: 'catalog' } },
    ], events: [event, future], recommendations: [productId] };
    const save = (version, payload) => fetch(`${base}/home/admin/draft`, { method: 'PUT', headers,
      body: JSON.stringify({ version, payload }),
    });
    const firstSave = await save(initialDraft.version, firstPayload);
    assert.equal(firstSave.status, 200);
    const firstVersion = (await firstSave.json()).version;
    const preview = await fetch(`${base}/home/admin/preview`, { headers: { cookie } });
    assert.equal(preview.status, 200);
    const previewBody = await preview.json();
    assert.equal(previewBody.payload.events[0].id, eventId);
    assert.ok(previewBody.excluded.some((item) => item.kind === 'event' && item.id === futureId
      && item.reason === 'not_started'));
    assert.ok(previewBody.excluded.some((item) => item.kind === 'menu' && item.id === futureMenuId
      && item.reason === 'inactive_event'));
    assert.ok(previewBody.excluded.some((item) => item.kind === 'menu' && item.id === hiddenMenuId
      && item.reason === 'hidden'));
    const publish = (version) => fetch(`${base}/home/admin/publish`, { method: 'POST', headers,
      body: JSON.stringify({ version }),
    });
    const firstPublished = await publish(firstVersion);
    assert.equal(firstPublished.status, 201);
    const firstId = (await firstPublished.json()).publicationId;
    assert.equal((await pool.query('SELECT publication_id FROM home_content_current WHERE id=1')).rows[0].publication_id,
      firstId);
    const secondSave = await save(firstVersion, { menu: [], events: [], recommendations: [] });
    assert.equal(secondSave.status, 200);
    const secondVersion = (await secondSave.json()).version;
    const secondPublished = await publish(secondVersion);
    assert.equal(secondPublished.status, 201);
    const secondId = (await secondPublished.json()).publicationId;
    assert.notEqual(secondId, firstId);
    const history = await fetch(`${base}/home/admin/history`, { headers: { cookie } });
    assert.equal(history.status, 200);
    assert.deepEqual((await history.json()).slice(0, 2).map((entry) => entry.id), [secondId, firstId]);
    const restored = await fetch(`${base}/home/admin/restore/${firstId}`, { method: 'POST', headers });
    assert.equal(restored.status, 201);
    assert.equal((await pool.query('SELECT publication_id FROM home_content_current WHERE id=1')).rows[0].publication_id,
      firstId);
    const original = (await pool.query('SELECT payload FROM home_content_publications WHERE id=$1', [firstId])).rows[0];
    assert.deepEqual(original.payload, firstPayload);
    const audit = await pool.query(
      "SELECT action,active_role,details FROM audit_events WHERE actor_account_id=$1 AND action LIKE 'home.%' ORDER BY occurred_at,id",
      [adminAccountId]);
    assert.equal(audit.rows.filter((row) => row.action === 'home.published').length, 2);
    assert.equal(audit.rows.filter((row) => row.action === 'home.restored').length, 1);
    assert.ok(audit.rows.every((row) => row.active_role === 'admin'));
    assert.deepEqual(audit.rows.find((row) => row.action === 'home.restored').details,
      { previousPublicationId: secondId, publicationId: firstId });
    const unavailableId = randomUUID();
    const invalidPayload = { ...firstPayload, events: [{ ...event,
      productIds: [unavailableId], heroProductId: unavailableId }, future] };
    const invalidSaved = await save(secondVersion, invalidPayload);
    assert.equal(invalidSaved.status, 200);
    const invalidVersion = (await invalidSaved.json()).version;
    const excludedPreview = await fetch(`${base}/home/admin/preview`, { headers: { cookie } });
    assert.equal(excludedPreview.status, 200);
    assert.ok((await excludedPreview.json()).excluded.some((item) => item.id === eventId));
    assert.equal((await publish(invalidVersion)).status, 400);
    assert.equal((await pool.query('SELECT publication_id FROM home_content_current WHERE id=1')).rows[0].publication_id,
      firstId);
    const [racingA, racingB] = await Promise.all([
      save(invalidVersion, firstPayload), save(invalidVersion, { menu: [], events: [], recommendations: [] }),
    ]);
    assert.deepEqual([racingA.status, racingB.status].sort(), [200, 409]);
    assert.equal((await pool.query('SELECT version FROM home_content_draft WHERE id=1')).rows[0].version,
      invalidVersion + 1);
    const revisionId = (await pool.query(
      'SELECT revision_id FROM product_publications WHERE product_id=$1', [productId],
    )).rows[0].revision_id;
    const detailImageId = (await pool.query(
      `INSERT INTO product_images(revision_id,object_key,purpose,mime_type,size_bytes,display_order)
       VALUES ($1,$2,'detail','image/webp',100,0) RETURNING id`,
      [revisionId, `qa/${runId}/home-detail.webp`],
    )).rows[0].id;
    const detailPayload = { ...firstPayload, events: [{ ...event, heroImageId: detailImageId }, future] };
    const detailSaved = await save(invalidVersion + 1, detailPayload);
    assert.equal(detailSaved.status, 200);
    const detailVersion = (await detailSaved.json()).version;
    const detailPreview = await fetch(`${base}/home/admin/preview`, { headers: { cookie } });
    assert.ok((await detailPreview.json()).excluded.some((item) => item.kind === 'event'
      && item.id === eventId && item.reason === 'invalid_hero_image'));
    assert.equal((await publish(detailVersion)).status, 400);
  } finally {
    if (app) await app.close();
    if (initialDraft && adminAccountId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE home_content_current SET publication_id=$1 WHERE id=1', [initialCurrent]);
        await client.query(
          'UPDATE home_content_draft SET version=$1,payload=$2,updated_by_account_id=$3 WHERE id=1',
          [initialDraft.version, initialDraft.payload, initialDraft.updated_by_account_id]);
        await client.query('DELETE FROM home_content_publications WHERE published_by_account_id=$1', [adminAccountId]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    if (seeded) await runQaPublicFixture('reset', runId, process.env.DATABASE_URL);
    await pool.end();
  }
});
