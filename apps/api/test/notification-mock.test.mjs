import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMockNotificationMode,runMockNotificationOnce } from '../src/notifications/mock.ts';

const now = new Date('2026-10-08T00:00:00.000Z');
const allowed = { APP_ENV:'development',NODE_ENV:'test',API_HOST:'127.0.0.1',
  NOTIFICATION_MODE:'mock' };

test('mock delivery is opt-in and cannot run in production or on a public host', () => {
  assert.equal(resolveMockNotificationMode({ APP_ENV:'development' }),'disabled');
  assert.equal(resolveMockNotificationMode(allowed),'mock');
  assert.throws(() => resolveMockNotificationMode({ ...allowed,NODE_ENV:'production' }),
    /Notification mode unavailable/);
  assert.throws(() => resolveMockNotificationMode({ ...allowed,API_HOST:'0.0.0.0' }),
    /Notification mode unavailable/);
  assert.throws(() => resolveMockNotificationMode({ ...allowed,APP_ENV:'staging' }),
    /Notification mode unavailable/);
});

test('disabled mode does not touch the queue', async () => {
  let queries = 0;
  const client = { async query() { queries++;return { rows:[] }; } };
  assert.deepEqual(await runMockNotificationOnce(client,now,{ APP_ENV:'development' }),
    { processed:false });
  assert.equal(queries,0);
});

test('enabled mock consumes no contact data and rejects unsafe outcome', async () => {
  const calls = [];
  const client = { async query(sql,params) {
    calls.push({ sql,params });
    return { rows:[] };
  } };
  assert.deepEqual(await runMockNotificationOnce(client,now,allowed),{ processed:false });
  assert.equal(calls.length,2);
  assert.ok(calls.every(({ sql }) => !/\bidentifier\b|password_hash/.test(sql)));
  await assert.rejects(runMockNotificationOnce(client,now,allowed,'send-real'),
    /Invalid mock notification outcome/);
  assert.equal(calls.length,2);
});
