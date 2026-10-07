import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { planNotificationRetry } from './retry.js';

export type NotificationClaim = {
  jobId: string;
  attemptId: string;
  attemptNo: number;
  accountId: string;
  sourceEventId: string;
  kind: string;
  channel: 'email' | 'sms' | 'push';
  restockSubscriptionId: string | null;
  leaseToken: string;
};

/** Claim and attempt creation are one atomic statement, even in auto-commit mode. */
export async function claimNextNotificationJob(client: PoolClient,
  now: Date): Promise<NotificationClaim | null> {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new Error('Invalid notification claim time');
  const leaseToken = randomUUID();
  const leaseUntil = new Date(now.getTime()+60_000);
  const result = await client.query<Omit<NotificationClaim,'leaseToken'>>(`
    WITH due AS (
      SELECT id FROM notification_jobs
      WHERE status='QUEUED' AND available_at <= $1
      ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1
    ), claimed AS (
      UPDATE notification_jobs j SET status='PROCESSING',available_at=NULL,
        lease_token=$2,lease_until=$3,updated_at=$1
      FROM due WHERE j.id=due.id
      RETURNING j.id,j.account_id,j.source_event_id,j.kind,j.channel,
        j.restock_subscription_id,j.attempts_completed
    ), attempt AS (
      INSERT INTO notification_attempts(job_id,attempt_no)
      SELECT id,attempts_completed+1 FROM claimed
      RETURNING id,job_id,attempt_no
    )
    SELECT claimed.id AS "jobId",attempt.id AS "attemptId",
      attempt.attempt_no AS "attemptNo",claimed.account_id AS "accountId",
      claimed.source_event_id AS "sourceEventId",claimed.kind,claimed.channel,
      claimed.restock_subscription_id AS "restockSubscriptionId"
    FROM claimed JOIN attempt ON attempt.job_id=claimed.id`,
  [now,leaseToken,leaseUntil]);
  return result.rows[0] ? { ...result.rows[0],leaseToken } : null;
}

type CompletionClaim = Pick<NotificationClaim,'jobId' | 'attemptId' | 'attemptNo' | 'leaseToken'>;
type DeliveryOutcome = { kind:'success' } | {
  kind:'transient_failure' | 'permanent_failure'; errorCode:string;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeCode = /^[A-Z0-9_]{1,80}$/;

/** A stale lease cannot close another worker's attempt; this is one atomic statement. */
export async function completeNotificationJob(client: PoolClient,claim: CompletionClaim,
  outcome: DeliveryOutcome,at: Date): Promise<boolean> {
  if (!claim || !uuid.test(claim.jobId) || !uuid.test(claim.attemptId) ||
      !uuid.test(claim.leaseToken) || !Number.isInteger(claim.attemptNo) ||
      claim.attemptNo < 1 || claim.attemptNo > 3 || !(at instanceof Date) ||
      !Number.isFinite(at.getTime())) throw new Error('Invalid notification completion');
  if (!outcome || !['success','transient_failure','permanent_failure'].includes(outcome.kind) ||
      (outcome.kind === 'success' ? 'errorCode' in outcome :
        !safeCode.test(outcome.errorCode))) throw new Error('Invalid notification outcome');
  const success = outcome.kind === 'success';
  const retry = success ? null : planNotificationRetry({ attemptsCompleted:claim.attemptNo,
    retryable:outcome.kind === 'transient_failure',failedAt:at });
  const status = success ? 'SENT' : retry?.status === 'retry' ? 'QUEUED' : 'FAILED';
  const attemptStatus = success ? 'SUCCEEDED' : outcome.kind === 'transient_failure'
    ? 'TRANSIENT_FAILURE' : 'PERMANENT_FAILURE';
  const result = await client.query<{ id:string }>(`
    WITH owned AS (
      SELECT j.id FROM notification_jobs j
      JOIN notification_attempts a ON a.job_id=j.id
      WHERE j.id=$1 AND a.id=$2 AND a.attempt_no=$3 AND a.status='STARTED'
        AND j.status='PROCESSING' AND j.lease_token=$4
      FOR UPDATE OF j,a
    ), closed AS (
      UPDATE notification_attempts a SET status=$6,error_code=$7,finished_at=$5
      FROM owned WHERE a.id=$2 AND a.job_id=owned.id
      RETURNING a.job_id
    ), finished AS (
      UPDATE notification_jobs j SET status=$8,attempts_completed=$3,
        available_at=$9,lease_token=NULL,lease_until=NULL,delivered_at=$10,updated_at=$5
      FROM closed WHERE j.id=closed.job_id
      RETURNING j.id,j.kind,j.restock_subscription_id
    ), notified AS (
      UPDATE restock_subscriptions s SET status='notified'
      FROM finished WHERE finished.kind='restock_available' AND $8='SENT'
        AND s.id=finished.restock_subscription_id AND s.status='active'
      RETURNING s.id
    )
    SELECT id FROM finished`,
  [claim.jobId,claim.attemptId,claim.attemptNo,claim.leaseToken,at,
    attemptStatus,success ? null : outcome.errorCode,status,
    retry?.status === 'retry' ? retry.nextAttemptAt : null,success ? at : null]);
  return result.rows.length === 1;
}
