import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminSupportQuestionsPage, { AdminSupportQuestionsView } from
  '../app/account/admin/support/questions/page.tsx';

const detail = { id: 'q-1',productId: 'product-a',body: '질문 본문',status: 'ANSWERED',
  messages: [{ id: 'm-1',authorRole: 'seller',body: '판매자 답변',
    createdAt: '2026-10-07T00:00:00Z',events: [{ action: 'SUBMITTED' }] }] };

test('admin sees message IDs and chooses a seller answer to publish', () => {
  assert.match(renderToStaticMarkup(createElement(AdminSupportQuestionsPage)),
    /운영자 권한 확인 중/);
  assert.match(readFileSync(new URL('../app/account/page.tsx',import.meta.url),'utf8'),
    /\/account\/admin\/support\/questions/);
  const html = renderToStaticMarkup(createElement(AdminSupportQuestionsView, {
    items: [{ ...detail,createdAt: '2026-10-07T00:00:00Z' }],selected: detail,
    busy: false,message: '',statusFilter: 'ANSWERED',nextCursor: 'next',
    onFilter: () => {},onMore: () => {},onSelect: () => {},onPublish: () => {},
  }));
  for (const label of ['문의 공개 승인','질문 본문','판매자 답변','m-1',
    '이 답변 공개','더보기']) assert.match(html,new RegExp(label));
  const source = readFileSync(new URL('../app/account/admin/support/questions/page.tsx',
    import.meta.url),'utf8');
  assert.match(source,/messageId/);
  assert.match(source,/admin\/support\/questions/);
  assert.match(source,/credentials: 'include'/);
});
