import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { notificationIntentForEvent } from '../src/notifications/intent.ts';
import { planNotificationJobs,enqueueNotificationJobs } from '../src/notifications/jobs.ts';
import { claimNextNotificationJob,completeNotificationJob } from '../src/notifications/worker.ts';

const databaseName = 'shoppingmall_s53_complete_1008';
const systemId = process.env.S53_NOTIFICATION_COMPLETE_TEST_DB_SYSTEM_ID;

test('real PostgreSQL records transient retry, rejects stale lease and finishes the next attempt', {
  skip: !systemId,
}, async () => {
  assert.equal(process.env.PGDATABASE,databaseName,'private S5.3 completion database required');
  const pool = new Pool();
  const client = await pool.connect();
  let began = false;
  try {
    const identity = (await client.query(`SELECT current_database() AS name,
      system_identifier::text AS system_id FROM pg_control_system()`)).rows[0];
    assert.deepEqual(identity,{ name:databaseName,system_id:systemId });
    await client.query('BEGIN'); began = true;
    const accountId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const intent = notificationIntentForEvent({ kind:'order_submitted',accountId,
      sourceEventId:randomUUID() });
    const [jobId] = await enqueueNotificationJobs(client,
      planNotificationJobs(intent,{ primary:'email',push:false }));
    const base = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
    const at = (seconds) => new Date(base.getTime()+seconds*1000);
    const first = await claimNextNotificationJob(client,at(1));
    assert.equal(first.attemptNo,1);
    assert.equal(await completeNotificationJob(client,first,
      { kind:'transient_failure',errorCode:'PROVIDER_TIMEOUT' },at(2)),true);
    assert.equal(await completeNotificationJob(client,first,{ kind:'success' },at(3)),false);
    assert.equal(await claimNextNotificationJob(client,at(60)),null);
    const second = await claimNextNotificationJob(client,at(62));
    assert.equal(second.jobId,jobId);
    assert.equal(second.attemptNo,2);
    assert.equal(await completeNotificationJob(client,second,{ kind:'success' },at(63)),true);
    const job = (await client.query(`SELECT status,attempts_completed,available_at,
      lease_token,delivered_at FROM notification_jobs WHERE id=$1`,[jobId])).rows[0];
    assert.equal(job.status,'SENT');
    assert.equal(job.attempts_completed,2);
    assert.equal(job.available_at,null);
    assert.equal(job.lease_token,null);
    assert.ok(job.delivered_at instanceof Date);
    const attempts = (await client.query(`SELECT attempt_no,status,error_code,finished_at
      FROM notification_attempts WHERE job_id=$1 ORDER BY attempt_no`,[jobId])).rows;
    assert.deepEqual(attempts.map(({ attempt_no,status,error_code }) =>
      [attempt_no,status,error_code]),[
      [1,'TRANSIENT_FAILURE','PROVIDER_TIMEOUT'],[2,'SUCCEEDED',null],
    ]);
    assert.ok(attempts.every(({ finished_at }) => finished_at instanceof Date));
    await client.query('ROLLBACK'); began = false;
    for (const table of ['notification_jobs','notification_attempts','accounts']) {
      assert.equal((await client.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,0);
    }
  } finally {
    if (began) await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
