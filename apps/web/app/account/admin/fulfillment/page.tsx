'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  appendUniqueFulfillments, createFulfillmentRequestCoordinator, fulfillmentFailureMessage,
  fulfillmentSaveDisposition, shouldReleaseFulfillmentKey,
} from '../../fulfillment-ui';

type FulfillmentStatus = 'READY' | 'PACKING' | 'DELAYED' | 'SHIPPED' | 'CANCELLED';
type CarrierCode = 'cj_logistics' | 'korea_post' | 'hanjin' | 'lotte' | 'other';
type Setting = { owoolSellerId: string | null; owoolSellerDisplayName?: string | null;
  version: number; updatedAt?: string };
type AdminItem = {
  shipmentOrderId: string; status: FulfillmentStatus; version: number; paidAt: string;
  expectedShipDate: string; recipientName: string; phone: string;
  fulfillmentSeller: { id: string; displayName: string };
  categories: ({ id: string; name: string } | string)[];
  carrierCode: CarrierCode | null; carrierName: string | null; trackingNumber: string | null;
};
type AdminEvent = {
  action: string; fromStatus?: string; toStatus?: string; status?: string;
  reason: string | null; customerMessage: string | null;
  before: Record<string, unknown>; after: Record<string, unknown>; occurredAt: string;
};
type AdminDetail = AdminItem & {
  customerMessage: string | null;
  address: { recipientName?: string; phone?: string; postalCode: string; line1: string; line2: string | null };
  lines: { optionId?: string; productName: string; optionName: string; quantity: number;
    category?: { id: string; name: string } }[];
  events: AdminEvent[];
};
type Filters = { status: string; sellerId: string; from: string; to: string };
type Correction = {
  expectedVersion: number;
  corrected: { status: string; expectedShipDate: string; carrierCode?: CarrierCode | null;
    carrierName?: string | null; trackingNumber?: string | null };
  reason: string; customerMessage: string;
};
type AdminViewProps = {
  setting: Setting; items: AdminItem[]; selected: AdminDetail | null;
  statusFilter: string; sellerFilter: string; fromFilter?: string; toFilter?: string;
  nextCursor?: string | null; busy: boolean; error: string; message: string;
  onSaveSetting: (sellerId: string, reason: string) => void;
  onFilter: (filters: Filters) => void; onSelect: (id: string) => void;
  onLoadMore?: () => void; onCorrect: (correction: Correction) => void;
};

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:9092');
const statuses: FulfillmentStatus[] = ['READY', 'PACKING', 'DELAYED', 'SHIPPED', 'CANCELLED'];

function categoryName(category: { id: string; name: string } | string) {
  return typeof category === 'string' ? category : category.name;
}

function snapshot(snapshot: Record<string, unknown>) {
  return Object.entries(snapshot).map(([key, value]) => `${key}: ${String(value ?? '-')}`).join(' · ');
}

export function buildAdminCorrection(input: {
  status: string; expectedShipDate: string; carrierCode?: CarrierCode | null;
  carrierName?: string | null; trackingNumber?: string | null;
}): Correction['corrected'] {
  if (input.status !== 'SHIPPED') return {
    status: input.status, expectedShipDate: input.expectedShipDate,
    carrierCode: null, carrierName: null, trackingNumber: null,
  };
  return {
    status: input.status, expectedShipDate: input.expectedShipDate,
    carrierCode: input.carrierCode, carrierName: input.carrierName,
    trackingNumber: input.trackingNumber,
  };
}

