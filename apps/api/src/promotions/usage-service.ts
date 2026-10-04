import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { quoteReservationInTransaction } from '../checkout/reservation-quote.js';
import type { ShipmentLine } from '../checkout/shipment-quote.js';
import { applyPromotionQuote, type AppliedPromotionQuote } from './quote.js';
import type { CouponSelector } from './repository.js';
import { validatePromotionRule, type PromotionRule } from './rules.js';

export type PromotionSelection = { goodsCoupon?: CouponSelector;
  shippingCoupons?: { shipmentKey: string; selector: CouponSelector }[] };
export type PromotionUseView = { id: string; campaignId: string; versionId: string;
  reservationId: string; shipmentKey: string | null; status: 'HELD' | 'USED' | 'RELEASED' };
export type HeldOrderQuote = { uses: PromotionUseView[]; quote: AppliedPromotionQuote;
  goodsRule?: PromotionRule };

type Resolved = { campaignId: string; versionId: string; grantId: string | null;
  source: 'direct' | 'code'; rule: PromotionRule; shipmentKey: string | null };
type CampaignRow = QueryResultRow & { id: string; status: string;
  totalUseLimit: number; perAccountUseLimit: number };
type UseRow = QueryResultRow & PromotionUseView & { accountId: string; grantId: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validSelector(input: unknown): input is CouponSelector {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const data = input as Record<string, unknown>;
  return (typeof data.grantId === 'string' && uuid.test(data.grantId) && data.code === undefined) ||
    (typeof data.code === 'string' && /^[A-Z0-9_-]{4,40}$/.test(data.code.trim().toUpperCase()) &&
      data.grantId === undefined);
}

function parseSelections(input: unknown): { selector: CouponSelector; shipmentKey: string | null;
  kind: PromotionRule['kind'] }[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid promotion selection');
  const selections = input as PromotionSelection;
  if (selections.goodsCoupon !== undefined && !validSelector(selections.goodsCoupon))
    throw new Error('Invalid promotion selection');
  if (selections.shippingCoupons !== undefined && (!Array.isArray(selections.shippingCoupons) ||
      selections.shippingCoupons.length > 100 || selections.shippingCoupons.some((part) =>
        !part || typeof part.shipmentKey !== 'string' || !part.shipmentKey.trim() ||
        !validSelector(part.selector)))) throw new Error('Invalid promotion selection');
  const keys = selections.shippingCoupons?.map((part) => part.shipmentKey) ?? [];
  if (new Set(keys).size !== keys.length) throw new Error('Invalid promotion selection');
  return [...(selections.goodsCoupon ? [{ selector: selections.goodsCoupon,
    shipmentKey: null, kind: 'goods_discount' as const }] : []),
  ...(selections.shippingCoupons ?? []).map((part) => ({ selector: part.selector,
    shipmentKey: part.shipmentKey, kind: 'shipping_support' as const }))];
}

function eligibleWon(lines: readonly ShipmentLine[], rule: PromotionRule): number {
  const targets = new Set(rule.targetIds);
  return lines.reduce((sum, line) => sum + ((rule.scope === 'all' ||
    (rule.scope === 'sellers' && targets.has(line.sellerId)) ||
    (rule.scope === 'options' && targets.has(line.optionId)))
    ? line.quantity * line.unitPriceWon : 0), 0);
}

async function audit(client: PoolClient, accountId: string, useId: string,
  action: string, details: Record<string, unknown> = {}) {
  await client.query(`INSERT INTO audit_events
    (actor_account_id,active_role,action,target_type,target_id,details)
    VALUES ($1,'customer',$2,'promotion_use',$3,$4::jsonb)`,
  [accountId, action, useId, JSON.stringify(details)]);
}

/** Internal checkout service only. The caller owns BEGIN/COMMIT and its immutable order snapshot. */
export class PromotionUsageService {
  constructor(private readonly pool: Pool) {}

  private async resolve(client: PoolClient, accountId: string, selector: CouponSelector,
    kind: PromotionRule['kind'], shipmentKey: string | null): Promise<Resolved> {
    const selection = 'grantId' in selector && selector.grantId
      ? await client.query<{ campaignId: string; versionId: string; grantId: string }>(
        `SELECT v.campaign_id AS "campaignId",g.version_id AS "versionId",g.id AS "grantId"
         FROM promotion_grants g JOIN promotion_versions v ON v.id=g.version_id
         WHERE g.id=$1 AND g.account_id=$2 AND g.source='direct'`, [selector.grantId, accountId])
      : await client.query<{ campaignId: string; versionId: string; grantId: string | null }>(
        `SELECT v.campaign_id AS "campaignId",c.version_id AS "versionId",NULL::uuid AS "grantId"
         FROM promotion_codes c JOIN promotion_versions v ON v.id=c.version_id WHERE c.code=$1`,
        [selector.code?.trim().toUpperCase()]);
    const row = selection.rows[0];
    if (!row) throw new Error('Promotion unavailable');
    const version = await client.query<{ kind: PromotionRule['kind']; scope: PromotionRule['scope'];
      targetIds: string[]; startAt: Date; endAt: Date; minimumEligibleGoodsWon: number;
      amountKind: PromotionRule['amountKind']; amountValue: number; maxDiscountWon: number | null }>(
        `SELECT c.kind,v.scope,v.target_ids AS "targetIds",v.starts_at AS "startAt",
          v.ends_at AS "endAt",v.minimum_eligible_goods_won AS "minimumEligibleGoodsWon",
          v.amount_kind AS "amountKind",v.amount_value AS "amountValue",
          v.max_discount_won AS "maxDiscountWon"
         FROM promotion_versions v JOIN promotion_campaigns c ON c.id=v.campaign_id WHERE v.id=$1`,
        [row.versionId]);
    if (!version.rows[0] || version.rows[0].kind !== kind) throw new Error('Promotion unavailable');
    return { campaignId: row.campaignId, versionId: row.versionId, grantId: row.grantId,
      source: row.grantId ? 'direct' : 'code', rule: validatePromotionRule(version.rows[0]), shipmentKey };
  }

  async holdInTransaction(client: PoolClient, accountId: string, reservationId: string,
    selections: PromotionSelection, idempotencyKey: string, expiresAt: Date): Promise<PromotionUseView[]> {
    if (![accountId, reservationId, idempotencyKey].every((id) => uuid.test(id)) ||
        !(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime()))
      throw new Error('Invalid promotion selection');
    const requested = parseSelections(selections);
    const account = await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [accountId]);
    if (!account.rowCount) throw new Error('Promotion unavailable');
    const reservation = await client.query<{ status: string; expiresAt: Date }>(
      `SELECT status,expires_at AS "expiresAt" FROM checkout_reservations
       WHERE id=$1 AND account_id=$2 FOR UPDATE`, [reservationId, accountId]);
    const own = reservation.rows[0];
    if (!own || own.status !== 'ACTIVE' || own.expiresAt <= new Date() ||
        expiresAt > own.expiresAt || expiresAt <= new Date()) throw new Error('Reservation unavailable');
    const resolved = await Promise.all(requested.map(async (item) => this.resolve(client, accountId,
      item.selector, item.kind, item.shipmentKey)));
    const existing = await client.query<UseRow>(`SELECT id,account_id AS "accountId",
      campaign_id AS "campaignId",version_id AS "versionId",grant_id AS "grantId",
      reservation_id AS "reservationId",shipment_key AS "shipmentKey",status
      FROM promotion_uses WHERE account_id=$1 AND idempotency_key=$2 ORDER BY campaign_id,shipment_key`,
    [accountId, idempotencyKey]);
    if (existing.rows.length) {
      if (existing.rows.some((row) => row.reservationId !== reservationId) ||
          existing.rows.length !== resolved.length || resolved.some((selected) => !existing.rows.some((row) =>
            row.campaignId === selected.campaignId && row.versionId === selected.versionId &&
            row.shipmentKey === selected.shipmentKey))) throw new Error('Promotion conflict');
      return existing.rows.map(({ id, campaignId, versionId, reservationId: heldId, shipmentKey, status }) =>
        ({ id, campaignId, versionId, reservationId: heldId, shipmentKey, status }));
    }
    if (!resolved.length) return [];
    const campaigns = new Map<string, CampaignRow>();
    for (const campaignId of [...new Set(resolved.map((part) => part.campaignId))].sort()) {
      const result = await client.query<CampaignRow>(`SELECT id,status,total_use_limit AS "totalUseLimit",
        per_account_use_limit AS "perAccountUseLimit" FROM promotion_campaigns WHERE id=$1 FOR UPDATE`,
      [campaignId]);
      if (!result.rows[0]) throw new Error('Promotion unavailable');
      campaigns.set(campaignId, result.rows[0]);
    }
    const now = new Date();
    if (resolved.some((part) => campaigns.get(part.campaignId)?.status !== 'active' ||
      part.rule.startAt > now || part.rule.endAt <= now)) throw new Error('Promotion conflict');
    const base = await quoteReservationInTransaction(this.pool, client, accountId, reservationId);
    const lines = base.shipments.flatMap((part) => part.lines);
    const goods = resolved.find((part) => part.rule.kind === 'goods_discount');
    if (goods && (eligibleWon(lines, goods.rule) === 0 ||
      eligibleWon(lines, goods.rule) < goods.rule.minimumEligibleGoodsWon)) throw new Error('Promotion conflict');
    for (const selected of resolved.filter((part) => part.shipmentKey)) {
      const shipment = base.shipments.find((part) => part.key === selected.shipmentKey);
      if (!shipment || eligibleWon(shipment.lines, selected.rule) === 0 ||
          eligibleWon(shipment.lines, selected.rule) < selected.rule.minimumEligibleGoodsWon)
        throw new Error('Promotion conflict');
    }
    const applied = applyPromotionQuote(base, lines, goods?.rule,
      resolved.filter((part) => part.shipmentKey).map((part) =>
        ({ shipmentKey: part.shipmentKey!, rule: part.rule })));
    if (goods && applied.discountWon === 0) throw new Error('Promotion conflict');
    const chargeable = resolved.filter((part) => part.shipmentKey === null ||
      (applied.shipments.find((shipment) => shipment.key === part.shipmentKey)?.supportWon ?? 0) > 0);
    for (const campaignId of campaigns.keys()) {
      const needed = chargeable.filter((part) => part.campaignId === campaignId).length;
      if (!needed) continue;
      const used = await client.query<{ total: number; account: number }>(
        `SELECT count(*)::int AS total,
          count(*) FILTER (WHERE account_id=$2)::int AS account
         FROM promotion_uses WHERE campaign_id=$1 AND status IN ('HELD','USED')`,
      [campaignId, accountId]);
      const limit = campaigns.get(campaignId)!;
      if (used.rows[0].total + needed > limit.totalUseLimit ||
          used.rows[0].account + needed > limit.perAccountUseLimit)
        throw new Error('Promotion conflict');
    }
    const held: PromotionUseView[] = [];
    for (const item of chargeable) {
      let grantId = item.grantId;
      if (!grantId) {
        const grant = await client.query<{ id: string }>(`INSERT INTO promotion_grants
          (account_id,version_id,source) VALUES ($1,$2,'code')
          ON CONFLICT (account_id,version_id,source) DO UPDATE SET account_id=EXCLUDED.account_id
          RETURNING id`, [accountId, item.versionId]);
        grantId = grant.rows[0].id;
      }
      const result = await client.query<{ id: string }>(`INSERT INTO promotion_uses
        (account_id,campaign_id,version_id,grant_id,reservation_id,shipment_key,
          status,idempotency_key,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,'HELD',$7,$8) RETURNING id`,
      [accountId, item.campaignId, item.versionId, grantId, reservationId,
        item.shipmentKey, idempotencyKey, expiresAt]);
      const id = result.rows[0].id;
      held.push({ id, campaignId: item.campaignId, versionId: item.versionId,
        reservationId, shipmentKey: item.shipmentKey, status: 'HELD' });
      await audit(client, accountId, id, 'promotion_use_held',
        { campaignId: item.campaignId, reservationId, shipmentKey: item.shipmentKey,
          versionId: item.versionId, source: item.source });
    }
    return held;
  }

  /** Reuse the exact held campaign versions for the pending order snapshot in this transaction. */
  async holdForOrderInTransaction(client: PoolClient, accountId: string, reservationId: string,
    selections: PromotionSelection, idempotencyKey: string, expiresAt: Date): Promise<HeldOrderQuote> {
    const uses = await this.holdInTransaction(client, accountId, reservationId,
      selections, idempotencyKey, expiresAt);
    const base = await quoteReservationInTransaction(this.pool, client, accountId, reservationId);
    const rules: { id: string; shipmentKey: string | null; rule: PromotionRule }[] = [];
    for (const use of uses) {
      const found = await client.query<{ id: string; shipmentKey: string | null;
        kind: PromotionRule['kind']; scope: PromotionRule['scope']; targetIds: string[];
        startAt: Date; endAt: Date; minimumEligibleGoodsWon: number;
        amountKind: PromotionRule['amountKind']; amountValue: number; maxDiscountWon: number | null }>(
        `SELECT u.id,u.shipment_key AS "shipmentKey",c.kind,v.scope,v.target_ids AS "targetIds",
          v.starts_at AS "startAt",v.ends_at AS "endAt",
          v.minimum_eligible_goods_won AS "minimumEligibleGoodsWon",
          v.amount_kind AS "amountKind",v.amount_value AS "amountValue",
          v.max_discount_won AS "maxDiscountWon"
         FROM promotion_uses u JOIN promotion_versions v ON v.id=u.version_id
         JOIN promotion_campaigns c ON c.id=u.campaign_id
         WHERE u.id=$1 AND u.account_id=$2 AND u.reservation_id=$3 AND u.status='HELD'`,
      [use.id, accountId, reservationId]);
      if (!found.rows[0]) throw new Error('Promotion conflict');
      rules.push({ id: use.id, shipmentKey: use.shipmentKey,
        rule: validatePromotionRule(found.rows[0]) });
    }
    const goods = rules.find((item) => item.shipmentKey === null);
    const quote = applyPromotionQuote(base, base.shipments.flatMap((part) => part.lines),
      goods?.rule, rules.filter((item) => item.shipmentKey !== null).map((item) =>
        ({ shipmentKey: item.shipmentKey!, rule: item.rule })));
    return { uses, quote, goodsRule: goods?.rule };
  }

  async markPaidInTransaction(client: PoolClient, useIds: string[]): Promise<void> {
    if (!Array.isArray(useIds) || useIds.some((id) => !uuid.test(id)) ||
        new Set(useIds).size !== useIds.length) throw new Error('Invalid promotion use');
    for (const id of [...useIds].sort()) {
      const found = await client.query<UseRow>(
        'SELECT id,account_id AS "accountId",status FROM promotion_uses WHERE id=$1 FOR UPDATE', [id]);
      const row = found.rows[0];
      if (!row || row.status === 'RELEASED') throw new Error('Promotion conflict');
      if (row.status === 'USED') continue;
      await client.query("UPDATE promotion_uses SET status='USED',used_at=clock_timestamp() WHERE id=$1", [id]);
      await audit(client, row.accountId, id, 'promotion_use_paid', { source: 'internal_payment' });
    }
  }

  async releaseInTransaction(client: PoolClient, useIds: string[], reason: string): Promise<void> {
    if (!Array.isArray(useIds) || useIds.some((id) => !uuid.test(id)) ||
        new Set(useIds).size !== useIds.length || typeof reason !== 'string' ||
        !reason.trim() || reason.trim().length > 500) throw new Error('Invalid promotion use');
    for (const id of [...useIds].sort()) {
      const found = await client.query<UseRow>(
        'SELECT id,account_id AS "accountId",status FROM promotion_uses WHERE id=$1 FOR UPDATE', [id]);
      const row = found.rows[0];
      if (!row || row.status === 'USED') throw new Error('Promotion conflict');
      if (row.status === 'RELEASED') continue;
      await client.query(`UPDATE promotion_uses SET status='RELEASED',released_at=clock_timestamp(),
        release_reason=$2 WHERE id=$1`, [id, reason.trim()]);
      await audit(client, row.accountId, id, 'promotion_use_released', { reason: reason.trim() });
    }
  }

  /** Never sweeps an active or consumed reservation: S4 must decide pending-payment outcomes. */
  async releaseDue(limit: number): Promise<number> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid promotion use');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const due = await client.query<{ id: string }>(`SELECT u.id FROM promotion_uses u
        JOIN checkout_reservations r ON r.id=u.reservation_id
        WHERE u.status='HELD' AND r.status IN ('EXPIRED','RELEASED','CANCELLED')
        ORDER BY u.expires_at,u.id LIMIT $1 FOR UPDATE OF u SKIP LOCKED`, [limit]);
      await this.releaseInTransaction(client, due.rows.map((row) => row.id), 'Reservation ended');
      await client.query('COMMIT');
      return due.rows.length;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
