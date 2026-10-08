import assert from 'node:assert/strict';
import test from 'node:test';
import { completionOverlaps } from '../app/account/settlement-page.tsx';

const completions = [{ sellerId: 'farm-a', startDate: '2026-05-01', endDate: '2026-05-20' }];

test('a completed seller period blocks only that seller when dates overlap', () => {
  assert.equal(completionOverlaps(completions, 'farm-a', '2026-05-01', '2026-05-20'), true);
  assert.equal(completionOverlaps(completions, 'farm-a', '2026-05-20', '2026-05-31'), true);
  assert.equal(completionOverlaps(completions, 'farm-a', '2026-05-21', '2026-05-31'), false);
  assert.equal(completionOverlaps(completions, 'farm-b', '2026-05-01', '2026-05-20'), false);
});
