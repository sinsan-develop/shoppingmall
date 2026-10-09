import type { PoolClient } from 'pg';
import { buildRefundOccurrences, buildSaleOccurrences, type SaleOccurrenceInput,
  type SettlementOccurrence } from './occurrence.js';

type PaidInput = { orderId: string; eventId: string; paidAt: Date; payableWon: number };
type ShipmentRow = { id: string; shippingFeeWon: number; shippingSupportWon: number;
  fulfillmentSellerId: string; fulfillmentSellerName: string;
  fulfillmentCategoryId: string; fulfillmentCategoryName: string };
type LineRow = { shipmentOrderId: string; productId: string; optionId: string;
  productName: string; optionName: string; unitPriceWon: number; quantity: number;
  goodsDiscountWon: number; producerId: string; producerName: string;
  producerCategoryId: string; producerCategoryName: string };
type RefundRow = { orderId: string; shipmentOrderId: string; goodsWon: number;
  shippingWon: number; totalWon: number; eventAt: Date;
  fulfillmentSellerId: string; fulfillmentSellerName: string;
  fulfillmentCategoryId: string; fulfillmentCategoryName: string };
type RefundLineRow = { productId: string; optionId: string; productName: string;
  optionName: string; goodsRefundWon: number; producerId: string; producerName: string;
  producerCategoryId: string; producerCategoryName: string };

