import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminRefundsPage, { AdminRefundsView } from '../app/account/admin/refunds/page.tsx';

const summary = { id: 'case-1', checkoutOrderId: 'order-1', shipmentOrderId: 'shipment-1',
  requesterRole: 'customer', reasonCode: 'customer_request', reason: '출고 전 취소',
  status: 'REQUESTED', goodsRefundWon: 3333, shippingRefundWon: 0, totalRefundWon: 3333,
  amountFinal: false, estimateAvailable: true, requestedAt: '2026-10-05T00:00:00Z',
  decidedAt: null, completedAt: null };
const detail = { ...summary, policyCode: 'PRE_SHIPMENT_V1', policyVersion: 1,
  preShipmentEvidence: null, preShipmentConfirmedBy: null, preShipmentConfirmedAt: null,
  decisionBy: null, decisionReason: null,
  lines: [{ optionId: 'option-1', productName: '고추', optionName: '500g', quantity: 1,
    goodsRefundWon: 0, restockMode: 'none', restockedQuantity: 0 }],
  history: [{ fromStatus: null, toStatus: 'REQUESTED', actorRole: 'customer',
    reason: 'Refund requested', createdAt: '2026-10-05T00:00:00Z' }], attempts: [] };

test('operator refund page stays private and is linked from the admin account menu', () => {
  assert.match(renderToStaticMarkup(createElement(AdminRefundsPage)), /운영자 권한 확인 중/);
  assert.match(readFileSync(new URL('../app/account/page.tsx', import.meta.url), 'utf8'),
    /\/account\/admin\/refunds/);
});

test('operator filters cases and explicitly chooses stock restoration before approving or rejecting', () => {
  const html = renderToStaticMarkup(createElement(AdminRefundsView, {
    cases: [summary], selected: detail, busy: false, message: '', filters: {},
    onFilter: () => {}, onSelect: () => {}, onApprove: () => {}, onReject: () => {},
  }));
  for (const label of ['취소·환불 관리', '상태', '시작일', '종료일', '발송 주문 ID',
    '조회', '고추', '500g', '예상 환급액', '출고 전 미발송 확인', '재고 처리',
    '재고 복원 안 함', '보유재고만 복원', '승인·모의 환불 실행', '반려 사유', '반려'])
    assert.match(html, new RegExp(label));
  assert.match(html, /name="restock-option-1"/);
  assert.match(html, /value="on_hand_only"/);
  assert.match(html, /name="approvalReason"/);
  assert.match(html, /name="rejectionReason"/);
  assert.match(html, /전체 취소.*실제 결제한 배송비/);
  assert.doesNotMatch(html, /고객에게는 상품금액만 환불/);
  assert.doesNotMatch(html, /자동 송금|판매자 승인/);
});

test('refund admin source keeps decision keys stable until the server confirms a result', () => {
  const source = readFileSync(new URL('../app/account/admin/refunds/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /decisionKeys\.current/);
  assert.match(source, /idempotency-key/);
  assert.match(source, /crypto\.randomUUID/);
  assert.match(source, /response\.status === 409/);
});
