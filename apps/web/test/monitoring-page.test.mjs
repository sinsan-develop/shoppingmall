import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminMonitoringView } from '../app/account/admin/monitoring/page.tsx';

const overview = {
  asOf: '2026-10-06T06:00:00Z',
  summary: { orderCount: 3, goodsSalesWon: 57000, publishedOptionCount: 3,
    soldOutOptionCount: 1, claimCount: 1, pendingApprovalCount: 1, openQuestionCount: 1 },
  pendingApprovals: [{ id: 'approval-1',kind: 'stock',sellerId: 'seller-1',createdAt: '2026-10-06T06:00:00Z' }],
  stockIssues: [{ optionId: 'option-1',productId: 'product-1',sellerId: 'seller-1',sellableQuantity: 0 }],
  openQuestions: [{ id: 'question-1',productId: 'product-1',sellerId: 'seller-1',createdAt: '2026-10-06T06:00:00Z' }],
  openClaims: [{ id: 'claim-1',shipmentOrderId: 'shipment-1',sellerId: 'seller-1',status: 'REQUESTED',createdAt: '2026-10-06T06:00:00Z' }],
  failedPayments: [],
  unshipped: [{ shipmentOrderId: 'shipment-1',orderId: 'order-1',sellerId: 'seller-1',
    sellerName: '농가 A',status: 'DELAYED',expectedShipDate: '2026-10-07',paidAt: '2026-10-06T06:00:00Z' }],
};

test('monitoring view shows definitions, source links, exceptions, and filter controls', () => {
  const html = renderToStaticMarkup(createElement(AdminMonitoringView, {
    overview, from: '2026-10-06', to: '2026-10-06', sellerId: '',
    orderStatus: '', claimStatus: '', busy: false, error: '', onFilter: () => {}, onRefresh: () => {},
  }));
  for (const label of ['관리자 관제', '상품매출', '배송비 제외', '주문 생성', '재고 이상',
    '승인 대기', '미처리 문의', '실패 결제', '미출고', '클레임', '57,000원', '농가 A'])
    assert.ok(html.includes(label), label);
  for (const href of ['/account/admin/proposals#stock-approval-1',
    '/account/admin/support/questions?id=question-1',
    '/account/admin/support/claims?id=claim-1',
    '/account/admin/fulfillment?id=shipment-1'])
    assert.ok(html.includes(href), href);
  assert.match(html, /type="date"/);
  assert.match(html, /새로고침/);
});

test('monitoring view has explicit empty and error states', () => {
  const html = renderToStaticMarkup(createElement(AdminMonitoringView, {
    overview: { ...overview, pendingApprovals: [], stockIssues: [], openQuestions: [],
      openClaims: [], failedPayments: [], unshipped: [] },
    from: '2026-10-06', to: '2026-10-06', sellerId: '', orderStatus: '', claimStatus: '',
    busy: false, error: '조회에 실패했습니다', onFilter: () => {}, onRefresh: () => {},
  }));
  assert.match(html, /조회에 실패했습니다/);
  assert.match(html, /해당 항목이 없습니다/);
});
