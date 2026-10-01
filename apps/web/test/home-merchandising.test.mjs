import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomeMenuView, HomeEventsView, HomeRecommendationsView } from '../app/home-merchandising.tsx';
import { EventDetailView } from '../app/events/[id]/page.tsx';

const product = { productId: 'product-1', title: '햇고추', originLabel: '경남 진주',
  sellerName: '진주농가', minPriceWon: 23000, images: [] };

test('fixed navigation survives empty or failed merchandising and curated links remain internal', () => {
  const empty = renderToStaticMarkup(createElement(HomeMenuView, { menu: [] }));
  assert.match(empty, /href="\/"[^>]*>홈<\/a>/);
  assert.match(empty, /href="\/products"[^>]*>제철 농산물<\/a>/);
  const menu = renderToStaticMarkup(createElement(HomeMenuView, { menu: [
    { id: 'menu-2', label: '기획전', displayOrder: 2, target: { type: 'event', id: 'event-1' } },
    { id: 'menu-1', label: '과일', displayOrder: 1, target: { type: 'category', id: 'category-1' } },
  ] }));
  assert.ok(menu.indexOf('>과일</a>') < menu.indexOf('>기획전</a>'));
  assert.match(menu, /href="\/events\/event-1"/);
  assert.match(menu, /href="\/products\?categoryId=category-1"/);
});

test('events and recommendations show only supplied public products and usable empty/error states', () => {
  const event = { id: 'event-1', title: '제철 모음', description: '정성껏 고른 상품',
    heroProduct: product, heroImageId: null };
  const events = renderToStaticMarkup(createElement(HomeEventsView, { events: [event], loading: false }));
  assert.match(events, /href="\/events\/event-1"/);
  assert.match(events, /제철 모음/);
  assert.doesNotMatch(events, /할인|배송 보장/);
  const recommendations = renderToStaticMarkup(createElement(HomeRecommendationsView,
    { products: [product], loading: false }));
  assert.match(recommendations, /href="\/products\/product-1"/);
  assert.match(recommendations, /23,000원/);
  assert.match(renderToStaticMarkup(createElement(HomeRecommendationsView,
    { products: [], loading: false })), /관리자가 추천 상품을 준비 중입니다/);
  assert.match(renderToStaticMarkup(createElement(HomeEventsView,
    { events: [], loading: false, error: true })), /다시 시도/);
});

test('event detail links only selected products and old URLs lead back to catalog', () => {
  const detail = renderToStaticMarkup(createElement(EventDetailView,
    { event: { id: 'event-1', title: '제철 모음', description: '정성껏 고른 상품', products: [product] } }));
  assert.match(detail, /제철 모음/);
  assert.match(detail, /href="\/products\/product-1"/);
  const expired = renderToStaticMarkup(createElement(EventDetailView,
    { event: { status: 'unavailable' } }));
  assert.match(expired, /href="\/products"/);
  assert.doesNotMatch(expired, /product-1/);
});
