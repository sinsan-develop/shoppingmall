import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let customer;
try { customer = require('./customer.js'); } catch { customer = {}; }

test('customer script runs as a classic local browser script', () => {
  const script = fs.readFileSync(new URL('./customer.js', import.meta.url), 'utf8');
  assert.doesNotThrow(() => new vm.Script(script));
});

function ready() {
  assert.equal(typeof customer.createCustomerState, 'function');
  assert.equal(typeof customer.addItem, 'function');
  assert.equal(typeof customer.quoteCart, 'function');
  assert.equal(typeof customer.simulatePayment, 'function');
  assert.equal(typeof customer.cancelPreShipment, 'function');
}

function filledCart() {
  let state = customer.createCustomerState();
  for (const id of ['pepper-a', 'onion-b', 'garlic-owool']) {
    const result = customer.addItem(state, id);
    assert.equal(result.error, null);
    state = result.state;
  }
  return state;
}

test('three seller shipments have one 101,000 won mock payment', () => {
  ready();
  const quote = customer.quoteCart(filledCart());
  assert.deepEqual(quote.groups.map(({ shipmentId, subtotal, discount, shipping, payable }) =>
    ({ shipmentId, subtotal, discount, shipping, payable })), [
    { shipmentId: 'farm-a', subtotal: 52000, discount: 5000, shipping: 0, payable: 47000 },
    { shipmentId: 'farm-b', subtotal: 30000, discount: 0, shipping: 3000, payable: 33000 },
    { shipmentId: 'owool', subtotal: 18000, discount: 0, shipping: 3000, payable: 21000 },
  ]);
  assert.equal(quote.total, 101000);
});

test('empty cart cannot be paid', () => {
  ready();
  const state = customer.createCustomerState();
  assert.deepEqual(customer.quoteCart(state), { groups: [], total: 0 });
  assert.match(customer.simulatePayment(state, 'success').error, /장바구니/);
});

test('sold-out product cannot be added', () => {
  ready();
  const state = customer.createCustomerState();
  const result = customer.addItem(state, 'blueberry-soldout');
  assert.match(result.error, /품절|재고/);
  assert.equal(customer.quoteCart(result.state).total, 0);
});

test('failed mock payment creates no shipment', () => {
  ready();
  const result = customer.simulatePayment(filledCart(), 'failure');
  assert.equal(result.error, null);
  assert.equal(result.state.paymentStatus, 'failure');
  assert.deepEqual(result.state.shipments, []);
});

test('pre-shipment farm B cancellation refunds goods and shipping only for B', () => {
  ready();
  const paid = customer.simulatePayment(filledCart(), 'success');
  assert.equal(paid.error, null);
  const cancelled = customer.cancelPreShipment(paid.state, 'farm-b');
  assert.equal(cancelled.error, null);
  assert.equal(cancelled.state.refundAmount, 33000);
  assert.deepEqual(cancelled.state.shipments.map(({ shipmentId, status }) => ({ shipmentId, status })), [
    { shipmentId: 'farm-a', status: 'paid' },
    { shipmentId: 'farm-b', status: 'cancelled' },
    { shipmentId: 'owool', status: 'paid' },
  ]);
  assert.match(customer.cancelPreShipment(cancelled.state, 'farm-b').error, /이미|취소/);
});

test('quantity multiplies unit price and per-unit discount before shipping', () => {
  ready();
  const initial = customer.createCustomerState();
  const added = customer.addItem(initial, 'pepper-a', 2);
  assert.equal(added.error, null);
  assert.deepEqual(added.state.cart, [{ productId: 'pepper-a', quantity: 2 }]);
  assert.deepEqual(initial.cart, []);
  assert.deepEqual(customer.quoteCart(added.state).groups.map(({ subtotal, discount, shipping, payable }) => ({ subtotal, discount, shipping, payable })), [
    { subtotal: 104000, discount: 10000, shipping: 0, payable: 94000 },
  ]);
});

test('cart quantity can change and item can be removed before payment', () => {
  ready();
  const initial = filledCart();
  const changed = customer.setItemQuantity(initial, 'onion-b', 2);
  assert.equal(changed.error, null);
  assert.equal(customer.quoteCart(changed.state).total, 128000);
  assert.equal(customer.quoteCart(initial).total, 101000);
  const removed = customer.removeItem(changed.state, 'onion-b');
  assert.equal(removed.error, null);
  assert.equal(customer.quoteCart(removed.state).total, 68000);
  assert.equal(removed.state.cart.length, 2);
});

test('quantities must be positive whole numbers within stock, including repeated additions', () => {
  ready();
  const state = customer.createCustomerState();
  for (const quantity of [0, -1, 1.5, NaN, '2', 19]) {
    assert.ok(customer.addItem(state, 'pepper-a', quantity).error);
  }
  const added = customer.addItem(state, 'pepper-a', 18);
  assert.equal(added.error, null);
  assert.ok(customer.addItem(added.state, 'pepper-a', 1).error);
  assert.ok(customer.setItemQuantity(added.state, 'pepper-a', 19).error);
  assert.ok(customer.setItemQuantity(added.state, 'pepper-a', 0).error);
  assert.equal(customer.quoteCart(added.state).groups[0].subtotal, 936000);
});

test('paid cart cannot be edited or removed and its shipment amount stays fixed', () => {
  ready();
  const paid = customer.simulatePayment(filledCart(), 'success');
  assert.equal(paid.error, null);
  assert.ok(customer.setItemQuantity(paid.state, 'pepper-a', 2).error);
  assert.ok(customer.removeItem(paid.state, 'pepper-a').error);
  assert.equal(paid.state.shipments[0].payable, 47000);
});

test('customer screen accepts a chosen quantity and exposes cart edit and remove controls', () => {
  ready();
  const nodes = new Map();
  for (const selector of ['[data-notice]', '[data-catalog]', '[data-cart-count]', '[data-shipment-count]', '[data-cart-items]', '[data-quote-groups]', '[data-total]', '[data-orders]', '[data-refund]', '[data-payment-status]']) {
    nodes.set(selector, { textContent: '', innerHTML: '' });
  }
  const handlers = {};
  const root = {
    querySelector: (selector) => nodes.get(selector),
    querySelectorAll: () => [],
    addEventListener: (name, handler) => { handlers[name] = handler; },
    contains: () => true,
  };
  nodes.set('[data-catalog-qty][data-id="pepper-a"]', { value: '2' });
  customer.mountCustomer(root);
  assert.match(nodes.get('[data-catalog]').innerHTML, /data-catalog-qty/);
  handlers.click({ target: { closest: () => ({ dataset: { action: 'add', id: 'pepper-a' } }) } });
  assert.match(nodes.get('[data-cart-items]').innerHTML, /52,000원 × 2 = 104,000원/);
  assert.match(nodes.get('[data-cart-items]').innerHTML, /data-cart-qty/);
  assert.match(nodes.get('[data-cart-items]').innerHTML, /data-action="remove"/);
  handlers.change({ target: { matches: () => true, dataset: { id: 'pepper-a' }, value: '3' } });
  assert.match(nodes.get('[data-cart-items]').innerHTML, /52,000원 × 3 = 156,000원/);
  handlers.click({ target: { closest: () => ({ dataset: { action: 'remove', id: 'pepper-a' } }) } });
  assert.match(nodes.get('[data-cart-items]').innerHTML, /장바구니가 비어/);
});
