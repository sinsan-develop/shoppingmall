import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminProposalsPage, { AdminProposalView } from '../app/account/admin/proposals/page.tsx';

test('review queue does not expose proposals before operator session check', () => {
  const html = renderToStaticMarkup(createElement(AdminProposalsPage));
  assert.match(html, /운영자 권한 확인 중/);
  assert.doesNotMatch(html, /시험 고추/);
});

test('review queue shows each seller proposal with a required rejection reason but no unsafe approval', () => {
  const html = renderToStaticMarkup(createElement(AdminProposalView, {
    proposals: [{ productId: 'product', revisionId: 'revision', title: '시험 고추', sellerName: '농가 A', proposedAt: '2026-09-27' }],
    busy: false, onReject: () => {},
  }));
  for (const label of ['상품 승인 대기', '시험 고추', '농가 A', '반려 사유', '반려']) {
    assert.match(html, new RegExp(label));
  }
  assert.doesNotMatch(html, />승인</);
});
