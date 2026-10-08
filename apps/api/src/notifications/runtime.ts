import type { Pool } from 'pg';
import { resolveMockNotificationMode,runMockNotificationOnce } from './mock.js';

type MockEnv = Parameters<typeof resolveMockNotificationMode>[0];

/** Development-only simulation: no provider, recipient lookup, or network send. */
export async function processMockNotificationTick(pool: Pick<Pool,'connect'>,
  now: Date,env: MockEnv): Promise<{ processed:boolean }> {
  if (resolveMockNotificationMode(env) === 'disabled') return { processed:false };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await runMockNotificationOnce(client,now,env);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

/** Explicitly opt in on a loopback development API only; never implies delivery. */
export function startMockNotificationLoop(pool: Pick<Pool,'connect'>,env: MockEnv) {
  if (resolveMockNotificationMode(env) === 'disabled') return () => {};
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void processMockNotificationTick(pool,new Date(),env)
      .catch(() => { console.error('Mock notification worker failed'); })
      .finally(() => { running = false; });
  },2000);
  timer.unref();
  return () => clearInterval(timer);
}
