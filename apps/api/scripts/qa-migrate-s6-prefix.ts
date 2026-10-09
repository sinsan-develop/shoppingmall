import assert from 'node:assert/strict';
import { mkdtemp, readFile, copyFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

assert.equal(process.env.PGDATABASE, 'shoppingmall_s6_guard_1009');
assert.ok(process.env.S6_SETTLEMENT_GUARD_DB_SYSTEM_ID);
const pool = new Pool();
const source = resolve('migrations');
let temporary: string | undefined;
try {
  const identity = (await pool.query(`SELECT system_identifier::text AS id
    FROM pg_control_system()`)).rows[0].id;
  assert.equal(identity, process.env.S6_SETTLEMENT_GUARD_DB_SYSTEM_ID);
  assert.equal((await pool.query(`SELECT to_regclass('public.accounts') AS accounts`)).rows[0].accounts, null);
  const journal = JSON.parse(await readFile(join(source, 'meta', '_journal.json'), 'utf8'));
  const prefix = journal.entries.filter((entry: { idx: number }) => entry.idx <= 20);
  assert.equal(prefix.length, 21);
  assert.equal(prefix.at(-1).tag, '0020_s6_settlement');
  temporary = await mkdtemp(join(tmpdir(), 'shoppingmall-s6-review-1009-migrations-'));
  await mkdir(join(temporary, 'meta'));
  await writeFile(join(temporary, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries: prefix }));
  for (const entry of prefix) {
    await copyFile(join(source, `${entry.tag}.sql`), join(temporary, `${entry.tag}.sql`));
  }
  await migrate(drizzle(pool), { migrationsFolder: temporary });
  const count = (await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n;
  assert.equal(count, 21);
  console.info('S6 0020 prefix applied to disposable guard DB');
} finally {
  await pool.end();
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
