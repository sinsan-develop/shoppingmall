import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { DatabaseService } from '../src/db/service.ts';
import { hashSessionToken } from '../src/auth/credentials.ts';

const name = 'shoppingmall_s52_schema_v6_1007';
const systemId = process.env.S52_SUPPORT_TEST_DB_SYSTEM_ID;
const fingerprint = 'a'.repeat(64);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');

test('S5.2 isolated DB/HTTP support flow scopes shipped lines, reviews and claims',
  { skip: !systemId }, async () => {
    assert.equal(process.env.PGDATABASE, name);
    const pool = new Pool();
    const client = await pool.connect();
    let app;
    let uploadRoot;
    let scanServer;
    const previousUpload = { enabled: process.env.ENABLE_LOCAL_UPLOAD,
      root: process.env.SHOPPINGMALL_UPLOAD_ROOT, port: process.env.CLAMD_PORT };
    try {
      const identity = (await client.query(`SELECT current_database() AS name,
        system_identifier::text AS system_id FROM pg_control_system()`)).rows[0];
      assert.deepEqual(identity, { name, system_id: systemId });
      await client.query('BEGIN');
      const accounts = [];
      for (let index = 0; index < 5; index++)
        accounts.push((await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id);
      const [customer, otherCustomer, productSellerAccount, fulfillmentAccount,
        sellerSupportAccount] = accounts;
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
      await client.query(`INSERT INTO product_publications
        (product_id,revision_id,published_by_account_id) VALUES ($1,$2,$3)`,
      [product, revision, fulfillmentAccount]);
      const makeShipment = async (owner, status, quantity = 1, preRefundQuantity = 0) => {
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
          VALUES ($1,$2,$3)`, [reservation, option, quantity]);
        const orderId = (await client.query(`INSERT INTO checkout_orders
          (account_id,reservation_id,idempotency_key,request_fingerprint,address_id,
           recipient_name,phone,postal_code,line1,goods_won,goods_discount_won,
           shipping_fee_won,shipping_support_won,payable_won,status,
           created_at,expires_at,ended_at,paid_at)
          VALUES ($1,$2,$3,$4,$5,'가상고객','01000000000','12345','가상 주소',
            $6,0,0,0,$6,'PAID',now()-interval '2 hours',
            now()+interval '1 hour',now()-interval '1 hour',now()-interval '1 hour')
          RETURNING id`, [owner, reservation, randomUUID(), fingerprint, address,
          quantity * 10000])).rows[0].id;
        const shipmentId = (await client.query(`INSERT INTO shipment_orders
          (checkout_order_id,shipment_key,shipping_mode,seller_id,goods_won,goods_discount_won,
           shipping_fee_won,shipping_support_won,payable_won,status)
          VALUES ($1,$2,'owool_fulfillment',NULL,$3,0,0,0,$3,'PAID') RETURNING id`,
        [orderId, `owool:${randomUUID()}`, quantity * 10000])).rows[0].id;
        await client.query(`INSERT INTO shipment_order_lines
          (shipment_order_id,product_id,option_id,seller_id,product_name,option_name,
           unit_price_won,quantity,goods_discount_won,goods_payable_won)
          VALUES ($1,$2,$3,$4,'구매확정 상품','기본',10000,$5,0,$6)`,
        [shipmentId, product, option, productSeller, quantity, quantity * 10000]);
        if (preRefundQuantity) {
          const preCase = (await client.query(`INSERT INTO refund_cases
            (checkout_order_id,shipment_order_id,requester_account_id,requester_role,
             reason_code,reason,pre_shipment_evidence,pre_shipment_confirmed_by,
             pre_shipment_confirmed_at,idempotency_key,request_fingerprint,
             goods_refund_won,total_refund_won,status,decided_at,completed_at,
             decision_by,decision_reason,decision_idempotency_key,decision_fingerprint)
            VALUES ($1,$2,$3,'customer','customer_request','PRE partial QA',
              'ADMIN_CONFIRMED_NOT_DISPATCHED',$4,now()-interval '45 minutes',
              $5,$6,$7,$7,'REFUNDED',now()-interval '44 minutes',
              now()-interval '43 minutes',$4,'PRE approved',$8,$6) RETURNING id`,
          [orderId, shipmentId, owner, fulfillmentAccount, randomUUID(), fingerprint,
          preRefundQuantity * 10000, randomUUID()])).rows[0].id;
          await client.query(`INSERT INTO refund_case_lines
            (refund_case_id,shipment_order_id,option_id,quantity,goods_refund_won)
            VALUES ($1,$2,$3,$4,$5)`,
          [preCase, shipmentId, option, preRefundQuantity, preRefundQuantity * 10000]);
        }
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
        [sellerSupportAccount, 'seller', productSeller],
        [productSellerAccount, 'admin', null],
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
      const adminReviewsPath = '/admin/support/reviews';
      assert.equal((await reviewRequest(customer, adminReviewsPath, 'GET')).status, 403);
      assert.equal((await reviewRequest(fulfillmentAccount, adminReviewsPath, 'GET')).status, 403);
      for (const invalid of ['limit=0','limit=51','cursor=bad','status=INVALID'])
        assert.equal((await reviewRequest(productSellerAccount,
          `${adminReviewsPath}?${invalid}`, 'GET')).status, 400);
      const pendingReviews = await (await reviewRequest(productSellerAccount,
        `${adminReviewsPath}?status=PENDING&limit=50`, 'GET')).json();
      assert.ok(pendingReviews.items.some((item) => item.id === httpReview.id));
      const adminFirst = await (await reviewRequest(productSellerAccount,
        `${adminReviewsPath}?status=PENDING&limit=1`, 'GET')).json();
      assert.ok(adminFirst.nextCursor);
      const adminSecond = await (await reviewRequest(productSellerAccount,
        `${adminReviewsPath}?status=PENDING&limit=1&cursor=${adminFirst.nextCursor}`,
        'GET')).json();
      assert.equal(adminSecond.items.length, 1);
      assert.notEqual(adminSecond.items[0].id, adminFirst.items[0].id);
      assert.equal(adminSecond.nextCursor, null);
      const adminReviewPath = `${adminReviewsPath}/${httpReview.id}`;
      assert.equal((await reviewRequest(customer, adminReviewPath, 'GET')).status, 403);
      const adminReview = await (await reviewRequest(productSellerAccount,
        adminReviewPath, 'GET')).json();
      assert.equal(adminReview.id, httpReview.id);
      assert.deepEqual(adminReview.events.map(({ action }) => action), ['CREATED','EDITED']);
      assert.equal(JSON.stringify(adminReview).includes(reviewKey), false);
      assert.equal(JSON.stringify(adminReview).includes(editKey), false);
      const publicPath = `/catalog/products/${product}/customer-reviews`;
      for (const invalid of ['limit=0','limit=51','cursor=bad','limit=abc'])
        assert.equal((await fetch(`${base}${publicPath}?${invalid}`)).status, 400);
      assert.equal((await fetch(`${base}${publicPath}?limit=50`)).status, 200);
      assert.deepEqual(await (await fetch(base + publicPath)).json(),
        { items: [], nextCursor: null }, 'PENDING review must not be public');
      const approvalPath = `/admin/support/reviews/${httpReview.id}/approve`;
      assert.equal((await reviewRequest(customer, approvalPath, 'POST', {})).status, 403);
      assert.equal((await reviewRequest(fulfillmentAccount, approvalPath, 'POST', {})).status, 403);
      const image = (await client.query(`INSERT INTO support_review_images
        (review_id,object_key,mime_type,size_bytes)
        VALUES ($1,$2,'image/webp',100) RETURNING id`,
      [httpReview.id, `quarantine/${randomUUID()}.webp`])).rows[0].id;
      assert.equal((await reviewRequest(productSellerAccount, approvalPath, 'POST', {})).status,
        503, 'image without scan PASS must fail closed');
      assert.deepEqual(await (await fetch(base + publicPath)).json(),
        { items: [], nextCursor: null });
      await client.query(`UPDATE support_review_images SET scan_status='PASS',
        scanned_at=now() WHERE id=$1`, [image]);
      assert.equal((await reviewRequest(productSellerAccount, approvalPath, 'POST', {},
        randomUUID())).status, 503,
      'DB PASS flag alone cannot approve a missing image file');
      uploadRoot = await mkdtemp(join(tmpdir(), 'shoppingmall-upload-s52-review-'));
      process.env.ENABLE_LOCAL_UPLOAD = '1';
      process.env.SHOPPINGMALL_UPLOAD_ROOT = uploadRoot;
      await client.query('DELETE FROM support_review_images WHERE id=$1', [image]);
      const uploadKey = randomUUID();
      const uploadPath = `${detailPath}/images`;
      const upload = (actor, path, bytes, key = uploadKey) => fetch(base + path, {
        method: 'POST', headers: { cookie: cookies.get(actor), origin: 'http://127.0.0.1:9091',
          'content-type': 'image/png', 'idempotency-key': key }, body: bytes,
      });
      assert.equal((await upload(otherCustomer, uploadPath, png)).status, 404);
      assert.equal((await upload(fulfillmentAccount, uploadPath, png)).status, 403);
      const uploadResponse = await upload(customer, uploadPath, png);
      assert.equal(uploadResponse.status, 200);
      const uploaded = await uploadResponse.json();
      assert.ok(uploaded.id);
      assert.equal(JSON.stringify(uploaded).includes('quarantine/'), false);
      assert.deepEqual(await (await upload(customer, uploadPath, png)).json(), uploaded,
        'image upload replay must return the same public DTO');
      assert.equal((await upload(customer, `${reviewPath}/${review.id}/images`, png)).status,
        409, 'same image upload key cannot target another review');
      assert.equal((await upload(customer, uploadPath, Buffer.from('different'))).status, 409);
      assert.equal((await client.query(`SELECT count(*)::int AS n FROM support_review_images
        WHERE review_id=$1`, [httpReview.id])).rows[0].n, 1);
      const savedImage = (await client.query(`SELECT object_key FROM support_review_images
        WHERE id=$1`, [uploaded.id])).rows[0];
      const imagePath = join(uploadRoot, savedImage.object_key);
      const originalBytes = await readFile(imagePath);
      const imageId = uploaded.id;
      const customerPreview = `${detailPath}/images/${imageId}/preview`;
      const adminPreview = `${adminReviewPath}/images/${imageId}/preview`;
      assert.equal((await reviewRequest(otherCustomer, customerPreview, 'GET')).status, 404);
      assert.equal((await reviewRequest(fulfillmentAccount, adminPreview, 'GET')).status, 403);
      assert.equal((await reviewRequest(customer, customerPreview, 'GET')).status, 200);
      assert.equal((await reviewRequest(productSellerAccount, adminPreview, 'GET')).status, 200);
      process.env.CLAMD_PORT = '1';
      assert.equal((await reviewRequest(productSellerAccount, approvalPath, 'POST', {},
        randomUUID())).status, 503, 'scanner unavailable must fail closed');
      let scanVerdict = 'stream: TEST FOUND\0';
      let scanFrames = 0;
      let alterDuringScan = false;
      scanServer = createServer((socket) => socket.once('data', async (frame) => {
        if (frame.subarray(0, 10).toString() === 'zINSTREAM\0') scanFrames++;
        if (alterDuringScan) await writeFile(imagePath, Buffer.from('changed-during-scan'));
        socket.end(scanVerdict);
      }));
      await new Promise((done, reject) => {
        scanServer.once('error', reject);
        scanServer.listen(0, '127.0.0.1', done);
      });
      process.env.CLAMD_PORT = String(scanServer.address().port);
      assert.equal((await reviewRequest(productSellerAccount, approvalPath, 'POST', {},
        randomUUID())).status, 503, 'scanner rejection must leave review private');
      assert.equal((await client.query('SELECT scan_status FROM support_review_images WHERE id=$1',
        [imageId])).rows[0].scan_status, 'PENDING');
      scanVerdict = 'stream: OK\0';
      alterDuringScan = true;
      assert.equal((await reviewRequest(productSellerAccount, approvalPath, 'POST', {},
        randomUUID())).status, 503, 'file change between scan and approval must fail closed');
      await writeFile(imagePath, originalBytes);
      alterDuringScan = false;
      const approved = await reviewRequest(productSellerAccount, approvalPath, 'POST', {});
      assert.equal(approved.status, 200);
      assert.equal((await approved.json()).status, 'APPROVED');
      assert.ok(scanFrames >= 2, 'approval must send actual file bytes to the scanner');
      assert.equal((await reviewRequest(productSellerAccount, approvalPath, 'POST', {})).status, 200);
      const published = await (await fetch(base + publicPath)).json();
      assert.equal(published.items.length, 1);
      assert.equal(published.items[0].id, httpReview.id);
      assert.equal(published.items[0].body, editBody.text);
      assert.deepEqual(published.items[0].imageIds, [imageId]);
      assert.equal(JSON.stringify(published).includes(customer), false);
      assert.equal(JSON.stringify(published).includes(reviewKey), false);
      assert.equal(JSON.stringify(published).includes(savedImage.object_key), false);
      const imagePublicPath = `${publicPath}/${httpReview.id}/images/${imageId}`;
      assert.equal((await fetch(base + imagePublicPath)).status, 200);
      await writeFile(imagePath, Buffer.from('tampered'));
      assert.equal((await fetch(base + imagePublicPath)).status, 503,
        'file changed after approval must not be served');
      await writeFile(imagePath, originalBytes);
      assert.equal((await fetch(base + imagePublicPath)).status, 200);
      await client.query('DELETE FROM product_publications WHERE product_id=$1', [product]);
      assert.deepEqual(await (await fetch(base + publicPath)).json(),
        { items: [], nextCursor: null }, 'withdrawn publication must hide reviews');
      await client.query(`INSERT INTO product_publications
        (product_id,revision_id,published_by_account_id) VALUES ($1,$2,$3)`,
      [product, revision, fulfillmentAccount]);
      const reeditKey = randomUUID();
      assert.equal((await reviewRequest(customer, detailPath, 'PUT',
        { rating: 3, text: '재수정 웹 리뷰' }, reeditKey)).status, 200);
      assert.deepEqual(await (await fetch(base + publicPath)).json(),
        { items: [], nextCursor: null }, 'edit must require new approval');
      assert.equal((await fetch(base + imagePublicPath)).status, 404);
      assert.equal((await reviewRequest(productSellerAccount, approvalPath, 'POST', {},
        randomUUID())).status, 200);
      assert.equal((await (await fetch(base + publicPath)).json()).items[0].body, '재수정 웹 리뷰');
      const reportPath = `${detailPath}/reports`;
      assert.equal((await reviewRequest(fulfillmentAccount, reportPath, 'POST',
        { reason: '허위 리뷰' })).status, 403);
      assert.equal((await reviewRequest(otherCustomer, reportPath, 'POST',
        { reason: '허위 리뷰' })).status, 200);
      assert.equal((await reviewRequest(otherCustomer, reportPath, 'POST',
        { reason: '허위 리뷰' })).status, 200);
      assert.equal((await reviewRequest(otherCustomer, reportPath, 'POST',
        { reason: '다른 사유' })).status, 409);
      const reportedAdminDetail = await (await reviewRequest(productSellerAccount,
        adminReviewPath, 'GET')).json();
      assert.equal(reportedAdminDetail.reports.length, 1);
      assert.equal(reportedAdminDetail.reports[0].reason, '허위 리뷰');
      const hidePath = `/admin/support/reviews/${httpReview.id}/hide`;
      assert.equal((await reviewRequest(customer, hidePath, 'POST',
        { reason: '숨김' })).status, 403);
      assert.equal((await reviewRequest(productSellerAccount, hidePath, 'POST',
        { reason: '운영 검토' })).status, 200);
      assert.equal((await reviewRequest(productSellerAccount, hidePath, 'POST',
        { reason: '운영 검토' })).status, 200);
      assert.equal((await reviewRequest(productSellerAccount, hidePath, 'POST',
        { reason: '변경된 사유' })).status, 409);
      assert.deepEqual(await (await fetch(base + publicPath)).json(),
        { items: [], nextCursor: null }, 'HIDDEN review must disappear immediately');
      const actions = (await client.query(`SELECT action FROM support_review_events
        WHERE review_id=$1 ORDER BY event_seq`, [httpReview.id])).rows.map((row) => row.action);
      assert.deepEqual(actions, ['CREATED','EDITED','EDITED','APPROVED','EDITED','APPROVED','REPORTED','HIDDEN']);
      const hiddenDetail = await (await reviewRequest(customer, detailPath, 'GET')).json();
      assert.equal(JSON.stringify(hiddenDetail).includes(reviewKey), false);
      assert.equal(JSON.stringify(hiddenDetail).includes(reeditKey), false);
      assert.equal(JSON.stringify(hiddenDetail).includes('허위 리뷰'), false,
        'another customer report reason must remain admin-private');
      const textOnly = await reviews.approveReview(client, { reviewId: review.id,
        adminAccountId: productSellerAccount, idempotencyKey: randomUUID() });
      assert.equal(textOnly.status, 'APPROVED', 'text-only review needs no upload store');
      const secondReview = await reviews.createReview(client, {
        confirmationId: secondConfirmation.id, customerAccountId: customer,
        rating: 4, body: '두번째 확인 리뷰', idempotencyKey: randomUUID(),
      });
      await reviews.approveReview(client, { reviewId: secondReview.id,
        adminAccountId: productSellerAccount, idempotencyKey: randomUUID() });
      const publicFirst = await (await fetch(`${base}${publicPath}?limit=1`)).json();
      assert.equal(publicFirst.items.length, 1);
      assert.ok(publicFirst.nextCursor);
      const publicSecond = await (await fetch(`${base}${publicPath}?limit=1&cursor=${publicFirst.nextCursor}`)).json();
      assert.equal(publicSecond.items.length, 1);
      assert.notEqual(publicSecond.items[0].id, publicFirst.items[0].id);
      assert.equal(publicSecond.nextCursor, null);
      const claims = await import('../src/support/claims.ts').catch(() => ({}));
      assert.equal(typeof claims.createClaim, 'function', 'claim DB service must exist');
      const claimInput = { customerAccountId: customer, orderId: shipped.orderId,
        shipmentOrderId: shipped.shipmentId, optionId: option, kind: 'RETURN',
        reasonCode: 'damaged', reason: '받은 품목이 훼손됨', quantity: 1,
        idempotencyKey: randomUUID() };
      await assert.rejects(() => claims.createClaim(client, {
        ...claimInput, orderId: ready.orderId, shipmentOrderId: ready.shipmentId,
        idempotencyKey: randomUUID(),
      }), /Support unavailable/, 'READY cannot become a post-shipment claim');
      await assert.rejects(() => claims.createClaim(client, {
        ...claimInput, orderId: foreign.orderId, shipmentOrderId: foreign.shipmentId,
        idempotencyKey: randomUUID(),
      }), /Support unavailable/, 'foreign SHIPPED line must stay hidden');
      const claim = await claims.createClaim(client, claimInput);
      assert.equal(claim.status, 'REQUESTED');
      assert.equal((await claims.createClaim(client, claimInput)).id, claim.id);
      await assert.rejects(() => claims.createClaim(client,
        { ...claimInput, reason: '다른 내용' }), /Support conflict/);
      await assert.rejects(() => claims.createClaim(client,
        { ...claimInput, idempotencyKey: randomUUID() }), /Support conflict/,
      'an active full-quantity claim must block a second claim on the same line');
      const claimRow = (await client.query(`SELECT seller_id,product_id,
        checkout_order_id,shipment_order_id,customer_account_id FROM support_claims
        WHERE id=$1`, [claim.id])).rows[0];
      assert.deepEqual(claimRow, { seller_id: productSeller, product_id: product,
        checkout_order_id: shipped.orderId, shipment_order_id: shipped.shipmentId,
        customer_account_id: customer });
      assert.deepEqual((await client.query(`SELECT action FROM support_claim_events
        WHERE claim_id=$1 ORDER BY event_seq`, [claim.id])).rows.map((row) => row.action),
      ['REQUESTED']);
      assert.deepEqual((await client.query(`SELECT author_role,body FROM support_claim_messages
        WHERE claim_id=$1 ORDER BY message_seq`, [claim.id])).rows,
      [{ author_role: 'customer', body: claimInput.reason }]);
      const partiallyRefunded = await makeShipment(customer, 'SHIPPED', 2, 1);
      const originalAmounts = (await client.query(`SELECT id,goods_won,payable_won
        FROM shipment_orders WHERE id=ANY($1::uuid[]) ORDER BY id`,
      [[shipped.shipmentId, partiallyRefunded.shipmentId]])).rows;
      const originalPre = (await client.query(`SELECT status,goods_refund_won,
        shipping_refund_won,total_refund_won,pre_shipment_evidence,completed_at
        FROM refund_cases WHERE shipment_order_id=$1 AND post_shipment_claim_id IS NULL`,
      [partiallyRefunded.shipmentId])).rows;
      const remainingInput = { ...claimInput, orderId: partiallyRefunded.orderId,
        shipmentOrderId: partiallyRefunded.shipmentId,
        idempotencyKey: randomUUID() };
      await assert.rejects(() => claims.createClaim(client,
        { ...remainingInput, quantity: 2 }), /Support conflict/,
      'PRE refunded quantity must be excluded from POST claim capacity');
      const remainingClaim = await claims.createClaim(client,
        { ...remainingInput, quantity: 1 });
      assert.equal(remainingClaim.status, 'REQUESTED');
      assert.deepEqual((await client.query(`SELECT c.status,l.quantity
        FROM refund_cases c JOIN refund_case_lines l ON l.refund_case_id=c.id
        WHERE c.shipment_order_id=$1 AND c.post_shipment_claim_id IS NULL`,
      [partiallyRefunded.shipmentId])).rows,
      [{ status: 'REFUNDED', quantity: 1 }], 'PRE refund row must remain unchanged');
      assert.deepEqual((await client.query(`SELECT status,goods_refund_won,
        shipping_refund_won,total_refund_won,pre_shipment_evidence,completed_at
        FROM refund_cases WHERE shipment_order_id=$1 AND post_shipment_claim_id IS NULL`,
      [partiallyRefunded.shipmentId])).rows, originalPre);
      assert.deepEqual((await client.query(`SELECT id,goods_won,payable_won
        FROM shipment_orders WHERE id=ANY($1::uuid[]) ORDER BY id`,
      [[shipped.shipmentId, partiallyRefunded.shipmentId]])).rows, originalAmounts);
      const claimPath = '/customer/support/claims';
      const claimBody = { orderId: httpShipment.orderId,
        shipmentOrderId: httpShipment.shipmentId, optionId: option,
        kind: 'EXCHANGE', reasonCode: 'wrong_delivery',
        reason: '잘못 온 품목', quantity: 1 };
      const claimKey = randomUUID();
      const claimRequest = (actor, requestBody, requestKey = claimKey,
        origin = 'http://127.0.0.1:9091') => fetch(base + claimPath, {
        method: 'POST', headers: { cookie: cookies.get(actor), origin,
          'content-type': 'application/json', 'idempotency-key': requestKey },
        body: JSON.stringify(requestBody),
      });
      assert.equal((await claimRequest(customer, claimBody, claimKey,
        'http://evil.invalid')).status, 403);
      assert.equal((await claimRequest(fulfillmentAccount, claimBody)).status, 403);
      assert.equal((await claimRequest(otherCustomer, claimBody)).status, 404);
      const claimCreated = await claimRequest(customer, claimBody);
      assert.equal(claimCreated.status, 200);
      const httpClaim = await claimCreated.json();
      assert.equal(httpClaim.status, 'REQUESTED');
      assert.equal((await (await claimRequest(customer, claimBody)).json()).id, httpClaim.id);
      assert.equal((await claimRequest(customer, { ...claimBody,
        reason: '다른 요청' })).status, 409);
      assert.equal((await claimRequest(customer, claimBody, randomUUID())).status, 409);
      const customerClaimPath = `${claimPath}/${httpClaim.id}`;
      const sellerClaimPath = `/seller/support/claims/${httpClaim.id}`;
      const adminClaimPath = `/admin/support/claims/${httpClaim.id}`;
      assert.equal((await reviewRequest(otherCustomer, customerClaimPath, 'GET')).status, 404);
      assert.equal((await reviewRequest(customer, sellerClaimPath, 'GET')).status, 403);
      assert.equal((await reviewRequest(fulfillmentAccount, sellerClaimPath, 'GET')).status, 404,
        'pooled fulfillment seller is not the product seller');
      assert.equal((await reviewRequest(sellerSupportAccount, sellerClaimPath, 'GET')).status, 200);
      assert.equal((await reviewRequest(productSellerAccount, adminClaimPath, 'GET')).status, 200);
      const customerClaim = await (await reviewRequest(customer, customerClaimPath, 'GET')).json();
      assert.equal(customerClaim.id, httpClaim.id);
      assert.equal(customerClaim.sellerId, productSeller);
      assert.deepEqual(customerClaim.messages.map(({ body }) => body), [claimBody.reason]);
      for (const invalid of ['limit=0','limit=51','cursor=bad']) {
        assert.equal((await reviewRequest(customer, `${claimPath}?${invalid}`, 'GET')).status, 400);
        assert.equal((await reviewRequest(sellerSupportAccount,
          `/seller/support/claims?${invalid}`, 'GET')).status, 400);
      }
      const customerClaims = await (await reviewRequest(customer,
        `${claimPath}?limit=50`, 'GET')).json();
      assert.ok(customerClaims.items.some((item) => item.id === httpClaim.id));
      const productSellerClaims = await (await reviewRequest(sellerSupportAccount,
        '/seller/support/claims?limit=50', 'GET')).json();
      assert.ok(productSellerClaims.items.some((item) => item.id === httpClaim.id));
      const pooledClaims = await (await reviewRequest(fulfillmentAccount,
        '/seller/support/claims?limit=50', 'GET')).json();
      assert.deepEqual(pooledClaims.items, []);
      const adminClaims = await (await reviewRequest(productSellerAccount,
        '/admin/support/claims?status=REQUESTED&limit=50', 'GET')).json();
      assert.ok(adminClaims.items.some((item) => item.id === httpClaim.id));
      const replyPath = `${sellerClaimPath}/replies`;
      const replyKey = randomUUID();
      const reply = (actor, body, key = replyKey) => reviewRequest(actor, replyPath,
        'POST', { body }, key);
      assert.equal((await reply(customer, '판매자 답변')).status, 403);
      assert.equal((await reply(fulfillmentAccount, '판매자 답변')).status, 404);
      const firstReplyResponse = await reply(sellerSupportAccount, '상품 상태를 확인했습니다');
      assert.equal(firstReplyResponse.status, 200);
      const firstReply = await firstReplyResponse.json();
      assert.equal((await (await reply(sellerSupportAccount,
        '상품 상태를 확인했습니다')).json()).id, firstReply.id);
      assert.equal((await reply(sellerSupportAccount, '다른 내용')).status, 409);
      assert.equal((await reviewRequest(sellerSupportAccount,
        `/seller/support/claims/${remainingClaim.id}/replies`, 'POST',
        { body: '상품 상태를 확인했습니다' }, replyKey)).status, 409,
      'one seller retry key cannot be reused for another claim');
      const secondReplyResponse = await reply(sellerSupportAccount,
        '추가 확인 결과를 전달합니다', randomUUID());
      assert.equal(secondReplyResponse.status, 200);
      const sellerDetail = await (await reviewRequest(sellerSupportAccount,
        sellerClaimPath, 'GET')).json();
      assert.deepEqual(sellerDetail.messages.map(({ body }) => body), [
        claimBody.reason, '상품 상태를 확인했습니다', '추가 확인 결과를 전달합니다',
      ]);
      assert.equal(sellerDetail.status, 'SELLER_REPLIED');
      assert.equal(sellerDetail.events.filter((event) =>
        event.action === 'SELLER_REPLIED').length, 2);
      const evidencePath = `${claimPath}/${httpClaim.id}/evidence`;
      const evidenceKey = randomUUID();
      assert.equal((await upload(otherCustomer, evidencePath, png, randomUUID())).status, 404);
      assert.equal((await upload(sellerSupportAccount, evidencePath, png, randomUUID())).status, 403);
      const evidenceResponse = await upload(customer, evidencePath, png, evidenceKey);
      assert.equal(evidenceResponse.status, 200);
      const evidence = await evidenceResponse.json();
      assert.ok(evidence.id);
      assert.equal(JSON.stringify(evidence).includes('quarantine/'), false);
      assert.deepEqual(await (await upload(customer, evidencePath, png, evidenceKey)).json(), evidence);
      assert.equal((await fetch(base + evidencePath, { method: 'POST',
        headers: { cookie: cookies.get(customer), origin: 'http://127.0.0.1:9091',
          'content-type': 'image/jpeg', 'idempotency-key': evidenceKey }, body: png })).status,
      409, 'same evidence retry key cannot change the declared image type');
      assert.equal((await upload(customer, `${claimPath}/${remainingClaim.id}/evidence`,
        png, evidenceKey)).status, 409);
      const evidenceRead = (path, actor) => reviewRequest(actor, path, 'GET');
      const customerEvidence = `${evidencePath}/${evidence.id}`;
      const sellerEvidence = `/seller/support/claims/${httpClaim.id}/evidence/${evidence.id}`;
      const adminEvidence = `/admin/support/claims/${httpClaim.id}/evidence/${evidence.id}`;
      assert.equal((await evidenceRead(customerEvidence, otherCustomer)).status, 404);
      assert.equal((await fetch(base + customerEvidence)).status, 401);
      assert.equal((await fetch(base + `/catalog/products/${product}/evidence/${evidence.id}`)).status,
        404, 'private claim evidence has no catalog route');
      assert.equal((await evidenceRead(sellerEvidence, fulfillmentAccount)).status, 404);
      assert.equal((await evidenceRead(sellerEvidence, sellerSupportAccount)).status, 200);
      assert.equal((await evidenceRead(adminEvidence, productSellerAccount)).status, 200);
      const ownEvidence = await evidenceRead(customerEvidence, customer);
      assert.equal(ownEvidence.status, 200);
      assert.equal(ownEvidence.headers.get('cache-control'), 'private, no-store');
      assert.equal(ownEvidence.headers.get('content-type'), 'image/webp');
      const withEvidence = await (await evidenceRead(customerClaimPath, customer)).json();
      assert.ok(withEvidence.evidence.some(({ id }) => id === evidence.id));
      assert.equal(JSON.stringify(withEvidence).includes('quarantine/'), false);
      for (let index = 0; index < 4; index++)
        assert.equal((await upload(customer, evidencePath, png, randomUUID())).status, 200);
      assert.equal((await upload(customer, evidencePath, png, randomUUID())).status, 409,
        'a sixth private claim image must be refused');
      assert.equal((await client.query(`SELECT count(*)::int AS n FROM support_claim_evidence
        WHERE claim_id=$1`, [httpClaim.id])).rows[0].n, 5);
    } finally {
      if (app) await app.close();
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
      if (scanServer) await new Promise((done) => scanServer.close(done));
      if (uploadRoot) {
        assert.equal(resolve(uploadRoot).startsWith(resolve(tmpdir()) + '\\'), true);
        assert.match(basename(uploadRoot), /^shoppingmall-upload-s52-review-/);
        await rm(uploadRoot, { recursive: true });
        await assert.rejects(() => access(uploadRoot), { code: 'ENOENT' });
      }
      for (const [key, value] of Object.entries({ ENABLE_LOCAL_UPLOAD: previousUpload.enabled,
        SHOPPINGMALL_UPLOAD_ROOT: previousUpload.root, CLAMD_PORT: previousUpload.port })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
