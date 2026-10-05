import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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

    const outsideSellerCategory = (await pool.query(
      'INSERT INTO seller_categories(name) VALUES ($1) RETURNING id', [`external-${runId}`])).rows[0].id;
    const outsideSeller = (await pool.query(
      'INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [outsideSellerCategory, `external-${runId}`])).rows[0].id;
    const outsideProductCategory = (await pool.query(
      'INSERT INTO product_categories(name) VALUES ($1) RETURNING id', [`external-${runId}`])).rows[0].id;
    const outsideProduct = (await pool.query(
      'INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
      [outsideSeller, outsideProductCategory])).rows[0].id;
    const outsideRevision = (await pool.query(`INSERT INTO product_revisions
      (product_id,version,title,description,origin_label,shipping_mode,status,proposed_by_account_id)
      VALUES ($1,1,'external','external','external','seller_direct','draft',$2) RETURNING id`,
    [outsideProduct, outsider])).rows[0].id;
    const outsideOption = (await pool.query(
      "INSERT INTO product_options(revision_id,name,price_won) VALUES ($1,'external',1000) RETURNING id",
      [outsideRevision])).rows[0].id;
    await pool.query('INSERT INTO checkout_reservation_lines(reservation_id,option_id,quantity) VALUES ($1,$2,1)',
      [manifest.reservationId, outsideOption]);
    await assert.rejects(runRefundUiFixture('reset', runId, url, undefined, consent, manifest), /reservation|foreign product/);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM checkout_reservation_lines WHERE reservation_id=$1 AND option_id=$2',
      [manifest.reservationId, outsideOption])).rows[0].count, 1);
    await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=$1 AND option_id=$2',
      [manifest.reservationId, outsideOption]);

    const foreignShipment = (await pool.query(`INSERT INTO shipment_orders
      (checkout_order_id,shipment_key,shipping_mode,seller_id,goods_won,goods_discount_won,
       shipping_fee_won,shipping_support_won,payable_won,status)
      VALUES ($1,$2,'seller_direct',$3,1000,0,0,0,1000,'PAID') RETURNING id`,
    [manifest.orderId, `external:${outsideSeller}`, outsideSeller])).rows[0].id;
    await assert.rejects(runRefundUiFixture('reset', runId, url, undefined, consent, manifest), /shipment/);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM shipment_orders WHERE id=$1',
      [foreignShipment])).rows[0].count, 1);
    await pool.query('DELETE FROM shipment_orders WHERE id=$1', [foreignShipment]);

    await pool.query(`INSERT INTO shipment_order_lines
      (shipment_order_id,product_id,option_id,seller_id,product_name,option_name,
       unit_price_won,quantity,goods_discount_won,goods_payable_won)
      VALUES ($1,$2,$3,$4,'external','external',1000,1,0,1000)`,
    [manifest.shipmentId, manifest.productId, outsideOption, outsideSeller]);
    await assert.rejects(runRefundUiFixture('reset', runId, url, undefined, consent, manifest), /shipment/);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM shipment_order_lines WHERE shipment_order_id=$1 AND option_id=$2',
      [manifest.shipmentId, outsideOption])).rows[0].count, 1);
    await pool.query('DELETE FROM shipment_order_lines WHERE shipment_order_id=$1 AND option_id=$2',
      [manifest.shipmentId, outsideOption]);

    await pool.query('DELETE FROM product_options WHERE id=$1', [outsideOption]);
    await pool.query('DELETE FROM product_revisions WHERE id=$1', [outsideRevision]);
    await pool.query('DELETE FROM products WHERE id=$1', [outsideProduct]);
    await pool.query('DELETE FROM product_categories WHERE id=$1', [outsideProductCategory]);
    await pool.query('DELETE FROM sellers WHERE id=$1', [outsideSeller]);
    await pool.query('DELETE FROM seller_categories WHERE id=$1', [outsideSellerCategory]);

    const foreignTargetAudit = (await pool.query(`INSERT INTO audit_events
      (actor_account_id,active_role,action,target_type,target_id)
      VALUES ($1,'admin','qa.external','account',$2) RETURNING id`,
    [manifest.accountIds[2], outsider])).rows[0].id;
    await assert.rejects(runRefundUiFixture('reset', runId, url, undefined, consent, manifest), /audit/);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM audit_events WHERE id=$1',
      [foreignTargetAudit])).rows[0].count, 1);
    await pool.query('DELETE FROM audit_events WHERE id=$1', [foreignTargetAudit]);

    const foreignActorAudit = (await pool.query(`INSERT INTO audit_events
      (actor_account_id,active_role,action,target_type,target_id)
      VALUES ($1,'customer','qa.external','product',$2) RETURNING id`,
    [outsider, manifest.productId])).rows[0].id;
    await assert.rejects(runRefundUiFixture('reset', runId, url, undefined, consent, manifest), /audit/);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM audit_events WHERE id=$1',
      [foreignActorAudit])).rows[0].count, 1);
    await pool.query('DELETE FROM audit_events WHERE id=$1', [foreignActorAudit]);

    await pool.query(`INSERT INTO audit_events
      (actor_account_id,active_role,action,target_type,target_id)
      SELECT $1,'admin','qa.excess','account',$2 FROM generate_series(1,101)`,
    [manifest.accountIds[2], manifest.accountIds[0]]);
    await assert.rejects(runRefundUiFixture('reset', runId, url, undefined, consent, manifest), /audit/);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE action='qa.excess'",
      [])).rows[0].count, 101);
    await pool.query("DELETE FROM audit_events WHERE action='qa.excess' AND actor_account_id=$1",
      [manifest.accountIds[2]]);

    const auditWriter = await pool.connect();
    try {
      await auditWriter.query('BEGIN');
      const lateAudit = (await auditWriter.query(`INSERT INTO audit_events
        (actor_account_id,active_role,action,target_type,target_id)
        VALUES ($1,'customer','qa.concurrent','product',$2) RETURNING id`,
      [outsider, manifest.productId])).rows[0].id;
      const pendingReset = runRefundUiFixture('reset', runId, url, undefined, consent, manifest);
      pendingReset.catch(() => {});
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        blocked = (await pool.query(`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
            AND wait_event_type='Lock' AND query LIKE 'LOCK TABLE audit_events%'
        ) AS blocked`)).rows[0].blocked;
        if (blocked) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(blocked, true, 'reset must wait for the uncommitted external audit');
      await auditWriter.query('COMMIT');
      await assert.rejects(pendingReset, /audit/);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM audit_events WHERE id=$1',
        [lateAudit])).rows[0].count, 1);
      await pool.query('DELETE FROM audit_events WHERE id=$1', [lateAudit]);
    } finally {
      await auditWriter.query('ROLLBACK').catch(() => {});
      auditWriter.release();
    }

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
      await pool.query('DELETE FROM accounts WHERE id=$1', [outsider]).catch(() => {
        // A RED assertion can leave foreign rows in this throwaway tmpfs database.
      });
    }
    await pool.end();
  }
});

