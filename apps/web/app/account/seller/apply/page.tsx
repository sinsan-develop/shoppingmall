'use client';

import { useEffect, useState, type FormEvent } from 'react';

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

type ViewState = 'loading' | 'buyer' | 'seller' | 'forbidden' | 'unavailable' | 'pending';

export default function SellerApplyPage() {
  const [state, setState] = useState<ViewState>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!apiOrigin) { setState('unavailable'); return; }
    const controller = new AbortController();
    fetch(`${apiOrigin}/auth/me`, { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) { setState('forbidden'); return; }
        if (!response.ok) { setState('unavailable'); return; }
        const actor = await response.json() as { role: string };
        setState(actor.role === 'customer' ? 'buyer' : actor.role === 'seller' ? 'seller' : 'forbidden');
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== 'AbortError') setState('unavailable');
      });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiOrigin || busy || state !== 'buyer') return;
    const displayName = String(new FormData(event.currentTarget).get('displayName') ?? '').trim();
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/auth/seller-applications`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });
      if (response.ok) {
        setState('pending'); setMessage('판매자 신청을 접수했습니다. 관리자 심사 후 소속 판매자로 로그인할 수 있습니다');
      } else if (response.status === 409) {
        setState('pending'); setMessage('기존 신청이 심사 중이거나 이미 판매자 권한이 있습니다');
      } else if (response.status === 401 || response.status === 403) {
        setState('forbidden'); setMessage('구매자 계정으로 로그인한 뒤 신청해 주세요');
      } else setMessage('신청을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요');
    } catch { setMessage('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요'); }
    finally { setBusy(false); }
  }

  return <main id="main-content" tabIndex={-1} className="shell account-shell">
    <a className="text-link" href="/account">내 계정으로 돌아가기</a>
    <section className="account-card" aria-labelledby="seller-apply-title">
      <p className="eyebrow">어울몰 판매자</p><h1 id="seller-apply-title">판매자 신청</h1>
      <p>구매자 계정으로 신청한 뒤, 관리자가 등록된 판매자와 소속을 확인해 승인합니다</p>
      {state === 'loading' ? <p role="status">계정을 확인하는 중입니다</p> : null}
      {state === 'forbidden' ? <p role="alert">구매자 계정으로 로그인해 주세요. <a className="text-link" href="/login">로그인</a></p> : null}
      {state === 'unavailable' ? <p role="alert">계정 정보를 확인할 수 없습니다</p> : null}
      {state === 'seller' ? <p role="status">판매자 권한이 확인되었습니다. <a className="text-link" href="/account/seller/products">판매자 화면</a></p> : null}
      {state === 'pending' ? <p role="status">신청 상태: 심사 대기</p> : null}
      {state === 'buyer' ? <form className="account-form" onSubmit={submit}>
        <label htmlFor="seller-display-name">신청 판매자 이름</label>
        <input id="seller-display-name" name="displayName" maxLength={120} required />
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? '접수 중' : '판매자 신청하기'}
        </button>
      </form> : null}
      {message ? <p role="status" className="account-feedback">{message}</p> : null}
      <p className="account-note">반려 사유는 관리자 확인 후 고객지원으로 문의해 주세요</p>
    </section>
  </main>;
}
