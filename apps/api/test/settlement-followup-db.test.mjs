import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { completeSellerPeriod } from '../src/settlement/complete.ts';
import { recordCorrection, recordCorrectionTransaction } from '../src/settlement/correction.ts';
import { parseSettlementQuery } from '../src/settlement/query.ts';
import { readSettlement } from '../src/settlement/repository.ts';
import { createSessionToken, hashSessionToken } from '../src/auth/credentials.ts';
import { createApp } from '../src/app.ts';

test('isolated DB records immutable signed correction after completion', {
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
    assert.equal(history, 23);
    await client.query('BEGIN'); began = true;
    const adminId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await client.query(`INSERT INTO account_roles(account_id,role) VALUES ($1,'admin')`, [adminId]);
    const categoryA = (await client.query(`INSERT INTO seller_categories(name)
      VALUES ('QA 당시 분류 A') RETURNING id`)).rows[0].id;
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
    const request = { originalEventId, requestId: randomUUID(), direction: 'decrease',
      amountWon: 2000, reason: '입력 오류 정정' };
    const correction = await recordCorrection(client, adminId, request);
    assert.equal((await recordCorrection(client, adminId, request)).id, correction.id);
    await assert.rejects(() => recordCorrection(client, adminId,
      { ...request, amountWon: 3000 }), /Settlement correction request conflict/);
    await assert.rejects(() => recordCorrection(client, adminId,
      { ...request, requestId: randomUUID(), amountWon: 11000 }),
    /Settlement correction exceeds original amount/);
    const aReport = await readSettlement(client, parseSettlementQuery({ from: '2026-05-01',
      to: '2026-05-20', categoryId: categoryA }));
    assert.equal(aReport.completions.find((entry) => entry.id === may.id)?.frozenTotals.commission,
      10000);
    const mixedSellerId = (await client.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,'QA 타 판매자') RETURNING id`, [categoryA])).rows[0].id;
    const all = await readSettlement(client, parseSettlementQuery({ from: '2026-01-01',
      to: '2026-12-31', sellerId }));
    assert.equal(all.totals.commission, 8000);
    assert.equal(all.totals.correction, 2000);
    assert.equal(all.groups.flatMap((group) => group.items)
      .find((item) => item.id === correction.id)?.originalEventId,
      originalEventId);
    await client.query('SAVEPOINT immutable_check');
    await assert.rejects(client.query('UPDATE settlement_events SET amount_won=1 WHERE id=$1',
      [originalEventId]), /Settlement history is append-only/);
    await client.query('ROLLBACK TO SAVEPOINT immutable_check');
    for (const [label, targetId, targetSellerId, targetSellerName] of [
      ['foreign_seller', originalEventId, mixedSellerId, 'QA 타 판매자'],
      ['correction_chain', correction.id, sellerId, 'QA 판매자'],
    ]) {
      await client.query(`SAVEPOINT ${label}`);
      await assert.rejects(client.query(`INSERT INTO settlement_events
        (dedupe_key,kind,amount_won,occurred_at,seller_id,seller_name,
         seller_category_id,seller_category_name,source_event_kind,source_event_id,
         original_event_id,correction_direction,recorded_by,reason)
        VALUES ($1,'correction',1,statement_timestamp(),$2,$3,$4,
          'QA 당시 분류 A','correction',$5,$6,'increase',$7,'거부 시험')`,
      [`qa:${randomUUID()}`, targetSellerId, targetSellerName, categoryA,
        randomUUID(), targetId, adminId]), (error) => error.code === '23514');
      await client.query(`ROLLBACK TO SAVEPOINT ${label}`);
    }
  } finally {
    if (began) await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});

test('isolated HTTP enforces admin-only corrections and exposes dated seller evidence', {
  skip: !process.env.S6_FOLLOWUP_TEST_DB_SYSTEM_ID,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_s6_followup_1009');
  const pool = new Pool();
  let app;
  try {
    const systemId = (await pool.query('SELECT system_identifier::text AS id FROM pg_control_system()'))
      .rows[0].id;
    assert.equal(systemId, process.env.S6_FOLLOWUP_TEST_DB_SYSTEM_ID);
    const adminId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const sellerActor = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const runTag = randomUUID().slice(0, 8);
    const categoryId = (await pool.query(`INSERT INTO seller_categories(name)
      VALUES ($1) RETURNING id`, [`QA HTTP 분류 ${runTag}`])).rows[0].id;
    const sellerId = (await pool.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,'QA HTTP 판매자') RETURNING id`, [categoryId])).rows[0].id;
    await pool.query(`INSERT INTO account_roles(account_id,role,seller_id)
      VALUES ($1,'admin',NULL),($2,'seller',$3)`, [adminId, sellerActor, sellerId]);
    const originalEventId = (await pool.query(`INSERT INTO settlement_events
      (dedupe_key,kind,amount_won,occurred_at,seller_id,seller_name,
       seller_category_id,seller_category_name,source_event_kind,source_event_id,
       recorded_by,reason)
      VALUES ($1,'commission',10000,'2026-05-01T00:00:00Z',$2,'QA HTTP 판매자',
        $3,'QA HTTP 분류','manual_commission',$4,$5,'원수수료') RETURNING id`,
    [`qa:${randomUUID()}`, sellerId, categoryId, randomUUID(), adminId])).rows[0].id;
    async function cookie(accountId, role, scope = null) {
      const token = createSessionToken();
      await pool.query(`INSERT INTO auth_sessions(account_id,role,seller_id,token_hash,expires_at)
        VALUES ($1,$2,$3,$4,now() + interval '1 hour')`,
      [accountId, role, scope, hashSessionToken(token)]);
      return `sm_session=${token}`;
    }
    const admin = await cookie(adminId, 'admin');
    const seller = await cookie(sellerActor, 'seller', sellerId);
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const url = `${base}/admin/settlement/corrections`;
    const body = { originalEventId, requestId: randomUUID(), direction: 'decrease',
      amountWon: 2000, reason: 'HTTP 오입력 정정' };
    const headers = { origin: 'http://127.0.0.1:9091', 'content-type': 'application/json' };
    const send = (cookieValue, payload = body, origin = true) => fetch(url, {
      method: 'POST', headers: { ...headers, ...(origin ? {} : { origin: '' }),
        cookie: cookieValue }, body: JSON.stringify(payload),
    });
    assert.equal((await send(seller)).status, 403);
    assert.equal((await send(admin, body, false)).status, 403);
    const created = await send(admin);
    assert.equal(created.status, 201);
    const correctionId = (await created.json()).id;
    assert.equal((await (await send(admin)).json()).id, correctionId);
    assert.equal((await send(admin, { ...body, amountWon: 3000 })).status, 409);
    assert.equal((await send(admin, { ...body, requestId: randomUUID(), amountWon: 11000 })).status, 409);
    const query = '?from=2026-01-01&to=2026-12-31';
    const adminReport = await fetch(`${base}/admin/settlement${query}&sellerId=${sellerId}`, {
      headers: { cookie: admin },
    });
    assert.equal(adminReport.status, 200);
    const report = await adminReport.json();
    assert.equal(report.totals.commission, 8000);
    assert.equal(report.groups[0].items.find((item) => item.id === correctionId)?.originalEventId,
      originalEventId);
    const sellerReport = await fetch(`${base}/seller/settlement${query}`, {
      headers: { cookie: seller },
    });
    assert.equal(sellerReport.status, 200);
    assert.equal((await sellerReport.json()).totals.commission, 8000);
  } finally {
    if (app) await app.close();
    await pool.end();
    // Only the named disposable PostgreSQL container contains these test rows.
  }
});

