import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
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
  let app;
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
    await pool.query('INSERT INTO account_roles(account_id,role,seller_id) VALUES ($1,$2,$3)', [sellerAccountId, 'seller', sellerId]);
    await pool.query('INSERT INTO account_roles(account_id,role) VALUES ($1,$2)', [adminAccountId, 'admin']);
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
    const ownedOptions = await inventory.listOwned(seller);
    assert.deepEqual(ownedOptions.filter((item) => item.optionId === optionId), [{
      optionId, productId, title: '시험 고추', optionName: '500g', onHand: 4,
      sellable: 0, pendingRequestId: reopen.requestId,
    }]);
    assert.equal((await inventory.listOwned(other)).some((item) => item.optionId === optionId), false);
    await assert.rejects(inventory.listPending(seller), /Forbidden/);
    assert.equal((await inventory.listPending(admin)).some((item) => item.requestId === reopen.requestId), true);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1', [optionId])).rows[0].n, 3);
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const origin = 'http://127.0.0.1:9091';
    const login = async (accountId, role) => {
      const email = (await pool.query('SELECT identifier FROM account_identities WHERE account_id=$1 AND kind=$2', [accountId, 'email'])).rows[0].identifier;
      const response = await fetch(`${base}/auth/login`, { method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'test-only-password-12345', role }),
      });
      assert.equal(response.status, 201);
      return response.headers.get('set-cookie').split(';')[0];
    };
    const sellerCookie = await login(sellerAccountId, 'seller');
    const adminCookie = await login(adminAccountId, 'admin');
    const sellerStock = await fetch(`${base}/catalog/seller/stock`, { headers: { cookie: sellerCookie } });
    assert.equal(sellerStock.status, 200);
    assert.equal((await sellerStock.json()).some((item) => item.optionId === optionId), true);
    const stockUrl = `${base}/catalog/seller/options/${optionId}/stock`;
    const stockWrite = (quantity, requestOrigin = origin) => fetch(stockUrl, { method: 'POST',
      headers: { origin: requestOrigin, cookie: sellerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ quantity }),
    });
    assert.equal((await stockWrite(0, 'https://untrusted.invalid')).status, 403);
    assert.equal((await stockWrite(-1)).status, 400);
    const zero = await stockWrite(0);
    assert.equal(zero.status, 201);
    assert.equal((await zero.json()).sellable, 0);
    const httpIncrease = await stockWrite(7);
    assert.equal(httpIncrease.status, 201);
    const httpRequestId = (await httpIncrease.json()).requestId;
    const pendingResponse = await fetch(`${base}/catalog/admin/stock-requests`, { headers: { cookie: adminCookie } });
    assert.equal(pendingResponse.status, 200);
    assert.equal((await pendingResponse.json()).some((item) => item.requestId === httpRequestId), true);
    const approvalUrl = `${base}/catalog/admin/stock-requests/${httpRequestId}/approve`;
    const approval = (cookie) => fetch(approvalUrl, { method: 'POST',
      headers: { origin, cookie, 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal((await approval(sellerCookie)).status, 403);
    const httpApproved = await approval(adminCookie);
    assert.equal(httpApproved.status, 201);
    assert.equal((await httpApproved.json()).sellable, 7);
    assert.equal((await approval(adminCookie)).status, 409);
  } finally {
    if (app) await app.close();
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
    for (const accountId of [sellerAccountId, adminAccountId]) {
      if (!accountId) continue;
      await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    }
    if (otherSellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [otherSellerId]);
    if (sellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [sellerId]);
    if (sellerCategoryId) await pool.query('DELETE FROM seller_categories WHERE id=$1', [sellerCategoryId]);
    await pool.end();
  }
});
