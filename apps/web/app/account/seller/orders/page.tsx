'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { appendUniqueFulfillments, fulfillmentFailureMessage, fulfillmentSaveDisposition,
  shouldReleaseFulfillmentKey } from '../../fulfillment-ui';

type FulfillmentStatus = 'READY' | 'PACKING' | 'DELAYED' | 'SHIPPED' | 'CANCELLED';
type CarrierCode = 'cj_logistics' | 'korea_post' | 'hanjin' | 'lotte' | 'other';
type SellerItem = {
  shipmentOrderId: string; status: FulfillmentStatus; version: number; paidAt: string;
  expectedShipDate: string; recipientName: string; phone: string;
  carrierCode: CarrierCode | null; carrierName: string | null; trackingNumber: string | null;
};
type SellerDetail = SellerItem & {
  customerMessage: string | null;
  amounts: { goodsWon: number; goodsDiscountWon?: number; shippingFeeWon?: number;
    shippingSupportWon?: number; shippingWon?: number; payableWon: number };
  address: { recipientName?: string; phone?: string; postalCode: string; line1: string; line2: string | null };
  lines: { id?: string; optionId?: string; productName: string; optionName: string;
    quantity?: number; originalQuantity?: number; refundedQuantity?: number; remainingQuantity?: number }[];
};
type SellerTransition = {
  targetStatus: 'PACKING' | 'DELAYED' | 'SHIPPED'; expectedVersion: number;
  expectedShipDate?: string; reason?: string; customerMessage?: string;
  carrierCode?: CarrierCode; carrierName?: string; trackingNumber?: string;
};
type SellerViewProps = {
  items: SellerItem[]; selected: SellerDetail | null; statusFilter: string;
  nextCursor?: string | null; busy: boolean; error: string; message: string;
  onFilter: (status: string) => void; onSelect: (id: string) => void;
  onLoadMore?: () => void; onTransition: (transition: SellerTransition) => void;
};

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');
const statuses: FulfillmentStatus[] = ['READY', 'PACKING', 'DELAYED', 'SHIPPED', 'CANCELLED'];
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;

function DelayForm({ detail, busy, onTransition }: {
  detail: SellerDetail; busy: boolean; onTransition: (transition: SellerTransition) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onTransition({ targetStatus: 'DELAYED', expectedVersion: detail.version,
      expectedShipDate: String(data.get('expectedShipDate') ?? ''),
      reason: String(data.get('reason') ?? '').trim(),
      customerMessage: String(data.get('customerMessage') ?? '').trim() });
  }
  return <form className="account-form fulfillment-action-form" onSubmit={submit}>
    <h3>지연 등록</h3>
    <label htmlFor="seller-expected-date">변경 잠정 예상일</label>
    <input id="seller-expected-date" name="expectedShipDate" type="date" required />
    <p className="section-note">휴무일 미반영</p>
    <label htmlFor="seller-delay-reason">지연 사유</label>
    <textarea id="seller-delay-reason" name="reason" rows={3} maxLength={500} required />
    <label htmlFor="seller-customer-message">고객 안내</label>
    <textarea id="seller-customer-message" name="customerMessage" rows={3} maxLength={500} required />
    <button type="submit" className="secondary-button" disabled={busy}>지연 등록</button>
  </form>;
}

function ShipmentForm({ detail, busy, onTransition }: {
  detail: SellerDetail; busy: boolean; onTransition: (transition: SellerTransition) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const carrierCode = String(data.get('carrierCode') ?? '') as CarrierCode;
    const transition: SellerTransition = { targetStatus: 'SHIPPED', expectedVersion: detail.version,
      carrierCode, trackingNumber: String(data.get('trackingNumber') ?? '').trim() };
    if (carrierCode === 'other') transition.carrierName = String(data.get('carrierName') ?? '').trim();
    onTransition(transition);
  }
  return <form className="account-form fulfillment-action-form" onSubmit={submit}>
    <h3>출고 처리</h3>
    <label htmlFor="seller-carrier">택배사</label>
    <select id="seller-carrier" name="carrierCode" required defaultValue="cj_logistics">
      <option value="cj_logistics">CJ대한통운</option><option value="korea_post">우체국택배</option>
      <option value="hanjin">한진택배</option><option value="lotte">롯데택배</option>
      <option value="other">기타</option>
    </select>
    <label htmlFor="seller-carrier-name">기타 택배사명</label>
    <input id="seller-carrier-name" name="carrierName" maxLength={50} />
    <label htmlFor="seller-tracking">운송장</label>
    <input id="seller-tracking" name="trackingNumber" maxLength={50}
      pattern="[A-Za-z0-9-]+" required />
    <button type="submit" className="primary-button" disabled={busy}>출고 처리</button>
  </form>;
}

