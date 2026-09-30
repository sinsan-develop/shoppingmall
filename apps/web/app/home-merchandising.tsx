'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Product = { productId: string; title: string; sellerName: string; originLabel: string;
  minPriceWon: number; images: { id: string }[] };
type Target = { type: 'home' | 'catalog' | 'category' | 'seller' | 'event' | 'product'; id?: string };
type MenuItem = { id: string; label: string; displayOrder: number; target: Target };
type Event = { id: string; title: string; description: string; displayOrder?: number;
  heroProduct: Product; heroImageId: string | null };
type Content = { menu: MenuItem[]; events: Event[]; recommendations: Product[] };
type State = { content: Content; loading: boolean; error: boolean; retry: () => void };
const empty: Content = { menu: [], events: [], recommendations: [] };
const Context = createContext<State>({ content: empty, loading: true, error: false, retry: () => {} });
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

function link(target: Target): string {
  if (target.type === 'home') return '/';
  if (target.type === 'catalog') return '/products';
  if (target.type === 'category') return `/products?categoryId=${encodeURIComponent(target.id ?? '')}`;
  if (target.type === 'seller') return `/products?sellerId=${encodeURIComponent(target.id ?? '')}`;
  if (target.type === 'event') return `/events/${encodeURIComponent(target.id ?? '')}`;
  return `/products/${encodeURIComponent(target.id ?? '')}`;
}

export function HomeMenuView({ menu }: { menu: MenuItem[] }) {
  return <nav className="shell site-menu" aria-label="어울몰 메뉴">
    <a href="/" aria-current="page">홈</a><a href="/products">제철 농산물</a>
    {[...menu].sort((a, b) => a.displayOrder - b.displayOrder).map((item) =>
      <a key={item.id} href={link(item.target)}>{item.label}</a>)}
  </nav>;
}

export function HomeEventsView({ events, loading, error, onRetry }: {
  events: Event[]; loading: boolean; error?: boolean; onRetry?: () => void;
}) {
  return <section className="home-section" aria-labelledby="events-title">
    <div className="section-heading"><p className="eyebrow">SEASONAL STORIES</p><h2 id="events-title">기획전</h2></div>
    {loading ? <p role="status">기획전을 불러오는 중</p> : error ?
      <p role="alert">기획전을 불러오지 못했습니다 <button type="button" className="secondary-button" onClick={onRetry}>다시 시도</button></p> :
      events.length === 0 ? <p className="section-note">현재 진행 중인 기획전이 없습니다</p> :
        <div className="event-grid">{events.map((event) =>
          <a className="feature-card event-card" href={`/events/${encodeURIComponent(event.id)}`} key={event.id}>
            {event.heroImageId && apiOrigin ? <img loading="lazy" alt=""
              src={`${apiOrigin}/catalog/products/${encodeURIComponent(event.heroProduct.productId)}/images/${encodeURIComponent(event.heroImageId)}`} /> :
              <span className="ms-ph">{event.heroProduct.title}</span>}
            <span className="card-kicker">어울몰 기획전</span><strong>{event.title}</strong><span>{event.description}</span>
          </a>)}</div>}
  </section>;
}

export function HomeRecommendationsView({ products, loading, error, onRetry }: {
  products: Product[]; loading: boolean; error?: boolean; onRetry?: () => void;
}) {
  return <section className="home-section" aria-labelledby="recommendations-title">
    <div className="section-heading"><p className="eyebrow">CURATED FOR EVERYONE</p><h2 id="recommendations-title">추천 상품</h2></div>
    <p className="section-note">관리자가 고른 상품을 같은 순서로 소개합니다</p>
    {loading ? <p role="status">추천 상품을 불러오는 중</p> : error ?
      <p role="alert">추천 상품을 불러오지 못했습니다 <button type="button" className="secondary-button" onClick={onRetry}>다시 시도</button></p> :
      products.length === 0 ? <p className="product-empty">관리자가 추천 상품을 준비 중입니다</p> :
        <div className="search-results home-products">{products.map((product) =>
          <article className="search-product" key={product.productId}>
            {product.images[0] && apiOrigin ? <img className="home-product-photo" loading="lazy" alt=""
              src={`${apiOrigin}/catalog/products/${encodeURIComponent(product.productId)}/images/${encodeURIComponent(product.images[0].id)}`} /> :
              <span className="ms-ph home-product-photo">상품 사진 준비 중</span>}
            <p className="eyebrow">{product.originLabel}</p>
            <h3><a className="product-link" href={`/products/${encodeURIComponent(product.productId)}`}>{product.title}</a></h3>
            <p>{product.sellerName}</p><p className="product-price">{product.minPriceWon.toLocaleString('ko-KR')}원부터</p>
          </article>)}</div>}
  </section>;
}

export function HomeContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (!apiOrigin) { setError(true); setLoading(false); return () => controller.abort(); }
    fetch(`${apiOrigin}/home/content`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Home unavailable');
        const value: unknown = await response.json();
        if (!value || typeof value !== 'object' ||
          !Array.isArray((value as Content).menu) || !Array.isArray((value as Content).events) ||
          !Array.isArray((value as Content).recommendations)) throw new Error('Invalid home content');
        if (!controller.signal.aborted) { setContent(value as Content); setError(false); }
      }).catch(() => { if (!controller.signal.aborted) { setContent(empty); setError(true); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  return <Context.Provider value={{ content, loading, error, retry: () => {
    setLoading(true); setAttempt((current) => current + 1);
  } }}>{children}</Context.Provider>;
}

export function HomeMenu() { const { content } = useContext(Context); return <HomeMenuView menu={content.menu} />; }
export function HomeEvents() {
  const { content, loading, error, retry } = useContext(Context);
  return <HomeEventsView events={content.events} loading={loading} error={error} onRetry={retry} />;
}
export function HomeRecommendations() {
  const { content, loading, error, retry } = useContext(Context);
  return <HomeRecommendationsView products={content.recommendations} loading={loading} error={error} onRetry={retry} />;
}
