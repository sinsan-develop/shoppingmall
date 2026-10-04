import { allocateShipmentDiscountWon, applyShipmentShippingSupportWon, groupShipmentLines,
  type QuotedShipment, type ShipmentLine, type ShipmentQuote } from '../checkout/shipment-quote.js';
import { validatePromotionRule, type PromotionRule } from './rules.js';

export type AppliedPromotionShipment = QuotedShipment & {
  discountWon: number; supportWon: number; payableGoodsWon: number;
  payableShippingWon: number; payableTotalWon: number;
};
export type AppliedPromotionQuote = Omit<ShipmentQuote, 'shipments'> & {
  shipments: AppliedPromotionShipment[];
  discountWon: number; supportWon: number; payableGoodsWon: number;
  payableShippingWon: number; payableTotalWon: number;
};

function eligibleWon(lines: readonly ShipmentLine[], rule: PromotionRule): number {
  const targets = new Set(rule.targetIds);
  let total = 0;
  for (const line of lines) {
    if (rule.scope === 'all' || (rule.scope === 'sellers' && targets.has(line.sellerId)) ||
        (rule.scope === 'options' && targets.has(line.optionId))) {
      total += line.quantity * line.unitPriceWon;
      if (!Number.isSafeInteger(total)) throw new Error('Invalid promotion quote');
    }
  }
  return total;
}

function requestedWon(eligible: number, rule: PromotionRule): number {
  if (eligible < rule.minimumEligibleGoodsWon) return 0;
  const request = rule.amountKind === 'percent'
    ? Number(BigInt(eligible) * BigInt(rule.amountValue) / 10000n) : rule.amountValue;
  return Math.min(eligible, request, rule.maxDiscountWon ?? Number.MAX_SAFE_INTEGER);
}

/** Pure preview arithmetic. The server caller checks period, state, ownership and usage limits. */
export function applyPromotionQuote(base: ShipmentQuote, lines: ShipmentLine[], discount?: PromotionRule,
  supports: { shipmentKey: string; rule: PromotionRule }[] = []): AppliedPromotionQuote {
  if (!base || !Array.isArray(base.shipments) || !Array.isArray(lines) || !Array.isArray(supports))
    throw new Error('Invalid promotion quote');
  const groups = groupShipmentLines(lines);
  if (groups.length !== base.shipments.length || groups.some((group, index) => {
    const original = base.shipments[index];
    return !original || original.key !== group.key || original.preDiscountGoodsWon !== group.preDiscountGoodsWon ||
      original.lines.length !== group.lines.length || original.lines.some((line, lineIndex) => {
        const current = group.lines[lineIndex];
        return line.optionId !== current.optionId || line.sellerId !== current.sellerId ||
          line.shippingMode !== current.shippingMode || line.quantity !== current.quantity ||
          line.unitPriceWon !== current.unitPriceWon;
      });
  })) throw new Error('Invalid promotion quote');
  const goodsRule = discount && validatePromotionRule(discount);
  if (goodsRule && goodsRule.kind !== 'goods_discount') throw new Error('Invalid promotion quote');
  const eligibleGroups = groups.map((group) => ({ key: group.key,
    eligibleGoodsWon: goodsRule ? eligibleWon(group.lines, goodsRule) : 0 }));
  const eligibleTotal = eligibleGroups.reduce((sum, group) => sum + group.eligibleGoodsWon, 0);
  if (!Number.isSafeInteger(eligibleTotal)) throw new Error('Invalid promotion quote');
  const discounts = allocateShipmentDiscountWon(eligibleGroups,
    goodsRule ? requestedWon(eligibleTotal, goodsRule) : 0);
  const requests = supports.map(({ shipmentKey, rule }) => {
    const checked = validatePromotionRule(rule);
    if (checked.kind !== 'shipping_support') throw new Error('Invalid promotion quote');
    const group = groups.find((part) => part.key === shipmentKey);
    if (!group) throw new Error('Invalid shipping support');
    const eligible = eligibleWon(group.lines, checked);
    return { key: shipmentKey, requestedSupportWon: eligible < checked.minimumEligibleGoodsWon
      ? 0 : Math.min(checked.amountValue, checked.maxDiscountWon ?? Number.MAX_SAFE_INTEGER) };
  });
  const shipping = applyShipmentShippingSupportWon(base.shipments, requests);
  const shipments = base.shipments.map((original, index) => {
    const discountWon = discounts[index].discountWon;
    const supportWon = shipping[index].supportWon;
    const payableGoodsWon = original.goodsWon - discountWon;
    const payableShippingWon = shipping[index].payableShippingWon;
    const payableTotalWon = payableGoodsWon + payableShippingWon;
    if (![payableGoodsWon, payableShippingWon, payableTotalWon].every(Number.isSafeInteger) ||
        payableGoodsWon < 0 || payableShippingWon < 0) throw new Error('Invalid promotion quote');
    return { ...original, lines: original.lines.map((line) => ({ ...line })), discountWon, supportWon,
      payableGoodsWon, payableShippingWon, payableTotalWon };
  });
  const totals = shipments.reduce((sum, part) => ({ discountWon: sum.discountWon + part.discountWon,
    supportWon: sum.supportWon + part.supportWon,
    payableGoodsWon: sum.payableGoodsWon + part.payableGoodsWon,
    payableShippingWon: sum.payableShippingWon + part.payableShippingWon,
    payableTotalWon: sum.payableTotalWon + part.payableTotalWon }),
  { discountWon: 0, supportWon: 0, payableGoodsWon: 0, payableShippingWon: 0, payableTotalWon: 0 });
  if (Object.values(totals).some((value) => !Number.isSafeInteger(value)) ||
      totals.payableTotalWon !== base.totalWon - totals.discountWon - totals.supportWon)
    throw new Error('Invalid promotion quote');
  return { ...base, shipments, ...totals };
}
