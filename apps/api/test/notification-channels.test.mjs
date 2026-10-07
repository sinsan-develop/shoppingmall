import assert from 'node:assert/strict';
import test from 'node:test';
import { planNotificationChannels } from '../src/notifications/channels.ts';

test('verified email is the primary route even when a verified phone also exists', () => {
  assert.deepEqual(planNotificationChannels({ verifiedEmail:true,verifiedPhone:true,
    pushConsent:false,registeredDevice:true,marketingEmail:false,marketingSms:false }),
  { primary:'email',push:false });
});

test('verified phone is used only when email is not verified', () => {
  assert.deepEqual(planNotificationChannels({ verifiedEmail:false,verifiedPhone:true,
    pushConsent:true,registeredDevice:true }),{ primary:'sms',push:true });
  assert.deepEqual(planNotificationChannels({ verifiedEmail:false,verifiedPhone:false,
    pushConsent:true,registeredDevice:true }),{ primary:null,push:true });
});

test('push requires both customer consent and a registered device', () => {
  assert.deepEqual(planNotificationChannels({ verifiedEmail:true,verifiedPhone:false,
    pushConsent:true,registeredDevice:false }),{ primary:'email',push:false });
  assert.deepEqual(planNotificationChannels({ verifiedEmail:false,verifiedPhone:false,
    pushConsent:false,registeredDevice:true }),{ primary:null,push:false });
});

test('missing or malformed eligibility cannot select an outbound channel', () => {
  assert.throws(() => planNotificationChannels({ verifiedEmail:'yes',verifiedPhone:false,
    pushConsent:false,registeredDevice:false }),/Invalid notification channels/);
  assert.throws(() => planNotificationChannels({ verifiedEmail:false,verifiedPhone:false,
    pushConsent:false }),/Invalid notification channels/);
});
