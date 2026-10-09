import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSaleOccurrences, buildRefundOccurrences } from '../src/settlement/occurrence.ts';

const farm = { id: 'farm-a', name: '농가 A', categoryId: 'farm-category', categoryName: '농가' };
const owool = { id: 'owool', name: '어울몰', categoryId: 'mall-category', categoryName: '자체 판매' };

test('pooled shipment keeps producer sales but assigns delivery fees to the fulfillment seller', () => {
  const events = buildSaleOccurrences({
    paymentEventId: 'payment-1', orderId: 'order-1', occurredAt: '2026-05-01T02:00:00.000Z',
    shipments: [{ id: 'shipment-1', fulfillmentSeller: owool,
      shippingFeeWon: 3000, shippingSupportWon: 1000,
      lines: [{ productId: 'pepper', optionId: '500g', productName: '고추', optionName: '500g',
        producer: farm, unitPriceWon: 12000, quantity: 2, goodsDiscountWon: 2000 }],
    }],
  });
  assert.deepEqual(events.map(({ kind, sellerId, amountWon }) => ({ kind, sellerId, amountWon })), [
    { kind: 'sale', sellerId: 'farm-a', amountWon: 24000 },
    { kind: 'goods_discount', sellerId: 'farm-a', amountWon: 2000 },
    { kind: 'shipping_fee', sellerId: 'owool', amountWon: 3000 },
    { kind: 'shipping_support', sellerId: 'owool', amountWon: 1000 },
  ]);
  assert.equal(events[0].sellerCategoryName, '농가');
  assert.equal(events[0].productName, '고추');
  assert.equal(events[2].shipmentOrderId, 'shipment-1');
  assert.equal(events[0].sourceEventId, 'payment-1');
  assert.equal(new Set(events.map((item) => item.dedupeKey)).size, 4);
});

test('late refund is dated in July and retains its May order and producer evidence', () => {
  const events = buildRefundOccurrences({
    refundEventId: 'refund-1', orderId: 'order-1', shipmentOrderId: 'shipment-1',
    occurredAt: '2026-07-01T03:00:00.000Z', fulfillmentSeller: owool,
    shippingRefundWon: 3000,
    lines: [{ productId: 'pepper', optionId: '500g', productName: '고추', optionName: '500g',
      producer: farm, goodsRefundWon: 22000 }],
  });
  assert.deepEqual(events.map(({ kind, sellerId, amountWon }) => ({ kind, sellerId, amountWon })), [
    { kind: 'goods_refund', sellerId: 'farm-a', amountWon: 22000 },
    { kind: 'shipping_refund', sellerId: 'owool', amountWon: 3000 },
  ]);
  for (const item of events) {
    assert.equal(item.occurredAt, '2026-07-01T03:00:00.000Z');
    assert.equal(item.checkoutOrderId, 'order-1');
    assert.equal(item.sourceEventId, 'refund-1');
  }
  assert.equal(events[0].productName, '고추');
});

test('invalid money or missing owner never creates a settlement occurrence', () => {
  assert.throws(() => buildSaleOccurrences({ paymentEventId: 'payment-1', orderId: 'order-1',
    occurredAt: '2026-05-01T00:00:00Z', shipments: [{ id: 'shipment-1', fulfillmentSeller: owool,
      shippingFeeWon: -1, shippingSupportWon: 0, lines: [] }] }), /Invalid settlement occurrence/);
  assert.throws(() => buildRefundOccurrences({ refundEventId: 'refund-1', orderId: 'order-1',
    shipmentOrderId: 'shipment-1', occurredAt: '2026-07-01T00:00:00Z',
    fulfillmentSeller: undefined, shippingRefundWon: 3000, lines: [] }),
  /Invalid settlement occurrence/);
});

test('a zero-priced line creates no invalid zero-won ledger row', () => {
  const events = buildSaleOccurrences({ paymentEventId: 'payment-zero', orderId: 'order-zero',
    occurredAt: '2026-05-01T00:00:00Z', shipments: [{ id: 'shipment-zero',
      fulfillmentSeller: owool, shippingFeeWon: 0, shippingSupportWon: 0,
      lines: [{ productId: 'gift', optionId: 'free', productName: '사은품', optionName: '기본',
        producer: farm, unitPriceWon: 0, quantity: 1, goodsDiscountWon: 0 }] }] });
  assert.deepEqual(events, []);
});
