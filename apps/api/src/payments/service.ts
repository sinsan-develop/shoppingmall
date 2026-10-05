import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { resolvePaymentMode, type LocalOutcome, type VerifiedPayment } from './adapter.js';
import { MockPaymentAdapter, NoChargePaymentAdapter } from './mock-adapter.js';
import { findAttemptByKey, findAttemptForUpdate, findEventByProviderKey,
  findOwnedAttempt, insertAttempt, type PaymentAttemptView, type PaymentEventView } from './repository.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** Create one private provider attempt from an owned, still-payable order snapshot. */
export async function startPaymentAttempt(pool: Pool, accountId: string, orderId: string,
  idempotencyKey: string, testOutcome: LocalOutcome,
  env: { APP_ENV?: string; PAYMENT_MODE?: string } = process.env): Promise<PaymentAttemptView> {
  return (await startPaymentAttemptWithDisposition(pool, accountId, orderId,
    idempotencyKey, testOutcome, env)).view;
}

export async function startPaymentAttemptWithDisposition(pool: Pool, accountId: string, orderId: string,
  idempotencyKey: string, testOutcome: LocalOutcome,
  env: { APP_ENV?: string; PAYMENT_MODE?: string } = process.env): Promise<{
    view: PaymentAttemptView; created: boolean }> {
  if (!uuid.test(accountId) || !uuid.test(orderId) || !uuid.test(idempotencyKey) ||
      !['approve', 'decline', 'delay'].includes(testOutcome)) throw new Error('Invalid payment request');
  if (resolvePaymentMode(env) !== 'mock') throw new Error('Payment mode unavailable');
  const requestFingerprint = hash(JSON.stringify({ testOutcome }));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const actor = await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [accountId]);
    if (!actor.rowCount) throw new Error('Payment unavailable');
    const found = await client.query<{ id: string; payableWon: number; status: string; current: boolean }>(
      `SELECT id,payable_won AS "payableWon",status,
        expires_at>clock_timestamp() AS current FROM checkout_orders
       WHERE id=$1 AND account_id=$2 FOR UPDATE`, [orderId, accountId]);
    const order = found.rows[0];
    if (!order) throw new Error('Payment unavailable');
    const prior = await findAttemptByKey(client, orderId, idempotencyKey);
    if (prior) {
      if (prior.requestFingerprint !== requestFingerprint) throw new Error('Payment conflict');
      await client.query('COMMIT');
      return { view: { id: prior.id, status: prior.status, amountWon: prior.requestedWon }, created: false };
    }
    if (order.status !== 'PENDING_PAYMENT' || !order.current) throw new Error('Payment unavailable');
    const adapter = order.payableWon === 0 ? new NoChargePaymentAdapter() : new MockPaymentAdapter();
    if (order.payableWon === 0 && testOutcome !== 'approve') throw new Error('Invalid payment request');
    const { providerOrderId } = adapter.start(orderId, order.payableWon);
    const view = await insertAttempt(client, { orderId,
      provider: order.payableWon === 0 ? 'no_charge' : 'mock', providerOrderId,
      requestedWon: order.payableWon, idempotencyKey, requestFingerprint });
    await client.query('COMMIT');
    return { view, created: true };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505')
      throw new Error('Payment conflict');
    throw error;
  } finally { client.release(); }
}

/** Reading an attempt never confirms a payment. Foreign IDs are indistinguishable from absent ones. */
export async function getPaymentAttempt(pool: Pool, accountId: string, orderId: string,
  attemptId: string): Promise<PaymentAttemptView | null> {
  if (!uuid.test(accountId) || !uuid.test(orderId) || !uuid.test(attemptId)) return null;
  const client = await pool.connect();
  try { return await findOwnedAttempt(client, accountId, orderId, attemptId); }
  finally { client.release(); }
}

/** Preserve a normalized provider event before any order, coupon or stock transition. */
export async function recordVerifiedPaymentEvent(pool: Pool, attemptId: string,
  verified: VerifiedPayment): Promise<PaymentEventView> {
  if (!uuid.test(attemptId) || !verified || !['mock', 'no_charge'].includes(verified.provider) ||
      !uuid.test(verified.orderId) || !Number.isSafeInteger(verified.amountWon) ||
      verified.amountWon < 0 || verified.amountWon > 2147483647 ||
      !['APPROVED', 'DECLINED'].includes(verified.outcome) ||
      [verified.providerOrderId, verified.eventId, verified.paymentId].some(
        (value) => typeof value !== 'string' || value.length < 1 || value.length > 200))
    throw new Error('Invalid payment event');
  const fingerprint = hash(JSON.stringify({ attemptId, provider: verified.provider,
    providerOrderId: verified.providerOrderId, eventId: verified.eventId,
    paymentId: verified.paymentId, orderId: verified.orderId,
    amountWon: verified.amountWon, outcome: verified.outcome }));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const attempt = await findAttemptForUpdate(client, attemptId);
    if (!attempt || attempt.provider !== verified.provider) throw new Error('Payment unavailable');
    const prior = await findEventByProviderKey(client, verified.provider, verified.eventId);
    if (prior) {
      if (prior.paymentAttemptId !== attemptId || prior.eventFingerprint !== fingerprint)
        throw new Error('Payment event conflict');
      await client.query('COMMIT');
      return { id: prior.id, processingStatus: prior.processingStatus };
    }
    const mismatch = attempt.providerOrderId !== verified.providerOrderId ||
      attempt.checkoutOrderId !== verified.orderId || attempt.requestedWon !== verified.amountWon;
    const status = mismatch ? 'REVIEW_REQUIRED' : 'PENDING_PROCESSING';
    const inserted = await client.query<{ id: string }>(`INSERT INTO payment_events
      (payment_attempt_id,provider,provider_event_id,outcome,verified_order_id,
       provider_payment_id,amount_won,event_fingerprint,processing_status,processed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
        CASE WHEN $9='REVIEW_REQUIRED' THEN clock_timestamp() ELSE NULL END)
      ON CONFLICT (provider,provider_event_id) DO NOTHING RETURNING id`,
    [attemptId, verified.provider, verified.eventId, verified.outcome,
      verified.orderId, verified.paymentId, verified.amountWon, fingerprint, status]);
    if (!inserted.rows[0]) {
      const raced = await findEventByProviderKey(client, verified.provider, verified.eventId);
      if (!raced || raced.paymentAttemptId !== attemptId || raced.eventFingerprint !== fingerprint)
        throw new Error('Payment event conflict');
      await client.query('COMMIT');
      return { id: raced.id, processingStatus: raced.processingStatus };
    }
    if (mismatch && attempt.status === 'PENDING') await client.query(`UPDATE payment_attempts
      SET status='REVIEW_REQUIRED',ended_at=clock_timestamp() WHERE id=$1`, [attemptId]);
    await client.query('COMMIT');
    return { id: inserted.rows[0].id, processingStatus: status };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
