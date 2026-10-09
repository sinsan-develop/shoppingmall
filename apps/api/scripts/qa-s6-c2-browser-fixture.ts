import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { completeSellerPeriod } from '../src/settlement/complete.js';
import { qaNames, runQaFixture, validateQaRunId } from './qa-fixture.js';

const run = validateQaRunId(process.env.S6_C2_BROWSER_RUN ?? '');
const databaseUrl = process.env.DATABASE_URL ?? '';
const systemId = process.env.S6_C2_BROWSER_DB_SYSTEM_ID ?? '';
const password = process.env.QA_FIXTURE_PASSWORD ?? '';
assert.equal(new URL(databaseUrl).pathname, '/shoppingmall');
assert.ok(systemId && password.length >= 12);

const pool = new Pool({ connectionString: databaseUrl });
try {
  const identity = (await pool.query(`SELECT system_identifier::text AS id
    FROM pg_control_system()`)).rows[0].id;
  assert.equal(identity, systemId);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n, 0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations'))
    .rows[0].n, 24);
  await runQaFixture('seed', run, databaseUrl, password);
  const names = qaNames(run);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admin = (await client.query(`SELECT account_id AS id FROM account_identities
      WHERE identifier=$1`, [names.emails[4]])).rows[0].id;
    const sellers = (await client.query(`SELECT id,display_name AS name FROM sellers
      WHERE display_name=ANY($1::text[])`, [[names.sellerA, names.sellerB]])).rows;
    const sellerA = sellers.find((seller) => seller.name === names.sellerA)?.id;
    const sellerB = sellers.find((seller) => seller.name === names.sellerB)?.id;
    assert.ok(sellerA && sellerB);
    const x = (await client.query(`INSERT INTO seller_categories(name)
      VALUES ('C2 과거 X') RETURNING id`)).rows[0].id;
    const y = (await client.query(`INSERT INTO seller_categories(name)
      VALUES ('C2 현재 Y') RETURNING id`)).rows[0].id;
    await client.query('UPDATE sellers SET category_id=$1 WHERE id=ANY($2::uuid[])',
      [x, [sellerA, sellerB]]);
    for (const [categoryId, categoryName, date, amount] of [
      [x, 'C2 과거 X', '2026-05-01T00:00:00Z', 10000],
      [y, 'C2 현재 Y', '2026-05-02T00:00:00Z', 4000],
    ] as const) {
      const source = randomUUID();
      await client.query(`INSERT INTO settlement_events
        (dedupe_key,kind,amount_won,occurred_at,seller_id,seller_name,
         seller_category_id,seller_category_name,source_event_kind,source_event_id,
         recorded_by,reason)
        VALUES ($1,'commission',$2,$3,$4,$5,$6,$7,'manual_commission',$8,$9,'C2 브라우저 근거')`,
      [`manual:${source}`, amount, date, sellerA, names.sellerA,
        categoryId, categoryName, source, admin]);
    }
    await client.query('UPDATE sellers SET category_id=$1 WHERE id=$2', [y, sellerA]);
    await completeSellerPeriod(client, admin, { sellerId: sellerA,
      from: '2026-05-01', to: '2026-05-20', reason: 'C2 혼합 완료' });
    await completeSellerPeriod(client, admin, { sellerId: sellerB,
      from: '2026-05-01', to: '2026-05-20', reason: 'C2 0건 완료' });
    await client.query('COMMIT');
    console.info(JSON.stringify({ run, sellerA, sellerB, x, y,
      expected: { all: 14000, x: 10000, y: 4000, empty: 0 } }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
} finally { await pool.end(); }
