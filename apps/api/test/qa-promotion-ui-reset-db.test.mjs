import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { insertOrderSnapshot } from '../src/orders/repository.ts';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { assertSharedPromotionQaTarget, resetPromotionUiFixture } from '../scripts/qa-promotion-ui-reset.ts';

const runId = 'f44f1004';
const databaseUrl = process.env.DATABASE_URL;
const enabled = (() => {
  if (process.env.QA_ISOLATED_SHARED_FIXTURE_TEST !== '1' || !databaseUrl) return false;
  try {
    assertSharedPromotionQaTarget(runId, databaseUrl);
    return true;
  } catch {
    return false;
  }
})();

test('shared reset test preflight skips wrong port and database before seeding', () => {
  for (const target of [
    'postgresql://postgres@local-postgres:5433/shoppingmall',
    'postgresql://postgres@local-postgres:5432/not-shoppingmall',
  ]) {
    const childEnv = { ...process.env, QA_ISOLATED_SHARED_FIXTURE_TEST: '1', DATABASE_URL: target };
    delete childEnv.NODE_TEST_CONTEXT;
    const child = spawnSync(process.execPath, [
      '--import', 'tsx', '--test', '--test-name-pattern', 'shared reset removes exactly',
      fileURLToPath(import.meta.url),
    ], {
      encoding: 'utf8',
      env: childEnv,
    });
    assert.equal(child.status, 0, `${target}: ${child.stdout}\n${child.stderr}`);
    assert.match(`${child.stdout}\n${child.stderr}`, /skipped 1/);
    assert.match(`${child.stdout}\n${child.stderr}`, /fail 0/);
  }
});

async function seedThreeShipmentQaOrder(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const customerId = (await client.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [`qa+${runId}-customer@example.invalid`])).rows[0].account_id;
    const adminId = (await client.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [`qa+${runId}-admin@example.invalid`])).rows[0].account_id;
    const addressId = (await client.query(`INSERT INTO customer_addresses
      (account_id,label,recipient_name,phone,postal_code,line1)
      VALUES ($1,'QA','가상 고객','01000000000','12345','가상 주소') RETURNING id`,
    [customerId])).rows[0].id;
    const reservationId = (await client.query(`INSERT INTO checkout_reservations
      (account_id,idempotency_key,expires_at)
      VALUES ($1,$2,now()+interval '15 minutes') RETURNING id`,
    [customerId, randomUUID()])).rows[0].id;
    const campaignId = (await client.query(`INSERT INTO promotion_campaigns
      (title,kind,total_use_limit,per_account_use_limit,created_by_account_id)
      VALUES ($1,'goods_discount',10,1,$2) RETURNING id`,
    [`QA-${runId}-order`, adminId])).rows[0].id;
    const versionId = (await client.query(`INSERT INTO promotion_versions
      (campaign_id,version,scope,starts_at,ends_at,amount_kind,amount_value,created_by_account_id)
      VALUES ($1,1,'all',now(),now()+interval '1 day','fixed',5000,$2) RETURNING id`,
    [campaignId, adminId])).rows[0].id;
    const grantId = (await client.query(`INSERT INTO promotion_grants(account_id,version_id,source)
      VALUES ($1,$2,'code') RETURNING id`, [customerId, versionId])).rows[0].id;
    const useId = (await client.query(`INSERT INTO promotion_uses
      (account_id,campaign_id,version_id,grant_id,reservation_id,idempotency_key,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,now()+interval '10 minutes') RETURNING id`,
    [customerId, campaignId, versionId, grantId, reservationId, randomUUID()])).rows[0].id;
    const products = (await client.query(`SELECT p.id AS product_id,o.id AS option_id,p.seller_id,
      r.title,o.name,o.price_won FROM products p
      JOIN product_revisions r ON r.product_id=p.id
      JOIN product_options o ON o.revision_id=r.id
      WHERE r.title=ANY($1::text[])`,
    [[`qa-${runId}-고추`, `qa-${runId}-고춧가루`, `qa-${runId}-마늘`]])).rows;
    assert.equal(products.length, 3);
    const line = (title, discount) => {
      const item = products.find((row) => row.title === `qa-${runId}-${title}`);
      return { productId: item.product_id, optionId: item.option_id, sellerId: item.seller_id,
        productName: item.title, optionName: item.name, unitPriceWon: item.price_won,
        quantity: 1, goodsDiscountWon: discount, goodsPayableWon: item.price_won - discount };
    };
    const promotion = (amountWon) => ({ useId, campaignId, versionId,
      kind: 'goods_discount', amountWon });
    const shipment = (title, mode, discount) => {
      const item = line(title, discount);
      const sellerId = mode === 'seller_direct' ? item.sellerId : null;
      return { key: mode === 'seller_direct' ? `seller_direct:${sellerId}` : 'owool_fulfillment',
        shippingMode: mode, sellerId, goodsWon: item.unitPriceWon,
        goodsDiscountWon: discount, shippingFeeWon: 3000, shippingSupportWon: 0,
        payableWon: item.unitPriceWon - discount + 3000, lines: [item],
        promotions: [promotion(discount)] };
    };
    const saved = await insertOrderSnapshot(client, {
      accountId: customerId, reservationId, idempotencyKey: randomUUID(),
      requestFingerprint: 'a'.repeat(64),
      address: { id: addressId, recipientName: '가상 고객', phone: '01000000000',
        postalCode: '12345', line1: '가상 주소', line2: '' },
      expiresAt: new Date(Date.now() + 9 * 60000),
      goodsWon: 57000, goodsDiscountWon: 5000, shippingFeeWon: 9000,
      shippingSupportWon: 0, payableWon: 61000,
      shipments: [shipment('고추', 'seller_direct', 2000),
        shipment('고춧가루', 'owool_fulfillment', 1000),
        shipment('마늘', 'seller_direct', 2000)],
    });
    await client.query(`INSERT INTO audit_events
      (actor_account_id,active_role,action,target_type,target_id)
      VALUES ($1,'customer','pending_order_created','checkout_order',$2)`, [customerId, saved.id]);
    await client.query(`INSERT INTO audit_events
      (actor_account_id,active_role,action,target_type,target_id)
      VALUES ($1,'customer','customer.address_add','customer_address',$2)`, [customerId, addressId]);
    await client.query('COMMIT');
    return { orderId: saved.id, customerId, adminId, reservationId, addressId,
      campaignId, versionId, grantId, useId, shipments: saved.shipments };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function removeExactTestOrder(pool, orderId) {
  if (!orderId) return;
  await pool.query(`DELETE FROM audit_events WHERE target_type='checkout_order' AND target_id=$1`, [orderId]);
  await pool.query('DELETE FROM order_promotion_allocations WHERE checkout_order_id=$1', [orderId]);
  await pool.query('DELETE FROM order_status_events WHERE checkout_order_id=$1', [orderId]);
  await pool.query(`DELETE FROM shipment_order_lines WHERE shipment_order_id IN
    (SELECT id FROM shipment_orders WHERE checkout_order_id=$1)`, [orderId]);
  await pool.query('DELETE FROM shipment_orders WHERE checkout_order_id=$1', [orderId]);
  await pool.query('DELETE FROM checkout_orders WHERE id=$1', [orderId]);
}

