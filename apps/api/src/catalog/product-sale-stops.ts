import type { Pool } from 'pg';
import { canAccess, type AccessContext } from '../access.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Seller requests are private until a distinct operator decision; history is retained. */
export class ProductSaleStops {
  constructor(private readonly pool: Pool) {}

  async request(actor: AccessContext, productId: string, reason: string) {
    if (!actor.sellerId || !canAccess(actor, 'request-proposal', { sellerId: actor.sellerId })) throw new Error('Forbidden');
    if (!uuid.test(productId)) throw new Error('Invalid stop target');
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) throw new Error('Stop reason required');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const product = await client.query<{ seller_id: string }>(
        'SELECT seller_id FROM products WHERE id=$1 FOR UPDATE', [productId]);
      if (product.rows[0]?.seller_id !== actor.sellerId) throw new Error('Forbidden');
      const published = await client.query('SELECT 1 FROM product_publications WHERE product_id=$1', [productId]);
      if (!published.rowCount) throw new Error('Published product required');
      const existing = await client.query<{ status: string }>(
        `SELECT status FROM product_sale_stop_requests WHERE product_id=$1 AND status IN ('pending','approved')`, [productId]);
      if (existing.rows.some((row) => row.status === 'approved')) throw new Error('Sale already stopped');
      if (existing.rows.some((row) => row.status === 'pending')) throw new Error('Pending stop request exists');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO product_sale_stop_requests(product_id,reason,requested_by_account_id)
         VALUES ($1,$2,$3) RETURNING id`, [productId, reason.trim(), actor.accountId]);
      await client.query(
        `INSERT INTO audit_events(actor_account_id,active_role,seller_id,action,target_type,target_id)
         VALUES ($1,'seller',$2,'product.sale_stop_request','product_sale_stop_request',$3)`,
        [actor.accountId, actor.sellerId, inserted.rows[0].id]);
      await client.query('COMMIT');
      return { requestId: inserted.rows[0].id, status: 'pending' as const };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async listOwn(actor: AccessContext) {
    if (!actor.sellerId || !canAccess(actor, 'request-proposal', { sellerId: actor.sellerId })) throw new Error('Forbidden');
    const result = await this.pool.query(
      `SELECT q.id,q.product_id AS "productId",q.status,q.reason,q.requested_at AS "requestedAt",
              q.decided_at AS "decidedAt",q.decision_reason AS "decisionReason"
       FROM product_sale_stop_requests q JOIN products p ON p.id=q.product_id
       WHERE p.seller_id=$1 ORDER BY q.requested_at DESC,q.id DESC LIMIT 100`, [actor.sellerId]);
    return result.rows;
  }

  async listPending(actor: AccessContext) {
    if (!canAccess(actor, 'approve-proposal', {})) throw new Error('Forbidden');
    const result = await this.pool.query(
      `SELECT q.id,q.product_id AS "productId",p.seller_id AS "sellerId",s.display_name AS "sellerName",
              r.title,q.reason,q.requested_at AS "requestedAt",q.requested_by_account_id AS "requestedByAccountId"
       FROM product_sale_stop_requests q JOIN products p ON p.id=q.product_id
       JOIN sellers s ON s.id=p.seller_id
       JOIN product_publications pub ON pub.product_id=p.id
       JOIN product_revisions r ON r.id=pub.revision_id
       WHERE q.status='pending' ORDER BY q.requested_at,q.id LIMIT 100`);
    return result.rows;
  }

  async approve(actor: AccessContext, requestId: string) {
    return this.decide(actor, requestId, 'approved');
  }

  async reject(actor: AccessContext, requestId: string, reason: string) {
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) throw new Error('Review reason required');
    return this.decide(actor, requestId, 'rejected', reason.trim());
  }

  private async decide(actor: AccessContext, requestId: string, decision: 'approved' | 'rejected', reason?: string) {
    if (!canAccess(actor, 'approve-proposal', {})) throw new Error('Forbidden');
    if (!uuid.test(requestId)) throw new Error('Invalid stop request');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const target = await client.query<{ product_id: string }>(
        'SELECT product_id FROM product_sale_stop_requests WHERE id=$1', [requestId]);
      if (!target.rows[0]) throw new Error('Pending stop request required');
      // Same lock order as request(): product, then request. Avoid approval/request races.
      const product = await client.query<{ seller_id: string }>(
        'SELECT seller_id FROM products WHERE id=$1 FOR UPDATE', [target.rows[0].product_id]);
      const pending = await client.query<{ status: string }>(
        'SELECT status FROM product_sale_stop_requests WHERE id=$1 FOR UPDATE', [requestId]);
      if (pending.rows[0]?.status !== 'pending') throw new Error('Pending stop request required');
      await client.query(
        `UPDATE product_sale_stop_requests SET status=$2,decided_by_account_id=$3,
         decided_at=now(),decision_reason=$4 WHERE id=$1`, [requestId, decision, actor.accountId, reason ?? null]);
      await client.query(
        `INSERT INTO audit_events(actor_account_id,active_role,seller_id,action,target_type,target_id)
         VALUES ($1,'admin',$2,$3,'product_sale_stop_request',$4)`,
        [actor.accountId, product.rows[0].seller_id, `product.sale_stop_${decision}`, requestId]);
      await client.query('COMMIT');
      return { requestId, status: decision };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
