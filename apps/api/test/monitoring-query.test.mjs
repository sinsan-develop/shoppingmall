import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMonitoringQuery } from '../src/monitoring/query.ts';

test('monitoring dates are inclusive Korean days with exclusive UTC bounds', () => {
  const filter = parseMonitoringQuery({ from: '2026-05-01', to: '2026-05-20' });
  assert.equal(filter.start.toISOString(), '2026-04-30T15:00:00.000Z');
  assert.equal(filter.endExclusive.toISOString(), '2026-05-20T15:00:00.000Z');
  assert.equal(filter.sellerId, null);
  assert.equal(filter.orderStatus, null);
  assert.equal(filter.claimStatus, null);
});

test('monitoring accepts explicit seller and independent order/claim statuses', () => {
  const filter = parseMonitoringQuery({ from: '2026-01-01', to: '2026-01-01',
    sellerId: '11111111-1111-4111-8111-111111111111', orderStatus: 'PAID', claimStatus: 'REQUESTED' });
  assert.equal(filter.sellerId, '11111111-1111-4111-8111-111111111111');
  assert.equal(filter.orderStatus, 'PAID');
  assert.equal(filter.claimStatus, 'REQUESTED');
});

test('monitoring rejects invalid dates, order, seller, status and extra query keys', () => {
  for (const input of [
    { from: '2026-02-30', to: '2026-03-01' },
    { from: '2026-05-20', to: '2026-05-01' },
    { from: '2026-05-01' },
    { from: '2026-05-01', to: '2026-05-20', sellerId: 'not-a-uuid' },
    { from: '2026-05-01', to: '2026-05-20', orderStatus: 'APPROVED' },
    { from: '2026-05-01', to: '2026-05-20', claimStatus: 'PUBLISHED' },
    { from: '2026-05-01', to: '2026-05-20', ignored: 'x' },
    { from: ['2026-05-01'], to: '2026-05-20' },
  ]) assert.throws(() => parseMonitoringQuery(input), /Invalid monitoring query/);
});
