import type { Pool, PoolClient } from 'pg';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CorrectionInput = { originalEventId: string; requestId: string;
  direction: 'increase' | 'decrease'; amountWon: number; reason: string };

type OriginalRow = { id: string; kind: string; amountWon: string;
  sellerId: string; sellerName: string };
type CurrentCategoryRow = { sellerCategoryId: string; sellerCategoryName: string };
type CorrectionRow = { id: string; originalEventId: string; requestId: string;
  direction: string; amountWon: string; reason: string; recordedBy: string;
  occurredAt: Date };

function normalize(input: CorrectionInput, adminId: string): CorrectionInput {
  if (!input || !uuid.test(adminId) || !uuid.test(input.originalEventId) ||
      !uuid.test(input.requestId) || !['increase', 'decrease'].includes(input.direction) ||
      !Number.isSafeInteger(input.amountWon) || input.amountWon <= 0 ||
      typeof input.reason !== 'string' || !input.reason.trim() ||
      input.reason.trim().length > 500) throw new Error('Invalid settlement correction');
  return { ...input, originalEventId: input.originalEventId.toLowerCase(),
    requestId: input.requestId.toLowerCase(), reason: input.reason.trim() };
}

function response(row: CorrectionRow) {
  return { id: row.id, originalEventId: row.originalEventId,
    requestId: row.requestId, direction: row.direction,
    amountWon: Number(row.amountWon), reason: row.reason,
    occurredAt: row.occurredAt.toISOString() };
}

function sameRequest(row: CorrectionRow, input: CorrectionInput, adminId: string) {
  return row.originalEventId === input.originalEventId && row.requestId === input.requestId &&
    row.direction === input.direction && Number(row.amountWon) === input.amountWon &&
    row.reason === input.reason && row.recordedBy === adminId;
}

export async function recordCorrection(client: PoolClient, adminId: string,
  raw: CorrectionInput) {
  const input = normalize(raw, adminId);
  const normalizedAdminId = adminId.toLowerCase();
  const key = `correction:${input.requestId}`;
  const existing = (await client.query<CorrectionRow>(`SELECT id,
    original_event_id AS "originalEventId",source_event_id AS "requestId",
    correction_direction AS direction,amount_won::text AS "amountWon",
    reason,recorded_by AS "recordedBy",occurred_at AS "occurredAt"
    FROM settlement_events WHERE dedupe_key=$1 AND kind='correction'
      AND EXISTS (SELECT 1 FROM account_roles role
        WHERE role.account_id=$2 AND role.role='admin')`,
  [key, normalizedAdminId])).rows[0];
  if (existing) {
    if (!sameRequest(existing, input, normalizedAdminId))
      throw new Error('Settlement correction request conflict');
    return response(existing);
  }
  const original = (await client.query<OriginalRow>(`SELECT event.id,event.kind,
    event.amount_won::text AS "amountWon",event.seller_id AS "sellerId",
    event.seller_name AS "sellerName"
    FROM settlement_events event WHERE event.id=$1 AND event.kind<>'correction'
      AND EXISTS (SELECT 1 FROM account_roles role
        WHERE role.account_id=$2 AND role.role='admin')
    FOR UPDATE OF event`, [input.originalEventId, normalizedAdminId])).rows[0];
  if (!original) throw new Error('Settlement correction access denied');
  // A concurrent retry may have committed while this request waited for the original lock.
  const committed = (await client.query<CorrectionRow>(`SELECT id,
    original_event_id AS "originalEventId",source_event_id AS "requestId",
    correction_direction AS direction,amount_won::text AS "amountWon",
    reason,recorded_by AS "recordedBy",occurred_at AS "occurredAt"
    FROM settlement_events WHERE dedupe_key=$1 AND kind='correction'`, [key])).rows[0];
  if (committed) {
    if (!sameRequest(committed, input, normalizedAdminId))
      throw new Error('Settlement correction request conflict');
    return response(committed);
  }

  const adjusted = (await client.query<{ adjustedWon: string }>(`SELECT
    (original.amount_won + coalesce(sum(CASE
      WHEN correction.correction_direction='increase' THEN correction.amount_won
      ELSE -correction.amount_won END),0))::text AS "adjustedWon"
    FROM settlement_events original
    LEFT JOIN settlement_events correction ON correction.original_event_id=original.id
    WHERE original.id=$1 GROUP BY original.amount_won`, [original.id])).rows[0];
  const remaining = Number(adjusted?.adjustedWon);
  const next = remaining + (input.direction === 'increase' ? input.amountWon : -input.amountWon);
  if (!Number.isSafeInteger(remaining) || !Number.isSafeInteger(next) || next < 0)
    throw new Error('Settlement correction exceeds original amount');

  const currentCategory = (await client.query<CurrentCategoryRow>(`SELECT
    category.id AS "sellerCategoryId",category.name AS "sellerCategoryName"
    FROM sellers seller
    JOIN seller_categories category ON category.id=seller.category_id
    WHERE seller.id=$1 FOR SHARE OF seller,category`, [original.sellerId])).rows[0];
  if (!currentCategory) throw new Error('Settlement correction seller category missing');

  const inserted = (await client.query<CorrectionRow>(`INSERT INTO settlement_events
    (dedupe_key,kind,amount_won,occurred_at,recorded_at,seller_id,seller_name,
     seller_category_id,seller_category_name,source_event_kind,source_event_id,
     original_event_id,correction_direction,recorded_by,reason)
    VALUES ($1,'correction',$2,statement_timestamp(),statement_timestamp(),$3,$4,$5,$6,
      'correction',$7,$8,$9,$10,$11)
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id,original_event_id AS "originalEventId",
      source_event_id AS "requestId",correction_direction AS direction,
      amount_won::text AS "amountWon",reason,recorded_by AS "recordedBy",
      occurred_at AS "occurredAt"`, [key, input.amountWon, original.sellerId,
    original.sellerName, currentCategory.sellerCategoryId,
    currentCategory.sellerCategoryName,
    input.requestId, original.id, input.direction, normalizedAdminId, input.reason])).rows[0];
  if (inserted) return response(inserted);
  const collided = (await client.query<CorrectionRow>(`SELECT id,
    original_event_id AS "originalEventId",source_event_id AS "requestId",
    correction_direction AS direction,amount_won::text AS "amountWon",
    reason,recorded_by AS "recordedBy",occurred_at AS "occurredAt"
    FROM settlement_events WHERE dedupe_key=$1 AND kind='correction'`, [key])).rows[0];
  if (!collided || !sameRequest(collided, input, normalizedAdminId))
    throw new Error('Settlement correction request conflict');
  return response(collided);
}

export async function recordCorrectionTransaction(pool: Pool, adminId: string,
  input: CorrectionInput) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await recordCorrection(client, adminId, input);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
