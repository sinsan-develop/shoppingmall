import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.ts';

test('local image upload is disabled by default and rejects a forged seller header', {
  skip: !!process.env.DATABASE_URL,
}, async () => {
  const previous = process.env.ENABLE_LOCAL_UPLOAD;
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const path = `/catalog/seller/products/00000000-0000-0000-0000-000000000001/revisions/00000000-0000-0000-0000-000000000002/images`;
    const request = () => fetch(`${base}${path}`, { method: 'POST',
      headers: { origin: 'http://127.0.0.1:9091', 'x-role': 'seller', 'x-image-purpose': 'thumbnail', 'content-type': 'image/png' },
      body: Buffer.from('not an image'),
    });
    delete process.env.ENABLE_LOCAL_UPLOAD;
    assert.equal((await request()).status, 404);
    process.env.ENABLE_LOCAL_UPLOAD = '1';
    assert.equal((await request()).status, 401);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_LOCAL_UPLOAD;
    else process.env.ENABLE_LOCAL_UPLOAD = previous;
    await app.close();
  }
});
