import type { Pool, PoolClient } from 'pg';
import type { MonitoringFilter } from './query.js';

type Summary = {
  orderCount: number;
  goodsSalesWon: number;
  publishedOptionCount: number;
  soldOutOptionCount: number;
  claimCount: number;
  pendingApprovalCount: number;
  openQuestionCount: number;
};
type PendingApproval = { id: string; kind: string; sellerId: string; createdAt: string };
type StockIssue = { optionId: string; productId: string; sellerId: string; sellableQuantity: number };
type OpenQuestion = { id: string; productId: string; sellerId: string; createdAt: string };
type OpenClaim = { id: string; shipmentOrderId: string; sellerId: string; status: string; createdAt: string };
type FailedPayment = {
  attemptId: string; orderId: string; status: string; requestedWon: number; createdAt: string;
};
type Unshipped = {
  shipmentOrderId: string; orderId: string; sellerId: string; sellerName: string;
  status: string; expectedShipDate: string; paidAt: string;
};
export type MonitoringOverview = {
  filter: Pick<MonitoringFilter, 'from' | 'to' | 'sellerId' | 'orderStatus' | 'claimStatus'>;
  asOf: string;
  summary: Summary;
  failedPayments: FailedPayment[];
  unshipped: Unshipped[];
  pendingApprovals: PendingApproval[];
  stockIssues: StockIssue[];
  openQuestions: OpenQuestion[];
  openClaims: OpenClaim[];
};

const approvalsSql = `SELECT request.id,'stock'::text AS kind,p.seller_id AS "sellerId",
    request.created_at AS "createdAt" FROM stock_change_requests request
    JOIN product_options opt ON opt.id=request.option_id
    JOIN product_revisions rev ON rev.id=opt.revision_id JOIN products p ON p.id=rev.product_id
    WHERE request.status='pending' AND ($1::uuid IS NULL OR p.seller_id=$1)
  UNION ALL SELECT rev.id,'product',p.seller_id,rev.proposed_at FROM product_revisions rev
    JOIN products p ON p.id=rev.product_id
    WHERE rev.status='pending' AND ($1::uuid IS NULL OR p.seller_id=$1)
  UNION ALL SELECT request.id,'shipping',request.seller_id,request.requested_at
    FROM seller_shipping_policy_requests request
    WHERE request.status='pending' AND ($1::uuid IS NULL OR request.seller_id=$1)
  UNION ALL SELECT request.id,'sale_stop',p.seller_id,request.requested_at
    FROM product_sale_stop_requests request JOIN products p ON p.id=request.product_id
    WHERE request.status='pending' AND ($1::uuid IS NULL OR p.seller_id=$1)`;

async function number(client: PoolClient, statement: string, values: unknown[]): Promise<number> {
  const result = await client.query<{ value: string }>(statement, values);
  return Number(result.rows[0]?.value ?? 0);
}

