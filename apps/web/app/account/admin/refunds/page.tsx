'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

type RefundStatus = 'REQUESTED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'REVIEW_REQUIRED';
type RefundSummary = { id: string; checkoutOrderId: string; shipmentOrderId: string;
  requesterRole: 'customer' | 'admin'; reasonCode: string; reason: string; status: RefundStatus;
  goodsRefundWon: number; shippingRefundWon: number; totalRefundWon: number;
  amountFinal: boolean; estimateAvailable: boolean; requestedAt: string;
  decidedAt: string | null; completedAt: string | null };
type RefundLine = { optionId: string; productName: string; optionName: string; quantity: number;
  goodsRefundWon: number; restockMode: 'none' | 'on_hand_only'; restockedQuantity: number };
type RefundDetail = RefundSummary & { policyCode: string; policyVersion: number;
  preShipmentEvidence: string | null; preShipmentConfirmedBy: string | null;
  preShipmentConfirmedAt: string | null; decisionBy: string | null; decisionReason: string | null;
  lines: RefundLine[]; history: { fromStatus: string | null; toStatus: string;
    actorRole: string; reason: string; createdAt: string }[];
  attempts: { id: string; provider: string; requestedWon: number; status: string;
    createdAt: string; events?: { id: string; outcome: string; processingStatus: string }[] }[] };
type Filters = { status?: string; from?: string; to?: string; shipmentOrderId?: string };
type RestockMode = 'none' | 'on_hand_only';
type ViewProps = { cases: RefundSummary[]; selected?: RefundDetail; busy: boolean; message: string;
  filters: Filters; onFilter: (filters: Filters) => void; onSelect: (id: string) => void;
  onApprove: (reason: string, lines: { optionId: string; restockMode: RestockMode }[]) => void;
  onReject: (reason: string) => void };

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const statusLabel: Record<RefundStatus, string> = { REQUESTED: '요청 접수', PROCESSING: '환불 처리 중',
  COMPLETED: '환불 완료', REJECTED: '요청 반려', REVIEW_REQUIRED: '운영자 확인 필요' };

