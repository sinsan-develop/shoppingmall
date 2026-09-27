import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.ts';

test('product draft routes do not trust a seller role header', {
  skip: !!process.env.DATABASE_URL,
}, async () => {
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const listed = await fetch(`${base}/catalog/seller/products`, { headers: { 'x-role': 'seller' } });
    assert.equal(listed.status, 401);
    const created = await fetch(`${base}/catalog/seller/products`, {
      method: 'POST', headers: { origin: 'http://127.0.0.1:9091', 'x-role': 'seller',
        'content-type': 'application/json' },
      body: JSON.stringify({ title: '가짜 판매자 상품' }),
    });
    assert.equal(created.status, 401);
  } finally {
    await app.close();
  }
});
