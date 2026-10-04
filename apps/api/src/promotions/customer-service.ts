import type { Pool } from 'pg';
import { quoteReservation } from '../checkout/reservation-quote.js';
import type { ShipmentLine } from '../checkout/shipment-quote.js';
import { applyPromotionQuote, type AppliedPromotionQuote } from './quote.js';
import { PromotionRepository, type CouponSelector } from './repository.js';
import type { PromotionRule } from './rules.js';

type SelectionInput = { goodsCoupon?: CouponSelector; shippingCoupons?:
  ({ shipmentKey: string } & CouponSelector)[] };
type CampaignState = { status: string; totalUseLimit: number; perAccountUseLimit: number;
  totalUses: number; accountUses: number };

function validSelector(value: unknown): value is CouponSelector {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (typeof data.grantId === 'string' && data.grantId.length > 0 && data.code === undefined) ||
    (typeof data.code === 'string' && data.code.trim().length > 0 && data.grantId === undefined);
}

function parseSelection(value: unknown): SelectionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid promotion selection');
  const data = value as Record<string, unknown>;
  if (data.goodsCoupon !== undefined && !validSelector(data.goodsCoupon))
    throw new Error('Invalid promotion selection');
  if (data.shippingCoupons !== undefined && (!Array.isArray(data.shippingCoupons) ||
      data.shippingCoupons.length > 100 || data.shippingCoupons.some((item: unknown) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return true;
        const part = item as Record<string, unknown>;
        return typeof part.shipmentKey !== 'string' || !part.shipmentKey.trim() || !validSelector(part);
      }))) throw new Error('Invalid promotion selection');
  return { goodsCoupon: data.goodsCoupon as CouponSelector | undefined,
    shippingCoupons: data.shippingCoupons as SelectionInput['shippingCoupons'] };
}

function eligibleGoods(lines: readonly ShipmentLine[], rule: PromotionRule): number {
  const targets = new Set(rule.targetIds);
  return lines.reduce((sum, line) => sum + ((rule.scope === 'all' ||
    (rule.scope === 'sellers' && targets.has(line.sellerId)) ||
    (rule.scope === 'options' && targets.has(line.optionId)))
    ? line.quantity * line.unitPriceWon : 0), 0);
}

export class CustomerPromotionService {
  private readonly repository: PromotionRepository;
  constructor(private readonly pool: Pool) { this.repository = new PromotionRepository(pool); }

  private async campaignState(campaignId: string, accountId: string): Promise<CampaignState> {
    const result = await this.pool.query<CampaignState>(`SELECT c.status,
      c.total_use_limit AS "totalUseLimit", c.per_account_use_limit AS "perAccountUseLimit",
      (SELECT count(*)::int FROM promotion_uses u WHERE u.campaign_id=c.id
        AND u.status IN ('HELD','USED')) AS "totalUses",
      (SELECT count(*)::int FROM promotion_uses u WHERE u.campaign_id=c.id
        AND u.account_id=$2 AND u.status IN ('HELD','USED')) AS "accountUses"
      FROM promotion_campaigns c WHERE c.id=$1`, [campaignId, accountId]);
    if (!result.rows[0]) throw new Error('Promotion unavailable');
    return result.rows[0];
  }

  private async currentRule(accountId: string, selector: CouponSelector, kind: PromotionRule['kind']) {
    const selected = await this.repository.resolveSelection(accountId, selector);
    if (!selected) throw new Error('Promotion unavailable');
    const version = await this.repository.getVersionById(selected.versionId);
    if (!version || version.rule.kind !== kind) throw new Error('Promotion unavailable');
    const state = await this.campaignState(selected.campaignId, accountId);
    const now = new Date();
    if (state.status !== 'active' || version.rule.startAt > now || version.rule.endAt <= now ||
      state.totalUses >= state.totalUseLimit || state.accountUses >= state.perAccountUseLimit)
      throw new Error('Promotion conflict');
    return { ...selected, rule: version.rule, state };
  }

  async list(accountId: string) {
    const grants = await this.repository.listCustomerGrants(accountId);
    const available = [];
    for (const grant of grants) {
      const version = await this.repository.getVersionById(grant.versionId);
      if (!version) continue;
      const state = await this.campaignState(version.campaignId, accountId);
      const now = new Date();
      if (state.status !== 'active' || version.rule.startAt > now || version.rule.endAt <= now ||
        state.totalUses >= state.totalUseLimit || state.accountUses >= state.perAccountUseLimit) continue;
      const title = await this.pool.query<{ title: string }>(
        'SELECT title FROM promotion_campaigns WHERE id=$1', [version.campaignId]);
      available.push({ grantId: grant.id, campaignId: version.campaignId,
        title: title.rows[0]?.title ?? '', rule: version.rule });
    }
    return available;
  }

  async quote(accountId: string, reservationId: string, input: unknown): Promise<AppliedPromotionQuote &
    { zeroSupportShipmentKeys: string[]; message?: string }> {
    const selection = parseSelection(input);
    const base = await quoteReservation(this.pool, accountId, reservationId);
    const lines = base.shipments.flatMap((shipment) => shipment.lines);
    const goods = selection.goodsCoupon ? await this.currentRule(accountId, selection.goodsCoupon,
      'goods_discount') : undefined;
    if (goods && (eligibleGoods(lines, goods.rule) === 0 ||
      eligibleGoods(lines, goods.rule) < goods.rule.minimumEligibleGoodsWon))
      throw new Error('Promotion conflict');
    const supports = [];
    const selectedSupports = [];
    const seenShipmentKeys = new Set<string>();
    for (const chosen of selection.shippingCoupons ?? []) {
      const selected = await this.currentRule(accountId, chosen, 'shipping_support');
      if (seenShipmentKeys.has(chosen.shipmentKey)) throw new Error('Invalid promotion selection');
      seenShipmentKeys.add(chosen.shipmentKey);
      const shipment = base.shipments.find((part) => part.key === chosen.shipmentKey);
      if (!shipment || eligibleGoods(shipment.lines, selected.rule) === 0 ||
          eligibleGoods(shipment.lines, selected.rule) < selected.rule.minimumEligibleGoodsWon)
        throw new Error('Promotion conflict');
      supports.push({ shipmentKey: chosen.shipmentKey, rule: selected.rule });
      selectedSupports.push({ ...selected, shipmentKey: chosen.shipmentKey });
    }
    const applied = applyPromotionQuote(base, lines, goods?.rule, supports);
    const requestedByCampaign = new Map<string, { needed: number; state: CampaignState }>();
    for (const selected of [...(goods && applied.discountWon > 0 ? [goods] : []),
      ...selectedSupports.filter((item) =>
        (applied.shipments.find((part) => part.key === item.shipmentKey)?.supportWon ?? 0) > 0)]) {
      const current = requestedByCampaign.get(selected.campaignId) ?? { needed: 0, state: selected.state };
      current.needed += 1;
      requestedByCampaign.set(selected.campaignId, current);
    }
    if ([...requestedByCampaign.values()].some(({ needed, state }) =>
      state.totalUses + needed > state.totalUseLimit ||
      state.accountUses + needed > state.perAccountUseLimit)) throw new Error('Promotion conflict');
    const zeroSupportShipmentKeys = supports.filter((item) =>
      applied.shipments.find((part) => part.key === item.shipmentKey)?.supportWon === 0)
      .map((item) => item.shipmentKey);
    return { ...applied, zeroSupportShipmentKeys,
      ...(zeroSupportShipmentKeys.length ?
        { message: '무료배송 상품에는 배송비 지원이 적용되지 않습니다' } : {}) };
  }
}
