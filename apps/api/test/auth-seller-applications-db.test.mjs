import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { AuthRepository } from '../src/auth/repository.ts';
import { submitSellerApplication, listSellerApplications,
  approveSellerApplication, rejectSellerApplication } from '../src/auth/seller-applications.ts';

const systemId = process.env.AUTH_ADMIN_TEST_DB_SYSTEM_ID;

test('only a buyer applies; an admin links an existing seller and records a single review', {
  skip: !systemId,
}, async () => {
  assert.equal(process.env.PGDATABASE, 'shoppingmall_auth_admin_1010');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const fixtureLock = await pool.connect();
  await fixtureLock.query("SELECT pg_advisory_lock(hashtext('auth-admin-qa-fixture'))");
  const system = await pool.query('SELECT system_identifier::text AS id FROM pg_control_system()');
  assert.equal(system.rows[0].id, systemId);
  const repository = new AuthRepository(pool);
  const password = 'isolated-seller-application-123';
  const customerEmail = `seller-customer+${randomUUID()}@example.invalid`;
  const rejectedEmail = `seller-rejected+${randomUUID()}@example.invalid`;
  const adminEmail = `seller-admin+${randomUUID()}@example.invalid`;
  const accountIds = [];
  let categoryId;
  let sellerId;
  let otherSellerId;
  try {
    const customerId = await repository.createCustomerAccount(customerEmail, password);
    const rejectedId = await repository.createCustomerAccount(rejectedEmail, password);
    const adminId = await repository.createCustomerAccount(adminEmail, password);
    accountIds.push(customerId, rejectedId, adminId);
    await pool.query("INSERT INTO account_roles(account_id,role) VALUES ($1,'admin')", [adminId]);
    const category = await pool.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id',
      [`qa-category-${randomUUID()}`]);
    categoryId = category.rows[0].id;
    const seller = await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [categoryId, 'QA Seller']);
    sellerId = seller.rows[0].id;
    const other = await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [categoryId, 'Other QA Seller']);
    otherSellerId = other.rows[0].id;

    const customer = await repository.getSession((await repository.loginEmail(customerEmail, password, 'customer')).token);
    const rejectedCustomer = await repository.getSession((await repository.loginEmail(rejectedEmail, password, 'customer')).token);
    const admin = await repository.getSession((await repository.loginEmail(adminEmail, password, 'admin')).token);
    await assert.rejects(submitSellerApplication(pool, admin, 'Not a buyer'), /customer/i);
    const submitted = await submitSellerApplication(pool, customer, 'QA Seller');
    assert.equal(submitted.status, 'pending');
    await assert.rejects(submitSellerApplication(pool, customer, 'Another'), /pending/i);
    await assert.rejects(listSellerApplications(pool, customer), /admin/i);
    assert.equal((await listSellerApplications(pool, admin)).some((item) => item.id === submitted.id), true);
    await assert.rejects(approveSellerApplication(pool, customer, submitted.id, sellerId), /admin/i);
    await assert.rejects(approveSellerApplication(pool, admin, submitted.id, randomUUID()), /seller/i);
    const outcomes = await Promise.allSettled([
      approveSellerApplication(pool, admin, submitted.id, sellerId),
      approveSellerApplication(pool, admin, submitted.id, sellerId),
    ]);
    assert.equal(outcomes.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter((item) => item.status === 'rejected').length, 1);
    const accepted = await pool.query('SELECT status,seller_id,reviewed_by_account_id FROM seller_applications WHERE id=$1',
      [submitted.id]);
    assert.deepEqual([accepted.rows[0].status, accepted.rows[0].seller_id, accepted.rows[0].reviewed_by_account_id],
      ['approved', sellerId, adminId]);
    const sellerLogin = await repository.loginEmail(customerEmail, password, 'seller', sellerId);
    assert.equal((await repository.getSession(sellerLogin.token)).sellerId, sellerId);
    await assert.rejects(repository.loginEmail(customerEmail, password, 'seller', otherSellerId), /Invalid credentials/);

    const rejected = await submitSellerApplication(pool, rejectedCustomer, 'Rejected QA Seller');
    await assert.rejects(rejectSellerApplication(pool, customer, rejected.id, 'No proof'), /admin/i);
    await rejectSellerApplication(pool, admin, rejected.id, 'Ownership not verified');
    const rejection = await pool.query('SELECT status,review_reason,reviewed_by_account_id FROM seller_applications WHERE id=$1',
      [rejected.id]);
    assert.deepEqual([rejection.rows[0].status, rejection.rows[0].review_reason,
      rejection.rows[0].reviewed_by_account_id], ['rejected', 'Ownership not verified', adminId]);
    await assert.rejects(approveSellerApplication(pool, admin, rejected.id, sellerId), /pending/i);
  } finally {
    if (accountIds.length) {
      await pool.query('DELETE FROM seller_applications WHERE account_id=ANY($1::uuid[])', [accountIds]);
      await pool.query('DELETE FROM audit_events WHERE actor_account_id=ANY($1::uuid[])', [accountIds]);
      await pool.query('DELETE FROM auth_sessions WHERE account_id=ANY($1::uuid[])', [accountIds]);
      await pool.query('DELETE FROM account_roles WHERE account_id=ANY($1::uuid[])', [accountIds]);
      await pool.query('DELETE FROM account_identities WHERE account_id=ANY($1::uuid[])', [accountIds]);
      await pool.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])', [accountIds]);
    }
    if (sellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [sellerId]);
    if (otherSellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [otherSellerId]);
    if (categoryId) await pool.query('DELETE FROM seller_categories WHERE id=$1', [categoryId]);
    await fixtureLock.query("SELECT pg_advisory_unlock(hashtext('auth-admin-qa-fixture'))");
    fixtureLock.release();
    await pool.end();
  }
});
