import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
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

export type SellerFulfillmentCursor = { paidAt: string; shipmentOrderId: string };

export type SellerFulfillmentListRow = {
  shipmentOrderId: string;
  status: string;
  version: number;
  paidAt: Date;
  cursorPaidAt: string;
  expectedShipDate: string;
  recipientName: string;
  phone: string;
  carrierCode: string | null;
  carrierName: string | null;
  trackingNumber: string | null;
};

export async function listSellerFulfillments(pool: Pool, sellerId: string, input: {
  status?: string;
  cursor?: SellerFulfillmentCursor;
  limit: number;
}): Promise<SellerFulfillmentListRow[]> {
  const result = await pool.query<SellerFulfillmentListRow>(`SELECT
    s.id AS "shipmentOrderId",f.status,f.version,o.paid_at AS "paidAt",
    to_char(o.paid_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorPaidAt",
    f.expected_ship_date::text AS "expectedShipDate",o.recipient_name AS "recipientName",
    o.phone,f.carrier_code AS "carrierCode",f.carrier_name AS "carrierName",
    f.tracking_number AS "trackingNumber"
    FROM shipment_orders s
    JOIN checkout_orders o ON o.id=s.checkout_order_id
    JOIN shipment_fulfillments f ON f.shipment_order_id=s.id
    WHERE f.fulfillment_seller_id=$1 AND o.status='PAID' AND s.status='PAID'
      AND ($2::text IS NULL OR f.status=$2)
      AND ($3::timestamptz IS NULL OR o.paid_at < $3::timestamptz
        OR (o.paid_at=$3::timestamptz AND s.id < $4::uuid))
    ORDER BY o.paid_at DESC,s.id DESC LIMIT $5`, [
    sellerId, input.status ?? null, input.cursor?.paidAt ?? null,
    input.cursor?.shipmentOrderId ?? null, input.limit + 1,
  ]);
  return result.rows;
}

export async function getSellerFulfillmentDetail(pool: Pool, sellerId: string,
  shipmentOrderId: string) {
  const shipment = (await pool.query<{
    shipmentOrderId: string;
    status: string;
    version: number;
    paidAt: Date;
    expectedShipDate: string;
    customerMessage: string | null;
    carrierCode: string | null;
    carrierName: string | null;
    trackingNumber: string | null;
    goodsWon: number;
    goodsDiscountWon: number;
    shippingFeeWon: number;
    shippingSupportWon: number;
    payableWon: number;
    recipientName: string;
    phone: string;
    postalCode: string;
    line1: string;
    line2: string | null;
  }>(`SELECT s.id AS "shipmentOrderId",f.status,f.version,o.paid_at AS "paidAt",
      f.expected_ship_date::text AS "expectedShipDate",
      (SELECT e.customer_message FROM shipment_fulfillment_events e
        WHERE e.shipment_order_id=s.id AND e.customer_message IS NOT NULL
        ORDER BY e.occurred_at DESC,e.id DESC LIMIT 1) AS "customerMessage",
      f.carrier_code AS "carrierCode",f.carrier_name AS "carrierName",
      f.tracking_number AS "trackingNumber",s.goods_won AS "goodsWon",
      s.goods_discount_won AS "goodsDiscountWon",s.shipping_fee_won AS "shippingFeeWon",
      s.shipping_support_won AS "shippingSupportWon",s.payable_won AS "payableWon",
      o.recipient_name AS "recipientName",o.phone,o.postal_code AS "postalCode",
      o.line1,o.line2
    FROM shipment_orders s
    JOIN checkout_orders o ON o.id=s.checkout_order_id
    JOIN shipment_fulfillments f ON f.shipment_order_id=s.id
    WHERE s.id=$1 AND f.fulfillment_seller_id=$2
      AND o.status='PAID' AND s.status='PAID'`, [shipmentOrderId, sellerId])).rows[0];
  if (!shipment) return undefined;
  const lines = (await pool.query<{
    productId: string;
    optionId: string;
    sellerId: string;
    productName: string;
    optionName: string;
    unitPriceWon: number;
    originalQuantity: number;
    refundedQuantity: number;
    remainingQuantity: number;
    goodsDiscountWon: number;
    goodsPayableWon: number;
  }>(`SELECT l.product_id AS "productId",l.option_id AS "optionId",
      l.seller_id AS "sellerId",l.product_name AS "productName",l.option_name AS "optionName",
      l.unit_price_won AS "unitPriceWon",l.quantity AS "originalQuantity",
      COALESCE((SELECT sum(rl.quantity)::int FROM refund_case_lines rl
        JOIN refund_cases r ON r.id=rl.refund_case_id
        WHERE rl.shipment_order_id=l.shipment_order_id AND rl.option_id=l.option_id
          AND r.status='REFUNDED'),0) AS "refundedQuantity",
      GREATEST(l.quantity-COALESCE((SELECT sum(rl.quantity)::int FROM refund_case_lines rl
        JOIN refund_cases r ON r.id=rl.refund_case_id
        WHERE rl.shipment_order_id=l.shipment_order_id AND rl.option_id=l.option_id
          AND r.status='REFUNDED'),0),0) AS "remainingQuantity",
      l.goods_discount_won AS "goodsDiscountWon",l.goods_payable_won AS "goodsPayableWon"
    FROM shipment_order_lines l WHERE l.shipment_order_id=$1
    ORDER BY l.option_id`, [shipmentOrderId])).rows;
  return {
    shipmentOrderId: shipment.shipmentOrderId,
    status: shipment.status,
    version: shipment.version,
    paidAt: shipment.paidAt.toISOString(),
    expectedShipDate: shipment.expectedShipDate,
    customerMessage: shipment.customerMessage,
    carrierCode: shipment.carrierCode,
    carrierName: shipment.carrierName,
    trackingNumber: shipment.trackingNumber,
    amounts: {
      goodsWon: shipment.goodsWon,
      goodsDiscountWon: shipment.goodsDiscountWon,
      shippingFeeWon: shipment.shippingFeeWon,
      shippingSupportWon: shipment.shippingSupportWon,
      payableWon: shipment.payableWon,
    },
    address: {
      recipientName: shipment.recipientName,
      phone: shipment.phone,
      postalCode: shipment.postalCode,
      line1: shipment.line1,
      line2: shipment.line2,
    },
    lines,
  };
}

