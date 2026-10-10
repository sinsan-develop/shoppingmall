import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { completeSellerPeriod } from '../src/settlement/complete.ts';
import { recordCorrection } from '../src/settlement/correction.ts';
import { parseSettlementQuery } from '../src/settlement/query.ts';
import { readSettlement } from '../src/settlement/repository.ts';

const expectedSystemId = process.env.S6_CORRECTION_CATEGORY_TEST_DB_SYSTEM_ID;

test('a correction uses the seller category at correction time, not the original category', {
  skip: !expectedSystemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_s6_correction_1010');
  const pool = new Pool();
  const client = await pool.connect();
  let began = false;
  try {
    const identity = (await client.query(
      'SELECT system_identifier::text AS id FROM pg_control_system()',
    )).rows[0].id;
    assert.equal(identity, expectedSystemId);
    await client.query('BEGIN'); began = true;
    const adminId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const xId = (await client.query("INSERT INTO seller_categories(name) VALUES ('QA 정정 X') RETURNING id")).rows[0].id;
    const yId = (await client.query("INSERT INTO seller_categories(name) VALUES ('QA 정정 Y') RETURNING id")).rows[0].id;
    const sellerId = (await client.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,'QA 정정 판매자') RETURNING id`, [xId])).rows[0].id;
    const originalId = (await client.query(`INSERT INTO settlement_events
      (dedupe_key,kind,amount_won,occurred_at,seller_id,seller_name,
       seller_category_id,seller_category_name,source_event_kind,source_event_id,
       recorded_by,reason)
      VALUES ($1,'commission',10000,clock_timestamp(),$2,'QA 정정 판매자',
        $3,'QA 정정 X','manual_commission',$4,$5,'시험 원사건') RETURNING id`,
    [`qa:${randomUUID()}`, sellerId, xId, randomUUID(), adminId])).rows[0].id;
    await client.query('UPDATE sellers SET category_id=$1 WHERE id=$2', [yId, sellerId]);

    const insertCorrection = (categoryId, categoryName, targetSellerId = sellerId,
      targetOriginalId = originalId) => client.query(`INSERT INTO settlement_events
      (dedupe_key,kind,amount_won,occurred_at,seller_id,seller_name,
       seller_category_id,seller_category_name,source_event_kind,source_event_id,
       original_event_id,correction_direction,recorded_by,reason)
      VALUES ($1,'correction',2000,clock_timestamp(),$2,'QA 정정 판매자',
        $3,$4,'correction',$5,$6,'decrease',$7,'시험 정정')
      RETURNING id,seller_category_id AS "categoryId",seller_category_name AS "categoryName"`,
    [`qa:${randomUUID()}`, targetSellerId, categoryId, categoryName,
      randomUUID(), targetOriginalId, adminId]);

    const correction = (await insertCorrection(yId, 'QA 정정 Y')).rows[0];
    assert.equal(correction.categoryId, yId);
    assert.equal(correction.categoryName, 'QA 정정 Y');
    await client.query('SAVEPOINT wrong_category');
    await assert.rejects(insertCorrection(xId, 'QA 정정 X'),
      (error) => error.code === '23514');
    await client.query('ROLLBACK TO SAVEPOINT wrong_category');
    await client.query('SAVEPOINT wrong_name');
    await assert.rejects(insertCorrection(yId, '원사건 이름'),
      (error) => error.code === '23514');
    await client.query('ROLLBACK TO SAVEPOINT wrong_name');
    const otherSellerId = (await client.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,'QA 다른 판매자') RETURNING id`, [yId])).rows[0].id;
    await client.query('SAVEPOINT wrong_seller');
    await assert.rejects(insertCorrection(yId, 'QA 정정 Y', otherSellerId),
      (error) => error.code === '23514');
    await client.query('ROLLBACK TO SAVEPOINT wrong_seller');
    await client.query('SAVEPOINT correction_chain');
    await assert.rejects(insertCorrection(yId, 'QA 정정 Y', sellerId, correction.id),
      (error) => error.code === '23514');
    await client.query('ROLLBACK TO SAVEPOINT correction_chain');
    const original = (await client.query(`SELECT seller_category_id AS "categoryId"
      FROM settlement_events WHERE id=$1`, [originalId])).rows[0];
    assert.equal(original.categoryId, xId);
    await client.query('SAVEPOINT immutable_original');
    await assert.rejects(client.query('UPDATE settlement_events SET amount_won=1 WHERE id=$1',
      [originalId]), /Settlement history is append-only/);
    await client.query('ROLLBACK TO SAVEPOINT immutable_original');
    await client.query('SAVEPOINT delete_original');
    await assert.rejects(client.query('DELETE FROM settlement_events WHERE id=$1',
      [originalId]), /Settlement history is append-only/);
    await client.query('ROLLBACK TO SAVEPOINT delete_original');
  } finally {
    if (began) await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});

