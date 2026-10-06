'use client';

import { useEffect, useState } from 'react';

type Session = { accountId: string; role: 'customer' | 'seller' | 'admin'; sellerId?: string };
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export function AccountRoleLinks({ role }: { role: Session['role'] }) {
  if (role === 'seller') return <nav className="account-role-links" aria-label="판매자 메뉴">
    <a className="secondary-button" href="/account/seller/products">상품 초안 등록</a>
    <a className="secondary-button" href="/account/seller/shipping">배송 정책 변경 요청</a>
    <a className="primary-button" href="/account/seller/orders">주문·출고 관리</a>
  </nav>;
  if (role === 'admin') return <nav className="account-role-links" aria-label="운영자 메뉴">
    <a className="secondary-button" href="/account/admin/catalog">분류·판매자 등록</a>
    <a className="secondary-button" href="/account/admin/proposals">상품 요청 검토</a>
    <a className="secondary-button" href="/account/admin/shipping">배송 정책 관리</a>
    <a className="secondary-button" href="/account/admin/home">홈 전시 관리</a>
    <a className="secondary-button" href="/account/admin/promotions">프로모션 관리</a>
    <a className="secondary-button" href="/account/admin/refunds">취소·환불 관리</a>
    <a className="primary-button" href="/account/admin/fulfillment">출고 운영 관리</a>
  </nav>;
  return <nav className="account-role-links" aria-label="구매자 메뉴">
    <a className="primary-button" href="/account/customer">찜·재입고·배송지·주문·알림 설정</a>
  </nav>;
}

export default function AccountPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<'loading' | 'unauthorized' | 'ready' | 'unavailable'>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!apiOrigin) {
      setState('unavailable');
      return;
    }
    const controller = new AbortController();
    fetch(`${apiOrigin}/auth/me`, { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) { setState('unauthorized'); return; }
        if (!response.ok) { setState('unavailable'); return; }
        setSession(await response.json() as Session);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== 'AbortError') setState('unavailable');
      });
    return () => controller.abort();
  }, []);

  async function logout() {
    if (!apiOrigin || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`${apiOrigin}/auth/logout`, { method: 'POST', credentials: 'include' });
      if (response.ok) window.location.assign('/login');
      else setState('unavailable');
    } catch {
      setState('unavailable');
    } finally {
      setBusy(false);
    }
  }

  const roleLabel = session?.role === 'customer' ? '구매자'
    : session?.role === 'seller' ? '판매자' : '운영자';
  return (
    <main id="main-content" tabIndex={-1} className="shell account-shell">
      <a className="text-link" href="/">어울몰 홈</a>
      <section className="account-card" aria-labelledby="account-title">
        <p className="eyebrow">어울몰 계정</p>
        <h1 id="account-title">내 계정</h1>
        {state === 'loading' ? <p role="status">계정 확인 중</p> : null}
        {state === 'unauthorized' ? <p>로그인이 필요합니다. <a className="text-link" href="/login">로그인</a></p> : null}
        {state === 'unavailable' ? <p role="alert">계정 정보를 확인할 수 없습니다. 연결 설정을 확인해 주세요</p> : null}
        {state === 'ready' && session ? (
          <div>
            <p>현재 역할: <strong>{roleLabel}</strong></p>
            <AccountRoleLinks role={session.role} />
            <button type="button" className="primary-button" disabled={busy} onClick={logout}>로그아웃</button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
