import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationIntentForEvent } from '../src/notifications/intent.ts';

const accountId = '11111111-1111-4111-8111-111111111111';
const sourceEventId = '22222222-2222-4222-8222-222222222222';
const subscriptionId = '33333333-3333-4333-8333-333333333333';

test('order, payment and shipment events have stable transactional intent without marketing consent', () => {
  for (const kind of ['order_submitted','payment_approved','payment_declined','shipment_updated']) {
    const event = { kind,sourceEventId,accountId };
    const first = notificationIntentForEvent(event);
    assert.deepEqual(first,{
      kind,sourceEventId,accountId,purpose:'transactional',
      dedupeKey:`${kind}:${sourceEventId}:${accountId}`,
    });
    assert.deepEqual(notificationIntentForEvent(event),first);
    assert.equal(JSON.stringify(first).includes('@'),false);
  }
});

test('restock intent requires an active request and a zero-to-sellable transition', () => {
  const base = { kind:'restock_available',sourceEventId,accountId,subscriptionId,
    becameSellable:true,subscriptionStatus:'active' };
  assert.deepEqual(notificationIntentForEvent(base),{
    kind:'restock_available',sourceEventId,accountId,subscriptionId,purpose:'requested_restock',
    dedupeKey:`restock_available:${sourceEventId}:${subscriptionId}:${accountId}`,
  });
  assert.equal(notificationIntentForEvent({ ...base,subscriptionStatus:'cancelled' }),null);
  assert.equal(notificationIntentForEvent({ ...base,subscriptionStatus:'notified' }),null);
  assert.equal(notificationIntentForEvent({ ...base,becameSellable:false }),null);
});

test('malformed event identity or unsupported kind cannot create notification work', () => {
  assert.throws(() => notificationIntentForEvent({
    kind:'payment_approved',sourceEventId:'not-a-uuid',accountId,
  }),/Invalid notification event/);
  assert.throws(() => notificationIntentForEvent({
    kind:'promotion',sourceEventId,accountId,
  }),/Invalid notification event/);
  assert.throws(() => notificationIntentForEvent({
    kind:'restock_available',sourceEventId,accountId,subscriptionStatus:'active',becameSellable:true,
  }),/Invalid notification event/);
});