test('admin correction records current Y category and preserves completed X totals', {
  skip: !expectedSystemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_s6_correction_1010');
  const pool = new Pool();
  const client = await pool.connect();
  let began = false;
  try {
    const identity = (await client.query(
      'SELECT system_identifier::text AS id FROM pg_control_system()',
    )).rows[0].id;
    assert.equal(identity, expectedSystemId);
    await client.query('BEGIN'); began = true;
    const adminId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await client.query("INSERT INTO account_roles(account_id,role) VALUES ($1,'admin')", [adminId]);
    const xId = (await client.query("INSERT INTO seller_categories(name) VALUES ('QA 원분류 X') RETURNING id")).rows[0].id;
    const yId = (await client.query("INSERT INTO seller_categories(name) VALUES ('QA 현재분류 Y') RETURNING id")).rows[0].id;
    const sellerId = (await client.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,'QA 정정 판매자') RETURNING id`, [xId])).rows[0].id;
    const originalId = (await client.query(`INSERT INTO settlement_events
      (dedupe_key,kind,amount_won,occurred_at,seller_id,seller_name,
       seller_category_id,seller_category_name,source_event_kind,source_event_id,
       recorded_by,reason)
      VALUES ($1,'commission',10000,'2026-05-01T00:00:00Z',$2,'QA 정정 판매자',
        $3,'QA 원분류 X','manual_commission',$4,$5,'원수수료') RETURNING id`,
    [`qa:${randomUUID()}`, sellerId, xId, randomUUID(), adminId])).rows[0].id;
    await client.query('CREATE SCHEMA qa_clock');
    await client.query(`CREATE FUNCTION qa_clock.statement_timestamp() RETURNS timestamptz
      LANGUAGE sql STABLE AS $$ SELECT TIMESTAMPTZ '2026-05-20 00:00:00+00' $$`);
    await client.query('SET LOCAL search_path = qa_clock, pg_catalog, public');
    const may = await completeSellerPeriod(client, adminId, { sellerId,
      from: '2026-05-01', to: '2026-05-20', reason: '5월 정산' });
    assert.equal(may.completedAt, '2026-05-20T00:00:00.000Z');
    await client.query('UPDATE sellers SET category_id=$1 WHERE id=$2', [yId, sellerId]);
    await client.query(`CREATE OR REPLACE FUNCTION qa_clock.statement_timestamp() RETURNS timestamptz
      LANGUAGE sql STABLE AS $$ SELECT TIMESTAMPTZ '2026-07-01 00:00:00+00' $$`);
    assert.equal((await client.query('SELECT statement_timestamp() AS at')).rows[0].at.toISOString(),
      '2026-07-01T00:00:00.000Z');
    const request = { originalEventId: originalId, requestId: randomUUID(),
      direction: 'decrease', amountWon: 2000, reason: '원수수료 정정' };
    const correction = await recordCorrection(client, adminId, request);
    assert.ok(new Date(may.completedAt).getTime() < new Date(correction.occurredAt).getTime(),
      '5월 정산 완료는 7월 정정보다 먼저 기록돼야 한다');
    assert.equal((await recordCorrection(client, adminId, request)).id, correction.id);
    await assert.rejects(recordCorrection(client, adminId,
      { ...request, amountWon: 3000 }), /Settlement correction request conflict/);
    const sellerActorId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await client.query("INSERT INTO account_roles(account_id,role,seller_id) VALUES ($1,'seller',$2)",
      [sellerActorId, sellerId]);
    await assert.rejects(recordCorrection(client, sellerActorId,
      { ...request, requestId: randomUUID() }), /Settlement correction access denied/);
    await assert.rejects(recordCorrection(client, adminId,
      { ...request, requestId: randomUUID(), amountWon: 11000 }),
    /Settlement correction exceeds original amount/);
    const event = (await client.query(`SELECT seller_category_id AS "categoryId",
      seller_category_name AS "categoryName" FROM settlement_events WHERE id=$1`,
    [correction.id])).rows[0];
    assert.equal(event.categoryId, yId);
    assert.equal(event.categoryName, 'QA 현재분류 Y');
    await client.query("UPDATE seller_categories SET name='QA 나중에 변경된 Y' WHERE id=$1", [yId]);
    assert.equal((await recordCorrection(client, adminId, request)).id, correction.id);
    assert.equal((await client.query(`SELECT seller_category_name AS name
      FROM settlement_events WHERE id=$1`, [correction.id])).rows[0].name,
    'QA 현재분류 Y');
    await client.query('UPDATE sellers SET category_id=$1 WHERE id=$2', [xId, sellerId]);
    assert.equal((await recordCorrection(client, adminId, request)).id, correction.id);
    assert.equal((await client.query(`SELECT count(*)::int AS n FROM settlement_events
      WHERE original_event_id=$1`, [originalId])).rows[0].n, 1);
    const mayReport = await readSettlement(client, parseSettlementQuery({
      from: '2026-05-01', to: '2026-05-20', categoryId: xId,
    }));
    assert.equal(mayReport.completions.find((entry) => entry.id === may.id)?.frozenTotals.commission,
      10000);
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul',
      year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(correction.occurredAt));
    assert.equal(today, '2026-07-01');
    const yReport = await readSettlement(client, parseSettlementQuery({
      from: today, to: today, categoryId: yId,
    }));
    assert.equal(yReport.totals.commission, -2000);
    assert.equal(yReport.groups.flatMap((group) => group.items)
      .find((item) => item.id === correction.id)?.originalEventId, originalId);
    const xReport = await readSettlement(client, parseSettlementQuery({
      from: today, to: today, categoryId: xId,
    }));
    assert.equal(xReport.totals.commission, 0);
    const all = await readSettlement(client, parseSettlementQuery({
      from: '2026-05-01', to: today, sellerId,
    }));
    assert.equal(all.totals.commission, 8000);
  } finally {
    if (began) await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});

test('an increased correction belongs to current Y while the original stays in X', {
  skip: !expectedSystemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_s6_correction_1010');
  const pool = new Pool();
  const client = await pool.connect();
  let began = false;
  try {
    const identity = (await client.query(
      'SELECT system_identifier::text AS id FROM pg_control_system()',
    )).rows[0].id;
    assert.equal(identity, expectedSystemId);
    await client.query('BEGIN'); began = true;
    const adminId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await client.query("INSERT INTO account_roles(account_id,role) VALUES ($1,'admin')", [adminId]);
    const xId = (await client.query("INSERT INTO seller_categories(name) VALUES ('QA 증가 X') RETURNING id")).rows[0].id;
    const yId = (await client.query("INSERT INTO seller_categories(name) VALUES ('QA 증가 Y') RETURNING id")).rows[0].id;
    const sellerId = (await client.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,'QA 증가 판매자') RETURNING id`, [xId])).rows[0].id;
    const originalEvent = (await client.query(`INSERT INTO settlement_events
      (dedupe_key,kind,amount_won,occurred_at,seller_id,seller_name,
       seller_category_id,seller_category_name,source_event_kind,source_event_id,
       recorded_by,reason)
      VALUES ($1,'commission',10000,clock_timestamp() - interval '2 days',$2,'QA 증가 판매자',
        $3,'QA 증가 X','manual_commission',$4,$5,'증가 원사건')
      RETURNING id,occurred_at AS "occurredAt"`,
    [`qa:${randomUUID()}`, sellerId, xId, randomUUID(), adminId])).rows[0];
    const originalId = originalEvent.id;
    await client.query('UPDATE sellers SET category_id=$1 WHERE id=$2', [yId, sellerId]);
    const correction = await recordCorrection(client, adminId, {
      originalEventId: originalId, requestId: randomUUID(),
      direction: 'increase', amountWon: 2000, reason: '원수수료 증가 정정',
    });
    const stored = (await client.query(`SELECT seller_category_id AS "categoryId",
      seller_category_name AS "categoryName",original_event_id AS "originalId"
      FROM settlement_events WHERE id=$1`, [correction.id])).rows[0];
    assert.deepEqual(stored, { categoryId: yId, categoryName: 'QA 증가 Y', originalId });
    const original = (await client.query(`SELECT amount_won::int AS amount,
      seller_category_id AS "categoryId" FROM settlement_events WHERE id=$1`,
    [originalId])).rows[0];
    assert.deepEqual(original, { amount: 10000, categoryId: xId });
    const seoulDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul',
      year: 'numeric', month: '2-digit', day: '2-digit' });
    const filter = { from: seoulDay.format(new Date(originalEvent.occurredAt)),
      to: seoulDay.format(new Date(correction.occurredAt)), sellerId };
    const xReport = await readSettlement(client, parseSettlementQuery({ ...filter, categoryId: xId }));
    const yReport = await readSettlement(client, parseSettlementQuery({ ...filter, categoryId: yId }));
    const allReport = await readSettlement(client, parseSettlementQuery(filter));
    assert.equal(xReport.totals.commission, 10000);
    assert.equal(yReport.totals.commission, 2000);
    assert.equal(allReport.totals.commission, 12000);
    assert.equal(yReport.groups.flatMap((group) => group.items)
      .find((item) => item.id === correction.id)?.originalEventId, originalId);
  } finally {
    if (began) await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});

