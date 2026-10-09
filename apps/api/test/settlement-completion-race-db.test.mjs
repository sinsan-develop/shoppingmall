import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { completeSellerPeriodTransaction } from '../src/settlement/complete.ts';
import { recordManualCommission } from '../src/settlement/commission.ts';
import { parseSettlementQuery } from '../src/settlement/query.ts';
import { readSettlement } from '../src/settlement/repository.ts';

test('a transaction committed between completion insert and link selection stays late', {
  skip: !process.env.S6_SETTLEMENT_TEST_DB_SYSTEM_ID,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_s6_schema_1008');
  const pool = new Pool();
  let firstClient;
  let competingClient;
  try {
    const identity = (await pool.query(`SELECT system_identifier::text AS id
      FROM pg_control_system()`)).rows[0].id;
    assert.equal(identity, process.env.S6_SETTLEMENT_TEST_DB_SYSTEM_ID);
    const adminId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await pool.query(`INSERT INTO account_roles(account_id,role) VALUES ($1,'admin')`, [adminId]);
    const categoryId = (await pool.query(`INSERT INTO seller_categories(name)
      VALUES ($1) RETURNING id`, [`S6 경합 ${randomUUID()}`])).rows[0].id;
    const sellerId = (await pool.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,'경합 농가') RETURNING id`, [categoryId])).rows[0].id;
    firstClient = await pool.connect();
    competingClient = await pool.connect();
    const first = await recordManualCommission(firstClient, adminId, { sellerId,
      requestId: randomUUID(), amountWon: 1000, occurredAt: '2026-05-02T00:00:00.000Z',
      reason: '완료 전 수수료' });
    let late;
    let inserted = false;
    const completionPool = { async connect() {
      return { async query(sql, params) {
        const result = await firstClient.query(sql, params);
        if (typeof sql === 'string' && sql.includes('INSERT INTO seller_settlement_periods') && !inserted) {
          inserted = true;
          late = await recordManualCommission(competingClient, adminId, { sellerId,
            requestId: randomUUID(), amountWon: 1200,
            occurredAt: '2026-05-02T00:00:00.000Z', reason: '완료 중 커밋된 수수료' });
        }
        return result;
      }, release() {} };
    } };
    const completed = await completeSellerPeriodTransaction(completionPool, adminId, {
      sellerId, from: '2026-05-01', to: '2026-05-20', reason: '오프라인 확인',
    });
    assert.ok(inserted);
    const report = await readSettlement(firstClient, parseSettlementQuery({
      sellerId, from: '2026-05-01', to: '2026-05-20',
    }));
    assert.equal(completed.sellerId, sellerId);
    assert.deepEqual(report.groups[0].items.map(({ id }) => id), [first.id]);
    assert.deepEqual(report.lateGroups[0].items.map(({ id }) => id), [late.id]);
    assert.equal(report.completions[0].frozenTotals.commission, 1000);
  } finally {
    firstClient?.release();
    competingClient?.release();
    await pool.end();
    // Only the dedicated disposable DB/container may retain the committed QA rows.
  }
});
