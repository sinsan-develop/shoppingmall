'use client';

import { useEffect, useState, type FormEvent } from 'react';

type Category = { id: string; parentId: string | null; name: string };
type Product = { productId: string; revisionId: string; title: string; status: string };
type Option = { name: string; priceWon: string };
type Draft = {
  categoryId: string; title: string; description: string; originLabel: string;
  shippingMode: 'seller_direct' | 'owool_fulfillment';
  options: { name: string; priceWon: number }[];
};
type ViewProps = { categories: Category[]; products: Product[]; busy: boolean;
  onCreate: (draft: Draft) => void;
  onUpload: (product: Product, file: File) => void;
  onSubmitProposal: (product: Product) => void };
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

function ProductDraftItem({ product, busy, onUpload, onSubmitProposal }: {
  product: Product; busy: boolean; onUpload: ViewProps['onUpload']; onSubmitProposal: ViewProps['onSubmitProposal'];
}) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    if (!file) { setPreview(undefined); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <li className="draft-product-item">
    <strong>{product.title}</strong> · {product.status === 'draft' ? '초안' : product.status === 'pending' ? '승인 대기' : product.status}
    {product.status === 'draft' ? <div className="draft-image-actions">
      <label htmlFor={`photo-${product.revisionId}`}>대표 사진(PNG·JPEG·WebP, 최대 5MB)</label>
      <input id={`photo-${product.revisionId}`} type="file" accept="image/png,image/jpeg,image/webp"
        onChange={(event) => setFile(event.currentTarget.files?.[0])} />
      {preview ? <img src={preview} alt="선택한 사진의 로컬 미리보기" className="draft-image-preview" /> : null}
      <p>미리보기는 선택한 기기에서만 보입니다. 업로드한 사진도 승인 전에는 고객에게 공개되지 않습니다</p>
      <button type="button" className="secondary-button" disabled={busy || !file}
        onClick={() => { if (file) onUpload(product, file); }}>사진 업로드</button>
      <button type="button" className="secondary-button" disabled={busy}
        onClick={() => onSubmitProposal(product)}>승인 요청</button>
    </div> : null}
  </li>;
}

export function SellerProductView({ categories, products, busy, onCreate, onUpload, onSubmitProposal }: ViewProps) {
  const [options, setOptions] = useState<Option[]>([{ name: '', priceWon: '' }]);
  const majors = categories.filter((item) => item.parentId === null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    onCreate({
      categoryId: String(fields.get('categoryId') ?? ''), title: String(fields.get('title') ?? ''),
      description: String(fields.get('description') ?? ''), originLabel: String(fields.get('originLabel') ?? ''),
      shippingMode: String(fields.get('shippingMode')) as Draft['shippingMode'],
      options: options.map((option) => ({ name: option.name, priceWon: Number(option.priceWon) })),
    });
  }
  return <div className="catalog-admin-grid">
    <section className="account-card profile-card" aria-labelledby="new-product-title">
      <h2 id="new-product-title">상품 초안</h2>
      <p>초안은 고객에게 공개되지 않습니다. 저장 뒤 대표 사진을 등록하고 관리자 승인을 요청할 수 있습니다</p>
      <form className="account-form" onSubmit={submit}>
        <label htmlFor="product-category">상품 소분류</label>
        <select id="product-category" name="categoryId" required defaultValue="">
          <option value="" disabled>소분류 선택</option>
          {majors.map((major) => <optgroup key={major.id} label={major.name}>
            {categories.filter((item) => item.parentId === major.id).map((minor) =>
              <option key={minor.id} value={minor.id}>{minor.name}</option>)}
          </optgroup>)}
        </select>
        <label htmlFor="product-title">상품명</label>
        <input id="product-title" name="title" required maxLength={160} />
        <label htmlFor="product-description">상품 설명</label>
        <textarea id="product-description" name="description" required maxLength={10000} rows={5} />
        <label htmlFor="product-origin">산지</label>
        <input id="product-origin" name="originLabel" required maxLength={120} />
        <label htmlFor="product-shipping">발송 방식</label>
        <select id="product-shipping" name="shippingMode" defaultValue="seller_direct">
          <option value="seller_direct">판매자 직접 발송</option>
          <option value="owool_fulfillment">어울몰 모아 발송</option>
        </select>
        <h3>옵션과 가격</h3>
        {options.map((option, index) => <div className="draft-option-row" key={index}>
          <div><label htmlFor={`option-name-${index}`}>옵션 이름 {index + 1}</label>
            <input id={`option-name-${index}`} required maxLength={80} value={option.name}
              onChange={(event) => setOptions(options.map((item, position) =>
                position === index ? { ...item, name: event.target.value } : item))} /></div>
          <div><label htmlFor={`option-price-${index}`}>가격(원) {index + 1}</label>
            <input id={`option-price-${index}`} type="number" min="0" max="1000000000" step="1" required
              value={option.priceWon} onChange={(event) => setOptions(options.map((item, position) =>
                position === index ? { ...item, priceWon: event.target.value } : item))} /></div>
          {options.length > 1 ? <button type="button" className="secondary-button" disabled={busy}
            onClick={() => setOptions(options.filter((_, position) => position !== index))}>옵션 제거</button> : null}
        </div>)}
        <button type="button" className="secondary-button" disabled={busy || options.length >= 20}
          onClick={() => setOptions([...options, { name: '', priceWon: '' }])}>옵션 추가</button>
        <button className="primary-button" type="submit" disabled={busy || !categories.some((item) => item.parentId)}>초안 저장</button>
      </form>
    </section>
    <section className="account-card profile-card" aria-labelledby="product-list-title">
      <h2 id="product-list-title">내 상품 초안</h2>
      {products.length === 0 ? <p>아직 등록한 초안이 없습니다</p> : <ul className="catalog-list">
        {products.map((item) => <ProductDraftItem key={item.revisionId} product={item} busy={busy}
          onUpload={onUpload} onSubmitProposal={onSubmitProposal} />)}
      </ul>}
    </section>
  </div>;
}

