import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createApp } from '../src/app.ts';

test('review write routes require Origin and a customer session before database work',
  { skip: !!process.env.DATABASE_URL }, async () => {
    const app = await createApp();
    try {
      await app.listen(0, '127.0.0.1');
      const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
      const body = { confirmationId: randomUUID(), rating: 5, text: '좋아요' };
      const request = (path, method, origin) => fetch(base + path, {
        method, headers: { origin, 'content-type': 'application/json',
          'idempotency-key': randomUUID() }, body: JSON.stringify(body),
      });
      assert.equal((await request('/customer/support/reviews','POST','http://evil.invalid')).status, 403);
      assert.equal((await request('/customer/support/reviews','POST','http://127.0.0.1:9091')).status, 401);
      assert.equal((await request(`/customer/support/reviews/${randomUUID()}`,'PUT',
        'http://127.0.0.1:9091')).status, 401);
      assert.equal((await fetch(`${base}/customer/support/reviews/${randomUUID()}`)).status, 401);
    } finally { await app.close(); }
  });
