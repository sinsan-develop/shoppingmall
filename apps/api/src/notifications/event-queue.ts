import type { PoolClient } from 'pg';
import { resolveNotificationChannels } from './channel-source.js';
import { notificationIntentForEvent } from './intent.js';
import { enqueueNotificationJobs,planNotificationJobs } from './jobs.js';
import type { NotificationIntent } from './intent.js';

export async function isNotificationSourceValid(client: PoolClient,intent:
  Pick<NotificationIntent,'kind' | 'sourceEventId' | 'accountId' | 'subscriptionId'>):
  Promise<boolean> {
  const statements: Record<NotificationIntent['kind'],string> = {
    order_submitted: `SELECT EXISTS(SELECT 1 FROM order_status_events e
      JOIN checkout_orders o ON o.id=e.checkout_order_id
      WHERE e.id=$1 AND o.account_id=$2 AND e.actor_account_id=$2
        AND e.status='PENDING_PAYMENT') AS "validSource"`,
    payment_approved: `SELECT EXISTS(SELECT 1 FROM payment_events e
      JOIN checkout_orders o ON o.id=e.verified_order_id
      WHERE e.id=$1 AND o.account_id=$2 AND e.outcome='APPROVED') AS "validSource"`,
    payment_declined: `SELECT EXISTS(SELECT 1 FROM payment_events e
      JOIN checkout_orders o ON o.id=e.verified_order_id
      WHERE e.id=$1 AND o.account_id=$2 AND e.outcome='DECLINED') AS "validSource"`,
    shipment_updated: `SELECT EXISTS(SELECT 1 FROM shipment_fulfillment_events e
      JOIN shipment_orders s ON s.id=e.shipment_order_id
      JOIN checkout_orders o ON o.id=s.checkout_order_id
      WHERE e.id=$1 AND o.account_id=$2) AS "validSource"`,
    restock_available: `SELECT EXISTS(SELECT 1 FROM stock_change_requests change
      JOIN product_options option ON option.id=change.option_id
      JOIN product_revisions revision ON revision.id=option.revision_id
      JOIN restock_subscriptions subscription ON subscription.product_id=revision.product_id
        AND subscription.option_name=option.name
      WHERE change.id=$1 AND subscription.account_id=$2
        AND subscription.id=$3 AND change.status='approved') AS "validSource"`,
  };
  const statement = statements[intent.kind];
  if (!statement) return false;
  const result = await client.query<{ validSource:boolean }>(statement,
    intent.kind === 'restock_available'
      ? [intent.sourceEventId,intent.accountId,intent.subscriptionId]
      : [intent.sourceEventId,intent.accountId]);
  return result.rows[0]?.validSource === true;
}

/** The source event's caller owns the transaction, so rollback also removes its jobs. */
export async function queueNotificationEvent(client: PoolClient,event: unknown,
  registeredDevice = false): Promise<string[]> {
  const intent = notificationIntentForEvent(event);
  if (!intent) return [];
  if (!await isNotificationSourceValid(client,intent))
    throw new Error('Notification source unavailable');
  const channels = await resolveNotificationChannels(client,intent.accountId,registeredDevice);
  return enqueueNotificationJobs(client,planNotificationJobs(intent,channels));
}
