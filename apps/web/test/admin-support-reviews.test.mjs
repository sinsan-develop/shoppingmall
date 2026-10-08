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

test('admin review operations localize display codes while preserving API values and authored text', () => {
  const reviewed = { ...review,status:'HIDDEN',
    images:[{ ...review.images[0],scanStatus:'FAILED' }],
    reports:[{ ...review.reports[0],reason:'가상 고객 신고 사유' }],
    events:[
      { action:'CREATED',actorRole:'customer',reason:null,beforeValue:{},
        afterValue:{ version:1 },occurredAt:review.createdAt },
      { action:'APPROVED',actorRole:'admin',reason:null,beforeValue:{},
        afterValue:{ version:1 },occurredAt:review.createdAt },
      { action:'REPORTED',actorRole:'customer',reason:'가상 고객 신고 사유',
        beforeValue:{},afterValue:{ version:1 },occurredAt:review.createdAt },
      { action:'HIDDEN',actorRole:'admin',reason:'가상 운영 숨김 사유',
        beforeValue:{},afterValue:{ version:1 },occurredAt:review.createdAt },
    ] };
  const html=renderToStaticMarkup(createElement(AdminSupportReviewsView,{
    items:[reviewed],selected:reviewed,busy:false,message:'',statusFilter:'APPROVED',
    nextCursor:null,onFilter:()=>{},onMore:()=>{},onSelect:()=>{},
    onApprove:()=>{},onHide:()=>{},
  }));
  for(const text of ['숨김','작성 · 고객','공개 승인 · 관리자','신고 · 고객',
    '검사 실패','가상 고객 신고 사유','가상 운영 숨김 사유','image-1'])
    assert.match(html,new RegExp(text));
  assert.match(html,/<option value="APPROVED" selected="">공개<\/option>/);
  assert.doesNotMatch(html,/>HIDDEN<|>APPROVED<|CREATED ·|REPORTED ·|HIDDEN ·/);
});
