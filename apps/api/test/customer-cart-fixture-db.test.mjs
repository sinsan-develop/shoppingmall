import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { runQaFixture } from '../scripts/qa-fixture.ts';
import { runQaPublicFixture } from '../scripts/qa-public-fixture.ts';

test('public product reset removes its cart references before deleting option rows', {
  skip: !process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== '/shoppingmall',
}, async () => {
  const runId = randomUUID().slice(0, 8);
  const databaseUrl = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString: databaseUrl });
  let seeded = false;
  let accountId;
  let optionId;
  try {
    const product = await runQaPublicFixture('seed', runId, databaseUrl, 'test-only-password-12345');
    seeded = true;
    accountId = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [`qa+${runId}-customer@example.invalid`])).rows[0].account_id;
    optionId = (await pool.query('SELECT id FROM product_options WHERE revision_id=$1',
      [product.revisionId])).rows[0].id;
    await pool.query('INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,2)',
      [accountId, optionId]);
    await runQaPublicFixture('reset', runId, databaseUrl);
    seeded = false;
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM customer_cart_items WHERE account_id=$1',
      [accountId])).rows[0].total, 0);
  } finally {
    if (accountId && optionId) await pool.query(
      'DELETE FROM customer_cart_items WHERE account_id=$1 AND option_id=$2', [accountId, optionId]);
    await pool.end();
    if (seeded) await runQaPublicFixture('reset', runId, databaseUrl);
  }
});

test('account reset removes its cart row without deleting another run product', {
  skip: !process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== '/shoppingmall',
}, async () => {
  const productRun = randomUUID().slice(0, 8);
  const accountRun = randomUUID().slice(0, 8);
  const databaseUrl = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString: databaseUrl });
  let productSeeded = false;
  let accountSeeded = false;
  let accountId;
  let optionId;
  try {
    const product = await runQaPublicFixture('seed', productRun, databaseUrl, 'test-only-password-12345');
    productSeeded = true;
    await runQaFixture('seed', accountRun, databaseUrl, 'test-only-password-12345');
    accountSeeded = true;
    accountId = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [`qa+${accountRun}-customer@example.invalid`])).rows[0].account_id;
    optionId = (await pool.query('SELECT id FROM product_options WHERE revision_id=$1',
      [product.revisionId])).rows[0].id;
    await pool.query('INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,1)',
      [accountId, optionId]);
    await runQaFixture('reset', accountRun, databaseUrl);
    accountSeeded = false;
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM customer_cart_items WHERE account_id=$1',
      [accountId])).rows[0].total, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM product_options WHERE id=$1',
      [optionId])).rows[0].total, 1);
  } finally {
    if (accountId && optionId) await pool.query(
      'DELETE FROM customer_cart_items WHERE account_id=$1 AND option_id=$2', [accountId, optionId]);
    await pool.end();
    if (accountSeeded) await runQaFixture('reset', accountRun, databaseUrl);
    if (productSeeded) await runQaPublicFixture('reset', productRun, databaseUrl);
  }
});
