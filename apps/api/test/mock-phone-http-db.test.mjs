import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { AuthRepository } from '../src/auth/repository.ts';

test('development mock OTP links a number only after its signed-in account verifies the challenge', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const previous = process.env.ENABLE_MOCK_OTP;
  process.env.ENABLE_MOCK_OTP = '1';
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const auth = new AuthRepository(pool);
  const email = `qa+${randomUUID()}@example.invalid`;
  const password = 'test-only-password-12345';
  const phone = `010${randomInt(10000000, 99999999)}`;
  let accountId;
  let app;
  try {
    accountId = await auth.createCustomerAccount(email, password);
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const origin = 'http://127.0.0.1:9091';
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 201);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    const headers = { cookie, origin, 'content-type': 'application/json' };
    const deniedOrigin = await fetch(`${base}/auth/mock-phone/start-link`, {
      method: 'POST', headers: { ...headers, origin: 'https://untrusted.invalid' },
      body: JSON.stringify({ phone }),
    });
    assert.equal(deniedOrigin.status, 403);
    const start = await fetch(`${base}/auth/mock-phone/start-link`, {
      method: 'POST', headers, body: JSON.stringify({ phone }),
    });
    assert.equal(start.status, 201);
    const challenge = await start.json();
    assert.equal(challenge.mockOnly, true);
    assert.match(challenge.testCode, /^\d{6}$/);
    const wrong = await fetch(`${base}/auth/mock-phone/confirm-link`, {
      method: 'POST', headers, body: JSON.stringify({ challengeId: challenge.challengeId, code: '000000' }),
    });
    if (challenge.testCode !== '000000') assert.equal(wrong.status, 401);
    const confirmed = await fetch(`${base}/auth/mock-phone/confirm-link`, {
      method: 'POST', headers,
      body: JSON.stringify({ challengeId: challenge.challengeId, code: challenge.testCode }),
    });
    assert.equal(confirmed.status, 201);
    assert.equal((await confirmed.json()).status, 'linked');
    const replay = await fetch(`${base}/auth/mock-phone/confirm-link`, {
      method: 'POST', headers,
      body: JSON.stringify({ challengeId: challenge.challengeId, code: challenge.testCode }),
    });
    assert.equal(replay.status, 401);
    const stored = await pool.query('SELECT account_id FROM account_identities WHERE kind = $1 AND identifier = $2',
      ['phone', phone]);
    assert.equal(stored.rows[0].account_id, accountId);
  } finally {
    if (app) await app.close();
    if (accountId) {
      for (const table of ['audit_events', 'auth_sessions', 'account_roles', 'account_identities']) {
        await pool.query(`DELETE FROM ${table} WHERE ${table === 'audit_events' ? 'actor_account_id' : 'account_id'} = $1`, [accountId]);
      }
      await pool.query('DELETE FROM accounts WHERE id = $1', [accountId]);
    }
    await pool.end();
    if (previous === undefined) delete process.env.ENABLE_MOCK_OTP;
    else process.env.ENABLE_MOCK_OTP = previous;
  }
});
