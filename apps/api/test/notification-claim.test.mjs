import assert from 'node:assert/strict';
import test from 'node:test';
import { claimNextNotificationJob } from '../src/notifications/worker.ts';

const now = new Date('2026-10-08T00:00:00.000Z');
const jobId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const accountId = '33333333-3333-4333-8333-333333333333';
const sourceEventId = '44444444-4444-4444-8444-444444444444';

test('claim locks one due job and records the attempt in one SQL statement', async () => {
  const queries = [];
  const client = { async query(sql,params) {
    queries.push({ sql,params });
    return { rows:[{ jobId,attemptId,attemptNo:1,accountId,sourceEventId,
      kind:'order_submitted',channel:'email',restockSubscriptionId:null }] };
  } };
  const claim = await claimNextNotificationJob(client,now);
  assert.equal(queries.length,1);
  assert.match(queries[0].sql,/FOR UPDATE SKIP LOCKED/);
  assert.match(queries[0].sql,/INSERT INTO notification_attempts/);
  assert.match(queries[0].sql,/available_at <= \$1/);
  assert.equal(queries[0].params[0],now);
  assert.equal(queries[0].params[2].getTime(),now.getTime()+60_000);
  assert.match(queries[0].params[1],/^[0-9a-f-]{36}$/);
  assert.deepEqual(claim,{ jobId,attemptId,attemptNo:1,accountId,sourceEventId,
    kind:'order_submitted',channel:'email',restockSubscriptionId:null,
    leaseToken:queries[0].params[1] });
});

test('no due job returns null without inventing an attempt', async () => {
  const client = { async query() { return { rows:[] }; } };
  assert.equal(await claimNextNotificationJob(client,now),null);
  await assert.rejects(claimNextNotificationJob(client,new Date('invalid')),
    /Invalid notification claim time/);
});
