import type { Pool } from 'pg';
import { CheckoutCatalog } from './catalog-selection.js';
import { CheckoutQuote } from './quote.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxQuantity = 1_000_000;
const maxOptions = 100;

function validId(value: unknown): value is string {
  return typeof value === 'string' && uuid.test(value);
}

export type CustomerCartItem = {
  optionId: string;
  quantity: number;
  productId: string;
  title: string;
  optionName: string;
  unitPriceWon: number | null;
  availability: 'available' | 'unavailable';
};

/** Saved selections only: prices, availability and shipping are always read from current server state. */
export class CustomerCart {
  constructor(private readonly pool: Pool) {}

  async list(accountId: string): Promise<CustomerCartItem[]> {
    if (!validId(accountId)) throw new Error('Invalid account');
    const result = await this.pool.query<CustomerCartItem>(
      `SELECT c.option_id AS "optionId",c.quantity,p.id AS "productId",r.title,
              o.name AS "optionName",
              CASE WHEN pub.revision_id=r.id AND r.status='approved' AND stop.id IS NULL
                THEN o.price_won ELSE NULL END AS "unitPriceWon",
              CASE WHEN pub.revision_id=r.id AND r.status='approved' AND stop.id IS NULL
                       AND coalesce(i.sellable_quantity,0)>=c.quantity
                THEN 'available' ELSE 'unavailable' END AS availability
       FROM customer_cart_items c
       JOIN product_options o ON o.id=c.option_id
       JOIN product_revisions r ON r.id=o.revision_id
       JOIN products p ON p.id=r.product_id
       LEFT JOIN product_publications pub ON pub.product_id=p.id
       LEFT JOIN inventory_levels i ON i.option_id=o.id
       LEFT JOIN product_sale_stop_requests stop ON stop.product_id=p.id AND stop.status='approved'
       WHERE c.account_id=$1
       ORDER BY c.created_at,c.option_id`,
      [accountId],
    );
    return result.rows;
  }

  /** PUT semantics: the supplied quantity is final, never an increment or stock reservation. */
  async set(accountId: string, optionId: string, quantity: number): Promise<void> {
    if (!validId(accountId) || !validId(optionId) || !Number.isSafeInteger(quantity) ||
        quantity < 1 || quantity > maxQuantity) throw new Error('Invalid cart selection');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const account = await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [accountId]);
      if (account.rowCount !== 1) throw new Error('Missing account');
      const active = await client.query(
        `SELECT 1 FROM checkout_reservations WHERE account_id=$1 AND status='ACTIVE'
         AND expires_at>clock_timestamp() LIMIT 1`, [accountId]);
      if (active.rowCount) throw new Error('Active reservation exists');
      await new CheckoutCatalog(client).resolve([{ optionId, quantity }]);
      const count = await client.query<{ count: string; exists: boolean }>(
        `SELECT count(*)::text AS count,bool_or(option_id=$2) AS exists
         FROM customer_cart_items WHERE account_id=$1`,
        [accountId, optionId],
      );
      if (!count.rows[0]?.exists && Number(count.rows[0]?.count ?? 0) >= maxOptions) {
        throw new Error('Cart option limit exceeded');
      }
      await client.query(
        `INSERT INTO customer_cart_items(account_id,option_id,quantity) VALUES ($1,$2,$3)
         ON CONFLICT (account_id,option_id) DO UPDATE
         SET quantity=EXCLUDED.quantity,updated_at=now()`,
        [accountId, optionId, quantity],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async remove(accountId: string, optionId: string): Promise<void> {
    if (!validId(accountId) || !validId(optionId)) throw new Error('Invalid cart selection');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const account = await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [accountId]);
      if (account.rowCount !== 1) throw new Error('Missing account');
      const active = await client.query(
        `SELECT 1 FROM checkout_reservations WHERE account_id=$1 AND status='ACTIVE'
         AND expires_at>clock_timestamp() LIMIT 1`, [accountId]);
      if (active.rowCount) throw new Error('Active reservation exists');
      await client.query('DELETE FROM customer_cart_items WHERE account_id=$1 AND option_id=$2',
        [accountId, optionId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async quote(accountId: string) {
    if (!validId(accountId)) throw new Error('Invalid account');
    const result = await this.pool.query<{ optionId: string; quantity: number }>(
      `SELECT option_id AS "optionId",quantity FROM customer_cart_items
       WHERE account_id=$1 ORDER BY created_at,option_id`,
      [accountId],
    );
    return new CheckoutQuote(this.pool).quote(result.rows);
  }
}
