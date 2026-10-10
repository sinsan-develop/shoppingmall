'use client';

import { useState, type FormEvent } from 'react';

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export default function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiOrigin || busy) return;
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/auth/password-reset/start`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setMessage(response.ok
        ? '등록되고 확인된 이메일이라면 재설정 링크를 보내드립니다. 메일함을 확인해 주세요'
        : '지금은 재설정 링크를 보낼 수 없습니다. 잠시 후 다시 시도해 주세요');
    } catch { setMessage('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요'); }
    finally { setBusy(false); }
  }

  return <main id="main-content" tabIndex={-1} className="shell account-shell">
    <a className="text-link" href="/login">로그인으로 돌아가기</a>
    <section className="account-card" aria-labelledby="forgot-title">
      <p className="eyebrow">어울몰 계정</p><h1 id="forgot-title">비밀번호 찾기</h1>
      <p>가입할 때 확인한 이메일로 30분 동안 사용할 수 있는 링크를 요청합니다</p>
      <form className="account-form" onSubmit={submit}>
        <label htmlFor="forgot-email">이메일</label>
        <input id="forgot-email" name="email" type="email" autoComplete="email" required />
        <button className="primary-button" type="submit" disabled={busy || !apiOrigin}>
          {busy ? '요청 중' : '재설정 링크 요청'}
        </button>
      </form>
      {message ? <p role="status" className="account-feedback">{message}</p> : null}
      {!apiOrigin ? <p role="alert">API 연결 설정이 필요합니다</p> : null}
    </section>
  </main>;
}