export function AdminRefundsView({ cases, selected, busy, message, filters, onFilter, onSelect,
  onApprove, onReject }: ViewProps) {
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onFilter({ status: String(data.get('status') ?? ''), from: String(data.get('from') ?? ''),
      to: String(data.get('to') ?? ''), shipmentOrderId: String(data.get('shipmentOrderId') ?? '').trim() });
  }
  function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    onApprove(String(data.get('approvalReason') ?? '').trim(), selected.lines.map((line) => ({
      optionId: line.optionId,
      restockMode: String(data.get(`restock-${line.optionId}`) ?? 'none') as RestockMode,
    })));
  }
  function reject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onReject(String(new FormData(event.currentTarget).get('rejectionReason') ?? '').trim());
  }
  return <div className="refund-admin-layout">
    <section className="refund-card refund-filter-card">
      <h2>취소·환불 관리</h2>
      <p className="section-note">결제 완료 후 출고 전 요청만 확인합니다. 고객에게는 상품금액만 환불합니다.</p>
      <form className="refund-filter-form" onSubmit={filter}>
        <label htmlFor="refund-status">상태</label>
        <select id="refund-status" name="status" defaultValue={filters.status ?? ''}>
          <option value="">전체</option>{Object.entries(statusLabel).map(([value, label]) =>
            <option key={value} value={value}>{label}</option>)}</select>
        <label htmlFor="refund-from">시작일</label>
        <input id="refund-from" name="from" type="date" defaultValue={filters.from ?? ''} />
        <label htmlFor="refund-to">종료일</label>
        <input id="refund-to" name="to" type="date" defaultValue={filters.to ?? ''} />
        <label htmlFor="refund-shipment">발송 주문 ID</label>
        <input id="refund-shipment" name="shipmentOrderId" defaultValue={filters.shipmentOrderId ?? ''} />
        <button type="submit" className="primary-button" disabled={busy}>조회</button>
      </form>
    </section>
    {message ? <p className="refund-message" role="status">{message}</p> : null}
    <section className="refund-card refund-case-panel" aria-labelledby="refund-case-list-heading">
      <h2 id="refund-case-list-heading">요청 목록</h2>
      {cases.length === 0 ? <p>조건에 맞는 요청이 없습니다.</p> : <ul className="refund-case-list">
        {cases.map((item) => <li key={item.id}>
          <button type="button" className="refund-case-button" disabled={busy}
            aria-pressed={selected?.id === item.id} onClick={() => onSelect(item.id)}>
            <strong>{statusLabel[item.status]}</strong>
            <span>발송 {item.shipmentOrderId}</span>
            <span>{item.amountFinal ? '확정' : '예상'} {item.estimateAvailable ? won(item.totalRefundWon) : '계산 불가'}</span>
            <span>{new Date(item.requestedAt).toLocaleString('ko-KR')}</span>
          </button>
        </li>)}
      </ul>}
    </section>
    <section className="refund-card refund-detail-panel" aria-labelledby="refund-detail-heading">
      <h2 id="refund-detail-heading">요청 상세</h2>
      {!selected ? <p>확인할 요청을 선택해 주세요.</p> : <>
        <p><strong>{statusLabel[selected.status]}</strong> · 주문 {selected.checkoutOrderId}</p>
        <p>발송 주문 {selected.shipmentOrderId} · 요청자 {selected.requesterRole === 'customer' ? '구매자' : '운영자'}</p>
        <p>{selected.amountFinal ? '확정 환급액' : '예상 환급액'} <strong>{selected.estimateAvailable ?
          won(selected.totalRefundWon) : '현재 계산할 수 없음'}</strong> · 배송비 환불 {won(selected.shippingRefundWon)}</p>
        <p>요청 사유 {selected.reason}</p>
        <ul className="refund-lines">{selected.lines.map((line) => <li key={line.optionId}>
          <strong>{line.productName}</strong> {line.optionName} · {line.quantity}개
          {selected.amountFinal ? ` · ${won(line.goodsRefundWon)}` : ''}
        </li>)}</ul>
        {selected.status === 'REQUESTED' ? <div className="refund-decision-grid">
          <form className="account-form refund-approve-form" onSubmit={approve}>
            <h3>승인</h3>
            <label className="check-row"><input name="preShipmentConfirmed" type="checkbox" required />
              출고 전 미발송 확인</label>
            <p className="section-note">운송장·판매자 출고 상태를 확인한 운영자 판단입니다.</p>
            <fieldset><legend>재고 처리</legend>{selected.lines.map((line) => <div key={line.optionId}>
              <label htmlFor={`restock-${line.optionId}`}>{line.productName} {line.optionName}</label>
              <select id={`restock-${line.optionId}`} name={`restock-${line.optionId}`} defaultValue="none">
                <option value="none">재고 복원 안 함</option>
                <option value="on_hand_only">보유재고만 복원</option>
              </select></div>)}</fieldset>
            <label htmlFor="refund-approval-reason">승인 사유</label>
            <textarea id="refund-approval-reason" name="approvalReason" rows={3} maxLength={500} required />
            <button type="submit" className="primary-button" disabled={busy}>승인·모의 환불 실행</button>
          </form>
          <form className="account-form refund-reject-form" onSubmit={reject}>
            <h3>반려</h3>
            <label htmlFor="refund-rejection-reason">반려 사유</label>
            <textarea id="refund-rejection-reason" name="rejectionReason" rows={4} maxLength={500} required />
            <button type="submit" className="secondary-button" disabled={busy}>반려</button>
          </form>
        </div> : null}
        <h3>처리 이력</h3>
        <ol className="refund-history">{selected.history.map((item, index) => <li key={`${item.createdAt}-${index}`}>
          {statusLabel[item.toStatus as RefundStatus] ?? item.toStatus} · {item.reason} ·
          {' '}{new Date(item.createdAt).toLocaleString('ko-KR')}</li>)}</ol>
      </>}
    </section>
  </div>;
}

