import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createApp } from '../src/app.ts';

test('admin mock refund resume route enforces Origin and session',
  { skip: !!process.env.DATABASE_URL }, async () => {
    const app = await createApp();
    try {
      await app.listen(0, '127.0.0.1');
      const path = `http://127.0.0.1:${app.getHttpServer().address().port}` +
        `/admin/support/claims/${randomUUID()}/refund-resume`;
      const wrongOrigin = await fetch(path, { method: 'POST',
        headers: { origin: 'http://evil.invalid' } });
      assert.equal(wrongOrigin.status, 403);
      const noSession = await fetch(path, { method: 'POST',
        headers: { origin: 'http://127.0.0.1:9091' } });
      assert.equal(noSession.status, 401);
    } finally { await app.close(); }
  });
