'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { PrivateImage } from '../../private-image';

type Proposal = { productId: string; revisionId: string; title: string; sellerName: string; proposedAt: string;
  description: string; originLabel: string; shippingMode: 'seller_direct' | 'owool_fulfillment';
  options: { name: string; priceWon: number }[]; thumbnailCount: number; detailImageCount: number };
type StockRequest = { requestId: string; optionId: string; sellerName: string; title: string;
  optionName: string; targetOnHand: number; sellable: number; createdAt: string };
type SaleStopRequest = { id: string; productId: string; sellerName: string; title: string;
  reason: string; requestedAt: string };
type ProposalImage = { id: string; purpose: 'thumbnail' | 'detail'; displayOrder: number };
type ViewProps = { proposals: Proposal[]; busy: boolean; onReject: (revisionId: string, reason: string) => void;
  onApprove?: (revisionId: string) => void;
  onLoadImages: (revisionId: string) => Promise<ProposalImage[]> };
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

function PendingPhotos({ item, busy, onLoadImages, onApprove }: {
  item: Proposal; busy: boolean; onLoadImages: ViewProps['onLoadImages'];
  onApprove?: ViewProps['onApprove'];
}) {
  const [images, setImages] = useState<ProposalImage[]>();
  const [loadedIds, setLoadedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function loadImages() {
    setLoading(true); setError(''); setLoadedIds([]);
    try { setImages(await onLoadImages(item.revisionId)); }
    catch { setError('심사 사진을 불러오지 못했습니다'); }
    finally { setLoading(false); }
  }
  return <div>
    <button type="button" className="secondary-button" disabled={busy || loading || item.thumbnailCount + item.detailImageCount === 0}
      onClick={() => void loadImages()}>심사 사진 보기</button>
    {error ? <p role="alert">{error}</p> : null}
    {images ? <ul className="draft-image-list" aria-label="비공개 심사 사진">
      {images.map((image, index) => <li key={image.id}>
        {apiOrigin ? <PrivateImage className="draft-image-preview"
          src={`${apiOrigin}/catalog/admin/proposals/${item.revisionId}/images/${image.id}/preview`}
          alt={`비공개 심사 ${image.purpose === 'thumbnail' ? '대표' : '상세'} 사진 ${index + 1}`}
          onLoad={() => setLoadedIds((current) => current.includes(image.id) ? current : [...current, image.id])} /> : null}
        <span>{index + 1}번 · {image.purpose === 'thumbnail' ? '대표' : '상세'}</span>
      </li>)}
    </ul> : null}
    {images && images.length > 0 && images.length === item.thumbnailCount + item.detailImageCount &&
      loadedIds.length === images.length ? <>
      <p>심사 사진 {images.length}개를 확인할 수 있습니다</p>
      {item.thumbnailCount === 1 && onApprove ? <button type="button" className="primary-button"
        disabled={busy} onClick={() => onApprove(item.revisionId)}>상품 승인</button> : null}
    </> : null}
  </div>;
}

export function AdminProposalView({ proposals, busy, onReject, onApprove, onLoadImages }: ViewProps) {
  function reject(event: FormEvent<HTMLFormElement>, revisionId: string) {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
    if (reason) onReject(revisionId, reason);
  }
  return <section className="account-card profile-card" aria-labelledby="pending-proposal-title">
    <h2 id="pending-proposal-title">상품 승인 대기</h2>
    <p>사진과 상품 내용을 확인해 주세요. 승인은 서버의 악성코드 검사 통과 후 고객에게 반영되며, 반려에는 사유가 남습니다</p>
    {proposals.length === 0 ? <p>현재 승인 대기 상품이 없습니다</p> : <ul className="catalog-list">
      {proposals.map((item) => <li key={item.revisionId} id={`proposal-${item.revisionId}`} className="draft-product-item">
        <strong>{item.title}</strong> · {item.sellerName}<br />
        <small>요청 시각: {new Date(item.proposedAt).toLocaleString('ko-KR')}</small>
        <p>산지: {item.originLabel} · {item.shippingMode === 'seller_direct' ? '판매자 직접 발송' : '어울몰 발송'}</p>
        <p className="proposal-description">{item.description}</p>
        <ul>{item.options.map((option) => <li key={option.name}>
          {option.name} · {option.priceWon.toLocaleString('ko-KR')}원
        </li>)}</ul>
        <p>대표 사진 {item.thumbnailCount}개 · 상세 사진 {item.detailImageCount}개</p>
        <PendingPhotos item={item} busy={busy} onLoadImages={onLoadImages} onApprove={onApprove} />
        <form className="account-form" onSubmit={(event) => reject(event, item.revisionId)}>
          <label htmlFor={`reason-${item.revisionId}`}>반려 사유</label>
          <textarea id={`reason-${item.revisionId}`} name="reason" required maxLength={500} rows={2} />
          <button type="submit" className="secondary-button" disabled={busy}>반려</button>
        </form>
      </li>)}
    </ul>}
    <p>이미지 검사기 오류나 사진 누락이 있으면 승인을 중단하고 현재 공개 상품은 유지합니다</p>
  </section>;
}

export function AdminStockView({ requests, busy, onApprove }: {
  requests: StockRequest[]; busy: boolean; onApprove: (requestId: string) => void;
}) {
  return <section className="account-card profile-card" aria-labelledby="pending-stock-title">
    <h2 id="pending-stock-title">재고 증가 승인 대기</h2>
    <p>수량 증가·재판매는 승인 전까지 구매 가능 수량에 반영되지 않습니다</p>
    {requests.length === 0 ? <p>현재 대기 중인 재고 요청이 없습니다</p> : <ul className="catalog-list">
      {requests.map((item) => <li key={item.requestId} id={`stock-${item.requestId}`} className="draft-product-item">
        <strong>{item.sellerName} · {item.title} · {item.optionName}</strong>
        <p>판매 가능 {item.sellable}개 · 요청 {item.targetOnHand}개</p>
        <small>요청 시각: {new Date(item.createdAt).toLocaleString('ko-KR')}</small>
        <button type="button" className="secondary-button" disabled={busy}
          onClick={() => onApprove(item.requestId)}>증가 승인</button>
      </li>)}
    </ul>}
  </section>;
}

export function AdminSaleStopView({ requests, busy, onApprove, onReject }: {
  requests: SaleStopRequest[]; busy: boolean; onApprove: (requestId: string) => void;
  onReject: (requestId: string, reason: string) => void;
}) {
  return <section className="account-card profile-card" aria-labelledby="pending-sale-stop-title">
    <h2 id="pending-sale-stop-title">판매중지 승인 대기</h2>
    <p>승인하면 신규 구매가 차단되고 활성 재고 예약은 요청 사유와 함께 취소됩니다. 반려하면 판매가 유지됩니다. 기존 주문은 보존됩니다</p>
    {requests.length === 0 ? <p>현재 판매중지 요청이 없습니다</p> : <ul className="catalog-list">
      {requests.map((item) => <li key={item.id} id={`sale-stop-${item.id}`} className="draft-product-item">
        <strong>{item.sellerName} · {item.title}</strong>
        <p>요청 사유: {item.reason}</p>
        <small>요청 시각: {new Date(item.requestedAt).toLocaleString('ko-KR')}</small>
        <div><button type="button" className="secondary-button" disabled={busy}
          onClick={() => onApprove(item.id)}>판매중지 승인</button></div>
        <form className="account-form" onSubmit={(event) => {
          event.preventDefault();
          const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
          if (reason) onReject(item.id, reason);
        }}>
          <label htmlFor={`stop-reject-${item.id}`}>반려 사유</label>
          <textarea id={`stop-reject-${item.id}`} name="reason" required maxLength={500} rows={2} />
          <button type="submit" className="secondary-button" disabled={busy}>판매중지 반려</button>
        </form>
      </li>)}
    </ul>}
  </section>;
}

export function AdminReservationCancelView({ busy, onCancel }: {
  busy: boolean; onCancel: (id: string, reason: string) => void;
}) {
  return <section className="account-card profile-card" aria-labelledby="reservation-cancel-title">
    <h2 id="reservation-cancel-title">재고 예약 취소</h2>
    <p>출고할 수 없는 경우 고객에게 안내된 예약 번호와 사유를 확인한 뒤 취소해 주세요. 주문·환불 처리는 이 화면에 포함되지 않습니다</p>
    <form className="account-form" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const id = String(data.get('reservationId') ?? '').trim();
      const reason = String(data.get('reason') ?? '').trim();
      if (id && reason) onCancel(id, reason);
    }}>
      <label htmlFor="reservation-cancel-id">예약 번호</label>
      <input id="reservation-cancel-id" name="reservationId" required maxLength={36} />
      <label htmlFor="reservation-cancel-reason">취소 사유</label>
      <textarea id="reservation-cancel-reason" name="reason" required maxLength={500} rows={2} />
      <button type="submit" className="secondary-button" disabled={busy}>예약 취소</button>
    </form>
  </section>;
}

