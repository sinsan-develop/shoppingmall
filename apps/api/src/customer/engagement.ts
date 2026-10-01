import type { Pool, PoolClient } from 'pg';
import type { AccessContext } from '../access.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FavoriteItem = {
  productId: string;
  title: string | null;
  saleStopped: boolean;
  published: boolean;
  createdAt: Date;
};

export type RestockItem = {
  id: string;
  productId: string;
  optionName: string;
  status: 'active' | 'cancelled' | 'notified';
  requestedAt: Date;
  cancelledAt: Date | null;
  notifiedAt: Date | null;
  title: string | null;
  currentOptionId: string | null;
  saleStopped: boolean;
  optionState: 'unpublished' | 'sale_stopped' | 'missing' | 'available' | 'sold_out';
};

function requireCustomer(actor: AccessContext) {
  if (actor.role !== 'customer') throw new Error('Forbidden');
}

function requireProductId(productId: string) {
  if (typeof productId !== 'string' || !uuid.test(productId)) throw new Error('Invalid product');
}

async function transaction<T>(pool: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export class CustomerEngagement {
  constructor(private readonly pool: Pool) {}

  async listFavorites(actor: AccessContext): Promise<FavoriteItem[]> {
    requireCustomer(actor);
    const result = await this.pool.query<FavoriteItem>(
      `SELECT f.product_id AS "productId",r.title,
              pub.product_id IS NOT NULL AS published,
              EXISTS(SELECT 1 FROM product_sale_stop_requests stop
                WHERE stop.product_id=f.product_id AND stop.status='approved') AS "saleStopped",
              f.created_at AS "createdAt"
       FROM customer_favorites f
       LEFT JOIN product_publications pub ON pub.product_id=f.product_id
       LEFT JOIN product_revisions r ON r.id=pub.revision_id AND r.product_id=f.product_id AND r.status='approved'
       WHERE f.account_id=$1 ORDER BY f.created_at DESC,f.product_id DESC`,
      [actor.accountId],
    );
    return result.rows;
  }

  async addFavorite(actor: AccessContext, productId: string): Promise<{ productId: string; favorite: true }> {
    requireCustomer(actor);
    requireProductId(productId);
    return transaction(this.pool, async (client) => {
      const inserted = await client.query<{ product_id: string }>(
        `INSERT INTO customer_favorites(account_id,product_id)
         SELECT $1,pub.product_id FROM product_publications pub
         JOIN product_revisions r ON r.id=pub.revision_id AND r.product_id=pub.product_id
         WHERE pub.product_id=$2 AND r.status='approved'
         ON CONFLICT DO NOTHING RETURNING product_id`,
        [actor.accountId, productId],
      );
      if (inserted.rowCount) {
        await client.query(
          `INSERT INTO audit_events(actor_account_id,active_role,action,target_type,target_id)
           VALUES ($1,'customer','customer.favorite_add','product',$2)`,
          [actor.accountId, productId],
        );
      } else {
        const existing = await client.query(
          'SELECT 1 FROM customer_favorites WHERE account_id=$1 AND product_id=$2',
          [actor.accountId, productId],
        );
        if (!existing.rowCount) throw new Error('Product unavailable');
      }
      return { productId, favorite: true };
    });
  }

  async removeFavorite(actor: AccessContext, productId: string): Promise<{ productId: string; favorite: false }> {
    requireCustomer(actor);
    requireProductId(productId);
    return transaction(this.pool, async (client) => {
      const removed = await client.query(
        'DELETE FROM customer_favorites WHERE account_id=$1 AND product_id=$2 RETURNING product_id',
        [actor.accountId, productId],
      );
      if (removed.rowCount) {
        await client.query(
          `INSERT INTO audit_events(actor_account_id,active_role,action,target_type,target_id)
           VALUES ($1,'customer','customer.favorite_remove','product',$2)`,
          [actor.accountId, productId],
        );
      }
      return { productId, favorite: false };
    });
  }

  async listRestockSubscriptions(actor: AccessContext): Promise<RestockItem[]> {
    requireCustomer(actor);
    const result = await this.pool.query<RestockItem>(
      `SELECT sub.id,sub.product_id AS "productId",sub.option_name AS "optionName",sub.status,
              sub.requested_at AS "requestedAt",sub.cancelled_at AS "cancelledAt",
              sub.notified_at AS "notifiedAt",r.title,o.id AS "currentOptionId",
              EXISTS(SELECT 1 FROM product_sale_stop_requests stop
                WHERE stop.product_id=sub.product_id AND stop.status='approved') AS "saleStopped",
              CASE WHEN r.id IS NULL THEN 'unpublished'
                   WHEN EXISTS(SELECT 1 FROM product_sale_stop_requests stop
                     WHERE stop.product_id=sub.product_id AND stop.status='approved') THEN 'sale_stopped'
                   WHEN o.id IS NULL THEN 'missing'
                   WHEN coalesce(i.sellable_quantity,0)>0 THEN 'available'
                   ELSE 'sold_out' END AS "optionState"
       FROM restock_subscriptions sub
       LEFT JOIN product_publications pub ON pub.product_id=sub.product_id
       LEFT JOIN product_revisions r ON r.id=pub.revision_id AND r.product_id=sub.product_id AND r.status='approved'
       LEFT JOIN product_options o ON o.revision_id=r.id AND o.name=sub.option_name
       LEFT JOIN inventory_levels i ON i.option_id=o.id
       WHERE sub.account_id=$1 ORDER BY sub.requested_at DESC,sub.id DESC`,
      [actor.accountId],
    );
    return result.rows;
  }

  async addRestockSubscription(actor: AccessContext, productId: string, optionId: string):
      Promise<{ id: string; status: 'active' }> {
    requireCustomer(actor);
    requireProductId(productId);
    if (typeof optionId !== 'string' || !uuid.test(optionId)) throw new Error('Invalid option');
    return transaction(this.pool, async (client) => {
      // Sale-stop decisions take the product lock first. Read stop status only after
      // that lock so a concurrent approval cannot be hidden by a stale check.
      const product = await client.query('SELECT id FROM products WHERE id=$1 FOR SHARE', [productId]);
      if (!product.rowCount) throw new Error('Product unavailable');
      const stopped = await client.query(
        `SELECT 1 FROM product_sale_stop_requests
         WHERE product_id=$1 AND status='approved' LIMIT 1`, [productId],
      );
      if (stopped.rowCount) throw new Error('Product stopped');
      const option = await client.query<{ name: string }>(
        `SELECT o.name FROM product_publications pub
         JOIN product_revisions r ON r.id=pub.revision_id AND r.product_id=pub.product_id AND r.status='approved'
         JOIN product_options o ON o.revision_id=r.id
         WHERE pub.product_id=$1 AND o.id=$2 FOR SHARE OF pub,o`,
        [productId, optionId],
      );
      if (!option.rows[0]) throw new Error('Option unavailable');
      const stock = await client.query<{ sellable_quantity: number }>(
        'SELECT sellable_quantity FROM inventory_levels WHERE option_id=$1 FOR SHARE', [optionId],
      );
      if ((stock.rows[0]?.sellable_quantity ?? 0) > 0) throw new Error('Option available');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO restock_subscriptions(account_id,product_id,option_name)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`,
        [actor.accountId, productId, option.rows[0].name],
      );
      let id = inserted.rows[0]?.id;
      if (id) {
        await client.query(
          `INSERT INTO audit_events(actor_account_id,active_role,action,target_type,target_id)
           VALUES ($1,'customer','customer.restock_request','restock_subscription',$2)`,
          [actor.accountId, id],
        );
      } else {
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM restock_subscriptions WHERE account_id=$1 AND product_id=$2
           AND option_name=$3 AND status='active'`,
          [actor.accountId, productId, option.rows[0].name],
        );
        id = existing.rows[0]?.id;
        if (!id) throw new Error('Restock conflict');
      }
      return { id, status: 'active' };
    });
  }

  async cancelRestockSubscription(actor: AccessContext, subscriptionId: string):
      Promise<{ id: string; status: 'cancelled' }> {
    requireCustomer(actor);
    if (typeof subscriptionId !== 'string' || !uuid.test(subscriptionId)) throw new Error('Invalid subscription');
    return transaction(this.pool, async (client) => {
      const changed = await client.query<{ id: string }>(
        `UPDATE restock_subscriptions SET status='cancelled',cancelled_at=now()
         WHERE id=$1 AND account_id=$2 AND status='active' RETURNING id`,
        [subscriptionId, actor.accountId],
      );
      if (changed.rowCount) {
        await client.query(
          `INSERT INTO audit_events(actor_account_id,active_role,action,target_type,target_id)
           VALUES ($1,'customer','customer.restock_cancel','restock_subscription',$2)`,
          [actor.accountId, subscriptionId],
        );
      } else {
        const existing = await client.query<{ status: string }>(
          'SELECT status FROM restock_subscriptions WHERE id=$1 AND account_id=$2',
          [subscriptionId, actor.accountId],
        );
        if (!existing.rowCount) throw new Error('Subscription unavailable');
        if (existing.rows[0].status !== 'cancelled') throw new Error('Subscription closed');
      }
      return { id: subscriptionId, status: 'cancelled' };
    });
  }
}
