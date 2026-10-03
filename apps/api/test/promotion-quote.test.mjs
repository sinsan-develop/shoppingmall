import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteShipments } from '../src/checkout/shipment-quote.ts';
import { applyPromotionQuote } from '../src/promotions/quote.ts';
import { validatePromotionRule } from '../src/promotions/rules.ts';

const period = { startAt: new Date('2026-10-01T00:00:00Z'), endAt: new Date('2026-11-01T00:00:00Z') };
const goodsRule = (patch = {}) => validatePromotionRule({ kind: 'goods_discount', scope: 'all', targetIds: [],
  ...period, minimumEligibleGoodsWon: 0, amountKind: 'fixed', amountValue: 5000,
  maxDiscountWon: null, ...patch });
const supportRule = (patch = {}) => validatePromotionRule({ kind: 'shipping_support', scope: 'all', targetIds: [],
  ...period, minimumEligibleGoodsWon: 0, amountKind: 'fixed', amountValue: 3000,
  maxDiscountWon: null, ...patch });
const line = (optionId, sellerId, unitPriceWon, shippingMode = 'seller_direct') =>
  ({ optionId, sellerId, shippingMode, quantity: 1, unitPriceWon });
const baseQuote = (lines) => quoteShipments(lines, () => ({ feeWon: 3000, freeThresholdWon: 50000 }));

test('an after-discount 47,000 won payment keeps the original 52,000 won shipment free shipping', () => {
  const lines = [line('chili', 'a', 52000)];
  const base = baseQuote(lines);
  const applied = applyPromotionQuote(base, lines, goodsRule());
  assert.equal(applied.shipments[0].shippingWon, 0);
  assert.equal(applied.shipments[0].discountWon, 5000);
  assert.equal(applied.shipments[0].payableGoodsWon, 47000);
  assert.equal(applied.payableTotalWon, 47000);
  assert.equal(base.totalWon, 52000);
  assert.equal(base.shipments[0].goodsWon, 52000);
});

test('49,999 won is charged shipping while 50,000 won is free, before coupon allocation', () => {
  for (const [price, expectedShipping] of [[49999, 3000], [50000, 0]]) {
    const lines = [line('chili', 'a', price)];
    const applied = applyPromotionQuote(baseQuote(lines), lines, goodsRule());
    assert.equal(applied.shipments[0].payableShippingWon, expectedShipping);
  }
});

test('an option-scoped coupon discounts only its matching lines across seller shipments', () => {
  const lines = [line('chili', 'a', 20000), line('onion', 'a', 10000), line('chili', 'b', 30000)];
  const applied = applyPromotionQuote(baseQuote(lines), lines,
    goodsRule({ scope: 'options', targetIds: ['chili'], amountValue: 5000 }));
  assert.deepEqual(applied.shipments.map((part) => part.discountWon), [2000, 3000]);
  assert.equal(applied.discountWon, 5000);
  assert.equal(applied.payableTotalWon, 61000);
});

test('a seller-scoped minimum uses only eligible goods, not all cart goods', () => {
  const lines = [line('chili', 'a', 20000), line('garlic', 'b', 40000)];
  const coupon = goodsRule({ scope: 'sellers', targetIds: ['a'], minimumEligibleGoodsWon: 25000 });
  const applied = applyPromotionQuote(baseQuote(lines), lines, coupon);
  assert.equal(applied.discountWon, 0);
  assert.equal(applied.payableTotalWon, 66000);
});

test('percentage uses basis points with won-flooring and an explicit cap', () => {
  const lines = [line('chili', 'a', 101)];
  const low = goodsRule({ amountKind: 'percent', amountValue: 100, maxDiscountWon: 50 });
  const capped = goodsRule({ amountKind: 'percent', amountValue: 5000, maxDiscountWon: 40 });
  assert.equal(applyPromotionQuote(baseQuote(lines), lines, low).discountWon, 1);
  assert.equal(applyPromotionQuote(baseQuote(lines), lines, capped).discountWon, 40);
});

test('free shipping receives zero support and another shipment receives at most its actual fee', () => {
  const lines = [line('chili', 'a', 50000), line('garlic', 'b', 15000)];
  const applied = applyPromotionQuote(baseQuote(lines), lines, undefined, [
    { shipmentKey: 'seller_direct:a', rule: supportRule() },
    { shipmentKey: 'seller_direct:b', rule: supportRule({ amountValue: 5000 }) },
  ]);
  assert.deepEqual(applied.shipments.map((part) => part.supportWon), [0, 3000]);
  assert.equal(applied.supportWon, 3000);
  assert.equal(applied.payableShippingWon, 0);
});

test('shipping support is capped by the shipping fee, not by a low eligible goods amount', () => {
  const lines = [line('onion', 'a', 1000)];
  const applied = applyPromotionQuote(baseQuote(lines), lines, undefined,
    [{ shipmentKey: 'seller_direct:a', rule: supportRule() }]);
  assert.equal(applied.shipments[0].supportWon, 3000);
  assert.equal(applied.payableTotalWon, 1000);
});

test('a shipment cannot receive two support coupons, including a free-shipping shipment', () => {
  const lines = [line('chili', 'a', 50000)];
  const request = { shipmentKey: 'seller_direct:a', rule: supportRule() };
  assert.throws(() => applyPromotionQuote(baseQuote(lines), lines, undefined, [request, request]),
    /Invalid shipping support/);
});

test('per-shipment payable sums and combined payable are exact, nonnegative won amounts', () => {
  const lines = [line('chili', 'a', 20000), line('garlic', 'b', 30000),
    line('powder', 'owool', 10000, 'owool_fulfillment')];
  const applied = applyPromotionQuote(baseQuote(lines), lines, goodsRule({ amountValue: 7000 }), [
    { shipmentKey: 'seller_direct:a', rule: supportRule({ amountValue: 2000 }) },
  ]);
  assert.equal(applied.discountWon, 7000);
  assert.equal(applied.supportWon, 2000);
  assert.equal(applied.payableTotalWon, 60000);
  assert.equal(applied.shipments.reduce((sum, part) => sum + part.payableTotalWon, 0), applied.payableTotalWon);
  for (const part of applied.shipments) {
    assert.equal(part.payableTotalWon, part.payableGoodsWon + part.payableShippingWon);
    assert.ok(part.payableGoodsWon >= 0 && part.payableShippingWon >= 0);
  }
});

test('invalid discount rules cannot enter a quote', () => {
  for (const patch of [
    { amountValue: 0 }, { amountValue: -1 }, { amountValue: 1.1 },
    { startAt: period.endAt }, { scope: 'options', targetIds: [] },
    { scope: 'all', targetIds: ['chili'] }, { amountKind: 'percent', amountValue: 100, maxDiscountWon: null },
    { amountKind: 'percent', amountValue: 10001, maxDiscountWon: 1 },
    { minimumEligibleGoodsWon: -1 },
  ]) assert.throws(() => goodsRule(patch), /Invalid promotion rule/);
  assert.throws(() => supportRule({ amountKind: 'percent', amountValue: 100 }), /Invalid promotion rule/);
});
