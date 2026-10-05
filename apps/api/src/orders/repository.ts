import type { Pool, PoolClient } from 'pg';
import { insertPendingFulfillment, type FulfillmentAssignment } from '../fulfillment/repository.js';

export type OrderAmounts = {
  goodsWon: number; goodsDiscountWon: number; shippingFeeWon: number;
  shippingSupportWon: number; payableWon: number;
};
export type OrderAddress = {
  id: string; recipientName: string; phone: string; postalCode: string;
  line1: string; line2: string;
};
export type OrderLineSnapshot = {
  productId: string; optionId: string; sellerId: string;
  productName: string; optionName: string; unitPriceWon: number; quantity: number;
  goodsDiscountWon: number; goodsPayableWon: number;
};
export type OrderPromotionAllocation = {
  useId: string; campaignId: string; versionId: string;
  kind: 'goods_discount' | 'shipping_support'; amountWon: number;
};
export type ShipmentOrderSnapshot = OrderAmounts & {
  key: string; shippingMode: 'seller_direct' | 'owool_fulfillment'; sellerId: string | null;
  lines: OrderLineSnapshot[]; promotions: OrderPromotionAllocation[];
};
export type PendingOrderSnapshot = OrderAmounts & {
  accountId: string; reservationId: string; idempotencyKey: string;
  requestFingerprint: string; address: OrderAddress; expiresAt: Date;
  shipments: ShipmentOrderSnapshot[];
};
export type PendingOrderView = OrderAmounts & {
  id: string; status: 'PENDING_PAYMENT' | 'EXPIRED' | 'PAID'; createdAt: Date;
  expiresAt: Date; endedAt: Date | null; paidAt: Date | null; address: OrderAddress;
  shipments: (ShipmentOrderSnapshot & { id: string; status: 'PENDING_PAYMENT' | 'EXPIRED' | 'PAID' })[];
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxWon = 2147483647;
const invalid = () => new Error('Invalid order snapshot');
function won(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maxWon;
}
function amounts(value: OrderAmounts): boolean {
  return value && [value.goodsWon, value.goodsDiscountWon, value.shippingFeeWon,
    value.shippingSupportWon, value.payableWon].every(won) &&
    value.goodsDiscountWon <= value.goodsWon && value.shippingSupportWon <= value.shippingFeeWon &&
    value.payableWon === value.goodsWon - value.goodsDiscountWon +
      value.shippingFeeWon - value.shippingSupportWon;
}
function sum(values: number[]): number {
  const total = values.reduce((acc, value) => acc + value, 0);
  if (!won(total)) throw invalid();
  return total;
}

/** Reject impossible/mixed snapshots before the first INSERT; the caller still owns rollback. */
function validate(input: PendingOrderSnapshot): void {
  if (!input || !uuid.test(input.accountId) || !uuid.test(input.reservationId) ||
      !uuid.test(input.idempotencyKey) || !/^[0-9a-f]{64}$/.test(input.requestFingerprint) ||
      !input.address || !uuid.test(input.address.id) ||
      [input.address.recipientName, input.address.phone, input.address.postalCode,
        input.address.line1].some((part) => typeof part !== 'string' || !part.trim()) ||
      typeof input.address.line2 !== 'string' ||
      !(input.expiresAt instanceof Date) || !Number.isFinite(input.expiresAt.getTime()) ||
      input.expiresAt <= new Date() || !amounts(input) ||
      !Array.isArray(input.shipments) || input.shipments.length < 1 ||
      input.shipments.length > 100) throw invalid();
  const keys = new Set<string>();
  const options = new Set<string>();
  let pooled = 0;
  for (const shipment of input.shipments) {
    if (!shipment || !amounts(shipment) || typeof shipment.key !== 'string' ||
        keys.has(shipment.key) ||
        !((shipment.shippingMode === 'seller_direct' && uuid.test(shipment.sellerId ?? '') &&
          shipment.key === `seller_direct:${shipment.sellerId}`) ||
          (shipment.shippingMode === 'owool_fulfillment' && shipment.sellerId === null &&
            shipment.key === 'owool_fulfillment')) ||
        !Array.isArray(shipment.lines) || !shipment.lines.length ||
        !Array.isArray(shipment.promotions)) throw invalid();
    keys.add(shipment.key);
    if (shipment.shippingMode === 'owool_fulfillment') pooled += 1;
    if (pooled > 1) throw invalid();
    for (const line of shipment.lines) {
      if (!line || !uuid.test(line.productId) || !uuid.test(line.optionId) ||
          !uuid.test(line.sellerId) || options.has(line.optionId) ||
          (shipment.shippingMode === 'seller_direct' && line.sellerId !== shipment.sellerId) ||
          typeof line.productName !== 'string' || !line.productName.trim() ||
          typeof line.optionName !== 'string' || !line.optionName.trim() ||
          !won(line.unitPriceWon) || !Number.isInteger(line.quantity) ||
          line.quantity < 1 || line.quantity > 1000000 ||
          !won(line.goodsDiscountWon) || !won(line.goodsPayableWon) ||
          line.goodsPayableWon !== line.unitPriceWon * line.quantity - line.goodsDiscountWon)
        throw invalid();
      options.add(line.optionId);
    }
    if (sum(shipment.lines.map((line) => line.unitPriceWon * line.quantity)) !== shipment.goodsWon ||
        sum(shipment.lines.map((line) => line.goodsDiscountWon)) !== shipment.goodsDiscountWon ||
        sum(shipment.lines.map((line) => line.goodsPayableWon)) !==
          shipment.goodsWon - shipment.goodsDiscountWon) throw invalid();
    const allocations = new Set<string>();
    for (const promotion of shipment.promotions) {
      if (!promotion || !uuid.test(promotion.useId) || !uuid.test(promotion.campaignId) ||
          !uuid.test(promotion.versionId) ||
          !['goods_discount', 'shipping_support'].includes(promotion.kind) ||
          !won(promotion.amountWon) || promotion.amountWon === 0 ||
          allocations.has(`${promotion.useId}:${promotion.kind}`)) throw invalid();
      allocations.add(`${promotion.useId}:${promotion.kind}`);
    }
    if (sum(shipment.promotions.filter((part) => part.kind === 'goods_discount')
      .map((part) => part.amountWon)) !== shipment.goodsDiscountWon ||
      sum(shipment.promotions.filter((part) => part.kind === 'shipping_support')
        .map((part) => part.amountWon)) !== shipment.shippingSupportWon) throw invalid();
  }
  for (const field of ['goodsWon', 'goodsDiscountWon', 'shippingFeeWon',
    'shippingSupportWon', 'payableWon'] as const) {
    if (sum(input.shipments.map((shipment) => shipment[field])) !== input[field]) throw invalid();
  }
}

/** Insert the whole immutable snapshot on the caller's already-open transaction. */
export async function insertOrderSnapshot(client: PoolClient,
  input: PendingOrderSnapshot,
  fulfillmentAssignments?: ReadonlyMap<string, FulfillmentAssignment>): Promise<PendingOrderView> {
  validate(input);
  if (fulfillmentAssignments && (fulfillmentAssignments.size !== input.shipments.length ||
      input.shipments.some((shipment) => !fulfillmentAssignments.has(shipment.key)))) {
    throw invalid();
  }
  const order = await client.query<{ id: string }>(`INSERT INTO checkout_orders
    (account_id,reservation_id,idempotency_key,request_fingerprint,address_id,
      recipient_name,phone,postal_code,line1,line2,goods_won,goods_discount_won,
      shipping_fee_won,shipping_support_won,payable_won,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
  [input.accountId, input.reservationId, input.idempotencyKey, input.requestFingerprint,
    input.address.id, input.address.recipientName, input.address.phone, input.address.postalCode,
    input.address.line1, input.address.line2, input.goodsWon, input.goodsDiscountWon,
    input.shippingFeeWon, input.shippingSupportWon, input.payableWon, input.expiresAt]);
  const id = order.rows[0].id;
  for (const shipment of input.shipments) {
    const inserted = await client.query<{ id: string }>(`INSERT INTO shipment_orders
      (checkout_order_id,shipment_key,shipping_mode,seller_id,goods_won,goods_discount_won,
        shipping_fee_won,shipping_support_won,payable_won)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [id, shipment.key, shipment.shippingMode, shipment.sellerId, shipment.goodsWon,
      shipment.goodsDiscountWon, shipment.shippingFeeWon, shipment.shippingSupportWon,
      shipment.payableWon]);
    const shipmentId = inserted.rows[0].id;
    const fulfillment = fulfillmentAssignments?.get(shipment.key);
    if (fulfillment) await insertPendingFulfillment(client, shipmentId, fulfillment);
    for (const line of shipment.lines) await client.query(`INSERT INTO shipment_order_lines
      (shipment_order_id,product_id,option_id,seller_id,product_name,option_name,
        unit_price_won,quantity,goods_discount_won,goods_payable_won)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [shipmentId, line.productId, line.optionId, line.sellerId, line.productName,
      line.optionName, line.unitPriceWon, line.quantity, line.goodsDiscountWon,
      line.goodsPayableWon]);
    for (const promotion of shipment.promotions) await client.query(`INSERT INTO order_promotion_allocations
      (checkout_order_id,shipment_order_id,promotion_use_id,campaign_id,version_id,kind,amount_won)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, shipmentId, promotion.useId, promotion.campaignId, promotion.versionId,
      promotion.kind, promotion.amountWon]);
  }
  await client.query(`INSERT INTO order_status_events
    (checkout_order_id,status,actor_account_id,reason)
    VALUES ($1,'PENDING_PAYMENT',$2,'Order submitted for payment')`, [id, input.accountId]);
  const view = await getOrderSnapshot(client, input.accountId, id);
  if (!view) throw new Error('Order snapshot unavailable');
  return view;
}

