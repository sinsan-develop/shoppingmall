'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ShippingFields, ShippingSummary, readShippingFields, type ShippingPolicy } from '../../shipping-fields';

type Locks = { feeWon: boolean; freeThresholdWon: boolean; cutoffTime: boolean };
type Global = { policy: ShippingPolicy; locks: Locks };
type Pending = { id: string; sellerId: string; sellerName: string; policy: ShippingPolicy; requestedAt: string };
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export function AdminShippingView({ global, requests, busy, onSaveGlobal, onApprove, onReject }: {
  global: Global; requests: Pending[]; busy: boolean;
  onSaveGlobal: (policy: ShippingPolicy, locks: Locks) => void;
  onApprove: (requestId: string) => void; onReject: (requestId: string, reason: string) => void;
}) {
  const [inputError, setInputError] = useState('');
  function saveGlobal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setInputError('');
    try {
      const policy = readShippingFields(event.currentTarget);
      const data = new FormData(event.currentTarget);
      onSaveGlobal(policy, { feeWon: data.has('lockedFee'),
        freeThresholdWon: data.has('lockedThreshold'), cutoffTime: data.has('lockedCutoff') });
    } catch (error) { setInputError(error instanceof Error ? error.message : '입력값을 확인해 주세요'); }
  }
  return <div className="catalog-admin-grid">
    <section className="account-card profile-card">
      <h2>관리자 전역 정책</h2>
      <ShippingSummary policy={global.policy} />
      <p>관리자 배송 불가 지역은 판매자 정책으로 해제할 수 없습니다. 잠근 항목은 판매자 승인값보다 우선합니다</p>
      <form className="account-form" onSubmit={saveGlobal}>
        <ShippingFields key={JSON.stringify(global.policy)} policy={global.policy} prefix="admin-shipping" />
        <fieldset>
          <legend>관리자 우선 적용</legend>
          <label><input type="checkbox" name="lockedFee" defaultChecked={global.locks.feeWon} /> 배송비</label>
          <label><input type="checkbox" name="lockedThreshold" defaultChecked={global.locks.freeThresholdWon} /> 무료배송 기준</label>
          <label><input type="checkbox" name="lockedCutoff" defaultChecked={global.locks.cutoffTime} /> 출고 마감</label>
        </fieldset>
        <button type="submit" className="primary-button" disabled={busy}>전역 정책 저장</button>
      </form>
      {inputError ? <p role="alert">{inputError}</p> : null}
    </section>
    <section className="account-card profile-card">
      <h2>판매자 변경 요청</h2>
      {requests.length === 0 ? <p>승인 대기 요청이 없습니다</p> : <ul className="catalog-list">
        {requests.map((item) => <li key={item.id} className="draft-product-item">
          <strong>{item.sellerName}</strong> · 승인 대기
          <ShippingSummary policy={item.policy} />
          <button type="button" className="primary-button" disabled={busy}
            onClick={() => onApprove(item.id)}>승인</button>
          <form className="account-form" onSubmit={(event) => {
            event.preventDefault();
            const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
            if (reason) onReject(item.id, reason);
          }}>
            <label htmlFor={`shipping-reason-${item.id}`}>반려 사유</label>
            <textarea id={`shipping-reason-${item.id}`} name="reason" required maxLength={500} rows={2} />
            <button type="submit" className="secondary-button" disabled={busy}>반려</button>
          </form>
        </li>)}
      </ul>}
    </section>
  </div>;
}

export default function AdminShippingPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'unavailable'>('loading');
  const [global, setGlobal] = useState<Global>();
  const [requests, setRequests] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function reload(signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const [globalResponse, requestsResponse] = await Promise.all([
      fetch(`${apiOrigin}/shipping/admin/global`, { credentials: 'include', signal }),
      fetch(`${apiOrigin}/shipping/admin/requests`, { credentials: 'include', signal }),
    ]);
    if (!globalResponse.ok || !requestsResponse.ok) throw new Error('Shipping policy unavailable');
    setGlobal(await globalResponse.json() as Global);
    setRequests(await requestsResponse.json() as Pending[]);
  }

  useEffect(() => {
    if (!apiOrigin) { setState('unavailable'); return; }
    const controller = new AbortController();
    async function load() {
      const response = await fetch(`${apiOrigin}/auth/me`, { credentials: 'include', signal: controller.signal });
      if (!response.ok) { setState(response.status === 401 ? 'unauthorized' : 'unavailable'); return; }
      if ((await response.json() as { role: string }).role !== 'admin') { setState('unauthorized'); return; }
      await reload(controller.signal);
      setState('ready');
    }
    load().catch((error: unknown) => {
      if (error instanceof Error && error.name !== 'AbortError') setState('unavailable');
    });
    return () => controller.abort();
  }, []);

  async function saveGlobal(policy: ShippingPolicy, locks: Locks) {
    if (!apiOrigin || busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/shipping/admin/global`, {
        method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ policy, locks }),
      });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (!response.ok) { setMessage('전역 정책을 저장하지 못했습니다. 입력값을 확인해 주세요'); return; }
      await reload(); setMessage('관리자 전역 정책과 적용 이력을 저장했습니다');
    } catch { setMessage('배송 정책 서버에 연결할 수 없습니다'); }
    finally { setBusy(false); }
  }

  async function decide(requestId: string, decision: 'approve' | 'reject', reason?: string) {
    if (!apiOrigin || busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/shipping/admin/requests/${requestId}/${decision}`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(decision === 'reject' ? { reason } : {}),
      });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (!response.ok) { setMessage('요청을 처리하지 못했습니다. 요청 상태와 사유를 확인해 주세요'); return; }
      await reload(); setMessage(decision === 'approve' ? '승인된 판매자 정책을 반영했습니다' : '반려 사유를 기록했습니다');
    } catch { setMessage('배송 정책 서버에 연결할 수 없습니다'); }
    finally { setBusy(false); }
  }

  return <main className="shell account-shell">
    <a className="text-link" href="/account">내 계정으로</a>
    <h1>배송 정책 관리</h1>
    {state === 'loading' ? <p role="status">운영자 권한 확인 중</p> : null}
    {state === 'unauthorized' ? <p role="alert">운영자 로그인 후 이용할 수 있습니다</p> : null}
    {state === 'unavailable' ? <p role="alert">배송 정책을 불러올 수 없습니다</p> : null}
    {state === 'ready' && global ? <><AdminShippingView global={global} requests={requests} busy={busy}
      onSaveGlobal={saveGlobal} onApprove={(id) => void decide(id, 'approve')}
      onReject={(id, reason) => void decide(id, 'reject', reason)} />
      {message ? <p role="status">{message}</p> : null}</> : null}
  </main>;
}