async function assertQaOrderIntact(pool, order) {
  const counts = await pool.query(`SELECT
    (SELECT count(*)::int FROM checkout_orders WHERE id=$1) AS orders,
    (SELECT count(*)::int FROM shipment_orders WHERE checkout_order_id=$1) AS shipments,
    (SELECT count(*)::int FROM shipment_order_lines WHERE shipment_order_id IN
      (SELECT id FROM shipment_orders WHERE checkout_order_id=$1)) AS lines,
    (SELECT count(*)::int FROM order_promotion_allocations WHERE checkout_order_id=$1) AS allocations,
    (SELECT count(*)::int FROM order_status_events WHERE checkout_order_id=$1) AS events,
    (SELECT count(*)::int FROM promotion_uses WHERE id=$2) AS uses,
    (SELECT count(*)::int FROM audit_events WHERE target_type='checkout_order' AND target_id=$1::text) AS audit,
    (SELECT count(*)::int FROM promotion_campaigns WHERE id=$3) AS campaigns,
    (SELECT count(*)::int FROM account_identities WHERE identifier LIKE $4) AS accounts`,
  [order.orderId, order.useId, order.campaignId, `qa+${runId}-%@example.invalid`]);
  assert.deepEqual(counts.rows[0], {
    orders: 1, shipments: 3, lines: 3, allocations: 3, events: 1,
    uses: 1, audit: 1, campaigns: 1, accounts: 5,
  });
}

test('shared reset removes exactly one pending three-shipment QA order and its children', {
  skip: !enabled,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let seeded = false;
  let orderId;
  try {
    await runQaCatalogFixture('seed', runId, databaseUrl, 'test-only-shared-reset-password');
    seeded = true;
    ({ orderId } = await seedThreeShipmentQaOrder(pool));
    const result = await resetPromotionUiFixture(runId, databaseUrl);
    assert.equal(result.removedCampaigns, 1);
    for (const table of ['checkout_orders', 'shipment_orders', 'shipment_order_lines',
      'order_promotion_allocations', 'order_status_events']) {
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0, table);
    }
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_identities')).rows[0].n, 0);
  } finally {
    await removeExactTestOrder(pool, orderId);
    if (seeded && (await pool.query('SELECT count(*)::int AS n FROM account_identities')).rows[0].n) {
      await resetPromotionUiFixture(runId, databaseUrl);
    }
    await pool.end();
  }
});

