'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { reviewActionLabel, reviewActorRoleLabel, reviewScanStatusLabel,
  reviewStatusLabel } from '../../../support-review-labels';

type Summary = { id: string; productId: string; confirmationId: string;
  rating: number; body: string; status: string; version: number;
  reportCount: number; createdAt: string };
type Detail = Summary & {
  images: { id: string; mimeType: string; sizeBytes: number; scanStatus: string }[];
  reports: { id: string; reason: string; reportedAt: string }[];
  events: { action: string; actorRole: string; reason: string | null;
    beforeValue: { rating?: number; body?: string; version?: number; status?: string };
    afterValue: { rating?: number; body?: string; version?: number; status?: string };
    occurredAt: string }[] };
type Page = { items: Summary[]; nextCursor: string | null };
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export function AdminSupportReviewsView({ items,selected,busy,message,statusFilter,nextCursor,
  onFilter,onMore,onSelect,onApprove,onHide }: {
  items: Summary[]; selected?: Detail; busy: boolean; message: string;
  statusFilter: string; nextCursor: string | null;
  onFilter: (status: string) => void; onMore: () => void; onSelect: (id: string) => void;
  onApprove: () => void; onHide: (reason: string) => void;
}) {
  function hide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
    if (reason) onHide(reason);
  }
  return <div className="catalog-admin-grid">
    <section className="account-card profile-card" aria-labelledby="admin-reviews-list-title">
      <h2 id="admin-reviews-list-title">리뷰 운영</h2>
      <p>이미지 공개는 현재 저장 파일의 재검사 PASS 후에만 허용됩니다.</p>
      <label htmlFor="admin-review-status">상태</label>
      <select id="admin-review-status" value={statusFilter} disabled={busy}
        onChange={(event) => onFilter(event.target.value)}>
        <option value="">전체</option>
        {['PENDING','APPROVED','HIDDEN'].map((status) =>
          <option key={status} value={status}>{reviewStatusLabel(status)}</option>)}
      </select>
      {items.length === 0 ? <p>해당 리뷰가 없습니다.</p> : <ul className="catalog-list">
        {items.map((item) => <li key={item.id}>
          <button type="button" className="secondary-button" disabled={busy}
            aria-pressed={selected?.id === item.id} onClick={() => onSelect(item.id)}>
            {item.rating}점 · {item.body} · {reviewStatusLabel(item.status)}</button>
          <p>상품 {item.productId} · 신고 {item.reportCount}건 · 버전 {item.version}</p>
        </li>)}
      </ul>}
      {nextCursor ? <button type="button" className="secondary-button" disabled={busy}
        onClick={onMore}>더보기</button> : null}
    </section>
    <section className="account-card profile-card" aria-labelledby="admin-review-detail-title">
      <h2 id="admin-review-detail-title">리뷰·신고·수정 이력</h2>
      {message ? <p role="status">{message}</p> : null}
      {!selected ? <p>검토할 리뷰를 선택해 주세요.</p> : <>
        <p><strong>{reviewStatusLabel(selected.status)}</strong> · {selected.rating}점 · 버전 {selected.version}</p>
        <p>{selected.body}</p>
        <p>구매확정 {selected.confirmationId} · 상품 {selected.productId}</p>
        <h3>비공개 이미지 미리보기</h3>
        {selected.images.length === 0 ? <p>이미지가 없습니다.</p> : <ul>
          {selected.images.map((item) => <li key={item.id}>
            {apiOrigin ? <a className="text-link" target="_blank" rel="noopener noreferrer"
              href={`${apiOrigin}/admin/support/reviews/${encodeURIComponent(selected.id)}/images/${encodeURIComponent(item.id)}/preview`}>
              이미지 {item.id}</a> : '미리보기 불가'} · {reviewScanStatusLabel(item.scanStatus)} · {item.sizeBytes}바이트
          </li>)}
        </ul>}
        <h3>신고</h3>
        {selected.reports.length === 0 ? <p>신고가 없습니다.</p> : <ol>
          {selected.reports.map((item) => <li key={item.id}>
            {item.reason} · {new Date(item.reportedAt).toLocaleString('ko-KR')}
          </li>)}
        </ol>}
        <h3>수정·운영 이력</h3>
        <ol>{selected.events.map((item,index) => <li key={`${item.occurredAt}-${index}`}>
          {reviewActionLabel(item.action)} · {reviewActorRoleLabel(item.actorRole)} ·
          {' '}버전 {item.afterValue.version ?? '—'}
          {item.reason ? ` · ${item.reason}` : ''}
          {' · '}{new Date(item.occurredAt).toLocaleString('ko-KR')}
        </li>)}</ol>
        {selected.status === 'PENDING' ? <button type="button" className="primary-button"
          disabled={busy} onClick={onApprove}>승인·이미지 검사</button> : null}
        {selected.status !== 'HIDDEN' ? <form className="account-form" onSubmit={hide}>
          <label htmlFor="admin-review-hide-reason">숨김 사유</label>
          <textarea id="admin-review-hide-reason" name="reason" rows={3}
            maxLength={500} required />
          <button type="submit" className="secondary-button" disabled={busy}>사유 기록 후 숨김</button>
        </form> : null}
      </>}
    </section>
  </div>;
}

