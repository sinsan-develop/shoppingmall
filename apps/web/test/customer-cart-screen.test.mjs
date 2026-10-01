import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductCartControlsView } from '../app/products/[productId]/cart-controls.tsx';
import CartPage, { CartView } from '../app/cart/page.tsx';

test('product detail cart controls accept a direct quantity and show unit price times quantity', () => {
  const html = renderToStaticMarkup(createElement(ProductCartControlsView, {
    option: { id: 'o1', name: '500g', priceWon: 23000, sellableQuantity: 5 },
    quantity: 2, busy: false, onQuantityChange: () => {}, onAdd: () => {},
  }));
  assert.match(html, /type="number"[^>]*min="1"[^>]*max="5"/);
  assert.match(html, /46,000원/);
  assert.match(html, /장바구니에 담기/);
  assert.match(renderToStaticMarkup(createElement(ProductCartControlsView, {
    option: { id: 'o2', name: '1kg', priceWon: 40000, sellableQuantity: 0 },
    quantity: 1, busy: false, onQuantityChange: () => {}, onAdd: () => {},
  })), /품절/);
});

test('cart view shows editable quantity, remove, server shipment totals and unavailable item', () => {
  const html = renderToStaticMarkup(createElement(CartView, {
    items: [
      { optionId: 'o1', productId: 'p1', title: '고추', optionName: '500g', quantity: 2,
        unitPriceWon: 23000, availability: 'available' },
      { optionId: 'o2', productId: 'p2', title: '양파', optionName: '1kg', quantity: 1,
        unitPriceWon: null, availability: 'unavailable' },
    ],
    quote: { goodsWon: 46000, shippingWon: 3000, totalWon: 49000,
      shipments: [{ key: 'seller_direct:s1', shippingMode: 'seller_direct', sellerId: 's1',
        goodsWon: 46000, shippingWon: 3000, totalWon: 49000, lines: [], preDiscountGoodsWon: 46000 }] },
    edits: { o1: 3 }, busy: '', message: '', loading: false,
    onEdit: () => {}, onSave: () => {}, onRemove: () => {},
  }));
  assert.match(html, /고추/);
  assert.match(html, /수량/);
  assert.match(html, /수량 변경/);
  assert.match(html, /제거/);
  assert.match(html, /46,000원/);
  assert.match(html, /배송비 3,000원/);
  assert.match(html, /총 49,000원/);
  assert.match(html, /현재 구매 불가/);
  assert.match(html, /결제 기능은 준비 중/);
});

test('empty and failed cart states do not claim a completed order', () => {
  const props = { items: [], quote: undefined, edits: {}, busy: '', loading: false,
    onEdit: () => {}, onSave: () => {}, onRemove: () => {} };
  assert.match(renderToStaticMarkup(createElement(CartView, { ...props, message: '' })), /장바구니가 비어 있습니다/);
  assert.match(renderToStaticMarkup(createElement(CartView, { ...props, message: '불러올 수 없습니다' })),
    /role="alert"/);
  assert.match(renderToStaticMarkup(createElement(CartPage)), /장바구니/);
});
