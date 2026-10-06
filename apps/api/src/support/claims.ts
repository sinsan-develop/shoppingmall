import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import type { ImageQuarantine } from '../catalog/image-quarantine.js';
import { parseQuestionPageQuery } from './questions.js';

type Db = Pool | PoolClient;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kinds = new Set(['CLAIM','RETURN','EXCHANGE']);
const reasonCodes = new Set(['quality_issue','damaged','wrong_delivery','change_of_mind','other']);

type ClaimInput = {
  customerAccountId: string; orderId: string; shipmentOrderId: string; optionId: string;
  kind: string; reasonCode: string; reason: string; quantity: number;
  idempotencyKey: string;
};

export async function createClaim(db: Db, input: ClaimInput) {
  if (![input.customerAccountId,input.orderId,input.shipmentOrderId,input.optionId,
    input.idempotencyKey].every((id) => uuid.test(id)) || !kinds.has(input.kind) ||
      !reasonCodes.has(input.reasonCode) || typeof input.reason !== 'string' ||
      !input.reason.trim() || input.reason.trim().length > 2000 ||
      !Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 1000000)
    throw new Error('Invalid support request');
  const reason = input.reason.trim();
  const ownsTransaction = db instanceof Pool;
  const client = ownsTransaction ? await db.connect() : db as PoolClient;
  try {
    if (ownsTransaction) await client.query('BEGIN');
    const shipment = (await client.query(`SELECT shipment.id FROM shipment_orders shipment
      JOIN checkout_orders checkout ON checkout.id=shipment.checkout_order_id
      WHERE checkout.id=$1 AND shipment.id=$2 AND checkout.account_id=$3
        AND checkout.status='PAID' AND shipment.status='PAID'
      FOR UPDATE OF shipment`,
    [input.orderId, input.shipmentOrderId, input.customerAccountId])).rows[0];
    if (!shipment) throw new Error('Support unavailable');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
      [`support-claim-create:${input.customerAccountId}:${input.idempotencyKey}`]);
    const prior = (await client.query<{ id: string; status: string;
      checkoutOrderId: string; shipmentOrderId: string; optionId: string;
      kind: string; reasonCode: string; reason: string; quantity: number }>(`
      SELECT id,status,checkout_order_id AS "checkoutOrderId",
        shipment_order_id AS "shipmentOrderId",option_id AS "optionId",
        kind,reason_code AS "reasonCode",reason,quantity
      FROM support_claims WHERE customer_account_id=$1 AND idempotency_key=$2`,
    [input.customerAccountId, input.idempotencyKey])).rows[0];
    if (prior) {
      if (prior.checkoutOrderId !== input.orderId ||
          prior.shipmentOrderId !== input.shipmentOrderId || prior.optionId !== input.optionId ||
          prior.kind !== input.kind || prior.reasonCode !== input.reasonCode ||
          prior.reason !== reason || prior.quantity !== input.quantity)
        throw new Error('Support conflict');
      if (ownsTransaction) await client.query('COMMIT');
      return { id: prior.id, status: prior.status };
    }
    const fulfillment = (await client.query(`SELECT shipment_order_id
      FROM shipment_fulfillments WHERE shipment_order_id=$1 AND status='SHIPPED'
      FOR UPDATE`, [input.shipmentOrderId])).rows[0];
    if (!fulfillment) throw new Error('Support unavailable');
    const shippedEvent = await client.query(`SELECT 1 FROM shipment_fulfillment_events
      WHERE shipment_order_id=$1 AND action='MARK_SHIPPED' AND to_status='SHIPPED'
      LIMIT 1`, [input.shipmentOrderId]);
    if (!shippedEvent.rowCount) throw new Error('Support unavailable');
    const line = (await client.query<{ productId: string; sellerId: string;
      quantity: number }>(`SELECT product_id AS "productId",seller_id AS "sellerId",quantity
      FROM shipment_order_lines WHERE shipment_order_id=$1 AND option_id=$2
      FOR UPDATE`, [input.shipmentOrderId, input.optionId])).rows[0];
    if (!line) throw new Error('Support unavailable');
    const used = (await client.query<{ quantity: number }>(`
      SELECT COALESCE(sum(quantity),0)::int AS quantity FROM support_claims
      WHERE shipment_order_id=$1 AND option_id=$2 AND status<>'REJECTED'`,
    [input.shipmentOrderId, input.optionId])).rows[0].quantity;
    const preOccupied = (await client.query<{ quantity: number }>(`
      SELECT COALESCE(sum(refund_line.quantity),0)::int AS quantity
      FROM refund_case_lines refund_line
      JOIN refund_cases refund ON refund.id=refund_line.refund_case_id
      WHERE refund_line.shipment_order_id=$1 AND refund_line.option_id=$2
        AND refund.post_shipment_claim_id IS NULL
        AND refund.status IN ('APPROVED','PROCESSING','REFUNDED','REVIEW_REQUIRED')`,
    [input.shipmentOrderId, input.optionId])).rows[0].quantity;
    if (preOccupied + used + input.quantity > line.quantity)
      throw new Error('Support conflict');
    const claim = (await client.query<{ id: string; status: string }>(`
      INSERT INTO support_claims(checkout_order_id,shipment_order_id,option_id,
        product_id,customer_account_id,seller_id,kind,reason_code,reason,quantity,idempotency_key)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,status`,
    [input.orderId, input.shipmentOrderId, input.optionId,line.productId,
      input.customerAccountId,line.sellerId,input.kind,input.reasonCode,reason,
      input.quantity,input.idempotencyKey])).rows[0];
    await client.query(`INSERT INTO support_claim_events
      (claim_id,action,actor_account_id,actor_role,reason,before_status,after_status)
      VALUES ($1,'REQUESTED',$2,'customer','Claim requested',NULL,'REQUESTED')`,
    [claim.id,input.customerAccountId]);
    await client.query(`INSERT INTO support_claim_messages
      (claim_id,author_account_id,author_role,body)
      VALUES ($1,$2,'customer',$3)`, [claim.id,input.customerAccountId,reason]);
    if (ownsTransaction) await client.query('COMMIT');
    return claim;
  } catch (error) {
    if (ownsTransaction) await client.query('ROLLBACK');
    throw error;
  } finally { if (ownsTransaction) client.release(); }
}