export type LockedSellerFulfillment = {
  shipmentOrderId: string;
  status: string;
  version: number;
  expectedShipDate: string;
  carrierCode: string | null;
  carrierName: string | null;
  trackingNumber: string | null;
  customerMessage: string | null;
  currentSeoulDate: string;
};

export async function lockSellerFulfillment(client: PoolClient, sellerId: string,
  shipmentOrderId: string): Promise<LockedSellerFulfillment | undefined> {
  const owned = await client.query(`SELECT s.id FROM shipment_orders s
    JOIN checkout_orders o ON o.id=s.checkout_order_id
    JOIN shipment_fulfillments f ON f.shipment_order_id=s.id
    WHERE s.id=$1 AND f.fulfillment_seller_id=$2
      AND o.status='PAID' AND s.status='PAID' FOR UPDATE OF s`, [shipmentOrderId, sellerId]);
  if (!owned.rows[0]) return undefined;
  return (await client.query<LockedSellerFulfillment>(`SELECT
      f.shipment_order_id AS "shipmentOrderId",f.status,f.version,
      f.expected_ship_date::text AS "expectedShipDate",f.carrier_code AS "carrierCode",
      f.carrier_name AS "carrierName",f.tracking_number AS "trackingNumber",
      (SELECT e.customer_message FROM shipment_fulfillment_events e
        WHERE e.shipment_order_id=f.shipment_order_id AND e.customer_message IS NOT NULL
        ORDER BY e.occurred_at DESC,e.id DESC LIMIT 1) AS "customerMessage",
      to_char(clock_timestamp() AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS "currentSeoulDate"
    FROM shipment_fulfillments f
    JOIN shipment_orders s ON s.id=f.shipment_order_id
    JOIN checkout_orders o ON o.id=s.checkout_order_id
    WHERE f.shipment_order_id=$1 AND f.fulfillment_seller_id=$2
      AND o.status='PAID' AND s.status='PAID' FOR UPDATE OF f`,
  [shipmentOrderId, sellerId])).rows[0];
}

