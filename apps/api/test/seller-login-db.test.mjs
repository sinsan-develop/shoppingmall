import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { runQaFixture, qaNames } from '../scripts/qa-fixture.ts';
import { AuthRepository } from '../src/auth/repository.ts';
import { createApp } from '../src/app.ts';

test('a multi-role account keeps seller scope and admin HTTP permissions separate', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomBytes(4).toString('hex');
  const password = 'test-only-password-12345';
  const names = qaNames(runId);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const auth = new AuthRepository(pool);
  let app;
  try {
    await runQaFixture('seed', runId, process.env.DATABASE_URL, password);
    const sellerA = await auth.loginEmail(names.emails[1], password, 'seller');
    const sellerB = await auth.loginEmail(names.emails[2], password, 'seller');
    const a = await auth.getSession(sellerA.token);
    const b = await auth.getSession(sellerB.token);
    assert.equal(a.role, 'seller');
    assert.notEqual(a.sellerId, b.sellerId);
    await assert.rejects(auth.loginEmail(names.emails[1], password, 'seller', b.sellerId));
    const admin = await auth.loginEmail(names.emails[4], password, 'admin');
    assert.equal((await auth.getSession(admin.token)).role, 'admin');
    const adminAccount = await pool.query('SELECT account_id FROM account_identities WHERE identifier = $1', [names.emails[4]]);
    await pool.query('INSERT INTO account_roles (account_id, role, seller_id) VALUES ($1, $2, $3), ($1, $2, $4)',
      [adminAccount.rows[0].account_id, 'seller', a.sellerId, b.sellerId]);
    await assert.rejects(auth.loginEmail(names.emails[4], password, 'seller'));
    const selected = await auth.loginEmail(names.emails[4], password, 'seller', a.sellerId);
    assert.equal((await auth.getSession(selected.token)).sellerId, a.sellerId);
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}/catalog`;
    const adminCookie = `sm_session=${admin.token}`;
    const sellerCookie = `sm_session=${selected.token}`;
    assert.equal((await fetch(`${base}/admin/proposals`, { headers: { cookie: adminCookie } })).status, 200);
    assert.equal((await fetch(`${base}/seller/products`, { headers: { cookie: sellerCookie } })).status, 200);
    assert.equal((await fetch(`${base}/admin/proposals`, {
      headers: { cookie: sellerCookie, 'x-role': 'admin' },
    })).status, 403);
    assert.equal((await fetch(`${base}/seller/products`, {
      headers: { cookie: adminCookie, 'x-role': 'seller' },
    })).status, 403);
  } finally {
    if (app) await app.close();
    await runQaFixture('reset', runId, process.env.DATABASE_URL);
    await pool.end();
  }
});
