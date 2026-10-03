'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

type Campaign = { id: string; title: string; kind: 'goods_discount' | 'shipping_support';
  status: 'active' | 'stopped'; versionId: string; version: number;
  scope: 'all' | 'sellers' | 'options'; targetIds: string[]; startsAt: string; endsAt: string;
  minimumEligibleGoodsWon: number; amountKind: 'fixed' | 'percent'; amountValue: number;
  maxDiscountWon: number | null; directIssueLimit: number | null; totalUseLimit: number;
  perAccountUseLimit: number; directIssuedCount: number; activeUseCount: number;
  stopReason?: string | null };
type RuleInput = { kind: Campaign['kind']; scope: Campaign['scope']; targetIds: string[];
  startsAt: string; endsAt: string; minimumEligibleGoodsWon: number;
  amountKind: Campaign['amountKind']; amountValue: number; maxDiscountWon: number | null;
  code: string | null };
type CampaignInput = RuleInput & { title: string; directIssueLimit: number | null;
  totalUseLimit: number; perAccountUseLimit: number };
type ViewProps = { campaigns: Campaign[]; busy: boolean; onCreate: (input: CampaignInput) => void;
  onVersion: (id: string, input: RuleInput) => void; onStop: (id: string, reason: string) => void;
  onGrant: (id: string, accountId: string, reason: string) => void };
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
function localDateTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function RuleFields({ prefix, initial }: { prefix: string; initial?: Campaign }) {
  const [kind, setKind] = useState<Campaign['kind']>(initial?.kind ?? 'goods_discount');
  const [amountKind, setAmountKind] = useState<Campaign['amountKind']>(initial?.amountKind ?? 'fixed');
  const [scope, setScope] = useState<Campaign['scope']>(initial?.scope ?? 'all');
  return <>
    <label htmlFor={`${prefix}-kind`}>혜택 종류</label>
    <select id={`${prefix}-kind`} name="kind" value={kind} onChange={(event) => {
      const next = event.currentTarget.value as Campaign['kind']; setKind(next);
      if (next === 'shipping_support') setAmountKind('fixed');
    }}><option value="goods_discount">상품 할인</option><option value="shipping_support">배송비 지원</option></select>
    <label htmlFor={`${prefix}-scope`}>적용 대상</label>
    <select id={`${prefix}-scope`} name="scope" value={scope} onChange={(event) =>
      setScope(event.currentTarget.value as Campaign['scope'])}>
      <option value="all">전체 상품</option><option value="sellers">선택 판매자</option>
      <option value="options">선택 상품 옵션</option>
    </select>
    {scope !== 'all' ? <><label htmlFor={`${prefix}-targets`}>대상 ID · 한 줄에 하나</label>
      <textarea id={`${prefix}-targets`} name="targetIds" rows={2} required
        defaultValue={initial?.targetIds.join('\n') ?? ''} /></> : null}
    <label htmlFor={`${prefix}-start`}>시작 시각</label>
    <input id={`${prefix}-start`} name="startsAt" type="datetime-local" required
      defaultValue={initial ? localDateTime(initial.startsAt) : localDateTime(new Date().toISOString())} />
    <label htmlFor={`${prefix}-end`}>종료 시각</label>
    <input id={`${prefix}-end`} name="endsAt" type="datetime-local" required
      defaultValue={initial ? localDateTime(initial.endsAt) :
        localDateTime(new Date(Date.now() + 30 * 86400000).toISOString())} />
    <label htmlFor={`${prefix}-minimum`}>최소 적격 상품금액 · 원</label>
    <input id={`${prefix}-minimum`} name="minimumEligibleGoodsWon" type="number" min="0" step="1" required
      defaultValue={initial?.minimumEligibleGoodsWon ?? 0} />
    {kind === 'goods_discount' ? <><label htmlFor={`${prefix}-amount-kind`}>할인 방식</label>
      <select id={`${prefix}-amount-kind`} name="amountKind" value={amountKind} onChange={(event) =>
        setAmountKind(event.currentTarget.value as Campaign['amountKind'])}>
        <option value="fixed">정액 · 원</option><option value="percent">정률 · %</option>
      </select></> : <input type="hidden" name="amountKind" value="fixed" />}
    <label htmlFor={`${prefix}-amount`}>{amountKind === 'percent' ? '할인율 · %' : '혜택 금액 · 원'}</label>
    <input id={`${prefix}-amount`} name="amountValue" type="number" min="0.01"
      max={amountKind === 'percent' ? 100 : undefined} step={amountKind === 'percent' ? '0.01' : '1'} required
      defaultValue={initial ? (initial.amountKind === 'percent' ? initial.amountValue / 100 : initial.amountValue) :
        (kind === 'shipping_support' ? 3000 : 5000)} />
    <label htmlFor={`${prefix}-cap`}>최대 혜택액 · 원 {amountKind === 'percent' ? '(필수)' : '(선택)'}</label>
    <input id={`${prefix}-cap`} name="maxDiscountWon" type="number" min="1" step="1"
      required={amountKind === 'percent'} defaultValue={initial?.maxDiscountWon ?? ''} />
    <label htmlFor={`${prefix}-code`}>공용 코드 · 선택</label>
    <input id={`${prefix}-code`} name="code" maxLength={40} autoComplete="off" placeholder="예: HARVEST2026" />
  </>;
}

