import assert from 'node:assert/strict';
import test from 'node:test';
import * as detail from '../app/products/product-load-error.ts';

test('product network failures show actionable Korean text rather than browser error details', () => {
  assert.equal(detail.productLoadFailureMessage(new TypeError('Failed to fetch')), '상품을 불러올 수 없습니다');
  assert.equal(detail.productLoadFailureMessage(new Error('connection failed at private.internal')), '상품을 불러올 수 없습니다');
  assert.equal(detail.productLoadFailureMessage(undefined), '상품을 불러올 수 없습니다');
});

test('a known missing product keeps its distinct not-found message', () => {
  assert.equal(detail.productLoadFailureMessage(new Error('상품을 찾을 수 없습니다')), '상품을 찾을 수 없습니다');
});
