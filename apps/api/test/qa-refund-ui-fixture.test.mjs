import assert from 'node:assert/strict';
import test from 'node:test';
import { refundUiDatabaseName, refundUiEmails, validateRefundUiTarget, validateSharedRefundUiTarget,
  resetRefundUiFixture } from
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

test('shared reset refuses more than four owned orders before any deletion', async () => {
  let deletes = 0;
  const client = { async query(sql) {
    if (sql.startsWith('DELETE')) deletes++;
    if (sql.includes('FROM account_identities')) return { rows: [{ account_id: 'account-1', identifier: refundUiEmails('e4231005')[0] }] };
    if (sql.includes('FROM sellers WHERE')) return { rows: [{ id: 'seller-1', category_id: 'seller-category-1' }] };
    if (sql.includes('FROM products WHERE')) return { rows: [{ id: 'product-1', category_id: 'product-category-1' }] };
    if (sql.includes('FROM checkout_orders WHERE')) return { rows: Array.from({ length: 5 }, (_, i) => ({ id: `order-${i}` })) };
    throw Error(`unexpected query: ${sql}`);
  } };
  await assert.rejects(resetRefundUiFixture(client, 'e4231005', 4), /bounded/);
  assert.equal(deletes, 0);
});

test('shared reset refuses another account using its QA product before any deletion', async () => {
  let deletes = 0;
  const client = { async query(sql) {
    if (sql.startsWith('DELETE')) deletes++;
    if (sql.includes('FROM account_identities')) return { rows: [{ account_id: 'account-1', identifier: refundUiEmails('e4231005')[0] }] };
    if (sql.includes('FROM sellers WHERE')) return { rows: [{ id: 'seller-1', category_id: 'seller-category-1' }] };
    if (sql.includes('FROM products WHERE')) return { rows: [{ id: 'product-1', category_id: 'product-category-1' }] };
    if (sql.includes('FROM checkout_orders WHERE')) return { rows: [{ id: 'order-1' }] };
    if (sql.includes('FROM customer_cart_items')) return { rowCount: 1, rows: [{ '?column?': 1 }] };
    return { rowCount: 0, rows: [] };
  } };
  await assert.rejects(resetRefundUiFixture(client, 'e4231005', 4), /foreign account/);
  assert.equal(deletes, 0);
});

test('shared refund browser fixture requires the exact database and run-bound opt-in', () => {
  const url = 'postgresql://postgres:test@127.0.0.1:5432/shoppingmall';
  const consent = 'SHARED_S4_REFUND_UI_e4231005';
  assert.equal(validateSharedRefundUiTarget(url, 'e4231005', consent).database, 'shoppingmall');
  for (const [unsafeUrl, unsafeConsent] of [
    [url, ''],
    [url, 'SHARED_S4_REFUND_UI_deadbeef'],
    ['postgresql://postgres:test@127.0.0.1:5432/other', consent],
  ]) assert.throws(() => validateSharedRefundUiTarget(unsafeUrl, 'e4231005', unsafeConsent));
});
