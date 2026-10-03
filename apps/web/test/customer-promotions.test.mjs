import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CartView, PromotionCheckoutView } from '../app/cart/page.tsx';

const base = { shipments: [{ key: 'seller_direct:a', shippingMode: 'seller_direct', sellerId: 'a',
  goodsWon: 46000, shippingWon: 3000, totalWon: 49000, lines: [] }],
goodsWon: 46000, shippingWon: 3000, totalWon: 49000 };
const props = { base, coupons: [{ grantId: 'grant-1', campaignId: 'campaign-1',
  title: '제철 5천 원', rule: { kind: 'goods_discount' } }],
  goodsGrantId: '', goodsCode: '', shippingChoices: {}, busy: false,
  onGoodsGrant: () => {}, onGoodsCode: () => {}, onShippingChoice: () => {}, onPreview: () => {} };

test('customer can select an owned coupon or enter a code and preview shipment totals', () => {
  const html = renderToStaticMarkup(createElement(PromotionCheckoutView, { ...props,
    quote: { ...base, discountWon: 5000, supportWon: 3000, payableGoodsWon: 41000,
      payableShippingWon: 0, payableTotalWon: 41000, zeroSupportShipmentKeys: [],
      shipments: [{ ...base.shipments[0], discountWon: 5000, supportWon: 3000,
        payableGoodsWon: 41000, payableShippingWon: 0, payableTotalWon: 41000 }] },
  }));
  for (const label of ['쿠폰', '코드', '견적 다시 확인', '제철 5천 원',
    '상품 할인 5,000원', '배송비 지원 3,000원', '예상 결제금액']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /예상 결제금액 <strong>41,000원<\/strong>/);
  assert.match(html, /name="goodsCode"/);
  assert.match(html, /주문·결제 완료가 아닙니다/);
  assert.doesNotMatch(html, /<button[^>]*>결제 완료<\/button>/);
});

test('free-shipping support is disabled without hiding the original cart quantity and remove controls', () => {
  const free = { ...base, shippingWon: 0, totalWon: 46000,
    shipments: [{ ...base.shipments[0], shippingWon: 0, totalWon: 46000 }] };
  const coupon = renderToStaticMarkup(createElement(PromotionCheckoutView,
    { ...props, base: free, coupons: [], quote: undefined }));
  assert.match(coupon, /무료배송 상품에는 배송비 지원이 적용되지 않습니다/);
  assert.match(coupon, /disabled=""/);
  const cart = renderToStaticMarkup(createElement(CartView, { items: [{ optionId: 'o1',
    productId: 'p1', title: '고추', optionName: '500g', quantity: 2,
    unitPriceWon: 23000, availability: 'available' }], quote: base, edits: {}, busy: '',
  message: '', loading: false, onEdit: () => {}, onSave: () => {}, onRemove: () => {} }));
  assert.match(cart, /수량 변경/);
  assert.match(cart, /제거/);
  assert.match(readFileSync(new URL('../app/cart/page.tsx', import.meta.url), 'utf8'),
    /\/customer\/checkout\/reservations\/\$\{encodeURIComponent\(reservation.id\)\}\/promotions\/quote/);
});
