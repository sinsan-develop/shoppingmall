import type { Pool } from 'pg';
import { CheckoutReservations } from '../checkout/reservation-service.js';
import { expirePendingOrderInTransaction } from './expiry-core.js';

/** End only unpaid, due checkout orders; every order is a separate atomic transaction. */
export async function expirePendingOrders(pool: Pool, limit: number): Promise<number> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
    throw new Error('Invalid expiry limit');
  const due = await pool.query<{ id: string; accountId: string; reservationId: string }>(
    `SELECT id,account_id AS "accountId",reservation_id AS "reservationId"
     FROM checkout_orders WHERE status='PENDING_PAYMENT' AND expires_at<=clock_timestamp()
     ORDER BY expires_at,id LIMIT $1`, [limit]);
  let expired = 0;
  for (const row of due.rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const account = await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',
        [row.accountId]);
      if (!account.rowCount) throw new Error('Order account unavailable');
      const changed = await expirePendingOrderInTransaction(pool, client,
        row.accountId, row.reservationId,
        () => new CheckoutReservations(pool).expireInTransaction(client, row.accountId, row.reservationId));
      await client.query('COMMIT');
      if (changed) expired += 1;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  return expired;
}
