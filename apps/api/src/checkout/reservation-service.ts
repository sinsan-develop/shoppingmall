import type { Pool, PoolClient } from 'pg';
import { quoteReservationInTransaction } from './reservation-quote.js';
import type { ShipmentQuote } from './shipment-quote.js';
import { expirePendingOrderInTransaction } from '../orders/expiry-core.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxOptions = 100;
const maxQuantity = 1_000_000;

export type ReservationStatus = 'ACTIVE' | 'EXPIRED' | 'RELEASED' | 'CANCELLED' | 'CONSUMED';
export type ReservationView = {
  id: string;
  status: ReservationStatus;
  expiresAt: Date;
  endReason: string | null;
  lines: { optionId: string; quantity: number }[];
};

type ReservationRow = {
  id: string;
  account_id: string;
  status: ReservationStatus;
  expires_at: Date;
  end_reason: string | null;
};

/** A stock hold, not a payment, price lock or accepted order. */
export class CheckoutReservations {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async lockAccount(client: PoolClient, accountId: string): Promise<void> {
    const account = await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [accountId]);
    if (account.rowCount !== 1) throw new Error('Missing account');
  }

  private async view(client: PoolClient, row: ReservationRow): Promise<ReservationView> {
    const lines = await client.query<{ optionId: string; quantity: number }>(
      `SELECT option_id AS "optionId",quantity FROM checkout_reservation_lines
       WHERE reservation_id=$1 ORDER BY option_id`, [row.id],
    );
    return { id: row.id, status: row.status, expiresAt: row.expires_at,
      endReason: row.end_reason, lines: lines.rows };
  }

  /** Every stock-affecting path takes product, option, then inventory locks in ascending ID order. */
  private async lockOptions(client: PoolClient, optionIds: string[]): Promise<void> {
    if (!optionIds.length) return;
    const productIds = await client.query<{ id: string }>(
      `SELECT DISTINCT r.product_id AS id FROM product_options o
       JOIN product_revisions r ON r.id=o.revision_id WHERE o.id=ANY($1::uuid[]) ORDER BY id`,
      [optionIds],
    );
    for (const { id } of productIds.rows) {
      await client.query('SELECT id FROM products WHERE id=$1 FOR UPDATE', [id]);
    }
    for (const id of [...optionIds].sort()) {
      await client.query('SELECT id FROM product_options WHERE id=$1 FOR UPDATE', [id]);
    }
    for (const id of [...optionIds].sort()) {
      await client.query('SELECT option_id FROM inventory_levels WHERE option_id=$1 FOR UPDATE', [id]);
    }
  }

  private async terminate(client: PoolClient, row: ReservationRow,
    status: 'EXPIRED' | 'RELEASED' | 'CANCELLED', reason?: string,
    actorAccountId = row.account_id, activeRole: 'customer' | 'admin' = 'customer'): Promise<ReservationRow> {
    if (row.status !== 'ACTIVE') return row;
    const lines = await client.query<{ option_id: string }>(
      'SELECT option_id FROM checkout_reservation_lines WHERE reservation_id=$1 ORDER BY option_id', [row.id],
    );
    await this.lockOptions(client, lines.rows.map((line) => line.option_id));
    const updated = await client.query<ReservationRow>(
      `UPDATE checkout_reservations SET status=$2,ended_at=clock_timestamp(),end_reason=$3
       WHERE id=$1 AND status='ACTIVE' RETURNING *`, [row.id, status, reason ?? null],
    );
    if (!updated.rowCount) return row;
    for (const { option_id: optionId } of lines.rows) {
      await client.query(
        `UPDATE inventory_deferred_stock_targets d SET status='applied',applied_at=clock_timestamp()
         WHERE d.option_id=$1 AND d.status='pending' AND NOT EXISTS (
           SELECT 1 FROM checkout_reservation_lines l
           JOIN checkout_reservations h ON h.id=l.reservation_id
           WHERE l.option_id=$1 AND h.status='ACTIVE' AND h.expires_at>clock_timestamp())`,
        [optionId],
      ).then(async (applied) => {
        if (applied.rowCount) await client.query(
          `UPDATE inventory_levels SET on_hand_quantity=0,sellable_quantity=0 WHERE option_id=$1`,
          [optionId],
        );
      });
    }
    await client.query(
      `INSERT INTO audit_events(actor_account_id,active_role,action,target_type,target_id,details)
       VALUES ($1,$2,$3,'checkout_reservation',$4,$5::jsonb)`,
      [actorAccountId, activeRole, `checkout_reservation_${status.toLowerCase()}`, row.id,
        JSON.stringify(reason ? { reason } : {})],
    );
    return updated.rows[0];
  }

  private async expireIfDue(client: PoolClient, row: ReservationRow): Promise<ReservationRow> {
    if (row.status !== 'ACTIVE') return row;
    const due = await client.query<{ due: boolean }>(
      'SELECT $1::timestamptz<=clock_timestamp() AS due', [row.expires_at],
    );
    if (!due.rows[0].due) return row;
    const linked = await client.query(`SELECT id FROM checkout_orders
      WHERE reservation_id=$1 AND status='PENDING_PAYMENT'`, [row.id]);
    if (!linked.rowCount) return this.terminate(client, row, 'EXPIRED');
    await expirePendingOrderInTransaction(this.pool, client, row.account_id, row.id,
      async () => { await this.terminate(client, row, 'EXPIRED'); });
    const updated = await client.query<ReservationRow>('SELECT * FROM checkout_reservations WHERE id=$1',
      [row.id]);
    return updated.rows[0];
  }

  /** The order expiry worker reuses the same stock/deferred-target and audit transition. */
  async expireInTransaction(client: PoolClient, accountId: string, reservationId: string): Promise<void> {
    await this.lockAccount(client, accountId);
    const found = await client.query<ReservationRow>(`SELECT * FROM checkout_reservations
      WHERE id=$1 AND account_id=$2 FOR UPDATE`, [reservationId, accountId]);
    if (found.rows[0]?.status === 'ACTIVE') await this.terminate(client, found.rows[0], 'EXPIRED');
  }

  async start(accountId: string, key: string, includeQuote = false): Promise<ReservationView & { quote?: ShipmentQuote }> {
    if (!uuid.test(accountId) || !uuid.test(key)) throw new Error('Invalid reservation request');
    return this.transaction(async (client) => {
      const result = async (row: ReservationRow) => {
        const view = await this.view(client, row);
        return includeQuote && view.status === 'ACTIVE' ?
          { ...view, quote: await quoteReservationInTransaction(this.pool, client, accountId, view.id) } : view;
      };
      await this.lockAccount(client, accountId);
      const prior = await client.query<ReservationRow>(
        'SELECT * FROM checkout_reservations WHERE account_id=$1 AND idempotency_key=$2',
        [accountId, key],
      );
      if (prior.rowCount) return result(await this.expireIfDue(client, prior.rows[0]));
      const active = await client.query<ReservationRow>(
        `SELECT * FROM checkout_reservations WHERE account_id=$1 AND status='ACTIVE'`, [accountId],
      );
      if (active.rowCount) {
        const checked = await this.expireIfDue(client, active.rows[0]);
        if (checked.status === 'ACTIVE') throw new Error('Active reservation exists');
      }
      const cart = await client.query<{ option_id: string; quantity: number }>(
        `SELECT option_id,quantity FROM customer_cart_items WHERE account_id=$1 ORDER BY option_id`,
        [accountId],
      );
      if (!cart.rowCount || cart.rows.length > maxOptions || cart.rows.some(
        (line) => !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > maxQuantity,
      )) throw new Error('Invalid cart selection');
      const optionIds = cart.rows.map((line) => line.option_id);
      await this.lockOptions(client, optionIds);
      const availability = await client.query<{
        option_id: string; sellable_quantity: number; held: string; published: boolean;
      }>(
        `SELECT o.id AS option_id,coalesce(i.sellable_quantity,0)::int AS sellable_quantity,
          coalesce((SELECT sum(l.quantity) FROM checkout_reservation_lines l
            JOIN checkout_reservations h ON h.id=l.reservation_id
            WHERE l.option_id=o.id AND h.status='ACTIVE' AND h.expires_at>clock_timestamp()),0)::text AS held,
          (r.status='approved' AND pub.revision_id=r.id AND stop.id IS NULL) AS published
         FROM product_options o JOIN product_revisions r ON r.id=o.revision_id
         LEFT JOIN product_publications pub ON pub.product_id=r.product_id
         LEFT JOIN inventory_levels i ON i.option_id=o.id
         LEFT JOIN product_sale_stop_requests stop ON stop.product_id=r.product_id AND stop.status='approved'
         WHERE o.id=ANY($1::uuid[])`, [optionIds],
      );
      if (availability.rows.length !== cart.rows.length ||
          availability.rows.some((row) => !row.published)) throw new Error('Unavailable cart selection');
      const byOption = new Map(availability.rows.map((row) => [row.option_id, row]));
      for (const line of cart.rows) {
        const stock = byOption.get(line.option_id);
        if (!stock || stock.sellable_quantity - Number(stock.held) < line.quantity) {
          throw new Error('Insufficient stock');
        }
      }
      const created = await client.query<ReservationRow>(
        `WITH stamp AS (SELECT clock_timestamp() AS at)
         INSERT INTO checkout_reservations(account_id,idempotency_key,status,created_at,expires_at)
         SELECT $1,$2,'ACTIVE',stamp.at,stamp.at+interval '15 minutes' FROM stamp RETURNING *`,
        [accountId, key],
      );
      for (const line of cart.rows) await client.query(
        `INSERT INTO checkout_reservation_lines(reservation_id,option_id,quantity) VALUES ($1,$2,$3)`,
        [created.rows[0].id, line.option_id, line.quantity],
      );
      await client.query(
        `INSERT INTO audit_events(actor_account_id,active_role,action,target_type,target_id)
         VALUES ($1,'customer','checkout_reservation_started','checkout_reservation',$2)`,
        [accountId, created.rows[0].id],
      );
      return result(created.rows[0]);
    });
  }

  async get(accountId: string, id: string): Promise<ReservationView | null> {
    if (!uuid.test(accountId) || !uuid.test(id)) throw new Error('Invalid reservation request');
    return this.transaction(async (client) => {
      await this.lockAccount(client, accountId);
      const found = await client.query<ReservationRow>(
        'SELECT * FROM checkout_reservations WHERE id=$1 AND account_id=$2', [id, accountId],
      );
      return found.rowCount ? this.view(client, await this.expireIfDue(client, found.rows[0])) : null;
    });
  }

  /** Discover only the calling customer's current hold, never another account's ID. */
  async getActive(accountId: string): Promise<(ReservationView & { quote: ShipmentQuote }) | null> {
    if (!uuid.test(accountId)) throw new Error('Invalid reservation request');
    return this.transaction(async (client) => {
      await this.lockAccount(client, accountId);
      const found = await client.query<ReservationRow>(
        `SELECT * FROM checkout_reservations WHERE account_id=$1 AND status='ACTIVE'`, [accountId],
      );
      if (!found.rowCount) return null;
      const row = await this.expireIfDue(client, found.rows[0]);
      if (row.status !== 'ACTIVE') return null;
      const view = await this.view(client, row);
      let quote: ShipmentQuote;
      try {
        quote = await quoteReservationInTransaction(this.pool, client, accountId, view.id);
      } catch (error) {
        // The hold can cross its DB deadline between the first check and quote validation.
        if (error instanceof Error && error.message === 'Reservation unavailable') {
          const latest = await client.query<ReservationRow>(
            'SELECT * FROM checkout_reservations WHERE id=$1 AND account_id=$2', [view.id, accountId],
          );
          if (latest.rowCount && (await this.expireIfDue(client, latest.rows[0])).status !== 'ACTIVE') return null;
        }
        throw error;
      }
      const latest = await client.query<ReservationRow>(
        'SELECT * FROM checkout_reservations WHERE id=$1 AND account_id=$2', [view.id, accountId],
      );
      if (!latest.rowCount) return null;
      const checked = await this.expireIfDue(client, latest.rows[0]);
      if (checked.status !== 'ACTIVE') return null;
      return { ...(await this.view(client, checked)), quote };
    });
  }

  async release(accountId: string, id: string): Promise<ReservationView | null> {
    if (!uuid.test(accountId) || !uuid.test(id)) throw new Error('Invalid reservation request');
    return this.transaction(async (client) => {
      await this.lockAccount(client, accountId);
      const found = await client.query<ReservationRow>(
        'SELECT * FROM checkout_reservations WHERE id=$1 AND account_id=$2', [id, accountId],
      );
      if (!found.rowCount) return null;
      const row = await this.expireIfDue(client, found.rows[0]);
      if (row.status === 'ACTIVE' && (await client.query(`SELECT id FROM checkout_orders
        WHERE reservation_id=$1 AND status='PENDING_PAYMENT'`, [id])).rowCount)
        throw new Error('Pending order must expire before releasing its reservation');
      return this.view(client, row.status === 'ACTIVE' ?
        await this.terminate(client, row, 'RELEASED') : row);
    });
  }

  /** Operator exception: the stock hold ends once, with the operator's reason and audit actor. */
  async cancel(actorAccountId: string, id: string, reason: string): Promise<ReservationView | null> {
    if (!uuid.test(actorAccountId) || !uuid.test(id)) throw new Error('Invalid reservation request');
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) {
      throw new Error('Cancel reason required');
    }
    return this.transaction(async (client) => {
      await this.lockAccount(client, actorAccountId);
      const found = await client.query<ReservationRow>(
        'SELECT * FROM checkout_reservations WHERE id=$1', [id]);
      if (!found.rowCount) return null;
      const lines = await client.query<{ option_id: string }>(
        'SELECT option_id FROM checkout_reservation_lines WHERE reservation_id=$1 ORDER BY option_id', [id]);
      await this.lockOptions(client, lines.rows.map((line) => line.option_id));
      const current = await client.query<ReservationRow>(
        'SELECT * FROM checkout_reservations WHERE id=$1 FOR UPDATE', [id]);
      if (current.rows[0].status !== 'ACTIVE') return this.view(client, current.rows[0]);
      if ((await client.query(`SELECT id FROM checkout_orders
        WHERE reservation_id=$1 AND status='PENDING_PAYMENT'`, [id])).rowCount)
        throw new Error('Pending order must expire before cancelling its reservation');
      const valid = await client.query<{ valid: boolean }>(
        'SELECT $1::timestamptz>clock_timestamp() AS valid', [current.rows[0].expires_at]);
      if (!valid.rows[0].valid) throw new Error('Reservation unavailable');
      return this.view(client, await this.terminate(
        client, current.rows[0], 'CANCELLED', reason.trim(), actorAccountId, 'admin'));
    });
  }

  async expireDue(limit: number): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid expiry limit');
    const due = await this.pool.query<{ id: string; account_id: string }>(
      `SELECT id,account_id FROM checkout_reservations
       WHERE status='ACTIVE' AND expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT $1`,
      [limit],
    );
    let expired = 0;
    for (const item of due.rows) {
      const didExpire = await this.transaction(async (client) => {
        await this.lockAccount(client, item.account_id);
        const found = await client.query<ReservationRow>(
          'SELECT * FROM checkout_reservations WHERE id=$1 AND account_id=$2',
          [item.id, item.account_id],
        );
        if (!found.rowCount || found.rows[0].status !== 'ACTIVE') return false;
        return (await this.expireIfDue(client, found.rows[0])).status === 'EXPIRED';
      });
      if (didExpire) expired++;
    }
    return expired;
  }
}
