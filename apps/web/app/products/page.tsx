'use client';

import { useEffect, useRef, useState } from 'react';
import { mergeProductPage } from './search-pagination';

type Category = { id: string; parentId: string | null; name: string };
type Seller = { id: string; displayName: string };
type Product = { productId: string; title: string; sellerName: string; originLabel: string; minPriceWon: number };
type ViewProps = { query: string; sort: string; categoryId: string; sellerId?: string;
  categories: Category[]; sellers?: Seller[];
  products: Product[]; loading: boolean; error?: string;
  hasMore?: boolean; loadingMore?: boolean; loadMoreError?: string; endOfResults?: boolean;
  onLoadMore?: () => void;
  onQueryChange?: (value: string) => void; onCategoryChange?: (value: string) => void;
  onSellerChange?: (value: string) => void; onSortChange?: (value: string) => void };

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');
const categoryOrder = new Intl.Collator('ko');

export function ProductSearchView({ query, sort, categoryId, sellerId = '', categories, sellers = [], products,
  loading, error, hasMore = false, loadingMore = false, loadMoreError, endOfResults = false,
  onLoadMore = () => {},
  onQueryChange = () => {}, onCategoryChange = () => {},
  onSellerChange = () => {}, onSortChange = () => {} }: ViewProps) {
  return (
    <main id="main-content" tabIndex={-1} className="shell search-main">
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
          {categories.filter((category) => category.parentId === null)
            .sort((left, right) => categoryOrder.compare(left.name, right.name))
            .map((major) => <optgroup key={major.id} label={major.name}>
              <option value={major.id}>{major.name} 전체</option>
              {categories.filter((category) => category.parentId === major.id)
                .sort((left, right) => categoryOrder.compare(left.name, right.name))
                .map((minor) => <option key={minor.id} value={minor.id}>{minor.name}</option>)}
            </optgroup>)}
        </select>
        <label htmlFor="product-seller">판매자</label>
        <select id="product-seller" name="sellerId" value={sellerId}
          onChange={(event) => onSellerChange(event.currentTarget.value)}>
          <option value="">전체 판매자</option>
          {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.displayName}</option>)}
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
          <>
            <section className="search-results" aria-label="상품 검색 결과">
              {products.map((product) => <article className="search-product" key={product.productId}>
                <p className="eyebrow">{product.originLabel}</p>
                <h2><a className="product-link" id={`product-link-${product.productId}`}
                  href={`/products/${encodeURIComponent(product.productId)}`}>{product.title}</a></h2>
                <p>{product.sellerName}</p>
                <p className="product-price">{product.minPriceWon.toLocaleString('ko-KR')}원부터</p>
              </article>)}
            </section>
            {hasMore ? <button className="secondary-button search-more" id="search-more" type="button" disabled={loadingMore}
              onClick={onLoadMore}>{loadingMore ? '상품을 더 불러오는 중' : '상품 더 보기'}</button> : null}
            {endOfResults ? <p id="search-end" tabIndex={-1} role="status" className="section-note">
              모든 상품을 확인했습니다</p> : null}
            {loadMoreError ? <p role="alert">{loadMoreError}</p> : null}
          </>}
    </main>
  );
}

export default function ProductsPage() {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [sort, setSort] = useState('latest');
  const [categories, setCategories] = useState<Category[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string>();
  const [endOfResults, setEndOfResults] = useState(false);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const pageRef = useRef(1);
  const moreControllerRef = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    if (!focusTarget) return;
    const target = document.getElementById(focusTarget);
    if (target instanceof HTMLElement) {
      target.focus();
      setFocusTarget(null);
    }
  }, [products, loadingMore, endOfResults, focusTarget]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextQuery = params.get('q') ?? '';
    const nextCategory = params.get('categoryId') ?? '';
    const nextSeller = params.get('sellerId') ?? '';
    const nextSort = params.get('sort') ?? 'latest';
    const initialPage = Number(params.get('page') ?? '1');
    setQuery(nextQuery);
    setCategoryId(nextCategory);
    setSellerId(nextSeller);
    setSort(nextSort);
    pageRef.current = initialPage;
    const controller = new AbortController();
    if (!apiOrigin) {
      setError('상품 검색 연결을 준비 중입니다');
      setLoading(false);
      return () => controller.abort();
    }
    Promise.all([
      fetch(`${apiOrigin}/catalog/categories`, { signal: controller.signal }),
      fetch(`${apiOrigin}/catalog/sellers`, { signal: controller.signal }),
      fetch(`${apiOrigin}/catalog/products?${params.toString()}`, { signal: controller.signal }),
    ]).then(async ([categoryResponse, sellerResponse, productResponse]) => {
      if (!categoryResponse.ok || !sellerResponse.ok || !productResponse.ok) throw new Error('검색을 불러올 수 없습니다');
      const [nextCategories, nextSellers, nextProducts] = await Promise.all([
        categoryResponse.json(), sellerResponse.json(), productResponse.json(),
      ]);
      if (!Array.isArray(nextCategories) || !Array.isArray(nextSellers) || !Array.isArray(nextProducts)) {
        throw new Error('검색을 불러올 수 없습니다');
      }
      setCategories(nextCategories);
      setSellers(nextSellers);
      setProducts(nextProducts);
      setHasMore(nextProducts.length === 24 && initialPage < 1000);
      setEndOfResults(false);
      setError(undefined);
    }).catch(() => { if (!controller.signal.aborted) setError('검색을 불러올 수 없습니다'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); moreControllerRef.current?.abort(); };
  }, []);

  async function loadMore() {
    if (!apiOrigin || !hasMore || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(undefined);
    const controller = new AbortController();
    moreControllerRef.current = controller;
    const nextPage = pageRef.current + 1;
    const params = new URLSearchParams(window.location.search);
    params.set('page', String(nextPage));
    try {
      const response = await fetch(`${apiOrigin}/catalog/products?${params.toString()}`, { signal: controller.signal });
      if (!response.ok) throw new Error('상품을 더 불러올 수 없습니다');
      const nextProducts: unknown = await response.json();
      if (!Array.isArray(nextProducts)) throw new Error('상품을 더 불러올 수 없습니다');
      const merged = mergeProductPage(products, nextProducts as Product[], nextPage);
      setProducts(merged.products);
      pageRef.current = nextPage;
      setHasMore(merged.hasMore);
      setEndOfResults(merged.ended);
      setFocusTarget(merged.firstNewId ? `product-link-${merged.firstNewId}` : 'search-end');
    } catch {
      if (!controller.signal.aborted) {
        setLoadMoreError('상품을 더 불러올 수 없습니다. 다시 시도해 주세요');
        setFocusTarget('search-more');
      }
    } finally {
      if (moreControllerRef.current === controller) moreControllerRef.current = null;
      loadingMoreRef.current = false;
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }

  return <ProductSearchView query={query} sort={sort} categoryId={categoryId} sellerId={sellerId}
    categories={categories} sellers={sellers} products={products} loading={loading} error={error}
    hasMore={hasMore} loadingMore={loadingMore} loadMoreError={loadMoreError}
    endOfResults={endOfResults} onLoadMore={loadMore}
    onQueryChange={setQuery} onCategoryChange={setCategoryId} onSellerChange={setSellerId}
    onSortChange={setSort} />;
}
