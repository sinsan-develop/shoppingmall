function createSellerState() {
  return {
    role: '농가 A 판매자', publicFreeShippingThreshold: 50000, policyRequest: null,
    products: [{ id: 'pepper-a', name: '아삭한 제철 고추 1kg', stock: 18, purchasable: true }],
    restockRequest: null,
    orders: [{ id: 'QA-FARM-A-001', product: '고추 1kg × 1', status: 'preparing', trackingNumber: '' }],
    step: 'today',
  };
}

function requestFreeShipping(state, proposedThreshold) {
  if (!Number.isInteger(proposedThreshold) || proposedThreshold < 0) return { state, error: '무료배송 기준은 0원 이상의 정수여야 합니다.' };
  if (state.policyRequest?.status === 'pending') return { state, error: '이미 승인 대기 중인 요청이 있습니다.' };
  return { state: { ...state, policyRequest: { proposedThreshold, status: 'pending' } }, error: null };
}

function markSoldOut(state, productId) {
  return setStockQuantity(state, productId, 0);
}

function requestRestock(state, productId, proposedStock) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return { state, error: '담당 상품을 찾을 수 없습니다.' };
  if (!Number.isInteger(proposedStock) || proposedStock <= 0) return { state, error: '요청 재고는 1개 이상이어야 합니다.' };
  if (proposedStock <= product.stock) return { state, error: '현재 재고보다 많은 수량만 승인 요청할 수 있습니다.' };
  if (state.restockRequest?.status === 'pending') return { state, error: '이미 재판매 승인 대기 중입니다.' };
  return { state: { ...state, restockRequest: { productId, proposedStock, status: 'pending' } }, error: null };
}

function setStockQuantity(state, productId, quantity) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return { state, error: '담당 상품을 찾을 수 없습니다.' };
  if (!Number.isInteger(quantity) || quantity < 0) return { state, error: '재고 수량은 0개 이상의 정수로 입력해 주세요.' };
  if (quantity === product.stock) return { state, error: '현재 재고와 같은 수량입니다.' };
  if (quantity > product.stock) return requestRestock(state, productId, quantity);
  return { state: { ...state, products: state.products.map((item) => item.id === productId ? { ...item, stock: quantity, purchasable: quantity > 0 } : item) }, error: null };
}

function shipOrder(state, orderId, trackingNumber) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return { state, error: '담당 발송 주문이 아닙니다.' };
  if (!trackingNumber?.trim()) return { state, error: '가상 운송장 번호를 입력해 주세요.' };
  if (order.status === 'shipped') return { state, error: '이미 출고한 주문입니다.' };
  return { state: { ...state, orders: state.orders.map((item) => item.id === orderId ? { ...item, status: 'shipped', trackingNumber: trackingNumber.trim() } : item) }, error: null };
}

function mountSeller(root) {
  let state = createSellerState();
  const notice = root.querySelector('[data-notice]');
  const won = (value) => `${value.toLocaleString('ko-KR')}원`;
  function render() {
    root.querySelectorAll('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== state.step; });
    root.querySelectorAll('[data-step]').forEach((button) => { button.setAttribute('aria-current', button.dataset.step === state.step ? 'step' : 'false'); });
    root.querySelector('[data-live-policy]').textContent = won(state.publicFreeShippingThreshold);
    root.querySelector('[data-policy-request]').textContent = state.policyRequest ? `요청 ${won(state.policyRequest.proposedThreshold)} · 승인 대기. 고객 공개 기준은 ${won(state.publicFreeShippingThreshold)} 그대로입니다.` : '변경 요청 없음';
    const product = state.products[0];
    root.querySelector('[data-product-stock]').textContent = product.stock ? `재고 ${product.stock}개 · 판매 중` : '재고 0개 · 고객 구매 즉시 차단';
    root.querySelector('[data-restock-request]').textContent = state.restockRequest ? `재고 ${state.restockRequest.proposedStock}개 요청 · 승인 대기. 구매 차단은 유지됩니다.` : '재판매 요청 없음';
    const order = state.orders[0];
    root.querySelector('[data-order-status]').textContent = order.status === 'shipped' ? '출고 · 고객에게 즉시 표시' : '상품 준비';
    root.querySelector('[data-tracking]').textContent = order.trackingNumber || '운송장 미입력';
  }
  root.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action],button[data-step]');
    if (!button || !root.contains(button)) return;
    if (button.dataset.step) { state = { ...state, step: button.dataset.step }; notice.textContent = `${button.textContent.trim()} 화면입니다.`; render(); return; }
    const action = button.dataset.action;
    if (action === 'reset') { state = createSellerState(); root.querySelector('[data-tracking-input]').value = 'QA-TRACK-123'; root.querySelector('[data-stock-input]').value = '18'; notice.textContent = '가상 판매자 시안을 처음 상태로 돌렸습니다.'; }
    if (action === 'policy') { const result = requestFreeShipping(state, 60000); state = result.state; notice.textContent = result.error ?? '무료배송 기준 변경 요청을 남겼습니다. 관리자 승인 전에는 반영되지 않습니다.'; }
    if (action === 'stock') { const raw = root.querySelector('[data-stock-input]').value.trim(); const quantity = raw === '' ? NaN : Number(raw); const before = state.products[0].stock; const result = setStockQuantity(state, 'pepper-a', quantity); state = result.state; notice.textContent = result.error ?? (quantity > before ? '재고 증가를 요청했습니다. 승인 전 현재 수량이 유지됩니다.' : '재고 감소를 즉시 반영했습니다.'); }
    if (action === 'ship') { const input = root.querySelector('[data-tracking-input]'); const result = shipOrder(state, 'QA-FARM-A-001', input.value); state = result.state; notice.textContent = result.error ?? '출고와 가상 운송장이 즉시 반영됐습니다.'; }
    render();
  });
  render();
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-seller-prototype]');
  if (root) mountSeller(root);
}
if (typeof module !== 'undefined') module.exports = { createSellerState, requestFreeShipping, markSoldOut, requestRestock, setStockQuantity, shipOrder, mountSeller };
