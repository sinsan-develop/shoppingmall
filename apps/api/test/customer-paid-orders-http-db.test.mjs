import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { createApp } from '../src/app.ts';
import { cleanupRefundHttpFixture, refundCookies,
  seedRefundHttpFixture } from '../test-support/refund-http-fixture.mjs';

test('paid order history is owner-only, private and stable across cursor pages', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const fixtures = [];
  let app;
  try {
    for (let i = 0; i < 3; i++) fixtures.push(await seedRefundHttpFixture(pool));
    const [first, second, foreign] = fixtures;
    const cookies = refundCookies(first);
    await pool.query(`UPDATE checkout_orders SET account_id=$1,
      created_at='2026-10-05T01:02:03.123456Z' WHERE id=ANY($2::uuid[])`,
    [first.customerId, [first.orderId, second.orderId]]);
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const path = `http://127.0.0.1:${app.getHttpServer().address().port}/customer/checkout/orders`;
    const get = (query = '?status=PAID', cookie = cookies.customer) =>
      fetch(`${path}${query}`, { headers: cookie ? { cookie } : {} });
    assert.equal((await get('?status=PAID', '')).status, 401);
    for (const role of ['seller', 'admin']) assert.equal((await get('?status=PAID', cookies[role])).status, 403);
    for (const query of ['?status=EXPIRED', '?status=PAID&limit=0', '?status=PAID&limit=51',
      '?status=PAID&limit=1.5', '?status=PAID&cursor=bad', '?status=PAID&limit=2&limit=3'])
      assert.equal((await get(query)).status, 400, query);
    assert.deepEqual(await (await get('?status=PAID', cookies.otherCustomer)).json(),
      { items: [], nextCursor: null });
    const response = await get('?status=PAID&limit=1');
    assert.equal(response.status, 200);
    const page1 = await response.json();
    assert.equal(page1.items.length, 1);
    assert.ok(page1.nextCursor);
    const expected = [first.orderId, second.orderId].sort().reverse();
    assert.equal(page1.items[0].id, expected[0]);
    assert.deepEqual(Object.keys(page1.items[0]).sort(),
      ['id', 'status', 'createdAt', 'paidAt', 'payableWon', 'productSummary'].sort());
    assert.deepEqual(page1.items[0].productSummary,
      { productName: '환불 HTTP 시험 상품', optionName: '기본', lineCount: 1 });
    const page2 = await (await get(`?status=PAID&limit=1&cursor=${encodeURIComponent(page1.nextCursor)}`)).json();
    assert.deepEqual(page2.items.map(({ id }) => id), [expected[1]]);
    assert.equal(page2.nextCursor, null);
    const all = await (await get()).json();
    assert.deepEqual(all.items.map(({ id }) => id), expected);
    assert.equal(all.items.some(({ id }) => id === foreign.orderId), false);
    assert.doesNotMatch(JSON.stringify(all), /recipientName|phone|postalCode|address|provider|accountId/);
    const detail = await fetch(`${path}/${expected[1]}`, { headers: { cookie: cookies.customer } });
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).id, expected[1]);
    await pool.query(`UPDATE checkout_orders SET status='EXPIRED',paid_at=NULL WHERE id=$1`, [second.orderId]);
    assert.deepEqual((await (await get()).json()).items.map(({ id }) => id), [first.orderId]);
  } finally {
    if (app) await app.close();
    for (const ids of fixtures.reverse()) await cleanupRefundHttpFixture(pool, ids);
    await pool.end();
  }
});
