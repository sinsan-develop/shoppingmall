import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

test('cart storage rejects zero quantity and orphan options without saving a price', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let accountId;
  try {
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM customer_cart_items')).rows[0].total, 0);
    const columns = (await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='customer_cart_items'`,
    )).rows.map((row) => row.column_name);
    for (const forbidden of ['unit_price_won', 'seller_id', 'shipping_fee_won', 'reserved_quantity']) {
      assert.equal(columns.includes(forbidden), false);
    }
    accountId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const optionId = randomUUID();
    await assert.rejects(pool.query(
      'INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,0)',
      [accountId, optionId],
    ), (error) => error.code === '23514');
    await assert.rejects(pool.query(
      'INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,1000001)',
      [accountId, optionId],
    ), (error) => error.code === '23514');
    await assert.rejects(pool.query(
      'INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,1)',
      [accountId, optionId],
    ), (error) => error.code === '23503');
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM customer_cart_items')).rows[0].total, 0);
  } finally {
    if (accountId) await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    await pool.end();
  }
});
