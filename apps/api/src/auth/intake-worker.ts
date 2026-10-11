import type { Pool } from 'pg';
import { claimAuthIntakeJob, expireAuthIntakeJobs, finishAuthIntakeJob,
  retryAuthIntakeJob } from './intake.js';
import { getQaAuthSink, type MockAuthSink } from './delivery.js';
import { processCustomerSignupIntake } from './onboarding.js';
import { processPasswordResetIntake } from './password-recovery.js';

export async function processAuthIntakeOnce(pool: Pool, now: Date,
  mockSink: MockAuthSink | undefined = getQaAuthSink()): Promise<{ processed: boolean }> {
  await expireAuthIntakeJobs(pool, now);
  const job = await claimAuthIntakeJob(pool, now);
  if (!job) return { processed: false };
  try {
    const issued = await pool.query(`SELECT 1 FROM auth_action_tokens
      WHERE intake_job_id=$1 AND revoked_at IS NULL LIMIT 1`, [job.id]);
    if (!issued.rowCount) {
      if (job.purpose === 'customer_signup') {
        await processCustomerSignupIntake(pool, job.email, job.source_hash, now, mockSink, job.id);
      } else {
        await processPasswordResetIntake(pool, job.email, job.source_hash, now, mockSink, job.id);
      }
    }
    await finishAuthIntakeJob(pool, job, now);
  } catch {
    await retryAuthIntakeJob(pool, job, now);
  }
  return { processed: true };
}

export function startAuthIntakeLoop(pool: Pool): () => void {
  if (process.env.AUTH_DELIVERY_MODE !== 'mock' || process.env.APP_ENV !== 'development' ||
      !['127.0.0.1', '::1', 'localhost'].includes(process.env.API_HOST ?? '')) return () => {};
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void processAuthIntakeOnce(pool, new Date()).catch(() => {
      console.error('Auth intake worker failed');
    }).finally(() => { running = false; });
  }, 1000);
  timer.unref();
  return () => clearInterval(timer);
}
