import type { ShippingPolicy } from '../shipping/policy.js';

export type ShipmentLine = {
  optionId: string;
  sellerId: string;
  shippingMode: 'seller_direct' | 'owool_fulfillment';
  quantity: number;
  unitPriceWon: number;
};

export type ShipmentGroup = {
  key: string;
  shippingMode: ShipmentLine['shippingMode'];
  sellerId: string | null;
  lines: ShipmentLine[];
  preDiscountGoodsWon: number;
};

export type QuotedShipment = ShipmentGroup & { goodsWon: number; shippingWon: number; totalWon: number };
export type ShipmentQuote = {
  shipments: QuotedShipment[];
  goodsWon: number;
  shippingWon: number;
  totalWon: number;
};

export type DiscountEligibleGroup = { key: string; eligibleGoodsWon: number };
export type ShipmentDiscount = { key: string; discountWon: number };

/** Internal arithmetic only: the caller selects eligible current-price goods; no coupon is issued here. */
export function allocateShipmentDiscountWon(groups: readonly DiscountEligibleGroup[],
  discountWon: number): ShipmentDiscount[] {
  if (!Array.isArray(groups) || !Number.isSafeInteger(discountWon) || discountWon < 0) {
    throw new Error('Invalid discount allocation');
  }
  const seen = new Set<string>();
  let eligibleTotalWon = 0;
  for (const group of groups) {
    if (!group || typeof group.key !== 'string' || !group.key.trim() || seen.has(group.key) ||
        !Number.isSafeInteger(group.eligibleGoodsWon) || group.eligibleGoodsWon < 0) {
      throw new Error('Invalid discount allocation');
    }
    seen.add(group.key);
    eligibleTotalWon += group.eligibleGoodsWon;
    if (!Number.isSafeInteger(eligibleTotalWon)) throw new Error('Invalid discount allocation');
  }
  if (discountWon > eligibleTotalWon) throw new Error('Invalid discount allocation');
  if (discountWon === 0) return groups.map(({ key }) => ({ key, discountWon: 0 }));
  const denominator = BigInt(eligibleTotalWon);
  const allocation = groups.map(({ key, eligibleGoodsWon }) => {
    const numerator = BigInt(discountWon) * BigInt(eligibleGoodsWon);
    return { key, discountWon: Number(numerator / denominator), remainder: numerator % denominator };
  });
  let remaining = discountWon - allocation.reduce((sum, part) => sum + part.discountWon, 0);
  const priority = [...allocation].sort((a, b) => a.remainder === b.remainder
    ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    : a.remainder > b.remainder ? -1 : 1);
  for (const part of priority) {
    if (remaining === 0) break;
    part.discountWon += 1;
    remaining -= 1;
  }
  return allocation.map(({ key, discountWon: amount }) => ({ key, discountWon: amount }));
}

export type ShippingCharge = { key: string; shippingWon: number };
export type ShippingSupportRequest = { key: string; requestedSupportWon: number };
export type SupportedShipping = ShippingCharge & { supportWon: number; payableShippingWon: number };

/** Internal arithmetic only: the caller has already decided each shipment's pre-discount shipping fee. */
export function applyShipmentShippingSupportWon(shipments: readonly ShippingCharge[],
  requests: readonly ShippingSupportRequest[]): SupportedShipping[] {
  if (!Array.isArray(shipments) || !Array.isArray(requests)) throw new Error('Invalid shipping support');
  const shipmentKeys = new Set<string>();
  for (const shipment of shipments) {
    if (!shipment || typeof shipment.key !== 'string' || !shipment.key.trim() ||
        shipmentKeys.has(shipment.key) || !Number.isSafeInteger(shipment.shippingWon) ||
        shipment.shippingWon < 0) throw new Error('Invalid shipping support');
    shipmentKeys.add(shipment.key);
  }
  const requestedByKey = new Map<string, number>();
  for (const request of requests) {
    if (!request || typeof request.key !== 'string' || !shipmentKeys.has(request.key) ||
        requestedByKey.has(request.key) || !Number.isSafeInteger(request.requestedSupportWon) ||
        request.requestedSupportWon < 0) throw new Error('Invalid shipping support');
    requestedByKey.set(request.key, request.requestedSupportWon);
  }
  return shipments.map(({ key, shippingWon }) => {
    const supportWon = Math.min(shippingWon, requestedByKey.get(key) ?? 0);
    return { key, shippingWon, supportWon, payableShippingWon: shippingWon - supportWon };
  });
}

