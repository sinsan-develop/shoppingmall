import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { resolveShippingPolicy, validateShippingPolicy,
  type ShippingPolicy } from '../shipping/policy.js';
import { calculateExpectedShipDate } from './rules.js';

export type FulfillmentSource = {
  key: string;
  shippingMode: 'seller_direct' | 'owool_fulfillment';
  sellerId: string | null;
};

export type FulfillmentAssignment = {
  fulfillmentSellerId: string;
  cutoffTime: string | null;
};

export type PaymentFulfillment = {
  shipmentOrderId: string;
  cutoffTime: string | null;
};

type GlobalPolicyRow = {
  feeWon: number;
  freeThresholdWon: number;
  cutoffTime: string | null;
  blockedPostalRanges: ShippingPolicy['blockedPostalRanges'];
  lockedFee: boolean;
  lockedThreshold: boolean;
  lockedCutoff: boolean;
};

/** Read one repeatable-read snapshot of assignment sources while locking owner validity rows. */
export async function snapshotFulfillmentAssignments(client: PoolClient,
  sources: FulfillmentSource[]): Promise<Map<string, FulfillmentAssignment>> {
  const pooled = sources.some((source) => source.shippingMode === 'owool_fulfillment');
  const setting = await client.query<{ owoolSellerId: string | null }>(
    `SELECT owool_seller_id AS "owoolSellerId" FROM fulfillment_settings
     WHERE id=1`,
  );
  if (!setting.rows[0] || (pooled && !setting.rows[0].owoolSellerId)) {
    throw new Error('Fulfillment not configured');
  }
  const globalResult = await client.query<GlobalPolicyRow>(
    `SELECT fee_won AS "feeWon",free_threshold_won AS "freeThresholdWon",
      cutoff_time AS "cutoffTime",blocked_postal_ranges AS "blockedPostalRanges",
      locked_fee AS "lockedFee",locked_threshold AS "lockedThreshold",
      locked_cutoff AS "lockedCutoff"
     FROM shipping_policy_global WHERE id=1`,
  );
  if (!globalResult.rows[0]) throw new Error('Fulfillment not configured');
  const globalRow = globalResult.rows[0];
  const globalPolicy = validateShippingPolicy(globalRow);
  const locks = { feeWon: globalRow.lockedFee, freeThresholdWon: globalRow.lockedThreshold,
    cutoffTime: globalRow.lockedCutoff };
  const directSellerIds = [...new Set(sources
    .filter((source) => source.shippingMode === 'seller_direct')
    .map((source) => source.sellerId)
    .filter((sellerId): sellerId is string => sellerId !== null))].sort();
  const ownerIds = [...new Set([
    ...directSellerIds,
    ...(pooled && setting.rows[0].owoolSellerId ? [setting.rows[0].owoolSellerId] : []),
  ])].sort();
  const sellers = await client.query<{ id: string }>(
    `SELECT id FROM sellers WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE`, [ownerIds],
  );
  if (sellers.rows.length !== ownerIds.length) throw new Error('Fulfillment seller unavailable');
  const grants = await client.query<{ sellerId: string }>(
    `SELECT r.seller_id AS "sellerId" FROM account_roles r
     JOIN accounts a ON a.id=r.account_id
     WHERE r.role='seller' AND r.seller_id=ANY($1::uuid[]) AND a.disabled_at IS NULL
     ORDER BY r.seller_id,r.id FOR SHARE OF r,a`, [ownerIds],
  );
  const activeOwners = new Set(grants.rows.map((row) => row.sellerId));
  if (ownerIds.some((sellerId) => !activeOwners.has(sellerId))) {
    throw new Error('Fulfillment seller unavailable');
  }
  const sellerPolicies = await client.query<{ sellerId: string; policy: ShippingPolicy }>(
    `SELECT seller_id AS "sellerId",policy FROM seller_shipping_policies
     WHERE seller_id=ANY($1::uuid[]) ORDER BY seller_id`, [directSellerIds],
  );
  const policies = new Map(sellerPolicies.rows.map((row) => [row.sellerId, row.policy]));
  return new Map(sources.map((source) => {
    if (source.shippingMode === 'owool_fulfillment') {
      return [source.key, { fulfillmentSellerId: setting.rows[0].owoolSellerId as string,
        cutoffTime: globalPolicy.cutoffTime }];
    }
    if (!source.sellerId) throw new Error('Fulfillment seller unavailable');
    const policy = resolveShippingPolicy(globalPolicy, policies.get(source.sellerId) ?? null, locks);
    return [source.key, { fulfillmentSellerId: source.sellerId, cutoffTime: policy.cutoffTime }];
  }));
}

