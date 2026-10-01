import { pathToFileURL } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { hashPassword } from '../src/auth/credentials.js';

export function validateQaRunId(value: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}$/i.test(value)) throw new Error('QA_RUN_ID must be eight hex characters');
  return value.toLowerCase();
}

export function qaNames(runId: string) {
  const id = validateQaRunId(runId);
  return {
    category: `qa-${id}-sellers`,
    sellerA: `qa-${id}-seller-a`,
    sellerB: `qa-${id}-seller-b`,
    owool: `qa-${id}-owool`,
    emails: ['customer', 'seller-a', 'seller-b', 'owool', 'admin']
      .map((role) => `qa+${id}-${role}@example.invalid`),
  };
}

async function seed(client: PoolClient, runId: string, password: string) {
  const names = qaNames(runId);
  const digest = await hashPassword(password);
  const category = await client.query<{ id: string }>(
    'INSERT INTO seller_categories (name) VALUES ($1) RETURNING id', [names.category],
  );
  const sellerIds: string[] = [];
  for (const name of [names.sellerA, names.sellerB, names.owool]) {
    const inserted = await client.query<{ id: string }>(
      'INSERT INTO sellers (category_id, display_name) VALUES ($1, $2) RETURNING id',
      [category.rows[0].id, name],
    );
    sellerIds.push(inserted.rows[0].id);
  }
  for (const [index, email] of names.emails.entries()) {
    const account = await client.query<{ id: string }>('INSERT INTO accounts DEFAULT VALUES RETURNING id');
    const accountId = account.rows[0].id;
    await client.query(
      'INSERT INTO account_identities (account_id, kind, identifier, password_hash, verified_at) VALUES ($1, $2, $3, $4, now())',
      [accountId, 'email', email, digest],
    );
    if (index === 0) {
      await client.query('INSERT INTO account_roles (account_id, role) VALUES ($1, $2)', [accountId, 'customer']);
    } else if (index === 4) {
      await client.query('INSERT INTO account_roles (account_id, role) VALUES ($1, $2)', [accountId, 'admin']);
    } else {
      await client.query('INSERT INTO account_roles (account_id, role, seller_id) VALUES ($1, $2, $3)',
        [accountId, 'seller', sellerIds[index - 1]]);
    }
  }
  return names;
}

async function reset(client: PoolClient, runId: string) {
  const names = qaNames(runId);
  const sellerIds = (await client.query<{ id: string }>(
    `SELECT s.id FROM sellers s JOIN seller_categories c ON c.id=s.category_id
     WHERE c.name=$1 AND s.display_name = ANY($2::text[])`,
    [names.category, [names.sellerA, names.sellerB, names.owool]],
  )).rows.map((row) => row.id);
  if (sellerIds.length) {
    await client.query('DELETE FROM seller_shipping_policies WHERE seller_id = ANY($1::uuid[])', [sellerIds]);
    await client.query('DELETE FROM seller_shipping_policy_requests WHERE seller_id = ANY($1::uuid[])', [sellerIds]);
  }
  const accountResult = await client.query<{ id: string }>(
    'SELECT account_id AS id FROM account_identities WHERE kind = $1 AND identifier = ANY($2::text[])',
    ['email', names.emails],
  );
  const accountIds = accountResult.rows.map((row) => row.id);
  if (accountIds.length) {
    await client.query('DELETE FROM customer_cart_items WHERE account_id = ANY($1::uuid[])', [accountIds]);
    await client.query('DELETE FROM restock_subscriptions WHERE account_id = ANY($1::uuid[])', [accountIds]);
    await client.query('DELETE FROM customer_favorites WHERE account_id = ANY($1::uuid[])', [accountIds]);
    await client.query('DELETE FROM customer_addresses WHERE account_id = ANY($1::uuid[])', [accountIds]);
    await client.query('DELETE FROM notification_preferences WHERE account_id = ANY($1::uuid[])', [accountIds]);
    await client.query('DELETE FROM account_deletion_requests WHERE account_id = ANY($1::uuid[])', [accountIds]);
    await client.query('DELETE FROM audit_events WHERE actor_account_id = ANY($1::uuid[])', [accountIds]);
    await client.query('DELETE FROM auth_sessions WHERE account_id = ANY($1::uuid[])', [accountIds]);
    await client.query('DELETE FROM account_roles WHERE account_id = ANY($1::uuid[])', [accountIds]);
    await client.query('DELETE FROM account_identities WHERE account_id = ANY($1::uuid[])', [accountIds]);
    await client.query('DELETE FROM accounts WHERE id = ANY($1::uuid[])', [accountIds]);
  }
  await client.query('DELETE FROM sellers WHERE display_name = ANY($1::text[]) AND category_id IN (SELECT id FROM seller_categories WHERE name = $2)',
    [[names.sellerA, names.sellerB, names.owool], names.category]);
  await client.query('DELETE FROM seller_categories WHERE name = $1', [names.category]);
  return { accounts: accountIds.length };
}

export async function runQaFixture(action: 'seed' | 'reset', runId: string, databaseUrl: string, password?: string) {
  const dbUrl = new URL(databaseUrl);
  if (dbUrl.pathname !== '/shoppingmall') throw new Error('QA fixture is limited to shoppingmall database');
  if (action === 'seed' && (!password || password.length < 12)) throw new Error('QA_FIXTURE_PASSWORD must be set');
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = action === 'seed'
        ? await seed(client, runId, password!) : await reset(client, runId);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const action = process.argv[2];
  if (action !== 'seed' && action !== 'reset') throw new Error('usage: qa-fixture.ts seed|reset');
  runQaFixture(action, process.env.QA_RUN_ID ?? '', process.env.DATABASE_URL ?? '', process.env.QA_FIXTURE_PASSWORD)
    .then((result) => { process.stdout.write(`${JSON.stringify(result)}\n`); })
    .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'QA fixture failed'}\n`); process.exitCode = 1; });
}
