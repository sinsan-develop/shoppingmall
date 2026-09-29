import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';

test('shipping policy keeps one global default and separate seller approval records', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const global = await pool.query('SELECT fee_won,free_threshold_won,cutoff_time,blocked_postal_ranges,locked_fee,locked_threshold,locked_cutoff FROM shipping_policy_global WHERE id=1');
    assert.deepEqual(global.rows, [{ fee_won: 3000, free_threshold_won: 50000, cutoff_time: null,
      blocked_postal_ranges: [], locked_fee: false, locked_threshold: false, locked_cutoff: false }]);
    for (const name of ['seller_shipping_policies', 'seller_shipping_policy_requests']) {
      assert.equal((await pool.query('SELECT to_regclass($1) AS target', [`public.${name}`])).rows[0].target, name);
    }
  } finally { await pool.end(); }
});
