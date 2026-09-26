import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.ts';

test('mock phone challenge is off unless explicitly enabled and never trusts a role header', async () => {
  const before = process.env.ENABLE_MOCK_OTP;
  delete process.env.ENABLE_MOCK_OTP;
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const response = await fetch(`${base}/auth/mock-phone/start-link`, {
      method: 'POST', headers: { origin: 'http://127.0.0.1:9091', 'content-type': 'application/json', 'x-role': 'customer' },
      body: JSON.stringify({ phone: '010-1234-5678' }),
    });
    assert.equal(response.status, 404);
    process.env.ENABLE_MOCK_OTP = '1';
    const unauthenticated = await fetch(`${base}/auth/mock-phone/start-link`, {
      method: 'POST', headers: { origin: 'http://127.0.0.1:9091', 'content-type': 'application/json', 'x-role': 'customer' },
      body: JSON.stringify({ phone: '010-1234-5678' }),
    });
    assert.equal(unauthenticated.status, 401);
  } finally {
    if (before === undefined) delete process.env.ENABLE_MOCK_OTP;
    else process.env.ENABLE_MOCK_OTP = before;
    await app.close();
  }
});
