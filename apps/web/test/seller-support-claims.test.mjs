import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SellerClaimsView } from '../app/account/seller/support/claims.tsx';

const claim = { id: 'claim-1',productId: 'product-a',shipmentOrderId: 'shipment-1',
  kind: 'RETURN',reasonCode: 'damaged',status: 'REQUESTED',
  createdAt: '2026-10-07T00:00:00Z',reason: '훼손',quantity: 1,
  messages: [{ id: 'message-1',authorRole: 'customer',body: '훼손 사진 첨부',
    createdAt: '2026-10-07T00:00:00Z' }],
  evidence: [{ id: 'evidence-1',mimeType: 'image/webp',sizeBytes: 100 }],
  events: [{ action: 'REQUESTED',reason: '접수',occurredAt: '2026-10-07T00:00:00Z' }] };

test('seller claim reply is scoped, repeatable, and evidence stays on private route', () => {
  const html = renderToStaticMarkup(createElement(SellerClaimsView, {
    items: [claim],selected: claim,busy: false,message: '',nextCursor: 'next',
    onMore: () => {},onSelect: () => {},onReply: () => {},
  }));
  for (const label of ['품목 클레임','훼손 사진 첨부','비공개 증빙','답변 등록',
    '더보기']) assert.match(html,new RegExp(label));
  assert.match(html,/seller\/support\/claims\/claim-1\/evidence\/evidence-1/);
  assert.doesNotMatch(html,/objectKey|storageKey/);
  const source = readFileSync(new URL('../app/account/seller/support/claims.tsx',
    import.meta.url),'utf8');
  assert.match(source,/seller\/support\/claims/);
  assert.match(source,/idempotency-key/);
  assert.match(source,/credentials: 'include'/);
});
