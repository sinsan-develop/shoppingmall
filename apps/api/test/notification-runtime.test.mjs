import assert from 'node:assert/strict';
import test from 'node:test';
import { processMockNotificationTick } from '../src/notifications/runtime.ts';

const enabled = { APP_ENV:'development',NODE_ENV:'test',API_HOST:'127.0.0.1',
  NOTIFICATION_MODE:'mock' };

test('development mock runtime consumes queued work in a bounded transaction', async () => {
  const statements = [];
  let released = 0;
  const client = { async query(sql) { statements.push(sql); return { rows:[] }; },
    release() { released++; } };
  const pool = { async connect() { return client; } };
  assert.deepEqual(await processMockNotificationTick(pool,new Date(),enabled),
    { processed:false });
  assert.equal(statements[0],'BEGIN');
  assert.equal(statements.at(-1),'COMMIT');
  assert.equal(released,1);
  statements.length = 0;
  assert.deepEqual(await processMockNotificationTick(pool,new Date(),{
    APP_ENV:'development' }),{ processed:false });
  assert.equal(statements.length,0);
});

test('mock runtime rolls back and releases client on processing failure', async () => {
  const statements = [];
  let released = 0;
  const client = { async query(sql) { statements.push(sql);
    if (sql.includes('WITH expired')) throw new Error('synthetic failure');
    return { rows:[] }; },release() { released++; } };
  const pool = { async connect() { return client; } };
  await assert.rejects(processMockNotificationTick(pool,new Date(),enabled),
    /synthetic failure/);
  assert.equal(statements.at(-1),'ROLLBACK');
  assert.equal(released,1);
});
