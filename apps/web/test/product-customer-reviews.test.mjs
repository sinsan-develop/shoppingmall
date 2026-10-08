import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicCustomerReviewsView } from '../app/products/[productId]/customer-reviews.tsx';

const review = { id: 'review-a',rating: 5,body: '상품이 좋아요',version: 1,
  createdAt: '2026-10-07T00:00:00Z',imageIds: ['image-a'] };

test('published reviews render only public image route and scoped report form', () => {
  const html = renderToStaticMarkup(createElement(PublicCustomerReviewsView, {
    productId: 'product-a',items: [review],nextCursor: 'next',busy: false,
    loading: false,message: '',reportMessages: {},onMore: () => {},
    onReload: () => {},onReport: () => {},
  }));
  assert.match(html,/상품이 좋아요/);
  assert.match(html,/사진을 불러오는 중/);
  assert.match(html,/신고/);
  assert.match(html,/더보기/);
  assert.doesNotMatch(html,/preview|storageKey|objectKey|claim.*evidence/);
  const source = readFileSync(new URL('../app/products/[productId]/customer-reviews.tsx',
    import.meta.url),'utf8');
  assert.match(source,/customer-reviews\/\$\{encodeURIComponent\(item\.id\)\}\/images\/\$\{encodeURIComponent\(imageId\)\}/);
  assert.match(source,/PublicImage/);
  assert.match(source,/credentials: 'include'/);
  assert.match(source,/cache: 'no-store'/);
  assert.match(source,/customer\/support\/reviews/);
  const detail = readFileSync(new URL('../app/products/[productId]/page.tsx',
    import.meta.url),'utf8');
  assert.match(detail,/PublicCustomerReviews/);
});
