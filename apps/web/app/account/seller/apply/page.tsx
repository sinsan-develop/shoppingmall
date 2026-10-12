'use client';

import { useEffect, useState, type FormEvent } from 'react';

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

type ViewState = 'loading' | 'buyer' | 'seller' | 'forbidden' | 'unavailable';
type Application = { id: string; displayName: string; status: 'pending' | 'approved' | 'rejected';
  sellerId: string | null; reviewReason: string | null; createdAt: string; reviewedAt: string | null };

export default function SellerApplyPage() {
  const [state, setState] = useState<ViewState>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [applications, setApplications] = useState<Application[]>([]);

  async function refreshApplications(signal?: AbortSignal) {
    if (!apiOrigin) return false;
    const response = await fetch(`${apiOrigin}/auth/seller-applications`, {
      credentials: 'include', signal,
    });
    if (!response.ok) return false;
    setApplications(await response.json() as Application[]);
    return true;
  }

  useEffect(() => {
    if (!apiOrigin) { setState('unavailable'); return; }
    const controller = new AbortController();
    fetch(`${apiOrigin}/auth/me`, { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) { setState('forbidden'); return; }
        if (!response.ok) { setState('unavailable'); return; }
        const actor = await response.json() as { role: string };
        if (actor.role !== 'customer' && actor.role !== 'seller') { setState('forbidden'); return; }
        if (!await refreshApplications(controller.signal)) { setState('unavailable'); return; }
        setState(actor.role === 'customer' ? 'buyer' : 'seller');
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== 'AbortError') setState('unavailable');
      });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiOrigin || busy || state !== 'buyer' || applications.some((item) => item.status === 'pending')) return;
    const displayName = String(new FormData(event.currentTarget).get('displayName') ?? '').trim();
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/auth/seller-applications`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });
      if (response.ok) {
        await refreshApplications();
        setMessage('판매자 신청을 접수했습니다. 관리자 심사 후 소속 판매자로 로그인할 수 있습니다');
      } else if (response.status === 409) {
        await refreshApplications();
        setMessage('기존 신청이 심사 중이거나 이미 판매자 권한이 있습니다');
      } else if (response.status === 401 || response.status === 403) {
        setState('forbidden'); setMessage('구매자 계정으로 로그인한 뒤 신청해 주세요');
      } else setMessage('신청을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요');
    } catch { setMessage('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요'); }
    finally { setBusy(false); }
  }

  return <SellerApplyView state={state} busy={busy} message={message}
    applications={applications} onSubmit={submit} />;
}

export function SellerApplyView({ state, busy, message, applications, onSubmit }: {
  state: ViewState; busy: boolean; message: string; applications: Application[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return <main id="main-content" tabIndex={-1} className="shell account-shell">
    <a className="text-link" href="/account">내 계정으로 돌아가기</a>
    <section className="account-card" aria-labelledby="seller-apply-title">
      <p className="eyebrow">어울몰 판매자</p><h1 id="seller-apply-title">판매자 신청</h1>
      <p>구매자 계정으로 신청한 뒤, 관리자가 등록된 판매자와 소속을 확인해 승인합니다</p>
      {state === 'loading' ? <p role="status">계정을 확인하는 중입니다</p> : null}
      {state === 'forbidden' ? <p role="alert">구매자 계정으로 로그인해 주세요. <a className="text-link" href="/login">로그인</a></p> : null}
      {state === 'unavailable' ? <p role="alert">계정 정보를 확인할 수 없습니다</p> : null}
      {state === 'seller' ? <p role="status">판매자 권한이 확인되었습니다. <a className="text-link" href="/account/seller/products">판매자 화면</a></p> : null}
      {applications.map((item) => <p key={item.id} role="status">
        {item.displayName}: {item.status === 'pending' ? '심사 대기' :
          item.status === 'approved' ? '승인' : '반려'}
        {item.status === 'rejected' && item.reviewReason ? ` — ${item.reviewReason}` : ''}
      </p>)}
      {state === 'buyer' && !applications.some((item) => item.status === 'pending' || item.status === 'approved') ? <form className="account-form" onSubmit={onSubmit}>
        <label htmlFor="seller-display-name">신청 판매자 이름</label>
        <input id="seller-display-name" name="displayName" maxLength={120} required />
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? '접수 중' : '판매자 신청하기'}
        </button>
      </form> : null}
      {message ? <p role="status" className="account-feedback">{message}</p> : null}
      <p className="account-note">신청 상태는 다시 로그인해도 여기서 확인할 수 있습니다</p>
    </section>
  </main>;
}
