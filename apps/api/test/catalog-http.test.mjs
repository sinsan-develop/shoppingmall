import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.ts';

test('catalog reads need a database and category creation never trusts a role header', {
  skip: !!process.env.DATABASE_URL,
}, async () => {
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const listing = await fetch(`${base}/catalog/categories`);
    assert.equal(listing.status, 503);
    const create = await fetch(`${base}/catalog/admin/majors`, {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:9091', 'content-type': 'application/json', 'x-role': 'admin' },
      body: JSON.stringify({ name: '과일' }),
    });
    assert.equal(create.status, 401);
    assert.equal((await fetch(`${base}/catalog/admin/proposals`, {
      headers: { 'x-role': 'admin' },
    })).status, 401);
    assert.equal((await fetch(`${base}/catalog/admin/proposals/00000000-0000-0000-0000-000000000001/reject`, {
      method: 'POST', headers: { origin: 'http://127.0.0.1:9091', 'x-role': 'admin', 'content-type': 'application/json' },
      body: JSON.stringify({ reason: '시험' }),
    })).status, 401);
  } finally {
    await app.close();
  }
});
