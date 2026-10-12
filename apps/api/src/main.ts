import { createApp } from './app.js';
import { assertPaymentBootConfig } from './payments/adapter.js';
import { DatabaseService } from './db/service.js';
import { resolveMockNotificationMode } from './notifications/mock.js';
import { startMockNotificationLoop } from './notifications/runtime.js';
import { startAuthIntakeLoop } from './auth/intake-worker.js';
import { assertAuthDeliveryBootConfig } from './auth/delivery.js';

assertPaymentBootConfig(process.env);
assertAuthDeliveryBootConfig(process.env);
const notificationMode = resolveMockNotificationMode(process.env);
const app = await createApp();
if (process.env.QA_LOAD_MODE === '1') {
  const pool = app.get(DatabaseService).getPool();
  try {
    if (!pool) throw new Error('QA load database unavailable');
    const result = await pool.query<{ database: string; system_id: string }>(
      `SELECT current_database() AS database,
        system_identifier::text AS system_id FROM pg_control_system()`,
    );
    if (result.rows[0]?.database !== 'shoppingmall_qa_20261010_2' ||
        result.rows[0].system_id !== process.env.QA_LOAD_DB_SYSTEM_ID)
      throw new Error('QA load database identity mismatch');
  } catch {
    await app.close();
    throw new Error('QA load database attestation failed');
  }
}
const notificationPool = notificationMode === 'mock' ? app.get(DatabaseService).getPool() : undefined;
if (notificationMode === 'mock' && !notificationPool)
  throw new Error('Mock notification database unavailable');
const port = Number(process.env.API_PORT ?? 9092);
const host = process.env.API_HOST ?? '127.0.0.1';
await app.listen(port, host);
if (notificationPool) startMockNotificationLoop(notificationPool,process.env);
if (process.env.AUTH_DELIVERY_MODE === 'mock' || process.env.AUTH_DELIVERY_MODE === 'smtp') {
  const authPool = app.get(DatabaseService).getPool();
  if (authPool) startAuthIntakeLoop(authPool);
}