export async function readMonitoring(pool: Pool, filter: MonitoringFilter): Promise<MonitoringOverview> {
  const client = await pool.connect();
  const values = [filter.start, filter.endExclusive, filter.sellerId, filter.orderStatus, filter.claimStatus];
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const asOf = (await client.query<{ now: Date }>('SELECT transaction_timestamp() AS now')).rows[0].now;
    const orderCount = await number(client, `SELECT count(DISTINCT o.id)::text AS value
      FROM checkout_orders o WHERE o.created_at >= $1 AND o.created_at < $2
      AND ($4::text IS NULL OR o.status=$4)
      AND ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM shipment_orders sh
        JOIN shipment_order_lines line ON line.shipment_order_id=sh.id
        WHERE sh.checkout_order_id=o.id AND line.seller_id=$3))`, values.slice(0, 4));
    const goodsSalesWon = await number(client, `SELECT coalesce(sum(line.goods_payable_won),0)::text AS value
      FROM shipment_order_lines line JOIN shipment_orders sh ON sh.id=line.shipment_order_id
      JOIN checkout_orders o ON o.id=sh.checkout_order_id
      WHERE o.status='PAID' AND sh.status='PAID' AND o.paid_at >= $1 AND o.paid_at < $2
      AND ($3::uuid IS NULL OR line.seller_id=$3)
      AND ($4::text IS NULL OR $4='PAID')`, values.slice(0, 4));
    const inventory = (await client.query<{ published: string; sold_out: string }>(
      `SELECT count(*)::text AS published,
        count(*) FILTER (WHERE inv.sellable_quantity=0)::text AS sold_out
       FROM product_publications pub JOIN products p ON p.id=pub.product_id
       JOIN product_options opt ON opt.revision_id=pub.revision_id
       JOIN inventory_levels inv ON inv.option_id=opt.id
       WHERE ($1::uuid IS NULL OR p.seller_id=$1)`, [filter.sellerId])).rows[0];
    const claimCount = await number(client, `SELECT count(*)::text AS value FROM support_claims claim
      WHERE claim.created_at >= $1 AND claim.created_at < $2
      AND ($3::uuid IS NULL OR claim.seller_id=$3)
      AND ($4::text IS NULL OR claim.status=$4)`,
    [filter.start, filter.endExclusive, filter.sellerId, filter.claimStatus]);
    const pendingApprovalCount = await number(client,
      `SELECT count(*)::text AS value FROM (${approvalsSql}) pending`, [filter.sellerId]);
    const pendingApprovals = (await client.query<PendingApproval>(
      `SELECT * FROM (${approvalsSql}) pending ORDER BY "createdAt" DESC,id DESC LIMIT 50`,
      [filter.sellerId])).rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString() }));
    const stockIssues = (await client.query<StockIssue>(`SELECT opt.id AS "optionId",
      p.id AS "productId",p.seller_id AS "sellerId",inv.sellable_quantity AS "sellableQuantity"
      FROM product_publications pub JOIN products p ON p.id=pub.product_id
      JOIN product_options opt ON opt.revision_id=pub.revision_id
      JOIN inventory_levels inv ON inv.option_id=opt.id
      WHERE inv.sellable_quantity=0 AND ($1::uuid IS NULL OR p.seller_id=$1)
      ORDER BY opt.id DESC LIMIT 50`, [filter.sellerId])).rows;
    const openQuestionCount = await number(client, `SELECT count(*)::text AS value FROM support_questions q
      WHERE q.status='OPEN' AND ($1::uuid IS NULL OR q.seller_id=$1)`, [filter.sellerId]);
    const openQuestions = (await client.query<{
      id: string; productId: string; sellerId: string; createdAt: Date;
    }>(`SELECT q.id,q.product_id AS "productId",q.seller_id AS "sellerId",
      q.created_at AS "createdAt" FROM support_questions q
      WHERE q.status='OPEN' AND ($1::uuid IS NULL OR q.seller_id=$1)
      ORDER BY q.created_at DESC,q.id DESC LIMIT 50`, [filter.sellerId])).rows.map((row) => ({
      ...row, createdAt: row.createdAt.toISOString(),
    }));
    const openClaims = (await client.query<{
      id: string; shipmentOrderId: string; sellerId: string; status: string; createdAt: Date;
    }>(`SELECT claim.id,claim.shipment_order_id AS "shipmentOrderId",
      claim.seller_id AS "sellerId",claim.status,claim.created_at AS "createdAt"
      FROM support_claims claim
      WHERE claim.status IN ('REQUESTED','SELLER_REPLIED','APPROVED','REFUND_PROCESSING','REVIEW_REQUIRED')
        AND ($1::uuid IS NULL OR claim.seller_id=$1)
      ORDER BY claim.created_at DESC,claim.id DESC LIMIT 50`, [filter.sellerId])).rows.map((row) => ({
      ...row, createdAt: row.createdAt.toISOString(),
    }));
    const failedPayments = (await client.query<{
      attemptId: string; orderId: string; status: string; requestedWon: number; createdAt: Date;
    }>(`SELECT attempt.id AS "attemptId",o.id AS "orderId",attempt.status,
        attempt.requested_won AS "requestedWon",attempt.created_at AS "createdAt"
      FROM payment_attempts attempt JOIN checkout_orders o ON o.id=attempt.checkout_order_id
      WHERE attempt.status IN ('DECLINED','REVIEW_REQUIRED') AND o.status <> 'PAID'
        AND attempt.created_at >= $1 AND attempt.created_at < $2
        AND ($4::text IS NULL OR o.status=$4)
        AND ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM shipment_orders sh
          JOIN shipment_order_lines line ON line.shipment_order_id=sh.id
          WHERE sh.checkout_order_id=o.id AND line.seller_id=$3))
      ORDER BY attempt.created_at DESC,attempt.id DESC LIMIT 50`, values.slice(0, 4))).rows.map((row) => ({
      ...row, createdAt: row.createdAt.toISOString(),
    }));
    const unshipped = (await client.query<{
      shipmentOrderId: string; orderId: string; sellerId: string; sellerName: string;
      status: string; expectedShipDate: string; paidAt: Date;
    }>(`SELECT sh.id AS "shipmentOrderId",o.id AS "orderId",
        f.fulfillment_seller_id AS "sellerId",seller.display_name AS "sellerName",
        f.status,f.expected_ship_date AS "expectedShipDate",o.paid_at AS "paidAt"
      FROM shipment_fulfillments f JOIN shipment_orders sh ON sh.id=f.shipment_order_id
      JOIN checkout_orders o ON o.id=sh.checkout_order_id
      JOIN sellers seller ON seller.id=f.fulfillment_seller_id
      WHERE o.status='PAID' AND f.status IN ('READY','PACKING','DELAYED')
        AND o.paid_at >= $1 AND o.paid_at < $2
        AND ($3::uuid IS NULL OR f.fulfillment_seller_id=$3)
        AND ($4::text IS NULL OR $4='PAID')
      ORDER BY o.paid_at DESC,sh.id DESC LIMIT 50`, values.slice(0, 4))).rows.map((row) => ({
      ...row, paidAt: row.paidAt.toISOString(),
    }));
    await client.query('COMMIT');
    return {
      filter: { from: filter.from, to: filter.to, sellerId: filter.sellerId,
        orderStatus: filter.orderStatus, claimStatus: filter.claimStatus },
      asOf: asOf.toISOString(),
      summary: { orderCount, goodsSalesWon,
        publishedOptionCount: Number(inventory.published),
        soldOutOptionCount: Number(inventory.sold_out), claimCount,
        pendingApprovalCount, openQuestionCount },
      failedPayments, unshipped, pendingApprovals, stockIssues, openQuestions, openClaims,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
