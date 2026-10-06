import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { ImageQuarantine } from '../catalog/image-quarantine.js';
import { parseQuestionPageQuery } from './questions.js';

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
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
      [`support-review-mutation:${input.customerAccountId}:${input.idempotencyKey}`]);
    const retry = (await client.query<{ reviewId: string; afterValue: { rating: number;
      body: string; version: number; kind?: string } }>(`SELECT review_id AS "reviewId",
      after_value AS "afterValue" FROM support_review_events
      WHERE actor_account_id=$1 AND action='EDITED'
        AND after_value->>'idempotencyKey'=$2 ORDER BY event_seq DESC LIMIT 1`,
    [input.customerAccountId, input.idempotencyKey])).rows[0];
    if (retry) {
      if (retry.reviewId !== input.reviewId || retry.afterValue.kind === 'IMAGE_ADDED' ||
          retry.afterValue.rating !== input.rating || retry.afterValue.body !== body)
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

export async function addReviewImage(db: Db, input: {
  reviewId: string; customerAccountId: string; idempotencyKey: string;
  bytes: Buffer; mimeType: string; store: ImageQuarantine;
}) {
  if (![input.reviewId, input.customerAccountId, input.idempotencyKey]
    .every((id) => uuid.test(id)) || !Buffer.isBuffer(input.bytes) ||
      !['image/png','image/jpeg','image/webp'].includes(input.mimeType))
    throw new Error('Invalid support request');
  const requestSha256 = createHash('sha256').update(input.bytes).digest('hex');
  let objectKey: string | undefined;
  try {
    return await inReviewTransaction(db, async (client) => {
      const review = (await client.query<ReviewRow & { rating: number; body: string }>(`
        SELECT id,status,version,rating,body FROM support_reviews
        WHERE id=$1 AND customer_account_id=$2 FOR UPDATE`,
      [input.reviewId, input.customerAccountId])).rows[0];
      if (!review) throw new Error('Support unavailable');
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
        [`support-review-mutation:${input.customerAccountId}:${input.idempotencyKey}`]);
      const retry = (await client.query<{ reviewId: string; afterValue: {
        kind?: string; imageId?: string; requestSha256?: string; mimeType?: string;
        version?: number } }>(`SELECT review_id AS "reviewId",after_value AS "afterValue"
        FROM support_review_events WHERE actor_account_id=$1 AND action='EDITED'
          AND after_value->>'idempotencyKey'=$2 ORDER BY event_seq DESC LIMIT 1`,
      [input.customerAccountId, input.idempotencyKey])).rows[0];
      if (retry) {
        if (retry.reviewId !== input.reviewId || retry.afterValue.kind !== 'IMAGE_ADDED' ||
            retry.afterValue.requestSha256 !== requestSha256 ||
            retry.afterValue.mimeType !== input.mimeType)
          throw new Error('Support conflict');
        const priorImage = (await client.query<{ id: string; mimeType: string;
          sizeBytes: number }>(`SELECT id,mime_type AS "mimeType",size_bytes AS "sizeBytes"
          FROM support_review_images WHERE id=$1 AND review_id=$2`,
        [retry.afterValue.imageId, input.reviewId])).rows[0];
        if (!priorImage) throw new Error('Support unavailable');
        return { ...priorImage, version: retry.afterValue.version! };
      }
      if (review.status === 'HIDDEN') throw new Error('Support conflict');
      const count = (await client.query<{ n: number }>(`
        SELECT count(*)::int AS n FROM support_review_images WHERE review_id=$1`,
      [review.id])).rows[0].n;
      if (count >= 5) throw new Error('Support image limit');
      const saved = await input.store.put(input.bytes, input.mimeType);
      objectKey = saved.objectKey;
      const image = (await client.query<{ id: string }>(`
        INSERT INTO support_review_images(review_id,object_key,mime_type,size_bytes)
        VALUES ($1,$2,$3,$4) RETURNING id`,
      [review.id, saved.objectKey, saved.mimeType, saved.sizeBytes])).rows[0];
      const version = review.version + 1;
      await client.query(`UPDATE support_reviews SET status='PENDING',rating=$2,body=$3,
        version=$4,approved_by=NULL,approved_at=NULL,updated_at=now()
        WHERE id=$1`, [review.id, review.rating, review.body, version]);
      await client.query(`INSERT INTO support_review_events
        (review_id,action,actor_account_id,actor_role,before_value,after_value)
        VALUES ($1,'EDITED',$2,'customer',$3::jsonb,$4::jsonb)`,
      [review.id, input.customerAccountId,
        JSON.stringify({ rating: review.rating, body: review.body,
          version: review.version, status: review.status }),
        JSON.stringify({ kind: 'IMAGE_ADDED', imageId: image.id,
          requestSha256, mimeType: input.mimeType, idempotencyKey: input.idempotencyKey,
          rating: review.rating, body: review.body, version, status: 'PENDING' })]);
      return { id: image.id, mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes, version };
    });
  } catch (error) {
    if (objectKey) {
      try { await input.store.remove(objectKey); }
      catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Review image rollback left a private file');
      }
    }
    throw error;
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
    FROM support_review_events WHERE review_id=$1 AND action<>'REPORTED'
    ORDER BY event_seq`, [reviewId])).rows;
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

async function inReviewTransaction<T>(db: Db, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!(db instanceof Pool)) return operation(db as PoolClient);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function approveReview(db: Db, input: { reviewId: string; adminAccountId: string;
  idempotencyKey: string; store?: ImageQuarantine;
  scan?: (bytes: Buffer) => Promise<void> }) {
  if (!uuid.test(input.reviewId) || !uuid.test(input.adminAccountId) ||
      !uuid.test(input.idempotencyKey))
    throw new Error('Invalid support request');
  return inReviewTransaction(db, async (client) => {
    const review = (await client.query<ReviewRow & { rating: number; body: string }>(`
      SELECT id,status,version,rating,body FROM support_reviews WHERE id=$1 FOR UPDATE`,
    [input.reviewId])).rows[0];
    if (!review) throw new Error('Support unavailable');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
      [`support-review-approve:${input.adminAccountId}:${input.idempotencyKey}`]);
    const retry = (await client.query<{ reviewId: string; version: number }>(`
      SELECT review_id AS "reviewId",(after_value->>'version')::int AS version
      FROM support_review_events WHERE action='APPROVED' AND actor_account_id=$1
        AND after_value->>'idempotencyKey'=$2`,
    [input.adminAccountId, input.idempotencyKey])).rows[0];
    if (retry) {
      if (retry.reviewId !== review.id) throw new Error('Support conflict');
      return { id: review.id, status: 'APPROVED', version: retry.version };
    }
    if (review.status !== 'PENDING') throw new Error('Support conflict');
    const images = (await client.query<{ id: string; objectKey: string }>(`
      SELECT id,object_key AS "objectKey" FROM support_review_images
      WHERE review_id=$1 ORDER BY id FOR UPDATE`, [review.id])).rows;
    const imageHashes: Record<string, string> = {};
    for (const image of images) {
      if (!input.store || !input.scan) throw new Error('Support scan unavailable');
      try {
        const bytes = await input.store.read(image.objectKey);
        await input.scan(bytes);
        const digest = createHash('sha256').update(bytes).digest('hex');
        const current = await input.store.read(image.objectKey);
        if (createHash('sha256').update(current).digest('hex') !== digest)
          throw new Error('Support scan unavailable');
        imageHashes[image.id] = digest;
        await client.query(`UPDATE support_review_images
          SET scan_status='PASS',scanned_at=now() WHERE id=$1`, [image.id]);
      } catch { throw new Error('Support scan unavailable'); }
    }
    await client.query(`UPDATE support_reviews SET status='APPROVED',approved_by=$2,
      approved_at=now(),updated_at=now() WHERE id=$1`, [review.id, input.adminAccountId]);
    await client.query(`INSERT INTO support_review_events
      (review_id,action,actor_account_id,actor_role,before_value,after_value)
      VALUES ($1,'APPROVED',$2,'admin',$3::jsonb,$4::jsonb)`,
    [review.id, input.adminAccountId,
      JSON.stringify({ status: review.status, version: review.version }),
      JSON.stringify({ status: 'APPROVED', version: review.version,
        idempotencyKey: input.idempotencyKey, imageHashes })]);
    return { id: review.id, status: 'APPROVED', version: review.version };
  });
}

export async function reportReview(db: Db, input: {
  reviewId: string; customerAccountId: string; reason: string;
}) {
  if (!uuid.test(input.reviewId) || !uuid.test(input.customerAccountId) ||
      typeof input.reason !== 'string' || !input.reason.trim() ||
      input.reason.trim().length > 500) throw new Error('Invalid support request');
  const reason = input.reason.trim();
  return inReviewTransaction(db, async (client) => {
    const review = (await client.query(`SELECT id FROM support_reviews
      WHERE id=$1 AND status='APPROVED'`, [input.reviewId])).rows[0];
    if (!review) throw new Error('Support unavailable');
    const created = (await client.query<{ id: string }>(`INSERT INTO support_review_reports
      (review_id,reporter_account_id,reason) VALUES ($1,$2,$3)
      ON CONFLICT (review_id,reporter_account_id) DO NOTHING RETURNING id`,
    [input.reviewId, input.customerAccountId, reason])).rows[0];
    if (created) {
      await client.query(`INSERT INTO support_review_events
        (review_id,action,actor_account_id,actor_role,reason)
        VALUES ($1,'REPORTED',$2,'customer',$3)`,
      [input.reviewId, input.customerAccountId, reason]);
      return { id: created.id };
    }
    const existing = (await client.query<{ id: string; reason: string }>(`
      SELECT id,reason FROM support_review_reports
      WHERE review_id=$1 AND reporter_account_id=$2`,
    [input.reviewId, input.customerAccountId])).rows[0];
    if (!existing) throw new Error('Support unavailable');
    if (existing.reason !== reason) throw new Error('Support conflict');
    return { id: existing.id };
  });
}

export async function hideReview(db: Db, input: {
  reviewId: string; adminAccountId: string; reason: string; idempotencyKey: string;
}) {
  if (!uuid.test(input.reviewId) || !uuid.test(input.adminAccountId) ||
      !uuid.test(input.idempotencyKey) ||
      typeof input.reason !== 'string' || !input.reason.trim() ||
      input.reason.trim().length > 500) throw new Error('Invalid support request');
  const reason = input.reason.trim();
  return inReviewTransaction(db, async (client) => {
    const review = (await client.query<ReviewRow>(`
      SELECT id,status,version
      FROM support_reviews WHERE id=$1 FOR UPDATE`, [input.reviewId])).rows[0];
    if (!review) throw new Error('Support unavailable');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
      [`support-review-hide:${input.adminAccountId}:${input.idempotencyKey}`]);
    const retry = (await client.query<{ reviewId: string; reason: string; version: number }>(`
      SELECT review_id AS "reviewId",reason,(after_value->>'version')::int AS version
      FROM support_review_events WHERE action='HIDDEN' AND actor_account_id=$1
        AND after_value->>'idempotencyKey'=$2`,
    [input.adminAccountId, input.idempotencyKey])).rows[0];
    if (retry) {
      if (retry.reviewId !== review.id || retry.reason !== reason)
        throw new Error('Support conflict');
      return { id: review.id, status: 'HIDDEN', version: retry.version };
    }
    if (review.status === 'HIDDEN') {
      throw new Error('Support conflict');
    }
    await client.query(`UPDATE support_reviews SET status='HIDDEN',hidden_by=$2,
      hidden_at=now(),hidden_reason=$3,updated_at=now() WHERE id=$1`,
    [review.id, input.adminAccountId, reason]);
    await client.query(`INSERT INTO support_review_events
      (review_id,action,actor_account_id,actor_role,reason,before_value,after_value)
      VALUES ($1,'HIDDEN',$2,'admin',$3,$4::jsonb,$5::jsonb)`,
    [review.id, input.adminAccountId, reason,
      JSON.stringify({ status: review.status, version: review.version }),
      JSON.stringify({ status: 'HIDDEN', version: review.version,
        idempotencyKey: input.idempotencyKey })]);
    return { id: review.id, status: 'HIDDEN', version: review.version };
  });
}

export async function listPublicReviews(db: Db, productId: string,
  page: ReturnType<typeof parseQuestionPageQuery> = { limit: 20 }) {
  if (!uuid.test(productId)) throw new Error('Invalid support request');
  const results = (await db.query<{ id: string; rating: number; body: string;
    version: number; createdAt: Date; cursorTime: string; imageIds: string[] }>(`
    SELECT r.id,r.rating,r.body,r.version,
    r.created_at AS "createdAt",
    COALESCE((SELECT array_agg(image.id ORDER BY image.id) FROM support_review_images image
      WHERE image.review_id=r.id AND image.scan_status='PASS'),ARRAY[]::uuid[]) AS "imageIds",
    to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorTime"
    FROM support_reviews r
    JOIN product_publications pub ON pub.product_id=r.product_id
    JOIN product_revisions revision ON revision.id=pub.revision_id
      AND revision.product_id=r.product_id
    WHERE r.product_id=$1 AND r.status='APPROVED' AND revision.status='approved'
      AND NOT EXISTS (SELECT 1 FROM support_review_images image
        WHERE image.review_id=r.id AND image.scan_status<>'PASS')
      AND ($2::timestamptz IS NULL OR
        (r.created_at,r.id)<($2::timestamptz,$3::uuid))
    ORDER BY r.created_at DESC,r.id DESC LIMIT $4`,
  [productId, page.cursor?.createdAt ?? null, page.cursor?.id ?? null,
    page.limit + 1])).rows;
  const rows = results.slice(0, page.limit);
  const last = rows.at(-1);
  return { items: rows.map(({ id, rating, body, version, createdAt, imageIds }) =>
    ({ id, rating, body, version, createdAt, imageIds })),
    nextCursor: results.length > page.limit && last ? Buffer.from(JSON.stringify({
      createdAt: last.cursorTime, id: last.id,
    })).toString('base64url') : null };
}

export async function readPublicReviewImage(db: Db, input: {
  productId: string; reviewId: string; imageId: string; store: ImageQuarantine;
}) {
  if (![input.productId, input.reviewId, input.imageId].every((id) => uuid.test(id)))
    throw new Error('Invalid support request');
  const image = (await db.query<{ objectKey: string; imageHashes: Record<string, string> }>(`
    SELECT image.object_key AS "objectKey",event.after_value->'imageHashes' AS "imageHashes"
    FROM support_review_images image
    JOIN support_reviews review ON review.id=image.review_id
    JOIN product_publications pub ON pub.product_id=review.product_id
    JOIN product_revisions revision ON revision.id=pub.revision_id
      AND revision.product_id=review.product_id
    JOIN LATERAL (SELECT after_value FROM support_review_events
      WHERE review_id=review.id AND action='APPROVED'
      ORDER BY event_seq DESC LIMIT 1) event ON true
    WHERE review.product_id=$1 AND review.id=$2 AND image.id=$3
      AND review.status='APPROVED' AND image.scan_status='PASS'
      AND revision.status='approved'`,
  [input.productId, input.reviewId, input.imageId])).rows[0];
  if (!image || !/^[0-9a-f]{64}$/.test(image.imageHashes?.[input.imageId] ?? ''))
    throw new Error('Support unavailable');
  try {
    const bytes = await input.store.read(image.objectKey);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== image.imageHashes[input.imageId]) throw new Error('Support image unavailable');
    return bytes;
  } catch { throw new Error('Support image unavailable'); }
}

export async function readPrivateReviewImage(db: Db, input: {
  reviewId: string; imageId: string; actorRole: 'customer' | 'admin';
  actorAccountId: string; store: ImageQuarantine;
}) {
  if (![input.reviewId, input.imageId, input.actorAccountId].every((id) => uuid.test(id)))
    throw new Error('Invalid support request');
  const image = (await db.query<{ objectKey: string }>(`
    SELECT image.object_key AS "objectKey" FROM support_review_images image
    JOIN support_reviews review ON review.id=image.review_id
    WHERE review.id=$1 AND image.id=$2
      AND ($3::text='admin' OR review.customer_account_id=$4::uuid)`,
  [input.reviewId, input.imageId, input.actorRole, input.actorAccountId])).rows[0];
  if (!image) throw new Error('Support unavailable');
  try { return await input.store.read(image.objectKey); }
  catch { throw new Error('Support image unavailable'); }
}

export function parseReviewPageQuery(query: Record<string, unknown>, admin = false) {
  if (!admin) return parseQuestionPageQuery(query);
  if (!query || typeof query !== 'object') throw new Error('Invalid support request');
  const { status, ...pageQuery } = query;
  if (status !== undefined && (typeof status !== 'string' ||
      !['PENDING','APPROVED','HIDDEN'].includes(status)))
    throw new Error('Invalid support request');
  const page = parseQuestionPageQuery(pageQuery);
  return { ...page, ...(status === undefined ? {} : { status }) };
}

export async function listAdminReviews(db: Db,
  page: ReturnType<typeof parseReviewPageQuery>) {
  const results = (await db.query<{ id: string; productId: string; confirmationId: string;
    rating: number; body: string; status: string; version: number; createdAt: Date;
    reportCount: number; cursorTime: string }>(`SELECT r.id,r.product_id AS "productId",
    r.confirmation_id AS "confirmationId",r.rating,r.body,r.status,r.version,
    r.created_at AS "createdAt",
    to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorTime",
    (SELECT count(*)::int FROM support_review_reports report
      WHERE report.review_id=r.id) AS "reportCount"
    FROM support_reviews r
    WHERE ($1::text IS NULL OR r.status=$1::text)
      AND ($2::timestamptz IS NULL OR
        (r.created_at,r.id)<($2::timestamptz,$3::uuid))
    ORDER BY r.created_at DESC,r.id DESC LIMIT $4`,
  [page.status ?? null, page.cursor?.createdAt ?? null,
    page.cursor?.id ?? null, page.limit + 1])).rows;
  const rows = results.slice(0, page.limit);
  const last = rows.at(-1);
  return { items: rows.map(({ id, productId, confirmationId, rating, body,
    status, version, createdAt, reportCount }) => ({ id, productId, confirmationId,
    rating, body, status, version, createdAt, reportCount })),
    nextCursor: results.length > page.limit && last ? Buffer.from(JSON.stringify({
      createdAt: last.cursorTime, id: last.id,
    })).toString('base64url') : null };
}

export async function getAdminReview(db: Db, reviewId: string) {
  if (!uuid.test(reviewId)) throw new Error('Invalid support request');
  const review = (await db.query<{ id: string; confirmationId: string; productId: string;
    customerAccountId: string; rating: number; body: string; status: string;
    version: number; createdAt: Date; updatedAt: Date }>(`SELECT id,
    confirmation_id AS "confirmationId",product_id AS "productId",
    customer_account_id AS "customerAccountId",rating,body,status,version,
    created_at AS "createdAt",updated_at AS "updatedAt"
    FROM support_reviews WHERE id=$1`, [reviewId])).rows[0];
  if (!review) return undefined;
  const images = await db.query<{ id: string; mimeType: string; sizeBytes: number;
    scanStatus: string }>(`
      SELECT id,mime_type AS "mimeType",size_bytes AS "sizeBytes",
      scan_status AS "scanStatus" FROM support_review_images
      WHERE review_id=$1 ORDER BY created_at,id`, [reviewId]);
  const reports = await db.query<{ id: string; reporterAccountId: string; reason: string;
      reportedAt: Date }>(`SELECT id,reporter_account_id AS "reporterAccountId",
      reason,reported_at AS "reportedAt" FROM support_review_reports
      WHERE review_id=$1 ORDER BY reported_at,id`, [reviewId]);
  const events = await db.query<{ action: string; actorRole: string; actorAccountId: string;
      reason: string | null; beforeValue: Record<string, unknown>;
      afterValue: Record<string, unknown>; occurredAt: Date }>(`
      SELECT action,actor_role AS "actorRole",actor_account_id AS "actorAccountId",
      reason,before_value AS "beforeValue",after_value AS "afterValue",
      occurred_at AS "occurredAt"
      FROM support_review_events WHERE review_id=$1 ORDER BY event_seq`, [reviewId]);
  const snapshot = (value: Record<string, unknown>) => ({
    ...(typeof value.rating === 'number' ? { rating: value.rating } : {}),
    ...(typeof value.body === 'string' ? { body: value.body } : {}),
    ...(typeof value.version === 'number' ? { version: value.version } : {}),
    ...(typeof value.status === 'string' ? { status: value.status } : {}),
  });
  return { ...review, images: images.rows, reports: reports.rows,
    events: events.rows.map((event) => ({
      action: event.action, actorRole: event.actorRole,
      actorAccountId: event.actorAccountId, reason: event.reason,
      beforeValue: snapshot(event.beforeValue), afterValue: snapshot(event.afterValue),
      occurredAt: event.occurredAt,
    })) };
}
