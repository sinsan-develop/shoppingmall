import HomeCatalog from './home-catalog';

export default function Page() {
  return (
    <>
      <div className="promo-bar">전국 산지의 정성을, 한 상에</div>
      <header className="site-header">
        <div className="shell header-inner">
          <div className="brand" aria-label="어울몰">
            <span className="brand-mark" aria-hidden="true">어</span>
            <span className="brand-words"><span>어울몰</span><small>산지의 정성을 잇다</small></span>
          </div>
          <form className="search-preview" action="/products" method="get" role="search">
            <label className="visually-hidden" htmlFor="home-search">상품 검색</label>
            <input id="home-search" name="q" type="search" placeholder="상품명 또는 판매자 검색" />
            <button type="submit" aria-label="상품 검색">⌕</button>
          </form>
          <a className="text-link" href="/login">로그인</a>
        </div>
        <nav className="shell site-menu" aria-label="어울몰 메뉴">
          <a href="/" aria-current="page">홈</a>
          <a href="/products">제철 농산물</a>
          <a href="/#events-title">기획전</a>
          <a href="/#seller-story-title">판매자 이야기</a>
        </nav>
      </header>
      <main className="shell">
        <section className="hero" aria-labelledby="home-title">
          <div className="hero-inner">
            <div className="hero-content">
              <p className="eyebrow">어울몰 · 제철의 온기</p>
              <h1 id="home-title">전국 산지의 정성을<br />넉넉한 한 상으로</h1>
              <p className="hero-copy">농가가 정성껏 기른 먹거리를 출고 방법과 날짜까지 투명하게 안내해 드립니다. 받는 분의 식탁에 좋은 계절이 닿도록.</p>
              <div className="hero-actions">
                <a className="hero-button" href="/products">제철 상품 둘러보기</a>
                <a className="hero-button hero-button-secondary" href="/#seller-story-title">어울몰 이야기</a>
              </div>
              <p className="availability">서비스 구축 중입니다. 상품과 주문 기능은 검증 후 공개하겠습니다.</p>
            </div>
            <div className="hero-art" aria-label="상품 사진 자리표시">
              <div className="ms-ph">수확한 고추 사진</div>
              <div className="ms-ph">양파 사진</div>
              <div className="ms-ph">마늘 사진</div>
            </div>
          </div>
        </section>
        <section className="home-section" aria-labelledby="events-title">
          <div className="section-heading"><p className="eyebrow">SEASONAL STORIES</p><h2 id="events-title">기획전</h2></div>
          <div className="feature-card"><span className="card-kicker">어울몰 소식</span><p>제철의 풍요를 전할 준비를 하고 있습니다</p></div>
        </section>
        <HomeCatalog />
      </main>
    </>
  );
}
