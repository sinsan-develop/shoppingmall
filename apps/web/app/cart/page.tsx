'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

type CartItem = { optionId: string; productId: string; title: string; optionName: string;
  quantity: number; unitPriceWon: number | null; availability: 'available' | 'unavailable' };
type Shipment = { key: string; shippingMode: string; sellerId: string | null;
  goodsWon: number; shippingWon: number; totalWon: number; lines: { optionId: string }[] };
type Quote = { shipments: Shipment[]; goodsWon: number; shippingWon: number; totalWon: number };
type PromotionRule = { kind: 'goods_discount' | 'shipping_support'; amountKind: 'fixed' | 'percent';
  amountValue: number; startAt: string; endAt: string };
type Coupon = { grantId: string; campaignId: string; title: string; rule: PromotionRule };
type AppliedQuote = Omit<Quote, 'shipments'> & { discountWon: number; supportWon: number; payableGoodsWon: number;
  payableShippingWon: number; payableTotalWon: number; zeroSupportShipmentKeys: string[];
  message?: string; shipments: (Shipment & { discountWon: number; supportWon: number;
    payableGoodsWon: number; payableShippingWon: number; payableTotalWon: number })[] };
type ShippingChoice = { grantId: string; code: string };
type Reservation = { id: string; status: 'ACTIVE' | 'EXPIRED' | 'RELEASED' | 'CANCELLED' | 'CONSUMED';
  expiresAt: string; endReason: string | null; lines: { optionId: string; quantity: number }[];
  quote?: Quote };
type Address = { id: string; label: string; recipientName?: string; line1?: string };
type PendingOrder = { id: string; status: 'PENDING_PAYMENT' | 'EXPIRED' | 'PAID'; payableWon: number;
  expiresAt: string; paidAt?: string | null; reservationId?: string;
  shipments: { id: string; key: string; payableWon: number; status?: string }[] };
type PaymentAttempt = { id: string; status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'REVIEW_REQUIRED';
  amountWon: number; mockOnly: true };
type MockOutcome = 'approve' | 'decline' | 'delay';
type ViewProps = { items: CartItem[]; quote?: Quote; edits: Record<string, number>;
  busy: string; message: string; loading: boolean; onEdit: (id: string, quantity: number) => void;
  onSave: (id: string) => void; onRemove: (id: string) => void;
  reservation?: Reservation; nowMs?: number; onReserve?: () => void; onRelease?: () => void;
  onRecheck?: () => void; retryAvailable?: boolean; children?: ReactNode;
  addresses?: Address[]; selectedAddressId?: string; onAddressChange?: (id: string) => void;
  onSubmitOrder?: () => void; pendingOrder?: PendingOrder; orderPayableWon?: number;
  showMockPayment?: boolean; onMockPayment?: (outcome: MockOutcome) => void;
  mockOutcome?: MockOutcome; onMockOutcomeChange?: (outcome: MockOutcome) => void;
  paymentAttempt?: PaymentAttempt };

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const reservationStorageKey = 'owool-checkout-reservation-id';
const requestStorageKey = 'owool-checkout-reservation-key';
const orderStorageKey = 'owool-checkout-order-id';
const orderReservationKey = 'owool-checkout-order-reservation-id';
const orderRequestKey = 'owool-checkout-order-key';
const orderInputKey = 'owool-checkout-order-input';
const paymentRequestKey = 'owool-checkout-payment-key';
const paymentInputKey = 'owool-checkout-payment-input';

