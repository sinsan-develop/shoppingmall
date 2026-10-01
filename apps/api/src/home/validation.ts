import type { HomeEvent, HomeMenuItem, HomePayload, HomeTarget } from './types.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function record(value: unknown, label: string, allowed: string[]) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !allowed.includes(key))) throw new Error(`Invalid ${label} field`);
  return result;
}

function array(value: unknown, label: string, max: number, min = 0) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`Invalid ${label} count`);
  return value as unknown[];
}

function id(value: unknown, label: string) {
  if (typeof value !== 'string' || !uuid.test(value)) throw new Error(`Invalid ${label} id`);
  return value;
}

function text(value: unknown, label: string, max: number, min = 0) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || /[<>]/.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value.trim();
}

function order(value: unknown) {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 1000) throw new Error('Invalid display order');
  return value as number;
}

function date(value: unknown, label: string) {
  if (typeof value !== 'string' || !timestamp.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Invalid ${label} time`);
  }
  return value;
}

function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`);
}

function target(value: unknown): HomeTarget {
  const item = record(value, 'target link', ['type', 'id']);
  if (item.type === 'home' || item.type === 'catalog') {
    if ('id' in item) throw new Error('Invalid target id');
    return { type: item.type };
  }
  if (item.type === 'category' || item.type === 'seller' || item.type === 'event' || item.type === 'product') {
    return { type: item.type, id: id(item.id, 'target') };
  }
  throw new Error('Invalid target link');
}

function menuItem(value: unknown): HomeMenuItem {
  const item = record(value, 'menu', ['id', 'label', 'displayOrder', 'visible', 'target']);
  if (typeof item.visible !== 'boolean') throw new Error('Invalid menu visibility');
  return {
    id: id(item.id, 'menu'), label: text(item.label, 'label', 30, 1),
    displayOrder: order(item.displayOrder), visible: item.visible, target: target(item.target),
  };
}

function eventItem(value: unknown): HomeEvent {
  const item = record(value, 'event',
    ['id', 'title', 'description', 'displayOrder', 'startAt', 'endAt', 'productIds', 'heroProductId', 'heroImageId']);
  const productIds = array(item.productIds, 'product', 50, 1).map((value) => id(value, 'product'));
  unique(productIds, 'product');
  const heroProductId = id(item.heroProductId, 'hero product');
  if (!productIds.includes(heroProductId)) throw new Error('Hero product must be selected');
  const startAt = date(item.startAt, 'start');
  const endAt = date(item.endAt, 'end');
  if (Date.parse(endAt) <= Date.parse(startAt)) throw new Error('End time must follow start time');
  return {
    id: id(item.id, 'event'), title: text(item.title, 'title', 80, 1),
    description: text(item.description, 'description', 240), displayOrder: order(item.displayOrder),
    startAt, endAt, productIds, heroProductId,
    heroImageId: item.heroImageId == null ? null : id(item.heroImageId, 'hero image'),
  };
}

export function parseHomePayload(value: unknown): HomePayload {
  const input = record(value, 'payload', ['menu', 'events', 'recommendations']);
  const menu = array(input.menu, 'menu', 12).map(menuItem);
  const events = array(input.events, 'event', 12).map(eventItem);
  const recommendations = array(input.recommendations, 'recommendation', 24)
    .map((value) => id(value, 'recommendation'));
  unique(menu.map((item) => item.id), 'menu');
  unique(events.map((item) => item.id), 'event');
  unique(recommendations, 'recommendation');
  const eventIds = new Set(events.map((item) => item.id));
  for (const item of menu) {
    if (item.target.type === 'event' && !eventIds.has(item.target.id)) throw new Error('Invalid event target');
  }
  return { menu, events, recommendations };
}
