import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as sellerApplyPage from '../app/account/seller/apply/page.tsx';

const approved = { id: 'application-1', displayName: '승인된 농가', status: 'approved',
  sellerId: 'seller-1', reviewReason: null, createdAt: '2026-10-11T00:00:00Z',
  reviewedAt: '2026-10-12T00:00:00Z' };

test('approved applicant sees approval but cannot submit a duplicate application', () => {
  const View = sellerApplyPage.SellerApplyView ?? (() => null);
  const html = renderToStaticMarkup(createElement(View, {
    state: 'buyer', busy: false, message: '', applications: [approved], onSubmit: () => {},
  }));
  assert.match(html, /승인된 농가: 승인/);
  assert.doesNotMatch(html, /판매자 신청하기/);
});

test('pending applicant cannot reapply, while rejected applicant can', () => {
  const View = sellerApplyPage.SellerApplyView;
  const props = { state: 'buyer', busy: false, message: '', onSubmit: () => {} };
  const pending = renderToStaticMarkup(createElement(View, {
    ...props, applications: [{ ...approved, status: 'pending', sellerId: null,
      reviewedAt: null }],
  }));
  const rejected = renderToStaticMarkup(createElement(View, {
    ...props, applications: [{ ...approved, status: 'rejected', sellerId: null,
      reviewReason: '증빙 보완', reviewedAt: '2026-10-12T00:00:00Z' }],
  }));
  assert.match(pending, /심사 대기/);
  assert.doesNotMatch(pending, /판매자 신청하기/);
  assert.match(rejected, /반려.*증빙 보완/);
  assert.match(rejected, /판매자 신청하기/);
});
