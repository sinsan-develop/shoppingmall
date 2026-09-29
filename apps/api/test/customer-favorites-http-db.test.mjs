import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { AuthRepository } from '../src/auth/repository.ts';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaPublicFixture } from '../scripts/qa-public-fixture.ts';

const origin = 'http://127.0.0.1:9091';
const password = 'test-only-password-12345';

test('customer HTTP favorites are account-scoped, idempotent, origin-checked and audited', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomBytes(4).toString('hex');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const names = qaNames(runId);
  let app;
  let productId;
  let otherAccountId;
  try {
    ({ productId } = await runQaPublicFixture('seed', runId, process.env.DATABASE_URL, password));
    const otherEmail = `qa+${runId}-other-customer@example.invalid`;
    otherAccountId = await new AuthRepository(pool).createCustomerAccount(otherEmail, password);
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    async function cookieFor(email, role) {
      const response = await fetch(`${base}/auth/login`, { method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });
      assert.equal(response.status, 201);
      return response.headers.get('set-cookie')?.split(';')[0];
    }
    const customer = await cookieFor(names.emails[0], 'customer');
    const other = await cookieFor(otherEmail, 'customer');
    const seller = await cookieFor(names.emails[1], 'seller');
    const admin = await cookieFor(names.emails[4], 'admin');
    const path = `${base}/customer/favorites`;
    const item = `${path}/${productId}`;
    const headers = { cookie: customer, origin };
    const customerAccountId = (await pool.query(
      'SELECT account_id FROM account_identities WHERE kind=$1 AND identifier=$2', ['email', names.emails[0]],
    )).rows[0].account_id;

    assert.equal((await fetch(path, { headers: { cookie: customer } })).status, 200);
    assert.deepEqual(await (await fetch(path, { headers: { cookie: customer } })).json(), []);
    assert.equal((await fetch(path)).status, 401);
    assert.equal((await fetch(path, { headers: { cookie: seller } })).status, 403);
    assert.equal((await fetch(path, { headers: { cookie: admin } })).status, 403);
    assert.equal((await fetch(item, { method: 'PUT', headers: { cookie: customer, origin: 'http://invalid.test' } })).status, 403);
    assert.equal((await fetch(`${path}/invalid`, { method: 'PUT', headers })).status, 400);
    assert.equal((await fetch(`${path}/${randomUUID()}`, { method: 'PUT', headers })).status, 404);

    const unpublished = (await pool.query(
      'INSERT INTO products(seller_id,category_id) SELECT seller_id,category_id FROM products WHERE id=$1 RETURNING id',
      [productId],
    )).rows[0].id;
    assert.equal((await fetch(`${path}/${unpublished}`, { method: 'PUT', headers })).status, 404);

    const first = await fetch(item, { method: 'PUT', headers });
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { productId, favorite: true });
    assert.equal((await fetch(item, { method: 'PUT', headers })).status, 200);
    assert.equal((await fetch(path, { headers: { cookie: other } })).status, 200);
    assert.deepEqual(await (await fetch(path, { headers: { cookie: other } })).json(), []);
    const listed = await (await fetch(path, { headers: { cookie: customer } })).json();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].productId, productId);
    assert.equal(listed[0].saleStopped, false);
    assert.ok(listed[0].title.includes('chili'));

    const deleted = await fetch(item, { method: 'DELETE', headers });
    assert.equal(deleted.status, 200);
    assert.deepEqual(await deleted.json(), { productId, favorite: false });
    assert.equal((await fetch(item, { method: 'DELETE', headers })).status, 200);
    assert.deepEqual((await Promise.all([
      fetch(item, { method: 'PUT', headers }), fetch(item, { method: 'PUT', headers }),
    ])).map((response) => response.status).sort(), [200, 200]);
    const counts = await pool.query(
      `SELECT (SELECT count(*)::int FROM customer_favorites WHERE account_id=$1 AND product_id=$2) AS favorites,
              (SELECT count(*)::int FROM audit_events WHERE actor_account_id=$1
                AND target_type='product' AND target_id=$2::text AND action='customer.favorite_add') AS adds,
              (SELECT count(*)::int FROM audit_events WHERE actor_account_id=$1
                AND target_type='product' AND target_id=$2::text AND action='customer.favorite_remove') AS removes`,
      [customerAccountId, productId],
    );
    assert.deepEqual(counts.rows[0], { favorites: 1, adds: 2, removes: 1 });

    assert.equal((await fetch(item, { method: 'PUT', headers: { cookie: other, origin } })).status, 200);
    assert.equal((await (await fetch(path, { headers: { cookie: other } })).json()).length, 1);
    assert.equal((await (await fetch(path, { headers: { cookie: customer } })).json()).length, 1);
  } finally {
    if (app) await app.close();
    let resetError;
    if (productId) {
      try {
        await runQaPublicFixture('reset', runId, process.env.DATABASE_URL);
      } catch (error) {
        resetError = error;
        await pool.query('DELETE FROM customer_favorites WHERE product_id=$1', [productId]);
        await runQaPublicFixture('reset', runId, process.env.DATABASE_URL);
      }
    }
    if (otherAccountId) {
      await pool.query('DELETE FROM customer_favorites WHERE account_id=$1', [otherAccountId]);
      for (const table of ['audit_events', 'auth_sessions', 'account_roles', 'account_identities']) {
        await pool.query(`DELETE FROM ${table} WHERE ${table === 'audit_events' ? 'actor_account_id' : 'account_id'}=$1`,
          [otherAccountId]);
      }
      await pool.query('DELETE FROM accounts WHERE id=$1', [otherAccountId]);
    }
    await pool.end();
    if (resetError) throw resetError;
  }
});
