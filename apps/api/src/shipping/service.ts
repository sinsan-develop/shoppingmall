import type { Pool, PoolClient } from 'pg';
import { canAccess, type AccessContext } from '../access.js';
import { resolveShippingPolicy, validateShippingPolicy, type PolicyLocks, type ShippingPolicy } from './policy.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Seller requests never mutate the currently approved policy until an operator records a decision. */
export class ShippingPolicies {
  constructor(private readonly pool: Pool, private readonly reader: Pool | PoolClient = pool) {}

  async getGlobal() {
    const result = await this.reader.query<{
      feeWon: number; freeThresholdWon: number; cutoffTime: string | null;
      blockedPostalRanges: ShippingPolicy['blockedPostalRanges'];
      lockedFee: boolean; lockedThreshold: boolean; lockedCutoff: boolean; updatedAt: Date;
    }>(
      `SELECT fee_won AS "feeWon",free_threshold_won AS "freeThresholdWon",cutoff_time AS "cutoffTime",
              blocked_postal_ranges AS "blockedPostalRanges",locked_fee AS "lockedFee",
              locked_threshold AS "lockedThreshold",locked_cutoff AS "lockedCutoff",updated_at AS "updatedAt"
       FROM shipping_policy_global WHERE id=1`,
    );
    if (!result.rows[0]) throw new Error('Global shipping policy unavailable');
    const row = result.rows[0];
    return { policy: validateShippingPolicy(row), locks: {
      feeWon: row.lockedFee, freeThresholdWon: row.lockedThreshold, cutoffTime: row.lockedCutoff,
    }, updatedAt: row.updatedAt };
  }

  async getEffective(sellerId: string) {
    if (!uuid.test(sellerId)) throw new Error('Invalid seller target');
    const global = await this.getGlobal();
    const result = await this.reader.query<{ id: string; policy: ShippingPolicy | null; approvedAt: Date | null }>(
      `SELECT s.id,sp.policy,sp.approved_at AS "approvedAt" FROM sellers s
       LEFT JOIN seller_shipping_policies sp ON sp.seller_id=s.id WHERE s.id=$1`, [sellerId],
    );
    if (!result.rows[0]) throw new Error('Seller not found');
    return { sellerId, policy: resolveShippingPolicy(global.policy, result.rows[0].policy, global.locks),
      approvedAt: result.rows[0].approvedAt, globalUpdatedAt: global.updatedAt };
  }

