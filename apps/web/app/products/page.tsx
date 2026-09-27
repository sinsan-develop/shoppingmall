'use client';

import { useEffect, useState } from 'react';

type Category = { id: string; parentId: string | null; name: string };
type Product = { productId: string; title: string; sellerName: string; originLabel: string; minPriceWon: number };
type ViewProps = { query: string; sort: string; categoryId: string; categories: Category[];
  products: Product[]; loading: boolean; error?: string;
  onQueryChange?: (value: string) => void; onCategoryChange?: (value: string) => void;
  onSortChange?: (value: string) => void };

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export function ProductSearchView({ query, sort, categoryId, categories, products, loading, error,
  onQueryChange = () => {}, onCategoryChange = () => {}, onSortChange = () => {} }: ViewProps) {
  return (
    <main className="shell search-main">
      <a className="text-link" href="/">어울몰 홈으로</a>
      <h1>상품 검색</h1>
      <form className="search-filters" action="/products" method="get" role="search">
        <label htmlFor="product-query">상품명 또는 판매자</label>
        <input id="product-query" name="q" type="search" value={query} maxLength={80}
          onChange={(event) => onQueryChange(event.currentTarget.value)} />
        <label htmlFor="product-category">상품 카테고리</label>
        <select id="product-category" name="categoryId" value={categoryId}
          onChange={(event) => onCategoryChange(event.currentTarget.value)}>
          <option value="">전체 카테고리</option>
          {categories.map((category) => <option key={category.id} value={category.id}>
            {category.parentId ? `　${category.name}` : category.name}
          </option>)}
        </select>
        <label htmlFor="product-sort">정렬</label>
        <select id="product-sort" name="sort" value={sort}
          onChange={(event) => onSortChange(event.currentTarget.value)}>
          <option value="latest">최신순</option>
          <option value="price_asc">최저가순</option>
          <option value="price_desc">높은 가격순</option>
        </select>
        <button className="primary-button" type="submit">검색</button>
      </form>
      {loading ? <p role="status">상품을 찾고 있습니다</p> : error ? <p role="alert">{error}</p> :
        products.length === 0 ? <p className="product-empty">검색 결과가 없습니다</p> :
          <section className="search-results" aria-label="상품 검색 결과">
            {products.map((product) => <article className="search-product" key={product.productId}>
              <p className="eyebrow">{product.originLabel}</p>
              <h2><a className="product-link" href={`/products/${encodeURIComponent(product.productId)}`}>{product.title}</a></h2>
              <p>{product.sellerName}</p>
              <p className="product-price">{product.minPriceWon.toLocaleString('ko-KR')}원부터</p>
            </article>)}
          </section>}
    </main>
  );
}

export default function ProductsPage() {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sort, setSort] = useState('latest');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextQuery = params.get('q') ?? '';
    const nextCategory = params.get('categoryId') ?? '';
    const nextSort = params.get('sort') ?? 'latest';
    setQuery(nextQuery);
    setCategoryId(nextCategory);
    setSort(nextSort);
    const controller = new AbortController();
    if (!apiOrigin) {
      setError('상품 검색 연결을 준비 중입니다');
      setLoading(false);
      return () => controller.abort();
    }
    Promise.all([
      fetch(`${apiOrigin}/catalog/categories`, { signal: controller.signal }),
      fetch(`${apiOrigin}/catalog/products?${params.toString()}`, { signal: controller.signal }),
    ]).then(async ([categoryResponse, productResponse]) => {
      if (!categoryResponse.ok || !productResponse.ok) throw new Error('검색을 불러올 수 없습니다');
      const [nextCategories, nextProducts] = await Promise.all([categoryResponse.json(), productResponse.json()]);
      setCategories(nextCategories);
      setProducts(nextProducts);
      setError(undefined);
    }).catch(() => { if (!controller.signal.aborted) setError('검색을 불러올 수 없습니다'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  return <ProductSearchView query={query} sort={sort} categoryId={categoryId}
    categories={categories} products={products} loading={loading} error={error}
    onQueryChange={setQuery} onCategoryChange={setCategoryId} onSortChange={setSort} />;
}
