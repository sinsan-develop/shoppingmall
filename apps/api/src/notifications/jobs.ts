import type { PoolClient } from 'pg';
import type { NotificationChannelPlan } from './channels.js';
import type { NotificationIntent } from './intent.js';

export type NotificationJobDraft = NotificationIntent & {
  channel: 'email' | 'sms' | 'push';
};

/** A restock request is consumed by one route; order notices may add opted-in push. */
export function planNotificationJobs(intent: NotificationIntent | null,
  candidate: NotificationChannelPlan): NotificationJobDraft[] {
  if (intent === null) return [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) ||
      ![null,'email','sms'].includes(candidate.primary) ||
      typeof candidate.push !== 'boolean') throw new Error('Invalid notification job channels');
  const channels: NotificationJobDraft['channel'][] = [];
  if (candidate.primary) channels.push(candidate.primary);
  if (candidate.push && (intent.kind !== 'restock_available' || channels.length === 0))
    channels.push('push');
  return channels.map((channel) => ({ ...intent,channel,
    dedupeKey:`${intent.dedupeKey}:${channel}` }));
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kinds = ['order_submitted','payment_approved','payment_declined',
  'shipment_updated','restock_available'];

/** The caller owns BEGIN/COMMIT so an event and its jobs are atomic. */
export async function enqueueNotificationJobs(client: PoolClient,
  drafts: NotificationJobDraft[]): Promise<string[]> {
  if (!Array.isArray(drafts) || drafts.some((draft) => !draft ||
      !uuid.test(draft.accountId) || !uuid.test(draft.sourceEventId) ||
      !kinds.includes(draft.kind) || !['email','sms','push'].includes(draft.channel) ||
      typeof draft.dedupeKey !== 'string' || draft.dedupeKey.length < 1 ||
      draft.dedupeKey.length > 250 || /[\s@]/.test(draft.dedupeKey) ||
      (draft.kind === 'restock_available') !==
        (typeof draft.subscriptionId === 'string' && uuid.test(draft.subscriptionId))))
    throw new Error('Invalid notification job');
  const inserted: string[] = [];
  for (const draft of drafts) {
    const result = await client.query<{ id:string }>(
      `INSERT INTO notification_jobs
        (account_id,kind,source_event_id,restock_subscription_id,channel,dedupe_key)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
      [draft.accountId,draft.kind,draft.sourceEventId,draft.subscriptionId ?? null,
        draft.channel,draft.dedupeKey]);
    if (result.rows[0]) inserted.push(result.rows[0].id);
  }
  return inserted;
}