export function SellerFulfillmentView({ items, selected, statusFilter, busy, error, message,
  nextCursor, onFilter, onSelect, onLoadMore, onTransition }: SellerViewProps) {
  return <div className="fulfillment-layout">
    <section className="account-card fulfillment-filter-card">
      <h2>판매자 주문 출고</h2>
      <form className="fulfillment-filter-form" onSubmit={(event) => {
        event.preventDefault();
        onFilter(String(new FormData(event.currentTarget).get('statusFilter') ?? ''));
      }}>
        <label htmlFor="seller-status-filter">상태</label>
        <select id="seller-status-filter" name="statusFilter" defaultValue={statusFilter}>
          <option value="">전체</option>{statuses.map((status) =>
            <option key={status} value={status}>{status}</option>)}</select>
        <button type="submit" className="primary-button" disabled={busy}>조회</button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {busy ? <p role="status">저장 중</p> : null}
    </section>
    <section className="account-card fulfillment-list-card" aria-labelledby="seller-orders-heading">
      <h2 id="seller-orders-heading">발송 주문</h2>
      {items.length === 0 ? <p>처리할 발송 주문이 없습니다</p> : <ul className="fulfillment-list">
        {items.map((item) => <li key={item.shipmentOrderId}>
          <button type="button" className="fulfillment-list-button" disabled={busy}
            aria-pressed={selected?.shipmentOrderId === item.shipmentOrderId}
            onClick={() => onSelect(item.shipmentOrderId)}>
            <strong>{item.status}</strong><span>{item.recipientName} · {item.phone}</span>
            <span>잠정 예상일 {item.expectedShipDate} · 휴무일 미반영</span>
          </button>
        </li>)}</ul>}
      {nextCursor && onLoadMore ? <button type="button" className="secondary-button"
        disabled={busy} onClick={onLoadMore}>더보기</button> : null}
    </section>
    <section className="account-card fulfillment-detail-card" aria-labelledby="seller-detail-heading">
      <h2 id="seller-detail-heading">발송 상세</h2>
      {!selected ? <p>확인할 발송 주문을 선택해 주세요</p> : <div key={`${selected.shipmentOrderId}-${selected.version}`}>
        <p><strong>{selected.status}</strong> · 버전 {selected.version}</p>
        <p>잠정 예상일 {selected.expectedShipDate} · 휴무일 미반영</p>
        <p>받는 분 {selected.recipientName} · {selected.phone}</p>
        <p>{selected.address.postalCode} {selected.address.line1} {selected.address.line2}</p>
        <p>결제금액 {won(selected.amounts.payableWon)}</p>
        <ul className="fulfillment-lines">{selected.lines.map((line, index) => <li
          key={line.optionId ?? line.id ?? `${line.productName}-${index}`}>
          <strong>{line.productName}</strong> · {line.optionName} ·
          {' '}{line.remainingQuantity ?? line.quantity ?? line.originalQuantity ?? 0}개
        </li>)}</ul>
        {selected.status === 'READY' ? <button type="button" className="primary-button" disabled={busy}
          onClick={() => onTransition({ targetStatus: 'PACKING', expectedVersion: selected.version })}>
          포장 시작</button> : null}
        {selected.status === 'DELAYED' ? <button type="button" className="primary-button" disabled={busy}
          onClick={() => onTransition({ targetStatus: 'PACKING', expectedVersion: selected.version })}>
          포장 재개</button> : null}
        {selected.status === 'READY' || selected.status === 'PACKING' ?
          <DelayForm detail={selected} busy={busy} onTransition={onTransition} /> : null}
        {selected.status === 'PACKING' ?
          <ShipmentForm detail={selected} busy={busy} onTransition={onTransition} /> : null}
      </div>}
    </section>
  </div>;
}

