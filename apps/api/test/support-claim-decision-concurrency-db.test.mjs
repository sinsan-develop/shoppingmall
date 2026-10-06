import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { rejectClaim } from '../src/support/claims.ts';

const database = 'shoppingmall_s52_schema_v7_1007';
const systemId = process.env.S52_SUPPORT_TEST_DB_SYSTEM_ID;

test('two claims cannot share one admin decision key under concurrent DB connections',
  { skip: !systemId || process.env.S52_SUPPORT_TEST_DB_NAME !== database }, async () => {
    assert.equal(process.env.PGDATABASE, database);
    let arrivals = 0;
    let release;
    const rendezvous = new Promise((resolve) => { release = resolve; });
    let barrierTimer;
    let barrierReleased = false;
    const releaseBarrier = () => {
      if (barrierReleased) return;
      barrierReleased = true;
      clearTimeout(barrierTimer);
      release();
    };
    class BarrierPool extends Pool {
      async connect() {
        const client = await super.connect();
        const query = client.query.bind(client);
        client.query = async (...args) => {
          const result = await query(...args);
          if (typeof args[0] === 'string' && args[0].includes(
            'WHERE decision_by=$1 AND decision_idempotency_key=$2')) {
            arrivals++;
            if (arrivals === 1) barrierTimer = setTimeout(releaseBarrier, 200);
            if (arrivals === 2) releaseBarrier();
            await rendezvous;
          }
          return result;
        };
        return client;
      }
    }
    const pool = new BarrierPool();
    const ids = {};
    let committed = false;
    const client = await pool.connect();
    try {
      const identity = (await client.query(`SELECT current_database() AS name,
        system_identifier::text AS system_id FROM pg_control_system()`)).rows[0];
      assert.deepEqual(identity, { name: database, system_id: systemId });
      assert.equal((await client.query(`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`))
        .rows[0].n, 19);
      await client.query('BEGIN');
      ids.customer = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
      ids.admin = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
      await client.query(`INSERT INTO account_roles(account_id,role) VALUES ($1,'admin')`, [ids.admin]);
      ids.sellerCategory = (await client.query(`INSERT INTO seller_categories(name)
        VALUES ($1) RETURNING id`, [`s52-decision-${randomUUID()}`])).rows[0].id;
      ids.seller = (await client.query(`INSERT INTO sellers(category_id,display_name)
        VALUES ($1,$2) RETURNING id`, [ids.sellerCategory,`s52-decision-${randomUUID()}`])).rows[0].id;
      ids.category = (await client.query(`INSERT INTO product_categories(name)
        VALUES ($1) RETURNING id`, [`s52-decision-${randomUUID()}`])).rows[0].id;
      ids.product = (await client.query(`INSERT INTO products(seller_id,category_id)
        VALUES ($1,$2) RETURNING id`, [ids.seller,ids.category])).rows[0].id;
      ids.revision = (await client.query(`INSERT INTO product_revisions
        (product_id,version,title,description,origin_label,shipping_mode,status,
         proposed_by_account_id,reviewed_by_account_id,reviewed_at)
        VALUES ($1,1,'동시 결정 시험','설명','산지','owool_fulfillment','approved',$2,$3,now())
        RETURNING id`, [ids.product,ids.admin,ids.admin])).rows[0].id;
      ids.option = (await client.query(`INSERT INTO product_options(revision_id,name,price_won)
        VALUES ($1,'기본',10000) RETURNING id`, [ids.revision])).rows[0].id;
      ids.address = (await client.query(`INSERT INTO customer_addresses
        (account_id,label,recipient_name,phone,postal_code,line1)
        VALUES ($1,'시험','가상고객','01000000000','12345','가상 주소') RETURNING id`,
      [ids.customer])).rows[0].id;
      ids.reservation = (await client.query(`INSERT INTO checkout_reservations
        (account_id,idempotency_key,status,created_at,expires_at,ended_at)
        VALUES ($1,$2,'CONSUMED',now()-interval '2 hours',now()+interval '1 hour',
          now()-interval '1 hour') RETURNING id`, [ids.customer,randomUUID()])).rows[0].id;
      await client.query(`INSERT INTO checkout_reservation_lines(reservation_id,option_id,quantity)
        VALUES ($1,$2,2)`, [ids.reservation,ids.option]);
      ids.order = (await client.query(`INSERT INTO checkout_orders
        (account_id,reservation_id,idempotency_key,request_fingerprint,address_id,
         recipient_name,phone,postal_code,line1,goods_won,goods_discount_won,
         shipping_fee_won,shipping_support_won,payable_won,status,
         created_at,expires_at,ended_at,paid_at)
        VALUES ($1,$2,$3,$4,$5,'가상고객','01000000000','12345','가상 주소',
          20000,0,0,0,20000,'PAID',now()-interval '2 hours',
          now()+interval '1 hour',now()-interval '1 hour',now()-interval '1 hour')
        RETURNING id`, [ids.customer,ids.reservation,randomUUID(),'a'.repeat(64),
          ids.address])).rows[0].id;
      ids.shipment = (await client.query(`INSERT INTO shipment_orders
        (checkout_order_id,shipment_key,shipping_mode,seller_id,goods_won,
         goods_discount_won,shipping_fee_won,shipping_support_won,payable_won,status)
        VALUES ($1,$2,'owool_fulfillment',NULL,20000,0,0,0,20000,'PAID') RETURNING id`,
      [ids.order,`owool:${randomUUID()}`])).rows[0].id;
      await client.query(`INSERT INTO shipment_order_lines
        (shipment_order_id,product_id,option_id,seller_id,product_name,option_name,
         unit_price_won,quantity,goods_discount_won,goods_payable_won)
        VALUES ($1,$2,$3,$4,'시험 상품','기본',10000,2,0,20000)`,
      [ids.shipment,ids.product,ids.option,ids.seller]);
      ids.claims = [];
      for (let index = 0; index < 2; index++) {
        ids.claims.push((await client.query(`INSERT INTO support_claims
          (checkout_order_id,shipment_order_id,option_id,product_id,
           customer_account_id,seller_id,kind,reason_code,reason,quantity,idempotency_key)
          VALUES ($1,$2,$3,$4,$5,$6,'CLAIM','quality_issue','동시 결정 시험',1,$7)
          RETURNING id`, [ids.order,ids.shipment,ids.option,ids.product,ids.customer,
            ids.seller,randomUUID()])).rows[0].id);
      }
      await client.query('COMMIT');
      committed = true;
      const key = randomUUID();
      const results = await Promise.allSettled(ids.claims.map((claimId) =>
        rejectClaim(pool, { claimId,adminAccountId: ids.admin,
          reason: '동시 결정',idempotencyKey: key })));
      assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
      const rejected = results.find(({ status }) => status === 'rejected');
      assert.equal(rejected.reason.message, 'Support conflict',
        'DB unique races must not escape as HTTP 500');
      const claims = (await client.query(`SELECT status FROM support_claims
        WHERE id=ANY($1::uuid[]) ORDER BY id`, [ids.claims])).rows;
      assert.deepEqual(claims.map(({ status }) => status).sort(), ['REJECTED','REQUESTED']);
    } finally {
      releaseBarrier();
      if (committed) {
        await client.query('BEGIN');
        await client.query(`DELETE FROM support_claim_events WHERE claim_id=ANY($1::uuid[])`, [ids.claims]);
        await client.query(`DELETE FROM support_claims WHERE id=ANY($1::uuid[])`, [ids.claims]);
        await client.query('DELETE FROM shipment_order_lines WHERE shipment_order_id=$1', [ids.shipment]);
        await client.query('DELETE FROM shipment_orders WHERE id=$1', [ids.shipment]);
        await client.query('DELETE FROM checkout_orders WHERE id=$1', [ids.order]);
        await client.query('DELETE FROM checkout_reservation_lines WHERE reservation_id=$1', [ids.reservation]);
        await client.query('DELETE FROM checkout_reservations WHERE id=$1', [ids.reservation]);
        await client.query('DELETE FROM customer_addresses WHERE id=$1', [ids.address]);
        await client.query('DELETE FROM product_options WHERE id=$1', [ids.option]);
        await client.query('DELETE FROM product_revisions WHERE id=$1', [ids.revision]);
        await client.query('DELETE FROM products WHERE id=$1', [ids.product]);
        await client.query('DELETE FROM product_categories WHERE id=$1', [ids.category]);
        await client.query('DELETE FROM sellers WHERE id=$1', [ids.seller]);
        await client.query('DELETE FROM seller_categories WHERE id=$1', [ids.sellerCategory]);
        await client.query('DELETE FROM account_roles WHERE account_id=$1', [ids.admin]);
        await client.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])', [[ids.customer,ids.admin]]);
        await client.query('COMMIT');
        const residue = (await client.query(`SELECT
          (SELECT count(*)::int FROM support_claims WHERE id=ANY($1::uuid[])) AS claims,
          (SELECT count(*)::int FROM support_claim_events WHERE claim_id=ANY($1::uuid[])) AS events,
          (SELECT count(*)::int FROM checkout_orders WHERE id=$2) AS orders,
          (SELECT count(*)::int FROM accounts WHERE id=ANY($3::uuid[])) AS accounts`,
        [ids.claims,ids.order,[ids.customer,ids.admin]])).rows[0];
        assert.deepEqual(residue, { claims: 0,events: 0,orders: 0,accounts: 0 });
      } else await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  });
