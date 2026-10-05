import assert from 'node:assert/strict';
import test from 'node:test';
import { refundUiDatabaseName, refundUiEmails, validateRefundUiTarget } from
  '../scripts/qa-refund-ui-fixture.ts';

test('refund browser fixture is bound to one exact run-scoped isolated database', () => {
  assert.equal(refundUiDatabaseName('A1B2C3D4'), 'shoppingmall_s4_refund_ui_a1b2c3d4');
  assert.deepEqual(refundUiEmails('A1B2C3D4'), [
    'qa+a1b2c3d4-refund-customer@example.invalid',
    'qa+a1b2c3d4-refund-seller@example.invalid',
    'qa+a1b2c3d4-refund-admin@example.invalid',
  ]);
  assert.equal(validateRefundUiTarget(
    'postgresql://postgres:test@127.0.0.1:5432/shoppingmall_s4_refund_ui_a1b2c3d4',
    'A1B2C3D4').database, 'shoppingmall_s4_refund_ui_a1b2c3d4');
  for (const unsafeId of ['', 'main', '1234567', '123456789', '../1234'])
    assert.throws(() => refundUiDatabaseName(unsafeId));
  for (const unsafeUrl of [
    'postgresql://postgres:test@127.0.0.1:5432/shoppingmall',
    'postgresql://postgres:test@127.0.0.1:5432/shoppingmall_s4_refund_ui_deadbeef',
  ]) assert.throws(() => validateRefundUiTarget(unsafeUrl, 'a1b2c3d4'));
});
