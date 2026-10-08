import type { PoolClient } from 'pg';
import type { SettlementQuery } from './query.js';
import { summarizeSettlement, type SettlementKind, type SettlementReportItem } from './summary.js';

type Row = Omit<SettlementReportItem, 'kind' | 'amountWon' | 'occurredAt'> & {
  kind: string;
  amountWon: string;
  occurredAt: Date;
};

type CompletionRow = {
  id: string; sellerId: string; sellerName: string;
  startDate: string; endDate: string; completedAt: Date; reason: string;
};

export async function readSettlement(client: PoolClient, filter: SettlementQuery) {
  const result = await client.query<Row>(`SELECT id,seller_id AS "sellerId",
    seller_name AS "sellerName",seller_category_id AS "sellerCategoryId",
    seller_category_name AS "sellerCategoryName",kind,amount_won::text AS "amountWon",
    occurred_at AS "occurredAt",checkout_order_id AS "checkoutOrderId",
    shipment_order_id AS "shipmentOrderId",product_id AS "productId",
    option_id AS "optionId",product_name AS "productName",option_name AS "optionName",
    source_event_kind AS "sourceEventKind",source_event_id AS "sourceEventId"
    FROM settlement_events WHERE occurred_at >= $1 AND occurred_at < $2
      AND ($3::uuid IS NULL OR seller_category_id=$3)
      AND ($4::uuid IS NULL OR seller_id=$4)
    ORDER BY seller_id,occurred_at,id`,
  [filter.start, filter.endExclusive, filter.categoryId, filter.sellerId]);
  const items: SettlementReportItem[] = result.rows.map((row) => ({
    ...row,
    kind: row.kind as SettlementKind,
    amountWon: Number(row.amountWon),
    occurredAt: row.occurredAt.toISOString(),
  }));
  const completionResult = await client.query<CompletionRow>(`SELECT period.id,
    period.seller_id AS "sellerId",seller.display_name AS "sellerName",
    period.start_date::text AS "startDate",period.end_date::text AS "endDate",
    period.completed_at AS "completedAt",period.reason
    FROM seller_settlement_periods period
    JOIN sellers seller ON seller.id=period.seller_id
    WHERE period.start_date <= $2::date AND period.end_date >= $1::date
      AND ($3::uuid IS NULL OR seller.category_id=$3)
      AND ($4::uuid IS NULL OR period.seller_id=$4)
    ORDER BY seller.display_name,period.start_date,period.id`,
  [filter.from, filter.to, filter.categoryId, filter.sellerId]);
  const completions = completionResult.rows.map((row) => ({
    ...row, completedAt: row.completedAt.toISOString(),
  }));
  return { filter: { from: filter.from, to: filter.to,
    sellerId: filter.sellerId, categoryId: filter.categoryId },
  ...summarizeSettlement(items), completions };
}
