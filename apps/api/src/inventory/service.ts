import type { Pool } from 'pg';
import { canAccess, type AccessContext } from '../access.js';
import { approveStockIncrease, planStockEntry } from './stock-policy.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InventoryService {
  constructor(private readonly pool: Pool) {}

  async setStock(actor: AccessContext, optionId: string, target: number) {
    if (!actor.sellerId || !canAccess(actor, 'change-stock', { sellerId: actor.sellerId })) throw new Error('Forbidden');
    if (!uuid.test(optionId)) throw new Error('Invalid stock target');
    if (!Number.isSafeInteger(target) || target < 0 || target > 1_000_000_000) throw new Error('Invalid stock');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const owned = await client.query<{ seller_id: string }>(
        `SELECT p.seller_id FROM product_options o JOIN product_revisions r ON r.id=o.revision_id
         JOIN products p ON p.id=r.product_id WHERE o.id=$1 FOR UPDATE OF o`, [optionId],
      );
      if (owned.rows[0]?.seller_id !== actor.sellerId) throw new Error('Forbidden');
      await client.query('INSERT INTO inventory_levels(option_id) VALUES ($1) ON CONFLICT DO NOTHING', [optionId]);
      const result = await client.query<{ on_hand_quantity: number; sellable_quantity: number }>(
        'SELECT on_hand_quantity,sellable_quantity FROM inventory_levels WHERE option_id=$1 FOR UPDATE', [optionId],
      );
      const planned = planStockEntry({ onHand: result.rows[0].on_hand_quantity,
        sellable: result.rows[0].sellable_quantity }, target);
      await client.query(
        `UPDATE inventory_levels SET on_hand_quantity=$2,sellable_quantity=$3,updated_at=now()
         WHERE option_id=$1`, [optionId, planned.onHand, planned.sellable],
      );
      await client.query(
        `UPDATE stock_change_requests SET status='superseded',decided_at=now()
         WHERE option_id=$1 AND status='pending'`, [optionId],
      );
      let requestId: string | null = null;
      if (planned.requiresApproval) {
        const request = await client.query<{ id: string }>(
          `INSERT INTO stock_change_requests(option_id,target_on_hand,requested_by_account_id)
           VALUES ($1,$2,$3) RETURNING id`, [optionId, target, actor.accountId],
        );
        requestId = request.rows[0].id;
      }
      await client.query(
        `INSERT INTO audit_events(actor_account_id,active_role,seller_id,action,target_type,target_id)
         VALUES ($1,'seller',$2,'inventory.stock_entry','product_option',$3)`,
        [actor.accountId, actor.sellerId, optionId],
      );
      await client.query('COMMIT');
      return { ...planned, requestId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async approveIncrease(actor: AccessContext, requestId: string) {
    if (!canAccess(actor, 'approve-proposal', {})) throw new Error('Forbidden');
    if (!uuid.test(requestId)) throw new Error('Invalid stock request');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const target = await client.query<{ option_id: string }>(
        'SELECT option_id FROM stock_change_requests WHERE id=$1', [requestId],
      );
      if (!target.rows[0]) throw new Error('Pending stock request required');
      const optionId = target.rows[0].option_id;
      await client.query('SELECT 1 FROM product_options WHERE id=$1 FOR UPDATE', [optionId]);
      const stock = await client.query<{ on_hand_quantity: number; sellable_quantity: number }>(
        'SELECT on_hand_quantity,sellable_quantity FROM inventory_levels WHERE option_id=$1 FOR UPDATE', [optionId],
      );
      const pending = await client.query<{ target_on_hand: number; status: string }>(
        'SELECT target_on_hand,status FROM stock_change_requests WHERE id=$1 FOR UPDATE', [requestId],
      );
      if (pending.rows[0]?.status !== 'pending' || !stock.rows[0]) throw new Error('Pending stock request required');
      const approved = approveStockIncrease({ onHand: stock.rows[0].on_hand_quantity,
        sellable: stock.rows[0].sellable_quantity }, pending.rows[0].target_on_hand);
      await client.query(
        'UPDATE inventory_levels SET sellable_quantity=$2,updated_at=now() WHERE option_id=$1',
        [optionId, approved.sellable],
      );
      await client.query(
        `UPDATE stock_change_requests SET status='approved',decided_by_account_id=$2,decided_at=now()
         WHERE id=$1`, [requestId, actor.accountId],
      );
      await client.query(
        `INSERT INTO audit_events(actor_account_id,active_role,action,target_type,target_id)
         VALUES ($1,'admin','inventory.increase_approve','stock_change_request',$2)`,
        [actor.accountId, requestId],
      );
      await client.query('COMMIT');
      return approved;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
