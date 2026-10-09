import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSettlementQuery } from '../src/settlement/query.ts';
import { readSettlement } from '../src/settlement/repository.ts';

test('July correction read exposes original sale and signed July effect without changing May', async () => {
  const client = { async query(sql) {
    if (sql.includes('FROM settlement_events event')) return { rows: [{
      id: 'correction-a', sellerId: 'seller-a', sellerName: '판매자 A',
      sellerCategoryId: 'category-a', sellerCategoryName: '분류 A',
      kind: 'correction', amountWon: '2000',
      occurredAt: new Date('2026-07-01T00:00:00Z'),
      recordedAt: new Date('2026-07-01T00:00:00Z'), reason: '판매액 정정',
      checkoutOrderId: sql.includes('coalesce(event.checkout_order_id,original.checkout_order_id)')
        ? 'original-order' : null,
      shipmentOrderId: sql.includes('coalesce(event.shipment_order_id,original.shipment_order_id)')
        ? 'original-shipment' : null,
      productId: sql.includes('coalesce(event.product_id,original.product_id)')
        ? 'original-product' : null,
      optionId: sql.includes('coalesce(event.option_id,original.option_id)')
        ? 'original-option' : null,
      productName: null, optionName: null,
      sourceEventKind: 'correction', sourceEventId: 'request-a',
      originalEventId: sql.includes('original_event_id AS "originalEventId"') ? 'sale-a' : null,
      correctedKind: sql.includes('original.kind AS "correctedKind"') ? 'sale' : null,
      correctionDirection: sql.includes('correction_direction AS "correctionDirection"')
        ? 'decrease' : null,
      completionPeriodId: null, linkedPeriodId: null,
    }] };
    if (sql.includes('FROM seller_settlement_periods')) return { rows: [] };
    throw new Error('Unexpected query');
  } };
  const report = await readSettlement(client, parseSettlementQuery({
    from: '2026-07-01', to: '2026-07-31',
  }));
  assert.equal(report.totals.correction, 2000);
  assert.equal(report.totals.sale, -2000);
  assert.equal(report.groups[0].items[0].originalEventId, 'sale-a');
  assert.equal(report.groups[0].items[0].checkoutOrderId, 'original-order');
  assert.equal(report.groups[0].items[0].productId, 'original-product');
});