test('shared reset preserves conflicts whose incoming attempt belongs to another order', {
  skip: !privateTarget,
}, async () => {
  const runId = 'e4251005';
  const consent = `SHARED_S4_REFUND_UI_${runId}`;
  const manifest = await runRefundUiFixture('seed', runId, url, 'virtual-test-only-123456', consent);
  const pool = new Pool({ connectionString: url });
  const fp = 'd'.repeat(64);
  let outsider; let address; let reservation; let order; let shipment; let paymentAttempt;
  let paymentConflict; let qaRefundCase; let otherRefundCase; let qaRefundAttempt;
  let otherRefundAttempt; let qaRefundEvent; let refundConflict;
  try {
    outsider = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    address = (await pool.query(`INSERT INTO customer_addresses
      (account_id,label,recipient_name,phone,postal_code,line1)
      VALUES ($1,'outside','outside','01000000000','12345','outside') RETURNING id`,
    [outsider])).rows[0].id;
    reservation = (await pool.query(`INSERT INTO checkout_reservations
      (account_id,idempotency_key,status,expires_at,ended_at)
      VALUES ($1,$2,'CONSUMED',now()+interval '1 hour',now()) RETURNING id`,
    [outsider, randomUUID()])).rows[0].id;
    order = (await pool.query(`INSERT INTO checkout_orders
      (account_id,reservation_id,idempotency_key,request_fingerprint,address_id,recipient_name,phone,
       postal_code,line1,goods_won,goods_discount_won,shipping_fee_won,shipping_support_won,
       payable_won,status,expires_at,ended_at,paid_at)
      VALUES ($1,$2,$3,$4,$5,'outside','01000000000','12345','outside',1000,0,0,0,
        1000,'PAID',now()+interval '1 hour',now(),now()) RETURNING id`,
    [outsider, reservation, randomUUID(), fp, address])).rows[0].id;
    shipment = (await pool.query(`INSERT INTO shipment_orders
      (checkout_order_id,shipment_key,shipping_mode,goods_won,goods_discount_won,
       shipping_fee_won,shipping_support_won,payable_won,status)
      VALUES ($1,'outside','owool_fulfillment',1000,0,0,0,1000,'PAID') RETURNING id`,
    [order])).rows[0].id;
    paymentAttempt = (await pool.query(`INSERT INTO payment_attempts
      (checkout_order_id,provider,provider_order_id,requested_won,idempotency_key,request_fingerprint,status)
      VALUES ($1,'mock',$2,1000,$3,$4,'PENDING') RETURNING id`,
    [order, `mock:outside:${order}`, randomUUID(), fp])).rows[0].id;
    const qaPaymentAttempt = (await pool.query(
      'SELECT id FROM payment_attempts WHERE checkout_order_id=$1', [manifest.orderId])).rows[0].id;
    const qaPaymentEvent = (await pool.query(
      'SELECT id FROM payment_events WHERE payment_attempt_id=$1', [qaPaymentAttempt])).rows[0].id;
    paymentConflict = (await pool.query(`INSERT INTO payment_event_conflicts
      (original_event_id,incoming_attempt_id,incoming_fingerprint,reason)
      VALUES ($1,$2,$3,'ATTEMPT_MISMATCH') RETURNING id`,
    [qaPaymentEvent, paymentAttempt, fp])).rows[0].id;
    await assert.rejects(runRefundUiFixture('reset', runId, url, undefined, consent, manifest), /foreign.*conflict/);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM payment_event_conflicts WHERE id=$1',
      [paymentConflict])).rows[0].count, 1);
    await pool.query('DELETE FROM payment_event_conflicts WHERE id=$1', [paymentConflict]);
    paymentConflict = undefined;

    qaRefundCase = (await pool.query(`INSERT INTO refund_cases
      (checkout_order_id,shipment_order_id,requester_account_id,requester_role,
       reason_code,reason,idempotency_key,request_fingerprint)
      VALUES ($1,$2,$3,'customer','customer_request','test',$4,$5) RETURNING id`,
    [manifest.orderId, manifest.shipmentId, manifest.accountIds[0], randomUUID(), fp])).rows[0].id;
    otherRefundCase = (await pool.query(`INSERT INTO refund_cases
      (checkout_order_id,shipment_order_id,requester_account_id,requester_role,
       reason_code,reason,idempotency_key,request_fingerprint)
      VALUES ($1,$2,$3,'customer','customer_request','test',$4,$5) RETURNING id`,
    [order, shipment, outsider, randomUUID(), fp])).rows[0].id;
    qaRefundAttempt = (await pool.query(`INSERT INTO refund_attempts
      (refund_case_id,payment_attempt_id,provider,provider_refund_id,requested_won,
       idempotency_key,request_fingerprint,status)
      VALUES ($1,$2,'mock',$3,0,$4,$5,'PENDING') RETURNING id`,
    [qaRefundCase, qaPaymentAttempt, `mock:refund:${randomUUID()}`, randomUUID(), fp])).rows[0].id;
    otherRefundAttempt = (await pool.query(`INSERT INTO refund_attempts
      (refund_case_id,payment_attempt_id,provider,provider_refund_id,requested_won,
       idempotency_key,request_fingerprint,status)
      VALUES ($1,$2,'mock',$3,0,$4,$5,'PENDING') RETURNING id`,
    [otherRefundCase, paymentAttempt, `mock:refund:${randomUUID()}`, randomUUID(), fp])).rows[0].id;
    qaRefundEvent = (await pool.query(`INSERT INTO refund_events
      (refund_attempt_id,provider,provider_event_id,outcome,verified_order_id,
       provider_payment_id,provider_refund_id,amount_won,event_fingerprint)
      VALUES ($1,'mock',$2,'SUCCEEDED',$3,$4,$5,0,$6) RETURNING id`,
    [qaRefundAttempt, `mock:event:${randomUUID()}`, manifest.orderId,
      `mock:payment:${randomUUID()}`, `mock:refund:${randomUUID()}`, fp])).rows[0].id;
    refundConflict = (await pool.query(`INSERT INTO refund_event_conflicts
      (original_event_id,incoming_attempt_id,incoming_fingerprint,reason)
      VALUES ($1,$2,$3,'ATTEMPT_MISMATCH') RETURNING id`,
    [qaRefundEvent, otherRefundAttempt, fp])).rows[0].id;
    await assert.rejects(runRefundUiFixture('reset', runId, url, undefined, consent, manifest), /foreign.*conflict/);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM refund_event_conflicts WHERE id=$1',
      [refundConflict])).rows[0].count, 1);
    await pool.query('DELETE FROM refund_event_conflicts WHERE id=$1', [refundConflict]);
    refundConflict = undefined;
  } finally {
    for (const [table, id] of [
      ['payment_event_conflicts', paymentConflict], ['refund_event_conflicts', refundConflict],
      ['refund_events', qaRefundEvent], ['refund_attempts', qaRefundAttempt],
      ['refund_attempts', otherRefundAttempt], ['refund_cases', qaRefundCase],
      ['refund_cases', otherRefundCase], ['payment_attempts', paymentAttempt],
      ['shipment_orders', shipment], ['checkout_orders', order],
      ['checkout_reservations', reservation], ['customer_addresses', address], ['accounts', outsider],
    ]) {
      if (id) await pool.query(`DELETE FROM ${table} WHERE id=$1`, [id]).catch(() => {});
    }
    await pool.end();
  }
  await runRefundUiFixture('reset', runId, url, undefined, consent, manifest);
});
