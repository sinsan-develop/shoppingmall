import type { Pool, PoolClient } from 'pg';
import { lockPaymentFulfillments, openPaymentFulfillments } from '../fulfillment/repository.js';
import { PromotionUsageService } from '../promotions/usage-service.js';
import { queueNotificationEvent } from '../notifications/event-queue.js';
import { recordPaidSettlement } from '../settlement/record.js';
import type { PaymentEventView } from './repository.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Context = { orderId: string; accountId: string };
type OrderRow = { id: string; status: string; reservationId: string; payableWon: number;
  expired: boolean };
type AttemptRow = { id: string; status: string; requestedWon: number; provider: string };
type EventRow = { id: string; paymentAttemptId: string; processingStatus: PaymentEventView['processingStatus'];
  provider: string; outcome: 'APPROVED' | 'DECLINED'; verifiedOrderId: string;
  amountWon: number; providerPaymentId: string };

async function finishEvent(client: PoolClient, eventId: string,
  status: 'APPLIED' | 'REVIEW_REQUIRED'): Promise<PaymentEventView> {
  await client.query(`UPDATE payment_events SET processing_status=$2,processed_at=clock_timestamp()
    WHERE id=$1 AND processing_status='PENDING_PROCESSING'`, [eventId, status]);
  return { id: eventId, processingStatus: status };
}

/** Lock every stock-affecting entity in the same product→option→inventory order as S3. */
async function lockAndCheckStock(client: PoolClient, reservationId: string,
  orderId: string): Promise<{ optionId: string; quantity: number; onHand: number;
  sellable: number }[]> {
  const reserved = await client.query<{ optionId: string; quantity: number }>(
    `SELECT option_id AS "optionId",quantity FROM checkout_reservation_lines
     WHERE reservation_id=$1 ORDER BY option_id`, [reservationId]);
  const sold = await client.query<{ optionId: string; quantity: number }>(
    `SELECT l.option_id AS "optionId",sum(l.quantity)::int AS quantity
     FROM shipment_order_lines l JOIN shipment_orders s ON s.id=l.shipment_order_id
     WHERE s.checkout_order_id=$1 GROUP BY l.option_id ORDER BY l.option_id`, [orderId]);
  if (!reserved.rows.length || reserved.rows.length !== sold.rows.length ||
      reserved.rows.some((row, index) => row.optionId !== sold.rows[index].optionId ||
        row.quantity !== sold.rows[index].quantity)) throw new Error('Payment line conflict');
  const optionIds = reserved.rows.map(({ optionId }) => optionId);
  const products = await client.query<{ id: string }>(`SELECT DISTINCT r.product_id AS id
    FROM product_options o JOIN product_revisions r ON r.id=o.revision_id
    WHERE o.id=ANY($1::uuid[]) ORDER BY id`, [optionIds]);
  for (const { id } of products.rows) await client.query('SELECT id FROM products WHERE id=$1 FOR UPDATE', [id]);
  for (const id of optionIds) await client.query('SELECT id FROM product_options WHERE id=$1 FOR UPDATE', [id]);
  const result: { optionId: string; quantity: number; onHand: number; sellable: number }[] = [];
  for (const row of reserved.rows) {
    const found = await client.query<{ onHand: number; sellable: number }>(
      `SELECT on_hand_quantity AS "onHand",sellable_quantity AS sellable
       FROM inventory_levels WHERE option_id=$1 FOR UPDATE`, [row.optionId]);
    const stock = found.rows[0];
    if (!stock || stock.onHand < row.quantity) throw new Error('Payment stock unavailable');
    result.push({ optionId: row.optionId, quantity: row.quantity,
      onHand: stock.onHand, sellable: stock.sellable });
  }
  return result;
}

