import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { CustomerApi } from '../../mobile/src/customer-api.ts';

test('mobile customer client drives real HTTP DB purchase, retry, delivery, question and preferences', {
  skip: !process.env.QA_S7_DB_SYSTEM_ID,
}, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname, 'shoppingmall-qa-s7-20261014-pg');
  assert.equal(url.pathname, '/shoppingmall');
  const pool = new Pool({ connectionString: url.toString() });
  let app;
  const previous = { APP_ENV: process.env.APP_ENV, API_HOST: process.env.API_HOST,
    PAYMENT_MODE: process.env.PAYMENT_MODE, WEB_ORIGIN: process.env.WEB_ORIGIN };
  try {
    const identity = (await pool.query('SELECT current_database() AS db, system_identifier::text AS id FROM pg_control_system()')).rows[0];
    assert.equal(identity.db, 'shoppingmall');
    assert.equal(identity.id, process.env.QA_S7_DB_SYSTEM_ID);
    assert.notEqual(identity.id, '7622490131194466339');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n, 0);
    const runId = '7a141001';
    const password = 'Synthetic-mobile-password-1014';
    await runQaCatalogFixture('seed', runId, url.toString(), password);
    process.env.APP_ENV = 'development'; process.env.API_HOST = '127.0.0.1';
    process.env.PAYMENT_MODE = 'mock'; process.env.WEB_ORIGIN = 'http://127.0.0.1:9091';
    app = await createApp(); await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    let cookie = ''; let loseOrderReply = true;
    const api = new CustomerApi({ apiOrigin: base, webOrigin: process.env.WEB_ORIGIN, createKey: randomUUID,
      send: async (address, options) => {
        const response = await fetch(address, { ...options, headers: { ...options.headers, ...(cookie ? { cookie } : {}) } });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        if (String(address) === `${base}/customer/checkout/orders` && options.method === 'POST' && loseOrderReply) {
          loseOrderReply = false; await response.arrayBuffer(); throw new Error('Synthetic response loss after DB commit');
        }
        return response;
      } });
    await api.login(qaNames(runId).emails[0], password);
    assert.equal((await api.me()).role, 'customer');
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
    const input = { reservationId: held.id, addressId: address.id, expectedPayableWon: 49000, selections: {} };
    await assert.rejects(api.submitOrder(input), e => e.code === 'offline');
    const order = await api.submitOrder(input);
    assert.equal(order.status, 'PENDING_PAYMENT');
    assert.equal(order.payableWon, 49000);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM checkout_orders')).rows[0].n, 1);
    assert.equal((await api.payMock(order.id, 'decline')).status, 'DECLINED');
    assert.equal((await api.order(order.id)).status, 'PENDING_PAYMENT');
    assert.equal((await api.payMock(order.id, 'approve')).status, 'APPROVED');
    assert.equal((await api.payMock(order.id, 'approve')).status, 'APPROVED');
    const paid = await api.order(order.id);
    assert.equal(paid.status, 'PAID'); assert.equal(paid.shipments.length, 1);
    assert.equal(paid.shipments[0].fulfillment.status, 'READY');
    assert.equal((await api.orders()).items[0].id, order.id);
    const asked = await api.askQuestion(product.productId, '가상 발송일 문의');
    assert.equal((await api.question(asked.id)).body, '가상 발송일 문의');
    assert.equal((await api.questions()).items[0].id, asked.id);
    await api.savePreferences({ marketingEmail: true, marketingSms: false, push: false });
    assert.deepEqual(await api.preferences(), { marketingEmail: true, marketingSms: false, push: false });
    await api.logout();
    await assert.rejects(api.addresses(), e => e.code === 'unauthorized');
    await assert.rejects(api.favorites(), e => e.code === 'unauthorized');
    await assert.rejects(api.restockSubscriptions(), e => e.code === 'unauthorized');
  } finally {
    if (app) await app.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await pool.end();
  }
});
