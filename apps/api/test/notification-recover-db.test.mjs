import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { notificationIntentForEvent } from '../src/notifications/intent.ts';
import { planNotificationJobs,enqueueNotificationJobs } from '../src/notifications/jobs.ts';
import { claimNextNotificationJob,completeNotificationJob,
  recoverExpiredNotificationJob } from '../src/notifications/worker.ts';

const databaseName = 'shoppingmall_s53_recover_1008';
const systemId = process.env.S53_NOTIFICATION_RECOVER_TEST_DB_SYSTEM_ID;

test('real PostgreSQL recovers a lost lease and fences the abandoned worker', {
  skip: !systemId,
}, async () => {
  assert.equal(process.env.PGDATABASE,databaseName,'private S5.3 recovery database required');
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
    assert.equal(await recoverExpiredNotificationJob(client,at(60)),null);
    const recovered = await recoverExpiredNotificationJob(client,at(61));
    assert.equal(recovered.jobId,jobId);
    assert.equal(recovered.status,'QUEUED');
    assert.equal(recovered.attemptsCompleted,1);
    assert.equal(recovered.availableAt.getTime(),at(121).getTime());
    assert.equal(await completeNotificationJob(client,first,{ kind:'success' },at(62)),false);
    assert.equal(await claimNextNotificationJob(client,at(120)),null);
    const second = await claimNextNotificationJob(client,at(121));
    assert.equal(second.attemptNo,2);
    assert.equal(await completeNotificationJob(client,second,{ kind:'success' },at(122)),true);
    const attempts = (await client.query(`SELECT attempt_no,status,error_code
      FROM notification_attempts WHERE job_id=$1 ORDER BY attempt_no`,[jobId])).rows;
    assert.deepEqual(attempts,[
      { attempt_no:1,status:'TRANSIENT_FAILURE',error_code:'LEASE_EXPIRED' },
      { attempt_no:2,status:'SUCCEEDED',error_code:null },
    ]);
    assert.equal((await client.query('SELECT status FROM notification_jobs WHERE id=$1',
      [jobId])).rows[0].status,'SENT');
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
