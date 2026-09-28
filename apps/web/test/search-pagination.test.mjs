import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeProductPage } from '../app/products/search-pagination.ts';

const item = (id) => ({ productId: id, title: id, sellerName: '판매자',
  originLabel: '산지', minPriceWon: 1000 });

test('a full duplicate search page ends pagination instead of offering endless more', () => {
  const current = Array.from({ length: 24 }, (_, index) => item(`p${index}`));
  const merged = mergeProductPage(current, [...current], 2);
  assert.deepEqual(merged.products, current);
  assert.equal(merged.firstNewId, null);
  assert.equal(merged.hasMore, false);
  assert.equal(merged.ended, true);
});

test('a search page adds new IDs once and preserves the next-page boundary', () => {
  const merged = mergeProductPage([item('p0')], [item('p0'), item('p1'),
    ...Array.from({ length: 22 }, (_, index) => item(`p${index + 2}`))], 2);
  assert.equal(merged.products.length, 24);
  assert.equal(merged.firstNewId, 'p1');
  assert.equal(merged.hasMore, true);
  assert.equal(merged.ended, false);
});

test('an empty search page and a final short page terminate safely', () => {
  const current = [item('p0')];
  assert.deepEqual(mergeProductPage(current, [], 2), {
    products: current, firstNewId: null, hasMore: false, ended: true,
  });
  assert.deepEqual(mergeProductPage(current, [item('p1')], 2), {
    products: [...current, item('p1')], firstNewId: 'p1', hasMore: false, ended: true,
  });
});
