import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SellerShippingPage, { SellerShippingView } from '../app/account/seller/shipping/page.tsx';
import AdminShippingPage, { AdminShippingView } from '../app/account/admin/shipping/page.tsx';

const policy = { feeWon: 3000, freeThresholdWon: 50000, cutoffTime: null, blockedPostalRanges: [] };

test('shipping pages do not expose policy details before the corresponding role is verified', () => {
  assert.match(renderToStaticMarkup(createElement(SellerShippingPage)), /판매자 권한 확인 중/);
  assert.match(renderToStaticMarkup(createElement(AdminShippingPage)), /운영자 권한 확인 중/);
});

test('seller sees current policy separately from a request awaiting operator approval', () => {
  const html = renderToStaticMarkup(createElement(SellerShippingView, {
    policy, requests: [{ id: 'request-a', status: 'pending', policy: { ...policy, feeWon: 2000 },
      requestedAt: '2026-09-27', decidedAt: null, decisionReason: null }],
    busy: false, onRequest: () => {},
  }));
  for (const label of ['현재 적용', '3,000원', '50,000원', '승인 대기', '2,000원', '배송 정책 변경 요청']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /name="feeWon"/);
  assert.doesNotMatch(html, /판매자 승인 완료 처리/);
});

test('operator sees global locks and seller-specific pending requests with explicit decisions', () => {
  const html = renderToStaticMarkup(createElement(AdminShippingView, {
    global: { policy, locks: { feeWon: false, freeThresholdWon: false, cutoffTime: false } },
    requests: [{ id: 'request-a', sellerId: 'seller-a', sellerName: '농가 A',
      policy: { ...policy, feeWon: 2000 }, requestedAt: '2026-09-27' }],
    busy: false, onSaveGlobal: () => {}, onApprove: () => {}, onReject: () => {},
  }));
  for (const label of ['관리자 전역 정책', '관리자 우선', '판매자 변경 요청', '농가 A', '2,000원', '승인', '반려 사유']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(readFileSync(new URL('../app/account/page.tsx', import.meta.url), 'utf8'), /\/account\/seller\/shipping/);
  assert.match(readFileSync(new URL('../app/account/page.tsx', import.meta.url), 'utf8'), /\/account\/admin\/shipping/);
});
