import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { replyToClaim } from '../src/support/claims.ts';
import { CustomerApi } from '../../mobile/src/customer-api.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

test('mobile customer client drives real HTTP DB coupon purchase, retry, engagement, delivery and preferences', {
  skip: !process.env.QA_S7_DB_SYSTEM_ID,
}, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname, 'shoppingmall-qa-s7-20261014-pg');
  assert.equal(url.pathname, '/shoppingmall');
  const pool = new Pool({ connectionString: url.toString() });
  let app;
  let uploadRoot;
  const previous = { APP_ENV: process.env.APP_ENV, API_HOST: process.env.API_HOST,
    PAYMENT_MODE: process.env.PAYMENT_MODE, WEB_ORIGIN: process.env.WEB_ORIGIN,
    ENABLE_LOCAL_UPLOAD: process.env.ENABLE_LOCAL_UPLOAD, SHOPPINGMALL_UPLOAD_ROOT: process.env.SHOPPINGMALL_UPLOAD_ROOT };
  try {
    const identity = (await pool.query('SELECT current_database() AS db, system_identifier::text AS id FROM pg_control_system()')).rows[0];
    assert.equal(identity.db, 'shoppingmall');
    assert.equal(identity.id, process.env.QA_S7_DB_SYSTEM_ID);
    assert.notEqual(identity.id, '7622490131194466339');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n, 0);
    uploadRoot = await mkdtemp(join(tmpdir(), 'shoppingmall-s7-images-'));
    process.env.ENABLE_LOCAL_UPLOAD = '1'; process.env.SHOPPINGMALL_UPLOAD_ROOT = uploadRoot;
    const runId = '7a141001';
    const password = 'Synthetic-mobile-password-1014';
    await runQaCatalogFixture('seed', runId, url.toString(), password);
    const accountIds = (await pool.query('SELECT identifier,account_id FROM account_identities WHERE identifier=ANY($1::text[])',
      [qaNames(runId).emails])).rows;
    const customerId = accountIds.find(row => row.identifier === qaNames(runId).emails[0]).account_id;
    const adminId = accountIds.find(row => row.identifier === qaNames(runId).emails[4]).account_id;
    const sellerId = accountIds.find(row => row.identifier === qaNames(runId).emails[1]).account_id;
    async function grant(kind, amount, targetId = customerId) {
      const campaignId = (await pool.query(`INSERT INTO promotion_campaigns
        (title,kind,direct_issue_limit,total_use_limit,per_account_use_limit,created_by_account_id)
        VALUES ($1,$2,5,10,3,$3) RETURNING id`, [`S7 QA ${kind}`, kind, adminId])).rows[0].id;
      const versionId = (await pool.query(`INSERT INTO promotion_versions
        (campaign_id,version,scope,starts_at,ends_at,minimum_eligible_goods_won,amount_kind,amount_value,created_by_account_id)
        VALUES ($1,1,'all',$2,$3,0,'fixed',$4,$5) RETURNING id`,
      [campaignId, new Date(Date.now() - 60000), new Date(Date.now() + 3600000), amount, adminId])).rows[0].id;
      return (await pool.query(`INSERT INTO promotion_grants
        (account_id,version_id,source,issued_by_account_id,idempotency_key,reason)
        VALUES ($1,$2,'direct',$3,$4,'S7 disposable QA') RETURNING id`,
      [targetId, versionId, adminId, randomUUID()])).rows[0].id;
    }
    const goodsGrant = await grant('goods_discount', 5000);
    const shippingGrant = await grant('shipping_support', 3000);
    const foreignGrant = await grant('goods_discount', 1000, sellerId);
    process.env.APP_ENV = 'development'; process.env.API_HOST = '127.0.0.1';
    process.env.PAYMENT_MODE = 'mock'; process.env.WEB_ORIGIN = 'http://127.0.0.1:9091';
    app = await createApp(); await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    let cookie = ''; let loseOrderReply = true; let loseRefundReply = true;
    let loseReviewReply = true; let loseClaimReply = true;
    const lostUploads = new Set();
    const api = new CustomerApi({ apiOrigin: base, webOrigin: process.env.WEB_ORIGIN, createKey: randomUUID,
      send: async (address, options) => {
        const response = await fetch(address, { ...options, headers: { ...options.headers, ...(cookie ? { cookie } : {}) } });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        if (options.method === 'POST' && /\/(images|evidence)$/.test(String(address)) && !lostUploads.has(String(address))) {
          lostUploads.add(String(address)); await response.arrayBuffer(); throw new Error('Synthetic attachment response loss');
        }
        if (String(address) === `${base}/customer/checkout/orders` && options.method === 'POST' && loseOrderReply) {
          loseOrderReply = false; await response.arrayBuffer(); throw new Error('Synthetic response loss after DB commit');
        }
        if (String(address).endsWith('/refund-cases') && options.method === 'POST' && loseRefundReply) {
          loseRefundReply = false; await response.arrayBuffer(); throw new Error('Synthetic refund response loss after DB commit');
        }
        if (String(address) === `${base}/customer/support/reviews` && options.method === 'POST' && loseReviewReply) {
          loseReviewReply = false; await response.arrayBuffer(); throw new Error('Synthetic review response loss');
        }
        if (String(address) === `${base}/customer/support/claims` && options.method === 'POST' && loseClaimReply) {
          loseClaimReply = false; await response.arrayBuffer(); throw new Error('Synthetic claim response loss');
        }
        return response;
      } });
    await api.login(qaNames(runId).emails[0], password);
    assert.equal((await api.me()).role, 'customer');
    assert.deepEqual(new Set((await api.coupons()).map(item => item.grantId)), new Set([goodsGrant, shippingGrant]));
    const products = await api.products();
    assert.equal(products.length, 5);
    const summary = products.find(p => p.title === `qa-${runId}-고추`);
    assert.ok(summary);
    const product = await api.product(summary.productId);
    await api.addFavorite(product.productId); await api.addFavorite(product.productId);
    assert.equal((await api.favorites()).filter(item => item.productId === product.productId).length, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM customer_favorites')).rows[0].n, 1);
    await api.removeFavorite(product.productId);
    assert.equal((await api.favorites()).length, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM customer_favorites')).rows[0].n, 0);
    await assert.rejects(api.subscribeRestock(product.productId, product.options[0].id), e => e.code === 'conflict');
    const restockProduct = await api.product(products.find(p => p.productId !== product.productId).productId);
    const restockOption = restockProduct.options[0];
    await pool.query('UPDATE inventory_levels SET on_hand_quantity=0,sellable_quantity=0 WHERE option_id=$1', [restockOption.id]);
    const subscribed = await api.subscribeRestock(restockProduct.productId, restockOption.id);
    assert.equal((await api.subscribeRestock(restockProduct.productId, restockOption.id)).id, subscribed.id);
    const subscription = (await api.restockSubscriptions()).find(item => item.id === subscribed.id);
    assert.equal(subscription.optionName, restockOption.name); assert.equal(subscription.optionState, 'sold_out');
    assert.equal(subscription.status, 'active');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM restock_subscriptions')).rows[0].n, 1);
    await api.cancelRestock(subscribed.id);
    assert.equal((await api.restockSubscriptions()).find(item => item.id === subscribed.id).status, 'cancelled');
    assert.equal((await pool.query('SELECT status FROM restock_subscriptions WHERE id=$1', [subscribed.id])).rows[0].status, 'cancelled');
    await api.setCartItem(product.options[0].id, 2);
    assert.equal((await api.cart())[0].quantity, 2);
    const quote = await api.quote();
    assert.equal(quote.totalWon, 49000);
    assert.equal(quote.shippingWon, 3000);
    const address = await api.addAddress({ label: 'S7 QA', recipientName: '가상 구매자', phone: '01000000000',
      postalCode: '12345', line1: '가상 시험 주소', line2: '', isDefault: true });
    const reserved = await api.reserve();
    const held = await api.reservation(reserved.id);
    assert.equal(held.status, 'ACTIVE'); assert.equal(held.quote.totalWon, 49000);
    await assert.rejects(api.promotionQuote(held.id, { goodsCoupon: { grantId: foreignGrant } }), e => e.code === 'not_found');
    const selections = { goodsCoupon: { grantId: goodsGrant },
      shippingCoupons: [{ shipmentKey: held.quote.shipments[0].key, grantId: shippingGrant }] };
    const preview = await api.promotionQuote(held.id, selections);
    assert.equal(preview.discountWon, 5000); assert.equal(preview.supportWon, 3000);
    assert.equal(preview.payableTotalWon, 41000);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM promotion_uses')).rows[0].n, 0);
    const input = { reservationId: held.id, addressId: address.id, expectedPayableWon: 41000, selections };
    await assert.rejects(api.submitOrder(input), e => e.code === 'offline');
    const order = await api.submitOrder(input);
    assert.equal(order.status, 'PENDING_PAYMENT');
    assert.equal(order.payableWon, 41000);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM checkout_orders')).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM promotion_uses')).rows[0].n, 2);
    assert.equal((await api.payMock(order.id, 'decline')).status, 'DECLINED');
    assert.equal((await api.order(order.id)).status, 'PENDING_PAYMENT');
    assert.equal((await api.payMock(order.id, 'approve')).status, 'APPROVED');
    assert.equal((await api.payMock(order.id, 'approve')).status, 'APPROVED');
    const paid = await api.order(order.id);
    assert.equal(paid.status, 'PAID'); assert.equal(paid.shipments.length, 1);
    assert.equal(paid.shipments[0].fulfillment.status, 'READY');
    assert.equal((await api.orders()).items[0].id, order.id);
    const refundInput = { shipmentOrderId: paid.shipments[0].id, lines: [{ optionId: product.options[0].id, quantity: 1 }],
      reasonCode: 'customer_request', reason: '가상 출고 전 일부 취소' };
    await assert.rejects(api.requestRefund(order.id, refundInput), e => e.code === 'offline');
    const refund = await api.requestRefund(order.id, refundInput);
    assert.equal(refund.status, 'REQUESTED'); assert.equal(refund.amountFinal, false);
    assert.equal(refund.estimateAvailable, true); assert.equal(refund.totalRefundWon, 20500);
    assert.equal((await api.refunds(order.id))[0].id, refund.id);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM refund_cases')).rows[0].n, 1);
    assert.equal((await pool.query('SELECT quantity FROM refund_case_lines WHERE refund_case_id=$1', [refund.id])).rows[0].quantity, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM refund_attempts')).rows[0].n, 0);
    assert.equal((await api.order(order.id)).payableWon, 41000);
    assert.equal((await api.order(order.id)).status, 'PAID');
    await assert.rejects(api.confirmPurchase(order.id, paid.shipments[0].id, product.options[0].id), e => e.code === 'not_found');
    const shipmentId = paid.shipments[0].id;
    const fulfillmentSellerId = (await pool.query(`UPDATE shipment_fulfillments SET status='SHIPPED',
      carrier_code='hanjin',tracking_number='S7QA1014',packed_at=now(),first_shipped_at=now(),shipped_at=now()
      WHERE shipment_order_id=$1 RETURNING fulfillment_seller_id`, [shipmentId])).rows[0].fulfillment_seller_id;
    await pool.query(`INSERT INTO shipment_fulfillment_events
      (shipment_order_id,action,from_status,to_status,actor_account_id,actor_role,actor_seller_id,
       before_snapshot,after_snapshot,idempotency_scope,idempotency_key,request_fingerprint)
      VALUES ($1,'MARK_SHIPPED','PACKING','SHIPPED',$2::uuid,'seller',$3,
       '{"status":"PACKING"}'::jsonb,'{"status":"SHIPPED"}'::jsonb,$2::uuid::text,$4,$5)`,
    [shipmentId, sellerId, fulfillmentSellerId, randomUUID(), 'a'.repeat(64)]);
    const confirmed = await api.confirmPurchase(order.id, shipmentId, product.options[0].id);
    assert.equal((await api.confirmPurchase(order.id, shipmentId, product.options[0].id)).id, confirmed.id);
    assert.equal((await api.confirmation(shipmentId, product.options[0].id)).id, confirmed.id);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM support_purchase_confirmations')).rows[0].n, 1);
    await assert.rejects(api.createReview(confirmed.id, 4, '가상 구매 후기'), e => e.code === 'offline');
    const review = await api.createReview(confirmed.id, 4, '가상 구매 후기');
    assert.equal(review.status, 'PENDING'); assert.equal((await api.review(review.id)).body, '가상 구매 후기');
    await api.editReview(review.id, 5, '가상 수정 후기');
    assert.equal((await api.review(review.id)).body, '가상 수정 후기');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM support_reviews')).rows[0].n, 1);
    const claimInput = { orderId: order.id, shipmentOrderId: shipmentId, optionId: product.options[0].id,
      kind: 'RETURN', reasonCode: 'damaged', reason: '가상 파손', quantity: 1 };
    await assert.rejects(api.createClaim(claimInput), e => e.code === 'offline');
    const claim = await api.createClaim(claimInput); assert.equal(claim.status, 'REQUESTED');
    assert.equal((await api.claims()).items[0].id, claim.id);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM support_claims')).rows[0].n, 1);
    await assert.rejects(api.createClaim({ ...claimInput, quantity: 2 }), e => e.code === 'conflict');
    await replyToClaim(pool, { claimId: claim.id, sellerId: fulfillmentSellerId, actorAccountId: sellerId,
      body: '가상 처리 안내', idempotencyKey: randomUUID() });
    const claimDetail = await api.claim(claim.id);
    assert.equal(claimDetail.status, 'SELLER_REPLIED');
    assert.equal(claimDetail.messages.find(message => message.authorRole === 'customer').body, '가상 파손');
    assert.equal(claimDetail.messages.find(message => message.authorRole === 'seller').body, '가상 처리 안내');
    const png = await sharp({ create: { width: 16, height: 16, channels: 4, background: '#dd8800' } }).png().toBuffer();
    const attachment = { name: 'qa.png', mimeType: 'image/png', bytes: Uint8Array.from(png).buffer };
    for (const [kind, target] of [['review', review.id], ['claim', claim.id]]) {
      await assert.rejects(api.uploadAttachment(kind, target, attachment), e => e.code === 'offline');
      const image = await api.uploadAttachment(kind, target, attachment);
      const detail = kind === 'review' ? await api.review(target) : await api.claim(target);
      const images = kind === 'review' ? detail.images : detail.evidence;
      assert.equal(images.length, 1); assert.equal(images[0].id, image.id);
      if (kind === 'review') { assert.equal(detail.status, 'PENDING'); assert.equal(images[0].scanStatus, 'PENDING'); }
      const previewUrl = api.attachmentUrl(kind, target, image.id);
      const preview = await fetch(previewUrl, { headers: { cookie } });
      assert.equal(preview.status, 200); assert.equal(preview.headers.get('content-type'), 'image/webp');
      assert.equal((await sharp(Buffer.from(await preview.arrayBuffer())).metadata()).width, 16);
      assert.equal((await fetch(previewUrl)).status, 401);
    }
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM support_review_images')).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM support_claim_evidence')).rows[0].n, 1);
    const asked = await api.askQuestion(product.productId, '가상 발송일 문의');
    assert.equal((await api.question(asked.id)).body, '가상 발송일 문의');
    assert.equal((await api.questions()).items[0].id, asked.id);
    await api.savePreferences({ marketingEmail: true, marketingSms: false, push: false });
    assert.deepEqual(await api.preferences(), { marketingEmail: true, marketingSms: false, push: false });
    await api.logout();
    await assert.rejects(api.addresses(), e => e.code === 'unauthorized');
    await assert.rejects(api.favorites(), e => e.code === 'unauthorized');
    await assert.rejects(api.restockSubscriptions(), e => e.code === 'unauthorized');
    await assert.rejects(api.coupons(), e => e.code === 'unauthorized');
    await assert.rejects(api.refunds(order.id), e => e.code === 'unauthorized');
    await assert.rejects(api.review(review.id), e => e.code === 'unauthorized');
    await assert.rejects(api.claim(claim.id), e => e.code === 'unauthorized');
  } finally {
    if (app) await app.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await pool.end();
    if (uploadRoot) await rm(uploadRoot, { recursive: true });
  }
});
