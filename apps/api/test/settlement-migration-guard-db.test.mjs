import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

test('0021 refuses pre-existing completions without installing a partial schema', {
  skip: !process.env.S6_SETTLEMENT_GUARD_DB_SYSTEM_ID,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_s6_guard_1009');
  const pool = new Pool();
  try {
    const identity = (await pool.query(`SELECT system_identifier::text AS id
      FROM pg_control_system()`)).rows[0].id;
    assert.equal(identity, process.env.S6_SETTLEMENT_GUARD_DB_SYSTEM_ID);
    const history = await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');
    assert.equal(history.rows[0].n, 21, 'the isolated DB must stop at migration 0020');
    const adminId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const categoryId = (await pool.query(`INSERT INTO seller_categories(name)
      VALUES ('S6 마이그레이션 방어') RETURNING id`)).rows[0].id;
    const sellerId = (await pool.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,'기존 완료 판매자') RETURNING id`, [categoryId])).rows[0].id;
    await pool.query(`INSERT INTO seller_settlement_periods
      (seller_id,start_date,end_date,completed_by,reason)
      VALUES ($1,'2026-05-01','2026-05-20',$2,'기존 완료')`, [sellerId, adminId]);
    await assert.rejects(() => migrate(drizzle(pool), {
      migrationsFolder: resolve('migrations'),
    }), /Cannot infer historical settlement event membership/);
    const after = await pool.query(`SELECT
      (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migration_count,
      to_regclass('public.seller_settlement_period_event_links') AS links,
      (SELECT count(*)::int FROM seller_settlement_periods) AS period_count`);
    assert.deepEqual(after.rows[0], { migration_count: 21, links: null, period_count: 1 });
  } finally { await pool.end(); }
});
