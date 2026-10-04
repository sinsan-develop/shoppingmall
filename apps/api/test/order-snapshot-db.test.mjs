import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

test('one pending checkout snapshots three shipments, pooled original sellers and coupon version exactly', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const { insertOrderSnapshot, getOrderSnapshot } = await import('../src/orders/repository.ts');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const accountId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const otherId = (await client.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const addressId = (await client.query(`INSERT INTO customer_addresses
      (account_id,label,recipient_name,phone,postal_code,line1)
      VALUES ($1,'집','받는 분','01000000000','12345','시험 주소') RETURNING id`, [accountId])).rows[0].id;
    const reservationId = (await client.query(`INSERT INTO checkout_reservations
      (account_id,idempotency_key,expires_at) VALUES ($1,$2,now()+interval '15 minutes') RETURNING id`,
    [accountId, randomUUID()])).rows[0].id;
    const sellerCategoryId = (await client.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id',
      [`QA-${randomUUID()}`])).rows[0].id;
    const productCategoryId = (await client.query('INSERT INTO product_categories(name) VALUES ($1) RETURNING id',
      [`QA-${randomUUID()}`])).rows[0].id;
    const sellerIds = [];
    for (const name of ['A', 'B']) sellerIds.push((await client.query(
      'INSERT INTO sellers(category_id,display_name) VALUES ($1,$2) RETURNING id',
      [sellerCategoryId, `QA ${name}`])).rows[0].id);
    async function option(sellerId, title, mode) {
      const productId = (await client.query('INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
        [sellerId, productCategoryId])).rows[0].id;
      const revisionId = (await client.query(`INSERT INTO product_revisions
        (product_id,version,title,description,origin_label,shipping_mode,status,proposed_by_account_id)
        VALUES ($1,1,$2,'QA','QA 산지',$3,'approved',$4) RETURNING id`,
      [productId, title, mode, accountId])).rows[0].id;
      const optionId = (await client.query(`INSERT INTO product_options(revision_id,name,price_won)
        VALUES ($1,'1kg',10000) RETURNING id`, [revisionId])).rows[0].id;
      return { productId, optionId, sellerId, productName: title, optionName: '1kg',
        unitPriceWon: 10000, quantity: 1 };
    }
    const a = await option(sellerIds[0], '고추', 'seller_direct');
    const b = await option(sellerIds[1], '마늘', 'seller_direct');
    const pooledA = await option(sellerIds[0], '고춧가루', 'owool_fulfillment');
    const pooledB = await option(sellerIds[1], '양파', 'owool_fulfillment');
    const campaignId = (await client.query(`INSERT INTO promotion_campaigns
      (title,kind,total_use_limit,per_account_use_limit,created_by_account_id)
      VALUES ('QA 할인','goods_discount',10,10,$1) RETURNING id`, [accountId])).rows[0].id;
    const versionId = (await client.query(`INSERT INTO promotion_versions
      (campaign_id,version,scope,starts_at,ends_at,amount_kind,amount_value,created_by_account_id)
      VALUES ($1,1,'all',now()-interval '1 hour',now()+interval '1 day','fixed',5000,$2) RETURNING id`,
    [campaignId, accountId])).rows[0].id;
    const grantId = (await client.query(`INSERT INTO promotion_grants(account_id,version_id,source)
      VALUES ($1,$2,'code') RETURNING id`, [accountId, versionId])).rows[0].id;
    const useId = (await client.query(`INSERT INTO promotion_uses
      (account_id,campaign_id,version_id,grant_id,reservation_id,idempotency_key,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,now()+interval '10 minutes') RETURNING id`,
    [accountId, campaignId, versionId, grantId, reservationId, randomUUID()])).rows[0].id;
    const promotion = (amountWon) => ({ useId, campaignId, versionId,
      kind: 'goods_discount', amountWon });
    const shipment = (key, shippingMode, sellerId, goodsWon, discountWon, lines, amountWon) => ({
      key, shippingMode, sellerId,
      goodsWon, goodsDiscountWon: discountWon, shippingFeeWon: 3000, shippingSupportWon: 0,
      payableWon: goodsWon - discountWon + 3000, lines,
      promotions: [promotion(amountWon)],
    });
    const line = (item, goodsDiscountWon) => ({ ...item, goodsDiscountWon,
      goodsPayableWon: 10000 - goodsDiscountWon });
    const input = {
      accountId, reservationId, idempotencyKey: randomUUID(), requestFingerprint: 'b'.repeat(64),
      address: { id: addressId, recipientName: '받는 분', phone: '01000000000',
        postalCode: '12345', line1: '시험 주소', line2: '' },
      expiresAt: new Date(Date.now() + 9 * 60000),
      goodsWon: 40000, goodsDiscountWon: 5000, shippingFeeWon: 9000,
      shippingSupportWon: 0, payableWon: 44000,
      shipments: [
        shipment(`seller_direct:${sellerIds[0]}`, 'seller_direct', sellerIds[0], 10000, 2000,
          [line(a, 2000)], 2000),
        shipment(`seller_direct:${sellerIds[1]}`, 'seller_direct', sellerIds[1], 10000, 1000,
          [line(b, 1000)], 1000),
        shipment('owool_fulfillment', 'owool_fulfillment', null, 20000, 2000,
          [line(pooledA, 1000), line(pooledB, 1000)], 2000),
      ],
    };
    const saved = await insertOrderSnapshot(client, input);
    assert.equal(saved.status, 'PENDING_PAYMENT');
    assert.equal(saved.payableWon, 44000);
    assert.equal(saved.shipments.length, 3);
    assert.deepEqual(saved.shipments.find(({ key }) => key === 'owool_fulfillment').lines
      .map(({ sellerId }) => sellerId).sort(), [...sellerIds].sort());
    assert.deepEqual(saved.shipments.map(({ goodsDiscountWon }) => goodsDiscountWon).sort(), [1000, 2000, 2000]);
    const fromDb = await getOrderSnapshot(client, accountId, saved.id);
    assert.deepEqual(fromDb, saved);
    assert.equal(await getOrderSnapshot(client, otherId, saved.id), null);
    const alloc = await client.query(`SELECT version_id,amount_won FROM order_promotion_allocations
      WHERE checkout_order_id=$1 ORDER BY amount_won DESC`, [saved.id]);
    assert.deepEqual(alloc.rows.map(({ version_id, amount_won }) => [version_id, amount_won]),
      [[versionId, 2000], [versionId, 2000], [versionId, 1000]]);
    await assert.rejects(insertOrderSnapshot(client, { ...input, reservationId: randomUUID(),
      goodsDiscountWon: 5001 }), /Invalid order snapshot/);
    const count = await client.query('SELECT count(*)::int AS n FROM checkout_orders WHERE account_id=$1', [accountId]);
    assert.equal(count.rows[0].n, 1);
    await client.query('ROLLBACK');
  } finally {
    try { await client.query('ROLLBACK'); } catch { /* connection may already be closed */ }
    client.release();
    await pool.end();
  }
});