async function insertOccurrences(client: PoolClient, entries: SettlementOccurrence[]) {
  for (const entry of entries) {
    await client.query(`INSERT INTO settlement_events
      (dedupe_key,kind,amount_won,occurred_at,seller_id,seller_name,
       seller_category_id,seller_category_name,checkout_order_id,shipment_order_id,
       product_id,option_id,product_name,option_name,source_event_kind,source_event_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, [
      entry.dedupeKey, entry.kind, entry.amountWon, entry.occurredAt,
      entry.sellerId, entry.sellerName, entry.sellerCategoryId, entry.sellerCategoryName,
      entry.checkoutOrderId, entry.shipmentOrderId, entry.productId, entry.optionId,
      entry.productName, entry.optionName, entry.sourceEventKind, entry.sourceEventId,
    ]);
  }
}

export async function recordPaidSettlement(client: PoolClient, input: PaidInput): Promise<void> {
  if (!(input.paidAt instanceof Date) || !Number.isFinite(input.paidAt.getTime()) ||
      !Number.isSafeInteger(input.payableWon) || input.payableWon < 0) {
    throw new Error('Invalid settlement occurrence');
  }
  const shipments = (await client.query<ShipmentRow>(`SELECT sh.id,
    sh.shipping_fee_won AS "shippingFeeWon",
    sh.shipping_support_won AS "shippingSupportWon",
    f.fulfillment_seller_id AS "fulfillmentSellerId",
    seller.display_name AS "fulfillmentSellerName",
    category.id AS "fulfillmentCategoryId",category.name AS "fulfillmentCategoryName"
    FROM shipment_orders sh JOIN shipment_fulfillments f ON f.shipment_order_id=sh.id
    JOIN sellers seller ON seller.id=f.fulfillment_seller_id
    JOIN seller_categories category ON category.id=seller.category_id
    WHERE sh.checkout_order_id=$1 ORDER BY sh.id`, [input.orderId])).rows;
  const lines = (await client.query<LineRow>(`SELECT line.shipment_order_id AS "shipmentOrderId",
    line.product_id AS "productId",line.option_id AS "optionId",
    line.product_name AS "productName",line.option_name AS "optionName",
    line.unit_price_won AS "unitPriceWon",line.quantity,
    line.goods_discount_won AS "goodsDiscountWon",seller.id AS "producerId",
    seller.display_name AS "producerName",category.id AS "producerCategoryId",
    category.name AS "producerCategoryName"
    FROM shipment_order_lines line JOIN shipment_orders sh ON sh.id=line.shipment_order_id
    JOIN sellers seller ON seller.id=line.seller_id
    JOIN seller_categories category ON category.id=seller.category_id
    WHERE sh.checkout_order_id=$1 ORDER BY line.shipment_order_id,line.option_id`,
  [input.orderId])).rows;
  const payload: SaleOccurrenceInput = {
    paymentEventId: input.eventId, orderId: input.orderId,
    occurredAt: input.paidAt.toISOString(),
    shipments: shipments.map((shipment) => ({
      id: shipment.id, shippingFeeWon: shipment.shippingFeeWon,
      shippingSupportWon: shipment.shippingSupportWon,
      fulfillmentSeller: { id: shipment.fulfillmentSellerId,
        name: shipment.fulfillmentSellerName, categoryId: shipment.fulfillmentCategoryId,
        categoryName: shipment.fulfillmentCategoryName },
      lines: lines.filter((line) => line.shipmentOrderId === shipment.id).map((line) => ({
        productId: line.productId, optionId: line.optionId, productName: line.productName,
        optionName: line.optionName, unitPriceWon: line.unitPriceWon, quantity: line.quantity,
        goodsDiscountWon: line.goodsDiscountWon,
        producer: { id: line.producerId, name: line.producerName,
          categoryId: line.producerCategoryId, categoryName: line.producerCategoryName },
      })),
    })),
  };
  const entries = buildSaleOccurrences(payload);
  if (lines.length !== payload.shipments.reduce((sum, shipment) => sum + shipment.lines.length, 0)) {
    throw new Error('Settlement amount mismatch');
  }
  const amounts = { sale: 0, goods_discount: 0, shipping_fee: 0, shipping_support: 0 };
  for (const entry of entries) {
    if (entry.kind in amounts) amounts[entry.kind as keyof typeof amounts] += entry.amountWon;
  }
  const reconciled = amounts.sale - amounts.goods_discount + amounts.shipping_fee - amounts.shipping_support;
  if (!Object.values(amounts).every(Number.isSafeInteger) || !Number.isSafeInteger(reconciled) ||
      reconciled !== input.payableWon) throw new Error('Settlement amount mismatch');
  await insertOccurrences(client, entries);
}

export async function recordRefundSettlement(client: PoolClient,
  input: { caseId: string; eventId: string }): Promise<void> {
  const refund = (await client.query<RefundRow>(`SELECT
    refund.checkout_order_id AS "orderId",refund.shipment_order_id AS "shipmentOrderId",
    refund.goods_refund_won AS "goodsWon",refund.shipping_refund_won AS "shippingWon",
    refund.total_refund_won AS "totalWon",event.received_at AS "eventAt",
    f.fulfillment_seller_id AS "fulfillmentSellerId",
    seller.display_name AS "fulfillmentSellerName",
    category.id AS "fulfillmentCategoryId",category.name AS "fulfillmentCategoryName"
    FROM refund_cases refund JOIN refund_attempts attempt
      ON attempt.refund_case_id=refund.id
    JOIN refund_events event ON event.refund_attempt_id=attempt.id
      AND event.id=$2 AND event.outcome='SUCCEEDED'
      AND event.amount_won=refund.total_refund_won
    JOIN shipment_fulfillments f
      ON f.shipment_order_id=refund.shipment_order_id
    JOIN sellers seller ON seller.id=f.fulfillment_seller_id
    JOIN seller_categories category ON category.id=seller.category_id
    WHERE refund.id=$1 AND refund.status IN ('REFUNDED','REVIEW_REQUIRED')`,
  [input.caseId, input.eventId])).rows[0];
  if (!refund || !(refund.eventAt instanceof Date) ||
      !Number.isFinite(refund.eventAt.getTime())) {
    throw new Error('Settlement refund unavailable');
  }
  const lines = (await client.query<RefundLineRow>(`SELECT
    orderLine.product_id AS "productId",refundLine.option_id AS "optionId",
    orderLine.product_name AS "productName",orderLine.option_name AS "optionName",
    refundLine.goods_refund_won AS "goodsRefundWon",seller.id AS "producerId",
    seller.display_name AS "producerName",category.id AS "producerCategoryId",
    category.name AS "producerCategoryName"
    FROM refund_case_lines refundLine JOIN shipment_order_lines orderLine
      ON orderLine.shipment_order_id=refundLine.shipment_order_id
      AND orderLine.option_id=refundLine.option_id
    JOIN sellers seller ON seller.id=orderLine.seller_id
    JOIN seller_categories category ON category.id=seller.category_id
    WHERE refundLine.refund_case_id=$1 ORDER BY refundLine.option_id`, [input.caseId])).rows;
  const entries = buildRefundOccurrences({ refundEventId: input.eventId,
    orderId: refund.orderId, shipmentOrderId: refund.shipmentOrderId,
    occurredAt: refund.eventAt.toISOString(),
    fulfillmentSeller: { id: refund.fulfillmentSellerId,
      name: refund.fulfillmentSellerName, categoryId: refund.fulfillmentCategoryId,
      categoryName: refund.fulfillmentCategoryName },
    shippingRefundWon: refund.shippingWon,
    lines: lines.map((line) => ({ productId: line.productId, optionId: line.optionId,
      productName: line.productName, optionName: line.optionName,
      goodsRefundWon: line.goodsRefundWon,
      producer: { id: line.producerId, name: line.producerName,
        categoryId: line.producerCategoryId, categoryName: line.producerCategoryName } })),
  });
  const goodsSum = lines.reduce((sum, line) => sum + line.goodsRefundWon, 0);
  const total = goodsSum + refund.shippingWon;
  if (!Number.isSafeInteger(goodsSum) || !Number.isSafeInteger(total) ||
      goodsSum !== refund.goodsWon || total !== refund.totalWon) {
    throw new Error('Settlement amount mismatch');
  }
  await insertOccurrences(client, entries);
}
