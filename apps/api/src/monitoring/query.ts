const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const orderStatuses = ['PENDING_PAYMENT', 'EXPIRED', 'PAID'] as const;
const claimStatuses = ['REQUESTED', 'SELLER_REPLIED', 'APPROVED', 'REJECTED',
  'REFUND_PROCESSING', 'REFUNDED', 'REVIEW_REQUIRED'] as const;

export type MonitoringFilter = {
  from: string;
  to: string;
  start: Date;
  endExclusive: Date;
  sellerId: string | null;
  orderStatus: typeof orderStatuses[number] | null;
  claimStatus: typeof claimStatuses[number] | null;
};

function day(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error('Invalid monitoring query');
  const [year, month, date] = value.split('-').map(Number);
  if (new Date(Date.UTC(year, month - 1, date)).toISOString().slice(0, 10) !== value)
    throw new Error('Invalid monitoring query');
  return value;
}

function optional<T extends string>(value: unknown, allowed?: readonly T[]): T | null {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || (allowed && !allowed.includes(value as T)))
    throw new Error('Invalid monitoring query');
  return value as T;
}

export function parseMonitoringQuery(query: Record<string, unknown>): MonitoringFilter {
  if (Object.keys(query).some((key) => !['from', 'to', 'sellerId', 'orderStatus', 'claimStatus'].includes(key)))
    throw new Error('Invalid monitoring query');
  const from = day(query.from);
  const to = day(query.to);
  if (from > to) throw new Error('Invalid monitoring query');
  const sellerId = optional(query.sellerId);
  if (sellerId && !uuid.test(sellerId)) throw new Error('Invalid monitoring query');
  const orderStatus = optional(query.orderStatus, orderStatuses);
  const claimStatus = optional(query.claimStatus, claimStatuses);
  const [fromYear, fromMonth, fromDate] = from.split('-').map(Number);
  const [toYear, toMonth, toDate] = to.split('-').map(Number);
  return {
    from, to,
    start: new Date(Date.UTC(fromYear, fromMonth - 1, fromDate, -9)),
    endExclusive: new Date(Date.UTC(toYear, toMonth - 1, toDate + 1, -9)),
    sellerId, orderStatus, claimStatus,
  };
}
