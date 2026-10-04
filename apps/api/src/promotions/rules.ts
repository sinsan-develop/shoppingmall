export type PromotionRule = {
  kind: 'goods_discount' | 'shipping_support';
  scope: 'all' | 'sellers' | 'options';
  targetIds: string[];
  startAt: Date;
  endAt: Date;
  minimumEligibleGoodsWon: number;
  amountKind: 'fixed' | 'percent';
  amountValue: number;
  maxDiscountWon: number | null;
};

const money = (value: unknown, allowZero = false): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && (allowZero ? value >= 0 : value > 0);

/** Arithmetic contract only. Public API boundaries validate UUID target IDs. */
export function validatePromotionRule(input: unknown): PromotionRule {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid promotion rule');
  const rule = input as Record<string, unknown>;
  if (!['goods_discount', 'shipping_support'].includes(rule.kind as string) ||
      !['all', 'sellers', 'options'].includes(rule.scope as string) ||
      !Array.isArray(rule.targetIds) ||
      rule.targetIds.some((id: unknown) => typeof id !== 'string' || !id.trim()) ||
      (rule.scope === 'all' ? rule.targetIds.length !== 0 : rule.targetIds.length === 0) ||
      new Set(rule.targetIds).size !== rule.targetIds.length ||
      !(rule.startAt instanceof Date) || !Number.isFinite(rule.startAt.getTime()) ||
      !(rule.endAt instanceof Date) || !Number.isFinite(rule.endAt.getTime()) ||
      rule.startAt >= rule.endAt || !money(rule.minimumEligibleGoodsWon, true) ||
      !['fixed', 'percent'].includes(rule.amountKind as string) || !money(rule.amountValue) ||
      (rule.maxDiscountWon !== null && !money(rule.maxDiscountWon)) ||
      (rule.amountKind === 'percent' &&
        (rule.kind !== 'goods_discount' || rule.amountValue > 10000 || rule.maxDiscountWon === null))) {
    throw new Error('Invalid promotion rule');
  }
  return { kind: rule.kind as PromotionRule['kind'], scope: rule.scope as PromotionRule['scope'],
    targetIds: [...rule.targetIds] as string[], startAt: new Date(rule.startAt.getTime()),
    endAt: new Date(rule.endAt.getTime()), minimumEligibleGoodsWon: rule.minimumEligibleGoodsWon as number,
    amountKind: rule.amountKind as PromotionRule['amountKind'], amountValue: rule.amountValue as number,
    maxDiscountWon: rule.maxDiscountWon as number | null };
}
