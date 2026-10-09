import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { completeSellerPeriod } from '../src/settlement/complete.ts';
import { parseSettlementQuery } from '../src/settlement/query.ts';
import { readSettlement } from '../src/settlement/repository.ts';

const databaseName = 'shoppingmall_s6_schema_1008';
const systemId = process.env.S6_SETTLEMENT_TEST_DB_SYSTEM_ID;

test('zero-event completion keeps its completion-time category after seller changes', {
  skip: !systemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, databaseName);
  const pool = new Pool();
  const client = await pool.connect();
  try {
    const identity = (await client.query(`SELECT current_database() AS name,
      system_identifier::text AS system_id FROM pg_control_system()`)).rows[0];
    assert.deepEqual(identity, { name: databaseName, system_id: systemId });
    await client.query('BEGIN');
    const admin = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await client.query(`INSERT INTO account_roles(account_id,role) VALUES ($1,'admin')`, [admin]);
    const x = (await client.query(`INSERT INTO seller_categories(name)
      VALUES ('완료 당시 X') RETURNING id`)).rows[0].id;
    const y = (await client.query(`INSERT INTO seller_categories(name)
      VALUES ('현재 Y') RETURNING id`)).rows[0].id;
    const seller = (await client.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,'분류 변경 판매자') RETURNING id`, [x])).rows[0].id;
    const completed = await completeSellerPeriod(client, admin, { sellerId: seller,
      from: '2026-05-01', to: '2026-05-20', reason: '0건 확인' });
    const snapshot = (await client.query(`SELECT seller_category_id_at_completion AS id,
      seller_category_name_at_completion AS name FROM seller_settlement_periods
      WHERE id=$1`, [completed.id])).rows[0];
    assert.deepEqual(snapshot, { id: x, name: '완료 당시 X' });
    await client.query('UPDATE sellers SET category_id=$1 WHERE id=$2', [y, seller]);
    await client.query('UPDATE seller_categories SET name=$1 WHERE id=$2', ['변경된 X', x]);
    const xReport = await readSettlement(client, parseSettlementQuery({
      from: '2026-05-01', to: '2026-05-20', categoryId: x }));
    const yReport = await readSettlement(client, parseSettlementQuery({
      from: '2026-05-01', to: '2026-05-20', categoryId: y }));
    assert.deepEqual(xReport.completions.map(({ id, frozenTotals }) =>
      [id, frozenTotals.sale]), [[completed.id, 0]]);
    assert.equal(xReport.completions[0].sellerCategoryIdAtCompletion, x);
    assert.equal(xReport.completions[0].sellerCategoryNameAtCompletion, '완료 당시 X');
    assert.equal(yReport.completions.length, 0);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});

test('one completion splits linked X and Y event totals without changing whole-period amount', {
  skip: !systemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, databaseName);
  const pool = new Pool();
  const client = await pool.connect();
  try {
    const identity = (await client.query(`SELECT system_identifier::text AS id
      FROM pg_control_system()`)).rows[0].id;
    assert.equal(identity, systemId);
    await client.query('BEGIN');
    const admin = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await client.query(`INSERT INTO account_roles(account_id,role) VALUES ($1,'admin')`, [admin]);
    const x = (await client.query(`INSERT INTO seller_categories(name)
      VALUES ('혼합 X') RETURNING id`)).rows[0].id;
    const y = (await client.query(`INSERT INTO seller_categories(name)
      VALUES ('혼합 Y') RETURNING id`)).rows[0].id;
    const seller = (await client.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,'혼합 판매자') RETURNING id`, [x])).rows[0].id;
    for (const [categoryId, categoryName, occurredAt, amount] of [
      [x, '혼합 X', '2026-05-01T00:00:00Z', 10000],
      [y, '혼합 Y', '2026-05-02T00:00:00Z', 4000],
    ]) {
      const source = randomUUID();
      await client.query(`INSERT INTO settlement_events
        (dedupe_key,kind,amount_won,occurred_at,seller_id,seller_name,
         seller_category_id,seller_category_name,source_event_kind,source_event_id,
         recorded_by,reason)
        VALUES ($1,'commission',$2,$3,$4,'혼합 판매자',$5,$6,
          'manual_commission',$7,$8,'분류 이력 시험')`,
      [`manual:${source}`, amount, occurredAt, seller, categoryId, categoryName,
        source, admin]);
    }
    await client.query('UPDATE sellers SET category_id=$1 WHERE id=$2', [y, seller]);
    const completed = await completeSellerPeriod(client, admin, { sellerId: seller,
      from: '2026-05-01', to: '2026-05-20', reason: '혼합 기간 확인' });
    const filters = { from: '2026-05-01', to: '2026-05-20', sellerId: seller };
    const all = await readSettlement(client, parseSettlementQuery(filters));
    const xReport = await readSettlement(client, parseSettlementQuery({ ...filters, categoryId: x }));
    const yReport = await readSettlement(client, parseSettlementQuery({ ...filters, categoryId: y }));
    assert.deepEqual([all, xReport, yReport].map((report) =>
      [report.totals.commission, report.completions.map((row) =>
        [row.id, row.frozenTotals.commission])]), [
      [14000, [[completed.id, 14000]]],
      [10000, [[completed.id, 10000]]],
      [4000, [[completed.id, 4000]]],
    ]);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
