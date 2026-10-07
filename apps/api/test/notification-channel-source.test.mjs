import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveNotificationChannels } from '../src/notifications/channel-source.ts';

const accountId = '11111111-1111-4111-8111-111111111111';

test('verified identity facts and push consent are queried without reading raw contacts', async () => {
  const calls = [];
  const client = { async query(sql,params) {
    calls.push({ sql,params });
    return { rows:[{ verifiedEmail:true,verifiedPhone:true,pushConsent:true }] };
  } };
  assert.deepEqual(await resolveNotificationChannels(client,accountId,false),
    { primary:'email',push:false });
  assert.deepEqual(await resolveNotificationChannels(client,accountId,true),
    { primary:'email',push:true });
  assert.equal(calls.length,2);
  assert.ok(calls.every(({ sql }) => sql.includes('verified_at IS NOT NULL')));
  assert.ok(calls.every(({ sql }) => !/\bidentifier\b|password_hash/.test(sql)));
  assert.deepEqual(calls[0].params,[accountId]);
});

test('unverified email falls back to verified phone; no verified identity queues nothing', async () => {
  let row = { verifiedEmail:false,verifiedPhone:true,pushConsent:false };
  const client = { async query() { return { rows:[row] }; } };
  assert.deepEqual(await resolveNotificationChannels(client,accountId,false),
    { primary:'sms',push:false });
  row = { verifiedEmail:false,verifiedPhone:false,pushConsent:true };
  assert.deepEqual(await resolveNotificationChannels(client,accountId,false),
    { primary:null,push:false });
});

test('invalid account or missing eligibility row cannot select an outbound route', async () => {
  let queries = 0;
  const client = { async query() { queries++;return { rows:[] }; } };
  await assert.rejects(resolveNotificationChannels(client,'bad',false),
    /Invalid notification account/);
  assert.equal(queries,0);
  await assert.rejects(resolveNotificationChannels(client,accountId,false),
    /Notification account unavailable/);
});