export default function AdminProposalsPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'unavailable'>('loading');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [stockRequests, setStockRequests] = useState<StockRequest[]>([]);
  const [saleStopRequests, setSaleStopRequests] = useState<SaleStopRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function load(signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const [proposalResponse, stockResponse, stopResponse] = await Promise.all([
      fetch(`${apiOrigin}/catalog/admin/proposals`, { credentials: 'include', signal }),
      fetch(`${apiOrigin}/catalog/admin/stock-requests`, { credentials: 'include', signal }),
      fetch(`${apiOrigin}/catalog/admin/sale-stop-requests`, { credentials: 'include', signal }),
    ]);
    if (!proposalResponse.ok || !stockResponse.ok || !stopResponse.ok) throw new Error('Review queue unavailable');
    setProposals(await proposalResponse.json() as Proposal[]);
    setStockRequests(await stockResponse.json() as StockRequest[]);
    setSaleStopRequests(await stopResponse.json() as SaleStopRequest[]);
  }

  useEffect(() => {
    if (!apiOrigin) { setState('unavailable'); return; }
    const controller = new AbortController();
    async function start() {
      const response = await fetch(`${apiOrigin}/auth/me`, { credentials: 'include', signal: controller.signal });
      if (!response.ok) { setState(response.status === 401 ? 'unauthorized' : 'unavailable'); return; }
      const session = await response.json() as { role: string };
      if (session.role !== 'admin') { setState('unauthorized'); return; }
      await load(controller.signal);
      setState('ready');
    }
    start().catch((error: unknown) => {
      if (error instanceof Error && error.name !== 'AbortError') setState('unavailable');
    });
    return () => controller.abort();
  }, []);

  async function reject(revisionId: string, reason: string) {
    if (!apiOrigin || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/catalog/admin/proposals/${revisionId}/reject`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (!response.ok) { setMessage('반려하지 못했습니다. 요청 상태와 사유를 확인해 주세요'); return; }
      await load();
      setMessage('반려 사유와 운영 이력을 기록했습니다');
    } catch { setMessage('검토 서버에 연결할 수 없습니다'); }
    finally { setBusy(false); }
  }

  async function approveProduct(revisionId: string) {
    if (!apiOrigin || busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/catalog/admin/proposals/${revisionId}/approve`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}',
      });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (!response.ok) {
        setMessage(response.status === 503 ? '사진 검사 서비스를 사용할 수 없어 공개하지 않았습니다' :
          '상품을 승인하지 못했습니다. 사진·옵션과 요청 상태를 확인해 주세요');
        return;
      }
      await load(); setMessage('검사를 통과한 상품을 승인·공개하고 운영 이력을 기록했습니다');
    } catch { setMessage('상품 검토 서버에 연결할 수 없습니다'); }
    finally { setBusy(false); }
  }

  async function loadImages(revisionId: string): Promise<ProposalImage[]> {
    if (!apiOrigin) throw new Error('API unavailable');
    const response = await fetch(`${apiOrigin}/catalog/admin/proposals/${revisionId}/images`,
      { credentials: 'include' });
    if (response.status === 401 || response.status === 403) { setState('unauthorized'); throw new Error('Unauthorized'); }
    if (!response.ok) throw new Error('Images unavailable');
    return response.json() as Promise<ProposalImage[]>;
  }

  async function approveStock(requestId: string) {
    if (!apiOrigin || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/catalog/admin/stock-requests/${requestId}/approve`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}',
      });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (!response.ok) { setMessage('재고 증가를 승인하지 못했습니다. 요청 상태를 확인해 주세요'); return; }
      await load();
      setMessage('재고 증가 승인과 운영 이력을 기록했습니다');
    } catch { setMessage('재고 검토 서버에 연결할 수 없습니다'); }
    finally { setBusy(false); }
  }

  async function decideSaleStop(requestId: string, decision: 'approve' | 'reject', reason?: string) {
    if (!apiOrigin || busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/catalog/admin/sale-stop-requests/${requestId}/${decision}`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(reason ? { reason } : {}),
      });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (!response.ok) { setMessage('판매중지 결정을 기록하지 못했습니다. 요청 상태를 다시 확인해 주세요'); return; }
      await load();
      setMessage(decision === 'approve' ? '판매중지를 승인했습니다. 신규 구매가 차단됩니다' :
        '판매중지를 반려했습니다. 기존 판매가 유지됩니다');
    } catch { setMessage('판매중지 검토 서버에 연결할 수 없습니다'); }
    finally { setBusy(false); }
  }

  async function cancelReservation(id: string, reason: string) {
    if (!apiOrigin || busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/checkout/admin/reservations/${encodeURIComponent(id)}/cancel`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return; }
      if (response.status === 404) { setMessage('예약 번호를 찾지 못했습니다. 다시 확인해 주세요'); return; }
      if (!response.ok) { setMessage('예약을 취소하지 못했습니다. 만료 여부와 사유를 확인해 주세요'); return; }
      const result = await response.json() as { status: string };
      setMessage(result.status === 'CANCELLED' ? '예약 취소 사유와 운영 이력을 기록했습니다' :
        '이미 종료된 예약입니다. 상태를 확인해 주세요');
    } catch { setMessage('예약 관리 서버에 연결할 수 없습니다'); }
    finally { setBusy(false); }
  }

  return <main id="main-content" tabIndex={-1} className="shell account-shell">
    <a className="text-link" href="/account">내 계정으로</a>
    <h1>상품 요청 검토</h1>
    {state === 'loading' ? <p role="status">운영자 권한 확인 중</p> : null}
    {state === 'unauthorized' ? <p role="alert">운영자 로그인 후 이용할 수 있습니다</p> : null}
    {state === 'unavailable' ? <p role="alert">승인 대기 목록을 불러올 수 없습니다</p> : null}
    {state === 'ready' ? <><AdminProposalView proposals={proposals} busy={busy} onReject={reject}
      onApprove={(id) => void approveProduct(id)}
      onLoadImages={loadImages} />
      <AdminStockView requests={stockRequests} busy={busy} onApprove={approveStock} />
      <AdminSaleStopView requests={saleStopRequests} busy={busy}
        onApprove={(id) => void decideSaleStop(id, 'approve')}
        onReject={(id, reason) => void decideSaleStop(id, 'reject', reason)} />
      <AdminReservationCancelView busy={busy} onCancel={(id, reason) => void cancelReservation(id, reason)} />
      {message ? <p role="status">{message}</p> : null}</> : null}
  </main>;
}
