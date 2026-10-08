const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const transactionalKinds = [
  'order_submitted','payment_approved','payment_declined','shipment_updated',
] as const;

type TransactionalKind = typeof transactionalKinds[number];
type NotificationKind = TransactionalKind | 'restock_available';
type SubscriptionStatus = 'active' | 'cancelled' | 'notified';

export type NotificationEventInput = {
  kind: NotificationKind;
  sourceEventId: string;
  accountId: string;
  subscriptionId?: string;
  subscriptionStatus?: SubscriptionStatus;
  becameSellable?: boolean;
};

export type NotificationIntent = {
  kind: NotificationKind;
  sourceEventId: string;
  accountId: string;
  subscriptionId?: string;
  purpose: 'transactional' | 'requested_restock';
  dedupeKey: string;
};

/** Only normalized event identities enter the durable queue; no contact data is included. */
export function notificationIntentForEvent(candidate: unknown): NotificationIntent | null {
  const event = candidate as Partial<NotificationEventInput> | null;
  if (!event || typeof event !== 'object' || Array.isArray(event) ||
      typeof event.kind !== 'string' || typeof event.sourceEventId !== 'string' ||
      typeof event.accountId !== 'string' || !uuid.test(event.sourceEventId) ||
      !uuid.test(event.accountId)) throw new Error('Invalid notification event');
  const sourceEventId = event.sourceEventId.toLowerCase();
  const accountId = event.accountId.toLowerCase();
  if (transactionalKinds.some((kind) => kind === event.kind)) {
    const kind = event.kind as TransactionalKind;
    return { kind,sourceEventId,accountId,purpose:'transactional',
      dedupeKey:`${kind}:${sourceEventId}:${accountId}` };
  }
  if (event.kind !== 'restock_available' || typeof event.subscriptionId !== 'string' ||
      !uuid.test(event.subscriptionId) ||
      !['active','cancelled','notified'].includes(event.subscriptionStatus ?? '') ||
      typeof event.becameSellable !== 'boolean') throw new Error('Invalid notification event');
  if (event.subscriptionStatus !== 'active' || !event.becameSellable) return null;
  return { kind:'restock_available',sourceEventId,accountId,
    subscriptionId:event.subscriptionId.toLowerCase(),purpose:'requested_restock',
    dedupeKey:`restock_available:${sourceEventId}:${event.subscriptionId.toLowerCase()}:${accountId}` };
}