test('shared reset preflights foreign uses of QA version and grant before deletion', {
  skip: !enabled,
}, async (context) => {
  const pool = new Pool({ connectionString: databaseUrl });
  let seeded = false;
  let order;
  let foreignAccountId;
  let foreignCampaignId;
  let foreignVersionId;
  let foreignGrantId;
  let foreignReservationId;
  try {
    await runQaCatalogFixture('seed', runId, databaseUrl, 'test-only-shared-reset-password');
    seeded = true;
    order = await seedThreeShipmentQaOrder(pool);
    foreignAccountId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    foreignCampaignId = (await pool.query(`INSERT INTO promotion_campaigns
      (title,kind,total_use_limit,per_account_use_limit,created_by_account_id)
      VALUES ($1,'goods_discount',10,1,$2) RETURNING id`,
    [`foreign-${randomUUID()}`, foreignAccountId])).rows[0].id;
    foreignVersionId = (await pool.query(`INSERT INTO promotion_versions
      (campaign_id,version,scope,starts_at,ends_at,amount_kind,amount_value,created_by_account_id)
      VALUES ($1,1,'all',now(),now()+interval '1 day','fixed',5000,$2) RETURNING id`,
    [foreignCampaignId, foreignAccountId])).rows[0].id;
    foreignGrantId = (await pool.query(`INSERT INTO promotion_grants(account_id,version_id,source)
      VALUES ($1,$2,'code') RETURNING id`, [foreignAccountId, foreignVersionId])).rows[0].id;
    foreignReservationId = (await pool.query(`INSERT INTO checkout_reservations
      (account_id,idempotency_key,expires_at)
      VALUES ($1,$2,now()+interval '15 minutes') RETURNING id`,
    [foreignAccountId, randomUUID()])).rows[0].id;
    for (const sample of [
      { name: 'foreign use references QA version only', versionId: order.versionId,
        grantId: foreignGrantId },
      { name: 'foreign use references QA grant only', versionId: foreignVersionId,
        grantId: order.grantId },
    ]) {
      await context.test(sample.name, async () => {
        const useId = (await pool.query(`INSERT INTO promotion_uses
          (account_id,campaign_id,version_id,grant_id,reservation_id,idempotency_key,expires_at)
          VALUES ($1,$2,$3,$4,$5,$6,now()+interval '10 minutes') RETURNING id`,
        [foreignAccountId, foreignCampaignId, sample.versionId, sample.grantId,
          foreignReservationId, randomUUID()])).rows[0].id;
        try {
          await assert.rejects(resetPromotionUiFixture(runId, databaseUrl),
            /QA order promotion use references/);
          await assertQaOrderIntact(pool, order);
          assert.equal((await pool.query('SELECT count(*)::int AS n FROM promotion_uses WHERE id=$1',
            [useId])).rows[0].n, 1);
        } finally {
          await pool.query('DELETE FROM promotion_uses WHERE id=$1', [useId]);
        }
      });
    }
  } finally {
    await removeExactTestOrder(pool, order?.orderId);
    if (foreignGrantId) await pool.query('DELETE FROM promotion_grants WHERE id=$1', [foreignGrantId]);
    if (foreignVersionId) await pool.query('DELETE FROM promotion_versions WHERE id=$1', [foreignVersionId]);
    if (foreignCampaignId) await pool.query('DELETE FROM promotion_campaigns WHERE id=$1', [foreignCampaignId]);
    if (foreignReservationId) await pool.query('DELETE FROM checkout_reservations WHERE id=$1',
      [foreignReservationId]);
    if (foreignAccountId) await pool.query('DELETE FROM accounts WHERE id=$1', [foreignAccountId]);
    if (seeded && (await pool.query('SELECT count(*)::int AS n FROM account_identities WHERE identifier LIKE $1',
      [`qa+${runId}-%@example.invalid`])).rows[0].n) await resetPromotionUiFixture(runId, databaseUrl);
    await pool.end();
  }
});

