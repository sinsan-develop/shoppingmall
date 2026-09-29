import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { qaNames, runQaFixture, validateQaRunId } from '../scripts/qa-fixture.ts';
import { ShippingPolicies } from '../src/shipping/service.ts';
import { runQaPublicFixture } from '../scripts/qa-public-fixture.ts';

test('QA fixture names are deterministic and cannot target broad data', () => {
  assert.equal(validateQaRunId('A1B2C3D4'), 'a1b2c3d4');
  assert.equal(qaNames('a1b2c3d4').sellerA, 'qa-a1b2c3d4-seller-a');
  for (const unsafe of ['', 'qa', 'main', '*', '../a', 'a1b2c3d4/']) {
    assert.throws(() => validateQaRunId(unsafe));
  }
});

test('QA account reset removes only its engagement rows on another run product', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const accountRun = randomBytes(4).toString('hex');
  const productRun = randomBytes(4).toString('hex');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let accountSeeded = false;
  let productSeeded = false;
  try {
    await runQaFixture('seed', accountRun, process.env.DATABASE_URL, 'test-only-password-12345');
    accountSeeded = true;
    const { productId } = await runQaPublicFixture('seed', productRun, process.env.DATABASE_URL,
      'test-only-password-12345');
    productSeeded = true;
    const customer = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [qaNames(accountRun).emails[0]])).rows[0].account_id;
    await pool.query('INSERT INTO customer_favorites(account_id,product_id) VALUES ($1,$2)', [customer, productId]);
    await pool.query("INSERT INTO restock_subscriptions(account_id,product_id,option_name) VALUES ($1,$2,'500g')",
      [customer, productId]);
    await runQaFixture('reset', accountRun, process.env.DATABASE_URL);
    accountSeeded = false;
    const remaining = await pool.query(
      `SELECT (SELECT count(*)::int FROM customer_favorites WHERE account_id=$1) AS favorites,
              (SELECT count(*)::int FROM restock_subscriptions WHERE account_id=$1) AS restocks,
              (SELECT count(*)::int FROM products WHERE id=$2) AS products`, [customer, productId]);
    assert.deepEqual(remaining.rows[0], { favorites: 0, restocks: 0, products: 1 });
  } finally {
    if (productSeeded) await runQaPublicFixture('reset', productRun, process.env.DATABASE_URL);
    if (accountSeeded) await runQaFixture('reset', accountRun, process.env.DATABASE_URL);
    await pool.end();
  }
});

test('QA fixture creates five separate role accounts and resets only its own run', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomBytes(4).toString('hex');
  const names = qaNames(runId);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let sellerId;
  let requestId;
  try {
    await runQaFixture('seed', runId, process.env.DATABASE_URL, 'test-only-password-12345');
    const accounts = await pool.query(`
      SELECT i.identifier, r.role, r.seller_id FROM account_identities i
      JOIN account_roles r ON r.account_id = i.account_id
      WHERE i.identifier = ANY($1::text[]) ORDER BY i.identifier`, [names.emails]);
    assert.equal(accounts.rows.length, 5);
    assert.equal(accounts.rows.filter((row) => row.role === 'seller').length, 3);
    assert.equal(new Set(accounts.rows.filter((row) => row.role === 'seller').map((row) => row.seller_id)).size, 3);
    assert.equal(accounts.rows.filter((row) => row.role === 'admin').length, 1);
    const seller = accounts.rows.find((row) => row.identifier === names.emails[1]);
    sellerId = seller.seller_id;
    const sellerAccountId = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [names.emails[1]])).rows[0].account_id;
    const adminAccountId = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [names.emails[4]])).rows[0].account_id;
    requestId = (await new ShippingPolicies(pool).requestSeller({ accountId: sellerAccountId, role: 'seller', sellerId },
      { feeWon: 2000, freeThresholdWon: 50000, cutoffTime: null, blockedPostalRanges: [] })).requestId;
    await new ShippingPolicies(pool).approve({ accountId: adminAccountId, role: 'admin' }, requestId);
    await runQaFixture('reset', runId, process.env.DATABASE_URL);
  } finally {
    if (sellerId) await pool.query('DELETE FROM seller_shipping_policies WHERE seller_id=$1', [sellerId]);
    if (requestId) await pool.query('DELETE FROM seller_shipping_policy_requests WHERE id=$1', [requestId]);
    await runQaFixture('reset', runId, process.env.DATABASE_URL);
    const remaining = await pool.query('SELECT count(*)::int AS total FROM account_identities WHERE identifier = ANY($1::text[])', [names.emails]);
    assert.equal(remaining.rows[0].total, 0);
    await pool.end();
  }
});
