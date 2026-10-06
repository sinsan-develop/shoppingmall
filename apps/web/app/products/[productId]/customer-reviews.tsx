'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { PublicImage } from '../../account/private-image';

type Review = { id: string; rating: number; body: string; version: number;
  createdAt: string; imageIds: string[] };
type Page = { items: Review[]; nextCursor: string | null };
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export function PublicCustomerReviewsView({ productId,items,nextCursor,busy,loading,
  message,reportMessages,onMore,onReload,onReport }: {
  productId: string; items: Review[]; nextCursor: string | null;
  busy: boolean; loading: boolean; message: string;
  reportMessages: Record<string,string>; onMore: () => void; onReload: () => void;
  onReport: (reviewId: string,reason: string) => void;
}) {
  function report(event: FormEvent<HTMLFormElement>,reviewId: string) {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
    if (reason) onReport(reviewId,reason);
  }
  return <section className="detail-description" aria-labelledby="customer-reviews-title">
    <h2 id="customer-reviews-title">구매 확인 리뷰</h2>
    <p>본인 출고 품목을 수동 구매확정한 고객의 리뷰만 관리자 승인 후 표시됩니다.</p>
    <button type="button" className="secondary-button" disabled={busy || loading}
      onClick={onReload}>공개 리뷰 새로고침</button>
    {loading ? <p role="status">공개 리뷰를 불러오는 중</p> : items.length === 0 ?
      <p>공개된 리뷰가 없습니다.</p> : <ol>{items.map((item) => <li key={item.id}>
        <p><strong>평점 {item.rating}점</strong> · {new Date(item.createdAt).toLocaleDateString('ko-KR')}</p>
        <p>{item.body}</p>
        {apiOrigin && item.imageIds.length ? <div className="detail-thumb-list">
          {item.imageIds.map((imageId,index) => <PublicImage key={imageId}
            src={`${apiOrigin}/catalog/products/${encodeURIComponent(productId)}/customer-reviews/${encodeURIComponent(item.id)}/images/${encodeURIComponent(imageId)}`}
            alt={`구매 리뷰 사진 ${index + 1}`} />)}
        </div> : null}
        <form className="account-form" onSubmit={(event) => report(event,item.id)}>
          <label htmlFor={`review-report-${item.id}`}>리뷰 신고 사유</label>
          <input id={`review-report-${item.id}`} name="reason" maxLength={500} required />
          <button type="submit" className="secondary-button" disabled={busy}>신고</button>
        </form>
        {reportMessages[item.id] ? <p role="status">{reportMessages[item.id]}</p> : null}
      </li>)}</ol>}
    {nextCursor ? <button type="button" className="secondary-button" disabled={busy || loading}
      onClick={onMore}>더보기</button> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}

export function PublicCustomerReviews({ productId }: { productId: string }) {
  const [items,setItems] = useState<Review[]>([]);
  const [nextCursor,setNextCursor] = useState<string | null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [reportMessages,setReportMessages] = useState<Record<string,string>>({});
  const [refresh,setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    if (!apiOrigin) { setLoading(false); return () => controller.abort(); }
    setLoading(true); setMessage('');
    fetch(`${apiOrigin}/catalog/products/${encodeURIComponent(productId)}/customer-reviews?limit=20`,
      { signal: controller.signal,cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Public reviews unavailable');
        return response.json() as Promise<Page>;
      }).then((page) => { if (!controller.signal.aborted) {
        setItems(page.items); setNextCursor(page.nextCursor);
      } }).catch(() => { if (!controller.signal.aborted) {
        setItems([]); setNextCursor(null); setMessage('공개 리뷰를 불러오지 못했습니다');
      } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [productId,refresh]);

  async function more() {
    if (!apiOrigin || busy || !nextCursor) return;
    setBusy(true); setMessage('');
    try {
      const query = new URLSearchParams({ limit: '20',cursor: nextCursor });
      const response = await fetch(`${apiOrigin}/catalog/products/${encodeURIComponent(productId)}/customer-reviews?${query}`,
        { cache: 'no-store' });
      if (!response.ok) throw new Error('Next reviews unavailable');
      const page = await response.json() as Page;
      setItems((previous) => [...previous,...page.items.filter((item) =>
        !previous.some((old) => old.id === item.id))]);
      setNextCursor(page.nextCursor);
    } catch { setMessage('다음 리뷰를 불러오지 못했습니다'); }
    finally { setBusy(false); }
  }

  async function report(reviewId: string,reason: string) {
    if (!apiOrigin || busy) return;
    setBusy(true);
    setReportMessages((previous) => ({ ...previous,[reviewId]: '' }));
    try {
      const response = await fetch(`${apiOrigin}/customer/support/reviews/${encodeURIComponent(reviewId)}/reports`, {
        method: 'POST',credentials: 'include',headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const result = response.ok ? '신고가 접수되었습니다' :
        response.status === 401 || response.status === 403 ? '구매자 로그인 후 신고할 수 있습니다' :
        response.status === 404 ? '더 이상 공개되지 않는 리뷰입니다. 목록을 새로고침해 주세요' :
        response.status === 409 ? '이미 다른 사유로 신고한 리뷰입니다' :
        '신고 결과를 확인하지 못했습니다. 같은 사유로 다시 시도해 주세요';
      setReportMessages((previous) => ({ ...previous,[reviewId]: result }));
    } catch { setReportMessages((previous) => ({ ...previous,
      [reviewId]: '신고 결과를 확인하지 못했습니다. 같은 사유로 다시 시도해 주세요' })); }
    finally { setBusy(false); }
  }

  return <PublicCustomerReviewsView productId={productId} items={items}
    nextCursor={nextCursor} busy={busy} loading={loading} message={message}
    reportMessages={reportMessages} onMore={more} onReload={() => setRefresh((value) => value + 1)}
    onReport={report} />;
}
