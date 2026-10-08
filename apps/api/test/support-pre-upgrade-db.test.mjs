import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

const phase = process.env.S52_UPGRADE_PHASE;
const name = process.env.S52_SUPPORT_TEST_DB_NAME;
const systemId = process.env.S52_SUPPORT_TEST_DB_SYSTEM_ID;

test('0015 PRE rows survive 0016 unchanged', { skip: !phase }, async () => {
  assert.ok(phase === 'seed' || phase === 'verify');
  assert.ok(['shoppingmall_s52_schema_v2_1007', 'shoppingmall_s52_schema_v3_1007',
    'shoppingmall_s52_schema_v4_1007','shoppingmall_s52_schema_v5_1007',
    'shoppingmall_s52_schema_v6_1007'].includes(name));
  assert.equal(process.env.PGDATABASE, name);
  assert.ok(systemId);
  const pool = new Pool();
  const client = await pool.connect();
  try {
    const identity = (await client.query(`SELECT current_database() AS name,
      system_identifier::text AS system_id FROM pg_control_system()`)).rows[0];
    assert.deepEqual(identity, { name, system_id: systemId });
    const count = (await client.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n;
    assert.equal(count, phase === 'seed' ? 16 : 17);
    if (phase === 'seed') {
      await client.query('BEGIN');
      const customer = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
      const admin = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
      const address = (await client.query(`INSERT INTO customer_addresses
        (account_id,label,recipient_name,phone,postal_code,line1)
        VALUES ($1,'S5.2 upgrade','QA customer','01000000000','12345','isolated QA') RETURNING id`,
      [customer])).rows[0].id;
      const reservation = (await client.query(`INSERT INTO checkout_reservations
        (account_id,idempotency_key,status,expires_at,ended_at)
        VALUES ($1,$2,'CONSUMED',now()+interval '1 hour',now()) RETURNING id`,
      [customer, randomUUID()])).rows[0].id;
      const order = (await client.query(`INSERT INTO checkout_orders
        (account_id,reservation_id,idempotency_key,request_fingerprint,address_id,
         recipient_name,phone,postal_code,line1,goods_won,goods_discount_won,
         shipping_fee_won,shipping_support_won,payable_won,status,expires_at,ended_at,paid_at)
        VALUES ($1,$2,$3,$4,$5,'QA customer','01000000000','12345','isolated QA',
          12000,2000,3000,1000,12000,'PAID',now()+interval '1 hour',now(),now()) RETURNING id`,
      [customer, reservation, randomUUID(), 'a'.repeat(64), address])).rows[0].id;
      const shipment = (await client.query(`INSERT INTO shipment_orders
        (checkout_order_id,shipment_key,shipping_mode,goods_won,goods_discount_won,
         shipping_fee_won,shipping_support_won,payable_won,status)
        VALUES ($1,'owool:qa','owool_fulfillment',12000,2000,3000,1000,12000,'PAID') RETURNING id`,
      [order])).rows[0].id;
      await client.query(`INSERT INTO refund_cases
        (checkout_order_id,shipment_order_id,requester_account_id,requester_role,
         reason_code,reason,idempotency_key,request_fingerprint)
        VALUES ($1,$2,$3,'customer','customer_request','PRE requested',$4,$5)`,
      [order, shipment, customer, randomUUID(), 'b'.repeat(64)]);
      await client.query(`INSERT INTO refund_cases
        (checkout_order_id,shipment_order_id,requester_account_id,requester_role,
         reason_code,reason,idempotency_key,request_fingerprint,
         status,decided_at,decision_by,decision_reason,decision_idempotency_key,
         decision_fingerprint,pre_shipment_evidence,pre_shipment_confirmed_by,
         pre_shipment_confirmed_at,goods_refund_won,shipping_refund_won,total_refund_won)
        VALUES ($1,$2,$3,'customer','customer_request','PRE approved',$4,$5,
          'APPROVED',now(),$6,'approved before dispatch',$7,$8,
          'ADMIN_CONFIRMED_NOT_DISPATCHED',$6,now(),10000,2000,12000)`,
      [order, shipment, customer, randomUUID(), 'c'.repeat(64), admin, randomUUID(), 'd'.repeat(64)]);
      await client.query(`CREATE TABLE s52_pre_upgrade_snapshot AS
        SELECT id,to_jsonb(c) AS payload FROM refund_cases c`);
      await client.query('COMMIT');
    } else {
      const comparison = (await client.query(`SELECT s.id,s.payload,
        to_jsonb(c)-'post_shipment_claim_id' AS actual
        FROM s52_pre_upgrade_snapshot s JOIN refund_cases c ON c.id=s.id ORDER BY s.id`)).rows;
      assert.equal(comparison.length, 2);
      for (const row of comparison) assert.deepEqual(row.actual, row.payload);
      assert.deepEqual(comparison.map((row) => row.payload.status).sort(), ['APPROVED','REQUESTED']);
      const postLinks = (await client.query('SELECT count(*)::int AS n FROM refund_cases WHERE post_shipment_claim_id IS NOT NULL')).rows[0].n;
      assert.equal(postLinks, 0);
    }
  } catch (error) {
    if (phase === 'seed') await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
});