  async updateGlobal(actor: AccessContext, input: unknown, locksInput: unknown) {
    if (!canAccess(actor, 'approve-proposal', {})) throw new Error('Forbidden');
    const policy = validateShippingPolicy(input);
    resolveShippingPolicy(policy, null, locksInput);
    const locks = locksInput as PolicyLocks;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE shipping_policy_global SET fee_won=$1,free_threshold_won=$2,cutoff_time=$3,
          blocked_postal_ranges=$4,locked_fee=$5,locked_threshold=$6,locked_cutoff=$7,
          updated_by_account_id=$8,updated_at=now() WHERE id=1`,
        [policy.feeWon, policy.freeThresholdWon, policy.cutoffTime, JSON.stringify(policy.blockedPostalRanges),
          locks.feeWon ?? false, locks.freeThresholdWon ?? false, locks.cutoffTime ?? false, actor.accountId],
      );
      if (updated.rowCount !== 1) throw new Error('Global shipping policy unavailable');
      await client.query(
        `INSERT INTO audit_events(actor_account_id,active_role,action,target_type,target_id)
         VALUES ($1,'admin','shipping.global_update','shipping_policy_global','1')`, [actor.accountId],
      );
      await client.query('COMMIT');
      return this.getGlobal();
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async requestSeller(actor: AccessContext, input: unknown) {
    if (!actor.sellerId || !canAccess(actor, 'request-proposal', { sellerId: actor.sellerId })) {
      throw new Error('Forbidden');
    }
    const policy = validateShippingPolicy(input);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO seller_shipping_policy_requests(seller_id,policy,requested_by_account_id)
         VALUES ($1,$2,$3) RETURNING id`, [actor.sellerId, JSON.stringify(policy), actor.accountId],
      );
      await client.query(
        `INSERT INTO audit_events(actor_account_id,active_role,seller_id,action,target_type,target_id)
         VALUES ($1,'seller',$2,'shipping.request','shipping_policy_request',$3)`,
        [actor.accountId, actor.sellerId, inserted.rows[0].id],
      );
      await client.query('COMMIT');
      return { requestId: inserted.rows[0].id, status: 'pending' as const };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof Error && 'code' in error && error.code === '23505') {
        throw new Error('Pending shipping request exists');
      }
      throw error;
    } finally { client.release(); }
  }

  async listOwn(actor: AccessContext) {
    if (!actor.sellerId || !canAccess(actor, 'request-proposal', { sellerId: actor.sellerId })) {
      throw new Error('Forbidden');
    }
    const result = await this.pool.query<{
      id: string; status: string; policy: ShippingPolicy; requestedAt: Date; decidedAt: Date | null;
      decisionReason: string | null;
    }>(
      `SELECT id,status,policy,requested_at AS "requestedAt",decided_at AS "decidedAt",
              decision_reason AS "decisionReason"
       FROM seller_shipping_policy_requests WHERE seller_id=$1
       ORDER BY requested_at DESC,id DESC LIMIT 50`, [actor.sellerId],
    );
    return result.rows;
  }

  async listPending(actor: AccessContext) {
    if (!canAccess(actor, 'approve-proposal', {})) throw new Error('Forbidden');
    const result = await this.pool.query<{
      id: string; sellerId: string; sellerName: string; policy: ShippingPolicy; requestedAt: Date;
    }>(
      `SELECT q.id,q.seller_id AS "sellerId",s.display_name AS "sellerName",q.policy,
              q.requested_at AS "requestedAt" FROM seller_shipping_policy_requests q
       JOIN sellers s ON s.id=q.seller_id WHERE q.status='pending'
       ORDER BY q.requested_at,q.id LIMIT 100`,
    );
    return result.rows;
  }

  async approve(actor: AccessContext, requestId: string) {
    if (!canAccess(actor, 'approve-proposal', {})) throw new Error('Forbidden');
    if (!uuid.test(requestId)) throw new Error('Invalid shipping request');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const request = await client.query<{ seller_id: string; status: string; policy: ShippingPolicy }>(
        'SELECT seller_id,status,policy FROM seller_shipping_policy_requests WHERE id=$1 FOR UPDATE', [requestId],
      );
      if (request.rows[0]?.status !== 'pending') throw new Error('Pending shipping request required');
      const policy = validateShippingPolicy(request.rows[0].policy);
      await client.query(
        `INSERT INTO seller_shipping_policies(seller_id,policy,approved_request_id,approved_by_account_id)
         VALUES ($1,$2,$3,$4) ON CONFLICT (seller_id) DO UPDATE SET policy=EXCLUDED.policy,
           approved_request_id=EXCLUDED.approved_request_id,approved_by_account_id=EXCLUDED.approved_by_account_id,
           approved_at=now()`,
        [request.rows[0].seller_id, JSON.stringify(policy), requestId, actor.accountId],
      );
      await client.query(
        `UPDATE seller_shipping_policy_requests SET status='approved',decided_by_account_id=$2,
         decided_at=now() WHERE id=$1`, [requestId, actor.accountId],
      );
      await client.query(
        `INSERT INTO audit_events(actor_account_id,active_role,seller_id,action,target_type,target_id)
         VALUES ($1,'admin',$2,'shipping.approve','shipping_policy_request',$3)`,
        [actor.accountId, request.rows[0].seller_id, requestId],
      );
      await client.query('COMMIT');
      return { requestId, status: 'approved' as const };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async reject(actor: AccessContext, requestId: string, reason: string) {
    if (!canAccess(actor, 'approve-proposal', {})) throw new Error('Forbidden');
    if (!uuid.test(requestId)) throw new Error('Invalid shipping request');
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) {
      throw new Error('Review reason required');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const request = await client.query<{ seller_id: string; status: string }>(
        'SELECT seller_id,status FROM seller_shipping_policy_requests WHERE id=$1 FOR UPDATE', [requestId],
      );
      if (request.rows[0]?.status !== 'pending') throw new Error('Pending shipping request required');
      await client.query(
        `UPDATE seller_shipping_policy_requests SET status='rejected',decided_by_account_id=$2,
         decided_at=now(),decision_reason=$3 WHERE id=$1`, [requestId, actor.accountId, reason.trim()],
      );
      await client.query(
        `INSERT INTO audit_events(actor_account_id,active_role,seller_id,action,target_type,target_id)
         VALUES ($1,'admin',$2,'shipping.reject','shipping_policy_request',$3)`,
        [actor.accountId, request.rows[0].seller_id, requestId],
      );
      await client.query('COMMIT');
      return { requestId, status: 'rejected' as const };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
