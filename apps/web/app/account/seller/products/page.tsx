'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { PrivateImage } from '../../private-image';

type Category = { id: string; parentId: string | null; name: string };
type Product = { productId: string; revisionId: string; title: string; status: string; isPublished?: boolean };
type SaleStopRequest = { id: string; productId: string; status: 'pending' | 'approved' | 'rejected';
  reason: string; requestedAt?: string; decisionReason?: string | null };
type Stock = { optionId: string; productId: string; title: string; optionName: string;
  onHand: number; sellable: number; pendingRequestId: string | null };
type Option = { name: string; priceWon: string };
type DraftImage = { id: string; purpose: 'thumbnail' | 'detail'; displayOrder: number;
  mimeType: string; sizeBytes: number };
type Draft = {
  categoryId: string; title: string; description: string; originLabel: string;
  shippingMode: 'seller_direct' | 'owool_fulfillment';
  options: { name: string; priceWon: number }[];
};
type EditDraft = Omit<Draft, 'options'> & { options: Option[] };
type ViewProps = { categories: Category[]; products: Product[]; stock: Stock[]; busy: boolean;
  saleStopRequests?: SaleStopRequest[]; onRequestSaleStop?: (productId: string, reason: string) => void;
  onCreate: (draft: Draft) => void;
  onCreateRevision: (product: Product) => void;
  onLoadDraft: (product: Product) => Promise<Draft>;
  onUpdate: (product: Product, draft: Draft) => void;
  onDelete: (product: Product) => void;
  onUpload: (product: Product, file: File, purpose: DraftImage['purpose']) => void;
  onLoadImages: (product: Product) => Promise<DraftImage[]>;
  onOrderImages: (product: Product, images: Pick<DraftImage, 'id' | 'purpose'>[]) => Promise<void>;
  onRemoveImage: (product: Product, imageId: string) => Promise<void>;
  onSubmitProposal: (product: Product) => void;
  onSetStock: (optionId: string, quantity: number) => void };
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

