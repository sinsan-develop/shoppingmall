import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { completionOverlaps, SettlementPage, seoulInputToIso } from '../app/account/settlement-page.tsx';

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
