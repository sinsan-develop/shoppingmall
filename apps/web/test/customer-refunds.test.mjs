import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CustomerRefundView, startRefundRequest } from '../app/cart/page.tsx';

const order = { id: 'order-1', status: 'PAID', payableWon: 12000,
  expiresAt: '2026-10-05T00:00:00Z', shipments: [{ id: 'shipment-1', key: 'seller_direct:s1',
    payableWon: 12000, status: 'PAID', lines: [{ optionId: 'option-1', productName: '고추',
      optionName: '500g', quantity: 3, goodsPayableWon: 10000 }] }] };

test('paid customer sees shipment quantities, reasons and estimated versus final refund amounts', () => {
  const html = renderToStaticMarkup(createElement(CustomerRefundView, {
    order, cases: [{ id: 'case-1', checkoutOrderId: 'order-1', shipmentOrderId: 'shipment-1',
      requesterRole: 'customer', reasonCode: 'customer_request', reason: '일부 취소',
      status: 'REQUESTED', goodsRefundWon: 3333, shippingRefundWon: 0, totalRefundWon: 3333,
      amountFinal: false, estimateAvailable: true, requestedAt: '2026-10-05T00:00:00Z',
      decidedAt: null, completedAt: null,
      lines: [{ optionId: 'option-1', productName: '고추', optionName: '500g', quantity: 1,
        goodsRefundWon: 0 }], history: [{ fromStatus: null, toStatus: 'REQUESTED',
          createdAt: '2026-10-05T00:00:00Z' }] }], busy: false, message: '',
    onRequest: () => {}, onRefresh: () => {},
  }));
  for (const label of ['출고 전 취소·환불', '고추', '500g', '취소 수량', '취소 사유',
    '상세 사유', '환불 요청', '예상 환급액', '3,333원', '처리 이력', '요청 접수'])
    assert.match(html, new RegExp(label));
  assert.match(html, /type="number"[^>]*min="0"[^>]*max="3"/);
  assert.match(html, /value="customer_request"/);
  assert.doesNotMatch(html, /providerRefundId|preShipmentEvidence|관리자 내부/);
});

test('verified refund status uses the API REFUNDED contract and shows completion', () => {
  const completed = { id: 'case-complete', checkoutOrderId: 'order-1', shipmentOrderId: 'shipment-1',
    requesterRole: 'customer', reasonCode: 'customer_request', reason: '취소 완료',
    status: 'REFUNDED', goodsRefundWon: 3333, shippingRefundWon: 0, totalRefundWon: 3333,
    amountFinal: true, estimateAvailable: true, requestedAt: '2026-10-05T00:00:00Z',
    decidedAt: '2026-10-05T00:01:00Z', completedAt: '2026-10-05T00:02:00Z',
    lines: [{ optionId: 'option-1', productName: '고추', optionName: '500g', quantity: 1,
      goodsRefundWon: 3333 }], history: [{ fromStatus: 'PROCESSING', toStatus: 'REFUNDED',
        createdAt: '2026-10-05T00:02:00Z' }] };
  const html = renderToStaticMarkup(createElement(CustomerRefundView, { order, cases: [completed],
    busy: false, message: '', onRequest: () => {}, onRefresh: () => {} }));
  assert.match(html, /환불 완료/);
  assert.match(html, /확정 환급액/);
});

test('refund request keeps one idempotency key across an unknown response and clears it after confirmation', async () => {
  const values = new Map();
  const storage = { getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value), removeItem: (name) => values.delete(name) };
  const input = { shipmentOrderId: randomUUID(),
    lines: [{ optionId: randomUUID(), quantity: 1 }], reasonCode: 'customer_request',
    reason: '출고 전 취소 요청' };
  const orderId = randomUUID();
  const sent = [];
  const send = async (_url, options) => {
    sent.push(options.headers['idempotency-key']);
    if (sent.length === 1) return Response.json({}, { status: 503 });
    return Response.json({ id: randomUUID(), status: 'REQUESTED', amountFinal: false,
      estimateAvailable: true, goodsRefundWon: 1000, shippingRefundWon: 0,
      totalRefundWon: 1000, lines: input.lines }, { status: 200 });
  };
  await assert.rejects(() => startRefundRequest('http://127.0.0.1:9092', storage,
    orderId, input, send));
  const result = await startRefundRequest('http://127.0.0.1:9092', storage,
    orderId, input, send);
  assert.equal(result.status, 'REQUESTED');
  assert.equal(sent[0], sent[1]);
  assert.equal(values.has('owool-refund-request-key'), false);
});

test('refund request reports role, ownership and conflict outcomes without claiming completion', async () => {
  const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const input = { shipmentOrderId: randomUUID(),
    lines: [{ optionId: randomUUID(), quantity: 1 }], reasonCode: 'other', reason: '시험' };
  for (const [status, text] of [[403, '구매자 역할'], [404, '본인 주문'], [409, '상태가 변경']]) {
    await assert.rejects(() => startRefundRequest('http://127.0.0.1:9092', storage,
      randomUUID(), input, async () => Response.json({}, { status })), new RegExp(text));
  }
});
