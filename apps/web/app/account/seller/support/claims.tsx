'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

type Summary = { id: string; productId: string; shipmentOrderId: string;
  kind: string; reasonCode: string; status: string; createdAt: string };
type Detail = Summary & { reason: string; quantity: number;
  messages: { id: string; authorRole: string; body: string; createdAt: string }[];
  events: { action: string; reason: string; occurredAt: string }[];
  evidence: { id: string; mimeType: string; sizeBytes: number }[] };
type Page = { items: Summary[]; nextCursor: string | null };
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export function SellerClaimsView({ items,selected,busy,message,nextCursor,onMore,onSelect,onReply }: {
  items: Summary[]; selected?: Detail; busy: boolean; message: string;
  nextCursor: string | null; onMore: () => void; onSelect: (id: string) => void;
  onReply: (body: string) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = String(new FormData(event.currentTarget).get('body') ?? '').trim();
    if (body) onReply(body);
  }
  return <div className="catalog-admin-grid">
    <section className="account-card profile-card" aria-labelledby="seller-claims-list-title">
      <h2 id="seller-claims-list-title">품목 클레임</h2>
      <p>상품/품목의 소유 판매자만 답변합니다. 공동출고 담당이라는 이유만으로 보이지 않습니다.</p>
      {items.length === 0 ? <p>접수된 클레임이 없습니다.</p> : <ul className="catalog-list">
        {items.map((item) => <li key={item.id}>
          <button type="button" className="secondary-button" disabled={busy}
            aria-pressed={selected?.id === item.id} onClick={() => onSelect(item.id)}>
            {item.kind} · {item.reasonCode} · {item.status}</button>
          <p>발송 {item.shipmentOrderId} · {new Date(item.createdAt).toLocaleString('ko-KR')}</p>
        </li>)}
      </ul>}
      {nextCursor ? <button type="button" className="secondary-button" disabled={busy}
        onClick={onMore}>더보기</button> : null}
    </section>
    <section className="account-card profile-card" aria-labelledby="seller-claims-detail-title">
      <h2 id="seller-claims-detail-title">클레임 대화·증빙</h2>
      {message ? <p role="status">{message}</p> : null}
      {!selected ? <p>답변할 클레임을 선택해 주세요.</p> : <>
        <p><strong>{selected.status}</strong> · {selected.kind} · {selected.quantity}개</p>
        <p>사유 {selected.reasonCode}: {selected.reason}</p>
        <ol>{selected.messages.map((item) => <li key={item.id}>
          {item.authorRole} · {item.body} · {new Date(item.createdAt).toLocaleString('ko-KR')}
        </li>)}</ol>
        <h3>비공개 증빙</h3>
        {selected.evidence.length === 0 ? <p>등록된 증빙이 없습니다.</p> : <ul>
          {selected.evidence.map((item) => <li key={item.id}>
            {apiOrigin ? <a className="text-link" target="_blank" rel="noopener noreferrer"
              href={`${apiOrigin}/seller/support/claims/${encodeURIComponent(selected.id)}/evidence/${encodeURIComponent(item.id)}`}>
              증빙 {item.id}</a> : '증빙 조회 불가'} · {item.mimeType} · {item.sizeBytes}바이트
          </li>)}
        </ul>}
        <h3>처리 이력</h3>
        <ol>{selected.events.map((item,index) => <li key={`${item.occurredAt}-${index}`}>
          {item.action} · {item.reason} · {new Date(item.occurredAt).toLocaleString('ko-KR')}
        </li>)}</ol>
        {['REQUESTED','SELLER_REPLIED'].includes(selected.status) ?
          <form className="account-form" onSubmit={submit}>
            <label htmlFor="seller-claim-reply">추가 답변</label>
            <textarea id="seller-claim-reply" name="body" maxLength={2000} rows={4} required />
            <p>답변 이력은 추가 사건으로 보존됩니다. 최종 결정은 관리자만 합니다.</p>
            <button type="submit" className="primary-button" disabled={busy}>답변 등록</button>
          </form> : null}
      </>}
    </section>
  </div>;
}

export function SellerClaimsPanel() {
  const [items,setItems] = useState<Summary[]>([]);
  const [selected,setSelected] = useState<Detail>();
  const [nextCursor,setNextCursor] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const replyKeys = useRef(new Map<string,string>());

  async function loadList(cursor?: string,signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const query = new URLSearchParams({ limit: '20' });
    if (cursor) query.set('cursor',cursor);
    const response = await fetch(`${apiOrigin}/seller/support/claims?${query}`,
      { credentials: 'include',cache: 'no-store',signal });
    if (!response.ok) throw new Error('Claims unavailable');
    const page = await response.json() as Page;
    if (signal?.aborted) return;
    setItems((previous) => cursor ? [...previous,
      ...page.items.filter((item) => !previous.some((old) => old.id === item.id))] : page.items);
    setNextCursor(page.nextCursor);
  }

  async function loadDetail(id: string,signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const response = await fetch(`${apiOrigin}/seller/support/claims/${encodeURIComponent(id)}`,
      { credentials: 'include',cache: 'no-store',signal });
    if (!response.ok) throw new Error('Claim unavailable');
    const detail = await response.json() as Detail;
    if (!signal?.aborted) setSelected(detail);
  }

  useEffect(() => {
    const controller = new AbortController();
    loadList(undefined,controller.signal).catch((error: unknown) => {
      if (error instanceof Error && error.name !== 'AbortError')
        setMessage('클레임 목록을 불러오지 못했습니다');
    });
    return () => controller.abort();
  }, []);

  async function more() {
    if (busy || !nextCursor) return;
    setBusy(true);
    try { await loadList(nextCursor); }
    catch { setMessage('다음 클레임을 불러오지 못했습니다'); }
    finally { setBusy(false); }
  }

  async function select(id: string) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await loadDetail(id); }
    catch { setMessage('클레임 상세를 불러오지 못했습니다'); }
    finally { setBusy(false); }
  }

  async function reply(body: string) {
    if (!apiOrigin || !selected || busy) return;
    const identity = `${selected.id}|${body}`;
    const key = replyKeys.current.get(identity) ?? crypto.randomUUID();
    replyKeys.current.set(identity,key);
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/seller/support/claims/${encodeURIComponent(selected.id)}/replies`, {
        method: 'POST',credentials: 'include',headers: {
          'content-type': 'application/json','idempotency-key': key },
        body: JSON.stringify({ body }),
      });
      if (response.status === 404) { setMessage('본인 담당 클레임을 찾을 수 없습니다'); return; }
      if (response.status === 409) { setMessage('동일 요청키의 다른 답변과 충돌했습니다'); return; }
      if (!response.ok) { setMessage('결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요'); return; }
      replyKeys.current.delete(identity);
      try { await Promise.all([loadDetail(selected.id),loadList()]); }
      catch { setMessage('답변은 저장됐지만 목록을 새로고침하지 못했습니다'); return; }
      setMessage('답변과 이력을 저장했습니다');
    } catch { setMessage('결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요'); }
    finally { setBusy(false); }
  }

  return <SellerClaimsView items={items} selected={selected} busy={busy} message={message}
    nextCursor={nextCursor} onMore={more} onSelect={select} onReply={reply} />;
}
