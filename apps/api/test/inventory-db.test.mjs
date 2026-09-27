import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { AuthRepository } from '../src/auth/repository.ts';
import { InventoryService } from '../src/inventory/service.ts';

test('stock writes require the seller or operator role before any database access', async () => {
  const inventory = new InventoryService(null);
  await assert.rejects(inventory.setStock({ accountId: randomUUID(), role: 'customer' }, randomUUID(), 1), /Forbidden/);
  await assert.rejects(inventory.approveIncrease({ accountId: randomUUID(), role: 'seller', sellerId: randomUUID() }, randomUUID()), /Forbidden/);
});

test('seller can close stock immediately but only an operator releases an increase', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = randomUUID().slice(0, 8);
  let sellerAccountId, adminAccountId, sellerCategoryId, sellerId, otherSellerId;
  let majorId, minorId, productId, revisionId, optionId;
  try {
    const auth = new AuthRepository(pool);
    sellerAccountId = await auth.createCustomerAccount(`qa+${randomUUID()}@example.invalid`, 'test-only-password-12345');
    adminAccountId = await auth.createCustomerAccount(`qa+${randomUUID()}@example.invalid`, 'test-only-password-12345');
    sellerCategoryId = (await pool.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id', [`qa-${suffix}-group`])).rows[0].id;
    sellerId = (await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id', [sellerCategoryId, `qa-${suffix}-seller`])).rows[0].id;
    otherSellerId = (await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id', [sellerCategoryId, `qa-${suffix}-other`])).rows[0].id;
    majorId = (await pool.query('INSERT INTO product_categories(name) VALUES ($1) RETURNING id', [`qa-${suffix}-major`])).rows[0].id;
    minorId = (await pool.query('INSERT INTO product_categories(parent_id,name) VALUES ($1,$2) RETURNING id', [majorId, `qa-${suffix}-minor`])).rows[0].id;
    productId = (await pool.query('INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id', [sellerId, minorId])).rows[0].id;
    revisionId = (await pool.query(`INSERT INTO product_revisions(product_id,version,title,description,origin_label,shipping_mode,status,proposed_by_account_id)
      VALUES ($1,1,'시험 고추','재고 시험','전국','seller_direct','draft',$2) RETURNING id`, [productId, sellerAccountId])).rows[0].id;
    optionId = (await pool.query('INSERT INTO product_options(revision_id,name,price_won) VALUES ($1,$2,$3) RETURNING id', [revisionId, '500g', 23000])).rows[0].id;
    const inventory = new InventoryService(pool);
    const seller = { accountId: sellerAccountId, role: 'seller', sellerId };
    const other = { accountId: sellerAccountId, role: 'seller', sellerId: otherSellerId };
    const admin = { accountId: adminAccountId, role: 'admin' };
    await assert.rejects(inventory.setStock(other, optionId, 10), /Forbidden/);
    await assert.rejects(inventory.setStock(admin, optionId, 10), /Forbidden/);
    await assert.rejects(inventory.setStock(seller, optionId, -1), /Invalid stock/);
    const increase = await inventory.setStock(seller, optionId, 10);
    assert.equal(increase.sellable, 0);
    assert.equal(increase.onHand, 10);
    assert.ok(increase.requestId);
    assert.equal((await pool.query('SELECT sellable_quantity FROM inventory_levels WHERE option_id=$1', [optionId])).rows[0].sellable_quantity, 0);
    await assert.rejects(inventory.approveIncrease(seller, increase.requestId), /Forbidden/);
    const approved = await inventory.approveIncrease(admin, increase.requestId);
    assert.equal(approved.sellable, 10);
    await assert.rejects(inventory.approveIncrease(admin, increase.requestId), /Pending stock request required/);
    const closed = await inventory.setStock(seller, optionId, 0);
    assert.equal(closed.sellable, 0);
    assert.equal(closed.onHand, 0);
    assert.equal(closed.requestId, null);
    const reopen = await inventory.setStock(seller, optionId, 4);
    assert.equal(reopen.sellable, 0);
    assert.ok(reopen.requestId);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1', [optionId])).rows[0].n, 3);
  } finally {
    if (optionId) {
      await pool.query('DELETE FROM stock_change_requests WHERE option_id=$1', [optionId]);
      await pool.query('DELETE FROM inventory_levels WHERE option_id=$1', [optionId]);
    }
    if (sellerAccountId && adminAccountId) await pool.query('DELETE FROM audit_events WHERE actor_account_id = ANY($1::uuid[])', [[sellerAccountId, adminAccountId]]);
    if (optionId) await pool.query('DELETE FROM product_options WHERE id=$1', [optionId]);
    if (revisionId) await pool.query('DELETE FROM product_revisions WHERE id=$1', [revisionId]);
    if (productId) await pool.query('DELETE FROM products WHERE id=$1', [productId]);
    if (minorId) await pool.query('DELETE FROM product_categories WHERE id=$1', [minorId]);
    if (majorId) await pool.query('DELETE FROM product_categories WHERE id=$1', [majorId]);
    if (otherSellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [otherSellerId]);
    if (sellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [sellerId]);
    if (sellerCategoryId) await pool.query('DELETE FROM seller_categories WHERE id=$1', [sellerCategoryId]);
    for (const accountId of [sellerAccountId, adminAccountId]) {
      if (!accountId) continue;
      await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    }
    await pool.end();
  }
});
