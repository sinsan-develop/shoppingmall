import type { PoolClient } from 'pg';
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
      (seller_id,start_date,end_date,completed_by,reason)
    SELECT seller.id,$2::date,$3::date,$4,$5
    FROM sellers seller WHERE seller.id=$1 AND EXISTS (
      SELECT 1 FROM account_roles role WHERE role.account_id=$4 AND role.role='admin')
    RETURNING id,seller_id AS "sellerId",start_date::text AS "startDate",
      end_date::text AS "endDate",completed_at AS "completedAt"`,
  [period.sellerId, period.from, period.to, adminId, input.reason.trim()]);
  if (result.rowCount !== 1) throw new Error('Settlement access denied');
  return { ...result.rows[0], completedAt: result.rows[0].completedAt.toISOString() };
}
