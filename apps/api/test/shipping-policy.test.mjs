import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultShippingPolicy, resolveShippingPolicy, validateShippingPolicy } from '../src/shipping/policy.ts';

test('default policy keeps 3,000 won shipping and 50,000 won pre-discount threshold without inventing a cutoff', () => {
  assert.deepEqual(defaultShippingPolicy, {
    feeWon: 3000, freeThresholdWon: 50000, cutoffTime: null, blockedPostalRanges: [],
  });
});

test('approved seller values apply only where an operator has not locked the global field', () => {
  const admin = { feeWon: 4000, freeThresholdWon: 50000, cutoffTime: '13:00',
    blockedPostalRanges: [{ start: '63000', end: '63099' }] };
  const seller = { feeWon: 2000, freeThresholdWon: 60000, cutoffTime: '15:30',
    blockedPostalRanges: [{ start: '63100', end: '63199' }] };
  assert.deepEqual(resolveShippingPolicy(admin, seller, {
    feeWon: true, freeThresholdWon: false, cutoffTime: false,
  }), {
    feeWon: 4000, freeThresholdWon: 60000, cutoffTime: '15:30',
    blockedPostalRanges: [{ start: '63000', end: '63199' }],
  });
  assert.deepEqual(resolveShippingPolicy(admin, null, {}), admin);
  assert.equal(admin.blockedPostalRanges.length, 1);
  assert.equal(seller.blockedPostalRanges.length, 1);
});

test('shipping policy rejects invalid money, time and postal exclusion contracts', () => {
  const valid = defaultShippingPolicy;
  for (const patch of [
    { feeWon: -1 }, { feeWon: 3.5 }, { freeThresholdWon: -1 },
    { cutoffTime: '25:00' }, { cutoffTime: '9:00' },
    { blockedPostalRanges: [{ start: '99999', end: '00000' }] },
    { blockedPostalRanges: [{ start: '6300', end: '63099' }] },
    { blockedPostalRanges: [{ start: '63000', end: '63100' }, { start: '63099', end: '63199' }] },
  ]) assert.throws(() => validateShippingPolicy({ ...valid, ...patch }), /Invalid shipping policy/);
  assert.throws(() => resolveShippingPolicy(valid, valid, { feeWon: 'yes' }), /Invalid policy locks/);
});
