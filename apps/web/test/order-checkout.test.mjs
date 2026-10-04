import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CartView, restorePendingOrderRequest, submitOrderRequest } from '../app/cart/page.tsx';

test('pending order request keeps its key for safe retry and never claims payment', async () => {
  const key = randomUUID();
  const values = new Map([['owool-checkout-order-key', key]]);
  const storage = { getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value),
    removeItem: (name) => values.delete(name) };
  const sent = [];
  const input = { reservationId: randomUUID(), addressId: randomUUID(), selections: {},
    expectedPayableWon: 49000 };
  const send = async (_url, options) => {
    sent.push(options.headers['idempotency-key']);
    return sent.length === 1 ? Response.json({}, { status: 503 }) :
      Response.json({ id: randomUUID(), status: 'PENDING_PAYMENT', payableWon: 49000,
        expiresAt: new Date().toISOString(), shipments: [] }, { status: 200 });
  };
  await assert.rejects(() => submitOrderRequest('http://127.0.0.1:9092', storage, input, send));
  const order = await submitOrderRequest('http://127.0.0.1:9092', storage, input, send);
  assert.equal(order.status, 'PENDING_PAYMENT');
  assert.deepEqual(sent, [key, key]);
  assert.equal(values.get('owool-checkout-order-key'), key);
  assert.equal(values.get('owool-checkout-order-id'), order.id);
  assert.equal(values.get('owool-checkout-order-reservation-id'), input.reservationId);
});

test('an older pending order does not hide submission for a new reservation', () => {
  const quote = { goodsWon: 23000, shippingWon: 3000, totalWon: 26000,
    shipments: [{ key: 'seller_direct:s1', shippingMode: 'seller_direct', sellerId: 's1',
      goodsWon: 23000, shippingWon: 3000, totalWon: 26000, lines: [] }] };
  const html = renderToStaticMarkup(createElement(CartView, {
    items: [], edits: {}, busy: '', message: '', loading: false,
    reservation: { id: 'new-hold', status: 'ACTIVE', expiresAt: '2026-10-05T00:00:00Z',
      lines: [], quote },
    pendingOrder: { id: 'older-order', reservationId: 'old-hold', status: 'EXPIRED',
      payableWon: 26000, expiresAt: '2026-10-04T00:00:00Z', shipments: [] },
    addresses: [{ id: 'a1', label: '집' }], selectedAddressId: 'a1',
    onAddressChange: () => {}, onSubmitOrder: () => {},
    onEdit: () => {}, onSave: () => {}, onRemove: () => {},
  }));
  assert.match(html, /결제대기 주문 생성/);
  assert.match(html, /이전 주문/);
});

test('a late previous-order response cannot replace a newly submitted order', async () => {
  const oldId = randomUUID(); const newId = randomUUID();
  const values = new Map([['owool-checkout-order-id', oldId],
    ['owool-checkout-order-reservation-id', 'old-hold']]);
  const storage = { getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value),
    removeItem: (name) => values.delete(name) };
  let release;
  const send = async () => new Promise((resolve) => { release = resolve; });
  const pending = restorePendingOrderRequest('http://127.0.0.1:9092', storage, send);
  values.set('owool-checkout-order-id', newId);
  values.set('owool-checkout-order-reservation-id', 'new-hold');
  release(Response.json({ id: oldId, status: 'EXPIRED', payableWon: 26000,
    expiresAt: new Date().toISOString(), shipments: [] }));
  assert.equal(await pending, undefined);
  assert.equal(values.get('owool-checkout-order-id'), newId);
});

test('active cart offers pending submission but preserves quantity and remove controls', () => {
  const quote = { goodsWon: 46000, shippingWon: 3000, totalWon: 49000,
    shipments: [{ key: 'seller_direct:s1', shippingMode: 'seller_direct', sellerId: 's1',
      goodsWon: 46000, shippingWon: 3000, totalWon: 49000, lines: [] }] };
  const html = renderToStaticMarkup(createElement(CartView, {
    items: [{ optionId: 'o1', productId: 'p1', title: '고추', optionName: '500g',
      quantity: 2, unitPriceWon: 23000, availability: 'available' }], quote,
    reservation: { id: 'r1', status: 'ACTIVE', expiresAt: '2026-10-05T00:00:00Z',
      lines: [{ optionId: 'o1', quantity: 2 }], quote },
    edits: {}, busy: '', message: '', loading: false, addresses: [{ id: 'a1', label: '집' }],
    selectedAddressId: 'a1', onAddressChange: () => {}, onSubmitOrder: () => {},
    onEdit: () => {}, onSave: () => {}, onRemove: () => {}, onRelease: () => {},
  }));
  assert.match(html, /결제대기 주문 생성/);
  assert.match(html, /수량 변경/);
  assert.match(html, /제거/);
  assert.doesNotMatch(html, /결제 완료/);
});
