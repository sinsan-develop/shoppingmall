export const SETTLEMENT_KINDS = [
  'sale', 'goods_discount', 'shipping_fee', 'shipping_support',
  'goods_refund', 'shipping_refund', 'commission', 'correction',
] as const;

export type SettlementKind = (typeof SETTLEMENT_KINDS)[number];
export type SettlementReportItem = {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerCategoryId: string;
  sellerCategoryName: string;
  kind: SettlementKind;
  amountWon: number;
  occurredAt: string;
  recordedAt?: string;
  reason?: string | null;
  checkoutOrderId: string | null;
  shipmentOrderId: string | null;
  productId: string | null;
  optionId: string | null;
  productName: string | null;
  optionName: string | null;
  sourceEventKind: string;
  sourceEventId: string;
  originalEventId?: string | null;
  correctedKind?: Exclude<SettlementKind, 'correction'> | null;
  correctionDirection?: 'increase' | 'decrease' | null;
};

type Totals = Record<SettlementKind, number>;

function emptyTotals(): Totals {
  return Object.fromEntries(SETTLEMENT_KINDS.map((kind) => [kind, 0])) as Totals;
}

function addAmount(totals: Totals, kind: SettlementKind, amountWon: number): void {
  if (!Number.isSafeInteger(amountWon) || amountWon < 0 ||
      !Number.isSafeInteger(totals[kind] + amountWon)) {
    throw new Error('Settlement amount overflow');
  }
  totals[kind] += amountWon;
}

function addCorrection(totals: Totals, item: SettlementReportItem): void {
  if (item.kind !== 'correction') return;
  const kind = item.correctedKind;
  if (!kind || !SETTLEMENT_KINDS.includes(kind) ||
      !item.originalEventId || !['increase', 'decrease'].includes(item.correctionDirection ?? '')) {
    throw new Error('Invalid settlement correction');
  }
  const signed = item.correctionDirection === 'increase' ? item.amountWon : -item.amountWon;
  if (!Number.isSafeInteger(signed) || !Number.isSafeInteger(totals[kind] + signed)) {
    throw new Error('Settlement amount overflow');
  }
  totals[kind] += signed;
}

export function summarizeSettlement(items: SettlementReportItem[]) {
  const groups = new Map<string, {
    sellerId: string;
    sellerName: string;
    sellerCategoryId: string;
    sellerCategoryName: string;
    sellerCategoryNames: string[];
    items: SettlementReportItem[];
    totals: Totals;
  }>();
  const totals = emptyTotals();
  for (const item of items) {
    if (!SETTLEMENT_KINDS.includes(item.kind)) {
      throw new Error('Unknown settlement kind');
    }
    let group = groups.get(item.sellerId);
    if (!group) {
      group = {
        sellerId: item.sellerId,
        sellerName: item.sellerName,
        sellerCategoryId: item.sellerCategoryId,
        sellerCategoryName: item.sellerCategoryName,
        sellerCategoryNames: [item.sellerCategoryName],
        items: [],
        totals: emptyTotals(),
      };
      groups.set(item.sellerId, group);
    }
    if (!group.sellerCategoryNames.includes(item.sellerCategoryName))
      group.sellerCategoryNames.push(item.sellerCategoryName);
    group.items.push(item);
    addAmount(group.totals, item.kind, item.amountWon);
    addAmount(totals, item.kind, item.amountWon);
    addCorrection(group.totals, item);
    addCorrection(totals, item);
  }
  return {
    groups: [...groups.values()].sort((a, b) =>
      a.sellerName.localeCompare(b.sellerName, 'ko-KR') || a.sellerId.localeCompare(b.sellerId))
      .map((group) => ({ ...group, items: group.items.sort((a, b) =>
        a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)) })),
    totals,
  };
}
