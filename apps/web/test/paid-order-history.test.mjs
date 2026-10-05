import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fetchPaidOrders, PaidOrderHistoryView } from '../app/cart/paid-order-history.tsx';

test('history loads from the owned-order API without browser order storage', async () => {
  const page = { items: [{ id: 'previous-order' }], nextCursor: 'next+/=' };
  const found = await fetchPaidOrders('http://127.0.0.1:9092', 'cursor+/=', async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, '/customer/checkout/orders');
    assert.equal(parsed.searchParams.get('status'), 'PAID');
    assert.equal(parsed.searchParams.get('cursor'), 'cursor+/=');
    assert.equal(options.credentials, 'include');
    assert.equal(options.cache, 'no-store');
    return Response.json(page);
  });
  assert.deepEqual(found, page);
  for (const status of [401, 403, 503]) await assert.rejects(() =>
    fetchPaidOrders('http://127.0.0.1:9092', undefined, async () => Response.json({}, { status })));
});

test('history offers keyboard buttons, stable order identifiers, paging and empty state', () => {
  const props = { items: [{ id: 'previous-order', status: 'PAID',
    createdAt: '2026-10-05T00:00:00Z', paidAt: '2026-10-05T00:01:00Z', payableWon: 12000,
    productSummary: { productName: '고추', optionName: '500g', lineCount: 2 } }],
    nextCursor: 'more', busy: false, message: '', selectedId: 'previous-order',
    onSelect: () => {}, onRefresh: () => {}, onMore: () => {} };
  const html = renderToStaticMarkup(createElement(PaidOrderHistoryView, props));
  for (const text of ['이전 결제완료 주문', '고추', '500g', '12,000원', '취소·환불 확인',
    '이전 주문 더 보기', 'aria-pressed="true"']) assert.ok(html.includes(text), text);
  assert.match(renderToStaticMarkup(createElement(PaidOrderHistoryView,
    { ...props, items: [], nextCursor: null })), /결제완료 주문이 없습니다/);
});