export async function findSellerTransitionReplay(client: PoolClient, shipmentOrderId: string,
  accountId: string, idempotencyKey: string) {
  return (await client.query<{
    requestFingerprint: string;
    afterSnapshot: Record<string, unknown>;
    customerMessage: string | null;
    response: Record<string, unknown> | null;
  }>(`SELECT e.request_fingerprint AS "requestFingerprint",
      e.after_snapshot AS "afterSnapshot",e.customer_message AS "customerMessage",
      a.details->'response' AS response
    FROM shipment_fulfillment_events e
    LEFT JOIN LATERAL (SELECT details FROM audit_events a
      WHERE a.actor_account_id=$2::uuid AND a.active_role='seller'
        AND a.action='fulfillment.seller_transition' AND a.target_type='shipment_order'
        AND a.target_id=e.shipment_order_id::text
        AND a.details->>'idempotencyKey'=$3::text LIMIT 1) a ON true
    WHERE e.shipment_order_id=$1::uuid AND e.actor_account_id=$2::uuid
      AND e.idempotency_scope=e.actor_account_id::text
      AND e.idempotency_key=$3::uuid`, [shipmentOrderId, accountId, idempotencyKey])).rows[0];
}

export type SellerTransitionUpdate = {
  status: 'PACKING' | 'DELAYED' | 'SHIPPED';
  expectedShipDate: string;
  carrierCode: string | null;
  carrierName: string | null;
  trackingNumber: string | null;
};

export async function updateSellerFulfillment(client: PoolClient, shipmentOrderId: string,
  expectedVersion: number, update: SellerTransitionUpdate): Promise<number | undefined> {
  return (await client.query<{ version: number }>(`UPDATE shipment_fulfillments SET
      status=$3,expected_ship_date=$4,carrier_code=$5,carrier_name=$6,tracking_number=$7,
      packed_at=CASE WHEN $3='PACKING' THEN COALESCE(packed_at,clock_timestamp()) ELSE packed_at END,
      first_shipped_at=CASE WHEN $3='SHIPPED' THEN COALESCE(first_shipped_at,clock_timestamp())
        ELSE first_shipped_at END,
      shipped_at=CASE WHEN $3='SHIPPED' THEN clock_timestamp() ELSE NULL END,
      version=version+1,updated_at=clock_timestamp()
    WHERE shipment_order_id=$1 AND version=$2 RETURNING version`, [
    shipmentOrderId, expectedVersion, update.status, update.expectedShipDate,
    update.carrierCode, update.carrierName, update.trackingNumber,
  ])).rows[0]?.version;
}

export async function insertSellerTransitionRecords(client: PoolClient, input: {
  shipmentOrderId: string;
  accountId: string;
  sellerId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  action: 'START_PACKING' | 'REPORT_DELAY' | 'RESUME_PACKING' | 'MARK_SHIPPED';
  fromStatus: string;
  toStatus: string;
  reason: string | null;
  customerMessage: string | null;
  beforeSnapshot: object;
  afterSnapshot: object;
  response: object;
}): Promise<void> {
  await client.query(`INSERT INTO shipment_fulfillment_events
    (shipment_order_id,action,from_status,to_status,actor_account_id,actor_role,actor_seller_id,
      reason,customer_message,before_snapshot,after_snapshot,idempotency_scope,idempotency_key,
      request_fingerprint)
    VALUES ($1,$2,$3,$4,$5::uuid,'seller',$6,$7,$8,$9::jsonb,$10::jsonb,
      $5::uuid::text,$11,$12)`, [
    input.shipmentOrderId, input.action, input.fromStatus, input.toStatus, input.accountId,
    input.sellerId, input.reason, input.customerMessage, JSON.stringify(input.beforeSnapshot),
    JSON.stringify(input.afterSnapshot), input.idempotencyKey, input.requestFingerprint,
  ]);
  await client.query(`INSERT INTO audit_events
    (actor_account_id,active_role,seller_id,action,target_type,target_id,details)
    VALUES ($1,'seller',$2,'fulfillment.seller_transition','shipment_order',$3,$4::jsonb)`, [
    input.accountId, input.sellerId, input.shipmentOrderId,
    JSON.stringify({ idempotencyKey: input.idempotencyKey, response: input.response }),
  ]);
}

