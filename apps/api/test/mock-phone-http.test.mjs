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

test('production never exposes the mock challenge even if its toggle is accidentally set', async () => {
  const previousMode = process.env.NODE_ENV;
  const previousToggle = process.env.ENABLE_MOCK_OTP;
  process.env.NODE_ENV = 'production';
  process.env.ENABLE_MOCK_OTP = '1';
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const response = await fetch(`${base}/auth/mock-phone/start-link`, {
      method: 'POST', headers: { origin: 'http://127.0.0.1:9091', 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '010-1234-5678' }),
    });
    assert.equal(response.status, 404);
    const entry = await fetch(`${base}/auth/mock-phone/start`, {
      method: 'POST', headers: { origin: 'http://127.0.0.1:9091', 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '010-1234-5678', action: 'signup' }),
    });
    assert.equal(entry.status, 404);
  } finally {
    await app.close();
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
    if (previousToggle === undefined) delete process.env.ENABLE_MOCK_OTP;
    else process.env.ENABLE_MOCK_OTP = previousToggle;
  }
});

test('development mock permits an anonymous phone entry challenge without creating an account yet', async () => {
  const previous = process.env.ENABLE_MOCK_OTP;
  process.env.ENABLE_MOCK_OTP = '1';
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const response = await fetch(`${base}/auth/mock-phone/start`, {
      method: 'POST', headers: { origin: 'http://127.0.0.1:9091', 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '010-1234-5678', action: 'signup' }),
    });
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.mockOnly, true);
    assert.match(result.testCode, /^\d{6}$/);
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.ENABLE_MOCK_OTP;
    else process.env.ENABLE_MOCK_OTP = previous;
  }
});

test('mock OTP stays closed when the API is configured to bind a public interface', async () => {
  const previousToggle = process.env.ENABLE_MOCK_OTP;
  const previousHost = process.env.API_HOST;
  process.env.ENABLE_MOCK_OTP = '1';
  process.env.API_HOST = '0.0.0.0';
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const response = await fetch(`${base}/auth/mock-phone/start`, {
      method: 'POST', headers: { origin: 'http://127.0.0.1:9091', 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '010-1234-5678', action: 'signup' }),
    });
    assert.equal(response.status, 404);
  } finally {
    await app.close();
    if (previousToggle === undefined) delete process.env.ENABLE_MOCK_OTP;
    else process.env.ENABLE_MOCK_OTP = previousToggle;
    if (previousHost === undefined) delete process.env.API_HOST;
    else process.env.API_HOST = previousHost;
  }
});
