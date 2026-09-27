type Stock = { onHand: number; sellable: number };

function validCount(count: number): boolean {
  return Number.isSafeInteger(count) && count >= 0 && count <= 1_000_000_000;
}

function requireStock(current: Stock, target: number) {
  if (!current || !validCount(current.onHand) || !validCount(current.sellable) ||
      current.sellable > current.onHand || !validCount(target)) throw new Error('Invalid stock');
}

export function planStockEntry(current: Stock, target: number) {
  requireStock(current, target);
  const requiresApproval = target > current.sellable;
  return { onHand: target, sellable: requiresApproval ? current.sellable : target, requiresApproval };
}

export function approveStockIncrease(current: Stock, requested: number): Stock {
  requireStock(current, requested);
  return { onHand: current.onHand, sellable: Math.min(current.onHand, requested) };
}