export type AdminFulfillmentCursor = { paidAt: string; shipmentOrderId: string };

export async function getAdminFulfillmentSetting(pool: Pool) {
  return (await pool.query<{ owoolSellerId: string | null;
    owoolSellerDisplayName: string | null; version: number; updatedAt: Date }>(
    `SELECT setting.owool_seller_id AS "owoolSellerId",
      seller.display_name AS "owoolSellerDisplayName",setting.version,
      setting.updated_at AS "updatedAt"
     FROM fulfillment_settings setting
     LEFT JOIN sellers seller ON seller.id=setting.owool_seller_id
     WHERE setting.id=1`,
  )).rows[0];
}

export async function lockAdminFulfillmentSetting(client: PoolClient) {
  return (await client.query<{ owoolSellerId: string | null; version: number }>(
    `SELECT owool_seller_id AS "owoolSellerId",version
     FROM fulfillment_settings WHERE id=1 FOR UPDATE`,
  )).rows[0];
}

export async function hasActiveSellerGrant(client: PoolClient, sellerId: string): Promise<boolean> {
  const result = await client.query(`SELECT s.id FROM sellers s
    JOIN account_roles r ON r.seller_id=s.id AND r.role='seller'
    JOIN accounts a ON a.id=r.account_id AND a.disabled_at IS NULL
    WHERE s.id=$1 ORDER BY r.id LIMIT 1 FOR SHARE OF s,r,a`, [sellerId]);
  return result.rowCount === 1;
}

export async function findAdminSettingReplay(client: PoolClient, accountId: string,
  idempotencyKey: string) {
  return (await client.query<{
    requestFingerprint: string;
    response: Record<string, unknown> | null;
  }>(`SELECT details->>'requestFingerprint' AS "requestFingerprint",
      details->'response' AS response
    FROM audit_events
    WHERE actor_account_id=$1::uuid AND active_role='admin' AND seller_id IS NULL
      AND action='fulfillment.admin_setting' AND target_type='fulfillment_settings'
      AND target_id='1' AND details->>'idempotencyKey'=$2::text
    ORDER BY occurred_at,id LIMIT 1`, [accountId, idempotencyKey])).rows[0];
}

export async function updateAdminFulfillmentSetting(client: PoolClient, input: {
  sellerId: string;
  accountId: string;
  expectedVersion: number;
  reason: string;
  idempotencyKey: string;
  requestFingerprint: string;
}) {
  const changed = (await client.query<{ owoolSellerId: string;
    owoolSellerDisplayName: string; version: number; updatedAt: Date }>(
    `WITH changed AS (
      UPDATE fulfillment_settings SET owool_seller_id=$1,updated_by=$2,
        version=version+1,updated_at=clock_timestamp()
      WHERE id=1 AND version=$3
      RETURNING owool_seller_id,version,updated_at
    )
    SELECT changed.owool_seller_id AS "owoolSellerId",
      seller.display_name AS "owoolSellerDisplayName",changed.version,
      changed.updated_at AS "updatedAt"
    FROM changed JOIN sellers seller ON seller.id=changed.owool_seller_id`,
  [input.sellerId, input.accountId, input.expectedVersion])).rows[0];
  if (!changed) return undefined;
  await client.query(`INSERT INTO audit_events
    (actor_account_id,active_role,action,target_type,target_id,details)
    VALUES ($1,'admin','fulfillment.admin_setting','fulfillment_settings','1',$2::jsonb)`, [
    input.accountId,
    JSON.stringify({
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      response: changed,
    }),
  ]);
  return changed;
}

export type AdminFulfillmentListRow = {
  shipmentOrderId: string;
  status: string;
  version: number;
  paidAt: Date;
  cursorPaidAt: string;
  expectedShipDate: string;
  recipientName: string;
  phone: string;
  fulfillmentSellerId: string;
  fulfillmentSellerName: string;
  categories: { id: string; name: string }[];
  carrierCode: string | null;
  carrierName: string | null;
  trackingNumber: string | null;
};

