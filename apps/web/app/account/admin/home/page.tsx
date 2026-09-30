'use client';

import { useEffect, useState } from 'react';
import { newHomeId } from './ids';
import { confirmSavedDraft } from './save-response';

type Product = { productId: string; title: string; sellerName: string };
type Category = { id: string; name: string; parentId: string | null };
type Seller = { id: string; displayName: string };
type Target = { type: 'home' | 'catalog' | 'category' | 'seller' | 'event' | 'product'; id?: string };
type Menu = { id: string; label: string; displayOrder: number; visible: boolean; target: Target };
type Event = { id: string; title: string; description: string; displayOrder: number;
  startAt: string; endAt: string; productIds: string[]; heroProductId: string; heroImageId: string | null };
type Payload = { menu: Menu[]; events: Event[]; recommendations: string[] };
type Draft = { version: number; payload: Payload };
type Preview = { payload: Payload; excluded: { kind: string; id: string; reason: string }[] };
type History = { id: string; publishedByAccountId: string; publishedAt: string };
type Props = { draft: Draft; categories: Category[]; sellers: Seller[]; products: Product[];
  history: History[]; preview: Preview | null; busy: boolean; dirty?: boolean;
  heroImages?: Record<string, { id: string; purpose: string }[]>;
  onChange: (payload: Payload) => void; onSave: () => void; onPreview: () => void;
  onPublish: () => void; onRestore: (id: string) => void;
  onSearch?: (query: string) => void; onReload?: () => void };
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');
const empty: Payload = { menu: [], events: [], recommendations: [] };

