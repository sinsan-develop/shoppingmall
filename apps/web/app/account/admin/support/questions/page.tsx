'use client';

import { useEffect, useState } from 'react';

type Summary = { id: string; productId: string; body: string; status: string;
  createdAt: string };
type Detail = Summary & { messages: { id: string; authorRole: string; body: string;
  createdAt: string; events: { action: string; actorRole: string }[] }[] };
type Page = { items: Summary[]; nextCursor: string | null };
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export function AdminSupportQuestionsView({ items,selected,busy,message,statusFilter,nextCursor,
  onFilter,onMore,onSelect,onPublish }: {
  items: Summary[]; selected?: Detail; busy: boolean; message: string;
  statusFilter: string; nextCursor: string | null;
  onFilter: (status: string) => void; onMore: () => void; onSelect: (id: string) => void;
  onPublish: (messageId: string) => void;
}) {
  return <div className="catalog-admin-grid">
    <section className="account-card profile-card" aria-labelledby="admin-question-list-title">
      <h2 id="admin-question-list-title">문의 공개 승인</h2>
      <p>승인하면 질문 본문과 선택한 판매자 답변 하나가 상품 Q&amp;A에 공개됩니다.</p>
      <label htmlFor="admin-question-status">상태</label>
      <select id="admin-question-status" value={statusFilter} disabled={busy}
        onChange={(event) => onFilter(event.target.value)}>
        <option value="">전체</option>
        {['OPEN','ANSWERED','PUBLISHED','HIDDEN'].map((status) =>
          <option key={status} value={status}>{status}</option>)}
      </select>
      {items.length === 0 ? <p>해당 문의가 없습니다.</p> : <ul className="catalog-list">
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
    <section className="account-card profile-card" aria-labelledby="admin-question-detail-title">
      <h2 id="admin-question-detail-title">질문·답변 이력</h2>
      {message ? <p role="status">{message}</p> : null}
      {!selected ? <p>공개할 문의를 선택해 주세요.</p> : <>
        <p><strong>{selected.status}</strong> · 상품 {selected.productId}</p>
        <p>질문 본문: {selected.body}</p>
        <ol>{selected.messages.map((item) => <li key={item.id}>
          <p>{item.authorRole} · {item.body}</p>
          <p>답변 ID {item.id} · {new Date(item.createdAt).toLocaleString('ko-KR')}</p>
          <p>{item.events.map((event) => event.action).join(', ')}</p>
          {item.authorRole === 'seller' && selected.status !== 'HIDDEN' ?
            <button type="button" className="primary-button" disabled={busy}
              onClick={() => onPublish(item.id)}>이 답변 공개</button> : null}
        </li>)}</ol>
      </>}
    </section>
  </div>;
}

export default function AdminSupportQuestionsPage() {
  const [state,setState] = useState<'loading' | 'ready' | 'unauthorized' | 'unavailable'>('loading');
  const [items,setItems] = useState<Summary[]>([]);
  const [selected,setSelected] = useState<Detail>();
  const [statusFilter,setStatusFilter] = useState('ANSWERED');
  const [nextCursor,setNextCursor] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');

  async function loadList(status: string,cursor?: string,signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const query = new URLSearchParams({ limit: '20' });
    if (status) query.set('status',status);
    if (cursor) query.set('cursor',cursor);
    const response = await fetch(`${apiOrigin}/admin/support/questions?${query}`,
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
    const response = await fetch(`${apiOrigin}/admin/support/questions/${encodeURIComponent(id)}`,
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
      if ((await response.json() as { role: string }).role !== 'admin') {
        setState('unauthorized'); return;
      }
      await loadList('ANSWERED',undefined,controller.signal);
      setState('ready');
    }
    load().catch((error: unknown) => {
      if (error instanceof Error && error.name !== 'AbortError') setState('unavailable');
    });
    return () => controller.abort();
  }, []);

  async function filter(status: string) {
    if (busy) return;
    setBusy(true); setStatusFilter(status); setSelected(undefined); setMessage('');
    try { await loadList(status); }
    catch { setMessage('문의 목록을 불러오지 못했습니다'); }
    finally { setBusy(false); }
  }

  async function more() {
    if (busy || !nextCursor) return;
    setBusy(true);
    try { await loadList(statusFilter,nextCursor); }
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

  async function publish(messageId: string) {
    if (!apiOrigin || !selected || busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/admin/support/questions/${encodeURIComponent(selected.id)}/publish`, {
        method: 'POST',credentials: 'include',headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messageId }),
      });
      if (response.status === 401 || response.status === 403) {
        setState('unauthorized'); return;
      }
      if (response.status === 404) { setMessage('승인 대상 답변을 찾을 수 없습니다'); return; }
      if (!response.ok) { setMessage('공개 결과를 확인하지 못했습니다. 같은 답변을 다시 확인해 주세요'); return; }
      try { await Promise.all([loadDetail(selected.id),loadList(statusFilter)]); }
      catch { setMessage('공개는 처리됐지만 목록을 새로고침하지 못했습니다'); return; }
      setMessage('선택한 답변과 질문을 상품 Q&A에 공개했습니다');
    } catch { setMessage('공개 결과를 확인하지 못했습니다. 같은 답변을 다시 확인해 주세요'); }
    finally { setBusy(false); }
  }

  return <main id="main-content" tabIndex={-1} className="shell account-shell">
    <a className="text-link" href="/account">내 계정으로</a>
    <h1>고객지원 상품 문의 관리</h1>
    {state === 'loading' ? <p role="status">운영자 권한 확인 중</p> : null}
    {state === 'unauthorized' ? <p role="alert">운영자 로그인 후 이용할 수 있습니다</p> : null}
    {state === 'unavailable' ? <p role="alert">상품 문의에 연결할 수 없습니다</p> : null}
    {state === 'ready' ? <AdminSupportQuestionsView items={items} selected={selected}
      busy={busy} message={message} statusFilter={statusFilter} nextCursor={nextCursor}
      onFilter={filter} onMore={more} onSelect={select} onPublish={publish} /> : null}
  </main>;
}