export async function insertPendingFulfillment(client: PoolClient, shipmentOrderId: string,
  assignment: FulfillmentAssignment): Promise<void> {
  await client.query(`INSERT INTO shipment_fulfillments
    (shipment_order_id,fulfillment_seller_id,status,cutoff_time)
    VALUES ($1,$2,'PAYMENT_PENDING',$3)`,
  [shipmentOrderId, assignment.fulfillmentSellerId, assignment.cutoffTime]);
}

/** Lock order: checkout order (caller), then shipment key/id, then its fulfillment row. */
export async function lockPaymentFulfillments(client: PoolClient,
  checkoutOrderId: string): Promise<PaymentFulfillment[] | null> {
  const shipments = await client.query<{
    id: string;
    shippingMode: string;
    sellerId: string | null;
    status: string;
  }>(`SELECT id,shipping_mode AS "shippingMode",seller_id AS "sellerId",status
    FROM shipment_orders WHERE checkout_order_id=$1
    ORDER BY shipment_key,id FOR UPDATE`, [checkoutOrderId]);
  if (!shipments.rows.length) return null;
  const fulfillments = await client.query<{
    shipmentOrderId: string;
    fulfillmentSellerId: string;
    status: string;
    cutoffTime: string | null;
  }>(`SELECT f.shipment_order_id AS "shipmentOrderId",
      f.fulfillment_seller_id AS "fulfillmentSellerId",f.status,
      f.cutoff_time AS "cutoffTime"
    FROM shipment_fulfillments f JOIN shipment_orders s ON s.id=f.shipment_order_id
    WHERE s.checkout_order_id=$1 ORDER BY s.shipment_key,s.id FOR UPDATE OF f`,
  [checkoutOrderId]);
  if (fulfillments.rows.length !== shipments.rows.length) return null;
  for (let index = 0; index < shipments.rows.length; index += 1) {
    const shipment = shipments.rows[index];
    const fulfillment = fulfillments.rows[index];
    if (fulfillment.shipmentOrderId !== shipment.id || shipment.status !== 'PENDING_PAYMENT' ||
        fulfillment.status !== 'PAYMENT_PENDING') {
      return null;
    }
    if (shipment.shippingMode === 'seller_direct') {
      if (!shipment.sellerId || fulfillment.fulfillmentSellerId !== shipment.sellerId) return null;
    } else if (shipment.shippingMode !== 'owool_fulfillment') return null;
  }
  return fulfillments.rows.map(({ shipmentOrderId, cutoffTime }) => ({
    shipmentOrderId, cutoffTime,
  }));
}

function paymentFingerprint(shipmentOrderId: string, paymentEventId: string,
  expectedShipDate: string): string {
  return createHash('sha256').update(JSON.stringify({
    action: 'PAYMENT_CONFIRMED', shipmentOrderId, paymentEventId,
    fromStatus: 'PAYMENT_PENDING', toStatus: 'READY', expectedShipDate,
  })).digest('hex');
}

export async function openPaymentFulfillments(client: PoolClient,
  fulfillments: PaymentFulfillment[], paymentEventId: string, paidAt: Date): Promise<void> {
  for (const fulfillment of fulfillments) {
    const expectedShipDate = calculateExpectedShipDate(
      paidAt.toISOString(), fulfillment.cutoffTime,
    );
    const beforeSnapshot = {
      status: 'PAYMENT_PENDING', expectedShipDate: null,
      carrierCode: null, trackingNumber: null,
    };
    const afterSnapshot = {
      status: 'READY', expectedShipDate,
      carrierCode: null, trackingNumber: null,
    };
    const changed = await client.query(`UPDATE shipment_fulfillments
      SET status='READY',expected_ship_date=$2,version=version+1,updated_at=$3
      WHERE shipment_order_id=$1 AND status='PAYMENT_PENDING'`,
    [fulfillment.shipmentOrderId, expectedShipDate, paidAt]);
    if (changed.rowCount !== 1) throw new Error('Payment fulfillment conflict');
    await client.query(`INSERT INTO shipment_fulfillment_events
      (shipment_order_id,action,from_status,to_status,before_snapshot,after_snapshot,
        idempotency_scope,idempotency_key,request_fingerprint,occurred_at)
      VALUES ($1,'PAYMENT_CONFIRMED','PAYMENT_PENDING','READY',$2::jsonb,$3::jsonb,
        'system:payment',$4,$5,$6)`, [
      fulfillment.shipmentOrderId, JSON.stringify(beforeSnapshot), JSON.stringify(afterSnapshot),
      paymentEventId, paymentFingerprint(
        fulfillment.shipmentOrderId, paymentEventId, expectedShipDate,
      ), paidAt,
    ]);
  }
}