test('shared reset rejects foreign order references and unexpected states before deleting QA rows', {
  skip: !enabled,
}, async (context) => {
  const pool = new Pool({ connectionString: databaseUrl });
  let seeded = false;
  let order;
  let foreignAccountId;
  let foreignSellerId;
  let foreignSellerCategoryId;
  let foreignProductId;
  let foreignProductCategoryId;
  let foreignCampaignId;
  let foreignVersionId;
  let foreignGrantId;
  let foreignAddressId;
  let foreignReservationId;
  let foreignUseId;
  let foreignOrderId;
  try {
    await runQaCatalogFixture('seed', runId, databaseUrl, 'test-only-shared-reset-password');
    seeded = true;
    order = await seedThreeShipmentQaOrder(pool);
    foreignAccountId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    foreignSellerCategoryId = (await pool.query('INSERT INTO seller_categories(name) VALUES ($1) RETURNING id',
      [`foreign-${randomUUID()}`])).rows[0].id;
    foreignSellerId = (await pool.query(`INSERT INTO sellers(category_id,display_name)
      VALUES ($1,$2) RETURNING id`, [foreignSellerCategoryId, `foreign-${randomUUID()}`])).rows[0].id;
    foreignProductCategoryId = (await pool.query('INSERT INTO product_categories(name) VALUES ($1) RETURNING id',
      [`foreign-${randomUUID()}`])).rows[0].id;
    foreignProductId = (await pool.query('INSERT INTO products(seller_id,category_id) VALUES ($1,$2) RETURNING id',
      [foreignSellerId, foreignProductCategoryId])).rows[0].id;
    foreignCampaignId = (await pool.query(`INSERT INTO promotion_campaigns
      (title,kind,total_use_limit,per_account_use_limit,created_by_account_id)
      VALUES ($1,'goods_discount',10,1,$2) RETURNING id`,
    [`foreign-${randomUUID()}`, foreignAccountId])).rows[0].id;
    foreignVersionId = (await pool.query(`INSERT INTO promotion_versions
      (campaign_id,version,scope,starts_at,ends_at,amount_kind,amount_value,created_by_account_id)
      VALUES ($1,1,'all',now(),now()+interval '1 day','fixed',5000,$2) RETURNING id`,
    [foreignCampaignId, foreignAccountId])).rows[0].id;
    foreignGrantId = (await pool.query(`INSERT INTO promotion_grants(account_id,version_id,source)
      VALUES ($1,$2,'code') RETURNING id`, [foreignAccountId, foreignVersionId])).rows[0].id;
    foreignAddressId = (await pool.query(`INSERT INTO customer_addresses
      (account_id,label,recipient_name,phone,postal_code,line1)
      VALUES ($1,'foreign','가상 고객','01000000000','12345','가상 주소') RETURNING id`,
    [foreignAccountId])).rows[0].id;
    foreignReservationId = (await pool.query(`INSERT INTO checkout_reservations
      (account_id,idempotency_key,expires_at)
      VALUES ($1,$2,now()+interval '15 minutes') RETURNING id`,
    [foreignAccountId, randomUUID()])).rows[0].id;
    const shipmentId = order.shipments.find((row) => row.shippingMode === 'seller_direct').id;
    const cases = [
      { name: 'foreign customer', set: 'UPDATE checkout_orders SET account_id=$1 WHERE id=$2',
        restore: 'UPDATE checkout_orders SET account_id=$1 WHERE id=$2',
        foreign: foreignAccountId, own: order.customerId, id: order.orderId },
      { name: 'foreign address', set: 'UPDATE checkout_orders SET address_id=$1 WHERE id=$2',
        restore: 'UPDATE checkout_orders SET address_id=$1 WHERE id=$2',
        foreign: foreignAddressId, own: order.addressId, id: order.orderId },
      { name: 'foreign reservation', set: 'UPDATE checkout_orders SET reservation_id=$1 WHERE id=$2',
        restore: 'UPDATE checkout_orders SET reservation_id=$1 WHERE id=$2',
        foreign: foreignReservationId, own: order.reservationId, id: order.orderId },
      { name: 'foreign seller', set: 'UPDATE shipment_orders SET seller_id=$1 WHERE id=$2',
        restore: 'UPDATE shipment_orders SET seller_id=$1 WHERE id=$2',
        foreign: foreignSellerId, own: order.shipments.find((row) => row.id === shipmentId).sellerId,
        id: shipmentId },
      { name: 'foreign product', set: 'UPDATE shipment_order_lines SET product_id=$1 WHERE shipment_order_id=$2',
        restore: 'UPDATE shipment_order_lines SET product_id=$1 WHERE shipment_order_id=$2',
        foreign: foreignProductId, own: order.shipments.find((row) => row.id === shipmentId).lines[0].productId,
        id: shipmentId },
      { name: 'foreign promotion',
        set: 'UPDATE order_promotion_allocations SET campaign_id=$1 WHERE checkout_order_id=$2',
        restore: 'UPDATE order_promotion_allocations SET campaign_id=$1 WHERE checkout_order_id=$2',
        foreign: foreignCampaignId, own: order.campaignId, id: order.orderId },
      { name: 'foreign status actor',
        set: 'UPDATE order_status_events SET actor_account_id=$1 WHERE checkout_order_id=$2',
        restore: 'UPDATE order_status_events SET actor_account_id=$1 WHERE checkout_order_id=$2',
        foreign: foreignAccountId, own: order.customerId, id: order.orderId },
      { name: 'expired order',
        set: `UPDATE checkout_orders SET status='EXPIRED',ended_at=now() WHERE id=$1`,
        restore: `UPDATE checkout_orders SET status='PENDING_PAYMENT',ended_at=NULL WHERE id=$1`,
        id: order.orderId },
      { name: 'expired shipment',
        set: `UPDATE shipment_orders SET status='EXPIRED' WHERE id=$1`,
        restore: `UPDATE shipment_orders SET status='PENDING_PAYMENT' WHERE id=$1`,
        id: shipmentId },
      { name: 'foreign promotion grant', set: 'UPDATE promotion_uses SET grant_id=$1 WHERE id=$2',
        restore: 'UPDATE promotion_uses SET grant_id=$1 WHERE id=$2',
        foreign: foreignGrantId, own: order.grantId, id: order.useId },
    ];
    for (const sample of cases) {
      await context.test(sample.name, async () => {
        await pool.query(sample.set, sample.foreign ? [sample.foreign, sample.id] : [sample.id]);
        try {
          await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /QA order/);
          await assertQaOrderIntact(pool, order);
        } finally {
          await pool.query(sample.restore, sample.foreign ? [sample.own, sample.id] : [sample.id]);
        }
      });
    }
    foreignUseId = (await pool.query(`INSERT INTO promotion_uses
      (account_id,campaign_id,version_id,grant_id,reservation_id,idempotency_key,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,now()+interval '10 minutes') RETURNING id`,
    [foreignAccountId, foreignCampaignId, foreignVersionId, foreignGrantId,
      foreignReservationId, randomUUID()])).rows[0].id;
    foreignOrderId = (await pool.query(`INSERT INTO checkout_orders
      (account_id,reservation_id,idempotency_key,request_fingerprint,address_id,
       recipient_name,phone,postal_code,line1,goods_won,goods_discount_won,
       shipping_fee_won,shipping_support_won,payable_won,expires_at)
      VALUES ($1,$2,$3,$4,$5,'외부 고객','01000000000','12345','외부 주소',10000,1000,
        0,0,9000,now()+interval '10 minutes') RETURNING id`,
    [foreignAccountId, foreignReservationId, randomUUID(), 'b'.repeat(64), foreignAddressId])).rows[0].id;
    const foreignShipmentId = (await pool.query(`INSERT INTO shipment_orders
      (checkout_order_id,shipment_key,shipping_mode,seller_id,goods_won,goods_discount_won,
       shipping_fee_won,shipping_support_won,payable_won)
      VALUES ($1,$2,'seller_direct',$3,10000,1000,0,0,9000) RETURNING id`,
    [foreignOrderId, `seller_direct:${foreignSellerId}`, foreignSellerId])).rows[0].id;
    await pool.query(`INSERT INTO order_promotion_allocations
      (checkout_order_id,shipment_order_id,promotion_use_id,campaign_id,version_id,kind,amount_won)
      VALUES ($1,$2,$3,$4,$5,'goods_discount',1000)`,
    [foreignOrderId, foreignShipmentId, foreignUseId, foreignCampaignId, order.versionId]);
    await context.test('foreign order allocation to the QA version', async () => {
      await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /QA order/);
      await assertQaOrderIntact(pool, order);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM checkout_orders WHERE id=$1',
        [foreignOrderId])).rows[0].n, 1);
    });
  } finally {
    await removeExactTestOrder(pool, foreignOrderId);
    await removeExactTestOrder(pool, order?.orderId);
    if (foreignUseId) await pool.query('DELETE FROM promotion_uses WHERE id=$1', [foreignUseId]);
    if (foreignGrantId) await pool.query('DELETE FROM promotion_grants WHERE id=$1', [foreignGrantId]);
    if (foreignVersionId) await pool.query('DELETE FROM promotion_versions WHERE id=$1', [foreignVersionId]);
    if (foreignCampaignId) await pool.query('DELETE FROM promotion_campaigns WHERE id=$1', [foreignCampaignId]);
    if (foreignReservationId) await pool.query('DELETE FROM checkout_reservations WHERE id=$1',
      [foreignReservationId]);
    if (foreignAddressId) await pool.query('DELETE FROM customer_addresses WHERE id=$1', [foreignAddressId]);
    if (foreignProductId) await pool.query('DELETE FROM products WHERE id=$1', [foreignProductId]);
    if (foreignProductCategoryId) await pool.query('DELETE FROM product_categories WHERE id=$1',
      [foreignProductCategoryId]);
    if (foreignSellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [foreignSellerId]);
    if (foreignSellerCategoryId) await pool.query('DELETE FROM seller_categories WHERE id=$1',
      [foreignSellerCategoryId]);
    if (foreignAccountId) await pool.query('DELETE FROM accounts WHERE id=$1', [foreignAccountId]);
    if (seeded && (await pool.query('SELECT count(*)::int AS n FROM account_identities WHERE identifier LIKE $1',
      [`qa+${runId}-%@example.invalid`])).rows[0].n) await resetPromotionUiFixture(runId, databaseUrl);
    await pool.end();
  }
});

