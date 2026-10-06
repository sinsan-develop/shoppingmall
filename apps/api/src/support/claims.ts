import { Pool } from 'pg';
import type { PoolClient } from 'pg';

type Db = Pool | PoolClient;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kinds = new Set(['CLAIM','RETURN','EXCHANGE']);
const reasonCodes = new Set(['quality_issue','damaged','wrong_delivery','change_of_mind','other']);

type ClaimInput = {
  customerAccountId: string; orderId: string; shipmentOrderId: string; optionId: string;
  kind: string; reasonCode: string; reason: string; quantity: number;
  idempotencyKey: string;
};

export async function createClaim(db: Db, input: ClaimInput) {
  if (![input.customerAccountId,input.orderId,input.shipmentOrderId,input.optionId,
    input.idempotencyKey].every((id) => uuid.test(id)) || !kinds.has(input.kind) ||
      !reasonCodes.has(input.reasonCode) || typeof input.reason !== 'string' ||
      !input.reason.trim() || input.reason.trim().length > 2000 ||
      !Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 1000000)
    throw new Error('Invalid support request');
  const reason = input.reason.trim();
  const ownsTransaction = db instanceof Pool;
  const client = ownsTransaction ? await db.connect() : db as PoolClient;
  try {
    if (ownsTransaction) await client.query('BEGIN');
    const shipment = (await client.query(`SELECT shipment.id FROM shipment_orders shipment
      JOIN checkout_orders checkout ON checkout.id=shipment.checkout_order_id
      WHERE checkout.id=$1 AND shipment.id=$2 AND checkout.account_id=$3
        AND checkout.status='PAID' AND shipment.status='PAID'
      FOR UPDATE OF shipment`,
    [input.orderId, input.shipmentOrderId, input.customerAccountId])).rows[0];
    if (!shipment) throw new Error('Support unavailable');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
      [`support-claim-create:${input.customerAccountId}:${input.idempotencyKey}`]);
    const prior = (await client.query<{ id: string; status: string;
      checkoutOrderId: string; shipmentOrderId: string; optionId: string;
      kind: string; reasonCode: string; reason: string; quantity: number }>(`
      SELECT id,status,checkout_order_id AS "checkoutOrderId",
        shipment_order_id AS "shipmentOrderId",option_id AS "optionId",
        kind,reason_code AS "reasonCode",reason,quantity
      FROM support_claims WHERE customer_account_id=$1 AND idempotency_key=$2`,
    [input.customerAccountId, input.idempotencyKey])).rows[0];
    if (prior) {
      if (prior.checkoutOrderId !== input.orderId ||
          prior.shipmentOrderId !== input.shipmentOrderId || prior.optionId !== input.optionId ||
          prior.kind !== input.kind || prior.reasonCode !== input.reasonCode ||
          prior.reason !== reason || prior.quantity !== input.quantity)
        throw new Error('Support conflict');
      if (ownsTransaction) await client.query('COMMIT');
      return { id: prior.id, status: prior.status };
    }
    const fulfillment = (await client.query(`SELECT shipment_order_id
      FROM shipment_fulfillments WHERE shipment_order_id=$1 AND status='SHIPPED'
      FOR UPDATE`, [input.shipmentOrderId])).rows[0];
    if (!fulfillment) throw new Error('Support unavailable');
    const shippedEvent = await client.query(`SELECT 1 FROM shipment_fulfillment_events
      WHERE shipment_order_id=$1 AND action='MARK_SHIPPED' AND to_status='SHIPPED'
      LIMIT 1`, [input.shipmentOrderId]);
    if (!shippedEvent.rowCount) throw new Error('Support unavailable');
    const line = (await client.query<{ productId: string; sellerId: string;
      quantity: number }>(`SELECT product_id AS "productId",seller_id AS "sellerId",quantity
      FROM shipment_order_lines WHERE shipment_order_id=$1 AND option_id=$2
      FOR UPDATE`, [input.shipmentOrderId, input.optionId])).rows[0];
    if (!line) throw new Error('Support unavailable');
    const used = (await client.query<{ quantity: number }>(`
      SELECT COALESCE(sum(quantity),0)::int AS quantity FROM support_claims
      WHERE shipment_order_id=$1 AND option_id=$2 AND status<>'REJECTED'`,
    [input.shipmentOrderId, input.optionId])).rows[0].quantity;
    const preOccupied = (await client.query<{ quantity: number }>(`
      SELECT COALESCE(sum(refund_line.quantity),0)::int AS quantity
      FROM refund_case_lines refund_line
      JOIN refund_cases refund ON refund.id=refund_line.refund_case_id
      WHERE refund_line.shipment_order_id=$1 AND refund_line.option_id=$2
        AND refund.post_shipment_claim_id IS NULL
        AND refund.status IN ('APPROVED','PROCESSING','REFUNDED','REVIEW_REQUIRED')`,
    [input.shipmentOrderId, input.optionId])).rows[0].quantity;
    if (preOccupied + used + input.quantity > line.quantity)
      throw new Error('Support conflict');
    const claim = (await client.query<{ id: string; status: string }>(`
      INSERT INTO support_claims(checkout_order_id,shipment_order_id,option_id,
        product_id,customer_account_id,seller_id,kind,reason_code,reason,quantity,idempotency_key)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,status`,
    [input.orderId, input.shipmentOrderId, input.optionId,line.productId,
      input.customerAccountId,line.sellerId,input.kind,input.reasonCode,reason,
      input.quantity,input.idempotencyKey])).rows[0];
    await client.query(`INSERT INTO support_claim_events
      (claim_id,action,actor_account_id,actor_role,reason,before_status,after_status)
      VALUES ($1,'REQUESTED',$2,'customer','Claim requested',NULL,'REQUESTED')`,
    [claim.id,input.customerAccountId]);
    await client.query(`INSERT INTO support_claim_messages
      (claim_id,author_account_id,author_role,body)
      VALUES ($1,$2,'customer',$3)`, [claim.id,input.customerAccountId,reason]);
    if (ownsTransaction) await client.query('COMMIT');
    return claim;
  } catch (error) {
    if (ownsTransaction) await client.query('ROLLBACK');
    throw error;
  } finally { if (ownsTransaction) client.release(); }
}
