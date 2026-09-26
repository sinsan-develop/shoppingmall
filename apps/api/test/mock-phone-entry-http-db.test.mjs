import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';

test('development phone-only mock signup and login remain one customer account', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const previous = process.env.ENABLE_MOCK_OTP;
  process.env.ENABLE_MOCK_OTP = '1';
  const phone = `010${randomInt(10000000, 99999999)}`;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let app;
  try {
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const headers = { origin: 'http://127.0.0.1:9091', 'content-type': 'application/json' };
    const start = async (action) => {
      const response = await fetch(`${base}/auth/mock-phone/start`, {
        method: 'POST', headers, body: JSON.stringify({ phone, action }),
      });
      assert.equal(response.status, 201);
      return response.json();
    };
    const confirm = (action, challenge, code) => fetch(`${base}/auth/mock-phone/confirm`, {
      method: 'POST', headers,
      body: JSON.stringify({ phone, action, challengeId: challenge.challengeId, code }),
    });
    const signup = await start('signup');
    const wrongAction = await confirm('login', signup, signup.testCode);
    assert.equal(wrongAction.status, 401);
    const created = await confirm('signup', signup, signup.testCode);
    assert.equal(created.status, 201);
    const firstCookie = created.headers.get('set-cookie')?.split(';')[0];
    const first = await (await fetch(`${base}/auth/me`, { headers: { cookie: firstCookie } })).json();
    assert.equal(first.role, 'customer');
    const login = await start('login');
    const returned = await confirm('login', login, login.testCode);
    assert.equal(returned.status, 201);
    const secondCookie = returned.headers.get('set-cookie')?.split(';')[0];
    const second = await (await fetch(`${base}/auth/me`, { headers: { cookie: secondCookie } })).json();
    assert.equal(second.accountId, first.accountId);
    const duplicate = await start('signup');
    assert.equal((await confirm('signup', duplicate, duplicate.testCode)).status, 409);
  } finally {
    if (app) await app.close();
    const identity = await pool.query('SELECT account_id FROM account_identities WHERE kind = $1 AND identifier = $2', ['phone', phone]);
    if (identity.rows.length) {
      const accountId = identity.rows[0].account_id;
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
