import type { Pool } from 'pg';

type Cursor = { createdAt: string; id: string };
type Summary = { id: string; status: 'PAID'; createdAt: Date; paidAt: Date;
  payableWon: number; productSummary: { productName: string; optionName: string; lineCount: number } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = () => new Error('Invalid paid order query');

export function parsePaidOrderQuery(query: Record<string, unknown>) {
  if (query.status !== 'PAID' || Object.keys(query).some((key) =>
    !['status', 'cursor', 'limit'].includes(key))) throw invalid();
  const limit = query.limit === undefined ? 20 :
    typeof query.limit === 'string' && /^[1-9]\d?$/.test(query.limit) ? Number(query.limit) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw invalid();
  let cursor: Cursor | undefined;
  if (query.cursor !== undefined) {
    if (typeof query.cursor !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(query.cursor)) throw invalid();
    try {
      const value = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as Cursor;
      if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== 'createdAt,id' ||
          !uuid.test(value.id) || typeof value.createdAt !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value.createdAt) ||
          !Number.isFinite(Date.parse(value.createdAt)) ||
          new Date(value.createdAt).toISOString().slice(0, 23) !== value.createdAt.slice(0, 23)) throw invalid();
      cursor = value;
    } catch { throw invalid(); }
  }
  return { limit, cursor };
}

export async function listPaidOrders(pool: Pool, accountId: string,
  query: ReturnType<typeof parsePaidOrderQuery>) {
  const result = await pool.query<Summary & { cursorTime: string }>(`SELECT
    o.id,o.status,o.created_at AS "createdAt",o.paid_at AS "paidAt",o.payable_won AS "payableWon",
    to_char(o.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorTime",
    json_build_object('productName',coalesce(summary.product_name,''),
      'optionName',coalesce(summary.option_name,''),'lineCount',coalesce(summary.line_count,0)) AS "productSummary"
    FROM checkout_orders o LEFT JOIN LATERAL (
      SELECT l.product_name,l.option_name,count(*) OVER ()::int AS line_count
      FROM shipment_orders s JOIN shipment_order_lines l ON l.shipment_order_id=s.id
      WHERE s.checkout_order_id=o.id ORDER BY s.id,l.option_id LIMIT 1
    ) summary ON true
    WHERE o.account_id=$1 AND o.status='PAID'
      AND ($2::timestamptz IS NULL OR (o.created_at,o.id)<($2::timestamptz,$3::uuid))
    ORDER BY o.created_at DESC,o.id DESC LIMIT $4`,
  [accountId, query.cursor?.createdAt ?? null, query.cursor?.id ?? null, query.limit + 1]);
  const page = result.rows.slice(0, query.limit);
  const last = page.at(-1);
  return { items: page.map(({ id, status, createdAt, paidAt, payableWon, productSummary }) =>
    ({ id, status, createdAt, paidAt, payableWon, productSummary })),
    nextCursor: result.rows.length > query.limit && last ? Buffer.from(JSON.stringify({
      createdAt: last.cursorTime, id: last.id,
    })).toString('base64url') : null };
}
