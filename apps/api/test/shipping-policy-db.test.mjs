import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { AuthRepository } from '../src/auth/repository.ts';
import { ShippingPolicies } from '../src/shipping/service.ts';

test('seller shipping request changes only its seller after operator approval and global locks still win', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = randomUUID().slice(0, 8);
  const accounts = [];
  let categoryId;
  let sellerA;
  let sellerB;
  let firstRequestId;
  let secondRequestId;
  let originalGlobal;
  try {
    originalGlobal = (await pool.query(`SELECT fee_won,free_threshold_won,cutoff_time,
      blocked_postal_ranges,locked_fee,locked_threshold,locked_cutoff,
      updated_by_account_id,updated_at::text AS updated_at FROM shipping_policy_global WHERE id=1`)).rows[0];
    assert.ok(originalGlobal, 'Global shipping policy is required');
    await pool.query(`UPDATE shipping_policy_global SET fee_won=3000,free_threshold_won=50000,
      cutoff_time=NULL,blocked_postal_ranges='[]'::jsonb,locked_fee=false,locked_threshold=false,
      locked_cutoff=false,updated_by_account_id=NULL,updated_at=now() WHERE id=1`);
    const auth = new AuthRepository(pool);
    for (let index = 0; index < 3; index++) {
      accounts.push(await auth.createCustomerAccount(`qa+${randomUUID()}@example.invalid`, 'test-only-password-12345'));
    }
    categoryId = (await pool.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id', [`qa-${suffix}-group`])).rows[0].id;
    sellerA = (await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [categoryId, `qa-${suffix}-a`])).rows[0].id;
    sellerB = (await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [categoryId, `qa-${suffix}-b`])).rows[0].id;
    const service = new ShippingPolicies(pool);
    const seller = { accountId: accounts[0], role: 'seller', sellerId: sellerA };
    const foreign = { accountId: accounts[1], role: 'seller', sellerId: sellerB };
    const admin = { accountId: accounts[2], role: 'admin' };
    const requested = { feeWon: 2000, freeThresholdWon: 60000, cutoffTime: '15:30',
      blockedPostalRanges: [{ start: '63100', end: '63199' }] };
    assert.equal((await service.getEffective(sellerA)).policy.feeWon, 3000);
    await assert.rejects(service.updateGlobal(seller, requested, {}), /Forbidden/);
    await assert.rejects(service.requestSeller(admin, requested), /Forbidden/);
    const first = await service.requestSeller(seller, requested);
    firstRequestId = first.requestId;
    assert.equal((await service.getEffective(sellerA)).policy.feeWon, 3000);
    assert.equal((await service.getEffective(sellerB)).policy.feeWon, 3000);
    assert.deepEqual((await service.listOwn(seller)).map(({ id }) => id), [firstRequestId]);
    assert.deepEqual(await service.listOwn(foreign), []);
    assert.equal((await service.listPending(admin)).some(({ id }) => id === firstRequestId), true);
    await assert.rejects(service.requestSeller(seller, requested), /Pending shipping request exists/);
    await assert.rejects(service.approve(foreign, firstRequestId), /Forbidden/);
    await service.approve(admin, firstRequestId);
    assert.equal((await service.getEffective(sellerA)).policy.feeWon, 2000);
    assert.equal((await service.getEffective(sellerA)).policy.freeThresholdWon, 60000);
    assert.equal((await service.getEffective(sellerB)).policy.feeWon, 3000);
    await assert.rejects(service.approve(admin, firstRequestId), /Pending shipping request required/);
    const global = { feeWon: 4000, freeThresholdWon: 50000, cutoffTime: '13:00',
      blockedPostalRanges: [{ start: '63000', end: '63099' }] };
    await service.updateGlobal(admin, global, { feeWon: true });
    assert.deepEqual((await service.getEffective(sellerA)).policy, {
      feeWon: 4000, freeThresholdWon: 60000, cutoffTime: '15:30',
      blockedPostalRanges: [{ start: '63000', end: '63199' }],
    });
    assert.deepEqual((await service.getEffective(sellerB)).policy, global);
    const second = await service.requestSeller(seller, { ...requested, freeThresholdWon: 70000 });
    secondRequestId = second.requestId;
    await service.reject(admin, secondRequestId, '시험 정책 보류');
    assert.equal((await service.getEffective(sellerA)).policy.freeThresholdWon, 60000);
    const audit = await pool.query('SELECT action FROM audit_events WHERE actor_account_id = ANY($1::uuid[])', [accounts]);
    for (const action of ['shipping.request', 'shipping.approve', 'shipping.global_update', 'shipping.reject']) {
      assert.equal(audit.rows.some((row) => row.action === action), true);
    }
  } finally {
    if (originalGlobal) await pool.query(`UPDATE shipping_policy_global SET fee_won=$1,
      free_threshold_won=$2,cutoff_time=$3,blocked_postal_ranges=$4::jsonb,
      locked_fee=$5,locked_threshold=$6,locked_cutoff=$7,updated_by_account_id=$8,
      updated_at=$9 WHERE id=1`, [originalGlobal.fee_won, originalGlobal.free_threshold_won,
      originalGlobal.cutoff_time, JSON.stringify(originalGlobal.blocked_postal_ranges),
      originalGlobal.locked_fee, originalGlobal.locked_threshold, originalGlobal.locked_cutoff,
      originalGlobal.updated_by_account_id, originalGlobal.updated_at]);
    if (accounts.length) await pool.query('DELETE FROM audit_events WHERE actor_account_id = ANY($1::uuid[])', [accounts]);
    if (sellerA) await pool.query('DELETE FROM seller_shipping_policies WHERE seller_id=$1', [sellerA]);
    for (const requestId of [secondRequestId, firstRequestId]) {
      if (requestId) await pool.query('DELETE FROM seller_shipping_policy_requests WHERE id=$1', [requestId]);
    }
    for (const sellerId of [sellerB, sellerA]) {
      if (sellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [sellerId]);
    }
    if (categoryId) await pool.query('DELETE FROM seller_categories WHERE id=$1', [categoryId]);
    for (const accountId of accounts) {
      await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    }
    await pool.end();
  }
});
