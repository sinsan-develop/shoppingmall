import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('home menu links reach a real catalog or an existing home section', () => {
  const html = renderToStaticMarkup(createElement(HomePage));
  assert.match(html, /href="\/"[^>]*>홈<\/a>/);
  assert.match(html, /href="\/products"[^>]*>제철 농산물<\/a>/);
  assert.match(html, /href="\/#events-title"[^>]*>기획전<\/a>/);
  assert.match(html, /href="\/#seller-story-title"[^>]*>판매자 이야기<\/a>/);
  const source = readFileSync(new URL('../app/home-catalog.tsx', import.meta.url), 'utf8');
  assert.match(source, /id="seller-story-title"/);
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

test('seller deep link remains a visible and editable search filter', () => {
  const html = renderToStaticMarkup(createElement(ProductSearchView, {
    query: '', sort: 'latest', categoryId: '', sellerId: 'seller-a',
    categories: [], sellers: [{ id: 'seller-a', displayName: '진주농가' }],
    products: [], loading: false,
  }));
  assert.match(html, /name="sellerId"/);
  assert.match(html, /value="seller-a" selected=""[^>]*>진주농가/);
});

test('category choices group each minor beneath its selectable major', () => {
  const html = renderToStaticMarkup(createElement(ProductSearchView, {
    query: '', sort: 'latest', categoryId: 'vegetable', loading: false, products: [],
    categories: [
      { id: 'chili', parentId: 'vegetable', name: '고추' },
      { id: 'fruit', parentId: null, name: '과일' },
      { id: 'blueberry', parentId: 'fruit', name: '블루베리' },
      { id: 'vegetable', parentId: null, name: '채소' },
      { id: 'onion', parentId: 'vegetable', name: '양파' },
    ],
  }));
  assert.match(html, /<optgroup label="과일">.*value="fruit".*과일 전체.*value="blueberry".*블루베리.*<\/optgroup>/);
  assert.match(html, /<optgroup label="채소">.*value="vegetable" selected="".*채소 전체.*value="chili".*고추.*value="onion".*양파.*<\/optgroup>/);
  assert.ok(html.indexOf('label="과일"') < html.indexOf('label="채소"'));
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

test('approved product detail displays only server-gated image IDs and keeps private keys hidden', () => {
  const html = renderToStaticMarkup(createElement(ProductDetailView, {
    product: { productId: 'p1', title: '햇고추', description: '상품 설명', sellerName: '어울 농가',
      originLabel: '경남 진주', shippingMode: 'seller_direct', options: [],
      images: [{ id: 'i1', purpose: 'thumbnail', displayOrder: 0 },
        { id: 'i2', purpose: 'detail', displayOrder: 1 }] },
  }));
  assert.match(html, /사진을 불러오는 중/);
  const source = readFileSync(new URL('../app/products/[productId]/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /images\/\$\{encodeURIComponent\(product\.images\[0\]\.id\)\}/);
  assert.match(source, /images\/\$\{encodeURIComponent\(image\.id\)\}/);
  assert.doesNotMatch(html, /quarantine\/|objectKey|상품 사진 준비 중/);
});
