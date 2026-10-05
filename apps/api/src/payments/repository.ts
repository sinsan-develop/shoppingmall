import type { PoolClient } from 'pg';

export type PaymentAttemptRow = {
  id: string; checkoutOrderId: string; provider: 'mock' | 'no_charge';
  providerOrderId: string; requestedWon: number; status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'REVIEW_REQUIRED';
  requestFingerprint: string;
};
export type PaymentAttemptView = { id: string; status: PaymentAttemptRow['status']; amountWon: number };
export type PaymentEventView = {
  id: string; processingStatus: 'PENDING_PROCESSING' | 'APPLIED' | 'REVIEW_REQUIRED';
};

export async function findAttemptByKey(client: PoolClient, orderId: string,
  key: string): Promise<PaymentAttemptRow | null> {
  const found = await client.query<PaymentAttemptRow>(`SELECT id,
    checkout_order_id AS "checkoutOrderId",provider,provider_order_id AS "providerOrderId",
    requested_won AS "requestedWon",status,request_fingerprint AS "requestFingerprint"
    FROM payment_attempts WHERE checkout_order_id=$1 AND idempotency_key=$2`, [orderId, key]);
  return found.rows[0] ?? null;
}

export async function findAttemptForUpdate(client: PoolClient,
  attemptId: string): Promise<PaymentAttemptRow | null> {
  const found = await client.query<PaymentAttemptRow>(`SELECT id,
    checkout_order_id AS "checkoutOrderId",provider,provider_order_id AS "providerOrderId",
    requested_won AS "requestedWon",status,request_fingerprint AS "requestFingerprint"
    FROM payment_attempts WHERE id=$1 FOR UPDATE`, [attemptId]);
  return found.rows[0] ?? null;
}

export async function insertAttempt(client: PoolClient, input: {
  orderId: string; provider: PaymentAttemptRow['provider']; providerOrderId: string;
  requestedWon: number; idempotencyKey: string; requestFingerprint: string;
}): Promise<PaymentAttemptView> {
  const result = await client.query<{ id: string }>(`INSERT INTO payment_attempts
    (checkout_order_id,provider,provider_order_id,requested_won,idempotency_key,request_fingerprint)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
  [input.orderId, input.provider, input.providerOrderId, input.requestedWon,
    input.idempotencyKey, input.requestFingerprint]);
  return { id: result.rows[0].id, status: 'PENDING', amountWon: input.requestedWon };
}

export async function findOwnedAttempt(client: PoolClient, accountId: string,
  orderId: string, attemptId: string): Promise<PaymentAttemptView | null> {
  const found = await client.query<{ id: string; status: PaymentAttemptRow['status']; amountWon: number }>(
    `SELECT a.id,a.status,a.requested_won AS "amountWon"
     FROM payment_attempts a JOIN checkout_orders o ON o.id=a.checkout_order_id
     WHERE a.id=$1 AND a.checkout_order_id=$2 AND o.account_id=$3`,
  [attemptId, orderId, accountId]);
  return found.rows[0] ?? null;
}

export async function findEventByProviderKey(client: PoolClient,
  provider: string, eventId: string): Promise<(PaymentEventView & {
    paymentAttemptId: string; eventFingerprint: string;
  }) | null> {
  const found = await client.query<PaymentEventView & {
    paymentAttemptId: string; eventFingerprint: string;
  }>(`SELECT id,processing_status AS "processingStatus",
    payment_attempt_id AS "paymentAttemptId",event_fingerprint AS "eventFingerprint"
    FROM payment_events WHERE provider=$1 AND provider_event_id=$2`, [provider, eventId]);
  return found.rows[0] ?? null;
}
