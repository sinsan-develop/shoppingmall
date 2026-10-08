import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CustomerClaimLine, CustomerClaimsView, createEvidenceUploadKeys } from
  '../app/account/customer/customer-claims.tsx';

const line = { productId: 'product-a',optionId: 'option-a',productName: '가상 고추',
  optionName: '기본',quantity: 2,remainingQuantity: 2,claimAvailableQuantity: 2 };
const claim = { id: 'claim-1',productId: 'product-a',shipmentOrderId: 'shipment-a',
  kind: 'RETURN',reasonCode: 'damaged',status: 'REQUESTED',
  createdAt: '2026-10-07T00:00:00Z',reason: '훼손',quantity: 1,
  messages: [{ id: 'message-1',authorRole: 'customer',body: '훼손 사진',
    createdAt: '2026-10-07T00:00:00Z' }],
  evidence: [{ id: 'evidence-1',mimeType: 'image/webp',sizeBytes: 100 }],
  events: [{ action: 'REQUESTED',reason: '접수',occurredAt: '2026-10-07T00:00:00Z' }] };

test('customer claim actions bind own SHIPPED line and keep evidence private', () => {
  assert.doesNotMatch(renderToStaticMarkup(createElement(CustomerClaimLine, {
    orderId: 'order-a',shipmentOrderId: 'shipment-a',status: 'READY',line,
    onCreated: () => {},
  })),/클레임 접수/);
  const shipped = renderToStaticMarkup(createElement(CustomerClaimLine, {
    orderId: 'order-a',shipmentOrderId: 'shipment-a',status: 'SHIPPED',line,
    onCreated: () => {},
  }));
  for (const label of ['클레임 접수','반품','교환','품질','훼손','오배송','변심'])
    assert.match(shipped,new RegExp(label));
  const detail = renderToStaticMarkup(createElement(CustomerClaimsView, {
    items: [claim],selected: claim,busy: false,message: '',nextCursor: 'next',
    onMore: () => {},onSelect: () => {},onUpload: () => {},
  }));
  assert.match(detail,/customer\/support\/claims\/claim-1\/evidence\/evidence-1/);
  assert.match(detail,/비공개 증빙/);
  assert.doesNotMatch(detail,/objectKey|storageKey/);
  const source = readFileSync(new URL('../app/account/customer/customer-claims.tsx',
    import.meta.url),'utf8');
  assert.match(source,/customer\/support\/claims/);
  assert.match(source,/idempotency-key/);
  assert.match(source,/credentials: 'include'/);
  assert.match(source,/async function upload\(file: File, form: HTMLFormElement\)[\s\S]*?form\.reset\(\)/);
  const page = readFileSync(new URL('../app/account/customer/page.tsx',import.meta.url),'utf8');
  assert.match(page,/CustomerClaimLine/);
  assert.match(page,/CustomerClaimsPanel/);
  assert.match(page,/shipment\.lines\.map/);
});

test('evidence retry keeps one key after success or uncertain response', () => {
  let issued = 0;
  const keys = createEvidenceUploadKeys(() => `key-${++issued}`);
  const file = { name: 'damage.webp', type: 'image/webp', size: 100,
    lastModified: 1234 };
  const first = keys.forFile('claim-1',file);
  assert.equal(keys.forFile('claim-1',file),first);
  assert.equal(keys.forFile('claim-1',{ ...file }),first);
  assert.notEqual(keys.forFile('claim-2',file),first);
  assert.notEqual(keys.forFile('claim-1',{ ...file,type: 'image/png' }),first);
  assert.equal(issued,3);
});

test('an occupied shipped line does not offer another claim form', () => {
  const occupied = renderToStaticMarkup(createElement(CustomerClaimLine, {
    orderId: 'order-a',shipmentOrderId: 'shipment-a',status: 'SHIPPED',
    line: { ...line,claimAvailableQuantity: 0 },onCreated: () => {},
  }));
  assert.doesNotMatch(occupied,/클레임 접수/);
});

test('closed claims do not offer evidence upload after a decision', () => {
  for (const status of ['APPROVED','REJECTED','REFUND_PROCESSING','REFUNDED','REVIEW_REQUIRED']) {
    const detail = renderToStaticMarkup(createElement(CustomerClaimsView, {
      items: [{ ...claim,status }],selected: { ...claim,status },busy: false,
      message: '',nextCursor: null,onMore: () => {},onSelect: () => {},onUpload: () => {},
    }));
    assert.doesNotMatch(detail,/증빙 사진 추가|비공개 증빙 등록/,status);
    assert.match(detail,/\/evidence\/evidence-1/,status);
  }
  for (const status of ['REQUESTED','SELLER_REPLIED']) {
    const detail = renderToStaticMarkup(createElement(CustomerClaimsView, {
      items: [{ ...claim,status }],selected: { ...claim,status },busy: false,
      message: '',nextCursor: null,onMore: () => {},onSelect: () => {},onUpload: () => {},
    }));
    assert.match(detail,/비공개 증빙 등록/,status);
  }
});
