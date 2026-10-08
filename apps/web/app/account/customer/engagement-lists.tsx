'use client';

import { useEffect, useRef, useState } from 'react';

type Favorite = { productId: string; title: string | null; published: boolean; saleStopped: boolean };
type Restock = { id: string; productId: string; optionName: string; status: string;
  title: string | null; optionState: string };
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export function EngagementListsView({ favorites, restock, busy, message, onCancel,onRefresh }: {
  favorites: Favorite[]; restock: Restock[]; busy: string; message: string;
  onCancel: (id: string) => void; onRefresh?: () => void;
}) {
  const optionLabel: Record<string, string> = {
    unpublished: '상품 공개 중단', sale_stopped: '판매중지', missing: '현재 없는 옵션',
    available: '판매 가능', sold_out: '품절',
  };
  return <div className="engagement-list-grid">
    <section className="account-card profile-card" aria-labelledby="favorite-list-title">
      <h2 id="favorite-list-title">찜한 상품</h2>
      {favorites.length ? <ul className="engagement-list">{favorites.map((item) => <li key={item.productId}>
        <a className="text-link" href={`/products/${encodeURIComponent(item.productId)}`}>{item.title ?? '상품 정보 없음'}</a>
        <span>{!item.published ? '공개 중단' : item.saleStopped ? '판매중지' : '판매 중'}</span>
      </li>)}</ul> : <p>찜한 상품이 없습니다</p>}
    </section>
    <section className="account-card profile-card" aria-labelledby="restock-list-title">
      <h2 id="restock-list-title">재입고 신청</h2>
      {onRefresh ? <button type="button" className="secondary-button" disabled={Boolean(busy)}
        onClick={onRefresh}>재입고 상태 새로고침</button> : null}
      {restock.length ? <ul className="engagement-list">{restock.map((item) => <li key={item.id}>
        <a className="text-link" href={`/products/${encodeURIComponent(item.productId)}`}>{item.title ?? '상품 정보 없음'}</a>
        <span>{item.optionName} · {optionLabel[item.optionState] ?? '상태 확인 중'} · {item.status === 'active' ? '신청 중' : item.status === 'cancelled' ? '취소됨' : '알림 완료'}</span>
        {item.status === 'active' && item.optionState === 'available' ?
          <span>외부 알림을 받지 못했어도 쇼핑몰 화면에서 바로 확인해 주세요</span> : null}
        {item.status === 'active' ? <button type="button" className="secondary-button"
          aria-label={`${item.title ?? '상품'} ${item.optionName} 재입고 신청 취소`}
          disabled={Boolean(busy)} onClick={() => onCancel(item.id)}>신청 취소</button> : null}
      </li>)}</ul> : <p>재입고 신청이 없습니다</p>}
      {message ? <p role="alert">{message}</p> : null}
    </section>
  </div>;
}

export function EngagementLists() {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [restock, setRestock] = useState<Restock[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const lifetime = useRef<AbortController | null>(null);
  const operation = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    if (!apiOrigin) { setState('unavailable'); return () => controller.abort(); }
    Promise.all([
      fetch(`${apiOrigin}/customer/favorites`, { credentials: 'include', signal: controller.signal }),
      fetch(`${apiOrigin}/customer/restock-subscriptions`, { credentials: 'include', signal: controller.signal }),
    ]).then(async ([favoriteResponse, restockResponse]) => {
      if (!favoriteResponse.ok || !restockResponse.ok) throw new Error('Load failed');
      const [favoriteRows, restockRows] = await Promise.all([
        favoriteResponse.json() as Promise<Favorite[]>, restockResponse.json() as Promise<Restock[]>,
      ]);
      if (controller.signal.aborted) return;
      setFavorites(favoriteRows);
      setRestock(restockRows);
      setState('ready');
    }).catch(() => { if (!controller.signal.aborted) setState('unavailable'); });
    return () => { controller.abort(); lifetime.current = null; };
  }, []);

  async function cancel(id: string) {
    if (!apiOrigin || operation.current || !lifetime.current || lifetime.current.signal.aborted) return;
    operation.current = true;
    setBusy(id);
    setMessage('');
    const signal = lifetime.current.signal;
    try {
      const response = await fetch(`${apiOrigin}/customer/restock-subscriptions/${encodeURIComponent(id)}`, {
        method: 'DELETE', credentials: 'include', signal,
      });
      if (!response.ok) throw new Error('Cancel failed');
      const refreshed = await fetch(`${apiOrigin}/customer/restock-subscriptions`, { credentials: 'include', signal });
      if (!refreshed.ok) throw new Error('Refresh failed');
      const rows = await refreshed.json() as Restock[];
      if (!signal.aborted) setRestock(rows);
    } catch {
      if (!signal.aborted) setMessage('신청 취소 결과를 확인하지 못했습니다. 다시 확인해 주세요');
    } finally {
      operation.current = false;
      if (!signal.aborted) setBusy('');
    }
  }

  async function refresh() {
    if (!apiOrigin || operation.current || !lifetime.current || lifetime.current.signal.aborted) return;
    operation.current = true;
    setBusy('refresh'); setMessage('');
    const signal = lifetime.current.signal;
    try {
      const response = await fetch(`${apiOrigin}/customer/restock-subscriptions`,
        { credentials:'include',cache:'no-store',signal });
      if (!response.ok) throw new Error('Refresh failed');
      const rows = await response.json() as Restock[];
      if (!signal.aborted) setRestock(rows);
    } catch {
      if (!signal.aborted) setMessage('재입고 상태를 새로고침하지 못했습니다');
    } finally {
      operation.current = false;
      if (!signal.aborted) setBusy('');
    }
  }

  if (state === 'loading') return <p role="status">찜과 재입고 신청을 불러오는 중</p>;
  if (state === 'unavailable') return <p role="alert">찜과 재입고 신청 내역을 불러올 수 없습니다</p>;
  return <EngagementListsView favorites={favorites} restock={restock} busy={busy}
    message={message} onCancel={cancel} onRefresh={refresh} />;
}
