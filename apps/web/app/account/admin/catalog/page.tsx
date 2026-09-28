'use client';

import { useEffect, useState, type FormEvent } from 'react';

type ProductCategory = { id: string; name: string; parentId: string | null };
type SellerCategory = { id: string; name: string };
type Seller = { id: string; categoryId: string; displayName: string };
type Kind = 'majors' | 'minors' | 'seller-categories' | 'sellers';
type ViewProps = {
  majors: ProductCategory[]; minors: ProductCategory[];
  sellerCategories: SellerCategory[]; sellers: Seller[]; busy: boolean;
  onCreate: (kind: Kind, data: Record<string, string>, form: HTMLFormElement) => void;
};
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export function AdminCatalogView({ majors, minors, sellerCategories, sellers, busy, onCreate }: ViewProps) {
  function submit(event: FormEvent<HTMLFormElement>, kind: Kind) {
    event.preventDefault();
    const form = event.currentTarget;
    onCreate(kind, Object.fromEntries(new FormData(form).entries()) as Record<string, string>, form);
  }
  return <div className="catalog-admin-grid">
    <section className="account-card profile-card" aria-labelledby="product-category-title">
      <h2 id="product-category-title">상품 분류</h2>
      <p>대분류 → 소분류 → 상품 순서입니다. 상품 등록 화면은 다음 단계에서 연결합니다</p>
      <form className="account-form" onSubmit={(event) => submit(event, 'majors')}>
        <h3>대분류 등록</h3><label htmlFor="major-name">대분류 이름</label>
        <input id="major-name" name="name" required maxLength={80} />
        <button className="primary-button" disabled={busy} type="submit">대분류 등록</button>
      </form>
      <form className="account-form" onSubmit={(event) => submit(event, 'minors')}>
        <h3>소분류 등록</h3><label htmlFor="minor-parent">상위 대분류</label>
        <select id="minor-parent" name="parentId" required defaultValue="">
          <option value="" disabled>대분류 선택</option>
          {majors.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
        <label htmlFor="minor-name">소분류 이름</label>
        <input id="minor-name" name="name" required maxLength={80} />
        <button className="primary-button" disabled={busy || majors.length === 0} type="submit">소분류 등록</button>
      </form>
      <h3>현재 상품 분류</h3>
      {majors.length === 0 ? <p>등록된 대분류가 없습니다</p> : <ul className="catalog-list">{majors.map((major) =>
        <li key={major.id}><strong>{major.name}</strong>
          <ul>{minors.filter((minor) => minor.parentId === major.id).map((minor) => <li key={minor.id}>{minor.name}</li>)}</ul>
        </li>)}</ul>}
    </section>
    <section className="account-card profile-card" aria-labelledby="seller-category-title">
      <h2 id="seller-category-title">판매자 분류</h2>
      <p>어울몰 판매자도 다른 판매자와 같은 등록 방식으로 관리합니다</p>
      <form className="account-form" onSubmit={(event) => submit(event, 'seller-categories')}>
        <h3>판매자 분류 등록</h3><label htmlFor="seller-category-name">분류 이름</label>
        <input id="seller-category-name" name="name" required maxLength={80} />
        <button className="primary-button" disabled={busy} type="submit">판매자 분류 등록</button>
      </form>
      <form className="account-form" onSubmit={(event) => submit(event, 'sellers')}>
        <h3>판매자 등록</h3><label htmlFor="seller-category">판매자 분류</label>
        <select id="seller-category" name="categoryId" required defaultValue="">
          <option value="" disabled>분류 선택</option>
          {sellerCategories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
        <label htmlFor="seller-name">판매자 이름</label>
        <input id="seller-name" name="name" required maxLength={80} />
        <button className="primary-button" disabled={busy || sellerCategories.length === 0} type="submit">판매자 등록</button>
      </form>
      <h3>현재 판매자</h3>
      {sellerCategories.length === 0 ? <p>등록된 판매자 분류가 없습니다</p> : <ul className="catalog-list">{sellerCategories.map((category) =>
        <li key={category.id}><strong>{category.name}</strong>
          <ul>{sellers.filter((seller) => seller.categoryId === category.id).map((seller) =>
            <li key={seller.id}>{seller.displayName}</li>)}</ul>
        </li>)}</ul>}
    </section>
  </div>;
}

export default function AdminCatalogPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'unavailable'>('loading');
  const [majors, setMajors] = useState<ProductCategory[]>([]);
  const [minors, setMinors] = useState<ProductCategory[]>([]);
  const [sellerCategories, setSellerCategories] = useState<SellerCategory[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function reload(signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API origin unavailable');
    const options = { credentials: 'include' as const, signal };
    const responses = await Promise.all([
      fetch(`${apiOrigin}/catalog/categories`, options),
      fetch(`${apiOrigin}/catalog/seller-categories`, options),
      fetch(`${apiOrigin}/catalog/sellers`, options),
    ]);
    if (responses.some((response) => !response.ok)) throw new Error('Catalog unavailable');
    const [categories, groups, sellerList] = await Promise.all(responses.map((response) => response.json()));
    setMajors((categories as ProductCategory[]).filter((item) => item.parentId === null));
    setMinors((categories as ProductCategory[]).filter((item) => item.parentId !== null));
    setSellerCategories(groups as SellerCategory[]);
    setSellers(sellerList as Seller[]);
  }

  useEffect(() => {
    if (!apiOrigin) { setState('unavailable'); return; }
    const controller = new AbortController();
    async function load() {
      const response = await fetch(`${apiOrigin}/auth/me`, { credentials: 'include', signal: controller.signal });
      if (!response.ok) { setState(response.status === 401 ? 'unauthorized' : 'unavailable'); return; }
      const actor = await response.json() as { role: string };
      if (actor.role !== 'admin') { setState('unauthorized'); return; }
      await reload(controller.signal);
      setState('ready');
    }
    load().catch((error: unknown) => {
      if (error instanceof Error && error.name !== 'AbortError') setState('unavailable');
    });
    return () => controller.abort();
  }, []);

  async function create(kind: Kind, data: Record<string, string>, form: HTMLFormElement) {
    if (!apiOrigin || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/catalog/admin/${kind}`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (!response.ok) {
        setMessage(response.status === 409 ? '같은 이름이 이미 등록되어 있습니다' : '등록하지 못했습니다. 입력을 확인해 주세요');
        return;
      }
      await reload();
      form.reset();
      setMessage('등록했습니다');
    } catch {
      setMessage('서버에 연결할 수 없습니다');
    } finally {
      setBusy(false);
    }
  }

  return <main id="main-content" tabIndex={-1} className="shell account-shell">
    <a className="text-link" href="/account">내 계정으로</a>
    <h1>분류·판매자 등록</h1>
    {state === 'loading' ? <p role="status">운영자 권한 확인 중</p> : null}
    {state === 'unauthorized' ? <p role="alert">운영자 로그인 후 이용할 수 있습니다</p> : null}
    {state === 'unavailable' ? <p role="alert">분류 정보를 불러올 수 없습니다. 연결 설정을 확인해 주세요</p> : null}
    {state === 'ready' ? <>
      <AdminCatalogView majors={majors} minors={minors} sellerCategories={sellerCategories}
        sellers={sellers} busy={busy} onCreate={create} />
      {message ? <p role="status">{message}</p> : null}
    </> : null}
  </main>;
}
