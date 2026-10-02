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
    const target = await this.pool.query<{ product_id: string }>(
      'SELECT product_id FROM product_sale_stop_requests WHERE id=$1', [requestId]);
    if (!target.rows[0]) throw new Error('Pending stop request required');
    // A reservation can cover several products. Discover all affected options before taking
    // product locks, then retry if a checkout committed a new option set in that interval.
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = decision === 'approved' ? await this.affectedOptions(target.rows[0].product_id) : [];
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [actor.accountId]);
        const products = await client.query<{ id: string }>(
          `SELECT DISTINCT r.product_id AS id FROM product_options o
           JOIN product_revisions r ON r.id=o.revision_id WHERE o.id=ANY($1::uuid[])`, [candidate]);
        for (const id of [...new Set([target.rows[0].product_id, ...products.rows.map((row) => row.id)])].sort()) {
          await client.query('SELECT id FROM products WHERE id=$1 FOR UPDATE', [id]);
        }
        const product = await client.query<{ seller_id: string }>(
          'SELECT seller_id FROM products WHERE id=$1', [target.rows[0].product_id]);
        const pending = await client.query<{ status: string; reason: string }>(
          'SELECT status,reason FROM product_sale_stop_requests WHERE id=$1 FOR UPDATE', [requestId]);
        if (pending.rows[0]?.status !== 'pending') throw new Error('Pending stop request required');
        if (decision === 'approved') {
          const current = await this.affectedOptions(target.rows[0].product_id, client);
          if (current.some((id) => !candidate.includes(id))) {
            await client.query('ROLLBACK');
            continue;
          }
          for (const id of current) await client.query('SELECT id FROM product_options WHERE id=$1 FOR UPDATE', [id]);
          for (const id of current) await client.query('SELECT option_id FROM inventory_levels WHERE option_id=$1 FOR UPDATE', [id]);
          const ended = await client.query<{ id: string }>(
            `UPDATE checkout_reservations h SET status='CANCELLED',ended_at=clock_timestamp(),
             end_reason=$2 WHERE h.status='ACTIVE' AND h.expires_at>clock_timestamp()
             AND EXISTS (SELECT 1 FROM checkout_reservation_lines l
               JOIN product_options o ON o.id=l.option_id
               JOIN product_revisions r ON r.id=o.revision_id
               WHERE l.reservation_id=h.id AND r.product_id=$1) RETURNING h.id`,
            [target.rows[0].product_id, `판매중지 승인: ${pending.rows[0].reason}`]);
          for (const row of ended.rows) await client.query(
            `INSERT INTO audit_events(actor_account_id,active_role,seller_id,action,target_type,target_id,details)
             VALUES ($1,'admin',$2,'checkout_reservation_cancelled','checkout_reservation',$3,$4::jsonb)`,
            [actor.accountId, product.rows[0].seller_id, row.id,
              JSON.stringify({ reason: pending.rows[0].reason, stopRequestId: requestId })]);
          for (const id of current) {
            const applied = await client.query(
              `UPDATE inventory_deferred_stock_targets d SET status='applied',applied_at=clock_timestamp()
               WHERE d.option_id=$1 AND d.status='pending' AND NOT EXISTS (
                 SELECT 1 FROM checkout_reservation_lines l
                 JOIN checkout_reservations h ON h.id=l.reservation_id
                 WHERE l.option_id=$1 AND h.status='ACTIVE' AND h.expires_at>clock_timestamp())`, [id]);
            if (applied.rowCount) await client.query(
              'UPDATE inventory_levels SET on_hand_quantity=0,sellable_quantity=0 WHERE option_id=$1', [id]);
          }
        }
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
    throw new Error('Reservation set changed');
  }

  private async affectedOptions(productId: string, query: Pick<Pool, 'query'> = this.pool): Promise<string[]> {
    const result = await query.query<{ option_id: string }>(
      `SELECT DISTINCT l2.option_id FROM checkout_reservation_lines l1
       JOIN product_options o1 ON o1.id=l1.option_id
       JOIN product_revisions r1 ON r1.id=o1.revision_id
       JOIN checkout_reservations h ON h.id=l1.reservation_id
       JOIN checkout_reservation_lines l2 ON l2.reservation_id=h.id
       WHERE r1.product_id=$1 AND h.status='ACTIVE' AND h.expires_at>clock_timestamp()
       ORDER BY l2.option_id`, [productId]);
    return result.rows.map((row) => row.option_id);
  }
}