export async function startMockPaymentRequest(apiBase: string,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  orderId: string, testOutcome: MockOutcome, send: typeof fetch = fetch): Promise<PaymentAttempt> {
  const signature = JSON.stringify({ orderId, testOutcome });
  if (storage.getItem(paymentInputKey) !== signature) storage.removeItem(paymentRequestKey);
  storage.setItem(paymentInputKey, signature);
  const key = storage.getItem(paymentRequestKey) ?? crypto.randomUUID();
  storage.setItem(paymentRequestKey, key);
  const response = await send(`${apiBase}/customer/checkout/orders/${encodeURIComponent(orderId)}/payment-attempts`, {
    method: 'POST', credentials: 'include', headers: {
      'content-type': 'application/json', 'idempotency-key': key,
    }, body: JSON.stringify({ testOutcome }),
  });
  if (response.status === 401 || response.status === 403)
    throw new Error('구매자 역할로 로그인해 주세요');
  if (response.status === 404) throw new Error('이 주문의 모의 결제는 사용할 수 없습니다');
  if (response.status === 409) throw new Error('결제 시도와 주문 상태가 변경됐습니다. 본인 주문을 다시 확인해 주세요');
  if (!response.ok) throw new Error('모의 결제 결과를 확인하지 못했습니다. 같은 선택으로 다시 확인해 주세요');
  return await response.json() as PaymentAttempt;
}

export async function submitOrderRequest(apiBase: string,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  input: { reservationId: string; addressId: string; selections: object; expectedPayableWon: number },
  send: typeof fetch = fetch): Promise<PendingOrder> {
  const signature = JSON.stringify(input);
  const prior = storage.getItem(orderInputKey);
  if (prior && prior !== signature) storage.removeItem(orderRequestKey);
  storage.setItem(orderInputKey, signature);
  const key = storage.getItem(orderRequestKey) ?? crypto.randomUUID();
  storage.setItem(orderRequestKey, key);
  const response = await send(`${apiBase}/customer/checkout/orders`, {
    method: 'POST', credentials: 'include', headers: {
      'content-type': 'application/json', 'idempotency-key': key,
    }, body: signature,
  });
  if (response.status === 401 || response.status === 403)
    throw new Error('구매자 역할로 로그인해 주세요');
  if (response.status === 404) throw new Error('배송지 또는 쿠폰을 다시 확인해 주세요');
  if (response.status === 409) throw new Error('예약·가격·재고·혜택이 변경됐습니다. 견적을 다시 확인해 주세요');
  if (!response.ok) throw new Error('주문 결과를 확인하지 못했습니다. 같은 버튼으로 다시 확인해 주세요');
  const order = await response.json() as PendingOrder;
  storage.setItem(orderStorageKey, order.id);
  storage.setItem(orderReservationKey, input.reservationId);
  return order;
}

