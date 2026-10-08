import { createApp } from './app.js';
import { assertPaymentBootConfig } from './payments/adapter.js';
import { DatabaseService } from './db/service.js';
import { resolveMockNotificationMode } from './notifications/mock.js';
import { startMockNotificationLoop } from './notifications/runtime.js';

assertPaymentBootConfig(process.env);
const notificationMode = resolveMockNotificationMode(process.env);
const app = await createApp();
const notificationPool = notificationMode === 'mock' ? app.get(DatabaseService).getPool() : undefined;
if (notificationMode === 'mock' && !notificationPool)
  throw new Error('Mock notification database unavailable');
const port = Number(process.env.API_PORT ?? 9092);
const host = process.env.API_HOST ?? '127.0.0.1';
await app.listen(port, host);
if (notificationPool) startMockNotificationLoop(notificationPool,process.env);
