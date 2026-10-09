import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { completeSellerPeriod } from '../src/settlement/complete.ts';
import { recordCorrection } from '../src/settlement/correction.ts';
import { parseSettlementQuery } from '../src/settlement/query.ts';
import { readSettlement } from '../src/settlement/repository.ts';

test('isolated DB fixes category history and records immutable signed correction after completion', {
  skip: !process.env.S6_FOLLOWUP_TEST_DB_SYSTEM_ID,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_s6_followup_1009');
  const pool = new Pool();
  const client = await pool.connect();
  let began = false;
  try {
    const systemId = (await client.query('SELECT system_identifier::text AS id FROM pg_control_system()'))
      .rows[0].id;
    assert.equal(systemId, process.env.S6_FOLLOWUP_TEST_DB_SYSTEM_ID);
    const history = (await client.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations'))
      .rows[0].n;
    assert.equal(history, 24);
    await client.query('BEGIN'); began = true;
    const adminId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await client.query(`INSERT INTO account_roles(account_id,role) VALUES ($1,'admin')`, [adminId]);
    const categoryA = (await client.query(`INSERT INTO seller_categories(name)
      VALUES ('QA 당시 분류 A') RETURNING id`)).rows[0].id;
    const categoryB = (await client.query(`INSERT INTO seller_categories(name)
      VALUES ('QA 현재 분류 B') RETURNING id`)).rows[0].id;
    const sellerId = (await client.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,'QA 판매자') RETURNING id`, [categoryA])).rows[0].id;
    const originalEventId = (await client.query(`INSERT INTO settlement_events
      (dedupe_key,kind,amount_won,occurred_at,seller_id,seller_name,
       seller_category_id,seller_category_name,source_event_kind,source_event_id,
       recorded_by,reason)
      VALUES ($1,'commission',10000,'2026-05-01T00:00:00Z',$2,'QA 판매자',
        $3,'QA 당시 분류 A','manual_commission',$4,$5,'원수수료') RETURNING id`,
    [`qa:${randomUUID()}`, sellerId, categoryA, randomUUID(), adminId])).rows[0].id;
    const may = await completeSellerPeriod(client, adminId, { sellerId,
      from: '2026-05-01', to: '2026-05-20', reason: '5월 완료' });
    await client.query('UPDATE sellers SET category_id=$1 WHERE id=$2', [categoryB, sellerId]);
    const request = { originalEventId, requestId: randomUUID(), direction: 'decrease',
      amountWon: 2000, reason: '입력 오류 정정' };
    const correction = await recordCorrection(client, adminId, request);
    assert.equal((await recordCorrection(client, adminId, request)).id, correction.id);
    await assert.rejects(() => recordCorrection(client, adminId,
      { ...request, amountWon: 3000 }), /Settlement correction request conflict/);
    await assert.rejects(() => recordCorrection(client, adminId,
      { ...request, requestId: randomUUID(), amountWon: 11000 }),
    /Settlement correction exceeds original amount/);
    await client.query('SAVEPOINT immutable_check');
    await assert.rejects(client.query('UPDATE settlement_events SET amount_won=1 WHERE id=$1',
      [originalEventId]), /Settlement history is append-only/);
    await client.query('ROLLBACK TO SAVEPOINT immutable_check');
    const aReport = await readSettlement(client, parseSettlementQuery({ from: '2026-05-01',
      to: '2026-05-20', categoryId: categoryA }));
    assert.equal(aReport.completions.find((entry) => entry.id === may.id)?.frozenTotals.commission,
      10000);
    const bReport = await readSettlement(client, parseSettlementQuery({ from: '2026-05-01',
      to: '2026-05-20', categoryId: categoryB }));
    assert.equal(bReport.completions.length, 0);
    const empty = await completeSellerPeriod(client, adminId, { sellerId,
      from: '2026-06-01', to: '2026-06-30', reason: '0원 완료' });
    const june = await readSettlement(client, parseSettlementQuery({ from: '2026-06-01',
      to: '2026-06-30', categoryId: categoryB }));
    assert.equal(june.completions.find((entry) => entry.id === empty.id)?.frozenTotals.sale, 0);
    const all = await readSettlement(client, parseSettlementQuery({ from: '2026-01-01',
      to: '2026-12-31' }));
    assert.equal(all.totals.commission, 8000);
    assert.equal(all.totals.correction, 2000);
    assert.equal(all.groups[0].items.find((item) => item.id === correction.id)?.originalEventId,
      originalEventId);
  } finally {
    if (began) await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
