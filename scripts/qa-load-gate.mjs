import { assertPaymentBootConfig } from '../apps/api/src/payments/adapter.ts';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run this preflight before starting any QA load client or HTTP listener.
// It does not open a socket, read a database, or print environment values.
export function assertQaLoadGate(env) {
  assertPaymentBootConfig(env);
  if (env.QA_LOAD_MODE !== '1') throw new Error('QA load mode unavailable');

  const qaDb = 'shoppingmall_qa_20261010_2';
  let dbUrl;
  try { dbUrl = new URL(env.DATABASE_URL ?? ''); }
  catch { throw new Error('QA load database unavailable'); }
  if (env.PGDATABASE !== qaDb ||
      !['postgres:', 'postgresql:'].includes(dbUrl.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]', 'local-postgres'].includes(dbUrl.hostname) ||
      dbUrl.pathname !== `/${qaDb}`)
    throw new Error('QA load database unavailable');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertQaLoadGate(process.env);
  process.stdout.write('QA load gate passed\n');
}
