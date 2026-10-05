function nonNegativeSafeInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

/** Allocate only this approval's share while preserving the exact paid line total. */
export function allocateIncrementalRefundWon(
  totalPaidWon: number,
  originalQuantity: number,
  alreadyApprovedQuantity: number,
  requestedQuantity: number,
): number {
  if (!nonNegativeSafeInteger(totalPaidWon) || !Number.isSafeInteger(originalQuantity) ||
      originalQuantity < 1 || !nonNegativeSafeInteger(alreadyApprovedQuantity) ||
      !Number.isSafeInteger(requestedQuantity) || requestedQuantity < 1 ||
      alreadyApprovedQuantity + requestedQuantity > originalQuantity)
    throw new Error('Invalid refund allocation');

  const paid = BigInt(totalPaidWon);
  const original = BigInt(originalQuantity);
  const before = paid * BigInt(alreadyApprovedQuantity) / original;
  const after = paid * BigInt(alreadyApprovedQuantity + requestedQuantity) / original;
  return Number(after - before);
}