test('shared promotion reset refuses a foreign cart and leaves every QA row unchanged', {
  skip: !enabled,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let seeded = false;
  let foreignAccountId;
  try {
    await runQaCatalogFixture('seed', runId, databaseUrl, 'test-only-shared-reset-password');
    seeded = true;
    const option = await pool.query(`SELECT o.id FROM product_options o
      JOIN product_revisions r ON r.id=o.revision_id WHERE r.title=$1`, [`qa-${runId}-고추`]);
    foreignAccountId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await pool.query('INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,1)',
      [foreignAccountId, option.rows[0].id]);
    await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /outside QA accounts/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM customer_cart_items WHERE account_id=$1',
      [foreignAccountId])).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM product_revisions WHERE title LIKE $1',
      [`qa-${runId}-%`])).rows[0].n, 5);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_identities WHERE identifier LIKE $1',
      [`qa+${runId}-%@example.invalid`])).rows[0].n, 5);
  } finally {
    if (foreignAccountId) {
      await pool.query('DELETE FROM customer_cart_items WHERE account_id=$1', [foreignAccountId]);
      await pool.query('DELETE FROM accounts WHERE id=$1', [foreignAccountId]);
    }
    if (seeded) await resetPromotionUiFixture(runId, databaseUrl);
    await pool.end();
  }
});

