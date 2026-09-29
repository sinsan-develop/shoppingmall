import type { Pool, PoolClient } from 'pg';
import type { AccessContext } from '../access.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FavoriteItem = {
  productId: string;
  title: string | null;
  saleStopped: boolean;
  published: boolean;
  createdAt: Date;
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
}
