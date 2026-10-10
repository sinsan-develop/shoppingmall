'use client';

import { useEffect, useState, type FormEvent } from 'react';

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export default function SignupPage() {
  const [token, setToken] = useState('');
  const [phase, setPhase] = useState<'request' | 'confirm' | 'done'>('request');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    function readLink() {
      const fragment = window.location.hash;
      if (!fragment) return;
      const received = new URLSearchParams(fragment.slice(1)).get('token') ?? '';
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      if (received) { setToken(received); setPhase('confirm'); }
    }
    readLink();
    window.addEventListener('hashchange', readLink);
    return () => window.removeEventListener('hashchange', readLink);
  }, []);

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiOrigin || busy) return;
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/auth/customer-signup/start`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setMessage(response.ok
        ? '가입 가능한 이메일이라면 확인 링크를 보내드립니다. 메일함을 확인해 주세요'
        : '지금은 확인 링크를 보낼 수 없습니다. 잠시 후 다시 시도해 주세요');
    } catch { setMessage('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요'); }
    finally { setBusy(false); }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiOrigin || !token || busy) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const repeated = String(form.get('repeat') ?? '');
    if (password !== repeated) { setMessage('비밀번호가 일치하지 않습니다'); return; }
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/auth/customer-signup/complete`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (response.ok) {
        setToken(''); setPhase('done'); setMessage('가입되었습니다. 설정한 비밀번호로 로그인해 주세요');
      } else if (response.status === 401) {
        setToken(''); setPhase('request'); setMessage('확인 링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요');
      } else setMessage('가입을 마치지 못했습니다. 잠시 후 다시 시도해 주세요');
    } catch { setMessage('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요'); }
    finally { setBusy(false); }
  }

  return <main id="main-content" tabIndex={-1} className="shell account-shell">
    <a className="text-link" href="/login">로그인으로 돌아가기</a>
    <section className="account-card" aria-labelledby="signup-title">
      <p className="eyebrow">어울몰 계정</p><h1 id="signup-title">가입하기</h1>
      <p>이메일을 확인한 뒤 구매자 계정의 비밀번호를 설정합니다. 판매자 신청은 가입 후 별도로 진행합니다</p>
      {phase === 'request' ? <form className="account-form" onSubmit={requestLink}>
        <label htmlFor="signup-email">이메일</label>
        <input id="signup-email" name="email" type="email" autoComplete="email" required />
        <button className="primary-button" type="submit" disabled={busy || !apiOrigin}>
          {busy ? '요청 중' : '확인 링크 요청'}
        </button>
      </form> : null}
      {phase === 'confirm' ? <form className="account-form" onSubmit={confirm}>
        <label htmlFor="signup-password">비밀번호(12자 이상)</label>
        <input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={12} required />
        <label htmlFor="signup-repeat">비밀번호 확인</label>
        <input id="signup-repeat" name="repeat" type="password" autoComplete="new-password" minLength={12} required />
        <button className="primary-button" type="submit" disabled={busy || !apiOrigin}>
          {busy ? '확인 중' : '구매자 가입'}
        </button>
      </form> : null}
      {message ? <p role="status" className="account-feedback">{message}</p> : null}
      {!apiOrigin ? <p role="alert">API 연결 설정이 필요합니다</p> : null}
      {phase === 'done' ? <a className="text-link" href="/login">로그인하기</a> : null}
    </section>
  </main>;
}
