import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SellerSupportPage, { SellerSupportView } from '../app/account/seller/support/page.tsx';

const question = { id: 'q-1',productId: 'product-a',body: '구매 전 문의',status: 'ANSWERED',
  messages: [{ id: 'm-1',authorRole: 'seller',body: '첫 답변',
    createdAt: '2026-10-07T00:00:00Z',events: [{ action: 'SUBMITTED' }] }] };

test('seller support shows owned question history and sends append-only replies', () => {
  assert.match(renderToStaticMarkup(createElement(SellerSupportPage)), /판매자 권한 확인 중/);
  assert.match(readFileSync(new URL('../app/account/page.tsx',import.meta.url),'utf8'),
    /\/account\/seller\/support/);
  const html = renderToStaticMarkup(createElement(SellerSupportView, {
    items: [{ ...question,createdAt: '2026-10-07T00:00:00Z' }],selected: question,
    busy: false,message: '',nextCursor: 'next',onMore: () => {},onSelect: () => {},
    onReply: () => {},
  }));
  for (const label of ['상품 문의','구매 전 문의','첫 답변','추가 답변','더보기',
    '관리자 공개 승인 후']) assert.match(html,new RegExp(label));
  const source = readFileSync(new URL('../app/account/seller/support/page.tsx',
    import.meta.url),'utf8');
  assert.match(source,/seller\/support\/questions/);
  assert.match(source,/idempotency-key/);
  assert.match(source,/credentials: 'include'/);
});