export async function listAdminFulfillments(pool: Pool, input: {
  status?: string;
  sellerId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  cursor?: AdminFulfillmentCursor;
  limit: number;
}): Promise<AdminFulfillmentListRow[]> {
  const result = await pool.query<AdminFulfillmentListRow>(`SELECT
    s.id AS "shipmentOrderId",f.status,f.version,o.paid_at AS "paidAt",
    to_char(o.paid_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorPaidAt",
    f.expected_ship_date::text AS "expectedShipDate",o.recipient_name AS "recipientName",
    o.phone,f.fulfillment_seller_id AS "fulfillmentSellerId",
    owner.display_name AS "fulfillmentSellerName",category_set.categories,
    f.carrier_code AS "carrierCode",f.carrier_name AS "carrierName",
    f.tracking_number AS "trackingNumber"
    FROM shipment_orders s
    JOIN checkout_orders o ON o.id=s.checkout_order_id
    JOIN shipment_fulfillments f ON f.shipment_order_id=s.id
    JOIN sellers owner ON owner.id=f.fulfillment_seller_id
    JOIN LATERAL (
      SELECT jsonb_agg(DISTINCT jsonb_build_object('id',category.id,'name',category.name))
        AS categories
      FROM shipment_order_lines line
      JOIN products product ON product.id=line.product_id
      JOIN product_categories category ON category.id=product.category_id
      WHERE line.shipment_order_id=s.id
    ) category_set ON true
    WHERE o.status='PAID' AND s.status='PAID'
      AND ($1::text IS NULL OR f.status=$1)
      AND ($2::uuid IS NULL OR f.fulfillment_seller_id=$2)
      AND ($3::uuid IS NULL OR EXISTS (
        SELECT 1 FROM shipment_order_lines filter_line
        JOIN products filter_product ON filter_product.id=filter_line.product_id
        WHERE filter_line.shipment_order_id=s.id AND filter_product.category_id=$3))
      AND ($4::date IS NULL OR (o.paid_at AT TIME ZONE 'Asia/Seoul')::date >= $4::date)
      AND ($5::date IS NULL OR (o.paid_at AT TIME ZONE 'Asia/Seoul')::date <= $5::date)
      AND ($6::timestamptz IS NULL OR o.paid_at < $6::timestamptz
        OR (o.paid_at=$6::timestamptz AND s.id < $7::uuid))
    ORDER BY o.paid_at DESC,s.id DESC LIMIT $8`, [
    input.status ?? null, input.sellerId ?? null, input.categoryId ?? null,
    input.from ?? null, input.to ?? null, input.cursor?.paidAt ?? null,
    input.cursor?.shipmentOrderId ?? null, input.limit + 1,
  ]);
  return result.rows;
}

