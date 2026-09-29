import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EngagementControlsView, createEngagementLoadGate } from '../app/products/[productId]/engagement-controls.tsx';
import { EngagementListsView } from '../app/account/customer/engagement-lists.tsx';

const product = { productId: 'p1', title: '고추', saleStopped: false, options: [
  { id: 'in-stock', name: '1kg', sellableQuantity: 2 },
  { id: 'sold-out', name: '500g', sellableQuantity: 0 },
] };
const view = (overrides = {}) => renderToStaticMarkup(createElement(EngagementControlsView, {
  product, access: 'ready', favorite: false, activeRestock: [], busy: '', message: '', onFavorite: () => {},
  onRestock: () => {}, onCancel: () => {}, ...overrides,
}));

test('customer controls offer sign-in advice and only a sold-out published option can request restock', () => {
  const anonymous = view({ access: 'unauthorized' });
  assert.match(anonymous, /로그인 후 찜과 재입고 신청/);
  assert.doesNotMatch(anonymous, /재입고 신청<\/button>/);
  const ready = view();
  assert.match(ready, /500g 재입고 신청/);
  assert.doesNotMatch(ready, /1kg 재입고 신청/);
  assert.match(ready, /고추 찜하기/);
  assert.doesNotMatch(view({ product: { ...product, saleStopped: true } }), /500g 재입고 신청/);
});

test('pending and errors never look like completed saves, and buttons have specific names', () => {
  const pending = view({ busy: 'favorite' });
  assert.match(pending, /<button[^>]*disabled=""[^>]*aria-label="고추 찜하기"/);
  assert.doesNotMatch(pending, /찜에 저장했습니다/);
  const failed = view({ message: '저장하지 못했습니다' });
  assert.match(failed, /저장하지 못했습니다/);
  assert.doesNotMatch(failed, /찜에 저장했습니다/);
  const requested = view({ activeRestock: [{ id: 'r1', productId: 'p1', optionName: '500g', status: 'active' }] });
  assert.match(requested, /500g 재입고 신청 취소/);
});

test('own engagement list distinguishes missing option, empty state and cancellation', () => {
  const empty = renderToStaticMarkup(createElement(EngagementListsView, {
    favorites: [], restock: [], busy: '', message: '', onCancel: () => {},
  }));
  assert.match(empty, /찜한 상품이 없습니다/);
  assert.match(empty, /재입고 신청이 없습니다/);
  const filled = renderToStaticMarkup(createElement(EngagementListsView, {
    favorites: [{ productId: 'p1', title: '고추', published: true, saleStopped: false }],
    restock: [{ id: 'r1', productId: 'p1', optionName: '500g', status: 'active', title: '고추', optionState: 'missing' }],
    busy: '', message: '', onCancel: () => {},
  }));
  assert.match(filled, /현재 없는 옵션/);
  assert.match(filled, /고추 500g 재입고 신청 취소/);
});

test('a response from a previous product or an obsolete request cannot overwrite the current view', () => {
  const gate = createEngagementLoadGate();
  const first = gate.begin('p1');
  assert.equal(gate.isCurrent(first, 'p1'), true);
  const second = gate.begin('p2');
  assert.equal(gate.isCurrent(first, 'p1'), false);
  assert.equal(gate.isCurrent(second, 'p2'), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(second, 'p2'), false);
});
