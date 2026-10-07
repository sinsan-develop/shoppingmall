import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { canEditReview,createReviewImageUploadKeys,CustomerSupportLine } from
  '../app/account/customer/support-line.tsx';

const line = { productId: 'product-a',optionId: 'option-a',productName: '가상 고추',
  optionName: '기본',quantity: 2,remainingQuantity: 2 };

test('customer line actions require SHIPPED display and explicit manual confirmation', () => {
  const ready = renderToStaticMarkup(createElement(CustomerSupportLine, {
    orderId: 'order-a',shipmentOrderId: 'shipment-a',status: 'READY',line,
  }));
  assert.doesNotMatch(ready,/구매확정/);
  const shipped = renderToStaticMarkup(createElement(CustomerSupportLine, {
    orderId: 'order-a',shipmentOrderId: 'shipment-a',status: 'SHIPPED',line,
  }));
  for (const label of ['가상 고추','구매확정',
    '배송 완료를 자동 추정하지 않습니다']) assert.match(shipped,new RegExp(label));
  assert.doesNotMatch(shipped,/클레임 접수|반품|교환/);
  assert.match(shipped,/<button[^>]*disabled[^>]*>구매확정<\/button>/);
  assert.match(shipped,/구매확정 상태 확인 중/);
  const source = readFileSync(new URL('../app/account/customer/support-line.tsx',
    import.meta.url),'utf8');
  for (const path of ['customer/support/confirmations','customer/support/reviews'])
    assert.match(source,new RegExp(path));
  assert.doesNotMatch(source,/customer\/support\/claims/);
  assert.match(source,/idempotency-key/);
});

test('customer order page mounts purchase confirmation beside existing claim flow', () => {
  const source = readFileSync(new URL('../app/account/customer/page.tsx',import.meta.url),'utf8');
  assert.match(source,/import \{ CustomerSupportLine \} from '\.\/support-line'/);
  assert.match(source,/<CustomerSupportLine\b/);
  assert.match(source,/<CustomerClaimLine\b/);
});

test('existing review editor waits for matching detail instead of submitting empty content', () => {
  const pending = { id: 'confirmation-a',reviewId: 'review-a',reviewStatus: 'PENDING' };
  assert.equal(canEditReview(pending,undefined),false);
  assert.equal(canEditReview(pending,{ id: 'review-b',rating: 5,body: 'old',status: 'PENDING' }),false);
  assert.equal(canEditReview(pending,{ id: 'review-a',rating: 5,body: 'loaded',status: 'PENDING' }),true);
  assert.equal(canEditReview(pending,{ id: 'review-a',rating: 5,body: 'hidden',status: 'HIDDEN' }),false);
  assert.equal(canEditReview({ ...pending,reviewId: null },undefined),true);
  assert.equal(canEditReview(null,undefined),false);
});

test('review image upload reuses its idempotency key only for the same review and file', () => {
  let issued = 0;
  const keys = createReviewImageUploadKeys(() => `key-${++issued}`);
  const file = { name:'가상.png',type:'image/png',size:44,lastModified:5 };
  assert.equal(keys.forFile('review-a',file),'key-1');
  assert.equal(keys.forFile('review-a',{ ...file }),'key-1');
  assert.equal(keys.forFile('review-b',file),'key-2');
  assert.equal(keys.forFile('review-a',{ ...file,size:45 }),'key-3');
});

test('customer review form offers an image upload through the existing scoped API', () => {
  const source = readFileSync(new URL('../app/account/customer/support-line.tsx',import.meta.url),'utf8');
  assert.match(source,/customer\/support\/reviews\/\$\{encodeURIComponent\(review\.id\)\}\/images/);
  assert.match(source,/name="review-image" type="file"/);
  assert.match(source,/accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(source,/5 \* 1024 \* 1024/);
  assert.match(source,/'idempotency-key': key/);
});
