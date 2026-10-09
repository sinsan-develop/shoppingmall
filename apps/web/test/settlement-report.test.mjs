import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
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

test('ordinary commission evidence appears in the displayed and printable report', () => {
  const commission = { sellerId: 'farm-a', sellerName: '농가 A',
    sellerCategoryId: 'farms', sellerCategoryName: '농가',
    totals: { ...totals, commission: 1500 },
    items: [{ id: 'commission-1', kind: 'commission', amountWon: 1500,
      occurredAt: '2026-07-03T00:00:00Z', recordedAt: '2026-07-03T00:00:00Z',
      reason: '7월 3일 오프라인 수수료 확인', checkoutOrderId: null,
      shipmentOrderId: null, productName: null, optionName: null }] };
  const html = renderToStaticMarkup(createElement(SettlementReportView, { report: {
    ...report, groups: [commission], totals: { ...totals, commission: 1500 },
  } }));
  assert.match(html, /7월 3일 오프라인 수수료 확인/);
  assert.match(html, /1,500원/);
});

test('print separates frozen completion amounts from backdated late entries and evidence', () => {
  const late = { ...report.groups[0], items: [{ ...report.groups[0].items[0],
    id: 'late-commission', kind: 'commission', amountWon: 1200,
    occurredAt: '2026-05-02T00:00:00Z', recordedAt: '2026-07-01T00:00:00Z',
    checkoutOrderId: 'may-original-order', reason: '수수료 근거' }],
  totals: { ...totals, commission: 1200 } };
  const html = renderToStaticMarkup(createElement(SettlementReportView, { report: {
    ...report, lateGroups: [late], lateTotals: { ...totals, commission: 1200 },
    completions: [{ ...report.completions[0], frozenTotals: { ...totals, sale: 23000 } }],
  } }));
  for (const expected of ['완료 당시 항목별 금액', '23,000원', '완료 후 추가 발생',
    '1,200원', '기록 시점', '수수료 근거', 'may-original-order']) {
    assert.ok(html.includes(expected), expected);
  }
});


test('late-only reports name the empty frozen section accurately and print together', () => {
  const html = renderToStaticMarkup(createElement(SettlementReportView, { report: {
    ...report, groups: [], totals, lateGroups: report.groups, lateTotals: report.totals,
  } }));
  assert.match(html, /조회 기간의 기본 정산 자료가 없습니다. 완료 후 추가 발생은 아래에서 확인해 주세요/);
  assert.doesNotMatch(html, /조회 기간에 정산 자료가 없습니다/);
  const css = readFileSync(new URL('../app/styles.css', import.meta.url), 'utf8');
  assert.match(css, /@media print\{[^}]*\.settlement-late\{break-inside:avoid;page-break-inside:avoid\}/);
});

test('print shows correction direction, target kind, original event and reason', () => {
  const correction = { ...report.groups[0], totals: { ...totals, correction: 2000, sale: -2000 },
    items: [{ id: 'correction-a', kind: 'correction', amountWon: 2000,
      occurredAt: '2026-07-01T00:00:00Z', recordedAt: '2026-07-01T00:00:00Z',
      correctionDirection: 'decrease', correctedKind: 'sale', originalEventId: 'sale-a',
      reason: '판매액 오입력 정정', checkoutOrderId: 'may-order',
      shipmentOrderId: 'may-shipment', productName: '고추', optionName: '500g' }] };
  const html = renderToStaticMarkup(createElement(SettlementReportView, { report: {
    ...report, groups: [correction], totals: correction.totals,
  } }));
  for (const expected of ['판매액 오입력 정정', '원사건 sale-a', '감소', '상품 매출']) {
    assert.ok(html.includes(expected), expected);
  }
});

test('print distinguishes mixed historical item categories and selected-category completion totals', () => {
  const mixed = { ...report.groups[0], totals: { ...totals, commission: 14000 },
    items: [
      { ...report.groups[0].items[0], id: 'x-event', kind: 'commission', amountWon: 10000,
        sellerCategoryId: 'x', sellerCategoryName: '과거 X' },
      { ...report.groups[0].items[0], id: 'y-event', kind: 'commission', amountWon: 4000,
        sellerCategoryId: 'y', sellerCategoryName: '현재 Y' },
    ] };
  const allHtml = renderToStaticMarkup(createElement(SettlementReportView, { report: {
    ...report, groups: [mixed], totals: mixed.totals,
    completions: [{ ...report.completions[0], frozenTotals: mixed.totals }],
  } }));
  assert.match(allHtml, /여러 분류/);
  assert.match(allHtml, /과거 X/);
  assert.match(allHtml, /현재 Y/);
  assert.match(allHtml, /전체 합계/);
  const xHtml = renderToStaticMarkup(createElement(SettlementReportView, { report: {
    ...report, filter: { ...report.filter, categoryId: 'x' },
    groups: [{ ...mixed, items: [mixed.items[0]], totals: { ...totals, commission: 10000 } }],
    totals: { ...totals, commission: 10000 },
    completions: [{ ...report.completions[0], frozenTotals: { ...totals, commission: 10000 } }],
  } }));
  assert.match(xHtml, /선택 분류 합계/);
  assert.match(xHtml, /선택 분류 완료 당시 항목별 금액/);
  assert.match(xHtml, /10,000원/);
  assert.doesNotMatch(xHtml, /14,000원/);
});
