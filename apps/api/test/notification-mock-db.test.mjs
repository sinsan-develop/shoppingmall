import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { notificationIntentForEvent } from '../src/notifications/intent.ts';
import { planNotificationJobs,enqueueNotificationJobs } from '../src/notifications/jobs.ts';
import { runMockNotificationOnce } from '../src/notifications/mock.ts';

const databaseName = 'shoppingmall_s53_mock_1008';
const systemId = process.env.S53_NOTIFICATION_MOCK_TEST_DB_SYSTEM_ID;
const env = { APP_ENV:'development',NODE_ENV:'test',API_HOST:'127.0.0.1',
  NOTIFICATION_MODE:'mock' };

test('private opt-in mock closes a queued job but does not represent real delivery', {
  skip: !systemId,
}, async () => {
  assert.equal(process.env.PGDATABASE,databaseName,'private S5.3 mock database required');
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
    const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
    assert.deepEqual(await runMockNotificationOnce(client,now,{ APP_ENV:'development' }),
      { processed:false });
    assert.deepEqual(await runMockNotificationOnce(client,new Date(now.getTime()+1000),env),
      { processed:true });
    assert.deepEqual(await runMockNotificationOnce(client,new Date(now.getTime()+2000),env),
      { processed:false });
    const job = (await client.query(`SELECT status,attempts_completed
      FROM notification_jobs WHERE id=$1`,[jobId])).rows[0];
    assert.deepEqual(job,{ status:'SENT',attempts_completed:1 });
    const attempt = (await client.query(`SELECT status,error_code FROM notification_attempts
      WHERE job_id=$1`,[jobId])).rows[0];
    assert.deepEqual(attempt,{ status:'SUCCEEDED',error_code:null });
    await client.query('ROLLBACK'); began = false;
    for (const table of ['accounts','notification_jobs','notification_attempts']) {
      assert.equal((await client.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,0);
    }
  } finally {
    if (began) await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
