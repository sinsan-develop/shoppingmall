'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { claimActionLabel, claimActorRoleLabel, claimEventReasonLabel,
  claimKindLabel, claimReasonCodeLabel, claimStatusLabel } from '../../../support-claim-labels';

type Summary = { id: string; productId: string; shipmentOrderId: string;
  kind: string; reasonCode: string; status: string; createdAt: string };
type Detail = Summary & { orderId: string; reason: string; quantity: number;
  goodsRefundWon: number; policyVersionId: string | null; decisionReason: string | null;
  messages: { id: string; authorRole: string; body: string; createdAt: string }[];
  events: { action: string; actorRole: string; reason: string; occurredAt: string }[];
  evidence: { id: string; mimeType: string; sizeBytes: number }[] };
type Page = { items: Summary[]; nextCursor: string | null };
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export function AdminSupportClaimsView({ items,selected,busy,message,statusFilter,nextCursor,
  onFilter,onMore,onSelect,onDecide,onResume }: {
  items: Summary[]; selected?: Detail; busy: boolean; message: string;
  statusFilter: string; nextCursor: string | null;
  onFilter: (status: string) => void; onMore: () => void; onSelect: (id: string) => void;
  onDecide: (decision: 'approve' | 'reject',reason: string) => void;
  onResume: () => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>, decision: 'approve' | 'reject') => {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
    if (reason) onDecide(decision,reason);
  };
  return <div className="catalog-admin-grid">
    <section className="account-card profile-card" aria-labelledby="claim-list-heading">
      <h2 id="claim-list-heading">클레임 심사</h2>
      <p>출고 후 시험정책입니다. 실제 약관·반송비는 확정되지 않았습니다.</p>
      <label htmlFor="claim-status-filter">상태</label>
      <select id="claim-status-filter" value={statusFilter} disabled={busy}
        onChange={(event) => onFilter(event.target.value)}>
        <option value="">전체</option>
        {['REQUESTED','SELLER_REPLIED','REFUND_PROCESSING','REFUNDED',
          'REJECTED','REVIEW_REQUIRED'].map((status) =>
          <option key={status} value={status}>{claimStatusLabel(status)}</option>)}
      </select>
      {items.length === 0 ? <p>해당 요청이 없습니다.</p> : <ul className="catalog-list">
        {items.map((item) => <li key={item.id}>
          <button type="button" className="secondary-button" disabled={busy}
            aria-pressed={selected?.id === item.id} onClick={() => onSelect(item.id)}>
            {claimKindLabel(item.kind)} · {claimStatusLabel(item.status)} · {claimReasonCodeLabel(item.reasonCode)}</button>
          <p>발송 {item.shipmentOrderId} · {new Date(item.createdAt).toLocaleString('ko-KR')}</p>
        </li>)}
      </ul>}
      {nextCursor ? <button type="button" className="secondary-button" disabled={busy}
        onClick={onMore}>더보기</button> : null}
    </section>
    <section className="account-card profile-card" aria-labelledby="claim-detail-heading">
      <h2 id="claim-detail-heading">클레임 상세·감사 이력</h2>
      {message ? <p role="status">{message}</p> : null}
      {!selected ? <p>심사할 요청을 선택해 주세요.</p> : <>
        <p><strong>{claimStatusLabel(selected.status)}</strong> · {claimKindLabel(selected.kind)} · {selected.quantity}개</p>
        <p>주문 {selected.orderId} · 발송 {selected.shipmentOrderId} · 상품 {selected.productId}</p>
        <p>사유 {claimReasonCodeLabel(selected.reasonCode)}: {selected.reason}</p>
        <p>승인 상품 환불액 {selected.goodsRefundWon.toLocaleString('ko-KR')}원 · 배송비 환불 0원</p>
        {selected.policyVersionId ? <p>적용 정책 버전 {selected.policyVersionId}</p> : null}
        {selected.decisionReason ? <p>최종 결정 사유 {selected.decisionReason}</p> : null}
        <h3>대화 이력</h3>
        <ol>{selected.messages.map((item) => <li key={item.id}>
          {claimActorRoleLabel(item.authorRole)} · {item.body} · {new Date(item.createdAt).toLocaleString('ko-KR')}
        </li>)}</ol>
        <h3>비공개 증빙</h3>
        {selected.evidence.length === 0 ? <p>등록된 증빙이 없습니다.</p> : <ul>
          {selected.evidence.map((item) => <li key={item.id}>
            {apiOrigin ? <a className="text-link" target="_blank" rel="noopener noreferrer"
              href={`${apiOrigin}/admin/support/claims/${encodeURIComponent(selected.id)}/evidence/${encodeURIComponent(item.id)}`}>
              증빙 {item.id}</a> : '증빙 조회 불가'} · {item.mimeType} · {item.sizeBytes}바이트
          </li>)}
        </ul>}
        <h3>처리 사건</h3>
        <ol>{selected.events.map((item,index) => <li key={`${item.occurredAt}-${index}`}>
          {claimActionLabel(item.action)} · {claimActorRoleLabel(item.actorRole)} ·
          {' '}{claimEventReasonLabel(item)} ·
          {' '}{new Date(item.occurredAt).toLocaleString('ko-KR')}
        </li>)}</ol>
        {['REQUESTED','SELLER_REPLIED'].includes(selected.status) ? <div className="refund-decision-grid">
          <form className="account-form" onSubmit={(event) => submit(event,'approve')}>
            <h3>최종 승인</h3>
            <p>개발용 loopback mock에서만 환불을 실행합니다. 대체 발송은 자동 생성되지 않습니다.</p>
            <label htmlFor="claim-approve-reason">승인 사유</label>
            <textarea id="claim-approve-reason" name="reason" maxLength={500} rows={3} required />
            <button type="submit" className="primary-button" disabled={busy}>승인·모의 환불 실행</button>
          </form>
          <form className="account-form" onSubmit={(event) => submit(event,'reject')}>
            <h3>반려</h3>
            <label htmlFor="claim-reject-reason">반려 사유</label>
            <textarea id="claim-reject-reason" name="reason" maxLength={500} rows={3} required />
            <button type="submit" className="secondary-button" disabled={busy}>반려</button>
          </form>
        </div> : null}
        {selected.status === 'REFUND_PROCESSING' ? <div className="account-form">
          <p>이미 승인된 환불 건의 결과만 재확인합니다. 새 환불 요청은 생성하지 않습니다.</p>
          <button type="button" className="primary-button" disabled={busy}
            onClick={onResume}>모의 환불 재개</button>
        </div> : null}
      </>}
    </section>
  </div>;
}

