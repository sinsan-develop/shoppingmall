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
export type OrderInput = { reservationId: string; addressId: string; expectedPayableWon: number;
  selections: { goodsCoupon?: { code: string }; shippingCoupons?: { shipmentKey: string; code: string }[] } };
export type Question = { id: string; productId: string; body: string; status: string;
  messages?: { id: string; body: string; authorRole: string }[] };
export type Page<T> = { items: T[]; nextCursor: string | null };

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
  async release(id: string) {
    const value = await this.request<Reservation>(`/customer/checkout/reservations/${encodeURIComponent(id)}`, 'DELETE');
    this.keys.delete('reserve'); return value;
  }
  promotionQuote(id: string, selections: OrderInput['selections']) {
    return this.request<Quote & { payableTotalWon: number; discountWon: number; supportWon: number }>(
      `/customer/checkout/reservations/${encodeURIComponent(id)}/promotions/quote`, 'POST', selections);
  }
  submitOrder(input: OrderInput) {
    return this.request<Order>('/customer/checkout/orders', 'POST', input, this.key('order', input));
  }
  order(id: string) { return this.request<Order>(`/customer/checkout/orders/${encodeURIComponent(id)}`); }
  orders(cursor = '') { return this.request<Page<Order>>(`/customer/checkout/orders${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`); }
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
  askQuestion(productId: string, text: string) {
    const input = { productId, text };
    return this.request<Question>('/customer/support/questions', 'POST', input, this.key('question', input));
  }
}
