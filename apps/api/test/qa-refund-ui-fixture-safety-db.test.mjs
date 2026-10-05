import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { runRefundUiFixture, resetRefundUiFixture } from '../scripts/qa-refund-ui-fixture.ts';

const url = process.env.QA_REFUND_FIXTURE_SAFETY_DATABASE_URL;
const privateTarget = (() => {
  if (!url) return false;
  const parsed = new URL(url);
  return parsed.hostname === 'shoppingmall-s4-fixture-pg-1005' && parsed.pathname === '/shoppingmall';
})();

test('shared-fixture reset rejects foreign identity/reference and blocks a late foreign cart insert', {
  skip: !privateTarget,
}, async () => {
  const runId = 'e4241005';
  const consent = `SHARED_S4_REFUND_UI_${runId}`;
  const manifest = await runRefundUiFixture('seed', runId, url, 'virtual-test-only-123456', consent);
  const pool = new Pool({ connectionString: url, max: 5 });
  let outsider;
  let lockedClient;
  let inserter;
  let releaseReset;
  try {
    await pool.query(`INSERT INTO account_identities(account_id,kind,identifier)
      VALUES ($1,'kakao',$2)`, [manifest.accountIds[0], `qa-${runId}-external-link`]);
    await assert.rejects(runRefundUiFixture('reset', runId, url, undefined, consent, manifest), /foreign account/);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM checkout_orders WHERE id=$1',
      [manifest.orderId])).rows[0].count, 1);
    await pool.query(`DELETE FROM account_identities WHERE account_id=$1 AND kind='kakao' AND identifier=$2`,
      [manifest.accountIds[0], `qa-${runId}-external-link`]);

    outsider = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await pool.query('INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,1)',
      [outsider, manifest.optionId]);
    await assert.rejects(runRefundUiFixture('reset', runId, url, undefined, consent, manifest), /foreign account/);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM customer_cart_items WHERE account_id=$1',
      [outsider])).rows[0].count, 1);
    await pool.query('DELETE FROM customer_cart_items WHERE account_id=$1 AND option_id=$2',
      [outsider, manifest.optionId]);

    lockedClient = await pool.connect();
    await lockedClient.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    let paused;
    const reachedDelete = new Promise((resolve) => { paused = resolve; });
    const resume = new Promise((resolve) => { releaseReset = resolve; });
    const wrapper = { query: async (sql, args) => {
      if (sql.startsWith('DELETE FROM refund_event_conflicts')) { paused(); await resume; }
      return lockedClient.query(sql, args);
    } };
    const reset = resetRefundUiFixture(wrapper, runId, 4, manifest);
    reset.catch(() => {});
    let deadline;
    try {
      await Promise.race([reachedDelete, new Promise((_, reject) => {
        deadline = setTimeout(() => reject(Error('reset did not reach first delete')), 10000);
      })]);
    } finally { clearTimeout(deadline); }
    inserter = await pool.connect();
    await inserter.query("SET lock_timeout='5s'");
    const insertPid = (await inserter.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const insert = inserter.query('INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,1)',
      [outsider, manifest.optionId]);
    insert.catch(() => {});
    let blocked = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      blocked = (await pool.query('SELECT cardinality(pg_blocking_pids($1))>0 AS blocked',
        [insertPid])).rows[0].blocked;
      if (blocked) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(blocked, true, 'foreign insert must wait on QA option lock');
    releaseReset();
    await reset;
    await lockedClient.query('COMMIT');
    await assert.rejects(insert, (error) => error.code === '23503');
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM accounts WHERE id=$1',
      [outsider])).rows[0].count, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM accounts WHERE id=ANY($1::uuid[])',
      [manifest.accountIds])).rows[0].count, 0);
  } finally {
    releaseReset?.();
    if (lockedClient) {
      await lockedClient.query('ROLLBACK').catch(() => {});
      lockedClient.release();
    }
    inserter?.release();
    if (outsider) {
      await pool.query('DELETE FROM customer_cart_items WHERE account_id=$1', [outsider]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [outsider]);
    }
    await pool.end();
  }
});
