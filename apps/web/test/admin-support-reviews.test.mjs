import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminSupportReviewsPage, { AdminSupportReviewsView } from
  '../app/account/admin/support/reviews/page.tsx';

const review = { id: 'review-1',productId: 'product-a',confirmationId: 'confirm-1',
  rating: 4,body: '가상 후기',status: 'PENDING',version: 2,reportCount: 1,
  createdAt: '2026-10-07T00:00:00Z',
  images: [{ id: 'image-1',mimeType: 'image/webp',sizeBytes: 100,scanStatus: 'UNSCANNED' }],
  reports: [{ id: 'report-1',reason: '허위 정보',reportedAt: '2026-10-07T00:00:00Z' }],
  events: [{ action: 'EDITED',actorRole: 'customer',reason: null,
    beforeValue: { rating: 3 },afterValue: { rating: 4 },
    occurredAt: '2026-10-07T00:00:00Z' }] };

test('admin reviews expose reports and scan-gated approval with reasoned hiding', () => {
  assert.match(renderToStaticMarkup(createElement(AdminSupportReviewsPage)),
    /운영자 권한 확인 중/);
  assert.match(readFileSync(new URL('../app/account/page.tsx',import.meta.url),'utf8'),
    /\/account\/admin\/support\/reviews/);
  const html = renderToStaticMarkup(createElement(AdminSupportReviewsView, {
    items: [review],selected: review,busy: false,message: '',statusFilter: 'PENDING',
    nextCursor: 'next',onFilter: () => {},onMore: () => {},onSelect: () => {},
    onApprove: () => {},onHide: () => {},
  }));
  for (const label of ['리뷰 운영','가상 후기','허위 정보','UNSCANNED','승인·이미지 검사',
    '숨김 사유','더보기']) assert.match(html,new RegExp(label));
  assert.match(html,/admin\/support\/reviews\/review-1\/images\/image-1\/preview/);
  assert.doesNotMatch(html,/objectKey|storageKey/);
  const source = readFileSync(new URL('../app/account/admin/support/reviews/page.tsx',
    import.meta.url),'utf8');
  assert.match(source,/idempotency-key/);
  assert.match(source,/response\.status === 503/);
});
