import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { qaNames } from '../scripts/qa-fixture.ts';
import { runQaPublicFixture } from '../scripts/qa-public-fixture.ts';

const origin = 'http://127.0.0.1:9091';
const password = 'test-only-password-12345';

test('customer lists own coupon, previews direct/code discounts and shipping without using a coupon', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomBytes(4).toString('hex');
  const names = qaNames(runId);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let seeded = false; let app; let customerId; let optionId;
  const campaignIds = [];
  try {
    const product = await runQaPublicFixture('seed', runId, process.env.DATABASE_URL, password);
    seeded = true;
    optionId = (await pool.query('SELECT id FROM product_options WHERE revision_id=$1',
      [product.revisionId])).rows[0].id;
    const ids = (await pool.query('SELECT identifier,account_id FROM account_identities WHERE identifier=ANY($1::text[])',
      [names.emails])).rows;
    customerId = ids.find((row) => row.identifier === names.emails[0]).account_id;
    const sellerAccountId = ids.find((row) => row.identifier === names.emails[1]).account_id;
    const adminId = ids.find((row) => row.identifier === names.emails[4]).account_id;
    await pool.query('INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,2)',
      [customerId, optionId]);
    const startAt = new Date(Date.now() - 60_000);
    const endAt = new Date(Date.now() + 3_600_000);
    async function campaign(kind, amount, code) {
      const campaignId = (await pool.query(`INSERT INTO promotion_campaigns
        (title,kind,direct_issue_limit,total_use_limit,per_account_use_limit,created_by_account_id)
        VALUES ($1,$2,3,10,2,$3) RETURNING id`, [`QA-${runId}-${kind}`, kind, adminId])).rows[0].id;
      campaignIds.push(campaignId);
      const versionId = (await pool.query(`INSERT INTO promotion_versions
        (campaign_id,version,scope,starts_at,ends_at,minimum_eligible_goods_won,
          amount_kind,amount_value,created_by_account_id)
        VALUES ($1,1,'all',$2,$3,0,'fixed',$4,$5) RETURNING id`,
      [campaignId, startAt, endAt, amount, adminId])).rows[0].id;
      await pool.query('INSERT INTO promotion_codes(version_id,code) VALUES ($1,$2)', [versionId, code]);
      return { campaignId, versionId };
    }
    const goodsCode = `G${runId.toUpperCase()}`;
    const shippingCode = `S${runId.toUpperCase()}`;
    const goods = await campaign('goods_discount', 5000, goodsCode);
    const shipping = await campaign('shipping_support', 3000, shippingCode);
    const grantId = (await pool.query(`INSERT INTO promotion_grants
      (account_id,version_id,source,issued_by_account_id,idempotency_key,reason)
      VALUES ($1,$2,'direct',$3,$4,'QA') RETURNING id`,
    [customerId, goods.versionId, adminId, randomUUID()])).rows[0].id;
    const foreignGrantId = (await pool.query(`INSERT INTO promotion_grants
      (account_id,version_id,source,issued_by_account_id,idempotency_key,reason)
      VALUES ($1,$2,'direct',$3,$4,'QA ownership') RETURNING id`,
    [sellerAccountId, goods.versionId, adminId, randomUUID()])).rows[0].id;

    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    async function cookieFor(email, role) {
      const response = await fetch(`${base}/auth/login`, { method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, role }) });
      assert.equal(response.status, 201);
      return response.headers.get('set-cookie')?.split(';')[0];
    }
    const customer = await cookieFor(names.emails[0], 'customer');
    const seller = await cookieFor(names.emails[1], 'seller');
    const couponsPath = `${base}/customer/promotions/coupons`;
    assert.equal((await fetch(couponsPath)).status, 401);
    assert.equal((await fetch(couponsPath, { headers: { cookie: seller } })).status, 403);
    const available = await fetch(couponsPath, { headers: { cookie: customer } });
    assert.equal(available.status, 200);
    assert.deepEqual((await available.json()).map((item) => item.grantId), [grantId]);

    async function reserve() {
      const response = await fetch(`${base}/customer/checkout/reservations`, { method: 'POST',
        headers: { cookie: customer, origin, 'idempotency-key': randomUUID() } });
      assert.equal(response.status, 201);
      return response.json();
    }
    const hold = await reserve();
    assert.equal(hold.quote.goodsWon, 46000);
    assert.equal(hold.quote.shippingWon, 3000);
    const shipmentKey = hold.quote.shipments[0].key;
    const quotePath = `${base}/customer/checkout/reservations/${hold.id}/promotions/quote`;
    const postQuote = (body, cookie = customer, requestOrigin = origin) => fetch(quotePath, { method: 'POST',
      headers: { cookie, origin: requestOrigin, 'content-type': 'application/json' },
      body: JSON.stringify(body) });
    assert.equal((await postQuote({}, seller)).status, 403);
    assert.equal((await postQuote({}, customer, 'http://invalid.test')).status, 403);
    const selection = { goodsCoupon: { grantId }, shippingCoupons: [{ shipmentKey, code: shippingCode }] };
    const direct = await postQuote(selection);
    assert.equal(direct.status, 201);
    const first = await direct.json();
    assert.equal(first.discountWon, 5000);
    assert.equal(first.supportWon, 3000);
    assert.equal(first.payableTotalWon, 41000);
    const code = await postQuote({ goodsCoupon: { code: ` ${goodsCode.toLowerCase()} ` },
      shippingCoupons: [{ shipmentKey, code: shippingCode }] });
    assert.equal(code.status, 201);
    assert.equal((await code.json()).payableTotalWon, first.payableTotalWon);
    assert.equal((await postQuote({ goodsCoupon: { grantId: foreignGrantId } })).status, 404);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM promotion_uses')).rows[0].n, 0);

    const released = await fetch(`${base}/customer/checkout/reservations/${hold.id}`, { method: 'DELETE',
      headers: { cookie: customer, origin } });
    assert.equal(released.status, 200);
    await pool.query('UPDATE customer_cart_items SET quantity=3 WHERE account_id=$1 AND option_id=$2',
      [customerId, optionId]);
    const freeHold = await reserve();
    const free = await fetch(`${base}/customer/checkout/reservations/${freeHold.id}/promotions/quote`, {
      method: 'POST', headers: { cookie: customer, origin, 'content-type': 'application/json' },
      body: JSON.stringify({ shippingCoupons: [{ shipmentKey: freeHold.quote.shipments[0].key,
        code: shippingCode }] }),
    });
    assert.equal(free.status, 201);
    const freeQuote = await free.json();
    assert.equal(freeQuote.shippingWon, 0);
    assert.equal(freeQuote.supportWon, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM promotion_uses')).rows[0].n, 0);
    await pool.query(`UPDATE promotion_campaigns SET status='stopped',stopped_by_account_id=$2,
      stopped_at=now(),stop_reason='QA stop' WHERE id=$1`, [shipping.campaignId, adminId]);
    const stopped = await fetch(`${base}/customer/checkout/reservations/${freeHold.id}/promotions/quote`, {
      method: 'POST', headers: { cookie: customer, origin, 'content-type': 'application/json' },
      body: JSON.stringify({ shippingCoupons: [{ shipmentKey: freeHold.quote.shipments[0].key,
        code: shippingCode }] }),
    });
    assert.equal(stopped.status, 409);
  } finally {
    if (app) await app.close();
    if (customerId) {
      await pool.query('DELETE FROM checkout_reservation_lines WHERE reservation_id IN (SELECT id FROM checkout_reservations WHERE account_id=$1)', [customerId]);
      await pool.query('DELETE FROM checkout_reservations WHERE account_id=$1', [customerId]);
      await pool.query('DELETE FROM customer_cart_items WHERE account_id=$1', [customerId]);
    }
    if (campaignIds.length) {
      await pool.query('DELETE FROM promotion_uses WHERE campaign_id=ANY($1::uuid[])', [campaignIds]);
      await pool.query('DELETE FROM promotion_grants WHERE version_id IN (SELECT id FROM promotion_versions WHERE campaign_id=ANY($1::uuid[]))', [campaignIds]);
      await pool.query('DELETE FROM promotion_codes WHERE version_id IN (SELECT id FROM promotion_versions WHERE campaign_id=ANY($1::uuid[]))', [campaignIds]);
      await pool.query('DELETE FROM promotion_versions WHERE campaign_id=ANY($1::uuid[])', [campaignIds]);
      await pool.query('DELETE FROM promotion_campaigns WHERE id=ANY($1::uuid[])', [campaignIds]);
    }
    if (seeded) await runQaPublicFixture('reset', runId, process.env.DATABASE_URL);
    await pool.end();
  }
});
