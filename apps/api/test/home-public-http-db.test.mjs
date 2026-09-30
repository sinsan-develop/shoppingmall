import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaPublicFixture } from '../scripts/qa-public-fixture.ts';

test('public home reads only the published snapshot and live sellable products', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomBytes(4).toString('hex');
  const names = qaNames(runId);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let app;
  let seeded = false;
  let actorId;
  let initialDraft;
  let initialCurrent;
  try {
    initialDraft = (await pool.query(
      'SELECT version,payload,updated_by_account_id FROM home_content_draft WHERE id=1')).rows[0];
    initialCurrent = (await pool.query('SELECT publication_id FROM home_content_current WHERE id=1')).rows[0].publication_id;
    assert.deepEqual(initialDraft.payload, { menu: [], events: [], recommendations: [] });
    assert.equal(initialCurrent, null);
    const fixture = await runQaPublicFixture('seed', runId, process.env.DATABASE_URL, 'test-only-password-12345', 2);
    seeded = true;
    actorId = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [names.emails[4]])).rows[0].account_id;
    const ids = (await pool.query(`SELECT p.id FROM products p JOIN sellers s ON s.id=p.seller_id
      WHERE s.display_name=$1 ORDER BY p.id`, [names.sellerA])).rows.map((row) => row.id);
    assert.equal(ids.length, 2);
    const [firstId, secondId] = [ids.find((id) => id !== fixture.productId), fixture.productId];
    const eventId = randomUUID();
    const laterId = randomUUID();
    const expiredId = randomUUID();
    const now = Date.now();
    const active = { id: eventId, title: '제철 모음', description: '현재 상품', displayOrder: 2,
      startAt: new Date(now - 3600000).toISOString(), endAt: new Date(now + 3600000).toISOString(),
      productIds: [secondId, firstId], heroProductId: secondId, heroImageId: null };
    const later = { ...active, id: laterId, title: '다음 기획전', displayOrder: 0,
      startAt: new Date(now + 3600000).toISOString(), endAt: new Date(now + 7200000).toISOString() };
    const expired = { ...active, id: expiredId, title: '지난 기획전', displayOrder: 1,
      startAt: new Date(now - 7200000).toISOString(), endAt: new Date(now - 3600000).toISOString() };
    const menu = [
      { id: randomUUID(), label: '제철 모음', displayOrder: 2, visible: true, target: { type: 'event', id: eventId } },
      { id: randomUUID(), label: '다음 기획전', displayOrder: 0, visible: true, target: { type: 'event', id: laterId } },
      { id: randomUUID(), label: '가려진 메뉴', displayOrder: 1, visible: false, target: { type: 'catalog' } },
      { id: randomUUID(), label: '상품', displayOrder: 3, visible: true, target: { type: 'product', id: firstId } },
    ];
    const payload = { menu, events: [later, active, expired], recommendations: [secondId, firstId] };
    await pool.query('UPDATE home_content_draft SET payload=$1,updated_by_account_id=$2 WHERE id=1',
      [payload, actorId]);
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const read = async (path) => {
      const response = await fetch(`${base}${path}`);
      return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
    };
    assert.deepEqual((await read('/home/content')).body, { menu: [], events: [], recommendations: [] });
    assert.equal((await read(`/home/events/${eventId}`)).body.status, 'unavailable');
    const publicationId = (await pool.query(
      'INSERT INTO home_content_publications(payload,published_by_account_id) VALUES ($1,$2) RETURNING id',
      [payload, actorId])).rows[0].id;
    await pool.query('UPDATE home_content_current SET publication_id=$1 WHERE id=1', [publicationId]);
    const home = await read('/home/content');
    assert.equal(home.status, 200);
    assert.match(home.cache, /no-store/);
    assert.deepEqual(home.body.menu.map((item) => item.label), ['제철 모음', '상품']);
    assert.deepEqual(home.body.events.map((item) => item.id), [eventId]);
    assert.deepEqual(home.body.recommendations.map((item) => item.productId), [secondId, firstId]);
    assert.equal((await read(`/home/events/${laterId}`)).body.status, 'unavailable');
    assert.equal((await read(`/home/events/${expiredId}`)).body.status, 'unavailable');
    assert.equal((await read(`/home/events/${randomUUID()}`)).body.status, 'unavailable');
    const detail = await read(`/home/events/${eventId}`);
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.products.map((item) => item.productId), [secondId, firstId]);
    const optionId = (await pool.query(`SELECT o.id FROM product_options o JOIN product_revisions r ON r.id=o.revision_id
      WHERE r.product_id=$1`, [secondId])).rows[0].id;
    await pool.query('UPDATE inventory_levels SET sellable_quantity=0 WHERE option_id=$1', [optionId]);
    const afterOneSoldOut = await read('/home/content');
    assert.deepEqual(afterOneSoldOut.body.recommendations.map((item) => item.productId), [firstId]);
    assert.deepEqual((await read(`/home/events/${eventId}`)).body.products.map((item) => item.productId), [firstId]);
    await pool.query(`UPDATE inventory_levels SET sellable_quantity=0 WHERE option_id IN
      (SELECT o.id FROM product_options o JOIN product_revisions r ON r.id=o.revision_id WHERE r.product_id=$1)`,
      [firstId]);
    const soldOut = await read('/home/content');
    assert.deepEqual(soldOut.body.events, []);
    assert.deepEqual(soldOut.body.recommendations, []);
    assert.deepEqual(soldOut.body.menu, []);
    assert.equal((await read(`/home/events/${eventId}`)).body.status, 'unavailable');
  } finally {
    if (app) await app.close();
    if (initialDraft && actorId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE home_content_current SET publication_id=$1 WHERE id=1', [initialCurrent]);
        await client.query('UPDATE home_content_draft SET version=$1,payload=$2,updated_by_account_id=$3 WHERE id=1',
          [initialDraft.version, initialDraft.payload, initialDraft.updated_by_account_id]);
        await client.query('DELETE FROM home_content_publications WHERE published_by_account_id=$1', [actorId]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    if (seeded) await runQaPublicFixture('reset', runId, process.env.DATABASE_URL);
    await pool.end();
  }
});
