import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.ts';

test('auth HTTP rejects role-spoofing headers and unconfigured login', {
  skip: !!process.env.DATABASE_URL,
}, async () => {
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const base = `http://127.0.0.1:${address.port}`;
    const me = await fetch(`${base}/auth/me`, { headers: { 'x-role': 'admin' } });
    assert.equal(me.status, 401);
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:9091' },
      body: JSON.stringify({ email: 'qa@example.invalid', password: 'test-only-password-12345' }),
    });
    assert.equal(login.status, 503);
    assert.equal(login.headers.get('set-cookie'), null);
  } finally {
    await app.close();
  }
});
