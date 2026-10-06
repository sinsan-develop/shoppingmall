import type { Pool, PoolClient } from 'pg';

type Db = Pool | PoolClient;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Confirmation = { id: string; confirmedAt: Date };

export async function createPurchaseConfirmation(db: Db, input: {
  customerAccountId: string; orderId: string; shipmentOrderId: string;
  optionId: string; idempotencyKey: string;
}): Promise<Confirmation> {
  if (![input.customerAccountId, input.orderId, input.shipmentOrderId,
    input.optionId, input.idempotencyKey].every((id) => uuid.test(id)))
    throw new Error('Invalid support request');
  const inserted = await db.query<Confirmation>(`INSERT INTO support_purchase_confirmations
      (checkout_order_id,shipment_order_id,option_id,product_id,customer_account_id,
       shipped_event_id,idempotency_key)
      SELECT o.id,s.id,l.option_id,l.product_id,o.account_id,e.id,$5
      FROM checkout_orders o
      JOIN shipment_orders s ON s.checkout_order_id=o.id
      JOIN shipment_order_lines l ON l.shipment_order_id=s.id
      JOIN shipment_fulfillments f ON f.shipment_order_id=s.id
      JOIN LATERAL (SELECT id FROM shipment_fulfillment_events
        WHERE shipment_order_id=s.id AND action='MARK_SHIPPED' AND to_status='SHIPPED'
        ORDER BY occurred_at DESC,id DESC LIMIT 1) e ON true
      WHERE o.id=$2 AND o.account_id=$1 AND o.status='PAID'
        AND s.id=$3 AND s.status='PAID' AND l.option_id=$4 AND f.status='SHIPPED'
      ON CONFLICT DO NOTHING
      RETURNING id,confirmed_at AS "confirmedAt"`,
    [input.customerAccountId, input.orderId, input.shipmentOrderId,
      input.optionId, input.idempotencyKey]);
  if (inserted.rows[0]) return inserted.rows[0];
  const existing = (await db.query<Confirmation & { orderId: string;
    shipmentOrderId: string; optionId: string }>(`SELECT id,confirmed_at AS "confirmedAt",
      checkout_order_id AS "orderId",shipment_order_id AS "shipmentOrderId",
      option_id AS "optionId" FROM support_purchase_confirmations
      WHERE customer_account_id=$1 AND idempotency_key=$2`,
  [input.customerAccountId, input.idempotencyKey])).rows[0];
  if (!existing) {
    const sameLine = await db.query(`SELECT 1 FROM support_purchase_confirmations
      WHERE shipment_order_id=$1 AND option_id=$2 AND customer_account_id=$3`,
    [input.shipmentOrderId, input.optionId, input.customerAccountId]);
    if (sameLine.rowCount) throw new Error('Support conflict');
    throw new Error('Support unavailable');
  }
  if (existing.orderId !== input.orderId || existing.shipmentOrderId !== input.shipmentOrderId ||
      existing.optionId !== input.optionId) throw new Error('Support conflict');
  return { id: existing.id, confirmedAt: existing.confirmedAt };
}
