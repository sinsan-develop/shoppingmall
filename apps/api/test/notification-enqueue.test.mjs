import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationIntentForEvent } from '../src/notifications/intent.ts';
import { planNotificationJobs,enqueueNotificationJobs } from '../src/notifications/jobs.ts';

const accountId = '11111111-1111-4111-8111-111111111111';
const sourceEventId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';

test('each draft is queued inside the caller transaction with a unique key', async () => {
  const intent = notificationIntentForEvent({ kind:'order_submitted',accountId,sourceEventId });
  const drafts = planNotificationJobs(intent,{ primary:'email',push:true });
  const statements = [];
  const client = { async query(sql,params) {
    statements.push({ sql,params });
    return { rows:[{ id:jobId }] };
  } };
  assert.deepEqual(await enqueueNotificationJobs(client,drafts),[jobId,jobId]);
  assert.equal(statements.length,2);
  assert.ok(statements.every(({ sql }) => sql.includes('ON CONFLICT (dedupe_key) DO NOTHING')));
  assert.ok(statements.every(({ sql }) => !/\b(BEGIN|COMMIT)\b/.test(sql)));
  assert.deepEqual(statements[0].params,[accountId,'order_submitted',sourceEventId,null,
    'email',`${intent.dedupeKey}:email`]);
  assert.deepEqual(statements[1].params,[accountId,'order_submitted',sourceEventId,null,
    'push',`${intent.dedupeKey}:push`]);
});

test('replay does not create a second work item', async () => {
  const intent = notificationIntentForEvent({ kind:'payment_approved',accountId,sourceEventId });
  const draft = planNotificationJobs(intent,{ primary:'sms',push:false });
  const client = { async query() { return { rows:[] }; } };
  assert.deepEqual(await enqueueNotificationJobs(client,draft),[]);
  assert.deepEqual(await enqueueNotificationJobs(client,[]),[]);
});

test('invalid drafts are rejected before any query', async () => {
  let queries = 0;
  const client = { async query() { queries++;return { rows:[] }; } };
  await assert.rejects(enqueueNotificationJobs(client,[{ accountId,kind:'order_submitted',
    sourceEventId,channel:'email',dedupeKey:'person@example.com' }]),
  /Invalid notification job/);
  assert.equal(queries,0);
});
