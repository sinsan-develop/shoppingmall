'use client';

import { useEffect, useState, type FormEvent } from 'react';

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'done'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fragment = window.location.hash;
    const received = new URLSearchParams(fragment.slice(1)).get('token') ?? '';
    if (fragment) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (received) { setToken(received); setState('ready'); }
    else setState('missing');
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
      const response = await fetch(`${apiOrigin}/auth/password-reset/complete`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (response.ok) {
        setToken(''); setState('done'); setMessage('비밀번호가 변경되었습니다. 다시 로그인해 주세요');
      } else if (response.status === 401) {
        setToken(''); setState('missing'); setMessage('링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요');
      } else setMessage('변경을 마치지 못했습니다. 잠시 후 다시 시도해 주세요');
    } catch { setMessage('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요'); }
    finally { setBusy(false); }
  }

  return <main id="main-content" tabIndex={-1} className="shell account-shell">
    <a className="text-link" href="/login">로그인으로 돌아가기</a>
    <section className="account-card" aria-labelledby="reset-title">
      <p className="eyebrow">어울몰 계정</p><h1 id="reset-title">새 비밀번호 설정</h1>
      <p>확인 링크는 한 번만 사용할 수 있습니다. 변경 후 기존 로그인은 모두 해제됩니다</p>
      {state === 'loading' ? <p role="status">확인 링크를 읽는 중입니다</p> : null}
      {state === 'missing' ? <p role="alert">유효한 링크가 없습니다. 비밀번호 찾기에서 다시 요청해 주세요</p> : null}
      {state !== 'done' ? <form className="account-form" onSubmit={submit}>
        <label htmlFor="reset-password">새 비밀번호(12자 이상)</label>
        <input id="reset-password" name="password" type="password" autoComplete="new-password" minLength={12}
          required disabled={state !== 'ready'} />
        <label htmlFor="reset-repeat">새 비밀번호 확인</label>
        <input id="reset-repeat" name="repeat" type="password" autoComplete="new-password" minLength={12}
          required disabled={state !== 'ready'} />
        <button className="primary-button" type="submit" disabled={busy || !apiOrigin || state !== 'ready'}>
          {busy ? '변경 중' : '비밀번호 변경'}
        </button>
      </form> : null}
      {message ? <p role="status" className="account-feedback">{message}</p> : null}
      {!apiOrigin ? <p role="alert">API 연결 설정이 필요합니다</p> : null}
      {state === 'missing' ? <a className="text-link" href="/forgot-password">재설정 링크 다시 요청</a> : null}
      {state === 'done' ? <a className="text-link" href="/login">로그인하기</a> : null}
    </section>
  </main>;
}
