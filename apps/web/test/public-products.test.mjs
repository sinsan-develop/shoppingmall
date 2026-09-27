import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage from '../app/page.tsx';
import ProductsPage, { ProductSearchView } from '../app/products/page.tsx';

test('home search is an actual product search form, not a decorative preview', () => {
  const html = renderToStaticMarkup(createElement(HomePage));
  assert.match(html, /action="\/products"/);
  assert.match(html, /name="q"/);
  assert.match(html, /상품 검색/);
});

test('public product search shows server results and bounded controls without staged image keys', () => {
  const html = renderToStaticMarkup(createElement(ProductSearchView, {
    query: '고추', sort: 'latest', categoryId: '', categories: [],
    products: [{ productId: 'p1', title: '햇고추', sellerName: '어울 농가', originLabel: '경남 진주',
      minPriceWon: 23000 }], loading: false,
  }));
  assert.match(html, /햇고추/);
  assert.match(html, /23,000원/);
  assert.match(html, /어울 농가/);
  assert.match(html, /최저가순/);
  assert.doesNotMatch(html, /objectKey|quarantine\//);
  const empty = renderToStaticMarkup(createElement(ProductSearchView, {
    query: '없는 상품', sort: 'latest', categoryId: '', categories: [], products: [], loading: false,
  }));
  assert.match(empty, /검색 결과가 없습니다/);
  assert.match(renderToStaticMarkup(createElement(ProductsPage)), /상품을 찾고 있습니다/);
  const priceSort = renderToStaticMarkup(createElement(ProductSearchView, {
    query: '고추', sort: 'price_asc', categoryId: '', categories: [], products: [], loading: false,
  }));
  assert.match(priceSort, /value="price_asc" selected=""/);
});
