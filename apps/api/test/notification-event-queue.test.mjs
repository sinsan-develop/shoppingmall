import assert from 'node:assert/strict';
import test from 'node:test';
import { queueNotificationEvent } from '../src/notifications/event-queue.ts';

const accountId = '11111111-1111-4111-8111-111111111111';
const sourceEventId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';

test('one source event reads verified facts and enqueues chosen work on the same client', async () => {
  const calls = [];
  const client = { async query(sql,params) {
    calls.push({ sql,params });
    return calls.length === 1
      ? { rows:[{ verifiedEmail:true,verifiedPhone:false,pushConsent:false }] }
      : { rows:[{ id:jobId }] };
  } };
  assert.deepEqual(await queueNotificationEvent(client,
    { kind:'order_submitted',accountId,sourceEventId }),[jobId]);
  assert.equal(calls.length,2);
  assert.match(calls[0].sql,/verified_at IS NOT NULL/);
  assert.match(calls[1].sql,/ON CONFLICT \(dedupe_key\) DO NOTHING/);
  assert.deepEqual(calls[1].params,[accountId,'order_submitted',sourceEventId,null,'email',
    `order_submitted:${sourceEventId}:${accountId}:email`]);
});

test('no outbound route creates no job while retaining app status fallback', async () => {
  let queries = 0;
  const client = { async query() {
    queries++;
    return { rows:[{ verifiedEmail:false,verifiedPhone:false,pushConsent:false }] };
  } };
  assert.deepEqual(await queueNotificationEvent(client,
    { kind:'payment_declined',accountId,sourceEventId }),[]);
  assert.equal(queries,1);
});

test('inactive restock request never reads channels or creates work', async () => {
  let queries = 0;
  const client = { async query() { queries++;return { rows:[] }; } };
  assert.deepEqual(await queueNotificationEvent(client,{ kind:'restock_available',
    accountId,sourceEventId,subscriptionId:'44444444-4444-4444-8444-444444444444',
    subscriptionStatus:'cancelled',becameSellable:true }),[]);
  assert.equal(queries,0);
});