export function parseClaimPageQuery(query: Record<string, unknown>, admin = false) {
  if (!admin) return parseQuestionPageQuery(query);
  if (!query || typeof query !== 'object') throw new Error('Invalid support request');
  const { status, ...pageQuery } = query;
  if (status !== undefined && (typeof status !== 'string' || ![
    'REQUESTED','SELLER_REPLIED','APPROVED','REJECTED','REFUND_PROCESSING',
    'REFUNDED','REVIEW_REQUIRED',
  ].includes(status))) throw new Error('Invalid support request');
  return { ...parseQuestionPageQuery(pageQuery),
    ...(status === undefined ? {} : { status }) };
}

type ClaimScope = 'customer' | 'seller' | 'admin';

export async function listClaims(db: Db, scope: ClaimScope, actorAccountId: string,
  sellerId: string | undefined, page: ReturnType<typeof parseClaimPageQuery>) {
  if (!uuid.test(actorAccountId) || (scope === 'seller' && (!sellerId || !uuid.test(sellerId))))
    throw new Error('Invalid support request');
  const where = scope === 'customer' ? 'c.customer_account_id=$1 AND $2::uuid IS NULL' :
    scope === 'seller' ? `c.seller_id=$2 AND EXISTS (SELECT 1 FROM account_roles grant_role
      WHERE grant_role.account_id=$1 AND grant_role.role='seller'
        AND grant_role.seller_id=c.seller_id)` : '$1::uuid IS NOT NULL AND $2::uuid IS NULL';
  const result = (await db.query<{ id: string; productId: string; shipmentOrderId: string;
    kind: string; reasonCode: string; status: string; createdAt: Date;
    cursorTime: string }>(`SELECT c.id,c.product_id AS "productId",
    c.shipment_order_id AS "shipmentOrderId",c.kind,
    c.reason_code AS "reasonCode",c.status,c.created_at AS "createdAt",
    to_char(c.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorTime"
    FROM support_claims c WHERE ${where}
      AND ($3::text IS NULL OR c.status=$3::text)
      AND ($4::timestamptz IS NULL OR
        (c.created_at,c.id)<($4::timestamptz,$5::uuid))
    ORDER BY c.created_at DESC,c.id DESC LIMIT $6`,
  [actorAccountId, sellerId ?? null, page.status ?? null,
    page.cursor?.createdAt ?? null, page.cursor?.id ?? null,
    page.limit + 1])).rows;
  const rows = result.slice(0, page.limit);
  const last = rows.at(-1);
  return { items: rows.map(({ id, productId, shipmentOrderId, kind,
    reasonCode, status, createdAt }) => ({ id, productId, shipmentOrderId,
    kind, reasonCode, status, createdAt })),
    nextCursor: result.length > page.limit && last ? Buffer.from(JSON.stringify({
      createdAt: last.cursorTime, id: last.id,
    })).toString('base64url') : null };
}

