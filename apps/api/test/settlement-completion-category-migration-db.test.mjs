import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

test('0023 refuses existing completions without guessing a historical category', {
  skip: !process.env.S6_SETTLEMENT_GUARD_DB_SYSTEM_ID,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_s6_guard_1010');
  const pool = new Pool();
  let prefixDirectory;
  try {
    const identity = (await pool.query(`SELECT system_identifier::text AS id
      FROM pg_control_system()`)).rows[0].id;
    assert.equal(identity, process.env.S6_SETTLEMENT_GUARD_DB_SYSTEM_ID);
    assert.equal((await pool.query(`SELECT to_regclass('public.accounts') AS name`)).rows[0].name, null);
    const source = resolve('migrations');
    const journal = JSON.parse(await readFile(join(source, 'meta', '_journal.json'), 'utf8'));
    const prefix = journal.entries.filter((entry) => entry.idx <= 22);
    assert.equal(prefix.length, 23);
    prefixDirectory = await mkdtemp(join(tmpdir(), 'shoppingmall-s6-0023-guard-'));
    await mkdir(join(prefixDirectory, 'meta'));
    await writeFile(join(prefixDirectory, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: prefix }));
    for (const entry of prefix) {
      await copyFile(join(source, `${entry.tag}.sql`), join(prefixDirectory, `${entry.tag}.sql`));
    }
    await migrate(drizzle(pool), { migrationsFolder: prefixDirectory });
    const admin = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const category = (await pool.query(`INSERT INTO seller_categories(name)
      VALUES ('과거 불명') RETURNING id`)).rows[0].id;
    const seller = (await pool.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,'기존 판매자') RETURNING id`, [category])).rows[0].id;
    await pool.query(`INSERT INTO seller_settlement_periods
      (seller_id,start_date,end_date,completed_by,reason)
      VALUES ($1,'2026-05-01','2026-05-20',$2,'기존 완료')`, [seller, admin]);
    await assert.rejects(() => migrate(drizzle(pool), { migrationsFolder: source }),
      /Cannot infer historical seller category/);
    const state = await pool.query(`SELECT count(*)::int AS applied FROM drizzle.__drizzle_migrations`);
    assert.equal(state.rows[0].applied, 23);
    const column = await pool.query(`SELECT count(*)::int AS found FROM information_schema.columns
      WHERE table_name='seller_settlement_periods'
        AND column_name='seller_category_id_at_completion'`);
    assert.equal(column.rows[0].found, 0);
    const rows = await pool.query('SELECT count(*)::int AS n FROM seller_settlement_periods');
    assert.equal(rows.rows[0].n, 1);
  } finally {
    await pool.end();
    if (prefixDirectory) await rm(prefixDirectory, { recursive: true, force: true });
  }
});
