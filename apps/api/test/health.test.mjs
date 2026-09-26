import assert from 'node:assert/strict';
import test from 'node:test';
import { healthPayload } from '../src/health.ts';

test('health reports a live API without exposing configuration', () => {
  assert.deepEqual(healthPayload(), {
    status: 'ok',
    service: 'shoppingmall-api',
  });
});
