import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { allocateOrderLineDiscountWon } from './line-allocation.js';
import { getOrderSnapshot, insertOrderSnapshot, type OrderLineSnapshot,
  type PendingOrderSnapshot, type PendingOrderView } from './repository.js';
import { PromotionUsageService, type PromotionSelection } from '../promotions/usage-service.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type SubmitInput = { reservationId: string; addressId: string;
  selections: PromotionSelection; expectedPayableWon: number; idempotencyKey: string };
type OptionRow = { optionId: string; productId: string; sellerId: string;
  productName: string; optionName: string; unitPriceWon: number;
  shippingMode: 'seller_direct' | 'owool_fulfillment'; sellableQuantity: number };

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  return value;
}
function fingerprint(input: SubmitInput): string {
  return createHash('sha256').update(JSON.stringify(canonical({ reservationId: input.reservationId,
    addressId: input.addressId, selections: input.selections,
    expectedPayableWon: input.expectedPayableWon }))).digest('hex');
}
async function lockOptions(client: PoolClient, reservationId: string): Promise<Map<string, OptionRow>> {
  const requested = await client.query<{ optionId: string }>(`SELECT option_id AS "optionId"
    FROM checkout_reservation_lines WHERE reservation_id=$1 ORDER BY option_id`, [reservationId]);
  if (!requested.rowCount || requested.rows.length > 100) throw new Error('Reservation unavailable');
  const optionIds = requested.rows.map((row) => row.optionId);
  const products = await client.query<{ id: string }>(`SELECT DISTINCT r.product_id AS id
    FROM product_options o JOIN product_revisions r ON r.id=o.revision_id
    WHERE o.id=ANY($1::uuid[]) ORDER BY id`, [optionIds]);
  for (const { id } of products.rows) await client.query('SELECT id FROM products WHERE id=$1 FOR UPDATE', [id]);
  for (const id of optionIds) await client.query('SELECT id FROM product_options WHERE id=$1 FOR UPDATE', [id]);
  for (const id of optionIds) await client.query(
    'SELECT option_id FROM inventory_levels WHERE option_id=$1 FOR UPDATE', [id]);
  const result = await client.query<OptionRow>(`SELECT o.id AS "optionId",p.id AS "productId",
    p.seller_id AS "sellerId",r.title AS "productName",o.name AS "optionName",
    o.price_won AS "unitPriceWon",r.shipping_mode AS "shippingMode",
    coalesce(i.sellable_quantity,0)::int AS "sellableQuantity"
    FROM product_options o JOIN product_revisions r ON r.id=o.revision_id
    JOIN products p ON p.id=r.product_id
    LEFT JOIN inventory_levels i ON i.option_id=o.id
    WHERE o.id=ANY($1::uuid[])`, [optionIds]);
  if (result.rows.length !== optionIds.length) throw new Error('Reserved product changed');
  return new Map(result.rows.map((row) => [row.optionId, row]));
}

