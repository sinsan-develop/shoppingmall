import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from '../app/page.tsx';

test('web entry point identifies the real build without pretending to sell', () => {
  const html = renderToStaticMarkup(Page());
  assert.match(html, /어울몰/);
  assert.match(html, /서비스 구축 중/);
  assert.doesNotMatch(html, /결제하기/);
});

test('customer home exposes the approved five areas without fake purchasable products', () => {
  const html = renderToStaticMarkup(Page());
  for (const label of ['상품 검색', '어울몰 메뉴', '기획전', '상품 카테고리', '추천 상품']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /상품 준비 중/);
  assert.doesNotMatch(html, /장바구니 담기|결제하기|개인별 추천/);
});
