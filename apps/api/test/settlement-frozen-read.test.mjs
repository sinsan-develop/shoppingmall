import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSettlementQuery } from '../src/settlement/query.ts';
import { readSettlement } from '../src/settlement/repository.ts';

test('late backdated event stays outside frozen period and appears separately', async () => {
  const occurredAt = new Date('2026-05-02T00:00:00Z');
  const row = (id, linkedPeriodId) => ({ id, sellerId: 'seller-a', sellerName: '농가 A',
    sellerCategoryId: 'category-a', sellerCategoryName: '농가', kind: 'commission',
    amountWon: '1000', occurredAt, recordedAt: new Date('2026-07-01T00:00:00Z'),
    reason: '수수료 근거', checkoutOrderId: null, shipmentOrderId: null, productId: null,
    optionId: null, productName: null, optionName: null,
    sourceEventKind: 'manual_commission', sourceEventId: id,
    completionPeriodId: 'period-a', linkedPeriodId });
  const client = { async query(sql) {
    if (sql.includes('FROM settlement_events')) return { rows: [row('event-one', 'period-a'),
      row('event-late', null)] };
    if (sql.includes('FROM seller_settlement_periods')) return { rows: [{
      id: 'period-a', sellerId: 'seller-a', sellerName: '농가 A',
      startDate: '2026-05-01', endDate: '2026-05-20',
      completedAt: new Date('2026-05-20T09:00:00Z'), reason: '오프라인 확인',
    }] };
    if (sql.includes('seller_settlement_period_event_links')) return { rows: [{
      periodId: 'period-a', kind: 'commission', amountWon: '1000',
    }] };
    throw new Error('Unexpected query');
  } };
  const report = await readSettlement(client, parseSettlementQuery({ from: '2026-05-01',
    to: '2026-05-20' }));
  assert.deepEqual(report.groups[0].items.map(({ id }) => id), ['event-one']);
  assert.deepEqual(report.lateGroups[0].items.map(({ id }) => id), ['event-late']);
  assert.equal(report.totals.commission, 1000);
  assert.equal(report.lateTotals.commission, 1000);
  assert.equal(report.completions[0].frozenTotals.commission, 1000);
});

test('a correction linked before completion adjusts frozen original kind only once', async () => {
  const client = { async query(sql) {
    if (sql.includes('FROM settlement_events event')) return { rows: [] };
    if (sql.includes('FROM seller_settlement_periods')) return { rows: [{
      id: 'period-a', sellerId: 'seller-a', sellerName: '판매자 A',
      startDate: '2026-07-01', endDate: '2026-07-31',
      completedAt: new Date('2026-08-01T00:00:00Z'), reason: '완료',
    }] };
    if (sql.includes('seller_settlement_period_event_links')) {
      assert.match(sql, /correction\.correction_direction/);
      return { rows: [
        { periodId: 'period-a', kind: 'sale', amountWon: '10000' },
        { periodId: 'period-a', kind: 'sale', amountWon: '-2000' },
        { periodId: 'period-a', kind: 'correction', amountWon: '2000' },
      ] };
    }
    throw new Error('Unexpected query');
  } };
  const report = await readSettlement(client, parseSettlementQuery({
    from: '2026-07-01', to: '2026-07-31',
  }));
  assert.equal(report.completions[0].frozenTotals.sale, 8000);
  assert.equal(report.completions[0].frozenTotals.correction, 2000);
});
