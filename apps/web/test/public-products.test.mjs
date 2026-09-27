import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage from '../app/page.tsx';
import ProductsPage, { ProductSearchView } from '../app/products/page.tsx';
import { ProductDetailView } from '../app/products/[productId]/page.tsx';

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
  assert.match(html, /href="\/products\/p1"/);
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

test('approved product detail shows option price and sold-out status without private image keys', () => {
  const html = renderToStaticMarkup(createElement(ProductDetailView, {
    product: { productId: 'p1', title: '햇고추', description: '정성껏 기른 고추',
      sellerName: '어울 농가', originLabel: '경남 진주', shippingMode: 'seller_direct',
      options: [{ id: 'o1', name: '500g', priceWon: 23000, sellableQuantity: 5 },
        { id: 'o2', name: '1kg', priceWon: 40000, sellableQuantity: 0 }] },
  }));
  for (const phrase of ['햇고추', '어울 농가', '경남 진주', '판매자 직접 발송', '500g', '23,000원', '1kg', '품절']) {
    assert.match(html, new RegExp(phrase));
  }
  assert.doesNotMatch(html, /objectKey|quarantine\/|장바구니에 담기/);
});
