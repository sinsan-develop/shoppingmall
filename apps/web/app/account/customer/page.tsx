'use client';

import { useEffect, useState, type FormEvent } from 'react';

type Address = {
  id: string; label: string; recipientName: string; phone: string;
  postalCode: string; line1: string; line2: string; isDefault: boolean;
};
type Preferences = { marketingEmail: boolean; marketingSms: boolean; push: boolean };

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

function maskedPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 4 ? `***-***-${digits.slice(-4)}` : '***';
}

export default function CustomerProfilePage() {
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'unavailable'>('loading');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({ marketingEmail: false, marketingSms: false, push: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!apiOrigin) { setState('unavailable'); return; }
    const controller = new AbortController();
    const options = { credentials: 'include' as const, signal: controller.signal };
    async function load() {
      const me = await fetch(`${apiOrigin}/auth/me`, options);
      if (!me.ok) { setState(me.status === 401 ? 'unauthorized' : 'unavailable'); return; }
      const actor = await me.json() as { role: string };
      if (actor.role !== 'customer') { setState('unauthorized'); return; }
      const [addressResponse, preferenceResponse] = await Promise.all([
        fetch(`${apiOrigin}/customer/addresses`, options),
        fetch(`${apiOrigin}/customer/preferences`, options),
      ]);
      if (!addressResponse.ok || !preferenceResponse.ok) { setState('unavailable'); return; }
      setAddresses(await addressResponse.json() as Address[]);
      setPreferences(await preferenceResponse.json() as Preferences);
      setState('ready');
    }
    load().catch((error: unknown) => {
      if (error instanceof Error && error.name !== 'AbortError') setState('unavailable');
    });
    return () => controller.abort();
  }, []);

  async function addAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiOrigin || busy) return;
    setBusy(true);
    setMessage('');
    const form = event.currentTarget;
    const fields = new FormData(form);
    const payload = {
      label: String(fields.get('label') ?? ''), recipientName: String(fields.get('recipientName') ?? ''),
      phone: String(fields.get('phone') ?? ''), postalCode: String(fields.get('postalCode') ?? ''),
      line1: String(fields.get('line1') ?? ''), line2: String(fields.get('line2') ?? ''),
      isDefault: fields.get('isDefault') === 'on',
    };
    try {
      const response = await fetch(`${apiOrigin}/customer/addresses`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) { setMessage('배송지를 저장하지 못했습니다. 입력값을 확인해 주세요'); return; }
      const refreshed = await fetch(`${apiOrigin}/customer/addresses`, { credentials: 'include' });
      if (!refreshed.ok) { setMessage('저장되었지만 목록을 새로고침하지 못했습니다'); return; }
      setAddresses(await refreshed.json() as Address[]);
      form.reset();
      setMessage('배송지를 저장했습니다');
    } catch {
      setMessage('서버에 연결할 수 없습니다');
    } finally {
      setBusy(false);
    }
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiOrigin || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/customer/preferences`, {
        method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(preferences),
      });
      setMessage(response.ok ? '수신 설정을 저장했습니다' : '수신 설정을 저장하지 못했습니다');
    } catch {
      setMessage('서버에 연결할 수 없습니다');
    } finally {
      setBusy(false);
    }
  }

  async function requestDeletion() {
    if (!apiOrigin || busy || !window.confirm('탈퇴 요청을 접수할까요? 실제 계정 삭제는 운영 검토 후 진행됩니다.')) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/customer/deletion-request`, {
        method: 'POST', credentials: 'include',
      });
      setMessage(response.ok ? '탈퇴 요청이 접수되었습니다. 계정은 아직 삭제되지 않았습니다'
        : response.status === 409 ? '이미 접수된 탈퇴 요청이 있습니다' : '탈퇴 요청을 접수하지 못했습니다');
    } catch {
      setMessage('서버에 연결할 수 없습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell account-shell">
      <a className="text-link" href="/account">내 계정으로</a>
      <h1>배송지와 알림 설정</h1>
      {state === 'loading' ? <p role="status">고객 정보 확인 중</p> : null}
      {state === 'unauthorized' ? <p role="alert">구매자 로그인 후 이용할 수 있습니다</p> : null}
      {state === 'unavailable' ? <p role="alert">고객 정보를 불러올 수 없습니다</p> : null}
      {state === 'ready' ? (
        <div className="profile-grid">
          <section className="account-card profile-card" aria-labelledby="address-title">
            <h2 id="address-title">배송지</h2>
            {addresses.length === 0 ? <p>저장된 배송지가 없습니다</p> : (
              <ul className="address-list">{addresses.map((item) => (
                <li key={item.id}><strong>{item.label}{item.isDefault ? ' · 기본' : ''}</strong><br />
                  {item.recipientName} · {maskedPhone(item.phone)}<br />{item.postalCode} {item.line1} {item.line2}</li>
              ))}</ul>
            )}
            <form className="account-form" onSubmit={addAddress}>
              <label htmlFor="address-label">배송지 이름</label><input id="address-label" name="label" required maxLength={40} />
              <label htmlFor="recipient-name">받는 분</label><input id="recipient-name" name="recipientName" required maxLength={80} />
              <label htmlFor="recipient-phone">연락처</label><input id="recipient-phone" name="phone" type="tel" required maxLength={20} />
              <label htmlFor="postal-code">우편번호</label><input id="postal-code" name="postalCode" inputMode="numeric" pattern="[0-9]{5}" required />
              <label htmlFor="address-line1">기본 주소</label><input id="address-line1" name="line1" required maxLength={200} />
              <label htmlFor="address-line2">상세 주소</label><input id="address-line2" name="line2" maxLength={200} />
              <label className="check-row"><input name="isDefault" type="checkbox" /> 기본 배송지로 설정</label>
              <button className="primary-button" type="submit" disabled={busy}>배송지 저장</button>
            </form>
          </section>
          <div>
            <section className="account-card profile-card" aria-labelledby="consent-title">
              <h2 id="consent-title">알림 수신 설정</h2>
              <p>마케팅 알림은 기본적으로 수신하지 않습니다</p>
              <form className="account-form" onSubmit={savePreferences}>
                <label className="check-row"><input type="checkbox" checked={preferences.marketingEmail} onChange={(event) => setPreferences({ ...preferences, marketingEmail: event.target.checked })} /> 이메일 마케팅</label>
                <label className="check-row"><input type="checkbox" checked={preferences.marketingSms} onChange={(event) => setPreferences({ ...preferences, marketingSms: event.target.checked })} /> 문자 마케팅</label>
                <label className="check-row"><input type="checkbox" checked={preferences.push} onChange={(event) => setPreferences({ ...preferences, push: event.target.checked })} /> 앱 푸시</label>
                <button className="primary-button" type="submit" disabled={busy}>수신 설정 저장</button>
              </form>
            </section>
            <section className="account-card profile-card" aria-labelledby="deletion-title">
              <h2 id="deletion-title">탈퇴 요청</h2>
              <p>요청을 접수해 운영자가 검토합니다. 이 단계에서 계정이 즉시 삭제되지는 않습니다</p>
              <button className="primary-button" type="button" disabled={busy} onClick={requestDeletion}>탈퇴 요청 접수</button>
            </section>
          </div>
          {message ? <p role="status" className="profile-message">{message}</p> : null}
        </div>
      ) : null}
    </main>
  );
}
