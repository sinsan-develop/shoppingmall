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