export default function AdminSupportReviewsPage() {
  const [state,setState] = useState<'loading' | 'ready' | 'unauthorized' | 'unavailable'>('loading');
  const [items,setItems] = useState<Summary[]>([]);
  const [selected,setSelected] = useState<Detail>();
  const [statusFilter,setStatusFilter] = useState('PENDING');
  const [nextCursor,setNextCursor] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const decisionKeys = useRef(new Map<string,string>());

  async function loadList(status: string,cursor?: string,signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const query = new URLSearchParams({ limit: '20' });
    if (status) query.set('status',status);
    if (cursor) query.set('cursor',cursor);
    const response = await fetch(`${apiOrigin}/admin/support/reviews?${query}`,
      { credentials: 'include',cache: 'no-store',signal });
    if (!response.ok) throw new Error('Reviews unavailable');
    const page = await response.json() as Page;
    if (signal?.aborted) return;
    setItems((previous) => cursor ? [...previous,
      ...page.items.filter((item) => !previous.some((old) => old.id === item.id))] : page.items);
    setNextCursor(page.nextCursor);
  }

  async function loadDetail(id: string,signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const response = await fetch(`${apiOrigin}/admin/support/reviews/${encodeURIComponent(id)}`,
      { credentials: 'include',cache: 'no-store',signal });
    if (!response.ok) throw new Error('Review unavailable');
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
      await loadList('PENDING',undefined,controller.signal);
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
    catch { setMessage('리뷰 목록을 불러오지 못했습니다'); }
    finally { setBusy(false); }
  }

  async function more() {
    if (busy || !nextCursor) return;
    setBusy(true);
    try { await loadList(statusFilter,nextCursor); }
    catch { setMessage('다음 리뷰를 불러오지 못했습니다'); }
    finally { setBusy(false); }
  }

  async function select(id: string) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await loadDetail(id); }
    catch { setMessage('리뷰 상세를 불러오지 못했습니다'); }
    finally { setBusy(false); }
  }

  async function decide(action: 'approve' | 'hide',reason?: string) {
    if (!apiOrigin || !selected || busy) return;
    const body = action === 'approve' ? {} : { reason };
    const path = `${apiOrigin}/admin/support/reviews/${encodeURIComponent(selected.id)}/${action}`;
    const identity = `${path}|${JSON.stringify(body)}`;
    const key = decisionKeys.current.get(identity) ?? crypto.randomUUID();
    decisionKeys.current.set(identity,key);
    setBusy(true); setMessage('');
    try {
      const response = await fetch(path, { method: 'POST',credentials: 'include',headers: {
        'content-type': 'application/json','idempotency-key': key },body: JSON.stringify(body),
      });
      if (response.status === 401 || response.status === 403) {
        setState('unauthorized'); return;
      }
      if (response.status === 503) {
        setMessage('이미지 검사기 또는 저장 파일을 확인할 수 없어 공개를 보류했습니다'); return;
      }
      if (response.status === 409) { setMessage('리뷰 버전이 바뀌었습니다. 다시 확인해 주세요'); return; }
      if (!response.ok) { setMessage('운영 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요'); return; }
      decisionKeys.current.delete(identity);
      try { await Promise.all([loadDetail(selected.id),loadList(statusFilter)]); }
      catch { setMessage('결정은 저장됐지만 목록을 새로고침하지 못했습니다'); return; }
      setMessage(action === 'approve' ? '검사 통과 리뷰를 공개했습니다' : '사유를 기록하고 리뷰를 숨겼습니다');
    } catch { setMessage('운영 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요'); }
    finally { setBusy(false); }
  }

  return <main id="main-content" tabIndex={-1} className="shell account-shell">
    <a className="text-link" href="/account">내 계정으로</a>
    <h1>고객 리뷰 운영</h1>
    {state === 'loading' ? <p role="status">운영자 권한 확인 중</p> : null}
    {state === 'unauthorized' ? <p role="alert">운영자 로그인 후 이용할 수 있습니다</p> : null}
    {state === 'unavailable' ? <p role="alert">리뷰 운영에 연결할 수 없습니다</p> : null}
    {state === 'ready' ? <AdminSupportReviewsView items={items} selected={selected}
      busy={busy} message={message} statusFilter={statusFilter} nextCursor={nextCursor}
      onFilter={filter} onMore={more} onSelect={select}
      onApprove={() => decide('approve')} onHide={(reason) => decide('hide',reason)} /> : null}
  </main>;
}
