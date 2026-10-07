import type { PoolClient } from 'pg';
import { claimNextNotificationJob,completeNotificationJob,
  recoverExpiredNotificationJob } from './worker.js';

type MockEnv = { APP_ENV?:string;NODE_ENV?:string;API_HOST?:string;
  NOTIFICATION_MODE?:string };
type MockOutcome = 'success' | 'transient_failure' | 'permanent_failure';

/** Never use mock success to imply that an SMS, email or push reached a person. */
export function resolveMockNotificationMode(env: MockEnv): 'disabled' | 'mock' {
  const mode = env.NOTIFICATION_MODE ?? 'disabled';
  if (mode === 'disabled') return 'disabled';
  if (mode === 'mock' && env.APP_ENV === 'development' && env.NODE_ENV !== 'production' &&
      ['127.0.0.1','::1','localhost'].includes(env.API_HOST ?? '127.0.0.1')) return 'mock';
  throw new Error('Notification mode unavailable');
}

/** Explicit QA invocation only; caller owns one transaction across claim and completion.
 * No provider call, contact lookup or automatic scheduler. */
export async function runMockNotificationOnce(client: PoolClient,now: Date,
  env: MockEnv,outcome: MockOutcome = 'success'): Promise<{ processed:boolean }> {
  if (resolveMockNotificationMode(env) === 'disabled') return { processed:false };
  if (!['success','transient_failure','permanent_failure'].includes(outcome))
    throw new Error('Invalid mock notification outcome');
  await recoverExpiredNotificationJob(client,now);
  const claim = await claimNextNotificationJob(client,now);
  if (!claim) return { processed:false };
  let selected = outcome;
  let restockFailureCode: string | null = null;
  if (claim.kind === 'restock_available') {
    // Take the product decision lock in its own statement. A combined eligibility
    // SELECT can keep a snapshot taken before waiting for a concurrent stock edit.
    await client.query(
      `SELECT p.id FROM restock_subscriptions s JOIN products p ON p.id=s.product_id
       WHERE s.id=$1 AND s.account_id=$2 FOR SHARE OF p`,
      [claim.restockSubscriptionId,claim.accountId]);
    const current = await client.query<{ status:string; available:boolean }>(
      `SELECT s.status,EXISTS (
         SELECT 1 FROM product_publications pub
         JOIN product_revisions r ON r.id=pub.revision_id AND r.status='approved'
         JOIN product_options o ON o.revision_id=r.id AND o.name=s.option_name
         JOIN inventory_levels i ON i.option_id=o.id AND i.sellable_quantity>0
         WHERE pub.product_id=s.product_id AND NOT EXISTS
           (SELECT 1 FROM product_sale_stop_requests stop
            WHERE stop.product_id=s.product_id AND stop.status='approved')
       ) AS available
       FROM restock_subscriptions s
       WHERE s.id=$1 AND s.account_id=$2 FOR SHARE OF s`,
      [claim.restockSubscriptionId,claim.accountId]);
    if (current.rows[0]?.status !== 'active') restockFailureCode = 'SUBSCRIPTION_INACTIVE';
    else if (!current.rows[0].available) restockFailureCode = 'RESTOCK_UNAVAILABLE';
    if (restockFailureCode) selected = 'permanent_failure';
  }
  const result = selected === 'success' ? { kind:'success' as const } : {
    kind:selected,
    errorCode:selected === 'transient_failure' ? 'MOCK_TRANSIENT' :
      restockFailureCode ?? 'MOCK_PERMANENT',
  };
  return { processed:await completeNotificationJob(client,claim,result,now) };
}
