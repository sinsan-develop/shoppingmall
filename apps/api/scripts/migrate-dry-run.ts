import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { Pool } from 'pg';
import { planMigrationPreview, type AppliedMigration, type MigrationFile } from './migration-preview.js';

async function main() {
  if (!process.env.PGPASSWORD && !process.env.DATABASE_URL) {
    throw new Error('Migration preview requires PGPASSWORD or DATABASE_URL');
  }
  if (process.argv.slice(2).some((arg) => arg !== '--sql')) throw new Error('Only --sql is supported');

  const folder = resolve('migrations');
  const journal = JSON.parse(readFileSync(join(folder, 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string; when: number }[];
  };
  const migrations = readMigrationFiles({ migrationsFolder: folder });
  if (journal.entries.length !== migrations.length) throw new Error('Migration journal is incomplete');
  const files: MigrationFile[] = journal.entries.map((entry, index) => ({
    tag: entry.tag, when: entry.when, hash: migrations[index].hash, sql: migrations[index].sql,
  }));

  const pool = new Pool(process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 }
    : { host: process.env.PGHOST ?? '127.0.0.1', port: Number(process.env.PGPORT ?? 5432),
        user: process.env.PGUSER ?? 'postgres', password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE ?? 'shoppingmall', connectionTimeoutMillis: 3000 });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN TRANSACTION READ ONLY');
      const identity = await client.query<{ name: string }>('SELECT current_database() AS name');
      if (identity.rows[0].name !== 'shoppingmall') throw new Error('Preview is limited to shoppingmall database');
      const relation = await client.query<{ name: string | null }>(
        "SELECT to_regclass('drizzle.__drizzle_migrations') AS name",
      );
      const applied: AppliedMigration[] = relation.rows[0].name
        ? (await client.query<{ hash: string; created_at: string }>(
          'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at, id',
        )).rows.map((row) => ({ hash: row.hash, createdAt: Number(row.created_at) }))
        : [];
      const pending = planMigrationPreview(files, applied);
      console.info(`Read-only migration preview: ${applied.length} applied, ${pending.length} pending`);
      for (const file of pending) {
        console.info(`${file.tag}: ${file.sql.length} statements; SHA-256 ${file.hash}`);
        if (process.argv.includes('--sql')) console.info(file.sql.join('\n-- statement-breakpoint\n'));
      }
      console.info('No SQL was applied; schema validity requires an isolated apply test.');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Migration preview failed', error instanceof Error ? error.message : 'unknown');
  process.exitCode = 1;
});