function readRule(form: HTMLFormElement): RuleInput {
  const data = new FormData(form);
  const amountKind = String(data.get('amountKind')) as RuleInput['amountKind'];
  const cap = String(data.get('maxDiscountWon') ?? '').trim();
  return { kind: String(data.get('kind')) as RuleInput['kind'],
    scope: String(data.get('scope')) as RuleInput['scope'],
    targetIds: String(data.get('targetIds') ?? '').split(/[\s,]+/).filter(Boolean),
    startsAt: new Date(String(data.get('startsAt'))).toISOString(),
    endsAt: new Date(String(data.get('endsAt'))).toISOString(),
    minimumEligibleGoodsWon: Number(data.get('minimumEligibleGoodsWon')),
    amountKind, amountValue: Number(data.get('amountValue')) * (amountKind === 'percent' ? 100 : 1),
    maxDiscountWon: cap ? Number(cap) : null, code: String(data.get('code') ?? '').trim() || null };
}

export function AdminPromotionsView({ campaigns, busy, onCreate, onVersion, onStop, onGrant }: ViewProps) {
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const directLimit = String(data.get('directIssueLimit') ?? '').trim();
    onCreate({ ...readRule(form), title: String(data.get('title') ?? '').trim(),
      directIssueLimit: directLimit ? Number(directLimit) : null,
      totalUseLimit: Number(data.get('totalUseLimit')),
      perAccountUseLimit: Number(data.get('perAccountUseLimit')) });
  }
  return <div className="catalog-admin-grid">
    <section className="account-card profile-card">
      <h2>프로모션 등록</h2>
      <p>발행 전 기간·대상·한도를 확인해 주세요. 혜택은 구매자 견적에 반영됩니다.</p>
      <form className="account-form" onSubmit={create}>
        <label htmlFor="promotion-title">이름</label>
        <input id="promotion-title" name="title" maxLength={160} required />
        <RuleFields prefix="promotion-new" />
        <label htmlFor="promotion-issue-limit">직접 발행 한도 · 선택</label>
        <input id="promotion-issue-limit" name="directIssueLimit" type="number" min="1" step="1" />
        <label htmlFor="promotion-total-limit">전체 사용 한도 · 횟수</label>
        <input id="promotion-total-limit" name="totalUseLimit" type="number" min="1" step="1" required defaultValue={100} />
        <label htmlFor="promotion-account-limit">고객별 사용 한도 · 횟수</label>
        <input id="promotion-account-limit" name="perAccountUseLimit" type="number" min="1" step="1" required defaultValue={1} />
        <button type="submit" className="primary-button" disabled={busy}>프로모션 등록</button>
      </form>
    </section>
    <section className="account-card profile-card">
      <h2>등록된 프로모션</h2>
      {campaigns.length === 0 ? <p>등록된 프로모션이 없습니다</p> :
        <ul className="catalog-list">{campaigns.map((item) => <li key={item.id} className="draft-product-item">
          <h3>{item.title}</h3>
          <p>{item.kind === 'goods_discount' ? '상품 할인' : '배송비 지원'} ·
            {item.status === 'active' ? '진행 중' : '중지'} · 버전 {item.version}</p>
          <p>{item.amountKind === 'percent' ? `${item.amountValue / 100}%` : won(item.amountValue)} ·
            최소 적격 상품금액 {won(item.minimumEligibleGoodsWon)}</p>
          <p>기간 {new Date(item.startsAt).toLocaleString('ko-KR')}부터 {new Date(item.endsAt).toLocaleString('ko-KR')}까지</p>
          <p>대상 {item.scope === 'all' ? '전체 상품' :
            `${item.scope === 'sellers' ? '판매자' : '옵션'} ${item.targetIds.join(', ')}`}</p>
          <p>발행 {item.directIssuedCount} / {item.directIssueLimit ?? '없음'} · 사용 {item.activeUseCount} / {item.totalUseLimit} · 고객별 {item.perAccountUseLimit}</p>
          {item.status === 'stopped' ? <p>중지 사유 {item.stopReason ?? ''}</p> : <>
            <details><summary>새 버전</summary>
              <form className="account-form" onSubmit={(event) => {
                event.preventDefault(); onVersion(item.id, readRule(event.currentTarget));
              }}><RuleFields key={`${item.id}-${item.version}`} prefix={`version-${item.id}`} initial={item} />
                <button type="submit" className="secondary-button" disabled={busy}>새 버전 저장</button>
              </form></details>
            {item.directIssueLimit ? <form className="account-form" onSubmit={(event) => {
              event.preventDefault(); const data = new FormData(event.currentTarget);
              onGrant(item.id, String(data.get('accountId') ?? '').trim(),
                String(data.get('reason') ?? '').trim());
            }}><h4>직접 발행</h4>
              <label htmlFor={`grant-account-${item.id}`}>고객 계정 ID</label>
              <input id={`grant-account-${item.id}`} name="accountId" required
                pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" />
              <label htmlFor={`grant-reason-${item.id}`}>발행 사유</label>
              <textarea id={`grant-reason-${item.id}`} name="reason" required maxLength={500} rows={2} />
              <button type="submit" className="secondary-button" disabled={busy}>직접 발행</button>
            </form> : null}
            <form className="account-form" onSubmit={(event) => {
              event.preventDefault(); const data = new FormData(event.currentTarget);
              onStop(item.id, String(data.get('reason') ?? '').trim());
            }}><label htmlFor={`stop-reason-${item.id}`}>중지 사유</label>
              <textarea id={`stop-reason-${item.id}`} name="reason" required maxLength={500} rows={2} />
              <button type="submit" className="secondary-button" disabled={busy}>중지</button>
            </form>
          </>}
        </li>)}</ul>}
    </section>
  </div>;
}

