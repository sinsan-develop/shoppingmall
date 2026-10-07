import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { notificationIntentForEvent } from '../src/notifications/intent.ts';
import { planNotificationJobs,enqueueNotificationJobs } from '../src/notifications/jobs.ts';

const databaseName = 'shoppingmall_s53_queue_1008';
const systemId = process.env.S53_NOTIFICATION_QUEUE_TEST_DB_SYSTEM_ID;

test('event transaction atomically inserts, deduplicates and rolls back notification work', {
  skip: !systemId,
}, async () => {
  assert.equal(process.env.PGDATABASE,databaseName,'private S5.3 queue database required');
  const pool = new Pool();
  const client = await pool.connect();
  let began = false;
  try {
    const identity = (await client.query(`SELECT current_database() AS name,
      system_identifier::text AS system_id FROM pg_control_system()`)).rows[0];
    assert.deepEqual(identity,{ name:databaseName,system_id:systemId });
    await client.query('BEGIN'); began = true;
    const accountId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const sourceEventId = randomUUID();
    const intent = notificationIntentForEvent({ kind:'order_submitted',accountId,sourceEventId });
    const drafts = planNotificationJobs(intent,{ primary:'email',push:true });
    const first = await enqueueNotificationJobs(client,drafts);
    assert.equal(first.length,2);
    assert.deepEqual(await enqueueNotificationJobs(client,drafts),[]);
    const saved = (await client.query(`SELECT channel,status,attempts_completed
      FROM notification_jobs WHERE account_id=$1 ORDER BY channel`,[accountId])).rows;
    assert.deepEqual(saved,[
      { channel:'email',status:'QUEUED',attempts_completed:0 },
      { channel:'push',status:'QUEUED',attempts_completed:0 },
    ]);
    await client.query('ROLLBACK');
    began = false;
    assert.equal((await client.query('SELECT count(*)::int AS n FROM notification_jobs')).rows[0].n,0);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,0);
  } finally {
    if (began) await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
