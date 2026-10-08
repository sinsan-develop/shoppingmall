import assert from 'node:assert/strict';
import test from 'node:test';

const rules = await import('../src/support/rules.ts').catch(() => ({}));

test('manual confirmation needs the owner paid line and SHIPPED fulfillment', () => {
  const subject = { customerId: 'buyer-a', orderOwnerId: 'buyer-a', orderStatus: 'PAID',
    shipmentStatus: 'PAID', fulfillmentStatus: 'SHIPPED', lineExists: true };
  assert.equal(rules.canConfirmPurchase?.(subject), true);
  assert.equal(rules.canConfirmPurchase?.({ ...subject, fulfillmentStatus: 'READY' }), false);
  assert.equal(rules.canConfirmPurchase?.({ ...subject, orderOwnerId: 'buyer-b' }), false);
  assert.equal(rules.canConfirmPurchase?.({ ...subject, lineExists: false }), false);
});

test('seller support scope follows the line seller snapshot, including consolidated shipping', () => {
  const line = { lineSellerId: 'farm-a', fulfillmentSellerId: 'owool-seller' };
  assert.equal(rules.canSellerHandleLine?.('farm-a', line), true);
  assert.equal(rules.canSellerHandleLine?.('owool-seller', line), false);
});

test('public review requires both administrator approval and every image scan PASS', () => {
  assert.equal(rules.canPublishReview?.('APPROVED', ['PASS', 'PASS']), true);
  assert.equal(rules.canPublishReview?.('PENDING', ['PASS']), false);
  assert.equal(rules.canPublishReview?.('APPROVED', ['PENDING']), false);
  assert.equal(rules.canPublishReview?.('APPROVED', ['FAILED']), false);
  assert.equal(rules.canPublishReview?.('APPROVED', ['UNAVAILABLE']), false);
});

test('post shipment policy caps incremental goods refund and never refunds shipping or restocks', () => {
  assert.deepEqual(rules.calculatePostShipmentRefund?.({ goodsPayableWon: 10001,
    purchasedQuantity: 3, occupiedQuantity: 0, requestedQuantity: 1 }),
  { goodsRefundWon: 3333, shippingRefundWon: 0, restockMode: 'none', restockedQuantity: 0 });
  assert.deepEqual(rules.calculatePostShipmentRefund?.({ goodsPayableWon: 10001,
    purchasedQuantity: 3, occupiedQuantity: 1, requestedQuantity: 2 }),
  { goodsRefundWon: 6668, shippingRefundWon: 0, restockMode: 'none', restockedQuantity: 0 });
  assert.throws(() => rules.calculatePostShipmentRefund?.({ goodsPayableWon: 10001,
    purchasedQuantity: 3, occupiedQuantity: 2, requestedQuantity: 2 }), /Refund conflict/);
});
