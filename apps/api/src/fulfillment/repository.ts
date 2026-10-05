import type { PoolClient } from 'pg';
import { resolveShippingPolicy, validateShippingPolicy,
  type ShippingPolicy } from '../shipping/policy.js';

export type FulfillmentSource = {
  key: string;
  shippingMode: 'seller_direct' | 'owool_fulfillment';
  sellerId: string | null;
};

export type FulfillmentAssignment = {
  fulfillmentSellerId: string;
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

/** Lock every mutable source used to assign fulfillment before the order snapshot is inserted. */
export async function lockFulfillmentAssignments(client: PoolClient,
  sources: FulfillmentSource[]): Promise<Map<string, FulfillmentAssignment>> {
  const pooled = sources.some((source) => source.shippingMode === 'owool_fulfillment');
  const setting = await client.query<{ owoolSellerId: string | null }>(
    `SELECT owool_seller_id AS "owoolSellerId" FROM fulfillment_settings
     WHERE id=1 FOR SHARE`,
  );
  if (!setting.rows[0] || (pooled && !setting.rows[0].owoolSellerId)) {
    throw new Error('Fulfillment not configured');
  }
  const globalResult = await client.query<GlobalPolicyRow>(
    `SELECT fee_won AS "feeWon",free_threshold_won AS "freeThresholdWon",
      cutoff_time AS "cutoffTime",blocked_postal_ranges AS "blockedPostalRanges",
      locked_fee AS "lockedFee",locked_threshold AS "lockedThreshold",
      locked_cutoff AS "lockedCutoff"
     FROM shipping_policy_global WHERE id=1 FOR SHARE`,
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
     WHERE seller_id=ANY($1::uuid[]) ORDER BY seller_id FOR SHARE`, [directSellerIds],
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
