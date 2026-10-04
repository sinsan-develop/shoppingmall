import type { Pool, QueryResultRow } from 'pg';
import { validatePromotionRule, type PromotionRule } from './rules.js';

export type CouponSelector = { grantId: string; code?: never } | { code: string; grantId?: never };
export type PromotionVersion = { id: string; campaignId: string; rule: PromotionRule };
export type PromotionGrant = {
  id: string; accountId: string; versionId: string; source: 'direct' | 'code';
};
export type ResolvedPromotion = {
  campaignId: string; versionId: string; grantId: string | null; source: 'direct' | 'code';
};

type VersionRow = QueryResultRow & {
  id: string; campaignId: string; kind: PromotionRule['kind']; scope: PromotionRule['scope'];
  targetIds: string[]; startAt: Date; endAt: Date; minimumEligibleGoodsWon: number;
  amountKind: PromotionRule['amountKind']; amountValue: number; maxDiscountWon: number | null;
};
type SelectionRow = QueryResultRow & { campaignId: string; versionId: string; grantId: string | null };
type GrantRow = QueryResultRow & PromotionGrant;

/** Reads only. A public code never creates a grant until the usage transaction holds it. */
export class PromotionRepository {
  constructor(private readonly pool: Pool) {}

  async getVersionById(versionId: string): Promise<PromotionVersion | null> {
    const result = await this.pool.query<VersionRow>(`SELECT v.id, v.campaign_id AS "campaignId",
      c.kind, v.scope, v.target_ids AS "targetIds", v.starts_at AS "startAt", v.ends_at AS "endAt",
      v.minimum_eligible_goods_won AS "minimumEligibleGoodsWon", v.amount_kind AS "amountKind",
      v.amount_value AS "amountValue", v.max_discount_won AS "maxDiscountWon"
      FROM promotion_versions v JOIN promotion_campaigns c ON c.id=v.campaign_id WHERE v.id=$1`, [versionId]);
    const row = result.rows[0];
    if (!row) return null;
    return { id: row.id, campaignId: row.campaignId, rule: validatePromotionRule(row) };
  }

  async resolveSelection(accountId: string, selector: CouponSelector): Promise<ResolvedPromotion | null> {
    if (!selector || (typeof selector.grantId === 'string') === (typeof selector.code === 'string'))
      throw new Error('Invalid coupon selector');
    if (typeof selector.grantId === 'string') {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selector.grantId))
        return null;
      const result = await this.pool.query<SelectionRow>(`SELECT v.campaign_id AS "campaignId",
        g.version_id AS "versionId", g.id AS "grantId"
        FROM promotion_grants g JOIN promotion_versions v ON v.id=g.version_id
        JOIN promotion_campaigns c ON c.id=v.campaign_id
        WHERE g.id=$1 AND g.account_id=$2 AND g.source='direct'`,
      [selector.grantId, accountId]);
      const row = result.rows[0];
      return row ? { ...row, source: 'direct' } : null;
    }
    const code = selector.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{4,40}$/.test(code)) return null;
    const result = await this.pool.query<SelectionRow>(`SELECT v.campaign_id AS "campaignId",
      c.version_id AS "versionId", NULL::uuid AS "grantId"
      FROM promotion_codes c JOIN promotion_versions v ON v.id=c.version_id
      JOIN promotion_campaigns p ON p.id=v.campaign_id
      WHERE c.code=$1`, [code]);
    const row = result.rows[0];
    return row ? { ...row, source: 'code' } : null;
  }

  async listCustomerGrants(accountId: string): Promise<PromotionGrant[]> {
    const result = await this.pool.query<GrantRow>(`SELECT g.id, g.account_id AS "accountId",
      g.version_id AS "versionId", g.source
      FROM promotion_grants g JOIN promotion_versions v ON v.id=g.version_id
      JOIN promotion_campaigns c ON c.id=v.campaign_id
      WHERE g.account_id=$1 AND g.source='direct' AND c.status='active'
      ORDER BY g.created_at, g.id`, [accountId]);
    return result.rows.map(({ id, accountId: ownerId, versionId, source }) =>
      ({ id, accountId: ownerId, versionId, source }));
  }
}
