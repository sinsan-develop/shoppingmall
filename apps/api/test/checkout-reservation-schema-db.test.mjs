import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

test('checkout reservation ledger keeps one active hold and validates owned option quantities', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const run = randomUUID().slice(0, 8);
  async function rejectsConstraint(sql, params, code) {
    await client.query('SAVEPOINT reservation_constraint');
    try {
      await assert.rejects(client.query(sql, params), (error) => error.code === code);
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT reservation_constraint');
      await client.query('RELEASE SAVEPOINT reservation_constraint');
    }
  }
  try {
    await client.query('BEGIN');
    for (const name of ['checkout_reservations', 'checkout_reservation_lines', 'inventory_deferred_stock_targets']) {
      const result = await client.query('SELECT to_regclass($1) AS relation', [name]);
      assert.ok(result.rows[0].relation, `${name} must exist after migration 0010`);
    }
    const accountId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const categoryId = (await client.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id',
      [`qa-${run}-reservation-category`])).rows[0].id;
    const sellerId = (await client.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [categoryId, `qa-${run}-seller`])).rows[0].id;
    const productCategoryId = (await client.query('INSERT INTO product_categories(name) VALUES ($1) RETURNING id',
      [`qa-${run}-reservation-product`])).rows[0].id;
    const productId = (await client.query('INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
      [sellerId, productCategoryId])).rows[0].id;
    const revisionId = (await client.query(
      `INSERT INTO product_revisions(product_id,version,title,description,origin_label,shipping_mode,status,
        proposed_by_account_id) VALUES ($1,1,'QA 예약 상품','QA 설명','QA 산지','seller_direct','approved',$2)
       RETURNING id`, [productId, accountId])).rows[0].id;
    const optionId = (await client.query(
      'INSERT INTO product_options(revision_id,name,price_won) VALUES ($1,$2,23000) RETURNING id',
      [revisionId, '500g'])).rows[0].id;
    const idempotencyKey = randomUUID();
    const reservationId = (await client.query(
      `INSERT INTO checkout_reservations(account_id,idempotency_key,status,expires_at)
       VALUES ($1,$2,'ACTIVE',clock_timestamp()+interval '15 minutes') RETURNING id`,
      [accountId, idempotencyKey])).rows[0].id;
    await client.query('INSERT INTO checkout_reservation_lines(reservation_id,option_id,quantity) VALUES ($1,$2,2)',
      [reservationId, optionId]);
    await rejectsConstraint(
      `INSERT INTO checkout_reservations(account_id,idempotency_key,status,expires_at)
       VALUES ($1,$2,'ACTIVE',clock_timestamp()+interval '15 minutes')`,
      [accountId, idempotencyKey], '23505');
    await rejectsConstraint(
      `INSERT INTO checkout_reservations(account_id,idempotency_key,status,expires_at)
       VALUES ($1,$2,'ACTIVE',clock_timestamp()+interval '15 minutes')`,
      [accountId, randomUUID()], '23505');
    await rejectsConstraint('INSERT INTO checkout_reservation_lines(reservation_id,option_id,quantity) VALUES ($1,$2,0)',
      [reservationId, randomUUID()], '23514');
    await rejectsConstraint('INSERT INTO checkout_reservation_lines(reservation_id,option_id,quantity) VALUES ($1,$2,1)',
      [reservationId, randomUUID()], '23503');
    await client.query('UPDATE checkout_reservations SET status=$2,ended_at=clock_timestamp() WHERE id=$1',
      [reservationId, 'RELEASED']);
    const second = await client.query(
      `INSERT INTO checkout_reservations(account_id,idempotency_key,status,expires_at)
       VALUES ($1,$2,'ACTIVE',clock_timestamp()+interval '15 minutes') RETURNING id`,
      [accountId, randomUUID()]);
    assert.equal(second.rowCount, 1);
    await client.query(
      `INSERT INTO inventory_deferred_stock_targets(option_id,target_on_hand,requested_by_account_id,status)
       VALUES ($1,0,$2,'pending')`, [optionId, accountId]);
    await rejectsConstraint(
      `INSERT INTO inventory_deferred_stock_targets(option_id,target_on_hand,requested_by_account_id,status)
       VALUES ($1,0,$2,'pending')`, [optionId, accountId], '23505');
    await rejectsConstraint(
      `INSERT INTO inventory_deferred_stock_targets(option_id,target_on_hand,requested_by_account_id,status)
       VALUES ($1,1,$2,'applied')`, [optionId, accountId], '23514');
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
