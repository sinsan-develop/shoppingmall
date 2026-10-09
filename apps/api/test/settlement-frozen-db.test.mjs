import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { completeSellerPeriod } from '../src/settlement/complete.ts';
import { recordManualCommission } from '../src/settlement/commission.ts';
import { parseSettlementQuery } from '../src/settlement/query.ts';
import { readSettlement } from '../src/settlement/repository.ts';

test('real DB freezes member events, isolates backdated commission and rejects invalid links', {
  skip: !process.env.S6_SETTLEMENT_TEST_DB_SYSTEM_ID,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_s6_schema_1008');
  const pool = new Pool();
  const client = await pool.connect();
  let inTransaction = false;
  try {
    const identity = (await client.query(`SELECT system_identifier::text AS id
      FROM pg_control_system()`)).rows[0].id;
    assert.equal(identity, process.env.S6_SETTLEMENT_TEST_DB_SYSTEM_ID);
    await client.query('BEGIN'); inTransaction = true;
    const adminId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await client.query(`INSERT INTO account_roles(account_id,role) VALUES ($1,'admin')`, [adminId]);
    const categoryId = (await client.query(`INSERT INTO seller_categories(name)
      VALUES ($1) RETURNING id`, [`S6 고정 시험 ${randomUUID()}`])).rows[0].id;
    const [sellerA, sellerB] = (await client.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,'농가 A'),($1,'농가 B') RETURNING id`, [categoryId])).rows.map(({ id }) => id);
    const before = await recordManualCommission(client, adminId, { sellerId: sellerA,
      requestId: randomUUID(), amountWon: 1000, occurredAt: '2026-05-02T00:00:00.000Z',
      reason: '완료 전 수수료' });
    const bEvent = await recordManualCommission(client, adminId, { sellerId: sellerB,
      requestId: randomUUID(), amountWon: 500, occurredAt: '2026-05-02T00:00:00.000Z',
      reason: 'B 수수료' });
    const completed = await completeSellerPeriod(client, adminId, { sellerId: sellerA,
      from: '2026-05-01', to: '2026-05-20', reason: '오프라인 확인' });
    async function rejected(statement, values, code) {
      await client.query('SAVEPOINT bad_link');
      try {
        await assert.rejects(client.query(statement, values), (error) => error.code === code);
      } finally { await client.query('ROLLBACK TO SAVEPOINT bad_link'); }
    }
    await rejected(`INSERT INTO seller_settlement_period_event_links(period_id,event_id)
      VALUES ($1,$2)`, [completed.id, before.id], '23505');
    await rejected(`INSERT INTO seller_settlement_period_event_links(period_id,event_id)
      VALUES ($1,$2)`, [completed.id, bEvent.id], '23514');
    await rejected(`UPDATE seller_settlement_period_event_links SET event_id=$2 WHERE event_id=$1`,
      [before.id, bEvent.id], 'P0001');
    await client.query('COMMIT'); inTransaction = false;
    await client.query('BEGIN'); inTransaction = true;
    const lateInput = { sellerId: sellerA, requestId: randomUUID(), amountWon: 1200,
      occurredAt: '2026-05-02T00:00:00.000Z', reason: '뒤늦은 5월 수수료' };
    const late = await recordManualCommission(client, adminId, lateInput);
    assert.equal((await recordManualCommission(client, adminId, lateInput)).id, late.id);
    await assert.rejects(() => recordManualCommission(client, adminId, {
      ...lateInput, amountWon: 1300 }), /Manual commission request conflict/);
    const report = await readSettlement(client, parseSettlementQuery({
      from: '2026-05-01', to: '2026-05-20', sellerId: sellerA,
    }));
    assert.deepEqual(report.groups[0].items.map(({ id }) => id), [before.id]);
    assert.deepEqual(report.lateGroups[0].items.map(({ id }) => id), [late.id]);
    assert.equal(report.totals.commission, 1000);
    assert.equal(report.lateTotals.commission, 1200);
    assert.equal(report.completions[0].frozenTotals.commission, 1000);
    assert.equal((await client.query(`SELECT count(*)::int AS n
      FROM seller_settlement_period_event_links WHERE period_id=$1`, [completed.id])).rows[0].n, 1);
    await rejected(`INSERT INTO seller_settlement_period_event_links(period_id,event_id)
      VALUES ($1,$2)`, [completed.id, late.id], '23514');
  } finally {
    if (inTransaction) await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
