import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSettlementQuery } from '../src/settlement/query.ts';
import { readSettlement } from '../src/settlement/repository.ts';

test('a period report includes matching status-only completion history', async () => {
  const queries = [];
  const client = { async query(sql, params) {
    queries.push({ sql, params });
    if (sql.includes('FROM settlement_events')) return { rows: [] };
    if (sql.includes('FROM seller_settlement_periods')) return { rows: [{
      id: 'period-a', sellerId: 'seller-a', sellerName: '농가 A',
      startDate: '2026-05-01', endDate: '2026-05-20',
      completedAt: new Date('2026-05-20T09:00:00Z'), reason: '오프라인 확인',
    }] };
    throw new Error('Unexpected query');
  } };
  const report = await readSettlement(client, parseSettlementQuery({
    from: '2026-05-01', to: '2026-05-20',
  }));
  assert.deepEqual(report.completions, [{
    id: 'period-a', sellerId: 'seller-a', sellerName: '농가 A',
    startDate: '2026-05-01', endDate: '2026-05-20',
    completedAt: '2026-05-20T09:00:00.000Z', reason: '오프라인 확인',
  }]);
  assert.equal(queries.length, 2);
  assert.equal('completedAmountWon' in report.completions[0], false);
});
