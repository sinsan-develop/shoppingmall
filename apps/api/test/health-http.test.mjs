import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.ts';

test('GET /health serves the public liveness contract', async () => {
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: 'ok',
      service: 'shoppingmall-api',
    });
    if (process.env.DATABASE_URL) {
      const ready = await fetch(`http://127.0.0.1:${address.port}/ready`);
      assert.equal(ready.status, 200);
      assert.deepEqual(await ready.json(), { status: 'ok', dependency: 'database' });
    }
  } finally {
    await app.close();
  }
});

test('GET /ready does not claim database readiness before a connection is configured', {
  skip: !!process.env.DATABASE_URL,
}, async () => {
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const response = await fetch(`http://127.0.0.1:${address.port}/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      status: 'unavailable',
      dependency: 'database',
    });
  } finally {
    await app.close();
  }
});
