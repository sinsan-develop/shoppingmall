import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let admin;
try { admin = require('./admin.js'); } catch { admin = {}; }
const ready = () => assert.equal(typeof admin.createAdminState, 'function');

test('admin script is a classic browser script', () => {
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync(new URL('./admin.js', import.meta.url), 'utf8')));
});

test('approval and rejection change only the admin scenario', () => {
  ready();
  const initial = admin.createAdminState();
  assert.equal(initial.effectiveThreshold, 50000);
  const approved = admin.decideRequest(initial, 'QA-REQ-001', 'approve');
  assert.equal(approved.error, null);
  assert.equal(approved.state.effectiveThreshold, 60000);
  assert.equal(approved.state.requests[0].status, 'approved');
  assert.equal(approved.state.history[0].role, '관리자');
  assert.equal(initial.requests[0].status, 'pending');
  const rejected = admin.decideRequest(initial, 'QA-REQ-001', 'reject');
  assert.equal(rejected.state.requests[0].status, 'rejected');
  assert.equal(rejected.state.effectiveThreshold, 50000);
});

test('pre-shipment refund includes goods and shipping but post-shipment claim has no fixed amount', () => {
  ready();
  const state = admin.createAdminState();
  const refunded = admin.refundPreShipment(state, 'farm-b');
  assert.equal(refunded.error, null);
  assert.equal(refunded.state.refundAmount, 33000);
  assert.equal(refunded.state.shipments[0].status, 'refunded');
  assert.match(admin.refundPreShipment(refunded.state, 'farm-b').error, /이미|환불/);
  assert.equal(refunded.state.postShipmentClaim.refundAmount, null);
});

test('settlement uses occurrence date and links July refund to May sale', () => {
  ready();
  const state = admin.createAdminState();
  const may = admin.sumSettlement(state, 'farm-a', '2026-05-01', '2026-05-20');
  assert.equal(may.error, null);
  assert.deepEqual(may.totals, { sales: 520000, fees: 12000, shipping: 0, discounts: 50000, refunds: 0 });
  const july = admin.sumSettlement(state, 'farm-a', '2026-07-01', '2026-07-01');
  assert.equal(july.totals.refunds, 47000);
  const refund = state.entries.find((entry) => entry.type === 'refunds');
  assert.equal(refund.occurredAt, '2026-07-01');
  assert.equal(refund.sourceOrderId, 'QA-2026-05-001');
  assert.equal(refund.sourceSaleAt, '2026-05-01');
});

test('completion validates dates and overlaps per farmer', () => {
  ready();
  const state = admin.createAdminState();
  assert.match(admin.completeSettlement(state, 'farm-a', '2026-05-20', '2026-05-01').error, /기간|날짜/);
  assert.match(admin.completeSettlement(state, 'farm-a', '2026-05-10', '2026-05-25').error, /중복|완료/);
  const farmB = admin.completeSettlement(state, 'farm-b', '2026-05-01', '2026-05-20');
  assert.equal(farmB.error, null);
  assert.equal(farmB.state.completedPeriods.find((period) => period.farmId === 'farm-b').status, 'completed');
  assert.equal(farmB.state.completedPeriods.find((period) => period.farmId === 'farm-a').status, 'completed');
});

test('all-farm query includes every farm and farm-level rows in the selected period', () => {
  ready();
  const state = admin.createAdminState();
  const report = admin.getSettlementReport(state, 'all', '2026-05-01', '2026-05-20');
  assert.equal(report.error, null);
  assert.deepEqual(report.totals, { sales: 820000, fees: 12000, shipping: 3000, discounts: 50000, refunds: 0 });
  assert.deepEqual(report.groups.map((group) => ({ farmId: group.farmId, sales: group.totals.sales, rows: group.entries.length })), [
    { farmId: 'farm-a', sales: 520000, rows: 3 },
    { farmId: 'farm-b', sales: 300000, rows: 2 },
  ]);
  assert.equal(state.entries.length, 6);
});

test('all-farm July query shows later refund with original sale reference', () => {
  ready();
  const report = admin.getSettlementReport(admin.createAdminState(), 'all', '2026-07-01', '2026-07-01');
  assert.equal(report.totals.refunds, 47000);
  assert.equal(report.entries.length, 1);
  assert.equal(report.entries[0].sourceOrderId, 'QA-2026-05-001');
  assert.equal(report.entries[0].sourceSaleAt, '2026-05-01');
});

test('all-farm view does not permit collective settlement completion', () => {
  ready();
  const state = admin.createAdminState();
  const result = admin.completeSettlement(state, 'all', '2026-05-01', '2026-05-20');
  assert.match(result.error, /개별/);
  assert.equal(result.state, state);
  assert.equal(state.completedPeriods.length, 1);
});

test('admin screen shows the all-farm query and opens print for the displayed report', () => {
  ready();
  const selectors = ['[data-notice]', '[data-request-status]', '[data-effective-policy]', '[data-request-history]', '[data-refund-status]', '[data-settlement-totals]', '[data-settlement-entries]', '[data-completed-periods]', '[data-report-scope]'];
  const nodes = new Map(selectors.map((selector) => [selector, { textContent: '', innerHTML: '' }]));
  nodes.set('[data-farm]', { value: 'all' });
  nodes.set('[data-start]', { value: '2026-05-01' });
  nodes.set('[data-end]', { value: '2026-05-20' });
  nodes.set('[data-complete-button]', { disabled: false });
  let click;
  let prints = 0;
  const root = {
    querySelector: (selector) => nodes.get(selector), querySelectorAll: () => [],
    addEventListener: (name, handler) => { if (name === 'click') click = handler; }, contains: () => true,
  };
  admin.mountAdmin(root, () => { prints += 1; });
  click({ target: { closest: () => ({ dataset: { action: 'query' } }) } });
  assert.match(nodes.get('[data-report-scope]').textContent, /전체.*2026-05-01.*2026-05-20/);
  assert.match(nodes.get('[data-settlement-totals]').innerHTML, /820,000원/);
  assert.match(nodes.get('[data-settlement-entries]').innerHTML, /농가 A/);
  assert.match(nodes.get('[data-settlement-entries]').innerHTML, /농가 B/);
  assert.equal(nodes.get('[data-complete-button]').disabled, true);
  click({ target: { closest: () => ({ dataset: { action: 'print' } }) } });
  assert.equal(prints, 1);
});
