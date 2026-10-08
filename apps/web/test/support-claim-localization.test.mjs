import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { claimStatusLabel,claimKindLabel,claimReasonCodeLabel,
  claimActorRoleLabel,claimActionLabel,claimEventReasonLabel } from
  '../app/account/support-claim-labels.ts';
import { CustomerClaimsView } from '../app/account/customer/customer-claims.tsx';
import { SellerClaimsView } from '../app/account/seller/support/claims.tsx';
import { AdminSupportClaimsView } from '../app/account/admin/support/claims/page.tsx';

const evidenceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const createdAt = '2026-10-07T00:00:00Z';
const summary = { id:'claim-1',productId:'product-1',shipmentOrderId:'shipment-1',
  kind:'RETURN',reasonCode:'damaged',status:'SELLER_REPLIED',createdAt };
const detail = { ...summary,orderId:'order-1',optionId:'option-1',sellerId:'seller-1',
  reason:'고객 작성 원문 보존',quantity:1,goodsRefundWon:23000,policyVersion:1,
  decisionReason:null,
  messages:[{ id:'message-1',authorRole:'customer',body:'자유서술 원문 보존',createdAt },
    { id:'message-2',authorRole:'seller',body:'판매자 자유서술 보존',createdAt }],
  evidence:[{ id:evidenceId,mimeType:'image/webp',sizeBytes:123 }],
  events:[
    { action:'REQUESTED',actorRole:'customer',reason:'Claim requested',occurredAt:createdAt },
    { action:'EVIDENCE_ADDED',actorRole:'customer',
      reason:`Evidence ${evidenceId} added`,occurredAt:createdAt },
    { action:'SELLER_REPLIED',actorRole:'seller',reason:'Seller reply submitted',
      occurredAt:createdAt },
  ] };

test('S5.2 claim labels cover approved statuses, kinds, reasons, roles and events', () => {
  assert.deepEqual(['REQUESTED','SELLER_REPLIED','APPROVED','REJECTED',
    'REFUND_PROCESSING','REFUNDED','REVIEW_REQUIRED'].map(claimStatusLabel),
  ['접수됨','판매자 답변','승인','반려','환불 처리 중','환불 완료','검토 필요']);
  assert.deepEqual(['CLAIM','RETURN','EXCHANGE'].map(claimKindLabel),
    ['클레임','반품','교환']);
  assert.deepEqual(['quality_issue','damaged','wrong_delivery',
    'change_of_mind','other'].map(claimReasonCodeLabel),
  ['품질','훼손','오배송','변심','기타']);
  assert.deepEqual(['customer','seller','admin','system'].map(claimActorRoleLabel),
    ['고객','판매자','관리자','시스템']);
  assert.equal(claimActionLabel('EVIDENCE_ADDED'),'증빙 추가');
  assert.equal(claimStatusLabel('FUTURE_STATUS'),'FUTURE_STATUS');
  assert.equal(claimEventReasonLabel({ action:'EVIDENCE_ADDED',actorRole:'customer',
    reason:`Evidence ${evidenceId} added` }),`증빙 ${evidenceId} 추가`);
  assert.equal(claimEventReasonLabel({ action:'REJECTED',actorRole:'admin',
    reason:'Claim requested' }),'Claim requested');
  assert.equal(claimEventReasonLabel({ action:'FUTURE_EVENT',actorRole:'system',
    reason:'unrecognized audit' }),'unrecognized audit');
});

test('S5.2 customer, seller and admin render Korean labels without changing free text or IDs', () => {
  const views = [
    renderToStaticMarkup(createElement(CustomerClaimsView,{
      items:[summary],selected:detail,busy:false,message:'',nextCursor:null,
      onMore:()=>{},onSelect:()=>{},onUpload:()=>{},
    })),
    renderToStaticMarkup(createElement(SellerClaimsView,{
      items:[summary],selected:detail,busy:false,message:'',nextCursor:null,
      onMore:()=>{},onSelect:()=>{},onReply:()=>{},
    })),
    renderToStaticMarkup(createElement(AdminSupportClaimsView,{
      items:[summary],selected:detail,busy:false,message:'',statusFilter:'',nextCursor:null,
      onFilter:()=>{},onMore:()=>{},onSelect:()=>{},onDecide:()=>{},
    })),
  ];
  for (const [index,html] of views.entries()) {
    if (index === 2) assert.match(html,/적용 정책 버전 1/);
    assert.match(html,index === 2 ? /반품 · 판매자 답변 · 훼손/ : /반품 · 훼손 · 판매자 답변/);
    for (const text of ['자유서술 원문 보존',
      '판매자 자유서술 보존','증빙 추가','클레임 접수','판매자 답변 등록',
      evidenceId]) assert.match(html,new RegExp(text));
    assert.doesNotMatch(html,/>SELLER_REPLIED</);
    assert.doesNotMatch(html,/Claim requested|Seller reply submitted|Evidence [0-9a-f-]+ added/);
  }
});
