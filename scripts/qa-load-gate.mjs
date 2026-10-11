import { assertPaymentBootConfig } from '../apps/api/src/payments/adapter.ts';

// Run this preflight before starting any QA load client or HTTP listener.
// It does not open a socket, read a database, or print environment values.
assertPaymentBootConfig(process.env);
if (process.env.QA_LOAD_MODE !== '1')
  throw new Error('QA load mode unavailable');

process.stdout.write('QA load gate passed\n');
