'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SettlementReportView, type SettlementReport } from './settlement-report';

type Choice = { id: string; name: string; categoryId?: string };
type Filter = { from: string; to: string; categoryId: string; sellerId: string };
type Role = 'admin' | 'seller';

export function completionOverlaps(completions: SettlementReport['completions'],
  sellerId: string, from: string, to: string): boolean {
  return completions.some((entry) => entry.sellerId === sellerId &&
    entry.startDate <= to && entry.endDate >= from);
}

export function completionCandidates(sellers: Choice[], filter: Pick<Filter, 'categoryId' | 'sellerId'>) {
  return sellers.filter((seller) =>
    (!filter.categoryId || seller.categoryId === filter.categoryId) &&
    (!filter.sellerId || seller.id === filter.sellerId));
}

export function seoulInputToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('발생 시점을 확인해 주세요.');
  const date = new Date(`${value}:00+09:00`);
  if (!Number.isFinite(date.getTime())) throw new Error('발생 시점을 확인해 주세요.');
  if (new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16) !== value)
    throw new Error('발생 시점을 확인해 주세요.');
  return date.toISOString();
}

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');

function seoulToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric',
    month: '2-digit', day: '2-digit' }).format(new Date());
}

async function catalogChoices(path: string, signal: AbortSignal): Promise<Choice[]> {
  const response = await fetch(`${apiOrigin}${path}`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('판매자·분류 목록을 불러오지 못했습니다.');
  const data = await response.json() as { items?: { id: string; name?: string;
    displayName?: string; categoryId?: string }[] } |
    { id: string; name?: string; displayName?: string; categoryId?: string }[];
  const items = Array.isArray(data) ? data : data.items ?? [];
  return items.map((item) => ({ id: item.id, name: item.displayName ?? item.name ?? item.id,
    categoryId: item.categoryId }));
}

export function SettlementPage({ role }: { role: Role }) {
  const [filter, setFilter] = useState<Filter>(() => ({ from: seoulToday(), to: seoulToday(),
    categoryId: '', sellerId: '' }));
  const [authorized, setAuthorized] = useState(false);
  const [report, setReport] = useState<SettlementReport | null>(null);
  const [categories, setCategories] = useState<Choice[]>([]);
  const [sellers, setSellers] = useState<Choice[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const commissionRetry = useRef<{ signature: string; requestId: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function start() {
      if (!apiOrigin) { setError('API 주소가 설정되지 않았습니다.'); setBusy(false); return; }
      try {
        const sessionPromise = fetch(`${apiOrigin}/auth/me`, {
          credentials: 'include', signal: controller.signal, cache: 'no-store',
        });
        const choicesPromise = role === 'admin'
          ? Promise.all([catalogChoices('/catalog/seller-categories', controller.signal),
            catalogChoices('/catalog/sellers', controller.signal)]) : null;
        const [session, choices] = await Promise.all([sessionPromise, choicesPromise]);
        if (!session.ok) throw new Error('로그인이 필요합니다.');
        const actor = await session.json() as { role: string };
        if (actor.role !== role) throw new Error('현재 역할로는 정산 자료를 볼 수 없습니다.');
        if (choices) {
          const [categoryList, sellerList] = choices;
          if (!controller.signal.aborted) { setCategories(categoryList); setSellers(sellerList); }
        }
        if (!controller.signal.aborted) setAuthorized(true);
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : '계정을 확인하지 못했습니다.');
          setBusy(false);
        }
      }
    }
    void start();
    return () => controller.abort();
  }, [role]);

  useEffect(() => {
    if (!authorized || !apiOrigin) return;
    const controller = new AbortController();
    async function load() {
      setBusy(true); setError(''); setReport(null);
      try {
        const params = new URLSearchParams({ from: filter.from, to: filter.to });
        if (role === 'admin') {
          if (filter.categoryId) params.set('categoryId', filter.categoryId);
          if (filter.sellerId) params.set('sellerId', filter.sellerId);
        }
        const response = await fetch(`${apiOrigin}/${role}/settlement?${params}`, {
          credentials: 'include', signal: controller.signal, cache: 'no-store',
        });
        if (!response.ok) throw new Error(`정산 자료 조회에 실패했습니다. (${response.status})`);
        const data = await response.json() as SettlementReport;
        if (!controller.signal.aborted) setReport(data);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '조회에 실패했습니다.');
      } finally { if (!controller.signal.aborted) setBusy(false); }
    }
    void load();
    return () => controller.abort();
  }, [authorized, filter, reload, role]);

  function choose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setFilter({ from: String(values.get('from') ?? ''), to: String(values.get('to') ?? ''),
      categoryId: role === 'admin' ? String(values.get('categoryId') ?? '') : '',
      sellerId: role === 'admin' ? String(values.get('sellerId') ?? '') : '' });
    setNotice('');
  }

  async function complete(event: FormEvent<HTMLFormElement>, sellerId: string, sellerName: string) {
    event.preventDefault();
    if (!apiOrigin || saving) return;
    setSaving(true); setError(''); setNotice('');
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
    try {
      const response = await fetch(`${apiOrigin}/admin/settlement/completions`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId, from: filter.from, to: filter.to, reason }),
      });
      if (!response.ok) throw new Error(response.status === 409
        ? '이미 완료된 기간과 겹칩니다. 기간을 확인해 주세요.'
        : `완료 기록에 실패했습니다. (${response.status})`);
      setNotice(`${sellerName} · ${filter.from} ~ ${filter.to} 완료 여부를 기록했습니다.`);
      setReload((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '완료 기록에 실패했습니다.');
    } finally { setSaving(false); }
  }

  async function commission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiOrigin || saving || role !== 'admin') return;
    const values = new FormData(event.currentTarget);
    const sellerId = String(values.get('sellerId') ?? '');
    const amountWon = Number(values.get('amountWon'));
    const reason = String(values.get('reason') ?? '').trim();
    try {
      const occurredAt = seoulInputToIso(String(values.get('occurredAt') ?? ''));
      const signature = JSON.stringify([sellerId, amountWon, occurredAt, reason]);
      if (!commissionRetry.current || commissionRetry.current.signature !== signature) {
        commissionRetry.current = { signature, requestId: crypto.randomUUID() };
      }
      setSaving(true); setError(''); setNotice('');
      const response = await fetch(`${apiOrigin}/admin/settlement/commissions`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId, amountWon, occurredAt, reason,
          requestId: commissionRetry.current.requestId }),
      });
      if (!response.ok) throw new Error(response.status === 409
        ? '같은 요청 번호의 내용이 달라 기록하지 않았습니다.'
        : `수수료 기록에 실패했습니다. (${response.status})`);
      commissionRetry.current = null;
      setNotice('수수료 발생 내역을 기록했습니다. 완료 기간에 해당하면 추가 발생으로 표시됩니다.');
      setReload((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '수수료 기록에 실패했습니다.');
    } finally { setSaving(false); }
  }

  return <main id="main-content" tabIndex={-1} className="shell settlement-page">
    <a className="text-link settlement-controls" href="/account">계정 메뉴</a>
    <section className="account-card profile-card settlement-controls">
      <h1>{role === 'admin' ? '관리자 정산 자료' : '내 정산 자료'}</h1>
      <p>발생 시점별 자료입니다. 수수료·배송비·할인·환불액의 부담과 지급액은 자동 확정하지 않습니다.</p>
      <form className="settlement-filter" onSubmit={choose} aria-label="정산 조회 조건">
        <label>시작일 <input type="date" name="from" defaultValue={filter.from} required /></label>
        <label>종료일 <input type="date" name="to" defaultValue={filter.to} required /></label>
        {role === 'admin' ? <>
          <label>판매자 분류 <select name="categoryId" defaultValue={filter.categoryId}>
            <option value="">전체 분류</option>
            {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label>판매자 <select name="sellerId" defaultValue={filter.sellerId}>
            <option value="">전체 판매자</option>
            {sellers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
        </> : null}
        <button className="primary-button" type="submit" disabled={!authorized || busy}>조회</button>
      </form>
      {report ? <button className="secondary-button" type="button" onClick={() => window.print()}>
        조회 결과 인쇄 · PDF로 저장
      </button> : null}
    </section>
    {error ? <p className="account-card settlement-controls" role="alert">{error}</p> : null}
    {notice ? <p className="account-card settlement-controls" role="status">{notice}</p> : null}
    {busy ? <p role="status">정산 자료를 불러오는 중입니다.</p> : null}
    {report ? <SettlementReportView report={report} /> : null}
    {role === 'admin' ? <section className="account-card profile-card settlement-controls"
      aria-label="수수료 수동 기록">
      <h2>수수료 수동 기록</h2>
      <p>실제 발생 시점과 근거를 기록합니다. 완료된 기간의 금액은 바뀌지 않습니다.</p>
      <form className="settlement-filter" onSubmit={(event) => void commission(event)}>
        <label>판매자 <select name="sellerId" required defaultValue="">
          <option value="">판매자 선택</option>
          {sellers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>수수료 금액(원) <input type="number" name="amountWon" min="1" step="1" required /></label>
        <label>발생 시점 (한국 시각) <input type="datetime-local" name="occurredAt" required /></label>
        <label>기록 근거 <input name="reason" maxLength={500} required /></label>
        <button className="primary-button" type="submit" disabled={!authorized || saving}>수수료 기록</button>
      </form>
    </section> : null}
    {role === 'admin' && report ? <section className="settlement-controls" aria-label="판매자별 완료 기록">
      <h2>판매자별 완료 기록</h2>
      <p>실제 송금은 시스템 밖에서 진행합니다. 확인한 판매자 한 명씩 완료 여부를 기록해 주세요.</p>
      {completionCandidates(sellers, filter).map((seller) => completionOverlaps(report.completions,
        seller.id, filter.from, filter.to) ?
        <div className="account-card" key={seller.id}>
          <h3>{seller.name}</h3><p>이미 완료된 기간과 겹칩니다. 완료 이력을 확인해 주세요.</p>
        </div> : <form className="account-card settlement-completion"
          key={seller.id} onSubmit={(event) => void complete(event, seller.id, seller.name)}>
          <h3>{seller.name}</h3>
          <p>{filter.from} ~ {filter.to}</p>
          <label>완료 근거 <input name="reason" maxLength={500} required
            placeholder="예: 오프라인 송금 확인" /></label>
          <button className="primary-button" type="submit" disabled={saving}>이 판매자 기간 완료 기록</button>
        </form>)}
    </section> : null}
  </main>;
}