test('shared promotion reset rolls back promotion and account rows if catalog is unsafe', {
  skip: !enabled,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let seeded = false;
  let imageId;
  try {
    await runQaCatalogFixture('seed', runId, databaseUrl, 'test-only-shared-reset-password');
    seeded = true;
    const admin = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [`qa+${runId}-admin@example.invalid`])).rows[0].account_id;
    const campaignId = (await pool.query(`INSERT INTO promotion_campaigns
      (title,kind,total_use_limit,per_account_use_limit,created_by_account_id)
      VALUES ($1,'goods_discount',10,1,$2) RETURNING id`, [`QA-${runId}-test`, admin])).rows[0].id;
    await pool.query(`INSERT INTO audit_events(actor_account_id,active_role,action,target_type,target_id)
      VALUES ($1,'admin','promotion.campaign_create','promotion_campaign',$2)`, [admin, campaignId]);
    const revision = (await pool.query('SELECT id FROM product_revisions WHERE title=$1',
      [`qa-${runId}-고추`])).rows[0].id;
    imageId = (await pool.query(`INSERT INTO product_images(revision_id,object_key,purpose,mime_type,size_bytes)
      VALUES ($1,$2,'thumbnail','image/png',1) RETURNING id`, [revision, `qa/${runId}/foreign.png`])).rows[0].id;
    await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /additional revisions or images/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM promotion_campaigns WHERE created_by_account_id=$1',
      [admin])).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_identities WHERE identifier LIKE $1',
      [`qa+${runId}-%@example.invalid`])).rows[0].n, 5);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1',
      [campaignId])).rows[0].n, 1);
  } finally {
    if (imageId) await pool.query('DELETE FROM product_images WHERE id=$1', [imageId]);
    if (seeded) await resetPromotionUiFixture(runId, databaseUrl);
    await pool.end();
  }
});

