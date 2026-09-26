function createAdminState() {
  return {
    step: 'operations', effectiveThreshold: 50000,
    requests: [{ id: 'QA-REQ-001', seller: '농가 A 판매자', status: 'pending', before: 50000, proposed: 60000, requestedAt: '2026-05-02 10:00' }],
    history: [],
    shipments: [{ shipmentId: 'farm-b', seller: '농가 B', sourceOrderId: 'QA-FARM-B-001', goodsPaid: 30000, shippingPaid: 3000, status: 'paid' }],
    refundAmount: 0,
    postShipmentClaim: { id: 'QA-CLAIM-001', reason: '배송 중 훼손', evidence: '사진 접수 필요', refundAmount: null },
    entries: [
      { farmId: 'farm-a', occurredAt: '2026-05-01', type: 'sales', amount: 520000, sourceOrderId: 'QA-2026-05-001', product: '고추 1kg' },
      { farmId: 'farm-a', occurredAt: '2026-05-01', type: 'discounts', amount: 50000, sourceOrderId: 'QA-2026-05-001', product: '고추 1kg' },
      { farmId: 'farm-a', occurredAt: '2026-05-02', type: 'fees', amount: 12000, sourceOrderId: 'QA-2026-05-001', product: '고추 1kg' },
      { farmId: 'farm-b', occurredAt: '2026-05-01', type: 'sales', amount: 300000, sourceOrderId: 'QA-2026-05-002', product: '양파 3kg' },
      { farmId: 'farm-b', occurredAt: '2026-05-02', type: 'shipping', amount: 3000, sourceOrderId: 'QA-2026-05-002', product: '양파 3kg' },
      { farmId: 'farm-a', occurredAt: '2026-07-01', type: 'refunds', amount: 47000, sourceOrderId: 'QA-2026-05-001', sourceSaleAt: '2026-05-01', product: '고추 1kg' },
    ],
    completedPeriods: [{ farmId: 'farm-a', startDate: '2026-05-01', endDate: '2026-05-20', status: 'completed' }],
  };
}

function decideRequest(state, requestId, decision) {
  const request = state.requests.find((item) => item.id === requestId);
  if (!request || request.status !== 'pending') return { state, error: '승인 대기 요청이 아닙니다.' };
  if (!['approve', 'reject'].includes(decision)) return { state, error: '승인 또는 반려를 선택해 주세요.' };
  const status = decision === 'approve' ? 'approved' : 'rejected';
  return {
    state: {
      ...state,
      effectiveThreshold: decision === 'approve' ? request.proposed : state.effectiveThreshold,
      requests: state.requests.map((item) => item.id === requestId ? { ...item, status } : item),
      history: [...state.history, { requestId, role: '관리자', action: status, target: request.seller }],
    },
    error: null,
  };
}

function refundPreShipment(state, shipmentId) {
  const shipment = state.shipments.find((item) => item.shipmentId === shipmentId);
  if (!shipment) return { state, error: '환불 대상 발송 주문이 없습니다.' };
  if (shipment.status !== 'paid') return { state, error: '이미 환불했거나 출고 전 대상이 아닙니다.' };
  return {
    state: {
      ...state, refundAmount: shipment.goodsPaid + shipment.shippingPaid,
      shipments: state.shipments.map((item) => item.shipmentId === shipmentId ? { ...item, status: 'refunded' } : item),
    },
    error: null,
  };
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validRange(startDate, endDate) {
  return validDate(startDate) && validDate(endDate) && startDate <= endDate;
}

function getSettlementReport(state, farmId, startDate, endDate) {
  if (!['all', 'farm-a', 'farm-b'].includes(farmId)) return { totals: null, groups: [], entries: [], error: '농가를 선택해 주세요.' };
  if (!validRange(startDate, endDate)) return { totals: null, groups: [], entries: [], error: '정산 기간 날짜를 확인해 주세요.' };
  const farms = farmId === 'all' ? ['farm-a', 'farm-b'] : [farmId];
  const emptyTotals = () => ({ sales: 0, fees: 0, shipping: 0, discounts: 0, refunds: 0 });
  const totals = emptyTotals();
  const groups = farms.map((id) => {
    const entries = state.entries.filter((entry) => entry.farmId === id && entry.occurredAt >= startDate && entry.occurredAt <= endDate);
    const farmTotals = emptyTotals();
    for (const entry of entries) { farmTotals[entry.type] += entry.amount; totals[entry.type] += entry.amount; }
    return { farmId: id, totals: farmTotals, entries };
  });
  return { totals, groups, entries: groups.flatMap((group) => group.entries).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)), error: null };
}

function sumSettlement(state, farmId, startDate, endDate) {
  const { totals, error } = getSettlementReport(state, farmId, startDate, endDate);
  return { totals, error };
}

function completeSettlement(state, farmId, startDate, endDate) {
  if (farmId === 'all') return { state, error: '전체 조회는 정산 완료 처리할 수 없습니다. 농가를 개별 선택해 주세요.' };
  const result = sumSettlement(state, farmId, startDate, endDate);
  if (result.error) return { state, error: result.error };
  const overlap = state.completedPeriods.some((period) => period.farmId === farmId && startDate <= period.endDate && endDate >= period.startDate);
  if (overlap) return { state, error: '이 농가의 완료 기간과 중복되어 다시 완료할 수 없습니다.' };
  return { state: { ...state, completedPeriods: [...state.completedPeriods, { farmId, startDate, endDate, status: 'completed' }] }, error: null };
}

