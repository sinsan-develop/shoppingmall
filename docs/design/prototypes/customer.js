const PRODUCTS = [
  { id: 'pepper-a', name: '아삭한 제철 고추 1kg', origin: '경북', seller: '농가 A', shipmentId: 'farm-a', price: 52000, discount: 5000, stock: 18 },
  { id: 'pepper-powder-b', name: '햇고추 고춧가루 500g', origin: '전남', seller: '농가 B', shipmentId: 'farm-b', price: 23900, discount: 0, stock: 8 },
  { id: 'onion-b', name: '단단한 햇양파 3kg', origin: '경남', seller: '농가 B', shipmentId: 'farm-b', price: 30000, discount: 0, stock: 24 },
  { id: 'garlic-owool', name: '꼼꼼히 고른 통마늘 1kg', origin: '충남', seller: '어울몰', shipmentId: 'owool', price: 18000, discount: 0, stock: 12 },
  { id: 'blueberry-soldout', name: '제철 블루베리 500g', origin: '경남', seller: '농가 A', shipmentId: 'farm-a', price: 26000, discount: 0, stock: 0 },
];

const won = (value) => `${value.toLocaleString('ko-KR')}원`;

function createCustomerState() {
  return { products: PRODUCTS.map((product) => ({ ...product })), cart: [], paymentStatus: 'idle', shipments: [], refundAmount: 0, step: 'catalog' };
}

function addItem(state, productId, quantity = 1) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return { state, error: '상품을 찾을 수 없습니다.' };
  if (product.stock <= 0) return { state, error: '품절 또는 재고 0개 상품은 담을 수 없습니다.' };
  if (state.paymentStatus === 'success') return { state, error: '주문 완료 후에는 장바구니를 바꿀 수 없습니다.' };
  if (!Number.isInteger(quantity) || quantity < 1) return { state, error: '수량은 1개 이상의 정수로 입력해 주세요.' };
  const existing = state.cart.find((item) => item.productId === productId);
  if ((existing?.quantity ?? 0) + quantity > product.stock) return { state, error: `재고 ${product.stock}개를 초과할 수 없습니다.` };
  const cart = existing
    ? state.cart.map((item) => item.productId === productId ? { ...item, quantity: item.quantity + quantity } : item)
    : [...state.cart, { productId, quantity }];
  return { state: { ...state, cart }, error: null };
}

function setItemQuantity(state, productId, quantity) {
  if (state.paymentStatus === 'success') return { state, error: '주문 완료 후에는 수량을 바꿀 수 없습니다.' };
  const item = state.cart.find((entry) => entry.productId === productId);
  if (!item) return { state, error: '장바구니에서 상품을 찾을 수 없습니다.' };
  const product = state.products.find((entry) => entry.id === productId);
  if (!Number.isInteger(quantity) || quantity < 1) return { state, error: '수량은 1개 이상의 정수로 입력해 주세요. 삭제는 제거 버튼을 이용해 주세요.' };
  if (quantity > product.stock) return { state, error: `재고 ${product.stock}개를 초과할 수 없습니다.` };
  return { state: { ...state, cart: state.cart.map((entry) => entry.productId === productId ? { ...entry, quantity } : entry) }, error: null };
}

function removeItem(state, productId) {
  if (state.paymentStatus === 'success') return { state, error: '주문 완료 후에는 상품을 제거할 수 없습니다.' };
  if (!state.cart.some((entry) => entry.productId === productId)) return { state, error: '장바구니에서 상품을 찾을 수 없습니다.' };
  return { state: { ...state, cart: state.cart.filter((entry) => entry.productId !== productId) }, error: null };
}

function quoteCart(state) {
  const groups = [];
  for (const cartItem of state.cart) {
    const product = state.products.find((item) => item.id === cartItem.productId);
    if (!product || product.stock < cartItem.quantity) continue;
    let group = groups.find((item) => item.shipmentId === product.shipmentId);
    if (!group) {
      group = { shipmentId: product.shipmentId, seller: product.seller, subtotal: 0, discount: 0, shipping: 0, payable: 0, items: [] };
      groups.push(group);
    }
    group.subtotal += product.price * cartItem.quantity;
    group.discount += product.discount * cartItem.quantity;
    group.items.push({ name: product.name, quantity: cartItem.quantity, price: product.price });
  }
  for (const group of groups) {
    group.shipping = group.subtotal >= 50000 ? 0 : 3000;
    group.payable = group.subtotal - group.discount + group.shipping;
  }
  return { groups, total: groups.reduce((sum, group) => sum + group.payable, 0) };
}