export default function SellerProductsPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'unavailable'>('loading');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function reload(signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API origin unavailable');
    const options = { credentials: 'include' as const, signal };
    const [categoryResponse, productResponse] = await Promise.all([
      fetch(`${apiOrigin}/catalog/categories`, options),
      fetch(`${apiOrigin}/catalog/seller/products`, options),
    ]);
    if (!categoryResponse.ok || !productResponse.ok) throw new Error('Catalog unavailable');
    setCategories(await categoryResponse.json() as Category[]);
    setProducts(await productResponse.json() as Product[]);
  }

  useEffect(() => {
    if (!apiOrigin) { setState('unavailable'); return; }
    const controller = new AbortController();
    async function load() {
      const response = await fetch(`${apiOrigin}/auth/me`, { credentials: 'include', signal: controller.signal });
      if (!response.ok) { setState(response.status === 401 ? 'unauthorized' : 'unavailable'); return; }
      const actor = await response.json() as { role: string };
      if (actor.role !== 'seller') { setState('unauthorized'); return; }
      await reload(controller.signal);
      setState('ready');
    }
    load().catch((error: unknown) => {
      if (error instanceof Error && error.name !== 'AbortError') setState('unavailable');
    });
    return () => controller.abort();
  }, []);

  async function create(draft: Draft) {
    if (!apiOrigin || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/catalog/seller/products`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (!response.ok) { setMessage('초안을 저장하지 못했습니다. 입력값을 확인해 주세요'); return; }
      await reload();
      setMessage('초안을 저장했습니다. 아직 고객에게 공개되지 않습니다');
    } catch {
      setMessage('서버에 연결할 수 없습니다');
    } finally {
      setBusy(false);
    }
  }

  async function upload(product: Product, file: File) {
    if (!apiOrigin || busy) return;
    if (file.size > 5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setMessage('PNG·JPEG·WebP 사진을 5MB 이하로 선택해 주세요');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/catalog/seller/products/${product.productId}/revisions/${product.revisionId}/images`, {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': file.type, 'x-image-purpose': 'thumbnail' }, body: file,
      });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (!response.ok) { setMessage('사진을 저장하지 못했습니다. 개발용 업로드 환경과 파일 형식을 확인해 주세요'); return; }
      setMessage('대표 사진을 비공개로 저장했습니다. 관리자 검토 전에는 고객에게 공개되지 않습니다');
    } catch { setMessage('사진 저장 서버에 연결할 수 없습니다'); }
    finally { setBusy(false); }
  }

  async function submitProposal(product: Product) {
    if (!apiOrigin || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/catalog/seller/products/${product.productId}/revisions/${product.revisionId}/submit`, {
        method: 'POST', credentials: 'include',
      });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (!response.ok) { setMessage('승인을 요청하지 못했습니다. 대표 사진과 옵션 등록 여부를 확인해 주세요'); return; }
      await reload();
      setMessage('관리자 승인을 요청했습니다. 아직 고객에게 공개되지 않습니다');
    } catch { setMessage('승인 요청 서버에 연결할 수 없습니다'); }
    finally { setBusy(false); }
  }

  return <main className="shell account-shell">
    <a className="text-link" href="/account">내 계정으로</a>
    <h1>상품 등록</h1>
    {state === 'loading' ? <p role="status">판매자 권한 확인 중</p> : null}
    {state === 'unauthorized' ? <p role="alert">판매자 로그인 후 이용할 수 있습니다</p> : null}
    {state === 'unavailable' ? <p role="alert">상품 정보를 불러올 수 없습니다</p> : null}
    {state === 'ready' ? <><SellerProductView categories={categories} products={products} busy={busy}
      onCreate={create} onUpload={upload} onSubmitProposal={submitProposal} />
      {message ? <p role="status">{message}</p> : null}</> : null}
  </main>;
}
