import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeSettlement } from '../src/settlement/summary.ts';

const item = (sellerId, sellerName, categoryId, kind, amountWon, occurredAt) => ({
  id: `${sellerId}-${kind}-${occurredAt}`, sellerId, sellerName,
  sellerCategoryId: categoryId, sellerCategoryName: categoryId,
  kind, amountWon, occurredAt, checkoutOrderId: 'original-order',
  shipmentOrderId: 'shipment', productId: 'product', optionId: 'option',
  productName: '고추', optionName: '500g', sourceEventKind: 'payment', sourceEventId: 'event',
});
test('report keeps farm A, farm B and Owool in distinct sections with category totals', () => {
  const report = summarizeSettlement([
    item('farm-b', '농가 B', '농가', 'sale', 12000, '2026-05-02T00:00:00Z'),
    item('owool', '어울몰', '자체', 'shipping_fee', 3000, '2026-05-01T00:00:00Z'),
    item('farm-a', '농가 A', '농가', 'sale', 24000, '2026-05-01T00:00:00Z'),
    item('farm-a', '농가 A', '농가', 'goods_discount', 2000, '2026-05-01T00:00:00Z'),
  ]);
  assert.deepEqual(report.groups.map(({ sellerId, items }) => [sellerId, items.length]), [
    ['farm-a', 2], ['farm-b', 1], ['owool', 1],
  ]);
  assert.equal(report.groups[0].totals.sale, 24000);
  assert.equal(report.groups[0].totals.goods_discount, 2000);
  assert.equal(report.groups[1].totals.sale, 12000);
  assert.equal(report.groups[2].totals.shipping_fee, 3000);
  assert.deepEqual(report.totals, {
    sale: 36000, goods_discount: 2000, shipping_fee: 3000,
    shipping_support: 0, goods_refund: 0, shipping_refund: 0,
    commission: 0, correction: 0,
  });
  assert.equal(report.groups[0].items[0].checkoutOrderId, 'original-order');
  assert.equal('netPayoutWon' in report, false, 'offline payout is not auto-calculated');
});

test('late refund stays a separate July occurrence without changing a May report', () => {
  const maySale = item('farm-a','농가 A','농가','sale',24000,'2026-05-01T00:00:00Z');
  const julyRefund = { ...item('farm-a','농가 A','농가','goods_refund',12000,
    '2026-07-01T00:00:00Z'), sourceEventKind: 'refund' };
  assert.equal(summarizeSettlement([maySale]).totals.sale, 24000);
  assert.equal(summarizeSettlement([julyRefund]).totals.goods_refund, 12000);
  assert.equal(julyRefund.checkoutOrderId, maySale.checkoutOrderId);
});

test('unsafe aggregate amount fails instead of silently rounding', () => {
  assert.throws(() => summarizeSettlement([
    item('farm-a','농가 A','농가','sale',Number.MAX_SAFE_INTEGER,'2026-05-01T00:00:00Z'),
    item('farm-a','농가 A','농가','sale',1,'2026-05-02T00:00:00Z'),
  ]), /Settlement amount overflow/);
});

test('correction keeps its own occurrence and adjusts only the original kind in that period', () => {
  const sale = item('farm-a','농가 A','농가','sale',10000,'2026-05-01T00:00:00Z');
  const correction = {
    ...item('farm-a','농가 A','농가','correction',2000,'2026-07-01T00:00:00Z'),
    id: 'correction-1', sourceEventKind: 'correction', sourceEventId: 'request-1',
    originalEventId: sale.id, correctedKind: 'sale', correctionDirection: 'decrease',
  };
  const may = summarizeSettlement([sale]);
  const july = summarizeSettlement([correction]);
  assert.equal(may.totals.sale, 10000);
  assert.equal(july.totals.correction, 2000);
  assert.equal(july.totals.sale, -2000);
  assert.equal(july.groups[0].items[0].originalEventId, sale.id);
});
