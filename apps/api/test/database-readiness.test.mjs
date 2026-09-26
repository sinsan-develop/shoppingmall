import assert from 'node:assert/strict';
import test from 'node:test';
import { hasAccountSchema } from '../src/db/readiness.ts';

test('readiness requires both a reachable database and the account schema', async () => {
  assert.equal(await hasAccountSchema(async () => ({ rows: [{ ready: true }] })), true);
  assert.equal(await hasAccountSchema(async () => ({ rows: [{ ready: false }] })), false);
  assert.equal(await hasAccountSchema(async () => { throw new Error('credential failure'); }), false);
});
