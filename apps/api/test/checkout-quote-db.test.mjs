import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { CheckoutQuote } from '../src/checkout/quote.ts';
import { ShippingPolicies } from '../src/shipping/service.ts';

test('current quote uses direct seller policies but the global policy for pooled owool fulfillment', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomUUID().slice(0, 8);
  const databaseUrl = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString: databaseUrl });
  let seeded = false;
  try {
    await runQaCatalogFixture('seed', runId, databaseUrl, 'test-only-password-12345');
    seeded = true;
    const rows = (await pool.query(
      `SELECT r.title,o.id AS option_id,p.seller_id FROM product_revisions r
       JOIN product_publications pub ON pub.revision_id=r.id
       JOIN products p ON p.id=pub.product_id
       JOIN product_options o ON o.revision_id=r.id
       WHERE r.title=ANY($1::text[])`,
      [['고추', '고춧가루', '양파', '마늘', '블루베리'].map((name) => `qa-${runId}-${name}`)],
    )).rows;
    assert.equal(rows.length, 5);
    const byItem = new Map(rows.map((row) => [row.title.slice(`qa-${runId}-`.length), row]));
    const identities = (await pool.query(
      `SELECT s.id,s.display_name,a.account_id FROM sellers s
       JOIN account_roles a ON a.seller_id=s.id
       WHERE s.display_name=ANY($1::text[])`,
      [['seller-a', 'seller-b', 'owool'].map((name) => `qa-${runId}-${name}`)],
    )).rows;
    assert.equal(identities.length, 3);
    const admin = (await pool.query(
      `SELECT account_id FROM account_identities WHERE kind='email' AND identifier=$1`,
      [`qa+${runId}-admin@example.invalid`],
    )).rows[0];
    assert.ok(admin);
    const shipping = new ShippingPolicies(pool);
    for (const seller of identities) {
      const ownPolicy = seller.display_name.endsWith('seller-a')
        ? { feeWon: 3500, freeThresholdWon: 50000, cutoffTime: null, blockedPostalRanges: [] }
        : seller.display_name.endsWith('seller-b')
          ? { feeWon: 4000, freeThresholdWon: 40000, cutoffTime: null, blockedPostalRanges: [] }
          : { feeWon: 9000, freeThresholdWon: 100000, cutoffTime: null, blockedPostalRanges: [] };
      const request = await shipping.requestSeller(
        { accountId: seller.account_id, role: 'seller', sellerId: seller.id }, ownPolicy,
      );
      await shipping.approve({ accountId: admin.account_id, role: 'admin' }, request.requestId);
    }
    const quote = await new CheckoutQuote(pool).quote([
      { optionId: byItem.get('고추').option_id, quantity: 1 },
      { optionId: byItem.get('고춧가루').option_id, quantity: 1 },
      { optionId: byItem.get('양파').option_id, quantity: 1 },
      { optionId: byItem.get('마늘').option_id, quantity: 1 },
      { optionId: byItem.get('블루베리').option_id, quantity: 1 },
    ]);
    assert.deepEqual(quote.shipments.map((shipment) => ({
      key: shipment.key, goodsWon: shipment.goodsWon,
      shippingWon: shipment.shippingWon, totalWon: shipment.totalWon,
    })), [
      { key: `seller_direct:${byItem.get('고추').seller_id}`, goodsWon: 35000,
        shippingWon: 3500, totalWon: 38500 },
      { key: 'owool_fulfillment', goodsWon: 18000, shippingWon: 3000, totalWon: 21000 },
      { key: `seller_direct:${byItem.get('마늘').seller_id}`, goodsWon: 44000,
        shippingWon: 0, totalWon: 44000 },
    ]);
    assert.deepEqual({ goodsWon: quote.goodsWon, shippingWon: quote.shippingWon, totalWon: quote.totalWon },
      { goodsWon: 97000, shippingWon: 6500, totalWon: 103500 });
    assert.equal(quote.shipments[1].lines[0].unitPriceWon, 18000);
    await assert.rejects(new CheckoutQuote(pool).quote([
      { optionId: byItem.get('고추').option_id, quantity: 6 },
    ]), /Insufficient stock/);
  } finally {
    await pool.end();
    if (seeded) await runQaCatalogFixture('reset', runId, databaseUrl);
  }
});
