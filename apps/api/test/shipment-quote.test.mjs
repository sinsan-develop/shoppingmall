import assert from 'node:assert/strict';
import test from 'node:test';
import * as shipmentQuote from '../src/checkout/shipment-quote.ts';
import { groupShipmentLines, quoteShipments, shippingFeeWon } from '../src/checkout/shipment-quote.ts';
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

test('owool fulfillment pools producer sellers but never mixes their direct shipment', () => {
  const groups = groupShipmentLines([
    { optionId: 'a-warehouse', sellerId: 'seller-a', shippingMode: 'owool_fulfillment',
      quantity: 1, unitPriceWon: 26000 },
    { optionId: 'b-warehouse', sellerId: 'seller-b', shippingMode: 'owool_fulfillment',
      quantity: 1, unitPriceWon: 24000 },
    { optionId: 'a-direct', sellerId: 'seller-a', shippingMode: 'seller_direct',
      quantity: 1, unitPriceWon: 23000 },
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(({ key, preDiscountGoodsWon, sellerId }) =>
    ({ key, preDiscountGoodsWon, sellerId })), [
    { key: 'owool_fulfillment', preDiscountGoodsWon: 50000, sellerId: null },
    { key: 'seller_direct:seller-a', preDiscountGoodsWon: 23000, sellerId: 'seller-a' },
  ]);
  assert.deepEqual(groups[0].lines.map((line) => line.sellerId), ['seller-a', 'seller-b']);
  assert.deepEqual(groups.map((group) => shippingFeeWon(group.preDiscountGoodsWon, defaultShippingPolicy)), [0, 3000]);
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

test('a server quote totals each seller shipment with its effective policy, not the combined cart threshold', () => {
  const quote = quoteShipments([
    { optionId: 'chili', sellerId: 'seller-a', shippingMode: 'seller_direct', quantity: 2, unitPriceWon: 23000 },
    { optionId: 'powder', sellerId: 'owool', shippingMode: 'owool_fulfillment', quantity: 1, unitPriceWon: 18000 },
    { optionId: 'onion', sellerId: 'seller-a', shippingMode: 'seller_direct', quantity: 1, unitPriceWon: 12000 },
    { optionId: 'garlic', sellerId: 'seller-b', shippingMode: 'seller_direct', quantity: 1, unitPriceWon: 16000 },
    { optionId: 'blueberry', sellerId: 'seller-b', shippingMode: 'seller_direct', quantity: 1, unitPriceWon: 28000 },
  ], (group) => group.sellerId === 'seller-b'
    ? { feeWon: 3500, freeThresholdWon: 40000 }
    : defaultShippingPolicy);
  assert.deepEqual(quote.shipments.map(({ key, goodsWon, shippingWon, totalWon }) =>
    ({ key, goodsWon, shippingWon, totalWon })), [
    { key: 'seller_direct:seller-a', goodsWon: 58000, shippingWon: 0, totalWon: 58000 },
    { key: 'owool_fulfillment', goodsWon: 18000, shippingWon: 3000, totalWon: 21000 },
    { key: 'seller_direct:seller-b', goodsWon: 44000, shippingWon: 0, totalWon: 44000 },
  ]);
  assert.equal(quote.goodsWon, 120000);
  assert.equal(quote.shippingWon, 3000);
  assert.equal(quote.totalWon, 123000);
  assert.throws(() => quoteShipments([], () => defaultShippingPolicy), /Empty cart/);
  assert.throws(() => quoteShipments([
    { optionId: 'one', sellerId: 'a', shippingMode: 'seller_direct', quantity: 1,
      unitPriceWon: Number.MAX_SAFE_INTEGER },
    { optionId: 'two', sellerId: 'b', shippingMode: 'seller_direct', quantity: 1, unitPriceWon: 1 },
  ], () => defaultShippingPolicy), /Invalid shipment amount/);
});

test('integrated discount allocates only eligible pre-discount goods and preserves the won total', () => {
  const allocate = shipmentQuote.allocateShipmentDiscountWon;
  assert.equal(typeof allocate, 'function');
  assert.deepEqual(allocate([
    { key: 'seller_direct:a', eligibleGoodsWon: 20000 },
    { key: 'owool_fulfillment', eligibleGoodsWon: 0 },
    { key: 'seller_direct:b', eligibleGoodsWon: 30000 },
  ], 5000), [
    { key: 'seller_direct:a', discountWon: 2000 },
    { key: 'owool_fulfillment', discountWon: 0 },
    { key: 'seller_direct:b', discountWon: 3000 },
  ]);
  assert.deepEqual(allocate([
    { key: 'a', eligibleGoodsWon: 100 },
    { key: 'b', eligibleGoodsWon: 200 },
    { key: 'c', eligibleGoodsWon: 300 },
  ], 100).map((part) => part.discountWon), [17, 33, 50]);
});

test('one-won remainder is stable by shipment key rather than cart line order', () => {
  const allocate = shipmentQuote.allocateShipmentDiscountWon;
  assert.equal(typeof allocate, 'function');
  assert.deepEqual(allocate([
    { key: 'seller_direct:b', eligibleGoodsWon: 100 },
    { key: 'seller_direct:a', eligibleGoodsWon: 100 },
  ], 1), [
    { key: 'seller_direct:b', discountWon: 0 },
    { key: 'seller_direct:a', discountWon: 1 },
  ]);
  assert.deepEqual(allocate([
    { key: 'seller_direct:a', eligibleGoodsWon: 100 },
    { key: 'seller_direct:b', eligibleGoodsWon: 100 },
  ], 1), [
    { key: 'seller_direct:a', discountWon: 1 },
    { key: 'seller_direct:b', discountWon: 0 },
  ]);
});

test('52,000 won shipment stays free-shipping after a 5,000 won goods discount', () => {
  const allocate = shipmentQuote.allocateShipmentDiscountWon;
  assert.equal(typeof allocate, 'function');
  const quote = quoteShipments([
    { optionId: 'discounted', sellerId: 'seller-a', shippingMode: 'seller_direct',
      quantity: 1, unitPriceWon: 52000 },
  ], () => defaultShippingPolicy);
  const [allocation] = allocate([
    { key: quote.shipments[0].key, eligibleGoodsWon: quote.shipments[0].preDiscountGoodsWon },
  ], 5000);
  assert.equal(quote.shipments[0].shippingWon, 0);
  assert.equal(quote.totalWon - allocation.discountWon, 47000);
});

test('discount allocation rejects duplicate groups, invalid money and discounts beyond eligible goods', () => {
  const allocate = shipmentQuote.allocateShipmentDiscountWon;
  assert.equal(typeof allocate, 'function');
  const group = { key: 'seller_direct:a', eligibleGoodsWon: 100 };
  for (const bad of [
    () => allocate([], 1),
    () => allocate([group, group], 1),
    () => allocate([{ ...group, eligibleGoodsWon: -1 }], 0),
    () => allocate([{ ...group, eligibleGoodsWon: 1.5 }], 1),
    () => allocate([{ ...group, key: '' }], 1),
    () => allocate([group], -1),
    () => allocate([group], 1.5),
    () => allocate([group], 101),
    () => allocate([{ ...group, eligibleGoodsWon: Number.MAX_SAFE_INTEGER },
      { key: 'seller_direct:b', eligibleGoodsWon: 1 }], 1),
    () => allocate([{ ...group, eligibleGoodsWon: 0 }], 1),
  ]) assert.throws(bad, /Invalid discount allocation/);
  assert.deepEqual(allocate([], 0), []);
});

test('discount allocation uses exact integer arithmetic near the safe-money limit', () => {
  assert.deepEqual(shipmentQuote.allocateShipmentDiscountWon([
    { key: 'seller_direct:a', eligibleGoodsWon: Number.MAX_SAFE_INTEGER - 1 },
    { key: 'seller_direct:b', eligibleGoodsWon: 1 },
  ], Number.MAX_SAFE_INTEGER), [
    { key: 'seller_direct:a', discountWon: Number.MAX_SAFE_INTEGER - 1 },
    { key: 'seller_direct:b', discountWon: 1 },
  ]);
});

test('shipping support pays at most the actual fee after free-shipping is decided', () => {
  const apply = shipmentQuote.applyShipmentShippingSupportWon;
  assert.equal(typeof apply, 'function');
  assert.deepEqual(apply([
    { key: 'seller_direct:a', shippingWon: 0 },
    { key: 'seller_direct:b', shippingWon: 3000 },
    { key: 'owool_fulfillment', shippingWon: 3000 },
  ], [
    { key: 'seller_direct:a', requestedSupportWon: 3000 },
    { key: 'seller_direct:b', requestedSupportWon: 5000 },
    { key: 'owool_fulfillment', requestedSupportWon: 1000 },
  ]), [
    { key: 'seller_direct:a', shippingWon: 0, supportWon: 0, payableShippingWon: 0 },
    { key: 'seller_direct:b', shippingWon: 3000, supportWon: 3000, payableShippingWon: 0 },
    { key: 'owool_fulfillment', shippingWon: 3000, supportWon: 1000, payableShippingWon: 2000 },
  ]);
  assert.deepEqual(apply([{ key: 'seller_direct:a', shippingWon: 3000 }], []), [
    { key: 'seller_direct:a', shippingWon: 3000, supportWon: 0, payableShippingWon: 3000 },
  ]);
});

test('shipping support rejects duplicate applications, foreign shipments and invalid money', () => {
  const apply = shipmentQuote.applyShipmentShippingSupportWon;
  assert.equal(typeof apply, 'function');
  const shipments = [{ key: 'seller_direct:a', shippingWon: 3000 }];
  const request = { key: 'seller_direct:a', requestedSupportWon: 1000 };
  for (const bad of [
    () => apply(shipments, [request, request]),
    () => apply(shipments, [{ ...request, key: 'seller_direct:b' }]),
    () => apply([...shipments, ...shipments], []),
    () => apply(shipments, [{ ...request, requestedSupportWon: -1 }]),
    () => apply(shipments, [{ ...request, requestedSupportWon: 1.5 }]),
    () => apply([{ ...shipments[0], shippingWon: -1 }], []),
    () => apply([{ ...shipments[0], shippingWon: Number.MAX_SAFE_INTEGER + 1 }], []),
  ]) assert.throws(bad, /Invalid shipping support/);
});
