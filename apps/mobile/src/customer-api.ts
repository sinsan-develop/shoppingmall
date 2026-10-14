export type ApiErrorCode = 'unauthorized' | 'forbidden' | 'conflict' | 'not_found' | 'invalid' | 'unavailable' | 'offline';
export class CustomerApiError extends Error {
  constructor(public readonly code: ApiErrorCode) {
    super({ unauthorized: '로그인이 만료되었습니다. 다시 로그인해 주세요.', forbidden: '구매자 권한이 필요합니다.',
      conflict: '가격·재고·처리 상태가 변경되었습니다. 다시 조회해 주세요.', not_found: '대상을 찾을 수 없거나 이 환경에서 사용할 수 없습니다.',
      invalid: '입력값을 확인해 주세요.', unavailable: '서버 기능을 사용할 수 없습니다.',
      offline: '연결하지 못했습니다. 처리 결과가 불명확하므로 같은 입력으로 다시 확인해 주세요.' }[code]);
  }
}
export type ProductSummary = { productId: string; title: string; sellerName: string; originLabel: string; minPriceWon: number };
export type Product = ProductSummary & { description: string; shippingMode: string; saleStopped: boolean;
  images: { id: string }[]; options: { id: string; name: string; priceWon: number; sellableQuantity: number }[] };
export type CartItem = { optionId: string; productId: string; title: string; optionName: string; quantity: number;
  unitPriceWon: number | null; availability: 'available' | 'unavailable' };
export type Quote = { totalWon: number; goodsWon: number; shippingWon: number;
  shipments: { key: string; shippingMode: string; goodsWon: number; shippingWon: number; totalWon: number }[] };
export type Reservation = { id: string; status: string; expiresAt: string; quote?: Quote };
export type AddressInput = { label: string; recipientName: string; phone: string; postalCode: string;
  line1: string; line2: string; isDefault: boolean };
export type Address = AddressInput & { id: string };
export type Preferences = { marketingEmail: boolean; marketingSms: boolean; push: boolean };
export type Order = { id: string; status: string; payableWon: number; expiresAt: string;
  shipments: { id: string; status: string; payableWon: number;
    lines: { optionId: string; productName: string; optionName: string; quantity: number }[];
    fulfillment?: { status: string; expectedShipDate: string | null; delayedReason: string | null;
      customerMessage: string | null; carrier: { displayName: string; code: string } | null; trackingNumber: string | null } | null }[] };
export type CouponSelector = { grantId: string; code?: never } | { code: string; grantId?: never };
export type HeldCoupon = { grantId: string; campaignId: string; title: string; rule: { kind: 'goods_discount' | 'shipping_support' } };
export type PromotionQuote = Omit<Quote, 'shipments'> & { payableTotalWon: number; discountWon: number; supportWon: number; message?: string;
  shipments: (Quote['shipments'][number] & { discountWon: number; supportWon: number; payableTotalWon: number })[] };
export type OrderInput = { reservationId: string; addressId: string; expectedPayableWon: number;
  selections: { goodsCoupon?: CouponSelector; shippingCoupons?: ({ shipmentKey: string } & CouponSelector)[] } };
export type RefundInput = { shipmentOrderId: string; lines: { optionId: string; quantity: number }[];
  reasonCode: 'customer_request' | 'other'; reason: string };
export type RefundCase = { id: string; checkoutOrderId: string; shipmentOrderId: string; reasonCode: string; reason: string;
  status: 'REQUESTED' | 'APPROVED' | 'PROCESSING' | 'REFUNDED' | 'REJECTED' | 'REVIEW_REQUIRED';
  totalRefundWon: number; amountFinal: boolean; estimateAvailable: boolean;
  lines: { optionId: string; productName: string; optionName: string; quantity: number }[];
  history: { fromStatus: string | null; toStatus: string; createdAt: string }[] };
export type Confirmation = { id: string; reviewId: string | null; reviewStatus: string | null };
export type Review = { id: string; status: string; rating: number; body: string; images: { id: string; scanStatus: string }[] };
export type ClaimInput = { orderId: string; shipmentOrderId: string; optionId: string;
  kind: 'CLAIM' | 'RETURN' | 'EXCHANGE'; reasonCode: 'quality_issue' | 'damaged' | 'wrong_delivery' | 'change_of_mind' | 'other';
  reason: string; quantity: number };
export type ClaimSummary = { id: string; kind: string; status: string; shipmentOrderId: string };
export type Claim = ClaimSummary & { reason: string; quantity: number; decisionReason: string | null;
  messages: { id: string; authorRole: string; body: string }[]; evidence: { id: string }[];
  events: { action: string; afterStatus: string; occurredAt: string }[] };
