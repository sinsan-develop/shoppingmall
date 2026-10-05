type FulfillmentStatus = 'PAYMENT_PENDING' | 'READY' | 'PACKING' | 'DELAYED' | 'SHIPPED' | 'CANCELLED';
type CarrierCode = 'cj_logistics' | 'korea_post' | 'hanjin' | 'lotte' | 'other';

const carrierUrls: Record<CarrierCode, string | null> = {
  cj_logistics: 'https://www.cjlogistics.com/ko/tool/parcel/tracking',
  korea_post: 'https://www.koreapost.go.kr/kpost/subIndex/138.do',
  hanjin: 'https://hanjin.com/kor/CMS/DeliveryMgr/WaybillSch.do?mCode=MN038',
  lotte: 'https://lotteglogis.com/home/reservation/tracking/index',
  other: null,
};

function record(value: unknown, allowed: readonly string[], error: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(error);
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number, error: string): string {
  if (typeof value !== 'string') throw new Error(error);
  const trimmed = value.trim();
  if (trimmed.length < 1 || Array.from(trimmed).length > max) throw new Error(error);
  return trimmed;
}

function date(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(error);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(error);
  return value;
}

function carrier(value: unknown, error: string): CarrierCode {
  if (typeof value !== 'string' || !Object.hasOwn(carrierUrls, value)) throw new Error(error);
  return value as CarrierCode;
}

function shipmentFields(input: Record<string, unknown>, error: string) {
  const carrierCode = carrier(input.carrierCode, error);
  const carrierName = carrierCode === 'other' ? text(input.carrierName, 50, error) : null;
  if (carrierCode !== 'other' && input.carrierName != null) throw new Error(error);
  return { carrierCode, carrierName, trackingNumber: normalizeTrackingNumber(input.trackingNumber) };
}

function absent(input: Record<string, unknown>, keys: readonly string[], error: string): void {
  if (keys.some((key) => input[key] !== undefined)) throw new Error(error);
}

export function normalizeTrackingNumber(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid fulfillment shipment');
  const normalized = value.trim().replaceAll('-', '');
  if (!/^[A-Za-z0-9]{1,50}$/.test(normalized)) throw new Error('Invalid fulfillment shipment');
  return normalized;
}

export function getCarrierTrackingUrl(code: unknown): string | null {
  return carrierUrls[carrier(code, 'Invalid fulfillment carrier')];
}