test('shared promotion reset refuses a foreign grant without deleting its campaign', {
  skip: !enabled,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let seeded = false;
  let foreignAccountId;
  let foreignGrantId;
  try {
    await runQaCatalogFixture('seed', runId, databaseUrl, 'test-only-shared-reset-password');
    seeded = true;
    const admin = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [`qa+${runId}-admin@example.invalid`])).rows[0].account_id;
    const campaignId = (await pool.query(`INSERT INTO promotion_campaigns
      (title,kind,total_use_limit,per_account_use_limit,created_by_account_id)
      VALUES ($1,'goods_discount',10,1,$2) RETURNING id`, [`QA-${runId}-foreign-grant`, admin])).rows[0].id;
    const versionId = (await pool.query(`INSERT INTO promotion_versions
      (campaign_id,version,scope,starts_at,ends_at,amount_kind,amount_value,created_by_account_id)
      VALUES ($1,1,'all',now(),now()+interval '1 day','fixed',1000,$2) RETURNING id`,
    [campaignId, admin])).rows[0].id;
    foreignAccountId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    foreignGrantId = (await pool.query(`INSERT INTO promotion_grants(account_id,version_id,source)
      VALUES ($1,$2,'code') RETURNING id`, [foreignAccountId, versionId])).rows[0].id;
    await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /outside QA accounts/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM promotion_grants WHERE id=$1',
      [foreignGrantId])).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM promotion_campaigns WHERE id=$1',
      [campaignId])).rows[0].n, 1);
  } finally {
    if (foreignGrantId) await pool.query('DELETE FROM promotion_grants WHERE id=$1', [foreignGrantId]);
    if (foreignAccountId) await pool.query('DELETE FROM accounts WHERE id=$1', [foreignAccountId]);
    if (seeded) await resetPromotionUiFixture(runId, databaseUrl);
    await pool.end();
  }
});

test('shared reset refuses foreign stock and shipping actors and off-run audit targets', {
  skip: !enabled,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let seeded = false;
  let foreignAccountId;
  let requestId;
  let auditId;
  let foreignAddressId;
  let ownedAddressId;
  try {
    await runQaCatalogFixture('seed', runId, databaseUrl, 'test-only-shared-reset-password');
    seeded = true;
    foreignAccountId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const optionId = (await pool.query(`SELECT o.id FROM product_options o
      JOIN product_revisions r ON r.id=o.revision_id WHERE r.title=$1`, [`qa-${runId}-고추`])).rows[0].id;
    requestId = (await pool.query(`INSERT INTO stock_change_requests
      (option_id,target_on_hand,requested_by_account_id) VALUES ($1,6,$2) RETURNING id`,
    [optionId, foreignAccountId])).rows[0].id;
    await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /outside QA accounts/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM stock_change_requests WHERE id=$1',
      [requestId])).rows[0].n, 1);
    await pool.query('DELETE FROM stock_change_requests WHERE id=$1', [requestId]);
    requestId = undefined;

    const sellerId = (await pool.query('SELECT id FROM sellers WHERE display_name=$1',
      [`qa-${runId}-seller-a`])).rows[0].id;
    requestId = (await pool.query(`INSERT INTO seller_shipping_policy_requests
      (seller_id,policy,requested_by_account_id) VALUES ($1,$2::jsonb,$3) RETURNING id`,
    [sellerId, '{}', foreignAccountId])).rows[0].id;
    await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /outside QA accounts/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM seller_shipping_policy_requests WHERE id=$1',
      [requestId])).rows[0].n, 1);
    await pool.query('DELETE FROM seller_shipping_policy_requests WHERE id=$1', [requestId]);
    requestId = undefined;

    const adminId = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [`qa+${runId}-admin@example.invalid`])).rows[0].account_id;
    auditId = (await pool.query(`INSERT INTO audit_events
      (actor_account_id,active_role,action,target_type,target_id)
      VALUES ($1,'admin','qa.test','product',$2) RETURNING id`,
    [adminId, foreignAccountId])).rows[0].id;
    await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /audit history references/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM audit_events WHERE id=$1',
      [auditId])).rows[0].n, 1);
    await pool.query('DELETE FROM audit_events WHERE id=$1', [auditId]);
    auditId = undefined;
    foreignAddressId = (await pool.query(`INSERT INTO customer_addresses
      (account_id,label,recipient_name,phone,postal_code,line1)
      VALUES ($1,'foreign','가상 고객','01000000000','12345','가상 주소') RETURNING id`,
    [foreignAccountId])).rows[0].id;
    auditId = (await pool.query(`INSERT INTO audit_events
      (actor_account_id,active_role,action,target_type,target_id)
      VALUES ($1,'admin','qa.test','customer_address',$2) RETURNING id`,
    [adminId, foreignAddressId])).rows[0].id;
    await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /audit history references/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM audit_events WHERE id=$1',
      [auditId])).rows[0].n, 1);
    await pool.query('DELETE FROM audit_events WHERE id=$1', [auditId]);
    auditId = undefined;
    const customerId = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [`qa+${runId}-customer@example.invalid`])).rows[0].account_id;
    ownedAddressId = (await pool.query(`INSERT INTO customer_addresses
      (account_id,label,recipient_name,phone,postal_code,line1)
      VALUES ($1,'QA','가상 고객','01000000000','12345','가상 주소') RETURNING id`,
    [customerId])).rows[0].id;
    auditId = (await pool.query(`INSERT INTO audit_events
      (actor_account_id,active_role,action,target_type,target_id)
      VALUES ($1,'customer','qa.test','customer_address',$2) RETURNING id`,
    [foreignAccountId, ownedAddressId])).rows[0].id;
    await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /outside QA accounts/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM audit_events WHERE id=$1',
      [auditId])).rows[0].n, 1);
  } finally {
    if (auditId) await pool.query('DELETE FROM audit_events WHERE id=$1', [auditId]);
    if (requestId) {
      await pool.query('DELETE FROM stock_change_requests WHERE id=$1', [requestId]);
      await pool.query('DELETE FROM seller_shipping_policy_requests WHERE id=$1', [requestId]);
    }
    if (foreignAddressId) await pool.query('DELETE FROM customer_addresses WHERE id=$1', [foreignAddressId]);
    if (ownedAddressId) await pool.query('DELETE FROM customer_addresses WHERE id=$1', [ownedAddressId]);
    if (foreignAccountId) await pool.query('DELETE FROM accounts WHERE id=$1', [foreignAccountId]);
    if (seeded) await resetPromotionUiFixture(runId, databaseUrl);
    await pool.end();
  }
});