export default function AdminRefundsPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'unavailable'>('loading');
  const [cases, setCases] = useState<RefundSummary[]>([]);
  const [selected, setSelected] = useState<RefundDetail>();
  const [filters, setFilters] = useState<Filters>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const decisionKeys = useRef(new Map<string, string>());

  async function loadCases(next: Filters = filters, signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value) query.set(key, value);
    const response = await fetch(`${apiOrigin}/refunds/admin/cases${query.size ? `?${query}` : ''}`,
      { credentials: 'include', signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Refund list unavailable');
    const found = await response.json() as RefundSummary[];
    if (!signal?.aborted) setCases(found);
  }

  async function loadDetail(id: string, signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const response = await fetch(`${apiOrigin}/refunds/admin/cases/${encodeURIComponent(id)}`,
      { credentials: 'include', signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Refund detail unavailable');
    const found = await response.json() as RefundDetail;
    if (!signal?.aborted) setSelected(found);
  }

  useEffect(() => {
    if (!apiOrigin) { setState('unavailable'); return; }
    const controller = new AbortController();
    async function load() {
      const response = await fetch(`${apiOrigin}/auth/me`,
        { credentials: 'include', signal: controller.signal });
      if (!response.ok) { setState(response.status === 401 ? 'unauthorized' : 'unavailable'); return; }
      if ((await response.json() as { role: string }).role !== 'admin') { setState('unauthorized'); return; }
      await loadCases({}, controller.signal); setState('ready');
    }
    load().catch((error: unknown) => {
      if (error instanceof Error && error.name !== 'AbortError') setState('unavailable');
    });
    return () => controller.abort();
  }, []);

  async function decide(decision: 'approve' | 'reject', reason: string,
    lines: { optionId: string; restockMode: RestockMode }[] = []) {
    if (!apiOrigin || !selected || busy) return;
    const body = decision === 'approve' ? { decision, reason, preShipmentConfirmed: true,
      preShipmentEvidence: 'ADMIN_CONFIRMED_NOT_DISPATCHED', lines } :
      { decision, reason, preShipmentConfirmed: false, lines: [] };
    const identity = `${selected.id}|${JSON.stringify(body)}`;
    const key = decisionKeys.current.get(identity) ?? crypto.randomUUID();
    decisionKeys.current.set(identity, key);
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/refunds/admin/cases/${encodeURIComponent(selected.id)}/decision`, {
        method: 'POST', credentials: 'include', headers: {
          'content-type': 'application/json', 'idempotency-key': key,
        }, body: JSON.stringify(body),
      });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (response.status === 404) { setMessage('요청 또는 모의 환불 환경을 확인해 주세요'); return; }
      if (response.status === 409) {
        setMessage('요청·결제·재고 상태가 변경됐습니다. 상세 내역을 다시 확인해 주세요');
        await loadDetail(selected.id).catch(() => {}); return;
      }
      if (!response.ok) { setMessage('처리 결과를 확인하지 못했습니다. 같은 내용으로 다시 확인해 주세요'); return; }
      const found = await response.json() as RefundDetail;
      decisionKeys.current.delete(identity);
      setSelected(found); await loadCases(filters);
      setMessage(decision === 'approve' ? '환불 승인과 모의 환불 결과를 반영했습니다' : '환불 요청을 반려했습니다');
    } catch { setMessage('처리 결과를 확인하지 못했습니다. 같은 내용으로 다시 확인해 주세요'); }
    finally { setBusy(false); }
  }

  return <main id="main-content" tabIndex={-1} className="shell account-shell">
    <a className="text-link" href="/account">내 계정으로</a>
    <h1>취소·환불 관리</h1>
    {state === 'loading' ? <p role="status">운영자 권한 확인 중</p> : null}
    {state === 'unauthorized' ? <p role="alert">운영자 로그인 후 이용할 수 있습니다</p> : null}
    {state === 'unavailable' ? <p role="alert">환불 정보를 불러올 수 없습니다</p> : null}
    {state === 'ready' ? <AdminRefundsView cases={cases} selected={selected} busy={busy}
      message={message} filters={filters} onFilter={(next) => {
        setFilters(next); setSelected(undefined); setBusy(true); setMessage('');
        void loadCases(next).catch(() => setMessage('환불 요청 목록을 불러오지 못했습니다'))
          .finally(() => setBusy(false));
      }} onSelect={(id) => {
        setBusy(true); setMessage(''); void loadDetail(id)
          .catch(() => setMessage('환불 요청 상세를 불러오지 못했습니다')).finally(() => setBusy(false));
      }} onApprove={(reason, lines) => void decide('approve', reason, lines)}
      onReject={(reason) => void decide('reject', reason)} /> : null}
  </main>;
}
