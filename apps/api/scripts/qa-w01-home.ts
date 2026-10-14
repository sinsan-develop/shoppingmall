import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { runQaPublicFixture } from './qa-public-fixture.js';
import { qaNames } from './qa-fixture.js';

// Test-only data: refuse the protected cluster before any write.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const identity = (await pool.query('SELECT current_database() AS name,system_identifier::text AS id FROM pg_control_system()')).rows[0];
  assert.equal(identity.name, 'shoppingmall_qa_20261010_2');
  assert.equal(identity.id, process.env.QA_ROLE_MATRIX_DB_SYSTEM_ID);
  assert.notEqual(identity.id, '7622490131194466339');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n, 0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n, 28);
  const runId = 'a0140001';
  const fixture = await runQaPublicFixture('seed', runId, process.env.DATABASE_URL!, randomBytes(24).toString('hex'));
  const names = qaNames(runId);
  const sellerId = (await pool.query('SELECT id FROM sellers WHERE display_name=$1', [names.sellerA])).rows[0].id;
  const actor = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1', [names.emails[4]])).rows[0].account_id;
  const eventId = randomUUID();
  const payload = {
    menu: [
      { id: randomUUID(), label: 'W01 상품 메뉴', displayOrder: 0, visible: true, target: { type: 'product', id: fixture.productId } },
      { id: randomUUID(), label: 'W01 기획전 메뉴', displayOrder: 1, visible: true, target: { type: 'event', id: eventId } },
      { id: randomUUID(), label: 'W01 숨김 메뉴', displayOrder: 2, visible: false, target: { type: 'catalog' } },
    ],
    events: [{ id: eventId, title: 'W01 제철 모음', description: 'W01 격리 가상 상품', displayOrder: 0,
      startAt: new Date(Date.now() - 3600000).toISOString(), endAt: new Date(Date.now() + 3600000).toISOString(),
      productIds: [fixture.productId], heroProductId: fixture.productId, heroImageId: null }],
    recommendations: [fixture.productId],
  };
  const publication = (await pool.query('INSERT INTO home_content_publications(payload,published_by_account_id) VALUES ($1,$2) RETURNING id', [payload, actor])).rows[0].id;
  await pool.query('UPDATE home_content_current SET publication_id=$1 WHERE id=1', [publication]);
  await writeFile('/workspace/w01-manifest.json', JSON.stringify({ ...fixture, sellerId, sellerName: names.sellerA, eventId, systemId: identity.id }), { mode: 0o600, flag: 'wx' });
  console.info('W01_QA_HOME_SEEDED');
} finally { await pool.end(); }
