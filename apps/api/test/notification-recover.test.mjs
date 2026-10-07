import assert from 'node:assert/strict';
import test from 'node:test';
import { recoverExpiredNotificationJob } from '../src/notifications/worker.ts';

const now = new Date('2026-10-08T00:00:00.000Z');
const jobId = '11111111-1111-4111-8111-111111111111';

test('expired lease closes the active attempt and schedules retry in one statement', async () => {
  const queries = [];
  const client = { async query(sql,params) {
    queries.push({ sql,params });
    return { rows:[{ jobId,attemptsCompleted:1,status:'QUEUED',
      availableAt:new Date(now.getTime()+60_000) }] };
  } };
  assert.deepEqual(await recoverExpiredNotificationJob(client,now),{
    jobId,attemptsCompleted:1,status:'QUEUED',availableAt:new Date(now.getTime()+60_000),
  });
  assert.equal(queries.length,1);
  assert.match(queries[0].sql,/FOR UPDATE OF j,a SKIP LOCKED/);
  assert.match(queries[0].sql,/LEASE_EXPIRED/);
  assert.match(queries[0].sql,/UPDATE notification_attempts/);
  assert.match(queries[0].sql,/UPDATE notification_jobs/);
  assert.deepEqual(queries[0].params,[now]);
});

test('nothing expired returns null and invalid time is rejected', async () => {
  const client = { async query() { return { rows:[] }; } };
  assert.equal(await recoverExpiredNotificationJob(client,now),null);
  await assert.rejects(recoverExpiredNotificationJob(client,new Date('invalid')),
    /Invalid notification recovery time/);
});
