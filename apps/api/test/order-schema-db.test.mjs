import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { skipWithoutOrderSchema } from './order-schema-guard.mjs';

test('0012 keeps existing rows and constrains pending order money, grouping and ownership keys', {
  skip: !process.env.DATABASE_URL,
}, async (context) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const relations = ['checkout_orders', 'shipment_orders', 'shipment_order_lines',
    'order_promotion_allocations', 'order_status_events'];
  async function rejects(sql, args, code) {
    await client.query('SAVEPOINT order_constraint');
    try {
      await assert.rejects(client.query(sql, args), (error) => error.code === code);
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT order_constraint');
      await client.query('RELEASE SAVEPOINT order_constraint');
    }
  }
  try {
    if (await skipWithoutOrderSchema(context, client)) return;
    for (const name of relations) {
      const result = await client.query('SELECT to_regclass($1) AS name', [name]);
      assert.ok(result.rows[0].name, `${name} must exist after 0012`);
    }
    const before = (await client.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n;
    await client.query('BEGIN');
    const accountId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const otherId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const addressId = (await client.query(`INSERT INTO customer_addresses
      (account_id,label,recipient_name,phone,postal_code,line1)
      VALUES ($1,'집','QA 고객','01000000000','12345','시험 주소') RETURNING id`, [accountId])).rows[0].id;
    const reservationId = (await client.query(`INSERT INTO checkout_reservations
      (account_id,idempotency_key,expires_at) VALUES ($1,$2,now()+interval '15 minutes') RETURNING id`,
    [accountId, randomUUID()])).rows[0].id;
    const orderArgs = [accountId, reservationId, randomUUID(), 'a'.repeat(64), addressId,
      'QA 고객', '01000000000', '12345', '시험 주소', '', 50000, 1000, 3000, 1000, 51000];
    const orderSql = `INSERT INTO checkout_orders
      (account_id,reservation_id,idempotency_key,request_fingerprint,address_id,
       recipient_name,phone,postal_code,line1,line2,goods_won,goods_discount_won,
       shipping_fee_won,shipping_support_won,payable_won,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now()+interval '10 minutes') RETURNING id`;
    const orderId = (await client.query(orderSql, orderArgs)).rows[0].id;
    await rejects(orderSql, orderArgs, '23505'); // account + idempotency key
    await rejects(orderSql, [...orderArgs.slice(0, 2), randomUUID(), ...orderArgs.slice(3)], '23505'); // reservation
    await rejects(orderSql, [...orderArgs.slice(0, 14), 51001], '23514'); // exact won arithmetic
    await rejects(orderSql, [...orderArgs.slice(0, 11), -1, ...orderArgs.slice(12)], '23514');
    await rejects(orderSql, [otherId, ...orderArgs.slice(1, 2), randomUUID(), ...orderArgs.slice(3)], '23505');

    const categoryId = (await client.query(`INSERT INTO seller_categories (name)
      VALUES ($1) RETURNING id`, [`QA-${randomUUID()}`])).rows[0].id;
    const sellerId = (await client.query(`INSERT INTO sellers (category_id,display_name)
      VALUES ($1,'QA 판매자') RETURNING id`, [categoryId])).rows[0].id;
    const shipmentArgs = [orderId, `seller:${sellerId}`, 'seller_direct', sellerId,
      50000, 1000, 3000, 1000, 51000];
    const shipmentSql = `INSERT INTO shipment_orders
      (checkout_order_id,shipment_key,shipping_mode,seller_id,goods_won,goods_discount_won,
       shipping_fee_won,shipping_support_won,payable_won)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`;
    await client.query(shipmentSql, shipmentArgs);
    await rejects(shipmentSql, shipmentArgs, '23505');
    await rejects(shipmentSql, [orderId, 'pooled', 'owool_fulfillment', sellerId,
      50000, 1000, 3000, 1000, 51000], '23514');
    await rejects(shipmentSql, [orderId, 'bad-direct', 'seller_direct', null,
      50000, 1000, 3000, 1000, 51000], '23514');
    await rejects(shipmentSql, [orderId, 'bad-money', 'owool_fulfillment', null,
      50000, 1000, 3000, 1000, 51001], '23514');
    await rejects(`INSERT INTO order_status_events (checkout_order_id,status,reason)
      VALUES ($1,'PAID','not allowed before PG')`, [orderId], '23514');
    await client.query('ROLLBACK');
    const after = (await client.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n;
    assert.equal(after, before);
  } finally {
    try { await client.query('ROLLBACK'); } catch { /* connection may already be closed */ }
    client.release();
    await pool.end();
  }
});
