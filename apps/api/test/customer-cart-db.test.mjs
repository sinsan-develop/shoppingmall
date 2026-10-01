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
  const extraOptions = [];
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
    for (const quantity of [0, -1, 1.5, 1_000_001]) {
      await assert.rejects(cart.set(ids.accountA, ids.option, quantity), /Invalid cart selection/);
    }
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
    await pool.query('UPDATE inventory_levels SET sellable_quantity=5 WHERE option_id=$1', [ids.option]);
    await pool.query('UPDATE product_options SET price_won=24000 WHERE id=$1', [ids.option]);
    assert.equal((await cart.quote(ids.accountA)).goodsWon, 72000);
    ids.saleStop = (await pool.query(
      `INSERT INTO product_sale_stop_requests(product_id,status,reason,requested_by_account_id,
       decided_by_account_id,decided_at)
       VALUES ($1,'approved','QA 판매중지',$2,$2,now()) RETURNING id`,
      [ids.product, ids.accountA],
    )).rows[0].id;
    assert.equal((await cart.list(ids.accountA))[0].availability, 'unavailable');
    await assert.rejects(cart.quote(ids.accountA), /Unavailable cart selection/);
    await assert.rejects(cart.set(ids.accountA, ids.option, 1), /Unavailable cart selection/);
    await pool.query('DELETE FROM product_sale_stop_requests WHERE id=$1', [ids.saleStop]);
    ids.saleStop = null;
    ids.revision2 = (await pool.query(
      `INSERT INTO product_revisions(product_id,version,title,description,origin_label,
       shipping_mode,status,proposed_by_account_id,reviewed_by_account_id,reviewed_at)
       VALUES ($1,2,$2,'새 버전','가상 산지','seller_direct','approved',$3,$3,now()) RETURNING id`,
      [ids.product, `${name}-v2`, ids.accountA],
    )).rows[0].id;
    await pool.query('UPDATE product_publications SET revision_id=$1 WHERE product_id=$2',
      [ids.revision2, ids.product]);
    assert.equal((await cart.list(ids.accountA))[0].availability, 'unavailable');
    await assert.rejects(cart.quote(ids.accountA), /Unavailable cart selection/);
    await assert.rejects(cart.set(ids.accountA, ids.option, 1), /Unavailable cart selection/);
    await pool.query('UPDATE product_publications SET revision_id=$1 WHERE product_id=$2',
      [ids.revision, ids.product]);

    // The 100-item limit applies to distinct options, not to repeated PUT of one option.
    const extra = await pool.query(
      `INSERT INTO product_options(revision_id,name,price_won)
       SELECT $1,'QA option ' || n,100 FROM generate_series(1,101) n
       RETURNING id`, [ids.revision],
    );
    extraOptions.push(...extra.rows.map((row) => row.id));
    await pool.query(
      `INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity)
       SELECT unnest($1::uuid[]),1,1`, [extraOptions],
    );
    for (const optionId of extraOptions.slice(0, 99)) await cart.set(ids.accountA, optionId, 1);
    assert.equal((await cart.list(ids.accountA)).length, 100);
    await cart.set(ids.accountA, ids.option, 2);
    await assert.rejects(cart.set(ids.accountA, extraOptions[99], 1), /Cart option limit exceeded/);
    assert.equal((await cart.list(ids.accountA)).length, 100);
    await cart.remove(ids.accountA, ids.option);
    await cart.remove(ids.accountA, ids.option);
    assert.equal((await cart.list(ids.accountA)).length, 99);
    const competing = await Promise.allSettled([
      cart.set(ids.accountA, extraOptions[99], 1),
      cart.set(ids.accountA, extraOptions[100], 1),
    ]);
    assert.deepEqual(competing.map((result) => result.status).sort(), ['fulfilled', 'rejected']);
    assert.equal((await cart.list(ids.accountA)).length, 100);
    const sameOption = await Promise.allSettled([
      cart.set(ids.accountA, extraOptions[0], 1),
      cart.set(ids.accountA, extraOptions[0], 1),
    ]);
    assert.deepEqual(sameOption.map((result) => result.status), ['fulfilled', 'fulfilled']);
    assert.equal((await cart.list(ids.accountA)).find((item) => item.optionId === extraOptions[0]).quantity, 1);
    assert.deepEqual((await cart.list(ids.accountB)).map(({ quantity }) => quantity), [1]);
  } finally {
    if (ids.accountA || ids.accountB) await pool.query(
      'DELETE FROM customer_cart_items WHERE account_id=ANY($1::uuid[])',
      [[ids.accountA, ids.accountB].filter(Boolean)],
    );
    if (ids.product) await pool.query('DELETE FROM product_publications WHERE product_id=$1', [ids.product]);
    if (ids.saleStop) await pool.query('DELETE FROM product_sale_stop_requests WHERE id=$1', [ids.saleStop]);
    if (extraOptions.length) await pool.query('DELETE FROM inventory_levels WHERE option_id=ANY($1::uuid[])', [extraOptions]);
    if (extraOptions.length) await pool.query('DELETE FROM product_options WHERE id=ANY($1::uuid[])', [extraOptions]);
    if (ids.option) await pool.query('DELETE FROM inventory_levels WHERE option_id=$1', [ids.option]);
    if (ids.option) await pool.query('DELETE FROM product_options WHERE id=$1', [ids.option]);
    if (ids.revision2) await pool.query('DELETE FROM product_revisions WHERE id=$1', [ids.revision2]);
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
