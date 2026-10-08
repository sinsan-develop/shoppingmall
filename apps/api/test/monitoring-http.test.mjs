import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.ts';

test('administrator monitoring route rejects unauthenticated requests before exposing data', async () => {
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const response = await fetch(`${base}/admin/monitoring?from=2026-10-06&to=2026-10-06`);
    assert.equal(response.status, 401);
  } finally { await app.close(); }
});
