import type { PoolClient, QueryResultRow } from 'pg';
import { allocateIncrementalRefundWon } from './allocation.js';

export type RefundCaseView = {
  id: string;
  checkoutOrderId: string;
  shipmentOrderId: string;
  status: string;
  goodsRefundWon: number;
  shippingRefundWon: number;
  totalRefundWon: number;
  attemptId?: string;
  providerRefundId?: string;
};

export type RefundCaseSummary = {
  id: string;
  checkoutOrderId: string;
  shipmentOrderId: string;
  requesterRole: string;
  reasonCode: string;
  reason: string;
  status: string;
  goodsRefundWon: number;
  shippingRefundWon: number;
  totalRefundWon: number;
  amountFinal: boolean;
  estimateAvailable: boolean;
  requestedAt: Date;
  decidedAt: Date | null;
  completedAt: Date | null;
};

const summaryColumns = `c.id,c.checkout_order_id AS "checkoutOrderId",
  c.shipment_order_id AS "shipmentOrderId",c.requester_role AS "requesterRole",
  c.reason_code AS "reasonCode",c.reason,c.status,
  c.goods_refund_won AS "goodsRefundWon",c.shipping_refund_won AS "shippingRefundWon",
  c.total_refund_won AS "totalRefundWon",(c.status<>'REQUESTED') AS "amountFinal",
  (c.status<>'REQUESTED') AS "estimateAvailable",
  c.requested_at AS "requestedAt",c.decided_at AS "decidedAt",c.completed_at AS "completedAt"`;

export async function readRefundCase(client: PoolClient, caseId: string): Promise<RefundCaseView | null> {
  const found = await client.query<QueryResultRow & RefundCaseView>(`SELECT c.id,
    c.checkout_order_id AS "checkoutOrderId",c.shipment_order_id AS "shipmentOrderId",c.status,
    c.goods_refund_won AS "goodsRefundWon",c.shipping_refund_won AS "shippingRefundWon",
    c.total_refund_won AS "totalRefundWon",a.id AS "attemptId",
    a.provider_refund_id AS "providerRefundId"
    FROM refund_cases c LEFT JOIN LATERAL (
      SELECT id,provider_refund_id FROM refund_attempts WHERE refund_case_id=c.id
      ORDER BY created_at DESC,id DESC LIMIT 1) a ON true WHERE c.id=$1`, [caseId]);
  return found.rows[0] ?? null;
}

export async function listRefundCaseSummaries(client: PoolClient, options: {
  accountId?: string; checkoutOrderId?: string; status?: string; shipmentOrderId?: string;
  from?: Date; to?: Date;
}): Promise<RefundCaseSummary[]> {
  const values: unknown[] = [];
  const clauses: string[] = [];
  if (options.accountId) {
    values.push(options.accountId);
    clauses.push(`o.account_id=$${values.length}`);
  }
  if (options.checkoutOrderId) {
    values.push(options.checkoutOrderId);
    clauses.push(`c.checkout_order_id=$${values.length}`);
  }
  if (options.status) {
    values.push(options.status);
    clauses.push(`c.status=$${values.length}`);
  }
  if (options.shipmentOrderId) {
    values.push(options.shipmentOrderId);
    clauses.push(`c.shipment_order_id=$${values.length}`);
  }
  if (options.from) {
    values.push(options.from);
    clauses.push(`c.requested_at>=$${values.length}`);
  }
  if (options.to) {
    values.push(options.to);
    clauses.push(`c.requested_at<$${values.length}`);
  }
  const found = await client.query<QueryResultRow & RefundCaseSummary>(`SELECT ${summaryColumns}
    FROM refund_cases c JOIN checkout_orders o ON o.id=c.checkout_order_id
    ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
    ORDER BY c.requested_at DESC,c.id DESC LIMIT 500`, values);
  for (const row of found.rows) if (!row.amountFinal) Object.assign(row, await estimateRefundCase(client, row.id));
  return found.rows;
}

