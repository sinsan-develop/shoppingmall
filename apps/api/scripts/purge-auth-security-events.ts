import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';

export async function purgeAuthSecurityEvents(pool: Pool, now: Date): Promise<{ tokens: number; events: number }> {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('Invalid purge time');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tokens = await client.query(`DELETE FROM auth_action_tokens
      WHERE expires_at < $1::timestamptz - interval '24 hours'
        OR consumed_at < $1::timestamptz - interval '24 hours'`, [now]);
    const events = await client.query(`DELETE FROM auth_security_events
      WHERE occurred_at < $1::timestamptz - interval '30 days'`, [now]);
    await client.query('COMMIT');
    return { tokens: tokens.rowCount ?? 0, events: events.rowCount ?? 0 };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const counts = await purgeAuthSecurityEvents(pool, new Date());
    process.stdout.write(`Purged auth tokens ${counts.tokens}, security events ${counts.events}\n`);
  } finally {
    await pool.end();
  }
}
