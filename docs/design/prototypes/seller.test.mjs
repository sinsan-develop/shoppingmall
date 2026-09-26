import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let seller;
try { seller = require('./seller.js'); } catch { seller = {}; }
const ready = () => assert.equal(typeof seller.createSellerState, 'function');

test('seller script is a classic browser script', () => {
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync(new URL('./seller.js', import.meta.url), 'utf8')));
});

test('free-shipping proposal stays pending without changing live policy', () => {
  ready();
  const result = seller.requestFreeShipping(seller.createSellerState(), 60000);
  assert.equal(result.error, null);
  assert.equal(result.state.publicFreeShippingThreshold, 50000);
  assert.deepEqual(result.state.policyRequest, { proposedThreshold: 60000, status: 'pending' });
});

test('sold-out is immediate while restock remains pending', () => {
  ready();
  const sold = seller.markSoldOut(seller.createSellerState(), 'pepper-a');
  assert.equal(sold.error, null);
  assert.equal(sold.state.products[0].stock, 0);
  assert.equal(sold.state.products[0].purchasable, false);
  const requested = seller.requestRestock(sold.state, 'pepper-a', 20);
  assert.equal(requested.error, null);
  assert.equal(requested.state.products[0].stock, 0);
  assert.equal(requested.state.products[0].purchasable, false);
  assert.deepEqual(requested.state.restockRequest, { productId: 'pepper-a', proposedStock: 20, status: 'pending' });
});

test('shipment tracking is immediate but empty or foreign order is rejected', () => {
  ready();
  const state = seller.createSellerState();
  assert.match(seller.shipOrder(state, 'QA-FARM-A-001', '').error, /운송장/);
  assert.match(seller.shipOrder(state, 'QA-FARM-B-001', 'QA-TRACK-123').error, /담당|주문/);
  const shipped = seller.shipOrder(state, 'QA-FARM-A-001', 'QA-TRACK-123');
  assert.equal(shipped.error, null);
  assert.equal(shipped.state.orders[0].status, 'shipped');
  assert.equal(shipped.state.orders[0].trackingNumber, 'QA-TRACK-123');
});

test('seller module has no refund or settlement-complete actions', () => {
  ready();
  assert.equal(seller.refundPreShipment, undefined);
  assert.equal(seller.completeSettlement, undefined);
});

test('entered lower stock applies immediately and zero blocks purchase', () => {
  ready();
  const initial = seller.createSellerState();
  const lowered = seller.setStockQuantity(initial, 'pepper-a', 5);
  assert.equal(lowered.error, null);
  assert.equal(lowered.state.products[0].stock, 5);
  assert.equal(lowered.state.products[0].purchasable, true);
  assert.equal(initial.products[0].stock, 18);
  const soldOut = seller.setStockQuantity(lowered.state, 'pepper-a', 0);
  assert.equal(soldOut.error, null);
  assert.equal(soldOut.state.products[0].stock, 0);
  assert.equal(soldOut.state.products[0].purchasable, false);
});

test('entered increase or reopening waits for approval without changing live stock', () => {
  ready();
  const initial = seller.createSellerState();
  const raised = seller.setStockQuantity(initial, 'pepper-a', 20);
  assert.equal(raised.error, null);
  assert.equal(raised.state.products[0].stock, 18);
  assert.deepEqual(raised.state.restockRequest, { productId: 'pepper-a', proposedStock: 20, status: 'pending' });
  const soldOut = seller.setStockQuantity(initial, 'pepper-a', 0).state;
  const reopened = seller.setStockQuantity(soldOut, 'pepper-a', 8);
  assert.equal(reopened.state.products[0].stock, 0);
  assert.equal(reopened.state.products[0].purchasable, false);
  assert.equal(reopened.state.restockRequest.proposedStock, 8);
});

test('invalid or duplicate stock edits do not change state', () => {
  ready();
  const initial = seller.createSellerState();
  for (const quantity of [-1, 1.5, NaN, '5']) {
    const result = seller.setStockQuantity(initial, 'pepper-a', quantity);
    assert.ok(result.error);
    assert.equal(result.state, initial);
  }
  const pending = seller.setStockQuantity(initial, 'pepper-a', 20).state;
  assert.ok(seller.setStockQuantity(pending, 'pepper-a', 21).error);
});

test('seller screen applies the entered stock instead of fixed 0 or 20', () => {
  ready();
  const selectors = ['[data-notice]', '[data-live-policy]', '[data-policy-request]', '[data-product-stock]', '[data-restock-request]', '[data-order-status]', '[data-tracking]'];
  const nodes = new Map(selectors.map((selector) => [selector, { textContent: '' }]));
  nodes.set('[data-stock-input]', { value: '5' });
  nodes.set('[data-tracking-input]', { value: 'QA-TRACK-123' });
  let click;
  const root = {
    querySelector: (selector) => nodes.get(selector), querySelectorAll: () => [],
    addEventListener: (name, handler) => { if (name === 'click') click = handler; }, contains: () => true,
  };
  seller.mountSeller(root);
  nodes.get('[data-stock-input]').value = '';
  click({ target: { closest: () => ({ dataset: { action: 'stock' } }) } });
  assert.match(nodes.get('[data-product-stock]').textContent, /재고 18개/);
  nodes.get('[data-stock-input]').value = '5';
  click({ target: { closest: () => ({ dataset: { action: 'stock' } }) } });
  assert.match(nodes.get('[data-product-stock]').textContent, /재고 5개/);
  nodes.get('[data-stock-input]').value = '20';
  click({ target: { closest: () => ({ dataset: { action: 'stock' } }) } });
  assert.match(nodes.get('[data-restock-request]').textContent, /재고 20개 요청 · 승인 대기/);
  assert.match(nodes.get('[data-product-stock]').textContent, /재고 5개/);
});
