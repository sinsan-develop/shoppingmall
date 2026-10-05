import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateIncrementalRefundWon } from '../src/refunds/allocation.ts';

test('sequential quantity refunds sum exactly to the paid line amount', () => {
  assert.equal(allocateIncrementalRefundWon(10_000, 3, 0, 1), 3_333);
  assert.equal(allocateIncrementalRefundWon(10_000, 3, 1, 1), 3_333);
  assert.equal(allocateIncrementalRefundWon(10_000, 3, 2, 1), 3_334);
});

test('a refund starting after an approved quantity gets only its incremental share', () => {
  assert.equal(allocateIncrementalRefundWon(17, 5, 2, 2), 7);
  assert.equal(allocateIncrementalRefundWon(17, 5, 0, 5), 17);
  assert.equal(allocateIncrementalRefundWon(0, 4, 1, 3), 0);
});

test('refund allocation rejects unsafe money and quantities outside the original line', () => {
  for (const input of [
    [-1, 3, 0, 1], [1.5, 3, 0, 1], [10, 0, 0, 1], [10, 3, -1, 1],
    [10, 3, 0, 0], [10, 3, 2, 2], [Number.MAX_SAFE_INTEGER + 1, 3, 0, 1],
  ]) assert.throws(() => allocateIncrementalRefundWon(...input), /Invalid refund allocation/);
});