test('shared reset refuses a duplicate-name seller in its QA category', {
  skip: !enabled,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let seeded = false;
  let duplicateSellerId;
  try {
    await runQaCatalogFixture('seed', runId, databaseUrl, 'test-only-shared-reset-password');
    seeded = true;
    duplicateSellerId = (await pool.query(`INSERT INTO sellers(category_id,display_name)
      SELECT id,$2 FROM seller_categories WHERE name=$1 RETURNING id`,
    [`qa-${runId}-sellers`, `qa-${runId}-seller-a`])).rows[0].id;
    await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /unexpected seller/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM sellers WHERE id=$1',
      [duplicateSellerId])).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_identities WHERE identifier LIKE $1',
      [`qa+${runId}-%@example.invalid`])).rows[0].n, 5);
  } finally {
    if (duplicateSellerId) await pool.query('DELETE FROM sellers WHERE id=$1', [duplicateSellerId]);
    if (seeded) await resetPromotionUiFixture(runId, databaseUrl);
    await pool.end();
  }
});

test('shared reset refuses a foreign product reviewer or publisher', {
  skip: !enabled,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let seeded = false;
  let foreignAccountId;
  try {
    await runQaCatalogFixture('seed', runId, databaseUrl, 'test-only-shared-reset-password');
    seeded = true;
    foreignAccountId = (await pool.query('INSERT INTO accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    const adminId = (await pool.query('SELECT account_id FROM account_identities WHERE identifier=$1',
      [`qa+${runId}-admin@example.invalid`])).rows[0].account_id;
    const revisionId = (await pool.query('SELECT id FROM product_revisions WHERE title=$1',
      [`qa-${runId}-고추`])).rows[0].id;
    await pool.query('UPDATE product_revisions SET reviewed_by_account_id=$1 WHERE id=$2',
      [foreignAccountId, revisionId]);
    await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /product ownership/);
    assert.equal((await pool.query('SELECT reviewed_by_account_id FROM product_revisions WHERE id=$1',
      [revisionId])).rows[0].reviewed_by_account_id, foreignAccountId);
    await pool.query('UPDATE product_revisions SET reviewed_by_account_id=$1 WHERE id=$2', [adminId, revisionId]);
    await pool.query('UPDATE product_publications SET published_by_account_id=$1 WHERE revision_id=$2',
      [foreignAccountId, revisionId]);
    await assert.rejects(resetPromotionUiFixture(runId, databaseUrl), /publication ownership/);
    assert.equal((await pool.query('SELECT published_by_account_id FROM product_publications WHERE revision_id=$1',
      [revisionId])).rows[0].published_by_account_id, foreignAccountId);
    await pool.query('UPDATE product_publications SET published_by_account_id=$1 WHERE revision_id=$2',
      [adminId, revisionId]);
  } finally {
    if (foreignAccountId) await pool.query('DELETE FROM accounts WHERE id=$1', [foreignAccountId]);
    if (seeded) await resetPromotionUiFixture(runId, databaseUrl);
    await pool.end();
  }
});
