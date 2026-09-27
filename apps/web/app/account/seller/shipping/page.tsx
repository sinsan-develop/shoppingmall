'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ShippingFields, ShippingSummary, readShippingFields, type ShippingPolicy } from '../../shipping-fields';

type Request = { id: string; status: string; policy: ShippingPolicy; requestedAt: string;
  decidedAt: string | null; decisionReason: string | null };
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export function SellerShippingView({ policy, requests, busy, onRequest }: {
  policy: ShippingPolicy; requests: Request[]; busy: boolean; onRequest: (policy: ShippingPolicy) => void;
}) {
  const [inputError, setInputError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInputError('');
    try { onRequest(readShippingFields(event.currentTarget)); }
    catch (error) { setInputError(error instanceof Error ? error.message : '입력값을 확인해 주세요'); }
  }
  return <div className="catalog-admin-grid">
    <section className="account-card profile-card">
      <h2>현재 적용 배송 정책</h2>
      <ShippingSummary policy={policy} />
      <p>판매자별 발송 주문에 적용됩니다. 무료배송은 할인 적용 전 상품금액 기준입니다</p>
    </section>
    <section className="account-card profile-card">
      <h2>배송 정책 변경 요청</h2>
      <p>제출한 변경은 운영자 승인 전까지 고객 화면과 주문 금액에 반영되지 않습니다</p>
      <form className="account-form" onSubmit={submit}>
        <ShippingFields key={JSON.stringify(policy)} policy={policy} prefix="seller-shipping" />
        <button type="submit" className="primary-button" disabled={busy}>변경 요청 보내기</button>
      </form>
      {inputError ? <p role="alert">{inputError}</p> : null}
    </section>
    <section className="account-card profile-card">
      <h2>요청 이력</h2>
      {requests.length === 0 ? <p>아직 변경 요청이 없습니다</p> : <ul className="catalog-list">
        {requests.map((item) => <li key={item.id} className="draft-product-item">
          <strong>{item.status === 'pending' ? '승인 대기' : item.status === 'approved' ? '승인 완료' : '반려'}</strong>
          <ShippingSummary policy={item.policy} />
          {item.decisionReason ? <p>반려 사유: {item.decisionReason}</p> : null}
        </li>)}
      </ul>}
    </section>
  </div>;
}

export default function SellerShippingPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'unavailable'>('loading');
  const [policy, setPolicy] = useState<ShippingPolicy>();
  const [requests, setRequests] = useState<Request[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function reload(signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const [current, history] = await Promise.all([
      fetch(`${apiOrigin}/shipping/seller/policy`, { credentials: 'include', signal }),
      fetch(`${apiOrigin}/shipping/seller/requests`, { credentials: 'include', signal }),
    ]);
    if (!current.ok || !history.ok) throw new Error('Shipping policy unavailable');
    setPolicy((await current.json() as { policy: ShippingPolicy }).policy);
    setRequests(await history.json() as Request[]);
  }

  useEffect(() => {
    if (!apiOrigin) { setState('unavailable'); return; }
    const controller = new AbortController();
    async function load() {
      const response = await fetch(`${apiOrigin}/auth/me`, { credentials: 'include', signal: controller.signal });
      if (!response.ok) { setState(response.status === 401 ? 'unauthorized' : 'unavailable'); return; }
      if ((await response.json() as { role: string }).role !== 'seller') { setState('unauthorized'); return; }
      await reload(controller.signal);
      setState('ready');
    }
    load().catch((error: unknown) => {
      if (error instanceof Error && error.name !== 'AbortError') setState('unavailable');
    });
    return () => controller.abort();
  }, []);

  async function requestChange(next: ShippingPolicy) {
    if (!apiOrigin || busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/shipping/seller/requests`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ policy: next }),
      });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (!response.ok) { setMessage('변경 요청을 등록하지 못했습니다. 입력값과 기존 승인 대기 요청을 확인해 주세요'); return; }
      await reload();
      setMessage('변경 요청을 등록했습니다. 운영자 승인 전에는 현재 정책이 유지됩니다');
    } catch { setMessage('배송 정책 서버에 연결할 수 없습니다'); }
    finally { setBusy(false); }
  }

  return <main className="shell account-shell">
    <a className="text-link" href="/account">내 계정으로</a>
    <h1>판매자 배송 정책</h1>
    {state === 'loading' ? <p role="status">판매자 권한 확인 중</p> : null}
    {state === 'unauthorized' ? <p role="alert">판매자 로그인 후 이용할 수 있습니다</p> : null}
    {state === 'unavailable' ? <p role="alert">배송 정책을 불러올 수 없습니다</p> : null}
    {state === 'ready' && policy ? <><SellerShippingView policy={policy} requests={requests} busy={busy}
      onRequest={requestChange} />{message ? <p role="status">{message}</p> : null}</> : null}
  </main>;
}
