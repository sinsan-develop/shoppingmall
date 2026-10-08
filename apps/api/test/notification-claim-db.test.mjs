import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { notificationIntentForEvent } from '../src/notifications/intent.ts';
import { planNotificationJobs,enqueueNotificationJobs } from '../src/notifications/jobs.ts';
import { claimNextNotificationJob } from '../src/notifications/worker.ts';

const databaseName = 'shoppingmall_s53_claim_1008';
const systemId = process.env.S53_NOTIFICATION_CLAIM_TEST_DB_SYSTEM_ID;

test('real PostgreSQL atomically claims one due job with one STARTED attempt', {
  skip: !systemId,
}, async () => {
  assert.equal(process.env.PGDATABASE,databaseName,'private S5.3 claim database required');
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
    const drafts = planNotificationJobs(intent,{ primary:'email',push:false });
    const [jobId] = await enqueueNotificationJobs(client,drafts);
    const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
    const first = await claimNextNotificationJob(client,new Date(now.getTime()+1000));
    assert.equal(first.jobId,jobId);
    assert.equal(first.attemptNo,1);
    assert.equal(first.accountId,accountId);
    assert.equal(first.channel,'email');
    assert.equal(await claimNextNotificationJob(client,new Date(now.getTime()+1000)),null);
    const job = (await client.query(`SELECT status,attempts_completed,available_at,
      lease_token,lease_until FROM notification_jobs WHERE id=$1`,[jobId])).rows[0];
    assert.equal(job.status,'PROCESSING');
    assert.equal(job.attempts_completed,0);
    assert.equal(job.available_at,null);
    assert.equal(job.lease_token,first.leaseToken);
    assert.ok(job.lease_until > now);
    const attempts = (await client.query(`SELECT id,attempt_no,status,finished_at
      FROM notification_attempts WHERE job_id=$1`,[jobId])).rows;
    assert.deepEqual(attempts,[{ id:first.attemptId,attempt_no:1,
      status:'STARTED',finished_at:null }]);
    await client.query('ROLLBACK'); began = false;
    assert.equal((await client.query('SELECT count(*)::int AS n FROM notification_jobs')).rows[0].n,0);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM notification_attempts')).rows[0].n,0);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,0);
  } finally {
    if (began) await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
