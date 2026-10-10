// Read-only smoke for the separately approved 0025 schema on WSL local-postgres/shoppingmall.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createApp } from '../apps/api/src/app.ts';

assert.equal(process.env.PGHOST, 'local-postgres');
assert.equal(process.env.PGDATABASE, 'shoppingmall');
assert.equal(process.env.API_HOST, '127.0.0.1');
assert.equal(process.env.AUTH_DELIVERY_MODE, 'disabled');
assert.ok(process.env.PGPASSWORD, 'DB password missing');
process.env.DATABASE_URL = `postgres://postgres:${encodeURIComponent(process.env.PGPASSWORD)}` +
  '@local-postgres:5432/shoppingmall';
const { Pool } = createRequire(new URL('../apps/api/package.json', import.meta.url))('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
let app;
const counts = async () => {
  const result = await pool.query(`SELECT
    (SELECT count(*)::int FROM accounts) AS accounts,
    (SELECT count(*)::int FROM account_roles) AS roles,
    (SELECT count(*)::int FROM auth_sessions) AS sessions,
    (SELECT count(*)::int FROM auth_action_tokens) AS tokens,
    (SELECT count(*)::int FROM seller_applications) AS applications`);
  return result.rows[0];
};
try {
  const identity = await pool.query(`SELECT current_database() AS db,
    system_identifier::text AS system_id FROM pg_control_system()`);
  assert.deepEqual(identity.rows[0], { db: 'shoppingmall', system_id: '7622490131194466339' });
  const migrations = await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');
  assert.equal(migrations.rows[0].n, 26);
  const before = await counts();
  assert.deepEqual(before, { accounts: 0, roles: 0, sessions: 0, tokens: 0, applications: 0 });
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  const get = (route) => fetch(`${base}${route}`);
  assert.equal((await get('/health')).status, 200);
  assert.equal((await get('/ready')).status, 200);
  assert.equal((await get('/auth/me')).status, 401);
  assert.equal((await get('/auth/admin/seller-applications')).status, 401);
  assert.equal((await get('/catalog/seller/products')).status, 401);
  const crossOrigin = await fetch(`${base}/auth/customer-signup/start`, {
    method: 'POST', headers: { origin: 'https://untrusted.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'no-write@example.invalid' }),
  });
  assert.equal(crossOrigin.status, 403);
  assert.deepEqual(await counts(), before);
  console.log('AUTH_SHARED_READ_PASS system migration health ready anonymous origin no-write');
} finally {
  if (app) await app.close();
  await pool.end();
}