export function AdminFulfillmentView({ setting, items, selected, statusFilter, sellerFilter,
  fromFilter = '', toFilter = '', nextCursor, busy, error, message, onSaveSetting, onFilter,
  onSelect, onLoadMore, onCorrect }: AdminViewProps) {
  function saveSetting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSaveSetting(String(data.get('owoolSellerId') ?? '').trim(),
      String(data.get('settingReason') ?? '').trim());
  }
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onFilter({ status: String(data.get('statusFilter') ?? ''),
      sellerId: String(data.get('sellerFilter') ?? '').trim(),
      from: String(data.get('fromFilter') ?? ''), to: String(data.get('toFilter') ?? '') });
  }
  function correct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const status = String(data.get('correctedStatus') ?? selected.status);
    const carrierCode = String(data.get('carrierCode') ?? '') as CarrierCode;
    const corrected = buildAdminCorrection({ status,
      expectedShipDate: String(data.get('expectedShipDate') ?? selected.expectedShipDate),
      carrierCode, carrierName: carrierCode === 'other'
        ? String(data.get('carrierName') ?? '').trim() : null,
      trackingNumber: String(data.get('trackingNumber') ?? '').trim() });
    onCorrect({ expectedVersion: selected.version, corrected,
      reason: String(data.get('correctionReason') ?? '').trim(),
      customerMessage: String(data.get('customerMessage') ?? '').trim() });
  }

  return <div className="fulfillment-layout admin-fulfillment-layout">
    <section className="account-card fulfillment-setting-card">
      <h2>출고 운영 관리</h2>
      <form className="account-form" onSubmit={saveSetting}>
        <label htmlFor="owool-seller-id">공동출고 담당 판매자</label>
        <input key={`${setting.version}:${setting.owoolSellerId ?? ''}`}
          id="owool-seller-id" name="owoolSellerId" defaultValue={setting.owoolSellerId ?? ''}
          placeholder="판매자 UUID" required />
        <p>현재 판매자 {setting.owoolSellerDisplayName ?? '미지정'}</p>
        <p>설정 버전 {setting.version}</p>
        {setting.updatedAt ? <p>최종 변경일 {setting.updatedAt.slice(0, 10)}</p> : null}
        <label htmlFor="setting-reason">변경 사유</label>
        <textarea id="setting-reason" name="settingReason" rows={3} maxLength={500} required />
        <button type="submit" className="primary-button" disabled={busy}>담당 판매자 저장</button>
      </form>
    </section>
    <section className="account-card fulfillment-filter-card">
      <h2>발송 주문 조회</h2>
      <form className="fulfillment-filter-form" onSubmit={filter}>
        <label htmlFor="admin-status-filter">상태</label>
        <select id="admin-status-filter" name="statusFilter" defaultValue={statusFilter}>
          <option value="">전체</option>{statuses.map((status) =>
            <option key={status} value={status}>{status}</option>)}</select>
        <label htmlFor="admin-seller-filter">담당 판매자</label>
        <input id="admin-seller-filter" name="sellerFilter" defaultValue={sellerFilter}
          placeholder="판매자 UUID" />
        <label htmlFor="admin-from-filter">결제 시작일</label>
        <input id="admin-from-filter" name="fromFilter" type="date" defaultValue={fromFilter} />
        <label htmlFor="admin-to-filter">결제 종료일</label>
        <input id="admin-to-filter" name="toFilter" type="date" defaultValue={toFilter} />
        <button type="submit" className="primary-button" disabled={busy}>조회</button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {busy ? <p role="status">저장 중</p> : null}
    </section>
    <section className="account-card fulfillment-list-card" aria-labelledby="admin-orders-heading">
      <h2 id="admin-orders-heading">전체 발송 주문</h2>
      {items.length === 0 ? <p>조건에 맞는 발송 주문이 없습니다</p> : <ul className="fulfillment-list">
        {items.map((item) => <li key={item.shipmentOrderId}>
          <button type="button" className="fulfillment-list-button" disabled={busy}
            aria-pressed={selected?.shipmentOrderId === item.shipmentOrderId}
            onClick={() => onSelect(item.shipmentOrderId)}>
            <strong>{item.status}</strong><span>{item.fulfillmentSeller.displayName}</span>
            <span>{item.recipientName} · {item.phone}</span>
            <span>{item.categories.map(categoryName).join(', ')}</span>
          </button>
        </li>)}</ul>}
      {nextCursor && onLoadMore ? <button type="button" className="secondary-button"
        disabled={busy} onClick={onLoadMore}>더보기</button> : null}
    </section>
    <section className="account-card fulfillment-detail-card" aria-labelledby="admin-detail-heading">
      <h2 id="admin-detail-heading">발송 상세·정정</h2>
      {!selected ? <p>확인할 발송 주문을 선택해 주세요</p> : <div
        key={`${selected.shipmentOrderId}-${selected.version}`}>
        <p><strong>{selected.status}</strong> · 담당 판매자 {selected.fulfillmentSeller.displayName}</p>
        <p>잠정 예상일 {selected.expectedShipDate} · 휴무일 미반영</p>
        <ul className="fulfillment-lines">{selected.lines.map((line, index) => <li
          key={line.optionId ?? `${line.productName}-${index}`}>
          <strong>{line.productName}</strong> · {line.optionName} · {line.quantity}개
        </li>)}</ul>
        <form className="account-form fulfillment-correction-form" onSubmit={correct}>
          <label htmlFor="corrected-status">정정 상태</label>
          <select id="corrected-status" name="correctedStatus" defaultValue={selected.status}>
            {statuses.filter((status) => status !== 'CANCELLED').map((status) =>
              <option key={status} value={status}>{status}</option>)}</select>
          <label htmlFor="admin-expected-date">잠정 예상일</label>
          <input id="admin-expected-date" name="expectedShipDate" type="date"
            defaultValue={selected.expectedShipDate} required />
          <label htmlFor="admin-carrier">택배사</label>
          <select id="admin-carrier" name="carrierCode" defaultValue={selected.carrierCode ?? 'cj_logistics'}>
            <option value="cj_logistics">CJ대한통운</option><option value="korea_post">우체국택배</option>
            <option value="hanjin">한진택배</option><option value="lotte">롯데택배</option>
            <option value="other">기타</option>
          </select>
          <label htmlFor="admin-carrier-name">기타 택배사명</label>
          <input id="admin-carrier-name" name="carrierName" maxLength={50}
            defaultValue={selected.carrierName ?? ''} />
          <label htmlFor="admin-tracking">운송장</label>
          <input id="admin-tracking" name="trackingNumber" maxLength={50} pattern="[A-Za-z0-9-]+"
            defaultValue={selected.trackingNumber ?? ''} />
          <label htmlFor="correction-reason">정정 사유</label>
          <textarea id="correction-reason" name="correctionReason" rows={3} maxLength={500} required />
          <label htmlFor="admin-customer-message">고객 안내</label>
          <textarea id="admin-customer-message" name="customerMessage" rows={3} maxLength={500} required />
          <button type="submit" className="primary-button" disabled={busy}>정정 저장</button>
        </form>
        <h3>사건 이력</h3>
        {selected.events.length === 0 ? <p>기록된 사건이 없습니다</p> :
          <ol className="fulfillment-event-list">{selected.events.map((event, index) => <li
            key={`${event.occurredAt}-${event.action}-${index}`}>
            <strong>{event.action}</strong> · {event.fromStatus ?? '-'} → {event.toStatus ?? event.status ?? '-'}
            {event.reason ? <p>정정 사유: {event.reason}</p> : null}
            {event.customerMessage ? <p>고객 안내: {event.customerMessage}</p> : null}
            <p>변경 전 {snapshot(event.before)}</p><p>변경 후 {snapshot(event.after)}</p>
          </li>)}</ol>}
      </div>}
    </section>
  </div>;
}

