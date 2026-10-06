import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  fulfillmentUiDatabaseName,
  fulfillmentUiEmails,
  signFulfillmentUiManifest,
  validateFulfillmentUiManifest,
  validateFulfillmentUiSystemTarget,
  validateFulfillmentUiTarget,
} from '../scripts/qa-fulfillment-ui-fixture.ts';

const uuid = (digit) => `${digit.repeat(8)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(12)}`;
const fixtureSourceUrl = new URL('../scripts/qa-fulfillment-ui-fixture.ts', import.meta.url);

test('fulfillment browser fixture is bound to one exact isolated database and five virtual roles', () => {
  assert.equal(fulfillmentUiDatabaseName('A1B2C3D4'), 'shoppingmall_s5_fulfillment_ui_a1b2c3d4');
  assert.deepEqual(fulfillmentUiEmails('A1B2C3D4'), [
    'qa+a1b2c3d4-fulfillment-customer@example.invalid',
    'qa+a1b2c3d4-fulfillment-seller-a@example.invalid',
    'qa+a1b2c3d4-fulfillment-seller-b@example.invalid',
    'qa+a1b2c3d4-fulfillment-owool@example.invalid',
    'qa+a1b2c3d4-fulfillment-admin@example.invalid',
  ]);
  assert.equal(validateFulfillmentUiTarget(
    'postgresql://postgres:test@127.0.0.1:5432/shoppingmall_s5_fulfillment_ui_a1b2c3d4',
    'A1B2C3D4').database, 'shoppingmall_s5_fulfillment_ui_a1b2c3d4');

  for (const unsafeId of ['', 'main', '1234567', '123456789', '../1234'])
    assert.throws(() => fulfillmentUiDatabaseName(unsafeId));
  for (const unsafeUrl of [
    'postgresql://postgres:test@127.0.0.1:5432/shoppingmall',
    'postgresql://postgres:test@127.0.0.1:5432/shoppingmall_s5_fulfillment_ui_deadbeef',
  ]) assert.throws(() => validateFulfillmentUiTarget(unsafeUrl, 'a1b2c3d4'));
});

test('fulfillment reset manifest must identify every created role, seller, order and shipment', () => {
  const runId = 'a1b2c3d4';
  const password = 'test-only-password-12345';
  const unsigned = {
    runId,
    emails: fulfillmentUiEmails(runId),
    accountIds: ['1', '2', '3', '4', '5'].map(uuid),
    sellerIds: ['6', '7', '8'].map(uuid),
    sellerCategoryId: uuid('f'),
    productCategoryIds: ['1', '2', '3', '4', '5'].map(uuid),
    productIds: ['9', 'a', 'b'].map(uuid),
    revisionIds: ['c', 'd', 'e'].map(uuid),
    optionIds: ['f', '1', '2'].map(uuid),
    orderIds: ['3', '4', '5'].map(uuid),
    reservationIds: ['6', '7', '8'].map(uuid),
    shipmentIds: ['9', 'a', 'b'].map(uuid),
    addressId: uuid('c'),
    previousFulfillmentSetting: {
      owoolSellerId: null,
      updatedBy: null,
      version: 0,
      updatedAt: '2026-10-06T00:00:00.000Z',
    },
  };
  const manifest = { ...unsigned, signature: signFulfillmentUiManifest(unsigned, password) };
  assert.deepEqual(validateFulfillmentUiManifest(runId, manifest, password), manifest);
  assert.throws(() => validateFulfillmentUiManifest(runId,
    { ...manifest, accountIds: manifest.accountIds.slice(1) }, password));
  assert.throws(() => validateFulfillmentUiManifest(runId,
    { ...manifest, emails: manifest.emails.slice(1) }, password));
  assert.throws(() => validateFulfillmentUiManifest(runId,
    { ...manifest, shipmentIds: [uuid('9')] }, password));
  assert.throws(() => validateFulfillmentUiManifest(runId,
    { ...manifest, previousFulfillmentSetting: { ...manifest.previousFulfillmentSetting, version: 9 } }, password));
  assert.throws(() => validateFulfillmentUiManifest(runId, manifest, 'another-test-password'));
});

test('fulfillment fixture runtime target requires the exact private database and system identifier', () => {
  assert.deepEqual(validateFulfillmentUiSystemTarget('a1b2c3d4', '123456789012', {
    databaseName: 'shoppingmall_s5_fulfillment_ui_a1b2c3d4', systemId: '123456789012',
  }), { databaseName: 'shoppingmall_s5_fulfillment_ui_a1b2c3d4', systemId: '123456789012' });
  assert.throws(() => validateFulfillmentUiSystemTarget('a1b2c3d4', undefined, {
    databaseName: 'shoppingmall_s5_fulfillment_ui_a1b2c3d4', systemId: '123456789012',
  }));
  assert.throws(() => validateFulfillmentUiSystemTarget('a1b2c3d4', '999999999999', {
    databaseName: 'shoppingmall_s5_fulfillment_ui_a1b2c3d4', systemId: '123456789012',
  }));
});

test('fulfillment reset preflight locks payment events and rejects unowned payment conflicts', async () => {
  const source = await readFile(fixtureSourceUrl, 'utf8');
  const ownership = source.slice(source.indexOf('async function assertResetOwnership'),
    source.indexOf('async function resetFixture'));
  assert.match(ownership, /SELECT id FROM payment_events[\s\S]*FOR UPDATE/);
  assert.match(ownership, /FROM payment_event_conflicts/);
  assert.match(ownership, /foreign payment conflict/i);
});

test('fulfillment fixture derives the initial ship date through the production payment cutoff path', async () => {
  const source = await readFile(fixtureSourceUrl, 'utf8');
  assert.match(source, /import \{ openPaymentFulfillments \} from ['"]\.\.\/src\/fulfillment\/repository\.js['"]/);
  assert.match(source, /VALUES \(\$1,\$2,'PAYMENT_PENDING','14:00'\)/);
  assert.match(source, /openPaymentFulfillments\(client,[\s\S]*paymentEventId,[\s\S]*paidAt\)/);
  assert.match(source, /2026-10-06T04:58:00\.000Z/);
  assert.match(source, /fulfillmentUiExpectedShipDate = '2026-10-07'/);
});
