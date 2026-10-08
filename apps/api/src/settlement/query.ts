const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const seoulOffsetMs = 9 * 60 * 60 * 1000;

export type SettlementQuery = {
  from: string;
  to: string;
  start: Date;
  endExclusive: Date;
  sellerId: string | null;
  categoryId: string | null;
};

function day(value: unknown): [number, number, number] {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Invalid settlement query');
  }
  const parts = value.split('-').map(Number) as [number, number, number];
  const [year, month, date] = parts;
  if (year < 1000 || new Date(Date.UTC(year, month - 1, date)).toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid settlement query');
  }
  return parts;
}

function optionalId(value: unknown): string | null {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !uuid.test(value)) {
    throw new Error('Invalid settlement query');
  }
  return value;
}

export function parseSettlementQuery(query: Record<string, unknown>): SettlementQuery {
  if (Object.keys(query).some((key) => !['from', 'to', 'sellerId', 'categoryId'].includes(key))) {
    throw new Error('Invalid settlement query');
  }
  const fromParts = day(query.from);
  const toParts = day(query.to);
  const from = query.from as string;
  const to = query.to as string;
  if (from > to) throw new Error('Invalid settlement query');
  return {
    from, to,
    start: new Date(Date.UTC(fromParts[0], fromParts[1] - 1, fromParts[2]) - seoulOffsetMs),
    endExclusive: new Date(Date.UTC(toParts[0], toParts[1] - 1, toParts[2] + 1) - seoulOffsetMs),
    sellerId: optionalId(query.sellerId),
    categoryId: optionalId(query.categoryId),
  };
}
