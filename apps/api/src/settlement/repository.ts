import type { PoolClient } from 'pg';
import type { SettlementQuery } from './query.js';
import { summarizeSettlement, type SettlementKind, type SettlementReportItem } from './summary.js';

type Row = Omit<SettlementReportItem, 'kind' | 'amountWon' | 'occurredAt'> & {
  kind: string;
  amountWon: string;
  occurredAt: Date;
  recordedAt: Date;
  completionPeriodId: string | null;
  linkedPeriodId: string | null;
};

type CompletionRow = {
  id: string; sellerId: string; sellerName: string;
  startDate: string; endDate: string; completedAt: Date; reason: string;
};

export async function readSettlement(client: PoolClient, filter: SettlementQuery) {
  const result = await client.query<Row>(`SELECT event.id,event.seller_id AS "sellerId",
    event.seller_name AS "sellerName",event.seller_category_id AS "sellerCategoryId",
    event.seller_category_name AS "sellerCategoryName",event.kind,
    event.amount_won::text AS "amountWon",event.occurred_at AS "occurredAt",
    event.recorded_at AS "recordedAt",event.reason,
    event.original_event_id AS "originalEventId",
    original.kind AS "correctedKind",
    event.correction_direction AS "correctionDirection",
    coalesce(event.checkout_order_id,original.checkout_order_id) AS "checkoutOrderId",
    coalesce(event.shipment_order_id,original.shipment_order_id) AS "shipmentOrderId",
    coalesce(event.product_id,original.product_id) AS "productId",
    coalesce(event.option_id,original.option_id) AS "optionId",
    coalesce(event.product_name,original.product_name) AS "productName",
    coalesce(event.option_name,original.option_name) AS "optionName",
    event.source_event_kind AS "sourceEventKind",
    event.source_event_id AS "sourceEventId",period.id AS "completionPeriodId",
    link.period_id AS "linkedPeriodId"
    FROM settlement_events event
    LEFT JOIN settlement_events original ON original.id=event.original_event_id
    LEFT JOIN seller_settlement_periods period ON period.seller_id=event.seller_id
      AND (event.occurred_at AT TIME ZONE 'Asia/Seoul')::date
        BETWEEN period.start_date AND period.end_date
    LEFT JOIN seller_settlement_period_event_links link ON link.event_id=event.id
    WHERE event.occurred_at >= $1 AND event.occurred_at < $2
      AND ($3::uuid IS NULL OR event.seller_category_id=$3)
      AND ($4::uuid IS NULL OR event.seller_id=$4)
    ORDER BY event.seller_id,event.occurred_at,event.id`,
  [filter.start, filter.endExclusive, filter.categoryId, filter.sellerId]);
  const mapped = result.rows.map((row) => ({
    ...row,
    kind: row.kind as SettlementKind,
    amountWon: Number(row.amountWon),
    occurredAt: row.occurredAt.toISOString(),
    recordedAt: row.recordedAt?.toISOString() ?? row.occurredAt.toISOString(),
  }));
  const mainItems: SettlementReportItem[] = mapped.filter((row) =>
    !row.completionPeriodId || row.linkedPeriodId === row.completionPeriodId);
  const lateItems: SettlementReportItem[] = mapped.filter((row) =>
    row.completionPeriodId && row.linkedPeriodId !== row.completionPeriodId);
  const completionResult = await client.query<CompletionRow>(`SELECT period.id,
    period.seller_id AS "sellerId",seller.display_name AS "sellerName",
    period.start_date::text AS "startDate",period.end_date::text AS "endDate",
    period.completed_at AS "completedAt",period.reason
    FROM seller_settlement_periods period
    JOIN sellers seller ON seller.id=period.seller_id
    WHERE period.start_date <= $2::date AND period.end_date >= $1::date
      AND ($3::uuid IS NULL OR EXISTS (
        SELECT 1 FROM seller_settlement_period_event_links category_link
        JOIN settlement_events category_event ON category_event.id=category_link.event_id
        WHERE category_link.period_id=period.id AND category_event.seller_category_id=$3
      ) OR (period.seller_category_id_at_completion=$3 AND NOT EXISTS (
        SELECT 1 FROM seller_settlement_period_event_links any_link
        WHERE any_link.period_id=period.id
      )))
      AND ($4::uuid IS NULL OR period.seller_id=$4)
    ORDER BY seller.display_name,period.start_date,period.id`,
  [filter.from, filter.to, filter.categoryId, filter.sellerId]);
  const frozen = completionResult.rows.length
    ? await client.query<{ periodId: string; kind: SettlementKind; amountWon: string }>(`
      SELECT amount.period_id AS "periodId",amount.kind,
        sum(amount.amount_won)::text AS "amountWon"
      FROM (
        SELECT link.period_id,event.kind,event.amount_won
        FROM seller_settlement_period_event_links link
        JOIN settlement_events event ON event.id=link.event_id
        WHERE link.period_id=ANY($1::uuid[])
          AND ($2::uuid IS NULL OR event.seller_category_id=$2)
        UNION ALL
        SELECT link.period_id,original.kind,
          CASE WHEN correction.correction_direction='increase'
            THEN correction.amount_won ELSE -correction.amount_won END
        FROM seller_settlement_period_event_links link
        JOIN settlement_events correction ON correction.id=link.event_id
          AND correction.kind='correction'
        JOIN settlement_events original ON original.id=correction.original_event_id
        WHERE link.period_id=ANY($1::uuid[])
          AND ($2::uuid IS NULL OR correction.seller_category_id=$2)
      ) amount
      GROUP BY amount.period_id,amount.kind`,
    [completionResult.rows.map((row) => row.id), filter.categoryId])
    : { rows: [] };
  const completions = completionResult.rows.map((row) => {
    const frozenTotals = { ...summarizeSettlement([]).totals };
    for (const total of frozen.rows.filter((value) => value.periodId === row.id)) {
      const amount = Number(total.amountWon);
      if (!Number.isSafeInteger(amount) ||
          !Number.isSafeInteger(frozenTotals[total.kind] + amount))
        throw new Error('Settlement amount overflow');
      frozenTotals[total.kind] += amount;
    }
    return { ...row, completedAt: row.completedAt.toISOString(), frozenTotals };
  });
  return { filter: { from: filter.from, to: filter.to,
    sellerId: filter.sellerId, categoryId: filter.categoryId },
  ...summarizeSettlement(mainItems),
  lateGroups: summarizeSettlement(lateItems).groups,
  lateTotals: summarizeSettlement(lateItems).totals,
  completions };
}
