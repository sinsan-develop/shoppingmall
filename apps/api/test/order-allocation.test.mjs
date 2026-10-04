import assert from 'node:assert/strict';
import test from 'node:test';

test('a one-won line discount follows stable option ID order and preserves exact total', async () => {
  const { allocateOrderLineDiscountWon } = await import('../src/orders/line-allocation.ts');
  const result = allocateOrderLineDiscountWon([
    { optionId: 'option-b', eligibleGoodsWon: 1 },
    { optionId: 'option-a', eligibleGoodsWon: 1 },
  ], 1);
  assert.deepEqual(result, [
    { optionId: 'option-b', discountWon: 0 },
    { optionId: 'option-a', discountWon: 1 },
  ]);
});

test('line discounts are proportional to eligible goods and never exceed eligible amount', async () => {
  const { allocateOrderLineDiscountWon } = await import('../src/orders/line-allocation.ts');
  assert.deepEqual(allocateOrderLineDiscountWon([
    { optionId: 'pepper', eligibleGoodsWon: 23000 },
    { optionId: 'powder', eligibleGoodsWon: 18000 },
  ], 5000), [
    { optionId: 'pepper', discountWon: 2805 },
    { optionId: 'powder', discountWon: 2195 },
  ]);
  assert.deepEqual(allocateOrderLineDiscountWon([
    { optionId: 'pepper', eligibleGoodsWon: 0 },
    { optionId: 'powder', eligibleGoodsWon: 18000 },
  ], 5000), [
    { optionId: 'pepper', discountWon: 0 },
    { optionId: 'powder', discountWon: 5000 },
  ]);
});

test('invalid, duplicate or excessive line discounts cannot be allocated', async () => {
  const { allocateOrderLineDiscountWon } = await import('../src/orders/line-allocation.ts');
  const valid = [{ optionId: 'a', eligibleGoodsWon: 1 }];
  for (const input of [
    [valid, 2], [valid, -1], [valid, 0.5],
    [[...valid, ...valid], 1],
    [[{ optionId: 'a', eligibleGoodsWon: -1 }], 0],
    [[], 1],
  ]) assert.throws(() => allocateOrderLineDiscountWon(...input), /Invalid discount allocation/);
});
