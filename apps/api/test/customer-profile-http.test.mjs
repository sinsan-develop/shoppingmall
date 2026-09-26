import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.ts';

test('customer profile HTTP requires a verified session and trusted write origin', async () => {
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address();
    const base = `http://127.0.0.1:${port}`;
    const addresses = await fetch(`${base}/customer/addresses`, { headers: { 'x-role': 'customer' } });
    assert.equal(addresses.status, 401);
    const preferences = await fetch(`${base}/customer/preferences`, { headers: { 'x-role': 'admin' } });
    assert.equal(preferences.status, 401);
    const deletion = await fetch(`${base}/customer/deletion-request`, {
      method: 'POST', headers: { origin: 'https://untrusted.invalid', 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(deletion.status, 403);
  } finally {
    await app.close();
  }
});
