import { createApp } from './app.js';
import { assertPaymentBootConfig } from './payments/adapter.js';

assertPaymentBootConfig(process.env);
const app = await createApp();
const port = Number(process.env.API_PORT ?? 9092);
const host = process.env.API_HOST ?? '127.0.0.1';
await app.listen(port, host);
