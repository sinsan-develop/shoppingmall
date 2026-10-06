import { carrierTrackingUrl } from '../fulfillment-ui';

type CustomerFulfillment = {
  status: string;
  expectedShipDate: string | null;
  delayedReason: string | null;
  customerMessage: string | null;
  carrier: { code: string; displayName: string } | null;
  trackingNumber: string | null;
  packedAt: string | null;
  shippedAt: string | null;
  updatedAt: string;
  events: {
    action: string;
    status: string;
    expectedShipDate: string | null;
    customerMessage: string | null;
    occurredAt: string;
  }[];
};

export type CustomerShipmentWithFulfillment = {
  id: string;
  status?: string;
  fulfillment?: CustomerFulfillment | null;
};

export function CustomerOrderFulfillmentView({ shipment }: {
  shipment: CustomerShipmentWithFulfillment;
}) {
  const fulfillment = shipment.fulfillment;
  if (!fulfillment) {
    return <section className="account-card profile-card fulfillment-customer-card">
      <h3>배송 진행</h3>
      <p>결제 확인 후 출고 정보가 표시됩니다</p>
    </section>;
  }
  const trackingUrl = carrierTrackingUrl(fulfillment.carrier?.code);
  return <section className="account-card profile-card fulfillment-customer-card"
    aria-labelledby={`fulfillment-${shipment.id}`}>
    <h3 id={`fulfillment-${shipment.id}`}>배송 진행</h3>
    <p><strong>{fulfillment.status}</strong></p>
    {fulfillment.expectedShipDate ? <p>잠정 예상일 {fulfillment.expectedShipDate}
      <span className="section-note"> · 휴무일 미반영</span></p> : null}
    {fulfillment.delayedReason ? <p>지연 사유: {fulfillment.delayedReason}</p> : null}
    {fulfillment.customerMessage ? <p>고객 안내: {fulfillment.customerMessage}</p> : null}
    {fulfillment.carrier ? <p>택배사: {fulfillment.carrier.displayName}</p> : null}
    {fulfillment.trackingNumber ? <p>운송장: <strong>{fulfillment.trackingNumber}</strong></p> : null}
    {trackingUrl ? <p><a className="secondary-button fulfillment-tracking-link" href={trackingUrl}
      target="_blank" rel="noopener noreferrer">공식 배송조회 페이지</a>
      <span className="section-note"> 운송장 직접 입력</span></p> : null}
    {fulfillment.events.length > 0 ? <div>
      <h4>배송 안내 이력</h4>
      <ol className="fulfillment-event-list">{fulfillment.events.map((event, index) =>
        <li key={`${event.occurredAt}-${event.action}-${index}`}>
          <strong>{event.action}</strong> · {event.status}
          {event.expectedShipDate ? ` · ${event.expectedShipDate}` : ''}
          {event.customerMessage ? <p>{event.customerMessage}</p> : null}
        </li>)}</ol>
    </div> : null}
  </section>;
}