function mountAdmin(root, printPage = () => window.print()) {
  let state = createAdminState();
  let selection = { farmId: 'farm-a', startDate: '2026-05-01', endDate: '2026-05-20' };
  const notice = root.querySelector('[data-notice]');
  const won = (value) => `${value.toLocaleString('ko-KR')}원`;
  const labels = { sales: '매출', fees: '수수료', shipping: '배송비', discounts: '할인', refunds: '환불' };
  const farmName = (farmId) => farmId === 'farm-a' ? '농가 A' : farmId === 'farm-b' ? '농가 B' : '전체';
  const totalsHtml = (totals) => Object.entries(totals).map(([key, value]) => `<p>${labels[key]} <strong>${won(value)}</strong></p>`).join('');
  function render() {
    root.querySelectorAll('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== state.step; });
    root.querySelectorAll('[data-step]').forEach((button) => { button.setAttribute('aria-current', button.dataset.step === state.step ? 'step' : 'false'); });
    const request = state.requests[0];
    root.querySelector('[data-request-status]').textContent = request.status === 'pending' ? '승인 대기' : request.status === 'approved' ? '승인 완료' : '반려';
    root.querySelector('[data-effective-policy]').textContent = won(state.effectiveThreshold);
    root.querySelector('[data-request-history]').textContent = state.history.length ? `요청: ${request.seller}, ${request.requestedAt} / 결정: 관리자, ${state.history[0].action}` : `요청: ${request.seller}, ${request.requestedAt} / 관리자 결정 전`;
    root.querySelector('[data-refund-status]').textContent = state.shipments[0].status === 'refunded' ? `가상 환불 완료 · 상품 ${won(30000)} + 배송비 ${won(3000)} = ${won(state.refundAmount)}` : '출고 전 · 상품 30,000원 + 배송비 3,000원';
    const report = getSettlementReport(state, selection.farmId, selection.startDate, selection.endDate);
    root.querySelector('[data-report-scope]').textContent = `${farmName(selection.farmId)} · ${selection.startDate} ~ ${selection.endDate} · 가상 정산 자료`;
    root.querySelector('[data-complete-button]').disabled = selection.farmId === 'all';
    root.querySelector('[data-settlement-totals]').innerHTML = report.error ? `<p>${report.error}</p>` : `<h3>${selection.farmId === 'all' ? '전체 합계' : `${farmName(selection.farmId)} 합계`}</h3>${totalsHtml(report.totals)}${selection.farmId === 'all' ? report.groups.map((group) => `<h3>${farmName(group.farmId)} 소계</h3>${totalsHtml(group.totals)}`).join('') : ''}`;
    root.querySelector('[data-settlement-entries]').innerHTML = report.entries.length ? report.entries.map((entry) => `<tr><td>${entry.occurredAt}</td><td>${farmName(entry.farmId)}</td><td>${labels[entry.type]}</td><td>${won(entry.amount)}</td><td>${entry.sourceOrderId} · ${entry.product}${entry.sourceSaleAt ? ` · 원판매 ${entry.sourceSaleAt}` : ''}</td></tr>`).join('') : '<tr><td colspan="5">이 기간의 가상 발생 내역이 없습니다.</td></tr>';
    root.querySelector('[data-completed-periods]').textContent = state.completedPeriods.map((period) => `${period.farmId === 'farm-a' ? '농가 A' : '농가 B'} ${period.startDate}~${period.endDate} 완료`).join(' / ');
  }
  root.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action],button[data-step]');
    if (!button || !root.contains(button)) return;
    if (button.dataset.step) { state = { ...state, step: button.dataset.step }; notice.textContent = `${button.textContent.trim()} 화면입니다.`; render(); return; }
    const action = button.dataset.action;
    if (action === 'reset') { state = createAdminState(); selection = { farmId: 'farm-a', startDate: '2026-05-01', endDate: '2026-05-20' }; root.querySelector('[data-farm]').value = selection.farmId; root.querySelector('[data-start]').value = selection.startDate; root.querySelector('[data-end]').value = selection.endDate; notice.textContent = '가상 관리자 시안을 처음 상태로 돌렸습니다.'; }
    if (action === 'approve' || action === 'reject') { const result = decideRequest(state, 'QA-REQ-001', action); state = result.state; notice.textContent = result.error ?? (action === 'approve' ? '관리자 승인 이력을 남겼습니다.' : '관리자 반려 이력을 남겼습니다.'); }
    if (action === 'refund') { const result = refundPreShipment(state, 'farm-b'); state = result.state; notice.textContent = result.error ?? `출고 전 가상 환불 ${won(state.refundAmount)}을 기록했습니다.`; }
    if (action === 'print') { notice.textContent = '현재 조회된 가상 정산 자료를 인쇄하거나 PDF로 저장할 수 있습니다.'; printPage(); return; }
    if (action === 'query' || action === 'complete') {
      const next = { farmId: root.querySelector('[data-farm]').value, startDate: root.querySelector('[data-start]').value, endDate: root.querySelector('[data-end]').value };
      const query = sumSettlement(state, next.farmId, next.startDate, next.endDate);
      if (query.error) notice.textContent = query.error;
      else { selection = next; notice.textContent = `${next.farmId === 'farm-a' ? '농가 A' : '농가 B'} 기간별 발생 자료를 조회했습니다.`; if (action === 'complete') { const result = completeSettlement(state, next.farmId, next.startDate, next.endDate); state = result.state; notice.textContent = result.error ?? '이 농가의 선택 기간만 완료로 기록했습니다.'; } }
    }
    render();
  });
  render();
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-admin-prototype]');
  if (root) mountAdmin(root);
}
if (typeof module !== 'undefined') module.exports = { createAdminState, decideRequest, refundPreShipment, getSettlementReport, sumSettlement, completeSettlement, mountAdmin };
