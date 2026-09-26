import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './migrations',
  dbCredentials: process.env.PGPASSWORD
    ? {
        host: process.env.PGHOST ?? '127.0.0.1',
        port: Number(process.env.PGPORT ?? 5432),
        user: process.env.PGUSER ?? 'postgres',
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE ?? 'shoppingmall',
      }
    : process.env.DATABASE_URL
      ? { url: process.env.DATABASE_URL }
      : undefined,
});
