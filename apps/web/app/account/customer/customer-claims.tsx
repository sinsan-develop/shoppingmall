'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { claimActionLabel, claimActorRoleLabel, claimEventReasonLabel,
  claimKindLabel, claimReasonCodeLabel, claimStatusLabel } from '../support-claim-labels';

type Line = { productId: string; optionId: string; productName: string;
  optionName: string; quantity: number; remainingQuantity: number; claimAvailableQuantity: number };
type Summary = { id: string; productId: string; shipmentOrderId: string;
  kind: string; reasonCode: string; status: string; createdAt: string };
type Detail = Summary & { reason: string; quantity: number;
  messages: { id: string; authorRole: string; body: string; createdAt: string }[];
  events: { action: string; actorRole: string; reason: string; occurredAt: string }[];
  evidence: { id: string; mimeType: string; sizeBytes: number }[] };
type Page = { items: Summary[]; nextCursor: string | null };
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');
const evidenceTypes = new Set(['image/png','image/jpeg','image/webp']);

type EvidenceFileIdentity = Pick<File,'name' | 'type' | 'size' | 'lastModified'>;
export function createEvidenceUploadKeys(nextKey: () => string) {
  const keys = new Map<string,string>();
  return { forFile(claimId: string,file: EvidenceFileIdentity) {
    const identity = `${claimId}|${file.name}|${file.type}|${file.size}|${file.lastModified}`;
    const key = keys.get(identity) ?? nextKey();
    keys.set(identity,key);
    return key;
  } };
}

