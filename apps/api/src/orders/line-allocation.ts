import { allocateShipmentDiscountWon } from '../checkout/shipment-quote.js';

/** Allocate a shipment's already-approved goods discount to its eligible options, in won. */
export function allocateOrderLineDiscountWon(
  lines: { optionId: string; eligibleGoodsWon: number }[], discountWon: number,
): { optionId: string; discountWon: number }[] {
  if (!Array.isArray(lines)) throw new Error('Invalid discount allocation');
  return allocateShipmentDiscountWon(lines.map((line) => ({
    key: line?.optionId,
    eligibleGoodsWon: line?.eligibleGoodsWon,
  })), discountWon).map(({ key, discountWon: amount }) => ({ optionId: key, discountWon: amount }));
}
