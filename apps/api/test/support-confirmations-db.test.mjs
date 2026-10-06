import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { DatabaseService } from '../src/db/service.ts';
import { hashSessionToken } from '../src/auth/credentials.ts';

const name = 'shoppingmall_s52_schema_v6_1007';
const systemId = process.env.S52_SUPPORT_TEST_DB_SYSTEM_ID;
const fingerprint = 'a'.repeat(64);

test('manual confirmation requires own paid SHIPPED line and reuses its idempotency key',
  { skip: !systemId }, async () => {
    assert.equal(process.env.PGDATABASE, name);
    const pool = new Pool();
    const client = await pool.connect();
    let app;
    try {
      const identity = (await client.query(`SELECT current_database() AS name,
        system_identifier::text AS system_id FROM pg_control_system()`)).rows[0];
      assert.deepEqual(identity, { name, system_id: systemId });
      await client.query('BEGIN');
      const accounts = [];
      for (let index = 0; index < 4; index++)
        accounts.push((await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id);
      const [customer, otherCustomer, productSellerAccount, fulfillmentAccount] = accounts;
      const sellerCategory = (await client.query(`INSERT INTO seller_categories(name)
        VALUES ($1) RETURNING id`, [`s52-confirm-${randomUUID()}`])).rows[0].id;
      const productSeller = (await client.query(`INSERT INTO sellers(category_id,display_name)
        VALUES ($1,$2) RETURNING id`, [sellerCategory, `s52-product-${randomUUID()}`])).rows[0].id;
      const fulfillmentSeller = (await client.query(`INSERT INTO sellers(category_id,display_name)
        VALUES ($1,$2) RETURNING id`, [sellerCategory, `s52-fulfillment-${randomUUID()}`])).rows[0].id;
      const category = (await client.query(`INSERT INTO product_categories(name)
        VALUES ($1) RETURNING id`, [`s52-confirm-${randomUUID()}`])).rows[0].id;
      const product = (await client.query(`INSERT INTO products(seller_id,category_id)
        VALUES ($1,$2) RETURNING id`, [productSeller, category])).rows[0].id;
      const revision = (await client.query(`INSERT INTO product_revisions
        (product_id,version,title,description,origin_label,shipping_mode,status,
         proposed_by_account_id,reviewed_by_account_id,reviewed_at)
        VALUES ($1,1,'구매확정 시험 상품','설명','산지','owool_fulfillment','approved',
          $2,$3,now()) RETURNING id`, [product, productSellerAccount,
      fulfillmentAccount])).rows[0].id;
      const option = (await client.query(`INSERT INTO product_options
        (revision_id,name,price_won) VALUES ($1,'기본',10000) RETURNING id`, [revision])).rows[0].id;
      const makeShipment = async (owner, status) => {
        const address = (await client.query(`INSERT INTO customer_addresses
          (account_id,label,recipient_name,phone,postal_code,line1)
          VALUES ($1,'시험','가상고객','01000000000','12345','가상 주소') RETURNING id`,
        [owner])).rows[0].id;
        const reservation = (await client.query(`INSERT INTO checkout_reservations
          (account_id,idempotency_key,status,created_at,expires_at,ended_at)
          VALUES ($1,$2,'CONSUMED',now()-interval '2 hours',
            now()+interval '1 hour',now()-interval '1 hour') RETURNING id`,
        [owner, randomUUID()])).rows[0].id;
        await client.query(`INSERT INTO checkout_reservation_lines(reservation_id,option_id,quantity)
          VALUES ($1,$2,1)`, [reservation, option]);
        const orderId = (await client.query(`INSERT INTO checkout_orders
          (account_id,reservation_id,idempotency_key,request_fingerprint,address_id,
           recipient_name,phone,postal_code,line1,goods_won,goods_discount_won,
           shipping_fee_won,shipping_support_won,payable_won,status,
           created_at,expires_at,ended_at,paid_at)
          VALUES ($1,$2,$3,$4,$5,'가상고객','01000000000','12345','가상 주소',
            10000,0,0,0,10000,'PAID',now()-interval '2 hours',
            now()+interval '1 hour',now()-interval '1 hour',now()-interval '1 hour')
          RETURNING id`, [owner, reservation, randomUUID(), fingerprint, address])).rows[0].id;
        const shipmentId = (await client.query(`INSERT INTO shipment_orders
          (checkout_order_id,shipment_key,shipping_mode,seller_id,goods_won,goods_discount_won,
           shipping_fee_won,shipping_support_won,payable_won,status)
          VALUES ($1,$2,'owool_fulfillment',NULL,10000,0,0,0,10000,'PAID') RETURNING id`,
        [orderId, `owool:${randomUUID()}`])).rows[0].id;
        await client.query(`INSERT INTO shipment_order_lines
          (shipment_order_id,product_id,option_id,seller_id,product_name,option_name,
           unit_price_won,quantity,goods_discount_won,goods_payable_won)
          VALUES ($1,$2,$3,$4,'구매확정 상품','기본',10000,1,0,10000)`,
        [shipmentId, product, option, productSeller]);
        if (status === 'READY') {
          await client.query(`INSERT INTO shipment_fulfillments
            (shipment_order_id,fulfillment_seller_id,status,expected_ship_date)
            VALUES ($1,$2,'READY','2026-10-10')`, [shipmentId, fulfillmentSeller]);
          return { orderId, shipmentId };
        }
        await client.query(`INSERT INTO shipment_fulfillments
          (shipment_order_id,fulfillment_seller_id,status,expected_ship_date,carrier_code,
           tracking_number,packed_at,first_shipped_at,shipped_at)
          VALUES ($1,$2,'SHIPPED','2026-10-10','hanjin','QA123456',
            now()-interval '40 minutes',now()-interval '30 minutes',now()-interval '30 minutes')`,
        [shipmentId, fulfillmentSeller]);
        const shippedEventId = (await client.query(`INSERT INTO shipment_fulfillment_events
          (shipment_order_id,action,from_status,to_status,actor_account_id,actor_role,
           actor_seller_id,before_snapshot,after_snapshot,idempotency_scope,idempotency_key,
           request_fingerprint)
          VALUES ($1,'MARK_SHIPPED','PACKING','SHIPPED',$2,'seller',$3,
            $4::jsonb,$5::jsonb,$8,$6,$7) RETURNING id`, [shipmentId, fulfillmentAccount,
          fulfillmentSeller,
          JSON.stringify({ status: 'PACKING', expectedShipDate: '2026-10-10',
            carrierCode: null, trackingNumber: null }),
          JSON.stringify({ status: 'SHIPPED', expectedShipDate: '2026-10-10',
            carrierCode: 'hanjin', trackingNumber: 'QA123456' }), randomUUID(), fingerprint,
          fulfillmentAccount])).rows[0].id;
        return { orderId, shipmentId, shippedEventId };
      };
      const ready = await makeShipment(customer, 'READY');
      const shipped = await makeShipment(customer, 'SHIPPED');
      const foreign = await makeShipment(otherCustomer, 'SHIPPED');
      const support = await import('../src/support/confirmations.ts').catch(() => ({}));
      assert.equal(typeof support.createPurchaseConfirmation, 'function',
        'manual confirmation DB service must exist');
      assert.equal((await client.query('SELECT count(*)::int AS n FROM support_purchase_confirmations'))
        .rows[0].n, 0, 'shipping does not auto-confirm purchases');
      const input = { customerAccountId: customer, orderId: shipped.orderId,
        shipmentOrderId: shipped.shipmentId, optionId: option, idempotencyKey: randomUUID() };
      await assert.rejects(() => support.createPurchaseConfirmation(client,
        { ...input, orderId: ready.orderId, shipmentOrderId: ready.shipmentId,
          idempotencyKey: randomUUID() }), /Support unavailable/);
      await assert.rejects(() => support.createPurchaseConfirmation(client,
        { ...input, orderId: foreign.orderId, shipmentOrderId: foreign.shipmentId,
          idempotencyKey: randomUUID() }), /Support unavailable/);
      await assert.rejects(() => support.createPurchaseConfirmation(client,
        { ...input, orderId: foreign.orderId }), /Support unavailable/);
      const confirmed = await support.createPurchaseConfirmation(client, input);
      assert.ok(confirmed.id);
      assert.equal((await support.createPurchaseConfirmation(client, input)).id, confirmed.id);
      await assert.rejects(() => support.createPurchaseConfirmation(client,
        { ...input, orderId: foreign.orderId }), /Support conflict/);
      await assert.rejects(() => support.createPurchaseConfirmation(client,
        { ...input, idempotencyKey: randomUUID() }), /Support conflict/);
      await support.createPurchaseConfirmation(client, { customerAccountId: otherCustomer,
        orderId: foreign.orderId, shipmentOrderId: foreign.shipmentId, optionId: option,
        idempotencyKey: randomUUID() });
      await assert.rejects(() => support.createPurchaseConfirmation(client,
        { ...input, orderId: foreign.orderId, shipmentOrderId: foreign.shipmentId,
          idempotencyKey: randomUUID() }), /Support unavailable/,
      'a foreign confirmed line must not disclose its existence through conflict status');
      const saved = (await client.query(`SELECT product_id,shipped_event_id,customer_account_id
        FROM support_purchase_confirmations WHERE id=$1`, [confirmed.id])).rows[0];
      assert.deepEqual(saved, { product_id: product, shipped_event_id: shipped.shippedEventId,
        customer_account_id: customer });
      const reviews = await import('../src/support/reviews.ts').catch(() => ({}));
      assert.equal(typeof reviews.createReview, 'function', 'verified review service must exist');
      const reviewInput = { confirmationId: confirmed.id, customerAccountId: customer,
        rating: 4, body: '신선합니다', idempotencyKey: randomUUID() };
      await assert.rejects(() => reviews.createReview(client,
        { ...reviewInput, customerAccountId: otherCustomer }), /Support unavailable/);
      const review = await reviews.createReview(client, reviewInput);
      assert.equal(review.status, 'PENDING');
      assert.equal(review.version, 1);
      assert.equal((await reviews.createReview(client, reviewInput)).id, review.id);
      await assert.rejects(() => reviews.createReview(client,
        { ...reviewInput, idempotencyKey: randomUUID() }), /Support conflict/);
      const secondShipment = await makeShipment(customer, 'SHIPPED');
      const secondConfirmation = await support.createPurchaseConfirmation(client, {
        customerAccountId: customer, orderId: secondShipment.orderId,
        shipmentOrderId: secondShipment.shipmentId, optionId: option,
        idempotencyKey: randomUUID(),
      });
      await assert.rejects(() => reviews.createReview(client,
        { ...reviewInput, confirmationId: secondConfirmation.id }), /Support conflict/,
      'same create key cannot bind a second confirmation');
      await assert.rejects(() => reviews.createReview(client,
        { ...reviewInput, body: '다른 최초 내용' }), /Support conflict/);
      assert.equal((await client.query('SELECT count(*)::int AS n FROM support_review_events WHERE review_id=$1',
        [review.id])).rows[0].n, 1);
      await assert.rejects(() => reviews.editReview(client, { reviewId: review.id,
        customerAccountId: otherCustomer, rating: 2, body: '타인 수정',
        idempotencyKey: randomUUID() }), /Support unavailable/);
      const editInput = { reviewId: review.id, customerAccountId: customer,
        rating: 5, body: '더 신선합니다', idempotencyKey: randomUUID() };
      const edited = await reviews.editReview(client, editInput);
      assert.equal(edited.status, 'PENDING');
      assert.equal(edited.version, 2);
      assert.equal((await reviews.editReview(client, editInput)).version, 2,
        'same edit key and body must not create another event');
      await assert.rejects(() => reviews.editReview(client,
        { ...editInput, body: '변조된 재시도' }), /Support conflict/);
      assert.deepEqual((await client.query(`SELECT action,before_value,after_value
        FROM support_review_events WHERE review_id=$1 ORDER BY event_seq`, [review.id]))
        .rows.map(({ action, before_value, after_value }) => ({ action, before_value, after_value })),
      [
        { action: 'CREATED', before_value: {}, after_value: { rating: 4, body: '신선합니다',
          version: 1, idempotencyKey: reviewInput.idempotencyKey } },
        { action: 'EDITED', before_value: { rating: 4, body: '신선합니다', version: 1 },
          after_value: { rating: 5, body: '더 신선합니다', version: 2,
            idempotencyKey: editInput.idempotencyKey } },
      ]);
      assert.equal((await client.query('SELECT seller_id FROM shipment_orders WHERE id=$1',
        [shipped.shipmentId])).rows[0].seller_id, null);
      assert.equal((await client.query('SELECT seller_id FROM shipment_order_lines WHERE shipment_order_id=$1',
        [shipped.shipmentId])).rows[0].seller_id, productSeller);
      const httpShipment = await makeShipment(customer, 'SHIPPED');
      const cookies = new Map();
      for (const [account, role, sellerId] of [
        [customer, 'customer', null], [otherCustomer, 'customer', null],
        [fulfillmentAccount, 'seller', fulfillmentSeller],
      ]) {
        await client.query(`INSERT INTO account_roles(account_id,role,seller_id)
          VALUES ($1,$2,$3)`, [account, role, sellerId]);
        const token = randomUUID();
        await client.query(`INSERT INTO auth_sessions(token_hash,account_id,role,seller_id,expires_at)
          VALUES ($1,$2,$3,$4,now()+interval '1 hour')`,
        [hashSessionToken(token), account, role, sellerId]);
        cookies.set(account, `sm_session=${token}`);
      }
      app = await createApp();
      app.get(DatabaseService).getPool = () => client;
      await app.listen(0, '127.0.0.1');
      const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
      const path = '/customer/support/confirmations';
      const body = { orderId: httpShipment.orderId,
        shipmentOrderId: httpShipment.shipmentId, optionId: option };
      const key = randomUUID();
      const request = (actor, requestBody, requestKey = key, origin = 'http://127.0.0.1:9091') =>
        fetch(base + path, { method: 'POST', headers: { cookie: cookies.get(actor), origin,
          'content-type': 'application/json', 'idempotency-key': requestKey },
        body: JSON.stringify(requestBody) });
      assert.equal((await request(customer, body, key, 'http://evil.invalid')).status, 403);
      assert.equal((await request(fulfillmentAccount, body)).status, 403);
      assert.equal((await request(otherCustomer, body)).status, 404);
      const created = await request(customer, body);
      assert.equal(created.status, 200);
      const httpConfirmation = await created.json();
      assert.ok(httpConfirmation.id);
      assert.equal((await (await request(customer, body)).json()).id, httpConfirmation.id);
      assert.equal((await request(customer, body, randomUUID())).status, 409);
      assert.equal((await client.query(`SELECT count(*)::int AS n
        FROM support_purchase_confirmations WHERE shipment_order_id=$1`,
      [httpShipment.shipmentId])).rows[0].n, 1);
      const reviewPath = '/customer/support/reviews';
      const reviewBody = { confirmationId: httpConfirmation.id, rating: 4, text: '웹 리뷰' };
      const reviewKey = randomUUID();
      const reviewRequest = (actor, path, method, requestBody, requestKey = reviewKey) =>
        fetch(base + path, { method, headers: { cookie: cookies.get(actor), origin: 'http://127.0.0.1:9091',
          'content-type': 'application/json', 'idempotency-key': requestKey },
        ...(requestBody ? { body: JSON.stringify(requestBody) } : {}) });
      const foreignReview = await reviewRequest(otherCustomer, reviewPath, 'POST', reviewBody);
      assert.equal(foreignReview.status, 404, JSON.stringify(await foreignReview.json()));
      assert.equal((await reviewRequest(fulfillmentAccount, reviewPath, 'POST', reviewBody)).status, 403);
      const createdReviewResponse = await reviewRequest(customer, reviewPath, 'POST', reviewBody);
      assert.equal(createdReviewResponse.status, 200);
      const httpReview = await createdReviewResponse.json();
      assert.equal(httpReview.status, 'PENDING');
      assert.equal((await (await reviewRequest(customer, reviewPath, 'POST', reviewBody)).json()).id,
        httpReview.id);
      assert.equal((await reviewRequest(customer, reviewPath, 'POST',
        { ...reviewBody, confirmationId: secondConfirmation.id })).status, 409,
      'same HTTP key cannot create a review for another confirmation');
      assert.equal((await reviewRequest(customer, reviewPath, 'POST',
        { ...reviewBody, text: '변경된 재시도' })).status, 409);
      const detailPath = `${reviewPath}/${httpReview.id}`;
      assert.equal((await reviewRequest(otherCustomer, detailPath, 'GET')).status, 404);
      const editBody = { rating: 5, text: '수정 웹 리뷰' };
      const editKey = randomUUID();
      assert.equal((await reviewRequest(customer, detailPath, 'PUT',editBody,editKey)).status, 200);
      const editRetry = await reviewRequest(customer, detailPath, 'PUT',editBody,editKey);
      assert.equal(editRetry.status, 200);
      assert.equal((await editRetry.json()).version, 2);
      assert.equal((await reviewRequest(customer, detailPath, 'PUT',
        { ...editBody, text: '변조된 수정' },editKey)).status, 409);
      const reviewDetail = await (await reviewRequest(customer, detailPath, 'GET')).json();
      assert.equal(reviewDetail.version, 2);
      assert.deepEqual(reviewDetail.events.map(({ action }) => action), ['CREATED','EDITED']);
      assert.equal(JSON.stringify(reviewDetail).includes(reviewKey), false,
        'create idempotency key must not appear in review history JSON');
      assert.equal(JSON.stringify(reviewDetail).includes(editKey), false,
        'internal idempotency key must not appear in review history JSON');
    } finally {
      if (app) await app.close();
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  });