function ProductDraftItem({ product, categories, busy, onCreateRevision, onLoadDraft, onUpdate, onDelete, onUpload,
  onLoadImages, onOrderImages, onRemoveImage, onSubmitProposal, saleStopRequest, onRequestSaleStop }: {
  product: Product; categories: Category[]; busy: boolean;
  saleStopRequest?: SaleStopRequest; onRequestSaleStop?: ViewProps['onRequestSaleStop'];
  onCreateRevision: ViewProps['onCreateRevision'];
  onLoadDraft: ViewProps['onLoadDraft']; onUpdate: ViewProps['onUpdate']; onDelete: ViewProps['onDelete'];
  onUpload: ViewProps['onUpload']; onLoadImages: ViewProps['onLoadImages'];
  onOrderImages: ViewProps['onOrderImages']; onRemoveImage: ViewProps['onRemoveImage'];
  onSubmitProposal: ViewProps['onSubmitProposal'];
}) {
  const [file, setFile] = useState<File>();
  const [uploadPurpose, setUploadPurpose] = useState<DraftImage['purpose']>('thumbnail');
  const [preview, setPreview] = useState<string>();
  const [images, setImages] = useState<DraftImage[]>();
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState('');
  const [editing, setEditing] = useState<EditDraft>();
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  async function openEditor() {
    setEditLoading(true);
    setEditError('');
    try {
      const draft = await onLoadDraft(product);
      setEditing({ ...draft, options: draft.options.map((option) => ({ ...option, priceWon: String(option.priceWon) })) });
    } catch { setEditError('초안 수정 정보를 불러오지 못했습니다'); }
    finally { setEditLoading(false); }
  }
  async function loadImages() {
    setImageBusy(true);
    setImageError('');
    try { setImages(await onLoadImages(product)); }
    catch { setImageError('등록 사진 목록을 불러오지 못했습니다'); }
    finally { setImageBusy(false); }
  }
  async function saveImages() {
    if (!images || images.length === 0) return;
    if (images.filter((item) => item.purpose === 'thumbnail').length !== 1) {
      setImageError('대표 사진을 정확히 1장 선택해 주세요'); return;
    }
    setImageBusy(true);
    setImageError('');
    try {
      await onOrderImages(product, images.map(({ id, purpose }) => ({ id, purpose })));
      setImages(await onLoadImages(product));
    } catch { setImageError('사진 순서를 저장하지 못했습니다. 목록을 새로 확인해 주세요'); }
    finally { setImageBusy(false); }
  }
  function moveImage(index: number, distance: number) {
    if (!images || index + distance < 0 || index + distance >= images.length) return;
    const next = [...images];
    [next[index], next[index + distance]] = [next[index + distance], next[index]];
    setImages(next);
  }
  async function removeImage(imageId: string) {
    if (!window.confirm('이 비공개 사진을 영구 제거하시겠습니까?')) return;
    setImageBusy(true);
    setImageError('');
    try {
      await onRemoveImage(product, imageId);
      setImages(await onLoadImages(product));
    } catch { setImageError('사진을 제거하지 못했습니다. 목록을 새로 확인해 주세요'); }
    finally { setImageBusy(false); }
  }
  useEffect(() => {
    if (!file) { setPreview(undefined); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <li className="draft-product-item">
    <strong>{product.title}</strong> · {product.status === 'draft' ? '초안' : product.status === 'pending' ? '승인 대기' :
      product.status === 'approved' ? '판매 중' : product.status}
    {(product.isPublished || product.status === 'approved') && saleStopRequest?.status === 'approved' ?
      <p>판매중지 승인됨 · 신규 구매가 차단되었습니다</p> : null}
    {(product.isPublished || product.status === 'approved') && saleStopRequest?.status === 'pending' ?
      <p>판매중지 승인 대기 · 관리자 승인 전에는 계속 판매됩니다</p> : null}
    {(product.isPublished || product.status === 'approved') && !['pending', 'approved'].includes(saleStopRequest?.status ?? '') ?
      <form className="account-form" onSubmit={(event) => {
        event.preventDefault();
        const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
        if (reason) onRequestSaleStop?.(product.productId, reason);
      }}>
        {saleStopRequest?.status === 'rejected' ? <p>이전 요청 반려: {saleStopRequest.decisionReason}</p> : null}
        <p>관리자 승인 전에는 판매가 유지됩니다</p>
        <label htmlFor={`sale-stop-reason-${product.productId}`}>판매중지 사유</label>
        <textarea id={`sale-stop-reason-${product.productId}`} name="reason" required maxLength={500} rows={2} />
        <button type="submit" className="secondary-button" disabled={busy || !onRequestSaleStop}>판매중지 요청</button>
      </form> : null}
    {product.status === 'approved' ? <div className="draft-image-actions">
      <p>수정안은 관리자 승인 전까지 고객에게 공개되지 않습니다. 현재 판매 중인 상품은 그대로 유지됩니다</p>
      <button type="button" className="secondary-button" disabled={busy}
        onClick={() => onCreateRevision(product)}>상품 수정안 만들기</button>
    </div> : null}
    {product.status === 'draft' ? <div className="draft-image-actions">
      <p>사진·재고·공개 이력이 없는 미제출 초안만 삭제할 수 있습니다</p>
      <button type="button" className="secondary-button" disabled={busy}
        onClick={() => { if (window.confirm('이 상품 초안을 영구 삭제하시겠습니까?')) onDelete(product); }}>
        초안 삭제</button>
      <button type="button" className="secondary-button" disabled={busy || editLoading}
        onClick={() => editing ? setEditing(undefined) : void openEditor()}>
        {editing ? '수정 취소' : '초안 수정'}
      </button>
      {editLoading ? <p role="status">초안 정보를 불러오는 중</p> : null}
      {editError ? <p role="alert">{editError}</p> : null}
      {editing ? <form className="account-form" onSubmit={(event) => {
        event.preventDefault();
        onUpdate(product, { ...editing, options: editing.options.map((option) => ({
          name: option.name, priceWon: Number(option.priceWon),
        })) });
      }}>
        <label htmlFor={`edit-category-${product.revisionId}`}>상품 소분류</label>
        <select id={`edit-category-${product.revisionId}`} value={editing.categoryId} required
          onChange={(event) => setEditing({ ...editing, categoryId: event.target.value })}>
          {categories.filter((category) => category.parentId !== null).map((category) =>
            <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <label htmlFor={`edit-title-${product.revisionId}`}>상품명</label>
        <input id={`edit-title-${product.revisionId}`} value={editing.title} required maxLength={160}
          onChange={(event) => setEditing({ ...editing, title: event.target.value })} />
        <label htmlFor={`edit-description-${product.revisionId}`}>상품 설명</label>
        <textarea id={`edit-description-${product.revisionId}`} value={editing.description} required maxLength={10000}
          onChange={(event) => setEditing({ ...editing, description: event.target.value })} />
        <label htmlFor={`edit-origin-${product.revisionId}`}>산지</label>
        <input id={`edit-origin-${product.revisionId}`} value={editing.originLabel} required maxLength={120}
          onChange={(event) => setEditing({ ...editing, originLabel: event.target.value })} />
        <label htmlFor={`edit-shipping-${product.revisionId}`}>발송 방식</label>
        <select id={`edit-shipping-${product.revisionId}`} value={editing.shippingMode}
          onChange={(event) => setEditing({ ...editing, shippingMode: event.target.value as Draft['shippingMode'] })}>
          <option value="seller_direct">판매자 직접 발송</option>
          <option value="owool_fulfillment">어울몰 모아 발송</option>
        </select>
        <h3>옵션과 가격 수정</h3>
        {editing.options.map((option, index) => <div className="draft-option-row" key={index}>
          <div><label htmlFor={`edit-option-name-${product.revisionId}-${index}`}>옵션 이름 {index + 1}</label>
            <input id={`edit-option-name-${product.revisionId}-${index}`} value={option.name} required maxLength={80}
              onChange={(event) => setEditing({ ...editing, options: editing.options.map((item, position) =>
                position === index ? { ...item, name: event.target.value } : item) })} /></div>
          <div><label htmlFor={`edit-option-price-${product.revisionId}-${index}`}>가격(원) {index + 1}</label>
            <input id={`edit-option-price-${product.revisionId}-${index}`} type="number" min="0" max="1000000000"
              step="1" required value={option.priceWon}
              onChange={(event) => setEditing({ ...editing, options: editing.options.map((item, position) =>
                position === index ? { ...item, priceWon: event.target.value } : item) })} /></div>
          {editing.options.length > 1 ? <button type="button" className="secondary-button" disabled={busy}
            aria-label={`옵션 ${index + 1} 제거`}
            onClick={() => setEditing({ ...editing, options: editing.options.filter((_, position) => position !== index) })}>
            옵션 제거</button> : null}
        </div>)}
        <button type="button" className="secondary-button" disabled={busy || editing.options.length >= 20}
          onClick={() => setEditing({ ...editing, options: [...editing.options, { name: '', priceWon: '' }] })}>
          옵션 추가</button>
        <button type="submit" className="primary-button" disabled={busy}>수정 저장</button>
      </form> : null}
      <label htmlFor={`photo-purpose-${product.revisionId}`}>사진 용도</label>
      <select id={`photo-purpose-${product.revisionId}`} value={uploadPurpose}
        onChange={(event) => setUploadPurpose(event.target.value as DraftImage['purpose'])}>
        <option value="thumbnail">대표 사진</option><option value="detail">상세 사진</option>
      </select>
      <label htmlFor={`photo-${product.revisionId}`}>상품 사진(PNG·JPEG·WebP, 최대 5MB)</label>
      <input id={`photo-${product.revisionId}`} type="file" accept="image/png,image/jpeg,image/webp"
        onChange={(event) => setFile(event.currentTarget.files?.[0])} />
      {preview ? <img src={preview} alt="선택한 사진의 로컬 미리보기" className="draft-image-preview" /> : null}
      <p>미리보기는 선택한 기기에서만 보입니다. 업로드한 사진도 승인 전에는 고객에게 공개되지 않습니다</p>
      <button type="button" className="secondary-button" disabled={busy || !file}
        onClick={() => { if (file) onUpload(product, file, uploadPurpose); }}>사진 업로드</button>
      <p>대표 사진 1장을 지정하고 순서를 저장해 주세요. 등록된 사진은 승인 전 비공개입니다</p>
      <button type="button" className="secondary-button" disabled={busy || imageBusy}
        onClick={() => void loadImages()}>등록 사진 관리</button>
      {imageError ? <p role="alert">{imageError}</p> : null}
      {images ? <div aria-label="등록된 비공개 사진 목록">
        {images.length === 0 ? <p>등록된 사진이 없습니다</p> : <ol className="draft-image-list">
          {images.map((item, index) => <li key={item.id}>
            {apiOrigin ? <PrivateImage className="draft-image-preview"
              src={`${apiOrigin}/catalog/seller/products/${product.productId}/revisions/${product.revisionId}/images/${item.id}/preview`}
              alt={`등록한 비공개 ${item.purpose === 'thumbnail' ? '대표' : '상세'} 사진 ${index + 1}`} /> : null}
            <span>{index + 1}번 · {item.mimeType} · {Math.ceil(item.sizeBytes / 1024)}KB</span>
            <label htmlFor={`image-purpose-${item.id}`}>사진 용도</label>
            <select id={`image-purpose-${item.id}`} value={item.purpose} disabled={busy || imageBusy}
              onChange={(event) => setImages(images.map((image) => image.id === item.id ?
                { ...image, purpose: event.target.value as DraftImage['purpose'] } : image))}>
              <option value="thumbnail">대표 사진</option><option value="detail">상세 사진</option>
            </select>
            <button type="button" className="secondary-button" disabled={busy || imageBusy || index === 0}
              aria-label={`사진 ${index + 1} 위로 이동`}
              onClick={() => moveImage(index, -1)}>위로</button>
            <button type="button" className="secondary-button" disabled={busy || imageBusy || index === images.length - 1}
              aria-label={`사진 ${index + 1} 아래로 이동`}
              onClick={() => moveImage(index, 1)}>아래로</button>
            <button type="button" className="secondary-button" disabled={busy || imageBusy}
              aria-label={`사진 ${index + 1} 제거`}
              onClick={() => void removeImage(item.id)}>사진 제거</button>
          </li>)}
        </ol>}
        <button type="button" className="secondary-button" disabled={busy || imageBusy || images.length === 0}
          onClick={() => void saveImages()}>사진 순서 저장</button>
      </div> : null}
      <button type="button" className="secondary-button" disabled={busy}
        onClick={() => onSubmitProposal(product)}>승인 요청</button>
    </div> : null}
  </li>;
}

export function SellerProductView({ categories, products, stock = [], busy, onCreate, onCreateRevision, onLoadDraft, onUpdate, onDelete,
  onUpload, onLoadImages, onOrderImages, onRemoveImage, onSubmitProposal, onSetStock,
  saleStopRequests = [], onRequestSaleStop }: ViewProps) {
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
            aria-label={`옵션 ${index + 1} 제거`}
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
        {products.map((item) => <ProductDraftItem key={item.revisionId} product={item} categories={categories} busy={busy}
          saleStopRequest={saleStopRequests.find((request) => request.productId === item.productId)}
          onRequestSaleStop={onRequestSaleStop}
          onCreateRevision={onCreateRevision}
          onLoadDraft={onLoadDraft} onUpdate={onUpdate} onDelete={onDelete}
          onUpload={onUpload} onLoadImages={onLoadImages} onOrderImages={onOrderImages}
          onRemoveImage={onRemoveImage}
          onSubmitProposal={onSubmitProposal} />)}
      </ul>}
    </section>
    <section className="account-card profile-card" aria-labelledby="seller-stock-title">
      <h2 id="seller-stock-title">옵션별 재고</h2>
      <p>수량 감소와 0개는 즉시 반영됩니다. 증가·재판매는 관리자 승인 전까지 구매 가능 수량에 반영되지 않습니다</p>
      {stock.length === 0 ? <p>등록된 옵션이 없습니다</p> : <ul className="catalog-list">
        {stock.map((item) => <li key={item.optionId} className="draft-product-item">
          <strong>{item.title} · {item.optionName}</strong>
          <p>입력된 보유 {item.onHand}개 · 판매 가능 {item.sellable}개
            {item.pendingRequestId ? ' · 증가 승인 대기' : ''}</p>
          <form className="account-form" onSubmit={(event) => {
            event.preventDefault();
            const quantity = Number(new FormData(event.currentTarget).get('quantity'));
            onSetStock(item.optionId, quantity);
          }}>
            <label htmlFor={`stock-${item.optionId}`}>직접 입력할 수량</label>
            <input id={`stock-${item.optionId}`} name="quantity" type="number" min="0" max="1000000000"
              step="1" required defaultValue={item.onHand} />
            <button type="submit" className="secondary-button" disabled={busy}>수량 적용</button>
          </form>
        </li>)}
      </ul>}
    </section>
  </div>;
}

export default function SellerProductsPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'unavailable'>('loading');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [saleStopRequests, setSaleStopRequests] = useState<SaleStopRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function reload(signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API origin unavailable');
    const options = { credentials: 'include' as const, signal };
    const [categoryResponse, productResponse, stockResponse, stopResponse] = await Promise.all([
      fetch(`${apiOrigin}/catalog/categories`, options),
      fetch(`${apiOrigin}/catalog/seller/products`, options),
      fetch(`${apiOrigin}/catalog/seller/stock`, options),
      fetch(`${apiOrigin}/catalog/seller/sale-stop-requests`, options),
    ]);
    if (!categoryResponse.ok || !productResponse.ok || !stockResponse.ok || !stopResponse.ok) throw new Error('Catalog unavailable');
    setCategories(await categoryResponse.json() as Category[]);
    setProducts(await productResponse.json() as Product[]);
    setStock(await stockResponse.json() as Stock[]);
    setSaleStopRequests(await stopResponse.json() as SaleStopRequest[]);
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

  async function createRevision(product: Product) {
    if (!apiOrigin || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/catalog/seller/products/${product.productId}/revisions`, {
        method: 'POST', credentials: 'include',
      });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (!response.ok) { setMessage('수정안을 만들지 못했습니다. 기존 수정안이 있는지 확인해 주세요'); return; }
      await reload();
      setMessage('비공개 수정안을 만들었습니다. 관리자 승인 전에는 기존 상품이 계속 판매됩니다');
    } catch { setMessage('수정안 생성 서버에 연결할 수 없습니다'); }
    finally { setBusy(false); }
  }

  async function loadDraft(product: Product): Promise<Draft> {
    if (!apiOrigin) throw new Error('API origin unavailable');
    const response = await fetch(`${apiOrigin}/catalog/seller/products/${product.productId}/revisions/${product.revisionId}`,
      { credentials: 'include' });
    if (response.status === 401 || response.status === 403) { setState('unauthorized'); throw new Error('Unauthorized'); }
    if (!response.ok) throw new Error('Draft unavailable');
    return response.json() as Promise<Draft>;
  }

  async function updateDraft(product: Product, draft: Draft) {
    if (!apiOrigin || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/catalog/seller/products/${product.productId}/revisions/${product.revisionId}`,
        { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(draft) });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (!response.ok) { setMessage('초안을 수정하지 못했습니다. 입력값 또는 옵션의 재고 이력을 확인해 주세요'); return; }
      await reload();
      setMessage('상품 초안을 수정했습니다. 관리자 승인 전에는 고객에게 공개되지 않습니다');
    } catch { setMessage('초안 수정 서버에 연결할 수 없습니다'); }
    finally { setBusy(false); }
  }

  async function removeDraft(product: Product) {
    if (!apiOrigin || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/catalog/seller/products/${product.productId}/revisions/${product.revisionId}`,
        { method: 'DELETE', credentials: 'include' });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (!response.ok) { setMessage('초안을 삭제하지 못했습니다. 사진·재고·제출 또는 공개 이력을 확인해 주세요'); return; }
      await reload();
      setMessage('미제출 상품 초안을 삭제했습니다');
    } catch { setMessage('초안 삭제 서버에 연결할 수 없습니다'); }
    finally { setBusy(false); }
  }

  async function upload(product: Product, file: File, purpose: DraftImage['purpose']) {
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
        headers: { 'content-type': file.type, 'x-image-purpose': purpose }, body: file,
      });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (!response.ok) { setMessage('사진을 저장하지 못했습니다. 개발용 업로드 환경과 파일 형식을 확인해 주세요'); return; }
      setMessage('사진을 비공개로 저장했습니다. 등록 사진 관리를 다시 열어 순서와 용도를 확인해 주세요');
    } catch { setMessage('사진 저장 서버에 연결할 수 없습니다'); }
    finally { setBusy(false); }
  }

  async function loadImages(product: Product): Promise<DraftImage[]> {
    if (!apiOrigin) throw new Error('API origin unavailable');
    const response = await fetch(`${apiOrigin}/catalog/seller/products/${product.productId}/revisions/${product.revisionId}/images`,
      { credentials: 'include' });
    if (response.status === 401 || response.status === 403) { setState('unauthorized'); throw new Error('Unauthorized'); }
    if (!response.ok) throw new Error('Images unavailable');
    return response.json() as Promise<DraftImage[]>;
  }

  async function orderImages(product: Product, images: Pick<DraftImage, 'id' | 'purpose'>[]) {
    if (!apiOrigin || busy) throw new Error('API unavailable');
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/catalog/seller/products/${product.productId}/revisions/${product.revisionId}/images/order`, {
        method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ images }),
      });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); throw new Error('Unauthorized'); }
      if (!response.ok) throw new Error('Image order unavailable');
      setMessage('사진의 용도와 순서를 저장했습니다. 승인 전에는 고객에게 공개되지 않습니다');
    } finally { setBusy(false); }
  }

  async function removeImage(product: Product, imageId: string) {
    if (!apiOrigin || busy) throw new Error('API unavailable');
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/catalog/seller/products/${product.productId}/revisions/${product.revisionId}/images/${imageId}`,
        { method: 'DELETE', credentials: 'include' });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); throw new Error('Unauthorized'); }
      if (!response.ok) throw new Error('Image removal unavailable');
      const result = await response.json() as { status: 'deleted' | 'cleanup_pending' };
      setMessage(result.status === 'cleanup_pending' ?
        '사진은 목록에서 제거됐지만 파일 정리가 보류됐습니다. 운영자 확인이 필요합니다' :
        '비공개 사진을 제거했습니다');
    } finally { setBusy(false); }
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

  async function updateStock(optionId: string, quantity: number) {
    if (!apiOrigin || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/catalog/seller/options/${optionId}/stock`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quantity }),
      });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (!response.ok) { setMessage('재고 수량을 반영하지 못했습니다. 0 이상의 정수를 확인해 주세요'); return; }
      const result = await response.json() as { requestId: string | null };
      await reload();
      setMessage(result.requestId ? '재고 증가를 관리자에게 요청했습니다. 구매 가능 수량은 승인 전 그대로입니다' :
        '입력한 수량을 반영했습니다. 품절·감소는 즉시 적용됩니다');
    } catch { setMessage('재고 서버에 연결할 수 없습니다'); }
    finally { setBusy(false); }
  }

  async function requestSaleStop(productId: string, reason: string) {
    if (!apiOrigin || busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/catalog/seller/products/${productId}/sale-stop-requests`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (!response.ok) { setMessage('판매중지를 요청하지 못했습니다. 사유와 기존 요청 상태를 확인해 주세요'); return; }
      await reload();
      setMessage('판매중지를 요청했습니다. 관리자 승인 전에는 판매가 유지됩니다');
    } catch { setMessage('판매중지 요청 서버에 연결할 수 없습니다'); }
    finally { setBusy(false); }
  }

  return <main id="main-content" tabIndex={-1} className="shell account-shell">
    <a className="text-link" href="/account">내 계정으로</a>
    <h1>상품 등록</h1>
    {state === 'loading' ? <p role="status">판매자 권한 확인 중</p> : null}
    {state === 'unauthorized' ? <p role="alert">판매자 로그인 후 이용할 수 있습니다</p> : null}
    {state === 'unavailable' ? <p role="alert">상품 정보를 불러올 수 없습니다</p> : null}
    {state === 'ready' ? <><SellerProductView categories={categories} products={products} stock={stock} busy={busy}
      saleStopRequests={saleStopRequests} onRequestSaleStop={requestSaleStop}
      onCreate={create} onCreateRevision={createRevision} onLoadDraft={loadDraft} onUpdate={updateDraft} onDelete={removeDraft}
      onUpload={upload} onLoadImages={loadImages} onOrderImages={orderImages}
      onRemoveImage={removeImage}
      onSubmitProposal={submitProposal} onSetStock={updateStock} />
      {message ? <p role="status">{message}</p> : null}</> : null}
  </main>;
}
