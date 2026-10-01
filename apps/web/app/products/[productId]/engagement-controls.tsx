'use client';

import { useEffect, useRef, useState } from 'react';

type Option = { id: string; name: string; sellableQuantity: number };
type Product = { productId: string; title: string; saleStopped?: boolean; options: Option[] };
type Favorite = { productId: string };
type Restock = { id: string; productId: string; optionName: string; status: string };
type Access = 'loading' | 'ready' | 'unauthorized' | 'forbidden' | 'unavailable';

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export function createEngagementLoadGate() {
  let sequence = 0;
  let productId = '';
  return {
    begin(nextProductId: string) { productId = nextProductId; return ++sequence; },
    isCurrent(request: number, expectedProductId: string) {
      return request === sequence && expectedProductId === productId;
    },
    invalidate() { sequence++; productId = ''; },
  };
}

export function engagementMutationFailureMessage(saved: boolean) {
  return saved
    ? '변경은 저장됐지만 결과를 확인하지 못했습니다. 페이지를 새로고침해 확인해 주세요'
    : '저장하지 못했습니다. 다시 시도해 주세요';
}

export function EngagementControlsView({ product, access, favorite, activeRestock, busy, message,
  onFavorite, onRestock, onCancel }: {
  product: Product; access: Access; favorite: boolean; activeRestock: Restock[]; busy: string; message: string;
  onFavorite: () => void; onRestock: (optionId: string) => void; onCancel: (id: string) => void;
}) {
  return <section className="engagement-controls" aria-label="찜과 재입고 신청">
    {access === 'loading' ? <p role="status">찜과 재입고 신청 확인 중</p> : null}
    {access === 'unauthorized' ? <p>로그인 후 찜과 재입고 신청을 이용하실 수 있습니다. <a className="text-link" href="/login">로그인</a></p> : null}
    {access === 'forbidden' ? <p>찜과 재입고 신청은 구매자 역할로 전환한 뒤 이용하실 수 있습니다</p> : null}
    {access === 'unavailable' ? <p role="alert">찜과 재입고 신청을 확인할 수 없습니다. 잠시 후 다시 이용해 주세요</p> : null}
    {access === 'ready' ? <>
      <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={onFavorite}
        aria-label={`${product.title} ${favorite ? '찜 해제' : '찜하기'}`}>
        {favorite ? '찜 해제' : '상품 찜하기'}
      </button>
      {!product.saleStopped ? product.options.filter((option) => option.sellableQuantity === 0).map((option) => {
        const active = activeRestock.find((item) => item.productId === product.productId &&
          item.optionName === option.name && item.status === 'active');
        return <div className="engagement-option" key={option.id}>
          <span>{option.name} 품절</span>
          <button type="button" className="secondary-button" disabled={Boolean(busy)}
            aria-label={`${option.name} 재입고 신청${active ? ' 취소' : ''}`}
            onClick={() => active ? onCancel(active.id) : onRestock(option.id)}>
            {active ? '재입고 신청 취소' : '재입고 신청'}
          </button>
        </div>;
      }) : null}
      {activeRestock.filter((item) => item.productId === product.productId && item.status === 'active' &&
        (product.saleStopped || !product.options.some((option) => option.name === item.optionName &&
          option.sellableQuantity === 0))).map((item) => <div className="engagement-option" key={item.id}>
        <span>{item.optionName} 재입고 신청 중</span>
        <button type="button" className="secondary-button" disabled={Boolean(busy)}
          aria-label={`${item.optionName} 재입고 신청 취소`} onClick={() => onCancel(item.id)}>
          재입고 신청 취소
        </button>
      </div>)}
    </> : null}
    {message ? <p role={message.includes('못했') || message.includes('오류') ? 'alert' : 'status'}>{message}</p> : null}
  </section>;
}