/** A provider event is durable before this separate, retryable state transaction begins. */
export async function processVerifiedPaymentEvent(pool: Pool, eventId: string): Promise<PaymentEventView> {
  if (!uuid.test(eventId)) throw new Error('Invalid payment event');
  const anchor = await pool.query<Context>(`SELECT a.checkout_order_id AS "orderId",
    o.account_id AS "accountId" FROM payment_events e
    JOIN payment_attempts a ON a.id=e.payment_attempt_id
    JOIN checkout_orders o ON o.id=a.checkout_order_id WHERE e.id=$1`, [eventId]);
  const context = anchor.rows[0];
  if (!context) throw new Error('Payment event unavailable');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const actor = await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [context.accountId]);
    if (!actor.rowCount) throw new Error('Payment account unavailable');
    const order = (await client.query<OrderRow>(`SELECT id,status,
      reservation_id AS "reservationId",payable_won AS "payableWon",
      expires_at<=clock_timestamp() AS expired FROM checkout_orders WHERE id=$1 FOR UPDATE`,
    [context.orderId])).rows[0];
    if (!order) throw new Error('Payment order unavailable');
    const event = (await client.query<EventRow>(`SELECT id,payment_attempt_id AS "paymentAttemptId",
      processing_status AS "processingStatus",provider,outcome,
      verified_order_id AS "verifiedOrderId",amount_won AS "amountWon",
      provider_payment_id AS "providerPaymentId"
      FROM payment_events WHERE id=$1 FOR UPDATE`, [eventId])).rows[0];
    if (!event) throw new Error('Payment event unavailable');
    const attempt = (await client.query<AttemptRow>(`SELECT id,status,requested_won AS "requestedWon",provider
      FROM payment_attempts WHERE id=$1 FOR UPDATE`, [event.paymentAttemptId])).rows[0];
    if (!attempt) throw new Error('Payment attempt unavailable');
    if (event.processingStatus !== 'PENDING_PROCESSING') {
      await client.query('COMMIT');
      return { id: eventId, processingStatus: event.processingStatus };
    }
    if (event.provider !== attempt.provider || event.verifiedOrderId !== order.id ||
        event.amountWon !== order.payableWon || attempt.requestedWon !== order.payableWon ||
        attempt.status === 'REVIEW_REQUIRED') {
      const review = await finishEvent(client, eventId, 'REVIEW_REQUIRED');
      if (attempt.status === 'PENDING') await client.query(`UPDATE payment_attempts
        SET status='REVIEW_REQUIRED',ended_at=clock_timestamp() WHERE id=$1`, [attempt.id]);
      await client.query('COMMIT');
      return review;
    }
    if (order.status === 'PAID') {
      const prior = await client.query<{ providerPaymentId: string }>(`SELECT e.provider_payment_id AS "providerPaymentId"
        FROM payment_events e WHERE e.payment_attempt_id=$1 AND e.outcome='APPROVED'
        AND e.processing_status='APPLIED' ORDER BY e.received_at,e.id LIMIT 1`, [attempt.id]);
      const status = event.outcome === 'APPROVED' && attempt.status === 'APPROVED' &&
        prior.rows[0]?.providerPaymentId === event.providerPaymentId ? 'APPLIED' : 'REVIEW_REQUIRED';
      const result = await finishEvent(client, eventId, status);
      await client.query('COMMIT');
      return result;
    }
    if (order.status !== 'PENDING_PAYMENT' || order.expired || attempt.status === 'APPROVED' ||
        (attempt.status === 'DECLINED' && event.outcome === 'APPROVED')) {
      const review = await finishEvent(client, eventId, 'REVIEW_REQUIRED');
      if (attempt.status === 'PENDING') await client.query(`UPDATE payment_attempts
        SET status='REVIEW_REQUIRED',ended_at=clock_timestamp() WHERE id=$1`, [attempt.id]);
      await client.query('COMMIT');
      return review;
    }
    if (event.outcome === 'DECLINED') {
      if (attempt.status === 'PENDING') {
        await client.query(`UPDATE payment_attempts
          SET status='DECLINED',ended_at=clock_timestamp() WHERE id=$1`, [attempt.id]);
        await queueNotificationEvent(client, { kind: 'payment_declined',
          sourceEventId: event.id, accountId: context.accountId });
      }
      const declined = await finishEvent(client, eventId, 'APPLIED');
      await client.query('COMMIT');
      return declined;
    }
    // Sale-stop approval takes products before cancelling reservations. Take the same
    // stable product locks before reservation/use locks, then recheck reservation state.
    const products = await client.query<{ id: string }>(`SELECT DISTINCT r.product_id AS id
      FROM checkout_reservation_lines l JOIN product_options o ON o.id=l.option_id
      JOIN product_revisions r ON r.id=o.revision_id
      WHERE l.reservation_id=$1 ORDER BY id`, [order.reservationId]);
    for (const { id } of products.rows)
      await client.query('SELECT id FROM products WHERE id=$1 FOR UPDATE', [id]);
    const uses = await client.query<{ id: string; status: string }>(`SELECT id,status FROM promotion_uses
      WHERE reservation_id=$1 ORDER BY id FOR UPDATE`, [order.reservationId]);
    const reservation = (await client.query<{ status: string; current: boolean }>(
      `SELECT status,expires_at>clock_timestamp() AS current FROM checkout_reservations
       WHERE id=$1 AND account_id=$2 FOR UPDATE`, [order.reservationId, context.accountId])).rows[0];
    if (!reservation || reservation.status !== 'ACTIVE' || !reservation.current ||
        uses.rows.some(({ status }) => status !== 'HELD')) {
      const review = await finishEvent(client, eventId, 'REVIEW_REQUIRED');
      await client.query(`UPDATE payment_attempts SET status='REVIEW_REQUIRED',ended_at=clock_timestamp()
        WHERE id=$1 AND status='PENDING'`, [attempt.id]);
      await client.query('COMMIT');
      return review;
    }
    const stocks = await lockAndCheckStock(client, order.reservationId, order.id);
    const fulfillments = await lockPaymentFulfillments(client, order.id);
    if (!fulfillments) {
      const review = await finishEvent(client, eventId, 'REVIEW_REQUIRED');
      await client.query(`UPDATE payment_attempts SET status='REVIEW_REQUIRED',ended_at=clock_timestamp()
        WHERE id=$1 AND status='PENDING'`, [attempt.id]);
      await client.query('COMMIT');
      return review;
    }
    const paidAt = (await client.query<{ paidAt: Date }>(
      'SELECT clock_timestamp() AS "paidAt"',
    )).rows[0]?.paidAt;
    if (!(paidAt instanceof Date) || !Number.isFinite(paidAt.getTime())) {
      throw new Error('Payment timestamp unavailable');
    }
    await new PromotionUsageService(pool).markPaidInTransaction(client, uses.rows.map(({ id }) => id));
    await client.query(`UPDATE checkout_reservations SET status='CONSUMED',ended_at=clock_timestamp()
      WHERE id=$1 AND status='ACTIVE'`, [order.reservationId]);
    for (const stock of stocks) await client.query(`UPDATE inventory_levels
      SET on_hand_quantity=on_hand_quantity-$2,
        sellable_quantity=greatest(0,sellable_quantity-$2),updated_at=clock_timestamp()
      WHERE option_id=$1`, [stock.optionId, stock.quantity]);
    await client.query(`UPDATE checkout_orders SET status='PAID',paid_at=$2,ended_at=$2
      WHERE id=$1`, [order.id, paidAt]);
    await client.query(`UPDATE shipment_orders SET status='PAID' WHERE checkout_order_id=$1`, [order.id]);
    await openPaymentFulfillments(client, fulfillments, event.id, paidAt);
    await client.query(`INSERT INTO order_status_events (checkout_order_id,status,reason)
      VALUES ($1,'PAID','Verified payment')`, [order.id]);
    await client.query(`UPDATE payment_attempts SET status='APPROVED',ended_at=clock_timestamp()
      WHERE id=$1`, [attempt.id]);
    await recordPaidSettlement(client, { orderId: order.id, eventId: event.id,
      paidAt, payableWon: order.payableWon });
    const applied = await finishEvent(client, eventId, 'APPLIED');
    await queueNotificationEvent(client, { kind: 'payment_approved',
      sourceEventId: event.id, accountId: context.accountId });
    await client.query('COMMIT');
    return applied;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
