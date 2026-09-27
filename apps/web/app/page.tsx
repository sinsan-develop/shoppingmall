import HomeCatalog from './home-catalog';

export default function Page() {
  return (
    <>
      <header className="site-header">
        <div className="shell header-inner">
          <div className="brand" aria-label="어울몰">어울몰</div>
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
          <p className="eyebrow">산지의 정성을 잇다</p>
          <h1 id="home-title">어울몰</h1>
          <p className="hero-copy">좋은 땅에서 자란 것을, 귀한 분의 식탁까지</p>
          <p className="availability">서비스 구축 중입니다. 상품과 주문 기능은 검증 후 공개하겠습니다.</p>
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
