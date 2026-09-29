'use client';

import { useState, type FormEvent } from 'react';

type Role = 'customer' | 'seller' | 'admin';

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export default function LoginPage() {
  const [role, setRole] = useState<Role>('customer');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiOrigin || busy) return;
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    try {
      const response = await fetch(`${apiOrigin}/auth/login`, {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });
      if (!response.ok) {
        setMessage(response.status === 401 ? '계정 정보 또는 권한을 확인해 주세요' : '로그인을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요');
        return;
      }
      window.location.assign('/account');
    } catch {
      setMessage('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="shell account-shell">
      <a className="text-link" href="/">어울몰 홈</a>
      <section className="account-card" aria-labelledby="login-title">
        <p className="eyebrow">어울몰 계정</p>
        <h1 id="login-title">로그인</h1>
        <p>구매자, 판매자, 운영자 계정을 구분해 안전하게 접속합니다</p>
        <form onSubmit={submit} className="account-form">
          <label htmlFor="login-role">접속 역할</label>
          <select id="login-role" name="role" value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="customer">구매자</option>
            <option value="seller">판매자</option>
            <option value="admin">운영자</option>
          </select>
          <label htmlFor="login-email">이메일</label>
          <input id="login-email" name="email" type="email" autoComplete="username" required />
          <label htmlFor="login-password">비밀번호</label>
          <input id="login-password" name="password" type="password" autoComplete="current-password" required />
          {message ? <p role="alert" className="form-error">{message}</p> : null}
          {!apiOrigin ? <p role="status">API 연결 설정이 필요합니다</p> : null}
          <button className="primary-button" type="submit" disabled={busy || !apiOrigin}>
            {busy ? '확인 중' : '로그인'}
          </button>
        </form>
        <p className="account-note">시험 계정은 개발 환경에서만 사용합니다</p>
      </section>
    </main>
  );
}
