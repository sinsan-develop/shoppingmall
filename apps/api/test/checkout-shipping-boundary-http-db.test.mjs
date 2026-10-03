import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { runQaCatalogFixture } from '../scripts/qa-catalog-fixture.ts';
import { createApp } from '../src/app.ts';

test('customer HTTP quote applies 49,999/50,000 free-shipping boundary to each of three sellers', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const runId = randomBytes(4).toString('hex');
  const databaseUrl = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString: databaseUrl });
  let seeded = false;
  let app;
  try {
    const policy = (await pool.query('SELECT fee_won,free_threshold_won FROM shipping_policy_global')).rows[0];
    assert.deepEqual(policy, { fee_won: 3000, free_threshold_won: 50000 });
    await runQaCatalogFixture('seed', runId, databaseUrl, 'test-only-password-12345');
    seeded = true;
    const rows = (await pool.query(
      `SELECT r.title,o.id AS option_id,p.seller_id FROM product_revisions r
       JOIN product_publications pub ON pub.revision_id=r.id
       JOIN products p ON p.id=pub.product_id
       JOIN product_options o ON o.revision_id=r.id
       WHERE r.title LIKE $1`, [`qa-${runId}-%`],
    )).rows;
    assert.equal(rows.length, 5);
    const byItem = new Map(rows.map((row) => [row.title.slice(`qa-${runId}-`.length), row]));
    await pool.query('UPDATE product_options SET price_won=49999 WHERE id=$1', [byItem.get('고추').option_id]);
    await pool.query('UPDATE product_options SET price_won=50000 WHERE id=$1', [byItem.get('마늘').option_id]);
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const origin = 'http://127.0.0.1:9091';
    const login = await fetch(`${base}/auth/login`, { method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: `qa+${runId}-customer@example.invalid`,
        password: 'test-only-password-12345', role: 'customer' }) });
    assert.equal(login.status, 201);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    for (const item of ['고추', '고춧가루', '마늘']) {
      const response = await fetch(`${base}/customer/cart/items/${byItem.get(item).option_id}`, {
        method: 'PUT', headers: { origin, cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ quantity: 1 }),
      });
      assert.equal(response.status, 200);
    }
    const response = await fetch(`${base}/customer/cart/quote`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const quote = await response.json();
    assert.deepEqual(quote.shipments.map(({ goodsWon, shippingWon, totalWon }) =>
      [goodsWon, shippingWon, totalWon]),
    [[49999, 3000, 52999], [18000, 3000, 21000], [50000, 0, 50000]]);
    assert.equal(quote.shipments[0].sellerId, byItem.get('고추').seller_id);
    assert.equal(quote.shipments[1].shippingMode, 'owool_fulfillment');
    assert.equal(quote.shipments[2].sellerId, byItem.get('마늘').seller_id);
    assert.notEqual(quote.shipments[0].sellerId, quote.shipments[2].sellerId);
    assert.deepEqual([quote.goodsWon, quote.shippingWon, quote.totalWon], [117999, 6000, 123999]);
  } finally {
    if (app) await app.close();
    await pool.end();
    if (seeded) await runQaCatalogFixture('reset', runId, databaseUrl);
  }
});
