import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPassword, createSessionToken, hashSessionToken } from '../src/auth/credentials.ts';

test('password verifier accepts only the original secret without storing plaintext', async () => {
  const secret = 'correct horse battery staple';
  const digest = await hashPassword(secret);
  assert.doesNotMatch(digest, /correct horse/);
  assert.equal(await verifyPassword(secret, digest), true);
  assert.equal(await verifyPassword('incorrect horse battery staple', digest), false);
  assert.equal(await verifyPassword(secret, 'malformed'), false);
});

test('session bearer is random and only its digest needs persistence', () => {
  const first = createSessionToken();
  const second = createSessionToken();
  assert.notEqual(first, second);
  assert.notEqual(hashSessionToken(first), first);
  assert.equal(hashSessionToken(first), hashSessionToken(first));
  assert.notEqual(hashSessionToken(first), hashSessionToken(second));
});
