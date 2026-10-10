import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { provisionInitialAdmin } from '../src/auth/onboarding.js';
import type { MockAuthSink } from '../src/auth/delivery.js';

type InitialAdminEnvironment = Record<string, string | undefined>;

export async function runInitialAdminCli(pool: Pool, args: string[], env: InitialAdminEnvironment,
  mockSink?: MockAuthSink): Promise<{ status: 'pending' }> {
  if (args.length !== 1 || args[0] !== '--owner-confirmed' || !env.INITIAL_ADMIN_OPERATOR?.trim()) {
    throw new Error('Explicit operator and owner confirmation required');
  }
  const email = env.INITIAL_ADMIN_EMAIL ?? env.EMAIL_TO;
  if (!email || (env.INITIAL_ADMIN_EMAIL && env.EMAIL_TO &&
      env.INITIAL_ADMIN_EMAIL.trim().toLowerCase() !== env.EMAIL_TO.trim().toLowerCase())) {
    throw new Error('Initial admin email unavailable');
  }
  // Until a separately approved real provider exists, only the private QA IPC sink can deliver.
  if (!mockSink || env.AUTH_DELIVERY_MODE !== 'mock' || env.APP_ENV !== 'development' ||
      !['127.0.0.1', '::1', 'localhost'].includes(env.API_HOST ?? '')) {
    throw new Error('Initial admin delivery unavailable');
  }
  if (env.PGDATABASE !== 'shoppingmall_auth_admin_1010' ||
      !/^\d+$/.test(env.AUTH_ADMIN_TEST_DB_SYSTEM_ID ?? '') || !env.DATABASE_URL) {
    throw new Error('Isolated admin QA database required');
  }
  const identity = await pool.query('SELECT current_database() AS db, system_identifier::text AS id FROM pg_control_system()');
  if (identity.rows[0]?.db !== env.PGDATABASE || identity.rows[0]?.id !== env.AUTH_ADMIN_TEST_DB_SYSTEM_ID) {
    throw new Error('Isolated admin QA database mismatch');
  }
  return provisionInitialAdmin(pool, { email, ownerConfirmed: true,
    operatorId: env.INITIAL_ADMIN_OPERATOR,
    source: `operator:${env.INITIAL_ADMIN_OPERATOR}`, now: new Date(), mockSink });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('Explicit DATABASE_URL required');
  const sink: MockAuthSink | undefined = process.send
    ? (message) => new Promise<void>((resolve, reject) => {
      process.send?.({ type: 'auth-qa-link', message }, (error) => error ? reject(error) : resolve());
    })
    : undefined;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
  try {
    await runInitialAdminCli(pool, process.argv.slice(2), process.env, sink);
    console.info('Initial admin setup pending delivery confirmation');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Initial admin setup unavailable';
    console.error(message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