export default function AdminFulfillmentPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'unavailable'>('loading');
  const [setting, setSetting] = useState<Setting>({ owoolSellerId: null, version: 0 });
  const [items, setItems] = useState<AdminItem[]>([]);
  const [selected, setSelected] = useState<AdminDetail | null>(null);
  const [filters, setFilters] = useState<Filters>({ status: '', sellerId: '', from: '', to: '' });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const keys = useRef(new Map<string, string>());
  const requests = useRef<ReturnType<typeof createFulfillmentRequestCoordinator> | null>(null);
  if (requests.current === null) requests.current = createFulfillmentRequestCoordinator(setBusy);

  function roleFailure(response: Response) {
    if (response.status === 401 || response.status === 403) { setState('unauthorized'); return true; }
    return false;
  }
  async function loadSetting(signal?: AbortSignal) {
    if (!apiOrigin) throw new Error('API unavailable');
    const request = requests.current!.begin('setting');
    try {
      const response = await fetch(`${apiOrigin}/fulfillment/admin/settings`,
        { credentials: 'include', cache: 'no-store', signal });
      if (!requests.current!.isLatest('setting', request)) return false;
      if (roleFailure(response)) return false;
      if (!response.ok) throw new Error('Setting unavailable');
      const next = await response.json() as Setting;
      if (!requests.current!.isLatest('setting', request)) return false;
      setSetting(next); return true;
    } catch (error) {
      if (!requests.current!.isLatest('setting', request)) return false;
      throw error;
    } finally { requests.current!.finish(); }
  }
  async function loadList(next: Filters = filters, signal?: AbortSignal, cursor?: string,
    failureMessage?: string) {
    if (!apiOrigin) throw new Error('API unavailable');
    const request = requests.current!.begin('list');
    try {
      const query = new URLSearchParams({ limit: '50' });
      if (next.status) query.set('status', next.status);
      if (next.sellerId) query.set('sellerId', next.sellerId);
      if (next.from) query.set('from', next.from);
      if (next.to) query.set('to', next.to);
      if (cursor) query.set('cursor', cursor);
      const response = await fetch(`${apiOrigin}/fulfillment/admin/shipments?${query}`,
        { credentials: 'include', cache: 'no-store', signal });
      if (!requests.current!.isLatest('list', request)) return false;
      if (roleFailure(response)) return false;
      if (!response.ok) throw new Error('List unavailable');
      const result = await response.json() as { items: AdminItem[]; nextCursor: string | null };
      if (!requests.current!.isLatest('list', request)) return false;
      setItems((current) => cursor ? appendUniqueFulfillments(current, result.items) : result.items);
      setNextCursor(result.nextCursor); return true;
    } catch (error) {
      if (!requests.current!.isLatest('list', request)) return false;
      if (error instanceof Error && error.name === 'AbortError') throw error;
      if (failureMessage) { setError(failureMessage); return false; }
      throw error;
    } finally { requests.current!.finish(); }
  }
  async function loadDetail(id: string, signal?: AbortSignal, failureMessage?: string) {
    if (!apiOrigin) throw new Error('API unavailable');
    const request = requests.current!.begin('detail');
    try {
      const response = await fetch(`${apiOrigin}/fulfillment/admin/shipments/${encodeURIComponent(id)}`,
        { credentials: 'include', cache: 'no-store', signal });
      if (!requests.current!.isLatest('detail', request)) return false;
      if (roleFailure(response)) return false;
      if (!response.ok) throw new Error('Detail unavailable');
      const detail = await response.json() as AdminDetail;
      if (!requests.current!.isLatest('detail', request)) return false;
      setSelected(detail); return true;
    } catch (error) {
      if (!requests.current!.isLatest('detail', request)) return false;
      if (error instanceof Error && error.name === 'AbortError') throw error;
      if (failureMessage) { setError(failureMessage); return false; }
      throw error;
    } finally { requests.current!.finish(); }
  }

  useEffect(() => {
    if (!apiOrigin) { setState('unavailable'); return; }
    const controller = new AbortController();
    async function load() {
      const response = await fetch(`${apiOrigin}/auth/me`,
        { credentials: 'include', cache: 'no-store', signal: controller.signal });
      if (!response.ok) { setState(response.status === 401 ? 'unauthorized' : 'unavailable'); return; }
      if ((await response.json() as { role: string }).role !== 'admin') { setState('unauthorized'); return; }
      const loaded = await Promise.all([loadSetting(controller.signal),
        loadList({ status: '', sellerId: '', from: '', to: '' }, controller.signal)]);
      if (loaded.every(Boolean)) setState('ready');
    }
    load().catch((caught: unknown) => {
      if (caught instanceof Error && caught.name !== 'AbortError') setState('unavailable');
    });
    return () => controller.abort();
  }, []);

  async function write(url: string, method: 'PUT' | 'POST', body: object,
    identity: string, reload: () => Promise<boolean>, success: string, invalidates: string[]) {
    if (!apiOrigin || busy) return;
    const key = keys.current.get(identity) ?? crypto.randomUUID();
    keys.current.set(identity, key);
    for (const lane of invalidates) requests.current!.invalidate(lane);
    const request = requests.current!.begin('mutation');
    setError(''); setMessage('');
    try {
      const response = await fetch(`${apiOrigin}${url}`, { method, credentials: 'include',
        headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) });
      const disposition = fulfillmentSaveDisposition(response.status);
      if (!requests.current!.isLatest('mutation', request)) return;
      if (disposition === 'unauthorized') {
        if (shouldReleaseFulfillmentKey(disposition, false, response.status)) keys.current.delete(identity);
        setState('unauthorized'); return;
      }
      if (disposition === 'reload') {
        const reloaded = await reload();
        if (!requests.current!.isLatest('mutation', request)) return;
        if (shouldReleaseFulfillmentKey(disposition, reloaded)) keys.current.delete(identity);
        if (!reloaded) throw new Error('Authoritative reload unavailable');
        setMessage(response.status === 409 ? '다른 처리로 상태가 변경되어 최신 정보를 다시 불러왔습니다' : success);
        return;
      }
      if (shouldReleaseFulfillmentKey(disposition, false, response.status)) keys.current.delete(identity);
      setError(fulfillmentFailureMessage(response.status));
    } catch {
      if (requests.current!.isLatest('mutation', request)) setError(fulfillmentFailureMessage());
    } finally { requests.current!.finish(); }
  }

  return <main id="main-content" tabIndex={-1} className="shell account-shell">
    <a className="text-link" href="/account">내 계정으로</a><h1>출고 운영 관리</h1>
    {state === 'loading' ? <p role="status">운영자 권한 확인 중</p> : null}
    {state === 'unauthorized' ? <p role="alert">운영자 로그인 후 이용할 수 있습니다</p> : null}
    {state === 'unavailable' ? <p role="alert">출고 운영 정보를 불러올 수 없습니다</p> : null}
    {state === 'ready' ? <AdminFulfillmentView setting={setting} items={items} selected={selected}
      statusFilter={filters.status} sellerFilter={filters.sellerId} fromFilter={filters.from}
      toFilter={filters.to} nextCursor={nextCursor} busy={busy} error={error} message={message}
      onSaveSetting={(sellerId, reason) => {
        const body = { owoolSellerId: sellerId, expectedVersion: setting.version, reason };
        void write('/fulfillment/admin/settings', 'PUT', body, `setting|${JSON.stringify(body)}`,
          () => loadSetting(), '공동출고 담당 판매자 설정을 저장했습니다', ['setting']);
      }} onFilter={(next) => { setFilters(next); setItems([]); setNextCursor(null);
        requests.current!.invalidate('detail'); setSelected(null); setError('');
        void loadList(next, undefined, undefined, '발송 주문 목록을 불러오지 못했습니다'); }}
      onLoadMore={() => { if (!nextCursor) return; setError('');
        void loadList(filters, undefined, nextCursor,
          '발송 주문 목록을 더 불러오지 못했습니다'); }}
      onSelect={(id) => { setError('');
        void loadDetail(id, undefined, '발송 주문 상세를 불러오지 못했습니다'); }}
      onCorrect={(body) => { if (!selected) return; const id = selected.shipmentOrderId;
        void write(`/fulfillment/admin/shipments/${encodeURIComponent(id)}/corrections`, 'POST', body,
          `correction|${id}|${JSON.stringify(body)}`,
          () => Promise.all([loadDetail(id), loadList(filters)]).then((results) => results.every(Boolean)),
          '출고 정정을 저장하고 최신 정보를 반영했습니다', ['list', 'detail']);
      }} /> : null}
  </main>;
}
