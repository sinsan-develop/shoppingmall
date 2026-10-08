import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettlementReportView } from '../app/account/settlement-report.tsx';

const totals = { sale: 0, goods_discount: 0, shipping_fee: 0, shipping_support: 0,
  goods_refund: 0, shipping_refund: 0, commission: 0, correction: 0 };
const report = {
  filter: { from: '2026-07-01', to: '2026-07-31', categoryId: null, sellerId: null },
  totals: { ...totals, goods_refund: 12000, shipping_fee: 3000 },
  groups: [
    { sellerId: 'farm-a', sellerName: '농가 A', sellerCategoryId: 'farms',
      sellerCategoryName: '농가', totals: { ...totals, goods_refund: 12000 },
      items: [{ id: 'refund-1', kind: 'goods_refund', amountWon: 12000,
        occurredAt: '2026-07-01T00:00:00Z', checkoutOrderId: 'may-order',
        shipmentOrderId: 'may-shipment', productName: '고추', optionName: '500g' }] },
    { sellerId: 'owool', sellerName: '어울몰', sellerCategoryId: 'own',
      sellerCategoryName: '자체', totals: { ...totals, shipping_fee: 3000 },
      items: [{ id: 'shipping-1', kind: 'shipping_fee', amountWon: 3000,
        occurredAt: '2026-07-02T00:00:00Z', checkoutOrderId: 'july-order',
        shipmentOrderId: 'july-shipment', productName: null, optionName: null }] },
  ],
  completions: [{ id: 'complete-a', sellerId: 'farm-a', sellerName: '농가 A',
    startDate: '2026-05-01', endDate: '2026-05-20',
    completedAt: '2026-05-20T09:00:00Z', reason: '오프라인 확인' }],
};

test('report prints the displayed seller sections, source orders and period totals without payout', () => {
  const html = renderToStaticMarkup(createElement(SettlementReportView, { report }));
  for (const expected of ['정산 자료', '2026-07-01', '2026-07-31', '농가 A',
    '어울몰', '고추', '500g', 'may-order', 'july-order', '12,000원', '3,000원', '전체 합계']) {
    assert.ok(html.includes(expected), expected);
  }
  assert.match(html, /aria-label="판매자 농가 A 정산 자료"/);
  assert.match(html, /aria-label="판매자 어울몰 정산 자료"/);
  assert.doesNotMatch(html, /자동 지급액|송금 완료/);
  assert.match(html, /완료 이력/);
  assert.match(html, /오프라인 확인/);
});

test('completion history remains visible even when the selected period has no events', () => {
  const html = renderToStaticMarkup(createElement(SettlementReportView, {
    report: { ...report, groups: [], totals, completions: report.completions },
  }));
  assert.match(html, /조회 기간에 정산 자료가 없습니다/);
  assert.match(html, /완료 이력/);
  assert.match(html, /오프라인 확인/);
});
