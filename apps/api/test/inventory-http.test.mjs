import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.ts';

test('stock mutation routes reject forged seller and operator headers without sessions', {
  skip: !!process.env.DATABASE_URL,
}, async () => {
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const origin = 'http://127.0.0.1:9091';
    const optionId = '00000000-0000-0000-0000-000000000001';
    const requestId = '00000000-0000-0000-0000-000000000002';
    const stock = await fetch(`${base}/catalog/seller/options/${optionId}/stock`, {
      method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-role': 'seller' },
      body: JSON.stringify({ quantity: 10 }),
    });
    assert.equal(stock.status, 401);
    const approve = await fetch(`${base}/catalog/admin/stock-requests/${requestId}/approve`, {
      method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-role': 'admin' },
      body: '{}',
    });
    assert.equal(approve.status, 401);
  } finally { await app.close(); }
});
