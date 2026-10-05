import assert from 'node:assert/strict';
import test from 'node:test';
import { refundUiDatabaseName, refundUiEmails, validateRefundUiTarget, validateSharedRefundUiTarget,
  validateSharedRefundManifest, resetRefundUiFixture, runRefundUiFixture } from
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

test('shared reset refuses missing or mismatched creation manifest before opening the database', async () => {
  const url = 'postgresql://postgres:test@127.0.0.1:5432/shoppingmall';
  const consent = 'SHARED_S4_REFUND_UI_e4231005';
  await assert.rejects(runRefundUiFixture('reset', 'e4231005', url, undefined, consent), /manifest/);
  assert.throws(() => validateSharedRefundManifest('e4231005', { runId: 'deadbeef' }), /manifest/);
});

const manifest = {
  runId: 'e4231005', emails: refundUiEmails('e4231005'),
  accountIds: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003'],
  sellerId: '00000000-0000-4000-8000-000000000004',
  sellerCategoryId: '00000000-0000-4000-8000-000000000005',
  productId: '00000000-0000-4000-8000-000000000006',
  productCategoryId: '00000000-0000-4000-8000-000000000007',
  revisionId: '00000000-0000-4000-8000-000000000008',
  optionId: '00000000-0000-4000-8000-000000000009',
  addressId: '00000000-0000-4000-8000-00000000000a',
  orderId: '00000000-0000-4000-8000-00000000000b',
  reservationId: '00000000-0000-4000-8000-00000000000c',
  shipmentId: '00000000-0000-4000-8000-00000000000d',
};

test('shared reset pins read committed before any ownership query', async () => {
  const queries = [];
  const client = { async query(sql) {
    queries.push(sql);
    if (sql.includes('FROM account_identities')) return { rows: [] };
    if (sql.includes('FROM sellers WHERE')) return { rows: [] };
    return { rows: [], rowCount: 0 };
  } };
  await assert.rejects(resetRefundUiFixture(client, 'e4231005', 4,
    validateSharedRefundManifest('e4231005', manifest)), /ownership/);
  assert.deepEqual(queries.slice(0, 3), [
    'SET TRANSACTION ISOLATION LEVEL READ COMMITTED',
    "SET LOCAL lock_timeout = '1s'",
    "SET LOCAL statement_timeout = '3s'",
  ]);
});

test('shared reset rejects another identity attached to a QA email account before deleting', async () => {
  let deletes = 0;
  let locks = 0;
  const client = { async query(sql) {
    if (sql.startsWith('DELETE')) deletes++;
    if (sql.includes('FOR UPDATE')) locks++;
    if (sql.includes('FROM account_identities WHERE account_id=')) return { rows: [
      ...manifest.accountIds.map((account_id, index) => ({ account_id, kind: 'email', identifier: manifest.emails[index] })),
      { account_id: manifest.accountIds[0], kind: 'kakao', identifier: 'external-link' },
    ] };
    if (sql.includes('FROM account_identities')) return { rows: manifest.accountIds.map((account_id, index) =>
      ({ account_id, identifier: manifest.emails[index] })) };
    if (sql.includes('FROM sellers WHERE')) return { rows: [{ id: manifest.sellerId, category_id: manifest.sellerCategoryId }] };
    if (sql.includes('FROM products WHERE')) return { rows: [{ id: manifest.productId, category_id: manifest.productCategoryId }] };
    if (sql.includes('FROM product_revisions WHERE product_id=')) return { rows: [{ id: manifest.revisionId }] };
    if (sql.includes('FROM product_options WHERE revision_id=')) return { rows: [{ id: manifest.optionId }] };
    if (sql.includes('FROM product_publications')) return { rows: [{ published_by_account_id: manifest.accountIds[2] }] };
    if (sql.includes('FROM account_roles')) return { rows: manifest.accountIds.map((account_id, index) =>
      ({ account_id, role: ['customer', 'seller', 'admin'][index], seller_id: index === 1 ? manifest.sellerId : null })) };
    if (sql.includes('FROM customer_addresses')) return { rows: [
      { id: manifest.addressId, account_id: manifest.accountIds[0], label: '환불 QA' }] };
    if (sql.includes('FROM seller_categories') || sql.includes('FROM product_categories'))
      return { rows: [{ name: 'qa-e4231005-refund-ui' }] };
    return { rows: [], rowCount: 0 };
  } };
  await assert.rejects(resetRefundUiFixture(client, 'e4231005', 4,
    validateSharedRefundManifest('e4231005', manifest)), /foreign account/);
  assert.equal(deletes, 0);
  assert.equal(locks, 5);
});
