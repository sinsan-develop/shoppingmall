import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHomePayload } from '../src/home/validation.ts';

const eventId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const imageId = '33333333-3333-4333-8333-333333333333';
const menuId = '44444444-4444-4444-8444-444444444444';
const event = {
  id: eventId, title: '제철 고추', description: '산지의 정성', displayOrder: 0,
  startAt: '2026-10-01T09:00:00+09:00', endAt: '2026-10-02T09:00:00+09:00',
  productIds: [productId], heroProductId: productId, heroImageId: imageId,
};
const menu = { id: menuId, label: '이달의 제철', displayOrder: 0, visible: true,
  target: { type: 'event', id: eventId } };

function payload(overrides = {}) {
  return { menu: [menu], events: [event], recommendations: [productId], ...overrides };
}

test('home payload accepts only internal typed links and a valid selected event', () => {
  assert.deepEqual(parseHomePayload(payload()), payload());
  assert.deepEqual(parseHomePayload({ menu: [], events: [], recommendations: [] }),
    { menu: [], events: [], recommendations: [] });
  assert.throws(() => parseHomePayload(payload({ menu: [{ ...menu, target: { type: 'url', href: 'https://outside.test' } }] })),
    /target|link/i);
  assert.throws(() => parseHomePayload(payload({ menu: [{ ...menu, target: { type: 'event', id: imageId } }] })),
    /event|target/i);
  assert.throws(() => parseHomePayload(payload({ menu: [{ ...menu, target: { type: 'catalog', id: productId } }] })),
    /target|id/i);
});

test('home payload rejects duplicated identities and invalid event/product selection', () => {
  assert.throws(() => parseHomePayload(payload({ menu: [menu, menu] })), /duplicate|menu/i);
  assert.throws(() => parseHomePayload(payload({ events: [event, event] })), /duplicate|event/i);
  assert.throws(() => parseHomePayload(payload({ recommendations: [productId, productId] })), /duplicate|recommendation/i);
  assert.throws(() => parseHomePayload(payload({ events: [{ ...event, productIds: [productId, productId] }] })),
    /duplicate|product/i);
  assert.throws(() => parseHomePayload(payload({ events: [{ ...event, productIds: [] }] })), /product/i);
  assert.throws(() => parseHomePayload(payload({ events: [{ ...event, heroProductId: imageId }] })), /hero|product/i);
});

test('home payload enforces size, text and time bounds before storage', () => {
  assert.throws(() => parseHomePayload(null), /payload/i);
  assert.throws(() => parseHomePayload(payload({ recommendations: Array.from({ length: 25 }, (_, n) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`) })), /recommendation|24/i);
  assert.throws(() => parseHomePayload(payload({ menu: Array.from({ length: 13 }, (_, n) =>
    ({ ...menu, id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` })) })), /menu|12/i);
  assert.throws(() => parseHomePayload(payload({ events: [{ ...event, endAt: event.startAt }] })), /time|end/i);
  assert.throws(() => parseHomePayload(payload({ events: [{ ...event, startAt: '2026-10-01' }] })), /time|start/i);
  assert.throws(() => parseHomePayload(payload({ menu: [{ ...menu, label: ' '.repeat(31) }] })), /label/i);
  assert.throws(() => parseHomePayload(payload({ events: [{ ...event, title: '가'.repeat(81) }] })), /title/i);
  assert.throws(() => parseHomePayload(payload({ events: [{ ...event, description: '가'.repeat(241) }] })), /description/i);
});
