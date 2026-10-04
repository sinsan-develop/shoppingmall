import { Pool } from 'pg';
import { expirePendingOrders } from '../src/orders/expiry.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL required');
const limit = process.argv[2] === undefined ? 100 : Number(process.argv[2]);
const pool = new Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 1000 });
try {
  const count = await expirePendingOrders(pool, limit);
  process.stdout.write(`${count}\n`);
} finally { await pool.end(); }
