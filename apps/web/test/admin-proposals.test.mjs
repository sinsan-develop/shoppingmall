import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminProposalsPage, { AdminProposalView, AdminStockView, AdminSaleStopView } from '../app/account/admin/proposals/page.tsx';

test('operator can decide each seller stop request with a required rejection reason', () => {
  const html = renderToStaticMarkup(createElement(AdminSaleStopView, {
    requests: [{ id: 'request-a', productId: 'product-a', sellerName: '농가 A', title: '고추',
      reason: '출고 중단', requestedAt: '2026-09-29' }], busy: false,
    onApprove: () => {}, onReject: () => {},
  }));
  for (const label of ['판매중지 승인 대기', '농가 A', '고추', '출고 중단', '판매중지 승인', '반려 사유'])
    assert.match(html, new RegExp(label));
  assert.match(html, /required/);
});

test('review queue does not expose proposals before operator session check', () => {
  const html = renderToStaticMarkup(createElement(AdminProposalsPage));
  assert.match(html, /운영자 권한 확인 중/);
  assert.doesNotMatch(html, /시험 고추/);
});

test('operator sees seller-separated stock increase request and an explicit approval action', () => {
  const html = renderToStaticMarkup(createElement(AdminStockView, {
    requests: [{ requestId: 'request-a', optionId: 'option-a', sellerName: '농가 A',
      title: '고추', optionName: '500g', targetOnHand: 10, sellable: 3, createdAt: '2026-09-27' }],
    busy: false, onApprove: () => {},
  }));
  for (const label of ['재고 증가 승인 대기', '농가 A', '고추', '500g', '판매 가능 3개', '요청 10개', '증가 승인']) {
    assert.match(html, new RegExp(label));
  }
});

test('review queue shows each seller proposal with a required rejection reason but no unsafe approval', () => {
  const html = renderToStaticMarkup(createElement(AdminProposalView, {
    proposals: [{ productId: 'product', revisionId: 'revision', title: '시험 고추', sellerName: '농가 A',
      proposedAt: '2026-09-27', description: '가상 상품', originLabel: '전국', shippingMode: 'seller_direct',
      options: [], thumbnailCount: 0, detailImageCount: 0 }],
    busy: false, onReject: () => {},
  }));
  for (const label of ['상품 승인 대기', '시험 고추', '농가 A', '반려 사유', '반려']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /심사 사진 보기/);
  assert.match(readFileSync(new URL('../app/account/admin/proposals/page.tsx', import.meta.url), 'utf8'),
    /images\/\$\{image\.id\}\/preview/);
  assert.doesNotMatch(html, />승인</);
});

test('operator can review proposal facts and option prices without private image storage keys', () => {
  const html = renderToStaticMarkup(createElement(AdminProposalView, {
    proposals: [{ productId: 'product', revisionId: 'revision', title: '시험 고추', sellerName: '농가 A',
      proposedAt: '2026-09-27', description: '가상 상품 설명', originLabel: '경남 진주',
      shippingMode: 'seller_direct', options: [{ name: '500g', priceWon: 23000 }],
      thumbnailCount: 1, detailImageCount: 2, objectKey: 'quarantine/private-key' }],
    busy: false, onReject: () => {},
  }));
  for (const label of ['가상 상품 설명', '경남 진주', '판매자 직접 발송', '500g', '23,000원', '대표 사진 1개', '상세 사진 2개']) {
    assert.match(html, new RegExp(label));
  }
  assert.doesNotMatch(html, /quarantine\/private-key|objectKey/);
});

test('operator sees product approval only after authenticated review images load', () => {
  const html = renderToStaticMarkup(createElement(AdminProposalView, {
    proposals: [{ productId: 'product', revisionId: 'revision', title: '시험 고추', sellerName: '농가 A',
      proposedAt: '2026-09-27', description: '상품 설명', originLabel: '전국',
      shippingMode: 'seller_direct', options: [{ name: '500g', priceWon: 23000 }],
      thumbnailCount: 1, detailImageCount: 0 }],
    busy: false, onReject: () => {}, onApprove: () => {}, onLoadImages: async () => [],
  }));
  assert.doesNotMatch(html, />상품 승인<\/button>/);
  assert.match(readFileSync(new URL('../app/account/admin/proposals/page.tsx', import.meta.url), 'utf8'),
    /loadedIds\.length === images\.length/);
  assert.match(readFileSync(new URL('../app/account/admin/proposals/page.tsx', import.meta.url), 'utf8'),
    /admin\/proposals\/\$\{revisionId\}\/approve/);
  assert.doesNotMatch(html, /quarantine\/|objectKey/);
});
