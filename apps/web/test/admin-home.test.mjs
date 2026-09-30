import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminHomeView } from '../app/account/admin/home/page.tsx';
import { newHomeId } from '../app/account/admin/home/ids.ts';

test('operator home editor separates draft, preview, publication and restore', () => {
  const html = renderToStaticMarkup(createElement(AdminHomeView, {
    draft: { version: 2, payload: { menu: [], events: [], recommendations: [] } },
    categories: [], sellers: [], products: [], history: [], preview: null, busy: false,
    onChange: () => {}, onSave: () => {}, onPreview: () => {}, onPublish: () => {}, onRestore: () => {},
  }));
  for (const label of ['추가 메뉴', '기획전', '추천 상품', '편집본 저장', '미리보기', '고객 화면에 공개',
    '공개 이력', '한국시간', '상품 찾기']) assert.match(html, new RegExp(label));
  assert.match(html, /현재 공개본을 바꾸지 않습니다/);
  assert.doesNotMatch(html, /운영자 PIN|자동 송금/);
});

test('unsaved local edits cannot publish an older server draft', () => {
  const html = renderToStaticMarkup(createElement(AdminHomeView, {
    draft: { version: 2, payload: { menu: [], events: [], recommendations: [] } },
    categories: [], sellers: [], products: [], history: [], preview: null, busy: false, dirty: true,
    onChange: () => {}, onSave: () => {}, onPreview: () => {}, onPublish: () => {}, onRestore: () => {},
  }));
  assert.match(html, /저장하지 않은 변경사항/);
  assert.match(html, /disabled=""[^>]*>고객 화면에 공개<\/button>/);
});

test('preview names configured content and explains excluded targets before publish', () => {
  const event = { id: 'event-1', title: '제철 모음', description: '고른 상품', displayOrder: 0,
    startAt: '2026-10-01T01:00:00.000Z', endAt: '2026-10-02T01:00:00.000Z',
    productIds: ['product-1'], heroProductId: 'product-1', heroImageId: null };
  const payload = { menu: [{ id: 'menu-1', label: '제철 기획', displayOrder: 0, visible: true,
    target: { type: 'event', id: 'event-1' } }], events: [event], recommendations: ['product-1'] };
  const html = renderToStaticMarkup(createElement(AdminHomeView, {
    draft: { version: 2, payload }, categories: [], sellers: [], products: [
      { productId: 'product-1', title: '햇고추', sellerName: '진주농가' }],
    history: [], preview: { payload, excluded: [{ kind: 'event', id: 'event-1', reason: 'no_sellable_products' }] },
    busy: false, onChange: () => {}, onSave: () => {}, onPreview: () => {}, onPublish: () => {}, onRestore: () => {},
  }));
  assert.match(html, /미리보기 결과.*제철 기획.*제철 모음.*햇고추/s);
  assert.match(html, /no_sellable_products/);
});

test('preview counts only what customers can see now and explains scheduled or hidden items', () => {
  const event = { id: 'future-event', title: '다음 기획전', description: '', displayOrder: 0,
    startAt: '2026-10-02T01:00:00.000Z', endAt: '2026-10-03T01:00:00.000Z',
    productIds: ['product-1'], heroProductId: 'product-1', heroImageId: null };
  const payload = { menu: [{ id: 'hidden-menu', label: '숨긴 메뉴', displayOrder: 0, visible: false,
    target: { type: 'event', id: 'future-event' } }], events: [event], recommendations: ['product-1'] };
  const html = renderToStaticMarkup(createElement(AdminHomeView, {
    draft: { version: 2, payload }, categories: [], sellers: [], products: [
      { productId: 'product-1', title: '햇고추', sellerName: '진주농가' }],
    history: [], preview: { payload, excluded: [
      { kind: 'event', id: 'future-event', reason: 'not_started' },
      { kind: 'menu', id: 'hidden-menu', reason: 'hidden' },
    ] }, busy: false, onChange: () => {}, onSave: () => {}, onPreview: () => {}, onPublish: () => {}, onRestore: () => {},
  }));
  assert.match(html, /지금 고객에게 표시: 메뉴 0개 · 기획전 0개 · 추천 1개/);
  assert.match(html, /다음 기획전 · 고객 화면 비노출/);
  assert.match(html, /숨긴 메뉴 · 고객 화면 비노출/);
});

test('home editor IDs use secure random bytes without requiring randomUUID on HTTP QA', () => {
  const id = newHomeId((bytes) => bytes.fill(0));
  assert.match(id, /^00000000-0000-4000-8000-000000000000$/);
});

test('hero photo choices include thumbnails but never detail photos', () => {
  const event = { id: 'event-1', title: '제철', description: '', displayOrder: 0,
    startAt: '2026-10-01T01:00:00.000Z', endAt: '2026-10-02T01:00:00.000Z',
    productIds: ['product-1'], heroProductId: 'product-1', heroImageId: null };
  const html = renderToStaticMarkup(createElement(AdminHomeView, {
    draft: { version: 2, payload: { menu: [], events: [event], recommendations: [] } },
    categories: [], sellers: [], products: [{ productId: 'product-1', title: '햇고추', sellerName: '진주농가' }],
    heroImages: { 'product-1': [{ id: 'thumb-1', purpose: 'thumbnail' }, { id: 'detail-1', purpose: 'detail' }] },
    history: [], preview: null, busy: false,
    onChange: () => {}, onSave: () => {}, onPreview: () => {}, onPublish: () => {}, onRestore: () => {},
  }));
  assert.match(html, /<option value="thumb-1">사진 1<\/option>/);
  assert.doesNotMatch(html, /<option value="detail-1">/);
});