/** Create exactly one pending payment target from a still-valid owned reservation. */
export async function submitPendingOrderWithDisposition(pool: Pool, accountId: string,
  input: SubmitInput): Promise<{ view: PendingOrderView; created: boolean }> {
  if (!uuid.test(accountId) || !input || !uuid.test(input.reservationId) ||
      !uuid.test(input.addressId) || !uuid.test(input.idempotencyKey) ||
      !Number.isSafeInteger(input.expectedPayableWon) || input.expectedPayableWon < 0 ||
      input.expectedPayableWon > 2147483647 || !input.selections ||
      typeof input.selections !== 'object' || Array.isArray(input.selections))
    throw new Error('Invalid order request');
  const requestFingerprint = fingerprint(input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [accountId]);
    if (!account.rowCount) throw new Error('Order unavailable');
    const previous = await client.query<{ id: string; requestFingerprint: string }>(
      `SELECT id,request_fingerprint AS "requestFingerprint" FROM checkout_orders
       WHERE account_id=$1 AND idempotency_key=$2`, [accountId, input.idempotencyKey]);
    if (previous.rows[0]) {
      if (previous.rows[0].requestFingerprint !== requestFingerprint) throw new Error('Order conflict');
      const prior = await getOrderSnapshot(client, accountId, previous.rows[0].id);
      if (!prior) throw new Error('Order unavailable');
      await client.query('COMMIT');
      return { view: prior, created: false };
    }
    const reservation = await client.query<{ expiresAt: Date; status: string }>(
      `SELECT expires_at AS "expiresAt",status FROM checkout_reservations
       WHERE id=$1 AND account_id=$2 FOR UPDATE`, [input.reservationId, accountId]);
    const hold = reservation.rows[0];
    if (!hold || hold.status !== 'ACTIVE' || hold.expiresAt <= new Date())
      throw new Error('Reservation unavailable');
    const already = await client.query('SELECT id FROM checkout_orders WHERE reservation_id=$1',
      [input.reservationId]);
    if (already.rowCount) throw new Error('Order conflict');
    const address = await client.query<{ id: string; recipientName: string; phone: string;
      postalCode: string; line1: string; line2: string }>(`SELECT id,recipient_name AS "recipientName",
      phone,postal_code AS "postalCode",line1,line2 FROM customer_addresses
      WHERE id=$1 AND account_id=$2 AND deleted_at IS NULL FOR SHARE`,
    [input.addressId, accountId]);
    if (!address.rows[0]) throw new Error('Address unavailable');
    const options = await lockOptions(client, input.reservationId);
    const { uses, quote, goodsRule } = await new PromotionUsageService(pool).holdForOrderInTransaction(
      client, accountId, input.reservationId, input.selections,
      input.idempotencyKey, hold.expiresAt);
    if (quote.payableTotalWon !== input.expectedPayableWon) throw new Error('Order conflict');
    const targetIds = new Set(goodsRule?.targetIds ?? []);
    const shipments: PendingOrderSnapshot['shipments'] = quote.shipments.map((shipment) => {
      const eligible = shipment.lines.map((line) => ({ optionId: line.optionId,
        eligibleGoodsWon: !goodsRule || goodsRule.scope === 'all' ||
          (goodsRule.scope === 'sellers' && targetIds.has(line.sellerId)) ||
          (goodsRule.scope === 'options' && targetIds.has(line.optionId))
          ? line.quantity * line.unitPriceWon : 0 }));
      const discounts = new Map(allocateOrderLineDiscountWon(eligible, shipment.discountWon)
        .map((item) => [item.optionId, item.discountWon]));
      const lines: OrderLineSnapshot[] = shipment.lines.map((line) => {
        const current = options.get(line.optionId);
        if (!current || current.sellerId !== line.sellerId || current.shippingMode !== line.shippingMode ||
            current.unitPriceWon !== line.unitPriceWon || current.sellableQuantity < line.quantity)
          throw new Error('Reserved product changed');
        const goodsDiscountWon = discounts.get(line.optionId) ?? 0;
        return { productId: current.productId, optionId: line.optionId,
          sellerId: current.sellerId, productName: current.productName,
          optionName: current.optionName, unitPriceWon: line.unitPriceWon,
          quantity: line.quantity, goodsDiscountWon,
          goodsPayableWon: line.unitPriceWon * line.quantity - goodsDiscountWon };
      });
      const goodsUse = uses.find((item) => item.shipmentKey === null);
      const shippingUse = uses.find((item) => item.shipmentKey === shipment.key);
      return {
        key: shipment.key, shippingMode: shipment.shippingMode, sellerId: shipment.sellerId,
        goodsWon: shipment.goodsWon, goodsDiscountWon: shipment.discountWon,
        shippingFeeWon: shipment.shippingWon, shippingSupportWon: shipment.supportWon,
        payableWon: shipment.payableTotalWon, lines,
        promotions: [
          ...(goodsUse && shipment.discountWon > 0 ? [{ useId: goodsUse.id,
            campaignId: goodsUse.campaignId, versionId: goodsUse.versionId,
            kind: 'goods_discount' as const, amountWon: shipment.discountWon }] : []),
          ...(shippingUse && shipment.supportWon > 0 ? [{ useId: shippingUse.id,
            campaignId: shippingUse.campaignId, versionId: shippingUse.versionId,
            kind: 'shipping_support' as const, amountWon: shipment.supportWon }] : []),
        ],
      };
    });
    const due = await client.query<{ valid: boolean }>(
      'SELECT $1::timestamptz > clock_timestamp() AS valid', [hold.expiresAt]);
    if (!due.rows[0].valid) throw new Error('Reservation unavailable');
    const snapshot: PendingOrderSnapshot = {
      accountId, reservationId: input.reservationId, idempotencyKey: input.idempotencyKey,
      requestFingerprint, address: address.rows[0], expiresAt: hold.expiresAt,
      goodsWon: quote.goodsWon, goodsDiscountWon: quote.discountWon,
      shippingFeeWon: quote.shippingWon, shippingSupportWon: quote.supportWon,
      payableWon: quote.payableTotalWon, shipments,
    };
    const order = await insertOrderSnapshot(client, snapshot);
    await client.query(`INSERT INTO audit_events
      (actor_account_id,active_role,action,target_type,target_id,details)
      VALUES ($1,'customer','pending_order_created','checkout_order',$2,$3::jsonb)`,
    [accountId, order.id, JSON.stringify({ reservationId: input.reservationId })]);
    await client.query('COMMIT');
    return { view: order, created: true };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505')
      throw new Error('Order conflict');
    throw error;
  } finally { client.release(); }
}

export async function submitPendingOrder(pool: Pool, accountId: string,
  input: SubmitInput): Promise<PendingOrderView> {
  return (await submitPendingOrderWithDisposition(pool, accountId, input)).view;
}
