import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { completionCandidates, completionOverlaps, SettlementPage,
  correctionChoices, correctionResultMessage, seoulInputToIso } from '../app/account/settlement-page.tsx';

const completions = [{ sellerId: 'farm-a', startDate: '2026-05-01', endDate: '2026-05-20' }];

test('a completed seller period blocks only that seller when dates overlap', () => {
  assert.equal(completionOverlaps(completions, 'farm-a', '2026-05-01', '2026-05-20'), true);
  assert.equal(completionOverlaps(completions, 'farm-a', '2026-05-20', '2026-05-31'), true);
  assert.equal(completionOverlaps(completions, 'farm-a', '2026-05-21', '2026-05-31'), false);
  assert.equal(completionOverlaps(completions, 'farm-b', '2026-05-01', '2026-05-20'), false);
});

test('admin can enter a manual commission with explicit Seoul occurrence and evidence', () => {
  assert.equal(seoulInputToIso('2026-05-02T09:00'), '2026-05-02T00:00:00.000Z');
  assert.throws(() => seoulInputToIso('2026-02-30T09:00'), /발생 시점/);
  const admin = renderToStaticMarkup(createElement(SettlementPage, { role: 'admin' }));
  assert.match(admin, /수수료 수동 기록/);
  assert.match(admin, /발생 시점 \(한국 시각\)/);
  assert.match(admin, /기록 근거/);
  const seller = renderToStaticMarkup(createElement(SettlementPage, { role: 'seller' }));
  assert.doesNotMatch(seller, /수수료 수동 기록/);
});

test('only admin sees a correction form with original event, direction, amount and reason', () => {
  const admin = renderToStaticMarkup(createElement(SettlementPage, { role: 'admin' }));
  for (const expected of ['정정 사건 기록', '원사건 ID', '증가', '감소', '정정 금액', '정정 사유']) {
    assert.ok(admin.includes(expected), expected);
  }
  const seller = renderToStaticMarkup(createElement(SettlementPage, { role: 'seller' }));
  assert.doesNotMatch(seller, /정정 사건 기록/);
});

test('correction picker identifies seller, date, kind, amount and saved result explicitly', () => {
  const originalEventId = '11111111-1111-4111-8111-111111111111';
  const choices = correctionChoices({ groups: [{ sellerName: '농가 A', items: [{
    id: originalEventId, kind: 'commission', amountWon: 10000,
    occurredAt: '2026-05-01T00:00:00Z', productName: null,
  }] }], lateGroups: [] });
  assert.equal(choices.length, 1);
  for (const value of ['농가 A', '2026', '수수료', '10,000원'])
    assert.ok(choices[0].label.includes(value), value);
  const message = correctionResultMessage({ id: 'saved-correction', originalEventId,
    direction: 'decrease', amountWon: 2000 });
  for (const value of ['saved-correction', originalEventId, '감소', '2,000원'])
    assert.ok(message.includes(value), value);
});

test('a seller with zero events remains a completion candidate in all, category and individual views', () => {
  const sellers = [
    { id: 'farm-a', name: '농가 A', categoryId: 'farms' },
    { id: 'farm-empty', name: '거래 없는 농가', categoryId: 'farms' },
    { id: 'owool', name: '어울몰', categoryId: 'own' },
  ];
  assert.deepEqual(completionCandidates(sellers, { categoryId: '', sellerId: '' })
    .map(({ id }) => id), ['farm-a', 'farm-empty', 'owool']);
  assert.deepEqual(completionCandidates(sellers, { categoryId: 'farms', sellerId: '' })
    .map(({ id }) => id), ['farm-a', 'farm-empty']);
  assert.deepEqual(completionCandidates(sellers, { categoryId: '', sellerId: 'farm-empty' })
    .map(({ id }) => id), ['farm-empty']);
});

test('historical category query still offers its seller for seller-wide period completion', () => {
  const sellers = [{ id: 'farm-a', name: '농가 A', categoryId: 'new' },
    { id: 'farm-b', name: '농가 B', categoryId: 'new' }];
  const historical = { groups: [{ sellerId: 'farm-a' }], lateGroups: [], completions: [] };
  assert.deepEqual(completionCandidates(sellers, { categoryId: 'old', sellerId: '' }, historical)
    .map(({ id }) => id), ['farm-a']);
});
