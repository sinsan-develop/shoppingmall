import assert from 'node:assert/strict';
import test from 'node:test';
import { MockPhoneOtp } from '../src/auth/mock-phone-otp.ts';

test('mock OTP requires code possession, expires, rate-limits and binds an explicit account', () => {
  let now = 1_000;
  const delivered = [];
  const otp = new MockPhoneOtp((phone, code) => delivered.push({ phone, code }), () => now, () => '123456');
  const issued = otp.issue('010-1234-5678', 'customer-account-a');
  assert.equal(delivered[0].phone, '01012345678');
  assert.equal(otp.verify(issued.challengeId, '000000', 'customer-account-a'), undefined);
  assert.equal(otp.verify(issued.challengeId, delivered[0].code, 'other-account'), undefined);
  const proof = otp.verify(issued.challengeId, delivered[0].code, 'customer-account-a');
  assert.equal(proof?.phone, '01012345678');
  assert.equal(proof?.accountId, 'customer-account-a');
  assert.equal(otp.verify(issued.challengeId, delivered[0].code, 'customer-account-a'), undefined);

  const expired = otp.issue('01012345678', 'customer-account-a');
  now += 5 * 60_000 + 1;
  assert.equal(otp.verify(expired.challengeId, delivered[1].code, 'customer-account-a'), undefined);

  const limited = otp.issue('01012345678', 'customer-account-a');
  for (let i = 0; i < 5; i++) assert.equal(otp.verify(limited.challengeId, '000000', 'customer-account-a'), undefined);
  assert.equal(otp.verify(limited.challengeId, delivered[2].code, 'customer-account-a'), undefined);
  assert.throws(() => otp.issue('not-a-phone', 'customer-account-a'));
});