export async function restorePendingOrderRequest(apiBase: string,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  send: typeof fetch = fetch, signal?: AbortSignal): Promise<PendingOrder | undefined> {
  const savedId = storage.getItem(orderStorageKey);
  const reservationId = storage.getItem(orderReservationKey) ?? undefined;
  if (!savedId) return undefined;
  const response = await send(`${apiBase}/customer/checkout/orders/${encodeURIComponent(savedId)}`,
    { credentials: 'include', signal, cache: 'no-store' });
  if (signal?.aborted || storage.getItem(orderStorageKey) !== savedId) return undefined;
  if (response.status === 404) { storage.removeItem(orderStorageKey); return undefined; }
  if (!response.ok) return undefined;
  const order = await response.json() as PendingOrder;
  if (signal?.aborted || storage.getItem(orderStorageKey) !== savedId || order.id !== savedId)
    return undefined;
  return { ...order, reservationId };
}

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
  reservation, nowMs, onReserve, onRelease, onRecheck, retryAvailable, children,
  addresses = [], selectedAddressId = '', onAddressChange, onSubmitOrder, pendingOrder,
  orderPayableWon, showMockPayment = false, onMockPayment, mockOutcome = 'approve',
  onMockOutcomeChange, paymentAttempt }: ViewProps) {
  const active = reservation?.status === 'ACTIVE';
  const currentPendingOrder = pendingOrder?.reservationId === reservation?.id ? pendingOrder : undefined;
  const seconds = active ? Math.max(0, Math.ceil((Date.parse(reservation.expiresAt) -
    (nowMs ?? Date.now())) / 1000)) : 0;
  const shownQuote = active ? reservation.quote : quote;
  const optionTitles = new Map(items.map((item) => [item.optionId, item.title]));
  const directOrdinal = new Map<string, number>((shownQuote?.shipments ?? [])
    .filter((shipment) => shipment.shippingMode === 'seller_direct')
    .map((shipment, index) => [shipment.key, index + 1]));
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
      <button type="button" className="secondary-button" disabled={!!busy || !!currentPendingOrder} onClick={onRelease}>예약 해제</button>
    </section> : reservation && reservation.status !== 'RELEASED' &&
      !(reservation.status === 'CONSUMED' && pendingOrder?.status === 'PAID') ?
      <section className="cart-quote" aria-label="종료된 예약 상태">
      <h2>예약을 다시 확인해 주세요</h2>
      <p>예약 번호 {reservation.id}</p>
      <p>{reservation.status === 'CANCELLED' ? '운영자가 예약을 취소했습니다' :
        reservation.status === 'CONSUMED' ? '예약 상품의 결제 확인이 완료됐습니다' : '예약 시간이 끝났습니다'}
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
          <ul>{shownQuote.shipments.map((shipment) => {
            const titles = shipment.lines.map((line) => optionTitles.get(line.optionId))
              .filter((title): title is string => !!title).join('·');
            const label = shipment.shippingMode === 'owool_fulfillment' ? '어울몰 모아 발송' :
              `판매자 직접 발송 ${directOrdinal.get(shipment.key)}`;
            return <li key={shipment.key}>
            <strong>{label}{titles ? ` · ${titles}` : ''}</strong>
            <span>상품 {won(shipment.goodsWon)} · 배송비 {won(shipment.shippingWon)} · 소계 {won(shipment.totalWon)}</span>
          </li>; })}</ul>
          <p>상품 {won(shownQuote.goodsWon)} + 배송비 {won(shownQuote.shippingWon)} = <strong>총 {won(shownQuote.totalWon)}</strong></p>
        </section> : <p role="status">현재 상품·재고를 확인해야 금액을 안내할 수 있습니다</p>}
        {!active && (shownQuote || retryAvailable) && onReserve ? <button type="button" className="primary-button" disabled={!!busy}
          onClick={onReserve}>{retryAvailable ? '이전 예약 결과 다시 확인' : '결제 준비 · 15분 재고 예약'}</button> : null}
        <p className="section-note">결제 기능은 준비 중입니다. 이 금액은 결제 확정 금액이 아닙니다.</p>
      </>}
    {pendingOrder && !currentPendingOrder ? <p role="status">{pendingOrder.status === 'PAID' ? '완료된 주문' : '이전 주문'} {pendingOrder.id} ·
      {pendingOrder.status === 'EXPIRED' ? '기한 만료' : pendingOrder.status === 'PAID' ? '결제 확인 완료' : '결제대기'} ·
      <a href="/account/customer">본인 주문 확인</a></p> : null}
    {active && onSubmitOrder ? <section className="cart-quote" aria-labelledby="pending-order-heading">
      <h2 id="pending-order-heading">결제대기 주문</h2>
      {currentPendingOrder ? <div role="status">
        <p>주문 번호 {currentPendingOrder.id} · {currentPendingOrder.status === 'EXPIRED' ? '기한 만료' :
          currentPendingOrder.status === 'PAID' ? '결제 확인 완료' : '결제대기'}</p>
        <p>서버 확정 금액 {won(currentPendingOrder.payableWon)} · 만료 시각 {new Date(currentPendingOrder.expiresAt).toLocaleString('ko-KR')}</p>
        <p>발송 주문 {currentPendingOrder.shipments.length}건 · {currentPendingOrder.status === 'PAID' ?
          currentPendingOrder.paidAt ?
            `결제 확인 시각 ${new Date(currentPendingOrder.paidAt).toLocaleString('ko-KR')}` :
            '결제 확인 완료' : '결제는 아직 완료되지 않았습니다.'}</p>
        {showMockPayment && currentPendingOrder.status === 'PENDING_PAYMENT' && onMockPayment ? <div>
          <p>개발 시험 전용 모의 결제입니다. 카드 결제나 실제 청구는 발생하지 않습니다.</p>
          <label htmlFor="mock-payment-outcome">시험 결과</label>
          <select id="mock-payment-outcome" value={mockOutcome} disabled={!!busy}
            onChange={(event) => onMockOutcomeChange?.(event.currentTarget.value as MockOutcome)}>
            <option value="approve">승인</option><option value="decline">거절</option>
            <option value="delay">지연</option>
          </select>
          <button type="button" className="primary-button" disabled={!!busy}
            onClick={() => onMockPayment(mockOutcome)}>모의 결제 {mockOutcome === 'approve' ? '승인' :
              mockOutcome === 'decline' ? '거절' : '지연'} 시험</button>
          {paymentAttempt ? <p role="status">모의 결제 시도 {paymentAttempt.status} · {won(paymentAttempt.amountWon)}</p> : null}
        </div> : null}
      </div> : <>
        <label htmlFor="checkout-address">받는 분 배송지</label>
        <select id="checkout-address" value={selectedAddressId} disabled={!!busy}
          onChange={(event) => onAddressChange?.(event.currentTarget.value)}>
          <option value="">배송지를 선택해 주세요</option>
          {addresses.map((address) => <option key={address.id} value={address.id}>
            {address.label}{address.recipientName ? ` · ${address.recipientName}` : ''}</option>)}
        </select>
        {addresses.length === 0 ? <p><a href="/account/customer">배송지를 먼저 등록해 주세요</a></p> : null}
        <p>서버 재확인 예정 금액 {won(orderPayableWon ?? shownQuote?.totalWon ?? 0)}</p>
        <button type="button" className="primary-button" disabled={!!busy || !selectedAddressId}
          onClick={onSubmitOrder}>결제대기 주문 생성</button>
        <p>주문 생성은 결제 승인이나 구매 완료가 아닙니다.</p>
      </>}
    </section> : null}
    {children}
  </main>;
}