export async function getAdminFulfillmentDetail(pool: Pool, shipmentOrderId: string) {
  const shipment = (await pool.query<{
    shipmentOrderId: string;
    status: string;
    version: number;
    paidAt: Date;
    expectedShipDate: string;
    customerMessage: string | null;
    carrierCode: string | null;
    carrierName: string | null;
    trackingNumber: string | null;
    fulfillmentSellerId: string;
    fulfillmentSellerName: string;
    recipientName: string;
    phone: string;
    postalCode: string;
    line1: string;
    line2: string | null;
  }>(`SELECT s.id AS "shipmentOrderId",f.status,f.version,o.paid_at AS "paidAt",
      f.expected_ship_date::text AS "expectedShipDate",
      (SELECT e.customer_message FROM shipment_fulfillment_events e
        WHERE e.shipment_order_id=s.id AND e.customer_message IS NOT NULL
        ORDER BY e.occurred_at DESC,e.id DESC LIMIT 1) AS "customerMessage",
      f.carrier_code AS "carrierCode",f.carrier_name AS "carrierName",
      f.tracking_number AS "trackingNumber",
      f.fulfillment_seller_id AS "fulfillmentSellerId",
      owner.display_name AS "fulfillmentSellerName",
      o.recipient_name AS "recipientName",o.phone,o.postal_code AS "postalCode",
      o.line1,o.line2
    FROM shipment_orders s
    JOIN checkout_orders o ON o.id=s.checkout_order_id
    JOIN shipment_fulfillments f ON f.shipment_order_id=s.id
    JOIN sellers owner ON owner.id=f.fulfillment_seller_id
    WHERE s.id=$1 AND o.status='PAID' AND s.status='PAID'`, [shipmentOrderId])).rows[0];
  if (!shipment) return undefined;
  const lines = (await pool.query<{
    productId: string;
    optionId: string;
    sellerId: string;
    productName: string;
    optionName: string;
    quantity: number;
    categoryId: string;
    categoryName: string;
  }>(`SELECT line.product_id AS "productId",line.option_id AS "optionId",
      line.seller_id AS "sellerId",line.product_name AS "productName",
      line.option_name AS "optionName",line.quantity,
      category.id AS "categoryId",category.name AS "categoryName"
    FROM shipment_order_lines line
    JOIN products product ON product.id=line.product_id
    JOIN product_categories category ON category.id=product.category_id
    WHERE line.shipment_order_id=$1 ORDER BY line.option_id`, [shipmentOrderId])).rows;
  const events = (await pool.query<{
    action: string;
    fromStatus: string;
    toStatus: string;
    reason: string | null;
    customerMessage: string | null;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    occurredAt: Date;
  }>(`SELECT action,from_status AS "fromStatus",to_status AS "toStatus",reason,
      customer_message AS "customerMessage",before_snapshot AS before,
      after_snapshot AS after,occurred_at AS "occurredAt"
    FROM shipment_fulfillment_events WHERE shipment_order_id=$1
    ORDER BY occurred_at,id`, [shipmentOrderId])).rows;
  return {
    shipmentOrderId: shipment.shipmentOrderId,
    status: shipment.status,
    version: shipment.version,
    paidAt: shipment.paidAt.toISOString(),
    expectedShipDate: shipment.expectedShipDate,
    customerMessage: shipment.customerMessage,
    carrierCode: shipment.carrierCode,
    carrierName: shipment.carrierName,
    trackingNumber: shipment.trackingNumber,
    fulfillmentSeller: {
      id: shipment.fulfillmentSellerId,
      displayName: shipment.fulfillmentSellerName,
    },
    address: {
      recipientName: shipment.recipientName,
      phone: shipment.phone,
      postalCode: shipment.postalCode,
      line1: shipment.line1,
      line2: shipment.line2,
    },
    lines: lines.map((line) => ({
      productId: line.productId,
      optionId: line.optionId,
      sellerId: line.sellerId,
      productName: line.productName,
      optionName: line.optionName,
      quantity: line.quantity,
      category: { id: line.categoryId, name: line.categoryName },
    })),
    events: events.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() })),
  };
}

export type LockedAdminFulfillment = {
  shipmentOrderId: string;
  status: string;
  version: number;
  expectedShipDate: string;
  carrierCode: string | null;
  carrierName: string | null;
  trackingNumber: string | null;
};

export async function lockAdminFulfillment(client: PoolClient,
  shipmentOrderId: string): Promise<LockedAdminFulfillment | undefined> {
  const owned = await client.query(`SELECT s.id FROM shipment_orders s
    JOIN checkout_orders o ON o.id=s.checkout_order_id
    JOIN shipment_fulfillments f ON f.shipment_order_id=s.id
    WHERE s.id=$1 AND o.status='PAID' AND s.status='PAID' FOR UPDATE OF s`, [shipmentOrderId]);
  if (!owned.rows[0]) return undefined;
  return (await client.query<LockedAdminFulfillment>(`SELECT
      f.shipment_order_id AS "shipmentOrderId",f.status,f.version,
      f.expected_ship_date::text AS "expectedShipDate",f.carrier_code AS "carrierCode",
      f.carrier_name AS "carrierName",f.tracking_number AS "trackingNumber"
    FROM shipment_fulfillments f
    JOIN shipment_orders s ON s.id=f.shipment_order_id
    JOIN checkout_orders o ON o.id=s.checkout_order_id
    WHERE f.shipment_order_id=$1 AND o.status='PAID' AND s.status='PAID'
    FOR UPDATE OF f`, [shipmentOrderId])).rows[0];
}

