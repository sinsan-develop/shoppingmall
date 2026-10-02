import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CartView, createRefreshGate } from '../app/cart/page.tsx';
import { AdminReservationCancelView } from '../app/account/admin/proposals/page.tsx';
import { stockSaveFailureMessage } from '../app/account/seller/products/page.tsx';

const item = { optionId: 'o1', productId: 'p1', title: '고추', optionName: '500g', quantity: 2,
  unitPriceWon: 23000, availability: 'available' };
const quote = { goodsWon: 46000, shippingWon: 3000, totalWon: 49000,
  shipments: [{ key: 'seller_direct:s1', shippingMode: 'seller_direct', sellerId: 's1',
    goodsWon: 46000, shippingWon: 3000, totalWon: 49000, lines: [], preDiscountGoodsWon: 46000 }] };
const base = { items: [item], quote, edits: { o1: 2 }, busy: '', message: '', loading: false,
  onEdit: () => {}, onSave: () => {}, onRemove: () => {}, onReserve: () => {},
  onRelease: () => {}, onRecheck: () => {}, nowMs: Date.parse('2026-10-02T00:00:00Z') };

test('cart starts an explicit 15-minute stock hold without claiming payment', () => {
  const html = renderToStaticMarkup(createElement(CartView, base));
  assert.match(html, /15분 재고 예약/);
  assert.match(html, /결제 기능은 준비 중/);
  assert.doesNotMatch(html, /주문 완료/);
});

test('active hold shows server expiry and current quote while cart edits are disabled', () => {
  const reservation = { id: 'hold-1', status: 'ACTIVE', expiresAt: '2026-10-02T00:15:00Z',
    endReason: null, lines: [{ optionId: 'o1', quantity: 2 }], quote };
  const html = renderToStaticMarkup(createElement(CartView, { ...base, reservation }));
  assert.match(html, /15분 0초/);
  assert.match(html, /예약 해제/);
  assert.match(html, /예약 해제 후 수량/);
  assert.match(html, /49,000원/);
  assert.match(html, /id="cart-edit-o1"[^>]*disabled/);
  assert.match(html, /수량 변경<\/button>/);
  assert.doesNotMatch(html, /주문 완료/);
});

test('expired or operator-cancelled hold asks for a fresh server quote', () => {
  for (const status of ['EXPIRED', 'CANCELLED']) {
    const reservation = { id: 'hold-1', status, expiresAt: '2026-10-02T00:00:00Z',
      endReason: status === 'CANCELLED' ? 'QA 출고 불가' : null,
      lines: [{ optionId: 'o1', quantity: 2 }] };
    const html = renderToStaticMarkup(createElement(CartView, { ...base, reservation }));
    assert.match(html, /다시 확인/);
    assert.match(html, /재견적/);
    if (status === 'CANCELLED') assert.match(html, /QA 출고 불가/);
    assert.doesNotMatch(html, /주문 완료/);
  }
});

test('operator has a reasoned reservation cancellation form without checkout payment actions', () => {
  const html = renderToStaticMarkup(createElement(AdminReservationCancelView, {
    busy: false, onCancel: () => {},
  }));
  assert.match(html, /예약 번호/);
  assert.match(html, /취소 사유/);
  assert.match(html, /예약 취소/);
  assert.match(html, /required/);
  assert.match(html, /maxLength="500"/);
  assert.doesNotMatch(html, /결제 승인/);
});

test('seller stock conflict identifies held quantity instead of generic invalid input', () => {
  assert.match(stockSaveFailureMessage(409), /기존 예약 수량/);
  assert.match(stockSaveFailureMessage(400), /0 이상의 정수/);
});

test('late cart polling responses cannot replace a newer reservation state', () => {
  const gate = createRefreshGate();
  const firstPoll = gate.begin();
  const newerPoll = gate.begin();
  assert.equal(gate.isCurrent(firstPoll), false);
  assert.equal(gate.isCurrent(newerPoll), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(newerPoll), false);
});
