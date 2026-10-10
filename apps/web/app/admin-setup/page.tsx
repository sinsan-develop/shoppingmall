'use client';

import { useEffect, useState, type FormEvent } from 'react';

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export default function AdminSetupPage() {
  const [token, setToken] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'done'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    function readLink() {
      const fragment = window.location.hash;
      const received = new URLSearchParams(fragment.slice(1)).get('token') ?? '';
      if (fragment) window.history.replaceState(null, '', window.location.pathname + window.location.search);
      if (received) { setToken(received); setState('ready'); }
      else setState('missing');
    }
    readLink();
    window.addEventListener('hashchange', readLink);
    return () => window.removeEventListener('hashchange', readLink);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiOrigin || !token || busy) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password !== String(form.get('repeat') ?? '')) {
      setMessage('비밀번호가 일치하지 않습니다'); return;
    }
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/auth/admin-setup/complete`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (response.ok) {
        setToken(''); setState('done'); setMessage('관리자 비밀번호를 설정했습니다. 운영자 역할로 로그인해 주세요');
      } else if (response.status === 401) {
        setToken(''); setState('missing'); setMessage('설정 링크가 만료되었거나 이미 사용되었습니다');
      } else setMessage('설정을 마치지 못했습니다. 잠시 후 다시 시도해 주세요');
    } catch { setMessage('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요'); }
    finally { setBusy(false); }
  }

  return <main id="main-content" tabIndex={-1} className="shell account-shell">
    <a className="text-link" href="/login">로그인으로 돌아가기</a>
    <section className="account-card" aria-labelledby="admin-setup-title">
      <p className="eyebrow">어울몰 운영자 계정</p><h1 id="admin-setup-title">관리자 첫 비밀번호 설정</h1>
      <p>운영 담당자가 사전에 지정한 이메일의 소유자만 30분·1회용 링크로 설정할 수 있습니다</p>
      {state === 'loading' ? <p role="status">설정 링크를 읽는 중입니다</p> : null}
      {state === 'missing' ? <p role="alert">유효한 링크가 없습니다. 운영 담당자에게 소유 확인과 재발급을 요청해 주세요</p> : null}
      {state !== 'done' ? <form className="account-form" onSubmit={submit}>
        <label htmlFor="admin-setup-password">새 비밀번호(12자 이상)</label>
        <input id="admin-setup-password" name="password" type="password" autoComplete="new-password"
          minLength={12} required disabled={state !== 'ready'} />
        <label htmlFor="admin-setup-repeat">새 비밀번호 확인</label>
        <input id="admin-setup-repeat" name="repeat" type="password" autoComplete="new-password"
          minLength={12} required disabled={state !== 'ready'} />
        <button className="primary-button" type="submit" disabled={busy || !apiOrigin || state !== 'ready'}>
          {busy ? '설정 중' : '관리자 비밀번호 설정'}
        </button>
      </form> : null}
      {message ? <p role="status" className="account-feedback">{message}</p> : null}
      {!apiOrigin ? <p role="alert">API 연결 설정이 필요합니다</p> : null}
      {state === 'done' ? <a className="text-link" href="/login">운영자로 로그인하기</a> : null}
    </section>
  </main>;
}
