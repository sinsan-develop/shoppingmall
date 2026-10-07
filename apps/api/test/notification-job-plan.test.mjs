import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationIntentForEvent } from '../src/notifications/intent.ts';
import { planNotificationJobs } from '../src/notifications/jobs.ts';

const accountId = '11111111-1111-4111-8111-111111111111';
const sourceEventId = '22222222-2222-4222-8222-222222222222';
const subscriptionId = '33333333-3333-4333-8333-333333333333';

test('transactional work chooses the primary route and only eligible supplemental push', () => {
  const intent = notificationIntentForEvent({ kind:'order_submitted',accountId,sourceEventId });
  assert.deepEqual(planNotificationJobs(intent,{ primary:'email',push:true }),[
    { ...intent,channel:'email',dedupeKey:`${intent.dedupeKey}:email` },
    { ...intent,channel:'push',dedupeKey:`${intent.dedupeKey}:push` },
  ]);
  assert.deepEqual(planNotificationJobs(intent,{ primary:'sms',push:false }),[
    { ...intent,channel:'sms',dedupeKey:`${intent.dedupeKey}:sms` },
  ]);
});

test('restock request creates exactly one outbound work item', () => {
  const intent = notificationIntentForEvent({ kind:'restock_available',accountId,sourceEventId,
    subscriptionId,subscriptionStatus:'active',becameSellable:true });
  assert.deepEqual(planNotificationJobs(intent,{ primary:'email',push:true }),[
    { ...intent,channel:'email',dedupeKey:`${intent.dedupeKey}:email` },
  ]);
  assert.deepEqual(planNotificationJobs(intent,{ primary:null,push:true }),[
    { ...intent,channel:'push',dedupeKey:`${intent.dedupeKey}:push` },
  ]);
  assert.deepEqual(planNotificationJobs(null,{ primary:'email',push:true }),[]);
});

test('no verified route leaves app order status as the fallback without queueing', () => {
  const intent = notificationIntentForEvent({ kind:'payment_declined',accountId,sourceEventId });
  assert.deepEqual(planNotificationJobs(intent,{ primary:null,push:false }),[]);
  assert.deepEqual(planNotificationJobs(intent,{ primary:null,push:true }),[
    { ...intent,channel:'push',dedupeKey:`${intent.dedupeKey}:push` },
  ]);
  assert.throws(() => planNotificationJobs(intent,{ primary:'webhook',push:false }),
    /Invalid notification job channels/);
});
