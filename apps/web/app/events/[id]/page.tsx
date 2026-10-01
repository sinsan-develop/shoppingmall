type Product = { productId: string; title: string; sellerName: string; originLabel: string;
  minPriceWon: number; images: { id: string }[] };
type Event = { id: string; title: string; description: string; products: Product[] };

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export const dynamic = 'force-dynamic';

export function EventDetailView({ event, error = false }: { event?: Event | { status: 'unavailable' }; error?: boolean }) {
  const available = event && 'products' in event;
  return <main id="main-content" tabIndex={-1} className="shell search-main event-detail">
    <a className="text-link" href="/">어울몰 홈으로</a>
    {error ? <><h1>기획전을 불러오지 못했습니다</h1><p>잠시 후 다시 방문해 주세요.</p></> :
      !available ? <><h1>지금은 볼 수 없는 기획전입니다</h1>
        <p>기간이 지났거나 현재 판매 가능한 상품이 없습니다.</p></> :
        <><p className="eyebrow">어울몰 기획전</p><h1>{event.title}</h1><p>{event.description}</p>
          <div className="search-results home-products">{event.products.map((product) =>
            <article className="search-product" key={product.productId}>
              {product.images[0] && apiOrigin ? <img className="home-product-photo" alt="" loading="lazy"
                src={`${apiOrigin}/catalog/products/${encodeURIComponent(product.productId)}/images/${encodeURIComponent(product.images[0].id)}`} /> :
                <span className="ms-ph home-product-photo">상품 사진 준비 중</span>}
              <p className="eyebrow">{product.originLabel}</p>
              <h2><a className="product-link" href={`/products/${encodeURIComponent(product.productId)}`}>{product.title}</a></h2>
              <p>{product.sellerName}</p><p className="product-price">{product.minPriceWon.toLocaleString('ko-KR')}원부터</p>
            </article>)}</div></>}
    <p><a className="hero-button hero-button-secondary" href="/products">전체 상품 둘러보기</a></p>
  </main>;
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!apiOrigin) return <EventDetailView error />;
  try {
    const response = await fetch(`${apiOrigin}/home/events/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!response.ok) return <EventDetailView error />;
    const event = await response.json() as Event | { status: 'unavailable' };
    return <EventDetailView event={event} />;
  } catch { return <EventDetailView error />; }
}
