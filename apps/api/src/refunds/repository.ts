import type { PoolClient, QueryResultRow } from 'pg';

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