function simulatePayment(state, result) {
  if (state.cart.length === 0) return { state, error: '장바구니가 비어 있어 결제를 진행할 수 없습니다.' };
  if (state.cart.some((item) => (state.products.find((product) => product.id === item.productId)?.stock ?? 0) < item.quantity)) {
    return { state, error: '품절 또는 재고 부족 상품이 있어 결제를 진행할 수 없습니다.' };
  }
  if (!['success', 'failure'].includes(result)) return { state, error: '결제 시안 결과가 올바르지 않습니다.' };
  if (state.paymentStatus === 'success') return { state, error: '이미 완료된 가상 주문입니다.' };
  if (result === 'failure') return { state: { ...state, paymentStatus: 'failure', shipments: [] }, error: null };
  const shipments = quoteCart(state).groups.map((group) => ({ ...group, status: 'paid' }));
  return { state: { ...state, paymentStatus: 'success', shipments, refundAmount: 0, step: 'orders' }, error: null };
}

function cancelPreShipment(state, shipmentId) {
  const shipment = state.shipments.find((item) => item.shipmentId === shipmentId);
  if (!shipment) return { state, error: '취소할 가상 발송 주문이 없습니다.' };
  if (shipment.status !== 'paid') return { state, error: '이미 취소했거나 출고 전 취소 대상이 아닙니다.' };
  return {
    state: {
      ...state,
      shipments: state.shipments.map((item) => item.shipmentId === shipmentId ? { ...item, status: 'cancelled' } : item),
      refundAmount: shipment.payable,
    },
    error: null,
  };
}