export default function AdminPromotionsPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'unavailable'>('loading');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const grantKeys = useRef(new Map<string, string>());
  async function reload(signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const response = await fetch(`${apiOrigin}/promotions/admin/campaigns`,
      { credentials: 'include', signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Promotion list unavailable');
    setCampaigns(await response.json() as Campaign[]);
  }
  useEffect(() => {
    if (!apiOrigin) { setState('unavailable'); return; }
    const controller = new AbortController();
    async function load() {
      const response = await fetch(`${apiOrigin}/auth/me`,
        { credentials: 'include', signal: controller.signal });
      if (!response.ok) { setState(response.status === 401 ? 'unauthorized' : 'unavailable'); return; }
      if ((await response.json() as { role: string }).role !== 'admin') { setState('unauthorized'); return; }
      await reload(controller.signal); setState('ready');
    }
    load().catch((error: unknown) => {
      if (error instanceof Error && error.name !== 'AbortError') setState('unavailable');
    });
    return () => controller.abort();
  }, []);
  async function mutate(path: string, body: unknown, success: string, key?: string) {
    if (!apiOrigin || busy) return false;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}${path}`, { method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
        body: JSON.stringify(body) });
      if (response.status === 401 || response.status === 403) { setState('unauthorized'); return false; }
      if (!response.ok) {
        setMessage(response.status === 409 ? '한도·중지 상태가 바뀌었습니다. 목록을 확인해 주세요' :
          '저장하지 못했습니다. 입력값과 목록을 확인해 주세요');
        await reload().catch(() => {}); return false;
      }
      await reload(); setMessage(success); return true;
    } catch { setMessage('결과를 확인하지 못했습니다. 목록을 먼저 확인해 주세요'); return false; }
    finally { setBusy(false); }
  }
  return <main id="main-content" tabIndex={-1} className="shell account-shell">
    <a className="text-link" href="/account">내 계정으로</a>
    <h1>프로모션 관리</h1>
    {state === 'loading' ? <p role="status">운영자 권한 확인 중</p> : null}
    {state === 'unauthorized' ? <p role="alert">운영자 로그인 후 이용할 수 있습니다</p> : null}
    {state === 'unavailable' ? <p role="alert">프로모션 정보를 불러올 수 없습니다</p> : null}
    {state === 'ready' ? <><AdminPromotionsView campaigns={campaigns} busy={busy}
      onCreate={(input) => { void mutate('/promotions/admin/campaigns', input, '프로모션을 등록했습니다'); }}
      onVersion={(id, input) => { void mutate(`/promotions/admin/campaigns/${encodeURIComponent(id)}/versions`,
        input, '새 버전을 저장했습니다'); }}
      onStop={(id, reason) => { void mutate(`/promotions/admin/campaigns/${encodeURIComponent(id)}/stop`,
        { reason }, '프로모션을 중지했습니다'); }}
      onGrant={(id, accountId, reason) => {
        const identity = `${id}|${accountId}|${reason}`;
        const key = grantKeys.current.get(identity) ?? crypto.randomUUID();
        grantKeys.current.set(identity, key);
        void mutate(`/promotions/admin/campaigns/${encodeURIComponent(id)}/grants`,
          { accountId, reason }, '고객에게 쿠폰을 발행했습니다', key).then((saved) => {
          if (saved) grantKeys.current.delete(identity);
        });
      }} />{message ? <p role="status">{message}</p> : null}</> : null}
  </main>;
}
