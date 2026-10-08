import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { hashSessionToken } from '../src/auth/credentials.ts';
import { createClaim, approveClaim } from '../src/support/claims.ts';
import { MockRefundAdapter } from '../src/refunds/mock-adapter.ts';
import { createRefundCase, decideRefundCase, recordVerifiedRefundEvent } from
  '../src/refunds/service.ts';
import { processVerifiedRefundEvent } from '../src/refunds/processor.ts';

const database = 'shoppingmall_s52_schema_v8_1007';
const systemId = process.env.S52_SUPPORT_TEST_DB_SYSTEM_ID;
const fingerprint = 'a'.repeat(64);

for (const scenario of ['success','failed','mismatch','duplicate_pending',
  'duplicate_final','pre_shipped','pre_success','http_success','http_resume',
  'concurrent_decision'])
test(`${scenario === 'pre_success' ? 'PRE' : 'POST'} refund ${scenario} preserves its shipment contract`, {
  skip: !systemId || process.env.S52_SUPPORT_TEST_DB_NAME !== database,
}, async () => {
  assert.equal(process.env.PGDATABASE, database);
  const pool = new Pool({ max: 6 });
  const ids = {};
  const quantity = scenario === 'concurrent_decision' ? 2 : 1;
  const totalWon = 10000 * quantity;
  let seeded = false;
  let app;
  const previousRuntime = { APP_ENV: process.env.APP_ENV,
    PAYMENT_MODE: process.env.PAYMENT_MODE };
  try {
    const identity = (await pool.query(`SELECT current_database() AS name,
      system_identifier::text AS system_id FROM pg_control_system()`)).rows[0];
    assert.deepEqual(identity, { name: database,system_id: systemId });
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations'))
      .rows[0].n, 19);
    for (const relation of ['accounts','checkout_orders','support_claims','refund_cases'])
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${relation}`)).rows[0].n, 0,
        `fresh disposable DB must have no ${relation}`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      ids.customer = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
      ids.admin = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
      ids.sellerActor = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
      await client.query(`INSERT INTO account_roles(account_id,role) VALUES
        ($1,'customer'),($2,'admin')`, [ids.customer,ids.admin]);
      ids.sellerCategory = (await client.query(`INSERT INTO seller_categories(name)
        VALUES ($1) RETURNING id`, [`s52-post-${randomUUID()}`])).rows[0].id;
      ids.seller = (await client.query(`INSERT INTO sellers(category_id,display_name)
        VALUES ($1,$2) RETURNING id`, [ids.sellerCategory,`s52-post-${randomUUID()}`]))
        .rows[0].id;
      await client.query(`INSERT INTO account_roles(account_id,role,seller_id)
        VALUES ($1,'seller',$2)`, [ids.sellerActor,ids.seller]);
      ids.category = (await client.query(`INSERT INTO product_categories(name)
        VALUES ($1) RETURNING id`, [`s52-post-${randomUUID()}`])).rows[0].id;
      ids.product = (await client.query(`INSERT INTO products(seller_id,category_id)
        VALUES ($1,$2) RETURNING id`, [ids.seller,ids.category])).rows[0].id;
      ids.revision = (await client.query(`INSERT INTO product_revisions
        (product_id,version,title,description,origin_label,shipping_mode,status,
         proposed_by_account_id,reviewed_by_account_id,reviewed_at)
        VALUES ($1,1,'POST 환불 시험','설명','산지','owool_fulfillment','approved',
          $2,$3,now()) RETURNING id`, [ids.product,ids.sellerActor,ids.admin])).rows[0].id;
      ids.option = (await client.query(`INSERT INTO product_options
        (revision_id,name,price_won) VALUES ($1,'기본',10000) RETURNING id`,
      [ids.revision])).rows[0].id;
      await client.query(`INSERT INTO inventory_levels
        (option_id,on_hand_quantity,sellable_quantity) VALUES ($1,5,5)`, [ids.option]);
      ids.address = (await client.query(`INSERT INTO customer_addresses
        (account_id,label,recipient_name,phone,postal_code,line1)
        VALUES ($1,'시험','가상고객','01000000000','12345','가상 주소') RETURNING id`,
      [ids.customer])).rows[0].id;
      ids.reservation = (await client.query(`INSERT INTO checkout_reservations
        (account_id,idempotency_key,status,created_at,expires_at,ended_at)
        VALUES ($1,$2,'CONSUMED',now()-interval '2 hours',
          now()+interval '1 hour',now()-interval '1 hour') RETURNING id`,
      [ids.customer,randomUUID()])).rows[0].id;
      await client.query(`INSERT INTO checkout_reservation_lines(reservation_id,option_id,quantity)
        VALUES ($1,$2,$3)`, [ids.reservation,ids.option,quantity]);
      ids.order = (await client.query(`INSERT INTO checkout_orders
        (account_id,reservation_id,idempotency_key,request_fingerprint,address_id,
         recipient_name,phone,postal_code,line1,goods_won,goods_discount_won,
         shipping_fee_won,shipping_support_won,payable_won,status,
         created_at,expires_at,ended_at,paid_at)
        VALUES ($1,$2,$3,$4,$5,'가상고객','01000000000','12345','가상 주소',
          $6,0,0,0,$6,'PAID',now()-interval '2 hours',
          now()+interval '1 hour',now()-interval '1 hour',now()-interval '1 hour')
        RETURNING id`, [ids.customer,ids.reservation,randomUUID(),fingerprint,
          ids.address,totalWon])).rows[0].id;
      ids.shipment = (await client.query(`INSERT INTO shipment_orders
        (checkout_order_id,shipment_key,shipping_mode,seller_id,goods_won,
         goods_discount_won,shipping_fee_won,shipping_support_won,payable_won,status)
        VALUES ($1,$2,'owool_fulfillment',NULL,$3,0,0,0,$3,'PAID') RETURNING id`,
      [ids.order,`owool:${randomUUID()}`,totalWon])).rows[0].id;
      await client.query(`INSERT INTO shipment_order_lines
        (shipment_order_id,product_id,option_id,seller_id,product_name,option_name,
         unit_price_won,quantity,goods_discount_won,goods_payable_won)
        VALUES ($1,$2,$3,$4,'POST 환불 시험','기본',10000,$5,0,$6)`,
      [ids.shipment,ids.product,ids.option,ids.seller,quantity,totalWon]);
      if (scenario === 'pre_success') await client.query(`INSERT INTO shipment_fulfillments
        (shipment_order_id,fulfillment_seller_id,status,expected_ship_date)
        VALUES ($1,$2,'READY','2026-10-10')`, [ids.shipment,ids.seller]);
      else await client.query(`INSERT INTO shipment_fulfillments
        (shipment_order_id,fulfillment_seller_id,status,expected_ship_date,carrier_code,
         tracking_number,packed_at,first_shipped_at,shipped_at)
        VALUES ($1,$2,'SHIPPED','2026-10-10','hanjin','QA123456',
          now()-interval '40 minutes',now()-interval '30 minutes',
          now()-interval '30 minutes')`, [ids.shipment,ids.seller]);
      if (scenario !== 'pre_success') await client.query(`INSERT INTO shipment_fulfillment_events
        (shipment_order_id,action,from_status,to_status,actor_account_id,actor_role,
         actor_seller_id,before_snapshot,after_snapshot,idempotency_scope,
         idempotency_key,request_fingerprint)
        VALUES ($1,'MARK_SHIPPED','PACKING','SHIPPED',$2,'seller',$3,
          $4::jsonb,$5::jsonb,$8,$6,$7)`, [ids.shipment,ids.sellerActor,
        ids.seller,JSON.stringify({ status: 'PACKING' }),
        JSON.stringify({ status: 'SHIPPED' }),randomUUID(),fingerprint,
        ids.sellerActor]);
      ids.paymentAttempt = (await client.query(`INSERT INTO payment_attempts
        (checkout_order_id,provider,provider_order_id,requested_won,idempotency_key,
         request_fingerprint,status,ended_at)
        VALUES ($1,'mock',$2,$5,$3,$4,'APPROVED',now()) RETURNING id`,
      [ids.order,`mock:order:${ids.order}`,randomUUID(),fingerprint,totalWon])).rows[0].id;
      ids.paymentId = `mock:payment:${randomUUID()}`;
      await client.query(`INSERT INTO payment_events
        (payment_attempt_id,provider,provider_event_id,outcome,verified_order_id,
         provider_payment_id,amount_won,event_fingerprint,processing_status,processed_at)
        VALUES ($1,'mock',$2,'APPROVED',$3,$4,$6,$5,'APPLIED',now())`,
      [ids.paymentAttempt,`mock:event:${randomUUID()}`,ids.order,ids.paymentId,fingerprint,
        totalWon]);
      await client.query('COMMIT');
      seeded = true;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }

    const before = (await pool.query(`SELECT o.payable_won AS order_won,
      s.goods_won AS shipment_goods,s.payable_won AS shipment_won,
      f.status AS fulfillment_status,f.version,f.carrier_code,f.tracking_number,
      f.first_shipped_at,f.shipped_at,i.on_hand_quantity,i.sellable_quantity
      FROM checkout_orders o JOIN shipment_orders s ON s.checkout_order_id=o.id
      JOIN shipment_fulfillments f ON f.shipment_order_id=s.id
      JOIN inventory_levels i ON i.option_id=$2 WHERE o.id=$1`,
    [ids.order,ids.option])).rows[0];
    if (scenario === 'concurrent_decision') {
      const first = await createClaim(pool, { customerAccountId: ids.customer,
        orderId: ids.order,shipmentOrderId: ids.shipment,optionId: ids.option,
        kind: 'RETURN',reasonCode: 'damaged',reason: '첫 번째 훼손 품목',
        quantity: 1,idempotencyKey: randomUUID() });
      ids.claim = first.id;
      const second = await createClaim(pool, { customerAccountId: ids.customer,
        orderId: ids.order,shipmentOrderId: ids.shipment,optionId: ids.option,
        kind: 'RETURN',reasonCode: 'damaged',reason: '두 번째 훼손 품목',
        quantity: 1,idempotencyKey: randomUUID() });
      ids.claimTwo = second.id;
      const key = randomUUID();
      const decide = (claimId) => approveClaim(pool, { claimId,
        adminAccountId: ids.admin,reason: '동시 결정키 경합',idempotencyKey: key },
      { APP_ENV: 'development',PAYMENT_MODE: 'mock' });
      const results = await Promise.allSettled([decide(first.id),decide(second.id)]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.filter((result) => result.status === 'rejected' &&
        result.reason.message === 'Support conflict').length, 1);
      const winner = results[0].status === 'fulfilled' ? first.id : second.id;
      const loser = winner === first.id ? second.id : first.id;
      assert.equal((await decide(winner)).status, 'REFUND_PROCESSING');
      await assert.rejects(() => decide(loser), /Support conflict/);
      assert.deepEqual((await pool.query(`SELECT
        (SELECT count(*)::int FROM refund_cases WHERE checkout_order_id=$1) AS cases,
        (SELECT count(*)::int FROM refund_attempts a JOIN refund_cases c
          ON c.id=a.refund_case_id WHERE c.checkout_order_id=$1) AS attempts,
        (SELECT count(*)::int FROM support_claims WHERE decision_by=$2) AS decisions`,
      [ids.order,ids.admin])).rows[0], { cases: 1,attempts: 1,decisions: 1 });
      assert.equal((await pool.query(`SELECT status FROM support_claims WHERE id=$1`,
        [loser])).rows[0].status, 'REQUESTED');
      const after = (await pool.query(`SELECT o.payable_won AS order_won,
        s.goods_won AS shipment_goods,s.payable_won AS shipment_won,
        f.status AS fulfillment_status,f.version,f.carrier_code,f.tracking_number,
        f.first_shipped_at,f.shipped_at,i.on_hand_quantity,i.sellable_quantity
        FROM checkout_orders o JOIN shipment_orders s ON s.checkout_order_id=o.id
        JOIN shipment_fulfillments f ON f.shipment_order_id=s.id
        JOIN inventory_levels i ON i.option_id=$2 WHERE o.id=$1`,
      [ids.order,ids.option])).rows[0];
      assert.deepEqual(after,before);
      return;
    }
    if (scenario === 'pre_success' || scenario === 'pre_shipped') {
      const pre = await createRefundCase(pool, {
        actorAccountId: ids.customer,actorRole: 'customer',
        checkoutOrderId: ids.order,shipmentOrderId: ids.shipment,
        lines: [{ optionId: ids.option,quantity: 1 }],
        reasonCode: 'customer_request',reason: '기존 PRE 경로 회귀',
        idempotencyKey: randomUUID(),
      });
      const preDecision = { adminAccountId: ids.admin,caseId: pre.id,
        idempotencyKey: randomUUID(),decision: 'approve',reason: '미출고 확인',
        preShipmentConfirmed: true,
        preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED',
        lines: [{ optionId: ids.option,restockMode: 'none' }],
      };
      if (scenario === 'pre_shipped') {
        await assert.rejects(() => decideRefundCase(pool, preDecision,
          { APP_ENV: 'development',PAYMENT_MODE: 'mock' }), /Refund unavailable/);
        assert.equal((await pool.query('SELECT status FROM refund_cases WHERE id=$1',
          [pre.id])).rows[0].status, 'REQUESTED');
        await pool.query('DELETE FROM refund_case_events WHERE refund_case_id=$1', [pre.id]);
        await pool.query('DELETE FROM refund_case_lines WHERE refund_case_id=$1', [pre.id]);
        await pool.query('DELETE FROM refund_cases WHERE id=$1', [pre.id]);
      } else {
        const decided = await decideRefundCase(pool, preDecision,
          { APP_ENV: 'development',PAYMENT_MODE: 'mock' });
        assert.equal(decided.status, 'PROCESSING');
        const verifiedPre = new MockRefundAdapter().verify({
          providerRefundId: decided.providerRefundId,orderId: ids.order,
          paymentId: ids.paymentId,amountWon: 10000,outcome: 'SUCCEEDED',
        });
        const preEvent = await recordVerifiedRefundEvent(pool, decided.attemptId, verifiedPre);
        assert.equal((await processVerifiedRefundEvent(pool, preEvent.id)).processingStatus,
          'APPLIED');
        assert.equal((await pool.query('SELECT status FROM refund_cases WHERE id=$1',
          [pre.id])).rows[0].status, 'REFUNDED');
        assert.equal((await pool.query(`SELECT status FROM shipment_fulfillments
          WHERE shipment_order_id=$1`, [ids.shipment])).rows[0].status, 'CANCELLED',
        'PRE full refund retains the existing fulfillment cancellation path');
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM support_claims'))
          .rows[0].n, 0);
        return;
      }
    }
    if (scenario === 'http_success' || scenario === 'http_resume') {
      const claim = await createClaim(pool, { customerAccountId: ids.customer,
        orderId: ids.order,shipmentOrderId: ids.shipment,optionId: ids.option,
        kind: 'EXCHANGE',reasonCode: 'wrong_delivery',reason: '오배송 교환 접수',
        quantity: 1,idempotencyKey: randomUUID() });
      ids.claim = claim.id;
      const cookies = {};
      for (const [role,account,sellerId] of [
        ['customer',ids.customer,null],['seller',ids.sellerActor,ids.seller],
        ['admin',ids.admin,null],
      ]) {
        const token = randomUUID();
        await pool.query(`INSERT INTO auth_sessions
          (token_hash,account_id,role,seller_id,expires_at)
          VALUES ($1,$2,$3,$4,now()+interval '1 hour')`,
        [hashSessionToken(token),account,role,sellerId]);
        cookies[role] = `sm_session=${token}`;
      }
      process.env.APP_ENV = 'development';
      process.env.PAYMENT_MODE = 'mock';
      app = await createApp();
      await app.listen(0, '127.0.0.1');
      const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
      const path = `${base}/admin/support/claims/${claim.id}/decision`;
      const resumePath = `${base}/admin/support/claims/${claim.id}/refund-resume`;
      const key = randomUUID();
      const request = (role, requestKey = key, reason = '관리자 오배송 승인') => fetch(path, { method: 'POST',
        headers: { cookie: cookies[role],origin: 'http://127.0.0.1:9091',
          'content-type': 'application/json','idempotency-key': requestKey },
        body: JSON.stringify({ decision: 'approve',reason }),
      });
      assert.equal((await request('customer',randomUUID())).status, 403);
      assert.equal((await request('seller',randomUUID())).status, 403);
      if (scenario === 'http_resume') {
        const pending = await approveClaim(pool, { claimId: claim.id,
          adminAccountId: ids.admin,reason: '오배송 재개 시험',
          idempotencyKey: randomUUID() });
        assert.equal(pending.status, 'REFUND_PROCESSING');
        const resume = (role, origin = 'http://127.0.0.1:9091') => fetch(resumePath, {
          method: 'POST',headers: { cookie: cookies[role],origin },
        });
        assert.equal((await resume('customer')).status, 403);
        assert.equal((await resume('seller')).status, 403);
        assert.equal((await resume('admin','http://evil.invalid')).status, 403);
        process.env.PAYMENT_MODE = 'real';
        assert.equal((await resume('admin')).status, 404);
        process.env.PAYMENT_MODE = 'mock';
        const completed = await resume('admin');
        assert.equal(completed.status, 200);
        assert.equal((await completed.json()).status, 'REFUNDED');
        assert.equal((await (await resume('admin')).json()).status, 'REFUNDED');
        const counts = (await pool.query(`SELECT
          (SELECT count(*)::int FROM refund_cases WHERE post_shipment_claim_id=$1) AS cases,
          (SELECT count(*)::int FROM refund_attempts a JOIN refund_cases c
            ON c.id=a.refund_case_id WHERE c.post_shipment_claim_id=$1) AS attempts,
          (SELECT count(*)::int FROM refund_events e JOIN refund_attempts a
            ON a.id=e.refund_attempt_id JOIN refund_cases c ON c.id=a.refund_case_id
            WHERE c.post_shipment_claim_id=$1) AS events,
          (SELECT count(*)::int FROM audit_events WHERE target_type='support_claim'
            AND target_id=$1::text AND action='support.claim_refund_applied') AS audits`,
        [claim.id])).rows[0];
        assert.deepEqual(counts, { cases: 1,attempts: 1,events: 1,audits: 1 });
        return;
      }
      const approved = await request('admin');
      assert.equal(approved.status, 200);
      assert.equal((await approved.json()).status, 'REFUNDED',
        'admin HTTP approval must run the verified mock bridge to completion');
      assert.equal((await (await request('admin')).json()).status, 'REFUNDED');
      assert.equal((await request('admin',key,'다른 승인 사유')).status, 409);
      process.env.PAYMENT_MODE = 'real';
      assert.equal((await request('admin',randomUUID())).status, 404,
        'non-mock execution must stay closed');
      process.env.PAYMENT_MODE = 'mock';
      const rows = (await pool.query(`SELECT
        (SELECT count(*)::int FROM refund_events e JOIN refund_attempts a
          ON a.id=e.refund_attempt_id JOIN refund_cases c ON c.id=a.refund_case_id
          WHERE c.post_shipment_claim_id=$1) AS events,
        (SELECT count(*)::int FROM audit_events WHERE target_type='support_claim'
          AND target_id=$1::text AND action='support.claim_refund_applied') AS audits,
        (SELECT count(*)::int FROM shipment_orders WHERE checkout_order_id=$2) AS shipments`,
      [claim.id,ids.order])).rows[0];
      assert.deepEqual(rows, { events: 1,audits: 1,shipments: 1 });
      const after = (await pool.query(`SELECT o.payable_won AS order_won,
        s.goods_won AS shipment_goods,s.payable_won AS shipment_won,
        f.status AS fulfillment_status,f.version,f.carrier_code,f.tracking_number,
        f.first_shipped_at,f.shipped_at,i.on_hand_quantity,i.sellable_quantity
        FROM checkout_orders o JOIN shipment_orders s ON s.checkout_order_id=o.id
        JOIN shipment_fulfillments f ON f.shipment_order_id=s.id
        JOIN inventory_levels i ON i.option_id=$2 WHERE o.id=$1`,
      [ids.order,ids.option])).rows[0];
      assert.deepEqual(after,before);
      return;
    }
    const claim = await createClaim(pool, { customerAccountId: ids.customer,
      orderId: ids.order,shipmentOrderId: ids.shipment,optionId: ids.option,
      kind: 'EXCHANGE',reasonCode: 'wrong_delivery',reason: '오배송 교환 접수',
      quantity: 1,idempotencyKey: randomUUID() });
    ids.claim = claim.id;
    const decision = await approveClaim(pool, { claimId: claim.id,
      adminAccountId: ids.admin,reason: '오배송 교환 승인·환불',
      idempotencyKey: randomUUID() },
    { APP_ENV: 'development',PAYMENT_MODE: 'mock' });
    assert.equal(decision.status, 'REFUND_PROCESSING');
    assert.equal(decision.goodsRefundWon, 10000);
    const attempt = (await pool.query(`SELECT a.provider_refund_id
      FROM refund_attempts a JOIN refund_cases c ON c.id=a.refund_case_id
      WHERE c.post_shipment_claim_id=$1`, [claim.id])).rows[0];
    const verified = new MockRefundAdapter().verify({
      providerRefundId: attempt.provider_refund_id,orderId: ids.order,
      paymentId: ids.paymentId,amountWon: scenario === 'mismatch' ? 9999 : 10000,
      outcome: scenario === 'failed' ? 'FAILED' : 'SUCCEEDED',
    });
    const event = await recordVerifiedRefundEvent(pool, decision.attemptId, verified);
    if (scenario === 'mismatch') assert.equal(event.processingStatus, 'REVIEW_REQUIRED');
    else if (scenario === 'duplicate_pending') {
      await assert.rejects(() => recordVerifiedRefundEvent(pool, decision.attemptId,
        { ...verified,amountWon: 9999 }), /Refund event conflict/);
    } else {
      assert.equal((await processVerifiedRefundEvent(pool, event.id)).processingStatus, 'APPLIED');
      assert.equal((await processVerifiedRefundEvent(pool, event.id)).processingStatus, 'APPLIED');
      if (scenario === 'duplicate_final') await assert.rejects(() =>
        recordVerifiedRefundEvent(pool, decision.attemptId,
          { ...verified,amountWon: 9999 }), /Refund event conflict/);
    }
    const after = (await pool.query(`SELECT o.payable_won AS order_won,
      s.goods_won AS shipment_goods,s.payable_won AS shipment_won,
      f.status AS fulfillment_status,f.version,f.carrier_code,f.tracking_number,
      f.first_shipped_at,f.shipped_at,i.on_hand_quantity,i.sellable_quantity
      FROM checkout_orders o JOIN shipment_orders s ON s.checkout_order_id=o.id
      JOIN shipment_fulfillments f ON f.shipment_order_id=s.id
      JOIN inventory_levels i ON i.option_id=$2 WHERE o.id=$1`,
    [ids.order,ids.option])).rows[0];
    assert.deepEqual(after,before, 'POST refund must not rewrite paid money/shipment/stock');
    const finalStatus = ['success','duplicate_final','pre_shipped'].includes(scenario) ?
      'REFUNDED' : 'REVIEW_REQUIRED';
    assert.deepEqual((await pool.query(`SELECT c.status AS refund_status,
      c.goods_refund_won,c.shipping_refund_won,l.restock_mode,l.restocked_quantity,
      s.status AS claim_status FROM refund_cases c JOIN refund_case_lines l
      ON l.refund_case_id=c.id JOIN support_claims s ON s.id=c.post_shipment_claim_id
      WHERE s.id=$1`, [claim.id])).rows,
    [{ refund_status: finalStatus,goods_refund_won: 10000,shipping_refund_won: 0,
      restock_mode: 'none',restocked_quantity: 0,claim_status: finalStatus }]);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM shipment_orders
      WHERE checkout_order_id=$1`, [ids.order])).rows[0].n, 1,
    'an exchange approval never creates an automatic replacement shipment');
    if (finalStatus === 'REFUNDED') assert.equal((await pool.query(`SELECT count(*)::int AS n
      FROM refund_case_events WHERE refund_event_id=$1 AND to_status='REFUNDED'`,
    [event.id])).rows[0].n, 1);
    const auditCount = (await pool.query(`SELECT count(*)::int AS n FROM audit_events
      WHERE target_type='support_claim' AND target_id=$1
        AND details->>'refundEventId'=$2`, [claim.id,event.id])).rows[0].n;
    assert.equal(auditCount,scenario === 'duplicate_final' ? 2 : 1,
      'verified outcome and later conflict must each have an audit link');
    if (scenario.startsWith('duplicate_')) assert.equal((await pool.query(`SELECT
      count(*)::int AS n FROM refund_event_conflicts WHERE original_event_id=$1`,
    [event.id])).rows[0].n, 1);
  } finally {
    try {
      if (app) await app.close();
      for (const [key,value] of Object.entries(previousRuntime)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      if (seeded) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const ownedClaims = [ids.claim,ids.claimTwo].filter(Boolean);
          const foreign = (await client.query(`SELECT
            (SELECT count(*)::int FROM accounts WHERE id<>ALL($1::uuid[])) AS accounts,
            (SELECT count(*)::int FROM checkout_orders WHERE id<>$2) AS orders,
            (SELECT count(*)::int FROM support_claims
              WHERE id<>ALL($3::uuid[])) AS claims,
            (SELECT count(*)::int FROM refund_cases
              WHERE checkout_order_id<>$2 OR
                (post_shipment_claim_id IS NOT NULL
                  AND post_shipment_claim_id<>ALL($3::uuid[]))) AS refunds`,
          [[ids.customer,ids.admin,ids.sellerActor],ids.order,ownedClaims])).rows[0];
          assert.deepEqual(foreign, { accounts: 0,orders: 0,claims: 0,refunds: 0 },
            'never remove foreign fixture rows');
          await client.query(`DELETE FROM audit_events
            WHERE target_type='support_claim' AND target_id=ANY($1::text[])`,
          [ownedClaims]);
          await client.query(`DELETE FROM audit_events
            WHERE target_type='shipment_order' AND target_id=$1`, [ids.shipment]);
          await client.query(`DELETE FROM refund_event_conflicts WHERE original_event_id IN
            (SELECT e.id FROM refund_events e JOIN refund_attempts a
             ON a.id=e.refund_attempt_id JOIN refund_cases c ON c.id=a.refund_case_id
             WHERE c.checkout_order_id=$1)`, [ids.order]);
          await client.query(`DELETE FROM refund_case_events WHERE refund_case_id IN
            (SELECT id FROM refund_cases WHERE checkout_order_id=$1)`, [ids.order]);
          await client.query(`DELETE FROM refund_events WHERE refund_attempt_id IN
            (SELECT a.id FROM refund_attempts a JOIN refund_cases c
             ON c.id=a.refund_case_id WHERE c.checkout_order_id=$1)`, [ids.order]);
          await client.query(`DELETE FROM refund_attempts WHERE refund_case_id IN
            (SELECT id FROM refund_cases WHERE checkout_order_id=$1)`, [ids.order]);
          await client.query(`DELETE FROM refund_case_lines WHERE refund_case_id IN
            (SELECT id FROM refund_cases WHERE checkout_order_id=$1)`, [ids.order]);
          await client.query('DELETE FROM refund_cases WHERE checkout_order_id=$1', [ids.order]);
          await client.query('DELETE FROM support_claim_events WHERE claim_id=ANY($1::uuid[])',
          [ownedClaims]);
          await client.query('DELETE FROM support_claim_messages WHERE claim_id=ANY($1::uuid[])',
          [ownedClaims]);
          await client.query('DELETE FROM support_claims WHERE id=ANY($1::uuid[])',
          [ownedClaims]);
          await client.query('DELETE FROM payment_events WHERE payment_attempt_id=$1',
          [ids.paymentAttempt]);
          await client.query('DELETE FROM payment_attempts WHERE id=$1',
          [ids.paymentAttempt]);
          await client.query('DELETE FROM shipment_fulfillment_events WHERE shipment_order_id=$1',
          [ids.shipment]);
          await client.query('DELETE FROM shipment_order_lines WHERE shipment_order_id=$1',
          [ids.shipment]);
          await client.query('DELETE FROM shipment_fulfillments WHERE shipment_order_id=$1',
          [ids.shipment]);
          await client.query('DELETE FROM shipment_orders WHERE id=$1', [ids.shipment]);
          await client.query('DELETE FROM checkout_orders WHERE id=$1', [ids.order]);
          await client.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=$1',
          [ids.reservation]);
          await client.query('DELETE FROM checkout_reservations WHERE id=$1',
          [ids.reservation]);
          await client.query('DELETE FROM customer_addresses WHERE id=$1', [ids.address]);
          await client.query('DELETE FROM inventory_levels WHERE option_id=$1', [ids.option]);
          await client.query('DELETE FROM product_options WHERE id=$1', [ids.option]);
          await client.query('DELETE FROM product_revisions WHERE id=$1', [ids.revision]);
          await client.query('DELETE FROM products WHERE id=$1', [ids.product]);
          await client.query('DELETE FROM product_categories WHERE id=$1', [ids.category]);
          await client.query('DELETE FROM account_roles WHERE account_id=ANY($1::uuid[])',
          [[ids.customer,ids.admin,ids.sellerActor]]);
          await client.query('DELETE FROM auth_sessions WHERE account_id=ANY($1::uuid[])',
          [[ids.customer,ids.admin,ids.sellerActor]]);
          await client.query('DELETE FROM sellers WHERE id=$1', [ids.seller]);
          await client.query('DELETE FROM seller_categories WHERE id=$1', [ids.sellerCategory]);
          await client.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])',
          [[ids.customer,ids.admin,ids.sellerActor]]);
          await client.query('COMMIT');
          const residue = (await client.query(`SELECT
            (SELECT count(*)::int FROM accounts) AS accounts,
            (SELECT count(*)::int FROM checkout_orders) AS orders,
            (SELECT count(*)::int FROM support_claims) AS claims,
            (SELECT count(*)::int FROM refund_cases) AS refunds`)).rows[0];
          assert.deepEqual(residue, { accounts: 0,orders: 0,claims: 0,refunds: 0 });
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
      }
    } finally { await pool.end(); }
  }
});