export default function AdminSupportClaimsPage() {
  const [state,setState] = useState<'loading' | 'ready' | 'unauthorized' | 'unavailable'>('loading');
  const [items,setItems] = useState<Summary[]>([]);
  const [selected,setSelected] = useState<Detail>();
  const [statusFilter,setStatusFilter] = useState('');
  const [nextCursor,setNextCursor] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const decisionKeys = useRef(new Map<string,string>());

  async function loadList(status: string,cursor?: string,signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const query = new URLSearchParams({ limit: '20' });
    if (status) query.set('status',status);
    if (cursor) query.set('cursor',cursor);
    const response = await fetch(`${apiOrigin}/admin/support/claims?${query}`,
      { credentials: 'include',cache: 'no-store',signal });
    if (!response.ok) throw new Error('Claim list unavailable');
    const page = await response.json() as Page;
    if (signal?.aborted) return;
    setItems((previous) => cursor ? [...previous,
      ...page.items.filter((item) => !previous.some((old) => old.id === item.id))] : page.items);
    setNextCursor(page.nextCursor);
  }

  async function loadDetail(id: string,signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const response = await fetch(`${apiOrigin}/admin/support/claims/${encodeURIComponent(id)}`,
      { credentials: 'include',cache: 'no-store',signal });
    if (!response.ok) throw new Error('Claim detail unavailable');
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
      await loadList('',undefined,controller.signal);
      const directId = new URLSearchParams(window.location.search).get('id');
      if (directId) await loadDetail(directId,controller.signal);
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
    catch { setMessage('클레임 목록을 불러오지 못했습니다'); }
    finally { setBusy(false); }
  }

  async function more() {
    if (busy || !nextCursor) return;
    setBusy(true);
    try { await loadList(statusFilter,nextCursor); }
    catch { setMessage('다음 목록을 불러오지 못했습니다'); }
    finally { setBusy(false); }
  }

  async function select(id: string) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await loadDetail(id); }
    catch { setMessage('상세를 불러오지 못했습니다'); }
    finally { setBusy(false); }
  }

  async function decide(decision: 'approve' | 'reject',reason: string) {
    if (!apiOrigin || !selected || busy) return;
    const body = { decision,reason };
    const identity = `${selected.id}|${JSON.stringify(body)}`;
    const key = decisionKeys.current.get(identity) ?? crypto.randomUUID();
    decisionKeys.current.set(identity,key);
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/admin/support/claims/${encodeURIComponent(selected.id)}/decision`, {
        method: 'POST',credentials: 'include',headers: {
          'content-type': 'application/json','idempotency-key': key },body: JSON.stringify(body),
      });
      if (response.status === 401 || response.status === 403) {
        setState('unauthorized'); return;
      }
      if (response.status === 404) { setMessage('요청 또는 로컬 모의 환불 환경을 확인해 주세요'); return; }
      if (response.status === 409) {
        setMessage('결정 상태가 달라졌습니다. 상세를 다시 확인해 주세요');
        await loadDetail(selected.id).catch(() => {}); return;
      }
      if (!response.ok) {
        setMessage('처리 결과를 확인하지 못했습니다. 같은 사유로 다시 시도해 주세요'); return;
      }
      decisionKeys.current.delete(identity);
      setSelected(await response.json() as Detail);
      try { await loadList(statusFilter); }
      catch { setMessage('결정은 저장됐지만 목록을 새로고침하지 못했습니다'); return; }
      setMessage(decision === 'approve' ? '최종 결정과 모의 환불 결과를 반영했습니다' :
        '클레임을 반려했습니다');
    } catch { setMessage('처리 결과를 확인하지 못했습니다. 같은 사유로 다시 시도해 주세요'); }
    finally { setBusy(false); }
  }

  async function resume() {
    if (!apiOrigin || !selected || selected.status !== 'REFUND_PROCESSING' || busy) return;
    const id = selected.id;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/admin/support/claims/${encodeURIComponent(id)}/refund-resume`, {
        method: 'POST',credentials: 'include',
      });
      if (response.status === 401 || response.status === 403) {
        setState('unauthorized'); return;
      }
      if (response.status === 404) {
        setMessage('요청 또는 로컬 모의 환불 환경을 확인해 주세요'); return;
      }
      if (response.status === 409) {
        setMessage('환불 상태가 변경됐습니다. 상세를 다시 확인해 주세요');
        await loadDetail(id).catch(() => {}); return;
      }
      if (!response.ok) {
        setMessage('환불 결과를 확인하지 못했습니다. 상태를 확인한 뒤 재개해 주세요'); return;
      }
      setSelected(await response.json() as Detail);
      try { await loadList(statusFilter); }
      catch { setMessage('환불 결과는 반영됐지만 목록을 새로고침하지 못했습니다'); return; }
      setMessage('모의 환불 결과를 반영했습니다');
    } catch { setMessage('환불 결과를 확인하지 못했습니다. 상태를 확인한 뒤 재개해 주세요'); }
    finally { setBusy(false); }
  }

  return <main id="main-content" tabIndex={-1} className="shell account-shell">
    <a className="text-link" href="/account">내 계정으로</a>
    <h1>고객지원 클레임 관리</h1>
    {state === 'loading' ? <p role="status">운영자 권한 확인 중</p> : null}
    {state === 'unauthorized' ? <p role="alert">운영자 로그인 후 이용할 수 있습니다</p> : null}
    {state === 'unavailable' ? <p role="alert">고객지원 클레임에 연결할 수 없습니다</p> : null}
    {state === 'ready' ? <AdminSupportClaimsView items={items} selected={selected}
      busy={busy} message={message} statusFilter={statusFilter} nextCursor={nextCursor}
      onFilter={filter} onMore={more} onSelect={select} onDecide={decide}
      onResume={resume} /> : null}
  </main>;
}
