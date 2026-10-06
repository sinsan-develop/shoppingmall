import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductQuestions } from '../app/products/[productId]/questions.tsx';

test('published Q&A and pre-purchase product-only inquiry are separate on product detail', () => {
  const html = renderToStaticMarkup(createElement(ProductQuestions,
    { productId: 'product-1',title: '가상 상품' }));
  for (const label of ['상품 문의','구매 전에도 문의할 수 있습니다','문의 등록',
    '관리자 공개 승인']) assert.match(html,new RegExp(label));
  const source = readFileSync(new URL('../app/products/[productId]/questions.tsx',
    import.meta.url),'utf8');
  assert.match(source,/customer\/support\/questions/);
  assert.match(source,/catalog\/products\/.*questions/);
  assert.match(source,/productId.*text/s);
  assert.match(source,/idempotency-key/);
  assert.doesNotMatch(source,/orderId|shipmentOrderId/);
});
