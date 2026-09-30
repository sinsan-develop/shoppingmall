import type { Pool } from 'pg';
import { PublicProducts } from '../catalog/public-products.js';
import type { HomeEvent, HomePayload } from './types.js';

type SellableProduct = Awaited<ReturnType<PublicProducts['getSellableByIds']>>[number];

const empty: HomePayload = { menu: [], events: [], recommendations: [] };
const unavailable = { status: 'unavailable', message: '현재 이 기획전을 볼 수 없습니다. 전체 상품을 둘러보세요.' };

function sorted<T extends { displayOrder: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.displayOrder - b.displayOrder);
}

function selectHero(event: HomeEvent, products: SellableProduct[]) {
  const heroProduct = products.find((product) => product.productId === event.heroProductId) ?? products[0];
  const images = heroProduct.images;
  const heroImageId = images.some((image) => image.id === event.heroImageId)
    ? event.heroImageId : (images[0]?.id ?? null);
  return { heroProduct, heroImageId };
}

/** Customer projection is derived from an immutable publication plus current catalog state. */
export class PublicHome {
  constructor(private readonly pool: Pool) {}

  private async currentPayload(): Promise<HomePayload> {
    const result = await this.pool.query<{ payload: HomePayload }>(
      `SELECT publication.payload FROM home_content_current current
       JOIN home_content_publications publication ON publication.id=current.publication_id
       WHERE current.id=1`,
    );
    return result.rows[0]?.payload ?? empty;
  }

  async content(now = new Date()) {
    const payload = await this.currentPayload();
    const catalog = new PublicProducts(this.pool);
    const instant = now.getTime();
    const eventProducts = new Map<string, SellableProduct[]>();
    const events = [];
    for (const event of sorted(payload.events)) {
      if (!(Date.parse(event.startAt) <= instant && instant < Date.parse(event.endAt))) continue;
      const products = await catalog.getSellableByIds(event.productIds);
      if (!products.length) continue;
      eventProducts.set(event.id, products);
      const { heroProduct, heroImageId } = selectHero(event, products);
      events.push({ id: event.id, title: event.title, description: event.description,
        displayOrder: event.displayOrder, heroProduct, heroImageId });
    }
    const recommendations = await catalog.getSellableByIds(payload.recommendations);
    const menu = [];
    for (const item of sorted(payload.menu)) {
      if (!item.visible) continue;
      const target = item.target;
      if (target.type === 'event' && !eventProducts.has(target.id)) continue;
      if (target.type === 'product' && !(await catalog.getSellableByIds([target.id])).length) continue;
      if (target.type === 'category' && !(await catalog.list({ categoryId: target.id })).length) continue;
      if (target.type === 'seller' && !(await catalog.list({ sellerId: target.id })).length) continue;
      menu.push(item);
    }
    return { menu, events, recommendations };
  }

  async event(id: string, now = new Date()) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return unavailable;
    const payload = await this.currentPayload();
    const event = payload.events.find((item) => item.id === id);
    const instant = now.getTime();
    if (!event || !(Date.parse(event.startAt) <= instant && instant < Date.parse(event.endAt))) return unavailable;
    const products = await new PublicProducts(this.pool).getSellableByIds(event.productIds);
    if (!products.length) return unavailable;
    return { id: event.id, title: event.title, description: event.description, products };
  }
}
