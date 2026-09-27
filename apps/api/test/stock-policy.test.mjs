import assert from 'node:assert/strict';
import test from 'node:test';
import { planStockEntry, approveStockIncrease } from '../src/inventory/stock-policy.ts';

test('seller stock decrease and zero close purchasing immediately', () => {
  assert.deepEqual(planStockEntry({ onHand: 8, sellable: 5 }, 3), {
    onHand: 3, sellable: 3, requiresApproval: false,
  });
  assert.deepEqual(planStockEntry({ onHand: 8, sellable: 5 }, 0), {
    onHand: 0, sellable: 0, requiresApproval: false,
  });
});

test('seller stock increase and reopening remain unsellable until approval', () => {
  assert.deepEqual(planStockEntry({ onHand: 5, sellable: 5 }, 10), {
    onHand: 10, sellable: 5, requiresApproval: true,
  });
  assert.deepEqual(planStockEntry({ onHand: 0, sellable: 0 }, 20), {
    onHand: 20, sellable: 0, requiresApproval: true,
  });
  assert.deepEqual(approveStockIncrease({ onHand: 9, sellable: 4 }, 10), {
    onHand: 9, sellable: 9,
  });
});

test('stock inputs cannot be negative, fractional or beyond the safe count', () => {
  for (const target of [-1, 1.5, 1_000_000_001, Number.NaN]) {
    assert.throws(() => planStockEntry({ onHand: 0, sellable: 0 }, target), /Invalid stock/);
  }
});
