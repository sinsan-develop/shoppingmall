import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { AuthRepository } from '../src/auth/repository.ts';
import { ProductDrafts } from '../src/catalog/product-drafts.ts';

test('a seller creates only its own non-public product draft in a minor category', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = randomUUID().slice(0, 8);
  let accountId;
  let sellerCategoryId;
  let sellerA;
  let sellerB;
  let majorId;
  let minorId;
  let otherMinorId;
  let productId;
  let deletableProductId;
  let deletableStockOptionId;
  let stockedOptionId;
  try {
    accountId = await new AuthRepository(pool).createCustomerAccount(`qa+${randomUUID()}@example.invalid`, 'test-only-password-12345');
    sellerCategoryId = (await pool.query('INSERT INTO seller_categories (name) VALUES ($1) RETURNING id', [`qa-${suffix}-group`])).rows[0].id;
    sellerA = (await pool.query('INSERT INTO sellers (category_id,display_name) VALUES ($1,$2) RETURNING id', [sellerCategoryId, `qa-${suffix}-a`])).rows[0].id;
    sellerB = (await pool.query('INSERT INTO sellers (category_id,display_name) VALUES ($1,$2) RETURNING id', [sellerCategoryId, `qa-${suffix}-b`])).rows[0].id;
    majorId = (await pool.query('INSERT INTO product_categories (name) VALUES ($1) RETURNING id', [`qa-${suffix}-major`])).rows[0].id;
    minorId = (await pool.query('INSERT INTO product_categories (parent_id,name) VALUES ($1,$2) RETURNING id', [majorId, `qa-${suffix}-minor`])).rows[0].id;
    const drafts = new ProductDrafts(pool);
    const seller = { accountId, role: 'seller', sellerId: sellerA };
    const input = {
      categoryId: minorId, title: '  시험 고추  ', description: '가상 농산물', originLabel: '전국 어느 산지',
      shippingMode: 'seller_direct', options: [{ name: '500g', priceWon: 23000 }],
    };
    await assert.rejects(drafts.create({ accountId, role: 'customer' }, input), /Forbidden/);
    await assert.rejects(drafts.create(seller, { ...input, categoryId: majorId }), /Minor category required/);
    await assert.rejects(drafts.create(seller, { ...input, options: [] }), /Option required/);
    await assert.rejects(drafts.create(seller, { ...input, options: [{ name: '500g', priceWon: -1 }] }), /Invalid option/);
    const created = await drafts.create(seller, input);
    productId = created.productId;
    assert.equal(typeof drafts.deleteDraft, 'function');
    const deletable = await drafts.create(seller, { ...input, title: '삭제용 시험 고추' });
    deletableProductId = deletable.productId;
    await assert.rejects(drafts.deleteDraft({ accountId, role: 'seller', sellerId: sellerB },
      deletable.productId, deletable.revisionId), /Forbidden/);
    await pool.query(`INSERT INTO product_images(revision_id,object_key,purpose,mime_type,size_bytes)
      VALUES ($1,$2,'thumbnail','image/webp',100)`, [deletable.revisionId, `quarantine/qa-${suffix}-metadata`]);
    await assert.rejects(drafts.deleteDraft(seller, deletable.productId, deletable.revisionId), /Protected draft data/);
    await pool.query('DELETE FROM product_images WHERE revision_id=$1', [deletable.revisionId]);
    deletableStockOptionId = (await pool.query('SELECT id FROM product_options WHERE revision_id=$1',
      [deletable.revisionId])).rows[0].id;
    await pool.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,1,0)',
      [deletableStockOptionId]);
    await assert.rejects(drafts.deleteDraft(seller, deletable.productId, deletable.revisionId), /Protected draft data/);
    await pool.query('DELETE FROM inventory_levels WHERE option_id=$1', [deletableStockOptionId]);
    await drafts.deleteDraft(seller, deletable.productId, deletable.revisionId);
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM products WHERE id=$1',
      [deletable.productId])).rows[0].total, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM audit_events WHERE target_id=$1 AND action=$2',
      [deletable.productId, 'product.draft_delete'])).rows[0].total, 1);
    const row = await pool.query(`SELECT p.seller_id, p.category_id, r.title, r.status, r.shipping_mode,
      o.name AS option_name, o.price_won FROM products p
      JOIN product_revisions r ON r.product_id=p.id JOIN product_options o ON o.revision_id=r.id WHERE p.id=$1`, [productId]);
    assert.equal(row.rows.length, 1);
    assert.equal(row.rows[0].seller_id, sellerA);
    assert.equal(row.rows[0].category_id, minorId);
    assert.equal(row.rows[0].title, '시험 고추');
    assert.equal(row.rows[0].status, 'draft');
    assert.equal(row.rows[0].shipping_mode, 'seller_direct');
    assert.equal(row.rows[0].price_won, 23000);
    assert.equal(typeof drafts.getEditable, 'function');
    const editable = await drafts.getEditable(seller, created.productId, created.revisionId);
    assert.equal(editable.title, '시험 고추');
    assert.deepEqual(editable.options, [{ name: '500g', priceWon: 23000 }]);
    await assert.rejects(drafts.getEditable({ accountId, role: 'seller', sellerId: sellerB },
      created.productId, created.revisionId), /Forbidden/);
    assert.equal(typeof drafts.update, 'function');
    const edited = { ...input, title: '수정 고추', description: '바뀐 가상 설명',
      options: [{ name: '500g', priceWon: 25000 }, { name: '1kg', priceWon: 45000 }] };
    await assert.rejects(drafts.update({ accountId, role: 'seller', sellerId: sellerB },
      created.productId, created.revisionId, edited), /Forbidden/);
    await drafts.update(seller, created.productId, created.revisionId, edited);
    const editedRow = await pool.query('SELECT title,description,status FROM product_revisions WHERE id=$1', [created.revisionId]);
    assert.deepEqual(editedRow.rows[0], { title: '수정 고추', description: '바뀐 가상 설명', status: 'draft' });
    const editedOptions = await pool.query('SELECT name,price_won FROM product_options WHERE revision_id=$1 ORDER BY display_order',
      [created.revisionId]);
    assert.deepEqual(editedOptions.rows.map((option) => [option.name, option.price_won]),
      [['500g', 25000], ['1kg', 45000]]);
    stockedOptionId = (await pool.query('SELECT id FROM product_options WHERE revision_id=$1 AND name=$2',
      [created.revisionId, '1kg'])).rows[0].id;
    await pool.query('INSERT INTO inventory_levels(option_id,on_hand_quantity,sellable_quantity) VALUES ($1,2,0)',
      [stockedOptionId]);
    await assert.rejects(drafts.update(seller, created.productId, created.revisionId,
      { ...edited, options: [{ name: '500g', priceWon: 25000 }] }), /Stocked option cannot be removed/);
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM product_options WHERE revision_id=$1',
      [created.revisionId])).rows[0].total, 2);
    await pool.query("UPDATE product_revisions SET status='pending' WHERE id=$1", [created.revisionId]);
    await assert.rejects(drafts.deleteDraft(seller, created.productId, created.revisionId), /Draft required/);
    await assert.rejects(drafts.update(seller, created.productId, created.revisionId, input), /Draft required/);
    await pool.query("UPDATE product_revisions SET status='draft' WHERE id=$1", [created.revisionId]);
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM product_publications WHERE product_id=$1', [productId])).rows[0].total, 0);
    assert.equal((await drafts.listOwned(seller)).length, 1);
    assert.equal((await drafts.listOwned({ accountId, role: 'seller', sellerId: sellerB })).length, 0);
    await assert.rejects(drafts.listOwned({ accountId, role: 'customer' }), /Forbidden/);
    await assert.rejects(drafts.submit(seller, created.productId, created.revisionId), /Thumbnail and option required/);
    const audit = await pool.query('SELECT action,seller_id FROM audit_events WHERE actor_account_id=$1 AND target_id=$2', [accountId, productId]);
    assert.equal(audit.rows[0].action, 'product.draft_create');
    assert.equal(audit.rows[0].seller_id, sellerA);
    otherMinorId = (await pool.query('INSERT INTO product_categories(parent_id,name) VALUES ($1,$2) RETURNING id',
      [majorId, `qa-${suffix}-other-minor`])).rows[0].id;
    await pool.query("UPDATE product_revisions SET status='approved' WHERE id=$1", [created.revisionId]);
    await pool.query('INSERT INTO product_publications(product_id,revision_id,published_by_account_id) VALUES ($1,$2,$3)',
      [productId, created.revisionId, accountId]);
    const nextRevision = (await pool.query(`INSERT INTO product_revisions
      (product_id,version,title,description,origin_label,shipping_mode,status,proposed_by_account_id)
      VALUES ($1,2,$2,'가상 수정','전국 산지','seller_direct','draft',$3) RETURNING id`,
    [productId, '다음 개정', accountId])).rows[0].id;
    await pool.query('INSERT INTO product_options(revision_id,name,price_won) VALUES ($1,$2,$3)',
      [nextRevision, '2kg', 40000]);
    await assert.rejects(drafts.update(seller, productId, nextRevision,
      { ...edited, categoryId: otherMinorId }), /Published category cannot change/);
    assert.equal((await pool.query('SELECT category_id FROM products WHERE id=$1', [productId])).rows[0].category_id,
      minorId);
  } finally {
    if (stockedOptionId) await pool.query('DELETE FROM inventory_levels WHERE option_id=$1', [stockedOptionId]);
    if (deletableStockOptionId) await pool.query('DELETE FROM inventory_levels WHERE option_id=$1', [deletableStockOptionId]);
    if (deletableProductId) {
      await pool.query('DELETE FROM product_images WHERE revision_id IN (SELECT id FROM product_revisions WHERE product_id=$1)',
        [deletableProductId]);
      await pool.query('DELETE FROM product_options WHERE revision_id IN (SELECT id FROM product_revisions WHERE product_id=$1)',
        [deletableProductId]);
      await pool.query('DELETE FROM product_revisions WHERE product_id=$1', [deletableProductId]);
      await pool.query('DELETE FROM products WHERE id=$1', [deletableProductId]);
    }
    if (productId) {
      await pool.query('DELETE FROM product_publications WHERE product_id=$1', [productId]);
      await pool.query('DELETE FROM product_options WHERE revision_id IN (SELECT id FROM product_revisions WHERE product_id=$1)', [productId]);
      await pool.query('DELETE FROM product_revisions WHERE product_id=$1', [productId]);
      await pool.query('DELETE FROM products WHERE id=$1', [productId]);
    }
    if (accountId) await pool.query('DELETE FROM audit_events WHERE actor_account_id=$1', [accountId]);
    if (minorId) await pool.query('DELETE FROM product_categories WHERE id=$1', [minorId]);
    if (otherMinorId) await pool.query('DELETE FROM product_categories WHERE id=$1', [otherMinorId]);
    if (majorId) await pool.query('DELETE FROM product_categories WHERE id=$1', [majorId]);
    if (sellerB) await pool.query('DELETE FROM sellers WHERE id=$1', [sellerB]);
    if (sellerA) await pool.query('DELETE FROM sellers WHERE id=$1', [sellerA]);
    if (sellerCategoryId) await pool.query('DELETE FROM seller_categories WHERE id=$1', [sellerCategoryId]);
    if (accountId) {
      await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_roles WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM account_identities WHERE account_id=$1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [accountId]);
    }
    await pool.end();
  }
});