/** A provisional calendar date in Seoul; weekends and holidays are not accounted for. */
export function calculateExpectedShipDate(paymentApprovedAt: unknown, cutoffTime: unknown): string {
  if (typeof paymentApprovedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(paymentApprovedAt)) {
    throw new Error('Invalid fulfillment payment time');
  }
  const datePart = paymentApprovedAt.slice(0, 10);
  date(datePart, 'Invalid fulfillment payment time');
  const hour = Number(paymentApprovedAt.slice(11, 13));
  const minute = Number(paymentApprovedAt.slice(14, 16));
  const second = Number(paymentApprovedAt.slice(17, 19));
  const offset = paymentApprovedAt.match(/[+-](\d{2}):(\d{2})$/);
  if (hour > 23 || minute > 59 || second > 59 ||
      (offset && (Number(offset[1]) > 23 || Number(offset[2]) > 59))) {
    throw new Error('Invalid fulfillment payment time');
  }
  const instant = new Date(paymentApprovedAt);
  if (!Number.isFinite(instant.getTime())) throw new Error('Invalid fulfillment payment time');
  if (cutoffTime !== null && (typeof cutoffTime !== 'string' ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(cutoffTime))) throw new Error('Invalid fulfillment cutoff');

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  const seoulDate = `${part('year')}-${part('month')}-${part('day')}`;
  const seoulTime = `${part('hour')}:${part('minute')}`;
  if (cutoffTime === null || seoulTime < cutoffTime) return seoulDate;
  return new Date(Date.parse(`${seoulDate}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
}

const sellerFields = [
  'currentStatus', 'targetStatus', 'currentExpectedShipDate', 'currentSeoulDate',
  'expectedShipDate', 'reason', 'customerMessage', 'carrierCode', 'carrierName', 'trackingNumber',
] as const;

export function validateSellerTransition(value: unknown) {
  const error = 'Invalid fulfillment transition';
  const input = record(value, sellerFields, error);
  const edges: Record<string, readonly string[]> = {
    READY: ['PACKING', 'DELAYED'], PACKING: ['SHIPPED', 'DELAYED'], DELAYED: ['PACKING'],
  };
  if (typeof input.currentStatus !== 'string' || typeof input.targetStatus !== 'string' ||
      !edges[input.currentStatus]?.includes(input.targetStatus)) throw new Error(error);
  const currentExpectedShipDate = date(input.currentExpectedShipDate, error);
  const currentSeoulDate = date(input.currentSeoulDate, error);

  if (input.targetStatus === 'DELAYED') {
    const delayError = 'Invalid fulfillment delay';
    absent(input, ['carrierCode', 'carrierName', 'trackingNumber'], delayError);
    const expectedShipDate = date(input.expectedShipDate, delayError);
    if (expectedShipDate <= currentExpectedShipDate || expectedShipDate < currentSeoulDate) throw new Error(delayError);
    return {
      status: 'DELAYED' as const, expectedShipDate,
      delayedReason: text(input.reason, 500, delayError),
      customerMessage: text(input.customerMessage, 500, delayError),
      carrierCode: null, carrierName: null, trackingNumber: null,
    };
  }
  if (input.targetStatus === 'SHIPPED') {
    const shipmentError = 'Invalid fulfillment shipment';
    absent(input, ['expectedShipDate', 'reason', 'customerMessage'], shipmentError);
    return {
      status: 'SHIPPED' as const, expectedShipDate: currentExpectedShipDate,
      delayedReason: null, customerMessage: null,
      ...shipmentFields(input, shipmentError),
    };
  }
  absent(input, ['expectedShipDate', 'reason', 'customerMessage', 'carrierCode', 'carrierName', 'trackingNumber'], error);
  return {
    status: 'PACKING' as const, expectedShipDate: currentExpectedShipDate,
    delayedReason: null, customerMessage: null,
    carrierCode: null, carrierName: null, trackingNumber: null,
  };
}

const stateFields = ['status', 'expectedShipDate', 'carrierCode', 'carrierName', 'trackingNumber'] as const;
const correctionFields = ['current', 'corrected', 'reason', 'customerMessage'] as const;

export function validateAdminCorrection(value: unknown) {
  const error = 'Invalid fulfillment correction';
  const input = record(value, correctionFields, error);
  const current = record(input.current, stateFields, error);
  const corrected = record(input.corrected, stateFields, error);
  if (Object.keys(corrected).length === 0 ||
      !['READY', 'PACKING', 'DELAYED', 'SHIPPED'].includes(current.status as string)) throw new Error(error);
  const status = Object.hasOwn(corrected, 'status') ? corrected.status : current.status;
  if (!['READY', 'PACKING', 'DELAYED', 'SHIPPED'].includes(status as string)) throw new Error(error);
  const merged = { ...current, ...corrected };
  const expectedShipDate = date(merged.expectedShipDate, error);
  const reason = text(input.reason, 500, error);
  const customerMessage = text(input.customerMessage, 500, error);
  let carrierCode: CarrierCode | null = null;
  let carrierName: string | null = null;
  let trackingNumber: string | null = null;
  if (status === 'SHIPPED') {
    try {
      ({ carrierCode, carrierName, trackingNumber } = shipmentFields(merged, error));
    } catch {
      throw new Error(error);
    }
  } else if (merged.carrierCode != null || merged.carrierName != null || merged.trackingNumber != null) {
    throw new Error(error);
  }
  return { status: status as Exclude<FulfillmentStatus, 'PAYMENT_PENDING' | 'CANCELLED'>,
    expectedShipDate, carrierCode, carrierName, trackingNumber, reason, customerMessage };
}
