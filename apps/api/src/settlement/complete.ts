import type { Pool, PoolClient } from 'pg';
import { parseSettlementQuery } from './query.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CompleteSellerPeriodInput = {
  sellerId: string;
  from: string;
  to: string;
  reason: string;
};

export async function completeSellerPeriod(client: PoolClient, adminId: string,
  input: CompleteSellerPeriodInput) {
  if (!uuid.test(adminId) || typeof input.reason !== 'string' ||
      !input.reason.trim() || input.reason.trim().length > 500) {
    throw new Error('Invalid settlement completion');
  }
  const period = parseSettlementQuery({ from: input.from, to: input.to,
    sellerId: input.sellerId });
  if (!period.sellerId) throw new Error('Invalid settlement completion');
  const result = await client.query<{ id: string; sellerId: string;
    startDate: string; endDate: string; completedAt: Date }>(`
    INSERT INTO seller_settlement_periods
      (seller_id,seller_category_id_at_completion,seller_category_name_at_completion,
       start_date,end_date,completed_by,reason,completed_at)
    SELECT seller.id,category.id,category.name,$2::date,$3::date,$4,$5,statement_timestamp()
    FROM sellers seller
    JOIN seller_categories category ON category.id=seller.category_id
    WHERE seller.id=$1 AND EXISTS (
      SELECT 1 FROM account_roles role WHERE role.account_id=$4 AND role.role='admin')
    RETURNING id,seller_id AS "sellerId",start_date::text AS "startDate",
      end_date::text AS "endDate",completed_at AS "completedAt"`,
  [period.sellerId, period.from, period.to, adminId, input.reason.trim()]);
  if (result.rowCount !== 1) throw new Error('Settlement access denied');
  await client.query(`INSERT INTO seller_settlement_period_event_links (period_id,event_id)
    SELECT $1,event.id FROM settlement_events event
    WHERE event.seller_id=$2
      AND (event.occurred_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN $3::date AND $4::date
    ORDER BY event.id`, [result.rows[0].id, period.sellerId, period.from, period.to]);
  return { ...result.rows[0], completedAt: result.rows[0].completedAt.toISOString() };
}

export async function completeSellerPeriodTransaction(pool: Pool, adminId: string,
  input: CompleteSellerPeriodInput) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const completed = await completeSellerPeriod(client, adminId, input);
    await client.query('COMMIT');
    return completed;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
