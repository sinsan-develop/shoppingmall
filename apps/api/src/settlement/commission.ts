import type { PoolClient } from 'pg';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ManualCommissionInput = {
  sellerId: string;
  requestId: string;
  amountWon: number;
  occurredAt: string;
  reason: string;
};

type CommissionRow = {
  id: string;
  sellerId: string;
  requestId: string;
  amountWon: string;
  occurredAt: Date;
  reason: string;
};

export async function recordManualCommission(client: PoolClient, adminId: string,
  input: ManualCommissionInput) {
  if (!input || !uuid.test(adminId) || !uuid.test(input.sellerId) ||
      !uuid.test(input.requestId) || !Number.isSafeInteger(input.amountWon) ||
      input.amountWon <= 0 || typeof input.occurredAt !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input.occurredAt) ||
      !Number.isFinite(Date.parse(input.occurredAt)) ||
      new Date(input.occurredAt).toISOString() !== input.occurredAt ||
      typeof input.reason !== 'string' || !input.reason.trim() ||
      input.reason.trim().length > 500) throw new Error('Invalid manual commission');

  const key = `manual_commission:${input.requestId}`;
  const values = [key, input.amountWon, input.occurredAt, input.sellerId,
    input.requestId, adminId, input.reason.trim()];
  const inserted = await client.query<CommissionRow>(`INSERT INTO settlement_events
    (dedupe_key,kind,amount_won,occurred_at,seller_id,seller_name,
     seller_category_id,seller_category_name,source_event_kind,source_event_id,
     recorded_by,reason)
    SELECT $1,'commission',$2,$3,$4,seller.display_name,
      category.id,category.name,'manual_commission',$5,$6,$7
    FROM sellers seller JOIN seller_categories category ON category.id=seller.category_id
    WHERE seller.id=$4 AND EXISTS (SELECT 1 FROM account_roles role
      WHERE role.account_id=$6 AND role.role='admin')
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id,seller_id AS "sellerId",source_event_id AS "requestId",
      amount_won::text AS "amountWon",occurred_at AS "occurredAt",reason`, values);
  const row = inserted.rows[0] ?? (await client.query<CommissionRow>(`
    SELECT id,seller_id AS "sellerId",source_event_id AS "requestId",
      amount_won::text AS "amountWon",occurred_at AS "occurredAt",reason
    FROM settlement_events WHERE dedupe_key=$1 AND source_event_kind='manual_commission'`,
  [key])).rows[0];
  if (!row) throw new Error('Manual commission access denied');
  if (row.sellerId !== input.sellerId || row.requestId !== input.requestId ||
      Number(row.amountWon) !== input.amountWon ||
      row.occurredAt.toISOString() !== input.occurredAt ||
      row.reason !== input.reason.trim()) throw new Error('Manual commission request conflict');
  return { id: row.id, sellerId: row.sellerId, requestId: row.requestId,
    amountWon: Number(row.amountWon), occurredAt: row.occurredAt.toISOString(),
    reason: row.reason };
}
