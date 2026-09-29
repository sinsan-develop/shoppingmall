import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { qaNames, runQaFixture, validateQaRunId } from '../scripts/qa-fixture.ts';
import { ShippingPolicies } from '../src/shipping/service.ts';

test('QA fixture names are deterministic and cannot target broad data', () => {
  assert.equal(validateQaRunId('A1B2C3D4'), 'a1b2c3d4');
  assert.equal(qaNames('a1b2c3d4').sellerA, 'qa-a1b2c3d4-seller-a');
  for (const unsafe of ['', 'qa', 'main', '*', '../a', 'a1b2c3d4/']) {
    assert.throws(() => validateQaRunId(unsafe));
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