/** Grouping is independent of the eventual order and reservation persistence. */
export function groupShipmentLines(input: readonly ShipmentLine[]): ShipmentGroup[] {
  if (!Array.isArray(input)) throw new Error('Invalid shipment line');
  const groups = new Map<string, ShipmentGroup>();
  for (const line of input) {
    if (!line || typeof line.optionId !== 'string' || !line.optionId.trim() ||
        typeof line.sellerId !== 'string' || !line.sellerId.trim() ||
        !['seller_direct', 'owool_fulfillment'].includes(line.shippingMode) ||
        !Number.isSafeInteger(line.quantity) || line.quantity <= 0 ||
        !Number.isSafeInteger(line.unitPriceWon) || line.unitPriceWon < 0) {
      throw new Error('Invalid shipment line');
    }
    const lineAmount = line.quantity * line.unitPriceWon;
    if (!Number.isSafeInteger(lineAmount)) throw new Error('Invalid shipment amount');
    const key = line.shippingMode === 'owool_fulfillment' ? 'owool_fulfillment' : `seller_direct:${line.sellerId}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, shippingMode: line.shippingMode,
        sellerId: line.shippingMode === 'seller_direct' ? line.sellerId : null,
        lines: [], preDiscountGoodsWon: 0 };
      groups.set(key, group);
    }
    const nextAmount = group.preDiscountGoodsWon + lineAmount;
    if (!Number.isSafeInteger(nextAmount)) throw new Error('Invalid shipment amount');
    group.lines.push({ ...line });
    group.preDiscountGoodsWon = nextAmount;
  }
  return [...groups.values()];
}

/** Discounts are intentionally not an input: free shipping is decided on pre-discount goods. */
export function shippingFeeWon(preDiscountGoodsWon: number,
  policy: Pick<ShippingPolicy, 'feeWon' | 'freeThresholdWon'>): number {
  if (!Number.isSafeInteger(preDiscountGoodsWon) || preDiscountGoodsWon < 0 ||
      !policy || !Number.isSafeInteger(policy.feeWon) || policy.feeWon < 0 ||
      !Number.isSafeInteger(policy.freeThresholdWon) || policy.freeThresholdWon < 0) {
    throw new Error('Invalid shipment amount');
  }
  return preDiscountGoodsWon >= policy.freeThresholdWon ? 0 : policy.feeWon;
}

/** The caller supplies current server-authoritative prices and each approved effective shipping policy. */
export function quoteShipments(input: readonly ShipmentLine[],
  policyForGroup: (group: ShipmentGroup) => Pick<ShippingPolicy, 'feeWon' | 'freeThresholdWon'>): ShipmentQuote {
  const groups = groupShipmentLines(input);
  if (groups.length === 0) throw new Error('Empty cart');
  if (typeof policyForGroup !== 'function') throw new Error('Invalid shipment policy');
  const quote: ShipmentQuote = { shipments: [], goodsWon: 0, shippingWon: 0, totalWon: 0 };
  for (const group of groups) {
    const shippingWon = shippingFeeWon(group.preDiscountGoodsWon, policyForGroup(group));
    const totalWon = group.preDiscountGoodsWon + shippingWon;
    const goodsWon = quote.goodsWon + group.preDiscountGoodsWon;
    const nextShippingWon = quote.shippingWon + shippingWon;
    const nextTotalWon = quote.totalWon + totalWon;
    if (![totalWon, goodsWon, nextShippingWon, nextTotalWon].every(Number.isSafeInteger)) {
      throw new Error('Invalid shipment amount');
    }
    quote.shipments.push({ ...group, goodsWon: group.preDiscountGoodsWon, shippingWon, totalWon });
    quote.goodsWon = goodsWon;
    quote.shippingWon = nextShippingWon;
    quote.totalWon = nextTotalWon;
  }
  return quote;
}
