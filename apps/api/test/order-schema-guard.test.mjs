import assert from 'node:assert/strict';
import test from 'node:test';
import { skipWithoutOrderSchema } from './order-schema-guard.mjs';

test('0012 guard skips without seeding a schema-missing DB and can fail strict QA', async () => {
  const pool = { query: async () => ({ rows: [{ ready: false }] }) };
  const skipped = [];
  assert.equal(await skipWithoutOrderSchema({ skip: (reason) => skipped.push(reason) }, pool, false), true);
  assert.deepEqual(skipped, ['S3 order migration 0012 not applied']);
  await assert.rejects(() => skipWithoutOrderSchema({ skip: () => {} }, pool, true),
    /S3 order migration 0012 not applied/);
  assert.equal(await skipWithoutOrderSchema({ skip: () => {} },
    { query: async () => ({ rows: [{ ready: true }] }) }, true), false);
});
