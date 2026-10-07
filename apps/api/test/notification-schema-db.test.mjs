import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { getTableColumns, getTableName } from 'drizzle-orm';
import * as schema from '../src/db/schema.ts';

const databaseName = 'shoppingmall_s53_schema_1008';
const systemId = process.env.S53_NOTIFICATION_TEST_DB_SYSTEM_ID;

async function rejectsWith(client, statement, values, code) {
  await client.query('SAVEPOINT invalid_notification');
  try {
    await assert.rejects(client.query(statement, values), (error) => error.code === code);
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT invalid_notification');
  }
}

test('0019 installs only the two notification ledgers with matching declarations', {
  skip: !systemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, databaseName, 'private S5.3 database required');
  const pool = new Pool();
  try {
    const identity = (await pool.query(`SELECT current_database() AS name,
      system_identifier::text AS system_id FROM pg_control_system()`)).rows[0];
    assert.equal(identity.name, databaseName);
    assert.equal(identity.system_id, systemId);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n,20);
    for (const table of [schema.notificationJobs,schema.notificationAttempts]) {
      assert.ok(table, 'Drizzle declaration required');
      const name = getTableName(table);
      const actual = (await pool.query(`SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 ORDER BY column_name`,[name]))
        .rows.map(({ column_name }) => column_name);
      const declared = Object.values(getTableColumns(table)).map((column) => column.name).sort();
      assert.deepEqual(actual,declared,`${name} declaration drift`);
    }
    const existing = (await pool.query(`SELECT count(*)::int AS n FROM notification_jobs`)).rows[0].n;
    const attempts = (await pool.query(`SELECT count(*)::int AS n FROM notification_attempts`)).rows[0].n;
    assert.equal(existing,0);
    assert.equal(attempts,0);
  } finally { await pool.end(); }
});

test('0019 deduplicates channel jobs and rejects invalid attempt or contact-like error data', {
  skip: !systemId,
}, async () => {
  assert.equal(process.env.PGDATABASE,databaseName,'private S5.3 database required');
  const pool = new Pool();
  const client = await pool.connect();
  let began = false;
  try {
    const identity = (await client.query(`SELECT current_database() AS name,
      system_identifier::text AS system_id FROM pg_control_system()`)).rows[0];
    assert.equal(identity.name,databaseName);
    assert.equal(identity.system_id,systemId);
    await client.query('BEGIN'); began = true;
    const accountId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const eventId = randomUUID();
    const key = `order_submitted:${eventId}:${accountId}:email`;
    const insert = `INSERT INTO notification_jobs(kind,source_event_id,account_id,channel,dedupe_key)
      VALUES ('order_submitted',$1,$2,'email',$3) RETURNING id,status,attempts_completed`;
    const job = (await client.query(insert,[eventId,accountId,key])).rows[0];
    assert.equal(job.status,'QUEUED');
    assert.equal(job.attempts_completed,0);
    await rejectsWith(client,insert,[eventId,accountId,key],'23505');
    await rejectsWith(client,`INSERT INTO notification_jobs
      (kind,source_event_id,account_id,channel,dedupe_key)
      VALUES ('order_submitted',$1,$2,'unknown',$3)`,[eventId,accountId,`${key}:bad`],'23514');
    await rejectsWith(client,`INSERT INTO notification_jobs
      (kind,source_event_id,account_id,channel,dedupe_key)
      VALUES ('restock_available',$1,$2,'email',$3)`,[eventId,accountId,`${key}:restock`],'23514');
    await client.query(`INSERT INTO notification_attempts(job_id,attempt_no,status)
      VALUES ($1,1,'STARTED')`,[job.id]);
    await rejectsWith(client,`INSERT INTO notification_attempts(job_id,attempt_no,status)
      VALUES ($1,1,'STARTED')`,[job.id],'23505');
    await rejectsWith(client,`INSERT INTO notification_attempts
      (job_id,attempt_no,status,error_code,finished_at)
      VALUES ($1,2,'TRANSIENT_FAILURE','user@example.com',now())`,[job.id],'23514');
    await client.query(`UPDATE notification_attempts
      SET status='SUCCEEDED',finished_at=now() WHERE job_id=$1 AND attempt_no=1`,[job.id]);
    await client.query(`UPDATE notification_jobs SET status='SENT',attempts_completed=1,
      available_at=NULL,delivered_at=now(),updated_at=now() WHERE id=$1`,[job.id]);
    const saved = (await client.query(`SELECT status,attempts_completed,delivered_at IS NOT NULL AS delivered
      FROM notification_jobs WHERE id=$1`,[job.id])).rows[0];
    assert.deepEqual(saved,{ status:'SENT',attempts_completed:1,delivered:true });
  } finally {
    if (began) await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
