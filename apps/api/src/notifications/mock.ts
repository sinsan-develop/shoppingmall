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

/** Explicit QA invocation only: no provider call, contact lookup or automatic scheduler. */
export async function runMockNotificationOnce(client: PoolClient,now: Date,
  env: MockEnv,outcome: MockOutcome = 'success'): Promise<{ processed:boolean }> {
  if (resolveMockNotificationMode(env) === 'disabled') return { processed:false };
  if (!['success','transient_failure','permanent_failure'].includes(outcome))
    throw new Error('Invalid mock notification outcome');
  await recoverExpiredNotificationJob(client,now);
  const claim = await claimNextNotificationJob(client,now);
  if (!claim) return { processed:false };
  let selected = outcome;
  if (claim.kind === 'restock_available') {
    const active = await client.query<{ status:string }>(
      `SELECT status FROM restock_subscriptions WHERE id=$1 AND account_id=$2`,
      [claim.restockSubscriptionId,claim.accountId]);
    if (active.rows[0]?.status !== 'active') selected = 'permanent_failure';
  }
  const result = selected === 'success' ? { kind:'success' as const } : {
    kind:selected,
    errorCode:selected === 'transient_failure' ? 'MOCK_TRANSIENT' :
      claim.kind === 'restock_available' && outcome !== 'permanent_failure'
        ? 'SUBSCRIPTION_INACTIVE' : 'MOCK_PERMANENT',
  };
  return { processed:await completeNotificationJob(client,claim,result,now) };
}
