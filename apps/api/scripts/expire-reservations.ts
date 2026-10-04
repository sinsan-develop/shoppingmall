import { Pool } from 'pg';
import { expireReservationBatch } from '../src/checkout/reservation-cleanup.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL required');
const limit = process.argv[2] === undefined ? 100 : Number(process.argv[2]);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid expiry limit');
const pool = new Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 1000 });
try {
  const expired = await expireReservationBatch(pool, limit);
  process.stdout.write(`${expired}\n`);
} finally {
  await pool.end();
}
