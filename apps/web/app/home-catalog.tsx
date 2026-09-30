'use client';

import { useEffect, useState } from 'react';

type Category = { id: string; parentId: string | null; name: string };
type Seller = { id: string; displayName: string };
type HomeCatalogProps = { categories: Category[]; sellers: Seller[]; loading: boolean; error?: string };

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export function HomeCatalogView({ categories, sellers, loading, error }: HomeCatalogProps) {
  const majorCategories = categories.filter((category) => category.parentId === null);
  return (
    <>
      <section className="home-section" aria-labelledby="categories-title">
        <div className="section-heading"><p className="eyebrow">EXPLORE</p><h2 id="categories-title">상품 카테고리</h2></div>
        <p className="section-note">관리자가 등록한 대분류로 찾아보세요</p>
        {loading ? <p role="status">카테고리를 불러오는 중</p> : error ? <p role="alert">{error}</p> :
          majorCategories.length === 0 ? <p className="section-note">등록된 카테고리가 없습니다</p> :
            <div className="category-row">
              {majorCategories.map((category) =>
                <a className="category-link" key={category.id}
                  href={`/products?categoryId=${encodeURIComponent(category.id)}`}>{category.name}</a>)}
            </div>}
      </section>
      <section className="home-section" aria-labelledby="seller-story-title">
        <div className="section-heading"><p className="eyebrow">OUR SELLERS</p><h2 id="seller-story-title">판매자 이야기</h2></div>
        <p className="section-note">농가와 어울몰 판매자의 상품을 같은 기준으로 소개합니다</p>
        {loading ? <p role="status">판매자를 불러오는 중</p> : error ? <p role="alert">{error}</p> :
          sellers.length === 0 ? <p className="section-note">소개할 판매자가 없습니다</p> :
            <div className="seller-story-links">{sellers.map(({ id, displayName }) =>
              <a className="category-link" key={id} href={`/products?sellerId=${encodeURIComponent(id)}`}>{displayName}</a>)}</div>}
      </section>
    </>
  );
}

export default function HomeCatalog() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    if (!apiOrigin) {
      setError('상품 연결을 준비 중입니다');
      setLoading(false);
      return () => controller.abort();
    }
    Promise.all([
      fetch(`${apiOrigin}/catalog/categories`, { signal: controller.signal }),
      fetch(`${apiOrigin}/catalog/sellers`, { signal: controller.signal }),
    ]).then(async ([categoryResponse, sellerResponse]) => {
      if (!categoryResponse.ok || !sellerResponse.ok) throw new Error('상품을 불러올 수 없습니다');
      const [nextCategories, nextSellers] = await Promise.all([categoryResponse.json(), sellerResponse.json()]);
      if (!Array.isArray(nextCategories) || !Array.isArray(nextSellers)) throw new Error('상품을 불러올 수 없습니다');
      setCategories(nextCategories);
      setSellers(nextSellers);
      setError(undefined);
    }).catch(() => { if (!controller.signal.aborted) setError('상품을 불러올 수 없습니다'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  return <HomeCatalogView categories={categories} sellers={sellers} loading={loading} error={error} />;
}