test('concurrent decreases lock one original and reject the second over-correction', {
  skip: !process.env.S6_FOLLOWUP_TEST_DB_SYSTEM_ID,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_s6_followup_1009');
  const pool = new Pool();
  try {
    const systemId = (await pool.query('SELECT system_identifier::text AS id FROM pg_control_system()'))
      .rows[0].id;
    assert.equal(systemId, process.env.S6_FOLLOWUP_TEST_DB_SYSTEM_ID);
    const run = randomUUID().slice(0, 8);
    const adminId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await pool.query(`INSERT INTO account_roles(account_id,role) VALUES ($1,'admin')`, [adminId]);
    const categoryId = (await pool.query(`INSERT INTO seller_categories(name)
      VALUES ($1) RETURNING id`, [`QA 동시 정정 ${run}`])).rows[0].id;
    const sellerId = (await pool.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,$2) RETURNING id`, [categoryId, `QA 동시 판매자 ${run}`])).rows[0].id;
    const originalEventId = (await pool.query(`INSERT INTO settlement_events
      (dedupe_key,kind,amount_won,occurred_at,seller_id,seller_name,
       seller_category_id,seller_category_name,source_event_kind,source_event_id,
       recorded_by,reason)
      VALUES ($1,'commission',10000,'2026-05-01T00:00:00Z',$2,$3,
        $4,$5,'manual_commission',$6,$7,'동시 정정 원본') RETURNING id`,
    [`qa:${randomUUID()}`, sellerId, `QA 동시 판매자 ${run}`, categoryId,
      `QA 동시 정정 ${run}`, randomUUID(), adminId])).rows[0].id;
    const results = await Promise.allSettled([randomUUID(), randomUUID()].map((requestId) =>
      recordCorrectionTransaction(pool, adminId, { originalEventId, requestId,
        direction: 'decrease', amountWon: 7000, reason: '동시 감소 시험' })));
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected' &&
      /Settlement correction exceeds original amount/.test(String(result.reason))).length, 1);
    const saved = (await pool.query(`SELECT count(*)::int AS n,
      coalesce(sum(amount_won),0)::int AS amount FROM settlement_events
      WHERE original_event_id=$1`, [originalEventId])).rows[0];
    assert.deepEqual(saved, { n: 1, amount: 7000 });
  } finally { await pool.end(); }
});
