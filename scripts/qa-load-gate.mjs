import { assertPaymentBootConfig } from '../apps/api/src/payments/adapter.ts';

// Run this preflight before starting any QA load client or HTTP listener.
// It does not open a socket, read a database, or print environment values.
assertPaymentBootConfig(process.env);
if (process.env.QA_LOAD_MODE !== '1')
  throw new Error('QA load mode unavailable');

const qaDb = 'shoppingmall_qa_20261010_2';
let dbUrl;
try { dbUrl = new URL(process.env.DATABASE_URL ?? ''); }
catch { throw new Error('QA load database unavailable'); }
if (process.env.PGDATABASE !== qaDb ||
    !['postgres:', 'postgresql:'].includes(dbUrl.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]', 'local-postgres'].includes(dbUrl.hostname) ||
    dbUrl.pathname !== `/${qaDb}`)
  throw new Error('QA load database unavailable');

process.stdout.write('QA load gate passed\n');
