import assert from 'node:assert/strict';
import test from 'node:test';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { CatalogController } from '../src/catalog/controller.ts';

test('published-product revision has a seller-only POST route and rejects unauthenticated access', async () => {
  const method = CatalogController.prototype.createProductRevision;
  assert.equal(typeof method, 'function');
  assert.equal(Reflect.getMetadata(PATH_METADATA, method), 'seller/products/:productId/revisions');
  assert.equal(Reflect.getMetadata(METHOD_METADATA, method), 1);
  const controller = new CatalogController({ getPool: () => null });
  await assert.rejects(controller.createProductRevision({ headers: { origin: 'http://127.0.0.1:9091' } },
    '00000000-0000-0000-0000-000000000000'), { status: 401 });
});
