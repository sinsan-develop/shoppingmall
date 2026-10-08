import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { resolveNotificationChannels } from '../src/notifications/channel-source.ts';

const databaseName = 'shoppingmall_s53_channels_1008';
const systemId = process.env.S53_NOTIFICATION_CHANNELS_TEST_DB_SYSTEM_ID;

test('real PostgreSQL selects only verified identities and device-consented push', {
  skip: !systemId,
}, async () => {
  assert.equal(process.env.PGDATABASE,databaseName,'private S5.3 channels database required');
  const pool = new Pool();
  const client = await pool.connect();
  let began = false;
  try {
    const identity = (await client.query(`SELECT current_database() AS name,
      system_identifier::text AS system_id FROM pg_control_system()`)).rows[0];
    assert.deepEqual(identity,{ name:databaseName,system_id:systemId });
    await client.query('BEGIN'); began = true;
    const accountId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await client.query(`INSERT INTO notification_preferences(account_id,push)
      VALUES ($1,true)`,[accountId]);
    assert.deepEqual(await resolveNotificationChannels(client,accountId,true),
      { primary:null,push:true });
    await client.query(`INSERT INTO account_identities
      (account_id,kind,identifier,verified_at) VALUES
      ($1,'email','s53-email@example.invalid',NULL),
      ($1,'phone','01000000000',now())`,[accountId]);
    assert.deepEqual(await resolveNotificationChannels(client,accountId,false),
      { primary:'sms',push:false });
    await client.query(`UPDATE account_identities SET verified_at=now()
      WHERE account_id=$1 AND kind='email'`,[accountId]);
    assert.deepEqual(await resolveNotificationChannels(client,accountId,true),
      { primary:'email',push:true });
    await client.query('ROLLBACK'); began = false;
    for (const table of ['accounts','account_identities','notification_preferences']) {
      assert.equal((await client.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,0);
    }
  } finally {
    if (began) await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