export function CustomerClaimLine({ orderId,shipmentOrderId,status,line,onCreated }: {
  orderId: string; shipmentOrderId: string; status: string; line: Line;
  onCreated: () => void;
}) {
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const keys = useRef(new Map<string,string>());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiOrigin || busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const body = { orderId,shipmentOrderId,optionId: line.optionId,
      kind: String(fields.get('kind') ?? ''),reasonCode: String(fields.get('reasonCode') ?? ''),
      reason: String(fields.get('reason') ?? '').trim(),quantity: Number(fields.get('quantity')) };
    const identity = JSON.stringify(body);
    const key = keys.current.get(identity) ?? crypto.randomUUID();
    keys.current.set(identity,key);
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/customer/support/claims`, {
        method: 'POST',credentials: 'include',headers: {
          'content-type': 'application/json','idempotency-key': key },
        body: JSON.stringify(body),
      });
      if (response.status === 404) { setMessage('본인 출고 품목을 찾을 수 없습니다'); return; }
      if (response.status === 409) { setMessage('접수 가능 수량 또는 중복 요청을 확인해 주세요'); return; }
      if (!response.ok) { setMessage('접수 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요'); return; }
      const saved = await response.json() as { id: string };
      keys.current.delete(identity);
      form.reset();
      setMessage(`클레임을 접수했습니다. 접수 ID ${saved.id}`);
      onCreated();
    } catch { setMessage('접수 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요'); }
    finally { setBusy(false); }
  }
  if (status !== 'SHIPPED' || line.claimAvailableQuantity <= 0) return null;
  return <section className="account-card profile-card" aria-label={`${line.productName} 클레임`}>
    <h4>{line.productName} · {line.optionName}</h4>
    <p>결제 후 출고된 품목만 신청할 수 있습니다. 상품 판매자가 답변하고 관리자가 결정합니다.</p>
    <form className="account-form" onSubmit={submit}>
      <h5>클레임 접수</h5>
      <label htmlFor={`claim-kind-${line.optionId}`}>신청 종류</label>
      <select id={`claim-kind-${line.optionId}`} name="kind" defaultValue="CLAIM">
        <option value="CLAIM">품목 클레임</option><option value="RETURN">반품</option>
        <option value="EXCHANGE">교환</option>
      </select>
      <label htmlFor={`claim-code-${line.optionId}`}>사유</label>
      <select id={`claim-code-${line.optionId}`} name="reasonCode" defaultValue="quality_issue">
        <option value="quality_issue">품질</option><option value="damaged">훼손</option>
        <option value="wrong_delivery">오배송</option>
        <option value="change_of_mind">변심</option><option value="other">기타</option>
      </select>
      <label htmlFor={`claim-quantity-${line.optionId}`}>수량</label>
      <input id={`claim-quantity-${line.optionId}`} name="quantity" type="number"
        min="1" max={line.claimAvailableQuantity} defaultValue="1" required />
      <label htmlFor={`claim-reason-${line.optionId}`}>상세 사유</label>
      <textarea id={`claim-reason-${line.optionId}`} name="reason" rows={3}
        maxLength={2000} required />
      <button type="submit" className="secondary-button" disabled={busy}>클레임 접수</button>
    </form>
    <p>시험정책: 배송비 환불 0원, 자동 재입고·교환 대체 발송 없음. 실제 반송비는 미확정입니다.</p>
    {message ? <p role="status">{message}</p> : null}
  </section>;
}

export function CustomerClaimsView({ items,selected,busy,message,nextCursor,onMore,onSelect,onUpload }: {
  items: Summary[]; selected?: Detail; busy: boolean; message: string;
  nextCursor: string | null; onMore: () => void; onSelect: (id: string) => void;
  onUpload: (file: File, form: HTMLFormElement) => void;
}) {
  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get('evidence');
    if (file instanceof File && file.size) onUpload(file,event.currentTarget);
  }
  return <div className="catalog-admin-grid">
    <section className="account-card profile-card" aria-labelledby="customer-claims-title">
      <h2 id="customer-claims-title">내 클레임</h2>
      {items.length === 0 ? <p>접수된 클레임이 없습니다.</p> : <ul className="catalog-list">
        {items.map((item) => <li key={item.id}>
          <button type="button" className="secondary-button" disabled={busy}
            aria-pressed={selected?.id === item.id} onClick={() => onSelect(item.id)}>
            {claimKindLabel(item.kind)} · {claimReasonCodeLabel(item.reasonCode)} · {claimStatusLabel(item.status)}</button>
          <p>발송 {item.shipmentOrderId} · {new Date(item.createdAt).toLocaleString('ko-KR')}</p>
        </li>)}
      </ul>}
      {nextCursor ? <button type="button" className="secondary-button" disabled={busy}
        onClick={onMore}>더보기</button> : null}
    </section>
    <section className="account-card profile-card" aria-labelledby="customer-claim-detail-title">
      <h2 id="customer-claim-detail-title">접수 상세·비공개 증빙</h2>
      {message ? <p role="status">{message}</p> : null}
      {!selected ? <p>확인할 클레임을 선택해 주세요.</p> : <>
        <p><strong>{claimStatusLabel(selected.status)}</strong> · {claimKindLabel(selected.kind)} · {selected.quantity}개</p>
        <p>사유 {claimReasonCodeLabel(selected.reasonCode)}: {selected.reason}</p>
        <ol>{selected.messages.map((item) => <li key={item.id}>
          {claimActorRoleLabel(item.authorRole)} · {item.body} · {new Date(item.createdAt).toLocaleString('ko-KR')}
        </li>)}</ol>
        <h3>비공개 증빙</h3>
        {selected.evidence.length === 0 ? <p>등록된 증빙이 없습니다.</p> : <ul>
          {selected.evidence.map((item) => <li key={item.id}>
            {apiOrigin ? <a className="text-link" target="_blank" rel="noopener noreferrer"
              href={`${apiOrigin}/customer/support/claims/${encodeURIComponent(selected.id)}/evidence/${encodeURIComponent(item.id)}`}>
              증빙 {item.id}</a> : '증빙 조회 불가'} · {item.mimeType} · {item.sizeBytes}바이트
          </li>)}
        </ul>}
        {['REQUESTED','SELLER_REPLIED'].includes(selected.status) && selected.evidence.length < 5 ?
          <form className="account-form" onSubmit={upload}>
          <label htmlFor="claim-evidence-file">증빙 사진 추가(최대 5장, 파일당 5MiB)</label>
          <input id="claim-evidence-file" name="evidence" type="file"
            accept="image/png,image/jpeg,image/webp" required />
          <button type="submit" className="secondary-button" disabled={busy}>비공개 증빙 등록</button>
        </form> : selected.evidence.length >= 5 ?
          <p>증빙 최대 5장을 등록했습니다.</p> : null}
        <h3>처리 이력</h3>
        <ol>{selected.events.map((item,index) => <li key={`${item.occurredAt}-${index}`}>
          {claimActionLabel(item.action)} · {claimActorRoleLabel(item.actorRole)} ·
          {' '}{claimEventReasonLabel(item)} · {new Date(item.occurredAt).toLocaleString('ko-KR')}
        </li>)}</ol>
      </>}
    </section>
  </div>;
}

export function CustomerClaimsPanel({ refresh }: { refresh: number }) {
  const [items,setItems] = useState<Summary[]>([]);
  const [selected,setSelected] = useState<Detail>();
  const [nextCursor,setNextCursor] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const uploadKeys = useRef(createEvidenceUploadKeys(() => crypto.randomUUID()));

  async function loadList(cursor?: string,signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const query = new URLSearchParams({ limit: '20' });
    if (cursor) query.set('cursor',cursor);
    const response = await fetch(`${apiOrigin}/customer/support/claims?${query}`,
      { credentials: 'include',cache: 'no-store',signal });
    if (!response.ok) throw new Error('Claims unavailable');
    const page = await response.json() as Page;
    if (signal?.aborted) return;
    setItems((previous) => cursor ? [...previous,
      ...page.items.filter((item) => !previous.some((old) => old.id === item.id))] : page.items);
    setNextCursor(page.nextCursor);
  }

  async function loadDetail(id: string,signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const response = await fetch(`${apiOrigin}/customer/support/claims/${encodeURIComponent(id)}`,
      { credentials: 'include',cache: 'no-store',signal });
    if (!response.ok) throw new Error('Claim unavailable');
    const detail = await response.json() as Detail;
    if (!signal?.aborted) setSelected(detail);
  }

  useEffect(() => {
    const controller = new AbortController();
    loadList(undefined,controller.signal).catch((error: unknown) => {
      if (error instanceof Error && error.name !== 'AbortError')
        setMessage('내 클레임을 불러오지 못했습니다');
    });
    return () => controller.abort();
  }, [refresh]);

  async function more() {
    if (busy || !nextCursor) return;
    setBusy(true);
    try { await loadList(nextCursor); }
    catch { setMessage('다음 클레임을 불러오지 못했습니다'); }
    finally { setBusy(false); }
  }

  async function select(id: string) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await loadDetail(id); }
    catch { setMessage('클레임 상세를 불러오지 못했습니다'); }
    finally { setBusy(false); }
  }

  async function upload(file: File, form: HTMLFormElement) {
    if (!apiOrigin || !selected || busy) return;
    if (!evidenceTypes.has(file.type) || file.size > 5 * 1024 * 1024) {
      setMessage('PNG/JPEG/WebP 5MiB 이하 파일만 등록할 수 있습니다'); return;
    }
    const key = uploadKeys.current.forFile(selected.id,file);
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}/customer/support/claims/${encodeURIComponent(selected.id)}/evidence`, {
        method: 'POST',credentials: 'include',headers: {
          'content-type': file.type,'idempotency-key': key },body: file,
      });
      if (response.status === 503) { setMessage('비공개 이미지 저장소를 사용할 수 없습니다'); return; }
      if (response.status === 409) { setMessage('증빙 장수 또는 동일 요청키 충돌을 확인해 주세요'); return; }
      if (!response.ok) { setMessage('등록 결과를 확인하지 못했습니다. 같은 파일로 다시 시도해 주세요'); return; }
      form.reset();
      try { await loadDetail(selected.id); }
      catch { setMessage('증빙은 저장됐지만 목록을 새로고침하지 못했습니다'); return; }
      setMessage('비공개 증빙을 등록했습니다');
    } catch { setMessage('등록 결과를 확인하지 못했습니다. 같은 파일로 다시 시도해 주세요'); }
    finally { setBusy(false); }
  }

  return <CustomerClaimsView items={items} selected={selected} busy={busy}
    message={message} nextCursor={nextCursor} onMore={more} onSelect={select}
    onUpload={upload} />;
}
