import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { getTableColumns, getTableName } from 'drizzle-orm';
import * as schema from '../src/db/schema.ts';

const databaseName = 'shoppingmall_s6_schema_1008';
const systemId = process.env.S6_SETTLEMENT_TEST_DB_SYSTEM_ID;

async function privatePool() {
  assert.equal(process.env.PGDATABASE, databaseName, 'isolated S6 database required');
  const pool = new Pool();
  const identity = (await pool.query(`SELECT current_database() AS name,
    system_identifier::text AS system_id FROM pg_control_system()`)).rows[0];
  assert.equal(identity.name, databaseName);
  assert.equal(identity.system_id, systemId);
  return pool;
}

async function rejectsWith(client, statement, values, code) {
  await client.query('SAVEPOINT invalid_settlement');
  try {
    await assert.rejects(client.query(statement, values), (error) => error.code === code);
  } finally { await client.query('ROLLBACK TO SAVEPOINT invalid_settlement'); }
}

test('0020 adds immutable occurrence and seller-specific completed period relations', {
  skip: !systemId,
}, async () => {
  const pool = await privatePool();
  try {
    const history = await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');
    assert.equal(history.rows[0].n, 22);
    for (const table of [schema.settlementEvents, schema.sellerSettlementPeriods,
      schema.sellerSettlementPeriodEventLinks]) {
      assert.ok(table, 'Drizzle declaration required');
      const name = getTableName(table);
      const actual = (await pool.query(`SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 ORDER BY column_name`, [name]))
        .rows.map(({ column_name }) => column_name);
      const declared = Object.values(getTableColumns(table)).map((column) => column.name).sort();
      assert.deepEqual(actual, declared, `${name} declaration drift`);
    }
    const constraints = (await pool.query(`SELECT conname FROM pg_constraint WHERE
      conrelid='public.seller_settlement_periods'::regclass`)).rows.map(({ conname }) => conname);
    assert.ok(constraints.includes('seller_settlement_periods_no_overlap'),
      'database must prevent overlapping completed periods');
  } finally { await pool.end(); }
});

test('commission occurrence deduplicates and completed periods overlap only within the same seller', {
  skip: !systemId,
}, async () => {
  const pool = await privatePool();
  const client = await pool.connect();
  let began = false;
  try {
    await client.query('BEGIN'); began = true;
    const accountId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const categoryId = (await client.query(`INSERT INTO seller_categories(name)
      VALUES ('S6 농가') RETURNING id`)).rows[0].id;
    const sellers = (await client.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,'S6 농가 A'),($1,'S6 농가 B') RETURNING id`, [categoryId])).rows;
    const [sellerA, sellerB] = sellers.map(({ id }) => id);
    const sourceId = randomUUID();
    const key = `manual:${sourceId}:commission:${sellerA}`;
    const insert = `INSERT INTO settlement_events
      (dedupe_key,kind,amount_won,occurred_at,seller_id,seller_name,
       seller_category_id,seller_category_name,source_event_kind,source_event_id,
       recorded_by,reason) VALUES ($1,'commission',1000,'2026-07-01T00:00:00Z',
       $2,'S6 농가 A',$3,'S6 농가','manual_commission',$4,$5,'시험 수수료') RETURNING id`;
    const entryId = (await client.query(insert,[key,sellerA,categoryId,sourceId,accountId])).rows[0].id;
    await rejectsWith(client,insert,[key,sellerA,categoryId,sourceId,accountId],'23505');
    await rejectsWith(client,'UPDATE settlement_events SET amount_won=2000 WHERE id=$1',
      [entryId],'P0001');
    await rejectsWith(client,'DELETE FROM settlement_events WHERE id=$1',[entryId],'P0001');
    const complete = `INSERT INTO seller_settlement_periods
      (seller_id,start_date,end_date,completed_by,reason)
      VALUES ($1,$2,$3,$4,'시험 완료')`;
    await client.query(complete,[sellerA,'2026-05-01','2026-05-20',accountId]);
    await rejectsWith(client,complete,[sellerA,'2026-05-20','2026-05-31',accountId],'23P01');
    await client.query(complete,[sellerB,'2026-05-20','2026-05-31',accountId]);
    const rows = await client.query(`SELECT seller_id AS "sellerId" FROM seller_settlement_periods
      ORDER BY seller_id`);
    assert.deepEqual(rows.rows.map(({ sellerId }) => sellerId).sort(),[sellerA,sellerB].sort());
  } finally {
    if (began) await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
