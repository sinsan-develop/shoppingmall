'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type CartItem = { optionId: string; productId: string; title: string; optionName: string;
  quantity: number; unitPriceWon: number | null; availability: 'available' | 'unavailable' };
type Shipment = { key: string; shippingMode: string; sellerId: string | null;
  goodsWon: number; shippingWon: number; totalWon: number };
type Quote = { shipments: Shipment[]; goodsWon: number; shippingWon: number; totalWon: number };
type Reservation = { id: string; status: 'ACTIVE' | 'EXPIRED' | 'RELEASED' | 'CANCELLED' | 'CONSUMED';
  expiresAt: string; endReason: string | null; lines: { optionId: string; quantity: number }[];
  quote?: Quote };
type ViewProps = { items: CartItem[]; quote?: Quote; edits: Record<string, number>;
  busy: string; message: string; loading: boolean; onEdit: (id: string, quantity: number) => void;
  onSave: (id: string) => void; onRemove: (id: string) => void;
  reservation?: Reservation; nowMs?: number; onReserve?: () => void; onRelease?: () => void;
  onRecheck?: () => void; retryAvailable?: boolean };

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const reservationStorageKey = 'owool-checkout-reservation-id';
const requestStorageKey = 'owool-checkout-reservation-key';

type ReservationStartResult = { kind: 'conflict' } |
  { kind: 'active' | 'ended'; reservation: Reservation };

export async function startReservationRequest(apiBase: string,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  send: typeof fetch = fetch): Promise<ReservationStartResult> {
  const key = storage.getItem(requestStorageKey) ?? crypto.randomUUID();
  storage.setItem(requestStorageKey, key);
  const response = await send(`${apiBase}/customer/checkout/reservations`, {
    method: 'POST', credentials: 'include', headers: { 'idempotency-key': key },
  });
  if (response.status === 409) return { kind: 'conflict' };
  if (response.status === 401 || response.status === 403) throw new Error('구매자 역할로 로그인해 주세요');
  if (!response.ok) throw new Error('예약 결과를 확인하지 못했습니다. 같은 버튼을 다시 눌러 확인해 주세요');
  const reservation = await response.json() as Reservation;
  if (reservation.status === 'ACTIVE') {
    storage.setItem(reservationStorageKey, reservation.id);
    return { kind: 'active', reservation };
  }
  storage.removeItem(reservationStorageKey);
  storage.removeItem(requestStorageKey);
  return { kind: 'ended', reservation };
}

export async function discoverActiveReservation(apiBase: string,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  send: typeof fetch = fetch, signal?: AbortSignal): Promise<
    { kind: 'active'; reservation: Reservation } | { kind: 'none' }> {
  const response = await send(`${apiBase}/customer/checkout/reservations/active`,
    { credentials: 'include', signal, cache: 'no-store' });
  if (response.status === 404) return { kind: 'none' };
  if (response.status === 401 || response.status === 403) {
    throw new Error('구매자 역할로 로그인한 뒤 예약을 확인해 주세요');
  }
  if (!response.ok) throw new Error('예약 상태를 불러오지 못했습니다');
  const reservation = await response.json() as Reservation;
  if (reservation.status !== 'ACTIVE') throw new Error('예약 상태를 다시 확인해 주세요');
  storage.setItem(reservationStorageKey, reservation.id);
  return { kind: 'active', reservation };
}

export function createRefreshGate() {
  let generation = 0;
  return {
    begin: () => ++generation,
    invalidate: () => { generation += 1; },
    isCurrent: (candidate: number) => candidate === generation,
  };
}

