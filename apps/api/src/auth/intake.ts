import { createHmac } from 'node:crypto';
import type { Pool } from 'pg';
import { requireAuthDelivery, type MockAuthSink } from './delivery.js';

export type IntakePurpose = 'customer_signup' | 'password_reset';
export type IntakeJob = { id: string; purpose: IntakePurpose; email: string;
  source_hash: string; attempts: number; lease_until: Date };

function normalizedEmail(value: string): string {
  if (typeof value !== 'string') throw new Error('Invalid email');
  const email = value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) throw new Error('Invalid email');
  return email;
}

function auditHash(value: string): string {
  const key = process.env.AUTH_AUDIT_HMAC_KEY;
  if (!key || key.length < 32) throw new Error('Auth audit key unavailable');
  return createHmac('sha256', key).update(value).digest('hex');
}

export async function enqueueAuthIntake(pool: Pool, purpose: IntakePurpose,
  emailInput: string, source: string, now: Date, mockSink?: MockAuthSink): Promise<{ status: 'accepted' }> {
  const email = normalizedEmail(emailInput);
  requireAuthDelivery(purpose, mockSink);
  if (!source || Number.isNaN(now.getTime())) throw new Error('Invalid auth intake request');
  const subjectHash = auditHash(`email:${email}`);
  const sourceHash = auditHash(`source:${source}`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',
      [`intake:${purpose}`, sourceHash]);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',
      [`intake:${purpose}`, subjectHash]);
    const counts = await client.query(`SELECT
      (SELECT count(*)::int FROM auth_security_events WHERE purpose=$1 AND subject_hash=$2
        AND result_code='intake_accepted' AND occurred_at >= $4::timestamptz - interval '1 hour') AS subject_count,
      (SELECT count(*)::int FROM auth_security_events WHERE purpose=$1 AND source_hash=$3
        AND result_code='intake_accepted' AND occurred_at >= $4::timestamptz - interval '1 hour') AS source_count`,
    [purpose, subjectHash, sourceHash, now]);
    if (counts.rows[0].subject_count < 10 && counts.rows[0].source_count < 30) {
      await client.query(`INSERT INTO auth_intake_jobs (purpose,email,source_hash,created_at,available_at,expires_at)
        VALUES ($1,$2,$3,$4,$4,$5)`, [purpose, email, sourceHash, now,
        new Date(now.getTime() + 30 * 60 * 1000)]);
      await client.query(`INSERT INTO auth_security_events
        (purpose,result_code,subject_hash,source_hash,occurred_at)
        VALUES ($1,'intake_accepted',$2,$3,$4)`, [purpose, subjectHash, sourceHash, now]);
    }
    await client.query('COMMIT');
    return { status: 'accepted' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function claimAuthIntakeJob(pool: Pool, now: Date): Promise<IntakeJob | undefined> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<IntakeJob>(`WITH picked AS (
      SELECT id FROM auth_intake_jobs
      WHERE ((status='pending' AND available_at<=$1)
        OR (status='processing' AND lease_until<=$1))
        AND expires_at>$1 AND attempts<5
      ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED
    ) UPDATE auth_intake_jobs j SET status='processing',attempts=j.attempts+1,
      lease_until=$2,updated_at=$1
      FROM picked WHERE j.id=picked.id
      RETURNING j.id,j.purpose,j.email,j.source_hash,j.attempts,j.lease_until`,
    [now, new Date(now.getTime() + 2 * 60 * 1000)]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function finishAuthIntakeJob(pool: Pool, job: IntakeJob, now: Date): Promise<void> {
  const result = await pool.query(`UPDATE auth_intake_jobs SET status='done',completed_at=$3,
    lease_until=NULL,updated_at=$3,last_error_code=NULL
    WHERE id=$1 AND status='processing' AND lease_until=$2`, [job.id, job.lease_until, now]);
  if (result.rowCount !== 1) throw new Error('Auth intake lease lost');
}

export async function retryAuthIntakeJob(pool: Pool, job: IntakeJob, now: Date): Promise<void> {
  const exhausted = job.attempts >= 5;
  const result = await pool.query(`UPDATE auth_intake_jobs SET status=$3,
    available_at=$4,lease_until=NULL,updated_at=$5,
    completed_at=CASE WHEN $3='dead' THEN $5 ELSE NULL END,
    last_error_code='processing_failed'
    WHERE id=$1 AND status='processing' AND lease_until=$2`,
  [job.id, job.lease_until, exhausted ? 'dead' : 'pending',
    new Date(now.getTime() + Math.min(job.attempts * 10, 60) * 1000), now]);
  if (result.rowCount !== 1) throw new Error('Auth intake lease lost');
}

export async function expireAuthIntakeJobs(pool: Pool, now: Date): Promise<void> {
  await pool.query(`UPDATE auth_intake_jobs SET status='dead',completed_at=$1,
    updated_at=$1,lease_until=NULL,last_error_code='expired'
    WHERE status IN ('pending','processing') AND expires_at<=$1`, [now]);
}
