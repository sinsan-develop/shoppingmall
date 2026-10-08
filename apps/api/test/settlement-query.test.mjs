import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSettlementQuery } from '../src/settlement/query.ts';

const sellerId = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';

test('inclusive Korean calendar dates become an exclusive UTC range', () => {
  const query = parseSettlementQuery({ from: '2026-05-01', to: '2026-05-20',
    sellerId, categoryId });
  assert.equal(query.start.toISOString(), '2026-04-30T15:00:00.000Z');
  assert.equal(query.endExclusive.toISOString(), '2026-05-20T15:00:00.000Z');
  assert.equal(query.sellerId, sellerId);
  assert.equal(query.categoryId, categoryId);
});

test('all sellers and all categories use null filters', () => {
  const query = parseSettlementQuery({ from: '2026-07-01', to: '2026-07-01' });
  assert.equal(query.sellerId, null);
  assert.equal(query.categoryId, null);
});

test('invalid calendar dates, reversed range, unknown filters and malformed IDs fail closed', () => {
  for (const raw of [
    { from: '2026-02-30', to: '2026-03-01' },
    { from: '2026-07-01', to: '2026-05-01' },
    { from: '2026-05-01', to: '2026-05-01', sellerId: 'not-a-uuid' },
    { from: '2026-05-01', to: '2026-05-01', extra: 'unexpected' },
  ]) assert.throws(() => parseSettlementQuery(raw), /Invalid settlement query/);
});
