import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

if (!process.env.PGPASSWORD && !process.env.DATABASE_URL) {
  throw new Error('Migration requires PGPASSWORD or DATABASE_URL');
}

const pool = new Pool(process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 }
  : {
      host: process.env.PGHOST ?? '127.0.0.1',
      port: Number(process.env.PGPORT ?? 5432),
      user: process.env.PGUSER ?? 'postgres',
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE ?? 'shoppingmall',
      connectionTimeoutMillis: 3000,
    });

try {
  await migrate(drizzle(pool), { migrationsFolder: resolve('migrations') });
  console.info('Migrations applied');
} catch (error) {
  const failure = error as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  console.error('Migration failed', failure.code ?? failure.cause?.code ?? 'UNKNOWN', failure.cause?.message ?? failure.message ?? 'unknown');
  process.exitCode = 1;
} finally {
  await pool.end();
}
