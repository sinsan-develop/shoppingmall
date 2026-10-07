import type { PoolClient } from 'pg';
import { resolveNotificationChannels } from './channel-source.js';
import { notificationIntentForEvent } from './intent.js';
import { enqueueNotificationJobs,planNotificationJobs } from './jobs.js';

/** The source event's caller owns the transaction, so rollback also removes its jobs. */
export async function queueNotificationEvent(client: PoolClient,event: unknown,
  registeredDevice = false): Promise<string[]> {
  const intent = notificationIntentForEvent(event);
  if (!intent) return [];
  const channels = await resolveNotificationChannels(client,intent.accountId,registeredDevice);
  return enqueueNotificationJobs(client,planNotificationJobs(intent,channels));
}
