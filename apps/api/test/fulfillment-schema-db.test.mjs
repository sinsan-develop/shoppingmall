import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { assertOrderMutationQaTarget, skipWithoutFulfillmentSchema } from './order-schema-guard.mjs';

// 전용 인스턴스 확인 후 한 거래에서 시험하며 성공/실패 모두 rollback한다.
test('0015 fulfillment relations enforce settings, state, actor and idempotency contracts', {
  skip: !process.env.S5_SCHEMA_TEST_DB_SYSTEM_ID,
}, async (t) => {
  const pool = new Pool();
  const db = await pool.connect();
  try {
    await assertOrderMutationQaTarget(db, process.env.S5_SCHEMA_TEST_DB_SYSTEM_ID);
    await skipWithoutFulfillmentSchema(t, db, true);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n, 16);
    await db.query('BEGIN');
    const relations = ['fulfillment_settings', 'shipment_fulfillments', 'shipment_fulfillment_events'];
    const fks = (await db.query(`SELECT conrelid::regclass::text AS source,
      confrelid::regclass::text AS target, pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE contype='f' AND conrelid=ANY($1::regclass[])`, [relations])).rows;
    for (const [source, column, target] of [
      ['fulfillment_settings', 'owool_seller_id', 'sellers'],
      ['fulfillment_settings', 'updated_by', 'accounts'],
      ['shipment_fulfillments', 'shipment_order_id', 'shipment_orders'],
      ['shipment_fulfillments', 'fulfillment_seller_id', 'sellers'],
      ['shipment_fulfillment_events', 'shipment_order_id', 'shipment_fulfillments'],
      ['shipment_fulfillment_events', 'actor_account_id', 'accounts'],
      ['shipment_fulfillment_events', 'actor_seller_id', 'sellers'],
    ]) assert.ok(fks.some((fk) => fk.source === source && fk.target === target && fk.def.includes(`(${column})`)), `${source}.${column} FK`);
    const indexes = (await db.query(`SELECT indexdef FROM pg_indexes WHERE tablename=ANY($1)`, [relations])).rows.map(r => r.indexdef).join('\n');
    assert.match(indexes, /UNIQUE INDEX.*\(shipment_order_id, idempotency_scope, idempotency_key\)/);
    assert.match(indexes, /\(fulfillment_seller_id, status, shipment_order_id\)/);
    assert.match(indexes, /\(status, shipment_order_id\)/);
    assert.match(indexes, /\(shipment_order_id, occurred_at\)/);
    const columns = (await db.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='shipment_fulfillment_events' ORDER BY column_name`)).rows.map(r => r.column_name);
    assert.deepEqual(columns, ['action','actor_account_id','actor_role','actor_seller_id','after_snapshot',
      'before_snapshot','customer_message','from_status','id','idempotency_key','idempotency_scope',
      'occurred_at','reason','request_fingerprint','shipment_order_id','to_status']);
    const settings = (await db.query('SELECT id,owool_seller_id,updated_by,version FROM fulfillment_settings')).rows;
    assert.deepEqual(settings, [{ id: 1, owool_seller_id: null, updated_by: null, version: 0 }]);
    async function rejected(sql, values = [], code = '23514') {
      await db.query('SAVEPOINT invalid');
      try { await assert.rejects(db.query(sql, values), e => e.code === code); }
      finally { await db.query('ROLLBACK TO SAVEPOINT invalid'); }
    }
    await rejected('INSERT INTO fulfillment_settings(id) VALUES(2)');
    await rejected('INSERT INTO fulfillment_settings(id) VALUES(1)', [], '23505');
    await rejected('UPDATE fulfillment_settings SET version=-1');
    await rejected('UPDATE fulfillment_settings SET owool_seller_id=$1', [randomUUID()], '23503');
    await rejected('UPDATE fulfillment_settings SET updated_by=$1', [randomUUID()], '23503');
    // LIKE copies actual checks/defaults/indexes. Foreign keys are verified above,
    // while temporary rows cannot seed or mutate existing order/refund ledgers.
    await db.query('CREATE TEMP TABLE qa_fulfillment (LIKE shipment_fulfillments INCLUDING ALL) ON COMMIT DROP');
    await db.query('CREATE TEMP TABLE qa_event (LIKE shipment_fulfillment_events INCLUDING ALL) ON COMMIT DROP');
    const shipment = randomUUID();
    await db.query('INSERT INTO qa_fulfillment(shipment_order_id,fulfillment_seller_id) VALUES($1,$2)', [shipment, randomUUID()]);
    for (const change of ["version=-1", "status='UNKNOWN'", "timezone='UTC'", "cutoff_time='24:00'",
      "cutoff_time='09:60'", "cutoff_time='9:00'", "expected_ship_date='2026-10-06'", "packed_at=now()",
      "shipped_at=now()", "first_shipped_at=now()", "cancelled_at=now()", "tracking_number='ABC'"])
      await rejected('UPDATE qa_fulfillment SET ' + change);
    await rejected("UPDATE qa_fulfillment SET status='READY'");
    await db.query("UPDATE qa_fulfillment SET status='READY',expected_ship_date='2026-10-06',cutoff_time='09:30'");
    await rejected("UPDATE qa_fulfillment SET status='PACKING'");
    await db.query("UPDATE qa_fulfillment SET status='PACKING',packed_at=now()");
    await db.query("UPDATE qa_fulfillment SET status='DELAYED'");
    await rejected("UPDATE qa_fulfillment SET status='SHIPPED'");
    await db.query("UPDATE qa_fulfillment SET status='SHIPPED',carrier_code='cj_logistics',tracking_number='ABC123',first_shipped_at=now(),shipped_at=now()");
    for (const change of ["tracking_number=NULL", "tracking_number='A-123'", "tracking_number=''",
      "tracking_number=repeat('A',51)", "carrier_code=NULL", "carrier_code='unknown'", "carrier_code='other'",
      "carrier_name='unexpected'", "first_shipped_at=NULL", "shipped_at=NULL", "cancelled_at=now()"])
      await rejected('UPDATE qa_fulfillment SET ' + change);
    await db.query("UPDATE qa_fulfillment SET carrier_code='other',carrier_name='시험택배'");
    await rejected("UPDATE qa_fulfillment SET carrier_name=' '");
    await db.query("UPDATE qa_fulfillment SET status='READY',carrier_code=NULL,carrier_name=NULL,tracking_number=NULL,shipped_at=NULL");
    await rejected("UPDATE qa_fulfillment SET status='CANCELLED'");
    await db.query("UPDATE qa_fulfillment SET status='CANCELLED',cancelled_at=now()");
    const actor = randomUUID();
    const key = randomUUID();
    const event = `INSERT INTO qa_event(shipment_order_id,action,from_status,to_status,
      actor_account_id,actor_role,actor_seller_id,before_snapshot,after_snapshot,idempotency_scope,idempotency_key,request_fingerprint)
      VALUES($1,'START_PACKING','READY','PACKING',$2,'seller',$3,'{}','{}',$2::text,$4,$5)`;
    const args = [shipment, actor, randomUUID(), key, 'a'.repeat(64)];
    await db.query(event, args);
    await rejected(event, args, '23505');
    await rejected(event, [...args.slice(0,4), 'b'.repeat(64)], '23505');
    await db.query(event, [randomUUID(), ...args.slice(1)]);
    const other = randomUUID();
    await db.query(event, [shipment, other, args[2], key, args[4]]);
    for (const column of ['idempotency_scope','idempotency_key','request_fingerprint','before_snapshot','after_snapshot'])
      await rejected(`UPDATE qa_event SET ${column}=NULL`, [], '23502');
    for (const change of ["before_snapshot='[]'", "after_snapshot='null'", "request_fingerprint='bad'",
      "idempotency_scope=''", "actor_account_id=NULL", "actor_seller_id=NULL", "actor_role='customer'",
      "from_status='BAD'", "to_status='BAD'", "action='BAD'", "reason=''", "customer_message=repeat('x',501)"])
      await rejected('UPDATE qa_event SET ' + change);
    await rejected("UPDATE qa_event SET action='ADMIN_CORRECT',actor_role='admin',actor_seller_id=NULL");
    await db.query("DELETE FROM qa_event");
    await db.query(event, args);
    await db.query("UPDATE qa_event SET action='ADMIN_CORRECT',actor_role='admin',actor_seller_id=NULL,reason='정정',customer_message='안내'");
    await db.query("UPDATE qa_event SET action='PAYMENT_CONFIRMED',actor_role=NULL,actor_account_id=NULL,idempotency_scope='system:payment'");
    await rejected("UPDATE qa_event SET idempotency_scope='system:refund'");
    await db.query("UPDATE qa_event SET action='REFUND_CANCELLED',idempotency_scope='system:refund'");
  } finally {
    await db.query('ROLLBACK');
    db.release();
    await pool.end();
  }
});
