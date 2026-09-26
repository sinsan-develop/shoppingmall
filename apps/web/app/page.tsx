export default function Page() {
  return (
    <>
      <header className="site-header">
        <div className="shell header-inner">
          <div className="brand" aria-label="어울몰">어울몰</div>
          <div className="search-preview" aria-label="상품 검색 준비 중">
            <span aria-hidden="true">⌕</span> 상품 검색 <span className="search-hint">상품명 또는 판매자를 찾아보세요</span>
          </div>
          <a className="text-link" href="/login">로그인</a>
        </div>
        <nav className="shell site-menu" aria-label="어울몰 메뉴">
          <span>홈</span><span>제철 농산물</span><span>기획전</span><span>판매자 이야기</span>
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
        <section className="home-section" aria-labelledby="categories-title">
          <div className="section-heading"><p className="eyebrow">EXPLORE</p><h2 id="categories-title">상품 카테고리</h2></div>
          <p className="section-note">대분류와 소분류는 관리자 등록 후 표시됩니다</p>
          <div className="category-row" aria-label="카테고리 준비 중"><span>과일</span><span>채소</span><span>곡물</span><span>가공식품</span></div>
        </section>
        <section className="home-section" aria-labelledby="recommendations-title">
          <div className="section-heading"><p className="eyebrow">CURATED FOR EVERYONE</p><h2 id="recommendations-title">추천 상품</h2></div>
          <p className="section-note">관리자가 고른 상품을 모두에게 같은 기준으로 소개합니다</p>
          <div className="product-empty">상품 준비 중</div>
        </section>
      </main>
    </>
  );
}
