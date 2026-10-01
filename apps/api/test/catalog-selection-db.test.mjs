import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { runQaPublicFixture } from '../scripts/qa-public-fixture.ts';
import { CheckoutCatalog } from '../src/checkout/catalog-selection.ts';

test('cart selection uses current published option price, ownership, stock and sale state', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomUUID().slice(0, 8);
  const databaseUrl = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString: databaseUrl });
  let product;
  try {
    product = await runQaPublicFixture('seed', runId, databaseUrl, 'test-only-password-12345');
    const option = (await pool.query(
      'SELECT id FROM product_options WHERE revision_id=$1', [product.revisionId],
    )).rows[0];
    const seller = (await pool.query('SELECT seller_id FROM products WHERE id=$1', [product.productId])).rows[0];
    const catalog = new CheckoutCatalog(pool);
    assert.deepEqual(await catalog.resolve([{ optionId: option.id, quantity: 2 }]), [{
      productId: product.productId, optionId: option.id, title: product.title, optionName: '500g',
      sellerId: seller.seller_id, shippingMode: 'seller_direct', quantity: 2,
      unitPriceWon: 23000, sellableQuantity: 5,
    }]);
    await assert.rejects(catalog.resolve([{ optionId: option.id, quantity: 6 }]), /Insufficient stock/);
    await assert.rejects(catalog.resolve([{ optionId: randomUUID(), quantity: 1 }]), /Unavailable cart selection/);
    await pool.query('UPDATE inventory_levels SET sellable_quantity=0 WHERE option_id=$1', [option.id]);
    await assert.rejects(catalog.resolve([{ optionId: option.id, quantity: 1 }]), /Insufficient stock/);
    await pool.query('UPDATE inventory_levels SET sellable_quantity=5 WHERE option_id=$1', [option.id]);
    await pool.query(
      `INSERT INTO product_sale_stop_requests(product_id,reason,requested_by_account_id,status,decided_by_account_id,decided_at)
       SELECT $1,'QA 판매중지',a.id,'approved',a.id,now() FROM accounts a JOIN account_identities i ON i.account_id=a.id
       WHERE i.identifier=$2`,
      [product.productId, `qa+${runId}-admin@example.invalid`],
    );
    await assert.rejects(catalog.resolve([{ optionId: option.id, quantity: 1 }]), /Unavailable cart selection/);
  } finally {
    await pool.end();
    if (product) await runQaPublicFixture('reset', runId, databaseUrl);
  }
});
