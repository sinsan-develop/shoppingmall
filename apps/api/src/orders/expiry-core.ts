import type { Pool, PoolClient } from 'pg';
import { PromotionUsageService } from '../promotions/usage-service.js';

/** Caller owns account lock, transaction, and the reservation's stock-hold termination. */
export async function expirePendingOrderInTransaction(pool: Pool, client: PoolClient,
  accountId: string, reservationId: string, terminateReservation: () => Promise<void>): Promise<boolean> {
  const found = await client.query<{ id: string; due: boolean }>(`SELECT id,
    expires_at<=clock_timestamp() AS due FROM checkout_orders
    WHERE account_id=$1 AND reservation_id=$2 AND status='PENDING_PAYMENT' FOR UPDATE`,
  [accountId, reservationId]);
  const order = found.rows[0];
  if (!order || !order.due) return false;
  const uses = await client.query<{ id: string }>(`SELECT id FROM promotion_uses
    WHERE reservation_id=$1 AND status='HELD' ORDER BY id FOR UPDATE`, [reservationId]);
  await new PromotionUsageService(pool).releaseInTransaction(client,
    uses.rows.map((row) => row.id), 'Pending order expired');
  await terminateReservation();
  await client.query(`UPDATE checkout_orders SET status='EXPIRED',ended_at=clock_timestamp()
    WHERE id=$1 AND status='PENDING_PAYMENT'`, [order.id]);
  await client.query(`UPDATE shipment_orders SET status='EXPIRED'
    WHERE checkout_order_id=$1 AND status='PENDING_PAYMENT'`, [order.id]);
  await client.query(`INSERT INTO order_status_events
    (checkout_order_id,status,actor_account_id,reason)
    VALUES ($1,'EXPIRED',NULL,'Payment window expired')`, [order.id]);
  return true;
}
