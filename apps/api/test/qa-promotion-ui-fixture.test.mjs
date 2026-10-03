import assert from 'node:assert/strict';
import test from 'node:test';
import { assertIsolatedPromotionQaTarget } from '../scripts/qa-promotion-ui-reset.ts';

test('promotion browser QA reset only accepts its isolated container and a valid run id', () => {
  assert.throws(() => assertIsolatedPromotionQaTarget('b83f3204',
    'postgresql://postgres:test@local-postgres:5432/shoppingmall'), /isolated promotion QA database/);
  assert.throws(() => assertIsolatedPromotionQaTarget('not-valid',
    'postgresql://postgres:test@shoppingmall-s32-ui-pg-1003:5432/shoppingmall'), /QA_RUN_ID/);
  assert.equal(assertIsolatedPromotionQaTarget('B83F3204',
    'postgresql://postgres:test@shoppingmall-s32-ui-pg-1003:5432/shoppingmall'), 'b83f3204');
  assert.equal(assertIsolatedPromotionQaTarget('E4401004',
    'postgresql://postgres:test@shoppingmall-s32-three-pg-1004:5432/shoppingmall'), 'e4401004');
});
