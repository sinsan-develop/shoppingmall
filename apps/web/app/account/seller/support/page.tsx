'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

type Question = { id: string; productId: string; body: string; status: string;
  createdAt: string };
type Detail = Question & { messages: { id: string; authorRole: string; body: string;
  createdAt: string; events: { action: string }[] }[] };
type Page = { items: Question[]; nextCursor: string | null };
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export function SellerSupportView({ items,selected,busy,message,nextCursor,onMore,onSelect,onReply }: {
  items: Question[]; selected?: Detail; busy: boolean; message: string;
  nextCursor: string | null; onMore: () => void; onSelect: (id: string) => void;
  onReply: (body: string) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = String(new FormData(event.currentTarget).get('body') ?? '').trim();
    if (body) onReply(body);
  }
  return <div className="catalog-admin-grid">
    <section className="account-card profile-card" aria-labelledby="seller-question-list-title">
      <h2 id="seller-question-list-title">상품 문의</h2>
      <p>본인 담당 상품의 문의만 표시합니다. 출고 담당자와 상품 판매자는 다를 수 있습니다.</p>
      {items.length === 0 ? <p>접수된 문의가 없습니다.</p> : <ul className="catalog-list">
        {items.map((item) => <li key={item.id}>
          <button type="button" className="secondary-button" disabled={busy}
            aria-pressed={selected?.id === item.id} onClick={() => onSelect(item.id)}>
            {item.body} · {item.status}</button>
          <p>상품 {item.productId} · {new Date(item.createdAt).toLocaleString('ko-KR')}</p>
        </li>)}
      </ul>}
      {nextCursor ? <button type="button" className="secondary-button" disabled={busy}
        onClick={onMore}>더보기</button> : null}
    </section>
    <section className="account-card profile-card" aria-labelledby="seller-question-detail-title">
      <h2 id="seller-question-detail-title">문의와 답변 이력</h2>
      {message ? <p role="status">{message}</p> : null}
      {!selected ? <p>답변할 문의를 선택해 주세요.</p> : <>
        <p><strong>{selected.status}</strong> · 상품 {selected.productId}</p>
        <p>고객 질문: {selected.body}</p>
        <ol>{selected.messages.map((item) => <li key={item.id}>
          {item.authorRole} · {item.body} · {new Date(item.createdAt).toLocaleString('ko-KR')}
          {item.events.some((event) => event.action === 'PUBLISHED') ?
            ' · 관리자 공개 승인' : ' · 비공개 대기'}
        </li>)}</ol>
        {selected.status !== 'HIDDEN' ? <form className="account-form" onSubmit={submit}>
          <label htmlFor="seller-question-reply">추가 답변</label>
          <textarea id="seller-question-reply" name="body" rows={4} maxLength={2000} required />
          <p>답변은 관리자 공개 승인 후 고객 Q&amp;A에 반영됩니다.</p>
          <button type="submit" className="primary-button" disabled={busy}>답변 등록</button>
        </form> : null}
      </>}
    </section>
  </div>;
}

export default function SellerSupportPage() {
  const [state,setState] = useState<'loading' | 'ready' | 'unauthorized' | 'unavailable'>('loading');
  const [items,setItems] = useState<Question[]>([]);
  const [selected,setSelected] = useState<Detail>();
  const [nextCursor,setNextCursor] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const replyKeys = useRef(new Map<string,string>());

  async function loadList(cursor?: string,signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const query = new URLSearchParams({ limit: '20' });
    if (cursor) query.set('cursor',cursor);
    const response = await fetch(`${apiOrigin}/seller/support/questions?${query}`,
      { credentials: 'include',cache: 'no-store',signal });
    if (!response.ok) throw new Error('Question list unavailable');
    const page = await response.json() as Page;
    if (signal?.aborted) return;
    setItems((previous) => cursor ? [...previous,
      ...page.items.filter((item) => !previous.some((old) => old.id === item.id))] : page.items);
    setNextCursor(page.nextCursor);
  }

  async function loadDetail(id: string,signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const response = await fetch(`${apiOrigin}/seller/support/questions/${encodeURIComponent(id)}`,
      { credentials: 'include',cache: 'no-store',signal });
    if (!response.ok) throw new Error('Question detail unavailable');
    const detail = await response.json() as Detail;
    if (!signal?.aborted) setSelected(detail);
  }

  useEffect(() => {
    if (!apiOrigin) { setState('unavailable'); return; }
    const controller = new AbortController();
    async function load() {
      const response = await fetch(`${apiOrigin}/auth/me`,
        { credentials: 'include',signal: controller.signal });
      if (!response.ok) { setState(response.status === 401 ? 'unauthorized' : 'unavailable'); return; }
      if ((await response.json() as { role: string }).role !== 'seller') {
        setState('unauthorized'); return;
      }
      await loadList(undefined,controller.signal);
      setState('ready');
    }
    load().catch((error: unknown) => {
      if (error instanceof Error && error.name !== 'AbortError') setState('unavailable');
    });
    return () => controller.abort();
  }, []);

  async function more() {
    if (busy || !nextCursor) return;
    setBusy(true);
    try { await loadList(nextCursor); }
    catch { setMessage('다음 문의를 불러오지 못했습니다'); }
    finally { setBusy(false); }
  }

  async function select(id: string) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await loadDetail(id); }
    catch { setMessage('문의 상세를 불러오지 못했습니다'); }
    finally { setBusy(false); }
  }

  async function reply(body: string) {
    if (!apiOrigin || !selected || busy) return;
    const identity = `${selected.id}|${body}`;
    const key = replyKeys.current.get(identity) ?? crypto.randomUUID();
    replyKeys.current.set(identity,key);
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/seller/support/questions/${encodeURIComponent(selected.id)}/replies`, {
        method: 'POST',credentials: 'include',headers: {
          'content-type': 'application/json','idempotency-key': key },
        body: JSON.stringify({ text: body }),
      });
      if (response.status === 401 || response.status === 403) {
        setState('unauthorized'); return;
      }
      if (response.status === 404) { setMessage('본인 담당 상품 문의를 찾을 수 없습니다'); return; }
      if (response.status === 409) { setMessage('동일 요청키의 다른 답변과 충돌했습니다'); return; }
      if (!response.ok) { setMessage('결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요'); return; }
      replyKeys.current.delete(identity);
      try { await Promise.all([loadDetail(selected.id),loadList()]); }
      catch { setMessage('답변은 저장됐지만 목록을 새로고침하지 못했습니다'); return; }
      setMessage('답변을 저장했습니다. 관리자 공개 승인 후 고객에게 보입니다');
    } catch { setMessage('결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요'); }
    finally { setBusy(false); }
  }

  return <main id="main-content" tabIndex={-1} className="shell account-shell">
    <a className="text-link" href="/account">내 계정으로</a>
    <h1>판매자 고객지원</h1>
    {state === 'loading' ? <p role="status">판매자 권한 확인 중</p> : null}
    {state === 'unauthorized' ? <p role="alert">판매자 로그인 후 이용할 수 있습니다</p> : null}
    {state === 'unavailable' ? <p role="alert">상품 문의를 불러올 수 없습니다</p> : null}
    {state === 'ready' ? <SellerSupportView items={items} selected={selected}
      busy={busy} message={message} nextCursor={nextCursor} onMore={more}
      onSelect={select} onReply={reply} /> : null}
  </main>;
}
