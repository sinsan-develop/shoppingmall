import assert from 'node:assert/strict';
import test from 'node:test';
import { completeSellerPeriod } from '../src/settlement/complete.ts';

test('completion inserts membership for same seller and Seoul dates before returning', async () => {
  const calls = [];
  const adminId = '11111111-1111-4111-8111-111111111111';
  const sellerId = '22222222-2222-4222-8222-222222222222';
  const client = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes('INSERT INTO seller_settlement_periods')) return { rowCount: 1, rows: [{
      id: '33333333-3333-4333-8333-333333333333', sellerId,
      startDate: '2026-05-01', endDate: '2026-05-20',
      completedAt: new Date('2026-05-20T00:00:00Z'),
    }] };
    if (sql.includes('INSERT INTO seller_settlement_period_event_links')) return { rowCount: 2 };
    throw new Error('Unexpected query');
  } };
  await completeSellerPeriod(client, adminId, { sellerId, from: '2026-05-01',
    to: '2026-05-20', reason: '오프라인 확인' });
  assert.equal(calls.length, 2);
  assert.match(calls[1].sql, /event\.seller_id=\$2/);
  assert.match(calls[1].sql, /Asia\/Seoul/);
  assert.deepEqual(calls[1].params, ['33333333-3333-4333-8333-333333333333', sellerId,
    '2026-05-01', '2026-05-20']);
});
