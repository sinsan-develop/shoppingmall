'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

type Line = { productId: string; optionId: string; productName: string;
  optionName: string; quantity: number; remainingQuantity: number };
type Confirmation = { id: string; reviewId: string | null; reviewStatus: string | null };
type Review = { id: string; rating: number; body: string; status: string };
export function canEditReview(confirmation: Confirmation | null, review: Review | undefined) {
  return Boolean(confirmation && (!confirmation.reviewId || review?.id === confirmation.reviewId));
}
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export function CustomerSupportLine({ orderId,shipmentOrderId,status,line }: {
  orderId: string; shipmentOrderId: string; status: string; line: Line;
}) {
  const [confirmation,setConfirmation] = useState<Confirmation | null>(null);
  const [loading,setLoading] = useState(true);
  const [loadFailed,setLoadFailed] = useState(false);
  const [review,setReview] = useState<Review>();
  const [reviewLoadFailed,setReviewLoadFailed] = useState(false);
  const [reviewReload,setReviewReload] = useState(0);
  const [confirmationReload,setConfirmationReload] = useState(0);
  const [rating,setRating] = useState(5);
  const [text,setText] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const keys = useRef(new Map<string,string>());
  const confirmationPath = `${apiOrigin}/customer/support/confirmations`;

  useEffect(() => {
    if (!apiOrigin || status !== 'SHIPPED') return;
    const controller = new AbortController();
    setLoading(true);
    setLoadFailed(false);
    fetch(`${confirmationPath}/${encodeURIComponent(shipmentOrderId)}/${encodeURIComponent(line.optionId)}`,
      { credentials: 'include',cache: 'no-store',signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Confirmation unavailable');
        return response.json() as Promise<Confirmation>;
      }).then((found) => { if (!controller.signal.aborted) setConfirmation(found); })
      .catch(() => { if (!controller.signal.aborted) {
        setLoadFailed(true); setMessage('구매확정 상태를 불러오지 못했습니다. 다시 조회해 주세요');
      } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [confirmationPath,shipmentOrderId,line.optionId,status,confirmationReload]);

  useEffect(() => {
    if (!apiOrigin || !confirmation?.reviewId || review?.id === confirmation.reviewId) return;
    const controller = new AbortController();
    setReviewLoadFailed(false);
    fetch(`${apiOrigin}/customer/support/reviews/${encodeURIComponent(confirmation.reviewId)}`,
      { credentials: 'include',cache: 'no-store',signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Review unavailable');
        return response.json() as Promise<Review>;
      }).then((found) => { if (!controller.signal.aborted) {
        setReview(found); setRating(found.rating); setText(found.body);
      } }).catch(() => { if (!controller.signal.aborted) {
        setReviewLoadFailed(true); setMessage('리뷰를 불러오지 못했습니다. 다시 조회해 주세요');
      } });
    return () => controller.abort();
  }, [confirmation?.reviewId,reviewReload]);

  async function send(path: string,method: 'POST' | 'PUT',body: object) {
    const identity = `${path}|${JSON.stringify(body)}`;
    const key = keys.current.get(identity) ?? crypto.randomUUID();
    keys.current.set(identity,key);
    const response = await fetch(path, { method,credentials: 'include',headers: {
      'content-type': 'application/json','idempotency-key': key },body: JSON.stringify(body),
    });
    if (response.ok) keys.current.delete(identity);
    return response;
  }

  async function confirm() {
    if (!apiOrigin || loading || loadFailed || busy || confirmation) return;
    setBusy(true); setMessage('');
    try {
      const response = await send(confirmationPath,'POST',
        { orderId,shipmentOrderId,optionId: line.optionId });
      if (response.status === 404) { setMessage('본인 출고 품목을 확인해 주세요'); return; }
      if (response.status === 409) { setMessage('이미 구매확정된 품목입니다. 상태를 다시 확인해 주세요'); return; }
      if (!response.ok) { setMessage('결과를 확인하지 못했습니다. 다시 시도해 주세요'); return; }
      const found = await response.json() as { id: string };
      setConfirmation({ id: found.id,reviewId: null,reviewStatus: null });
      setMessage('본인 출고 품목의 구매확정을 기록했습니다');
    } catch { setMessage('결과를 확인하지 못했습니다. 다시 시도해 주세요'); }
    finally { setBusy(false); }
  }

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiOrigin || !confirmation || !canEditReview(confirmation,review) || busy || !text.trim()) return;
    setBusy(true); setMessage('');
    const body = { ...(!confirmation.reviewId ? { confirmationId: confirmation.id } : {}),
      rating,text: text.trim() };
    const path = confirmation.reviewId ?
      `${apiOrigin}/customer/support/reviews/${encodeURIComponent(confirmation.reviewId)}` :
      `${apiOrigin}/customer/support/reviews`;
    try {
      const response = await send(path,confirmation.reviewId ? 'PUT' : 'POST',body);
      if (response.status === 409) { setMessage('리뷰 상태가 달라졌습니다. 다시 확인해 주세요'); return; }
      if (response.status === 404) { setMessage('본인 구매확정 또는 리뷰를 찾을 수 없습니다'); return; }
      if (!response.ok) { setMessage('리뷰 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요'); return; }
      const saved = await response.json() as { id: string; status: string };
      setReview({ id: saved.id,rating,body: text.trim(),status: saved.status });
      setConfirmation({ ...confirmation,reviewId: saved.id,reviewStatus: saved.status });
      setMessage('리뷰를 저장했습니다. 관리자 승인 전에는 공개되지 않습니다');
    } catch { setMessage('리뷰 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요'); }
    finally { setBusy(false); }
  }

  if (status !== 'SHIPPED') return null;
  return <section className="account-card profile-card" aria-label={`${line.productName} 고객지원`}>
    <h4>{line.productName} · {line.optionName}</h4>
    <p>출고 수량 {line.quantity}개 · 환불 후 잔량 {line.remainingQuantity}개</p>
    <p>배송 완료를 자동 추정하지 않습니다. 본인이 출고 후 수동으로 구매확정합니다.</p>
    {loading && apiOrigin ? <p role="status">구매확정 상태 확인 중</p> : null}
    {loadFailed ? <button type="button" className="secondary-button"
      onClick={() => { setMessage(''); setConfirmationReload((value) => value + 1); }}>
      구매확정 상태 다시 조회</button> : null}
    {confirmation ? <p>구매확정됨 · 리뷰 {confirmation.reviewStatus ?? '미작성'}</p> :
      <button type="button" className="secondary-button"
        disabled={loading || loadFailed || busy || !apiOrigin}
        onClick={confirm}>구매확정</button>}
    {confirmation?.reviewId && !canEditReview(confirmation,review) ?
      reviewLoadFailed ? <button type="button" className="secondary-button"
        onClick={() => { setMessage(''); setReviewReload((value) => value + 1); }}>
        리뷰 다시 조회</button> : <p role="status">리뷰 확인 중</p> : null}
    {canEditReview(confirmation,review) ? <form className="account-form" onSubmit={saveReview}>
      <h5>{review ? '리뷰 수정' : '리뷰 작성'}</h5>
      <label htmlFor={`review-rating-${line.optionId}`}>평점</label>
      <select id={`review-rating-${line.optionId}`} value={rating}
        onChange={(event) => setRating(Number(event.target.value))}>
        {[5,4,3,2,1].map((value) => <option key={value} value={value}>{value}점</option>)}
      </select>
      <label htmlFor={`review-text-${line.optionId}`}>리뷰 내용</label>
      <textarea id={`review-text-${line.optionId}`} value={text} maxLength={2000}
        onChange={(event) => setText(event.target.value)} rows={3} required />
      <button type="submit" className="primary-button" disabled={busy}>리뷰 저장</button>
    </form> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
