import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { AuthRepository } from '../src/auth/repository.ts';

test('seller zero closes new sales but preserves active holds until the last release', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  const ids = {};
  const name = `qa-${randomUUID().slice(0, 8)}-stock-hold`;
  let app;
  try {
    ids.customerA = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    ids.customerB = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    ids.customerC = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    ids.sellerAccount = await new AuthRepository(pool).createCustomerAccount(
      `qa+${randomUUID()}@example.invalid`, 'test-only-password-12345');
    ids.sellerCategory = (await pool.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id',
      [name])).rows[0].id;
    ids.seller = (await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [ids.sellerCategory, name])).rows[0].id;
    await pool.query('INSERT INTO account_roles(account_id,role,seller_id) VALUES ($1,$2,$3)',
      [ids.sellerAccount, 'seller', ids.seller]);
    ids.category = (await pool.query('INSERT INTO product_categories(name) VALUES ($1) RETURNING id',
      [name])).rows[0].id;
    ids.product = (await pool.query('INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
      [ids.seller, ids.category])).rows[0].id;
    ids.revision = (await pool.query(
      `INSERT INTO product_revisions(product_id,version,title,description,origin_label,
       shipping_mode,status,proposed_by_account_id,reviewed_by_account_id,reviewed_at)
       VALUES ($1,1,$2,'QA 설명','QA 산지','seller_direct','approved',$3,$3,now()) RETURNING id`,
      [ids.product, name, ids.sellerAccount],
    )).rows[0].id;
    ids.option = (await pool.query(
      'INSERT INTO product_options(revision_id,name,price_won) VALUES ($1,$2,23000) RETURNING id',
      [ids.revision, '500g'],
    )).rows[0].id;
    await pool.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,3,3)',
      [ids.option]);
    await pool.query('INSERT INTO product_publications(product_id,revision_id,published_by_account_id) VALUES ($1,$2,$3)',
      [ids.product, ids.revision, ids.sellerAccount]);
    await pool.query(`INSERT INTO customer_cart_items(account_id,option_id,quantity)
      VALUES ($1,$4,2),($2,$4,1),($3,$4,1)`,
    [ids.customerA, ids.customerB, ids.customerC, ids.option]);

    const { CheckoutReservations } = await import('../src/checkout/reservation-service.ts');
    const { InventoryService } = await import('../src/inventory/service.ts');
    const reservations = new CheckoutReservations(pool);
    const inventory = new InventoryService(pool);
    const seller = { accountId: ids.sellerAccount, role: 'seller', sellerId: ids.seller };
    const other = { ...seller, sellerId: randomUUID() };
    const heldA = await reservations.start(ids.customerA, randomUUID());
    const heldB = await reservations.start(ids.customerB, randomUUID());
    await assert.rejects(inventory.setStock(other, ids.option, 0), /Forbidden/);
    await assert.rejects(inventory.setStock(seller, ids.option, 2), /Active reservation stock conflict/);
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const origin = 'http://127.0.0.1:9091';
    const login = await fetch(`${base}/auth/login`, { method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: (await pool.query(
        `SELECT identifier FROM account_identities WHERE account_id=$1 AND kind='email'`,
        [ids.sellerAccount])).rows[0].identifier, password: 'test-only-password-12345', role: 'seller' }),
    });
    assert.equal(login.status, 201);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const conflict = await fetch(`${base}/catalog/seller/options/${ids.option}/stock`, { method: 'POST',
      headers: { origin, cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: 2 }),
    });
    assert.equal(conflict.status, 409);
    assert.deepEqual((await pool.query(
      'SELECT on_hand_quantity,sellable_quantity FROM inventory_levels WHERE option_id=$1',
      [ids.option])).rows[0], { on_hand_quantity: 3, sellable_quantity: 3 });

    const closed = await inventory.setStock(seller, ids.option, 0);
    assert.equal(closed.sellable, 0);
    assert.equal(closed.onHand, 3);
    const pending = await pool.query(
      `SELECT id,target_on_hand,status FROM inventory_deferred_stock_targets
       WHERE option_id=$1 AND status='pending'`, [ids.option],
    );
    assert.equal(pending.rowCount, 1);
    assert.equal(pending.rows[0].target_on_hand, 0);
    const sellerStock = (await inventory.listOwned(seller)).find((item) => item.optionId === ids.option);
    assert.equal(sellerStock.activeReservationQuantity, 3);
    assert.equal(sellerStock.deferredZeroPending, true);
    await assert.rejects(reservations.start(ids.customerC, randomUUID()), /Insufficient stock/);
    assert.equal((await reservations.get(ids.customerA, heldA.id)).status, 'ACTIVE');
    assert.equal((await reservations.get(ids.customerB, heldB.id)).status, 'ACTIVE');

    await reservations.release(ids.customerA, heldA.id);
    assert.deepEqual((await pool.query(
      'SELECT on_hand_quantity,sellable_quantity FROM inventory_levels WHERE option_id=$1',
      [ids.option])).rows[0], { on_hand_quantity: 3, sellable_quantity: 0 });
    assert.equal((await pool.query(
      `SELECT status FROM inventory_deferred_stock_targets WHERE id=$1`, [pending.rows[0].id])).rows[0].status,
    'pending');
    await reservations.release(ids.customerB, heldB.id);
    assert.deepEqual((await pool.query(
      'SELECT on_hand_quantity,sellable_quantity FROM inventory_levels WHERE option_id=$1',
      [ids.option])).rows[0], { on_hand_quantity: 0, sellable_quantity: 0 });
    assert.equal((await pool.query(
      `SELECT status FROM inventory_deferred_stock_targets WHERE id=$1`, [pending.rows[0].id])).rows[0].status,
    'applied');
    const finishedStock = (await inventory.listOwned(seller)).find((item) => item.optionId === ids.option);
    assert.equal(finishedStock.activeReservationQuantity, 0);
    assert.equal(finishedStock.deferredZeroPending, false);

    // The seller's zero entry and a new checkout must serialize without losing a winning hold.
    await pool.query('UPDATE inventory_levels SET on_hand_quantity=1,sellable_quantity=1 WHERE option_id=$1',
      [ids.option]);
    const race = await Promise.allSettled([
      reservations.start(ids.customerC, randomUUID()), inventory.setStock(seller, ids.option, 0),
    ]);
    assert.equal(race[1].status, 'fulfilled');
    if (race[0].status === 'fulfilled') {
      const during = (await pool.query(
        'SELECT on_hand_quantity,sellable_quantity FROM inventory_levels WHERE option_id=$1',
        [ids.option])).rows[0];
      assert.equal(during.on_hand_quantity, 1);
      assert.equal(during.sellable_quantity, 0);
      await reservations.release(ids.customerC, race[0].value.id);
    } else {
      assert.match(race[0].reason.message, /Insufficient stock/);
    }
    assert.deepEqual((await pool.query(
      'SELECT on_hand_quantity,sellable_quantity FROM inventory_levels WHERE option_id=$1',
      [ids.option])).rows[0], { on_hand_quantity: 0, sellable_quantity: 0 });
  } finally {
    if (app) await app.close();
    if (ids.option) await pool.query('DELETE FROM inventory_deferred_stock_targets WHERE option_id=$1', [ids.option]);
    if (ids.option) await pool.query('DELETE FROM stock_change_requests WHERE option_id=$1', [ids.option]);
    for (const accountId of [ids.customerA, ids.customerB, ids.customerC, ids.sellerAccount]) {
      if (!accountId) continue;
      await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [accountId]);
      await pool.query('DELETE FROM customer_cart_items WHERE account_id=$1', [accountId]);
    }
    const accountIds = [ids.customerA, ids.customerB, ids.customerC].filter(Boolean);
    if (accountIds.length) {
      await pool.query(`DELETE FROM checkout_reservation_lines WHERE reservation_id IN
        (SELECT id FROM checkout_reservations WHERE account_id=ANY($1::uuid[]))`, [accountIds]);
      await pool.query('DELETE FROM checkout_reservations WHERE account_id=ANY($1::uuid[])', [accountIds]);
    }
    if (ids.product) await pool.query('DELETE FROM product_publications WHERE product_id=$1', [ids.product]);
    if (ids.option) await pool.query('DELETE FROM inventory_levels WHERE option_id=$1', [ids.option]);
    if (ids.option) await pool.query('DELETE FROM product_options WHERE id=$1', [ids.option]);
    if (ids.revision) await pool.query('DELETE FROM product_revisions WHERE id=$1', [ids.revision]);
    if (ids.product) await pool.query('DELETE FROM products WHERE id=$1', [ids.product]);
    if (ids.category) await pool.query('DELETE FROM product_categories WHERE id=$1', [ids.category]);
    for (const accountId of [ids.customerA, ids.customerB, ids.customerC, ids.sellerAccount]) {
      if (accountId) await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
      if (accountId) await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
      if (accountId) await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
      if (accountId) await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    }
    if (ids.seller) await pool.query('DELETE FROM sellers WHERE id=$1', [ids.seller]);
    if (ids.sellerCategory) await pool.query('DELETE FROM seller_categories WHERE id=$1', [ids.sellerCategory]);
    await pool.end();
  }
});