async function estimateRefundCase(client: PoolClient, caseId: string) {
  const target = (await client.query<{ shipmentOrderId: string; shippingFeeWon: number;
    shippingSupportWon: number; payableWon: number }>(`SELECT c.shipment_order_id AS "shipmentOrderId",
    s.shipping_fee_won AS "shippingFeeWon",s.shipping_support_won AS "shippingSupportWon",
    s.payable_won AS "payableWon" FROM refund_cases c
    JOIN shipment_orders s ON s.id=c.shipment_order_id WHERE c.id=$1`, [caseId])).rows[0];
  if (!target) return { goodsRefundWon: 0, shippingRefundWon: 0, totalRefundWon: 0,
    estimateAvailable: false };
  const lines = await client.query<{ optionId: string; requestedQuantity: number; quantity: number;
    goodsPayableWon: number; occupiedQuantity: number }>(`SELECT ol.option_id AS "optionId",
    coalesce(t.quantity,0)::int AS "requestedQuantity",ol.quantity,
    ol.goods_payable_won AS "goodsPayableWon",
    coalesce(sum(CASE WHEN prior.status IN ('APPROVED','PROCESSING','REFUNDED','REVIEW_REQUIRED')
      THEN prior_line.quantity ELSE 0 END),0)::int AS "occupiedQuantity"
    FROM shipment_order_lines ol
    LEFT JOIN refund_case_lines t ON t.shipment_order_id=ol.shipment_order_id
      AND t.option_id=ol.option_id AND t.refund_case_id=$2
    LEFT JOIN refund_case_lines prior_line ON prior_line.shipment_order_id=ol.shipment_order_id
      AND prior_line.option_id=ol.option_id AND prior_line.refund_case_id<>$2
    LEFT JOIN refund_cases prior ON prior.id=prior_line.refund_case_id
    WHERE ol.shipment_order_id=$1
    GROUP BY ol.option_id,t.quantity,ol.quantity,ol.goods_payable_won ORDER BY ol.option_id`,
  [target.shipmentOrderId, caseId]);
  if (lines.rows.some((line) => line.occupiedQuantity + line.requestedQuantity > line.quantity))
    return { goodsRefundWon: 0, shippingRefundWon: 0, totalRefundWon: 0,
      estimateAvailable: false };
  let goodsRefundWon = 0;
  for (const line of lines.rows) if (line.requestedQuantity) goodsRefundWon += allocateIncrementalRefundWon(
    line.goodsPayableWon, line.quantity, line.occupiedQuantity, line.requestedQuantity);
  const fullShipment = lines.rows.every((line) =>
    line.occupiedQuantity + line.requestedQuantity === line.quantity);
  let shippingRefundWon = 0;
  if (fullShipment) {
    const blocked = await client.query(`SELECT 1 FROM refund_cases WHERE shipment_order_id=$1
      AND id<>$2 AND status IN ('APPROVED','PROCESSING','REVIEW_REQUIRED') LIMIT 1`,
    [target.shipmentOrderId, caseId]);
    const priorShipping = (await client.query<{ amount: number }>(`SELECT
      coalesce(sum(shipping_refund_won),0)::int AS amount FROM refund_cases
      WHERE shipment_order_id=$1 AND id<>$2 AND status='REFUNDED'`,
    [target.shipmentOrderId, caseId])).rows[0].amount;
    if (blocked.rowCount) return { goodsRefundWon: 0, shippingRefundWon: 0, totalRefundWon: 0,
      estimateAvailable: false };
    if (!priorShipping)
      shippingRefundWon = target.shippingFeeWon - target.shippingSupportWon;
  }
  const totalRefundWon = goodsRefundWon + shippingRefundWon;
  return totalRefundWon <= target.payableWon
    ? { goodsRefundWon, shippingRefundWon, totalRefundWon, estimateAvailable: true }
    : { goodsRefundWon: 0, shippingRefundWon: 0, totalRefundWon: 0,
      estimateAvailable: false };
}

async function readSummary(client: PoolClient, caseId: string) {
  const found = await client.query<QueryResultRow & RefundCaseSummary>(
    `SELECT ${summaryColumns} FROM refund_cases c WHERE c.id=$1`, [caseId]);
  const summary = found.rows[0] ?? null;
  if (summary && !summary.amountFinal) Object.assign(summary, await estimateRefundCase(client, caseId));
  return summary;
}

async function readLines(client: PoolClient, caseId: string, admin: boolean) {
  const found = await client.query(`SELECT l.option_id AS "optionId",ol.product_name AS "productName",
    ol.option_name AS "optionName",l.quantity,l.goods_refund_won AS "goodsRefundWon"
    ${admin ? ',l.restock_mode AS "restockMode",l.restocked_quantity AS "restockedQuantity"' : ''}
    FROM refund_case_lines l JOIN shipment_order_lines ol
      ON ol.shipment_order_id=l.shipment_order_id AND ol.option_id=l.option_id
    WHERE l.refund_case_id=$1 ORDER BY l.option_id`, [caseId]);
  return found.rows;
}

export async function readCustomerRefundCase(client: PoolClient, caseId: string) {
  const summary = await readSummary(client, caseId);
  if (!summary) return null;
  const lines = await readLines(client, caseId, false);
  const history = await client.query(`SELECT from_status AS "fromStatus",to_status AS "toStatus",
    created_at AS "createdAt" FROM refund_case_events WHERE refund_case_id=$1
    ORDER BY created_at,id`, [caseId]);
  return { ...summary, lines, history: history.rows };
}

export async function readAdminRefundCase(client: PoolClient, caseId: string) {
  const summary = await readSummary(client, caseId);
  if (!summary) return null;
  const internal = (await client.query(`SELECT pre_shipment_evidence AS "preShipmentEvidence",
    pre_shipment_confirmed_by AS "preShipmentConfirmedBy",
    pre_shipment_confirmed_at AS "preShipmentConfirmedAt",policy_code AS "policyCode",
    policy_version AS "policyVersion",decision_by AS "decisionBy",
    decision_reason AS "decisionReason" FROM refund_cases WHERE id=$1`, [caseId])).rows[0];
  const lines = await readLines(client, caseId, true);
  const history = (await client.query(`SELECT from_status AS "fromStatus",to_status AS "toStatus",
    actor_account_id AS "actorAccountId",actor_role AS "actorRole",reason,
    refund_event_id AS "refundEventId",created_at AS "createdAt"
    FROM refund_case_events WHERE refund_case_id=$1 ORDER BY created_at,id`, [caseId])).rows;
  const attempts = (await client.query(`SELECT id,payment_attempt_id AS "paymentAttemptId",provider,
    provider_refund_id AS "providerRefundId",requested_won AS "requestedWon",status,
    created_at AS "createdAt",ended_at AS "endedAt"
    FROM refund_attempts WHERE refund_case_id=$1 ORDER BY created_at,id`, [caseId])).rows;
  for (const attempt of attempts) attempt.events = (await client.query(`SELECT id,
    provider_event_id AS "providerEventId",outcome,amount_won AS "amountWon",
    processing_status AS "processingStatus",received_at AS "receivedAt",processed_at AS "processedAt"
    FROM refund_events WHERE refund_attempt_id=$1 ORDER BY received_at,id`, [attempt.id])).rows;
  return { ...summary, ...internal, lines, history, attempts };
}
