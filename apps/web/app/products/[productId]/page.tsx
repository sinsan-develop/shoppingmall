'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PublicImage } from '../../account/private-image';

type Option = { id: string; name: string; priceWon: number; sellableQuantity: number };
type ProductImage = { id: string; purpose: 'thumbnail' | 'detail'; displayOrder: number };
type Product = { productId: string; title: string; description: string; originLabel: string;
  sellerName: string; shippingMode: string; options: Option[]; images?: ProductImage[] };
type ViewProps = { product?: Product; loading?: boolean; error?: string };

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export function ProductDetailView({ product, loading = false, error }: ViewProps) {
  return <main id="main-content" tabIndex={-1} className="shell detail-main">
    <a className="text-link" href="/products">상품 검색으로</a>
    {loading ? <p role="status">상품을 불러오고 있습니다</p> : !product ?
      <p role="alert">{error ?? '상품을 찾을 수 없습니다'}</p> : <>
        <div className="detail-layout">
          {apiOrigin && product.images?.length ? <div className="detail-gallery" aria-label="상품 사진">
            <PublicImage className="detail-main-photo"
              src={`${apiOrigin}/catalog/products/${encodeURIComponent(product.productId)}/images/${encodeURIComponent(product.images[0].id)}`}
              alt={`${product.title} 대표 사진`} />
            {product.images.length > 1 ? <div className="detail-thumb-list">
              {product.images.slice(1).map((image, index) => <PublicImage key={image.id}
                src={`${apiOrigin}/catalog/products/${encodeURIComponent(product.productId)}/images/${encodeURIComponent(image.id)}`}
                alt={`${product.title} 상세 사진 ${index + 1}`} />)}
            </div> : null}
          </div> : <div className="detail-photo-placeholder" aria-label="상품 사진 준비 중">상품 사진 준비 중</div>}
          <div className="detail-content">
            <p className="eyebrow">{product.originLabel}</p>
            <h1>{product.title}</h1>
            <p>판매자 {product.sellerName}</p>
            <p>발송 방식 {product.shippingMode === 'owool_fulfillment' ? '어울몰 모아 발송' : '판매자 직접 발송'}</p>
            <h2>옵션과 가격</h2>
            <ul className="detail-options">
              {product.options.map((option) => <li key={option.id}>
                <span>{option.name}</span><strong>{option.priceWon.toLocaleString('ko-KR')}원</strong>
                <span>{option.sellableQuantity > 0 ? `판매 가능 ${option.sellableQuantity}개` : '품절'}</span>
              </li>)}
            </ul>
            <p className="section-note">장바구니와 주문 기능은 구축 중입니다</p>
          </div>
        </div>
        <section className="detail-description" aria-label="상품 설명"><h2>상품 설명</h2><p>{product.description}</p></section>
      </>}
  </main>;
}

export default function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const [product, setProduct] = useState<Product>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    if (!apiOrigin || !productId) {
      setError('상품 연결을 준비 중입니다');
      setLoading(false);
      return () => controller.abort();
    }
    fetch(`${apiOrigin}/catalog/products/${encodeURIComponent(productId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) throw new Error('상품을 찾을 수 없습니다');
        if (!response.ok) throw new Error('상품을 불러올 수 없습니다');
        return response.json();
      }).then((value: Product) => { setProduct(value); setError(undefined); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : '상품을 불러올 수 없습니다');
      } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [productId]);
  return <ProductDetailView product={product} loading={loading} error={error} />;
}