/** Return only the holder's persisted snapshot; never infer price or address from live catalog. */
export async function getOrderSnapshot(client: PoolClient, accountId: string,
  id: string): Promise<PendingOrderView | null> {
  if (!uuid.test(accountId) || !uuid.test(id)) return null;
  const order = await client.query<OrderAmounts & {
    id: string; status: PendingOrderView['status']; createdAt: Date;
    expiresAt: Date; endedAt: Date | null; paidAt: Date | null; addressId: string;
    recipientName: string; phone: string; postalCode: string; line1: string; line2: string;
  }>(`SELECT id,status,created_at AS "createdAt",expires_at AS "expiresAt",
    ended_at AS "endedAt",paid_at AS "paidAt",address_id AS "addressId",recipient_name AS "recipientName",
    phone,postal_code AS "postalCode",line1,line2,goods_won AS "goodsWon",
    goods_discount_won AS "goodsDiscountWon",shipping_fee_won AS "shippingFeeWon",
    shipping_support_won AS "shippingSupportWon",payable_won AS "payableWon"
    FROM checkout_orders WHERE id=$1 AND account_id=$2`, [id, accountId]);
  const row = order.rows[0];
  if (!row) return null;
  const shipmentRows = await client.query<OrderAmounts & {
    id: string; key: string; shippingMode: ShipmentOrderSnapshot['shippingMode'];
    sellerId: string | null; status: PendingOrderView['status'];
  }>(`SELECT id,shipment_key AS key,shipping_mode AS "shippingMode",seller_id AS "sellerId",
    status,goods_won AS "goodsWon",goods_discount_won AS "goodsDiscountWon",
    shipping_fee_won AS "shippingFeeWon",shipping_support_won AS "shippingSupportWon",
    payable_won AS "payableWon" FROM shipment_orders
    WHERE checkout_order_id=$1 ORDER BY shipment_key`, [id]);
  const shipments: PendingOrderView['shipments'] = [];
  for (const shipment of shipmentRows.rows) {
    const lines = await client.query<OrderLineSnapshot>(`SELECT product_id AS "productId",
      option_id AS "optionId",seller_id AS "sellerId",product_name AS "productName",
      option_name AS "optionName",unit_price_won AS "unitPriceWon",quantity,
      goods_discount_won AS "goodsDiscountWon",goods_payable_won AS "goodsPayableWon"
      FROM shipment_order_lines WHERE shipment_order_id=$1 ORDER BY option_id`, [shipment.id]);
    const promotions = await client.query<OrderPromotionAllocation>(`SELECT
      promotion_use_id AS "useId",campaign_id AS "campaignId",version_id AS "versionId",
      kind,amount_won AS "amountWon" FROM order_promotion_allocations
      WHERE shipment_order_id=$1 ORDER BY kind,promotion_use_id`, [shipment.id]);
    shipments.push({ ...shipment, lines: lines.rows, promotions: promotions.rows });
  }
  return {
    id: row.id, status: row.status, createdAt: row.createdAt, expiresAt: row.expiresAt,
    endedAt: row.endedAt, paidAt: row.paidAt,
    address: { id: row.addressId, recipientName: row.recipientName, phone: row.phone,
      postalCode: row.postalCode, line1: row.line1, line2: row.line2 },
    goodsWon: row.goodsWon, goodsDiscountWon: row.goodsDiscountWon,
    shippingFeeWon: row.shippingFeeWon, shippingSupportWon: row.shippingSupportWon,
    payableWon: row.payableWon, shipments,
  };
}

/** Keep parent and shipment statuses on one MVCC snapshot while expiry commits. */
export async function getOrderSnapshotConsistent(pool: Pool, accountId: string,
  id: string): Promise<PendingOrderView | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const view = await getOrderSnapshot(client, accountId, id);
    await client.query('COMMIT');
    return view;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
