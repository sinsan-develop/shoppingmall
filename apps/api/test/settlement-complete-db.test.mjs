import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { completeSellerPeriod } from '../src/settlement/complete.ts';

test('only admin completes one seller period; overlap is rejected without affecting another seller', {
  skip: !process.env.S6_SETTLEMENT_TEST_DB_SYSTEM_ID,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_s6_schema_1008');
  const pool = new Pool();
  const client = await pool.connect();
  try {
    const identity = (await client.query('SELECT system_identifier::text AS id FROM pg_control_system()'))
      .rows[0].id;
    assert.equal(identity, process.env.S6_SETTLEMENT_TEST_DB_SYSTEM_ID);
    await client.query('BEGIN');
    const admin = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const sellerActor = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await client.query(`INSERT INTO account_roles(account_id,role) VALUES ($1,'admin')`, [admin]);
    const category = (await client.query(`INSERT INTO seller_categories(name)
      VALUES ('S6 완료 시험') RETURNING id`)).rows[0].id;
    const sellers = (await client.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,'농가 A'),($1,'농가 B') RETURNING id`, [category])).rows.map(({ id }) => id);
    await client.query(`INSERT INTO account_roles(account_id,role,seller_id)
      VALUES ($1,'seller',$2)`, [sellerActor, sellers[0]]);
    const period = { sellerId: sellers[0], from: '2026-05-01', to: '2026-05-20',
      reason: '오프라인 송금 확인' };
    await assert.rejects(() => completeSellerPeriod(client, sellerActor, period),
      /Settlement access denied/);
    const completed = await completeSellerPeriod(client, admin, period);
    assert.equal(completed.sellerId, sellers[0]);
    assert.equal(completed.startDate, period.from);
    assert.equal(completed.endDate, period.to);
    await client.query('SAVEPOINT overlapping_period');
    await assert.rejects(() => completeSellerPeriod(client, admin, {
      ...period, from: '2026-05-20', to: '2026-05-31' }),
    (error) => error.code === '23P01');
    await client.query('ROLLBACK TO SAVEPOINT overlapping_period');
    await completeSellerPeriod(client, admin, { ...period, sellerId: sellers[1] });
    const rows = await client.query(`SELECT seller_id FROM seller_settlement_periods
      ORDER BY seller_id`);
    assert.deepEqual(rows.rows.map(({ seller_id }) => seller_id).sort(), sellers.sort());
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