export function PromotionCheckoutView({ base, coupons, goodsGrantId, goodsCode, shippingChoices,
  quote, busy, onGoodsGrant, onGoodsCode, onShippingChoice, onPreview }: {
  base: Quote; coupons: Coupon[]; goodsGrantId: string; goodsCode: string;
  shippingChoices: Record<string, ShippingChoice>; quote?: AppliedQuote; busy: boolean;
  onGoodsGrant: (id: string) => void; onGoodsCode: (code: string) => void;
  onShippingChoice: (key: string, choice: ShippingChoice) => void; onPreview: () => void;
}) {
  const goodsCoupons = coupons.filter((coupon) => coupon.rule.kind === 'goods_discount');
  const supportCoupons = coupons.filter((coupon) => coupon.rule.kind === 'shipping_support');
  return <section className="cart-quote" aria-labelledby="promotion-quote-heading">
    <h2 id="promotion-quote-heading">쿠폰 적용 견적</h2>
    <p>쿠폰 선택과 코드를 함께 입력하지 않습니다. 가격·배송비와 혜택은 결제 전에 다시 확인합니다.</p>
    <label htmlFor="promotion-goods-grant">상품 할인 쿠폰</label>
    <select id="promotion-goods-grant" value={goodsGrantId} disabled={busy}
      onChange={(event) => onGoodsGrant(event.currentTarget.value)}>
      <option value="">선택하지 않음</option>
      {goodsCoupons.map((coupon) => <option key={coupon.grantId} value={coupon.grantId}>{coupon.title}</option>)}
    </select>
    <label htmlFor="promotion-goods-code">상품 할인 코드</label>
    <input id="promotion-goods-code" name="goodsCode" value={goodsCode} disabled={busy}
      autoComplete="off" maxLength={40} onChange={(event) => onGoodsCode(event.currentTarget.value)} />
    {base.shipments.map((shipment, index) => {
      const choice = shippingChoices[shipment.key] ?? { grantId: '', code: '' };
      const free = shipment.shippingWon === 0;
      return <fieldset key={shipment.key} className="cart-quote">
        <legend>발송 {index + 1} · 배송비 {won(shipment.shippingWon)}</legend>
        <label htmlFor={`support-grant-${index}`}>배송비 지원 쿠폰</label>
        <select id={`support-grant-${index}`} value={choice.grantId} disabled={busy || free}
          onChange={(event) => onShippingChoice(shipment.key,
            { grantId: event.currentTarget.value, code: '' })}>
          <option value="">선택하지 않음</option>
          {supportCoupons.map((coupon) => <option key={coupon.grantId} value={coupon.grantId}>
            {coupon.title}</option>)}
        </select>
        <label htmlFor={`support-code-${index}`}>배송비 지원 코드</label>
        <input id={`support-code-${index}`} value={choice.code} autoComplete="off" maxLength={40}
          disabled={busy || free} onChange={(event) => onShippingChoice(shipment.key,
            { grantId: '', code: event.currentTarget.value })} />
        {free ? <p>무료배송 상품에는 배송비 지원이 적용되지 않습니다</p> : null}
      </fieldset>;
    })}
    <button type="button" className="secondary-button" disabled={busy} onClick={onPreview}>
      {busy ? '견적 확인 중' : '견적 다시 확인'}</button>
    {quote ? <div aria-live="polite">
      <h3>쿠폰 적용 예상 금액</h3>
      <ul>{quote.shipments.map((shipment, index) => <li key={shipment.key}>
        발송 {index + 1} · 상품 할인 {won(shipment.discountWon)} · 배송비 지원 {won(shipment.supportWon)} ·
        예상 소계 {won(shipment.payableTotalWon)}
      </li>)}</ul>
      <p>상품 할인 {won(quote.discountWon)} · 배송비 지원 {won(quote.supportWon)}</p>
      <p>예상 결제금액 <strong>{won(quote.payableTotalWon)}</strong></p>
      {quote.message ? <p>{quote.message}</p> : null}
      <p>이 금액은 견적이며 주문·결제 완료가 아닙니다.</p>
    </div> : null}
  </section>;
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
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [goodsGrantId, setGoodsGrantId] = useState('');
  const [goodsCode, setGoodsCode] = useState('');
  const [shippingChoices, setShippingChoices] = useState<Record<string, ShippingChoice>>({});
  const [promotionQuote, setPromotionQuote] = useState<AppliedQuote>();
  const [promotionBusy, setPromotionBusy] = useState(false);
  const [promotionMessage, setPromotionMessage] = useState('');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [pendingOrder, setPendingOrder] = useState<PendingOrder>();
  const [paymentAttempt, setPaymentAttempt] = useState<PaymentAttempt>();
  const [mockOutcome, setMockOutcome] = useState<MockOutcome>('approve');
  const showMockPayment = process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_PAYMENT_MODE === 'mock';
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

  useEffect(() => {
    if (!apiOrigin || reservation?.status !== 'ACTIVE') {
      setCoupons([]); setPromotionQuote(undefined); return;
    }
    const controller = new AbortController();
    setGoodsGrantId(''); setGoodsCode(''); setShippingChoices({}); setPromotionQuote(undefined);
    fetch(`${apiOrigin}/customer/promotions/coupons`,
      { credentials: 'include', signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('쿠폰 목록을 불러오지 못했습니다. 코드 입력은 가능합니다');
        if (!controller.signal.aborted) setCoupons(await response.json() as Coupon[]);
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setPromotionMessage(error instanceof Error ? error.message : '쿠폰 목록을 불러오지 못했습니다');
      });
    return () => controller.abort();
  }, [reservation?.id, reservation?.status]);

  const reservationQuoteKey = JSON.stringify(reservation?.quote ?? null);
  useEffect(() => { setPromotionQuote(undefined); }, [reservation?.id, reservationQuoteKey]);

  useEffect(() => {
    if (!apiOrigin || reservation?.status !== 'ACTIVE') return;
    const controller = new AbortController();
    fetch(`${apiOrigin}/customer/addresses`, { credentials: 'include', signal: controller.signal,
      cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('배송지를 불러오지 못했습니다');
      const found = await response.json() as Address[];
      if (!controller.signal.aborted) {
        setAddresses(found);
        setSelectedAddressId((current) => current || found[0]?.id || '');
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : '배송지를 불러오지 못했습니다');
    });
    return () => controller.abort();
  }, [reservation?.id, reservation?.status]);

  useEffect(() => {
    if (!apiOrigin) return;
    const controller = new AbortController();
    restorePendingOrderRequest(apiOrigin, window.sessionStorage, fetch, controller.signal)
      .then((order) => {
        if (order && !controller.signal.aborted &&
            window.sessionStorage.getItem(orderStorageKey) === order.id) setPendingOrder(order);
      }).catch(() => {});
    return () => controller.abort();
  }, []);

  async function submitOrder() {
    if (!apiOrigin || !reservation || reservation.status !== 'ACTIVE' || !selectedAddressId || busy ||
        pendingOrder?.reservationId === reservation.id) return;
    const shippingCoupons: ({ shipmentKey: string; grantId: string } |
      { shipmentKey: string; code: string })[] = [];
    for (const [shipmentKey, choice] of Object.entries(shippingChoices)) {
      if (choice.grantId) shippingCoupons.push({ shipmentKey, grantId: choice.grantId });
      else if (choice.code.trim()) shippingCoupons.push({ shipmentKey, code: choice.code.trim() });
    }
    const goodsCoupon = goodsGrantId ? { grantId: goodsGrantId } :
      goodsCode.trim() ? { code: goodsCode.trim() } : undefined;
    if ((goodsCoupon || shippingCoupons.length) && !promotionQuote) {
      setMessage('쿠폰 견적을 다시 확인한 뒤 주문을 생성해 주세요'); return;
    }
    setBusy('order'); setMessage('');
    try {
      const order = await submitOrderRequest(apiOrigin, window.sessionStorage, {
        reservationId: reservation.id, addressId: selectedAddressId,
        selections: { ...(goodsCoupon ? { goodsCoupon } : {}), shippingCoupons },
        expectedPayableWon: promotionQuote?.payableTotalWon ?? reservation.quote?.totalWon ?? 0,
      });
      setPendingOrder({ ...order, reservationId: reservation.id });
      setMessage('결제대기 주문이 저장됐습니다. 결제는 아직 완료되지 않았습니다');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '주문 결과를 확인하지 못했습니다');
    } finally { setBusy(''); }
  }

  async function submitMockPayment(outcome: MockOutcome) {
    if (!apiOrigin || !showMockPayment || !pendingOrder || pendingOrder.status !== 'PENDING_PAYMENT' || busy) return;
    setBusy('payment'); setMessage('');
    try {
      const attempt = await startMockPaymentRequest(apiOrigin, window.sessionStorage,
        pendingOrder.id, outcome);
      setPaymentAttempt(attempt);
      const response = await fetch(`${apiOrigin}/customer/checkout/orders/${encodeURIComponent(pendingOrder.id)}`,
        { credentials: 'include', cache: 'no-store' });
      if (!response.ok) throw new Error('결제 시도는 기록됐지만 주문 상태를 다시 확인하지 못했습니다');
      const order = await response.json() as PendingOrder;
      if (order.id === pendingOrder.id) setPendingOrder({ ...order, reservationId: pendingOrder.reservationId });
      setMessage(order.status === 'PAID' ? '모의 결제 승인과 주문 확정을 확인했습니다' :
        attempt.status === 'DECLINED' ? '모의 결제가 거절됐습니다. 새 시도로 다시 시험할 수 있습니다' :
          '모의 결제 확인이 지연 중입니다. 본인 주문 상태를 다시 확인해 주세요');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '모의 결제 결과를 확인하지 못했습니다');
    } finally { setBusy(''); }
  }

  async function previewPromotions() {
    if (!apiOrigin || !reservation || reservation.status !== 'ACTIVE' || promotionBusy) return;
    setPromotionBusy(true); setPromotionMessage(''); setPromotionQuote(undefined);
    try {
      const shippingCoupons: ({ shipmentKey: string; grantId: string } |
        { shipmentKey: string; code: string })[] = [];
      for (const [shipmentKey, choice] of Object.entries(shippingChoices)) {
        if (choice.grantId) shippingCoupons.push({ shipmentKey, grantId: choice.grantId });
        else if (choice.code.trim()) shippingCoupons.push({ shipmentKey, code: choice.code.trim() });
      }
      const goodsCoupon = goodsGrantId ? { grantId: goodsGrantId } :
        goodsCode.trim() ? { code: goodsCode.trim() } : undefined;
      const response = await fetch(`${apiOrigin}/customer/checkout/reservations/${encodeURIComponent(reservation.id)}/promotions/quote`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...(goodsCoupon ? { goodsCoupon } : {}), shippingCoupons }),
      });
      if (response.status === 401 || response.status === 403) throw new Error('구매자 역할로 로그인해 주세요');
      if (response.status === 404) throw new Error('사용할 수 없는 쿠폰입니다. 목록과 코드를 확인해 주세요');
      if (response.status === 409) throw new Error('예약·상품·쿠폰 기간 또는 사용 한도가 바뀌었습니다. 다시 확인해 주세요');
      if (!response.ok) throw new Error('쿠폰 견적을 확인하지 못했습니다');
      setPromotionQuote(await response.json() as AppliedQuote);
    } catch (error) { setPromotionMessage(error instanceof Error ? error.message : '쿠폰 견적을 확인하지 못했습니다'); }
    finally { setPromotionBusy(false); }
  }

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
    addresses={addresses} selectedAddressId={selectedAddressId} onAddressChange={setSelectedAddressId}
    onSubmitOrder={() => void submitOrder()} pendingOrder={pendingOrder}
    showMockPayment={showMockPayment} onMockPayment={(outcome) => void submitMockPayment(outcome)}
    mockOutcome={mockOutcome} onMockOutcomeChange={setMockOutcome} paymentAttempt={paymentAttempt}
    orderPayableWon={promotionQuote?.payableTotalWon ?? reservation?.quote?.totalWon}
    onReserve={() => void reserve()} onRelease={() => void release()}
    onRecheck={() => { setReservation(undefined); void refresh().catch(() =>
      setMessage('상품과 금액을 다시 확인하지 못했습니다')); }}
    onEdit={(id, quantity) => setEdits((old) => ({ ...old, [id]: quantity }))}
    onSave={(id) => mutate(id, 'PUT')} onRemove={(id) => mutate(id, 'DELETE')}>
    {reservation?.status === 'ACTIVE' && reservation.quote ? <>
      {promotionMessage ? <p role="alert">{promotionMessage}</p> : null}
      <PromotionCheckoutView base={reservation.quote} coupons={coupons} goodsGrantId={goodsGrantId}
        goodsCode={goodsCode} shippingChoices={shippingChoices} quote={promotionQuote}
        busy={promotionBusy || !!busy}
        onGoodsGrant={(id) => { setGoodsGrantId(id); if (id) setGoodsCode(''); setPromotionQuote(undefined); }}
        onGoodsCode={(code) => { setGoodsCode(code); if (code) setGoodsGrantId(''); setPromotionQuote(undefined); }}
        onShippingChoice={(key, choice) => { setShippingChoices((old) => ({ ...old, [key]: choice }));
          setPromotionQuote(undefined); }} onPreview={() => void previewPromotions()} />
    </> : null}
  </CartView>;
}
