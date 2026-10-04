import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { resolvePaymentMode, assertVerifiedPayment } from '../src/payments/adapter.ts';
import { MockPaymentAdapter, NoChargePaymentAdapter } from '../src/payments/mock-adapter.ts';

test('mock payment mode is explicit development-only and disabled otherwise', () => {
  assert.equal(resolvePaymentMode({}), 'disabled');
  assert.equal(resolvePaymentMode({ APP_ENV: 'development', PAYMENT_MODE: 'mock' }), 'mock');
  assert.throws(() => resolvePaymentMode({ APP_ENV: 'production', PAYMENT_MODE: 'mock' }));
  assert.throws(() => resolvePaymentMode({ APP_ENV: 'development', PAYMENT_MODE: 'live' }));
});

test('mock verification derives one stable event from the server-started order and won amount', () => {
  const orderId = randomUUID();
  const adapter = new MockPaymentAdapter();
  const { providerOrderId } = adapter.start(orderId, 13000);
  const approval = adapter.verify(providerOrderId, 'approve');
  assert.equal(approval.provider, 'mock');
  assert.equal(approval.providerOrderId, providerOrderId);
  assert.equal(approval.orderId, orderId);
  assert.equal(approval.amountWon, 13000);
  assert.equal(approval.outcome, 'APPROVED');
  assert.equal(adapter.verify(providerOrderId, 'approve').eventId, approval.eventId);
  const decline = adapter.verify(providerOrderId, 'decline');
  assert.equal(decline.outcome, 'DECLINED');
  assert.notEqual(decline.eventId, approval.eventId);
  assert.equal(adapter.verify(providerOrderId, 'delay'), null);
  assert.deepEqual(new MockPaymentAdapter().verify(providerOrderId, 'approve'), approval);
});

test('a mismatched approved won amount or order never passes the stored-order comparison', () => {
  const orderId = randomUUID();
  const approval = new MockPaymentAdapter().verify(
    new MockPaymentAdapter().start(orderId, 13000).providerOrderId, 'approve');
  assert.doesNotThrow(() => assertVerifiedPayment(approval, orderId, 13000));
  assert.throws(() => assertVerifiedPayment(approval, orderId, 13001));
  assert.throws(() => assertVerifiedPayment(approval, randomUUID(), 13000));
  assert.throws(() => new MockPaymentAdapter().verify('mock:v1:not-an-order:13000:bad', 'approve'));
  assert.throws(() => new MockPaymentAdapter().start(orderId, 0));
});

test('zero-won no-charge verification never starts a positive payment', () => {
  const orderId = randomUUID();
  const adapter = new NoChargePaymentAdapter();
  const started = adapter.start(orderId, 0);
  const approval = adapter.verify(started.providerOrderId, 'approve');
  assert.equal(approval.provider, 'no_charge');
  assert.equal(approval.orderId, orderId);
  assert.equal(approval.amountWon, 0);
  assert.equal(approval.outcome, 'APPROVED');
  assert.throws(() => adapter.start(orderId, 1));
  assert.throws(() => adapter.verify(started.providerOrderId, 'decline'));
});
