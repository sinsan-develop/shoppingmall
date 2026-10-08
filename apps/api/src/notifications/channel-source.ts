import type { PoolClient } from 'pg';
import { planNotificationChannels,type NotificationChannelPlan } from './channels.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read only eligibility facts; contact identifiers are never loaded into the queue. */
export async function resolveNotificationChannels(client: PoolClient,accountId: string,
  registeredDevice: boolean): Promise<NotificationChannelPlan> {
  if (!uuid.test(accountId) || typeof registeredDevice !== 'boolean')
    throw new Error('Invalid notification account');
  const result = await client.query<{ verifiedEmail:boolean;verifiedPhone:boolean;
    pushConsent:boolean }>(`
    SELECT EXISTS(SELECT 1 FROM account_identities i
        WHERE i.account_id=a.id AND i.kind='email' AND i.verified_at IS NOT NULL)
        AS "verifiedEmail",
      EXISTS(SELECT 1 FROM account_identities i
        WHERE i.account_id=a.id AND i.kind='phone' AND i.verified_at IS NOT NULL)
        AS "verifiedPhone",
      coalesce((SELECT p.push FROM notification_preferences p
        WHERE p.account_id=a.id),false) AS "pushConsent"
    FROM accounts a WHERE a.id=$1`,[accountId]);
  const row = result.rows[0];
  if (!row) throw new Error('Notification account unavailable');
  return planNotificationChannels({ ...row,registeredDevice });
}