export function EngagementControls({ product }: { product: Product }) {
  const [access, setAccess] = useState<Access>('loading');
  const [favorite, setFavorite] = useState(false);
  const [activeRestock, setActiveRestock] = useState<Restock[]>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const gate = useRef(createEngagementLoadGate());
  const operation = useRef(false);
  const lifetime = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    const request = gate.current.begin(product.productId);
    setAccess('loading');
    setMessage('');
    if (!apiOrigin) { setAccess('unavailable'); return () => { controller.abort(); gate.current.invalidate(); }; }
    Promise.all([
      fetch(`${apiOrigin}/customer/favorites`, { credentials: 'include', signal: controller.signal }),
      fetch(`${apiOrigin}/customer/restock-subscriptions`, { credentials: 'include', signal: controller.signal }),
    ]).then(async ([favorites, restock]) => {
      if (!gate.current.isCurrent(request, product.productId) || controller.signal.aborted) return;
      if (favorites.status === 401 || restock.status === 401) {
        setAccess('unauthorized'); return;
      }
      if (favorites.status === 403 || restock.status === 403) { setAccess('forbidden'); return; }
      if (!favorites.ok || !restock.ok) throw new Error('Load failed');
      const [favoriteRows, restockRows] = await Promise.all([
        favorites.json() as Promise<Favorite[]>, restock.json() as Promise<Restock[]>,
      ]);
      if (!gate.current.isCurrent(request, product.productId) || controller.signal.aborted) return;
      setFavorite(favoriteRows.some((item) => item.productId === product.productId));
      setActiveRestock(restockRows);
      setAccess('ready');
    }).catch(() => { if (!controller.signal.aborted && gate.current.isCurrent(request, product.productId)) setAccess('unavailable'); });
    return () => { controller.abort(); gate.current.invalidate(); lifetime.current = null; };
  }, [product.productId]);

  async function mutate(path: string, method: string, body?: object) {
    if (!apiOrigin || operation.current || !lifetime.current || lifetime.current.signal.aborted) return;
    operation.current = true;
    setBusy(path);
    setMessage('');
    const signal = lifetime.current.signal;
    const request = gate.current.begin(product.productId);
    let saved = false;
    try {
      const result = await fetch(`${apiOrigin}${path}`, {
        method, credentials: 'include', signal,
        ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      if (!result.ok) throw new Error('Save failed');
      saved = true;
      const [favorites, restock] = await Promise.all([
        fetch(`${apiOrigin}/customer/favorites`, { credentials: 'include', signal }),
        fetch(`${apiOrigin}/customer/restock-subscriptions`, { credentials: 'include', signal }),
      ]);
      if (!favorites.ok || !restock.ok) throw new Error('Refresh failed');
      const [favoriteRows, restockRows] = await Promise.all([
        favorites.json() as Promise<Favorite[]>, restock.json() as Promise<Restock[]>,
      ]);
      if (!signal.aborted && gate.current.isCurrent(request, product.productId)) {
        setFavorite(favoriteRows.some((item) => item.productId === product.productId));
        setActiveRestock(restockRows);
        setMessage('변경 내용을 저장했습니다');
      }
    } catch {
      if (!signal.aborted && gate.current.isCurrent(request, product.productId)) {
        setMessage(engagementMutationFailureMessage(saved));
      }
    } finally {
      operation.current = false;
      if (!signal.aborted && gate.current.isCurrent(request, product.productId)) setBusy('');
    }
  }

  return <EngagementControlsView product={product} access={access} favorite={favorite}
    activeRestock={activeRestock} busy={busy} message={message}
    onFavorite={() => mutate(`/customer/favorites/${encodeURIComponent(product.productId)}`, favorite ? 'DELETE' : 'PUT')}
    onRestock={(optionId) => mutate('/customer/restock-subscriptions', 'POST', { productId: product.productId, optionId })}
    onCancel={(id) => mutate(`/customer/restock-subscriptions/${encodeURIComponent(id)}`, 'DELETE')} />;
}
