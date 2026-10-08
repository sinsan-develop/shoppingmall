import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createApp } from '../src/app.ts';

test('manual confirmation HTTP checks Origin and session before database work',
  { skip: !!process.env.DATABASE_URL }, async () => {
    const app = await createApp();
    try {
      await app.listen(0, '127.0.0.1');
      const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
      const body = { orderId: randomUUID(), shipmentOrderId: randomUUID(),
        optionId: randomUUID() };
      const request = (origin) => fetch(`${base}/customer/support/confirmations`, {
        method: 'POST', headers: { origin, 'content-type': 'application/json',
          'idempotency-key': randomUUID() }, body: JSON.stringify(body),
      });
      assert.equal((await request('http://evil.invalid')).status, 403);
      assert.equal((await request('http://127.0.0.1:9091')).status, 401);
    } finally { await app.close(); }
  });
