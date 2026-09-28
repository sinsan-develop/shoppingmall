import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  assert.match(html, /초안 수정/);
  assert.match(html, /초안 삭제/);
  assert.match(html, /등록 사진 관리/);
  assert.match(readFileSync(new URL('../app/account/seller/products/page.tsx', import.meta.url), 'utf8'), /사진 제거/);
  assert.match(readFileSync(new URL('../app/account/seller/products/page.tsx', import.meta.url), 'utf8'), /images\/\$\{item\.id\}\/preview/);
  assert.match(html, /대표 사진 1장/);
  assert.match(readFileSync(new URL('../app/account/seller/products/page.tsx', import.meta.url), 'utf8'), /사진 순서 저장/);
  assert.doesNotMatch(html, /고객에게 공개 중/);
});

test('repeated seller photo and option actions identify their row for assistive technology', () => {
  const source = readFileSync(new URL('../app/account/seller/products/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /aria-label={`사진 \$\{index \+ 1\} 위로 이동`}/);
  assert.match(source, /aria-label={`사진 \$\{index \+ 1\} 아래로 이동`}/);
  assert.match(source, /aria-label={`사진 \$\{index \+ 1\} 제거`}/);
  assert.equal([...source.matchAll(/aria-label={`옵션 \$\{index \+ 1\} 제거`}/g)].length, 2);
});

test('submitted proposals are not editable from the seller screen', () => {
  const html = renderToStaticMarkup(createElement(SellerProductView, {
    categories: [], products: [{ productId: 'product', revisionId: 'revision', title: '고추', status: 'pending' }],
    busy: false, onCreate: () => {}, onUpload: () => {}, onSubmitProposal: () => {},
  }));
  assert.doesNotMatch(html, /초안 수정/);
  assert.doesNotMatch(html, /초안 삭제/);
});

test('an approved product offers a private revision request, not direct public editing', () => {
  const html = renderToStaticMarkup(createElement(SellerProductView, {
    categories: [], products: [{ productId: 'product', revisionId: 'revision', title: '고추', status: 'approved' }],
    busy: false, onCreate: () => {}, onCreateRevision: () => {},
  }));
  assert.match(html, /상품 수정안 만들기/);
  assert.match(html, /관리자 승인 전.*고객에게 공개되지 않습니다/);
  assert.doesNotMatch(html, /초안 수정/);
});

test('seller sees a reasoned sale-stop request and cannot resubmit a pending or approved stop', () => {
  const props = { categories: [], busy: false, onCreate: () => {}, onCreateRevision: () => {},
    onRequestSaleStop: () => {} };
  const product = { productId: 'product', revisionId: 'revision', title: '고추', status: 'approved' };
  const available = renderToStaticMarkup(createElement(SellerProductView,
    { ...props, products: [product], saleStopRequests: [] }));
  assert.match(available, /판매중지 요청/);
  assert.match(available, /판매중지 사유/);
  assert.match(available, /관리자 승인 전.*판매/);
  const pending = renderToStaticMarkup(createElement(SellerProductView, { ...props, products: [product],
    saleStopRequests: [{ id: 'request', productId: 'product', status: 'pending', reason: '일시 중단' }] }));
  assert.match(pending, /판매중지 승인 대기/);
  assert.doesNotMatch(pending, /판매중지 요청<\/button>/);
  const approved = renderToStaticMarkup(createElement(SellerProductView, { ...props, products: [product],
    saleStopRequests: [{ id: 'request', productId: 'product', status: 'approved', reason: '일시 중단' }] }));
  assert.match(approved, /판매중지 승인됨/);
  assert.doesNotMatch(approved, /판매중지 요청<\/button>/);
  assert.doesNotMatch(approved, /판매 중|현재 판매 중인 상품/);
});

test('seller catalog cards can shrink within a narrow screen', () => {
  const styles = readFileSync(new URL('../app/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.catalog-admin-grid \.account-card\{[^}]*min-width:0/);
});

test('seller enters exact option quantity and sees approval-pending stock separately', () => {
  const html = renderToStaticMarkup(createElement(SellerProductView, {
    categories: [], products: [], stock: [{ optionId: 'option-a', productId: 'product', title: '고추',
      optionName: '500g', onHand: 10, sellable: 3, pendingRequestId: 'request-a' }],
    busy: false, onCreate: () => {}, onUpload: () => {}, onSubmitProposal: () => {}, onSetStock: () => {},
  }));
  assert.match(html, /고추/);
  assert.match(html, /500g/);
  assert.match(html, /판매 가능 3개/);
  assert.match(html, /승인 대기/);
  assert.match(html, /type="number"[^>]*min="0"/);
  assert.match(html, /수량 적용/);
});
