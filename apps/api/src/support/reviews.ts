import { Pool } from 'pg';
import type { PoolClient } from 'pg';

type Db = Pool | PoolClient;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type ReviewRow = { id: string; status: string; version: number };

function validateContent(rating: number, body: string) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 ||
      typeof body !== 'string' || !body.trim() || body.trim().length > 2000)
    throw new Error('Invalid support request');
  return body.trim();
}

export async function createReview(db: Db, input: {
  confirmationId: string; customerAccountId: string; rating: number; body: string;
  idempotencyKey: string;
}): Promise<ReviewRow> {
  if (!uuid.test(input.confirmationId) || !uuid.test(input.customerAccountId) ||
      !uuid.test(input.idempotencyKey))
    throw new Error('Invalid support request');
  const body = validateContent(input.rating, input.body);
  const ownsTransaction = db instanceof Pool;
  const client = ownsTransaction ? await (db as Pool).connect() : db as PoolClient;
  try {
    if (ownsTransaction) await client.query('BEGIN');
    const confirmation = (await client.query(`SELECT id FROM support_purchase_confirmations
      WHERE id=$1 AND customer_account_id=$2`,
    [input.confirmationId, input.customerAccountId])).rows[0];
    if (!confirmation) throw new Error('Support unavailable');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
      [`support-review-create:${input.customerAccountId}:${input.idempotencyKey}`]);
    const keyed = (await client.query<ReviewRow & { confirmationId: string;
      initial: { rating: number; body: string } }>(`SELECT r.id,r.status,r.version,
      r.confirmation_id AS "confirmationId",e.after_value AS initial
      FROM support_review_events e JOIN support_reviews r ON r.id=e.review_id
      WHERE e.action='CREATED' AND r.customer_account_id=$1
        AND e.after_value->>'idempotencyKey'=$2`,
    [input.customerAccountId, input.idempotencyKey])).rows[0];
    if (keyed) {
      if (keyed.confirmationId !== input.confirmationId ||
          keyed.initial.rating !== input.rating || keyed.initial.body !== body)
        throw new Error('Support conflict');
      if (ownsTransaction) await client.query('COMMIT');
      return { id: keyed.id, status: keyed.status, version: keyed.version };
    }
    const created = await client.query<ReviewRow>(`WITH review AS (
    INSERT INTO support_reviews(confirmation_id,product_id,customer_account_id,rating,body)
    SELECT c.id,c.product_id,c.customer_account_id,$3,$4
    FROM support_purchase_confirmations c
    WHERE c.id=$1 AND c.customer_account_id=$2
    ON CONFLICT (confirmation_id) DO NOTHING
    RETURNING id,status,version,rating,body
  ), event AS (
    INSERT INTO support_review_events
      (review_id,action,actor_account_id,actor_role,before_value,after_value)
    SELECT id,'CREATED',$2,'customer','{}'::jsonb,
      jsonb_build_object('rating',rating,'body',body,'version',version,
        'idempotencyKey',$5::text)
    FROM review RETURNING review_id
  ) SELECT review.id,review.status,review.version FROM review
    JOIN event ON event.review_id=review.id`,
    [input.confirmationId, input.customerAccountId, input.rating, body,
      input.idempotencyKey]);
    if (created.rows[0]) {
      if (ownsTransaction) await client.query('COMMIT');
      return created.rows[0];
    }
    const existing = (await client.query<ReviewRow & { initial: { rating: number;
      body: string; idempotencyKey?: string } }>(`
    SELECT r.id,r.status,r.version,e.after_value AS initial
    FROM support_reviews r JOIN support_review_events e ON e.review_id=r.id AND e.action='CREATED'
    WHERE r.confirmation_id=$1 AND r.customer_account_id=$2`,
    [input.confirmationId, input.customerAccountId])).rows[0];
    if (existing) {
      if (existing.initial.idempotencyKey !== input.idempotencyKey ||
          existing.initial.rating !== input.rating || existing.initial.body !== body)
      throw new Error('Support conflict');
      if (ownsTransaction) await client.query('COMMIT');
      return { id: existing.id, status: existing.status, version: existing.version };
    }
    throw new Error('Support unavailable');
  } catch (error) {
    if (ownsTransaction) await client.query('ROLLBACK');
    throw error;
  } finally {
    if (ownsTransaction) client.release();
  }
}

