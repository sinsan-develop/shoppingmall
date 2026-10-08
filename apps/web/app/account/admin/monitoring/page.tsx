'use client';

import { useEffect, useState, type FormEvent } from 'react';

type Filters = { from: string; to: string; sellerId: string; orderStatus: string; claimStatus: string };
type Timed = { id: string; sellerId: string; createdAt: string };
type Overview = { asOf: string;
  summary: { orderCount: number; goodsSalesWon: number; publishedOptionCount: number;
    soldOutOptionCount: number; claimCount: number; pendingApprovalCount: number; openQuestionCount: number };
  pendingApprovals: (Timed & { kind: string })[];
  stockIssues: { optionId: string; productId: string; sellerId: string; sellableQuantity: number }[];
  openQuestions: (Timed & { productId: string })[];
  openClaims: (Timed & { shipmentOrderId: string; status: string })[];
  failedPayments: { attemptId: string; orderId: string; status: string; requestedWon: number; createdAt: string }[];
  unshipped: { shipmentOrderId: string; orderId: string; sellerId: string; sellerName: string;
    status: string; expectedShipDate: string; paidAt: string }[] };
type Props = Filters & { overview: Overview | null; busy: boolean; error: string;
  sellers?: { id: string; displayName: string }[];
  onFilter: (filters: Filters) => void; onRefresh: () => void };
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const time = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

function ExceptionList({ title, href, items }: { title: string; href: string;
  items: { id: string; detail: string }[] }) {
  return <section className="account-card profile-card">
    <h2>{title} <small>{items.length}건 표시</small></h2>
    {items.length === 0 ? <p>해당 항목이 없습니다.</p> : <ul className="catalog-list">
      {items.map((item) => <li key={item.id}>
        <a className="text-link" href={href}>{item.detail}</a> <small>근거 {item.id}</small>
      </li>)}
    </ul>}
  </section>;
}

export function AdminMonitoringView({ overview, from, to, sellerId, orderStatus,
  claimStatus, busy, error, sellers = [], onFilter, onRefresh }: Props) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onFilter({ from: String(data.get('from') ?? ''), to: String(data.get('to') ?? ''),
      sellerId: String(data.get('sellerId') ?? ''), orderStatus: String(data.get('orderStatus') ?? ''),
      claimStatus: String(data.get('claimStatus') ?? '') });
  }
  return <main className="account-page">
    <header className="account-card profile-card">
      <h1>관리자 관제</h1>
      <p>주문·상품매출·재고·클레임과 처리할 예외를 확인합니다. 자동 경보는 제공하지 않습니다.</p>
      {overview ? <p>조회 시점 {time(overview.asOf)} · 목록은 각 최대 50건</p> : null}
    </header>
    <form className="account-card profile-card" onSubmit={submit} aria-label="관제 조회 조건">
      <label>시작일 <input name="from" type="date" defaultValue={from} required /></label>
      <label>종료일 <input name="to" type="date" defaultValue={to} required /></label>
      <label>판매자 <select name="sellerId" defaultValue={sellerId}>
        <option value="">전체 판매자</option>
        {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.displayName}</option>)}
      </select></label>
      <label>주문 상태 <select name="orderStatus" defaultValue={orderStatus}>
        <option value="">전체</option>
        {['PENDING_PAYMENT','EXPIRED','PAID'].map((status) =>
          <option key={status} value={status}>{status}</option>)}
      </select></label>
      <label>클레임 상태 <select name="claimStatus" defaultValue={claimStatus}>
        <option value="">전체</option>
        {['REQUESTED','SELLER_REPLIED','APPROVED','REJECTED','REFUND_PROCESSING','REFUNDED','REVIEW_REQUIRED']
          .map((status) => <option key={status} value={status}>{status}</option>)}
      </select></label>
      <button className="primary-button" type="submit" disabled={busy}>조회</button>
      <button className="secondary-button" type="button" onClick={onRefresh} disabled={busy}>새로고침</button>
    </form>
    {error ? <p className="account-card" role="alert">{error}</p> : null}
    {busy ? <p role="status">조회 중입니다.</p> : null}
    {overview ? <>
      <section className="account-card profile-card" aria-label="관제 요약">
        <h2>요약</h2>
        <p>주문 생성 {overview.summary.orderCount}건 · 상품매출 {won(overview.summary.goodsSalesWon)}
          <small> (결제 시점, 배송비 제외)</small></p>
        <p>공개 옵션 {overview.summary.publishedOptionCount}개 · 재고 이상 {overview.summary.soldOutOptionCount}개</p>
        <p>클레임 접수 {overview.summary.claimCount}건 · 승인 대기 {overview.summary.pendingApprovalCount}건 ·
          미처리 문의 {overview.summary.openQuestionCount}건</p>
        <small>주문은 기간 내 생성, 상품매출·미출고는 기간 내 결제, 클레임은 기간 내 접수 기준입니다.
          재고·승인 대기·미처리 문의는 현재 상태입니다.</small>
      </section>
      <div className="catalog-admin-grid">
        <ExceptionList title="승인 대기" href="/account/admin/proposals"
          items={overview.pendingApprovals.map((item) => ({ id: item.id, detail: `${item.kind} · 판매자 ${item.sellerId}` }))} />
        <ExceptionList title="실패 결제" href="/account/admin/refunds"
          items={overview.failedPayments.map((item) => ({ id: item.attemptId,
            detail: `${item.status} · 주문 ${item.orderId} · ${won(item.requestedWon)}` }))} />
        <ExceptionList title="미출고" href="/account/admin/fulfillment"
          items={overview.unshipped.map((item) => ({ id: item.shipmentOrderId,
            detail: `${item.sellerName} · ${item.status} · 출고 예정 ${item.expectedShipDate}` }))} />
        <ExceptionList title="재고 이상" href="/account/admin/catalog"
          items={overview.stockIssues.map((item) => ({ id: item.optionId,
            detail: `상품 ${item.productId} · 판매 가능 ${item.sellableQuantity}개` }))} />
        <ExceptionList title="미처리 문의" href="/account/admin/support/questions"
          items={overview.openQuestions.map((item) => ({ id: item.id,
            detail: `상품 ${item.productId} · ${time(item.createdAt)}` }))} />
        <ExceptionList title="클레임" href="/account/admin/support/claims"
          items={overview.openClaims.map((item) => ({ id: item.id,
            detail: `${item.status} · 발송 주문 ${item.shipmentOrderId}` }))} />
      </div>
    </> : null}
  </main>;
}

function seoulToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric',
    month: '2-digit', day: '2-digit' }).format(new Date());
}

export default function AdminMonitoringPage() {
  const today = seoulToday();
  const [filters, setFilters] = useState<Filters>({ from: today, to: today,
    sellerId: '', orderStatus: '', claimStatus: '' });
  const [reload, setReload] = useState(0);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [sellers, setSellers] = useState<{ id: string; displayName: string }[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setBusy(true); setError(''); setOverview(null);
      try {
        if (!apiOrigin) throw new Error('API 주소가 설정되지 않았습니다.');
        const session = await fetch(`${apiOrigin}/auth/me`, {
          credentials: 'include', signal: controller.signal, cache: 'no-store',
        });
        if (!session.ok) throw new Error('관리자 로그인이 필요합니다.');
        const actor = await session.json();
        if (actor.role !== 'admin') throw new Error('관리자만 조회할 수 있습니다.');
        const params = new URLSearchParams(filters);
        const response = await fetch(`${apiOrigin}/admin/monitoring?${params}`, {
          credentials: 'include', signal: controller.signal, cache: 'no-store',
        });
        if (!response.ok) throw new Error(`관제 조회에 실패했습니다. (${response.status})`);
        const data = await response.json() as Overview;
        if (!controller.signal.aborted) setOverview(data);
        if (sellers.length === 0) {
          const sellerResponse = await fetch(`${apiOrigin}/catalog/sellers`, {
            signal: controller.signal, cache: 'no-store',
          });
          if (sellerResponse.ok) {
            const list = await sellerResponse.json();
            if (!controller.signal.aborted) setSellers(Array.isArray(list) ? list : list.items ?? []);
          }
        }
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '조회에 실패했습니다.');
      } finally { if (!controller.signal.aborted) setBusy(false); }
    }
    void load();
    return () => controller.abort();
  }, [filters, reload]);
  return <AdminMonitoringView key={`${filters.from}-${filters.to}-${filters.sellerId}-${filters.orderStatus}-${filters.claimStatus}`}
    {...filters} overview={overview} sellers={sellers} busy={busy} error={error}
    onFilter={setFilters} onRefresh={() => setReload((value) => value + 1)} />;
}
