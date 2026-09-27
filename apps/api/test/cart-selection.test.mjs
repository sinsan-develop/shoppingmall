import assert from 'node:assert/strict';
import test from 'node:test';
import { addSelection, changeSelectionQuantity, removeSelection } from '../src/checkout/cart-selection.ts';

test('cart selections merge the same option and calculate later from the current quantity', () => {
  const first = addSelection([], 'chili-500g', 2);
  const second = addSelection(first, 'onion-1kg', 1);
  const third = addSelection(second, 'chili-500g', 3);
  assert.deepEqual(third, [
    { optionId: 'chili-500g', quantity: 5 },
    { optionId: 'onion-1kg', quantity: 1 },
  ]);
  assert.deepEqual(first, [{ optionId: 'chili-500g', quantity: 2 }]);
  assert.equal(third[0].quantity * 23000, 115000);
});

test('cart quantity can be entered directly and a line can be removed without altering other lines', () => {
  const before = [
    { optionId: 'chili-500g', quantity: 5 },
    { optionId: 'onion-1kg', quantity: 1 },
  ];
  const changed = changeSelectionQuantity(before, 'chili-500g', 2);
  assert.deepEqual(changed, [
    { optionId: 'chili-500g', quantity: 2 },
    { optionId: 'onion-1kg', quantity: 1 },
  ]);
  assert.deepEqual(removeSelection(changed, 'chili-500g'), [{ optionId: 'onion-1kg', quantity: 1 }]);
  assert.deepEqual(before[0], { optionId: 'chili-500g', quantity: 5 });
});

test('cart rejects invalid options, quantities, duplicate state and overflow', () => {
  assert.throws(() => addSelection([], '', 1), /Invalid cart selection/);
  assert.throws(() => addSelection([], 'a', 0), /Invalid cart selection/);
  assert.throws(() => changeSelectionQuantity([{ optionId: 'a', quantity: 1 }], 'a', 1.5),
    /Invalid cart selection/);
  assert.throws(() => changeSelectionQuantity([], 'missing', 2), /Missing cart selection/);
  assert.throws(() => addSelection([{ optionId: 'a', quantity: Number.MAX_SAFE_INTEGER }], 'a', 1),
    /Invalid cart selection/);
  assert.throws(() => removeSelection([{ optionId: 'a', quantity: 1 }, { optionId: 'a', quantity: 2 }], 'a'),
    /Invalid cart selection/);
});
