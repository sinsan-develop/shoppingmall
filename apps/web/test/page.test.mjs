import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import Page from '../app/page.tsx';
import * as Home from '../app/home-catalog.tsx';

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
  assert.match(html, /상품을 불러오는 중/);
  assert.doesNotMatch(html, /장바구니 담기|결제하기|개인별 추천/);
});

test('home catalog links administrator categories and only supplied public products', () => {
  assert.equal(typeof Home.HomeCatalogView, 'function');
  const html = renderToStaticMarkup(createElement(Home.HomeCatalogView, {
    categories: [
      { id: 'major-1', parentId: null, name: '과일' },
      { id: 'minor-1', parentId: 'major-1', name: '블루베리' },
      { id: 'major-2', parentId: null, name: '채소' },
    ],
    products: [{ productId: 'published-1', title: '햇고추', sellerId: 'seller-1', sellerName: '진주농가',
      originLabel: '경남 진주', minPriceWon: 23000 }],
    loading: false,
  }));
  assert.match(html, /href="\/products\?categoryId=major-1"[^>]*>과일<\/a>/);
  assert.match(html, /href="\/products\?categoryId=major-2"[^>]*>채소<\/a>/);
  assert.doesNotMatch(html, /href="\/products\?categoryId=minor-1"/);
  assert.match(html, /href="\/products\/published-1"/);
  assert.match(html, /href="\/products\?sellerId=seller-1"[^>]*>진주농가<\/a>/);
  assert.match(html, /23,000원/);
  assert.doesNotMatch(html, /개인별 추천|objectKey|quarantine\//);
});

test('home catalog distinguishes empty public data from connection failure', () => {
  assert.equal(typeof Home.HomeCatalogView, 'function');
  const empty = renderToStaticMarkup(createElement(Home.HomeCatalogView, {
    categories: [], products: [], loading: false,
  }));
  assert.match(empty, /등록된 카테고리가 없습니다/);
  assert.match(empty, /상품 준비 중/);
  const failed = renderToStaticMarkup(createElement(Home.HomeCatalogView, {
    categories: [], products: [], loading: false, error: '연결 실패',
  }));
  assert.match(failed, /연결 실패/);
  assert.doesNotMatch(failed, /상품 준비 중/);
});
