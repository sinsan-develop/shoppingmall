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

test('restock HTTP binds one active request to a published sold-out option name and its customer', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomBytes(4).toString('hex');
  const names = qaNames(runId);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let app;
  let productId;
  let otherAccountId;
  try {
    ({ productId } = await runQaPublicFixture('seed', runId, process.env.DATABASE_URL, password));
    const otherEmail = `qa+${runId}-restock-other@example.invalid`;
    otherAccountId = await new AuthRepository(pool).createCustomerAccount(otherEmail, password);
    const optionId = (await pool.query(
      `SELECT o.id FROM product_publications pub JOIN product_options o ON o.revision_id=pub.revision_id
       WHERE pub.product_id=$1 AND o.name='500g'`, [productId],
    )).rows[0].id;
    const customerAccountId = (await pool.query(
      'SELECT account_id FROM account_identities WHERE kind=$1 AND identifier=$2', ['email', names.emails[0]],
    )).rows[0].account_id;
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
    const path = `${base}/customer/restock-subscriptions`;
    const payload = { productId, optionId };
    const headers = { cookie: customer, origin, 'content-type': 'application/json' };
    const post = (data, h = headers) => fetch(path, { method: 'POST', headers: h, body: JSON.stringify(data) });

    assert.equal((await fetch(path, { headers: { cookie: customer } })).status, 200);
    assert.deepEqual(await (await fetch(path, { headers: { cookie: customer } })).json(), []);
    assert.equal((await fetch(path)).status, 401);
    assert.equal((await fetch(path, { headers: { cookie: seller } })).status, 403);
    assert.equal((await fetch(path, { headers: { cookie: admin } })).status, 403);
    assert.equal((await post(payload, { ...headers, origin: 'http://invalid.test' })).status, 403);
    assert.equal((await post({ productId: 'invalid', optionId })).status, 400);
    assert.equal((await post({ productId, optionId: randomUUID() })).status, 404);
    assert.equal((await post(payload)).status, 409); // still sellable

    await pool.query('UPDATE inventory_levels SET sellable_quantity=0 WHERE option_id=$1', [optionId]);
    const unpublished = (await pool.query(
      'INSERT INTO products(seller_id,category_id) SELECT seller_id,category_id FROM products WHERE id=$1 RETURNING id',
      [productId],
    )).rows[0].id;
    assert.equal((await post({ productId: unpublished, optionId })).status, 404);

    const [first, duplicate] = await Promise.all([post(payload), post(payload)]);
    assert.deepEqual([first.status, duplicate.status].sort(), [201, 201]);
    const firstBody = await first.json();
    const duplicateBody = await duplicate.json();
    assert.equal(firstBody.id, duplicateBody.id);
    assert.equal(firstBody.status, 'active');
    const listed = await (await fetch(path, { headers: { cookie: customer } })).json();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, firstBody.id);
    assert.equal(listed[0].productId, productId);
    assert.equal(listed[0].optionName, '500g');
    assert.equal(listed[0].optionState, 'sold_out');
    assert.deepEqual(await (await fetch(path, { headers: { cookie: other } })).json(), []);
    assert.equal((await fetch(`${path}/${firstBody.id}`, { method: 'DELETE',
      headers: { cookie: other, origin } })).status, 404);
    assert.equal((await fetch(`${path}/${firstBody.id}`, { method: 'DELETE',
      headers: { cookie: seller, origin } })).status, 403);

    const cancelled = await fetch(`${path}/${firstBody.id}`, { method: 'DELETE', headers });
    assert.equal(cancelled.status, 200);
    assert.deepEqual(await cancelled.json(), { id: firstBody.id, status: 'cancelled' });
    assert.equal((await fetch(`${path}/${firstBody.id}`, { method: 'DELETE', headers })).status, 200);
    const again = await post(payload);
    assert.equal(again.status, 201);
    const againBody = await again.json();
    assert.notEqual(againBody.id, firstBody.id);
    const counts = await pool.query(
      `SELECT (SELECT count(*)::int FROM restock_subscriptions WHERE account_id=$1 AND product_id=$2 AND status='active') AS active,
              (SELECT count(*)::int FROM restock_subscriptions WHERE account_id=$1 AND product_id=$2 AND status='cancelled') AS cancelled,
              (SELECT count(*)::int FROM audit_events WHERE actor_account_id=$1 AND target_type='restock_subscription'
                AND action='customer.restock_request') AS requests,
              (SELECT count(*)::int FROM audit_events WHERE actor_account_id=$1 AND target_type='restock_subscription'
                AND action='customer.restock_cancel') AS cancels`,
      [customerAccountId, productId],
    );
    assert.deepEqual(counts.rows[0], { active: 1, cancelled: 1, requests: 2, cancels: 1 });

    const publication = await pool.query('SELECT revision_id FROM product_publications WHERE product_id=$1', [productId]);
    const oldRevisionId = publication.rows[0].revision_id;
    const sellerAccountId = (await pool.query(
      'SELECT account_id FROM account_identities WHERE kind=$1 AND identifier=$2', ['email', names.emails[1]],
    )).rows[0].account_id;
    const adminAccountId = (await pool.query(
      'SELECT account_id FROM account_identities WHERE kind=$1 AND identifier=$2', ['email', names.emails[4]],
    )).rows[0].account_id;
    const newRevisionId = (await pool.query(
      `INSERT INTO product_revisions(product_id,version,title,description,origin_label,shipping_mode,status,
        proposed_by_account_id,reviewed_by_account_id,reviewed_at)
       SELECT product_id,2,title,description,origin_label,shipping_mode,'approved',$2,$3,now()
       FROM product_revisions WHERE id=$1 RETURNING id`, [oldRevisionId, sellerAccountId, adminAccountId],
    )).rows[0].id;
    const newOptionId = (await pool.query(
      "INSERT INTO product_options(revision_id,name,price_won) VALUES ($1,'500g',23000) RETURNING id",
      [newRevisionId],
    )).rows[0].id;
    await pool.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,0,0)', [newOptionId]);
    await pool.query('UPDATE product_publications SET revision_id=$2 WHERE product_id=$1', [productId, newRevisionId]);
    const carried = await (await fetch(path, { headers: { cookie: customer } })).json();
    assert.equal(carried.find((row) => row.id === againBody.id).optionState, 'sold_out');
    assert.equal(carried.find((row) => row.id === againBody.id).currentOptionId, newOptionId);

    await pool.query('UPDATE inventory_levels SET on_hand_quantity=5 WHERE option_id=$1', [newOptionId]);
    assert.equal((await pool.query('SELECT status FROM restock_subscriptions WHERE id=$1', [againBody.id])).rows[0].status, 'active');
    const thirdRevisionId = (await pool.query(
      `INSERT INTO product_revisions(product_id,version,title,description,origin_label,shipping_mode,status,
        proposed_by_account_id,reviewed_by_account_id,reviewed_at)
       SELECT product_id,3,title,description,origin_label,shipping_mode,'approved',$2,$3,now()
       FROM product_revisions WHERE id=$1 RETURNING id`, [newRevisionId, sellerAccountId, adminAccountId],
    )).rows[0].id;
    const thirdOptionId = (await pool.query(
      "INSERT INTO product_options(revision_id,name,price_won) VALUES ($1,'1kg',23000) RETURNING id",
      [thirdRevisionId],
    )).rows[0].id;
    await pool.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,0,0)', [thirdOptionId]);
    await pool.query('UPDATE product_publications SET revision_id=$2 WHERE product_id=$1', [productId, thirdRevisionId]);
    const missing = await (await fetch(path, { headers: { cookie: customer } })).json();
    assert.equal(missing.find((row) => row.id === againBody.id).optionState, 'missing');
    assert.equal(missing.find((row) => row.id === againBody.id).status, 'active');
    const stopId = (await pool.query(
      `INSERT INTO product_sale_stop_requests(product_id,status,reason,requested_by_account_id,decided_by_account_id,decided_at)
       VALUES ($1,'approved','가상 판매중지',$2,$3,now()) RETURNING id`,
      [productId, sellerAccountId, adminAccountId],
    )).rows[0].id;
    assert.ok(stopId);
    assert.equal((await post({ productId, optionId: thirdOptionId })).status, 409);
    const statuses = await pool.query('SELECT status FROM restock_subscriptions WHERE account_id=$1', [customerAccountId]);
    assert.deepEqual(statuses.rows.map((row) => row.status).sort(), ['active', 'cancelled']);
  } finally {
    if (app) await app.close();
    let resetError;
    if (productId) {
      try {
        await runQaPublicFixture('reset', runId, process.env.DATABASE_URL);
      } catch (error) {
        resetError = error;
        await pool.query('DELETE FROM restock_subscriptions WHERE product_id=$1', [productId]);
        await runQaPublicFixture('reset', runId, process.env.DATABASE_URL);
      }
    }
    if (otherAccountId) {
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
