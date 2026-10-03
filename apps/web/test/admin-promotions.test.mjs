import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminPromotionsPage, { AdminPromotionsView } from '../app/account/admin/promotions/page.tsx';

test('operator promotion page is private until admin session verification', () => {
  assert.match(renderToStaticMarkup(createElement(AdminPromotionsPage)), /운영자 권한 확인 중/);
  assert.match(readFileSync(new URL('../app/account/page.tsx', import.meta.url), 'utf8'),
    /\/account\/admin\/promotions/);
});

test('operator can see campaign version, rules, limits, issue count and explicit actions', () => {
  const html = renderToStaticMarkup(createElement(AdminPromotionsView, {
    campaigns: [{ id: 'campaign-1', title: '제철 할인', kind: 'goods_discount', status: 'active',
      directIssueLimit: 2, totalUseLimit: 10, perAccountUseLimit: 1,
      versionId: 'version-1', version: 2, scope: 'all', targetIds: [],
      startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z',
      amountKind: 'fixed', amountValue: 5000, minimumEligibleGoodsWon: 30000,
      maxDiscountWon: null, directIssuedCount: 1, activeUseCount: 0 }],
    busy: false, onCreate: () => {}, onVersion: () => {}, onStop: () => {}, onGrant: () => {},
  }));
  for (const label of ['프로모션 등록', '새 버전', '직접 발행', '중지', '제철 할인',
    '5,000원', '30,000원', '발행 1', '사용 0']) assert.match(html, new RegExp(label));
  assert.match(html, /name="accountId"/);
  assert.match(html, /name="reason"/);
  assert.doesNotMatch(html, /자동 송금|결제 완료/);
});
