'use client';

import { useEffect, useState, type FormEvent } from 'react';

type Proposal = { productId: string; revisionId: string; title: string; sellerName: string; proposedAt: string };
type ViewProps = { proposals: Proposal[]; busy: boolean; onReject: (revisionId: string, reason: string) => void };
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

export function AdminProposalView({ proposals, busy, onReject }: ViewProps) {
  function reject(event: FormEvent<HTMLFormElement>, revisionId: string) {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
    if (reason) onReject(revisionId, reason);
  }
  return <section className="account-card profile-card" aria-labelledby="pending-proposal-title">
    <h2 id="pending-proposal-title">상품 승인 대기</h2>
    <p>판매자의 요청은 심사 전까지 고객에게 보이지 않습니다. 반려에는 사유와 결정 이력이 남습니다</p>
    {proposals.length === 0 ? <p>현재 승인 대기 상품이 없습니다</p> : <ul className="catalog-list">
      {proposals.map((item) => <li key={item.revisionId} className="draft-product-item">
        <strong>{item.title}</strong> · {item.sellerName}<br />
        <small>요청 시각: {new Date(item.proposedAt).toLocaleString('ko-KR')}</small>
        <form className="account-form" onSubmit={(event) => reject(event, item.revisionId)}>
          <label htmlFor={`reason-${item.revisionId}`}>반려 사유</label>
          <textarea id={`reason-${item.revisionId}`} name="reason" required maxLength={500} rows={2} />
          <button type="submit" className="secondary-button" disabled={busy}>반려</button>
        </form>
      </li>)}
    </ul>}
    <p>상품 승인·공개는 안전한 이미지 검사와 공개 저장 경로를 갖춘 뒤 제공합니다</p>
  </section>;
}

export default function AdminProposalsPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'unavailable'>('loading');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function load(signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const response = await fetch(`${apiOrigin}/catalog/admin/proposals`, { credentials: 'include', signal });
    if (!response.ok) throw new Error('Review queue unavailable');
    setProposals(await response.json() as Proposal[]);
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

  return <main className="shell account-shell">
    <a className="text-link" href="/account">내 계정으로</a>
    <h1>상품 요청 검토</h1>
    {state === 'loading' ? <p role="status">운영자 권한 확인 중</p> : null}
    {state === 'unauthorized' ? <p role="alert">운영자 로그인 후 이용할 수 있습니다</p> : null}
    {state === 'unavailable' ? <p role="alert">승인 대기 목록을 불러올 수 없습니다</p> : null}
    {state === 'ready' ? <><AdminProposalView proposals={proposals} busy={busy} onReject={reject} />
      {message ? <p role="status">{message}</p> : null}</> : null}
  </main>;
}
