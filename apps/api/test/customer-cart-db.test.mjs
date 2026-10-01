import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

test('cart keeps account quantities separate, retries as final values and rechecks live stock', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const name = `qa-${randomUUID().slice(0, 8)}-cart`;
  const ids = {};
  try {
    ids.accountA = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    ids.accountB = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    ids.sellerCategory = (await pool.query(
      'INSERT INTO seller_categories(name) VALUES ($1) RETURNING id', [name],
    )).rows[0].id;
    ids.seller = (await pool.query(
      'INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [ids.sellerCategory, name],
    )).rows[0].id;
    ids.major = (await pool.query(
      'INSERT INTO product_categories(name) VALUES ($1) RETURNING id', [name],
    )).rows[0].id;
    ids.minor = (await pool.query(
      'INSERT INTO product_categories(parent_id,name) VALUES ($1,$2) RETURNING id',
      [ids.major, `${name}-minor`],
    )).rows[0].id;
    ids.product = (await pool.query(
      'INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
      [ids.seller, ids.minor],
    )).rows[0].id;
    ids.revision = (await pool.query(
      `INSERT INTO product_revisions(product_id,version,title,description,origin_label,
       shipping_mode,status,proposed_by_account_id,reviewed_by_account_id,reviewed_at)
       VALUES ($1,1,$2,'가상 상품','가상 산지','seller_direct','approved',$3,$3,now()) RETURNING id`,
      [ids.product, name, ids.accountA],
    )).rows[0].id;
    ids.option = (await pool.query(
      'INSERT INTO product_options(revision_id,name,price_won) VALUES ($1,$2,23000) RETURNING id',
      [ids.revision, '500g'],
    )).rows[0].id;
    await pool.query(
      'INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,5,5)',
      [ids.option],
    );
    await pool.query(
      'INSERT INTO product_publications(product_id,revision_id,published_by_account_id) VALUES ($1,$2,$3)',
      [ids.product, ids.revision, ids.accountA],
    );

    const { CustomerCart } = await import('../src/checkout/customer-cart.ts');
    const cart = new CustomerCart(pool);
    assert.deepEqual(await cart.list(ids.accountA), []);
    await cart.set(ids.accountA, ids.option, 2);
    await cart.set(ids.accountA, ids.option, 3);
    assert.deepEqual((await cart.list(ids.accountA)).map(({ optionId, quantity, availability }) =>
      ({ optionId, quantity, availability })), [
      { optionId: ids.option, quantity: 3, availability: 'available' },
    ]);
    assert.deepEqual(await cart.list(ids.accountB), []);
    await cart.set(ids.accountB, ids.option, 1);
    assert.deepEqual((await cart.list(ids.accountB)).map(({ quantity }) => quantity), [1]);
    const quote = await cart.quote(ids.accountA);
    assert.deepEqual({ goodsWon: quote.goodsWon, shippingWon: quote.shippingWon, totalWon: quote.totalWon },
      { goodsWon: 69000, shippingWon: 0, totalWon: 69000 });
    await pool.query('UPDATE inventory_levels SET sellable_quantity=0 WHERE option_id=$1', [ids.option]);
    assert.equal((await cart.list(ids.accountA))[0].availability, 'unavailable');
    await assert.rejects(cart.quote(ids.accountA), /Insufficient stock/);
    await cart.remove(ids.accountA, ids.option);
    await cart.remove(ids.accountA, ids.option);
    assert.deepEqual(await cart.list(ids.accountA), []);
    assert.deepEqual((await cart.list(ids.accountB)).map(({ quantity }) => quantity), [1]);
  } finally {
    if (ids.accountA || ids.accountB) await pool.query(
      'DELETE FROM customer_cart_items WHERE account_id=ANY($1::uuid[])',
      [[ids.accountA, ids.accountB].filter(Boolean)],
    );
    if (ids.product) await pool.query('DELETE FROM product_publications WHERE product_id=$1', [ids.product]);
    if (ids.option) await pool.query('DELETE FROM inventory_levels WHERE option_id=$1', [ids.option]);
    if (ids.option) await pool.query('DELETE FROM product_options WHERE id=$1', [ids.option]);
    if (ids.revision) await pool.query('DELETE FROM product_revisions WHERE id=$1', [ids.revision]);
    if (ids.product) await pool.query('DELETE FROM products WHERE id=$1', [ids.product]);
    if (ids.minor) await pool.query('DELETE FROM product_categories WHERE id=$1', [ids.minor]);
    if (ids.major) await pool.query('DELETE FROM product_categories WHERE id=$1', [ids.major]);
    if (ids.seller) await pool.query('DELETE FROM sellers WHERE id=$1', [ids.seller]);
    if (ids.sellerCategory) await pool.query('DELETE FROM seller_categories WHERE id=$1', [ids.sellerCategory]);
    for (const accountId of [ids.accountB, ids.accountA]) {
      if (accountId) await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    }
    await pool.end();
  }
});
