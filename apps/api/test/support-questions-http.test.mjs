import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createApp } from '../src/app.ts';

test('support question HTTP routes enforce session and Origin before database work',
  { skip: !!process.env.DATABASE_URL }, async () => {
    const app = await createApp();
    try {
      await app.listen(0, '127.0.0.1');
      const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
      const id = randomUUID();
      const body = { productId: id, text: '구매 전 문의' };
      const wrongOrigin = await fetch(`${base}/customer/support/questions`, {
        method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.invalid',
          'idempotency-key': randomUUID() }, body: JSON.stringify(body),
      });
      assert.equal(wrongOrigin.status, 403);
      const noSession = await fetch(`${base}/customer/support/questions`, {
        method: 'POST', headers: { 'content-type': 'application/json',
          origin: 'http://127.0.0.1:9091', 'idempotency-key': randomUUID() },
        body: JSON.stringify(body),
      });
      assert.equal(noSession.status, 401);
      const customerRead = await fetch(`${base}/customer/support/questions/${id}`);
      assert.equal(customerRead.status, 401);
      const sellerReply = await fetch(`${base}/seller/support/questions/${id}/replies`, {
        method: 'POST', headers: { 'content-type': 'application/json',
          origin: 'http://127.0.0.1:9091' }, body: JSON.stringify({ text: '답변' }),
      });
      assert.equal(sellerReply.status, 401);
      const adminPublish = await fetch(`${base}/admin/support/questions/${id}/publish`, {
        method: 'POST', headers: { 'content-type': 'application/json',
          origin: 'http://127.0.0.1:9091' }, body: JSON.stringify({ messageId: randomUUID() }),
      });
      assert.equal(adminPublish.status, 401);
    } finally { await app.close(); }
  });