function mountCustomer(root) {
  let state = createCustomerState();
  const notice = root.querySelector('[data-notice]');
  const setNotice = (message) => { notice.textContent = message; };

  function render() {
    root.querySelectorAll('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== state.step; });
    root.querySelectorAll('[data-step]').forEach((button) => { button.setAttribute('aria-current', button.dataset.step === state.step ? 'step' : 'false'); });
    root.querySelector('[data-catalog]').innerHTML = state.products.map((product) => `
      <article class="card product"><div class="ms-ph">${product.name} 사진</div><div class="product-body">
      <span class="origin">${product.origin} · ${product.seller === '어울몰' ? '어울몰 발송' : '농가 직접 발송'}</span>
      <h3>${product.name}</h3><p class="muted">${product.stock ? `재고 ${product.stock}개 · 출고 안내 확인` : '재고 0개 · 구매 차단'}</p>
      <div class="product-footer"><span class="price">${won(product.price)}</span><label class="quantity-label" for="catalog-qty-${product.id}">수량 <input class="field quantity-input" id="catalog-qty-${product.id}" data-catalog-qty data-id="${product.id}" type="number" min="1" max="${product.stock}" step="1" value="1" ${product.stock && state.paymentStatus !== 'success' ? '' : 'disabled'}></label><button type="button" class="btn small" data-action="add" data-id="${product.id}" ${product.stock && state.paymentStatus !== 'success' ? '' : 'disabled'}>${product.stock ? '장바구니 담기' : '품절'}</button></div></div></article>`).join('');
    const quote = quoteCart(state);
    root.querySelector('[data-cart-count]').textContent = `${state.cart.length}종 · 총 ${state.cart.reduce((sum, item) => sum + item.quantity, 0)}개`;
    root.querySelector('[data-shipment-count]').textContent = `${quote.groups.length}개`;
    root.querySelector('[data-cart-items]').innerHTML = state.cart.length
      ? state.cart.map((item) => { const product = state.products.find((entry) => entry.id === item.productId); return `<li class="cart-line"><div><strong>${product.name}</strong><p class="muted">${product.seller} · 재고 ${product.stock}개</p><span>${won(product.price)} × ${item.quantity} = ${won(product.price * item.quantity)}</span></div><label class="quantity-label" for="cart-qty-${product.id}">수량 <input class="field quantity-input" id="cart-qty-${product.id}" data-cart-qty data-id="${product.id}" type="number" min="1" max="${product.stock}" step="1" value="${item.quantity}" ${state.paymentStatus === 'success' ? 'disabled' : ''}></label><button type="button" class="btn small secondary" data-action="remove" data-id="${product.id}" ${state.paymentStatus === 'success' ? 'disabled' : ''}>제거</button></li>`; }).join('')
      : '<li>장바구니가 비어 있습니다.</li>';
    root.querySelector('[data-quote-groups]').innerHTML = quote.groups.length
      ? quote.groups.map((group) => `<article class="card panel"><h3>${group.seller} · 별도 발송 주문</h3><p>${group.items.map((item) => `${item.name} × ${item.quantity}`).join(', ')}</p><p>할인 전 ${won(group.subtotal)} · 할인 ${won(group.discount)} · 배송비 ${won(group.shipping)}</p><strong>이 주문 결제액 ${won(group.payable)}</strong></article>`).join('')
      : '<p>장바구니가 비어 있습니다.</p>';
    root.querySelector('[data-total]').textContent = won(quote.total);
    root.querySelector('[data-orders]').innerHTML = state.shipments.length
      ? state.shipments.map((group) => `<article class="card panel"><h3>${group.seller} · ${group.status === 'cancelled' ? '취소' : '결제 완료'}</h3><p>${group.items.map((item) => `${item.name} × ${item.quantity}`).join(', ')}</p><p>상품 ${won(group.subtotal - group.discount)} + 배송비 ${won(group.shipping)}</p>${group.status === 'paid' ? `<button type="button" class="btn small secondary" data-action="cancel" data-id="${group.shipmentId}">출고 전 전체 취소(모의)</button>` : `<p>가상 환불 ${won(group.payable)} · 다른 주문은 유지</p>`}</article>`).join('')
      : '<p>완료된 가상 주문이 없습니다.</p>';
    root.querySelector('[data-refund]').textContent = state.refundAmount ? `최근 가상 환불액 ${won(state.refundAmount)}. 출고 후 배송비·반송비는 법률·약관 검토 전 미확정입니다.` : '출고 후 배송비·반송비는 법률·약관 검토 전 미확정입니다.';
    root.querySelector('[data-payment-status]').textContent = state.paymentStatus === 'failure' ? '모의 결제 실패 · 주문은 생성되지 않았습니다. 다시 시도해 보세요.' : '실제 결제는 진행되지 않습니다.';
  }

  root.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action],button[data-step]');
    if (!button || !root.contains(button)) return;
    if (button.dataset.step) { state = { ...state, step: button.dataset.step }; setNotice(`${button.textContent.trim()} 화면입니다.`); render(); return; }
    const action = button.dataset.action;
    if (action === 'reset') { state = createCustomerState(); setNotice('가상 시안을 처음 상태로 돌렸습니다.'); }
    if (action === 'add') { const input = root.querySelector(`[data-catalog-qty][data-id="${button.dataset.id}"]`); const result = addItem(state, button.dataset.id, Number(input.value)); state = result.state; setNotice(result.error ?? '선택한 수량을 장바구니에 담았습니다.'); }
    if (action === 'remove') { const result = removeItem(state, button.dataset.id); state = result.state; setNotice(result.error ?? '장바구니에서 상품을 제거했습니다.'); }
    if (action === 'checkout') { if (!state.cart.length) setNotice('장바구니가 비어 있습니다.'); else { state = { ...state, step: 'checkout' }; setNotice('발송 주문과 통합 결제액을 확인해 주세요.'); } }
    if (action === 'pay-success' || action === 'pay-failure') { const result = simulatePayment(state, action === 'pay-success' ? 'success' : 'failure'); state = result.state; setNotice(result.error ?? (action === 'pay-success' ? '모의 결제가 완료됐습니다.' : '모의 결제에 실패했습니다.')); }
    if (action === 'cancel') { const result = cancelPreShipment(state, button.dataset.id); state = result.state; setNotice(result.error ?? `출고 전 발송 주문을 취소했습니다. 가상 환불액 ${won(state.refundAmount)}.`); }
    render();
  });
  root.addEventListener('change', (event) => {
    if (!event.target.matches('[data-cart-qty]')) return;
    const result = setItemQuantity(state, event.target.dataset.id, Number(event.target.value));
    state = result.state;
    setNotice(result.error ?? '장바구니 수량과 금액을 변경했습니다.');
    render();
  });
  render();
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-customer-prototype]');
  if (root) mountCustomer(root);
}

if (typeof module !== 'undefined') {
  module.exports = { createCustomerState, addItem, setItemQuantity, removeItem, quoteCart, simulatePayment, cancelPreShipment, mountCustomer };
}