export async function getClaim(db: Db, scope: ClaimScope, actorAccountId: string,
  sellerId: string | undefined, claimId: string) {
  if (![actorAccountId, claimId].every((id) => uuid.test(id)) ||
      (scope === 'seller' && (!sellerId || !uuid.test(sellerId))))
    throw new Error('Invalid support request');
  const where = scope === 'customer' ? 'c.customer_account_id=$2' :
    scope === 'seller' ? `c.seller_id=$3 AND EXISTS (SELECT 1 FROM account_roles grant_role
      WHERE grant_role.account_id=$2 AND grant_role.role='seller'
        AND grant_role.seller_id=c.seller_id)` : 'true';
  const claim = (await db.query<{ id: string; orderId: string; shipmentOrderId: string;
    optionId: string; productId: string; customerAccountId: string; sellerId: string;
    kind: string; reasonCode: string; reason: string; quantity: number; status: string;
    policyVersionId: string | null; decisionReason: string | null; goodsRefundWon: number;
    decidedAt: Date | null; createdAt: Date }>(`
    SELECT c.id,c.checkout_order_id AS "orderId",
      c.shipment_order_id AS "shipmentOrderId",c.option_id AS "optionId",
      c.product_id AS "productId",c.customer_account_id AS "customerAccountId",
      c.seller_id AS "sellerId",c.kind,c.reason_code AS "reasonCode",
      c.reason,c.quantity,c.status,c.policy_version_id AS "policyVersionId",
      c.decision_reason AS "decisionReason",c.goods_refund_won AS "goodsRefundWon",
      c.decided_at AS "decidedAt",
      c.created_at AS "createdAt" FROM support_claims c
    WHERE c.id=$1 AND ${where}`,
  scope === 'admin' ? [claimId] : scope === 'customer' ?
    [claimId, actorAccountId] : [claimId, actorAccountId, sellerId])).rows[0];
  if (!claim) return undefined;
  const messages = (await db.query<{ id: string; authorRole: string;
    body: string; createdAt: Date }>(`SELECT id,author_role AS "authorRole",
    body,created_at AS "createdAt" FROM support_claim_messages
    WHERE claim_id=$1 ORDER BY message_seq`, [claimId])).rows;
  const events = (await db.query<{ action: string; actorRole: string;
    reason: string; beforeStatus: string | null; afterStatus: string;
    occurredAt: Date }>(`SELECT action,actor_role AS "actorRole",reason,
    before_status AS "beforeStatus",after_status AS "afterStatus",
    occurred_at AS "occurredAt" FROM support_claim_events
    WHERE claim_id=$1 ORDER BY event_seq`, [claimId])).rows;
  const evidence = (await db.query<{ id: string; mimeType: string;
    sizeBytes: number; createdAt: Date }>(`SELECT id,mime_type AS "mimeType",
    size_bytes AS "sizeBytes",created_at AS "createdAt"
    FROM support_claim_evidence WHERE claim_id=$1 ORDER BY created_at,id`, [claimId])).rows;
  const { customerAccountId, ...publicClaim } = claim;
  return { ...publicClaim,
    ...(scope === 'admin' ? { customerAccountId } : {}),
    messages, events, evidence };
}

