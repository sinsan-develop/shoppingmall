'use client';

import { useEffect, useState, type FormEvent } from 'react';

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

type Application = { id: string; accountId: string; displayName: string;
  status: 'pending' | 'approved' | 'rejected'; sellerId: string | null; reviewReason: string | null };
type Seller = { id: string; displayName: string };

export default function AdminSellerApplicationsPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'unavailable'>('loading');
  const [applications, setApplications] = useState<Application[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!apiOrigin) { setState('unavailable'); return; }
    const controller = new AbortController();
    async function load() {
      const me = await fetch(`${apiOrigin}/auth/me`, { credentials: 'include', signal: controller.signal });
      if (!me.ok) { setState(me.status === 401 ? 'forbidden' : 'unavailable'); return; }
      const actor = await me.json() as { role: string };
      if (actor.role !== 'admin') { setState('forbidden'); return; }
      const [applicationsResponse, sellersResponse] = await Promise.all([
        fetch(`${apiOrigin}/auth/admin/seller-applications`, { credentials: 'include', signal: controller.signal }),
        fetch(`${apiOrigin}/catalog/sellers`, { credentials: 'include', signal: controller.signal }),
      ]);
      if (!applicationsResponse.ok || !sellersResponse.ok) { setState('unavailable'); return; }
      const [applicationData, sellerData] = await Promise.all([
        applicationsResponse.json() as Promise<Application[]>, sellersResponse.json() as Promise<Seller[]>,
      ]);
      setApplications(applicationData); setSellers(sellerData); setState('ready');
    }
    load().catch((error: unknown) => {
      if (error instanceof Error && error.name !== 'AbortError') setState('unavailable');
    });
    return () => controller.abort();
  }, []);

  async function review(event: FormEvent<HTMLFormElement>, id: string, decision: 'approve' | 'reject') {
    event.preventDefault();
    if (!apiOrigin || busyId) return;
    const data = new FormData(event.currentTarget);
    const payload = decision === 'approve'
      ? { sellerId: String(data.get('sellerId') ?? '') }
      : { reason: String(data.get('reason') ?? '').trim() };
    setBusyId(id); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/auth/admin/seller-applications/${id}/${decision}`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setMessage(response.status === 409 ? '이미 심사된 신청입니다. 목록을 다시 확인해 주세요'
          : '심사를 반영하지 못했습니다. 판매자와 권한을 확인해 주세요');
        return;
      }
      const current = await fetch(`${apiOrigin}/auth/admin/seller-applications`, { credentials: 'include' });
      if (!current.ok) throw new Error('Application list unavailable');
      setApplications(await current.json() as Application[]);
      setMessage(decision === 'approve' ? '판매자 소속을 승인했습니다' : '반려 사유를 기록했습니다');
    } catch { setMessage('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요'); }
    finally { setBusyId(''); }
  }

  return <main id="main-content" tabIndex={-1} className="shell account-shell">
    <a className="text-link" href="/account">내 계정으로 돌아가기</a>
    <section className="account-card account-wide" aria-labelledby="review-title">
      <p className="eyebrow">어울몰 운영자</p><h1 id="review-title">판매자 신청 심사</h1>
      <p>기존에 등록한 판매자와 신청 계정을 연결한 뒤에만 판매자 권한이 부여됩니다</p>
      {state === 'loading' ? <p role="status">신청을 확인하는 중입니다</p> : null}
      {state === 'forbidden' ? <p role="alert">운영자 로그인이 필요합니다. <a className="text-link" href="/login">로그인</a></p> : null}
      {state === 'unavailable' ? <p role="alert">신청 자료를 불러오지 못했습니다</p> : null}
      {message ? <p role="status" className="account-feedback">{message}</p> : null}
      {state === 'ready' && applications.length === 0 ? <p>접수된 신청이 없습니다</p> : null}
      {state === 'ready' ? <ul className="seller-review-list">{applications.map((item) =>
        <li key={item.id} className="seller-review-item">
          <h2>{item.displayName}</h2>
          <p>상태: {item.status === 'pending' ? '심사 대기' : item.status === 'approved' ? '승인' : '반려'}</p>
          {item.status === 'approved' ? <p>연결 판매자: {sellers.find((seller) => seller.id === item.sellerId)?.displayName ?? item.sellerId}</p> : null}
          {item.status === 'rejected' ? <p>반려 사유: {item.reviewReason}</p> : null}
          {item.status === 'pending' ? <div className="seller-review-actions">
            <form className="account-form" onSubmit={(event) => review(event, item.id, 'approve')}>
              <label htmlFor={`approve-${item.id}`}>연결할 등록 판매자</label>
              <select id={`approve-${item.id}`} name="sellerId" required defaultValue="">
                <option value="" disabled>판매자 선택</option>
                {sellers.map((seller) => <option value={seller.id} key={seller.id}>{seller.displayName}</option>)}
              </select>
              <button className="primary-button" type="submit" disabled={!!busyId || sellers.length === 0}>승인</button>
            </form>
            <form className="account-form" onSubmit={(event) => review(event, item.id, 'reject')}>
              <label htmlFor={`reject-${item.id}`}>반려 사유</label>
              <input id={`reject-${item.id}`} name="reason" maxLength={500} required />
              <button className="secondary-button" type="submit" disabled={!!busyId}>반려</button>
            </form>
          </div> : null}
        </li>)}</ul> : null}
      {state === 'ready' && sellers.length === 0 ? <p>승인 전 <a className="text-link" href="/account/admin/catalog">판매자를 먼저 등록해 주세요</a></p> : null}
    </section>
  </main>;
}
