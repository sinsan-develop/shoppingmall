import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminCatalogPage, { AdminCatalogView } from '../app/account/admin/catalog/page.tsx';

test('classification page keeps private data behind admin session check', () => {
  const html = renderToStaticMarkup(createElement(AdminCatalogPage));
  assert.match(html, /운영자 권한 확인 중/);
  assert.doesNotMatch(html, /qa\+|시험 판매자/);
});

test('admin view separates product major/minor and seller category/seller registration', () => {
  const html = renderToStaticMarkup(createElement(AdminCatalogView, {
    majors: [{ id: 'major-1', name: '과일', parentId: null }],
    minors: [{ id: 'minor-1', name: '베리', parentId: 'major-1' }],
    sellerCategories: [{ id: 'group-1', name: '농가' }],
    sellers: [{ id: 'seller-1', categoryId: 'group-1', displayName: '시험 판매자' }],
    busy: false, onCreate: () => {},
  }));
  for (const label of ['대분류 등록', '소분류 등록', '판매자 분류 등록', '판매자 등록', '과일', '베리', '농가']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /<select[^>]+name="parentId"/);
  assert.match(html, /<select[^>]+name="categoryId"/);
});
