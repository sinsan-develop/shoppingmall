'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

type Line = { productId: string; optionId: string; productName: string;
  optionName: string; quantity: number; remainingQuantity: number };
type Confirmation = { id: string; reviewId: string | null; reviewStatus: string | null };
type Review = { id: string; rating: number; body: string; status: string };
export function reviewStatusLabel(status: string | null) {
  switch (status) {
    case null: return '미작성';
    case 'PENDING': return '검토 대기';
    case 'APPROVED': return '공개됨';
    case 'HIDDEN': return '숨김';
    default: return '상태 확인 중';
  }
}
type ReviewImageFile = Pick<File,'name' | 'type' | 'size' | 'lastModified'>;
export function createReviewImageUploadKeys(nextKey: () => string) {
  const keys = new Map<string,string>();
  return { forFile(reviewId: string,file: ReviewImageFile) {
    const identity = `${reviewId}|${file.name}|${file.type}|${file.size}|${file.lastModified}`;
    const key = keys.get(identity) ?? nextKey();
    keys.set(identity,key);
    return key;
  } };
}
export function canEditReview(confirmation: Confirmation | null, review: Review | undefined) {
  return Boolean(confirmation && (!confirmation.reviewId ||
    (review?.id === confirmation.reviewId && review.status !== 'HIDDEN')));
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
  const imageKeys = useRef(createReviewImageUploadKeys(() => crypto.randomUUID()));
  const [uploadedImages,setUploadedImages] = useState<{ id: string; sizeBytes: number }[]>([]);
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

  async function uploadReviewImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiOrigin || !review || !canEditReview(confirmation,review) ||
        review.status === 'HIDDEN' || busy) return;
    const form = event.currentTarget;
    const file = new FormData(form).get('review-image');
    if (!(file instanceof File) || !file.size ||
        !['image/png','image/jpeg','image/webp'].includes(file.type) ||
        file.size > 5 * 1024 * 1024) {
      setMessage('PNG·JPEG·WebP 사진을 5MiB 이내로 선택해 주세요');
      return;
    }
    const key = imageKeys.current.forFile(review.id,file);
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/customer/support/reviews/${encodeURIComponent(review.id)}/images`, {
        method:'POST',credentials:'include',headers:{
          'content-type':file.type,'idempotency-key': key },body:file,
      });
      if (response.status === 503) { setMessage('이미지 저장소를 사용할 수 없습니다'); return; }
      if (response.status === 413) { setMessage('사진 크기를 5MiB 이내로 줄여 주세요'); return; }
      if (response.status === 409) { setMessage('사진 장수 또는 중복 요청을 확인해 주세요'); return; }
      if (response.status === 404) { setMessage('본인 리뷰를 찾을 수 없습니다'); return; }
      if (!response.ok) { setMessage('사진 등록 결과를 확인하지 못했습니다. 같은 사진으로 다시 시도해 주세요'); return; }
      const saved = await response.json() as { id: string; sizeBytes: number };
      setUploadedImages((current) => current.some((image) => image.id === saved.id) ? current :
        [...current,{ id:saved.id,sizeBytes:saved.sizeBytes }]);
      setReview({ ...review,status:'PENDING' });
      setConfirmation((current) => current ? { ...current,reviewStatus:'PENDING' } : current);
      form.reset();
      setMessage('리뷰 사진을 등록했습니다. 관리자 확인 전에는 공개되지 않습니다');
    } catch { setMessage('사진 등록 결과를 확인하지 못했습니다. 같은 사진으로 다시 시도해 주세요'); }
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
    {confirmation ? <p>구매확정됨 · 리뷰 {reviewStatusLabel(confirmation.reviewStatus)}</p> :
      <button type="button" className="secondary-button"
        disabled={loading || loadFailed || busy || !apiOrigin}
        onClick={confirm}>구매확정</button>}
    {confirmation?.reviewId && !canEditReview(confirmation,review) ?
      review?.status === 'HIDDEN' ? <p>운영자에 의해 숨김 처리된 리뷰입니다</p> :
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
    {apiOrigin && review && canEditReview(confirmation,review) ? <>
      <form className="account-form" onSubmit={uploadReviewImage}>
        <label htmlFor={`review-image-${line.optionId}`}>리뷰 사진 추가(최대 5장, 파일당 5MiB)</label>
        <input id={`review-image-${line.optionId}`} name="review-image" type="file"
          accept="image/png,image/jpeg,image/webp" required />
        <button type="submit" className="secondary-button" disabled={busy}>리뷰 사진 등록</button>
      </form>
      {uploadedImages.length ? <ul>{uploadedImages.map((image) => <li key={image.id}>
        <a className="text-link" target="_blank" rel="noopener noreferrer"
          href={`${apiOrigin}/customer/support/reviews/${encodeURIComponent(review.id)}/images/${encodeURIComponent(image.id)}/preview`}>
          방금 등록한 사진</a> · {image.sizeBytes}바이트
      </li>)}</ul> : null}
    </> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
