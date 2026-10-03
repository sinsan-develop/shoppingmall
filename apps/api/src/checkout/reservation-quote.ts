import type { Pool, PoolClient } from 'pg';
import { ShippingPolicies } from '../shipping/service.js';
import type { ShippingPolicy } from '../shipping/policy.js';
import { groupShipmentLines, quoteShipments, type ShipmentLine, type ShipmentQuote } from './shipment-quote.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Preview for the holder's own stock, using current prices and approved shipping policy. */
export async function quoteReservation(pool: Pool, accountId: string, id: string): Promise<ShipmentQuote> {
  if (!uuid.test(accountId) || !uuid.test(id)) throw new Error('Invalid reservation request');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const quote = await quoteReservationInTransaction(pool, client, accountId, id);
    await client.query('COMMIT');
    return quote;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

/** Use the reservation transaction's connection so quote failures also roll back a new hold. */
export async function quoteReservationInTransaction(pool: Pool, client: PoolClient,
  accountId: string, id: string): Promise<ShipmentQuote> {
  if (!uuid.test(accountId) || !uuid.test(id)) throw new Error('Invalid reservation request');
  const account = await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [accountId]);
  if (account.rowCount !== 1) throw new Error('Reservation unavailable');
  const hold = await client.query<{ valid: boolean }>(
    `SELECT status='ACTIVE' AND expires_at>clock_timestamp() AS valid
     FROM checkout_reservations WHERE id=$1 AND account_id=$2`, [id, accountId]);
  if (!hold.rows[0]?.valid) throw new Error('Reservation unavailable');
  const result = await client.query<ShipmentLine & { published: boolean; onHand: number }>(
    `SELECT o.id AS "optionId",p.seller_id AS "sellerId",r.shipping_mode AS "shippingMode",
      l.quantity,o.price_won AS "unitPriceWon",coalesce(i.on_hand_quantity,0)::int AS "onHand",
      (pub.revision_id=r.id AND r.status='approved' AND stop.id IS NULL) AS published
     FROM checkout_reservation_lines l JOIN product_options o ON o.id=l.option_id
     JOIN product_revisions r ON r.id=o.revision_id JOIN products p ON p.id=r.product_id
     LEFT JOIN product_publications pub ON pub.product_id=p.id
     LEFT JOIN inventory_levels i ON i.option_id=o.id
     LEFT JOIN product_sale_stop_requests stop ON stop.product_id=p.id AND stop.status='approved'
     WHERE l.reservation_id=$1 ORDER BY o.id`, [id]);
  if (!result.rowCount || result.rows.some((line) => !line.published || line.onHand < line.quantity)) {
    throw new Error('Reserved product changed');
  }
  const lines = result.rows.map(({ optionId, sellerId, shippingMode, quantity, unitPriceWon }) =>
    ({ optionId, sellerId, shippingMode, quantity, unitPriceWon }));
  const groups = groupShipmentLines(lines);
  const policies = new ShippingPolicies(pool, client);
  const global = await policies.getGlobal();
  const byGroup = new Map<string, Pick<ShippingPolicy, 'feeWon' | 'freeThresholdWon'>>();
  await Promise.all(groups.map(async (group) => {
    byGroup.set(group.key, group.sellerId ? (await policies.getEffective(group.sellerId)).policy : global.policy);
  }));
  return quoteShipments(lines, (group) => {
    const policy = byGroup.get(group.key);
    if (!policy) throw new Error('Shipment policy unavailable');
    return policy;
  });
}
