import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

test('an active checkout hold blocks cart edits and quotes its own stock at current price', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const ids = {};
  const name = `qa-${randomUUID().slice(0, 8)}-reservation-product`;
  try {
    ids.account = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    ids.sellerCategory = (await pool.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id',
      [name])).rows[0].id;
    ids.seller = (await pool.query('INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [ids.sellerCategory, name])).rows[0].id;
    ids.category = (await pool.query('INSERT INTO product_categories(name) VALUES ($1) RETURNING id',
      [name])).rows[0].id;
    ids.product = (await pool.query('INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
      [ids.seller, ids.category])).rows[0].id;
    ids.revision = (await pool.query(
      `INSERT INTO product_revisions(product_id,version,title,description,origin_label,
       shipping_mode,status,proposed_by_account_id,reviewed_by_account_id,reviewed_at)
       VALUES ($1,1,$2,'QA 설명','QA 산지','seller_direct','approved',$3,$3,now()) RETURNING id`,
      [ids.product, name, ids.account],
    )).rows[0].id;
    ids.option = (await pool.query(
      'INSERT INTO product_options(revision_id,name,price_won) VALUES ($1,$2,23000) RETURNING id',
      [ids.revision, '500g'],
    )).rows[0].id;
    await pool.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,1,1)',
      [ids.option]);
    await pool.query('INSERT INTO product_publications(product_id,revision_id,published_by_account_id) VALUES ($1,$2,$3)',
      [ids.product, ids.revision, ids.account]);
    await pool.query('INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,1)',
      [ids.account, ids.option]);

    const { CheckoutReservations } = await import('../src/checkout/reservation-service.ts');
    const { CustomerCart } = await import('../src/checkout/customer-cart.ts');
    const { quoteReservation } = await import('../src/checkout/reservation-quote.ts');
    const holds = new CheckoutReservations(pool);
    const cart = new CustomerCart(pool);
    const hold = await holds.start(ids.account, randomUUID());
    assert.equal(hold.status, 'ACTIVE');
    await assert.rejects(cart.remove(ids.account, ids.option), /Active reservation exists/);
    await assert.rejects(cart.set(ids.account, ids.option, 1), /Active reservation exists/);
    assert.deepEqual((await cart.list(ids.account)).map((line) => line.quantity), [1]);
    assert.deepEqual({ goodsWon: (await quoteReservation(pool, ids.account, hold.id)).goodsWon,
      shippingWon: (await quoteReservation(pool, ids.account, hold.id)).shippingWon },
    { goodsWon: 23000, shippingWon: 3000 });
    await pool.query('UPDATE product_options SET price_won=25000 WHERE id=$1', [ids.option]);
    assert.equal((await quoteReservation(pool, ids.account, hold.id)).goodsWon, 25000);
    await assert.rejects(quoteReservation(pool, randomUUID(), hold.id), /Reservation unavailable/);
    await holds.release(ids.account, hold.id);
    await assert.rejects(quoteReservation(pool, ids.account, hold.id), /Reservation unavailable/);
    await cart.set(ids.account, ids.option, 1);
    const second = await holds.start(ids.account, randomUUID());
    ids.pendingRevision = (await pool.query(
      `INSERT INTO product_revisions(product_id,version,title,description,origin_label,
       shipping_mode,status,proposed_by_account_id)
       VALUES ($1,2,$2,'새 설명','QA 산지','seller_direct','pending',$3) RETURNING id`,
      [ids.product, `${name}-revised`, ids.account],
    )).rows[0].id;
    ids.pendingOption = (await pool.query(
      'INSERT INTO product_options(revision_id,name,price_won) VALUES ($1,$2,26000) RETURNING id',
      [ids.pendingRevision, '500g'],
    )).rows[0].id;
    ids.image = (await pool.query(
      `INSERT INTO product_images(revision_id,object_key,purpose,mime_type,size_bytes)
       VALUES ($1,$2,'thumbnail','image/webp',1) RETURNING id`,
      [ids.pendingRevision, `qa/${name}/thumbnail.webp`],
    )).rows[0].id;
    const { ProductReviews } = await import('../src/catalog/product-reviews.ts');
    const admin = { accountId: ids.account, role: 'admin' };
    const store = { read: async () => Buffer.from('x') };
    await assert.rejects(new ProductReviews(pool).approve(admin, ids.pendingRevision, store, async () => {}),
      /Active product reservation/);
    assert.equal((await pool.query('SELECT revision_id FROM product_publications WHERE product_id=$1',
      [ids.product])).rows[0].revision_id, ids.revision);
    assert.equal((await pool.query('SELECT status FROM product_revisions WHERE id=$1',
      [ids.pendingRevision])).rows[0].status, 'pending');

    ids.stop = (await pool.query(
      `INSERT INTO product_sale_stop_requests(product_id,reason,requested_by_account_id)
       VALUES ($1,'QA 출고 불가',$2) RETURNING id`, [ids.product, ids.account],
    )).rows[0].id;
    const { ProductSaleStops } = await import('../src/catalog/product-sale-stops.ts');
    await new ProductSaleStops(pool).approve(admin, ids.stop);
    const ended = (await pool.query(
      'SELECT status,end_reason FROM checkout_reservations WHERE id=$1', [second.id])).rows[0];
    assert.equal(ended.status, 'CANCELLED');
    assert.match(ended.end_reason, /QA 출고 불가/);
    assert.equal((await pool.query(
      `SELECT count(*)::int AS n FROM audit_events WHERE actor_account_id=$1
       AND action='checkout_reservation_cancelled' AND target_id=$2`,
      [ids.account, second.id])).rows[0].n, 1);
    await assert.rejects(quoteReservation(pool, ids.account, second.id), /Reservation unavailable/);
    await cart.remove(ids.account, ids.option);
    assert.deepEqual(await cart.list(ids.account), []);
  } finally {
    if (ids.account) {
      await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [ids.account]);
      await pool.query('DELETE FROM customer_cart_items WHERE account_id=$1', [ids.account]);
      await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id IN (SELECT id FROM checkout_reservations WHERE account_id=$1)', [ids.account]);
      await pool.query('DELETE FROM checkout_reservations WHERE account_id=$1', [ids.account]);
    }
    if (ids.stop) await pool.query('DELETE FROM product_sale_stop_requests WHERE id=$1', [ids.stop]);
    if (ids.product) await pool.query('DELETE FROM product_publications WHERE product_id=$1', [ids.product]);
    if (ids.image) await pool.query('DELETE FROM product_images WHERE id=$1', [ids.image]);
    if (ids.pendingOption) await pool.query('DELETE FROM inventory_levels WHERE option_id=$1', [ids.pendingOption]);
    if (ids.pendingOption) await pool.query('DELETE FROM product_options WHERE id=$1', [ids.pendingOption]);
    if (ids.pendingRevision) await pool.query('DELETE FROM product_revisions WHERE id=$1', [ids.pendingRevision]);
    if (ids.option) await pool.query('DELETE FROM inventory_levels WHERE option_id=$1', [ids.option]);
    if (ids.option) await pool.query('DELETE FROM product_options WHERE id=$1', [ids.option]);
    if (ids.revision) await pool.query('DELETE FROM product_revisions WHERE id=$1', [ids.revision]);
    if (ids.product) await pool.query('DELETE FROM products WHERE id=$1', [ids.product]);
    if (ids.category) await pool.query('DELETE FROM product_categories WHERE id=$1', [ids.category]);
    if (ids.seller) await pool.query('DELETE FROM sellers WHERE id=$1', [ids.seller]);
    if (ids.sellerCategory) await pool.query('DELETE FROM seller_categories WHERE id=$1', [ids.sellerCategory]);
    if (ids.account) await pool.query('DELETE FROM accounts WHERE id=$1', [ids.account]);
    await pool.end();
  }
});
