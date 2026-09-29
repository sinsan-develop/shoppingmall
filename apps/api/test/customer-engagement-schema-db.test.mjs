import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

async function withFixture(run) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const suffix = randomUUID();
    const accountId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const sellerCategoryId = (await client.query(
      'INSERT INTO seller_categories(name) VALUES ($1) RETURNING id', [`qa-favorite-seller-${suffix}`],
    )).rows[0].id;
    const productCategoryId = (await client.query(
      'INSERT INTO product_categories(name) VALUES ($1) RETURNING id', [`qa-favorite-product-${suffix}`],
    )).rows[0].id;
    const sellerId = (await client.query(
      'INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [sellerCategoryId, `qa-favorite-${suffix}`],
    )).rows[0].id;
    const productId = (await client.query(
      'INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
      [sellerId, productCategoryId],
    )).rows[0].id;
    await run(client, { accountId, productId });
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
}

async function expectConstraint(client, query, params, code) {
  await client.query('SAVEPOINT expected_constraint');
  try {
    await assert.rejects(client.query(query, params), (error) => error.code === code);
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT expected_constraint');
    await client.query('RELEASE SAVEPOINT expected_constraint');
  }
}

test('favorite belongs to a real account and product and cannot duplicate their pair', {
  skip: !process.env.DATABASE_URL,
}, async () => withFixture(async (client, { accountId, productId }) => {
  const insert = 'INSERT INTO customer_favorites(account_id,product_id) VALUES ($1,$2)';
  await client.query(insert, [accountId, productId]);
  await expectConstraint(client, insert, [accountId, productId], '23505');
  await expectConstraint(client, insert, [accountId, randomUUID()], '23503');
  const count = await client.query(
    'SELECT count(*)::int AS count FROM customer_favorites WHERE account_id=$1 AND product_id=$2',
    [accountId, productId],
  );
  assert.equal(count.rows[0].count, 1);
}));

test('only one active restock request exists per option name while cancelled history remains', {
  skip: !process.env.DATABASE_URL,
}, async () => withFixture(async (client, { accountId, productId }) => {
  const insert = 'INSERT INTO restock_subscriptions(account_id,product_id,option_name) VALUES ($1,$2,$3) RETURNING id';
  const first = await client.query(insert, [accountId, productId, '500g']);
  await expectConstraint(client, insert, [accountId, productId, '500g'], '23505');
  await client.query("UPDATE restock_subscriptions SET status='cancelled',cancelled_at=now() WHERE id=$1", [first.rows[0].id]);
  const second = await client.query(insert, [accountId, productId, '500g']);
  assert.notEqual(second.rows[0].id, first.rows[0].id);
  await expectConstraint(client, insert, [accountId, productId, ' '], '23514');
  const rows = await client.query(
    'SELECT status FROM restock_subscriptions WHERE account_id=$1 AND product_id=$2 ORDER BY requested_at,id',
    [accountId, productId],
  );
  assert.deepEqual(rows.rows.map((row) => row.status).sort(), ['active', 'cancelled']);
}));
