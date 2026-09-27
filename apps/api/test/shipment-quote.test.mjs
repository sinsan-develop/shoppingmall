import assert from 'node:assert/strict';
import test from 'node:test';
import { groupShipmentLines, shippingFeeWon } from '../src/checkout/shipment-quote.ts';
import { defaultShippingPolicy } from '../src/shipping/policy.ts';

test('one cart separates two direct sellers and one owool fulfillment into three shipment amounts', () => {
  const lines = [
    { optionId: 'chili', sellerId: 'seller-a', shippingMode: 'seller_direct', quantity: 2, unitPriceWon: 23000 },
    { optionId: 'powder', sellerId: 'owool', shippingMode: 'owool_fulfillment', quantity: 1, unitPriceWon: 18000 },
    { optionId: 'onion', sellerId: 'seller-a', shippingMode: 'seller_direct', quantity: 1, unitPriceWon: 12000 },
    { optionId: 'garlic', sellerId: 'seller-b', shippingMode: 'seller_direct', quantity: 1, unitPriceWon: 16000 },
    { optionId: 'blueberry', sellerId: 'seller-b', shippingMode: 'seller_direct', quantity: 1, unitPriceWon: 28000 },
  ];
  const groups = groupShipmentLines(lines);
  assert.deepEqual(groups.map(({ key, preDiscountGoodsWon, lines: ownLines }) =>
    ({ key, preDiscountGoodsWon, optionIds: ownLines.map(({ optionId }) => optionId) })), [
    { key: 'seller_direct:seller-a', preDiscountGoodsWon: 58000, optionIds: ['chili', 'onion'] },
    { key: 'owool_fulfillment', preDiscountGoodsWon: 18000, optionIds: ['powder'] },
    { key: 'seller_direct:seller-b', preDiscountGoodsWon: 44000, optionIds: ['garlic', 'blueberry'] },
  ]);
  assert.deepEqual(groups.map((group) => shippingFeeWon(group.preDiscountGoodsWon, defaultShippingPolicy)),
    [0, 3000, 3000]);
  assert.equal(lines[0].quantity, 2);
});

test('free shipping uses each shipment pre-discount goods amount at the exact threshold', () => {
  assert.equal(shippingFeeWon(49999, defaultShippingPolicy), 3000);
  assert.equal(shippingFeeWon(50000, defaultShippingPolicy), 0);
  assert.equal(shippingFeeWon(52000, defaultShippingPolicy), 0);
  const discountedPaymentGoodsWon = 52000 - 5000;
  assert.equal(discountedPaymentGoodsWon, 47000);
  assert.equal(shippingFeeWon(52000, defaultShippingPolicy), 0);
  assert.equal(shippingFeeWon(39999, { feeWon: 3500, freeThresholdWon: 40000 }), 3500);
  assert.equal(shippingFeeWon(40000, { feeWon: 3500, freeThresholdWon: 40000 }), 0);
});

test('shipment arithmetic rejects malformed quantities, money and unsafe totals', () => {
  const line = { optionId: 'one', sellerId: 'seller-a', shippingMode: 'seller_direct',
    quantity: 1, unitPriceWon: 1000 };
  for (const patch of [
    { quantity: 0 }, { quantity: 1.5 }, { quantity: -1 }, { unitPriceWon: -1 },
    { unitPriceWon: 1.5 }, { shippingMode: 'mixed' }, { sellerId: '' }, { optionId: '' },
  ]) assert.throws(() => groupShipmentLines([{ ...line, ...patch }]), /Invalid shipment line/);
  assert.throws(() => groupShipmentLines([{ ...line, quantity: Number.MAX_SAFE_INTEGER, unitPriceWon: 2 }]),
    /Invalid shipment amount/);
  assert.throws(() => shippingFeeWon(-1, defaultShippingPolicy), /Invalid shipment amount/);
});