export type Question = { id: string; productId: string; body: string; status: string;
  messages?: { id: string; body: string; authorRole: string }[] };
export type Page<T> = { items: T[]; nextCursor: string | null };
export type Favorite = { productId: string; title: string | null; published: boolean; saleStopped: boolean; createdAt: string };
export type RestockSubscription = { id: string; productId: string; title: string | null; optionName: string;
  status: 'active' | 'cancelled' | 'notified'; optionState: 'unpublished' | 'sale_stopped' | 'missing' | 'available' | 'sold_out';
  currentOptionId: string | null; saleStopped: boolean; requestedAt: string; cancelledAt: string | null; notifiedAt: string | null };

/** All amounts, ownership and inventory are decided by the existing server. No local price policy. */
export class CustomerApi {
  onSessionExpired?: () => void;
  private readonly keys = new Map<string, { signature: string; key: string }>();
  constructor(private readonly config: { apiOrigin: string; webOrigin: string;
    createKey: () => string; send?: typeof fetch }) {
    for (const value of [config.apiOrigin, config.webOrigin]) {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value || url.username || url.password)
        throw new CustomerApiError('invalid');
    }
  }
  private key(scope: string, input: unknown) {
    const signature = JSON.stringify(input);
    const previous = this.keys.get(scope);
    if (previous?.signature === signature) return previous.key;
    const key = this.config.createKey();
    this.keys.set(scope, { signature, key });
    return key;
  }
  async request<T>(path: string, method = 'GET', body?: unknown, key?: string): Promise<T> {
    let response: Response;
    try {
      response = await (this.config.send ?? fetch)(`${this.config.apiOrigin}${path}`, {
        method, credentials: 'include', cache: 'no-store', headers: {
          ...(method !== 'GET' ? { Origin: this.config.webOrigin } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(key ? { 'idempotency-key': key } : {}),
        }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new CustomerApiError('offline'); }
    if (!response.ok) {
      if (response.status === 401) { this.keys.clear(); this.onSessionExpired?.(); }
      const code = ({ 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict',
        400: 'invalid' } as Record<number, ApiErrorCode>)[response.status] ?? 'unavailable';
      throw new CustomerApiError(code);
    }
    try { return await response.json() as T; } catch { throw new CustomerApiError('unavailable'); }
  }
  products(query = '', page = 1) {
    const params = new URLSearchParams({ q: query, sort: 'latest', page: String(page) });
    return this.request<ProductSummary[]>(`/catalog/products?${params}`);
  }
  product(id: string) { return this.request<Product>(`/catalog/products/${encodeURIComponent(id)}`); }
  login(email: string, password: string) {
    return this.request<{ status: string }>('/auth/login', 'POST', { email, password, role: 'customer' });
  }
  async logout() {
    try { return await this.request('/auth/logout', 'POST'); }
    finally { this.keys.clear(); this.onSessionExpired?.(); }
  }
  me() { return this.request<{ role: string }>('/auth/me'); }
  favorites() { return this.request<Favorite[]>('/customer/favorites'); }
  addFavorite(id: string) { return this.request<{ productId: string; favorite: true }>(`/customer/favorites/${encodeURIComponent(id)}`, 'PUT'); }
  removeFavorite(id: string) { return this.request<{ productId: string; favorite: false }>(`/customer/favorites/${encodeURIComponent(id)}`, 'DELETE'); }
  restockSubscriptions() { return this.request<RestockSubscription[]>('/customer/restock-subscriptions'); }
  subscribeRestock(productId: string, optionId: string) {
    return this.request<{ id: string; status: 'active' }>('/customer/restock-subscriptions', 'POST', { productId, optionId });
  }
  cancelRestock(id: string) { return this.request<{ id: string; status: 'cancelled' }>(`/customer/restock-subscriptions/${encodeURIComponent(id)}`, 'DELETE'); }
  cart() { return this.request<CartItem[]>('/customer/cart'); }
  quote() { return this.request<Quote>('/customer/cart/quote'); }
  setCartItem(id: string, quantity: number) {
    return this.request<CartItem[]>(`/customer/cart/items/${encodeURIComponent(id)}`, 'PUT', { quantity });
  }
  removeCartItem(id: string) { return this.request<CartItem[]>(`/customer/cart/items/${encodeURIComponent(id)}`, 'DELETE'); }
  reserve() {
    return this.request<Reservation>('/customer/checkout/reservations', 'POST', undefined, this.key('reserve', {}));
  }
  reservation(id: string) { return this.request<Reservation>(`/customer/checkout/reservations/${encodeURIComponent(id)}`); }
  async activeReservation() {
    try { return await this.request<Reservation>('/customer/checkout/reservations/active'); }
    catch (error) {
      if (error instanceof CustomerApiError && error.code === 'not_found') { this.keys.delete('reserve'); return undefined; }
      throw error;
    }
  }
  async release(id: string) {
    const value = await this.request<Reservation>(`/customer/checkout/reservations/${encodeURIComponent(id)}`, 'DELETE');
    this.keys.delete('reserve'); return value;
  }
  promotionQuote(id: string, selections: OrderInput['selections']) {
    return this.request<PromotionQuote>(
      `/customer/checkout/reservations/${encodeURIComponent(id)}/promotions/quote`, 'POST', selections);
  }
  coupons() { return this.request<HeldCoupon[]>('/customer/promotions/coupons'); }
  submitOrder(input: OrderInput) {
    return this.request<Order>('/customer/checkout/orders', 'POST', input, this.key('order', input));
  }
  order(id: string) { return this.request<Order>(`/customer/checkout/orders/${encodeURIComponent(id)}`); }
  refunds(orderId: string) { return this.request<RefundCase[]>(`/customer/checkout/orders/${encodeURIComponent(orderId)}/refund-cases`); }
  async requestRefund(orderId: string, input: RefundInput) {
    const scope = `refund:${orderId}:${input.shipmentOrderId}`;
    const result = await this.request<RefundCase>(`/customer/checkout/orders/${encodeURIComponent(orderId)}/refund-cases`,
      'POST', input, this.key(scope, input));
    this.keys.delete(scope); return result;
  }
  confirmPurchase(orderId: string, shipmentOrderId: string, optionId: string) {
    const input = { orderId, shipmentOrderId, optionId };
    return this.request<{ id: string }>('/customer/support/confirmations', 'POST', input,
      this.key(`confirmation:${shipmentOrderId}:${optionId}`, input));
  }
  async confirmation(shipmentId: string, optionId: string) {
    try { return await this.request<Confirmation>(`/customer/support/confirmations/${encodeURIComponent(shipmentId)}/${encodeURIComponent(optionId)}`); }
    catch (error) { if (error instanceof CustomerApiError && error.code === 'not_found') return undefined; throw error; }
  }
  review(id: string) { return this.request<Review>(`/customer/support/reviews/${encodeURIComponent(id)}`); }
  async createReview(confirmationId: string, rating: number, text: string) {
    const input = { confirmationId, rating, text }; const scope = `review:${confirmationId}`;
    const result = await this.request<{ id: string; status: string }>('/customer/support/reviews', 'POST', input, this.key(scope, input));
    this.keys.delete(scope); return result;
  }
  async editReview(id: string, rating: number, text: string) {
    const input = { rating, text }; const scope = `review-edit:${id}`;
    const result = await this.request<{ id: string; status: string }>(`/customer/support/reviews/${encodeURIComponent(id)}`,
      'PUT', input, this.key(scope, input)); this.keys.delete(scope); return result;
  }
  async createClaim(input: ClaimInput) {
    const scope = `claim:${input.orderId}:${input.shipmentOrderId}:${input.optionId}`;
    const result = await this.request<{ id: string; status: string }>('/customer/support/claims', 'POST', input, this.key(scope, input));
    this.keys.delete(scope); return result;
  }
  claims(cursor = '') { return this.request<Page<ClaimSummary>>(`/customer/support/claims${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`); }
  claim(id: string) { return this.request<Claim>(`/customer/support/claims/${encodeURIComponent(id)}`); }
  orders(cursor = '') {
    const params = new URLSearchParams({ status: 'PAID', limit: '20' });
    if (cursor) params.set('cursor', cursor);
    return this.request<Page<Order>>(`/customer/checkout/orders?${params}`);
  }
  payMock(id: string, testOutcome: 'approve' | 'decline' | 'delay') {
    return this.request<{ status: string; mockOnly: boolean }>(
      `/customer/checkout/orders/${encodeURIComponent(id)}/payment-attempts`, 'POST', { testOutcome },
      this.key('payment', { id, testOutcome }));
  }
  addresses() { return this.request<Address[]>('/customer/addresses'); }
  addAddress(input: AddressInput) { return this.request<{ id: string }>('/customer/addresses', 'POST', input); }
  preferences() { return this.request<Preferences>('/customer/preferences'); }
  savePreferences(input: Preferences) { return this.request('/customer/preferences', 'PUT', input); }
  questions(cursor = '') { return this.request<Page<Question>>(`/customer/support/questions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`); }
  question(id: string) { return this.request<Question>(`/customer/support/questions/${encodeURIComponent(id)}`); }
  async askQuestion(productId: string, text: string) {
    const input = { productId, text };
    const result = await this.request<Question>('/customer/support/questions', 'POST', input, this.key('question', input));
    this.keys.delete('question'); return result;
  }
}