export async function editReview(db: Db, input: {
  reviewId: string; customerAccountId: string; rating: number; body: string;
  idempotencyKey: string;
}): Promise<ReviewRow> {
  if (!uuid.test(input.reviewId) || !uuid.test(input.customerAccountId) ||
      !uuid.test(input.idempotencyKey))
    throw new Error('Invalid support request');
  const body = validateContent(input.rating, input.body);
  const ownsTransaction = db instanceof Pool;
  const client = ownsTransaction ? await (db as Pool).connect() : db as PoolClient;
  try {
    if (ownsTransaction) await client.query('BEGIN');
    const current = (await client.query<{ id: string; rating: number; body: string;
      status: string; version: number }>(`SELECT id,rating,body,status,version
      FROM support_reviews WHERE id=$1 AND customer_account_id=$2 FOR UPDATE`,
    [input.reviewId, input.customerAccountId])).rows[0];
    if (!current) throw new Error('Support unavailable');
    const retry = (await client.query<{ afterValue: { rating: number; body: string;
      version: number } }>(`SELECT after_value AS "afterValue" FROM support_review_events
      WHERE review_id=$1 AND actor_account_id=$2 AND action='EDITED'
        AND after_value->>'idempotencyKey'=$3 ORDER BY event_seq DESC LIMIT 1`,
    [input.reviewId, input.customerAccountId, input.idempotencyKey])).rows[0];
    if (retry) {
      if (retry.afterValue.rating !== input.rating || retry.afterValue.body !== body)
        throw new Error('Support conflict');
      if (ownsTransaction) await client.query('COMMIT');
      return { id: current.id, status: 'PENDING', version: retry.afterValue.version };
    }
    if (current.status === 'HIDDEN') throw new Error('Support conflict');
    const version = current.version + 1;
    await client.query(`UPDATE support_reviews SET rating=$2,body=$3,status='PENDING',
      version=$4,approved_by=NULL,approved_at=NULL,updated_at=now() WHERE id=$1`,
    [current.id, input.rating, body, version]);
    await client.query(`INSERT INTO support_review_events
      (review_id,action,actor_account_id,actor_role,before_value,after_value)
      VALUES ($1,'EDITED',$2,'customer',$3::jsonb,$4::jsonb)`,
    [current.id, input.customerAccountId,
      JSON.stringify({ rating: current.rating, body: current.body, version: current.version }),
      JSON.stringify({ rating: input.rating, body, version, idempotencyKey: input.idempotencyKey })]);
    if (ownsTransaction) await client.query('COMMIT');
    return { id: current.id, status: 'PENDING', version };
  } catch (error) {
    if (ownsTransaction) await client.query('ROLLBACK');
    throw error;
  } finally {
    if (ownsTransaction) client.release();
  }
}

export async function getCustomerReview(db: Db, customerAccountId: string, reviewId: string) {
  if (!uuid.test(customerAccountId) || !uuid.test(reviewId))
    throw new Error('Invalid support request');
  const review = (await db.query<ReviewRow & { confirmationId: string; productId: string;
    rating: number; body: string }>(`SELECT id,confirmation_id AS "confirmationId",
    product_id AS "productId",rating,body,status,version
    FROM support_reviews WHERE id=$1 AND customer_account_id=$2`,
  [reviewId, customerAccountId])).rows[0];
  if (!review) return undefined;
  const events = (await db.query<{ action: string; actorRole: string; reason: string | null;
    beforeValue: Record<string, unknown>; afterValue: Record<string, unknown>;
    occurredAt: Date }>(`SELECT action,actor_role AS "actorRole",reason,
      before_value AS "beforeValue",after_value AS "afterValue",occurred_at AS "occurredAt"
    FROM support_review_events WHERE review_id=$1 ORDER BY event_seq`, [reviewId])).rows;
  const content = (value: Record<string, unknown>) => ({
    ...(typeof value.rating === 'number' ? { rating: value.rating } : {}),
    ...(typeof value.body === 'string' ? { body: value.body } : {}),
    ...(typeof value.version === 'number' ? { version: value.version } : {}),
  });
  return { ...review, events: events.map((event) => ({
    action: event.action, actorRole: event.actorRole, reason: event.reason,
    beforeValue: content(event.beforeValue), afterValue: content(event.afterValue),
    occurredAt: event.occurredAt,
  })) };
}
