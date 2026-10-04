import assert from 'node:assert/strict';
import test from 'node:test';
import * as qaReset from '../scripts/qa-promotion-ui-reset.ts';

const { assertIsolatedPromotionQaTarget } = qaReset;

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

test('shared promotion browser QA reset accepts only its exact run and local-postgres database', () => {
  const assertSharedPromotionQaTarget = qaReset.assertSharedPromotionQaTarget;
  const shared = 'postgresql://postgres:test@local-postgres:5432/shoppingmall';
  assert.equal(assertSharedPromotionQaTarget('F44F1004', shared), 'f44f1004');
  assert.throws(() => assertSharedPromotionQaTarget('e4401004', shared), /shared promotion QA database/);
  assert.throws(() => assertSharedPromotionQaTarget('f44f1004',
    'postgresql://postgres:test@127.0.0.1:5432/shoppingmall'), /shared promotion QA database/);
  assert.throws(() => assertSharedPromotionQaTarget('f44f1004',
    'postgresql://postgres:test@local-postgres:5432/postgres'), /shared promotion QA database/);
  assert.throws(() => assertIsolatedPromotionQaTarget('f44f1004', shared), /isolated promotion QA database/);
});
