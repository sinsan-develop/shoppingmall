import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { runQaPublicFixture } from './qa-public-fixture.js';
import { qaNames } from './qa-fixture.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const identity = (await pool.query('SELECT current_database() AS name,system_identifier::text AS id FROM pg_control_system()')).rows[0];
  assert.equal(identity.name, 'shoppingmall_qa_20261010_2');
  assert.equal(identity.id, process.env.QA_ROLE_MATRIX_DB_SYSTEM_ID);
  assert.notEqual(identity.id, '7622490131194466339');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n, 0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n, 28);
  const fixture = await runQaPublicFixture('seed', 'a0140002', process.env.DATABASE_URL!, randomBytes(24).toString('hex'), 25);
  const names = qaNames('a0140002');
  const sellers = (await pool.query('SELECT id,display_name FROM sellers WHERE display_name=ANY($1::text[])', [[names.sellerA, names.sellerB]])).rows;
  const sellerId = sellers.find(item => item.display_name === names.sellerA).id;
  const emptySellerId = sellers.find(item => item.display_name === names.sellerB).id;
  const minorId = (await pool.query('SELECT category_id FROM products WHERE id=$1', [fixture.productId])).rows[0].category_id;
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM products')).rows[0].n, 25);
  await writeFile('/workspace/w02-manifest.json', JSON.stringify({ ...fixture, sellerId, emptySellerId, minorId, systemId: identity.id }), { mode: 0o600, flag: 'wx' });
  console.info('W02_QA_CATALOG_25_SEEDED');
} finally { await pool.end(); }