function kstInput(iso: string) {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? new Date(value + 9 * 3600000).toISOString().slice(0, 16) : '';
}
function fromKstInput(value: string) { return new Date(`${value}:00+09:00`).toISOString(); }
function targetValue(target: Target) { return `${target.type}|${target.id ?? ''}`; }
function targetFromValue(value: string): Target {
  const [type, id] = value.split('|');
  return type === 'home' || type === 'catalog' ? { type } :
    { type: type as Target['type'], id };
}
function move<T>(items: T[], index: number, direction: number) {
  const next = [...items];
  const target = index + direction;
  if (target < 0 || target >= items.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function AdminHomeView({ draft, categories, sellers, products, history, preview, busy,
  dirty = false, heroImages = {}, onChange, onSave, onPreview, onPublish, onRestore, onSearch, onReload }: Props) {
  const { menu, events, recommendations } = draft.payload;
  const productName = (id: string) => products.find((item) => item.productId === id)?.title ?? id;
  const isExcluded = (kind: string, id: string) =>
    preview?.excluded.some((entry) => entry.kind === kind && entry.id === id) ?? false;
  const changeMenu = (index: number, patch: Partial<Menu>) =>
    onChange({ ...draft.payload, menu: menu.map((item, position) => position === index ? { ...item, ...patch } : item) });
  const changeEvent = (index: number, patch: Partial<Event>) =>
    onChange({ ...draft.payload, events: events.map((item, position) => position === index ? { ...item, ...patch } : item) });
  const addMenu = () => onChange({ ...draft.payload, menu: [...menu,
    { id: newHomeId(), label: '', displayOrder: menu.length, visible: true, target: { type: 'catalog' } }] });
  const addEvent = () => {
    const start = new Date();
    const end = new Date(start.getTime() + 86400000);
    onChange({ ...draft.payload, events: [...events, { id: newHomeId(), title: '', description: '',
      displayOrder: events.length, startAt: start.toISOString(), endAt: end.toISOString(),
      productIds: [], heroProductId: '', heroImageId: null }] });
  };
  const targetOptions = [
    { value: 'home|', label: '홈' }, { value: 'catalog|', label: '전체 상품' },
    ...categories.map((item) => ({ value: `category|${item.id}`, label: `상품 분류 · ${item.name}` })),
    ...sellers.map((item) => ({ value: `seller|${item.id}`, label: `판매자 · ${item.displayName}` })),
    ...events.map((item) => ({ value: `event|${item.id}`, label: `기획전 · ${item.title || item.id}` })),
    ...products.map((item) => ({ value: `product|${item.productId}`, label: `상품 · ${item.title}` })),
  ];
  return <div className="home-admin-layout">
    <p className="section-note">편집본 버전 {draft.version} · 저장은 현재 공개본을 바꾸지 않습니다</p>
    <section className="account-card profile-card" aria-labelledby="home-menu-heading">
      <h2 id="home-menu-heading">추가 메뉴</h2><p>홈과 제철 농산물은 항상 표시됩니다. 여기서는 추가 메뉴만 관리합니다.</p>
      {menu.map((item, index) => <fieldset className="home-admin-item" key={item.id} disabled={busy}>
        <legend>메뉴 {index + 1}</legend>
        <label htmlFor={`menu-label-${item.id}`}>이름</label>
        <input id={`menu-label-${item.id}`} value={item.label} maxLength={30}
          onChange={(e) => changeMenu(index, { label: e.currentTarget.value })} />
        <label htmlFor={`menu-target-${item.id}`}>연결 대상</label>
        <select id={`menu-target-${item.id}`} value={targetValue(item.target)}
          onChange={(e) => changeMenu(index, { target: targetFromValue(e.currentTarget.value) })}>
          {!targetOptions.some((option) => option.value === targetValue(item.target)) ?
            <option value={targetValue(item.target)}>기존 연결 대상 {item.target.id}</option> : null}
          {targetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <label className="check-row"><input type="checkbox" checked={item.visible}
          onChange={(e) => changeMenu(index, { visible: e.currentTarget.checked })} />고객 화면에 표시</label>
        <div className="home-admin-actions"><button type="button" className="secondary-button" disabled={busy || index === 0}
          onClick={() => onChange({ ...draft.payload, menu: move(menu, index, -1).map((entry, order) =>
            ({ ...entry, displayOrder: order })) })}>위로</button>
        <button type="button" className="secondary-button" disabled={busy || index === menu.length - 1}
          onClick={() => onChange({ ...draft.payload, menu: move(menu, index, 1).map((entry, order) =>
            ({ ...entry, displayOrder: order })) })}>아래로</button>
        <button type="button" className="secondary-button" disabled={busy}
          onClick={() => onChange({ ...draft.payload, menu: menu.filter((_, position) => position !== index) })}>제거</button></div>
      </fieldset>)}
      <button type="button" className="secondary-button" disabled={busy || menu.length >= 12} onClick={addMenu}>메뉴 추가</button>
    </section>
    <section className="account-card profile-card" aria-labelledby="home-events-heading">
      <h2 id="home-events-heading">기획전</h2><p>기간은 한국시간으로 입력합니다. 제목은 할인·배송 보장이 아닙니다.</p>
      <label htmlFor="home-product-search">상품 찾기</label>
      <input id="home-product-search" type="search" maxLength={80} placeholder="상품명 또는 판매자"
        onChange={(e) => onSearch?.(e.currentTarget.value)} />
      {events.map((event, index) => <fieldset className="home-admin-item" key={event.id} disabled={busy}>
        <legend>기획전 {index + 1}</legend>
        <label htmlFor={`event-title-${event.id}`}>제목</label>
        <input id={`event-title-${event.id}`} value={event.title} maxLength={80}
          onChange={(e) => changeEvent(index, { title: e.currentTarget.value })} />
        <label htmlFor={`event-description-${event.id}`}>설명</label>
        <textarea id={`event-description-${event.id}`} value={event.description} maxLength={240}
          onChange={(e) => changeEvent(index, { description: e.currentTarget.value })} />
        <div className="home-admin-dates"><div><label htmlFor={`event-start-${event.id}`}>시작 · 한국시간</label>
          <input id={`event-start-${event.id}`} type="datetime-local" value={kstInput(event.startAt)}
            onChange={(e) => { if (e.currentTarget.value) changeEvent(index,
              { startAt: fromKstInput(e.currentTarget.value) }); }} /></div>
          <div><label htmlFor={`event-end-${event.id}`}>종료 · 한국시간</label>
          <input id={`event-end-${event.id}`} type="datetime-local" value={kstInput(event.endAt)}
            onChange={(e) => { if (e.currentTarget.value) changeEvent(index,
              { endAt: fromKstInput(e.currentTarget.value) }); }} /></div></div>
        <label htmlFor={`event-product-${event.id}`}>상품 추가</label>
        <select id={`event-product-${event.id}`} defaultValue="" disabled={busy || event.productIds.length >= 50}
          onChange={(e) => { const id = e.currentTarget.value;
            if (id && event.productIds.length < 50 && !event.productIds.includes(id)) changeEvent(index,
              { productIds: [...event.productIds, id], heroProductId: event.heroProductId || id });
            e.currentTarget.value = ''; }}>
          <option value="">검색 결과에서 선택</option>
          {products.filter((item) => !event.productIds.includes(item.productId)).map((item) =>
            <option key={item.productId} value={item.productId}>{item.title} · {item.sellerName}</option>)}
        </select>
        <ol className="home-admin-products">{event.productIds.map((id, position) => <li key={id}>
          {productName(id)} <button type="button" className="secondary-button" disabled={busy || position === 0}
            onClick={() => changeEvent(index, { productIds: move(event.productIds, position, -1) })}>위로</button>
          <button type="button" className="secondary-button" disabled={busy || position === event.productIds.length - 1}
            onClick={() => changeEvent(index, { productIds: move(event.productIds, position, 1) })}>아래로</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => {
            const next = event.productIds.filter((item) => item !== id);
            changeEvent(index, { productIds: next,
              heroProductId: event.heroProductId === id ? (next[0] ?? '') : event.heroProductId,
              heroImageId: event.heroProductId === id ? null : event.heroImageId });
          }}>제거</button>
        </li>)}</ol>
        <label htmlFor={`event-hero-${event.id}`}>대표 상품</label>
        <select id={`event-hero-${event.id}`} value={event.heroProductId}
          onChange={(e) => changeEvent(index, { heroProductId: e.currentTarget.value, heroImageId: null })}>
          <option value="">상품 선택</option>{event.productIds.map((id) =>
            <option key={id} value={id}>{productName(id)}</option>)}</select>
        <label htmlFor={`event-image-${event.id}`}>대표 사진</label>
        <select id={`event-image-${event.id}`} value={event.heroImageId ?? ''}
          onChange={(e) => changeEvent(index, { heroImageId: e.currentTarget.value || null })}>
          <option value="">현재 공개 대표 사진 자동 선택</option>
          {(heroImages[event.heroProductId] ?? []).filter((image) => image.purpose === 'thumbnail').map((image, position) =>
            <option key={image.id} value={image.id}>사진 {position + 1}</option>)}
        </select>
        <div className="home-admin-actions"><button type="button" className="secondary-button" disabled={busy || index === 0}
          onClick={() => onChange({ ...draft.payload, events: move(events, index, -1).map((entry, order) =>
            ({ ...entry, displayOrder: order })) })}>위로</button>
        <button type="button" className="secondary-button" disabled={busy || index === events.length - 1}
          onClick={() => onChange({ ...draft.payload, events: move(events, index, 1).map((entry, order) =>
            ({ ...entry, displayOrder: order })) })}>아래로</button>
        <button type="button" className="secondary-button" disabled={busy}
          onClick={() => onChange({ ...draft.payload, events: events.filter((_, position) => position !== index) })}>제거</button></div>
      </fieldset>)}
      <button type="button" className="secondary-button" disabled={busy || events.length >= 12} onClick={addEvent}>기획전 추가</button>
    </section>
    <section className="account-card profile-card" aria-labelledby="home-recommendations-heading">
      <h2 id="home-recommendations-heading">추천 상품</h2>
      <p>모든 고객에게 동일한 순서로 보입니다. 현재 판매 가능한 상품만 표시합니다.</p>
      <label htmlFor="recommend-product">상품 추가</label>
      <select id="recommend-product" defaultValue="" disabled={busy || recommendations.length >= 24} onChange={(e) => {
        const id = e.currentTarget.value;
        if (id && recommendations.length < 24 && !recommendations.includes(id)) {
          onChange({ ...draft.payload, recommendations: [...recommendations, id] });
        }
        e.currentTarget.value = '';
      }}><option value="">검색 결과에서 선택</option>
        {products.filter((item) => !recommendations.includes(item.productId)).map((item) =>
          <option key={item.productId} value={item.productId}>{item.title} · {item.sellerName}</option>)}</select>
      <ol className="home-admin-products">{recommendations.map((id, index) => <li key={id}>
        {productName(id)} <button type="button" className="secondary-button" disabled={busy || index === 0}
          onClick={() => onChange({ ...draft.payload, recommendations: move(recommendations, index, -1) })}>위로</button>
        <button type="button" className="secondary-button" disabled={busy || index === recommendations.length - 1}
          onClick={() => onChange({ ...draft.payload, recommendations: move(recommendations, index, 1) })}>아래로</button>
        <button type="button" className="secondary-button" disabled={busy}
          onClick={() => onChange({ ...draft.payload,
            recommendations: recommendations.filter((item) => item !== id) })}>제거</button>
      </li>)}</ol>
    </section>
    <section className="account-card profile-card" aria-labelledby="home-actions-heading">
      <h2 id="home-actions-heading">저장 · 미리보기 · 공개</h2>
      {dirty ? <p role="status">저장하지 않은 변경사항이 있습니다. 먼저 편집본을 저장해 주세요.</p> : null}
      <div className="home-admin-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={onSave}>편집본 저장</button>
        <button type="button" className="secondary-button" disabled={busy || dirty} onClick={onPreview}>미리보기</button>
        <button type="button" className="primary-button" disabled={busy || dirty} onClick={onPublish}>고객 화면에 공개</button>
        {onReload ? <button type="button" className="secondary-button" disabled={busy}
          onClick={onReload}>서버 내용 다시 불러오기</button> : null}
      </div>
      {preview ? <div aria-label="미리보기 결과"><h3>미리보기 결과</h3>
        <p>지금 고객에게 표시: 메뉴 {preview.payload.menu.filter((item) => !isExcluded('menu', item.id)).length}개 · 기획전 {preview.payload.events.filter((item) => !isExcluded('event', item.id)).length}개 · 추천 {preview.payload.recommendations.filter((id) => !isExcluded('recommendation', id)).length}개</p>
        <p>시작 전·종료 후 기획전과 숨김 메뉴도 편집본에는 남아 있습니다. 공개는 가능하지만 해당 기간에는 고객에게 표시되지 않습니다.</p>
        <h4>추가 메뉴</h4><ul>{preview.payload.menu.map((item) => <li key={item.id}>
          {item.label}{isExcluded('menu', item.id) ? ' · 고객 화면 비노출' : ''}
        </li>)}</ul>
        <h4>기획전</h4><ul>{preview.payload.events.map((item) => <li key={item.id}>
          {item.title}{isExcluded('event', item.id) ? ' · 고객 화면 비노출' : ''}
        </li>)}</ul>
        <h4>추천 상품</h4><ol>{preview.payload.recommendations.map((id) => <li key={id}>
          {productName(id)}{isExcluded('recommendation', id) ? ' · 고객 화면 비노출' : ''}
        </li>)}</ol>
        {preview.excluded.length ? <ul>{preview.excluded.map((item) =>
          <li key={`${item.kind}-${item.id}`}>{item.kind} {item.id}: {item.reason}</li>)}</ul> :
          <p>현재 제외 대상이 없습니다</p>}</div> : null}
    </section>
    <section className="account-card profile-card" aria-labelledby="home-history-heading">
      <h2 id="home-history-heading">공개 이력</h2>
      {history.length ? <ul className="home-admin-products">{history.map((item) => <li key={item.id}>
        {new Date(item.publishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · {item.id}
        <button type="button" className="secondary-button" disabled={busy} onClick={() => onRestore(item.id)}>이 공개본으로 복구</button>
      </li>)}</ul> : <p>공개 이력이 없습니다</p>}
    </section>
  </div>;
}

export default function AdminHomePage() {
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'unavailable'>('loading');
  const [draft, setDraft] = useState<Draft>({ version: 1, payload: empty });
  const [savedPayload, setSavedPayload] = useState<Payload>(empty);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [heroImages, setHeroImages] = useState<Record<string, { id: string; purpose: string }[]>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function get(path: string, signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API origin unavailable');
    const response = await fetch(`${apiOrigin}${path}`, { credentials: 'include', signal, cache: 'no-store' });
    if (response.status === 401 || response.status === 403) throw new Error('Unauthorized');
    if (!response.ok) throw new Error('Read failed');
    return response.json();
  }
  async function reload(signal?: AbortSignal) {
    const [nextDraft, nextHistory, nextCategories, nextSellers, nextProducts] = await Promise.all([
      get('/home/admin/draft', signal), get('/home/admin/history', signal),
      get('/catalog/categories', signal), get('/catalog/sellers', signal), get('/catalog/products', signal),
    ]);
    setDraft(nextDraft as Draft); setSavedPayload((nextDraft as Draft).payload);
    setHistory(nextHistory as History[]);
    setCategories(nextCategories as Category[]); setSellers(nextSellers as Seller[]);
    setProducts(nextProducts as Product[]); setPreview(null);
  }
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const actor = await get('/auth/me', controller.signal) as { role: string };
      if (actor.role !== 'admin') { setState('unauthorized'); return; }
      await reload(controller.signal);
      setState('ready');
    }
    load().catch((error: unknown) => {
      if (error instanceof Error && error.name === 'AbortError') return;
      setState(error instanceof Error && error.message === 'Unauthorized' ? 'unauthorized' : 'unavailable');
    });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (state !== 'ready' || !apiOrigin) return;
    const controller = new AbortController();
    const ids = [...new Set(draft.payload.events.map((item) => item.heroProductId).filter(Boolean))];
    Promise.all(ids.map(async (id) => {
      const response = await fetch(`${apiOrigin}/catalog/products/${encodeURIComponent(id)}`,
        { signal: controller.signal, cache: 'no-store' });
      return [id, response.ok ? ((await response.json()) as { images?: { id: string; purpose: string }[] }).images ?? [] : []] as const;
    })).then((rows) => { if (!controller.signal.aborted) setHeroImages(Object.fromEntries(rows)); })
      .catch(() => { if (!controller.signal.aborted) setHeroImages({}); });
    return () => controller.abort();
  }, [draft.payload.events, state]);

  async function write(path: string, body?: unknown) {
    if (!apiOrigin) throw new Error('API origin unavailable');
    return fetch(`${apiOrigin}${path}`, { method: path === '/home/admin/draft' ? 'PUT' : 'POST',
      credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  }
  async function perform(kind: 'save' | 'preview' | 'publish' | 'restore', id?: string) {
    if (busy) return;
    if ((kind === 'preview' || kind === 'publish') && JSON.stringify(draft.payload) !== JSON.stringify(savedPayload)) {
      setMessage('먼저 편집본을 저장해 주세요'); return;
    }
    setBusy(true); setMessage('');
    try {
      if (kind === 'preview') { setPreview(await get('/home/admin/preview') as Preview);
        setMessage('저장된 편집본을 미리 보여 드립니다'); return; }
      const response = await write(kind === 'save' ? '/home/admin/draft' :
        kind === 'publish' ? '/home/admin/publish' : `/home/admin/restore/${encodeURIComponent(id ?? '')}`,
      kind === 'save' ? draft : kind === 'publish' ? { version: draft.version } : undefined);
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (response.status === 409) { setMessage('다른 관리자가 먼저 수정했습니다. 서버 내용을 다시 불러와 주세요'); return; }
      if (!response.ok) { setMessage(kind === 'publish' ?
        '공개하지 못했습니다. 미리보기의 제외 대상과 상품 상태를 확인해 주세요' : '요청을 처리하지 못했습니다'); return; }
      if (kind === 'save') {
        const confirmation = await confirmSavedDraft<Draft>(response, () => reload(), (saved) => {
          setDraft(saved); setSavedPayload(saved.payload);
        });
        setMessage(confirmation === 'response' ? '편집본을 저장했습니다. 고객 화면은 그대로입니다' :
          confirmation === 'reloaded' ? '편집본을 저장하고 서버 내용을 다시 확인했습니다. 고객 화면은 그대로입니다' :
          '편집본은 저장됐지만 서버 내용 재조회에 실패했습니다. 다시 불러와 확인해 주세요');
        return;
      }
      try { await reload(); await get('/home/content');
        setMessage(kind === 'publish' ? '공개하고 고객 화면을 다시 확인했습니다' : '이전 공개본으로 복구했습니다'); }
      catch { setMessage('요청은 처리됐지만 공개 내용 재조회에 실패했습니다. 서버 내용을 다시 확인해 주세요'); }
    } catch { setMessage('서버에 연결할 수 없습니다. 처리 여부를 다시 조회해 주세요'); }
    finally { setBusy(false); }
  }
  async function search(query: string) {
    if (!apiOrigin || state !== 'ready') return;
    try {
      const found = await get(`/catalog/products?q=${encodeURIComponent(query)}`) as Product[];
      setProducts((current) => [...new Map([...current, ...found].map((item) => [item.productId, item])).values()]);
    } catch { setMessage('상품 검색 결과를 불러오지 못했습니다'); }
  }
  return <main id="main-content" tabIndex={-1} className="shell account-shell">
    <a className="text-link" href="/account">내 계정으로</a><h1>홈 전시 관리</h1>
    {state === 'loading' ? <p role="status">운영자 권한 확인 중</p> : null}
    {state === 'unauthorized' ? <p role="alert">운영자 로그인 후 이용할 수 있습니다</p> : null}
    {state === 'unavailable' ? <p role="alert">홈 전시 정보를 불러올 수 없습니다</p> : null}
    {state === 'ready' ? <AdminHomeView draft={draft} categories={categories} sellers={sellers}
      products={products} history={history} preview={preview} busy={busy} heroImages={heroImages}
      dirty={JSON.stringify(draft.payload) !== JSON.stringify(savedPayload)}
      onChange={(payload) => setDraft((current) => ({ ...current, payload }))}
      onSave={() => void perform('save')} onPreview={() => void perform('preview')}
      onPublish={() => void perform('publish')} onRestore={(id) => void perform('restore', id)}
      onSearch={(query) => void search(query)} onReload={() => void reload().then(() => setMessage('서버 내용을 다시 불러왔습니다'))
        .catch(() => setMessage('서버 내용을 불러오지 못했습니다'))} /> : null}
    {message ? <p role="status">{message}</p> : null}
  </main>;
}
