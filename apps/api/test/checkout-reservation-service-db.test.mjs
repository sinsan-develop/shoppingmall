import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

test('checkout reservations serialize the last unit, preserve keys and expire once', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const ids = {};
  const name = `qa-${randomUUID().slice(0, 8)}-reservation-service`;
  try {
    ids.accountA = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    ids.accountB = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    ids.sellerCategory = (await pool.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id',
      [name])).rows[0].id;
    ids.seller = (await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [ids.sellerCategory, name])).rows[0].id;
    ids.major = (await pool.query('INSERT INTO product_categories(name) VALUES ($1) RETURNING id',
      [name])).rows[0].id;
    ids.product = (await pool.query('INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
      [ids.seller, ids.major])).rows[0].id;
    ids.revision = (await pool.query(
      `INSERT INTO product_revisions(product_id,version,title,description,origin_label,
       shipping_mode,status,proposed_by_account_id,reviewed_by_account_id,reviewed_at)
       VALUES ($1,1,$2,'QA 설명','QA 산지','seller_direct','approved',$3,$3,now()) RETURNING id`,
      [ids.product, name, ids.accountA],
    )).rows[0].id;
    ids.option = (await pool.query(
      'INSERT INTO product_options(revision_id,name,price_won) VALUES ($1,$2,23000) RETURNING id',
      [ids.revision, '500g'],
    )).rows[0].id;
    await pool.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,1,1)',
      [ids.option]);
    await pool.query('INSERT INTO product_publications(product_id,revision_id,published_by_account_id) VALUES ($1,$2,$3)',
      [ids.product, ids.revision, ids.accountA]);
    await pool.query('INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,1),($3,$2,1)',
      [ids.accountA, ids.option, ids.accountB]);

    const { CheckoutReservations } = await import('../src/checkout/reservation-service.ts');
    const service = new CheckoutReservations(pool);
    const keyA = randomUUID();
    const keyB = randomUUID();
    const races = await Promise.allSettled([
      service.start(ids.accountA, keyA), service.start(ids.accountB, keyB),
    ]);
    assert.deepEqual(races.map((result) => result.status).sort(), ['fulfilled', 'rejected'],
      races.map((result) => result.status === 'rejected' ?
        `${result.reason?.code ?? 'error'}: ${result.reason?.message}` : 'fulfilled').join('; '));
    const winnerIndex = races.findIndex((result) => result.status === 'fulfilled');
    const winnerAccount = winnerIndex === 0 ? ids.accountA : ids.accountB;
    const loserAccount = winnerIndex === 0 ? ids.accountB : ids.accountA;
    const winnerKey = winnerIndex === 0 ? keyA : keyB;
    const hold = races[winnerIndex].value;
    assert.equal(hold.status, 'ACTIVE');
    assert.deepEqual(hold.lines, [{ optionId: ids.option, quantity: 1 }]);
    assert.equal((await service.start(winnerAccount, winnerKey)).id, hold.id);
    assert.equal((await service.start(winnerAccount, winnerKey)).expiresAt.getTime(), hold.expiresAt.getTime());
    await assert.rejects(service.start(winnerAccount, randomUUID()), /Active reservation exists/);
    assert.equal(await service.get(loserAccount, hold.id), null);
    assert.equal(await service.release(loserAccount, hold.id), null);
    assert.equal((await service.get(winnerAccount, hold.id)).status, 'ACTIVE');
    assert.equal((await service.release(winnerAccount, hold.id)).status, 'RELEASED');
    assert.equal((await service.release(winnerAccount, hold.id)).status, 'RELEASED');
    assert.equal((await service.start(winnerAccount, winnerKey)).status, 'RELEASED');

    const retry = await service.start(loserAccount, randomUUID());
    assert.equal(retry.status, 'ACTIVE');
    await pool.query(`UPDATE checkout_reservations SET created_at=clock_timestamp()-interval '16 minutes',
      expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`,
      [retry.id]);
    assert.equal((await service.get(loserAccount, retry.id)).status, 'EXPIRED');
    assert.equal(await service.expireDue(100), 0);
    assert.equal(await service.expireDue(100), 0);
    const replacement = await service.start(winnerAccount, randomUUID());
    assert.equal(replacement.status, 'ACTIVE');
    assert.equal((await service.release(winnerAccount, replacement.id)).status, 'RELEASED');
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM checkout_reservations WHERE account_id=ANY($1::uuid[])',
      [[ids.accountA, ids.accountB]])).rows[0].count, 3);
  } finally {
    for (const accountId of [ids.accountA, ids.accountB]) {
      if (!accountId) continue;
      await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [accountId]);
      await pool.query('DELETE FROM customer_cart_items WHERE account_id=$1', [accountId]);
    }
    if (ids.accountA || ids.accountB) {
      await pool.query(`DELETE FROM checkout_reservation_lines WHERE reservation_id IN
        (SELECT id FROM checkout_reservations WHERE account_id=ANY($1::uuid[]))`,
      [[ids.accountA, ids.accountB].filter(Boolean)]);
      await pool.query('DELETE FROM checkout_reservations WHERE account_id=ANY($1::uuid[])',
        [[ids.accountA, ids.accountB].filter(Boolean)]);
    }
    if (ids.product) await pool.query('DELETE FROM product_publications WHERE product_id=$1', [ids.product]);
    if (ids.option) await pool.query('DELETE FROM inventory_levels WHERE option_id=$1', [ids.option]);
    if (ids.option) await pool.query('DELETE FROM product_options WHERE id=$1', [ids.option]);
    if (ids.revision) await pool.query('DELETE FROM product_revisions WHERE id=$1', [ids.revision]);
    if (ids.product) await pool.query('DELETE FROM products WHERE id=$1', [ids.product]);
    if (ids.major) await pool.query('DELETE FROM product_categories WHERE id=$1', [ids.major]);
    if (ids.seller) await pool.query('DELETE FROM sellers WHERE id=$1', [ids.seller]);
    if (ids.sellerCategory) await pool.query('DELETE FROM seller_categories WHERE id=$1', [ids.sellerCategory]);
    for (const accountId of [ids.accountB, ids.accountA]) {
      if (accountId) await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    }
    await pool.end();
  }
});
