import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { parseSettlementQuery } from '../src/settlement/query.ts';
import { readSettlement } from '../src/settlement/repository.ts';

const databaseName = 'shoppingmall_s6_schema_1008';
const systemId = process.env.S6_SETTLEMENT_TEST_DB_SYSTEM_ID;

test('actual ledger read preserves category, seller and occurrence-period boundaries', {
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
    const adminId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const categories = (await client.query(`INSERT INTO seller_categories(name)
      VALUES ('S6 농가'),('S6 자체') RETURNING id,name`)).rows;
    const farmCategory = categories.find(({ name }) => name === 'S6 농가').id;
    const ownCategory = categories.find(({ name }) => name === 'S6 자체').id;
    const farmA = (await client.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,'농가 A') RETURNING id`, [farmCategory])).rows[0].id;
    const farmB = (await client.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,'농가 B') RETURNING id`, [farmCategory])).rows[0].id;
    const owool = (await client.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,'어울몰') RETURNING id`, [ownCategory])).rows[0].id;
    for (const [sellerId, sellerName, categoryId, categoryName, occurredAt, amountWon] of [
      [farmA, '농가 A', farmCategory, 'S6 농가', '2026-05-01T00:00:00Z', 1000],
      [farmB, '농가 B', farmCategory, 'S6 농가', '2026-05-02T00:00:00Z', 2000],
      [owool, '어울몰', ownCategory, 'S6 자체', '2026-05-02T00:00:00Z', 3000],
      [farmA, '농가 A', farmCategory, 'S6 농가', '2026-07-01T00:00:00Z', 4000],
    ]) {
      const sourceId = randomUUID();
      await client.query(`INSERT INTO settlement_events
        (dedupe_key,kind,amount_won,occurred_at,seller_id,seller_name,
         seller_category_id,seller_category_name,source_event_kind,source_event_id,
         recorded_by,reason)
        VALUES ($1,'commission',$2,$3,$4,$5,$6,$7,'manual_commission',$8,$9,'시험 근거')`,
      [`manual:${sourceId}`, amountWon, occurredAt, sellerId, sellerName,
        categoryId, categoryName, sourceId, adminId]);
    }
    const all = await readSettlement(client, parseSettlementQuery({ from: '2026-05-01',
      to: '2026-05-20' }));
    assert.deepEqual(all.groups.map(({ sellerName, totals }) => [sellerName, totals.commission]),
      [['농가 A', 1000], ['농가 B', 2000], ['어울몰', 3000]]);
    assert.equal(all.totals.commission, 6000);
    const farms = await readSettlement(client, parseSettlementQuery({ from: '2026-05-01',
      to: '2026-05-20', categoryId: farmCategory }));
    assert.equal(farms.totals.commission, 3000);
    assert.equal(farms.groups.length, 2);
    const july = await readSettlement(client, parseSettlementQuery({ from: '2026-07-01',
      to: '2026-07-01', sellerId: farmA }));
    assert.equal(july.totals.commission, 4000);
    assert.equal(july.groups.length, 1);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