export function CartView({ items, quote, edits, busy, message, loading, onEdit, onSave, onRemove,
  reservation, nowMs, onReserve, onRelease, onRecheck, retryAvailable }: ViewProps) {
  const active = reservation?.status === 'ACTIVE';
  const seconds = active ? Math.max(0, Math.ceil((Date.parse(reservation.expiresAt) -
    (nowMs ?? Date.now())) / 1000)) : 0;
  const shownQuote = active ? reservation.quote : quote;
  return <main id="main-content" tabIndex={-1} className="shell cart-main">
    <a className="text-link" href="/products">상품 더 보기</a>
    <h1>장바구니</h1>
    <p className="section-note">판매자별 직접 발송과 어울몰 모아 발송은 결제 전에 별도 주문으로 나뉩니다.</p>
    {message ? <p role="alert">{message}</p> : null}
    {active ? <section className="cart-quote" aria-label="재고 예약 상태">
      <h2>결제 준비 재고 예약</h2>
      <p>예약 번호 {reservation.id}</p>
      <p role="status">서버 만료 시각 {new Date(reservation.expiresAt).toLocaleString('ko-KR')} · 남은 시간 {Math.floor(seconds / 60)}분 {seconds % 60}초</p>
      <p>예약 해제 후 수량을 수정하거나 상품을 제거할 수 있습니다. 결제·주문은 아직 확정되지 않았습니다.</p>
      <button type="button" className="secondary-button" disabled={!!busy} onClick={onRelease}>예약 해제</button>
    </section> : reservation && reservation.status !== 'RELEASED' ? <section className="cart-quote" aria-label="종료된 예약 상태">
      <h2>예약을 다시 확인해 주세요</h2>
      <p>예약 번호 {reservation.id}</p>
      <p>{reservation.status === 'CANCELLED' ? '운영자가 예약을 취소했습니다' : '예약 시간이 끝났습니다'}
        {reservation.endReason ? ` · 사유: ${reservation.endReason}` : ''}</p>
      <p>상품 상태와 금액을 재견적한 뒤 새 예약을 진행해 주세요.</p>
      <button type="button" className="secondary-button" disabled={!!busy} onClick={onRecheck}>상품·금액 재견적</button>
    </section> : null}
    {loading ? <p role="status">장바구니를 불러오고 있습니다</p> : items.length === 0 ?
      <p className="cart-empty">장바구니가 비어 있습니다</p> : <>
        <ul className="cart-items">
          {items.map((item) => <li key={item.optionId} className="cart-item">
            <div><a className="text-link" href={`/products/${encodeURIComponent(item.productId)}`}>{item.title}</a>
              <p>{item.optionName}</p>
              <p>{(item.availability === 'available' || (active && reservation.lines.some((line) =>
                line.optionId === item.optionId))) && item.unitPriceWon !== null ?
                `단가 ${won(item.unitPriceWon)} × ${item.quantity}개 = ${won(item.unitPriceWon * item.quantity)}` :
                '현재 구매 불가 · 수량을 조정하거나 제거해 주세요'}</p>
            </div>
            <div className="cart-item-actions">
              <label htmlFor={`cart-edit-${item.optionId}`}>수량</label>
              <input id={`cart-edit-${item.optionId}`} type="number" min="1" max="1000000" step="1"
                inputMode="numeric" disabled={active || !!busy} value={edits[item.optionId] ?? item.quantity}
                onChange={(event) => onEdit(item.optionId, Number(event.target.value))} />
              <button type="button" disabled={active || !!busy || !Number.isSafeInteger(edits[item.optionId] ?? item.quantity) ||
                (edits[item.optionId] ?? item.quantity) < 1} onClick={() => onSave(item.optionId)}>수량 변경</button>
              <button type="button" disabled={active || !!busy} onClick={() => onRemove(item.optionId)}>제거</button>
            </div>
          </li>)}
        </ul>
        {shownQuote ? <section className="cart-quote" aria-label="현재 장바구니 견적">
          <h2>발송별 금액</h2>
          <ul>{shownQuote.shipments.map((shipment) => <li key={shipment.key}>
            <strong>{shipment.shippingMode === 'owool_fulfillment' ? '어울몰 모아 발송' : '판매자 직접 발송'}</strong>
            <span>상품 {won(shipment.goodsWon)} · 배송비 {won(shipment.shippingWon)} · 소계 {won(shipment.totalWon)}</span>
          </li>)}</ul>
          <p>상품 {won(shownQuote.goodsWon)} + 배송비 {won(shownQuote.shippingWon)} = <strong>총 {won(shownQuote.totalWon)}</strong></p>
        </section> : <p role="status">현재 상품·재고를 확인해야 금액을 안내할 수 있습니다</p>}
        {!active && (shownQuote || retryAvailable) && onReserve ? <button type="button" className="primary-button" disabled={!!busy}
          onClick={onReserve}>{retryAvailable ? '이전 예약 결과 다시 확인' : '결제 준비 · 15분 재고 예약'}</button> : null}
        <p className="section-note">결제 기능은 준비 중입니다. 이 금액은 주문·결제 확정 금액이 아닙니다.</p>
      </>}
  </main>;
}

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [quote, setQuote] = useState<Quote>();
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [reservation, setReservation] = useState<Reservation>();
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const refreshGate = useRef<ReturnType<typeof createRefreshGate> | null>(null);
  if (refreshGate.current === null) refreshGate.current = createRefreshGate();
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!apiOrigin) throw new Error('장바구니 연결을 준비 중입니다');
    const generation = refreshGate.current!.begin();
    const isCurrent = () => !signal?.aborted && refreshGate.current!.isCurrent(generation);
    const response = await fetch(`${apiOrigin}/customer/cart`, { credentials: 'include', signal, cache: 'no-store' });
    if (response.status === 401) throw new Error('로그인 후 장바구니를 이용해 주세요');
    if (response.status === 403) throw new Error('구매자 역할로 전환해 주세요');
    if (!response.ok) throw new Error('장바구니를 불러오지 못했습니다');
    const cartItems = await response.json() as CartItem[];
    if (!isCurrent()) return;
    setItems(cartItems);
    setEdits(Object.fromEntries(cartItems.map((item) => [item.optionId, item.quantity])));
    const hasRetryKey = !!window.sessionStorage.getItem(requestStorageKey);
    setRetryAvailable(hasRetryKey);
    const savedId = window.sessionStorage.getItem(reservationStorageKey);
    if (savedId) {
      const heldResponse = await fetch(`${apiOrigin}/customer/checkout/reservations/${encodeURIComponent(savedId)}`,
        { credentials: 'include', signal, cache: 'no-store' });
      if (!isCurrent()) return;
      if (heldResponse.ok) {
        const held = await heldResponse.json() as Reservation;
        if (!isCurrent()) return;
        setReservation(held);
        if (held.status === 'ACTIVE') {
          setNowMs(Date.now()); setQuote(held.quote); setMessage('');
          return;
        }
        window.sessionStorage.removeItem(reservationStorageKey);
        window.sessionStorage.removeItem(requestStorageKey);
        setRetryAvailable(false);
      } else if (heldResponse.status === 404) {
        window.sessionStorage.removeItem(reservationStorageKey);
        window.sessionStorage.removeItem(requestStorageKey);
        setRetryAvailable(false);
        setReservation(undefined);
      } else if (heldResponse.status === 401 || heldResponse.status === 403) {
        throw new Error('구매자 역할로 로그인한 뒤 예약을 확인해 주세요');
      } else throw new Error('예약 상태를 불러오지 못했습니다');
    }
    const discovered = await discoverActiveReservation(apiOrigin, window.sessionStorage, fetch, signal);
    if (!isCurrent()) return;
    if (discovered.kind === 'active') {
      setReservation(discovered.reservation);
      setRetryAvailable(false);
      setNowMs(Date.now()); setQuote(discovered.reservation.quote); setMessage('');
      return;
    }
    if (cartItems.length === 0) { setQuote(undefined); setMessage(''); return; }
    const quoted = await fetch(`${apiOrigin}/customer/cart/quote`,
      { credentials: 'include', signal, cache: 'no-store' });
    if (!isCurrent()) return;
    if (quoted.status === 409) {
      setQuote(undefined);
      setMessage(hasRetryKey ? '이전 예약 결과를 다시 확인하거나 상품·재고 상태를 확인해 주세요' :
        '품절·판매중지 또는 상품 변경으로 재견적할 수 없습니다. 해당 항목을 확인해 주세요');
    } else if (!quoted.ok) {
      setQuote(undefined);
      setMessage('현재 금액을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요');
    } else {
      const currentQuote = await quoted.json() as Quote;
      if (!isCurrent()) return;
      setQuote(currentQuote); setMessage('');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : '장바구니를 불러오지 못했습니다');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); refreshGate.current?.invalidate(); };
  }, [refresh]);

  useEffect(() => {
    if (reservation?.status !== 'ACTIVE' || busy) return;
    const controller = new AbortController();
    const display = window.setInterval(() => setNowMs(Date.now()), 1000);
    const verify = window.setInterval(() => {
      void refresh(controller.signal).catch(() => {
        if (!controller.signal.aborted) setMessage('예약 상태를 다시 확인하지 못했습니다. 잠시 후 재시도해 주세요');
      });
    }, 5000);
    return () => { controller.abort(); window.clearInterval(display); window.clearInterval(verify); };
  }, [reservation?.id, reservation?.status, busy, refresh]);

  async function reserve() {
    if (!apiOrigin || busy || reservation?.status === 'ACTIVE') return;
    refreshGate.current?.invalidate();
    setBusy('reservation'); setMessage('');
    try {
      const result = await startReservationRequest(apiOrigin, window.sessionStorage);
      if (result.kind === 'conflict') {
        setRetryAvailable(true);
        setMessage('재고·상품 상태 또는 다른 예약을 확인해 주세요. 같은 버튼으로 예약 결과를 다시 확인할 수 있습니다');
        return;
      }
      const held = result.reservation;
      setRetryAvailable(false);
      setReservation(held);
      if (result.kind === 'active') {
        setNowMs(Date.now()); setQuote(held.quote);
      }
    } catch (error) {
      setRetryAvailable(!!window.sessionStorage.getItem(requestStorageKey));
      setMessage(error instanceof Error ? error.message : '예약 결과를 확인하지 못했습니다');
    } finally { setBusy(''); }
  }

  async function release() {
    if (!apiOrigin || busy || reservation?.status !== 'ACTIVE') return;
    refreshGate.current?.invalidate();
    setBusy('reservation'); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/customer/checkout/reservations/${encodeURIComponent(reservation.id)}`,
        { method: 'DELETE', credentials: 'include' });
      if (!response.ok) throw new Error('예약을 해제하지 못했습니다. 서버 상태를 다시 확인해 주세요');
      window.sessionStorage.removeItem(reservationStorageKey);
      window.sessionStorage.removeItem(requestStorageKey);
      setRetryAvailable(false);
      setReservation(await response.json() as Reservation);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '예약을 해제하지 못했습니다');
    } finally { setBusy(''); }
  }

  async function mutate(optionId: string, method: 'PUT' | 'DELETE') {
    if (!apiOrigin || busy) return;
    if (reservation?.status === 'ACTIVE') {
      setMessage('예약 해제 후 수량을 변경하거나 상품을 제거해 주세요');
      return;
    }
    const quantity = edits[optionId] ?? items.find((item) => item.optionId === optionId)?.quantity;
    if (method === 'PUT' && (!Number.isSafeInteger(quantity) || !quantity || quantity < 1 || quantity > 1_000_000)) {
      setMessage('수량은 1개 이상 1,000,000개 이하의 정수로 입력해 주세요');
      return;
    }
    setBusy(optionId);
    setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/customer/cart/items/${encodeURIComponent(optionId)}`, {
        method, credentials: 'include',
        ...(method === 'PUT' ? { headers: { 'content-type': 'application/json' } } : {}),
        ...(method === 'PUT' ? { body: JSON.stringify({ quantity }) } : {}),
      });
      if (response.status === 409) throw new Error('예약·상품 상태나 재고가 바뀌었습니다. 예약을 해제하고 항목을 확인해 주세요');
      if (!response.ok) throw new Error('장바구니 변경을 저장하지 못했습니다');
      try { await refresh(); }
      catch { setQuote(undefined); setMessage('변경은 저장됐지만 현재 내역을 확인하지 못했습니다. 새로고침해 주세요'); }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '장바구니 변경을 저장하지 못했습니다');
    } finally { setBusy(''); }
  }

  return <CartView items={items} quote={quote} edits={edits} busy={busy} message={message} loading={loading}
    reservation={reservation} retryAvailable={retryAvailable} nowMs={nowMs}
    onReserve={() => void reserve()} onRelease={() => void release()}
    onRecheck={() => { setReservation(undefined); void refresh().catch(() =>
      setMessage('상품과 금액을 다시 확인하지 못했습니다')); }}
    onEdit={(id, quantity) => setEdits((old) => ({ ...old, [id]: quantity }))}
    onSave={(id) => mutate(id, 'PUT')} onRemove={(id) => mutate(id, 'DELETE')} />;
}