export default function SellerFulfillmentPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'unavailable'>('loading');
  const [items, setItems] = useState<SellerItem[]>([]);
  const [selected, setSelected] = useState<SellerDetail | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const keys = useRef(new Map<string, string>());

  async function loadList(status = statusFilter, signal?: AbortSignal, cursor?: string) {
    if (!apiOrigin) throw new Error('API unavailable');
    const query = new URLSearchParams({ limit: '50' });
    if (status) query.set('status', status);
    if (cursor) query.set('cursor', cursor);
    const response = await fetch(`${apiOrigin}/fulfillment/seller/shipments?${query}`,
      { credentials: 'include', cache: 'no-store', signal });
    if (response.status === 401 || response.status === 403) { setState('unauthorized'); return false; }
    if (!response.ok) throw new Error('Fulfillment list unavailable');
    const result = await response.json() as { items: SellerItem[]; nextCursor: string | null };
    setItems((current) => cursor ? appendUniqueFulfillments(current, result.items) : result.items);
    setNextCursor(result.nextCursor);
    return true;
  }

  async function loadDetail(id: string, signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const response = await fetch(`${apiOrigin}/fulfillment/seller/shipments/${encodeURIComponent(id)}`,
      { credentials: 'include', cache: 'no-store', signal });
    if (response.status === 401 || response.status === 403) { setState('unauthorized'); return false; }
    if (!response.ok) throw new Error('Fulfillment detail unavailable');
    setSelected(await response.json() as SellerDetail);
    return true;
  }

  useEffect(() => {
    if (!apiOrigin) { setState('unavailable'); return; }
    const controller = new AbortController();
    async function load() {
      const response = await fetch(`${apiOrigin}/auth/me`,
        { credentials: 'include', cache: 'no-store', signal: controller.signal });
      if (!response.ok) { setState(response.status === 401 ? 'unauthorized' : 'unavailable'); return; }
      if ((await response.json() as { role: string }).role !== 'seller') { setState('unauthorized'); return; }
      if (await loadList('', controller.signal)) setState('ready');
    }
    load().catch((caught: unknown) => {
      if (caught instanceof Error && caught.name !== 'AbortError') setState('unavailable');
    });
    return () => controller.abort();
  }, []);

  async function transition(input: SellerTransition) {
    if (!apiOrigin || !selected || busy) return;
    const identity = `${selected.shipmentOrderId}|${JSON.stringify(input)}`;
    const key = keys.current.get(identity) ?? crypto.randomUUID();
    keys.current.set(identity, key);
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/fulfillment/seller/shipments/${encodeURIComponent(
        selected.shipmentOrderId)}/transitions`, { method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(input) });
      const disposition = fulfillmentSaveDisposition(response.status);
      if (disposition === 'unauthorized') { setState('unauthorized'); return; }
      if (disposition === 'reload') {
        const reloaded = (await Promise.all([
          loadList(statusFilter), loadDetail(selected.shipmentOrderId),
        ])).every(Boolean);
        if (shouldReleaseFulfillmentKey(disposition, reloaded)) keys.current.delete(identity);
        if (!reloaded) throw new Error('Authoritative reload unavailable');
        setMessage(response.status === 409 ? '다른 처리로 상태가 변경되어 최신 정보를 다시 불러왔습니다'
          : '출고 상태를 저장하고 최신 정보를 반영했습니다');
        return;
      }
      setError(fulfillmentFailureMessage(response.status));
    } catch { setError(fulfillmentFailureMessage()); }
    finally { setBusy(false); }
  }

  return <main id="main-content" tabIndex={-1} className="shell account-shell">
    <a className="text-link" href="/account">내 계정으로</a>
    <h1>판매자 주문 출고</h1>
    {state === 'loading' ? <p role="status">판매자 권한 확인 중</p> : null}
    {state === 'unauthorized' ? <p role="alert">판매자 로그인 후 이용할 수 있습니다</p> : null}
    {state === 'unavailable' ? <p role="alert">출고 목록을 불러오지 못했습니다</p> : null}
    {state === 'ready' ? <SellerFulfillmentView items={items} selected={selected}
      statusFilter={statusFilter} nextCursor={nextCursor} busy={busy} error={error} message={message}
      onFilter={(next) => { setStatusFilter(next); setItems([]); setNextCursor(null);
        setSelected(null); setBusy(true); setError('');
        void loadList(next).catch(() => setError('출고 목록을 불러오지 못했습니다'))
          .finally(() => setBusy(false)); }}
      onLoadMore={() => { if (!nextCursor) return; setBusy(true); setError('');
        void loadList(statusFilter, undefined, nextCursor)
          .catch(() => setError('출고 목록을 더 불러오지 못했습니다'))
          .finally(() => setBusy(false)); }}
      onSelect={(id) => { setBusy(true); setError(''); void loadDetail(id)
        .catch(() => setError('출고 상세를 불러오지 못했습니다')).finally(() => setBusy(false)); }}
      onTransition={(input) => void transition(input)} /> : null}
  </main>;
}