test('concurrent seller or category changes wait until the correction snapshot commits', {
  skip: !expectedSystemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_s6_correction_1010');
  const pool = new Pool({ max: 3 });
  const setup = await pool.connect();
  const writer = await pool.connect();
  const updater = await pool.connect();
  let writing = false;
  try {
    const identity = (await setup.query(
      'SELECT system_identifier::text AS id FROM pg_control_system()',
    )).rows[0].id;
    assert.equal(identity, expectedSystemId);
    const suffix = randomUUID().slice(0, 8);
    const adminId = (await setup.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await setup.query("INSERT INTO account_roles(account_id,role) VALUES ($1,'admin')", [adminId]);
    const xId = (await setup.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id',
      [`QA 경합 X ${suffix}`])).rows[0].id;
    const yName = `QA 경합 Y ${suffix}`;
    const yId = (await setup.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id',
      [yName])).rows[0].id;
    const sellerId = (await setup.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,$2) RETURNING id`, [yId, `QA 경합 판매자 ${suffix}`])).rows[0].id;
    const originalId = (await setup.query(`INSERT INTO settlement_events
      (dedupe_key,kind,amount_won,occurred_at,seller_id,seller_name,
       seller_category_id,seller_category_name,source_event_kind,source_event_id,
       recorded_by,reason)
      VALUES ($1,'commission',10000,clock_timestamp(),$2,$3,
        $4,$5,'manual_commission',$6,$7,'과거 X 사건') RETURNING id`,
    [`qa:${randomUUID()}`, sellerId, `QA 경합 판매자 ${suffix}`,
      xId, `QA 경합 X ${suffix}`, randomUUID(), adminId])).rows[0].id;
    await writer.query('BEGIN'); writing = true;
    const correction = await recordCorrection(writer, adminId, {
      originalEventId: originalId, requestId: randomUUID(),
      direction: 'decrease', amountWon: 1000, reason: '경합 확인',
    });
    await updater.query('BEGIN');
    await updater.query("SET LOCAL lock_timeout='150ms'");
    await assert.rejects(updater.query('UPDATE sellers SET category_id=$1 WHERE id=$2',
      [xId, sellerId]), (error) => error.code === '55P03');
    await updater.query('ROLLBACK');
    await updater.query('BEGIN');
    await updater.query("SET LOCAL lock_timeout='150ms'");
    await assert.rejects(updater.query('UPDATE seller_categories SET name=$1 WHERE id=$2',
      [`QA 변경 Y ${suffix}`, yId]), (error) => error.code === '55P03');
    await updater.query('ROLLBACK');
    await writer.query('COMMIT'); writing = false;
    await updater.query('UPDATE sellers SET category_id=$1 WHERE id=$2', [xId, sellerId]);
    const stored = (await setup.query(`SELECT seller_category_id AS "categoryId",
      seller_category_name AS "categoryName" FROM settlement_events WHERE id=$1`,
    [correction.id])).rows[0];
    assert.equal(stored.categoryId, yId);
    assert.equal(stored.categoryName, yName);

    const secondSource = randomUUID();
    const secondOriginalId = (await setup.query(`INSERT INTO settlement_events
      (dedupe_key,kind,amount_won,occurred_at,seller_id,seller_name,
       seller_category_id,seller_category_name,source_event_kind,source_event_id,
       recorded_by,reason)
      VALUES ($1,'commission',10000,clock_timestamp(),$2,$3,
        $4,$5,'manual_commission',$6,$7,'분류 선변경 경합 원사건') RETURNING id`,
    [`qa:${secondSource}`, sellerId, `QA 경합 판매자 ${suffix}`,
      xId, `QA 경합 X ${suffix}`, secondSource, adminId])).rows[0].id;
    await updater.query('BEGIN');
    await updater.query('UPDATE sellers SET category_id=$1 WHERE id=$2', [yId, sellerId]);
    await writer.query('BEGIN'); writing = true;
    const writerPid = (await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const secondRequestId = randomUUID();
    const secondInput = {
      originalEventId: secondOriginalId, requestId: secondRequestId,
      direction: 'decrease', amountWon: 1000, reason: '분류 선변경 경합 확인',
    };
    const secondCorrection = recordCorrection(writer, adminId, secondInput);
    let waiting = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const activity = (await setup.query(`SELECT wait_event_type AS "waitType"
        FROM pg_stat_activity WHERE pid=$1`, [writerPid])).rows[0];
      if (activity?.waitType === 'Lock') { waiting = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(waiting, true, 'correction must wait for the prior category update');
    await updater.query('COMMIT');
    let afterUpdate;
    try {
      afterUpdate = await secondCorrection;
      await writer.query('COMMIT'); writing = false;
    } catch (error) {
      assert.match(String(error), /Settlement correction seller category missing|Settlement correction seller category mismatch/);
      await writer.query('ROLLBACK'); writing = false;
      assert.equal((await setup.query(`SELECT count(*)::int AS n FROM settlement_events
        WHERE dedupe_key=$1`, [`correction:${secondRequestId}`])).rows[0].n, 0);
      await writer.query('BEGIN'); writing = true;
      afterUpdate = await recordCorrection(writer, adminId, secondInput);
      await writer.query('COMMIT'); writing = false;
    }
    const secondStored = (await setup.query(`SELECT seller_category_id AS "categoryId",
      seller_category_name AS "categoryName" FROM settlement_events WHERE id=$1`,
    [afterUpdate.id])).rows[0];
    assert.equal(secondStored.categoryId, yId);
    assert.equal(secondStored.categoryName, yName);
  } finally {
    if (writing) await writer.query('ROLLBACK');
    await updater.query('ROLLBACK');
    setup.release(); writer.release(); updater.release();
    await pool.end();
  }
});
