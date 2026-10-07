import assert from 'node:assert/strict';
import test from 'node:test';
import { completeNotificationJob } from '../src/notifications/worker.ts';

const at = new Date('2026-10-08T00:00:00.000Z');
const claim = {
  jobId:'11111111-1111-4111-8111-111111111111',
  attemptId:'22222222-2222-4222-8222-222222222222',
  leaseToken:'33333333-3333-4333-8333-333333333333',
  attemptNo:1,
};

function recorder(found=true) {
  const calls = [];
  return { calls,client:{ async query(sql,params) {
    calls.push({ sql,params });
    return { rows:found ? [{ id:claim.jobId }] : [] };
  } } };
}

test('successful delivery closes the exact lease and notifies an active restock request', async () => {
  const { calls,client } = recorder();
  assert.equal(await completeNotificationJob(client,claim,{ kind:'success' },at),true);
  assert.equal(calls.length,1);
  assert.match(calls[0].sql,/FOR UPDATE OF j,a/);
  assert.match(calls[0].sql,/UPDATE notification_attempts/);
  assert.match(calls[0].sql,/UPDATE notification_jobs/);
  assert.match(calls[0].sql,/UPDATE restock_subscriptions/);
  assert.equal(calls[0].params[5],'SUCCEEDED');
  assert.equal(calls[0].params[7],'SENT');
  assert.equal(calls[0].params[8],null);
  assert.equal(calls[0].params[9],at);
});

test('transient errors retry twice; third or permanent error ends the job', async () => {
  const { calls,client } = recorder();
  assert.equal(await completeNotificationJob(client,claim,
    { kind:'transient_failure',errorCode:'PROVIDER_TIMEOUT' },at),true);
  assert.equal(calls[0].params[5],'TRANSIENT_FAILURE');
  assert.equal(calls[0].params[6],'PROVIDER_TIMEOUT');
  assert.equal(calls[0].params[7],'QUEUED');
  assert.equal(calls[0].params[8].getTime(),at.getTime()+60_000);
  await completeNotificationJob(client,{ ...claim,attemptNo:3 },
    { kind:'transient_failure',errorCode:'PROVIDER_TIMEOUT' },at);
  assert.equal(calls[1].params[7],'FAILED');
  assert.equal(calls[1].params[8],null);
  await completeNotificationJob(client,claim,
    { kind:'permanent_failure',errorCode:'DESTINATION_INVALID' },at);
  assert.equal(calls[2].params[7],'FAILED');
});

test('stale lease has no effect and unsafe provider detail never reaches SQL', async () => {
  const { calls,client } = recorder(false);
  assert.equal(await completeNotificationJob(client,claim,{ kind:'success' },at),false);
  await assert.rejects(completeNotificationJob(client,claim,
    { kind:'transient_failure',errorCode:'user@example.com' },at),
  /Invalid notification outcome/);
  assert.equal(calls.length,1);
});
