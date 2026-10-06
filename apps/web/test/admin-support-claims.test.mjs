import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminSupportClaimsPage, { AdminSupportClaimsView } from
  '../app/account/admin/support/claims/page.tsx';

const claim = { id: 'claim-1',orderId: 'order-1',shipmentOrderId: 'shipment-1',
  optionId: 'option-1',productId: 'product-1',sellerId: 'seller-1',
  kind: 'EXCHANGE',reasonCode: 'wrong_delivery',reason: '오배송',quantity: 1,
  status: 'SELLER_REPLIED',goodsRefundWon: 0,policyVersionId: null,
  decisionReason: null,decidedAt: null,createdAt: '2026-10-07T00:00:00Z',
  messages: [{ id: 'message-1',authorRole: 'seller',body: '오배송 확인',
    createdAt: '2026-10-07T00:00:00Z' }],
  events: [{ action: 'SELLER_REPLIED',actorRole: 'seller',reason: '답변 등록',
    afterStatus: 'SELLER_REPLIED',occurredAt: '2026-10-07T00:00:00Z' }],
  evidence: [{ id: 'evidence-1',mimeType: 'image/webp',sizeBytes: 100,
    createdAt: '2026-10-07T00:00:00Z' }] };

test('admin support claims use a private role page and expose the approved mock boundary', () => {
  assert.match(renderToStaticMarkup(createElement(AdminSupportClaimsPage)), /운영자 권한 확인 중/);
  assert.match(readFileSync(new URL('../app/account/page.tsx', import.meta.url), 'utf8'),
    /\/account\/admin\/support\/claims/);
  const html = renderToStaticMarkup(createElement(AdminSupportClaimsView, {
    items: [{ id: claim.id,productId: claim.productId,shipmentOrderId: claim.shipmentOrderId,
      kind: claim.kind,reasonCode: claim.reasonCode,status: claim.status,createdAt: claim.createdAt }],
    selected: claim,busy: false,message: '',statusFilter: '',nextCursor: 'cursor-2',
    onFilter: () => {},onMore: () => {},onSelect: () => {},onDecide: () => {},
  }));
  for (const label of ['클레임 심사','더보기','오배송 확인','답변 등록','승인·모의 환불 실행',
    '반려','대체 발송은 자동 생성되지 않습니다']) assert.match(html,new RegExp(label));
  assert.match(html,/admin\/support\/claims\/claim-1\/evidence\/evidence-1/);
  assert.doesNotMatch(html,/objectKey|storageKey|01000000000/);
  const source = readFileSync(new URL('../app/account/admin/support/claims/page.tsx',
    import.meta.url), 'utf8');
  assert.match(source,/decisionKeys\.current/);
  assert.match(source,/idempotency-key/);
  assert.match(source,/credentials: 'include'/);
});