export async function replyToClaim(db: Db, input: { claimId: string; sellerId: string;
  actorAccountId: string; body: string; idempotencyKey: string }) {
  if (![input.claimId,input.sellerId,input.actorAccountId,input.idempotencyKey]
    .every((id) => uuid.test(id)) || typeof input.body !== 'string' ||
    !input.body.trim() || input.body.trim().length > 2000)
    throw new Error('Invalid support request');
  const body = input.body.trim();
  const ownsTransaction = db instanceof Pool;
  const client = ownsTransaction ? await db.connect() : db as PoolClient;
  try {
    if (ownsTransaction) await client.query('BEGIN');
    const claim = (await client.query<{ status: string }>(`SELECT c.status
      FROM support_claims c WHERE c.id=$1 AND c.seller_id=$2
        AND EXISTS (SELECT 1 FROM account_roles role_grant
          JOIN accounts actor ON actor.id=role_grant.account_id
          WHERE role_grant.account_id=$3 AND role_grant.role='seller'
            AND role_grant.seller_id=c.seller_id AND actor.disabled_at IS NULL)
      FOR UPDATE OF c`, [input.claimId,input.sellerId,input.actorAccountId])).rows[0];
    if (!claim) throw new Error('Support unavailable');
    const prior = (await client.query<{ id: string; claimId: string; body: string }>(`
      SELECT id,claim_id AS "claimId",body FROM support_claim_messages
      WHERE author_account_id=$1 AND idempotency_key=$2`,
    [input.actorAccountId,input.idempotencyKey])).rows[0];
    if (prior) {
      if (prior.claimId !== input.claimId || prior.body !== body)
        throw new Error('Support conflict');
      if (ownsTransaction) await client.query('COMMIT');
      return { id: prior.id };
    }
    if (!['REQUESTED','SELLER_REPLIED'].includes(claim.status))
      throw new Error('Support conflict');
    const message = (await client.query<{ id: string }>(`INSERT INTO support_claim_messages
      (claim_id,author_account_id,author_role,body,idempotency_key)
      VALUES ($1,$2,'seller',$3,$4) RETURNING id`,
    [input.claimId,input.actorAccountId,body,input.idempotencyKey])).rows[0];
    await client.query(`UPDATE support_claims SET status='SELLER_REPLIED' WHERE id=$1`,
      [input.claimId]);
    await client.query(`INSERT INTO support_claim_events
      (claim_id,action,actor_account_id,actor_role,reason,before_status,after_status)
      VALUES ($1,'SELLER_REPLIED',$2,'seller','Seller reply submitted',$3,'SELLER_REPLIED')`,
    [input.claimId,input.actorAccountId,claim.status]);
    if (ownsTransaction) await client.query('COMMIT');
    return { id: message.id };
  } catch (error) {
    if (ownsTransaction) await client.query('ROLLBACK');
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505')
      throw new Error('Support conflict');
    throw error;
  } finally { if (ownsTransaction) client.release(); }
}

