import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SellerProductsPage, { SellerProductView } from '../app/account/seller/products/page.tsx';

test('seller product page shows no private product before role check', () => {
  const html = renderToStaticMarkup(createElement(SellerProductsPage));
  assert.match(html, /판매자 권한 확인 중/);
  assert.doesNotMatch(html, /qa\+|시험 고추/);
});

test('seller can enter a minor category, shipping mode and multiple priced options as a draft', () => {
  const html = renderToStaticMarkup(createElement(SellerProductView, {
    categories: [{ id: 'major', parentId: null, name: '채소' },
      { id: 'minor', parentId: 'major', name: '고추' }],
    products: [], busy: false, onCreate: () => {}, onUpload: () => {}, onSubmitProposal: () => {},
  }));
  for (const label of ['상품 초안', '고추', '상품명', '산지', '발송 방식', '옵션 이름', '가격', '옵션 추가', '초안 저장']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /name="categoryId"/);
  assert.match(html, /name="shippingMode"/);
  assert.doesNotMatch(html, /공개 완료/);
});

test('a seller draft has a local preview and explicit private-photo and proposal actions', () => {
  const html = renderToStaticMarkup(createElement(SellerProductView, {
    categories: [], products: [{ productId: 'product', revisionId: 'revision', title: '고추', status: 'draft' }],
    busy: false, onCreate: () => {}, onUpload: () => {}, onSubmitProposal: () => {},
  }));
  for (const label of ['대표 사진', '사진 업로드', '승인 요청', '초안']) assert.match(html, new RegExp(label));
  assert.match(html, /type="file"/);
  assert.match(html, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.doesNotMatch(html, /고객에게 공개 중/);
});