export async function findAdminCorrectionReplay(client: PoolClient, shipmentOrderId: string,
  accountId: string, idempotencyKey: string) {
  return (await client.query<{
    requestFingerprint: string;
    response: Record<string, unknown> | null;
  }>(`SELECT event.request_fingerprint AS "requestFingerprint",
      audit.details->'response' AS response
    FROM shipment_fulfillment_events event
    LEFT JOIN LATERAL (SELECT details FROM audit_events audit
      WHERE audit.actor_account_id=$2::uuid AND audit.active_role='admin'
        AND audit.seller_id IS NULL AND audit.action='fulfillment.admin_correction'
        AND audit.target_type='shipment_order' AND audit.target_id=event.shipment_order_id::text
        AND audit.details->>'idempotencyKey'=$3::text LIMIT 1) audit ON true
    WHERE event.shipment_order_id=$1::uuid AND event.actor_account_id=$2::uuid
      AND event.actor_role='admin' AND event.idempotency_scope=event.actor_account_id::text
      AND event.idempotency_key=$3::uuid`, [shipmentOrderId, accountId, idempotencyKey])).rows[0];
}

export type AdminCorrectionUpdate = {
  status: 'READY' | 'PACKING' | 'DELAYED' | 'SHIPPED';
  expectedShipDate: string;
  carrierCode: string | null;
  carrierName: string | null;
  trackingNumber: string | null;
};

export async function updateAdminFulfillment(client: PoolClient, shipmentOrderId: string,
  expectedVersion: number, update: AdminCorrectionUpdate): Promise<number | undefined> {
  return (await client.query<{ version: number }>(`UPDATE shipment_fulfillments SET
      status=$3,expected_ship_date=$4,carrier_code=$5,carrier_name=$6,tracking_number=$7,
      packed_at=CASE WHEN $3='PACKING' THEN COALESCE(packed_at,clock_timestamp()) ELSE packed_at END,
      first_shipped_at=CASE WHEN $3='SHIPPED' THEN COALESCE(first_shipped_at,clock_timestamp())
        ELSE first_shipped_at END,
      shipped_at=CASE WHEN $3='SHIPPED' THEN COALESCE(shipped_at,clock_timestamp()) ELSE NULL END,
      version=version+1,updated_at=clock_timestamp()
    WHERE shipment_order_id=$1 AND version=$2 RETURNING version`, [
    shipmentOrderId, expectedVersion, update.status, update.expectedShipDate,
    update.carrierCode, update.carrierName, update.trackingNumber,
  ])).rows[0]?.version;
}

export async function insertAdminCorrectionRecords(client: PoolClient, input: {
  shipmentOrderId: string;
  accountId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  fromStatus: string;
  toStatus: string;
  reason: string;
  customerMessage: string;
  beforeSnapshot: object;
  afterSnapshot: object;
  auditBefore: object;
  auditAfter: object;
  response: object;
}): Promise<void> {
  await client.query(`INSERT INTO shipment_fulfillment_events
    (shipment_order_id,action,from_status,to_status,actor_account_id,actor_role,
      reason,customer_message,before_snapshot,after_snapshot,idempotency_scope,
      idempotency_key,request_fingerprint)
    VALUES ($1,'ADMIN_CORRECT',$2,$3,$4::uuid,'admin',$5,$6,$7::jsonb,$8::jsonb,
      $4::uuid::text,$9,$10)`, [
    input.shipmentOrderId, input.fromStatus, input.toStatus, input.accountId,
    input.reason, input.customerMessage, JSON.stringify(input.beforeSnapshot),
    JSON.stringify(input.afterSnapshot), input.idempotencyKey, input.requestFingerprint,
  ]);
  await client.query(`INSERT INTO audit_events
    (actor_account_id,active_role,action,target_type,target_id,details)
    VALUES ($1,'admin','fulfillment.admin_correction','shipment_order',$2,$3::jsonb)`, [
    input.accountId, input.shipmentOrderId,
    JSON.stringify({
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      customerMessage: input.customerMessage,
      before: input.auditBefore,
      after: input.auditAfter,
      response: input.response,
    }),
  ]);
}