export async function addClaimEvidence(db: Db, input: { claimId: string;
  customerAccountId: string; idempotencyKey: string; bytes: Buffer;
  mimeType: string; store: ImageQuarantine }) {
  if (![input.claimId,input.customerAccountId,input.idempotencyKey]
    .every((id) => uuid.test(id)) || !Buffer.isBuffer(input.bytes) ||
    !['image/png','image/jpeg','image/webp'].includes(input.mimeType))
    throw new Error('Invalid support request');
  const requestSha256 = createHash('sha256').update(input.mimeType).update('\0')
    .update(input.bytes).digest('hex');
  const ownsTransaction = db instanceof Pool;
  const client = ownsTransaction ? await db.connect() : db as PoolClient;
  let objectKey: string | undefined;
  try {
    if (ownsTransaction) await client.query('BEGIN');
    const claim = (await client.query<{ status: string }>(`SELECT status FROM support_claims
      WHERE id=$1 AND customer_account_id=$2 FOR UPDATE`,
    [input.claimId,input.customerAccountId])).rows[0];
    if (!claim) throw new Error('Support unavailable');
    const prior = (await client.query<{ id: string; claimId: string; requestSha256: string;
      mimeType: string; sizeBytes: number }>(`SELECT id,claim_id AS "claimId",
      request_sha256 AS "requestSha256",mime_type AS "mimeType",size_bytes AS "sizeBytes"
      FROM support_claim_evidence WHERE uploaded_by=$1 AND idempotency_key=$2`,
    [input.customerAccountId,input.idempotencyKey])).rows[0];
    if (prior) {
      if (prior.claimId !== input.claimId || prior.requestSha256 !== requestSha256)
        throw new Error('Support conflict');
      if (ownsTransaction) await client.query('COMMIT');
      return { id: prior.id, mimeType: prior.mimeType, sizeBytes: prior.sizeBytes };
    }
    if (!['REQUESTED','SELLER_REPLIED'].includes(claim.status)) throw new Error('Support conflict');
    const count = (await client.query<{ n: number }>(`SELECT count(*)::int AS n
      FROM support_claim_evidence WHERE claim_id=$1`, [input.claimId])).rows[0].n;
    if (count >= 5) throw new Error('Support image limit');
    const saved = await input.store.put(input.bytes, input.mimeType);
    objectKey = saved.objectKey;
    const evidence = (await client.query<{ id: string }>(`INSERT INTO support_claim_evidence
      (claim_id,uploaded_by,object_key,mime_type,size_bytes,idempotency_key,request_sha256)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [input.claimId,input.customerAccountId,saved.objectKey,saved.mimeType,
      saved.sizeBytes,input.idempotencyKey,requestSha256])).rows[0];
    await client.query(`INSERT INTO support_claim_events
      (claim_id,action,actor_account_id,actor_role,reason,before_status,after_status)
      VALUES ($1,'EVIDENCE_ADDED',$2,'customer',$3,$4,$4)`,
    [input.claimId,input.customerAccountId,`Evidence ${evidence.id} added`,claim.status]);
    if (ownsTransaction) await client.query('COMMIT');
    return { id: evidence.id, mimeType: saved.mimeType, sizeBytes: saved.sizeBytes };
  } catch (error) {
    if (ownsTransaction) await client.query('ROLLBACK');
    if (objectKey) {
      try { await input.store.remove(objectKey); }
      catch (cleanupError) {
        throw new AggregateError([error,cleanupError], 'Claim evidence rollback left a private file');
      }
    }
    throw error;
  } finally { if (ownsTransaction) client.release(); }
}

export async function readClaimEvidence(db: Db, input: { claimId: string;
  evidenceId: string; actorAccountId: string; actorRole: ClaimScope;
  sellerId?: string; store: ImageQuarantine }) {
  if (![input.claimId,input.evidenceId,input.actorAccountId].every((id) => uuid.test(id)) ||
      (input.actorRole === 'seller' && (!input.sellerId || !uuid.test(input.sellerId))))
    throw new Error('Invalid support request');
  const access = input.actorRole === 'customer' ? 'c.customer_account_id=$3' :
    input.actorRole === 'seller' ? `c.seller_id=$4 AND EXISTS (
      SELECT 1 FROM account_roles role_grant JOIN accounts actor
        ON actor.id=role_grant.account_id
      WHERE role_grant.account_id=$3 AND role_grant.role='seller'
        AND role_grant.seller_id=c.seller_id AND actor.disabled_at IS NULL)` :
      `EXISTS (SELECT 1 FROM account_roles role_grant JOIN accounts actor
        ON actor.id=role_grant.account_id WHERE role_grant.account_id=$3
          AND role_grant.role='admin' AND actor.disabled_at IS NULL)`;
  const evidence = (await db.query<{ objectKey: string }>(`SELECT e.object_key AS "objectKey"
    FROM support_claim_evidence e JOIN support_claims c ON c.id=e.claim_id
    WHERE c.id=$1 AND e.id=$2 AND ${access}`,
  input.actorRole === 'seller' ? [input.claimId,input.evidenceId,
    input.actorAccountId,input.sellerId] : [input.claimId,input.evidenceId,
      input.actorAccountId])).rows[0];
  if (!evidence) throw new Error('Support unavailable');
  try { return await input.store.read(evidence.objectKey); }
  catch { throw new Error('Support evidence unavailable'); }
}

export async function rejectClaim(db: Db, input: { claimId: string;
  adminAccountId: string; reason: string; idempotencyKey: string }) {
  if (![input.claimId,input.adminAccountId,input.idempotencyKey]
    .every((id) => uuid.test(id)) || typeof input.reason !== 'string' ||
    !input.reason.trim() || input.reason.trim().length > 500)
    throw new Error('Invalid support request');
  const reason = input.reason.trim();
  const fingerprint = createHash('sha256').update(JSON.stringify({
    decision: 'reject',reason,
  })).digest('hex');
  const ownsTransaction = db instanceof Pool;
  const client = ownsTransaction ? await db.connect() : db as PoolClient;
  try {
    if (ownsTransaction) await client.query('BEGIN');
    const admin = await client.query(`SELECT 1 FROM accounts actor
      JOIN account_roles role_grant ON role_grant.account_id=actor.id
      WHERE actor.id=$1 AND actor.disabled_at IS NULL AND role_grant.role='admin'`,
    [input.adminAccountId]);
    if (!admin.rowCount) throw new Error('Support unavailable');
    // Serialize the decision key before taking a claim row lock. The same key may
    // target two different claim rows, so a row lock alone cannot prevent races.
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
      [`support-claim-decision:${input.adminAccountId}:${input.idempotencyKey}`]);
    const claim = (await client.query<{ status: string; decisionBy: string | null;
      decisionIdempotencyKey: string | null; decisionFingerprint: string | null }>(`
      SELECT status,decision_by AS "decisionBy",
        decision_idempotency_key AS "decisionIdempotencyKey",
        decision_fingerprint AS "decisionFingerprint"
      FROM support_claims WHERE id=$1 FOR UPDATE`, [input.claimId])).rows[0];
    if (!claim) throw new Error('Support unavailable');
    const reused = (await client.query<{ id: string }>(`SELECT id FROM support_claims
      WHERE decision_by=$1 AND decision_idempotency_key=$2`,
    [input.adminAccountId,input.idempotencyKey])).rows[0];
    if (reused && reused.id !== input.claimId) throw new Error('Support conflict');
    if (claim.decisionBy) {
      if (claim.decisionBy !== input.adminAccountId ||
          claim.decisionIdempotencyKey !== input.idempotencyKey ||
          claim.decisionFingerprint !== fingerprint)
        throw new Error('Support conflict');
      const prior = await getClaim(client, 'admin', input.adminAccountId, undefined, input.claimId);
      if (ownsTransaction) await client.query('COMMIT');
      return prior!;
    }
    if (!['REQUESTED','SELLER_REPLIED'].includes(claim.status))
      throw new Error('Support conflict');
    const policy = (await client.query<{ id: string }>(`SELECT id FROM support_policy_versions
      WHERE code='POST_SHIPMENT_TRIAL' AND effective_at<=now()
      ORDER BY version DESC LIMIT 1`, [])).rows[0];
    if (!policy) throw new Error('Support unavailable');
    await client.query(`UPDATE support_claims SET status='REJECTED',
      policy_version_id=$2,decision_by=$3,decision_reason=$4,
      decided_at=clock_timestamp(),decision_idempotency_key=$5,decision_fingerprint=$6
      WHERE id=$1`, [input.claimId,policy.id,input.adminAccountId,reason,
      input.idempotencyKey,fingerprint]);
    await client.query(`INSERT INTO support_claim_events
      (claim_id,action,actor_account_id,actor_role,reason,before_status,after_status)
      VALUES ($1,'REJECTED',$2,'admin',$3,$4,'REJECTED')`,
    [input.claimId,input.adminAccountId,reason,claim.status]);
    const result = await getClaim(client, 'admin', input.adminAccountId, undefined, input.claimId);
    if (ownsTransaction) await client.query('COMMIT');
    return result!;
  } catch (error) {
    if (ownsTransaction) await client.query('ROLLBACK');
    if (error && typeof error === 'object' && 'code' in error &&
        error.code === '23505' && 'constraint' in error &&
        error.constraint === 'support_claims_decision_author_key_uq')
      throw new Error('Support conflict');
    throw error;
  } finally { if (ownsTransaction) client.release(); }
}
