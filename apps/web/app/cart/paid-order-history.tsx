'use client';

import { useEffect, useState } from 'react';

type PaidOrderSummary = { id: string; status: 'PAID'; createdAt: string; paidAt: string;
  payableWon: number; productSummary: { productName: string; optionName: string; lineCount: number } };
type PaidOrderPage = { items: PaidOrderSummary[]; nextCursor: string | null };

export async function fetchPaidOrders(apiBase: string, cursor?: string,
  send: typeof fetch = fetch, signal?: AbortSignal): Promise<PaidOrderPage> {
  const query = new URLSearchParams({ status: 'PAID', limit: '20' });
  if (cursor) query.set('cursor', cursor);
  const response = await send(`${apiBase}/customer/checkout/orders?${query}`,
    { credentials: 'include', cache: 'no-store', signal });
  if (response.status === 401 || response.status === 403)
    throw new Error('구매자 역할로 로그인해 주세요');
  if (!response.ok) throw new Error('이전 주문을 불러오지 못했습니다. 다시 조회해 주세요');
  return response.json() as Promise<PaidOrderPage>;
}

export function PaidOrderHistoryView({ items, nextCursor, busy, message, selectedId,
  onSelect, onRefresh, onMore }: PaidOrderPage & { busy: boolean; message: string;
  selectedId?: string; onSelect: (id: string) => void; onRefresh: () => void; onMore: () => void }) {
  return <section className="refund-card" aria-labelledby="paid-order-history-heading">
    <h2 id="paid-order-history-heading">이전 결제완료 주문</h2>
    <p>취소·환불을 확인할 주문을 선택해 주세요.</p>
    <button type="button" className="secondary-button" disabled={busy} onClick={onRefresh}>주문 목록 새로고침</button>
    {message ? <p role="status">{message}</p> : null}
    {!busy && items.length === 0 && !message ? <p>결제완료 주문이 없습니다.</p> : null}
    <ul className="refund-case-list">{items.map((item) => <li key={item.id}>
      <button type="button" className="refund-case-button" disabled={busy}
        aria-pressed={selectedId === item.id} onClick={() => onSelect(item.id)}>
        <strong>{item.productSummary.productName || '주문 상품'} · {item.productSummary.optionName}
          {item.productSummary.lineCount > 1 ? ` 외 ${item.productSummary.lineCount - 1}개 품목` : ''}</strong>
        <span>{new Date(item.createdAt).toLocaleString('ko-KR')} · {item.payableWon.toLocaleString('ko-KR')}원</span>
        <span>주문 {item.id} · 취소·환불 확인</span>
      </button>
    </li>)}</ul>
    {nextCursor ? <button type="button" className="secondary-button" disabled={busy} onClick={onMore}>이전 주문 더 보기</button> : null}
  </section>;
}

export default function PaidOrderHistory({ apiBase, disabled, selectedId, onSelect }: {
  apiBase: string; disabled: boolean; selectedId?: string; onSelect: (id: string) => Promise<void> }) {
  const [page, setPage] = useState<PaidOrderPage>({ items: [], nextCursor: null });
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetchPaidOrders(apiBase, undefined, fetch, controller.signal).then((found) => {
      if (!controller.signal.aborted) setPage(found);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : '주문 조회 오류');
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [apiBase]);
  async function load(cursor?: string) {
    if (busy || disabled) return;
    setBusy(true); setMessage('');
    try {
      const found = await fetchPaidOrders(apiBase, cursor);
      setPage((prior) => ({ items: cursor ? [...prior.items, ...found.items] : found.items,
        nextCursor: found.nextCursor }));
    } catch (error) { setMessage(error instanceof Error ? error.message : '주문 조회 오류'); }
    finally { setBusy(false); }
  }
  async function select(id: string) {
    if (busy || disabled) return;
    setBusy(true); setMessage('');
    try { await onSelect(id); }
    catch (error) { setMessage(error instanceof Error ? error.message : '주문 조회 오류'); }
    finally { setBusy(false); }
  }
  return <PaidOrderHistoryView {...page} busy={busy || disabled} message={message}
    selectedId={selectedId} onSelect={(id) => void select(id)}
    onRefresh={() => void load()} onMore={() => { if (page.nextCursor) void load(page.nextCursor); }} />;
}
