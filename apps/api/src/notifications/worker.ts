import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

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
