import type { Pool } from 'pg';
import { CheckoutReservations } from './reservation-service.js';

/** Run by one external schedule; concurrent invocations remain safe via account/product locks. */
export async function expireReservationBatch(pool: Pool, limit = 100): Promise<number> {
  return new CheckoutReservations(pool).expireDue(limit);
}
